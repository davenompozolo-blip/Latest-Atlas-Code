"""
Portfolio Home Page - FULL MIGRATION
Complete dashboard with all features from original atlas.py
"""

import streamlit as st
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import logging

from ..data.cache_manager import (
    load_portfolio_data, load_account_history,
    load_trade_history
)
from ..data.validators import validate_portfolio_data, is_valid_series
from ..data.parsers import get_leverage_info
from ..visualizations.formatters import ATLASFormatter
from ..visualizations.charts import (
    create_enhanced_holdings_table,
    create_risk_snapshot,
    create_signal_health_badge,
    create_top_contributors_chart,
    create_top_detractors_chart,
    create_sector_allocation_donut,
    create_risk_reward_plot,
    create_pnl_attribution_sector,
    create_pnl_attribution_position,
    create_performance_heatmap
)
from ..analytics.portfolio import calculate_portfolio_returns
from ..analytics.risk import calculate_comprehensive_risk_metrics
from ..config import COLORS, VERSION

logger = logging.getLogger(__name__)


def style_holdings_dataframe(df):
    """Style the holdings dataframe for display"""
    # Select display columns
    display_cols = []
    for col in ['Ticker', 'Quantity', 'Current Price', 'Total Value', 
                'Cost Basis', 'Total Gain/Loss $', 'Gain/Loss %', 
                'Weight %', 'Sector', 'Daily P&L $']:
        if col in df.columns:
            display_cols.append(col)
    
    return df[display_cols] if display_cols else df


