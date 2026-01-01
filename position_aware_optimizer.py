"""
Position-Aware Portfolio Optimizer
===================================

Optimizes portfolio FROM current positions, not from scratch.

Key Features:
- Knows your current holdings
- Calculates exact trades needed (BUY/SELL/HOLD)
- Considers transaction costs from current state
- Applies drift constraints (max % change per position)
- Shows net benefit (improvement - costs)
- Only recommends rebalancing if benefit > cost

Philosophy: "Ground optimization in reality, not theory"
"""

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from typing import Dict, List, Tuple, Optional
import yfinance as yf


class PositionAwareOptimizer:
    """
    Portfolio optimizer that starts from CURRENT positions

    Unlike traditional optimizers that find "optimal" weights from scratch,
    this optimizer:
    1. Knows where you are TODAY
    2. Optimizes FROM current state
    3. Applies realistic drift constraints
    4. Calculates exact trades needed
    5. Considers transaction costs
    6. Only recommends changes if net benefit > 0
    """

    def __init__(
        self,
        current_portfolio: Dict[str, float],
        returns_df: pd.DataFrame,
        portfolio_value: float,
        current_prices: Optional[Dict[str, float]] = None,
        risk_free_rate: float = 0.02
    ):
        """
        Initialize position-aware optimizer

        Args:
            current_portfolio: Dict {ticker: weight} of CURRENT holdings
            returns_df: DataFrame of historical returns
            portfolio_value: Total portfolio value in dollars
            current_prices: Dict {ticker: price} for trade calculations
            risk_free_rate: Risk-free rate for Sharpe/Sortino
        """
        self.current = current_portfolio
        self.returns = returns_df
        self.portfolio_value = portfolio_value
        self.current_prices = current_prices or {}
        self.rf = risk_free_rate

        # Align current portfolio with returns columns
        self.tickers = returns_df.columns.tolist()
        self.current_weights = self._align_current_weights()

        # Calculate current portfolio metrics
        self.current_metrics = self._calculate_portfolio_metrics(self.current_weights)

    def _align_current_weights(self) -> np.ndarray:
        """Align current portfolio weights with returns DataFrame columns"""
        weights = np.zeros(len(self.tickers))

        for i, ticker in enumerate(self.tickers):
            weights[i] = self.current.get(ticker, 0.0)

        # Normalize to sum to 1
        total = weights.sum()
        if total > 0:
            weights = weights / total

        return weights

    def _calculate_portfolio_metrics(self, weights: np.ndarray) -> Dict:
        """Calculate comprehensive metrics for a portfolio"""

        # Portfolio returns
        portfolio_returns = (self.returns * weights).sum(axis=1)

        # Annualized metrics
        annual_return = portfolio_returns.mean() * 252
        annual_vol = portfolio_returns.std() * np.sqrt(252)

        # Sharpe ratio
        sharpe = (annual_return - self.rf) / annual_vol if annual_vol > 0 else 0

        # Sortino ratio (downside deviation)
        downside_returns = portfolio_returns[portfolio_returns < 0]
        if len(downside_returns) > 0:
            downside_dev = downside_returns.std() * np.sqrt(252)
        else:
            downside_dev = annual_vol

        sortino = (annual_return - self.rf) / downside_dev if downside_dev > 0 else 0

        # VaR and CVaR (95%)
        var_95 = np.percentile(portfolio_returns, 5) * np.sqrt(252)
        cvar_95 = portfolio_returns[portfolio_returns <= portfolio_returns.quantile(0.05)].mean() * np.sqrt(252)

        return {
            'annual_return': annual_return,
            'annual_volatility': annual_vol,
            'sharpe_ratio': sharpe,
            'sortino_ratio': sortino,
            'var_95': var_95,
            'cvar_95': cvar_95,
            'downside_deviation': downside_dev
        }

    def optimize_from_current(
        self,
        max_drift: float = 0.10,
        objective: str = 'sortino',
        min_weight: float = 0.0,
        max_weight: float = 0.40
    ) -> Dict:
        """
        Optimize portfolio starting from current positions

        Args:
            max_drift: Maximum % change per position (e.g., 0.10 = 10%)
            objective: 'sharpe', 'sortino', or 'min_volatility'
            min_weight: Minimum weight per asset (absolute)
            max_weight: Maximum weight per asset (absolute)

        Returns:
            Dict with current, target, trades, costs, benefit
        """
        n_assets = len(self.tickers)

        # Define objective function
        def objective_function(weights):
            portfolio_returns = (self.returns * weights).sum(axis=1)
            annual_return = portfolio_returns.mean() * 252

            if objective == 'sortino':
                # Sortino ratio (downside risk only)
                downside_returns = portfolio_returns[portfolio_returns < 0]
                if len(downside_returns) > 0:
                    downside_dev = downside_returns.std() * np.sqrt(252)
                else:
                    downside_dev = portfolio_returns.std() * np.sqrt(252)

                if downside_dev == 0:
                    metric = annual_return * 10
                else:
                    metric = (annual_return - self.rf) / downside_dev

            elif objective == 'sharpe':
                # Sharpe ratio
                annual_vol = portfolio_returns.std() * np.sqrt(252)
                if annual_vol == 0:
                    metric = annual_return * 10
                else:
                    metric = (annual_return - self.rf) / annual_vol

            else:  # min_volatility
                annual_vol = portfolio_returns.std() * np.sqrt(252)
                metric = -annual_vol

            # PENALTY: Turnover from current portfolio
            # Larger moves = larger transaction costs
            turnover = np.sum(np.abs(weights - self.current_weights))
            turnover_penalty = turnover * 0.0005  # 5 bps per 1% turnover

            return -(metric - turnover_penalty)

        # Constraints: weights sum to 1
        constraints = [
            {'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0}
        ]

        # Bounds: Current ± max_drift, but respect absolute min/max
        bounds = []
        for i in range(n_assets):
            current_w = self.current_weights[i]

            # Calculate drift-based bounds
            lower_drift = max(0, current_w - max_drift)
            upper_drift = min(1, current_w + max_drift)

            # Apply absolute bounds
            lower = max(min_weight, lower_drift)
            upper = min(max_weight, upper_drift)

            bounds.append((lower, upper))

        # Optimize
        result = minimize(
            objective_function,
            self.current_weights,  # Start from current!
            method='SLSQP',
            bounds=bounds,
            constraints=constraints,
            options={'maxiter': 2000, 'ftol': 1e-8}
        )

        target_weights = result.x

        # Calculate target metrics
        target_metrics = self._calculate_portfolio_metrics(target_weights)

        # Generate trades
        trades = self._generate_trades(self.current_weights, target_weights)

        # Calculate transaction costs
        costs = self._calculate_transaction_costs(trades)

        # Calculate improvement and net benefit
        if objective == 'sortino':
            improvement_metric = target_metrics['sortino_ratio'] - self.current_metrics['sortino_ratio']
            metric_name = 'Sortino Ratio'
        elif objective == 'sharpe':
            improvement_metric = target_metrics['sharpe_ratio'] - self.current_metrics['sharpe_ratio']
            metric_name = 'Sharpe Ratio'
        else:
            improvement_metric = self.current_metrics['annual_volatility'] - target_metrics['annual_volatility']
            metric_name = 'Volatility Reduction'

        # Estimate dollar benefit (rough approximation)
        # For Sharpe/Sortino improvement of 0.1, assume ~1-2% return improvement
        if objective in ['sharpe', 'sortino']:
            dollar_benefit = improvement_metric * 0.15 * self.portfolio_value  # 15% of portfolio per 1.0 ratio improvement
        else:
            dollar_benefit = improvement_metric * 0.50 * self.portfolio_value  # Vol reduction benefit

        net_benefit = dollar_benefit - costs['total']

        return {
            'optimization_success': result.success,
            'current_weights': {self.tickers[i]: self.current_weights[i] for i in range(n_assets)},
            'target_weights': {self.tickers[i]: target_weights[i] for i in range(n_assets)},
            'current_metrics': self.current_metrics,
            'target_metrics': target_metrics,
            'trades': trades,
            'costs': costs,
            'improvement': {
                'metric_name': metric_name,
                'metric_delta': improvement_metric,
                'return_delta': target_metrics['annual_return'] - self.current_metrics['annual_return'],
                'volatility_delta': target_metrics['annual_volatility'] - self.current_metrics['annual_volatility'],
                'sharpe_delta': target_metrics['sharpe_ratio'] - self.current_metrics['sharpe_ratio'],
                'sortino_delta': target_metrics['sortino_ratio'] - self.current_metrics['sortino_ratio']
            },
            'dollar_benefit': dollar_benefit,
            'net_benefit': net_benefit,
            'recommendation': 'REBALANCE' if net_benefit > 0 else 'HOLD',
            'objective': objective
        }

    def _generate_trades(
        self,
        current_weights: np.ndarray,
        target_weights: np.ndarray
    ) -> List[Dict]:
        """
        Generate exact trade list

        Returns list of trades with ticker, action, amounts, shares
        """
        trades = []

        for i, ticker in enumerate(self.tickers):
            current_w = current_weights[i]
            target_w = target_weights[i]

            delta_w = target_w - current_w

            # Only include meaningful trades (>0.1% change)
            if abs(delta_w) < 0.001:
                continue

            # Calculate dollar amounts
            current_value = current_w * self.portfolio_value
            target_value = target_w * self.portfolio_value
            delta_value = delta_w * self.portfolio_value

            # Determine action
            if delta_w > 0:
                action = 'BUY'
            else:
                action = 'SELL'

            # Get current price (fetch if not provided)
            if ticker not in self.current_prices:
                try:
                    stock = yf.Ticker(ticker)
                    self.current_prices[ticker] = stock.info.get('currentPrice', stock.info.get('regularMarketPrice', 100))
                except:
                    self.current_prices[ticker] = 100  # Fallback

            price = self.current_prices[ticker]

            # Calculate shares
            current_shares = int(current_value / price)
            target_shares = int(target_value / price)
            delta_shares = target_shares - current_shares

            trades.append({
                'ticker': ticker,
                'action': action,
                'current_weight': current_w,
                'target_weight': target_w,
                'delta_weight': delta_w,
                'current_value': current_value,
                'target_value': target_value,
                'delta_value': abs(delta_value),
                'current_shares': current_shares,
                'target_shares': target_shares,
                'delta_shares': abs(delta_shares),
                'price': price,
                'priority': abs(delta_value)  # For sorting
            })

        # Sort by priority (largest dollar moves first)
        trades.sort(key=lambda x: x['priority'], reverse=True)

        return trades

    def _calculate_transaction_costs(self, trades: List[Dict]) -> Dict:
        """
        Calculate comprehensive transaction costs

        Components:
        - Bid-ask spread (5 bps per trade)
        - Market impact (0.1% per $100k traded)
        - Commission ($0 for most brokers now)
        """
        costs = {
            'spread': 0.0,
            'impact': 0.0,
            'commission': 0.0,
            'tax_estimate': 0.0,  # Placeholder for future
            'total': 0.0
        }

        for trade in trades:
            amount = trade['delta_value']

            # Bid-ask spread cost
            # Assume 5 bps average for liquid stocks
            spread_cost = amount * 0.0005
            costs['spread'] += spread_cost

            # Market impact
            # Larger trades have higher impact
            # Assume 0.1% impact per $100k traded
            impact_rate = (amount / 100000) * 0.001
            impact_cost = amount * impact_rate
            costs['impact'] += impact_cost

            # Commission (most platforms are $0 now)
            costs['commission'] += 0

        costs['total'] = costs['spread'] + costs['impact'] + costs['commission']

        return costs

    def calculate_turnover(self, target_weights: np.ndarray) -> float:
        """
        Calculate portfolio turnover

        Turnover = sum of absolute weight changes / 2
        """
        turnover = np.sum(np.abs(target_weights - self.current_weights)) / 2
        return turnover


__all__ = ['PositionAwareOptimizer']
