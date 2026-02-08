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
        max_weight: float = None,
        sector_map: Optional[Dict[str, str]] = None,
        sector_constraints: Optional[Dict[str, float]] = None
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

        self.sector_map = sector_map or {}
        self.sector_constraints = sector_constraints or {}

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

    def _sector_constraints(self) -> List[Dict]:
        constraints = []
        if not self.sector_constraints:
            return constraints

        for sector, max_weight in self.sector_constraints.items():
            sector_tickers = [t for t, s in self.sector_map.items() if s == sector]
            if not sector_tickers:
                continue
            sector_indices = [self.tickers.index(t) for t in sector_tickers if t in self.tickers]
            if not sector_indices:
                continue

            def constraint_factory(indices, limit):
                return {'type': 'ineq', 'fun': lambda w, idx=indices, lim=limit: lim - np.sum(w[idx])}

            constraints.append(constraint_factory(sector_indices, max_weight))

        return constraints

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
        constraints.extend(self._sector_constraints())

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

        success = result.get('success') if isinstance(result, dict) else getattr(result, 'success', False)
        if not success:
            message = result.get('message') if isinstance(result, dict) else getattr(result, 'message', 'Unknown error')
            raise ValueError(f"Optimization failed: {message}")

        weights = result.x
        port_return, port_vol, sharpe = self._portfolio_stats(weights)

        return {
            'weights': dict(zip(self.tickers, weights)),
            'return': port_return,
            'volatility': port_vol,
            'sharpe_ratio': sharpe,
            'leverage': np.sum(weights),
            'success': success,
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
        constraints.extend(self._sector_constraints())

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

        success = result.get('success') if isinstance(result, dict) else getattr(result, 'success', False)
        if not success:
            message = result.get('message') if isinstance(result, dict) else getattr(result, 'message', 'Unknown error')
            raise ValueError(f"Optimization failed: {message}")

        weights = result.x
        port_return, port_vol, sharpe = self._portfolio_stats(weights)

        return {
            'weights': dict(zip(self.tickers, weights)),
            'return': port_return,
            'volatility': port_vol,
            'sharpe_ratio': sharpe,
            'leverage': np.sum(weights),
            'success': success,
            'method': 'min_volatility'
        }

    def optimize_max_return(self, max_volatility: Optional[float] = None) -> Dict:
        """
        Optimize for maximum return with optional volatility cap.
        """
        def negative_return(weights):
            return -np.dot(weights, self.mean_returns)

        constraints = [
            {'type': 'eq', 'fun': lambda w: np.sum(w) - self.leverage}
        ]
        constraints.extend(self._sector_constraints())

        if max_volatility is not None:
            constraints.append(
                {'type': 'ineq', 'fun': lambda w: max_volatility - self._portfolio_volatility(w)}
            )

        bounds = tuple((self.min_weight, self.max_weight) for _ in range(self.n_assets))
        x0 = np.array([self.leverage / self.n_assets] * self.n_assets)

        result = minimize(
            negative_return,
            x0,
            method='SLSQP',
            bounds=bounds,
            constraints=constraints,
            options={'maxiter': 1000, 'ftol': 1e-9}
        )

        success = result.get('success') if isinstance(result, dict) else getattr(result, 'success', False)
        if not success:
            message = result.get('message') if isinstance(result, dict) else getattr(result, 'message', 'Unknown error')
            raise ValueError(f"Optimization failed: {message}")

        weights = result.x
        port_return, port_vol, sharpe = self._portfolio_stats(weights)

        return {
            'weights': dict(zip(self.tickers, weights)),
            'return': port_return,
            'volatility': port_vol,
            'sharpe_ratio': sharpe,
            'leverage': np.sum(weights),
            'success': success,
            'method': 'max_return'
        }

    def generate_rebalancing_plan(self, optimal_weights, portfolio_data, currency_symbol='$'):
        """
        Generate detailed rebalancing plan with BUY/SELL/HOLD actions.
        """
        ticker_column = 'Symbol' if 'Symbol' in portfolio_data.columns else 'Ticker'

        qty_col = None
        for col in ['Shares', 'Quantity', 'Qty', 'shares', 'quantity', 'qty']:
            if col in portfolio_data.columns:
                qty_col = col
                break

        optimized_tickers = list(self.returns.columns)
        portfolio_data = portfolio_data[portfolio_data[ticker_column].isin(optimized_tickers)].copy()

        if qty_col and 'Current Price' in portfolio_data.columns:
            portfolio_data['Total Value'] = portfolio_data[qty_col] * portfolio_data['Current Price']
        elif 'Total Value' not in portfolio_data.columns:
            if 'Market Value' in portfolio_data.columns:
                portfolio_data['Total Value'] = portfolio_data['Market Value']
            else:
                return None, None

        total_portfolio_value = portfolio_data['Total Value'].sum()
        portfolio_data['Current Weight'] = portfolio_data['Total Value'] / total_portfolio_value

        rebalancing_data = []
        total_buy_value = 0
        total_sell_value = 0

        for i, ticker in enumerate(optimized_tickers):
            ticker_data = portfolio_data[portfolio_data[ticker_column] == ticker]

            if ticker_data.empty:
                current_weight = 0
                current_value = 0
                current_shares = 0
                current_price = 0
            else:
                current_weight = ticker_data['Current Weight'].values[0]
                current_value = ticker_data['Total Value'].values[0]
                current_shares = ticker_data[qty_col].values[0] if qty_col else 0
                current_price = ticker_data['Current Price'].values[0] if 'Current Price' in ticker_data.columns else 0

            optimal_weight = optimal_weights[i]
            optimal_value = optimal_weight * total_portfolio_value
            weight_diff = optimal_weight - current_weight

            if current_price > 0:
                optimal_shares = optimal_value / current_price
                shares_to_trade = optimal_shares - current_shares
                trade_value = shares_to_trade * current_price
            else:
                optimal_shares = 0
                shares_to_trade = 0
                trade_value = 0

            if abs(trade_value) > 100 or abs(shares_to_trade) > 5:
                if shares_to_trade > 0:
                    action = 'BUY'
                    total_buy_value += abs(trade_value)
                else:
                    action = 'SELL'
                    total_sell_value += abs(trade_value)
            else:
                action = 'HOLD'

            rebalancing_data.append({
                'Ticker': ticker,
                'Current Weight (%)': current_weight * 100,
                'Optimal Weight (%)': optimal_weight * 100,
                'Weight Diff (%)': weight_diff * 100,
                'Current Shares': int(current_shares),
                'Target Shares': int(optimal_shares),
                'Shares to Trade': int(shares_to_trade),
                'Trade Value': trade_value,
                'Action': action,
                'Priority': abs(trade_value)
            })

        rebalancing_df = pd.DataFrame(rebalancing_data)
        rebalancing_df = rebalancing_df.sort_values('Priority', ascending=False)

        buy_trades = len(rebalancing_df[rebalancing_df['Action'] == 'BUY'])
        sell_trades = len(rebalancing_df[rebalancing_df['Action'] == 'SELL'])
        hold_positions = len(rebalancing_df[rebalancing_df['Action'] == 'HOLD'])

        trading_cost = (total_buy_value + total_sell_value) * 0.001

        metrics = {
            'total_portfolio_value': total_portfolio_value,
            'buy_trades': buy_trades,
            'sell_trades': sell_trades,
            'hold_positions': hold_positions,
            'total_buy_value': total_buy_value,
            'total_sell_value': total_sell_value,
            'estimated_trading_cost': trading_cost,
            'total_trades': buy_trades + sell_trades,
            'turnover_pct': (total_buy_value + total_sell_value) / (2 * total_portfolio_value) * 100 if total_portfolio_value > 0 else 0
        }

        return rebalancing_df, metrics

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

                if (result.get('success') if isinstance(result, dict) else getattr(result, 'success', False)):
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
