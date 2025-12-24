"""
ATLAS Model Inputs UI Module
=============================
Streamlit UI components for Model Inputs Dashboard

All display functions for:
- DuPont ROE Analysis
- Sustainable Growth Rate
- Cost of Capital
- Diluted Shares
- Editable Projection Table (simplified version)
- Scenario Manager

Author: ATLAS v11.0
"""

import streamlit as st
import pandas as pd
from typing import Dict, Any, Optional
from analytics.model_inputs import (
    calculate_dupont_roe,
    calculate_sustainable_growth_rate,
    calculate_cost_of_capital,
    calculate_diluted_shares,
    extract_financial_data_for_model_inputs
)
from analytics.dcf_projections import DCFProjections, create_projections_from_financial_data
from analytics.scenario_manager import ScenarioManager, create_bull_scenario, create_bear_scenario
from analytics.projection_visualizer import (
    create_revenue_growth_chart,
    create_fcff_progression_chart,
    create_margin_trend_chart,
    create_fcff_waterfall_chart,
    create_projection_dashboard
)

# ATLAS v11.0 - SBC Integration
try:
    from analytics.sbc_detector import detect_sbc_for_company
    from analytics.sbc_forecaster import SBCForecaster, SBCForecastConfig, SBCForecastMethod
    from analytics.sbc_ui import (
        display_sbc_educational_intro,
        display_sbc_detection_results,
        visualize_sbc_historical_trend,
        configure_sbc_forecast,
        visualize_sbc_forecast
    )
    SBC_AVAILABLE = True
except ImportError as e:
    SBC_AVAILABLE = False
    print(f"⚠️ SBC modules not available: {e}")


# ============================================================================
# COMPONENT 1: DuPont ROE ANALYSIS UI
# ============================================================================

def display_dupont_analysis(financial_data: dict) -> dict:
    """
    Display DuPont ROE Analysis with expandable calculation details.

    Args:
        financial_data: Financial data dictionary

    Returns:
        dict: Updated ROE components (allows user editing)
    """
    st.markdown("### 1️⃣ DuPont ROE Analysis")
    st.markdown("*Breaking down Return on Equity into operational components*")

    # Calculate DuPont ROE
    dupont = calculate_dupont_roe(financial_data)

    # Display components in editable format
    col1, col2, col3 = st.columns(3)

    with col1:
        net_margin = st.number_input(
            "Net Profit Margin (%)",
            value=dupont['net_margin'] * 100,
            format="%.2f",
            help="Net Income / Revenue",
            key="dupont_net_margin"
        ) / 100

    with col2:
        asset_turnover = st.number_input(
            "Asset Turnover (x)",
            value=dupont['asset_turnover'],
            format="%.3f",
            help="Revenue / Total Assets",
            key="dupont_asset_turnover"
        )

    with col3:
        leverage = st.number_input(
            "Financial Leverage (x)",
            value=dupont['financial_leverage'],
            format="%.2f",
            help="Total Assets / Total Equity",
            key="dupont_leverage"
        )

    # Calculate ROE from (potentially edited) inputs
    roe_calculated = net_margin * asset_turnover * leverage

    st.markdown("---")

    col1, col2 = st.columns(2)
    with col1:
        st.metric(
            "Return on Equity (ROE)",
            f"{roe_calculated * 100:.2f}%",
            help="Net Margin × Asset Turnover × Financial Leverage"
        )

    with col2:
        st.metric(
            "Direct ROE",
            f"{dupont['roe_direct'] * 100:.2f}%",
            delta="✅ Match" if dupont['verification_check'] else "⚠️ Check",
            help="Net Income / Total Equity (verification)"
        )

    # Expandable calculation workings
    with st.expander("📊 Show Detailed Calculation Workings"):
        st.markdown(f"""
        **Step 1: Net Profit Margin**
        ```
        Net Income:     ${dupont['net_income']:,.0f}
        ÷ Revenue:      ${dupont['revenue']:,.0f}
        ────────────────────────────────────────────────
        = Net Margin:   {dupont['net_margin']:.4f}  ({dupont['net_margin']*100:.2f}%)
        ```

        **Step 2: Asset Turnover**
        ```
        Revenue:        ${dupont['revenue']:,.0f}
        ÷ Total Assets: ${dupont['total_assets']:,.0f}
        ────────────────────────────────────────────────
        = Turnover:     {dupont['asset_turnover']:.4f}x
        ```

        **Step 3: Financial Leverage**
        ```
        Total Assets:   ${dupont['total_assets']:,.0f}
        ÷ Total Equity: ${dupont['total_equity']:,.0f}
        ────────────────────────────────────────────────
        = Leverage:     {dupont['financial_leverage']:.4f}x
        ```

        **Final ROE Calculation:**
        ```
        ROE = Net Margin × Asset Turnover × Leverage
        ROE = {net_margin:.4f} × {asset_turnover:.4f} × {leverage:.4f}
        ROE = {roe_calculated:.4f}  ({roe_calculated*100:.2f}%)
        ```

        **Verification Check:**
        ```
        ROE (DuPont):   {roe_calculated:.4f}
        ROE (Direct):   {dupont['roe_direct']:.4f}  (Net Income / Equity)
        Match: {"✅ Yes" if abs(roe_calculated - dupont['roe_direct']) < 0.001 else "❌ No"}
        ```
        """)

    return {
        'net_margin': net_margin,
        'asset_turnover': asset_turnover,
        'leverage': leverage,
        'roe': roe_calculated
    }


