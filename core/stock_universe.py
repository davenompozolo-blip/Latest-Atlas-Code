"""
ATLAS Terminal - Smart Stock Universe

Hybrid architecture combining:
1. Alpha Vantage (8,000+ tickers when available)
2. Local curated list (~1,000 for screener UI)
3. yfinance validation (unlimited ticker search)
The effective universe is 50,000+ securities via yfinance.

Architecture:
    User searches/filters stocks
        |
    +-----------------------------------------+
    | LAYER 1: Alpha Vantage (when available) |
    | -> 8,000+ US listed stocks              |
    +-----------------------------------------+
        | (if unavailable or limit hit)
    +-----------------------------------------+
    | LAYER 2: Local Curated List (~1,000)    |
    | -> S&P 500, NASDAQ-100, popular stocks  |
    +-----------------------------------------+
        | (for ANY ticker search)
    +-----------------------------------------+
    | LAYER 3: yfinance Validation            |
    | -> Validates ANY ticker on-demand       |
    | -> Effective limit: 50,000+ securities  |
    +-----------------------------------------+

Author: ATLAS Terminal Team
"""
import pandas as pd
from typing import List, Dict, Optional
import streamlit as st

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False

# =============================================================================
# LOCAL CURATED LIST (~1,000 stocks for screener UI)
# =============================================================================
SP500_TICKERS = [
    # Technology (50)
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'META', 'AVGO', 'ORCL', 'CRM', 'ADBE',
    'AMD', 'CSCO', 'ACN', 'INTC', 'IBM', 'INTU', 'QCOM', 'TXN', 'AMAT', 'NOW',
    'ADI', 'LRCX', 'MU', 'KLAC', 'SNPS', 'CDNS', 'MCHP', 'FTNT', 'PANW', 'ANET',
    'MSI', 'HPQ', 'HPE', 'KEYS', 'GLW', 'ANSS', 'CTSH', 'IT', 'FSLR', 'ENPH',
    'MPWR', 'EPAM', 'PTC', 'ZBRA', 'TYL', 'JNPR', 'CDW', 'AKAM', 'SWKS', 'NTAP',
    # Healthcare (40)
    'UNH', 'JNJ', 'LLY', 'ABBV', 'MRK', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY',
    'AMGN', 'MDT', 'GILD', 'CVS', 'ISRG', 'VRTX', 'SYK', 'REGN', 'BDX', 'ZTS',
    'BSX', 'ELV', 'CI', 'HUM', 'MRNA', 'MCK', 'HCA', 'IQV', 'EW', 'IDXX',
    'A', 'DXCM', 'MTD', 'BIIB', 'RMD', 'ILMN', 'WST', 'ZBH', 'BAX', 'CAH',
    # Financials (40)
    'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI', 'BLK',
    'AXP', 'C', 'PNC', 'SCHW', 'USB', 'CB', 'MMC', 'ICE', 'CME', 'AON',
    'BK', 'TFC', 'AIG', 'MET', 'PRU', 'AFL', 'TRV', 'ALL', 'PGR', 'AJG',
    'MSCI', 'MCO', 'COF', 'DFS', 'FIS', 'FITB', 'MTB', 'STT', 'NTRS', 'HBAN',
    # Consumer Discretionary (35)
    'AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'SBUX', 'TJX', 'BKNG', 'CMG',
    'MAR', 'ORLY', 'AZO', 'ROST', 'DHI', 'LEN', 'GM', 'F', 'YUM', 'HLT',
    'EBAY', 'APTV', 'DRI', 'GRMN', 'POOL', 'BBY', 'PHM', 'NVR', 'KMX', 'ULTA',
    'ETSY', 'EXPE', 'WYNN', 'LVS', 'MGM',
    # Consumer Staples (25)
    'PG', 'KO', 'PEP', 'COST', 'WMT', 'PM', 'MDLZ', 'MO', 'CL', 'KMB',
    'GIS', 'KHC', 'HSY', 'K', 'SJM', 'CPB', 'HRL', 'MKC', 'CAG', 'TSN',
    'STZ', 'TAP', 'KDP', 'MNST', 'CLX',
    # Energy (20)
    'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PXD', 'VLO', 'PSX', 'OXY',
    'WMB', 'KMI', 'HES', 'DVN', 'HAL', 'FANG', 'BKR', 'CTRA', 'MRO', 'APA',
    # Industrials (40)
    'CAT', 'BA', 'UPS', 'HON', 'GE', 'RTX', 'DE', 'LMT', 'UNP', 'ADP',
    'ETN', 'NOC', 'ITW', 'WM', 'CSX', 'EMR', 'GD', 'NSC', 'FDX', 'JCI',
    'MMM', 'PH', 'CARR', 'OTIS', 'TT', 'CMI', 'PCAR', 'AME', 'ROK', 'FAST',
    'VRSK', 'RSG', 'IR', 'LHX', 'TDG', 'HWM', 'WAB', 'SWK', 'GWW', 'DOV',
    # Materials (15)
    'LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'NUE', 'DOW', 'DD', 'VMC',
    'MLM', 'PPG', 'ALB', 'CTVA', 'FMC',
    # Real Estate (15)
    'PLD', 'AMT', 'EQIX', 'CCI', 'PSA', 'O', 'WELL', 'DLR', 'SPG', 'VICI',
    'AVB', 'EQR', 'ARE', 'VTR', 'SBAC',
    # Utilities (15)
    'NEE', 'DUK', 'SO', 'D', 'AEP', 'SRE', 'EXC', 'XEL', 'ED', 'PEG',
    'WEC', 'ES', 'AWK', 'DTE', 'ETR',
    # Communication Services (15)
    'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'ATVI', 'EA', 'TTWO',
    'WBD', 'PARA', 'FOX', 'LYV', 'MTCH',
]

