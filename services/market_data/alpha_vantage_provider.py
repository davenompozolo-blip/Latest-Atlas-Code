import os
import logging
from datetime import datetime
import requests
from .base_provider import BaseMarketDataProvider, OHLCVRecord
from .rate_limiter import RateLimiter
logger = logging.getLogger(__name__)
BASE_URL = "https://www.alphavantage.co/query"
# Alpha Vantage function names by interval
FUNCTION_MAP = {
    "1d":  "TIME_SERIES_DAILY_ADJUSTED",
    "1wk": "TIME_SERIES_WEEKLY_ADJUSTED",
    "1mo": "TIME_SERIES_MONTHLY_ADJUSTED",
    "1m":  "TIME_SERIES_INTRADAY",
    "5m":  "TIME_SERIES_INTRADAY",
    "15m": "TIME_SERIES_INTRADAY",
    "30m": "TIME_SERIES_INTRADAY",
    "1h":  "TIME_SERIES_INTRADAY",
}
# Map our interval → Alpha Vantage interval param (intraday only)
INTRADAY_INTERVAL_MAP = {
    "1m":  "1min",
    "5m":  "5min",
    "15m": "15min",
    "30m": "30min",
    "1h":  "60min",
}
# JSON key for each function's time series data
TIME_SERIES_KEY_MAP = {
    "TIME_SERIES_DAILY_ADJUSTED":   "Time Series (Daily)",
    "TIME_SERIES_WEEKLY_ADJUSTED":  "Weekly Adjusted Time Series",
    "TIME_SERIES_MONTHLY_ADJUSTED": "Monthly Adjusted Time Series",
    "TIME_SERIES_INTRADAY":         None,  # dynamic, set per interval
}
class AlphaVantageProvider(BaseMarketDataProvider):
    """
    Fallback market data provider using Alpha Vantage.
    Use cases:
    - Adjusted close prices and split/dividend data
    - Fundamental data (future Atlas feature)
    - Fallback when yfinance is unavailable
    Rate limits:
    - Free tier:    25 calls/day, 5 calls/minute
    - Premium tier: varies by plan
    Set ALPHA_VANTAGE_API_KEY in environment or pass api_key directly.
    """
    provider_name = "alpha_vantage"
    def __init__(self, api_key: str = None, calls_per_minute: int = 5):
        self.api_key = api_key or os.getenv("ALPHA_VANTAGE_API_KEY")
        if not self.api_key:
            raise ValueError(
                "Alpha Vantage API key not provided. "
                "Set ALPHA_VANTAGE_API_KEY environment variable or pass api_key."
            )
        self.rate_limiter = RateLimiter(
            calls_per_minute=calls_per_minute,
            provider_name=self.provider_name
        )
        logger.info(
            f"[alpha_vantage] Provider initialised "
            f"({calls_per_minute} calls/min limit)."
        )
    def fetch_ohlcv(
        self,
        ticker: str,
        start: str,
        end: str,
        interval: str = "1d"
    ) -> list[OHLCVRecord]:
        """
        Fetch OHLCV data from Alpha Vantage.
        Note: Alpha Vantage returns full history regardless of start/end.
        We filter to the requested window after fetching.
        Args:
            ticker:   Ticker symbol (US markets standard).
            start:    Start date as YYYY-MM-DD string.
            end:      End date as YYYY-MM-DD string.
            interval: Data frequency. Default '1d'.
        Returns:
            List of OHLCVRecord objects filtered to start→end range.
        """
        function = FUNCTION_MAP.get(interval)
        if not function:
            raise ValueError(
                f"Unsupported interval '{interval}' for Alpha Vantage. "
                f"Supported: {list(FUNCTION_MAP.keys())}"
            )
        logger.info(
            f"[alpha_vantage] Fetching {ticker} | {start} → {end} | {interval}"
        )
        params = {
            "function": function,
            "symbol": ticker,
            "apikey": self.api_key,
            "outputsize": "full",
            "datatype": "json",
        }
        if function == "TIME_SERIES_INTRADAY":
            params["interval"] = INTRADAY_INTERVAL_MAP[interval]
            params["extended_hours"] = "false"
        self.rate_limiter.wait()
        try:
            response = requests.get(BASE_URL, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            logger.error(f"[alpha_vantage] Request failed for {ticker}: {e}")
            raise
        if "Error Message" in data:
            raise ValueError(
                f"[alpha_vantage] API error for {ticker}: {data['Error Message']}"
            )
        if "Note" in data:
            logger.warning(
                f"[alpha_vantage] Rate limit warning: {data['Note']}"
            )
        # Identify the time series key in the response
        if function == "TIME_SERIES_INTRADAY":
            ts_key = f"Time Series ({INTRADAY_INTERVAL_MAP[interval]})"
        else:
            ts_key = TIME_SERIES_KEY_MAP.get(function)
        time_series = data.get(ts_key, {})
        if not time_series:
            logger.warning(
                f"[alpha_vantage] No time series data in response for {ticker}. "
                f"Keys found: {list(data.keys())}"
            )
            return []
        records = []
        for dt_str, values in time_series.items():
            date_only = dt_str[:10]  # Handles both date and datetime strings
            # Filter to requested window
            if date_only < start or date_only > end:
                continue
            try:
                record = OHLCVRecord(
                    ticker=ticker,
                    date=date_only,
                    interval=interval,
                    open=float(values.get("1. open", 0)),
                    high=float(values.get("2. high", 0)),
                    low=float(values.get("3. low", 0)),
                    close=float(values.get("4. close", 0)),
                    adj_close=(
                        float(values["5. adjusted close"])
                        if "5. adjusted close" in values else None
                    ),
                    volume=int(float(values.get("6. volume", values.get("5. volume", 0)))),
                    provider=self.provider_name,
                )
                records.append(record)
            except Exception as e:
                logger.warning(
                    f"[alpha_vantage] Skipping row {dt_str} for {ticker}: {e}"
                )
                continue
        # Alpha Vantage returns newest-first; sort ascending
        records.sort(key=lambda r: r.date)
        logger.info(
            f"[alpha_vantage] Fetched {len(records)} records for {ticker}."
        )
        return records
    def is_available(self) -> bool:
        """Validate API key with a minimal request."""
        try:
            response = requests.get(
                BASE_URL,
                params={
                    "function": "TIME_SERIES_DAILY",
                    "symbol": "AAPL",
                    "outputsize": "compact",
                    "apikey": self.api_key,
                },
                timeout=10,
            )
            data = response.json()
            return "Time Series (Daily)" in data
        except Exception:
            return False
