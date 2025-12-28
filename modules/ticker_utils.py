"""
Ticker Conversion Utilities for ATLAS Terminal

Converts between different ticker formats:
- Easy Equities → Yahoo Finance
- Yahoo Finance → Display Format
"""

from typing import Optional
import pandas as pd
import yfinance as yf


def convert_ee_ticker_to_yahoo(ticker: str) -> str:
    """
    Convert Easy Equities ticker to Yahoo Finance format

    Conversions:
    - EQU.ZA.XXX → XXX.JO (JSE stocks)
    - EQU.US.XXX → XXX (US stocks)
    - EQU.UK.XXX → XXX.L (London Stock Exchange)
    - EQU.AU.XXX → XXX.AX (Australian Stock Exchange)
    - EC10.EC.EC10 → Keep as-is (crypto, might not have history)
    - Everything else → Keep as-is

    Args:
        ticker: Easy Equities ticker format

    Returns:
        Yahoo Finance compatible ticker

    Examples:
        >>> convert_ee_ticker_to_yahoo("EQU.ZA.BVT")
        'BVT.JO'
        >>> convert_ee_ticker_to_yahoo("EQU.ZA.STXNDQ")
        'STXNDQ.JO'
        >>> convert_ee_ticker_to_yahoo("EQU.ZA.BTI")
        'BTI.JO'
        >>> convert_ee_ticker_to_yahoo("EQU.US.AAPL")
        'AAPL'
        >>> convert_ee_ticker_to_yahoo("EC10.EC.EC10")
        'EC10.EC.EC10'
    """

    # JSE stocks (South Africa)
    if ticker.startswith("EQU.ZA."):
        # Remove "EQU.ZA." prefix and add ".JO" suffix
        clean_ticker = ticker.replace("EQU.ZA.", "")
        return f"{clean_ticker}.JO"

    # US stocks
    elif ticker.startswith("EQU.US."):
        # Just remove the "EQU.US." prefix
        return ticker.replace("EQU.US.", "")

    # UK stocks (London Stock Exchange)
    elif ticker.startswith("EQU.UK."):
        # Remove prefix and add ".L" for London
        clean_ticker = ticker.replace("EQU.UK.", "")
        return f"{clean_ticker}.L"

    # Australian stocks
    elif ticker.startswith("EQU.AU."):
        # Remove prefix and add ".AX" for ASX
        clean_ticker = ticker.replace("EQU.AU.", "")
        return f"{clean_ticker}.AX"

    # Everything else (crypto, commodities, etc.)
    else:
        # Return as-is, might not have historical data
        return ticker


def convert_yahoo_ticker_to_display(yahoo_ticker: str) -> str:
    """
    Convert Yahoo Finance ticker back to readable format for display

    Args:
        yahoo_ticker: Yahoo Finance format ticker

    Returns:
        Clean display ticker

    Examples:
        >>> convert_yahoo_ticker_to_display("BVT.JO")
        'BVT (JSE)'
        >>> convert_yahoo_ticker_to_display("AAPL")
        'AAPL'
        >>> convert_yahoo_ticker_to_display("VOD.L")
        'VOD (LSE)'
    """

    if yahoo_ticker.endswith(".JO"):
        base = yahoo_ticker.replace(".JO", "")
        return f"{base} (JSE)"
    elif yahoo_ticker.endswith(".L"):
        base = yahoo_ticker.replace(".L", "")
        return f"{base} (LSE)"
    elif yahoo_ticker.endswith(".AX"):
        base = yahoo_ticker.replace(".AX", "")
        return f"{base} (ASX)"
    else:
        return yahoo_ticker


def fetch_stock_history(
    ticker: str,
    period: str = "1y",
    interval: str = "1d"
) -> Optional[pd.DataFrame]:
    """
    Fetch stock price history from Yahoo Finance

    Automatically converts Easy Equities tickers to Yahoo Finance format.

    Args:
        ticker: Stock ticker (can be EE format or Yahoo format)
        period: Time period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
        interval: Data interval (1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo)

    Returns:
        DataFrame with OHLCV data, or None if data cannot be fetched

    Raises:
        Exception if data cannot be fetched
    """

    # Convert Easy Equities ticker to Yahoo Finance format
    yahoo_ticker = convert_ee_ticker_to_yahoo(ticker)

    try:
        # Fetch data from Yahoo Finance
        data = yf.download(
            yahoo_ticker,
            period=period,
            interval=interval,
            progress=False,  # Disable progress bar
            show_errors=False  # Suppress error messages
        )

        # Check if data was retrieved
        if data.empty:
            raise Exception(f"No data found for {ticker} (tried {yahoo_ticker})")

        # Add metadata
        data.attrs['original_ticker'] = ticker
        data.attrs['yahoo_ticker'] = yahoo_ticker
        data.attrs['fetch_time'] = pd.Timestamp.now()

        return data

    except Exception as e:
        # Log the error and raise
        print(f"Error fetching {ticker}: {str(e)}")
        raise Exception(f"Could not fetch data for {ticker}: {str(e)}")


