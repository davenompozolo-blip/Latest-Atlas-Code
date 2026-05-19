# ATLAS Terminal — Feature Specification
**Version:** 10.0 · React/Vite on Vercel  
**Date:** 2026-05-19  
**Purpose:** This document gives a browser-based Claude instance full context on every ATLAS feature — its purpose, where it lives, what it's supposed to do, and why. Use it to (a) test features systematically, (b) identify bugs, and (c) suggest small, targeted improvements that fit the platform's institutional character.

---

## Platform Overview

ATLAS Terminal is a personal institutional-grade portfolio analytics platform. Think of it as a Bloomberg Terminal for a private investor who runs a concentrated equity portfolio. The aesthetic is dark, monospace, data-dense — no charts for charts' sake. Every feature exists to support a specific investment decision.

**Stack:**
- React (createElement, no JSX) + Vite, deployed on Vercel
- Supabase (PostgreSQL + Edge Functions) for live portfolio data
- External APIs: Alpha Vantage, Finnhub, FRED, Alpaca (brokerage)
- Lightweight-charts v5 (equity curves, advanced charting)
- Chart.js (bar/donut/distribution charts)
- Zustand for global state (no localStorage/sessionStorage)

**Data flow:**
1. Alpaca brokerage → GitHub Actions sync (4:30 PM ET weekdays + 8 AM pre-market) → Supabase
2. Supabase views (`vw_*`) aggregated and served to React pages
3. External market data fetched on-demand via Vercel API routes (`/api/*`)
4. Claude AI analysis via Edge Function (`claude_sql_assistant`) and direct API routes (`/api/claude-analyse`, `/api/claude-sector`)

**Navigation:** Left sidebar with 15 modules grouped into CORE / ANALYSIS / SYSTEM / RESEARCH / MARKETS / VALUATION / CONSTRUCT.

---

## Security & Conventions (Do Not Violate)

- `VITE_ANTHROPIC_API_KEY` used for Claude API calls — never hardcoded
- No `localStorage` or `sessionStorage` — all state in Zustand or React state
- All `assetClass` values must be `UPPER_CASE`: `EQUITY`, `FIXED_INCOME`, `ALTERNATIVE`, `CASH`
- No new npm packages without confirmation
- React.createElement pattern throughout — no JSX

---

## Module Reference

---

### 1. PORTFOLIO (`portfolio-home.js`)
**Nav label:** PORTFOLIO · "Positions & NAV"  
**Purpose:** The daily check-in screen. Answers "where am I right now?" — current NAV, P&L, individual positions, what moved today.

**What it renders:**
- **KPI hero bar** — Net Equity (total NAV), unrealised P&L (£ and %), today's P&L with colour coding (green/red)
- **Today's Movers** — top gainers and losers from the live portfolio (sorted by `daily_change_pct`)
- **Earnings Calendar** — upcoming earnings dates, ex-dividend dates, analyst price targets for held positions
- **Performance Snapshot** — mini gauge/dial cluster: best performer, worst performer, portfolio distribution
- **Positions Table** — full holdings with: symbol, name, sector, asset type badge, market value, unrealised return %, daily change %, weight %, a tiny sparkline, and a **Quick Trade** button
  - Column manager: user can show/hide columns
  - Filters: All / Top 10 / Gainers / Losers / Large Cap / Sectors (dropdown)
  - Sort on any column header
- **Quick Trade Panel** — slide-in overlay triggered from any row. Lets user submit a buy/sell order (shares, dollar amount, or % position) via Alpaca API. Supports market, limit, stop orders.
- **Portfolio Intelligence strip** — `NarrativeStrip` at the top of the page with AI-generated one-line insights from `vw_portfolio_intel` (concentration risk, sector drift, best performer, etc.)

**Data sources:** `vw_portfolio_home` (positions), `vw_portfolio_nav_daily` (NAV history for top-bar sparkline), `vw_calendar_events` (earnings/dividends), `/api/trading?action=account` (Alpaca account)

**Value:** Replaces manually checking the brokerage app. Everything relevant to the day's trading in one screen.

**Known state:** Working. Quick Trade connects to real Alpaca paper/live accounts.

---

### 2. TRADING (`trading.js` + `pages-other.js`)
**Nav label:** TRADING · "Order Desk & Research"  
**Purpose:** Pre-trade analysis and order execution. Answers "should I trade this, and at what price?"

**What it renders:**
- **Symbol search** — typeahead search with Finnhub suggestions
- **Price Hero** — current price, day change, 52-week range bar
- **Quote Strip** — bid/ask, volume, market cap, P/E, EPS
- **Candlestick chart** (Lightweight-charts) — OHLCV bars with timeframe selector (1D/1W/1M/3M/6M/1Y)
- **Order Ticket** — buy/sell with shares, notional $, or % of portfolio; market/limit/stop; confirmation step before submission
- **Account Badge** — shows buying power, portfolio value, cash

