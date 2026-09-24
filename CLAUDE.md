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
| `sync_market_series_daily` | 22:50 Mon–Sat | `market_prices` |
| `refresh_factor_scores_nightly` | 23:10 Mon–Sat | `factor_axis_scores`, `factor_pair_zscores` |
| `sync_alpaca_prices_universe` | 23:20 Mon–Sat | `price_history` (non-held universe) |
| `atlas_feed_reconciliation_nightly` | 23:25 Mon–Sat | `sync_log`, `atlas_validation_log` |

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
- `atlas_sync_log` — **legacy, still 0 rows ever**; superseded by `sync_log`.
  It was empty for a reason worth knowing: `sync_fundamentals` was *writing to
  it* on ten cron fires a week and every write was rejected. See the audit entry
  below. **An empty legacy table is not proof nothing targets it.**

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
| 22:50 | `sync_market_series_daily` (Mon–Sat) | — (Yahoo sourced, ungated) |
| 23:00 | `chain_options_snapshot` | — (Alpha Vantage sourced) |
| 23:10 | `refresh_factor_scores_nightly` (Mon–Sat) | `backfill_market_prices` success today |
| 23:15 | `chain_theme_leadership` (Fri) | prices |
| 23:35 | `refresh_position_returns` | — |
| 23:37 | `atlas_write_verdicts` (Mon–Fri) | positions snapshot current |
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

### The price sync covers the book; the universe needs its own run (2026-08-23)
`sync_alpaca_prices` builds its symbol list by joining `positions`, so it
prices what is held — ~67 names — and nothing else. `price_history` holds
~1,523. The other ~1,441 arrived in the one-off Trade backfill and then had
**no writer at all**: every non-held name froze at **2026-08-10** and stayed
frozen for eleven sessions.

| | symbols | median last bar |
|---|---|---|
| held | 82 | 2026-08-21 |
| universe, not held | 1,441 | **2026-08-10** |

The job never failed. Seventeen consecutive nightly runs, every one `success`,
1.3–3.9s, 228–330 rows. **This is what "inconsistent across components" looks
like from the writer side** — anything reading a held name was correct, while
the screener, valuation comps, bench peers, correlation inputs and ticker
search's `has_prices` flag served prices up to eleven sessions old. No error
anywhere, so it read as flakiness rather than as a stopped feed.

`price_coverage` could not see it. It counts holdings only — *"Every traded day
in the last 30 has a price book (70 holdings tracked)"* — so it passed,
correctly, every night throughout. **A check scoped to the book cannot see the
universe stop.** Same lesson as the views and the bench pager, now in a third
layer.

Fixed with `scope: 'universe'` on the edge function (symbols derived from
`price_history` itself plus `equity_screener_universe` — 1,724 names, the set
someone already decided was worth storing, so it self-maintains as backfills
add names; options excluded because they expire). New cron
`sync_alpaca_prices_universe` at **23:20 Mon–Sat**, clear of the 22:30–23:15
trade chain. Backfilled 17,019 rows; universe median is now level with the book.

`universe_price_coverage` measures the universe against **the book's newest
bar**, never `now()` — same reason `feed_coverage` uses
`atlas_last_traded_day()`: a weekday feed is not late on a Sunday.

**`sync_log.details.scope` now records which set a run covered.** Without it a
book run and a universe run are indistinguishable, and *"success, 260 rows"*
reads fine until you know it should have been 1,700 symbols.

### Three traps found fixing `vw_position_nav_daily` (2026-08-23)
6,161 ms → 557 ms. It was the heaviest read in either the Performance or Risk
module, and the substrate the return engine is built on.

**1. A plain equijoin to `price_history` needs bounding too.** The final
`LEFT JOIN price_history ph ON ph.asset_id = dh.asset_id AND ph.price_date =
dh.cal_date` hashed the **entire 496,553-row table** (8 batches, spilling to
disk) to serve 10,207 rows for 99 held assets — 4,244 ms of the 6,161. The
2026-08-11 sweep missed it because it looks for ranked CTEs, and this is an
ordinary join. Replaced with a `LATERAL … LIMIT 1`: 10,207 unique-index probes
at ~0.003 ms. **Grep for the table, not for the pattern.**

**2. A scalar subquery is evaluated once per reference, not once per row.**
`quantity` was a correlated scalar subquery used three times — in `quantity`,
in `position_value`, and in the `WHERE`. The plan showed SubPlan 3, 4 *and* 5:
32,255 executions for 10,207 rows, ~1,030 ms. Postgres does not memoise across
references. **Use it more than once, promote it to a `LEFT JOIN LATERAL`.**

**3. `Index Only Scan` with non-zero `Heap Fetches` is not index-only.**
`trading_days` showed **Heap Fetches: 70,163** — a stale visibility map, so
every "index-only" row still visited the heap. `VACUUM (ANALYZE) price_history`
took it to 0 and dropped the per-row probe from 0.010 ms to 0.003 ms. The same
vacuum took **`vw_risk_analysis` from 1,362 ms to 327 ms with no view change at
all.** `price_history` gains ~1,700 rows a night from the universe sync, so
check `Heap Fetches` before rewriting a view — the table may just need a vacuum.

**Never benchmark a view rewrite with `select count(*)`.** It lets the planner
elide the very joins under test: the old and new definitions here measured
1,124 ms vs 983 ms on `count(*)`, and 6,161 ms vs 557 ms on the real workload.
Use `explain analyze select *`, or `count(*)` over a subquery that forces
materialisation.

### "Doesn't load on the first pass" is a cold-cache timeout (2026-08-23)
`vw_portfolio_nav_daily` measured **4,850 ms warm** against anon's 3s cap, so it
failed on every call — and *which* components came up depended on the buffer
cache, not on the data. That is the whole signature of "some panels load, some
don't, reload fixes it".

EXPLAIN put **3,098 ms of a 3,110 ms run in a single node**: a Seq Scan on
`account_snapshots` removing 39,854 rows to find 141. The filter was

```sql
WHERE (as_of)::date = CURRENT_DATE      -- unsargable: casts the column
```

`account_snapshots_portfolio_as_of_idx (portfolio_id, as_of DESC)` **already
existed** and could never be used. The fix is a half-open range on the raw
column; no new index. **3,110 ms → 246 ms.**

**Never wrap a column in a cast or function in a WHERE clause.** Range the raw
column instead. Find them with:

```sql
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m')
  and pg_get_viewdef(c.oid,true) ~* '\([a-z_]+\)::date\s*(=|<|>)';
```

This one also degrades on a timer with no code change: positions sync every 5
minutes, so `account_snapshots` gains ~288 rows a day whether the book moves or
not. **A seq scan over an append-only table is a clock, not a constant** — it
will cross any cap eventually, and the day it does is unrelated to any deploy.

`vw_performance_suite` is the next one. 1,960 ms on a cold run, 493 ms warm —
under the cap warm, and that gap is exactly the exposure. Its dominant node is
a Unique over a Sort of **59,767 rows spilling to disk** (`external merge Disk:
2440kB`) to return 63: the full-history `DISTINCT ON (asset_id … price_date
DESC)` pattern this file already says to replace with a LATERAL top-N. It reads
60,850 rows for 63 answers, and it grows every night now that the universe
syncs. Not yet fixed.

### PostgREST caps at 1,000 rows whatever `limit` says (2026-08-23)
`api/nexus-theme.js` asked for `order=price_date.asc&limit=20000`. PostgREST
returned **1,000 rows, all stamped the same single date** — the oldest 1,000 in
the window — and dropped everything after. `priceAsOf` published **2026-07-08**
while the book's newest bar was **2026-08-21**: theme momentum and every factor
beta were computed on a tape that stopped six weeks early, with no error and
nothing in the shape of the data to give it away.

`limit` is a request, not a guarantee. **Order DESC and page.** This is the
same rule already written down for `api/nexus-bench.js` and it was not applied
here — check every PostgREST read of a time series, not just the one that broke:

```bash
grep -rn "order=.*\.asc" api/ | grep -i "price\|date"
```

### A no-op must not answer 200 (2026-08-23)
`chain_theme_leadership` ran on 2026-08-21, logged **success**, and wrote
nothing. `theme_leadership_weekly` has 0 rows ever while the chain reported
healthy every night.

`atlas_chain_reap()` grades stages by HTTP status and does so correctly. The
handler returned `200 {ok: false, written: 0}` on its no-data path, so a no-op
was indistinguishable from a write. The upstream launders it twice:
`/api/nexus-theme` answers **200 with `themes: []`** both when the book is
empty and when its own query throws, so a degraded upstream produced a green
stage downstream.

Both no-data paths now answer **503**. A weekly job that silently skips costs a
week each time.

`snapshot_date` is also refused past 10 days old — a weekly history keyed on a
stale date is worse than a gap, because the row reads as a real observation of
that week forever after.

### The chain's target host lives in Vault, not in the function (2026-08-23)
`atlas_chain_dispatch` hardcoded `https://latest-atlas-code-o19a.vercel.app` —
one of eight Vercel projects, inside a `SECURITY DEFINER` body. Renaming or
pausing that project silently redirects or kills every scheduled write, and a
stale-but-live deployment would keep logging success while running old code.

`atlas_chain_base()` reads `CHAIN_BASE_URL` from Vault and falls back to that
same host, so moving the chain is one secret and no code:

```sql
select vault.create_secret('https://<host>', 'CHAIN_BASE_URL');
```

No trailing slash — paths are concatenated and `//api/...` 404s. Each stage now
records the host it hit in `sync_log.details.base`.

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
- `theme_leadership_weekly` — **recovered; this entry was wrong and is corrected
  2026-09-13.** It has written on cadence since the 503-on-no-op fix and carries 56
  rows to 2026-09-11. The 0-rows-ever claim above described 2026-08-16 and was left
  standing after the feed came back. **A wrong dead-feed entry is worse than no
  entry** — it teaches the next session to distrust a feed that works. The two
  entries above that cite it as an example of a silent no-op are still accurate
  about what happened then; only its current state changed.
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

### A cancelled order is not a transaction (2026-08-24)
`transactions` holds 9 rows with `price IS NULL` / `notes = 'canceled'`. Two
carry a real quantity, and **every consumer counted them**: the ledger claimed
1,500 shares of IBIF the broker has never held, and 150.58 UAE against the
broker's 100.58. $975 of phantom value — 0.60% of NAV, under the 2% at which
`nav_reconciliation` fails, so nothing ever went red.

The date damage was worse. `first_buys` takes the earliest row, so a cancelled
order became the entry date for **three** positions. UAE published
`days_held = 177` on a position held 81 — three days from `cut_candidate_flag`,
which fires past 180. TSLA's cancelled row had no price, so
`COALESCE(first_buy, average_cost)` fell back to average cost and TSLA alone
was measured on a different basis from every other position: **−14.04% became
−20.70%** once its real first fill (457.50 on 2026-01-02) was used.

Read **`vw_filled_transactions`**, never `transactions`, for any quantity,
cost, return or cash-flow computation. Filter on `price IS NOT NULL`, not on
`notes` — a priceless row cannot participate in a cost whatever the broker
called it. These 9 rows are legacy (an orders-based import, March); the live
sync requests `activity_types: 'FILL'` and cannot produce more.

### The ledger must be reconciled per position, not just per book (2026-08-24)
`nav_reconciliation` compares total NAV against broker equity. That passes
while individual names are wrong, because errors net out. Reconciling
ledger-derived quantity against `positions` per name found **four** breaks, all
exact round lots — PBR −500 sh, GDX −100 sh, NPSNY +27 sh, plus OILK's missing
opening. **Round-number divergence means missing transactions, not drift.**
`vw_position_returns.engine_status = 'ledger_mismatch'` now refuses to publish
a return for those names: a cash-flow return over a schedule missing a
500-share buy is not approximately right, it is unanswerable.

`transactions` begins 2025-12-29 and some positions predate it, so this will
never be zero — treat it as a permanent gate, not a bug to close.

### Return-engine traps (2026-08-24)
- **Solve MWR over the holding period, not annualised.** An annualised root
  leaves any sane bracket on a short window: CRWV (−6.35% over 2 days) fell
  below −0.9999 and OILK (+3572% over 3 days) rose above 100, so a
  conditioning failure read as an undefined rate. Normalise the exponents to
  the window and derive the annualised figure from that root.
- **MWR is annualised by construction**, so it explodes on short holds exactly
  as `annualised_return` did: AMGN's +6.18% over 7 days is **+2,182.99%**. Same
  90-day floor applies.
- **Date the terminal mark at the valuation date, never the price date.** KMTUY
  has buys three months after its last close; dating the mark at the price date
  put it mid-schedule and returned −79.27% on flows summing to +$956.
- **`asset_class` is `'us_option'`, not `'option'`.** Equality misses every
  contract. Test the class prefix *and* the OCC symbol shape — either alone has
  been wrong here. `vw_performance_suite` still carries the equality test and is
  only saved by starting from `positions`.
- **Own return is priced at fills; a counterfactual has no fills.**
  Differencing them folds execution into stock selection — SNDK 18.71pp, AMD
  11.93pp. Publish the position on a close basis too and difference *that*;
  the gap between the two is the execution effect, which is worth having.

### Return basis is one shared control (2026-08-24)
`atlas.return.basis.v1` selects SINCE ENTRY vs MWR and is **shared** across
Performance and Nexus — the opposite of `atlas_brinson_bench`, which the memo
says to namespace. The rule is the same in both cases: share a control when the
two surfaces are answering the same question, namespace it when they are not.
"Time-weight my return by when the money was in, or don't" is one question.

**The toggle never falls back across bases.** 5 positions have no MWR and 3
have no SINCE ENTRY figure, and the sets do not overlap; substituting one for
the other would produce a mixed-basis column with nothing on screen to say so.
A row that cannot be measured on the active basis shows a reason.

It changes rankings, not just labels: Worst Performer is **MRVL** on SINCE
ENTRY and **TSLA** on MWR.

Brinson stays on SINCE ENTRY whatever the toggle says, and is badged `ON SINCE
ENTRY` when they differ — `computeBrinsonAttribution` is shared with Nexus beat
07, so re-basing it here would silently re-base a module nobody asked to
change. That is step 5.

### The verdict layer: three tiers, and what each is for (2026-08-26)
`position_verdicts` is a **history**, not a view — a row records what was known
on `as_of` under `logic_version` and is never updated. That single property
drives most of the design decisions below.

| Tier | Basis | Coverage | Question |
|---|---|---|---|
| 1 | Cluster median, ρ ≥ 0.75, n ≥ 5 | 17 of 57 | Right name among substitutes? |
| 2 | Rest of book at prevailing weights | 56 of 57 | Earned its slot against my alternatives? |
| — | Frozen weight (do-nothing) | 77 of 82 | Did my trading add anything? |

`peer_basis` records which tier produced the score. **Never fall back between
tiers without recording which was used.**

The book has no peers by construction — single names, ADRs, sector ETFs, bond
funds, commodity trackers. 24 of 57 open positions have no correlate above ρ
0.65; the median position's best correlate is 0.662. That is a portfolio
property, not a data gap, and it is why Tier 2 is the primary basis. **Do not
loosen ρ to manufacture peers** — a name at 0.66 is the sector-label claim the
brief already rejected, with a number attached.

**Two different cluster objects, deliberately not merged.** Tier 1 ranks
against a *neighbourhood* (every name at ρ ≥ 0.75; overlapping, 17 names).
`cluster_risk_share` needs a *partition* (`universe_clusters`, avg-linkage, one
bucket per name, shares summing to 1) so the position → cluster → book chain
closes. Using the neighbourhood for the risk share is what would break the
identity. Different columns on purpose.

**Effective bets: 3.87** across 19 risk clusters, against memo v2 §2.8's
predicted five or six. 57 positions, four bets.

**The do-nothing book beats the traded book**: traded +11.37%, frozen +12.73%,
trading effect **−1.37pp** over 77 positions. Per position 36 helped, 41 hurt,
median 0.00pp — most trades did nothing and the tail is mildly negative.

### Invariants belong in constraints, not only in the job (2026-08-26)
Rev. B §6 asked for the verdict invariants to be "asserted in the nightly job,
failing loudly". Every rule that is a predicate over a *single row* is a CHECK
on `position_verdicts` instead. The memo's own argument for writing these
columns from row one is that a history cannot be backfilled — so a constraint
the job cannot forget beats an assertion it might.

Impossible, not merely discouraged: a `cut_candidate` on an unmeasurable
position, an annualised return under 90 days held, a cluster verdict over two
names, an eligibility claim at ρ 0.65, a reason code with no measurement behind
it, `switch_to_cluster_leader` on the book tier, and an
`evidence_own_return_known` that disagrees with `verdict_status`.

Only two rules span rows and stay in the job: `sum(cluster_risk_share) = 1.0`,
and **no verdict row while `positions` is behind the last traded day**. The
second is the step 4 blocker in permanent form.

`supabase/tests/position_verdicts_constraints.sql` proves all of it — ten
violating inserts refused plus one well-formed row accepted, whole thing rolls
back. **Always include the happy-path case**: a wall of CHECKs that also blocks
legitimate writes is worse than no CHECKs.

### A no-op must not answer 200 — second instance (2026-08-27)
`atlas_write_verdicts`'s first scheduled run logged **success with
rows_written = 0**. Benign that night — the 57 rows for that `as_of` already
existed from an earlier manual run the same UTC day, and
`ON CONFLICT (as_of, asset_id, logic_version) DO NOTHING` skipped them all.

The defect is that the job could not tell that apart from producing nothing.
An empty `positions`, a broken join, or any later change that made the
`INSERT ... SELECT` return no rows would log the identical shape. Exactly what
`chain_theme_leadership` did for weeks while `theme_leadership_weekly` never
received a row.

Three outcomes now, and `rows_present` is logged beside `rows_written` so they
are readable apart without re-deriving anything:

| written | present | status |
|---|---|---|
| > 0 | — | `success` |
| 0 | > 0 | `skipped`, "already written for this as_of" |
| 0 | 0 | `error` + RAISE |

**The idempotent re-run is no longer dressed up as a successful write.** That
middle row is the ordinary case and saying `success` for it is what hid the
third.

### A gate that can never pass is one you learn to ignore (2026-08-26)
The verdict job's preflight is three checks, and each one had to be *scoped* to
be useful. Written literally, two of the three would refuse the job every night
forever.

**Freshness and coherence are different gates catching different failures.**
The 08-24 phantom rows carried a **current** snapshot date — `positions` was
synced, dated correctly, and wrong in content. Any date comparison passes that
cleanly. Only reconciling broker quantity against the ledger catches it.

- `positions_freshness` compares to `atlas_last_traded_day()`, **never
  `CURRENT_DATE`** — a calendar comparison refuses every Saturday, Sunday and
  market holiday, and gaps in an append-only history cannot be backfilled.
- `ledger_coherence` fires only on the **phantom signature**: broker holds a
  non-zero quantity the ledger says was sold out. "Every symbol must
  reconcile" fails on 12 permanent rows — GDX (−100) and PBR (−500) predating
  the ledger start, plus 10 broker-closed rows that are mostly expired options,
  where expiry is not a transaction so the opening buy has no closing row.
  Both classes are already gated per position by the engine.
- `matrix_coverage` refuses only for a name with a **live** feed that is
  missing. KMTUY has 7 bars in a 120-day window against a 60-bar minimum, so no
  correlation pair is mathematically possible — a fact about its feed, not the
  400-symbol cap, and the same dark feed that already makes it `stale_mark`.

**`refresh_universe_correlations` already pins held names** —
`held UNION liquid(LIMIT n) UNION 'SPY'` — so the cap has always applied to the
candidate remainder. Pinning cannot fix a name with no returns to correlate.

`supabase/tests/verdict_preflight_forced_failures.sql` forces both failures in
a rolled-back transaction. **"Has not been observed failing" is not a test**,
and in FORCE 2 freshness still passes while coherence refuses — which is the
whole argument for having both.

### The ledger and the tape can price different shares (2026-08-26)
The frozen-weight baseline published **DD at +229.75%** against a tape that
went 122 → 136. DD's ledger fills are at 41.24, 49.48 and 47.06 while the tape
reads 122–148 on those same dates; its final fill at 138.75 matches exactly. An
unadjusted corporate action left the two **pricing different shares**, ~1:3.

Anything multiplying ledger quantity by tape price is fabricated for such a
name — which includes the return engine's own terminal mark. DD is the **only
equity affected** (9 of 10 fills). The other three hits are option contracts,
where one fill against a thin contract tape can differ by a lot without either
being wrong, so options are excluded — testing the class prefix **and** the OCC
symbol shape, since either alone has been wrong here before.

`vw_position_price_basis` is the shared check. Consumers **refuse** with
`basis_mismatch` and the observed ratio rather than guessing an adjustment
factor: a fabricated benchmark is worse than a missing one, because the traded
book is graded against it.

**Gated in the engine as of 2026-08-26**, not per consumer — a gate applied at
the consumer is missed by the next consumer. `basis_mismatch` is its own
`engine_status`, ranked after `ledger_mismatch` (if the quantities disagree
nothing downstream is safe) and never folded into `stale_mark`: a stale mark
self-heals when the feed returns, a basis mismatch needs a corporate-action
adjustment and never does. DD moved measured → `basis_mismatch`; measured
positions 82 → 81. It is closed, so no open position is affected today.

This was the third instance of one pattern — `search_path` on the engine
functions, the phantom `positions` rows, and this — each deferred on a version
of *nothing currently needs it*. The first two both went on to fail. **A
dormant defect costs nothing to fix while the context is loaded.**

### Never rank on regret; the leader is often leveraged (2026-08-26)
`cf_best_symbol` is **SOXL** — a 3× semiconductor fund — for five of the
seventeen cluster-eligible positions. A levered fund takes a levered share of
any move that went the right way, so it tops the cluster on any tape that rose.
This is why `regret_vs_best_pct` is display-only and never a sort key: ranking
on it grades leverage and luck.

`switch_to_cluster_leader` is gated on **measured volatility**, not a name
match — a deny-list of "3X"/"Ultra"/"Bull" strings would miss the next one and
flag an innocent fund. A leader above 1.5× the position's own annualised vol is
not a like-for-like substitute whatever it is called, and the reason code falls
back to `cut_underperforming_comparables`.

Verdict labels use **absolute bands, not quantiles**. A quantile rule forces a
fixed share of the book to be cut candidates every night however the book
actually did — a ranking dressed as a verdict.

### Excluding one name from the book costs one scan, not n (2026-08-26)
The Tier 2 counterfactual needs "the book without asset i" for every i.
Computed independently that is O(n²·T). It does not need to be — with
S(t) = Σ wⱼrⱼ and F(t) = Σ wⱼ over names priced that day:

```
r_ex_i(t) = (S(t) − w_i(t)·r_i(t)) / (F(t) − w_i(t))
```

One pass of `mv_book_daily_weights` yields every exclusion. 8,732 rows in,
14,190 out; the whole 86-position counterfactual runs in 543 ms. Guarded at
`F − w_i ≥ 0.02` — the rest of the book is not an alternative when the excluded
name *is* most of the book.

Sanity check any such construction against the whole book: ex-AMD +17.94% vs
+21.86% (removing a big winner must cost), ex-GOOGL +21.87% (a name that
performed in line must not move it).

**Book returns come from consecutive bars, never from `vw_position_nav_daily`'s
close.** That close is a LATERAL top-1 on `price_date <= cal_date`, so a name
with no bar carries the last one forward and differencing it reports a 0.00%
move for a name that did not trade — publishing a move off a dead print. A name
with no bar gets no row and is renormalised out instead.

### `universe_correlations` does not cover the book (2026-08-26)
It holds ~420 symbols of a ~1,500-name universe, and inclusion is **not
guaranteed for held names**: coverage of the open book went 71 → 70 → 67 over
three days as the cap churned. Today only KMTUY is missing, and only because
its feed is dark, so nothing is lost.

But a held name dropping out silently would read as *"no close peer"* when it
means *"not measured"*. `absent_from_matrix` is published to keep the two
apart. Watch it; not fixed.

`best_correlate_rho` is scoped to the **open book** — §2.5 asks how
differentiated the book is, and a sold name is not an alternative you hold.
Tier 1's peer set is scoped to the **whole matrix** — a substitute you could
have bought counts whether or not you owned it. Opposite scoping, on purpose.

### `vw_nexus_holdings` publishes two returns and Nexus uses both
Unlabelled, and they disagree in sign:

| | `total_return_pct` | `unrealised_return_pct` |
|---|---:|---:|
| AMD | +134.89% | +15.04% |
| MU | +8.28% | **−16.43%** |
| SNDK | +12.91% | **−18.11%** |

