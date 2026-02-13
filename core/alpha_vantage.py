"""
ATLAS Terminal - Alpha Vantage API Integration
==============================================

Professional market data integration with aggressive caching
optimized for the free tier (25 requests/day).

Installation:
    pip install requests  # Already in requirements.txt

Usage:
    from core.alpha_vantage import av_client

    # Get top movers (cached 1 hour)
    gainers, losers = av_client.get_top_movers()

    # Get company financials (cached 24 hours)
    overview = av_client.get_company_overview('AAPL')
    income = av_client.get_income_statement('AAPL')

Environment:
    Set ALPHA_VANTAGE_API_KEY in environment or Streamlit secrets

Author: ATLAS Terminal Team
License: MIT
"""

import os
import json
import time
import hashlib
import sqlite3
import requests
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Dict, Optional, Tuple, Any

import streamlit as st


# =============================================================================
# CONFIGURATION
# =============================================================================

# API Configuration
BASE_URL = "https://www.alphavantage.co/query"
FREE_TIER_DAILY_LIMIT = 25
FREE_TIER_MINUTE_LIMIT = 5  # 5 calls per minute on free tier
DISABLE_ENV_VAR = "ALPHA_VANTAGE_DISABLED"

# Cache durations (in seconds)
CACHE_DURATIONS = {
    'listing_status': 7 * 24 * 60 * 60,    # 7 days - stock universe rarely changes
    'top_movers': 1 * 60 * 60,              # 1 hour - movers change throughout day
    'company_overview': 24 * 60 * 60,       # 24 hours - fundamentals are stable
    'income_statement': 24 * 60 * 60,       # 24 hours
    'balance_sheet': 24 * 60 * 60,          # 24 hours
    'cash_flow': 24 * 60 * 60,              # 24 hours
    'earnings': 24 * 60 * 60,               # 24 hours
    'earnings_calendar': 12 * 60 * 60,      # 12 hours
    'news_sentiment': 30 * 60,              # 30 minutes
    'economic_indicator': 24 * 60 * 60,     # 24 hours - GDP, inflation, etc.
    'default': 60 * 60,                     # 1 hour fallback
}

# Cache directory
CACHE_DIR = Path("data/alpha_vantage_cache")


# =============================================================================
# CACHE IMPLEMENTATION
# =============================================================================

