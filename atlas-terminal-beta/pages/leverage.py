"""
ATLAS Terminal Beta - Leverage Tracker
=======================================
Margin and leverage monitoring.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
from ui.components import section_header


def render():
    """Render the leverage tracker page"""

    st.title("📊 Leverage Tracker")
    st.caption("Margin utilization and leverage monitoring")

    if 'adapter' not in st.session_state:
        st.error("Not connected to Alpaca. Please reconnect.")
        return

    adapter = st.session_state.adapter

    try:
        # Get account data
        account = adapter.get_account_summary()

        # Account summary
        st.markdown("### 💰 Account Overview")

        col1, col2, col3, col4 = st.columns(4)

        with col1:
            st.metric("Portfolio Value", f"${account['portfolio_value']:,.2f}")

        with col2:
            st.metric("Cash", f"${account['cash']:,.2f}")

        with col3:
            st.metric("Buying Power", f"${account['buying_power']:,.2f}")

        with col4:
            day_change = account['portfolio_value'] - account['last_equity']
            day_change_pct = (day_change / account['last_equity'] * 100) if account['last_equity'] > 0 else 0
            st.metric("Today's Change", f"{day_change_pct:+.2f}%", f"${day_change:+,.2f}")

        st.markdown("---")

        # Margin details
        section_header("📊 Margin Details", "Account margin and leverage")

        positions = adapter.get_positions()

        if not positions.empty:
            long_value = account.get('long_market_value', 0)
            equity = account['portfolio_value']

            # Calculate leverage
            leverage = (long_value / equity) if equity > 0 else 0

            col1, col2, col3 = st.columns(3)

            with col1:
                st.metric("Long Market Value", f"${long_value:,.2f}")

            with col2:
                st.metric("Current Leverage", f"{leverage:.2f}x")

            with col3:
                pattern_day_trader = account.get('pattern_day_trader', False)
                if pattern_day_trader:
                    st.warning("⚠️ Pattern Day Trader")
                else:
                    st.success("✅ Not PDT")

            st.markdown("---")

            # Daytrade info
            section_header("📅 Daytrade Tracking", "Pattern day trader status")

            col1, col2 = st.columns(2)

            with col1:
                daytrade_count = account.get('daytrade_count', 0)
                st.metric("Daytrades (5 days)", daytrade_count)

                if daytrade_count >= 3:
                    st.warning("⚠️ Near PDT limit (3+ daytrades)")
                else:
                    st.info(f"✅ {3-daytrade_count} daytrades remaining")

            with col2:
                min_equity = 25000  # PDT minimum
                current_equity = equity

                if current_equity < min_equity and pattern_day_trader:
                    st.error(f"❌ Below PDT minimum (${min_equity:,.0f})")
                elif current_equity >= min_equity:
                    st.success(f"✅ Above PDT minimum")
                else:
                    st.info(f"💡 ${min_equity - current_equity:,.0f} to PDT threshold")

        else:
            st.info("No positions found.")

        st.markdown("---")

        # Buying power analysis
        section_header("💵 Buying Power Analysis", "Available capital for trading")

        buying_power = account['buying_power']
        cash = account['cash']

        col1, col2 = st.columns(2)

        with col1:
            st.metric("Available Buying Power", f"${buying_power:,.2f}")
            st.caption("Maximum purchasing power including margin")

        with col2:
            st.metric("Cash Available", f"${cash:,.2f}")
            st.caption("Settled cash for immediate use")

        # Usage percentage
        if not positions.empty:
            bp_used_pct = ((equity - cash) / buying_power * 100) if buying_power > 0 else 0

            st.progress(min(bp_used_pct / 100, 1.0))
            st.caption(f"Buying power utilization: {bp_used_pct:.1f}%")

    except Exception as e:
        st.error(f"Error loading leverage data: {str(e)}")
        st.exception(e)
