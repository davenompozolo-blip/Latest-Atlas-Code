"""
ATLAS Terminal - Tables Component Library
Phase 2 Day 5 - Data Table Components
Phase 2A - Enhanced Fomo-Inspired Tables

Reusable table display and styling functions with glassmorphic design.
"""

import streamlit as st
import pandas as pd
from typing import Optional, Dict, List, Literal
import hashlib


# Helper function for arrow indicators
def add_arrow_indicator(value):
    """Add up/down arrows to percentage strings based on value"""
    try:
        val = float(str(value).replace('%', '').replace('$', '').replace(',', ''))
        if val > 0:
            return f"↑ {value}"
        elif val < 0:
            return f"↓ {value}"
        return f" {value}"
    except:
        return value


# Import formatting functions from atlas_app for now
# TODO: Move these to utils/formatting.py in future refactoring
def format_percentage(value, decimals=2):
    """Format number as percentage string"""
    if pd.isna(value) or value is None:
        return "N/A"
    try:
        return f"{value:.{decimals}f}%"
    except:
        return str(value)


def format_currency(value, decimals=2):
    """Format number as currency string"""
    if pd.isna(value) or value is None:
        return "N/A"
    try:
        if abs(value) >= 1e9:
            return f"${value/1e9:.{decimals}f}B"
        elif abs(value) >= 1e6:
            return f"${value/1e6:.{decimals}f}M"
        elif abs(value) >= 1e3:
            return f"${value/1e3:.{decimals}f}K"
        return f"${value:.{decimals}f}"
    except:
        return str(value)


def make_scrollable_table(df, height=600, hide_index=True, use_container_width=True, column_config=None):
    """
    Make any dataframe horizontally scrollable with professional styling.

    Args:
        df: DataFrame to display
        height: Table height in pixels (default 600)
        hide_index: Whether to hide the index column (default True)
        use_container_width: Whether to use full container width (default True)
        column_config: Optional column configuration dict

    Returns:
        Streamlit dataframe component with horizontal scrolling enabled
    """
    # Inject CSS for horizontal scrolling
    st.markdown(
        """
        <style>
        /* Enable horizontal scrolling for all dataframes */
        div[data-testid="stDataFrame"] > div {
            overflow-x: auto !important;
            max-width: 100% !important;
        }

        /* Ensure table doesn't collapse */
        div[data-testid="stDataFrame"] table {
            min-width: 100% !important;
        }

        /* Better scrollbar styling */
        div[data-testid="stDataFrame"] > div::-webkit-scrollbar {
            height: 8px;
        }

        div[data-testid="stDataFrame"] > div::-webkit-scrollbar-track {
            background: #0a1929;
        }

        div[data-testid="stDataFrame"] > div::-webkit-scrollbar-thumb {
            background: #818cf8;
            border-radius: 4px;
        }

        div[data-testid="stDataFrame"] > div::-webkit-scrollbar-thumb:hover {
            background: #00ffcc;
        }
        </style>
        """,
        unsafe_allow_html=True
    )

    # Display the dataframe
    return st.dataframe(
        df,
        use_container_width=use_container_width,
        hide_index=hide_index,
        height=height,
        column_config=column_config
    )


def style_holdings_dataframe(df):
    """Apply standard styling to holdings dataframe"""
    display_df = df[[
        'Ticker', 'Asset Name', 'Shares', 'Avg Cost', 'Current Price',
        'Daily Change %', '5D Return %', 'Weight %', 'Daily P&L $',
        'Total Gain/Loss $', 'Total Gain/Loss %', 'Beta', 'Analyst Rating'
    ]].copy()

    pct_cols = ['Daily Change %', '5D Return %', 'Weight %', 'Total Gain/Loss %']
    for col in pct_cols:
        display_df[col] = display_df[col].apply(lambda x: format_percentage(x))

    currency_cols = ['Avg Cost', 'Current Price', 'Daily P&L $', 'Total Gain/Loss $']
    for col in currency_cols:
        display_df[col] = display_df[col].apply(format_currency)

    display_df['Daily Change %'] = display_df['Daily Change %'].apply(add_arrow_indicator)
    display_df['Total Gain/Loss %'] = display_df['Total Gain/Loss %'].apply(add_arrow_indicator)

    return display_df


def style_holdings_dataframe_with_optimization(df):
    """Style holdings dataframe with optimization columns highlighted"""
    display_df = df[[
        'Ticker', 'Asset Name', 'Shares', 'Current Price',
        'Weight %', 'Optimal Weight %', 'Weight Diff %',
        'Shares to Trade', 'Action', 'Total Gain/Loss %'
    ]].copy()

    # Format percentages
    pct_cols = ['Weight %', 'Optimal Weight %', 'Weight Diff %', 'Total Gain/Loss %']
    for col in pct_cols:
        if col in display_df.columns:
            display_df[col] = display_df[col].apply(lambda x: format_percentage(x) if pd.notna(x) else '')

    # Format currency
    display_df['Current Price'] = display_df['Current Price'].apply(format_currency)

    # Format shares to trade with sign
    display_df['Shares to Trade'] = display_df['Shares to Trade'].apply(
        lambda x: f"+{int(x):,}" if x > 0 else f"{int(x):,}" if x < 0 else "0" if pd.notna(x) else ''
    )

    # Add indicators to action column
    def style_action(val):
        if val == 'BUY':
            return '▲ BUY'
        elif val == 'SELL':
            return '▼ SELL'
        elif val == 'HOLD':
            return '● HOLD'
        return val

    if 'Action' in display_df.columns:
        display_df['Action'] = display_df['Action'].apply(style_action)

    return display_df
