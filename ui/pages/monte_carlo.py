"""
ATLAS Terminal - Monte Carlo Engine Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_monte_carlo():
    """Render the Monte Carlo Engine page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import ATLASFormatter, load_portfolio_data, apply_chart_theme
    from ui.components import ATLAS_TEMPLATE
    from analytics.stochastic import StochasticEngine
    import plotly.graph_objects as go
    import yfinance as yf
    import numpy as np

    st.markdown("**Advanced Stochastic Modeling with Geometric Brownian Motion**")

    # CRITICAL FIX: Check session_state FIRST for fresh EE data
    if 'portfolio_df' in st.session_state and st.session_state['portfolio_df'] is not None and len(st.session_state['portfolio_df']) > 0:
        portfolio_data = st.session_state['portfolio_df']
    else:
        portfolio_data = load_portfolio_data()

    # Get currency from session state
    currency_symbol = st.session_state.get('currency_symbol', '$')
    if isinstance(portfolio_data, pd.DataFrame):
        currency_symbol = portfolio_data.attrs.get('currency_symbol') or currency_symbol

    # Proper DataFrame empty check
    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        st.warning("Please upload portfolio data via Phoenix Parser first")
    else:
        st.success(f"Portfolio loaded: {len(portfolio_data)} positions")

        # Normalize quantity column name to 'Quantity' for consistency
        if 'Quantity' not in portfolio_data.columns:
            for _qcol in ['Shares', 'quantity', 'shares', 'Qty', 'qty', 'QUANTITY']:
                if _qcol in portfolio_data.columns:
                    portfolio_data['Quantity'] = portfolio_data[_qcol]
                    break

        if 'Quantity' not in portfolio_data.columns and 'Total Value' not in portfolio_data.columns:
            st.error("❌ Portfolio data missing quantity column (Quantity/Shares/Qty) and 'Total Value'. Please check your data.")
            st.stop()

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

                    # Expected Return
                    with col1:
                        exp_ret_val = metrics['Expected Return']
                        exp_ret_color = '#10b981' if exp_ret_val > 0.05 else ('#fbbf24' if exp_ret_val > 0 else '#ef4444')
                        exp_ret_status = 'Strong Growth' if exp_ret_val > 0.05 else ('Positive' if exp_ret_val > 0 else 'Negative')
                        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">EXPECTED RETURN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {exp_ret_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{exp_ret_val:+.2%}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{exp_ret_status}</p></div></div>', unsafe_allow_html=True)

                    # Volatility
                    with col2:
                        vol_val = metrics['Volatility']
                        vol_color = '#10b981' if vol_val < 0.15 else ('#fbbf24' if vol_val < 0.25 else '#ef4444')
                        vol_status = 'Low Risk' if vol_val < 0.15 else ('Moderate Risk' if vol_val < 0.25 else 'High Risk')
                        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">VOLATILITY</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {vol_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{vol_val:.2%}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{vol_status}</p></div></div>', unsafe_allow_html=True)

                    # VaR 95%
                    with col3:
                        var_val = metrics['VaR 95%']
                        var_color = '#10b981' if var_val > -0.10 else ('#fbbf24' if var_val > -0.20 else '#ef4444')
                        var_status = 'Low Risk' if var_val > -0.10 else ('Moderate Risk' if var_val > -0.20 else 'High Risk')
                        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #0891b2); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">⚠️</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">VaR {confidence_level}%</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {var_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{var_val:.2%}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #67e8f9; margin: 0; font-weight: 600;">{var_status}</p></div></div>', unsafe_allow_html=True)

                    # CVaR 95%
                    with col4:
                        cvar_val = metrics['CVaR 95%']
                        cvar_color = '#10b981' if cvar_val > -0.15 else ('#fbbf24' if cvar_val > -0.25 else '#ef4444')
                        cvar_status = 'Low Tail Risk' if cvar_val > -0.15 else ('Moderate Tail Risk' if cvar_val > -0.25 else 'High Tail Risk')
                        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(239,68,68,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(239,68,68,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ef4444, #dc2626); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🔻</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CVaR {confidence_level}%</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {cvar_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{cvar_val:.2%}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(239,68,68,0.12); border-radius: 10px; border: 1px solid rgba(239,68,68,0.25);"><p style="font-size: 0.7rem; color: #fca5a5; margin: 0; font-weight: 600;">{cvar_status}</p></div></div>', unsafe_allow_html=True)

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

    # ========================================================================
    # MARKET WATCH (ATLAS Market Watch Integration)

