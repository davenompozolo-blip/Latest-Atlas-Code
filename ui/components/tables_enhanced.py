"""
ATLAS Terminal - Enhanced Table Component
Fomo-inspired data tables with glassmorphic styling, badges, and hover effects

Created: December 2024
Phase: 2A - Component Transformation
Author: Hlobo

IMPORTANT: These functions render directly to Streamlit - they do NOT return HTML strings.
"""

import streamlit as st
import pandas as pd
from typing import Optional, Dict, List
import hashlib


def atlas_table(
    df: pd.DataFrame,
    title: Optional[str] = None,
    height: Optional[int] = None,
    show_index: bool = False,
    striped: bool = True,
    hoverable: bool = True,
    compact: bool = False
) -> None:
    """
    Render enhanced data table with Fomo-inspired styling.

    IMPORTANT: This function renders directly to Streamlit - it does NOT return anything.

    Args:
        df: DataFrame to display
        title: Optional table title with gradient styling
        height: Optional max height (enables scrolling)
        show_index: Show DataFrame index column
        striped: Enable zebra striping
        hoverable: Enable row hover effects
        compact: Use compact spacing

    Features:
        - Glassmorphic container
        - Gradient accent borders
        - Hover row highlighting
        - Responsive design
        - Professional typography

    Example:
        >>> df = pd.DataFrame({'Asset': ['AAPL', 'GOOGL'], 'Price': [173.81, 314.09]})
        >>> atlas_table(df, title="Current Holdings", hoverable=True)
    """

    if df.empty:
        st.warning("No data to display")
        return

    # Generate unique ID for this table instance
    table_id = f"atlas_tbl_{abs(hash(str(df.head()) + str(title)))}"

    # Styling configurations
    padding = '0.5rem 0.75rem' if compact else '0.875rem 1rem'
    height_style = f"max-height: {height}px; overflow-y: auto;" if height else ""

    # Title HTML
    title_html = ""
    if title:
        title_html = f"""
        <h3 style='
            font-size: 1.25rem;
            font-weight: 700;
            color: #f8fafc;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #00d4ff 0%, #6366f1 50%, #8b5cf6 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        '>{title}</h3>
        """

    # Convert DataFrame to HTML
    df_html = df.to_html(
        index=show_index,
        escape=False,
        classes=f'dataframe {table_id}_inner',
        border=0
    )

    # Component CSS
    component_css = f"""
    <style>
        .{table_id} {{
            background: rgba(21, 25, 50, 0.6);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border-radius: 12px;
            border: 1px solid rgba(99, 102, 241, 0.15);
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            {height_style}
            position: relative;
            overflow-x: auto;
        }}

        .{table_id}::before {{
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, #00d4ff 0%, #6366f1 50%, #8b5cf6 100%);
            opacity: 0.5;
        }}

        .{table_id}_inner {{
            width: 100%;
            border-collapse: collapse;
            font-size: 0.875rem;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }}

        .{table_id}_inner thead th {{
            text-align: left;
            padding: {padding};
            color: #94a3b8;
            font-weight: 600;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            border-bottom: 1px solid rgba(99, 102, 241, 0.2);
            background: rgba(10, 14, 39, 0.4);
            position: sticky;
            top: 0;
            z-index: 10;
        }}

        .{table_id}_inner tbody tr {{
            border-bottom: 1px solid rgba(99, 102, 241, 0.08);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }}

        {'.{}_inner tbody tr:nth-child(even) {{ background: rgba(99, 102, 241, 0.03); }}'.format(table_id) if striped else ''}

        {'''.{}_inner tbody tr:hover {{
            background: rgba(99, 102, 241, 0.12);
            transform: translateX(4px);
            border-left: 2px solid rgba(99, 102, 241, 0.6);
        }}'''.format(table_id) if hoverable else ''}

        .{table_id}_inner tbody td {{
            padding: {padding};
            color: #f8fafc;
        }}

        .{table_id}_inner tbody td:first-child {{
            font-weight: 500;
            color: #e2e8f0;
        }}

        /* Number formatting */
        .{table_id}_inner tbody td[style*="text-align: right"],
        .{table_id}_inner tbody td[style*="text-align:right"] {{
            font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
            font-variant-numeric: tabular-nums;
        }}

        /* Scrollbar styling */
        .{table_id}::-webkit-scrollbar {{
            height: 8px;
            width: 8px;
        }}

        .{table_id}::-webkit-scrollbar-track {{
            background: rgba(10, 14, 39, 0.4);
            border-radius: 4px;
        }}

        .{table_id}::-webkit-scrollbar-thumb {{
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            border-radius: 4px;
        }}

        .{table_id}::-webkit-scrollbar-thumb:hover {{
            background: linear-gradient(135deg, #8b5cf6, #a855f7);
        }}
    </style>
    """

    # Complete HTML
    full_html = f"""
    {component_css}
    <div class='{table_id}'>
        {title_html}
        {df_html}
    </div>
    """

    # ✅ CRITICAL: This calls st.markdown() and returns None
    st.markdown(full_html, unsafe_allow_html=True)


