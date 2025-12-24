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
from .leverage_tracker import render_leverage_tracker_page
from .phoenix_parser import render_phoenix_parser_page
from .r_analytics import render_r_analytics_page
from .v10_analytics import render_v10_analytics_page
from .portfolio_home import render_portfolio_home_page
from .risk_analysis import render_risk_analysis_page
from .performance_suite import render_performance_suite_page
from .portfolio_deep_dive import render_portfolio_deep_dive_page
from .valuation_house import render_valuation_house_page

__all__ = [
    'render_about_page',
    'render_market_watch_page',
    'render_database_page',
    'render_investopedia_live_page',
    'render_multi_factor_analysis_page',
    'render_monte_carlo_engine_page',
    'render_quant_optimizer_page',
    'render_leverage_tracker_page',
    'render_phoenix_parser_page',
    'render_r_analytics_page',
    'render_v10_analytics_page',
    'render_portfolio_home_page',
    'render_risk_analysis_page',
    'render_performance_suite_page',
    'render_portfolio_deep_dive_page',
    'render_valuation_house_page'
]
