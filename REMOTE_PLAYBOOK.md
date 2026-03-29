# ATLAS Remote Control — Command Playbook

Ready-to-use prompts for remote control sessions. Copy-paste these from your phone/browser.

---

## Portfolio Diagnostics

### Full Health Check
```
Run full portfolio diagnostics. Check:
1. Concentration risk (any position >15% weight)
2. Sector tilts vs benchmark
3. Factor exposures (value, momentum, quality)
4. Performance attribution vs SPY
Summarize findings with actionable recommendations.
```

### Quick P&L Summary
```
Load the current portfolio and show: total return, daily change, best/worst performers, and current drawdown from peak. Keep it brief.
```

### Risk Dashboard
```
Calculate and display: portfolio VaR (95% and 99%), CVaR, maximum drawdown, current Sharpe ratio, and correlation matrix heatmap. Flag any positions contributing >25% to portfolio risk.
```

---

## Valuation Engine

### Full Valuation Sweep
```
Recalculate intrinsic values for all equity positions using DCF with latest inputs. Flag any stock with >20% mispricing (upside or downside). Show a table: ticker, current price, intrinsic value, margin of safety.
```

### Single Stock Deep Dive
```
Run full valuation analysis on [TICKER]: DCF model, comparable multiples, key assumptions. Show sensitivity table for discount rate and growth rate variations.
```

### Assumption Stress Test
```
For the top 5 holdings by weight, stress test DCF valuations under:
- Base case (current assumptions)
- Bear case (growth -30%, WACC +200bp)
- Bull case (growth +30%, WACC -100bp)
Show results as a comparison table.
```

---

## Risk & Stress Testing

### Market Shock Simulation
```
Stress test portfolio under: -5% broad equity shock, +100bp rate shock, -10% commodity shock, and ZAR 15% depreciation. Show impact on portfolio value and individual positions.
```

### Monte Carlo Projection
```
Run 10,000-path Monte Carlo simulation for the portfolio over 12 months. Show: median outcome, 5th/95th percentile bounds, probability of >10% loss, and probability of >20% gain.
```

### Correlation Breakdown
```
Generate the full correlation matrix for all holdings. Identify the highest-correlated pairs (>0.8) and suggest diversification opportunities.
```

---

## Data Pipeline

### Ingestion Health Check
```
Check the Supabase data pipeline:
1. When was the last successful price update?
2. Are any tickers missing recent data?
3. Check for null/stale entries in positions table
4. Verify Alpaca sync status
Report any issues found.
```

### Data Freshness Audit
```
For each data source (yFinance, FRED, Alpha Vantage, Alpaca), check: last successful fetch, any errors in recent calls, and data staleness. Flag anything older than 24h.
```

### Backfill Missing Data
```
Identify any gaps in price_history for current holdings. For any missing dates in the last 90 days, backfill from yFinance. Report what was filled.
```

---

## UI & Pages

### Page Health Check
```
Check all registered pages in navigation/registry.py. Verify each page module exists and imports cleanly. Report any broken or missing pages.
```

### Component Audit
```
Review ui/components/ for unused or duplicate components. Check which pages import which components. Suggest any consolidation opportunities.
```

### Style Consistency Check
```
Audit chart theming across ui/pages/. Verify all Plotly charts use the dark theme from config. Flag any charts with hardcoded colors or inconsistent styling.
```

---

## Optimization

### Portfolio Rebalance Suggestion
```
Run mean-variance optimization on the current portfolio. Show: current weights vs optimal weights, expected return improvement, and risk reduction. Constrain to max 20% per position.
```

### Factor Tilt Analysis
```
Decompose portfolio returns into factor exposures (market, size, value, momentum, quality). Show current tilts and suggest adjustments to improve risk-adjusted returns.
```

---

## Quick Commands (One-Liners)

| Command | What It Does |
|---------|--------------|
| `Show portfolio summary` | Quick overview of holdings and performance |
| `What's my Sharpe ratio?` | Current risk-adjusted return metric |
| `Top 3 risks right now` | Biggest risk exposures in the portfolio |
| `Is [TICKER] overvalued?` | Quick DCF check on a single stock |
| `Check API health` | Verify FastAPI endpoints are responding |
| `Run the scheduler manually` | Trigger a report generation cycle |
| `Show sector breakdown` | Current sector allocation vs benchmark |
| `What changed today?` | Daily P&L and movers summary |

---

## Session Routing Guide

| If you need... | Use session | Why |
|----------------|-------------|-----|
| Valuation updates | ATLAS-CORE | Touches `core/calculations.py` |
| Fix a chart/table | ATLAS-UI | Touches `ui/pages/`, `ui/components/` |
| Data is stale/missing | ATLAS-DATA | Touches `core/fetchers.py`, Supabase |
| API endpoint issue | ATLAS-CORE | Touches `api/routers/` |
| Scheduled report bug | ATLAS-DATA | Touches `scheduler/` |
| Add a new page | ATLAS-UI | Touches `ui/pages/`, `navigation/` |
| Optimization run | ATLAS-CORE | Touches `core/optimizers.py` |
