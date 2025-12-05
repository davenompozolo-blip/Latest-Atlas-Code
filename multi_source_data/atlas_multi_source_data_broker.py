"""
ATLAS Multi-Source Data Broker
Unified interface for fetching market data from multiple sources
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import yfinance as yf

try:
    from config import config
except:
    from ..config import config


class DataBroker:
    """
    Multi-source market data broker

    Sources (in priority order):
    1. yfinance (free, reliable)
    2. Alpha Vantage (if API key provided)
    3. Financial Modeling Prep (if API key provided)
    4. Investopedia (scraped portfolio data)
    """

    def __init__(self):
        """Initialize data broker with configured sources"""
        self.sources = {
            'yfinance': True,  # Always available
            'alpha_vantage': bool(config.ALPHA_VANTAGE_API_KEY),
            'fmp': bool(config.FMP_API_KEY)
        }

        print("Data Broker initialized")
        print(f"Available sources: {[k for k, v in self.sources.items() if v]}")

    def get_price_data(
        self,
        tickers: List[str],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        period: str = "1y"
    ) -> pd.DataFrame:
        """
        Fetch price data for multiple tickers

        Args:
            tickers: List of ticker symbols
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            period: Period if dates not specified (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)

        Returns:
            DataFrame with adjusted close prices
        """
        print(f"Fetching price data for {len(tickers)} tickers...")

        # Primary source: yfinance
        try:
            if start_date and end_date:
                data = yf.download(
                    tickers,
                    start=start_date,
                    end=end_date,
                    progress=False,
                    threads=True,
                    auto_adjust=False
                )
            else:
                data = yf.download(
                    tickers,
                    period=period,
                    progress=False,
                    threads=True,
                    auto_adjust=False
                )

            # Extract adjusted close
            if len(tickers) == 1:
                # For single ticker, Adj Close is already a Series/DataFrame
                if isinstance(data['Adj Close'], pd.Series):
                    prices = data['Adj Close'].to_frame()
                    prices.columns = tickers
                else:
                    prices = data[['Adj Close']]
                    prices.columns = tickers
            else:
                prices = data['Adj Close']

            print(f"✅ Fetched {len(prices)} days of data")
            return prices

        except Exception as e:
            print(f"❌ yfinance fetch failed: {str(e)}")
            raise

    def get_returns(
        self,
        tickers: List[str],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        period: str = "1y"
    ) -> pd.DataFrame:
        """
        Calculate returns from price data

        Args:
            tickers: List of ticker symbols
            start_date: Start date
            end_date: End date
            period: Period

        Returns:
            DataFrame with daily returns
        """
        prices = self.get_price_data(tickers, start_date, end_date, period)
        returns = prices.pct_change().dropna()

        print(f"✅ Calculated returns: {len(returns)} days")
        return returns

    def get_current_prices(self, tickers: List[str]) -> Dict[str, float]:
        """
        Get current/latest prices for tickers

        Args:
            tickers: List of ticker symbols

        Returns:
            Dict mapping ticker to current price
        """
        print(f"Fetching current prices for {len(tickers)} tickers...")

        prices = {}

        for ticker in tickers:
            try:
                stock = yf.Ticker(ticker)
                info = stock.info
                prices[ticker] = info.get('currentPrice', info.get('regularMarketPrice', None))
            except:
                prices[ticker] = None

        valid_prices = sum(1 for p in prices.values() if p is not None)
        print(f"✅ Fetched {valid_prices}/{len(tickers)} prices")

        return prices

    def get_fundamentals(self, ticker: str) -> Dict:
        """
        Get fundamental data for a ticker

        Args:
            ticker: Ticker symbol

        Returns:
            Dict with fundamental metrics
        """
        try:
            stock = yf.Ticker(ticker)
            info = stock.info

            fundamentals = {
                'ticker': ticker,
                'name': info.get('longName', ''),
                'sector': info.get('sector', ''),
                'industry': info.get('industry', ''),
                'market_cap': info.get('marketCap', None),
                'pe_ratio': info.get('trailingPE', None),
                'forward_pe': info.get('forwardPE', None),
                'peg_ratio': info.get('pegRatio', None),
                'price_to_book': info.get('priceToBook', None),
                'dividend_yield': info.get('dividendYield', None),
                'beta': info.get('beta', None)
            }

            return fundamentals

        except Exception as e:
            print(f"Error fetching fundamentals for {ticker}: {str(e)}")
            return {'ticker': ticker, 'error': str(e)}


__all__ = ['DataBroker']
