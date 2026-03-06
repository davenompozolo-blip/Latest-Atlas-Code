"""
ATLAS Terminal - Broker Integration Manager
============================================
Unified interface for selecting and managing broker connections.
Supports: Manual Entry, Easy Equities, Alpaca Markets

Author: Hlobo Mtembu
Version: 1.0
Last Updated: December 2025
"""

import streamlit as st
import pandas as pd
from typing import Optional, Dict
from datetime import datetime

# Import broker adapters
try:
    from atlas_alpaca_integration import AlpacaAdapter, setup_alpaca_integration
    ALPACA_AVAILABLE = True
except ImportError:
    ALPACA_AVAILABLE = False

# Placeholder for Easy Equities (to be implemented)
try:
    from easy_equities_integration import EasyEquitiesAdapter, setup_easy_equities_integration
    EE_AVAILABLE = True
except ImportError:
    EE_AVAILABLE = False


class BrokerManager:
    """
    Central manager for all broker integrations in ATLAS Terminal.
    Handles broker selection, configuration, and data retrieval.
    """

    BROKER_OPTIONS = {
        'manual': {
            'name': 'Manual Entry',
            'icon': '✏️',
            'description': 'Manually input your positions and transactions',
            'features': ['Full control', 'No API required', 'Works offline'],
            'limitations': ['Manual updates', 'No auto-sync'],
            'cost': 'Free',
            'available': True,
        },
        'easy_equities': {
            'name': 'Easy Equities',
            'icon': '🇿🇦',
            'description': 'Sync with your Easy Equities account (South Africa)',
            'features': ['Auto-sync', 'Real-time data', 'JSE & US markets'],
            'limitations': ['SA residents only', 'Requires API access'],
            'cost': 'Free',
            'available': EE_AVAILABLE,
        },
        'alpaca': {
            'name': 'Alpaca Markets',
            'icon': '🦙',
            'description': 'Commission-free trading with global access',
            'features': ['Paper trading', 'US markets', 'Commission-free', 'API access'],
            'limitations': ['US stocks only', 'Requires account'],
            'cost': 'Free',
            'available': ALPACA_AVAILABLE,
        },
    }

    def __init__(self):
        """Initialize the broker manager."""
        self._initialize_session_state()

    def _initialize_session_state(self):
        """Initialize session state variables."""
        if 'active_broker' not in st.session_state:
            st.session_state.active_broker = None

        if 'broker_adapters' not in st.session_state:
            st.session_state.broker_adapters = {}

    def display_broker_selection(self):
        """
        Display broker selection interface.
        Returns the selected broker adapter or None.
        """
        # Show current selection
        if st.session_state.active_broker:
            return self._get_active_adapter()

        # Broker selection interface
        st.markdown("### 🏦 Connect Your Portfolio")
        st.markdown("Choose how you want to connect your portfolio to ATLAS Terminal.")

        # Display broker cards
        cols = st.columns(3)

        for idx, (broker_key, broker_info) in enumerate(self.BROKER_OPTIONS.items()):
            with cols[idx]:
                self._display_broker_card(broker_key, broker_info)

        st.markdown("---")

        # Comparison table
        with st.expander("📊 Compare Broker Options", expanded=False):
            self._display_comparison_table()

        return None

    def _display_broker_card(self, broker_key: str, info: Dict):
        """Display a broker option card."""
        with st.container():
            # Card header
            st.markdown(f"#### {info['icon']} {info['name']}")

            # Availability
            if not info['available']:
                st.error("❌ Not Available")
                st.caption("Integration not installed")
                return

            # Description
            st.caption(info['description'])

            # Features
            st.markdown("**Features:**")
            for feature in info['features']:
                st.markdown(f"- ✅ {feature}")

            # Cost
            st.markdown(f"**Cost:** {info['cost']}")

            # Select button
            if st.button(
                f"Select {info['name']}",
                key=f"select_{broker_key}",
                type="primary",
                use_container_width=True
            ):
                self._select_broker(broker_key)
                st.rerun()

    def display_active_broker_status(self):
        """Display currently active broker with option to switch."""
        if not st.session_state.active_broker:
            return

        broker_key = st.session_state.active_broker
        info = self.BROKER_OPTIONS[broker_key]

        col1, col2 = st.columns([3, 1])

        with col1:
            st.success(f"{info['icon']} **Connected:** {info['name']}")

        with col2:
            if st.button("Switch", type="secondary", key="switch_broker"):
                self._deactivate_broker()
                st.rerun()

    def _select_broker(self, broker_key: str):
        """Select and activate a broker."""
        st.session_state.active_broker = broker_key

        # Initialize broker-specific setup
        if broker_key == 'manual':
            self._setup_manual_entry()
        elif broker_key == 'easy_equities':
            self._setup_easy_equities()
        elif broker_key == 'alpaca':
            self._setup_alpaca()

    def _deactivate_broker(self):
        """Deactivate current broker."""
        st.session_state.active_broker = None

        # Clear broker-specific session state
        keys_to_clear = [
            'alpaca_configured', 'alpaca_adapter',
            'ee_configured', 'ee_adapter',
            'manual_portfolio', 'manual_configured',
        ]

        for key in keys_to_clear:
            if key in st.session_state:
                del st.session_state[key]

    def _setup_manual_entry(self):
        """Setup manual portfolio entry."""
        st.session_state.manual_configured = True

        if 'manual_portfolio' not in st.session_state:
            st.session_state.manual_portfolio = pd.DataFrame(columns=[
                'ticker', 'quantity', 'avg_cost', 'date_purchased'
            ])

    def _setup_easy_equities(self):
        """Setup Easy Equities integration."""
        if EE_AVAILABLE:
            # Call EE setup function
            adapter = setup_easy_equities_integration()
            if adapter:
                st.session_state.broker_adapters['easy_equities'] = adapter
        else:
            st.error("Easy Equities integration not available")
            self._deactivate_broker()

    def _setup_alpaca(self):
        """Setup Alpaca integration."""
        if ALPACA_AVAILABLE:
            # Call Alpaca setup function
            adapter = setup_alpaca_integration()
            if adapter:
                st.session_state.broker_adapters['alpaca'] = adapter
        else:
            st.error("⚠️ Alpaca integration not available. Install: `pip install alpaca-py`")
            self._deactivate_broker()

    def _get_active_adapter(self):
        """Get the active broker adapter."""
        broker_key = st.session_state.active_broker

        if broker_key == 'manual':
            return ManualPortfolioAdapter()
        elif broker_key in st.session_state.broker_adapters:
            return st.session_state.broker_adapters[broker_key]

        return None

    def _display_comparison_table(self):
        """Display detailed comparison of broker options."""
        comparison_data = {
            'Feature': [
                'Auto-Sync',
                'Real-time Prices',
                'Transaction History',
                'Paper Trading',
                'Commission-Free',
                'Global Access',
                'API Access',
                'Offline Mode',
                'Setup Time',
            ],
            'Manual Entry': [
                '❌', '❌', '✅', '❌', 'N/A', '✅', 'N/A', '✅', '< 1 min'
            ],
            'Easy Equities': [
                '✅', '✅', '✅', '❌', '❌', 'Limited', '✅', '❌', '5-10 min'
            ],
            'Alpaca Markets': [
                '✅', '✅', '✅', '✅', '✅', 'US only', '✅', '❌', '10-15 min'
            ],
        }

        df = pd.DataFrame(comparison_data)
        st.dataframe(df, use_container_width=True, hide_index=True)


