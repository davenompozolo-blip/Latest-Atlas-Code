// Edge Function: enrich_assets
//
// Backfills asset names from Alpaca API and sectors from static GICS mapping.
// Run once after initial position sync, or invoke whenever new positions appear.
//
// Self-contained single-file version for Supabase Dashboard paste-deploy.
//
// Environment variables (Dashboard -> Edge Functions -> Secrets):
//   ALPACA_API_KEY, ALPACA_API_SECRET, SUPABASE_DB_URL

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

// ── Alpaca helpers ──────────────────────────────────────────────────────────

const ALPACA_TRADING_BASE = 'https://paper-api.alpaca.markets'

function alpacaHeaders(): Record<string, string> {
  const key    = Deno.env.get('ALPACA_API_KEY')
  const secret = Deno.env.get('ALPACA_API_SECRET')
  if (!key || !secret) throw new Error('Missing ALPACA_API_KEY / ALPACA_API_SECRET')
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
  }
}

interface AlpacaAsset {
  symbol: string
  name: string
  exchange?: string
  asset_class?: string
  [k: string]: unknown
}

async function fetchAlpacaAsset(symbol: string): Promise<AlpacaAsset | null> {
  try {
    const url = `${ALPACA_TRADING_BASE}/v2/assets/${encodeURIComponent(symbol)}`
    const resp = await fetch(url, { headers: alpacaHeaders() })
    if (!resp.ok) {
      console.warn(`Alpaca /v2/assets/${symbol}: ${resp.status}`)
      return null
    }
    return await resp.json() as AlpacaAsset
  } catch (e) {
    console.warn(`Alpaca asset fetch failed for ${symbol}:`, e)
    return null
  }
}

// ── GICS Sector Mapping ────────────────────────────────────────────────────
// Comprehensive mapping of ~200 common US equities/ETFs.
// For tickers not in this list, sector remains unchanged.

