"""
Portfolio Analytics Module
Handles portfolio return calculations with LEVERAGE ADJUSTMENT

CRITICAL FEATURES:
- Leverage-adjusted returns (v10.0 fix)
- Cumulative return calculations
- Drawdown analysis
- Portfolio statistics
- Position contribution analysis
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
import logging

from ..data.validators import is_valid_dataframe, is_valid_series, validate_returns_series
from ..data.parsers import get_leverage_info
from ..data.fetchers import fetch_historical_data

logger = logging.getLogger(__name__)


def calculate_portfolio_returns(account_history: pd.DataFrame,
                                apply_leverage: bool = True) -> Optional[pd.Series]:
    """
    CRITICAL v10.0 FIX: Calculate portfolio returns with leverage adjustment

    When using margin/leverage, a 1% market move results in leveraged_ratio% portfolio move.
    Example: With 2x leverage, 1% gain = 2% portfolio gain (and 1% loss = 2% portfolio loss)

    Args:
        account_history: DataFrame with 'Total Value' column and date index
        apply_leverage: Whether to apply leverage adjustment (default: True)

    Returns:
        Series of portfolio returns (leveraged if applicable) or None
    """
    if not is_valid_dataframe(account_history):
        logger.error("Invalid account history for return calculation")
        return None

    try:
        # Calculate base returns from total value
        if 'Total Value' not in account_history.columns:
            logger.error("Account history missing 'Total Value' column")
            return None

        total_values = account_history['Total Value']

        # Handle string formatting
        if total_values.dtype == 'object':
            total_values = total_values.apply(lambda x:
                float(str(x).replace('$', '').replace(',', '').replace('(', '-').replace(')', ''))
                if isinstance(x, str) else float(x)
            )

        # Calculate unleveraged returns
        unleveraged_returns = total_values.pct_change().dropna()

        if not apply_leverage:
            logger.info("Returning unleveraged returns")
            return unleveraged_returns

        # CRITICAL: Get leverage info and apply adjustment
        leverage_info = get_leverage_info()

        if leverage_info is None or leverage_info['leverage_ratio'] <= 1.01:
            # No leverage or minimal leverage
            logger.info("No significant leverage detected, returning unleveraged returns")
            return unleveraged_returns

        leverage_ratio = leverage_info['leverage_ratio']

        # LEVERAGE ADJUSTMENT: Amplify returns by leverage ratio
        # If leverage = 2x, then 1% move becomes 2% portfolio move
        leveraged_returns = unleveraged_returns * leverage_ratio

        logger.info(f"Applied leverage adjustment: {leverage_ratio:.2f}x leverage")
        logger.info(f"Unleveraged avg return: {unleveraged_returns.mean()*100:.2f}% -> "
                   f"Leveraged avg return: {leveraged_returns.mean()*100:.2f}%")

        return leveraged_returns

    except Exception as e:
        logger.error(f"Error calculating portfolio returns: {e}", exc_info=True)
        return None


def calculate_cumulative_returns(returns: pd.Series) -> Optional[pd.Series]:
    """
    Calculate cumulative returns from return series

    Args:
        returns: Series of period returns

    Returns:
        Series of cumulative returns or None
    """
    if not validate_returns_series(returns):
        logger.error("Invalid returns series for cumulative calculation")
        return None

    try:
        # Cumulative return = (1 + r1) * (1 + r2) * ... - 1
        cumulative = (1 + returns).cumprod() - 1
        return cumulative

    except Exception as e:
        logger.error(f"Error calculating cumulative returns: {e}", exc_info=True)
        return None


def calculate_drawdown(cumulative_returns: pd.Series) -> Optional[pd.Series]:
    """
    Calculate drawdown series from cumulative returns

    Drawdown = (Current Value - Peak Value) / Peak Value

    Args:
        cumulative_returns: Series of cumulative returns

    Returns:
        Series of drawdowns (negative values) or None
    """
    if not is_valid_series(cumulative_returns):
        logger.error("Invalid cumulative returns for drawdown calculation")
        return None

    try:
        # Convert cumulative returns to wealth index
        wealth_index = 1 + cumulative_returns

        # Calculate running maximum (peak)
        running_max = wealth_index.expanding().max()

        # Drawdown = (current - peak) / peak
        drawdown = (wealth_index - running_max) / running_max

        return drawdown

    except Exception as e:
        logger.error(f"Error calculating drawdown: {e}", exc_info=True)
        return None


def calculate_max_drawdown(cumulative_returns: pd.Series) -> Optional[float]:
    """
    Calculate maximum drawdown from cumulative returns

    Args:
        cumulative_returns: Series of cumulative returns

    Returns:
        Maximum drawdown (negative value) or None
    """
    drawdown = calculate_drawdown(cumulative_returns)

    if drawdown is None or not is_valid_series(drawdown):
        return None

    try:
        max_dd = drawdown.min()  # Most negative value
        return max_dd

    except Exception as e:
        logger.error(f"Error calculating max drawdown: {e}", exc_info=True)
        return None


def calculate_portfolio_statistics(returns: pd.Series,
                                   periods_per_year: int = 252) -> Dict:
    """
    Calculate comprehensive portfolio statistics

    Args:
        returns: Series of returns
        periods_per_year: Annualization factor (252 for daily, 12 for monthly)

    Returns:
        Dict with portfolio statistics
    """
    if not validate_returns_series(returns):
        logger.error("Invalid returns for statistics calculation")
        return {
            'total_return': 0,
            'annualized_return': 0,
            'volatility': 0,
            'skewness': 0,
            'kurtosis': 0,
            'positive_periods': 0,
            'negative_periods': 0,
            'win_rate': 0,
            'best_period': 0,
            'worst_period': 0
        }

    try:
        cumulative = calculate_cumulative_returns(returns)

        # Total return
        total_return = cumulative.iloc[-1] if is_valid_series(cumulative) else 0

        # Annualized return (CAGR)
        n_periods = len(returns)
        years = n_periods / periods_per_year
        annualized_return = ((1 + total_return) ** (1 / years) - 1) if years > 0 else 0

        # Volatility (annualized standard deviation)
        volatility = returns.std() * np.sqrt(periods_per_year)

        # Higher moments
        skewness = returns.skew()
        kurtosis = returns.kurtosis()

        # Win/Loss analysis
        positive_periods = (returns > 0).sum()
        negative_periods = (returns < 0).sum()
        win_rate = positive_periods / len(returns) if len(returns) > 0 else 0

        # Best/Worst periods
        best_period = returns.max()
        worst_period = returns.min()

        # Average win/loss
        avg_win = returns[returns > 0].mean() if positive_periods > 0 else 0
        avg_loss = returns[returns < 0].mean() if negative_periods > 0 else 0

        stats = {
            'total_return': total_return,
            'annualized_return': annualized_return,
            'volatility': volatility,
            'skewness': skewness,
            'kurtosis': kurtosis,
            'positive_periods': int(positive_periods),
            'negative_periods': int(negative_periods),
            'win_rate': win_rate,
            'best_period': best_period,
            'worst_period': worst_period,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'n_periods': n_periods,
            'years': years
        }

        logger.info(f"Portfolio statistics calculated: "
                   f"Return={annualized_return*100:.2f}%, Vol={volatility*100:.2f}%")

        return stats

    except Exception as e:
        logger.error(f"Error calculating portfolio statistics: {e}", exc_info=True)
        return {}


def get_position_contributions(portfolio_df: pd.DataFrame,
                               period_days: int = 30) -> Optional[pd.DataFrame]:
    """
    Calculate how much each position contributes to overall portfolio return

    Args:
        portfolio_df: DataFrame with holdings (Ticker, Quantity, Current Price, Cost Basis)
        period_days: Period for return calculation

    Returns:
        DataFrame with position contribution analysis or None
    """
    if not is_valid_dataframe(portfolio_df):
        logger.error("Invalid portfolio data for contribution analysis")
        return None

    try:
        # Required columns
        required_cols = ['Ticker', 'Total Value', 'Gain/Loss $']
        missing_cols = [col for col in required_cols if col not in portfolio_df.columns]

        if missing_cols:
            logger.warning(f"Missing columns for contribution analysis: {missing_cols}")
            # Try alternative column names
            if 'Total Gain/Loss $' in portfolio_df.columns:
                portfolio_df['Gain/Loss $'] = portfolio_df['Total Gain/Loss $']
            else:
                return None

        # Calculate total portfolio P&L
        total_pnl = portfolio_df['Gain/Loss $'].sum()

        if total_pnl == 0:
            logger.warning("Total P&L is zero, cannot calculate contributions")
            return None

        # Calculate each position's contribution to total return
        contributions = portfolio_df.copy()
        contributions['Contribution %'] = (contributions['Gain/Loss $'] / abs(total_pnl)) * 100

        # Sort by contribution magnitude
        contributions['Abs_Contribution'] = contributions['Contribution %'].abs()
        contributions = contributions.sort_values('Abs_Contribution', ascending=False)

        # Select relevant columns
        output_cols = ['Ticker', 'Total Value', 'Gain/Loss $', 'Gain/Loss %', 'Contribution %']
        available_cols = [col for col in output_cols if col in contributions.columns]

        result = contributions[available_cols].copy()

        logger.info(f"Calculated contribution analysis for {len(result)} positions")

        return result

    except Exception as e:
        logger.error(f"Error calculating position contributions: {e}", exc_info=True)
        return None


def calculate_rolling_returns(returns: pd.Series,
                              window: int = 30) -> Optional[pd.Series]:
    """
    Calculate rolling returns over specified window

    Args:
        returns: Series of returns
        window: Rolling window size

    Returns:
        Series of rolling returns or None
    """
    if not validate_returns_series(returns, min_observations=window):
        logger.error(f"Insufficient data for rolling returns (need {window} periods)")
        return None

    try:
        # Rolling cumulative return
        rolling_ret = (1 + returns).rolling(window=window).apply(lambda x: x.prod() - 1, raw=True)
        return rolling_ret

    except Exception as e:
        logger.error(f"Error calculating rolling returns: {e}", exc_info=True)
        return None


def calculate_rolling_volatility(returns: pd.Series,
                                 window: int = 30,
                                 periods_per_year: int = 252) -> Optional[pd.Series]:
    """
    Calculate rolling annualized volatility

    Args:
        returns: Series of returns
        window: Rolling window size
        periods_per_year: Annualization factor

    Returns:
        Series of rolling volatility or None
    """
    if not validate_returns_series(returns, min_observations=window):
        logger.error(f"Insufficient data for rolling volatility (need {window} periods)")
        return None

    try:
        rolling_vol = returns.rolling(window=window).std() * np.sqrt(periods_per_year)
        return rolling_vol

    except Exception as e:
        logger.error(f"Error calculating rolling volatility: {e}", exc_info=True)
        return None


def calculate_beta(portfolio_returns: pd.Series,
                  benchmark_returns: pd.Series) -> Optional[float]:
    """
    Calculate portfolio beta relative to benchmark

    Beta = Covariance(Portfolio, Benchmark) / Variance(Benchmark)

    Args:
        portfolio_returns: Portfolio return series
        benchmark_returns: Benchmark return series

    Returns:
        Portfolio beta or None
    """
    if not validate_returns_series(portfolio_returns) or not validate_returns_series(benchmark_returns):
        logger.error("Invalid returns for beta calculation")
        return None

    try:
        # Align the series
        aligned = pd.DataFrame({
            'portfolio': portfolio_returns,
            'benchmark': benchmark_returns
        }).dropna()

        if len(aligned) < 10:
            logger.warning("Insufficient overlapping data for beta calculation")
            return None

        # Calculate covariance and variance
        covariance = aligned['portfolio'].cov(aligned['benchmark'])
        benchmark_variance = aligned['benchmark'].var()

        if benchmark_variance == 0:
            logger.warning("Benchmark has zero variance")
            return None

        beta = covariance / benchmark_variance

        logger.info(f"Calculated portfolio beta: {beta:.2f}")
        return beta

    except Exception as e:
        logger.error(f"Error calculating beta: {e}", exc_info=True)
        return None


def calculate_alpha(portfolio_returns: pd.Series,
                   benchmark_returns: pd.Series,
                   risk_free_rate: float = 0.045,
                   periods_per_year: int = 252) -> Optional[float]:
    """
    Calculate Jensen's Alpha

    Alpha = Portfolio Return - (Risk Free + Beta * (Benchmark Return - Risk Free))

    Args:
        portfolio_returns: Portfolio return series
        benchmark_returns: Benchmark return series
        risk_free_rate: Annual risk-free rate
        periods_per_year: Annualization factor

    Returns:
        Annualized alpha or None
    """
    beta = calculate_beta(portfolio_returns, benchmark_returns)

    if beta is None:
        return None

    try:
        # Calculate annualized returns
        portfolio_annual = portfolio_returns.mean() * periods_per_year
        benchmark_annual = benchmark_returns.mean() * periods_per_year

        # Jensen's Alpha
        alpha = portfolio_annual - (risk_free_rate + beta * (benchmark_annual - risk_free_rate))

        logger.info(f"Calculated alpha: {alpha*100:.2f}%")
        return alpha

    except Exception as e:
        logger.error(f"Error calculating alpha: {e}", exc_info=True)
        return None
