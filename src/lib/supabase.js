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

export async function loadView(viewName, fallback = []) {
  if (!supabase) return fallback
  try {
    const { data, error } = await supabase.from(viewName).select('*')
    if (error) throw error
    if (data && data.length) {
      window.__ATLAS_DATA_MODE__ = 'live'
      return data
    }
    console.warn(`[ATLAS] ${viewName}: empty result — using fallback`)
    return fallback
  } catch (e) {
    console.warn(`[ATLAS] ${viewName}:`, e.message)
    return fallback
  }
}
