"""
ATLAS Terminal - FRED API Data Service
Fetches macroeconomic data from the Federal Reserve Economic Data API.
Provides cached access to CPI, GDP, PMI, yields, credit spreads, and more.
"""

import json
import time
import sqlite3
import requests
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Optional, List, Any

import streamlit as st


# =============================================================================
# CONFIGURATION
# =============================================================================

FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations"
FRED_CACHE_DIR = Path("data/fred_cache")
FRED_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Default cache TTL: 6 hours for economic data
DEFAULT_CACHE_TTL = 6 * 60 * 60

# Key FRED series IDs for macro intelligence
FRED_SERIES = {
    # Inflation
    'cpi_headline': 'CPIAUCSL',       # CPI All Urban Consumers
    'cpi_core': 'CPILFESL',           # CPI Less Food and Energy
    'pce': 'PCEPI',                   # PCE Price Index
    'ppi': 'PPIACO',                  # PPI All Commodities
    'breakeven_5y': 'T5YIE',          # 5-Year Breakeven Inflation
    'breakeven_10y': 'T10YIE',        # 10-Year Breakeven Inflation

    # Growth
    'gdp': 'GDP',                      # Gross Domestic Product
    'gdp_real': 'GDPC1',              # Real GDP
    'pmi_mfg': 'MANEMP',              # Manufacturing Employment (proxy)
    'retail_sales': 'RSXFS',          # Retail Sales Ex Food Services
    'industrial_prod': 'INDPRO',      # Industrial Production Index
    'nonfarm_payrolls': 'PAYEMS',     # Total Nonfarm Payrolls
    'unemployment': 'UNRATE',         # Unemployment Rate
    'initial_claims': 'ICSA',         # Initial Jobless Claims

    # Yields & Rates
    'fed_funds': 'FEDFUNDS',          # Federal Funds Rate
    'treasury_3m': 'DGS3MO',         # 3-Month Treasury
    'treasury_2y': 'DGS2',            # 2-Year Treasury
    'treasury_5y': 'DGS5',            # 5-Year Treasury
    'treasury_10y': 'DGS10',          # 10-Year Treasury
    'treasury_30y': 'DGS30',          # 30-Year Treasury
    'tips_10y': 'DFII10',             # 10-Year TIPS

    # Credit
    'ig_spread': 'BAMLC0A4CBBB',     # BBB Corporate Spread
    'hy_spread': 'BAMLH0A0HYM2',     # High Yield Spread
    'ted_spread': 'TEDRATE',          # TED Spread

    # Liquidity / Money Supply
    'm2': 'M2SL',                      # M2 Money Stock
    'monetary_base': 'BOGMBASE',      # Monetary Base

    # Financial Conditions
    'nfci': 'NFCI',                   # Chicago Fed National Financial Conditions Index
}

# Display-friendly labels
SERIES_LABELS = {
    'cpi_headline': 'CPI (Headline)',
    'cpi_core': 'CPI (Core)',
    'pce': 'PCE Price Index',
    'ppi': 'PPI All Commodities',
    'breakeven_5y': '5Y Breakeven Inflation',
    'breakeven_10y': '10Y Breakeven Inflation',
    'gdp': 'GDP (Nominal)',
    'gdp_real': 'GDP (Real)',
    'retail_sales': 'Retail Sales',
    'industrial_prod': 'Industrial Production',
    'nonfarm_payrolls': 'Nonfarm Payrolls',
    'unemployment': 'Unemployment Rate',
    'initial_claims': 'Initial Claims',
    'fed_funds': 'Fed Funds Rate',
    'treasury_3m': '3M Treasury',
    'treasury_2y': '2Y Treasury',
    'treasury_5y': '5Y Treasury',
    'treasury_10y': '10Y Treasury',
    'treasury_30y': '30Y Treasury',
    'tips_10y': '10Y TIPS (Real)',
    'ig_spread': 'IG Credit Spread',
    'hy_spread': 'HY Credit Spread',
    'ted_spread': 'TED Spread',
    'm2': 'M2 Money Supply',
    'monetary_base': 'Monetary Base',
    'nfci': 'Financial Conditions Index',
}


