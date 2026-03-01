"""
ATLAS Quantitative Dashboard — Quant Flags Engine
Layer: Prescriptive (synthesises all module outputs)
Purpose: Surface threshold-triggered anomalies in institutional language.
         Maximum 5 active flags. Deterministic rules, not ML.
"""
import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import List, Optional
from enum import Enum
class FlagSeverity(Enum):
    INFO = "info"          # Notable but not concerning
    WATCH = "watch"        # Warrants monitoring
    ALERT = "alert"        # Warrants action
@dataclass
class QuantFlag:
    """A single quant flag surfaced by the analytics engine."""
    flag_id: str
    title: str
    narrative: str
    data_points: dict         # The specific numbers that triggered the flag
    severity: FlagSeverity
    module: str               # Which module the flag originates from
    metric_key: str           # The specific metric that triggered
# ─── INDIVIDUAL FLAG RULES ────────────────────────────────────────────────────
def flag_concentration_anomaly(
    enb_current: float,
    enb_prior_60d: float,
    top5_risk_share: float,
) -> Optional[QuantFlag]:
    """
    Triggers if effective diversification has declined materially
    or if risk is becoming highly concentrated.
    """
    enb_decline = (enb_prior_60d - enb_current) / enb_prior_60d if enb_prior_60d > 0 else 0
    if enb_decline > 0.30 or top5_risk_share > 0.55:
        severity = FlagSeverity.ALERT if (enb_decline > 0.40 or top5_risk_share > 0.65) else FlagSeverity.WATCH
        return QuantFlag(
            flag_id="concentration_anomaly",
            title="Effective Diversification Declining",
            narrative=(
                f"Effective number of bets has declined from {enb_prior_60d:.1f} to {enb_current:.1f} "
                f"over the trailing 60 days ({enb_decline * 100:.0f}% reduction). "
                f"The top 5 positions now account for {top5_risk_share * 100:.0f}% of total portfolio risk budget. "
                f"Review whether concentration is intentional or a consequence of performance drift."
            ),
            data_points={
                "enb_current": round(enb_current, 2),
                "enb_60d_prior": round(enb_prior_60d, 2),
                "enb_decline_pct": round(enb_decline * 100, 1),
                "top5_risk_share_pct": round(top5_risk_share * 100, 1),
            },
            severity=severity,
            module="Portfolio Structure",
            metric_key="enb",
        )
    return None
def flag_sharpe_deterioration(
    rolling_sharpe_series: pd.Series,
    current_sharpe: float,
    mean_sharpe: float,
    std_sharpe: float,
) -> Optional[QuantFlag]:
    """
    Triggers when rolling Sharpe crosses below the historical mean minus 1 std dev
    for the first time in a defined lookback period.
    """
    lower_band = mean_sharpe - std_sharpe
    if current_sharpe < lower_band:
        # Check if this is a first-time breach in the last 180 days
        recent = rolling_sharpe_series.tail(180)
        previous_breach = (recent.iloc[:-1] < lower_band).any()
        if not previous_breach or current_sharpe < mean_sharpe - 2 * std_sharpe:
            severity = FlagSeverity.ALERT if current_sharpe < mean_sharpe - 2 * std_sharpe else FlagSeverity.WATCH
            return QuantFlag(
                flag_id="sharpe_deterioration",
                title="Rolling Sharpe Below Historical Band",
                narrative=(
                    f"Rolling 90-day Sharpe ({current_sharpe:.2f}) has moved below the historical "
                    f"mean minus 1 standard deviation (lower band: {lower_band:.2f}). "
                    f"Historical Sharpe: {mean_sharpe:.2f} ± {std_sharpe:.2f}. "
                    f"This may indicate a structural regime shift or alpha decay in current market conditions."
                ),
                data_points={
                    "current_sharpe": round(current_sharpe, 3),
                    "historical_mean": round(mean_sharpe, 3),
                    "lower_band": round(lower_band, 3),
                    "std_sharpe": round(std_sharpe, 3),
                },
                severity=severity,
                module="Performance Intelligence",
                metric_key="rolling_sharpe",
            )
    return None
def flag_serial_correlation(
    rho_lag1: float,
    p_value: float,
    n_obs: int,
) -> Optional[QuantFlag]:
    """
    Flags significant positive autocorrelation — possible illiquidity effects
    or return smoothing, which distort standard risk metrics.
    """
    if abs(rho_lag1) > 0.15 and p_value < 0.05 and n_obs >= 100:
        direction = "positive" if rho_lag1 > 0 else "negative"
        return QuantFlag(
            flag_id="serial_correlation",
            title=f"Significant {direction.capitalize()} Autocorrelation Detected",
            narrative=(
                f"Portfolio returns exhibit significant {direction} first-order autocorrelation "
                f"(ρ = {rho_lag1:.3f}, p = {p_value:.4f}). "
                + ("This is consistent with return smoothing in illiquid assets, "
                   "which may cause standard VaR and volatility estimates to understate true risk. "
                   "Verify pricing accuracy of underlying holdings." if rho_lag1 > 0
                   else "Mild mean-reversion tendency detected. Current volatility estimates may be marginally elevated.")
            ),
            data_points={
                "rho_lag1": round(rho_lag1, 4),
                "p_value": round(p_value, 5),
                "n_observations": n_obs,
            },
            severity=FlagSeverity.WATCH if abs(rho_lag1) < 0.25 else FlagSeverity.ALERT,
            module="Statistical Diagnostics",
            metric_key="autocorrelation",
        )
    return None
