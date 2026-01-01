"""
ATLAS Terminal Beta - Trade History Page
=========================================
Trade history, statistics, and performance analysis.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
import pandas as pd
import plotly.express as px
from ui.components import trades_table, section_header


def render():
    """Render the trade history page"""

    st.title("💼 Trade History")
    st.caption("Complete trade log and performance statistics")

    # Get adapter from session state
    if 'adapter' not in st.session_state:
        st.error("Not connected to Alpaca. Please reconnect.")
        return

    adapter = st.session_state.adapter

    # Lookback period selection
    col1, col2 = st.columns([1, 3])

    with col1:
        lookback_days = st.selectbox(
            "Time Period",
            options=[7, 30, 90, 180, 365],
            index=1,  # Default to 30 days
            format_func=lambda x: f"Last {x} days"
        )

    st.markdown("---")

    try:
        # Get trade history
        with st.spinner("Loading trade history..."):
            trades = adapter.get_trade_history(days=lookback_days)

        if trades.empty:
            st.info(f"📭 No trades found in the last {lookback_days} days.")
            return

        # Trade summary metrics
        st.markdown("### 📊 Trade Summary")

        total_trades = len(trades)
        buys = trades[trades['side'] == 'buy']
        sells = trades[trades['side'] == 'sell']
        total_buy_value = buys['total_value'].sum()
        total_sell_value = sells['total_value'].sum()

        col1, col2, col3, col4 = st.columns(4)

        with col1:
            st.metric("Total Trades", f"{total_trades}")

        with col2:
            st.metric("Buy Orders", f"{len(buys)}")

        with col3:
            st.metric("Sell Orders", f"{len(sells)}")

        with col4:
            net_flow = total_sell_value - total_buy_value
            st.metric("Net Flow", f"${net_flow:+,.2f}")

        st.markdown("---")

        # Volume metrics
        st.markdown("### 💰 Volume Breakdown")

        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric("Total Buy Volume", f"${total_buy_value:,.2f}")

        with col2:
            st.metric("Total Sell Volume", f"${total_sell_value:,.2f}")

        with col3:
            total_volume = total_buy_value + total_sell_value
            st.metric("Total Volume", f"${total_volume:,.2f}")

        st.markdown("---")

        # Trade history table
        section_header("📋 Trade Log", f"All trades in the last {lookback_days} days")
        trades_table(trades)

        st.markdown("---")

        # Trading activity chart
        st.markdown("### 📈 Trading Activity")

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("#### Trades by Symbol")

            # Count trades by symbol
            symbol_counts = trades['symbol'].value_counts().head(10)

            fig = px.bar(
                x=symbol_counts.values,
                y=symbol_counts.index,
                orientation='h',
                labels={'x': 'Number of Trades', 'y': 'Symbol'},
                color=symbol_counts.values,
                color_continuous_scale='Blues'
            )

            fig.update_layout(
                showlegend=False,
                height=400,
                margin=dict(t=20, b=20, l=80, r=20),
                coloraxis_showscale=False
            )

            fig.update_traces(
                hovertemplate='<b>%{y}</b><br>Trades: %{x}<extra></extra>'
            )

            st.plotly_chart(fig, use_container_width=True)

        with col2:
            st.markdown("#### Volume by Symbol")

            # Sum volume by symbol
            symbol_volume = trades.groupby('symbol')['total_value'].sum().sort_values(ascending=False).head(10)

            fig = px.bar(
                x=symbol_volume.values,
                y=symbol_volume.index,
                orientation='h',
                labels={'x': 'Total Volume ($)', 'y': 'Symbol'},
                color=symbol_volume.values,
                color_continuous_scale='Greens'
            )

            fig.update_layout(
                showlegend=False,
                height=400,
                margin=dict(t=20, b=20, l=80, r=20),
                coloraxis_showscale=False
            )

            fig.update_traces(
                hovertemplate='<b>%{y}</b><br>Volume: $%{x:,.2f}<extra></extra>'
            )

            st.plotly_chart(fig, use_container_width=True)

        st.markdown("---")

        # Activity over time
        st.markdown("### 📅 Activity Timeline")

        # Group by date
        trades_copy = trades.copy()
        trades_copy['date'] = pd.to_datetime(trades_copy['timestamp']).dt.date
        daily_trades = trades_copy.groupby('date').agg({
            'total_value': 'sum',
            'symbol': 'count'
        }).reset_index()
        daily_trades.columns = ['date', 'volume', 'count']

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("#### Daily Trade Count")

            fig = px.bar(
                daily_trades,
                x='date',
                y='count',
                labels={'date': 'Date', 'count': 'Number of Trades'},
                color='count',
                color_continuous_scale='Blues'
            )

            fig.update_layout(
                showlegend=False,
                height=300,
                margin=dict(t=20, b=50, l=60, r=20),
                coloraxis_showscale=False
            )

            fig.update_traces(
                hovertemplate='<b>%{x}</b><br>Trades: %{y}<extra></extra>'
            )

            st.plotly_chart(fig, use_container_width=True)

        with col2:
            st.markdown("#### Daily Volume")

            fig = px.bar(
                daily_trades,
                x='date',
                y='volume',
                labels={'date': 'Date', 'volume': 'Volume ($)'},
                color='volume',
                color_continuous_scale='Greens'
            )

            fig.update_layout(
                showlegend=False,
                height=300,
                margin=dict(t=20, b=50, l=60, r=20),
                coloraxis_showscale=False
            )

            fig.update_traces(
                hovertemplate='<b>%{x}</b><br>Volume: $%{y:,.2f}<extra></extra>'
            )

            st.plotly_chart(fig, use_container_width=True)

        st.markdown("---")

        # Trade statistics
        st.markdown("### 📊 Trade Statistics")

        col1, col2, col3 = st.columns(3)

        with col1:
            avg_trade_size = trades['total_value'].mean()
            st.metric("Average Trade Size", f"${avg_trade_size:,.2f}")

        with col2:
            largest_trade = trades['total_value'].max()
            st.metric("Largest Trade", f"${largest_trade:,.2f}")

        with col3:
            unique_symbols = trades['symbol'].nunique()
            st.metric("Unique Symbols Traded", f"{unique_symbols}")

    except Exception as e:
        st.error(f"Error loading trade history: {str(e)}")
        st.exception(e)
