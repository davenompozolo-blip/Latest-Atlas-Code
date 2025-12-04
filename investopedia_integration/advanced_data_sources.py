"""
ATLAS TERMINAL v10.0 - ADVANCED DATA SOURCES
=============================================

Additional API wrappers and scrapers for:
- Polygon.io (real-time market data)
- IEX Cloud (exchange data)
- Finnhub (alternative data)
- Investing.com (web scraping with AJAX)
- MarketWatch (enhanced scraping)
- Bloomberg Terminal (placeholder for blpapi)

Use these for enhanced data quality and redundancy.
"""

import requests
from bs4 import BeautifulSoup
import pandas as pd
from datetime import datetime
from typing import Dict, List, Optional
import time
import json
import re


# ===================================================================
# POLYGON.IO API
# ===================================================================

class PolygonAPI:
    """
    Wrapper for Polygon.io API.
    High-quality real-time and historical market data.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.polygon.io"
        self.session = requests.Session()

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get real-time quote for ticker.
        """
        url = f"{self.base_url}/v2/last/trade/{ticker}"
        params = {'apiKey': self.api_key}

        try:
            response = self.session.get(url, params=params, timeout=5)
            data = response.json()

            if data.get('status') == 'OK':
                result = data.get('results', {})
                return {
                    'ticker': ticker,
                    'price': result.get('p'),  # Price
                    'size': result.get('s'),   # Size
                    'exchange': result.get('x'),  # Exchange
                    'timestamp': result.get('t')  # Timestamp
                }
        except Exception as e:
            print(f"Polygon error: {e}")

        return None

    def get_previous_close(self, ticker: str) -> Optional[Dict]:
        """
        Get previous day's close data.
        """
        url = f"{self.base_url}/v2/aggs/ticker/{ticker}/prev"
        params = {'apiKey': self.api_key}

        try:
            response = self.session.get(url, params=params, timeout=5)
            data = response.json()

            if data.get('status') == 'OK':
                results = data.get('results', [])
                if results:
                    result = results[0]
                    return {
                        'ticker': ticker,
                        'open': result.get('o'),
                        'high': result.get('h'),
                        'low': result.get('l'),
                        'close': result.get('c'),
                        'volume': result.get('v'),
                        'timestamp': result.get('t')
                    }
        except Exception as e:
            print(f"Polygon error: {e}")

        return None

    def get_aggregates(self, ticker: str, timespan: str = 'day',
                      multiplier: int = 1, limit: int = 100) -> Optional[pd.DataFrame]:
        """
        Get aggregate bars (OHLCV).

        Args:
            timespan: 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'
            multiplier: Size of timespan (e.g., 1 = 1 day, 5 = 5 days)
        """
        from_date = (datetime.now() - pd.Timedelta(days=365)).strftime('%Y-%m-%d')
        to_date = datetime.now().strftime('%Y-%m-%d')

        url = f"{self.base_url}/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from_date}/{to_date}"
        params = {
            'apiKey': self.api_key,
            'limit': limit
        }

        try:
            response = self.session.get(url, params=params, timeout=10)
            data = response.json()

            if data.get('status') == 'OK':
                results = data.get('results', [])
                if results:
                    df = pd.DataFrame(results)
                    df['timestamp'] = pd.to_datetime(df['t'], unit='ms')
                    df = df.rename(columns={
                        'o': 'open',
                        'h': 'high',
                        'l': 'low',
                        'c': 'close',
                        'v': 'volume'
                    })
                    return df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
        except Exception as e:
            print(f"Polygon error: {e}")

        return None


# ===================================================================
# IEX CLOUD API
# ===================================================================

