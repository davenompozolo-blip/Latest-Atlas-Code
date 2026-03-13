import os
import logging
from .base_provider import BaseMarketDataProvider
from .yfinance_provider import YFinanceProvider
from .alpha_vantage_provider import AlphaVantageProvider
from services.secrets_helper import get_secret
logger = logging.getLogger(__name__)
PROVIDER_REGISTRY = {
    "yfinance": YFinanceProvider,
    "alpha_vantage": AlphaVantageProvider,
}
def get_provider(name: str = "yfinance", **kwargs) -> BaseMarketDataProvider:
    """
    Return an initialised provider instance by name.
    Args:
        name:    Provider name. Options: 'yfinance', 'alpha_vantage'.
        **kwargs: Passed directly to the provider constructor.
                  e.g. get_provider('alpha_vantage', api_key='your_key')
    Returns:
        Initialised BaseMarketDataProvider instance.
    Raises:
        ValueError if the provider name is not registered.
    """
    provider_class = PROVIDER_REGISTRY.get(name)
    if not provider_class:
        raise ValueError(
            f"Unknown provider '{name}'. "
            f"Available providers: {list(PROVIDER_REGISTRY.keys())}"
        )
    logger.info(f"[ProviderFactory] Initialising provider: {name}")
    return provider_class(**kwargs)
def get_default_provider() -> BaseMarketDataProvider:
    """
    Return the default provider for Atlas.
    Uses yfinance as primary. Falls back to Alpha Vantage
    if ALPHA_VANTAGE_API_KEY is set and yfinance is unavailable.
    """
    primary = get_provider("yfinance")
    if primary.is_available():
        return primary
    logger.warning(
        "[ProviderFactory] yfinance unavailable. Attempting Alpha Vantage fallback."
    )
    av_key = get_secret("ALPHA_VANTAGE_API_KEY")
    if av_key:
        return get_provider("alpha_vantage", api_key=av_key)
    raise RuntimeError(
        "No market data provider available. "
        "Check network connection or set ALPHA_VANTAGE_API_KEY."
    )
