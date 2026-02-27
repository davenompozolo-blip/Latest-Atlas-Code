"""
ATLAS API — Strategic Asset Allocation Endpoint
==================================================
POST /v1/macro/saa

Delegates to ui/pages/saa_tool.py core functions:
  _build_user_message(), _call_allocation_engine(), _validate_allocation()
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from api.auth import APIUser, require_tier
from api.models.requests import SAARequest
from api.models.responses import SAAResponse

router = APIRouter()


@router.post("/saa", response_model=SAAResponse)
async def generate_saa(
    req: SAARequest,
    user: APIUser = Depends(require_tier("professional")),
):
    """Generate a Strategic Asset Allocation using Claude.

    Requires ANTHROPIC_API_KEY environment variable.
    """
    try:
        from ui.pages.saa_tool import (
            _build_user_message,
            _call_allocation_engine,
            _validate_allocation,
        )
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"SAA module not available: {e}")

    # Build the structured prompt
    user_message = _build_user_message(req.mandate, req.views, req.convictions)

    # Call Claude
    try:
        result = _call_allocation_engine(user_message)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Allocation engine failed: {e}")

    # Validate
    error = _validate_allocation(result)
    if error:
        raise HTTPException(status_code=422, detail=f"Invalid allocation: {error}")

    allocations = result.get("allocations", {})
    total_weight = sum(a.get("weight", 0) for a in allocations.values())

    return SAAResponse(
        allocations=allocations,
        total_weight=round(total_weight, 4),
        macro_interpretation=result.get("macro_interpretation", ""),
        key_risks=result.get("key_risks", []),
        positioning_theme=result.get("positioning_theme", ""),
    )
