"""
ATLAS Terminal - Table Formatting
==================================

Market Movers-style table formatting applied consistently across all ATLAS tables.
Bold white tickers, muted volume, colored change arrows with glow.

Scope: TABLES ONLY - does NOT affect metric cards, sidebar, headers, or other UI.

Uses INLINE STYLES on every element (Streamlit strips CSS class attributes from
st.markdown HTML, so class-based CSS does not work reliably).

Usage:
    from core.atlas_table_formatting import (
        inject_table_css,
        table_row, table_row_from_data,
        render_movers_table, render_holdings_table, render_generic_table,
        format_volume, format_price, format_percent,
    )
"""

import streamlit as st
import pandas as pd
from typing import Optional, List, Dict


# =============================================================================
# INLINE STYLE CONSTANTS (Bloomberg Terminal / Inter font)
# =============================================================================

# Font stack
FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
FONT_MONO = "'JetBrains Mono', 'SF Mono', 'Fira Code', Consolas, monospace"

# Colors
COLOR_WHITE = "#ffffff"
COLOR_HEADER = "rgba(255, 255, 255, 0.92)"  # Slightly different shade for headers vs content
COLOR_DIM = "rgba(255, 255, 255, 0.35)"
COLOR_TEXT = "rgba(255, 255, 255, 0.85)"
COLOR_MUTED = "rgba(255, 255, 255, 0.5)"
COLOR_GREEN = "#00d26a"
COLOR_RED = "#ff4757"
COLOR_BORDER = "rgba(255, 255, 255, 0.06)"
COLOR_HEADER_BORDER = "rgba(255, 255, 255, 0.15)"
COLOR_HEADER_BG = "rgba(255, 255, 255, 0.04)"
COLOR_HOVER = "rgba(255, 255, 255, 0.03)"

# Glows
GLOW_GREEN = "0 0 8px rgba(0, 210, 106, 0.4)"
GLOW_RED = "0 0 8px rgba(255, 71, 87, 0.4)"

# Cell styles as inline CSS strings
STYLE_TABLE = (
    f"width: 100%; border-collapse: collapse; font-family: {FONT}; "
    f"border-spacing: 0;"
)

STYLE_TH = (
    f"font-family: {FONT}; font-weight: 700; font-size: 11px; "
    f"color: {COLOR_HEADER}; text-transform: uppercase; letter-spacing: 0.06em; "
    f"padding: 12px 8px; text-align: left; border-bottom: 2px solid {COLOR_HEADER_BORDER}; "
    f"background: {COLOR_HEADER_BG};"
)

STYLE_TH_RIGHT = (
    f"font-family: {FONT}; font-weight: 700; font-size: 11px; "
    f"color: {COLOR_HEADER}; text-transform: uppercase; letter-spacing: 0.06em; "
    f"padding: 12px 8px; text-align: right; border-bottom: 2px solid {COLOR_HEADER_BORDER}; "
    f"background: {COLOR_HEADER_BG};"
)

STYLE_TD = (
    f"font-family: {FONT}; font-size: 14px; padding: 12px 8px; "
    f"border-bottom: 1px solid {COLOR_BORDER}; color: {COLOR_TEXT};"
)

STYLE_TICKER = (
    f"font-family: {FONT}; font-weight: 700; font-size: 14px; "
    f"color: {COLOR_WHITE}; letter-spacing: 0.02em; padding: 12px 8px; "
    f"border-bottom: 1px solid {COLOR_BORDER};"
)

STYLE_META = (
    f"font-family: {FONT}; font-weight: 400; font-size: 11px; "
    f"color: {COLOR_DIM}; letter-spacing: 0.01em; padding: 12px 8px; "
    f"border-bottom: 1px solid {COLOR_BORDER};"
)

STYLE_PRICE = (
    f"font-family: {FONT}; font-weight: 500; font-size: 14px; "
    f"color: {COLOR_WHITE}; letter-spacing: -0.01em; text-align: right; "
    f"padding: 12px 8px; border-bottom: 1px solid {COLOR_BORDER};"
)

