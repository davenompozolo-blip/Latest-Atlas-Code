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
    """Display current market regime at top of page with professional cards"""

    from ui_components import create_regime_card, create_metric_card

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
    elif score <= -2:
        regime = "RISK-OFF"
    else:
        regime = "NEUTRAL"

    # Display professional regime card
    col1, col2 = st.columns([2, 3])

    with col1:
        # Large regime card
        curve_val = yields.get('curve', 0) if yields else 0
        breadth = indicators.get('breadth', {})
        breadth_val = breadth.get('breadth', 0) if breadth else 0
        vix_val = vix if vix else 0

        regime_card = create_regime_card(
            regime_status=regime,
            score=score,
            vix=vix_val,
            yield_curve=curve_val,
            breadth=breadth_val
        )
        st.markdown(regime_card, unsafe_allow_html=True)

    with col2:
        # Individual metric cards
        metric_col1, metric_col2, metric_col3 = st.columns(3)

        with metric_col1:
            vix_change = indicators.get('vix', {}).get('change', 0)
            vix_card = create_metric_card(
                title="VIX",
                value=f"{vix_val:.2f}",
                change=f"{vix_change:+.2f}",
                icon="📊",
                border_color="#3b82f6"
            )
            st.markdown(vix_card, unsafe_allow_html=True)

        with metric_col2:
            yield_card = create_metric_card(
                title="YIELD CURVE",
                value=f"{curve_val:+.2f}%",
                change=None,
                icon="📈",
                border_color="#06b6d4"
            )
            st.markdown(yield_card, unsafe_allow_html=True)

        with metric_col3:
            breadth_card = create_metric_card(
                title="MARKET BREADTH",
                value=f"{breadth_val:+.2f}%",
                change=None,
                icon="🎯",
                border_color="#10b981"
            )
            st.markdown(breadth_card, unsafe_allow_html=True)

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
        /* Time frame selector styling - Hide radio circles */
        div[data-testid="stRadio"][aria-label="Chart Time Frame"] > div {
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        div[data-testid="stRadio"][aria-label="Chart Time Frame"] > div > label {
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

        div[data-testid="stRadio"][aria-label="Chart Time Frame"] > div > label:hover {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.15));
            border-color: rgba(99, 102, 241, 0.3);
            color: #f8fafc;
            transform: translateY(-1px);
        }

        div[data-testid="stRadio"][aria-label="Chart Time Frame"] > div > label[data-checked="true"] {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.25));
            border: 1px solid rgba(99, 102, 241, 0.5);
            color: #f8fafc;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
        }

        /* Hide radio circles */
        div[data-testid="stRadio"][aria-label="Chart Time Frame"] > div > label > div:first-child {
            display: none !important;
        }

        div[data-testid="stRadio"][aria-label="Chart Time Frame"] input[type="radio"] {
            display: none !important;
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

    # Map time frame to yfinance parameters (more data points for detail)
    period_map = {
        '1D': {'period': '1d', 'interval': '5m'},
        '5D': {'period': '5d', 'interval': '15m'},
        '1M': {'period': '1mo', 'interval': '1h'},
        '3M': {'period': '3mo', 'interval': '1d'},
        '6M': {'period': '6mo', 'interval': '1d'},
        '1Y': {'period': '1y', 'interval': '1d'}
    }

    st.markdown("<div style='margin: 0.75rem 0;'></div>", unsafe_allow_html=True)

    # Import plotly for sparkline charts
    import plotly.graph_objects as go
    import yfinance as yf

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
                    # Fetch data with appropriate interval for detail
                    ticker = yf.Ticker(index_info['ticker'])
                    hist = ticker.history(**period_map[chart_timeframe])

                    if not hist.empty and len(hist) > 1:
                        # Current price and change
                        current_price = hist['Close'].iloc[-1]
                        prev_price = hist['Close'].iloc[0]  # First price in period
                        change = current_price - prev_price
                        change_pct = (change / prev_price * 100) if prev_price > 0 else 0

                        # Determine colors based on performance
                        trend_color = '#10b981' if change_pct >= 0 else '#ef4444'
                        fill_color = 'rgba(16, 185, 129, 0.1)' if change_pct >= 0 else 'rgba(239, 68, 68, 0.1)'

                        # Create detailed sparkline chart
                        fig = go.Figure()

                        fig.add_trace(go.Scatter(
                            x=hist.index,
                            y=hist['Close'],
                            mode='lines',
                            line=dict(
                                color=trend_color,
                                width=2
                            ),
                            fill='tozeroy',
                            fillcolor=fill_color,
                            hovertemplate='%{y:,.2f}<br>%{x|%b %d, %H:%M}<extra></extra>'
                        ))

                        fig.update_layout(
                            height=100,
                            margin=dict(l=0, r=0, t=0, b=20),
                            xaxis=dict(
                                showgrid=False,
                                showticklabels=True,
                                tickfont=dict(size=8, color='#64748b'),
                                tickformat='%b %d' if chart_timeframe in ['1M', '3M', '6M', '1Y'] else '%H:%M'
                            ),
                            yaxis=dict(showgrid=False, showticklabels=False),
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
                        st.warning(f"No data: {index_info['name']}")

                except Exception as e:
                    st.error(f"Error: {index_info['name']}")

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
                    st.markdown(f"""
                    <div style="
                        background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(15,23,42,0.98));
                        border-left: 4px solid {signal['color']};
                        padding: 1rem;
                        border-radius: 0.75rem;
                        margin-bottom: 0.75rem;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.2);
                    ">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="font-size: 1.75rem;">{signal['emoji']}</span>
                            <div style="text-align: right;">
                                <div style="
                                    background: {signal['color']};
                                    color: #0f172a;
                                    padding: 0.25rem 0.625rem;
                                    border-radius: 0.375rem;
                                    font-size: 0.7rem;
                                    font-weight: 700;
                                    text-transform: uppercase;
                                    margin-bottom: 0.25rem;
                                ">{signal['signal_type'].replace('_', ' ')}</div>
                                <div style="
                                    font-size: 0.75rem;
                                    color: #10b981;
                                    font-weight: 600;
                                ">Confidence: {signal['confidence']:.0f}%</div>
                            </div>
                        </div>

                        <p style="margin: 0; font-size: 1.1rem; font-weight: 600; color: #f8fafc;">
                            {signal['sector']} ({signal['ticker']})
                        </p>

                        <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #cbd5e1; line-height: 1.4;">
                            {signal['message']}
                        </p>

                        <div style="
                            margin-top: 0.75rem;
                            padding: 0.625rem;
                            background: rgba(99, 102, 241, 0.1);
                            border-radius: 0.5rem;
                            font-size: 0.75rem;
                            color: #94a3b8;
                            line-height: 1.5;
                        ">
                            {signal['explanation']}
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
            else:
                st.info("📊 No high-confidence bullish signals detected.")

        with alert_col2:
            st.markdown("#### 📉 Bearish & Consolidation Signals")

            # Show bearish first, then consolidation
            combined_signals = bearish_signals + other_signals

            if combined_signals:
                for signal in combined_signals[:5]:  # Top 5
                    bg_color = 'rgba(239,68,68,0.15)' if 'BEARISH' in signal.get('signal_type', '') else 'rgba(245,158,11,0.15)'
                    text_color = '#ef4444' if 'BEARISH' in signal.get('signal_type', '') else '#f59e0b'

                    st.markdown(f"""
                    <div style="
                        background: linear-gradient(135deg, {bg_color}, rgba(15,23,42,0.98));
                        border-left: 4px solid {signal['color']};
                        padding: 1rem;
                        border-radius: 0.75rem;
                        margin-bottom: 0.75rem;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.2);
                    ">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="font-size: 1.75rem;">{signal['emoji']}</span>
                            <div style="text-align: right;">
                                <div style="
                                    background: {signal['color']};
                                    color: #0f172a;
                                    padding: 0.25rem 0.625rem;
                                    border-radius: 0.375rem;
                                    font-size: 0.7rem;
                                    font-weight: 700;
                                    text-transform: uppercase;
                                    margin-bottom: 0.25rem;
                                ">{signal['signal_type'].replace('_', ' ')}</div>
                                <div style="
                                    font-size: 0.75rem;
                                    color: {text_color};
                                    font-weight: 600;
                                ">Confidence: {signal['confidence']:.0f}%</div>
                            </div>
                        </div>

                        <p style="margin: 0; font-size: 1.1rem; font-weight: 600; color: #f8fafc;">
                            {signal['sector']} ({signal['ticker']})
                        </p>

                        <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #cbd5e1; line-height: 1.4;">
                            {signal['message']}
                        </p>

                        <div style="
                            margin-top: 0.75rem;
                            padding: 0.625rem;
                            background: rgba(99, 102, 241, 0.1);
                            border-radius: 0.5rem;
                            font-size: 0.75rem;
                            color: #94a3b8;
                            line-height: 1.5;
                        ">
                            {signal['explanation']}
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
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
