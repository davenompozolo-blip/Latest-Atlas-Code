"""
Risk Analysis Page
World-class risk metrics and stress testing
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from datetime import datetime, timedelta
import logging

from ..data.cache_manager import load_portfolio_data, load_account_history
from ..data.validators import is_valid_series
from ..visualizations.formatters import ATLASFormatter
from ..visualizations.charts import (
    create_enhanced_holdings_table,
    create_var_waterfall,
    create_var_cvar_distribution,
    create_rolling_var_cvar_chart,
    create_risk_parity_analysis,
    create_efficient_frontier,
    create_drawdown_distribution,
    create_rolling_metrics_chart,
    create_underwater_plot,
    create_risk_contribution_sunburst,
    create_correlation_network,
    create_monte_carlo_chart
)
from ..visualizations.themes import apply_chart_theme
from ..analytics.portfolio import calculate_portfolio_returns
from ..analytics.risk import (
    calculate_sharpe_ratio,
    calculate_sortino_ratio,
    calculate_calmar_ratio,
    calculate_var,
    calculate_cvar,
    calculate_max_drawdown
)
from ..config import COLORS, VERSION, RISK_FREE_RATE

logger = logging.getLogger(__name__)


def calculate_benchmark_returns(benchmark_ticker, start_date, end_date):
    """Calculate benchmark returns for comparison"""
    try:
        import yfinance as yf
        stock = yf.Ticker(benchmark_ticker)
        hist = stock.history(start=start_date, end=end_date)
        
        if hist.empty:
            return None
        
        returns = hist['Close'].pct_change().dropna()
        return returns
    except Exception as e:
        logger.error(f"Error calculating benchmark returns: {e}")
        return None


def run_monte_carlo_simulation(returns, num_simulations=1000, num_days=252):
    """Run Monte Carlo simulation on portfolio returns"""
    if not is_valid_series(returns) or len(returns) < 10:
        return None
    
    try:
        mean_return = returns.mean()
        std_return = returns.std()
        
        simulations = np.zeros((num_simulations, num_days))
        
        for i in range(num_simulations):
            daily_returns = np.random.normal(mean_return, std_return, num_days)
            simulations[i] = (1 + daily_returns).cumprod()
        
        return simulations
    except Exception as e:
        logger.error(f"Error running Monte Carlo simulation: {e}")
        return None


def format_percentage(value, decimals=2):
    """Format value as percentage"""
    if value is None or pd.isna(value):
        return "N/A"
    return f"{value*100:.{decimals}f}%"


def format_currency(value, decimals=2):
    """Format value as currency"""
    if value is None or pd.isna(value):
        return "N/A"
    return f"${value:,.{decimals}f}"


def render():
    """Render the Risk Analysis page"""
    
    st.markdown("## 📈 RISK ANALYSIS - WORLD CLASS")
    
    portfolio_data = load_portfolio_data()
    
    if not portfolio_data:
        st.warning("⚠️ No portfolio data loaded. Please upload via the sidebar.")
        return
    
    df = pd.DataFrame(portfolio_data)
    
    try:
        enhanced_df = create_enhanced_holdings_table(df)
    except Exception as e:
        logger.error(f"Error creating enhanced table: {e}")
        enhanced_df = df
    
    # Get date range from sidebar (would be passed from main.py in full implementation)
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365)
    selected_benchmark = "SPY"  # Default benchmark
    
    with st.spinner("Calculating risk metrics..."):
        portfolio_returns = calculate_portfolio_returns(enhanced_df, start_date, end_date)
        benchmark_returns = calculate_benchmark_returns(selected_benchmark, start_date, end_date)
        
        if not is_valid_series(portfolio_returns):
            st.warning("Insufficient data for risk analysis")
            return
        
        # Calculate risk metrics
        sharpe = calculate_sharpe_ratio(portfolio_returns, RISK_FREE_RATE)
        sortino = calculate_sortino_ratio(portfolio_returns, RISK_FREE_RATE)
        calmar = calculate_calmar_ratio(portfolio_returns)
        var_95 = calculate_var(portfolio_returns, 0.95)
        cvar_95 = calculate_cvar(portfolio_returns, 0.95)
        
        # Calculate max drawdown
        cumulative = (1 + portfolio_returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = ((cumulative - running_max) / running_max).min()
        max_dd = drawdown
    
    # Display key metrics
    col1, col2, col3, col4, col5, col6 = st.columns(6)
    col1.metric("🔥 Sharpe", ATLASFormatter.format_ratio(sharpe, 2) if sharpe else "N/A")
    col2.metric("💎 Sortino", ATLASFormatter.format_ratio(sortino, 2) if sortino else "N/A")
    col3.metric("⚖️ Calmar", ATLASFormatter.format_ratio(calmar, 2) if calmar else "N/A")
    col4.metric("📉 VaR 95%", format_percentage(var_95) if var_95 else "N/A")
    col5.metric("🔴 CVaR 95%", format_percentage(cvar_95) if cvar_95 else "N/A")
    col6.metric("⚠️ Max DD", format_percentage(max_dd) if max_dd else "N/A")
    
    st.markdown("---")
    
    # Tabs for different analyses
    tab1, tab2, tab3, tab4 = st.tabs([
        "📊 Core Risk", "🎲 Monte Carlo", "🔬 Advanced Analytics", "⚡ Stress Tests"
    ])
    
    with tab1:
        col1, col2 = st.columns(2)
        
        with col1:
            try:
                var_chart = create_var_waterfall(portfolio_returns)
                if var_chart:
                    st.plotly_chart(var_chart, use_container_width=True)
            except Exception as e:
                logger.error(f"Error creating VaR waterfall: {e}")
                st.info("VaR waterfall unavailable")

            try:
                var_dist = create_var_cvar_distribution(portfolio_returns)
                if var_dist:
                    st.plotly_chart(var_dist, use_container_width=True)
                else:
                    st.info("Insufficient data for distribution analysis (requires 30+ observations)")
            except Exception as e:
                logger.error(f"Error creating VaR distribution: {e}")
                st.info("VaR distribution unavailable")

            try:
                risk_parity = create_risk_parity_analysis(enhanced_df)
                if risk_parity:
                    st.plotly_chart(risk_parity, use_container_width=True)
            except Exception as e:
                logger.error(f"Error creating risk parity: {e}")
        
        with col2:
            try:
                efficient = create_efficient_frontier(enhanced_df)
                if efficient:
                    st.plotly_chart(efficient, use_container_width=True)
            except Exception as e:
                logger.error(f"Error creating efficient frontier: {e}")
                st.info("Efficient frontier unavailable")

            try:
                drawdown_dist = create_drawdown_distribution(portfolio_returns)
                if drawdown_dist:
                    st.plotly_chart(drawdown_dist, use_container_width=True)
            except Exception as e:
                logger.error(f"Error creating drawdown distribution: {e}")

        # Rolling VaR/CVaR Evolution
        st.markdown("#### 📈 Rolling Risk Metrics Evolution")
        try:
            rolling_var_cvar = create_rolling_var_cvar_chart(portfolio_returns, window=60)
            if rolling_var_cvar:
                st.plotly_chart(rolling_var_cvar, use_container_width=True)
            else:
                st.info("Insufficient data for rolling VaR/CVaR analysis (requires 60+ days)")
        except Exception as e:
            logger.error(f"Error creating rolling VaR/CVaR: {e}")
            st.info("Rolling VaR/CVaR unavailable")

    with tab2:
        st.markdown("#### 🎲 Monte Carlo Simulation")
        
        simulations = run_monte_carlo_simulation(portfolio_returns)
        if simulations is not None:
            try:
                current_value = enhanced_df['Total Value'].sum() if 'Total Value' in enhanced_df.columns else 100000
                monte_carlo_chart_result = create_monte_carlo_chart(simulations, current_value)
                
                if monte_carlo_chart_result:
                    # Unpack results
                    if isinstance(monte_carlo_chart_result, tuple):
                        monte_carlo_chart, mc_stats = monte_carlo_chart_result
                    else:
                        monte_carlo_chart = monte_carlo_chart_result
                        mc_stats = None
                    
                    if monte_carlo_chart:
                        st.plotly_chart(monte_carlo_chart, use_container_width=True)
                    
                    if mc_stats:
                        st.markdown("#### 📊 Simulation Results")
                        st.markdown(f"""
                        **Key Statistics:**
                        - Expected Value: ${mc_stats.get('mean', 0):,.2f}
                        - Median: ${mc_stats.get('median', 0):,.2f}
                        - Best Case (95th): ${mc_stats.get('percentile_95', 0):,.2f}
                        - Worst Case (5th): ${mc_stats.get('percentile_5', 0):,.2f}
                        - Prob of Profit: {mc_stats.get('prob_profit', 0):.1f}%
                        """)
            except Exception as e:
                logger.error(f"Error creating Monte Carlo chart: {e}")
                st.info("Monte Carlo simulation visualization unavailable")
        else:
            st.info("Insufficient data for Monte Carlo simulation")
    
    with tab3:
        col1, col2 = st.columns(2)
        
        with col1:
            try:
                rolling = create_rolling_metrics_chart(portfolio_returns)
                if rolling:
                    st.plotly_chart(rolling, use_container_width=True)
            except Exception as e:
                logger.error(f"Error creating rolling metrics: {e}")
        
        with col2:
            try:
                underwater = create_underwater_plot(portfolio_returns)
                if underwater:
                    st.plotly_chart(underwater, use_container_width=True)
            except Exception as e:
                logger.error(f"Error creating underwater plot: {e}")
        
        try:
            sunburst = create_risk_contribution_sunburst(enhanced_df)
            if sunburst:
                st.plotly_chart(sunburst, use_container_width=True)
        except Exception as e:
            logger.error(f"Error creating risk sunburst: {e}")
        
        try:
            corr_network = create_correlation_network(enhanced_df, start_date, end_date)
            if corr_network:
                st.plotly_chart(corr_network, use_container_width=True)
        except Exception as e:
            logger.error(f"Error creating correlation network: {e}")
    
    with tab4:
        st.markdown("#### ⚡ Market Stress Scenarios")
        st.info("💡 **Stress Testing:** Evaluate portfolio resilience under extreme market conditions")

        # Stress scenario definitions
        stress_scenarios = {
            '📉 Market Crash (-30%)': -0.30,
            '📊 Moderate Correction (-15%)': -0.15,
            '📈 Strong Rally (+25%)': 0.25,
            '💥 Flash Crash (-20%)': -0.20,
            '🔥 Tech Bubble Burst (-40%)': -0.40,
            '⚠️ Credit Crisis (-35%)': -0.35
        }

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("##### Market Shock Scenarios")
            current_value = enhanced_df['Total Value'].sum() if 'Total Value' in enhanced_df.columns else 0

            stress_results = []
            for scenario, shock in stress_scenarios.items():
                new_value = current_value * (1 + shock)
                impact = current_value * shock
                stress_results.append({
                    'Scenario': scenario,
                    'Portfolio Impact': impact,
                    'New Value': new_value,
                    'Return': shock * 100
                })

            stress_df = pd.DataFrame(stress_results)
            stress_df['Portfolio Impact'] = stress_df['Portfolio Impact'].apply(lambda x: format_currency(x))
            stress_df['New Value'] = stress_df['New Value'].apply(lambda x: format_currency(x))
            stress_df['Return'] = stress_df['Return'].apply(lambda x: f"{x:+.1f}%")

            st.dataframe(stress_df, use_container_width=True, hide_index=True)

            st.caption(f"💼 Current Portfolio Value: {format_currency(current_value)}")

        # Stress Test Visualization
        st.markdown("---")
        st.markdown("##### 📊 Stress Test Impact Visualization")

        scenarios_short = [s.split(' ')[0] + ' ' + s.split('(')[1].replace(')', '') for s in stress_scenarios.keys()]
        shocks = list(stress_scenarios.values())

        fig_stress = go.Figure()

        colors_stress = [COLORS['success'] if s > 0 else COLORS['danger'] for s in shocks]

        fig_stress.add_trace(go.Bar(
            x=scenarios_short,
            y=[s * 100 for s in shocks],
            marker=dict(
                color=colors_stress,
                line=dict(color=COLORS['border'], width=2),
                opacity=0.8
            ),
            text=[f"{s*100:+.0f}%" for s in shocks],
            textposition='outside',
            textfont=dict(size=12, color=COLORS['text_primary']),
            hovertemplate='<b>%{x}</b><br>Impact: %{y:.1f}%<br>Portfolio Value: $%{customdata:,.0f}<extra></extra>',
            customdata=[current_value * (1 + s) for s in shocks]
        ))

        fig_stress.update_layout(
            title="Stress Test Scenarios - Portfolio Impact",
            xaxis_title="Scenario",
            yaxis_title="Return Impact (%)",
            height=400,
            showlegend=False,
            xaxis=dict(tickangle=-45)
        )

        fig_stress.add_hline(
            y=0,
            line_dash="solid",
            line_color=COLORS['text_muted'],
            line_width=2
        )

        apply_chart_theme(fig_stress)
        st.plotly_chart(fig_stress, use_container_width=True)

        with col2:
            st.markdown("##### Sector Concentration Risk")
            if 'Sector' in enhanced_df.columns and 'Weight %' in enhanced_df.columns:
                sector_concentration = enhanced_df.groupby('Sector')['Weight %'].sum().sort_values(ascending=False)

                concentration_warnings = []
                for sector, weight in sector_concentration.items():
                    if weight > 30:
                        risk_level = "🔴 HIGH"
                    elif weight > 20:
                        risk_level = "🟡 MEDIUM"
                    else:
                        risk_level = "🟢 LOW"

                    concentration_warnings.append({
                        'Sector': sector,
                        'Allocation': f"{weight:.1f}%",
                        'Risk Level': risk_level
                    })

                conc_df = pd.DataFrame(concentration_warnings)
                st.dataframe(conc_df, use_container_width=True, hide_index=True)

                st.caption("⚠️ Sectors >30% = High concentration risk")
                st.caption("🟡 Sectors 20-30% = Medium concentration risk")
            else:
                st.info("Sector concentration data unavailable")
    
    logger.info("Risk Analysis page rendered successfully")
