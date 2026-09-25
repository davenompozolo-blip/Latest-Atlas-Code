import { createClient } from '@supabase/supabase-js'
import { portfolioHeaders } from './activePortfolio.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vdmojjszvvcithuxwexx.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || ''

if (!supabaseAnonKey) {
  console.warn('[ATLAS] No Supabase anon key — running in demo mode')
}

// MP-2: every request carries the chosen portfolio (if any) as
// x-atlas-portfolio; atlas_active_portfolio() resolves it server-side. No
// choice sends no header, and the server falls back to the default portfolio.
export const supabase = supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { global: { headers: portfolioHeaders() } })
  : null

// Legacy alias used throughout existing pages
export const sb = supabase

// The retired loadView swallowed every failure into a fallback, so a caller
// cannot tell "the view answered with nothing" from "the query was cancelled
// at the 3s anon cap" -- and the Nexus realized layer printed "No sector P&L
// for this period yet" for the second (2026-09-24, inside the nightly chain
// window). loadViewState keeps the three apart. One retry on failure: a cold
// buffer cache can cost the first attempt the cap, and the second is warm.
export async function loadViewState(viewName) {
  if (!supabase) return { state: 'failed', rows: [], error: 'no supabase client' }
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await supabase.from(viewName).select('*')
      if (error) throw error
      if (!data || !data.length) return { state: 'empty', rows: [] }
      // PostgREST caps a response at 1,000 rows whatever the query asks, so a
      // full page is a truncation that looks like a success. Report it.
      if (data.length >= 1000) {
        console.error(`[ATLAS] ${viewName} returned ${data.length} rows -- at the response cap, treated as partial`)
        return { state: 'partial', rows: data }
      }
      return { state: 'ok', rows: data }
    } catch (e) {
      lastErr = e
    }
  }
  console.error(`[ATLAS] ${viewName} did not answer:`, (lastErr && lastErr.message) || lastErr)
  return { state: 'failed', rows: [], error: (lastErr && lastErr.message) || String(lastErr) }
}

