from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
import pandas as pd
@dataclass
class OHLCVRecord:
    """Standardised OHLCV record across all providers."""
    ticker: str
    date: str               # ISO format: YYYY-MM-DD
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
    a list of OHLCVRecord objects — normalised and provider-agnostic.
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
        Health check — returns True if the provider is reachable
        and credentials (if any) are valid.
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
        Attempt fetch from this provider; if it fails and a fallback
        is provided, try the fallback instead.
        """
        try:
            return self.fetch_ohlcv(ticker, start, end, interval)
        except Exception as e:
            if fallback:
                import logging
                logging.getLogger(__name__).warning(
                    f"[{self.provider_name}] Failed for {ticker}: {e}. "
                    f"Falling back to {fallback.provider_name}."
                )
                return fallback.fetch_ohlcv(ticker, start, end, interval)
            raise
