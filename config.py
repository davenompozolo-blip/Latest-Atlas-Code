"""
ATLAS TERMINAL v10.0 - CONFIGURATION
====================================

Central configuration file for all ATLAS settings.

IMPORTANT: This is a TEMPLATE file with default/example values.
For production, copy to config_local.py and customize.
"""

import os
from pathlib import Path


# ===================================================================
# PATHS
# ===================================================================

# Project root directory
PROJECT_ROOT = Path(__file__).parent.absolute()

# Data directories
DATA_DIR = PROJECT_ROOT / "data"
CACHE_DIR = PROJECT_ROOT / "cache"
OUTPUT_DIR = PROJECT_ROOT / "output"
LOGS_DIR = PROJECT_ROOT / "logs"

# Create directories if they don't exist
for directory in [DATA_DIR, CACHE_DIR, OUTPUT_DIR, LOGS_DIR]:
    directory.mkdir(exist_ok=True)


# ===================================================================
# INVESTOPEDIA CREDENTIALS
# ===================================================================

# For development (embedded credentials)
INVESTOPEDIA_EMAIL = os.getenv('INVESTOPEDIA_EMAIL', 'davenompozolo@gmail.com')
INVESTOPEDIA_PASSWORD = os.getenv('INVESTOPEDIA_PASSWORD', 'Hlobo1hlobo@123')

# Session persistence
INVESTOPEDIA_SESSION_FILE = PROJECT_ROOT / "investopedia_session.pkl"


# ===================================================================
# API KEYS
# ===================================================================

# Alpha Vantage (free tier: 5 calls/min)
# Get your key at: https://www.alphavantage.co/support/#api-key
ALPHA_VANTAGE_KEY = os.getenv('ALPHA_VANTAGE_KEY', None)

# Financial Modeling Prep (free tier: 250 calls/day)
# Get your key at: https://financialmodelingprep.com/developer/docs/
FMP_KEY = os.getenv('FMP_KEY', None)

# Polygon.io (paid: $29+/month)
# Get your key at: https://polygon.io/
POLYGON_KEY = os.getenv('POLYGON_KEY', None)

# IEX Cloud (free tier available)
# Get your key at: https://iexcloud.io/
IEX_CLOUD_KEY = os.getenv('IEX_CLOUD_KEY', None)

# Finnhub (free tier available)
# Get your key at: https://finnhub.io/
FINNHUB_KEY = os.getenv('FINNHUB_KEY', None)

# Bloomberg Terminal (requires $24k/year subscription)
BLOOMBERG_AVAILABLE = False


# ===================================================================
# PORTFOLIO SETTINGS
# ===================================================================

# Default portfolio settings
DEFAULT_LEVERAGE = 2.0  # 2x margin
DEFAULT_RISK_FREE_RATE = 0.03  # 3% annual

# Optimization constraints
DEFAULT_MIN_WEIGHT = 0.05  # Min 5% per position
DEFAULT_MAX_WEIGHT = 0.30  # Max 30% per position
DEFAULT_LONG_ONLY = True  # No shorting by default

# Risk metrics
DEFAULT_VAR_CONFIDENCE = 0.95  # 95% confidence for VaR
DEFAULT_MONTE_CARLO_SIMULATIONS = 10000


# ===================================================================
# DATA SOURCE SETTINGS
# ===================================================================

# Enable/disable data sources
ENABLE_YAHOO_FINANCE = True  # Free, no API key needed
ENABLE_ALPHA_VANTAGE = bool(ALPHA_VANTAGE_KEY)
ENABLE_FMP = bool(FMP_KEY)
ENABLE_POLYGON = bool(POLYGON_KEY)
ENABLE_IEX_CLOUD = bool(IEX_CLOUD_KEY)
ENABLE_FINNHUB = bool(FINNHUB_KEY)
ENABLE_INVESTING_COM = True  # Web scraping
ENABLE_MARKETWATCH = True  # Web scraping
ENABLE_BLOOMBERG = BLOOMBERG_AVAILABLE

# Rate limiting (requests per second)
RATE_LIMIT_ALPHA_VANTAGE = 0.083  # 5 per minute
RATE_LIMIT_YAHOO = 1.0
RATE_LIMIT_FMP = 0.5
RATE_LIMIT_POLYGON = 1.0
RATE_LIMIT_IEX = 1.0
RATE_LIMIT_WEB_SCRAPING = 0.5  # Be gentle


# ===================================================================
# CACHE SETTINGS
# ===================================================================

