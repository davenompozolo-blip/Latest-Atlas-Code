# ATLAS Terminal — Architecture Pulse Check
**Date:** 2026-04-25
**Author:** Claude Code (session `01TmWUAqsZ9iFqgrQgJj66V7`)
**Purpose:** Hand-off context for the next Claude instance. Read this before touching any module.

---

## 1. The Stack in One Sentence

A **27-page Streamlit Python app** is being retrofitted into a **React SPA on Vercel**, with **Supabase Postgres** as the single source of truth for data, and **FastAPI** (`api/`) as the bridge for calculations too heavy for SQL.

---

## 2. Three Layers, One Rule Each

| Layer | Entry point | Rule |
|-------|-------------|------|
| **Streamlit** | `atlas_app.py` → `ui/pages/*.py` | Reference implementation only. Do NOT break it. It is the calculation spec. |
| **Supabase** | `supabase/` — tables, views, edge functions | Canonical data store. Views compute analytics at query time. |
| **React SPA** | `public/index.html` (1 file, deployed on Vercel) | Production UI. Reads from Supabase views via PostgREST (anon key). |

---

## 3. Data Flow

```
Alpaca Markets (paper trading)
        │ every 5 min via Supabase Edge Function
        ▼
Supabase Postgres
  Tables: portfolios, positions, transactions, price_history,
          account_snapshots, sync_log
  Views:  vw_portfolio_home, vw_quant_dashboard, vw_risk_analysis,
          vw_performance_suite, vw_command_centre,
          vw_portfolio_nav_daily, vw_portfolio_returns_daily
        │
        ├──► React SPA (Vercel) — reads views via PostgREST
        │
        └──► Streamlit app — reads via `services/supabase_views.py`
                           fetch_view("vw_risk_analysis") etc.
```

The React SPA is currently in MOCK DATA mode because `SUPABASE_ANON_KEY` is not injected at Vercel build time. Setting that env var in Vercel project settings switches it to live data.

---

## 4. Module Status Map

### Fully Working in Streamlit, Partially in React

| Module | Streamlit file | Supabase view | React tab |
|--------|---------------|---------------|-----------|
| Portfolio Home | `ui/pages/portfolio_home.py` | `vw_portfolio_home` | ✅ Tab 1 |
| Quant Dashboard | `ui/pages/quant_dashboard.py` | `vw_quant_dashboard` | ✅ Tab 2 |
| Risk Analysis | `ui/pages/risk_analysis.py` | `vw_risk_analysis` | ✅ Tab 3 |
| Performance Suite | `ui/pages/performance_suite.py` | `vw_performance_suite` | ✅ Tab 4 |
| Command Centre | `ui/pages/market_regime.py` | `vw_command_centre` | ✅ Tab 5 |

### Modules Without a React Home Yet (Streamlit-only)

| Module | Streamlit file | Complexity | Recommended path |
|--------|---------------|------------|-----------------|
| **Valuation House** | `ui/pages/valuation_house.py` | Very High — 8 DCF methods, Monte Carlo | FastAPI endpoint → React |
| Monte Carlo Engine | `ui/pages/monte_carlo.py` | Medium — GBM engine | FastAPI or inline in Risk tab |
| Multi-Factor Analysis | `ui/pages/multi_factor_analysis.py` | High | FastAPI endpoint |
| Portfolio Optimizer | `ui/pages/quant_optimizer.py` | High — MVO, Black-Litterman | FastAPI endpoint |
| Equity Research | `ui/pages/equity_research.py` | Medium | REST + Supabase cache |

---

## 5. The Valuation House: Architectural Decision

### What it is
Eight institutional-grade valuation methods: FCFF DCF, FCFE DCF, Gordon Growth DDM, Multi-Stage DDM, Residual Income, Relative Valuation (peer multiples), SOTP, and Consensus (weighted aggregate). Plus regime-aware WACC adjustment, smart assumptions, DCF trap detection, and Monte Carlo on DCF outputs.

### Where the code lives
```
ui/pages/valuation_house.py           ← Streamlit page (2,326 lines)
valuation/atlas_dcf_engine.py         ← Core DCF class (222 lines)
atlas_dcf_institutional.py            ← Institutional enhancements (567 lines)
analytics/dcf_trap_detector.py        ← Value trap detection (889 lines)
analytics/dcf_projections.py          ← Editable projection tables (373 lines)
analytics/multistage_dcf.py           ← Multi-stage models (416 lines)
dcf_regime_overlay.py                 ← Market regime adjustments (~200 lines)
api/routers/valuation.py              ← FastAPI router (EXISTS, needs expansion)
```

### The problem
The calculation logic is tightly coupled to Streamlit session state and lazy imports inside `render_valuation_house()`. It cannot be called directly from React without going through an API layer.

### Recommended architecture (do NOT deviate without discussion)

```
React SPA
    │
    │  POST /api/valuation/dcf  {ticker, method, scenario, overrides}
    ▼
FastAPI (api/routers/valuation.py)
    │  — calls calculate_dcf_value(), calculate_wacc(), etc.
    │  — all in core/calculations.py (pure functions, no Streamlit)
    ▼
Supabase
    │  — cache result in valuation_results table (ticker, method, ts, json)
    │  — React reads cached result on next load
    ▼
React renders result card
```

