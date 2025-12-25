"""
ATLAS Terminal - Enhanced Fomo-Inspired Table Functions
Phase 2A Component Enhancements

Premium glassmorphic tables with badges, hover effects, and professional polish.
This module extends the base tables.py with Fomo-inspired styling.
"""

import streamlit as st
import pandas as pd
from typing import Optional, Dict, List
import hashlib


# Fomo-Inspired Color Palette
COLORS = {
    'bg_glass': 'rgba(21, 25, 50, 0.6)',
    'bg_hover': 'rgba(99, 102, 241, 0.1)',
    'border': 'rgba(99, 102, 241, 0.15)',
    'border_hover': 'rgba(99, 102, 241, 0.3)',
    'text_primary': '#f8fafc',
    'text_secondary': '#94a3b8',
    'text_muted': '#64748b',
    'accent_primary': '#6366f1',
    'accent_cyan': '#00d4ff',
    'success': '#10b981',
    'danger': '#ef4444',
    'warning': '#f59e0b',
}


def atlas_table(
    df: pd.DataFrame,
    title: Optional[str] = None,
    subtitle: Optional[str] = None,
    hoverable: bool = True,
    striped: bool = False,
    compact: bool = False,
    show_index: bool = False,
    height: Optional[int] = None
) -> None:
    """
    Render DataFrame with Fomo-inspired glassmorphic styling

    Args:
        df: DataFrame to display
        title: Optional table title with gradient styling
        subtitle: Optional subtitle text
        hoverable: Enable row hover glow effects (default True)
        striped: Enable zebra row striping (default False)
        compact: Use compact row spacing (default False)
        show_index: Show DataFrame index (default False)
        height: Optional fixed height in pixels

    Features:
        - Glassmorphic container with backdrop blur
        - Gradient borders and hover effects
        - Professional typography
        - Responsive design
        - Smooth transitions

    Example:
        >>> atlas_table(holdings_df, title="Portfolio Holdings", hoverable=True)
    """

    # Generate unique table ID
    table_id = f"atlas_tbl_{hashlib.md5(str(df.head()).encode()).hexdigest()[:8]}"

    # Title section
    if title:
        title_html = f"""
        <div style='margin-bottom: 1rem;'>
            <h3 style='
                font-size: 1.25rem;
                font-weight: 700;
                margin: 0 0 0.25rem 0;
                background: linear-gradient(135deg, {COLORS['accent_cyan']} 0%, {COLORS['accent_primary']} 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            '>{title}</h3>
            {f"<p style='color: {COLORS['text_muted']}; font-size: 0.875rem; margin: 0;'>{subtitle}</p>" if subtitle else ''}
        </div>
        """
        st.markdown(title_html, unsafe_allow_html=True)

    # Table styling
    row_height = '2.5rem' if compact else '3rem'
    hover_effect = f"""
        .{table_id} tbody tr:hover {{
            background: {COLORS['bg_hover']} !important;
            transform: translateX(4px);
            box-shadow: -2px 0 0 {COLORS['accent_primary']};
        }}
    """ if hoverable else ""

    striped_effect = f"""
        .{table_id} tbody tr:nth-child(even) {{
            background: rgba(255, 255, 255, 0.02);
        }}
    """ if striped else ""

    table_css = f"""
    <style>
        /* Table Container - Glassmorphic */
        .{table_id}-container {{
            background: {COLORS['bg_glass']};
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border-radius: 16px;
            border: 1px solid {COLORS['border']};
            padding: 1.5rem;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            transition: border-color 0.3s ease;
        }}

        .{table_id}-container:hover {{
            border-color: {COLORS['border_hover']};
        }}

        /* Table Wrapper - Scrollable */
        .{table_id}-wrapper {{
            overflow-x: auto;
            overflow-y: auto;
            {f'max-height: {height}px;' if height else ''}
            border-radius: 8px;
        }}

        /* Table Base */
        .{table_id} {{
            width: 100%;
            border-collapse: collapse;
            font-size: 0.875rem;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }}

        /* Table Header */
        .{table_id} thead {{
            position: sticky;
            top: 0;
            z-index: 10;
            background: rgba(21, 25, 50, 0.95);
            backdrop-filter: blur(10px);
        }}

        .{table_id} thead th {{
            text-align: left;
            padding: 0.875rem 1rem;
            color: {COLORS['text_secondary']};
            font-weight: 600;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            border-bottom: 2px solid {COLORS['border']};
            white-space: nowrap;
        }}

        /* Table Body */
        .{table_id} tbody tr {{
            border-bottom: 1px solid rgba(99, 102, 241, 0.05);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }}

        {hover_effect}
        {striped_effect}

        .{table_id} tbody td {{
            padding: 0.875rem 1rem;
            color: {COLORS['text_primary']};
            height: {row_height};
            vertical-align: middle;
        }}

        /* Numeric columns alignment */
        .{table_id} tbody td.numeric {{
            text-align: right;
            font-family: 'JetBrains Mono', 'Consolas', monospace;
            font-variant-numeric: tabular-nums;
        }}

        /* Scrollbar Styling */
        .{table_id}-wrapper::-webkit-scrollbar {{
            width: 8px;
            height: 8px;
        }}

        .{table_id}-wrapper::-webkit-scrollbar-track {{
            background: rgba(10, 14, 39, 0.4);
            border-radius: 4px;
        }}

        .{table_id}-wrapper::-webkit-scrollbar-thumb {{
            background: linear-gradient(135deg, {COLORS['accent_cyan']}, {COLORS['accent_primary']});
            border-radius: 4px;
        }}

        .{table_id}-wrapper::-webkit-scrollbar-thumb:hover {{
            background: linear-gradient(135deg, {COLORS['accent_primary']}, #8b5cf6);
        }}
    </style>
    """

    # Convert DataFrame to HTML
    html_table = df.to_html(
        index=show_index,
        escape=False,
        classes=table_id,
        border=0
    )

    # Wrap in container
    full_html = f"""
    {table_css}
    <div class='{table_id}-container'>
        <div class='{table_id}-wrapper'>
            {html_table}
        </div>
    </div>
    """

    st.markdown(full_html, unsafe_allow_html=True)


