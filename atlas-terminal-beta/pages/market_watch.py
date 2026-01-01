"""
ATLAS Terminal Beta - Market Watch Page
========================================
Live market data and indices.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
import plotly.graph_objects as go
from datetime import datetime, timedelta
from ui.components import section_header


def render():
    """Render the market watch page"""

    st.title("🌍 Market Watch")
    st.caption("Live market data and major indices")

    try:
        # Get account from adapter
        if 'adapter' not in st.session_state:
            st.error("Not connected to Alpaca. Please reconnect.")
            return

        adapter = st.session_state.adapter
        account = adapter.get_account_summary()

        # Market status
        st.markdown("### 📊 Market Status")

        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric("Account Status", account.get('status', 'UNKNOWN'))

        with col2:
            current_time = datetime.now().strftime('%H:%M:%S')
            st.metric("Current Time", current_time)

        with col3:
            # Market hours (simplified)
            now = datetime.now()
            market_open = now.replace(hour=9, minute=30, second=0)
            market_close = now.replace(hour=16, minute=0, second=0)

            if market_open <= now <= market_close and now.weekday() < 5:
                st.success("🟢 Market Open")
            else:
                st.info("🔴 Market Closed")

        st.markdown("---")

        # Portfolio holdings
        section_header("📈 Your Holdings", "Current positions")

        positions = adapter.get_positions()

        if positions.empty:
            st.info("No positions to display")
        else:
            # Create price change chart
            fig = go.Figure()

            # Sort by market value
            top_positions = positions.nlargest(10, 'Market_Value')

            fig.add_trace(go.Bar(
                x=top_positions['Ticker'],
                y=top_positions['Daily_PnL'],
                marker_color=['green' if x > 0 else 'red' for x in top_positions['Daily_PnL']],
                hovertemplate='<b>%{x}</b><br>Daily P&L: $%{y:,.2f}<extra></extra>'
            ))

            fig.update_layout(
                title="Today's Performance by Position",
                xaxis_title="Ticker",
                yaxis_title="Daily P&L ($)",
                height=400,
                showlegend=False
            )

            st.plotly_chart(fig, use_container_width=True)

        st.markdown("---")

        # Quick stats
        section_header("📊 Quick Stats", "Market overview")

        if not positions.empty:
            col1, col2, col3, col4 = st.columns(4)

            with col1:
                winners = (positions['Daily_PnL'] > 0).sum()
                st.metric("Winners Today", winners)

            with col2:
                losers = (positions['Daily_PnL'] < 0).sum()
                st.metric("Losers Today", losers)

            with col3:
                total_daily_pl = positions['Daily_PnL'].sum()
                st.metric("Total Daily P&L", f"${total_daily_pl:+,.2f}")

            with col4:
                unique_tickers = len(positions)
                st.metric("Positions", unique_tickers)

    except Exception as e:
        st.error(f"Error loading market data: {str(e)}")
        st.exception(e)