# ============================================================================
# COMPONENT 2: SUSTAINABLE GROWTH RATE UI
# ============================================================================

def display_sgr_analysis(financial_data: dict, roe: float,
                        current_terminal_growth: float = 0.025) -> float:
    """
    Display SGR Analysis with terminal growth guidance.

    Args:
        financial_data: Financial data dictionary
        roe: Return on equity from DuPont
        current_terminal_growth: Current terminal growth rate

    Returns:
        float: Selected terminal growth rate
    """
    st.markdown("### 2️⃣ Sustainable Growth Rate (SGR)")
    st.markdown("*Maximum sustainable growth without external financing*")

    # Calculate SGR
    sgr_results = calculate_sustainable_growth_rate(financial_data, roe)

    col1, col2 = st.columns(2)

    with col1:
        payout_ratio = st.number_input(
            "Dividend Payout Ratio (%)",
            value=float(sgr_results['payout_ratio'] * 100),
            min_value=0.0,
            max_value=100.0,
            format="%.1f",
            help="Dividends Paid / Net Income",
            key="sgr_payout"
        ) / 100

    with col2:
        plowback = 100 - (payout_ratio * 100)
        st.metric(
            "Plowback Ratio",
            f"{plowback:.1f}%",
            help="1 - Payout Ratio (amount reinvested)"
        )

    # Calculate SGR with user inputs
    sgr = plowback/100 * roe

    st.markdown("---")

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric(
            "Sustainable Growth Rate",
            f"{sgr * 100:.2f}%",
            help="Plowback Ratio × ROE"
        )

    with col2:
        st.metric(
            "Long-Term GDP Growth",
            f"{sgr_results['gdp_growth'] * 100:.1f}%",
            help="US historical average"
        )

    with col3:
        st.metric(
            "Recommended Terminal",
            f"{sgr_results['terminal_growth_suggested'] * 100:.2f}%",
            help="Based on SGR and economic constraints"
        )

    # Terminal growth guidance
    st.markdown("---")
    st.markdown("#### 🎯 Terminal Growth Rate Guidance")

    if sgr > 0.15:
        st.warning(f"""
        ⚠️ **High SGR Alert**: Your calculated SGR is {sgr*100:.1f}%, which is very high.

        **Why this matters:**
        - No company can grow faster than the economy forever
        - High ROE typically mean-reverts due to competition
        - Terminal value assumes perpetual growth

        **Recommended Range:** {sgr_results['terminal_growth_min']*100:.1f}% - {sgr_results['terminal_growth_max']*100:.1f}%
        """)
    else:
        st.info(f"""
        **Recommended Range:** {sgr_results['terminal_growth_min']*100:.1f}% - {sgr_results['terminal_growth_max']*100:.1f}%

        Your SGR of {sgr*100:.1f}% is reasonable, but terminal growth should still be conservative.
        """)

    # Terminal growth input
    terminal_growth = st.slider(
        "Terminal Growth Rate (%)",
        min_value=0.0,
        max_value=8.0,
        value=current_terminal_growth * 100,
        step=0.1,
        format="%.1f",
        help="Growth rate assumed in perpetuity",
        key="terminal_growth_slider"
    ) / 100

    # Validate terminal growth
    if terminal_growth > sgr_results['terminal_growth_max']:
        st.error(f"""
        ❌ **Terminal growth too high!**

        Your input ({terminal_growth*100:.1f}%) exceeds recommended maximum ({sgr_results['terminal_growth_max']*100:.1f}%).
        This may result in unrealistic valuation.
        """)
    elif terminal_growth < sgr_results['terminal_growth_min']:
        st.info(f"""
        ℹ️ **Terminal growth very conservative**

        Your input ({terminal_growth*100:.1f}%) is below recommended minimum ({sgr_results['terminal_growth_min']*100:.1f}%).
        This may be appropriate for declining businesses.
        """)
    else:
        st.success("✅ Terminal growth within recommended range")

    # Show calculation workings
    with st.expander("📊 Show Calculation Workings"):
        st.markdown(f"""
        **Sustainable Growth Rate Formula:**
        ```
        SGR = Plowback Ratio × ROE
        SGR = {plowback/100:.4f} × {roe:.4f}
        SGR = {sgr:.4f}  ({sgr*100:.2f}%)
        ```

        **Economic Interpretation:**

        The company retains {plowback:.1f}% of earnings and earns {roe*100:.1f}%
        on equity. Therefore, it can grow equity (and revenues, assuming constant margins)
        at {sgr*100:.2f}% per year without external financing.

        **Why Terminal Growth Should Be Lower:**

        1. **Mean Reversion**: High ROE attracts competition → ROE falls over time
        2. **Economic Constraints**: No company grows faster than GDP forever
        3. **Mathematical Necessity**: If terminal growth ≥ WACC, value = infinity
        """)

    return terminal_growth


