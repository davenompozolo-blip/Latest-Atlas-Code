"""
ATLAS TERMINAL v10.0 - MULTI-SOURCE DATA BROKER
================================================

Intelligent data aggregation from 8+ sources:
1. Bloomberg Terminal API (if available)
2. Alpha Vantage
3. Yahoo Finance
4. Financial Modeling Prep
5. Polygon.io
6. IEX Cloud
7. Investing.com (web scraping)
8. MarketWatch (web scraping)

Features:
- Priority-based fallback
- Cross-validation
- Confidence scoring
- Outlier detection
- Rate limiting

This is hybrid data broker meets institutional platform! 🔥
"""

import requests
from bs4 import BeautifulSoup
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import time
import yfinance as yf


# ===================================================================
# DATA SOURCE CONFIGURATION
# ===================================================================

class DataSource(Enum):
    """Available data sources"""
    BLOOMBERG = "Bloomberg Terminal"
    ALPHA_VANTAGE = "Alpha Vantage"
    YAHOO_FINANCE = "Yahoo Finance"
    FMP = "Financial Modeling Prep"
    POLYGON = "Polygon.io"
    IEX_CLOUD = "IEX Cloud"
    INVESTING_COM = "Investing.com"
    MARKETWATCH = "MarketWatch"


@dataclass
class SourceConfig:
    """Configuration for each data source"""
    name: str
    priority: int  # Lower = higher priority
    enabled: bool
    requires_api_key: bool
    api_key: Optional[str] = None
    rate_limit: float = 1.0  # Requests per second
    last_request: float = 0.0


# Default configuration
DATA_SOURCES = {
    DataSource.BLOOMBERG: SourceConfig(
        name="Bloomberg Terminal",
        priority=1,
        enabled=False,  # Requires $24k/year subscription
        requires_api_key=True,
        api_key=None
    ),
    DataSource.ALPHA_VANTAGE: SourceConfig(
        name="Alpha Vantage",
        priority=2,
        enabled=True,
        requires_api_key=True,
        api_key=None,  # Free tier: 5 calls/min
        rate_limit=0.2  # 5 per minute = 1 per 12 seconds
    ),
    DataSource.YAHOO_FINANCE: SourceConfig(
        name="Yahoo Finance",
        priority=3,
        enabled=True,
        requires_api_key=False,
        rate_limit=1.0
    ),
    DataSource.FMP: SourceConfig(
        name="Financial Modeling Prep",
        priority=4,
        enabled=True,
        requires_api_key=True,
        api_key=None,  # Free tier: 250 calls/day
        rate_limit=0.5
    ),
    DataSource.POLYGON: SourceConfig(
        name="Polygon.io",
        priority=5,
        enabled=False,
        requires_api_key=True,
        api_key=None
    ),
    DataSource.IEX_CLOUD: SourceConfig(
        name="IEX Cloud",
        priority=6,
        enabled=False,
        requires_api_key=True,
        api_key=None
    ),
    DataSource.INVESTING_COM: SourceConfig(
        name="Investing.com",
        priority=7,
        enabled=True,
        requires_api_key=False,
        rate_limit=0.5  # Be gentle with scraping
    ),
    DataSource.MARKETWATCH: SourceConfig(
        name="MarketWatch",
        priority=8,
        enabled=True,
        requires_api_key=False,
        rate_limit=0.5
    )
}


# ===================================================================
# HYBRID DATA BROKER
# ===================================================================

