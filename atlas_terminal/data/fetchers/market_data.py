"""
Market data fetching with caching and error handling.
"""

import yfinance as yf
import pandas as pd
from typing import Optional, Dict, List
from datetime import datetime, timedelta
import sys
from pathlib import Path

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from atlas_terminal.core.cache_manager import cached
from atlas_terminal.core.error_handler import safe_execute

class MarketDataFetcher:
    """Fetch market data with intelligent caching and fallbacks."""

    @staticmethod
    @cached(ttl=900, persist=True)  # Cache for 15 minutes
    @safe_execute(fallback_value=pd.DataFrame(), context="fetching stock history")
    def get_stock_history(
        ticker: str,
        period: str = "1y",
        interval: str = "1d"
    ) -> pd.DataFrame:
        """
        Fetch stock price history.

        Args:
            ticker: Stock ticker symbol
            period: Period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
            interval: Data interval (1m, 2m, 5m, 15m, 30m, 60m, 90m, 1d, 5d, 1wk, 1mo, 3mo)

        Returns:
            DataFrame with OHLCV data
        """
        stock = yf.Ticker(ticker)
        df = stock.history(period=period, interval=interval)

        if df.empty:
            raise ValueError(f"No data found for {ticker}")

        return df

    @staticmethod
    @cached(ttl=3600, persist=True)  # Cache for 1 hour
    @safe_execute(fallback_value={}, context="fetching company info")
    def get_company_info(ticker: str) -> Dict:
        """
        Fetch company information.

        Returns:
            Dict with company info (name, sector, industry, etc.)
        """
        stock = yf.Ticker(ticker)
        info = stock.info

        if not info:
            raise ValueError(f"No info found for {ticker}")

        return info

    @staticmethod
    @cached(ttl=1800, persist=True)  # Cache for 30 minutes
    @safe_execute(fallback_value=pd.DataFrame(), context="fetching financials")
    def get_financials(ticker: str, statement_type: str = "income") -> pd.DataFrame:
        """
        Fetch financial statements.

        Args:
            ticker: Stock ticker
            statement_type: 'income', 'balance', or 'cashflow'

        Returns:
            DataFrame with financial data
        """
        stock = yf.Ticker(ticker)

        if statement_type == "income":
            df = stock.financials
        elif statement_type == "balance":
            df = stock.balance_sheet
        elif statement_type == "cashflow":
            df = stock.cashflow
        else:
            raise ValueError(f"Invalid statement type: {statement_type}")

        if df.empty:
            raise ValueError(f"No {statement_type} statement found for {ticker}")

        return df

    @staticmethod
    @cached(ttl=600, persist=False)  # Cache for 10 minutes (don't persist)
    @safe_execute(fallback_value=None, context="fetching current price")
    def get_current_price(ticker: str) -> Optional[float]:
        """
        Fetch current stock price.

        Returns:
            Current price or None if not available
        """
        stock = yf.Ticker(ticker)
        hist = stock.history(period="1d")

        if hist.empty:
            return None

        return float(hist['Close'].iloc[-1])

    @staticmethod
    @cached(ttl=3600, persist=True)  # Cache for 1 hour
    @safe_execute(fallback_value=[], context="fetching market data for multiple tickers")
    def get_multiple_tickers(tickers: List[str], period: str = "1d") -> List[Dict]:
        """
        Fetch data for multiple tickers efficiently.

        Returns:
            List of dicts with ticker data
        """
        results = []

        for ticker in tickers:
            try:
                price = MarketDataFetcher.get_current_price(ticker)
                info = MarketDataFetcher.get_company_info(ticker)

                results.append({
                    'ticker': ticker,
                    'price': price,
                    'name': info.get('longName', ticker),
                    'sector': info.get('sector', 'Unknown'),
                    'market_cap': info.get('marketCap', 0)
                })
            except (ValueError, KeyError, ConnectionError, AttributeError):
                continue

        return results

    @staticmethod
    @cached(ttl=900, persist=True)  # Cache for 15 minutes
    @safe_execute(fallback_value=pd.DataFrame(), context="fetching multi-ticker prices")
    def get_prices(tickers: List[str], period: str = "1y") -> pd.DataFrame:
        """
        Fetch close prices for multiple tickers as a DataFrame.

        Args:
            tickers: List of ticker symbols
            period: Period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)

        Returns:
            DataFrame with columns=tickers, index=dates, values=close prices.
            Single-ticker input returns a single-column DataFrame (never a Series).
        """
        df = yf.download(tickers, period=period, progress=False)['Close']

        if isinstance(df, pd.Series):
            df = df.to_frame(name=tickers[0] if len(tickers) == 1 else df.name)

        if df.empty:
            raise ValueError(f"No price data found for {tickers}")

        return df

    @staticmethod
    @cached(ttl=3600, persist=True)  # Cache for 1 hour
    @safe_execute(fallback_value={}, context="fetching sector map")
    def get_sector_map(tickers: List[str]) -> Dict[str, str]:
        """
        Fetch sector classification for each ticker.

        Args:
            tickers: List of ticker symbols

        Returns:
            Dict mapping ticker -> sector string. Unknown on failure.
        """
        sector_map: Dict[str, str] = {}
        for ticker in tickers:
            info = MarketDataFetcher.get_company_info(ticker)
            sector_map[ticker] = info.get('sector', 'Unknown') if info else 'Unknown'
        return sector_map


# Global instance
market_data = MarketDataFetcher()
