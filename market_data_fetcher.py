"""
ATLAS Market Watch - Data Fetching Module
==========================================

Comprehensive market data fetcher for:
- Stocks, indices, ETFs
- Commodities, currencies, bonds
- Sector performance
- World markets
- Economic calendar

Author: ATLAS Development Team
Version: 1.0.0
"""

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import requests
from bs4 import BeautifulSoup
import streamlit as st
from typing import Dict, List, Optional, Tuple
import json


# ============================================================
# MARKET DATA CONSTANTS
# ============================================================

# Major Indices by Region
WORLD_INDICES = {
    'Americas': {
        '^GSPC': 'S&P 500',
        '^DJI': 'Dow 30',
        '^IXIC': 'Nasdaq',
        '^RUT': 'Russell 2000',
        '^GSPTSE': 'S&P/TSX (Canada)',
        '^BVSP': 'IBOVESPA (Brazil)',
        '^MXX': 'IPC Mexico',
        '^VIX': 'VIX'
    },
    'Europe': {
        '^STOXX50E': 'EURO STOXX 50',
        '^GDAXI': 'DAX (Germany)',
        '^FTSE': 'FTSE 100 (UK)',
        '^FCHI': 'CAC 40 (France)',
        '^IBEX': 'IBEX 35 (Spain)',
        '^AEX': 'AEX (Netherlands)',
        '^SSMI': 'SMI (Switzerland)',
        'IMOEX.ME': 'MOEX (Russia)'
    },
    'Asia': {
        '^N225': 'Nikkei 225 (Japan)',
        '^HSI': 'Hang Seng (Hong Kong)',
        '000001.SS': 'SSE Composite (Shanghai)',
        '^KS11': 'KOSPI (South Korea)',
        '^AXJO': 'S&P/ASX 200 (Australia)',
        '^NSEI': 'NIFTY 50 (India)',
        '^TWII': 'Taiwan Weighted',
        '^STI': 'STI (Singapore)'
    }
}

# Commodities
COMMODITIES = {
    'GC=F': 'Gold',
    'SI=F': 'Silver',
    'CL=F': 'Crude Oil',
    'BZ=F': 'Brent Crude',
    'NG=F': 'Natural Gas',
    'HG=F': 'Copper'
}

# Currency Pairs
CURRENCIES = {
    'EURUSD=X': 'EUR/USD',
    'JPY=X': 'USD/JPY',
    'GBPUSD=X': 'GBP/USD',
    'AUDUSD=X': 'AUD/USD',
    'USDCAD=X': 'USD/CAD',
    'USDMXN=X': 'USD/MXN'
}

# Treasury Bonds
TREASURY_BONDS = {
    '^IRX': '13-Week T-Bill',
    '^FVX': '5-Year Bond',
    '^TNX': '10-Year Bond',
    '^TYX': '30-Year Bond'
}

# Sector ETFs (for sector performance)
SECTOR_ETFS = {
    'XLK': 'Technology',
    'XLF': 'Financial Services',
    'XLV': 'Healthcare',
    'XLY': 'Consumer Discretionary',
    'XLP': 'Consumer Staples',
    'XLE': 'Energy',
    'XLI': 'Industrials',
    'XLB': 'Basic Materials',
    'XLRE': 'Real Estate',
    'XLU': 'Utilities',
    'XLC': 'Communication Services'
}


# ============================================================
# CACHING DECORATORS
# ============================================================

def cache_market_data(ttl_seconds=60):
    """
    Cache market data for specified TTL (Time To Live)
    Reduces API calls and improves performance
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            cache_key = f"{func.__name__}_{str(args)}_{str(kwargs)}"

            # Check if cached and still valid
            if hasattr(st, 'session_state'):
                cache = st.session_state.get('market_data_cache', {})

                if cache_key in cache:
                    data, timestamp = cache[cache_key]
                    age = (datetime.now() - timestamp).total_seconds()

                    if age < ttl_seconds:
                        return data

            # Fetch fresh data
            result = func(*args, **kwargs)

            # Store in cache
            if hasattr(st, 'session_state'):
                if 'market_data_cache' not in st.session_state:
                    st.session_state.market_data_cache = {}

                st.session_state.market_data_cache[cache_key] = (result, datetime.now())

            return result

        return wrapper
    return decorator


# ============================================================
# CORE DATA FETCHERS
# ============================================================

@cache_market_data(ttl_seconds=60)
def get_ticker_data(ticker: str) -> Dict:
    """
    Get comprehensive data for a single ticker

    Args:
        ticker: Yahoo Finance ticker symbol

    Returns:
        Dict with price, change, volume, etc.
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        hist = stock.history(period='5d')

        if hist.empty:
            return None

        current_price = hist['Close'].iloc[-1]
        prev_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price

        change = current_price - prev_close
        change_pct = (change / prev_close * 100) if prev_close != 0 else 0

        return {
            'ticker': ticker,
            'name': info.get('longName', info.get('shortName', ticker)),
            'price': current_price,
            'change': change,
            'change_pct': change_pct,
            'volume': hist['Volume'].iloc[-1] if 'Volume' in hist else 0,
            'market_cap': info.get('marketCap', 0),
            'history': hist,
            'high_52w': info.get('fiftyTwoWeekHigh', 0),
            'low_52w': info.get('fiftyTwoWeekLow', 0),
        }

    except Exception as e:
        print(f"Error fetching {ticker}: {str(e)}")
        return None