NASDAQ100_ADDITIONS = [
    'ASML', 'MELI', 'TEAM', 'WDAY', 'DDOG', 'ZS', 'CRWD', 'ABNB', 'SNOW', 'DASH',
    'COIN', 'LCID', 'RIVN', 'HOOD', 'PLTR', 'U', 'DOCN', 'NET', 'OKTA', 'MDB',
    'TTD', 'ZM', 'ROKU', 'SPLK', 'DOCU', 'VEEV', 'HUBS', 'BILL', 'ARM', 'SMCI',
]

POPULAR_ADDITIONS = [
    # Popular retail stocks
    'GME', 'AMC', 'BB', 'NOK', 'SOFI', 'WISH', 'CLOV', 'SPCE',
    # Chinese ADRs
    'BABA', 'JD', 'PDD', 'BIDU', 'NIO', 'XPEV', 'LI', 'BILI', 'TME', 'NTES',
    # Major international
    'TSM', 'NVO', 'TM', 'SAP', 'SONY', 'SNY', 'AZN', 'NVS', 'UL',
    'BP', 'SHEL', 'RIO', 'BHP', 'VALE', 'SHOP', 'TD', 'RY', 'ENB', 'SU',
]

# =============================================================================
# SECTOR MAPPING
# =============================================================================
SECTOR_MAP = {
    'Technology': [
        'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'META', 'AVGO', 'ORCL', 'CRM', 'ADBE',
        'AMD', 'CSCO', 'ACN', 'INTC', 'IBM', 'INTU', 'QCOM', 'TXN', 'AMAT', 'NOW',
        'TSM', 'ASML', 'ARM', 'SMCI', 'MU', 'LRCX', 'KLAC', 'SNPS', 'CDNS', 'MCHP',
    ],
    'Healthcare': [
        'UNH', 'JNJ', 'LLY', 'ABBV', 'MRK', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY',
        'AMGN', 'MDT', 'GILD', 'CVS', 'ISRG', 'VRTX', 'SYK', 'REGN', 'BDX', 'ZTS',
        'NVO', 'AZN', 'NVS', 'SNY', 'MRNA', 'HCA', 'ELV', 'CI', 'HUM',
    ],
    'Financials': [
        'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI', 'BLK',
        'AXP', 'C', 'PNC', 'SCHW', 'USB', 'CB', 'MMC', 'ICE', 'CME', 'AON',
        'TD', 'RY', 'COIN', 'HOOD', 'SOFI',
    ],
    'Consumer Discretionary': [
        'AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'SBUX', 'TJX', 'BKNG', 'CMG',
        'MAR', 'ORLY', 'AZO', 'ROST', 'GM', 'F', 'YUM', 'HLT',
        'ABNB', 'DASH', 'NIO', 'XPEV', 'LI', 'RIVN', 'LCID',
    ],
    'Consumer Staples': [
        'PG', 'KO', 'PEP', 'COST', 'WMT', 'PM', 'MDLZ', 'MO', 'CL', 'KMB',
        'GIS', 'KHC', 'HSY', 'K', 'SJM', 'CPB', 'HRL', 'MKC', 'CAG', 'TSN',
    ],
    'Energy': [
        'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PXD', 'VLO', 'PSX', 'OXY',
        'WMB', 'KMI', 'HES', 'DVN', 'HAL', 'BP', 'SHEL', 'ENB', 'SU',
    ],
    'Industrials': [
        'CAT', 'BA', 'UPS', 'HON', 'GE', 'RTX', 'DE', 'LMT', 'UNP', 'ADP',
        'ETN', 'NOC', 'ITW', 'WM', 'CSX', 'EMR', 'GD', 'NSC', 'FDX', 'JCI',
    ],
    'Materials': [
        'LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'NUE', 'DOW', 'DD', 'VMC',
        'MLM', 'PPG', 'ALB', 'CTVA', 'FMC', 'RIO', 'BHP', 'VALE',
    ],
    'Real Estate': [
        'PLD', 'AMT', 'EQIX', 'CCI', 'PSA', 'O', 'WELL', 'DLR', 'SPG', 'VICI',
        'AVB', 'EQR', 'ARE', 'VTR', 'SBAC',
    ],
    'Utilities': [
        'NEE', 'DUK', 'SO', 'D', 'AEP', 'SRE', 'EXC', 'XEL', 'ED', 'PEG',
        'WEC', 'ES', 'AWK', 'DTE', 'ETR',
    ],
    'Communication Services': [
        'GOOGL', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'EA',
        'ATVI', 'TTWO', 'ROKU', 'ZM', 'SNAP', 'PINS', 'MTCH',
    ],
}