class HybridDataBroker:
    """
    Intelligent multi-source data aggregator.

    Fetches data from multiple sources, validates, and aggregates
    with confidence scoring.
    """

    def __init__(self, source_configs: Dict[DataSource, SourceConfig]):
        self.sources = source_configs
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

        # Performance tracking
        self.stats = {
            source: {'hits': 0, 'misses': 0, 'errors': 0}
            for source in DataSource
        }

    def get_live_price(self, ticker: str) -> Dict:
        """
        Get live price from multiple sources with intelligent aggregation.

        Returns:
            {
                'ticker': str,
                'price': float,
                'change': float,
                'change_pct': float,
                'volume': int,
                'primary_source': str,
                'sources_used': List[str],
                'num_sources': int,
                'price_mean': float,
                'price_median': float,
                'price_std': float,
                'confidence_score': float,  # 0-100
                'timestamp': datetime,
                'is_aggregated': bool
            }
        """
        # Get enabled sources sorted by priority
        enabled_sources = [
            (source, config) for source, config in self.sources.items()
            if config.enabled and (not config.requires_api_key or config.api_key)
        ]
        enabled_sources.sort(key=lambda x: x[1].priority)

        # Fetch from all sources
        results = []

        for source, config in enabled_sources:
            # Rate limiting
            time_since_last = time.time() - config.last_request
            if time_since_last < (1.0 / config.rate_limit):
                time.sleep((1.0 / config.rate_limit) - time_since_last)

            try:
                data = self._fetch_from_source(source, ticker)
                if data:
                    results.append({
                        'source': source,
                        'data': data
                    })
                    self.stats[source]['hits'] += 1
                else:
                    self.stats[source]['misses'] += 1
            except Exception as e:
                self.stats[source]['errors'] += 1

            config.last_request = time.time()

        # Aggregate results
        if not results:
            return {
                'ticker': ticker,
                'error': 'No data available from any source',
                'success': False
            }

        return self._aggregate_price_data(results, ticker)

    def _fetch_from_source(self, source: DataSource, ticker: str) -> Optional[Dict]:
        """
        Fetch data from a specific source.
        """
        if source == DataSource.YAHOO_FINANCE:
            return self._fetch_yahoo_finance(ticker)
        elif source == DataSource.ALPHA_VANTAGE:
            return self._fetch_alpha_vantage(ticker)
        elif source == DataSource.FMP:
            return self._fetch_fmp(ticker)
        elif source == DataSource.INVESTING_COM:
            return self._fetch_investing_com(ticker)
        elif source == DataSource.MARKETWATCH:
            return self._fetch_marketwatch(ticker)
        elif source == DataSource.BLOOMBERG:
            return self._fetch_bloomberg(ticker)
        elif source == DataSource.POLYGON:
            return self._fetch_polygon(ticker)
        elif source == DataSource.IEX_CLOUD:
            return self._fetch_iex_cloud(ticker)

        return None

    def _fetch_yahoo_finance(self, ticker: str) -> Optional[Dict]:
        """Fetch from Yahoo Finance using yfinance"""
        try:
            stock = yf.Ticker(ticker)
            info = stock.info

            return {
                'price': info.get('currentPrice') or info.get('regularMarketPrice'),
                'change': info.get('regularMarketChange'),
                'change_pct': info.get('regularMarketChangePercent'),
                'volume': info.get('regularMarketVolume')
            }
        except:
            return None

    def _fetch_alpha_vantage(self, ticker: str) -> Optional[Dict]:
        """Fetch from Alpha Vantage API"""
        api_key = self.sources[DataSource.ALPHA_VANTAGE].api_key
        if not api_key:
            return None

        try:
            url = f"https://www.alphavantage.co/query"
            params = {
                'function': 'GLOBAL_QUOTE',
                'symbol': ticker,
                'apikey': api_key
            }

            response = self.session.get(url, params=params, timeout=5)
            data = response.json()

            quote = data.get('Global Quote', {})

            if not quote:
                return None

            return {
                'price': float(quote.get('05. price', 0)),
                'change': float(quote.get('09. change', 0)),
                'change_pct': float(quote.get('10. change percent', '0').replace('%', '')),
                'volume': int(quote.get('06. volume', 0))
            }
        except:
            return None

    def _fetch_fmp(self, ticker: str) -> Optional[Dict]:
        """Fetch from Financial Modeling Prep"""
        api_key = self.sources[DataSource.FMP].api_key
        if not api_key:
            return None

        try:
            url = f"https://financialmodelingprep.com/api/v3/quote/{ticker}"
            params = {'apikey': api_key}

            response = self.session.get(url, params=params, timeout=5)
            data = response.json()

            if not data or len(data) == 0:
                return None

            quote = data[0]

            return {
                'price': quote.get('price'),
                'change': quote.get('change'),
                'change_pct': quote.get('changesPercentage'),
                'volume': quote.get('volume')
            }
        except:
            return None

    def _fetch_investing_com(self, ticker: str) -> Optional[Dict]:
        """Fetch from Investing.com via web scraping"""
        try:
            # This is a simplified scraper - actual implementation would need
            # to search for the ticker first to get the proper URL
            url = f"https://www.investing.com/search/?q={ticker}"
            response = self.session.get(url, timeout=5)

            # Parse with BeautifulSoup
            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for price data (simplified - actual selectors vary)
            price_elem = soup.find('span', {'data-test': 'instrument-price-last'})

            if price_elem:
                price_text = price_elem.text.strip().replace(',', '')
                return {
                    'price': float(price_text),
                    'change': None,
                    'change_pct': None,
                    'volume': None
                }
        except:
            pass

        return None

    def _fetch_marketwatch(self, ticker: str) -> Optional[Dict]:
        """Fetch from MarketWatch via web scraping"""
        try:
            url = f"https://www.marketwatch.com/investing/stock/{ticker.lower()}"
            response = self.session.get(url, timeout=5)

            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for price (simplified - actual selectors may vary)
            price_elem = soup.find('bg-quote', {'class': 'value'})

            if price_elem:
                return {
                    'price': float(price_elem.text.strip().replace('$', '').replace(',', '')),
                    'change': None,
                    'change_pct': None,
                    'volume': None
                }
        except:
            pass

        return None

    def _fetch_bloomberg(self, ticker: str) -> Optional[Dict]:
        """
        Fetch from Bloomberg Terminal (requires blpapi package and subscription).
        This is a placeholder - actual implementation requires Bloomberg Terminal.
        """
        # Would require: pip install blpapi
        # And active Bloomberg Terminal subscription ($24k/year)
        return None

    def _fetch_polygon(self, ticker: str) -> Optional[Dict]:
        """Fetch from Polygon.io"""
        api_key = self.sources[DataSource.POLYGON].api_key
        if not api_key:
            return None

        try:
            url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/prev"
            params = {'apiKey': api_key}

            response = self.session.get(url, params=params, timeout=5)
            data = response.json()

            if data.get('status') != 'OK':
                return None

            results = data.get('results', [])
            if not results:
                return None

            quote = results[0]

            return {
                'price': quote.get('c'),  # Close price
                'change': None,
                'change_pct': None,
                'volume': quote.get('v')
            }
        except:
            return None

    def _fetch_iex_cloud(self, ticker: str) -> Optional[Dict]:
        """Fetch from IEX Cloud"""
        api_key = self.sources[DataSource.IEX_CLOUD].api_key
        if not api_key:
            return None

        try:
            url = f"https://cloud.iexapis.com/stable/stock/{ticker}/quote"
            params = {'token': api_key}

            response = self.session.get(url, params=params, timeout=5)
            data = response.json()

            return {
                'price': data.get('latestPrice'),
                'change': data.get('change'),
                'change_pct': data.get('changePercent') * 100,
                'volume': data.get('latestVolume')
            }
        except:
            return None

    def _aggregate_price_data(self, results: List[Dict], ticker: str) -> Dict:
        """
        Aggregate data from multiple sources with validation.
        """
        if len(results) == 1:
            # Single source - return as is
            source_name = self.sources[results[0]['source']].name
            data = results[0]['data']

            return {
                'ticker': ticker,
                'price': data.get('price'),
                'change': data.get('change'),
                'change_pct': data.get('change_pct'),
                'volume': data.get('volume'),
                'primary_source': source_name,
                'sources_used': [source_name],
                'num_sources': 1,
                'confidence_score': 80,  # Single source = 80% confidence
                'timestamp': datetime.now(),
                'is_aggregated': False
            }

        # Multiple sources - aggregate with validation
        prices = [r['data']['price'] for r in results if r['data'].get('price')]

        if not prices:
            return {'ticker': ticker, 'error': 'No valid prices', 'success': False}

        # Calculate statistics
        price_mean = np.mean(prices)
        price_median = np.median(prices)
        price_std = np.std(prices)

        # Outlier detection (2 standard deviations)
        valid_prices = [p for p in prices if abs(p - price_mean) <= 2 * price_std]

        if valid_prices:
            final_price = np.median(valid_prices)
        else:
            final_price = price_median

        # Confidence score (100 = perfect agreement, lower = more variance)
        if price_std == 0:
            confidence = 100
        else:
            cv = price_std / price_mean  # Coefficient of variation
            confidence = max(0, min(100, 100 * (1 - cv * 10)))

        # Get primary source (highest priority with valid data)
        primary_source = self.sources[results[0]['source']].name
        sources_used = [self.sources[r['source']].name for r in results]

        return {
            'ticker': ticker,
            'price': final_price,
            'change': results[0]['data'].get('change'),  # From primary source
            'change_pct': results[0]['data'].get('change_pct'),
            'volume': results[0]['data'].get('volume'),
            'primary_source': primary_source,
            'sources_used': sources_used,
            'num_sources': len(results),
            'price_mean': price_mean,
            'price_median': price_median,
            'price_std': price_std,
            'confidence_score': confidence,
            'timestamp': datetime.now(),
            'is_aggregated': True
        }

    def get_source_statistics(self) -> pd.DataFrame:
        """
        Get performance statistics for all sources.
        """
        stats_list = []

        for source, stats in self.stats.items():
            total = stats['hits'] + stats['misses'] + stats['errors']
            success_rate = (stats['hits'] / total * 100) if total > 0 else 0

            stats_list.append({
                'Source': self.sources[source].name,
                'Priority': self.sources[source].priority,
                'Enabled': self.sources[source].enabled,
                'Hits': stats['hits'],
                'Misses': stats['misses'],
                'Errors': stats['errors'],
                'Success Rate (%)': f"{success_rate:.1f}"
            })

        return pd.DataFrame(stats_list).sort_values('Priority')


