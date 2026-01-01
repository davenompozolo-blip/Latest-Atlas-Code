"""
ATLAS Terminal Beta - Portfolio Page
=====================================
Detailed portfolio analysis and position metrics.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from ui.components import holdings_table, allocation_pie_chart, section_header


def render():
    """Render the portfolio analysis page"""

    st.title("📊 Portfolio Analysis")
    st.caption("Detailed position breakdown and allocation analysis")

    # Get adapter from session state
    if 'adapter' not in st.session_state:
        st.error("Not connected to Alpaca. Please reconnect.")
        return

    adapter = st.session_state.adapter

    try:
        # Get positions
        positions = adapter.get_positions()

        if positions.empty:
            st.info("📭 No positions found. Your portfolio is currently empty.")
            return

        # Portfolio summary metrics
        st.markdown("### 📈 Portfolio Summary")

        total_value = positions['Market_Value'].sum()
        total_cost = positions['Purchase_Value'].sum()
        total_pl = positions['Unrealized_PnL'].sum()
        total_pl_pct = (total_pl / total_cost * 100) if total_cost > 0 else 0
        total_daily_pl = positions['Daily_PnL'].sum()

        col1, col2, col3, col4, col5 = st.columns(5)

        with col1:
            st.metric("Positions", f"{len(positions)}")

        with col2:
            st.metric("Total Value", f"${total_value:,.2f}")

        with col3:
            st.metric("Total Cost", f"${total_cost:,.2f}")

        with col4:
            st.metric("Unrealized P&L", f"${total_pl:+,.2f}", f"{total_pl_pct:+.2f}%")

        with col5:
            st.metric("Daily P&L", f"${total_daily_pl:+,.2f}")

        st.markdown("---")

        # Detailed holdings table
        section_header("📋 Position Details", "Complete breakdown of all holdings")
        holdings_table(positions)

        st.markdown("---")

        # Allocation analysis
        st.markdown("### 🎯 Allocation Analysis")

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("#### Portfolio Weight Distribution")
            allocation_pie_chart(positions, title="")

        with col2:
            st.markdown("#### Top 5 Holdings by Weight")

            # Create bar chart of top 5
            top5 = positions.head(5)[['Ticker', 'Weight_Pct']].copy()

            fig = px.bar(
                top5,
                x='Weight_Pct',
                y='Ticker',
                orientation='h',
                color='Weight_Pct',
                color_continuous_scale='Blues',
                labels={'Weight_Pct': 'Weight (%)', 'Ticker': 'Ticker'}
            )

            fig.update_layout(
                showlegend=False,
                height=300,
                margin=dict(t=20, b=20, l=80, r=20),
                coloraxis_showscale=False
            )

            fig.update_traces(
                hovertemplate='<b>%{y}</b><br>Weight: %{x:.2f}%<extra></extra>'
            )

            st.plotly_chart(fig, use_container_width=True)

        st.markdown("---")

        # Concentration metrics
        st.markdown("### 📊 Concentration Metrics")

        col1, col2, col3 = st.columns(3)

        # Top 3 concentration
        top3_weight = positions.head(3)['Weight_Pct'].sum()

        with col1:
            st.metric("Top 3 Concentration", f"{top3_weight:.1f}%")

        # Top 5 concentration
        top5_weight = positions.head(5)['Weight_Pct'].sum()

        with col2:
            st.metric("Top 5 Concentration", f"{top5_weight:.1f}%")

        # Largest position
        max_weight = positions['Weight_Pct'].max()
        max_ticker = positions.loc[positions['Weight_Pct'].idxmax(), 'Ticker']

        with col3:
            st.metric("Largest Position", f"{max_ticker} ({max_weight:.1f}%)")

        st.markdown("---")

        # P&L breakdown
        st.markdown("### 💰 P&L Breakdown")

        # Winners vs Losers
        winners = positions[positions['Unrealized_PnL'] > 0]
        losers = positions[positions['Unrealized_PnL'] < 0]

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("#### Winners")
            if not winners.empty:
                winners_display = winners[['Ticker', 'Unrealized_PnL', 'Unrealized_PnL_Pct']].copy()
                winners_display['Unrealized_PnL'] = winners_display['Unrealized_PnL'].apply(lambda x: f"${x:+,.2f}")
                winners_display['Unrealized_PnL_Pct'] = winners_display['Unrealized_PnL_Pct'].apply(lambda x: f"{x:+.2f}%")
                winners_display.columns = ['Ticker', 'P&L', 'P&L %']
                st.dataframe(winners_display, use_container_width=True, hide_index=True)
                st.caption(f"Total: ${winners['Unrealized_PnL'].sum():+,.2f}")
            else:
                st.info("No winning positions")

        with col2:
            st.markdown("#### Losers")
            if not losers.empty:
                losers_display = losers[['Ticker', 'Unrealized_PnL', 'Unrealized_PnL_Pct']].copy()
                losers_display['Unrealized_PnL'] = losers_display['Unrealized_PnL'].apply(lambda x: f"${x:+,.2f}")
                losers_display['Unrealized_PnL_Pct'] = losers_display['Unrealized_PnL_Pct'].apply(lambda x: f"{x:+.2f}%")
                losers_display.columns = ['Ticker', 'P&L', 'P&L %']
                st.dataframe(losers_display, use_container_width=True, hide_index=True)
                st.caption(f"Total: ${losers['Unrealized_PnL'].sum():+,.2f}")
            else:
                st.info("No losing positions")

    except Exception as e:
        st.error(f"Error loading portfolio data: {str(e)}")
        st.exception(e)
