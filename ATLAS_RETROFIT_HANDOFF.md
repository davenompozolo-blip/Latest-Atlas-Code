# ATLAS Terminal — Builder's Report for Retrofit Handoff

**Date**: 6 April 2026
**Branch**: `claude/atlas-terminal-implementation-dFYbI`
**Repo**: `davenompozolo-blip/Latest-Atlas-Code`
**Author**: Claude (Supabase/Infrastructure session)
**Audience**: Claude (Retrofit session) + Hlobo (project owner)

---

## 1. Executive Summary

ATLAS Terminal is being retrofitted from a **27-page Streamlit reference app** (Python, `atlas_app.py`) into a **React SPA** deployed on **Vercel**, backed by **Supabase** (Postgres views + Edge Functions) and **Alpaca Markets** paper trading API.

**Current state**: The Supabase data layer is live and flowing. The React terminal (`public/index.html`) has 5 tabs, connects to Supabase views via the anon key, and displays real portfolio data from Alpaca. The infrastructure is production-ready for the retrofit — all the raw data (positions, transactions, prices, account balances) is in Supabase, and the SQL views compute analytics at query time.

**What the retrofit needs to do**: Take the 27 Streamlit pages and their calculation logic (`core/calculations.py` — 2,660 lines, 39 functions) and re-implement them as React components powered by the existing Supabase views, adding new views where needed.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  ALPACA MARKETS (paper trading)                      │
│  /v2/positions  /v2/account  /v2/activities          │
└────────────┬─────────────────────────────────────────┘
             │ every 5 min (cron)
             ▼
┌──────────────────────────────────────────────────────┐
│  SUPABASE EDGE FUNCTION: sync_alpaca_positions       │
│  - Writes positions (qty, avg_cost, market_value,    │
│    side) to public.positions                         │
│  - Writes account snapshot (equity, cash,            │
│    buying_power, long/short MV) to                   │
│    public.account_snapshots                          │
│  - Logs every run to public.sync_log                 │
└────────────┬─────────────────────────────────────────┘
             │ INSERT/UPSERT
             ▼
┌──────────────────────────────────────────────────────┐
│  SUPABASE POSTGRES                                   │
│                                                      │
│  Tables (raw data):                                  │
│    portfolios, positions, transactions, assets,      │
│    price_history, account_snapshots, broker_accounts,│
│    sync_log, organizations, org_members              │
│                                                      │
│  Views (computed at query time):                     │
│    vw_portfolio_home     — positions + P&L + weights │
│    vw_position_nav_daily — FIFO per-security ledger  │
│    vw_portfolio_nav_daily — portfolio NAV time series │
│    vw_command_centre     — Sharpe/Sortino/VaR/DD     │
│    vw_sync_status        — last sync health          │
└────────────┬─────────────────────────────────────────┘
             │ PostgREST (anon key)
             ▼
