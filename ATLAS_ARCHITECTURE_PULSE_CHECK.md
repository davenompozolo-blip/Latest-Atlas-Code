# ATLAS Terminal — Architecture Pulse Check
**Date:** 2026-04-25 (corrected from earlier draft — see note at bottom)
**Author:** Claude Code (session `01TmWUAqsZ9iFqgrQgJj66V7`)
**Purpose:** Hand-off context for the next Claude instance. Read this before touching any module.

> **CORRECTION NOTE:** An earlier draft of this doc (same session) incorrectly framed Streamlit as a living "reference layer" and recommended a FastAPI bridge. Both are wrong. The authoritative decisions from the previous session (`017DBKEHyajCGe7kYFBQ55pP`) override those suggestions. The correct architecture is documented below.

---

## 1. The Stack in One Sentence

A React SPA deployed on **Vercel**, backed exclusively by **Supabase** (PostgreSQL views + Edge Functions), displaying live portfolio data from **Alpaca Markets** (~55–60 assets).

**Streamlit is retired. Do not suggest or reintroduce it for any component.**

---

## 2. Architecture Rules (Immutable — Do Not Reverse)

| Rule | Detail |
|------|--------|
| **React SPA only** | No Next.js, no SSR, no Streamlit, no Python in production |
| **All data through Supabase views** | No direct Alpaca API calls from the frontend |
| **No silent error fallbacks** | Errors must surface explicitly — no empty states masking failures |
| **Supabase anon key via Vercel env** | Never hardcoded in source |
| **No FastAPI bridge** | Computation-heavy features go through Supabase Edge Functions, not a Python layer |

---

## 3. Data Flow

```
Alpaca Markets (paper trading)
        │ every 5 min via Supabase Edge Function (sync_alpaca_positions)
        ▼
Supabase Postgres
  Tables: portfolios, positions, transactions, price_history,
          account_snapshots, sync_log
  Views:  vw_portfolio_home       — holdings, weights, P&L
          vw_quant_dashboard      — 5 analytical layers
          vw_risk_analysis        — VaR, vol contribution, risk tiers
          vw_performance_suite    — attribution, returns
          vw_command_centre       — Sharpe/Sortino/VaR/DD + agent interface
          vw_portfolio_nav_daily  — NAV time series
          vw_portfolio_returns_daily — daily returns
        │
        └──► React SPA (Vercel) via PostgREST (anon key)
```

---

## 4. Current Priority: Portfolio Home Retrofit (Step 0)

**Spec:** `/docs/RETROFIT_SPEC.md` — read this fully before implementing anything.

### Known gaps in Portfolio Home (`vw_portfolio_home` → React Tab 1)

| Gap | Status |
|-----|--------|
| Missing asset names in holdings table | Open |
| Sparse columns — several fields absent | Open |
| No P&L waterfall chart | Open |
| No earnings calendar | Open |
| No daily / 5-day return data | Open |

### Acceptance criteria
Portfolio Home must display: asset names, full column set, P&L waterfall, earnings calendar, daily + 5D return data — all sourced from `vw_portfolio_home`.

---

## 5. React Tab Structure (5 live tabs)

| Tab | View consumed | Status |
|-----|--------------|--------|
| Portfolio Home | `vw_portfolio_home` | Live, needs Step 0 retrofit |
| Quant Dashboard | `vw_quant_dashboard` | Live |
| Risk Analysis | `vw_risk_analysis` | Live |
| Performance Suite | `vw_performance_suite` | Live |
| Command Centre | `vw_command_centre` | Live (500 errors without `ANTHROPIC_API_KEY`) |

Target state: **~15–20 tabs** once all Streamlit modules are expressed as Supabase views + React components.

---

## 6. The Valuation House Problem (Deferred — needs architectural decision)

The Valuation House (8 DCF methods, Monte Carlo, regime-aware WACC, trap detection) exists in the legacy Python codebase but has **no React home yet**. This is the most complex module to retrofit.

### The tension
- Calculation logic is Python-heavy (`core/calculations.py`, `valuation/`, `analytics/`)
- The architecture rule says: no FastAPI bridge, everything through Supabase
- Complex DCF/Monte Carlo cannot be expressed in SQL views alone