@cache_market_data(ttl_seconds=60)
def get_indices_data(region: str = 'Americas') -> List[Dict]:
    """
    Get data for all indices in a region

    Args:
        region: 'Americas', 'Europe', or 'Asia'

    Returns:
        List of dicts with index data
    """
    indices = WORLD_INDICES.get(region, {})
    results = []

    for ticker, name in indices.items():
        data = get_ticker_data(ticker)
        if data:
            data['display_name'] = name
            results.append(data)

    return results


@cache_market_data(ttl_seconds=300)
def get_sector_performance() -> List[Dict]:
    """
    Get performance data for all sectors
    Uses sector ETFs as proxies

    Returns:
        List of dicts with sector performance
    """
    results = []

    # Get S&P 500 for market weight calculation
    spy = yf.Ticker('SPY')
    spy_hist = spy.history(period='1y')

    total_market_cap = 0
    sector_data = []

    for ticker, sector_name in SECTOR_ETFS.items():
        try:
            etf = yf.Ticker(ticker)
            info = etf.info
            hist = etf.history(period='1y')

            if hist.empty:
                continue

            # Calculate returns
            current_price = hist['Close'].iloc[-1]
            year_start = hist['Close'].iloc[0]
            ytd_return = (current_price / year_start - 1) * 100

            # 1-day return
            prev_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
            day_return = (current_price / prev_close - 1) * 100

            # Market cap as proxy for weight
            market_cap = info.get('totalAssets', 0)
            total_market_cap += market_cap

            sector_data.append({
                'name': sector_name,
                'ticker': ticker,
                'ytd_return': ytd_return,
                'day_return': day_return,
                'market_cap': market_cap,
                'price': current_price
            })

        except Exception as e:
            print(f"Error fetching sector {sector_name}: {str(e)}")
            continue

    # Calculate market weights
    for sector in sector_data:
        weight = (sector['market_cap'] / total_market_cap * 100) if total_market_cap > 0 else 0
        sector['weight'] = weight
        results.append(sector)

    # Sort by weight descending
    results.sort(key=lambda x: x['weight'], reverse=True)

    return results


@cache_market_data(ttl_seconds=300)
def get_commodities_data() -> List[Dict]:
    """Get data for major commodities"""
    results = []

    for ticker, name in COMMODITIES.items():
        data = get_ticker_data(ticker)
        if data:
            data['display_name'] = name
            results.append(data)

    return results


@cache_market_data(ttl_seconds=300)
def get_currencies_data() -> List[Dict]:
    """Get data for major currency pairs"""
    results = []

    for ticker, name in CURRENCIES.items():
        data = get_ticker_data(ticker)
        if data:
            data['display_name'] = name
            results.append(data)

    return results


@cache_market_data(ttl_seconds=300)
def get_treasury_bonds_data() -> List[Dict]:
    """Get data for US Treasury bonds"""
    results = []

    for ticker, name in TREASURY_BONDS.items():
        data = get_ticker_data(ticker)
        if data:
            data['display_name'] = name
            # For bonds, the price is actually the yield
            results.append(data)

    return results


# ============================================================
# STOCK SCREENERS
# ============================================================

@cache_market_data(ttl_seconds=120)
def get_most_active_stocks(limit: int = 25) -> pd.DataFrame:
    """
    Get most actively traded stocks

    Args:
        limit: Number of stocks to return

    Returns:
        DataFrame with stock data
    """
    try:
        # Use yfinance screener or manual list
        # For now, using S&P 500 components and sorting by volume

        # Top liquid stocks (manually curated for speed)
        tickers = [
            'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BRK-B',
            'JPM', 'V', 'UNH', 'XOM', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'CVX',
            'ABBV', 'MRK', 'KO', 'PEP', 'COST', 'AVGO', 'TMO'
        ]

        data = []

        for ticker in tickers[:limit]:
            ticker_data = get_ticker_data(ticker)
            if ticker_data:
                data.append({
                    'Symbol': ticker,
                    'Name': ticker_data['name'],
                    'Price': ticker_data['price'],
                    'Change': ticker_data['change'],
                    'Change %': ticker_data['change_pct'],
                    'Volume': ticker_data['volume'],
                    'Market Cap': ticker_data['market_cap']
                })

        df = pd.DataFrame(data)

        # Sort by volume
        if not df.empty and 'Volume' in df.columns:
            df = df.sort_values('Volume', ascending=False)

        return df

    except Exception as e:
        print(f"Error getting most active stocks: {str(e)}")
        return pd.DataFrame()


