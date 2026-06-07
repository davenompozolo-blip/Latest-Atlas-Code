// Edge Function: sync_funddata_prices
//
// Daily snapshot of SA mutual fund data from ProfileData FundsData ASISA
// LatestPrices.aspx → fund_prices_raw.
//
// The LatestPrices.aspx page provides fund cost registry data (TER/TC/TIC)
// for ~5600 SA funds. NAV prices are not available on this page (nav = null).
// Column order (image-header table, cols 0-9):
//   0: FundName  1: Add Fee  2: Target Market  3: Max Init Fee
//   4: TIC Date  5: TER Perf Comp  6: TER  7: TC  8: TIC  9: PriceDate (DD/MM/YY)
//
// Request body (all optional):
//   { source?, dry_run?: boolean, debug?: boolean, raw_debug?: boolean }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const PROVIDER_URL     = 'https://funds.profiledata.co.za/aci/ASISA/LatestPrices.aspx'
const CACHE_HOURS      = 20
const BATCH_SIZE       = 200
const FETCH_TIMEOUT_MS = 25_000

// ── Supabase helpers ─────────────────────────────────────────────────────────

function sbHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }
}
async function sbGet(base: string, key: string, path: string) {
  const r = await fetch(base + path, { headers: { apikey: key, Authorization: 'Bearer ' + key } })
  if (!r.ok) throw new Error('Supabase GET ' + path + ' -> ' + r.status)
  return r.json() as Promise<unknown[]>
}
async function sbPost(base: string, key: string, path: string, body: unknown) {
  const r = await fetch(base + path, { method: 'POST', headers: sbHeaders(key), body: JSON.stringify(body) })
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Supabase POST ' + path + ' -> ' + r.status + ' ' + t.slice(0, 300)) }
}
async function sbInsert(base: string, key: string, table: string, row: Record<string, unknown>) {
  const r = await fetch(base + '/rest/v1/' + table, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(row) })
  if (!r.ok) throw new Error('sync_log insert -> ' + r.status)
  const rows = await r.json() as { id: number }[]
  return rows[0]?.id as number | undefined
}
async function sbPatch(base: string, key: string, table: string, id: number, patch: Record<string, unknown>) {
  const r = await fetch(base + '/rest/v1/' + table + '?id=eq.' + id, { method: 'PATCH', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
  if (!r.ok) { const t = await r.text().catch(() => ''); console.warn('sync_log patch failed', r.status, t.slice(0, 100)) }
}

// ── HTML parser ──────────────────────────────────────────────────────────────

interface ParsedRow { [col: string]: string | null }

function extractTableRows(tableHtml: string): string[][] {
  const rowRe  = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
  const tagRe  = /<[^>]+>/g
  const clean  = (s: string) => s.replace(tagRe, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\r?\n/g, ' ').trim()
  const rows: string[][] = []
  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(tableHtml)) !== null) {
    const cells: string[] = []
    let cm: RegExpExecArray | null
    cellRe.lastIndex = 0
    while ((cm = cellRe.exec(rm[1])) !== null) cells.push(clean(cm[1]))
    if (cells.length) rows.push(cells)
  }
  return rows
}

function rowsToObjects(rows: string[][]): { headers: string[]; data: ParsedRow[] } {
  if (rows.length < 2) return { headers: [], data: [] }
  const headers = rows[0].map((h, i) => {
    const clean = h.toLowerCase().replace(/\s+/g, '_').slice(0, 60)
    return clean || ('col_' + i)
  })
  const data = rows.slice(1).map(cells => {
    const obj: ParsedRow = {}
    headers.forEach((h, i) => { obj[h] = cells[i] ?? null })
    return obj
  })
  return { headers, data }
}

// Pick the largest table (most data rows) — for this provider it's always the fund table
function parseLargestTable(html: string): ParsedRow[] {
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi
  let best: ParsedRow[] = []
  let tm: RegExpExecArray | null
  while ((tm = tableRe.exec(html)) !== null) {
    const raw = extractTableRows(tm[0])
    if (raw.length < 2) continue
    const { data } = rowsToObjects(raw)
    if (data.length > best.length) best = data
  }
  return best
}