# ===================================================================
# EXAMPLE USAGE
# ===================================================================

if __name__ == "__main__":
    print("="*80)
    print("ATLAS TERMINAL - MULTI-SOURCE DATA BROKER")
    print("="*80)

    # Initialize broker
    broker = HybridDataBroker(DATA_SOURCES)

    # Test with a ticker
    ticker = "AAPL"
    print(f"\n🔍 Fetching data for {ticker}...")

    result = broker.get_live_price(ticker)

    if result.get('success', True):
        print(f"\n✅ Success!")
        print(f"   Price: ${result['price']:.2f}")
        print(f"   Primary Source: {result['primary_source']}")
        print(f"   Sources Used: {', '.join(result['sources_used'])}")
        print(f"   Confidence: {result['confidence_score']:.0f}%")

        if result['is_aggregated']:
            print(f"\n📊 Aggregation Stats:")
            print(f"   Mean: ${result['price_mean']:.2f}")
            print(f"   Median: ${result['price_median']:.2f}")
            print(f"   Std Dev: ${result['price_std']:.2f}")
    else:
        print(f"\n❌ Failed: {result.get('error')}")

    # Show source statistics
    print("\n📈 Source Performance:")
    print(broker.get_source_statistics().to_string(index=False))

    print("\n" + "="*80)
