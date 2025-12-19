"""
ATLAS Navigation Subsystem

Responsibilities:
- Define what pages exist (registry.py)
- Route to pages (router.py)
- Render navigation UI (sidebar.py)

This is the single source of truth for application navigation.

Design Philosophy:
- Declarative over imperative
- Data over code
- Simple over clever

Adding a new page = adding one entry to PAGE_REGISTRY.
That's it.
"""

from .registry import (
    PAGE_REGISTRY,
    get_available_pages,
    get_page_by_key,
    get_pages_by_category,
    get_all_categories
)
from .router import route_to_page
from .sidebar import render_sidebar

__all__ = [
    'PAGE_REGISTRY',
    'get_available_pages',
    'get_page_by_key',
    'get_pages_by_category',
    'get_all_categories',
    'route_to_page',
    'render_sidebar'
]

__version__ = '2.0.0-alpha'
