"""
ATLAS Data Module
=================
Data fetching, processing, and storage utilities.

Exports:
    - AlpacaDataEngine: Alpaca API data fetcher
    - MarketDataFetcher: General market data
    - AtlasDB: Database interface
    - Sector utilities: GICS sector mappings
"""

try:
    from data.alpaca_data_engine import AlpacaDataEngine
except ImportError:
    AlpacaDataEngine = None

try:
    from data.market_data_fetcher import get_ticker_data, get_sector_performance
except ImportError:
    get_ticker_data = None
    get_sector_performance = None

try:
    from data.atlas_db import AtlasDB, get_db
except ImportError:
    AtlasDB = None
    get_db = None

__all__ = [
    'AlpacaDataEngine',
    'get_ticker_data',
    'get_sector_performance',
    'AtlasDB',
    'get_db',
]