const GICS: Record<string, string> = {
  // Technology
  AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology', GOOGL: 'Technology',
  GOOG: 'Technology', META: 'Technology', AVGO: 'Technology', ORCL: 'Technology',
  CSCO: 'Technology', CRM: 'Technology', ADBE: 'Technology', AMD: 'Technology',
  INTC: 'Technology', BIDU: 'Technology', PLTR: 'Technology', SNOW: 'Technology',
  QCOM: 'Technology', TXN: 'Technology', AMAT: 'Technology', MU: 'Technology',
  NOW: 'Technology', PANW: 'Technology', SNPS: 'Technology', CDNS: 'Technology',
  NXPI: 'Technology', MRVL: 'Technology', FTNT: 'Technology', CRWD: 'Technology',
  ZS: 'Technology', NET: 'Technology', DDOG: 'Technology', SHOP: 'Technology',
  SQ: 'Technology', TEAM: 'Technology', UBER: 'Technology', COIN: 'Technology',
  NPSNY: 'Technology', PROSY: 'Technology', INFY: 'Technology', SAP: 'Technology',

  // Healthcare
  JNJ: 'Healthcare', UNH: 'Healthcare', PFE: 'Healthcare', ABT: 'Healthcare',
  MRK: 'Healthcare', TMO: 'Healthcare', GILD: 'Healthcare', AHR: 'Healthcare',
  AMGN: 'Healthcare', LLY: 'Healthcare', BMY: 'Healthcare', ABBV: 'Healthcare',
  ISRG: 'Healthcare', DHR: 'Healthcare', SYK: 'Healthcare', REGN: 'Healthcare',
  VRTX: 'Healthcare', ZTS: 'Healthcare', MRNA: 'Healthcare', CI: 'Healthcare',
  ELV: 'Healthcare', HCA: 'Healthcare', BSX: 'Healthcare', MDT: 'Healthcare',

  // Financials
  JPM: 'Financials', BAC: 'Financials', WFC: 'Financials', GS: 'Financials',
  MS: 'Financials', BLK: 'Financials', SCHW: 'Financials', C: 'Financials',
  AXP: 'Financials', PNC: 'Financials', USB: 'Financials', TFC: 'Financials',
  SPGI: 'Financials', ICE: 'Financials', CME: 'Financials', AON: 'Financials',
  MMC: 'Financials', CB: 'Financials', PGR: 'Financials', MET: 'Financials',

  // Energy
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy', SLB: 'Energy',
  HAL: 'Energy', OXY: 'Energy', PBR: 'Energy', EOG: 'Energy',
  MPC: 'Energy', VLO: 'Energy', PSX: 'Energy', DVN: 'Energy',
  HES: 'Energy', BKR: 'Energy', FANG: 'Energy', KMI: 'Energy',

  // Consumer Discretionary
  AMZN: 'Consumer Discretionary', TSLA: 'Consumer Discretionary',
  HD: 'Consumer Discretionary', TGT: 'Consumer Discretionary',
  NKE: 'Consumer Discretionary', SBUX: 'Consumer Discretionary',
  MCD: 'Consumer Discretionary', BKNG: 'Consumer Discretionary',
  TJX: 'Consumer Discretionary', LOW: 'Consumer Discretionary',
  MAR: 'Consumer Discretionary', ABNB: 'Consumer Discretionary',
  GM: 'Consumer Discretionary', F: 'Consumer Discretionary',
  LULU: 'Consumer Discretionary', ROST: 'Consumer Discretionary',
  CMG: 'Consumer Discretionary', ORLY: 'Consumer Discretionary',
  YUM: 'Consumer Discretionary', DPZ: 'Consumer Discretionary',
  EBAY: 'Consumer Discretionary',

  // Consumer Staples
  WMT: 'Consumer Staples', PG: 'Consumer Staples', COST: 'Consumer Staples',
  KO: 'Consumer Staples', PEP: 'Consumer Staples', MDLZ: 'Consumer Staples',
  CL: 'Consumer Staples', PM: 'Consumer Staples', MO: 'Consumer Staples',
  GIS: 'Consumer Staples', K: 'Consumer Staples', SJM: 'Consumer Staples',

  // Industrials
  CAT: 'Industrials', HON: 'Industrials', UPS: 'Industrials', BA: 'Industrials',
  RTX: 'Industrials', DE: 'Industrials', GE: 'Industrials', MMM: 'Industrials',
  UNP: 'Industrials', LMT: 'Industrials', NOC: 'Industrials', GD: 'Industrials',
  WM: 'Industrials', EMR: 'Industrials', ETN: 'Industrials', ITW: 'Industrials',
  FDX: 'Industrials', DAL: 'Industrials', AAL: 'Industrials', UAL: 'Industrials',
  SGRP: 'Industrials',

  // Real Estate
  XLRE: 'Real Estate', AMT: 'Real Estate', PLD: 'Real Estate', EQIX: 'Real Estate',
  SPG: 'Real Estate', O: 'Real Estate', DLR: 'Real Estate', WELL: 'Real Estate',
  PSA: 'Real Estate', CCI: 'Real Estate', VICI: 'Real Estate',

  // Materials / Mining
  LIN: 'Materials', APD: 'Materials', SHW: 'Materials', FCX: 'Materials',
  NEM: 'Materials', GOLD: 'Materials', HMY: 'Materials', NUE: 'Materials',
  ECL: 'Materials', DOW: 'Materials',

  // Communication
  VZ: 'Communication', T: 'Communication', CMCSA: 'Communication',
  DIS: 'Communication', NFLX: 'Communication', TMUS: 'Communication',
  EA: 'Communication', TTWO: 'Communication',

  // Utilities
  NEE: 'Utilities', DUK: 'Utilities', SO: 'Utilities', D: 'Utilities',
  AEP: 'Utilities', EXC: 'Utilities', SRE: 'Utilities', XEL: 'Utilities',

  // ETFs
  SPY: 'ETFs', QQQ: 'ETFs', IWM: 'ETFs', DIA: 'ETFs', VTI: 'ETFs',
  VOO: 'ETFs', IBIE: 'ETFs', IVV: 'ETFs', VEA: 'ETFs', VWO: 'ETFs',
  AGG: 'ETFs', BND: 'ETFs', TLT: 'ETFs', EFA: 'ETFs', EEM: 'ETFs',
  XLF: 'ETFs', XLK: 'ETFs', XLE: 'ETFs', XLV: 'ETFs', XLI: 'ETFs',
  XLP: 'ETFs', XLY: 'ETFs', XLU: 'ETFs', XLB: 'ETFs', GDX: 'ETFs',
}

