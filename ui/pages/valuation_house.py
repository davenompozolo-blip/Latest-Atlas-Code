"""
ATLAS Terminal - Valuation House Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator

INSTITUTIONAL_DCF_AVAILABLE = False


def render_valuation_house(start_date, end_date):
    """Render the Valuation House page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import (
        # Data Functions
        ATLASFormatter,
        fetch_company_financials,
        fetch_peer_companies,
        fetch_analyst_data,
        make_scrollable_table,
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
        av_client,
        ALPHA_VANTAGE_AVAILABLE,
    )
    from ui.components import ATLAS_TEMPLATE

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
        from atlas_dcf_institutional import (
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

    with col1:
        ticker_input = st.text_input(
            "Enter Ticker Symbol",
            placeholder="e.g., AAPL, MSFT, GOOGL",
            help="Enter any publicly traded company ticker"
        ).upper()

    with col2:
        search_button = st.button("🚀 Load Company", type="primary", use_container_width=True)

    with col3:
        fetch_button = st.button(
            "📥 Fetch Financials",
            type="secondary",
            use_container_width=True,
            disabled=not ALPHA_VANTAGE_AVAILABLE
        )

    if search_button and ticker_input:
        with st.spinner(f"📊 Fetching data for {ticker_input}..."):
            company_data = fetch_company_financials(ticker_input)

            if company_data['success']:
                st.session_state['valuation_company'] = company_data
                st.success(f"✅ Loaded {company_data['company']['name']}")
            else:
                st.error(f"❌ Could not fetch data: {company_data.get('error', 'Unknown error')}")

    if fetch_button and ticker_input:
        if not ALPHA_VANTAGE_AVAILABLE or not av_client.is_configured:
            st.warning("Alpha Vantage not configured. Add API key to secrets.")
        else:
            with st.spinner(f"Fetching {ticker_input} financials..."):
                dcf_inputs = av_client.get_dcf_inputs(ticker_input)

            if dcf_inputs:
                st.success(f"✅ Loaded {dcf_inputs['name']} financials")

                # Store in session state for DCF form
                st.session_state['av_financials'] = dcf_inputs

                # Display overview
                with st.expander("📊 Company Overview", expanded=True):
                    col1, col2, col3, col4 = st.columns(4)

                    col1.metric(
                        "Market Cap",
                        f"${dcf_inputs['market_cap'] / 1e9:.1f}B" if dcf_inputs['market_cap'] else "N/A"
                    )
                    col2.metric(
                        "P/E Ratio",
                        f"{dcf_inputs['pe_ratio']:.1f}" if dcf_inputs['pe_ratio'] else "N/A"
                    )
                    col3.metric(
                        "Beta",
                        f"{dcf_inputs['beta']:.2f}" if dcf_inputs['beta'] else "N/A"
                    )
                    col4.metric(
                        "Analyst Target",
                        f"${dcf_inputs['target_price']:.0f}" if dcf_inputs['target_price'] else "N/A"
                    )

                    profit_margin = dcf_inputs.get('profit_margin')
                    operating_margin = dcf_inputs.get('operating_margin')
                    roe = dcf_inputs.get('roe')

                    def _format_pct(value):
                        return f"{value * 100:.1f}%" if value is not None else "N/A"

                    st.markdown(
                        f"""
                        **Sector:** {dcf_inputs['sector']} | **Industry:** {dcf_inputs['industry']}

                        **Margins:** Profit {_format_pct(profit_margin)} | Operating {_format_pct(operating_margin)}

                        **Returns:** ROE {_format_pct(roe)}
                        """
                    )

                # Display historical data
                if 'revenue_history' in dcf_inputs:
                    with st.expander("📈 Revenue History (5yr)", expanded=False):
                        rev_df = pd.DataFrame(dcf_inputs['revenue_history'])
                        st.dataframe(rev_df, use_container_width=True, hide_index=True)

                if 'fcf_history' in dcf_inputs:
                    with st.expander("💰 Cash Flow History (5yr)", expanded=False):
                        fcf_df = pd.DataFrame(dcf_inputs['fcf_history'])
                        fcf_df['fcf'] = fcf_df['operatingCashflow'] - abs(fcf_df['capitalExpenditures'])
                        st.dataframe(fcf_df, use_container_width=True, hide_index=True)
            else:
                st.error(f"Could not fetch financials for {ticker_input}")

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
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💰</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CURRENT PRICE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #10b981; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{format_currency(company["current_price"])}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">Market Price</p></div></div>', unsafe_allow_html=True)

        # Market Cap
        with col2:
            mkt_cap_b = company['market_cap'] / 1e9 if company['market_cap'] > 0 else 0
            mkt_cap_tier = 'Large Cap' if mkt_cap_b > 10 else ('Mid Cap' if mkt_cap_b > 2 else 'Small Cap')
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">MARKET CAP</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #8b5cf6; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{format_large_number(company["market_cap"])}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{mkt_cap_tier}</p></div></div>', unsafe_allow_html=True)

        # Sector
        with col3:
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #0891b2); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🏢</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">SECTOR</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #06b6d4; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{company["sector"]}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #67e8f9; margin: 0; font-weight: 600;">Industry Class</p></div></div>', unsafe_allow_html=True)

        # Beta
        with col4:
            beta_val = company['beta']
            beta_color = '#10b981' if beta_val < 1.0 else ('#fbbf24' if beta_val < 1.5 else '#ef4444')
            beta_status = 'Low Volatility' if beta_val < 1.0 else ('Market Average' if beta_val < 1.5 else 'High Volatility')
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(245,158,11,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #f59e0b, #d97706); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">BETA</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {beta_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{beta_val:.2f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(245,158,11,0.12); border-radius: 10px; border: 1px solid rgba(245,158,11,0.25);"><p style="font-size: 0.7rem; color: #fbbf24; margin: 0; font-weight: 600;">{beta_status}</p></div></div>', unsafe_allow_html=True)

        # Forward P/E
        with col5:
            fwd_pe = company.get('forward_pe', None)
            if fwd_pe and fwd_pe != 'N/A':
                fwd_pe_color = '#10b981' if fwd_pe < 15 else ('#fbbf24' if fwd_pe < 25 else '#ef4444')
                fwd_pe_status = 'Undervalued' if fwd_pe < 15 else ('Fair Value' if fwd_pe < 25 else 'Expensive')
                fwd_pe_display = f"{fwd_pe:.1f}"
            else:
                fwd_pe_color = '#94a3b8'
                fwd_pe_status = 'No Data'
                fwd_pe_display = 'N/A'
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(239,68,68,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(239,68,68,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ef4444, #dc2626); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💹</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">FORWARD P/E</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {fwd_pe_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{fwd_pe_display}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(239,68,68,0.12); border-radius: 10px; border: 1px solid rgba(239,68,68,0.25);"><p style="font-size: 0.7rem; color: #fca5a5; margin: 0; font-weight: 600;">{fwd_pe_status}</p></div></div>', unsafe_allow_html=True)

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
                            'risk_on': ('#10b981', '🟢'),
                            'risk_off': ('#ef4444', '🔴'),
                            'transitional': ('#f59e0b', '🟡'),
                            'neutral': ('#94a3b8', '⚪')
                        }
                        banner_color, regime_emoji = regime_colors.get(regime, ('#94a3b8', '⚪'))

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
                                    <p style="margin: 0.25rem 0 0 0; color: #94a3b8; font-size: 0.9rem;">
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
                            wacc_color = '#ef4444' if wacc_delta > 0 else ('#10b981' if wacc_delta < 0 else '#94a3b8')
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
                            tg_color = '#10b981' if tg_delta > 0 else ('#ef4444' if tg_delta < 0 else '#94a3b8')
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
                            impact_color = '#10b981'
                            impact_icon = '📈'
                            impact_msg = "Regime-adjusted inputs will produce HIGHER valuation (lower discount rate + higher growth)"
                        elif impact == 'CONSERVATIVE':
                            impact_color = '#ef4444'
                            impact_icon = '📉'
                            impact_msg = "Regime-adjusted inputs will produce LOWER valuation (higher discount rate + lower growth)"
                        elif impact == 'MODERATELY CONSERVATIVE':
                            impact_color = '#f59e0b'
                            impact_icon = '⚠️'
                            impact_msg = "Regime-adjusted inputs will produce MODERATELY LOWER valuation"
                        else:
                            impact_color = '#94a3b8'
                            impact_icon = '➖'
                            impact_msg = "Regime-adjusted inputs will produce SIMILAR valuation (minimal adjustments)"

                        st.markdown(f"""
                        <div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95));
                                    backdrop-filter: blur(24px); padding: 1.25rem; margin: 1rem 0; border-radius: 20px;
                                    border: 1px solid rgba(99,102,241,0.2); box-shadow: 0 4px 24px rgba(0,0,0,0.2);
                                    position: relative; overflow: hidden;">
                            <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, {impact_color}, #6366f1); opacity: 0.8;"></div>
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <span style="font-size: 1.5rem;">{impact_icon}</span>
                                <div>
                                    <strong style="color: {impact_color}; font-size: 1.1rem;">
                                        {impact} VALUATION
                                    </strong>
                                    <p style="margin: 0.25rem 0 0 0; color: #cbd5e1; font-size: 0.9rem;">
                                        {impact_msg}
                                    </p>
                                </div>
                            </div>
                        </div>
                        """, unsafe_allow_html=True)

                    except Exception as e:
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

                            except Exception as e:
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
                                        net_debt = financials.get('total_debt', 0) - financials.get('cash', 0)

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

                                    except Exception as e:
                                        st.error(f"❌ Error calculating DCF: {str(e)}")
                                        import traceback
                                        st.code(traceback.format_exc())

                        with col2:
                            if st.button("📊 Export Projections", use_container_width=True):
                                # Export projections to DataFrame
                                if projections and isinstance(projections, (list, dict)):
                                    proj_df = pd.DataFrame(projections).T
                                    make_scrollable_table(proj_df, height=600, hide_index=True, use_container_width=True)

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
                    upside_pct = ((consensus_result['consensus_value'] / company['current_price'] - 1) * 100) if company['current_price'] > 0 else 0
                    consensus_color = '#10b981' if upside_pct > 20 else ('#fbbf24' if upside_pct > -20 else '#ef4444')
                    consensus_status = 'Undervalued' if upside_pct > 20 else ('Fair Value' if upside_pct > -20 else 'Overvalued')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🎯</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CONSENSUS FAIR VALUE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {consensus_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">${consensus_result["consensus_value"]:.2f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{consensus_status} ({upside_pct:+.1f}%)</p></div></div>', unsafe_allow_html=True)

                # Confidence Score
                with col2:
                    confidence_score = consensus_result['confidence_score']
                    confidence_color_hex = '#10b981' if confidence_score >= 70 else ('#fbbf24' if confidence_score >= 50 else '#ef4444')
                    confidence_emoji = "🟢" if confidence_score >= 70 else ("🟡" if confidence_score >= 50 else "🔴")
                    confidence_label = 'High Confidence' if confidence_score >= 70 else ('Moderate' if confidence_score >= 50 else 'Low Confidence')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CONFIDENCE SCORE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {confidence_color_hex}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{confidence_emoji} {confidence_score:.0f}/100</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{confidence_label} ({consensus_result["method_count"]} methods)</p></div></div>', unsafe_allow_html=True)

                # Current Price
                with col3:
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #0891b2); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💰</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CURRENT PRICE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #06b6d4; margin: 0.5rem 0 0.75rem 0; line-height: 1;">${company["current_price"]:.2f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #67e8f9; margin: 0; font-weight: 600;">Market Price</p></div></div>', unsafe_allow_html=True)

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
                make_scrollable_table(breakdown_df, height=400, hide_index=True, use_container_width=True)

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
            av_data = st.session_state.get('av_financials', {})
            av_revenue_cagr = None
            if av_data and av_data.get('revenue_history'):
                history = av_data['revenue_history']
                if len(history) >= 2:
                    try:
                        latest = float(history[0]['totalRevenue'])
                        oldest = float(history[-1]['totalRevenue'])
                        years = len(history) - 1
                        if oldest > 0 and years > 0:
                            av_revenue_cagr = ((latest / oldest) ** (1 / years) - 1) * 100
                    except (TypeError, ValueError, KeyError):
                        av_revenue_cagr = None

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
                    wacc_color = '#10b981' if discount_rate < 0.08 else ('#fbbf24' if discount_rate < 0.12 else '#ef4444')
                    wacc_status = 'Low Cost' if discount_rate < 0.08 else ('Average Cost' if discount_rate < 0.12 else 'High Cost')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💹</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">WACC (DISCOUNT RATE)</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {wacc_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{discount_rate*100:.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{wacc_status}</p></div></div>', unsafe_allow_html=True)

                # Terminal Growth Rate
                with col2:
                    tgr_color = '#10b981' if terminal_growth < 0.03 else ('#fbbf24' if terminal_growth < 0.05 else '#ef4444')
                    tgr_status = 'Conservative' if terminal_growth < 0.03 else ('Moderate' if terminal_growth < 0.05 else 'Aggressive')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">TERMINAL GROWTH RATE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {tgr_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{terminal_growth*100:.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{tgr_status}</p></div></div>', unsafe_allow_html=True)

                # Diluted Shares
                with col3:
                    shares_m = shares / 1e6
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #0891b2); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🔢</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">DILUTED SHARES</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #06b6d4; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{shares_m:.1f}M</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #67e8f9; margin: 0; font-weight: 600;">Treasury Stock Method</p></div></div>', unsafe_allow_html=True)

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
                            rev_gr_color = '#10b981' if revenue_growth > 0.10 else ('#fbbf24' if revenue_growth > 0.03 else '#ef4444')
                            rev_gr_status = 'Strong Growth' if revenue_growth > 0.10 else ('Moderate Growth' if revenue_growth > 0.03 else 'Slow Growth')
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">REVENUE GROWTH RATE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {rev_gr_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{revenue_growth*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{rev_gr_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
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
                            default_value = av_revenue_cagr if av_revenue_cagr is not None else 5.0
                            default_value = max(-10.0, min(30.0, default_value))
                            revenue_growth = st.slider(
                                "Revenue Growth Rate (%)",
                                min_value=-10.0,
                                max_value=30.0,
                                value=default_value,
                                step=0.5
                            ) / 100

                        if av_revenue_cagr is not None and not use_smart_assumptions:
                            st.caption(f"💡 Historical CAGR: {av_revenue_cagr:.1f}%")

                        if use_smart_assumptions:
                            ebit_margin = smart_params['ebit_margin']
                            ebit_color = '#10b981' if ebit_margin > 0.20 else ('#fbbf24' if ebit_margin > 0.10 else '#ef4444')
                            ebit_status = 'High Margin' if ebit_margin > 0.20 else ('Healthy' if ebit_margin > 0.10 else 'Low Margin')
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💼</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">EBIT MARGIN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {ebit_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{ebit_margin*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{ebit_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
                        else:
                            default_margin = 20.0
                            if av_data and av_data.get('operating_margin') is not None:
                                default_margin = max(0.0, min(50.0, float(av_data['operating_margin']) * 100))
                            ebit_margin = st.slider(
                                "EBIT Margin (%)",
                                min_value=0.0,
                                max_value=50.0,
                                value=default_margin,
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
                            capex_color = '#10b981' if capex_pct < 0.05 else ('#fbbf24' if capex_pct < 0.10 else '#ef4444')
                            capex_status = 'Low CapEx' if capex_pct < 0.05 else ('Moderate' if capex_pct < 0.10 else 'High CapEx')
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #0891b2); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🏗️</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CAPEX (% OF REVENUE)</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {capex_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{capex_pct*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #67e8f9; margin: 0; font-weight: 600;">{capex_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
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
                            depr_color = '#10b981' if depreciation_pct < 0.03 else ('#fbbf24' if depreciation_pct < 0.06 else '#ef4444')
                            depr_status = 'Low D&A' if depreciation_pct < 0.03 else ('Moderate' if depreciation_pct < 0.06 else 'High D&A')
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(245,158,11,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #f59e0b, #d97706); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📉</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">DEPRECIATION (% OF REVENUE)</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {depr_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{depreciation_pct*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(245,158,11,0.12); border-radius: 10px; border: 1px solid rgba(245,158,11,0.25);"><p style="font-size: 0.7rem; color: #fbbf24; margin: 0; font-weight: 600;">{depr_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
                        else:
                            depreciation_pct = st.slider(
                                "Depreciation (% of Revenue)",
                                min_value=0.0,
                                max_value=15.0,
                                value=3.0,
                                step=0.5
                            ) / 100

                        wc_change = st.number_input(
                            "Working Capital Change ($M)",
                            min_value=-1000.0,
                            max_value=1000.0,
                            value=float(smart_params['wc_change']) if use_smart_assumptions else 0.0,  # FIX: Ensure float
                            step=10.0
                        ) * 1e6

                with tab2:
                    st.markdown("##### Cost of Capital Assumptions")

                    col1, col2 = st.columns(2)

                    with col1:
                        risk_free = st.slider(
                            "Risk-Free Rate (%)",
                            min_value=0.0,
                            max_value=10.0,
                            value=4.5,
                            step=0.1
                        ) / 100

                        market_risk_premium = st.slider(
                            "Market Risk Premium (%)",
                            min_value=3.0,
                            max_value=10.0,
                            value=6.0,
                            step=0.5
                        ) / 100

                        beta_value = float(company['beta']) if company['beta'] else 1.0
                        if av_data and av_data.get('beta') is not None:
                            beta_value = float(av_data['beta'])
                        beta = st.number_input(
                            "Beta",
                            min_value=-1.0,
                            max_value=3.0,
                            value=max(-1.0, min(3.0, beta_value)),
                            step=0.1
                        )

                    with col2:
                        if method_key == 'FCFF':
                            cost_debt = st.slider(
                                "Cost of Debt (%)",
                                min_value=0.0,
                                max_value=15.0,
                                value=5.0,
                                step=0.5
                            ) / 100

                        if use_smart_assumptions:
                            tax_rate = smart_params['tax_rate']
                            tax_color = '#10b981' if tax_rate < 0.21 else ('#fbbf24' if tax_rate < 0.28 else '#ef4444')
                            tax_status = 'Low Tax' if tax_rate < 0.21 else ('Average Tax' if tax_rate < 0.28 else 'High Tax')
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(239,68,68,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(239,68,68,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ef4444, #dc2626); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📋</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">TAX RATE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {tax_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{tax_rate*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(239,68,68,0.12); border-radius: 10px; border: 1px solid rgba(239,68,68,0.25);"><p style="font-size: 0.7rem; color: #fca5a5; margin: 0; font-weight: 600;">{tax_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
                        else:
                            tax_rate = st.slider(
                                "Tax Rate (%)",
                                min_value=0.0,
                                max_value=40.0,
                                value=float(financials.get('tax_rate', 0.21) * 100),
                                step=1.0
                            ) / 100

                        if method_key == 'FCFE':
                            net_borrowing = st.number_input(
                                "Net Borrowing ($M)",
                                min_value=-1000.0,
                                max_value=1000.0,
                                value=0.0,
                                step=10.0
                            ) * 1e6

                with tab3:
                    st.markdown("##### Terminal Value Assumptions")

                    col1, col2 = st.columns(2)

                    with col1:
                        if use_smart_assumptions:
                            terminal_growth = smart_params['terminal_growth']
                            term_gr_color = '#10b981' if terminal_growth <= 0.03 else ('#fbbf24' if terminal_growth <= 0.05 else '#ef4444')
                            term_gr_status = 'Conservative' if terminal_growth <= 0.03 else ('Moderate' if terminal_growth <= 0.05 else 'Aggressive')
                            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🎯</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">PERPETUAL GROWTH RATE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {term_gr_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{terminal_growth*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{term_gr_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
                        else:
                            terminal_growth = st.slider(
                                "Perpetual Growth Rate (%)",
                                min_value=0.0,
                                max_value=5.0,
                                value=2.5,
                                step=0.1
                            ) / 100

                    with col2:
                        st.info(f"""
                        **Terminal Value Method:** Gordon Growth Model

                        TV = FCFₙ₊₁ / (r - g)
                        """)

        # =================================================================
        # DIVIDEND DISCOUNT MODELS (GORDON & MULTI-STAGE)
        # =================================================================
        elif method_key == 'GORDON_DDM':
            st.markdown("##### Gordon Growth DDM Inputs")

            col1, col2 = st.columns(2)

            with col1:
                # Get current dividend from company data
                current_dividend_default = company.get('dividendRate', 0) * company['shares_outstanding']
                if current_dividend_default == 0:
                    # Try to estimate from dividend yield
                    div_yield = company.get('dividendYield', 0)
                    if div_yield > 0:
                        current_dividend_default = company['market_cap'] * div_yield

                current_dividend = st.number_input(
                    "Current Annual Dividend ($)",
                    min_value=0.0,
                    value=float(current_dividend_default),
                    step=0.01,
                    help="Total annual dividend paid by the company"
                )

                if use_smart_assumptions:
                    cost_of_equity_ddm = smart_params.get('cost_of_equity', 0.10)
                    coe_ddm_color = '#10b981' if cost_of_equity_ddm < 0.08 else ('#fbbf24' if cost_of_equity_ddm < 0.12 else '#ef4444')
                    coe_ddm_status = 'Low Cost' if cost_of_equity_ddm < 0.08 else ('Average Cost' if cost_of_equity_ddm < 0.12 else 'High Cost')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💹</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">COST OF EQUITY</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {coe_ddm_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{cost_of_equity_ddm*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{coe_ddm_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
                else:
                    risk_free_ddm = st.slider(
                        "Risk-Free Rate (%)",
                        min_value=0.0,
                        max_value=10.0,
                        value=4.5,
                        step=0.1,
                        key="ddm_risk_free"
                    ) / 100

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
                    div_gr_color = '#10b981' if growth_rate_ddm <= 0.03 else ('#fbbf24' if growth_rate_ddm <= 0.05 else '#ef4444')
                    div_gr_status = 'Conservative' if growth_rate_ddm <= 0.03 else ('Moderate' if growth_rate_ddm <= 0.05 else 'Aggressive')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">DIVIDEND GROWTH RATE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {div_gr_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{growth_rate_ddm*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{div_gr_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
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
                current_dividend_default = company.get('dividendRate', 0) * company['shares_outstanding']
                if current_dividend_default == 0:
                    div_yield = company.get('dividendYield', 0)
                    if div_yield > 0:
                        current_dividend_default = company['market_cap'] * div_yield

                current_dividend_ms = st.number_input(
                    "Current Annual Dividend ($)",
                    min_value=0.0,
                    value=float(current_dividend_default),
                    step=0.01,
                    key="ms_dividend"
                )

                if use_smart_assumptions:
                    cost_of_equity_ms = smart_params.get('cost_of_equity', 0.10)
                    coe_ms_color = '#10b981' if cost_of_equity_ms < 0.08 else ('#fbbf24' if cost_of_equity_ms < 0.12 else '#ef4444')
                    coe_ms_status = 'Low Cost' if cost_of_equity_ms < 0.08 else ('Average Cost' if cost_of_equity_ms < 0.12 else 'High Cost')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💹</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">COST OF EQUITY</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {coe_ms_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{cost_of_equity_ms*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{coe_ms_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
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
                    hgr_color = '#fbbf24' if high_growth_rate > 0.10 else ('#10b981' if high_growth_rate > 0.05 else '#ef4444')
                    hgr_status = 'Aggressive' if high_growth_rate > 0.10 else ('Moderate' if high_growth_rate > 0.05 else 'Conservative')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(245,158,11,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #f59e0b, #d97706); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🚀</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">HIGH GROWTH RATE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {hgr_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{high_growth_rate*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(245,158,11,0.12); border-radius: 10px; border: 1px solid rgba(245,158,11,0.25);"><p style="font-size: 0.7rem; color: #fbbf24; margin: 0; font-weight: 600;">{hgr_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
                    # High Growth Years
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #0891b2); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">⏱️</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">HIGH GROWTH YEARS</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #06b6d4; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{high_growth_years} years</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #67e8f9; margin: 0; font-weight: 600;">Growth Period • AI Generated</p></div></div>', unsafe_allow_html=True)
                    # Stable Growth Rate
                    sgr_color = '#10b981' if stable_growth_rate <= 0.03 else ('#fbbf24' if stable_growth_rate <= 0.05 else '#ef4444')
                    sgr_status = 'Conservative' if stable_growth_rate <= 0.03 else ('Moderate' if stable_growth_rate <= 0.05 else 'Aggressive')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📉</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">STABLE GROWTH RATE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {sgr_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{stable_growth_rate*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{sgr_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
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
                    roe_color = '#10b981' if roe > 0.15 else ('#fbbf24' if roe > 0.10 else '#ef4444')
                    roe_status = 'Excellent' if roe > 0.15 else ('Good' if roe > 0.10 else 'Fair')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💎</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">RETURN ON EQUITY (ROE)</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {roe_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{roe*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{roe_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
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
                    coe_ri_color = '#10b981' if cost_of_equity_ri < 0.08 else ('#fbbf24' if cost_of_equity_ri < 0.12 else '#ef4444')
                    coe_ri_status = 'Low Cost' if cost_of_equity_ri < 0.08 else ('Average Cost' if cost_of_equity_ri < 0.12 else 'High Cost')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💹</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">COST OF EQUITY</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {coe_ri_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{cost_of_equity_ri*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{coe_ri_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
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
                    tgr_ri_color = '#10b981' if growth_rate_ri <= 0.03 else ('#fbbf24' if growth_rate_ri <= 0.05 else '#ef4444')
                    tgr_ri_status = 'Conservative' if growth_rate_ri <= 0.03 else ('Moderate' if growth_rate_ri <= 0.05 else 'Aggressive')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #0891b2); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🎯</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">TERMINAL GROWTH RATE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {tgr_ri_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{growth_rate_ri*100:.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #67e8f9; margin: 0; font-weight: 600;">{tgr_ri_status} • AI Generated</p></div></div>', unsafe_allow_html=True)
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
                        # for compatibility with calculate_dcf_value()
                        if dcf_proj_obj:
                            projections = []
                            # Handle both list of projections and single projection object
                            if isinstance(dcf_proj_obj, list) and len(dcf_proj_obj) > 0:
                                # It's a non-empty list - use first item
                                proj_item = dcf_proj_obj[0]
                                if proj_item and hasattr(proj_item, 'forecast_years') and hasattr(proj_item, 'final_projections'):
                                    for year in range(1, proj_item.forecast_years + 1):
                                        year_data = proj_item.final_projections.get(year, {}) if isinstance(proj_item.final_projections, dict) else {}
                                        projections.append({
                                            'year': year,
                                            'revenue': year_data.get('revenue', 0),
                                            'ebit': year_data.get('ebit', 0),
                                            'nopat': year_data.get('nopat', 0),
                                            'fcff': year_data.get('fcff', 0),
                                            'fcfe': year_data.get('fcfe', 0)
                                        })
                                else:
                                    st.warning("⚠️ List projections format not recognized. Using manual calculation.")
                                    dashboard_active = False
                            elif not isinstance(dcf_proj_obj, list) and hasattr(dcf_proj_obj, 'forecast_years') and hasattr(dcf_proj_obj, 'final_projections'):
                                # It's a single projection object with required attributes
                                for year in range(1, dcf_proj_obj.forecast_years + 1):
                                    year_data = dcf_proj_obj.final_projections.get(year, {}) if isinstance(dcf_proj_obj.final_projections, dict) else {}
                                    projections.append({
                                        'year': year,
                                        'revenue': year_data.get('revenue', 0),
                                        'ebit': year_data.get('ebit', 0),
                                        'nopat': year_data.get('nopat', 0),
                                        'fcff': year_data.get('fcff', 0),
                                        'fcfe': year_data.get('fcfe', 0)
                                    })
                            else:
                                st.warning(f"⚠️ Projections format not recognized. Using manual calculation.")
                                dashboard_active = False

                            if projections:
                                final_fcf = projections[-1]['fcff'] if method_key == 'FCFF' else projections[-1]['fcfe']
                            elif dashboard_active:  # Only show error if we haven't already warned
                                st.error("⚠️ Could not parse projections. Using manual calculation.")
                                dashboard_active = False
                        else:
                            # Fallback if projections object not available
                            st.error("⚠️ Dashboard projections not available. Using manual calculation.")
                            dashboard_active = False

                    if not dashboard_active:

                        # =========================================================
                        # MANUAL MODE: Use slider inputs and traditional calculation
                        # =========================================================
                        # Ensure default values exist if sliders weren't rendered
                        try:
                            _ = risk_free
                        except (NameError, UnboundLocalError):
                            risk_free = 0.045  # 4.5% default
                        try:
                            _ = beta
                        except (NameError, UnboundLocalError):
                            beta = 1.0  # Market beta default
                        try:
                            _ = market_risk_premium
                        except (NameError, UnboundLocalError):
                            market_risk_premium = 0.06  # 6% default
                        try:
                            _ = cost_debt
                        except (NameError, UnboundLocalError):
                            cost_debt = 0.05  # 5% default
                        try:
                            _ = tax_rate
                        except (NameError, UnboundLocalError):
                            tax_rate = financials.get('tax_rate', 0.21)  # Use financial data or 21% default

                        # Ensure growth and projection parameters exist
                        try:
                            _ = revenue_growth
                        except (NameError, UnboundLocalError):
                            revenue_growth = 0.05  # 5% default
                        try:
                            _ = ebit_margin
                        except (NameError, UnboundLocalError):
                            ebit_margin = 0.20  # 20% default
                        try:
                            _ = forecast_years
                        except (NameError, UnboundLocalError):
                            forecast_years = 5  # 5 years default
                        try:
                            _ = depreciation_pct
                        except (NameError, UnboundLocalError):
                            depreciation_pct = 0.03  # 3% of revenue default
                        try:
                            _ = capex_pct
                        except (NameError, UnboundLocalError):
                            capex_pct = 0.04  # 4% of revenue default
                        try:
                            _ = wc_change
                        except (NameError, UnboundLocalError):
                            wc_change = 0  # No change default
                        try:
                            _ = net_borrowing
                        except (NameError, UnboundLocalError):
                            net_borrowing = 0  # No net borrowing default

                        # Calculate cost of equity
                        cost_equity = calculate_cost_of_equity(risk_free, beta, market_risk_premium)

                        # Calculate discount rate
                        if method_key == 'FCFF':
                            total_debt = financials.get('total_debt', 0)
                            total_equity = company['market_cap']
                            discount_rate = calculate_wacc(cost_equity, cost_debt, tax_rate, total_debt, total_equity)
                        else:
                            discount_rate = cost_equity

                        # Get base financials
                        base_revenue = financials.get('revenue', 0)
                        base_ebit = financials.get('ebit', 0)
                        base_net_income = financials.get('net_income', 0)
                        if av_data and av_data.get('revenue_ttm'):
                            base_revenue = av_data['revenue_ttm']

                        # ENHANCED: Project cash flows with scaling D&A and CapEx
                        # Get multi-stage config if enabled
                        multistage_config = st.session_state.get('multistage_config', {'enabled': False})

                        if method_key == 'FCFF':
                            projections = project_fcff_enhanced(
                                base_revenue, base_ebit, revenue_growth, ebit_margin, tax_rate,
                                depreciation_pct, capex_pct, wc_change, forecast_years, multistage_config
                            )
                            final_fcf = projections[-1]['fcff']
                        else:
                            projections = project_fcfe_enhanced(
                                base_revenue, base_net_income, revenue_growth, tax_rate,
                                depreciation_pct, capex_pct, wc_change, net_borrowing, forecast_years, multistage_config
                            )
                            final_fcf = projections[-1]['fcfe']

                        # Use shares from company data
                        shares = company['shares_outstanding']
                        if av_data and av_data.get('shares_outstanding'):
                            shares = av_data['shares_outstanding']

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
                        assumptions_for_validation = {
                            'revenue_growth': revenue_growth if not dashboard_active else (projections[-1]['revenue'] / projections[0]['revenue']) ** (1/len(projections)) - 1,
                            'ebitda_margin': ebit_margin if not dashboard_active else 0.25,  # Estimate from projections
                            'terminal_growth': terminal_growth,
                            'wacc': discount_rate,
                            'tax_rate': tax_rate if not dashboard_active else financials.get('tax_rate', 0.21),
                            'capex_pct': capex_pct if not dashboard_active else 0.05,
                            'nwc_change': wc_change if not dashboard_active else 0,
                        }

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

                    # Calculate terminal value (both modes)
                    terminal_value = calculate_terminal_value(final_fcf, discount_rate, terminal_growth)

                    # Calculate DCF value (both modes)
                    net_debt = financials.get('total_debt', 0) - financials.get('cash', 0)

                    dcf_results = calculate_dcf_value(
                        projections, discount_rate, terminal_value, shares,
                        net_debt if method_key == 'FCFF' else 0, method_key
                    )

                    dcf_results['net_debt'] = net_debt

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
                        # Prepare company financials for relative valuation
                        company_financials_dict = {
                            'eps': financials.get('eps', 0),
                            'book_value_per_share': financials.get('book_value_per_share', 0),
                            'sales_per_share': financials.get('revenue', 0) / shares if shares > 0 else 0,
                            'ebitda': financials.get('ebitda', 0),
                            'ebit': financials.get('ebit', 0),
                            'revenue': financials.get('revenue', 0),
                            'total_debt': financials.get('total_debt', 0),
                            'cash': financials.get('cash', 0)
                        }

                        relative_results = apply_relative_valuation(
                            company_financials=company_financials_dict,
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
            upside_downside = ((intrinsic_value - current_price) / current_price) * 100

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
                intrinsic_color = '#10b981' if upside_downside > 20 else ('#fbbf24' if upside_downside > -20 else '#ef4444')
                intrinsic_status = 'Undervalued' if upside_downside > 20 else ('Fair Value' if upside_downside > -20 else 'Overvalued')
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💎</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">INTRINSIC VALUE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {intrinsic_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{format_currency(intrinsic_value)}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{intrinsic_status}</p></div></div>', unsafe_allow_html=True)

            # Current Price
            with col2:
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💰</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CURRENT PRICE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #8b5cf6; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{format_currency(current_price)}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">Market Price</p></div></div>', unsafe_allow_html=True)

            # Upside/Downside
            with col3:
                upside_display = format_percentage(upside_downside) if abs(upside_downside) < 1000 else "±∞"
                upside_color = '#10b981' if upside_downside > 20 else ('#fbbf24' if upside_downside > -20 else '#ef4444')
                upside_label = 'Strong Upside' if upside_downside > 20 else ('Fair Value' if upside_downside > -20 else 'Downside Risk')
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #0891b2); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">UPSIDE/DOWNSIDE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {upside_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{upside_display}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #67e8f9; margin: 0; font-weight: 600;">{upside_label}</p></div></div>', unsafe_allow_html=True)

            # Discount Rate
            # v9.7 FIX: Safe access to session_state with defaults
            discount_rate = st.session_state.get('discount_rate', results.get('discount_rate', 0.10))
            with col4:
                disc_color = '#10b981' if discount_rate < 0.08 else ('#fbbf24' if discount_rate < 0.12 else '#ef4444')
                disc_status = 'Low Risk' if discount_rate < 0.08 else ('Moderate Risk' if discount_rate < 0.12 else 'High Risk')
                st.markdown(f'<div style="background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(245,158,11,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #f59e0b, #d97706); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💹</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">DISCOUNT RATE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {disc_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{ATLASFormatter.format_yield(discount_rate * 100, decimals=1)}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(245,158,11,0.12); border-radius: 10px; border: 1px solid rgba(245,158,11,0.25);"><p style="font-size: 0.7rem; color: #fbbf24; margin: 0; font-weight: 600;">{disc_status}</p></div></div>', unsafe_allow_html=True)

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
                            # Create RobustDCFEngine
                            assumption_manager = DCFAssumptionManager(company_data=company, financials=financials)

                            # Set base assumptions from current DCF
                            assumption_manager.set('revenue_growth', revenue_growth if not dashboard_active else (projections[-1]['revenue'] / projections[0]['revenue']) ** (1/len(projections)) - 1)
                            assumption_manager.set('ebitda_margin', ebit_margin if not dashboard_active else 0.25)
                            assumption_manager.set('terminal_growth', terminal_growth)
                            assumption_manager.set('wacc', discount_rate)
                            assumption_manager.set('tax_rate', tax_rate if not dashboard_active else financials.get('tax_rate', 0.21))
                            assumption_manager.set('capex_pct', capex_pct if not dashboard_active else 0.05)
                            assumption_manager.set('nwc_change', wc_change if not dashboard_active else 0)

                            # Create engine
                            robust_engine = RobustDCFEngine(
                                assumptions=assumption_manager,
                                validator=DCFValidator(),
                                company_data={
                                    'ticker': company['ticker'],
                                    'sector': company['sector'],
                                    'market_cap': company['market_cap'],
                                    'shares_outstanding': shares,
                                    'revenue': financials.get('revenue', 0),
                                    'ebit': financials.get('ebit', 0),
                                    'net_income': financials.get('net_income', 0),
                                    'total_debt': financials.get('total_debt', 0),
                                    'cash': financials.get('cash', 0),
                                }
                            )

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

                        except Exception as e:
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
                        # Prepare DCF inputs for trap detector
                        revenue_projections = [p.get('revenue', 0) for p in projections] if projections else []

                        if method == 'FCFF':
                            fcf_projections = [p.get('fcff', 0) for p in projections] if projections else []
                        else:
                            fcf_projections = [p.get('fcfe', 0) for p in projections] if projections else []

                        dcf_inputs_for_trap_detection = {
                            'wacc': discount_rate,
                            'terminal_growth_rate': terminal_growth,
                            'projection_years': len(projections) if projections else 5,
                            'revenue_projections': revenue_projections,
                            'fcf_projections': fcf_projections,
                            'terminal_value': results.get('pv_terminal', 0),
                            'enterprise_value': results.get('enterprise_value', 0) if method == 'FCFF' else results.get('equity_value', 0),
                            'current_price': current_price,
                            'fair_value': intrinsic_value
                        }

                        # Run trap detection
                        trap_summary = analyze_dcf_traps(company['ticker'], dcf_inputs_for_trap_detection)

                        # Display warnings
                        display_trap_warnings(trap_summary, company['ticker'])

                    except Exception as e:
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

                except Exception as e:
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

            make_scrollable_table(proj_display, height=600, hide_index=True, use_container_width=True, column_config=None)

            st.info("💡 **Technical Note:** D&A and CapEx scale with revenue growth (as they should!)")

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
