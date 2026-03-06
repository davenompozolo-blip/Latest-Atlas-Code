"""
ATLAS Configuration Module
==========================
Centralized configuration management.

Usage:
    from config.config import Config, config

    print(config.RISK_FREE_RATE)
    print(config.MAX_WEIGHT)
"""

from config.config import Config, config

__all__ = ['Config', 'config']
