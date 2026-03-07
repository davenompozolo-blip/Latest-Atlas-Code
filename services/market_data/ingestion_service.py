"""
market_data_ingestion.py
------------------------
Orchestrates the full market data pipeline for Atlas:
  1. Determine which tickers need data
  2. Check Supabase for existing coverage (gap detection)
  3. Fetch only missing data from the provider
  4. Normalise and upsert into price_history
Designed to be idempotent -- safe to run multiple times.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional
from .base_provider import BaseMarketDataProvider, OHLCVRecord
from .provider_factory import get_default_provider
logger = logging.getLogger(__name__)
# Default historical backfill window for new assets
DEFAULT_BACKFILL_YEARS = 5
# Intervals that are date-only (YYYY-MM-DD) vs timestamp-based
DAILY_INTERVALS = {"1d", "1wk", "1mo"}
# Trading calendar: simple weekday filter (extend later with pandas_market_calendars)
def _generate_trading_dates(start: str, end: str) -> set[str]:
    """
    Generate expected trading dates between two dates, inclusive.
    
    Start and end must be strings in YYYY-MM-DD format. Weekends are excluded; market holidays are not considered. This function is intended for daily/weekly/monthly gap detection only—intraday gap detection is unsupported.
    
    Parameters:
        start (str): Start date as 'YYYY-MM-DD'.
        end (str): End date as 'YYYY-MM-DD'.
    
    Returns:
        set[str]: Set of trading date strings in 'YYYY-MM-DD' format between start and end, inclusive.
    """
    start_dt = datetime.strptime(start, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end, "%Y-%m-%d").date()
    trading_dates = set()
    current = start_dt
    while current <= end_dt:
        if current.weekday() < 5:  # Mon=0 ... Fri=4
            trading_dates.add(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)
    return trading_dates
class MarketDataIngestionService:
    """
    Main service for ingesting and maintaining the Atlas price_history table.
    Usage:
        from services.supabase_client import get_supabase_client
        supabase = get_supabase_client()
        service = MarketDataIngestionService(supabase)
        # Sync a single ticker
        service.sync_ticker("AAPL", interval="1d")
        # Sync all tickers in a portfolio
        service.sync_portfolio(portfolio_id="uuid-here")
    """
    def __init__(self, supabase_client, provider: Optional[BaseMarketDataProvider] = None):
        """
        Initialize the ingestion service with a Supabase client and an optional explicit market data provider.
        
        Parameters:
            supabase_client: Initialized Supabase client used for database operations.
            provider: Optional explicit BaseMarketDataProvider to use for all syncs. If not provided, the active provider will be resolved at sync time to avoid binding to a provider during startup.
        """
        self.supabase = supabase_client
        self._explicit_provider = provider  # None = resolve at sync time
        if provider:
            logger.info(
                f"[Ingestion] Initialised with explicit provider: {provider.provider_name}"
            )
        else:
            logger.info("[Ingestion] Initialised. Provider will be resolved at sync time.")
    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def sync_ticker(
        self,
        ticker: str,
        interval: str = "1d",
        start: Optional[str] = None,
        end: Optional[str] = None,
        force_full: bool = False,
    ) -> int:
        """
        Sync price history for a single ticker into the price_history table.
        
        Parameters:
            ticker (str): Ticker symbol (e.g. "AAPL", "NPN.JO").
            interval (str): Data frequency (e.g. "1d", "1wk"). Defaults to "1d".
            start (Optional[str]): Override start date in YYYY-MM-DD; when omitted uses the service's default backfill start.
            end (Optional[str]): Override end date in YYYY-MM-DD; when omitted uses today's date.
            force_full (bool): If True, fetches and upserts the entire requested range rather than only missing dates.
        
        Returns:
            int: Number of records upserted (0 if no data was fetched).
        """
        provider = self._resolve_provider()
        end_date = end or date.today().strftime("%Y-%m-%d")
        start_date = start or self._default_start_date()
        asset_id = self._get_or_create_asset(ticker)
        if force_full or interval not in DAILY_INTERVALS:
            # Intraday: always fetch the full requested range (gap detection
            # would require timestamp-level comparison which is not implemented)
            missing_ranges = [(start_date, end_date)]
        else:
            missing_ranges = self._get_missing_ranges(
                asset_id, ticker, interval, start_date, end_date
            )
        if not missing_ranges:
            logger.info(f"[Ingestion] {ticker} is up to date. Nothing to fetch.")
            return 0
        total_upserted = 0
        for range_start, range_end in missing_ranges:
            logger.info(
                f"[Ingestion] Fetching {ticker} | {range_start} -> {range_end}"
            )
            try:
                records = provider.fetch_ohlcv(ticker, range_start, range_end, interval)
            except Exception as fetch_err:
                # If the primary provider fails mid-sync, try the fallback once
                fallback = self._get_fallback_provider(provider)
                if fallback:
                    logger.warning(
                        f"[Ingestion] Primary provider failed for {ticker}: {fetch_err}. "
                        f"Retrying with {fallback.provider_name}."
                    )
                    records = fallback.fetch_ohlcv(ticker, range_start, range_end, interval)
                else:
                    raise
            if records:
                upserted = self._upsert_records(asset_id, records)
                total_upserted += upserted
        logger.info(
            f"[Ingestion] {ticker}: {total_upserted} records upserted."
        )
        return total_upserted
    def sync_portfolio(
        self,
        portfolio_id: str,
        interval: str = "1d",
        force_full: bool = False,
    ) -> dict[str, int]:
        """
        Synchronizes price history for every ticker currently held in the given portfolio.
        
        Parameters:
            portfolio_id (str): Supabase portfolio UUID whose positions determine tickers to sync.
            interval (str): Data frequency to sync (e.g., "1d", "1wk", "1mo"). Defaults to "1d".
            force_full (bool): If True, re-fetches the entire available history for each ticker instead of only missing ranges.
        
        Returns:
            dict[str, int]: Mapping from ticker symbol to the number of records upserted for that ticker.
        """
        tickers = self._get_portfolio_tickers(portfolio_id)
        if not tickers:
            logger.warning(
                f"[Ingestion] No tickers found for portfolio {portfolio_id}."
            )
            return {}
        logger.info(
            f"[Ingestion] Syncing {len(tickers)} tickers for portfolio {portfolio_id}."
        )
        results = {}
        for ticker in tickers:
            try:
                results[ticker] = self.sync_ticker(
                    ticker, interval=interval, force_full=force_full
                )
            except Exception as e:
                logger.exception(
                    f"[Ingestion] Failed to sync {ticker}: {e}"
                )
                results[ticker] = 0
        return results
    def sync_all_assets(
        self,
        interval: str = "1d",
        force_full: bool = False,
    ) -> dict[str, int]:
        """
        Trigger a full sync of price history for every asset in the assets table (typically used by a nightly job).
        
        Parameters:
            interval (str): OHLCV interval to sync (e.g., "1d", "1wk", "1mo").
            force_full (bool): If True, fetch full ranges for each asset instead of only missing data.
        
        Returns:
            dict[str, int]: Mapping from asset symbol (ticker) to the number of upserted records for that ticker.
        """
        assets = self._get_all_assets()
        logger.info(f"[Ingestion] Nightly sync: {len(assets)} assets.")
        results = {}
        for asset in assets:
            ticker = asset.get("symbol")
            if not ticker:
                continue
            try:
                results[ticker] = self.sync_ticker(
                    ticker, interval=interval, force_full=force_full
                )
            except Exception as e:
                logger.exception(f"[Ingestion] Nightly sync failed for {ticker}: {e}")
                results[ticker] = 0
        return results
    # ------------------------------------------------------------------
    # Gap detection
    # ------------------------------------------------------------------
    def _get_missing_ranges(
        self,
        asset_id: str,
        ticker: str,
        interval: str,
        start: str,
        end: str,
    ) -> list[tuple[str, str]]:
        """
        Compute contiguous date ranges of missing trading data for an asset between `start` and `end`.
        
        The function compares expected trading dates with existing records and consolidates consecutive missing trading dates into inclusive (start_date, end_date) tuples. Gaps separated by up to 3 calendar days are merged (to allow weekend bridges). If there are no missing trading dates, an empty list is returned.
        
        Returns:
            list[tuple[str, str]]: List of (start_date, end_date) tuples in "YYYY-MM-DD" format representing inclusive fetch ranges for missing trading dates.
        """
        existing_dates = self._get_existing_dates(asset_id, interval, start, end)
        expected_dates = _generate_trading_dates(start, end)
        missing = sorted(expected_dates - existing_dates)
        if not missing:
            return []
        # Consolidate consecutive missing dates into ranges
        # This minimises the number of API calls
        ranges = []
        range_start = missing[0]
        prev = missing[0]
        for d in missing[1:]:
            d_dt = datetime.strptime(d, "%Y-%m-%d").date()
            p_dt = datetime.strptime(prev, "%Y-%m-%d").date()
            # Allow up to 3-day gap (weekend bridge) before splitting ranges
            if (d_dt - p_dt).days <= 3:
                prev = d
            else:
                ranges.append((range_start, prev))
                range_start = d
                prev = d
        ranges.append((range_start, prev))
        logger.info(
            f"[Ingestion] {ticker}: {len(missing)} missing dates "
            f"consolidated into {len(ranges)} fetch range(s)."
        )
        return ranges
    def _get_existing_dates(
        self,
        asset_id: str,
        interval: str,
        start: str,
        end: str,
    ) -> set[str]:
        """
        Retrieve existing `price_date` values for an asset within a date range.
        
        Parameters:
            asset_id (str): The asset's unique identifier.
            interval (str): The price interval (e.g., "1d", "1wk").
            start (str): Inclusive start date in YYYY-MM-DD format.
            end (str): Inclusive end date in YYYY-MM-DD format.
        
        Returns:
            set[str]: Set of `price_date` strings (YYYY-MM-DD) present in the price_history table for the given asset, interval, and date range.
        """
        response = (
            self.supabase.table("price_history")
            .select("price_date")
            .eq("asset_id", asset_id)
            .eq("interval", interval)
            .gte("price_date", start)
            .lte("price_date", end)
            .execute()
        )
        return {row["price_date"] for row in (response.data or [])}
    # ------------------------------------------------------------------
    # Upsert
    # ------------------------------------------------------------------
    def _upsert_records(
        self,
        asset_id: str,
        records: list[OHLCVRecord],
    ) -> int:
        """
        Upsert OHLCV records for an asset into the price_history table.
        
        Each record is written as a row; conflicts on (asset_id, source, interval, price_date) update the existing row.
        
        Returns:
        	int: Number of rows upserted.
        
        Raises:
        	Exception: If the database upsert operation fails.
        """
        rows = [
            {
                "asset_id": asset_id,
                "source": r.provider,
                "interval": r.interval,
                "price_date": r.date,
                "open": r.open,
                "high": r.high,
                "low": r.low,
                "close": r.close,
                "adjusted_close": r.adj_close,
                "volume": r.volume,
            }
            for r in records
        ]
        try:
            self.supabase.table("price_history").upsert(
                rows,
                on_conflict="asset_id,source,interval,price_date"
            ).execute()
            logger.debug(f"[Ingestion] Upserted {len(rows)} rows.")
            return len(rows)
        except Exception as e:
            logger.error(f"[Ingestion] Upsert failed: {e}")
            raise
    # ------------------------------------------------------------------
    # Asset helpers
    # ------------------------------------------------------------------
    def _get_or_create_asset(self, ticker: str) -> str:
        """
        Get or create an asset for the given ticker and return its asset id.
        
        Performs an atomic upsert on the assets table to avoid select-then-insert race conditions when concurrent syncs encounter the same new ticker.
        
        Returns:
            asset_id (str): The id of the existing or newly created asset.
        """
        try:
            response = (
                self.supabase.table("assets")
                .upsert(
                    {"symbol": ticker, "name": ticker},
                    on_conflict="symbol",
                    returning="representation",
                )
                .execute()
            )
            asset_id = response.data[0]["id"]
            logger.debug(f"[Ingestion] Asset upserted for {ticker}: {asset_id}")
            return asset_id
        except Exception as e:
            logger.error(f"[Ingestion] Failed to get/create asset for {ticker}: {e}")
            raise
    def _get_portfolio_tickers(self, portfolio_id: str) -> list[str]:
        """Fetch distinct tickers from positions for a given portfolio."""
        try:
            response = (
                self.supabase.table("positions")
                .select("assets(symbol)")
                .eq("portfolio_id", portfolio_id)
                .execute()
            )
            tickers = [
                row["assets"]["symbol"]
                for row in (response.data or [])
                if row.get("assets")
            ]
            return list(set(tickers))
        except Exception as e:
            logger.error(
                f"[Ingestion] Failed to fetch tickers for portfolio {portfolio_id}: {e}"
            )
            return []
    def _get_all_assets(self) -> list[dict]:
        """
        Retrieve all assets' `id` and `symbol` from the assets table.
        
        Returns:
            list[dict]: List of asset objects each containing `id` and `symbol`; returns an empty list if the query fails or no assets are found.
        """
        try:
            response = self.supabase.table("assets").select("id, symbol").execute()
            return response.data or []
        except Exception as e:
            logger.error(f"[Ingestion] Failed to fetch assets: {e}")
            return []
    # ------------------------------------------------------------------
    # Provider helpers
    # ------------------------------------------------------------------
    def _resolve_provider(self) -> BaseMarketDataProvider:
        """
        Resolve the active market data provider.
        
        Prefers the explicit provider supplied at construction; if none was provided, obtains the default provider at call time.
        
        Returns:
            provider (BaseMarketDataProvider): The resolved market data provider instance.
        """
        return self._explicit_provider or get_default_provider()
    @staticmethod
    def _get_fallback_provider(
        current: BaseMarketDataProvider,
    ) -> Optional[BaseMarketDataProvider]:
        """
        Return an Alpha Vantage provider instance if an API key is configured and the current provider is not Alpha Vantage.
        
        Returns:
            An `AlphaVantageProvider` configured with `ALPHA_VANTAGE_API_KEY` if the environment variable is present and `current` is not an Alpha Vantage provider, `None` otherwise.
        """
        import os
        from .alpha_vantage_provider import AlphaVantageProvider
        av_key = os.getenv("ALPHA_VANTAGE_API_KEY")
        if av_key and not isinstance(current, AlphaVantageProvider):
            return AlphaVantageProvider(api_key=av_key)
        return None
    @staticmethod
    def _default_start_date() -> str:
        """
        Compute the default backfill start date string used for ingestion.
        
        Returns:
            start_date (str): Date in YYYY-MM-DD format equal to today minus DEFAULT_BACKFILL_YEARS years.
        """
        start = date.today() - timedelta(days=365 * DEFAULT_BACKFILL_YEARS)
        return start.strftime("%Y-%m-%d")
