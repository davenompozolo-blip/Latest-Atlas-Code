"""
ATLAS Terminal Core Constants
Extracted from atlas_app.py (24,258 lines) for modular architecture.

This file is the single source of truth for all shared constants,
feature flags, and configuration that multiple core modules need.
"""

import pandas as pd
from pathlib import Path

# ============================================================================
# FEATURE FLAGS - Try/except patterns from monolith
# ============================================================================

# REFACTORED MODULES (monolith lines 256-265)
try:
    from atlas_terminal.core.cache_manager import cached, cache_manager
    from atlas_terminal.core.error_handler import safe_execute, ErrorHandler
    from atlas_terminal.data.fetchers.market_data import market_data
    REFACTORED_MODULES_AVAILABLE = True
except ImportError:
    REFACTORED_MODULES_AVAILABLE = False
    market_data = None
    ErrorHandler = None
    cache_manager = None
    cached = None
    safe_execute = None

# SQL DATA LAYER (monolith lines 153-159)
try:
    from data.atlas_db import get_db
    SQL_AVAILABLE = True
except ImportError:
    SQL_AVAILABLE = False
    def get_db():
        return None

# BROKER MANAGER (monolith lines 106-113)
try:
    from atlas_broker_manager import BrokerManager, ManualPortfolioAdapter
    BROKER_MANAGER_AVAILABLE = True
except ImportError:
    BROKER_MANAGER_AVAILABLE = False
    BrokerManager = None
    ManualPortfolioAdapter = None

# PROFESSIONAL THEME (monolith lines 101-124)
try:
    from ui.theme import (
        ATLAS_COLORS as PROFESSIONAL_COLORS,
        CHART_COLORS as PROFESSIONAL_CHART_COLORS,
        CHART_FILLS,
        FONTS,
        SPACING,
        CHART_LAYOUT,
        get_color,
        get_semantic_color,
        format_percentage as fmt_pct,
        format_currency as fmt_curr,
    )
    from ui.charts_professional import (
        apply_atlas_theme as apply_professional_theme,
        create_performance_chart as create_pro_performance_chart,
        create_bar_chart as create_pro_bar_chart,
        create_donut_chart as create_pro_donut_chart,
        create_gauge_chart as create_pro_gauge_chart,
    )
    PROFESSIONAL_THEME_AVAILABLE = True
except ImportError:
    PROFESSIONAL_THEME_AVAILABLE = False
    PROFESSIONAL_CHART_COLORS = [
        '#818cf8', '#00E676', '#7C4DFF', '#FF9100',
        '#FF1744', '#1DE9B6', '#FF4081', '#FFC400',
    ]

# ============================================================================
# VALUATION CONSTRAINTS (monolith line 578)
# ============================================================================
VALUATION_CONSTRAINTS = {
    'max_terminal_growth': 0.04,
    'max_payout_ratio': 1.0,
    'min_roe': 0.0,
    'max_roe': 0.50,
    'max_pe_multiple': 100,
    'min_pe_multiple': 3,
}

# ============================================================================
# EXPERT WISDOM RULES (monolith line 727)
# ============================================================================
EXPERT_WISDOM_RULES = {
    'single_stock_concentration': {
        'name': 'Single Stock Concentration',
        'description': 'No single stock should exceed 25% of portfolio',
        'threshold': 0.25,
        'severity': 'high',
        'recommendation': 'Consider reducing position to improve diversification'
    },
    'top_3_concentration': {
        'name': 'Top 3 Concentration',
        'description': 'Top 3 holdings should not exceed 50% of portfolio',
        'threshold': 0.50,
        'severity': 'medium',
        'recommendation': 'Portfolio may be too concentrated in a few names'
    },
    'sector_concentration': {
        'name': 'Sector Concentration',
        'description': 'Single sector should not exceed 35% of portfolio',
        'threshold': 0.35,
        'severity': 'medium',
        'recommendation': 'Consider diversifying across more sectors'
    },
    'minimum_diversification': {
        'name': 'Minimum Diversification',
        'description': 'Portfolio should have at least 10 meaningful positions',
        'threshold': 10,
        'severity': 'medium',
        'recommendation': 'Add more positions to improve diversification'
    },
    'tiny_position_warning': {
        'name': 'Tiny Positions',
        'description': 'Positions below 1% may not be worth the tracking effort',
        'threshold': 0.01,
        'severity': 'low',
        'recommendation': 'Consider eliminating or building up tiny positions'
    },
    'high_volatility_exposure': {
        'name': 'High Volatility Exposure',
        'description': 'High-volatility stocks (>40% annualized) should have reduced weight',
        'threshold': 0.40,
        'severity': 'medium',
        'recommendation': 'Consider reducing exposure to highly volatile names'
    },
    'correlation_cluster': {
        'name': 'Correlation Cluster',
        'description': 'Avoid having too many highly correlated positions',
        'threshold': 0.80,
        'severity': 'medium',
        'recommendation': 'Positions are highly correlated - diversification benefit is limited'
    }
}
