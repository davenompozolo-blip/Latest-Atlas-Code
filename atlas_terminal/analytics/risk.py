"""
Risk Analytics Module
Comprehensive risk metrics for portfolio analysis

FEATURES:
- VaR (Value at Risk) - Historical and Parametric
- CVaR (Conditional VaR / Expected Shortfall)
- Sharpe Ratio
- Sortino Ratio
- Calmar Ratio
- Information Ratio
- Maximum Drawdown Duration
- Ulcer Index
- Tail Risk Analysis
"""

import pandas as pd
import numpy as np
from scipy import stats
from typing import Optional, Dict, Tuple
import logging

from ..data.validators import validate_returns_series, is_valid_series
from .portfolio import calculate_drawdown, calculate_cumulative_returns, calculate_beta, calculate_max_drawdown

logger = logging.getLogger(__name__)


def calculate_var(returns: pd.Series,
                 confidence_level: float = 0.95,
                 method: str = 'historical') -> Optional[float]:
    """
    Calculate Value at Risk (VaR)

    VaR answers: "What is the maximum loss I can expect with X% confidence?"

    Args:
        returns: Series of returns
        confidence_level: Confidence level (e.g., 0.95 for 95%)
        method: 'historical' or 'parametric'

    Returns:
        VaR as negative return (e.g., -0.05 for 5% loss) or None
    """
    if not validate_returns_series(returns):
        logger.error("Invalid returns for VaR calculation")
        return None

    try:
        if method == 'historical':
            # Historical VaR: Use empirical quantile
            var = returns.quantile(1 - confidence_level)

        elif method == 'parametric':
            # Parametric VaR: Assume normal distribution
            mean = returns.mean()
            std = returns.std()
            z_score = stats.norm.ppf(1 - confidence_level)
            var = mean + z_score * std

        else:
            logger.error(f"Unknown VaR method: {method}")
            return None

        logger.info(f"VaR ({confidence_level*100:.0f}%, {method}): {var*100:.2f}%")
        return var

    except Exception as e:
        logger.error(f"Error calculating VaR: {e}", exc_info=True)
        return None


def calculate_cvar(returns: pd.Series,
                  confidence_level: float = 0.95) -> Optional[float]:
    """
    Calculate Conditional Value at Risk (CVaR) / Expected Shortfall

    CVaR answers: "Given that we breach VaR, what is the expected loss?"
    More conservative than VaR as it accounts for tail risk.

    Args:
        returns: Series of returns
        confidence_level: Confidence level (e.g., 0.95 for 95%)

    Returns:
        CVaR as negative return or None
    """
    if not validate_returns_series(returns):
        logger.error("Invalid returns for CVaR calculation")
        return None

    try:
        var = calculate_var(returns, confidence_level, method='historical')

        if var is None:
            return None

        # CVaR = Average of all returns worse than VaR
        tail_returns = returns[returns <= var]

        if len(tail_returns) == 0:
            logger.warning("No tail returns for CVaR calculation")
            return var  # Return VaR as fallback

        cvar = tail_returns.mean()

        logger.info(f"CVaR ({confidence_level*100:.0f}%): {cvar*100:.2f}%")
        return cvar

    except Exception as e:
        logger.error(f"Error calculating CVaR: {e}", exc_info=True)
        return None


def calculate_sharpe_ratio(returns: pd.Series,
                          risk_free_rate: float = 0.045,
                          periods_per_year: int = 252) -> Optional[float]:
    """
    Calculate Sharpe Ratio

    Sharpe = (Return - Risk Free Rate) / Volatility
    Measures excess return per unit of total risk

    Args:
        returns: Series of returns
        risk_free_rate: Annual risk-free rate
        periods_per_year: Annualization factor (252 for daily, 12 for monthly)

    Returns:
        Sharpe ratio or None
    """
    if not validate_returns_series(returns):
        logger.error("Invalid returns for Sharpe ratio calculation")
        return None

    try:
        # Annualized return
        annualized_return = returns.mean() * periods_per_year

        # Annualized volatility
        annualized_vol = returns.std() * np.sqrt(periods_per_year)

        if annualized_vol == 0:
            logger.warning("Zero volatility, cannot calculate Sharpe ratio")
            return None

        # Sharpe ratio
        sharpe = (annualized_return - risk_free_rate) / annualized_vol

        logger.info(f"Sharpe Ratio: {sharpe:.2f}")
        return sharpe

    except Exception as e:
        logger.error(f"Error calculating Sharpe ratio: {e}", exc_info=True)
        return None