STYLE_CHANGE_UP = (
    f"font-family: {FONT_MONO}; font-weight: 600; font-size: 13px; "
    f"color: {COLOR_GREEN}; text-shadow: {GLOW_GREEN}; text-align: right; "
    f"padding: 12px 8px; border-bottom: 1px solid {COLOR_BORDER};"
)

STYLE_CHANGE_DOWN = (
    f"font-family: {FONT_MONO}; font-weight: 600; font-size: 13px; "
    f"color: {COLOR_RED}; text-shadow: {GLOW_RED}; text-align: right; "
    f"padding: 12px 8px; border-bottom: 1px solid {COLOR_BORDER};"
)

STYLE_CHANGE_NEUTRAL = (
    f"font-family: {FONT}; font-weight: 600; font-size: 13px; "
    f"color: {COLOR_MUTED}; text-align: right; "
    f"padding: 12px 8px; border-bottom: 1px solid {COLOR_BORDER};"
)

STYLE_PERCENT = (
    f"font-family: {FONT}; font-weight: 500; font-size: 13px; "
    f"color: rgba(255, 255, 255, 0.7); text-align: right; "
    f"padding: 12px 8px; border-bottom: 1px solid {COLOR_BORDER};"
)

STYLE_TEXT = (
    f"font-family: {FONT}; font-weight: 400; font-size: 13px; "
    f"color: {COLOR_TEXT}; "
    f"padding: 12px 8px; border-bottom: 1px solid {COLOR_BORDER};"
)

# Row styles (flex layout for Movers)
STYLE_ROW = (
    f"display: flex; justify-content: space-between; align-items: center; "
    f"padding: 10px 0; border-bottom: 1px solid {COLOR_BORDER};"
)

STYLE_ROW_LEFT = "display: flex; align-items: baseline; gap: 8px;"
STYLE_ROW_RIGHT = "display: flex; align-items: center; gap: 16px; text-align: right;"

STYLE_SECTION_HEADER = (
    f"font-family: {FONT}; font-weight: 600; font-size: 13px; "
    f"color: {COLOR_MUTED}; letter-spacing: 0.02em; "
    f"margin-bottom: 12px; padding-bottom: 8px; "
    f"border-bottom: 1px solid {COLOR_HEADER_BORDER}; "
    f"display: flex; align-items: center; gap: 8px;"
)


# =============================================================================
# GOOGLE FONTS INJECTION (call once at app startup)
# =============================================================================

