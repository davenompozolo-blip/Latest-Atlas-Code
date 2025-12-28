"""
Easy Equities Enrichment Package for ATLAS Terminal

This package provides data enrichment, simulation, and availability
detection for Easy Equities portfolios.
"""

from .yahoo_finance_enricher import (
    enrich_portfolio,
    enrich_single_ticker,
    ensure_portfolio_enriched,
    get_enriched_data_for_module,
    get_sector_allocation,
    get_concentration_metrics,
    convert_ee_ticker_to_yahoo,
    get_display_ticker
)

from .daily_snapshot import (
    create_snapshot,
    save_snapshot,
    load_all_snapshots,
    load_snapshots_range,
    get_snapshot_stats,
    auto_snapshot_on_sync,
    calculate_performance_from_snapshots,
    get_performance_summary
)

from .data_availability import (
    detect_data_availability,
    DataAvailability,
    DataSource,
    DataQuality,
    render_data_availability_banner,
    render_module_availability_card,
    can_run_risk_analytics,
    can_run_performance_suite,
    can_run_monte_carlo,
    can_run_optimizer
)

from .portfolio_simulator import (
    simulate_portfolio_returns,
    simulate_benchmark_comparison,
    calculate_period_returns,
    get_simulation_disclaimer,
    render_simulation_warning
)

__all__ = [
    # Yahoo Finance Enricher
    'enrich_portfolio',
    'enrich_single_ticker',
    'ensure_portfolio_enriched',
    'get_enriched_data_for_module',
    'get_sector_allocation',
    'get_concentration_metrics',
    'convert_ee_ticker_to_yahoo',
    'get_display_ticker',

    # Daily Snapshot
    'create_snapshot',
    'save_snapshot',
    'load_all_snapshots',
    'load_snapshots_range',
    'get_snapshot_stats',
    'auto_snapshot_on_sync',
    'calculate_performance_from_snapshots',
    'get_performance_summary',

    # Data Availability
    'detect_data_availability',
    'DataAvailability',
    'DataSource',
    'DataQuality',
    'render_data_availability_banner',
    'render_module_availability_card',
    'can_run_risk_analytics',
    'can_run_performance_suite',
    'can_run_monte_carlo',
    'can_run_optimizer',

    # Portfolio Simulator
    'simulate_portfolio_returns',
    'simulate_benchmark_comparison',
    'calculate_period_returns',
    'get_simulation_disclaimer',
    'render_simulation_warning'
]
