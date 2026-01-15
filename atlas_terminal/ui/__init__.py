"""
ATLAS Terminal UI Components
Phase 2 Day 1 - UI Package

This package contains UI components and navigation for ATLAS Terminal.
"""

from .navigation import (
    NavigationManager,
    Page,
    get_navigation_manager,
    render_navigation,
    reset_navigation
)

__all__ = [
    'NavigationManager',
    'Page',
    'get_navigation_manager',
    'render_navigation',
    'reset_navigation'
]