ATLAS_TABLE_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
</style>
"""


def inject_table_css():
    """Inject Inter + JetBrains Mono font imports. Call once at app startup."""
    st.markdown(ATLAS_TABLE_CSS, unsafe_allow_html=True)


# =============================================================================
# FORMATTING FUNCTIONS
# =============================================================================

def format_price(value, currency: str = "$", decimals: int = 2) -> str:
    """Format price with currency symbol."""
    if value is None or pd.isna(value):
        return "\u2014"
    return f"{currency}{float(value):,.{decimals}f}"


def format_percent(value, decimals: int = 2, include_sign: bool = True) -> str:
    """Format percentage with sign."""
    if value is None or pd.isna(value):
        return "\u2014"
    val = float(value)
    sign = "+" if val >= 0 and include_sign else ""
    return f"{sign}{val:,.{decimals}f}%"


def format_volume(value) -> str:
    """Format volume with K/M/B suffix."""
    if value is None or pd.isna(value):
        return "\u2014"
    val = float(value)
    if val >= 1e9:
        return f"{val/1e9:.1f}B"
    elif val >= 1e6:
        return f"{val/1e6:.1f}M"
    elif val >= 1e3:
        return f"{val/1e3:.1f}K"
    return f"{val:,.0f}"


def format_market_cap(value) -> str:
    """Format market cap with T/B/M suffix."""
    if value is None or pd.isna(value):
        return "\u2014"
    val = float(value)
    if val >= 1e12:
        return f"${val/1e12:.2f}T"
    elif val >= 1e9:
        return f"${val/1e9:.1f}B"
    elif val >= 1e6:
        return f"${val/1e6:.1f}M"
    return f"${val:,.0f}"


def format_change(value, decimals: int = 2, include_sign: bool = True) -> str:
    """Format change value with sign (no % suffix)."""
    if value is None or pd.isna(value):
        return "\u2014"
    val = float(value)
    sign = "+" if val >= 0 and include_sign else ""
    return f"{sign}{val:,.{decimals}f}"


def format_ratio(value, decimals: int = 2) -> str:
    """Format a ratio (Sharpe, Beta, P/E)."""
    if value is None or pd.isna(value):
        return "\u2014"
    return f"{float(value):.{decimals}f}"


# =============================================================================
# SINGLE TABLE ROW (flex layout - Market Movers style)
# =============================================================================

def table_row(left_html: str, right_html: str) -> str:
    """Render a single flex-layout table row with left and right sections."""
    return (
        f'<div style="{STYLE_ROW}">'
        f'<div style="{STYLE_ROW_LEFT}">{left_html}</div>'
        f'<div style="{STYLE_ROW_RIGHT}">{right_html}</div>'
        f'</div>'
    )


def table_row_from_data(
    ticker: str,
    volume=None,
    price: float = 0,
    change_pct: float = 0,
    currency: str = "$",
    meta: Optional[str] = None,
) -> str:
    """
    Render a single Market Movers-style table row from data.

    Output: RIME 129.8M            $3.60  arrow +232.87%
    """
    # Left side
    meta_text = meta if meta is not None else (format_volume(volume) if volume else "")
    ticker_style = f"font-family: {FONT}; font-weight: 700; font-size: 14px; color: {COLOR_WHITE}; letter-spacing: 0.02em;"
    meta_style = f"font-family: {FONT}; font-weight: 400; font-size: 11px; color: {COLOR_DIM}; letter-spacing: 0.01em;"
    meta_html = f'<span style="{meta_style}">{meta_text}</span>' if meta_text else ""
    left = f'<span style="{ticker_style}">{ticker}</span>{meta_html}'

    # Right side
    is_up = change_pct >= 0
    arrow = "\u25b2" if is_up else "\u25bc"
    sign = "+" if is_up else ""
    price_style = f"font-family: {FONT}; font-weight: 500; font-size: 14px; color: {COLOR_WHITE}; letter-spacing: -0.01em;"
    if is_up:
        change_style = f"font-family: {FONT_MONO}; font-weight: 600; font-size: 13px; color: {COLOR_GREEN}; text-shadow: {GLOW_GREEN};"
    else:
        change_style = f"font-family: {FONT_MONO}; font-weight: 600; font-size: 13px; color: {COLOR_RED}; text-shadow: {GLOW_RED};"

    right = (
        f'<span style="{price_style}">{currency}{price:,.2f}</span>'
        f'<span style="{change_style}">{arrow} {sign}{change_pct:.2f}%</span>'
    )

    return table_row(left, right)


# =============================================================================
# TABLE SECTION HEADER
# =============================================================================

def table_section_header(title: str, icon: str = "") -> str:
    """Render a table section header (e.g. 'Top Gainers')."""
    icon_html = f'{icon} ' if icon else ""
    return f'<div style="{STYLE_SECTION_HEADER}">{icon_html}{title}</div>'


# =============================================================================
# MOVERS TABLE (Top Gainers / Losers / Most Active)
# =============================================================================

def render_movers_table(
    title: str,
    icon: str,
    df: pd.DataFrame,
    ticker_col: str = 'ticker',
    volume_col: str = 'volume',
    price_col: str = 'price',
    change_col: str = 'change_pct',
    max_rows: int = 5,
    currency: str = "$",
):
    """Render a complete movers section in Market Movers style."""
    st.markdown(table_section_header(title, icon), unsafe_allow_html=True)

    if df is None or df.empty:
        st.markdown(
            f'<span style="font-family: {FONT}; font-size: 11px; color: {COLOR_DIM};">No data available</span>',
            unsafe_allow_html=True
        )
        return

    for _, row in df.head(max_rows).iterrows():
        ticker = str(row.get(ticker_col, 'N/A'))
        volume = pd.to_numeric(row.get(volume_col, 0), errors='coerce') or 0
        price = pd.to_numeric(row.get(price_col, 0), errors='coerce') or 0
        change = pd.to_numeric(row.get(change_col, 0), errors='coerce') or 0

        # Handle change_percentage strings like "232.87%"
        if isinstance(row.get(change_col), str):
            change = pd.to_numeric(
                str(row.get(change_col)).replace('%', ''),
                errors='coerce'
            ) or 0

        st.markdown(
            table_row_from_data(
                ticker=ticker,
                volume=volume,
                price=price,
                change_pct=change,
                currency=currency,
            ),
            unsafe_allow_html=True
        )


# =============================================================================
# HOLDINGS TABLE (Portfolio positions)
# =============================================================================

def render_holdings_table(
    df: pd.DataFrame,
    ticker_col: str = 'ticker',
    shares_col: str = 'shares',
    price_col: str = 'price',
    value_col: str = 'value',
    change_col: str = 'change_pct',
    currency: str = "$",
) -> str:
    """
    Render a portfolio holdings table in ATLAS style.
    Returns HTML string.
    """
    if df is None or df.empty:
        return f'<span style="font-family: {FONT}; font-size: 11px; color: {COLOR_DIM};">No holdings data</span>'

    rows_html = []
    for _, row in df.iterrows():
        ticker = str(row.get(ticker_col, row.get('symbol', row.get('Symbol', row.get('Ticker', 'N/A')))))
        shares = pd.to_numeric(row.get(shares_col, row.get('quantity', row.get('Shares', 0))), errors='coerce') or 0
        price = pd.to_numeric(row.get(price_col, row.get('current_price', row.get('Current Price', 0))), errors='coerce') or 0
        value = pd.to_numeric(row.get(value_col, row.get('market_value', row.get('Total Value', 0))), errors='coerce')
        if pd.isna(value) or value == 0:
            value = shares * price
        change = pd.to_numeric(row.get(change_col, row.get('daily_change', row.get('Daily Change %', 0))), errors='coerce') or 0

        is_up = change >= 0
        arrow = "\u25b2" if is_up else "\u25bc"
        sign = "+" if is_up else ""
        chg_style = STYLE_CHANGE_UP if is_up else STYLE_CHANGE_DOWN

        # Format shares: whole if integer, 2 decimal if fractional
        shares_str = f"{int(shares):,}" if shares == int(shares) else f"{shares:,.2f}"

        rows_html.append(
            f'<tr>'
            f'<td style="{STYLE_TICKER}">{ticker}</td>'
            f'<td style="{STYLE_TD}">{shares_str}</td>'
            f'<td style="{STYLE_PRICE}">{currency}{price:,.2f}</td>'
            f'<td style="{STYLE_PRICE}">{currency}{value:,.2f}</td>'
            f'<td style="{chg_style}">{arrow} {sign}{change:.2f}%</td>'
            f'</tr>'
        )

    return (
        f'<table style="{STYLE_TABLE}">'
        f'<thead><tr>'
        f'<th style="{STYLE_TH}">Symbol</th>'
        f'<th style="{STYLE_TH}">Shares</th>'
        f'<th style="{STYLE_TH_RIGHT}">Price</th>'
        f'<th style="{STYLE_TH_RIGHT}">Value</th>'
        f'<th style="{STYLE_TH_RIGHT}">Change</th>'
        f'</tr></thead>'
        f'<tbody>{"".join(rows_html)}</tbody>'
        f'</table>'
    )


# =============================================================================
# GENERIC TABLE (Column-type driven rendering with inline styles)
# =============================================================================

def _format_quality_score(val: float) -> str:
    """Format Quality Score: 1 decimal if fractional, whole number if whole."""
    if val == int(val):
        return f"{int(val)}"
    return f"{val:.1f}"


def _render_cell(value, col_type: str, currency: str = "$") -> str:
    """Render a single cell based on column type, using inline styles."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return f'<td style="{STYLE_TEXT}">\u2014</td>'

    if col_type == 'ticker':
        return f'<td style="{STYLE_TICKER}">{value}</td>'

    elif col_type == 'price':
        val = pd.to_numeric(value, errors='coerce')
        if pd.isna(val):
            return f'<td style="{STYLE_PRICE}">{value}</td>'
        return f'<td style="{STYLE_PRICE}">{currency}{val:,.2f}</td>'

    elif col_type == 'change':
        # Try to parse numeric value from string
        raw = str(value).replace('%', '').replace(',', '').strip()
        # Handle arrow characters
        raw = raw.replace('\u25b2', '').replace('\u25bc', '').replace('▲', '').replace('▼', '').strip()
        val = pd.to_numeric(raw, errors='coerce')
        if pd.isna(val):
            # Not numeric - render as-is but check for up/down indicators
            text = str(value)
            if any(up in text for up in ['+', '\u25b2', '▲']):
                return f'<td style="{STYLE_CHANGE_UP}">{text}</td>'
            elif any(dn in text for dn in ['-', '\u25bc', '▼']):
                return f'<td style="{STYLE_CHANGE_DOWN}">{text}</td>'
            return f'<td style="{STYLE_CHANGE_NEUTRAL}">{text}</td>'
        is_up = val >= 0
        arrow = "\u25b2" if is_up else "\u25bc"
        color = COLOR_GREEN if is_up else COLOR_RED
        glow = GLOW_GREEN if is_up else GLOW_RED
        sign = "+" if is_up else ""
        # Enhanced green/red with stronger glow animation effect
        style = (
            f"font-family: {FONT_MONO}; font-weight: 600; font-size: 13px; "
            f"color: {color}; text-shadow: {glow}, 0 0 16px {color}60; text-align: right; "
            f"padding: 12px 8px; border-bottom: 1px solid {COLOR_BORDER};"
        )
        return f'<td style="{style}">{arrow} {sign}{val:.2f}%</td>'

    elif col_type == 'percent':
        raw = str(value).replace('%', '').replace(',', '').strip()
        val = pd.to_numeric(raw, errors='coerce')
        if pd.isna(val):
            return f'<td style="{STYLE_PERCENT}">{value}</td>'
        # Color-code percentages with green/red glow like changes
        if val > 0:
            style = (
                f"font-family: {FONT_MONO}; font-weight: 500; font-size: 13px; "
                f"color: {COLOR_GREEN}; text-shadow: {GLOW_GREEN}; text-align: right; "
                f"padding: 12px 8px; border-bottom: 1px solid {COLOR_BORDER};"
            )
            return f'<td style="{style}">+{val:.2f}%</td>'
        elif val < 0:
            style = (
                f"font-family: {FONT_MONO}; font-weight: 500; font-size: 13px; "
                f"color: {COLOR_RED}; text-shadow: {GLOW_RED}; text-align: right; "
                f"padding: 12px 8px; border-bottom: 1px solid {COLOR_BORDER};"
            )
            return f'<td style="{style}">{val:.2f}%</td>'
        return f'<td style="{STYLE_PERCENT}">0.00%</td>'

    elif col_type == 'shares':
        val = pd.to_numeric(value, errors='coerce')
        if pd.isna(val):
            return f'<td style="{STYLE_TD}">{value}</td>'
        # Round fractional shares to 2 decimal places
        if val == int(val):
            return f'<td style="{STYLE_TD}">{int(val):,}</td>'
        return f'<td style="{STYLE_TD}">{val:,.2f}</td>'

    elif col_type == 'quality_score':
        val = pd.to_numeric(value, errors='coerce')
        if pd.isna(val):
            return f'<td style="{STYLE_TEXT}">{value}</td>'
        return f'<td style="{STYLE_TEXT}">{_format_quality_score(val)}</td>'

    elif col_type == 'volume':
        val = pd.to_numeric(value, errors='coerce')
        if pd.isna(val):
            return f'<td style="{STYLE_META}">{value}</td>'
        return f'<td style="{STYLE_META}">{format_volume(val)}</td>'

    elif col_type == 'market_cap':
        val = pd.to_numeric(value, errors='coerce')
        if pd.isna(val):
            return f'<td style="{STYLE_META}">{value}</td>'
        return f'<td style="{STYLE_META}">{format_market_cap(val)}</td>'

    elif col_type == 'ratio':
        val = pd.to_numeric(value, errors='coerce')
        if pd.isna(val):
            return f'<td style="{STYLE_TEXT}">{value}</td>'
        return f'<td style="{STYLE_TEXT}">{val:.2f}</td>'

    else:  # 'text' or unknown
        return f'<td style="{STYLE_TEXT}">{value}</td>'


