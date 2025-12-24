"""
Performance Suite Page Handler

Comprehensive performance analytics and benchmarking.
"""

def render_performance_suite_page():
    """
    Render the Performance Suite page.

    Features:
    - Performance metrics dashboard
    - Benchmark comparison
    - Returns analysis
    - Rolling performance charts
    - Factor attribution
    - Performance decomposition
    """
    import streamlit as st
    import pandas as pd
    import plotly.graph_objects as go
    import yfinance as yf
    from datetime import datetime, timedelta

    # Import helper functions
    from utils.portfolio import (
        load_portfolio_data,
        create_enhanced_holdings_table,
        calculate_portfolio_returns
    )
    from utils.formatting import format_percentage, format_currency
    from utils.ui_components import make_scrollable_table
    from analytics.performance import (
        calculate_performance_metrics,
        calculate_benchmark_returns,
        is_valid_series
    )
    from analytics.visualization import (
        create_performance_comparison_chart,
        create_cumulative_returns_chart,
        create_rolling_returns_chart,
        apply_chart_theme
    )
    from config.settings import start_date, end_date, selected_benchmark

    st.markdown("## 💎 PERFORMANCE SUITE")

    portfolio_data = load_portfolio_data()

    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        st.warning("⚠️ No portfolio data.")
        st.stop()

    df = pd.DataFrame(portfolio_data)
    enhanced_df = create_enhanced_holdings_table(df)

    # Calculate returns
    portfolio_returns = calculate_portfolio_returns(df, start_date, end_date)
    benchmark_returns = calculate_benchmark_returns(selected_benchmark, start_date, end_date)

    if not is_valid_series(portfolio_returns):
        st.warning("Insufficient data for performance analysis")
        st.stop()

    # Calculate performance metrics
    metrics = calculate_performance_metrics(enhanced_df, portfolio_returns, benchmark_returns)

    # Display metrics
    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("Total Return", format_percentage(metrics.get('total_return', 0)))
    col2.metric("Annual Return", format_percentage(metrics.get('annual_return', 0)))
    col3.metric("Sharpe Ratio", f"{metrics.get('sharpe', 0):.2f}")
    col4.metric("Max Drawdown", format_percentage(metrics.get('max_drawdown', 0)))
    col5.metric("Alpha", format_percentage(metrics.get('alpha', 0)))

    st.markdown("---")

    # Performance charts
    tabs = st.tabs(["📈 Cumulative Returns", "📊 Rolling Performance", "🔬 Decomposition"])

    with tabs[0]:
        cum_chart = create_cumulative_returns_chart(portfolio_returns, benchmark_returns)
        if cum_chart:
            st.plotly_chart(cum_chart, use_container_width=True)

    with tabs[1]:
        rolling_chart = create_rolling_returns_chart(portfolio_returns)
        if rolling_chart:
            st.plotly_chart(rolling_chart, use_container_width=True)

    with tabs[2]:
        st.markdown("### Performance Attribution")
        st.info("Detailed factor attribution and decomposition")
