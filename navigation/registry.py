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

# Import real page handlers (gradual migration from placeholders)
try:
    from .handlers import (
        render_about_page,
        render_market_watch_page,
        render_database_page,
        render_investopedia_live_page,
        render_multi_factor_analysis_page,
        render_monte_carlo_engine_page,
        render_quant_optimizer_page
    )
    HANDLERS_AVAILABLE = True
except ImportError:
    HANDLERS_AVAILABLE = False
    render_about_page = None
    render_market_watch_page = None
    render_database_page = None
    render_investopedia_live_page = None
    render_multi_factor_analysis_page = None
    render_monte_carlo_engine_page = None
    render_quant_optimizer_page = None

@dataclass
class PageDefinition:
    """
    Everything you need to know about a page.

    This is a data class, not a framework.
    It's just a structured way to describe a page.

    Fields:
        key: Unique identifier (internal, e.g., "home")
        title: Display name (shown in UI, e.g., "Portfolio Home")
        icon: Emoji for navigation (e.g., "🏠")
        handler: Function that renders the page
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
        """Ensure requires_data is always a list, never None."""
        if self.requires_data is None:
            self.requires_data = []


# ============================================================================
# THE REGISTRY - All pages in one place
# ============================================================================

# Placeholder handlers - will be wired to actual implementations in Day 5
# These are minimal stubs that render a placeholder message

def _make_placeholder(page_name: str, icon: str):
    """Factory function to create placeholder handlers"""
    def handler():
        import streamlit as st
        st.markdown(f"## {icon} {page_name}")
        st.info(f"📍 **Navigation v2.0 Active**\n\nThis page ({page_name}) will be fully wired in Day 5 integration phase.")
        st.markdown("""
        **Current Status:**
        - ✅ Page registered in navigation
        - ✅ Routing working
        - ⏳ Actual implementation pending

        **What's Working:**
        - Navigation structure
        - Page selection
        - Routing system
        """)
    return handler


# THE REGISTRY - COMPLETE LIST OF ALL ATLAS PAGES
#
# This is the single source of truth for navigation.
# Order matches current atlas_app.py horizontal nav bar.
#
# To add a new page:
# 1. Add a PageDefinition here
# 2. That's it! (handler will be wired in Day 5)

PAGE_REGISTRY = [
    # Data Input Pages
    PageDefinition(
        key="phoenix_parser",
        title="Phoenix Parser",
        icon="🔥",
        handler=_make_placeholder("Phoenix Parser", "🔥"),
        category="input",
        requires_data=[]  # No prerequisites
    ),

    # Core Portfolio Pages
    PageDefinition(
        key="portfolio_home",
        title="Portfolio Home",
        icon="🏠",
        handler=_make_placeholder("Portfolio Home", "🏠"),
        category="core",
        requires_data=["portfolio"]
    ),

    # Analytics Pages
    PageDefinition(
        key="v10_analytics",
        title="v10.0 Analytics",
        icon="🚀",
        handler=_make_placeholder("v10.0 Analytics", "🚀"),
        category="analytics",
        requires_data=["portfolio"]
    ),

    PageDefinition(
        key="r_analytics",
        title="R Analytics",
        icon="📊",
        handler=_make_placeholder("R Analytics", "📊"),
        category="analytics",
        feature_flag="r_integration",  # May require R installation
        requires_data=["portfolio"]
    ),

    # Database Page
    PageDefinition(
        key="database",
        title="Database",
        icon="💾",
        handler=render_database_page,
        category="system",
        requires_data=[]  # Shows database contents
    ),

    # Market Pages
    PageDefinition(
        key="market_watch",
        title="Market Watch",
        icon="🌍",
        handler=render_market_watch_page,
        category="markets",
        requires_data=[]  # Market data only
    ),

    # Analysis Pages
    PageDefinition(
        key="risk_analysis",
        title="Risk Analysis",
        icon="📈",
        handler=_make_placeholder("Risk Analysis", "📈"),
        category="analysis",
        requires_data=["portfolio"]
    ),

    PageDefinition(
        key="performance_suite",
        title="Performance Suite",
        icon="💎",
        handler=_make_placeholder("Performance Suite", "💎"),
        category="analysis",
        requires_data=["portfolio", "performance_history"]
    ),

    PageDefinition(
        key="portfolio_deep_dive",
        title="Portfolio Deep Dive",
        icon="🔬",
        handler=_make_placeholder("Portfolio Deep Dive", "🔬"),
        category="analysis",
        requires_data=["portfolio"]
    ),

    PageDefinition(
        key="multi_factor_analysis",
        title="Multi-Factor Analysis",
        icon="📊",
        handler=render_multi_factor_analysis_page,
        category="analysis",
        requires_data=["portfolio"]
    ),

    # Valuation Pages
    PageDefinition(
        key="valuation_house",
        title="Valuation House",
        icon="💰",
        handler=_make_placeholder("Valuation House", "💰"),
        category="valuation",
        requires_data=[]  # Self-contained
    ),

    # Optimization & Simulation Pages
    PageDefinition(
        key="monte_carlo_engine",
        title="Monte Carlo Engine",
        icon="🎲",
        handler=render_monte_carlo_engine_page,
        category="optimization",
        requires_data=["portfolio"]
    ),

    PageDefinition(
        key="quant_optimizer",
        title="Quant Optimizer",
        icon="🧮",
        handler=render_quant_optimizer_page,
        category="optimization",
        requires_data=["portfolio"]
    ),

    # Tracking Pages
    PageDefinition(
        key="leverage_tracker",
        title="Leverage Tracker",
        icon="📊",
        handler=_make_placeholder("Leverage Tracker", "📊"),
        category="tracking",
        requires_data=["portfolio", "performance_history"]
    ),

    PageDefinition(
        key="investopedia_live",
        title="Investopedia Live",
        icon="📡",
        handler=render_investopedia_live_page,
        category="tracking",
        feature_flag="investopedia_api",  # May require API
        requires_data=[]
    ),

    # System Pages
    PageDefinition(
        key="about",
        title="About",
        icon="ℹ️",
        handler=render_about_page if HANDLERS_AVAILABLE and render_about_page else _make_placeholder("About", "ℹ️"),
        category="system",
        requires_data=[]  # Static content
    ),
]


# ============================================================================
# Registry Query Functions
# ============================================================================

def get_available_pages() -> List[PageDefinition]:
    """
    Get list of pages available to user.

    Filters by:
    - Feature flags (future)
    - Data requirements (future)
    - User permissions (future)

    Returns:
        List of PageDefinition objects that should be shown
    """
    # For now, return all pages
    # Filtering logic will be added in Day 2
    return PAGE_REGISTRY


def get_page_by_key(key: str) -> Optional[PageDefinition]:
    """
    Look up page by key.

    Args:
        key: Page key (e.g., "home", "market_watch")

    Returns:
        PageDefinition if found, None otherwise
    """
    return next((p for p in PAGE_REGISTRY if p.key == key), None)


def get_pages_by_category(category: str) -> List[PageDefinition]:
    """
    Get all pages in a category.

    Useful for grouped navigation.

    Args:
        category: Category name (e.g., "core", "analysis")

    Returns:
        List of pages in that category
    """
    return [p for p in PAGE_REGISTRY if p.category == category]


def get_all_categories() -> List[str]:
    """
    Get list of all categories.

    Useful for building navigation UI.

    Returns:
        Sorted list of unique category names
    """
    return sorted(list(set(p.category for p in PAGE_REGISTRY)))