def render_generic_table(
    df: pd.DataFrame,
    columns: List[Dict],
    max_rows: Optional[int] = None,
    currency: str = "$",
) -> str:
    """
    Render a table with column-type-driven formatting using inline styles.

    Args:
        df: DataFrame with data
        columns: List of column definitions, each a dict:
            {
                'key': 'column_name_in_df',
                'label': 'Display Header',
                'type': 'ticker' | 'price' | 'change' | 'percent' | 'volume' |
                        'market_cap' | 'ratio' | 'shares' | 'quality_score' | 'text',
            }
        max_rows: Limit number of rows (None = all)
        currency: Currency symbol for price columns

    Returns:
        HTML string. Use with st.markdown(..., unsafe_allow_html=True).
    """
    if df is None or df.empty:
        return f'<span style="font-family: {FONT}; font-size: 11px; color: {COLOR_DIM};">No data available</span>'

    # Determine alignment for headers
    right_types = {'price', 'change', 'percent', 'ratio', 'quality_score'}

    # Build header
    headers = []
    for col in columns:
        style = STYLE_TH_RIGHT if col.get('type') in right_types else STYLE_TH
        headers.append(f'<th style="{style}">{col["label"]}</th>')

    # Build rows
    rows_html = []
    display_df = df.head(max_rows) if max_rows else df
    for _, row in display_df.iterrows():
        cells = []
        for col in columns:
            val = row.get(col['key'])
            cells.append(_render_cell(val, col.get('type', 'text'), currency))
        rows_html.append(f'<tr>{"".join(cells)}</tr>')

    return (
        f'<table style="{STYLE_TABLE}">'
        f'<thead><tr>{"".join(headers)}</tr></thead>'
        f'<tbody>{"".join(rows_html)}</tbody>'
        f'</table>'
    )


