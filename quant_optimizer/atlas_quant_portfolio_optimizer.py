"""
ATLAS TERMINAL v10.0 - QUANT-GRADE PORTFOLIO OPTIMIZER
=======================================================

Advanced portfolio optimization using:
- Stochastic Calculus (Geometric Brownian Motion)
- Multivariable Calculus (Partial Derivatives)
- Monte Carlo Simulation (10,000+ scenarios)
- Constrained Optimization (Lagrange Multipliers)

This is institutional-grade quant shit! 🔥
"""

import numpy as np
import pandas as pd
from scipy.optimize import minimize, LinearConstraint, NonlinearConstraint
from scipy.stats import norm, t
import matplotlib.pyplot as plt
import seaborn as sns
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import warnings
warnings.filterwarnings('ignore')


# ===================================================================
# DATA STRUCTURES
# ===================================================================

@dataclass
class OptimizationResult:
    """Results from portfolio optimization"""
    weights: np.ndarray
    expected_return: float
    volatility: float
    sharpe_ratio: float
    var_95: float
    cvar_95: float
    max_drawdown: float
    asset_names: List[str]
    convergence_path: List[np.ndarray]
    gradient_history: List[np.ndarray]


@dataclass
class PortfolioConstraints:
    """Constraints for portfolio optimization"""
    min_weight: float = 0.0  # Minimum weight per asset
    max_weight: float = 1.0  # Maximum weight per asset
    target_return: Optional[float] = None  # Target return (if specified)
    max_leverage: float = 1.0  # Maximum leverage (1.0 = no leverage, 2.0 = 2x)
    sector_limits: Optional[Dict[str, float]] = None  # Sector concentration limits
    long_only: bool = True  # Allow shorting or not


# ===================================================================
# STOCHASTIC PRICE SIMULATOR
# ===================================================================

class StochasticPriceSimulator:
    """
    Simulates asset prices using Geometric Brownian Motion (GBM).

    dS_t = μ * S_t * dt + σ * S_t * dW_t

    Where:
    - S_t = asset price at time t
    - μ = drift (expected return)
    - σ = volatility
    - dW_t = Wiener process (Brownian motion)
    """

    def __init__(self, returns: pd.DataFrame, risk_free_rate: float = 0.03):
        """
        Args:
            returns: DataFrame of historical returns (assets as columns)
            risk_free_rate: Annual risk-free rate
        """
        self.returns = returns
        self.risk_free_rate = risk_free_rate

        # Calculate statistics
        self.mean_returns = returns.mean() * 252  # Annualized
        self.cov_matrix = returns.cov() * 252  # Annualized
        self.volatilities = np.sqrt(np.diag(self.cov_matrix))
        self.correlation_matrix = returns.corr()

        # Generate correlated random numbers using Cholesky decomposition
        self.cholesky = np.linalg.cholesky(self.cov_matrix)

    def simulate_paths(self,
                      n_simulations: int = 10000,
                      n_days: int = 252,
                      initial_prices: Optional[np.ndarray] = None) -> np.ndarray:
        """
        Simulate price paths using correlated GBM.

        Returns:
            Array of shape (n_simulations, n_days, n_assets)
        """
        n_assets = len(self.mean_returns)

        if initial_prices is None:
            initial_prices = np.ones(n_assets) * 100  # Start at $100

        # Initialize price paths
        paths = np.zeros((n_simulations, n_days, n_assets))
        paths[:, 0, :] = initial_prices

        # Time step
        dt = 1/252  # Daily steps

        for sim in range(n_simulations):
            for day in range(1, n_days):
                # Generate correlated random shocks
                uncorrelated_shocks = np.random.standard_normal(n_assets)
                correlated_shocks = self.cholesky @ uncorrelated_shocks

                # Apply GBM
                drift = (self.mean_returns.values - 0.5 * self.volatilities**2) * dt
                diffusion = correlated_shocks * np.sqrt(dt)

                paths[sim, day, :] = paths[sim, day-1, :] * np.exp(drift + diffusion)

        return paths

    def calculate_portfolio_paths(self, weights: np.ndarray,
                                 n_simulations: int = 10000,
                                 n_days: int = 252) -> np.ndarray:
        """
        Calculate portfolio value paths given weights.

        Returns:
            Array of shape (n_simulations, n_days)
        """
        price_paths = self.simulate_paths(n_simulations, n_days)

        # Calculate portfolio values
        portfolio_paths = np.zeros((n_simulations, n_days))

        for sim in range(n_simulations):
            # Portfolio value = sum(weight_i * price_i)
            portfolio_paths[sim, :] = price_paths[sim, :, :] @ weights

        return portfolio_paths


