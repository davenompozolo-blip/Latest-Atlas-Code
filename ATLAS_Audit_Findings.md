# ATLAS Pre-Scale Audit — Findings Log

Running findings log for the pre-scale debug & fix audit (see runbook).
One section per audit pass. Evidence gathered by querying the **live Supabase
project** (`cron.job`, `cron.job_run_details`, `vault`, row counts, deployed
Edge Function list) — not repo state or PR history.

---

## Pass 1 — Section 1: Known-debt regression check

**Date:** 2026-07-06 · **Scope:** the six known-debt items from the runbook, verified live.

### Summary

| # | Item | Verdict | Severity |
|---|------|---------|----------|
| 1.1 | FundsData daily cron | **BROKEN — failing silently for ≥ 1 week** | HIGH |
| 1.2 | `asset_class_indices` / `index_returns` | **Still empty (0 rows)** | HIGH |
| 1.3 | `sync_alpaca_activities` | **Still not deployed — not even in repo** | HIGH |
| 1.4 | Data Trust Layer (`atlas_sync_log` / `atlas_sync_status`) | **Schema-only, never wired** | HIGH |
| 1.5 | JWT verification off on user-facing endpoints | **Confirmed — no compensating auth** | HIGH (security) |
| 1.6 | `asset_class` vocabulary inconsistency | **Still present (3 vocabularies)** | MEDIUM |
| 1.7 | Expired options in position views | Non-issue currently | — |
| 1.8 | Frozen price history | Not recurring — prices current | OK |
| 1.9 | Snapshot continuity | No gaps > 3 days, current through today | OK |
| 1.10 | Vercel env / `inject-env.js` | Working; `inject-env.js` is dead code for the live app | LOW (cleanup) |

---

### 1.1 FundsData daily cron — BROKEN (deploy/schedule gap pattern, third recurrence)

**Bug.** `cron.job` id 10 (`sync_funddata_prices_daily`, `0 5 * * 1-5`, active) builds its
target URL from `(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')`.
Two independent faults:

1. The vault secret is named **`project_url`**, not `supabase_url` → the subselect returns NULL.
2. Even the correctly-named `project_url` secret decrypts to a **literal placeholder**
   (`https://<pro…`) — it was never filled in with the real project URL.

**Evidence.** Every firing in `cron.job_run_details` for the last 5 runs (2026-06-30 → 2026-07-06)
failed with `null value in column "url" of relation "http_request_queue" violates not-null constraint`.
`fund_prices_raw`: 5,593 rows, `max(created_at)` = **2026-06-05** — frozen since the manual seed,
exactly one month stale at audit time.

**Root cause.** Job scheduled with an unverified command: the vault-lookup pattern was never
executed successfully even once (the secret name never existed). Same failure shape as the two
prior confirmed incidents: infrastructure landed, the execution path was never verified.

**Fix applied.** Replaced the vault lookup with the hardcoded project URL — the identical pattern
already used by the four healthy jobs (6, 7, 9, 13) — via `cron.alter_job`. Verification gate
followed: the corrected `net.http_post` statement was executed manually first and confirmed to
reach the Edge Function and upsert rows into `fund_prices_raw` **before** the schedule was updated.

**Verification evidence.**

- Manual invocation request id 26925 → HTTP 200,
  `{"status":"ok","parsed_rows":5656,"upserted":5609,"dry_run":false}`.
- `fund_prices_raw`: 5,593 → 11,202 rows; `max(created_at)` = 2026-07-06 16:29 UTC;
  `max(price_date)` = 2026-07-06 (per-date snapshot table, so a new day adds rows).
- `cron.job` id 10 command updated via `cron.alter_job` and re-read to confirm the
  hardcoded-URL command is stored; schedule unchanged (`0 5 * * 1-5`, active).
- Next scheduled fire 2026-07-07 05:00 UTC — re-verify `cron.job_run_details` succeeds and
  a 2026-07-07 snapshot lands.