**Data sources:** `/api/trading?action=quote`, `/api/trading?action=bars`, Alpaca account endpoint

**Value:** Research and execute without leaving the terminal.

**Known state:** Working. Order submission goes to real Alpaca.

---

### 3. QUANT (`quant-dashboard.js` + panels)
**Nav label:** QUANT · "Quantitative Signals"  
**Purpose:** Quantitative analysis of the portfolio. Answers "what are the statistical properties of my portfolio and how is it behaving?"

**Sub-tabs:**
1. **SIGNALS** (`quant-signals.js`) — Regime breakdown. Shows current market regime (bull/bear/neutral) derived from macro signals. Per-position signals: RSI, momentum, trend strength, regime classification. Colour-coded badges.
2. **ROLLING** (`quant-rolling.js`) — Rolling period analysis. Rolling Sharpe, rolling volatility, rolling beta vs benchmark. Shows how risk/return profile changes over time.
3. **CORRELATION** (`quant-correlation.js`) — Pairwise ρ matrix for all held positions. Heatmap with colour scale. High-correlation pairs flagged (ρ ≥ 0.8). Correlation count shown in tab badge.
4. **DRAWDOWN** (`quant-drawdown.js`) — Drawdown recovery map. Shows underwater periods: depth, duration, recovery time. Per-position and portfolio-level.

**Header:**
- KPI cards: number of positions, active signals, high-corr pairs, avg correlation
- **NarrativeStrip** — AI-generated quant insights (wrapped in card with cyan accent)

**Data sources:** `vw_quant_signals`, `vw_rolling_performance`, `vw_correlation_matrix`, `vw_drawdown_analysis`

**Value:** Replaces running Python notebooks for risk signal analysis.

**Innovation opportunities:**
- Rolling correlation (not just snapshot)
- Signal strength history chart
- Export correlation matrix to CSV

---

### 4. RISK (`pages-other.js` → `RiskAnalysis`)
**Nav label:** RISK · "Metrics & Drawdown"  
**Purpose:** Portfolio-level risk quantification. Answers "what is my actual downside exposure?"

**Sub-tabs:**
1. **BREAKDOWN** — Position-level risk cards. Each position: ticker, sector, tier badge (High/Moderate/Low), dollar VaR 95%, weight, annualised vol. Scatter plot: vol vs weight. Donut: risk tier distribution. VaR contribution bar chart (top contributors).
2. **CORE RISK** — Portfolio-level stats: VaR 95% (historical, parametric, Cornish-Fisher), CVaR 95%, daily vol, annual vol, Sharpe, Sortino, Calmar, Omega, max drawdown, skewness, kurtosis, tail ratio. Rolling 30-day VaR chart. Return distribution histogram.
3. **MONTE CARLO** — GBM simulation. User controls: scenarios (100–5000), horizon (30–365 days), drift adjustment. Fan chart of simulated equity paths. Terminal NAV distribution histogram. Summary stats: median terminal NAV, P(loss), expected shortfall.

**Data sources:** `vw_risk_metrics` (position-level), `vw_portfolio_nav_daily` (for GBM), `vw_command_centre` (portfolio-level stats)

**Value:** Institutional risk measurement without a dedicated risk system.

**Known state:** VaR computation runs client-side in `computeVaRStats()` from NAV history. Working.

---

### 5. PERFORMANCE (`performance-suite.js` + panels)
**Nav label:** PERFORMANCE · "Returns & Attribution"  
**Purpose:** Return analysis. Answers "how well did I do, why, and what drove it?"

**KPI pulse bar** (always visible at top):
- Total Return, Annualised Return, Sharpe Ratio, Max Drawdown, Current Drawdown, Volatility — all colour-coded with semantic thresholds

**Sub-tabs:**
1. **OVERVIEW** (`perf-panels-top.js → OverviewPanel`) — Equity curve (Lightweight-charts area chart). Features:
   - **Position entry markers toggle** — ON/OFF toggle. When ON, shows trade entry/exit markers on the chart. Filter: All / Notable (≥0.5% NAV) / First Entry per symbol
   - **Entry Decision Strip** — 5-stat bar below chart: entries shown, hit rate, avg return since entry, top win, top loss
   - NAV in £, benchmark comparison if available

2. **RETURNS** (`perf-panels-top.js → ReturnsPanel`) — Period return analysis. Return table: 1D, 1W, 1M, 3M, 6M, YTD, 1Y. Calendar heatmap of daily returns. Best/worst month.

