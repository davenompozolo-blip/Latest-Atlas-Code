# ATLAS Terminal — Course Correction & Implementation Status
**Date:** 2026-04-04
**Branch:** `claude/atlas-terminal-implementation-dFYbI`
**Repo:** `davenompozolo-blip/Latest-Atlas-Code`
**Supabase:** `vdmojjszvvcithuxwexx.supabase.co`
**Vercel URL:** (deployed — currently showing MOCK DATA mode)

---

## 1. WHAT'S BUILT AND WORKING

### 1a. ATLAS Terminal (`public/index.html`) — RENDERING, MOCK DATA
- **Status:** Deployed on Vercel, rendering correctly with left sidebar layout
- **Design:** Left sidebar nav (Portfolio/Quant/Risk/Performance/Command), top bar with NAV summary + sparkline + LIVE/MOCK badge, positions table + donut chart + benchmark chart
- **All 5 views implemented as React components:**
  - Portfolio Home (positions table, donut, benchmark chart)
  - Quant Dashboard (regime detection, momentum, z-scores)
  - Risk Analysis (VaR, vol contribution, risk tiers)
  - Performance Suite (entry efficiency, CAGR, cut candidates, NAV chart)
  - Command Centre (health score, system status)
- **Data loading:** Each view calls `loadView('vw_xxx')` against Supabase
- **Problem:** Running in MOCK DATA mode because `SUPABASE_ANON_KEY` is not being injected at build time

