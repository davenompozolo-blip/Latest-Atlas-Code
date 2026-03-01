"""
ATLAS Quantitative Dashboard — Statistical Diagnostics Engine
Layer: Computation (stateless, pure functions)
Purpose: Distributional properties, serial structure, regime analytics
"""
import numpy as np
import pandas as pd
from typing import Tuple, Optional
from scipy import stats
TRADING_DAYS = 252
# ─── DISTRIBUTION PROPERTIES ─────────────────────────────────────────────────
def return_moments(daily_returns: pd.Series) -> dict:
    """
    First four moments of the return distribution.
    Skewness < 0 means left tail risk.
    Excess kurtosis > 0 means fat tails vs normal distribution.
    """
    r = daily_returns.dropna()
    return {
        "mean_daily": float(r.mean()),
        "std_daily": float(r.std()),
        "skewness": float(stats.skew(r)),
        "excess_kurtosis": float(stats.kurtosis(r)),  # scipy returns excess kurtosis
        "min_return": float(r.min()),
        "max_return": float(r.max()),
        "n_observations": len(r),
    }
def normality_test(daily_returns: pd.Series) -> dict:
    """
    Jarque-Bera test for normality.
    Null hypothesis: returns are normally distributed.
    Low p-value rejects normality — signals fat tails or skew that
    make standard risk models unreliable.
    """
    r = daily_returns.dropna()
    jb_stat, jb_pval = stats.jarque_bera(r)
    _, sw_pval = stats.shapiro(r) if len(r) <= 5000 else (None, None)
    return {
        "jarque_bera_stat": round(float(jb_stat), 4),
        "jarque_bera_pval": round(float(jb_pval), 6),
        "normal": jb_pval > 0.05,
        "shapiro_pval": round(float(sw_pval), 6) if sw_pval is not None else None,
    }
def distribution_fit(daily_returns: pd.Series) -> dict:
    """
    Fits normal, Student-t, and skewed-t distributions to the return series.
    Uses log-likelihood and AIC for model comparison.
    Returns best-fit distribution and parameters.
    """
    r = daily_returns.dropna().values
    results = {}
    # Normal
    mu, sigma = stats.norm.fit(r)
    ll_norm = np.sum(stats.norm.logpdf(r, mu, sigma))
    aic_norm = -2 * ll_norm + 2 * 2  # 2 params
    results["normal"] = {
        "params": {"mu": round(mu, 6), "sigma": round(sigma, 6)},
        "log_likelihood": round(ll_norm, 2),
        "aic": round(aic_norm, 2),
    }
    # Student-t
    df_t, loc_t, scale_t = stats.t.fit(r)
    ll_t = np.sum(stats.t.logpdf(r, df_t, loc_t, scale_t))
    aic_t = -2 * ll_t + 2 * 3  # 3 params
    results["student_t"] = {
        "params": {"df": round(df_t, 2), "loc": round(loc_t, 6), "scale": round(scale_t, 6)},
        "log_likelihood": round(ll_t, 2),
        "aic": round(aic_t, 2),
        "implied_tail_heaviness": "heavy" if df_t < 5 else "moderate" if df_t < 10 else "near-normal",
    }
    # Skewed normal (skew-normal)
    a_sn, loc_sn, scale_sn = stats.skewnorm.fit(r)
    ll_sn = np.sum(stats.skewnorm.logpdf(r, a_sn, loc_sn, scale_sn))
    aic_sn = -2 * ll_sn + 2 * 3
    results["skew_normal"] = {
        "params": {"a": round(a_sn, 3), "loc": round(loc_sn, 6), "scale": round(scale_sn, 6)},
        "log_likelihood": round(ll_sn, 2),
        "aic": round(aic_sn, 2),
    }
    # Best fit by AIC (lower is better)
    best = min(results.items(), key=lambda x: x[1]["aic"])
    results["best_fit"] = best[0]
    results["risk_implication"] = _distribution_risk_implication(best[0], results[best[0]])
    return results
def _distribution_risk_implication(dist_name: str, params: dict) -> str:
    if dist_name == "normal":
        return "Normal distribution assumption is adequate. Standard risk models apply."
    elif dist_name == "student_t":
        df = params["params"]["df"]
        if df < 5:
            return f"Heavy-tailed distribution (df={df:.1f}). VaR significantly understates tail risk. Use CVaR."
        return f"Moderate fat tails (df={df:.1f}). Normal distribution slightly understates extreme losses."
    else:
        return "Significant asymmetry detected. Downside risk model should account for skewed loss distribution."
