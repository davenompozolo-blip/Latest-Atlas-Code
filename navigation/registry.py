"""
ATLAS Page Registry - Single Source of Truth

This is THE LIST of all pages in ATLAS.
Adding a new page = adding one entry here.

Structure is intentionally simple:
- It's just a Python list
- No magic, no frameworks
- Easy to read, easy to modify

Design: Declarative data > Imperative code
"""

from dataclasses import dataclass
from typing import Optional, List, Callable


@dataclass
class PageDefinition:
    """
    Everything you need to know about a page.

    Fields:
        key: Unique identifier (internal, e.g., "portfolio_home")
        title: Display name (shown in UI, e.g., "Portfolio Home")
        icon: Emoji for navigation (e.g., "🏠")
        handler: Function that renders the page (called with no args by router)
        category: Grouping for organization (e.g., "core", "analysis")
        feature_flag: If set, page only shows when feature enabled
        requires_data: Prerequisites (e.g., ["portfolio", "trades"])
    """
    key: str
    title: str
    icon: str
    handler: Callable
    category: str = "general"
    feature_flag: Optional[str] = None
    requires_data: Optional[List[str]] = None

    def __post_init__(self):
        if self.requires_data is None:
            self.requires_data = []


# ============================================================================
# Handler factories
# ============================================================================

def _get_date_range():
    """Read current date range from session state (set by sidebar controls)."""
    import streamlit as st
    from datetime import datetime, timedelta

    selected_range = st.session_state.get('selected_range', '1Y')

    if selected_range == "YTD":
        start_date = datetime(datetime.now().year, 1, 1)
        end_date = datetime.now()
    elif selected_range == "MAX":
        start_date = datetime(2000, 1, 1)
        end_date = datetime.now()
    else:
        days_map = {"1D": 1, "1W": 7, "1M": 30, "3M": 90, "6M": 180,
                    "1Y": 365, "3Y": 1095, "5Y": 1825}
        days = days_map.get(selected_range, 365)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

    return start_date, end_date


def _error_ui(page_name, icon, e):
    """Render a consistent error UI when a handler fails."""
    import streamlit as st
    import traceback
    st.error(f"**{icon} {page_name}** failed to load: `{type(e).__name__}: {e}`")
    with st.expander("Traceback"):
        st.code(traceback.format_exc())


def _load_handler(module_path: str, func_name: str, page_name: str, icon: str):
    """Lazy-import handler — no arguments passed to render function."""
    def handler():
        try:
            import importlib
            mod = importlib.import_module(module_path)
            fn = getattr(mod, func_name)
            fn()
        except Exception as e:
            _error_ui(page_name, icon, e)
    return handler


def _load_handler_dates(module_path: str, func_name: str, page_name: str, icon: str):
    """Lazy-import handler — injects (start_date, end_date)."""
    def handler():
        try:
            import importlib
            mod = importlib.import_module(module_path)
            fn = getattr(mod, func_name)
            start_date, end_date = _get_date_range()
            fn(start_date, end_date)
        except Exception as e:
            _error_ui(page_name, icon, e)
    return handler


def _load_handler_dates_benchmark(module_path: str, func_name: str, page_name: str, icon: str):
    """Lazy-import handler — injects (start_date, end_date, benchmark)."""
    def handler():
        try:
            import streamlit as st
            import importlib
            mod = importlib.import_module(module_path)
            fn = getattr(mod, func_name)
            start_date, end_date = _get_date_range()
            benchmark = st.session_state.get('selected_benchmark', 'SPY')
            fn(start_date, end_date, benchmark)
        except Exception as e:
            _error_ui(page_name, icon, e)
    return handler


# ============================================================================
# THE REGISTRY - All 19 active pages
# ============================================================================
#
# Handler signatures (from the old if/elif chain in atlas_app.py):
#   No args:             phoenix_parser, database, market_watch, monte_carlo,
#                        market_regime, investopedia_live, equity_research,
#                        macro_intelligence, fund_research, about, r_analytics
#   (start, end):        portfolio_home, portfolio_deep_dive,
#                        multi_factor_analysis, valuation_house, leverage_tracker
#   (start, end, bench): risk_analysis, performance_suite, quant_optimizer