# ============================================================================
# COMPONENT 3: COST OF CAPITAL UI
# ============================================================================

def display_cost_of_capital(financial_data: dict, market_data: dict) -> dict:
    """
    Display Cost of Capital with live Treasury yield.

    Args:
        financial_data: Financial data
        market_data: Market data

    Returns:
        dict: Updated WACC components
    """
    st.markdown("### 3️⃣ Cost of Capital (WACC)")
    st.markdown("*Weighted Average Cost of Capital with live market data*")

    # Calculate WACC
    wacc_data = calculate_cost_of_capital(financial_data, market_data)

    # Risk-free rate section
    st.markdown("#### Cost of Equity (CAPM)")

    col1, col2, col3 = st.columns(3)

    with col1:
        # Show live risk-free rate with update info
        rf_value = wacc_data['risk_free_rate']

        st.metric(
            "Risk-Free Rate",
            f"{rf_value*100:.2f}%",
            help=f"US 10-Year Treasury Yield\nSource: {wacc_data['rf_data']['source']}\nDate: {wacc_data['rf_data']['date']}"
        )

        if wacc_data['rf_data']['success']:
            st.success(f"✅ Live ({wacc_data['rf_data']['date']})")
        else:
            st.warning("⚠️ Using fallback (4.25%)")

        # Allow override
        if st.checkbox("Override risk-free rate", value=False, key="rf_override_check"):
            rf_value = st.number_input(
                "Custom Risk-Free Rate (%)",
                value=wacc_data['risk_free_rate'] * 100,
                format="%.2f",
                key="rf_custom"
            ) / 100

    with col2:
        mrp = st.number_input(
            "Market Risk Premium (%)",
            value=wacc_data['market_risk_premium'] * 100,
            min_value=4.0,
            max_value=10.0,
            format="%.2f",
            help="Historical US equity risk premium (typically 6-7%)",
            key="mrp_input"
        ) / 100

    with col3:
        beta = st.number_input(
            "Beta (Levered)",
            value=wacc_data['beta'],
            min_value=0.1,
            max_value=3.0,
            format="%.2f",
            help="Systematic risk relative to market",
            key="beta_input"
        )

    # Calculate cost of equity
    cost_of_equity = rf_value + beta * mrp

    st.markdown("---")
    st.metric(
        "Cost of Equity",
        f"{cost_of_equity*100:.2f}%",
        help="Risk-Free + Beta × Market Risk Premium"
    )

    # Cost of debt section
    st.markdown("#### Cost of Debt")

    col1, col2 = st.columns(2)

    with col1:
        cost_of_debt = st.number_input(
            "Pre-Tax Cost of Debt (%)",
            value=wacc_data['cost_of_debt'] * 100,
            format="%.2f",
            help="Interest Expense / Total Debt",
            key="cost_debt_input"
        ) / 100

    with col2:
        tax_rate = st.number_input(
            "Tax Rate (%)",
            value=wacc_data['tax_rate'] * 100,
            format="%.1f",
            help="Income Tax / Pre-Tax Income",
            key="tax_rate_input"
        ) / 100

    after_tax_debt = cost_of_debt * (1 - tax_rate)

    st.metric(
        "After-Tax Cost of Debt",
        f"{after_tax_debt*100:.2f}%",
        help="Pre-Tax Cost × (1 - Tax Rate)"
    )

    # Capital structure
    st.markdown("#### Capital Structure")

    col1, col2, col3 = st.columns(3)

    total_value = wacc_data['total_debt'] + wacc_data['market_cap']

    with col1:
        st.metric("Total Debt", f"${wacc_data['total_debt']/1e9:.2f}B")

    with col2:
        st.metric("Market Cap", f"${wacc_data['market_cap']/1e9:.2f}B")

    with col3:
        st.metric("Total Value", f"${total_value/1e9:.2f}B")

    # WACC calculation
    wacc = (wacc_data['equity_weight'] * cost_of_equity) + \
           (wacc_data['debt_weight'] * after_tax_debt)

    st.markdown("---")

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Equity Weight", f"{wacc_data['equity_weight']*100:.1f}%")

    with col2:
        st.metric("Debt Weight", f"{wacc_data['debt_weight']*100:.1f}%")

    with col3:
        st.metric(
            "WACC",
            f"{wacc*100:.2f}%",
            help="Weighted Average Cost of Capital"
        )

    # Calculation workings
    with st.expander("📊 Show Calculation Workings"):
        st.markdown(f"""
        **Step 1: Cost of Equity (CAPM)**
        ```
        Cost of Equity = Risk-Free Rate + Beta × Market Risk Premium

        Risk-Free Rate:     {rf_value:.4f}  ({rf_value*100:.2f}%)
        + Beta:             {beta:.4f}
        × Market Premium:   {mrp:.4f}  ({mrp*100:.2f}%)
        ────────────────────────────────────────────────────
        = Cost of Equity:   {cost_of_equity:.4f}  ({cost_of_equity*100:.2f}%)
        ```

        **Step 2: After-Tax Cost of Debt**
        ```
        After-Tax Cost = Pre-Tax Cost × (1 - Tax Rate)

        Pre-Tax Cost:       {cost_of_debt:.4f}  ({cost_of_debt*100:.2f}%)
        × (1 - Tax Rate):   (1 - {tax_rate:.4f})
        ────────────────────────────────────────────────────
        = After-Tax Cost:   {after_tax_debt:.4f}  ({after_tax_debt*100:.2f}%)
        ```

        **Step 3: WACC Calculation**
        ```
        WACC = (E/V × Cost of Equity) + (D/V × After-Tax Cost of Debt)

        = ({wacc_data['equity_weight']:.4f} × {cost_of_equity:.4f}) +
          ({wacc_data['debt_weight']:.4f} × {after_tax_debt:.4f})

        = {wacc_data['equity_weight'] * cost_of_equity:.4f} + {wacc_data['debt_weight'] * after_tax_debt:.4f}

        = {wacc:.4f}  ({wacc*100:.2f}%)
        ```
        """)

    return {
        'risk_free_rate': rf_value,
        'market_risk_premium': mrp,
        'beta': beta,
        'cost_of_equity': cost_of_equity,
        'cost_of_debt': cost_of_debt,
        'tax_rate': tax_rate,
        'after_tax_cost_of_debt': after_tax_debt,
        'wacc': wacc
    }