class ManualPortfolioAdapter:
    """
    Adapter for manual portfolio entry.
    Provides same interface as broker adapters for consistency.
    """

    def __init__(self):
        """Initialize manual portfolio adapter."""
        if 'manual_portfolio' not in st.session_state:
            st.session_state.manual_portfolio = pd.DataFrame(columns=[
                'ticker', 'quantity', 'avg_cost', 'date_purchased'
            ])

    def get_positions(self) -> pd.DataFrame:
        """Get manually entered positions."""
        if st.session_state.manual_portfolio.empty:
            return pd.DataFrame()

        # Get current prices (basic implementation - could be enhanced with yfinance)
        portfolio = st.session_state.manual_portfolio.copy()

        # Add calculated columns for compatibility
        if not portfolio.empty:
            # For now, use avg_cost as current_price (can be enhanced later)
            portfolio['current_price'] = portfolio['avg_cost']
            portfolio['market_value'] = portfolio['quantity'] * portfolio['current_price']
            portfolio['cost_basis'] = portfolio['quantity'] * portfolio['avg_cost']
            portfolio['unrealized_pl'] = portfolio['market_value'] - portfolio['cost_basis']
            portfolio['unrealized_plpc'] = (portfolio['unrealized_pl'] / portfolio['cost_basis']) * 100

            # Calculate weights
            total_value = portfolio['market_value'].sum()
            portfolio['weight'] = (portfolio['market_value'] / total_value) * 100 if total_value > 0 else 0

        return portfolio

    def get_account_summary(self) -> Dict:
        """Get account summary for manual portfolio."""
        positions = self.get_positions()

        if positions.empty:
            return {
                'portfolio_value': 0,
                'cash': 0,
                'buying_power': 0,
                'account_type': 'MANUAL',
            }

        return {
            'portfolio_value': positions['market_value'].sum(),
            'cash': 0,  # Not tracked in manual mode
            'buying_power': 0,  # Not tracked in manual mode
            'account_type': 'MANUAL',
        }

    def add_position(self, ticker: str, quantity: float, avg_cost: float, date_purchased: str = None):
        """Add a new position."""
        if date_purchased is None:
            date_purchased = datetime.now().strftime('%Y-%m-%d')

        new_position = pd.DataFrame([{
            'ticker': ticker.upper(),
            'quantity': quantity,
            'avg_cost': avg_cost,
            'date_purchased': date_purchased,
        }])

        st.session_state.manual_portfolio = pd.concat(
            [st.session_state.manual_portfolio, new_position],
            ignore_index=True
        )

    def remove_position(self, ticker: str):
        """Remove a position."""
        st.session_state.manual_portfolio = st.session_state.manual_portfolio[
            st.session_state.manual_portfolio['ticker'] != ticker.upper()
        ]

    def update_position(self, ticker: str, quantity: float = None, avg_cost: float = None):
        """Update an existing position."""
        mask = st.session_state.manual_portfolio['ticker'] == ticker.upper()

        if quantity is not None:
            st.session_state.manual_portfolio.loc[mask, 'quantity'] = quantity

        if avg_cost is not None:
            st.session_state.manual_portfolio.loc[mask, 'avg_cost'] = avg_cost