3. **RISK** (`perf-panels-bottom.js → RiskPanel`) — Performance risk context. Drawdown chart, underwater periods. Current drawdown depth, duration.

4. **POSITIONS** (`perf-panels-bottom.js → PositionsPanel`) — Attribution. Per-position contribution to total return. Table: ticker, weight, return, contribution (% of total return). Sorted by contribution. Attribution bar chart.

5. **CHARTS** (`advanced-chart.js`) — Advanced charting with more indicators.

**Data sources:** `vw_portfolio_nav_daily`, `vw_performance_attribution`, `vw_command_centre`, `vw_transactions` (for entry markers)

**Value:** Know exactly what drove returns and whether trading decisions added value.

**Entry markers feature (new):** Markers show on the equity curve at transaction dates. Snapped to nearest NAV session. Green triangles = buys, red triangles = sells. Decision strip shows P&L context for each trade.

---

### 6. COMMAND (`command-centre.js` → `CommandCentre`)
**Nav label:** COMMAND · "System Overview"  
**Purpose:** Master dashboard. One-screen health check of the portfolio, data pipeline, and system status.

**What it shows:**
- Portfolio metrics snapshot (NAV, returns, risk stats)
- Sync health panel — last sync time, positions upserted, validation pass/fail
- Validation log — recent checks (NAV reconciliation, position count, snapshot continuity, data freshness)
- System alerts — any bugs or warnings from `atlas_memory`

**Data sources:** `vw_command_centre`, `atlas_sync_status`, `atlas_validation_log`, `atlas_sync_log`

**Value:** Single-pane-of-glass health view before trading decisions.

---

### 7. EQUITY (`equity-research.js` + sub-modules)
**Nav label:** EQUITY · "Ticker Research"  
**Purpose:** Deep dive on any individual stock. Answers "should I buy/hold/sell THIS company?"

**Entry:** Symbol search bar (typeahead via `/api/screener-market?q=`)

**Left panel — Company Hero:**
- Company name, exchange, sector, currency
- Price with day change
- 52-week range bar
- Consensus analyst rating bar (Strong Buy → Strong Sell)
- Key metric tiles: Market Cap, P/E, EPS, Revenue, Dividend Yield

**Right panel — Analysis tabs:**
1. **FINANCIALS** (`equity-financials.js`) — Income statement, balance sheet, cash flow (annual/quarterly toggle). Revenue/earnings charts. Profitability ratios grid.
2. **VALUATION** (`equity-valuation.js`) — Multiples-based valuation. P/E, P/B, EV/EBITDA vs sector peers. Fair value estimate from multiples. Upside/downside from current price.
3. **RISK** (`equity-risk.js`) — Individual stock risk: beta, volatility percentile, correlation to portfolio, VaR contribution, position sizing suggestion.
4. **PEERS** (`equity-peers.js`) — Peer comparison table. Same-sector companies by market cap. Comparative P/E, growth, margins.
5. **DCF** (`dcf-engine.js`) — Quick DCF. Inputs: revenue growth, margins, discount rate, terminal multiple. Output: intrinsic value, upside %, sensitivity table.

**Data sources:** `/api/equity?endpoint=overview` (Finnhub/Alpha Vantage), `/api/equity?endpoint=financials`, `/api/equity?endpoint=peers`

**Value:** No need for external research tools for initial screening and diligence.

---

### 8. MACRO (`macro-dashboard.js` + panels)
**Nav label:** MACRO · "Economic Intelligence"  
**Purpose:** Top-down macro context for investment decisions. Answers "what is the economic backdrop?"

**Sub-tabs:**
1. **REGIME** (`macro-regime.js`) — Current market regime classification. Factors: yield curve shape, credit spreads, VIX level, economic momentum. Outputs: regime label (Risk-On / Risk-Off / Transition), confidence score, implication for portfolio positioning.
2. **YIELDS** (`macro-yields.js`) — US Treasury yield curve (2Y, 5Y, 10Y, 30Y). Curve shape, inversion signal. Historical comparison. Key spread: 2s10s.
3. **INDICATORS** (`macro-indicators.js`) — Key economic indicators: CPI, PPI, NFP, PMI, retail sales, GDP. From FRED. Latest reading vs prior, trend direction.
4. **MARKETS** (`macro-markets.js`) — Global asset dashboard: US equities, international equities, commodities, FX, crypto. Price tiles with day change heat-coding.

**Data source:** `/api/macro` (proxies FRED, Alpha Vantage macro endpoints)

**Value:** Macro-aware investing without switching to a separate data terminal.

---

