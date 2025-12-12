"""
ATLAS Phoenix Mode - Portfolio Reconstruction
Bulletproof version with comprehensive return values and validation
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from datetime import datetime


class PhoenixMode:
    """
    Portfolio Reconstruction from Trade History

    Features:
    - Parse trade history CSV
    - Calculate current positions with cost basis
    - Track realized and unrealized P&L
    - Generate comprehensive portfolio summaries
    - Export to various formats

    Example Usage:
        >>> phoenix = PhoenixMode()
        >>> phoenix.load_trade_history('trades.csv')
        >>> portfolio = phoenix.reconstruct_portfolio()
        >>> print(f"Positions: {portfolio['total_positions']}")
        >>> print(f"Realized P&L: ${portfolio['realized_pnl']:,.2f}")
        >>>
        >>> # Get detailed summary with current prices
        >>> current_prices = {'AAPL': 180.0, 'GOOGL': 140.0}
        >>> summary = phoenix.get_portfolio_summary(current_prices)
        >>> print(summary)
    """

    def __init__(self):
        """Initialize Phoenix Mode"""
        self.trades = None
        self.positions = {}
        self.realized_pnl = 0.0
        self._validated = False

    def load_trade_history(self, csv_file: str) -> pd.DataFrame:
        """
        Load trade history from CSV

        Expected CSV Format:
            Date,Ticker,Action,Quantity,Price
            2024-01-01,AAPL,BUY,10,180.00
            2024-02-01,AAPL,SELL,5,185.00

        Required columns:
        - Date: Trade date (YYYY-MM-DD or any parseable format)
        - Ticker: Stock ticker symbol
        - Action: BUY or SELL (case-insensitive)
        - Quantity: Number of shares (positive integer)
        - Price: Execution price per share (positive float)

        Args:
            csv_file: Path to CSV file

        Returns:
            DataFrame with validated trades

        Raises:
            ValueError: If required columns missing or data invalid
            FileNotFoundError: If CSV file doesn't exist
        """
        try:
            trades = pd.read_csv(csv_file)

            # Validate required columns
            required_cols = ['Date', 'Ticker', 'Action', 'Quantity', 'Price']
            missing_cols = [col for col in required_cols if col not in trades.columns]

            if missing_cols:
                raise ValueError(
                    f"Missing required columns: {missing_cols}. "
                    f"Expected columns: {required_cols}"
                )

            # Validate data types and clean
            trades['Date'] = pd.to_datetime(trades['Date'], errors='coerce')
            if trades['Date'].isnull().any():
                raise ValueError("Some dates could not be parsed. Check Date column format.")

            trades['Action'] = trades['Action'].str.upper().str.strip()
            valid_actions = trades['Action'].isin(['BUY', 'SELL'])
            if not valid_actions.all():
                invalid = trades[~valid_actions]['Action'].unique()
                raise ValueError(f"Invalid actions found: {invalid}. Must be 'BUY' or 'SELL'.")

            trades['Quantity'] = pd.to_numeric(trades['Quantity'], errors='coerce')
            trades['Price'] = pd.to_numeric(trades['Price'], errors='coerce')

            if trades['Quantity'].isnull().any() or trades['Price'].isnull().any():
                raise ValueError("Quantity and Price must be numeric values.")

            if (trades['Quantity'] <= 0).any() or (trades['Price'] <= 0).any():
                raise ValueError("Quantity and Price must be positive values.")

            # Sort by date
            trades = trades.sort_values('Date').reset_index(drop=True)

            self.trades = trades
            self._validated = True

            print(f"✅ Loaded {len(trades)} trades")

            return trades

        except FileNotFoundError:
            raise FileNotFoundError(f"CSV file not found: {csv_file}")
        except Exception as e:
            raise ValueError(f"Error loading trade history: {str(e)}")

    def reconstruct_portfolio(self, current_prices: Optional[Dict[str, float]] = None) -> Dict:
        """
        Reconstruct current portfolio positions from trade history

        This method processes all trades chronologically to calculate:
        - Current position sizes
        - Average cost basis per position
        - Realized P&L from closed trades
        - Unrealized P&L (if current prices provided)

        Args:
            current_prices: Optional dict mapping ticker to current price.
                          If provided, calculates unrealized P&L.

        Returns:
            Dict with comprehensive portfolio metrics:
            {
                'positions': Dict[ticker, position_details],
                'realized_pnl': float,
                'unrealized_pnl': float or None,
                'total_cost': float,
                'current_value': float or None,
                'total_pnl': float,
                'total_return_pct': float or None,
                'tickers': List[str],
                'total_positions': int,
                'trades_processed': int
            }

        Raises:
            ValueError: If no trade history loaded
        """
        if self.trades is None or not self._validated:
            raise ValueError("No trade history loaded. Call load_trade_history() first.")

        positions = {}
        realized_pnl = 0.0

        # Process each trade chronologically
        for idx, trade in self.trades.iterrows():
            ticker = trade['Ticker']
            action = trade['Action']
            quantity = trade['Quantity']
            price = trade['Price']

            # Initialize position if new ticker
            if ticker not in positions:
                positions[ticker] = {
                    'quantity': 0,
                    'total_cost': 0.0,
                    'realized_pnl': 0.0,
                    'trades': []
                }

            # Record trade
            positions[ticker]['trades'].append({
                'date': trade['Date'],
                'action': action,
                'quantity': quantity,
                'price': price
            })

            if action == 'BUY':
                # Add to position
                positions[ticker]['quantity'] += quantity
                positions[ticker]['total_cost'] += quantity * price

            elif action == 'SELL':
                # Calculate realized P&L for this sale
                if positions[ticker]['quantity'] > 0:
                    avg_cost = positions[ticker]['total_cost'] / positions[ticker]['quantity']
                    sale_pnl = quantity * (price - avg_cost)
                    positions[ticker]['realized_pnl'] += sale_pnl
                    realized_pnl += sale_pnl

                # Reduce position
                positions[ticker]['quantity'] -= quantity

                # Reduce cost basis proportionally
                if positions[ticker]['quantity'] > 0:
                    cost_reduction = (quantity / (positions[ticker]['quantity'] + quantity)) * positions[ticker]['total_cost']
                    positions[ticker]['total_cost'] -= cost_reduction
                else:
                    # Position fully closed
                    positions[ticker]['total_cost'] = 0.0

        # Remove fully closed positions (quantity = 0)
        positions = {k: v for k, v in positions.items() if v['quantity'] > 0}

        # Calculate average cost per open position
        for ticker in positions:
            if positions[ticker]['quantity'] > 0:
                positions[ticker]['avg_cost'] = positions[ticker]['total_cost'] / positions[ticker]['quantity']
            else:
                positions[ticker]['avg_cost'] = 0.0

        # Calculate totals
        total_cost = sum(pos['total_cost'] for pos in positions.values())

        # Build return dictionary
        result = {
            'positions': positions,
            'realized_pnl': realized_pnl,
            'total_cost': total_cost,
            'tickers': list(positions.keys()),
            'total_positions': len(positions),
            'trades_processed': len(self.trades)
        }

        # Calculate unrealized P&L if current prices provided
        if current_prices:
            unrealized_pnl = 0.0
            current_value = 0.0

            for ticker, position in positions.items():
                if ticker in current_prices:
                    price = current_prices[ticker]
                    value = position['quantity'] * price
                    current_value += value
                    unrealized_pnl += (value - position['total_cost'])

            result['unrealized_pnl'] = unrealized_pnl
            result['current_value'] = current_value
            result['total_pnl'] = realized_pnl + unrealized_pnl
            result['total_return_pct'] = ((realized_pnl + unrealized_pnl) / total_cost * 100) if total_cost > 0 else 0.0
        else:
            # Set to None if prices not provided
            result['unrealized_pnl'] = None
            result['current_value'] = None
            result['total_pnl'] = realized_pnl  # Only realized
            result['total_return_pct'] = None

        self.positions = positions
        self.realized_pnl = realized_pnl

        return result

    def get_portfolio_summary(self, current_prices: Dict[str, float]) -> pd.DataFrame:
        """
        Generate detailed portfolio summary with current prices

        Args:
            current_prices: Dict mapping ticker to current price

        Returns:
            DataFrame with comprehensive position details

        Raises:
            ValueError: If no positions (call reconstruct_portfolio first)
        """
        if not self.positions:
            raise ValueError("No positions. Call reconstruct_portfolio() first.")

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

        # Add totals row
        totals = {
            'Ticker': 'TOTAL',
            'Quantity': '-',
            'Avg Cost': '-',
            'Current Price': '-',
            'Total Cost': df['Total Cost'].sum(),
            'Current Value': df['Current Value'].sum(),
            'Unrealized P&L': df['Unrealized P&L'].sum(),
            'Unrealized P&L %': (df['Unrealized P&L'].sum() / df['Total Cost'].sum() * 100) if df['Total Cost'].sum() > 0 else 0,
            'Realized P&L': self.realized_pnl
        }

        df = pd.concat([df, pd.DataFrame([totals])], ignore_index=True)

        return df

    def get_position_details(self, ticker: str) -> Dict:
        """
        Get detailed information about a specific position

        Args:
            ticker: Ticker symbol

        Returns:
            Dict with position details including trade history
        """
        if ticker not in self.positions:
            raise ValueError(f"No position found for {ticker}")

        return self.positions[ticker]

    def export_to_investopedia_format(self) -> pd.DataFrame:
        """
        Export positions in Investopedia-compatible format

        Returns:
            DataFrame with columns: symbol, quantity, cost_basis
        """
        if not self.positions:
            raise ValueError("No positions to export")

        export_data = []

        for ticker, position in self.positions.items():
            export_data.append({
                'symbol': ticker,
                'quantity': position['quantity'],
                'cost_basis': position['total_cost']
            })

        return pd.DataFrame(export_data)

    def get_trade_history(self, ticker: Optional[str] = None) -> pd.DataFrame:
        """
        Get trade history, optionally filtered by ticker

        Args:
            ticker: Optional ticker to filter by

        Returns:
            DataFrame with trade history
        """
        if self.trades is None:
            raise ValueError("No trade history loaded")

        if ticker:
            return self.trades[self.trades['Ticker'] == ticker].copy()

        return self.trades.copy()


__all__ = ['PhoenixMode']