**Residual risk / queued follow-ups.**
- No alerting on cron failures — this job failed silently for a month. Queued as structural item (see Queue).
- The `project_url` vault secret still contains a placeholder; either fill it or delete it so
  nothing else silently inherits it.

---

### 1.2 `asset_class_indices` / `index_returns` — still empty

Both tables have **0 rows** (live count). `fund_prices_raw` is populated (5,593 funds) but the
downstream index/returns derivation has never run. Schema-only tables with no deployed+scheduled
writer = the exact "no sync function exists without a verified-writing counterpart" sign-off
criterion failing.

**Status:** LOGGED, not fixed this pass (needs a decision on what populates them — queued as its
own pass per runbook §4).

---

### 1.3 `sync_alpaca_activities` — never deployed, code absent from repo

- Deployed Edge Function list: **no** `sync_alpaca_activities` (14 functions live, none for activities).
- Repo `supabase/functions/`: **no** such function — the only mention is in `ATLAS_RETROFIT_HANDOFF.md`.
- `transactions`: still **146 rows** (the positions-derived path), unchanged from last known state.

**Status:** LOGGED. This is feature work (write + deploy + schedule + verify), not a patch —
queued as its own pass.

---

### 1.4 Data Trust Layer — schema exists, nothing writes to it

CLAUDE.md documents `atlas_sync_log` / `atlas_sync_status` / `atlas_validation_log` as the
operational sync-health system. Live state:

- `atlas_sync_log`: **0 rows**.
- `atlas_sync_status` (id=1): every field NULL, `updated_at` = 2026-05-07 (creation) — never touched.
- None of the deployed sync functions reference these tables (grep of `supabase/functions/*`;
  `sync_funddata_prices` logs to a separate `sync_log` table instead).

This is the deploy/schedule gap pattern again, applied to the observability layer itself — which
is *why* finding 1.1 went unnoticed for a month. The `SyncStatus.jsx` header component reads a
table that has never been written.

**Status:** LOGGED, queued as a structural pass (wire syncs → `atlas_sync_log`/`atlas_sync_status`,
or retire the tables and update CLAUDE.md).

---

### 1.5 `verify_jwt=false` audit — user-facing endpoints are open

Deployed functions and their JWT posture (live Edge Function list):

| Function | verify_jwt | Inbound auth in body | Assessment |
|---|---|---|---|
| `database-access` | true | — | OK |
| `enrich_assets` (slug `super-worker`) | true | — | OK |
| `sync_alpaca_positions` | false | none | Cron-required; publicly triggerable (idempotent) |
| `sync_alpaca_prices` | false | none | Cron-required; publicly triggerable |
| `sync_portfolio_history` | false | none | Cron-required; publicly triggerable |
| `sync_fundamentals` | false | none | Cron-required; publicly triggerable |
| `sync_funddata_prices` | false | none | Cron-required; publicly triggerable |
| `sync-listing-status` | false | none | Publicly triggerable |
| `claude_sql_assistant` | false | **none — verified in deployed source** | **Open Anthropic-API proxy: anyone with the URL can spend the API key. CORS `*`.** |
| `generate_cortex_signals` | false | none | Publicly triggerable; may call Claude API |
| `synthesize_thesis` | false | none | Calls Claude API — same key-burn exposure |
| `cortex_pretrade_risk` | false | none | Open |
| `compute_ticker_derived` | false | none | Open |
| `probe_investing` | false | none | Open |

The known-debt question was "is `--no-verify-jwt` accidentally applied to a user-facing
endpoint?" — **yes**: `claude_sql_assistant` and `synthesize_thesis` proxy the paid Anthropic
API with no authentication of any kind ("Authorization" appears in their source only as
*outbound* headers to Supabase REST). The cron-triggered sync functions legitimately need
`verify_jwt=false` (pg_cron posts with empty headers) but currently have no shared-secret check
either.

**Recommended fix (not applied — needs a frontend-coordination decision):**
1. Add a required `x-atlas-key` (or similar) header check to the Claude-proxy functions; the
   static frontend already sends custom headers to Supabase, so it can send this too — or move
   these calls behind the Vercel `/api/*` functions which are same-origin.
