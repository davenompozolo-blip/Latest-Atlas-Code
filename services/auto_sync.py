"""
services/auto_sync.py
---------------------
Alpaca → Supabase pipeline orchestration for Atlas Terminal.

Called from atlas_app.main() on first page load per session so the sync
runs on every boot regardless of which page the user lands on.

Public API
----------
run_full_sync(api_key, api_secret, paper)
    Write Alpaca portfolio to Supabase then kick off price-history
    ingestion in a background thread.  Must be called from the main
    Streamlit thread.  Sets session_state['alpaca_synced'] = True only
    on SUCCESS so callers can retry on transient failures.

run_ingestion_only(tickers)
    Background worker — fetch 5-year price history for each ticker and
    write results to PIPELINE_RESULT_PATH for UI polling.

PIPELINE_RESULT_PATH
    Path of the JSON result file shared between background thread and UI.
"""

import json
import logging
import os
import re
import threading

from services.secrets_helper import get_secret

_logger = logging.getLogger("atlas.auto_sync")


def _is_options_ticker(symbol: str) -> bool:
    """Return True if symbol looks like an options contract (not a stock)."""
    if not symbol or not isinstance(symbol, str):
        return True
    return bool(re.match(r'^[A-Z]{1,6}\d{6}[PC]\d{8}$', symbol))

PIPELINE_RESULT_PATH = "/tmp/atlas_ingestion_result.json"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _ensure_supabase_env() -> None:
    """
    Copy SUPABASE_URL / SUPABASE_ANON_KEY into os.environ if not already set.

    Called from both the main Streamlit thread (before starting the background
    thread) and at the top of run_ingestion_only() so the os.getenv() fallback
    inside get_secret() is always populated — even if st.secrets is not
    accessible from a background thread.
    """
    for key in ("SUPABASE_URL", "SUPABASE_ANON_KEY"):
        if not os.environ.get(key):
            val = get_secret(key, "")
            if val:
                os.environ[key] = val


# ---------------------------------------------------------------------------
# Background ingestion worker
# ---------------------------------------------------------------------------

def run_ingestion_only(tickers: list) -> None:
    """
    Fetch 5-year daily price history for each ticker and upsert into Supabase.

    Runs in a daemon thread.  Writes results to PIPELINE_RESULT_PATH so the
    UI can poll for completion on each Streamlit rerun.
    """
    _ensure_supabase_env()

    result: dict = {
        "supabase_stats": {},
        "ingestion_results": {},
        "ingestion_errors": {},
        "error": None,
    }

    try:
        from services.supabase_client import get_supabase_client
        from services.market_data.ingestion_service import MarketDataIngestionService

        supabase = get_supabase_client()
        svc = MarketDataIngestionService(supabase)

        for ticker in tickers:
            try:
                count = svc.sync_ticker(ticker)
                result["ingestion_results"][ticker] = count
            except Exception as exc:
                result["ingestion_errors"][ticker] = str(exc)
                _logger.warning("Ingestion failed for %s: %s", ticker, exc)

    except Exception as exc:
        result["ingestion_errors"]["_setup"] = str(exc)
        _logger.error("Ingestion setup failed: %s", exc, exc_info=True)

    _logger.info(
        "Ingestion complete. results=%d tickers, errors=%d",
        len(result["ingestion_results"]),
        len(result["ingestion_errors"]),
    )
    with open(PIPELINE_RESULT_PATH, "w") as f:
        json.dump(result, f)


# ---------------------------------------------------------------------------
# Full sync entry point (main thread)
# ---------------------------------------------------------------------------

def run_full_sync(api_key: str, api_secret: str, paper: bool) -> None:
    """
    Write Alpaca portfolio to Supabase, then start price-history ingestion.

    Must be called from the main Streamlit thread so that session_state
    writes are safe.

    On SUCCESS: sets session_state['alpaca_synced'] = True.
    On FAILURE: does NOT set alpaca_synced — the caller in main() tracks
                attempt counts and retries up to its configured limit.
    """
    import streamlit as st

    # ── Credentials into os.environ ──────────────────────────────────────────
    # run_sync() reads Alpaca credentials via get_secret() which tries
    # os.environ as fallback — pre-populate so background thread also works.
    os.environ["ALPACA_API_KEY"] = api_key
    os.environ["ALPACA_API_SECRET"] = api_secret
    os.environ["ALPACA_PAPER"] = "true" if paper else "false"
    _ensure_supabase_env()  # pre-populate Supabase keys for background thread

    # ── Step 1: Portfolio write ───────────────────────────────────────────────
    try:
        from services.alpaca_sync import run_sync
        stats = run_sync()
        # Only mark synced on success so callers can retry on failure
        st.session_state["alpaca_synced"] = True
        st.session_state["alpaca_sync_stats"] = stats
        st.session_state["supabase_sync_status"] = "success"
        st.session_state["supabase_sync_message"] = (
            f"Portfolio written to Supabase. "
            f"({stats.get('assets_upserted', 0)} assets, "
            f"{stats.get('positions_upserted', 0)} positions)"
        )
        _logger.info("Portfolio sync complete: %s", stats)
    except Exception as exc:
        # Do NOT set alpaca_synced — allow the caller's retry logic to fire
        st.session_state["supabase_sync_status"] = "error"
        st.session_state["supabase_sync_message"] = f"Sync failed: {exc}"
        _logger.error("Portfolio sync failed: %s", exc, exc_info=True)
        return

    # ── Step 2: Kick off price-history ingestion in background ───────────────
    try:
        from integrations.atlas_alpaca_integration import AlpacaAdapter
        adapter = AlpacaAdapter(api_key, secret_key=api_secret, paper=paper)
        positions_df = adapter.get_positions()
        raw_tickers = positions_df["Ticker"].tolist() if not positions_df.empty else []
        tickers = [t for t in raw_tickers if not _is_options_ticker(t)]
        if len(tickers) < len(raw_tickers):
            _logger.info(
                "Filtered %d options tickers from ingestion list.",
                len(raw_tickers) - len(tickers),
            )
    except Exception as exc:
        _logger.warning("Could not fetch tickers for ingestion: %s", exc)
        tickers = []

    if tickers:
        st.session_state["ingestion_ticker_count"] = len(tickers)
        if os.path.exists(PIPELINE_RESULT_PATH):
            os.remove(PIPELINE_RESULT_PATH)
        _logger.info("Running ingestion synchronously for %d tickers.", len(tickers))
        run_ingestion_only(tickers)
        st.session_state["ingestion_status"] = "complete"
        _logger.info("Ingestion complete (synchronous).")