# ============================================================================
# COMPONENT 4: DILUTED SHARES UI
# ============================================================================

def display_diluted_shares(financial_data: dict, market_data: dict) -> float:
    """
    Display diluted shares calculation.

    Args:
        financial_data: Financial data
        market_data: Market data

    Returns:
        float: Diluted shares count
    """
    st.markdown("### 4️⃣ Shares Outstanding")
    st.markdown("*Treasury Stock Method for dilution*")

    dilution_data = calculate_diluted_shares(financial_data, market_data)

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric(
            "Basic Shares",
            f"{dilution_data['basic_shares']/1e6:.1f}M",
            help="Shares currently outstanding"
        )

    with col2:
        st.metric(
            "Dilution",
            f"+{dilution_data['total_dilution']/1e6:.1f}M",
            delta=f"{dilution_data['dilution_pct']*100:.1f}%",
            help="Additional shares from options and RSUs"
        )

    with col3:
        st.metric(
            "Diluted Shares",
            f"{dilution_data['diluted_shares']/1e6:.1f}M",
            help="Total shares for valuation"
        )

    # Breakdown
    with st.expander("🔍 Show Dilution Breakdown"):
        st.markdown(f"""
        **Treasury Stock Method Calculation**

        **Stock Options:**
        ```
        Options Outstanding:        {dilution_data['options_outstanding']/1e6:.2f}M
        Weighted Avg Strike Price:  ${dilution_data['weighted_avg_strike']:.2f}
        Current Share Price:        ${dilution_data['avg_share_price']:.2f}

        Net Dilution:               {dilution_data['options_dilution']/1e6:.2f}M shares
        ```

        **RSUs:**
        ```
        RSUs Outstanding:           {dilution_data['rsus_outstanding']/1e6:.2f}M
        Net Dilution:               {dilution_data['rsus_dilution']/1e6:.2f}M shares
        ```

        **Total Dilution:**
        ```
        Basic Shares:               {dilution_data['basic_shares']/1e6:.2f}M
        + Options Dilution:         {dilution_data['options_dilution']/1e6:.2f}M
        + RSUs Dilution:            {dilution_data['rsus_dilution']/1e6:.2f}M
        ───────────────────────────────────────────────────
        = Diluted Shares:           {dilution_data['diluted_shares']/1e6:.2f}M

        Dilution %:                 {dilution_data['dilution_pct']*100:.2f}%
        ```
        """)

    return dilution_data['diluted_shares']


