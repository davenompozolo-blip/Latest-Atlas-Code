"""
ATLAS Terminal v10.0 - Configuration Module
All constants, colors, themes, and market universe definitions
"""

from pathlib import Path
import plotly.express as px

# ============================================================================
# VERSION INFO
# ============================================================================
VERSION = "10.0.0"
VERSION_NAME = "ATLAS Terminal v10.0 - PROFESSIONAL EDITION"
RELEASE_DATE = "November 14, 2025"
STATUS = "Production Ready - Refactored & Modular"

# ============================================================================
# CACHE & FILE PATHS
# ============================================================================
CACHE_DIR = Path.home() / ".atlas_cache"
CACHE_DIR.mkdir(exist_ok=True)

PORTFOLIO_CACHE = CACHE_DIR / "portfolio.pkl"
TRADE_HISTORY_CACHE = CACHE_DIR / "trade_history.pkl"
ACCOUNT_HISTORY_CACHE = CACHE_DIR / "account_history.pkl"
TRADES_JOURNAL = CACHE_DIR / "trades_journal.json"

# ============================================================================
# FINANCIAL CONSTANTS
# ============================================================================
RISK_FREE_RATE = 0.045  # 4.5% (US 10Y Treasury)
MARKET_RETURN = 0.10    # 10% historical market return
DEFAULT_LEVERAGE_MAX = 2.0
DEFAULT_VAR_THRESHOLD = 0.02  # 2% daily VaR limit

# ============================================================================
# COLOR PALETTE - NEON DARK THEME
# ============================================================================
COLORS = {
    # Backgrounds
    "background": "#000000",
    "card_background": "#0a1929",
    "card_background_alt": "#050f17",

    # Primary Colors
    "neon_blue": "#00d4ff",
    "electric_blue": "#0080ff",
    "teal": "#00ffcc",
    "cyan": "#00ffff",

    # Status Colors
    "success": "#00ff88",
    "warning": "#ffaa00",
    "danger": "#ff0044",
    "info": "#00d4ff",

    # Accent Colors
    "purple": "#b794f6",
    "pink": "#ff00ff",
    "orange": "#ff6b00",

    # Chart Colors
    "chart_primary": "#00d4ff",
    "chart_secondary": "#0080ff",
    "chart_accent": "#00ffcc",
    "chart_grid": "#1a3a52",

    # Text Colors
    "text_primary": "#ffffff",
    "text_secondary": "#b0c4de",
    "text_muted": "#6c8ca8",

    # UI Elements
    "border": "#00d4ff",
    "shadow": "rgba(0, 212, 255, 0.3)",
    "shadow_strong": "rgba(0, 212, 255, 0.6)",

    # P&L Colors
    "gain_bg": "rgba(0, 255, 136, 0.15)",
    "gain_text": "#00ff88",
    "loss_bg": "rgba(255, 0, 68, 0.15)",
    "loss_text": "#ff0044",
}

# ============================================================================
# CHART THEME CONFIGURATION
# ============================================================================
CHART_THEME = {
    'paper_bgcolor': 'rgba(0, 0, 0, 0)',
    'plot_bgcolor': 'rgba(10, 25, 41, 0.3)',
    'font': {'color': COLORS['text_primary'], 'family': 'Inter, sans-serif'},
    'xaxis': {
        'gridcolor': COLORS['chart_grid'],
        'linecolor': COLORS['chart_grid'],
        'zerolinecolor': COLORS['chart_grid']
    },
    'yaxis': {
        'gridcolor': COLORS['chart_grid'],
        'linecolor': COLORS['chart_grid'],
        'zerolinecolor': COLORS['chart_grid']
    }
}

COLORSCALES = {
    "viridis": px.colors.sequential.Viridis,
    "plasma": px.colors.sequential.Plasma,
    "turbo": px.colors.sequential.Turbo,
    "rdylgn": px.colors.diverging.RdYlGn,
    "spectral": px.colors.diverging.Spectral,
}

# ============================================================================
# MARKET UNIVERSE - GLOBAL INDICES
# ============================================================================
GLOBAL_INDICES = {
    "^GSPC": {"name": "S&P 500", "region": "US"},
    "^NDX": {"name": "Nasdaq 100", "region": "US"},
    "^DJI": {"name": "Dow Jones", "region": "US"},
    "^RUT": {"name": "Russell 2000", "region": "US"},
    "^FTSE": {"name": "FTSE 100", "region": "UK"},
    "^GDAXI": {"name": "DAX", "region": "Germany"},
    "^FCHI": {"name": "CAC 40", "region": "France"},
    "^STOXX50E": {"name": "Euro Stoxx 50", "region": "Europe"},
    "^N225": {"name": "Nikkei 225", "region": "Japan"},
    "^HSI": {"name": "Hang Seng", "region": "Hong Kong"},
    "000001.SS": {"name": "Shanghai Composite", "region": "China"},
    "^BSESN": {"name": "BSE Sensex", "region": "India"},
    "^BVSP": {"name": "Bovespa", "region": "Brazil"},
    "^AXJO": {"name": "ASX 200", "region": "Australia"},
    "^GSPTSE": {"name": "TSX Composite", "region": "Canada"},
    "^KS11": {"name": "KOSPI", "region": "South Korea"},
    "^TWII": {"name": "Taiwan Weighted", "region": "Taiwan"},
    "^JKSE": {"name": "Jakarta Composite", "region": "Indonesia"},
    "^MXX": {"name": "IPC Mexico", "region": "Mexico"}
}