### 9. FUNDS (`funds-dashboard.js` + sub-modules)
**Nav label:** FUNDS · "Fund & ETF Research"  
**Purpose:** ETF and mutual fund research. Useful for screening sector exposure, comparing vehicles, or benchmarking the portfolio.

**Entry:** Symbol search

**Left panel:** Fund name, AUM, expense ratio, category, benchmark

**Right panel tabs:**
1. **PROFILE** (`funds-profile.js`) — Holdings breakdown (top 10), sector allocation, geographic exposure, style box (growth/value, small/large cap).
2. **PERFORMANCE** (`funds-performance.js`) — Return history vs benchmark. Tracking error, alpha, beta vs index.
3. **COMPARISON** (`funds-comparison.js`) — Side-by-side vs another fund or ETF. Return chart overlay, risk stats table.

**Data sources:** `/api/funds?endpoint=overview`, `/api/funds?endpoint=holdings`, `/api/funds?endpoint=performance`

**Value:** Quick assessment of whether to use a fund vs individual equities for a sector.

---

### 10. MARKETS (`market-watch.js`)
**Nav label:** MARKETS · "Global Market Watch"  
**Purpose:** Live market overview. Quick pre-market or intraday glance at global conditions.

**Panels:**
- **Overview** — Asset class tiles: US indices (SPY, QQQ, DIA), international (EWJ, EEM, VGK), bonds (TLT, AGG, HYG), commodities (GLD, SLV, USO), FX (DXY, EUR/USD). Each tile: price, day change, colour-coded heat.
- Macro narrative strip: yield curve interpretation, credit spread status, implied volatility reading
- **Sectors** — S&P 500 sector performance bar chart. Breadth: up vs down count. Per-sector bars coloured by performance.
- **News** — Market news feed

**Also reuses:** `RegimePanel` and `MarketsPanel` from macro module

**Data sources:** `/api/macro?endpoint=market` (batch quotes)

**Value:** 30-second market context before any trading decision.

---

### 11. OPTIONS (`options-analysis.js` + sub-modules)
**Nav label:** OPTIONS · "Derivatives Analysis"  
**Purpose:** Options research and strategy analysis for hedging or income generation.

**Shared components:**
- Symbol search with options-aware typeahead
- Contract picker: expiry selector, call/put toggle, strike selector (populated from live chain)
- Greeks Card: Delta, Gamma, Theta, Vega, Rho with colour coding

**Sub-modules:**
1. **ANALYSIS** (`options-analysis.js`) — Full options chain table for selected expiry. Strike, bid/ask, OI, volume, IV, Greeks. Calls and puts side by side.
2. **IV** (`options-iv.js`) — Implied volatility surface and term structure. IV vs historical vol comparison. IV percentile / rank.
3. **PAYOFF** (`options-payoff.js`) — P&L diagram for a single contract at expiry. Break-even lines. Max gain/loss labels.
4. **STRATEGY** (`options-strategy.js`) — Multi-leg strategy builder. Add legs (calls/puts/stock). Combined payoff diagram. P&L at various price points.

**Data sources:** `/api/trading?action=options_chain`, Alpha Vantage options endpoints

**Value:** Options analysis in the same terminal as the portfolio, useful for covered calls on existing positions or protective puts.

---

### 12. VALUATION (`valuation-hub.js` + `valuation-screener.js` + `valuation-house.js` + DCF modules)
**Nav label:** VALUATION · "Equity Valuation Suite"  
**Purpose:** Comprehensive equity valuation. The most technically deep section of the terminal.

**Entry point (`valuation-hub.js`):** Routes between Screener and House views.

#### 12a. Valuation Screener (`valuation-screener.js`)
**Purpose:** Universe-level valuation screening. Quickly identify cheap vs expensive stocks.

**Two modes:**
- **Portfolio mode** — reads from `vw_screener` (Supabase view, enriched from positions). Shows only held stocks.
- **Market mode** — fetches broad market data from `/api/screener-market`. ~500+ stocks.

**Table columns:** Symbol, Name, Sector, Style tags (value/growth/blend/income), Price, 52W Range Bar, RSI bar, P/E, EV/EBITDA, Revenue Growth, Gross Margin, Regime badge

**Style bucket filter strip** — filter by: Value / Growth / Momentum / Income / Quality / Blend. Shows count per bucket.

**Sort:** click any column header to sort asc/desc

**Per-row:** click → navigates to full equity research for that ticker

**Enrichment:** auto-fetches Alpha Vantage overview in the background to populate P/E and other fundamentals (progressive, with progress indicator)

**Value:** Replaces a Bloomberg screener for initial idea generation.

#### 12b. Valuation House (`valuation-house.js`)
**Purpose:** Multi-model valuation workbench for a single stock. Like having a sell-side model open.