┌──────────────────────────────────────────────────────┐
│  VERCEL — React SPA                                  │
│  public/index.html       — 5-tab terminal (1,306 ln)│
│  public/command-centre/  — AI command centre         │
│  api/command-centre.js   — Anthropic API proxy       │
│  inject-env.js           — build-time key injection  │
└──────────────────────────────────────────────────────┘
```

---

## 3. What's Live in Supabase

### 3.1 Tables

| Table | Purpose | Row counts (approx) |
|-------|---------|---------------------|
| `portfolios` | Portfolio metadata | 1 |
| `positions` | Daily position snapshots (qty, avg_cost, market_value, side) | ~58/day |
| `transactions` | Buy/sell history from Alpaca activities | 146 |
| `assets` | Symbol registry (symbol, name, asset_class) | ~74 |
| `price_history` | Daily OHLCV (interval='1d') | 78,795 |
| `account_snapshots` | Alpaca account balances (equity, cash, margins) — append-only | Growing |
| `broker_accounts` | Links portfolios to Alpaca accounts | 1 |
| `sync_log` | Edge Function run history + observability | Growing |
| `organizations` | Org tenancy (future multi-tenant) | 1 |
| `org_members` | Org membership | Setup pending |

### 3.2 Views

| View | What it computes | Key columns |
|------|-----------------|-------------|
| `vw_portfolio_home` | Per-position P&L, weights, vol, Sharpe, side-aware returns, equity-based NAV | symbol, name, asset_class, side, quantity, cost_basis, current_price, market_value, unrealised_return_pct, portfolio_weight, annualised_vol, sharpe_approx, portfolio_nav, cash_balance, buying_power, long_market_value, short_market_value |
| `vw_position_nav_daily` | FIFO transaction replay → daily holdings × closing prices | portfolio_id, asset_id, symbol, asset_class, price_date, quantity, close_price, position_value |
| `vw_portfolio_nav_daily` | Aggregate NAV time series + daily returns | portfolio_id, price_date, nav, position_count, daily_return |
| `vw_command_centre` | Sharpe, Sortino, VaR (95%), max drawdown, leverage, equity-based NAV | portfolio_nav, position_count, total_invested, unrealised_pnl, sharpe_annualised, sortino_annualised, var_95_daily_return, var_95_daily_dollar, max_drawdown, cash_balance, buying_power, gross_leverage |
| `vw_sync_status` | Last sync health for the navbar pill | status, seconds_since, positions_seen, function_name |

### 3.3 Edge Function

**`sync_alpaca_positions`** (v3, deployed via Dashboard):
- Called every 5 min by Supabase cron
- Fetches `/v2/positions` + `/v2/account` in parallel
- Upserts positions with `side` ('long'/'short')
- Appends account_snapshots row (equity, cash, buying_power, long/short MV, raw JSON)
- Full sync_log instrumentation (open/close, error capture)
- JWT verification OFF (cron caller has no auth header)

### 3.4 RLS Policies

All tables have `<table>_read_anon` policies granting SELECT to `anon` and `authenticated`. Writes go through the Edge Function using `SUPABASE_DB_URL` (service role). This is intentional — the React client is read-only.

### 3.5 Migrations Applied (in order)

| Migration | Status | What it does |
|-----------|--------|--------------|
| `20260306211500_initial_portfolio_schema` | ✅ Applied | Core tables: portfolios, positions, transactions, assets, price_history |
| `20260307000000_price_history_market_data_columns` | ✅ Applied | Adds interval, source columns to price_history |
| `20260329000000_org_model` | ✅ Applied | organizations, org_members, portfolios.organization_id |
| `20260329000001_rls_policies` | ✅ Applied | Org-scoped RLS |
| `20260329000002_sync_jobs` | ✅ Applied | Sync job config table |
| `20260404000000_sync_log` | ✅ Applied | sync_log table, vw_sync_status |
| `20260405000000_alpaca_full_sync` | ✅ Applied | account_snapshots, portfolio_equity_curve, $CASH asset, extends sync_log |
| `20260405010000_drop_legacy_duplicate_tables` | ⚠️ NOT Applied | Drops legacy portfolio_positions + prices tables. Low priority cleanup. |
| `20260405020000_backfill_broker_account_link` | ✅ Applied | Creates broker_account, links portfolio |
| `20260405030000_nav_daily_granular` | ✅ Applied | First version of vw_position_nav_daily + rebuilt vw_portfolio_nav_daily |
| `20260405040000_nav_daily_fix_tx_type` | ✅ Applied | Fixes OrderSide.BUY/SELL → LIKE '%buy%'/'%sell%' |
| `20260405050000_anon_read_policies` | ✅ Applied | Anon SELECT policies on 6 core tables |
| `20260406000000_side_cash_leverage` | ✅ Applied | positions.side column, equity-based NAV, short-aware P&L, account_snapshots in views |

### 3.6 Legacy Views (from Streamlit era)

In `migrations/supabase_views.sql` there are 7 original views. The ones that matter have been superseded by the `supabase/migrations/` versions above:

- `vw_portfolio_home` → rebuilt in 20260406000000
- `vw_portfolio_nav_daily` → rebuilt in 20260405040000 + 20260406000000
- `vw_command_centre` → rebuilt in 20260406000000
- `vw_sync_status` → rebuilt in 20260405000000

Others from the original set (`vw_quant_signals`, `vw_risk_dashboard`, `vw_performance_attribution`, `vw_portfolio_deep_dive`) may still exist in the DB if the original `supabase_views.sql` was run, but they're not being used by the current React terminal. The retrofit may want to use or rebuild them.

---

## 4. What's Live in Vercel

### 4.1 File Structure

```
public/
  index.html              → React SPA (1,306 lines, 5 tabs)
  command-centre/
    index.html            → AI Command Centre (Anthropic-powered)
