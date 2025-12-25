"""
ATLAS Terminal - UI Components Package
Phase 2 Day 5 - Reusable Component Library
Phase 1B - Sidebar Navigation Component
Phase 2A - Badge Pills & Enhanced Components

Centralized UI components for charts, metrics, tables, navigation, and badges.
"""

# Navigation Module (Phase 1B)
from .sidebar_nav import render_sidebar_navigation

# Badge Module (Phase 2A)
from .badges import (
    badge,
    render_badge,
    badge_group,
    BadgeType,
    BadgeSize
)

# Tables Module
from .tables import (
    make_scrollable_table,
    style_holdings_dataframe,
    style_holdings_dataframe_with_optimization,
    add_arrow_indicator,
    format_percentage,
    format_currency
)

# Metrics Module
from .metrics import (
    ATLASFormatter,
    create_risk_snapshot,
    create_signal_health_badge,
    calculate_signal_health,
    create_skill_assessment_card,
    create_performance_dashboard,
    is_valid_series,
    apply_chart_theme as apply_chart_theme_metrics,
    COLORS as COLORS_METRICS
)

# Charts Module
from .charts import (
    # Attribution Charts
    create_pnl_attribution_sector,
    create_pnl_attribution_position,
    create_brinson_attribution_chart,
    create_sector_attribution_table,
    create_holdings_attribution_waterfall,
    create_factor_attribution_table,

    # Performance Charts
    create_interactive_performance_chart,
    create_rolling_metrics_chart,
    create_underwater_plot,
    create_performance_heatmap,
    create_portfolio_heatmap,

    # Risk Charts
    create_rolling_var_cvar_chart,
    create_risk_reward_plot,
    create_monte_carlo_chart,

    # Sector/Factor Charts
    create_sector_rotation_heatmap,
    create_factor_momentum_chart,

    # Valuation Charts
    create_cash_flow_chart,

    # Contributor Charts
    create_top_contributors_chart,
    create_top_detractors_chart,

    # Utilities
    apply_chart_theme,
    format_percentage as format_percentage_charts,
    COLORS,
    CHART_HEIGHT_COMPACT,
    CHART_HEIGHT_STANDARD,
    CHART_HEIGHT_LARGE,
    CHART_HEIGHT_DEEP_DIVE
)

__all__ = [
    # Navigation (Phase 1B)
    'render_sidebar_navigation',

    # Badges (Phase 2A)
    'badge',
    'render_badge',
    'badge_group',
    'BadgeType',
    'BadgeSize',

    # Tables
    'make_scrollable_table',
    'style_holdings_dataframe',
    'style_holdings_dataframe_with_optimization',
    'add_arrow_indicator',
    'format_percentage',
    'format_currency',

    # Metrics
    'ATLASFormatter',
    'create_risk_snapshot',
    'create_signal_health_badge',
    'calculate_signal_health',
    'create_skill_assessment_card',
    'create_performance_dashboard',
    'is_valid_series',

    # Attribution Charts
    'create_pnl_attribution_sector',
    'create_pnl_attribution_position',
    'create_brinson_attribution_chart',
    'create_sector_attribution_table',
    'create_holdings_attribution_waterfall',
    'create_factor_attribution_table',

    # Performance Charts
    'create_interactive_performance_chart',
    'create_rolling_metrics_chart',
    'create_underwater_plot',
    'create_performance_heatmap',
    'create_portfolio_heatmap',

    # Risk Charts
    'create_rolling_var_cvar_chart',
    'create_risk_reward_plot',
    'create_monte_carlo_chart',

    # Sector/Factor Charts
    'create_sector_rotation_heatmap',
    'create_factor_momentum_chart',

    # Valuation Charts
    'create_cash_flow_chart',

    # Contributor Charts
    'create_top_contributors_chart',
    'create_top_detractors_chart',

    # Utilities
    'apply_chart_theme',
    'COLORS',
    'CHART_HEIGHT_COMPACT',
    'CHART_HEIGHT_STANDARD',
    'CHART_HEIGHT_LARGE',
    'CHART_HEIGHT_DEEP_DIVE'
]
