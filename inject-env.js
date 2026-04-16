// inject-env.js — Vercel build-time Supabase key injection
//
// After the 2026-04 refactor, the SUPABASE_KEY line lives in
// public/js/config.js (it used to be inline in public/index.html).
// Vercel runs this during `vercel build` via vercel.json#buildCommand.
const fs = require('fs');

const configPath = 'public/js/config.js';

if (!fs.existsSync(configPath)) {
  console.log('[ATLAS] No ' + configPath + ' found — skipping injection');
  process.exit(0);
}

let js = fs.readFileSync(configPath, 'utf8');

// ATLAS_SUPABASE_KEY takes priority — use this to bypass store-linked
// SUPABASE_ANON_KEY that Vercel won't let you edit/delete.
const anonKey = process.env.ATLAS_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (anonKey) {
  // Match the exact pattern in public/js/config.js
  const pattern = "export const SUPABASE_KEY = window.ATLAS_CONFIG.supabaseKey || '';";
  const replacement = `export const SUPABASE_KEY = window.ATLAS_CONFIG.supabaseKey || '${anonKey}';`;
  const replaced = js.replace(pattern, replacement);
  if (replaced === js) {
    console.log('[ATLAS] WARNING: replacement pattern not found in ' + configPath);
  } else {
    js = replaced;
    console.log('[ATLAS] Supabase anon key injected into ' + configPath);
  }
  fs.writeFileSync(configPath, js);
} else {
  console.log('[ATLAS] Warning: SUPABASE_ANON_KEY not set — terminal will run in demo mode');
}