### Options (decision needed from Hlobo before implementing)

| Option | Pros | Cons |
|--------|------|------|
| **A. Supabase Edge Functions (Deno/TS)** | Consistent with "all data through Supabase" rule | Requires porting Python math to TypeScript |
| **B. Vercel serverless function** | Stays in JS ecosystem | Breaks "all data through Supabase" principle |
| **C. Supabase Edge Function calls external Python API** | Keeps Python math | Adds infra complexity, latency |
| **D. Client-side JS implementation** | Simple deployment | DCF math is complex; risk of drift from Python reference |

**Do not implement the Valuation House React component until this decision is made.** Ask Hlobo.

### Legacy code locations (Python — for reference only, not production)
```
ui/pages/valuation_house.py           ← 2,326 lines (Streamlit — retired)
valuation/atlas_dcf_engine.py         ← Core DCF class (222 lines)
atlas_dcf_institutional.py            ← Institutional enhancements (567 lines)
analytics/dcf_trap_detector.py        ← Value trap detection (889 lines)
analytics/multistage_dcf.py           ← Multi-stage models (416 lines)
dcf_regime_overlay.py                 ← Regime adjustments (~200 lines)
```

**Known placeholder:** `_extract_segment_revenues()` in `analytics/dcf_trap_detector.py:752` always returns `None`. SOTP segment analysis is manual-only until this is replaced.

---

## 7. Streamlit Codebase (Legacy — Do Not Develop)

The Python codebase exists in the repo purely as a calculation reference. The numbers it produces are the spec for what Supabase views and future Edge Functions must reproduce.

| File | What it contains | Use as |
|------|-----------------|--------|
| `atlas_app.py` | 23,600-line monolith | Reference only |
| `core/calculations.py` | 2,660 lines, 39 analytics functions | Calculation spec |
| `ui/pages/risk_analysis.py` | 5-tab risk page (Monte Carlo tab live as of PR #382) | Reference only |
| `ui/pages/*.py` | All 27 page modules | Reference only |

**Do not add features to Streamlit pages.** If you find yourself editing `atlas_app.py` or `ui/pages/`, stop and ask whether this belongs in a Supabase view instead.

---

## 8. Infrastructure Resolutions (Already Fixed — Don't Revisit)

| Issue | Resolution |
|-------|-----------|
| Python Lambda size error on Vercel | Resolved |
| Supabase anon key injection mismatch | Resolved |
| Vercel Connected Store conflict | Resolved |
| `SQL_AVAILABLE` undefined variable (camelCase mismatch) | Resolved |

---

## 9. Known Open Issues

| Issue | Where | Notes |
|-------|-------|-------|
| React in MOCK DATA mode | Vercel env | `SUPABASE_ANON_KEY` needs setting in Vercel dashboard |
| Command Centre 500 error | Vercel env | `ANTHROPIC_API_KEY` not set in Vercel project env vars |
| Portfolio Home gaps | React Tab 1 | See Step 0 list above — current active sprint |
| Segment extraction placeholder | `dcf_trap_detector.py:752` | Python legacy; deferred |

---

## 10. Session Startup Checklist

1. `git log --oneline -10` — confirm current state of main
2. `git branch -a` — see active branches
3. Read `/docs/RETROFIT_SPEC.md` for current Step 0 detail
4. Confirm Supabase view schemas before writing any queries
5. Ask Hlobo for session objective if not already stated

---

## 11. Key Files (React / Supabase work)

```
public/index.html               ← Entire React SPA (1 file, all tabs)
supabase/migrations/            ← SQL migrations — run in order
supabase/functions/             ← Edge Functions (Deno/TS)
docs/RETROFIT_SPEC.md           ← Step-by-step retrofit plan
```

---

*Corrected by Claude Code on 2026-04-25 after reviewing session `017DBKEHyajCGe7kYFBQ55pP` context.*
*Previous draft errors: incorrectly kept Streamlit alive as "reference layer" and recommended FastAPI bridge — both contradict the project's architectural decisions.*