# ============================================================================
# COMPONENT 5: SHARE-BASED COMPENSATION (SBC) ANALYSIS
# ============================================================================

def display_sbc_analysis(ticker: str, forecast_years: int = 10) -> Optional[Dict]:
    """
    Display SBC analysis integrated into Model Inputs Dashboard.

    Args:
        ticker: Stock ticker
        forecast_years: Number of forecast years

    Returns:
        Dict with SBC data, config, and forecaster (or None if disabled)
    """
    st.markdown("### 5️⃣ Share-Based Compensation (SBC)")
    st.markdown("*Properly account for SBC as a real economic cost*")

    if not SBC_AVAILABLE:
        st.warning("⚠️ SBC modules not available. Install required dependencies.")
        return None

    # Option to enable/disable SBC
    use_sbc = st.checkbox(
        "Include SBC in DCF Valuation",
        value=True,
        help="SBC is a real cost that should be subtracted from FCFF",
        key="use_sbc_checkbox"
    )

    if not use_sbc:
        st.info("💡 SBC will not be included in valuation. This may overstate fair value for high-SBC companies.")
        return None

    # Detect SBC
    with st.spinner(f"Detecting SBC for {ticker}..."):
        sbc_data = detect_sbc_for_company(ticker)

    detection_success = display_sbc_detection_results(ticker, sbc_data)

    # Historical trend visualization
    if detection_success:
        visualize_sbc_historical_trend(sbc_data, ticker)

    # Forecast configuration
    with st.expander("⚙️ SBC Forecast Settings", expanded=False):
        config = configure_sbc_forecast(ticker, sbc_data, forecast_years)

        if config:
            # Validate
            is_valid, error = config.validate()
            if not is_valid:
                st.error(f"❌ Invalid configuration: {error}")
                return None

            st.success("✅ SBC forecast configured successfully")

            return {
                'sbc_data': sbc_data,
                'config': config,
                'enabled': True
            }

    return None


# ============================================================================
# COMPONENT 6: PROJECTION SUMMARY (Simplified)
# ============================================================================

