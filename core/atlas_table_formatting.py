"""
ATLAS Terminal - Table Formatting
==================================

Market Movers-style table formatting applied consistently across all ATLAS tables.
Bold white tickers, muted volume, colored change arrows with glow.

Scope: TABLES ONLY - does NOT affect metric cards, sidebar, headers, or other UI.

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
# TABLE CSS (Inject once at app startup)
# =============================================================================

ATLAS_TABLE_CSS = """
<style>
/* =============================================================================
   ATLAS TABLE FORMATTING - Inter font + Bloomberg styling
   Scope: Tables only. Does NOT touch metric cards or other UI.
   ============================================================================= */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

/* --- Table wrapper --- */
.atlas-html-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
}

.atlas-html-table th {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    font-weight: 500;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 12px 8px;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.atlas-html-table th.text-right {
    text-align: right;
}

.atlas-html-table td {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 14px;
    padding: 12px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.85);
}

.atlas-html-table tr:hover {
    background-color: rgba(255, 255, 255, 0.02);
}

.atlas-html-table tr:last-child td {
    border-bottom: none;
}

/* --- Cell types --- */
.ticker-cell {
    font-weight: 700;
    font-size: 14px;
    color: #ffffff;
    letter-spacing: 0.02em;
}

.meta-cell {
    font-weight: 400;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    letter-spacing: 0.01em;
}

.price-cell {
    font-weight: 500;
    font-size: 14px;
    color: #ffffff;
    letter-spacing: -0.01em;
    text-align: right;
}

.change-up {
    font-weight: 600;
    font-size: 13px;
    color: #00d26a;
    text-shadow: 0 0 8px rgba(0, 210, 106, 0.4);
    text-align: right;
}

.change-down {
    font-weight: 600;
    font-size: 13px;
    color: #ff4757;
    text-shadow: 0 0 8px rgba(255, 71, 87, 0.4);
    text-align: right;
}

.change-neutral {
    font-weight: 600;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    text-align: right;
}

.percent-cell {
    font-weight: 500;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    text-align: right;
}

.text-cell {
    font-weight: 400;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
}

/* --- Data row (flex layout, same as Market Movers) --- */
.atlas-table-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    transition: background-color 0.15s ease;
}

.atlas-table-row:hover {
    background-color: rgba(255, 255, 255, 0.02);
}

.atlas-table-row:last-child {
    border-bottom: none;
}

.atlas-table-row-left {
    display: flex;
    align-items: baseline;
    gap: 8px;
}

.atlas-table-row-right {
    display: flex;
    align-items: center;
    gap: 16px;
    text-align: right;
}

/* --- Section header for table groups --- */
.atlas-table-header {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    font-weight: 600;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.02em;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    gap: 8px;
}

