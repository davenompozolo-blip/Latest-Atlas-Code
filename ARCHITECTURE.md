# ATLAS Terminal Architecture

## Overview

ATLAS Terminal is a Streamlit-based portfolio analytics platform. Originally a single monolithic file (`atlas_app.py` at ~24,000 lines), it was refactored into a modular architecture across Phases 1-5.

## Directory Structure

```
atlas_app.py              # Entry point, routing, classes (1,666 lines)
core/                     # Business logic (9,927 lines total)
  ├── __init__.py          # Re-exports all functions for pages (147 lines)
  ├── constants.py         # Shared flags & constants (142 lines)
  ├── calculations.py      # VaR, CVaR, DCF, returns (2,695 lines)
  ├── charts.py            # All Plotly visualizations (3,573 lines)
  ├── data_loading.py      # Portfolio data handling (1,199 lines)
  ├── fetchers.py          # External data fetching (746 lines)
  └── optimizers.py        # Portfolio optimization (1,425 lines)
ui/
  ├── pages/               # 17 page modules (11,023 lines total)
  │   ├── portfolio_home.py
  │   ├── performance_suite.py
  │   ├── risk_analysis.py
  │   ├── portfolio_deep_dive.py
  │   ├── valuation_house.py
  │   ├── quant_optimizer.py
  │   ├── phoenix_parser.py
  │   ├── market_watch.py
  │   ├── market_regime.py
  │   ├── monte_carlo.py
  │   ├── multi_factor_analysis.py
  │   ├── v10_analytics.py
  │   ├── r_analytics.py
  │   ├── database.py
  │   ├── leverage_tracker.py
  │   ├── investopedia_live.py
  │   └── about.py
  ├── components/          # Reusable UI components (3,116 lines)
  │   ├── sidebar_nav.py   # Vertical sidebar navigation
  │   ├── charts.py        # Chart rendering helpers
  │   ├── charts_theme.py  # Chart theming
  │   ├── metrics.py       # Metric display components
  │   ├── badges.py        # Badge/indicator components
  │   ├── tables.py        # Table styling
  │   └── tables_enhanced.py
  ├── theme.py             # Professional Blue theme (545 lines)
  └── atlas_css.py         # CSS/JS injection
navigation/                # Registry-based routing (experimental, toggled off)
  ├── registry.py          # Page registry & metadata
  ├── router.py            # Router logic
  └── sidebar.py           # Sidebar UI
data/
  └── instruments.py       # ETF_SECTORS, market data dicts
app/
  └── config.py            # COLORS, CHART_HEIGHT, CACHE_DIR, etc.
```

## Module Dependencies

```
core/constants.py      ← Shared flags (REFACTORED_MODULES_AVAILABLE, SQL_AVAILABLE, etc.)
     ↓
core/fetchers.py       ← External API calls (yfinance, FRED)
     ↓
core/data_loading.py   ← Portfolio loading, formatting, validation
     ↓
core/calculations.py   ← Math: valuation, risk, performance
     ↓
core/charts.py         ← All Plotly chart creation
     ↓
core/optimizers.py     ← Portfolio optimization algorithms
```

Import order in `core/__init__.py` follows this chain to avoid circular dependencies.

## How Page Routing Works

1. `atlas_app.py` calls `main()`
2. `main()` renders sidebar via `ui/components/sidebar_nav.py`
3. User selects a page → `page` variable set
4. `if/elif` chain routes to the correct `render_*()` function from `ui/pages/`
5. Each page lazily imports from `core` to avoid circular deps:
   ```python
   def render_performance_suite(start_date, end_date, benchmark):
       from core import calculate_var, calculate_cvar, ...
   ```

All routing is wrapped in a try/except that shows the actual error instead of a blank page.

## Adding a New Page

1. Create `ui/pages/new_page.py` with a `render_new_page()` function
2. Import what you need from `core` inside the function (lazy import)
3. Add route in `atlas_app.py` main():
   ```python
   elif page == "New Page":
       from ui.pages.new_page import render_new_page
       render_new_page(start_date, end_date)
   ```
4. Add to sidebar in `ui/components/sidebar_nav.py`

## Key Patterns

### Feature Flags (core/constants.py)
Optional dependencies use try/except with boolean flags:
```python
try:
    from atlas_terminal.data.fetchers.market_data import market_data
    REFACTORED_MODULES_AVAILABLE = True
except ImportError:
    REFACTORED_MODULES_AVAILABLE = False
    market_data = None
```

### Lazy Imports in Pages
Page modules import from `core` inside their render function to avoid circular imports with `atlas_app.py`.

### Rerun Loop Protection
- `atlas_app.py` has boot_count tracking with time-based detection
- All widgets have explicit `key=` parameters to prevent auto-key instability
- Session state writes are guarded (`if 'key' not in st.session_state`)

## Key Reference

- Pre-refactoring monolith: `git show ffd0154:atlas_app.py`
- Refactoring started: commit `ffd0154`
- All functions extracted to core/ are re-exported via `core/__init__.py`
