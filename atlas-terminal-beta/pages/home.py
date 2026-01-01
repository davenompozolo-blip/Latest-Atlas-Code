"""
ATLAS Terminal Beta - Dashboard Page
=====================================
Main dashboard with portfolio overview and key metrics.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
import pandas as pd
from ui.components import (
    metric_card, holdings_table, allocation_pie_chart,
    equity_curve_chart, section_header
)


def render():
    """Render the dashboard page"""

    st.title("🏠 Dashboard")
    st.caption("Portfolio overview and key metrics")

    # Get adapter from session state
    if 'adapter' not in st.session_state:
        st.error("Not connected to Alpaca. Please reconnect.")
        return

    adapter = st.session_state.adapter

    try:
        # Get account summary
        account = adapter.get_account_summary()

        # Account metrics
        st.markdown("### 📊 Account Summary")

        col1, col2, col3, col4 = st.columns(4)

        with col1:
            portfolio_value = account['portfolio_value']
            last_equity = account['last_equity']
            daily_change = portfolio_value - last_equity
            metric_card(
                "Portfolio Value",
                f"${portfolio_value:,.2f}",
                f"${daily_change:+,.2f}"
            )

        with col2:
            metric_card(
                "Cash",
                f"${account['cash']:,.2f}"
            )

        with col3:
            metric_card(
                "Buying Power",
                f"${account['buying_power']:,.2f}"
            )

        with col4:
            day_change_pct = (daily_change / last_equity * 100) if last_equity > 0 else 0
            metric_card(
                "Today's Return",
                f"{day_change_pct:+.2f}%",
                delta_color="normal"
            )

        st.markdown("---")

        # Get positions
        positions = adapter.get_positions()

        if positions.empty:
            st.info("📭 No positions found. Your portfolio is currently empty.")
            return

        # Portfolio summary
        total_value = positions['Market_Value'].sum()
        total_cost = positions['Purchase_Value'].sum()
        total_pl = positions['Unrealized_PnL'].sum()
        total_pl_pct = (total_pl / total_cost * 100) if total_cost > 0 else 0

        col1, col2, col3 = st.columns(3)

        with col1:
            metric_card(
                "Total Market Value",
                f"${total_value:,.2f}"
            )

        with col2:
            metric_card(
                "Total Unrealized P&L",
                f"${total_pl:+,.2f}",
                f"{total_pl_pct:+.2f}%"
            )

        with col3:
            metric_card(
                "Number of Positions",
                f"{len(positions)}"
            )

        st.markdown("---")

        # Holdings and allocation
        col1, col2 = st.columns([2, 1])

        with col1:
            section_header("📋 Current Holdings", "Detailed position breakdown")
            holdings_table(positions)

        with col2:
            section_header("🥧 Allocation", "Portfolio composition")
            allocation_pie_chart(positions, title="")

        # Equity curve (last 30 days)
        st.markdown("---")
        section_header("📈 Equity Curve", "Portfolio performance over time (30 days)")

        try:
            history = adapter.get_portfolio_history(days=30, timeframe='1Day')
            if not history.empty:
                equity_curve_chart(history, title="")
            else:
                st.info("No portfolio history available yet.")
        except Exception as e:
            st.warning(f"Could not load portfolio history: {str(e)}")

    except Exception as e:
        st.error(f"Error loading dashboard: {str(e)}")
        st.exception(e)