api/
  command-centre.js       → Anthropic API proxy (serverless function)
inject-env.js             → Build-time SUPABASE_ANON_KEY injection
vercel.json               → Routing, rewrites, headers
.vercelignore             → Excludes all Python/Streamlit files
```

### 4.2 React Terminal Tabs (public/index.html)

| Tab | Component | Data Source | Status |
|-----|-----------|-------------|--------|
| **PORTFOLIO** | `PortfolioHome` | `vw_portfolio_home` + `vw_command_centre` + `vw_portfolio_nav_daily` | ✅ Live data, positions table, donut chart, benchmark line chart |
| **QUANT** | `QuantDashboard` | `vw_quant_signals` | ⚠️ Shows EmptyState — view may not exist or may be empty |
| **RISK** | `RiskAnalysis` | `vw_command_centre` | ⚠️ Partially working — Sharpe/Sortino/VaR computed but tab may need view rebuild |
| **PERFORMANCE** | `PerformanceSuite` | `vw_portfolio_nav_daily` | ⚠️ Has NAV data but charts/attribution need work |
| **COMMAND** | `CommandCentre` | `vw_command_centre` | ⚠️ Shows metrics from command centre view |

### 4.3 Environment Variables

| Var | Location | Notes |
|-----|----------|-------|
| `ATLAS_SUPABASE_KEY` | Vercel Project env | Bypasses store-linked SUPABASE_ANON_KEY override. inject-env.js reads this first. |
| `SUPABASE_ANON_KEY` | Vercel Shared (store-linked) | Overridden by project — was causing 401s. Fixed by adding ATLAS_SUPABASE_KEY. |
| `SUPABASE_URL` | Vercel Shared | `https://vdmojjszvvcithuxwexx.supabase.co` |
| `Atlas_Claude_API` | Vercel Project | Anthropic key for Command Centre proxy |

### 4.4 Sync Status Pill

The navbar has a `SyncStatusPill` component that queries `vw_sync_status` every 60 seconds. Shows green/amber/red based on `seconds_since` the last successful sync. This is working and confirmed in production.

---

## 5. Streamlit Reference App (What to Retrofit From)

### 5.1 Pages (27 in `ui/pages/`)

| Page | File | Category | Retrofit Priority |
|------|------|----------|-------------------|
| Portfolio Home | `portfolio_home.py` | core | HIGH — already partially done |
| Risk Analysis | `risk_analysis.py` | analysis | HIGH |
| Performance Suite | `performance_suite.py` | analysis | HIGH |
| Quant Dashboard | `quant_dashboard.py` | analysis | HIGH |
| Portfolio Deep Dive | `portfolio_deep_dive.py` | analysis | HIGH |
| Multi-Factor Analysis | `multi_factor_analysis.py` | analysis | MEDIUM |
| Market Watch | `market_watch.py` | markets | MEDIUM |
| Market Regime | `market_regime.py` | markets | MEDIUM |
| Valuation House | `valuation_house.py` | valuation | MEDIUM |
| Monte Carlo Engine | `monte_carlo.py` | optimization | MEDIUM |
| Quant Optimizer | `quant_optimizer.py` | optimization | MEDIUM |
| SAA Tool | `saa_tool.py` | strategy | MEDIUM |
| Commentary Generator | `commentary_generator.py` | strategy | MEDIUM |
| Leverage Tracker | `leverage_tracker.py` | tracking | MEDIUM |
| Equity Research | `equity_research.py` | research | LOW |
| Macro Intelligence | `macro_intelligence.py` | research | LOW |
| Fund Research | `fund_research.py` | research | LOW |
| CFA Prep | `cfa_prep.py` | study | LOW |
| Investopedia Live | `investopedia_live.py` | tracking | LOW |
| Phoenix Parser | `phoenix_parser.py` | input | LOW |
| Database | `database.py` | system | LOW |
| R Analytics | `r_analytics.py` | system | LOW |
| About | `about.py` | system | LOW |
| Admin Panel | `admin_panel.py` | admin | LOW |
| Analytics Dashboard | `analytics_dashboard.py` | admin | LOW |

