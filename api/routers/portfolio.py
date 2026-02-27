"""
ATLAS API — Portfolio Analytics Endpoints
============================================
POST /v1/portfolio/metrics       — risk/return metrics
POST /v1/portfolio/attribution   — Brinson attribution
POST /v1/portfolio/risk          — VaR, CVaR, correlations, factor exposures

Zero business logic. All computation delegated to core/calculations.py.
"""
from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends

from api.auth import APIUser, require_tier
from api.models.requests import MetricsRequest, AttributionRequest, RiskRequest
from api.models.responses import MetricsResponse, AttributionResponse, RiskResponse

router = APIRouter()


def _fetch_returns(tickers: list[str], period: str) -> pd.DataFrame:
    """Fetch historical returns for a list of tickers."""
    from core.fetchers import fetch_historical_data
    from datetime import timedelta

    period_map = {"6mo": 180, "1y": 365, "2y": 730, "5y": 1825}
    days = period_map.get(period, 365)
    end = datetime.now()
    start = end - timedelta(days=days)

    frames = {}
    for ticker in tickers:
        try:
            data = fetch_historical_data(ticker, start, end)
            if data is not None and not data.empty:
                if isinstance(data, pd.DataFrame):
                    close = data["Close"] if "Close" in data.columns else data.iloc[:, 0]
                else:
                    close = data
                frames[ticker] = close
        except Exception:
            continue

    if not frames:
        return pd.DataFrame()

    prices = pd.DataFrame(frames).dropna()
    return prices.pct_change().dropna()


@router.post("/metrics", response_model=MetricsResponse)
async def portfolio_metrics(
    req: MetricsRequest,
    user: APIUser = Depends(require_tier("professional")),
):
    """Compute portfolio risk/return metrics."""
    from core.calculations import (
        calculate_sharpe_ratio,
        calculate_sortino_ratio,
        calculate_calmar_ratio,
        calculate_max_drawdown,
        calculate_var,
        calculate_cvar,
        calculate_information_ratio,
    )

    returns_df = _fetch_returns(req.tickers, req.period)
    if returns_df.empty:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Could not fetch price data for the given tickers")

    # Compute weighted portfolio returns
    weights = np.array([req.weights.get(t, 0.0) for t in returns_df.columns])
    port_returns = (returns_df * weights).sum(axis=1)

    # Benchmark returns
    bench_returns = None
    try:
        bench_df = _fetch_returns([req.benchmark], req.period)
        if not bench_df.empty:
            bench_returns = bench_df.iloc[:, 0]
    except Exception:
        pass

    sharpe = calculate_sharpe_ratio(port_returns, req.risk_free_rate)
    sortino = calculate_sortino_ratio(port_returns, req.risk_free_rate)
    calmar = calculate_calmar_ratio(port_returns, req.risk_free_rate)
    max_dd = calculate_max_drawdown(port_returns)
    var_95 = calculate_var(port_returns, confidence=0.95)
    cvar_95 = calculate_cvar(port_returns, confidence=0.95)

    info_ratio = None
    if bench_returns is not None and len(bench_returns) > 0:
        try:
            info_ratio = calculate_information_ratio(port_returns, bench_returns)
        except Exception:
            pass

    total_ret = float((1 + port_returns).prod() - 1)
    ann_ret = float((1 + total_ret) ** (252 / max(len(port_returns), 1)) - 1)
    ann_vol = float(port_returns.std() * np.sqrt(252))

    return MetricsResponse(
        sharpe_ratio=float(sharpe),
        sortino_ratio=float(sortino),
        calmar_ratio=float(calmar),
        max_drawdown=float(max_dd),
        var_95=float(var_95),
        cvar_95=float(cvar_95),
        information_ratio=float(info_ratio) if info_ratio is not None else None,
        total_return=total_ret,
        annualised_return=ann_ret,
        annualised_volatility=ann_vol,
    )


@router.post("/attribution", response_model=AttributionResponse)
async def portfolio_attribution(
    req: AttributionRequest,
    user: APIUser = Depends(require_tier("professional")),
):
    """Compute Brinson attribution (allocation + selection effects)."""
    returns_df = _fetch_returns(req.tickers, req.period)
    if returns_df.empty:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Could not fetch price data")

    # Compute simple sector-level attribution approximation
    weights = {t: req.weights.get(t, 0.0) for t in returns_df.columns}
    bench_df = _fetch_returns([req.benchmark], req.period)

    bench_return = 0.0
    if not bench_df.empty:
        bench_return = float((1 + bench_df.iloc[:, 0]).prod() - 1)

    allocation_effect = {}
    selection_effect = {}
    interaction_effect = {}
    total_port_return = 0.0

    for ticker in returns_df.columns:
        w = weights.get(ticker, 0.0)
        ticker_return = float((1 + returns_df[ticker]).prod() - 1)
        # Simplified single-stock attribution
        allocation_effect[ticker] = round((w - 1.0 / len(returns_df.columns)) * bench_return, 6)
        selection_effect[ticker] = round(w * (ticker_return - bench_return), 6)
        interaction_effect[ticker] = round(
            (w - 1.0 / len(returns_df.columns)) * (ticker_return - bench_return), 6
        )
        total_port_return += w * ticker_return

    return AttributionResponse(
        allocation_effect=allocation_effect,
        selection_effect=selection_effect,
        interaction_effect=interaction_effect,
        total_active_return=round(total_port_return - bench_return, 6),
    )


@router.post("/risk", response_model=RiskResponse)
async def portfolio_risk(
    req: RiskRequest,
    user: APIUser = Depends(require_tier("professional")),
):
    """Compute VaR, CVaR, correlation matrix, factor exposures."""
    from core.calculations import calculate_var, calculate_cvar

    returns_df = _fetch_returns(req.tickers, req.period)
    if returns_df.empty:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Could not fetch price data")

    weights = np.array([req.weights.get(t, 0.0) for t in returns_df.columns])
    port_returns = (returns_df * weights).sum(axis=1)

    var_pct = float(calculate_var(port_returns, confidence=req.confidence))
    cvar_pct = float(calculate_cvar(port_returns, confidence=req.confidence))

    var_abs = None
    cvar_abs = None
    if req.portfolio_value:
        var_abs = round(abs(var_pct) * req.portfolio_value, 2)
        cvar_abs = round(abs(cvar_pct) * req.portfolio_value, 2)

    # Correlation matrix
    corr = returns_df.corr()
    corr_dict = {
        col: {row: round(corr.loc[row, col], 4) for row in corr.index}
        for col in corr.columns
    }

    return RiskResponse(
        var_pct=var_pct,
        cvar_pct=cvar_pct,
        var_absolute=var_abs,
        cvar_absolute=cvar_abs,
        correlation_matrix=corr_dict,
        factor_exposures=None,
    )
