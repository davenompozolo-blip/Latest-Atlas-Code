import logging
from datetime import datetime, timedelta
import pandas as pd
import yfinance as yf
from .base_provider import BaseMarketDataProvider, OHLCVRecord
logger = logging.getLogger(__name__)
# Map Atlas interval strings to yfinance interval strings
INTERVAL_MAP = {
    "1d": "1d",
    "1h": "1h",
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1wk": "1wk",
    "1mo": "1mo",
}
# Daily-or-coarser intervals — store date only, no time component
DAILY_INTERVALS = {"1d", "1wk", "1mo"}
class YFinanceProvider(BaseMarketDataProvider):
    """
    Primary market data provider using yfinance.
    Advantages:
    - No API key required
    - No meaningful rate limits at Atlas's current scale
    - Covers JSE tickers (append .JO suffix, e.g. NPN.JO)
    - Returns adjusted close prices
    - Supports intraday data (1m, 5m, 15m, 1h) and daily+
    Limitations:
    - Intraday history limited to last 60 days (1m = 7 days)
    - Not suitable for institutional tick data
    """
    provider_name = "yfinance"
    def __init__(self):
        logger.info("[yfinance] Provider initialised.")
    def fetch_ohlcv(
        self,
        ticker: str,
        start: str,
        end: str,
        interval: str = "1d"
    ) -> list[OHLCVRecord]:
        """
        Fetch OHLCV data from Yahoo Finance for a ticker over a date range.
        
        Parameters:
            ticker (str): Ticker symbol (use '.JO' suffix for JSE tickers, e.g. 'NPN.JO').
            start (str): Start date as 'YYYY-MM-DD' (inclusive).
            end (str): End date as 'YYYY-MM-DD' (inclusive).
            interval (str): Data frequency key (see INTERVAL_MAP); defaults to '1d'.
        
        Notes:
            The function treats the provided `end` as inclusive when querying Yahoo Finance.
            For daily-or-coarser intervals the record `date` stores only the 'YYYY-MM-DD' date;
            for intraday intervals the record `date` stores a full ISO-8601 timestamp so
            multiple bars on the same day do not collide.
        
        Returns:
            list[OHLCVRecord]: OHLCV records for the requested range, sorted ascending by date/datetime.
        """
        yf_interval = INTERVAL_MAP.get(interval)
        if not yf_interval:
            raise ValueError(
                f"Unsupported interval '{interval}'. "
                f"Supported: {list(INTERVAL_MAP.keys())}"
            )
        # yfinance end is exclusive — add 1 day to include the requested end date
        end_dt = datetime.strptime(end, "%Y-%m-%d") + timedelta(days=1)
        end_exclusive = end_dt.strftime("%Y-%m-%d")
        logger.info(
            f"[yfinance] Fetching {ticker} | {start} -> {end} | {interval}"
        )
        try:
            raw = yf.download(
                ticker,
                start=start,
                end=end_exclusive,
                interval=yf_interval,
                auto_adjust=False,   # Keep raw + adj_close separate
                progress=False,
                threads=False,
            )
        except Exception as e:
            logger.error(f"[yfinance] Download failed for {ticker}: {e}")
            raise
        if raw.empty:
            logger.warning(f"[yfinance] No data returned for {ticker}.")
            return []
        # yfinance returns MultiIndex columns when auto_adjust=False
        # Flatten if necessary
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        use_date_only = interval in DAILY_INTERVALS
        records = []
        for dt, row in raw.iterrows():
            if isinstance(dt, pd.Timestamp):
                if use_date_only:
                    date_str = dt.strftime("%Y-%m-%d")
                else:
                    # Preserve full timestamp for intraday bars so that
                    # multiple bars per day don't overwrite each other on upsert
                    date_str = dt.isoformat()
            else:
                date_str = str(dt)[:10] if use_date_only else str(dt)
            try:
                record = OHLCVRecord(
                    ticker=ticker,
                    date=date_str,
                    interval=interval,
                    open=float(row.get("Open", 0)),
                    high=float(row.get("High", 0)),
                    low=float(row.get("Low", 0)),
                    close=float(row.get("Close", 0)),
                    adj_close=float(row["Adj Close"]) if "Adj Close" in row else None,
                    volume=int(row.get("Volume", 0)),
                    provider=self.provider_name,
                )
                records.append(record)
            except Exception as e:
                logger.warning(
                    f"[yfinance] Skipping row {date_str} for {ticker}: {e}"
                )
                continue
        logger.info(
            f"[yfinance] Fetched {len(records)} records for {ticker}."
        )
        return records
    def is_available(self) -> bool:
        """Ping Yahoo Finance with a minimal request."""
        try:
            test = yf.download("AAPL", period="1d", progress=False, threads=False)
            return not test.empty
        except Exception:
            return False
