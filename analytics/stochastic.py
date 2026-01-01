"""
Institutional-Grade Stochastic Portfolio Modeling
==================================================

Advanced Monte Carlo simulation with:
- Probability-weighted expected returns
- Correlation-aware multi-asset simulation
- Current vs Optimized portfolio comparison
- Quant probability distributions
"""

import numpy as np
import pandas as pd
from typing import Dict, Tuple, Optional, List
from scipy import stats
from dataclasses import dataclass


@dataclass
class MonteCarloResults:
    """Results from Monte Carlo simulation"""
    portfolio_paths: np.ndarray
    final_returns: np.ndarray
    metrics: Dict
    probabilities: Dict
    individual_paths: Optional[np.ndarray] = None


class StochasticEngine:
    """
    Basic Stochastic Engine for compatibility with existing Monte Carlo page

    Uses Geometric Brownian Motion with correlated asset movements
    """

    def __init__(self, tickers: List[str], returns_data: pd.DataFrame):
        """
        Initialize Stochastic Engine

        Args:
            tickers: List of ticker symbols
            returns_data: DataFrame of historical returns
        """
        self.tickers = tickers
        self.returns_data = returns_data
        self.mu = returns_data.mean().values
        self.cov = returns_data.cov().values

    def geometric_brownian_motion(
        self,
        S0: float,
        mu: float,
        sigma: float,
        T: int,
        dt: float,
        n_paths: int
    ) -> np.ndarray:
        """
        Generate price paths using Geometric Brownian Motion

        dS_t = μ * S_t * dt + σ * S_t * dW_t

        Args:
            S0: Initial price
            mu: Drift (expected return)
            sigma: Volatility
            T: Time horizon
            dt: Time step
            n_paths: Number of paths to simulate

        Returns:
            Array of simulated price paths
        """
        n_steps = int(T / dt)
        paths = np.zeros((n_paths, n_steps))
        paths[:, 0] = S0

        for t in range(1, n_steps):
            Z = np.random.standard_normal(n_paths)
            paths[:, t] = paths[:, t-1] * np.exp(
                (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * Z
            )

        return paths

    def monte_carlo_simulation(
        self,
        weights: np.ndarray,
        S0_values: np.ndarray,
        n_scenarios: int = 10000,
        T: int = 252
    ) -> Tuple[np.ndarray, np.ndarray, Dict]:
        """
        Run full portfolio Monte Carlo simulation with correlated assets

        Args:
            weights: Portfolio weights
            S0_values: Initial asset prices
            n_scenarios: Number of scenarios to simulate
            T: Time horizon in days

        Returns:
            Tuple of (portfolio_paths, final_returns, metrics)
        """
        dt = 1 / 252  # Daily time step
        n_assets = len(self.tickers)
        n_steps = T

        # Generate correlated random numbers using Cholesky decomposition
        try:
            L = np.linalg.cholesky(self.cov)
        except np.linalg.LinAlgError:
            # If covariance matrix is not positive definite, add small regularization
            L = np.linalg.cholesky(self.cov + np.eye(n_assets) * 1e-8)

        # Initialize paths for each asset
        asset_paths = np.zeros((n_scenarios, n_steps, n_assets))

        for i in range(n_assets):
            asset_paths[:, 0, i] = S0_values[i]

        # Simulate correlated paths
        for t in range(1, n_steps):
            Z = np.random.standard_normal((n_scenarios, n_assets))
            Z_corr = Z @ L.T

            for i in range(n_assets):
                asset_paths[:, t, i] = asset_paths[:, t-1, i] * np.exp(
                    (self.mu[i] - 0.5 * self.cov[i, i]) * dt +
                    np.sqrt(self.cov[i, i] * dt) * Z_corr[:, i]
                )

        # Calculate portfolio values
        portfolio_paths = np.sum(asset_paths * weights, axis=2)

        # Calculate returns distribution
        final_returns = (portfolio_paths[:, -1] - portfolio_paths[:, 0]) / portfolio_paths[:, 0]

        # Calculate risk metrics
        var_95 = np.percentile(final_returns, 5)
        cvar_95 = final_returns[final_returns <= var_95].mean()
        expected_return = final_returns.mean()
        volatility = final_returns.std()

        metrics = {
            'VaR 95%': var_95,
            'CVaR 95%': cvar_95,
            'Expected Return': expected_return,
            'Volatility': volatility
        }

        return portfolio_paths, final_returns, metrics


class PortfolioMonteCarloEngine:
    """
    Institutional-Grade Portfolio Monte Carlo Simulation

    Features:
    - Probability-weighted expected returns (quant approach)
    - Multi-scenario analysis
    - Current vs Optimized portfolio comparison
    - Correlation-aware simulation
    - Risk metrics (VaR, CVaR, Sharpe, Sortino)
    - Probability distributions and confidence intervals
    """

    def __init__(
        self,
        returns: pd.DataFrame,
        current_weights: np.ndarray,
        tickers: List[str],
        initial_portfolio_value: float = 100000
    ):
        """
        Initialize Portfolio Monte Carlo Engine

        Args:
            returns: DataFrame of historical returns
            current_weights: Current portfolio weights
            tickers: List of ticker symbols
            initial_portfolio_value: Starting portfolio value
        """
        self.returns = returns
        self.current_weights = current_weights
        self.tickers = tickers
        self.initial_value = initial_portfolio_value

        # Calculate statistical parameters
        self.mean_returns = returns.mean().values * 252  # Annualized
        self.cov_matrix = returns.cov().values * 252  # Annualized
        self.corr_matrix = returns.corr().values

        # Calculate volatility for each asset
        self.volatilities = returns.std().values * np.sqrt(252)

    def calculate_probability_weighted_returns(
        self,
        lookback_periods: List[int] = [60, 120, 252]
    ) -> np.ndarray:
        """
        Calculate probability-weighted expected returns using quant logic

        Uses multiple lookback periods with probability weighting:
        - Recent performance (higher weight)
        - Medium-term trend (medium weight)
        - Long-term mean (lower weight)

        Incorporates momentum, volatility adjustment, and statistical confidence

        Args:
            lookback_periods: Lookback windows in days

        Returns:
            Probability-weighted expected returns (annualized)
        """
        n_assets = len(self.tickers)
        weighted_returns = np.zeros(n_assets)

        # Define probability weights for each period (sum to 1)
        period_weights = {
            60: 0.50,   # Recent: 50% weight (most predictive)
            120: 0.30,  # Medium-term: 30% weight
            252: 0.20   # Long-term: 20% weight
        }

        for i, ticker in enumerate(self.tickers):
            ticker_returns = self.returns[ticker]
            period_estimates = []

            for period in lookback_periods:
                # Get returns for this period
                period_data = ticker_returns.tail(period)

                if len(period_data) < period:
                    # Not enough data, use what we have
                    period_data = ticker_returns

                # Calculate multiple signals
                mean_return = period_data.mean() * 252

                # Momentum signal (recent trend)
                momentum = (period_data.tail(20).mean() / period_data.mean() - 1) * 252

                # Volatility adjustment (higher vol = discount expected return)
                vol = period_data.std() * np.sqrt(252)
                vol_adjustment = 1 - (vol / (vol + 0.20))  # Penalty for high volatility

                # Statistical confidence (based on t-statistic)
                t_stat = mean_return / (period_data.std() * np.sqrt(252) / np.sqrt(len(period_data)))
                confidence = min(abs(t_stat) / 2, 1.0)  # Cap at 1.0

                # Combine signals with quant logic
                adjusted_return = (
                    mean_return * 0.6 +           # Base return
                    momentum * 0.4                 # Momentum overlay
                ) * vol_adjustment * confidence   # Adjust for vol and confidence

                period_estimates.append(adjusted_return)

            # Combine period estimates with probability weights
            for j, period in enumerate(lookback_periods):
                weighted_returns[i] += period_estimates[j] * period_weights[period]

        return weighted_returns

    def simulate_portfolio(
        self,
        weights: np.ndarray,
        n_simulations: int = 10000,
        time_horizon_days: int = 252,
        use_probability_returns: bool = True,
        random_seed: Optional[int] = None
    ) -> MonteCarloResults:
        """
        Run Monte Carlo simulation for a portfolio

        Args:
            weights: Portfolio weights
            n_simulations: Number of simulation paths
            time_horizon_days: Simulation horizon in trading days
            use_probability_returns: Use probability-weighted returns instead of historical mean
            random_seed: Random seed for reproducibility

        Returns:
            MonteCarloResults object with all simulation outputs
        """
        if random_seed is not None:
            np.random.seed(random_seed)

        n_assets = len(self.tickers)
        n_steps = time_horizon_days
        dt = 1 / 252  # Daily time step

        # Choose return estimates
        if use_probability_returns:
            expected_returns = self.calculate_probability_weighted_returns()
        else:
            expected_returns = self.mean_returns

        # Generate correlated random numbers using Cholesky decomposition
        try:
            L = np.linalg.cholesky(self.cov_matrix)
        except np.linalg.LinAlgError:
            # Regularize if not positive definite
            L = np.linalg.cholesky(self.cov_matrix + np.eye(n_assets) * 1e-6)

        # Initialize asset paths
        asset_paths = np.zeros((n_simulations, n_steps + 1, n_assets))
        asset_paths[:, 0, :] = 1.0  # Start at normalized price of 1

        # Simulate correlated GBM paths for each asset
        for t in range(1, n_steps + 1):
            # Generate correlated random shocks
            Z = np.random.standard_normal((n_simulations, n_assets))
            Z_corr = Z @ L.T

            # Update each asset using GBM
            for i in range(n_assets):
                mu = expected_returns[i]
                sigma_sq = self.cov_matrix[i, i]

                asset_paths[:, t, i] = asset_paths[:, t-1, i] * np.exp(
                    (mu - 0.5 * sigma_sq) * dt +
                    np.sqrt(sigma_sq * dt) * Z_corr[:, i]
                )

        # Convert asset paths to dollar values based on initial portfolio weights
        initial_asset_values = self.initial_value * weights
        asset_dollar_paths = asset_paths * initial_asset_values

        # Calculate portfolio value at each time step
        portfolio_paths = asset_dollar_paths.sum(axis=2)

        # Calculate final returns
        final_returns = (portfolio_paths[:, -1] - self.initial_value) / self.initial_value

        # Calculate comprehensive metrics
        metrics = self._calculate_metrics(portfolio_paths, final_returns, weights, time_horizon_days)

        # Calculate probability distribution
        probabilities = self._calculate_probabilities(final_returns)

        return MonteCarloResults(
            portfolio_paths=portfolio_paths,
            final_returns=final_returns,
            metrics=metrics,
            probabilities=probabilities,
            individual_paths=asset_dollar_paths
        )

    def compare_portfolios(
        self,
        optimized_weights: np.ndarray,
        n_simulations: int = 10000,
        time_horizon_days: int = 252,
        random_seed: Optional[int] = None
    ) -> Dict:
        """
        Compare current portfolio vs optimized portfolio using Monte Carlo

        Args:
            optimized_weights: Optimized portfolio weights
            n_simulations: Number of simulation paths
            time_horizon_days: Simulation horizon
            random_seed: Random seed for reproducibility

        Returns:
            Dict with comparison results
        """
        # Run simulation for current portfolio
        current_results = self.simulate_portfolio(
            self.current_weights,
            n_simulations,
            time_horizon_days,
            use_probability_returns=True,
            random_seed=random_seed
        )

        # Run simulation for optimized portfolio (use same seed + 1 for fairness)
        optimized_results = self.simulate_portfolio(
            optimized_weights,
            n_simulations,
            time_horizon_days,
            use_probability_returns=True,
            random_seed=(random_seed + 1) if random_seed is not None else None
        )

        # Calculate improvement metrics
        improvement = {
            'expected_return_improvement': (
                optimized_results.metrics['expected_return'] -
                current_results.metrics['expected_return']
            ),
            'sharpe_improvement': (
                optimized_results.metrics['sharpe_ratio'] -
                current_results.metrics['sharpe_ratio']
            ),
            'sortino_improvement': (
                optimized_results.metrics['sortino_ratio'] -
                current_results.metrics['sortino_ratio']
            ),
            'var_95_improvement': (
                current_results.metrics['var_95_pct'] -
                optimized_results.metrics['var_95_pct']
            ),  # Positive = less downside risk
            'cvar_95_improvement': (
                current_results.metrics['cvar_95_pct'] -
                optimized_results.metrics['cvar_95_pct']
            ),
            'volatility_reduction': (
                current_results.metrics['volatility'] -
                optimized_results.metrics['volatility']
            )
        }

        return {
            'current': current_results,
            'optimized': optimized_results,
            'improvement': improvement
        }

    def _calculate_metrics(
        self,
        portfolio_paths: np.ndarray,
        final_returns: np.ndarray,
        weights: np.ndarray,
        time_horizon_days: int
    ) -> Dict:
        """Calculate comprehensive portfolio metrics"""

        # Basic return metrics
        expected_return = final_returns.mean()
        median_return = np.median(final_returns)
        volatility = final_returns.std()

        # Annualized metrics
        years = time_horizon_days / 252
        annual_return = (1 + expected_return) ** (1 / years) - 1
        annual_volatility = volatility / np.sqrt(years)

        # Risk metrics
        var_95 = np.percentile(final_returns, 5)
        var_99 = np.percentile(final_returns, 1)

        # CVaR (Expected Shortfall)
        cvar_95 = final_returns[final_returns <= var_95].mean()
        cvar_99 = final_returns[final_returns <= var_99].mean()

        # Downside deviation (for Sortino)
        downside_returns = final_returns[final_returns < 0]
        downside_deviation = downside_returns.std() if len(downside_returns) > 0 else volatility

        # Sharpe and Sortino ratios
        rf_rate = 0.02  # Risk-free rate
        rf_return_period = (1 + rf_rate) ** years - 1

        sharpe_ratio = (expected_return - rf_return_period) / volatility if volatility > 0 else 0
        sortino_ratio = (expected_return - rf_return_period) / downside_deviation if downside_deviation > 0 else 0

        # Percentiles
        percentiles = {
            'p5': np.percentile(final_returns, 5),
            'p25': np.percentile(final_returns, 25),
            'p50': np.percentile(final_returns, 50),
            'p75': np.percentile(final_returns, 75),
            'p95': np.percentile(final_returns, 95)
        }

        # Path statistics
        final_values = portfolio_paths[:, -1]

        return {
            'expected_return': expected_return,
            'median_return': median_return,
            'annual_return': annual_return,
            'volatility': volatility,
            'annual_volatility': annual_volatility,
            'sharpe_ratio': sharpe_ratio,
            'sortino_ratio': sortino_ratio,
            'var_95_pct': var_95,
            'var_99_pct': var_99,
            'cvar_95_pct': cvar_95,
            'cvar_99_pct': cvar_99,
            'downside_deviation': downside_deviation,
            'percentiles': percentiles,
            'mean_final_value': final_values.mean(),
            'median_final_value': np.median(final_values),
            'min_final_value': final_values.min(),
            'max_final_value': final_values.max()
        }

    def _calculate_probabilities(self, final_returns: np.ndarray) -> Dict:
        """Calculate probability of achieving various return targets"""

        targets = [-0.20, -0.10, 0.0, 0.05, 0.10, 0.15, 0.20, 0.30, 0.50]

        probabilities = {}

        for target in targets:
            prob_exceed = (final_returns >= target).sum() / len(final_returns)

            if target < 0:
                # For losses, show probability of AVOIDING this loss
                label = f"Avoid {target*100:.0f}% loss"
                probabilities[label] = prob_exceed * 100
            else:
                # For gains, show probability of ACHIEVING this gain
                label = f"Achieve {target*100:.0f}% gain"
                probabilities[label] = prob_exceed * 100

        # Probability of profit
        probabilities['Probability of Profit'] = (final_returns > 0).sum() / len(final_returns) * 100

        return probabilities


__all__ = ['StochasticEngine', 'PortfolioMonteCarloEngine', 'MonteCarloResults']
