"""
ATLAS Terminal - Configuration Constants
All configuration values in one place.
"""

from pathlib import Path


# ============================================================================
# THEME COLORS
# ============================================================================

COLORS = {
    # Backgrounds — design spec tokens
    "background": "#07080f",
    "bg_void": "#07080f",
    "bg_deep": "#0b0d1a",
    "bg_surface": "rgba(255,255,255,0.035)",
    "bg_glass": "rgba(255,255,255,0.05)",
    "card_background": "rgba(255,255,255,0.05)",
    "card_background_alt": "rgba(255,255,255,0.035)",
    # Accent colors — design spec
    "neon_blue": "#6366f1",
    "electric_blue": "#6366f1",
    "teal": "#14b8a6",
    "cyan": "#00d4ff",
    "success": "#10b981",
    "warning": "#f59e0b",
    "danger": "#f43f5e",
    "info": "#6366f1",
    "purple": "#8b5cf6",
    "pink": "#ec4899",
    "orange": "#f97316",
    "chart_primary": "#6366f1",
    "chart_secondary": "#8b5cf6",
    "chart_accent": "#10b981",
    "chart_grid": "rgba(255,255,255,0.05)",
    # Text — design spec hierarchy
    "text_primary": "rgba(255,255,255,0.92)",
    "text_secondary": "rgba(255,255,255,0.52)",
    "text_muted": "rgba(255,255,255,0.28)",
    # Borders — design spec
    "border": "rgba(255,255,255,0.07)",
    "border_bright": "rgba(255,255,255,0.12)",
    "shadow": "rgba(0,0,0,0.3)",
    "shadow_strong": "rgba(0,0,0,0.5)",
    # Gain/loss — design spec green/red
    "gain_bg": "rgba(16, 185, 129, 0.12)",
    "gain_text": "#10b981",
    "loss_bg": "rgba(244, 63, 94, 0.12)",
    "loss_text": "#f43f5e",
}


# ============================================================================
# CHART HEIGHT STANDARDS
# ============================================================================

CHART_HEIGHT_COMPACT = 400        # Small widgets, mini-charts, compact visualizations
CHART_HEIGHT_STANDARD = 500       # Most dashboard charts (default for new charts)
CHART_HEIGHT_LARGE = 600          # Primary analysis charts, yield curves, heatmaps
CHART_HEIGHT_DEEP_DIVE = 700      # Detailed analysis pages, Monte Carlo simulations


# ============================================================================
# CHART THEME - SEAMLESS DARK MODE
# ============================================================================

CHART_THEME = {
    'paper_bgcolor': 'rgba(0,0,0,0)',
    'plot_bgcolor': 'rgba(0,0,0,0)',
    'font': {
        'color': 'rgba(255,255,255,0.52)',
        'family': 'DM Sans, sans-serif',
        'size': 11,
    },
    'xaxis': {
        'gridcolor': 'rgba(255,255,255,0.05)',
        'linecolor': 'rgba(255,255,255,0.07)',
        'zerolinecolor': 'rgba(255,255,255,0.07)',
        'tickfont': {'size': 10},
    },
    'yaxis': {
        'gridcolor': 'rgba(255,255,255,0.05)',
        'linecolor': 'rgba(255,255,255,0.07)',
        'zerolinecolor': 'rgba(255,255,255,0.07)',
        'tickfont': {'size': 10},
    },
    'legend': {
        'bgcolor': 'rgba(255,255,255,0.04)',
        'bordercolor': 'rgba(255,255,255,0.07)',
        'borderwidth': 1,
    },
    'margin': {'l': 40, 'r': 20, 't': 40, 'b': 40},
}


# ============================================================================
# CACHE CONFIGURATION - MUST BE OUTSIDE REPO DIRECTORY
# ============================================================================
import tempfile
import os

# Use temp directory on Streamlit Cloud, home directory locally
if os.environ.get('STREAMLIT_SERVER_HEADLESS'):
    # We're on Streamlit Cloud - use temp directory
    CACHE_DIR = Path(tempfile.gettempdir()) / "atlas_cache"
else:
    # Local development
    CACHE_DIR = Path.home() / ".atlas_cache"

# Create cache directory
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Cache file paths - ALL outside repo
PORTFOLIO_CACHE = CACHE_DIR / "portfolio.pkl"
TRADE_HISTORY_CACHE = CACHE_DIR / "trade_history.pkl"
ACCOUNT_HISTORY_CACHE = CACHE_DIR / "account_history.pkl"


# ============================================================================
# FINANCIAL CONSTANTS
# ============================================================================

RISK_FREE_RATE = 0.045
MARKET_RETURN = 0.10
