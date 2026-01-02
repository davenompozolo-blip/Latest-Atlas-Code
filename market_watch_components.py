"""
ATLAS Market Watch - UI Components
===================================

Streamlit UI components for Market Watch integration

Author: ATLAS Development Team
Version: 1.0.0
"""

import streamlit as st
import pandas as pd
from datetime import datetime
from market_data_fetcher import *
from visualization_components import *


# ============================================================
# REGIME INDICATOR BANNER
# ============================================================

def display_regime_banner():
    """Display current market regime at top of page"""

    st.markdown("### 🌍 Market Regime")

    # Get regime indicators
    indicators = get_regime_indicators()

    # Quick regime classification
    score = 0

    vix = indicators.get('vix', {}).get('current', 15)
    if vix < 15:
        score += 2
    elif vix > 30:
        score -= 3
    elif vix > 20:
        score -= 1

    yields = indicators.get('yields', {})
    if yields and yields.get('curve', 0) < 0:
        score -= 2  # Inverted curve

    spreads = indicators.get('credit_spreads', {})
    if spreads and spreads.get('hyg_change_pct', 0) < -5:
        score -= 2  # Widening spreads

    # Classify regime
    if score >= 2:
        regime = "RISK-ON"
        regime_color = "🟢"
        bg_color = "#064e3b"
    elif score <= -2:
        regime = "RISK-OFF"
        regime_color = "🔴"
        bg_color = "#7f1d1d"
    else:
        regime = "NEUTRAL"
        regime_color = "🟡"
        bg_color = "#78350f"

    # Display banner
    col1, col2, col3, col4 = st.columns([1, 1, 1, 1])

    with col1:
        st.markdown(f"""
        <div style="background: {bg_color}; padding: 1rem; border-radius: 0.5rem; text-align: center;">
            <h2 style="margin: 0;">{regime_color} {regime}</h2>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.9em; opacity: 0.8;">Current Market Regime</p>
        </div>
        """, unsafe_allow_html=True)

    with col2:
        vix_val = vix if vix else 0
        st.metric("VIX", f"{vix_val:.2f}",
                 delta=f"{indicators.get('vix', {}).get('change', 0):+.2f}")

    with col3:
        curve_val = yields.get('curve', 0) if yields else 0
        st.metric("Yield Curve", f"{curve_val:+.2f}%",
                 help="10Y - 2Y spread")

    with col4:
        breadth = indicators.get('breadth', {})
        breadth_val = breadth.get('breadth', 0) if breadth else 0
        st.metric("Market Breadth", f"{breadth_val:+.2f}%",
                 help="RSP - SPY performance")

    st.markdown("---")


# ============================================================
# OVERVIEW PAGE
# ============================================================

def render_overview_page():
    """Main overview page with all key market data"""

    st.title("📊 Market Overview")

    # Regime banner
    display_regime_banner()

    # Major Indices Section
    st.markdown("### 🌍 Major Indices")

    col1, col2, col3 = st.columns(3)

    regions = ['Americas', 'Europe', 'Asia']
    cols = [col1, col2, col3]

    for region, col in zip(regions, cols):
        with col:
            st.markdown(f"#### {region}")
            indices = get_indices_data(region)

            for index in indices[:5]:  # Top 5 per region
                with st.container():
                    idx_col1, idx_col2 = st.columns([3, 1])

                    with idx_col1:
                        st.markdown(f"**{index['display_name']}**")
                        st.markdown(f"${index['price']:,.2f}")

                        change_color = 'color: #10b981' if index['change'] >= 0 else 'color: #ef4444'
                        st.markdown(f"<span style='{change_color}'>{index['change']:+.2f} ({index['change_pct']:+.2f}%)</span>",
                                   unsafe_allow_html=True)

                    with idx_col2:
                        # Mini chart
                        if index.get('history') is not None and not index['history'].empty:
                            mini_chart = create_sparkline(index['history']['Close'])
                            st.plotly_chart(mini_chart, use_container_width=True, key=f"spark_{index['ticker']}")

                    st.markdown("<hr style='margin: 0.5rem 0; opacity: 0.2;'>", unsafe_allow_html=True)

    st.markdown("---")

    # Sector Performance
    st.markdown("### 🏢 Sector Performance")

    sector_data = get_sector_performance()

    if sector_data:
        # Create two-column layout
        col1, col2 = st.columns([1, 2])

        with col1:
            st.markdown("#### Performance Table")

            sector_df = pd.DataFrame(sector_data)
            display_df = sector_df[['name', 'weight', 'ytd_return']].copy()
            display_df.columns = ['Sector', 'Weight (%)', 'YTD Return (%)']
            display_df['YTD Return (%)'] = display_df['YTD Return (%)'].apply(lambda x: f"{x:+.2f}%")
            display_df['Weight (%)'] = display_df['Weight (%)'].apply(lambda x: f"{x:.2f}%")

            st.dataframe(display_df, use_container_width=True, hide_index=True)

        with col2:
            st.markdown("#### Sector Heatmap")
            treemap = create_sector_treemap(sector_data)
            st.plotly_chart(treemap, use_container_width=True)


