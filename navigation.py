"""
ATLAS Terminal - Navigation Registry
Phase 2A - Modular Page Registration System

Provides page registry and routing for the new navigation system.
This module is imported by atlas_app.py at line 68.

Created: December 2024
Phase: 2A - Navigation Transformation
"""

import streamlit as st
from typing import Dict, Callable, Optional, Any
from dataclasses import dataclass, field


@dataclass
class PageInfo:
    """Information about a registered page"""
    key: str
    title: str
    icon: str
    render_func: Callable
    category: str = "General"
    description: str = ""


# Global page registry
PAGE_REGISTRY: Dict[str, PageInfo] = {}


def register_page(
    key: str,
    title: str,
    icon: str,
    render_func: Callable,
    category: str = "General",
    description: str = ""
) -> None:
    """
    Register a page in the navigation system.

    Args:
        key: Unique page key (used for routing)
        title: Display title for the page
        icon: Emoji icon for the page
        render_func: Function to render the page content
        category: Category for grouping pages
        description: Optional description
    """
    PAGE_REGISTRY[key] = PageInfo(
        key=key,
        title=title,
        icon=icon,
        render_func=render_func,
        category=category,
        description=description
    )


def get_page_by_key(key: str) -> Optional[PageInfo]:
    """
    Get page info by key.

    Args:
        key: Page key to look up

    Returns:
        PageInfo if found, None otherwise
    """
    return PAGE_REGISTRY.get(key)


def route_to_page(page_key: str) -> None:
    """
    Route to and render a page by its key.

    Args:
        page_key: Key of the page to render
    """
    page = get_page_by_key(page_key)

    if page is None:
        st.error(f"Page not found: {page_key}")
        st.info(f"Available pages: {', '.join(PAGE_REGISTRY.keys())}")
        return

    try:
        page.render_func()
    except Exception as e:
        st.error(f"Error rendering page '{page_key}': {str(e)}")
        st.exception(e)


def list_pages() -> list:
    """Get list of all registered page keys"""
    return list(PAGE_REGISTRY.keys())


def list_pages_by_category() -> Dict[str, list]:
    """Get pages grouped by category"""
    categories: Dict[str, list] = {}
    for key, page in PAGE_REGISTRY.items():
        if page.category not in categories:
            categories[page.category] = []
        categories[page.category].append(key)
    return categories


def clear_registry() -> None:
    """Clear the page registry (useful for testing)"""
    PAGE_REGISTRY.clear()
