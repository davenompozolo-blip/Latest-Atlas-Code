"""
ATLAS Quantitative Dashboard — Risk Metrics Engine
Layer: Computation (stateless, pure functions)
Purpose: All risk analytics for the Risk Architecture module
"""
import numpy as np
import pandas as pd
from typing import Optional, Tuple
from scipy import stats
TRADING_DAYS = 252
# ─── PORTFOLIO VOLATILITY ─────────────────────────────────────────────────────
def portfolio_volatility(
    weights: np.ndarray,
    cov_matrix: np.ndarray,
    annualise: bool = True
) -> float:
    """
    Portfolio volatility from weights and covariance matrix.
    Uses the standard w'Σw formulation.
    """
    daily_var = float(weights @ cov_matrix @ weights)
    daily_vol = np.sqrt(max(daily_var, 0))
    return float(daily_vol * np.sqrt(TRADING_DAYS)) if annualise else float(daily_vol)
def covariance_matrix(
    returns: pd.DataFrame,
    method: str = "ledoit_wolf",
    window: Optional[int] = None
) -> pd.DataFrame:
    """
    Compute covariance matrix from returns DataFrame.
    method: 'sample' | 'ledoit_wolf' (recommended for small samples)
    window: if provided, use trailing window only
    """
    data = returns.iloc[-window:] if window else returns
    data = data.dropna(how='all', axis=1).fillna(0)
    if method == "ledoit_wolf":
        try:
            from sklearn.covariance import LedoitWolf
            lw = LedoitWolf()
            lw.fit(data.values)
            cov = pd.DataFrame(lw.covariance_, index=data.columns, columns=data.columns)
        except ImportError:
            cov = data.cov()
    else:
        cov = data.cov()
    return cov
def correlation_matrix(returns: pd.DataFrame) -> pd.DataFrame:
    """Pearson correlation matrix from daily returns."""
    return returns.corr()
# ─── VOLATILITY DECOMPOSITION ─────────────────────────────────────────────────
def systematic_vs_idiosyncratic_vol(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series
) -> dict:
    """
    Decomposes total portfolio variance into:
    - Systematic: explained by benchmark (β² × σ²_benchmark)
    - Idiosyncratic: residual from regression
    High idiosyncratic share = taking bets not compensated by factor premia.
    """
    aligned_p, aligned_b = portfolio_returns.align(benchmark_returns, join='inner')
    slope, intercept, r_value, p_value, std_err = stats.linregress(
        aligned_b.values, aligned_p.values
    )
    beta = slope
    residuals = aligned_p.values - (intercept + beta * aligned_b.values)
    total_var = aligned_p.var(ddof=1)
    systematic_var = (beta ** 2) * aligned_b.var(ddof=1)
    idiosyncratic_var = pd.Series(residuals).var(ddof=1)
    return {
        "beta": float(beta),
        "r_squared": float(r_value ** 2),
        "total_vol_ann": float(np.sqrt(total_var * TRADING_DAYS)),
        "systematic_vol_ann": float(np.sqrt(max(systematic_var, 0) * TRADING_DAYS)),
        "idiosyncratic_vol_ann": float(np.sqrt(max(idiosyncratic_var, 0) * TRADING_DAYS)),
        "systematic_share": float(systematic_var / total_var) if total_var > 0 else 0.0,
        "idiosyncratic_share": float(idiosyncratic_var / total_var) if total_var > 0 else 0.0,
    }
# ─── MARGINAL CONTRIBUTION TO RISK ────────────────────────────────────────────
def marginal_contribution_to_risk(
    weights: np.ndarray,
    cov_matrix: np.ndarray
) -> np.ndarray:
    """
    MCTR per asset: ∂σ_portfolio / ∂w_i
    Tells the PM how much total portfolio vol changes with a marginal
    increase in each position's weight.
    Returns array of MCTRs in annualised percentage terms.
    """
    port_vol_daily = np.sqrt(max(weights @ cov_matrix @ weights, 0))
    if port_vol_daily == 0:
        return np.zeros(len(weights))
    mctr_daily = (cov_matrix @ weights) / port_vol_daily
    return mctr_daily * np.sqrt(TRADING_DAYS)
