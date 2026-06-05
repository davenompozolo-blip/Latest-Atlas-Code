// Edge Function: synthesize_thesis
//
// Fetches a company's latest 10-K from SEC EDGAR, extracts the MD&A section,
// calls Claude to generate structured bull/bear thesis points, and caches the
// result in ai_thesis_cache.
//
// Request body: { ticker: string, force?: boolean }
//
// Cache policy: skip computation if a row exists for the same ticker and a
// filing_date within the last 90 days (filings only update annually).
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
//
// EDGAR is public — no API key required, but we must set a descriptive
// User-Agent per SEC Fair Access guidelines.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const EDGAR_USER_AGENT = 'ATLAS Terminal research@atlas.app'
const ANTHROPIC_BASE   = 'https://api.anthropic.com/v1'
const CLAUDE_MODEL     = 'claude-haiku-4-5-20251001'
const MAX_EXTRACT_CHARS = 28_000   // ~7k tokens — enough MD&A context for haiku
const CACHE_TTL_DAYS   = 90

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function sbHeaders(key: string) {
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }
}

async function sbGet(base: string, key: string, path: string): Promise<unknown> {
  const r = await fetch(base + path, { headers: sbHeaders(key) })
  if (!r.ok) throw new Error('sbGet ' + path + ': ' + r.status)
  return r.json()
}

async function sbUpsert(base: string, key: string, table: string, rows: unknown[]) {
  const r = await fetch(base + '/rest/v1/' + table, {
    method: 'POST',
    headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error('sbUpsert ' + table + ': ' + r.status + ' ' + t.slice(0, 300))
  }
}

// ── SEC EDGAR helpers ─────────────────────────────────────────────────────────

interface EdgarSubmission {
  cik: string
  name?: string
  filings?: {
    recent?: {
      form: string[]
      accessionNumber: string[]
      filingDate: string[]
      primaryDocument: string[]
    }
  }
}

async function fetchEdgar<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': EDGAR_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) return null
    return await r.json() as T
  } catch {
    return null
  }
}

async function fetchEdgarText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': EDGAR_USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    })
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  }
}

// Resolve ticker → CIK using EDGAR's company ticker mapping
async function resolveCIK(ticker: string): Promise<string | null> {
  // EDGAR provides a JSON map of ticker→CIK (updated daily)
  const map = await fetchEdgar<Record<string, { cik_str: string; ticker: string; title: string }>>(
    'https://www.sec.gov/files/company_tickers.json'
  )
  if (!map) return null
  const upper = ticker.toUpperCase()
  for (const entry of Object.values(map)) {
    if (entry.ticker.toUpperCase() === upper) {
      return entry.cik_str.padStart(10, '0')
    }
  }
  return null
}

// Fetch the most recent 10-K accession info from EDGAR submissions
async function fetchLatest10K(cik: string): Promise<{ accession: string; date: string; primaryDoc: string } | null> {
  const data = await fetchEdgar<EdgarSubmission>(
    'https://data.sec.gov/submissions/CIK' + cik + '.json'
  )
  if (!data?.filings?.recent) return null

  const { form, accessionNumber, filingDate, primaryDocument } = data.filings.recent
  for (let i = 0; i < form.length; i++) {
    if (form[i] === '10-K' || form[i] === '10-K/A') {
      return {
        accession: accessionNumber[i].replace(/-/g, ''),
        date: filingDate[i],
        primaryDoc: primaryDocument[i],
      }
    }
  }
  return null
}

// Strip HTML tags and collapse whitespace
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
}

