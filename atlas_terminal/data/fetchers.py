"""
Data Fetchers Module
Handles all external API calls (Yahoo Finance) with proper error handling and caching

IMPROVEMENTS FROM v9.7:
- Proper exception handling (no bare except blocks)
- Comprehensive logging
- Type hints throughout
- Caching with streamlit decorators
- Graceful fallbacks
"""

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import logging
import streamlit as st
import requests

from .validators import is_valid_dataframe, is_valid_series

logger = logging.getLogger(__name__)


@st.cache_data(ttl=600)
def fetch_historical_data(ticker: str,
                         start_date: datetime,
                         end_date: datetime) -> Optional[pd.DataFrame]:
    """
    Fetch historical price data from Yahoo Finance with proper error handling

    Args:
        ticker: Stock/ETF/Crypto ticker symbol
        start_date: Start date for historical data
        end_date: End date for historical data

    Returns:
        DataFrame with OHLCV data or None if fetch fails
    """
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(start=start_date, end=end_date)

        if is_valid_dataframe(hist):
            return hist
        else:
            logger.warning(f"Empty historical data returned for {ticker}")
            return None

    except requests.exceptions.RequestException as e:
        logger.error(f"Network error fetching {ticker}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error fetching {ticker}: {e}", exc_info=True)
        return None


@st.cache_data(ttl=3600)
def fetch_company_info(ticker: str) -> Optional[Dict[str, Any]]:
    """
    Fetch company fundamental data from Yahoo Finance

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dict with company info or None if fetch fails
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info

        if info and isinstance(info, dict):
            return info
        else:
            logger.warning(f"No company info available for {ticker}")
            return None

    except requests.exceptions.RequestException as e:
        logger.error(f"Network error fetching company info for {ticker}: {e}")
        return None
    except Exception as e:
        logger.error(f"Error fetching company info for {ticker}: {e}", exc_info=True)
        return None


@st.cache_data(ttl=3600)
def fetch_analyst_data(ticker: str) -> Optional[Dict[str, Any]]:
    """
    Fetch analyst recommendations and price targets

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dict with analyst data or None if unavailable
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info

        if not info:
            return {'success': False, 'rating': 'No Coverage', 'target_price': None}

        rating = info.get('recommendationKey', 'none')
        if rating == 'none' or rating is None:
            rating = "No Coverage"

        return {
            'rating': rating.upper() if rating != "No Coverage" else rating,
            'target_price': info.get('targetMeanPrice'),
            'num_analysts': info.get('numberOfAnalystOpinions', 0),
            'success': True
        }

    except Exception as e:
        logger.warning(f"Error fetching analyst data for {ticker}: {e}")
        return {'success': False, 'rating': 'No Coverage', 'target_price': None}


@st.cache_data(ttl=300)
def fetch_market_watch_data(tickers_dict: Dict[str, Dict[str, str]]) -> pd.DataFrame:
    """
    Fetch market data for multiple tickers with cleaned display symbols

    Args:
        tickers_dict: Dict mapping ticker to metadata {name, category/region}

    Returns:
        DataFrame with market data
    """
    market_data = []

    for ticker, info in tickers_dict.items():
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period="5d")

            if not is_valid_dataframe(hist):
                continue

            current = hist['Close'].iloc[-1]
            prev = hist['Close'].iloc[-2] if len(hist) > 1 else current
            change = ((current - prev) / prev) * 100

            five_day = ((current / hist['Close'].iloc[0]) - 1) * 100 if len(hist) >= 5 else 0

            volume = hist['Volume'].iloc[-1]
            avg_volume = hist['Volume'].mean()

            # Clean up symbol for display
            clean_symbol = ticker.replace('^', '').replace('=F', '').replace('-USD', '')

            # For commodities and indices, show descriptive name
            if '=F' in ticker or ticker.endswith('=F'):
                display_symbol = info.get('name', clean_symbol)
            elif ticker.startswith('^'):
                display_symbol = info.get('name', clean_symbol)
            else:
                display_symbol = ticker

            market_data.append({
                'Symbol': display_symbol,
                'Name': info.get('name', ticker),
                'Category': info.get('category', info.get('region', '')),
                'Last': current,
                'Change %': change,
                '5D %': five_day,
                'Volume': volume,
                'Avg Volume': avg_volume,
                'Vol/Avg': volume / avg_volume if avg_volume > 0 else 0
            })

        except Exception as e:
            logger.debug(f"Skipping {ticker} due to error: {e}")
            continue

    return pd.DataFrame(market_data)


@st.cache_data(ttl=3600)
def fetch_financial_statements(ticker: str) -> Optional[Dict[str, pd.DataFrame]]:
    """
    Fetch financial statements (income statement, balance sheet, cash flow)

    Args:
        ticker: Stock ticker symbol

    Returns:
        Dict with 'income', 'balance', 'cashflow' DataFrames or None
    """
    try:
        stock = yf.Ticker(ticker)

        income_stmt = stock.financials
        balance_sheet = stock.balance_sheet
        cash_flow = stock.cashflow

        if is_valid_dataframe(income_stmt):
            return {
                'income': income_stmt,
                'balance': balance_sheet if is_valid_dataframe(balance_sheet) else None,
                'cashflow': cash_flow if is_valid_dataframe(cash_flow) else None
            }
        else:
            logger.warning(f"No financial statements available for {ticker}")
            return None

    except Exception as e:
        logger.error(f"Error fetching financial statements for {ticker}: {e}", exc_info=True)
        return None


def fetch_current_price(ticker: str) -> Optional[float]:
    """
    Fetch current price for a ticker (not cached - for real-time use)

    Args:
        ticker: Ticker symbol

    Returns:
        Current price or None
    """
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="1d")

        if is_valid_dataframe(hist) and len(hist) > 0:
            return float(hist['Close'].iloc[-1])
        else:
            logger.warning(f"No current price available for {ticker}")
            return None

    except Exception as e:
        logger.error(f"Error fetching current price for {ticker}: {e}")
        return None


@st.cache_data(ttl=3600)
def fetch_dividend_history(ticker: str) -> Optional[pd.Series]:
    """
    Fetch dividend history for a stock

    Args:
        ticker: Stock ticker symbol

    Returns:
        Series with dividend data or None
    """
    try:
        stock = yf.Ticker(ticker)
        dividends = stock.dividends

        if is_valid_series(dividends):
            return dividends
        else:
            return None

    except Exception as e:
        logger.warning(f"Error fetching dividends for {ticker}: {e}")
        return None


@st.cache_data(ttl=86400)
def fetch_benchmark_data(benchmark: str,
                        start_date: datetime,
                        end_date: datetime) -> Optional[pd.Series]:
    """
    Fetch benchmark index data for performance comparison

    Args:
        benchmark: Benchmark ticker (e.g., '^GSPC' for S&P 500)
        start_date: Start date
        end_date: End date

    Returns:
        Series with benchmark returns or None
    """
    hist_data = fetch_historical_data(benchmark, start_date, end_date)

    if hist_data is not None and 'Close' in hist_data.columns:
        returns = hist_data['Close'].pct_change().dropna()
        if is_valid_series(returns):
            return returns

    logger.warning(f"Could not fetch benchmark data for {benchmark}")
    return None
