"""
ATLAS Terminal — Operational Monitoring
=========================================
Lightweight error logging and usage tracking.

- Error logging: writes to atlas_errors.log
- Usage tracking: appends CSV rows to atlas_usage.csv
- Health check: already handled in atlas_app.py (/?health=check)
"""
from __future__ import annotations

import csv
import logging
import os
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Error logger — writes to atlas_errors.log in the project root
# ---------------------------------------------------------------------------
_LOG_DIR = Path(__file__).resolve().parent.parent
_ERROR_LOG = _LOG_DIR / "atlas_errors.log"

error_logger = logging.getLogger("atlas.errors")
error_logger.setLevel(logging.ERROR)

if not error_logger.handlers:
    _handler = logging.FileHandler(str(_ERROR_LOG), mode="a", encoding="utf-8")
    _handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    )
    error_logger.addHandler(_handler)


def log_error(message: str, exc: Exception | None = None):
    """Log an error message (and optional exception) to atlas_errors.log."""
    if exc:
        error_logger.error("%s — %s: %s", message, type(exc).__name__, exc, exc_info=True)
    else:
        error_logger.error(message)


# ---------------------------------------------------------------------------
# Usage tracker — appends rows to atlas_usage.csv
# ---------------------------------------------------------------------------
_USAGE_LOG = _LOG_DIR / "atlas_usage.csv"
_USAGE_HEADER = ["timestamp", "username", "page", "tier"]


def _ensure_usage_header():
    """Create usage CSV with header if it doesn't exist."""
    if not _USAGE_LOG.exists():
        with open(_USAGE_LOG, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(_USAGE_HEADER)


def log_page_view(username: str | None, page: str, tier: str = "free"):
    """Append a usage log entry for a page navigation."""
    try:
        _ensure_usage_header()
        with open(_USAGE_LOG, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                datetime.now().isoformat(timespec="seconds"),
                username or "anonymous",
                page,
                tier,
            ])
    except OSError:
        pass  # Never let logging break the app