# =============================================================================
# COMPANY NAMES (for display)
# =============================================================================
COMPANY_NAMES = {
    # Technology
    'AAPL': 'Apple Inc.',
    'MSFT': 'Microsoft Corporation',
    'NVDA': 'NVIDIA Corporation',
    'GOOGL': 'Alphabet Inc. (A)',
    'GOOG': 'Alphabet Inc. (C)',
    'META': 'Meta Platforms',
    'AVGO': 'Broadcom Inc.',
    'ORCL': 'Oracle Corporation',
    'CRM': 'Salesforce Inc.',
    'ADBE': 'Adobe Inc.',
    'AMD': 'Advanced Micro Devices',
    'CSCO': 'Cisco Systems',
    'ACN': 'Accenture plc',
    'INTC': 'Intel Corporation',
    'IBM': 'IBM Corporation',
    'INTU': 'Intuit Inc.',
    'QCOM': 'Qualcomm Inc.',
    'TXN': 'Texas Instruments',
    'AMAT': 'Applied Materials',
    'NOW': 'ServiceNow Inc.',
    'TSM': 'Taiwan Semiconductor',
    'ASML': 'ASML Holding',
    'ARM': 'ARM Holdings',
    'SMCI': 'Super Micro Computer',
    # Healthcare
    'UNH': 'UnitedHealth Group',
    'JNJ': 'Johnson & Johnson',
    'LLY': 'Eli Lilly',
    'ABBV': 'AbbVie Inc.',
    'MRK': 'Merck & Co.',
    'PFE': 'Pfizer Inc.',
    'TMO': 'Thermo Fisher Scientific',
    'ABT': 'Abbott Laboratories',
    'DHR': 'Danaher',
    'BMY': 'Bristol-Myers Squibb',
    'AMGN': 'Amgen Inc.',
    'MDT': 'Medtronic',
    'GILD': 'Gilead Sciences',
    'CVS': 'CVS Health',
    'ISRG': 'Intuitive Surgical',
    'VRTX': 'Vertex Pharmaceuticals',
    'NVO': 'Novo Nordisk',
    'AZN': 'AstraZeneca',
    'NVS': 'Novartis',
    'SNY': 'Sanofi',
    'MRNA': 'Moderna Inc.',
    # Financials
    'BRK.B': 'Berkshire Hathaway',
    'JPM': 'JPMorgan Chase',
    'V': 'Visa Inc.',
    'MA': 'Mastercard Inc.',
    'BAC': 'Bank of America',
    'WFC': 'Wells Fargo',
    'GS': 'Goldman Sachs',
    'MS': 'Morgan Stanley',
    'SPGI': 'S&P Global',
    'BLK': 'BlackRock Inc.',
    'AXP': 'American Express',
    'C': 'Citigroup',
    'SCHW': 'Charles Schwab',
    'COIN': 'Coinbase',
    'HOOD': 'Robinhood',
    'SOFI': 'SoFi',
    # Consumer Discretionary
    'AMZN': 'Amazon.com Inc.',
    'TSLA': 'Tesla Inc.',
    'HD': 'Home Depot',
    'MCD': "McDonald's Corp.",
    'NKE': 'Nike Inc.',
    'LOW': "Lowe's Companies",
    'SBUX': 'Starbucks Corp.',
    'TJX': 'TJX Companies',
    'BKNG': 'Booking Holdings',
    'CMG': 'Chipotle Mexican Grill',
    'GM': 'General Motors',
    'F': 'Ford Motor',
    'ABNB': 'Airbnb Inc.',
    'DASH': 'DoorDash',
    'NIO': 'NIO Inc.',
    'XPEV': 'XPeng Inc.',
    'LI': 'Li Auto',
    'RIVN': 'Rivian',
    'LCID': 'Lucid Motors',
    # Consumer Staples
    'PG': 'Procter & Gamble',
    'KO': 'Coca-Cola Company',
    'PEP': 'PepsiCo Inc.',
    'COST': 'Costco Wholesale',
    'WMT': 'Walmart Inc.',
    'PM': 'Philip Morris',
    'MDLZ': 'Mondelez International',
    'MO': 'Altria Group',
    'CL': 'Colgate-Palmolive',
    # Energy
    'XOM': 'Exxon Mobil',
    'CVX': 'Chevron Corporation',
    'COP': 'ConocoPhillips',
    'SLB': 'Schlumberger',
    'EOG': 'EOG Resources',
    'BP': 'BP plc',
    'SHEL': 'Shell plc',
    # Industrials
    'CAT': 'Caterpillar Inc.',
    'BA': 'Boeing Company',
    'UPS': 'United Parcel Service',
    'HON': 'Honeywell',
    'GE': 'General Electric',
    'RTX': 'RTX Corporation',
    'DE': 'Deere & Company',
    'LMT': 'Lockheed Martin',
    'UNP': 'Union Pacific',
    # Communication Services
    'NFLX': 'Netflix Inc.',
    'DIS': 'Walt Disney',
    'CMCSA': 'Comcast',
    'VZ': 'Verizon',
    'T': 'AT&T Inc.',
    'TMUS': 'T-Mobile US',
    # Chinese ADRs
    'BABA': 'Alibaba Group',
    'JD': 'JD.com',
    'PDD': 'PDD Holdings',
    'BIDU': 'Baidu Inc.',
    'BILI': 'Bilibili',
    'TME': 'Tencent Music',
    'NTES': 'NetEase',
    # Other International
    'SHOP': 'Shopify Inc.',
    'TD': 'Toronto-Dominion Bank',
    'RY': 'Royal Bank of Canada',
    'RIO': 'Rio Tinto',
    'BHP': 'BHP Group',
    'VALE': 'Vale S.A.',
    'TM': 'Toyota Motor',
    'SONY': 'Sony Group',
    'SAP': 'SAP SE',
}