**Models (sub-tabs):**
1. **DDM** (`equity-dcf-ddm.js`) — Dividend Discount Model (Gordon Growth). Inputs: current dividend, growth rate, cost of equity. Output: intrinsic value, upside %. Works for dividend payers.
2. **FCFF** (`equity-dcf-fcff.js`) — Free Cash Flow to Firm. Inputs: FCFF, WACC, terminal growth. Output: enterprise value, equity value per share.
3. **Multi-stage** (`equity-dcf-multistage.js`) — Three-stage DCF. Stage 1 (high growth), Stage 2 (transition), Stage 3 (terminal). Full year-by-year model with sensitivity table.
4. **RI** (`equity-dcf-ri.js`) — Residual Income model. Based on book value + excess returns. Good for banks/financials.
5. **Simulation** (`equity-dcf-sim.js`) — Monte Carlo on DCF inputs. Random samples from input distributions (growth rates, margins, WACC). Output: valuation distribution, percentile outcomes.

**ScrapbookSaveBar** — after completing any valuation, a save bar appears at the bottom: ticker, method used, implied price, conviction rating. Saves to Scrapbook via Supabase.

**Value:** Full sell-side modelling capability without Excel.

---

### 13. SQL Terminal (`sql-terminal.js`)
**Nav label:** SQL · "Query Terminal"  
**Purpose:** Direct database access with an AI assistant. Power-user tool for ad-hoc analysis.

**Layout (three-column):**
- **Left: Schema sidebar** — expandable table list, shows all `public` tables and views with column names and types. Click a column name to insert it into the editor.
- **Centre: SQL editor** — syntax-highlighted editor with line numbers. Ctrl+Enter to run. Tab for indent.
- **Right: AI Panel** (`AiPanel`) — Atlas AI assistant (Claude claude-sonnet-4-6 via Edge Function `claude_sql_assistant`). Chat interface. Understands the full schema. Can:
  - Write SQL queries from natural language ("show me my top 10 positions by P&L")
  - Explain query results
  - Suggest schema improvements
  - Switch modes: SQL mode (writes queries) vs Analyst mode (interprets data)

**Bottom tabs:**
- **Results** — paginated table with column sort. Download as CSV.
- **Saved** — user-saved queries (title, SQL, last run). Load → populate editor.
- **History** — recent query history with run time and row count.
- **Insights** — auto-generated insights from materialised tables (if any).

**AI connection:** Calls Supabase Edge Function `claude_sql_assistant` (deployed, v3). Uses `ANTHROPIC_API_KEY` secret in Supabase vault. 90-second timeout with AbortController. max_tokens: 4096.

**Value:** No need for Supabase Studio or a separate DB tool. AI-assisted analysis of raw portfolio data.

**Known state:** Fixed (May 2026) — edge function was hanging on slow Claude responses and timing out with an unhelpful error. Now surfaces proper error messages.

---

### 14. SCRAPBOOK (`scrapbook.js`)
**Nav label:** SCRAPBOOK · "Research & Thesis Notes"  
**Purpose:** Investment research journal. Capture, organise, and review investment theses with AI-generated analysis.

**Two views:**

#### All Companies (`ScrapbookLog` + `ScrapbookProfile`)
- **Log view** — grid of saved companies. Per card: ticker, company name, sector, conviction badge (Strong/Moderate/Weak), upside pill (% upside to implied price), valuation method badge, last updated.
- Click a card → opens **Profile view** for that company:
  - Full thesis notes
  - Valuation summary (method, implied price, inputs)
  - **AI analyst note** — Claude-generated analysis covering: business quality, competitive moat, key risks, catalysts, valuation assessment, sector context, final conviction (Strong/Moderate/Weak), key monitoring metrics, and a buy/hold/sell recommendation. Generates on-demand via `/api/claude-analyse`.
  - Price vs implied upside indicator
  - Edit/update functionality

#### Sector Playbook (`SectorPlaybook`)
- Groups all researched companies by sector
- Per sector card: sector name, company count, avg conviction, conviction distribution bar (`ConvBar`)
- Expand a sector → **SectorExpandedPanel**: all companies in sector, a sector-level AI analysis card (via `/api/claude-sector`). The sector AI note covers: macro tailwinds/headwinds, sector dynamics, relative positioning of your holdings.
- Navigate from sector → individual company profile

**AI routes:**
- `/api/claude-analyse.js` — individual company analysis (max_tokens: 8192)
- `/api/claude-sector.js` — sector-level analysis (max_tokens: 8192)

**Data sources:** `scrapbook_entries` (Supabase table), `scrapbook_sector_notes` (cached sector analysis)

