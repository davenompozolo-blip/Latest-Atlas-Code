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
    from core import ATLASFormatter, load_portfolio_data, apply_chart_theme
    from ui.components import ATLAS_TEMPLATE
    from quant_optimizer.atlas_quant_portfolio_optimizer import PortfolioOptimizer
    import plotly.graph_objects as go
    import numpy as np
    import yfinance as yf

    @st.cache_data(ttl=60 * 30, show_spinner=False)
    def load_price_history(tickers, period="2y"):
        hist_data = yf.download(tickers, period=period, progress=False)['Close']
        if isinstance(hist_data, pd.Series):
            hist_data = hist_data.to_frame()
        return hist_data

    @st.cache_data(ttl=60 * 60, show_spinner=False)
    def load_sector_map(tickers):
        sector_map = {}
        for ticker in tickers:
            try:
                ticker_info = yf.Ticker(ticker)
                sector_map[ticker] = ticker_info.info.get('sector', 'Unknown')
            except Exception:
                sector_map[ticker] = 'Unknown'
        return sector_map

    st.markdown("### 🧮 Quantitative Portfolio Optimizer")
    st.markdown("**Centralized optimizer with objectives, constraints, and actionable rebalancing output**")

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
        st.markdown("#### Centralized Optimizer")
        st.caption("Select objectives, apply constraints, and generate an actionable rebalancing plan.")

        objective_options = {
            "Balanced (Max Sharpe)": "max_sharpe",
            "Risk-Off (Min Volatility)": "min_volatility",
            "Risk-On (Max Return, Volatility Cap)": "max_return"
        }

        col1, col2, col3 = st.columns(3)
        with col1:
            objective_label = st.selectbox(
                "Optimization Objective",
                list(objective_options.keys()),
                key="central_objective"
            )
        with col2:
            risk_free_rate = st.number_input(
                "Risk-Free Rate",
                min_value=0.0,
                max_value=0.10,
                value=0.04,
                step=0.001,
                format="%.3f",
                key="central_rf"
            )
        with col3:
            leverage = st.number_input(
                "Total Portfolio Leverage",
                min_value=0.5,
                max_value=3.0,
                value=1.0,
                step=0.1,
                format="%.1f",
                key="central_leverage"
            )

        constraint_col1, constraint_col2, constraint_col3 = st.columns(3)
        with constraint_col1:
            min_weight = st.number_input(
                "Min Weight per Asset",
                min_value=0.0,
                max_value=0.20,
                value=0.01,
                step=0.01,
                format="%.2f",
                key="central_min"
            )
        with constraint_col2:
            max_weight = st.number_input(
                "Max Weight per Asset",
                min_value=0.05,
                max_value=1.0,
                value=0.35,
                step=0.05,
                format="%.2f",
                key="central_max"
            )
        with constraint_col3:
            max_volatility = st.number_input(
                "Volatility Cap (Risk-On)",
                min_value=0.05,
                max_value=0.50,
                value=0.25,
                step=0.01,
                format="%.2f",
                key="central_vol_cap"
            )

        if st.button("🚀 Run Centralized Optimization", type="primary", key="central_optimize"):
            with st.spinner("Building market data and running optimization..."):
                try:
                    ticker_column = 'Symbol' if 'Symbol' in portfolio_data.columns else 'Ticker'
                    tickers = portfolio_data[ticker_column].dropna().unique().tolist()

                    if len(tickers) < 2:
                        st.error("❌ Please provide at least two tickers for optimization.")
                        st.stop()

                    hist_data = load_price_history(tickers, period='2y')
                    returns = hist_data.pct_change().dropna()

                    missing_data = hist_data.isna().mean().sort_values(ascending=False)
                    if missing_data.max() > 0.25:
                        st.warning("⚠️ Some tickers have more than 25% missing price data. Results may be unstable.")

                    sector_map = load_sector_map(tickers)
                    sector_counts = pd.Series(sector_map).value_counts()

                    st.markdown("##### 📊 Data Quality Snapshot")
                    missing_df = pd.DataFrame({
                        "Ticker": missing_data.index,
                        "Missing %": (missing_data.values * 100).round(1)
                    })
                    from core.atlas_table_formatting import render_generic_table
                    st.markdown(render_generic_table(missing_df, columns=[
                        {'key': 'Ticker', 'label': 'Ticker', 'type': 'ticker'},
                        {'key': 'Missing %', 'label': 'Missing %', 'type': 'change'},
                    ]), unsafe_allow_html=True)

                    st.markdown("##### 🧭 Sector Exposure")
                    sector_df = sector_counts.reset_index()
                    sector_df.columns = ['Sector', 'Holdings']
                    st.markdown(render_generic_table(sector_df, columns=[
                        {'key': 'Sector', 'label': 'Sector', 'type': 'ticker'},
                        {'key': 'Holdings', 'label': 'Holdings', 'type': 'text'},
                    ]), unsafe_allow_html=True)

                    sector_constraints_df = pd.DataFrame({
                        "Sector": sector_counts.index,
                        "Max Weight": [0.30] * len(sector_counts)
                    })
                    sector_constraints_df = st.data_editor(
                        sector_constraints_df,
                        num_rows="fixed",
                        use_container_width=True,
                        key="sector_constraints_editor"
                    )
                    sector_constraints = {
                        row["Sector"]: float(row["Max Weight"])
                        for _, row in sector_constraints_df.iterrows()
                        if row["Max Weight"] > 0
                    }

                    optimizer = PortfolioOptimizer(
                        returns=returns,
                        risk_free_rate=risk_free_rate,
                        leverage=leverage,
                        min_weight=min_weight,
                        max_weight=max_weight,
                        sector_map=sector_map,
                        sector_constraints=sector_constraints
                    )

                    objective_key = objective_options[objective_label]
                    if objective_key == "max_sharpe":
                        result = optimizer.optimize_sharpe()
                    elif objective_key == "min_volatility":
                        result = optimizer.optimize_min_volatility()
                    else:
                        result = optimizer.optimize_max_return(max_volatility=max_volatility)

                    optimal_weights = np.array([result['weights'][ticker] for ticker in returns.columns])
                    optimal_return = result['return']
                    optimal_vol = result['volatility']
                    optimal_sharpe = result['sharpe_ratio']

                    st.markdown("---")
                    st.markdown("#### 🎯 Optimization Results")

                    # Key metrics
                    col1, col2, col3, col4 = st.columns(4)

                    # Maximum Sharpe Ratio
                    with col1:
                        sharpe_color = '#10b981' if optimal_sharpe > 2.0 else ('#fbbf24' if optimal_sharpe > 1.0 else '#ef4444')
                        sharpe_status = 'Excellent' if optimal_sharpe > 2.0 else ('Good' if optimal_sharpe > 1.0 else 'Fair')
                        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🎯</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">MAXIMUM SHARPE RATIO</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {sharpe_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{optimal_sharpe:.2f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{sharpe_status}</p></div></div>', unsafe_allow_html=True)
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
                        convergence_val = "Success" if result.get('success') else "Warning"
                        convergence_color = '#10b981' if result.get('success') else '#fbbf24'
                        convergence_icon = '✅' if result.get('success') else '⚠️'
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
                    from core.atlas_table_formatting import render_generic_table
                    st.markdown(render_generic_table(weights_df, columns=[
                        {'key': 'Symbol', 'label': 'Symbol', 'type': 'ticker'},
                        {'key': 'Weight %', 'label': 'Weight', 'type': 'text'},
                    ]), unsafe_allow_html=True)

                    # ===================================================================
                    # REBALANCING PLAN
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

                        from core.atlas_table_formatting import render_generic_table
                        st.markdown(render_generic_table(
                            rebalancing_df[['Ticker', 'Current Weight (%)', 'Optimal Weight (%)',
                                          'Weight Diff (%)', 'Shares to Trade', 'Trade Value', 'Action']],
                            columns=[
                                {'key': 'Ticker', 'label': 'Ticker', 'type': 'ticker'},
                                {'key': 'Current Weight (%)', 'label': 'Current %', 'type': 'percent'},
                                {'key': 'Optimal Weight (%)', 'label': 'Optimal %', 'type': 'percent'},
                                {'key': 'Weight Diff (%)', 'label': 'Diff %', 'type': 'change'},
                                {'key': 'Shares to Trade', 'label': 'Shares', 'type': 'text'},
                                {'key': 'Trade Value', 'label': 'Trade Value', 'type': 'price'},
                                {'key': 'Action', 'label': 'Action', 'type': 'text'},
                            ]
                        ), unsafe_allow_html=True)

                        st.success("✅ Portfolio optimization completed successfully!")
                        st.info("💡 Results include constraints, sector caps, and an exportable rebalancing plan.")
                    else:
                        st.markdown("#### 🔄 Current vs Optimal Allocation")
                        qty_col = None
                        for col in ['Shares', 'Quantity', 'Qty', 'shares', 'quantity', 'qty']:
                            if col in portfolio_data.columns:
                                qty_col = col
                                break

                        if 'Total Value' in portfolio_data.columns:
                            total_value = portfolio_data['Total Value'].sum()
                            portfolio_data['Current Weight'] = portfolio_data['Total Value'] / total_value
                        elif qty_col and 'Current Price' in portfolio_data.columns:
                            total_value = (portfolio_data[qty_col] * portfolio_data['Current Price']).sum()
                            portfolio_data['Current Weight'] = (portfolio_data[qty_col] * portfolio_data['Current Price']) / total_value
                        else:
                            st.warning("⚠️ Missing pricing fields for current allocation comparison.")
                            total_value = 0
                            portfolio_data['Current Weight'] = 0

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

                        # Format weights as percentages for display
                        comp_display = comparison_df.copy()
                        comp_display['Current Weight'] = comp_display['Current Weight'].apply(lambda x: f"{x:.2%}")
                        comp_display['Optimal Weight'] = comp_display['Optimal Weight'].apply(lambda x: f"{x:.2%}")
                        comp_display['Change'] = comp_display['Change'].apply(lambda x: f"{x:+.2%}")
                        from core.atlas_table_formatting import render_generic_table
                        st.markdown(render_generic_table(comp_display, columns=[
                            {'key': 'Symbol', 'label': 'Symbol', 'type': 'ticker'},
                            {'key': 'Current Weight', 'label': 'Current', 'type': 'text'},
                            {'key': 'Optimal Weight', 'label': 'Optimal', 'type': 'text'},
                            {'key': 'Change', 'label': 'Change', 'type': 'change'},
                        ]), unsafe_allow_html=True)

                        st.success("✅ Portfolio optimization completed successfully!")
                        st.info("💡 Results include constraints and sector caps; enable pricing columns for full rebalancing output.")

                except Exception as e:
                    st.error(f"❌ Optimization error: {str(e)}")
                    st.info("💡 Ensure your portfolio has at least 2 positions with sufficient historical data")

    # ========================================================================
    # LEVERAGE TRACKER (v11.0) - NEW FEATURE