def fetch_stock_history_with_fallback(
    ticker: str,
    period: str = "1y",
    interval: str = "1d"
) -> Optional[pd.DataFrame]:
    """
    Fetch stock history with graceful fallback for missing data

    Args:
        ticker: Stock ticker (can be EE format or Yahoo format)
        period: Time period
        interval: Data interval

    Returns:
        - DataFrame if data available
        - None if no historical data
    """

    try:
        data = fetch_stock_history(ticker, period=period, interval=interval)
        return data
    except:
        # No historical data available
        return None


def fetch_current_price(ticker: str) -> float:
    """
    Fetch current stock price

    Args:
        ticker: Stock ticker (can be EE format or Yahoo format)

    Returns:
        Current price as float (0.0 if unavailable)
    """

    # Convert ticker
    yahoo_ticker = convert_ee_ticker_to_yahoo(ticker)

    try:
        stock = yf.Ticker(yahoo_ticker)
        info = stock.info

        # Try different price fields (Yahoo Finance is inconsistent)
        price = (
            info.get('currentPrice') or
            info.get('regularMarketPrice') or
            info.get('previousClose') or
            0.0
        )

        return float(price)

    except:
        return 0.0


def test_ticker_conversion():
    """
    Test ticker conversion with known Easy Equities tickers

    Returns:
        Dictionary of test results
    """

    test_cases = {
        "EQU.ZA.DRD": "DRD.JO",           # DRD Gold
        "EQU.ZA.BTI": "BTI.JO",           # British American Tobacco
        "EQU.ZA.CML": "CML.JO",           # Coronation
        "EQU.ZA.ELI": "ELI.JO",           # Ellies
        "EQU.ZA.LEW": "LEW.JO",           # Lewis Group
        "EQU.ZA.PPH": "PPH.JO",           # Pepkor
        "EQU.ZA.STXNDQ": "STXNDQ.JO",     # Satrix Nasdaq
        "EQU.ZA.TSG": "TSG.JO",           # Tsogo Sun
        "EQU.ZA.DCP": "DCP.JO",           # Dis-Chem
        "EQU.US.AAPL": "AAPL",            # Apple
        "EC10.EC.EC10": "EC10.EC.EC10"    # Crypto - won't have history
    }

    results = {}

    for ee_ticker, expected_yahoo in test_cases.items():
        converted = convert_ee_ticker_to_yahoo(ee_ticker)
        passed = converted == expected_yahoo
        results[ee_ticker] = {
            'expected': expected_yahoo,
            'actual': converted,
            'passed': passed
        }

    return results


# Ticker cache for performance optimization
_TICKER_CACHE = {}


def convert_ee_ticker_to_yahoo_cached(ticker: str) -> str:
    """
    Cached version of ticker conversion for performance

    Args:
        ticker: Easy Equities ticker

    Returns:
        Yahoo Finance ticker (cached)
    """

    if ticker in _TICKER_CACHE:
        return _TICKER_CACHE[ticker]

    converted = convert_ee_ticker_to_yahoo(ticker)
    _TICKER_CACHE[ticker] = converted
    return converted


def clear_ticker_cache():
    """Clear the ticker conversion cache"""
    global _TICKER_CACHE
    _TICKER_CACHE = {}


# ==============================================================================
# TICKER DISPLAY FORMATTING (Phase 1 Fix)
# ==============================================================================

def format_ticker_for_display(ticker: str) -> str:
    """
    Convert ticker to clean display format (remove exchange prefixes)

    Examples:
        >>> format_ticker_for_display("EQU.ZA.BTI")
        'BTI'
        >>> format_ticker_for_display("EQU.ZA.STXNDQ")
        'STXNDQ'
        >>> format_ticker_for_display("EC10.EC.EC10")
        'EC10'
        >>> format_ticker_for_display("AAPL")
        'AAPL'
    """
    if ticker.startswith("EQU.ZA."):
        return ticker.replace("EQU.ZA.", "")
    elif ticker.startswith("EQU.US."):
        return ticker.replace("EQU.US.", "")
    elif ticker.startswith("EQU.UK."):
        return ticker.replace("EQU.UK.", "")
    elif ticker.startswith("EQU.AU."):
        return ticker.replace("EQU.AU.", "")
    elif ticker.startswith("EC10."):
        return ticker.split(".")[0]  # Just the crypto code
    else:
        return ticker


def format_ticker_with_exchange(ticker: str) -> str:
    """
    Convert ticker to display format with exchange suffix

    Examples:
        >>> format_ticker_with_exchange("EQU.ZA.BTI")
        'BTI (JSE)'
        >>> format_ticker_with_exchange("EQU.US.AAPL")
        'AAPL (NYSE)'
        >>> format_ticker_with_exchange("EC10.EC.EC10")
        'EC10 (Crypto)'
    """
    if ticker.startswith("EQU.ZA."):
        base = ticker.replace("EQU.ZA.", "")
        return f"{base} (JSE)"
    elif ticker.startswith("EQU.US."):
        base = ticker.replace("EQU.US.", "")
        return f"{base} (NYSE)"
    elif ticker.startswith("EQU.UK."):
        base = ticker.replace("EQU.UK.", "")
        return f"{base} (LSE)"
    elif ticker.startswith("EQU.AU."):
        base = ticker.replace("EQU.AU.", "")
        return f"{base} (ASX)"
    elif ticker.startswith("EC10."):
        return ticker.split(".")[0] + " (Crypto)"
    else:
        return ticker
