// Compares supabase/migrations/ against the migration ledger
// (supabase_migrations.schema_migrations) through the management API.
//   SUPABASE_ACCESS_TOKEN=... node scripts/check-migration-ledger.mjs
// Exit 1 on any drift. Comments and whitespace are ignored when comparing;
// a ledger row with no stored SQL (a hand-backfilled row) accepts its file.
import { readdirSync, readFileSync } from 'node:fs';

const REF = process.env.SUPABASE_PROJECT_REF || 'vdmojjszvvcithuxwexx';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN is required'); process.exit(2); }

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select version, name, statements from supabase_migrations.schema_migrations' }),
});
if (!r.ok) { console.error('ledger read failed:', r.status, await r.text()); process.exit(2); }
const ledger = new Map((await r.json()).map(x => [x.version, x]));

const sem = s => s.replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
const dir = 'supabase/migrations';
const problems = [];
const seen = new Set();
for (const f of readdirSync(dir)) {
    const m = f.match(/^(\d+)_(.*)\.sql$/);
    if (!m) { problems.push(`not a migration file: ${f}`); continue; }
    const row = ledger.get(m[1]);
    if (!row) { problems.push(`no ledger row (db push would apply it): ${f}`); continue; }
    if (seen.has(m[1])) problems.push(`two files for version ${m[1]}`);
    seen.add(m[1]);
    const ran = sem((row.statements || []).join('\n'));
    if (ran && ran !== sem(readFileSync(`${dir}/${f}`, 'utf8'))) problems.push(`differs from what ran: ${f}`);
}
for (const [v, row] of ledger) if (!seen.has(v)) problems.push(`ledger row with no file: ${v}_${row.name}.sql`);

console.log(`${ledger.size} ledger rows, ${seen.size} files matched`);
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log('migrations/ mirrors the ledger');
