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
    valuation_house
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
            # Portfolio Snapshot Upload
            portfolio_file = st.file_uploader(
                "Portfolio Snapshot",
                type=['csv', 'xlsx'],
                help="Upload your current portfolio holdings"
            )
            
            if portfolio_file:
                import pandas as pd
                try:
                    if portfolio_file.name.endswith('.csv'):
                        df = pd.read_csv(portfolio_file)
                    else:
                        df = pd.read_excel(portfolio_file)
                    
                    # Save to cache
                    portfolio_data = df.to_dict('records')
                    if save_portfolio_data(portfolio_data):
                        st.success(f"✅ Loaded {len(df)} holdings")
                    else:
                        st.error("❌ Failed to save portfolio data")
                        
                except Exception as e:
                    st.error(f"❌ Error loading file: {e}")
            
            # Trade History Upload
            trade_file = st.file_uploader(
                "Trade History",
                type=['csv', 'xlsx'],
                help="Upload your trade history"
            )
            
            if trade_file:
                import pandas as pd
                try:
                    if trade_file.name.endswith('.csv'):
                        df = pd.read_csv(trade_file)
                    else:
                        df = pd.read_excel(trade_file)
                    
                    if save_trade_history(df):
                        st.success(f"✅ Loaded {len(df)} trades")
                    else:
                        st.error("❌ Failed to save trade history")
                        
                except Exception as e:
                    st.error(f"❌ Error loading file: {e}")
            
            # Account History Upload
            account_file = st.file_uploader(
                "Account History",
                type=['csv', 'xlsx'],
                help="Upload your account value history"
            )
            
            if account_file:
                import pandas as pd
                try:
                    if account_file.name.endswith('.csv'):
                        df = pd.read_csv(account_file)
                    else:
                        df = pd.read_excel(account_file)
                    
                    if save_account_history(df):
                        st.success(f"✅ Loaded {len(df)} records")
                    else:
                        st.error("❌ Failed to save account history")
                        
                except Exception as e:
                    st.error(f"❌ Error loading file: {e}")
        
        # Cache Info
        with st.expander("💾 Cache Status"):
            cache_info = get_cache_info()
            
            for name, info in cache_info.items():
                if info['exists']:
                    st.success(f"✅ {name.title()}: {info['size_kb']:.1f} KB")
                else:
                    st.info(f"ℹ️ {name.title()}: Not loaded")
        
        st.divider()
        
        # About Section
        with st.expander("ℹ️ About"):
            st.markdown(f"""
            **ATLAS Terminal v{VERSION}**
            
            Professional Trading Terminal
            
            **Features:**
            - Real-time portfolio analytics
            - Leverage-adjusted returns
            - Comprehensive risk metrics
            - DCF valuation models
            - Trade journal
            - Risk budget monitoring
            
            **Tech Stack:**
            - Streamlit
            - Plotly
            - pandas / numpy
            - yfinance
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
            st.title("📓 Trade Journal")
            st.info("🚧 NEW FEATURE - Under construction in v10.0")
            st.caption("Coming soon: Trade tracking, performance attribution, win/loss analysis")
            st.markdown("""
            **Planned Features:**
            - Automatic trade detection from history
            - Complete trade lifecycle tracking
            - Performance attribution per trade
            - Win/Loss statistics
            - Trade notes, tags, and strategies
            """)

        elif selected_page == "🎯 Risk Dashboard":
            st.title("🎯 Risk Dashboard")
            st.info("🚧 NEW FEATURE - Under construction in v10.0")
            st.caption("Coming soon: Risk budget monitoring, position risk, stress scenarios")
            st.markdown("""
            **Planned Features:**
            - Risk budget utilization tracking
            - Position-level risk contributions
            - Pre-trade risk assessment
            - Stress testing integration
            - Automated alerts at thresholds
            """)

        else:
            st.error("Unknown page selected")
    
    except Exception as e:
        logger.error(f"Error rendering page: {e}", exc_info=True)
        st.error(f"❌ Error rendering page: {e}")
        st.exception(e)


if __name__ == "__main__":
    main()
