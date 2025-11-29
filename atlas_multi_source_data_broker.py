"""
ATLAS TERMINAL v10.0 - MULTI-SOURCE DATA BROKER
================================================

Hybrid Data Broker - Bloomberg Terminal Vibes Without the $24k/Year Price Tag!

This module aggregates price data from 8+ sources with:
- Intelligent fallback (if one source fails, try another)
- Cross-validation (compare prices from multiple sources)
- Confidence scoring (how much do sources agree?)
- Outlier detection (remove bad data)
- Source performance tracking
- Rate limiting per source
- Caching for performance

Data Sources Supported:
1. Yahoo Finance (free, no API key)
2. Alpha Vantage (free tier: 500 calls/day)
3. Financial Modeling Prep (free tier: 250 calls/day)
4. Finnhub (free tier: 60 calls/min)
5. Polygon.io (paid: $29-199/month)
6. IEX Cloud (paid: $9-999/month)
7. Investing.com (web scraping)
8. MarketWatch (web scraping)
"""

import time
import requests
from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import defaultdict
from enum import Enum
import pandas as pd
import numpy as np
import yfinance as yf


# ============================================================================
# DATA SOURCE CONFIGURATION
# ============================================================================

class DataSource(Enum):
    """Enumeration of available data sources."""
    YAHOO_FINANCE = "yahoo_finance"
    ALPHA_VANTAGE = "alpha_vantage"
    FMP = "financial_modeling_prep"
    FINNHUB = "finnhub"
    POLYGON = "polygon"
    IEX_CLOUD = "iex_cloud"
    INVESTING_COM = "investing_com"
    MARKETWATCH = "marketwatch"


@dataclass
class SourceConfig:
    """Configuration for a data source."""
    name: str
    enabled: bool = True
    api_key: Optional[str] = None
    priority: int = 5  # Lower = higher priority
    rate_limit: float = 1.0  # Calls per second
    timeout: int = 10
    requires_api_key: bool = False
    last_call: float = 0.0
    success_count: int = 0
    failure_count: int = 0
    total_latency: float = 0.0


# Initialize data source configurations
DATA_SOURCES = {
    DataSource.YAHOO_FINANCE: SourceConfig(
        name="Yahoo Finance",
        enabled=True,
        priority=1,  # Highest priority - free and reliable
        rate_limit=2.0,
        requires_api_key=False
    ),
    DataSource.ALPHA_VANTAGE: SourceConfig(
        name="Alpha Vantage",
        enabled=True,
        priority=2,
        rate_limit=0.083,  # 5 calls/min on free tier
        requires_api_key=True
    ),
    DataSource.FMP: SourceConfig(
        name="Financial Modeling Prep",
        enabled=True,
        priority=3,
        rate_limit=0.5,
        requires_api_key=True
    ),
    DataSource.FINNHUB: SourceConfig(
        name="Finnhub",
        enabled=False,  # Disabled by default (requires API key)
        priority=4,
        rate_limit=1.0,
        requires_api_key=True
    ),
    DataSource.POLYGON: SourceConfig(
        name="Polygon.io",
        enabled=False,  # Disabled by default (requires paid API key)
        priority=3,
        rate_limit=5.0,
        requires_api_key=True
    ),
    DataSource.IEX_CLOUD: SourceConfig(
        name="IEX Cloud",
        enabled=False,  # Disabled by default (requires API key)
        priority=3,
        rate_limit=1.0,
        requires_api_key=True
    ),
    DataSource.INVESTING_COM: SourceConfig(
        name="Investing.com",
        enabled=False,  # Disabled by default (web scraping, fragile)
        priority=6,
        rate_limit=0.2,  # Be gentle with scraping
        requires_api_key=False
    ),
    DataSource.MARKETWATCH: SourceConfig(
        name="MarketWatch",
        enabled=False,  # Disabled by default (web scraping, fragile)
        priority=6,
        rate_limit=0.2,
        requires_api_key=False
    ),
}


# ============================================================================
# HYBRID DATA BROKER
# ============================================================================