# ===================================================================
# MULTIVARIABLE CALCULUS OPTIMIZER
# ===================================================================

class MultivariablePortfolioOptimizer:
    """
    Portfolio optimizer using multivariable calculus.

    Uses gradient descent with partial derivatives:
    ∂Sharpe/∂w_i for each asset weight

    Objective: maximize Sharpe Ratio = (r_p - r_f) / σ_p
    """

    def __init__(self, returns: pd.DataFrame, risk_free_rate: float = 0.03):
        """
        Args:
            returns: DataFrame of historical returns
            risk_free_rate: Annual risk-free rate
        """
        self.returns = returns
        self.risk_free_rate = risk_free_rate
        self.n_assets = len(returns.columns)
        self.asset_names = list(returns.columns)

        # Calculate statistics
        self.mean_returns = returns.mean() * 252  # Annualized
        self.cov_matrix = returns.cov() * 252  # Annualized

        # For tracking optimization
        self.convergence_path = []
        self.gradient_history = []

    def portfolio_statistics(self, weights: np.ndarray) -> Tuple[float, float, float]:
        """
        Calculate portfolio return, volatility, and Sharpe ratio.

        Returns:
            (expected_return, volatility, sharpe_ratio)
        """
        # Expected return: r_p = Σ(w_i * r_i)
        portfolio_return = np.sum(weights * self.mean_returns.values)

        # Volatility: σ_p = sqrt(w^T * Σ * w)
        portfolio_variance = weights.T @ self.cov_matrix.values @ weights
        portfolio_volatility = np.sqrt(portfolio_variance)

        # Sharpe ratio: (r_p - r_f) / σ_p
        sharpe_ratio = (portfolio_return - self.risk_free_rate) / portfolio_volatility

        return portfolio_return, portfolio_volatility, sharpe_ratio

    def sharpe_gradient(self, weights: np.ndarray) -> np.ndarray:
        """
        Calculate gradient of Sharpe ratio with respect to weights.

        ∂Sharpe/∂w_i = (1/σ_p) * [∂r_p/∂w_i - Sharpe * ∂σ_p/∂w_i]

        Where:
        - ∂r_p/∂w_i = r_i (mean return of asset i)
        - ∂σ_p/∂w_i = (Σ * w)_i / σ_p (via chain rule)
        """
        portfolio_return, portfolio_volatility, sharpe_ratio = self.portfolio_statistics(weights)

        # Gradient of return
        dr_dw = self.mean_returns.values

        # Gradient of volatility
        cov_w = self.cov_matrix.values @ weights
        dsigma_dw = cov_w / portfolio_volatility

        # Gradient of Sharpe ratio
        dsharpe_dw = (dr_dw - sharpe_ratio * dsigma_dw) / portfolio_volatility

        return dsharpe_dw

    def negative_sharpe(self, weights: np.ndarray) -> float:
        """
        Negative Sharpe ratio (for minimization).
        """
        _, _, sharpe = self.portfolio_statistics(weights)
        return -sharpe

    def negative_sharpe_gradient(self, weights: np.ndarray) -> np.ndarray:
        """
        Gradient of negative Sharpe ratio.
        """
        return -self.sharpe_gradient(weights)

    def optimize_sharpe(self, constraints: PortfolioConstraints) -> OptimizationResult:
        """
        Optimize portfolio to maximize Sharpe ratio.

        Uses scipy.optimize.minimize with analytical gradient.
        """
        # Initial guess: equal weights
        w0 = np.ones(self.n_assets) / self.n_assets

        # Constraints
        cons = []

        # Sum of weights = max_leverage
        cons.append({
            'type': 'eq',
            'fun': lambda w: np.sum(w) - constraints.max_leverage
        })

        # Bounds for each weight
        if constraints.long_only:
            bounds = [(constraints.min_weight, constraints.max_weight) for _ in range(self.n_assets)]
        else:
            bounds = [(-1, 1) for _ in range(self.n_assets)]  # Allow shorting

        # Target return constraint (if specified)
        if constraints.target_return is not None:
            cons.append({
                'type': 'eq',
                'fun': lambda w: np.sum(w * self.mean_returns.values) - constraints.target_return
            })

        # Reset tracking
        self.convergence_path = []
        self.gradient_history = []

        def callback(xk):
            """Track convergence"""
            self.convergence_path.append(xk.copy())
            grad = self.sharpe_gradient(xk)
            self.gradient_history.append(grad.copy())

        # Optimize
        result = minimize(
            fun=self.negative_sharpe,
            x0=w0,
            method='SLSQP',
            jac=self.negative_sharpe_gradient,
            bounds=bounds,
            constraints=cons,
            callback=callback,
            options={'maxiter': 1000, 'ftol': 1e-9}
        )

        # Get final statistics
        optimal_weights = result.x
        exp_return, volatility, sharpe = self.portfolio_statistics(optimal_weights)

        # Calculate risk metrics
        var_95, cvar_95, max_dd = self._calculate_risk_metrics(optimal_weights)

        return OptimizationResult(
            weights=optimal_weights,
            expected_return=exp_return,
            volatility=volatility,
            sharpe_ratio=sharpe,
            var_95=var_95,
            cvar_95=cvar_95,
            max_drawdown=max_dd,
            asset_names=self.asset_names,
            convergence_path=self.convergence_path,
            gradient_history=self.gradient_history
        )

    def optimize_minimum_volatility(self, constraints: PortfolioConstraints) -> OptimizationResult:
        """
        Optimize portfolio to minimize volatility.
        """
        # Objective: minimize σ_p = sqrt(w^T * Σ * w)
        def volatility(w):
            return np.sqrt(w.T @ self.cov_matrix.values @ w)

        def volatility_gradient(w):
            cov_w = self.cov_matrix.values @ w
            vol = volatility(w)
            return cov_w / vol

        # Initial guess
        w0 = np.ones(self.n_assets) / self.n_assets

        # Constraints
        cons = [{'type': 'eq', 'fun': lambda w: np.sum(w) - constraints.max_leverage}]

        # Bounds
        if constraints.long_only:
            bounds = [(constraints.min_weight, constraints.max_weight) for _ in range(self.n_assets)]
        else:
            bounds = [(-1, 1) for _ in range(self.n_assets)]

        # Optimize
        result = minimize(
            fun=volatility,
            x0=w0,
            method='SLSQP',
            jac=volatility_gradient,
            bounds=bounds,
            constraints=cons,
            options={'maxiter': 1000}
        )

        optimal_weights = result.x
        exp_return, vol, sharpe = self.portfolio_statistics(optimal_weights)
        var_95, cvar_95, max_dd = self._calculate_risk_metrics(optimal_weights)

        return OptimizationResult(
            weights=optimal_weights,
            expected_return=exp_return,
            volatility=vol,
            sharpe_ratio=sharpe,
            var_95=var_95,
            cvar_95=cvar_95,
            max_drawdown=max_dd,
            asset_names=self.asset_names,
            convergence_path=[],
            gradient_history=[]
        )

    def _calculate_risk_metrics(self, weights: np.ndarray,
                               n_simulations: int = 10000) -> Tuple[float, float, float]:
        """
        Calculate VaR, CVaR, and Maximum Drawdown using Monte Carlo.
        """
        # Simulate portfolio returns
        simulator = StochasticPriceSimulator(self.returns, self.risk_free_rate)
        portfolio_paths = simulator.calculate_portfolio_paths(weights, n_simulations, 252)

        # Calculate returns
        returns = (portfolio_paths[:, -1] - portfolio_paths[:, 0]) / portfolio_paths[:, 0]

        # VaR (5th percentile)
        var_95 = np.percentile(returns, 5)

        # CVaR (average of returns below VaR)
        cvar_95 = returns[returns <= var_95].mean()

        # Maximum Drawdown
        max_drawdowns = []
        for path in portfolio_paths:
            cummax = np.maximum.accumulate(path)
            drawdown = (path - cummax) / cummax
            max_drawdowns.append(drawdown.min())

        max_dd = np.mean(max_drawdowns)

        return var_95, cvar_95, max_dd

    def efficient_frontier(self,
                          n_portfolios: int = 100,
                          constraints: PortfolioConstraints = PortfolioConstraints()) -> pd.DataFrame:
        """
        Calculate efficient frontier points.

        Returns:
            DataFrame with columns: return, volatility, sharpe, weights
        """
        # Get min/max return
        min_return = self.mean_returns.min()
        max_return = self.mean_returns.max()

        target_returns = np.linspace(min_return, max_return, n_portfolios)

        results = []

        for target_return in target_returns:
            # Create constraint for this target return
            target_constraints = PortfolioConstraints(
                min_weight=constraints.min_weight,
                max_weight=constraints.max_weight,
                target_return=target_return,
                max_leverage=constraints.max_leverage,
                long_only=constraints.long_only
            )

            try:
                result = self.optimize_minimum_volatility(target_constraints)

                results.append({
                    'return': result.expected_return,
                    'volatility': result.volatility,
                    'sharpe': result.sharpe_ratio,
                    'weights': result.weights
                })
            except:
                continue

        return pd.DataFrame(results)


