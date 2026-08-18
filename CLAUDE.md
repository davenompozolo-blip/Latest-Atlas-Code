# ATLAS Terminal — Claude Code Context

## What This Is

ATLAS Terminal v10.0 — institutional-grade portfolio analytics platform built on Streamlit + Python.
Think: personal Bloomberg Terminal with quantitative analysis, valuation engine, and automated reporting.

## Architecture

```
atlas_app.py              → Main Streamlit entry (routing hub)
core/                     → Engine layer
  calculations.py         → VaR, CVaR, DCF, returns, attribution
  charts.py               → Plotly visualizations
  data_loading.py         → Portfolio data I/O
  fetchers.py             → yFinance, FRED, Alpha Vantage
  optimizers.py           → Portfolio optimization (MVO, Black-Litterman)
  constants.py            → Feature flags, shared config
ui/pages/                 → 25 page modules (performance, risk, valuation, etc.)
ui/components/            → Reusable UI (tables, metrics, badges, navigation)
navigation/               → Router, registry, sidebar, page handlers
api/                      → FastAPI REST layer (portfolio, optimization, regime, billing)
scheduler/                → Automated reports (weekly/monthly/quarterly)
data/instruments.py       → Market data dictionaries
config/branding.py        → White-label branding config
```

## Key Systems

| System | Entry Point | What It Does |
|--------|-------------|--------------|
| Streamlit UI | `atlas_app.py` | Portfolio dashboard, all pages |
| FastAPI | `api/main.py` | REST endpoints for external access |
| Scheduler | `scheduler/main.py` | Automated snapshot/commentary/attribution reports |
| Supabase | `supabase/` | Persistent storage (portfolios, positions, prices) |

## Running Locally

```bash
# Streamlit (primary)
streamlit run atlas_app.py --server.port=8501 --server.headless=true

# API server
uvicorn api.main:app --port 8000

# Full stack (Docker)
docker-compose up
```

## Data Flow

1. **Ingestion**: Alpaca API → Supabase (positions, transactions, prices)
2. **Fetching**: yFinance + FRED + Alpha Vantage → live market data
3. **Calculation**: `core/calculations.py` → all analytics
4. **Display**: `ui/pages/*` → Streamlit renders
5. **API**: FastAPI exposes calculations as REST endpoints
6. **Reports**: Scheduler triggers → email via SendGrid

## Conventions

- All pages are in `ui/pages/` and registered in `navigation/registry.py`
- Charts use Plotly with dark theme (matches `.streamlit/config.toml`)
- Constants and feature flags live in `core/constants.py`
- Table formatting uses `core/atlas_table_formatting.py`
- CSS is in `ui/branding/atlas_complete_ui.css`

## Remote Control Sessions

When operating Atlas via remote control, use these session roles:

| Session | Focus | Key Files |
|---------|-------|-----------|
| ATLAS-CORE | Valuation, calculations, optimization | `core/`, `api/routers/` |
| ATLAS-UI | Pages, components, styling | `ui/`, `navigation/`, `.streamlit/` |
| ATLAS-DATA | Ingestion, Supabase, fetchers | `core/fetchers.py`, `core/data_loading.py`, `supabase/` |

## Common Tasks

- **Add a new page**: Create in `ui/pages/`, register in `navigation/registry.py`, add handler in `navigation/page_handlers.py`
- **Add an API endpoint**: Create router in `api/routers/`, mount in `api/main.py`
- **Modify calculations**: Edit `core/calculations.py`, update tests
- **Update chart theme**: Edit `core/charts.py`, check `ui/branding/atlas_complete_ui.css`
- **Add scheduled report**: Create job in `scheduler/jobs/`, register in `scheduler/main.py`

## Data Trust Layer

### Sync System
Everything runs on Supabase `pg_cron` calling edge functions. GitHub Actions is
no longer part of the data path — `atlas-sync.yml` and `scripts/sync-wrapper.mjs`
were retired on 2026-08-09 (see below).

