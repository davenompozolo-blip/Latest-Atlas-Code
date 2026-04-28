"""
ATLAS Terminal - Valuation House Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from app.config import COLORS
from ui.theme import ATLAS_COLORS as THEME
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator
from core.charts import apply_chart_theme

INSTITUTIONAL_DCF_AVAILABLE = False

# Semantic colors from theme (used throughout for metric thresholds)
_GREEN = THEME['success']       # #10b981
_AMBER = THEME['warning_light'] # #fbbf24
_ORANGE = THEME['warning']      # #f59e0b  (regime / impact warnings)
_RED = THEME['danger']          # #ef4444
_MUTED = THEME['text_muted']    # rgba(255,255,255,0.28)
_VIOLET = THEME['secondary']    # #8b5cf6
_CYAN = THEME['teal']           # Teal-cyan (info / neutral accent)
_SLATE = '#94a3b8'              # Neutral slate (for N/A states)


def _delta_color(delta, positive_is_good=True):
    """Return color based on the sign of a delta value."""
    if delta > 0:
        return _GREEN if positive_is_good else _RED
    if delta < 0:
        return _RED if positive_is_good else _GREEN
    return _SLATE


def _metric_color(value, green_below=None, green_above=None, amber_below=None, amber_above=None):
    """Return green/amber/red color based on threshold direction.

    Usage patterns:
        _metric_color(wacc, green_below=0.08, amber_below=0.12)  → green if <8%, amber if <12%, else red
        _metric_color(roe, green_above=0.15, amber_above=0.10)   → green if >15%, amber if >10%, else red
    """
    if green_below is not None:
        if value < green_below:
            return _GREEN
        if amber_below is not None and value < amber_below:
            return _AMBER
        return _RED
    if green_above is not None:
        if value > green_above:
            return _GREEN
        if amber_above is not None and value > amber_above:
            return _AMBER
        return _RED
    return _MUTED


def render_valuation_house():
    """Render the Valuation House page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import (
        # Data Functions
        ATLASFormatter,
        fetch_company_financials,
        fetch_peer_companies,
        fetch_analyst_data,
        show_toast,
        # Calculation Functions
        calculate_dcf_value,
        calculate_wacc,
        calculate_cost_of_equity,
        calculate_terminal_value,
        calculate_gordon_growth_ddm,
        calculate_multistage_ddm,
        calculate_residual_income,
        calculate_peer_multiples,
        calculate_sotp_valuation,
        calculate_smart_assumptions,
        calculate_consensus_valuation,
        apply_relative_valuation,
        # Advanced DCF Engine (Enhanced Valuation House)
        calculate_credit_spread,
        calculate_wacc_detailed,
        project_fcff_advanced,
        project_fcfe_advanced,
        calculate_terminal_value_exit_multiple,
        calculate_blended_terminal_value,
        calculate_roic_metrics,
        calculate_implied_growth_rate,
    )
    from ui.components import ATLAS_TEMPLATE
    from ui.atlas_css import metric_card
    from analytics.valuation_helpers import (
        convert_dashboard_projections,
        calc_upside_downside,
        calc_net_debt,
        resolve_dcf_defaults,
        assemble_trap_inputs,
        assemble_monte_carlo_company_data,
        assemble_validation_assumptions,
        estimate_current_dividend,
        assemble_company_financials_for_relative,
        derive_wacc,
    )

    # Valuation scenario presets (extracted from atlas_app.py)
    VALUATION_SCENARIOS = {
        'BEAR': {
            'name': '🐻 Bear Case',
            'revenue_growth': -0.05,
            'terminal_growth': 0.015,
            'risk_premium': 0.08,
            'capex_pct': 0.07,
            'description': 'Conservative: Negative growth, higher risk premium, elevated capex'
        },
        'BASE': {
            'name': '📊 Base Case',
            'revenue_growth': 0.05,
            'terminal_growth': 0.025,
            'risk_premium': 0.06,
            'capex_pct': 0.05,
            'description': 'Realistic: Moderate growth assumptions, normal operating conditions'
        },
        'BULL': {
            'name': '🚀 Bull Case',
            'revenue_growth': 0.15,
            'terminal_growth': 0.035,
            'risk_premium': 0.05,
            'capex_pct': 0.04,
            'description': 'Optimistic: High growth, lower risk premium, efficient capex'
        }
    }

    # Model Inputs Dashboard (optional analytics module)
    try:
        from analytics.model_inputs_ui import display_model_inputs_dashboard
        MODEL_INPUTS_DASHBOARD_AVAILABLE = True
    except ImportError:
        MODEL_INPUTS_DASHBOARD_AVAILABLE = False
        display_model_inputs_dashboard = None

    # SBC Integration (optional analytics module)
    try:
        from analytics.sbc_forecaster import (
            SBCForecaster, SBCForecastConfig, SBCForecastMethod,
            integrate_sbc_with_fcff, create_sbc_comparison_analysis
        )
        from analytics.sbc_ui import display_sbc_valuation_impact
        SBC_AVAILABLE = True
    except ImportError:
        SBC_AVAILABLE = False

    # Optional DCF Regime Overlay
    try:
        from dcf_regime_overlay import DCFRegimeOverlay
    except ImportError:
        DCFRegimeOverlay = None

    # Institutional-grade DCF enhancements (optional)
    try:
        from valuation.atlas_dcf_institutional import (
            DCFAssumptionManager,
            DCFValidator,
            RobustDCFEngine,
            MonteCarloDCF,
            display_validation_warnings,
            display_monte_carlo_results
        )
        INSTITUTIONAL_DCF_AVAILABLE = True
    except ImportError:
        INSTITUTIONAL_DCF_AVAILABLE = False

    st.markdown("### Professional DCF Valuation Engine with Smart Assumptions")

    st.info("🎯 **New Feature:** Toggle between Manual and Smart Assumptions for realistic valuations!")

    # Company Search
    st.markdown("---")
    st.markdown("#### 🔍 Company Search")

    col1, col2, col3 = st.columns([3, 1, 1])

    # Auto-prefill if arriving from Equity Research bridge
    _prefill = st.session_state.pop("valuation_prefill_ticker", None)
    if _prefill:
        st.session_state["_vh_ticker_default"] = _prefill

    with col1:
        ticker_input = st.text_input(
            "Enter Ticker Symbol",
            value=st.session_state.get("_vh_ticker_default", ""),
            placeholder="e.g., AAPL, MSFT, GOOGL",
            help="Enter any publicly traded company ticker",
            key="vh_ticker_input",
        ).upper()

    with col2:
        search_button = st.button("🚀 Load Company", type="primary", use_container_width=True)

    with col3:
        # Alpha Vantage Fetch Financials button
        try:
            from core.alpha_vantage import av_client, ALPHA_VANTAGE_AVAILABLE
        except ImportError:
            ALPHA_VANTAGE_AVAILABLE = False
            av_client = None
        av_fetch_button = st.button(
            "📡 Fetch Financials",
            use_container_width=True,
            help="Auto-fill DCF inputs from Alpha Vantage (cached 24hr)",
            disabled=not ALPHA_VANTAGE_AVAILABLE
        )
        if ALPHA_VANTAGE_AVAILABLE:
            st.caption("Uses up to 3 API calls for new tickers · Free: cached 24hrs")

    # Auto-load when arriving from Equity Research (prefill present and company not yet loaded)
    _auto_load = (
        ticker_input
        and st.session_state.get("_vh_ticker_default") == ticker_input
        and "valuation_company" not in st.session_state
    )
    if _auto_load:
        st.session_state.pop("_vh_ticker_default", None)

    if (search_button and ticker_input) or _auto_load:
        with st.spinner(f"📊 Fetching data for {ticker_input}..."):
            company_data = fetch_company_financials(ticker_input)

            if company_data['success']:
                st.session_state['valuation_company'] = company_data
                st.success(f"✅ Loaded {company_data['company']['name']}")
            else:
                st.error(f"❌ Could not fetch data: {company_data.get('error', 'Unknown error')}")

    # Alpha Vantage: Fetch and auto-fill DCF inputs
    if av_fetch_button and ticker_input and ALPHA_VANTAGE_AVAILABLE and av_client is not None:
        with st.spinner(f"📡 Fetching Alpha Vantage financials for {ticker_input}..."):
            try:
                dcf_inputs = av_client.get_dcf_inputs(ticker_input)
                if dcf_inputs:
                    st.session_state['av_financials'] = dcf_inputs
                    st.success(f"✅ Alpha Vantage data loaded for {ticker_input} — DCF inputs auto-filled below")

                    # Show fetched data summary
                    with st.expander("📊 Alpha Vantage DCF Inputs", expanded=True):
                        av_col1, av_col2, av_col3, av_col4 = st.columns(4)
                        with av_col1:
                            st.metric("Revenue", f"${dcf_inputs.get('revenue', 0)/1e9:.1f}B")
                            st.metric("EBITDA", f"${dcf_inputs.get('ebitda', 0)/1e9:.1f}B")
                        with av_col2:
                            st.metric("Net Income", f"${dcf_inputs.get('net_income', 0)/1e9:.1f}B")
                            st.metric("Free Cash Flow", f"${dcf_inputs.get('free_cash_flow', 0)/1e9:.1f}B")
                        with av_col3:
                            st.metric("Revenue Growth", f"{dcf_inputs.get('revenue_growth', 0)*100:.1f}%")
                            st.metric("Profit Margin", f"{dcf_inputs.get('profit_margin', 0)*100:.1f}%")
                        with av_col4:
                            st.metric("Beta", f"{dcf_inputs.get('beta', 1.0):.2f}")
                            st.metric("Shares Out", f"{dcf_inputs.get('shares_outstanding', 0)/1e9:.2f}B")
                else:
                    st.warning(f"No Alpha Vantage data available for {ticker_input}")
            except (ConnectionError, TimeoutError, ValueError, KeyError, TypeError) as e:
                st.error(f"Alpha Vantage fetch failed: {e}")

    # Display valuation if company is loaded
    if 'valuation_company' in st.session_state:
        company = st.session_state['valuation_company']['company']
        financials = st.session_state['valuation_company']['financials']

        st.markdown("---")

        # Company Overview
        st.markdown(f"### 📊 {company['name']} ({company['ticker']})")

        col1, col2, col3, col4, col5 = st.columns(5)

        # Current Price
        with col1:
            st.markdown(metric_card('💰', 'CURRENT PRICE', f'{format_currency(company["current_price"])}', _GREEN, 'Market Price', accent='green'), unsafe_allow_html=True)

        # Market Cap
        with col2:
            mkt_cap_b = company['market_cap'] / 1e9 if company['market_cap'] > 0 else 0
            mkt_cap_tier = 'Large Cap' if mkt_cap_b > 10 else ('Mid Cap' if mkt_cap_b > 2 else 'Small Cap')
            st.markdown(metric_card('📊', 'MARKET CAP', f'{format_large_number(company["market_cap"])}', _VIOLET, f'{mkt_cap_tier}', accent='purple'), unsafe_allow_html=True)

        # Sector
        with col3:
            st.markdown(metric_card('🏢', 'SECTOR', f'{company["sector"]}', _CYAN, 'Industry Class', accent='cyan'), unsafe_allow_html=True)

        # Beta
        with col4:
            beta_val = company['beta']
            beta_color = _metric_color(beta_val, green_below=1.0, amber_below=1.5)
            beta_status = 'Low Volatility' if beta_val < 1.0 else ('Market Average' if beta_val < 1.5 else 'High Volatility')
            st.markdown(metric_card('📈', 'BETA', f'{beta_val:.2f}', beta_color, f'{beta_status}', accent='amber'), unsafe_allow_html=True)

        # Forward P/E
        with col5:
            fwd_pe = company.get('forward_pe', None)
            if fwd_pe and fwd_pe != 'N/A':
                fwd_pe_color = _metric_color(fwd_pe, green_below=15, amber_below=25)
                fwd_pe_status = 'Undervalued' if fwd_pe < 15 else ('Fair Value' if fwd_pe < 25 else 'Expensive')
                fwd_pe_display = f"{fwd_pe:.1f}"
            else:
                fwd_pe_color = _SLATE
                fwd_pe_status = 'No Data'
                fwd_pe_display = 'N/A'
            st.markdown(metric_card('💹', 'FORWARD P/E', f'{fwd_pe_display}', fwd_pe_color, f'{fwd_pe_status}', accent='red'), unsafe_allow_html=True)

        st.markdown("---")

        # ENHANCED: Comprehensive Valuation Method Selection
        st.markdown("#### 🎯 Valuation Method Selection")

        valuation_method = st.selectbox(
            "Choose Valuation Approach",
            options=[
                '🎯 Consensus Valuation (Multi-Method Aggregate)',
                'FCFF DCF (Free Cash Flow to Firm)',
                'FCFE DCF (Free Cash Flow to Equity)',
                'Gordon Growth DDM (Dividend Discount Model)',
                'Multi-Stage DDM (2-Stage Dividend Model)',
                'Residual Income Model (Economic Profit)',
                'Relative Valuation (Peer Multiples)',
                'Sum-of-the-Parts (SOTP)'
            ],
            help="Select from 8 institutional-grade valuation methodologies"
        )

        # Extract method key for logic
        if 'Consensus' in valuation_method:
            method_key = 'CONSENSUS'
        elif 'FCFF' in valuation_method:
            method_key = 'FCFF'
        elif 'FCFE' in valuation_method:
            method_key = 'FCFE'
        elif 'Gordon' in valuation_method:
            method_key = 'GORDON_DDM'
        elif 'Multi-Stage' in valuation_method:
            method_key = 'MULTISTAGE_DDM'
        elif 'Residual' in valuation_method:
            method_key = 'RESIDUAL_INCOME'
        elif 'Relative' in valuation_method:
            method_key = 'RELATIVE'
        else:
            method_key = 'SOTP'

        # Show method description
        method_descriptions = {
            'CONSENSUS': """🎯 **Consensus Valuation:** Intelligent aggregation of 7 valuation methods with automated weighting:
            - **FCFF DCF (25%)** - Most comprehensive firm valuation using smart assumptions
            - **FCFE DCF (20%)** - Equity DCF valuation using smart assumptions
            - **P/E Multiple (15%)** - Earnings-based comparison
            - **EV/EBITDA (15%)** - Enterprise value perspective
            - **PEG Ratio (10%)** - Growth-adjusted valuation
            - **P/B Multiple (10%)** - Book value anchor
            - **P/S Multiple (5%)** - Revenue-based valuation

            DCF methods use AI-generated smart assumptions based on sector benchmarks and company fundamentals. Invalid or nonsensical results are automatically excluded using statistical outlier detection.""",
            'FCFF': "💼 **FCFF DCF:** Values the entire firm by discounting free cash flows available to all investors (debt + equity)",
            'FCFE': "💰 **FCFE DCF:** Values equity directly by discounting free cash flows available to equity holders only",
            'GORDON_DDM': "📈 **Gordon Growth DDM:** Values stocks using perpetual dividend growth (D₁ / (r - g)). Best for stable dividend payers",
            'MULTISTAGE_DDM': "🚀 **Multi-Stage DDM:** 2-phase model with high growth period transitioning to stable growth. Ideal for growing dividend stocks",
            'RESIDUAL_INCOME': "🎯 **Residual Income:** Edwards-Bell-Ohlson model valuing excess returns over cost of equity (BV + PV(RI))",
            'RELATIVE': "📊 **Relative Valuation:** Peer comparison using 6 multiples (P/E, P/B, P/S, PEG, EV/EBITDA, EV/EBIT)",
            'SOTP': "🏢 **Sum-of-the-Parts:** Values multi-segment companies by summing independent business unit valuations"
        }

        st.info(method_descriptions[method_key])

        # Scenario buttons only for DCF methods
        if method_key in ['FCFF', 'FCFE']:
            st.markdown("---")
            st.markdown("#### 🎯 Quick Scenarios")
            scenario_col1, scenario_col2, scenario_col3, scenario_col4 = st.columns([1, 1, 1, 2])

            scenario_selected = None

            with scenario_col1:
                if st.button(VALUATION_SCENARIOS['BEAR']['name'], use_container_width=True, key="bear_btn"):
                    scenario_selected = 'BEAR'
                    st.session_state['selected_scenario'] = 'BEAR'

            with scenario_col2:
                if st.button(VALUATION_SCENARIOS['BASE']['name'], use_container_width=True, key="base_btn"):
                    scenario_selected = 'BASE'
                    st.session_state['selected_scenario'] = 'BASE'

            with scenario_col3:
                if st.button(VALUATION_SCENARIOS['BULL']['name'], use_container_width=True, key="bull_btn"):
                    scenario_selected = 'BULL'
                    st.session_state['selected_scenario'] = 'BULL'

            with scenario_col4:
                if st.button("🔄 Reset to Manual", use_container_width=True, key="reset_btn"):
                    if 'selected_scenario' in st.session_state:
                        del st.session_state['selected_scenario']

            # Show active scenario
            if 'selected_scenario' in st.session_state:
                active_scenario = st.session_state['selected_scenario']
                st.success(f"✅ **Active Scenario:** {VALUATION_SCENARIOS[active_scenario]['name']} - {VALUATION_SCENARIOS[active_scenario]['description']}")

            # ============================================================
            # MODEL INPUTS DASHBOARD (ATLAS v11.0)
            # ============================================================
            st.markdown("---")
            st.markdown("#### 🎯 DCF Input Mode")

            use_model_inputs_dashboard = st.checkbox(
                "📊 Use Model Inputs Dashboard (Advanced)",
                value=False,
                help="Full transparency: DuPont ROE, SGR, live WACC, editable projections",
                key="use_model_inputs_dashboard"
            )

            if use_model_inputs_dashboard and MODEL_INPUTS_DASHBOARD_AVAILABLE:
                st.info("""
                **📊 Model Inputs Dashboard Active**

                You now have complete control and transparency:
                - 🔍 DuPont ROE breakdown
                - 📈 Sustainable Growth Rate → Terminal Growth
                - 🔴 **LIVE** 10-year Treasury yield → WACC
                - 💎 Diluted shares (Treasury Stock Method)
                - ✏️ Editable projections
                - 📊 Professional charts
                """)

                # Display the full dashboard
                dashboard_inputs = display_model_inputs_dashboard(company['ticker'])

                # Store dashboard inputs in session state for DCF calculation
                # Note: use_model_inputs_dashboard state is already managed by the checkbox widget
                st.session_state['dashboard_inputs'] = dashboard_inputs

                st.markdown("---")
                st.markdown("#### ✅ Ready to Run DCF")
                st.success(f"""
                **Model Inputs Configured:**
                - ROE: {dashboard_inputs['roe']*100:.2f}%
                - Terminal Growth: {dashboard_inputs['terminal_growth']*100:.2f}%
                - WACC: {dashboard_inputs['wacc']*100:.2f}%
                - Diluted Shares: {dashboard_inputs['diluted_shares']/1e6:.1f}M
                """)

            elif use_model_inputs_dashboard and not MODEL_INPUTS_DASHBOARD_AVAILABLE:
                st.error("❌ Model Inputs Dashboard module not available. Using simple mode.")
                use_model_inputs_dashboard = False

        # ============================================================
        # REGIME-AWARE DCF (PHASE 4)
        # ============================================================
        if method_key in ['FCFF', 'FCFE']:
            st.markdown("---")
            st.markdown("#### 🌐 Regime-Aware DCF (Phase 4)")

            use_regime_aware_dcf = st.checkbox(
                "🌐 Apply Market Regime Overlay to DCF",
                value=False,
                help="Adjust WACC and terminal growth based on current market regime",
                key="use_regime_aware_dcf"
            )

            if use_regime_aware_dcf:
                st.info("""
                **🌐 Regime-Aware DCF Active**

                Market regime impacts valuation assumptions:
                - **RISK-ON**: Lower WACC (-50 bps), Higher terminal growth (+25 bps) → More aggressive valuation
                - **RISK-OFF**: Higher WACC (+100 bps), Lower terminal growth (-50 bps) → More conservative valuation
                - **TRANSITIONAL**: Moderate adjustments (+25 bps WACC, -10 bps growth)
                - **NEUTRAL**: No adjustments (baseline DCF)

                Philosophy: "Cost of capital and growth expectations depend on market conditions"
                """)

                # Detect market regime
                with st.spinner("🔍 Detecting market regime..."):
                    try:
                        from dcf_regime_overlay import DCFRegimeOverlay

                        regime_overlay = DCFRegimeOverlay()

                        # Get baseline WACC and terminal growth
                        if use_model_inputs_dashboard and 'dashboard_inputs' in st.session_state:
                            baseline_wacc = st.session_state['dashboard_inputs']['wacc']
                            baseline_terminal_growth = st.session_state['dashboard_inputs']['terminal_growth']
                        else:
                            # Use default values if dashboard not active
                            baseline_wacc = 0.10  # 10% default
                            baseline_terminal_growth = 0.025  # 2.5% default

                        # Detect regime and get adjustments
                        regime_result = regime_overlay.detect_and_adjust(
                            baseline_wacc=baseline_wacc,
                            baseline_terminal_growth=baseline_terminal_growth,
                            apply_adjustments=True
                        )

                        # Store in session state for DCF calculation
                        st.session_state['regime_dcf_result'] = regime_result

                        # Display regime classification
                        regime_info = regime_result['regime_info']
                        regime = regime_info['regime']
                        regime_label = regime_info['regime_label']
                        confidence = regime_info['confidence']
                        score = regime_info['score']
                        max_score = regime_info['max_score']

                        # Regime banner colors
                        regime_colors = {
                            'risk_on': (_GREEN, '🟢'),
                            'risk_off': (_RED, '🔴'),
                            'transitional': (_ORANGE, '🟡'),
                            'neutral': (_SLATE, '⚪')
                        }
                        banner_color, regime_emoji = regime_colors.get(regime, (_SLATE, '⚪'))

                        st.markdown(f"""
                        <div style="background: linear-gradient(135deg, rgba(139,92,246,0.12), rgba(21,25,50,0.95));
                                    backdrop-filter: blur(24px); border-radius: 16px;
                                    border: 2px solid {banner_color}; padding: 1.5rem;
                                    box-shadow: 0 4px 24px rgba(0,0,0,0.3); margin: 1.5rem 0;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <span style="font-size: 2rem;">{regime_emoji}</span>
                                <div>
                                    <h3 style="margin: 0; color: {banner_color}; font-size: 1.5rem; font-weight: 800;">
                                        {regime_label} REGIME
                                    </h3>
                                    <p style="margin: 0.25rem 0 0 0; color: {_SLATE}; font-size: 0.9rem;">
                                        Confidence: {confidence:.0f}% | Score: {score:+d}/{max_score}
                                    </p>
                                </div>
                            </div>
                        </div>
                        """, unsafe_allow_html=True)

                        # DCF Adjustments Summary
                        st.markdown("#### 📊 DCF Input Adjustments")

                        col1, col2 = st.columns(2)

                        with col1:
                            st.markdown("**WACC Adjustment**")
                            wacc_delta = regime_result['wacc_adjustment_bps']
                            wacc_color = _delta_color(wacc_delta, positive_is_good=False)
                            st.metric(
                                "Baseline WACC",
                                f"{regime_result['baseline_wacc']:.2%}",
                                delta=None
                            )
                            st.metric(
                                "Regime-Adjusted WACC",
                                f"{regime_result['adjusted_wacc']:.2%}",
                                delta=f"{wacc_delta:+d} bps",
                                delta_color="inverse"  # Higher WACC is bad
                            )
                            st.caption(f"💡 {regime_result['wacc_explanation']}")

                        with col2:
                            st.markdown("**Terminal Growth Adjustment**")
                            tg_delta = regime_result['terminal_growth_adjustment_bps']
                            tg_color = _delta_color(tg_delta, positive_is_good=True)
                            st.metric(
                                "Baseline Terminal Growth",
                                f"{regime_result['baseline_terminal_growth']:.2%}",
                                delta=None
                            )
                            st.metric(
                                "Regime-Adjusted Growth",
                                f"{regime_result['adjusted_terminal_growth']:.2%}",
                                delta=f"{tg_delta:+d} bps",
                                delta_color="normal"  # Higher growth is good
                            )
                            st.caption(f"💡 {regime_result['terminal_growth_explanation']}")

                        # Valuation Impact Summary
                        impact = regime_result['valuation_impact']
                        if impact == 'AGGRESSIVE':
                            impact_color = _GREEN
                            impact_icon = '📈'
                            impact_msg = "Regime-adjusted inputs will produce HIGHER valuation (lower discount rate + higher growth)"
                        elif impact == 'CONSERVATIVE':
                            impact_color = _RED
                            impact_icon = '📉'
                            impact_msg = "Regime-adjusted inputs will produce LOWER valuation (higher discount rate + lower growth)"
                        elif impact == 'MODERATELY CONSERVATIVE':
                            impact_color = _ORANGE
                            impact_icon = '⚠️'
                            impact_msg = "Regime-adjusted inputs will produce MODERATELY LOWER valuation"
                        else:
                            impact_color = _SLATE
                            impact_icon = '➖'
                            impact_msg = "Regime-adjusted inputs will produce SIMILAR valuation (minimal adjustments)"

                        st.markdown(f"""
                        <div style="background: linear-gradient(135deg, var(--glow-primary, rgba(99,102,241,0.08)), rgba(21,25,50,0.95));
                                    backdrop-filter: blur(24px); padding: 1.25rem; margin: 1rem 0; border-radius: 20px;
                                    border: 1px solid rgba(99,102,241,0.2); box-shadow: 0 4px 24px rgba(0,0,0,0.2);
                                    position: relative; overflow: hidden;">
                            <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, {impact_color}, var(--blue, #6366f1)); opacity: 0.8;"></div>
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <span style="font-size: 1.5rem;">{impact_icon}</span>
                                <div>
                                    <strong style="color: {impact_color}; font-size: 1.1rem;">
                                        {impact} VALUATION
                                    </strong>
                                    <p style="margin: 0.25rem 0 0 0; color: var(--text-secondary, #cbd5e1); font-size: 0.9rem;">
                                        {impact_msg}
                                    </p>
                                </div>
                            </div>
                        </div>
                        """, unsafe_allow_html=True)

                    except (ValueError, KeyError, TypeError, AttributeError, ZeroDivisionError) as e:
                        st.error(f"❌ Error detecting market regime: {str(e)}")
                        import traceback
                        with st.expander("Error Details"):
                            st.code(traceback.format_exc())
                        st.info("💡 Regime-aware DCF disabled. Using baseline inputs.")
                        use_regime_aware_dcf = False

        # ============================================================
        # MULTI-STAGE DCF (ATLAS v11.0)
        # ============================================================
        if method_key in ['FCFF', 'FCFE']:
            st.markdown("---")
            st.markdown("#### 🚀 Multi-Stage DCF (Advanced)")

            use_multistage_dcf = st.checkbox(
                "🎯 Enable Multi-Stage DCF Model",
                value=False,
                help="Model different growth phases: Hypergrowth → Transition → Mature",
                key="use_multistage_dcf"
            )

            if use_multistage_dcf and MULTISTAGE_DCF_AVAILABLE:
                st.info("""
                **🎯 Multi-Stage DCF Active**

                Model realistic growth transitions:
                - Single-Stage: Mature companies (constant growth)
                - Two-Stage: Growth companies (high → stable)
                - Three-Stage: Hypergrowth tech (hypergrowth → declining → mature)

                Choose from pre-configured templates or customize each stage.
                """)

                # Store historical data for templates
                historical_data = {
                    'revenue': financials.get('revenue', 0),
                    'ebit': financials.get('ebit', 0),
                    'revenue_growth_3yr': company.get('revenue_growth_3yr', 0.10),
                    'tax_rate': financials.get('tax_rate', 0.21)
                }
                st.session_state['financial_data'] = historical_data

                # Display model selection and configuration
                multistage_config = display_model_selection(historical_data)

                if multistage_config:
                    st.session_state['multistage_config'] = multistage_config

                    # Generate projections button
                    st.markdown("---")
                    if st.button("🔄 Generate Multi-Stage Projections", type="primary"):
                        with st.spinner("Generating stage-based projections..."):
                            try:
                                engine = MultiStageProjectionEngine(multistage_config, historical_data)
                                projections = engine.generate_projections()

                                st.session_state['multistage_projections'] = projections
                                st.session_state['multistage_engine'] = engine

                                st.success(f"✅ Generated {len(projections)} years of projections across {len(multistage_config.stages)} stages")

                            except (ValueError, KeyError, TypeError, ZeroDivisionError, AttributeError) as e:
                                st.error(f"❌ Error generating projections: {str(e)}")

                    # Display projections and visualizations if available
                    if 'multistage_projections' in st.session_state:
                        projections = st.session_state['multistage_projections']

                        # Visualize stage transitions
                        st.markdown("---")
                        visualize_stage_transitions(multistage_config, projections)

                        # Run valuation button
                        st.markdown("---")
                        col1, col2 = st.columns(2)

                        with col1:
                            if st.button("🚀 RUN MULTI-STAGE DCF", type="primary", use_container_width=True):
                                with st.spinner("Calculating multi-stage DCF valuation..."):
                                    try:
                                        # Get diluted shares (from dashboard or default)
                                        diluted_shares = st.session_state.get('dashboard_inputs', {}).get(
                                            'diluted_shares',
                                            company.get('shares_outstanding', 1e9)
                                        )

                                        # Calculate net debt
                                        net_debt = calc_net_debt(financials.get('total_debt', 0), financials.get('cash', 0))

                                        # Get WACC and terminal growth (regime-adjusted if enabled)
                                        if use_regime_aware_dcf and 'regime_dcf_result' in st.session_state:
                                            regime_result = st.session_state['regime_dcf_result']
                                            dcf_wacc = regime_result['adjusted_wacc']
                                            dcf_terminal_growth = regime_result['adjusted_terminal_growth']
                                            st.info(f"🌐 Using regime-adjusted inputs: WACC={dcf_wacc:.2%}, Terminal Growth={dcf_terminal_growth:.2%}")
                                        else:
                                            dcf_wacc = multistage_config.wacc
                                            dcf_terminal_growth = multistage_config.terminal_growth_rate

                                        # Run multi-stage DCF
                                        dcf_result = calculate_multistage_dcf(
                                            projections=projections,
                                            terminal_growth=dcf_terminal_growth,
                                            wacc=dcf_wacc,
                                            diluted_shares=diluted_shares,
                                            net_debt=net_debt
                                        )

                                        st.session_state['multistage_dcf_result'] = dcf_result

                                        # Display results
                                        display_multistage_results(dcf_result, multistage_config)

                                    except (ValueError, KeyError, TypeError, ZeroDivisionError, AttributeError) as e:
                                        st.error(f"❌ Error calculating DCF: {str(e)}")
                                        import traceback
                                        st.code(traceback.format_exc())

                        with col2:
                            if st.button("📊 Export Projections", use_container_width=True):
                                # Export projections to DataFrame
                                if projections and isinstance(projections, (list, dict)):
                                    proj_df = pd.DataFrame(projections).T
                                    from core.atlas_table_formatting import render_generic_table
                                    col_defs_proj = [{'key': c, 'label': c, 'type': 'price' if any(kw in c.lower() for kw in ('revenue', 'ebitda', 'fcf', 'value', 'capex', 'income', 'cash')) else 'text'} for c in proj_df.columns]
                                    st.markdown(render_generic_table(proj_df, columns=col_defs_proj), unsafe_allow_html=True)

                                    # Offer download
                                    csv = proj_df.to_csv()
                                    st.download_button(
                                        "💾 Download CSV",
                                        csv,
                                        f"{ticker_input}_multistage_projections.csv",
                                        "text/csv"
                                    )
                                else:
                                    st.error("⚠️ No projections data available to export")

            elif use_multistage_dcf and not MULTISTAGE_DCF_AVAILABLE:
                st.error("❌ Multi-Stage DCF module not available.")

        st.markdown("---")

        # Smart Assumptions Toggle (only for DCF and RI methods - skip if dashboard is active)
        use_smart_assumptions = False
        if method_key in ['FCFF', 'FCFE', 'GORDON_DDM', 'MULTISTAGE_DDM', 'RESIDUAL_INCOME']:
            st.markdown("#### 🧠 Assumptions Mode")
            use_smart_assumptions = st.checkbox(
                "🤖 Use Smart Assumptions (AI-Generated)",
                help="Generate realistic assumptions based on sector averages, company size, and economic fundamentals"
            )

            if use_smart_assumptions:
                st.info("🤖 **Smart Mode Active:** Assumptions are generated based on sector benchmarks and economic reality")
                smart_params = calculate_smart_assumptions(company, financials)

        # Assumptions Panel
        st.markdown("---")
        st.markdown("#### 🎛️ Valuation Assumptions")

        # =================================================================
        # CONSENSUS VALUATION - MULTI-METHOD AGGREGATE
        # =================================================================
        if method_key == 'CONSENSUS':
            st.markdown("##### 🎯 Consensus Valuation Analysis")

            with st.spinner("Calculating consensus valuation across multiple methods..."):
                consensus_result = calculate_consensus_valuation(ticker_input, company, financials)

            if consensus_result['consensus_value']:
                # Display main result
                st.markdown("---")
                col1, col2, col3 = st.columns(3)

                # Consensus Fair Value
                with col1:
                    upside_pct = calc_upside_downside(consensus_result['consensus_value'], company['current_price'])
                    consensus_color = _metric_color(upside_pct, green_above=20, amber_above=-20)
                    consensus_status = 'Undervalued' if upside_pct > 20 else ('Fair Value' if upside_pct > -20 else 'Overvalued')
                    st.markdown(metric_card('🎯', 'CONSENSUS FAIR VALUE', f'${consensus_result["consensus_value"]:.2f}', consensus_color, f'{consensus_status} ({upside_pct:+.1f}%)', accent='green'), unsafe_allow_html=True)

                # Confidence Score
                with col2:
                    confidence_score = consensus_result['confidence_score']
                    confidence_color_hex = _metric_color(confidence_score, green_above=70, amber_above=50)
                    confidence_emoji = "🟢" if confidence_score >= 70 else ("🟡" if confidence_score >= 50 else "🔴")
                    confidence_label = 'High Confidence' if confidence_score >= 70 else ('Moderate' if confidence_score >= 50 else 'Low Confidence')
                    st.markdown(metric_card('📊', 'CONFIDENCE SCORE', f'{confidence_emoji} {confidence_score:.0f}/100', confidence_color_hex, f'{confidence_label} ({consensus_result["method_count"]} methods)', accent='purple'), unsafe_allow_html=True)

                # Current Price
                with col3:
                    st.markdown(metric_card('💰', 'CURRENT PRICE', f'${company["current_price"]:.2f}', _CYAN, 'Market Price', accent='cyan'), unsafe_allow_html=True)

                    if upside_pct > 20:
                        st.success("🚀 Potentially undervalued")
                    elif upside_pct < -20:
                        st.error("⚠️ Potentially overvalued")
                    else:
                        st.info("✅ Fairly valued")

                # Show breakdown of contributing methods
                st.markdown("---")
                st.markdown("#### 📊 Method Breakdown")

                # Get weights for display (must match weights in calculate_consensus_valuation)
                METHOD_WEIGHTS = {
                    'FCFF DCF': 0.25,
                    'FCFE DCF': 0.20,
                    'P/E Multiple': 0.15,
                    'EV/EBITDA': 0.15,
                    'PEG Ratio': 0.10,
                    'P/B Multiple': 0.10,
                    'P/S Multiple': 0.05
                }

                breakdown_data = []
                for method, value in consensus_result['contributing_methods'].items():
                    weight = METHOD_WEIGHTS.get(method, 0)
                    upside = ((value / company['current_price'] - 1) * 100) if company['current_price'] > 0 else 0
                    breakdown_data.append({
                        'Method': method,
                        'Fair Value': f"${value:.2f}",
                        'Weight': f"{weight*100:.0f}%",
                        'vs Current': f"{upside:+.1f}%",
                        'Status': '✅ Included'
                    })

                breakdown_df = pd.DataFrame(breakdown_data)
                from core.atlas_table_formatting import render_generic_table
                st.markdown(render_generic_table(breakdown_df, columns=[
                    {'key': 'Method', 'label': 'Method', 'type': 'text'},
                    {'key': 'Fair Value', 'label': 'Fair Value', 'type': 'text'},
                    {'key': 'Weight', 'label': 'Weight', 'type': 'text'},
                    {'key': 'vs Current', 'label': 'vs Current', 'type': 'change'},
                    {'key': 'Status', 'label': 'Status', 'type': 'text'},
                ]), unsafe_allow_html=True)

                # Show excluded methods
                if consensus_result['excluded_methods']:
                    with st.expander("⚠️ Excluded Methods"):
                        for method, reason in consensus_result['excluded_methods'].items():
                            st.warning(f"**{method}**: {reason}")

                # Visualization: Range of valuations
                st.markdown("---")
                st.markdown("#### 📈 Valuation Range")

                values = list(consensus_result['contributing_methods'].values())
                methods = list(consensus_result['contributing_methods'].keys())

                fig = go.Figure()

                # Bar chart of individual methods
                fig.add_trace(go.Bar(
                    x=methods,
                    y=values,
                    name='Method Valuations',
                    marker_color=COLORS['electric_blue'],
                    text=[f"${v:.2f}" for v in values],
                    textposition='auto'
                ))

                # Add current price line
                fig.add_hline(
                    y=company['current_price'],
                    line_dash="dash",
                    line_color="red",
                    annotation_text=f"Current: ${company['current_price']:.2f}",
                    annotation_position="right"
                )

                # Add consensus line
                fig.add_hline(
                    y=consensus_result['consensus_value'],
                    line_dash="solid",
                    line_color="green",
                    line_width=2,
                    annotation_text=f"Consensus: ${consensus_result['consensus_value']:.2f}",
                    annotation_position="left"
                )

                fig.update_layout(
                    title="Valuation Methods Comparison",
                    xaxis_title="Method",
                    yaxis_title="Fair Value ($)",
                    height=500,
                    showlegend=False
                )

                apply_chart_theme(fig)
                st.plotly_chart(fig, use_container_width=True)

            else:
                st.error("❌ Unable to calculate consensus valuation")
                st.warning("Insufficient valid data from valuation methods")

                if consensus_result['excluded_methods']:
                    st.subheader("Issues Found:")
                    for method, reason in consensus_result['excluded_methods'].items():
                        st.warning(f"**{method}**: {reason}")

        # =================================================================
        # DCF METHODS (FCFF / FCFE) - Existing comprehensive inputs
        # =================================================================
        elif method_key in ['FCFF', 'FCFE']:
            # Check if Model Inputs Dashboard is active
            dashboard_active = ('dashboard_inputs' in st.session_state and
                               st.session_state.get('use_model_inputs_dashboard', False))

            if dashboard_active:
                # =========================================================
                # DASHBOARD MODE: Use pre-calculated inputs from Model Inputs Dashboard
                # =========================================================
                st.success("✅ **Dashboard Mode Active** - Using inputs from Model Inputs Dashboard")

                dashboard_data = st.session_state['dashboard_inputs']

                # Extract dashboard inputs
                discount_rate = dashboard_data['wacc']  # Pre-calculated WACC
                terminal_growth = dashboard_data['terminal_growth']  # SGR-guided terminal growth
                shares = dashboard_data['diluted_shares']  # Diluted shares (Treasury Stock Method)
                dcf_projections_obj = dashboard_data.get('projections')  # DCFProjections object

                # Display what we're using (read-only summary)
                col1, col2, col3 = st.columns(3)

                # WACC (Discount Rate)
                with col1:
                    wacc_color = _metric_color(discount_rate, green_below=0.08, amber_below=0.12)
                    wacc_status = 'Low Cost' if discount_rate < 0.08 else ('Average Cost' if discount_rate < 0.12 else 'High Cost')
                    st.markdown(metric_card('💹', 'WACC (DISCOUNT RATE)', f'{discount_rate*100:.2f}%', wacc_color, wacc_status, accent='purple'), unsafe_allow_html=True)

                # Terminal Growth Rate
                with col2:
                    tgr_color = _metric_color(terminal_growth, green_below=0.03, amber_below=0.05)
                    tgr_status = 'Conservative' if terminal_growth < 0.03 else ('Moderate' if terminal_growth < 0.05 else 'Aggressive')
                    st.markdown(metric_card('📈', 'TERMINAL GROWTH RATE', f'{terminal_growth*100:.2f}%', tgr_color, tgr_status, accent='green'), unsafe_allow_html=True)

                # Diluted Shares
                with col3:
                    shares_m = shares / 1e6
                    st.markdown(metric_card('🔢', 'DILUTED SHARES', f'{shares_m:.1f}M', _CYAN, 'Treasury Stock Method', accent='cyan'), unsafe_allow_html=True)

                st.info("💡 To modify these inputs, edit them in the Model Inputs Dashboard above, then re-run valuation.")

            else:
                # =========================================================
                # MANUAL MODE: Show traditional input sliders
                # =========================================================
                tab1, tab2, tab3 = st.tabs(["📈 Growth & Operations", "💰 Cost of Capital", "🎯 Terminal Value"])

                with tab1:
                    st.markdown("##### Growth & Operating Assumptions")

                    col1, col2 = st.columns(2)

                    with col1:
                        # Determine revenue growth value
                        if use_smart_assumptions:
                            revenue_growth = smart_params['revenue_growth']
                            rev_gr_color = _metric_color(revenue_growth, green_above=0.10, amber_above=0.03)
                            rev_gr_status = 'Strong Growth' if revenue_growth > 0.10 else ('Moderate Growth' if revenue_growth > 0.03 else 'Slow Growth')
                            st.markdown(metric_card('📈', 'REVENUE GROWTH RATE', f'{revenue_growth*100:.1f}%', rev_gr_color, f'{rev_gr_status} \u2022 AI Generated', accent='green'), unsafe_allow_html=True)
                        elif 'selected_scenario' in st.session_state:
                            # Use scenario value
                            scenario_key = st.session_state['selected_scenario']
                            default_value = VALUATION_SCENARIOS[scenario_key]['revenue_growth'] * 100
                            revenue_growth = st.slider(
                                "Revenue Growth Rate (%)",
                                min_value=-10.0,
                                max_value=30.0,
                                value=default_value,
                                step=0.5,
                                key=f"rev_growth_{scenario_key}"
                            ) / 100
                        else:
                            revenue_growth = st.slider(
                                "Revenue Growth Rate (%)",
                                min_value=-10.0,
                                max_value=30.0,
                                value=5.0,
                                step=0.5
                            ) / 100

                        if use_smart_assumptions:
                            ebit_margin = smart_params['ebit_margin']
                            ebit_color = _metric_color(ebit_margin, green_above=0.20, amber_above=0.10)
                            ebit_status = 'High Margin' if ebit_margin > 0.20 else ('Healthy' if ebit_margin > 0.10 else 'Low Margin')
                            st.markdown(metric_card('💼', 'EBIT MARGIN', f'{ebit_margin*100:.1f}%', ebit_color, f'{ebit_status} \u2022 AI Generated', accent='purple'), unsafe_allow_html=True)
                        else:
                            ebit_margin = st.slider(
                                "EBIT Margin (%)",
                                min_value=0.0,
                                max_value=50.0,
                                value=20.0,
                                step=1.0
                            ) / 100

                        forecast_years = st.slider(
                            "Forecast Horizon (Years)",
                            min_value=3,
                            max_value=15,
                            value=smart_params['forecast_years'] if use_smart_assumptions else 5,
                            step=1
                        )

                    # Multi-Stage Growth Feature
                    st.markdown("---")
                    st.markdown("##### 🚀 Multi-Stage Growth (Advanced)")

                    use_multistage = st.checkbox(
                        "Enable Multi-Stage Revenue Growth",
                        value=False,
                        help="Model different growth phases: High Growth → Transition → Mature",
                        key="enable_multistage_growth"
                    )

                    if use_multistage:
                        st.info("""
                        **Multi-Stage Growth Model**
                        - **Stage 1 (High Growth)**: Initial years with elevated growth
                        - **Stage 2 (Transition)**: Gradual decline to mature growth
                        - **Stage 3 (Mature)**: Stable, long-term growth rate
                        """)

                        multistage_col1, multistage_col2 = st.columns(2)

                        with multistage_col1:
                            stage1_years = st.slider(
                                "Stage 1 Duration (Years)",
                                min_value=1,
                                max_value=min(10, forecast_years - 2),
                                value=min(3, forecast_years - 2),
                                step=1,
                                help="Number of years in high-growth phase"
                            )

                            stage1_growth = st.slider(
                                "Stage 1 Growth Rate (%)",
                                min_value=0.0,
                                max_value=50.0,
                                value=15.0,
                                step=1.0,
                                help="Revenue growth during high-growth phase"
                            ) / 100

                        with multistage_col2:
                            # Calculate max years for stage 2
                            max_stage2 = max(2, forecast_years - stage1_years - 1)
                            default_stage2 = min(2, max_stage2 - 1)

                            stage2_years = st.slider(
                                "Stage 2 Duration (Years)",
                                min_value=1,
                                max_value=max_stage2,
                                value=max(1, default_stage2),  # Ensure value >= min_value
                                step=1,
                                help="Number of years in transition phase"
                            )

                            stage2_growth = st.slider(
                                "Stage 2 Growth Rate (%)",
                                min_value=0.0,
                                max_value=30.0,
                                value=8.0,
                                step=1.0,
                                help="Revenue growth during transition phase"
                            ) / 100

                        # Stage 3 is automatic - remaining years
                        stage3_years = forecast_years - stage1_years - stage2_years
                        stage3_growth = st.slider(
                            f"Stage 3 Growth Rate (%) - {stage3_years} years",
                            min_value=0.0,
                            max_value=15.0,
                            value=3.0,
                            step=0.5,
                            help="Mature/stable growth rate for remaining years"
                        ) / 100

                        # Store multi-stage config in session state
                        st.session_state['multistage_config'] = {
                            'enabled': True,
                            'stage1_years': stage1_years,
                            'stage1_growth': stage1_growth,
                            'stage2_years': stage2_years,
                            'stage2_growth': stage2_growth,
                            'stage3_years': stage3_years,
                            'stage3_growth': stage3_growth
                        }

                        # Display summary
                        st.success(f"""
                        **Growth Profile:**
                        - Years 1-{stage1_years}: {stage1_growth*100:.1f}% growth (High Growth)
                        - Years {stage1_years+1}-{stage1_years+stage2_years}: {stage2_growth*100:.1f}% growth (Transition)
                        - Years {stage1_years+stage2_years+1}-{forecast_years}: {stage3_growth*100:.1f}% growth (Mature)
                        """)
                    else:
                        # Clear multi-stage config if disabled
                        st.session_state['multistage_config'] = {'enabled': False}

                    with col2:
                        if use_smart_assumptions:
                            capex_pct = smart_params['capex_pct']
                            capex_color = _metric_color(capex_pct, green_below=0.05, amber_below=0.10)
                            capex_status = 'Low CapEx' if capex_pct < 0.05 else ('Moderate' if capex_pct < 0.10 else 'High CapEx')
                            st.markdown(metric_card('🏗️', 'CAPEX (% OF REVENUE)', f'{capex_pct*100:.1f}%', capex_color, f'{capex_status} \u2022 AI Generated', accent='cyan'), unsafe_allow_html=True)
                        else:
                            capex_pct = st.slider(
                                "CapEx (% of Revenue)",
                                min_value=0.0,
                                max_value=20.0,
                                value=5.0,
                                step=0.5
                            ) / 100

                        if use_smart_assumptions:
                            depreciation_pct = smart_params['depreciation_pct']
                            depr_color = _metric_color(depreciation_pct, green_below=0.03, amber_below=0.06)
                            depr_status = 'Low D&A' if depreciation_pct < 0.03 else ('Moderate' if depreciation_pct < 0.06 else 'High D&A')
                            st.markdown(metric_card('📉', 'DEPRECIATION (% OF REVENUE)', f'{depreciation_pct*100:.1f}%', depr_color, f'{depr_status} \u2022 AI Generated', accent='amber'), unsafe_allow_html=True)
                        else:
                            depreciation_pct = st.slider(
                                "Depreciation (% of Revenue)",
                                min_value=0.0,
                                max_value=15.0,
                                value=3.0,
                                step=0.5
                            ) / 100

                        wc_intensity_pct = st.slider(
                            "Working Capital Intensity (% of ΔRevenue)",
                            min_value=-5.0, max_value=25.0,
                            value=float(smart_params.get('wc_change', 0) / max(financials.get('revenue', 1), 1) * 100) if use_smart_assumptions else 5.0,
                            step=0.5,
                            help="ΔWC = this% × ΔRevenue each year. Positive = more cash tied up in WC as you grow (typical for product companies). Negative = working capital releases cash (SaaS-style)."
                        ) / 100

                    # ── Margin Convergence (NEW) ───────────────────────
                    st.markdown('---')
                    st.markdown('##### 📈 Margin Evolution')
                    use_margin_convergence = st.checkbox(
                        "Enable Margin Convergence (start → target over N years)",
                        value=False, key='enable_margin_conv',
                        help='Model margin expansion or contraction toward a target. Great for profitability ramp-ups.'
                    )

                    if use_margin_convergence:
                        mc_col1, mc_col2, mc_col3 = st.columns(3)
                        with mc_col1:
                            ebit_margin_start = st.slider(
                                "Starting EBIT Margin (%)",
                                min_value=-20.0, max_value=60.0,
                                value=round(ebit_margin * 100, 1),
                                step=0.5, key='margin_start'
                            ) / 100
                        with mc_col2:
                            ebit_margin_target = st.slider(
                                "Target EBIT Margin (%)",
                                min_value=-20.0, max_value=60.0,
                                value=round(ebit_margin * 100 + 5.0, 1),
                                step=0.5, key='margin_target'
                            ) / 100
                        with mc_col3:
                            margin_convergence_years = st.slider(
                                "Convergence Over (Years)",
                                min_value=1, max_value=10, value=5, step=1, key='margin_conv_years'
                            )
                        _delta_m = ebit_margin_target - ebit_margin_start
                        _dir = 'expanding' if _delta_m > 0 else 'contracting'
                        st.success(f"✅ Margin {_dir}: {ebit_margin_start*100:.1f}% → {ebit_margin_target*100:.1f}% over {margin_convergence_years} years")
                    else:
                        ebit_margin_start = ebit_margin
                        ebit_margin_target = ebit_margin
                        margin_convergence_years = forecast_years

                    # ── Revenue Growth Glide (NEW) ────────────────────
                    use_growth_glide = st.checkbox(
                        "Enable Revenue Growth Glide (start → end rate)",
                        value=False, key='enable_growth_glide',
                        help='Linearly decelerates/accelerates growth over the forecast period.'
                    )
                    if use_growth_glide:
                        gg_col1, gg_col2 = st.columns(2)
                        with gg_col1:
                            revenue_growth_start = st.slider(
                                "Starting Growth Rate (%)",
                                min_value=-10.0, max_value=50.0, value=revenue_growth * 100 + 5.0, step=0.5, key='rg_start'
                            ) / 100
                        with gg_col2:
                            revenue_growth_end = st.slider(
                                "Ending Growth Rate (%)",
                                min_value=-10.0, max_value=30.0, value=revenue_growth * 100, step=0.5, key='rg_end'
                            ) / 100
                    else:
                        revenue_growth_start = revenue_growth
                        revenue_growth_end = revenue_growth

                    # ── SBC (NEW) ──────────────────────────────
                    st.markdown('---')
                    st.markdown('##### 💰 Share-Based Compensation (SBC)')
                    sbc_col1, sbc_col2 = st.columns([2, 1])
                    with sbc_col1:
                        sbc_pct = st.slider(
                            "SBC as % of Revenue",
                            min_value=0.0, max_value=20.0, value=0.0, step=0.25,
                            help='SBC is a real economic cost that dilutes shareholders. Treat as cash expense deducted from FCFF.'
                        ) / 100
                    with sbc_col2:
                        if sbc_pct > 0:
                            _sbc_dollar = financials.get('revenue', 0) * sbc_pct
                            _sbc_color = _metric_color(sbc_pct, green_below=0.03, amber_below=0.07)
                            st.markdown(metric_card('💸', 'SBC COST', f'${_sbc_dollar/1e6:.0f}M/yr', _sbc_color, f'{sbc_pct*100:.1f}% of rev', accent='amber'), unsafe_allow_html=True)
                            if sbc_pct > 0.07:
                                st.warning('⚠️ High SBC (>7% rev) causes material valuation drag.')

                with tab2:
                    st.markdown("##### \ud83d\udcb9 Cost of Capital Workshop")

                    # \u2500\u2500 Cost of Equity \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
                    st.markdown("**Cost of Equity \u2014 CAPM**")
                    coe_col1, coe_col2, coe_col3 = st.columns(3)

                    with coe_col1:
                        risk_free = st.slider(
                            "Risk-Free Rate Rf (%)",
                            min_value=0.0, max_value=10.0, value=4.5, step=0.1,
                            help="Typically the 10-year Treasury yield"
                        ) / 100
                        # Cross-module hint from Macro Intelligence
                        _regime = st.session_state.get('macro_regime')
                        if _regime:
                            from datetime import datetime as _dt, timedelta as _td
                            _ts = _regime.get('timestamp')
                            _fresh = isinstance(_ts, _dt) and (_dt.now() - _ts) < _td(minutes=30)
                            _rfr_range = _regime.get('risk_free_rate_range') if _fresh else None
                            if _rfr_range:
                                st.caption(f"Macro: 10Y range {_rfr_range[0]:.1%}\u2013{_rfr_range[1]:.1%}")

                    with coe_col2:
                        beta_value = float(company['beta']) if company['beta'] else 1.0
                        beta = st.number_input(
                            "Beta (\u03b2)",
                            min_value=-1.0, max_value=3.0,
                            value=max(-1.0, min(3.0, beta_value)), step=0.1,
                            help="Market-fetched beta. Levered beta relative to market."
                        )

                    with coe_col3:
                        market_risk_premium = st.slider(
                            "Equity Risk Premium ERP (%)",
                            min_value=3.0, max_value=10.0, value=6.0, step=0.25,
                            help="Damodaran estimates ~4.5\u20135.5% for US equity"
                        ) / 100

                    size_premium = st.slider(
                        "Size / Liquidity Premium (%)",
                        min_value=0.0, max_value=4.0, value=0.0, step=0.25,
                        help="Additional premium for small-cap or illiquid companies (Ibbotson SBBI)"
                    ) / 100

                    _ke = risk_free + beta * market_risk_premium + size_premium
                    st.markdown(
                        f"**Ke = {risk_free*100:.2f}% + {beta:.2f}\u00d7{market_risk_premium*100:.2f}%"
                        f" + {size_premium*100:.2f}% = <span style='color:{_GREEN};font-size:1.05rem'>"
                        f"**{_ke*100:.2f}%**</span>**",
                        unsafe_allow_html=True
                    )

                    st.markdown("---")
                    # \u2500\u2500 Cost of Debt \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
                    st.markdown("**Cost of Debt**")
                    debt_mode = st.radio(
                        "Input method",
                        ["Manual", "Credit Spread Model (ICR-based)"],
                        horizontal=True, key="debt_mode_radio"
                    )

                    if debt_mode == "Manual":
                        cost_debt = st.slider(
                            "Pre-tax Cost of Debt (%)",
                            min_value=0.0, max_value=20.0, value=5.0, step=0.25,
                            help="Yield-to-maturity on company's outstanding debt"
                        ) / 100
                        _icr_display = None
                    else:
                        _ebit_fin = financials.get('ebit', 0)
                        _int_exp  = abs(financials.get('interest_expense', 0))
                        if _int_exp > 0 and _ebit_fin:
                            _auto_icr = round(_ebit_fin / _int_exp, 2)
                        else:
                            _auto_icr = 3.0
                        _icr_display = st.number_input(
                            "Interest Coverage Ratio (EBIT / Interest)",
                            min_value=0.0, max_value=50.0, value=float(_auto_icr), step=0.25,
                            help="Auto-filled from financials. Adjust if needed."
                        )
                        _spread, _rating = calculate_credit_spread(_icr_display)
                        cost_debt = risk_free + _spread
                        _kd_col1, _kd_col2, _kd_col3 = st.columns(3)
                        with _kd_col1:
                            st.metric("Implied Rating", _rating)
                        with _kd_col2:
                            st.metric("Credit Spread", f"{_spread*100:.2f}%")
                        with _kd_col3:
                            st.metric("Pre-tax Kd", f"{cost_debt*100:.2f}%")

                    with coe_col1 if False else st.container():  # inline placeholder
                        pass

                    if method_key == 'FCFF':
                        if use_smart_assumptions:
                            tax_rate = smart_params['tax_rate']
                        else:
                            tax_rate = st.slider(
                                "Tax Rate (%)",
                                min_value=0.0, max_value=40.0,
                                value=float(financials.get('tax_rate', 0.21) * 100), step=1.0
                            ) / 100

                    st.markdown("---")
                    # \u2500\u2500 Capital Structure & WACC Bridge \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
                    if method_key == 'FCFF':
                        _mve = company['market_cap']
                        _mvd = financials.get('total_debt', 0)
                        _wacc_detail = calculate_wacc_detailed(
                            risk_free, beta, market_risk_premium, size_premium,
                            cost_debt, tax_rate if 'tax_rate' in dir() else 0.21,
                            _mve, _mvd
                        )
                        _wacc_live = _wacc_detail['wacc']

                        st.markdown("**WACC Bridge**")
                        bridge_c1, bridge_c2, bridge_c3, bridge_c4, bridge_c5 = st.columns(5)
                        with bridge_c1:
                            st.metric("Equity Weight", f"{_wacc_detail['equity_weight']*100:.1f}%")
                            st.caption(f"${_mve/1e9:.1f}B market cap")
                        with bridge_c2:
                            st.metric("\u00d7 Cost of Equity", f"{_wacc_detail['cost_of_equity']*100:.2f}%")
                        with bridge_c3:
                            st.metric("Debt Weight", f"{_wacc_detail['debt_weight']*100:.1f}%")
                            st.caption(f"${_mvd/1e9:.1f}B debt")
                        with bridge_c4:
                            st.metric("\u00d7 After-tax Kd", f"{_wacc_detail['after_tax_cost_debt']*100:.2f}%")
                        with bridge_c5:
                            _wacc_col = _metric_color(_wacc_live, green_below=0.08, amber_below=0.12)
                            st.markdown(
                                metric_card('\ud83d\udcb9', 'WACC', f"{_wacc_live*100:.2f}%", _wacc_col,
                                            'Blended Cost of Capital', accent='purple'),
                                unsafe_allow_html=True
                            )
                        st.caption(
                            f"Tax shield contribution: {_wacc_detail['tax_shield_contribution']*100:.2f}% "
                            f"(debt \u00d7 pre-tax Kd \u00d7 tax rate)"
                        )
                        # Store for downstream use
                        st.session_state['_live_wacc_detail'] = _wacc_detail

                    # \u2500\u2500 FCFE: just Cost of Equity matters \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
                    if method_key == 'FCFE':
                        if use_smart_assumptions:
                            tax_rate = smart_params['tax_rate']
                        else:
                            tax_rate = st.slider(
                                "Tax Rate (%)",
                                min_value=0.0, max_value=40.0,
                                value=float(financials.get('tax_rate', 0.21) * 100), step=1.0,
                                key="fcfe_tax_rate"
                            ) / 100

                    if method_key == 'FCFE':
                        net_borrowing = st.number_input(
                            "Net Borrowing ($M) \u2014 fixed annual (or use Advanced FCFE)",
                            min_value=-1000.0, max_value=1000.0, value=0.0, step=10.0
                        ) * 1e6

                with tab3:
                    st.markdown("##### 🎯 Terminal Value")

                    tv_method = st.radio(
                        "Terminal Value Method",
                        ["Gordon Growth (Perpetuity)", "EV/EBITDA Exit Multiple", "Blend (50/50)"],
                        horizontal=True, key="tv_method_radio",
                        help="Gordon Growth is theoretically rigorous; Exit Multiple is market-based"
                    )

                    tv_col1, tv_col2 = st.columns(2)

                    with tv_col1:
                        if use_smart_assumptions:
                            terminal_growth = smart_params['terminal_growth']
                            term_gr_color = _metric_color(terminal_growth, green_below=0.03, amber_below=0.05)
                            term_gr_status = 'Conservative' if terminal_growth <= 0.03 else ('Moderate' if terminal_growth <= 0.05 else 'Aggressive')
                            st.markdown(metric_card('🎯', 'PERPETUAL GROWTH RATE', f'{terminal_growth*100:.1f}%', term_gr_color, f'{term_gr_status} · AI', accent='green'), unsafe_allow_html=True)
                        else:
                            terminal_growth = st.slider(
                                "Perpetual Growth Rate (%)",
                                min_value=0.0, max_value=5.0, value=2.5, step=0.1,
                                help="Long-run GDP growth anchor (typically 2–3%)"
                            ) / 100

                    with tv_col2:
                        if tv_method in ["EV/EBITDA Exit Multiple", "Blend (50/50)"]:
                            exit_multiple = st.number_input(
                                "EV/EBITDA Exit Multiple (×)",
                                min_value=1.0, max_value=60.0, value=12.0, step=0.5,
                                help="Use sector comp median as anchor"
                            )
                        else:
                            exit_multiple = 12.0

                    if tv_method != "Gordon Growth (Perpetuity)":
                        st.caption(
                            "**Exit Multiple Note:** TV = Final Year EBITDA × Multiple. "
                            "Blend averages both PV(TV) estimates with equal weight."
                        )

                    # Store TV method for calculation block
                    st.session_state['_tv_method'] = tv_method
                    st.session_state['_exit_multiple'] = exit_multiple

        # =================================================================
        # DIVIDEND DISCOUNT MODELS (GORDON & MULTI-STAGE)
        # =================================================================
        elif method_key == 'GORDON_DDM':
            st.markdown("##### Gordon Growth DDM Inputs")

            col1, col2 = st.columns(2)

            with col1:
                # Get current dividend from company data
                current_dividend_default = estimate_current_dividend(company)

                current_dividend = st.number_input(
                    "Current Annual Dividend ($)",
                    min_value=0.0,
                    value=float(current_dividend_default),
                    step=0.01,
                    help="Total annual dividend paid by the company"
                )

                if use_smart_assumptions:
                    cost_of_equity_ddm = smart_params.get('cost_of_equity', 0.10)
                    coe_ddm_color = _metric_color(cost_of_equity_ddm, green_below=0.08, amber_below=0.12)
                    coe_ddm_status = 'Low Cost' if cost_of_equity_ddm < 0.08 else ('Average Cost' if cost_of_equity_ddm < 0.12 else 'High Cost')
                    st.markdown(metric_card('💹', 'COST OF EQUITY', f'{cost_of_equity_ddm*100:.1f}%', coe_ddm_color, f'{coe_ddm_status} \u2022 AI Generated', accent='purple'), unsafe_allow_html=True)
                else:
                    risk_free_ddm = st.slider(
                        "Risk-Free Rate (%)",
                        min_value=0.0,
                        max_value=10.0,
                        value=4.5,
                        step=0.1,
                        key="ddm_risk_free"
                    ) / 100

                    # Cross-module hint from Macro Intelligence
                    _regime_ddm = st.session_state.get('macro_regime')
                    if _regime_ddm:
                        from datetime import datetime as _dt, timedelta as _td
                        _ts_ddm = _regime_ddm.get('timestamp')
                        _fresh_ddm = isinstance(_ts_ddm, _dt) and (_dt.now() - _ts_ddm) < _td(minutes=30)
                        _rfr_ddm = _regime_ddm.get('risk_free_rate_range') if _fresh_ddm else None
                        if _rfr_ddm:
                            st.caption(
                                f"Macro Intelligence: current 10Y range "
                                f"{_rfr_ddm[0]:.1%}\u2013{_rfr_ddm[1]:.1%}"
                            )

                    market_risk_premium_ddm = st.slider(
                        "Market Risk Premium (%)",
                        min_value=3.0,
                        max_value=10.0,
                        value=6.0,
                        step=0.5,
                        key="ddm_mrp"
                    ) / 100

                    beta_ddm = st.number_input(
                        "Beta",
                        min_value=0.0,
                        max_value=3.0,
                        value=float(company['beta']) if company['beta'] else 1.0,
                        step=0.1,
                        key="ddm_beta"
                    )

                    cost_of_equity_ddm = calculate_cost_of_equity(risk_free_ddm, beta_ddm, market_risk_premium_ddm)
                    st.info(f"Calculated Cost of Equity: {cost_of_equity_ddm*100:.2f}%")

            with col2:
                if use_smart_assumptions:
                    growth_rate_ddm = smart_params.get('dividend_growth', 0.03)
                    div_gr_color = _metric_color(growth_rate_ddm, green_below=0.03, amber_below=0.05)
                    div_gr_status = 'Conservative' if growth_rate_ddm <= 0.03 else ('Moderate' if growth_rate_ddm <= 0.05 else 'Aggressive')
                    st.markdown(metric_card('📊', 'DIVIDEND GROWTH RATE', f'{growth_rate_ddm*100:.1f}%', div_gr_color, f'{div_gr_status} \u2022 AI Generated', accent='green'), unsafe_allow_html=True)
                else:
                    growth_rate_ddm = st.slider(
                        "Perpetual Dividend Growth Rate (%)",
                        min_value=0.0,
                        max_value=5.0,
                        value=2.5,
                        step=0.1,
                        help="Long-term sustainable dividend growth rate"
                    ) / 100

                st.info(f"""
                **Gordon Growth Formula:**

                Value = D₁ / (r - g)

                Where D₁ = D₀ × (1 + g)
                """)

        # =================================================================
        # MULTI-STAGE DDM
        # =================================================================
        elif method_key == 'MULTISTAGE_DDM':
            st.markdown("##### Multi-Stage DDM Inputs (2-Stage Model)")

            col1, col2 = st.columns(2)

            with col1:
                # Get current dividend
                current_dividend_default = estimate_current_dividend(company)

                current_dividend_ms = st.number_input(
                    "Current Annual Dividend ($)",
                    min_value=0.0,
                    value=float(current_dividend_default),
                    step=0.01,
                    key="ms_dividend"
                )

                if use_smart_assumptions:
                    cost_of_equity_ms = smart_params.get('cost_of_equity', 0.10)
                    coe_ms_color = _metric_color(cost_of_equity_ms, green_below=0.08, amber_below=0.12)
                    coe_ms_status = 'Low Cost' if cost_of_equity_ms < 0.08 else ('Average Cost' if cost_of_equity_ms < 0.12 else 'High Cost')
                    st.markdown(metric_card('💹', 'COST OF EQUITY', f'{cost_of_equity_ms*100:.1f}%', coe_ms_color, f'{coe_ms_status} \u2022 AI Generated', accent='purple'), unsafe_allow_html=True)
                else:
                    risk_free_ms = st.slider(
                        "Risk-Free Rate (%)",
                        min_value=0.0,
                        max_value=10.0,
                        value=4.5,
                        step=0.1,
                        key="ms_risk_free"
                    ) / 100

                    market_risk_premium_ms = st.slider(
                        "Market Risk Premium (%)",
                        min_value=3.0,
                        max_value=10.0,
                        value=6.0,
                        step=0.5,
                        key="ms_mrp"
                    ) / 100

                    beta_ms = st.number_input(
                        "Beta",
                        min_value=0.0,
                        max_value=3.0,
                        value=float(company['beta']) if company['beta'] else 1.0,
                        step=0.1,
                        key="ms_beta"
                    )

                    cost_of_equity_ms = calculate_cost_of_equity(risk_free_ms, beta_ms, market_risk_premium_ms)
                    st.info(f"Calculated Cost of Equity: {cost_of_equity_ms*100:.2f}%")

            with col2:
                if use_smart_assumptions:
                    high_growth_rate = smart_params.get('high_growth_rate', 0.08)
                    high_growth_years = smart_params.get('high_growth_years', 5)
                    stable_growth_rate = smart_params.get('stable_growth_rate', 0.03)

                    # High Growth Rate
                    hgr_color = _AMBER if high_growth_rate > 0.10 else (_GREEN if high_growth_rate > 0.05 else _RED)
                    hgr_status = 'Aggressive' if high_growth_rate > 0.10 else ('Moderate' if high_growth_rate > 0.05 else 'Conservative')
                    st.markdown(metric_card('🚀', 'HIGH GROWTH RATE', f'{high_growth_rate*100:.1f}%', hgr_color, f'{hgr_status} \u2022 AI Generated', accent='amber'), unsafe_allow_html=True)
                    # High Growth Years
                    st.markdown(metric_card('⏱️', 'HIGH GROWTH YEARS', f'{high_growth_years} years', _CYAN, 'Growth Period \u2022 AI Generated', accent='cyan'), unsafe_allow_html=True)
                    # Stable Growth Rate
                    sgr_color = _metric_color(stable_growth_rate, green_below=0.03, amber_below=0.05)
                    sgr_status = 'Conservative' if stable_growth_rate <= 0.03 else ('Moderate' if stable_growth_rate <= 0.05 else 'Aggressive')
                    st.markdown(metric_card('📉', 'STABLE GROWTH RATE', f'{stable_growth_rate*100:.1f}%', sgr_color, f'{sgr_status} \u2022 AI Generated', accent='green'), unsafe_allow_html=True)
                else:
                    high_growth_rate = st.slider(
                        "High Growth Rate (%)",
                        min_value=0.0,
                        max_value=20.0,
                        value=8.0,
                        step=0.5,
                        help="Initial high dividend growth rate"
                    ) / 100

                    high_growth_years = st.slider(
                        "High Growth Period (Years)",
                        min_value=3,
                        max_value=15,
                        value=5,
                        step=1,
                        help="Number of years of high growth"
                    )

                    stable_growth_rate = st.slider(
                        "Stable Growth Rate (%)",
                        min_value=0.0,
                        max_value=5.0,
                        value=2.5,
                        step=0.1,
                        help="Long-term perpetual growth rate"
                    ) / 100

        # =================================================================
        # RESIDUAL INCOME MODEL
        # =================================================================
        elif method_key == 'RESIDUAL_INCOME':
            st.markdown("##### Residual Income Model Inputs")

            col1, col2 = st.columns(2)

            with col1:
                # Book value of equity
                book_value_default = financials.get('total_equity', company.get('bookValue', 0) * company['shares_outstanding'])

                book_value_equity = st.number_input(
                    "Book Value of Equity ($)",
                    min_value=0.0,
                    value=float(book_value_default),
                    step=1000000.0,
                    help="Current book value of shareholders' equity"
                )

                if use_smart_assumptions:
                    roe = smart_params.get('roe', 0.15)
                    roe_color = _metric_color(roe, green_above=0.15, amber_above=0.10)
                    roe_status = 'Excellent' if roe > 0.15 else ('Good' if roe > 0.10 else 'Fair')
                    st.markdown(metric_card('💎', 'RETURN ON EQUITY (ROE)', f'{roe*100:.1f}%', roe_color, f'{roe_status} \u2022 AI Generated', accent='green'), unsafe_allow_html=True)
                else:
                    roe = st.slider(
                        "Return on Equity - ROE (%)",
                        min_value=0.0,
                        max_value=50.0,
                        value=15.0,
                        step=0.5,
                        help="Expected ROE for future periods"
                    ) / 100

                forecast_years_ri = st.slider(
                    "Forecast Horizon (Years)",
                    min_value=3,
                    max_value=15,
                    value=smart_params.get('forecast_years', 5) if use_smart_assumptions else 5,
                    step=1,
                    key="ri_forecast_years"
                )

            with col2:
                if use_smart_assumptions:
                    cost_of_equity_ri = smart_params.get('cost_of_equity', 0.10)
                    coe_ri_color = _metric_color(cost_of_equity_ri, green_below=0.08, amber_below=0.12)
                    coe_ri_status = 'Low Cost' if cost_of_equity_ri < 0.08 else ('Average Cost' if cost_of_equity_ri < 0.12 else 'High Cost')
                    st.markdown(metric_card('💹', 'COST OF EQUITY', f'{cost_of_equity_ri*100:.1f}%', coe_ri_color, f'{coe_ri_status} \u2022 AI Generated', accent='purple'), unsafe_allow_html=True)
                else:
                    risk_free_ri = st.slider(
                        "Risk-Free Rate (%)",
                        min_value=0.0,
                        max_value=10.0,
                        value=4.5,
                        step=0.1,
                        key="ri_risk_free"
                    ) / 100

                    market_risk_premium_ri = st.slider(
                        "Market Risk Premium (%)",
                        min_value=3.0,
                        max_value=10.0,
                        value=6.0,
                        step=0.5,
                        key="ri_mrp"
                    ) / 100

                    beta_ri = st.number_input(
                        "Beta",
                        min_value=0.0,
                        max_value=3.0,
                        value=float(company['beta']) if company['beta'] else 1.0,
                        step=0.1,
                        key="ri_beta"
                    )

                    cost_of_equity_ri = calculate_cost_of_equity(risk_free_ri, beta_ri, market_risk_premium_ri)
                    st.info(f"Calculated Cost of Equity: {cost_of_equity_ri*100:.2f}%")

                if use_smart_assumptions:
                    growth_rate_ri = smart_params.get('terminal_growth', 0.025)
                    tgr_ri_color = _metric_color(growth_rate_ri, green_below=0.03, amber_below=0.05)
                    tgr_ri_status = 'Conservative' if growth_rate_ri <= 0.03 else ('Moderate' if growth_rate_ri <= 0.05 else 'Aggressive')
                    st.markdown(metric_card('🎯', 'TERMINAL GROWTH RATE', f'{growth_rate_ri*100:.1f}%', tgr_ri_color, f'{tgr_ri_status} \u2022 AI Generated', accent='cyan'), unsafe_allow_html=True)
                else:
                    growth_rate_ri = st.slider(
                        "Terminal Growth Rate (%)",
                        min_value=0.0,
                        max_value=5.0,
                        value=2.5,
                        step=0.1,
                        key="ri_terminal_growth",
                        help="Long-term growth rate for terminal value"
                    ) / 100

                st.info(f"""
                **Residual Income Formula:**

                Value = BV + PV(RI)

                RI = (ROE - r) × BV
                """)

        # =================================================================
        # RELATIVE VALUATION (PEER MULTIPLES)
        # =================================================================
        elif method_key == 'RELATIVE':
            st.markdown("##### Relative Valuation - Peer Multiples")

            st.info(f"""
            This method values the company based on peer comparison using 6 key multiples:

            - **P/E Ratio:** Price to Earnings
            - **P/B Ratio:** Price to Book Value
            - **P/S Ratio:** Price to Sales
            - **EV/EBITDA:** Enterprise Value to EBITDA
            - **EV/EBIT:** Enterprise Value to EBIT
            - **PEG Ratio:** P/E to Growth

            Peer companies are automatically selected from the {company['sector']} sector.
            """)

            # Fetch peers
            with st.spinner("Fetching peer companies..."):
                ticker = company['ticker']
                sector = company['sector']
                peers = fetch_peer_companies(ticker, sector, max_peers=10)

                if peers:
                    st.success(f"Found {len(peers)} peer companies: {', '.join(peers)}")
                else:
                    st.warning("No peer companies found. Using default sector averages.")

        # =================================================================
        # SUM-OF-THE-PARTS (SOTP)
        # =================================================================
        elif method_key == 'SOTP':
            st.markdown("##### Sum-of-the-Parts Valuation")

            st.info("""
            SOTP values multi-segment companies by valuing each business unit independently.

            For each segment, provide:
            - Revenue
            - EBITDA Margin
            - EV/Revenue Multiple (based on comparable companies)
            """)

            # Number of segments
            num_segments = st.number_input(
                "Number of Business Segments",
                min_value=1,
                max_value=10,
                value=2,
                step=1
            )

            # Create segment inputs
            segments = []
            for i in range(num_segments):
                with st.expander(f"Segment {i+1}", expanded=(i == 0)):
                    col1, col2, col3 = st.columns(3)

                    with col1:
                        segment_name = st.text_input(
                            "Segment Name",
                            value=f"Segment {i+1}",
                            key=f"seg_name_{i}"
                        )

                        segment_revenue = st.number_input(
                            "Revenue ($M)",
                            min_value=0.0,
                            value=100.0,
                            step=10.0,
                            key=f"seg_rev_{i}"
                        ) * 1e6

                    with col2:
                        segment_ebitda_margin = st.slider(
                            "EBITDA Margin (%)",
                            min_value=0.0,
                            max_value=50.0,
                            value=20.0,
                            step=1.0,
                            key=f"seg_ebitda_{i}"
                        ) / 100

                    with col3:
                        segment_multiple = st.number_input(
                            "EV/Revenue Multiple",
                            min_value=0.0,
                            max_value=10.0,
                            value=2.0,
                            step=0.1,
                            key=f"seg_mult_{i}",
                            help="Based on comparable segment peers"
                        )

                    segments.append({
                        'name': segment_name,
                        'revenue': segment_revenue,
                        'ebitda_margin': segment_ebitda_margin,
                        'ev_revenue_multiple': segment_multiple
                    })

        st.markdown("---")

        # Calculate Valuation (All Methods)
        if st.button("🚀 Calculate Intrinsic Value", type="primary", use_container_width=True):
            with st.spinner(f"🔬 Running {method_key} Valuation..."):

                shares = company['shares_outstanding']

                # =================================================================
                # DCF METHODS (FCFF / FCFE)
                # =================================================================
                if method_key in ['FCFF', 'FCFE']:
                    # Check if Dashboard Mode is active
                    dashboard_active = ('dashboard_inputs' in st.session_state and
                                       st.session_state.get('use_model_inputs_dashboard', False))

                    if dashboard_active:
                        # =========================================================
                        # DASHBOARD MODE: Use pre-calculated inputs and projections
                        # =========================================================
                        dashboard_data = st.session_state['dashboard_inputs']

                        # Extract dashboard values
                        discount_rate = dashboard_data['wacc']
                        terminal_growth = dashboard_data['terminal_growth']
                        shares = dashboard_data['diluted_shares']
                        dcf_proj_obj = dashboard_data.get('projections')

                        # Convert DCFProjections object to legacy projection format
                        if dcf_proj_obj:
                            projections = convert_dashboard_projections(dcf_proj_obj)
                            if projections:
                                final_fcf = projections[-1]['fcff'] if method_key == 'FCFF' else projections[-1]['fcfe']
                            else:
                                st.warning("⚠️ Projections format not recognized. Using manual calculation.")
                                dashboard_active = False
                        else:
                            st.error("⚠️ Dashboard projections not available. Using manual calculation.")
                            dashboard_active = False

                    if not dashboard_active:

                        # =========================================================
                        # MANUAL MODE: Use slider inputs and traditional calculation
                        # =========================================================
                        # Resolve defaults for any sliders that weren't rendered
                        _locals = {}
                        for _name in ('risk_free', 'beta', 'market_risk_premium', 'cost_debt', 'size_premium',
                                      'tax_rate', 'revenue_growth', 'ebit_margin', 'forecast_years',
                                      'depreciation_pct', 'capex_pct', 'wc_intensity_pct', 'net_borrowing',
                                      'sbc_pct', 'ebit_margin_start', 'ebit_margin_target',
                                      'margin_convergence_years', 'revenue_growth_start', 'revenue_growth_end'):
                            try:
                                _locals[_name] = eval(_name)  # noqa: S307
                            except (NameError, UnboundLocalError):
                                pass
                        _defaults = resolve_dcf_defaults(_locals)
                        if 'tax_rate' not in _locals:
                            _defaults['tax_rate'] = financials.get('tax_rate', 0.21)
                        risk_free          = _locals.get('risk_free', _defaults['risk_free'])
                        beta               = _locals.get('beta', _defaults['beta'])
                        market_risk_premium= _locals.get('market_risk_premium', _defaults['market_risk_premium'])
                        cost_debt          = _locals.get('cost_debt', _defaults['cost_debt'])
                        size_premium       = _locals.get('size_premium', 0.0)
                        tax_rate           = _locals.get('tax_rate', _defaults['tax_rate'])
                        revenue_growth     = _locals.get('revenue_growth', _defaults['revenue_growth'])
                        ebit_margin        = _locals.get('ebit_margin', _defaults['ebit_margin'])
                        forecast_years     = int(_locals.get('forecast_years', _defaults['forecast_years']))
                        depreciation_pct   = _locals.get('depreciation_pct', _defaults['depreciation_pct'])
                        capex_pct          = _locals.get('capex_pct', _defaults['capex_pct'])
                        wc_intensity_pct   = _locals.get('wc_intensity_pct', 0.05)
                        sbc_pct            = _locals.get('sbc_pct', 0.0)
                        ebit_margin_start  = _locals.get('ebit_margin_start', ebit_margin)
                        ebit_margin_target = _locals.get('ebit_margin_target', ebit_margin)
                        margin_conv_years  = int(_locals.get('margin_convergence_years', forecast_years))
                        rev_growth_start   = _locals.get('revenue_growth_start', revenue_growth)
                        rev_growth_end     = _locals.get('revenue_growth_end', revenue_growth)
                        net_borrowing      = _locals.get('net_borrowing', 0.0)

                        # WACC: use detailed workshop calc for FCFF, plain CAPM for FCFE
                        if method_key == 'FCFF':
                            _mve = company['market_cap']
                            _mvd = financials.get('total_debt', 0)
                            _wd = calculate_wacc_detailed(
                                risk_free, beta, market_risk_premium, size_premium,
                                cost_debt, tax_rate, _mve, _mvd
                            )
                            discount_rate = _wd['wacc']
                            st.session_state['_live_wacc_detail'] = _wd
                        else:
                            discount_rate = risk_free + beta * market_risk_premium + size_premium

                        base_revenue    = financials.get('revenue', 0)
                        base_net_income = financials.get('net_income', 0)
                        multistage_config = st.session_state.get('multistage_config', {'enabled': False})

                        if method_key == 'FCFF':
                            projections = project_fcff_advanced(
                                base_revenue=base_revenue,
                                ebit_margin_start=ebit_margin_start,
                                ebit_margin_target=ebit_margin_target,
                                margin_convergence_years=margin_conv_years,
                                revenue_growth_start=rev_growth_start,
                                revenue_growth_end=rev_growth_end,
                                tax_rate=tax_rate,
                                depreciation_pct=depreciation_pct,
                                capex_pct=capex_pct,
                                wc_intensity_pct=wc_intensity_pct,
                                sbc_pct=sbc_pct,
                                forecast_years=forecast_years,
                                multistage_config=multistage_config,
                            )
                        else:
                            _ni_margin = base_net_income / base_revenue if base_revenue else 0.05
                            _ni_margin_target = ebit_margin_target * (1 - tax_rate)
                            _net_debt_init = financials.get('total_debt', 0) - financials.get('cash', 0)
                            projections = project_fcfe_advanced(
                                base_revenue=base_revenue,
                                ni_margin_start=_ni_margin,
                                ni_margin_target=_ni_margin_target,
                                margin_convergence_years=margin_conv_years,
                                revenue_growth_start=rev_growth_start,
                                revenue_growth_end=rev_growth_end,
                                tax_rate=tax_rate,
                                depreciation_pct=depreciation_pct,
                                capex_pct=capex_pct,
                                wc_intensity_pct=wc_intensity_pct,
                                sbc_pct=sbc_pct,
                                cost_of_debt=cost_debt,
                                net_debt_initial=_net_debt_init,
                                target_debt_ratio=0.0,
                                forecast_years=forecast_years,
                                multistage_config=multistage_config,
                            )

                        final_fcf = projections[-1]['fcff'] if method_key == 'FCFF' else projections[-1]['fcfe']
                        shares = company['shares_outstanding']

                    # =================================================================
                    # SBC INTEGRATION: Adjust FCFF for Share-Based Compensation
                    # =================================================================
                    sbc_enabled = False
                    sbc_forecast = None
                    projections_without_sbc = None

                    if dashboard_active and SBC_AVAILABLE:
                        # Check if SBC is enabled in dashboard
                        sbc_data = dashboard_data.get('sbc')
                        if sbc_data and sbc_data.get('enabled', False):
                            sbc_enabled = True

                            # Store original projections for before/after comparison
                            projections_without_sbc = [p.copy() for p in projections]

                            # Generate SBC forecast using revenue projections
                            revenue_projections = {p['year']: p['revenue'] for p in projections}

                            config = sbc_data['config']
                            forecaster = SBCForecaster(config)
                            sbc_forecast = forecaster.generate_sbc_forecast(revenue_projections)

                            # Integrate SBC into FCFF projections
                            # Convert projections list to dict format for integration
                            projections_dict = {p['year']: p for p in projections}
                            updated_projections_dict = integrate_sbc_with_fcff(
                                projections_dict,
                                sbc_forecast,
                                sbc_already_in_fcff=False  # Dashboard mode calculates from NOPAT
                            )

                            # Convert back to list format
                            projections = [updated_projections_dict[year] for year in sorted(updated_projections_dict.keys())]

                            # Update final FCF (now includes SBC)
                            final_fcf = projections[-1]['fcff'] if method_key == 'FCFF' else projections[-1]['fcfe']

                            st.info(f"✅ SBC integrated into valuation. Avg SBC: {config.starting_sbc_pct_revenue:.1f}% of revenue")

                    # =================================================================
                    # INSTITUTIONAL-GRADE DCF VALIDATION (January 2026)
                    # =================================================================
                    if INSTITUTIONAL_DCF_AVAILABLE:
                        st.markdown("---")
                        st.markdown("#### 🎯 Assumption Validation")

                        # Collect assumptions for validation
                        assumptions_for_validation = assemble_validation_assumptions(
                            revenue_growth, ebit_margin, terminal_growth,
                            discount_rate, tax_rate, capex_pct,
                            wc_intensity_pct * financials.get('revenue', 0) if not dashboard_active else 0,
                            dashboard_active, projections, financials,
                        )

                        # Run validation
                        validator = DCFValidator()
                        validation_result = validator.validate_assumptions(
                            assumptions=assumptions_for_validation,
                            company={
                                'ticker': company['ticker'],
                                'sector': company['sector'],
                                'market_cap': company['market_cap']
                            },
                            sector=company['sector']
                        )

                        # Display validation warnings
                        display_validation_warnings(validation_result)

                        st.markdown("---")

                    # ── Terminal Value: Gordon / Exit Multiple / Blend ──────────
                    _tv_method_active = st.session_state.get('_tv_method', 'Gordon Growth (Perpetuity)')
                    _exit_mult = st.session_state.get('_exit_multiple', 12.0)
                    _final_ebitda = projections[-1].get('ebitda', final_fcf * 1.3)
                    _n_periods = len(projections)

                    gordon_tv   = calculate_terminal_value(final_fcf, discount_rate, terminal_growth)
                    gordon_pv   = gordon_tv / ((1 + discount_rate) ** _n_periods)

                    if _tv_method_active == 'EV/EBITDA Exit Multiple':
                        _em = calculate_terminal_value_exit_multiple(_final_ebitda, _exit_mult, discount_rate, _n_periods)
                        terminal_value = _em['terminal_ev']
                        pv_terminal_override = _em['pv_terminal']
                    elif _tv_method_active == 'Blend (50/50)':
                        _em = calculate_terminal_value_exit_multiple(_final_ebitda, _exit_mult, discount_rate, _n_periods)
                        _blend = calculate_blended_terminal_value(gordon_pv, _em['pv_terminal'], gordon_weight=0.5)
                        pv_terminal_override = _blend['blended_pv']
                        terminal_value = pv_terminal_override * ((1 + discount_rate) ** _n_periods)
                    else:
                        terminal_value = gordon_tv
                        pv_terminal_override = None

                    st.session_state['_gordon_tv'] = gordon_tv
                    st.session_state['_tv_method_used'] = _tv_method_active
                    st.session_state['_exit_mult_used'] = _exit_mult
                    st.session_state['_final_ebitda'] = _final_ebitda

                    # Calculate DCF value (both modes)
                    net_debt = calc_net_debt(financials.get('total_debt', 0), financials.get('cash', 0))

                    dcf_results = calculate_dcf_value(
                        projections, discount_rate, terminal_value, shares,
                        net_debt if method_key == 'FCFF' else 0, method_key
                    )

                    # Override pv_terminal if using exit multiple / blend
                    if pv_terminal_override is not None:
                        _pv_cfs = dcf_results['total_pv_cash_flows']
                        _eq_val = _pv_cfs + pv_terminal_override - (net_debt if method_key == 'FCFF' else 0)
                        dcf_results['pv_terminal'] = pv_terminal_override
                        dcf_results['enterprise_value'] = _pv_cfs + pv_terminal_override
                        dcf_results['equity_value'] = _eq_val
                        dcf_results['intrinsic_value_per_share'] = _eq_val / shares if shares > 0 else 0

                    dcf_results['net_debt'] = net_debt
                    dcf_results['discount_rate'] = discount_rate
                    dcf_results['terminal_growth'] = terminal_growth
                    dcf_results['sbc_pct'] = sbc_pct if not dashboard_active else 0
                    dcf_results['wc_intensity_pct'] = wc_intensity_pct if not dashboard_active else 0

                    # Store results
                    st.session_state['valuation_results'] = dcf_results
                    st.session_state['dcf_projections'] = projections
                    st.session_state['valuation_method'] = method_key
                    st.session_state['discount_rate'] = discount_rate
                    st.session_state['terminal_growth'] = terminal_growth
                    st.session_state['used_smart_assumptions'] = use_smart_assumptions if not dashboard_active else False
                    st.session_state['used_dashboard_mode'] = dashboard_active

                    # Store SBC data for before/after comparison
                    if sbc_enabled:
                        st.session_state['sbc_enabled'] = True
                        st.session_state['sbc_forecast'] = sbc_forecast
                        st.session_state['projections_without_sbc'] = projections_without_sbc
                        st.session_state['sbc_forecaster'] = forecaster
                    else:
                        st.session_state['sbc_enabled'] = False

                # =================================================================
                # GORDON GROWTH DDM
                # =================================================================
                elif method_key == 'GORDON_DDM':
                    gordon_results = calculate_gordon_growth_ddm(
                        current_dividend=current_dividend,
                        cost_of_equity=cost_of_equity_ddm,
                        growth_rate=growth_rate_ddm,
                        shares_outstanding=shares
                    )

                    # Store results
                    st.session_state['valuation_results'] = gordon_results
                    st.session_state['valuation_method'] = method_key
                    st.session_state['used_smart_assumptions'] = use_smart_assumptions

                # =================================================================
                # MULTI-STAGE DDM
                # =================================================================
                elif method_key == 'MULTISTAGE_DDM':
                    multistage_results = calculate_multistage_ddm(
                        current_dividend=current_dividend_ms,
                        cost_of_equity=cost_of_equity_ms,
                        high_growth_rate=high_growth_rate,
                        high_growth_years=high_growth_years,
                        stable_growth_rate=stable_growth_rate,
                        shares_outstanding=shares
                    )

                    # Store results
                    st.session_state['valuation_results'] = multistage_results
                    st.session_state['valuation_method'] = method_key
                    st.session_state['used_smart_assumptions'] = use_smart_assumptions

                # =================================================================
                # RESIDUAL INCOME
                # =================================================================
                elif method_key == 'RESIDUAL_INCOME':
                    residual_results = calculate_residual_income(
                        book_value_equity=book_value_equity,
                        roe=roe,
                        cost_of_equity=cost_of_equity_ri,
                        growth_rate=growth_rate_ri,
                        forecast_years=forecast_years_ri,
                        shares_outstanding=shares
                    )

                    # Store results
                    st.session_state['valuation_results'] = residual_results
                    st.session_state['valuation_method'] = method_key
                    st.session_state['used_smart_assumptions'] = use_smart_assumptions

                # =================================================================
                # RELATIVE VALUATION
                # =================================================================
                elif method_key == 'RELATIVE':
                    # Calculate peer multiples
                    median_multiples = calculate_peer_multiples(peers)

                    if median_multiples:
                        relative_results = apply_relative_valuation(
                            company_financials=assemble_company_financials_for_relative(financials, shares),
                            median_multiples=median_multiples,
                            shares_outstanding=shares
                        )

                        # Add method and average value
                        relative_results['method'] = 'Relative Valuation'
                        relative_results['intrinsic_value_per_share'] = relative_results.get('average_relative_value', 0)

                        # Store results
                        st.session_state['valuation_results'] = relative_results
                        st.session_state['valuation_method'] = method_key
                        st.session_state['used_smart_assumptions'] = False
                    else:
                        st.error("Unable to calculate peer multiples. Please check peer company data.")
                        st.stop()

                # =================================================================
                # SUM-OF-THE-PARTS (SOTP)
                # =================================================================
                elif method_key == 'SOTP':
                    sotp_results = calculate_sotp_valuation(
                        segments=segments,
                        discount_rate=0.10,  # Default WACC for SOTP
                        shares_outstanding=shares
                    )

                    # Store results
                    st.session_state['valuation_results'] = sotp_results
                    st.session_state['valuation_method'] = method_key
                    st.session_state['used_smart_assumptions'] = False

                st.success("✅ Valuation Complete!")

        # Display Results
        if 'valuation_results' in st.session_state:
            results = st.session_state['valuation_results']
            method = st.session_state['valuation_method']
            projections = st.session_state.get('dcf_projections', None)

            st.markdown("---")
            st.markdown("### 📊 Valuation Results")

            if st.session_state.get('used_smart_assumptions', False):
                st.success("🤖 **These results used AI-Generated Smart Assumptions**")

            # Key metrics
            intrinsic_value = results['intrinsic_value_per_share']
            current_price = company['current_price']
            upside_downside = calc_upside_downside(intrinsic_value, current_price)

            # DCF Valuation toast with upside/downside
            if abs(upside_downside) < 1000:  # Valid result
                if upside_downside > 20:
                    toast_msg = f"DCF Valuation: ${intrinsic_value:.2f} target | {upside_downside:.1f}% upside - Significantly Undervalued"
                    toast_type = "success"
                elif upside_downside > 0:
                    toast_msg = f"DCF Valuation: ${intrinsic_value:.2f} target | {upside_downside:.1f}% upside - Slightly Undervalued"
                    toast_type = "info"
                elif upside_downside > -20:
                    toast_msg = f"DCF Valuation: ${intrinsic_value:.2f} target | {abs(upside_downside):.1f}% downside - Slightly Overvalued"
                    toast_type = "warning"
                else:
                    toast_msg = f"DCF Valuation: ${intrinsic_value:.2f} target | {abs(upside_downside):.1f}% downside - Significantly Overvalued"
                    toast_type = "warning"
                show_toast(toast_msg, toast_type=toast_type, duration=5000)

            col1, col2, col3, col4 = st.columns(4)

            # Intrinsic Value
            with col1:
                intrinsic_color = _metric_color(upside_downside, green_above=20, amber_above=-20)
                intrinsic_status = 'Undervalued' if upside_downside > 20 else ('Fair Value' if upside_downside > -20 else 'Overvalued')
                st.markdown(metric_card('💎', 'INTRINSIC VALUE', f'{format_currency(intrinsic_value)}', intrinsic_color, f'{intrinsic_status}', accent='green'), unsafe_allow_html=True)

            # Current Price
            with col2:
                st.markdown(metric_card('💰', 'CURRENT PRICE', f'{format_currency(current_price)}', _VIOLET, 'Market Price', accent='purple'), unsafe_allow_html=True)

            # Upside/Downside
            with col3:
                upside_display = format_percentage(upside_downside) if abs(upside_downside) < 1000 else "±∞"
                upside_color = _metric_color(upside_downside, green_above=20, amber_above=-20)
                upside_label = 'Strong Upside' if upside_downside > 20 else ('Fair Value' if upside_downside > -20 else 'Downside Risk')
                st.markdown(metric_card('📊', 'UPSIDE/DOWNSIDE', f'{upside_display}', upside_color, f'{upside_label}', accent='cyan'), unsafe_allow_html=True)

            # Discount Rate
            # v9.7 FIX: Safe access to session_state with defaults
            discount_rate = st.session_state.get('discount_rate', results.get('discount_rate', 0.10))
            with col4:
                disc_color = _metric_color(discount_rate, green_below=0.08, amber_below=0.12)
                disc_status = 'Low Risk' if discount_rate < 0.08 else ('Moderate Risk' if discount_rate < 0.12 else 'High Risk')
                st.markdown(metric_card('💹', 'DISCOUNT RATE', f'{ATLASFormatter.format_yield(discount_rate * 100, decimals=1)}', disc_color, f'{disc_status}', accent='amber'), unsafe_allow_html=True)

            # Valuation interpretation
            st.markdown("---")

            if upside_downside > 20:
                st.success(f"""
                ✅ **Significantly Undervalued**

                The intrinsic value suggests the stock is trading at a {abs(upside_downside):.1f}% discount to fair value.
                """)
            elif upside_downside > 0:
                st.info(f"""
                📊 **Slightly Undervalued**

                Modest upside potential of {upside_downside:.1f}%.
                """)
            elif upside_downside > -20:
                st.warning(f"""
                ⚠️ **Slightly Overvalued**

                Trading {abs(upside_downside):.1f}% above fair value.
                """)
            else:
                st.error(f"""
                ❌ **Significantly Overvalued**

                Trading at a {abs(upside_downside):.1f}% premium to fair value.
                """)

            st.markdown("---")

            # Visualizations (only for DCF methods)
            if method in ['FCFF', 'FCFE'] and projections:
                col1, col2 = st.columns(2)

                with col1:
                    waterfall = create_dcf_waterfall(results, method)
                    st.plotly_chart(waterfall, use_container_width=True)

                with col2:
                    cf_chart = create_cash_flow_chart(projections, method)
                    st.plotly_chart(cf_chart, use_container_width=True)

            # Sensitivity Analysis
            st.markdown("---")
            st.markdown("#### 🎯 Sensitivity Analysis")

            # v9.7 FIX: Safe access to session_state with defaults
            terminal_growth = st.session_state.get('terminal_growth', results.get('terminal_growth', 0.025))
            sensitivity = create_sensitivity_table(
                intrinsic_value,
                discount_rate,
                terminal_growth
            )
            st.plotly_chart(sensitivity, use_container_width=True)

            # ============================================================
            # MONTE CARLO SIMULATION (INSTITUTIONAL-GRADE)
            # ============================================================
            if method in ['FCFF', 'FCFE'] and INSTITUTIONAL_DCF_AVAILABLE:
                st.markdown("---")
                st.markdown("#### 🎲 Monte Carlo Simulation")

                st.info("""
                **🎯 Uncertainty Quantification**

                Instead of a single point estimate, Monte Carlo simulation runs 1000+ scenarios
                with varying assumptions to show the range of possible fair values.

                This provides:
                • P5 (5th percentile) - Pessimistic case
                • P25 (25th percentile) - Conservative case
                • Median (50th percentile) - Base case
                • P75 (75th percentile) - Optimistic case
                • P95 (95th percentile) - Bull case
                """)

                if st.button("🎲 Run Monte Carlo Simulation (1000 scenarios)", type="secondary", use_container_width=True):
                    with st.spinner("Running 1000 Monte Carlo simulations..."):
                        try:
                            # Create RobustDCFEngine with correct signature: (company_data, financials)
                            robust_engine = RobustDCFEngine(
                                company_data=assemble_monte_carlo_company_data(company, financials, shares),
                                financials=financials
                            )

                            # Set base assumptions on the engine's internal assumption manager
                            robust_engine.assumptions.set('revenue_growth', revenue_growth if not dashboard_active else (projections[-1]['revenue'] / projections[0]['revenue']) ** (1/len(projections)) - 1)
                            robust_engine.assumptions.set('ebitda_margin', ebit_margin if not dashboard_active else 0.25)
                            robust_engine.assumptions.set('terminal_growth', terminal_growth)
                            robust_engine.assumptions.set('wacc', discount_rate)
                            robust_engine.assumptions.set('tax_rate', tax_rate if not dashboard_active else financials.get('tax_rate', 0.21))
                            robust_engine.assumptions.set('capex_pct', capex_pct if not dashboard_active else 0.05)
                            robust_engine.assumptions.set('nwc_change', (wc_intensity_pct * financials.get('revenue', 0) * 0.05) if not dashboard_active else 0)

                            # Run Monte Carlo
                            mc = MonteCarloDCF()
                            mc_results = mc.run_simulation(robust_engine, n_simulations=1000)

                            if mc_results['success']:
                                # Display results
                                display_monte_carlo_results(mc_results, current_price)

                                # Store in session state
                                st.session_state['monte_carlo_results'] = mc_results

                                st.success("✅ Monte Carlo simulation complete!")
                            else:
                                st.error(f"❌ Monte Carlo simulation failed: {mc_results.get('error', 'Unknown error')}")

                        except (ValueError, KeyError, TypeError, ZeroDivisionError, OverflowError, AttributeError) as e:
                            st.error(f"❌ Monte Carlo simulation error: {str(e)}")
                            import traceback
                            with st.expander("Error Details"):
                                st.code(traceback.format_exc())


            # ============================================================
            # DCF TRAP DETECTION SYSTEM (ATLAS v11.0)
            # ============================================================
            if method in ['FCFF', 'FCFE'] and DCF_TRAP_DETECTION_AVAILABLE:
                st.markdown("---")
                st.markdown("### 🔍 DCF Quality Assessment (NEW)")

                st.info("""
                **🎯 What is this?** The DCF Trap Detection System analyzes your valuation assumptions to identify common
                patterns associated with value traps. Philosophy: *"Mathematically sound ≠ Economically sound"*

                This institutional-grade analysis checks for:
                • Discount Rate Illusion • Terminal Value Dependency • Revenue Concentration
                • Idiosyncratic Optionality • Absence of Critical Factor
                """)

                # Run trap detection
                with st.spinner("🔍 Running trap detection analysis..."):
                    try:
                        # Run trap detection
                        dcf_inputs_for_trap_detection = assemble_trap_inputs(
                            projections, method, discount_rate, terminal_growth,
                            results, current_price, intrinsic_value,
                        )
                        trap_summary = analyze_dcf_traps(company['ticker'], dcf_inputs_for_trap_detection)

                        # Display warnings
                        display_trap_warnings(trap_summary, company['ticker'])

                    except (ValueError, KeyError, TypeError, AttributeError) as e:
                        st.error(f"⚠️ Trap detection error: {str(e)}")
                        st.info("Trap detection requires valid DCF inputs. Please ensure all assumptions are properly configured.")

            # =================================================================
            # SBC BEFORE/AFTER COMPARISON
            # =================================================================
            if st.session_state.get('sbc_enabled', False) and SBC_AVAILABLE:
                st.markdown("---")
                st.markdown("#### 💰 SBC Impact on Valuation")

                try:
                    # Get SBC data from session state
                    sbc_forecast = st.session_state.get('sbc_forecast', {})
                    projections_without_sbc = st.session_state.get('projections_without_sbc', [])
                    forecaster = st.session_state.get('sbc_forecaster')

                    if sbc_forecast and projections_without_sbc and forecaster:
                        # Calculate valuation WITHOUT SBC for comparison
                        projections_dict_no_sbc = {p['year']: p for p in projections_without_sbc}
                        terminal_value_no_sbc = calculate_terminal_value(
                            projections_without_sbc[-1]['fcff'],
                            discount_rate,
                            terminal_growth
                        )

                        dcf_results_no_sbc = calculate_dcf_value(
                            projections_without_sbc,
                            discount_rate,
                            terminal_value_no_sbc,
                            results.get('diluted_shares', company['shares_outstanding']),
                            results.get('net_debt', 0),
                            method
                        )

                        # Create comparison analysis
                        comparison = create_sbc_comparison_analysis(
                            valuation_without_sbc=dcf_results_no_sbc,
                            valuation_with_sbc=results,
                            sbc_forecast=sbc_forecast
                        )

                        # Display comparison using the UI component
                        display_sbc_valuation_impact(comparison, company['ticker'])

                        # Educational message
                        with st.expander("📚 Why This Matters", expanded=False):
                            st.markdown("""
                            ### Share-Based Compensation is a Real Cost

                            Many analysts ignore SBC in DCF valuations, treating it as "non-cash."
                            This is incorrect because:

                            1. **SBC dilutes shareholders** - Every stock grant reduces your ownership %
                            2. **SBC represents real economic transfer** - If not paid in stock, would be cash
                            3. **High-SBC companies are systematically overvalued** - Ignoring 10%+ SBC causes 15-20% overvaluation

                            **ATLAS properly treats SBC as a cash cost**, providing more accurate valuations.

                            **The comparison above shows:**
                            - How much fair value changes when SBC is properly accounted for
                            - The percentage impact on enterprise value
                            - Whether ignoring SBC would cause material mispricing

                            **Rule of Thumb:**
                            - SBC < 3% of revenue: Not material, minor impact
                            - SBC 3-7%: Material, should be modeled
                            - SBC > 7%: Highly material, ignoring it causes major overvaluation
                            """)

                except (ValueError, KeyError, TypeError, AttributeError) as e:
                    st.warning(f"⚠️ Could not display SBC comparison: {str(e)}")

            # Detailed Projections Table
            st.markdown("---")
            st.markdown("#### 📋 Detailed Cash Flow Projections")

            # Ensure projections is in correct format for DataFrame
            if projections and isinstance(projections, list):
                proj_df = pd.DataFrame(projections)
            else:
                st.warning("⚠️ Projections data not available in expected format")
                proj_df = pd.DataFrame()  # Empty DataFrame

            # Format for display
            if method == 'FCFF':
                display_cols = ['year', 'revenue', 'ebit', 'nopat', 'depreciation', 'capex', 'change_wc', 'fcff']
                col_names = ['Year', 'Revenue', 'EBIT', 'NOPAT', 'D&A', 'CapEx', 'ΔWC', 'FCFF']
            else:
                display_cols = ['year', 'revenue', 'net_income', 'depreciation', 'capex', 'change_wc', 'net_borrowing', 'fcfe']
                col_names = ['Year', 'Revenue', 'Net Income', 'D&A', 'CapEx', 'ΔWC', 'Borrowing', 'FCFE']

            # Check if all required columns exist in projections
            if not proj_df.empty and all(col in proj_df.columns for col in display_cols):
                proj_display = proj_df[display_cols].copy()
                proj_display.columns = col_names
            else:
                # Fallback: show all available columns
                proj_display = proj_df.copy()
                st.warning(f"⚠️ Some projection columns missing. Showing available data.")

            # Format numbers
            for col in proj_display.columns:
                if col != 'Year':
                    proj_display[col] = proj_display[col].apply(format_large_number)

            from core.atlas_table_formatting import render_generic_table
            col_defs_tv = [{'key': c, 'label': c, 'type': 'text'} for c in proj_display.columns]
            st.markdown(render_generic_table(proj_display, columns=col_defs_tv), unsafe_allow_html=True)

            st.info("💡 **Technical Note:** D&A and CapEx scale with revenue growth (as they should!)")

            # ================================================================
            # MODEL WORKINGS — transparent audit trail of every assumption
            # ================================================================
            if method in ['FCFF', 'FCFE'] and projections:
                st.markdown("---")
                with st.expander("📐 Model Workings — Full Assumption Audit Trail", expanded=False):
                    _wd = st.session_state.get('_live_wacc_detail', {})
                    _tv_mth = st.session_state.get('_tv_method_used', 'Gordon Growth (Perpetuity)')
                    _exit_m = st.session_state.get('_exit_mult_used', 12.0)
                    _net_debt_display = results.get('net_debt', 0)

                    # ── WACC Decomposition ───────────────────────────────────
                    st.markdown("#### 💹 Cost of Capital Decomposition")
                    if _wd:
                        wk_c1, wk_c2, wk_c3 = st.columns(3)
                        with wk_c1:
                            st.markdown(f"""
                            **Cost of Equity (Ke)**
                            - Risk-Free Rate (Rf): **{_wd.get('risk_free_rate', 0)*100:.2f}%**
                            - Beta (β): **{_wd.get('beta', 0):.2f}**
                            - Equity Risk Premium: **{_wd.get('equity_risk_premium', 0)*100:.2f}%**
                            - Size Premium: **{_wd.get('size_premium', 0)*100:.2f}%**
                            - **Ke = {_wd.get('cost_of_equity', 0)*100:.2f}%**
                            """)
                        with wk_c2:
                            st.markdown(f"""
                            **Cost of Debt (Kd)**
                            - Pre-tax Kd: **{_wd.get('pre_tax_cost_debt', 0)*100:.2f}%**
                            - Tax Rate: **{tax_rate*100 if not dashboard_active else results.get('tax_rate', 21):.1f}%**
                            - Tax Shield: **{_wd.get('tax_shield_contribution', 0)*100:.2f}%**
                            - **After-tax Kd = {_wd.get('after_tax_cost_debt', 0)*100:.2f}%**
                            """)
                        with wk_c3:
                            st.markdown(f"""
                            **Capital Structure**
                            - Equity Weight: **{_wd.get('equity_weight', 1)*100:.1f}%**
                            - Debt Weight: **{_wd.get('debt_weight', 0)*100:.1f}%**
                            - **WACC = {_wd.get('wacc', discount_rate)*100:.2f}%**
                            """)
                    else:
                        st.markdown(f"**Discount Rate used:** {discount_rate*100:.2f}%")

                    # ── Terminal Value Workings ───────────────────────────────
                    st.markdown("---")
                    st.markdown("#### 🎯 Terminal Value Workings")
                    tv_wk_c1, tv_wk_c2 = st.columns(2)
                    with tv_wk_c1:
                        _gordon_tv = st.session_state.get('_gordon_tv', results.get('terminal_value', 0))
                        st.markdown(f"""
                        **Gordon Growth**
                        - FCF(Year {len(projections)}): **${projections[-1].get('fcff', 0)/1e9:.2f}B**
                        - Terminal Growth (g): **{terminal_growth*100:.2f}%**
                        - Discount Rate (r): **{discount_rate*100:.2f}%**
                        - TV = FCF × (1+g) / (r-g) = **${_gordon_tv/1e9:.2f}B**
                        - PV(TV) = **${results.get('pv_terminal', 0)/1e9:.2f}B**
                        """)
                    with tv_wk_c2:
                        _final_ebitda = st.session_state.get('_final_ebitda', 0)
                        if _final_ebitda:
                            st.markdown(f"""
                            **Exit Multiple**
                            - EBITDA(Year {len(projections)}): **${_final_ebitda/1e9:.2f}B**
                            - EV/EBITDA Multiple: **{_exit_m:.1f}×**
                            - Terminal EV = **${_final_ebitda * _exit_m/1e9:.2f}B**
                            - Method Used: **{_tv_mth}**
                            """)

                    # ── Value Build-up ────────────────────────────────────────
                    st.markdown("---")
                    st.markdown("#### 🏗️ Intrinsic Value Build-up")
                    _pv_cfs  = results.get('total_pv_cash_flows', 0)
                    _pv_tv   = results.get('pv_terminal', 0)
                    _ev      = results.get('enterprise_value', 0)
                    _eq_val  = results.get('equity_value', 0)
                    _shares_used = shares
                    _iv      = results.get('intrinsic_value_per_share', 0)
                    _tv_pct  = _pv_tv / _ev * 100 if _ev else 0
                    _cf_pct  = _pv_cfs / _ev * 100 if _ev else 0

                    st.markdown(f"""
                    | Component | Value | % of Enterprise Value |
                    |---|---|---|
                    | PV of Forecast Cash Flows | **${_pv_cfs/1e9:.2f}B** | {_cf_pct:.1f}% |
                    | PV of Terminal Value | **${_pv_tv/1e9:.2f}B** | {_tv_pct:.1f}% |
                    | **Enterprise Value** | **${_ev/1e9:.2f}B** | 100% |
                    | Less: Net Debt | (${_net_debt_display/1e9:.2f}B) | — |
                    | **Equity Value** | **${_eq_val/1e9:.2f}B** | — |
                    | Shares Outstanding | {_shares_used/1e9:.3f}B | — |
                    | **Intrinsic Value / Share** | **${_iv:.2f}** | — |
                    """)

                    if _tv_pct > 80:
                        st.warning(f"⚠️ Terminal value represents {_tv_pct:.0f}% of enterprise value — result is highly sensitive to perpetuity assumptions.")

                    # ── Year-by-Year Projection Details ──────────────────────
                    st.markdown("---")
                    st.markdown("#### 📊 Year-by-Year Cash Flow Architecture")
                    _proj_detail = []
                    _cum_pv = 0
                    for _yr_proj in projections:
                        _yr = _yr_proj['year']
                        _cf_key = 'fcff' if method == 'FCFF' else 'fcfe'
                        _cf = _yr_proj.get(_cf_key, 0)
                        _pv_yr = _cf / ((1 + discount_rate) ** _yr)
                        _cum_pv += _pv_yr
                        _row = {
                            'Year': _yr,
                            'Revenue': f"${_yr_proj.get('revenue', 0)/1e9:.2f}B",
                            'Rev Growth': f"{_yr_proj.get('revenue_growth', 0)*100:.1f}%",
                            'EBIT Margin': f"{_yr_proj.get('ebit_margin', _yr_proj.get('ni_margin', 0))*100:.1f}%",
                            'NOPAT/NI': f"${_yr_proj.get('nopat', _yr_proj.get('net_income', 0))/1e6:.0f}M",
                            'D&A': f"${_yr_proj.get('depreciation', 0)/1e6:.0f}M",
                            'CapEx': f"(${_yr_proj.get('capex', 0)/1e6:.0f}M)",
                            'ΔWC': f"(${_yr_proj.get('change_wc', 0)/1e6:.0f}M)",
                            'SBC': f"(${_yr_proj.get('sbc', 0)/1e6:.0f}M)" if _yr_proj.get('sbc', 0) else '—',
                            'FCF': f"${_cf/1e6:.0f}M",
                            'PV Factor': f"{1/(1+discount_rate)**_yr:.4f}",
                            'PV(FCF)': f"${_pv_yr/1e6:.0f}M",
                        }
                        _proj_detail.append(_row)
                    _proj_detail_df = pd.DataFrame(_proj_detail)
                    from core.atlas_table_formatting import render_generic_table
                    _detail_cols = [{'key': k, 'label': k, 'type': 'text'} for k in _proj_detail_df.columns]
                    st.markdown(render_generic_table(_proj_detail_df, columns=_detail_cols), unsafe_allow_html=True)

            # ================================================================
            # ROIC / WACC SPREAD — Value creation indicator
            # ================================================================
            if method in ['FCFF', 'FCFE']:
                st.markdown("---")
                st.markdown("#### 🔬 ROIC vs WACC — Value Creation Analysis")
                _ebit_r  = financials.get('ebit', 0)
                _taxr    = financials.get('tax_rate', 0.21)
                _teq     = financials.get('total_equity', company.get('market_cap', 0))
                _tdebt   = financials.get('total_debt', 0)
                _cash_r  = financials.get('cash', 0)
                try:
                    _roic_m = calculate_roic_metrics(_ebit_r, _taxr, _teq, _tdebt, _cash_r)
                    _roic   = _roic_m['roic']
                    _ic     = _roic_m['invested_capital']
                    _nopat  = _roic_m['nopat']
                    _spread = _roic - discount_rate

                    rc1, rc2, rc3, rc4 = st.columns(4)
                    with rc1:
                        st.markdown(metric_card('🏭', 'INVESTED CAPITAL', format_large_number(_ic), _CYAN, 'Equity + Debt − Cash', accent='cyan'), unsafe_allow_html=True)
                    with rc2:
                        st.markdown(metric_card('💎', 'NOPAT', format_large_number(_nopat), _VIOLET, 'EBIT × (1−T)', accent='purple'), unsafe_allow_html=True)
                    with rc3:
                        _roic_col = _metric_color(_roic, green_above=discount_rate, amber_above=discount_rate * 0.8)
                        _roic_label = 'Value Creating' if _spread > 0 else 'Value Destroying'
                        st.markdown(metric_card('📈', 'ROIC', f'{_roic*100:.1f}%', _roic_col, _roic_label, accent='green'), unsafe_allow_html=True)
                    with rc4:
                        _spread_col = _GREEN if _spread > 0 else _RED
                        _spread_label = f'{_spread*100:+.1f}% vs WACC'
                        st.markdown(metric_card('⚡', 'ROIC − WACC Spread', f'{_spread*100:+.1f}%', _spread_col, _spread_label, accent='amber'), unsafe_allow_html=True)

                    if _spread > 0:
                        st.success(f"✅ ROIC ({_roic*100:.1f}%) > WACC ({discount_rate*100:.1f}%) — company is generating economic value.")
                    else:
                        st.warning(f"⚠️ ROIC ({_roic*100:.1f}%) < WACC ({discount_rate*100:.1f}%) — capital allocation is destroying value.")
                except (ValueError, ZeroDivisionError, TypeError):
                    st.info("ROIC analysis requires EBIT and balance sheet data.")

            # ================================================================
            # FCFF ↔ FCFE BRIDGE — explicit reconciliation
            # ================================================================
            if method in ['FCFF', 'FCFE'] and projections:
                st.markdown("---")
                with st.expander("🔗 FCFF ↔ FCFE Bridge — Explicit Reconciliation", expanded=False):
                    st.markdown("""
                    **FCFE = FCFF − Interest × (1 − Tax Rate) + Net Borrowing**

                    This table reconciles both cash flow definitions year-by-year.
                    """)
                    _bridge_rows = []
                    _kd_used = st.session_state.get('_live_wacc_detail', {}).get('pre_tax_cost_debt', 0.05)
                    _td_curr = financials.get('total_debt', 0)
                    _taxr_b  = financials.get('tax_rate', 0.21)
                    for _bp in projections:
                        _fcff_b = _bp.get('fcff', 0)
                        _int_exp = _td_curr * _kd_used
                        _ati     = _int_exp * (1 - _taxr_b)
                        _nb_b    = _bp.get('net_borrowing', 0)
                        _fcfe_b  = _fcff_b - _ati + _nb_b
                        _bridge_rows.append({
                            'Year': _bp['year'],
                            'FCFF': f"${_fcff_b/1e6:.0f}M",
                            '− Interest×(1−T)': f"(${_ati/1e6:.0f}M)",
                            '+ Net Borrowing': f"${_nb_b/1e6:.0f}M",
                            '= FCFE': f"${_fcfe_b/1e6:.0f}M",
                        })
                    _bridge_df = pd.DataFrame(_bridge_rows)
                    from core.atlas_table_formatting import render_generic_table
                    _b_cols = [{'key': k, 'label': k, 'type': 'text'} for k in _bridge_df.columns]
                    st.markdown(render_generic_table(_bridge_df, columns=_b_cols), unsafe_allow_html=True)

            # ================================================================
            # ENHANCED SENSITIVITY — Revenue Growth × EBIT Margin 2D Table
            # ================================================================
            if method in ['FCFF', 'FCFE'] and projections:
                st.markdown("---")
                st.markdown("#### 🗺️ Revenue Growth × EBIT Margin Sensitivity")
                _base_rev_s = financials.get('revenue', 0)
                _base_tg    = terminal_growth
                _base_dr    = discount_rate
                _base_depr  = depreciation_pct if not dashboard_active else 0.03
                _base_capex = capex_pct if not dashboard_active else 0.05
                _base_sbc   = sbc_pct if not dashboard_active else 0.0
                _base_wci   = wc_intensity_pct if not dashboard_active else 0.05
                _base_tax   = tax_rate if not dashboard_active else financials.get('tax_rate', 0.21)
                _base_shrs  = shares
                _base_nd    = results.get('net_debt', 0)
                _base_fy    = len(projections)

                _rev_growths = [revenue_growth - 0.04, revenue_growth - 0.02, revenue_growth,
                                revenue_growth + 0.02, revenue_growth + 0.04]
                _margins     = [ebit_margin - 0.04, ebit_margin - 0.02, ebit_margin,
                                ebit_margin + 0.02, ebit_margin + 0.04]

                _sens_table = []
                for _rg in _rev_growths:
                    _row_sens = {'Rev Growth': f"{_rg*100:.1f}%"}
                    for _em in _margins:
                        try:
                            _p = project_fcff_advanced(
                                base_revenue=_base_rev_s,
                                ebit_margin_start=_em, ebit_margin_target=_em,
                                margin_convergence_years=_base_fy,
                                revenue_growth_start=_rg, revenue_growth_end=_rg,
                                tax_rate=_base_tax, depreciation_pct=_base_depr,
                                capex_pct=_base_capex, wc_intensity_pct=_base_wci,
                                sbc_pct=_base_sbc, forecast_years=_base_fy,
                            )
                            _f = _p[-1]['fcff']
                            _tv_s = calculate_terminal_value(_f, _base_dr, _base_tg)
                            _r = calculate_dcf_value(_p, _base_dr, _tv_s, _base_shrs, _base_nd, 'FCFF')
                            _iv_s = _r['intrinsic_value_per_share']
                        except Exception:
                            _iv_s = 0
                        _row_sens[f"Margin {_em*100:.1f}%"] = f"${_iv_s:.0f}"
                    _sens_table.append(_row_sens)

                _sens_df = pd.DataFrame(_sens_table)
                from core.atlas_table_formatting import render_generic_table
                _s_cols = [{'key': k, 'label': k, 'type': 'text'} for k in _sens_df.columns]
                st.markdown(render_generic_table(_sens_df, columns=_s_cols), unsafe_allow_html=True)
                st.caption("Intrinsic value per share at each Revenue Growth × EBIT Margin combination. All other assumptions held constant.")

            # ================================================================
            # ASSUMPTION BUILDER — Live interactive recalculation
            # ================================================================
            if method in ['FCFF', 'FCFE'] and projections:
                st.markdown("---")
                with st.expander("🔧 Assumption Builder — Interactive Recalculation", expanded=False):
                    st.markdown("""
                    Adjust key levers below and click **Recalculate** to see instant impact on intrinsic value.
                    All other assumptions stay fixed from your main model run.
                    """)
                    ab_c1, ab_c2, ab_c3, ab_c4 = st.columns(4)
                    with ab_c1:
                        _ab_wacc = st.slider("WACC Override (%)", 4.0, 20.0,
                                             float(f"{discount_rate*100:.1f}"), 0.25, key='ab_wacc') / 100
                    with ab_c2:
                        _ab_tgr = st.slider("Terminal Growth Override (%)", 0.0, 5.0,
                                             float(f"{terminal_growth*100:.1f}"), 0.1, key='ab_tgr') / 100
                    with ab_c3:
                        _ab_rg  = st.slider("Revenue Growth Override (%)", -10.0, 30.0,
                                             float(f"{revenue_growth*100:.1f}"), 0.5, key='ab_rg') / 100
                    with ab_c4:
                        _ab_em  = st.slider("EBIT Margin Override (%)", -10.0, 50.0,
                                             float(f"{ebit_margin*100:.1f}"), 0.5, key='ab_em') / 100

                    if st.button("🔄 Recalculate with Overrides", type="secondary", use_container_width=True, key='ab_recalc'):
                        try:
                            _ab_base = financials.get('revenue', 0)
                            _ab_fy   = len(projections)
                            _ab_sbc  = sbc_pct if not dashboard_active else 0
                            _ab_wci  = wc_intensity_pct if not dashboard_active else 0.05
                            _ab_tax  = tax_rate if not dashboard_active else financials.get('tax_rate', 0.21)
                            _ab_depr = depreciation_pct if not dashboard_active else 0.03
                            _ab_cap  = capex_pct if not dashboard_active else 0.05
                            _ab_nd   = results.get('net_debt', 0)
                            _ab_sh   = shares

                            _ab_proj = project_fcff_advanced(
                                base_revenue=_ab_base,
                                ebit_margin_start=_ab_em, ebit_margin_target=_ab_em,
                                margin_convergence_years=_ab_fy,
                                revenue_growth_start=_ab_rg, revenue_growth_end=_ab_rg,
                                tax_rate=_ab_tax, depreciation_pct=_ab_depr,
                                capex_pct=_ab_cap, wc_intensity_pct=_ab_wci,
                                sbc_pct=_ab_sbc, forecast_years=_ab_fy,
                            )
                            _ab_fcf  = _ab_proj[-1]['fcff']
                            _ab_tv   = calculate_terminal_value(_ab_fcf, _ab_wacc, _ab_tgr)
                            _ab_res  = calculate_dcf_value(_ab_proj, _ab_wacc, _ab_tv, _ab_sh, _ab_nd, 'FCFF')
                            _ab_iv   = _ab_res['intrinsic_value_per_share']
                            _ab_delta = _ab_iv - intrinsic_value
                            _ab_pct   = (_ab_delta / intrinsic_value * 100) if intrinsic_value else 0

                            ab_r1, ab_r2, ab_r3 = st.columns(3)
                            with ab_r1:
                                st.metric("Original Intrinsic Value", f"${intrinsic_value:.2f}")
                            with ab_r2:
                                _ab_col = _GREEN if _ab_delta > 0 else _RED
                                st.metric("New Intrinsic Value", f"${_ab_iv:.2f}",
                                         delta=f"{_ab_delta:+.2f} ({_ab_pct:+.1f}%)")
                            with ab_r3:
                                _ab_up2 = calc_upside_downside(_ab_iv, current_price)
                                st.metric("New Upside/Downside", f"{_ab_up2:+.1f}%")

                        except Exception as _ab_e:
                            st.error(f"Recalculation error: {_ab_e}")

            # ================================================================
            # MARKET-IMPLIED GROWTH RATE — Reverse DCF
            # ================================================================
            if method in ['FCFF', 'FCFE']:
                st.markdown("---")
                st.markdown("#### 🔭 Market-Implied Growth Analysis (Reverse DCF)")
                st.markdown("""
                *"What revenue growth rate does the current stock price imply, given your assumptions?"*

                The market is always setting a price — this tool backs out the growth expectation
                embedded in that price, so you can judge whether it's achievable.
                """)

                if st.button("🔭 Compute Market-Implied Growth Rate", type="secondary", use_container_width=True, key='implied_growth_btn'):
                    with st.spinner("Solving reverse DCF..."):
                        try:
                            _ig_base   = financials.get('revenue', 0)
                            _ig_em     = ebit_margin if not dashboard_active else 0.20
                            _ig_tax    = tax_rate if not dashboard_active else financials.get('tax_rate', 0.21)
                            _ig_depr   = depreciation_pct if not dashboard_active else 0.03
                            _ig_cap    = capex_pct if not dashboard_active else 0.05
                            _ig_wci    = wc_intensity_pct if not dashboard_active else 0.05
                            _ig_sbc    = sbc_pct if not dashboard_active else 0.0
                            _ig_dr     = discount_rate
                            _ig_tgr    = terminal_growth
                            _ig_sh     = shares
                            _ig_nd     = results.get('net_debt', 0)
                            _ig_fy     = len(projections)

                            _impl_g, _impl_status = calculate_implied_growth_rate(
                                current_price=current_price,
                                base_revenue=_ig_base,
                                ebit_margin=_ig_em,
                                tax_rate=_ig_tax,
                                depreciation_pct=_ig_depr,
                                capex_pct=_ig_cap,
                                wc_intensity_pct=_ig_wci,
                                sbc_pct=_ig_sbc,
                                discount_rate=_ig_dr,
                                terminal_growth=_ig_tgr,
                                shares_outstanding=_ig_sh,
                                net_debt=_ig_nd,
                                forecast_years=_ig_fy,
                            )

                            st.session_state['_implied_growth'] = _impl_g
                            st.session_state['_implied_status'] = _impl_status

                        except Exception as _ig_err:
                            st.error(f"Reverse DCF failed: {_ig_err}")

                if '_implied_growth' in st.session_state:
                    _impl_g      = st.session_state['_implied_growth']
                    _impl_status = st.session_state.get('_implied_status', 'found')
                    _your_growth = revenue_growth if not dashboard_active else 0.05

                    ig_c1, ig_c2, ig_c3 = st.columns(3)
                    with ig_c1:
                        _ig_col = _metric_color(_impl_g, green_below=_your_growth, amber_below=_your_growth + 0.05)
                        st.markdown(metric_card('🔭', 'IMPLIED GROWTH RATE', f'{_impl_g*100:.1f}%/yr',
                                                _ig_col, 'Market-embedded expectation', accent='cyan'), unsafe_allow_html=True)
                    with ig_c2:
                        st.markdown(metric_card('📊', 'YOUR MODEL GROWTH', f'{_your_growth*100:.1f}%/yr',
                                                _VIOLET, 'Your DCF assumption', accent='purple'), unsafe_allow_html=True)
                    with ig_c3:
                        _growth_gap = _impl_g - _your_growth
                        _gap_col = _GREEN if _growth_gap < 0 else _RED
                        _gap_label = 'Market over-expects vs your model' if _growth_gap > 0 else 'Market under-expects vs your model'
                        st.markdown(metric_card('⚡', 'GAP', f'{_growth_gap*100:+.1f}%',
                                                _gap_col, _gap_label, accent='amber'), unsafe_allow_html=True)

                    if _impl_status == 'below_range':
                        st.error("⚠️ Market price implies growth BELOW −25% — likely distress pricing or significant non-operating issues.")
                    elif _impl_status == 'above_range':
                        st.warning("⚠️ Market price implies growth ABOVE 100% — extraordinary expectations. Verify with qualitative thesis.")
                    else:
                        if _growth_gap > 0.05:
                            st.warning(f"⚠️ The market is pricing in **{_impl_g*100:.1f}%** annual growth — **{_growth_gap*100:.1f}% higher than your model.** Overvalued relative to your assumptions.")
                        elif _growth_gap < -0.05:
                            st.success(f"✅ The market is pricing in only **{_impl_g*100:.1f}%** growth — **{abs(_growth_gap)*100:.1f}% below your model.** Margin of safety present.")
                        else:
                            st.info(f"📊 Market-implied growth ({_impl_g*100:.1f}%) is broadly in line with your model ({_your_growth*100:.1f}%). Stock appears fairly priced.")

                    # WACC sensitivity for implied growth
                    st.markdown("**Implied Growth Sensitivity to WACC:**")
                    _wacc_range = [_ig_dr - 0.02, _ig_dr - 0.01, _ig_dr, _ig_dr + 0.01, _ig_dr + 0.02]
                    _ig_sens_rows = []
                    for _wr in _wacc_range:
                        try:
                            _g_at_wr, _ = calculate_implied_growth_rate(
                                current_price=current_price,
                                base_revenue=_ig_base if '_ig_base' in dir() else financials.get('revenue', 0),
                                ebit_margin=_ig_em if '_ig_em' in dir() else ebit_margin,
                                tax_rate=_ig_tax if '_ig_tax' in dir() else tax_rate,
                                depreciation_pct=_ig_depr if '_ig_depr' in dir() else depreciation_pct,
                                capex_pct=_ig_cap if '_ig_cap' in dir() else capex_pct,
                                wc_intensity_pct=_ig_wci if '_ig_wci' in dir() else 0.05,
                                sbc_pct=_ig_sbc if '_ig_sbc' in dir() else 0.0,
                                discount_rate=_wr,
                                terminal_growth=_ig_tgr if '_ig_tgr' in dir() else terminal_growth,
                                shares_outstanding=_ig_sh if '_ig_sh' in dir() else shares,
                                net_debt=_ig_nd if '_ig_nd' in dir() else results.get('net_debt', 0),
                                forecast_years=_ig_fy if '_ig_fy' in dir() else 5,
                            )
                        except Exception:
                            _g_at_wr = None
                        _ig_sens_rows.append({
                            'WACC': f"{_wr*100:.1f}%",
                            'Implied Growth': f"{_g_at_wr*100:.1f}%" if _g_at_wr is not None else "N/A",
                        })
                    _ig_sens_df = pd.DataFrame(_ig_sens_rows)
                    from core.atlas_table_formatting import render_generic_table
                    _ig_cols = [{'key': k, 'label': k, 'type': 'text'} for k in _ig_sens_df.columns]
                    st.markdown(render_generic_table(_ig_sens_df, columns=_ig_cols), unsafe_allow_html=True)


            # Export Options
            st.markdown("---")
            col1, col2, col3 = st.columns(3)

            with col1:
                if st.button("📥 Export to Excel", use_container_width=True):
                    st.info("Excel export feature coming soon!")

            with col2:
                if st.button("📄 Generate PDF Report", use_container_width=True):
                    st.info("PDF export feature coming soon!")

            with col3:
                if st.button("🔄 Reset Valuation", use_container_width=True):
                    for key in ['dcf_results', 'dcf_projections', 'used_smart_assumptions']:
                        if key in st.session_state:
                            del st.session_state[key]
                    st.rerun()

    else:
        # No company loaded
        st.markdown("---")
        st.markdown("""
        ### 📚 How to Use Valuation House - Excellence Edition

        **NEW in v9.3: 🤖 Smart Assumptions Mode**
        - AI-generated assumptions based on sector benchmarks
        - Realistic, economically grounded projections
        - Toggle between manual and smart modes

        **Step 1:** Search for any publicly traded company
        **Step 2:** Choose FCFF or FCFE valuation method
        **Step 3:** Enable Smart Assumptions or customize manually
        **Step 4:** Calculate intrinsic value and analyze results
        **Step 5:** Review sensitivity analysis

        ---

        ### ✨ What's New in v9.3 Excellence

        ✅ **Smart Assumptions:** AI-powered realistic assumptions
        ✅ **Fixed Scaling:** D&A and CapEx properly scale with revenue
        ✅ **Enhanced Visuals:** Seamless dark mode theming
        ✅ **Better Analysis:** More comprehensive sensitivity testing

        *Ready to start? Enter a ticker symbol above!* 🚀
        """)

    # ========================================================================
    # MONTE CARLO ENGINE (v11.0)