# =============================================================================
# INTERACTIVE COLUMN MANAGEMENT
# =============================================================================

def render_column_manager(
    available_columns: List[str],
    default_columns: List[str],
    session_key: str = "atlas_table_columns",
) -> List[str]:
    """
    Render an interactive column manager with draggable pills and X-to-remove.

    Uses Streamlit session_state for persistence. Each column appears as a pill
    that can be removed (X button) or reordered (move left/right arrows).

    Args:
        available_columns: All possible column names
        default_columns: Default selected columns (in order)
        session_key: Unique session_state key for this table's column config

    Returns:
        List of selected column names in current order.
    """
    # Initialize session state
    order_key = f"{session_key}_order"
    if order_key not in st.session_state:
        st.session_state[order_key] = [c for c in default_columns if c in available_columns]

    current_cols = st.session_state[order_key]

    # Handle remove actions
    for col_name in available_columns:
        remove_key = f"{session_key}_remove_{col_name}"
        if remove_key in st.session_state and st.session_state[remove_key]:
            if col_name in current_cols:
                current_cols.remove(col_name)
                st.session_state[order_key] = current_cols
            st.session_state[remove_key] = False

    # Handle move actions
    for col_name in available_columns:
        left_key = f"{session_key}_left_{col_name}"
        right_key = f"{session_key}_right_{col_name}"
        if left_key in st.session_state and st.session_state[left_key]:
            idx = current_cols.index(col_name) if col_name in current_cols else -1
            if idx > 0:
                current_cols[idx], current_cols[idx - 1] = current_cols[idx - 1], current_cols[idx]
                st.session_state[order_key] = current_cols
            st.session_state[left_key] = False
        if right_key in st.session_state and st.session_state[right_key]:
            idx = current_cols.index(col_name) if col_name in current_cols else -1
            if 0 <= idx < len(current_cols) - 1:
                current_cols[idx], current_cols[idx + 1] = current_cols[idx + 1], current_cols[idx]
                st.session_state[order_key] = current_cols
            st.session_state[right_key] = False

    # Render the column pills
    pill_style = (
        f"display: inline-flex; align-items: center; gap: 4px; "
        f"background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.3); "
        f"border-radius: 8px; padding: 6px 10px; margin: 3px; "
        f"font-family: {FONT}; font-size: 11px; font-weight: 600; "
        f"color: rgba(255, 255, 255, 0.85); text-transform: uppercase; letter-spacing: 0.04em;"
    )

    st.markdown(
        f'<div style="font-family: {FONT}; font-size: 10px; color: {COLOR_DIM}; '
        f'text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; font-weight: 600;">'
        f'Active Columns (use arrows to reorder, X to remove)</div>',
        unsafe_allow_html=True
    )

    # Render active columns as a row of pills with buttons
    if current_cols:
        cols_per_row = min(len(current_cols), 6)
        for row_start in range(0, len(current_cols), cols_per_row):
            row_slice = current_cols[row_start:row_start + cols_per_row]
            btn_cols = st.columns(len(row_slice))
            for i, col_name in enumerate(row_slice):
                with btn_cols[i]:
                    abs_idx = row_start + i
                    c1, c2, c3 = st.columns([1, 3, 1])
                    with c1:
                        st.button(
                            "\u25c0", key=f"{session_key}_left_{col_name}",
                            disabled=(abs_idx == 0),
                            help=f"Move {col_name} left"
                        )
                    with c2:
                        # Truncate long names
                        display_name = col_name if len(col_name) <= 14 else col_name[:12] + ".."
                        st.markdown(
                            f'<div style="{pill_style}">{display_name}</div>',
                            unsafe_allow_html=True
                        )
                    with c3:
                        st.button(
                            "\u2715", key=f"{session_key}_remove_{col_name}",
                            help=f"Remove {col_name}"
                        )

    # Add column back selector
    removed_cols = [c for c in available_columns if c not in current_cols]
    if removed_cols:
        add_col = st.selectbox(
            "Add column back",
            options=[""] + removed_cols,
            key=f"{session_key}_add_back",
            label_visibility="collapsed",
        )
        if add_col and add_col not in current_cols:
            current_cols.append(add_col)
            st.session_state[order_key] = current_cols
            st.rerun()

    return current_cols


