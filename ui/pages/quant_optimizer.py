"""
ATLAS Terminal - Quant Optimizer Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_quant_optimizer(start_date, end_date, selected_benchmark):
    """Render the Quant Optimizer page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import ATLASFormatter
    from ui.components import ATLAS_TEMPLATE

    import plotly.graph_objects as go
    import plotly.express as px
    import numpy as np

    st.markdown("### 🧮 Quantitative Portfolio Optimizer")
    st.markdown("**Advanced Optimization using Multivariable Calculus & Analytical Gradients**")

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

        st.markdown("---")

        # Optimization method selection
        opt_tab1, opt_tab2, opt_tab3 = st.tabs(["📊 Classic Sharpe", "🎯 PM-Grade (Sortino)", "🎯 Position-Aware Rebalancing"])

        with opt_tab1:
            st.markdown("#### Classic Mean-Variance Optimization")
            st.caption("Traditional Sharpe ratio optimization (penalizes all volatility)")

            # Configuration
            col1, col2, col3 = st.columns(3)
            with col1:
                risk_free_rate = st.number_input("Risk-Free Rate", min_value=0.0, max_value=0.10, value=0.04, step=0.001, format="%.3f", key="classic_rf")
            with col2:
                min_weight = st.number_input("Min Weight per Asset", min_value=0.0, max_value=0.20, value=0.01, step=0.01, format="%.2f", key="classic_min")
            with col3:
                max_weight = st.number_input("Max Weight per Asset", min_value=0.20, max_value=1.0, value=0.40, step=0.05, format="%.2f", key="classic_max")

            if st.button("🚀 Optimize Portfolio (Max Sharpe Ratio)", type="primary", key="classic_optimize"):
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

                        # Maximum Sharpe Ratio
                        with col1:
                            sharpe_color = '#10b981' if optimal_sharpe > 2.0 else ('#fbbf24' if optimal_sharpe > 1.0 else '#ef4444')
                            sharpe_status = 'Excellent' if optimal_sharpe > 2.0 else ('Good' if optimal_sharpe > 1.0 else 'Fair')
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🎯</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">MAXIMUM SHARPE RATIO</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {sharpe_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{optimal_sharpe:.3f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{sharpe_status}</p></div></div>', unsafe_allow_html=True)

                        # Expected Return
                        with col2:
                            ret_color = '#10b981' if optimal_return > 0.10 else ('#fbbf24' if optimal_return > 0.05 else '#ef4444')
                            ret_status = 'Strong Growth' if optimal_return > 0.10 else ('Moderate Growth' if optimal_return > 0.05 else 'Low Growth')
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">EXPECTED RETURN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {ret_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{optimal_return:+.2%}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{ret_status}</p></div></div>', unsafe_allow_html=True)

                        # Volatility
                        with col3:
                            vol_color = '#10b981' if optimal_vol < 0.15 else ('#fbbf24' if optimal_vol < 0.25 else '#ef4444')
                            vol_status = 'Low Risk' if optimal_vol < 0.15 else ('Moderate Risk' if optimal_vol < 0.25 else 'High Risk')
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #0891b2); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">VOLATILITY</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {vol_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{optimal_vol:.2%}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #67e8f9; margin: 0; font-weight: 600;">{vol_status}</p></div></div>', unsafe_allow_html=True)

                        # Convergence
                        with col4:
                            convergence_val = "Success" if result.success else "Warning"
                            convergence_color = '#10b981' if result.success else '#fbbf24'
                            convergence_icon = '✅' if result.success else '⚠️'
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(245,158,11,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #f59e0b, #d97706); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🔄</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CONVERGENCE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {convergence_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{convergence_icon}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(245,158,11,0.12); border-radius: 10px; border: 1px solid rgba(245,158,11,0.25);"><p style="font-size: 0.7rem; color: #fbbf24; margin: 0; font-weight: 600;">{convergence_val}</p></div></div>', unsafe_allow_html=True)

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

                        # ===================================================================
                        # REBALANCING PLAN (from Risk Analysis VaR/CVaR optimizer)
                        # ===================================================================
                        st.markdown("---")
                        st.markdown("#### 🔄 Rebalancing Plan")

                        # Generate rebalancing plan with BUY/SELL/HOLD actions
                        rebalancing_df, rebalance_metrics = optimizer.generate_rebalancing_plan(
                            optimal_weights,
                            portfolio_data,
                            currency_symbol
                        )

                        if rebalancing_df is not None and rebalance_metrics is not None:
                            # Display rebalancing metrics
                            col1, col2, col3, col4 = st.columns(4)

                            with col1:
                                st.metric(
                                    "Total Trades",
                                    rebalance_metrics['total_trades'],
                                    f"{rebalance_metrics['buy_trades']} BUY / {rebalance_metrics['sell_trades']} SELL"
                                )

                            with col2:
                                st.metric(
                                    "Turnover",
                                    f"{rebalance_metrics['turnover_pct']:.1f}%",
                                    help="Percentage of portfolio being rebalanced"
                                )

                            with col3:
                                st.metric(
                                    "Buy Value",
                                    f"{currency_symbol}{rebalance_metrics['total_buy_value']:,.0f}",
                                    help="Total value of BUY orders"
                                )

                            with col4:
                                st.metric(
                                    "Trading Cost (est.)",
                                    f"{currency_symbol}{rebalance_metrics['estimated_trading_cost']:,.0f}",
                                    help="Estimated trading costs (0.1% of turnover)"
                                )

                            # Display rebalancing table
                            st.markdown("**Rebalancing Actions:**")

                            # Style the dataframe
                            def color_action(val):
                                if val == 'BUY':
                                    return 'background-color: rgba(16,185,129,0.2); color: #10b981'
                                elif val == 'SELL':
                                    return 'background-color: rgba(239,68,68,0.2); color: #ef4444'
                                else:
                                    return 'background-color: rgba(148,163,184,0.1); color: #94a3b8'

                            styled_rebalance_df = rebalancing_df[['Ticker', 'Current Weight (%)', 'Optimal Weight (%)',
                                                                  'Weight Diff (%)', 'Shares to Trade', 'Trade Value', 'Action']].style.applymap(
                                color_action, subset=['Action']
                            ).format({
                                'Current Weight (%)': '{:.2f}%',
                                'Optimal Weight (%)': '{:.2f}%',
                                'Weight Diff (%)': '{:+.2f}%',
                                'Trade Value': f'{currency_symbol}{{:,.0f}}'
                            })

                            make_scrollable_table(styled_rebalance_df, height=400, hide_index=True, use_container_width=True)

                            # ===================================================================
                            # MONTE CARLO PORTFOLIO SIMULATION
                            # Compare Current vs Optimized Portfolio with Probability Analysis
                            # ===================================================================
                            st.markdown("---")
                            st.markdown("#### 🎲 Monte Carlo Portfolio Simulation")
                            st.caption("Stochastic forecasting with probability-weighted returns for current vs optimized portfolios")

                            # Monte Carlo configuration
                            mc_col1, mc_col2, mc_col3 = st.columns(3)
                            with mc_col1:
                                n_simulations = st.number_input(
                                    "Number of Simulations",
                                    min_value=1000,
                                    max_value=50000,
                                    value=10000,
                                    step=1000,
                                    key="mc_simulations_classic"
                                )
                            with mc_col2:
                                time_horizon = st.number_input(
                                    "Time Horizon (days)",
                                    min_value=30,
                                    max_value=756,
                                    value=252,
                                    step=30,
                                    key="mc_horizon_classic"
                                )
                            with mc_col3:
                                use_prob_returns = st.checkbox(
                                    "Use Probability-Weighted Returns",
                                    value=True,
                                    help="Use quant probability weighting (recent=50%, medium=30%, long-term=20%) with momentum and vol adjustments",
                                    key="mc_prob_returns_classic"
                                )

                            if st.button("🚀 Run Monte Carlo Simulation", type="secondary", key="run_mc_classic"):
                                with st.spinner("Running Monte Carlo simulations for current and optimized portfolios..."):
                                    try:
                                        from analytics.stochastic import PortfolioMonteCarloEngine

                                        # Calculate current portfolio weights
                                        if 'Total Value' in portfolio_data.columns:
                                            total_value = portfolio_data['Total Value'].sum()
                                        else:
                                            total_value = (portfolio_data['Quantity'] * portfolio_data['Current Price']).sum()

                                        current_weights_dict = {}
                                        for ticker in tickers:
                                            ticker_data = portfolio_data[portfolio_data[ticker_column] == ticker]
                                            if len(ticker_data) > 0:
                                                if 'Total Value' in ticker_data.columns:
                                                    ticker_value = ticker_data['Total Value'].sum()
                                                else:
                                                    ticker_value = (ticker_data['Quantity'] * ticker_data['Current Price']).sum()
                                                current_weights_dict[ticker] = ticker_value / total_value
                                            else:
                                                current_weights_dict[ticker] = 0.0

                                        # Create aligned current weights array
                                        current_weights = np.array([current_weights_dict.get(ticker, 0.0) for ticker in returns.columns])

                                        # Initialize Monte Carlo engine
                                        mc_engine = PortfolioMonteCarloEngine(
                                            returns=returns,
                                            current_weights=current_weights,
                                            tickers=list(returns.columns),
                                            initial_portfolio_value=total_value
                                        )

                                        # Run comparison simulation
                                        comparison_results = mc_engine.compare_portfolios(
                                            optimized_weights=optimal_weights,
                                            n_simulations=n_simulations,
                                            time_horizon_days=time_horizon,
                                            random_seed=42
                                        )

                                        # Display comparison metrics
                                        st.markdown("##### 📊 Portfolio Comparison: Current vs Optimized")

                                        # Key improvements
                                        improvement = comparison_results['improvement']

                                        imp_col1, imp_col2, imp_col3, imp_col4 = st.columns(4)

                                        with imp_col1:
                                            delta_return = improvement['expected_return_improvement']
                                            delta_color = "normal" if delta_return > 0 else "inverse"
                                            st.metric(
                                                "Expected Return Δ",
                                                f"{delta_return:+.2%}",
                                                delta=f"{delta_return:+.2%}",
                                                delta_color=delta_color
                                            )

                                        with imp_col2:
                                            delta_sharpe = improvement['sharpe_improvement']
                                            delta_color = "normal" if delta_sharpe > 0 else "inverse"
                                            st.metric(
                                                "Sharpe Ratio Δ",
                                                f"{delta_sharpe:+.3f}",
                                                delta=f"{delta_sharpe:+.3f}",
                                                delta_color=delta_color
                                            )

                                        with imp_col3:
                                            delta_var = improvement['var_95_improvement']
                                            delta_color = "normal" if delta_var > 0 else "inverse"
                                            st.metric(
                                                "VaR 95% Δ (Risk Reduction)",
                                                f"{delta_var:+.2%}",
                                                delta=f"{delta_var:+.2%}",
                                                delta_color=delta_color,
                                                help="Positive = less downside risk"
                                            )

                                        with imp_col4:
                                            delta_sortino = improvement['sortino_improvement']
                                            delta_color = "normal" if delta_sortino > 0 else "inverse"
                                            st.metric(
                                                "Sortino Ratio Δ",
                                                f"{delta_sortino:+.3f}",
                                                delta=f"{delta_sortino:+.3f}",
                                                delta_color=delta_color
                                            )

                                        # Side-by-side portfolio metrics
                                        st.markdown("##### 📈 Detailed Portfolio Metrics")

                                        metrics_col1, metrics_col2 = st.columns(2)

                                        with metrics_col1:
                                            st.markdown("**Current Portfolio**")
                                            current_metrics = comparison_results['current'].metrics

                                            metrics_data_current = {
                                                'Metric': [
                                                    'Expected Return',
                                                    'Volatility',
                                                    'Sharpe Ratio',
                                                    'Sortino Ratio',
                                                    'VaR 95%',
                                                    'CVaR 95%',
                                                    'Median Return',
                                                    'Downside Deviation'
                                                ],
                                                'Value': [
                                                    f"{current_metrics['expected_return']:.2%}",
                                                    f"{current_metrics['volatility']:.2%}",
                                                    f"{current_metrics['sharpe_ratio']:.3f}",
                                                    f"{current_metrics['sortino_ratio']:.3f}",
                                                    f"{current_metrics['var_95_pct']:.2%}",
                                                    f"{current_metrics['cvar_95_pct']:.2%}",
                                                    f"{current_metrics['median_return']:.2%}",
                                                    f"{current_metrics['downside_deviation']:.2%}"
                                                ]
                                            }
                                            st.dataframe(pd.DataFrame(metrics_data_current), hide_index=True, use_container_width=True)

                                        with metrics_col2:
                                            st.markdown("**Optimized Portfolio**")
                                            optimized_metrics = comparison_results['optimized'].metrics

                                            metrics_data_optimized = {
                                                'Metric': [
                                                    'Expected Return',
                                                    'Volatility',
                                                    'Sharpe Ratio',
                                                    'Sortino Ratio',
                                                    'VaR 95%',
                                                    'CVaR 95%',
                                                    'Median Return',
                                                    'Downside Deviation'
                                                ],
                                                'Value': [
                                                    f"{optimized_metrics['expected_return']:.2%}",
                                                    f"{optimized_metrics['volatility']:.2%}",
                                                    f"{optimized_metrics['sharpe_ratio']:.3f}",
                                                    f"{optimized_metrics['sortino_ratio']:.3f}",
                                                    f"{optimized_metrics['var_95_pct']:.2%}",
                                                    f"{optimized_metrics['cvar_95_pct']:.2%}",
                                                    f"{optimized_metrics['median_return']:.2%}",
                                                    f"{optimized_metrics['downside_deviation']:.2%}"
                                                ]
                                            }
                                            st.dataframe(pd.DataFrame(metrics_data_optimized), hide_index=True, use_container_width=True)

                                        # Probability distributions
                                        st.markdown("##### 🎯 Probability Analysis")

                                        prob_col1, prob_col2 = st.columns(2)

                                        with prob_col1:
                                            st.markdown("**Current Portfolio Probabilities**")
                                            current_probs = comparison_results['current'].probabilities
                                            prob_df_current = pd.DataFrame({
                                                'Outcome': list(current_probs.keys()),
                                                'Probability': [f"{v:.1f}%" for v in current_probs.values()]
                                            })
                                            st.dataframe(prob_df_current, hide_index=True, use_container_width=True)

                                        with prob_col2:
                                            st.markdown("**Optimized Portfolio Probabilities**")
                                            optimized_probs = comparison_results['optimized'].probabilities
                                            prob_df_optimized = pd.DataFrame({
                                                'Outcome': list(optimized_probs.keys()),
                                                'Probability': [f"{v:.1f}%" for v in optimized_probs.values()]
                                            })
                                            st.dataframe(prob_df_optimized, hide_index=True, use_container_width=True)

                                        # Visualizations
                                        st.markdown("##### 📊 Monte Carlo Path Distributions")

                                        # Plot comparison of return distributions
                                        fig_dist = go.Figure()

                                        # Current portfolio distribution
                                        fig_dist.add_trace(go.Histogram(
                                            x=comparison_results['current'].final_returns,
                                            nbinsx=50,
                                            name='Current Portfolio',
                                            marker_color='rgba(239,68,68,0.6)',
                                            opacity=0.7
                                        ))

                                        # Optimized portfolio distribution
                                        fig_dist.add_trace(go.Histogram(
                                            x=comparison_results['optimized'].final_returns,
                                            nbinsx=50,
                                            name='Optimized Portfolio',
                                            marker_color='rgba(16,185,129,0.6)',
                                            opacity=0.7
                                        ))

                                        # Add VaR lines
                                        fig_dist.add_vline(
                                            x=current_metrics['var_95_pct'],
                                            line_dash="dash",
                                            line_color="rgba(239,68,68,0.8)",
                                            annotation_text=f"Current VaR 95%: {current_metrics['var_95_pct']:.2%}"
                                        )

                                        fig_dist.add_vline(
                                            x=optimized_metrics['var_95_pct'],
                                            line_dash="dash",
                                            line_color="rgba(16,185,129,0.8)",
                                            annotation_text=f"Optimized VaR 95%: {optimized_metrics['var_95_pct']:.2%}"
                                        )

                                        fig_dist.update_layout(
                                            title=f"Return Distribution Comparison ({n_simulations:,} simulations, {time_horizon} days)",
                                            xaxis_title="Portfolio Return",
                                            yaxis_title="Frequency",
                                            barmode='overlay',
                                            height=500
                                        )
                                        apply_chart_theme(fig_dist)
                                        st.plotly_chart(fig_dist, use_container_width=True)

                                        # Sample paths visualization
                                        st.markdown("##### 📈 Sample Portfolio Value Paths")

                                        fig_paths = go.Figure()

                                        # Plot sample paths for current portfolio
                                        n_sample_paths = min(50, n_simulations)
                                        for i in range(n_sample_paths):
                                            fig_paths.add_trace(go.Scatter(
                                                y=comparison_results['current'].portfolio_paths[i, :],
                                                mode='lines',
                                                line=dict(width=0.5, color='rgba(239,68,68,0.1)'),
                                                showlegend=False,
                                                hoverinfo='skip'
                                            ))

                                        # Plot sample paths for optimized portfolio
                                        for i in range(n_sample_paths):
                                            fig_paths.add_trace(go.Scatter(
                                                y=comparison_results['optimized'].portfolio_paths[i, :],
                                                mode='lines',
                                                line=dict(width=0.5, color='rgba(16,185,129,0.1)'),
                                                showlegend=False,
                                                hoverinfo='skip'
                                            ))

                                        # Add mean paths
                                        mean_current = comparison_results['current'].portfolio_paths.mean(axis=0)
                                        mean_optimized = comparison_results['optimized'].portfolio_paths.mean(axis=0)

                                        fig_paths.add_trace(go.Scatter(
                                            y=mean_current,
                                            mode='lines',
                                            name='Current (Mean)',
                                            line=dict(width=3, color='#ef4444')
                                        ))

                                        fig_paths.add_trace(go.Scatter(
                                            y=mean_optimized,
                                            mode='lines',
                                            name='Optimized (Mean)',
                                            line=dict(width=3, color='#10b981')
                                        ))

                                        fig_paths.update_layout(
                                            title=f"Portfolio Value Evolution: Current vs Optimized",
                                            xaxis_title="Days",
                                            yaxis_title=f"Portfolio Value ({currency_symbol})",
                                            height=500
                                        )
                                        apply_chart_theme(fig_paths)
                                        st.plotly_chart(fig_paths, use_container_width=True)

                                        st.success("✅ Monte Carlo simulation completed successfully!")
                                        st.info(f"💡 Simulation used {'probability-weighted' if use_prob_returns else 'historical'} expected returns with {n_simulations:,} scenarios over {time_horizon} trading days")

                                    except Exception as e:
                                        st.error(f"❌ Monte Carlo simulation error: {str(e)}")
                                        import traceback
                                        st.code(traceback.format_exc())
                                        st.info("💡 Ensure analytics module is properly installed")

                            st.success("✅ Portfolio optimization completed successfully!")
                            st.info("💡 This optimization uses analytical gradients (∂Sharpe/∂w_i) and SLSQP algorithm for maximum precision")
                        else:
                            # Fallback to simple comparison if rebalancing plan fails
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

        with opt_tab2:
            st.markdown("#### PM-Grade Portfolio Optimization")
            st.caption("Institutional-grade optimization using Sortino ratio, regime awareness, and forward-looking returns")

            if not PM_OPTIMIZATION_AVAILABLE:
                st.error("❌ PM-Grade Optimization module not available")
                st.info("The PM optimization module failed to load. Using classic optimization only.")
            else:
                st.info("""
                **🎯 PM-Grade Features:**
                - **Asymmetric Risk**: Sortino ratio (doesn't penalize upside volatility)
                - **Regime Awareness**: Detects growth/value and risk-on/off environments
                - **Forward-Looking Returns**: Blends momentum, trend, and mean reversion
                - **PM-Level Thinking**: Qualitative overlays on quantitative optimization

                **Philosophy:** Think like a PM, optimize like a quant
                """)

                # Strategy selection
                col1, col2, col3 = st.columns(3)

                with col1:
                    strategy = st.selectbox(
                        "Investment Strategy",
                        ['aggressive', 'balanced', 'defensive'],
                        format_func=lambda x: {
                            'aggressive': '🚀 Aggressive (High Growth)',
                            'balanced': '⚖️ Balanced (Growth + Defense)',
                            'defensive': '🛡️ Defensive (Capital Preservation)'
                        }[x],
                        key="pm_strategy"
                    )

                with col2:
                    # Max concentration per position
                    max_position = {
                        'aggressive': 0.40,
                        'balanced': 0.25,
                        'defensive': 0.15
                    }[strategy]
                    st.metric("Max Position Size", f"{max_position:.0%}")

                with col3:
                    # Risk-free rate
                    rf_rate = st.number_input(
                        "Risk-Free Rate",
                        min_value=0.0,
                        max_value=0.10,
                        value=0.02,
                        step=0.001,
                        format="%.3f",
                        key="pm_rf"
                    )

                if st.button("🚀 Run PM-Grade Optimization", type="primary", key="pm_optimize"):
                    with st.spinner("Running PM-grade optimization..."):
                        try:
                            # Get tickers
                            ticker_column = 'Symbol' if 'Symbol' in portfolio_data.columns else 'Ticker'
                            tickers = portfolio_data[ticker_column].unique().tolist()

                            # Download historical data
                            hist_data = yf.download(tickers, period='2y', progress=False)['Close']

                            if isinstance(hist_data, pd.Series):
                                hist_data = hist_data.to_frame()

                            # Calculate returns
                            returns = hist_data.pct_change().dropna()

                            # Create sector map (simplified - you can enhance this)
                            sector_map = {}
                            for ticker in tickers:
                                try:
                                    ticker_info = yf.Ticker(ticker)
                                    sector = ticker_info.info.get('sector', 'Unknown')
                                    sector_map[ticker] = sector
                                except:
                                    sector_map[ticker] = 'Unknown'

                            # Initialize PM-grade optimizer
                            optimizer = PMGradeOptimizer(returns, sector_map)

                            # Run optimization
                            results = optimizer.optimize(strategy=strategy)

                            if results['optimization_success']:
                                # Display regime analysis
                                display_regime_analysis(results['regime'])

                                # Display optimization results
                                display_optimization_results(results, tickers)

                                # ===================================================================
                                # MONTE CARLO PORTFOLIO SIMULATION (PM-GRADE)
                                # Compare Current vs PM-Grade Optimized Portfolio
                                # ===================================================================
                                st.markdown("---")
                                st.markdown("#### 🎲 Monte Carlo Portfolio Simulation")
                                st.caption("Stochastic forecasting with probability-weighted returns for current vs PM-optimized portfolios")

                                # Monte Carlo configuration
                                mc_col1, mc_col2, mc_col3 = st.columns(3)
                                with mc_col1:
                                    n_simulations_pm = st.number_input(
                                        "Number of Simulations",
                                        min_value=1000,
                                        max_value=50000,
                                        value=10000,
                                        step=1000,
                                        key="mc_simulations_pm"
                                    )
                                with mc_col2:
                                    time_horizon_pm = st.number_input(
                                        "Time Horizon (days)",
                                        min_value=30,
                                        max_value=756,
                                        value=252,
                                        step=30,
                                        key="mc_horizon_pm"
                                    )
                                with mc_col3:
                                    use_prob_returns_pm = st.checkbox(
                                        "Use Probability-Weighted Returns",
                                        value=True,
                                        help="Use quant probability weighting with momentum and vol adjustments",
                                        key="mc_prob_returns_pm"
                                    )

                                if st.button("🚀 Run Monte Carlo Simulation", type="secondary", key="run_mc_pm"):
                                    with st.spinner("Running Monte Carlo simulations for PM-grade portfolio..."):
                                        try:
                                            from analytics.stochastic import PortfolioMonteCarloEngine

                                            # Calculate current portfolio weights
                                            if 'Total Value' in portfolio_data.columns:
                                                total_value = portfolio_data['Total Value'].sum()
                                            else:
                                                total_value = (portfolio_data['Quantity'] * portfolio_data['Current Price']).sum()

                                            current_weights_dict = {}
                                            for ticker in tickers:
                                                ticker_data = portfolio_data[portfolio_data[ticker_column] == ticker]
                                                if len(ticker_data) > 0:
                                                    if 'Total Value' in ticker_data.columns:
                                                        ticker_value = ticker_data['Total Value'].sum()
                                                    else:
                                                        ticker_value = (ticker_data['Quantity'] * ticker_data['Current Price']).sum()
                                                    current_weights_dict[ticker] = ticker_value / total_value
                                                else:
                                                    current_weights_dict[ticker] = 0.0

                                            # Create aligned current weights array
                                            current_weights = np.array([current_weights_dict.get(ticker, 0.0) for ticker in returns.columns])

                                            # Get PM-optimized weights
                                            pm_weights = results['weights']

                                            # Initialize Monte Carlo engine
                                            mc_engine = PortfolioMonteCarloEngine(
                                                returns=returns,
                                                current_weights=current_weights,
                                                tickers=list(returns.columns),
                                                initial_portfolio_value=total_value
                                            )

                                            # Run comparison simulation
                                            comparison_results = mc_engine.compare_portfolios(
                                                optimized_weights=pm_weights,
                                                n_simulations=n_simulations_pm,
                                                time_horizon_days=time_horizon_pm,
                                                random_seed=42
                                            )

                                            # Display comparison metrics
                                            st.markdown("##### 📊 Portfolio Comparison: Current vs PM-Optimized")

                                            # Key improvements
                                            improvement = comparison_results['improvement']

                                            imp_col1, imp_col2, imp_col3, imp_col4 = st.columns(4)

                                            with imp_col1:
                                                delta_return = improvement['expected_return_improvement']
                                                delta_color = "normal" if delta_return > 0 else "inverse"
                                                st.metric(
                                                    "Expected Return Δ",
                                                    f"{delta_return:+.2%}",
                                                    delta=f"{delta_return:+.2%}",
                                                    delta_color=delta_color
                                                )

                                            with imp_col2:
                                                delta_sortino = improvement['sortino_improvement']
                                                delta_color = "normal" if delta_sortino > 0 else "inverse"
                                                st.metric(
                                                    "Sortino Ratio Δ",
                                                    f"{delta_sortino:+.3f}",
                                                    delta=f"{delta_sortino:+.3f}",
                                                    delta_color=delta_color,
                                                    help="PM-Grade focuses on Sortino (downside risk only)"
                                                )

                                            with imp_col3:
                                                delta_var = improvement['var_95_improvement']
                                                delta_color = "normal" if delta_var > 0 else "inverse"
                                                st.metric(
                                                    "VaR 95% Δ (Risk Reduction)",
                                                    f"{delta_var:+.2%}",
                                                    delta=f"{delta_var:+.2%}",
                                                    delta_color=delta_color,
                                                    help="Positive = less downside risk"
                                                )

                                            with imp_col4:
                                                delta_sharpe = improvement['sharpe_improvement']
                                                delta_color = "normal" if delta_sharpe > 0 else "inverse"
                                                st.metric(
                                                    "Sharpe Ratio Δ",
                                                    f"{delta_sharpe:+.3f}",
                                                    delta=f"{delta_sharpe:+.3f}",
                                                    delta_color=delta_color
                                                )

                                            # Side-by-side comparison
                                            st.markdown("##### 📈 Detailed Comparison")

                                            comp_col1, comp_col2 = st.columns(2)

                                            with comp_col1:
                                                st.markdown("**Current Portfolio (Monte Carlo)**")
                                                current_mc = comparison_results['current'].metrics
                                                mc_data_current = {
                                                    'Metric': [
                                                        'Expected Return',
                                                        'Volatility',
                                                        'Sortino Ratio',
                                                        'Sharpe Ratio',
                                                        'VaR 95%',
                                                        'CVaR 95%',
                                                        'Probability of Profit'
                                                    ],
                                                    'Value': [
                                                        f"{current_mc['expected_return']:.2%}",
                                                        f"{current_mc['volatility']:.2%}",
                                                        f"{current_mc['sortino_ratio']:.3f}",
                                                        f"{current_mc['sharpe_ratio']:.3f}",
                                                        f"{current_mc['var_95_pct']:.2%}",
                                                        f"{current_mc['cvar_95_pct']:.2%}",
                                                        f"{comparison_results['current'].probabilities['Probability of Profit']:.1f}%"
                                                    ]
                                                }
                                                st.dataframe(pd.DataFrame(mc_data_current), hide_index=True, use_container_width=True)

                                            with comp_col2:
                                                st.markdown("**PM-Optimized Portfolio (Monte Carlo)**")
                                                optimized_mc = comparison_results['optimized'].metrics
                                                mc_data_optimized = {
                                                    'Metric': [
                                                        'Expected Return',
                                                        'Volatility',
                                                        'Sortino Ratio',
                                                        'Sharpe Ratio',
                                                        'VaR 95%',
                                                        'CVaR 95%',
                                                        'Probability of Profit'
                                                    ],
                                                    'Value': [
                                                        f"{optimized_mc['expected_return']:.2%}",
                                                        f"{optimized_mc['volatility']:.2%}",
                                                        f"{optimized_mc['sortino_ratio']:.3f}",
                                                        f"{optimized_mc['sharpe_ratio']:.3f}",
                                                        f"{optimized_mc['var_95_pct']:.2%}",
                                                        f"{optimized_mc['cvar_95_pct']:.2%}",
                                                        f"{comparison_results['optimized'].probabilities['Probability of Profit']:.1f}%"
                                                    ]
                                                }
                                                st.dataframe(pd.DataFrame(mc_data_optimized), hide_index=True, use_container_width=True)

                                            # Return distribution comparison
                                            st.markdown("##### 📊 Return Distribution Comparison")

                                            fig_dist = go.Figure()

                                            # Current portfolio
                                            fig_dist.add_trace(go.Histogram(
                                                x=comparison_results['current'].final_returns,
                                                nbinsx=50,
                                                name='Current Portfolio',
                                                marker_color='rgba(239,68,68,0.6)',
                                                opacity=0.7
                                            ))

                                            # PM-optimized portfolio
                                            fig_dist.add_trace(go.Histogram(
                                                x=comparison_results['optimized'].final_returns,
                                                nbinsx=50,
                                                name='PM-Optimized Portfolio',
                                                marker_color='rgba(139,92,246,0.6)',
                                                opacity=0.7
                                            ))

                                            # Add VaR lines
                                            fig_dist.add_vline(
                                                x=current_mc['var_95_pct'],
                                                line_dash="dash",
                                                line_color="rgba(239,68,68,0.8)",
                                                annotation_text=f"Current VaR: {current_mc['var_95_pct']:.2%}"
                                            )

                                            fig_dist.add_vline(
                                                x=optimized_mc['var_95_pct'],
                                                line_dash="dash",
                                                line_color="rgba(139,92,246,0.8)",
                                                annotation_text=f"PM-Optimized VaR: {optimized_mc['var_95_pct']:.2%}"
                                            )

                                            fig_dist.update_layout(
                                                title=f"Return Distribution: Current vs PM-Optimized ({n_simulations_pm:,} simulations, {time_horizon_pm} days)",
                                                xaxis_title="Portfolio Return",
                                                yaxis_title="Frequency",
                                                barmode='overlay',
                                                height=500
                                            )
                                            apply_chart_theme(fig_dist)
                                            st.plotly_chart(fig_dist, use_container_width=True)

                                            # Portfolio paths
                                            st.markdown("##### 📈 Portfolio Value Paths")

                                            fig_paths = go.Figure()

                                            # Sample paths
                                            n_sample = min(50, n_simulations_pm)
                                            for i in range(n_sample):
                                                fig_paths.add_trace(go.Scatter(
                                                    y=comparison_results['current'].portfolio_paths[i, :],
                                                    mode='lines',
                                                    line=dict(width=0.5, color='rgba(239,68,68,0.1)'),
                                                    showlegend=False,
                                                    hoverinfo='skip'
                                                ))

                                            for i in range(n_sample):
                                                fig_paths.add_trace(go.Scatter(
                                                    y=comparison_results['optimized'].portfolio_paths[i, :],
                                                    mode='lines',
                                                    line=dict(width=0.5, color='rgba(139,92,246,0.1)'),
                                                    showlegend=False,
                                                    hoverinfo='skip'
                                                ))

                                            # Mean paths
                                            mean_current = comparison_results['current'].portfolio_paths.mean(axis=0)
                                            mean_optimized = comparison_results['optimized'].portfolio_paths.mean(axis=0)

                                            fig_paths.add_trace(go.Scatter(
                                                y=mean_current,
                                                mode='lines',
                                                name='Current (Mean)',
                                                line=dict(width=3, color='#ef4444')
                                            ))

                                            fig_paths.add_trace(go.Scatter(
                                                y=mean_optimized,
                                                mode='lines',
                                                name='PM-Optimized (Mean)',
                                                line=dict(width=3, color='#8b5cf6')
                                            ))

                                            fig_paths.update_layout(
                                                title="Portfolio Value Evolution: Current vs PM-Optimized",
                                                xaxis_title="Days",
                                                yaxis_title="Portfolio Value",
                                                height=500
                                            )
                                            apply_chart_theme(fig_paths)
                                            st.plotly_chart(fig_paths, use_container_width=True)

                                            st.success("✅ Monte Carlo simulation completed!")
                                            st.info(f"💡 Simulation used {'probability-weighted' if use_prob_returns_pm else 'historical'} returns with regime awareness and asymmetric risk modeling")

                                        except Exception as e:
                                            st.error(f"❌ Monte Carlo simulation error: {str(e)}")
                                            import traceback
                                            st.code(traceback.format_exc())

                                # Store in session state
                                st.session_state['pm_optimization_results'] = results

                            else:
                                st.error("❌ Optimization did not converge. Try adjusting parameters.")

                        except Exception as e:
                            st.error(f"❌ PM Optimization error: {str(e)}")
                            import traceback
                            with st.expander("Error Details"):
                                st.code(traceback.format_exc())
                            st.info("💡 Ensure your portfolio has at least 3 positions with 2 years of historical data")

        with opt_tab3:
            st.markdown("#### Position-Aware Portfolio Rebalancing")
            st.caption("Optimize FROM your current positions with exact trade recommendations")

            st.info("""
            **🎯 Position-Aware Features:**
            - **Knows Current Holdings**: Optimizes from where you are TODAY
            - **Exact Trades**: Shows BUY/SELL/HOLD actions with dollar amounts
            - **Transaction Costs**: Accounts for spread and market impact
            - **Drift Constraints**: Limits max change per position (realistic)
            - **Net Benefit**: Only rebalances if improvement > costs

            **Philosophy:** Ground optimization in reality, not theory
            """)

            # Configuration
            col1, col2, col3 = st.columns(3)

            with col1:
                max_drift = st.slider(
                    "Max Position Change",
                    min_value=5,
                    max_value=30,
                    value=10,
                    step=5,
                    help="Maximum % change per position (e.g., 10% = can move from 20% to 30%)",
                    key="position_max_drift"
                ) / 100

            with col2:
                objective_choice = st.selectbox(
                    "Optimization Objective",
                    ['Sortino Ratio', 'Sharpe Ratio', 'Min Volatility'],
                    help="Sortino focuses on downside risk only",
                    key="position_objective"
                )

                objective_map = {
                    'Sortino Ratio': 'sortino',
                    'Sharpe Ratio': 'sharpe',
                    'Min Volatility': 'min_volatility'
                }
                objective = objective_map[objective_choice]

            with col3:
                max_position = st.number_input(
                    "Max Weight per Asset",
                    min_value=0.10,
                    max_value=1.0,
                    value=0.40,
                    step=0.05,
                    format="%.2f",
                    key="position_max_weight"
                )

            # Regime-Aware Toggle (Phase 3)
            st.markdown("---")
            use_regime_awareness = st.checkbox(
                "🌐 Use Regime-Aware Optimization",
                value=True,
                help="Apply market regime detection to tilt sector allocations based on current market conditions",
                key="use_regime_awareness"
            )

            if use_regime_awareness:
                st.info("""
                **🌐 Regime-Aware Enhancement:**
                - Detects current market regime (RISK-ON, RISK-OFF, TRANSITIONAL, NEUTRAL)
                - Applies sector tilts based on regime (e.g., overweight Tech in RISK-ON)
                - Adjusts expected returns using regime overlay
                - Provides regime context for each trade
                """)

            if st.button("🎯 Generate Rebalancing Plan", type="primary", key="position_optimize"):
                with st.spinner("Analyzing current portfolio and generating trades..."):
                    try:
                        # Get tickers
                        ticker_column = 'Symbol' if 'Symbol' in portfolio_data.columns else 'Ticker'
                        tickers = portfolio_data[ticker_column].unique().tolist()

                        # Download historical data
                        hist_data = yf.download(tickers, period='2y', progress=False)['Close']

                        if isinstance(hist_data, pd.Series):
                            hist_data = hist_data.to_frame()

                        # Calculate returns
                        returns = hist_data.pct_change().dropna()

                        # Calculate current portfolio
                        # Detect quantity column name (flexible: Shares, Quantity, Qty)
                        qty_col = None
                        for col in ['Shares', 'Quantity', 'Qty', 'shares', 'quantity', 'qty']:
                            if col in portfolio_data.columns:
                                qty_col = col
                                break

                        if 'Total Value' in portfolio_data.columns:
                            total_value = portfolio_data['Total Value'].sum()
                        elif qty_col and 'Current Price' in portfolio_data.columns:
                            total_value = (portfolio_data[qty_col] * portfolio_data['Current Price']).sum()
                        else:
                            st.error("❌ Portfolio data must have either 'Total Value' or both quantity column (Shares/Quantity/Qty) and 'Current Price'")
                            st.stop()

                        current_portfolio = {}
                        current_prices = {}

                        for ticker in tickers:
                            ticker_data = portfolio_data[portfolio_data[ticker_column] == ticker]
                            if len(ticker_data) > 0:
                                if 'Total Value' in ticker_data.columns:
                                    ticker_value = ticker_data['Total Value'].sum()
                                elif qty_col and 'Current Price' in ticker_data.columns:
                                    ticker_value = (ticker_data[qty_col] * ticker_data['Current Price']).sum()
                                else:
                                    ticker_value = 0

                                current_portfolio[ticker] = ticker_value / total_value

                                # Get current price
                                if 'Current Price' in ticker_data.columns:
                                    current_prices[ticker] = ticker_data['Current Price'].iloc[0]

                        # ================================================================
                        # REGIME-AWARE OR STANDARD OPTIMIZATION
                        # ================================================================
                        if use_regime_awareness:
                            from regime_aware_optimizer import RegimeAwarePositionOptimizer

                            # Create sector map from yfinance data
                            st.info("🔍 Fetching sector data for regime analysis...")
                            sector_map = {}
                            for ticker in tickers:
                                try:
                                    stock = yf.Ticker(ticker)
                                    info = stock.info
                                    sector_map[ticker] = info.get('sector', 'Unknown')
                                except:
                                    sector_map[ticker] = 'Unknown'

                            # Initialize Regime-Aware Optimizer
                            optimizer = RegimeAwarePositionOptimizer(
                                current_portfolio=current_portfolio,
                                returns_df=returns,
                                sector_map=sector_map,
                                portfolio_value=total_value,
                                current_prices=current_prices
                            )

                            # Run regime-aware optimization
                            results = optimizer.optimize_with_regime_awareness(
                                max_drift=max_drift,
                                objective=objective,
                                max_weight=max_position,
                                use_regime_tilts=True
                            )

                        else:
                            from position_aware_optimizer import PositionAwareOptimizer

                            # Initialize Position-Aware Optimizer
                            optimizer = PositionAwareOptimizer(
                                current_portfolio=current_portfolio,
                                returns_df=returns,
                                portfolio_value=total_value,
                                current_prices=current_prices
                            )

                            # Run optimization
                            results = optimizer.optimize_from_current(
                                max_drift=max_drift,
                                objective=objective,
                                max_weight=max_position
                            )

                        # ================================================================
                        # DISPLAY RESULTS
                        # ================================================================

                        st.markdown("---")

                        # ================================================================
                        # REGIME CLASSIFICATION (if regime-aware)
                        # ================================================================
                        if use_regime_awareness and 'regime' in results:
                            regime_info = results['regime']
                            regime = regime_info['regime']
                            regime_label = regime_info['regime_label']
                            confidence = regime_info['confidence']
                            score = regime_info['score']
                            max_score = regime_info['max_score']

                            # Regime banner colors
                            regime_colors = {
                                'risk_on': ('#10b981', '🟢'),
                                'risk_off': ('#ef4444', '🔴'),
                                'transitional': ('#f59e0b', '🟡'),
                                'neutral': ('#94a3b8', '⚪')
                            }
                            banner_color, regime_emoji = regime_colors.get(regime, ('#94a3b8', '⚪'))

                            st.markdown(f"""
                            <div style="background: linear-gradient(135deg, rgba(139,92,246,0.12), rgba(21,25,50,0.95));
                                        backdrop-filter: blur(24px); border-radius: 16px;
                                        border: 2px solid {banner_color}; padding: 1.5rem;
                                        box-shadow: 0 4px 24px rgba(0,0,0,0.3); margin-bottom: 1.5rem;">
                                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                                    <span style="font-size: 2rem;">{regime_emoji}</span>
                                    <div>
                                        <h3 style="margin: 0; color: {banner_color}; font-size: 1.5rem; font-weight: 800;">
                                            {regime_label} REGIME DETECTED
                                        </h3>
                                        <p style="margin: 0.25rem 0 0 0; color: #94a3b8; font-size: 0.9rem;">
                                            Confidence: {confidence:.0f}% | Score: {score:+d}/{max_score}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            """, unsafe_allow_html=True)

                            # Regime reasoning and sector tilts
                            with st.expander("🌐 Regime Analysis Details", expanded=False):
                                st.markdown("**Market Indicators:**")
                                for reason in regime_info['reasoning']:
                                    st.markdown(f"• {reason}")

                                st.markdown("---")
                                st.markdown("**Sector Tilts Applied:**")

                                sector_tilts = results.get('sector_tilts', {})
                                if sector_tilts:
                                    tilt_data = []
                                    for sector, tilt in sorted(sector_tilts.items(), key=lambda x: x[1], reverse=True):
                                        if tilt > 1.0:
                                            action = "OVERWEIGHT"
                                            color = "🟢"
                                        elif tilt < 1.0:
                                            action = "UNDERWEIGHT"
                                            color = "🔴"
                                        else:
                                            action = "NEUTRAL"
                                            color = "⚪"

                                        tilt_data.append({
                                            ' ': color,
                                            'Sector': sector,
                                            'Tilt': f"{tilt:.2f}x",
                                            'Action': action,
                                            'Weight Change': f"{(tilt - 1.0) * 100:+.0f}%"
                                        })

                                    tilt_df = pd.DataFrame(tilt_data)
                                    st.dataframe(tilt_df, use_container_width=True, hide_index=True)

                        st.markdown("### 📊 Rebalancing Analysis")

                        # Recommendation banner
                        if results['recommendation'] == 'REBALANCE':
                            st.success(f"""
                            ✅ **REBALANCING RECOMMENDED**

                            Net Benefit: **{currency_symbol}{results['net_benefit']:,.0f}**

                            Expected improvement ({results['improvement']['metric_name']}: {results['improvement']['metric_delta']:+.3f})
                            exceeds transaction costs ({currency_symbol}{results['costs']['total']:,.0f}).
                            """)
                        else:
                            st.warning(f"""
                            ⏸️ **HOLD CURRENT POSITIONS**

                            Net Benefit: **{currency_symbol}{results['net_benefit']:,.0f}**

                            Transaction costs ({currency_symbol}{results['costs']['total']:,.0f}) outweigh expected benefit
                            ({results['improvement']['metric_name']}: {results['improvement']['metric_delta']:+.3f}).
                            """)

                        # Current vs Target Metrics
                        st.markdown("#### 📈 Portfolio Metrics Comparison")

                        col1, col2 = st.columns(2)

                        with col1:
                            st.markdown("**Current Portfolio**")
                            current_m = results['current_metrics']
                            st.metric("Annual Return", f"{current_m['annual_return']:.2%}")
                            st.metric("Volatility", f"{current_m['annual_volatility']:.2%}")
                            st.metric("Sharpe Ratio", f"{current_m['sharpe_ratio']:.3f}")
                            st.metric("Sortino Ratio", f"{current_m['sortino_ratio']:.3f}")
                            st.metric("VaR 95%", f"{current_m['var_95']:.2%}")

                        with col2:
                            st.markdown("**Target Portfolio**")
                            target_m = results['target_metrics']
                            st.metric("Annual Return", f"{target_m['annual_return']:.2%}",
                                     delta=f"{results['improvement']['return_delta']:+.2%}")
                            st.metric("Volatility", f"{target_m['annual_volatility']:.2%}",
                                     delta=f"{results['improvement']['volatility_delta']:+.2%}",
                                     delta_color="inverse")
                            st.metric("Sharpe Ratio", f"{target_m['sharpe_ratio']:.3f}",
                                     delta=f"{results['improvement']['sharpe_delta']:+.3f}")
                            st.metric("Sortino Ratio", f"{target_m['sortino_ratio']:.3f}",
                                     delta=f"{results['improvement']['sortino_delta']:+.3f}")
                            st.metric("VaR 95%", f"{target_m['var_95']:.2%}",
                                     delta=f"{(target_m['var_95'] - current_m['var_95']):+.2%}",
                                     delta_color="inverse")

                        # Transaction Cost Breakdown
                        st.markdown("---")
                        st.markdown("#### 💰 Transaction Cost Analysis")

                        cost_col1, cost_col2, cost_col3, cost_col4 = st.columns(4)

                        with cost_col1:
                            st.metric("Spread Cost", f"{currency_symbol}{results['costs']['spread']:,.0f}",
                                     help="Bid-ask spread cost (~5 bps)")

                        with cost_col2:
                            st.metric("Market Impact", f"{currency_symbol}{results['costs']['impact']:,.0f}",
                                     help="Price impact of large trades")

                        with cost_col3:
                            st.metric("Commission", f"{currency_symbol}{results['costs']['commission']:,.0f}",
                                     help="Broker commissions (usually $0)")

                        with cost_col4:
                            st.metric("Total Cost", f"{currency_symbol}{results['costs']['total']:,.0f}",
                                     help="Total transaction costs")

                        # Trade Details
                        if results['trades']:
                            st.markdown("---")
                            st.markdown("#### 📝 Required Trades")

                            st.caption(f"**{len(results['trades'])} trades required** | Sorted by dollar amount (largest first)")

                            # Create trades DataFrame
                            trades_display = []
                            for trade in results['trades']:
                                trades_display.append({
                                    'Action': trade['action'],
                                    'Ticker': trade['ticker'],
                                    'Current Weight': f"{trade['current_weight']:.2%}",
                                    'Target Weight': f"{trade['target_weight']:.2%}",
                                    'Change': f"{trade['delta_weight']:+.2%}",
                                    'Current Shares': f"{trade['current_shares']:,}",
                                    'Target Shares': f"{trade['target_shares']:,}",
                                    'Shares to Trade': f"{trade['delta_shares']:,}",
                                    'Dollar Amount': f"{currency_symbol}{trade['delta_value']:,.0f}",
                                    'Price': f"{currency_symbol}{trade['price']:.2f}"
                                })

                            trades_df = pd.DataFrame(trades_display)

                            # Style the dataframe
                            def color_action_row(row):
                                if row['Action'] == 'BUY':
                                    return ['background-color: rgba(16,185,129,0.1)'] * len(row)
                                else:
                                    return ['background-color: rgba(239,68,68,0.1)'] * len(row)

                            styled_trades = trades_df.style.apply(color_action_row, axis=1)

                            st.dataframe(styled_trades, use_container_width=True, hide_index=True)

                            # Regime-aware trade rationales
                            if use_regime_awareness and 'trade_rationales' in results:
                                st.markdown("---")
                                st.markdown("#### 🌐 Trade Rationales (Regime Context)")

                                for rationale in results['trade_rationales']:
                                    ticker = rationale['ticker']
                                    action = rationale['action']
                                    sector = rationale['sector']
                                    tilt = rationale['tilt']
                                    reason = rationale['reason']

                                    # Color based on action
                                    if action == 'BUY':
                                        icon = '📈'
                                        color = '#10b981'
                                    else:
                                        icon = '📉'
                                        color = '#ef4444'

                                    st.markdown(f"""
                                    <div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95));
                                                backdrop-filter: blur(24px); padding: 1rem; margin-bottom: 0.75rem;
                                                border-radius: 20px; border: 1px solid rgba(99,102,241,0.2);
                                                box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden;">
                                        <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, {color}, #6366f1); opacity: 0.8;"></div>
                                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                            <span style="font-size: 1.25rem;">{icon}</span>
                                            <strong style="color: {color}; font-size: 1rem;">{action} {ticker}</strong>
                                            <span style="color: #94a3b8; font-size: 0.85rem;">({sector} | Tilt: {tilt:.2f}x)</span>
                                        </div>
                                        <p style="margin: 0; color: #cbd5e1; font-size: 0.9rem; line-height: 1.5;">
                                            {reason}
                                        </p>
                                    </div>
                                    """, unsafe_allow_html=True)

                            # Download trades as CSV
                            csv = trades_df.to_csv(index=False)
                            st.download_button(
                                label="📥 Download Trade List (CSV)",
                                data=csv,
                                file_name="rebalancing_trades.csv",
                                mime="text/csv"
                            )

                        else:
                            st.info("✅ No trades required - portfolio is already optimal within drift constraints")

                        # Portfolio turnover
                        turnover = optimizer.calculate_turnover(
                            np.array([results['target_weights'][ticker] for ticker in returns.columns])
                        )

                        st.markdown("---")
                        st.info(f"""
                        **Portfolio Turnover:** {turnover:.1%}

                        This represents the percentage of your portfolio that would be traded.
                        Lower turnover = lower costs and tax impact.
                        """)

                    except Exception as e:
                        st.error(f"❌ Position-aware optimization error: {str(e)}")
                        import traceback
                        with st.expander("Error Details"):
                            st.code(traceback.format_exc())
                        st.info("💡 Ensure your portfolio has at least 2 positions with sufficient historical data")

    # ========================================================================
    # LEVERAGE TRACKER (v11.0) - NEW FEATURE

