"""
ATLAS Core Module
Exports all shared functions for use by page modules.
This breaks the circular import cycle with atlas_app.py.
"""

# Shared constants and feature flags (must be first - other modules depend on these)
from .constants import (
    REFACTORED_MODULES_AVAILABLE, SQL_AVAILABLE, BROKER_MANAGER_AVAILABLE,
    market_data, ErrorHandler, cache_manager, cached, safe_execute,
    get_db, ManualPortfolioAdapter, BrokerManager,
    PROFESSIONAL_THEME_AVAILABLE, PROFESSIONAL_CHART_COLORS,
    VALUATION_CONSTRAINTS, EXPERT_WISDOM_RULES,
)

# Data Loading Functions
from .data_loading import (
    load_portfolio_data,
    save_portfolio_data,
    load_trade_history,
    save_trade_history,
    load_account_history,
    save_account_history,
    parse_trade_history_file,
    parse_account_history_file,
    get_current_portfolio_metrics,
    get_portfolio_period_return,
    get_benchmark_period_return,
    get_gics_sector,
    get_portfolio_gics_sectors,
    get_spy_sector_weights,
    get_benchmark_sector_returns,
    get_data_freshness,
    get_portfolio_from_broker_or_legacy,
    validate_portfolio_data,
    get_leverage_info,
    is_option_ticker,
    classify_ticker_sector,
    init_watchlist,
    add_to_watchlist,
    remove_from_watchlist,
    save_watchlist,
    get_watchlist,
    is_valid_series,
    is_valid_dataframe,
    ATLASFormatter,
)

# Calculation Functions
from .calculations import (
    calculate_portfolio_returns,
    calculate_performance_metrics,
    calculate_signal_health,
    calculate_forward_rates,
    calculate_smart_assumptions,
    calculate_wacc,
    calculate_cost_of_equity,
    calculate_terminal_value,
    calculate_dcf_value,
    calculate_gordon_growth_ddm,
    calculate_multistage_ddm,
    calculate_residual_income,
    calculate_peer_multiples,
    calculate_sotp_valuation,
    calculate_consensus_valuation,
    calculate_skill_score,
    calculate_brinson_attribution_gics,
    calculate_brinson_attribution,
    calculate_benchmark_returns,
    calculate_quality_score,
    calculate_sharpe_ratio,
    calculate_sortino_ratio,
    calculate_information_ratio,
    calculate_var,
    calculate_cvar,
    calculate_historical_stress_test,
    calculate_risk_adjusted_limits,
    calculate_var_cvar_portfolio_optimization,
    calculate_max_risk_contrib,
    calculate_performance_metric,
    calculate_portfolio_max_drawdown,
    calculate_max_risk_contrib_pct,
    calculate_max_drawdown,
    calculate_calmar_ratio,
    calculate_portfolio_correlations,
    calculate_factor_exposures,
    calculate_portfolio_from_trades,
    project_fcff_enhanced,
    project_fcfe_enhanced,
    apply_relative_valuation,
)

# Chart Functions
from .charts import (
    create_enhanced_holdings_table,
    create_risk_snapshot,
    create_signal_health_badge,
    create_pnl_attribution_sector,
    create_pnl_attribution_position,
    create_sparkline,
    create_yield_curve,
    create_yield_curve_with_forwards,
    create_valuation_summary_table,
    create_brinson_attribution_chart,
    create_skill_assessment_card,
    create_sector_attribution_table,
    create_top_contributors_chart,
    create_top_detractors_chart,
    create_sector_allocation_donut,
    create_professional_sector_allocation_pie,
    create_professional_sector_allocation_bar,
    create_rolling_metrics_chart,
    create_underwater_plot,
    create_var_waterfall,
    create_var_cvar_distribution,
    create_rolling_var_cvar_chart,
    create_risk_contribution_sunburst,
    create_risk_reward_plot,
    create_performance_heatmap,
    create_portfolio_heatmap,
    create_interactive_performance_chart,
    create_monte_carlo_chart,
    create_risk_parity_analysis,
    create_drawdown_distribution,
    create_correlation_network,
    create_efficient_frontier,
    create_dynamic_market_table,
    create_sector_rotation_heatmap,
    create_holdings_attribution_waterfall,
    create_concentration_gauge,
    create_concentration_analysis,
    create_factor_momentum_chart,
    create_factor_exposure_radar,
    # Additional functions for page modules
    make_scrollable_table,
    show_toast,
    style_holdings_dataframe,
    style_holdings_dataframe_with_optimization,
    should_display_monthly_heatmap,
    apply_chart_theme,
)

# Fetcher Functions
from .fetchers import *

# Optimizer Functions
from .optimizers import *

# TradingView Charts (optional — graceful if not installed)
try:
    from .tradingview_charts import (
        render_candlestick_chart,
        render_candlestick_with_indicators,
        render_line_chart,
        render_multi_series_chart,
        create_tradingview_chart,
        is_tradingview_available,
        TRADINGVIEW_AVAILABLE,
    )
except ImportError:
    TRADINGVIEW_AVAILABLE = False
    def render_candlestick_with_indicators(*args, **kwargs): pass
