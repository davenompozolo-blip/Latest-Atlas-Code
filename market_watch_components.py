"""
ATLAS Market Watch - UI Components
===================================

Streamlit UI components for Market Watch integration

Author: ATLAS Development Team
Version: 2.2.0 (Jan 2026 - Comprehensive HTML Audit)

CRITICAL: All HTML cards MUST be rendered with:
    st.markdown(html, unsafe_allow_html=True)

NEVER use st.write() for HTML content - it will show raw HTML!

VERIFIED AUDIT (2026-01-08):
- Line 84: regime_card - st.markdown(..., unsafe_allow_html=True) ✓
- Line 99: vix_card - st.markdown(..., unsafe_allow_html=True) ✓
- Line 109: yield_card - st.markdown(..., unsafe_allow_html=True) ✓
- Line 119: breadth_card - st.markdown(..., unsafe_allow_html=True) ✓
- Line 744-796: sector cards - st.markdown(..., unsafe_allow_html=True) ✓
- ALL multiline HTML st.markdown calls verified ✓

Last Updated: 2026-01-08
Build: 20260108-001
"""

import streamlit as st
import pandas as pd
from datetime import datetime
from textwrap import dedent
from market_data_fetcher import *
from visualization_components import *


# ============================================================
# REGIME INDICATOR BANNER
# ============================================================

def display_regime_banner():
    """Display current market regime at top of page with professional cards"""

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
        regime_emoji = "🟢"
        regime_color = "#10b981"
    elif score <= -2:
        regime = "RISK-OFF"
        regime_emoji = "🔴"
        regime_color = "#ef4444"
    else:
        regime = "NEUTRAL"
        regime_emoji = "🟡"
        regime_color = "#fbbf24"

    # Get values
    curve_val = yields.get('curve', 0) if yields else 0
    breadth = indicators.get('breadth', {})
    breadth_val = breadth.get('breadth', 0) if breadth else 0
    vix_val = vix if vix else 0
    vix_change = indicators.get('vix', {}).get('change', 0)

    # Display cards using columns
    col1, col2 = st.columns([2, 3])

    with col1:
        # INLINE REGIME CARD - Capital Structure style with top gradient bar
        regime_gradient = f"linear-gradient(90deg, {regime_color}, #6366f1)"
        regime_html = f"""<div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(99,102,241,0.2); padding: 2rem 1.75rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden;">
<div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: {regime_gradient}; opacity: 0.8;"></div>
<div style="display: flex; align-items: center; margin-bottom: 1rem;">
<span style="font-size: 2.5rem; margin-right: 1rem;">{regime_emoji}</span>
<div>
<h2 style="margin: 0; font-size: 2rem; font-weight: 700; color: {regime_color}; text-shadow: 0 0 20px {regime_color}40;">{regime}</h2>
<p style="margin: 0.25rem 0 0 0; font-size: 0.875rem; color: #94a3b8;">Current Market Regime | Score: {score:+d}/10</p>
</div>
</div>
<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1rem;">
<div>
<p style="margin: 0; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">VIX</p>
<p style="margin: 0.25rem 0 0 0; font-size: 1.25rem; font-weight: 600; color: white;">{vix_val:.2f}</p>
</div>
<div>
<p style="margin: 0; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Yield Curve</p>
<p style="margin: 0.25rem 0 0 0; font-size: 1.25rem; font-weight: 600; color: white;">{curve_val:+.2f}%</p>
</div>
<div>
<p style="margin: 0; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Breadth</p>
<p style="margin: 0.25rem 0 0 0; font-size: 1.25rem; font-weight: 600; color: white;">{breadth_val:+.2f}%</p>
</div>
</div>
</div>"""
        st.markdown(regime_html, unsafe_allow_html=True)

    with col2:
        # Individual metric cards - INLINE (no function call)
        metric_col1, metric_col2, metric_col3 = st.columns(3)

        with metric_col1:
            # VIX card - Capital Structure style
            vix_change_color = "#10b981" if vix_change >= 0 else "#ef4444"
            vix_change_prefix = "↑" if vix_change >= 0 else "↓"
            st.markdown(f"""<div style="background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(59,130,246,0.2); padding: 1.5rem 1.25rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden; height: 100%;">
<div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #3b82f6, #06b6d4); opacity: 0.8;"></div>
<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
<span style="font-size: 1.1rem;">📊</span>
<p style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0; font-weight: 600;">VIX</p>
</div>
<h3 style="font-size: 2.25rem; font-weight: 800; margin: 0.5rem 0; line-height: 1; background: linear-gradient(135deg, #3b82f6, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">{vix_val:.2f}</h3>
<div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(59,130,246,0.12); border-radius: 12px; border: 1px solid rgba(59,130,246,0.25);">
<p style="font-size: 0.8rem; color: {vix_change_color}; margin: 0; font-weight: 600;">{vix_change_prefix} {vix_change:+.2f}</p>
</div>
</div>""", unsafe_allow_html=True)

        with metric_col2:
            # Yield Curve card - Capital Structure style
            st.markdown(f"""<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.5rem 1.25rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden; height: 100%;">
<div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div>
<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
<span style="font-size: 1.1rem;">📈</span>
<p style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0; font-weight: 600;">YIELD CURVE</p>
</div>
<h3 style="font-size: 2.25rem; font-weight: 800; margin: 0.5rem 0; line-height: 1; background: linear-gradient(135deg, #06b6d4, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">{curve_val:+.2f}%</h3>
</div>""", unsafe_allow_html=True)

        with metric_col3:
            # Breadth card - Capital Structure style
            st.markdown(f"""<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.5rem 1.25rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden; height: 100%;">
<div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #06b6d4); opacity: 0.8;"></div>
<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
<span style="font-size: 1.1rem;">🎯</span>
<p style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0; font-weight: 600;">MARKET BREADTH</p>
</div>
<h3 style="font-size: 2.25rem; font-weight: 800; margin: 0.5rem 0; line-height: 1; background: linear-gradient(135deg, #10b981, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">{breadth_val:+.2f}%</h3>
</div>""", unsafe_allow_html=True)

    st.markdown("---")


