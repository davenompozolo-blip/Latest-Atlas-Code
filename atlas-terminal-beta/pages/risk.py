"""
ATLAS Terminal Beta - Risk Analysis Page
=========================================
Portfolio risk metrics and analytics.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
import pandas as pd
import numpy as np
from ui.components import (
    risk_metrics_table, equity_curve_chart, drawdown_chart,
    returns_distribution, section_header
)


def render():
    """Render the risk analysis page"""

    st.title("⚠️ Risk Analysis")
    st.caption("Portfolio risk metrics and drawdown analysis")

    # Get adapter from session state
    if 'adapter' not in st.session_state:
        st.error("Not connected to Alpaca. Please reconnect.")
        return

    adapter = st.session_state.adapter

    # Lookback period selection
    col1, col2 = st.columns([1, 3])

    with col1:
        lookback = st.selectbox(
            "Analysis Period",
            options=[30, 90, 180, 252, 365],
            index=3,  # Default to 252 days (1 year)
            format_func=lambda x: f"{x} days ({x//252} year)" if x >= 252 else f"{x} days"
        )

    st.markdown("---")

    try:
        # Calculate risk metrics
        with st.spinner("Calculating risk metrics..."):
            metrics = adapter.get_risk_metrics(days=lookback)

        if not metrics:
            st.warning("Insufficient data for risk analysis. Need at least 2 days of portfolio history.")
            return

        # Display risk metrics
        section_header("📊 Risk Metrics", f"Based on {lookback} days of historical data")
        risk_metrics_table(metrics)

        st.markdown("---")

        # Get portfolio history for charts
        history = adapter.get_portfolio_history(days=lookback, timeframe='1Day')

        if history.empty or len(history) < 2:
            st.warning("Insufficient portfolio history for detailed analysis.")
            return

        # Equity curve
        section_header("📈 Equity Curve", "Portfolio value over time")
        equity_curve_chart(history, title="")

        st.markdown("---")

        # Drawdown chart
        section_header("📉 Drawdown Analysis", "Portfolio drawdown from peak")
        drawdown_chart(history, title="")

        st.markdown("---")

        # Returns distribution
        section_header("📊 Returns Distribution", "Daily return statistics")

        returns = adapter.calculate_returns(days=lookback)

        if not returns.empty:
            col1, col2 = st.columns([2, 1])

            with col1:
                returns_distribution(returns, title="")

            with col2:
                st.markdown("#### Statistics")

                # Calculate statistics
                mean_daily = returns.mean() * 100
                std_daily = returns.std() * 100
                min_daily = returns.min() * 100
                max_daily = returns.max() * 100
                skewness = returns.skew()
                kurtosis = returns.kurtosis()

                st.metric("Mean Daily Return", f"{mean_daily:.3f}%")
                st.metric("Std Dev (Daily)", f"{std_daily:.3f}%")
                st.metric("Worst Day", f"{min_daily:.2f}%")
                st.metric("Best Day", f"{max_daily:.2f}%")
                st.metric("Skewness", f"{skewness:.2f}")
                st.metric("Kurtosis", f"{kurtosis:.2f}")

        st.markdown("---")

        # Risk interpretation
        section_header("📖 Risk Interpretation", "Understanding your metrics")

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("""
            **Sharpe Ratio**
            - < 0: Negative risk-adjusted returns
            - 0-1: Poor risk-adjusted returns
            - 1-2: Good risk-adjusted returns
            - 2-3: Very good risk-adjusted returns
            - > 3: Excellent risk-adjusted returns

            **Sortino Ratio**
            - Similar to Sharpe, but only penalizes downside volatility
            - Generally higher than Sharpe ratio
            - > 2 is considered good

            **Max Drawdown**
            - Maximum peak-to-trough decline
            - < -10%: Low drawdown
            - -10% to -20%: Moderate drawdown
            - > -20%: High drawdown (risky)
            """)

        with col2:
            st.markdown("""
            **Volatility**
            - Annualized standard deviation of returns
            - < 15%: Low volatility
            - 15%-25%: Moderate volatility
            - > 25%: High volatility

            **Value at Risk (95%)**
            - Worst expected daily loss (95% confidence)
            - Shows potential downside risk
            - More negative = higher risk

            **Calmar Ratio**
            - Return divided by max drawdown
            - Measures return per unit of drawdown risk
            - > 0.5 is considered good
            - > 1.0 is considered excellent
            """)

        # Current metrics summary
        st.markdown("---")
        st.markdown("### 📋 Your Portfolio Summary")

        sharpe = metrics.get('sharpe_ratio', 0)
        max_dd = metrics.get('max_drawdown', 0) * 100
        volatility = metrics.get('volatility', 0) * 100

        # Risk assessment
        risk_level = "Low"
        if max_dd < -20 or volatility > 25:
            risk_level = "High"
        elif max_dd < -10 or volatility > 15:
            risk_level = "Moderate"

        quality_rating = "Poor"
        if sharpe > 3:
            quality_rating = "Excellent"
        elif sharpe > 2:
            quality_rating = "Very Good"
        elif sharpe > 1:
            quality_rating = "Good"

        col1, col2 = st.columns(2)

        with col1:
            st.metric("Risk Level", risk_level)
            st.caption(f"Based on volatility ({volatility:.1f}%) and max drawdown ({max_dd:.1f}%)")

        with col2:
            st.metric("Risk-Adjusted Performance", quality_rating)
            st.caption(f"Based on Sharpe ratio ({sharpe:.2f})")

    except Exception as e:
        st.error(f"Error loading risk analysis: {str(e)}")
        st.exception(e)