# =============================================================================
# TABLE CARD WRAPPER
# =============================================================================

def render_table_card(title: str, table_html: str, icon: str = "") -> str:
    """
    Wrap a table in a glassmorphism card with a heading.

    Args:
        title: Card heading text
        table_html: The rendered table HTML
        icon: Optional emoji icon for the heading

    Returns:
        Full HTML string with card + heading + table.
    """
    icon_html = f'<span style="font-size: 1.25rem; margin-right: 8px;">{icon}</span>' if icon else ""
    heading_style = (
        f"font-family: {FONT}; font-size: 1.25rem; font-weight: 700; "
        f"color: #f8fafc; margin-bottom: 1rem; "
        f"background: linear-gradient(135deg, #00d4ff 0%, #6366f1 50%, #8b5cf6 100%); "
        f"-webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"
    )
    card_style = (
        f"background: linear-gradient(135deg, rgba(26, 29, 41, 0.95), rgba(20, 23, 35, 0.9)); "
        f"backdrop-filter: blur(24px); border-radius: 16px; "
        f"border: 1px solid rgba(99, 102, 241, 0.2); "
        f"padding: 1.5rem; margin: 1rem 0; "
        f"box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3), "
        f"0 0 15px rgba(99, 102, 241, 0.1);"
    )
    return (
        f'<div style="{card_style}">'
        f'<h3 style="{heading_style}">{icon_html}{title}</h3>'
        f'{table_html}'
        f'</div>'
    )


# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    # CSS injection
    'ATLAS_TABLE_CSS',
    'inject_table_css',

    # Formatters
    'format_price',
    'format_percent',
    'format_volume',
    'format_market_cap',
    'format_change',
    'format_ratio',

    # Row components
    'table_row',
    'table_row_from_data',
    'table_section_header',

    # Table renderers
    'render_movers_table',
    'render_holdings_table',
    'render_generic_table',

    # Interactive column management
    'render_column_manager',

    # Card wrapper
    'render_table_card',
]