### 5.2 Calculation Engine (`core/calculations.py` — 2,660 lines)

Key function groups the retrofit will need:

**Portfolio Analytics**:
- `calculate_portfolio_returns()` — returns time series from trade data
- `calculate_brinson_attribution()` / `calculate_brinson_attribution_gics()` — Brinson-Fachler attribution
- `calculate_benchmark_returns()` — benchmark comparison
- `calculate_portfolio_correlations()` — correlation matrix
- `calculate_factor_exposures()` — factor model
- `calculate_performance_metrics()` — composite metrics
- `calculate_portfolio_from_trades()` — trade reconstruction

**Risk**:
- `calculate_sharpe_ratio()`, `calculate_sortino_ratio()`, `calculate_information_ratio()`
- `calculate_var()`, `calculate_cvar()` — Value at Risk / Conditional VaR
- `calculate_max_drawdown()`, `calculate_calmar_ratio()`
- `calculate_historical_stress_test()`
- `calculate_var_cvar_portfolio_optimization()` — full risk-budget optimizer

**Valuation**:
- `calculate_dcf_value()`, `calculate_wacc()`, `calculate_cost_of_equity()`
- `calculate_gordon_growth_ddm()`, `calculate_multistage_ddm()`
- `calculate_residual_income()`, `calculate_sotp_valuation()`
- `calculate_peer_multiples()`, `calculate_consensus_valuation()`

**Other**:
- `core/optimizers.py` — MVO, Black-Litterman
- `core/charts.py` — Plotly visualizations (dark theme)
- `core/fetchers.py` — yFinance, FRED, Alpha Vantage
- `core/constants.py` — Feature flags, config

### 5.3 Navigation & Routing

Streamlit uses `navigation/registry.py` (25 `PageEntry` objects), `navigation/router.py`, `navigation/sidebar.py`, and `navigation/page_handlers.py`. The React terminal currently has a simpler 5-tab structure with a sidebar — the retrofit will expand this.

---

## 6. Known Limitations & Concessions

### 6.1 Calculation Fine-Tuning Needed (Deferred)

These were identified but deferred to proceed with the retrofit:

1. **Options P&L direction**: The `side`-aware formula is deployed but may need fine-tuning for multi-leg option strategies (e.g., covered calls, spreads). Currently handles simple long/short correctly.

2. **NAV time series vs point-in-time**: `vw_portfolio_nav_daily` uses FIFO transaction replay × price_history. The account_snapshots.equity is point-in-time from Alpaca. These may diverge slightly due to:
   - Intraday price movements (positions sync at different time than price close)
   - Dividends/interest not yet flowing through transactions
   - Options that don't have daily close prices in price_history

3. **Transaction type normalization**: Alpaca wrote `OrderSide.BUY` / `OrderSide.SELL` as transaction_type (Python enum repr). The views handle this via `LIKE '%buy%'/'%sell%'`, but a one-shot UPDATE to normalize to plain `buy`/`sell` is still pending.

4. **Leverage calculation**: `gross_leverage = (long_mv + abs(short_mv)) / equity` is simplified. Doesn't account for notional exposure of options (delta-adjusted leverage).

5. **Only 146 transactions**: The `sync_alpaca_activities` Edge Function (which pages through full history) has not been deployed yet. Only the positions sync is live. Activities task code exists at `supabase/functions/_shared/alpaca_tasks/activities.ts` and is ready to inline + deploy.

6. **12 orphan equity rows**: Some assets have `asset_class = 'equity'` instead of `'us_equity'` from early syncs. Cosmetic, doesn't affect calculations.

