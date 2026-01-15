"""
ATLAS UI Module
===============
Design system, components, and chart styling.

Usage:
    from ui.theme import ATLAS_COLORS, SPACING, apply_atlas_theme
    from ui.charts_professional import create_performance_chart, create_bar_chart
"""

# Theme exports
from ui.theme import (
    ATLAS_COLORS,
    CHART_COLORS,
    CHART_FILLS,
    FONTS,
    FONT_SIZES,
    FONT_WEIGHTS,
    SPACING,
    CARD_STYLE,
    CHART_LAYOUT,
    CHART_HEIGHTS,
    get_color,
    get_semantic_color,
    format_percentage,
    format_currency,
    format_large_number,
    get_atlas_css,
)

# Chart exports
from ui.charts_professional import (
    apply_atlas_theme,
    create_multi_line_chart,
    create_performance_chart,
    create_bar_chart,
    create_donut_chart,
    create_gauge_chart,
    create_waterfall_chart,
)

__all__ = [
    # Colors
    'ATLAS_COLORS',
    'CHART_COLORS',
    'CHART_FILLS',

    # Typography
    'FONTS',
    'FONT_SIZES',
    'FONT_WEIGHTS',

    # Layout
    'SPACING',
    'CARD_STYLE',
    'CHART_LAYOUT',
    'CHART_HEIGHTS',

    # Theme helpers
    'get_color',
    'get_semantic_color',
    'format_percentage',
    'format_currency',
    'format_large_number',
    'get_atlas_css',

    # Chart functions
    'apply_atlas_theme',
    'create_multi_line_chart',
    'create_performance_chart',
    'create_bar_chart',
    'create_donut_chart',
    'create_gauge_chart',
    'create_waterfall_chart',
]