# Cache durations (seconds)
CACHE_DURATION_REAL_TIME = 15  # 15 seconds
CACHE_DURATION_FRESH = 60  # 1 minute
CACHE_DURATION_RECENT = 300  # 5 minutes
CACHE_DURATION_STALE = 3600  # 1 hour

# Default cache tier
DEFAULT_CACHE_TIER = 'tier2'  # 1 minute


# ===================================================================
# LIVE DATA SETTINGS
# ===================================================================

# Auto-refresh intervals (seconds)
AUTO_REFRESH_MARKET_OPEN = 15  # 15 seconds during market hours
AUTO_REFRESH_PRE_MARKET = 60  # 1 minute pre-market
AUTO_REFRESH_AFTER_HOURS = 60  # 1 minute after hours
AUTO_REFRESH_MARKET_CLOSED = 300  # 5 minutes when closed

# Market hours (Eastern Time)
MARKET_OPEN_HOUR = 9
MARKET_OPEN_MINUTE = 30
MARKET_CLOSE_HOUR = 16
MARKET_CLOSE_MINUTE = 0

# Timezone
MARKET_TIMEZONE = "America/New_York"


# ===================================================================
# UI SETTINGS
# ===================================================================

# Streamlit page config
PAGE_TITLE = "ATLAS Terminal v10.0"
PAGE_ICON = "🚀"
LAYOUT = "wide"
INITIAL_SIDEBAR_STATE = "expanded"

# Theme colors
PRIMARY_COLOR = "#1f77b4"
BACKGROUND_COLOR = "#0e1117"
SECONDARY_BACKGROUND_COLOR = "#262730"
TEXT_COLOR = "#fafafa"

# Chart settings
DEFAULT_CHART_HEIGHT = 400
DEFAULT_CHART_WIDTH = 800


# ===================================================================
# OPTIMIZATION SETTINGS
# ===================================================================

# Scipy optimization parameters
OPTIMIZATION_METHOD = 'SLSQP'  # Sequential Least Squares Programming
MAX_ITERATIONS = 1000
FUNCTION_TOLERANCE = 1e-9

# Convergence criteria
GRADIENT_TOLERANCE = 1e-6
WEIGHT_CHANGE_TOLERANCE = 1e-6


# ===================================================================
# LOGGING SETTINGS
# ===================================================================

# Log level: DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_LEVEL = "INFO"

# Log format
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
LOG_DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

# Log file
LOG_FILE = LOGS_DIR / "atlas_terminal.log"

# Rotate logs
LOG_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
LOG_BACKUP_COUNT = 5


# ===================================================================
# SECURITY SETTINGS
# ===================================================================

# Session timeout (seconds)
SESSION_TIMEOUT = 3600  # 1 hour

# Max login attempts
MAX_LOGIN_ATTEMPTS = 3

# Password requirements (if implementing user auth)
MIN_PASSWORD_LENGTH = 8
REQUIRE_UPPERCASE = True
REQUIRE_LOWERCASE = True
REQUIRE_DIGITS = True
REQUIRE_SPECIAL_CHARS = True


# ===================================================================
# PERFORMANCE SETTINGS
# ===================================================================

# Number of worker threads for parallel data fetching
MAX_WORKERS = 4

# Timeout for HTTP requests (seconds)
REQUEST_TIMEOUT = 10

# Max retries for failed requests
MAX_RETRIES = 3


# ===================================================================
# DATABASE SETTINGS (if using)
# ===================================================================

# SQLite database file
DATABASE_FILE = DATA_DIR / "atlas_terminal.db"

# Connection pool size
DB_POOL_SIZE = 5


# ===================================================================
# EMAIL SETTINGS (for notifications)
# ===================================================================

# SMTP settings
SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
SMTP_USERNAME = os.getenv('SMTP_USERNAME', None)
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', None)
SMTP_USE_TLS = True

# Email addresses
NOTIFICATION_EMAIL = os.getenv('NOTIFICATION_EMAIL', INVESTOPEDIA_EMAIL)


# ===================================================================
# FEATURE FLAGS
# ===================================================================

# Enable/disable features
ENABLE_QUANT_OPTIMIZER = True
ENABLE_INVESTOPEDIA_INTEGRATION = True
ENABLE_MULTI_SOURCE_DATA = True
ENABLE_LIVE_DATA = True
ENABLE_AUTO_REFRESH = True
ENABLE_MONTE_CARLO = True
ENABLE_EFFICIENT_FRONTIER = True
ENABLE_RISK_METRICS = True

# Experimental features
ENABLE_MACHINE_LEARNING = False
ENABLE_SENTIMENT_ANALYSIS = False
ENABLE_OPTIONS_STRATEGIES = False
ENABLE_CRYPTO = False