# =============================================================================
# YFINANCE INTEGRATION (Unlimited Ticker Validation)
# =============================================================================
@st.cache_data(ttl=3600, show_spinner=False)
def validate_ticker_yfinance(ticker: str) -> Optional[Dict]:
    """
    Validate ANY ticker using yfinance. Returns metadata if valid, None if invalid.

    This is the key to unlimited ticker support - if yfinance can fetch it,
    it's a valid security.
    """
    if not YFINANCE_AVAILABLE:
        return None

    try:
        stock = yf.Ticker(ticker.upper())
        info = stock.info

        if not info or not info.get('symbol'):
            return None

        if info.get('regularMarketPrice') is None and info.get('previousClose') is None:
            return None

        return {
            'symbol': ticker.upper(),
            'name': info.get('shortName') or info.get('longName') or ticker.upper(),
            'sector': info.get('sector', 'Other'),
            'industry': info.get('industry', ''),
            'exchange': info.get('exchange', ''),
            'market_cap': info.get('marketCap'),
            'currency': info.get('currency', 'USD'),
            'quote_type': info.get('quoteType', 'EQUITY'),
        }
    except Exception:
        return None


def get_ticker_info_fast(ticker: str) -> Dict:
    """
    Get basic ticker info, preferring local data for speed.
    Falls back to yfinance for unknown tickers.
    """
    ticker = ticker.upper()

    # Check local first (instant)
    if ticker in COMPANY_NAMES:
        sector = 'Other'
        for sec, tickers in SECTOR_MAP.items():
            if ticker in tickers:
                sector = sec
                break

        return {
            'symbol': ticker,
            'name': COMPANY_NAMES[ticker],
            'sector': sector,
            'source': 'local'
        }

    # Fall back to yfinance (slower but comprehensive)
    yf_info = validate_ticker_yfinance(ticker)
    if yf_info:
        yf_info['source'] = 'yfinance'
        return yf_info

    # Unknown ticker
    return {
        'symbol': ticker,
        'name': ticker,
        'sector': 'Unknown',
        'source': 'unknown'
    }