**Do NOT re-implement DCF math in JavaScript.** The Python layer in `core/calculations.py` is the single source of truth for all numbers. React is just a renderer.

### What's missing before this works
1. `api/routers/valuation.py` needs full endpoints (currently minimal)
2. A `valuation_results` Supabase table for result caching
3. React component for the Valuation House tab (not yet built)
4. Segment extraction is a placeholder — `_extract_segment_revenues()` in `analytics/dcf_trap_detector.py` always returns `None`

---

## 6. Risk Analysis: Current State (as of this session)

`ui/pages/risk_analysis.py` has **5 tabs**:

| Tab | Name | Status |
|-----|------|--------|
| 1 | Core Risk | Working — VaR waterfall, distribution, efficient frontier, rolling VaR/CVaR |
| 2 | Monte Carlo | **Just implemented** — GBM engine, path chart, summary metrics, VaR/CVaR histogram |
| 3 | Advanced Analytics | Working — rolling metrics, underwater plot, sunburst, correlation network |
| 4 | Stress Tests | Working — historical stress test (2008, COVID, etc.) vs SPY |
| 5 | VaR/CVaR Optimization | Working — CVaR-minimizing portfolio optimizer |

**PR #382** contains the Monte Carlo tab implementation. Branch: `claude/monte-carlo-tab-skeleton-1kEaH`.

The Monte Carlo tab uses a GBM (`run_monte_carlo_simulation`) defined locally inside `render_risk_analysis()`. It feeds results into `create_monte_carlo_chart()` from `core/charts.py`. Simulation state is cached in `st.session_state['_ra_mc_simulations']` so reruns don't re-run the simulation.

---

## 7. The Single Source of Truth: How to Think About It

The goal is that **every number shown in the React SPA must be traceable to either**:
- A Supabase view (for portfolio/market data), **or**
- A FastAPI endpoint that calls `core/calculations.py` (for analytics/valuation)

**Never duplicate math.** If `calculate_var()` exists in `core/calculations.py`, the React SPA must call the API, not reimplement VaR in JavaScript.

The Streamlit app enforces this implicitly — it imports everything from `core/`. The React retrofit must respect the same contract.

---

## 8. Known Issues / Landmines

| Issue | File | Notes |
|-------|------|-------|
| `_extract_segment_revenues()` always returns None | `analytics/dcf_trap_detector.py:752` | Placeholder. SOTP segment analysis is therefore manual-only |
| Supabase anon key not in Vercel env | Vercel project settings | Switches React from MOCK to LIVE data |
| `atlas_app.py` is 23,600+ lines | `atlas_app.py` | Do NOT edit this file directly. All changes go in `ui/pages/` modules |
| `run_monte_carlo_simulation` was a stub | Fixed in PR #382 | Now a real GBM engine in `risk_analysis.py` |
| Command Centre 500 error | Vercel | `ANTHROPIC_API_KEY` not set in Vercel env vars |
| `StochasticEngine` in `monte_carlo.py` uses different interface | `analytics/stochastic.py` | Uses per-ticker returns + weights; risk_analysis.py tab uses the simpler GBM on aggregated portfolio returns. Both are valid, different granularity |

---

## 9. Key Files Every Instance Should Know

```
atlas_app.py                    ← 23,600-line monolith. READ, don't edit.
core/calculations.py            ← 2,660 lines, 39 functions. THE math layer.
core/charts.py                  ← All Plotly chart factories.
core/fetchers.py                ← yFinance + FRED + Alpha Vantage data fetching.
navigation/registry.py          ← Page registry. Add new pages here.
navigation/page_handlers.py     ← Dispatches to ui/pages/*.py render functions.
ui/pages/risk_analysis.py       ← Risk Analysis (1,260 lines, 5 tabs).
ui/pages/valuation_house.py     ← Valuation House (2,326 lines, needs API layer).
ui/pages/monte_carlo.py         ← Standalone Monte Carlo page (253 lines).
api/routers/valuation.py        ← FastAPI valuation endpoints (expand this).
api/main.py                     ← FastAPI app mount point.
public/index.html               ← React SPA (entire frontend, 1 file).
supabase/migrations/            ← SQL migrations. Run in order.
services/supabase_views.py      ← Streamlit helper: fetch_view("vw_xxx").
```

---

## 10. Where to Start Next

**Short term (current sprint):**
1. Expand `api/routers/valuation.py` — expose at minimum: `/dcf`, `/wacc`, `/peer-multiples`
2. Create `valuation_results` table + migration in `supabase/migrations/`
3. Wire Valuation House React component to those endpoints

**Medium term:**
4. Replace `_extract_segment_revenues()` placeholder with SEC EDGAR XBRL parsing
5. Set `ANTHROPIC_API_KEY` + `SUPABASE_ANON_KEY` in Vercel → kills mock data mode
6. Commit the live Supabase Edge Function under `supabase/functions/`

**Principle:** When in doubt, check what `core/calculations.py` already computes before building anything new.

---

*Written by Claude Code on 2026-04-25 to bridge context between sessions.*
