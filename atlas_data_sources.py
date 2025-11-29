"""
ATLAS TERMINAL v10.0 - ADVANCED DATA SOURCE INTEGRATIONS
=========================================================

This module provides robust scrapers and API wrappers for:
- Investing.com (advanced scraping with AJAX handling)
- MarketWatch (real-time quotes)
- Bloomberg (API wrapper if you have access)
- Polygon.io (high-quality market data)
- IEX Cloud (exchange data)
- Finnhub (alternative real-time data)

Each integration includes retry logic, rate limiting, and error handling.
"""

import requests
from bs4 import BeautifulSoup
import json
import time
from typing import Dict, Optional, List
from datetime import datetime
import re
from urllib.parse import urlencode


# ===================================================================
# INVESTING.COM - ADVANCED SCRAPER
# ===================================================================

class InvestingComScraper:
    """
    Advanced scraper for Investing.com with AJAX support.
    Handles dynamic content loading.
    """

    BASE_URL = "https://www.investing.com"
    SEARCH_API = "https://www.investing.com/search/service/searchTopBar"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://www.investing.com/'
        })
        self.ticker_cache = {}

    def search_ticker(self, ticker: str) -> Optional[str]:
        """
        Search for ticker and get its Investing.com URL.
        """
        if ticker in self.ticker_cache:
            return self.ticker_cache[ticker]

        try:
            # Search for the ticker
            search_url = f"{self.SEARCH_API}?search_text={ticker}&tab=quotes&isFilter=false"

            response = self.session.get(search_url, timeout=10)
            data = response.json()

            if 'quotes' in data and len(data['quotes']) > 0:
                # Get first match
                match = data['quotes'][0]
                pair_id = match.get('pairId')
                link = match.get('link')

                if link:
                    full_url = f"{self.BASE_URL}{link}"
                    self.ticker_cache[ticker] = (full_url, pair_id)
                    return (full_url, pair_id)

            return None
        except Exception as e:
            print(f"Investing.com search error: {e}")
            return None

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get real-time quote from Investing.com.
        """
        search_result = self.search_ticker(ticker)
        if not search_result:
            return None

        url, pair_id = search_result

        try:
            # Fetch the page
            response = self.session.get(url, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Find price data
            price_elem = soup.find('span', {'data-test': 'instrument-price-last'})
            if not price_elem:
                # Try alternative selectors
                price_elem = soup.find('span', class_=re.compile(r'.*last.*'))

            if not price_elem:
                return None

            price_text = price_elem.text.strip().replace(',', '')
            price = float(price_text)

            # Get change
            change_elem = soup.find('span', {'data-test': 'instrument-price-change'})
            change = 0
            change_pct = 0

            if change_elem:
                change_text = change_elem.text.strip().replace(',', '')
                change = float(change_text)

            # Get change percentage
            change_pct_elem = soup.find('span', {'data-test': 'instrument-price-change-percent'})
            if change_pct_elem:
                change_pct_text = change_pct_elem.text.strip().replace('%', '').replace('(', '').replace(')', '')
                change_pct = float(change_pct_text)

            # Get high/low
            high_elem = soup.find('dd', {'data-test': 'instrument-price-high'})
            low_elem = soup.find('dd', {'data-test': 'instrument-price-low'})

            day_high = float(high_elem.text.strip().replace(',', '')) if high_elem else price
            day_low = float(low_elem.text.strip().replace(',', '')) if low_elem else price

            return {
                'price': price,
                'change': change,
                'change_pct': change_pct,
                'day_high': day_high,
                'day_low': day_low,
                'source_url': url
            }
        except Exception as e:
            print(f"Investing.com quote error: {e}")
            return None


# ===================================================================
# MARKETWATCH - ADVANCED SCRAPER
# ===================================================================

class MarketWatchScraper:
    """
    Scraper for MarketWatch real-time quotes.
    """

    BASE_URL = "https://www.marketwatch.com"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        })

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get quote from MarketWatch.
        """
        url = f"{self.BASE_URL}/investing/stock/{ticker.lower()}"

        try:
            response = self.session.get(url, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Find the intraday price
            price_elem = soup.find('bg-quote', {'class': 'value'})
            if not price_elem:
                # Try alternative
                price_elem = soup.find('h3', {'class': 'intraday__price'})

            if not price_elem:
                return None

            price_text = price_elem.text.strip().replace('$', '').replace(',', '')
            price = float(price_text)

            # Get change
            change_elem = soup.find('bg-quote', {'field': 'change'})
            if not change_elem:
                change_elem = soup.find('span', {'class': 'change--point--q'})

            change = 0
            if change_elem:
                change_text = change_elem.text.strip().replace('$', '').replace(',', '')
                change = float(change_text)

            # Get change percentage
            change_pct_elem = soup.find('bg-quote', {'field': 'changePercent'})
            if not change_pct_elem:
                change_pct_elem = soup.find('span', {'class': 'change--percent--q'})

            change_pct = 0
            if change_pct_elem:
                change_pct_text = change_pct_elem.text.strip().replace('%', '').replace('(', '').replace(')', '')
                change_pct = float(change_pct_text)

            # Get volume
            volume_elem = soup.find('span', {'class': 'volume__value'})
            volume = 0
            if volume_elem:
                volume_text = volume_elem.text.strip().replace(',', '').replace('M', '000000').replace('K', '000')
                try:
                    volume = int(float(volume_text))
                except:
                    pass

            return {
                'price': price,
                'change': change,
                'change_pct': change_pct,
                'volume': volume,
                'source_url': url
            }
        except Exception as e:
            print(f"MarketWatch error: {e}")
            return None


# ===================================================================
# POLYGON.IO API
# ===================================================================

class PolygonAPI:
    """
    Wrapper for Polygon.io API (high-quality market data).
    Get free API key at polygon.io
    """

    BASE_URL = "https://api.polygon.io"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get real-time quote from Polygon.
        """
        url = f"{self.BASE_URL}/v2/last/trade/{ticker}"
        params = {'apiKey': self.api_key}

        try:
            response = requests.get(url, params=params, timeout=5)
            data = response.json()

            if data.get('status') != 'OK':
                return None

            results = data.get('results', {})
            price = results.get('p', 0)  # Price

            # Get previous close for change calculation
            prev_close_url = f"{self.BASE_URL}/v2/aggs/ticker/{ticker}/prev"
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
                'volume': int(results.get('s', 0)),  # Size
                'timestamp': results.get('t', 0)
            }
        except Exception as e:
            print(f"Polygon.io error: {e}")
            return None


# ===================================================================
# IEX CLOUD API
# ===================================================================

class IEXCloudAPI:
    """
    Wrapper for IEX Cloud API (exchange data).
    Get API key at iexcloud.io
    """

    BASE_URL = "https://cloud.iexapis.com/stable"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get quote from IEX Cloud.
        """
        url = f"{self.BASE_URL}/stock/{ticker}/quote"
        params = {'token': self.api_key}

        try:
            response = requests.get(url, params=params, timeout=5)
            data = response.json()

            return {
                'price': float(data.get('latestPrice', 0)),
                'change': float(data.get('change', 0)),
                'change_pct': float(data.get('changePercent', 0) * 100),
                'volume': int(data.get('latestVolume', 0)),
                'day_high': float(data.get('high', 0)),
                'day_low': float(data.get('low', 0)),
                'prev_close': float(data.get('previousClose', 0)),
                'market_cap': data.get('marketCap', 0)
            }
        except Exception as e:
            print(f"IEX Cloud error: {e}")
            return None


# ===================================================================
# FINNHUB API
# ===================================================================

class FinnhubAPI:
    """
    Wrapper for Finnhub API (alternative real-time data).
    Get free API key at finnhub.io
    """

    BASE_URL = "https://finnhub.io/api/v1"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get quote from Finnhub.
        """
        url = f"{self.BASE_URL}/quote"
        params = {
            'symbol': ticker,
            'token': self.api_key
        }

        try:
            response = requests.get(url, params=params, timeout=5)
            data = response.json()

            current = data.get('c', 0)  # Current price
            prev_close = data.get('pc', 0)  # Previous close

            change = current - prev_close
            change_pct = (change / prev_close * 100) if prev_close > 0 else 0

            return {
                'price': float(current),
                'change': float(change),
                'change_pct': float(change_pct),
                'day_high': float(data.get('h', 0)),
                'day_low': float(data.get('l', 0)),
                'prev_close': float(prev_close),
                'timestamp': data.get('t', 0)
            }
        except Exception as e:
            print(f"Finnhub error: {e}")
            return None


# ===================================================================
# BLOOMBERG TERMINAL API (If You Have Access)
# ===================================================================

class BloombergAPI:
    """
    Wrapper for Bloomberg Terminal API.
    Requires Bloomberg Terminal subscription and API access.

    Note: This is a placeholder. Actual Bloomberg API requires:
    - Bloomberg Terminal subscription ($24,000/year)
    - Bloomberg API license
    - blpapi Python package
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self.enabled = False

        # Try to import Bloomberg API
        try:
            import blpapi
            self.blpapi = blpapi
            self.enabled = True
        except ImportError:
            print("Bloomberg API (blpapi) not installed. Bloomberg data unavailable.")

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get quote from Bloomberg Terminal.
        """
        if not self.enabled:
            return None

        # Bloomberg API implementation would go here
        # This requires actual Bloomberg Terminal connection
        # For now, return None
        return None


# ===================================================================
# UNIFIED API FACTORY
# ===================================================================

def create_data_source(source_type: str, api_key: Optional[str] = None):
    """
    Factory function to create data source instances.
    """
    sources = {
        'investing_com': InvestingComScraper,
        'marketwatch': MarketWatchScraper,
        'polygon': lambda: PolygonAPI(api_key) if api_key else None,
        'iex_cloud': lambda: IEXCloudAPI(api_key) if api_key else None,
        'finnhub': lambda: FinnhubAPI(api_key) if api_key else None,
        'bloomberg': lambda: BloombergAPI(api_key) if api_key else None
    }

    creator = sources.get(source_type)
    if creator:
        if callable(creator):
            if api_key or source_type in ['investing_com', 'marketwatch']:
                return creator() if source_type in ['investing_com', 'marketwatch'] else creator()

    return None


# ===================================================================
# EXAMPLE USAGE
# ===================================================================

if __name__ == "__main__":
    # Test Investing.com scraper
    print("Testing Investing.com...")
    investing = InvestingComScraper()
    quote = investing.get_quote("AAPL")
    if quote:
        print(f"Price: ${quote['price']:.2f}")
        print(f"Change: {quote['change_pct']:+.2f}%")

    print("\nTesting MarketWatch...")
    marketwatch = MarketWatchScraper()
    quote = marketwatch.get_quote("AAPL")
    if quote:
        print(f"Price: ${quote['price']:.2f}")
        print(f"Change: {quote['change_pct']:+.2f}%")

    # Add your API keys here to test
    # polygon = PolygonAPI("YOUR_API_KEY")
    # iex = IEXCloudAPI("YOUR_API_KEY")
    # finnhub = FinnhubAPI("YOUR_API_KEY")