def atlas_table_with_badges(
    df: pd.DataFrame,
    badge_columns: List[str],
    title: Optional[str] = None,
    **kwargs
) -> None:
    """
    Render table with automatic badge pill formatting for specified columns.

    IMPORTANT: This function renders directly to Streamlit - it does NOT return anything.

    Args:
        df: DataFrame to display
        badge_columns: List of column names to format as badges
        title: Optional table title
        **kwargs: Additional arguments passed to atlas_table()

    Note:
        This creates a copy of the DataFrame and formats badge columns as HTML.
        Badge type is determined by cell value patterns (success/warning/danger).

    Example:
        >>> df = pd.DataFrame({
        >>>     'Asset': ['AAPL', 'GOOGL'],
        >>>     'Type': ['Stock', 'Stock'],
        >>>     'Status': ['Active', 'Active']
        >>> })
        >>> atlas_table_with_badges(df, badge_columns=['Type', 'Status'])
    """

    # Create copy to avoid modifying original
    df_display = df.copy()

    # Format badge columns
    for col in badge_columns:
        if col in df_display.columns:
            df_display[col] = df_display[col].apply(_format_as_badge)

    # Render using standard atlas_table
    atlas_table(df_display, title=title, **kwargs)


def _format_as_badge(value) -> str:
    """
    Internal helper: Convert cell value to badge HTML.

    Determines badge type based on value content:
    - Success keywords: active, approved, success, positive, up
    - Warning keywords: pending, review, caution, moderate
    - Danger keywords: inactive, rejected, error, negative, down
    - Default: neutral
    """
    if pd.isna(value):
        return ""

    value_str = str(value).lower()

    # Determine badge type based on content
    if any(word in value_str for word in ['active', 'approved', 'success', 'positive', 'up', '✓']):
        badge_type = 'success'
    elif any(word in value_str for word in ['pending', 'review', 'caution', 'moderate', 'warning']):
        badge_type = 'warning'
    elif any(word in value_str for word in ['inactive', 'rejected', 'error', 'negative', 'down', '✗']):
        badge_type = 'danger'
    elif any(word in value_str for word in ['primary', 'main', 'important']):
        badge_type = 'primary'
    else:
        badge_type = 'neutral'

    # Color configurations (matching badges.py)
    colors = {
        'success': {'bg': 'rgba(16, 185, 129, 0.2)', 'border': 'rgba(16, 185, 129, 0.4)', 'text': '#6ee7b7'},
        'warning': {'bg': 'rgba(245, 158, 11, 0.2)', 'border': 'rgba(245, 158, 11, 0.4)', 'text': '#fcd34d'},
        'danger': {'bg': 'rgba(239, 68, 68, 0.2)', 'border': 'rgba(239, 68, 68, 0.4)', 'text': '#fca5a5'},
        'primary': {'bg': 'rgba(99, 102, 241, 0.2)', 'border': 'rgba(99, 102, 241, 0.4)', 'text': '#a5b4fc'},
        'neutral': {'bg': 'rgba(148, 163, 184, 0.15)', 'border': 'rgba(148, 163, 184, 0.3)', 'text': '#cbd5e1'}
    }

    color = colors.get(badge_type, colors['neutral'])

    return f"""<span style='
        display: inline-block;
        padding: 0.25rem 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-radius: 12px;
        background: {color['bg']};
        border: 1px solid {color['border']};
        color: {color['text']};
        white-space: nowrap;
    '>{value}</span>"""


# ==================== COMPONENT TESTING ====================
if __name__ == "__main__":
    """
    Test the table components in isolation
    Run with: streamlit run ui/components/tables_enhanced.py
    """
    st.set_page_config(
        page_title="ATLAS - Table Component Test",
        layout="wide"
    )

    st.title("📊 ATLAS Table Component Tests")

    # Sample data
    holdings_data = {
        'Ticker': ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'],
        'Asset Name': ['Apple Inc.', 'Alphabet Inc.', 'Microsoft Corp.', 'Tesla Inc.', 'Amazon.com Inc.'],
        'Shares': [50, 30, 75, 20, 40],
        'Price': [173.81, 314.09, 378.91, 251.05, 178.25],
        'Value': [8690.50, 9422.70, 28418.25, 5021.00, 7130.00],
        'Return %': [15.3, -2.1, 8.7, 22.5, -5.2],
        'Status': ['Active', 'Active', 'Active', 'Active', 'Active']
    }

    df = pd.DataFrame(holdings_data)

    st.header("1. Basic Table (atlas_table)")
    atlas_table(df, title="Portfolio Holdings", hoverable=True, striped=True)

    st.markdown("---")

    st.header("2. Compact Table")
    atlas_table(df.head(3), title="Top 3 Holdings", compact=True)

    st.markdown("---")

    st.header("3. Table with Badges (atlas_table_with_badges)")
    atlas_table_with_badges(df, badge_columns=['Status'], title="Holdings with Status Badges")

    st.markdown("---")

    st.header("4. Scrollable Table (fixed height)")
    large_df = pd.concat([df] * 3, ignore_index=True)
    atlas_table(large_df, title="Scrollable Holdings", height=300)

    st.success("✅ All table components rendering correctly!")
