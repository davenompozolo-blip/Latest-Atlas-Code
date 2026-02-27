"""
ATLAS API — Portfolio Optimisation Endpoint
=============================================
POST /v1/portfolio/optimise

Delegates to core/optimizers.py — zero business logic here.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from api.auth import APIUser, require_tier
from api.models.requests import OptimisationRequest
from api.models.responses import OptimisationResponse

router = APIRouter()


def _fetch_returns(tickers: list[str], period: str) -> pd.DataFrame:
    """Fetch historical returns for optimisation."""
    from core.fetchers import fetch_historical_data

    period_map = {"6mo": 180, "1y": 365, "2y": 730, "5y": 1825}
    days = period_map.get(period, 730)
    end = datetime.now()
    start = end - timedelta(days=days)

    frames = {}
    for ticker in tickers:
        try:
            data = fetch_historical_data(ticker, start, end)
            if data is not None and not data.empty:
                close = data["Close"] if isinstance(data, pd.DataFrame) and "Close" in data.columns else data
                if isinstance(close, pd.DataFrame):
                    close = close.iloc[:, 0]
                frames[ticker] = close
        except Exception:
            continue

    if len(frames) < 2:
        return pd.DataFrame()

    prices = pd.DataFrame(frames).dropna()
    return prices.pct_change().dropna()


@router.post("/optimise", response_model=OptimisationResponse)
async def optimise_portfolio(
    req: OptimisationRequest,
    user: APIUser = Depends(require_tier("professional")),
):
    """Run portfolio optimisation using the specified objective."""
    from core.optimizers import (
        optimize_max_sharpe,
        optimize_min_volatility,
        optimize_max_return,
        optimize_risk_parity,
    )
    from core.calculations import calculate_max_drawdown

    returns_df = _fetch_returns(req.tickers, req.period)
    if returns_df.empty:
        raise HTTPException(
            status_code=422,
            detail="Could not fetch sufficient price data for the given tickers. "
                   "Need at least 2 tickers with overlapping history.",
        )

    # Select optimizer
    optimizers = {
        "max_sharpe": lambda: optimize_max_sharpe(
            returns_df, req.risk_free_rate, req.max_weight, req.min_weight, req.target_leverage
        ),
        "min_volatility": lambda: optimize_min_volatility(
            returns_df, req.max_weight, req.min_weight, req.target_leverage
        ),
        "max_return": lambda: optimize_max_return(
            returns_df, req.max_weight, req.min_weight, req.target_leverage
        ),
        "risk_parity": lambda: optimize_risk_parity(
            returns_df, req.max_weight, req.min_weight, req.target_leverage
        ),
    }

    try:
        optimal_weights = optimizers[req.objective]()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimisation failed: {e}")

    # Compute portfolio metrics for the optimal weights
    weights_arr = optimal_weights.values
    port_returns = (returns_df[optimal_weights.index] * weights_arr).sum(axis=1)

    exp_return = float(port_returns.mean() * 252)
    exp_vol = float(port_returns.std() * np.sqrt(252))
    sharpe = (exp_return - req.risk_free_rate) / exp_vol if exp_vol > 0 else 0.0
    max_dd = float(calculate_max_drawdown(port_returns))

    # Build weights dict (exclude zero-weight tickers)
    weights_dict = {
        ticker: round(float(w), 6)
        for ticker, w in optimal_weights.items()
        if w > 0.001
    }

    return OptimisationResponse(
        weights=weights_dict,
        expected_return=round(exp_return, 6),
        expected_volatility=round(exp_vol, 6),
        sharpe_ratio=round(sharpe, 4),
        max_drawdown=round(max_dd, 6),
    )