class IEXCloudAPI:
    """
    Wrapper for IEX Cloud API.
    Exchange data and market information.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://cloud.iexapis.com/stable"
        self.session = requests.Session()

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get real-time quote.
        """
        url = f"{self.base_url}/stock/{ticker}/quote"
        params = {'token': self.api_key}

        try:
            response = self.session.get(url, params=params, timeout=5)
            data = response.json()

            return {
                'ticker': ticker,
                'price': data.get('latestPrice'),
                'change': data.get('change'),
                'change_pct': data.get('changePercent') * 100,
                'volume': data.get('latestVolume'),
                'market_cap': data.get('marketCap'),
                'pe_ratio': data.get('peRatio'),
                'week_52_high': data.get('week52High'),
                'week_52_low': data.get('week52Low')
            }
        except Exception as e:
            print(f"IEX Cloud error: {e}")

        return None

    def get_company_info(self, ticker: str) -> Optional[Dict]:
        """
        Get company information.
        """
        url = f"{self.base_url}/stock/{ticker}/company"
        params = {'token': self.api_key}

        try:
            response = self.session.get(url, params=params, timeout=5)
            return response.json()
        except Exception as e:
            print(f"IEX Cloud error: {e}")

        return None

    def get_historical_prices(self, ticker: str, range_: str = '1m') -> Optional[pd.DataFrame]:
        """
        Get historical prices.

        Args:
            range_: '1d', '5d', '1m', '3m', '6m', '1y', '2y', '5y'
        """
        url = f"{self.base_url}/stock/{ticker}/chart/{range_}"
        params = {'token': self.api_key}

        try:
            response = self.session.get(url, params=params, timeout=10)
            data = response.json()

            if data:
                df = pd.DataFrame(data)
                if 'date' in df.columns:
                    df['date'] = pd.to_datetime(df['date'])
                return df
        except Exception as e:
            print(f"IEX Cloud error: {e}")

        return None


# ===================================================================
# FINNHUB API
# ===================================================================

class FinnhubAPI:
    """
    Wrapper for Finnhub API.
    Alternative real-time data source.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://finnhub.io/api/v1"
        self.session = requests.Session()

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get real-time quote.
        """
        url = f"{self.base_url}/quote"
        params = {
            'symbol': ticker,
            'token': self.api_key
        }

        try:
            response = self.session.get(url, params=params, timeout=5)
            data = response.json()

            return {
                'ticker': ticker,
                'price': data.get('c'),  # Current price
                'change': data.get('d'),  # Change
                'change_pct': data.get('dp'),  # Change percent
                'high': data.get('h'),  # High
                'low': data.get('l'),  # Low
                'open': data.get('o'),  # Open
                'previous_close': data.get('pc'),  # Previous close
                'timestamp': data.get('t')
            }
        except Exception as e:
            print(f"Finnhub error: {e}")

        return None

    def get_company_profile(self, ticker: str) -> Optional[Dict]:
        """
        Get company profile.
        """
        url = f"{self.base_url}/stock/profile2"
        params = {
            'symbol': ticker,
            'token': self.api_key
        }

        try:
            response = self.session.get(url, params=params, timeout=5)
            return response.json()
        except Exception as e:
            print(f"Finnhub error: {e}")

        return None

    def get_recommendation_trends(self, ticker: str) -> Optional[List[Dict]]:
        """
        Get analyst recommendations.
        """
        url = f"{self.base_url}/stock/recommendation"
        params = {
            'symbol': ticker,
            'token': self.api_key
        }

        try:
            response = self.session.get(url, params=params, timeout=5)
            return response.json()
        except Exception as e:
            print(f"Finnhub error: {e}")

        return None


# ===================================================================
# INVESTING.COM SCRAPER (ENHANCED)
# ===================================================================