# ============================================================================
# MARKET UNIVERSE - CRYPTOCURRENCIES
# ============================================================================
CRYPTOCURRENCIES = {
    "BTC-USD": {"name": "Bitcoin", "category": "Crypto"},
    "ETH-USD": {"name": "Ethereum", "category": "Crypto"},
    "BNB-USD": {"name": "Binance Coin", "category": "Crypto"},
    "XRP-USD": {"name": "Ripple", "category": "Crypto"},
    "ADA-USD": {"name": "Cardano", "category": "Crypto"},
    "SOL-USD": {"name": "Solana", "category": "Crypto"},
    "DOGE-USD": {"name": "Dogecoin", "category": "Crypto"},
    "MATIC-USD": {"name": "Polygon", "category": "Crypto"},
    "DOT-USD": {"name": "Polkadot", "category": "Crypto"},
    "AVAX-USD": {"name": "Avalanche", "category": "Crypto"},
    "LINK-USD": {"name": "Chainlink", "category": "Crypto"},
    "UNI-USD": {"name": "Uniswap", "category": "Crypto"},
    "LTC-USD": {"name": "Litecoin", "category": "Crypto"},
    "ATOM-USD": {"name": "Cosmos", "category": "Crypto"},
    "ALGO-USD": {"name": "Algorand", "category": "Crypto"}
}

# ============================================================================
# MARKET UNIVERSE - BONDS & RATES
# ============================================================================
BOND_YIELDS = {
    "^TNX": {"name": "US 10Y Treasury", "category": "Government Bonds"},
    "^TYX": {"name": "US 30Y Treasury", "category": "Government Bonds"},
    "^FVX": {"name": "US 5Y Treasury", "category": "Government Bonds"},
    "^IRX": {"name": "US 13W Treasury", "category": "Government Bonds"},
}

CREDIT_SPREADS = {
    "LQD": {"name": "Investment Grade Credit", "category": "Credit"},
    "HYG": {"name": "High Yield Credit", "category": "Credit"},
    "JNK": {"name": "High Yield Junk Bonds", "category": "Credit"},
    "EMB": {"name": "Emerging Market Bonds", "category": "Credit"},
    "TIP": {"name": "TIPS (Inflation-Protected)", "category": "Government Bonds"},
    "MBB": {"name": "Mortgage-Backed Securities", "category": "Credit"},
    "VCSH": {"name": "Short-Term Corporate", "category": "Credit"},
    "VCIT": {"name": "Intermediate Corporate", "category": "Credit"},
    "VCLT": {"name": "Long-Term Corporate", "category": "Credit"},
    "BKLN": {"name": "Senior Loan (Floating Rate)", "category": "Credit"},
    "ANGL": {"name": "Fallen Angels", "category": "Credit"},
    "SHYG": {"name": "Short Duration High Yield", "category": "Credit"},
}

# ============================================================================
# MARKET UNIVERSE - COMMODITIES
# ============================================================================
COMMODITIES = {
    "GC=F": {"name": "Gold", "category": "Precious Metals"},
    "SI=F": {"name": "Silver", "category": "Precious Metals"},
    "PL=F": {"name": "Platinum", "category": "Precious Metals"},
    "PA=F": {"name": "Palladium", "category": "Precious Metals"},
    "CL=F": {"name": "Crude Oil WTI", "category": "Energy"},
    "BZ=F": {"name": "Brent Crude", "category": "Energy"},
    "NG=F": {"name": "Natural Gas", "category": "Energy"},
    "RB=F": {"name": "Gasoline", "category": "Energy"},
    "HG=F": {"name": "Copper", "category": "Industrial Metals"},
    "ALI=F": {"name": "Aluminum", "category": "Industrial Metals"},
    "ZC=F": {"name": "Corn", "category": "Agriculture"},
    "ZW=F": {"name": "Wheat", "category": "Agriculture"},
    "ZS=F": {"name": "Soybeans", "category": "Agriculture"},
    "KC=F": {"name": "Coffee", "category": "Agriculture"},
    "SB=F": {"name": "Sugar", "category": "Agriculture"},
    "CC=F": {"name": "Cocoa", "category": "Agriculture"},
    "LE=F": {"name": "Live Cattle", "category": "Livestock"},
    "GF=F": {"name": "Feeder Cattle", "category": "Livestock"}
}

# ============================================================================
# SECTOR MAPPINGS FOR ETFs
# ============================================================================
ETF_SECTORS = {
    "SPY": "Broad Market",
    "QQQ": "Technology",
    "DIA": "Broad Market",
    "IWM": "Small Cap",
    "VOO": "Broad Market",
    "VTI": "Broad Market",
    "XLF": "Financial",
    "XLE": "Energy",
    "XLK": "Technology",
    "XLV": "Healthcare",
    "XLI": "Industrial",
    "XLP": "Consumer Staples",
    "XLY": "Consumer Discretionary",
    "XLU": "Utilities",
    "XLRE": "Real Estate",
    "XLB": "Materials",
    "XLC": "Communication Services",
    "GLD": "Commodities",
    "SLV": "Commodities",
    "TLT": "Bonds",
    "AGG": "Bonds",
    "LQD": "Bonds",
    "HYG": "Bonds",
    "EMB": "Bonds",
    "EEM": "Emerging Markets",
    "VWO": "Emerging Markets",
    "EFA": "International",
    "VEA": "International",
}

# ============================================================================
# STREAMLIT PAGE CONFIG
# ============================================================================
PAGE_CONFIG = {
    "page_title": f"ATLAS Terminal v{VERSION}",
    "page_icon": "🚀",
    "layout": "wide",
    "initial_sidebar_state": "expanded"
}
