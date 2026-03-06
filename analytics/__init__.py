"""
ATLAS Analytics Module
======================

Advanced analytics and stochastic modeling
"""

from .stochastic import StochasticEngine, PortfolioMonteCarloEngine, MonteCarloResults

__all__ = [
    'StochasticEngine',
    'PortfolioMonteCarloEngine',
    'MonteCarloResults',
    'RegimeDetector',
    'SectorTrendAnalyzer',
    'DCFRegimeOverlay',
]

try:
    from .regime_detector import RegimeDetector
except ImportError:
    RegimeDetector = None

try:
    from .sector_trend_analyzer import SectorTrendAnalyzer
except ImportError:
    SectorTrendAnalyzer = None

try:
    from .dcf_regime_overlay import DCFRegimeOverlay
except ImportError:
    DCFRegimeOverlay = None
