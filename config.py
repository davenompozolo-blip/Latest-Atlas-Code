"""
ATLAS TERMINAL v10.0 - CONFIGURATION
====================================

Central configuration file for all ATLAS settings.
"""

import os
from pathlib import Path


# ===================================================================
# PATHS
# ===================================================================

PROJECT_ROOT = Path(__file__).parent.absolute()
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

INVESTOPEDIA_EMAIL = os.getenv('INVESTOPEDIA_EMAIL', 'davenompozolo@gmail.com')
INVESTOPEDIA_PASSWORD = os.getenv('INVESTOPEDIA_PASSWORD', 'Hlobo1hlobo@123')
INVESTOPEDIA_SESSION_FILE = PROJECT_ROOT / "investopedia_session.pkl"


# ===================================================================
# API KEYS
# ===================================================================

ALPHA_VANTAGE_KEY = os.getenv('ALPHA_VANTAGE_KEY', None)
FMP_KEY = os.getenv('FMP_KEY', None)
POLYGON_KEY = os.getenv('POLYGON_KEY', None)
IEX_CLOUD_KEY = os.getenv('IEX_CLOUD_KEY', None)
FINNHUB_KEY = os.getenv('FINNHUB_KEY', None)
BLOOMBERG_AVAILABLE = False


# ===================================================================
# PORTFOLIO SETTINGS
# ===================================================================

DEFAULT_LEVERAGE = 2.0
DEFAULT_RISK_FREE_RATE = 0.03
DEFAULT_MIN_WEIGHT = 0.05
DEFAULT_MAX_WEIGHT = 0.30
DEFAULT_LONG_ONLY = True
DEFAULT_VAR_CONFIDENCE = 0.95
DEFAULT_MONTE_CARLO_SIMULATIONS = 10000

# Transaction costs (added for compatibility)
TRANSACTION_COSTS = 0.001  # 0.1% transaction cost


# ===================================================================
# DATA SOURCE SETTINGS
# ===================================================================

ENABLE_YAHOO_FINANCE = True
ENABLE_ALPHA_VANTAGE = bool(ALPHA_VANTAGE_KEY)
ENABLE_FMP = bool(FMP_KEY)
ENABLE_POLYGON = bool(POLYGON_KEY)
ENABLE_IEX_CLOUD = bool(IEX_CLOUD_KEY)
ENABLE_FINNHUB = bool(FINNHUB_KEY)
ENABLE_INVESTING_COM = True
ENABLE_MARKETWATCH = True
ENABLE_BLOOMBERG = BLOOMBERG_AVAILABLE

RATE_LIMIT_ALPHA_VANTAGE = 0.083
RATE_LIMIT_YAHOO = 1.0
RATE_LIMIT_FMP = 0.5
RATE_LIMIT_POLYGON = 1.0
RATE_LIMIT_IEX = 1.0
RATE_LIMIT_WEB_SCRAPING = 0.5


# ===================================================================
# CACHE SETTINGS
# ===================================================================

CACHE_DURATION_REAL_TIME = 15
CACHE_DURATION_FRESH = 60
CACHE_DURATION_RECENT = 300
CACHE_DURATION_STALE = 3600
DEFAULT_CACHE_TIER = 'tier2'

# Cache TTL (added for compatibility)
CACHE_TTL = 60  # 60 seconds default


# ===================================================================
# LIVE DATA SETTINGS
# ===================================================================

AUTO_REFRESH_MARKET_OPEN = 15
AUTO_REFRESH_PRE_MARKET = 60
AUTO_REFRESH_AFTER_HOURS = 60
AUTO_REFRESH_MARKET_CLOSED = 300

MARKET_OPEN_HOUR = 9
MARKET_OPEN_MINUTE = 30
MARKET_CLOSE_HOUR = 16
MARKET_CLOSE_MINUTE = 0
MARKET_TIMEZONE = "America/New_York"


# ===================================================================
# UI SETTINGS
# ===================================================================

PAGE_TITLE = "ATLAS Terminal v10.0"
PAGE_ICON = "🚀"
LAYOUT = "wide"
INITIAL_SIDEBAR_STATE = "expanded"

PRIMARY_COLOR = "#1f77b4"
BACKGROUND_COLOR = "#0e1117"
SECONDARY_BACKGROUND_COLOR = "#262730"
TEXT_COLOR = "#fafafa"

DEFAULT_CHART_HEIGHT = 400
DEFAULT_CHART_WIDTH = 800


