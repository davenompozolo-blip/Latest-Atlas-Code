"""
ATLAS Terminal Beta v1.0.0
Professional Portfolio Analytics Platform

Clean, focused, production-ready version built from ATLAS v10.0
"""

import streamlit as st
from streamlit_option_menu import option_menu

VERSION = "1.0.0-beta.1"
RELEASE_DATE = "2026-01-09"

# Page configuration
st.set_page_config(
    page_title=f"ATLAS Terminal {VERSION}",
    page_icon="🔥",
    layout="wide",
    initial_sidebar_state="expanded"
)

def main():
    """Main application entry point"""

    # Initialize session state
    if 'initialized' not in st.session_state:
        st.session_state.initialized = True
        st.session_state.connected = False

    # Sidebar
    with st.sidebar:
        st.title("🔥 ATLAS Terminal")
        st.caption(f"v{VERSION} Beta")
        st.caption(f"Released: {RELEASE_DATE}")

        st.markdown("---")

        # Broker connection
        handle_broker_connection()

        st.markdown("---")

        # Navigation (only show if connected)
        if st.session_state.connected:
            page = option_menu(
                menu_title="Navigation",
                options=[
                    "🔥 Phoenix Parser",
                    "🏠 Dashboard",
                    "📊 Portfolio",
                    "⚠️ Risk Analysis",
                    "💼 Trade History",
                    "💎 Performance Suite",
                    "🌍 Market Watch",
                    "🎲 Monte Carlo",
                    "🧮 Optimizer",
                    "📊 Leverage",
                    "⚙️ Settings"
                ],
                icons=['fire', 'house', 'bar-chart', 'exclamation-triangle', 'receipt',
                       'gem', 'globe', 'dice-5', 'calculator', 'graph-up', 'gear'],
                menu_icon="cast",
                default_index=1,  # Default to Dashboard
            )
        else:
            page = None

        # Footer
        st.markdown("---")
        st.caption("Built with ❤️ by Hlobo Nompozolo")

    # Main content area
    if not st.session_state.connected:
        show_welcome()
    elif page == "🔥 Phoenix Parser":
        from pages import phoenix
        phoenix.render()
    elif page == "🏠 Dashboard":
        from pages import home
        home.render()
    elif page == "📊 Portfolio":
        from pages import portfolio
        portfolio.render()
    elif page == "⚠️ Risk Analysis":
        from pages import risk
        risk.render()
    elif page == "💼 Trade History":
        from pages import trades
        trades.render()
    elif page == "💎 Performance Suite":
        from pages import performance
        performance.render()
    elif page == "🌍 Market Watch":
        from pages import market_watch
        market_watch.render()
    elif page == "🎲 Monte Carlo":
        from pages import monte_carlo
        monte_carlo.render()
    elif page == "🧮 Optimizer":
        from pages import optimizer
        optimizer.render()
    elif page == "📊 Leverage":
        from pages import leverage
        leverage.render()
    elif page == "⚙️ Settings":
        from pages import settings
        settings.render()

def handle_broker_connection():
    """Handle Alpaca connection in sidebar"""

    if not st.session_state.connected:
        st.info("👇 Connect to get started")

        if st.button("🦙 Connect Alpaca", type="primary", use_container_width=True):
            try:
                from integrations.alpaca_adapter import AlpacaAdapter

                # Get credentials from secrets
                api_key = st.secrets["alpaca"]["api_key"]
                secret_key = st.secrets["alpaca"]["secret_key"]

                # Create adapter
                adapter = AlpacaAdapter(api_key, secret_key, paper=True)

                # Test connection
                success, msg = adapter.test_connection()

                if success:
                    st.session_state.connected = True
                    st.session_state.adapter = adapter
                    st.success(msg)
                    st.rerun()
                else:
                    st.error(msg)

            except Exception as e:
                st.error(f"Connection failed: {str(e)}")
    else:
        # Show connected state
        try:
            adapter = st.session_state.adapter
            account = adapter.get_account_summary()

            st.success("✅ Connected")

            col1, col2 = st.columns(2)
            with col1:
                st.metric("Portfolio", f"${account['portfolio_value']:,.0f}")
            with col2:
                st.metric("Cash", f"${account['cash']:,.0f}")

            if st.button("🔌 Disconnect", use_container_width=True):
                st.session_state.connected = False
                del st.session_state.adapter
                st.rerun()

        except Exception as e:
            st.error(f"Error: {str(e)}")

def show_welcome():
    """Welcome screen for non-connected users"""

    st.title("🔥 Welcome to ATLAS Terminal")
    st.markdown("### Professional Portfolio Analytics Platform")

    st.markdown("---")

    # Features overview
    col1, col2, col3 = st.columns(3)

    with col1:
        st.markdown("""
        #### 📊 Portfolio Tracking
        - Real-time positions
        - P&L tracking
        - Allocation analysis
        - Trade history
        """)

    with col2:
        st.markdown("""
        #### ⚠️ Risk Analytics
        - Sharpe ratio
        - Value at Risk (VaR)
        - Maximum drawdown
        - Volatility metrics
        """)

    with col3:
        st.markdown("""
        #### 📈 Performance
        - Returns analysis
        - Equity curve
        - Trade statistics
        - Win rate & R:R
        """)

    st.markdown("---")

    st.info("👈 **Connect your Alpaca account in the sidebar to get started**")

    # Version info
    st.caption(f"ATLAS Terminal Beta v{VERSION} | Released {RELEASE_DATE}")

if __name__ == "__main__":
    main()
