"""
ATLAS API — Request Models (Pydantic v2)
==========================================
All API request bodies are validated here.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Portfolio Analytics
# ---------------------------------------------------------------------------

class MetricsRequest(BaseModel):
    """POST /v1/portfolio/metrics"""
    tickers: list[str] = Field(..., min_length=1, description="List of ticker symbols")
    weights: dict[str, float] = Field(..., description="Ticker -> weight mapping (must sum to ~1.0)")
    period: str = Field("1y", description="Lookback period: 6mo, 1y, 2y, 5y")
    benchmark: str = Field("^J203.JO", description="Benchmark ticker")
    risk_free_rate: float = Field(0.08, description="Annualised risk-free rate")


class AttributionRequest(BaseModel):
    """POST /v1/portfolio/attribution"""
    tickers: list[str] = Field(..., min_length=1)
    weights: dict[str, float] = Field(...)
    benchmark: str = Field("^J203.JO")
    period: str = Field("1y")


class RiskRequest(BaseModel):
    """POST /v1/portfolio/risk"""
    tickers: list[str] = Field(..., min_length=1)
    weights: dict[str, float] = Field(...)
    period: str = Field("1y")
    confidence: float = Field(0.95, ge=0.8, le=0.99)
    portfolio_value: Optional[float] = Field(None, description="Portfolio value for absolute VaR")


class OptimisationRequest(BaseModel):
    """POST /v1/portfolio/optimise"""
    tickers: list[str] = Field(..., min_length=2, description="At least 2 tickers")
    period: str = Field("2y", description="Historical lookback: 6mo, 1y, 2y, 5y")
    objective: Literal["max_sharpe", "min_volatility", "max_return", "risk_parity"] = "max_sharpe"
    max_weight: float = Field(0.40, ge=0.05, le=1.0)
    min_weight: float = Field(0.02, ge=0.0, le=0.2)
    target_leverage: float = Field(1.0, ge=0.5, le=3.0)
    risk_free_rate: float = Field(0.045, description="For Sharpe objective")


# ---------------------------------------------------------------------------
# Strategic Asset Allocation
# ---------------------------------------------------------------------------

class SAARequest(BaseModel):
    """POST /v1/macro/saa"""
    mandate: Literal["balanced_reg28", "global_unconstrained", "capital_preservation"] = "balanced_reg28"
    views: dict[str, str] = Field(
        ...,
        description="Macro views e.g. {'Growth': 'Accelerating', 'Inflation': 'Rising'}",
    )
    convictions: dict[str, str] = Field(
        default_factory=dict,
        description="Conviction levels per view e.g. {'Growth': 'High'}",
    )


# ---------------------------------------------------------------------------
# Commentary
# ---------------------------------------------------------------------------

class QuarterlyCommentaryRequest(BaseModel):
    """POST /v1/commentary/quarterly"""
    portfolio_tickers: list[str] = Field(default_factory=list)
    portfolio_weights: dict[str, float] = Field(default_factory=dict)
    key_calls: list[str] = Field(default_factory=list, max_length=3)
    tone: Literal["institutional", "concise", "detailed"] = "institutional"


class AttributionCommentaryRequest(BaseModel):
    """POST /v1/commentary/attribution"""
    attribution_data: dict = Field(
        ...,
        description="Attribution dict with total_return, benchmark_return, "
                    "allocation_effect, selection_effect, etc.",
    )
    period_label: str = Field("Q4 2025")
    benchmark_name: str = Field("JSE All Share")
    tone: Literal["institutional", "concise", "detailed"] = "institutional"


class ManagerCommentaryRequest(BaseModel):
    """POST /v1/commentary/manager"""
    fund_data: Optional[dict] = Field(None, description="Fund analytics from Fund Research module")
    tenure: str = Field("")
    aum: str = Field("")
    mandate_type: str = Field("")
    fee_structure: str = Field("")
    tone: Literal["institutional", "concise", "detailed"] = "institutional"