# ============================================================
# STOCKS SCREENER PAGE
# ============================================================

def render_stocks_page():
    """Stock screeners page - Advanced screener with 500+ stocks"""

    from advanced_stock_screener import render_advanced_stock_screener, render_prebuilt_screeners

    st.title("📈 Stock Screeners")
    st.caption("Professional stock screening with 1,000+ stocks (S&P 500 + NASDAQ-100 + curated growth stocks)")

    # Tabs for different views
    tab1, tab2 = st.tabs(["🔍 Advanced Screener", "⚡ Quick Screens"])

    with tab1:
        render_advanced_stock_screener()

    with tab2:
        render_prebuilt_screeners()


# ============================================================
# SECTORS PAGE
# ============================================================

def render_sectors_page():
    """Sector analysis page"""

    st.title("🏢 Sector Analysis")

    sector_data = get_sector_performance()

    if not sector_data:
        st.warning("Unable to fetch sector data")
        return

    col1, col2 = st.columns([1, 2])

    with col1:
        st.markdown("### Sector Performance")

        for sector in sector_data:
            with st.container():
                st.markdown(f"**{sector['name']}**")

                metric_col1, metric_col2 = st.columns(2)

                with metric_col1:
                    st.caption(f"Weight: {sector['weight']:.2f}%")

                with metric_col2:
                    change_color = 'color: #10b981' if sector['ytd_return'] >= 0 else 'color: #ef4444'
                    st.markdown(f"<span style='{change_color}'>YTD: {sector['ytd_return']:+.2f}%</span>",
                               unsafe_allow_html=True)

                # Progress bar for weight
                st.progress(sector['weight'] / 100)
                st.markdown("<hr style='margin: 0.5rem 0; opacity: 0.2;'>", unsafe_allow_html=True)

    with col2:
        st.markdown("### Sector Heatmap")

        treemap = create_sector_treemap(sector_data)
        st.plotly_chart(treemap, use_container_width=True)

        st.caption("""
        **How to read this chart:**
        - Size = Market weight (larger = more important)
        - Color = Performance (green = positive, red = negative)
        - Click sectors to drill down
        """)


# ============================================================
# ECONOMIC CALENDAR PAGE
# ============================================================

def render_economic_calendar_page():
    """Economic calendar page - CRITICAL FOR REGIME DETECTION"""

    st.title("📅 Economic Calendar")

    st.markdown("""
    <div style="background: #1e293b; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #3b82f6;">
    <strong>📊 This Week's Major U.S. Economic Reports</strong><br>
    Key events that drive market regime and portfolio positioning
    </div>
    """, unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # Get calendar data
    calendar_data = get_economic_calendar()

    if calendar_data:
        for day_name, events_df in calendar_data.items():
            st.markdown(f"### {day_name}")

            if not events_df.empty:
                # Format the dataframe
                st.dataframe(
                    events_df,
                    use_container_width=True,
                    hide_index=True
                )
            else:
                st.info("No major events scheduled")

            st.markdown("---")
    else:
        st.info("""
        📅 **Economic calendar data unavailable**

        To enable this feature:
        1. Install investpy: `pip install investpy`
        2. Or integrate with Trading Economics API
        3. Or enable MarketWatch scraping

        This is a critical feature for regime detection!
        """)


# ============================================================
# MAIN NAVIGATION
# ============================================================

def render_market_watch_page(market_watch_page: str):
    """
    Main market watch page router

    Args:
        market_watch_page: Selected page name
    """
    if market_watch_page == "📊 Overview":
        render_overview_page()
    elif market_watch_page == "📈 Stocks":
        render_stocks_page()
    elif market_watch_page == "🏢 Sectors":
        render_sectors_page()
    elif market_watch_page == "📅 Economic Calendar":
        render_economic_calendar_page()
