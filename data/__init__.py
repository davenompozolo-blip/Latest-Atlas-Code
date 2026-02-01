"""
ATLAS Data Layer
SQL database interface, models, and market data.
"""

try:
    from .atlas_db import AtlasDB, get_db
    __all__ = ['AtlasDB', 'get_db']
except ImportError:
    # sqlalchemy not available in all environments
    __all__ = []