| Job | Schedule (UTC) | Writes |
|-----|----------------|--------|
| `sync-alpaca-positions` | every 5 min | `positions`, `account_snapshots` |
| `sync_alpaca_prices_daily` | 22:00 Mon–Sat | `price_history` |
| `sync_alpaca_transactions` | 13:10, 22:10 weekdays | `transactions`, `assets` |
| `refresh_holding_vol_trailing` | 22:25 weekdays | `holding_vol_trailing` |
| `atlas_run_validation` | 22:40 weekdays | `atlas_validation_log`, `atlas_sync_status` |
| `sync_portfolio_history_nightly` | 01:00 daily | `portfolio_equity_curve` |
| `refresh-nexus-holdings` | every 10 min | `nexus_holdings`, `mv_cortex_screener` |

- Edge functions log to **`sync_log`** (the live table). `atlas_sync_log` is a
  legacy table that has never received a row — do not read it for freshness.
- Current sync health in `atlas_sync_status` (single-row table, always ID=1)
- Critical validation failures auto-write to `atlas_memory` with
  category='bug', priority=2, on conflict **(category, key)**

### Validation Checks (`atlas_run_validation()`, 22:40 weekdays)
Pure SQL — every check is a database query, so there is no edge function, no
secret, and no HTTP hop in this layer.
1. `position_count` — positions exist for today and match transaction history
2. `nav_reconciliation` — calculated NAV vs broker equity (0.5% warn, 2% fail)
3. `snapshot_continuity` — no gaps > 3 days **between distinct snapshot days**
   (row-to-row would measure minutes, since snapshots land every 5 min)
4. `data_freshness` — last `sync_log` success within 24h (48h fails)
5. `price_coverage` — every traded day in the last 30 has a full price book
   (1–2 missing warns, >2 fails). SPY comes from an independent benchmark
   writer and is absent on real market holidays, so its presence marks a day
   the market traded; a date with a SPY bar but no holdings book is a hole.

**Do not "fix" a gap by failing `data_freshness` when a sync writes zero rows.**
`sync_alpaca_transactions` correctly writes zero rows on any day the book does
not trade — that is the healthy outcome, and making it critical would fire a
false alarm on most quiet days. Writing nothing is not the defect signal;
a traded day with no data is.

### Price sync must fetch a window, never a single day (2026-08-10)
`sync_alpaca_prices` defaults to `yesterday()` when the body carries no dates,
and the cron sent none while running weekdays only. Friday's close therefore
needed a Saturday run that never happened, and Monday's run spent itself
fetching Sunday. **Eleven Fridays, 2026-05-15 to 2026-08-07, had no price book
at all** — each showing a single SPY row and nothing else — and every existing
check passed throughout. The cron now sends a five-day window and runs Mon–Sat;
the upsert on `(asset_id, price_date, "interval")` makes overlap free, so a
missed night self-heals on the next run instead of leaving a permanent hole.
Backfilled 3,363 rows. The 10 remaining empty weekdays in the last 400 days are
all genuine US market holidays.

### Statement timeouts are per-role (2026-08-11)
`anon` is capped at 3s and `authenticated` at 8s — those are the roles the
terminal talks on, and a slow query there should fail fast rather than hang the
UI. `service_role`, held only by the Vercel functions and pg_cron, is set to
**300s** to match the `maxDuration` those functions already budget. The nightly
`refresh_universe_correlations` runs ~166s at its 400-symbol cap and was being
cancelled at ~54s with `57014` — silently, because the rollback took the delete
of the previous snapshot with it and left the old matrix in place. If a
maintenance RPC starts dying part-way through, check the role's timeout before
suspecting the query.

