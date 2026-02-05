"""
ATLAS Terminal - Market Regime Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_market_regime():
    """Render the Market Regime page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import *
    from ui.components import ATLAS_TEMPLATE

    st.markdown("**Quantitative regime detection using observable market indicators**")

    st.info("""
    **📊 Data-Driven Regime Detection:**
    - **VIX**: Volatility / fear gauge
    - **Treasury Yields**: Risk-free rate + recession signals
    - **Credit Spreads**: High yield vs investment grade
    - **Market Breadth**: Broad vs narrow leadership
    - **Momentum**: Recent market trends

    **Philosophy:** Observable data drives decisions, not hunches
    """)

    # Controls
    col1, col2 = st.columns([3, 1])

    with col1:
        if st.button("🔄 Fetch Current Market Regime", type="primary", use_container_width=True):
            st.session_state['fetch_regime'] = True

    with col2:
        auto_refresh = st.checkbox("Auto-refresh", value=False, help="Refresh indicators every 5 minutes")

    # Fetch and display regime
    if st.session_state.get('fetch_regime') or auto_refresh:
        with st.spinner("Fetching real-time market indicators..."):
            try:
                from regime_detector import QuantitativeRegimeDetector

                # Initialize detector
                detector = QuantitativeRegimeDetector()

                # Detect regime
                regime_info = detector.detect_regime()

                # Store in session state
                st.session_state['regime_info'] = regime_info
                st.session_state['regime_detector'] = detector

                # ==================================================================
                # REGIME CLASSIFICATION BANNER
                # ==================================================================

                st.markdown("---")
                st.markdown("### 🎯 Current Market Regime")

                regime = regime_info['regime']
                regime_label = regime_info['regime_label']
                regime_color = regime_info['regime_color']
                confidence = regime_info['confidence']
                score = regime_info['score']
                max_score = regime_info['max_score']

                # Regime descriptions
                regime_descriptions = {
                    'risk_on': '**Markets favorable for growth and cyclical assets.** Investors are taking on risk. Overweight tech, financials, discretionary.',
                    'risk_off': '**Markets favoring defensive and safe-haven assets.** Investors are reducing risk. Overweight utilities, staples, healthcare.',
                    'transitional': '**Markets in flux with mixed signals.** Some indicators bullish, others bearish. Balanced approach recommended.',
                    'neutral': '**Markets balanced with no clear directional bias.** No strong tilt in either direction. Maintain current allocation.'
                }

                # Display regime banner
                if regime == 'risk_on':
                    banner_color = "rgba(16,185,129,0.15)"
                    border_color = "#10b981"
                elif regime == 'risk_off':
                    banner_color = "rgba(239,68,68,0.15)"
                    border_color = "#ef4444"
                elif regime == 'transitional':
                    banner_color = "rgba(251,191,36,0.15)"
                    border_color = "#fbbf24"
                else:
                    banner_color = "rgba(148,163,184,0.15)"
                    border_color = "#94a3b8"

                st.markdown(f"""
                <div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95));
                            backdrop-filter: blur(24px); padding: 1.5rem; border-radius: 20px; margin-bottom: 1rem;
                            border: 1px solid rgba(99,102,241,0.2); box-shadow: 0 4px 24px rgba(0,0,0,0.2);
                            position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, {border_color}, #6366f1); opacity: 0.8;"></div>
                    <h2 style="margin: 0; color: #f8fafc; font-size: 1.75rem;">
                        {regime_color} <strong>{regime_label}</strong>
                    </h2>
                    <p style="margin: 0.5rem 0 0 0; color: #e2e8f0; font-size: 1.1rem;">
                        {regime_descriptions[regime]}
                    </p>
                    <p style="margin: 0.75rem 0 0 0; color: #cbd5e1; font-size: 0.9rem;">
                        <strong>Confidence:</strong> {confidence:.0f}% | <strong>Score:</strong> {score:+d}/{max_score}
                    </p>
                </div>
                """, unsafe_allow_html=True)

                # ==================================================================
                # MARKET INDICATORS DASHBOARD
                # ==================================================================

                st.markdown("---")
                st.markdown("### 📊 Market Indicators")

                indicators = regime_info['indicators']

                # Create tabs for each indicator category
                ind_tab1, ind_tab2, ind_tab3, ind_tab4, ind_tab5 = st.tabs([
                    "📉 VIX", "💵 Yields", "💳 Credit", "📊 Breadth", "📈 Momentum"
                ])

                with ind_tab1:
                    st.markdown("#### VIX (Fear Gauge)")
                    vix = indicators.get('vix', {})

                    if not vix.get('error'):
                        col1, col2, col3, col4 = st.columns(4)

                        with col1:
                            st.metric("Current VIX", f"{vix['current']:.1f}",
                                     help="CBOE Volatility Index")

                        with col2:
                            st.metric("5-Day Change", f"{vix['change_5d']:+.1f}%")

                        with col3:
                            st.metric("1-Month Avg", f"{vix['avg_1m']:.1f}")

                        with col4:
                            st.metric("Signal", f"{vix['color']} {vix['signal']}")

                        st.info(f"**Interpretation:** {vix['description']}")

                        # VIX interpretation guide
                        with st.expander("📖 VIX Guide"):
                            st.markdown("""
                            **VIX Levels:**
                            - **<15**: Complacency (very low volatility) → RISK-ON
                            - **15-20**: Normal volatility → NEUTRAL
                            - **20-30**: Elevated fear → CAUTION
                            - **>30**: Panic (high volatility) → RISK-OFF

                            VIX measures expected volatility over next 30 days.
                            """)

                with ind_tab2:
                    st.markdown("#### Treasury Yields & Yield Curve")
                    yields = indicators.get('yields', {})

                    if not yields.get('error'):
                        col1, col2, col3, col4 = st.columns(4)

                        with col1:
                            st.metric("10Y Yield", f"{yields['10y']:.2f}%")

                        with col2:
                            st.metric("2Y Yield", f"{yields['2y']:.2f}%")

                        with col3:
                            st.metric("Yield Curve", f"{yields['curve']:+.2f}%",
                                     help="10Y - 2Y spread")

                        with col4:
                            st.metric("Signal", f"{yields['curve_color']} {yields['curve_signal']}")

                        st.info(f"**Interpretation:** {yields['description']}")

                        # Yield curve guide
                        with st.expander("📖 Yield Curve Guide"):
                            st.markdown("""
                            **Yield Curve (10Y - 2Y):**
                            - **Inverted (<0%)**: Strong recession signal → RISK-OFF
                            - **Flat (0-0.5%)**: Economic slowdown concern → CAUTION
                            - **Steep (>0.5%)**: Healthy economic growth → RISK-ON

                            Inverted curves have preceded all recessions since 1950.
                            """)

                with ind_tab3:
                    st.markdown("#### Credit Spreads (HYG vs LQD)")
                    spreads = indicators.get('credit_spreads', {})

                    if not spreads.get('error'):
                        col1, col2, col3, col4 = st.columns(4)

                        with col1:
                            st.metric("HYG/LQD Ratio", f"{spreads['current_ratio']:.4f}")

                        with col2:
                            st.metric("3-Month Change", f"{spreads['change_3m']:+.1f}%")

                        with col3:
                            st.metric("6-Month Change", f"{spreads['change_6m']:+.1f}%")

                        with col4:
                            st.metric("Signal", f"{spreads['color']} {spreads['signal']}")

                        st.info(f"**Interpretation:** {spreads['description']}")

                        # Credit spread guide
                        with st.expander("📖 Credit Spread Guide"):
                            st.markdown("""
                            **Credit Spreads:**
                            - **Tightening (rising ratio)**: Investors confident → RISK-ON
                            - **Widening (falling ratio)**: Credit stress → RISK-OFF

                            HYG = High Yield Corporate Bonds (junk bonds)
                            LQD = Investment Grade Corporate Bonds

                            Widening spreads mean investors demand higher premium for credit risk.
                            """)

                with ind_tab4:
                    st.markdown("#### Market Breadth (SPY vs RSP)")
                    breadth = indicators.get('breadth', {})

                    if not breadth.get('error'):
                        col1, col2, col3, col4 = st.columns(4)

                        with col1:
                            st.metric("SPY 1M Return", f"{breadth['spy_1m_return']:+.1f}%")

                        with col2:
                            st.metric("RSP 1M Return", f"{breadth['rsp_1m_return']:+.1f}%")

                        with col3:
                            st.metric("Breadth", f"{breadth['breadth_1m']:+.1f}%",
                                     help="RSP - SPY return")

                        with col4:
                            st.metric("Signal", f"{breadth['color']} {breadth['signal']}")

                        st.info(f"**Interpretation:** {breadth['description']}")

                        # Breadth guide
                        with st.expander("📖 Market Breadth Guide"):
                            st.markdown("""
                            **Market Breadth (RSP - SPY):**
                            - **Positive (+)**: Equal-weight outperforming → HEALTHY (RISK-ON)
                            - **Negative (-)**: Cap-weighted outperforming → NARROW (CAUTION)

                            SPY = Market-cap weighted (large caps dominate)
                            RSP = Equal-weight (all 500 stocks equal)

                            Healthy rallies have broad participation, not just big tech.
                            """)

                with ind_tab5:
                    st.markdown("#### Market Momentum")
                    momentum = indicators.get('momentum', {})

                    if not momentum.get('error'):
                        col1, col2, col3, col4 = st.columns(4)

                        with col1:
                            st.metric("S&P 500 Price", f"${momentum['current_price']:.2f}")

                        with col2:
                            st.metric("vs 20-Day MA", f"{momentum['above_20ma']:+.1f}%")

                        with col3:
                            st.metric("1-Month Momentum", f"{momentum['momentum_1m']:+.1f}%")

                        with col4:
                            st.metric("Signal", f"{momentum['color']} {momentum['signal']}")

                        st.info(f"**Interpretation:** {momentum['description']}")

                        # Momentum guide
                        with st.expander("📖 Momentum Guide"):
                            st.markdown("""
                            **Momentum Signals:**
                            - **Strong uptrend**: Price > MA, positive momentum → RISK-ON
                            - **Strong downtrend**: Price < MA, negative momentum → RISK-OFF
                            - **Neutral**: Mixed signals → NEUTRAL

                            Moving averages help identify trend direction.
                            """)

                # ==================================================================
                # REASONING BREAKDOWN
                # ==================================================================

                st.markdown("---")
                st.markdown("### 🧠 Why This Regime?")

                st.markdown("**Indicators contributing to regime classification:**")

                for reason in regime_info['reasoning']:
                    st.markdown(f"• {reason}")

                # ==================================================================
                # SECTOR TILTS
                # ==================================================================

                st.markdown("---")
                st.markdown("### 📊 Recommended Sector Tilts")

                sector_tilts = detector.get_sector_tilts(regime)

                # Create DataFrame
                tilt_data = []
                for sector, tilt in sorted(sector_tilts.items(), key=lambda x: x[1], reverse=True):
                    if tilt > 1.0:
                        action = 'OVERWEIGHT'
                        color = '🟢'
                    elif tilt < 1.0:
                        action = 'UNDERWEIGHT'
                        color = '🔴'
                    else:
                        action = 'NEUTRAL'
                        color = '⚪'

                    tilt_data.append({
                        ' ': color,
                        'Sector': sector,
                        'Tilt': f"{tilt:.2f}x",
                        'Action': action,
                        'Weight Change': f"{(tilt - 1.0) * 100:+.0f}%"
                    })

                tilt_df = pd.DataFrame(tilt_data)

                st.dataframe(tilt_df, use_container_width=True, hide_index=True)

                st.caption("""
                **How to use:** Multiply your target sector weights by the tilt.
                Example: If Technology normally 20%, in RISK-ON with 1.30x tilt → 26%
                """)

                # ==================================================================
                # TIMESTAMP
                # ==================================================================

                st.markdown("---")
                st.caption(f"📅 Last updated: {regime_info['timestamp'].strftime('%Y-%m-%d %H:%M:%S')}")

            except Exception as e:
                st.error(f"❌ Regime detection error: {str(e)}")
                import traceback
                with st.expander("Error Details"):
                    st.code(traceback.format_exc())
                st.info("💡 Ensure you have internet connection for fetching market data")

    else:
        st.info("👆 Click **Fetch Current Market Regime** to analyze current market conditions")

        # Show previous regime if available
        if 'regime_info' in st.session_state:
            prev_regime = st.session_state['regime_info']
            st.markdown("---")
            st.markdown(f"**Last Regime Detected:** {prev_regime['regime_color']} {prev_regime['regime_label']}")
            st.caption(f"Last updated: {prev_regime['timestamp'].strftime('%Y-%m-%d %H:%M:%S')}")


    # ========================================================================
    # QUANT OPTIMIZER (v11.0)

