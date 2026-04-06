// inject-env.js — Vercel build-time Supabase key injection
const fs = require('fs');

const indexPath = 'public/index.html';

if (!fs.existsSync(indexPath)) {
  console.log('[ATLAS] No public/index.html found — skipping injection');
  process.exit(0);
}

let html = fs.readFileSync(indexPath, 'utf8');

// ATLAS_SUPABASE_KEY takes priority — use this to bypass store-linked
// SUPABASE_ANON_KEY that Vercel won't let you edit/delete.
const anonKey = process.env.ATLAS_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (anonKey) {
  // Match the actual pattern in index.html line 29
  const replaced = html.replace(
    "const SUPABASE_KEY = window.ATLAS_CONFIG.supabaseKey || '';",
    `const SUPABASE_KEY = window.ATLAS_CONFIG.supabaseKey || '${anonKey}';`
  );
  if (replaced === html) {
    console.log('[ATLAS] WARNING: replacement pattern not found — trying fallback patterns');
    // Fallback: try the simple pattern
    html = html.replace("const SUPABASE_KEY = '';", `const SUPABASE_KEY = '${process.env.SUPABASE_ANON_KEY}';`);
  } else {
    html = replaced;
  }
  console.log('[ATLAS] Supabase anon key injected successfully');
} else {
  console.log('[ATLAS] Warning: SUPABASE_ANON_KEY not set — terminal will run in demo mode');
}

fs.writeFileSync(indexPath, html);