### Holdings views must filter price_history to held assets (2026-08-11)
Four views ranked or lagged over the **whole** price book to serve ~54 held
rows: `vw_portfolio_home` (4046 ms), `vw_quant_dashboard` (2721 ms),
`nexus_holdings` (1057 ms), `vw_quant_rolling_returns` (493 ms). Harmless at
84k rows; the Trade backfill took `price_history` to 481k and their cost is
linear in the size of the whole table, so they all grew ~5.7× at once.

`anon` is capped at 3s, so `vw_portfolio_home` began failing **every** call and
`vw_nexus_holdings` (which reads it) sat on the line. The UI never says "timed
out" — every loader catches and falls back, so the page reported *"Feeds
degraded"*, *"The bench cannot sit — holdings feed unavailable"*, *"No sector
P&L for this period yet"*. Those messages describe missing data; the data was
there and the query was being cancelled.

Fix is a pure pushdown — `AND asset_id IN (SELECT asset_id FROM latest_pos)`
inside the price CTEs, which every one of these views already computes before
it touches prices. `vw_screener` always did this and was the only one healthy.
Results are byte-identical; 4046→358 ms and 2048→138 ms.

**When adding a view over `price_history`, filter to the assets you will
actually return.** The table is now a 1,500-name universe, not the book.

**Sweep completed 2026-08-12.** The first pass grepped for `ranked_prices` /
`row_number() OVER (PARTITION BY … asset_id)` and so missed every view using
`lag()`, `max() OVER`, or `DISTINCT ON` — which was five more, including the two
behind Risk and Perf. All 16 views over `price_history` have now been *timed*,
not pattern-matched. Do that instead of grepping:

```sql
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m')
  and pg_get_viewdef(c.oid, true) ~* 'price_history';
```

Second batch: `vw_performance_suite` →379 ms, `vw_position_nav_daily` →560 ms,
`vw_quant_correlation` →1380 ms, `vw_quant_drawdown` →310 ms,
`vw_risk_analysis` 4984→46 ms. Still warm-ish but under budget:
`vw_forward_vs_spy` (~2.0s) and `vw_portfolio_nav_daily` (~1.9s, seq-scans
36k `account_snapshots` rows for 93) — watch these if the book grows.

**"No data available — run Alpaca sync first" and "Insufficient return history"
are timeout symptoms, not sync failures.** Check the view's runtime against the
role cap before touching the sync.

### A mean under the cap is not a fix — read the max (2026-08-18)
The two sweeps above were judged on the mean and declared done. They were not.
`pg_stat_statements` over real PostgREST traffic:

| view | calls | mean | **max** | cap |
|---|---|---|---|---|
| `vw_portfolio_home` | 303 | 944 ms | **2978 ms** | 3000 ms |
| `vw_nexus_holdings` | 50 | 600 ms | **2914 ms** | 3000 ms |
| `nexus_holdings` | 45 | 584 ms | **2901 ms** | 3000 ms |

Sitting *on* the ceiling, not under it. Every call landing on a colder buffer
cache was cancelled with `57014`. **This is what "different parts of Atlas
aren't feeding like clockwork" looks like** — the failures are per-call, so
they land somewhere different each load and never reproduce on demand.

```sql
select round(mean_exec_time::numeric) mean_ms, round(max_exec_time::numeric) max_ms,
       calls, left(regexp_replace(query,'\s+',' ','g'),90)
from pg_stat_statements where query ilike '%pgrst_source%'
order by max_exec_time desc limit 20;
```

**Use `LATERAL` top-N, not a date bound.** These views rank the entire history
of each held asset to read rows 1, 2 and 5 of it. A `price_date >= …` bound
looks like the obvious cut and is wrong: one held name's most recent bar is
158 days old, so any window short enough to help silently drops its price. A
lateral `ORDER BY price_date DESC LIMIT n` reads exactly n rows per asset off
`idx_price_history_asset_date_interval_uniq` (Index Scan Backward, no sort),
is exact however stale a name is, and does not care how big the table gets.
60,043 rows → 340. `vw_portfolio_home` 272–308 ms → 149–166 ms; `nexus_holdings`
→ 5–19 ms.