**Value:** Replaces maintaining a separate research journal. AI layer turns raw notes into structured analysis.

**Known state (May 2026):** Individual company notes were truncating mid-JSON at 4096 tokens. Fixed by raising to 8192. Sector notes were already working.

---

### 15. PCM — Portfolio Construction Manager (`pcm.js` + `pcm-optimizer.js`)
**Nav label:** PCM · "Portfolio Construction"  
**Purpose:** The most sophisticated module. A structured framework for constructing and rebalancing the portfolio according to an Investment Policy Statement. Operates in 7 sequential layers.

**Layer tab bar** — L1 through L7, with status indicator per layer (complete / incomplete / locked). Layers unlock sequentially.

#### L1 — IPS Builder
**Purpose:** Capture the Investment Policy Statement — the rules that govern all portfolio decisions.  
**Fields:** Risk tolerance (Conservative/Moderate/Aggressive/Very Aggressive), Time horizon, Return objective (%), Liquidity needs, Tax considerations, ESG preferences, Rebalancing frequency, Max drawdown tolerance, Max position size, Max sector concentration  
**Output:** Saves to Supabase; seeds λ (risk aversion) parameter for optimizer. Unlocks L2.

#### L2 — SAA/TAA Engine
**Purpose:** Strategic and Tactical Asset Allocation.  
**Shows:** Current allocation vs IPS target per asset class. Gap visualisation (horizontal bars): Current % | SAA Target % | TAA Tilt %. Asset classes: EQUITY, FIXED_INCOME, ALTERNATIVE, CASH.  
**Value:** Know where you're drifting from the strategic target.

#### L3 — Factor Exposure
**Purpose:** Factor analysis and active share.  
**Shows:** Factor grid with tilt scores for Value, Growth, Momentum, Quality, Size, Low Vol, International. Active Share vs benchmark.  
**Data:** `vw_factor_exposure`

#### L4 — Risk Budget Console
**Purpose:** Marginal risk contribution per position.  
**Table columns:** Ticker, Name, Sector, Weight %, Vol 90d, MRC (Marginal Risk Contribution in £), % Risk (share of total portfolio risk), Risk Bar (visual width indicator).  
**Computed client-side** via `computeRiskRows()` function (not from Supabase view) to avoid duplicate rows.  
**Formula:** `%Risk_i = (w_i × σ_i) / Σ(w_j × σ_j)`  
**Value:** Know which positions are actually driving portfolio risk, not just NAV weight.

#### L5 — Portfolio Optimizer
**Purpose:** Compute optimal weights given current holdings, macro signals, and IPS constraints.

**Optimizer modes:**
- **MVO** — Mean-Variance Optimization (classic Markowitz)
- **ERC** — Equal Risk Contribution (risk parity)
- **Minimum Variance** — minimise portfolio vol
- **Maximum Sharpe** — maximise risk-adjusted return
- **ATLAS Adaptive** — proprietary anchored entropy-regularized Sharpe optimizer

**ATLAS Adaptive formula:**  
`max Sharpe(w) − λ‖w−w₀‖² + γH(w) − η·ΣₛWₛ²`  
where `w₀` = current weights (anchor), `H(w)` = entropy (diversification incentive), `Wₛ²` = sector concentration penalty, `λ/γ/η` = user-tunable parameters.

**Universe control (`PositionSelector`):**  
Collapsible table of all positions with include/exclude checkboxes. Shows: ticker, name, sector, current weight, data history badge (X days or NO DATA). Select All / None buttons.

**Parameter sliders (`AtlasSliders`):** Only shown in ATLAS Adaptive mode.  
- λ (Anchor strength): 0.01–0.15 — how tightly the optimizer clings to current weights
- γ (Entropy weight): 0.005–0.05 — diversification pressure
- η (Sector penalty): 0.05–0.40 — sector concentration penalty  
Each slider shows auto-derived IPS value as reference.

**Output table:** Ticker, Name, Sector, Current %, Optimal %, Δ Weight, Action (BUY/SELL/HOLD badge)

**Macro context card (`MacroContextCard`):** Shows how current regime influenced the optimisation — sector tilts applied, regime overlay, top/bottom aligned positions.

#### L6 — Rebalancing Engine
**Purpose:** Convert optimiser output into executable trades.  
**Trade list table (`TradeList`):** Ticker, side, shares, notional £, current vs target weight, execute button.  
**Direct execution** — clicking Execute sends order to Alpaca via `/api/trading?action=order`

#### L7 — Construction Report
**Purpose:** AI-synthesised narrative of the entire PCM workflow.  
**Generates:** Comprehensive construction report covering IPS alignment, allocation gaps, factor tilts, risk budget findings, optimizer recommendation, rebalancing trades. Uses `/api/claude-analyse` with full PCM context. max_tokens: 8192.

