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

    # Time frame selector (sleek buttons matching navigation style)
    st.markdown("""
        <style>
        /* Time frame selector styling */
        div[data-testid="stRadio"][key="chart_timeframe"] > div {
            gap: 0.5rem;
        }

        div[data-testid="stRadio"][key="chart_timeframe"] > div > label {
            background: linear-gradient(135deg, rgba(21, 25, 50, 0.6), rgba(15, 23, 42, 0.8));
            backdrop-filter: blur(10px);
            border: 1px solid rgba(99, 102, 241, 0.15);
            border-radius: 0.5rem;
            padding: 0.5rem 1rem;
            color: #94a3b8;
            font-weight: 500;
            font-size: 0.85rem;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
        }

        div[data-testid="stRadio"][key="chart_timeframe"] > div > label:hover {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.15));
            border-color: rgba(99, 102, 241, 0.3);
            color: #f8fafc;
            transform: translateY(-1px);
        }

        div[data-testid="stRadio"][key="chart_timeframe"] > div > label[data-checked="true"] {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.25));
            border: 1px solid rgba(99, 102, 241, 0.5);
            color: #f8fafc;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
        }

        div[data-testid="stRadio"][key="chart_timeframe"] input[type="radio"] {
            display: none;
        }
        </style>
    """, unsafe_allow_html=True)

    chart_timeframe = st.radio(
        "Chart Time Frame",
        ["1D", "5D", "1M", "3M", "6M", "1Y"],
        index=2,  # Default to 1M
        horizontal=True,
        label_visibility="collapsed",
        key="chart_timeframe",
        help="Select time period for index charts"
    )

    st.markdown("<div style='margin: 0.75rem 0;'></div>", unsafe_allow_html=True)

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
                        # Enhanced chart with time frame selection and date labels
                        from visualization_components import create_mini_index_chart
                        mini_chart = create_mini_index_chart(
                            index['ticker'],
                            period=chart_timeframe,
                            show_dates=True
                        )
                        st.plotly_chart(mini_chart, use_container_width=True, key=f"chart_{index['ticker']}_{chart_timeframe}")

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

    # Custom CSS for sleek navigation buttons (matching sidebar style)
    st.markdown("""
        <style>
        /* Override Streamlit's default radio button styling */
        div[data-testid="stRadio"] > div {
            gap: 0.75rem;
        }

        div[data-testid="stRadio"] > div > label {
            background: linear-gradient(135deg, rgba(21, 25, 50, 0.6), rgba(15, 23, 42, 0.8));
            backdrop-filter: blur(10px);
            border: 1px solid rgba(99, 102, 241, 0.15);
            border-radius: 0.75rem;
            padding: 0.75rem 1.5rem;
            color: #94a3b8;
            font-weight: 500;
            font-size: 0.9rem;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        div[data-testid="stRadio"] > div > label:hover {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.15));
            border-color: rgba(99, 102, 241, 0.3);
            color: #f8fafc;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }

        div[data-testid="stRadio"] > div > label[data-checked="true"] {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.25));
            border: 1px solid rgba(99, 102, 241, 0.5);
            color: #f8fafc;
            font-weight: 600;
            box-shadow: 0 6px 16px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        /* Hide the radio input circles */
        div[data-testid="stRadio"] input[type="radio"] {
            display: none;
        }
        </style>
    """, unsafe_allow_html=True)

    # Sleek button navigation (replacing tabs)
    screener_view = st.radio(
        "Screener Type",
        ["🔍 Advanced Screener", "⚡ Quick Screens"],
        horizontal=True,
        label_visibility="collapsed",
        key="stock_screener_nav"
    )

    st.markdown("<div style='margin: 1rem 0;'></div>", unsafe_allow_html=True)

    # Render selected view
    if screener_view == "🔍 Advanced Screener":
        render_advanced_stock_screener()
    else:
        render_prebuilt_screeners()


# ============================================================
# SECTORS PAGE
# ============================================================