class HybridDataBroker:
    """
    Multi-source data aggregation broker with intelligent fallback and validation.
    """

    def __init__(self, source_configs: Dict[DataSource, SourceConfig] = None):
        """
        Initialize the hybrid data broker.

        Args:
            source_configs: Dictionary of source configurations
        """
        self.sources = source_configs or DATA_SOURCES
        self.cache = {}  # Simple in-memory cache
        self.cache_duration = 15  # Cache duration in seconds

        # Import optional modules
        self._import_optional_sources()

    def _import_optional_sources(self):
        """Import optional data source modules."""
        try:
            from atlas_data_sources import (
                InvestingComScraper, MarketWatchScraper,
                PolygonAPI, IEXCloudAPI, FinnhubAPI
            )
            self.investing_scraper = InvestingComScraper()
            self.marketwatch_scraper = MarketWatchScraper()
            self.has_scrapers = True
        except ImportError:
            self.has_scrapers = False

    def get_live_price(self, ticker: str, use_cache: bool = True) -> Dict:
        """
        Get live price from multiple sources with validation.

        Args:
            ticker: Stock ticker symbol
            use_cache: Whether to use cached data

        Returns:
            Dictionary containing:
            - price: Validated price
            - change: Price change
            - change_pct: Percentage change
            - confidence_score: Confidence in the data (0-100)
            - sources_used: List of sources consulted
            - primary_source: Which source was used for final price
            - is_aggregated: Whether multiple sources were used
            - num_sources: Number of sources that returned data
            - price_mean/median/std: Statistical validation metrics
            - error: Error message if all sources failed
        """
        # Check cache
        cache_key = f"{ticker}_{int(time.time() / self.cache_duration)}"
        if use_cache and cache_key in self.cache:
            return self.cache[cache_key]

        # Get enabled sources sorted by priority
        enabled_sources = [
            (source, config) for source, config in self.sources.items()
            if config.enabled and (not config.requires_api_key or config.api_key)
        ]
        enabled_sources.sort(key=lambda x: x[1].priority)

        # Try each source
        results = []
        sources_tried = []

        for source, config in enabled_sources:
            # Check rate limit
            if not self._check_rate_limit(config):
                continue

            sources_tried.append(config.name)

            # Fetch from source
            start_time = time.time()
            data = self._fetch_from_source(source, ticker, config)
            latency = time.time() - start_time

            if data and not data.get('error'):
                # Update stats
                config.success_count += 1
                config.total_latency += latency
                results.append((config.name, data))
            else:
                config.failure_count += 1

        # No data available
        if not results:
            error_msg = f"All sources failed for {ticker}. Tried: {', '.join(sources_tried)}"
            return {'error': error_msg, 'ticker': ticker}

        # Single source
        if len(results) == 1:
            source_name, data = results[0]
            result = {
                **data,
                'ticker': ticker,
                'confidence_score': 85.0,  # Single source confidence
                'sources_used': [source_name],
                'primary_source': source_name,
                'is_aggregated': False,
                'num_sources': 1
            }
            self.cache[cache_key] = result
            return result

        # Multiple sources - aggregate and validate
        aggregated = self._aggregate_results(ticker, results)
        self.cache[cache_key] = aggregated
        return aggregated

    def _fetch_from_source(self, source: DataSource, ticker: str, config: SourceConfig) -> Optional[Dict]:
        """Fetch data from a specific source."""
        try:
            if source == DataSource.YAHOO_FINANCE:
                return self._fetch_yahoo_finance(ticker)
            elif source == DataSource.ALPHA_VANTAGE:
                return self._fetch_alpha_vantage(ticker, config.api_key)
            elif source == DataSource.FMP:
                return self._fetch_fmp(ticker, config.api_key)
            elif source == DataSource.FINNHUB:
                return self._fetch_finnhub(ticker, config.api_key)
            elif source == DataSource.POLYGON:
                return self._fetch_polygon(ticker, config.api_key)
            elif source == DataSource.IEX_CLOUD:
                return self._fetch_iex_cloud(ticker, config.api_key)
            elif source == DataSource.INVESTING_COM and self.has_scrapers:
                return self.investing_scraper.get_quote(ticker)
            elif source == DataSource.MARKETWATCH and self.has_scrapers:
                return self.marketwatch_scraper.get_quote(ticker)
        except Exception as e:
            return {'error': str(e)}

        return None

    def _fetch_yahoo_finance(self, ticker: str) -> Optional[Dict]:
        """Fetch data from Yahoo Finance."""
        try:
            stock = yf.Ticker(ticker)
            info = stock.info

            # Try different price fields
            price = info.get('currentPrice') or info.get('regularMarketPrice') or info.get('previousClose')

            if not price:
                return None

            change = info.get('regularMarketChange', 0)
            change_pct = info.get('regularMarketChangePercent', 0)

            return {
                'price': float(price),
                'change': float(change),
                'change_pct': float(change_pct),
                'volume': info.get('regularMarketVolume', 0),
                'day_high': info.get('dayHigh', price),
                'day_low': info.get('dayLow', price),
            }
        except Exception as e:
            return {'error': str(e)}

    def _fetch_alpha_vantage(self, ticker: str, api_key: str) -> Optional[Dict]:
        """Fetch data from Alpha Vantage."""
        if not api_key:
            return None

        try:
            url = f"https://www.alphavantage.co/query"
            params = {
                'function': 'GLOBAL_QUOTE',
                'symbol': ticker,
                'apikey': api_key
            }

            response = requests.get(url, params=params, timeout=10)
            data = response.json()

            if 'Global Quote' not in data:
                return None

            quote = data['Global Quote']
            price = float(quote.get('05. price', 0))
            change = float(quote.get('09. change', 0))
            change_pct = float(quote.get('10. change percent', '0').rstrip('%'))

            if price == 0:
                return None

            return {
                'price': price,
                'change': change,
                'change_pct': change_pct,
                'volume': int(quote.get('06. volume', 0)),
                'day_high': float(quote.get('03. high', price)),
                'day_low': float(quote.get('04. low', price)),
            }
        except Exception as e:
            return {'error': str(e)}

    def _fetch_fmp(self, ticker: str, api_key: str) -> Optional[Dict]:
        """Fetch data from Financial Modeling Prep."""
        if not api_key:
            return None

        try:
            url = f"https://financialmodelingprep.com/api/v3/quote/{ticker}"
            params = {'apikey': api_key}

            response = requests.get(url, params=params, timeout=10)
            data = response.json()

            if not data or len(data) == 0:
                return None

            quote = data[0]
            price = float(quote.get('price', 0))

            if price == 0:
                return None

            return {
                'price': price,
                'change': float(quote.get('change', 0)),
                'change_pct': float(quote.get('changesPercentage', 0)),
                'volume': int(quote.get('volume', 0)),
                'day_high': float(quote.get('dayHigh', price)),
                'day_low': float(quote.get('dayLow', price)),
            }
        except Exception as e:
            return {'error': str(e)}

    def _fetch_finnhub(self, ticker: str, api_key: str) -> Optional[Dict]:
        """Fetch data from Finnhub."""
        if not api_key:
            return None

        try:
            url = "https://finnhub.io/api/v1/quote"
            params = {'symbol': ticker, 'token': api_key}

            response = requests.get(url, params=params, timeout=10)
            data = response.json()

            current = data.get('c', 0)
            prev_close = data.get('pc', 0)

            if current == 0 or prev_close == 0:
                return None

            change = current - prev_close
            change_pct = (change / prev_close * 100) if prev_close > 0 else 0

            return {
                'price': float(current),
                'change': float(change),
                'change_pct': float(change_pct),
                'day_high': float(data.get('h', current)),
                'day_low': float(data.get('l', current)),
            }
        except Exception as e:
            return {'error': str(e)}

    def _fetch_polygon(self, ticker: str, api_key: str) -> Optional[Dict]:
        """Fetch data from Polygon.io."""
        if not api_key:
            return None

        try:
            # Get last trade
            url = f"https://api.polygon.io/v2/last/trade/{ticker}"
            params = {'apiKey': api_key}

            response = requests.get(url, params=params, timeout=5)
            data = response.json()

            if data.get('status') != 'OK':
                return None

            results = data.get('results', {})
            price = results.get('p', 0)

            # Get previous close
            prev_close_url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/prev"
            prev_response = requests.get(prev_close_url, params=params, timeout=5)
            prev_data = prev_response.json()

            prev_close = price
            if prev_data.get('status') == 'OK' and prev_data.get('results'):
                prev_close = prev_data['results'][0].get('c', price)

            change = price - prev_close
            change_pct = (change / prev_close * 100) if prev_close > 0 else 0

            return {
                'price': float(price),
                'change': float(change),
                'change_pct': float(change_pct),
                'volume': int(results.get('s', 0)),
            }
        except Exception as e:
            return {'error': str(e)}

    def _fetch_iex_cloud(self, ticker: str, api_key: str) -> Optional[Dict]:
        """Fetch data from IEX Cloud."""
        if not api_key:
            return None

        try:
            url = f"https://cloud.iexapis.com/stable/stock/{ticker}/quote"
            params = {'token': api_key}

            response = requests.get(url, params=params, timeout=5)
            data = response.json()

            price = float(data.get('latestPrice', 0))

            if price == 0:
                return None

            return {
                'price': price,
                'change': float(data.get('change', 0)),
                'change_pct': float(data.get('changePercent', 0) * 100),
                'volume': int(data.get('latestVolume', 0)),
                'day_high': float(data.get('high', price)),
                'day_low': float(data.get('low', price)),
            }
        except Exception as e:
            return {'error': str(e)}

    def _aggregate_results(self, ticker: str, results: List[Tuple[str, Dict]]) -> Dict:
        """Aggregate results from multiple sources with outlier detection."""
        prices = []
        changes = []
        change_pcts = []
        source_names = []
        all_data = []

        for source_name, data in results:
            price = data.get('price', 0)
            if price > 0:
                prices.append(price)
                changes.append(data.get('change', 0))
                change_pcts.append(data.get('change_pct', 0))
                source_names.append(source_name)
                all_data.append(data)

        if not prices:
            return {'error': 'No valid prices found', 'ticker': ticker}

        # Calculate statistics
        prices_array = np.array(prices)
        price_mean = np.mean(prices_array)
        price_median = np.median(prices_array)
        price_std = np.std(prices_array)

        # Remove outliers (beyond 2 standard deviations)
        if len(prices) > 2 and price_std > 0:
            z_scores = np.abs((prices_array - price_mean) / price_std)
            valid_indices = z_scores < 2.0

            if np.any(valid_indices):
                prices_array = prices_array[valid_indices]
                source_names = [s for i, s in enumerate(source_names) if valid_indices[i]]
                all_data = [d for i, d in enumerate(all_data) if valid_indices[i]]

                price_mean = np.mean(prices_array)
                price_median = np.median(prices_array)
                price_std = np.std(prices_array)

        # Calculate confidence score
        # Higher confidence if: more sources, lower std dev, closer to median
        num_sources = len(prices_array)
        source_factor = min(num_sources / 3.0, 1.0) * 40  # Max 40 points for 3+ sources

        # Std dev factor (lower is better)
        if price_mean > 0:
            cv = price_std / price_mean  # Coefficient of variation
            std_factor = max(0, (1 - cv * 10)) * 60  # Max 60 points for low variance
        else:
            std_factor = 0

        confidence_score = min(100, source_factor + std_factor)

        # Use median as final price (more robust to outliers)
        final_price = price_median

        # Find the source closest to median
        closest_idx = np.argmin(np.abs(prices_array - price_median))
        primary_source = source_names[closest_idx]
        primary_data = all_data[closest_idx]

        return {
            'ticker': ticker,
            'price': float(final_price),
            'change': primary_data.get('change', 0),
            'change_pct': primary_data.get('change_pct', 0),
            'confidence_score': float(confidence_score),
            'sources_used': source_names,
            'primary_source': primary_source,
            'is_aggregated': True,
            'num_sources': num_sources,
            'price_mean': float(price_mean),
            'price_median': float(price_median),
            'price_std': float(price_std),
            'volume': primary_data.get('volume', 0),
            'day_high': primary_data.get('day_high', final_price),
            'day_low': primary_data.get('day_low', final_price),
        }

    def _check_rate_limit(self, config: SourceConfig) -> bool:
        """Check if we can make a request to this source."""
        now = time.time()
        time_since_last = now - config.last_call
        min_interval = 1.0 / config.rate_limit

        if time_since_last < min_interval:
            time.sleep(min_interval - time_since_last)

        config.last_call = time.time()
        return True

    def get_source_statistics(self) -> pd.DataFrame:
        """Get performance statistics for all data sources."""
        stats = []

        for source, config in self.sources.items():
            total_calls = config.success_count + config.failure_count
            success_rate = (config.success_count / total_calls * 100) if total_calls > 0 else 0
            avg_latency = (config.total_latency / config.success_count) if config.success_count > 0 else 0

            status = "🟢 Active" if config.enabled else "🔴 Disabled"
            if config.requires_api_key and not config.api_key:
                status = "🟡 No API Key"

            stats.append({
                'Source': config.name,
                'Status': status,
                'Priority': config.priority,
                'Hits': config.success_count,
                'Failures': config.failure_count,
                'Success Rate': f"{success_rate:.1f}%",
                'Avg Latency': f"{avg_latency:.2f}s",
                'Rate Limit': f"{config.rate_limit}/s"
            })

        df = pd.DataFrame(stats)
        df = df.sort_values('Priority')
        return df

    def clear_cache(self):
        """Clear the price cache."""
        self.cache.clear()


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def create_default_broker() -> HybridDataBroker:
    """Create a broker with default configuration."""
    return HybridDataBroker(DATA_SOURCES)