def calculate_sortino_ratio(returns: pd.Series,
                           risk_free_rate: float = 0.045,
                           periods_per_year: int = 252,
                           target_return: Optional[float] = None) -> Optional[float]:
    """
    Calculate Sortino Ratio

    Sortino = (Return - Target) / Downside Deviation
    Like Sharpe but only penalizes downside volatility

    Args:
        returns: Series of returns
        risk_free_rate: Annual risk-free rate
        periods_per_year: Annualization factor
        target_return: Target return (defaults to risk_free_rate)

    Returns:
        Sortino ratio or None
    """
    if not validate_returns_series(returns):
        logger.error("Invalid returns for Sortino ratio calculation")
        return None

    if target_return is None:
        target_return = risk_free_rate / periods_per_year  # Convert to period return

    try:
        # Annualized return
        annualized_return = returns.mean() * periods_per_year

        # Downside deviation (only negative returns relative to target)
        downside_returns = returns[returns < target_return]

        if len(downside_returns) == 0:
            logger.info("No downside returns, Sortino ratio is very high")
            return 999.0  # Arbitrarily high

        downside_std = downside_returns.std()
        annualized_downside = downside_std * np.sqrt(periods_per_year)

        if annualized_downside == 0:
            logger.warning("Zero downside deviation")
            return None

        # Sortino ratio
        sortino = (annualized_return - risk_free_rate) / annualized_downside

        logger.info(f"Sortino Ratio: {sortino:.2f}")
        return sortino

    except Exception as e:
        logger.error(f"Error calculating Sortino ratio: {e}", exc_info=True)
        return None


def calculate_calmar_ratio(returns: pd.Series,
                          periods_per_year: int = 252) -> Optional[float]:
    """
    Calculate Calmar Ratio

    Calmar = Annualized Return / |Maximum Drawdown|
    Measures return per unit of worst drawdown

    Args:
        returns: Series of returns
        periods_per_year: Annualization factor

    Returns:
        Calmar ratio or None
    """
    if not validate_returns_series(returns):
        logger.error("Invalid returns for Calmar ratio calculation")
        return None

    try:
        # Annualized return
        annualized_return = returns.mean() * periods_per_year

        # Calculate maximum drawdown
        cumulative = calculate_cumulative_returns(returns)
        if cumulative is None:
            return None

        drawdown = calculate_drawdown(cumulative)
        if drawdown is None:
            return None

        max_dd = abs(drawdown.min())

        if max_dd == 0:
            logger.warning("Zero drawdown, Calmar ratio is very high")
            return 999.0

        # Calmar ratio
        calmar = annualized_return / max_dd

        logger.info(f"Calmar Ratio: {calmar:.2f}")
        return calmar

    except Exception as e:
        logger.error(f"Error calculating Calmar ratio: {e}", exc_info=True)
        return None


def calculate_information_ratio(portfolio_returns: pd.Series,
                                benchmark_returns: pd.Series,
                                periods_per_year: int = 252) -> Optional[float]:
    """
    Calculate Information Ratio

    IR = (Portfolio Return - Benchmark Return) / Tracking Error
    Measures active return per unit of active risk

    Args:
        portfolio_returns: Portfolio return series
        benchmark_returns: Benchmark return series
        periods_per_year: Annualization factor

    Returns:
        Information ratio or None
    """
    if not validate_returns_series(portfolio_returns) or not validate_returns_series(benchmark_returns):
        logger.error("Invalid returns for Information ratio calculation")
        return None

    try:
        # Align returns
        aligned = pd.DataFrame({
            'portfolio': portfolio_returns,
            'benchmark': benchmark_returns
        }).dropna()

        if len(aligned) < 10:
            logger.warning("Insufficient overlapping data for Information ratio")
            return None

        # Active returns
        active_returns = aligned['portfolio'] - aligned['benchmark']

        # Annualized active return
        annualized_active = active_returns.mean() * periods_per_year

        # Tracking error (volatility of active returns)
        tracking_error = active_returns.std() * np.sqrt(periods_per_year)

        if tracking_error == 0:
            logger.warning("Zero tracking error")
            return None

        # Information ratio
        ir = annualized_active / tracking_error

        logger.info(f"Information Ratio: {ir:.2f}")
        return ir

    except Exception as e:
        logger.error(f"Error calculating Information ratio: {e}", exc_info=True)
        return None