# ============================================================
# OVERVIEW PAGE
# ============================================================

def render_overview_page():
    """Main overview page with all key market data"""

    st.title("📊 Market Overview")

    # Regime banner
    display_regime_banner()

    # Major Indices Section - wrapped in container for subtle borders (not neon)
    st.markdown('<div class="major-indices-container">', unsafe_allow_html=True)
    st.markdown("### 🌍 Major Indices")

    # NUCLEAR CSS - Complete circle removal for time frame selector
    st.markdown("""
        <style>
        /* ============================================================ */
        /* NUCLEAR OPTION: Force remove ALL radio button circles       */
        /* For Chart Time Frame selector                               */
        /* ============================================================ */

        /* Hide the actual radio input - ABSOLUTE */
        div[data-testid="stRadio"][aria-label="Chart Time Frame"] input[type="radio"] {
            position: absolute !important;
            opacity: 0 !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        /* Hide the circle indicator div - NUCLEAR */
        div[data-testid="stRadio"][aria-label="Chart Time Frame"] > div > label > div:first-child {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            width: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            position: absolute !important;
            left: -9999px !important;
        }

        /* Force remove any SVG circles */
        div[data-testid="stRadio"][aria-label="Chart Time Frame"] svg {
            display: none !important;
        }

        /* Layout */
        div[data-testid="stRadio"][aria-label="Chart Time Frame"] > div {
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        /* Button styling */
        div[data-testid="stRadio"][aria-label="Chart Time Frame"] > div > label {
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%) !important;
            backdrop-filter: blur(10px) !important;
            border: 1px solid rgba(99, 102, 241, 0.15) !important;
            border-radius: 0.5rem !important;
            padding: 0.5rem 1rem !important;
            color: #94a3b8 !important;
            font-weight: 500 !important;
            font-size: 0.85rem !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            cursor: pointer !important;
        }

        div[data-testid="stRadio"][aria-label="Chart Time Frame"] > div > label:hover {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.15)) !important;
            border-color: rgba(99, 102, 241, 0.3) !important;
            color: #f8fafc !important;
            transform: translateY(-1px) !important;
        }

        div[data-testid="stRadio"][aria-label="Chart Time Frame"] > div > label[data-checked="true"] {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
            border: 1px solid rgba(99, 102, 241, 0.5) !important;
            color: white !important;
            font-weight: 600 !important;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25) !important;
        }

        /* Ensure text is visible */
        div[data-testid="stRadio"][aria-label="Chart Time Frame"] > div > label > div:last-child {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            color: inherit !important;
        }
        </style>
    """, unsafe_allow_html=True)

    chart_timeframe = st.radio(
        "Chart Time Frame",
        ["1D", "5D", "1M", "3M", "6M", "1Y"],
        index=1,  # Default to 5D for more detail
        horizontal=True,
        label_visibility="collapsed",
        key="chart_timeframe",
        help="Select time period for index charts"
    )

    # ============================================================
    # SMART PERIOD FETCHING - Works on weekends/holidays
    # ============================================================
    # Fetch MORE data than requested, then filter to show recent trading
    # This ensures charts never show flat lines

    smart_period_map = {
        '1D': {
            'period': '5d',       # Fetch 5 days to ensure we have recent trading day
            'interval': '5m',
            'display_points': 78,  # One trading day = 6.5 hours = 78 five-minute bars
            'x_format': '%H:%M'
        },
        '5D': {
            'period': '1mo',      # Fetch 1 month to ensure we have 5 trading days
            'interval': '15m',
            'display_points': 130,  # 5 days × 26 fifteen-minute bars per day
            'x_format': '%b %d'
        },
        '1M': {
            'period': '3mo',      # Fetch 3 months
            'interval': '1h',
            'display_points': 168,  # ~21 trading days × 8 hours
            'x_format': '%b %d'
        },
        '3M': {
            'period': '6mo',
            'interval': '1d',
            'display_points': 63,   # ~63 trading days
            'x_format': '%b %d'
        },
        '6M': {
            'period': '1y',
            'interval': '1d',
            'display_points': 126,  # ~126 trading days
            'x_format': '%b'
        },
        '1Y': {
            'period': '2y',
            'interval': '1d',
            'display_points': 252,  # ~252 trading days
            'x_format': '%b %Y'
        }
    }

    period_config = smart_period_map[chart_timeframe]

    st.markdown("<div style='margin: 0.75rem 0;'></div>", unsafe_allow_html=True)

    # Import plotly for sparkline charts
    import plotly.graph_objects as go
    import yfinance as yf

    # ============================================================
    # CACHED DATA FETCHING - Prevents API rate limiting
    # ============================================================
    @st.cache_data(ttl=300, show_spinner=False)  # Cache for 5 minutes
    def fetch_index_data(ticker: str, period: str, interval: str):
        """
        Fetch index data with caching to prevent rate limiting

        Returns:
            tuple: (dates, prices, success)
        """
        try:
            ticker_obj = yf.Ticker(ticker)
            hist = ticker_obj.history(period=period, interval=interval)

            if hist.empty or len(hist) < 2:
                return None, None, False

            return hist.index.tolist(), hist['Close'].tolist(), True
        except Exception as e:
            return None, None, False

    # Define indices by region with more comprehensive list
    indices_by_region = {
        'Americas': [
            {'name': 'S&P 500', 'ticker': '^GSPC'},
            {'name': 'Dow 30', 'ticker': '^DJI'},
            {'name': 'Nasdaq', 'ticker': '^IXIC'},
            {'name': 'Russell 2000', 'ticker': '^RUT'},
        ],
        'Europe': [
            {'name': 'EURO STOXX 50', 'ticker': '^STOXX50E'},
            {'name': 'DAX (Germany)', 'ticker': '^GDAXI'},
            {'name': 'FTSE 100 (UK)', 'ticker': '^FTSE'},
            {'name': 'CAC 40 (France)', 'ticker': '^FCHI'},
        ],
        'Asia': [
            {'name': 'Nikkei 225', 'ticker': '^N225'},
            {'name': 'Hang Seng', 'ticker': '^HSI'},
            {'name': 'SSE Composite', 'ticker': '000001.SS'},
            {'name': 'KOSPI', 'ticker': '^KS11'},
        ]
    }

    for region_name, indices in indices_by_region.items():
        st.markdown(f"#### {region_name}")

        cols = st.columns(len(indices))

        for col, index_info in zip(cols, indices):
            with col:
                try:
                    # Fetch data using cached function to prevent API rate limiting
                    dates, prices, success = fetch_index_data(
                        index_info['ticker'],
                        period_config['period'],
                        period_config['interval']
                    )

                    if success and prices and len(prices) > 1:
                        # Filter to display window (most recent N trading points)
                        display_points = min(period_config['display_points'], len(prices))
                        dates_filtered = dates[-display_points:]
                        prices_filtered = prices[-display_points:]

                        if len(prices_filtered) > 1:
                            # Current price and change (from filtered data)
                            current_price = prices_filtered[-1]
                            prev_price = prices_filtered[0]  # Start of display window
                            change = current_price - prev_price
                            change_pct = (change / prev_price * 100) if prev_price > 0 else 0

                            # Determine colors based on performance
                            trend_color = '#10b981' if change_pct >= 0 else '#ef4444'
                            fill_color = 'rgba(16, 185, 129, 0.15)' if change_pct >= 0 else 'rgba(239, 68, 68, 0.15)'

                            # Calculate y-axis range to show actual price movements
                            # Add 5% padding to min/max for better visualization
                            price_min = min(prices_filtered)
                            price_max = max(prices_filtered)
                            price_range = price_max - price_min
                            y_padding = price_range * 0.1 if price_range > 0 else price_min * 0.01
                            y_min = price_min - y_padding
                            y_max = price_max + y_padding

                            # Create sparkline chart with ACTUAL price movements visible
                            fig = go.Figure()

                            # Add area fill RELATIVE TO MIN (not zero!) so movements are visible
                            fig.add_trace(go.Scatter(
                                x=dates_filtered,
                                y=prices_filtered,
                                mode='lines',
                                line=dict(
                                    color=trend_color,
                                    width=2.5
                                ),
                                fill='toself',
                                fillcolor=fill_color,
                                hovertemplate='%{y:,.2f}<br>%{x|%b %d, %H:%M}<extra></extra>'
                            ))

                            fig.update_layout(
                                height=140,  # Increased from 100 for better visibility with borders
                                margin=dict(l=0, r=0, t=5, b=25),  # Added top margin, increased bottom
                                xaxis=dict(
                                    showgrid=False,
                                    showticklabels=True,
                                    tickfont=dict(size=8, color='#64748b'),
                                    tickformat=period_config['x_format'],
                                    nticks=4
                                ),
                                yaxis=dict(
                                    showgrid=False,
                                    showticklabels=False,
                                    range=[y_min, y_max],  # CRITICAL: Auto-range to show movements!
                                    fixedrange=True
                                ),
                                paper_bgcolor='rgba(0,0,0,0)',
                                plot_bgcolor='rgba(0,0,0,0)',
                                hovermode='x unified'
                            )

                            # Display index name with icon
                            icon = "📈" if change_pct >= 0 else "📉"
                            st.markdown(f"**{icon} {index_info['name']}**")

                            # Display sparkline chart
                            st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False})

                            # Display metrics below chart
                            metric_col1, metric_col2 = st.columns(2)
                            with metric_col1:
                                st.markdown(f"""
                                <div style="text-align: center;">
                                    <p style="margin: 0; font-size: 0.7rem; color: #94a3b8;">Price</p>
                                    <p style="margin: 0; font-size: 1rem; font-weight: 600; color: #f8fafc;">{current_price:,.2f}</p>
                                </div>
                                """, unsafe_allow_html=True)
                            with metric_col2:
                                st.markdown(f"""
                                <div style="text-align: center;">
                                    <p style="margin: 0; font-size: 0.7rem; color: #94a3b8;">Change</p>
                                    <p style="margin: 0; font-size: 1rem; font-weight: 600; color: {trend_color};">{change_pct:+.2f}%</p>
                                </div>
                                """, unsafe_allow_html=True)
                        else:
                            st.warning(f"Limited data: {index_info['name']}")

                    else:
                        st.warning(f"No data: {index_info['name']}")

                except Exception as e:
                    st.error(f"Error: {index_info['name']}")

    # Close Major Indices container
    st.markdown('</div>', unsafe_allow_html=True)

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

    # NUCLEAR CSS - Complete circle removal for ALL radio buttons
    st.markdown("""
        <style>
        /* ============================================================ */
        /* NUCLEAR OPTION: Force remove ALL radio button circles       */
        /* Applied globally to all radio buttons in Market Watch       */
        /* ============================================================ */

        /* Hide the actual radio input - ABSOLUTE */
        div[data-testid="stRadio"] input[type="radio"] {
            position: absolute !important;
            opacity: 0 !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        /* Hide the circle indicator div - NUCLEAR */
        div[data-testid="stRadio"] > div > label > div:first-child {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            width: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            position: absolute !important;
            left: -9999px !important;
        }

        /* Force remove any SVG circles */
        div[data-testid="stRadio"] svg {
            display: none !important;
        }

        /* Force remove any circle-like elements */
        div[data-testid="stRadio"] [class*="circle"],
        div[data-testid="stRadio"] [class*="radio"],
        div[data-testid="stRadio"] [class*="indicator"] {
            display: none !important;
        }

        /* Layout - horizontal with gap */
        div[data-testid="stRadio"] > div {
            flex-direction: row !important;
            gap: 0.75rem !important;
            flex-wrap: wrap !important;
        }

        /* Gradient button styling */
        div[data-testid="stRadio"] > div > label {
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%) !important;
            padding: 0.75rem 1.5rem !important;
            border-radius: 0.75rem !important;
            cursor: pointer !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            border: 1px solid rgba(59, 130, 246, 0.2) !important;
            backdrop-filter: blur(10px) !important;
            color: #94a3b8 !important;
            font-weight: 500 !important;
            font-size: 0.9rem !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
        }

        /* Hover state */
        div[data-testid="stRadio"] > div > label:hover {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.15)) !important;
            border-color: rgba(99, 102, 241, 0.4) !important;
            color: #f8fafc !important;
            transform: translateY(-2px) !important;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25) !important;
        }

        /* Selected state */
        div[data-testid="stRadio"] > div > label[data-checked="true"] {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
            border-color: #3b82f6 !important;
            box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4) !important;
            transform: translateY(-2px) !important;
            color: white !important;
            font-weight: 600 !important;
        }

        /* Ensure text content inherits color properly */
        div[data-testid="stRadio"] > div > label > div:last-child {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            color: inherit !important;
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
    # INSTITUTIONAL-GRADE TREND DETECTION (Priority 3, Item 8)
    # ============================================================

    st.markdown("---")
    st.markdown("### 🚨 Institutional-Grade Trend Detection & Momentum Alerts")
    st.caption("Statistical analysis using z-scores, moving averages, relative strength, and significance testing")

    # Import institutional-grade analyzer
    from sector_trend_analyzer import SectorTrendAnalyzer

    # Initialize analyzer
    analyzer = SectorTrendAnalyzer()

    # Analyze each sector with comprehensive metrics
    high_confidence_signals = []

    # Show loading indicator
    with st.spinner('Running comprehensive statistical analysis across all sectors...'):
        for sector in sector_data:
            # Run institutional-grade analysis
            result = analyzer.analyze_sector(sector['name'], benchmark_ticker='SPY')

            # Filter for high-confidence signals (>50%)
            if 'confidence' in result and result['confidence'] >= 50:
                high_confidence_signals.append(result)

    # Display high-confidence signals
    if high_confidence_signals:
        # Sort by confidence
        high_confidence_signals.sort(key=lambda x: x.get('confidence', 0), reverse=True)

        # Split into bullish/bearish/other
        bullish_signals = [s for s in high_confidence_signals if 'BULLISH' in s.get('signal_type', '')]
        bearish_signals = [s for s in high_confidence_signals if 'BEARISH' in s.get('signal_type', '')]
        other_signals = [s for s in high_confidence_signals if s not in bullish_signals and s not in bearish_signals]

        # Display in two columns
        alert_col1, alert_col2 = st.columns(2)

        with alert_col1:
            st.markdown("#### 🚀 Bullish Signals (High Confidence)")

            if bullish_signals:
                for signal in bullish_signals[:5]:  # Top 5
                    signal_type_clean = signal['signal_type'].replace('_', ' ')
                    bullish_html = f"""<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 20px; border: 1px solid rgba(16,185,129,0.2); padding: 1.25rem 1rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden; margin-bottom: 0.75rem;">
<div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, {signal['color']}, #10b981); opacity: 0.8;"></div>
<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
<span style="font-size: 1.75rem;">{signal['emoji']}</span>
<div style="text-align: right;">
<div style="background: {signal['color']}; color: #0f172a; padding: 0.25rem 0.625rem; border-radius: 8px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.25rem;">{signal_type_clean}</div>
<div style="font-size: 0.75rem; color: #10b981; font-weight: 600;">Confidence: {signal['confidence']:.0f}%</div>
</div>
</div>
<p style="margin: 0; font-size: 1.1rem; font-weight: 600; color: #f8fafc;">{signal['sector']} ({signal['ticker']})</p>
<p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #cbd5e1; line-height: 1.4;">{signal['message']}</p>
<div style="margin-top: 0.75rem; padding: 0.625rem; background: rgba(99, 102, 241, 0.1); border-radius: 10px; font-size: 0.75rem; color: #94a3b8; line-height: 1.5;">{signal['explanation']}</div>
</div>"""
                    st.markdown(bullish_html, unsafe_allow_html=True)
            else:
                st.info("📊 No high-confidence bullish signals detected.")

        with alert_col2:
            st.markdown("#### 📉 Bearish & Consolidation Signals")

            # Show bearish first, then consolidation
            combined_signals = bearish_signals + other_signals

            if combined_signals:
                for signal in combined_signals[:5]:  # Top 5
                    bg_color = 'rgba(239,68,68,0.08)' if 'BEARISH' in signal.get('signal_type', '') else 'rgba(245,158,11,0.08)'
                    border_color = 'rgba(239,68,68,0.2)' if 'BEARISH' in signal.get('signal_type', '') else 'rgba(245,158,11,0.2)'
                    text_color = '#ef4444' if 'BEARISH' in signal.get('signal_type', '') else '#f59e0b'
                    signal_type_clean = signal['signal_type'].replace('_', ' ')
                    bearish_html = f"""<div style="background: linear-gradient(135deg, {bg_color}, rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 20px; border: 1px solid {border_color}; padding: 1.25rem 1rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden; margin-bottom: 0.75rem;">
<div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, {signal['color']}, {text_color}); opacity: 0.8;"></div>
<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
<span style="font-size: 1.75rem;">{signal['emoji']}</span>
<div style="text-align: right;">
<div style="background: {signal['color']}; color: #0f172a; padding: 0.25rem 0.625rem; border-radius: 8px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.25rem;">{signal_type_clean}</div>
<div style="font-size: 0.75rem; color: {text_color}; font-weight: 600;">Confidence: {signal['confidence']:.0f}%</div>
</div>
</div>
<p style="margin: 0; font-size: 1.1rem; font-weight: 600; color: #f8fafc;">{signal['sector']} ({signal['ticker']})</p>
<p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #cbd5e1; line-height: 1.4;">{signal['message']}</p>
<div style="margin-top: 0.75rem; padding: 0.625rem; background: rgba(99, 102, 241, 0.1); border-radius: 10px; font-size: 0.75rem; color: #94a3b8; line-height: 1.5;">{signal['explanation']}</div>
</div>"""
                    st.markdown(bearish_html, unsafe_allow_html=True)
            else:
                st.info("🔍 No bearish or consolidation signals above confidence threshold.")

    else:
        st.warning("⚠️ No high-confidence signals detected. Market in neutral consolidation phase.")

    # Summary metrics
    st.markdown("---")
    metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)

    bullish_count = len([s for s in high_confidence_signals if 'BULLISH' in s.get('signal_type', '')])
    bearish_count = len([s for s in high_confidence_signals if 'BEARISH' in s.get('signal_type', '')])
    consolidation_count = len([s for s in high_confidence_signals if 'CONSOLIDATION' in s.get('signal_type', '')])

    with metric_col1:
        st.metric(
            "🐂 Bullish Signals",
            bullish_count,
            help="Sectors with statistically significant bullish momentum (confidence >50%)"
        )

    with metric_col2:
        st.metric(
            "🐻 Bearish Signals",
            bearish_count,
            help="Sectors with statistically significant bearish momentum (confidence >50%)"
        )

    with metric_col3:
        st.metric(
            "🔄 Consolidation",
            consolidation_count,
            help="Sectors in consolidation phase - potential breakout setups"
        )

    with metric_col4:
        avg_confidence = sum(s.get('confidence', 0) for s in high_confidence_signals) / len(high_confidence_signals) if high_confidence_signals else 0
        st.metric(
            "📊 Avg Confidence",
            f"{avg_confidence:.0f}%",
            help="Average confidence level across all high-conviction signals"
        )

    st.markdown("---")

    # Sector icons mapping (covers all variations of sector names)
    sector_icons = {
        'Technology': '💻',
        'Information Technology': '💻',
        'Healthcare': '🏥',
        'Health Care': '🏥',
        'Financials': '💰',
        'Financial Services': '💰',  # Added for XLF compatibility
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

            # Professional sector card - Capital Structure style with top gradient bar
            sector_icon = sector_icons.get(sector['name'], '📊')
            sector_gradient = f"linear-gradient(90deg, {perf_color}, #6366f1)"
            sector_html = f"""<div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 20px; border: 1px solid rgba(99,102,241,0.2); padding: 1.25rem 1rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden; margin-bottom: 0.75rem;">