# ─── SERIAL CORRELATION ───────────────────────────────────────────────────────
def autocorrelation_structure(
    daily_returns: pd.Series,
    max_lags: int = 20
) -> pd.DataFrame:
    """
    Full ACF structure up to max_lags.
    Returns DataFrame with lag, autocorrelation, and significance flag.
    Significant autocorrelation may indicate illiquidity, smoothing, or momentum.
    """
    r = daily_returns.dropna()
    n = len(r)
    conf_bound = 1.96 / np.sqrt(n)  # 95% confidence band
    lags = range(1, min(max_lags + 1, n // 2))
    result = []
    for lag in lags:
        acf = pd.Series(r.values).autocorr(lag=lag)
        result.append({
            "lag": lag,
            "autocorrelation": round(float(acf), 4),
            "significant": abs(acf) > conf_bound,
            "upper_bound": round(conf_bound, 4),
            "lower_bound": round(-conf_bound, 4),
        })
    return pd.DataFrame(result)
def first_order_autocorrelation(daily_returns: pd.Series) -> dict:
    """
    Lag-1 autocorrelation summary.
    ρ > 0: return momentum (yesterday's gain predicts today's gain)
    ρ < 0: mean reversion
    |ρ| > 0.15 with sufficient data is typically statistically significant.
    """
    r = daily_returns.dropna()
    rho = float(pd.Series(r.values).autocorr(lag=1))
    n = len(r)
    std_error = 1 / np.sqrt(n)
    t_stat = rho / std_error
    p_value = float(2 * (1 - stats.norm.cdf(abs(t_stat))))
    return {
        "rho_lag1": round(rho, 4),
        "t_statistic": round(t_stat, 3),
        "p_value": round(p_value, 4),
        "significant": p_value < 0.05,
        "interpretation": (
            "Positive autocorrelation — possible illiquidity effect or momentum." if rho > 0.1
            else "Negative autocorrelation — mild mean-reversion tendency." if rho < -0.1
            else "No significant serial dependence."
        ),
    }
# ─── HURST EXPONENT ───────────────────────────────────────────────────────────
def hurst_exponent(daily_returns: pd.Series, min_window: int = 20) -> dict:
    """
    Hurst Exponent via rescaled range (R/S) analysis.
    H > 0.5: trending / persistent (momentum present)
    H = 0.5: random walk
    H < 0.5: mean-reverting
    Directly informs rebalancing frequency decisions.
    A trending portfolio should be rebalanced less frequently.
    """
    r = daily_returns.dropna().values
    n = len(r)
    if n < min_window * 2:
        return {"hurst": None, "interpretation": "Insufficient data (need 2× min_window observations)"}
    # R/S analysis across multiple window sizes
    lags = []
    rs_values = []
    for window in range(min_window, n // 2, max(1, (n // 2 - min_window) // 20)):
        sub_rs = []
        for start in range(0, n - window, window):
            chunk = r[start:start + window]
            mean = chunk.mean()
            deviation = np.cumsum(chunk - mean)
            r_range = deviation.max() - deviation.min()
            s = chunk.std(ddof=1)
            if s > 0:
                sub_rs.append(r_range / s)
        if sub_rs:
            lags.append(window)
            rs_values.append(np.mean(sub_rs))
    if len(lags) < 4:
        return {"hurst": None, "interpretation": "Insufficient windows for reliable estimate"}
    log_lags = np.log(lags)
    log_rs = np.log(rs_values)
    slope, intercept, r_val, p_val, _ = stats.linregress(log_lags, log_rs)
    H = float(slope)
    return {
        "hurst": round(H, 4),
        "r_squared": round(float(r_val ** 2), 4),
        "regime": "Trending (H > 0.55)" if H > 0.55 else "Mean-Reverting (H < 0.45)" if H < 0.45 else "Random Walk",
        "interpretation": (
            f"H={H:.3f}: Returns exhibit trending behaviour. Momentum strategies may be effective. "
            f"Rebalancing too frequently may reduce performance." if H > 0.55
            else f"H={H:.3f}: Returns exhibit mean-reverting behaviour. More frequent rebalancing likely beneficial." if H < 0.45
            else f"H={H:.3f}: Returns approximate a random walk. Standard rebalancing intervals are appropriate."
        ),
        "rebalancing_implication": (
            "Reduce rebalancing frequency" if H > 0.55
            else "Increase rebalancing frequency" if H < 0.45
            else "Standard frequency appropriate"
        ),
    }
# ─── ROLLING SHARPE STABILITY ─────────────────────────────────────────────────
def rolling_sharpe_stability(
    daily_returns: pd.Series,
    window: int = 63,
    risk_free_rate: float = 0.0
) -> dict:
    """
    Computes rolling Sharpe with stability band (mean ± 1 std dev).
    A Sharpe that frequently breaches the band signals regime-dependent performance.
    """
    daily_rf = (1 + risk_free_rate) ** (1 / TRADING_DAYS) - 1
    excess = daily_returns - daily_rf
    def _sharpe(x):
        return (x.mean() / x.std() * np.sqrt(TRADING_DAYS)) if x.std() > 0 else np.nan
    rolling = excess.rolling(window).apply(_sharpe, raw=True).dropna()
    mean_sharpe = float(rolling.mean())
    std_sharpe = float(rolling.std())
    breaches = int((abs(rolling - mean_sharpe) > std_sharpe).sum())
    breach_rate = breaches / len(rolling) if len(rolling) > 0 else 0.0
    return {
        "rolling_sharpe": rolling,
        "mean_sharpe": round(mean_sharpe, 3),
        "std_sharpe": round(std_sharpe, 3),
        "upper_band": round(mean_sharpe + std_sharpe, 3),
        "lower_band": round(mean_sharpe - std_sharpe, 3),
        "breach_count": breaches,
        "breach_rate": round(breach_rate, 3),
        "stable": breach_rate < 0.20,
        "stability_flag": (
            "Sharpe is highly unstable — performance is strongly regime-dependent." if breach_rate > 0.30
            else "Moderate Sharpe instability detected." if breach_rate > 0.20
            else "Sharpe is stable across rolling windows."
        ),
    }
# ─── REGIME SENSITIVITY INDEX ─────────────────────────────────────────────────
def regime_sensitivity_index(
    portfolio_returns: pd.Series,
    benchmark_returns: Optional[pd.Series] = None,
    vol_percentile_split: float = 0.5
) -> dict:
    """
    Quantifies how differently the portfolio behaves across volatility regimes.
    Splits history at the median realised vol and compares key metrics.
    High RSI: portfolio quality in calm periods may not persist under stress.
    """
    r = portfolio_returns.dropna()
    rolling_vol = r.rolling(21).std() * np.sqrt(TRADING_DAYS)
    median_vol = rolling_vol.quantile(vol_percentile_split)
    high_vol_mask = rolling_vol >= median_vol
    low_vol_mask = rolling_vol < median_vol
    r_high = r[high_vol_mask]
    r_low = r[low_vol_mask]
    if len(r_high) < 21 or len(r_low) < 21:
        return {"rsi": None, "note": "Insufficient data for regime split."}
    def _sharpe(x):
        if x.std() == 0:
            return 0.0
        return float(x.mean() / x.std() * np.sqrt(TRADING_DAYS))
    metrics = {
        "high_vol_regime": {
            "sharpe": round(_sharpe(r_high), 3),
            "ann_vol": round(float(r_high.std() * np.sqrt(TRADING_DAYS)), 4),
            "ann_return": round(float((1 + r_high).prod() ** (TRADING_DAYS / len(r_high)) - 1), 4),
            "max_drawdown": round(float(r_high.cumsum().min()), 4),
        },
        "low_vol_regime": {
            "sharpe": round(_sharpe(r_low), 3),
            "ann_vol": round(float(r_low.std() * np.sqrt(TRADING_DAYS)), 4),
            "ann_return": round(float((1 + r_low).prod() ** (TRADING_DAYS / len(r_low)) - 1), 4),
            "max_drawdown": round(float(r_low.cumsum().min()), 4),
        },
    }
    # RSI = Sharpe degradation ratio between regimes
    low_sharpe = abs(metrics["low_vol_regime"]["sharpe"]) + 1e-6
    high_sharpe = abs(metrics["high_vol_regime"]["sharpe"]) + 1e-6
    rsi = float(1 - (high_sharpe / low_sharpe))
    rsi = max(0.0, min(1.0, rsi))
    return {
        "rsi": round(rsi, 4),
        "interpretation": (
            "High regime sensitivity — performance degrades significantly in stressed markets." if rsi > 0.5
            else "Moderate regime sensitivity — some performance variation across volatility regimes." if rsi > 0.25
            else "Low regime sensitivity — performance characteristics are consistent across regimes."
        ),
        "regimes": metrics,
    }