def flag_fat_tail_risk(
    es_ratio: float,
    excess_kurtosis: float,
    normality_rejected: bool,
) -> Optional[QuantFlag]:
    """
    Flags when the portfolio return distribution has materially heavier tails
    than normal, making standard risk metrics potentially misleading.
    """
    if es_ratio > 1.4 and normality_rejected and excess_kurtosis > 2:
        severity = FlagSeverity.ALERT if es_ratio > 1.7 else FlagSeverity.WATCH
        return QuantFlag(
            flag_id="fat_tail_risk",
            title="Non-Normal Return Distribution — Tail Risk Elevated",
            narrative=(
                f"Portfolio returns exhibit excess kurtosis of {excess_kurtosis:.1f} and an "
                f"Expected Shortfall ratio of {es_ratio:.2f}x (CVaR is {es_ratio:.2f}× the VaR). "
                f"The normality assumption is statistically rejected. "
                f"Standard deviation-based risk measures are likely understating true downside risk. "
                f"CVaR should be the primary risk metric for this portfolio."
            ),
            data_points={
                "excess_kurtosis": round(excess_kurtosis, 2),
                "es_ratio": round(es_ratio, 3),
                "normality_rejected": normality_rejected,
            },
            severity=severity,
            module="Statistical Diagnostics",
            metric_key="distribution",
        )
    return None
def flag_redundant_positions(
    redundancy_df: pd.DataFrame,
    threshold: float = 0.80,
) -> Optional[QuantFlag]:
    """
    Flags when high-correlation position pairs represent a meaningful
    combined portfolio weight — diversification may be illusory.
    """
    if redundancy_df is None or redundancy_df.empty:
        return None
    high_redundancy = redundancy_df[
        (redundancy_df["correlation"] >= threshold) &
        (redundancy_df["combined_weight"] >= 5.0)
    ]
    if len(high_redundancy) == 0:
        return None
    top = high_redundancy.iloc[0]
    n_pairs = len(high_redundancy)
    return QuantFlag(
        flag_id="redundant_positions",
        title="Redundant Position Clustering Detected",
        narrative=(
            f"{n_pairs} position pair(s) with correlation ≥ {threshold:.0%} each exceeding 5% combined weight. "
            f"Highest redundancy: {top['asset_1']} / {top['asset_2']} "
            f"(ρ = {top['correlation']:.2f}, combined weight {top['combined_weight']:.1f}%). "
            f"These positions may represent the same economic bet under different labels. "
            f"Review whether both are required or if one could be consolidated without meaningful exposure change."
        ),
        data_points={
            "n_redundant_pairs": n_pairs,
            "highest_corr_pair": f"{top['asset_1']} / {top['asset_2']}",
            "highest_corr": float(top["correlation"]),
            "combined_weight_pct": float(top["combined_weight"]),
        },
        severity=FlagSeverity.WATCH,
        module="Portfolio Structure",
        metric_key="redundancy",
    )
def flag_regime_sensitivity(rsi: float) -> Optional[QuantFlag]:
    """
    Flags high regime sensitivity — portfolio behaves materially
    differently in high-vol vs low-vol environments.
    """
    if rsi > 0.40:
        severity = FlagSeverity.ALERT if rsi > 0.60 else FlagSeverity.WATCH
        return QuantFlag(
            flag_id="regime_sensitivity",
            title="High Regime Sensitivity Index",
            narrative=(
                f"Regime Sensitivity Index of {rsi:.2f} indicates the portfolio's risk-adjusted "
                f"performance degrades significantly during high-volatility market regimes. "
                f"Performance metrics derived from full-history data may be overstating long-run quality. "
                f"Consider stress testing current positioning against elevated volatility scenarios."
            ),
            data_points={"rsi": round(rsi, 4)},
            severity=severity,
            module="Statistical Diagnostics",
            metric_key="regime_sensitivity",
        )
    return None
