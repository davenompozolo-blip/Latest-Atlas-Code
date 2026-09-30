#!/usr/bin/env node
// Data-trust guard: fail CI if a NEW migration coerces untrusted vendor JSON
// straight into a strict SQL type. Casting decimal/empty/junk text to
// bigint/int/date/timestamp throws at query time and takes down the whole
// surface (cf. the screener outage on Citigroup's "245334658571.99997").
//
// Rule: vendor-JSON extractions ( ->> ... ) must go through the safe_* helpers
// (safe_bigint / safe_numeric / safe_date), never a bare ::bigint/::date cast.
//
// Legacy migrations (<= CUTOFF) are grandfathered — they've been superseded
// live by the hardening migration. Only migrations newer than the cutoff are
// enforced, so the rule binds all future work without rewriting history.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';
const CUTOFF = '20260621020000'; // the hardening migration; everything after must comply

// A JSON text extraction ( ->> 'x'  or  ->> 'x'::text ) immediately cast to a
// strict numeric/temporal type. safe_* helpers take text and never match this.
const UNSAFE = /->>\s*[^)]*\)\s*::\s*(bigint|integer|int|date|timestamptz|timestamp)\b/i;
// Lines that are *defining* the hardening (string literals inside replace()/
// position()/asserts, or already routed through safe_*) are not violations.
const EXEMPT = /(safe_bigint|safe_numeric|safe_date|replace\s*\(|position\s*\(|RAISE\s+EXCEPTION)/i;

// Files past the cutoff that record SQL which already ran, rebuilt verbatim
// from the migration ledger on 2026-09-30. Editing them would falsify the
// record, and none is a vendor-JSON cast: the first is the fix for this very
// bug (the flagged line is the literal of the expression it replaces); the
// other three cast sync_log.details, JSON this platform writes itself.
const RECORDED = new Set([
  '20260621080014_fix_vw_screener_market_cap_bigint_cast.sql',
  '20260816143313_scheduler_chain_infra.sql',
  '20260816145123_chain_reap_no_generated_column.sql',
  '20260913112454_job28_resume_offset_from_last_run.sql',
]);

const prefixOf = (name) => (name.match(/^(\d+)/)?.[1] ?? '0');

let files;
try {
  files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
} catch {
  console.log('check-unsafe-casts: no migrations dir, nothing to check.');
  process.exit(0);
}

const violations = [];
for (const file of files) {
  if (prefixOf(file) <= CUTOFF) continue; // grandfathered
  if (RECORDED.has(file)) continue;
  const lines = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (UNSAFE.test(line) && !EXEMPT.test(line)) {
      violations.push(`${MIGRATIONS_DIR}/${file}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length) {
  console.error('\n✗ Unsafe vendor-JSON casts found — route these through safe_bigint/safe_numeric/safe_date:\n');
  for (const v of violations) console.error('  ' + v);
  console.error('\nWhy: casting decimal/empty/junk vendor text to a strict type throws and');
  console.error('breaks the entire view. See docs/DATA_TRUST.md.\n');
  process.exit(1);
}

console.log(`✓ check-unsafe-casts: no unsafe vendor-JSON casts in migrations newer than ${CUTOFF}.`);