Prove equivalence before applying: keep the old definition under another name
and `EXCEPT` both ways in one transaction. A snapshot-vs-now diff will show
false positives — positions sync every 5 minutes, so `weight_pct` drifts by
±0.01 under you.

The one deliberate exception is `vw_portfolio_home`'s `returns`/`stats` CTE
(~470 ms, unbounded). `mu` and `sigma` are annualised vol and Sharpe over the
whole series, so bounding that window changes published numbers rather than
just their cost. Change it as a decision about the statistic, never as an
optimisation.

### Never page a shared table without a filter (2026-08-18)
`api/nexus-bench.js` fetched 95 days of `price_history` with **no symbol
filter**, ordered `price_date ASC`, stopping after 6 pages of 1000. The window
holds 89,262 rows across 1,513 symbols, so it read the oldest 6.7% and quit:
every tape stopped at 2026-05-20 while data ran to 2026-08-17, and three held
names got nothing. The page printed *"No price series in window — tape
unavailable"* for a name with 281 bars ending yesterday.

Scoped to the book it is 3,707 rows. `price_history` is a 1,500-name universe,
not the book — the same lesson as the views, in a different layer.

**Order DESC when paging a time series.** If a bounded fetch ever truncates
again it should lose the oldest rows, not the newest: a short tape is usable,
a stale one is a lie.

### Stale bars must not publish a move (2026-08-18)
KMTUY (2.03% of book), VWAGY, NPSNY and PROSY are OTC ADRs the price feed does
not cover; their last close is 144–158 days old. `nexus_holdings` flagged them
`stale` and went on publishing `today_pct` and `contrib_pct` from those bars,
so the Theme tab reported *"China internet (ADRs) −3.7%, NPSNY driving"* — a
sector attribution resting entirely on a print from March.

Those columns are NULL past **7 days**, and `price_days_old` is published so a
consumer can say why. 7, not the view's own 4-day `stale` flag: 4 is right for
badging a row but too tight to null a number on — a Thursday close before a
Friday holiday is 5 days old by Tuesday. **A flag beside a number nobody
checks is not a safeguard.** If the data cannot support the figure, the figure
is NULL.

### Sector ≠ theme (2026-08-11)
`position_themes` is the hand-kept theme taxonomy (14 themes; 48 of 54 held
names mapped). `nexus_holdings` always joined it; `vw_nexus_holdings` did not,
so the flagship displayed **sector** values under the heading "Theme" and the
spine grouped by sector while calling the buckets themes. Both feeds now carry
both fields, spine rows are keyed `label` + `dimension` rather than `theme`,
and the flagship toggles between the two cuts.

`theme` stays **NULL** for unmapped names — never coalesced to sector. The
spine reports the unmapped weight instead of quietly showing a smaller book.

**Two more sites found 2026-08-18, both server-side.** `api/nexus-theme.js`
selected and grouped by `sector` while the Theme panel joins the payload by
`theme`, and `api/nexus-bench.js` set the docket's `theme` field from
`h.sector`. The first was invisible because the two taxonomies *overlap*: only
`Financials` and `Energy` exist in both, so exactly those two themes resolved
and the other twelve read "momentum pending sync" — and the two that resolved
were showing the **sector's** number (Financials −1.8% where the theme is
−0.72%). A partial match is worse than none: it looks like a data gap rather
than a join bug.

When you fix one of these, grep for the *other* field too:
```bash
grep -rn "\.sector\b" api/ src/ | grep -i "theme"
```

### The 97-stock ceiling was a door, not a wall (2026-08-18)
The valuation house takes any symbol and resolves it live through
`/api/equity`; the trade ticket looks everything up per-symbol. Neither was
restricted. What was restricted was the *entry point* — both modules' search
boxes filtered rows their landing screen had already loaded, so a name outside
the curated list matched nothing, and TRADE's ticket tab was disabled outright
until you clicked a row.