2. Add a shared secret to the cron `net.http_post` headers + a check in each sync function.
3. Rate-limit `claude_sql_assistant` regardless.

**Status:** LOGGED as HIGH security debt; fix queued as its own pass (touches frontend + all cron commands).

---

### 1.6 `asset_class` inconsistency — still present, now three vocabularies

Live distribution in `assets`:
`Stock` 7,604 · `us_equity` 67 · `option` 9 · `equity` 4 · `us_option` 3 · `cash` 1 · `etf` 1.

Three naming schemes coexist (Alpaca's `us_equity`/`us_option`, a legacy `equity`/`option`/`etf`/`cash`
set, and `Stock` from the listing-status universe sync). Any view or filter that tests
`asset_class = 'us_equity'` silently drops the 4 `equity` rows and vice-versa.

**Status:** LOGGED. Not fixed this pass — normalisation is a data migration needing a canonical
vocabulary decision (recommend Alpaca's, with `Stock` reserved for the non-held universe, or a
proper `universe` flag). Queued.

---

### 1.7 Expired options in position views — currently a non-issue

`vw_portfolio_home` contains no option symbols (regex check for OCC symbols returned 0 rows);
expired contracts exist only in historical `positions` snapshots (e.g. XLK/XLP 2026-06-18 expiries
appear through as-of 2026-06-19 with `market_value = 0`, then drop out). Nexus holdings views
inherit from `vw_portfolio_home`, so no leakage today. Worth re-checking whenever an option is
held through expiry again.

### 1.8 Price history — healthy

`price_history`: 82,179 rows, 81 assets, `max(price_date)` = 2026-07-02 — expected, since
2026-07-03 was the US market holiday and the 22:00 UTC sync for 2026-07-06 hadn't fired at audit
time. `sync_alpaca_prices_daily` succeeded on all 5 runs in the past week. The frozen-history
pattern has not recurred.

### 1.9 Account snapshots — healthy

`account_snapshots`: 92 distinct days, latest = 2026-07-06, zero gaps > 3 days.

### 1.10 Vercel env / `inject-env.js` — working, but the injection path is dead code

- The live React terminal (`src/lib/supabase.js`) reads `VITE_SUPABASE_ANON_KEY || VITE_SUPABASE_KEY`
  at build time; latest production deployment (`latest-atlas-code-o19a`, commit 610bd25) is READY
  and the app is demonstrably connected to live data.
- Root `inject-env.js` targets the **legacy** static page (`public/js/config.js`) and is invoked by
  nothing: `vercel.json#buildCommand` is `npm run build` → `vite build`. The `ATLAS_SUPABASE_KEY`
  fallback pattern therefore cannot regress — it never runs. (The `atlas-status/` sub-project has
  its own working copy.)
- One production deployment errored on 2026-07-06 and succeeded on immediate redeploy — transient.

**Status:** OK. Cleanup suggestion: delete root `inject-env.js` + the legacy `public/` page or
mark them archived, so future audits don't chase this ghost.

---

### Queue (structural items surfaced this pass — each gets its own bounded pass)

1. **Sync observability**: wire all sync functions into `atlas_sync_log`/`atlas_sync_status`
   (or retire those tables); add failure alerting for `cron.job_run_details` — 1.1 failed
   silently for a month because this doesn't exist.
2. **`sync_alpaca_activities`**: build, deploy, schedule, verify (full transaction history).
3. **FundsData downstream**: populate `asset_class_indices` / `index_returns` (deploy → seed →
   verify → schedule).
4. **Edge Function auth**: shared-secret check on cron functions; real auth on the Claude-proxy
   endpoints (`claude_sql_assistant`, `synthesize_thesis`).
5. **`asset_class` normalisation** migration after canonical-vocabulary decision.
6. Vault hygiene: fix or delete the placeholder `project_url` secret.

---

## Pass 2 — Data ingestion layer