# ===================================================================
# OPTIMIZATION SETTINGS
# ===================================================================

OPTIMIZATION_METHOD = 'SLSQP'
MAX_ITERATIONS = 1000
FUNCTION_TOLERANCE = 1e-9
GRADIENT_TOLERANCE = 1e-6
WEIGHT_CHANGE_TOLERANCE = 1e-6


# ===================================================================
# LOGGING SETTINGS
# ===================================================================

LOG_LEVEL = "INFO"
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
LOG_DATE_FORMAT = '%Y-%m-%d %H:%M:%S'
LOG_FILE = LOGS_DIR / "atlas_terminal.log"
LOG_MAX_BYTES = 10 * 1024 * 1024
LOG_BACKUP_COUNT = 5


# ===================================================================
# SECURITY SETTINGS
# ===================================================================

SESSION_TIMEOUT = 3600
MAX_LOGIN_ATTEMPTS = 3
MIN_PASSWORD_LENGTH = 8
REQUIRE_UPPERCASE = True
REQUIRE_LOWERCASE = True
REQUIRE_DIGITS = True
REQUIRE_SPECIAL_CHARS = True


# ===================================================================
# PERFORMANCE SETTINGS
# ===================================================================

MAX_WORKERS = 4
REQUEST_TIMEOUT = 10
MAX_RETRIES = 3


# ===================================================================
# DATABASE SETTINGS
# ===================================================================

DATABASE_FILE = DATA_DIR / "atlas_terminal.db"
DB_POOL_SIZE = 5


# ===================================================================
# EMAIL SETTINGS
# ===================================================================

SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
SMTP_USERNAME = os.getenv('SMTP_USERNAME', None)
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', None)
SMTP_USE_TLS = True
NOTIFICATION_EMAIL = os.getenv('NOTIFICATION_EMAIL', INVESTOPEDIA_EMAIL)


# ===================================================================
# FEATURE FLAGS
# ===================================================================

ENABLE_QUANT_OPTIMIZER = True
ENABLE_INVESTOPEDIA_INTEGRATION = True
ENABLE_MULTI_SOURCE_DATA = True
ENABLE_LIVE_DATA = True
ENABLE_AUTO_REFRESH = True
ENABLE_MONTE_CARLO = True
ENABLE_EFFICIENT_FRONTIER = True
ENABLE_RISK_METRICS = True

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

    # Check directories
    for directory in [DATA_DIR, CACHE_DIR, OUTPUT_DIR, LOGS_DIR]:
        if not directory.exists():
            errors.append(f"Directory does not exist: {directory}")

    # Check leverage
    if DEFAULT_LEVERAGE < 1.0 or DEFAULT_LEVERAGE > 5.0:
        errors.append(f"Invalid leverage: {DEFAULT_LEVERAGE}")

    # Check weights
    if DEFAULT_MIN_WEIGHT < 0 or DEFAULT_MIN_WEIGHT > 1:
        errors.append(f"Invalid min_weight: {DEFAULT_MIN_WEIGHT}")

    if DEFAULT_MAX_WEIGHT < 0 or DEFAULT_MAX_WEIGHT > 1:
        errors.append(f"Invalid max_weight: {DEFAULT_MAX_WEIGHT}")

    if DEFAULT_MIN_WEIGHT > DEFAULT_MAX_WEIGHT:
        errors.append("min_weight cannot be greater than max_weight")

    return errors, warnings


# ===================================================================
# LOAD LOCAL CONFIG
# ===================================================================

try:
    from config_local import *
    print("✅ Loaded local configuration overrides")
except ImportError:
    pass


# ===================================================================
# MAIN
# ===================================================================

if __name__ == "__main__":
    print("="*80)
    print("ATLAS TERMINAL v10.0 - CONFIGURATION")
    print("="*80)

    print(f"\n📁 Paths:")
    print(f"   Project Root: {PROJECT_ROOT}")
    print(f"   Data Dir: {DATA_DIR}")

    print(f"\n💼 Portfolio Settings:")
    print(f"   Default Leverage: {DEFAULT_LEVERAGE}x")
    print(f"   Risk-Free Rate: {DEFAULT_RISK_FREE_RATE*100:.1f}%")
    print(f"   Transaction Costs: {TRANSACTION_COSTS*100:.3f}%")
    print(f"   Cache TTL: {CACHE_TTL} seconds")

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
