"""
ATLAS API — Market Regime Endpoints
======================================
GET /v1/regime/current   — current dual-model regime
GET /v1/regime/history   — historical regime classifications

Delegates to regime_detector.py and services/macro_regime.py.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from api.auth import APIUser, require_tier
from api.models.responses import RegimeResponse

router = APIRouter()


@router.get("/current", response_model=RegimeResponse)
async def current_regime(
    user: APIUser = Depends(require_tier("professional")),
):
    """Get current market regime from both quant and macro models."""
    # Quantitative regime (VIX, yields, spreads, breadth, momentum)
    quant_regime = "NEUTRAL"
    quant_indicators = {}
    quant_confidence = 0.5

    try:
        from regime_detector import QuantitativeRegimeDetector
        detector = QuantitativeRegimeDetector()
        indicators = detector.fetch_market_indicators()
        quant_indicators = indicators
        quant_regime = indicators.get("overall_regime", "NEUTRAL")
        quant_confidence = indicators.get("confidence", 0.5)
    except Exception as e:
        quant_indicators = {"error": str(e)}

    # Macro regime (growth x inflation quadrant)
    macro_regime = "UNKNOWN"
    macro_implications = ""

    try:
        from services.macro_regime import MacroRegimeEngine
        engine = MacroRegimeEngine()
        macro_result = engine.classify_from_market_data()
        if macro_result:
            macro_regime = macro_result.get("regime", "UNKNOWN").upper()
            macro_implications = macro_result.get("description", "")
    except Exception as e:
        macro_implications = f"Macro regime unavailable: {e}"

    # Consensus logic
    risk_on_signals = {
        "RISK-ON": 1, "GOLDILOCKS": 1, "REFLATION": 0.5,
    }
    risk_off_signals = {
        "RISK-OFF": 1, "STAGFLATION": 1, "DEFLATION": 0.5,
    }

    score = (
        risk_on_signals.get(quant_regime, 0)
        + risk_on_signals.get(macro_regime, 0)
        - risk_off_signals.get(quant_regime, 0)
        - risk_off_signals.get(macro_regime, 0)
    )

    if score > 0.5:
        consensus = "RISK-ON"
    elif score < -0.5:
        consensus = "RISK-OFF"
    else:
        consensus = "NEUTRAL"

    return RegimeResponse(
        quant_regime=quant_regime,
        macro_regime=macro_regime,
        consensus=consensus,
        confidence=quant_confidence,
        indicators=quant_indicators,
        implications=macro_implications,
    )


@router.get("/history")
async def regime_history(
    days: int = 30,
    user: APIUser = Depends(require_tier("professional")),
):
    """Historical regime classifications (last N days).

    Note: Full history requires persistent storage. This endpoint
    returns current snapshot with metadata. Extended history will
    be available when the scheduler populates historical records.
    """
    # For now, return current regime with a note about history
    try:
        from regime_detector import QuantitativeRegimeDetector
        detector = QuantitativeRegimeDetector()
        indicators = detector.fetch_market_indicators()
        return {
            "current": indicators.get("overall_regime", "NEUTRAL"),
            "as_of": datetime.utcnow().isoformat(),
            "note": "Full history will be available when scheduler is active.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Regime detection failed: {e}")
