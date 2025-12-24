"""
Page Handlers Package

Contains modular, extracted page rendering functions.

Phase 2B: Gradual extraction of pages from atlas_app.py into standalone handlers.
"""

from .about import render_about_page
from .market_watch import render_market_watch_page
from .database import render_database_page
from .investopedia_live import render_investopedia_live_page
from .multi_factor_analysis import render_multi_factor_analysis_page
from .monte_carlo_engine import render_monte_carlo_engine_page
from .quant_optimizer import render_quant_optimizer_page

__all__ = [
    'render_about_page',
    'render_market_watch_page',
    'render_database_page',
    'render_investopedia_live_page',
    'render_multi_factor_analysis_page',
    'render_monte_carlo_engine_page',
    'render_quant_optimizer_page'
]