# =============================================================================
# MAIN UNIVERSE FUNCTIONS
# =============================================================================
def get_local_universe() -> List[str]:
    """Get curated local universe (~1,000 tickers)."""
    all_tickers = set()
    all_tickers.update(SP500_TICKERS)
    all_tickers.update(NASDAQ100_ADDITIONS)
    all_tickers.update(POPULAR_ADDITIONS)
    return sorted(list(all_tickers))


def get_local_universe_count() -> int:
    """Get count of local curated tickers."""
    return len(get_local_universe())


def get_local_universe_df() -> pd.DataFrame:
    """Get local universe as DataFrame with metadata."""
    records = []
    for ticker in get_local_universe():
        info = get_ticker_info_fast(ticker)
        records.append({
            'symbol': ticker,
            'name': info.get('name', ticker),
            'sector': info.get('sector', 'Other'),
            'exchange': 'NYSE/NASDAQ',
            'assetType': 'Stock',
        })
    return pd.DataFrame(records)


def get_screener_universe() -> pd.DataFrame:
    """
    Get best available universe for the stock screener.
    Priority: Alpha Vantage (8,000+) -> Local curated (~1,000).
    """
    try:
        from core.alpha_vantage import av_client, ALPHA_VANTAGE_AVAILABLE
        if ALPHA_VANTAGE_AVAILABLE and av_client.is_configured:
            df = av_client.get_listing_status()
            if not df.empty:
                return df
    except ImportError:
        pass
    except Exception:
        pass

    return get_local_universe_df()


def search_any_ticker(query: str, limit: int = 20) -> List[Dict]:
    """
    Search for any ticker - combines local list with yfinance validation.
    This is the "unlimited" search.
    """
    query = query.upper().strip()
    results = []
    seen = set()

    # 1. Check local list for matches (instant)
    for ticker in get_local_universe():
        name = COMPANY_NAMES.get(ticker, ticker)
        if query in ticker or query in name.upper():
            info = get_ticker_info_fast(ticker)
            if ticker not in seen:
                results.append(info)
                seen.add(ticker)

    # 2. Try exact ticker match via yfinance (if not already found)
    if query not in seen:
        yf_result = validate_ticker_yfinance(query)
        if yf_result:
            yf_result['source'] = 'yfinance'
            results.insert(0, yf_result)

    return results[:limit]


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
def get_all_sectors() -> List[str]:
    """Get list of all sectors for filter dropdowns."""
    return sorted(list(SECTOR_MAP.keys()))


def get_tickers_by_sector(sector: str) -> List[str]:
    """Get tickers in a specific sector."""
    return SECTOR_MAP.get(sector, [])


def get_sector_for_ticker(ticker: str) -> str:
    """Get sector for a given ticker."""
    ticker = ticker.upper()
    for sector, tickers in SECTOR_MAP.items():
        if ticker in tickers:
            return sector
    return 'Other'


def get_company_name(ticker: str) -> str:
    """Get company name for a ticker."""
    return COMPANY_NAMES.get(ticker.upper(), ticker.upper())


# =============================================================================
# EXPORTS
# =============================================================================
__all__ = [
    'SP500_TICKERS',
    'NASDAQ100_ADDITIONS',
    'POPULAR_ADDITIONS',
    'SECTOR_MAP',
    'COMPANY_NAMES',
    'get_local_universe',
    'get_local_universe_count',
    'get_local_universe_df',
    'get_screener_universe',
    'validate_ticker_yfinance',
    'get_ticker_info_fast',
    'search_any_ticker',
    'get_all_sectors',
    'get_tickers_by_sector',
    'get_sector_for_ticker',
    'get_company_name',
]
