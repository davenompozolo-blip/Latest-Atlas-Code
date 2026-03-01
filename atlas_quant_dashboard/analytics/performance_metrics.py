"""
ATLAS Quantitative Dashboard — Performance Metrics Engine
Layer: Computation (stateless, pure functions)
Purpose: All performance analytics for the Performance Intelligence module
"""
import numpy as np
import pandas as pd
from typing import Optional, Tuple
# ─── ANNUALISATION ────────────────────────────────────────────────────────────
TRADING_DAYS = 252
def annualise_return(daily_returns: pd.Series) -> float:
    """Compound annualised return from daily return series."""
    total = (1 + daily_returns).prod()
    n_years = len(daily_returns) / TRADING_DAYS
    return float(total ** (1 / n_years) - 1) if n_years > 0 else 0.0
def annualise_volatility(daily_returns: pd.Series) -> float:
    """Annualised volatility from daily return series."""
    return float(daily_returns.std() * np.sqrt(TRADING_DAYS))
def cumulative_return(daily_returns: pd.Series) -> pd.Series:
    """Cumulative return index, starting at 1.0."""
    return (1 + daily_returns).cumprod()
# ─── RISK-ADJUSTED RETURNS ────────────────────────────────────────────────────
def sharpe_ratio(
    daily_returns: pd.Series,
    risk_free_rate: float = 0.0
) -> float:
    """
    Annualised Sharpe ratio.
    risk_free_rate: annualised, decimal form (e.g. 0.05 for 5%)
    """
    daily_rf = (1 + risk_free_rate) ** (1 / TRADING_DAYS) - 1
    excess = daily_returns - daily_rf
    if excess.std() == 0:
        return 0.0
    return float((excess.mean() / excess.std()) * np.sqrt(TRADING_DAYS))
def sortino_ratio(
    daily_returns: pd.Series,
    risk_free_rate: float = 0.0,
    target_return: float = 0.0
) -> float:
    """
    Sortino ratio — penalises only downside deviation.
    More meaningful than Sharpe for asymmetric return distributions.
    """
    daily_rf = (1 + risk_free_rate) ** (1 / TRADING_DAYS) - 1
    excess = daily_returns - daily_rf
    downside = excess[excess < target_return]
    downside_dev = float(downside.std() * np.sqrt(TRADING_DAYS))
    if downside_dev == 0:
        return 0.0
    ann_return = annualise_return(daily_returns) - risk_free_rate
    return float(ann_return / downside_dev)
def calmar_ratio(daily_returns: pd.Series) -> float:
    """
    Calmar ratio: annualised return / max drawdown.
    Useful for assessing return relative to tail risk.
    """
    ann_ret = annualise_return(daily_returns)
    dd = max_drawdown(daily_returns)
    if dd == 0:
        return 0.0
    return float(ann_ret / abs(dd))
# ─── DRAWDOWN ─────────────────────────────────────────────────────────────────
def drawdown_series(daily_returns: pd.Series) -> pd.Series:
    """Rolling drawdown from peak. Returns series of drawdown values."""
    cum = cumulative_return(daily_returns)
    rolling_max = cum.cummax()
    return (cum - rolling_max) / rolling_max
def max_drawdown(daily_returns: pd.Series) -> float:
    """Maximum drawdown over the full period."""
    return float(drawdown_series(daily_returns).min())
def drawdown_anatomy(daily_returns: pd.Series) -> dict:
    """
    Full structural decomposition of drawdown history.
    Returns: max_dd, avg_dd, max_duration_days, avg_duration_days,
             recovery_ratio, drawdown_frequency_per_year
    """
    dd = drawdown_series(daily_returns)
    in_drawdown = dd < 0
    # Identify distinct drawdown periods
    dd_periods = []
    start = None
    for i, val in enumerate(in_drawdown):
        if val and start is None:
            start = i
        elif not val and start is not None:
            dd_periods.append((start, i - 1))
            start = None
    if start is not None:
        dd_periods.append((start, len(dd) - 1))
    if not dd_periods:
        return {
            "max_drawdown": 0.0,
            "avg_drawdown": 0.0,
            "max_duration_days": 0,
            "avg_duration_days": 0,
            "drawdown_count": 0,
            "drawdown_frequency_per_year": 0.0,
        }
    depths = [dd.iloc[s:e+1].min() for s, e in dd_periods]
    durations = [e - s + 1 for s, e in dd_periods]
    years = len(daily_returns) / TRADING_DAYS
    return {
        "max_drawdown": float(min(depths)),
        "avg_drawdown": float(np.mean(depths)),
        "max_duration_days": int(max(durations)),
        "avg_duration_days": int(np.mean(durations)),
        "drawdown_count": len(dd_periods),
        "drawdown_frequency_per_year": round(len(dd_periods) / years, 2) if years > 0 else 0.0,
    }
# ─── BENCHMARK RELATIVE ───────────────────────────────────────────────────────
def tracking_error(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series
) -> float:
    """Annualised tracking error vs benchmark."""
    aligned_p, aligned_b = portfolio_returns.align(benchmark_returns, join='inner')
    active = aligned_p - aligned_b
    return float(active.std() * np.sqrt(TRADING_DAYS))
