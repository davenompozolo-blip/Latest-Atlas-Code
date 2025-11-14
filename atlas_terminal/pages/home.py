"""
Portfolio Home Page
Main dashboard with portfolio overview and key metrics
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from datetime import datetime
import logging

from ..data.cache_manager import load_portfolio_data, load_account_history
from ..data.validators import validate_portfolio_data, is_valid_dataframe
from ..data.parsers import get_leverage_info
from ..visualizations.formatters import ATLASFormatter
from ..visualizations.themes import apply_chart_theme
from ..analytics.portfolio import calculate_portfolio_statistics
from ..config import COLORS, VERSION

logger = logging.getLogger(__name__)


def render():
    """Render the Portfolio Home page"""
    
    st.title("🏠 Portfolio Home")
    st.caption(f"ATLAS Terminal v{VERSION} - Real-Time Portfolio Analytics")
    
    # Load data
    portfolio_data = load_portfolio_data()
    
    if not portfolio_data:
        st.warning("⚠️ No portfolio data loaded. Please upload your portfolio data.")
        st.info("📁 Use the sidebar to upload portfolio snapshot, trade history, and account history files.")
        return
    
    # Validate data
    validation = validate_portfolio_data(portfolio_data)
    
    if not validation['is_valid']:
        st.error("❌ Portfolio data validation failed:")
        for issue in validation['issues']:
            st.error(f"  • {issue}")
        return
    
    # Convert to DataFrame
    df = pd.DataFrame(portfolio_data)
    
    # Key Metrics Row
    st.subheader("📊 Key Metrics")
    
    col1, col2, col3, col4 = st.columns(4)
    
    # Total Holdings
    with col1:
        st.metric(
            "Total Holdings",
            len(df),
            delta=None
        )
    
    # Total Value
    with col2:
        if 'Total Value' in df.columns:
            total_value = df['Total Value'].sum()
            st.metric(
                "Portfolio Value",
                ATLASFormatter.format_large_currency(total_value, decimals=2)
            )
        else:
            st.metric("Portfolio Value", "N/A")
    
    # Total P&L
    with col3:
        if 'Gain/Loss $' in df.columns or 'Total Gain/Loss $' in df.columns:
            pnl_col = 'Gain/Loss $' if 'Gain/Loss $' in df.columns else 'Total Gain/Loss $'
            total_pnl = df[pnl_col].sum()
            pnl_pct = (total_pnl / (total_value - total_pnl)) * 100 if total_value > total_pnl else 0
            st.metric(
                "Total P&L",
                ATLASFormatter.format_currency(total_pnl, decimals=0),
                delta=f"{pnl_pct:+.1f}%"
            )
        else:
            st.metric("Total P&L", "N/A")
    
    # Leverage
    with col4:
        leverage_info = get_leverage_info()
        if leverage_info:
            leverage_ratio = leverage_info['leverage_ratio']
            margin_used = leverage_info['margin_used']
            
            # Color code leverage
            if leverage_ratio > 2.0:
                delta_color = "inverse"
            else:
                delta_color = "normal"
            
            st.metric(
                "Leverage",
                f"{leverage_ratio:.2f}x",
                delta=ATLASFormatter.format_currency(margin_used, decimals=0) if margin_used > 0 else "No Margin"
            )
        else:
            st.metric("Leverage", "1.00x", delta="No Margin")
    
    # Data Quality Score
    st.divider()
    quality_score = validation['data_quality_score']
    
    if quality_score >= 90:
        quality_color = "🟢"
        quality_text = "Excellent"
    elif quality_score >= 70:
        quality_color = "🟡"
        quality_text = "Good"
    else:
        quality_color = "🔴"
        quality_text = "Poor"
    
    st.caption(f"{quality_color} Data Quality: {quality_text} ({quality_score}/100)")
    
    # Warnings
    if validation['warnings']:
        with st.expander("⚠️ Data Warnings", expanded=False):
            for warning in validation['warnings']:
                st.warning(warning)
    
    # Holdings Table
    st.subheader("📋 Current Holdings")
    
    # Select columns to display
    display_cols = []
    for col in ['Ticker', 'Quantity', 'Current Price', 'Total Value', 'Cost Basis', 
                'Gain/Loss $', 'Gain/Loss %', 'Weight %', 'Sector']:
        if col in df.columns:
            display_cols.append(col)
    
    if display_cols:
        # Sort by total value descending
        if 'Total Value' in df.columns:
            df_display = df[display_cols].sort_values('Total Value', ascending=False)
        else:
            df_display = df[display_cols]
        
        # Format for display
        st.dataframe(
            df_display,
            use_container_width=True,
            height=400
        )
    else:
        st.warning("Unable to display holdings - missing required columns")
    
    logger.info("Portfolio Home page rendered successfully")
