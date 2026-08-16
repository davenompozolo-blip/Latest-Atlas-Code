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

### Sector ≠ theme (2026-08-11)
`position_themes` is the hand-kept theme taxonomy (14 themes; 48 of 54 held
names mapped). `nexus_holdings` always joined it; `vw_nexus_holdings` did not,
so the flagship displayed **sector** values under the heading "Theme" and the
spine grouped by sector while calling the buckets themes. Both feeds now carry
both fields, spine rows are keyed `label` + `dimension` rather than `theme`,
and the flagship toggles between the two cuts.

`theme` stays **NULL** for unmapped names — never coalesced to sector. The
spine reports the unmapped weight instead of quietly showing a smaller book.

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

### There are three schedulers, not one (audited 2026-08-16)
The line above — "pg_cron is the data path" — is true of the **Alpaca core**
and of nothing else. A full audit found scheduled work in three places:

| Scheduler | Where | Jobs |
|-----------|-------|------|
| pg_cron | `cron.job` | 9 — the Alpaca core, nexus refresh, validation |
| Vercel Cron | `vercel.json` → `crons` | 7 — ledger, valuations, options, dispersion, theme leadership, trade-sync ×2 |
| GitHub Actions | `.github/workflows/` | 2 — `atlas-fundamentals.yml` (12:30), `sync-funddata.yml` (14:00) |

Actions was retired **from the Alpaca sync path**, not from the platform.

**Only the pg_cron half is reliably firing.** The Vercel crons are the ones to
distrust: of the seven, only `options-snapshot` and `vol-dispersion-sync`
demonstrably produce rows. `theme_leadership_weekly` has **0 rows ever**,
`signal_scores` has exactly one date (2026-08-11, a manual run), and
`ledger_alerts` last wrote 2026-08-03. `api/trade-sync.js` writes **no
`sync_log` row at all**, so it fails completely invisibly — instrument it
before trusting any conclusion about whether it ran.

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
