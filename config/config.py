"""
ATLAS Configuration
Central configuration for portfolio optimization and trading
"""

# Risk-free rate (annual)
RISK_FREE_RATE = 0.045  # 4.5%

# Portfolio optimization defaults
DEFAULT_LEVERAGE = 2.0  # 2x leverage
MIN_WEIGHT = 0.05  # 5% minimum position size
MAX_WEIGHT = 0.30  # 30% maximum position size

# API Keys (load from environment or set here)
import os
ALPHA_VANTAGE_API_KEY = os.getenv('ALPHA_VANTAGE_API_KEY', '')
FMP_API_KEY = os.getenv('FMP_API_KEY', '')

# Market parameters
MARKET_RETURN = 0.10  # 10% expected market return

# Data settings
DATA_CACHE_HOURS = 24
MAX_RETRIES = 3
REQUEST_TIMEOUT = 30

# Performance History Settings
PERFORMANCE_HISTORY_PATH = None  # Set this to your performance-history.xls path for auto-load

# User settings file for persistent configuration
import json
from pathlib import Path

USER_SETTINGS_FILE = Path(__file__).parent / '.atlas_user_settings.json'

def load_user_settings():
    """Load user settings from JSON file"""
    if USER_SETTINGS_FILE.exists():
        try:
            with open(USER_SETTINGS_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_user_settings(settings):
    """Save user settings to JSON file"""
    try:
        with open(USER_SETTINGS_FILE, 'w') as f:
            json.dump(settings, f, indent=2)
        return True
    except:
        return False

def get_performance_history_path():
    """Get saved performance history file path"""
    settings = load_user_settings()
    return settings.get('performance_history_path')

def set_performance_history_path(path):
    """Save performance history file path for auto-loading"""
    settings = load_user_settings()
    settings['performance_history_path'] = str(path) if path else None
    return save_user_settings(settings)


class Config:
    """Configuration class for easy access"""
    RISK_FREE_RATE = RISK_FREE_RATE
    DEFAULT_LEVERAGE = DEFAULT_LEVERAGE
    MIN_WEIGHT = MIN_WEIGHT
    MAX_WEIGHT = MAX_WEIGHT
    ALPHA_VANTAGE_API_KEY = ALPHA_VANTAGE_API_KEY
    FMP_API_KEY = FMP_API_KEY
    MARKET_RETURN = MARKET_RETURN
    DATA_CACHE_HOURS = DATA_CACHE_HOURS
    MAX_RETRIES = MAX_RETRIES
    REQUEST_TIMEOUT = REQUEST_TIMEOUT


# Create singleton instance
config = Config()
