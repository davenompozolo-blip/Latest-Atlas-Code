"""
ATLAS Treasury Yield Data Fetcher
=================================
Production-grade yield data with FRED API (primary), Yahoo Finance (fallback),
and hardcoded data (emergency fallback).

Data Sources (in order of reliability):
1. FRED API (Federal Reserve Economic Data) - Official US government data
2. Yahoo Finance - Market data proxies
3. Hardcoded recent values - Emergency fallback only

Usage:
    fetcher = YieldDataFetcher()
    yields = fetcher.get_current_yields()
    spread = fetcher.calculate_yield_curve_slope()
"""

import os
import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

try:
    import yfinance as yf
    YF_AVAILABLE = True
except ImportError:
    YF_AVAILABLE = False

try:
    import streamlit as st
    ST_AVAILABLE = True
except ImportError:
    ST_AVAILABLE = False


class YieldDataFetcher:
    """
    Fetches Treasury yield data from FRED (primary) with Yahoo Finance fallback.
    Includes comprehensive validation to catch data integrity issues.
    """

    # Hardcoded FRED API key for local testing - replace with secrets in production
    _EMBEDDED_API_KEY = "1b56dae2052715336cd3e3d3ef8b4f81"

    # FRED series codes for Treasury yields
    FRED_SERIES = {
        '1M': 'DGS1MO',
        '3M': 'DGS3MO',
        '6M': 'DGS6MO',
        '1Y': 'DGS1',
        '2Y': 'DGS2',
        '3Y': 'DGS3',
        '5Y': 'DGS5',
        '7Y': 'DGS7',
        '10Y': 'DGS10',
        '20Y': 'DGS20',
        '30Y': 'DGS30'
    }

    # Yahoo Finance tickers (proxies - less reliable than FRED)
    YAHOO_TICKERS = {
        '^IRX': '3M',   # 13-week T-Bill (annualized)
        '^FVX': '5Y',   # 5-year Treasury
        '^TNX': '10Y',  # 10-year Treasury
        '^TYX': '30Y'   # 30-year Treasury
    }

    # Emergency fallback values (update periodically)
    FALLBACK_YIELDS = {
        '3M': 4.30, '6M': 4.20, '1Y': 4.10,
        '2Y': 3.58, '3Y': 3.70, '5Y': 3.85,
        '7Y': 4.00, '10Y': 4.23, '20Y': 4.40, '30Y': 4.45
    }
    FALLBACK_DATE = '2025-01-29'

    def __init__(self, api_key: str = None):
        """
        Initialize FRED API connection.

        Args:
            api_key: FRED API key. Checks (in order):
                     1. Passed parameter
                     2. Streamlit secrets (FRED_API_KEY)
                     3. Environment variable (FRED_API_KEY)
        """
        self.api_key = api_key
        self._source = None
        self._fetch_date = None
        self._warnings = []

        # Try to get API key from various sources
        if not self.api_key:
            # Try Streamlit secrets (nested format: [api_keys] fred = "...")
            if ST_AVAILABLE:
                try:
                    self.api_key = st.secrets["api_keys"]["fred"]
                except (KeyError, AttributeError, FileNotFoundError):
                    pass

            # Try environment variable
            if not self.api_key:
                self.api_key = os.environ.get("FRED_API_KEY", None)

            # Fall back to embedded key for local testing
            if not self.api_key:
                self.api_key = self._EMBEDDED_API_KEY

        # Clean up placeholder values
        if self.api_key in (None, "", "YOUR_API_KEY_HERE", "your_api_key_here"):
            self.api_key = None

    @property
    def source(self) -> str:
        """Return the data source used for the last fetch."""
        return self._source or "Not fetched"

    @property
    def warnings(self) -> List[str]:
        """Return warnings from the last fetch/validation."""
        return self._warnings

    def get_current_yields(self) -> Dict[str, Optional[float]]:
        """
        Get most recent Treasury yields for all maturities.
        Tries FRED first, then Yahoo Finance, then fallback.

        Returns:
            dict: {maturity: yield_value} e.g. {'2Y': 3.58, '10Y': 4.23}
        """
        self._warnings = []

        # Try FRED API first
        if self.api_key:
            yields = self._fetch_from_fred()
            if yields and len([v for v in yields.values() if v is not None]) >= 5:
                self._source = "FRED API"
                self._fetch_date = datetime.now().strftime('%Y-%m-%d')
                return yields

        # Fallback to Yahoo Finance
        if YF_AVAILABLE:
            yields = self._fetch_from_yahoo()
            if yields and len([v for v in yields.values() if v is not None]) >= 3:
                self._source = "Yahoo Finance"
                self._fetch_date = datetime.now().strftime('%Y-%m-%d')
                self._warnings.append("Using Yahoo Finance proxies - FRED API recommended for production")
                return yields

        # Emergency fallback
        self._source = "Fallback Data"
        self._fetch_date = self.FALLBACK_DATE
        self._warnings.append(
            f"Using hardcoded fallback data from {self.FALLBACK_DATE}. "
            "Configure FRED_API_KEY for live data."
        )
        return dict(self.FALLBACK_YIELDS)

    def _fetch_from_fred(self) -> Optional[Dict[str, Optional[float]]]:
        """Fetch yields from FRED API."""
        yields = {}

        for maturity, series_id in self.FRED_SERIES.items():
            try:
                url = "https://api.stlouisfed.org/fred/series/observations"
                params = {
                    "series_id": series_id,
                    "api_key": self.api_key,
                    "file_type": "json",
                    "sort_order": "desc",
                    "limit": 5  # Get last 5 in case most recent is '.'
                }

                response = requests.get(url, params=params, timeout=10)

                if response.status_code == 200:
                    data = response.json()
                    observations = data.get('observations', [])
                    for obs in observations:
                        if obs.get('value') and obs['value'] != '.':
                            yield_value = float(obs['value'])
                            if self._is_valid_yield(yield_value, maturity):
                                yields[maturity] = yield_value
                                break
                else:
                    self._warnings.append(f"FRED API error for {maturity}: HTTP {response.status_code}")

            except requests.Timeout:
                self._warnings.append(f"FRED API timeout for {maturity}")
            except Exception as e:
                self._warnings.append(f"FRED API error for {maturity}: {str(e)}")

        return yields if yields else None

    def _fetch_from_yahoo(self) -> Optional[Dict[str, Optional[float]]]:
        """Fetch yields from Yahoo Finance as fallback."""
        yields = {}

        for ticker, maturity in self.YAHOO_TICKERS.items():
            try:
                stock = yf.Ticker(ticker)
                hist = stock.history(period="5d")

                if not hist.empty:
                    # Yahoo yields are already in percentage points (e.g., 4.23 for 4.23%)
                    # ^IRX is annualized - DO NOT multiply by any factor
                    yield_value = float(hist['Close'].iloc[-1])

                    if self._is_valid_yield(yield_value, maturity):
                        yields[maturity] = yield_value
                    else:
                        self._warnings.append(
                            f"Yahoo {ticker} returned invalid yield: {yield_value:.2f}%"
                        )
            except Exception as e:
                self._warnings.append(f"Yahoo Finance error for {ticker}: {str(e)}")

        return yields if yields else None

    def calculate_yield_curve_slope(self, long_term: str = '10Y', short_term: str = '2Y') -> Optional[float]:
        """
        Calculate yield curve slope (spread).

        Args:
            long_term: Long-term maturity key (default: '10Y')
            short_term: Short-term maturity key (default: '2Y')

        Returns:
            float: Spread in percentage points (positive = normal, negative = inverted)
            None: If data unavailable
        """
        yields = self.get_current_yields()

        long_val = yields.get(long_term)
        short_val = yields.get(short_term)

        if long_val is None or short_val is None:
            # Try closest available maturity
            if short_val is None and '3M' in yields:
                short_val = yields['3M']
                self._warnings.append(f"Using 3M yield as proxy for {short_term}")

            if long_val is None or short_val is None:
                return None

        spread = long_val - short_val
        self._validate_spread(spread)
        return spread

    def is_yield_curve_inverted(self, long_term: str = '10Y', short_term: str = '2Y') -> Optional[bool]:
        """Check if yield curve is inverted."""
        spread = self.calculate_yield_curve_slope(long_term, short_term)
        if spread is None:
            return None
        return spread < 0

    def get_yield_curve_data(self, days_back: int = 90) -> Optional[pd.DataFrame]:
        """
        Get historical yield curve data from FRED.

        Args:
            days_back: Number of days of historical data

        Returns:
            DataFrame with columns for each maturity, or None if unavailable
        """
        if not self.api_key:
            self._warnings.append("FRED API key required for historical data")
            return None

        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)

        dfs = []
        for maturity, series_id in self.FRED_SERIES.items():
            try:
                url = "https://api.stlouisfed.org/fred/series/observations"
                params = {
                    "series_id": series_id,
                    "api_key": self.api_key,
                    "file_type": "json",
                    "observation_start": start_date.strftime('%Y-%m-%d'),
                    "observation_end": end_date.strftime('%Y-%m-%d')
                }

                response = requests.get(url, params=params, timeout=15)

                if response.status_code == 200:
                    data = response.json()
                    observations = data.get('observations', [])
                    records = []
                    for obs in observations:
                        if obs['value'] != '.':
                            records.append({
                                'date': obs['date'],
                                maturity: float(obs['value'])
                            })
                    if records:
                        df = pd.DataFrame(records).set_index('date')
                        dfs.append(df)
            except Exception as e:
                self._warnings.append(f"Historical fetch error for {maturity}: {str(e)}")

        if dfs:
            result = pd.concat(dfs, axis=1)
            result.index = pd.to_datetime(result.index)
            result.index.name = 'Date'
            return result.sort_index()

        return None

    # ========================================================================
    # VALIDATION METHODS
    # ========================================================================

    def validate_yields(self, yields: Dict[str, Optional[float]]) -> Tuple[bool, List[str]]:
        """
        Comprehensive validation of yield data.

        Checks:
        1. Range validation (0-15%)
        2. Adjacency checks (no huge jumps between maturities)
        3. Spread reasonableness

        Args:
            yields: Dictionary of {maturity: yield_value}

        Returns:
            tuple: (is_valid, list of warning messages)
        """
        warnings = []
        is_valid = True

        # Check 1: Range validation
        for maturity, value in yields.items():
            if value is not None:
                if not self._is_valid_yield(value, maturity):
                    warnings.append(f"{maturity} yield of {value:.2f}% is outside valid range (0-15%)")
                    is_valid = False

        # Check 2: Extreme yield curve inversion (> 3% inverted is suspicious)
        val_2y = yields.get('2Y') or yields.get('3M')
        val_10y = yields.get('10Y')
        if val_2y is not None and val_10y is not None:
            spread = val_10y - val_2y
            if spread < -3:
                warnings.append(
                    f"Yield curve extremely inverted ({spread:.2f}%). "
                    "This is historically rare - verify data source."
                )
                is_valid = False
            elif spread > 4:
                warnings.append(
                    f"Yield curve extremely steep ({spread:.2f}%). "
                    "Unusual - verify data source."
                )

        # Check 3: Adjacency checks
        ordered_maturities = ['1M', '3M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y']
        prev_maturity = None
        prev_value = None
        for mat in ordered_maturities:
            curr_value = yields.get(mat)
            if curr_value is not None:
                if prev_value is not None:
                    diff = abs(curr_value - prev_value)
                    if diff > 3.0:
                        warnings.append(
                            f"Large jump between {prev_maturity} ({prev_value:.2f}%) "
                            f"and {mat} ({curr_value:.2f}%): {diff:.2f}pp"
                        )
                        is_valid = False
                prev_maturity = mat
                prev_value = curr_value

        return is_valid, warnings

    @staticmethod
    def _is_valid_yield(value: float, maturity: str = "") -> bool:
        """Check if a yield value is within reasonable range."""
        if value is None:
            return False
        # US Treasury yields should be between 0% and 15%
        # (even during Volcker era, 10Y peaked at ~15.8%)
        return 0 <= value <= 15

    def _validate_spread(self, spread: float) -> None:
        """Validate yield curve spread and add warnings if suspicious."""
        if spread < -3:
            self._warnings.append(
                f"Yield curve extremely inverted ({spread:.2f}%). "
                "This is historically rare - verify data accuracy."
            )
        elif spread > 4:
            self._warnings.append(
                f"Yield curve extremely steep ({spread:.2f}%). "
                "Unusual - verify data accuracy."
            )


