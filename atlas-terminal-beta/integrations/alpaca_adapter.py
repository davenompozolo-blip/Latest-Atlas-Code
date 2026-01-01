"""
ATLAS Terminal Beta - Alpaca Markets Integration
=================================================
Clean adapter for Alpaca Markets API integration.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

try:
    from alpaca.trading.client import TradingClient
    from alpaca.data.historical import StockHistoricalDataClient
    from alpaca.data.requests import StockBarsRequest
    from alpaca.data.timeframe import TimeFrame
    ALPACA_AVAILABLE = True
except ImportError:
    ALPACA_AVAILABLE = False


class AlpacaAdapter:
    """
    Alpaca Markets API adapter for ATLAS Terminal Beta.
    Provides portfolio data, risk metrics, and trade history.
    """

    def __init__(self, api_key: str, secret_key: str, paper: bool = True):
        """
        Initialize Alpaca API connection.

        Parameters:
        -----------
        api_key : str
            Alpaca API key
        secret_key : str
            Alpaca secret key
        paper : bool
            Use paper trading (True) or live trading (False)
        """
        if not ALPACA_AVAILABLE:
            raise ImportError(
                "alpaca-py package not installed. "
                "Install with: pip install alpaca-py"
            )

        self.api_key = api_key
        self.secret_key = secret_key
        self.paper = paper
        self.account_type = "PAPER" if paper else "LIVE"

        # Initialize API clients
        self.trading_client = TradingClient(api_key, secret_key, paper=paper)
        self.data_client = StockHistoricalDataClient(api_key, secret_key)

    def test_connection(self) -> Tuple[bool, str]:
        """
        Test API connection and credentials.

        Returns:
        --------
        tuple : (success: bool, message: str)
        """
        try:
            account = self.trading_client.get_account()
            if account.status == "ACTIVE":
                return True, f"✅ Connected to Alpaca {self.account_type} account"
            else:
                return False, f"⚠️ Account status: {account.status}"
        except Exception as e:
            return False, f"❌ Connection failed: {str(e)}"

    def get_account_summary(self) -> Dict:
        """
        Get account summary information.

        Returns:
        --------
        dict : Account metrics (equity, cash, buying power, etc.)
        """
        try:
            account = self.trading_client.get_account()
            return {
                'account_type': self.account_type,
                'status': account.status,
                'portfolio_value': float(account.equity),
                'cash': float(account.cash),
                'buying_power': float(account.buying_power),
                'long_market_value': float(account.long_market_value or 0),
                'equity': float(account.equity),
                'last_equity': float(account.last_equity),
                'daytrade_count': account.daytrade_count,
                'pattern_day_trader': account.pattern_day_trader,
                'currency': account.currency,
            }
        except Exception as e:
            raise Exception(f"Failed to get account summary: {str(e)}")

    def get_positions(self) -> pd.DataFrame:
        """
        Get current portfolio positions.

        Returns:
        --------
        pd.DataFrame : Positions with columns:
            - Ticker: Stock symbol
            - Shares: Number of shares
            - Avg_Cost: Average entry price
            - Current_Price: Current market price
            - Market_Value: Current position value
            - Purchase_Value: Total cost basis
            - Unrealized_PnL: Unrealized P&L ($)
            - Unrealized_PnL_Pct: Unrealized P&L (%)
            - Daily_PnL: Today's P&L ($)
            - Weight_Pct: Portfolio weight (%)
        """
        try:
            positions = self.trading_client.get_all_positions()

            if not positions:
                return pd.DataFrame()

            account = self.get_account_summary()
            portfolio_value = account.get('portfolio_value', 1)

            positions_data = []
            for pos in positions:
                qty = float(pos.qty)
                current_price = float(pos.current_price)
                change_today = float(pos.change_today or 0)
                daily_pl = qty * change_today

                positions_data.append({
                    'Ticker': pos.symbol,
                    'Shares': qty,
                    'Avg_Cost': float(pos.avg_entry_price),
                    'Current_Price': current_price,
                    'Market_Value': float(pos.market_value),
                    'Purchase_Value': float(pos.cost_basis),
                    'Unrealized_PnL': float(pos.unrealized_pl),
                    'Unrealized_PnL_Pct': float(pos.unrealized_plpc) * 100,
                    'Daily_PnL': daily_pl,
                    'Weight_Pct': (float(pos.market_value) / portfolio_value) * 100,
                    'Side': pos.side,
                    'Exchange': pos.exchange,
                })

            df = pd.DataFrame(positions_data)
            df = df.sort_values('Weight_Pct', ascending=False).reset_index(drop=True)

            # Metadata attributes
            df.attrs['source'] = 'alpaca'
            df.attrs['currency'] = 'USD'
            df.attrs['currency_symbol'] = '$'
            df.attrs['account_type'] = self.account_type

            return df

        except Exception as e:
            raise Exception(f"Failed to get positions: {str(e)}")

    def get_portfolio_history(self, days: int = 30, timeframe: str = '1Day') -> pd.DataFrame:
        """
        Get portfolio equity curve over time.

        Parameters:
        -----------
        days : int
            Number of days of history (max 730 for daily data)
        timeframe : str
            Data frequency ('1Min', '5Min', '15Min', '1Hour', '1Day')

        Returns:
        --------
        pd.DataFrame : History with columns:
            - timestamp: datetime
            - equity: Portfolio value
            - profit_loss: Change in equity ($)
            - profit_loss_pct: Change in equity (%)
        """
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            history = self.trading_client.get_portfolio_history(
                date_start=start_date,
                date_end=end_date,
                timeframe=timeframe
            )

            df = pd.DataFrame({
                'timestamp': pd.to_datetime(history.timestamp, unit='s'),
                'equity': history.equity,
                'profit_loss': history.profit_loss,
                'profit_loss_pct': history.profit_loss_pct,
            })

            return df

        except Exception as e:
            raise Exception(f"Failed to get portfolio history: {str(e)}")

    def calculate_returns(self, days: int = 252) -> pd.Series:
        """
        Calculate daily returns for portfolio.

        Parameters:
        -----------
        days : int
            Lookback period in days

        Returns:
        --------
        pd.Series : Daily returns with datetime index
        """
        try:
            history = self.get_portfolio_history(days=days, timeframe='1Day')

            if history.empty:
                return pd.Series()

            returns = history['equity'].pct_change().dropna()
            returns.index = history['timestamp'][1:]

            return returns

        except Exception as e:
            raise Exception(f"Failed to calculate returns: {str(e)}")

    def get_risk_metrics(self, days: int = 252) -> Dict:
        """
        Calculate portfolio risk metrics.

        Parameters:
        -----------
        days : int
            Lookback period in days

        Returns:
        --------
        dict : Risk metrics:
            - sharpe_ratio: Sharpe ratio (annualized)
            - sortino_ratio: Sortino ratio (annualized)
            - max_drawdown: Maximum drawdown
            - volatility: Annualized volatility
            - var_95: Value at Risk (95% confidence)
            - calmar_ratio: Calmar ratio
            - mean_return: Annualized mean return
            - total_return: Cumulative return
        """
        try:
            returns = self.calculate_returns(days=days)

            if returns.empty or len(returns) < 2:
                return {}

            # Annualization
            periods_per_year = 252

            # Statistics
            mean_return = returns.mean() * periods_per_year
            std_return = returns.std() * np.sqrt(periods_per_year)

            # Sharpe Ratio
            sharpe = mean_return / std_return if std_return > 0 else 0

            # Sortino Ratio
            downside_returns = returns[returns < 0]
            downside_std = downside_returns.std() * np.sqrt(periods_per_year)
            sortino = mean_return / downside_std if downside_std > 0 else 0

            # Maximum Drawdown
            cumulative = (1 + returns).cumprod()
            running_max = cumulative.expanding().max()
            drawdown = (cumulative - running_max) / running_max
            max_drawdown = drawdown.min()

            # Value at Risk (95%)
            var_95 = returns.quantile(0.05)

            # Calmar Ratio
            calmar = (mean_return / abs(max_drawdown)) if max_drawdown != 0 else 0

            # Total Return
            total_return = (cumulative.iloc[-1] - 1) if len(cumulative) > 0 else 0

            return {
                'sharpe_ratio': sharpe,
                'sortino_ratio': sortino,
                'max_drawdown': max_drawdown,
                'volatility': std_return,
                'var_95': var_95,
                'calmar_ratio': calmar,
                'mean_return': mean_return,
                'total_return': total_return,
            }

        except Exception as e:
            raise Exception(f"Failed to calculate risk metrics: {str(e)}")

    def get_trade_history(self, days: int = 30) -> pd.DataFrame:
        """
        Get recent trade history.

        Parameters:
        -----------
        days : int
            Number of days to look back

        Returns:
        --------
        pd.DataFrame : Closed orders with columns:
            - timestamp: Execution time
            - symbol: Stock symbol
            - side: buy/sell
            - qty: Number of shares
            - price: Execution price
            - total_value: Total transaction value
        """
        try:
            from alpaca.trading.requests import GetOrdersRequest
            from alpaca.trading.enums import QueryOrderStatus

            # Get filled orders
            start_date = datetime.now() - timedelta(days=days)

            request = GetOrdersRequest(
                status=QueryOrderStatus.CLOSED,
                limit=500,
                after=start_date
            )

            orders = self.trading_client.get_orders(filter=request)

            if not orders:
                return pd.DataFrame()

            trades_data = []
            for order in orders:
                if order.filled_at:
                    trades_data.append({
                        'timestamp': order.filled_at,
                        'symbol': order.symbol,
                        'side': order.side.value,
                        'qty': float(order.filled_qty or 0),
                        'price': float(order.filled_avg_price or 0),
                        'total_value': float(order.filled_qty or 0) * float(order.filled_avg_price or 0),
                        'order_type': order.type.value,
                        'time_in_force': order.time_in_force.value,
                    })

            df = pd.DataFrame(trades_data)
            df = df.sort_values('timestamp', ascending=False).reset_index(drop=True)

            return df

        except Exception as e:
            raise Exception(f"Failed to get trade history: {str(e)}")
