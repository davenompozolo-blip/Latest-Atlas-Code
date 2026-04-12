# ATLAS Terminal — Retrofit Spec
**Session:** Phase 1 Retrofit — Streamlit → React  
**Repo:** `davenompozolo-blip/Latest-Atlas-Code`  
**Branch:** `claude/atlas-terminal-implementation-dFYbI`  
**Vercel:** `atlas-terminal.vercel.app`  
**Supabase:** `vdmojjszvvcithuxwexx.supabase.co`  
**Date:** 2026-04-06  

---

## 0. READ THIS FIRST

This document supersedes all previous handoff/course-correction docs for the purposes of the retrofit. For infrastructure context (Supabase tables, views, Edge Functions, migration history), refer to the Builder's Report (`ATLAS_RETROFIT_HANDOFF.md`) which was generated on 2026-04-06 — it is the authoritative source on what's live in Supabase.

**What this document governs:** Adding new pages/modules to the React terminal. Not fixing existing tabs (those are separately tracked).

---

## 1. Situation Summary

### What's working (do not break)
- `public/index.html` — React SPA, 5 tabs, **live Supabase data**, LIVE DATA badge confirmed
- `vw_portfolio_home`, `vw_portfolio_nav_daily`, `vw_command_centre`, `vw_sync_status` — all returning real data
- `SyncStatusPill` — Alpaca sync health, querying `vw_sync_status` every 60s
- Vercel deployment pipeline — `ATLAS_SUPABASE_KEY` injection via `inject-env.js`
- Supabase Edge Function `sync_alpaca_positions` — cron every 5 min, writing positions + account_snapshots

### What the retrofit adds
Five priority modules, migrated from the Streamlit codebase (`ui/pages/`) into the existing React terminal. The current 5-tab sidebar expands to accommodate new pages. The design language (dark terminal aesthetic, cyan/purple accent, Syne headings, JetBrains Mono for numbers) is preserved — the Streamlit code is the **feature reference**, not the design reference.

---

## 2. Design System (Non-Negotiable)

CC must read the existing `public/index.html` to extract the exact CSS variables and component patterns before writing a single new component. Do not invent new design tokens.

From the existing build, the established system is:
```css
--bg: #080a14
--panel: #0d1117  
--card: #111827
--border: rgba(255,255,255,0.06)
--teal / cyan accent: #00e5ff or equivalent (check exact value in file)
--purple accent: #a78bfa
--green: #34d399
--red: #f87171
--yellow: #fbbf24

font: Syne (headings/labels), JetBrains Mono (numbers/tickers), DM Sans (body)
```

Charts: Chart.js (already loaded via CDN in `public/index.html`). Use it for all new charts. Do not add new chart libraries.

Component pattern: Cards with subtle borders, stat boxes with label on top + large mono value below, tables with teal ticker links, color-coded badges for signals/regimes.

---

## 3. Sidebar Expansion

The current sidebar has 5 entries. The retrofit expands it to accommodate new modules. Proposed structure (CC may adjust based on what fits the existing sidebar code):

```
CORE
  ● Phoenix Parser        (existing — link or status only)
  ● Portfolio Home        (existing tab)
  ● Database              (existing — link or status only)

RESEARCH
  ● Equity Research       [NEW — Phase 1 Priority]
  ● Macro Intelligence    [NEW — Phase 1 Priority]
  ● Fund Research         [NEW — Phase 1 Priority]

MARKETS
  ● Market Watch          [NEW — Phase 1 Priority]
  ● Market Regime         [NEW — Phase 1 Priority]

ANALYSIS
  ● Performance Suite     (existing tab, move here)
  ● Quant Dashboard       (existing tab — upgrade, Phase 1 Priority)
  ● Portfolio Deep Dive   (existing tab — leave as-is for now)
  ● Multi-Factor Analysis (future phase)

SYSTEM
  ● Risk Analysis         (existing tab, move here)
  ● Command              (existing tab, move here)
```

CC should read the current sidebar code and extend it cleanly. Section headers (CORE, RESEARCH, MARKETS, ANALYSIS, SYSTEM) should be added as non-clickable labels between nav groups, styled with small caps and muted color.

---

## 4. Phase 1 Modules — Build Specs

### 4.1 How to approach each module

For every module:
1. Read the corresponding `ui/pages/[module].py` file in the Streamlit repo
2. Read `core/calculations.py` for the calculation functions used by that page
3. Read `core/fetchers.py` to understand what external APIs it calls (yFinance, FRED, Alpha Vantage)
4. Identify which Supabase views already cover the data needs
5. Identify what new views or Edge Functions are needed
6. Build the React component

**Data source priority:**
- Supabase views first — if a view already computes what's needed, use it
- If not, check if it can be expressed as a new SQL view (add to `supabase/migrations/`)
- If calculation is too complex for SQL (Monte Carlo, optimization), run it client-side in JS or via a Vercel serverless function
- External API calls (FRED, Alpha Vantage) must go through a Vercel serverless function (`/api/`) — never call external APIs directly from the browser (CORS + key exposure)

---

### MODULE A: Quant Dashboard (Upgrade Priority)

**Current state:** Tab exists, shows `EmptyState` because `vw_quant_signals` may not exist or is empty.

**Reference file:** `ui/pages/quant_dashboard.py`

