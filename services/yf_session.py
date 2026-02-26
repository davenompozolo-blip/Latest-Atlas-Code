"""
ATLAS Terminal - Hardened yfinance Session
==========================================
Provides a shared yfinance Ticker factory that:
  1. Tries plain yfinance first (most reliable — uses yfinance's own cookie/crumb auth)
  2. Falls back to a browser-spoofed session on 429s or failures
  3. Retries with backoff before giving up
  4. Returns empty/graceful defaults instead of crashing

Usage:
    from services.yf_session import get_ticker, get_history, get_info

    info   = get_info("NVDA")
    hist   = get_history("NVDA", period="1y")
    ticker = get_ticker("AAPL")   # yf.Ticker (plain first, hardened fallback)
"""

import time
import logging
from typing import Optional

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import yfinance as yf

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hardened session (fallback) — browser-like headers + retry on 429/5xx
# ---------------------------------------------------------------------------
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

_RETRY_STRATEGY = Retry(
    total=3,
    backoff_factor=1.0,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET", "HEAD", "OPTIONS"],
    raise_on_status=False,
)


def _make_session() -> requests.Session:
    """Build a requests.Session with browser headers and retry logic."""
    session = requests.Session()
    session.headers.update(_HEADERS)
    adapter = HTTPAdapter(max_retries=_RETRY_STRATEGY)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


# Lazy-initialised — only built if plain yfinance fails
_SESSION: Optional[requests.Session] = None


def _get_hardened_session() -> requests.Session:
    global _SESSION
    if _SESSION is None:
        _SESSION = _make_session()
    return _SESSION


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_ticker(symbol: str, use_session: bool = False) -> yf.Ticker:
    """Return a yf.Ticker, optionally with the hardened session."""
    if use_session:
        return yf.Ticker(symbol, session=_get_hardened_session())
    return yf.Ticker(symbol)


def get_history(
    symbol: str,
    period: str = "1y",
    interval: str = "1d",
) -> pd.DataFrame:
    """
    Fetch OHLCV history for *symbol*.  Returns empty DataFrame on failure.

    Strategy: try plain yfinance first (most compatible), then retry once
    with the hardened browser-spoofed session as fallback.
    """
    # Attempt 1: plain yfinance (no custom session)
    try:
        tk = yf.Ticker(symbol)
        df = tk.history(period=period, interval=interval)
        if df is not None and not df.empty:
            return df
    except Exception as exc:
        logger.warning("get_history(%s) plain attempt failed: %s", symbol, exc)

    # Attempt 2: hardened session (browser headers + retry adapter)
    try:
        tk = yf.Ticker(symbol, session=_get_hardened_session())
        df = tk.history(period=period, interval=interval)
        if df is not None and not df.empty:
            return df
    except Exception as exc:
        logger.warning("get_history(%s) hardened attempt failed: %s", symbol, exc)

    # Attempt 3: plain yfinance after a brief pause (transient issue)
    time.sleep(1.0)
    try:
        tk = yf.Ticker(symbol)
        df = tk.history(period=period, interval=interval)
        if df is not None and not df.empty:
            return df
    except Exception as exc:
        logger.warning("get_history(%s) final attempt failed: %s", symbol, exc)

    return pd.DataFrame()


def get_info(symbol: str) -> dict:
    """
    Fetch .info dict for *symbol*.  Returns {} on failure.

    Strategy: try plain yfinance first, then hardened session fallback.
    """
    # Attempt 1: plain yfinance
    try:
        tk = yf.Ticker(symbol)
        info = tk.info
        if info and isinstance(info, dict) and len(info) > 5:
            return info
    except Exception as exc:
        logger.warning("get_info(%s) plain attempt failed: %s", symbol, exc)

    # Attempt 2: hardened session
    try:
        tk = yf.Ticker(symbol, session=_get_hardened_session())
        info = tk.info
        if info and isinstance(info, dict) and len(info) > 5:
            return info
    except Exception as exc:
        logger.warning("get_info(%s) hardened attempt failed: %s", symbol, exc)

    # Return whatever we got (may be partial)
    try:
        return yf.Ticker(symbol).info or {}
    except Exception:
        return {}
