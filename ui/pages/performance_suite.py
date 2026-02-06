"""
ATLAS Terminal - Performance Suite Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_performance_suite(start_date, end_date, selected_benchmark):
    """Render the Performance Suite page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import (
        ATLASFormatter, load_portfolio_data, create_enhanced_holdings_table,
        calculate_portfolio_returns, calculate_sharpe_ratio, calculate_max_drawdown,
        calculate_sortino_ratio, calculate_calmar_ratio, calculate_var,
        apply_chart_theme, make_scrollable_table, fetch_historical_data
    )
    from ui.components import ATLAS_TEMPLATE
    from datetime import datetime, timedelta
    import plotly.graph_objects as go
    import plotly.express as px
    from scipy import stats
    import numpy as np

    # Try to import optional functions
    try:
        from core import calculate_benchmark_returns
    except ImportError:
        def calculate_benchmark_returns(benchmark, start_date, end_date):
            """Fallback benchmark returns"""
            return None

    st.markdown('<h1 style="font-size: 2.5rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.5rem;"><span style="font-size: 2rem;">💎</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">PERFORMANCE SUITE</span></h1>', unsafe_allow_html=True)

    # CRITICAL FIX: Check session_state FIRST for fresh EE data
    if 'portfolio_df' in st.session_state and st.session_state['portfolio_df'] is not None and len(st.session_state['portfolio_df']) > 0:
        portfolio_data = st.session_state['portfolio_df']
    else:
        portfolio_data = load_portfolio_data()

    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        st.warning("No portfolio data available.")
        st.stop()

    # Don't wrap in pd.DataFrame() - it destroys attrs
    df = portfolio_data if isinstance(portfolio_data, pd.DataFrame) else pd.DataFrame(portfolio_data)
    enhanced_df = create_enhanced_holdings_table(df)

    # Get currency from session state
    currency_symbol = df.attrs.get('currency_symbol') or st.session_state.get('currency_symbol', '$')

    with st.spinner("Calculating portfolio metrics..."):
        portfolio_returns = calculate_portfolio_returns(df, start_date, end_date)
        benchmark_returns = calculate_benchmark_returns(selected_benchmark, start_date, end_date)

    # === TAB STRUCTURE ===
    tab1, tab2, tab3, tab4 = st.tabs([
        "📈 Portfolio Performance",
        "🎯 Individual Securities",
        "⚠️ Risk Decomposition",
        "📊 Attribution & Benchmarking"
    ])

    # ============================================================
    # TAB 1: PORTFOLIO PERFORMANCE (Enhanced)
    # ============================================================
    with tab1:
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">📈</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Portfolio Performance Metrics</span></h2>', unsafe_allow_html=True)

        if portfolio_returns is not None and len(portfolio_returns) > 0:

            # === KEY METRICS GRID ===
            col1, col2, col3, col4 = st.columns(4)

            # Total Return
            total_return = (1 + portfolio_returns).prod() - 1
            n_years = len(portfolio_returns) / 252
            annualized_return = (1 + total_return) ** (1/n_years) - 1 if n_years > 0 else 0

            # STORE FOR ATTRIBUTION SECTION TO USE
            st.session_state['portfolio_annualized_return'] = annualized_return * 100

            # Card 1: Annualized Return
            with col1:
                return_color = '#10b981' if annualized_return > 0 else '#ef4444'
                return_glow = '0 0 24px rgba(16,185,129,0.5)' if annualized_return > 0 else '0 0 24px rgba(239,68,68,0.5)'
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">ANNUALIZED RETURN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {return_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: {return_glow}; line-height: 1;">{annualized_return*100:+.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{total_return*100:.2f}% Total</p></div></div>', unsafe_allow_html=True)

            # Volatility
            annualized_vol = portfolio_returns.std() * np.sqrt(252)

            # Card 2: Annualized Volatility
            with col2:
                vol_color = '#67e8f9' if annualized_vol < 0.20 else ('#fbbf24' if annualized_vol < 0.30 else '#ef4444')
                vol_status = 'Low Vol' if annualized_vol < 0.20 else ('Moderate' if annualized_vol < 0.30 else 'High Vol')
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">ANNUALIZED VOLATILITY</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {vol_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{annualized_vol*100:.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">{vol_status}</p></div></div>', unsafe_allow_html=True)

            # Sharpe Ratio
            sharpe = calculate_sharpe_ratio(portfolio_returns)

            # Card 3: Sharpe Ratio
            with col3:
                sharpe_color = '#10b981' if sharpe and sharpe > 1.0 else ('#a5b4fc' if sharpe and sharpe > 0 else '#ef4444')
                sharpe_delta = 'Excellent' if sharpe and sharpe > 1.5 else ('Good' if sharpe and sharpe > 1.0 else 'Fair')
                sharpe_val = f"{sharpe:.2f}" if sharpe else "N/A"
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🔥</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">SHARPE RATIO</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {sharpe_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{sharpe_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{sharpe_delta}</p></div></div>', unsafe_allow_html=True)

            # Max Drawdown
            max_dd = calculate_max_drawdown(portfolio_returns)

            # Card 4: Max Drawdown
            with col4:
                maxdd_color = '#ef4444' if max_dd and abs(max_dd) > 30 else ('#fbbf24' if max_dd and abs(max_dd) > 20 else '#10b981')
                maxdd_val = f"{max_dd:.2f}%" if max_dd else "N/A"
                maxdd_status = '⚠️ Severe' if max_dd and abs(max_dd) > 30 else ('⚡ Moderate' if max_dd and abs(max_dd) > 20 else '✓ Low')
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(245,158,11,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #f59e0b, #d97706); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">⚠️</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">MAX DRAWDOWN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {maxdd_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(245,158,11,0.5); line-height: 1;">{maxdd_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(245,158,11,0.12); border-radius: 10px; border: 1px solid rgba(245,158,11,0.25);"><p style="font-size: 0.7rem; color: #fcd34d; margin: 0; font-weight: 600;">{maxdd_status}</p></div></div>', unsafe_allow_html=True)

            st.divider()

            # === RETURNS DISTRIBUTION ===
            col1, col2 = st.columns(2)

            with col1:
                st.subheader("Returns Distribution")

                # Histogram
                fig_hist = go.Figure()

                fig_hist.add_trace(go.Histogram(
                    x=portfolio_returns * 100,
                    nbinsx=50,
                    marker_color='#00d4ff',
                    opacity=0.7,
                    name='Daily Returns'
                ))

                # Add normal distribution overlay
                mean_return = portfolio_returns.mean() * 100
                std_return = portfolio_returns.std() * 100

                x_range = np.linspace(
                    portfolio_returns.min() * 100,
                    portfolio_returns.max() * 100,
                    100
                )

                normal_dist = stats.norm.pdf(x_range, mean_return, std_return)
                # Scale to match histogram
                normal_dist = normal_dist * len(portfolio_returns) * (x_range[1] - x_range[0])

                fig_hist.add_trace(go.Scatter(
                    x=x_range,
                    y=normal_dist,
                    mode='lines',
                    line=dict(color='#ff3366', width=2),
                    name='Normal Distribution'
                ))

                fig_hist.update_layout(
                    title="Daily Returns Distribution",
                    xaxis_title="Return (%)",
                    yaxis_title="Frequency",
                    height=400,
                    showlegend=True,
                    paper_bgcolor='rgba(0, 0, 0, 0)',
                    plot_bgcolor='rgba(10, 25, 41, 0.3)',
                    font=dict(color='#ffffff')
                )

                st.plotly_chart(fig_hist, use_container_width=True)

            with col2:
                st.subheader("Rolling Performance")

                # Rolling Sharpe Ratio (90-day)
                rolling_window = min(90, len(portfolio_returns) // 2)

                if rolling_window > 20:
                    rolling_sharpe = portfolio_returns.rolling(rolling_window).apply(
                        lambda x: (x.mean() / x.std() * np.sqrt(252)) if x.std() > 0 else 0
                    )

                    fig_rolling = go.Figure()

                    fig_rolling.add_trace(go.Scatter(
                        x=rolling_sharpe.index,
                        y=rolling_sharpe.values,
                        mode='lines',
                        line=dict(color='#00ff88', width=2),
                        fill='tozeroy',
                        fillcolor='rgba(0, 255, 136, 0.2)',
                        name='Rolling Sharpe'
                    ))

                    # Add 1.0 reference line
                    fig_rolling.add_hline(
                        y=1.0,
                        line_dash="dash",
                        line_color="#ffaa00",
                        annotation_text="Sharpe = 1.0 (Good)",
                        annotation_position="right"
                    )

                    fig_rolling.update_layout(
                        title=f"Rolling Sharpe Ratio ({rolling_window}-day)",
                        xaxis_title="Date",
                        yaxis_title="Sharpe Ratio",
                        height=400,
                        paper_bgcolor='rgba(0, 0, 0, 0)',
                        plot_bgcolor='rgba(10, 25, 41, 0.3)',
                        font=dict(color='#ffffff')
                    )

                    st.plotly_chart(fig_rolling, use_container_width=True)

            st.divider()

            # === ADVANCED METRICS ===
            st.markdown('<h3 style="font-size: 1.25rem; font-weight: 700; color: #f8fafc; margin-top: 1.5rem; margin-bottom: 1rem;"><span style="background: linear-gradient(135deg, #00d4ff, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Advanced Performance Metrics</span></h3>', unsafe_allow_html=True)

            metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)

            # Sortino Ratio
            sortino = calculate_sortino_ratio(portfolio_returns)

            with metric_col1:
                sortino_color = '#10b981' if sortino and sortino > 1.5 else ('#a5b4fc' if sortino and sortino > 0.5 else '#ef4444')
                sortino_status = 'Excellent' if sortino and sortino > 1.5 else ('Good' if sortino and sortino > 0.5 else 'Fair')
                sortino_val = f"{sortino:.2f}" if sortino else "N/A"
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📉</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">SORTINO RATIO</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {sortino_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{sortino_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{sortino_status}</p></div></div>', unsafe_allow_html=True)

            # Calmar Ratio
            calmar = calculate_calmar_ratio(portfolio_returns)

            with metric_col2:
                calmar_color = '#10b981' if calmar and calmar > 1.0 else ('#67e8f9' if calmar and calmar > 0 else '#ef4444')
                calmar_status = 'Strong' if calmar and calmar > 1.0 else ('Fair' if calmar and calmar > 0 else 'Weak')
                calmar_val = f"{calmar:.2f}" if calmar else "N/A"
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CALMAR RATIO</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {calmar_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{calmar_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">{calmar_status}</p></div></div>', unsafe_allow_html=True)

            # Win Rate
            win_rate = (portfolio_returns > 0).sum() / len(portfolio_returns) * 100

            with metric_col3:
                winrate_color = '#10b981' if win_rate > 55 else ('#fbbf24' if win_rate > 50 else '#ef4444')
                winrate_status = 'High Win %' if win_rate > 55 else ('Balanced' if win_rate > 50 else 'Low Win %')
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🎯</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">WIN RATE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {winrate_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{win_rate:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{winrate_status}</p></div></div>', unsafe_allow_html=True)

            # VaR (95%)
            var_95 = calculate_var(portfolio_returns, confidence=0.95)

            with metric_col4:
                var_color = '#ef4444' if var_95 and abs(var_95) > 15 else ('#fbbf24' if var_95 and abs(var_95) > 10 else '#10b981')
                var_status = '⚠️ High Risk' if var_95 and abs(var_95) > 15 else ('⚡ Moderate' if var_95 and abs(var_95) > 10 else '✓ Low')
                var_val = f"{var_95:.2f}%" if var_95 else "N/A"
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(239,68,68,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(239,68,68,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ef4444, #dc2626); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📉</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">VaR 95%</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {var_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(239,68,68,0.5); line-height: 1;">{var_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(239,68,68,0.12); border-radius: 10px; border: 1px solid rgba(239,68,68,0.25);"><p style="font-size: 0.7rem; color: #fca5a5; margin: 0; font-weight: 600;">{var_status}</p></div></div>', unsafe_allow_html=True)

    # ============================================================
    # TAB 2: INDIVIDUAL SECURITIES ANALYSIS (NEW - GAME CHANGER)
    # ============================================================
    with tab2:
        st.subheader("Individual Security Performance Analysis")

        st.info("🎯 Institutional-grade metrics for each holding - analyze like a professional fund manager")

        # Security selector
        selected_ticker = st.selectbox(
            "Select Security to Analyze:",
            options=enhanced_df['Ticker'].tolist(),
            index=0
        )

        if selected_ticker:
            # Get holding data
            holding = enhanced_df[enhanced_df['Ticker'] == selected_ticker].iloc[0]

            # Display header
            col1, col2, col3 = st.columns([2, 1, 1])

            with col1:
                st.markdown(f"### {holding.get('Asset Name', selected_ticker)} ({selected_ticker})")
                st.caption(f"Sector: {holding.get('Sector', 'Unknown')}")

            with col2:
                current_price = holding.get('Current Price', 0)
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💵</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CURRENT PRICE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #67e8f9; margin: 0.5rem 0 0.75rem 0; line-height: 1;">${current_price:.2f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">Live Quote</p></div></div>', unsafe_allow_html=True)

            with col3:
                weight = holding.get('Weight %', 0)
                weight_color = '#ef4444' if weight > 15 else ('#fbbf24' if weight > 10 else '#10b981')
                weight_status = 'High Conc.' if weight > 15 else ('Moderate' if weight > 10 else 'Balanced')
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">⚖️</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">PORTFOLIO WEIGHT</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {weight_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{weight:.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{weight_status}</p></div></div>', unsafe_allow_html=True)

            st.divider()

            # === CHART CONTROLS ===
            st.markdown("#### ⚙️ Chart Settings")

            ctrl_col1, ctrl_col2, ctrl_col3, ctrl_col4 = st.columns([2, 2, 2, 2])

            with ctrl_col1:
                time_range = st.selectbox(
                    "Time Period",
                    options=["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "Max"],
                    index=4  # Default to 1Y
                )

            with ctrl_col2:
                chart_type = st.selectbox(
                    "Chart Type",
                    options=["Candlestick", "Line"],
                    index=0
                )

            with ctrl_col3:
                show_volume = st.checkbox("Show Volume", value=True)

            with ctrl_col4:
                show_indicators = st.checkbox("Show Indicators", value=True)

            # Multi-security comparison
            st.markdown("#### 📊 Multi-Security Comparison")
            compare_mode = st.checkbox("Enable Comparison Mode", value=False)

            compare_tickers = [selected_ticker]
            if compare_mode:
                available_tickers = [t for t in enhanced_df['Ticker'].tolist() if t != selected_ticker]
                additional_tickers = st.multiselect(
                    "Add securities to compare:",
                    options=available_tickers,
                    max_selections=4,
                    help="Compare up to 5 securities total"
                )
                compare_tickers.extend(additional_tickers)

            # === CALCULATE DATE RANGE ===
            end_date_ticker = datetime.now()

            if time_range == "1M":
                start_date_ticker = end_date_ticker - timedelta(days=30)
            elif time_range == "3M":
                start_date_ticker = end_date_ticker - timedelta(days=90)
            elif time_range == "6M":
                start_date_ticker = end_date_ticker - timedelta(days=180)
            elif time_range == "YTD":
                start_date_ticker = datetime(end_date_ticker.year, 1, 1)
            elif time_range == "1Y":
                start_date_ticker = end_date_ticker - timedelta(days=365)
            elif time_range == "2Y":
                start_date_ticker = end_date_ticker - timedelta(days=730)
            elif time_range == "5Y":
                start_date_ticker = end_date_ticker - timedelta(days=1825)
            else:  # Max
                start_date_ticker = end_date_ticker - timedelta(days=3650)  # 10 years

            # === FETCH COMPREHENSIVE DATA FOR TICKER ===
            ticker_hist = fetch_historical_data(selected_ticker, start_date_ticker, end_date_ticker)

            if ticker_hist is not None and len(ticker_hist) > 20:

                # Calculate returns
                ticker_returns = ticker_hist['Close'].pct_change().dropna()

                # === PERFORMANCE METRICS ===
                st.markdown('<h3 style="font-size: 1.25rem; font-weight: 700; color: #f8fafc; margin-top: 1rem; margin-bottom: 1rem;"><span style="background: linear-gradient(135deg, #10b981, #059669); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">📈 Performance Metrics (1 Year)</span></h3>', unsafe_allow_html=True)

                perf_col1, perf_col2, perf_col3, perf_col4, perf_col5 = st.columns(5)

                # Total Return
                total_ret = ((ticker_hist['Close'].iloc[-1] / ticker_hist['Close'].iloc[0]) - 1) * 100

                with perf_col1:
                    total_ret_color = '#10b981' if total_ret > 0 else '#ef4444'
                    total_ret_glow = '0 0 24px rgba(16,185,129,0.5)' if total_ret > 0 else '0 0 24px rgba(239,68,68,0.5)'
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">TOTAL RETURN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {total_ret_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: {total_ret_glow}; line-height: 1;">{total_ret:+.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">Period Return</p></div></div>', unsafe_allow_html=True)

                # Annualized Return
                n_years_ticker = len(ticker_returns) / 252
                ann_ret = ((1 + total_ret/100) ** (1/n_years_ticker) - 1) * 100 if n_years_ticker > 0 else 0

                with perf_col2:
                    ann_ret_color = '#10b981' if ann_ret > 0 else '#ef4444'
                    ann_ret_status = 'Positive' if ann_ret > 0 else 'Negative'
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">ANNUALIZED RETURN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {ann_ret_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{ann_ret:+.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{ann_ret_status}</p></div></div>', unsafe_allow_html=True)

                # Volatility
                ann_vol_ticker = ticker_returns.std() * np.sqrt(252) * 100

                with perf_col3:
                    vol_ticker_color = '#67e8f9' if ann_vol_ticker < 20 else ('#fbbf24' if ann_vol_ticker < 30 else '#ef4444')
                    vol_ticker_status = 'Low Vol' if ann_vol_ticker < 20 else ('Moderate' if ann_vol_ticker < 30 else 'High Vol')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📉</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">VOLATILITY (ANN.)</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {vol_ticker_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{ann_vol_ticker:.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">{vol_ticker_status}</p></div></div>', unsafe_allow_html=True)

                # Sharpe Ratio
                sharpe_ticker = calculate_sharpe_ratio(ticker_returns)

                with perf_col4:
                    sharpe_ticker_color = '#10b981' if sharpe_ticker and sharpe_ticker > 1.0 else ('#a5b4fc' if sharpe_ticker and sharpe_ticker > 0 else '#ef4444')
                    sharpe_ticker_status = 'Excellent' if sharpe_ticker and sharpe_ticker > 1.5 else ('Good' if sharpe_ticker and sharpe_ticker > 1.0 else 'Fair')
                    sharpe_ticker_val = f"{sharpe_ticker:.2f}" if sharpe_ticker else "N/A"
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(245,158,11,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #f59e0b, #d97706); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🔥</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">SHARPE RATIO</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {sharpe_ticker_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{sharpe_ticker_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(245,158,11,0.12); border-radius: 10px; border: 1px solid rgba(245,158,11,0.25);"><p style="font-size: 0.7rem; color: #fcd34d; margin: 0; font-weight: 600;">{sharpe_ticker_status}</p></div></div>', unsafe_allow_html=True)

                # Max Drawdown
                max_dd_ticker = calculate_max_drawdown(ticker_returns)

                with perf_col5:
                    maxdd_ticker_color = '#ef4444' if max_dd_ticker and abs(max_dd_ticker) > 30 else ('#fbbf24' if max_dd_ticker and abs(max_dd_ticker) > 20 else '#10b981')
                    maxdd_ticker_val = f"{max_dd_ticker:.2f}%" if max_dd_ticker else "N/A"
                    maxdd_ticker_status = '⚠️ Severe' if max_dd_ticker and abs(max_dd_ticker) > 30 else ('⚡ Moderate' if max_dd_ticker and abs(max_dd_ticker) > 20 else '✓ Low')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(239,68,68,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(239,68,68,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ef4444, #dc2626); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">⚠️</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">MAX DRAWDOWN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {maxdd_ticker_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(239,68,68,0.5); line-height: 1;">{maxdd_ticker_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(239,68,68,0.12); border-radius: 10px; border: 1px solid rgba(239,68,68,0.25);"><p style="font-size: 0.7rem; color: #fca5a5; margin: 0; font-weight: 600;">{maxdd_ticker_status}</p></div></div>', unsafe_allow_html=True)

                st.divider()

                # === PRICE CHART WITH TECHNICAL INDICATORS ===
                if compare_mode and len(compare_tickers) > 1:
                    st.subheader("📊 Multi-Security Comparison")

                    # Fetch data for all comparison tickers
                    comparison_data = {}
                    colors = ['#00D4FF', '#FF4136', '#2ECC40', '#FFDC00', '#B10DC9']

                    for idx, ticker in enumerate(compare_tickers):
                        ticker_data = fetch_historical_data(ticker, start_date_ticker, end_date_ticker)
                        if ticker_data is not None and len(ticker_data) > 0:
                            # Normalize to base 100
                            normalized = (ticker_data['Close'] / ticker_data['Close'].iloc[0]) * 100
                            comparison_data[ticker] = {
                                'data': normalized,
                                'color': colors[idx % len(colors)]
                            }

                    # Create comparison chart
                    fig_compare = go.Figure()

                    for ticker, info in comparison_data.items():
                        fig_compare.add_trace(go.Scatter(
                            x=info['data'].index,
                            y=info['data'],
                            mode='lines',
                            name=ticker,
                            line=dict(color=info['color'], width=2),
                            hovertemplate=f'<b>{ticker}</b><br>Date: %{{x|%Y-%m-%d}}<br>Value: %{{y:.2f}}<extra></extra>'
                        ))

                    fig_compare.update_layout(
                        title=f"Normalized Price Comparison ({time_range}) - Base 100",
                        xaxis_title="Date",
                        yaxis_title="Normalized Value (Base 100)",
                        height=600,
                        hovermode='x unified',
                        legend=dict(
                            orientation="h",
                            yanchor="bottom",
                            y=1.02,
                            xanchor="right",
                            x=1
                        )
                    )

                    fig_compare.add_hline(
                        y=100,
                        line_dash="dot",
                        line_color=COLORS['text_muted'],
                        line_width=1,
                        annotation_text="Starting Value"
                    )

                    apply_chart_theme(fig_compare)
                    st.plotly_chart(fig_compare, use_container_width=True)

                    # Comparison metrics table
                    st.markdown("##### Performance Comparison")
                    comparison_metrics = []

                    for ticker in compare_tickers:
                        ticker_data = fetch_historical_data(ticker, start_date_ticker, end_date_ticker)
                        if ticker_data is not None and len(ticker_data) > 5:
                            total_return = ((ticker_data['Close'].iloc[-1] / ticker_data['Close'].iloc[0]) - 1) * 100
                            returns = ticker_data['Close'].pct_change().dropna()
                            volatility = returns.std() * np.sqrt(252) * 100
                            sharpe = calculate_sharpe_ratio(returns)

                            comparison_metrics.append({
                                'Ticker': ticker,
                                'Total Return': f"{total_return:+.2f}%",
                                'Volatility': f"{volatility:.2f}%",
                                'Sharpe Ratio': f"{sharpe:.2f}" if sharpe else "N/A",
                                'Current Price': f"${ticker_data['Close'].iloc[-1]:.2f}"
                            })

                    if comparison_metrics:
                        comp_df = pd.DataFrame(comparison_metrics)
                        make_scrollable_table(comp_df, height=400, hide_index=True, use_container_width=True, column_config=None)

                else:
                    # Single security analysis with technical indicators
                    st.subheader("📊 Price Chart & Technical Analysis")

                    # Calculate technical indicators
                    ticker_hist['MA_50'] = ticker_hist['Close'].rolling(50).mean()
                    ticker_hist['MA_200'] = ticker_hist['Close'].rolling(200).mean()

                    # Bollinger Bands
                    ticker_hist['BB_middle'] = ticker_hist['Close'].rolling(20).mean()
                    ticker_hist['BB_std'] = ticker_hist['Close'].rolling(20).std()
                    ticker_hist['BB_upper'] = ticker_hist['BB_middle'] + (2 * ticker_hist['BB_std'])
                    ticker_hist['BB_lower'] = ticker_hist['BB_middle'] - (2 * ticker_hist['BB_std'])

                    # Create subplots if volume is enabled
                    if show_volume:
                        from plotly.subplots import make_subplots
                        fig_price = make_subplots(
                            rows=2, cols=1,
                            shared_xaxes=True,
                            vertical_spacing=0.03,
                            row_heights=[0.7, 0.3],
                            subplot_titles=(f"{selected_ticker} - {chart_type} Chart ({time_range})", "Volume")
                        )
                    else:
                        fig_price = go.Figure()

                    # Add price chart based on selected type
                    if chart_type == "Candlestick":
                        price_trace = go.Candlestick(
                            x=ticker_hist.index,
                            open=ticker_hist['Open'],
                            high=ticker_hist['High'],
                            low=ticker_hist['Low'],
                            close=ticker_hist['Close'],
                            name='Price',
                            increasing_line_color='#00ff88',
                            decreasing_line_color='#ff3366'
                        )
                    else:  # Line chart
                        price_trace = go.Scatter(
                            x=ticker_hist.index,
                            y=ticker_hist['Close'],
                            mode='lines',
                            name='Price',
                            line=dict(color='#00D4FF', width=2),
                            fill='tozeroy',
                            fillcolor='rgba(0, 212, 255, 0.1)'
                        )

                    if show_volume:
                        fig_price.add_trace(price_trace, row=1, col=1)
                    else:
                        fig_price.add_trace(price_trace)

                    # Add technical indicators if enabled
                    if show_indicators:
                        row_num = 1 if show_volume else None
                        col_num = 1 if show_volume else None

                        # Moving averages
                        fig_price.add_trace(go.Scatter(
                            x=ticker_hist.index,
                            y=ticker_hist['MA_50'],
                            mode='lines',
                            line=dict(color='#00d4ff', width=1.5),
                            name='MA 50'
                        ), row=row_num, col=col_num)

                        fig_price.add_trace(go.Scatter(
                            x=ticker_hist.index,
                            y=ticker_hist['MA_200'],
                            mode='lines',
                            line=dict(color='#ffaa00', width=1.5),
                            name='MA 200'
                        ), row=row_num, col=col_num)

                        # Bollinger Bands
                        fig_price.add_trace(go.Scatter(
                            x=ticker_hist.index,
                            y=ticker_hist['BB_upper'],
                            mode='lines',
                            line=dict(color='#b794f6', width=1, dash='dash'),
                            name='BB Upper',
                            showlegend=False
                        ), row=row_num, col=col_num)

                        fig_price.add_trace(go.Scatter(
                            x=ticker_hist.index,
                            y=ticker_hist['BB_lower'],
                            mode='lines',
                            line=dict(color='#b794f6', width=1, dash='dash'),
                            name='BB Lower',
                            fill='tonexty',
                            fillcolor='rgba(183, 148, 246, 0.1)'
                        ), row=row_num, col=col_num)

                    # Add volume bars if enabled
                    if show_volume:
                        colors_vol = ['#00ff88' if ticker_hist['Close'].iloc[i] >= ticker_hist['Open'].iloc[i]
                                     else '#ff3366' for i in range(len(ticker_hist))]

                        fig_price.add_trace(go.Bar(
                            x=ticker_hist.index,
                            y=ticker_hist['Volume'],
                            name='Volume',
                            marker=dict(color=colors_vol),
                            showlegend=False
                        ), row=2, col=1)

                    # Update layout
                    if show_volume:
                        fig_price.update_layout(
                            height=700,
                            hovermode='x unified',
                            xaxis_rangeslider_visible=False,
                            xaxis2_title="Date",
                            yaxis_title="Price ($)",
                            yaxis2_title="Volume"
                        )
                    else:
                        fig_price.update_layout(
                            title=f"{selected_ticker} - {chart_type} Chart ({time_range})",
                            xaxis_title="Date",
                            yaxis_title="Price ($)",
                            height=600,
                            xaxis_rangeslider_visible=False
                        )

                    apply_chart_theme(fig_price)
                    st.plotly_chart(fig_price, use_container_width=True)

                st.divider()

                # === RISK METRICS ===
                st.markdown('<h3 style="font-size: 1.25rem; font-weight: 700; color: #f8fafc; margin-top: 1.5rem; margin-bottom: 1rem;"><span style="background: linear-gradient(135deg, #ef4444, #dc2626); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">⚠️ Risk Analysis</span></h3>', unsafe_allow_html=True)

                risk_col1, risk_col2, risk_col3, risk_col4 = st.columns(4)

                # VaR and CVaR
                var_95_ticker = calculate_var(ticker_returns, confidence=0.95)
                cvar_95_ticker = calculate_cvar(ticker_returns, confidence=0.95)

                with risk_col1:
                    var_ticker_color = '#ef4444' if var_95_ticker and abs(var_95_ticker) > 15 else ('#fbbf24' if var_95_ticker and abs(var_95_ticker) > 10 else '#10b981')
                    var_ticker_status = '⚠️ High Risk' if var_95_ticker and abs(var_95_ticker) > 15 else ('⚡ Moderate' if var_95_ticker and abs(var_95_ticker) > 10 else '✓ Low')
                    var_ticker_val = f"{var_95_ticker:.2f}%" if var_95_ticker else "N/A"
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(239,68,68,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(239,68,68,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ef4444, #dc2626); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📉</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">VaR 95%</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {var_ticker_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(239,68,68,0.5); line-height: 1;">{var_ticker_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(239,68,68,0.12); border-radius: 10px; border: 1px solid rgba(239,68,68,0.25);"><p style="font-size: 0.7rem; color: #fca5a5; margin: 0; font-weight: 600;">{var_ticker_status}</p></div></div>', unsafe_allow_html=True)

                with risk_col2:
                    cvar_ticker_color = '#ef4444' if cvar_95_ticker and abs(cvar_95_ticker) > 20 else ('#fbbf24' if cvar_95_ticker and abs(cvar_95_ticker) > 15 else '#10b981')
                    cvar_ticker_status = '⚠️ Severe' if cvar_95_ticker and abs(cvar_95_ticker) > 20 else ('⚡ High' if cvar_95_ticker and abs(cvar_95_ticker) > 15 else '✓ Moderate')
                    cvar_ticker_val = f"{cvar_95_ticker:.2f}%" if cvar_95_ticker else "N/A"
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(245,158,11,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #f59e0b, #d97706); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🔻</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CVaR 95%</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {cvar_ticker_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(245,158,11,0.5); line-height: 1;">{cvar_ticker_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(245,158,11,0.12); border-radius: 10px; border: 1px solid rgba(245,158,11,0.25);"><p style="font-size: 0.7rem; color: #fcd34d; margin: 0; font-weight: 600;">{cvar_ticker_status}</p></div></div>', unsafe_allow_html=True)

                # Beta and correlation to SPY
                try:
                    spy_hist = fetch_historical_data('SPY', start_date_ticker, end_date_ticker)

                    if spy_hist is not None and len(spy_hist) > 20:
                        spy_returns = spy_hist['Close'].pct_change().dropna()

                        # Align dates
                        common_dates = ticker_returns.index.intersection(spy_returns.index)
                        ticker_aligned = ticker_returns.loc[common_dates]
                        spy_aligned = spy_returns.loc[common_dates]

                        # Calculate beta
                        covariance = np.cov(ticker_aligned, spy_aligned)[0][1]
                        market_variance = np.var(spy_aligned)
                        beta = covariance / market_variance if market_variance > 0 else 1.0

                        # Calculate correlation
                        correlation = ticker_aligned.corr(spy_aligned)

                        with risk_col3:
                            beta_color = '#10b981' if abs(beta - 1.0) < 0.3 else ('#fbbf24' if abs(beta - 1.0) < 0.6 else '#ef4444')
                            beta_status = 'Moderate β' if abs(beta - 1.0) < 0.3 else ('Volatile β' if abs(beta) > 1.3 else 'Defensive β')
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">BETA (vs SPY)</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {beta_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{beta:.2f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">{beta_status}</p></div></div>', unsafe_allow_html=True)

                        with risk_col4:
                            corr_color = '#10b981' if correlation > 0.7 else ('#67e8f9' if correlation > 0.4 else '#fbbf24')
                            corr_status = 'High Corr.' if correlation > 0.7 else ('Moderate' if correlation > 0.4 else 'Low Corr.')
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🔗</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CORRELATION (vs SPY)</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {corr_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{correlation:.2f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{corr_status}</p></div></div>', unsafe_allow_html=True)
                except:
                    with risk_col3:
                        st.warning("Unable to calculate Beta")
                    with risk_col4:
                        st.warning("Unable to calculate Correlation")

                st.divider()

                # === CONTRIBUTION TO PORTFOLIO ===
                st.markdown('<h3 style="font-size: 1.25rem; font-weight: 700; color: #f8fafc; margin-top: 1.5rem; margin-bottom: 1rem;"><span style="background: linear-gradient(135deg, #8b5cf6, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">📊 Portfolio Contribution</span></h3>', unsafe_allow_html=True)

                contrib_col1, contrib_col2, contrib_col3 = st.columns(3)

                with contrib_col1:
                    position_value = holding.get('Total Value', 0)
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💰</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">POSITION VALUE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #67e8f9; margin: 0.5rem 0 0.75rem 0; line-height: 1;">${position_value:,.2f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">Total Investment</p></div></div>', unsafe_allow_html=True)

                with contrib_col2:
                    gain_loss_pct = holding.get('Total Gain/Loss %', 0)
                    gain_loss_color = '#10b981' if gain_loss_pct > 0 else '#ef4444'
                    gain_loss_glow = '0 0 24px rgba(16,185,129,0.5)' if gain_loss_pct > 0 else '0 0 24px rgba(239,68,68,0.5)'
                    gain_loss_status = 'Profit' if gain_loss_pct > 0 else 'Loss'
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">POSITION RETURN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {gain_loss_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: {gain_loss_glow}; line-height: 1;">{gain_loss_pct:+.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{gain_loss_status}</p></div></div>', unsafe_allow_html=True)

                with contrib_col3:
                    # Contribution to portfolio return
                    portfolio_contribution = (weight / 100) * gain_loss_pct
                    contrib_color = '#10b981' if portfolio_contribution > 0 else '#ef4444'
                    contrib_status = '+Impact' if portfolio_contribution > 0 else '-Impact'
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🎯</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">PORTFOLIO CONTRIBUTION</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {contrib_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{portfolio_contribution:+.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{contrib_status}</p></div></div>', unsafe_allow_html=True)

            else:
                st.warning(f"Insufficient historical data for {selected_ticker}")

    # ============================================================
    # TAB 3: RISK DECOMPOSITION (NEW)
    # ============================================================
    with tab3:
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1rem;"><span style="background: linear-gradient(135deg, #ef4444, #dc2626); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Risk Decomposition Analysis</span></h2>', unsafe_allow_html=True)

        st.info("Understand WHERE your portfolio risk comes from")

        if portfolio_returns is not None and len(portfolio_returns) > 20:

            # Calculate portfolio volatility
            portfolio_vol = portfolio_returns.std() * np.sqrt(252) * 100

            # Display as premium card
            col_center = st.columns([1, 2, 1])[1]
            with col_center:
                vol_port_color = '#67e8f9' if portfolio_vol < 20 else ('#fbbf24' if portfolio_vol < 30 else '#ef4444')
                vol_port_status = 'Low Risk Portfolio' if portfolio_vol < 20 else ('Moderate Risk' if portfolio_vol < 30 else 'High Risk Portfolio')
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">PORTFOLIO VOLATILITY (ANNUALIZED)</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {vol_port_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{portfolio_vol:.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">{vol_port_status}</p></div></div>', unsafe_allow_html=True)

            st.divider()

            # === POSITION-LEVEL RISK CONTRIBUTION ===
            st.subheader("📊 Risk Contribution by Position")

            st.markdown("""
            **Marginal Contribution to Risk (MCR):** How much each position contributes to total portfolio risk.

            - High MCR = This position drives a lot of portfolio volatility
            - Positions with similar weights can have very different MCRs due to correlations
            """)

            # Calculate for each position
            risk_contributions = []

            for _, holding_item in enhanced_df.iterrows():
                ticker_risk = holding_item['Ticker']
                weight_risk = holding_item['Weight %'] / 100

                # Get ticker returns
                ticker_hist_risk = fetch_historical_data(ticker_risk,
                                                    datetime.now() - timedelta(days=365),
                                                    datetime.now())

                if ticker_hist_risk is not None and len(ticker_hist_risk) > 20:
                    ticker_returns_risk = ticker_hist_risk['Close'].pct_change().dropna()
                    ticker_vol_risk = ticker_returns_risk.std() * np.sqrt(252)

                    # Simplified MCR: weight * volatility (proper MCR requires covariance matrix)
                    mcr = weight_risk * ticker_vol_risk * 100

                    risk_contributions.append({
                        'Ticker': ticker_risk,
                        'Weight %': weight_risk * 100,
                        'Volatility %': ticker_vol_risk * 100,
                        'Risk Contribution %': mcr
                    })

            if risk_contributions:
                risk_df = pd.DataFrame(risk_contributions).sort_values('Risk Contribution %', ascending=False)

                # Normalize to percentage of total risk
                total_risk = risk_df['Risk Contribution %'].sum()
                risk_df['% of Portfolio Risk'] = (risk_df['Risk Contribution %'] / total_risk * 100).round(1)

                # Display table
                make_scrollable_table(risk_df, height=600, hide_index=True, use_container_width=True)

                # Visualization
                fig_risk_contrib = go.Figure(go.Bar(
                    x=risk_df['% of Portfolio Risk'],
                    y=risk_df['Ticker'],
                    orientation='h',
                    marker_color='#ff6b00',
                    text=[f"{val:.1f}%" for val in risk_df['% of Portfolio Risk']],
                    textposition='outside'
                ))

                fig_risk_contrib.update_layout(
                    title="Risk Contribution by Position",
                    xaxis_title="% of Total Portfolio Risk",
                    yaxis_title="",
                    height=500,
                    paper_bgcolor='rgba(0, 0, 0, 0)',
                    plot_bgcolor='rgba(10, 25, 41, 0.3)',
                    font=dict(color='#ffffff')
                )

                st.plotly_chart(fig_risk_contrib, use_container_width=True)

        # === SECTOR ALLOCATION ANALYSIS ===
        st.divider()
        st.markdown("### 📊 Sector Allocation Analysis")
        st.info("View portfolio sector distribution with enhanced visibility")

        # Use full width for better label visibility
        sector_chart = create_professional_sector_allocation_pie(enhanced_df)
        if sector_chart:
            # Increase height for better label display
            sector_chart.update_layout(
                height=600,
                margin=dict(l=20, r=150, t=40, b=20),  # More margin for labels
                showlegend=True,
                legend=dict(
                    yanchor="middle",
                    y=0.5,
                    xanchor="left",
                    x=1.05
                )
            )
            st.plotly_chart(sector_chart, use_container_width=True)

    # ============================================================
    # TAB 4: ATTRIBUTION & BENCHMARKING (Enhanced)
    # ============================================================
    with tab4:
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Performance Attribution & Benchmark Comparison</span></h2>', unsafe_allow_html=True)

        if benchmark_returns is not None and portfolio_returns is not None and len(portfolio_returns) > 0:

            # Align returns
            common_dates = portfolio_returns.index.intersection(benchmark_returns.index)
            port_aligned = portfolio_returns.loc[common_dates]
            bench_aligned = benchmark_returns.loc[common_dates]

            # Calculate metrics
            port_total = (1 + port_aligned).prod() - 1
            bench_total = (1 + bench_aligned).prod() - 1
            excess_return = port_total - bench_total

            # Display summary
            col1, col2, col3 = st.columns(3)

            with col1:
                port_ret_color = '#10b981' if port_total > 0 else '#ef4444'
                port_ret_glow = '0 0 24px rgba(16,185,129,0.5)' if port_total > 0 else '0 0 24px rgba(239,68,68,0.5)'
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">PORTFOLIO RETURN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {port_ret_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: {port_ret_glow}; line-height: 1;">{port_total*100:+.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">Your Performance</p></div></div>', unsafe_allow_html=True)

            with col2:
                bench_ret_color = '#67e8f9' if bench_total > 0 else '#fbbf24'
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">BENCHMARK RETURN (SPY)</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {bench_ret_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{bench_total*100:+.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">Market Performance</p></div></div>', unsafe_allow_html=True)

            with col3:
                excess_ret_color = '#10b981' if excess_return > 0 else '#ef4444'
                excess_ret_glow = '0 0 24px rgba(16,185,129,0.5)' if excess_return > 0 else '0 0 24px rgba(239,68,68,0.5)'
                excess_ret_status = 'Outperforming ✓' if excess_return > 0 else 'Underperforming'
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🔥</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">EXCESS RETURN (ALPHA)</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {excess_ret_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: {excess_ret_glow}; line-height: 1;">{excess_return*100:+.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{excess_ret_status}</p></div></div>', unsafe_allow_html=True)

            st.divider()

            # === CUMULATIVE RETURN COMPARISON ===
            st.subheader("📈 Cumulative Performance vs Benchmark")

            port_cumulative = (1 + port_aligned).cumprod() - 1
            bench_cumulative = (1 + bench_aligned).cumprod() - 1

            fig_cumulative = go.Figure()

            # Use dark theme if available
            if PROFESSIONAL_THEME_AVAILABLE:
                portfolio_color = '#00BCD4'
                benchmark_color = 'rgba(255, 255, 255, 0.5)'
                fill_color = get_color('primary', 0.15)
                title_color = '#FFFFFF'
                text_color = '#FFFFFF'
                grid_color = 'rgba(255, 255, 255, 0.1)'
                paper_bg = '#1a1d29'
                plot_bg = '#1a1d29'
            else:
                portfolio_color = '#00d4ff'
                benchmark_color = '#ffaa00'
                fill_color = 'rgba(0, 212, 255, 0.1)'
                title_color = '#ffffff'
                text_color = '#ffffff'
                grid_color = 'rgba(99, 102, 241, 0.1)'
                paper_bg = 'rgba(0, 0, 0, 0)'
                plot_bg = 'rgba(10, 25, 41, 0.3)'

            # Portfolio line with area fill
            fig_cumulative.add_trace(go.Scatter(
                x=port_cumulative.index,
                y=port_cumulative.values * 100,
                mode='lines',
                line=dict(color=portfolio_color, width=3, shape='spline'),
                fill='tozeroy',
                fillcolor=fill_color,
                name='Your Portfolio',
                hovertemplate='<b>Portfolio</b><br>%{x}<br>%{y:.2f}%<extra></extra>'
            ))

            # Benchmark line (dashed)
            fig_cumulative.add_trace(go.Scatter(
                x=bench_cumulative.index,
                y=bench_cumulative.values * 100,
                mode='lines',
                line=dict(color=benchmark_color, width=2, dash='dash', shape='spline'),
                name='SPY Benchmark',
                hovertemplate='<b>Benchmark</b><br>%{x}<br>%{y:.2f}%<extra></extra>'
            ))

            fig_cumulative.update_layout(
                title=dict(
                    text="Cumulative Returns Comparison",
                    font=dict(size=16, color=title_color, family='Inter'),
                    x=0.02,
                    xanchor='left'
                ),
                xaxis=dict(
                    title="Date",
                    showgrid=False,
                    tickfont=dict(size=10, color=text_color),
                    linecolor=grid_color
                ),
                yaxis=dict(
                    title="Cumulative Return (%)",
                    showgrid=True,
                    gridcolor=grid_color,
                    tickfont=dict(size=10, color=text_color),
                    linecolor=grid_color,
                    zeroline=True,
                    zerolinecolor=grid_color
                ),
                height=450,
                paper_bgcolor=paper_bg,
                plot_bgcolor=plot_bg,
                font=dict(color=text_color, family='Inter'),
                hovermode='x unified',
                legend=dict(
                    orientation='h',
                    yanchor='bottom',
                    y=1.02,
                    xanchor='right',
                    x=1
                ),
                margin=dict(l=60, r=30, t=80, b=50)
            )

            st.plotly_chart(fig_cumulative, use_container_width=True)

            st.divider()

            # === TRACKING ERROR & INFORMATION RATIO ===
            st.markdown('<h3 style="font-size: 1.25rem; font-weight: 700; color: #f8fafc; margin-top: 1.5rem; margin-bottom: 1rem;"><span style="background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">📊 Active Management Metrics</span></h3>', unsafe_allow_html=True)

            tracking_col1, tracking_col2, tracking_col3 = st.columns(3)

            # Tracking Error
            excess_returns = port_aligned - bench_aligned
            tracking_error = excess_returns.std() * np.sqrt(252) * 100

            with tracking_col1:
                te_color = '#67e8f9' if tracking_error < 5 else ('#fbbf24' if tracking_error < 10 else '#ef4444')
                te_status = 'Low TE' if tracking_error < 5 else ('Moderate' if tracking_error < 10 else 'High TE')
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📉</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">TRACKING ERROR</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {te_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{tracking_error:.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">{te_status}</p></div></div>', unsafe_allow_html=True)

            # Information Ratio
            info_ratio = calculate_information_ratio(port_aligned, bench_aligned)

            with tracking_col2:
                ir_color = '#10b981' if info_ratio and info_ratio > 0.5 else ('#67e8f9' if info_ratio and info_ratio > 0 else '#fbbf24')
                ir_status = 'Excellent' if info_ratio and info_ratio > 0.5 else ('Good' if info_ratio and info_ratio > 0 else 'Fair')
                ir_val = f"{info_ratio:.2f}" if info_ratio else "N/A"
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🎯</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">INFORMATION RATIO</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {ir_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{ir_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{ir_status}</p></div></div>', unsafe_allow_html=True)

            # Active Share (simplified - would need holdings-level data for true calculation)
            with tracking_col3:
                active_pos = len(enhanced_df)
                active_pos_color = '#10b981' if active_pos >= 10 else ('#fbbf24' if active_pos >= 5 else '#ef4444')
                active_pos_status = 'Diversified' if active_pos >= 10 else ('Moderate' if active_pos >= 5 else 'Concentrated')
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">ACTIVE POSITIONS</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {active_pos_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{active_pos}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{active_pos_status}</p></div></div>', unsafe_allow_html=True)

    # ========================================================================
    # PORTFOLIO DEEP DIVE - ENHANCED

