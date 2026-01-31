"""
ATLAS Terminal - Configuration Constants
All configuration values in one place.
"""

from pathlib import Path


# ============================================================================
# THEME COLORS
# ============================================================================

COLORS = {
    "background": "#000000",
    "card_background": "#0a1929",
    "card_background_alt": "#050f17",
    "neon_blue": "#00d4ff",
    "electric_blue": "#0080ff",
    "teal": "#00ffcc",
    "cyan": "#00ffff",
    "success": "#00ff88",
    "warning": "#ffaa00",
    "danger": "#ff0044",
    "info": "#00d4ff",
    "purple": "#b794f6",
    "pink": "#ff00ff",
    "orange": "#ff6b00",
    "chart_primary": "#00d4ff",
    "chart_secondary": "#0080ff",
    "chart_accent": "#00ffcc",
    "chart_grid": "#1a3a52",
    "text_primary": "#ffffff",
    "text_secondary": "#b0c4de",
    "text_muted": "#6c8ca8",
    "border": "#00d4ff",
    "shadow": "rgba(0, 212, 255, 0.3)",
    "shadow_strong": "rgba(0, 212, 255, 0.6)",
    "gain_bg": "rgba(0, 255, 136, 0.15)",
    "gain_text": "#00ff88",
    "loss_bg": "rgba(255, 0, 68, 0.15)",
    "loss_text": "#ff0044",
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


# ============================================================================
# CACHE CONFIGURATION
# ============================================================================

CACHE_DIR = Path.home() / ".atlas_cache"
CACHE_DIR.mkdir(exist_ok=True)
PORTFOLIO_CACHE = CACHE_DIR / "portfolio.pkl"
TRADE_HISTORY_CACHE = CACHE_DIR / "trade_history.pkl"
ACCOUNT_HISTORY_CACHE = CACHE_DIR / "account_history.pkl"


# ============================================================================
# FINANCIAL CONSTANTS
# ============================================================================

RISK_FREE_RATE = 0.045
MARKET_RETURN = 0.10
