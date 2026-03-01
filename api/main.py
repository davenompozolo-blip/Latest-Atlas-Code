"""
ATLAS Terminal — REST API (Phase 8, Initiative 1)
===================================================
FastAPI application exposing ATLAS analytics as a documented REST API.
Runs alongside Streamlit as a sibling service — both share core/ and analytics/.

Zero business logic here. All computation delegated to existing modules.
"""
from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure project root is on sys.path so core/, analytics/, etc. are importable
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks."""
    app.state.boot_time = datetime.utcnow()
    yield


try:
    from config.branding import get_branding as _get_brand
    _brand = _get_brand()
    _api_title = f"{_brand['firm_name']} API"
except Exception:
    _api_title = "ATLAS Terminal API"

app = FastAPI(
    title=_api_title,
    description=(
        "Institutional investment analytics API. "
        "Portfolio optimisation, regime detection, SAA, and AI commentary."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow all origins in dev; tighten in production via env var
_allowed_origins = os.getenv("ATLAS_CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
from api.routers import portfolio, optimisation, regime, saa, commentary, health, billing, sandbox  # noqa: E402

app.include_router(health.router, prefix="/v1", tags=["Health & Admin"])
app.include_router(portfolio.router, prefix="/v1/portfolio", tags=["Portfolio Analytics"])
app.include_router(optimisation.router, prefix="/v1/portfolio", tags=["Portfolio Optimisation"])
app.include_router(regime.router, prefix="/v1/regime", tags=["Market Intelligence"])
app.include_router(saa.router, prefix="/v1/macro", tags=["Strategic Asset Allocation"])
app.include_router(commentary.router, prefix="/v1/commentary", tags=["Commentary"])
app.include_router(billing.router, prefix="/v1", tags=["Billing"])
app.include_router(sandbox.router, prefix="/v1/sandbox", tags=["Sandbox (Testing)"])