def display_projection_summary(projections):
    """
    Display simplified projection summary with key metrics.

    Args:
        projections: DCFProjections object or list
    """
    st.markdown("### 6️⃣ DCF Projections Summary")
    st.markdown("*Auto-generated projections (full editing available below)*")

    # CRITICAL FIX: Handle both DCFProjections object and list
    if isinstance(projections, list):
        # If it's a list, we can't get summary stats - show message
        st.warning("⚠️ Projection summary unavailable - projections in legacy list format")
        st.info("Upload new financial data to regenerate projections in proper format")
        return

    # Check if it has the get_summary_stats method (it's a DCFProjections object)
    if not hasattr(projections, 'get_summary_stats'):
        st.error(f"❌ Invalid projections object type: {type(projections)}")
        st.info("Please refresh the page to reinitialize projections")
        return

    stats = projections.get_summary_stats()

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric(
            "Revenue CAGR",
            f"{stats['revenue_cagr']*100:.1f}%",
            help="Compound annual growth rate"
        )

    with col2:
        st.metric(
            "Avg EBIT Margin",
            f"{stats['avg_ebit_margin']*100:.1f}%",
            help="Average over forecast period"
        )

    with col3:
        st.metric(
            "Total FCFF",
            f"${stats['total_fcff']/1e9:.1f}B",
            help="Sum of 5-year projections"
        )

    with col4:
        st.metric(
            "Terminal FCFF",
            f"${stats['terminal_fcff']/1e9:.1f}B",
            help="Final year free cash flow"
        )

    # Quick preview table
    with st.expander("📋 Preview Projections"):
        df = projections.export_to_dataframe()
        st.dataframe(df, use_container_width=True, hide_index=True)


# ============================================================================
# EDITABLE PROJECTION TABLE (CRITICAL FEATURE)
# ============================================================================

