"""
ATLAS Terminal - Risk Analysis Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_risk_analysis(start_date, end_date, selected_benchmark):
    """Render the Risk Analysis page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import (
        ATLASFormatter, load_portfolio_data, create_enhanced_holdings_table,
        calculate_portfolio_returns, calculate_benchmark_returns, is_valid_series,
        calculate_sharpe_ratio, calculate_sortino_ratio, calculate_calmar_ratio,
        calculate_var, calculate_max_drawdown, calculate_cvar, apply_chart_theme,
        calculate_var_cvar_portfolio_optimization,
        fetch_historical_data, OptimizationExplainer, RobustPortfolioOptimizer,
        check_expert_wisdom, validate_portfolio_realism, get_current_portfolio_metrics,
        calculate_historical_stress_test,
        # Chart functions
        create_risk_reward_plot, create_var_waterfall, create_var_cvar_distribution,
        create_risk_parity_analysis, create_efficient_frontier, create_drawdown_distribution,
        create_rolling_var_cvar_chart, create_monte_carlo_chart, create_rolling_metrics_chart,
        create_underwater_plot, create_risk_contribution_sunburst, create_correlation_network
    )
    from ui.components import ATLAS_TEMPLATE
    from datetime import datetime, timedelta
    import plotly.graph_objects as go
    import numpy as np

    # Try to import RiskProfile and get_wisdom_grade
    try:
        from core.optimizers import RiskProfile, get_wisdom_grade
    except ImportError:
        try:
            from core import RiskProfile, get_wisdom_grade
        except ImportError:
            # Fallback stubs
            class RiskProfile:
                @staticmethod
                def get_config(profile, strategy):
                    return {
                        'max_position_base': 0.25,
                        'min_diversification': 8,
                        'risk_budget_per_asset': 0.12,
                        'max_turnover_per_rebalance': 0.25,
                        'max_position_change': 0.05,
                        'min_trade_threshold': 0.01,
                        'rebalance_frequency': 'monthly'
                    }

            def get_wisdom_grade(score):
                if score >= 80:
                    return ("A", "Excellent", "🟢")
                elif score >= 60:
                    return ("B", "Good", "🟡")
                else:
                    return ("C", "Fair", "🔴")

    # Stub for show_toast - may be in atlas_app.py
    def show_toast(msg, toast_type="info", duration=3000):
        """Fallback toast implementation"""
        if toast_type == "warning":
            st.warning(msg)
        elif toast_type == "success":
            st.success(msg)
        else:
            st.info(msg)

    # Stub for run_monte_carlo_simulation - may be in atlas_app.py
    def run_monte_carlo_simulation(returns):
        """Stub - needs implementation"""
        return None


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

    with st.spinner("Calculating..."):
        portfolio_returns = calculate_portfolio_returns(df, start_date, end_date)
        benchmark_returns = calculate_benchmark_returns(selected_benchmark, start_date, end_date)

        if not is_valid_series(portfolio_returns):
            st.warning("Insufficient data")
            st.stop()
        sharpe = calculate_sharpe_ratio(portfolio_returns)
        sortino = calculate_sortino_ratio(portfolio_returns)
        calmar = calculate_calmar_ratio(portfolio_returns)
        var_95 = calculate_var(portfolio_returns, 0.95)
        max_dd = calculate_max_drawdown(portfolio_returns)

    # v9.7 ENHANCEMENT: Added CVaR metric
    cvar_95 = calculate_cvar(portfolio_returns, 0.95)

    # Risk Alerts - Check for threshold violations
    risk_alerts = []

    # VaR threshold (flag if > 15% daily loss)
    if var_95 and abs(var_95) > 15:
        risk_alerts.append(f"VaR 95% at {abs(var_95):.1f}% exceeds 15% threshold")

    # CVaR threshold (flag if > 20% daily loss)
    if cvar_95 and abs(cvar_95) > 20:
        risk_alerts.append(f"CVaR 95% at {abs(cvar_95):.1f}% exceeds 20% threshold")

    # Maximum Drawdown threshold (flag if > 30%)
    if max_dd and abs(max_dd) > 30:
        risk_alerts.append(f"Maximum Drawdown at {abs(max_dd):.1f}% exceeds 30% threshold")

    # Concentration risk - check if any single position > 25%
    if len(enhanced_df) > 0:
        total_value = enhanced_df['Total Value'].sum()
        for _, row in enhanced_df.iterrows():
            position_pct = (row['Total Value'] / total_value) * 100
            if position_pct > 25:
                risk_alerts.append(f"{row['Ticker']} concentration at {position_pct:.1f}% exceeds 25% limit")

    # Display risk alerts as toasts
    if risk_alerts:
        for alert in risk_alerts[:3]:  # Limit to 3 toasts to avoid overwhelming
            show_toast(f"⚠️ Risk Alert: {alert}", toast_type="warning", duration=6000)

    col1, col2, col3, col4, col5, col6 = st.columns(6)

    # Card 1: Sharpe Ratio
    with col1:
        sharpe_color = '#10b981' if sharpe and sharpe > 1.0 else ('#a5b4fc' if sharpe and sharpe > 0 else '#ef4444')
        sharpe_val = ATLASFormatter.format_ratio(sharpe) if sharpe else "N/A"
        sharpe_status = 'Excellent' if sharpe and sharpe > 1.5 else ('Good' if sharpe and sharpe > 1.0 else 'Fair')
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🔥</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">SHARPE RATIO</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {sharpe_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{sharpe_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{sharpe_status}</p></div></div>', unsafe_allow_html=True)

    # Card 2: Sortino Ratio
    with col2:
        sortino_color = '#10b981' if sortino and sortino > 1.0 else ('#a5b4fc' if sortino and sortino > 0 else '#ef4444')
        sortino_val = ATLASFormatter.format_ratio(sortino) if sortino else "N/A"
        sortino_status = 'Strong' if sortino and sortino > 1.5 else ('Good' if sortino and sortino > 1.0 else 'Fair')
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💎</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">SORTINO RATIO</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {sortino_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{sortino_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{sortino_status}</p></div></div>', unsafe_allow_html=True)

    # Card 3: Calmar Ratio
    with col3:
        calmar_color = '#10b981' if calmar and calmar > 1.0 else ('#a5b4fc' if calmar and calmar > 0 else '#ef4444')
        calmar_val = ATLASFormatter.format_ratio(calmar) if calmar else "N/A"
        calmar_status = 'Superior' if calmar and calmar > 2.0 else ('Good' if calmar and calmar > 1.0 else 'Fair')
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">⚖️</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CALMAR RATIO</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {calmar_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{calmar_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">{calmar_status}</p></div></div>', unsafe_allow_html=True)

    # Card 4: VaR 95%
    with col4:
        var_color = '#ef4444' if var_95 and abs(var_95) > 15 else ('#fbbf24' if var_95 and abs(var_95) > 10 else '#10b981')
        var_val = format_percentage(var_95) if var_95 else "N/A"
        var_status = '⚠️ High Risk' if var_95 and abs(var_95) > 15 else ('⚡ Moderate' if var_95 and abs(var_95) > 10 else '✓ Low')
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(239,68,68,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(239,68,68,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ef4444, #dc2626); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📉</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">VaR 95%</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {var_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(239,68,68,0.5); line-height: 1;">{var_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(239,68,68,0.12); border-radius: 10px; border: 1px solid rgba(239,68,68,0.25);"><p style="font-size: 0.7rem; color: #fca5a5; margin: 0; font-weight: 600;">{var_status}</p></div></div>', unsafe_allow_html=True)

    # Card 5: CVaR 95%
    with col5:
        cvar_color = '#ef4444' if cvar_95 and abs(cvar_95) > 20 else ('#fbbf24' if cvar_95 and abs(cvar_95) > 15 else '#10b981')
        cvar_val = format_percentage(cvar_95) if cvar_95 else "N/A"
        cvar_status = '🔴 Critical' if cvar_95 and abs(cvar_95) > 20 else ('⚠️ Elevated' if cvar_95 and abs(cvar_95) > 15 else '✓ Safe')
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(239,68,68,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(239,68,68,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ef4444, #dc2626); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🔴</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CVaR 95%</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {cvar_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(239,68,68,0.5); line-height: 1;">{cvar_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(239,68,68,0.12); border-radius: 10px; border: 1px solid rgba(239,68,68,0.25);"><p style="font-size: 0.7rem; color: #fca5a5; margin: 0; font-weight: 600;">{cvar_status}</p></div></div>', unsafe_allow_html=True)

    # Card 6: Max Drawdown
    with col6:
        maxdd_color = '#ef4444' if max_dd and abs(max_dd) > 30 else ('#fbbf24' if max_dd and abs(max_dd) > 20 else '#10b981')
        maxdd_val = format_percentage(max_dd) if max_dd else "N/A"
        maxdd_status = '⚠️ Severe' if max_dd and abs(max_dd) > 30 else ('⚡ Moderate' if max_dd and abs(max_dd) > 20 else '✓ Low')
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(245,158,11,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #f59e0b, #d97706); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">⚠️</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">MAX DRAWDOWN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {maxdd_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(245,158,11,0.5); line-height: 1;">{maxdd_val}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(245,158,11,0.12); border-radius: 10px; border: 1px solid rgba(245,158,11,0.25);"><p style="font-size: 0.7rem; color: #fcd34d; margin: 0; font-weight: 600;">{maxdd_status}</p></div></div>', unsafe_allow_html=True)

    st.markdown("---")

    # ===== RISK-REWARD POSITIONING =====
    st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">🎯</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Risk-Reward Analysis</span></h2>', unsafe_allow_html=True)
    st.markdown("**Understand where each position sits on the risk-return spectrum**")

    col_chart, col_guide = st.columns([3, 1])

    with col_chart:
        risk_reward = create_risk_reward_plot(enhanced_df)
        if risk_reward:
            st.plotly_chart(risk_reward, use_container_width=True, key="risk_reward_analysis")
        else:
            st.info("Risk-reward chart will display when position data is available")

    with col_guide:
        st.markdown("#### 📖 Interpretation Guide")

        st.markdown("**🟢 Top-Right Quadrant**")
        st.caption("High return, high risk - Growth plays")

        st.markdown("**🔵 Top-Left Quadrant**")
        st.caption("High return, low risk - IDEAL positions")

        st.markdown("**🟡 Bottom-Left Quadrant**")
        st.caption("Low return, low risk - Defensive holds")

        st.markdown("**🔴 Bottom-Right Quadrant**")
        st.caption("Low return, high risk - REVIEW URGENTLY")

        st.markdown("---")
        st.markdown("**⚡ Action Items**")
        st.caption("• Rotate bottom-right into top-left")
        st.caption("• Size up low-risk winners")
        st.caption("• Trim high-risk laggards")

    st.markdown("---")

    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "📊 Core Risk", "🎲 Monte Carlo", "🔬 Advanced Analytics", "⚡ Stress Tests", "🎯 VaR/CVaR Optimization"
    ])

    with tab1:
        col1, col2 = st.columns(2)

        with col1:
            var_chart = create_var_waterfall(portfolio_returns)
            if var_chart:
                st.plotly_chart(var_chart, use_container_width=True)

            # v9.7 NEW: VaR/CVaR on Return Distribution
            var_dist = create_var_cvar_distribution(portfolio_returns)
            if var_dist:
                st.plotly_chart(var_dist, use_container_width=True)
            else:
                st.info("Insufficient data for distribution analysis (requires 30+ observations)")

            risk_parity = create_risk_parity_analysis(enhanced_df)
            if risk_parity:
                st.plotly_chart(risk_parity, use_container_width=True)

        with col2:
            efficient = create_efficient_frontier(enhanced_df)
            if efficient:
                st.plotly_chart(efficient, use_container_width=True)

            # FIX 7: Add Drawdown Distribution chart
            drawdown_dist = create_drawdown_distribution(portfolio_returns)
            if drawdown_dist:
                st.plotly_chart(drawdown_dist, use_container_width=True)

        # v9.7 NEW FEATURE: Rolling VaR/CVaR Evolution
        st.markdown("#### 📈 v9.7: Rolling Risk Metrics Evolution")
        rolling_var_cvar = create_rolling_var_cvar_chart(portfolio_returns, window=60)
        if rolling_var_cvar:
            st.plotly_chart(rolling_var_cvar, use_container_width=True)
        else:
            st.info("Insufficient data for rolling VaR/CVaR analysis (requires 60+ days)")

    with tab2:
        simulations = run_monte_carlo_simulation(portfolio_returns)
        if simulations is not None:
            # Get equity from performance history for Monte Carlo initial value
            mc_metrics = get_current_portfolio_metrics()
            mc_initial_value = mc_metrics['equity'] if mc_metrics and mc_metrics.get('equity', 0) > 0 else 100000
            monte_carlo_chart, mc_stats = create_monte_carlo_chart(simulations, mc_initial_value)

            if monte_carlo_chart:
                st.plotly_chart(monte_carlo_chart, use_container_width=True)

            if mc_stats:
                st.markdown("#### 📊 Simulation Results")
                st.markdown(f"""
                **Key Statistics:**
                - Expected Value: ${mc_stats['mean']:,.2f}
                - Median: ${mc_stats['median']:,.2f}
                - Best Case (95th): ${mc_stats['percentile_95']:,.2f}
                - Worst Case (5th): ${mc_stats['percentile_5']:,.2f}
                - Prob of Profit: {mc_stats['prob_profit']:.1f}%
                """)

    with tab3:
        col1, col2 = st.columns(2)

        with col1:
            rolling = create_rolling_metrics_chart(portfolio_returns)
            if rolling:
                st.plotly_chart(rolling, use_container_width=True)

        with col2:
            underwater = create_underwater_plot(portfolio_returns)
            if underwater:
                st.plotly_chart(underwater, use_container_width=True)

        sunburst = create_risk_contribution_sunburst(enhanced_df)
        if sunburst:
            st.plotly_chart(sunburst, use_container_width=True)

        corr_network = create_correlation_network(enhanced_df, start_date, end_date)
        if corr_network:
            st.plotly_chart(corr_network, use_container_width=True)

    with tab4:
        # ===== FIX #3: Stress Test 'go' Undefined Error =====
        import plotly.graph_objects as go

        st.markdown("#### ⚡ Historical Stress Test Analysis")
        st.info("💡 **Historical Stress Testing:** See how your current portfolio would have performed during major market crises")

        # Run historical stress test calculation
        with st.spinner("Calculating historical stress scenarios..."):
            stress_results = calculate_historical_stress_test(enhanced_df)

        if not stress_results:
            st.warning("⚠️ Unable to calculate historical stress tests. This may be due to data availability for your holdings during historical periods.")
        else:
            # Period selector
            selected_period = st.selectbox(
                "Select Historical Stress Period",
                options=list(stress_results.keys()),
                index=len(stress_results) - 1 if len(stress_results) > 0 else 0
            )

            if selected_period in stress_results:
                period_data = stress_results[selected_period]
                metrics = period_data['metrics']

                # Display key metrics
                st.markdown("##### 📊 Performance Metrics")
                metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)

                with metric_col1:
                    st.metric(
                        "Portfolio Return",
                        f"{metrics['portfolio_return']:+.2f}%",
                        delta=None
                    )

                with metric_col2:
                    st.metric(
                        "S&P 500 Return",
                        f"{metrics['spy_return']:+.2f}%",
                        delta=None
                    )

                with metric_col3:
                    outperf_color = "normal" if metrics['outperformance'] >= 0 else "inverse"
                    st.metric(
                        "Outperformance",
                        f"{metrics['outperformance']:+.2f}%",
                        delta=f"{metrics['outperformance']:+.2f}%",
                        delta_color=outperf_color
                    )

                with metric_col4:
                    st.metric(
                        "Max Drawdown",
                        f"{metrics['portfolio_drawdown']:.2f}%",
                        delta=f"{metrics['portfolio_drawdown'] - metrics['spy_drawdown']:+.2f}% vs SPY"
                    )

                # Create line graph showing cumulative returns
                st.markdown("##### 📈 Cumulative Returns Comparison")

                fig_stress = go.Figure()

                # Portfolio line
                fig_stress.add_trace(go.Scatter(
                    x=period_data['dates'],
                    y=period_data['portfolio_cumulative'],
                    mode='lines',
                    name='Your Portfolio',
                    line=dict(color='#00D4FF', width=3),
                    hovertemplate='<b>Portfolio</b><br>Date: %{x|%Y-%m-%d}<br>Value: %{y:.2f}<extra></extra>'
                ))

                # S&P 500 line
                fig_stress.add_trace(go.Scatter(
                    x=period_data['dates'],
                    y=period_data['spy_cumulative'],
                    mode='lines',
                    name='S&P 500',
                    line=dict(color='#FF4136', width=2, dash='dash'),
                    hovertemplate='<b>S&P 500</b><br>Date: %{x|%Y-%m-%d}<br>Value: %{y:.2f}<extra></extra>'
                ))

                fig_stress.update_layout(
                    title=f"{selected_period} - Portfolio vs S&P 500",
                    xaxis_title="Date",
                    yaxis_title="Cumulative Return (Base 100)",
                    height=500,
                    hovermode='x unified',
                    legend=dict(
                        orientation="h",
                        yanchor="bottom",
                        y=1.02,
                        xanchor="right",
                        x=1
                    )
                )

                # Add baseline at 100
                fig_stress.add_hline(
                    y=100,
                    line_dash="dot",
                    line_color=COLORS['text_muted'],
                    line_width=1,
                    annotation_text="Starting Value"
                )

                apply_chart_theme(fig_stress)
                st.plotly_chart(fig_stress, use_container_width=True)

                # Summary metrics table
                st.markdown("##### 📋 Detailed Stress Metrics")

                summary_data = []
                for period_name, data in stress_results.items():
                    m = data['metrics']
                    summary_data.append({
                        'Period': period_name,
                        'Portfolio Return': f"{m['portfolio_return']:+.2f}%",
                        'S&P 500 Return': f"{m['spy_return']:+.2f}%",
                        'Outperformance': f"{m['outperformance']:+.2f}%",
                        'Portfolio Max DD': f"{m['portfolio_drawdown']:.2f}%",
                        'SPY Max DD': f"{m['spy_drawdown']:.2f}%",
                        'Portfolio Vol': f"{m['portfolio_volatility']:.2f}%"
                    })

                summary_df = pd.DataFrame(summary_data)
                from core.atlas_table_formatting import render_generic_table
                st.markdown(render_generic_table(summary_df, columns=[
                    {'key': 'Period', 'label': 'Period', 'type': 'text'},
                    {'key': 'Portfolio Return', 'label': 'Portfolio', 'type': 'change'},
                    {'key': 'S&P 500 Return', 'label': 'S&P 500', 'type': 'change'},
                    {'key': 'Outperformance', 'label': 'Alpha', 'type': 'change'},
                    {'key': 'Portfolio Max DD', 'label': 'Max DD', 'type': 'percent'},
                    {'key': 'Portfolio Vol', 'label': 'Volatility', 'type': 'percent'},
                ]), unsafe_allow_html=True)

                # Methodology notes
                st.markdown("---")
                st.markdown("##### ⚠️ Methodology & Important Notes")
                st.caption("""
                **Calculation Method:**
                - Uses current portfolio weights applied to historical price data
                - Compares against S&P 500 (^GSPC) performance during same periods
                - Cumulative returns normalized to base 100 at period start
                - Maximum drawdown calculated as peak-to-trough decline

                **Important Limitations:**
                - ⚠️ **Survivorship Bias:** Analysis assumes current holdings existed during historical periods. Companies that failed or weren't publicly traded are excluded.
                - ⚠️ **Hindsight Bias:** Current portfolio composition may differ significantly from what would have been held historically
                - ⚠️ **Data Availability:** Some holdings may lack historical data for earlier periods, affecting accuracy
                - ⚠️ **No Rebalancing:** Assumes static weights throughout each period (no tactical adjustments)

                **Use Case:** This analysis provides directional insight into portfolio resilience during crises, but should not be interpreted as definitive historical performance.
                """)

    with tab5:  # NEW VaR/CVaR Optimization Tab
        # ===== FIX #7: VaR/CVaR 'go' Error =====
        import plotly.graph_objects as go

        st.markdown("### 🎯 VaR/CVaR Portfolio Optimization")
        st.info("Optimize portfolio weights to minimize Conditional Value at Risk (CVaR) - the expected loss beyond VaR")

        col1, col2, col3 = st.columns([2, 2, 1])

        with col1:
            confidence = st.slider("Confidence Level", 90, 99, 95, 1) / 100
            lookback = st.slider("Lookback Period (days)", 60, 504, 252, 21)

        with col2:
            # 🎯 NEW v10.3: Risk Profile Selector
            st.markdown("**Risk Profile** - Choose your investment style")
            risk_profile_var = st.radio(
                "Risk Tolerance",
                options=['conservative', 'moderate', 'aggressive'],
                format_func=lambda x: {
                    'conservative': '🛡️ Conservative - Capital Preservation',
                    'moderate': '⚖️ Moderate - Balanced Growth',
                    'aggressive': '🚀 Aggressive - Maximum Returns'
                }[x],
                index=1,  # Default to Moderate
                key="risk_profile_var",
                help="Your risk profile automatically sets optimal position limits and diversification requirements"
            )

            # Display what this risk profile means
            config_var = RiskProfile.get_config(risk_profile_var, 'cvar_minimization')
            st.caption(f"📊 **Auto-configured:** Max position {config_var['max_position_base']*100:.0f}%, Min {config_var['min_diversification']} holdings, Risk budget {config_var['risk_budget_per_asset']*100:.0f}% per asset")

        with col3:
            if st.button("🔄 Run Optimization", type="primary", key="run_var_opt"):
                st.session_state['run_optimization'] = True

        # PHASE 3 DAY 2: Strategy Comparison Panel
        with st.expander("📊 Compare All Strategy Levels", expanded=False):
            st.markdown("### Strategy Level Comparison")
            st.caption("Compare how each risk profile affects your optimization constraints")

            # Get configs for all three profiles
            conservative_cfg = RiskProfile.get_config('conservative', 'cvar_minimization')
            moderate_cfg = RiskProfile.get_config('moderate', 'cvar_minimization')
            aggressive_cfg = RiskProfile.get_config('aggressive', 'cvar_minimization')

            # Create comparison table
            comparison_data = {
                'Parameter': [
                    'Max Position Size',
                    'Min Holdings Required',
                    'Risk Budget Per Asset',
                    'Max Turnover Per Rebalance',
                    'Max Position Change',
                    'Trade Threshold',
                    'Rebalance Frequency',
                    'Philosophy'
                ],
                '🛡️ Conservative': [
                    f"{conservative_cfg['max_position_base']*100:.0f}%",
                    f"{conservative_cfg['min_diversification']} holdings",
                    f"{conservative_cfg['risk_budget_per_asset']*100:.0f}%",
                    f"{conservative_cfg.get('max_turnover_per_rebalance', 0.15)*100:.0f}%",
                    f"{conservative_cfg.get('max_position_change', 0.03)*100:.0f}%",
                    f"{conservative_cfg.get('min_trade_threshold', 0.005)*100:.1f}%",
                    conservative_cfg.get('rebalance_frequency', 'quarterly').title(),
                    'Capital Preservation'
                ],
                '⚖️ Moderate': [
                    f"{moderate_cfg['max_position_base']*100:.0f}%",
                    f"{moderate_cfg['min_diversification']} holdings",
                    f"{moderate_cfg['risk_budget_per_asset']*100:.0f}%",
                    f"{moderate_cfg.get('max_turnover_per_rebalance', 0.25)*100:.0f}%",
                    f"{moderate_cfg.get('max_position_change', 0.05)*100:.0f}%",
                    f"{moderate_cfg.get('min_trade_threshold', 0.01)*100:.1f}%",
                    moderate_cfg.get('rebalance_frequency', 'monthly').title(),
                    'Balanced Growth'
                ],
                '🚀 Aggressive': [
                    f"{aggressive_cfg['max_position_base']*100:.0f}%",
                    f"{aggressive_cfg['min_diversification']} holdings",
                    f"{aggressive_cfg['risk_budget_per_asset']*100:.0f}%",
                    f"{aggressive_cfg.get('max_turnover_per_rebalance', 0.40)*100:.0f}%",
                    f"{aggressive_cfg.get('max_position_change', 0.08)*100:.0f}%",
                    f"{aggressive_cfg.get('min_trade_threshold', 0.015)*100:.1f}%",
                    aggressive_cfg.get('rebalance_frequency', 'weekly').title(),
                    'Maximum Returns'
                ]
            }
            comparison_df = pd.DataFrame(comparison_data)
            from core.atlas_table_formatting import render_generic_table
            comp_cols = [{'key': c, 'label': c, 'type': 'ticker' if c == 'Parameter' else 'text'} for c in comparison_df.columns]
            st.markdown(render_generic_table(comparison_df, columns=comp_cols), unsafe_allow_html=True)

            # Highlight the selected profile
            selected_name = {'conservative': 'Conservative', 'moderate': 'Moderate', 'aggressive': 'Aggressive'}[risk_profile_var]
            st.success(f"✅ **Currently Selected:** {selected_name} - {config_var.get('philosophy', 'N/A')}")

            # Quick selection buttons
            st.markdown("#### Quick Select")
            quick_col1, quick_col2, quick_col3 = st.columns(3)
            with quick_col1:
                if st.button("🛡️ Use Conservative", key="quick_conservative", use_container_width=True):
                    st.session_state['risk_profile_var'] = 'conservative'
                    st.rerun()
            with quick_col2:
                if st.button("⚖️ Use Moderate", key="quick_moderate", use_container_width=True):
                    st.session_state['risk_profile_var'] = 'moderate'
                    st.rerun()
            with quick_col3:
                if st.button("🚀 Use Aggressive", key="quick_aggressive", use_container_width=True):
                    st.session_state['risk_profile_var'] = 'aggressive'
                    st.rerun()


        # Advanced: Manual Override (collapsed by default)
        with st.expander("🔧 Advanced: Manual Position Constraints Override"):
            st.warning("⚠️ Advanced users only - Manual overrides bypass risk profile automation")
            use_manual_var = st.checkbox("Use manual position constraints", value=False, key="use_manual_var")

            if use_manual_var:
                col_a, col_b = st.columns(2)
                with col_a:
                    max_position_var = st.slider(
                        "Max Position Size (%)",
                        min_value=1,
                        max_value=50,
                        value=int(config_var['max_position_base']*100),
                        step=1,
                        key="max_pos_var_manual",
                        help="Maximum weight allowed per security (prevents over-concentration)"
                    ) / 100

                with col_b:
                    min_position_var = st.slider(
                        "Min Position Size (%)",
                        min_value=1,
                        max_value=50,
                        value=2,
                        step=1,
                        key="min_pos_var_manual",
                        help="Minimum meaningful position size (smaller positions excluded)"
                    ) / 100

                # Validation: Ensure min < max
                if min_position_var >= max_position_var:
                    st.error(f"⚠️ Min position ({min_position_var*100:.0f}%) must be less than max position ({max_position_var*100:.0f}%)")
            else:
                # Use risk profile defaults
                max_position_var = config_var['max_position_base']
                min_position_var = 0.02  # Standard minimum

        if st.session_state.get('run_optimization', False):
            # Validate constraints before optimization
            if min_position_var >= max_position_var:
                st.error("❌ Cannot optimize: Min position must be less than max position")
            elif max_position_var * len(enhanced_df) < 1.0:
                st.error(f"❌ Cannot optimize: Max position too small. With {len(enhanced_df)} assets and {max_position_var*100:.0f}% max, portfolio cannot reach 100%")
            else:
                with st.spinner("Running portfolio optimization..."):
                    # PHASE 3: Pass risk profile config for gradual rebalancing
                    # Only use gradual constraints if NOT using manual override
                    gradual_config = None if use_manual_var else config_var
                    rebalancing_df, opt_metrics = calculate_var_cvar_portfolio_optimization(
                        enhanced_df, confidence, lookback, max_position_var, min_position_var,
                        risk_profile_config=gradual_config
                    )

                if rebalancing_df is not None:
                    st.session_state['rebalancing_df'] = rebalancing_df
                    st.session_state['opt_metrics'] = opt_metrics
                    st.success("✅ Optimization complete!")

                    # Toast with key metrics
                    var_reduction = opt_metrics['var_reduction_pct']
                    cvar_reduction = opt_metrics['cvar_reduction_pct']
                    sharpe_improvement = opt_metrics['sharpe_improvement']
                    show_toast(
                        f"VaR/CVaR Optimization: -{var_reduction:.1f}% VaR, -{cvar_reduction:.1f}% CVaR, +{sharpe_improvement:.2f} Sharpe",
                        toast_type="success",
                        duration=5000
                    )

        # Display results if available
        if 'rebalancing_df' in st.session_state:
            rebalancing_df = st.session_state['rebalancing_df']
            opt_metrics = st.session_state['opt_metrics']

            # Risk metrics improvement
            st.markdown("#### 📊 Risk Metrics Improvement")
            col1, col2, col3, col4 = st.columns(4)

            with col1:
                st.metric("Current VaR", f"{opt_metrics['current_var']:.2f}%")
                st.metric("Optimal VaR", f"{opt_metrics['optimal_var']:.2f}%",
                         f"-{opt_metrics['var_reduction_pct']:.1f}%", delta_color="inverse")

            with col2:
                st.metric("Current CVaR", f"{opt_metrics['current_cvar']:.2f}%")
                st.metric("Optimal CVaR", f"{opt_metrics['optimal_cvar']:.2f}%",
                         f"-{opt_metrics['cvar_reduction_pct']:.1f}%", delta_color="inverse")

            with col3:
                st.metric("Current Sharpe", f"{opt_metrics['current_sharpe']:.2f}")
                st.metric("Optimal Sharpe", f"{opt_metrics['optimal_sharpe']:.2f}",
                         f"+{opt_metrics['sharpe_improvement']:.2f}")

            with col4:
                st.metric("Buy Trades", opt_metrics['buy_trades'])
                st.metric("Sell Trades", opt_metrics['sell_trades'])

            # PHASE 3: Display Gradual Rebalancing Metrics
            if opt_metrics.get('gradual_rebalancing'):
                st.markdown("---")
                st.markdown("#### 🔄 Gradual Rebalancing Metrics")

                col_t1, col_t2, col_t3, col_t4 = st.columns(4)
                with col_t1:
                    st.metric("Portfolio Turnover",
                             f"{opt_metrics.get('actual_turnover_pct', 0):.1f}%",
                             help="Total portfolio value being traded")
                with col_t2:
                    st.metric("Max Position Change",
                             f"{opt_metrics.get('max_position_change', 0):.1f}%",
                             help="Largest weight change for any single position")
                with col_t3:
                    st.metric("Rebalance Style",
                             opt_metrics.get('rebalance_style', 'one-time').title(),
                             help="Suggested rebalancing frequency")
                with col_t4:
                    st.metric("Active Trades",
                             opt_metrics['total_trades'],
                             help="Positions requiring trades")

                st.info("💡 **Gradual Rebalancing Active**: Changes are constrained to prevent drastic portfolio reshuffling. "
                       "Multiple rebalancing cycles may be needed to reach optimal allocation.")

                # PHASE 3 DAY 2: Professional Rebalancing Recommendation
                st.markdown("---")
                st.markdown("#### 💼 Professional Rebalancing Recommendation")

                # Generate recommendation based on turnover and position changes
                turnover_pct = opt_metrics.get('actual_turnover_pct', 0)
                max_change = opt_metrics.get('max_position_change', 0)
                rebalance_style = opt_metrics.get('rebalance_style', 'one-time')

                # Calculate how many rebalancing cycles needed to reach optimal
                import math
                max_allowed_turnover = config_var.get('max_turnover_per_rebalance', 0.25) * 100
                if turnover_pct > 0 and max_allowed_turnover > 0:
                    cycles_needed = max(1, int(math.ceil(turnover_pct / max_allowed_turnover)))
                else:
                    cycles_needed = 0

                if cycles_needed <= 1:
                    turnover_limit = config_var.get('max_turnover_per_rebalance', 0.25) * 100
                    rec_text = f"""**Single Rebalance Recommended**

    Your portfolio changes are within the {turnover_limit:.0f}% turnover limit for your **{risk_profile_var.title()}** profile.
    You can implement all recommended trades in a single session.

    **Suggested Approach:**
    1. Execute all BUY orders first (provides immediate exposure)
    2. Execute SELL orders to fund the buys
    3. Review positions after 1-2 weeks to confirm alignment"""
                    st.markdown(rec_text)
                else:
                    per_cycle = turnover_pct / cycles_needed
                    rec_text = f"""**Multi-Cycle Rebalancing Recommended** ({cycles_needed} cycles)

    Your target allocation requires {turnover_pct:.1f}% total turnover, exceeding the {max_allowed_turnover:.0f}% limit per rebalance.
    To maintain gradual transitions:

    **Suggested Approach:**
    1. **Cycle 1 (Now):** Execute highest priority trades (~{per_cycle:.1f}% turnover)
    2. **Cycle 2 ({rebalance_style}):** Re-optimize and execute next batch
    3. **Repeat** until target allocation is achieved

    **Priority Order:**
    - Reduce most overweight positions first (de-risk)
    - Build underweight positions gradually (dollar-cost averaging benefit)"""
                    st.markdown(rec_text)

                # Trade priority list
                with st.expander("📋 Trade Priority Breakdown"):
                    # Show top priority trades
                    priority_trades = rebalancing_df[rebalancing_df['Action'] != 'HOLD'].head(10)
                    if len(priority_trades) > 0:
                        st.markdown("**Top 10 Priority Trades:**")
                        for _, row in priority_trades.iterrows():
                            action_emoji = "🟢" if row['Action'] == 'BUY' else "🔴"
                            weight_change = row['Weight Diff %']
                            trade_val = row['Trade Value']
                            st.markdown(f"{action_emoji} **{row['Ticker']}**: {row['Action']} {abs(row['Shares to Trade']):,} shares "
                                      f"({weight_change:+.1f}% weight, ${abs(trade_val):,.0f})")
                    else:
                        st.info("No trades required - portfolio is already optimally allocated!")

                # PHASE 3 DAY 3: Expert Wisdom Check
                st.markdown("---")
                st.markdown("#### 🧠 Expert Wisdom Check")
                st.caption("Professional portfolio management heuristics")

                # Get optimal weights and check against wisdom rules
                opt_weights = rebalancing_df['Optimal Weight %'].values / 100
                opt_tickers = rebalancing_df['Ticker'].tolist()

                # Try to get returns data for volatility analysis
                try:
                    wisdom_returns = pd.DataFrame()
                    end_dt = datetime.now()
                    start_dt = end_dt - timedelta(days=252)
                    for t in opt_tickers[:20]:  # Limit for performance
                        hist = fetch_historical_data(t, start_dt, end_dt)
                        if hist is not None and len(hist) > 1:
                            wisdom_returns[t] = hist['Close'].pct_change().dropna()
                    wisdom_returns = wisdom_returns.dropna()
                except:
                    wisdom_returns = None

                wisdom_result = check_expert_wisdom(
                    opt_weights,
                    opt_tickers,
                    wisdom_returns,
                    config_var if not use_manual_var else None
                )

                # Display wisdom score
                grade, grade_desc, grade_emoji = get_wisdom_grade(wisdom_result['score'])
                col_w1, col_w2, col_w3 = st.columns([1, 2, 2])

                with col_w1:
                    st.metric(
                        "Wisdom Score",
                        f"{grade}",
                        f"{wisdom_result['score']}/100",
                        help="Score based on professional portfolio management best practices"
                    )

                with col_w2:
                    st.markdown(f"**{grade_emoji} {grade_desc}**")
                    st.caption(f"High: {wisdom_result['high_count']} | Medium: {wisdom_result['medium_count']} | Low: {wisdom_result['low_count']}")

                with col_w3:
                    if wisdom_result['score'] >= 80:
                        st.success("Portfolio follows professional best practices")
                    elif wisdom_result['score'] >= 60:
                        st.warning("Some areas for improvement identified")
                    else:
                        st.error("Significant deviations from best practices")

                # Display violations
                if wisdom_result['violations']:
                    with st.expander(f"📋 View {len(wisdom_result['violations'])} Wisdom Insights", expanded=True):
                        for v in wisdom_result['violations']:
                            if v['severity'] == 'high':
                                st.error(v['message'])
                            elif v['severity'] == 'medium':
                                st.warning(v['message'])
                            else:
                                st.info(v['message'])
                else:
                    st.success("✅ No wisdom rule violations detected - portfolio follows all best practices!")

            # 🎯 NEW v10.3: Realism Scoring & Portfolio Insights
            st.markdown("---")
            st.markdown("#### 🎯 Portfolio Quality Assessment")

            # Get optimal weights from rebalancing_df
            optimal_weights_dict = dict(zip(rebalancing_df['Ticker'], rebalancing_df['Optimal Weight %'] / 100))
            optimal_weights_series = pd.Series(optimal_weights_dict)

            # Create a returns dataframe for validation (fetch historical data)
            try:
                end_date = datetime.now()
                start_date = end_date - timedelta(days=252)

                returns_dict = {}
                for ticker in rebalancing_df['Ticker']:
                    hist_data = fetch_historical_data(ticker, start_date, end_date)
                    if hist_data is not None and len(hist_data) > 1:
                        returns = hist_data['Close'].pct_change().dropna()
                        returns_dict[ticker] = returns

                if returns_dict:
                    returns_df_check = pd.DataFrame(returns_dict).dropna()

                    # Calculate realism score
                    realism = validate_portfolio_realism(
                        optimal_weights_series.values,
                        returns_df_check,
                        'cvar_minimization'
                    )

                    # Calculate explanations
                    explainer = OptimizationExplainer()
                    explanations = explainer.explain_portfolio_weights(
                        optimal_weights_series.values,
                        returns_df_check,
                        'cvar_minimization',
                        None
                    )

                    # Identify red/yellow flags
                    red_flags_data = explainer.identify_red_flags(
                        optimal_weights_series.values,
                        returns_df_check,
                        config_var
                    )

                    # Display realism score prominently
                    col_a, col_b, col_c = st.columns([1, 2, 2])

                    with col_a:
                        score_color = "🟢" if realism['overall'] >= 80 else "🟡" if realism['overall'] >= 60 else "🔴"
                        st.metric("Realism Score", f"{score_color} {realism['overall']}/100")

                    with col_b:
                        st.markdown(f"**Classification:** {realism['classification']}")
                        if realism['issues']:
                            st.caption(f"⚠️ Issues: {', '.join(realism['issues'])}")

                    with col_c:
                        # Effective holdings
                        effective_n = explanations['diversification']['effective_holdings']
                        st.metric("Effective Holdings", f"{effective_n:.1f}")
                        st.caption(explanations['diversification']['explanation'])

                    # Display red/yellow flags if any
                    if red_flags_data['red_flags'] or red_flags_data['yellow_flags']:
                        st.markdown("**⚠️ Alerts:**")
                        for flag in red_flags_data['red_flags']:
                            st.error(flag)
                        for flag in red_flags_data['yellow_flags']:
                            st.warning(flag)
                    else:
                        st.success("✅ No major concerns detected - portfolio looks healthy!")

                    # Portfolio insights in expander
                    with st.expander("📊 Why These Weights? - Portfolio Explanation"):
                        st.markdown("##### Top Holdings Analysis")
                        for holding in explanations['top_holdings']:
                            st.markdown(f"**{holding['ticker']}** - {holding['weight']*100:.1f}%")
                            for reason in holding['reasons']:
                                st.markdown(f"  • {reason}")
                            st.markdown("")

                        st.markdown("##### Risk Contributors")
                        st.markdown("Assets contributing most to portfolio risk:")
                        for contributor in explanations['risk']['top_risk_contributors']:
                            risk_pct = contributor['risk_contribution'] * 100 if contributor['risk_contribution'] > 0 else 0
                            st.markdown(f"  • **{contributor['ticker']}**: {risk_pct:.1f}% risk contribution (weight: {contributor['weight']*100:.1f}%)")

            except Exception as e:
                st.info("💡 Portfolio quality metrics will be displayed after optimization completes")

            st.markdown("---")

            # Rebalancing instructions
            st.markdown("#### 📋 Rebalancing Instructions")
            trades_only = rebalancing_df[rebalancing_df['Action'] != 'HOLD'].copy()

            if len(trades_only) > 0:
                # Format for display
                trades_only['Trade Value'] = trades_only['Trade Value'].apply(
                    lambda x: f"${x:,.0f}" if x > 0 else f"-${abs(x):,.0f}"
                )
                trades_only['Weight Diff %'] = trades_only['Weight Diff %'].apply(
                    lambda x: f"{x:+.1f}%"
                )

                from core.atlas_table_formatting import render_generic_table
                st.markdown(render_generic_table(
                    trades_only[['Ticker', 'Asset Name', 'Action', 'Shares to Trade',
                               'Trade Value', 'Current Weight %', 'Optimal Weight %',
                               'Weight Diff %']],
                    columns=[
                        {'key': 'Ticker', 'label': 'Ticker', 'type': 'ticker'},
                        {'key': 'Asset Name', 'label': 'Name', 'type': 'text'},
                        {'key': 'Action', 'label': 'Action', 'type': 'text'},
                        {'key': 'Shares to Trade', 'label': 'Shares', 'type': 'text'},
                        {'key': 'Trade Value', 'label': 'Trade Value', 'type': 'text'},
                        {'key': 'Current Weight %', 'label': 'Current %', 'type': 'percent'},
                        {'key': 'Optimal Weight %', 'label': 'Optimal %', 'type': 'percent'},
                        {'key': 'Weight Diff %', 'label': 'Diff %', 'type': 'change'},
                    ]
                ), unsafe_allow_html=True)

                # Download button
                csv = rebalancing_df.to_csv(index=False)
                st.download_button(
                    "📥 Export Optimization Plan",
                    csv,
                    f"var_optimization_{datetime.now().strftime('%Y%m%d')}.csv",
                    "text/csv"
                )

            # Weight comparison chart
            st.markdown("#### 📈 Portfolio Weight Comparison")

            # Create comparison chart
            fig = go.Figure()

            # Sort by current weight
            df_sorted = rebalancing_df.sort_values('Current Weight %', ascending=True)

            fig.add_trace(go.Bar(
                name='Current',
                y=df_sorted['Ticker'],
                x=df_sorted['Current Weight %'],
                orientation='h',
                marker_color=COLORS['electric_blue'],
                text=df_sorted['Current Weight %'].apply(lambda x: f"{x:.1f}%"),
                textposition='auto',
            ))

            fig.add_trace(go.Bar(
                name='Optimal',
                y=df_sorted['Ticker'],
                x=df_sorted['Optimal Weight %'],
                orientation='h',
                marker_color=COLORS['teal'],
                text=df_sorted['Optimal Weight %'].apply(lambda x: f"{x:.1f}%"),
                textposition='auto',
            ))

            fig.update_layout(
                title="Current vs Optimal Portfolio Weights",
                xaxis_title="Weight (%)",
                yaxis_title="",
                barmode='group',
                height=max(400, len(df_sorted) * 40),
                template="plotly_dark",
                paper_bgcolor=COLORS['background'],
                plot_bgcolor=COLORS['card_background'],
                showlegend=True,
                legend=dict(
                    orientation="h",
                    yanchor="bottom",
                    y=1.02,
                    xanchor="right",
                    x=1
                )
            )

            st.plotly_chart(fig, use_container_width=True)

    # Continue with remaining pages...
    # ========================================================================
    # PERFORMANCE SUITE

