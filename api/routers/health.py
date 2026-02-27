"""
ATLAS API — Health & Admin Endpoints
=======================================
GET /v1/health   — public health check
GET /v1/usage    — admin-only usage stats
"""
from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Request

from api.auth import APIUser, require_tier, verify_api_key
from api.models.responses import HealthResponse

router = APIRouter()

_USAGE_LOG = Path(__file__).resolve().parent.parent.parent / "atlas_usage.csv"


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request):
    """Public health check — no authentication required."""
    boot_time: datetime = getattr(request.app.state, "boot_time", datetime.utcnow())
    uptime = (datetime.utcnow() - boot_time).total_seconds()
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        uptime_seconds=uptime,
    )


@router.get("/usage")
async def usage_stats(user: APIUser = Depends(require_tier("admin"))):
    """Admin-only usage statistics from atlas_usage.csv."""
    if not _USAGE_LOG.exists():
        return {"entries": 0, "data": []}

    rows = []
    with open(_USAGE_LOG, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    return {
        "entries": len(rows),
        "data": rows[-100:],  # Last 100 entries
    }
