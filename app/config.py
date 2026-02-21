"""
ATLAS Terminal - Configuration Constants
All configuration values in one place.
"""

from pathlib import Path


# ============================================================================
# THEME COLORS
# ============================================================================

COLORS = {
    "background": "#080a14",
    "card_background": "rgba(15, 18, 35, 0.45)",
    "card_background_alt": "rgba(15, 18, 35, 0.6)",
    "neon_blue": "#818cf8",
    "electric_blue": "#6366f1",
    "teal": "#14b8a6",
    "cyan": "#22d3ee",
    "success": "#10b981",
    "warning": "#f59e0b",
    "danger": "#ef4444",
    "info": "#6366f1",
    "purple": "#8b5cf6",
    "pink": "#ec4899",
    "orange": "#f97316",
    "chart_primary": "#818cf8",
    "chart_secondary": "#6366f1",
    "chart_accent": "#a5b4fc",
    "chart_grid": "rgba(99, 102, 241, 0.07)",
    "text_primary": "#f8fafc",
    "text_secondary": "#94a3b8",
    "text_muted": "#64748b",
    "border": "rgba(99, 102, 241, 0.15)",
    "shadow": "rgba(99, 102, 241, 0.2)",
    "shadow_strong": "rgba(99, 102, 241, 0.4)",
    "gain_bg": "rgba(16, 185, 129, 0.12)",
    "gain_text": "#10b981",
    "loss_bg": "rgba(239, 68, 68, 0.12)",
    "loss_text": "#ef4444",
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