def display_manual_portfolio_editor():
    """
    Streamlit UI for manual portfolio entry and editing.
    """
    st.subheader("✏️ Manual Portfolio Entry")

    adapter = ManualPortfolioAdapter()

    # Add new position
    with st.expander("➕ Add New Position", expanded=False):
        col1, col2, col3 = st.columns(3)

        with col1:
            ticker = st.text_input("Ticker Symbol", placeholder="AAPL", key="manual_ticker")

        with col2:
            quantity = st.number_input("Quantity", min_value=0.0, step=1.0, key="manual_quantity")

        with col3:
            avg_cost = st.number_input("Average Cost", min_value=0.0, step=0.01, key="manual_avg_cost")

        if st.button("Add Position", type="primary", key="manual_add"):
            if ticker and quantity > 0 and avg_cost > 0:
                adapter.add_position(ticker, quantity, avg_cost)
                st.success(f"Added {quantity} shares of {ticker}")
                st.rerun()
            else:
                st.error("Please fill in all fields")

    # Display current positions
    st.markdown("---")
    st.subheader("📊 Current Positions")

    positions = adapter.get_positions()

    if positions.empty:
        st.info("No positions added yet. Add your first position above.")
    else:
        # Display positions table
        display_cols = ['ticker', 'quantity', 'avg_cost', 'date_purchased']
        display_df = positions[display_cols].copy()
        display_df.columns = ['Ticker', 'Quantity', 'Avg Cost', 'Date Purchased']

        st.dataframe(display_df, use_container_width=True, hide_index=True)

        # Edit/Delete options
        st.markdown("---")
        st.subheader("🛠️ Manage Positions")

        ticker_to_manage = st.selectbox(
            "Select position to manage",
            options=positions['ticker'].tolist(),
            key="manual_manage_ticker"
        )

        col1, col2 = st.columns(2)

        with col1:
            if st.button("🗑️ Delete Position", type="secondary", key="manual_delete"):
                adapter.remove_position(ticker_to_manage)
                st.success(f"Deleted {ticker_to_manage}")
                st.rerun()

        with col2:
            if st.button("✏️ Edit Position", key="manual_edit"):
                st.info("Edit functionality - coming soon!")