**What the Streamlit version shows:**
- Top stat row: UPTREND (8), DOWNTREND (10), SIDEWAYS (38), OVERBOUGHT (1), OVERSOLD (8) counts
- Table: SYMBOL, PRICE, MA20, MA50, MA200, REGIME (badge), VOL REGIME (badge), Z-SCORE, SIGNAL (badge), MOMENTUM %
- Regimes: Uptrend (green), Downtrend (red), Sideways (amber), Overbought (red), Oversold (green)
- Vol Regimes: Expanding (amber), Compressing (blue), Stable (grey)
- Signal badges: Neutral, Buy, Sell, Overbought

**Data needs:** MA20/50/200 and Z-scores require price history. This data is in `price_history` table (78,795 rows of daily OHLCV).

**New view needed:** `vw_quant_dashboard` — compute MA20, MA50, MA200, Z-score, regime classification, vol regime, momentum for each position's asset.

---

### MODULE B: Equity Research Dashboard

**Reference file:** `ui/pages/equity_research.py`

**What the Streamlit version shows:**
- Search bar: ticker input + Analyse button
- Left panel: Company info, Price, Mkt Cap, 52W Range, Drawdown, Performance badges, Volatility, Analyst Consensus, Price History sparkline
- Right panel (5 tabs): Financial Analysis (sub-tabs: Income/Balance/Cashflow/Margins/Returns), Valuation Engine (Relative/Historical Bands/Reverse DCF), Risk View (Beta scatter, Factor exposures), Peer Comparison (peer table + EV/EBITDA chart), DCF Engine
- Right sidebar: Investment Thesis panel with Suggested KPIs

**Data sources:** Alpha Vantage API via Vercel serverless function. Price history from Supabase.

---

### MODULE C: Macro Intelligence

**Reference file:** `ui/pages/macro_intelligence.py`

**What the Streamlit version shows:**
- Macro Regime Classification (2x2 quadrant: Goldilocks/Reflation/Deflation/Stagflation with confidence %)
- Regime tabs: Inflation Trend, Growth Momentum, Liquidity Conditions, Financial Conditions
- Market Signals: Yield Curve, Credit Market, FX & Dollar, Commodity Complex
- Cross-Asset Returns Heatmap (1W/1M/3M/YTD)
- Factor Performance bar chart

**Data sources:** FRED API + Alpha Vantage via Vercel serverless functions.

---

### MODULE D: Fund Research

**Reference file:** `ui/pages/fund_research.py`

**What the Streamlit version shows:**
- Fund Identity panel, Rolling Returns table
- Tabs: Drawdown (underwater chart), Risk Metrics (Sharpe/Sortino/Calmar + rolling Sharpe chart), Holdings, Manager Skill (Alpha/Beta/Tracking Error + excess return waterfall), Up/Down Capture, Calendar Returns
- Allocator Decision Engine sidebar: Diversification Benefit, Marginal Portfolio Improvement, Redundancy Score, Aggregate Verdict (PASS/FAIL/WATCH)

**Data sources:** Alpha Vantage via Vercel serverless function.

---

### MODULE E: Market Watch

**Reference file:** `ui/pages/market_watch.py`

**What Streamlit shows:** Watchlist, portfolio movers, earnings calendar.

---

## 5. Step 0 — Portfolio Home Holdings Table Retrofit (HIGHEST PRIORITY)

The current Portfolio Home holdings table must be fixed before new modules. Gaps vs Streamlit:

**Current state issues:**
- Asset names not displaying (showing raw symbol in NAME column)
- Missing columns: DAILY CHANGE %, 5D RETURN %, WEIGHT % OF EQUITY, WEIGHT % OF GROSS, QUALITY SCORE
- No "Manage Columns" feature
- No P&L waterfall chart by sector
- No Top 10 P&L Contributors & Detractors chart
- No earnings calendar

**Target columns:**
```
DISPLAY TICKER | ASSET NAME | SHARES | CURRENT PRICE | TOTAL VALUE 
| DAILY CHANGE % | 5D RETURN % | WEIGHT % OF EQUITY | WEIGHT % OF GROSS 
| TOTAL GAIN/LOSS $ | TOTAL GAIN/LOSS % | QUALITY SCORE
```

---

## 6. Known Issues (from screenshots)

| Tab | Issue |
|-----|-------|
| Portfolio | NAME column shows raw symbol, not company name |
| Portfolio | Cash shows $0.00 (should show -$32,976 from account_snapshots) |
| Quant | Working but needs regime summary cards |
| Risk | Sharpe/Sortino/MaxDD/VaR all showing dashes |
| Performance | Entry dates show 06/04/2026 for most positions, CAGR shows — |
| Performance | Expired options showing 142,561% CAGR |
| Command | Health Score = 0, Sharpe/Sortino/VaR all dashes |
| Streamlit | vw_command_centre ValueError: invalid error value (olive warning banners) |

---

## 7. Golden Rules

1. **NAV = equity from account_snapshots or FIFO from vw_portfolio_nav_daily. Never sum(market_value).**
2. **No client-side external API calls.** All external data through `/api/` serverless functions.
3. **Read-only client.** React terminal only reads via anon key.
4. **Preserve existing tabs.** Do not break working functionality.
5. **Chart.js only.** No new chart libraries.
6. **Design language is fixed.** Dark terminal aesthetic, existing CSS variables.