def render_sectors_page():
    """Sector analysis page with professional styling"""

    st.title("🏢 Sector Analysis")
    st.caption("S&P 500 sector performance tracking with real-time market data")

    sector_data = get_sector_performance()

    if not sector_data:
        st.warning("Unable to fetch sector data")
        return

    # ============================================================
    # SECTOR TREND DETECTION & ALERTS (Priority 3, Item 8)
    # ============================================================

    st.markdown("---")
    st.markdown("### 🚨 Trend Detection & Momentum Alerts")

    # Analyze trends and detect momentum/reversals
    momentum_alerts = []
    reversal_alerts = []

    for sector in sector_data:
        ytd = sector.get('ytd_return', 0)

        # MOMENTUM DETECTION
        # Strong bullish momentum (>5% YTD)
        if ytd > 5:
            momentum_alerts.append({
                'sector': sector['name'],
                'type': 'Strong Bullish Momentum',
                'emoji': '🚀',
                'color': '#22c55e',
                'return': ytd,
                'signal': f"+{ytd:.2f}% YTD - Strong uptrend"
            })
        # Strong bearish momentum (<-5% YTD)
        elif ytd < -5:
            momentum_alerts.append({
                'sector': sector['name'],
                'type': 'Strong Bearish Momentum',
                'emoji': '📉',
                'color': '#ef4444',
                'return': ytd,
                'signal': f"{ytd:.2f}% YTD - Strong downtrend"
            })
        # Moderate momentum (2-5%)
        elif ytd > 2:
            momentum_alerts.append({
                'sector': sector['name'],
                'type': 'Moderate Bullish',
                'emoji': '📈',
                'color': '#10b981',
                'return': ytd,
                'signal': f"+{ytd:.2f}% YTD - Building momentum"
            })

        # REVERSAL DETECTION (Simulated - in production would compare to historical averages)
        # For demonstration: Sectors near 0% might be reversing
        if -2 < ytd < 2 and ytd != 0:
            direction = "Bullish" if ytd > 0 else "Bearish"
            reversal_alerts.append({
                'sector': sector['name'],
                'type': f'Potential {direction} Reversal',
                'emoji': '🔄',
                'color': '#f59e0b',
                'return': ytd,
                'signal': f"{ytd:+.2f}% YTD - Consolidating near zero, watch for breakout"
            })

    # Display alerts in professional cards
    alert_col1, alert_col2 = st.columns(2)

    with alert_col1:
        st.markdown("#### 🚀 Momentum Alerts")

        if momentum_alerts:
            for alert in sorted(momentum_alerts, key=lambda x: abs(x['return']), reverse=True)[:5]:
                st.markdown(f"""
                <div style="
                    background: linear-gradient(135deg, rgba(30,41,59,0.95), rgba(15,23,42,0.98));
                    border-left: 4px solid {alert['color']};
                    padding: 0.875rem;
                    border-radius: 0.75rem;
                    margin-bottom: 0.625rem;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.2);
                ">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.5rem;">{alert['emoji']}</span>
                        <span style="
                            background: {alert['color']};
                            color: #0f172a;
                            padding: 0.25rem 0.625rem;
                            border-radius: 0.375rem;
                            font-size: 0.7rem;
                            font-weight: 700;
                            text-transform: uppercase;
                        ">{alert['type']}</span>
                    </div>
                    <p style="margin: 0; font-size: 1rem; font-weight: 600; color: #f8fafc;">
                        {alert['sector']}
                    </p>
                    <p style="margin: 0.375rem 0 0 0; font-size: 0.85rem; color: #cbd5e1;">
                        {alert['signal']}
                    </p>
                </div>
                """, unsafe_allow_html=True)
        else:
            st.info("📊 No significant momentum detected. Markets in consolidation phase.")

    with alert_col2:
        st.markdown("#### 🔄 Reversal Watch")

        if reversal_alerts:
            for alert in reversal_alerts[:5]:
                st.markdown(f"""
                <div style="
                    background: linear-gradient(135deg, rgba(30,41,59,0.95), rgba(15,23,42,0.98));
                    border-left: 4px solid {alert['color']};
                    padding: 0.875rem;
                    border-radius: 0.75rem;
                    margin-bottom: 0.625rem;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.2);
                ">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.5rem;">{alert['emoji']}</span>
                        <span style="
                            background: {alert['color']};
                            color: #0f172a;
                            padding: 0.25rem 0.625rem;
                            border-radius: 0.375rem;
                            font-size: 0.7rem;
                            font-weight: 700;
                            text-transform: uppercase;
                        ">{alert['type']}</span>
                    </div>
                    <p style="margin: 0; font-size: 1rem; font-weight: 600; color: #f8fafc;">
                        {alert['sector']}
                    </p>
                    <p style="margin: 0.375rem 0 0 0; font-size: 0.85rem; color: #cbd5e1;">
                        {alert['signal']}
                    </p>
                </div>
                """, unsafe_allow_html=True)
        else:
            st.info("🔍 No reversals detected. Sectors maintaining their trends.")

    # Summary metrics for trend detection
    st.markdown("---")
    metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)

    with metric_col1:
        bullish_count = sum(1 for a in momentum_alerts if 'Bullish' in a['type'])
        st.metric("🐂 Bullish Momentum", bullish_count, help="Sectors showing upward momentum")

    with metric_col2:
        bearish_count = sum(1 for a in momentum_alerts if 'Bearish' in a['type'])
        st.metric("🐻 Bearish Momentum", bearish_count, help="Sectors showing downward momentum")

    with metric_col3:
        st.metric("🔄 Reversals Watch", len(reversal_alerts), help="Sectors near potential trend changes")

    with metric_col4:
        total_alerts = len(momentum_alerts) + len(reversal_alerts)
        st.metric("🚨 Total Alerts", total_alerts, help="All active trend signals")

    st.markdown("---")

    # Sector icons mapping
    sector_icons = {
        'Technology': '💻',
        'Information Technology': '💻',
        'Healthcare': '🏥',
        'Health Care': '🏥',
        'Financials': '💰',
        'Consumer Discretionary': '🛒',
        'Communication Services': '📡',
        'Industrials': '🏭',
        'Consumer Staples': '🛍️',
        'Energy': '⚡',
        'Utilities': '🔌',
        'Real Estate': '🏘️',
        'Materials': '⚒️',
        'Basic Materials': '⚒️'
    }

    col1, col2 = st.columns([1, 2])

    with col1:
        st.markdown("### 📊 Performance Rankings")

        # Sort sectors by performance
        sorted_sectors = sorted(sector_data, key=lambda x: x['ytd_return'], reverse=True)

        for idx, sector in enumerate(sorted_sectors):
            # Determine rank badge color
            if idx == 0:
                rank_color = '#22c55e'  # Green for #1
                rank_emoji = '🥇'
            elif idx == 1:
                rank_color = '#94a3b8'  # Silver for #2
                rank_emoji = '🥈'
            elif idx == 2:
                rank_color = '#f59e0b'  # Bronze for #3
                rank_emoji = '🥉'
            else:
                rank_color = '#64748b'
                rank_emoji = f"#{idx + 1}"

            # Performance color
            perf_color = '#10b981' if sector['ytd_return'] >= 0 else '#ef4444'

            # Professional sector card matching news feed style
            st.markdown(f"""
            <div style="
                background: linear-gradient(135deg, rgba(30,41,59,0.95), rgba(15,23,42,0.98));
                border-left: 4px solid {perf_color};
                padding: 1rem;
                border-radius: 0.75rem;
                margin-bottom: 0.75rem;
                box-shadow: 0 4px 6px rgba(0,0,0,0.2);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="
                        font-size: 1.1rem;
                        font-weight: 600;
                        color: #f8fafc;
                    ">{sector_icons.get(sector['name'], '📊')} {sector['name']}</span>
                    <span style="
                        background: {rank_color};
                        color: #0f172a;
                        padding: 0.25rem 0.5rem;
                        border-radius: 0.375rem;
                        font-size: 0.75rem;
                        font-weight: 600;
                    ">{rank_emoji}</span>
                </div>

                <div style="display: flex; justify-content: space-between; margin-top: 0.75rem;">
                    <div>
                        <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">YTD Return</p>
                        <p style="margin: 0.25rem 0 0 0; font-size: 1.5rem; font-weight: 700; color: {perf_color};">
                            {sector['ytd_return']:+.2f}%
                        </p>
                    </div>
                    <div style="text-align: right;">
                        <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">Market Weight</p>
                        <p style="margin: 0.25rem 0 0 0; font-size: 1.1rem; font-weight: 600; color: #cbd5e1;">
                            {sector['weight']:.2f}%
                        </p>
                    </div>
                </div>

                <div style="margin-top: 0.75rem; background: rgba(99, 102, 241, 0.1); border-radius: 0.5rem; height: 8px; overflow: hidden;">
                    <div style="
                        background: linear-gradient(90deg, #6366f1, #8b5cf6);
                        height: 100%;
                        width: {min(sector['weight'] * 3.33, 100)}%;
                        border-radius: 0.5rem;
                    "></div>
                </div>
                <p style="margin: 0.25rem 0 0 0; font-size: 0.7rem; color: #64748b; text-align: right;">
                    Relative to max weight (30%)
                </p>
            </div>
            """, unsafe_allow_html=True)

    with col2:
        st.markdown("### 🗺️ Interactive Heatmap")

        treemap = create_sector_treemap(sector_data)
        st.plotly_chart(treemap, use_container_width=True)

        # Professional info card
        st.markdown("""
        <div style="
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.05));
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 0.75rem;
            padding: 1rem;
            margin-top: 1rem;
        ">
            <p style="margin: 0; font-size: 0.9rem; color: #cbd5e1; line-height: 1.6;">
                <b style="color: #f8fafc;">💡 How to use this heatmap:</b><br>
                • <b>Size</b> represents market weight (larger = more important to S&P 500)<br>
                • <b>Color</b> shows YTD performance (green = gains, red = losses)<br>
                • <b>Hover</b> for detailed sector statistics and metrics<br>
                • Click sectors to explore deeper (when drill-down enabled)
            </p>
        </div>
        """, unsafe_allow_html=True)


# ============================================================
# ECONOMIC CALENDAR PAGE
# ============================================================

def render_economic_calendar_page():
    """Economic calendar page - Enhanced with filters and historical data"""

    from enhanced_economic_calendar import render_enhanced_economic_calendar

    render_enhanced_economic_calendar()


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
    elif market_watch_page == "📰 News":
        from news_aggregator import render_news_feed
        render_news_feed()
