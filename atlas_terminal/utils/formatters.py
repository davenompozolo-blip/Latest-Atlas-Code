"""
ATLAS Terminal Formatting Utilities
Phase 2 Day 1 - Formatters Module

This module provides centralized formatting functions to eliminate
duplicate code across the application.

Replaces:
- format_percentage() at line 444
- format_percentage() at line 3384
- Other scattered formatting logic
"""

from typing import Optional, Union
import numpy as np
import pandas as pd


def format_percentage(
    value: Optional[Union[float, int]],
    decimals: int = 2,
    include_sign: bool = False,
    multiply_by_100: bool = True
) -> str:
    """
    Format a decimal value as a percentage

    Args:
        value: Decimal value to format (e.g., 0.1523)
        decimals: Number of decimal places
        include_sign: Whether to include + for positive values
        multiply_by_100: Whether to multiply by 100 (set False if value is already in %)

    Returns:
        Formatted percentage string (e.g., "15.23%")

    Examples:
        >>> format_percentage(0.1523, decimals=2)
        '15.23%'
        >>> format_percentage(0.1523, decimals=1)
        '15.2%'
        >>> format_percentage(-0.05, include_sign=True)
        '-5.00%'
        >>> format_percentage(15.23, multiply_by_100=False)
        '15.23%'
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "N/A"

    try:
        # Convert to float
        val = float(value)

        # Multiply by 100 if needed
        if multiply_by_100:
            val = val * 100

        # Format with sign if requested
        if include_sign and val > 0:
            return f"+{val:.{decimals}f}%"
        else:
            return f"{val:.{decimals}f}%"
    except (ValueError, TypeError):
        return "N/A"


def format_currency(
    value: Optional[Union[float, int]],
    decimals: int = 2,
    currency_symbol: str = "$",
    include_sign: bool = False
) -> str:
    """
    Format a value as currency

    Args:
        value: Monetary value to format
        decimals: Number of decimal places
        currency_symbol: Currency symbol to use
        include_sign: Whether to include + for positive values

    Returns:
        Formatted currency string (e.g., "$1,234.56")

    Examples:
        >>> format_currency(1234.56)
        '$1,234.56'
        >>> format_currency(1234.56, decimals=0)
        '$1,235'
        >>> format_currency(-500.00)
        '-$500.00'
        >>> format_currency(100, include_sign=True)
        '+$100.00'
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "N/A"

    try:
        val = float(value)

        # Handle negative values
        is_negative = val < 0
        abs_val = abs(val)

        # Format the number
        formatted = f"{abs_val:,.{decimals}f}"

        # Add currency symbol and sign
        if is_negative:
            return f"-{currency_symbol}{formatted}"
        elif include_sign and val > 0:
            return f"+{currency_symbol}{formatted}"
        else:
            return f"{currency_symbol}{formatted}"
    except (ValueError, TypeError):
        return "N/A"


def format_number(
    value: Optional[Union[float, int]],
    decimals: int = 2,
    include_sign: bool = False
) -> str:
    """
    Format a number with thousand separators

    Args:
        value: Number to format
        decimals: Number of decimal places
        include_sign: Whether to include + for positive values

    Returns:
        Formatted number string (e.g., "1,234.56")

    Examples:
        >>> format_number(1234.56)
        '1,234.56'
        >>> format_number(1234.56, decimals=0)
        '1,235'
        >>> format_number(1234, include_sign=True)
        '+1,234.00'
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "N/A"

    try:
        val = float(value)

        # Format with sign if requested
        if include_sign and val > 0:
            return f"+{val:,.{decimals}f}"
        else:
            return f"{val:,.{decimals}f}"
    except (ValueError, TypeError):
        return "N/A"


def format_large_number(
    value: Optional[Union[float, int]],
    decimals: int = 2
) -> str:
    """
    Format large numbers with K/M/B suffixes

    Args:
        value: Number to format
        decimals: Number of decimal places

    Returns:
        Formatted string with suffix (e.g., "1.23M", "45.67B")

    Examples:
        >>> format_large_number(1234567)
        '1.23M'
        >>> format_large_number(1234567890)
        '1.23B'
        >>> format_large_number(1234)
        '1.23K'
        >>> format_large_number(123)
        '123.00'
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "N/A"

    try:
        val = float(value)
        abs_value = abs(val)
        sign = "-" if val < 0 else ""

        if abs_value >= 1e12:
            return f"{sign}{abs_value/1e12:.{decimals}f}T"
        elif abs_value >= 1e9:
            return f"{sign}{abs_value/1e9:.{decimals}f}B"
        elif abs_value >= 1e6:
            return f"{sign}{abs_value/1e6:.{decimals}f}M"
        elif abs_value >= 1e3:
            return f"{sign}{abs_value/1e3:.{decimals}f}K"
        else:
            return f"{sign}{abs_value:.{decimals}f}"
    except (ValueError, TypeError):
        return "N/A"


