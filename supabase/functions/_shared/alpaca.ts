// Shared Alpaca API client + helpers.
//
// All five sync tasks talk to Alpaca through here so auth, base URLs,
// OCC detection, and numeric coercion live in exactly one place.

export const ALPACA_TRADING_BASE = 'https://paper-api.alpaca.markets'
export const ALPACA_DATA_BASE    = 'https://data.alpaca.markets'

export function alpacaHeaders(): Record<string, string> {
  const key    = Deno.env.get('ALPACA_API_KEY')
  const secret = Deno.env.get('ALPACA_API_SECRET')
  if (!key || !secret) {
    throw new Error('Missing ALPACA_API_KEY and/or ALPACA_API_SECRET')
  }
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
  }
}

export async function alpacaGet<T = unknown>(
  base: string,
  path: string,
  query: Record<string, string | number | undefined> = {}
): Promise<T> {
  const url = new URL(path, base)
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  const resp = await fetch(url.toString(), { headers: alpacaHeaders() })
  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`Alpaca ${path} failed: ${resp.status} ${text.slice(0, 500)}`)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Alpaca ${path} returned non-JSON: ${text.slice(0, 200)}`)
  }
}

export function toNumeric(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (!Number.isFinite(n)) throw new Error(`Invalid numeric string: ${v}`)
    return n
  }
  throw new Error(`Expected string|number numeric, got: ${typeof v}`)
}

export function toNumericOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  return toNumeric(v)
}

// OCC option symbol: ROOT(1-6 A-Z/.) + YYMMDD + C|P + strike(8 digits)
// e.g. "AAPL240119C00150000"
const OCC_RE = /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/

export function isOptionSymbol(symbol: string): boolean {
  return OCC_RE.test(symbol)
}

// Decide which asset_class value to write for a raw Alpaca symbol.
// The sync uses this to tag options so the terminal can render them
// distinctly while still counting their value toward NAV.
export function classifyAssetClass(symbol: string, alpacaClass?: string): string {
  if (isOptionSymbol(symbol)) return 'option'
  if (alpacaClass) return alpacaClass
  return 'equity'
}