# ===================================================================
# VISUALIZATION
# ===================================================================

class PortfolioVisualizer:
    """
    Visualizations for portfolio optimization.
    """

    @staticmethod
    def plot_efficient_frontier(efficient_frontier: pd.DataFrame,
                               optimal_portfolio: OptimizationResult,
                               title: str = "Efficient Frontier"):
        """
        Plot efficient frontier with optimal portfolio.
        """
        plt.figure(figsize=(12, 8))

        # Plot frontier
        plt.plot(efficient_frontier['volatility'],
                efficient_frontier['return'],
                'b-', linewidth=2, label='Efficient Frontier')

        # Plot optimal portfolio
        plt.scatter(optimal_portfolio.volatility,
                   optimal_portfolio.expected_return,
                   marker='*', s=500, c='red',
                   label=f'Optimal (Sharpe: {optimal_portfolio.sharpe_ratio:.3f})')

        plt.xlabel('Volatility (Risk)', fontsize=12)
        plt.ylabel('Expected Return', fontsize=12)
        plt.title(title, fontsize=14, fontweight='bold')
        plt.legend()
        plt.grid(True, alpha=0.3)

        return plt.gcf()

    @staticmethod
    def plot_weights(result: OptimizationResult, title: str = "Optimal Weights"):
        """
        Plot portfolio weights as bar chart.
        """
        plt.figure(figsize=(12, 6))

        # Sort by weight
        sorted_idx = np.argsort(result.weights)[::-1]
        sorted_weights = result.weights[sorted_idx]
        sorted_names = [result.asset_names[i] for i in sorted_idx]

        # Color by positive/negative
        colors = ['green' if w > 0 else 'red' for w in sorted_weights]

        plt.barh(range(len(sorted_weights)), sorted_weights * 100, color=colors, alpha=0.7)
        plt.yticks(range(len(sorted_weights)), sorted_names)
        plt.xlabel('Weight (%)', fontsize=12)
        plt.title(title, fontsize=14, fontweight='bold')
        plt.grid(True, alpha=0.3, axis='x')
        plt.tight_layout()

        return plt.gcf()

    @staticmethod
    def plot_gradient_heatmap(result: OptimizationResult):
        """
        Plot heatmap of gradient evolution.
        """
        if not result.gradient_history:
            return None

        gradients = np.array(result.gradient_history)

        plt.figure(figsize=(12, 8))
        sns.heatmap(gradients.T,
                   cmap='RdYlGn',
                   center=0,
                   yticklabels=result.asset_names,
                   cbar_kws={'label': '∂Sharpe/∂Weight'})

        plt.xlabel('Iteration', fontsize=12)
        plt.ylabel('Asset', fontsize=12)
        plt.title('Gradient Evolution During Optimization', fontsize=14, fontweight='bold')
        plt.tight_layout()

        return plt.gcf()

    @staticmethod
    def plot_monte_carlo_distribution(weights: np.ndarray,
                                     returns: pd.DataFrame,
                                     n_simulations: int = 10000):
        """
        Plot Monte Carlo distribution of portfolio returns.
        """
        simulator = StochasticPriceSimulator(returns)
        portfolio_paths = simulator.calculate_portfolio_paths(weights, n_simulations, 252)

        # Calculate final returns
        final_returns = (portfolio_paths[:, -1] - portfolio_paths[:, 0]) / portfolio_paths[:, 0]

        plt.figure(figsize=(12, 6))

        # Histogram
        plt.hist(final_returns * 100, bins=50, alpha=0.7, edgecolor='black')

        # Mark VaR
        var_95 = np.percentile(final_returns, 5)
        plt.axvline(var_95 * 100, color='red', linestyle='--', linewidth=2,
                   label=f'VaR 95%: {var_95*100:.2f}%')

        # Mark mean
        plt.axvline(final_returns.mean() * 100, color='green', linestyle='--', linewidth=2,
                   label=f'Mean: {final_returns.mean()*100:.2f}%')

        plt.xlabel('Annual Return (%)', fontsize=12)
        plt.ylabel('Frequency', fontsize=12)
        plt.title(f'Monte Carlo Distribution ({n_simulations:,} Simulations)',
                 fontsize=14, fontweight='bold')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.tight_layout()

        return plt.gcf()