</style>
"""


def inject_table_css():
    """Inject ATLAS table CSS. Call once at app startup."""
    st.markdown(ATLAS_TABLE_CSS, unsafe_allow_html=True)


# =============================================================================
# FORMATTING FUNCTIONS
# =============================================================================

def format_price(value, currency: str = "$", decimals: int = 2) -> str:
    """
    Format price with currency symbol.

    format_price(182.78)    -> "$182.78"
    format_price(0.02)      -> "$0.02"
    format_price(1234.56)   -> "$1,234.56"
    """
    if value is None or pd.isna(value):
        return "\u2014"
    return f"{currency}{float(value):,.{decimals}f}"


def format_percent(value, decimals: int = 2, include_sign: bool = True) -> str:
    """
    Format percentage with sign.

    format_percent(232.87)  -> "+232.87%"
    format_percent(-82.87)  -> "-82.87%"
    """
    if value is None or pd.isna(value):
        return "\u2014"
    val = float(value)
    sign = "+" if val >= 0 and include_sign else ""
    return f"{sign}{val:,.{decimals}f}%"


def format_volume(value) -> str:
    """
    Format volume with K/M/B suffix.

    format_volume(129800000) -> "129.8M"
    format_volume(52140764)  -> "52.1M"
    format_volume(24073)     -> "24.1K"
    """
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
    """
    Format market cap with T/B/M suffix.

    format_market_cap(2.5e12)  -> "$2.50T"
    format_market_cap(158.6e9) -> "$158.6B"
    """
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
    """
    Format change value with sign (no % suffix).

    format_change(2.45)  -> "+2.45"
    format_change(-1.23) -> "-1.23"
    """
    if value is None or pd.isna(value):
        return "\u2014"
    val = float(value)
    sign = "+" if val >= 0 and include_sign else ""
    return f"{sign}{val:,.{decimals}f}"


def format_ratio(value, decimals: int = 2) -> str:
    """
    Format a ratio (Sharpe, Beta, P/E).

    format_ratio(1.78) -> "1.78"
    """
    if value is None or pd.isna(value):
        return "\u2014"
    return f"{float(value):.{decimals}f}"


# =============================================================================
# SINGLE TABLE ROW (flex layout - Market Movers style)
# =============================================================================

def table_row(left_html: str, right_html: str) -> str:
    """
    Render a single flex-layout table row with left and right sections.

    Args:
        left_html: HTML for left side (ticker + meta)
        right_html: HTML for right side (price + change)
    """
    return (
        f'<div class="atlas-table-row">'
        f'<div class="atlas-table-row-left">{left_html}</div>'
        f'<div class="atlas-table-row-right">{right_html}</div>'
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

    Args:
        ticker: Stock ticker symbol
        volume: Trading volume (optional, formats with K/M/B)
        price: Current price
        change_pct: Percentage change
        currency: Currency symbol
        meta: Override volume with custom meta text
    """
    # Left side
    meta_text = meta if meta is not None else (format_volume(volume) if volume else "")
    meta_html = f'<span class="meta-cell">{meta_text}</span>' if meta_text else ""
    left = f'<span class="ticker-cell">{ticker}</span>{meta_html}'

    # Right side
    is_up = change_pct >= 0
    arrow = "\u25b2" if is_up else "\u25bc"
    change_class = "change-up" if is_up else "change-down"
    sign = "+" if is_up else ""

    right = (
        f'<span class="price-cell">{currency}{price:,.2f}</span>'
        f'<span class="{change_class}">{arrow} {sign}{change_pct:.2f}%</span>'
    )

    return table_row(left, right)


# =============================================================================
# TABLE SECTION HEADER
# =============================================================================

