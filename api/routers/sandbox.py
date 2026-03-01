"""
ATLAS API — Sandbox Endpoints (Phase 10, Initiative 3)
========================================================
Mirror of all production endpoints with synthetic data.
No real computations, no market data fetches, no API key tier checks.
Used for client SDK testing, CI/CD integration tests, and onboarding.

All sandbox endpoints are prefixed with /v1/sandbox/*.
Authentication is still required (any valid API key works).
"""
from __future__ import annotations

import random
from datetime import datetime

from fastapi import APIRouter, Depends

from api.auth import APIUser, verify_api_key

router = APIRouter()

# ---------------------------------------------------------------------------
# Synthetic data generators
# ---------------------------------------------------------------------------

_SAMPLE_TICKERS = ["NPN", "AGL", "BTI", "SOL", "SBK", "FSR", "MTN", "BHP", "AMS", "PRX"]


def _synthetic_weights(tickers: list[str] | None = None) -> dict[str, float]:
    """Generate plausible portfolio weights."""
    tickers = tickers or _SAMPLE_TICKERS[:5]
    n = len(tickers)
    raw = [random.uniform(0.05, 0.4) for _ in range(n)]
    total = sum(raw)
    return {t: round(w / total, 4) for t, w in zip(tickers, raw)}


def _synthetic_corr(tickers: list[str]) -> dict[str, dict[str, float]]:
    """Generate a plausible correlation matrix."""
    matrix = {}
    for t1 in tickers:
        matrix[t1] = {}
        for t2 in tickers:
            if t1 == t2:
                matrix[t1][t2] = 1.0
            else:
                matrix[t1][t2] = round(random.uniform(0.1, 0.75), 4)
                matrix.setdefault(t2, {})[t1] = matrix[t1][t2]
    return matrix


# ---------------------------------------------------------------------------
# Sandbox: Health
# ---------------------------------------------------------------------------

@router.get("/health")
async def sandbox_health(user: APIUser = Depends(verify_api_key)):
    """Sandbox health check."""
    return {
        "status": "healthy",
        "version": "1.0.0-sandbox",
        "uptime_seconds": 12345.67,
        "timestamp": datetime.utcnow().isoformat(),
        "sandbox": True,
    }


# ---------------------------------------------------------------------------
# Sandbox: Portfolio Analytics
# ---------------------------------------------------------------------------

@router.post("/portfolio/metrics")
async def sandbox_portfolio_metrics(user: APIUser = Depends(verify_api_key)):
    """Sandbox portfolio metrics — returns synthetic risk/return data."""
    return {
        "sharpe_ratio": round(random.uniform(0.5, 2.5), 4),
        "sortino_ratio": round(random.uniform(0.6, 3.0), 4),
        "calmar_ratio": round(random.uniform(0.3, 2.0), 4),
        "max_drawdown": round(random.uniform(-0.25, -0.05), 4),
        "var_95": round(random.uniform(-0.03, -0.01), 4),
        "cvar_95": round(random.uniform(-0.05, -0.02), 4),
        "information_ratio": round(random.uniform(-0.5, 1.5), 4),
        "total_return": round(random.uniform(0.05, 0.35), 4),
        "annualised_return": round(random.uniform(0.08, 0.25), 4),
        "annualised_volatility": round(random.uniform(0.10, 0.25), 4),
        "generated_at": datetime.utcnow().isoformat(),
        "sandbox": True,
    }


@router.post("/portfolio/attribution")
async def sandbox_portfolio_attribution(user: APIUser = Depends(verify_api_key)):
    """Sandbox Brinson attribution — returns synthetic effects."""
    tickers = _SAMPLE_TICKERS[:5]
    return {
        "allocation_effect": {t: round(random.uniform(-0.01, 0.02), 6) for t in tickers},
        "selection_effect": {t: round(random.uniform(-0.02, 0.03), 6) for t in tickers},
        "interaction_effect": {t: round(random.uniform(-0.005, 0.005), 6) for t in tickers},
        "total_active_return": round(random.uniform(-0.02, 0.05), 6),
        "generated_at": datetime.utcnow().isoformat(),
        "sandbox": True,
    }


@router.post("/portfolio/risk")
async def sandbox_portfolio_risk(user: APIUser = Depends(verify_api_key)):
    """Sandbox risk analysis — synthetic VaR, CVaR, correlations."""
    tickers = _SAMPLE_TICKERS[:5]
    var_pct = round(random.uniform(-0.03, -0.01), 4)
    cvar_pct = round(var_pct * random.uniform(1.2, 1.8), 4)
    return {
        "var_pct": var_pct,
        "cvar_pct": cvar_pct,
        "var_absolute": round(abs(var_pct) * 10_000_000, 2),
        "cvar_absolute": round(abs(cvar_pct) * 10_000_000, 2),
        "correlation_matrix": _synthetic_corr(tickers),
        "factor_exposures": None,
        "generated_at": datetime.utcnow().isoformat(),
        "sandbox": True,
    }


# ---------------------------------------------------------------------------
# Sandbox: Optimisation
# ---------------------------------------------------------------------------

@router.post("/portfolio/optimise")
async def sandbox_optimise(user: APIUser = Depends(verify_api_key)):
    """Sandbox optimisation — returns synthetic optimal weights."""
    tickers = _SAMPLE_TICKERS[:6]
    weights = _synthetic_weights(tickers)
    return {
        "weights": weights,
        "expected_return": round(random.uniform(0.08, 0.20), 4),
        "expected_volatility": round(random.uniform(0.10, 0.22), 4),
        "sharpe_ratio": round(random.uniform(0.5, 2.0), 4),
        "max_drawdown": round(random.uniform(-0.20, -0.05), 4),
        "generated_at": datetime.utcnow().isoformat(),
        "sandbox": True,
    }


