"""
Page Handlers Package

Contains modular, extracted page rendering functions.

Phase 2B: Gradual extraction of pages from atlas_app.py into standalone handlers.
"""

from .about import render_about_page
from .market_watch import render_market_watch_page
from .database import render_database_page
from .investopedia_live import render_investopedia_live_page

__all__ = ['render_about_page', 'render_market_watch_page', 'render_database_page', 'render_investopedia_live_page']