`atlas_symbol_search(q, lim)` resolves over `assets` (7,860 active listings)
and returns capability flags per hit: `held`, `has_prices`, `has_valuation`,
`in_screener`. **The flags are the point** — "does this ticker exist" is rarely
the question, "will the stack do anything with it" is. Shared component at
`src/components/TickerSearch.js`.

Compute flags **after** the limit. Doing it per candidate row made a loose
query ("goldman") run a few hundred `price_history` probes to return twelve
rows: 1.99s against a 3s cap and inside a keystroke budget. Bounded by `lim`
it is 24–37 ms for every query shape.

Note that in TRADE a searched name clears `universeContext` rather than faking
it — the intent row should say the name came in by ticker, because it did.

### Key Tables
- `sync_log` — live sync history, written by every edge function
- `atlas_sync_status` — single-row current state (query with `.eq('id', 1)`)
- `atlas_validation_log` — all validation check results
- `atlas_sync_log` — **legacy, empty**; superseded by `sync_log`

### Why GitHub Actions was retired (2026-08-09)
All 30 `atlas-sync.yml` runs on record failed: Actions could not provision a
runner (`runner_id: 0`, dead in 3–5s). Once that was fixed, two further faults
surfaced — the workflow referenced secrets under names that did not exist, and
`sync-wrapper.mjs` wrote columns that do not exist on `transactions` and
`account_snapshots`. Its five sync legs were all duplicated by pg_cron, and its
validation layer had never written a row. Rebuilt on pg_cron rather than
repaired. **When adding a scheduled job, add it here — not to Actions.**

### There were three schedulers; now there is one (consolidated 2026-08-16)
Scheduled work used to live in pg_cron (9 jobs), Vercel Cron (7 in
`vercel.json`) and GitHub Actions (2 workflows). Only the pg_cron half fired
reliably: of the seven Vercel crons only `options-snapshot` and
`vol-dispersion-sync` ever produced rows.

**pg_cron is now the only scheduler.** `vercel.json` has no `crons` key and
both workflows are `workflow_dispatch:` only. The Vercel handlers were not
rewritten — pg_cron simply calls them over pg_net with the same
`Bearer CRON_SECRET` the Vercel scheduler used. Only the trigger moved.

**When adding a scheduled job, add it to `cron.job`. Nowhere else.**

### The nightly chain
Stages are staggered and **gated**, not simultaneous. A single sync point was
considered and rejected: these stages have real dependencies, and firing them
at one instant makes each read a table its upstream has not written yet —
non-deterministic staleness that looks exactly like the bug it would be meant
to cure.

| UTC | Stage | Gate |
|-----|-------|------|
| 21:00 | `chain_trade_sync_assets` | — (first) |
| 22:00 | `sync_alpaca_prices_daily` (Mon–Sat) | — |
| 22:10 | `sync_alpaca_transactions` | — |
| 22:25 | `refresh_holding_vol_trailing` | — |
| 22:30 | `chain_ledger_snapshot` | prices |
| 22:45 | `chain_trade_sync_all` (signals) | prices |
| 23:00 | `chain_options_snapshot` | — (Alpha Vantage sourced) |
| 23:15 | `chain_theme_leadership` (Fri) | prices |
| 23:40 | `atlas_run_validation` | — |

**Validation moved from 22:40 to 23:40.** At 22:40 it ran *before* the signals
job (22:45) and options (23:00), so it could never see the night it was
grading — it always reported on the previous day.

`atlas_chain_dispatch(stage, path, gate)` opens a `sync_log` row, checks
`atlas_prices_current()`, fires the request and stores the pg_net request id.
pg_net is asynchronous, so `atlas_chain_reap()` (every 15 min) closes the row
with the real status code. Without the reaper every HTTP stage would look
permanently 'running' — which is precisely how these jobs were invisible
before.

