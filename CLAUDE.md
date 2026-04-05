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