def display_editable_projection_table(projections):
    """
    Display fully editable projection table with manual override capability.

    This is the CRITICAL feature that allows analysts to manually edit any
    projection value and see the model recalculate in real-time.

    Features:
    - Click any cell to edit
    - 🤖 indicators for auto-generated values
    - ✏️ indicators for manually edited values
    - Smart recalculation of dependent items
    - Reset to auto button

    Args:
        projections: DCFProjections object or list

    Returns:
        Updated DCFProjections object with manual overrides applied (or original input if invalid)
    """
    st.markdown("### ✏️ Editable Projection Table")
    st.markdown("*Click any cell to manually override. FCFF recalculates automatically.*")

    # CRITICAL FIX: Handle both DCFProjections object and list
    if isinstance(projections, list):
        st.warning("⚠️ Editable projection table unavailable - projections in legacy list format")
        st.info("Please refresh the page or upload new financial data to regenerate projections")
        return projections  # Return as-is

    if not hasattr(projections, 'final_projections'):
        st.error(f"❌ Invalid projections object type: {type(projections)}")
        st.info("Please refresh the page to reinitialize projections")
        return projections  # Return as-is

    # Build editable dataframe
    line_items = [
        ('Revenue', 'revenue', '$B', 1e9),
        ('EBIT', 'ebit', '$B', 1e9),
        ('EBIT Margin', 'ebit_margin', '%', 100),
        ('Tax Rate', 'tax_rate', '%', 100),
        ('NOPAT', 'nopat', '$B', 1e9),
        ('D&A', 'depreciation_amortization', '$B', 1e9),
        ('CapEx', 'capex', '$B', 1e9),
        ('Δ NWC', 'nwc_change', '$B', 1e9),
        ('SBC Expense', 'sbc_expense', '$B', 1e9),
        ('FCFF', 'fcff', '$B', 1e9)
    ]

    # Create data structure for st.data_editor
    data = []

    for display_name, item_key, unit, divisor in line_items:
        row = {'Metric': display_name}

        for year in range(1, projections.forecast_years + 1):
            # Get value from final projections
            value = projections.final_projections[year][item_key]

            # Check if manually overridden
            is_manual = item_key in projections.manual_overrides[year]

            # Format value
            if unit == '%':
                formatted_value = value * 100  # Store as percentage for editing
            else:
                formatted_value = value / divisor  # Convert to billions

            # Add indicator
            indicator = "✏️" if is_manual else "🤖"

            # Store both value and indicator
            row[f'Y{year}'] = formatted_value
            row[f'Y{year}_ind'] = indicator

        data.append(row)

    df = pd.DataFrame(data)

    # Create column config for editing
    column_config = {
        'Metric': st.column_config.TextColumn('Metric', width='medium', disabled=True)
    }

    for year in range(1, projections.forecast_years + 1):
        column_config[f'Y{year}'] = st.column_config.NumberColumn(
            f'Year {year}',
            help=f'Edit to override auto value. Click to modify.',
            format="%.2f",
            width='small'
        )
        # Indicator column (read-only)
        column_config[f'Y{year}_ind'] = st.column_config.TextColumn(
            '',
            width='small',
            disabled=True
        )

    # Display editable table
    edited_df = st.data_editor(
        df,
        column_config=column_config,
        use_container_width=True,
        hide_index=True,
        key='projection_editor'
    )

    # Detect changes and apply manual overrides
    changes_made = False

    for idx, (display_name, item_key, unit, divisor) in enumerate(line_items):
        for year in range(1, projections.forecast_years + 1):
            col_name = f'Y{year}'

            # Get original and edited values
            original_value = df.at[idx, col_name]
            edited_value = edited_df.at[idx, col_name]

            # Check if value changed
            if abs(edited_value - original_value) > 1e-6:
                # Convert back to actual value
                if unit == '%':
                    actual_value = edited_value / 100
                else:
                    actual_value = edited_value * divisor

                # Apply manual override
                projections.set_manual_override(year, item_key, actual_value)
                changes_made = True

    # Show status
    if changes_made:
        st.success("✅ Manual overrides applied! FCFF recalculated.")

    # Manual override indicators
    col1, col2, col3 = st.columns([2, 1, 1])

    with col1:
        st.caption("🤖 = Auto-generated | ✏️ = Manually edited")

    with col2:
        # Count manual overrides
        total_manual = sum(
            len(overrides) for overrides in projections.manual_overrides.values()
        )
        st.caption(f"Manual overrides: {total_manual}")

    with col3:
        # Reset button
        if st.button("🔄 Reset All to Auto", help="Clear all manual overrides"):
            # Clear all manual overrides
            for year in projections.manual_overrides:
                projections.manual_overrides[year] = {}

            # Regenerate final projections
            projections.final_projections = projections._merge_projections()

            st.success("✅ All values reset to auto-generated!")
            st.rerun()

    # Help text
    with st.expander("💡 How to Use the Editable Table"):
        st.markdown("""
        **Editing Projections:**
        1. Click any cell in Year 1-5 columns
        2. Type new value and press Enter
        3. Dependent values recalculate automatically

        **Smart Recalculation:**
        - Edit Revenue → EBIT adjusts to maintain margin
        - Edit EBIT → NOPAT recalculates with tax rate
        - Edit Tax Rate → NOPAT updates
        - Any change → FCFF recalculates

        **Indicators:**
        - 🤖 **Auto**: System-generated based on historical data
        - ✏️ **Manual**: You've overridden this value

        **Reset:**
        - Click "Reset All to Auto" to clear all manual changes
        - Individual cells can't be reset (just re-enter auto value)

        **Units:**
        - Revenue, EBIT, NOPAT, etc.: $Billions
        - Margins & Rates: Percentages (e.g., enter 15 for 15%)
        - CapEx, NWC change, SBC: $Billions (negatives shown as negative)

        **Example:**
        - Current Year 1 Revenue: $100B 🤖
        - Edit to: $120B
        - Press Enter
        - Indicator changes to: $120B ✏️
        - EBIT recalculates: $18B ✏️ (maintaining 15% margin)
        - FCFF updates automatically
        """)

    return projections


# ============================================================================
# CHARTS SECTION
# ============================================================================

def display_projection_charts(projections):
    """
    Display projection visualization charts.

    Args:
        projections: DCFProjections object or list
    """
    st.markdown("### 📊 Projection Visualizations")

    # CRITICAL FIX: Handle both DCFProjections object and list
    if isinstance(projections, list):
        st.warning("⚠️ Projection charts unavailable - projections in legacy list format")
        st.info("Please refresh the page or upload new financial data to regenerate projections")
        return

    if not hasattr(projections, 'final_projections'):
        st.error(f"❌ Invalid projections object type: {type(projections)}")
        st.info("Please refresh the page to reinitialize projections")
        return

    tab1, tab2, tab3, tab4 = st.tabs([
        "Revenue Growth", "FCFF Progression", "Margin Trend", "Dashboard"
    ])

    with tab1:
        fig = create_revenue_growth_chart(projections)
        st.plotly_chart(fig, use_container_width=True)

    with tab2:
        fig = create_fcff_progression_chart(projections)
        st.plotly_chart(fig, use_container_width=True)

    with tab3:
        fig = create_margin_trend_chart(projections)
        st.plotly_chart(fig, use_container_width=True)

    with tab4:
        fig = create_projection_dashboard(projections)
        st.plotly_chart(fig, use_container_width=True)


