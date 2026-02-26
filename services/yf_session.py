"""
ATLAS Terminal - Hardened yfinance Session
==========================================
Provides a shared yfinance Ticker factory that:
  1. Spoofs a real browser User-Agent (avoids Yahoo 429 rate-limits on Streamlit Cloud IPs)
  2. Retries with exponential backoff on 429 / 5xx
  3. Adds a randomised polite delay between requests
  4. Returns None gracefully instead of crashing on failure

Usage:
    from services.yf_session import get_ticker, get_history, get_info

    info   = get_info("NVDA")
    hist   = get_history("NVDA", period="1y")
    ticker = get_ticker("AAPL")   # yf.Ticker with patched session
"""

import time
import random
import logging
from typing import Optional

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import yfinance as yf

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Browser-like headers — these are the key to avoiding 429s on shared IPs
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

# ---------------------------------------------------------------------------
# Retry strategy: back off on 429 / 500 / 502 / 503 / 504
# ---------------------------------------------------------------------------
_RETRY_STRATEGY = Retry(
    total=4,
    backoff_factor=1.5,          # waits: 0s, 1.5s, 3s, 6s
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


# Module-level shared session (one per process/worker)
_SESSION = _make_session()


def _polite_delay(min_s: float = 0.3, max_s: float = 0.9) -> None:
    """Small randomised delay to avoid hammering Yahoo's servers."""
    time.sleep(random.uniform(min_s, max_s))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_ticker(symbol: str) -> yf.Ticker:
    """Return a yf.Ticker with the hardened session injected."""
    tk = yf.Ticker(symbol, session=_SESSION)
    return tk


def get_history(
    symbol: str,
    period: str = "1y",
    interval: str = "1d",
    retries: int = 3,
) -> pd.DataFrame:
    """
    Fetch OHLCV history for *symbol*.  Returns empty DataFrame on failure.
    Retries up to *retries* times with backoff before giving up.
    """
    for attempt in range(retries):
        try:
            _polite_delay()
            tk = get_ticker(symbol)
            df = tk.history(period=period, interval=interval)
            if not df.empty:
                return df
            logger.warning("Empty history for %s (attempt %d)", symbol, attempt + 1)
        except Exception as exc:
            wait = (attempt + 1) * 2.0
            logger.warning(
                "get_history(%s) attempt %d failed: %s — retrying in %.1fs",
                symbol, attempt + 1, exc, wait,
            )
            time.sleep(wait)
    return pd.DataFrame()


def get_info(symbol: str, retries: int = 3) -> dict:
    """
    Fetch .info dict for *symbol*.  Returns {} on failure.
    """
    for attempt in range(retries):
        try:
            _polite_delay()
            tk = get_ticker(symbol)
            info = tk.info or {}
            if info:
                return info
        except Exception as exc:
            wait = (attempt + 1) * 2.0
            logger.warning(
                "get_info(%s) attempt %d failed: %s — retrying in %.1fs",
                symbol, attempt + 1, exc, wait,
            )
            time.sleep(wait)
    return {}