The secret lives in Vault, never inline in `cron.job.command`:
`select vault.create_secret('<value>', 'CRON_SECRET');`
Until it is set, every HTTP stage logs a clean `skipped` rather than a 401.

### Never write `duration_ms` on `sync_log` (2026-08-16)
It is `GENERATED ALWAYS` from `finished_at - started_at`. Including it in a
PostgREST payload makes the server reject the **entire** PATCH with `428C9`
*"column can only be updated to DEFAULT"*. Set `finished_at` and let the
column derive itself.

This single mistake is why 41 `sync_funddata_prices` rows sat open in
'running' back to 2026-06-05. The scrape always worked; only the close was
refused, and `sbPatch` swallowed the 400 in a `console.warn`. A second latent
bug sat behind it — the function wrote statuses (`succeeded`, `failed`,
`skipped_cache`, `debug`) that `sync_log_status_check` never permitted — but
the generated column failed first, so that one had not yet had a chance to
fire. `'skipped'` is now a permitted status and the function writes the real
vocabulary.

**A swallowed write failure costs months.** Log it at error level.

### Validation covers the whole platform now (2026-08-16)
`atlas_run_validation()` checked five things and all five were Alpaca. The core
was green every night while four feeds sat dark. Two checks were added:

- **`feed_coverage`** — reads `atlas_feed_status()`, one row per non-Alpaca
  feed. Staleness is measured against `atlas_last_traded_day()` (last session
  with a SPY bar), never `now()` — **a weekday feed is not late on a Sunday**,
  and measuring against wall-clock would fire every weekend.
- **`stuck_syncs`** — `sync_log` rows open more than 6h. Caught 41, oldest
  2026-06-05, from `sync_funddata_prices` and `sync_alpaca_positions`.

Both cap at **warning, never critical**, on purpose. `critical` increments
`consecutive_failures` and writes an `atlas_memory` bug row nightly; two of the
four gaps are subscription problems no retry can fix, and a red light that can
never go green is one you learn to ignore. Raise a feed to critical only once
its pipeline is actually capable of succeeding.

### Known-dead feeds (as at 2026-08-16)
- `vol_dispersion_daily` — **0 rows ever**. `api/vol-dispersion-sync.js` needs a
  *premium* Alpha Vantage key (~100 `HISTORICAL_OPTIONS` pulls per run); the key
  in use returns `"This is a premium endpoint"`. 10/10 runs failed. Not fixable
  in code — the Nexus Dispersion page has never had data.
- `theme_leadership_weekly` — 0 rows ever.
- `signal_scores` — frozen at 2026-08-11. **This starves the Trade ticket's
  coherence pane**; Pane C renders "NO FAMILY VECTOR ON FILE" once it ages out.
- `sync_funddata_prices` — the job *works* (`fund_prices_raw` is current), but
  its terminal `sync_log` PATCH goes through PostgREST and the failure is
  swallowed at `supabase/functions/sync_funddata_prices/index.ts:44`
  (`console.warn`), so every run leaves an open row.

**A single simultaneous sync point is the wrong fix.** These jobs have real
dependencies — prices must land before vol, vol before validation, signals
after both — and firing them at one instant makes each read a table its
upstream has not written yet. That is non-deterministic staleness, which looks
exactly like the bug it was meant to cure. What the platform wants is one
*ordered chain* under one scheduler, each stage gated on the previous. The
22:00–22:45 window is already nearly that; it is just split across pg_cron and
Vercel with no ordering guarantee between them.

### Sync Status UI
- `src/components/SyncStatus.jsx` — React component for terminal header
- Shows live health indicator (green/yellow/red) with expandable detail panel
- Auto-refreshes every 5 minutes

### Streamlit
Retired. React terminal on Vercel is the single source of truth for all portfolio analytics.
Archive branch: `legacy/streamlit-archive`
Retirement script: `scripts/retire-streamlit.sh` (run after confirming full view parity)