// Extract the MD&A section from a 10-K text document.
// Returns the section text (trimmed to MAX_EXTRACT_CHARS).
function extractMDA(text: string): string {
  // Look for "Management's Discussion" section header
  const MDA_RE = /(?:ITEM\s*7\.?\s*)?MANAGEMENT[''`]?S\s+DISCUSSION\s+AND\s+ANALYSIS/i
  const NEXT_SECTION_RE = /(?:ITEM\s*7A|ITEM\s*8|QUANTITATIVE\s+AND\s+QUALITATIVE|FINANCIAL\s+STATEMENTS)/i

  const mdaStart = text.search(MDA_RE)
  if (mdaStart === -1) {
    // Fallback: return first MAX_EXTRACT_CHARS of plain text
    return text.slice(0, MAX_EXTRACT_CHARS)
  }

  const afterMda = text.slice(mdaStart + 100)  // skip the heading itself
  const nextSection = afterMda.search(NEXT_SECTION_RE)
  const section = nextSection > 0 ? afterMda.slice(0, nextSection) : afterMda

  return section.slice(0, MAX_EXTRACT_CHARS)
}

// ── Claude API ────────────────────────────────────────────────────────────────

interface ThesisPoint {
  point: string
  source: string
}

interface ThesisResult {
  bull: ThesisPoint[]
  bear: ThesisPoint[]
  summary: string
}

async function callClaude(ticker: string, companyName: string, mdaText: string, apiKey: string): Promise<ThesisResult | null> {
  const system = `You are a senior equity analyst at an institutional investment firm.
Your task is to read 10-K filings and extract the key investment thesis arguments.
Always respond with valid JSON only — no markdown, no preamble, no explanation outside the JSON object.`

  const prompt = `Below is an excerpt from ${companyName} (${ticker})'s most recent 10-K filing (Management Discussion & Analysis and/or Risk Factors).

Read it carefully and extract:
1. Three (3) bull case arguments — specific positive signals, competitive strengths, growth drivers, or improving metrics that support owning this stock
2. Three (3) bear case arguments — specific risks, headwinds, deteriorating trends, or structural concerns that argue against owning it
3. A two-sentence summary of the company's current business position

For each point include a "source" field referencing the specific section or disclosure it came from (e.g. "MD&A — Revenue Outlook", "Risk Factors — Competition").

Respond ONLY with this JSON structure:
{
  "bull": [
    {"point": "...", "source": "..."},
    {"point": "...", "source": "..."},
    {"point": "...", "source": "..."}
  ],
  "bear": [
    {"point": "...", "source": "..."},
    {"point": "...", "source": "..."},
    {"point": "...", "source": "..."}
  ],
  "summary": "..."
}

---

${mdaText}`

  try {
    const r = await fetch(ANTHROPIC_BASE + '/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1200,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(45_000),
    })

    if (!r.ok) {
      const err = await r.text().catch(() => '')
      throw new Error('Claude API ' + r.status + ': ' + err.slice(0, 200))
    }

    const data = await r.json() as { content?: Array<{ type: string; text: string }> }
    const text = data?.content?.find(c => c.type === 'text')?.text ?? ''

    // Extract JSON from the response (handle any accidental markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in Claude response')
    return JSON.parse(jsonMatch[0]) as ThesisResult
  } catch (e) {
    console.error('Claude call failed:', (e as Error).message)
    return null
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sbUrl    = Deno.env.get('SUPABASE_URL') ?? ''
  const sbKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const claudeKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

  if (!sbUrl || !sbKey)  return resp({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500)
  if (!claudeKey)        return resp({ error: 'Missing ANTHROPIC_API_KEY' }, 500)

  const body = await req.json().catch(() => ({})) as { ticker?: string; force?: boolean }
  const ticker = (body.ticker ?? '').trim().toUpperCase()
  if (!ticker || !/^[A-Z0-9.\-]{1,14}$/.test(ticker)) return resp({ error: 'Invalid ticker' }, 400)

  // ── Cache check ──────────────────────────────────────────────────────────
  if (!body.force) {
    try {
      const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 86_400_000).toISOString().slice(0, 10)
      const rows = await sbGet(sbUrl, sbKey,
        `/rest/v1/ai_thesis_cache?select=ticker,filing_date,bull,bear,summary,model&ticker=eq.${ticker}&filing_date=gte.${cutoff}&order=filing_date.desc&limit=1`
      ) as unknown[]
      if (Array.isArray(rows) && rows.length) {
        return resp({ status: 'cached', ...rows[0] })
      }
    } catch { /* non-fatal */ }
  }

  // ── Resolve CIK ──────────────────────────────────────────────────────────
  const cik = await resolveCIK(ticker)
  if (!cik) return resp({ error: 'Ticker not found in EDGAR — US-listed securities only' }, 404)

  // ── Find latest 10-K ─────────────────────────────────────────────────────
  const filing = await fetchLatest10K(cik)
  if (!filing) return resp({ error: 'No 10-K filing found for ' + ticker }, 404)

  // ── Fetch and parse the filing document ──────────────────────────────────
  const accessionFormatted = filing.accession.replace(/(\d{10})(\d{18})/, '$1-$2-$3')
    // accession numbers are 18 digits: first 10 = CIK, next 2 = year, next 6 = seq
  const docUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${filing.accession}/${filing.primaryDoc}`

  let rawText = await fetchEdgarText(docUrl)

  // Fallback: try the filing index to find the right HTM document
  if (!rawText) {
    const indexUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K&dateb=&owner=include&count=1&output=atom`
    rawText = await fetchEdgarText(indexUrl)
  }

  if (!rawText) return resp({ error: 'Could not fetch 10-K document from EDGAR' }, 502)

  // Strip HTML and extract MD&A
  const plainText = stripHtml(rawText)
  const mdaText   = extractMDA(plainText)

  // Attempt to get company name from EDGAR submissions
  let companyName = ticker
  try {
    const sub = await fetchEdgar<EdgarSubmission>('https://data.sec.gov/submissions/CIK' + cik + '.json')
    if (sub?.name) companyName = sub.name
  } catch { /* non-fatal */ }

  // ── Call Claude ───────────────────────────────────────────────────────────
  const thesis = await callClaude(ticker, companyName, mdaText, claudeKey)
  if (!thesis) return resp({ error: 'Claude analysis failed — check ANTHROPIC_API_KEY and model availability' }, 502)

  // ── Store in cache ────────────────────────────────────────────────────────
  const row = {
    ticker,
    filing_date: filing.date,
    bull:    thesis.bull,
    bear:    thesis.bear,
    summary: thesis.summary,
    model:   CLAUDE_MODEL,
  }

  try {
    await sbUpsert(sbUrl, sbKey, 'ai_thesis_cache', [row])
  } catch (e) {
    // Non-fatal — return the result even if caching fails
    console.error('Cache write failed:', (e as Error).message)
  }

  return resp({
    status: 'synthesized',
    ticker,
    filing_date: filing.date,
    company_name: companyName,
    bull:    thesis.bull,
    bear:    thesis.bear,
    summary: thesis.summary,
    model:   CLAUDE_MODEL,
    mda_chars: mdaText.length,
  })
})