class InvestingComScraper:
    """
    Enhanced web scraper for Investing.com with AJAX support.
    """

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.investing.com/'
        })

    def search_ticker(self, ticker: str) -> Optional[str]:
        """
        Search for ticker and return Investing.com URL.
        """
        search_url = "https://www.investing.com/search/service/searchTopBar"

        payload = {
            'search_text': ticker,
            'term': ticker,
            'isFilter': False
        }

        try:
            response = self.session.post(search_url, json=payload, timeout=5)
            data = response.json()

            # Look for stock results
            all_results = data.get('All', [])
            for result in all_results:
                if result.get('type') == 'Stock':
                    return result.get('link')
        except Exception as e:
            print(f"Investing.com search error: {e}")

        return None

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get quote by searching for ticker first.
        """
        # Search for ticker URL
        url = self.search_ticker(ticker)

        if not url:
            return None

        # Add domain if relative URL
        if url.startswith('/'):
            url = f"https://www.investing.com{url}"

        try:
            response = self.session.get(url, timeout=5)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Look for price data (selectors may vary)
            price_elem = soup.find('span', {'data-test': 'instrument-price-last'})
            change_elem = soup.find('span', {'data-test': 'instrument-price-change'})

            if price_elem:
                price_text = price_elem.text.strip().replace(',', '')

                result = {
                    'ticker': ticker,
                    'price': float(price_text),
                    'change': None,
                    'change_pct': None
                }

                if change_elem:
                    change_text = change_elem.text.strip()
                    # Parse change (could be "+1.50 (+2.3%)")
                    matches = re.findall(r'([-+]?\d+\.?\d*)', change_text)
                    if len(matches) >= 2:
                        result['change'] = float(matches[0])
                        result['change_pct'] = float(matches[1])

                return result
        except Exception as e:
            print(f"Investing.com scrape error: {e}")

        return None


# ===================================================================
# MARKETWATCH SCRAPER (ENHANCED)
# ===================================================================

class MarketWatchScraper:
    """
    Enhanced web scraper for MarketWatch.
    """

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get quote from MarketWatch.
        """
        url = f"https://www.marketwatch.com/investing/stock/{ticker.lower()}"

        try:
            response = self.session.get(url, timeout=5)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Multiple selector strategies
            price = None
            change = None
            change_pct = None
            volume = None

            # Strategy 1: Look for bg-quote class
            price_elem = soup.find('bg-quote', {'class': 'value'})
            if price_elem:
                price_text = price_elem.text.strip().replace('$', '').replace(',', '')
                price = float(price_text)

            # Strategy 2: Look for intraday__price class
            if not price:
                price_elem = soup.find('h3', {'class': 'intraday__price'})
                if price_elem:
                    price_text = price_elem.find('bg-quote').text.strip() if price_elem.find('bg-quote') else price_elem.text.strip()
                    price_text = price_text.replace('$', '').replace(',', '')
                    price = float(price_text)

            # Look for change
            change_elem = soup.find('bg-quote', {'class': 'change'})
            if change_elem:
                change_text = change_elem.text.strip().replace('$', '').replace(',', '')
                if change_text:
                    change = float(change_text)

            # Look for change percent
            pct_elem = soup.find('bg-quote', {'class': 'percent'})
            if pct_elem:
                pct_text = pct_elem.text.strip().replace('%', '').replace('+', '')
                if pct_text:
                    change_pct = float(pct_text)

            # Look for volume
            volume_elem = soup.find('span', {'class': 'value'}, string=lambda x: x and 'Volume' in str(x))
            if volume_elem:
                volume_text = volume_elem.text.strip().replace(',', '')
                volume = int(float(volume_text))

            if price:
                return {
                    'ticker': ticker,
                    'price': price,
                    'change': change,
                    'change_pct': change_pct,
                    'volume': volume
                }
        except Exception as e:
            print(f"MarketWatch scrape error: {e}")

        return None


# ===================================================================
# BLOOMBERG TERMINAL API (PLACEHOLDER)
# ===================================================================

class BloombergAPI:
    """
    Placeholder for Bloomberg Terminal API integration.

    Requires:
    - Bloomberg Terminal subscription ($24,000/year)
    - blpapi Python package
    - Active Terminal session
    """

    def __init__(self):
        self.available = False

        try:
            import blpapi
            self.available = True
            self.blpapi = blpapi
        except ImportError:
            print("Bloomberg Terminal API not available (blpapi not installed)")

    def get_quote(self, ticker: str) -> Optional[Dict]:
        """
        Get quote from Bloomberg Terminal.

        This is a placeholder - actual implementation would require
        Bloomberg Terminal access and proper authentication.
        """
        if not self.available:
            return None

        # Actual implementation would use blpapi here
        # Example (not functional without Terminal):
        """
        session = self.blpapi.Session()
        session.start()
        session.openService("//blp/refdata")

        refDataService = session.getService("//blp/refdata")
        request = refDataService.createRequest("ReferenceDataRequest")
        request.append("securities", f"{ticker} US Equity")
        request.append("fields", "PX_LAST")

        session.sendRequest(request)
        # ... handle response
        """

        return None


# ===================================================================
# EXAMPLE USAGE
# ===================================================================

if __name__ == "__main__":
    print("="*80)
    print("ATLAS TERMINAL - ADVANCED DATA SOURCES")
    print("="*80)

    print("\nAvailable APIs:")
    print("1. Polygon.io - High-quality real-time data")
    print("2. IEX Cloud - Exchange data")
    print("3. Finnhub - Alternative data source")
    print("4. Investing.com - Web scraping")
    print("5. MarketWatch - Web scraping")
    print("6. Bloomberg Terminal - Requires subscription")

    print("\nUsage:")
    print("polygon = PolygonAPI(api_key='YOUR_KEY')")
    print("quote = polygon.get_quote('AAPL')")

    print("\n" + "="*80)
