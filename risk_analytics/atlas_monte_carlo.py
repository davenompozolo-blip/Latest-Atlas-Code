"""
ATLAS Monte Carlo Simulation Engine
Portfolio risk scenarios and probability distributions
"""

import numpy as np
import pandas as pd
from typing import Dict, Tuple, Optional
from scipy import stats


class MonteCarloSimulation:
    """
    Monte Carlo Portfolio Simulation

    Features:
    - Portfolio return distribution
    - Risk scenarios (VaR, CVaR)
    - Probability of outcomes
    - Path simulation
    """

    def __init__(
        self,
        returns: pd.DataFrame,
        weights: np.ndarray,
        initial_value: float = 100000
    ):
        """
        Initialize Monte Carlo engine

        Args:
            returns: DataFrame of asset returns
            weights: Portfolio weights
            initial_value: Starting portfolio value
        """
        self.returns = returns
        self.weights = weights
        self.initial_value = initial_value

        self.mean_returns = returns.mean()
        self.cov_matrix = returns.cov()

        self.portfolio_return = np.dot(weights, self.mean_returns)
        self.portfolio_vol = np.sqrt(np.dot(weights, np.dot(self.cov_matrix, weights)))

    def simulate_paths(
        self,
        n_simulations: int = 10000,
        n_days: int = 252,
        random_seed: Optional[int] = None
    ) -> np.ndarray:
        """
        Simulate portfolio value paths

        Args:
            n_simulations: Number of simulation paths
            n_days: Number of days to simulate
            random_seed: Random seed for reproducibility

        Returns:
            Array of portfolio values
        """
        if random_seed:
            np.random.seed(random_seed)

        dt = 1/252

        random_returns = np.random.multivariate_normal(
            self.mean_returns * dt,
            self.cov_matrix * dt,
            size=(n_simulations, n_days)
        )

        portfolio_returns = np.dot(random_returns, self.weights)

        cumulative_returns = np.cumprod(1 + portfolio_returns, axis=1)

        portfolio_values = self.initial_value * cumulative_returns

        return portfolio_values

    def calculate_var_cvar(
        self,
        n_simulations: int = 10000,
        n_days: int = 252,
        confidence_level: float = 0.95
    ) -> Dict:
        """
        Calculate Value at Risk and Conditional VaR

        Args:
            n_simulations: Number of simulations
            n_days: Simulation horizon
            confidence_level: Confidence level

        Returns:
            Dict with VaR and CVaR metrics
        """
        portfolio_values = self.simulate_paths(n_simulations, n_days)

        final_values = portfolio_values[:, -1]

        final_returns = (final_values - self.initial_value) / self.initial_value

        var_percentile = 1 - confidence_level
        var = np.percentile(final_returns, var_percentile * 100)

        losses_beyond_var = final_returns[final_returns <= var]
        cvar = losses_beyond_var.mean() if len(losses_beyond_var) > 0 else var

        var_dollar = var * self.initial_value
        cvar_dollar = cvar * self.initial_value

        return {
            'var_pct': var * 100,
            'cvar_pct': cvar * 100,
            'var_dollar': var_dollar,
            'cvar_dollar': cvar_dollar,
            'confidence_level': confidence_level,
            'final_values': final_values,
            'final_returns': final_returns
        }

    def calculate_probabilities(
        self,
        target_returns: list,
        n_simulations: int = 10000,
        n_days: int = 252
    ) -> Dict:
        """
        Calculate probability of achieving target returns

        Args:
            target_returns: List of target return percentages
            n_simulations: Number of simulations
            n_days: Simulation horizon

        Returns:
            Dict with probabilities
        """
        portfolio_values = self.simulate_paths(n_simulations, n_days)
        final_values = portfolio_values[:, -1]
        final_returns = (final_values - self.initial_value) / self.initial_value

        probabilities = {}
        for target in target_returns:
            target_decimal = target / 100
            prob = (final_returns >= target_decimal).sum() / n_simulations
            probabilities[f"{target}%"] = prob * 100

        return probabilities

    def get_statistics(
        self,
        n_simulations: int = 10000,
        n_days: int = 252
    ) -> Dict:
        """
        Calculate comprehensive simulation statistics

        Args:
            n_simulations: Number of simulations
            n_days: Simulation horizon

        Returns:
            Dict with statistical measures
        """
        portfolio_values = self.simulate_paths(n_simulations, n_days)
        final_values = portfolio_values[:, -1]
        final_returns = (final_values - self.initial_value) / self.initial_value

        stats_dict = {
            'mean_final_value': final_values.mean(),
            'median_final_value': np.median(final_values),
            'std_final_value': final_values.std(),
            'mean_return_pct': final_returns.mean() * 100,
            'median_return_pct': np.median(final_returns) * 100,
            'std_return_pct': final_returns.std() * 100,
            'min_value': final_values.min(),
            'max_value': final_values.max(),
            'percentile_5': np.percentile(final_values, 5),
            'percentile_95': np.percentile(final_values, 95)
        }

        return stats_dict


__all__ = ['MonteCarloSimulation']