# ─── FLAGS ORCHESTRATOR ───────────────────────────────────────────────────────
class QuantFlagsEngine:
    """
    Orchestrates all flag rules.
    Takes pre-computed metrics as input, returns ranked list of active flags.
    Maximum 5 flags surfaced at any time (ranked by severity).
    """
    MAX_FLAGS = 5
    SEVERITY_RANK = {
        FlagSeverity.ALERT: 0,
        FlagSeverity.WATCH: 1,
        FlagSeverity.INFO: 2,
    }
    def evaluate(
        self,
        enb_current: float = None,
        enb_prior_60d: float = None,
        top5_risk_share: float = None,
        rolling_sharpe_series: pd.Series = None,
        current_sharpe: float = None,
        mean_sharpe: float = None,
        std_sharpe: float = None,
        rho_lag1: float = None,
        autocorr_pval: float = None,
        n_obs: int = None,
        es_ratio: float = None,
        excess_kurtosis: float = None,
        normality_rejected: bool = None,
        redundancy_df: pd.DataFrame = None,
        rsi: float = None,
    ) -> List[QuantFlag]:
        """
        Evaluates all flag rules against provided metrics.
        Returns list of active flags sorted by severity, capped at MAX_FLAGS.
        """
        flags = []
        # Concentration
        if all(v is not None for v in [enb_current, enb_prior_60d, top5_risk_share]):
            f = flag_concentration_anomaly(enb_current, enb_prior_60d, top5_risk_share)
            if f:
                flags.append(f)
        # Sharpe stability
        if all(v is not None for v in [rolling_sharpe_series, current_sharpe, mean_sharpe, std_sharpe]):
            f = flag_sharpe_deterioration(rolling_sharpe_series, current_sharpe, mean_sharpe, std_sharpe)
            if f:
                flags.append(f)
        # Autocorrelation
        if all(v is not None for v in [rho_lag1, autocorr_pval, n_obs]):
            f = flag_serial_correlation(rho_lag1, autocorr_pval, n_obs)
            if f:
                flags.append(f)
        # Fat tails
        if all(v is not None for v in [es_ratio, excess_kurtosis, normality_rejected]):
            f = flag_fat_tail_risk(es_ratio, excess_kurtosis, normality_rejected)
            if f:
                flags.append(f)
        # Redundancy
        if redundancy_df is not None:
            f = flag_redundant_positions(redundancy_df)
            if f:
                flags.append(f)
        # Regime sensitivity
        if rsi is not None:
            f = flag_regime_sensitivity(rsi)
            if f:
                flags.append(f)
        # Sort by severity, return top MAX_FLAGS
        flags.sort(key=lambda x: self.SEVERITY_RANK[x.severity])
        return flags[:self.MAX_FLAGS]
# ─── PORTFOLIO HEALTH SCORE ───────────────────────────────────────────────────
def portfolio_health_score(
    enb: float,
    n_positions: int,
    sharpe_stability_breach_rate: float,
    rolling_sharpe_current: float,
    max_drawdown: float,
    avg_drawdown_duration: float,
    excess_kurtosis: float,
    normality_rejected: bool,
    rsi: float,
) -> dict:
    """
    Composite Portfolio Health Score (0–100).
    Five sub-scores, each 0–20:
    1. Diversification Quality (ENB-based, 0–20)
    2. Risk Efficiency (Sharpe stability, 0–20)
    3. Drawdown Resilience (drawdown anatomy, 0–20)
    4. Statistical Integrity (distribution properties, 0–20)
    5. Regime Consistency (RSI, 0–20)
    """
    # 1. Diversification Quality
    # Perfect: ENB = N (each position is independent)
    # Scale: ENB / N * 20, capped at 20
    diversity_ratio = min(enb / max(n_positions, 1), 1.0)
    diversification_score = round(diversity_ratio * 20, 1)
    # 2. Risk Efficiency (Sharpe stability + level)
    stability_component = max(0, 1 - sharpe_stability_breach_rate * 2) * 10
    level_component = min(max((rolling_sharpe_current + 0.5) / 2.5 * 10, 0), 10)
    risk_efficiency_score = round(stability_component + level_component, 1)
    # 3. Drawdown Resilience
    # Max drawdown: -50% or worse → 0, 0% → 20
    dd_component = max(0, (1 + max(max_drawdown, -0.5)) / 0.5 * 15)
    duration_component = max(0, 5 - avg_drawdown_duration / 30)  # Penalise long recoveries
    drawdown_score = round(min(dd_component + duration_component, 20), 1)
    # 4. Statistical Integrity
    kurtosis_penalty = min(max(excess_kurtosis, 0) / 10 * 10, 10)
    normality_penalty = 5 if normality_rejected else 0
    statistical_score = round(max(20 - kurtosis_penalty - normality_penalty, 0), 1)
    # 5. Regime Consistency
    regime_score = round(max(0, (1 - rsi) * 20) if rsi is not None else 10, 1)
    total = diversification_score + risk_efficiency_score + drawdown_score + statistical_score + regime_score
    return {
        "total": round(total, 1),
        "grade": (
            "A" if total >= 80 else "B" if total >= 65 else "C" if total >= 50 else "D" if total >= 35 else "F"
        ),
        "sub_scores": {
            "diversification": diversification_score,
            "risk_efficiency": risk_efficiency_score,
            "drawdown_resilience": drawdown_score,
            "statistical_integrity": statistical_score,
            "regime_consistency": regime_score,
        },
    }
