"""
Quant Optimizer Page Handler

Advanced portfolio optimization using analytical gradients and SLSQP algorithm.
"""

def render_quant_optimizer_page():
    """
    Render the Quantitative Portfolio Optimizer page.

    Features:
    - Maximum Sharpe Ratio optimization
    - Analytical gradient calculation
    - Weight constraints (min/max per asset)
    - Current vs optimal allocation comparison
    """
    import streamlit as st
    import pandas as pd
    import numpy as np
    import yfinance as yf
    import plotly.graph_objects as go

    # Import helper functions
    from utils.portfolio import load_portfolio_data
    from analytics.optimization import QuantOptimizer
    from utils.theme import apply_chart_theme
    from utils.ui_components import make_scrollable_table

    st.markdown("### 🧮 Quantitative Portfolio Optimizer")
    st.markdown("**Advanced Optimization using Multivariable Calculus & Analytical Gradients**")

    portfolio_data = load_portfolio_data()

    # ✅ FIX: Proper DataFrame empty check
    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        st.warning("⚠️ Please upload portfolio data via Phoenix Parser first")
    else:
        st.success(f"✅ Portfolio loaded: {len(portfolio_data)} positions")

        # Configuration
        col1, col2, col3 = st.columns(3)
        with col1:
            risk_free_rate = st.number_input("Risk-Free Rate", min_value=0.0, max_value=0.10, value=0.04, step=0.001, format="%.3f")
        with col2:
            min_weight = st.number_input("Min Weight per Asset", min_value=0.0, max_value=0.20, value=0.01, step=0.01, format="%.2f")
        with col3:
            max_weight = st.number_input("Max Weight per Asset", min_value=0.20, max_value=1.0, value=0.40, step=0.05, format="%.2f")

        if st.button("🚀 Optimize Portfolio (Max Sharpe Ratio)", type="primary"):
            with st.spinner("Running optimization with analytical gradients..."):
                try:
                    # ===== FIX #5: Handle Symbol vs Ticker column name =====
                    ticker_column = 'Symbol' if 'Symbol' in portfolio_data.columns else 'Ticker'
                    print(f"🎯 Detected ticker column: '{ticker_column}'")

                    # Get tickers
                    tickers = portfolio_data[ticker_column].unique().tolist()
                    print(f"🎯 Optimizing portfolio with {len(tickers)} tickers")

                    # Download historical data
                    hist_data = yf.download(tickers, period='2y', progress=False)['Close']

                    if isinstance(hist_data, pd.Series):
                        hist_data = hist_data.to_frame()

                    # Calculate returns
                    returns = hist_data.pct_change().dropna()

                    # Initialize QuantOptimizer
                    optimizer = QuantOptimizer(returns_data=returns, risk_free_rate=risk_free_rate)

                    # Run optimization
                    optimal_weights, optimal_sharpe, result = optimizer.optimize_max_sharpe(
                        min_weight=min_weight,
                        max_weight=max_weight
                    )

                    # Calculate optimal portfolio metrics
                    optimal_return, optimal_vol = optimizer.portfolio_metrics(optimal_weights)

                    # Display results
                    st.markdown("---")
                    st.markdown("#### 🎯 Optimization Results")

                    # Key metrics
                    col1, col2, col3, col4 = st.columns(4)
                    with col1:
                        st.metric("Maximum Sharpe Ratio", f"{optimal_sharpe:.3f}")
                    with col2:
                        st.metric("Expected Return", f"{optimal_return:.2%}")
                    with col3:
                        st.metric("Volatility", f"{optimal_vol:.2%}")
                    with col4:
                        convergence = "✅ Success" if result.success else "⚠️ Warning"
                        st.metric("Convergence", convergence)

                    # Optimal weights
                    st.markdown("#### 📊 Optimal Portfolio Weights")

                    weights_df = pd.DataFrame({
                        'Symbol': returns.columns,
                        'Optimal Weight': optimal_weights,
                        'Weight %': [f"{w:.2%}" for w in optimal_weights]
                    }).sort_values('Optimal Weight', ascending=False)

                    # Visualization
                    fig = go.Figure()
                    fig.add_trace(go.Bar(
                        x=weights_df['Symbol'],
                        y=weights_df['Optimal Weight'],
                        marker_color='#00d4ff',
                        text=weights_df['Weight %'],
                        textposition='outside'
                    ))

                    fig.update_layout(
                        title="Optimal Portfolio Allocation (Maximum Sharpe Ratio)",
                        xaxis_title="Symbol",
                        yaxis_title="Weight",
                        height=400
                    )
                    apply_chart_theme(fig)
                    st.plotly_chart(fig, use_container_width=True)

                    # Table
                    make_scrollable_table(weights_df, height=400, hide_index=True, use_container_width=True)

                    # Current vs Optimal comparison
                    st.markdown("#### 🔄 Current vs Optimal Allocation")

                    total_value = (portfolio_data['Quantity'] * portfolio_data['Current Price']).sum()
                    portfolio_data['Current Weight'] = (portfolio_data['Quantity'] * portfolio_data['Current Price']) / total_value

                    comparison_df = pd.DataFrame({
                        'Symbol': returns.columns
                    })

                    comparison_df['Optimal Weight'] = optimal_weights
                    comparison_df = comparison_df.merge(
                        portfolio_data[['Symbol', 'Current Weight']],
                        on='Symbol',
                        how='left'
                    )
                    comparison_df['Current Weight'] = comparison_df['Current Weight'].fillna(0)
                    comparison_df['Change'] = comparison_df['Optimal Weight'] - comparison_df['Current Weight']

                    make_scrollable_table(
                        comparison_df.style.format({
                            'Current Weight': '{:.2%}',
                            'Optimal Weight': '{:.2%}',
                            'Change': '{:+.2%}'
                        }),
                        height=400,
                        hide_index=True,
                        use_container_width=True
                    )

                    st.success("✅ Portfolio optimization completed successfully!")
                    st.info("💡 This optimization uses analytical gradients (∂Sharpe/∂w_i) and SLSQP algorithm for maximum precision")

                except Exception as e:
                    st.error(f"❌ Optimization error: {str(e)}")
                    st.info("💡 Ensure your portfolio has at least 2 positions with sufficient historical data")
