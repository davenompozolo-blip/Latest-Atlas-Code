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