<div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: {sector_gradient}; opacity: 0.8;"></div>
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
<span style="font-size: 1.1rem; font-weight: 600; color: #f8fafc;">{sector_icon} {sector['name']}</span>
<span style="background: {rank_color}; color: #0f172a; padding: 0.25rem 0.5rem; border-radius: 8px; font-size: 0.75rem; font-weight: 600;">{rank_emoji}</span>
</div>
<div style="display: flex; justify-content: space-between; margin-top: 0.75rem;">
<div>
<p style="margin: 0; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">YTD Return</p>
<p style="margin: 0.25rem 0 0 0; font-size: 1.5rem; font-weight: 700; color: {perf_color}; text-shadow: 0 0 20px {perf_color}40;">{sector['ytd_return']:+.2f}%</p>
</div>
<div style="text-align: right;">
<p style="margin: 0; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Market Weight</p>
<p style="margin: 0.25rem 0 0 0; font-size: 1.1rem; font-weight: 600; color: #cbd5e1;">{sector['weight']:.2f}%</p>
</div>
</div>
<div style="margin-top: 0.75rem; background: rgba(99, 102, 241, 0.1); border-radius: 8px; height: 6px; overflow: hidden;">
<div style="background: linear-gradient(90deg, #6366f1, #8b5cf6); height: 100%; width: {min(sector['weight'] * 3.33, 100)}%; border-radius: 8px;"></div>
</div>
</div>"""
            st.markdown(sector_html, unsafe_allow_html=True)

    with col2:
        st.markdown("### 🗺️ Interactive Heatmap")

        treemap = create_sector_treemap(sector_data)
        st.plotly_chart(treemap, use_container_width=True)

        # Professional info card - Capital Structure style
        st.markdown("""<div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 20px; border: 1px solid rgba(99,102,241,0.2); padding: 1.25rem 1rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden; margin-top: 1rem;">
<div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #6366f1, #8b5cf6); opacity: 0.8;"></div>
<p style="margin: 0; font-size: 0.9rem; color: #cbd5e1; line-height: 1.6;">
<b style="color: #f8fafc;">💡 How to use this heatmap:</b><br>
• <b>Size</b> represents market weight (larger = more important to S&P 500)<br>
• <b>Color</b> shows YTD performance (green = gains, red = losses)<br>
• <b>Hover</b> for detailed sector statistics and metrics<br>
• Click sectors to explore deeper (when drill-down enabled)
</p>
</div>""", unsafe_allow_html=True)


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
