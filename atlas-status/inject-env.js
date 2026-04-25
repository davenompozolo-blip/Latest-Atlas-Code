// inject-env.js — Vercel build-time Supabase key injection for atlas-status.
// Replaces the SUPABASE_KEY placeholder in public/index.html before serving.
const fs = require('fs');

const htmlPath = 'public/index.html';

if (!fs.existsSync(htmlPath)) {
  console.log('[atlas-status] No ' + htmlPath + ' — skipping injection');
  process.exit(0);
}

let html = fs.readFileSync(htmlPath, 'utf8');

// ATLAS_SUPABASE_KEY takes priority (avoids Vercel store-linked key conflicts).
const anonKey = process.env.ATLAS_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (anonKey) {
  const pattern     = "const SUPABASE_KEY = '';  // injected at build";
  const replacement = "const SUPABASE_KEY = '" + anonKey + "';  // injected at build";
  const replaced    = html.replace(pattern, replacement);

  if (replaced === html) {
    console.log('[atlas-status] WARNING: injection pattern not found in ' + htmlPath);
  } else {
    html = replaced;
    console.log('[atlas-status] Supabase anon key injected into ' + htmlPath);
  }
  fs.writeFileSync(htmlPath, html);
} else {
  console.log('[atlas-status] Warning: no SUPABASE_ANON_KEY set — Supabase panel will show error');
}
