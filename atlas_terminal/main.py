"""
ATLAS Terminal v10.0 - Main Entry Point
Professional Trading Terminal with Advanced Analytics

Run with: streamlit run atlas_terminal/main.py
"""

import streamlit as st
import sys
from pathlib import Path
import logging

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from atlas_terminal.config import VERSION, COLORS, CHART_THEME
from atlas_terminal.pages import (
    home,
    market_watch,
    risk_analysis,
    portfolio_deep_dive,
    valuation_house,
    trade_journal,
    risk_dashboard
)
from atlas_terminal.data.cache_manager import (
    load_portfolio_data, load_account_history, load_trade_history,
    save_portfolio_data, save_account_history, save_trade_history,
    get_cache_info
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def configure_page():
    """Configure Streamlit page settings"""
    st.set_page_config(
        page_title=f"ATLAS Terminal v{VERSION}",
        page_icon="📊",
        layout="wide",
        initial_sidebar_state="expanded"
    )
    
    # Custom CSS for dark theme
    st.markdown(f"""
        <style>
        .main {{
            background-color: {COLORS['background']};
        }}
        .stMetric {{
            background-color: {COLORS['card_background']};
            padding: 1rem;
            border-radius: 0.5rem;
            border: 1px solid {COLORS['border']};
        }}
        .stMetric label {{
            color: {COLORS['text_secondary']} !important;
        }}
        .stMetric value {{
            color: {COLORS['neon_blue']} !important;
        }}
        </style>
    """, unsafe_allow_html=True)


def render_sidebar():
    """Render sidebar with navigation and data upload"""
    
    with st.sidebar:
        st.title("📊 ATLAS Terminal")
        st.caption(f"Version {VERSION}")
        
        st.divider()
        
        # Navigation
        st.subheader("Navigation")
        
        page = st.radio(
            "Select Page:",
            [
                "🏠 Portfolio Home",
                "📈 Portfolio Deep Dive",
                "🌍 Market Watch",
                "⚠️ Risk Analysis",
                "💰 Valuation House",
                "📓 Trade Journal",
                "🎯 Risk Dashboard"
            ],
            key="navigation"
        )
        
        st.divider()

        # Data Upload Section
        st.subheader("📁 Data Management")

        with st.expander("Upload Data", expanded=False):
            st.markdown("""
            **Upload your trading data:**
            - **Trade History**: Your portfolio will be automatically built from your trades
            - **Account History**: Used for performance tracking and reconciliation
            """)

            st.divider()

            # Trade History Upload
            trade_file = st.file_uploader(
                "📊 Trade History (Required)",
                type=['csv', 'xlsx'],
                help="Upload your complete trade history - portfolio positions will be calculated from this",
                key="trade_uploader"
            )

            if trade_file:
                import pandas as pd
                try:
                    if trade_file.name.endswith('.csv'):
                        df = pd.read_csv(trade_file)
                    else:
                        df = pd.read_excel(trade_file)

                    if save_trade_history(df):
                        st.success(f"✅ Loaded {len(df)} trades - Portfolio will be built from this data")

                        # Auto-build portfolio from trades
                        from atlas_terminal.data.parsers import build_portfolio_from_trades

                        # Build current positions from trade history
                        portfolio_df = build_portfolio_from_trades(df)

                        if portfolio_df is not None and not portfolio_df.empty:
                            # Convert to list of dicts for caching
                            portfolio_data = portfolio_df.to_dict('records')
                            save_portfolio_data(portfolio_data)
                            st.info(f"📈 Built portfolio with {len(portfolio_df)} open positions from trades")
                        else:
                            st.warning("⚠️ No open positions found in trade history")
                    else:
                        st.error("❌ Failed to save trade history")

                except Exception as e:
                    st.error(f"❌ Error loading trade history: {e}")
                    logger.error(f"Trade history upload error: {e}", exc_info=True)

            # Account History Upload
            account_file = st.file_uploader(
                "💰 Account/Performance History (Optional)",
                type=['csv', 'xlsx'],
                help="Upload your account value over time for performance tracking and reconciliation",
                key="account_uploader"
            )

            if account_file:
                import pandas as pd
                try:
                    if account_file.name.endswith('.csv'):
                        df = pd.read_csv(account_file)
                    else:
                        df = pd.read_excel(account_file)

                    if save_account_history(df):
                        st.success(f"✅ Loaded {len(df)} performance records")
                    else:
                        st.error("❌ Failed to save account history")

                except Exception as e:
                    st.error(f"❌ Error loading account history: {e}")
                    logger.error(f"Account history upload error: {e}", exc_info=True)

        # Cache Info
        with st.expander("💾 Cache Status"):
            cache_info = get_cache_info()

            for name, info in cache_info.items():
                if info['exists']:
                    if name == 'portfolio':
                        st.success(f"✅ Portfolio (Built from Trades): {info['size_kb']:.1f} KB")
                    elif name == 'trade_history':
                        st.success(f"✅ Trade History: {info['size_kb']:.1f} KB")
                    elif name == 'account_history':
                        st.success(f"✅ Performance History: {info['size_kb']:.1f} KB")
                    else:
                        st.success(f"✅ {name.title()}: {info['size_kb']:.1f} KB")
                else:
                    if name == 'portfolio':
                        st.warning(f"⚠️ Portfolio: Upload Trade History to build")
                    elif name == 'trade_history':
                        st.info(f"ℹ️ Trade History: Not loaded (Required)")
                    elif name == 'account_history':
                        st.info(f"ℹ️ Performance History: Not loaded (Optional)")
                    else:
                        st.info(f"ℹ️ {name.title()}: Not loaded")
        
        st.divider()
        
        # About Section
        with st.expander("ℹ️ About"):
            st.markdown(f"""
            **ATLAS Terminal v{VERSION}**

            Professional Trading Terminal

            **How It Works:**
            1. Upload your **Trade History** (CSV/Excel)
            2. Portfolio positions are **automatically calculated** from trades
            3. Optionally upload **Performance History** for reconciliation
            4. Navigate through 7 analytical dashboards

            **Features:**
            - Auto-build portfolio from trade history
            - Real-time portfolio analytics
            - Leverage-adjusted returns
            - Comprehensive risk metrics (VaR, CVaR, Sharpe, etc.)
            - DCF valuation models
            - Trade journal with P&L tracking
            - Risk budget monitoring

            **Tech Stack:**
            - Streamlit + Plotly
            - pandas / numpy / scipy
            - yfinance (real-time data)
            - networkx (correlation analysis)
            """)
        
        return page


def main():
    """Main application entry point"""
    
    # Configure page
    configure_page()
    
    # Render sidebar and get selected page
    selected_page = render_sidebar()
    
    # Route to appropriate page
    try:
        if selected_page == "🏠 Portfolio Home":
            home.render()

        elif selected_page == "📈 Portfolio Deep Dive":
            portfolio_deep_dive.render()

        elif selected_page == "🌍 Market Watch":
            market_watch.render()

        elif selected_page == "⚠️ Risk Analysis":
            risk_analysis.render()

        elif selected_page == "💰 Valuation House":
            valuation_house.render()

        elif selected_page == "📓 Trade Journal":
            trade_journal.render()

        elif selected_page == "🎯 Risk Dashboard":
            risk_dashboard.render()

        else:
            st.error("Unknown page selected")
    
    except Exception as e:
        logger.error(f"Error rendering page: {e}", exc_info=True)
        st.error(f"❌ Error rendering page: {e}")
        st.exception(e)


if __name__ == "__main__":
    main()