def table_section_header(title: str, icon: str = "") -> str:
    """Render a table section header (e.g. 'Top Gainers')."""
    icon_html = f'{icon} ' if icon else ""
    return f'<div class="atlas-table-header">{icon_html}{title}</div>'


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
    """
    Render a complete movers section in Market Movers style.

    Args:
        title: Section title (e.g. "Top Gainers")
        icon: Emoji icon
        df: DataFrame with stock data
        ticker_col: Column name for ticker symbol
        volume_col: Column name for volume
        price_col: Column name for price
        change_col: Column name for change percentage
        max_rows: Maximum rows to show
        currency: Currency symbol
    """
    st.markdown(table_section_header(title, icon), unsafe_allow_html=True)

    if df is None or df.empty:
        st.markdown(
            '<span class="meta-cell">No data available</span>',
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

    Returns HTML string. Use with st.markdown(..., unsafe_allow_html=True).
    """
    if df is None or df.empty:
        return '<span class="meta-cell">No holdings data</span>'

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
        change_class = "change-up" if is_up else "change-down"
        sign = "+" if is_up else ""

        rows_html.append(
            f'<tr>'
            f'<td class="ticker-cell">{ticker}</td>'
            f'<td>{shares:,.0f}</td>'
            f'<td class="price-cell">{currency}{price:,.2f}</td>'
            f'<td class="price-cell">{currency}{value:,.2f}</td>'
            f'<td class="{change_class}">{arrow} {sign}{change:.2f}%</td>'
            f'</tr>'
        )

    return (
        f'<table class="atlas-html-table">'
        f'<thead><tr>'
        f'<th>Symbol</th>'
        f'<th>Shares</th>'
        f'<th class="text-right">Price</th>'
        f'<th class="text-right">Value</th>'
        f'<th class="text-right">Change</th>'
        f'</tr></thead>'
        f'<tbody>{"".join(rows_html)}</tbody>'
        f'</table>'
    )


# =============================================================================
# GENERIC TABLE (Column-type driven rendering)
# =============================================================================

# Column type renderers
def _render_cell(value, col_type: str, currency: str = "$") -> str:
    """Render a single cell based on column type."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return '<td class="text-cell">\u2014</td>'

    if col_type == 'ticker':
        return f'<td class="ticker-cell">{value}</td>'

    elif col_type == 'price':
        val = pd.to_numeric(value, errors='coerce')
        if pd.isna(val):
            return f'<td class="price-cell">{value}</td>'
        return f'<td class="price-cell">{currency}{val:,.2f}</td>'

    elif col_type == 'change':
        val = pd.to_numeric(str(value).replace('%', ''), errors='coerce')
        if pd.isna(val):
            return f'<td class="text-cell">{value}</td>'
        is_up = val >= 0
        arrow = "\u25b2" if is_up else "\u25bc"
        cls = "change-up" if is_up else "change-down"
        sign = "+" if is_up else ""
        return f'<td class="{cls}">{arrow} {sign}{val:.2f}%</td>'

    elif col_type == 'percent':
        val = pd.to_numeric(str(value).replace('%', ''), errors='coerce')
        if pd.isna(val):
            return f'<td class="percent-cell">{value}</td>'
        sign = "+" if val >= 0 else ""
        return f'<td class="percent-cell">{sign}{val:.2f}%</td>'

    elif col_type == 'volume':
        val = pd.to_numeric(value, errors='coerce')
        if pd.isna(val):
            return f'<td class="meta-cell">{value}</td>'
        return f'<td class="meta-cell">{format_volume(val)}</td>'

    elif col_type == 'market_cap':
        val = pd.to_numeric(value, errors='coerce')
        if pd.isna(val):
            return f'<td class="meta-cell">{value}</td>'
        return f'<td class="meta-cell">{format_market_cap(val)}</td>'

    elif col_type == 'ratio':
        val = pd.to_numeric(value, errors='coerce')
        if pd.isna(val):
            return f'<td class="text-cell">{value}</td>'
        return f'<td class="text-cell">{val:.2f}</td>'

    else:  # 'text' or unknown
        return f'<td class="text-cell">{value}</td>'


def render_generic_table(
    df: pd.DataFrame,
    columns: List[Dict],
    max_rows: Optional[int] = None,
    currency: str = "$",
) -> str:
    """
    Render a table with column-type-driven formatting.

    Args:
        df: DataFrame with data
        columns: List of column definitions, each a dict:
            {
                'key': 'column_name_in_df',
                'label': 'Display Header',
                'type': 'ticker' | 'price' | 'change' | 'percent' | 'volume' |
                        'market_cap' | 'ratio' | 'text',
            }
        max_rows: Limit number of rows (None = all)
        currency: Currency symbol for price columns

    Returns:
        HTML string. Use with st.markdown(..., unsafe_allow_html=True).

    Example:
        render_generic_table(df, columns=[
            {'key': 'symbol', 'label': 'Symbol', 'type': 'ticker'},
            {'key': 'volume', 'label': 'Volume', 'type': 'volume'},
            {'key': 'price', 'label': 'Price', 'type': 'price'},
            {'key': 'change_pct', 'label': 'Change', 'type': 'change'},
        ])
    """
    if df is None or df.empty:
        return '<span class="meta-cell">No data available</span>'

    # Determine alignment for headers
    right_types = {'price', 'change', 'percent', 'ratio'}

    # Build header
    headers = []
    for col in columns:
        align_cls = ' class="text-right"' if col.get('type') in right_types else ''
        headers.append(f'<th{align_cls}>{col["label"]}</th>')

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
        f'<table class="atlas-html-table">'
        f'<thead><tr>{"".join(headers)}</tr></thead>'
        f'<tbody>{"".join(rows_html)}</tbody>'
        f'</table>'
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
]