def information_ratio(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series
) -> float:
    """Information ratio: active return / tracking error."""
    aligned_p, aligned_b = portfolio_returns.align(benchmark_returns, join='inner')
    active = aligned_p - aligned_b
    te = active.std() * np.sqrt(TRADING_DAYS)
    if te == 0:
        return 0.0
    ann_active = annualise_return(aligned_p) - annualise_return(aligned_b)
    return float(ann_active / te)
def capture_ratios(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series
) -> Tuple[float, float]:
    """
    Up-capture and down-capture ratios.
    Returns: (up_capture, down_capture)
    Up capture > 1.0: portfolio gains more than benchmark in rising markets
    Down capture < 1.0: portfolio loses less than benchmark in falling markets
    """
    aligned_p, aligned_b = portfolio_returns.align(benchmark_returns, join='inner')
    up_mask = aligned_b > 0
    down_mask = aligned_b < 0
    up_capture = 0.0
    down_capture = 0.0
    if up_mask.sum() > 5:
        port_up = annualise_return(aligned_p[up_mask])
        bench_up = annualise_return(aligned_b[up_mask])
        up_capture = float(port_up / bench_up) if bench_up != 0 else 0.0
    if down_mask.sum() > 5:
        port_down = annualise_return(aligned_p[down_mask])
        bench_down = annualise_return(aligned_b[down_mask])
        down_capture = float(port_down / bench_down) if bench_down != 0 else 0.0
    return up_capture, down_capture
def convexity_score(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series
) -> float:
    """
    Return convexity: up_capture / down_capture ratio.
    > 1.0 indicates asymmetric positive participation (desirable).
    """
    up, down = capture_ratios(portfolio_returns, benchmark_returns)
    if down == 0:
        return 0.0
    return float(up / down)
# ─── ROLLING ANALYTICS ────────────────────────────────────────────────────────
def rolling_sharpe(
    daily_returns: pd.Series,
    window: int = 63,
    risk_free_rate: float = 0.0
) -> pd.Series:
    """Rolling Sharpe ratio over a given window."""
    daily_rf = (1 + risk_free_rate) ** (1 / TRADING_DAYS) - 1
    excess = daily_returns - daily_rf
    def _sharpe(x):
        if x.std() == 0:
            return np.nan
        return (x.mean() / x.std()) * np.sqrt(TRADING_DAYS)
    return excess.rolling(window).apply(_sharpe, raw=True)
def rolling_returns(
    daily_returns: pd.Series,
    window: int = 63
) -> pd.Series:
    """Rolling annualised returns over a given window."""
    def _ann_ret(x):
        return (1 + x).prod() ** (TRADING_DAYS / len(x)) - 1
    return daily_returns.rolling(window).apply(_ann_ret, raw=True)
def rolling_volatility(
    daily_returns: pd.Series,
    window: int = 63
) -> pd.Series:
    """Rolling annualised volatility."""
    return daily_returns.rolling(window).std() * np.sqrt(TRADING_DAYS)
def rolling_beta(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
    window: int = 63
) -> pd.Series:
    """Rolling OLS beta vs benchmark."""
    aligned_p, aligned_b = portfolio_returns.align(benchmark_returns, join='inner')
    result = pd.Series(index=aligned_p.index, dtype=float)
    for i in range(window - 1, len(aligned_p)):
        p_slice = aligned_p.iloc[i - window + 1:i + 1].values
        b_slice = aligned_b.iloc[i - window + 1:i + 1].values
        var_b = np.var(b_slice, ddof=1)
        if var_b > 0:
            result.iloc[i] = np.cov(p_slice, b_slice, ddof=1)[0][1] / var_b
        else:
            result.iloc[i] = np.nan
    return result
# ─── CONTRIBUTION ANALYSIS ────────────────────────────────────────────────────
def return_contribution(
    asset_returns: pd.DataFrame,
    weights: pd.Series
) -> pd.Series:
    """
    Per-asset contribution to total return.
    asset_returns: DataFrame with assets as columns
    weights: Series indexed by asset
    Returns contribution per asset (annualised)
    """
    aligned_w = weights.reindex(asset_returns.columns).fillna(0)
    ann_asset_returns = asset_returns.apply(annualise_return)
    return (aligned_w * ann_asset_returns).rename("contribution")
def calendar_returns(daily_returns: pd.Series) -> pd.DataFrame:
    """
    Annual and quarterly return breakdown.
    Returns DataFrame with rows=year, cols=['Q1','Q2','Q3','Q4','Annual']
    """
    monthly = (1 + daily_returns).resample('ME').prod() - 1
    result = {}
    for year in monthly.index.year.unique():
        year_data = monthly[monthly.index.year == year]
        quarters = {
            'Q1': year_data[year_data.index.quarter == 1],
            'Q2': year_data[year_data.index.quarter == 2],
            'Q3': year_data[year_data.index.quarter == 3],
            'Q4': year_data[year_data.index.quarter == 4],
        }
        row = {}
        for q, q_data in quarters.items():
            row[q] = float((1 + q_data).prod() - 1) if len(q_data) > 0 else np.nan
        row['Annual'] = float((1 + year_data).prod() - 1)
        result[year] = row
    return pd.DataFrame(result).T
