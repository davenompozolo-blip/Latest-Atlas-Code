"""
Data Availability Detection System for ATLAS Modules

This module provides a unified way for ATLAS modules to check what
data is available and adapt their behavior accordingly.

Author: ATLAS Terminal
Version: 1.0.0
"""

import streamlit as st
import pandas as pd
from typing import Dict, List, Optional, NamedTuple
from dataclasses import dataclass
from enum import Enum


# =============================================================================
# DATA SOURCE ENUMERATION
# =============================================================================

class DataSource(Enum):
    """Enumeration of possible data sources."""
    MANUAL_UPLOAD = "manual_upload"       # Excel/CSV upload with full trade history
    EASY_EQUITIES = "easy_equities"       # EE API sync (snapshot only)
    PHOENIX_PARSER = "phoenix_parser"     # Parsed from broker statements
    UNKNOWN = "unknown"


class DataQuality(Enum):
    """Data quality/completeness levels."""
    FULL = "full"           # All data available (trade history, performance series)
    ENRICHED = "enriched"   # Snapshot + Yahoo Finance enrichment
    SNAPSHOT = "snapshot"   # EE snapshot only
    SIMULATED = "simulated" # Simulated/synthetic data
    NONE = "none"           # No data available


# =============================================================================
# AVAILABILITY RESULT
# =============================================================================

@dataclass
class DataAvailability:
    """Container for data availability information."""

    # Source Information
    source: DataSource
    has_portfolio: bool

    # Specific Data Points
    has_trade_history: bool
    has_performance_series: bool
    has_leverage_data: bool
    has_cash_data: bool
    has_enrichment: bool
    has_snapshots: bool

    # Counts
    position_count: int
    trade_count: int
    snapshot_days: int

    # Quality Assessment
    data_quality: DataQuality

    # Module Recommendations
    recommended_modules: List[str]
    limited_modules: List[str]
    unavailable_modules: List[str]

    def to_dict(self) -> Dict:
        """Convert to dictionary for display."""
        return {
            'source': self.source.value,
            'has_portfolio': self.has_portfolio,
            'has_trade_history': self.has_trade_history,
            'has_performance_series': self.has_performance_series,
            'has_leverage_data': self.has_leverage_data,
            'has_cash_data': self.has_cash_data,
            'has_enrichment': self.has_enrichment,
            'has_snapshots': self.has_snapshots,
            'position_count': self.position_count,
            'trade_count': self.trade_count,
            'snapshot_days': self.snapshot_days,
            'data_quality': self.data_quality.value
        }


# =============================================================================
# MAIN DETECTION FUNCTION
# =============================================================================

def detect_data_availability() -> DataAvailability:
    """
    Detect what data is available for the current portfolio.

    This is the main entry point. Call this at the start of any
    module that needs to adapt its behavior based on available data.

    Returns:
    --------
    DataAvailability
        Comprehensive data availability information
    """
    # Import here to avoid circular imports
    from .daily_snapshot import get_snapshot_stats

    # Initialize defaults
    source = DataSource.UNKNOWN
    has_portfolio = False
    has_trade_history = False
    has_performance_series = False
    has_leverage_data = False
    has_cash_data = False
    has_enrichment = False
    has_snapshots = False
    position_count = 0
    trade_count = 0
    snapshot_days = 0

    # Check portfolio data
    if 'portfolio_df' in st.session_state and st.session_state['portfolio_df'] is not None:
        df = st.session_state['portfolio_df']
        if isinstance(df, pd.DataFrame) and len(df) > 0:
            has_portfolio = True
            position_count = len(df)

    # Determine source
    portfolio_source = st.session_state.get('portfolio_source', 'unknown')
    if portfolio_source == 'easy_equities':
        source = DataSource.EASY_EQUITIES
    elif portfolio_source == 'phoenix_parser':
        source = DataSource.PHOENIX_PARSER
    elif portfolio_source == 'manual_upload':
        source = DataSource.MANUAL_UPLOAD

    # Check trade history
    if 'trade_history_df' in st.session_state:
        trade_df = st.session_state['trade_history_df']
        if isinstance(trade_df, pd.DataFrame) and len(trade_df) > 0:
            has_trade_history = True
            trade_count = len(trade_df)

    # Check performance/leverage tracker
    if 'leverage_tracker' in st.session_state and st.session_state['leverage_tracker'] is not None:
        tracker = st.session_state['leverage_tracker']
        if hasattr(tracker, 'leverage_history') and tracker.leverage_history is not None:
            has_performance_series = True
            has_leverage_data = True

    # Check for cash data
    if 'cash_balance' in st.session_state or has_leverage_data:
        has_cash_data = True

    # Check enrichment
    if 'enrichment_data' in st.session_state:
        has_enrichment = True

    # Check snapshots
    snapshot_stats = get_snapshot_stats()
    if snapshot_stats.get('has_data', False):
        has_snapshots = True
        snapshot_days = snapshot_stats.get('snapshot_count', 0)

    # Determine data quality
    if has_trade_history and has_performance_series:
        data_quality = DataQuality.FULL
    elif has_enrichment or has_snapshots:
        data_quality = DataQuality.ENRICHED
    elif has_portfolio:
        data_quality = DataQuality.SNAPSHOT
    else:
        data_quality = DataQuality.NONE

    # Determine module availability
    recommended, limited, unavailable = _classify_modules(
        source=source,
        has_trade_history=has_trade_history,
        has_performance_series=has_performance_series,
        has_enrichment=has_enrichment,
        has_snapshots=has_snapshots,
        snapshot_days=snapshot_days
    )

    return DataAvailability(
        source=source,
        has_portfolio=has_portfolio,
        has_trade_history=has_trade_history,
        has_performance_series=has_performance_series,
        has_leverage_data=has_leverage_data,
        has_cash_data=has_cash_data,
        has_enrichment=has_enrichment,
        has_snapshots=has_snapshots,
        position_count=position_count,
        trade_count=trade_count,
        snapshot_days=snapshot_days,
        data_quality=data_quality,
        recommended_modules=recommended,
        limited_modules=limited,
        unavailable_modules=unavailable
    )


