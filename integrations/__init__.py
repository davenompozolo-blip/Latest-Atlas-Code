"""
ATLAS Integrations Module
=========================
Third-party service integrations (Alpaca, APIs, data sources).

Exports:
    - AlpacaAdapter: Alpaca Markets API
    - InvestopediaIntegration: Investopedia paper trading
"""

from integrations.investopedia import InvestopediaIntegration

try:
    from integrations.atlas_alpaca_integration import AlpacaAdapter
except ImportError:
    AlpacaAdapter = None

__all__ = ['InvestopediaIntegration', 'AlpacaAdapter']
