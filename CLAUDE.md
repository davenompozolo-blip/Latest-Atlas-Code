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

### Sync Status UI
- `src/components/SyncStatus.jsx` — React component for terminal header
- Shows live health indicator (green/yellow/red) with expandable detail panel
- Auto-refreshes every 5 minutes

### Streamlit
Retired. React terminal on Vercel is the single source of truth for all portfolio analytics.
Archive branch: `legacy/streamlit-archive`
Retirement script: `scripts/retire-streamlit.sh` (run after confirming full view parity)
