"""
ATLAS Terminal Beta - Performance Suite Page
=============================================
Comprehensive performance analytics and attribution.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from ui.components import section_header, equity_curve_chart


def render():
    """Render the performance suite page"""

    st.title("💎 Performance Suite")
    st.caption("Comprehensive performance analytics and attribution")

    # Get adapter from session state
    if 'adapter' not in st.session_state:
        st.error("Not connected to Alpaca. Please reconnect.")
        return

    adapter = st.session_state.adapter

    # Period selection
    col1, col2 = st.columns([1, 3])

    with col1:
        period = st.selectbox(
            "Analysis Period",
            options=[30, 90, 180, 252, 365],
            index=3,
            format_func=lambda x: f"{x} days"
        )

    st.markdown("---")

    try:
        # Get portfolio history
        with st.spinner("Loading performance data..."):
            history = adapter.get_portfolio_history(days=period, timeframe='1Day')
            positions = adapter.get_positions()

        if history.empty:
            st.warning("Insufficient portfolio history for analysis.")
            return

        # Calculate performance metrics
        start_equity = history['equity'].iloc[0]
        end_equity = history['equity'].iloc[-1]
        total_return = ((end_equity - start_equity) / start_equity) * 100

        # Daily returns
        returns = history['equity'].pct_change().dropna()

        # Win rate
        win_days = (returns > 0).sum()
        total_days = len(returns)
        win_rate = (win_days / total_days * 100) if total_days > 0 else 0

        # Best and worst days
        best_day = returns.max() * 100 if not returns.empty else 0
        worst_day = returns.min() * 100 if not returns.empty else 0

        # Performance summary
        st.markdown("### 📊 Performance Summary")

        col1, col2, col3, col4 = st.columns(4)

        with col1:
            st.metric("Total Return", f"{total_return:+.2f}%")

        with col2:
            st.metric("Win Rate", f"{win_rate:.1f}%")

        with col3:
            st.metric("Best Day", f"{best_day:+.2f}%")

        with col4:
            st.metric("Worst Day", f"{worst_day:+.2f}%")

        st.markdown("---")

        # Equity curve
        section_header("📈 Equity Curve", "Portfolio value over time")
        equity_curve_chart(history, title="")

        st.markdown("---")

        # Returns analysis
        st.markdown("### 📊 Returns Analysis")

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("#### Daily Returns Distribution")

            fig = go.Figure()
            fig.add_trace(go.Histogram(
                x=returns * 100,
                nbinsx=30,
                marker_color='#667eea',
                hovertemplate='Return: %{x:.2f}%<br>Count: %{y}<extra></extra>'
            ))

            mean_return = returns.mean() * 100
            fig.add_vline(
                x=mean_return,
                line_dash="dash",
                line_color="green",
                annotation_text=f"Mean: {mean_return:.2f}%"
            )

            fig.update_layout(
                xaxis_title="Daily Return (%)",
                yaxis_title="Frequency",
                height=350,
                margin=dict(t=20, b=50, l=60, r=20)
            )

            st.plotly_chart(fig, use_container_width=True)

        with col2:
            st.markdown("#### Monthly Performance")

            # Group by month
            history_copy = history.copy()
            history_copy['month'] = pd.to_datetime(history_copy['timestamp']).dt.to_period('M')
            monthly = history_copy.groupby('month').agg({
                'equity': ['first', 'last']
            })
            monthly.columns = ['start', 'end']
            monthly['return'] = ((monthly['end'] - monthly['start']) / monthly['start']) * 100
            monthly.index = monthly.index.astype(str)

            fig = px.bar(
                monthly,
                y='return',
                labels={'return': 'Return (%)', 'index': 'Month'},
                color='return',
                color_continuous_scale=['red', 'yellow', 'green'],
                color_continuous_midpoint=0
            )

            fig.update_layout(
                xaxis_title="Month",
                yaxis_title="Return (%)",
                height=350,
                margin=dict(t=20, b=50, l=60, r=20),
                showlegend=False,
                coloraxis_showscale=False
            )

            st.plotly_chart(fig, use_container_width=True)

        st.markdown("---")

        # Position attribution
        if not positions.empty:
            section_header("🎯 Position Attribution", "Performance by position")

            # Sort by P&L
            top_winners = positions.nlargest(5, 'Unrealized_PnL')[['Ticker', 'Unrealized_PnL', 'Unrealized_PnL_Pct']]
            top_losers = positions.nsmallest(5, 'Unrealized_PnL')[['Ticker', 'Unrealized_PnL', 'Unrealized_PnL_Pct']]

            col1, col2 = st.columns(2)

            with col1:
                st.markdown("#### 🏆 Top Winners")

                fig = px.bar(
                    top_winners,
                    x='Unrealized_PnL',
                    y='Ticker',
                    orientation='h',
                    color='Unrealized_PnL_Pct',
                    color_continuous_scale='Greens',
                    labels={'Unrealized_PnL': 'P&L ($)', 'Ticker': ''}
                )

                fig.update_layout(
                    height=300,
                    margin=dict(t=20, b=20, l=80, r=20),
                    coloraxis_showscale=False
                )

                fig.update_traces(
                    hovertemplate='<b>%{y}</b><br>P&L: $%{x:,.2f}<extra></extra>'
                )

                st.plotly_chart(fig, use_container_width=True)

            with col2:
                st.markdown("#### 📉 Top Losers")

                fig = px.bar(
                    top_losers,
                    x='Unrealized_PnL',
                    y='Ticker',
                    orientation='h',
                    color='Unrealized_PnL_Pct',
                    color_continuous_scale='Reds',
                    labels={'Unrealized_PnL': 'P&L ($)', 'Ticker': ''}
                )

                fig.update_layout(
                    height=300,
                    margin=dict(t=20, b=20, l=80, r=20),
                    coloraxis_showscale=False
                )

                fig.update_traces(
                    hovertemplate='<b>%{y}</b><br>P&L: $%{x:,.2f}<extra></extra>'
                )

                st.plotly_chart(fig, use_container_width=True)

        st.markdown("---")

        # Performance statistics
        section_header("📈 Performance Statistics", "Detailed metrics")

        # Calculate additional metrics
        annualized_return = (((end_equity / start_equity) ** (252 / period)) - 1) * 100 if period > 0 else 0
        volatility = returns.std() * np.sqrt(252) * 100
        sharpe = (annualized_return / volatility) if volatility > 0 else 0

        # Sortino
        downside_returns = returns[returns < 0]
        downside_std = downside_returns.std() * np.sqrt(252) * 100
        sortino = (annualized_return / downside_std) if downside_std > 0 else 0

        col1, col2 = st.columns(2)

        with col1:
            st.metric("Annualized Return", f"{annualized_return:.2f}%")
            st.metric("Sharpe Ratio", f"{sharpe:.2f}")
            st.metric("Win Days", f"{win_days} / {total_days}")

        with col2:
            st.metric("Annualized Volatility", f"{volatility:.2f}%")
            st.metric("Sortino Ratio", f"{sortino:.2f}")
            st.metric("Avg Daily Return", f"{returns.mean()*100:.3f}%")

    except Exception as e:
        st.error(f"Error loading performance data: {str(e)}")
        st.exception(e)
