"""
ATLAS Phoenix Mode
Reconstruct portfolio from trade history
"""

import pandas as pd
import numpy as np
from typing import Dict, List
from datetime import datetime


class PhoenixMode:
    """
    Portfolio Reconstruction from Trade History

    Features:
    - Parse trade history CSV
    - Calculate current positions
    - Compute cost basis
    - Track realized P&L
    """

    def __init__(self):
        """Initialize Phoenix Mode"""
        self.trades = None
        self.positions = {}
        self.realized_pnl = 0.0

    def load_trade_history(self, csv_file: str) -> pd.DataFrame:
        """
        Load trade history from CSV

        Expected columns: Date, Ticker, Action, Quantity, Price

        Args:
            csv_file: Path to CSV file

        Returns:
            DataFrame with trades
        """
        try:
            trades = pd.read_csv(csv_file)

            required_cols = ['Date', 'Ticker', 'Action', 'Quantity', 'Price']
            missing_cols = [col for col in required_cols if col not in trades.columns]

            if missing_cols:
                raise ValueError(f"Missing required columns: {missing_cols}")

            trades['Date'] = pd.to_datetime(trades['Date'])
            trades = trades.sort_values('Date')
            trades['Action'] = trades['Action'].str.upper()

            self.trades = trades
            print(f"✅ Loaded {len(trades)} trades")

            return trades

        except Exception as e:
            print(f"❌ Error loading trade history: {str(e)}")
            raise

    def reconstruct_portfolio(self) -> Dict:
        """
        Reconstruct current portfolio positions

        Returns:
            Dict with positions and metrics
        """
        if self.trades is None:
            raise ValueError("No trade history loaded")

        positions = {}
        realized_pnl = 0.0

        for _, trade in self.trades.iterrows():
            ticker = trade['Ticker']
            action = trade['Action']
            quantity = trade['Quantity']
            price = trade['Price']

            if ticker not in positions:
                positions[ticker] = {
                    'quantity': 0,
                    'total_cost': 0.0,
                    'realized_pnl': 0.0
                }

            if action == 'BUY':
                positions[ticker]['quantity'] += quantity
                positions[ticker]['total_cost'] += quantity * price

            elif action == 'SELL':
                if positions[ticker]['quantity'] > 0:
                    avg_cost = positions[ticker]['total_cost'] / positions[ticker]['quantity']
                    sale_pnl = quantity * (price - avg_cost)
                    positions[ticker]['realized_pnl'] += sale_pnl
                    realized_pnl += sale_pnl

                positions[ticker]['quantity'] -= quantity

                if positions[ticker]['quantity'] > 0:
                    cost_reduction = (quantity / (positions[ticker]['quantity'] + quantity)) * positions[ticker]['total_cost']
                    positions[ticker]['total_cost'] -= cost_reduction
                else:
                    positions[ticker]['total_cost'] = 0.0

        positions = {k: v for k, v in positions.items() if v['quantity'] > 0}

        for ticker in positions:
            positions[ticker]['avg_cost'] = positions[ticker]['total_cost'] / positions[ticker]['quantity']

        self.positions = positions
        self.realized_pnl = realized_pnl

        return {
            'positions': positions,
            'realized_pnl': realized_pnl,
            'tickers': list(positions.keys()),
            'total_positions': len(positions)
        }

    def get_portfolio_summary(self, current_prices: Dict[str, float]) -> pd.DataFrame:
        """
        Generate portfolio summary with current prices

        Args:
            current_prices: Dict mapping ticker to current price

        Returns:
            DataFrame with portfolio summary
        """
        if not self.positions:
            raise ValueError("No positions")

        summary = []

        for ticker, position in self.positions.items():
            current_price = current_prices.get(ticker, 0)
            quantity = position['quantity']
            avg_cost = position['avg_cost']
            total_cost = position['total_cost']

            current_value = quantity * current_price
            unrealized_pnl = current_value - total_cost
            unrealized_pnl_pct = (unrealized_pnl / total_cost * 100) if total_cost > 0 else 0

            summary.append({
                'Ticker': ticker,
                'Quantity': quantity,
                'Avg Cost': avg_cost,
                'Current Price': current_price,
                'Total Cost': total_cost,
                'Current Value': current_value,
                'Unrealized P&L': unrealized_pnl,
                'Unrealized P&L %': unrealized_pnl_pct,
                'Realized P&L': position['realized_pnl']
            })

        df = pd.DataFrame(summary)

        totals = {
            'Ticker': 'TOTAL',
            'Quantity': '-',
            'Avg Cost': '-',
            'Current Price': '-',
            'Total Cost': df['Total Cost'].sum(),
            'Current Value': df['Current Value'].sum(),
            'Unrealized P&L': df['Unrealized P&L'].sum(),
            'Unrealized P&L %': (df['Unrealized P&L'].sum() / df['Total Cost'].sum() * 100),
            'Realized P&L': self.realized_pnl
        }

        df = pd.concat([df, pd.DataFrame([totals])], ignore_index=True)

        return df


__all__ = ['PhoenixMode']