# ============================================================================
# STANDALONE VALIDATION FUNCTIONS (for use without YieldDataFetcher)
# ============================================================================

def validate_treasury_yield(yield_value: float, maturity: str) -> bool:
    """
    Validate a treasury yield value is reasonable.

    Args:
        yield_value: Yield in percentage (e.g., 4.23 for 4.23%)
        maturity: Maturity label (e.g., '2Y', '10Y')

    Returns:
        bool: True if valid

    Raises:
        ValueError: If yield is unreasonable
    """
    if not isinstance(yield_value, (int, float)):
        raise ValueError(f"{maturity} yield must be numeric, got {type(yield_value)}")

    if yield_value < 0 or yield_value > 15:
        raise ValueError(
            f"{maturity} yield of {yield_value}% is outside reasonable range (0-15%). "
            "Check data source and units."
        )

    if maturity in ('3M', '6M', '1Y', '2Y') and yield_value > 12:
        raise ValueError(
            f"{maturity} yield of {yield_value}% is unusually high for short-term rates. "
            "Verify data source is correct."
        )

    return True


def validate_yield_curve_spread(spread: float) -> Tuple[bool, str]:
    """
    Validate yield curve spread is reasonable.

    Args:
        spread: 10Y - 2Y spread in percentage points

    Returns:
        tuple: (is_valid, warning_message or empty string)
    """
    if spread < -3:
        return False, (
            f"Yield curve extremely inverted ({spread:.2f}%). "
            "This is historically rare - verify data accuracy."
        )
    elif spread > 4:
        return True, (
            f"Yield curve extremely steep ({spread:.2f}%). "
            "Unusual but possible - verify data source."
        )
    return True, ""
