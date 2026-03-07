import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
logger = logging.getLogger(__name__)
@dataclass
class OHLCVRecord:
    """Standardised OHLCV record across all providers."""
    ticker: str
    date: str               # YYYY-MM-DD for daily; ISO-8601 timestamp for intraday
    interval: str           # '1d', '1h', '1m'
    open: float
    high: float
    low: float
    close: float
    adj_close: Optional[float]
    volume: int
    provider: str
class BaseMarketDataProvider(ABC):
    """
    Abstract base class for all market data providers.
    Every provider must implement fetch_ohlcv and return
    a list of OHLCVRecord objects -- normalised and provider-agnostic.
    """
    provider_name: str = "base"
    @abstractmethod
    def fetch_ohlcv(
        self,
        ticker: str,
        start: str,          # YYYY-MM-DD
        end: str,            # YYYY-MM-DD
        interval: str = "1d"
    ) -> list[OHLCVRecord]:
        """
        Fetch OHLCV data for a ticker between start and end dates.
        Returns a list of OHLCVRecord objects.
        """
        pass
    @abstractmethod
    def is_available(self) -> bool:
        """
        Perform a health check to verify that the provider is reachable and any credentials are valid.
        
        Returns:
            True if the provider is reachable and credentials (if any) are valid, False otherwise.
        """
        pass
    def fetch_with_fallback(
        self,
        ticker: str,
        start: str,
        end: str,
        interval: str = "1d",
        fallback: Optional["BaseMarketDataProvider"] = None
    ) -> list[OHLCVRecord]:
        """
        Fetch OHLCV data for a ticker from this provider, falling back to an alternative provider if this provider fails.
        
        If this provider raises an exception during fetch and a `fallback` provider is supplied, this function logs a warning and returns the result from `fallback.fetch_ohlcv(...)`. If no `fallback` is provided, the original exception is propagated.
        
        Parameters:
            fallback (Optional[BaseMarketDataProvider]): Provider to use if this provider's fetch fails.
        
        Returns:
            list[OHLCVRecord]: OHLCV records for the requested ticker, date range, and interval.
        """
        try:
            return self.fetch_ohlcv(ticker, start, end, interval)
        except Exception as e:
            if fallback:
                logger.warning(
                    f"[{self.provider_name}] Failed for {ticker}: {e}. "
                    f"Falling back to {fallback.provider_name}."
                )
                return fallback.fetch_ohlcv(ticker, start, end, interval)
            raise
