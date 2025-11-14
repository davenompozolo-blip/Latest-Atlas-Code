"""
Market Watch Page
Comprehensive global market monitoring dashboard
"""

import streamlit as st
import pandas as pd
import logging

from ..data.fetchers import fetch_market_watch_data
from ..visualizations.formatters import ATLASFormatter
from ..visualizations.charts import create_dynamic_market_table, create_yield_curve
from ..config import (
    GLOBAL_INDICES,
    CRYPTOCURRENCIES,
    POPULAR_ETFS,
    COMMODITIES,
    POPULAR_STOCKS,
    BOND_YIELDS,
    CREDIT_SPREADS,
    VERSION
)

logger = logging.getLogger(__name__)


def render():
    """Render the Market Watch page"""
    
    st.markdown("## 🌍 MARKET WATCH - EXCELLENCE EDITION")
    st.markdown("*Your comprehensive window into global markets, crypto, bonds, and credit conditions*")
    
    st.markdown("---")
    st.markdown("### 🔍 Filters & Settings")
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        filter_change = st.slider("Min Change %", -10.0, 10.0, -10.0)
    with col2:
        sort_by = st.selectbox("Sort By", ["Change %", "5D %", "Volume"])
    with col3:
        refresh = st.button("🔄 Refresh Data")
    with col4:
        auto_refresh = st.checkbox("Auto-Refresh (5min)")
    
    st.markdown("---")
    
    # EXPANDED TABS
    tab1, tab2, tab3, tab4, tab5, tab6, tab7 = st.tabs([
        "📈 Indices", 
        "💰 Crypto", 
        "🏦 ETFs", 
        "⚡ Commodities",
        "📊 Stocks",
        "💵 Bonds & Rates",
        "🎯 Credit Spreads"
    ])
    
    with tab1:
        st.markdown("#### 🌍 Global Indices")
        with st.spinner("Loading indices..."):
            try:
                indices_df = fetch_market_watch_data(GLOBAL_INDICES)
                if not indices_df.empty:
                    indices_df = indices_df[indices_df['Change %'] >= filter_change]
                    display_df = create_dynamic_market_table(indices_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=600)
                else:
                    st.warning("No data available")
            except Exception as e:
                logger.error(f"Error loading indices: {e}", exc_info=True)
                st.error(f"Error loading indices: {e}")
    
    with tab2:
        st.markdown("#### 🪙 Cryptocurrency Markets")
        with st.spinner("Loading crypto..."):
            try:
                crypto_df = fetch_market_watch_data(CRYPTOCURRENCIES)
                if not crypto_df.empty:
                    crypto_df = crypto_df[crypto_df['Change %'] >= filter_change]
                    display_df = create_dynamic_market_table(crypto_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=600)
                else:
                    st.warning("No data available")
            except Exception as e:
                logger.error(f"Error loading crypto: {e}", exc_info=True)
                st.error(f"Error loading crypto data: {e}")
    
    with tab3:
        st.markdown("#### 📦 Exchange-Traded Funds")
        sectors = st.multiselect("Filter by Category", 
                                 ["Broad Market", "Sector", "Thematic", "International"],
                                 default=["Broad Market", "Sector", "Thematic"])
        
        with st.spinner("Loading ETFs..."):
            try:
                etf_df = fetch_market_watch_data(POPULAR_ETFS)
                if not etf_df.empty:
                    if sectors:
                        etf_df = etf_df[etf_df['Category'].isin(sectors)]
                    display_df = create_dynamic_market_table(etf_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=600)
                else:
                    st.warning("No data available")
            except Exception as e:
                logger.error(f"Error loading ETFs: {e}", exc_info=True)
                st.error(f"Error loading ETF data: {e}")
    
    with tab4:
        st.markdown("#### ⛽ Commodity Markets")
        commodity_cats = st.multiselect("Filter by Type",
                                       ["Precious Metals", "Energy", "Industrial Metals", "Agriculture", "Livestock"],
                                       default=["Precious Metals", "Energy"])
        
        with st.spinner("Loading commodities..."):
            try:
                comm_df = fetch_market_watch_data(COMMODITIES)
                if not comm_df.empty:
                    if commodity_cats:
                        comm_df = comm_df[comm_df['Category'].isin(commodity_cats)]
                    display_df = create_dynamic_market_table(comm_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=600)
                else:
                    st.warning("No data available")
            except Exception as e:
                logger.error(f"Error loading commodities: {e}", exc_info=True)
                st.error(f"Error loading commodities data: {e}")
    
    with tab5:
        st.markdown("#### 📈 Popular Stocks")
        stock_sectors = st.multiselect("Filter by Category",
                                      ["Mega Cap Tech", "Financials", "Healthcare", "Consumer", "Energy"],
                                      default=["Mega Cap Tech", "Financials"])
        
        with st.spinner("Loading stocks..."):
            try:
                stocks_df = fetch_market_watch_data(POPULAR_STOCKS)
                if not stocks_df.empty:
                    if stock_sectors:
                        stocks_df = stocks_df[stocks_df['Category'].isin(stock_sectors)]
                    display_df = create_dynamic_market_table(stocks_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=600)
                else:
                    st.warning("No data available")
            except Exception as e:
                logger.error(f"Error loading stocks: {e}", exc_info=True)
                st.error(f"Error loading stocks data: {e}")
    
    with tab6:
        st.markdown("#### 💵 Bond Yields & Treasury Rates")
        st.info("📊 **Key Insight:** Monitor the yield curve for recession signals and inflation expectations")

        # NEW: Yield Curve Visualization
        try:
            yield_curve = create_yield_curve()
            if yield_curve:
                st.plotly_chart(yield_curve, use_container_width=True)
                st.caption(f"**Data Freshness:** {ATLASFormatter.format_timestamp()}")
        except Exception as e:
            logger.error(f"Error creating yield curve: {e}")
            st.info("Yield curve visualization unavailable")

        st.markdown("---")

        with st.spinner("Loading bonds..."):
            try:
                bonds_df = fetch_market_watch_data(BOND_YIELDS)
                if not bonds_df.empty:
                    display_df = create_dynamic_market_table(bonds_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=400)
                else:
                    st.warning("No data available")
            except Exception as e:
                logger.error(f"Error loading bonds: {e}", exc_info=True)
                st.error(f"Error loading bond data: {e}")
    
    with tab7:
        st.markdown("#### 🎯 Credit Spreads & Conditions")
        st.info("💡 **Key Insight:** Widening spreads signal deteriorating credit conditions and rising risk premiums")
        
        with st.spinner("Loading credit spreads..."):
            try:
                credit_df = fetch_market_watch_data(CREDIT_SPREADS)
                if not credit_df.empty:
                    display_df = create_dynamic_market_table(credit_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=400)
                    
                    st.markdown("---")
                    st.markdown("#### 📊 Credit Market Interpretation")
                    st.markdown("""
                    **Investment Grade (LQD):** Corporate bonds rated BBB- or higher  
                    **High Yield (HYG):** "Junk" bonds with higher risk and return potential  
                    **Emerging Markets (EMB):** Sovereign and corporate debt from developing economies  
                    **TIPS (TIP):** Treasury Inflation-Protected Securities  
                    **MBS (MBB):** Mortgage-Backed Securities  
                    
                    **📈 What to Watch:**
                    - Widening spreads = Increasing risk premium (credit stress)
                    - Narrowing spreads = Improving credit conditions (risk-on)
                    - HYG-LQD spread = Credit quality differential
                    """)
                else:
                    st.warning("No data available")
            except Exception as e:
                logger.error(f"Error loading credit spreads: {e}", exc_info=True)
                st.error(f"Error loading credit data: {e}")
    
    logger.info("Market Watch page rendered successfully")