def atlas_table_with_badges(
    df: pd.DataFrame,
    title: Optional[str] = None,
    badge_column: Optional[str] = None,
    badge_mapping: Optional[Dict[str, str]] = None
) -> None:
    """
    Render table with badge pills in specified column

    Args:
        df: DataFrame to display
        title: Optional table title
        badge_column: Column name to render as badges
        badge_mapping: Map column values to badge types
                      e.g., {'BUY': 'success', 'SELL': 'danger', 'HOLD': 'neutral'}

    Example:
        >>> badge_mapping = {'BUY': 'success', 'SELL': 'danger', 'HOLD': 'neutral'}
        >>> atlas_table_with_badges(trades_df, "Trades", "Action", badge_mapping)
    """
    # Import badge function
    from .badges import badge

    # Create copy to avoid modifying original
    display_df = df.copy()

    # Apply badges if specified
    if badge_column and badge_column in display_df.columns and badge_mapping:
        display_df[badge_column] = display_df[badge_column].apply(
            lambda x: badge(
                text=str(x),
                badge_type=badge_mapping.get(x, 'neutral'),
                size='sm'
            ) if pd.notna(x) else ''
        )

    # Render with atlas_table
    atlas_table(display_df, title=title, hoverable=True)


# ==================== COMPONENT TESTING ====================
if __name__ == "__main__":
    """
    Test enhanced table functions
    Run with: streamlit run ui/components/tables_enhanced.py
    """
    st.set_page_config(
        page_title="ATLAS - Enhanced Tables Test",
        page_icon="📊",
        layout="wide",
        initial_sidebar_state="collapsed"
    )

    st.title("📊 ATLAS Enhanced Tables - Test Suite")
    st.markdown("---")

    # Sample data
    sample_df = pd.DataFrame({
        'Ticker': ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA'],
        'Asset Name': ['Apple Inc.', 'Alphabet Inc.', 'Microsoft Corp.',
                       'Amazon.com Inc.', 'Tesla Inc.', 'Meta Platforms', 'NVIDIA Corp.'],
        'Shares': [100, 50, 75, 30, 25, 40, 20],
        'Price': [185.50, 142.30, 378.90, 151.20, 242.50, 487.30, 495.20],
        'Return %': [15.2, -3.4, 8.7, -1.2, 22.5, 12.3, 35.8],
        'Weight %': [22.5, 15.3, 18.7, 12.1, 8.9, 11.2, 11.3],
        'Action': ['HOLD', 'SELL', 'BUY', 'HOLD', 'BUY', 'HOLD', 'BUY']
    })

    # Test 1: Basic table
    st.subheader("Basic Glassmorphic Table")
    atlas_table(sample_df, title="Portfolio Holdings", subtitle="Top 7 positions by weight")

    st.markdown("---")

    # Test 2: Compact table
    st.subheader("Compact Table with Hover")
    atlas_table(sample_df, title="Compact View", compact=True, hoverable=True)

    st.markdown("---")

    # Test 3: Table with badges
    st.subheader("Table with Badge Pills")
    badge_mapping = {
        'BUY': 'success',
        'SELL': 'danger',
        'HOLD': 'neutral'
    }
    atlas_table_with_badges(
        sample_df,
        title="Trading Signals",
        badge_column="Action",
        badge_mapping=badge_mapping
    )

    st.markdown("---")

    # Test 4: Fixed height scrollable
    large_df = pd.concat([sample_df] * 10, ignore_index=True)
    st.subheader("Fixed Height Scrollable Table")
    atlas_table(large_df, title="Scrollable View (300px)", height=300, striped=True)

    st.markdown("---")
    st.success("✅ Enhanced tables test complete!")
    st.info("**Usage:** Import with `from ui.components.tables_enhanced import atlas_table, atlas_table_with_badges`")
