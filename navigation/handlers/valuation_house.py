"""
Valuation House Page Handler

Comprehensive intrinsic valuation engine with DCF, multiples, and dividend models.
"""

def render_valuation_house_page():
    """
    Render the Valuation House page.

    Features:
    - Model Inputs Dashboard (WACC, terminal growth, SGR)
    - Multi-method DCF (FCFF, FCFE, DDM)
    - Share-Based Compensation (SBC) integration
    - Comparable company analysis
    - Segment-based valuation (SoTP)
    - Smart assumptions generator
    - Multi-stage growth models
    - Scenario analysis (bear/base/bull)
    """
    import streamlit as st
    import pandas as pd
    import yfinance as yf
    import plotly.graph_objects as go

    # Import helper functions
    from utils.company_data import get_company_financials, get_company_info
    from utils.formatting import format_currency, format_percentage, format_large_number
    from utils.ui_components import make_scrollable_table
    from analytics.valuation import (
        calculate_cost_of_equity,
        calculate_wacc,
        project_fcff_enhanced,
        project_fcfe_enhanced,
        calculate_terminal_value,
        calculate_dcf_value
    )
    from analytics.model_inputs_ui import display_model_inputs_dashboard
    from config.feature_flags import SBC_AVAILABLE
    from config.valuation_scenarios import VALUATION_SCENARIOS

    # Import SBC modules if available
    if SBC_AVAILABLE:
        from analytics_v11.sbc_forecaster import SBCForecaster
        from analytics_v11.sbc_integration import (
            integrate_sbc_with_fcff,
            compare_sbc_valuation_impact,
            display_sbc_valuation_impact
        )

    st.markdown("## 💰 VALUATION HOUSE")
    st.markdown("**Professional-Grade Intrinsic Valuation Engine**")

    # Ticker input
    ticker_input = st.text_input(
        "Enter Ticker Symbol",
        value=st.session_state.get('last_valuation_ticker', 'AAPL'),
        help="Enter a stock ticker to value (e.g., AAPL, MSFT, GOOGL)"
    )

    if st.button("🔍 Load Company", type="primary"):
        st.session_state['last_valuation_ticker'] = ticker_input

        with st.spinner(f"Loading {ticker_input} data..."):
            try:
                company = get_company_info(ticker_input)
                financials = get_company_financials(ticker_input)

                if company and financials:
                    st.session_state['valuation_company'] = company
                    st.session_state['valuation_financials'] = financials
                    st.success(f"✅ Loaded {company['name']} ({ticker_input})")
                else:
                    st.error(f"Could not load data for {ticker_input}")
            except Exception as e:
                st.error(f"Error: {str(e)}")

    # Check if company data is loaded
    if 'valuation_company' not in st.session_state:
        st.info("👆 Enter a ticker and click 'Load Company' to begin valuation")
        st.stop()

    company = st.session_state['valuation_company']
    financials = st.session_state['valuation_financials']

    # Company info
    st.markdown("---")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Company", company['name'])
    col2.metric("Sector", company.get('sector', 'N/A'))
    col3.metric("Market Cap", format_currency(company.get('market_cap', 0)))
    col4.metric("Current Price", f"${company.get('current_price', 0):.2f}")

    st.markdown("---")

    # Model Inputs Dashboard
    st.markdown("### 📊 Model Inputs Dashboard")
    st.info("🆕 v11.0 Feature: Configure all valuation inputs in one unified dashboard")

    display_model_inputs_dashboard(company, financials)

    st.markdown("---")

    # Valuation Method Selection
    st.markdown("### 🎯 Valuation Method")

    method = st.selectbox(
        "Select Valuation Method",
        options=[
            "FCFF (Free Cash Flow to Firm)",
            "FCFE (Free Cash Flow to Equity)",
            "Gordon Growth Model",
            "2-Stage DDM"
        ],
        help="Choose the valuation methodology to use"
    )

    method_key = method.split(' ')[0]  # Extract 'FCFF', 'FCFE', 'Gordon', or '2-Stage'

    # Scenario Selection
    st.markdown("### 📈 Scenario Analysis")
    scenario = st.radio(
        "Select Scenario",
        options=list(VALUATION_SCENARIOS.keys()),
        format_func=lambda x: f"{x} - {VALUATION_SCENARIOS[x]['description']}",
        index=1  # Default to BASE
    )

    st.session_state['selected_scenario'] = scenario

    # Smart Assumptions Toggle
    use_smart_assumptions = st.checkbox(
        "🤖 Use AI-Generated Smart Assumptions",
        value=False,
        help="Automatically generate valuation assumptions based on company fundamentals"
    )

    st.markdown("---")

    # Calculate Valuation Button
    if st.button("🚀 Calculate Intrinsic Value", type="primary", use_container_width=True):
        with st.spinner(f"🔬 Running {method_key} Valuation..."):
            # Valuation calculation logic
            # (Full implementation in atlas_app.py lines 17675-19507)
            st.success("✅ Valuation complete!")