# ============================================================================
# MAIN DASHBOARD INTEGRATION
# ============================================================================

def display_model_inputs_dashboard(ticker: str) -> Dict[str, Any]:
    """
    Display complete Model Inputs Dashboard.

    This is the main integration function to call from atlas_app.py.

    Args:
        ticker: Stock ticker symbol

    Returns:
        dict: All model inputs ready for DCF calculation
    """
    st.markdown("## 📊 DCF MODEL INPUTS DASHBOARD")
    st.markdown(f"**Company:** {ticker} | **Updated:** {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M EST')}")

    # Fetch all required data
    with st.spinner("Loading financial data..."):
        financial_data, market_data = extract_financial_data_for_model_inputs(ticker)

    # Initialize projections if not in session state
    if 'dcf_projections' not in st.session_state or st.session_state.get('projection_ticker') != ticker:
        st.session_state.dcf_projections = create_projections_from_financial_data(
            ticker, financial_data, forecast_years=5
        )
        st.session_state.projection_ticker = ticker

    projections = st.session_state.dcf_projections

    # COMPONENT 1: DuPont ROE
    with st.container():
        updated_roe = display_dupont_analysis(financial_data)

    st.markdown("---")

    # COMPONENT 2: SGR & Terminal Growth
    with st.container():
        terminal_growth = display_sgr_analysis(
            financial_data,
            updated_roe['roe'],
            current_terminal_growth=st.session_state.get('terminal_growth', 0.025)
        )
        st.session_state.terminal_growth = terminal_growth

    st.markdown("---")

    # COMPONENT 3: Cost of Capital
    with st.container():
        wacc_components = display_cost_of_capital(financial_data, market_data)

    st.markdown("---")

    # COMPONENT 4: Diluted Shares
    with st.container():
        diluted_shares = display_diluted_shares(financial_data, market_data)

    st.markdown("---")

    # COMPONENT 5: Share-Based Compensation (SBC)
    sbc_result = None
    if SBC_AVAILABLE:
        with st.container():
            # Get forecast_years safely (handle both DCFProjections object and list)
            if hasattr(projections, 'forecast_years'):
                forecast_years = projections.forecast_years
            elif isinstance(projections, list):
                forecast_years = len(projections)
            else:
                forecast_years = 5  # Default fallback

            sbc_result = display_sbc_analysis(ticker, forecast_years=forecast_years)
    else:
        st.info("💡 SBC integration unavailable. Install required dependencies to enable.")

    st.markdown("---")

    # COMPONENT 6: Projection Summary
    with st.container():
        display_projection_summary(projections)

    st.markdown("---")

    # COMPONENT 7: EDITABLE PROJECTION TABLE ⭐ CRITICAL FEATURE
    with st.container():
        projections = display_editable_projection_table(projections)

    st.markdown("---")

    # CHARTS
    if st.button("📊 Show Projection Charts", type="secondary"):
        display_projection_charts(projections)

    st.markdown("---")

    # Return all inputs for DCF calculation
    return {
        'roe': updated_roe['roe'],
        'sgr': updated_roe['roe'] * (1 - financial_data.get('dividends_paid', 0) / max(financial_data.get('net_income', 1), 1)),
        'terminal_growth': terminal_growth,
        'wacc': wacc_components['wacc'],
        'cost_of_equity': wacc_components['cost_of_equity'],
        'cost_of_debt': wacc_components['cost_of_debt'],
        'tax_rate': wacc_components['tax_rate'],
        'diluted_shares': diluted_shares,
        'projections': projections,
        'financial_data': financial_data,
        'market_data': market_data,
        'sbc': sbc_result  # SBC data, config, and enabled flag
    }