def calculate_max_drawdown_duration(cumulative_returns: pd.Series) -> Optional[int]:
    """
    Calculate maximum drawdown duration (longest time to recover from drawdown)

    Args:
        cumulative_returns: Series of cumulative returns

    Returns:
        Maximum drawdown duration in periods or None
    """
    if not is_valid_series(cumulative_returns):
        logger.error("Invalid cumulative returns for drawdown duration")
        return None

    try:
        drawdown = calculate_drawdown(cumulative_returns)
        if drawdown is None:
            return None

        # Find all drawdown periods
        in_drawdown = drawdown < 0

        if not in_drawdown.any():
            return 0  # No drawdowns

        # Calculate consecutive drawdown periods
        drawdown_periods = []
        current_duration = 0

        for is_dd in in_drawdown:
            if is_dd:
                current_duration += 1
            else:
                if current_duration > 0:
                    drawdown_periods.append(current_duration)
                current_duration = 0

        # Check if we're still in drawdown at the end
        if current_duration > 0:
            drawdown_periods.append(current_duration)

        if not drawdown_periods:
            return 0

        max_duration = max(drawdown_periods)

        logger.info(f"Maximum drawdown duration: {max_duration} periods")
        return max_duration

    except Exception as e:
        logger.error(f"Error calculating max drawdown duration: {e}", exc_info=True)
        return None


def calculate_ulcer_index(cumulative_returns: pd.Series,
                         periods_per_year: int = 252) -> Optional[float]:
    """
    Calculate Ulcer Index

    Measures both depth and duration of drawdowns
    Lower is better (less "pain" from drawdowns)

    Args:
        cumulative_returns: Series of cumulative returns
        periods_per_year: Annualization factor

    Returns:
        Annualized Ulcer Index or None
    """
    if not is_valid_series(cumulative_returns):
        logger.error("Invalid cumulative returns for Ulcer Index")
        return None

    try:
        drawdown = calculate_drawdown(cumulative_returns)
        if drawdown is None:
            return None

        # Convert drawdown to percentage
        drawdown_pct = drawdown * 100

        # Ulcer Index = sqrt(mean of squared drawdowns)
        ulcer = np.sqrt((drawdown_pct ** 2).mean())

        # Annualize
        ulcer_annual = ulcer * np.sqrt(periods_per_year)

        logger.info(f"Ulcer Index: {ulcer_annual:.2f}")
        return ulcer_annual

    except Exception as e:
        logger.error(f"Error calculating Ulcer Index: {e}", exc_info=True)
        return None


def calculate_tail_risk_metrics(returns: pd.Series) -> Dict:
    """
    Calculate comprehensive tail risk metrics

    Args:
        returns: Series of returns

    Returns:
        Dict with tail risk metrics
    """
    if not validate_returns_series(returns):
        logger.error("Invalid returns for tail risk calculation")
        return {}

    try:
        # VaR at different confidence levels
        var_90 = calculate_var(returns, 0.90)
        var_95 = calculate_var(returns, 0.95)
        var_99 = calculate_var(returns, 0.99)

        # CVaR at different confidence levels
        cvar_90 = calculate_cvar(returns, 0.90)
        cvar_95 = calculate_cvar(returns, 0.95)
        cvar_99 = calculate_cvar(returns, 0.99)

        # Skewness (negative = left tail is fatter)
        skewness = returns.skew()

        # Excess kurtosis (positive = fat tails)
        excess_kurtosis = returns.kurtosis()

        # Count of extreme events (> 2 std deviations)
        std = returns.std()
        mean = returns.mean()
        extreme_negative = (returns < mean - 2*std).sum()
        extreme_positive = (returns > mean + 2*std).sum()

        metrics = {
            'var_90': var_90,
            'var_95': var_95,
            'var_99': var_99,
            'cvar_90': cvar_90,
            'cvar_95': cvar_95,
            'cvar_99': cvar_99,
            'skewness': skewness,
            'excess_kurtosis': excess_kurtosis,
            'extreme_negative_events': int(extreme_negative),
            'extreme_positive_events': int(extreme_positive)
        }

        logger.info(f"Tail risk analysis: VaR 95%={var_95*100:.2f}%, CVaR 95%={cvar_95*100:.2f}%")

        return metrics

    except Exception as e:
        logger.error(f"Error calculating tail risk metrics: {e}", exc_info=True)
        return {}


