"""
ATLAS API — Commentary Generation Endpoints
=============================================
POST /v1/commentary/quarterly     — quarterly positioning & outlook
POST /v1/commentary/attribution   — attribution commentary
POST /v1/commentary/manager       — manager research (5Ps)
GET  /v1/commentary/latest        — most recently generated commentary

Delegates to ui/pages/commentary_generator.py core functions.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from api.auth import APIUser, require_tier
from api.models.requests import (
    QuarterlyCommentaryRequest,
    AttributionCommentaryRequest,
    ManagerCommentaryRequest,
)
from api.models.responses import CommentaryResponse

router = APIRouter()

# File-based store for latest commentary (simple, no DB required)
_LATEST_FILE = Path(__file__).resolve().parent.parent.parent / ".atlas_latest_commentary.json"

_WORD_COUNTS = {"institutional": 800, "concise": 400, "detailed": 1200}


def _save_latest(commentary: str, commentary_type: str):
    """Persist the latest commentary for GET /latest."""
    data = {
        "commentary": commentary,
        "commentary_type": commentary_type,
        "word_count": len(commentary.split()),
        "generated_at": datetime.utcnow().isoformat(),
    }
    _LATEST_FILE.write_text(json.dumps(data), encoding="utf-8")


def _load_commentary_module():
    """Import commentary helpers from the Streamlit page module."""
    try:
        from ui.pages.commentary_generator import (
            _generate_commentary,
            _build_quarterly_message,
            _build_attribution_message,
            _build_manager_message,
        )
        return (
            _generate_commentary,
            _build_quarterly_message,
            _build_attribution_message,
            _build_manager_message,
        )
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Commentary module unavailable: {e}")


def _get_system_prompt(prompt_type: str, tone: str, **kwargs) -> str:
    """Build the system prompt for a given commentary type and tone."""
    word_count = _WORD_COUNTS.get(tone, 800)

    prompts = {
        "quarterly": (
            "You are a senior investment strategist writing for a South African "
            "institutional investment consultancy. Your commentary is read by pension "
            "fund trustees, CIOs, and investment committees. The tone is authoritative, "
            "precise, and grounded in evidence.\n\n"
            "Write a Quarterly Positioning & Outlook commentary. Structure: "
            "1. Market Backdrop 2. Portfolio Positioning 3. Key Calls 4. Outlook\n\n"
            f"Target {word_count} words."
        ),
        "attribution": (
            "You are a performance analyst at a South African institutional investment "
            "consultancy. Write a Portfolio Attribution Commentary.\n\n"
            "Structure: 1. Headline 2. What Drove Returns 3. What Changed 4. Looking Forward\n\n"
            f"Target {word_count} words."
        ),
        "manager": (
            "You are a fund manager research analyst. Write a Manager Research Summary "
            "using the 5Ps framework: Philosophy, Process, People, Performance, Portfolio.\n\n"
            "Conclude with an overall assessment (Recommended / Watch / Not Recommended).\n\n"
            f"Target {word_count} words."
        ),
    }
    return prompts.get(prompt_type, prompts["quarterly"])


@router.post("/quarterly", response_model=CommentaryResponse)
async def quarterly_commentary(
    req: QuarterlyCommentaryRequest,
    user: APIUser = Depends(require_tier("professional")),
):
    """Generate quarterly positioning & outlook commentary."""
    (generate, build_quarterly, _, _) = _load_commentary_module()

    # Build regime context if available
    regime_ctx = None
    try:
        from regime_detector import QuantitativeRegimeDetector
        detector = QuantitativeRegimeDetector()
        indicators = detector.fetch_market_indicators()
        regime_ctx = {
            "quant_regime": indicators.get("overall_regime", "unknown"),
            "consensus": indicators.get("overall_regime", "unknown"),
        }
    except Exception:
        pass

    # Build market returns summary
    market_returns = ""
    if req.portfolio_tickers:
        try:
            import yfinance as yf
            data = yf.download(req.portfolio_tickers[:5], period="3mo", progress=False)
            if not data.empty:
                close = data["Close"] if "Close" in data.columns.get_level_values(0) else data
                rets = (close.iloc[-1] / close.iloc[0] - 1) * 100
                market_returns = "\n".join(
                    f"- {t}: {r:+.1f}%" for t, r in rets.items()
                )
        except Exception:
            pass

    key_calls_str = "\n".join(req.key_calls) if req.key_calls else ""

    user_message = build_quarterly(regime_ctx, market_returns, "", key_calls_str)
    system_prompt = _get_system_prompt("quarterly", req.tone)

    try:
        commentary = generate(system_prompt, user_message)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Commentary generation failed: {e}")

    _save_latest(commentary, "Quarterly Positioning & Outlook")

    return CommentaryResponse(
        commentary=commentary,
        word_count=len(commentary.split()),
        commentary_type="Quarterly Positioning & Outlook",
    )


@router.post("/attribution", response_model=CommentaryResponse)
async def attribution_commentary(
    req: AttributionCommentaryRequest,
    user: APIUser = Depends(require_tier("professional")),
):
    """Generate portfolio attribution commentary."""
    (generate, _, build_attribution, _) = _load_commentary_module()

    user_message = build_attribution(req.attribution_data, req.period_label, req.benchmark_name)
    system_prompt = _get_system_prompt("attribution", req.tone)

    try:
        commentary = generate(system_prompt, user_message)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Commentary generation failed: {e}")

    _save_latest(commentary, "Portfolio Attribution Commentary")

    return CommentaryResponse(
        commentary=commentary,
        word_count=len(commentary.split()),
        commentary_type="Portfolio Attribution Commentary",
    )


@router.post("/manager", response_model=CommentaryResponse)
async def manager_commentary(
    req: ManagerCommentaryRequest,
    user: APIUser = Depends(require_tier("professional")),
):
    """Generate manager research summary (5Ps framework)."""
    (generate, _, _, build_manager) = _load_commentary_module()

    user_message = build_manager(
        req.fund_data, req.tenure, req.aum, req.mandate_type, req.fee_structure
    )
    system_prompt = _get_system_prompt("manager", req.tone)

    try:
        commentary = generate(system_prompt, user_message)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Commentary generation failed: {e}")

    _save_latest(commentary, "Manager Research Summary")

    return CommentaryResponse(
        commentary=commentary,
        word_count=len(commentary.split()),
        commentary_type="Manager Research Summary",
    )


@router.get("/latest", response_model=CommentaryResponse)
async def latest_commentary(
    user: APIUser = Depends(require_tier("professional")),
):
    """Return the most recently generated commentary."""
    if not _LATEST_FILE.exists():
        raise HTTPException(status_code=404, detail="No commentary generated yet")

    data = json.loads(_LATEST_FILE.read_text(encoding="utf-8"))
    return CommentaryResponse(
        commentary=data["commentary"],
        word_count=data["word_count"],
        commentary_type=data["commentary_type"],
        generated_at=datetime.fromisoformat(data["generated_at"]),
    )