`total_return_pct` is return since the first fill (identical to
`vw_performance_suite` — the two modules' return columns **do** agree).
`unrealised_return_pct` is the mark against average cost on what is still held.
The holdings table uses the first; winners/losers/at-risk
(`nexusLiveCompute.js` ~265) and the Portfolio panel's "total return" line
(~312) use the second. So a name can be counted a loser in the summary and
show green in the table.

**Fixed 2026-09-05 — see the next entry.** Both are kept; what changed is that
each surface now declares which one it is on, and no site substitutes one for
the other.

### Name the basis, and never substitute across it (2026-09-05)
Six sites read `vw_nexus_holdings`' two return columns and every one called
its result "total return":

| site | read | called it |
|---|---|---|
| `nexusLiveCompute:80` | `total_return_pct` | the "Total ret" column |
| `nexusLiveCompute:265` | `unrealised ?? total` | winners / losers / at-risk |
| `nexusLiveCompute:312` | reconstructed from ↑ | the Portfolio panel headline |
| `nexusRealizedCompute:184` | `unrealised_return_pct` | `totalPct` |
| `api/nexus-bench:210` | `unrealised ?? total` | `totalReturnPct` |
| `nexus-page:887, 927` | `total_return_pct` | "Total return" / "Total Rtn" |

`src/lib/nexusReturnBasis.js` names them `since_entry` and `on_cost`. Its
reader takes no fallback argument — **the substitution is impossible to write,
not merely discouraged**, which is the only version of that rule that survives
the next edit. Labels come from the basis, so a figure cannot be rendered
without saying which question it answers.

**Two of the six silently fell back across bases.** That is what
`atlas.return.basis.v1` already forbids in Performance, in a module that never
got the rule. The fallback was latent — all 61 rows carry both figures, so no
number on screen was wrong because of it — and was removed anyway, on the same
reasoning as the price-basis gate: a dormant defect costs nothing to fix while
the context is loaded, and this codebase has three entries about ones deferred
on *nothing currently needs it* that went on to fail.

**The old test fixture proved the fallback was load-bearing.** `nexusPortfolio.test.mjs`
supplied only `total_return_pct` and passed because `buildPortfolioSnapshot`
fell through to it — so the suite could not tell the two measures apart. It now
carries both columns with values chosen so reading the wrong one changes the
answer: PROSY is −28% on cost and +12% since entry, so a regression flips
`losers` and `atRisk` to zero and fails three assertions at once. **A fixture
that supplies only one basis cannot detect a basis bug.**

Re-measure before quoting figures here. The entry above quotes AMD/MU/SNDK
numbers the book has since moved past; on 2026-09-05 the sign disagreements are
PBR, SNDK, MU, HAL, C, AVGO, META and PG — 8 of 61, widest gap 75.6pp, and META
is the split in reverse (−6.22% since entry, +2.82% on cost).

`totalReturnPct` survives as a key on the row shape and as a deprecated alias on
the snapshot. That is deliberate: `NexusFlagship` sorts and re-bases on that
name and is being rewritten in parallel, so the basis is carried by
`returnBasis` and the label rather than by a wide rename through a moving file.

### Rates do not add up; dollars do (2026-08-31)
The trading-effect drill-down under the do-nothing tile. `book_risk_daily`'s
`trading_effect_pct` is an MWR over **pooled** cash flows — every eligible
position's traded flows in one schedule, the frozen flows in another — so it is
not a weighted average of the per-position rates and **no weighting recovers
it**. Summing the 77 per-position rates gives **−160.76pp** against a book
effect of **−1.03pp**, a factor of 156.

What decomposes exactly is money: traded gain minus frozen gain per position
sums to **−$4,033.49** against the book's own −$4,033.51. `trading_effect_usd`
is therefore the sort key and the rate column is context beside it.

The two disagree per position, and the disagreement is not an error: TSM is
**+$372 and −6.7pp**, EWY **+$322 and −2.5pp**, 11 rows in all. The traded path
deployed more capital than the frozen one ($279,639 against $182,087), so
adding to a name that kept rising makes more money at a lower rate. Both
readings are true. `effects_disagree` marks them rather than letting a reader
assume one question. Same rule as `regret_vs_best_pct`: there, ranking on the
wrong column graded leverage; here it would grade capital deployed.

**The finding: selling is what cost the money.** Exits −$4,020.58 over 21
positions, resizing −$12.91 over 42, untouched $0.00 over 14.

### A history scoped to the open book cannot explain the whole book (2026-08-31)
`position_verdicts` writes 57 rows a night — open positions only. The frozen
baseline compares **77**, and the 21 closed exits absent from that history
carry **−$4,020.58 of the −$4,033.49**. The 56 open rows that *are* in it net
−$12.91.

So the obvious substrate for the drill-down — the aligned append-only history,
which already carries `trading_effect_pct` per row — is blind to essentially
100% of the number it would claim to explain, and would render a column of
near-zeros with nothing to say anything was missing. `vw_position_trading_effect`
reads the live `vw_position_frozen` instead and publishes **its own `as_of`**
beside the tile's, because a live read under a nightly headline is the
mixed-basis failure again. `alignment()` in `src/lib/tradingEffect.js` says
which is which and never reconciles them.

Third instance of one shape, after `price_coverage` counting holdings while the
universe froze, and `nexus-bench` paging the whole price book. **A measure
scoped to one set cannot see what happens outside it.**

### An untouched position's effect is zero by construction (2026-08-31)
14 positions were bought once and never traded, so their frozen path *is* their
traded path. `atlas_mwr_period` bisects to a tolerance and
`position_mwr_period_pct` stores 6dp, so the subtraction lands on ~1e-7 with an
arbitrary sign — fourteen rows of meaningless ±0.00004pp sorted against each
other.

The snap test is **structural** (one transaction, still open), never a
magnitude floor, and the data is why: the largest untouched residual is
**4.66e-7** while the smallest genuinely-traded effect is **3.98e-8**, an order
of magnitude *below* it. Any threshold catching the noise would erase real
measurements. `structural_zero_breach` refuses to snap past 100× the observed
residual — at that size the classification is wrong and hiding it is worse.

### `vw_position_frozen` sat at 2,768 ms under a 3,000 ms cap (2026-08-31)
Found on putting the first browser surface over it. Its only consumers were the
nightly job and `vw_book_frozen_baseline`, both `service_role` at 300 s, so
nothing had ever noticed.

`atlas_counterfactual_frozen(asset_id, p_valuation_date)` opens with
`COALESCE(p_valuation_date, (SELECT max(flow_date) FROM vw_position_cash_flows
WHERE flow_kind='mark'))` and the view **omitted the argument** — so all 86
LATERAL invocations re-derived one date by re-evaluating the most expensive view
in the return engine. Hoisted into a CTE and passed in: **2,768 → 803 ms**, no
change to the function, output proven identical by `EXCEPT ALL` both ways in a
rolled-back transaction.

The 2026-08-23 lesson in a new shape: there a scalar subquery was evaluated once
per *reference*, here once per *call*. **Compute it once and hand it down.**

**A view read only by `service_role` has never been tested against the caps the
UI runs under.** Time it before putting a page on it.

### Brinson does not follow the MWR toggle, and that is the answer (2026-09-05)
The deferred "Brinson re-basing" item resolves to **no**, on a structural
argument rather than taste.

`benchmarkSectorReturn` is a **simple average of the portfolio's own position
returns** inside each sector. That is what makes it a counterfactual: same
names, neutral weighting instead of yours, so `selection = wb × (rp − rb)`
measures your sizing against a neutral sizing of the same book. Feed
money-weighted returns in and the benchmark becomes an average of *your*
cash-flow-timed returns — selection would grade your trading against your
trading and the comparison collapses.

Two supporting facts, checked not assumed: holding periods in
`vw_performance_suite` run **4 to 250 days**, so MWR adds a second axis of
incomparability on top of the heterogeneous windows since-entry already has;
and `vw_performance_suite` **carries no MWR column at all**, so re-basing is a
schema change, not a toggle. The panel's `ON SINCE ENTRY` badge now says this
is by construction rather than pending.

### The attribution engine was guessing the basis (2026-09-05)
`computeBrinsonAttribution` and `computePositionContributions` both read

```js
var ret = Number(p.total_return_pct || p.unrealised_return_pct || 0);
```

Three defects, increasing in severity. It **falls back across bases** — the
same defect `nexusReturnBasis.js` exists to prevent, missed by that sweep
because the sweep grepped `row.`/`h.`/`r.` and this file uses `p.`. **`||` is
not `??`**, so a genuine 0.00% return was falsy and fell through to the other
measure. And **a missing return became a real 0%**.

That last one was live. KMTUY has no `total_return_pct` (feed 176 days dark,
`verdict_status = not_measurable`) and is 1 of 3 Industrials names. Nexus beat
07 passes rows unfiltered, so it entered attribution as a genuine 0.00% and
dragged the sector both ways at once — benchmark sector return **0.13% against
a true 0.19%**, portfolio sector return **0.17% against a true 0.27%**.
Performance pre-filtered and got the right answer. Same engine, same benchmark,
two answers, neither surface saying so.

`returnOf` is now a **required** argument (`RETURN_SINCE_ENTRY` /
`RETURN_ON_COST`); unmeasurable rows are excluded rather than zeroed, and
`measuredCount` / `withheldCount` / `withheldSymbols` come back on the result
so a surface can state its denominator.

**Making the argument required is what found the third caller.**
`perf-panels-top.js:477` called `computePositionContributions` with no
accessor and would have thrown at runtime — the Vite build cannot see it,
because it is a call inside a `useMemo`. **Grep for call sites; the build is
not a caller audit.**

### `fwd_pe` was a trailing P/E under a forward label (2026-09-06)
The `fwd_pe` audit. The column was never computed from estimates and never
came from a forward-earnings engine — it was a **direct pull of the wrong
field**. `mv_nexus_holdings` had `round(f.pe_ratio, 1) AS fwd_pe` reading
`equity_cache.payload->'overview'->>'PERatio'`, which is Alpha Vantage
OVERVIEW's **trailing** twelve-month P/E. AV exposes `ForwardPE` separately,
but the cached payload is trimmed to 9 keys and never carried it.

`market_fwd_pe` is a genuine forward P/E — the median of
`equity_screener_universe.forward_pe`, i.e. Finnhub's `metric.forwardPE`. So
the premium divided **a trailing P/E by a forward median across two vendors**.
Forward sits structurally below trailing (same universe: 22.07 trailing vs
15.83 forward), so every premium was inflated by construction — book average
**+186.5% against a like-for-like +37.9%**.

**Four names inverted**, not merely exaggerated — reported as expensive while
actually cheap on forward earnings: MU (+704.4% → −62.7%), SNDK (+25.1% →
−58.9%), HAL (+54.8% → −24.2%), PFE (+32.7% → −45.7%).

**The label was right; the data was not.** Nothing in the UI changed — the
column has always said "Fwd P/E" and now it is one.

Fixed at `vw_nexus_holdings`, not the matview: it is the **only** object in
the database referencing `fwd_pe` (checked against `pg_depend` — the five
other dependants of `mv_nexus_holdings` do not read it), so `CREATE OR REPLACE
VIEW` reaches every consumer and a `DROP … CASCADE` rebuild of six objects is
avoided. **`mv_nexus_holdings.fwd_pe` keeps the misnomer and is now read by
nothing — do not consume it believing it forward.** Renaming needs the
cascade; deliberately deferred.

`peg_ratio` has the identical vendor split and is not yet reconciled:
`mv_nexus_holdings` takes Alpha Vantage `overview.PEGRatio` while
`equity_screener_universe` takes Finnhub `pegTTM`. No premium is computed on
it today, so nothing on screen is wrong — but the two will disagree.

**When a column's name asserts a measure, check the field it reads, not the
alias.** This one sat mislabelled since `20260530000000`.

### Two faults, each hiding the other (2026-09-06)
Found while resolving the segmentation basis for the Performance three-level
build, which groups on `position_verdicts.cluster_id`.

**`cluster_id` was published from the tier-1 join, not the partition.** The
column was read from `t1`, a subquery that attaches the partition id *inside*
the join to `mv_position_tier1`:

```sql
LEFT JOIN (SELECT t.*, c.cluster_id
             FROM public.mv_position_tier1 t
             LEFT JOIN clus c ON c.symbol = t.symbol) t1 ON t1.asset_id = o.asset_id
```

A position with no tier-1 row loses the whole subquery, `cluster_id` included —
while the SHARE is looked up on an independent path (`LEFT JOIN clus cl ON
cl.symbol = o.symbol`) and was always correct. **24 of 59 open positions**
carried NULL against a real cluster in `universe_clusters`. Fixed by reading
`cl.cluster_id`; for a position that has a tier-1 row both resolve identically,
so it is a strict repair.

**The invariant deduplicated by value.** `sum(DISTINCT cluster_risk_share)`
over `DISTINCT (cluster_id, share)` collapses two distinct buckets that hold an
equal share. AMZN (id NULL) and cluster 204 (GOOGL) carried the same share to
sixteen decimal places, so the job reported **1.0000000000 while the true sum
was 1.0435** — green while 4.4% out, and green *only because* the collapse
cancelled the first defect. Bucket explicitly instead:
`coalesce(cluster_id::text, 'pos:' || asset_id::text)`.

**AMZN was the only name that could expose this.** It is the sole affected
position sharing a cluster with another held name; every other one is the only
held member of its cluster, so its share looked like a plausible per-position
value. A defect visible in exactly one row out of twenty-four.

After both: `rows=59  cluster_id NULL=2  bucketed_share_sum=1.0000000000`,
proven by running the job under a throwaway `logic_version` in a transaction
that rolled back. The 2 remaining (IXC, KMTUY) are genuinely absent from
`universe_clusters` and carry a NULL share.

**Do not assert an aggregate with `DISTINCT` over the value being summed.**
Bucket on the key, then sum.

### The segment layer: risk must be measured per position, not per cluster (2026-09-07)

`segment_verdicts` groups the open book into bets for the Performance level-2
view, under two groupings the user toggles between — `BY BET` (the
`universe_clusters` partition) and `BY THEME`. On the 2026-09-06 book that is
**44 segments under BY BET** (42 clusters, KMTUY alone under its theme, IXC
unpaired) and **13 under BY THEME**. 37 of the 44 are singletons; that is a
display problem, not a grouping problem — rank by risk share and collapse at
render. Effective bets ≈ 3.9 is a concentration statistic, not a segment count.

**The obvious risk basis — Σ `cluster_risk_share` — is wrong twice over.** That
column is per-cluster and repeated on every member row, so summing it across
cluster 199's eight members returns 3.53. Less obviously, it is defined over
the partition, and **the partition does not cover the book**: KMTUY and IXC are
absent from `universe_clusters` (7 and 7 bars in 120 days — dark feeds, not cap
churn), so a cluster-level share silently renormalises **3.2% of the book's
marginal risk** away and still sums to a reassuring 1.0.

Position-level `marginal_vol_contribution × weight` has neither problem. Euler
additivity means any grouping sums to the total with no bucket concept at all,
which is the only reason a grouping toggle can exist — and the two uncovered
names are carried rather than dropped. **Verify the column's form before use:**
it holds the raw partial derivative. Σ raw = 0.386 (meaningless); Σ (raw ×
weight) = 0.006592 daily → ×√252 = **10.46% annualised book vol**, matching
`book_risk_daily.total_vol_annual`.

### The exclusion identity generalises to a subset for free (2026-09-07)

`mv_book_ex_index` computes "the book without asset i" for every i in one pass.
The same algebra answers "the book without segment S" — subtract the segment's
daily sums instead of one name's row:

```
r_ex_S(t) = (S(t) − Σ_{i∈S} w_i r_i) / (F(t) − Σ_{i∈S} w_i)
```

One grouped scan of `mv_book_daily_weights` yields every segment under both
groupings. That cheapness is what makes the toggle affordable; a per-segment
lateral would have been ~21k aggregations.

**A singleton segment is the free equivalence test.** Its ex-segment index *is*
its ex-asset index, so every one-member segment must reproduce
`mv_position_tier2`'s independently-computed excess. All 36 comparable
singletons agree to **4.6e-7** — `atlas_mwr_period`'s bisection tolerance, not
a disagreement. Assert `< 1e-6` there, never equality: a test demanding exact
agreement fails on arithmetic that is right.

Directional checks, same discipline as the ex-AMD check above: excluding
cluster 199 (19.3% of weight, the semis bet) takes the rest of the book from
25.1% to **13.2%**; excluding HAL at 0.01% moves nothing.

### A segment excess is a counterfactual, never an average of member excesses (2026-09-07)

Members sit on different bases — a cluster-eligible name carries a Tier 1
cluster-median excess, an ineligible one a Tier 2 rest-of-book excess — so
averaging them mixes bases, the failure this codebase has now caught five
times. `atlas_counterfactual_segment` pools the members' own cash flows into
the book *excluding the whole segment* and solves **one** rate.

Both legs come back from one call on purpose: `excess = traded − cf` is only
defensible if both sides were built from the identical roster, and computing
the traded leg elsewhere is how the two drift apart without looking wrong.
Members the return engine gates are dropped from **both** legs and named in
`withheld_symbols` — under BY BET, KMTUY alone is `no_measured_members`; under
BY THEME it joins GEV+NVT and the segment measures with KMTUY withheld.

`dispersion` uses Tier 2 for **every** member for the same reason, and
`dispersion_basis` is a NOT NULL-when-present column so a figure cannot be
rendered without saying what it is a dispersion of.

Early reads: the semis bet **+47.24pp** over the book without it; the bond
sleeve (BOND BSV SHY PTRB) **−30.07pp** at 0.12% of risk for 3.36% of weight —
the §2.5 "doing what it was bought to do, and costing return to do it" case.

### The in-line sentence is the residue, not a rule (2026-09-07)

§2.5 fixes seven insight templates and every one of them says something is out
of proportion. On the real book most segments are not: six of the eight default
rows carry weight ≈ risk and rendered silent, because no rule speaks to the
ordinary case. The L2 mockup shows a "Weight and risk in line" sentence for
Mega-cap platforms that **has no rule in §2.5** — the mockup invented it.

Added as rule 8, with two properties that keep it from corrupting a fixed list:

- It fires **only when nothing else did**, never as a second sentence. "In
  line" is the *absence* of a finding, so putting it beside a real one dilutes
  the real one.
- Its band is the **exact complement** of rules 1 and 5 — `r > 1.3w` is over,
  `r < 0.5w` is under, this is what remains. No gap, no overlap, so a segment
  gets at most one proportionality reading. If a row seems wrongly "in line",
  tighten §2.5's own threshold; do not give rule 8 its own band, which would
  open a range where nothing fires.

**The mockup's "the rare segment that costs what it looks like it costs" lost
its boast.** In-line is the modal case here, not the rare one, and a sentence
asserting rarity on six of eight rows is false. The claim is kept, the flourish
is not.

Note the band is asymmetric by inheritance: 0.5w to 1.3w. Healthcare (0.59) and
Consumer/autos (0.59) sit close to the low edge and still read "in line". That
is §2.5's threshold, not this rule's.

### `grouping` belongs in the segment key (2026-09-07)

The spec keys `segment_verdicts` on `(as_of, logic_version, segment_id)` and
*then* introduces the toggle, which collides with it. A name with no partition
cluster falls to its theme under BY BET, so `theme:Industrials /
electrification` is a segment of one (KMTUY); under BY THEME the same id names
the whole theme. Same id, different membership, different risk share. The key
is `(as_of, logic_version, grouping, segment_id)`.

`sub_threshold` is deliberately **absent** — §2.4's field list still carries it
but §2.3 deletes it as "a workaround for a grouping the toggle now supplies
directly". Do not re-add it.

**The segment job shares `atlas_verdict_preflight()` rather than owning a copy.**
It writes to an append-only history off the same live `positions`, so a stale
book freezes a wrong segment row exactly as it would a wrong position row — and
without the shared gate it would sail through on a night the position job
correctly refused, leaving level 2 populated and level 3 empty for that date.
Two gates meant to agree eventually disagree.

`supabase/tests/segment_verdicts_invariants.sql` — 13 violating inserts refused,
one well-formed row accepted, both shares closing to 1.0000000000 under both
groupings, every open position segmented exactly once per grouping, and the
singleton equivalence. **The closure test alone cannot see a dropped position** —
losing one renormalises the rest back to 1.0 and looks perfectly healthy, which
is why the membership count is asserted separately.

### `ON CONFLICT DO NOTHING` is idempotent only if the key is stable (2026-09-08)

The segment job's **first scheduled run failed**: `segment shares do not close
to 1.0 -- bet: risk 1.875066`. The pattern was copied verbatim from
`atlas_write_verdicts`, where it is safe — and it is safe there only because
`asset_id` is stable.

**A segment id is derived from the clustering.** Between a manual write at
15:36 and the 23:38 cron — which runs one minute after `atlas_write_verdicts`
refreshes the matviews at 23:37 — **34 ids appeared and 35 retired**. So
`DO NOTHING` did not skip anything; it *added* the night's ids alongside the
morning's stale ones and the day held two segmentations at once. The invariant
caught it, which is the only reason it is written down here rather than sitting
in the history.

`DELETE … WHERE as_of = … AND logic_version = …` then INSERT, with
`rows_replaced` logged beside `rows_written` so a replace is legible as a
replace. **Before reusing an upsert key, ask whether it survives recomputation.**

### Validate before you write — a RAISE rolls back its own log row (2026-09-08)

The share check ran *after* the INSERT, so the only way to refuse was
`RAISE EXCEPTION` — which rolled back the `sync_log` row that recorded the
refusal. The failure existed **solely in `cron.job_run_details`**. Every
surface the platform actually monitors showed nothing at all: not an error, not
a `skipped`, not an open `running` row. A job that fails invisibly is worse
than one that fails, and this is the mechanism by which it happens.

The gate now runs against the **snapshot**, before the DELETE, and on failure
`UPDATE`s the log row and `RETURN`s. The post-write check stays as belt and
braces: reaching it means the snapshot closed and the written rows did not,
which is real corruption and worth losing the log row to refuse.

The precheck is a **membership** check, not a share check. Two false starts
worth recording: `sum(risk_share) OVER ()` spanned both groupings, so each
normalised to ~0.5 and the job refused every run; and shares sum to 1 by
construction inside the INSERT anyway, so the share form was vacuous as well as
wrong. What a stale clustering actually breaks is **coverage of the open book**,
so that is what to test. (`round(double precision, integer)` does not exist —
cast to `::numeric`. That one has now cost time twice.)

### A view read only by `service_role` has never met the anon cap — third time (2026-09-08)

The Nexus Contribution panel had read *"No measurable contribution. 61 holdings
(99.97% of book) not measurable"* for **over a week**. Nothing was
unmeasurable: `vw_bench_contribution` returned **61 covered rows** at
`service_role`, and returned **HTTP 500 / `57014`** on every single anon call.
A 100% failure rate that presented as a data gap.

`EXPLAIN`: **13,909 ms, with 12.1 s in one nested loop** joining CTE `daily` to
CTE `nav` — where `nav` did nothing but aggregate `daily` back to a per-day
total. **A CTE that only aggregates another CTE is a window function.** The
join is where the planner loses the row estimate (`rows=1`), and the unbounded
nested loop it picks from that estimate is the entire cost.

Three steps, each earning its place:

1. `sum(…) OVER (PARTITION BY price_date)` instead of the self-join —
   **13,550 → 622 ms**.
2. One read of `vw_nexus_holdings`: the coverage percentage was a second
   `CROSS JOIN`ed pass over rows already in hand, so it becomes `OVER ()`.
3. `mv_bench_contribution`, refreshed CONCURRENTLY by the existing 10-minute
   `refresh_nexus_holdings()` — **0.31–1.21 s worst observed**.

The matview is not belt-and-braces. 622 ms clears the 3,000 ms cap *warm*, and
this file already records twice what that is worth — **a mean under the cap is
not a fix**. The refresh is free: the holdings matview beside it already runs on
that job off the same inputs, so contribution is never staler than the feed it
is derived from. Refresh order matters — `mv_bench_contribution` reads
`vw_nexus_holdings`, so holdings first.

**The API layer is why it went unnoticed for a week.** `api/nexus-bench.js`
returned `null` on a non-OK PostgREST response with no log line, and the panel
mapped a missing row to *"not in the contribution view"* — a sentence about the
data, printed when the truth was that the query was cancelled. It now logs
status and body at error level, and `contribution_unavailable` ("the
contribution feed did not answer") is a distinct reason from
`not_in_contribution_view`. **Never let a transport failure render as a
statement about the data.** Same lesson as *"No data available — run Alpaca sync
first"*, in a fourth layer.

### The 1,000-row cap, third instance — and it emptied a whole panel (2026-09-08)

The Regime Slicer rendered `—` in every cell for every position but one. Not a
styling bug and not missing data: all 81 held equities carry ~235 bars over the
last year.

`performance-suite.js` batched 15 asset_ids per request and asked for
`.limit(batchIds.length * 260)` — 3,900 rows — **ordered `price_date` ASC**.
PostgREST returned 1,000. The newest bar any batch received was **2025-12-17**
while the book ran to **2026-09-04**, and every regime window starts
2026-01-02 or later, so every window resolved to null. HAL alone had values
because it sat in the final short batch, small enough to fit under the cap.

This is the rule this file already states twice — for `api/nexus-bench.js` and
`api/nexus-theme.js` — arriving in a third layer, the browser client. **`limit`
is a request, not a guarantee.** Page with `.range()` until a short page ends
the batch; 1,000 → 3,592 rows, newest bar 2026-09-04, 870 bars recovered in the
Deflation window that had none.

**Fetch DESC, hand back ASC.** DESC is about which rows survive a truncation —
lose the oldest, never the current session. But `histBySymbol` has an
*ascending* contract that two consumers depend on: the rolling-attribution
panel walks `hist[t]` positionally, and the regime panel reads
`arr[arr.length - 1]` as "newest" (its comment says so). So sort ascending at
assembly rather than making every consumer defensive.

`RollingAttributionPanel` and `FactorEnginePanel` read the same
`histBySymbol` and were degraded by the same truncation — a panel does not have
to look empty to be wrong.

### A gauge carried from the mock looks exactly like a working gauge (2026-09-08)

Nexus's Risk and Performance tiles had **never been live**. `nexusLive.js` said
so in its own header — "Deferred to their own feeds … gauges.risk /
gauges.performance" — and `gauges: { ...baseline.gauges, concentration }`
overrode exactly one of the three. The other two rendered `nexusMock.js`
verbatim: `73 / 100%`, "Marginal VaR rose on the rate move", `−0.9%` against a
bench of `−1.2%`, movers NVDA/AVGO/MSFT. Every figure fixed, none of it labelled
as synthetic, sitting beside a Concentration tile that was genuinely live.

**Performance** is `Σ wᵢ·rᵢ` over the names carrying both — and the stale gate
had to be built here, because `vw_nexus_holdings.daily_return_pct` is not gated
the way `nexus_holdings.today_pct` is. KMTUY, 2.13% of book on a bar **179 days
old**, still publishes **+9.25%**: counting it makes the book `+0.19%` when the
measured book is `−0.005%`. A stale name is withheld and the remainder
renormalised — never counted at its last print, never treated as a name that
sat flat. `measuredWeightPct` / `withheldWeightPct` are published so the surface
can state its denominator.

Movers rank on **contribution** (weight × move) but print the name's **own**
move — ranking on the printed number would put a 0.3%-weight name above a 4%
one.

**Risk has no cap in the database.** There is no risk-limit or budget table
anywhere, so `73 / 100%` was an invented denominator. The measurements are real
(`book_var_95_daily`, `total_vol_annual`, one row per session in
`book_risk_daily`); the cap is **configuration** —
`RISK_VAR_CAP_PCT_OF_NAV = 5.0`, a number someone chose, named as such in the
tile's own note. Δ is a change in *utilisation*, so both days divide by the
**same** cap: re-deriving yesterday's from yesterday's NAV would let a pure NAV
move read as a change in risk. Rendered at **1dp** — utilisation moves ~0.2pt on
an ordinary session, and at 0dp a live number renders `Δ +0pt` every calm day
and looks broken.

**A fallback to the baseline must not be silent.** `liveOr()` logs at error
level when a gauge falls back, because a baseline gauge is a synthetic figure
standing where a real one belongs and is indistinguishable from a working panel.
That is how these two survived unnoticed, and it is the contribution-panel
lesson in a second layer. Each gauge also falls back **independently** — one
dark feed must not drag a healthy reading back to the mock with it.

**The stub could not have caught this.** `nexusLive.stub.mjs` omitted `.order()`
/ `.limit()` / `.range()`, so any chained loader fell into its own catch and
the fallback looked like a clean pass. It omitted `market_value` too, so
`bookNav()` returned null and the Risk gauge fell back even on the healthy
case. **A stub missing a builder method tests nothing and reports success.**

### The series layer, and the project it nearly went into (2026-09-08)

`market_instruments` / `market_prices` / `ratio_pairs` are the A0 regime & risk
series layer: 16 ETF legs, 102,907 daily bars to each leg's own inception, and
12 ratio pair **definitions**. No ratio is stored — pairs are evaluated from the
legs at query time, so one can be re-specified without a backfill.

The A0 spec named Supabase project `jikbulixwvvfrirjpgra`, and that project is
**not this platform**. It has no pg_cron, no pg_net, and none of the eleven
tables this file documents; its `price_history` and `positions` are empty. It is
the Codex project. The platform is `vdmojjszvvcithuxwexx` — the ref the repo's
Supabase Preview check points at.

The series layer was built there first and moved here, because a nightly job
cannot be added to a database with no scheduler, and A1's correlation study has
to join these legs against `universe_correlations` and `book_risk_daily`, which
live here. **Check which project a spec names before building in it** — the two
are one `list_projects` call apart and look identical through the MCP.

**Closed 2026-09-09.** `jikbulixwvvfrirjpgra` holds none of the platform's
work: the A0 tables and coverage view were dropped and the orphaned
`backfill_market_prices` edge function deleted. It is the CFA Codex content
project and nothing else — **no Atlas schema, job, function or migration
belongs in it.** The platform is `vdmojjszvvcithuxwexx`, always.

Equivalence of the move was measured, not assumed: `close` is bit-identical on
all 16 legs and dividend event counts match exactly, while `adj_close` differs
by at most **2.15e-6** relative — and that bound scales with dividend count
(DIA 339 dividends → 2.2e-6, EEM 47 → 8e-7, GLD and CPER pay none → exactly 0).
That is accumulated float32 rounding in the provider's cumulative adjustment
product, recomputed per request, not a restatement.

**Do not test equivalence by hashing rounded values.** `md5(string_agg(round(x,
n)))` was tried first and reported a mismatch at every decimal place down to 3,
which reads as a 1e-3 defect. Across 102,907 rows some value always sits on a
rounding boundary, so the hash breaks however small the difference is. Diff the
payloads and report a max relative difference.

### A bar for today is not a close until the session ends (2026-09-08)

The first load into this project ran at 10:48 ET with the market open and stored
Yahoo's in-progress 2026-09-08 bar as a settled close for all 16 legs — SPY went
in at 767.10, the last trade at that instant. Nothing looked wrong: right shape,
right date, plausible number, and the loader reported `success, 102,923 rows`.

The guard that was supposed to prevent this only dropped bars dated in the
**future**, while its comment claimed it guarded against in-progress sessions.
A comment asserting a check the code does not perform is worse than no comment.

`todaysBarIsPartial()` now asks the provider's own session clock:
`currentTradingPeriod.regular.end`. Today's bar is refused while that instant is
in the future **and** falls on today — testing both makes it correct whether
Yahoo is still showing today's period or has rolled to the next. With no meta to
read it refuses today's bar: lagging a day beats publishing a half-formed close.
`sync_log.details.partial_sessions_dropped` records how many were refused, so
"16 dropped" is legible rather than looking like 16 missing bars.

The nightly job runs at 22:50 UTC, after the close year-round, so in normal
operation this guard should never fire. It exists for the run that happens at
the wrong time — which is exactly the run that produced the bug.

**It fired in the wild on 2026-09-09.** A manual run at 19:34 UTC, market
open, refused all 16 in-progress bars (`partial_sessions_dropped` 16, every
leg's `last_date` still 2026-09-08); the 22:50 scheduled run then took them at
0.

`details.mode` and `details.lookback_days` distinguish a window run from a full
backfill. Without them `success, 80 rows` reads fine until you know it should
have been 102,907 — the same reason `sync_log.details.scope` exists.

### `ts::date` on a timestamptz curve shifts a fifth of the sample (2026-09-08)

`portfolio_equity_curve.ts` is `timestamptz` stamped **after** the US close --
22:00 or 00:00 UTC. So `ts::date` (which casts in UTC) lands a third of the
series on the *following* calendar day: 34 of 175 rows onto weekends, and **38
of 175 with no SPY bar at all**. Aligning book returns to factors on that cast
would have silently misaligned 22% of the sample by one day, and the regression
would still have produced plausible-looking betas.

`(ts at time zone 'America/New_York')::date` gives 175 distinct trading days,
zero weekend rows, zero duplicates, and a SPY bar for every one.

**Cast a timestamptz to the exchange's date, never the server's.** Same family
as `atlas_last_traded_day()` and the `(as_of)::date` unsargable-filter entry:
a date derived from a timestamp is a claim about a session, and the session has
a timezone.

### The factor layer, and what the spec could not tell us (2026-09-08)

`factor_axes` / `factor_axis_loadings` / `factor_axis_scores` /
`factor_pair_zscores` / `book_factor_betas` are the B0 exposure layer over the
A0 series layer. Three intermarket axes -- `cyclical`, `concentration`,
`dollar` -- with **frozen** loadings, and the book's beta to them plus market.

**The B0 spec supplied `variance_explained` but not the eigenvectors**, and A1
ran outside CC. The loadings were re-derived from `market_prices` and land
exactly on the spec's own checksum: 0.290810 / 0.195059 / 0.103176 against
0.291 / 0.195 / 0.103, with exactly three eigenvalues above the
Marchenko-Pastur edge (1.0972 at N=11, T=4882) and the fourth at 1.0144 below
it. A three-number checksum is enough to prove a reproduction; ask for one when
a spec hands you results without the intermediate objects.

**What the checksum cannot prove is sign.** An eigenvector is defined only up to
sign and `variance_explained` is sign-invariant, so A1's orientation is
unrecoverable. Each axis is oriented toward the thing it is named for (raw PC2
points at *breadth*, raw PC3 at a *weak* dollar; both flipped) and `label`
states the direction, so a loading is never read without knowing which way is
up. Every acceptance diagnostic -- R2, condition number, |t|, Durbin-Watson --
is sign-invariant, so this blocks nothing; it is a confirmation, not a gate.

**Report the SCALED condition number.** Raw is 365.9 and scaled (unit-length
columns, the Belsley convention) is 2.385. The raw figure is dominated by the
intercept and by SPY returns (~1e-2) sitting beside axis scores (~1e0) -- that
is units, not collinearity, and quoting it would manufacture a multicollinearity
problem that does not exist.

**"Near-orthogonal by construction" is a full-sample property.** Over the
19-year estimation window the axis pairwise correlations are -0.046 / -0.021 /
-0.012. Over the 174-day regression window `concentration`-`dollar` is **-0.312**
and `concentration`-SPY is **+0.592**. Harmless here, but the design's own
justification does not transfer to an arbitrary sub-window.

`cyclical` is **not significant** (t = 1.28) and neither is alpha (t = -1.33).
The largest axis by variance explained carries no measurable book exposure --
that is a result, not a gap, and it must render as "no measurable exposure"
rather than as a value.

### A carried-forward equity level reads as a zero return (2026-09-08)

Four rows of `portfolio_equity_curve` are **bit-identical** to the row before
them, so `ln(equity_t / equity_t-1)` is exactly 0.00000000. One of them,
2026-07-29, sits against a **-1.55% SPY session**; a deployed book cannot be
exactly flat through that. They are stale snapshots, not flat days.

They attenuate the market beta: 0.968 on the full 174 observations, **1.015**
with the four dropped. No significance verdict moves, so B0's conclusions
stand either way -- but the writer should not emit a repeated level as a
settled one, and a zero return is worth testing for wherever returns are
derived from a level series.

### An internally consistent row is the hardest kind of wrong (2026-09-09)

Track C1. `portfolio_equity_curve` carries three rows where the provider returned
the prior session's equity with `profit_loss` reported as 0.00 -- 2026-01-15,
2026-05-04 and 2026-07-29, the last against a **-1.55% SPY session**.

**`profit_loss` on this table is the DAILY change**, not a cumulative figure
(2026-07-28: equity 92,517.32 against the prior 94,279.86 gives exactly the
-1,762.54 recorded). So on a carried-forward level, a zero change is
*arithmetically correct*. The row is internally coherent and factually false, and
**no cross-column check inside the row can catch it.** What identifies it is the
transition: a deployed book that moved the day before reporting a change of
exactly zero to the cent.

The brief described these as rows bit-identical to their predecessor on all four
numeric columns. **Exactly one row matches that and it is not a defect** -- the
2025-12-24/26 pair at 100,000.00 is a funded, undeployed account, genuinely flat.
Test the transition, not the equality; and the third clause (`prior change <> 0`)
is what keeps the legitimate flat out.

**The damage reaches one row further than the flag.** The provider computes the
next day's change against the carried level, so 2026-07-30's +2,488.02 is a
two-day move reported as one day's. Anything excluding stale levels must exclude
the return *out* of them too, not just the return *into* them.

`data_quality` (`settled | stale_snapshot | recovered | unknown`) marks them.
Never delete: deleting changes row counts other modules depend on, and the flag
is the fix.

### `account_snapshots` and `portfolio_equity_curve` are different bases (2026-09-09)

Do not reconstruct one from the other without checking. They disagree on **healthy**
days: MAE 385 at a 16:00 ET probe, and no probe time (16:00 / 18:00 / 20:00 / last
of day) reconciles them.

The cause is **short options**, and it is measurable: over 105 healthy overlap days,
the gap is **+678.6 +/- 562.3** on the 35 days the book held options and
**+61.5 +/- 293.6** on the 70 it did not, with `corr(gap, option MV) = -0.33`. The
two sources mark short contracts differently.

That makes recovery date-dependent and it was **declined** for all three stale rows:
2026-01-15 predates `account_snapshots` entirely, 2026-05-04 sits inside the options
period (~+/-0.4% band), and even the clean 2026-07-29 case would inject ~+/-0.3pp
into a return whose typical size is ~1%. **An honest gap beats a reconstructed
number nobody can defend** -- but record the near miss, because the next reader
will otherwise redo the analysis.

### A nightly job with no `sync_log` row is invisible, not healthy (2026-09-09)

`sync_portfolio_history` (cron job 9, 01:00 UTC) had **no `sync_log` integration of
any kind** -- not one row, ever, since the job was created. It was not failing; it
simply could not be seen by `atlas_sync_status`, `stuck_syncs`, `feed_coverage` or
any other surface the platform monitors.

**Before trusting that a scheduled job is healthy, check it has ever written a
row.** Absence of failures is not evidence when absence of *everything* is the
actual state. Fixed in v6, which also makes the empty-history path an error rather
than `200 {inserted: 0}` -- the third instance of that pattern in this file.

`supabase/functions/_shared/alpaca_tasks/portfolio_history.ts` was a second,
older implementation of the same writer with no callers, no stale detection and
no `sync_log` -- one import away from reintroducing the defect C1 closed.
**Deleted 2026-09-10.** The four siblings in `_shared/alpaca_tasks/`
(`account`, `activities`, `positions`, `prices`) have no importers either;
`sync_alpaca_positions/index.ts` defines its own `runPositionsAndAccount`
locally and does not read them. `activities` and `prices` are left in place,
flagged: check for a live duplicate before assuming any of them is the writer.

**`account.ts` was deleted 2026-09-15**, on the same reasoning one layer on.
It was the ONLY file in the repo outside the live function that inserts
`account_snapshots`, and it does so at `now()` while never touching
`positions`. `vw_positions_current` reads `updated_at >= max(as_of)` over
`account_snapshots` as its watermark -- exact **only because** the live
function writes both tables in one transaction. An account-only writer
advances the watermark past every position row, so a single import of
`runAccount` empties the current book and with it `vw_risk_analysis`,
`vw_command_centre` and the other 19 views. Raised by CodeRabbit on PR #781
as a contract dependency rather than a live fault, which is what it was: zero
importers, confirmed repo-wide. **A view whose correctness depends on a
dangerous function never being called is better served by deleting the
function.**

**First scheduled run logged 2026-09-10 01:00 UTC** (`sync_log` #46171, `partial`,
550 ms, 2 stale flagged). Two, not the three known stale rows, because the cron
sends `period='6M'` and 2026-01-15 is outside it -- **read that count against
`period`, not against the table.** The 01:00 run also lands before Alpaca publishes
the session that just closed, so the curve trails by a day; the nightly 6-month
re-fetch closes it, and the curve carries 176 ET dates against 176 SPY sessions
with no gap either way.

### Reproduce before you re-estimate (2026-09-09)

C3 re-ran B0 on the cleaned curve. The prior estimate was reproduced from scratch
first, agreeing to **3.0e-12 on every coefficient** -- which is the only thing that
makes "the beta moved" a statement about the sample rather than about the method.

That control also recovered an input B0 never wrote down: the market term is SPY
**`adj_close`** log returns. `close` gives market 0.967107 against the published
0.968234 -- close enough to look like a successful reproduction, wrong enough to
invalidate every comparison drawn from it. The two series differ on ~4 dividend
dates in the window. **When a spec omits which series was used, identify it by
reproduction, not by assumption.**

Result: n 174 -> 168, market 0.968 -> **1.026** (the attenuation the fabricated
zeros were causing), R2 0.770 -> 0.778, DW 2.133 -> 2.059, scaled condition number
2.385 -> 2.376. **No significance verdict changed**: `cyclical` (t 1.279 -> 0.948)
and `alpha` remain not significant, `concentration` (3.090 -> 2.784) and `dollar`
remain significant. `book_factor_betas` is append-only, so this is a second
estimate set, keyed apart by `estimated_at` and `n_obs`.

### Render an axis from `positive_means`, never from its key (2026-09-09)

`factor_axes` now carries `positive_means` (what a positive score indicates, plain
language, non-blank CHECK) and `pc_sign_flipped` (true where the stored loadings
negate the raw eigenvector).

A proposal to rename `concentration` -> `breadth` was withdrawn and is worth
recording as a near miss: the stored orientation was already correct, so renaming
would have required flipping the loadings back, **invalidating every stored score
and every beta in an append-only history that cannot be restated.** The ambiguity
was in the documentation, not the data.

`pc_sign_flipped` is provenance only. An eigenvector's raw sign is solver-dependent,
so it is meaningful only relative to the A1 derivation recorded in
`20260908190632`. **Render from `positive_means`; audit with `pc_sign_flipped`.**

### An empty log table is not proof nothing writes to it (2026-09-09)

Audit of all 30 `cron.job` entries against their `sync_log` writers, prompted by
C1 finding `sync_portfolio_history` running nightly with no logging at all.

**`sync_fundamentals` had never written a `sync_log` row** -- cron jobs 13 and 28,
ten fires a week, for the life of the function. It logged to **`atlas_sync_log`**,
the legacy table this file says never receives a row, with a payload naming
columns (`metrics`, `notes`) that do not exist on it, inside a bare
`catch { /* best-effort */ }`. So every write was rejected and every rejection
swallowed. `atlas_sync_log` being empty was not evidence that nothing targeted
it; it was the *symptom*.

**The job always worked** -- `equity_cache` was current to within hours. Only the
log was dead. Same shape as `sync_funddata_prices`, one layer worse: it never
reached the right table.

**147 rows carried `function_name IS NULL`** -- `api/options-snapshot.js` and
`api/vol-dispersion-sync.js` set `source` and never `function_name`, so every row
they wrote was invisible to any query keyed on function_name, which is how you
enumerate writers in the first place. `api/trade-sync.js` already did it right.
Backfilled exactly (each row's `source` already *was* the job name) and fixed at
both sources.

**Note each chain stage writes TWO rows** -- `atlas_chain_dispatch` one
(`source='pg_cron_chain'`, HTTP status) and the Vercel handler another (the real
detail). Read `source` to tell the layers apart; do not double-count runs.

**Still unlogged, flagged not fixed:** jobs 11 `refresh-nexus-holdings`, 14
`refresh_holding_vol_trailing`, 37 `refresh_position_returns` write nothing
anywhere, and 35 `atlas_run_validation` writes `atlas_validation_log` instead. All
are pure-SQL, so a failure shows up only in `cron.job_run_details`. Their outputs
are current, so nothing is broken today. `atlas_run_factor_scores()` is the
wrapper pattern to copy. Job 25 `atlas_chain_reap` logs nothing **by design** --
it closes other jobs' rows.

**Nothing was stale relative to its schedule.** Check the low-frequency jobs
individually rather than eyeballing "last run was days ago": 22
`chain_theme_leadership` is Friday-only and 24 `chain_sync_valuations` Monday-only,
so both were correctly on cadence.

### Gate on what the writer logs, not on what the job is called (2026-09-09)

C4's factor-score job gates on the price layer having succeeded that day. Cron job
40 is `sync_market_series_daily` -- but the row it writes carries
`function_name = 'backfill_market_prices'`, the EDGE FUNCTION's name. Gating on
the job name matches nothing and skips every night forever, silently: the "gate
that can never pass" in a new shape. The upstream's real status is recorded in
`details.upstream_status`, so a `partial` night is diagnosable rather than
mysterious.

The refusal path must **not** `RAISE` -- that rolls back its own `sync_log` row and
leaves the refusal only in `cron.job_run_details`. Validate, `UPDATE` the row,
`RETURN`.

`atlas_refresh_factor_scores()` keys on `(date, pair_key)` / `(date, axis_key)`,
derived from data rather than from a clustering, so its `ON CONFLICT DO NOTHING`
**is** safely idempotent -- the opposite of the segment job. The re-run still logs
`skipped`, never `success` with zero rows.

### `now()` cannot measure a duration inside its own transaction (2026-09-09)

`sync_log.started_at` defaults to `now()` and C4's wrapper closed with `now()`
too. `now()` is the TRANSACTION timestamp and is constant for the life of the
transaction, so `finished_at` always equalled `started_at` and `duration_ms` was
**0 on every run** -- a job that recomputes the whole history reporting that it
took no time. `clock_timestamp()` advances inside the transaction: the same run
then measured 1977 ms.

### `REVOKE ... FROM anon, authenticated` does not remove EXECUTE (2026-09-09)

Postgres grants EXECUTE to **PUBLIC** by default on every new function, and
`anon` / `authenticated` inherit it from there, so revoking those roles by name
leaves the grant in place. The security advisor caught it within a minute: the
anon SECURITY DEFINER list went 21 -> 22 with the new function on it *despite*
the revoke. `revoke execute on function ... from public, anon, authenticated;`
is what works. Verify with `has_function_privilege`, not by reading the migration.
pg_cron executes as the job owner, so the schedule is unaffected.

### A cron body can be wrong while the job is green (2026-09-10)

C5's reconciliation compared Yahoo's `market_prices` against Alpaca's
`price_history` for the 16 A0 legs and found the prices fine -- 0 of 67
leg-sessions past 25 bp, worst 7.30 bp -- and the *coverage* wrong: 13 of 16
legs had a Yahoo bar for 2026-09-09 and no Alpaca bar. The three that did are
exactly the three that are also held.

Held names are priced by cron job 17 at 22:00, everything else by job 34 at
23:20, and the two commands differed in one place:

```sql
-- job 17, book:      'end_date', current_date::text
-- job 34, universe:  'end_date', (current_date - 1)::text
```

**~1,900 non-held symbols were one session behind the book, every night, by
construction.** Not a hole -- the five-day window re-fetches, so the bar always
arrives the following night. Permanently *late*, never *missing*, which is why
nothing caught it: `universe_price_coverage` passes at a median lag <= 3 days
(a tolerance that exists for weekends), and the job logs `success` nightly
because it is succeeding at what it was *told* to fetch.

**Seventeen consecutive clean runs say nothing about whether the request was
right.** Read `details` -- the `end_date` was in every row all along.

### Reconcile two providers on `close`, and never on one number (2026-09-10)

`atlas_check_feed_reconciliation(sessions, bps)`, cron job 42 at 23:25 Mon-Sat,
writing both `sync_log` and `atlas_validation_log`.

**Two legs, kept apart on purpose.** `price` is both providers holding a bar
for the same leg-session and disagreeing -- a data fault. `coverage` is one
provider holding a bar the other does not -- a feed late or stopped, different
failure, different fix. Folding coverage into a "prices disagree" count reports
a stall as a pricing error, the mistake this file already records in four
layers.

**`close`, never `adjusted_close`.** Each provider runs its own dividend
adjustment product, so adj-vs-adj diverges on every dividend by construction --
A0 measured 2.15e-6 between two copies of the *same* provider's. The raw close
is the one number both actually observed.

**25 bp is calibrated, not guessed**: worst observed like-for-like gap is
7.30 bp, median under 2. The session spine is SPY's own Yahoo bars, never a
calendar -- a weekday feed is not late on a holiday.

`feed_reconciliation_exclusions` carries `leg`, and that is what keeps it a note
rather than a gag: C1's three `stale_snapshot` dates are scoped to
`equity_curve` and **cannot** silence a price divergence on the same date. The
test asserts that rather than trusting it.
`supabase/tests/feed_reconciliation_forced_divergence.sql` -- 5/5, including the
happy path, because a wall of failure cases that also rejects healthy data is
worse than none.

### A handler can write its data and no log row (2026-09-10)

`api/options-snapshot.js` ran on 2026-09-09, wrote **93 rows** to
`options_positioning_snapshots` at 23:01:14, and wrote **no `sync_log` row at
all** -- having written one on both preceding nights. The chain layer reported
the stage `success`, HTTP 200, because `atlas_chain_dispatch` grades on status
and the handler answered 200.

The defect is that it cannot be diagnosed afterwards. Three silent paths, all
identical from outside: `if (SB_SERVICE)` with no `else`, `if (ins.ok)` with no
`else`, and `catch { }`. The close path added a fourth -- a `PATCH` whose
response was never checked, and a non-OK PATCH does not throw. That is exactly
how 41 `sync_funddata_prices` rows sat open for months.

Both handlers now log status and body at error level on a refused open or
close, on a throw, and when the service key is absent.
**A swallowed write failure costs months.**

**Read `source` to tell the layers apart.** The chain row carries
`source='pg_cron_chain'`, the handler's its own name -- and only the handler's
absence reveals this class of gap.

### The stale-clustering hazard actually happened (2026-09-10)

`ts_clusters` failed on 2026-09-09 (`GET universe_risk_stats: 504 Gateway
Timeout`), and `atlas_write_segment_verdicts` ran eight minutes later on the
**previous night's** partition. It wrote 5 rows and passed its membership
precheck, so nothing is wrong today -- but this is the case that precheck exists
for, and it is no longer hypothetical.

### An absent number beats a flagged one (2026-09-10)

A2's axis panel. The rule is that an axis whose latest beta is not significant
renders **"no measurable exposure"**, never the value -- printing 0.0005 reads
as a small exposure, which is a different claim from no measurable exposure and
is the one the data does not support.

`cyclical` is the current instance: largest axis by variance explained (29.1%),
t = 0.95. It is **not a carve-out** -- the rule reads the `significant` flag,
and a re-estimate can flip any axis either way.

**The beta is absent from the row shape when unmeasured, not merely flagged.**
A renderer cannot print a number it was never handed. Same construction as
`nexusReturnBasis.js`, and this file already records what a flag beside a number
nobody checks is worth.

`bfb_significant_ck` binds `significant = (abs(t_stat) > 2)`, so the flag cannot
be flipped without moving its own evidence -- the panel cannot be shown a flag
that disagrees with the statistic underneath it. Found by trying: the first
scratch flip was refused by the CHECK.

**Force the flip in a rolled-back transaction, never by appending.**
`book_factor_betas` is append-only, so a scratch estimate set appended to prove
a UI rule stays there permanently.

### `score_20d` is a cumulative sum, not a sigma level (2026-09-10)

`atlas_refresh_factor_scores` writes `score_20d` as a rolling 20-SESSION SUM of
the daily axis score. Mean |score_20d| runs 3.3 (dollar) to 5.8 (cyclical), so
A2's 0.5σ "quiet" threshold sits at about a tenth of a typical reading.
Backtested over the 4,116 sessions carrying both non-marginal axes: aligned
52.8%, contested 46.6%, **quiet 0.53%** (22 days).

Applied as specified and kept as one named constant (`QUIET_SIGMA`) read in a
single place. **Check what a column actually holds before comparing it to a
threshold in sigma** -- the name says score, the value is a sum of scores.

### The browser in this container cannot reach Supabase (2026-09-10)

Node, curl and the MCP all reach it; the headless browser does not. The agent
relay drops the tunnel mid-exchange (`ws_closed_mid_exchange`, 1006) and a page
`fetch` fails after ~12s, with or without the proxy configured. The Nexus
flagship shell also cannot start under plain `vite` -- it needs the `/api/*`
routes only `vercel dev` serves.

To screenshot a live panel: read the rows server-side and replay them by
patching `window.fetch` for `/rest/v1/*`. The real client, query builders and
component still run; only the socket differs. **Say which half is proven** --
the render is, the network read is not.

### Alpha Vantage's BRENT is FRED's DCOILBRENTEU (2026-09-13)

Measured before choosing a provider for A0b's commodity leg, not assumed:
**9,973 of 9,973 observations identical**, same first date (1987-05-20), same
last date, and no date present on one side only. AV is redistributing the EIA
series FRED publishes. So reading it from FRED is not a proxy substitution --
there is no second measurement to choose between -- and it needs no API key.

`macro_series` / `macro_series_values` hold seven series to inception (69,048
observations): `T5YIFR`, `T5YIE`, `T10YIE`, `DGS2`, `DGS10`, `T10Y2Y`, `BRENT`.
Loader `load_macro_series`, cron `load_macro_series_daily` at 23:05 Mon-Sat.

**Units are PERCENTAGE POINTS on the six rate series, not basis points.** Every
A3 threshold is authored in bp, so the engine divides by 100 before comparing.
Getting that backwards makes a 40bp test a 4,000bp test and nothing ever fires.

**Publication lag is not uniform and is not a failure.** Observed against a last
session of Friday 2026-09-11: breakevens and `T10Y2Y` current to 09-11,
`DGS2`/`DGS10` to 09-10, Brent to 09-09. `atlas_feed_status()`'s
`macro_series_values` row therefore reports the **MINIMUM** of the per-series
latest dates, never the maximum -- `T10Y2Y` alone publishing would otherwise keep
the row green while the other six sat frozen. Same lesson as `price_coverage`
counting holdings while the universe froze.

**FRED revises published values, so the loader upserts and never insert-onlys.**
An insert-only loader freezes the first print and the series quietly stops
matching its source.

The integrity check on the load is not a row count: FRED's published `T10Y2Y`
reproduces `DGS10 - DGS2` on **12,563 of 12,566** common dates, worst gap 2bp.

The macro job is **ungated** on purpose. It reads nothing this platform writes,
so gating it on the price sync would mean a night Yahoo is unreachable also
costs the breakevens -- a gate that does not track a real dependency is the
"gate you learn to ignore" in a new shape.

### `score_20d` is a sum; `score_20d_z` is the sigma level (2026-09-13)

The A2 quiet band compared `score_20d` against `QUIET_SIGMA = 0.5` as though it
were a sigma level. It is a rolling 20-session **sum** whose sd runs 4.19
(dollar) to 8.22 (cyclical), so the band was about a fifteenth of its intended
width and quiet fired on **0.53%** of sessions.

**The fix was the column, not the constant.** `factor_axis_scores.score_20d_z`
is `score_20d` over its own trailing 5-year sd (same window and same
750-observation floor as the pair z-scores), and `atlas_axis_dispersion_state`
reads it. Quiet is now **18.17%** of the 3,369 sessions carrying a z, against
aligned 41.73% and contested 40.10%. The constant did not move.

Divided, **not centred**, per spec -- and that was checked rather than assumed:
the full-history means are +0.285, -0.149, +0.180 against those sds, so omitting
the centring shifts a reading by at most 0.07 sigma. The z starts **2013-04-22**;
before that the baseline is too short and the column is NULL.

**Check what a column holds before comparing it to a threshold in sigma.** The
name said score; the value was a sum of scores.

### The A3 theme engine detected 0 of its 5 expected periods (2026-09-13)

Four themes, `logic_version = 'v0-uncalibrated'`, 18,538 state rows over
2003-04-01..2026-09-11. Full report in `docs/A3_THEME_ENGINE_BACKFILL_REPORT.md`.
Master spec §9.1 puts 0-1 detections on the **"Stop. Do not tune."** branch and
nothing was tuned; a `v1` row set at that count is a §10.3 owner decision.

**The result is not an artefact of the baseline reading**, which was the one
implementation choice that could have caused it. "25bp above the 60-session
mean, hold 20" has two readings: against a *rolling* mean (a sustained level
shift feeds into its own baseline within 60 sessions and the measured move
decays to zero, so only a transient spike can ever be detected) or against a
baseline **frozen at the session the episode opens**. Frozen is shipped, on the
spec's own argument that a retrace needs a fixed origin. Both run on the same
code via `p_baseline_mode`, and the strictly more permissive frozen reading
still detects **none of the five** -- rolling detects nothing at all, in the
entire history, for any theme.

Three distinct failure modes, which want different answers:
- **The premise did not happen.** `T5YIFR` reached +29.4bp over its 60-session
  mean across the whole 2018-19 trade war (2 of 503 sessions) and **+14.2bp
  maximum in 2025, on none**. Forward inflation expectations did not reprice.
  No threshold that means anything detects a move the data does not contain.
- **Thresholds cleared, holds not.** 2022 energy: Brent +57.1% against a 25% bar,
  `T5YIFR` +45.5bp against 20bp -- and the binding row was
  `cyclical >= 0 sigma`, a **sign test**, whose best run in 2022 was 37 against a
  40-session hold. A no-magnitude qualifier turned out to be the strictest row in
  the theme.
- **Every row cleared its own hold, never together.** 2023 fiscal: 32>=30,
  33>=30, 55>=30, and the conjunction never held on one session. **Requiring
  simultaneity of three rolling holds is far stricter than requiring each**, and
  the difference is invisible in a threshold table.
- **Structurally unsatisfiable.** `concentration >= 1 sigma` has a longest run of
  **30 sessions in the whole series** against a **60-session hold**. No data
  could satisfy `productivity_capex`'s emergence row.

**Attribution works and is proven, not asserted.** 196 sessions where every
positive `fiscal_dominance` emergence row held its full 30 and the `abs_lte`
discriminator failed on value; the theme emerged on **0** of them.

Two defects the backfill surfaced, both fixed and both found by reading results
rather than code: the 60-session decay counter was **global rather than
per-state**, so a theme that aborted returned to dormant the next session
(`aborted` averaged 3 sessions against a rule that should give it 60); and the
temp tables were `ON COMMIT DROP` with no drop at entry, so the function could
not be called twice in one transaction -- which is exactly the reproducibility
check §6 asks for.

`aborted` fires from `dormant` because the spec says "any -> aborted". Left as
specified, and worth knowing: most `aborted` rows in this history describe a move
that never became a state, and it is the second-largest state in every theme
(24.9% for `productivity_capex`).

**Evaluation and persistence are separate functions on purpose.**
`regime_theme_states` is append-only by trigger, so a row written in error cannot
be deleted; the only safe way to review a first backfill is evaluate, inspect,
roll back. `atlas_evaluate_themes` leaves results in temp tables and writes
nothing; `atlas_persist_theme_run` appends them.

Determinism is the contract (§9.3), so the evaluator returns an **md5 over each
theme's whole `(as_of, state, strength)` series** rather than a transition count
-- two different series can carry the same number of transitions. Reproduced four
times, including once after a `safe_bigint` rewrite of two integer extractions,
which is how that rewrite is known behaviour-neutral rather than assumed to be.

### A3 v0.1-structural: 1 of 4, and a correction to my own report (2026-09-14)

The owner's 2026-09-13 ruling applied. Four structural corrections, NO threshold value
changed, one re-run. Full report in `docs/A3_V01_STRUCTURAL_REPORT.md`.

**Detected 1 of 4 expected periods** — `fiscal_dominance`, emerging 2023-11-03, aborting
2023-11-14 on the November yield collapse. That is the ruling's own §5 middle row: report
and hold. The conjunction-window correction is what produced it: fiscal's three emergence
rows completed their 30-session holds at 32, 33 and 55 sessions inside 2023, never on a
shared session, and all three fall inside one 90-session window.

**PEAK IS NOT HOLD, AND I GOT THIS WRONG IN WRITING.** The v0 backfill report's prose said
2022 energy failed because a sign test held 37 of 40 sessions while "the two rows that carry
actual magnitudes cleared their bars easily". The +57.1% Brent and +45.5bp T5YIFR figures
are **peak single-session readings**. Their longest actual runs were **10 sessions against a
40-session hold each** — so the sign test at 37/40 was the row that came CLOSEST to
satisfying itself, the least binding of the three. The report's own table had 10/10/37 right
on the page above the paragraph that misread it. Both places are now corrected in place.

The ruling's §1 was argued from that paragraph and still stands on its own merits (A3.1 §4
says confirmation never gates; A3.0 seeded the row as emergence) — but it could never have
unblocked 2022. **No threshold change fixes a row that holds a quarter of its window.**
`energy_dislocation` has now spent zero sessions in emerging or established across 5,900.

**Version-scope a semantic change, not just a threshold change.** The conjunction window and
the abort scope were first written unconditionally, which would have restated what
`v0-uncalibrated` means — 18,538 append-only rows that are the evidence the ruling was
decided on. `regime_logic_versions` now records which SEMANTICS each version evaluates
under, separately from its thresholds, and an unknown version defaults to the pre-ruling
behaviour. A conjunction window of **1 reproduces the old same-session rule exactly**, so v0
is recovered by a parameter rather than a second code path — and the v0 digest reproducing
on all three themes is the test that it worked.

**That test caught a real off-by-one:** `sess_ix - oldest <= v_conj` makes a window of 1 mean
"this session or the previous", silently widening v0 by one session and breaking reproduction
on two of three themes. The window is the last `v_conj` sessions INCLUSIVE of the current
one, so the comparison is `<`.

**`aborted` fell from up to 24.9% of sessions to 0.00–3.92%** once the transition stopped
firing from `dormant`. An abort is the failure of an episode that existed.

**No tariff candidate passes a specificity test.** `eem_spy` and the `dollar` axis are the
only two with consistent sign across both tariff windows while 2 of 3 controls run the other
way — and **COVID moves the same way and further** (dollar −3.94 against −2.67 and −2.41),
so any threshold that fires on tariffs fires on COVID first. Sessions ≥1σ separate nothing:
75–116 in every window. No trigger rows were written, per the ruling.

### The book is 26% riskier when the factors stop diversifying (2026-09-14)

E3/B2. `atlas_regime_factor_cov` / `atlas_regime_cvar` / `book_regime_cvar`, nightly at
23:45 Mon-Sat. Full report in `docs/E3_REGIME_CONDITIONAL_CVAR_REPORT.md`.

**`book_factor_betas` stores exposures but not the panel they were fitted against.** B0 and
C3 both computed regressors outside the database and inserted only coefficients, so until
now nothing in the schema could reconstruct what the betas mean. `vw_factor_return_panel`
fixes that and is pinned by REPRODUCTION, not assumption: `var(b.x)/var(book)` on the C3
sample reproduces its stored `r_squared` to **7.1e-11** on n=168 exactly. That identity holds
only for SPY **`adj_close`** log returns plus the **raw daily** `score` -- `close` gives
market 0.967 against the published 1.026, and a cumulative score column gives nothing near it.
The check is the first assertion in the test file, so a drifting panel fails loudly instead
of silently re-denominating every risk number downstream.

**Ledoit-Wolf must run on the CORRELATION scale here, not the covariance.** LW's usual target
is a scaled identity, which assumes commensurate variables; SPY returns have sd ~0.011 and
the axis scores 1.07-1.71, a factor of ~150. On the raw covariance the intensity is dominated
by the axis-axis pairs purely because they are largest -- and those are near-zero BY
CONSTRUCTION, because the axes are PCA components. Measured: delta-hat 1123 / 308 / 212 / 110,
all clipping to 1, which would zero every off-diagonal including market-concentration at
rho +0.45. Standardising first gives 0.023 / 0.038 / 0.037 / 0.074. **A scalar shrinkage
cannot serve a factor set that is orthogonal in one block and correlated in another.**

Intensities that small move the reported vol by **-0.06% to +1.34%** -- the expected result at
N=4, T~842, since the optimal intensity falls as 1/T. `vol_daily_unshrunk` is stored beside
`vol_daily` so that is checkable. **The honest evidence for shrinkage here is that it barely
moved, and saying so is the point.**

**The lowest quartile is the worst on all three axes, and it is one finding not three.** Risk
ratios against unconditional: `cyclical` q1 **1.258**, `concentration` q1 1.165, `dollar` q1
1.132. The mechanism is that rho(market, axis) is highest in q1 -- 0.664 / 0.446 / 0.413
against 0.474 / -0.059 / 0.089 in q4 -- so the off-diagonals add instead of offsetting.
Excluding the Feb-Apr 2020 crash (40 of its ~52 days land in `cyclical` q1) takes that 1.258
to **1.140**: the magnitude shrinks, the ordering does not.

**`cyclical` gives the widest spread while carrying no measurable exposure (t = 0.948).** Not
a contradiction: it is the STATE VARIABLE defining the bucket, not a channel the risk flows
through -- the risk arrives via `market` and `dollar`, whose covariance changes inside those
buckets. An axis can be a good state variable and a bad explanatory variable at once.

**`b'Sigma b` is a variance; VaR and CVaR need a distribution.** Gaussian is assumed
(1.6449 / 2.0627 at 95%) and daily factor returns are fatter-tailed, so **every CVaR here
understates the tail** and is labelled parametric rather than empirical. `atlas_regime_cvar`
takes 0.90/0.95/0.99 and returns NO ROWS otherwise rather than resolving to a neighbour.

**The master spec's arithmetic for this unit is wrong.** It says "2007 onward, ~4,800
sessions, four buckets of ~1,200". The axis history starts 2010-04-05 and the z history
2013-04-22, so four buckets give **842**. Clear of the 250 floor, so nothing is blocked --
but correct it rather than quote it. Bucketing uses `score_20d_z` and never `score_20d`, for
the reason recorded twice above: the latter is a rolling sum, not a sigma level.

**Read `book_regime_cvar`, never call `atlas_regime_cvar` from a surface.** The function is
706-710 ms per axis; three axes in one round trip is 2.1s warm against the 3s anon cap. Both
functions are revoked from `anon` and `authenticated`. The table is an indexed read.

### A dumped function definition goes stale the moment you patch the function (2026-09-14)

`20260914150500_a3_v01_engine_conjunction_window_and_abort_scope.sql` was written by
dumping `pg_get_functiondef` mid-way through the work. Two corrections were then applied
to the database directly and never re-dumped, so the checked-in migration -- and the
`supabase_migrations.schema_migrations` row taken from it -- carried a draft **the database
has never run**: the conjunction window compared `> v_conj` rather than `>=`, and the new
semantics were unconditional, so `regime_logic_versions` was never read.

**Both faults are invisible from the database**, which was correct throughout; every figure
in `docs/A3_V01_STRUCTURAL_REPORT.md` was produced by the right body. They are visible only
to a replay from a clean checkout -- a Supabase Preview branch, a new environment, a
reviewer reading the migration to see what shipped. CodeRabbit read the file and reported
both as blocking on PR #776, correctly; the reply that they were already fixed would have
been wrong.

`20260914193000_a3_v01_engine_definition_matches_applied.sql` carries the live definition
verbatim. Behaviour-neutral by construction and proven so:
`md5(pg_get_functiondef(...))` identical before and after (`7c8aed2d...`), and all three v0
digests still reproduce against the 18,538 stored rows.

**After patching a function with `execute_sql`, re-dump it into a migration.** A DDL path
that skips `apply_migration` leaves no ledger row, so the divergence cannot be found by
reading the ledger either -- both copies agreed with each other and neither agreed with the
database. Check the live object, not the file that claims to define it:

```sql
select md5(pg_get_functiondef(oid)) from pg_proc where proname = '<fn>';
```

**A file that disagrees with the database is worse than a missing one** -- it reads as the
authority and reproduces nothing.

### The book had no exit mechanism (2026-09-14)

Reported from the terminal: names stay on the book after being sold. KMTUY was liquidated at
13:35 and was still showing at 0.1% hours later, with Alpaca reporting the order filled.

**`sync_alpaca_positions` is UPSERT-ONLY.** It writes
`insert ... on conflict (portfolio_id, asset_id, as_of_date) do update set` and nothing else.
There is no reconciling delete, so a name that drops out of the Alpaca response is never
touched again and the row written before the sale survives. **Today's `positions` is the union
of everything held at any point today, not the current book.**

It self-heals at midnight because `as_of_date` rolls over, which is why this reads as an
intermittent phantom rather than a permanent one and why nothing checking yesterday can see
it. Every book surface is affected: `vw_nexus_holdings`, `vw_portfolio_home`,
`vw_risk_analysis`, `vw_screener` and `nexus_holdings` all showed KMTUY, and
`vw_command_centre` reported **position_count 66 against a real book of 65**. 21 views read
`positions`.

**The signal is `updated_at` against the account-snapshot watermark.** One
`account_snapshots` row is written per sync invocation per portfolio, in the SAME transaction
as the position upserts, so its `as_of` is an exact watermark. Measured on the live book: 65
rows at lag **0.000s**, KMTUY at **23,103s**. There is no grey zone -- do not add a tolerance,
because a tolerance is exactly what lets a genuinely exited name back in.

**The ledger cannot do this job.** `transactions` syncs at 13:10 and 22:10, so the 13:35 sell
was not in it at 20:00 and would not be for another two hours. The watermark sees an exit
within one sync cycle.

`vw_positions_current` is the current book and `vw_positions_exited_intraday` publishes what
it dropped -- an exit that vanishes without trace is how this went unnoticed. **Read
`vw_positions_current`, never `positions`, for anything that asks what is held.**

**The root fix is the writer**, patched in `supabase/functions/sync_alpaca_positions/index.ts`
and NOT YET DEPLOYED: a reconciling delete of rows for `current_date` whose `asset_id` is not
in the set Alpaca returned. Proven against live data in a rolled-back transaction -- removes
exactly 1 row, exactly KMTUY. It carries a **coherence gate**, because an empty positions
array is the right answer for a flat account and a catastrophic one after an endpoint hiccup:
`/v2/account`'s long/short market value is an independent witness from a different endpoint,
and the job refuses to reconcile (at error level, never silently) when the two disagree.
Deploying it fixes all 21 views with no view change.

**An ABSENT witness is not a zero one.** The gate's first draft read
`Math.abs(acctLongMV ?? 0) + Math.abs(acctShortMV ?? 0)`, so a 200 response that simply
omitted the two market-value fields summed to 0, cleared the `< 1` flat test, and would have
deleted the whole book on the strength of a witness that never testified. `toNumericOrNull`
returns null for an absent field and `?? 0` erases that distinction. Both fields must be
present for the account to confirm anything; otherwise the gate refuses. Same shape as the
stale-bar rule -- if the data cannot support the claim, the claim is not made.

**The edge functions ARE typecheckable in this container**, which two sessions assumed they
were not. There is no `deno`, but `/opt/node22/bin/tsc` exists and `--noResolve` stubs out the
`jsr:`/`https:` imports, leaving only the four expected `Cannot find name 'Deno'` lines:

```bash
/opt/node22/bin/tsc --noEmit --noResolve --skipLibCheck --strict \
  --target es2022 --module esnext --lib es2022,dom \
  supabase/functions/<fn>/index.ts
```

That found a real blocker -- an early return that predated two new `PositionsResult` fields
and did not carry them (`TS2739`) -- in a file whose only other reader was going to be
production. **Check that a tool is absent before designing around its absence.**

**DEPLOYED 2026-09-15 as version 10** (v9 had been live since 2026-04-06). `verify_jwt`
stays false -- pg_cron calls this function, and a deploy that silently re-enabled it would
break every five-minute run.

**The deploy surfaced a repo/deployment divergence that had nothing to do with this work.**
Before deploying, the running v9 bundle was diffed against the repo's pre-change file by
pulling the ESZIP from `/functions/<slug>/body` and extracting the original TypeScript from
its embedded source map. They differed: **`main` was AHEAD by an undeployed change** --

```ts
await sql`select update_parser_heartbeat('ok', null)`.catch(() => {/* non-fatal */})
```

added by PR #707 and never deployed. Two notes on doing that diff: the bundle carries the
TRANSPILED copy at the obvious offset (types stripped, semicolons added) and the ORIGINAL
only inside `"sourcesContent"`, so diffing the first one reports hundreds of false changes;
and the stored original uses CRLF while the repo uses LF, which makes every line differ
until newlines are normalised. **Normalise, and diff the source map, not the bundle.**

### The heartbeat called a function from a migration that was never applied (2026-09-15)

Chasing that one undeployed line found a live defect nobody was looking for.
`update_parser_heartbeat` **did not exist in any schema**, `public.system_health` **did not
exist**, and `20260530000001_system_health.sql` was **absent from
`supabase_migrations.schema_migrations`** (276 rows) -- while `api/health.js` and
`src/lib/useFreshnessGate.js` both read that table. A health endpoint and a freshness gate
were querying a relation that had never been created.

So deploying `main` verbatim would have added a guaranteed-failing round trip to every
five-minute sync, swallowed by its own `.catch()` -- **the swallowed-write-failure pattern
this file already records three times, introduced knowingly.** The migration was applied
first, with three departures from the file, all of which this file already argues for:

- **`SET search_path` on the SECURITY DEFINER function.** Omitted in the original.
- **`REVOKE EXECUTE ... FROM public, anon, authenticated`.** Without it any anon caller
  could write arbitrary status and detail into the health table through a definer function.
  The real caller reaches Postgres directly over `SUPABASE_DB_URL`, not through PostgREST,
  so it is unaffected. Verified with `has_function_privilege`, not by reading the migration:
  `anon` false, `authenticated` false, `service_role` true.
- **`DROP POLICY IF EXISTS` before each `CREATE POLICY`.** `CREATE POLICY` is not
  idempotent, so the original file would fail any clean replay that ran it twice.

**An unapplied migration is invisible from both sides.** The ledger does not list it, the
database does not contain its objects, and the repo file looks authoritative -- the same
shape as the 2026-09-14 engine-definition divergence, one layer out. When a code path calls
a function, check the function exists before assuming the call is dead weight.

**`system_health.detail` IS PUBLIC. Never write an error payload into it.** The `anon_read`
policy is `USING (true)` -- deliberately, it is a health table -- and that covers every
column, `detail` included. `update_parser_heartbeat(p_status, p_detail)` accepts free text,
so a future caller passing an exception message, a URL carrying a token, or internal
operational detail publishes it to anon. Status and timestamp are the contract; anything
diagnostic belongs in `sync_log`, which anon cannot read. Raised by CodeRabbit on PR #780 as
non-blocking and recorded here because it is a loaded gun rather than a defect: nothing
writes `detail` today.

Two further points from that review, both confirming rather than correcting, and worth
keeping so the next session does not re-derive them: a `FOR ALL` policy with `USING` and no
`WITH CHECK` reuses the `USING` expression as the check for INSERT and for the resulting row
of an UPDATE, so `service_write` is sound as written; and leaving the never-applied
`20260530000001` in place is safe precisely because it sorts first and everything in the
later migration is idempotent over it.

### `marginal_vol_contribution` was never marginal (2026-09-14)

B4. Full report in `docs/B4_MCTR_BENCH_INTEGRITY_REPORT.md`.

`vw_risk_analysis.marginal_vol_contribution` is `weight * annual_vol` -- a share of the
UNDIVERSIFIED sum with no covariance in it anywhere. It cannot express that adding to a name
which offsets the rest of the book lowers portfolio risk, because nothing in it knows what
the rest of the book is, and it has no Euler additivity, which is the property B4 and the
segment layer both need.

`vw_book_mctr` computes the real derivative -- Sigma = D R D, R from
`universe_correlations` and D the sample sd **on the same 120 sessions the correlations were
estimated on**. Euler residual **2.8e-17**, shares close to 1.0000000000.

**Book vol is 19.37%, and it is corroborated rather than merely computed:** E3's factor model
gave **19.08%** from four betas and a shrunk 4x4 covariance -- a completely different route,
sharing no intermediate object. Two methods agreeing to 0.3pp is the reason to believe either.

**Take w+1 SESSIONS to get w RETURNS.** `refresh_universe_correlations` builds returns over a
DOUBLE-width close window and only then takes the last `p_window` RETURN dates, so R rests on
120 returns whose oldest consumes a close from outside the grid. Taking 120 closes and lagging
inside them gives 119 returns starting one session later -- a different sample from the one R
was estimated on. Worth one basis point here (19.377% -> 19.367%) and worth getting right:
Sigma = D R D is coherent only if D and R span the same observations. Caught in review, after
the migration comment already claimed the two matched.

**Use `correlation_simple`, never `correlation`.** The latter is EWMA-weighted at lambda 0.97,
so its effective sample is ~33 sessions and it reaches +/-0.9997 on this book. A pairwise EWMA
matrix paired with a 120-day sample vol is neither internally consistent nor reliably PSD.

**The ranking changes materially, which is the point:** MRVL 20 -> 8, CRWV 14 -> 7, JPM
9 -> 24. The old measure over-weights large positions because it never sees their moves
cancel. AU ranked **5th** and is not held at all -- see below.

### Three defects in the risk layer, found on B4's path (2026-09-14)

**Defects 1 and 2 were fixed 2026-09-15; defect 3 is audited and is the owner's call. The per-defect notes below are left as first written, with the outcome recorded against each.**

**1. `vw_risk_analysis` publishes positions the book does not hold.** `latest_pos` is
`DISTINCT ON (asset_id) ... ORDER BY as_of_date DESC` -- the latest row PER ASSET, not the
latest snapshot -- so a sold name keeps its final row forever at its last market value.
83 rows published, **63 actually held, 20 stale**, carrying **15.87% of published weight and
11.37% of published risk contribution**. The fix is one clause (scope to `max(as_of_date)`)
and the data supports it: a complete 64-66 row snapshot every day, every row non-zero.

**FIXED 2026-09-15** (`20260915051500`, PR #781), by sourcing `latest_pos` from
`vw_positions_current` rather than by a `max(as_of_date)` clause -- that view already
reconciles against the account-snapshot watermark and so is correct intraday, which a
snapshot-date filter is not. 83 -> 62 rows, 0 introduced, 21 stale dropped, `sum(weight)`
1.0168 -> **1.0000**, 58.1 -> 33.6 ms.

Two things that review corrected, both worth keeping. The old sum exceeding 1 was **not**
"shorts as a class" -- exactly ONE row was dropped, `GDX280121P00070000`, a short put
expiring 2028 (so the expiry filter misses it) with no contract tape (so the inner join drops
it). It is dropped for having **no returns**; being short only makes it negative, which is
what pushes the sum above 1 rather than below. And the three held names absent from the view
(FIDU, HMY, TGT) are **fractional dust** excluded by the view's own one-cent floor, not names
missing price history -- each carries 173 current bars.

**A denominator path remains, deliberately unfixed:** `nav` sums all of `latest_pos` while
the output is inner-joined to `vol_per_position`, so a held, non-dust name with no usable
252-day return sits in the denominator and not the numerator. Zero such names today, but by
luck -- a name bought today has a positions row within five minutes and no bar until 22:00.
Do not "fix" it by renormalising: that re-bases what `weight` MEANS on a live page. Publish
the withheld share instead, the `measuredWeightPct` / `withheldWeightPct` construction.

**2. `book_risk_daily.total_vol_annual` squares the weights AND re-annualises.** This is the
mechanism behind the 2.4x understatement flagged below:

```
Sum(w_i * sigma_i)                  = 34.83%   undiversified, correct units
Sum(w_i^2 * sigma_annual) * sqrt(252) =  9.90%   <- what is published (10.78%)
```

Two independent dimensional errors that partially cancel into a plausible-looking 10.8%.
Realised is 24.8-28.9%; B4's 19.37% and E3's 19.08% are coherent, 10.78% is not.

**FIXED 2026-09-15** (`20260915053000`) -- see the CLOSED entry below for the basis-column
design and why `logic_version` was not bumped.

**3. The column name asserts a measure the field does not carry** -- the `fwd_pe` lesson
again. **When a column's name asserts a measure, check the field it reads, not the alias.**

**DONE 2026-09-21** -- `docs/DEFECT3_MCTR_REBASING_REPORT.md` and the entry
"Five of seventeen themes were the wrong sign" below.

Each of these re-bases a live page, so each is its own decision, not a fold-in.

### Defect 3 is a re-basing, not a rename (2026-09-15)

The consumer audit, in `docs/DEFECT3_MARGINAL_VOL_CONSUMER_AUDIT.md`. Scoped as
"rename the misnamed column" and it should not be done that way.

**No live code reads it.** The only consumers are `ui/pages/risk_analysis.py` and
its tests -- Streamlit, retired. No file in the React terminal touches it.

**Three database consumers, and two persist it.** `atlas_write_verdicts` (8
references, into `position_verdicts.marginal_vol_contribution`,
`cluster_risk_share` and `book_risk_daily.total_vol_annual`) and
`atlas_write_segment_verdicts` (`mvc * weight AS rc`, into
`segment_verdicts.risk_share`). `vw_position_risk_thesis` is already clean --
E1.3 reads `vw_book_mctr.risk_share`.

**Ten of forty-three segments have the WRONG SIGN.** Recomputing the latest
`BY BET` segmentation under B4's Euler measure (shares closing to 1.000000):
15 segments move more than 1pp, the largest by **+18.69pp** (Cluster 201,
50.22% -> 68.90%), and ten carry a **negative** Euler contribution -- they
diversify the book -- while being published as positive risk consumers.
`weight x vol` is positive by construction and can never report an offset.

**A per-position rank error becomes a sign error once members are summed.**
B4 measured the ranking damage per name (MRVL 20 -> 8, JPM 9 -> 24); at segment
level it is worse, because the offsets that cancel inside a cluster are exactly
what the measure discards. Grouping does not average the error out, it
concentrates it.

764 `position_verdicts` rows and 288 `segment_verdicts` rows are already written
on this basis and are append-only, so the fix is version-scoped and declares the
basis on the row -- the `peer_basis` / `dispersion_basis` / `vol_basis`
construction. Sequenced after defect 2, which removes the `total_vol_annual`
dependence.

### Five of seventeen themes were the wrong sign (2026-09-21)

Defect 3, applied. Full report in `docs/DEFECT3_MCTR_REBASING_REPORT.md`. Both
nightly jobs now read `vw_book_mctr`'s Euler measure instead of
`vw_risk_analysis.marginal_vol_contribution`.

**Both consumers multiplied the column by weight AGAIN**, because each believed
it held a partial derivative -- `mvc * w_norm` in `atlas_write_verdicts`,
`mvc * weight` in the segment job. The 2026-09-07 entry above records that form
being *checked before use*; the check reached the wrong conclusion, and the
product was `weight^2 * vol` -- defect 2's dimensional error, arriving here
through a comment asserting a form the column never had. **A comment that
states a column's form is not evidence of it.**

**A per-position rank error becomes a SIGN error once members are summed**,
because the offsets that cancel inside a cluster are exactly what `weight x vol`
discards. Grouping concentrates the error rather than averaging it out. On the
2026-09-18 book: 16 of 62 positions negative (0 were, by construction), 14 of 44
bets, and **5 of 17 themes**:

| theme | weight | written | Euler |
|---|---:|---:|---:|
| AI / accelerated compute | 24.0% | 54.95% | **64.71%** |
| Healthcare / defensives | 10.3% | 5.28% | **-0.98%** |
| International / EM ETFs | 10.3% | 9.16% | **15.27%** |
| Software / SaaS | 2.5% | 1.88% | **-1.82%** |
| Energy | 4.4% | 1.43% | **-0.22%** |

**The defensive sleeves were published as risk CONSUMERS.** Healthcare at a
tenth of the book offsets risk -- the one thing a defensive sleeve is bought to
do -- and a measure that is positive by construction cannot report it.
`effective_bets` 3.263 -> **2.322**: the book is more concentrated than
published, not less.

**Euler additivity is why the invariants survive.** Sum of contributions =
book vol = 0.19996028, residual **0.000000000000** at twelve decimals, so
cluster shares still close to 1.0000000000 with sixteen buckets negative. It is
also why `book_risk_daily`'s `(sum_contributions, residual)` became an IDENTITY
-- 0.199960 = 0.193185 + 0.006775, the residual being exactly the two matrix
names the verdict layer does not rank. It had been `sum(mvc * cluster_risk_share)`:
a per-position figure times a per-cluster share, dimensionless, reconciling to
nothing.

**The basis is on the row; `logic_version` is NOT bumped.** That string is a
parameter fingerprint (`rho0.75:n5:mwr`) and none of those parameters changed,
so a bump would assert a change that did not happen -- the mirror of the error
defect 2 avoided. 1,006 + 531 rows backfilled to `weight_x_vol_undiversified`.
Checked first: no consumer pins a version value.

**`effective_bets` changed basis and IS consumed** (`bookBaseline.js`). `1/sum(s^2)`
over SIGNED shares is not the textbook HHI, which assumes non-negative weights.
Sum(s^2) is 0.43 here so it behaves; a heavily hedged book could push it above 1
and drive the figure below 1. That is a real reading, not a bug -- write it down
before it happens.

### A CHECK passes on NULL, so enumerating the states is not enough (2026-09-21)

Found by TESTING the constraints added for defect 3 rather than reading them,
then asking whether the shape existed elsewhere. It did, on the constraint this
file already records being rewritten once for a related fault.

```
vol_basis = NULL, total_vol_annual = 0.195, vol_matrix_as_of = NULL
  branch 1: (total_vol_annual IS NULL)                           -> FALSE
  branch 2: TRUE AND (NULL = 'weight_sq_undiversified') AND TRUE  -> NULL
  branch 3: TRUE AND NULL AND FALSE                               -> FALSE
  FALSE OR NULL OR FALSE  ->  NULL  ->  the CHECK PASSES
