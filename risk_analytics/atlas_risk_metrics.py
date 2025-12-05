"""
ATLAS Advanced Risk Metrics
Comprehensive risk analysis tools
"""

import numpy as np
import pandas as pd
from typing import Dict, Optional


class RiskAnalytics:
    """
    Advanced Risk Metrics Calculator

    Metrics:
    - Maximum Drawdown
    - Sharpe Ratio
    - Sortino Ratio
    - Calmar Ratio
    - Information Ratio
    - Beta, Alpha
    """

    def __init__(self, returns: pd.Series, benchmark_returns: Optional[pd.Series] = None):
        """
        Initialize risk analytics

        Args:
            returns: Portfolio returns series
            benchmark_returns: Benchmark returns (optional)
        """
        self.returns = returns
        self.benchmark_returns = benchmark_returns

    def maximum_drawdown(self) -> Dict:
        """Calculate maximum drawdown"""
        cumulative = (1 + self.returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = (cumulative - running_max) / running_max

        max_dd = drawdown.min()
        max_dd_date = drawdown.idxmin()

        peak_date = cumulative[:max_dd_date].idxmax()

        recovery_dates = cumulative[cumulative >= running_max[peak_date]]
        recovery_date = recovery_dates.index[0] if len(recovery_dates) > 0 else None

        return {
            'max_drawdown': max_dd * 100,
            'peak_date': peak_date,
            'trough_date': max_dd_date,
            'recovery_date': recovery_date,
            'drawdown_series': drawdown
        }

    def sharpe_ratio(self, risk_free_rate: float = 0.03) -> float:
        """Calculate annualized Sharpe ratio"""
        excess_returns = self.returns - (risk_free_rate / 252)
        return np.sqrt(252) * excess_returns.mean() / excess_returns.std()

    def sortino_ratio(self, risk_free_rate: float = 0.03) -> float:
        """Calculate Sortino ratio"""
        excess_returns = self.returns - (risk_free_rate / 252)
        downside_returns = excess_returns[excess_returns < 0]
        downside_std = downside_returns.std()

        if downside_std == 0:
            return np.inf

        return np.sqrt(252) * excess_returns.mean() / downside_std

    def calmar_ratio(self) -> float:
        """Calculate Calmar ratio"""
        annual_return = self.returns.mean() * 252
        max_dd = self.maximum_drawdown()['max_drawdown'] / 100

        if max_dd == 0:
            return np.inf

        return annual_return / abs(max_dd)

    def beta(self) -> float:
        """Calculate portfolio beta"""
        if self.benchmark_returns is None:
            raise ValueError("Benchmark returns required")

        covariance = np.cov(self.returns, self.benchmark_returns)[0, 1]
        benchmark_variance = self.benchmark_returns.var()

        return covariance / benchmark_variance

    def alpha(self, risk_free_rate: float = 0.03) -> float:
        """Calculate Jensen's alpha"""
        if self.benchmark_returns is None:
            raise ValueError("Benchmark returns required")

        portfolio_return = self.returns.mean() * 252
        benchmark_return = self.benchmark_returns.mean() * 252
        beta = self.beta()

        alpha = portfolio_return - (risk_free_rate + beta * (benchmark_return - risk_free_rate))

        return alpha

    def information_ratio(self) -> float:
        """Calculate information ratio"""
        if self.benchmark_returns is None:
            raise ValueError("Benchmark returns required")

        active_returns = self.returns - self.benchmark_returns
        tracking_error = active_returns.std() * np.sqrt(252)

        if tracking_error == 0:
            return np.inf

        return (active_returns.mean() * 252) / tracking_error

    def comprehensive_metrics(self, risk_free_rate: float = 0.03) -> Dict:
        """Calculate all risk metrics"""
        metrics = {
            'sharpe_ratio': self.sharpe_ratio(risk_free_rate),
            'sortino_ratio': self.sortino_ratio(risk_free_rate),
            'calmar_ratio': self.calmar_ratio(),
            'max_drawdown': self.maximum_drawdown()['max_drawdown'],
            'annual_return': self.returns.mean() * 252 * 100,
            'annual_volatility': self.returns.std() * np.sqrt(252) * 100
        }

        if self.benchmark_returns is not None:
            metrics['beta'] = self.beta()
            metrics['alpha'] = self.alpha(risk_free_rate) * 100
            metrics['information_ratio'] = self.information_ratio()

        return metrics


__all__ = ['RiskAnalytics']
