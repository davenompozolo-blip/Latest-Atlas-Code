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

# Placeholder handlers - will be replaced with actual page implementations
def _placeholder_home():
    """Placeholder for Portfolio Home - will be wired in Day 5"""
    import streamlit as st
    st.markdown("## 🏠 Portfolio Home")
    st.info("📍 Navigation skeleton active - actual page will be wired in Day 5")

def _placeholder_generic(page_name: str):
    """Generic placeholder for other pages"""
    import streamlit as st
    st.markdown(f"## {page_name}")
    st.info("📍 Navigation skeleton active - actual page will be wired in Day 5")


# THE REGISTRY
# This will be populated with all actual pages in Day 2
PAGE_REGISTRY = [
    PageDefinition(
        key="home",
        title="Portfolio Home",
        icon="🏠",
        handler=_placeholder_home,
        category="core",
        requires_data=["portfolio"]
    ),

    # More pages will be added in Day 2
    # This is just a minimal skeleton to get imports working
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