def format_ratio(
    value: Optional[Union[float, int]],
    decimals: int = 2,
    suffix: str = "x"
) -> str:
    """
    Format a ratio value (e.g., Sharpe ratio, P/E ratio)

    Args:
        value: Ratio value to format
        decimals: Number of decimal places
        suffix: Suffix to append (default: "x")

    Returns:
        Formatted ratio string (e.g., "1.52x")

    Examples:
        >>> format_ratio(1.523)
        '1.52x'
        >>> format_ratio(15.23, suffix='')
        '15.23'
        >>> format_ratio(0.75)
        '0.75x'
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "N/A"

    try:
        val = float(value)
        return f"{val:.{decimals}f}{suffix}"
    except (ValueError, TypeError):
        return "N/A"


def format_basis_points(
    value: Optional[Union[float, int]],
    decimals: int = 0,
    from_decimal: bool = True
) -> str:
    """
    Format value as basis points

    Args:
        value: Value to format (decimal or bps)
        decimals: Number of decimal places
        from_decimal: If True, converts from decimal (0.01 = 100bps)

    Returns:
        Formatted basis points string (e.g., "100 bps")

    Examples:
        >>> format_basis_points(0.01)  # 1% = 100 bps
        '100 bps'
        >>> format_basis_points(0.005)  # 0.5% = 50 bps
        '50 bps'
        >>> format_basis_points(100, from_decimal=False)
        '100 bps'
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "N/A"

    try:
        val = float(value)

        if from_decimal:
            val = val * 10000  # Convert to basis points

        return f"{val:.{decimals}f} bps"
    except (ValueError, TypeError):
        return "N/A"


def format_date(
    date: Optional[Union[str, pd.Timestamp]],
    format_string: str = "%Y-%m-%d"
) -> str:
    """
    Format a date consistently

    Args:
        date: Date to format (string, datetime, or pandas Timestamp)
        format_string: strftime format string

    Returns:
        Formatted date string

    Examples:
        >>> format_date(pd.Timestamp('2024-01-15'))
        '2024-01-15'
        >>> format_date(pd.Timestamp('2024-01-15'), "%B %d, %Y")
        'January 15, 2024'
    """
    if date is None or date == "" or (isinstance(date, float) and np.isnan(date)):
        return "N/A"

    try:
        if isinstance(date, str):
            date = pd.to_datetime(date)

        return date.strftime(format_string)
    except Exception:
        return str(date)


def format_shares(
    value: Optional[Union[float, int]],
    decimals: int = 0
) -> str:
    """
    Format number of shares

    Args:
        value: Number of shares
        decimals: Number of decimal places (0 for whole shares)

    Returns:
        Formatted shares string

    Examples:
        >>> format_shares(1500)
        '1,500'
        >>> format_shares(1500.5, decimals=2)
        '1,500.50'
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "N/A"

    try:
        val = float(value)
        return f"{val:,.{decimals}f}"
    except (ValueError, TypeError):
        return "N/A"


def format_return(
    value: Optional[Union[float, int]],
    decimals: int = 2,
    colored: bool = False,
    html: bool = False
) -> str:
    """
    Format investment return with optional color coding

    Args:
        value: Return value as decimal (e.g., 0.15 for 15%)
        decimals: Number of decimal places
        colored: Whether to add color for positive/negative
        html: Whether to return HTML with color

    Returns:
        Formatted return string, optionally with color

    Examples:
        >>> format_return(0.15)
        '+15.00%'
        >>> format_return(-0.05)
        '-5.00%'
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "N/A"

    try:
        val = float(value) * 100  # Convert to percentage

        # Format with sign
        formatted = f"{val:+.{decimals}f}%"

        # Add color if requested
        if colored and not html:
            # For terminal/plain text (you could add ANSI codes)
            return formatted
        elif colored and html:
            color = "green" if val > 0 else "red" if val < 0 else "gray"
            return f'<span style="color: {color};">{formatted}</span>'
        else:
            return formatted
    except (ValueError, TypeError):
        return "N/A"


# Batch formatting functions for DataFrames
def format_dataframe_currency(df: pd.DataFrame, columns: list, decimals: int = 2) -> pd.DataFrame:
    """
    Format multiple DataFrame columns as currency

    Args:
        df: DataFrame to format
        columns: List of column names to format
        decimals: Number of decimal places

    Returns:
        DataFrame with formatted columns
    """
    df_formatted = df.copy()
    for col in columns:
        if col in df_formatted.columns:
            df_formatted[col] = df_formatted[col].apply(
                lambda x: format_currency(x, decimals=decimals)
            )
    return df_formatted


def format_dataframe_percentage(df: pd.DataFrame, columns: list, decimals: int = 2) -> pd.DataFrame:
    """
    Format multiple DataFrame columns as percentages

    Args:
        df: DataFrame to format
        columns: List of column names to format
        decimals: Number of decimal places

    Returns:
        DataFrame with formatted columns
    """
    df_formatted = df.copy()
    for col in columns:
        if col in df_formatted.columns:
            df_formatted[col] = df_formatted[col].apply(
                lambda x: format_percentage(x, decimals=decimals)
            )
    return df_formatted


# Example usage and testing
if __name__ == "__main__":
    # Test all formatters
    print("Testing formatters:")
    print(f"Percentage: {format_percentage(0.1523)}")
    print(f"Currency: {format_currency(1234567.89)}")
    print(f"Number: {format_number(1234567.89)}")
    print(f"Large number: {format_large_number(1234567890)}")
    print(f"Ratio: {format_ratio(1.523)}")
    print(f"Basis points: {format_basis_points(0.01)}")
    print(f"Return: {format_return(0.15)}")
    print(f"Shares: {format_shares(1500.5, decimals=2)}")