# ===================================================================
# VALIDATION
# ===================================================================

def validate_config():
    """Validate configuration settings"""

    errors = []
    warnings = []

    # Check API keys
    if not ALPHA_VANTAGE_KEY:
        warnings.append("Alpha Vantage API key not set - source disabled")

    if not FMP_KEY:
        warnings.append("Financial Modeling Prep API key not set - source disabled")

    # Check directories exist
    for directory in [DATA_DIR, CACHE_DIR, OUTPUT_DIR, LOGS_DIR]:
        if not directory.exists():
            errors.append(f"Directory does not exist: {directory}")

    # Check leverage is valid
    if DEFAULT_LEVERAGE < 1.0 or DEFAULT_LEVERAGE > 5.0:
        errors.append(f"Invalid leverage: {DEFAULT_LEVERAGE} (must be 1.0-5.0)")

    # Check weights are valid
    if DEFAULT_MIN_WEIGHT < 0 or DEFAULT_MIN_WEIGHT > 1:
        errors.append(f"Invalid min_weight: {DEFAULT_MIN_WEIGHT}")

    if DEFAULT_MAX_WEIGHT < 0 or DEFAULT_MAX_WEIGHT > 1:
        errors.append(f"Invalid max_weight: {DEFAULT_MAX_WEIGHT}")

    if DEFAULT_MIN_WEIGHT > DEFAULT_MAX_WEIGHT:
        errors.append("min_weight cannot be greater than max_weight")

    return errors, warnings


# ===================================================================
# LOAD LOCAL CONFIG (if exists)
# ===================================================================

try:
    from config_local import *
    print("✅ Loaded local configuration overrides")
except ImportError:
    pass


# ===================================================================
# INITIALIZATION
# ===================================================================

if __name__ == "__main__":
    print("="*80)
    print("ATLAS TERMINAL v10.0 - CONFIGURATION")
    print("="*80)

    print(f"\n📁 Paths:")
    print(f"   Project Root: {PROJECT_ROOT}")
    print(f"   Data Dir: {DATA_DIR}")
    print(f"   Cache Dir: {CACHE_DIR}")
    print(f"   Output Dir: {OUTPUT_DIR}")
    print(f"   Logs Dir: {LOGS_DIR}")

    print(f"\n🔐 Credentials:")
    print(f"   Investopedia Email: {INVESTOPEDIA_EMAIL}")
    print(f"   Investopedia Password: {'*' * len(INVESTOPEDIA_PASSWORD)}")

    print(f"\n🔑 API Keys:")
    print(f"   Alpha Vantage: {'✅ Set' if ALPHA_VANTAGE_KEY else '❌ Not set'}")
    print(f"   FMP: {'✅ Set' if FMP_KEY else '❌ Not set'}")
    print(f"   Polygon: {'✅ Set' if POLYGON_KEY else '❌ Not set'}")
    print(f"   IEX Cloud: {'✅ Set' if IEX_CLOUD_KEY else '❌ Not set'}")
    print(f"   Finnhub: {'✅ Set' if FINNHUB_KEY else '❌ Not set'}")

    print(f"\n🌐 Data Sources:")
    print(f"   Yahoo Finance: {'✅' if ENABLE_YAHOO_FINANCE else '❌'}")
    print(f"   Alpha Vantage: {'✅' if ENABLE_ALPHA_VANTAGE else '❌'}")
    print(f"   FMP: {'✅' if ENABLE_FMP else '❌'}")
    print(f"   Polygon: {'✅' if ENABLE_POLYGON else '❌'}")
    print(f"   IEX Cloud: {'✅' if ENABLE_IEX_CLOUD else '❌'}")
    print(f"   Bloomberg: {'✅' if ENABLE_BLOOMBERG else '❌'}")

    print(f"\n💼 Portfolio Settings:")
    print(f"   Default Leverage: {DEFAULT_LEVERAGE}x")
    print(f"   Risk-Free Rate: {DEFAULT_RISK_FREE_RATE*100:.1f}%")
    print(f"   Min Weight: {DEFAULT_MIN_WEIGHT*100:.0f}%")
    print(f"   Max Weight: {DEFAULT_MAX_WEIGHT*100:.0f}%")
    print(f"   Long Only: {DEFAULT_LONG_ONLY}")

    print(f"\n✅ Validation:")
    errors, warnings = validate_config()

    if errors:
        print("❌ Errors:")
        for error in errors:
            print(f"   - {error}")

    if warnings:
        print("⚠️ Warnings:")
        for warning in warnings:
            print(f"   - {warning}")

    if not errors and not warnings:
        print("   All checks passed!")

    print("\n" + "="*80)
