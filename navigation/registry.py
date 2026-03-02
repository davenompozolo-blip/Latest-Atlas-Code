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
# Handler factory (single, uniform — all render functions are zero-argument)
# ============================================================================

def _error_ui(page_name, icon, e):
    """Render a consistent error UI when a handler fails."""
    import streamlit as st
    import traceback
    st.error(f"**{icon} {page_name}** failed to load: `{type(e).__name__}: {e}`")
    with st.expander("Traceback"):
        st.code(traceback.format_exc())


def _load_handler(module_path: str, func_name: str, page_name: str, icon: str):
    """Lazy-import handler — render functions read their own params from session_state."""
    def handler():
        try:
            import importlib
            mod = importlib.import_module(module_path)
            fn = getattr(mod, func_name)
            fn()
        except Exception as e:
            _error_ui(page_name, icon, e)
    return handler


# ============================================================================
# THE REGISTRY - All 19 active pages
# ============================================================================
# All render functions are zero-argument. Each reads its own parameters
# (start_date, end_date, benchmark) from st.session_state directly.

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
        handler=_load_handler("ui.pages.portfolio_home", "render_portfolio_home", "Portfolio Home", "🏠"),
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
        feature_flag="sql_available",
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
        handler=_load_handler("ui.pages.risk_analysis", "render_risk_analysis", "Risk Analysis", "📈"),
        category="analysis",
        requires_data=["portfolio"],
    ),

    PageDefinition(
        key="performance_suite",
        title="Performance Suite",
        icon="💎",
        handler=_load_handler("ui.pages.performance_suite", "render_performance_suite", "Performance Suite", "💎"),
        category="analysis",
        requires_data=["portfolio", "performance_history"],
    ),

    PageDefinition(
        key="quant_dashboard",
        title="Quant Dashboard",
        icon="⬡",
        handler=_load_handler("ui.pages.quant_dashboard", "render_quant_dashboard", "Quant Dashboard", "⬡"),
        category="analysis",
    ),

    PageDefinition(
        key="portfolio_deep_dive",
        title="Portfolio Deep Dive",
        icon="🔬",
        handler=_load_handler("ui.pages.portfolio_deep_dive", "render_portfolio_deep_dive", "Portfolio Deep Dive", "🔬"),
        category="analysis",
        requires_data=["portfolio"],
    ),

    PageDefinition(
        key="multi_factor_analysis",
        title="Multi-Factor Analysis",
        icon="📊",
        handler=_load_handler("ui.pages.multi_factor_analysis", "render_multi_factor_analysis", "Multi-Factor Analysis", "📊"),
        category="analysis",
        requires_data=["portfolio"],
    ),

    # --- Valuation ---
    PageDefinition(
        key="valuation_house",
        title="Valuation House",
        icon="💰",
        handler=_load_handler("ui.pages.valuation_house", "render_valuation_house", "Valuation House", "💰"),
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
        handler=_load_handler("ui.pages.quant_optimizer", "render_quant_optimizer", "Quant Optimizer", "🧮"),
        category="optimization",
        requires_data=["portfolio"],
    ),

    # --- Strategy ---
    PageDefinition(
        key="saa_tool",
        title="Strategic Asset Allocation",
        icon="🎯",
        handler=_load_handler("ui.pages.saa_tool", "render_saa_tool", "Strategic Asset Allocation", "🎯"),
        category="strategy",
    ),

    PageDefinition(
        key="commentary_generator",
        title="Commentary Generator",
        icon="📝",
        handler=_load_handler("ui.pages.commentary_generator", "render_commentary_generator", "Commentary Generator", "📝"),
        category="strategy",
    ),

    # --- Study (Phase 9) ---
    PageDefinition(
        key="cfa_prep",
        title="CFA Level II Prep",
        icon="📚",
        handler=_load_handler("ui.pages.cfa_prep", "render_cfa_prep", "CFA Level II Prep", "📚"),
        category="study",
    ),

    # --- Tracking ---
    PageDefinition(
        key="leverage_tracker",
        title="Leverage Tracker",
        icon="📊",
        handler=_load_handler("ui.pages.leverage_tracker", "render_leverage_tracker", "Leverage Tracker", "📊"),
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

    # --- Admin (Phase 7 B3) ---
    PageDefinition(
        key="admin_panel",
        title="Admin Panel",
        icon="⚙️",
        handler=_load_handler("ui.pages.admin_panel", "render_admin_panel", "Admin Panel", "⚙️"),
        category="admin",
    ),

    PageDefinition(
        key="analytics_dashboard",
        title="Analytics Dashboard",
        icon="📊",
        handler=_load_handler("ui.pages.analytics_dashboard", "render_analytics_dashboard", "Analytics Dashboard", "📊"),
        category="admin",
    ),
]


# ============================================================================
# Registry Query Functions
# ============================================================================

# ============================================================================
# TIER REQUIREMENTS — Two-tier model (Free + Professional)
# Pages NOT listed here are available to all tiers (including free).
# ============================================================================
TIER_REQUIREMENTS = {
    # Analysis pages — Professional
    "risk_analysis": "professional",
    "performance_suite": "professional",
    "quant_dashboard": "professional",
    "portfolio_deep_dive": "professional",
    "multi_factor_analysis": "professional",
    "monte_carlo_engine": "professional",
    "quant_optimizer": "professional",
    "leverage_tracker": "professional",
    # Research pages — Professional
    "equity_research": "professional",
    "macro_intelligence": "professional",
    "fund_research": "professional",
    # Markets — Professional (Market Watch is free)
    "market_regime": "professional",
    # Valuation — Professional
    "valuation_house": "professional",
    # Strategy — Professional
    "saa_tool": "professional",
    "commentary_generator": "professional",
    # Tracking — Professional
    "investopedia_live": "professional",
    # Admin — admin only
    "admin_panel": "admin",
    "analytics_dashboard": "admin",
    # Study — Professional
    "cfa_prep": "professional",
    # Free tier pages: phoenix_parser, portfolio_home, market_watch, about
}


def get_available_pages() -> List[PageDefinition]:
    """Get list of pages available to user, filtered by feature flags."""
    import streamlit as st
    available = []
    for page in PAGE_REGISTRY:
        if page.feature_flag:
            if not st.session_state.get(page.feature_flag, False):
                continue
        available.append(page)
    return available


def get_page_by_key(key: str) -> Optional[PageDefinition]:
    """Look up page by key."""
    return next((p for p in PAGE_REGISTRY if p.key == key), None)


def get_pages_by_category(category: str) -> List[PageDefinition]:
    """Get all pages in a category."""
    return [p for p in PAGE_REGISTRY if p.category == category]


def get_all_categories() -> List[str]:
    """Get list of all categories."""
    return sorted(list(set(p.category for p in PAGE_REGISTRY)))
