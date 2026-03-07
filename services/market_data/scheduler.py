"""
scheduler.py
------------
Background scheduler for Atlas market data sync jobs.
Uses APScheduler to run the nightly price sync automatically
while also supporting on-demand triggers (e.g. when a new
asset is added to a portfolio).
Start this as part of Atlas's startup sequence:
    from services.market_data.scheduler import start_scheduler
    start_scheduler(supabase_client)
"""
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from .ingestion_service import MarketDataIngestionService
logger = logging.getLogger(__name__)
_scheduler: BackgroundScheduler = None
_ingestion_service: MarketDataIngestionService = None
def start_scheduler(supabase_client, provider=None):
    """
    Initialise and start the background scheduler.
    Jobs registered:
    - Nightly daily price sync: runs Mon–Sat at 18:00 (post-market close).
      Adjust hour/timezone to match your primary market (SAST for JSE, EST for NYSE).
    Args:
        supabase_client: Initialised Supabase client.
        provider:        Optional market data provider override.
    """
    global _scheduler, _ingestion_service
    _ingestion_service = MarketDataIngestionService(
        supabase_client=supabase_client,
        provider=provider,
    )
    _scheduler = BackgroundScheduler(timezone="Africa/Johannesburg")
    # Nightly sync — Mon to Sat at 18:00 SAST
    # Runs 6 days to catch Saturday corrections on some data providers
    _scheduler.add_job(
        func=_run_nightly_sync,
        trigger=CronTrigger(day_of_week="mon-sat", hour=18, minute=0),
        id="nightly_price_sync",
        name="Nightly Market Data Sync",
        replace_existing=True,
        misfire_grace_time=3600,  # Allow up to 1hr late start
    )
    _scheduler.start()
    logger.info("[Scheduler] Atlas market data scheduler started.")
    logger.info("[Scheduler] Nightly sync scheduled: Mon–Sat 18:00 SAST.")
    return _scheduler
def stop_scheduler():
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Scheduler stopped.")
def trigger_sync_now(ticker: str = None, portfolio_id: str = None):
    """
    Manually trigger a sync outside of the schedule.
    Useful when a new asset or portfolio is added.
    Args:
        ticker:       Sync a specific ticker immediately.
        portfolio_id: Sync all tickers in a portfolio immediately.
    """
    if not _ingestion_service:
        raise RuntimeError(
            "Scheduler not started. Call start_scheduler() first."
        )
    if ticker:
        logger.info(f"[Scheduler] Manual sync triggered for ticker: {ticker}")
        return _ingestion_service.sync_ticker(ticker)
    if portfolio_id:
        logger.info(
            f"[Scheduler] Manual sync triggered for portfolio: {portfolio_id}"
        )
        return _ingestion_service.sync_portfolio(portfolio_id)
    logger.warning("[Scheduler] trigger_sync_now called with no ticker or portfolio_id.")
    return {}
def _run_nightly_sync():
    """Internal job function for the nightly scheduler."""
    logger.info("[Scheduler] Nightly sync starting...")
    try:
        results = _ingestion_service.sync_all_assets(interval="1d")
        total = sum(results.values())
        logger.info(
            f"[Scheduler] Nightly sync complete. "
            f"{len(results)} assets processed, {total} records upserted."
        )
    except Exception as e:
        logger.error(f"[Scheduler] Nightly sync failed: {e}", exc_info=True)
