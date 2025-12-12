"""
ATLAS Portfolio Optimizer
Implements Mean-Variance Optimization with leverage support
"""

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from typing import Dict, List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

# CRITICAL: Import config
try:
    from config import config
except:
    from ..config import config


class PortfolioOptimizer:
    """
    Mean-Variance Portfolio Optimizer with Leverage Support

    Features:
    - Sharpe ratio maximization
    - Minimum volatility
    - Maximum return with risk constraint
    - Leverage constraints (1x to 3x)
    - Position size limits (5% to 30%)
    - Correlation matrix eigenvalue correction
    """

    def __init__(
        self,
        returns: pd.DataFrame,
        risk_free_rate: float = None,
        leverage: float = None,
        min_weight: float = None,
        max_weight: float = None
    ):
        """
        Initialize optimizer

        Args:
            returns: DataFrame of asset returns (rows=dates, cols=tickers)
            risk_free_rate: Annual risk-free rate (default from config)
            leverage: Portfolio leverage (default from config)
            min_weight: Minimum position size (default from config)
            max_weight: Maximum position size (default from config)
        """
        self.returns = returns
        self.tickers = returns.columns.tolist()
        self.n_assets = len(self.tickers)

        # Load from config or use provided
        self.risk_free_rate = risk_free_rate if risk_free_rate is not None else config.RISK_FREE_RATE
        self.leverage = leverage if leverage is not None else config.DEFAULT_LEVERAGE
        self.min_weight = min_weight if min_weight is not None else config.MIN_WEIGHT
        self.max_weight = max_weight if max_weight is not None else config.MAX_WEIGHT

        # Calculate statistics
        self.mean_returns = returns.mean() * 252  # Annualized
        self.cov_matrix = self._calculate_covariance()

    def _calculate_covariance(self) -> np.ndarray:
        """
        Calculate covariance matrix with eigenvalue correction

        This fixes the correlation matrix bug from earlier versions.
        Ensures positive semi-definite matrix.
        """
        # Calculate raw covariance
        cov = self.returns.cov() * 252  # Annualized

        # Eigenvalue correction
        eigenvalues, eigenvectors = np.linalg.eigh(cov)
        eigenvalues = np.maximum(eigenvalues, 1e-8)  # Floor at small positive value
        cov_corrected = eigenvectors @ np.diag(eigenvalues) @ eigenvectors.T

        return cov_corrected

    def _portfolio_stats(self, weights: np.ndarray) -> Tuple[float, float, float]:
        """
        Calculate portfolio return, volatility, and Sharpe ratio

        Args:
            weights: Array of portfolio weights

        Returns:
            (return, volatility, sharpe_ratio)
        """
        portfolio_return = np.dot(weights, self.mean_returns)
        portfolio_vol = np.sqrt(np.dot(weights, np.dot(self.cov_matrix, weights)))
        sharpe_ratio = (portfolio_return - self.risk_free_rate) / portfolio_vol if portfolio_vol > 0 else 0

        return portfolio_return, portfolio_vol, sharpe_ratio

    def _negative_sharpe(self, weights: np.ndarray) -> float:
        """Objective function: Negative Sharpe ratio for minimization"""
        _, _, sharpe = self._portfolio_stats(weights)
        return -sharpe

    def _portfolio_volatility(self, weights: np.ndarray) -> float:
        """Objective function: Portfolio volatility for minimization"""
        _, vol, _ = self._portfolio_stats(weights)
        return vol

    def optimize_sharpe(self) -> Dict:
        """
        Optimize for maximum Sharpe ratio

        Returns:
            Dictionary with weights, stats, and metadata
        """
        # Constraints
        constraints = [
            {'type': 'eq', 'fun': lambda w: np.sum(w) - self.leverage}  # Leverage constraint
        ]

        # Bounds for each weight
        bounds = tuple((self.min_weight, self.max_weight) for _ in range(self.n_assets))

        # Initial guess (equal weight)
        x0 = np.array([self.leverage / self.n_assets] * self.n_assets)

        # Optimize
        result = minimize(
            self._negative_sharpe,
            x0,
            method='SLSQP',
            bounds=bounds,
            constraints=constraints,
            options={'maxiter': 1000, 'ftol': 1e-9}
        )

        if not result.success:
            raise ValueError(f"Optimization failed: {result.message}")

        weights = result.x
        port_return, port_vol, sharpe = self._portfolio_stats(weights)

        return {
            'weights': dict(zip(self.tickers, weights)),
            'return': port_return,
            'volatility': port_vol,
            'sharpe_ratio': sharpe,
            'leverage': np.sum(weights),
            'success': result.success,
            'method': 'max_sharpe'
        }

    def optimize_min_volatility(self) -> Dict:
        """
        Optimize for minimum volatility

        Returns:
            Dictionary with weights, stats, and metadata
        """
        constraints = [
            {'type': 'eq', 'fun': lambda w: np.sum(w) - self.leverage}
        ]

        bounds = tuple((self.min_weight, self.max_weight) for _ in range(self.n_assets))
        x0 = np.array([self.leverage / self.n_assets] * self.n_assets)

        result = minimize(
            self._portfolio_volatility,
            x0,
            method='SLSQP',
            bounds=bounds,
            constraints=constraints,
            options={'maxiter': 1000, 'ftol': 1e-9}
        )

        if not result.success:
            raise ValueError(f"Optimization failed: {result.message}")

        weights = result.x
        port_return, port_vol, sharpe = self._portfolio_stats(weights)

        return {
            'weights': dict(zip(self.tickers, weights)),
            'return': port_return,
            'volatility': port_vol,
            'sharpe_ratio': sharpe,
            'leverage': np.sum(weights),
            'success': result.success,
            'method': 'min_volatility'
        }

    def efficient_frontier(self, n_points: int = 50) -> pd.DataFrame:
        """
        Generate efficient frontier

        Args:
            n_points: Number of points on the frontier

        Returns:
            DataFrame with return, volatility, and weights for each point
        """
        # Min and max returns
        min_ret = self.mean_returns.min() * self.leverage
        max_ret = self.mean_returns.max() * self.leverage

        target_returns = np.linspace(min_ret, max_ret, n_points)
        frontier_data = []

        for target in target_returns:
            try:
                constraints = [
                    {'type': 'eq', 'fun': lambda w: np.sum(w) - self.leverage},
                    {'type': 'eq', 'fun': lambda w: np.dot(w, self.mean_returns) - target}
                ]

                bounds = tuple((self.min_weight, self.max_weight) for _ in range(self.n_assets))
                x0 = np.array([self.leverage / self.n_assets] * self.n_assets)

                result = minimize(
                    self._portfolio_volatility,
                    x0,
                    method='SLSQP',
                    bounds=bounds,
                    constraints=constraints,
                    options={'maxiter': 1000}
                )

                if result.success:
                    weights = result.x
                    port_return, port_vol, sharpe = self._portfolio_stats(weights)

                    frontier_data.append({
                        'return': port_return,
                        'volatility': port_vol,
                        'sharpe_ratio': sharpe,
                        **dict(zip(self.tickers, weights))
                    })
            except:
                continue

        return pd.DataFrame(frontier_data)


# Export main class
__all__ = ['PortfolioOptimizer']