def risk_budget(
    weights: np.ndarray,
    cov_matrix: np.ndarray,
    asset_names: Optional[list] = None
) -> pd.DataFrame:
    """
    Risk budget decomposition: each asset's contribution to total portfolio vol.
    Returns DataFrame with columns:
    - weight: position weight
    - mctr: marginal contribution to risk (annualised)
    - risk_contribution: absolute risk contribution (w_i × MCTR_i)
    - risk_share: percentage of total portfolio risk budget
    """
    mctr = marginal_contribution_to_risk(weights, cov_matrix)
    risk_contrib = weights * mctr
    total_risk = risk_contrib.sum()
    df = pd.DataFrame({
        "weight": weights,
        "mctr": mctr,
        "risk_contribution": risk_contrib,
        "risk_share": risk_contrib / total_risk if total_risk > 0 else np.zeros(len(weights)),
    })
    if asset_names:
        df.index = asset_names
    return df.sort_values("risk_share", ascending=False)
# ─── VALUE AT RISK ────────────────────────────────────────────────────────────
def historical_var(
    daily_returns: pd.Series,
    confidence: float = 0.95,
    horizon_days: int = 1
) -> float:
    """
    Historical simulation VaR.
    Returns the loss at the given confidence level (positive number = loss).
    """
    scaled = daily_returns * np.sqrt(horizon_days)
    return float(-np.percentile(scaled.dropna(), (1 - confidence) * 100))
def conditional_var(
    daily_returns: pd.Series,
    confidence: float = 0.95,
    horizon_days: int = 1
) -> float:
    """
    CVaR (Expected Shortfall): mean loss beyond VaR threshold.
    A more informative tail risk measure than VaR alone.
    """
    var = historical_var(daily_returns, confidence, horizon_days)
    scaled = daily_returns * np.sqrt(horizon_days)
    tail = scaled[scaled < -var]
    return float(-tail.mean()) if len(tail) > 0 else var
def expected_shortfall_ratio(
    daily_returns: pd.Series,
    confidence: float = 0.95
) -> float:
    """
    CVaR / VaR ratio.
    Measures how much worse losses are in the tail beyond VaR.
    Ratio > 1.5 is a warning sign of fat-tailed loss distribution.
    """
    var = historical_var(daily_returns, confidence)
    cvar = conditional_var(daily_returns, confidence)
    return float(cvar / var) if var > 0 else 0.0
def parametric_var(
    daily_returns: pd.Series,
    confidence: float = 0.95,
    horizon_days: int = 1
) -> float:
    """
    Parametric VaR under normal distribution assumption.
    Useful for comparison against historical VaR to detect fat-tail risk.
    """
    mu = daily_returns.mean()
    sigma = daily_returns.std()
    z = stats.norm.ppf(1 - confidence)
    return float(-(mu + z * sigma) * np.sqrt(horizon_days))
# ─── FULL RISK SUMMARY ────────────────────────────────────────────────────────
def tail_risk_summary(daily_returns: pd.Series) -> dict:
    """
    Full tail risk summary for a return series.
    Returns VaR and CVaR at 95% and 99%, plus ES ratio and fat-tail flag.
    """
    h_var_95 = historical_var(daily_returns, 0.95)
    h_var_99 = historical_var(daily_returns, 0.99)
    cvar_95 = conditional_var(daily_returns, 0.95)
    cvar_99 = conditional_var(daily_returns, 0.99)
    p_var_95 = parametric_var(daily_returns, 0.95)
    es_ratio = expected_shortfall_ratio(daily_returns, 0.95)
    # Fat tail flag: historical VaR significantly exceeds parametric VaR
    fat_tail = h_var_95 > p_var_95 * 1.2
    return {
        "var_95_1d": round(h_var_95, 4),
        "var_99_1d": round(h_var_99, 4),
        "cvar_95_1d": round(cvar_95, 4),
        "cvar_99_1d": round(cvar_99, 4),
        "parametric_var_95": round(p_var_95, 4),
        "es_ratio_95": round(es_ratio, 3),
        "fat_tail_flag": fat_tail,
    }