function htmlDebugInfo(html: string, includeRaw: boolean): object {
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi
  const tables: Array<Record<string, unknown>> = []
  let tm: RegExpExecArray | null
  while ((tm = tableRe.exec(html)) !== null) {
    const raw = extractTableRows(tm[0])
    if (!raw.length) continue
    const { headers, data } = rowsToObjects(raw)
    const entry: Record<string, unknown> = { rowCount: data.length, headers: headers.slice(0, 12) }
    if (includeRaw) {
      entry.rawHeaderRow = raw[0]?.slice(0, 12)
      entry.rawDataRows  = raw.slice(1, 4).map(r => r.slice(0, 12))
    } else {
      entry.sampleRows = data.slice(0, 3)
    }
    tables.push(entry)
  }
  tables.sort((a, b) => (b['rowCount'] as number) - (a['rowCount'] as number))
  return { html_length: html.length, tables_found: tables.length, tables, first_500_chars: html.slice(0, 500).replace(/\s+/g, ' ') }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(s: string | null | undefined): number | null {
  if (!s || s.trim() === 'n/a' || s.trim() === '-') return null
  const n = parseFloat(s.replace(/[,%\s]/g, ''))
  return isNaN(n) ? null : n
}

// Parse DD/MM/YY → YYYY-MM-DD  (SA date format, 2000-based for YY < 100)
function parseDDMMYY(s: string | null | undefined, fallback: string): string {
  if (!s) return fallback
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return fallback
  const d = m[1].padStart(2, '0')
  const mo = m[2].padStart(2, '0')
  const yr = m[3].length === 2 ? '20' + m[3] : m[3]
  return `${yr}-${mo}-${d}`
}

async function cacheIsFresh(base: string, key: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - CACHE_HOURS * 3_600_000).toISOString()
  const rows = await sbGet(base, key, `/rest/v1/fund_prices_raw?select=created_at&source=eq.funddata_public&created_at=gte.${cutoff}&limit=1`)
  return Array.isArray(rows) && rows.length > 0
}

interface RawRow {
  source:         string
  fund_code:      string
  manager:        string | null
  fund_name:      string | null
  asisa_category: string | null
  price_date:     string
  nav:            number | null
  ter:            number | null
  tc:             number | null
  tic:            number | null
}

// ── Column mapping ────────────────────────────────────────────────────────────
// ProfileData LatestPrices.aspx 10-column layout (image headers → col_N keys):
//   col_0 FundName | col_1 Add Fee | col_2 Target Market | col_3 Max Init Fee
//   col_4 TIC Date | col_5 TER Perf Comp | col_6 TER | col_7 TC | col_8 TIC
//   col_9 PriceDate (DD/MM/YY)
// Category group rows have only 1 cell — filtered out by requiring col_0 + col_9.