```

So **`book_risk_daily` was accepting a vol figure with no basis at all** --
exactly the state `20260915074500` was written to forbid, and which the entry
above calls "now true rather than merely written down". It was not true. The
enumerated rewrite inherited the hole from the implication it replaced.

**Enumerating the permitted states is necessary and NOT sufficient: the
enumeration has to be TOTAL.** A `CASE` over `IS NULL` / `IS NOT NULL` tests
with `ELSE false` cannot yield NULL on any input; an OR chain of `=` comparisons
against a nullable column always can. All three constraints are now CASE forms.
14 violating states refused, 0 wrongly accepted, nothing written.

Same family as PR #783's NaN finding, and the same lesson: there a one-sided
bound admitted a sentinel that sorts above every finite value, here three-valued
logic admits a NULL that short-circuits an OR chain. **Both look correct on
inspection and both are found only by trying the value.** Verified by UPDATE
inside a rolled-back subtransaction, never by reading the definition.

### `CREATE OR REPLACE` on a guessed signature makes a second function (2026-09-21)

`atlas_write_verdicts` takes THREE arguments (`p_as_of`, `p_logic_version`,
`p_refresh`). A first attempt assumed two, so `CREATE OR REPLACE` created a
**second overload** rather than replacing -- leaving the real job untouched and
the new one live for any two-argument call, which is what a caller relying on
`p_refresh`'s default would have made. Caught by the result returning two rows
where one was expected, dropped within one call, redone.

**Read `pg_get_function_identity_arguments` before `CREATE OR REPLACE`.** A
function is identified by its argument types, not its name, and the failure is
silent: the old body keeps running while the new one sits beside it.

### A stacked proportional band cannot carry a negative (2026-09-21)

The bets strip laid its segments out on the signed risk share. Once some shares
are negative the positives alone exceed 100% of the width, and
`Math.max(0.15, share * 100)` collapsed every negative to a hairline while its
tooltip printed the negative number -- a bar saying one thing and a number
saying another. `TwoBar` had the same shape: `Math.max(0, ...)` clamped a
negative to zero width beside a label showing it.

Width now comes from share of **gross** risk (`|contribution|` over the sum of
`|contribution|`), which IS a genuine part-to-whole of a real quantity, and the
caption states that basis rather than leaving "risk share" to be read off a bar
that no longer means it.

**Polarity is carried by TEXTURE, not colour.** Colour in that strip is already
doing identity -- hue is rank, and the segment rows below reuse it so a reader
can carry a segment from the band to its row -- so putting sign on the same
channel would collide with it. Hatch, plus the count in the caption, plus the
words in the tooltip: never colour alone, never texture alone.

**An unmeasured segment must not sort as zero.** `(b.riskShare || 0)` put a null
above every genuine offset -- claiming the segment nobody could measure carries
more risk than the ones that demonstrably reduce it. Nulls sort last, get NO
width (absent, not 0), and are counted.

**And the reading understated the best outcome available.** Any negative share
is below `weightShare * 0.5`, so a sleeve that LOWERS book volatility fell
through to "on a fraction of its risk". It says "lowering its risk" now.

The 56-file suite passed **unchanged** across the whole re-basing, because every
fixture carried a positive share -- under the old measure a negative one was
impossible by construction. `segmentRiskBasis.test.mjs` carries a negative and
an unmeasured segment in every fixture; 7 of its 10 fail on the pre-fix code,
checked by reverting.

### The Risk page fabricated 60% of its correlation matrix (2026-09-21)

Two defects in `risk-v2.js`, and the second is why the first survived. Full
report in `docs/RISK_V2_TRUNCATION_AND_ZEROFILL_REPORT.md`.

**The 1,000-row cap, sixth layer.** `loadRiskData` batched
`vw_position_nav_daily` 20 symbols at a time, `.order('price_date')`
ASCENDING, `.limit(chunk.length * 120)` = 2,400. A 20-symbol chunk holds
~2,700 rows, so three of the four chunks received the oldest 1,000 and
stopped at **2026-05-08 / 06-03 / 05-29** against a book running to 09-18 —
and the seven or eight symbols past each cut got **nothing at all**, 22 of 62
names, because an ascending sort spends the budget on old dates before it
reaches them. After `nexus-bench`, `nexus-theme`, `performance-suite`, the
pair explorer and the Trade risk layer. **`limit` is a request; so is no
limit.**

**The zero-fill is the reason nobody noticed.**
`rets.push(p0 && p1 && p0 > 0 ? (p1 - p0) / p0 : 0)` — a date with no bar
became a REAL 0.00% return, so a name that received zero rows produced 184
flat sessions rather than an error, a gap or an empty panel.

And it was never only a truncation artefact. `vw_position_nav_daily` carries
a row only for a date the position was HELD, so every name bought mid-window
is zero-filled back to the start: **0 of 63 equities had full coverage and
5,889 returns were fabricated** — TTWO 185 of 185, MA 183 against 2 real
bars, APH 181, INTU 178. **A vector of zeros has zero variance, so the name
reads as riskless, and zero covariance, so it reads as a perfect
diversifier** — the two most flattering answers available, neither of them
measured.

**Every guard tested ARRAY LENGTH** (`a.length > 5`, `posRets.length < 5`),
which the zero-fill satisfies by construction. The fabrication made itself
invisible to the checks written to catch it. **Count measured observations,
never slots.**

Replayed in SQL over all 1,953 equity pairs, with the exact truncation and
the zero-fill, against the same computation on complete data:

| | on screen | corrected |
|---|---:|---:|
| average pairwise correlation | 0.0728 | **0.1913** |
| Diversification Score | **93 / 100** | **81 / 100** |
| cells published as a fabricated `0.00` | **1,173 of 1,953** | — |
| pairs with the **wrong sign** | **132** | — |
| pairs off by more than 0.25 | 94 | — |

**The two defects partially cancel in the average and not in the cells.**
Zero-fill alone takes 0.1913 to 0.1219; adding the truncation takes it back
to 0.1823 on the pairs still computable, while sign inversions go 35 → 132.
An aggregate that looks nearly right over constituents that are individually
wrong is this file's recurring shape — `nav_reconciliation` passing while
four positions were broken, and a rank error becoming a sign error once
members were summed.

`src/lib/riskReturnSeries.js` yields **null, never 0**, for an absent bar;
`corrPairwise` returns **null, never 0**, when a pair cannot be measured
(the old helper's `denom > 0 ? … : 0` published "uncorrelated" for a
constant series); and `partitionBySufficiency` withholds a name below the
floor and names its weight. An unmeasurable heatmap cell renders `·` with no
fill and is excluded from the average rather than dragging the book's
reported diversification upward for free.

**A fixture that supplies a move for every slot cannot detect this.** The
20 tests carry the live shapes — a name bought two days ago, a name with no
bars — and a pair measuring **-0.9999** whose zero-filled estimate is
**+0.1827**: same data, opposite signs. Reverting the module to the shipped
behaviour fails **11 of the 20**, checked by reverting rather than assumed.

### Order DESC is half the rule; the other half is order on a TOTAL key (2026-09-21)

`src/lib/pagedRead.js` is the one paged PostgREST read. DESC decides what a
truncation costs — lose the oldest bars, never the current session — and
this file already said so. What it did not say is that **`LIMIT`/`OFFSET`
over a non-total ordering has no consistency guarantee between requests**,
so a time series ordered by date alone, where hundreds of rows share a date,
can repeat or skip rows across a page boundary. H-2 recorded this as "paging
without an ORDER BY is unstable"; an ordering that is not total is the same
defect wearing a clause.

Three existing pagers order on a non-total key and are latently unstable:
`performance-suite.js` (`price_date`), `nexusMarketPrices.js` (`date`) and
`risk-model-validation.js` (`as_of`, ~24 rows apiece). `tradeData.js` and
`clusterIdentity.js` are total and fine. **Flagged, not migrated** — that is
a refactor of five working readers, not part of a fix.

`label` is a REQUIRED argument so the `MAX_PAGES` cap can name the relation
it truncated, and the cap exists because the loop is driven by the server's
own response: **a hang is the one failure that reports nothing at all.**

### A tiebreaker must be checked against the unique index, not chosen by eye (2026-09-21)

The three pagers the risk-v2 fix flagged, closed. Full report in
`docs/PAGER_TOTAL_ORDERING_REPORT.md`.

**The exposure was total, not marginal.** A row is ambiguously ordered when
another row shares its whole sort key, and OFFSET paging can then place it
either side of a page boundary:

| relation | rows | ambiguous under the OLD key | widest tie |
|---|---:|---:|---:|
| `price_history` (1y, `1d`) | 384,164 | **384,164** (100%) | **1,900** |
| `market_prices` | 120,152 | **118,896** (99.0%) | 19 |
| `var_backtest_runs` | 120 | **120** (100%) | 24 |

One `price_history` date is shared by **1,900 rows** — nearly two full pages
under a single sort key. Zero ambiguous rows under the new keys.

**Each tiebreaker came from the relation's unique index**, and two of the
three would have been wrong by eye. `price_history` is unique on
`(asset_id, price_date, "interval")`, so `(price_date, asset_id)` is total
**only once the interval is pinned**. `var_backtest_runs`' business key
carries a **nullable** `axis_key` inside a `coalesce`, so the `id` PK is the
cleaner tiebreaker than any column of the key itself. Only `market_prices`,
keyed `(symbol, date)`, was the obvious one.

**`.range()` is `offset`/`limit` on the wire** — confirmed by printing the
built URL, not assumed. That is the whole reason a total order is required.

All three now page through `pagedRead.js` instead of a local loop, which is
not tidying: each loop was driven by the server's own response with **no
cap**, so a server that stopped honouring `range` would spin forever.

### `price_history` carries two interval spellings and one of them is SPY (2026-09-21)

Found while choosing `performance-suite.js`'s tiebreaker, because the
interval is part of the unique key and the read filtered neither `interval`
nor `source`:

| interval | source | rows (1y) |
|---|---|---:|
| `1d` | alpaca | 381,722 |
| `1d` | yfinance | 2,442 |
| `1Day` | yahoo | **124** |

The 124 are **all SPY**, all on dates that ALSO carry a `1d` bar, and **every
one has a different close** — 0.315% apart on average, 0.786% at worst. So an
unfiltered read returns two closes for one session and the series handed
downstream carries a duplicate date with two prices, which a positional walk
reads as two sessions. **SPY is the benchmark**, so anything reaching for it
gets the collision.

Latent in that file only because `equityIds` comes from the book and SPY is
not held. All 1,914 assets have `1d` rows and exactly one has any non-`1d`,
so `interval = '1d'` drops no series. **No other `price_history` reader
filters it either** — `tradeData.js:441`, `pcm.js:1238`,
`advanced-chart.js:542`, `NexusRealized.js:475` and `:583`. Flagged.

### A scanner that reads its own documentation as code (2026-09-21)

`src/lib/pagerOrdering.test.mjs` scans `src/` and fails any paged read whose
chain declares fewer than two `.order()` calls — the rule being repo-wide
rather than "these three files", so the next one fails in CI instead of in
production. Its first run was wrong in two ways, both now tested for:

- **It counted `.order(` inside comments.** The prose around these reads is
  *about* ordering. Comment lines are stripped before counting.
- **A long comment between `.from(` and `.range(` hid the chain**, so the
  two files this very fix had just annotated reported **zero** order keys.

**A detector that reports the wrong thing is worse than none**, so it carries
a test feeding it the exact pre-fix shape and requiring a hit, a test that it
finds several reads at all (a vacuous scan passes trivially), and tests for
both failure modes above.

**A single key that is already unique IS total; demanding a second is cargo
cult.** `vw_cluster_identity.cluster_id` (206 rows, 206 distinct, 0 ties) and
`vw_portfolio_nav_daily.price_date` (185/185/0) carry a `TOTAL ORDER:`
comment naming the key and its measurement. The justification sits beside the
code rather than in an allowlist inside the test, where it would rot away
from what it describes.

### `pcm.js` drops 69% of its price history and reads 25 hours as a year (2026-09-21)

Found on the same sweep, **live and not fixed** — it is a different page and
a different defect class, so it is its own unit.

**The seventh instance of the 1,000-row cap.** `pcm.js:1238` is byte-for-byte
the pre-fix `performance-suite` read: 15 ids per batch, `price_date`
**ASCENDING**, `.limit(batchIds.length * 260)` = 3,900, no paging. Four of
five batches stop between **2025-12-24 and 2026-01-09** against a book
running to 2026-09-18; **10,897 of 15,897 rows dropped**. It pushes
`{ close }` with the date discarded, so nothing downstream can detect it.
`PortfolioConstruction` is routed from `app.js`.

**And a 252-row window that spans 25 hours.** The same loader reads
`account_snapshots` with `.order('as_of', { ascending: true }).limit(252)`.
That table holds **48,440 rows** across 169 days at one row per five minutes,
so ascending-plus-252 takes the **oldest** 252 — **2026-04-06 10:47 to
2026-04-07 07:35**. `computePortfolioMetrics` is handed one day of intraday
snapshots as if it were a year of daily equity. Not a paging bug, and the fix
is a decision rather than a correction: 252 *sessions* of daily closes means
a different query, not a reordered limit.

**`.limit(1600)` on `price_history` in `advanced-chart.js:542` and
`NexusRealized.js:583`** returns 1,000. Both order DESC so they lose the
oldest bars rather than the session — the benign direction — but they believe
they hold 1,600 bars.

### PCM measured a 25-hour window as a year (2026-09-21)

Both defects the pager sweep flagged, fixed. Full report in
`docs/PCM_TRUNCATION_AND_WINDOW_REPORT.md`.

**The truncation's damage is a STALE window, not a short one.** `pcm.js`
dropped 10,897 of 15,897 price rows (69%), and because both consumers read the
**last 90 entries** of each array (`prices[n - i]`), `vol_90d` became a 90-day
window ending between **2025-12-23 and 2026-05-20** — all 63 symbols —
published as current. The comment above the read said "~3 900 rows — safely
within limits", which is the arithmetic of the defect rather than a bound.

**`account_snapshots` is written every five minutes**, so ASC + `limit(252)`
took the oldest 252 rows: **2026-04-06 10:47 to 2026-04-07 07:35**, annualised
by `* 252` as though each were a session. Published **1.25% against a realised
26.17%**, and `diversificationRatio` divides by it.

**The mechanism under-states, which is why nobody queried it.** A five-minute
return is the daily one over sqrt(78), so annualising by sqrt(252) instead of
sqrt(252 x 78) under-scales by **8.83**; the rest of the 21x is the 25-hour
window being quiet. A vol that reads too LOW beside a healthy-looking
diversification ratio is a comfortable number, not an alarming one.

Now reads `vw_book_realised_returns` — one row per session, C1's two rules
already applied, `session_date` unique (183/183) so the ordering is total.
**`computePortfolioMetrics` takes RETURNS, not levels**, because differencing a
*filtered* equity series is the C1 trap again: drop a stale snapshot,
difference what remains, and the return spans the gap. Taking returns makes it
impossible to write rather than discouraged.

**The fixture was wrong and the code was right.** Its first draft shrank each
return by 78 and asserted a ratio of 8.83, then measured 79.5 — variance adds,
volatility does not. Corrected rather than loosened. 4 of its 7 tests fail
against the old contract, checked by restoring it.

### An unused `export const` is tree-shaken, so it cannot prove a file ships (2026-09-21)

Verifying that fix turned up an anomaly that is **not resolved**, and the way
it was chased is the part worth keeping.

With the fix in place the emitted bundle is **byte-identical** to the pre-fix
one, and `vw_book_realised_returns` does not appear in it — nor does
`vw_risk_analysis`, which occurs 6 times in `src/`.

| probe | result |
|---|---|
| `export const MARKER` appended to the file | absent — **the probe was invalid**: rollup shakes an unused export |
| `console.log(MARKER)` at module level | **present**, hash changed |
| `console.log(MARKER)` inside the loader body | **absent**, hash unchanged |
| sourcemap `sources` | the file **is** listed, among 150 `src/` modules |

The last two contradict each other, and `app.js` holds a live
`TABS.find(...).component` reference that should be unshakeable. Either a large
part of the page layer is missing from the production bundle — much bigger than
the two defects above — or a probe is still misleading me.

**Grep counts LINES, not occurrences**, and a minified bundle is few very long
lines, so `grep -c` reads as a present/absent flag and silently agreed with a
wrong hypothesis for several rounds. Use `grep -o | wc -l`.

**What is proven and what is not, stated apart:** the source is correct, the
arithmetic is tested, and every figure above is measured against the live
database. That this code path executes in the deployed app is **not** proven.
Its own unit; it must not ride on a fix.

### `filter` removes elements, so its indices are not slots (2026-09-21)

`risk-v2.js` built `portfolioReturns` with `.filter()` and then indexed it
against the per-symbol series, which is keyed by date-grid slot. It is exact
today **only by accident**: exactly one row is dropped — the first, whose
`daily_return` is null — and dropping the head shifts nothing. Any future
gap mid-series would have offset every correlation by one day, silently.
`portfolioReturnsAligned` is built explicitly on the grid; the dense array
stays for the drawdown and rolling-vol panels that walk it contiguously.
**A dormant defect costs nothing to fix while the context is loaded.**

**`vite build` is not a caller audit, and it is not a scope audit either.**
The patch that added that variable first inserted it ABOVE
`var d = props.data` in two components. `var` hoists, so `d` would have been
`undefined` and both tabs would have thrown on mount — and the build
reported success. Caught by reading the patched region. Same lesson as
`perf-panels-top.js:477`, where a call inside a `useMemo` was invisible to
the bundler, one step earlier in the edit.

### A panel that hardcodes a sign asserts something the data may not support (2026-09-21)

The conditional-correlation panel printed `'+' + surge.toFixed(0) + '%'` and
the sentence *"Correlation rises from A to B — a X% surge."* A book whose
correlations FALL under stress is the good case, and it would have rendered
`+-12%` in alarm red beside a claim that did not happen. Latent before —
and changing the inputs, as this fix does, is exactly what can move a number
across zero. Both now read the sign off the number, and the panel states how
many of its pairs were measurable. Same family as the stacked band that
could not carry a negative once risk shares went signed.

### Drift is only evidence where the book is exposed (2026-09-14)

Two rules gate what B4 lets E1's drift say, and on this book they disagree with the naive
reading in opposite directions.

**Drift is in sigma, never in raw score.** `drift_score_20d` is a difference of 20-session
SUMS whose sd runs 4.19 (`dollar`) to 8.22 (`cyclical`), so raw magnitudes are not comparable
across axes. It inverts the answer: raw ranks `cyclical` first (6.725), sigma ranks `dollar`
first (1.277 against cyclical's 0.818). Third place this file has recorded that trap.

**An axis moving is evidence only if the book is exposed to it**, so axes are gated on
`book_factor_betas.significant`. `cyclical` fails (t = 0.948) -- the same axis raw ranking
would have put on top. Two independent reasons to exclude it.

**`factor_axes.marginal` is NOT that gate and must not be used as one.** It means the
component barely cleared the Marchenko-Pastur noise edge -- a property of the PCA, not of the
book. `dollar` is `marginal = true` AND the book's most significant exposure (t = -10.111).
Reading `marginal` as "no measurable exposure" withholds the axis that matters most and
publishes the one that matters least.

**B4 publishes magnitudes and no flag** -- E1.4 is deferred by the ruling's section 8 until
30 days of E1.3 observation. The test asserts the ABSENCE of any flag-shaped column rather
than trusting it.

**The finding: 45.86% of book risk sits in positions with no thesis on file** (37 of 61), and
three of the top five contributors -- EWY, TSM, ASML -- have nothing written down. Every
thesis that does exist is `untested`: all 27 `bench_claims` rows, none ever confirmed or
contradicted. So the thesis-state axis of the join is a constant today and all the variation
comes from drift. `no_thesis` is its own class and is never folded in with a healthy thesis.

### The Risk page understated book vol by ~2.4x -- CLOSED 2026-09-15 (2026-09-14)

Surfaced while sanity-checking E3. `book_risk_daily.total_vol_annual` read **10.78%**
(2026-09-11). Realised equity-curve vol over settled returns is **24.84%** (60 sessions),
**28.93%** (120) and **26.24%** (full 172). E3's factor-model unconditional is 19.08%, which
should sit below realised since the model explains 77.8% of variance.

A holdings-based forward estimate and a realised backward one do differ. None of that
accounted for a factor of 2.4 against every window measured.

**The cause was dimensional, not statistical.** `sum(mvc * weight) * sqrt(252)`, where `mvc`
is ALREADY `weight * annual_vol` -- so it squared the weight AND re-annualised an
already-annual figure. Two independent errors that partly cancel, which is exactly why the
result looked plausible instead of absurd. `total_vol_annual` now reads
`vw_book_mctr.book_vol_annual` (Sigma = D R D, B4): **19.52%**, corroborated by E3's 19.08%
from a completely independent route.

**The series carries a basis column rather than a version bump.** `atlas_write_verdicts`
writes `position_verdicts` AND `book_risk_daily` under one `logic_version`, and
`position_verdicts` semantics did not change -- bumping would falsely restate a verdict
history to mark a change in one column of a companion table. A parallel column was rejected
for the `total_return_pct` / `unrealised_return_pct` reason this file already has an entry
about. So `vol_basis` declares the method per row (`weight_sq_undiversified` on the 13
backfilled rows, `mctr_covariance` after), and `vol_matrix_as_of` records WHICH correlation
snapshot the figure rests on -- `ts_clusters` is on record failing with a 504 and leaving a
downstream job on a stale partition, and a silently stale matrix would move this number with
nothing on the row to say so.

**The discontinuity is legible at the exact row where it happens**, which a silent
recomputation would not be.

**The first constraint did not enforce what this entry originally claimed it did.** As
shipped it read `total_vol_annual IS NULL OR (vol_basis IS NOT NULL AND btrim(vol_basis)
<> '')` -- a figure implies a basis, and nothing else. It permitted a basis with no figure,
`mctr_covariance` with no `vol_matrix_as_of` (the provenance column defeated),
`weight_sq_undiversified` WITH a matrix date it never used, and any non-blank string as a
basis, so a typo became a stored measure. Raised by CodeRabbit on PR #782; **the prose here
asserted a biconditional the code never checked**, which is this file's own recorded failure
mode one layer up from a comment.

`20260915074500` replaces it with the three permitted states and nothing else -- all-null,
`weight_sq_undiversified` with no matrix date, `mctr_covariance` with one -- so the
biconditional is now true rather than merely written down. Verified before applying: 13 rows,
0 would violate, and `vw_book_mctr` returns both columns non-null on all 61 rows so the
nightly write satisfies it. `supabase/tests/book_risk_daily_vol_basis_contract.sql` proves
six refusals and three acceptances.

**`NOT VALID` was rejected rather than skipped.** Squawk flags a plain `ADD CONSTRAINT` for
taking ACCESS EXCLUSIVE and scanning the table -- sound on a large table, irrelevant at 13
rows, and here it inverts the intent: `NOT VALID` means existing rows are NOT checked, and
checking them is precisely what proves the backfill was coherent. **A linter rule aimed at a
million rows is not advice about thirteen.**

### A dumped function definition needs a terminator (2026-09-15)

The defect 2 script failed on first run with `42601: syntax error at or near "insert"`.
`pg_get_functiondef` returns the body ending in a bare `$function$` with **no trailing
semicolon**, so concatenating it with any following statement glues the two together and the
parser fails at the next statement, not at the real fault.

**Parse-check any assembled script before handing it over.** There is no `psql` connection in
this container but `pglast` (a wrapper over libpg_query, the actual Postgres grammar) installs
and works:

```python
import pglast; pglast.parse_sql(open(path).read())
```

The broken copy reproduces the exact error and the fixed one returns 11 statements, so the
terminator is proven to be the cause rather than assumed. **`pg_get_functiondef` output is a
fragment, not a statement.**

Note the dumped body uses **CRLF** while the repo uses LF -- the same quirk recorded for the
ESZIP source-map diff. Normalise before diffing a dump against a file or every line differs.

### NaN walks through every ordering CHECK (2026-09-15)

Raised by CodeRabbit on PR #783 against `var_backtest_runs`, and it is the most
useful review finding this codebase has had, because it generalises to every
numeric constraint in the repo.

**PostgreSQL sorts `numeric 'NaN'` ABOVE every finite value.** Verified rather
than taken on trust:

```
'NaN'::numeric > 0          ->  true
'NaN'::numeric >= 0         ->  true
'NaN'::numeric > 3.841459   ->  true
'NaN'::numeric <> 'NaN'     ->  false    (PostgreSQL treats NaN as equal to itself)
```

So a NaN row satisfied `sd_pred_daily > 0`, satisfied `cvar_pred_daily >
var_pred_daily` **from either side**, satisfied `kupiec_lr >= 0`, and satisfied
**both** `kupiec_reject_*` flag bindings with the flags set true. Fifteen CHECKs
written specifically so a row could not claim something it had no evidence for,
and one sentinel passed all of them.

**CORRECTION (2026-09-22): this entry originally said "numeric NaN equals
itself; float does not". That is FALSE in PostgreSQL and was repeated into the
EQ-2 peer view's comment before CodeRabbit caught it on PR #804.** Measured on
PG 17.6: `'NaN'::float8 = 'NaN'::float8` is **true**, and `'NaN'::float8 > 1e308`
is **true**, exactly as for `numeric`. Postgres deliberately departs from IEEE
754 for BOTH types so that NaN sorts and can sit in a btree. The IEEE rule
(NaN != NaN) is what most languages do and is what I was remembering; it is not
what this database does.

Nothing else in this entry moves -- the finding is that a one-sided bound admits
NaN, and it admits it under either type. **A fact about a database is measured
in that database, not recalled from the standard it implements.**

**A one-sided bound is NaN-permeable; a two-sided range is not.** `lw_delta >= 0
and lw_delta <= 1` on `book_regime_cvar` refuses NaN already, because the UPPER
bound fails. That asymmetry is exactly why this is invisible on inspection --
the constraint beside it, written the same afternoon in the same style, is safe.

**The first guard was `x IS DISTINCT FROM 'NaN'::numeric` and that was WRONG,
corrected four hours later on the same PR.** `numeric` carries `'Infinity'` and
`'-Infinity'` as well, and `'Infinity' IS DISTINCT FROM 'NaN'` is **TRUE** -- so
a +Infinity `kupiec_lr` still satisfied `>= 0` and both flag bindings with the
flags true, which is the exact row the guard was written to refuse. It closed
one of three doors.

**The two-sided range is the whole guard**, and it is the same insight as the
paragraph above applied to the fix itself:

```
                       x > '-Infinity' and x < 'Infinity'   x IS DISTINCT FROM 'NaN'
  NaN                  false                                false
  +Infinity            false                                TRUE     <- leaked
  -Infinity            false                                TRUE     <- leaked
  0.012                true                                 true
  null                 null  (CHECK passes)                 true
```

NaN and +Infinity both fail the UPPER bound, -Infinity the lower, and NULL
yields NULL so nullable measurements are untouched. **Write the range; do not
enumerate the sentinels.**

**Guarded at `book_regime_cvar` too, because that is where the value is
created.** `brc_vol_positive_ck` has the identical hole and the conditional
bound downstream is `z x vol_daily`, so a NaN admitted there arrives already
laundered through arithmetic. A gate applied at the consumer is missed by the
next consumer -- the same argument that put the price-basis gate in the engine
rather than per consumer.

Added as a new constraint rather than by rewriting `brc_vol_positive_ck`, so the
positivity rule keeps its name and its history.

**The equity series had no guard at either end**, found in the same review.
`vw_book_realised_returns` filtered `pec.equity > 0` (the lower half of a range,
so NaN and +Infinity both passed) and `portfolio_equity_curve` carried **no
numeric constraint at all**, only `data_quality`. A non-finite level
contaminates TWO realised returns -- into it and out of it -- and would then be
counted as a usable settled observation. `pec_finite_ck` guards the table and
the view's filter is now two-sided.

`supabase/tests/var_backtest_invariants.sql` is **22/22 against production**,
including the three NaN refusals, the three infinity refusals, and the row that
matters most -- a non-numeric `kupiec_lr` with both rejection flags true, which
is a verdict with a non-number as its evidence.

**Check every one-sided numeric CHECK in the schema for this.** Find candidates
with:

```sql
select conrelid::regclass, conname, pg_get_constraintdef(oid)
from pg_constraint where contype = 'c'
  and pg_get_constraintdef(oid) ~ '[><]=?\s*\(?[0-9]'
  and pg_get_constraintdef(oid) !~* 'NaN';
```

### One existing row skipped every confidence level (2026-09-15)

Third finding from the same review. `atlas_write_var_backtest`'s presence check
counted rows for `(as_of, logic_version)` and **not per confidence**, so a call
with `p_confs = ARRAY[0.95]` wrote its 8 rows and then permanently blocked the
nightly default call from ever writing 90% and 99% for that `as_of` -- logging
`skipped, already written` on a night two thirds of the readings are missing.
The "no-op dressed as success" pattern, in a job written the same day to avoid
exactly that.

It now attempts every requested confidence on every run, with `ON CONFLICT DO
NOTHING` per row.

**That is safe here and the distinction is the point.** The segment job's
`DO NOTHING` failed because a segment id is derived from a CLUSTERING recomputed
nightly, so two segmentations coexisted. This key --
`(as_of, logic_version, leg, basis, axis_key, conf)` -- comes from the panel
date, a fixed two-element leg set, a fixed two-element basis set and the
`factor_axes` rows. Nothing in it moves under recomputation. **Before reusing an
upsert key, ask whether it survives recomputation** -- asked, and here it does.

**Proven in a rolled-back transaction rather than asserted**: under a throwaway
`logic_version`, a 0.95-only call then a default call gives **8 rows -> 24 rows,
3 distinct confidences**. The old code gives 8 -> 8 -> 1. `rows_present_before`
is logged beside `rows_written` so a partial fill is legible as one.

### The exit mechanism was fixed at the writer and missed at the reader (2026-09-15)

Reported from the terminal, the day after the writer fix shipped: KMTUY,
liquidated 2026-09-14, still on the holdings table at 0.1% of book, publishing a
weight, a conviction score and a **+6.3% move**.

`sync_alpaca_positions` v10 was deployed that morning and is doing its job --
`positions` has no KMTUY row for 2026-09-15 and `vw_positions_current` is
correct at 65. The phantom was one layer out. **`vw_portfolio_home` built its
book itself**, and built it the way `vw_risk_analysis` used to:

```sql
SELECT DISTINCT ON (asset_id) ...  FROM positions
 WHERE as_of_date >= (SELECT max(as_of_date) - 2 FROM positions)
 ORDER BY asset_id, as_of_date DESC
```

The latest row **per asset** over a **three-day** window -- so a name sold on
any of the last three sessions keeps its final row at its last market value and
leaves by **ageing out rather than by being sold**. KMTUY would have vanished by
itself on 09-17 and nothing would have been learned, which is exactly why this
reads as an intermittent phantom.

**Deploying the writer does not close a defect a reader reproduces.** The 09-14
entry says "deploying it fixes all 21 views with no view change" -- true of the
21 views that read `positions` directly, and this one does not read it directly;
it re-derives the book. Enumerate the re-derivers too:

```sql
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m')
  and pg_get_viewdef(c.oid, true) ~* 'DISTINCT ON \(.*asset_id';
```

**The blast radius was the flagship.** `mv_nexus_holdings` reads
`vw_portfolio_home`, `vw_nexus_holdings` reads that matview, and
`mv_bench_contribution` reads that -- so holdings, the Theme cut and the bench
docket all served the same phantom row. 63 -> 62 everywhere after one view
change plus a matview refresh.

Sourced from `vw_positions_current`, not from a `max(as_of_date)` filter, for
the reason that view exists: it reconciles `updated_at` against the
account-snapshot watermark and so is correct **intraday**, which a snapshot-date
filter is not.

**Proven by shadow view, not by inspection.** The patched definition was created
under a throwaway name and `EXCEPT ALL`'d both ways against the live view across
all 26 columns: **one row differs, it is KMTUY, nothing is added**. `n_positions`
63 -> 62 and `hhi_score` 0.057573 -> 0.057571, which is the whole expected
footprint of removing a 0.07% name. 185.7 ms after, against a documented 149-166
ms warm -- no regression. The three held names still absent (FIDU, TGT, HMY) are
sub-cent dust excluded by the view's own one-cent floor, the same three defect 1
found.

**HAL is not a phantom and was not touched.** It is genuinely held: 0.498 shares,
$17.53, `updated_at` exactly on the watermark. It renders at 0.0% because it IS
0.01% of book. A surface that cannot distinguish a real dust position from a
stale one is a display question, not a data one.

**Closed 2026-09-21 -- see "The mark is live; the bar is what goes stale"
below.** `vw_nexus_holdings.daily_return_pct` had no staleness gate, which is
how KMTUY published +6.3% off a print 179 days old. The gate now lives in
`vw_portfolio_home`, and the matview rebuild this paragraph predicted was
avoided.

Noted in passing from the EXPLAIN: `account_snapshots` shows **Heap Fetches:
9108** on an Index Only Scan. Stale visibility map -- the 2026-08-23 lesson says
check that before rewriting anything here.

### The mark is live; the bar is what goes stale (2026-09-21)

H-3. `vw_portfolio_home.daily_change_pct` is

    (live broker mark - latest stored 1d bar close) / that close

The mark is refreshed every five minutes by `sync_alpaca_positions`. **The BAR
is the half that goes stale**, so a name whose feed has stopped keeps
publishing a "daily" move that is really the entire drift since its last print
-- and it GROWS the longer the feed stays dark, so it reads more like news the
longer it has been wrong. That is how KMTUY, 2.13% of book on a bar 179 days
old, published +6.3% as today's move on the flagship holdings table, the Theme
cut and the bench docket at once: all three descend from this view.

**The near miss is the reusable part.** `latest_prices.price_date` is
`COALESCE(lp.as_of_date, rp.price_date)` -- the POSITION snapshot date, which
is `current_date` for every held row (measured: all 64 at `days_old = 0`).
Gating on the column already named `price_date` would have shipped **a gate
that can never fire**, the fourth instance of that shape here. The anchor is
the `ranked_prices` rn = 1 row -- the same bar that produces `prev_close`.
**When a date column is named for what you want, check what it is derived
from.**

Reasoning reused verbatim from `nexus_holdings` (2026-08-18) rather than
re-derived: **7 days, not the 4-day badge** (a Thursday close before a Friday
holiday is 5 days old by Tuesday); **one CTE decides**, so the daily and
five-day figures cannot disagree about a name; `price_days_old` is published so
a consumer can say why.

**Gated at the engine, and the reader still needed a change.** The daily figure
reaches `vw_nexus_holdings` through `mv_nexus_holdings` for free, because
`round(NULL, 3)` is NULL. The five-day one did **not**:
`round(COALESCE(p.return_5d_pct, 0) * 100, 3)` turns "no usable five-day move"
into "moved exactly 0.00%". That was **live, independent of staleness** --
`SOXX261016P00500000` is a put with **zero price bars** and the flagship was
publishing `0.000` for its five-day return. Both columns now read from the live
`vw_portfolio_home`, which `unrealised_return_pct` already did, so the figure
and its `move_publishable` flag come from one row and cannot disagree.
`mv_nexus_holdings.five_day_return_pct` keeps its COALESCE and is read by
nothing -- do not consume it believing a 0.000 is a measurement.

**A dormant gate has to be forced, and it can be forced without writing.**
Every held bar was exactly 3 days old, so live data could not fire it.
Rebuilding the patched definition under throwaway names at thresholds of 2 and
3: **0 of 64 published at 2, 63 of 64 at 3**, both columns moving together.
That pins the comparison as `<=` rather than `<` and proves the wiring, with no
fixture and no rolled-back write.

**The client fix is the harder half, because the failure inverts.** Every
reader took `|| 0` or `?? 0`, so withholding the number turns a loud
overstatement into a **silent dilution** -- a weighted average drags towards
zero by exactly the withheld weight with nothing on screen to say so. KMTUY at
+9.25% was visible; KMTUY at 0.00% is not. `src/lib/weightedMove.js` is the one
implementation (both accessors **required**, the `returnOf` precedent), and
`pct` is **absent from the result**, not null, when nothing is measurable.

**The 55-file suite passed unchanged across the whole change** -- every fixture
in it supplies a move for every row, so none of them can tell a withheld move
from a zero one. `nexusStaleMoveGate.test.mjs` carries a withheld row in every
fixture with values chosen so reading it as 0.00% changes the answer by a
multiple: 5 of its 17 fail on the pre-fix code, checked by reverting rather
than assumed. Two first drafts did NOT discriminate and were tightened --
**write the fixture, then break the code and watch it fail.**

Equivalence proven before applying, both views: column names, order and types
identical on the shared prefix (28 -> 31 and 36 -> 39 columns, 0 mismatches,
since `CREATE OR REPLACE VIEW` can append but never reorder or retype), and
`EXCEPT ALL` both ways returning 0. `vw_portfolio_home` 167 ms against a
documented 149-186; `vw_nexus_holdings` 226 -> 188 ms.

**Seventeen `vw_nexus_holdings` rows differed and sixteen were not the fix.**
They are mark drift since the last matview refresh, at most 0.110pp. Proven
rather than waved through: all 63 publishable rows reproduce the matview's OWN
stored figures **exactly, both columns**, from the matview's own stored
`current_price` against the same bar closes -- and exactly those 16 rows have a
`current_price` that has since moved. **A first attempt asserted the daily and
five-day shifts would be equal; they are not, and the CHECKER was wrong** -- a
mark move dP shifts them by dP/prev_close and dP/close_5d, which differ
whenever the five-day move is not zero. Second time a verifier has been the
thing that was wrong here.

Both migrations are textual patches against `pg_get_viewdef` with every anchor
asserted to match exactly once, the idiom this view family already uses
(`20260811150000`, `20260906083659`). That beats shipping a re-dumped body:
this file records two file/database divergences from doing the latter, and a
replay against a different base fails loudly instead of quietly producing
something else.

### The 95% VaR passes because it is the crossing point (2026-09-15)

B5. Full report in `docs/B5_VAR_BACKTEST_REPORT.md`. `var_backtest_runs`,
`atlas_var_backtest`, nightly at 23:50 Mon-Sat.

E3 says in its own table comment that its parametric CVaR "understates a fat
tail by construction". It does, and by less than the two things nobody was
measuring.

**Read all three confidences or none.** The model leg -- b'x over 3,370
sessions, which isolates the distributional assumption -- gives 265 exceptions
against 337 expected at 90% (LR 18.31), **169 against 168.5 at 95%** (LR 0.002),
and 56 against 33.7 at 99% (LR 12.43). Thin shoulders, fat tails, and 95% is
simply where the leptokurtic distribution crosses the normal. The one level that
passes is the one with no power to reject, and reading it alone would certify
the exact assumption the other two refute.

**Regime conditioning cannot repair a shape.** Conditioning on each axis's own
published bucket vol moves the model leg's 99% count from 56 to 55/58/55. The
miscalibration is in the shape of the distribution, not the level of the
variance.

**On the book it is worse than useless: it LOWERS the bound.** Buckets are
quartiles of a 13-year z distribution, and 76 of the book's 172 sessions land in
`cyclical` q4 -- whose bucket vol, 0.010428, is the lowest of the four. So the
conditional row carries the table's smallest `sd_pred_daily` (0.011365) and its
largest exception count (11 at 99% against 1.72 expected, LR 22.78). **A bound
calibrated on a long history is conditional on where today sits in a
distribution the book never lived through, not on today.**

**The book leg's failure is not the tail at all, and it decomposes exactly.**
Realised daily sd 0.016530 against a published 0.012022 -- **1.3749x** -- which
is 1.2100x (the factor return ran 21% hotter over these 172 sessions than over
the 13 years Sigma was estimated on) times 1.1332x (**b'Sigma b carries no
idiosyncratic variance at all**; 22.0% of book variance has no representation in
it). Product 1.3712; the 0.27% gap is the residual's small non-orthogonality
over 172 sessions when the betas were fitted on 168. Both causes are
structural and neither is visible from the model leg -- which is the whole
argument for running two legs rather than one.

**Do not fix this with a multiplier on `vol_daily`.** One number over three
causes would be recalibrated by any change in any of them. The fixes are
separable: a residual variance term, and a shorter or weighted covariance
window. B3 rests on Sigma and inherits all of it.

Realised CVaR exceeds predicted on **every row of the table**, 1.13-1.27x. That
is the quantification E3's comment was asking for.

**No p-value is stored.** Postgres has no error function and an approximation is
a number nobody can audit. `kupiec_lr` is stored with `kupiec_reject_05` and
`kupiec_reject_01` bound to it by CHECK -- the `bfb_significant_ck`
construction, so a surface cannot be handed a verdict that disagrees with its
own statistic.

**Gate on the dependency, not on the upstream's status.** The first draft gated
on `atlas_write_regime_cvar` logging `success` today. That job logs `skipped` on
a legitimate idempotent re-run, on which the rows ARE present and this job
should proceed -- so the status gate would have refused forever the first time
E3 re-ran. It gates on `book_regime_cvar` holding a snapshot for the session
being graded. The C4 lesson is about naming; the rule underneath it is that a
gate must track the thing it depends on.

`vw_book_realised_returns` publishes the settled book return series once, so
C1's two rules stop being re-derived per consumer: the New York session date
rather than the UTC cast, and **both** endpoints settled, because the return out
of a carried level is as fabricated as the return into it. `usable` is published
rather than applied, so a consumer states its denominator.

### A comment-stripped paste is a file/database divergence too (2026-09-15)

The function was applied by pasting its body with the inline comments removed
for brevity. Behaviour was identical and every figure above was produced by the
right arithmetic -- and `md5(prosrc)` was **1574611e** in the file against
**5ca079f3** in the database, a 1,195-byte divergence of exactly the kind the
2026-09-14 entry is about, created the same day that entry was written.

It was caught by checking rather than by assuming: compute the file's body hash
locally and compare it to `md5(prosrc)`, which stores the body verbatim.

```bash
python3 -c "import hashlib,sys; s=open(sys.argv[1]).read();   b=s[s.index('as \$fn\$')+8:s.rindex('\$fn\$;')];   print(hashlib.md5(b.encode()).hexdigest())" <migration>
```

**Comments are part of the object.** Re-applied verbatim; both functions now
hash identical to their files.

### `book_regime_cvar` shipped with RLS off (2026-09-15)

Found while giving `var_backtest_runs` its policies. It was alone among the
factor-layer tables: `book_factor_betas`, `factor_axis_scores` and
`market_prices` all carry the `_read` / `_service` policy pair, and it carried
none. Supabase's default grants give `anon` and `authenticated` INSERT on every
table in `public`, and **RLS is the only thing that takes it back** -- so an
append-only risk history was open to anonymous writes. The append-only trigger
does not help: it refuses UPDATE and DELETE, which is the pair an attacker does
not need.

The nightly writer is unaffected -- pg_cron runs as the job owner, `postgres`
owns the table, and `relforcerowsecurity` is false, as on every sibling.

**A trigger named `append_only` reads like the table is protected.** Check the
grants separately from the trigger.

### One instrument is a data point, not a category (2026-09-16)

F-5, the flagship tape. `market_instruments` carries 19 active legs and **no column
able to express sector vs index**: `asset_class` is `equity_etf` for XLE, SPY AND EEM
alike, and `proxies_for` is free text that parsing would misfile silently. So Sprint 2's
framing is a column, `market_instruments.tape_group`, for the reason
`nexusPairsCompute.js` refuses to carry a pair-to-axis map -- **a surface must not hold a
hardcoded copy of a classification the database owns.** NULL means off the tape, which is
the right state for the seven bond and commodity legs.

**Regional holds exactly one leg (EEM) and there is no regional frame.** A frame labelled
"REGIONAL" over one ticker overstates what is measured in the same way a sector aggregate
computed from the book's own holdings would -- the substitution F3 §2.1 prohibits, one
layer out. The owner's call was to run **sector + index** and show EEM inside the index
frame labelled as itself.

**The rule is structural, not a carve-out for EEM.** A `tape_group` with fewer than
`MIN_FRAME_LEGS` (2) does not get a frame; its legs fold into the broad-market frame and
the fold is recorded on the item and stated on the sprint. So **registering a second
regional leg gives regional its own frame with no code change** -- asserted in the test by
adding an R2 row to the fixture, not by inspection. `index` is also literally true of EEM,
which tracks the MSCI Emerging Markets Index, so the frame is not a small lie either.

**The ticker is the label, for every leg.** "EEM", never "Emerging markets" -- the ETF is
the measurement and the asset class is an interpretation of it. That reasoning is not
specific to EEM: XLE's own `caveats` say it is a large-cap-only slice "close to a
two-stock series", so "Energy +2.17%" is the same overstatement one step smaller.
`proxies_for` goes on the title rather than being discarded.

**Recording the gap is part of the fix.** Sprint 2 runs two frames because no regional
coverage exists, and that sentence is in `docs/F5_TAPE_BUILD_REPORT.md` §8 so the next
session does not rediscover it and reach for the book-derived version. Same function
`market_instruments.caveats` serves for CPER.

### An axis tag without the loading's sign asserts the opposite (2026-09-16)

Caught by rendering F-5's tape, not by the build, which was clean throughout.

`factor_axes.label` is a full sentence -- *"Cyclical risk-on (up = cyclicals & credit over
defensives & gold)"* -- a description, not a name. At ticker size it swamped every item and
took the scrolling sequence to 9,526 px. The tape token is the **axis key**; the sentence
and `positive_means` moved to the title, so orientation is preserved rather than dropped.
9,526 -> 6,156 px. (The "render from `positive_means`, never from its key" rule is about a
score's SIGN, not about naming the axis a pair is grouped under.)

**The worse half: the tag alone says which axis a pair belongs to and not which way it
pushes it.** RSP/SPY loads **-0.47** on concentration, so a reader shown a rising RSP/SPY
beside a bare `concentration` tag concludes the reverse of what the loading says.
`nexusPairsCompute.js` makes exactly this argument in its own header and the tape is the
surface that would have broken it. Every assigned item now carries `+` or `-`; an
unassigned pair (CPER/GLD) carries **no sign** rather than a defaulted one.

**A frame boundary nobody can see is not a frame.** Sprint 2's sector and index legs first
rendered as one undifferentiated run of tickers, which makes the whole EEM decision
unreadable. A marker at each boundary is what makes `INDEX EEM -0.35%` legible as the
decision it is.

**Three display defects, all invisible to `vite build` and all found by looking at the
rendered page.** Same lesson as F-3's unregistered Chart.js scale.

### There is now one paged read of `market_prices` (2026-09-16)

`fetchPricesPaged` was local to `NexusPairExplorer.js`. F-5 needed the same read, and a
second copy of a PostgREST pager is precisely how the 1,000-row cap has come back four
times in four layers. Extracted to `src/pages/nexus/nexusMarketPrices.js`
(`fetchMarketPricesPaged` + `indexBySymbol`); the explorer calls it and its own suite
passes unchanged, which is what makes it a refactor rather than a rewrite.

**F2 §3's "one source" rule is a CODE constraint, not a data one.** The tape and the pair
explorer both read `market_prices` -- and that is not enough, because two implementations
of the same arithmetic diverge. `nexusTapeCompute.js` imports `alignedWindow` and
`buildSeries` and contains **no ratio arithmetic of its own**; the only division of a
numerator by a denominator in the repository is `const raw = num.map(...)` in
`nexusPairsCompute.js`. Prove that by grep, not by comparing two outputs on one day's data.

### A scoped rule silently outranked every tone class (2026-09-17)

Reported from the terminal: the tape had no colour. It had none since it
shipped. `.nexus-flagship-v2 .nft-v` is specificity **(0,2,0)** and `.tone-up`
is **(0,1,0)**, so the scoped rule setting `color: var(--text2)` beat every tone
the component applied. Measured in the browser rather than reasoned about:
values rendered `rgb(138,160,187)` where `.tone-up` resolves to
`rgb(34,197,94)`.

**The markup was right the whole time.** The tone classes were in the DOM, the
unit tests asserted the right classes, the build was clean, and the screenshot
review passed — because every one of those checks looks at the class, not at the
cascade. **A test that asserts a class name cannot see a specificity bug.** The
fix re-states the tones at matching specificity rather than loosening the scoped
rule, so the scoping still holds against other pages.

**A caret toned by the move broke a boundary that ordering carried.** Sprint 1
is five best then five worst; tone the arrow by the MOVE (correct -- a green ▲ on
a falling name is a lie) and on a red day all ten point down, so the split
becomes invisible on a moving tape where ordering is not readable. `bandOf()`
puts a `BEST` / `WORST` marker at the boundary, the same mechanism Sprint 2 uses
for `SECTOR` / `INDEX`. The test that matters is the all-red fixture.

**Pause on hover/focus worked and was invisible**, so a tape that had stopped
FOR the reader looked like one that had stopped working. The `PAUSED` chip is
the affordance and exists only while paused.

### An absent card must not be handed a value (2026-09-17)

F-4. Full report in `docs/F4_FLAGSHIP_CARDS_REPORT.md`. The seven metrics that
collapsed into a text line under the four decision tiles are now cards in the
same grid -- eleven plates settled on the table with the tape running beneath.

**The absent state is a NAMED variant, and `value` is absent from the object.**
Not null, not an em dash -- the key is not there, so a renderer cannot print one
it was never handed. Same construction as `nexusReturnBasis.js`: the wrong thing
is impossible to write rather than discouraged. Asserted in the DOM too (an
absent card carries no `.np-tile-v` node at all), because the rule is about what
can be rendered, not what is intended.

**The reason had to be made honest before the variant was worth having.**
`useAccount()` ended in `.catch(() => {})`, so a feed that did not answer and a
feed that had not answered yet both arrived as `null` and both rendered a dash.
The swallowed-failure pattern, in the component F2 §2 names as the live instance
of its own absence rule. Now `loading` / `ok` / `failed`, logged at error level,
and the two read differently. A 200 carrying no `equity` counts as a failure --
the old code treated it as success.

**Prove "unchanged" by rendering, not by diffing**, when the file was rewritten.
Clause 4 asks that the four original cards not change; there are no surviving
lines to diff, so both components were rendered side by side and compared on
text, computed colour, size, background, radius, padding and shadow. All four
identical.

**A genuine zero is a measurement, and it has to mean that in every card.** A
test asserted an account equity of exactly `$0` should be absent; the code said
measured, and the code was right -- an unfunded account genuinely is zero, and
absenting it contradicts the zero-is-a-measurement rule asserted two tests
above. Corrected the test.

**`.np-tile` is defined twice in `nexus-flagship.css`, unscoped, and the pair
explorer's wins.** `np-` means *nexus portfolio* at line 631 and *nexus pair* at
line 1522; same specificity, later rule wins, so the portfolio tiles compute to
the explorer's 15px/radius-6 styling. Measured, not inferred. **Not fixed**:
correcting it changes how the four original cards look, which clause 4 forbids
in this unit. Two modules share the prefix, so it needs its own decision.

### The app shell was never styled at all (2026-09-17)

Reported as a cosmetic ask -- the sidebar and top bar do not match the panels.
They did not match because **they had no surface**. `NexusShell` in
`src/pages/nexus-page.js` styles itself with `--nx-*`, and those tokens were
declared only on `.nexus-root`, **a class nothing in the app carries**. Verified
in the browser rather than inferred: on the live shell
`getComputedStyle(el).getPropertyValue('--nx-bg2')` returned **empty** and the
sidebar's computed `background-color` was **rgba(0,0,0,0)**.

So every `background: var(--nx-bg2)`, every `1px solid var(--nx-border)` and the
wordmark's own colour resolved to nothing, and the chrome was showing the raw
`body` background through. The "blue slab" was `--navy #060f1e` seen directly.
**A var() that does not resolve fails silently and leaves the property at its
initial value** -- transparent, in this case -- so the chrome looked deliberate
and was simply absent. Tokens now live at `:root`; `.nexus-root` keeps applying
them as a surface and inherits the values.

**Three ramps, and the two that were live disagreed.** `globals.css` ran a navy
scale (`#060f1e` …) with teal-tinted borders and `--teal #00c8e0`;
`.nexus-flagship` runs a neutral charcoal one (`#080b0e` / `#0d1117` / `#121821`
…) with white-alpha borders and `--cyan #22d3ee`; `.nexus-root` ran a third that
agreed with the flagship on its first two steps and drifted on the rest
(`#131920` vs `#121821`, `#1b2330` vs `#171f2a`, `#222d3a` vs `#1d2734`), each
step carrying more blue. All three now use the flagship ramp. **Move them
together or the seam returns.**

**The chrome carried two accents at once.** `--nx-blue #3b82f6` on the wordmark,
the active nav's text and its left rule, over a hardcoded `rgba(0,212,255,…)`
`#00d4ff` wash -- a blue rule on a cyan background inside one control.
`--nx-accent` is now a named role (the panels' `#22d3ee`) and `--nx-blue` keeps
meaning "the blue module", which is what the rest of `nexus-theme.css` uses it
for.

**Fixing the scope exposed a contrast failure that had been masked.** With the
tokens dead, nav labels inherited a bright body colour; once `--nx-text3`
resolved they rendered at **2.94:1 on the sidebar surface -- below WCAG AA and
below even large-text 3:1**. Moved to `--nx-text2` (6.64:1). **Making dead
styling live can make a page worse before it makes it better; re-measure
contrast after any token-scope fix.**

### A window listener cannot see a container change (2026-09-17)

`useLwChart` resized its chart on `window.resize`. The Board's
COMPOSITE/WORKINGS toggle never resizes the window -- it resizes the
**container**, via `.nb-span2 { grid-column: 1 / -1 }` and a 220px -> 240px
chart rule. So the listener never fired and the canvas kept the size it was
built at: container **930x240 -> 441x220 while the chart stayed 930x200**,
overflowing the card by 489px and carrying the right price scale (the rightmost
36px) off screen. Reported from the terminal as a clunky transition; it is a
stale canvas.

**Observe the element, not the window.** A `ResizeObserver` covers the window
case too, because a viewport change is also a container change -- one path
instead of two, and the one that was missing is the one that fires far more
often.

Two more faults in the same four lines, both permanent rather than
flip-dependent: **height was never read from the container at all** (a 200px
default inside a 220px box, and a `CHART_H = 250` constant in
`NexusPairExplorer.js` restating `.np-chart { height:250px }` with a comment
asking the next editor to keep the two in step); and `fitContent()` ran only at
build, so with `fixLeftEdge`/`fixRightEdge` pinning the window a resized chart
kept its old bar spacing. **The container is now the only source of a chart's
size** -- a number in JS restating a CSS length is a second source that goes out
of step silently, because a canvas is painted and nothing reflows or warns.

**An animation replays on a change of animation-NAME, not of class.** Grid
placement is not transitionable, so the card surviving the flip snapped to its
new width while its neighbours ran a 400ms `nf-fade` -- two motions, not one
gesture. The first fix gave two classes the same `animation: nf-fade` and
alternated between them, which restarts nothing: `getAnimations()` showed one
`nf-fade` sitting finished at `currentTime: 400` right across the flip, and the
page looked identical to the unfixed snap. Two distinct `@keyframes` names with
identical content is the mechanism. **No `key`** -- a remount would replay the
entrance for free and reset the index chart's symbol and range selection with
it.

Both directions must be measured: growing leaves dead space, shrinking carries
the axis off screen, and only the second is visible in a screenshot. Full
report in `docs/CHART_CONTAINER_RESIZE_FIX.md`.

### Two tapes, and the marquee they share (2026-09-17)

G-1. The flagship now runs a MARKET tape above The Book at a Glance beside the
F-5 BOOK tape below it. Full report in `docs/G1_MARKET_TAPE_REPORT.md`.

**They are two tapes and not one merged stream on purpose.** The whole value of
having both is telling *"my book is down"* apart from *"the market is down"*,
and one stream makes that a matter of remembering which sprint scrolled past.

**`NexusTapeShell.js` is the only marquee implementation.** Velocity, the
two-copy loop whose seam lands on an exact repeat, pause on hover and focus,
the reduced-motion pager and the frame markers all live there. **Two tapes
moving at different speeds would read as one of them being broken**, and a
second copy of a marquee is exactly how that happens -- the same argument that
produced one paged read of `market_prices`. Each tape keeps its data, its item
vocabulary and its own loading/failed/empty sentences: those are claims about a
particular feed, and a shared default puts a sentence on screen nobody
verified. Extraction proven behaviour-neutral -- 278 tests green either side,
`nexusTapeCompute.js` untouched.

**Split on SIGN, never on position.** `LEADING` is the sectors that are
actually up, so an all-red tape shows no LEADING band at all; a fixed share of
the list labelled leading every day is a ranking dressed as a market read --
the quantile-verdict objection, one layer out. Same trap in the ranked slice:
the bottom five of thirty are NOT losers on a day the whole list is up, so the
bands are `BEST`/`WORST` and the sign is carried by the caret and the tone.
Both are asserted with the fixture that breaks the naive version (all-red
sectors, all-green bottom slice), never by inspection.

**A sprint that ranks a curated list says so on the tape.** `api/movers.js`
ranks thirty hand-picked large caps, so "top movers" means "the best of thirty
names someone chose" -- printed as a scope note, the same rule that makes XLE
render as `XLE` rather than as "Energy".

**The two endpoints fail independently** (`allSettled`, not `all`). A dead
`/api/movers` costs its own two sprints and nothing else; only both down reads
*"neither market feed answered"*. An empty sprint is DROPPED rather than
rendered as a bare label -- a label with nothing under it reads as a feed with
nothing to say, when it returned nothing at all.

**`src/lib/marketAssetGroups.js` is a UI registry and that is a GAP, not a
design.** `market_instruments.tape_group` owns this classification for the A0
legs and is the right home for these sixteen too; they are not registered there
yet, and inventing rows is an A0-shaped data unit rather than part of a UI
build. Recorded so the next session does not mistake the gap for a decision.
Extracted from `market-watch.js`, which held it privately, because a second
copy is how two surfaces start disagreeing about whether EEM is global or
emerging.

**Nothing new is added to the v1 layout.** `nexusLayout.js` says v1 restores
the previous layout wholesale, so a new element there stops the escape hatch
being one.

### Rebasing on each leg's own first bar is four experiments on one chart (2026-09-17)

G-5, the index wall. Full report in `docs/G5_INDEX_WALL_REPORT.md`.

`board.indices` was already loaded and shown ONE symbol at a time behind chips;
the Markets module drew the same four as four TradingView iframes. The wall
shows them together, in two faces -- `SEPARATE` (small multiples at native
price) and `COMPARED` (all rebased to 100 on one origin). No new endpoint.

**The compared face rebases on the INTERSECTION of the date sets, not on each
leg's own first bar.** Rebasing each from its own start makes the lines answer
different questions, and whichever began on a down day looks better for free.
Measured on a fixture where DIA starts 40 sessions late: SPY reads **+25.9%
compared and +32.09% separate, and both are right** -- the compared figure
starts where DIA's history does. Reading the separate figures against each
other is the mistake the face exists to prevent. **The alignment cost is
printed under the chart** ("40 sessions dropped so every leg shares one
origin"), not absorbed.

**One leg drawn alone under a "compared" heading is the worst outcome
available** -- it looks like a comparison and is not one. No overlap reports
itself instead.

A window the data cannot fill is MARKED (`214 sess` under a 1Y request), never
passed off as full; `Max` is unbounded and never marked. Line colours go by
RANK, not by symbol, so the eye follows the ordering rather than relearning a
palette daily.

**This unit is why the container-resize fix had to land first.** The wall is a
responsive grid whose cells change width with no window event behind them --
exactly the `useLwChart` defect closed that morning. It would otherwise have
shipped four stale canvases at the first breakpoint.

### The terminal's risk light was a string literal (2026-09-17)

G-4. Full report in `docs/G4_CROSS_ASSET_REPORT.md`.

`nexus-page.js:1146` rendered `'RISK-ON'` in the chrome's top bar -- a LITERAL,
computed from nothing, green in every market since it was written. Nothing in
the file referenced a barometer, a signal or a feed. Meanwhile
`macro-markets.js` computed a real one from SPY, TLT and HY spreads, so the app
could show **RISK-ON in the chrome and NEUTRAL on the Markets page in the same
session** -- and did, visibly, in the screenshots that prompted this work.

The *"a gauge carried from the mock looks exactly like a working gauge"* entry,
in a second place and worse: a mock gauge at least had a mock behind it.

**One computation, shared.** `riskBarometer` is read by the pill and the panel
through the same feed module, so they cannot disagree.

**The cheap signal has to say it is cheap.** `basis: 'heuristic'` travels on the
reading and renders on its face. Three signs averaged against a +/-0.3 band is
not a measured regime; B0's betas and E3's covariance are, and they are a
scroll away. The point of putting the cheap read beside the expensive ones is
seeing when they disagree -- which requires knowing which is which.

**Publish the components, not just the label.** A label with nothing under it is
precisely what sat in the chrome. **No inputs reads `UNKNOWN`** and the pill
renders NOTHING -- a chrome badge is read at a glance and never re-read, so a
grey dash there reads as a state the market is in.

**The needle is the SCORE, not the label.** Three fixed positions discard the
distance from the band, which is the only thing that says whether a reading is
marginal. Measured: the base fixture sits at 34% against a band of 35.6-64.4 --
just outside, and it looks just outside.

**A port must not move the number.** `changePct > 0 ? 1 : -1` puts a FLAT SPY on
the negative side; that is what shipped and it is preserved, with a test saying
so. Changing it during a refactor would move a published reading under cover of
tidying.

**`useMacroFeed.js`: one module-level promise per endpoint.** Three components
read `/api/macro`; three fetches is three payloads that CAN DISAGREE, because
the endpoint caches with a TTL and two calls either side of an expiry hand two
panels on one screen different data. A rejected promise is cached as rejected --
a later mount must see the failure the first one saw, not retry quietly and
render a healthy panel beside a dead one.

**Recycle the data, not the markup.** Lifting the Markets panels with their old
design system attached is what makes a page feel like panels held together with
tape.

### Share the screener's grammar, never its buckets (2026-09-17)

G-2. Full report in `docs/G2_HOLDINGS_SCREENER_REPORT.md`.

The holdings table now opens with the Valuation House screener's counted-tile
row, because two tables in one product that filter differently make the reader
learn the app twice -- and a tile is a summary and a filter at once.

**What is NOT borrowed is the screener's buckets.** Value / Growth / Momentum /
Quality / Dividend / Contrarian come from screener fields (multiples, RSI,
revenue growth, drawdown) that the BOOK does not carry. Six labels over
holdings rows would be a classification with nothing behind it -- the objection
this file already raises to a sector aggregate standing in for a theme, and to
thirty curated names being called "the market". The tiles are the book's own
reads and valuation signals, which is why they can be counted honestly.

**Reads keep the add->exit spectrum; signals are alphabetical.** Sorting reads
by count puts EXIT first on a bad day and destroys the only thing the row's
order carries; ranking signals by count lets a price move reorder the filter
bar under the reader's cursor. Opposite rules, each for its own reason.

**A facet with no members gets no tile** -- an empty tile invites a click that
finds nothing, and on a summary row a zero is a claim about the book rather
than about a null column.

**Sector became a filter and is a SEPARATE control from theme.** Two
taxonomies, two controls; folding them is the mistake corrected once already
when the flagship showed sector values under a "Theme" heading. `Unclassified`
is a real bucket in each, offered only when something is actually unclassified.

**One filter function.** The header count and the body rows come from the same
`applyFilters` call, so they cannot drift. **An empty Set is not "match
nothing"** -- asserted, because the naive `reads.has(h.read)` without a size
guard silently empties the table.

**Verified through the REAL component**, which is why `HoldingsTable` is now
exported: a harness reproducing its markup verifies the CSS and not the wiring,
and the wiring is what changed.

The screener's RSI meters and regime pills have no counterpart in the holdings
payload and were NOT faked -- they need fields plumbed through
`vw_portfolio_home` -> `mv_nexus_holdings` -> `vw_nexus_holdings`, a matview
rebuild and its own unit.

### Logging a fallback tells the console and tells no consumer (2026-09-17)

G-6, and the defect it found. Full report in `docs/G6_BOOK_VS_MARKET_REPORT.md`.

`nexusLive.js`'s `liveOr()` falls `gauges.risk` and `gauges.performance` back to
`nexusMock`'s figures and LOGGED it at error level. The returned object was
indistinguishable from a live one, so a consumer could not refuse it -- and G-6
reads `gauges.performance` to form a residual against a fitted beta, which on a
mock book move publishes a finding about a book that did not move that way.
Third instance of *"a gauge carried from the mock looks exactly like a working
gauge"*, counting the chrome's hardcoded RISK-ON pill G-4 removed. `liveOr` now
MARKS the gauge (`live: true/false`) and G-6 refuses a marked-baseline one.
**A gauge with NO marker is still read** -- absence of a mark is not a claim of
mockness, and asserting otherwise breaks every caller predating it.

**The cheap-to-expensive link is one number.** Today's benchmark move times the
book's fitted market beta is what the book should have done; the residual is
what the market factor does not explain. A cheap read agreeing with the
expensive one is reassurance; the residual is where the day's story is.

**No expectation without a SIGNIFICANT beta.** An insignificant beta times
today's move still produces a number and that number has no evidence behind it
-- A2's "an absent number beats a flagged one", applied to a PRODUCT rather
than a coefficient. The excess still stands, because an excess needs no model.

**Live intraday against a historical beta is TWO BASES and the panel says so.**
`estimated_at` and `n_obs` are printed beside "today, intraday", reconciled
nowhere -- the rule `vw_position_trading_effect` publishes its own `as_of` for.

**Read the latest estimate set, never a mix.** `book_factor_betas` is
append-only and holds B0's and C3's; mixing them quotes one estimate's market
beta beside another's axes.

**Book sector strings come from a different vendor than the ETF labels.**
`Cons. Discretionary` / `Consumer Discretionary` / `Information Technology` all
resolve through `normaliseSector`, AND the misses are reported by weight. A
partial match reads as a data gap rather than as a join that did not land.

**An em dash in a slot that looks like every other slot is indistinguishable
from a measurement** -- caught in my own first render, where a refused gauge
still drew `Book, today —` in a normal tile. Every refused reading takes the
absent treatment.

### The Trade ticket's covariance matrix was empty, and it said so in a note (2026-09-17)

G-3a. Full report in `docs/G3A_CORRELATION_TRUNCATION_FIX.md`.

`loadRiskLayer` read `universe_correlations` with **no filter and no paging**.
That table holds **88,408 rows for one date**; PostgREST answered `206` with
`content-range: 0-999/88408` and the client never looked. There is no
`.order()`, so which 1.13% arrived was physical order -- and measured against
the live book, **NOT ONE of those rows was a held-to-held pair.** All 2,016 of
the book's measurable pairs took `covarianceMatrix`'s `fallbackRho: 0`, making
the matrix **entirely diagonal**.

Through the repo's own `covarianceMatrix`/`portfolioVol`: published **6.53%**,
true **17.61%** on `correlation_simple`, undiversified 37.47%. **2.70x**, worse
than the 2.4x `total_vol_annual` defect. 17.61% is corroborated by
`vw_book_mctr` (19.37%) and E3 (19.08%). Incremental vol, VaR before and after,
MCTR and risk per $1,000 all inherited it; **portfolio beta did not** -- it is
Sum(w*beta) with no correlations in it -- and is still published when the rest
is withheld.

**`symbols` was accepted and silently ignored** since the function was written:
the parameter that fixes this was already in the signature. It is now REQUIRED,
and with none given the function returns `available: false` rather than a `rho`
of `() => null` -- `covarianceMatrix` reads a null as *uncorrelated* and would
reproduce the exact defect. Both sides filtered and paged: 66 names is 2,016
pairs in three requests, against 89 for the whole table.

**Pane B already printed the warning and published anyway.** *"X% of the
covariance matrix had no correlation on file ... a floor, not an estimate"* --
which would have read **100%**. The risk block is now WITHHELD below 90%
coverage, with the **observed** coverage printed rather than the threshold (the
honest denominator is weight, not pair count), and worded as *the
diversified-away floor* rather than *an understatement*: 6.53% is not a low
estimate of 17.61%, it answers a different question.

Fifth layer for the 1,000-row cap, after `nexus-bench`, `nexus-theme`,
`performance-suite` and the pair explorer. **`limit` is a request; so is no
limit.** Proven against live PostgREST in `.g3verify/prove.mjs`.

### Never rank on a measure something is negative in by construction (2026-09-17)

G-3, the book universe map. Full report in
`docs/G3_BOOK_UNIVERSE_MAP_REPORT.md`. `mv_book_candidate_map` places the book
and its ~420-name candidate universe on **one** pair of axes -- weight-weighted
`correlation_simple` to the book against annualised vol -- and a drawer runs
the real `computeBookImpact` on any point.

**Both axes must be computable whether or not a name is held**, or the chart is
two experiments sharing a frame. A name's **own weight is excluded** from its
rho to the book: correlation with itself is 1 and says nothing about how
differentiated it is from the rest of what you own, so including it would drag
every held name right by its own weight. Vol comes from the SAME snapshot and
window the correlations were estimated on (B4).

**The first build's "least correlated" list was SPDN, SH, RWM, PSQ, QID -- five
inverse ETFs.** Arithmetically correct and a trap: an inverse fund is negatively
correlated **by construction**, not by being a differentiated bet, and a levered
one takes a levered share of any move. `beta_spy` runs **-8.81 to +8.65** and
**198 of 423 rows are inverse or levered**, so ranking on rho alone was a
leverage screen -- the `regret_vs_best_pct` lesson in a new place. The
"most correlated" end (ACWI, VXUS, VTI, SPY) was right, which is why only
reading BOTH ends caught it.

**Gated on measured beta, never on a name.** A deny-list of "3X"/"Ultra"/"Bear"
would miss the next one and flag an innocent fund. `SH` at -0.988 is inverse and
**NOT** levered, a defensible hedge; `QID` at -3.02 is both -- two columns,
because they are two facts. Both are plotted and badged; only the RANKING
excludes them, with the count and reason printed. Held out, the ranking becomes
ADSK, CRM, FIG, MA -- real suggestions.

**Two absences, named apart.** An option contract can never be correlated (it
expires -- a category); a dark feed is a gap that could close. A held name
absent from the matrix still gets a row, and the map states the 2.69% of book it
is not showing.

**The drawer's 30.51% book vol and `vw_book_mctr`'s 19.37% are the SAME book.**
`computeBookImpact` weights by **equity** (its §4.1 rule), `vw_book_mctr` by
portfolio value, and the book runs at **1.73x gross**: 17.61 x 1.712 = 30.15.
The panel states its basis and the leverage and says the other figure is the
same measurement divided by it. Reconciling silently would be the mixed-basis
failure; leaving it unlabelled would be worse.

**`VACUUM (ANALYZE) account_snapshots` took the map query 2,928 -> 586 ms with
no query change** -- Heap Fetches **9,680 -> 0**. That stale visibility map was
flagged on 2026-08-23 and again on 2026-09-15 and never acted on; it helps every
reader of `vw_positions_current`. Two growth-linked nodes remain inside that
view and are flagged, not fixed: a `Seq Scan on positions` for `max(as_of_date)`
and the `account_snapshots` aggregate. **A seq scan over an append-only table is
a clock, not a constant.**

**The replay harness found a real defect by being wrong.** It did not implement
paging (supabase-js sends `offset`/`limit` as URL params, not a `Range` header),
so `fetchPairsPaged` never saw a short page and spun forever. The harness was at
fault -- and the production loop was an unbounded `for (;;)` driven by the
server's response, so a server that stopped honouring the parameters would hang
the browser. **A hang is the one failure that reports nothing at all.**
`MAX_PAGES` caps it and logs at error level.

**Three display defects, all invisible to `vite build`.** Adding the TABLE/MAP
toggle as a third child broke `.nf-card-h`'s `space-between` (fixed with a
MINIMUM `gap`, a no-op for every two-child card); the ranked list **sorts on rho
and displayed 2dp**, so five rows read `-0.02` and the ordering looked arbitrary
-- *a sort key must be rendered at a precision that can express the sort*; and
30 labels overlapped in the dense centre at a 1.5% threshold. Plus `money()`
taking `Math.abs`, which printed an incremental VaR of **-$4 as $4** -- the
opposite claim, on the one number whose sign is the point.

**The fixture mirrors the matview's row shape, flags included**, because
`is_inverse`/`is_levered` are the DATABASE's classification and the surface must
not hold a second copy. A test asserts they are read and never re-derived in JS,
using a row whose flag contradicts its own beta. The naive ranking is asserted
explicitly, so a regression fails on behaviour rather than on a flag.

**All three migrations were hashed against
`supabase_migrations.schema_migrations` before committing** and match the
statements the database actually ran. The two prior file/database divergences in
this file were found afterwards.

### The bets panel was summing fifteen nights and calling it one (2026-09-20)

Reported from the terminal: the Performance bets panel showed **the same bet
over and over** while the book is spread across a dozen themes. It was not a
grouping bug. `segment_verdicts` is an APPEND-ONLY history and
`loadSegments` read it **unscoped** — every night since the job started, all
in one list — so `buildBetsView` grouped fifteen nights of the same segments
together and ranked the result.

| grouping | segments | positions | effective bets | duplicate labels |
|---|---|---|---|---|
| THEME | 70 -> **17** | 353 -> **60** | 0.57 -> **3.49** | 58 -> **0** |
| BET | 130 -> **43** | 218 -> **60** | 0.61 -> **3.84** | 58 -> **0** |

The 353 matched the screenshot exactly. Top five before: `AI / accelerated
compute` five times. After: five different bets.

**Scope to one night in the LOADER and again in the builder.** The loader
reads `max(as_of)` first and filters to it; `buildBetsView` re-derives the
latest `as_of` from the rows it was handed and drops the rest, reporting
`droppedNights`. Two gates because a caller can pass rows from anywhere, and
this file already records what happens when a gate lives only at the consumer.

**The cut is on the DATE, never on the label.** Deduplicating by label would
have produced the same headline number and silently discarded genuinely
distinct segments that share a name — which, as H-2 then showed, is 10 of the
book's labels.

### One partition, two bets, one name (2026-09-20)

H-2. `cluster_identity` / `atlas_refresh_cluster_identity()` /
`vw_cluster_identity`, nightly at 23:39 Mon–Fri. Full report in
`docs/H2_CLUSTER_IDENTITY_REPORT.md`.

The Performance tab rendered `RISK CLUSTER 196` — an integer out of an
average-linkage partition, with nothing saying what was in the bucket or what
moves it. Nothing in the schema answered either question:
`universe_clusters.cluster_label` is a **ticker fingerprint**, and the semis
bucket's modal `assets.sector` is literally **`Other` (16 of 32)**, so naming
from the vendor field would have produced a label that is false rather than
vague.

**The theme label and the risk bucket are different objects, and the book's
largest theme is two opposite bets wearing one name.** `AI / accelerated
compute` is 12 held names across **5** clusters: AMD/ASML/DFEV/EWY/MRVL/MU/
SNDK/TSM load `dollar` **−** at t −8.99, while NVDA, AVGO, TSLA and CRWV each
load `concentration` **+** at t 3.9–6.6. The US mega-cap AI names rise as
index leadership narrows; the Asian and European semis complex falls as the
dollar strengthens. Under one heading they read as one position.

`Financials` is worse — 6 held names, 4 clusters, **four different axis/sign
combinations** (C/GS/MS `cyclical +`, JPM `concentration −`, MA `dollar +`,
FIDU `dollar −`). A single Financials line nets that to nothing. 10 of the
book's labels span more than one cluster.

**Market is a CONTROL in this regression, not a finding.** Without it every
cluster loads on everything, because the market factor dominates a daily
equity return. And the fit must be **multivariate**: `concentration` and
`dollar` correlate **−0.471** over the window, so a univariate axis
correlation double-counts and misassigns clusters.

**A floor written to protect the average made a third of the book
unmeasurable.** Requiring half the cluster to have priced, floored at two
names, so a thin tape could not let one name stand for a bucket — and a
one-name cluster can never have two names priced. **143 of 206 clusters are
singletons carrying 23 held names**, all returning `insufficient_history`.
Fourth instance of a gate that can never pass. `least(size, greatest(2,
ceil(size/2)))` — 63 → 206 measured.

**Bound an append-only history's sample at its own `as_of`, at BOTH ends.**
The price filter had no upper bound, so a row stamped D was fitted on bars
after D. Dormant today — every feed sits on the clustering date — but on a
night `ts_clusters` fails (a 504 on 2026-09-09) the job re-states the same
date against a longer window. The reproduction held identically either side of
the fix, which is what a correct no-op looks like.

**`vw_cluster_identity` sat at 1,208 ms against anon's 3,000 ms cap** because
`held_symbols` was a correlated subquery — 45 clusters × one full evaluation
of `vw_positions_current` each, 15,887 buffers. Hoisted into a CTE:
**1,208 → 49 ms**, and it returns all 206 rows rather than 45. The
`atlas_counterfactual_frozen` lesson again; a browser-facing view is the only
kind where that gap is the exposure.

**The verifier was the thing that was wrong.** The independent node
reproduction first reported `max |beta| 2.392e-3` and one primary-axis
disagreement — because it paged PostgREST **without an ORDER BY**, which makes
pagination unstable. This file's own rule, broken in the checker rather than
in the thing checked. **A disagreement two hundred thousand times larger than
the rounding is a setup difference, not a precision one** — do not chase it as
arithmetic. Ordered: 206/206 statuses and n_obs exact, max |beta| **4.994e-9**
against an 8dp store, max |t| **4.993e-5** against 4dp, max |R²| **4.969e-7**
against 6dp. Every residual under half a unit in the last stored place.
Deterministic across three DELETE+INSERT re-runs (`68627cea…`).

**An axis key without the sign asserts the opposite**, so the surface renders
`factor_axes.positive_means` AND the sign — "Falls with dollar strengthening;
…" — never a bare tag. Same rule F-5 established one layer up.

**`marginal` is still not a gate**, and this is where it would have bitten:
`dollar` is `marginal = true` and is the axis 8 of the book's held clusters
load on. There is a test asserting it is read as provenance and never
consulted when deciding whether to publish.

**174 of 206 clusters carry a named axis; 32 carry none** and render *"No
measurable axis exposure"*. `axisBeta` / `axisT` / `axisSign` are **absent
from the row shape** when nothing cleared |t| > 2 — not null — so a renderer
cannot print a number it was never handed.

**The seven cluster cards cover only the cluster-eligible 18 of 61
positions**, so the NO CLOSE COMPARABLE table gained a `Risk cluster` column
carrying the same name and tag. Without it most of the book still read as
unclassified, which was the complaint. "Not in the partition" (IXC, a dark
feed) and "no identity on file" (a night the job did not write) are separate
sentences: pooling them would hide a stopped feed.

**`composition_coverage` runs as low as 0.12** — cluster 199 is labelled from
2 of its 17 members. The coverage is published beside the label rather than
the label being suppressed, because the label is honest about the names the
book holds and thin as a description of the bucket. Raising it means extending
`position_themes` past its 79 symbols, which is a data unit.

### NaN clears a significance gate, and I left the X side open (2026-09-20)

Found by auditing H-2's own new schema against this file's PR #783 entry
rather than waiting for a reviewer, on a PR whose CI was already green.

`_ci_panel` filters the cluster return two-sided
(`lr > '-Infinity' and lr < 'Infinity'`). **`_ci_reg` filtered the regressors
not at all** -- only `is null`. So one NaN in a SPY `adj_close` or an axis
score propagates through `ln()` into X'X and makes **every coefficient of
every cluster** NaN at once. I guarded y and left X open, in the same
function, the same afternoon -- the same asymmetry PR #783 records between
two constraints written minutes apart.

**The consequence is not a missing number, it is a published one.**
`abs('NaN'::numeric) > 2` is **TRUE**, so a NaN t-stat CLEARS the
significance gate, wins `v_best`, and is named the cluster's `primary_axis` --
the one thing the layer exists to say. Verified rather than reasoned:
`ln('NaN') = NaN`, `sign('NaN') = NaN`, and neither `price_history`,
`market_prices` nor `factor_axis_scores` carries **any** finite constraint
(0 of them mention NaN or Infinity).

Latent, not live: 0 non-finite values anywhere today, and 0 stored. Fixed
anyway -- this file has three entries about defects deferred on *nothing
currently needs it* that went on to fail.

**Guarded in BOTH places, because they refuse different things.** The engine's
`delete from _ci_reg` keeps a bad session out of the fit; `ci_finite_coeff_ck`
keeps a bad number out of the table every surface reads. A gate applied at one
consumer is missed by the next.

**Proof that a guard is right is that it changes nothing on clean data.** The
digest over all 206 rows is still `68627cea…` after the fix, and the file body
still hashes identical to `prosrc` (`10f7264c…`).

**Running a rolled-back test through the Supabase MCP commits it.** The MCP
commits each call, so `begin; … rollback;` in the file never reached the two
ACCEPTED cases and they landed in `cluster_identity` for real. Two rows at
`as_of 1900-01-01` under `logic_version = 'test:finite-contract'`, deleted by
hand. **Choose a far-past `as_of` and a sentinel `logic_version` for any
scratch write** -- that is the only reason they were findable, and
`vw_cluster_identity` reads `max(as_of_date)` so they never reached a surface.
`supabase/tests/cluster_identity_finite_contract.sql` says to run it under
psql; 7/7, including both acceptances.

### The dispatch row is not a completion signal (2026-09-21)

I-1. The nightly chain now fires each stage on its predecessor's COMPLETION
rather than at a clock time chosen as a guess at the predecessor's duration.
`atlas_chain_stages` / `atlas_chain_advance()` / `atlas_chain_stage_status()` /
`vw_chain_status`. Full report in
`docs/I1_COMPLETION_CHAINED_PIPELINE_REPORT.md`.

**The ask was one orchestrator edge function calling everything at once. It
cannot run on this project.** The org is on the **free** plan: wall clock
**150 s**, request idle timeout 150 s, CPU 2 s/request. The trade-sync chain
alone measures **1,014.6 s** of serial work, and `trade_sync_triggers` on its
own peaks at **255.9 s -- 1.7x the whole budget**. `Promise.all` does not help:
a parallel orchestrator still has to stay alive until the slowest child returns.
`sync_fundamentals` is the live proof -- it self-limits at ~110 s and logs
*"wall-clock budget reached after 140 of 300 symbols"* on EVERY run, and three
times blew past and was killed with the row left open 2+ hours.

**`atlas_chain_reap()` grades the pg_net response, and several handlers answer
before they have done the work:**

| stage | dispatch row closed | handler ran | overshoot |
|---|---:|---:|---:|
| `ts_signals` | 3.1 s | 242.4 s | **243 s** |
| `ts_universe` | 0.13 s | 241.5 s | **243 s** |
| `ts_triggers` | 0.25 s | 231.0 s | **233 s** |
| `options_snapshot` | 0.09 s | 68.8 s | **74 s** |

So chaining a successor off that row fires it **up to four minutes before its
input exists** -- worse than the ten-minute clock gaps the unit set out to
remove. **A green dispatch row means the request was accepted, not that the job
is done.** The overshoot is NOT universal -- `ledger_snapshot` (528 ms) and
`theme_leadership` (38 s) return on completion, as does every edge function --
so it is a per-stage `completion_log_name` probe, never a blanket delay.
`unobserved` is its own state, neither success nor error: **a stage whose
completion cannot be seen has not been seen to complete.**

**Chain order and dependency are different relations.** `depends_on` plus a
`hard` flag: true blocks on an upstream error, false is ordering only and any
terminal state releases. Conflating them turns one failed leg into a dead night;
keeping them apart is why `atlas_run_validation` still grades a night that
failed.

**A block must propagate, and the first version did not.** Forced failure:
`ts_correlations` -> error blocked `ts_signals` and then **ran the other nine
stages anyway**. A blocked stage recorded itself `skipped`, and `skipped` is a
pass -- so its successor read its own blocked predecessor as a stage that had
merely declined. `skipped` was doing two jobs: *"I declined"* (no CRON_SECRET,
gate not met, already written for this as_of) and *"I was not allowed to run"*.
`details.reason like 'upstream_%'` separates them. After: **7 blocked, 0 wrongly
fired**, and the 3 that still ran are exactly the `hard=false` edges.

**`not_before` is not padding.** Alpaca has no settled bar before the session
closes and `todaysBarIsPartial()` refuses Yahoo's in-progress bar, so 7 of 28
stages carry a real external-availability floor. Removing those to "run it all
at once" is how you fetch a half-formed close.

**A stage's `dow` must be a subset of its dependency's** -- a Mon-Sat stage
behind a Mon-Fri one can never fire on Saturday. Fifth instance of the gate that
can never pass, asserted on seed rather than discovered later.

Armed in **SHADOW** (cron 51, every minute 20:00-01:59): it records the plan
under `source='pg_cron_chain_shadow'` and dispatches nothing. Go-live is
`supabase/migrations/PENDING_i1_chain_go_live.sql.txt`, written and NOT applied.
**Read it before applying** -- job 15 `sync_alpaca_transactions` is scheduled
`10 13,22 * * 1-5`, two times in one entry, and the chain covers only the 22:10
leg, so unscheduling it outright silently kills the 13:10 intraday run.

**Shadow proves reachability, not timing.** Shadow rows complete instantly, so
the walk is self-referential and finishes in one tick (27 of 28 stages, 539 ms,
0 blocked; the absentee is Friday-only `theme_leadership` on a Monday). It
proves the graph is traversable, acyclic, day-scoped and correctly blocked. It
does not predict when stages fire on a real night.

**The comment-stripped paste happened again, on the same day it was re-read.**
`atlas_chain_advance` was applied with its inline comments removed for brevity:
file `5eb6bfca`/6733 bytes against database `776983ff`/5737. Caught by hashing
`md5(prosrc)` rather than by assuming. All three functions now hash identical to
their files. The MCP also assigns its own migration versions, so the checked-in
filenames were renamed to the ledger's and the one ledger row with no file was
reconstructed -- **a ledger row naming a file that does not exist is the same
divergence from the other side.**

### The terminal's inconsistency is a READ-path skew, not the sync schedule (2026-09-21)

Measured while scoping I-1, and **not fixed -- it is its own unit**:

```
live_rows 64   mv_rows 64   price_differs 58   max_pct_gap 2.3810%
positions watermark 19:35:04Z   (7 seconds old)
```

`vw_portfolio_home` is live off `vw_positions_current`; `mv_nexus_holdings` is a
matview on a 10-minute refresh. **58 of 64 held names carry a different price
between them at the same instant, worst 2.38%.** Panels descending from the
matview (holdings table, Theme cut, bench docket, contribution) disagree with
panels on the live view *within one page load*.

The nightly chain runs 21:00-23:50 UTC, so its internal ordering is invisible to
a daytime reader -- **collapsing or re-timing the writers cannot move this
number.** The only intraday writers are `sync-alpaca-positions` (*/5) and
`refresh-nexus-holdings` (*/10), and the skew is the gap between them.

This file already recorded the same skew once, as "mark drift since the last
matview refresh, at most 0.110pp", and waved it through. At 2.38% it is not
benign. **Re-measure a drift you decided was small; it is bounded by a refresh
interval, not by anything about the data.**

### The chain's day is a session, not a calendar date (2026-09-22)

Found by the I-1 shadow tick at **00:20 UTC** -- which is exactly what shadow
mode was for. The single-tick traversal test ran entirely before midnight and
could not see this.

`atlas_chain_advance()` scoped everything to `current_date`, and the tick window
is **20:00-01:59**. At 00:00 the date rolls over INSIDE the chain's own night,
so the chain stops being able to see the night it is running:

```
atlas_chain_stage_status('ts_correlations', ..., '2026-09-22') -> not_started
atlas_chain_stage_status('ts_correlations', ..., '2026-09-21') -> skipped
```

Same stage, same row, two answers. **Nothing re-fires** -- all six heads carry a
`not_before` between 20:45 and 23:05 and that was compared as a TIME OF DAY, so
at 00:20 every head reads `00:20 < 20:45` and is refused. That is why the row
count stayed clean and the rollover looked harmless.

**It is not harmless: nothing can RESUME either.** Any stage still in flight at
23:59:59 sees its dependency become `not_started` at 00:00 and waits forever,
and the 00:00-01:59 half of the window can never do anything at all. The tail of
a night that slips past midnight is stranded -- `write_regime_cvar`,
`write_var_backtest`, `run_validation` -- and the existing clock-driven night
already runs to 23:50, so the margin is minutes.

Fifth instance of the gate that can never pass, in a new shape: **after midnight
every gate is permanently unsatisfiable for that night's work.**

`atlas_chain_day(at)` puts anything before **02:00 UTC** on the previous
calendar day, and it is the ONE definition -- `atlas_chain_advance()` and
`vw_chain_status` both read it, so the observability surface cannot hold a
different opinion about which night it is. Explicit `at time zone 'UTC'`, never
the session's zone: the cron schedules and every `not_before` are authored in
UTC, so the chain day is a claim about that clock and no other.

**The second edit is not optional.** `not_before` is now compared as a TIMESTAMP
anchored on the chain day rather than as a bare time of day. Without it a head
that had not fired by midnight could never fire -- the same unsatisfiable gate
one layer down -- when in fact at 00:20 the 22:00 price window has genuinely
passed and the stage should be able to resume. Measured: old test **false**,
new test **true**.

It also fixes two things that were latent. The `dow` test would evaluate a
Friday-only stage as Saturday at 00:10; and the `{{today}}` / `{{today_minus_5}}`
placeholders would have asked Alpaca for a calendar day that has no session yet,
rather than the session that just closed.

Proven at the boundary rather than reasoned: 20:44 / 23:50 / 00:00 / 00:20 /
01:59 all resolve to 2026-09-21, and 02:00 / 09:00 to 2026-09-22. A live tick at
00:22 then reported **dow 1** (Monday, the chain night) against dow 2 before,
`ts_correlations` graded **skipped** against `not_started` before, and 27 rows
visible against 0. `vw_chain_status` reads 9 live / 27 shadow where it would
have read 0 / 0.

**A window that crosses midnight cannot be scoped by `current_date`.** Check any
job whose schedule spans the rollover for the same shape.

### The read path served the mark from two places (2026-09-22)

H-4, and it closes the skew the I-1 scoping note flagged. Full report in
`docs/H4_READ_PATH_SKEW_REPORT.md`.

`vw_nexus_holdings` drove its rows from `mv_nexus_holdings` -- a 10-minute
matview -- while joining the live `vw_portfolio_home` for a handful of columns.
Positions sync every 5 minutes, so the two carried **different prices for the
same name at the same instant**: mid-session, **58 of 64 held names**, worst
gap **2.38%**. The holdings table, the Theme cut, the bench docket and the
contribution panel all descend from the matview, so they disagreed with the
flagship's live panels **within one page load**.

**This file waved the same skew through once**, as "mark drift since the last
matview refresh, at most 0.110pp". **Re-measure a drift you decided was
small** -- it is bounded by a refresh interval, not by anything about the data.

**The BOOK is live; the ANALYTICS are cached.** The view is now driven by
`vw_portfolio_home` with the matview LEFT JOINed, and every column that is a
function of the mark is computed from that one row. H-3's construction
generalised -- it moved `daily_return_pct` and `five_day_return_pct` onto the
live view "so the figure and its flag come from one row and cannot disagree"
and did not extend it to the mark, which was the larger half.

**It costs nothing, because `vw_portfolio_home` was ALREADY in the FROM
clause.** No join is added; what changed is which side of an existing join each
column comes from. `EXPLAIN` put the matview at **7 buffers / 0.058 ms of a
547 ms read** -- it buys nothing at read time here and everything at build
time, which is exactly where the split was drawn. 547 -> 453 ms first read,
**71-72 ms warm**. The row set is live too, so an exit leaves within one
positions sync rather than one refresh.

**Prove a live/cached split by FREEZING, not by diffing.** The two definitions
disagree by construction at an arbitrary instant, so an `EXCEPT ALL` proves
nothing until the matview is `REFRESH`ed current -- at which point it must
return **0 over all 39 columns x 64 rows**, and does. Any difference at any
other instant is then precisely the drift being removed. 15 s after a positions
sync: old view disagrees with the book on **15 of 64** rows, new view on **0**.

**AN ABSENT ANALYTICS ROW MUST NOT PRODUCE A VERDICT.** A name bought between
refreshes now arrives priced and sized with no conviction score, and
`recommended_action`'s CASE ends in `ELSE 'Exit'` -- so a null score would have
labelled a position bought four minutes ago **"Exit"**. The four analytic
fields are withheld together as NULL.

**That moved the exposure to the browser, where it was worse**, because every
call site defaulted: `conviction_score || 50` (a real reading on a 0-100
scale), `recommended_action || 'Hold'` (a real verdict),
`num(...) ?? 0` (the WORST score), and
`b.conviction_score - a.conviction_score` (NaN against a null, so the sort is
**unstable**, not merely wrong). Same shape as H-3's `|| 0`: withholding turns
a loud wrong number into a silent one.

**The sizing layer was the worst of them.** `targetWeights` counted a pending
name's weight in `invested` and its conviction as 0 in `convSum`, so its target
came out **0%** and `sizeTrade` read that as the book's own instruction to
exit -- **a sell ticket for a position bought minutes earlier**. It also
diluted every other name: A's target 45% -> 75% from a name the model never
scored. A pending name now gets **no entry** in the map rather than a zero one,
so the caller must tell "target 0%" from "no target".

`src/lib/holdingsAnalytics.js` is the one place that decides. `convictionOf`
and `actionOf` cannot be handed a fallback. **There is no second weighting
implementation** -- a book-weighted conviction is `weightedMove(rows, { value,
move: convictionOf })`, same arithmetic, same withhold-and-renormalise rule.

**The 461-test suite passed UNCHANGED across the whole change**, because no
fixture has ever carried a pending row -- before H-4 such a name was *absent*
rather than present-with-nulls, so the shape could not occur. The new fixtures
carry one everywhere, with values chosen so the old defaults move the answer by
a margin no rounding could produce: **7 of 22 fail** with the defaulting
accessors restored, **2 of 11** with the old `targetWeights`, checked by
reverting. 461 -> 477.

**A repo-wide scanner refuses `||` / `??` applied to the withheld fields**, so
the next call site fails in CI rather than in the terminal -- and **its first
version was wrong, found by its own detector test**: the regex was anchored
tight to the field and missed the live instance
`num(row.conviction_score) ?? 0`, which has a closing paren in between.

**Flagged, not fixed:** `mv_nexus_holdings.total_return_pct` is
`COALESCE(vw_performance_suite.total_return_pct, p.unrealised_return_pct, 0)`
-- 63 of 64 rows take the first branch, **1 takes the mark fallback** and is
still snapshot-served; that COALESCE is the cross-basis substitution
`nexusReturnBasis.js` exists to forbid and re-basing it touches six consumers.
`quality_grade` now pulls in `vw_portfolio_home`'s **unbounded `returns`/`stats`
CTE** (the planner used to prune it; 57,443 rows, external sort 2384kB,
~170 ms) -- net read time still fell, but that node grows with `price_history`.
`vw_nexus_price_freshness` still takes its symbol set from the matview and
joins `price_history` **without filtering `interval`**.

### Equity Research held no financial statements at all (2026-09-22)

EQ-1. Full report in `docs/EQ1_STATEMENT_LAYER_REPORT.md`.

The module's forensics, capital-allocation and ratio panels were not broken in
five places. They were broken in one: **there were no multi-year financial
statements anywhere in the platform.** `equity_cache` carried 913 symbols, 19
with any `financials` key, and `yearly` was EMPTY on every one of those 19
(`max_years = 0`). What the key held was `quarterly` EPS-SURPRISE rows
(`{actual, estimate, quarter}`) -- an earnings-beat series wearing a
statements name.

Piotroski scored **0/9 with eight rows blank because eight of its nine tests
are year-over-year comparisons and there was no prior year.** Altman read
"partial estimate X3+X4 only". Beneish read N/A. CCC, reinvestment rate and
dividend coverage rendered em dashes. None of it was a display bug.

**`equity_fundamentals_derived`'s writer is on-demand and shallow -- and I
first recorded that it had NO writer, which is wrong.** The grep that produced
that claim missed `supabase/functions/`. `compute_ticker_derived` is the
writer, deployed and ACTIVE at version 3, and its `updated_at` is
**2026-08-11 -- exactly the date those 38 rows stop**. It is called by the
Equity Research UI when a ticker is opened and its derived row is missing or
more than 7 days old, so it writes only for tickers somebody looked at. 38 rows
is 38 tickers viewed, not a dead table.

**A wrong dead-writer entry is worse than no entry** -- it sends the next
session to build a writer that already exists. The same correction this file
already had to make about `theme_leadership_weekly`.

What is true, and is the actual defect: the function fetches **2 annual
periods** from Finnhub (`financials-reported`), so every multi-year signal it
owns is starved by construction. Inside it: beneish 0/38, ccc 0/38, reinvest
0/38, div_coverage 0/38, altman full 0/38. Three of its fields
(`pct_earnings_var`, `pct_momentum_12_1`, `pct_revision_breadth`) are
**hardcoded `null`** with a comment saying the series is not available here --
correctly, at the time. With EQ-1's 20 annual periods persisted, it is.

**Check `supabase/functions/` when grepping for a writer.** Three of this
file's layers live there and none of them is reachable from `api/` or `src/`.

**No new vendor was needed.** `api/equity.js:584` already calls Finnhub
`/stock/financials-reported?freq=annual` -- the full XBRL 10-K -- and then does
`annuals.sort(); var latest = annuals[0]`. It fetches the history and keeps one
year.

**Alpha Vantage returns 20 annual periods and 81 quarters** (TGT,
FY2007-FY2026) on all three statements, GAAP/IFRS-normalised, which is what
makes a CFA ratio framework computable without per-filer concept matching.
Field reliability was MEASURED across all 20 periods, not assumed: 16 of 26
income-statement fields and 13 of 30 cash-flow fields are complete on all 20.

**Two vendor traps, both of which would publish a false claim:**
`researchAndDevelopment` is 0/20 for TGT and that is CORRECT -- a retailer has
no R&D line, so NULL means not reported, never zero. And
`paymentsForRepurchaseOfCommonStock` is 0/20 while
`proceedsFromRepurchaseOfEquity` is 20/20: **the buybacks are under the field
whose name reads like the opposite**, so reading the obvious column reports no
buyback programme for a company that has run one for twenty years.

The dead cash-flow working-capital fields (`changeInOperatingAssets` /
`changeInOperatingLiabilities`, 0/20) are why FCFF takes delta-WC from BALANCE
SHEET deltas. Better derivation anyway; here also the only one.

**Proved by computing every dead panel** from the loaded data (TGT FY2026):
Piotroski **6/9** with all nine tests resolving, Altman **3.24 on the full five
components**, CCC **4.8 days** (DIO 59.5 / DSO 6.3 / DPO 61.0), FCFF
**$3.197bn** at a 22.28% effective rate, dividend coverage **72.4% of FCF**.
The CCC is the tell that it is real arithmetic: a big-box retailer turning
inventory in 59.5 days and paying suppliers in 61.0 has working capital that is
almost exactly self-funding.

**Alpha Vantage signals a throttle with HTTP 200** and a `Note` /
`Information` key. A loader that only looks for `annualReports` parses nothing,
writes nothing and closes `success` -- the no-op-answers-200 defect for the
fourth time, and indistinguishable from a company with no filings. Detected
explicitly, terminal for the run, recorded as `details.rate_limited`. An
`Error Message` (bad symbol) is deliberately NOT a throttle, so one bad ticker
cannot abandon the run.

**`sync_log` has no generic row counter.** It carries
`positions_/transactions_/prices_upserted` and nothing else; inventing
`rows_upserted` makes PostgREST reject the ENTIRE patch exactly as `duration_ms`
does, which is how 41 rows sat open for three months. Checked against
`information_schema` before the first run. The count lives in `details`.

**POSTGRES TRUNCATES AN OVER-LENGTH IDENTIFIER SILENTLY AND CREATE TABLE STILL
SUCCEEDS.** `proceeds_from_issuance_of_long_term_debt_and_capital_securities_net`
is 67 characters against a 63 limit; the server cut it, emitted a NOTICE, and
created the table. The file said one thing and the database held another, and
**both were internally consistent** -- invisible from either artefact. It
surfaced only when the first INSERT named the column the file declares and got
`42703`. **Check identifier length before applying; over-length names do not
error.** Fifth file/database divergence in this file, first one caused by a
length limit rather than a paste.

**The production Alpha Vantage key is FREE TIER -- measured 2026-09-22, not
assumed.** Two runs fired from Postgres over pg_net with the Vault
`CRON_SECRET`, the way the chain already calls Vercel handlers, so the secret
never had to be handled directly:

| run | symbols | av_calls | rows | rate_limited |
|---|---:|---:|---:|---|
| `symbols=AMD,JPM,PFE` | 3 | 9 | 909 | false |
| `limit=25` | 4 attempted, 3 written | 11 | 926 | **true** |

The second run stopped mid-batch on AV's own message: *"...free key rate limit
(25 requests per day)"*. So it is **25 requests/day against 3 per symbol --
~8 symbols/day, ~114 days for the 913-symbol universe.** That is the worst case
EQ-1 named, now confirmed rather than feared.

**The throttle guard is what made this measurable.** The run wrote its 3
complete symbols, marked `rate_limited: true`, named the vendor's message and
stopped -- instead of writing partial rows and logging `success`. A loader
without that guard would have reported a clean run and left a silently
truncated universe.

**A partial batch is not a failed batch.** `symbols_written` counts symbols
whose three statements all landed; the run is terminal on a throttle precisely
so a half-loaded symbol never exists.

Finnhub remains the alternative -- 60/min, no daily cap, already wired -- and
**its year-depth is still the one load-bearing assumption unmeasured.** Note
`compute_ticker_derived` asks it for 2 annual periods, which is a choice in
that function and not a statement about what Finnhub serves.

No `cron.job` entry yet: at 8 symbols/day a nightly job burns the cap on the
same head of the list every night, so the prioritised order has to be settled
first. Reading a page can trigger its own symbol on demand, which is the
coverage that actually matters before then.

### The Quality & Forensics data load has never shipped (2026-09-22)

EQ-5b. The panel showed **0/9 Piotroski with eight blank rows**, Altman as a
"partial estimate, X3+X4 only" and Beneish N/A. EQ-1 read that as a data
problem -- no multi-year statements existed -- and that was true but was NOT
the whole cause.

**Measured against the production bundle, on the BASELINE commit, before any of
this session's changes:**

| string | in `src/` | in bundle |
|---|---:|---:|
| `equity_fundamentals_derived` | 6 | **0** |
| `compute_ticker_derived` | 4 | **0** |
| `Composite Fair-Value` (equity-research-panels.js) | 1 | 1 |

So `derived` has always been **null in the deployed app**, whatever the table
held. Every fallback in `QualityTab` and `CapitalTab` was the only path ever
taken. Re-pointing the table at a better source would have changed nothing.

**This is the 2026-09-21 "unused export is tree-shaken" anomaly, resolved.**
That entry ended *"either a large part of the page layer is missing from the
production bundle, or a probe is still misleading me"*. It is the first: code
inside `equity-research.js`'s third `useEffect` does not reach the bundle,
while the same file's module scope does -- a `console.log` at the top of that
very effect ships, and `equity_fundamentals_derived` eight lines below it does
not. `equity-research.js` IS in the sourcemap's `sources`, and
`equity-research-panels.js` ships in full.

**The cause inside rollup is still unexplained. The consequence is not, and is
now measured rather than suspected.**

**Grep the BUILT BUNDLE for a string only your code path can produce.** Not the
sourcemap `sources` list -- that listed `equity-research.js` throughout. Not
the module graph. A string literal from the statement you care about, in
`dist/`, with `grep -o | wc -l`. Three earlier probes agreed with each other
and with the wrong conclusion.

**Two grep traps cost real time here.** `COMPOSITE FAIR-VALUE` reads as absent
because the source says `Composite Fair-Value` and CSS uppercases it -- a
string you can SEE on screen can be absent from a case-sensitive grep. And a
count like `vw_performance_suite` = 3 in the bundle proves nothing when eleven
occurrences span six files; only a string unique to ONE file is evidence.

The fix is not to argue with the bundler: `useStatementDerived` lives in
`equity-research-panels.js`, which provably ships, and loads from the
statements directly. That also upgrades the source -- 20 annual periods rather
than the two `compute_ticker_derived` fetches -- so all nine Piotroski tests
resolve and Altman Z'' computes on all four components.

**Z'' rather than the classic Z**, deliberately: the classic X4 is MARKET
equity over total liabilities, which would drag a market-data dependency into a
score derived from statements. Z'' uses book equity and needs no market cap.
A Z'' missing any component is published as NULL, not as a lower Z'': a
partial score under a band chart reads as a measurement.

**Beneish is ABSENT, not null.** Its eight factors need receivables, PPE and
SG&A, which `vw_company_fundamentals` does not publish (they exist in its base
CTE). Emitting the key would let the panel render an M-score built from missing
terms.

### A ratio layer is where the statement layer's holes become visible (2026-09-22)

EQ-2. `vw_company_fundamentals` (CFA ratios, FCFF/FCFE, growth, SGR),
`vw_company_fundamental_peers`, `vw_company_statement_coverage`,
`atlas_fiscal_aligned_year`. Full report in
`docs/EQ2_DERIVED_FUNDAMENTALS_REPORT.md`. 8.4 ms symbol-filtered.

**EQ-1's hand-computed TGT figures are a real regression test and three of seven
reproduce exactly** -- tax 22.28%, dividend coverage 72.4%, FCF $2,835.0m. The
four that differ (FCFF, DIO, DSO, DPO) are INPUT CHOICES and were run to ground
rather than waved through. FCFF: the view takes the CFO-based definition on the reported $445m
interest expense; EQ-1 reconstructed from net income, and the $16m gap is the
non-cash items that formulation has to enumerate and misses. Days ratios:
EQ-1's 59.5/6.3/61.0 reproduce EXACTLY from ending balances, the view uses
AVERAGE balances (the CFA convention for matching a flow to a stock), which is
why the oldest period of every symbol is NULL for them.

**A financial publishes ratios that are arithmetically correct and
economically meaningless.** JPM FY2025 gave FCFF **-$70,850m**, interest
coverage **0.74** and a current ratio of **14.85** from a straight reading. A
bank has no operating cycle, its interest expense is a cost of revenue rather
than a leverage signal, and CFO is not a free-cash-flow base. **165 of the
913-symbol universe are Financials** -- wrong for 18% of intended coverage, on
exactly the figures a reader would quote. `statement_profile` nulls those and
keeps what does hold (JPM still publishes ROE 16.13%, D/E 1.38).

**The first gate was incomplete, also caught on #804.** `cash_conversion` and
`sloan_accrual_ratio` are CFO-derived too and were still published -- JPM
reported a cash conversion of **-2.59** as an earnings-quality reading.
`gross_margin` and `ebitda_margin` went with them: "gross profit" is not a line
a bank reports, and the view ALREADY nulled `debt_to_ebitda` on the grounds that
EBITDA is meaningless where interest is operating, so publishing the margin
built on that same aggregate was the identical inconsistency wearing different
clothes. **When you gate a family of ratios, enumerate every member of the
family** -- I gated by listing what I happened to think of.

`asset_turnover`, `operating_margin` and `net_margin` are KEPT: a bank's asset
turnover is genuinely low (JPM 0.066 vs TGT 1.787), not undefined.

**Nulling is the honest interim, NOT the end state.** CFA L2 V3 Learning Module
4 sets out THREE frameworks -- CAMELS for banks, and separate ones for P&C and
life/health insurers -- and **none of their inputs exist in the persisted
statements**: no Tier 1 capital, no risk-weighted assets, no NPLs, no allowance
for loan losses, no net premiums earned or written, no loss reserves.
Normalisation is what makes a retailer and a bank comparable in one schema and
is also what discards every line item those frameworks need. Finnhub's
`/stock/financials-reported` is AS-REPORTED XBRL where those concepts survive --
so the throughput fallback and the financial-institution framework are the SAME
piece of work. Its year-depth and cross-filer concept consistency are unmeasured
and load-bearing.

The discriminator is **`assets.sector`, 100% populated across those 913** -- a
classification the database already owns. An interest-to-revenue threshold was
rejected even though it separates cleanly here (JPM 35.0% against <=4.3% for
every other loaded name): **calibrating a threshold on six symbols is the
mistake this file keeps recording.** Note this is the opposite call to H-2's,
where the MODAL sector inside a risk bucket was literally `Other` -- there the
question was what a cluster is about, here it is what kind of filer this is,
and the field answers the second reliably.

**A non-payer had no sustainable growth rate at all.** AMD pays no dividend, AV
omits the line, so `dividends_paid` was NULL -> retention NULL -> SGR NULL --
precisely the names where SGR is wanted, and precisely the input the valuation
module's SGR-above-WACC problem needs.

**I "fixed" that by inferring zero from absence. It was wrong, CodeRabbit
caught it on PR #804, and it is reverted.** The objection: `operating_cashflow
is not null` proves ONE field parsed, not that the dividend fields were
complete. The data proves it twice:

| | |
|---|---|
| GOOGL, paid nothing 2013-2023 | explicit `0` for 2014-2017 and 2022-2023, **NULL for 2018-2021** |
| AMD, never paid a common dividend | **6m / 85m / 104m** for 2019-2021, NULL for 2022-2025 |

**The vendor field is unreliable in BOTH directions** -- NULL where zero is
true, and non-zero where no common dividend was paid -- so absence cannot carry
a claim about what the company paid. My justification ("AMD pays no dividend")
was contradicted by AMD's own rows, which I had not looked at before asserting
it. **Check the column's history before letting absence mean anything.**

The cost is accepted and stated: a genuine non-payer has no retention ratio and
no SGR. An absent number beats a fabricated one, and SGR feeds valuation.
`dividend_line_reported` stays and now reports what the VENDOR did, never what
the company did.

**The join is what made EQ-1's loader defects visible.** SNDK had an income
statement and no balance sheet and no cash flow: the loader wrote each
statement AS IT FETCHED, so the AV throttle broke the run between calls.
EQ-1's PR claimed a run is terminal on a throttle "so a half-loaded symbol
never exists". **It was false.** Fetch all three, then write -- a symbol is now
atomic against the interruption that actually happens.

**And the half-loaded symbol was STICKY.** The freshness check read
`company_income_statement` ALONE, so SNDK counted as loaded and would be
skipped for the whole 30-day window, permanently incomplete.
`vw_company_statement_coverage.is_complete` is the single definition of
"loaded" and the loader reads it.

**The symbol was INVISIBLE, not merely wrong.** `vw_company_fundamentals`
inner-joins the three statements, so SNDK did not report itself incomplete --
it was simply not there. **An absent symbol and an incomplete one are different
facts.** Same family as `price_coverage` counting holdings while the universe
froze: a measure scoped to one set cannot see what happens outside it.

**The peer median is computed only from loaded statements** -- no default, no
vendor composite, no fallback, so a thin set reports itself as thin. The
company is EXCLUDED from its own peer group (a median containing the subject is
not a benchmark, and in a small cohort the subject can BE the median);
`peer_count` counts peers with a MEASURED value for that metric, never cohort
size; `peer_percentile` is NULL when the company has no figure of its own,
because a company that cannot be measured does not sit at the bottom of its
peer group.

**Group on the economic year, not the fiscal one.** `atlas_fiscal_aligned_year`
shifts a year-end back six months, so a January-closing retailer aligns with
the previous December-closing filer. Grouping on `fiscal_year` compares TGT's
FY2026 against GOOGL's FY2026 -- a full year apart. Verified: WMT (Jan-2026)
and COST (May-2026) both land on 2025 and compare correctly, giving gross
margin 24.93% vs 12.84% off their own filings.

**`percentile_cont` HAS NO NUMERIC OVERLOAD.** It coerces to double precision
and returns it, so the medians published as float8 beside exact-numeric values.
Cast the result back, and a view column's type cannot be changed by
`CREATE OR REPLACE`, so this needs a DROP.

**The reason first given for that cast was WRONG and CodeRabbit corrected it on
PR #804.** I wrote that float NaN does not equal itself while numeric NaN does.
Measured on PG 17.6: both are **true**, for `=` and for `> 1e308` alike --
Postgres departs from IEEE 754 for both types so NaN can sort. There is no
asymmetry and the cast does not close a NaN door.

The cast is still right, for a narrower and duller reason: **float8 is inexact**
and these are financial values, so `vs_peer_median` should be an exact
difference of two exact numbers rather than a numeric minus a float8. Keeping a
correct change for a wrong reason is how a wrong reason spreads -- it had
already reached this file's PR #783 entry.

**A percentile over one peer is degenerate** -- it can only be 0 or 1. No floor
is baked in, because the right one is a display decision that depends on the
metric; `peer_count` is published beside it and the surface must state it.

**Flagged, not fixed:** the peer view's correlated lateral is trivial at ten
symbols and becomes a self-join over ~500k rows at 913 x 31 metrics x 20 years.
**It has not been measured at scale and cannot be until coverage grows** -- a
growth-linked node, a clock rather than a constant.

### The dashboard's Test panel cannot wait for a 110-second function (2026-09-22)

Reported as "`sync_fundamentals` doesn't work or is broken", with a 500 reading
`Cannot read properties of undefined (reading 'error')`.

**The function is healthy.** A direct call returns HTTP 200 in 3.5s
(`sync_log` #50208, success, 1 enriched). The dashboard's Test panel sends its
template body `{"name": "Functions"}`, which carries no `symbols` key -- so the
function takes the UNIVERSE branch, a 120-symbol slice, and runs its full
`WALL_CLOCK_BUDGET_MS` of 110 seconds. `sync_log` #50182 records exactly that:
110,194 ms, mode universe, 30 enriched, `budget_exhausted: true`, closed
cleanly as `partial`.

The panel timed out and **its own error handler crashed reading `.error` off an
undefined response**. Nothing in the function body dereferences `.error`; the
deployed bundle (v8) matches the repo. **A 500 rendered by a test client is not
necessarily a 500 returned by the function** -- call the URL directly before
believing the panel. Test it with `{"symbols":["TGT"]}`, which returns in ~1.3s.

"Total invocations 0" on that page is the dashboard's 24h-lagged analytics, not
a claim about whether the function has run.

### Finnhub is a SEC 10-K feed, so it cannot replace Alpha Vantage (2026-09-23)

EQ-3, measured against production. Full report in
`docs/EQ3_FINNHUB_MEASUREMENT_REPORT.md`. The working assumption across three
entries above was "move the statement loader to Finnhub". **That is wrong, and
the split is not where it was assumed to be.**

**The sparse-payload hypothesis is dead.** Every period carries concepts --
TGT 16/16 at 64-96 concepts each, JPM 15/15 at 108-118, AAPL 16/16. The
original MISS was the namespace after all: everything resolves to the
`us-gaap_` UNDERSCORE spelling while the candidate lists were bare local
names. A few tags come back already stripped (`CommonStockSharesOutstanding`,
`LongTermDebt`), so all three spellings genuinely occur.

**THE COVERAGE CLIFF: 4 of 4 foreign filers return ZERO periods**, against 3 of
3 US filers at 15-16. ASML, TSM, SONY and ABEV all come back with `forms: []`
-- the vendor returned no rows, not rows a `10-K` filter rejected.
`financials-reported` is a **SEC 10-K feed**, and a foreign private issuer
files a 20-F. That is **14.04% of the book** (TSM 3.82, ASML 3.00, ABEV 1.93,
ATAT 1.93, SONY 1.89, PBR 1.47). Alpha Vantage serves them -- ASML returns 20
annual periods in EUR -- so **the throughput problem and the coverage problem
pull in opposite directions and neither vendor alone closes both.**

**Per-field coverage is uneven, which rules out a swap on its own.** As-reported
XBRL carries only what the filer tagged on that filing's face statements, and
practice drifts over the years. TGT matched 24 of 30 fields, but
`operating_income` on 8/16 periods, **`net_income` on 5/16**, `gross_profit`
3/16. Net income in under a third of years is disqualifying for the ratio
layer: Piotroski, ROE and every margin rest on it. **`vw_company_fundamentals`
stays on Alpha Vantage.**

**What Finnhub uniquely gives is the thing EQ-2 recorded as impossible.** That
entry says the CAMELS inputs "do not exist in the persisted statements" -- true
of AV's NORMALISED schema, false of Finnhub's as-reported payload. JPM carries
`net_interest_income`, `noninterest_income`, `noninterest_expense`, `deposits`
and `allowance_for_credit_losses` on **15 of 15 periods**. Tier 1 capital and
risk-weighted assets are still absent (they live in the regulatory capital
tables, not the face statements), so CAMELS' **C** leg remains uncomputable;
A, E and L largely are.

**So EQ-4 builds on Finnhub and EQ-2 stays on AV.** 165 of the 913-symbol
universe are Financials, essentially all US-listed, which is precisely where
Finnhub's coverage is strongest and its 10-K restriction costs nothing.

**JPM's GAAP misses corroborate EQ-2's `statement_profile` from the vendor
side** -- no cost of revenue, no gross profit, no inventory, no current
assets or liabilities. That gate was reasoned from the CFA framework; this is
independent confirmation that a bank genuinely does not report those lines.

**The instrument was nearly wrong twice, and both were caught by review.**
`details.base` / `run_tag` (EQ-3c) prove which server answered -- two earlier
runs took Vercel's deployment-protection LOGIN PAGE as a 200 and, writing no
`sync_log` row, let `ORDER BY id DESC` serve the previous run's row as a
measurement. And the namespace collapse (below) would have laundered
`ifrs-full:` into a us-gaap match, with **ASML, an IFRS filer, in this very
sample**. It returns no rows at all so no figure moved -- luck, not design.
**A probe that cannot say which server answered it is not a measurement.**

**The throughput ceiling is unresolved and is a SPEND decision, not an
engineering one.** Finnhub does not rescue it, because it cannot feed the ratio
layer at all.

### A namespace is part of a concept's identity (2026-09-23)

Raised by the Codex reviewer on PR #808. `localName` took the last `:` or `_`
and dropped whatever preceded it, so `ifrs-full:Assets` and `issuer:Assets`
both collapsed to `assets` and counted as the US-GAAP candidate -- the probe
would report mapping coverage it does not have. **The test I wrote explicitly
blessed the IFRS spelling**, pinning the wrong behaviour.

`conceptKey` strips ONLY the two Finnhub encodings of `us-gaap` (`us-gaap:`,
`us-gaap_`, case-insensitive) plus the bare form the vendor sometimes already
strips. Every other taxonomy keeps its prefix and stays visible as a mismatch.

**`foreign_taxonomy_tags` is the other half.** A miss because the concept is
ABSENT and a miss because the filer uses ANOTHER TAXONOMY are different
findings, and collapsing them is what the defect did. An IFRS filer now reports
`matched: null` *and* names the IFRS tag it used -- the discriminator EQ-4 needs
to tell a US filer from a foreign one, arriving from the same run rather than a
second investigation.

Same family as the `fwd_pe` entry: **a key that asserts an identity must be
checked against what it actually matches**, not against what it looks like it
matches. 164/164, and the two new tests fail against the pre-fix collapse,
checked by restoring it.

### A second, independent Alpha Vantage key is also free tier (2026-09-23)

EQ-1 measured the production AV key at 25 requests/day and concluded coverage
needs ~114 days for the 913-symbol universe. The obvious escape is "use a
different key", so it was **tested rather than assumed**: a second AV
credential, reached through this session's own MCP server rather than through
the platform, returns the same message -- *"free key rate limit (25 requests
per day)"*.

So the throughput ceiling is a property of the **plan**, not of that one key.
There are exactly two ways past it: pay for AV premium, or move the statement
loader to **Finnhub** (60/min, no daily cap, 11-16 annual 10-K periods
measured). That is EQ-3, and it is the reason EQ-3 matters rather than being a
nice-to-have fallback.

**Parallel requests do not just fail, they SPEND.** Twelve calls fired in one
batch tripped the undocumented-until-you-hit-it **1 request/second burst
limit**, and the refusals still counted against the daily 25. Serialise, or the
quota is gone before the work starts.

**The backfill wrote nothing, and I read that as the design working. It was
not -- corrected 2026-09-23.** The ingest script imports `rowsFor` and
`STATEMENTS` from `api/sync-financials.js` and writes through the same
`atlas_upsert_company_statements` RPC, so a row it writes is indistinguishable
from a loader row -- and it refuses a symbol unless all three statements are in
hand. That atomicity guard is real and is EQ-2's lesson (SNDK had an income
statement and no balance sheet) applied to the one-off path. Row counts before
and after: 845 / 828 / 828, unchanged.

But the RPC **could not write a row at all** -- it threw 23502 on every call
since it shipped, for the `loaded_at` reason in the 2026-09-23 entry below. The
zero was over-determined and the two causes are indistinguishable from outside.
**A plausible explanation for a zero is not a measurement of one**; the check
that settles it is one call with a sentinel payload, which takes seconds.

**A management-API SQL path exists from this container.**
`POST https://api.supabase.com/v1/projects/<ref>/database/query` with
`SUPABASE_ACCESS_TOKEN` is the same capability the Supabase MCP uses and is
scriptable from Bash, which is what makes a bulk backfill cheap when there is
data to load. There is no service-role key and no `SUPABASE_DB_URL` in the
container; only the management token.

### Equity Research was painting from six palettes and three extra accents (2026-09-23)

The UI-upgrade item from the brief. The module did not look different because
it was missing tokens -- it looked different because it never joined the ramp
that the shell unification already established. `:root` in `globals.css` IS
`.nexus-flagship`'s ramp (`--navy-2` == `--card` == `#121821`); the module
simply painted from literals that predate it.

**Six local `var T = {}` palettes, no two agreeing**, plus `equity-research.js`
with no palette at all -- only literals:

| file | green | red | text | muted2 |
|---|---|---|---|---|
| `equity-research-panels` | `#41d18a` | `#f76d6d` | `#e7eef5` | `#5a6573` |
| `equity-background-tab` | `#22c55e` | -- | `#e6edf5` | `#63748c` |
| `equity-financials-tab` | `#22c55e` | `#ef4444` | `#e6edf5` | `#63748c` |
| `equity-valuation-tab` | `#22c55e` | `#ef4444` | `#e6edf5` | `#63748c` |
| `equity-technicals` | `#22c55e` | `#ef4444` | `rgba(255,255,255,.88)` | -- |
| ramp | `#22c55e` | `#ef4444` | `#e3e9f2` | `#51647b` |

**And THREE accents beyond the ramp's cyan** -- `#00d4b8`, `#00d4ff` and
`#3b82f6`. The shell entry above records the same shape one layer out ("The
chrome carried two accents at once"); this module had three, and `#00d4b8` is
the single literal most responsible for Equity Research reading as a different
product. `src/pages/equity/equityTheme.js` is now the one palette.

**RAW HEX, NOT `var(--token)`, AND THAT IS THE LOAD-BEARING DECISION.**
`T.cyan` reaches Chart.js as `borderColor` (`equity-technicals.js:148`,
`:232`), and **a canvas cannot resolve a CSS custom property** -- it would
paint nothing and report no error, which is the dead-`var()` defect the shell
entry records, in a place no screenshot would explain. The cost is that the
values can drift from `globals.css`, so `src/lib/equityTheme.test.mjs` parses
that file and asserts every one still matches. **"Move them together" is a CI
gate here, not a comment.**

**THE NAME TRAP: `--border` is `0.11` in `globals.css` and `0.07` in
`nexus-flagship.css`** -- the same name, the two alpha steps swapped between
the files. The module's `border` has always been the subtle one and `border2`
the stronger, so they land on `0.07` and `0.11`. **Convert on VALUES, never on
names**; taking the names at face value inverts every edge in the module.

**Dim washes are DERIVED, never typed.** The six palettes carried them at .09,
.13 and .15 for no stated reason. One `dim(hex, alpha)` at one alpha makes a
wash that disagrees with its base impossible to write. `violetDim` .09 -> .13
is a real, intended change.

**Scope the scanner to the IMPORT CLOSURE, not a glob.** The first version
globbed `src/pages/equity*.js` and over-reached into `equity-valuation.js`,
`equity-risk.js` and the four `equity-dcf-*` files -- the **Valuation House**,
a different page with its own chrome decision. A hardcoded list has the
opposite fault: it goes stale exactly when a tab gains an import, which is when
a new palette arrives unnoticed. The closure tracks the module as it is.

**The scanner read its own documentation as code** -- `equityTheme.js` names
the accents it removed, and the first run failed the module that fixed the
problem. `pagerOrdering.test.mjs` hit the identical trap. Comments are stripped
(`//` only when not preceded by `:`, so a URL survives) and **the stripping is
itself tested**, both that it removes prose and that it does not blind the
scanner to a live literal.

**A mid-token replacement left `dim(T.cyan, 0.6))'`** -- a syntax error found
by reading the patched region, not by the build. Same lesson as
`perf-panels-top.js:477` and the `var` hoisting near-miss in `risk-v2.js`:
**`vite build` is not a scope audit.**

161/161, and the detector is proven by reverting -- reintroducing one local
palette carrying `#00d4b8` fails 2 of 9.

**Flagged, not fixed, and deliberately:** `equity-peers`' eight-colour chart
series palette and `equity-screener`'s Value/Growth/Momentum bucket taxonomy
are doing a different job from chrome, and **G-2 mirrored that taxonomy onto
the holdings table** -- re-basing it re-bases a vocabulary shared with another
surface. The Valuation House files above still carry `#00d4ff`. Also
`equity-peers.js:121` calls `.replace(')', ',0.4)').replace('rgb','rgba')` on
what are HEX strings, so it is a no-op returning the hex -- pre-existing, not
touched here.

### A column with a DEFAULT is mandatory under `select *` (2026-09-23)

`atlas_upsert_company_statements` shipped in EQ-2 and **could not write a
single row**. Found by checking whether the pattern EQ-4's own writer was
copied from actually works, before copying it.

```
select atlas_upsert_company_statements(p_income := '[{...}]')
ERROR 23502: null value in column "loaded_at" ... violates not-null constraint
CONTEXT: insert into public.company_income_statement
         select * from jsonb_populate_recordset(...)
```

`insert into T select * from jsonb_populate_recordset(null::T, payload)` fills
**every** column of `T` from the payload, and a key the payload omits comes back
NULL rather than absent. `loaded_at` is `not null default now()` and `rowsFor()`
has never set it, so every call died. **No statement load has succeeded since
the RPC shipped**; the layer is frozen at what the earlier direct-POST path
wrote -- 845/828/828 rows, 10 symbols.

**The default is the trap.** A column with a default reads as optional, and
under `select *` it is mandatory and unstated. PostgREST applies a default for a
key it is not sent, so the SAME payload succeeds through a plain POST and fails
through the RPC -- the transactional wrapper added to make a symbol atomic is
the thing that broke it. Any NOT NULL DEFAULT column added to those tables later
breaks it again, silently, in exactly the same way.

**EQ-3 read the resulting empty backfill as the atomicity guard working.** That
entry says the ingest script "refuses a symbol unless all three statements are
in hand" and that row counts were unchanged "by design". The guard is real; this
would have refused the write regardless, and the two were indistinguishable from
the outside. **A plausible explanation for a zero is not a measurement of one.**

Fixed by stamping `loaded_at` inside the function rather than naming the other
24/36/28 columns, which keeps the property the original was written for. It is
also the more correct reading of the field -- when the DATABASE received the
row, not when a client said it did -- and it removes a caller's ability to
backdate it.

**No test covered the RPC writing anything**, only its SQL parsing, which is why
a total write failure sat one level below everything that looked at it.
`supabase/tests/company_reported_lines_contract.sql` is 9/9 against production
in a rolled-back transaction, and case 1 is the exact payload shape `rowsFor()`
produces -- observed throwing before the repair and passing after.

### Never delete on two arrays compared with `= any` (2026-09-23)

`atlas_upsert_reported_lines` first scoped its DELETE
`where symbol = any(v_syms) and source = any(v_src)`. That is a CROSS PRODUCT: a
batch carrying (A, finnhub) and (B, alpha_vantage) deletes A's alpha_vantage
lines and B's finnhub lines, neither of which it is about to rewrite. Harmless
while one run uses one source, which is the condition that stops being true
later and without warning. Scope the DELETE to the PAIRS actually present.

### The framework comes out of the filing, not out of the sector (2026-09-23)

EQ-4. `company_reported_lines` / `atlas_upsert_reported_lines` /
`mode=reported`. Full report in `docs/EQ4_INSTITUTION_LAYER_REPORT.md`.

Eight insurers probed -- TRV, PGR, CB (P&C), MET, PRU, AFL (life), UNH, HUM
(health). All return **16-19 annual 10-K periods**, 251-472 distinct concepts.
CB is Swiss-domiciled and still files a 10-K, so EQ-3's 20-F cliff is about
foreign PRIVATE ISSUERS, not about domicile.

**`loss_reserves` misses exactly the three life names; `future_policy_benefits`
misses exactly the two pure P&C names.** That is not a coverage gap, it is the
two business models reporting different liabilities -- which is what the CFA
frameworks separate them on. A bank carries deposits and net interest income and
neither.

**`assets.sector` cannot pick the framework, and this is measured:** `Other`
covers **6,879 of 7,921** active rows. The field is meaningful only inside the
`equity_cache` cohort (942 symbols: 165 Financials, 4 `Other`, 21 null) --
EQ-2's `statement_profile` gate is safe for that reason and the claim
"100% populated" was about the cohort, not the table. Inside it, `Financials`
still mixes banks, insurers, asset managers and exchanges, and health insurers
sit under `Healthcare` (UNH, ELV, CI, HUM). **The sector decides who is worth
fetching; the filing decides which framework applies.**

**Three fields are wrong or unavailable, so the COMBINED RATIO waits.**
`underwriting_expense`'s only candidate is
`DeferredPolicyAcquisitionCostAmortizationExpense` -- DAC amortisation is a
component of underwriting expense, not the measure, so publishing an expense
ratio from it is the `fwd_pe` defect again. `premiums_written_net` hits 1/8 (the
CFA denominator; Travelers itself reports on earned, per the text's own
footnote). `policyholder_benefits` hits 0/8. Both terms of the **loss and LAE
ratio** hit 8/8, so that is computable and the combined ratio -- which is loss
ratio plus expense ratio -- is not. **CAMELS - C is not computable from this
source at all**: Tier 1 and RWA are in the regulatory capital tables, not the
face statements, absent on every filer probed. A, E and L largely are.

**`sample_concepts` could not fix the mapping** -- it is the first 40 tags in an
arbitrary order out of several hundred. `conceptSearch` matches the **LABEL** as
well as the tag, which is the load-bearing half: the label is what a human wrote
in the filing, so it can find a tag that was never guessed, where a tag search
can only find what you already thought of. `periods` on each hit, for the reason
`periods_covered` exists: a tag used in one filing of sixteen is not a series.

**Stored LONG FORM on purpose.** The tag-to-field mapping is exactly what is not
known, so a corrected mapping is a `CREATE OR REPLACE VIEW` rather than a
backfill -- the `ratio_pairs` argument. It also turns "which tag does this filer
use" into a SQL query instead of a code change, a deploy and a vendor call,
which is the round trip that made this unit slow.

**`taxonomy` is NULL exactly when the concept is us-gaap in ANY of its three
spellings**, so `taxonomy is not null` IS the foreign test in one predicate.
Storing `taxonomyOf`'s raw prefix gives `'us-gaap'` for `us-gaap:Assets` and
NULL for the bare `Assets` the vendor sometimes already strips -- and then
`taxonomy is distinct from 'us-gaap'` counts every bare tag as foreign. Caught
by testing, not by reading; 2 of 37 fail against the raw accessor.

**Not loaded yet.** Preview deployments on this project are SSO-gated, so every
Finnhub measurement round costs a merge to `main`. Finnhub is 60/min with no
daily cap, so the ~165-symbol cohort is about three minutes of calls -- the
Alpha Vantage throughput ceiling does not apply to this layer.

### A filer changes its tags, and the concept list knows one spelling (2026-09-23)

The first real load of `company_reported_lines` — eleven financial filers,
19,727 lines, 2010-2025. Full report in `docs/EQ4_INSTITUTION_LAYER_REPORT.md`
§7. Three defects, and **not one of them is visible on a probe of one
filer-year**, which is what every EQ-3 and EQ-4 measurement before this was.

**`pc_insurer` named a property the filers do not have.** UNH and HUM were
classified `pc_insurer` and write no property and no casualty business at all.
What the view tests is **ASC 944's SHORT-DURATION vs LONG-DURATION contract
distinction**, and a health insurer files short-duration contract liabilities
exactly as a P&C insurer does — so the measurement was right and the label was
false. The `fwd_pe` defect, in a framework name. `short_duration_*` /
`long_duration_*`, with the old names kept as aliases and a test asserting they
still track.

**ONE LIABILITY, THREE TAGS, SPLIT BY ACCOUNTING ERA.** The future-policy-
benefit liability is reported as `LiabilityForFuturePolicyBenefits`, as
`...AfterReinsurance` (MET 2019-2022) and as `...AndUnpaidClaimsAndClaims-
AdjustmentExpense` (PRU 2010-2022) across LDTI (ASU 2018-12) adoption — all
three labelled *"Future policy benefits"* by the filers themselves. PRU read as
having **no framework at all on 13 of its 16 years**. Health insurers tag
losses `PolicyholderBenefitsAndClaimsIncurredHealthCare` through 2023 and
generically from 2024, so UNH and HUM had a loss ratio on **4 filer-years of
32**. After: PRU 15/16, MET 16/16, 32/32.

**Verify an alias by the filer's own `label`, not by the tag's shape.** That is
what storing the long form buys. Two candidates were REFUSED on that reading:
AFL's `LiabilityForUnpaidClaimsAndClaimsAdjustmentExpenseNet` is labelled
`[Roll Forward]` — a reconciliation header, not a closing balance — and PRU's
combined tag pools both durations, so it is accepted to CLASSIFY and refused as
a MEASUREMENT. **Good enough to classify is not good enough to measure**, and
it is its own test case rather than a comment. Conversely BAC's legacy loan tag
is labelled `[Abstract]` and its VALUE is a real loan book (0.40 of assets):
**a bracketed label is a warning, not a verdict — corroborate the number.**

**CAMELS A was refused as a class and is computable per row** — 48 of 62 bank
filer-years, under a legacy tag pair through 2019-2021 and the ASC 326 (CECL)
pair from 2020-2022. The 14 refusals are exactly the years each filer straddles
that change (BAC 2020-21, C 2020-22, JPM 2016-2020, WFC 2022-25). It
corroborates rather than merely computing: loans/assets 0.45-0.58 at WFC, the
loan-heavy bank, against 0.28-0.34 at JPM, and every allowance series traces
the post-GFC normalisation from 4.7% in 2010 to 1.0% in 2019 and back up after
CECL. **A class refusal was hiding a measurement.**

**I wrote a coverage figure before the object that carries it existed.** The
EQ-4h comment says "41 of 62" — from a probe query reading a narrower allowance
list than the view ships. It is 48. Corrected in EQ-4i as its own migration
rather than by editing EQ-4h, because EQ-4h is what the database ran.
**A comment stating a coverage figure is a claim about the data and has to be
measured against the object that carries it.**

`benefits_to_premiums` reads like a loss ratio and is not one — PRU 1.098, MET
0.995, AFL 0.554 on FY2024 — because a long-duration insurer earns most revenue
as net investment income and policy fees. `benefits_ratio_caveat` is present on
**62 of 62** rows carrying the figure, zero uncaveated.

The figures corroborate published reality throughout: JPM efficiency **0.517**
(~52% reported), UNH loss ratio **0.855494** against a published **85.5%**
medical care ratio, HUM **0.898** against ~89.8%, TRV 0.645, PGR 0.693.

**Ratio proof case 11 is the sharpest test here**: the same bank, the same
numbers, the two tag eras, asserted to agree EXACTLY. If they disagreed the
ratio would be a statement about XBRL practice rather than about the bank.
12/12 and 12/12 against production, both rolling back, both including their
happy paths; cases 8-12 in each fail against the pre-fix views.

**CB is the duplicate-year case.** It returns 19 filings all tagged `10-K` with
2011, 2012 and 2013 each appearing twice — the two predecessor registrants of
the merged Chubb/ACE entity — which is what `pickOnePerYear` (EQ-4g) exists
for. Committed, not yet re-run.

### An undefined `T.<token>` renders as nothing, silently (2026-09-23)

EQ-4j put the institution framework on the Financials tab, and both
`background: T.navy2` and `fontFamily: T.sans` were written into it. **Neither
token is on the palette.** React drops a style property whose value is
`undefined`, so the tile had no background and no reported error — the
dead-`var()` failure recorded for the app shell, in a JS form instead of a CSS
one. `vite build` was clean, 597 tests were green, and the strings shipped to
the bundle.

The palette is `card / card2 / cardHi`, `border / border2`, `text / muted /
muted2`, `mono / display`. There is no `navy2` and no `sans`; the ramp keys
(`--navy-2`) are the SOURCE of `card`, not a token name.

`src/lib/equityThemeTokens.test.mjs` parses `equityTheme.js` for the names it
actually exports and fails any `T.<token>` in the Equity Research closure that
is not one of them. It carries the three tests such a scanner needs: that the
palette parses to a non-empty set (a vacuous scan passes trivially), that it
finds the exact two-token shape that shipped, and that it does not read its own
documentation as code — `pagerOrdering.test.mjs` and the EQ-6 palette scanner
both hit that last one. Reintroducing `T.navy2` fails it, checked by reverting.

**The EQ-6 scanner checks for hardcoded literals; it cannot see a token that
does not exist.** Those are different failures and need different checks.

### The tab said the framework "is not built yet" (2026-09-23)

EQ-4j. `vw_company_institution_ratios` had no consumer, so opening JPM in
Equity Research showed an amber note reading *"A CAMELS framework is the right
instrument here and is not built yet."* It is built. **A sentence on screen
asserting a capability does not exist is the wrong-entry defect this file
already records twice** — once about `theme_leadership_weekly`, which had
recovered while the entry still called it dead.

`src/lib/institutionView.js` is pure and decides only what may be RENDERED;
`src/pages/equity/institutionRatios.js` is transport. The `clusterView.js` /
`segmentView.js` split, and it is what lets the shape be tested without a
bundler.

**A metric is ABSENT from the shape when unmeasured** — not null, not zero, not
an em dash the renderer supplies. WFC's FY2025 filing reports no loan book, so
`allowance_to_loans` is not a key on the object and a renderer cannot print
`0.00%` of a bank's loan book. Verified against the live rows, not a fixture:
JPM publishes both CAMELS A ratios and withholds C, WFC withholds A with its
reason, UNH carries no bank metric at all, and PRU's `benefits_to_premiums`
(1.1437 on FY2025) arrives **only** with its caveat — a row carrying the figure
without it is refused.

**Four states, because they need four different actions.** `not_loaded` (no
as-reported lines for this symbol — the layer covers 11 filers, not the
universe) is not `no_framework` (lines loaded, no depository or insurance
contract lines, which is an ANSWER about the filer), and neither is `failed`.
A transport failure never renders as a statement about the data.

**The panel lives in `equity-financials-tab.js` and the string is confirmed in
`dist/`**, with `grep -o | wc -l` on a literal only this path can produce —
the EQ-5b rule, because that module's sibling `equity-research.js` has an
effect body rollup does not emit. **What is proven is the shape builder against
live rows and that the code ships; the render is not** — the browser in this
container cannot reach Supabase.

### Tab 5 is not blocked, and `industry` is a copy of `sector` (2026-09-23)

I filed EQ-7 (industry and competitive positioning) as blocked on peer
coverage. **That was wrong, and it was wrong because I reasoned from one peer
source instead of looking.** `vw_company_fundamental_peers` is thin — it is
derived from the Alpha Vantage statement load, which is 10 symbols behind a
25-request/day ceiling — but it is not the only peer basis in the platform.

`equity_screener_universe` carries **913 symbols, refreshed daily** (cached
2026-09-23 12:31 UTC) with `market_cap_usd`, `forward_pe`, `ev_ebitda`,
`price_to_book`, `price_to_sales`, `roe_ttm`, `roa_ttm`, `gross_margin`,
`net_margin`, `rev_growth_yoy`, `rev_growth_3y`, `eps_growth_yoy`,
`return_52w`, `return_13w`, `beta`, `vol_3m`, `roic_pct`, `wacc_pct` and
`roic_wacc_spread_pct`. **None of that depends on the AV statement layer.**
A positioning tab built on it is unblocked today.

**AND THE COHORT COLUMN IS NOT WHAT ITS NAME SAYS.** `industry` and `sector`
both hold 46 distinct values, and the reason is that **`industry` is a copy of
`sector`**: 896 rows identical, 17 rows where `industry` is NULL, and
**0 rows where both are present and differ**. There is no independent industry
classification anywhere in this table. Building an "industry peer group" from
it would publish a claim about granularity the data does not carry — the
`fwd_pe` defect, in a cohort definition.

**The granularity is also inverted from the names.** The 46 buckets are
Finnhub's single-level `finnhubIndustry` taxonomy, and they mix GICS sector
names (`Technology`, `Energy`, `Utilities`, `Real Estate`) with GICS *industry*
names (`Semiconductors`, `Banking`, `Biotechnology`, `Pharmaceuticals`,
`Aerospace & Defense`). It is neither level cleanly, so **name a cohort for the
vendor taxonomy it comes from, never "industry" or "sector"**.

Usable as a cohort basis: **30 of the 46 buckets carry 8 or more members,
covering 854 of 913 symbols (93.5%)**. The smallest bucket is 1 and the largest
67, so a floor is needed and the share below it has to be stated — the
`peer_count` rule EQ-2 already established.

**Per-field coverage is uneven inside a cohort and that is informative, not
noise.** `ev_ebitda` is **0 of 63** on Banking — a third independent
corroboration of EQ-2's `statement_profile` gate, after the CFA framework
argument and Finnhub's own GAAP misses. Biotechnology carries `forward_pe` on
18 of 44, because a pre-revenue biotech has no meaningful forward multiple.
A cohort median must count members with a MEASURED value for that metric, never
cohort size.

**The lesson is the one this file keeps recording about itself:** a blocker I
asserted from one source was removed by a single query against another. Check
before filing something as blocked.

### `RANGE ... 1 PRECEDING` is a VALUE offset, not a row offset (2026-09-23)

EQ-7's peer layer. `peer_percentile` was meant to be "how many peers rank
strictly below this one", written as

```sql
count(*) over (partition by cohort_key, metric order by value
               range between unbounded preceding and 1 preceding)
```

In RANGE mode the offset is **arithmetic on the ordering value**, so that
counts peers whose value is at most `value - 1` — it subtracts one unit of
whatever the metric is measured in. On `beta`, where the universe spans about
0 to 3, subtracting 1 discards a third of the range; on `roe_ttm`, spanning 0
to 110, it discards almost nothing. **The error was not even consistent
between metrics.**

**Postgres accepts it silently** because `value` is numeric and a numeric
RANGE offset is legal. It is a correct query computing a different quantity,
which is exactly why nothing caught it: percentiles stayed inside [0, 1],
`peer_count` stayed consistent with `peer_median`, no plan node looked odd,
and every row read plausibly. Eight structural invariants over all 14,058 rows
passed while the number was wrong.

**It was found only by computing the same quantity a second way** — a plain
`count(*) where b.value < a.value` over the same cohorts — and measuring the
disagreement: **0.905 on a figure bounded by 1.**

`rank()` is the right primitive. It is 1 + the count of strictly smaller
values, so `rank() - 1` is exactly "peers strictly below", ties on neither
side, and the subject excluded because its own value ties with itself. Use
`ROWS` when you mean rows; `RANGE` with an offset is for values, and ordering
by a measurement makes the two look identical in the source.

**The leave-one-out median beside it was right**, checked in the same pass —
1,442 rows, max difference 5e-7 against `percentile_cont` excluding the
subject, which is the 6-decimal rounding. **Verify each derived column
separately**: they were written in one sitting and only one of them was wrong.

**An aggregate hid the distribution, three times in one session.** Cohort-level
coverage looked healthy (Banking `forward_pe` 58 of 63) while **JPM carries
nothing but `roic_pct`** and TGT three of twenty metrics. Per symbol: 820 of
913 carry 12+ metrics, 42 carry four or fewer. And `roic_pct` /
`roic_wacc_spread_pct` sit at **3.6%** because their writer
`compute_ticker_derived` is on-demand and stopped at 38 tickers. Read the
distribution, not the mean — this file already says it about `pg_stat_statements`
and it is the same mistake in a coverage query.

`equity_screener_universe` is a **VIEW over `equity_cache` JSON**, not a table:
it seq-scans and re-parses that payload twice per read, which is most of the
413 ms `vw_company_peer_cohort` takes. Under the 3,000 ms anon cap, and a
growth-linked node — flagged, not fixed.

### The statement layer had a vendor ceiling, not an engineering problem (2026-09-24)

EQ-8a. Ten of 913 symbols carried financial statements, so every panel
downstream of the statement layer had nothing to work with -- AAPL among them.
The cause was a **plan**, not code: Alpha Vantage is 25 requests/day on two
independent free keys at 3 calls per symbol, about eight symbols a day and
~114 days for the universe.

**Three sources were measured against production before choosing.**

| source | throughput | coverage |
|---|---|---|
| Alpha Vantage | 25 req/day | 20 annual periods |
| Finnhub `financials-reported` | 60/min, no cap | a **SEC 10-K feed** -- 4 of 4 foreign private issuers return ZERO rows |
| **EDGAR `companyfacts`** | no key, no cap, 10 req/s | ONE call, every concept, every period |

ASML returns **zero** rows from Finnhub and **19-20 years on all ten core
fields** from EDGAR -- and files its 20-F in `us-gaap`, not IFRS, which I would
have guessed wrong. 50 of the 67 held names loaded in two batches; the 17 that
did not are ETFs, which file no 10-K.

**The SEC publishes TWO things called the EDGAR API and only one is this.** The
*Filer* API -- filer management, delegations, CCC codes, transmitting
submissions -- is Bearer-authenticated with tokens issued to a registrant and
carries no financial data at all. The structured-data side is `data.sec.gov`
and needs only a User-Agent with a contact address. Check which one a document
describes before designing against it.

**Four traps, each measured, each with a test that fails against the naive
implementation** (`src/lib/edgarFacts.js`, 17 tests, verified by reverting):

1. **`fy`/`fp` describe the FILING, not the fact.** A FY2025 10-K carries its
   FY2023 comparative stamped `fy:2025 fp:FY`. Keying on `fy` collapses every
   comparative onto the filing year: TGT read **17 years keyed on `fy` and 19
   keyed on the fact's own `end` date**.
2. **A flow needs an annual duration.** `Revenues` appears with quarterly and
   year-to-date spans in one filing; a balance-sheet instant has no `start`.
3. **The tag changes with the accounting era.** TGT's net income is three tags
   end to end -- `ProfitLoss` 2007-2011, `NetIncomeLossAvailableToCommon-`
   `StockholdersBasic` 2009-2021, `NetIncomeLoss` 2020-2025. Union 19 years;
   `NetIncomeLoss` alone 11. The LDTI/CECL shape EQ-4 found in banks, in a
   retailer. Every field is an ordered alias list and the winning concept is
   recorded.
4. **The three statements must share one period-end date.** The consumer view
   INNER JOINs them on `fiscal_date_ending`, so an income period ending
   2025-02-01 against a balance instant at 2025-02-02 drops the symbol
   **entirely** -- it would load clean and display nothing.

**The ticker map is actively wrong for a reorganised filer.**
`company_tickers.json` maps XOM to CIK 2115436: **94 concepts, zero annual
`Assets`.** The real history is CIK 34088 -- 438 concepts, 18 years.
`entityName` is "Exxon Mobil Corporation" on **both**, so the name corroborates
the wrong answer and the failure reads as "this company has no data". A CIK
yielding under three annual periods is REPORTED, never written as a one-year
history that reads as a successful load.

**`InterestExpense` stops at 2023 for AAPL and that is correct.** No alias
covers 2024-25 (`InterestExpenseDebt` ends 2021, `InterestCostsIncurred` 2023);
Apple folds it into "Other income/(expense), net". So `fcff` is NULL for those
years rather than fabricated. Absent is not zero, in a third place.

### Alpha Vantage rounds a 52/53-week period end to the month end (2026-09-24)

Found fixing the duplicate rows EDGAR created beside Alpha Vantage. The PK on
the three statement tables carries `source`, so a symbol held by two providers
yields two rows per fiscal year -- 129 of them across 8 symbols -- and a
surface reading "the latest row" gets whichever the planner returns.

**A first attempt keyed precedence on `fiscal_date_ending` and cleared only 79
of the 129.** ADBE is always `11-30` in Alpha Vantage against EDGAR's actual
`2025-11-28 / 2024-11-29 / 2023-12-01`; AMD always `12-31` against `12-27 /
12-28 / 12-30`; TGT always `01-31` against `2025-02-01 / 2024-02-03`. **The two
sources date the SAME fiscal year one to four days apart**, so no date-keyed
rule can pair them.

Precedence is therefore **per symbol**, which also keeps a series on ONE basis
-- half a history from each provider is the substitution forbidden everywhere
else here and would be invisible on screen. The **deepest complete** history
wins with EDGAR breaking ties: EDGAR is not deeper for every filer (GOOGL 14
periods against Alpha Vantage's 20) and dropping six years to honour a
provenance preference would pay real coverage for a tie-break. Completeness is
counted over the THREE-WAY JOIN, never the income statement alone -- EQ-2 found
SNDK with an income statement and no balance sheet, and a source that cannot
complete a period must not win one. 129 -> 3 duplicates, **0 mixed-source
symbols**, 5.9 ms symbol-filtered against a documented 8.4 ms.

**Where they overlap they mostly agree, and where they do not it is large.**
GOOGL, TGT and SNDK are bit-identical on every common year and ADBE differs by
rounding -- but **JPM diverges 38.7% on revenue and PFE 88.9% on net income**, a
bank's net-versus-gross revenue convention and restatement handling. Picking one
source is what stops two answers reaching one page; which is right is its own
question, and is NOT closed.

### No arithmetic rule names a filer's own fiscal year (2026-09-24)

Three JNJ rows survive as duplicates: it is a 52/53-week filer whose year ends
land on **2023-01-01 and 2023-12-31**, and the view derives `fiscal_year` as
`EXTRACT(year FROM fiscal_date_ending)`, so both read 2023.

**Two candidate fixes were measured and both are wrong.** The six-month shift
(`atlas_fiscal_aligned_year`'s convention) would re-label **210 rows** and call
MSFT's year ending 2025-06-30 "2024" when Microsoft calls it FY2025 -- it exists
to GROUP filers with different year ends, not to NAME a year. The narrower
Jan/Feb-to-prior-year rule matches Target, which calls the year ending Feb 2025
FY2024, and contradicts **NVIDIA, which calls the year ending Jan 2025 FY2025**.

**The filers themselves disagree, so no rule is universally right.** Re-basing
200+ published labels to fix 3 rows, on a convention that is itself wrong for
some filers, is a worse trade than carrying the defect. `fiscal_year` is a
derived grouping key and is not the filer's own label; the collision is real,
narrow and recorded rather than papered over.

**`vw_company_fundamentals` unfiltered is 1.52 s** and grows with the symbol
count -- the correlated precedence subquery is O(rows x sources). Every UI path
filters by symbol (5.9 ms), so nothing is at risk today. A seq scan over a
growing table is a clock, not a constant.


### The globe froze on a hover nobody was making (2026-09-24)

Reported as "hover over the rotating globe and it stops and freezes". Full audit
in `docs/GEO_SURFACE_REPORT.md` (follow-up section).

**globe.gl raycasts from the LAST pointer position on every render**, not only
on pointer moves. After the pointer leaves the canvas the globe keeps turning,
a new country slides under that stale point, and it is reported as hovered.
The first version turned `autoRotate` off on every hover report -- so the globe
stopped under a cursor that was nowhere near it, and no event ever restarted
it. A hover counts only while the pointer is inside; pointer interaction is
disabled on `pointerleave`.

**Never drive rotation straight from events.** Any missed "back on" (release
outside the canvas, a hover-null that never arrives) leaves it stopped for
good. `src/geo/renderers/rotationController.js` evaluates a predicate every
frame, is restored by default, and has watchdogs on a stale hover and a stale
press. Hover slows to a crawl rather than halting: a globe that stops dead
under the cursor is indistinguishable from a frozen one.

**`globe._destructor()` does not release the WebGL context.** After ~16
renderer switches Chromium drops the OLDEST context, which can be the one on
screen. Dispose the renderer and `forceContextLoss()` on unmount. MapLibre's
`remove()` already does this.

**A headless browser here cannot measure frame time** -- SwiftShader manages
two frames in 1.5 s with the globe idle. The globe publishes `data-rotation`
(`full | hover | held | settling | focus | off | reduced`) on change, and
interaction tests assert that, never pixels or frame gaps.

### Sync Status UI
- `src/components/SyncStatus.jsx` — React component for terminal header
- Shows live health indicator (green/yellow/red) with expandable detail panel
- Auto-refreshes every 5 minutes

### Streamlit
Retired. React terminal on Vercel is the single source of truth for all portfolio analytics.
Archive branch: `legacy/streamlit-archive`
Retirement script: `scripts/retire-streamlit.sh` (run after confirming full view parity)