**Date:** 2026-07-06 · **Scope:** every scheduled ingestion path (pg_cron/Edge Functions, GitHub Actions, Vercel crons): deployed + scheduled + verified writing on schedule; idempotency; error handling; orphaned tables.

### Summary

| # | Item | Verdict | Severity |
|---|------|---------|----------|
| 2.1 | GitHub Actions ingestion tier (3 scheduled workflows) | **DEAD — every run of every workflow fails at startup** | CRITICAL |
| 2.2 | `/api/ledger-snapshot` (SPY benchmark + decision outcomes) | **Dead twice over — crash since 06-11, silent SPY failure since 05-29** | HIGH — fixed this pass |
| 2.3 | `/api/health`, `/api/ledger-export` | Crash on every call (same ESM bug) | HIGH — fixed this pass |
| 2.4 | `/api/trading` ledger write path | Silently disabled (lazy `require` in try/catch) — `orders` 0 rows | HIGH — fixed this pass |
| 2.5 | `/api/sync-valuations` | Runs green but wrote nothing for 2 consecutive Mondays | MEDIUM |
| 2.6 | pg_cron / Edge Function tier | Healthy (all 6 jobs succeeding; verified freshness) | OK |
| 2.7 | `/api/options-snapshot` | Healthy (881 rows, latest 2026-07-03, logs to `sync_log`) | OK |
| 2.8 | Idempotency guards | Natural-key unique constraints verified on all key tables; one conflict-target trap found (fixed in 2.2) | OK/note |
| 2.9 | `sync_funddata_prices` leaves `sync_log` rows stuck at `running` | Log-finalisation PATCH fails silently | LOW |

### 2.1 GitHub Actions tier — every workflow fails on every run (CRITICAL, user action required)

Live run history (GitHub API):

| Workflow | Schedule | Runs | Recent conclusions | Last success found |
|---|---|---|---|---|
| `atlas-sync.yml` (Alpaca full sync + validation + trust layer) | 21:30 + 13:00 UTC wkdays | 765 | 60/60 sampled = failure (back through 2026-05-25) | none in sample |
| `sync-funddata.yml` (SA fund **NAV** sync) | 14:00 UTC wkdays | 21 | 21/21 failure — never succeeded since creation 2026-06-08 | never |
| `atlas-fundamentals.yml` | 12:30 UTC wkdays | 236 | 30/30 sampled = failure | none in sample |
| `data-trust.yml` (unsafe-cast CI gate) | on PR | 6 | 6/6 failure — including PR-triggered runs | never |

**Signature:** jobs complete in 3–5 s with `runner_id: 0`, no runner name, and **zero steps** — they die before any step executes. Raw logs return 404. This uniform pattern across all workflows and trigger types is the classic signature of an **account-level GitHub Actions block (lapsed spending limit / failed payment method)**, not a code bug. The API used here cannot read billing state — **check GitHub → Settings → Billing → Actions.**

