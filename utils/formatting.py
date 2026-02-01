"""
ATLAS Terminal - Formatting Utilities
Number formatting for currency, percentages, and large numbers.
"""

import pandas as pd


def format_percentage(value, decimals=2):
    """Format value as percentage string."""
    if pd.isna(value) or value is None:
        return "N/A"
    return f"{value:.{decimals}f}%"


def format_currency(value, currency_symbol='$'):
    """Format value as currency string."""
    if pd.isna(value) or value is None:
        return "N/A"
    return f"{currency_symbol}{value:,.2f}"


def format_large_number(value, currency_symbol='$'):
    """Format large numbers with B/M/K suffix."""
    if pd.isna(value) or value is None:
        return "N/A"
    if abs(value) >= 1e9:
        return f"{currency_symbol}{value/1e9:.2f}B"
    elif abs(value) >= 1e6:
        return f"{currency_symbol}{value/1e6:.2f}M"
    elif abs(value) >= 1e3:
        return f"{currency_symbol}{value/1e3:.2f}K"
    return f"{currency_symbol}{value:.2f}"


def add_arrow_indicator(value):
    """Add directional arrow indicator to a value."""
    try:
        val = float(str(value).replace('%', '').replace('$', '').replace(',', ''))
        if val > 0:
            return f"▲ {value}"
        elif val < 0:
            return f"▼ {value}"
        return f"─ {value}"
    except Exception:
        return value
