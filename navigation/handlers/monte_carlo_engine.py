"""
Monte Carlo Engine Page Handler

Advanced stochastic portfolio modeling with Geometric Brownian Motion.
"""

def render_monte_carlo_engine_page():
    """
    Render the Monte Carlo Simulation Engine page.

    Features:
    - Geometric Brownian Motion simulation
    - Portfolio path forecasting
    - Value at Risk (VaR) calculation
    - Returns distribution analysis
    """
    import streamlit as st
    import pandas as pd
    import numpy as np
    import yfinance as yf
    import plotly.graph_objects as go

    # Import helper functions
    from utils.portfolio import load_portfolio_data
    from analytics.stochastic import StochasticEngine
    from utils.theme import apply_chart_theme

    st.markdown("### 🎲 Monte Carlo Simulation Engine")
    st.markdown("**Advanced Stochastic Modeling with Geometric Brownian Motion**")

    portfolio_data = load_portfolio_data()

    # ✅ FIX: Proper DataFrame empty check
    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        st.warning("⚠️ Please upload portfolio data via Phoenix Parser first")
    else:
        st.success(f"✅ Portfolio loaded: {len(portfolio_data)} positions")

        # Configuration
        col1, col2, col3 = st.columns(3)
        with col1:
            n_scenarios = st.number_input("Number of Scenarios", min_value=1000, max_value=50000, value=10000, step=1000)
        with col2:
            time_horizon = st.number_input("Time Horizon (days)", min_value=30, max_value=1000, value=252, step=30)
        with col3:
            confidence_level = st.slider("Confidence Level", min_value=90, max_value=99, value=95, step=1)

        if st.button("🚀 Run Monte Carlo Simulation", type="primary"):
            with st.spinner("Running Monte Carlo simulation..."):
                try:
                    # ===== FIX #4: Handle Symbol vs Ticker column name =====
                    # Detect which column name is used
                    ticker_column = 'Symbol' if 'Symbol' in portfolio_data.columns else 'Ticker'
                    print(f"🎯 Detected ticker column: '{ticker_column}'")

                    # Get tickers and current prices
                    tickers = portfolio_data[ticker_column].unique().tolist()
                    print(f"🎯 Found {len(tickers)} unique tickers: {tickers[:5]}...")

                    # Download historical data
                    hist_data = yf.download(tickers, period='1y', progress=False)['Close']

                    if isinstance(hist_data, pd.Series):
                        hist_data = hist_data.to_frame()

                    # Calculate returns
                    returns = hist_data.pct_change().dropna()

                    # ===== FIX #8: Aligned Weight Calculation for Monte Carlo =====

                    # Get unique tickers (this is what the simulation will use)
                    tickers_list = list(returns.columns)
                    print(f"🎯 Running Monte Carlo for {len(tickers_list)} tickers: {tickers_list}")

                    # Calculate total portfolio value
                    if 'Total Value' in portfolio_data.columns:
                        total_value = portfolio_data['Total Value'].sum()
                    else:
                        total_value = (portfolio_data['Quantity'] * portfolio_data['Current Price']).sum()

                    print(f"💰 Total portfolio value: ${total_value:,.2f}")

                    # Build aligned weights dictionary
                    weights_dict = {}

                    for ticker in tickers_list:
                        ticker_data = portfolio_data[portfolio_data[ticker_column] == ticker]

                        if len(ticker_data) > 0:
                            if 'Total Value' in ticker_data.columns:
                                ticker_value = ticker_data['Total Value'].sum()
                            else:
                                ticker_value = (ticker_data['Quantity'] * ticker_data['Current Price']).sum()

                            weight = ticker_value / total_value
                            weights_dict[ticker] = weight
                        else:
                            # Ticker in returns but not in portfolio - assign zero weight
                            weights_dict[ticker] = 0.0
                            print(f"⚠️ Warning: {ticker} in historical data but not in portfolio")

                    # Create numpy arrays in same order as tickers_list
                    weights = np.array([weights_dict[ticker] for ticker in tickers_list])
                    S0_values = hist_data.iloc[-1].values

                    # ===== CRITICAL VALIDATION =====
                    # Ensure perfect alignment
                    assert len(weights) == len(tickers_list), \
                        f"❌ Shape mismatch: {len(weights)} weights vs {len(tickers_list)} tickers"

                    assert len(S0_values) == len(tickers_list), \
                        f"❌ Shape mismatch: {len(S0_values)} prices vs {len(tickers_list)} tickers"

                    assert abs(weights.sum() - 1.0) < 0.01, \
                        f"❌ Weights don't sum to 1.0: {weights.sum():.4f}"

                    # Ensure all weights are non-negative
                    assert (weights >= 0).all(), \
                        "❌ Negative weights detected"

                    print(f"✅ Weight validation passed:")
                    print(f"   - Array length: {len(weights)}")
                    print(f"   - Sum: {weights.sum():.4f}")
                    print(f"   - Min weight: {weights.min():.4f}")
                    print(f"   - Max weight: {weights.max():.4f}")

                    # Initialize StochasticEngine
                    engine = StochasticEngine(tickers=list(returns.columns), returns_data=returns)

                    # Run Monte Carlo simulation
                    portfolio_paths, final_returns, metrics = engine.monte_carlo_simulation(
                        weights=weights,
                        S0_values=S0_values,
                        n_scenarios=n_scenarios,
                        T=time_horizon
                    )

                    # Display results
                    st.markdown("---")
                    st.markdown("#### 📊 Simulation Results")

                    # Metrics
                    col1, col2, col3, col4 = st.columns(4)
                    with col1:
                        st.metric("Expected Return", f"{metrics['Expected Return']:.2%}",
                                 delta=f"{metrics['Expected Return']:.2%}")
                    with col2:
                        st.metric("Volatility", f"{metrics['Volatility']:.2%}")
                    with col3:
                        st.metric(f"VaR {confidence_level}%", f"{metrics['VaR 95%']:.2%}",
                                 delta=f"{metrics['VaR 95%']:.2%}", delta_color="inverse")
                    with col4:
                        st.metric(f"CVaR {confidence_level}%", f"{metrics['CVaR 95%']:.2%}",
                                 delta=f"{metrics['CVaR 95%']:.2%}", delta_color="inverse")

                    # Portfolio paths visualization
                    st.markdown("#### 📈 Portfolio Value Paths")

                    fig = go.Figure()

                    # Plot sample paths
                    n_paths_to_plot = min(100, n_scenarios)
                    for i in range(n_paths_to_plot):
                        fig.add_trace(go.Scatter(
                            y=portfolio_paths[i, :],
                            mode='lines',
                            line=dict(width=0.5, color='rgba(0, 212, 255, 0.1)'),
                            showlegend=False,
                            hoverinfo='skip'
                        ))

                    # Add mean path
                    mean_path = portfolio_paths.mean(axis=0)
                    fig.add_trace(go.Scatter(
                        y=mean_path,
                        mode='lines',
                        name='Mean Path',
                        line=dict(width=3, color='#00ff88')
                    ))

                    fig.update_layout(
                        title=f"Monte Carlo Simulation: {n_scenarios:,} Scenarios over {time_horizon} Days",
                        xaxis_title="Days",
                        yaxis_title="Portfolio Value",
                        height=500
                    )
                    apply_chart_theme(fig)
                    st.plotly_chart(fig, use_container_width=True)

                    # Returns distribution
                    st.markdown("#### 📊 Returns Distribution")

                    fig2 = go.Figure()
                    fig2.add_trace(go.Histogram(
                        x=final_returns,
                        nbinsx=50,
                        name='Returns Distribution',
                        marker_color='#00d4ff'
                    ))

                    # Add VaR line
                    fig2.add_vline(x=metrics['VaR 95%'], line_dash="dash", line_color="red",
                                  annotation_text=f"VaR {confidence_level}%: {metrics['VaR 95%']:.2%}")

                    fig2.update_layout(
                        title="Distribution of Portfolio Returns",
                        xaxis_title="Return",
                        yaxis_title="Frequency",
                        height=400
                    )
                    apply_chart_theme(fig2)
                    st.plotly_chart(fig2, use_container_width=True)

                    st.success("✅ Monte Carlo simulation completed successfully!")

                except Exception as e:
                    st.error(f"❌ Simulation error: {str(e)}")
                    st.info("💡 Ensure your portfolio has valid data and multiple positions")