class AlphaVantageCache:
    """
    SQLite-backed cache with TTL support.
    Survives app restarts, extremely disk-efficient.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or CACHE_DIR / "av_cache.db"
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        """Initialize SQLite database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY,
                    data TEXT,
                    created_at REAL,
                    ttl_seconds INTEGER
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS api_usage (
                    date TEXT PRIMARY KEY,
                    call_count INTEGER DEFAULT 0
                )
            """)
            conn.commit()

    def _get_cache_key(self, endpoint: str, params: Dict) -> str:
        """Generate unique cache key from endpoint and params."""
        param_str = json.dumps(params, sort_keys=True)
        return hashlib.md5(f"{endpoint}:{param_str}".encode()).hexdigest()

    def get(self, endpoint: str, params: Dict) -> Optional[Any]:
        """Get cached data if valid, None if expired or missing."""
        key = self._get_cache_key(endpoint, params)

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT data, created_at, ttl_seconds FROM cache WHERE key = ?",
                (key,)
            )
            row = cursor.fetchone()

            if row is None:
                return None

            data, created_at, ttl = row
            if time.time() - created_at > ttl:
                # Expired
                conn.execute("DELETE FROM cache WHERE key = ?", (key,))
                conn.commit()
                return None

            return json.loads(data)

    def set(self, endpoint: str, params: Dict, data: Any, ttl: Optional[int] = None):
        """Store data in cache with TTL."""
        key = self._get_cache_key(endpoint, params)
        ttl = ttl or CACHE_DURATIONS.get(endpoint, CACHE_DURATIONS['default'])

        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO cache (key, data, created_at, ttl_seconds)
                VALUES (?, ?, ?, ?)
            """, (key, json.dumps(data), time.time(), ttl))
            conn.commit()

    def get_today_usage(self) -> int:
        """Get API call count for today."""
        today = datetime.now().strftime("%Y-%m-%d")

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT call_count FROM api_usage WHERE date = ?",
                (today,)
            )
            row = cursor.fetchone()
            return row[0] if row else 0

    def increment_usage(self):
        """Increment today's API call count."""
        today = datetime.now().strftime("%Y-%m-%d")

        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO api_usage (date, call_count) VALUES (?, 1)
                ON CONFLICT(date) DO UPDATE SET call_count = call_count + 1
            """, (today,))
            conn.commit()

    def clear_expired(self):
        """Remove all expired cache entries."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                DELETE FROM cache WHERE (? - created_at) > ttl_seconds
            """, (time.time(),))
            conn.commit()

    def clear_all(self):
        """Clear entire cache."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM cache")
            conn.commit()

    def get_cache_stats(self) -> Dict:
        """Get cache statistics."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT COUNT(*), SUM(LENGTH(data)) FROM cache")
            count, size = cursor.fetchone()

            cursor = conn.execute(
                "SELECT call_count FROM api_usage WHERE date = ?",
                (datetime.now().strftime("%Y-%m-%d"),)
            )
            row = cursor.fetchone()
            today_calls = row[0] if row else 0

            return {
                'cached_items': count or 0,
                'cache_size_kb': (size or 0) / 1024,
                'api_calls_today': today_calls,
                'daily_limit': FREE_TIER_DAILY_LIMIT,
                'calls_remaining': FREE_TIER_DAILY_LIMIT - today_calls,
            }


# =============================================================================
# MAIN CLIENT
# =============================================================================

class AlphaVantageClient:
    """
    Alpha Vantage API client with aggressive caching for free tier.

    Features:
    - SQLite-backed persistent cache
    - Automatic TTL management
    - Daily usage tracking
    - Graceful degradation when limit reached
    - Rate limiting (5 calls/minute on free tier)
    """

    def __init__(self, api_key: Optional[str] = None, enabled: Optional[bool] = None):
        """
        Initialize client.

        Args:
            api_key: Alpha Vantage API key. If None, reads from:
                     1. ALPHA_VANTAGE_API_KEY env var
                     2. Streamlit secrets (st.secrets["ALPHA_VANTAGE_API_KEY"])
        """
        self.enabled = enabled if enabled is not None else self._is_enabled()
        self.api_key = api_key or self._get_api_key()
        self.cache = AlphaVantageCache()
        self._last_call_time = 0
        self._min_call_interval = 12  # seconds between calls (5/min = 12s interval)

    def _is_enabled(self) -> bool:
        """Allow an explicit environment-based kill switch."""
        return os.environ.get(DISABLE_ENV_VAR, "").strip().lower() not in {"1", "true", "yes", "on"}

    def _get_api_key(self) -> Optional[str]:
        """Get API key — tries every known secrets pattern."""
        # Pattern 1: Nested [api_keys] section (Hlobo's structure)
        try:
            key = st.secrets["api_keys"]["alpha_vantage"]
            if key:
                return key
        except Exception:
            pass

        # Pattern 2: Flat key
        try:
            key = st.secrets.get("ALPHA_VANTAGE_API_KEY")
            if key:
                return key
        except Exception:
            pass

        # Pattern 3: Flat lowercase
        try:
            key = st.secrets.get("alpha_vantage_api_key")
            if key:
                return key
        except Exception:
            pass

        # Pattern 4: Nested with different key name
        try:
            key = st.secrets["api_keys"]["ALPHA_VANTAGE_API_KEY"]
            if key:
                return key
        except Exception:
            pass

        # Pattern 5: Environment variable
        return os.getenv("ALPHA_VANTAGE_API_KEY")

    @property
    def is_configured(self) -> bool:
        """Check if API key is configured."""
        return self.api_key is not None

    @staticmethod
    def _sanitise_ticker(ticker: str) -> str:
        """Normalise ticker to plain format expected by Alpha Vantage US endpoints."""
        if not ticker:
            return ticker
        ticker = ticker.strip().upper()
        # Remove exchange suffixes (e.g., .US, .LON, .FRA)
        if '.' in ticker:
            base, suffix = ticker.split('.', 1)
            if suffix.isalpha() and len(suffix) <= 3:
                return base
        return ticker

    def _rate_limit(self):
        """Enforce rate limiting (5 calls/minute on free tier)."""
        elapsed = time.time() - self._last_call_time
        if elapsed < self._min_call_interval:
            time.sleep(self._min_call_interval - elapsed)
        self._last_call_time = time.time()

    def _call_api(
        self,
        function: str,
        params: Optional[Dict] = None,
        cache_key: Optional[str] = None
    ) -> Optional[Dict]:
        """
        Make API call with caching and rate limiting.

        Args:
            function: Alpha Vantage function name
            params: Additional API parameters
            cache_key: Override cache key type for TTL lookup

        Returns:
            API response data or None if error/limit reached
        """
        if not self.enabled:
            return None

        if not self.is_configured:
            st.warning("⚠️ Alpha Vantage API key not configured")
            return None

        params = params or {}
        full_params = {
            'function': function,
            'apikey': self.api_key,
            **params
        }

        # Determine cache key type
        cache_type = cache_key or function.lower()

        # Check cache first
        cached = self.cache.get(cache_type, params)
        if cached is not None:
            return cached

        # Check daily limit
        usage = self.cache.get_today_usage()
        if usage >= FREE_TIER_DAILY_LIMIT:
            st.warning(f"⚠️ Daily API limit reached ({FREE_TIER_DAILY_LIMIT} calls). Using cached data.")
            return None

        # Rate limit
        self._rate_limit()

        # Make API call
        try:
            response = requests.get(BASE_URL, params=full_params, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Check for API error messages
            if 'Error Message' in data:
                st.error(f"Alpha Vantage Error: {data['Error Message']}")
                return None

            if 'Note' in data:  # Rate limit warning
                st.warning(f"Alpha Vantage: {data['Note']}")
                return None

            # Success - cache and return
            self.cache.increment_usage()
            self.cache.set(cache_type, params, data)

            return data

        except requests.exceptions.RequestException as e:
            st.error(f"API request failed: {e}")
            return None
        except json.JSONDecodeError:
            st.error("Invalid API response")
            return None

    # =========================================================================
    # MARKET DATA ENDPOINTS
    # =========================================================================

    def get_top_movers(self) -> Optional[Dict[str, pd.DataFrame]]:
        """
        Get top gainers, losers, and most active stocks.

        Returns:
            Dict with keys 'top_gainers', 'top_losers', 'most_actively_traded',
            each containing a DataFrame. Returns None if API call fails.

        Cache: 1 hour
        API calls: 1
        """
        data = self._call_api('TOP_GAINERS_LOSERS', cache_key='top_movers')

        if data is None:
            return None

        def parse_movers(key: str) -> pd.DataFrame:
            items = data.get(key, [])
            if not items:
                return pd.DataFrame()

            df = pd.DataFrame(items)

            for col in ['price', 'change_amount', 'volume']:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce')

            if 'change_percentage' in df.columns:
                df['change_percentage'] = df['change_percentage'].astype(str).str.replace('%', '')
                df['change_percentage'] = pd.to_numeric(df['change_percentage'], errors='coerce')

            return df

        return {
            'top_gainers': parse_movers('top_gainers'),
            'top_losers': parse_movers('top_losers'),
            'most_actively_traded': parse_movers('most_actively_traded'),
        }

    def get_listing_status(self, status: str = 'active') -> pd.DataFrame:
        """
        Get list of all listed stocks.

        Args:
            status: 'active' or 'delisted'

        Returns:
            DataFrame with columns: symbol, name, exchange, assetType,
                                   ipoDate, delistingDate, status

        Cache: 7 days
        API calls: 1
        """
        data = self._call_api(
            'LISTING_STATUS',
            {'state': status},
            cache_key='listing_status'
        )

        if data is None:
            return pd.DataFrame()

        # This endpoint returns CSV, not JSON
        # Need to handle differently
        try:
            params = {
                'function': 'LISTING_STATUS',
                'state': status,
                'apikey': self.api_key
            }

            # Check cache
            cached = self.cache.get('listing_status', {'state': status})
            if cached is not None:
                return pd.DataFrame(cached)

            # Check limit
            if self.cache.get_today_usage() >= FREE_TIER_DAILY_LIMIT:
                return pd.DataFrame()

            self._rate_limit()

            response = requests.get(BASE_URL, params=params, timeout=30)

            if response.status_code == 200:
                from io import StringIO
                df = pd.read_csv(StringIO(response.text))

                # Cache as list of dicts
                self.cache.increment_usage()
                self.cache.set('listing_status', {'state': status}, df.to_dict('records'))

                return df

        except Exception as e:
            st.error(f"Failed to fetch listing status: {e}")

        return pd.DataFrame()

    def get_quote(self, symbol: str) -> Optional[Dict]:
        """Get real-time quote for a symbol. Cache: 5 minutes."""
        symbol = self._sanitise_ticker(symbol)
        data = self._call_api(
            'GLOBAL_QUOTE',
            {'symbol': symbol},
            cache_key='quote'
        )

        if data is None or 'Global Quote' not in data:
            return None

        quote = data['Global Quote']
        return {
            'symbol': quote.get('01. symbol'),
            'price': float(quote.get('05. price', 0)),
            'change': float(quote.get('09. change', 0)),
            'change_pct': quote.get('10. change percent', '0%').replace('%', ''),
            'volume': int(quote.get('06. volume', 0)),
            'latest_trading_day': quote.get('07. latest trading day'),
        }

    # =========================================================================
    # FUNDAMENTAL DATA ENDPOINTS
    # =========================================================================

    def get_company_overview(self, symbol: str) -> Optional[Dict]:
        """Get company fundamentals and key metrics. Cache: 24 hours."""
        symbol = self._sanitise_ticker(symbol)
        data = self._call_api(
            'OVERVIEW',
            {'symbol': symbol},
            cache_key='company_overview'
        )

        if data is None or 'Symbol' not in data:
            return None

        numeric_fields = [
            'MarketCapitalization', 'EBITDA', 'PERatio', 'PEGRatio',
            'BookValue', 'DividendPerShare', 'DividendYield', 'EPS',
            'RevenuePerShareTTM', 'ProfitMargin', 'OperatingMarginTTM',
            'ReturnOnAssetsTTM', 'ReturnOnEquityTTM', 'RevenueTTM',
            'GrossProfitTTM', 'Beta', '52WeekHigh', '52WeekLow',
            '50DayMovingAverage', '200DayMovingAverage', 'SharesOutstanding',
            'SharesFloat', 'SharesShort', 'AnalystTargetPrice'
        ]

        for field in numeric_fields:
            if field in data and data[field] not in (None, 'None', '-'):
                try:
                    data[field] = float(data[field])
                except (ValueError, TypeError):
                    data[field] = None

        return data

    def get_income_statement(self, symbol: str, annual: bool = True) -> pd.DataFrame:
        """Get income statement data. Cache: 24 hours."""
        symbol = self._sanitise_ticker(symbol)
        data = self._call_api(
            'INCOME_STATEMENT',
            {'symbol': symbol},
            cache_key='income_statement'
        )

        if data is None:
            return pd.DataFrame()

        key = 'annualReports' if annual else 'quarterlyReports'
        reports = data.get(key, [])

        if not reports:
            return pd.DataFrame()

        df = pd.DataFrame(reports)
        for col in df.columns:
            if col not in ['fiscalDateEnding', 'reportedCurrency']:
                df[col] = pd.to_numeric(df[col], errors='coerce')

        return df

    def get_balance_sheet(self, symbol: str, annual: bool = True) -> pd.DataFrame:
        """Get balance sheet data. Cache: 24 hours."""
        symbol = self._sanitise_ticker(symbol)
        data = self._call_api(
            'BALANCE_SHEET',
            {'symbol': symbol},
            cache_key='balance_sheet'
        )

        if data is None:
            return pd.DataFrame()

        key = 'annualReports' if annual else 'quarterlyReports'
        reports = data.get(key, [])

        if not reports:
            return pd.DataFrame()

        df = pd.DataFrame(reports)
        for col in df.columns:
            if col not in ['fiscalDateEnding', 'reportedCurrency']:
                df[col] = pd.to_numeric(df[col], errors='coerce')

        return df

    def get_cash_flow(self, symbol: str, annual: bool = True) -> pd.DataFrame:
        """Get cash flow statement data. Cache: 24 hours."""
        symbol = self._sanitise_ticker(symbol)
        data = self._call_api(
            'CASH_FLOW',
            {'symbol': symbol},
            cache_key='cash_flow'
        )

        if data is None:
            return pd.DataFrame()

        key = 'annualReports' if annual else 'quarterlyReports'
        reports = data.get(key, [])

        if not reports:
            return pd.DataFrame()

        df = pd.DataFrame(reports)
        for col in df.columns:
            if col not in ['fiscalDateEnding', 'reportedCurrency']:
                df[col] = pd.to_numeric(df[col], errors='coerce')

        return df

    def get_earnings(self, symbol: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Get earnings history and estimates. Cache: 24 hours."""
        symbol = self._sanitise_ticker(symbol)
        data = self._call_api(
            'EARNINGS',
            {'symbol': symbol},
            cache_key='earnings'
        )

        if data is None:
            return pd.DataFrame(), pd.DataFrame()

        annual = pd.DataFrame(data.get('annualEarnings', []))
        quarterly = pd.DataFrame(data.get('quarterlyEarnings', []))

        for df in [annual, quarterly]:
            for col in df.columns:
                if col not in ['fiscalDateEnding', 'reportedDate']:
                    df[col] = pd.to_numeric(df[col], errors='coerce')

        return annual, quarterly

    def get_earnings_calendar(self, horizon: str = '3month') -> pd.DataFrame:
        """Get upcoming earnings announcements. Cache: 12 hours."""
        cached = self.cache.get('earnings_calendar', {'horizon': horizon})
        if cached is not None:
            return pd.DataFrame(cached)

        if not self.is_configured or self.cache.get_today_usage() >= FREE_TIER_DAILY_LIMIT:
            return pd.DataFrame()

        try:
            self._rate_limit()
            params = {
                'function': 'EARNINGS_CALENDAR',
                'horizon': horizon,
                'apikey': self.api_key
            }
            response = requests.get(BASE_URL, params=params, timeout=30)

            if response.status_code == 200:
                from io import StringIO
                df = pd.read_csv(StringIO(response.text))

                self.cache.increment_usage()
                self.cache.set('earnings_calendar', {'horizon': horizon}, df.to_dict('records'))
                return df

        except Exception as e:
            st.error(f"Failed to fetch earnings calendar: {e}")

        return pd.DataFrame()

    # =========================================================================
    # ECONOMIC INDICATORS
    # =========================================================================

    def get_economic_indicator(self, indicator: str) -> pd.DataFrame:
        """Get economic indicator data (GDP, CPI, etc.). Cache: 24 hours."""
        data = self._call_api(indicator, {}, cache_key='economic_indicator')

        if data is None or 'data' not in data:
            return pd.DataFrame()

        df = pd.DataFrame(data['data'])
        df['value'] = pd.to_numeric(df['value'], errors='coerce')
        df['date'] = pd.to_datetime(df['date'])

        return df.sort_values('date', ascending=False)

    # =========================================================================
    # NEWS & SENTIMENT
    # =========================================================================

    def get_news_sentiment(
        self,
        tickers: Optional[str] = None,
        topics: Optional[str] = None,
        limit: int = 50
    ) -> pd.DataFrame:
        """Get news with AI sentiment analysis. Cache: 30 minutes."""
        params = {'limit': limit}
        if tickers:
            params['tickers'] = tickers
        if topics:
            params['topics'] = topics

        data = self._call_api('NEWS_SENTIMENT', params, cache_key='news_sentiment')

        if data is None or 'feed' not in data:
            return pd.DataFrame()

        articles = []
        for item in data['feed']:
            articles.append({
                'title': item.get('title'),
                'url': item.get('url'),
                'source': item.get('source'),
                'published': item.get('time_published'),
                'summary': item.get('summary'),
                'sentiment_score': item.get('overall_sentiment_score'),
                'sentiment_label': item.get('overall_sentiment_label'),
                'tickers': [t['ticker'] for t in item.get('ticker_sentiment', [])],
            })

        return pd.DataFrame(articles)

    # =========================================================================
    # CONVENIENCE METHODS
    # =========================================================================

    def get_full_financials(self, symbol: str) -> Dict[str, Any]:
        """Get all financial data for a company. Cache: 24 hours per endpoint. API calls: Up to 4."""
        symbol = self._sanitise_ticker(symbol)
        return {
            'overview': self.get_company_overview(symbol),
            'income_statement': self.get_income_statement(symbol),
            'balance_sheet': self.get_balance_sheet(symbol),
            'cash_flow': self.get_cash_flow(symbol),
        }

    def get_dcf_inputs(self, symbol: str) -> Optional[Dict]:
        """Get key inputs for DCF valuation. Cache: 24 hours. API calls: Up to 3."""
        symbol = self._sanitise_ticker(symbol)
        overview = self.get_company_overview(symbol)
        income = self.get_income_statement(symbol)
        cash_flow = self.get_cash_flow(symbol)

        if overview is None:
            return None

        # Convenience aliases used by UI
        revenue = overview.get('RevenueTTM') or 0
        ebitda = overview.get('EBITDA') or 0
        profit_margin = overview.get('ProfitMargin') or 0
        net_income = revenue * profit_margin if revenue and profit_margin else 0

        # Compute revenue growth from income history
        revenue_growth = 0.0
        if not income.empty and 'totalRevenue' in income.columns and len(income) >= 2:
            rev_curr = income['totalRevenue'].iloc[0]
            rev_prev = income['totalRevenue'].iloc[1]
            if rev_prev and rev_prev != 0:
                revenue_growth = (rev_curr - rev_prev) / abs(rev_prev)

        # Compute free cash flow from cash flow statement
        free_cash_flow = 0
        if not cash_flow.empty:
            op_cf = cash_flow['operatingCashflow'].iloc[0] if 'operatingCashflow' in cash_flow.columns else 0
            capex = cash_flow['capitalExpenditures'].iloc[0] if 'capitalExpenditures' in cash_flow.columns else 0
            op_cf = op_cf if pd.notna(op_cf) else 0
            capex = capex if pd.notna(capex) else 0
            free_cash_flow = op_cf - abs(capex)

        result = {
            'symbol': symbol,
            'name': overview.get('Name'),
            'sector': overview.get('Sector'),
            'industry': overview.get('Industry'),
            'market_cap': overview.get('MarketCapitalization') or 0,
            'shares_outstanding': overview.get('SharesOutstanding') or 0,
            'beta': overview.get('Beta') or 1.0,
            'pe_ratio': overview.get('PERatio'),
            'peg_ratio': overview.get('PEGRatio'),
            'dividend_yield': overview.get('DividendYield'),
            'profit_margin': profit_margin,
            'operating_margin': overview.get('OperatingMarginTTM') or 0,
            'roe': overview.get('ReturnOnEquityTTM'),
            'revenue_ttm': revenue,
            'revenue': revenue,
            'ebitda': ebitda,
            'net_income': net_income,
            'free_cash_flow': free_cash_flow,
            'revenue_growth': revenue_growth,
            'eps': overview.get('EPS'),
            'book_value': overview.get('BookValue'),
            'target_price': overview.get('AnalystTargetPrice'),
        }

        if not income.empty:
            cols = [c for c in ['fiscalDateEnding', 'totalRevenue'] if c in income.columns]
            if cols:
                result['revenue_history'] = income[cols].head(5).to_dict('records')
            cols = [c for c in ['fiscalDateEnding', 'operatingIncome'] if c in income.columns]
            if cols:
                result['operating_income_history'] = income[cols].head(5).to_dict('records')

        if not cash_flow.empty:
            cols = [c for c in ['fiscalDateEnding', 'operatingCashflow', 'capitalExpenditures'] if c in cash_flow.columns]
            if cols:
                result['fcf_history'] = cash_flow[cols].head(5).to_dict('records')

        return result

    def get_usage_stats(self) -> Dict:
        """Get current API usage statistics."""
        return self.cache.get_cache_stats()


# =============================================================================
# SINGLETON CLIENT INSTANCE
# =============================================================================

_client_instance = None

def get_client() -> AlphaVantageClient:
    """Get or create the Alpha Vantage client singleton."""
    global _client_instance
    if _client_instance is None:
        _client_instance = AlphaVantageClient()
    return _client_instance

av_client = get_client()


# Module-level availability flag — True if this module loaded successfully
ALPHA_VANTAGE_AVAILABLE = True

__all__ = [
    'AlphaVantageClient',
    'AlphaVantageCache',
    'get_client',
    'av_client',
    'FREE_TIER_DAILY_LIMIT',
    'CACHE_DURATIONS',
    'ALPHA_VANTAGE_AVAILABLE',
]