### 1b. ATLAS Command Centre (`public/command-centre/index.html`) — BUILT, NEEDS AUDIT
- **Status:** Built (756 lines), deployed at `/command-centre` route on Vercel
- **What it has:** 4 agents (Archivist/Architect/Engineer/Strategist), left sidebar agent selection, chat interface, copy-to-clipboard prompt builder
- **NEEDS AUDIT:** Current design uses a LEFT SIDEBAR for agent selection. The target design (from Hlobo's screenshots) shows HORIZONTAL TABS across the top, a "SESSION BRIEF" expandable section, and quick-action prompt buttons. These UI differences need to be reconciled.

### 1c. Phoenix Parser Sync (`sync/run_sync.py`) — BUILT, UNTESTED
- **Status:** Self-contained Python script (no Streamlit dependency), 300+ lines
- **What it does:**
  1. Connects to Alpaca via `alpaca-py` SDK
  2. Fetches account, positions, paginated order history
  3. Filters OCC options symbols via regex (`^[A-Z]{1,6}\d{6}[PC]\d{8}$`)
  4. Normalizes data and upserts to Supabase (portfolios, assets, positions, transactions)
  5. Ingests 30-day price history per equity ticker
- **Problem:** Has never been run. Needs actual testing with Alpaca paper account credentials.

### 1d. GitHub Actions Workflow (`.github/workflows/atlas-sync.yml`) — CONFIG DONE
- **Status:** YAML file exists, runs `sync/run_sync.py` every 15 minutes
- **Problem:** Requires 4 GitHub repository secrets to be configured (see Section 3)

### 1e. Vercel Deployment — DEPLOYING, ENV VARS MISSING
- **Status:** `vercel.json` configured, `inject-env.js` exists for build-time key injection
- **Build command:** `node inject-env.js` (replaces `const SUPABASE_KEY = ''` with the actual anon key)
- **Problem:** `SUPABASE_ANON_KEY` environment variable not set in Vercel dashboard

---

## 2. THE CRITICAL PIPELINE — WHAT'S BROKEN

The entire data pipeline looks like this:

```
Alpaca Markets API (paper trading, ~55 assets)
         │
         │ sync/run_sync.py (GitHub Actions, every 15 min)
         │ OR services/alpaca_sync.py (Streamlit on-demand)
         ▼
Supabase Tables (portfolios, assets, positions, transactions, price_history)
         │
         │ SQL Views (computed analytics)
         ▼
7 Views (vw_portfolio_home, vw_quant_dashboard, vw_risk_analysis,
         vw_performance_suite, vw_command_centre, vw_portfolio_nav_daily,
         vw_portfolio_returns_daily)
         │
         │ Supabase JS client (loadView() in React)
         ▼
ATLAS Terminal (public/index.html on Vercel)
```

### What's broken in this pipeline:

| Segment | Status | Blocker |
|---|---|---|
| Alpaca → Supabase tables | **UNTESTED** | `sync/run_sync.py` has never been executed. Need to verify it writes data correctly. |
| Supabase tables → Views | **UNKNOWN** | All 7 views exist in `migrations/supabase_views.sql` but we haven't verified they return data with the current table contents. Tables may be empty or stale. |
| Views → Terminal | **BLOCKED** | `SUPABASE_ANON_KEY` not injected on Vercel. Terminal falls back to mock data. |
| GitHub Actions → Scheduled sync | **BLOCKED** | 4 secrets not set in GitHub repo settings. |

### THE FIX ORDER (mission critical):

**Step 1: Set Vercel env var** (Hlobo — manual action)
```
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
In Vercel Dashboard → Project Settings → Environment Variables → Add

**Step 2: Set GitHub repo secrets** (Hlobo — manual action)
In GitHub → Settings → Secrets and variables → Actions → New repository secret:
```
ALPACA_API_KEY      = (from .env or Streamlit secrets)
ALPACA_SECRET_KEY   = (from .env or Streamlit secrets)
SUPABASE_URL        = https://vdmojjszvvcithuxwexx.supabase.co
SUPABASE_SERVICE_KEY = (service role key — NOT the anon key. Get from Supabase dashboard → Settings → API → service_role)
```

**Step 3: Test sync/run_sync.py locally** (CC — implementation action)
```bash
cd sync
pip install -r requirements.txt
ALPACA_API_KEY=xxx ALPACA_SECRET_KEY=xxx SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx python run_sync.py
```
Verify: no crashes, data appears in Supabase tables.

**Step 4: Verify Supabase views return data** (CC — implementation action)
Run this in Supabase SQL Editor:
```sql
SELECT 'vw_portfolio_home' AS view_name, COUNT(*) AS rows FROM vw_portfolio_home
UNION ALL SELECT 'vw_quant_dashboard', COUNT(*) FROM vw_quant_dashboard
UNION ALL SELECT 'vw_risk_analysis', COUNT(*) FROM vw_risk_analysis
UNION ALL SELECT 'vw_performance_suite', COUNT(*) FROM vw_performance_suite
UNION ALL SELECT 'vw_command_centre', COUNT(*) FROM vw_command_centre
UNION ALL SELECT 'vw_portfolio_nav_daily', COUNT(*) FROM vw_portfolio_nav_daily;
```
Expected: ~55 rows for position views, 1 row for command centre, 100+ rows for NAV daily.

**Step 5: Redeploy Vercel** (automatic after env var is set)
Terminal should switch from MOCK DATA to LIVE DATA.

---

## 3. API ENVIRONMENT SETUP — POST-STREAMLIT WORLD

### The Problem
Previously, all API keys lived in `.streamlit/secrets.toml` and were loaded via `st.secrets`. Now that the frontend is a static HTML file on Vercel (not Streamlit), the credential management model has changed:

### New Credential Architecture

| Credential | Where it lives | Who uses it | Security level |
|---|---|---|---|
| `SUPABASE_ANON_KEY` | Vercel env var → injected into HTML at build time | Terminal frontend (read-only queries) | **Public-safe** (anon key is designed for client-side use with RLS) |
| `SUPABASE_URL` | Hardcoded in HTML (`vdmojjszvvcithuxwexx.supabase.co`) | Terminal frontend | **Public** |
| `SUPABASE_SERVICE_KEY` | GitHub Actions secret | `sync/run_sync.py` (write access) | **SECRET — never expose in frontend** |
| `ALPACA_API_KEY` | GitHub Actions secret | `sync/run_sync.py` | **SECRET** |
| `ALPACA_SECRET_KEY` | GitHub Actions secret | `sync/run_sync.py` | **SECRET** |

### How inject-env.js works (build-time injection)
```
Vercel build step:
1. vercel.json: "buildCommand": "node inject-env.js"
2. inject-env.js reads process.env.SUPABASE_ANON_KEY
3. Replaces `const SUPABASE_KEY = ''` → `const SUPABASE_KEY = 'eyJ...'` in public/index.html
4. Vercel serves the modified HTML as a static file
```

This is secure because:
- The anon key is designed for client-side use (Supabase Row Level Security governs access)
- The service key (for writes) NEVER touches the frontend
- Write operations happen only in GitHub Actions (server-side)

### SECURITY CONCERN — .env.example contains REAL API keys
The file `.env.example` at the repo root contains actual Alpaca API keys, Supabase anon key, Alpha Vantage key, and FRED key. These should be:
1. Replaced with placeholder values (`your-key-here`)
2. Or the file should be removed entirely and documented in README

---

## 4. COMMAND CENTRE — GAPS vs TARGET DESIGN

### Current state (what's built):
- Left sidebar with 4 agent cards
- Chat interface with prompt builder + copy-to-clipboard
- Dark theme matching terminal

### Target state (from Hlobo's screenshot — Image 3):
- **Horizontal tabs** across the top (THE ARCHIVIST | THE ARCHITECT | THE ENGINEER | THE STRATEGIST)
- **SESSION BRIEF** section with expandable/collapsible panel and "OPEN" button
- **Agent status bar** showing "4 AGENTS ONLINE" with green dot
- **Quick-action prompt buttons** below the agent empty state (e.g., "Where are we with ATLAS right now?", "What bugs are currently open?", "Give me a full project status report", "What were we last working on?")
- **Agent specialty tags** shown below agent name (e.g., "State recall . Open issues . Version history . Project status")
- **CLEAR CHAT** button in top-right of chat area
- Date displayed in top-right of top bar

### What needs to change:
1. Convert left sidebar → horizontal tabs for agent selection
2. Add SESSION BRIEF expandable section
3. Add quick-action prompt buttons per agent
4. Add agent specialty tags
5. Add agent count indicator in top bar
6. General visual polish to match target exactly

---

## 5. SUPABASE VIEWS — CURRENT SCHEMA REFERENCE

All views are defined in `/migrations/supabase_views.sql` (565 lines). Here are the exact column contracts the terminal expects:

### vw_portfolio_home
```
symbol, name, quantity, cost_basis, current_price, market_value,
unrealised_return_pct, portfolio_weight, annualised_vol, sharpe_approx,
hhi_score, n_positions, is_concentrated, price_date
```

### vw_quant_dashboard
```
symbol, name, current_price, ma_20, ma_50, ma_200, price_regime,
vol_regime, zscore_20d, mean_reversion_signal, momentum_pct_rank_20d,
annualised_vol_20d, annualised_vol_60d, trading_days_available
```

### vw_risk_analysis
```
symbol, name, market_value, weight, annual_vol, marginal_vol_contribution,
dollar_var_95_daily, trading_days, risk_tier
```

### vw_performance_suite
```
symbol, name, entry_price, entry_date, current_price, entry_efficiency_score,
total_return_pct, annualised_return, days_held, cut_candidate_flag
```

### vw_command_centre (single row)
```
portfolio_nav, total_invested, total_return_pct, sharpe_ratio, sortino_ratio,
drawdown_pct, dollar_var_95, atlas_health_score, portfolio_health_status,
position_count, days_of_history, computed_at
```

### vw_portfolio_nav_daily (time series)
```
price_date, nav, daily_return
```

### vw_portfolio_returns_daily (legacy fallback)
```
price_date, portfolio_nav, daily_return
```

---

## 6. FILE MAP — WHAT'S WHERE

```
Latest-Atlas-Code/
├── public/                          # Vercel serves this directory
│   ├── index.html                   # ATLAS Terminal (React SPA, 1215 lines)
│   └── command-centre/
│       └── index.html               # ATLAS Command Centre (vanilla JS, 756 lines)
│
├── sync/                            # Server-side sync pipeline
│   ├── run_sync.py                  # Alpaca → Supabase sync (standalone, no Streamlit)
│   ├── requirements.txt             # alpaca-py only
│   └── requirements-full.txt        # Original Streamlit app requirements (moved from root)
│   └── runtime.txt                  # Python version spec (moved from root)
│
├── migrations/
│   └── supabase_views.sql           # All 7 SQL view definitions (565 lines)
│
├── .github/workflows/
│   └── atlas-sync.yml               # GitHub Actions: run_sync.py every 15 min
│
├── inject-env.js                    # Vercel build: injects SUPABASE_ANON_KEY into HTML
├── vercel.json                      # Vercel config: static deploy, rewrites
├── atlas_terminal.html              # Source copy of public/index.html (kept in sync)
│
├── services/                        # Original Streamlit service layer (still works)
│   ├── alpaca_sync.py               # Original Alpaca sync (Streamlit-dependent)
│   ├── supabase_client.py           # Python Supabase client (upsert helpers)
│   ├── supabase_views.py            # fetch_view() for Streamlit pages
│   ├── supabase_data.py             # Data accessors
│   └── market_data/                 # Price history ingestion
│
├── ui/pages/                        # Streamlit page modules (28 pages)
│   ├── phoenix_parser.py            # Original Phoenix Parser UI (16,597 lines)
│   ├── portfolio_home.py
│   ├── quant_dashboard.py
│   └── ... (26 more)
│
├── atlas_app.py                     # Streamlit entry point (still works, not retired)
├── .env.example                     # ⚠️ Contains REAL API keys — needs cleanup
└── config/config.py                 # Central config (loads secrets hierarchically)
```

---

## 7. COMPLETE TASK CHECKLIST

### DONE
- [x] Repo restructured for Vercel (public/, sync/, vercel.json)
- [x] Terminal HTML built with all 5 views + left sidebar layout
- [x] Command Centre HTML built with 4 agents + chat interface
- [x] `sync/run_sync.py` created (standalone, no Streamlit dependency)
- [x] GitHub Actions workflow created (15-min cron)
- [x] `inject-env.js` build-time key injection
- [x] `</script>` rendering bug fixed
- [x] Babel dependency removed (wasn't needed)
- [x] `requirements.txt` + `runtime.txt` moved out of root (Vercel 500MB fix)
- [x] OCC options symbol filtering in sync script

### BLOCKED (needs Hlobo manual action)
- [ ] Set `SUPABASE_ANON_KEY` in Vercel env vars → unblocks live data in terminal
- [ ] Set 4 GitHub repo secrets → unblocks scheduled Alpaca sync
- [ ] Verify `.env.example` real keys — rotate if needed

### NEEDS CC IMPLEMENTATION
- [ ] **Test `sync/run_sync.py` locally** — verify it writes to Supabase without errors
- [ ] **Verify all 7 views return data** — run validation SQL after sync
- [ ] **Command Centre UI redesign** — horizontal tabs, session brief, quick-action buttons to match target design
- [ ] **Terminal visual polish** — compare all 5 tabs against target designs, fix gaps
- [ ] **Security cleanup** — replace real keys in `.env.example` with placeholders
- [ ] **Streamlit retirement plan** — document when/how to decommission atlas_app.py

### NICE TO HAVE (future)
- [ ] Per-position sparkline charts in positions table
- [ ] Portfolio vs SPY benchmark overlay (requires SPY data in price_history)
- [ ] Mobile responsive improvements
- [ ] Scheduled sync health monitoring (alert on failure)
- [ ] Supabase Row Level Security policies for multi-user

---

## 8. WHAT TO TELL THE NEXT CC INSTANCE

> The ATLAS Terminal HTML shell is built and deploying on Vercel. It renders correctly but shows MOCK DATA because the Supabase anon key isn't injected yet. The sync pipeline (`sync/run_sync.py`) exists but has never been run — it needs local testing with real Alpaca credentials.
>
> The HIGHEST PRIORITY is getting the full pipeline working end-to-end: Alpaca sync → Supabase tables → SQL views → Terminal frontend. This requires:
> 1. Setting `SUPABASE_ANON_KEY` in Vercel (Hlobo does this)
> 2. Setting 4 GitHub secrets (Hlobo does this)
> 3. Running `sync/run_sync.py` locally to verify it works (CC does this)
> 4. Verifying all 7 views return data (CC does this)
>
> The Command Centre (`public/command-centre/index.html`) is built but doesn't match the target design from Hlobo's screenshots — it needs horizontal tabs instead of a sidebar, a SESSION BRIEF section, and quick-action prompt buttons.
>
> DO NOT touch the original Streamlit code (`atlas_app.py`, `ui/pages/`, `services/`). It's still the live production system. The HTML terminal is a parallel deployment, not a replacement yet.

---

*End of course correction document. Defer to what you find in the actual repo over what this doc says.*