# ---------------------------------------------------------------------------
# Sandbox: Regime
# ---------------------------------------------------------------------------

@router.get("/regime/current")
async def sandbox_regime(user: APIUser = Depends(verify_api_key)):
    """Sandbox regime detection — returns synthetic regime state."""
    regimes = ["Risk-On", "Risk-Off", "Neutral", "Transitional"]
    macro_regimes = ["Goldilocks", "Reflation", "Stagflation", "Deflation"]
    return {
        "quant_regime": random.choice(regimes),
        "macro_regime": random.choice(macro_regimes),
        "consensus": random.choice(regimes),
        "confidence": round(random.uniform(0.55, 0.95), 2),
        "indicators": {
            "vix": round(random.uniform(12, 35), 2),
            "yield_curve": round(random.uniform(-0.5, 2.0), 2),
            "credit_spread": round(random.uniform(100, 500), 0),
        },
        "implications": "Sandbox mode — synthetic regime data for testing.",
        "timestamp": datetime.utcnow().isoformat(),
        "sandbox": True,
    }


# ---------------------------------------------------------------------------
# Sandbox: SAA
# ---------------------------------------------------------------------------

@router.post("/macro/saa")
async def sandbox_saa(user: APIUser = Depends(verify_api_key)):
    """Sandbox SAA — returns synthetic allocation recommendation."""
    asset_classes = ["SA Equity", "SA Bonds", "SA Property", "Global Equity",
                     "Global Bonds", "SA Cash", "Alternatives"]
    allocations = {}
    remaining = 1.0
    for ac in asset_classes[:-1]:
        w = round(random.uniform(0.05, 0.25), 3)
        w = min(w, remaining)
        allocations[ac] = {"weight": w, "rationale": f"Sandbox allocation for {ac}"}
        remaining -= w
    allocations[asset_classes[-1]] = {"weight": round(remaining, 3), "rationale": "Residual allocation"}

    return {
        "allocations": allocations,
        "total_weight": 1.0,
        "macro_interpretation": "Sandbox — synthetic macro interpretation for testing.",
        "key_risks": ["ZAR volatility", "Load-shedding impact", "US Fed policy"],
        "positioning_theme": "Defensive quality tilt",
        "generated_at": datetime.utcnow().isoformat(),
        "sandbox": True,
    }


# ---------------------------------------------------------------------------
# Sandbox: Commentary
# ---------------------------------------------------------------------------

@router.post("/commentary/quarterly")
async def sandbox_quarterly_commentary(user: APIUser = Depends(verify_api_key)):
    """Sandbox quarterly commentary — returns synthetic text."""
    text = (
        "The portfolio delivered solid risk-adjusted returns during the period, "
        "outperforming the benchmark by 120 basis points. Key contributors included "
        "the overweight position in Naspers which rallied 8.3% on improved Tencent "
        "sentiment. The defensive allocation to SA government bonds provided ballast "
        "during the mid-quarter equity drawdown. Looking ahead, we maintain a cautious "
        "overweight in quality SA equities while increasing duration exposure given "
        "the attractive real yield on offer."
    )
    return {
        "commentary": text,
        "word_count": len(text.split()),
        "commentary_type": "quarterly",
        "generated_at": datetime.utcnow().isoformat(),
        "sandbox": True,
    }


@router.post("/commentary/attribution")
async def sandbox_attribution_commentary(user: APIUser = Depends(verify_api_key)):
    """Sandbox attribution commentary."""
    text = (
        "Attribution analysis for the period shows positive allocation effect (+45bp) "
        "driven by the overweight in SA equities during the rally. Selection effect "
        "was mixed (+12bp net) with strong stock selection in financials offset by "
        "underperformance in the resources basket."
    )
    return {
        "commentary": text,
        "word_count": len(text.split()),
        "commentary_type": "attribution",
        "generated_at": datetime.utcnow().isoformat(),
        "sandbox": True,
    }


@router.post("/commentary/manager")
async def sandbox_manager_commentary(user: APIUser = Depends(verify_api_key)):
    """Sandbox manager commentary."""
    text = (
        "The fund manager has demonstrated consistent alpha generation over a 5-year "
        "track record, with an information ratio of 0.85. The investment process is "
        "well-structured with clear risk budgets and a disciplined rebalancing framework."
    )
    return {
        "commentary": text,
        "word_count": len(text.split()),
        "commentary_type": "manager",
        "generated_at": datetime.utcnow().isoformat(),
        "sandbox": True,
    }


# ---------------------------------------------------------------------------
# Sandbox: Billing (mirrors structure, no real Stripe)
# ---------------------------------------------------------------------------

@router.get("/billing/status")
async def sandbox_billing_status(user: APIUser = Depends(verify_api_key)):
    """Sandbox billing status."""
    return {
        "tier": "professional",
        "subscription_status": "active",
        "current_period_end": "2026-04-01T00:00:00Z",
        "sandbox": True,
    }


@router.post("/billing/checkout")
async def sandbox_checkout(user: APIUser = Depends(verify_api_key)):
    """Sandbox checkout — returns a fake session URL."""
    return {
        "checkout_url": "https://checkout.stripe.com/sandbox/test_session_id",
        "session_id": "sandbox_cs_test_000000",
        "sandbox": True,
    }


@router.post("/billing/portal")
async def sandbox_portal(user: APIUser = Depends(verify_api_key)):
    """Sandbox billing portal — returns a fake portal URL."""
    return {
        "portal_url": "https://billing.stripe.com/sandbox/test_portal_id",
        "sandbox": True,
    }