**Data sources:** `vw_pcm_risk`, `vw_pcm_factor`, `vw_pcm_allocation`, `vw_portfolio_home` (positions), `vw_portfolio_hist_by_symbol` (price history for optimizer)

**Value:** The most decision-useful module in the terminal. Replaces a portfolio construction consultant.

---

## Shared Components

### Top Bar (always visible)
- **ATLAS** branding (top-left)
- **Net Equity** — current NAV in £ with total P&L and P&L %
- **NAV sparkline** — 60-day equity curve (Canvas element, 120×32px)
- **Demo Mode Banner** (`ConfigPrompt`) — shown when `VITE_SUPABASE_ANON_KEY` not set; dismissable
- **SYNC pill** (`SyncStatusPill`) — last sync time (green/yellow/red). Polls Supabase `vw_sync_status` every 60s. Fires `atlas:refresh` event when a new sync lands.
- **REFRESH button** (`RefreshButton`) — manual data refresh, triggers `atlas:refresh` event

### NarrativeStrip
Appears at the top of: Portfolio Home, Quant Dashboard, and wherever `NarrativeStrip` component is used.  
**Appearance:** Card with cyan left-accent border, "DAILY READOUT" header (or custom `title` prop), cyan diamond icon per item, prose lines with inline HTML allowed.  
**Bug fixed (May 2026):** Was rendering without a container (raw text between cards). Now properly wrapped in `.card` div.

### HeroCard
Gradient metric tile used in KPI bars throughout. Props: icon, label, value, color, accent colour (cyan/teal/gold/rose), badge, sub-label.

---

## API Routes (`/api/`)

| Route | Purpose |
|-------|---------|
| `/api/equity` | Finnhub + Alpha Vantage: overview, financials, peers, DCF inputs |
| `/api/macro` | FRED + AV: regime, yields, indicators, market quotes |
| `/api/trading` | Alpaca: account, quotes, bars, options chain, order submission |
| `/api/funds` | ETF/fund data: overview, holdings, performance |
| `/api/news` | Market news feed |
| `/api/screener-market` | Broad market screener data (~500 stocks) |
| `/api/claude-analyse` | Individual company + PCM AI analysis (Claude claude-sonnet-4-6) |
| `/api/claude-sector` | Sector-level AI analysis (Claude claude-sonnet-4-6) |
| `/api/calendar` | Earnings and dividend calendar |
| `/api/diag` | System diagnostics (ping, env check) |
| `/api/github-status` | GitHub Actions sync status |

---

## Supabase Views (Key)

| View | Used by | Description |
|------|---------|-------------|
| `vw_portfolio_home` | Portfolio, PCM | Live positions with market value, P&L, daily change |
| `vw_portfolio_nav_daily` | Performance, Risk, top bar | Daily NAV time series |
| `vw_command_centre` | Command, Performance | Portfolio-level summary stats |
| `vw_transactions` | Performance (entry markers) | All trades with symbol, date, side, qty, price |
| `vw_quant_signals` | Quant | Per-position regime signals |
| `vw_risk_metrics` | Risk | Per-position VaR, vol, beta |
| `vw_factor_exposure` | PCM L3 | Factor tilts |
| `vw_pcm_risk` | PCM L4 (fallback only) | Marginal risk contributions |
| `vw_pcm_factor` | PCM | Factor data |
| `vw_pcm_allocation` | PCM L2 | Asset class allocation vs targets |
| `vw_portfolio_hist_by_symbol` | PCM L5 | Price history per symbol for optimizer |
| `vw_screener` | Valuation Screener | Portfolio positions with valuation enrichment |
| `vw_correlation_matrix` | Quant | Pairwise correlations |
| `vw_drawdown_analysis` | Quant | Drawdown events |
| `vw_sync_status` | SyncStatusPill | Latest sync health |
| `vw_calendar_events` | Portfolio Home | Earnings/ex-div dates |

---

## Known Bugs Fixed (This Sprint — May 2026)

1. **SQL Terminal AI hung**: Edge function `claude_sql_assistant` was timing out (160s), surfaced as "Failed to send a request". Fixed: AbortController (90s) in edge function + error body unwrapping in client.

2. **Individual company Scrapbook notes failing**: `max_tokens: 4096` too small for 12-field JSON response. Fixed: raised to 8192.

3. **PCM L4 duplicate rows**: `vw_pcm_risk` view returns multiple rows per ticker. Fixed: `computeRiskRows()` computes risk rows client-side from deduplicated position + history data.