function mapRow(r: ParsedRow, today: string): RawRow | null {
  // Named headers path (future-proof)
  let fundCode  = r['fund_code'] ?? r['code'] ?? r['isin'] ?? null
  let fundName  = r['fund_name'] ?? r['name'] ?? r['fund'] ?? null
  let manager   = r['manager'] ?? r['management_company'] ?? r['manco'] ?? null
  let category  = r['category'] ?? r['asisa_category'] ?? r['class'] ?? null
  let terStr    = r['ter'] ?? r['total_expense_ratio'] ?? null
  let tcStr     = r['tc'] ?? r['transaction_costs'] ?? null
  let ticStr    = r['tic'] ?? r['total_investment_charge'] ?? null
  let priceDateRaw = r['price_date'] ?? r['date'] ?? null

  // Positional fallback (current provider — image headers)
  if (!fundCode && r['col_0'] && r['col_9']) {
    fundName     = r['col_0']
    fundCode     = r['col_0']           // no separate code column on this page
    manager      = null                 // not in this table
    category     = null                 // category comes from grouping rows (skipped)
    terStr       = r['col_6']
    tcStr        = r['col_7']
    ticStr       = r['col_8']
    priceDateRaw = r['col_9']
  }

  // Skip category header rows (single cell, no price date)
  if (!fundCode) return null

  const priceDate = parseDDMMYY(priceDateRaw, today)

  return {
    source:         'funddata_public',
    fund_code:      fundCode,
    manager,
    fund_name:      fundName,
    asisa_category: category,
    price_date:     priceDate,
    nav:            null,               // NAV not available on LatestPrices.aspx
    ter:            toNum(terStr),
    tc:             toNum(tcStr),
    tic:            toNum(ticStr),
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const base = Deno.env.get('SUPABASE_URL')
  const key  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!base || !key) return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  let body: { source?: string; dry_run?: boolean; debug?: boolean; raw_debug?: boolean } = {}
  try { body = await req.json() } catch { /* ok */ }
  const dryRun    = body.dry_run    === true
  const debugMode = body.debug      === true
  const rawDebug  = body.raw_debug  === true

  const startedAt = new Date().toISOString()
  let logId: number | undefined
  try {
    logId = await sbInsert(base, key, 'sync_log', { function_name: 'sync_funddata_prices', status: 'running', source: body.source ?? 'edge_function', started_at: startedAt })
  } catch (e) { console.warn('Could not open sync_log row:', e) }

  async function finishLog(status: string, pricesUpserted: number, errorMsg?: string, details?: unknown) {
    if (logId == null) return
    await sbPatch(base!, key!, 'sync_log', logId, { status, finished_at: new Date().toISOString(), prices_upserted: pricesUpserted, duration_ms: Date.now() - new Date(startedAt).getTime(), error_message: errorMsg ?? null, details: details ?? null })
  }

  try {
    if (!dryRun && !debugMode && !rawDebug && await cacheIsFresh(base, key)) {
      await finishLog('skipped_cache', 0, undefined, { reason: 'cache_fresh' })
      return new Response(JSON.stringify({ status: 'skipped', reason: 'cache_fresh' }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Fetch HTML
    console.log('Fetching', PROVIDER_URL)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let html: string
    try {
      const res = await fetch(PROVIDER_URL, { signal: controller.signal, headers: { 'User-Agent': 'ATLAS-Terminal/1.0 (personal portfolio research)', Accept: 'text/html,application/xhtml+xml' } })
      clearTimeout(timer)
      if (!res.ok) throw new Error('HTTP ' + res.status + ' from provider')
      html = await res.text()
    } catch (e) {
      clearTimeout(timer)
      const msg = e instanceof Error ? e.message : String(e)
      await finishLog('failed', 0, msg)
      return new Response(JSON.stringify({ error: msg }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    }

    // Debug modes
    if (debugMode || rawDebug) {
      const info = htmlDebugInfo(html, rawDebug)
      await finishLog('debug', 0)
      return new Response(JSON.stringify({ debug: true, ...info }), { headers: { 'Content-Type': 'application/json' } })
    }

    // Parse
    const parsed = parseLargestTable(html)
    if (!parsed.length) {
      await finishLog('failed', 0, 'No table rows parsed', { html_preview: html.slice(0, 500) })
      return new Response(JSON.stringify({ error: 'No rows parsed' }), { status: 422, headers: { 'Content-Type': 'application/json' } })
    }
    console.log('Parsed', parsed.length, 'candidate rows')

    const today = new Date().toISOString().slice(0, 10)
    const upsertRows: RawRow[] = []
    for (const r of parsed) {
      const row = mapRow(r, today)
      if (row) upsertRows.push(row)
    }

    if (!upsertRows.length) {
      await finishLog('failed', 0, 'No valid rows after mapping', { sample_row: parsed[0] })
      return new Response(JSON.stringify({ error: 'No valid rows', sample_row: parsed[0] }), { status: 422, headers: { 'Content-Type': 'application/json' } })
    }

    console.log('Valid rows:', upsertRows.length, '| dry_run:', dryRun)

    let inserted = 0
    if (!dryRun) {
      for (let i = 0; i < upsertRows.length; i += BATCH_SIZE) {
        await sbPost(base, key, '/rest/v1/fund_prices_raw', upsertRows.slice(i, i + BATCH_SIZE))
      }
      inserted = upsertRows.length
    } else {
      inserted = upsertRows.length
    }

    await finishLog('succeeded', inserted, undefined, { parsed_rows: parsed.length, valid_rows: upsertRows.length, dry_run: dryRun, price_date: today, provider_url: PROVIDER_URL })
    return new Response(JSON.stringify({ status: 'ok', parsed_rows: parsed.length, upserted: inserted, dry_run: dryRun }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await finishLog('failed', 0, msg).catch(() => {})
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
