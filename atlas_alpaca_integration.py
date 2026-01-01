"""
ATLAS Terminal - Alpaca Integration Module
===========================================
Full integration of Alpaca Markets API with ATLAS Terminal.
Provides paper trading and live trading capabilities.

Author: Hlobo Mtembu
Version: 1.0
Last Updated: December 2025
"""

import streamlit as st
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

try:
    from alpaca.trading.client import TradingClient
    from alpaca.trading.requests import GetAssetsRequest
    from alpaca.trading.enums import AssetClass, OrderSide, TimeInForce
    from alpaca.data.historical import StockHistoricalDataClient
    from alpaca.data.requests import StockBarsRequest, StockLatestQuoteRequest
    from alpaca.data.timeframe import TimeFrame
    ALPACA_AVAILABLE = True
except ImportError:
    ALPACA_AVAILABLE = False


class AlpacaAdapter:
    """
    Adapter class to integrate Alpaca Markets API with ATLAS Terminal.
    Handles authentication, data fetching, and portfolio synchronization.
    """

    def __init__(self, api_key: str, secret_key: str, paper: bool = True):
        """
        Initialize Alpaca API clients.

        Parameters:
        -----------
        api_key : str
            Alpaca API key
        secret_key : str
            Alpaca secret key
        paper : bool
            Use paper trading (True) or live trading (False)
        """
        # Try dynamic import in case package was installed after module loaded
        try:
            from alpaca.trading.client import TradingClient
            from alpaca.data.historical import StockHistoricalDataClient
        except ImportError as e:
            raise ImportError(
                "alpaca-py package is not installed. "
                "Install it with: pip install alpaca-py\n"
                f"Error: {e}"
            )

        self.api_key = api_key
        self.secret_key = secret_key
        self.paper = paper

        # Initialize clients
        self.trading_client = TradingClient(api_key, secret_key, paper=paper)
        self.data_client = StockHistoricalDataClient(api_key, secret_key)

        # Account mode indicator
        self.account_type = "PAPER" if paper else "LIVE"

    def test_connection(self) -> Tuple[bool, str]:
        """
        Test API connection and credentials.

        Returns:
        --------
        tuple : (success: bool, message: str)
        """
        try:
            account = self.trading_client.get_account()
            status = account.status

            if status == "ACTIVE":
                return True, f"✅ Connected to Alpaca {self.account_type} account"
            else:
                return False, f"⚠️ Account status: {status}"

        except Exception as e:
            return False, f"❌ Connection failed: {str(e)}"

    def get_account_summary(self) -> Dict:
        """
        Get account summary information.

        Returns:
        --------
        dict : Account summary with equity, cash, buying power, etc.
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
                'short_market_value': float(account.short_market_value or 0),
                'equity': float(account.equity),
                'last_equity': float(account.last_equity),
                'initial_margin': float(account.initial_margin or 0),
                'maintenance_margin': float(account.maintenance_margin or 0),
                'daytrade_count': account.daytrade_count,
                'pattern_day_trader': account.pattern_day_trader,
                'currency': account.currency,
            }

        except Exception as e:
            st.error(f"Error fetching account summary: {str(e)}")
            return {}

    def get_positions(self) -> pd.DataFrame:
        """
        Get all current positions in ATLAS-compatible format.

        Returns:
        --------
        pd.DataFrame : Portfolio positions with ATLAS column format:
            - Ticker: Stock ticker symbol
            - Quantity: Number of shares
            - Avg_Cost: Average purchase price
            - Current_Price: Current market price
            - Market_Value: Current position value
            - Purchase_Value: Total cost basis
            - Unrealized_PnL: Unrealized profit/loss ($)
            - Unrealized_PnL_Pct: Unrealized profit/loss (%)
            - Daily_PnL: Daily change in position value ($)
            - Weight_Pct: Portfolio weight (%)
            - Side: long/short
        """
        try:
            positions = self.trading_client.get_all_positions()

            if not positions:
                return pd.DataFrame()

            # Get account for portfolio value and daily P&L calculation
            account = self.get_account_summary()
            portfolio_value = account.get('portfolio_value', 1)

            positions_data = []
            for pos in positions:
                # Calculate daily P&L from intraday data
                qty = float(pos.qty)
                current_price = float(pos.current_price)
                change_today = float(pos.change_today or 0)  # Price change today
                daily_pl = qty * change_today  # Daily P&L in dollars

                positions_data.append({
                    'Ticker': pos.symbol,  # Use 'Ticker' to match ATLAS format
                    'Quantity': qty,
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

            # Sort by weight descending
            df = df.sort_values('Weight_Pct', ascending=False).reset_index(drop=True)

            # Add ATLAS metadata attributes
            df.attrs['source'] = 'alpaca'
            df.attrs['currency'] = 'USD'
            df.attrs['currency_symbol'] = '$'
            df.attrs['account_type'] = self.account_type

            return df

        except Exception as e:
            st.error(f"Error fetching positions: {str(e)}")
            return pd.DataFrame()

    def get_portfolio_history(self, days: int = 30, timeframe: str = '1Day') -> pd.DataFrame:
        """
        Get portfolio equity curve over time.

        Parameters:
        -----------
        days : int
            Number of days of history
        timeframe : str
            Timeframe: '1Min', '5Min', '15Min', '1Hour', '1Day'

        Returns:
        --------
        pd.DataFrame : Portfolio history with columns:
            - timestamp: datetime
            - equity: Portfolio value
            - profit_loss: Change in equity
            - profit_loss_pct: Change in equity (%)
        """
        try:
            # Calculate date range
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # Get portfolio history
            history = self.trading_client.get_portfolio_history(
                date_start=start_date,
                date_end=end_date,
                timeframe=timeframe
            )

            # Convert to DataFrame
            df = pd.DataFrame({
                'timestamp': pd.to_datetime(history.timestamp, unit='s'),
                'equity': history.equity,
                'profit_loss': history.profit_loss,
                'profit_loss_pct': history.profit_loss_pct,
            })

            return df

        except Exception as e:
            st.error(f"Error fetching portfolio history: {str(e)}")
            return pd.DataFrame()

    def get_historical_bars(self,
                           tickers: List[str],
                           start_date: datetime,
                           end_date: datetime = None,
                           timeframe: str = '1Day') -> pd.DataFrame:
        """
        Get historical price data for multiple tickers.

        Parameters:
        -----------
        tickers : list
            List of ticker symbols
        start_date : datetime
            Start date for historical data
        end_date : datetime
            End date (defaults to now)
        timeframe : str
            Bar timeframe: '1Min', '5Min', '15Min', '1Hour', '1Day'

        Returns:
        --------
        pd.DataFrame : Multi-index DataFrame with (ticker, timestamp) index
        """
        try:
            if end_date is None:
                end_date = datetime.now()

            # Map timeframe string to Alpaca TimeFrame enum
            timeframe_map = {
                '1Min': TimeFrame.Minute,
                '5Min': TimeFrame(5, 'Min'),
                '15Min': TimeFrame(15, 'Min'),
                '1Hour': TimeFrame.Hour,
                '1Day': TimeFrame.Day,
            }

            tf = timeframe_map.get(timeframe, TimeFrame.Day)

            # Create request
            request = StockBarsRequest(
                symbol_or_symbols=tickers,
                timeframe=tf,
                start=start_date,
                end=end_date
            )

            # Get bars
            bars = self.data_client.get_stock_bars(request)

            # Convert to DataFrame
            df = bars.df

            return df

        except Exception as e:
            st.error(f"Error fetching historical bars: {str(e)}")
            return pd.DataFrame()

    def get_latest_quotes(self, tickers: List[str]) -> Dict[str, float]:
        """
        Get latest prices for tickers.

        Parameters:
        -----------
        tickers : list
            List of ticker symbols

        Returns:
        --------
        dict : {ticker: price}
        """
        try:
            request = StockLatestQuoteRequest(symbol_or_symbols=tickers)
            quotes = self.data_client.get_stock_latest_quote(request)

            prices = {}
            for ticker in tickers:
                if ticker in quotes:
                    # Use mid-price (average of bid and ask)
                    bid = float(quotes[ticker].bid_price)
                    ask = float(quotes[ticker].ask_price)
                    prices[ticker] = (bid + ask) / 2

            return prices

        except Exception as e:
            st.error(f"Error fetching latest quotes: {str(e)}")
            return {}

    def calculate_returns(self, days: int = 252) -> pd.Series:
        """
        Calculate daily returns for portfolio.

        Parameters:
        -----------
        days : int
            Number of days of history

        Returns:
        --------
        pd.Series : Daily returns
        """
        try:
            history = self.get_portfolio_history(days=days, timeframe='1Day')

            if history.empty:
                return pd.Series()

            # Calculate returns
            returns = history['equity'].pct_change().dropna()
            returns.index = history['timestamp'][1:]

            return returns

        except Exception as e:
            st.error(f"Error calculating returns: {str(e)}")
            return pd.Series()

    def get_risk_metrics(self, days: int = 252) -> Dict:
        """
        Calculate portfolio risk metrics.

        Parameters:
        -----------
        days : int
            Lookback period in days

        Returns:
        --------
        dict : Risk metrics including Sharpe, Sortino, max drawdown, etc.
        """
        try:
            returns = self.calculate_returns(days=days)

            if returns.empty or len(returns) < 2:
                return {}

            # Annualization factor
            periods_per_year = 252

            # Basic statistics
            mean_return = returns.mean() * periods_per_year
            std_return = returns.std() * np.sqrt(periods_per_year)

            # Sharpe Ratio (assuming 0% risk-free rate)
            sharpe = mean_return / std_return if std_return > 0 else 0

            # Sortino Ratio (downside deviation)
            downside_returns = returns[returns < 0]
            downside_std = downside_returns.std() * np.sqrt(periods_per_year)
            sortino = mean_return / downside_std if downside_std > 0 else 0

            # Maximum Drawdown
            cumulative = (1 + returns).cumprod()
            running_max = cumulative.expanding().max()
            drawdown = (cumulative - running_max) / running_max
            max_drawdown = drawdown.min()

            # Volatility
            volatility = std_return

            # Value at Risk (95% confidence)
            var_95 = returns.quantile(0.05)

            # Calmar Ratio
            calmar = (mean_return / abs(max_drawdown)) if max_drawdown != 0 else 0

            return {
                'sharpe_ratio': sharpe,
                'sortino_ratio': sortino,
                'max_drawdown': max_drawdown,
                'volatility': volatility,
                'var_95': var_95,
                'calmar_ratio': calmar,
                'mean_return': mean_return,
                'std_return': std_return,
                'total_return': (cumulative.iloc[-1] - 1) if len(cumulative) > 0 else 0,
            }

        except Exception as e:
            st.error(f"Error calculating risk metrics: {str(e)}")
            return {}

    def search_assets(self, query: str, asset_class: str = "us_equity") -> pd.DataFrame:
        """
        Search for tradeable assets.

        Parameters:
        -----------
        query : str
            Search term (ticker or name)
        asset_class : str
            Asset class filter

        Returns:
        --------
        pd.DataFrame : Matching assets
        """
        try:
            request = GetAssetsRequest(asset_class=AssetClass.US_EQUITY)
            assets = self.trading_client.get_all_assets(request)

            # Filter by query
            matches = []
            for asset in assets:
                if (query.upper() in asset.symbol.upper() or
                    query.upper() in asset.name.upper()):
                    matches.append({
                        'symbol': asset.symbol,
                        'name': asset.name,
                        'exchange': asset.exchange,
                        'tradable': asset.tradable,
                        'status': asset.status,
                    })

            return pd.DataFrame(matches)

        except Exception as e:
            st.error(f"Error searching assets: {str(e)}")
            return pd.DataFrame()


def setup_alpaca_integration():
    """
    Streamlit UI component for Alpaca setup/configuration.
    """
    st.subheader("🦙 Alpaca Markets Integration")

    # Check if already configured
    if 'alpaca_configured' in st.session_state and st.session_state.alpaca_configured:
        col1, col2 = st.columns([3, 1])
        with col1:
            st.success("✅ Alpaca account connected")

            # Show account summary
            if 'alpaca_adapter' in st.session_state:
                adapter = st.session_state.alpaca_adapter
                account = adapter.get_account_summary()

                st.metric("Portfolio Value", f"${account.get('portfolio_value', 0):,.2f}")
                st.metric("Cash Balance", f"${account.get('cash', 0):,.2f}")
                st.caption(f"Account Type: {account.get('account_type', 'UNKNOWN')}")

        with col2:
            if st.button("Disconnect", type="secondary"):
                st.session_state.alpaca_configured = False
                if 'alpaca_adapter' in st.session_state:
                    del st.session_state.alpaca_adapter
                st.rerun()

        return st.session_state.alpaca_adapter

    # Configuration flow
    st.markdown("""
    Connect your Alpaca Markets account to sync your portfolio with ATLAS Terminal.

    **Benefits:**
    - 📊 Automatic portfolio synchronization
    - 📈 Real-time position tracking
    - 🌍 Global market access (US stocks, ETFs)
    - 🧪 Paper trading for testing strategies
    - 💰 Commission-free trading

    ---

    ### Step 1: Get API Keys

    1. Sign up at [alpaca.markets](https://alpaca.markets) (free account)
    2. Navigate to **Paper Trading** dashboard
    3. Generate API keys (View → API Keys → Generate)
    4. Copy your **API Key** and **Secret Key**

    ⚠️ **Security Note:** Your keys are stored locally and never transmitted to ATLAS servers.
    """)

    # API Key input
    with st.expander("🔑 Enter API Credentials", expanded=True):
        api_key = st.text_input(
            "API Key",
            type="password",
            help="Your Alpaca API Key ID"
        )

        secret_key = st.text_input(
            "Secret Key",
            type="password",
            help="Your Alpaca Secret Key"
        )

        account_type = st.radio(
            "Account Type",
            ["Paper Trading (Recommended)", "Live Trading"],
            help="Paper trading uses virtual money for testing. Live trading uses real money."
        )

        use_paper = account_type == "Paper Trading (Recommended)"

    # Test connection
    if api_key and secret_key:
        if st.button("🔗 Connect to Alpaca", type="primary"):
            with st.spinner("Connecting to Alpaca..."):
                try:
                    # Initialize adapter
                    adapter = AlpacaAdapter(api_key, secret_key, paper=use_paper)

                    # Test connection
                    success, message = adapter.test_connection()

                    if success:
                        st.success(message)

                        # Store in session state
                        st.session_state.alpaca_configured = True
                        st.session_state.alpaca_adapter = adapter
                        st.session_state.alpaca_api_key = api_key
                        st.session_state.alpaca_secret_key = secret_key
                        st.session_state.alpaca_paper = use_paper

                        # Show account summary
                        account = adapter.get_account_summary()
                        st.info(f"""
                        **Account Connected:**
                        - Type: {account['account_type']}
                        - Status: {account['status']}
                        - Portfolio Value: ${account['portfolio_value']:,.2f}
                        - Cash: ${account['cash']:,.2f}
                        """)

                        st.balloons()
                        st.rerun()

                    else:
                        st.error(message)
                        st.info("Please check your API credentials and try again.")

                except Exception as e:
                    st.error(f"Connection failed: {str(e)}")
                    st.info("Common issues:\n- Invalid API keys\n- Network connection\n- Account not activated")

    return None


def display_alpaca_portfolio_overview(adapter: AlpacaAdapter):
    """
    Display Alpaca portfolio overview in ATLAS Terminal format.
    """
    st.subheader("📊 Portfolio Overview")

    # Account metrics
    account = adapter.get_account_summary()

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric(
            "Portfolio Value",
            f"${account['portfolio_value']:,.2f}",
            delta=f"${account['portfolio_value'] - account['last_equity']:,.2f}"
        )

    with col2:
        st.metric(
            "Cash",
            f"${account['cash']:,.2f}"
        )

    with col3:
        st.metric(
            "Buying Power",
            f"${account['buying_power']:,.2f}"
        )

    with col4:
        day_change_pct = ((account['portfolio_value'] / account['last_equity']) - 1) * 100
        st.metric(
            "Today's Change",
            f"{day_change_pct:+.2f}%"
        )

    # Positions table
    st.markdown("---")
    st.subheader("📈 Current Positions")

    positions = adapter.get_positions()

    if positions.empty:
        st.info("No positions found. Your portfolio is currently empty.")
    else:
        # Format for display
        display_df = positions[['ticker', 'quantity', 'avg_cost', 'current_price',
                               'market_value', 'unrealized_pl', 'unrealized_plpc', 'weight']].copy()

        # Format columns
        display_df['avg_cost'] = display_df['avg_cost'].apply(lambda x: f"${x:.2f}")
        display_df['current_price'] = display_df['current_price'].apply(lambda x: f"${x:.2f}")
        display_df['market_value'] = display_df['market_value'].apply(lambda x: f"${x:,.2f}")
        display_df['unrealized_pl'] = display_df['unrealized_pl'].apply(lambda x: f"${x:+,.2f}")
        display_df['unrealized_plpc'] = display_df['unrealized_plpc'].apply(lambda x: f"{x:+.2f}%")
        display_df['weight'] = display_df['weight'].apply(lambda x: f"{x:.2f}%")

        # Rename columns
        display_df.columns = ['Ticker', 'Shares', 'Avg Cost', 'Price', 'Value',
                             'P&L ($)', 'P&L (%)', 'Weight']

        st.dataframe(display_df, use_container_width=True, hide_index=True)

        # Summary stats
        total_pl = positions['unrealized_pl'].sum()
        total_plpc = (total_pl / positions['cost_basis'].sum()) * 100

        col1, col2 = st.columns(2)
        with col1:
            st.metric("Total Unrealized P&L", f"${total_pl:+,.2f}")
        with col2:
            st.metric("Total Return", f"{total_plpc:+.2f}%")