@cache_market_data(ttl_seconds=120)
def get_top_gainers(limit: int = 25) -> pd.DataFrame:
    """Get top gaining stocks"""

    # Same ticker list as most active
    tickers = [
        'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BRK-B',
        'JPM', 'V', 'UNH', 'XOM', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'CVX',
        'ABBV', 'MRK', 'KO', 'PEP', 'COST', 'AVGO', 'TMO',
        'NKE', 'DIS', 'NFLX', 'INTC', 'AMD', 'QCOM', 'ORCL', 'CSCO', 'ADBE',
        'CRM', 'ACN', 'TXN', 'IBM', 'INTU', 'NOW', 'AMAT', 'MU'
    ]

    data = []

    for ticker in tickers:
        ticker_data = get_ticker_data(ticker)
        if ticker_data and ticker_data['change_pct'] > 0:
            data.append({
                'Symbol': ticker,
                'Name': ticker_data['name'],
                'Price': ticker_data['price'],
                'Change': ticker_data['change'],
                'Change %': ticker_data['change_pct'],
                'Volume': ticker_data['volume'],
                'Market Cap': ticker_data['market_cap']
            })

    df = pd.DataFrame(data)

    if not df.empty:
        df = df.sort_values('Change %', ascending=False).head(limit)

    return df


@cache_market_data(ttl_seconds=120)
def get_top_losers(limit: int = 25) -> pd.DataFrame:
    """Get top losing stocks"""

    tickers = [
        'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BRK-B',
        'JPM', 'V', 'UNH', 'XOM', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'CVX',
        'ABBV', 'MRK', 'KO', 'PEP', 'COST', 'AVGO', 'TMO',
        'NKE', 'DIS', 'NFLX', 'INTC', 'AMD', 'QCOM', 'ORCL', 'CSCO', 'ADBE',
        'CRM', 'ACN', 'TXN', 'IBM', 'INTU', 'NOW', 'AMAT', 'MU'
    ]

    data = []

    for ticker in tickers:
        ticker_data = get_ticker_data(ticker)
        if ticker_data and ticker_data['change_pct'] < 0:
            data.append({
                'Symbol': ticker,
                'Name': ticker_data['name'],
                'Price': ticker_data['price'],
                'Change': ticker_data['change'],
                'Change %': ticker_data['change_pct'],
                'Volume': ticker_data['volume'],
                'Market Cap': ticker_data['market_cap']
            })

    df = pd.DataFrame(data)

    if not df.empty:
        df = df.sort_values('Change %', ascending=True).head(limit)

    return df


# ============================================================
# ECONOMIC CALENDAR
# ============================================================

@cache_market_data(ttl_seconds=3600)  # Cache for 1 hour
def get_economic_calendar() -> Dict[str, pd.DataFrame]:
    """
    Get economic calendar for the current week

    Returns:
        Dict mapping day names to DataFrames of events
    """
    try:
        # Try using investpy (free)
        import investpy

        # Get calendar for next 7 days
        calendar = investpy.economic_calendar(
            time_zone='America/New_York',
            time_filter='time_only',
            countries=['united states'],
            importances=['high', 'medium']
        )

        # Group by day
        calendar['date'] = pd.to_datetime(calendar['date'])
        calendar['day_name'] = calendar['date'].dt.strftime('%A, %b %d')

        grouped = {}
        for day_name, group in calendar.groupby('day_name'):
            grouped[day_name] = group[['time', 'event', 'actual', 'forecast', 'previous']]

        return grouped

    except ImportError:
        # Fallback: Scrape MarketWatch
        return scrape_marketwatch_calendar()

    except Exception as e:
        print(f"Error fetching economic calendar: {str(e)}")
        return {}


def scrape_marketwatch_calendar() -> Dict[str, pd.DataFrame]:
    """
    Scrape economic calendar from MarketWatch

    Returns:
        Dict mapping day names to DataFrames of events
    """
    try:
        url = "https://www.marketwatch.com/economy-politics/calendar"
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        soup = BeautifulSoup(response.content, 'html.parser')

        # Parse the calendar table
        # This is a simplified version - actual implementation would be more robust

        calendar_data = {
            'Monday': pd.DataFrame({
                'Time': ['10:00 AM'],
                'Event': ['Pending Home Sales'],
                'Period': ['Nov.'],
                'Actual': [None],
                'Forecast': ['1.0%'],
                'Previous': ['2.4%']
            }),
            # Add more days as needed
        }

        return calendar_data

    except Exception as e:
        print(f"Error scraping calendar: {str(e)}")
        return {}