4. **PCM L4 Name/Sector showing "—"**: Lookup was using stale data. Fixed by computing rows from same `posRef.current` array.

5. **PCM L5 only 7 stocks**: Optimizer used a hardcoded subset. Fixed: `PositionSelector` shows all held positions, user can include/exclude.

6. **NarrativeStrip uncontained**: Text rendered without background between cards. Fixed: wrapped in `.card` div with cyan left-accent.

---

## Feature Testing Checklist

When testing ATLAS in the browser, focus on:

### High Priority (most decision-relevant)
- [ ] PCM L5: Does ATLAS Adaptive optimizer produce sensible weights? Are λ/γ/η sliders responsive?
- [ ] PCM L4: Risk Budget Console shows correct % Risk per position without duplicates?
- [ ] Performance → Overview: Entry markers toggle works? Filter (All/Notable/First Entry) changes markers?
- [ ] Scrapbook: Individual company analyst notes generate without error?
- [ ] SQL Terminal: Atlas AI responds? Can it write a query from natural language?
- [ ] PCM L7: Construction report generates and is coherent?

### Medium Priority
- [ ] Quant → Correlation: Matrix renders, high-ρ pairs flagged in tab badge?
- [ ] Risk → Monte Carlo: Simulation runs, sliders work, fan chart renders?
- [ ] Valuation Screener: Portfolio mode loads positions, Market mode loads ~500 stocks?
- [ ] Valuation House → Multi-stage DCF: Inputs work, sensitivity table renders?
- [ ] Save to Scrapbook: Does the `ScrapbookSaveBar` persist to database?

### Low Priority / Edge Cases
- [ ] Quick Trade: Order ticket submits to Alpaca (paper account)?
- [ ] Options → Strategy: Multi-leg builder + combined payoff chart?
- [ ] SYNC pill: Updates when a new sync lands?
- [ ] Demo Mode Banner: Shown when no Supabase key, dismissable?
- [ ] Refresh button: Triggers reload across all panels?

---

## Innovation Opportunities (Small Wins)

Suggestions in keeping with the institutional character of the platform:

1. **PCM L5 — Save/load optimizer runs**: Allow saving a set of optimizer parameters (mode + λ/γ/η + universe) as a named preset. Useful for comparing "conservative rebalance" vs "aggressive tilt" scenarios.

2. **Performance Overview — Annotation layer**: Allow adding text annotations to the equity curve at specific dates (e.g. "Market crash — held position", "Earnings miss — trimmed"). Stored in Supabase.

3. **Quant Signals — Alert thresholds**: Set RSI or correlation thresholds; highlight rows that breach them in the Signals tab. Purely visual, no backend changes.

4. **Valuation Screener — Watchlist mode**: A third universe toggle (Portfolio / Market / Watchlist) that reads from a user-saved list of tickers. Useful for tracking potential buys.

5. **Risk Core — Stress test scenarios**: Predefined shocks (e.g. "2022 rate shock: rates +300bps, equities -20%", "2020 COVID crash"). Apply to current portfolio to estimate impact. Pure client-side calc.

6. **Scrapbook — Thesis status**: Add a status field to each scrapbook entry (Researching / Conviction Built / Monitoring / Closed). Show as a column in the log view, and filter by status.

7. **PCM L6 — Pre-execution cost estimate**: Before executing trades, show estimated commission + spread cost for the rebalancing batch. Simple calculation, high decision value.

8. **SQL Terminal — Pinned queries**: Allow pinning saved queries to a quick-access bar above the editor. Useful for frequently run dashboards.

9. **Portfolio Home — Sector exposure mini-chart**: A small horizontal stacked bar showing sector allocation at a glance in the KPI bar area. Fast to build, always useful.

10. **Macro → Regime — Portfolio implication tooltip**: When showing the current regime (Risk-On/Risk-Off/Transition), add a one-line note on what that means for the actual portfolio ("Your tech overweight increases risk in this regime"). Cross-references current positions.

---

## Design Principles (Do Not Violate in Suggestions)

- **No gratuitous visualisation** — every chart must answer a specific question
- **Dark terminal aesthetic** — background near-black, text white/grey hierarchy, accents in cyan (#00d4ff / #00c8e0), gold (#f59e0b), teal (#10b981), red (#ef4444)
- **JetBrains Mono** for data / numbers / labels; **Figtree** for prose
- **Dense, not cluttered** — pack information but use whitespace deliberately
- **Institutional character** — this is a professional tool, not a retail trading app. No gamification, no emojis in UI, no celebratory animations
- **Client-side first** — prefer computing in the browser when data is already loaded (avoids extra API calls)
- **Graceful empty states** — `EmptyState` component when data is unavailable; `Loading` spinner during fetch