PAGE_REGISTRY = [
    # --- Data Input ---
    PageDefinition(
        key="phoenix_parser",
        title="Phoenix Parser",
        icon="🔥",
        handler=_load_handler("ui.pages.phoenix_parser", "render_phoenix_parser", "Phoenix Parser", "🔥"),
        category="input",
    ),

    # --- Core Portfolio ---
    PageDefinition(
        key="portfolio_home",
        title="Portfolio Home",
        icon="🏠",
        handler=_load_handler_dates("ui.pages.portfolio_home", "render_portfolio_home", "Portfolio Home", "🏠"),
        category="core",
        requires_data=["portfolio"],
    ),

    # --- System ---
    PageDefinition(
        key="database",
        title="Database",
        icon="💾",
        handler=_load_handler("ui.pages.database", "render_database", "Database", "💾"),
        category="system",
    ),

    PageDefinition(
        key="r_analytics",
        title="R Analytics",
        icon="📊",
        handler=_load_handler("ui.pages.r_analytics", "render_r_analytics", "R Analytics", "📊"),
        category="system",
        feature_flag="r_available",
    ),

    # --- Markets ---
    PageDefinition(
        key="market_watch",
        title="Market Watch",
        icon="🌍",
        handler=_load_handler("ui.pages.market_watch", "render_market_watch", "Market Watch", "🌍"),
        category="markets",
    ),

    PageDefinition(
        key="market_regime",
        title="Market Regime",
        icon="🌐",
        handler=_load_handler("ui.pages.market_regime", "render_market_regime", "Market Regime", "🌐"),
        category="markets",
    ),

    # --- Analysis ---
    PageDefinition(
        key="risk_analysis",
        title="Risk Analysis",
        icon="📈",
        handler=_load_handler_dates_benchmark("ui.pages.risk_analysis", "render_risk_analysis", "Risk Analysis", "📈"),
        category="analysis",
        requires_data=["portfolio"],
    ),

    PageDefinition(
        key="performance_suite",
        title="Performance Suite",
        icon="💎",
        handler=_load_handler_dates_benchmark("ui.pages.performance_suite", "render_performance_suite", "Performance Suite", "💎"),
        category="analysis",
        requires_data=["portfolio", "performance_history"],
    ),

    PageDefinition(
        key="portfolio_deep_dive",
        title="Portfolio Deep Dive",
        icon="🔬",
        handler=_load_handler_dates("ui.pages.portfolio_deep_dive", "render_portfolio_deep_dive", "Portfolio Deep Dive", "🔬"),
        category="analysis",
        requires_data=["portfolio"],
    ),

    PageDefinition(
        key="multi_factor_analysis",
        title="Multi-Factor Analysis",
        icon="📊",
        handler=_load_handler_dates("ui.pages.multi_factor_analysis", "render_multi_factor_analysis", "Multi-Factor Analysis", "📊"),
        category="analysis",
        requires_data=["portfolio"],
    ),

    # --- Valuation ---
    PageDefinition(
        key="valuation_house",
        title="Valuation House",
        icon="💰",
        handler=_load_handler_dates("ui.pages.valuation_house", "render_valuation_house", "Valuation House", "💰"),
        category="valuation",
    ),

    # --- Optimization & Simulation ---
    PageDefinition(
        key="monte_carlo_engine",
        title="Monte Carlo Engine",
        icon="🎲",
        handler=_load_handler("ui.pages.monte_carlo", "render_monte_carlo", "Monte Carlo Engine", "🎲"),
        category="optimization",
        requires_data=["portfolio"],
    ),

    PageDefinition(
        key="quant_optimizer",
        title="Quant Optimizer",
        icon="🧮",
        handler=_load_handler_dates_benchmark("ui.pages.quant_optimizer", "render_quant_optimizer", "Quant Optimizer", "🧮"),
        category="optimization",
        requires_data=["portfolio"],
    ),

    # --- Tracking ---
    PageDefinition(
        key="leverage_tracker",
        title="Leverage Tracker",
        icon="📊",
        handler=_load_handler_dates("ui.pages.leverage_tracker", "render_leverage_tracker", "Leverage Tracker", "📊"),
        category="tracking",
        requires_data=["portfolio", "performance_history"],
    ),

    PageDefinition(
        key="investopedia_live",
        title="Investopedia Live",
        icon="📡",
        handler=_load_handler("ui.pages.investopedia_live", "render_investopedia_live", "Investopedia Live", "📡"),
        category="tracking",
    ),

    # --- Research (v11.0 benchmark modules — DO NOT MODIFY) ---
    PageDefinition(
        key="equity_research",
        title="Equity Research",
        icon="💎",
        handler=_load_handler("ui.pages.equity_research", "render_equity_research", "Equity Research", "💎"),
        category="research",
    ),

    PageDefinition(
        key="macro_intelligence",
        title="Macro Intelligence",
        icon="🌐",
        handler=_load_handler("ui.pages.macro_intelligence", "render_macro_intelligence", "Macro Intelligence", "🌐"),
        category="research",
    ),

    PageDefinition(
        key="fund_research",
        title="Fund Research",
        icon="📚",
        handler=_load_handler("ui.pages.fund_research", "render_fund_research", "Fund Research", "📚"),
        category="research",
    ),

    # --- System ---
    PageDefinition(
        key="about",
        title="About",
        icon="ℹ️",
        handler=_load_handler("ui.pages.about", "render_about", "About", "ℹ️"),
        category="system",
    ),
]


# ============================================================================
# Registry Query Functions
# ============================================================================

def get_available_pages() -> List[PageDefinition]:
    """Get list of pages available to user."""
    return PAGE_REGISTRY


def get_page_by_key(key: str) -> Optional[PageDefinition]:
    """Look up page by key."""
    return next((p for p in PAGE_REGISTRY if p.key == key), None)


def get_pages_by_category(category: str) -> List[PageDefinition]:
    """Get all pages in a category."""
    return [p for p in PAGE_REGISTRY if p.category == category]


def get_all_categories() -> List[str]:
    """Get list of all categories."""
    return sorted(list(set(p.category for p in PAGE_REGISTRY)))