# ===================================================================
# EXAMPLE USAGE
# ===================================================================

if __name__ == "__main__":
    # Generate sample returns data
    np.random.seed(42)

    tickers = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'JPM', 'BAC', 'C']
    n_days = 252 * 3  # 3 years

    # Simulate returns
    returns_data = {}
    for ticker in tickers:
        returns_data[ticker] = np.random.normal(0.0005, 0.02, n_days)

    returns = pd.DataFrame(returns_data)

    print("="*80)
    print("ATLAS TERMINAL - QUANT PORTFOLIO OPTIMIZER")
    print("="*80)

    # Initialize optimizer
    optimizer = MultivariablePortfolioOptimizer(returns, risk_free_rate=0.03)

    # Set constraints
    constraints = PortfolioConstraints(
        min_weight=0.05,
        max_weight=0.30,
        max_leverage=1.0,
        long_only=True
    )

    # Optimize
    print("\n🔥 Optimizing portfolio (Maximum Sharpe Ratio)...")
    result = optimizer.optimize_sharpe(constraints)

    print(f"\n✅ Optimization Complete!")
    print(f"   Expected Return: {result.expected_return*100:.2f}%")
    print(f"   Volatility: {result.volatility*100:.2f}%")
    print(f"   Sharpe Ratio: {result.sharpe_ratio:.3f}")
    print(f"   VaR 95%: {result.var_95*100:.2f}%")
    print(f"   CVaR 95%: {result.cvar_95*100:.2f}%")
    print(f"   Max Drawdown: {result.max_drawdown*100:.2f}%")

    print("\n📊 Optimal Weights:")
    for asset, weight in zip(result.asset_names, result.weights):
        print(f"   {asset}: {weight*100:.2f}%")

    # Generate efficient frontier
    print("\n📈 Calculating efficient frontier...")
    frontier = optimizer.efficient_frontier(n_portfolios=50, constraints=constraints)

    print(f"✅ Frontier calculated ({len(frontier)} portfolios)")

    print("\n" + "="*80)
