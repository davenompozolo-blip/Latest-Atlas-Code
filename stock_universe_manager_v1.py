"""
Stock Universe Manager V1 - Simplified
========================================

Manages stock universe with efficient caching and filtering.
V1: Start with S&P 500 (500 stocks), expand later.

Author: ATLAS Development Team
Version: 1.0.0
"""

import pandas as pd
import yfinance as yf
import pickle
import os
from typing import List, Dict
from datetime import datetime, timedelta
import concurrent.futures
from tqdm import tqdm


class StockUniverseManager:
    """
    V1: Simple stock universe manager
    Start with 500 stocks (S&P 500), expand later to 1,000+
    """

    def __init__(self, cache_dir='./data/stock_cache'):
        """
        Initialize manager with cache directory

        Args:
            cache_dir: Directory to store cached data
        """
        self.cache_dir = cache_dir
        self.cache_file = os.path.join(cache_dir, 'universe.pkl')
        self.metadata_file = os.path.join(cache_dir, 'metadata.pkl')

        # Create cache directory if doesn't exist
        os.makedirs(cache_dir, exist_ok=True)

        self.universe = None
        self.last_update = None

    # ============================================================
    # TICKER LISTS
    # ============================================================

    def get_sp500_tickers(self) -> List[str]:
        """
        Get S&P 500 tickers from Wikipedia

        Returns:
            List of ticker symbols
        """
        try:
            url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'
            tables = pd.read_html(url)
            sp500_table = tables[0]
            tickers = sp500_table['Symbol'].tolist()

            # Clean tickers (replace dots with dashes for yfinance)
            tickers = [t.replace('.', '-') for t in tickers]

            print(f"✓ Fetched {len(tickers)} S&P 500 tickers")
            return tickers

        except Exception as e:
            print(f"❌ Error fetching S&P 500: {e}")
            return []

    def get_nasdaq100_tickers(self) -> List[str]:
        """
        Get NASDAQ 100 tickers from Wikipedia

        Returns:
            List of ticker symbols
        """
        try:
            url = 'https://en.wikipedia.org/wiki/NASDAQ-100'
            tables = pd.read_html(url)
            nasdaq_table = tables[4]  # The main holdings table
            tickers = nasdaq_table['Ticker'].tolist()

            print(f"✓ Fetched {len(tickers)} NASDAQ-100 tickers")
            return tickers

        except Exception as e:
            print(f"❌ Error fetching NASDAQ-100: {e}")
            return []

    def get_all_tickers(self) -> List[str]:
        """
        Get combined ticker list (S&P 500 + NASDAQ 100)

        Returns:
            Deduplicated list of tickers
        """
        sp500 = self.get_sp500_tickers()
        nasdaq100 = self.get_nasdaq100_tickers()

        # Combine and deduplicate
        all_tickers = list(set(sp500 + nasdaq100))

        print(f"✓ Total unique tickers: {len(all_tickers)}")

        return all_tickers

    # ============================================================
    # DATA FETCHING
    # ============================================================

    def fetch_stock_data_batch(self, tickers: List[str], max_workers=10) -> pd.DataFrame:
        """
        Fetch data for multiple stocks in parallel

        Args:
            tickers: List of ticker symbols
            max_workers: Number of parallel workers

        Returns:
            DataFrame with stock data
        """

        print(f"Fetching data for {len(tickers)} stocks...")

        stock_data = []

        # Use ThreadPoolExecutor for parallel fetching
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            futures = {executor.submit(self._fetch_single_stock, t): t for t in tickers}

            # Process with progress bar
            for future in tqdm(
                concurrent.futures.as_completed(futures),
                total=len(tickers),
                desc="Fetching stocks"
            ):
                data = future.result()
                if data:
                    stock_data.append(data)

        df = pd.DataFrame(stock_data)
        print(f"✓ Successfully fetched {len(df)} stocks")

        return df

    def _fetch_single_stock(self, ticker: str) -> Dict:
        """
        Fetch data for a single stock

        Args:
            ticker: Stock ticker symbol

        Returns:
            Dict with stock data or None if failed
        """
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            hist = stock.history(period='1y')

            if hist.empty:
                return None

            # Current price and change
            current_price = hist['Close'].iloc[-1]
            prev_price = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
            change_pct = ((current_price / prev_price) - 1) * 100 if prev_price > 0 else 0

            # Calculate returns for different periods
            returns = {}
            for period, days in [('1D', 1), ('5D', 5), ('1M', 21), ('3M', 63), ('6M', 126), ('1Y', 252)]:
                if len(hist) > days:
                    past_price = hist['Close'].iloc[-days-1]
                    returns[f'return_{period}'] = ((current_price / past_price) - 1) * 100 if past_price > 0 else 0
                else:
                    returns[f'return_{period}'] = None

            # Market cap category
            market_cap = info.get('marketCap', 0)
            if market_cap >= 10e9:
                market_cap_category = 'Large Cap'
            elif market_cap >= 2e9:
                market_cap_category = 'Mid Cap'
            elif market_cap >= 300e6:
                market_cap_category = 'Small Cap'
            else:
                market_cap_category = 'Micro Cap'

            # Compile data
            data = {
                'ticker': ticker,
                'name': info.get('longName', info.get('shortName', ticker)),
                'sector': info.get('sector', 'Unknown'),
                'industry': info.get('industry', 'Unknown'),
                'country': info.get('country', 'Unknown'),

                # Price data
                'price': current_price,
                'change_pct': change_pct,

                # Returns
                **returns,

                # Volume
                'volume': hist['Volume'].iloc[-1] if 'Volume' in hist else 0,
                'avg_volume': hist['Volume'].mean() if 'Volume' in hist else 0,

                # Market data
                'market_cap': market_cap,
                'market_cap_category': market_cap_category,

                # Fundamentals
                'pe_ratio': info.get('trailingPE', None),
                'forward_pe': info.get('forwardPE', None),
                'peg_ratio': info.get('pegRatio', None),
                'price_to_book': info.get('priceToBook', None),

                'dividend_yield': info.get('dividendYield', 0) * 100 if info.get('dividendYield') else 0,
                'dividend_rate': info.get('dividendRate', 0),

                'profit_margin': info.get('profitMargins', 0) * 100 if info.get('profitMargins') else 0,
                'roe': info.get('returnOnEquity', 0) * 100 if info.get('returnOnEquity') else 0,
                'roa': info.get('returnOnAssets', 0) * 100 if info.get('returnOnAssets') else 0,

                'debt_to_equity': info.get('debtToEquity', None),
                'current_ratio': info.get('currentRatio', None),

                'revenue_growth': info.get('revenueGrowth', 0) * 100 if info.get('revenueGrowth') else 0,
                'earnings_growth': info.get('earningsGrowth', 0) * 100 if info.get('earningsGrowth') else 0,

                'beta': info.get('beta', 1.0),

                # 52-week range
                'high_52w': info.get('fiftyTwoWeekHigh', 0),
                'low_52w': info.get('fiftyTwoWeekLow', 0),

                # Timestamp
                'last_updated': datetime.now()
            }

            return data

        except Exception as e:
            # Silently fail for individual stocks
            return None

    # ============================================================
    # CACHING
    # ============================================================

    def load_or_build(self, force_rebuild=False):
        """
        Load universe from cache or build fresh

        Args:
            force_rebuild: Force fresh data fetch even if cache exists
        """

        # Check if cache exists and is fresh
        if not force_rebuild and os.path.exists(self.cache_file):
            self._load_from_cache()

            # Check if cache is recent (< 30 minutes old)
            if self.last_update:
                age = datetime.now() - self.last_update
                if age < timedelta(minutes=30):
                    print(f"✓ Using cached data (age: {age.seconds // 60} minutes)")
                    return
                else:
                    print(f"⚠ Cache expired (age: {age.seconds // 60} minutes), rebuilding...")

        # Build fresh universe
        self._build_universe()

    def _load_from_cache(self):
        """Load universe from cache file"""
        try:
            with open(self.cache_file, 'rb') as f:
                self.universe = pickle.load(f)

            with open(self.metadata_file, 'rb') as f:
                metadata = pickle.load(f)
                self.last_update = metadata.get('last_update')

            print(f"✓ Loaded {len(self.universe)} stocks from cache")

        except Exception as e:
            print(f"❌ Error loading cache: {e}")
            self._build_universe()

    def _build_universe(self):
        """Build fresh universe by fetching all stock data"""

        # Get ticker list - EXPANDED to 1,000+
        print("Building expanded universe (1,000+ stocks)...")

        # 1. S&P 500
        sp500 = self.get_sp500_tickers()
        print(f"✓ S&P 500: {len(sp500)} tickers")

        # 2. NASDAQ-100
        nasdaq100 = self.get_nasdaq100_tickers()
        print(f"✓ NASDAQ-100: {len(nasdaq100)} tickers")

        # 3. Additional popular stocks (curated)
        additional = self._get_additional_curated_stocks()
        print(f"✓ Additional curated: {len(additional)} tickers")

        # Combine and deduplicate
        all_tickers = list(set(sp500 + nasdaq100 + additional))
        print(f"✓ Total unique tickers: {len(all_tickers)}")

        if not all_tickers:
            print("❌ No tickers found, cannot build universe")
            self.universe = pd.DataFrame()
            return

        # Fetch data (parallel)
        self.universe = self.fetch_stock_data_batch(all_tickers, max_workers=20)

        # Save to cache
        self._save_to_cache()

        self.last_update = datetime.now()

    def _get_additional_curated_stocks(self) -> List[str]:
        """
        Get additional popular stocks beyond S&P 500 and NASDAQ-100
        Focus on: Mid-caps, small-caps, international, growth stocks

        Returns:
            List of ticker symbols
        """

        # Popular mid-caps and small-caps
        curated = [
            # Technology & Software
            'SNOW', 'DDOG', 'CRWD', 'ZS', 'NET', 'CFLT', 'ESTC', 'MDB', 'DOCU',
            'TWLO', 'OKTA', 'ZM', 'SHOP', 'SQ', 'COIN', 'HOOD', 'SOFI',

            # Healthcare & Biotech
            'MRNA', 'BNTX', 'REGN', 'VRTX', 'ILMN', 'BIIB', 'ALNY', 'SGEN',
            'BMRN', 'INCY', 'EXAS', 'TDOC', 'VEEV',

            # Semiconductors & Hardware
            'AMAT', 'LRCX', 'KLAC', 'MRVL', 'MCHP', 'MPWR', 'SWKS', 'QRVO',
            'ARM', 'ONTO', 'ASML', 'TSM',

            # Finance & Fintech
            'AFRM', 'UPST', 'LC', 'NU', 'OPEN', 'RBLX', 'U',

            # Consumer & E-commerce
            'ABNB', 'UBER', 'LYFT', 'DASH', 'SPOT', 'PTON', 'W', 'CHWY',
            'ETSY', 'PINS', 'SNAP',

            # Energy & Clean Tech
            'ENPH', 'SEDG', 'RUN', 'PLUG', 'FCEL', 'BE', 'CHPT', 'LCID', 'RIVN',

            # Industrial & Materials
            'CARR', 'OTIS', 'GEV', 'MLM', 'VMC', 'NUE', 'STLD', 'RS',

            # Real Estate & REITs
            'AMT', 'PLD', 'EQIX', 'PSA', 'DLR', 'O', 'VICI', 'SPG',

            # Media & Entertainment
            'NFLX', 'DIS', 'PARA', 'WBD', 'ROKU', 'MTCH', 'BMBL',

            # International (ADRs)
            'BABA', 'TSM', 'NIO', 'XPEV', 'LI', 'PDD', 'JD', 'BIDU',
            'GRAB', 'SE', 'MELI', 'NU', 'VALE', 'ITUB',

            # Aerospace & Defense
            'BA', 'LMT', 'RTX', 'NOC', 'GD', 'LHX', 'TDG', 'HWM',

            # Retail
            'TGT', 'WMT', 'COST', 'HD', 'LOW', 'TJX', 'ROST', 'DG', 'DLTR',

            # Utilities & Infrastructure
            'NEE', 'DUK', 'SO', 'D', 'EXC', 'AEP', 'SRE', 'PCG',

            # Gaming
            'EA', 'TTWO', 'ATVI', 'RBLX', 'U', 'DKNG', 'PENN',

            # Pharma
            'PFE', 'JNJ', 'MRK', 'ABBV', 'BMY', 'LLY', 'GILD', 'AMGN',

            # Cloud & Data
            'PLTR', 'AI', 'GTLB', 'S', 'DBX', 'BOX', 'FIVN',

            # Cybersecurity
            'PANW', 'FTNT', 'CHKP', 'CYBR', 'TENB', 'OKTA',

            # Communication Equipment
            'CSCO', 'ANET', 'JNPR', 'ERIC', 'NOK', 'UI',

            # Auto & EV
            'F', 'GM', 'RIVN', 'LCID', 'NKLA', 'FSR', 'GOEV',

            # Emerging Tech
            'RKLB', 'SPCE', 'IRDM', 'GSAT', 'AST', 'PL',

            # SPACs & Growth
            'ARKK', 'ARKG', 'ARKW', 'ARKF', 'ARKQ',  # ARK ETFs for discovery
        ]

        # Remove any that might be in S&P 500 or NASDAQ-100 already
        # (deduplication happens in _build_universe anyway)

        return curated

    def _save_to_cache(self):
        """Save universe to cache file"""
        try:
            with open(self.cache_file, 'wb') as f:
                pickle.dump(self.universe, f)

            metadata = {
                'last_update': datetime.now(),
                'num_stocks': len(self.universe) if self.universe is not None else 0
            }

            with open(self.metadata_file, 'wb') as f:
                pickle.dump(metadata, f)

            print(f"✓ Saved {len(self.universe)} stocks to cache")

        except Exception as e:
            print(f"❌ Error saving cache: {e}")

    # ============================================================
    # FILTERING
    # ============================================================

    def filter(self, criteria: Dict) -> pd.DataFrame:
        """
        Filter universe based on criteria

        Args:
            criteria: Dict with filter parameters

        Example:
            {
                'sectors': ['Technology', 'Healthcare'],
                'market_cap_min': 1e9,
                'market_cap_categories': ['Large Cap', 'Mid Cap'],
                'pe_max': 30,
                'div_yield_min': 2.0,
                'return_1M_min': 5.0
            }

        Returns:
            Filtered DataFrame
        """

        if self.universe is None or self.universe.empty:
            return pd.DataFrame()

        df = self.universe.copy()

        # Sector filter
        if criteria.get('sectors'):
            df = df[df['sector'].isin(criteria['sectors'])]

        # Industry filter
        if criteria.get('industries'):
            df = df[df['industry'].isin(criteria['industries'])]

        # Country filter
        if criteria.get('countries'):
            df = df[df['country'].isin(criteria['countries'])]

        # Market cap category filter
        if criteria.get('market_cap_categories'):
            df = df[df['market_cap_category'].isin(criteria['market_cap_categories'])]

        # Market cap range filter
        if criteria.get('market_cap_min'):
            df = df[df['market_cap'] >= criteria['market_cap_min']]

        if criteria.get('market_cap_max'):
            df = df[df['market_cap'] <= criteria['market_cap_max']]

        # P/E ratio filter
        if criteria.get('pe_min'):
            df = df[df['pe_ratio'] >= criteria['pe_min']]

        if criteria.get('pe_max'):
            df = df[df['pe_ratio'] <= criteria['pe_max']]

        # Dividend yield filter
        if criteria.get('div_yield_min'):
            df = df[df['dividend_yield'] >= criteria['div_yield_min']]

        # ROE filter
        if criteria.get('roe_min'):
            df = df[df['roe'] >= criteria['roe_min']]

        # Debt-to-Equity filter
        if criteria.get('debt_to_equity_max'):
            df = df[df['debt_to_equity'] <= criteria['debt_to_equity_max']]

        # Performance filters
        for period in ['1D', '5D', '1M', '3M', '6M', '1Y']:
            col = f'return_{period}'

            if criteria.get(f'{col}_min'):
                df = df[df[col] >= criteria[f'{col}_min']]

            if criteria.get(f'{col}_max'):
                df = df[df[col] <= criteria[f'{col}_max']]

        return df

    def get_available_sectors(self) -> List[str]:
        """Get list of all sectors in universe"""
        if self.universe is None or self.universe.empty:
            return []
        return sorted(self.universe['sector'].unique().tolist())

    def get_available_industries(self) -> List[str]:
        """Get list of all industries in universe"""
        if self.universe is None or self.universe.empty:
            return []
        return sorted(self.universe['industry'].unique().tolist())

    def get_available_countries(self) -> List[str]:
        """Get list of all countries in universe"""
        if self.universe is None or self.universe.empty:
            return []
        return sorted(self.universe['country'].unique().tolist())