**Blast radius:**
- `transactions` stuck at 146 rows (the wrapper's transactions sync never ran) — the Pass 1 finding 1.3 root cause is here, not just a missing Edge Function.
- Data Trust Layer never populated (`atlas_sync_log`/`atlas_sync_status`/`atlas_validation_log` — Pass 1 finding 1.4): `scripts/sync-wrapper.mjs` is a complete, well-built writer (retries, validation, status upserts) that has never once executed to completion.
- `atlas_memory` also 0 rows — even the workflows' failure-alerting step can't run, because jobs never start. The alert system for the outage is inside the thing that's out.
- SA fund **NAVs** never ingested (the Edge Function scrapes the TER/cost registry where `nav` is null by design; NAVs were this workflow's job).
- Migrations merge without the `data-trust` unsafe-cast gate.

**Redundancy note:** positions / account snapshots / price history / fundamentals are independently covered by the healthy pg_cron tier, so day-to-day analytics kept working — which is exactly why this outage stayed invisible. The Actions tier's *unique* responsibilities (transactions, equity curve, validation, NAVs) are the ones that silently stopped.

**Queued decision** (own pass): once billing is restored, either keep the Actions tier or port its unique jobs (transactions, validation/trust-layer, NAV sync) onto the pg_cron/Edge tier that has proven reliable — running both invites drift.

### 2.2 `/api/ledger-snapshot` — two stacked failures froze SPY at 2026-05-29 (FIXED)

**Failure A (2026-06-11 → now, total):** PR #632 added `"type": "module"` to the root `package.json`; `api/ledger-snapshot.js` was CommonJS (`require`) and has crashed with `FUNCTION_INVOCATION_FAILED` on every invocation since — verified live (`ReferenceError: require is not defined in ES module scope` in Vercel runtime logs, at `api/ledger-snapshot.js:12`).

**Failure B (2026-05-29 → 06-11, silent):** all 124 existing SPY rows are `source='yahoo', interval='1Day'`; the handler upserts `source='alpaca'` with `onConflict: 'asset_id,source,interval,price_date'`. `price_history` also carries a **stricter** unique index `(asset_id, price_date, interval)` that the conflict target doesn't cover, so the historical dates in each ~200-day batch raised unique violations, the whole batch failed atomically, and `upsertSpy` swallowed the error (`return error ? 0 : rows.length`) while the handler returned `ok: true`. Net effect: SPY frozen at 2026-05-29, so `snapshot_decision_outcomes()` benchmarking has been computing against a stale benchmark (and `ledger_px` falls back to the last price ≤ asof, hiding the staleness).

**Fix applied (this branch):**
- Converted to ESM (`import`/`export default`).
- Conflict target corrected to the real natural key `(asset_id, price_date, interval)`; `interval` aligned to the canonical `'1d'` used by the Edge Function feed.
- Upsert errors are now returned in the JSON (`spyError`) instead of being swallowed.

**Verification:** `node --check` passes; live verification requires merge + Vercel deploy — then `GET /api/ledger-snapshot` should return `pricesUpserted > 0` and `max(price_date)` for SPY should advance to the current session. **Re-probe after merge.**

**Queued cleanup:** the 124 legacy `yahoo/1Day` SPY rows become redundant duplicates once the `1d` series backfills (harmless to `ledger_px`, which ignores source/interval); delete them in a follow-up migration after the fixed feed is verified.

### 2.3 `/api/health` and `/api/ledger-export` — same ESM crash (FIXED)

Both were CommonJS and have crashed on every call since 06-11 — including the pipeline **health check itself**. Converted to ESM; `node --check` passes.

### 2.4 `/api/trading` order/decision audit trail silently disabled (FIXED)

`recordExecution()` lazily did `require('@supabase/supabase-js')` inside a try/catch; under ESM that throws, is caught, and the function "degrades silently" — every executed trade since 06-11 skipped the `orders` audit-trail write and the Ledger decision append (`orders` table: 0 rows). Replaced with a static ESM import. Note: past executions in the gap are unrecoverable from this path; if any real trades were placed since 06-11, backfill from Alpaca order history.

### 2.5 `/api/sync-valuations` — green but writing nothing (LOGGED)

Ran on schedule today (Mon 06:01 UTC, HTTP 200) yet `scrapbook_companies`/`scrapbook_snapshots` were last written **2026-06-27**. The run loops 61 holdings through `/api/equity?endpoint=combined`; runtime logs show bursts of `/api/equity` 502s (consistent with Alpha Vantage free-tier quota exhaustion under 61 rapid calls), every ticker errors, `valued: 0`, and the handler still returns 200. No retry, no alert, no non-200 on zero-valued runs. Queued: quota-aware batching (it already supports `limit`/`offset` — schedule staggered slices), and fail the response when `valued === 0 && scope > 0`.

### 2.6–2.7 Healthy paths (verified)

- pg_cron: all 6 jobs succeeded on schedule over the past week (`cron.job_run_details`); `equity_cache` fresh today 12:01 UTC; `price_history` (non-SPY) current through 2026-07-02 (holiday-correct); positions/snapshots current (Pass 1).
- FundsData TER/cost feed: fresh 2026-07-06 snapshot after the Pass 1 cron fix (11,202 rows).
- `/api/options-snapshot`: 881 rows, latest 2026-07-03 (Friday), writes `sync_log` entries (the `function_name IS NULL` successes at 23:01 UTC).

### 2.8 Idempotency audit

Natural-key unique constraints verified: `fund_prices_raw(source,fund_code,price_date)`, `price_history(asset_id,price_date,interval)` (+ a redundant 4-col index with `source` — the trap that caused 2.2B; consider dropping it), `positions(portfolio_id,asset_id,as_of_date)`, `transactions(portfolio_id,external_id)`, `equity_cache(cache_key)`, `options_positioning_snapshots(symbol,snapshot_date)`. All writers use upsert/merge-duplicates.

`account_snapshots` has **no** natural-key constraint: 26,281 rows over 92 days (~286/day ≈ one per 5-minute positions sync) — appears to be intentional intraday snapshotting, but confirm intent; if only daily granularity is consumed, this is unbounded growth.

### 2.9 `sync_funddata_prices` sync_log rows stuck at `running` (LOW)

Today's verified-successful run (HTTP 200, 5,609 upserted) left its `sync_log` row at `status='running'` — the function's log-finalisation PATCH fails silently (`sbPatch` only `console.warn`s). Queued with the observability pass.

### Orphaned zero-row tables (live sweep)

`ai_thesis_cache`, `asset_class_indices`, `index_returns`, `atlas_memory`, `atlas_sync_log`, `atlas_validation_log`, `cc_chats`, `cortex_paper_trades`, `equity_fundamentals_derived`, `opportunity_assessments`, `orders`, `org_members`, `users`. Most trace to findings 2.1/2.4 or Pass 1 items; `cc_chats`, `cortex_paper_trades`, `equity_fundamentals_derived`, `opportunity_assessments`, `ai_thesis_cache` need an owner-decision: wire a writer or drop (they fail the "no schema without a verified-writing counterpart" sign-off criterion).

### Queue additions from this pass

7. **GitHub Actions billing/spending-limit restoration (USER — cannot be done via API), then Actions-tier vs pg_cron consolidation decision.**
8. `sync-valuations` resilience: staggered slices, retry, non-200 + alert on zero-valued runs.
9. Post-merge verification: probe `/api/ledger-snapshot`, `/api/health`, `/api/ledger-export`; confirm SPY `max(price_date)` advances; then delete the 124 legacy `yahoo/1Day` SPY rows and consider dropping the redundant `price_history_unique_row` index.
10. `orders`/Ledger backfill from Alpaca order history for the 06-11 → fix window (if any live trades occurred).
11. Zero-row-table owner decisions (wire or drop): `cc_chats`, `cortex_paper_trades`, `equity_fundamentals_derived`, `opportunity_assessments`, `ai_thesis_cache`.

---

## Pass 2b — Post-merge verification of PR #689 + Vercel/Supabase env findings

**Date:** 2026-07-06 · **Scope:** live verification of the pass 2 fixes after merge; root-causing what the revived endpoints exposed.

### Verification of the ESM fix — PASSED (and immediately exposed a deeper bug)

After PR #689 merged and the production deploy went READY, all three previously-crashing
endpoints now **execute** instead of dying with `FUNCTION_INVOCATION_FAILED`:

- `GET /api/health` → `{"alpaca":"ok","supabase":"down",...}` (HTTP 503, but running)
- `GET /api/ledger-snapshot` → structured JSON error (HTTP 500, but running)
- `GET /api/ledger-export` → HTTP 500 JSON (running)

The errors they returned exposed finding 2.10.

### 2.10 Vercel↔Supabase env drift across SIX deployments of the same repo (CRITICAL)

**Discovery chain (all verified live):**

1. `ledger-snapshot` on `latest-atlas-code-o19a` failed with PostgREST `PGRST202`
   ("function `snapshot_decision_outcomes` not found in schema cache") and "SPY asset row
   missing". Both the RPC and the SPY row demonstrably exist in the real ATLAS project —
   calling the RPC on `vdmojjszvvcithuxwexx` via REST reaches it fine (it fails only on RLS,
   as expected for anon).
2. A **second Supabase project exists**: `supabase-green-field` (ref `jikbulixwvvfrirjpgra`),
   created 2026-04-05 under a **Vercel-integration organization**. It contains the ATLAS
   **Codex** schema (`codex_*`) plus an empty partial copy of the core portfolio tables
   (`assets`/`positions`/`transactions`/`price_history` — 0 rows; no ATLAS RPCs).
   No portfolio data has landed there — writes failed, nothing forked.
3. The Supabase Vercel integration **injects `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
   `SUPABASE_ANON_KEY` pointing at green-field** on the Vercel project(s) where it's
   installed (o19a at minimum). This is the store-locked-env problem the repo already
   documents in `inject-env.js` ("bypass store-linked SUPABASE_ANON_KEY that Vercel won't
   let you edit"), now biting the **serverless functions**, not just the frontend.
4. **Six Vercel projects deploy this repo** (`latest-atlas-code`, `-o19a`, `-9odn`, `-amyn`,
   `-aceu`, `altas_hub`) and `vercel.json` crons run on **each** of them. The real project's
   `sync_log` shows *paired* `options_snapshot` entries nightly (23:00:15 **and** 23:01:45) —
   at least two projects run every cron, with different env sets, so the same endpoint
   works from one deployment and hits green-field from another.

**Corrected timeline for the SPY freeze (supersedes the 2.2 "Failure B" explanation):**
`decision_outcomes` in the real project was last written **2026-06-01 22:00 UTC** — a run that
also carried SPY bars through 05-29 (the preceding Friday). The freeze cause was the env
redirect to green-field (integration connected ~June 2), then the ESM crash from 06-11
buried it. The overlapping-unique-index hazard described in 2.2 is real and the conflict-key
fix stands, but it was the *latent* bug, not the trigger.

**Fix applied (this branch):** the four repaired endpoints (`ledger-snapshot`, `health`,
`ledger-export`, `trading`) now resolve Supabase config **override-first, the same way the
working endpoints do**: `ATLAS_SUPABASE_URL || VITE_SUPABASE_URL || hardcoded ATLAS project`
for the URL (never trusting integration-injected `SUPABASE_URL`), `ATLAS_SUPABASE_SERVICE_ROLE_KEY
|| SUPABASE_SERVICE_ROLE_KEY` for the service key, and the existing `ATLAS_SUPABASE_KEY`
chain for anon. `health` additionally now probes `assets` instead of `system_health` — a
table that **does not exist anywhere**, so the old check reported `supabase: "down"`
unconditionally (a health check that could never pass).

**Remaining user actions:**
1. On any Vercel project whose `SUPABASE_SERVICE_ROLE_KEY` is the green-field key (o19a at
   minimum): add **`ATLAS_SUPABASE_SERVICE_ROLE_KEY`** with the real project's service key
   (Settings → Environment Variables). URL-side is already handled by the code fix.
2. **Consolidate the six Vercel projects** (or strip `crons` from all but one): every cron
   currently fires once per project — duplicated syncs, duplicated vendor-API spend, and
   env drift exactly like this. This should become its own audit-queue item.
3. Optional hygiene: uninstall/re-scope the Supabase Vercel integration so green-field vars
   stop shadowing ATLAS ones; green-field legitimately serves Codex (`atlas-cfa-study-terminal`)
   and should keep doing so.

**Verification still pending** (blocked on user action 1 for o19a; may already pass on the
project that holds real credentials): `GET /api/ledger-snapshot` → `ok:true, pricesUpserted > 0,
spyError: null`, and SPY `max(price_date)` advancing past 2026-05-29 in `price_history`.

### Queue updates

12. Consolidate Vercel deployments / dedupe `vercel.json` crons (see 2.10).
13. After user adds the override service key: re-probe ledger endpoints, confirm SPY series
    resumes, then run the queued item 9 cleanup (legacy `yahoo/1Day` rows + redundant index).
