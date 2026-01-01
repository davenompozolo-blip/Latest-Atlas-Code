"""
ATLAS Terminal Beta - Portfolio Optimizer
==========================================
Modern Portfolio Theory optimization.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from scipy.optimize import minimize
from ui.components import section_header


def render():
    """Render the portfolio optimizer page"""

    st.title("🧮 Portfolio Optimizer")
    st.caption("Modern Portfolio Theory and efficient frontier")

    if 'adapter' not in st.session_state:
        st.error("Not connected to Alpaca. Please reconnect.")
        return

    adapter = st.session_state.adapter

    try:
        # Get positions
        positions = adapter.get_positions()

        if positions.empty:
            st.info("📭 No positions found. Add positions to optimize portfolio.")
            return

        # Optimization parameters
        st.markdown("### ⚙️ Optimization Parameters")

        col1, col2 = st.columns(2)

        with col1:
            objective = st.selectbox(
                "Optimization Objective",
                ["Maximum Sharpe Ratio", "Minimum Volatility", "Maximum Return"]
            )

        with col2:
            lookback = st.selectbox(
                "Historical Period",
                [90, 180, 252, 365],
                index=2,
                format_func=lambda x: f"{x} days"
            )

        st.markdown("---")

        # Get tickers
        tickers = positions['Ticker'].tolist()

        if len(tickers) < 2:
            st.warning("Need at least 2 positions for optimization.")
            return

        if st.button("🧮 Optimize Portfolio", type="primary"):
            with st.spinner("Calculating optimal weights..."):
                try:
                    from alpaca.data.requests import StockBarsRequest
                    from alpaca.data.timeframe import TimeFrame
                    from datetime import datetime, timedelta

                    # Fetch historical data
                    end_date = datetime.now()
                    start_date = end_date - timedelta(days=lookback)

                    request = StockBarsRequest(
                        symbol_or_symbols=tickers,
                        timeframe=TimeFrame.Day,
                        start=start_date,
                        end=end_date
                    )

                    bars = adapter.data_client.get_stock_bars(request)
                    df = bars.df

                    # Calculate returns
                    returns_df = df['close'].unstack('symbol').pct_change().dropna()

                    if len(returns_df) < 30:
                        st.error("Insufficient historical data for optimization.")
                        return

                    # Calculate statistics
                    mean_returns = returns_df.mean() * 252
                    cov_matrix = returns_df.cov() * 252

                    # Current weights
                    total_value = positions['Market_Value'].sum()
                    current_weights = (positions['Market_Value'] / total_value).values

                    # Optimization functions
                    def portfolio_stats(weights, mean_returns, cov_matrix):
                        portfolio_return = np.dot(weights, mean_returns)
                        portfolio_std = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
                        sharpe = portfolio_return / portfolio_std if portfolio_std > 0 else 0
                        return portfolio_return, portfolio_std, sharpe

                    def neg_sharpe(weights, mean_returns, cov_matrix):
                        return -portfolio_stats(weights, mean_returns, cov_matrix)[2]

                    def portfolio_volatility(weights, mean_returns, cov_matrix):
                        return portfolio_stats(weights, mean_returns, cov_matrix)[1]

                    def neg_return(weights, mean_returns, cov_matrix):
                        return -portfolio_stats(weights, mean_returns, cov_matrix)[0]

                    # Constraints
                    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1})
                    bounds = tuple((0, 1) for _ in range(len(tickers)))

                    # Optimize
                    if objective == "Maximum Sharpe Ratio":
                        result = minimize(neg_sharpe, current_weights, args=(mean_returns, cov_matrix),
                                        method='SLSQP', bounds=bounds, constraints=constraints)
                    elif objective == "Minimum Volatility":
                        result = minimize(portfolio_volatility, current_weights, args=(mean_returns, cov_matrix),
                                        method='SLSQP', bounds=bounds, constraints=constraints)
                    else:  # Maximum Return
                        result = minimize(neg_return, current_weights, args=(mean_returns, cov_matrix),
                                        method='SLSQP', bounds=bounds, constraints=constraints)

                    optimal_weights = result.x

                    # Calculate stats
                    current_return, current_vol, current_sharpe = portfolio_stats(current_weights, mean_returns, cov_matrix)
                    optimal_return, optimal_vol, optimal_sharpe = portfolio_stats(optimal_weights, mean_returns, cov_matrix)

                    # Display results
                    st.markdown("### 📊 Optimization Results")

                    col1, col2, col3 = st.columns(3)

                    with col1:
                        st.metric(
                            "Expected Return",
                            f"{optimal_return*100:.2f}%",
                            f"{(optimal_return-current_return)*100:+.2f}%"
                        )

                    with col2:
                        st.metric(
                            "Volatility",
                            f"{optimal_vol*100:.2f}%",
                            f"{(optimal_vol-current_vol)*100:+.2f}%",
                            delta_color="inverse"
                        )

                    with col3:
                        st.metric(
                            "Sharpe Ratio",
                            f"{optimal_sharpe:.2f}",
                            f"{(optimal_sharpe-current_sharpe):+.2f}"
                        )

                    st.markdown("---")

                    # Weight comparison
                    section_header("⚖️ Weight Allocation", "Current vs Optimal")

                    comparison_df = pd.DataFrame({
                        'Ticker': tickers,
                        'Current': current_weights * 100,
                        'Optimal': optimal_weights * 100,
                        'Change': (optimal_weights - current_weights) * 100
                    })

                    comparison_df = comparison_df.sort_values('Optimal', ascending=False)

                    # Bar chart
                    fig = go.Figure()

                    fig.add_trace(go.Bar(
                        name='Current',
                        x=comparison_df['Ticker'],
                        y=comparison_df['Current'],
                        marker_color='lightblue'
                    ))

                    fig.add_trace(go.Bar(
                        name='Optimal',
                        x=comparison_df['Ticker'],
                        y=comparison_df['Optimal'],
                        marker_color='green'
                    ))

                    fig.update_layout(
                        barmode='group',
                        xaxis_title="Ticker",
                        yaxis_title="Weight (%)",
                        height=400
                    )

                    st.plotly_chart(fig, use_container_width=True)

                    # Table
                    display_df = comparison_df.copy()
                    display_df['Current'] = display_df['Current'].apply(lambda x: f"{x:.2f}%")
                    display_df['Optimal'] = display_df['Optimal'].apply(lambda x: f"{x:.2f}%")
                    display_df['Change'] = display_df['Change'].apply(lambda x: f"{x:+.2f}%")

                    st.dataframe(display_df, use_container_width=True, hide_index=True)

                except Exception as opt_error:
                    st.error(f"Optimization failed: {str(opt_error)}")
                    st.info("Try adjusting the lookback period or check data availability.")

    except Exception as e:
        st.error(f"Error loading optimizer: {str(e)}")
        st.exception(e)
