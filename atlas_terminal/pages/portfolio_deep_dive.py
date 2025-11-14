"""
Portfolio Deep Dive Page
Advanced portfolio analysis with attribution, concentration, and factor analysis
"""

import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
import logging

from ..data.cache_manager import load_portfolio_data
from ..visualizations.charts import (
    create_enhanced_holdings_table,
    create_portfolio_heatmap,
    create_holdings_attribution_waterfall,
    create_sector_rotation_heatmap,
    create_concentration_gauge,
    create_concentration_analysis,
    create_factor_momentum_chart,
    create_factor_exposure_radar,
    create_factor_attribution_table
)
from ..config import VERSION

logger = logging.getLogger(__name__)


def calculate_factor_exposures(df, start_date, end_date):
    """Calculate factor exposures for the portfolio"""
    # Placeholder - would need full implementation from atlas.py
    logger.info("Factor exposure calculation called")
    return None


def render():
    """Render the Portfolio Deep Dive page"""
    
    st.markdown("## 🔬 PORTFOLIO DEEP DIVE - ENHANCED")
    st.markdown("---")

    portfolio_data = load_portfolio_data()
    
    if not portfolio_data:
        st.warning("⚠️ No portfolio data loaded. Please upload via the sidebar.")
        return
    
    df = pd.DataFrame(portfolio_data)
    
    try:
        enhanced_df = create_enhanced_holdings_table(df)
    except Exception as e:
        logger.error(f"Error creating enhanced table: {e}")
        enhanced_df = df
    
    # Get date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365)
    
    # Main tabs
    tab1, tab2, tab3, tab4 = st.tabs([
        "🎯 Attribution", 
        "🔄 Sector Rotation", 
        "📊 Concentration",
        "📈 Multi-Factor"
    ])
    
    with tab1:
        st.markdown("### Performance Attribution Analysis")
        col1, col2 = st.columns(2)
        
        with col1:
            try:
                heatmap = create_portfolio_heatmap(enhanced_df)
                if heatmap:
                    st.plotly_chart(heatmap, use_container_width=True)
                else:
                    st.info("Portfolio heatmap unavailable")
            except Exception as e:
                logger.error(f"Error creating portfolio heatmap: {e}")
                st.info("Portfolio heatmap unavailable")
        
        with col2:
            try:
                waterfall = create_holdings_attribution_waterfall(enhanced_df)
                if waterfall:
                    st.plotly_chart(waterfall, use_container_width=True)
                else:
                    st.info("Attribution waterfall unavailable")
            except Exception as e:
                logger.error(f"Error creating attribution waterfall: {e}")
                st.info("Attribution waterfall unavailable")
    
    with tab2:
        st.markdown("### Sector Rotation Analysis")
        try:
            rotation = create_sector_rotation_heatmap(enhanced_df, start_date, end_date)
            if rotation:
                st.plotly_chart(rotation, use_container_width=True)
            else:
                st.info("Sector rotation analysis unavailable - requires historical data")
        except Exception as e:
            logger.error(f"Error creating sector rotation: {e}")
            st.info("Sector rotation analysis unavailable")
    
    with tab3:
        st.markdown("### Portfolio Concentration Analysis")
        col1, col2 = st.columns([1, 2])
        
        with col1:
            try:
                gauge = create_concentration_gauge(enhanced_df)
                if gauge:
                    st.plotly_chart(gauge, use_container_width=True)
                else:
                    st.info("Concentration gauge unavailable")
            except Exception as e:
                logger.error(f"Error creating concentration gauge: {e}")
                st.info("Concentration gauge unavailable")
        
        with col2:
            try:
                conc_analysis = create_concentration_analysis(enhanced_df)
                if conc_analysis:
                    st.plotly_chart(conc_analysis, use_container_width=True)
                else:
                    st.info("Concentration analysis unavailable")
            except Exception as e:
                logger.error(f"Error creating concentration analysis: {e}")
                st.info("Concentration analysis unavailable")
    
    with tab4:
        st.markdown("### Multi-Factor Analysis")
        st.markdown("---")

        with st.spinner("Running factor analysis..."):
            try:
                factor_data = calculate_factor_exposures(enhanced_df, start_date, end_date)
            except Exception as e:
                logger.error(f"Error calculating factor exposures: {e}")
                factor_data = None
        
        if factor_data:
            st.markdown(f"**Model R² = {factor_data.get('r_squared', 0):.3f}**")
            st.progress(factor_data.get('r_squared', 0))
            
            try:
                result = create_factor_attribution_table(factor_data, enhanced_df)
            except Exception as e:
                logger.error(f"Error creating factor attribution: {e}")
                result = None
            
            sub_tab1, sub_tab2, sub_tab3 = st.tabs([
                "📈 Factor Momentum", 
                "🎯 Exposure Radar", 
                "📊 Attribution"
            ])
            
            with sub_tab1:
                try:
                    momentum = create_factor_momentum_chart(factor_data)
                    if momentum:
                        st.plotly_chart(momentum, use_container_width=True)
                except Exception as e:
                    logger.error(f"Error creating factor momentum: {e}")
                    st.info("Factor momentum chart unavailable")
            
            with sub_tab2:
                try:
                    radar = create_factor_exposure_radar(factor_data)
                    if radar:
                        st.plotly_chart(radar, use_container_width=True)
                except Exception as e:
                    logger.error(f"Error creating exposure radar: {e}")
                    st.info("Exposure radar unavailable")
            
            with sub_tab3:
                if result is not None:
                    try:
                        attr_df, factor_summary, sector_summary = result
                        
                        if factor_summary is not None:
                            st.markdown("### Factor Summary")
                            factor_display = factor_summary.copy()
                            factor_display['Total Contribution'] = factor_display['Total Contribution'].apply(
                                lambda x: f"{x:.4f}")
                            st.dataframe(factor_display, use_container_width=True, hide_index=True)
                        
                        if attr_df is not None:
                            st.markdown("### Holdings Attribution")
                            holdings_attr = attr_df.pivot_table(
                                index='Ticker',
                                columns='Factor',
                                values='Contribution',
                                aggfunc='sum'
                            ).round(4)
                            
                            st.dataframe(holdings_attr, use_container_width=True)
                            
                            st.info("""
                            **Positive values**: Holding increases exposure  
                            **Negative values**: Holding decreases exposure
                            """)
                    except Exception as e:
                        logger.error(f"Error displaying factor attribution: {e}")
                        st.info("Factor attribution details unavailable")
        else:
            st.info("""
            **Multi-Factor Analysis** provides insights into your portfolio's exposure to common risk factors:
            
            - **Market Factor**: Overall market beta
            - **Size Factor**: Small cap vs large cap tilt  
            - **Value Factor**: Value vs growth bias
            - **Momentum Factor**: Trending stocks exposure
            - **Quality Factor**: High-quality company exposure
            - **Volatility Factor**: Low volatility preference
            
            This analysis requires historical price data for all holdings.
            Upload trade history to enable this feature.
            """)
    
    logger.info("Portfolio Deep Dive page rendered successfully")