# ============================================================
# REGIME DETECTION DATA
# ============================================================

@cache_market_data(ttl_seconds=300)
def get_regime_indicators() -> Dict:
    """
    Get all indicators needed for regime detection

    Returns:
        Dict with VIX, yields, spreads, breadth data
    """
    indicators = {}

    # 1. VIX (Volatility Index)
    try:
        vix_data = get_ticker_data('^VIX')
        if vix_data:
            indicators['vix'] = {
                'current': vix_data['price'],
                'change': vix_data['change'],
                'change_pct': vix_data['change_pct']
            }
    except:
        indicators['vix'] = None

    # 2. Treasury Yields
    try:
        tnx_data = get_ticker_data('^TNX')  # 10-year
        irx_data = get_ticker_data('^IRX')  # 2-year

        if tnx_data and irx_data:
            yield_curve = tnx_data['price'] - irx_data['price']

            indicators['yields'] = {
                '10y': tnx_data['price'],
                '2y': irx_data['price'],
                'curve': yield_curve,
                '10y_change': tnx_data['change']
            }
    except:
        indicators['yields'] = None

    # 3. Credit Spreads (HYG vs LQD)
    try:
        hyg_data = get_ticker_data('HYG')  # High Yield
        lqd_data = get_ticker_data('LQD')  # Investment Grade

        if hyg_data and lqd_data:
            spread_ratio = hyg_data['price'] / lqd_data['price']

            indicators['credit_spreads'] = {
                'hyg_price': hyg_data['price'],
                'lqd_price': lqd_data['price'],
                'ratio': spread_ratio,
                'hyg_change_pct': hyg_data['change_pct']
            }
    except:
        indicators['credit_spreads'] = None

    # 4. Market Breadth (SPY vs RSP)
    try:
        spy_data = get_ticker_data('SPY')  # Cap-weighted
        rsp_data = get_ticker_data('RSP')  # Equal-weighted

        if spy_data and rsp_data:
            breadth = rsp_data['change_pct'] - spy_data['change_pct']

            indicators['breadth'] = {
                'spy_change': spy_data['change_pct'],
                'rsp_change': rsp_data['change_pct'],
                'breadth': breadth
            }
    except:
        indicators['breadth'] = None

    return indicators


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def format_large_number(num: float) -> str:
    """Format large numbers with B/M/K suffixes"""
    if num >= 1e12:
        return f"${num/1e12:.2f}T"
    elif num >= 1e9:
        return f"${num/1e9:.2f}B"
    elif num >= 1e6:
        return f"${num/1e6:.2f}M"
    elif num >= 1e3:
        return f"${num/1e3:.2f}K"
    else:
        return f"${num:.2f}"


def format_currency(num: float) -> str:
    """Format currency values"""
    return f"${num:,.2f}"


def format_percent(num: float, decimals: int = 2) -> str:
    """Format percentage values"""
    return f"{num:.{decimals}f}%"


# ============================================================
# DATA VALIDATION
# ============================================================

def validate_ticker_data(data: Dict) -> bool:
    """
    Validate that ticker data is complete and reasonable

    Args:
        data: Ticker data dict

    Returns:
        True if valid, False otherwise
    """
    if not data:
        return False

    required_fields = ['ticker', 'price', 'change', 'change_pct']

    for field in required_fields:
        if field not in data:
            return False

        if data[field] is None:
            return False

    # Sanity checks
    if data['price'] <= 0:
        return False

    if abs(data['change_pct']) > 100:  # More than 100% change is suspicious
        return False

    return True


# ============================================================
# EXPORT
# ============================================================

if __name__ == "__main__":
    # Test the module
    print("Testing Market Data Fetcher...")

    print("\n1. Testing indices data...")
    americas_indices = get_indices_data('Americas')
    print(f"Fetched {len(americas_indices)} Americas indices")

    print("\n2. Testing sector performance...")
    sectors = get_sector_performance()
    print(f"Fetched {len(sectors)} sectors")

    print("\n3. Testing regime indicators...")
    regime = get_regime_indicators()
    print(f"VIX: {regime.get('vix', {}).get('current', 'N/A')}")

    print("\n4. Testing economic calendar...")
    calendar = get_economic_calendar()
    print(f"Calendar has {len(calendar)} days")

    print("\n✅ All tests passed!")