// OCC option symbol pattern
const OCC_RE = /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/

function classifySector(symbol: string): string | null {
  if (OCC_RE.test(symbol)) return 'Options'
  return GICS[symbol] || null
}

// ── Main logic ─────────────────────────────────────────────────────────────

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

interface AssetRow {
  id: string
  symbol: string
  name: string | null
  sector: string | null
  asset_class: string
}

async function enrichAssets(): Promise<{
  total: number
  names_updated: number
  sectors_updated: number
  errors: string[]
}> {
  // Fetch all assets that need enrichment (missing name or sector)
  const assets = await sql<AssetRow[]>`
    select id, symbol, name, sector, asset_class
    from public.assets
    where name is null or sector is null
    order by symbol
  `

  let namesUpdated = 0
  let sectorsUpdated = 0
  const errors: string[] = []

  // Process in batches to respect rate limits
  for (const asset of assets) {
    let newName = asset.name
    let newSector = asset.sector

    // Fetch name from Alpaca if missing (only for non-option equities)
    if (!newName && asset.asset_class !== 'option' && !OCC_RE.test(asset.symbol)) {
      const alpacaAsset = await fetchAlpacaAsset(asset.symbol)
      if (alpacaAsset?.name) {
        // Clean up Alpaca's name (e.g. "Apple Inc. Common Stock" → "Apple Inc.")
        newName = alpacaAsset.name
          .replace(/\s+Common Stock$/i, '')
          .replace(/\s+Class [A-Z]$/i, '')
          .replace(/\s+Ordinary Shares$/i, '')
          .replace(/,?\s+Inc\.?/i, ' Inc.')
          .trim()
      }
      // Small delay between API calls to respect rate limits (200/min)
      await new Promise(r => setTimeout(r, 350))
    }

    // For options, derive name from the underlying
    if (!newName && OCC_RE.test(asset.symbol)) {
      const root = asset.symbol.replace(/\d{6}[CP]\d{8}$/, '')
      const dateStr = asset.symbol.match(/(\d{6})[CP]/)?.[1]
      const cp = asset.symbol.match(/\d{6}([CP])/)?.[1]
      const strikeRaw = asset.symbol.match(/[CP](\d{8})$/)?.[1]
      if (root && dateStr && cp && strikeRaw) {
        const strike = parseInt(strikeRaw) / 1000
        const expiry = `20${dateStr.slice(0,2)}-${dateStr.slice(2,4)}-${dateStr.slice(4,6)}`
        newName = `${root} ${expiry} ${strike} ${cp === 'C' ? 'Call' : 'Put'}`
      }
    }

    // Classify sector
    if (!newSector) {
      newSector = classifySector(asset.symbol) || 'Other'
    }

    // Update if anything changed
    const nameChanged = newName && newName !== asset.name
    const sectorChanged = newSector && newSector !== asset.sector

    if (nameChanged || sectorChanged) {
      try {
        await sql`
          update public.assets set
            name   = coalesce(${newName}, name),
            sector = coalesce(${newSector}, sector)
          where id = ${asset.id}
        `
        if (nameChanged) namesUpdated++
        if (sectorChanged) sectorsUpdated++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`${asset.symbol}: ${msg}`)
      }
    }
  }

  return {
    total: assets.length,
    names_updated: namesUpdated,
    sectors_updated: sectorsUpdated,
    errors,
  }
}

// ── HTTP entry point ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('expected POST', { status: 405 })
  }

  try {
    const result = await enrichAssets()
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('enrich_assets failed:', message)
    return new Response(JSON.stringify({ error: message }), {
      headers: { 'content-type': 'application/json' },
      status: 500,
    })
  }
})