def _classify_modules(source: DataSource,
                      has_trade_history: bool,
                      has_performance_series: bool,
                      has_enrichment: bool,
                      has_snapshots: bool,
                      snapshot_days: int) -> tuple:
    """Classify modules by availability."""

    recommended = []
    limited = []
    unavailable = []

    # Portfolio Home - always available
    recommended.append("Portfolio Home")

    # DCF Valuation - always available (uses Yahoo Finance)
    recommended.append("DCF Valuation")

    # Portfolio Deep Dive
    if has_enrichment:
        recommended.append("Portfolio Deep Dive")
    else:
        limited.append("Portfolio Deep Dive")

    # Risk Analytics
    if has_enrichment:
        recommended.append("Risk Analytics")
    elif source == DataSource.EASY_EQUITIES:
        limited.append("Risk Analytics")
    else:
        unavailable.append("Risk Analytics")

    # Monte Carlo
    if has_enrichment:
        recommended.append("Monte Carlo")
    else:
        limited.append("Monte Carlo")

    # Quant Optimizer
    if has_enrichment:
        recommended.append("Quant Optimizer")
    else:
        limited.append("Quant Optimizer")

    # Performance Suite
    if has_performance_series:
        recommended.append("Performance Suite")
    elif has_snapshots and snapshot_days >= 30:
        limited.append("Performance Suite")
    else:
        unavailable.append("Performance Suite")

    # Brinson Attribution
    if has_trade_history and has_performance_series:
        recommended.append("Brinson Attribution")
    elif has_enrichment:
        limited.append("Brinson Attribution")
    else:
        unavailable.append("Brinson Attribution")

    return recommended, limited, unavailable


# =============================================================================
# UI HELPER FUNCTIONS
# =============================================================================

def render_data_availability_banner(availability: DataAvailability):
    """
    Render a banner showing data availability status.

    Call this at the top of modules to inform users about data limitations.
    """
    if availability.source == DataSource.EASY_EQUITIES:
        if availability.has_enrichment:
            st.info(
                "**Easy Equities Portfolio** - Enriched with Yahoo Finance data. "
                "Some metrics are simulated based on historical prices (assuming static holdings)."
            )
        else:
            st.warning(
                "**Easy Equities Portfolio** - Snapshot data only. "
                "Click 'Enrich Portfolio' to unlock additional analytics."
            )

    if availability.data_quality == DataQuality.SIMULATED:
        st.warning(
            "**Simulated Data** - Performance metrics assume static holdings over the lookback period. "
            "Actual results may differ based on when positions were opened/closed."
        )


def render_module_availability_card(availability: DataAvailability):
    """Render a card showing which modules are available."""

    with st.expander("Module Availability", expanded=False):
        col1, col2, col3 = st.columns(3)

        with col1:
            st.markdown("**Fully Available**")
            for module in availability.recommended_modules:
                st.markdown(f"- {module}")

        with col2:
            st.markdown("**Limited Functionality**")
            for module in availability.limited_modules:
                st.markdown(f"- {module}")

        with col3:
            st.markdown("**Requires More Data**")
            for module in availability.unavailable_modules:
                st.markdown(f"- {module}")

        st.markdown("---")
        st.caption(
            f"Source: {availability.source.value} | "
            f"Positions: {availability.position_count} | "
            f"Snapshot Days: {availability.snapshot_days}"
        )


# =============================================================================
# MODULE-SPECIFIC CHECKS
# =============================================================================

def can_run_risk_analytics() -> tuple:
    """Check if Risk Analytics can run and with what limitations."""
    avail = detect_data_availability()

    if not avail.has_portfolio:
        return False, "No portfolio data available."

    if avail.has_enrichment:
        return True, None

    if avail.source == DataSource.EASY_EQUITIES:
        return True, "Limited - requires enrichment for full metrics. Click 'Enrich Portfolio' first."

    return False, "Risk Analytics requires portfolio enrichment."


def can_run_performance_suite() -> tuple:
    """Check if Performance Suite can run."""
    avail = detect_data_availability()

    if avail.has_performance_series:
        return True, None

    if avail.has_snapshots and avail.snapshot_days >= 7:
        return True, f"Limited - Using {avail.snapshot_days} days of snapshot data."

    if avail.has_enrichment:
        return True, "Simulated - Performance is estimated based on Yahoo Finance historical data with static holdings assumption."

    return False, "Performance Suite requires either performance history or portfolio enrichment."


def can_run_monte_carlo() -> tuple:
    """Check if Monte Carlo can run."""
    avail = detect_data_availability()

    if not avail.has_portfolio:
        return False, "No portfolio data available."

    if avail.has_enrichment:
        return True, None

    return True, "Limited - Using default volatility assumptions. Enrich portfolio for accurate volatility."


def can_run_optimizer() -> tuple:
    """Check if Quant Optimizer can run."""
    avail = detect_data_availability()

    if not avail.has_portfolio:
        return False, "No portfolio data available."

    if avail.has_enrichment:
        return True, None

    return True, "Limited - Requires enrichment for accurate covariance matrix."