def calculate_performance_metrics(df, portfolio_returns, benchmark_returns):
    """Calculate performance metrics for health badge"""
    metrics = {}
    
    if is_valid_series(portfolio_returns):
        # Basic stats
        metrics['total_return'] = (portfolio_returns + 1).prod() - 1
        metrics['volatility'] = portfolio_returns.std() * np.sqrt(252)
        metrics['sharpe'] = (portfolio_returns.mean() * 252) / (portfolio_returns.std() * np.sqrt(252)) if portfolio_returns.std() > 0 else 0
        
        # Drawdown
        cumulative = (1 + portfolio_returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = ((cumulative - running_max) / running_max).min()
        metrics['max_drawdown'] = drawdown
        
        # Win rate
        metrics['win_rate'] = (portfolio_returns > 0).sum() / len(portfolio_returns) if len(portfolio_returns) > 0 else 0
    else:
        metrics = {
            'total_return': 0,
            'volatility': 0,
            'sharpe': 0,
            'max_drawdown': 0,
            'win_rate': 0
        }
    
    return metrics


def render():
    """Render the complete Portfolio Home page"""
    
    st.markdown("## 🏠 PORTFOLIO HOME")
    
    # Load data
    portfolio_data = load_portfolio_data()
    
    if not portfolio_data:
        st.warning("⚠️ No portfolio data loaded. Please upload via the sidebar.")
        st.info("📁 Upload your portfolio snapshot, trade history, and account history files in the sidebar.")
        return
    
    # Convert to DataFrame and enhance
    df = pd.DataFrame(portfolio_data)
    
    with st.spinner("Loading portfolio data..."):
        try:
            enhanced_df = create_enhanced_holdings_table(df)
        except Exception as e:
            logger.error(f"Error creating enhanced holdings table: {e}", exc_info=True)
            st.error(f"Error processing portfolio data: {e}")
            enhanced_df = df
    
    # Calculate key metrics
    total_value = enhanced_df['Total Value'].sum() if 'Total Value' in enhanced_df.columns else 0
    total_cost = enhanced_df['Total Cost'].sum() if 'Total Cost' in enhanced_df.columns else 0
    total_gl = total_value - total_cost
    total_gl_pct = (total_gl / total_cost) * 100 if total_cost > 0 else 0
    daily_pl = enhanced_df['Daily P&L $'].sum() if 'Daily P&L $' in enhanced_df.columns else 0
    
    # Top metrics row
    col1, col2, col3, col4, col5 = st.columns(5)
    
    with col1:
        st.metric(
            "Total Value",
            ATLASFormatter.format_currency(total_value, decimals=0)
        )
    
    with col2:
        st.metric(
            "Total Cost",
            ATLASFormatter.format_currency(total_cost, decimals=0)
        )
    
    with col3:
        st.metric(
            "Total G/L",
            ATLASFormatter.format_currency(total_gl, decimals=0),
            delta=f"{total_gl_pct:+.1f}%"
        )
    
    with col4:
        st.metric(
            "Daily P&L",
            ATLASFormatter.format_currency(daily_pl, decimals=0)
        )
    
    with col5:
        st.metric(
            "📊 Positions",
            len(enhanced_df)
        )
    
    # Data Quality Score
    st.markdown("---")
    validation_result = validate_portfolio_data(portfolio_data)
    quality_score = validation_result['data_quality_score']
    
    if quality_score >= 90:
        quality_color = COLORS['success']
        quality_status = "EXCELLENT"
    elif quality_score >= 75:
        quality_color = COLORS['info']
        quality_status = "GOOD"
    elif quality_score >= 60:
        quality_color = COLORS['warning']
        quality_status = "FAIR"
    else:
        quality_color = COLORS['danger']
        quality_status = "POOR"
    
    st.markdown(f"""
    <div style='background: linear-gradient(135deg, {COLORS['card_background']} 0%, {COLORS['card_background_alt']} 100%);
                border-left: 4px solid {quality_color};
                padding: 12px 20px;
                border-radius: 8px;
                margin: 15px 0;'>
        <div style='display: flex; align-items: center; justify-content: space-between;'>
            <div>
                <span style='color: {COLORS['text_muted']}; font-size: 12px;'>DATA QUALITY SCORE</span>
                <span style='color: {quality_color}; font-size: 24px; font-weight: 700; margin-left: 15px;'>{quality_score}/100</span>
                <span style='color: {quality_color}; font-size: 14px; font-weight: 600; margin-left: 10px;'>{quality_status}</span>
            </div>
            <div style='text-align: right; color: {COLORS['text_secondary']}; font-size: 11px;'>
                {validation_result['complete_rows']}/{validation_result['total_rows']} Complete Rows
                {f"<br/><span style='color: {COLORS['danger']};'>⚠️ {len(validation_result['issues'])} Issues</span>" if validation_result['issues'] else ""}
                {f"<br/><span style='color: {COLORS['warning']};'>⚡ {len(validation_result['warnings'])} Warnings</span>" if validation_result['warnings'] else ""}
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # Data quality details
    if validation_result['issues'] or validation_result['warnings']:
        with st.expander("🔍 View Data Quality Details", expanded=False):
            if validation_result['issues']:
                st.error("**Issues Found:**")
                for issue in validation_result['issues']:
                    st.write(f"- {issue}")
            if validation_result['warnings']:
                st.warning("**Warnings:**")
                for warning in validation_result['warnings']:
                    st.write(f"- {warning}")
    
    st.markdown("---")

    # Calculate portfolio returns from account history
    account_history = load_account_history()
    portfolio_returns = None

    if account_history is not None and not account_history.empty:
        portfolio_returns = calculate_portfolio_returns(account_history, apply_leverage=True)
    else:
        logger.warning("No account history available - performance metrics will be limited")

    # Risk Snapshot & Signal Health
    col_health, col_snapshot = st.columns([1, 3])
    
    with col_health:
        # Calculate metrics for health indicator
        if is_valid_series(portfolio_returns):
            try:
                metrics = calculate_performance_metrics(enhanced_df, portfolio_returns, None)
                health_badge = create_signal_health_badge(metrics)
                st.markdown("### 🎯 Portfolio Health")
                st.markdown(health_badge, unsafe_allow_html=True)
                st.caption(f"**Last Updated:** {ATLASFormatter.format_timestamp()}")
            except Exception as e:
                logger.error(f"Error creating health badge: {e}")
                st.info("Portfolio health metrics unavailable")
    
    with col_snapshot:
        # Risk Snapshot
        try:
            risk_snapshot_html = create_risk_snapshot(enhanced_df, portfolio_returns)
            st.markdown(risk_snapshot_html, unsafe_allow_html=True)
        except Exception as e:
            logger.error(f"Error creating risk snapshot: {e}")
            st.info("Risk snapshot unavailable")
    
    st.markdown("---")
    
    # Holdings Table
    st.markdown("### 📋 Holdings")
    try:
        display_df = style_holdings_dataframe(enhanced_df)
        st.dataframe(display_df, use_container_width=True, hide_index=True, height=500)
    except Exception as e:
        logger.error(f"Error displaying holdings: {e}")
        st.dataframe(enhanced_df, use_container_width=True, height=500)
    
    st.info("💡 **Tip:** Head to the Valuation House to analyze intrinsic values of any ticker!")
    
    st.markdown("---")
    st.markdown("### 📊 DASHBOARD OVERVIEW")
    
    # Row 1: Risk/Reward Plot and Sector Allocation
    row1_col1, row1_col2 = st.columns([2, 1])
    
    with row1_col1:
        try:
            risk_reward = create_risk_reward_plot(enhanced_df)
            if risk_reward:
                st.plotly_chart(risk_reward, use_container_width=True)
        except Exception as e:
            logger.error(f"Error creating risk/reward plot: {e}")
            st.info("Risk/Reward plot unavailable")
    
    with row1_col2:
        try:
            sector_donut = create_sector_allocation_donut(enhanced_df)
            if sector_donut:
                st.plotly_chart(sector_donut, use_container_width=True)
        except Exception as e:
            logger.error(f"Error creating sector donut: {e}")
            st.info("Sector allocation chart unavailable")
    
    # Row 2: Contributors and Detractors
    row2_col1, row2_col2 = st.columns(2)
    
    with row2_col1:
        try:
            contributors = create_top_contributors_chart(enhanced_df)
            if contributors:
                st.plotly_chart(contributors, use_container_width=True)
        except Exception as e:
            logger.error(f"Error creating contributors chart: {e}")
            st.info("Top contributors chart unavailable")
    
    with row2_col2:
        try:
            detractors = create_top_detractors_chart(enhanced_df)
            if detractors:
                st.plotly_chart(detractors, use_container_width=True)
        except Exception as e:
            logger.error(f"Error creating detractors chart: {e}")
            st.info("Top detractors chart unavailable")
    
    # P&L Attribution Analysis
    st.markdown("---")
    st.markdown("### 💼 P&L Attribution Analysis")
    
    pnl_col1, pnl_col2 = st.columns(2)
    
    with pnl_col1:
        try:
            pnl_sector = create_pnl_attribution_sector(enhanced_df)
            if pnl_sector:
                st.plotly_chart(pnl_sector, use_container_width=True)
        except Exception as e:
            logger.error(f"Error creating sector P&L attribution: {e}")
            st.info("Sector P&L attribution unavailable")
    
    with pnl_col2:
        try:
            pnl_position = create_pnl_attribution_position(enhanced_df, top_n=10)
            if pnl_position:
                st.plotly_chart(pnl_position, use_container_width=True)
        except Exception as e:
            logger.error(f"Error creating position P&L attribution: {e}")
            st.info("Position P&L attribution unavailable")
    
    # Performance Heatmap (full width)
    st.markdown("---")
    try:
        perf_heatmap = create_performance_heatmap(enhanced_df)
        if perf_heatmap:
            st.plotly_chart(perf_heatmap, use_container_width=True)
    except Exception as e:
        logger.error(f"Error creating performance heatmap: {e}")
        st.info("Performance heatmap unavailable")
    
    logger.info("Portfolio Home page rendered successfully")