def configure_broker_with_keys(alpha_vantage_key: str = None,
                                fmp_key: str = None,
                                finnhub_key: str = None,
                                polygon_key: str = None,
                                iex_key: str = None) -> HybridDataBroker:
    """Configure broker with API keys."""
    if alpha_vantage_key:
        DATA_SOURCES[DataSource.ALPHA_VANTAGE].api_key = alpha_vantage_key
        DATA_SOURCES[DataSource.ALPHA_VANTAGE].enabled = True

    if fmp_key:
        DATA_SOURCES[DataSource.FMP].api_key = fmp_key
        DATA_SOURCES[DataSource.FMP].enabled = True

    if finnhub_key:
        DATA_SOURCES[DataSource.FINNHUB].api_key = finnhub_key
        DATA_SOURCES[DataSource.FINNHUB].enabled = True

    if polygon_key:
        DATA_SOURCES[DataSource.POLYGON].api_key = polygon_key
        DATA_SOURCES[DataSource.POLYGON].enabled = True

    if iex_key:
        DATA_SOURCES[DataSource.IEX_CLOUD].api_key = iex_key
        DATA_SOURCES[DataSource.IEX_CLOUD].enabled = True

    return HybridDataBroker(DATA_SOURCES)


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

if __name__ == "__main__":
    # Create broker with default config (Yahoo Finance only)
    broker = create_default_broker()

    # Get price for AAPL
    print("Fetching AAPL price...")
    data = broker.get_live_price("AAPL")

    if not data.get('error'):
        print(f"\nTicker: {data['ticker']}")
        print(f"Price: ${data['price']:.2f}")
        print(f"Change: {data['change_pct']:+.2f}%")
        print(f"Confidence: {data.get('confidence_score', 0):.1f}%")
        print(f"Sources: {', '.join(data.get('sources_used', []))}")
        print(f"Primary Source: {data.get('primary_source', 'Unknown')}")
    else:
        print(f"Error: {data['error']}")

    # Show statistics
    print("\n" + "="*60)
    print("DATA SOURCE STATISTICS")
    print("="*60)
    print(broker.get_source_statistics().to_string(index=False))