class FREDCache:
    """SQLite-backed cache for FRED data."""

    def __init__(self, db_path: str = None):
        if db_path is None:
            db_path = str(FRED_CACHE_DIR / "fred_cache.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS fred_cache (
                    series_id TEXT PRIMARY KEY,
                    data TEXT,
                    fetched_at REAL
                )
            """)
            conn.commit()
            conn.close()
        except Exception:
            pass

    def get(self, series_id: str, ttl: int = DEFAULT_CACHE_TTL) -> Optional[pd.DataFrame]:
        try:
            conn = sqlite3.connect(self.db_path)
            row = conn.execute(
                "SELECT data, fetched_at FROM fred_cache WHERE series_id = ?",
                (series_id,)
            ).fetchone()
            conn.close()

            if row is None:
                return None

            data_json, fetched_at = row
            if time.time() - fetched_at > ttl:
                return None

            return pd.read_json(data_json, orient='records')
        except Exception:
            return None

    def set(self, series_id: str, df: pd.DataFrame):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.execute(
                "INSERT OR REPLACE INTO fred_cache (series_id, data, fetched_at) VALUES (?, ?, ?)",
                (series_id, df.to_json(orient='records', date_format='iso'), time.time())
            )
            conn.commit()
            conn.close()
        except Exception:
            pass


class FREDDataService:
    """
    Fetches and caches macroeconomic data from FRED.
    Falls back to yfinance proxies when FRED API key is not configured.
    """

    def __init__(self):
        self.api_key = self._get_api_key()
        self.cache = FREDCache()

    def _get_api_key(self) -> Optional[str]:
        """Try multiple sources for the FRED API key."""
        import os
        key = os.environ.get('FRED_API_KEY')
        if key:
            return key
        try:
            key = st.secrets.get('FRED_API_KEY')
            if key:
                return key
        except Exception:
            pass
        return None

    @property
    def available(self) -> bool:
        return self.api_key is not None

    def fetch_series(
        self,
        series_key: str,
        start_date: str = None,
        end_date: str = None,
        ttl: int = DEFAULT_CACHE_TTL
    ) -> Optional[pd.DataFrame]:
        """
        Fetch a FRED series by its friendly key name.

        Args:
            series_key: Key from FRED_SERIES dict (e.g. 'cpi_headline')
            start_date: Start date (YYYY-MM-DD), defaults to 5 years ago
            end_date: End date (YYYY-MM-DD), defaults to today
            ttl: Cache time-to-live in seconds

        Returns:
            DataFrame with columns ['date', 'value'] or None on failure
        """
        series_id = FRED_SERIES.get(series_key, series_key)

        # Try cache first
        cache_key = f"{series_id}_{start_date}_{end_date}"
        cached = self.cache.get(cache_key, ttl=ttl)
        if cached is not None and len(cached) > 0:
            return cached

        # Set defaults
        if start_date is None:
            start_date = (datetime.now() - timedelta(days=5 * 365)).strftime('%Y-%m-%d')
        if end_date is None:
            end_date = datetime.now().strftime('%Y-%m-%d')

        # Try FRED API
        if self.api_key:
            df = self._fetch_from_fred(series_id, start_date, end_date)
            if df is not None and len(df) > 0:
                self.cache.set(cache_key, df)
                return df

        # Fallback: try yfinance for yield/market data
        df = self._fetch_fallback(series_key)
        if df is not None and len(df) > 0:
            self.cache.set(cache_key, df)
            return df

        return None

    def _fetch_from_fred(
        self, series_id: str, start_date: str, end_date: str
    ) -> Optional[pd.DataFrame]:
        """Direct FRED API call."""
        try:
            params = {
                'series_id': series_id,
                'api_key': self.api_key,
                'file_type': 'json',
                'observation_start': start_date,
                'observation_end': end_date,
                'sort_order': 'asc',
            }
            resp = requests.get(FRED_BASE_URL, params=params, timeout=15)
            if resp.status_code != 200:
                return None

            data = resp.json()
            observations = data.get('observations', [])
            if not observations:
                return None

            records = []
            for obs in observations:
                try:
                    val = float(obs['value'])
                    records.append({
                        'date': pd.to_datetime(obs['date']),
                        'value': val
                    })
                except (ValueError, KeyError):
                    continue

            return pd.DataFrame(records)
        except Exception:
            return None

    def _fetch_fallback(self, series_key: str) -> Optional[pd.DataFrame]:
        """Fallback using yfinance for yield/market data."""
        try:
            import yfinance as yf

            yf_mapping = {
                'treasury_10y': '^TNX',
                'treasury_5y': '^FVX',
                'treasury_30y': '^TYX',
                'treasury_2y': None,  # no yfinance equivalent
            }

            ticker = yf_mapping.get(series_key)
            if ticker is None:
                return None

            data = yf.Ticker(ticker).history(period='5y')
            if data.empty:
                return None

            df = pd.DataFrame({
                'date': data.index,
                'value': data['Close'].values
            })
            df['date'] = pd.to_datetime(df['date']).dt.tz_localize(None)
            return df

        except Exception:
            return None

    def get_yield_curve(self) -> Dict[str, float]:
        """
        Get the current yield curve snapshot.

        Returns:
            Dict mapping tenor labels to yields.
        """
        tenors = {
            '3M': 'treasury_3m',
            '2Y': 'treasury_2y',
            '5Y': 'treasury_5y',
            '10Y': 'treasury_10y',
            '30Y': 'treasury_30y',
        }

        curve = {}
        for label, key in tenors.items():
            df = self.fetch_series(key)
            if df is not None and len(df) > 0:
                curve[label] = df['value'].iloc[-1]

        return curve

    def get_2s10s_spread(self) -> Optional[pd.DataFrame]:
        """Get the 2Y-10Y Treasury spread time series."""
        df_2y = self.fetch_series('treasury_2y')
        df_10y = self.fetch_series('treasury_10y')

        if df_2y is None or df_10y is None:
            return None

        merged = pd.merge(df_2y, df_10y, on='date', suffixes=('_2y', '_10y'))
        merged['spread'] = merged['value_10y'] - merged['value_2y']
        return merged[['date', 'spread', 'value_2y', 'value_10y']]

    def get_inflation_dashboard(self) -> Dict[str, Any]:
        """Get inflation data package for macro dashboard."""
        result = {}
        for key in ['cpi_headline', 'cpi_core', 'pce', 'ppi']:
            df = self.fetch_series(key)
            if df is not None and len(df) > 0:
                latest = df['value'].iloc[-1]
                prev_month = df['value'].iloc[-2] if len(df) > 1 else latest
                prev_year = df['value'].iloc[-13] if len(df) > 13 else latest

                mom_change = ((latest / prev_month) - 1) * 100 if prev_month != 0 else 0
                yoy_change = ((latest / prev_year) - 1) * 100 if prev_year != 0 else 0

                result[key] = {
                    'latest': latest,
                    'mom': mom_change,
                    'yoy': yoy_change,
                    'label': SERIES_LABELS.get(key, key),
                    'series': df,
                }

        return result

    def get_growth_dashboard(self) -> Dict[str, Any]:
        """Get growth data package for macro dashboard."""
        result = {}
        for key in ['gdp_real', 'nonfarm_payrolls', 'unemployment', 'retail_sales', 'industrial_prod', 'initial_claims']:
            df = self.fetch_series(key)
            if df is not None and len(df) > 0:
                latest = df['value'].iloc[-1]
                prev = df['value'].iloc[-2] if len(df) > 1 else latest
                change = ((latest / prev) - 1) * 100 if prev != 0 else 0

                result[key] = {
                    'latest': latest,
                    'change': change,
                    'label': SERIES_LABELS.get(key, key),
                    'series': df,
                }

        return result

    def get_credit_data(self) -> Dict[str, Any]:
        """Get credit spread data."""
        result = {}
        for key in ['ig_spread', 'hy_spread']:
            df = self.fetch_series(key)
            if df is not None and len(df) > 0:
                latest = df['value'].iloc[-1]
                avg_1y = df['value'].tail(252).mean() if len(df) > 252 else df['value'].mean()

                result[key] = {
                    'latest': latest,
                    'avg_1y': avg_1y,
                    'z_score': (latest - avg_1y) / df['value'].tail(252).std() if len(df) > 252 else 0,
                    'label': SERIES_LABELS.get(key, key),
                    'series': df,
                }

        return result

    def get_liquidity_dashboard(self) -> Dict[str, Any]:
        """Get liquidity data package (M2, monetary base) for macro dashboard."""
        result = {}
        for key in ['m2', 'monetary_base']:
            df = self.fetch_series(key)
            if df is not None and len(df) > 0:
                latest = df['value'].iloc[-1]
                prev_month = df['value'].iloc[-2] if len(df) > 1 else latest
                prev_year = df['value'].iloc[-13] if len(df) > 13 else latest

                mom_change = ((latest / prev_month) - 1) * 100 if prev_month != 0 else 0
                yoy_change = ((latest / prev_year) - 1) * 100 if prev_year != 0 else 0

                result[key] = {
                    'latest': latest,
                    'mom': mom_change,
                    'yoy': yoy_change,
                    'label': SERIES_LABELS.get(key, key),
                    'series': df,
                }

        return result


# Singleton instance
fred_service = FREDDataService()