7. **3 expired options**: From the 260320 series — they show in positions because they were in the last snapshot before expiry. `vw_portfolio_home` should filter `WHERE quantity <> 0` or `WHERE as_of_date = current_date`.

### 6.2 Infrastructure Concessions

1. **No Supabase CLI access**: All migrations were applied via Studio SQL Editor copy-paste. All Edge Function deployments via Dashboard paste. This works but is manual. The repo has the full migration trail for when CLI access is restored.

2. **Vercel env var store conflict**: `SUPABASE_ANON_KEY` was locked by a Vercel Connected Store and couldn't be edited. Workaround: `inject-env.js` reads `ATLAS_SUPABASE_KEY` first (user-editable Project var), falling back to the store-linked one.

3. **Single Edge Function**: All sync logic is in `sync_alpaca_positions`. The multi-function architecture (positions, activities, account, prices as separate tasks with an orchestrator) exists in `supabase/functions/_shared/` but hasn't been deployed. The single function covers the critical path.

4. **JWT verification OFF**: The Edge Function has JWT verification disabled because the Supabase cron caller doesn't send an Authorization header. This is standard for internal cron-triggered functions.

---

## 7. Data Flow Verification

All confirmed working in production as of 6 April 2026:

```
✅ Alpaca /v2/positions  →  positions table (58 positions, including 3 options, 1 short)
✅ Alpaca /v2/account    →  account_snapshots (equity=$95,774, cash=-$32,976)
✅ positions + assets     →  vw_portfolio_home (56 rows, side-aware P&L)
✅ transactions × prices  →  vw_position_nav_daily → vw_portfolio_nav_daily (61 trading days)
✅ nav returns            →  vw_command_centre (Sharpe=2.67, Sortino=8.32, VaR=-2.24%, DD=-9.54%)
✅ sync_log               →  vw_sync_status → SyncStatusPill (green, "SYNC 1s AGO")
✅ Vercel SPA             →  LIVE DATA badge, real positions rendering, benchmark chart
```

---

## 8. For the Retrofit Session

### What you have to work with:
- **Supabase views** that return JSON via PostgREST — query them with `sb.from('view_name').select('*')`
- **2,660 lines of Python calculations** in `core/calculations.py` as the reference implementation
- **27 Streamlit pages** in `ui/pages/` showing what each page should display
- **Chart theme**: dark background, Plotly in Streamlit → Chart.js in React (already used for donut + benchmark line)
- **CSS**: terminal aesthetic with `--bg: #080a14`, cyan/purple accent, JetBrains Mono for numbers, DM Sans for text, Syne for headings

### What you'll likely need to create:
- **New Supabase views** for pages that need data the current views don't provide (e.g., quant signals, factor exposures, attribution breakdown, correlation matrix)
- **More React components** — currently 5 tabs, target is ~15-20 meaningful pages
- **Client-side calculations** for anything too complex for SQL views (Monte Carlo, optimization, etc.) — these can run in the browser or via Vercel serverless functions
- **New Edge Functions** for data that needs external APIs (yFinance prices for non-Alpaca tickers, FRED macro data, Alpha Vantage fundamentals)

### The golden rule:
The terminal must always display **FIFO-reconstructed NAV** (from `vw_portfolio_nav_daily`) and **equity-based point-in-time NAV** (from `account_snapshots`) — never `sum(market_value)` as a proxy for NAV. The user was very explicit about this: the methodology must be defensible.

---

## 9. Quick Reference: How to Query Views from React

```javascript
// Already wired up in public/index.html
const { data, error } = await sb.from('vw_portfolio_home').select('*');
const { data, error } = await sb.from('vw_command_centre').select('*');
const { data, error } = await sb.from('vw_portfolio_nav_daily').select('*');
const { data, error } = await sb.from('vw_position_nav_daily').select('*');
const { data, error } = await sb.from('account_snapshots').select('*').order('as_of', { ascending: false }).limit(1);
```

---

*End of builder's report. The infrastructure is ready. Time to build the terminal.*
