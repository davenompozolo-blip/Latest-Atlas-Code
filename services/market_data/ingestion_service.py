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
    Generate expected trading dates between start and end (inclusive).
    Uses a simple Mon-Fri filter. Extend with market-specific calendars
    (pandas_market_calendars) for JSE/NYSE holidays.
    Only valid for daily/weekly/monthly intervals. Intraday gap detection
    is not supported here -- intraday sync always fetches the full range.
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
        Args:
            supabase_client: Initialised Supabase client from supabase_client.py
            provider:        Explicit provider to use. If None, provider selection
                             happens at sync time via get_default_provider() so
                             transient failures at startup don't lock in a bad choice.
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
        Sync price history for a single ticker.
        Args:
            ticker:      Ticker symbol (e.g. 'AAPL', 'NPN.JO')
            interval:    Data frequency. Default '1d'.
            start:       Override start date (YYYY-MM-DD). Defaults to 5yr backfill.
            end:         Override end date. Defaults to today.
            force_full:  If True, re-fetch and overwrite all existing data.
        Returns:
            Number of records upserted.
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
        Sync price history for all assets currently held in a portfolio.
        Args:
            portfolio_id: Supabase portfolio UUID.
            interval:     Data frequency. Default '1d'.
            force_full:   If True, re-fetch all history for all tickers.
        Returns:
            Dict mapping ticker -> number of records upserted.
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
        Sync price history for every asset in the assets table.
        Intended for the nightly scheduled job.
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
        Compare expected trading dates against what's already in Supabase.
        Returns a list of (start, end) tuples representing gaps.
        For daily data, this typically returns either:
        - Empty list (fully up to date)
        - One range from last_known_date+1 -> today
        - One full range if no data exists yet
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
        Query Supabase for dates already in price_history.
        Raises on failure so the caller skips this asset instead of
        treating the entire window as missing and triggering a full backfill.
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
        Upsert a list of OHLCVRecord objects into price_history.
        Uses ON CONFLICT (asset_id, source, interval, price_date) DO UPDATE.
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
        Return the asset_id for a ticker, creating the asset record if
        it doesn't exist yet.
        Uses an atomic upsert to avoid the select-then-insert race condition
        when two concurrent syncs encounter the same new ticker simultaneously.
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
        """Return all assets from the assets table."""
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
        Return the active provider. Uses the explicit provider if one was
        supplied at construction time; otherwise resolves at call time so
        transient failures during startup don't lock in a bad state.
        """
        return self._explicit_provider or get_default_provider()
    @staticmethod
    def _get_fallback_provider(
        current: BaseMarketDataProvider,
    ) -> Optional[BaseMarketDataProvider]:
        """
        Return an alternative provider when the current one fails.
        If Alpha Vantage key is configured and the current provider is not
        already Alpha Vantage, return an Alpha Vantage instance.
        """
        from services.secrets_helper import get_secret
        from .alpha_vantage_provider import AlphaVantageProvider
        av_key = get_secret("ALPHA_VANTAGE_API_KEY")
        if av_key and not isinstance(current, AlphaVantageProvider):
            return AlphaVantageProvider(api_key=av_key)
        return None
    @staticmethod
    def _default_start_date() -> str:
        """Default backfill start: 5 years ago."""
        start = date.today() - timedelta(days=365 * DEFAULT_BACKFILL_YEARS)
        return start.strftime("%Y-%m-%d")