# ============================================================
# TESTING
# ============================================================

if __name__ == "__main__":
    """
    Test the stock universe manager
    Run with: python stock_universe_manager_v1.py
    """

    print("=" * 60)
    print("STOCK UNIVERSE MANAGER V1 - TEST")
    print("=" * 60)

    # Create manager
    manager = StockUniverseManager()

    # Build universe
    print("\n1. Building universe...")
    manager.load_or_build(force_rebuild=True)

    # Show summary
    print(f"\n2. Universe Summary:")
    print(f"   Total stocks: {len(manager.universe)}")
    print(f"   Sectors: {len(manager.get_available_sectors())}")
    print(f"   Countries: {len(manager.get_available_countries())}")

    # Test filtering
    print(f"\n3. Testing filters...")

    tech_stocks = manager.filter({'sectors': ['Technology']})
    print(f"   Technology stocks: {len(tech_stocks)}")

    large_caps = manager.filter({'market_cap_categories': ['Large Cap']})
    print(f"   Large cap stocks: {len(large_caps)}")

    high_div = manager.filter({'div_yield_min': 3.0})
    print(f"   High dividend (>3%): {len(high_div)}")

    strong_1m = manager.filter({'return_1M_min': 10.0})
    print(f"   Strong 1M return (>10%): {len(strong_1m)}")

    print("\n✓ Test complete!")
    print("=" * 60)
