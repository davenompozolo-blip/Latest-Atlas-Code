"""
ATLAS API — Response Models (Pydantic v2)
===========================================
All API response shapes are defined here.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Portfolio Analytics
# ---------------------------------------------------------------------------

class MetricsResponse(BaseModel):
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    max_drawdown: float
    var_95: float
    cvar_95: float
    information_ratio: Optional[float] = None
    total_return: float
    annualised_return: float
    annualised_volatility: float
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class AttributionResponse(BaseModel):
    allocation_effect: dict[str, float]
    selection_effect: dict[str, float]
    interaction_effect: dict[str, float]
    total_active_return: float
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class RiskResponse(BaseModel):
    var_pct: float
    cvar_pct: float
    var_absolute: Optional[float] = None
    cvar_absolute: Optional[float] = None
    correlation_matrix: dict[str, dict[str, float]]
    factor_exposures: Optional[dict[str, float]] = None
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class OptimisationResponse(BaseModel):
    weights: dict[str, float]
    expected_return: float
    expected_volatility: float
    sharpe_ratio: float
    max_drawdown: float
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Regime
# ---------------------------------------------------------------------------

class RegimeResponse(BaseModel):
    quant_regime: str
    macro_regime: str
    consensus: str
    confidence: float
    indicators: dict
    implications: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# SAA
# ---------------------------------------------------------------------------

class SAAResponse(BaseModel):
    allocations: dict  # asset_class -> {weight, rationale}
    total_weight: float
    macro_interpretation: str
    key_risks: list[str]
    positioning_theme: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Commentary
# ---------------------------------------------------------------------------

class CommentaryResponse(BaseModel):
    commentary: str
    word_count: int
    commentary_type: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str = "healthy"
    version: str
    uptime_seconds: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