def calculate_comprehensive_risk_metrics(returns: pd.Series,
                                        benchmark_returns: Optional[pd.Series] = None,
                                        risk_free_rate: float = 0.045,
                                        periods_per_year: int = 252) -> Dict:
    """
    Calculate all risk metrics in one comprehensive analysis

    Args:
        returns: Series of portfolio returns
        benchmark_returns: Optional benchmark returns for relative metrics
        risk_free_rate: Annual risk-free rate
        periods_per_year: Annualization factor

    Returns:
        Dict with all risk metrics
    """
    if not validate_returns_series(returns):
        logger.error("Invalid returns for comprehensive risk analysis")
        return {}

    try:
        cumulative = calculate_cumulative_returns(returns)
        drawdown = calculate_drawdown(cumulative) if cumulative is not None else None

        metrics = {
            # Basic risk metrics
            'volatility': returns.std() * np.sqrt(periods_per_year),
            'downside_volatility': returns[returns < 0].std() * np.sqrt(periods_per_year) if len(returns[returns < 0]) > 0 else 0,

            # VaR/CVaR
            'var_95': calculate_var(returns, 0.95),
            'var_99': calculate_var(returns, 0.99),
            'cvar_95': calculate_cvar(returns, 0.95),
            'cvar_99': calculate_cvar(returns, 0.99),

            # Risk-adjusted ratios
            'sharpe_ratio': calculate_sharpe_ratio(returns, risk_free_rate, periods_per_year),
            'sortino_ratio': calculate_sortino_ratio(returns, risk_free_rate, periods_per_year),
            'calmar_ratio': calculate_calmar_ratio(returns, periods_per_year),

            # Drawdown metrics
            'max_drawdown': drawdown.min() if drawdown is not None else None,
            'max_drawdown_duration': calculate_max_drawdown_duration(cumulative) if cumulative is not None else None,
            'ulcer_index': calculate_ulcer_index(cumulative, periods_per_year) if cumulative is not None else None,

            # Distribution metrics
            'skewness': returns.skew(),
            'kurtosis': returns.kurtosis()
        }

        # Add benchmark-relative metrics if available
        if benchmark_returns is not None and validate_returns_series(benchmark_returns):
            metrics['beta'] = calculate_beta(returns, benchmark_returns)
            metrics['information_ratio'] = calculate_information_ratio(returns, benchmark_returns, periods_per_year)

        logger.info("Comprehensive risk metrics calculated successfully")

        return metrics

    except Exception as e:
        logger.error(f"Error calculating comprehensive risk metrics: {e}", exc_info=True)
        return {}


def assess_risk_level(metrics: Dict) -> str:
    """
    Assess overall portfolio risk level based on metrics

    Args:
        metrics: Dict of risk metrics

    Returns:
        Risk level string: "Low", "Moderate", "High", "Extreme"
    """
    if not metrics:
        return "Unknown"

    try:
        risk_score = 0

        # Volatility assessment (0-3 points)
        volatility = metrics.get('volatility', 0)
        if volatility > 0.40:  # >40% volatility
            risk_score += 3
        elif volatility > 0.25:  # >25% volatility
            risk_score += 2
        elif volatility > 0.15:  # >15% volatility
            risk_score += 1

        # Max drawdown assessment (0-3 points)
        max_dd = abs(metrics.get('max_drawdown', 0))
        if max_dd > 0.40:  # >40% drawdown
            risk_score += 3
        elif max_dd > 0.25:  # >25% drawdown
            risk_score += 2
        elif max_dd > 0.15:  # >15% drawdown
            risk_score += 1

        # Sharpe ratio assessment (bonus for good risk-adjusted returns)
        sharpe = metrics.get('sharpe_ratio')
        if sharpe is not None:
            if sharpe < 0.5:
                risk_score += 1  # Poor risk-adjusted returns

        # Risk level determination
        if risk_score >= 5:
            return "Extreme"
        elif risk_score >= 3:
            return "High"
        elif risk_score >= 1:
            return "Moderate"
        else:
            return "Low"

    except Exception as e:
        logger.error(f"Error assessing risk level: {e}", exc_info=True)
        return "Unknown"


def calculate_portfolio_volatility(returns: pd.Series, periods_per_year: int = 252) -> Optional[float]:
    """
    Calculate annualized portfolio volatility

    Args:
        returns: Series of returns
        periods_per_year: Annualization factor (252 for daily, 52 for weekly, 12 for monthly)

    Returns:
        Annualized volatility as float (e.g., 0.25 for 25%) or None if invalid
    """
    if not validate_returns_series(returns):
        logger.error("Invalid returns for volatility calculation")
        return None

    try:
        volatility = returns.std() * np.sqrt(periods_per_year)
        logger.info(f"Portfolio Volatility: {volatility*100:.2f}%")
        return float(volatility)
    except Exception as e:
        logger.error(f"Error calculating volatility: {e}", exc_info=True)
        return None


def calculate_position_var(position_returns: pd.Series,
                           confidence_level: float = 0.95,
                           method: str = 'historical') -> Optional[float]:
    """
    Calculate VaR for a single position

    Wrapper around calculate_var for position-level VaR calculations

    Args:
        position_returns: Returns series for the position
        confidence_level: Confidence level (e.g., 0.95 for 95%)
        method: 'historical' or 'parametric'

    Returns:
        Position VaR as negative float or None if invalid
    """
    return calculate_var(position_returns, confidence_level, method)
