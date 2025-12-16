"""
Share-Based Compensation (SBC) UI Components

Streamlit UI components for SBC analysis, forecasting, and valuation impact.
Integrates with Model Inputs Dashboard and Valuation House.

Components:
1. SBC Detection Display - Show extracted SBC data
2. Historical Trend Visualization - Chart SBC evolution
3. Forecast Configuration - Setup SBC projections
4. Before/After Comparison - Show valuation impact
5. Educational Component - Explain why SBC matters

Author: ATLAS Development Team
Version: 1.0.0
Date: 2025-12-16
"""

import streamlit as st
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from typing import Dict, Optional
import pandas as pd

from analytics.sbc_detector import SBCDetector, detect_sbc_for_company
from analytics.sbc_forecaster import (
    SBCForecaster,
    SBCForecastConfig,
    SBCForecastMethod,
    integrate_sbc_with_fcff,
    create_sbc_comparison_analysis
)


def display_sbc_educational_intro():
    """
    Display educational content about SBC and why it matters.
    """
    with st.expander("📚 Why SBC Matters in DCF Valuation", expanded=False):
        st.markdown("""
        ### The SBC Blind Spot

        **Share-Based Compensation (SBC) is a real economic cost that many DCF models ignore.**

        #### The Problem

        Traditional DCF models often:
        - ❌ Use EBITDA or EBIT which excludes SBC as "non-cash"
        - ❌ Add back SBC in FCFF calculations
        - ❌ Ignore dilution from equity grants

        **Result:** Systematic overvaluation, especially for high-growth tech companies.

        #### The Reality

        - ✅ SBC is **real compensation** paid to employees
        - ✅ If not paid in stock, it would be **paid in cash**
        - ✅ SBC dilutes existing shareholders
        - ✅ High-SBC companies (>5% of revenue) are materially overvalued if SBC is ignored

        #### Real-World Example

        **Snowflake (SNOW) in 2021:**
        - Revenue: ~$1.2B
        - SBC: ~$400M (33% of revenue!)
        - Market Cap: ~$100B

        Ignoring SBC meant overvaluing by 20-30%. Analysts who properly accounted for SBC
        avoided the trap.

        #### ATLAS Approach

        ATLAS v11.0 properly treats SBC as a **cash cost**:
        1. **Detect** SBC from financial statements
        2. **Forecast** SBC normalization path
        3. **Subtract** SBC from FCFF (real cost)
        4. **Show** before/after valuation impact

        This prevents systematic overvaluation and provides realistic fair value estimates.
        """)


def display_sbc_detection_results(ticker: str, sbc_data: Dict) -> bool:
    """
    Display SBC detection results with key metrics.

    Args:
        ticker: Stock ticker
        sbc_data: SBC data from detector

    Returns:
        bool: True if SBC detected successfully
    """
    st.subheader(f"📊 SBC Analysis: {ticker}")

    if not sbc_data['success']:
        st.error(f"❌ Could not detect SBC for {ticker}")
        st.caption(f"Error: {sbc_data.get('error', 'Unknown error')}")
        st.info("💡 You can manually input SBC data below for forecasting.")
        return False

    # Success - show detection results
    sbc_info = sbc_data['sbc_data']

    st.success(f"✅ SBC detected using {sbc_info['method']}")

    # Key metrics
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric(
            "Latest SBC",
            f"${sbc_info['latest_sbc']/1e9:.2f}B" if sbc_info['latest_sbc'] > 1e9
            else f"${sbc_info['latest_sbc']/1e6:.1f}M",
            help="Most recent annual SBC"
        )

    with col2:
        st.metric(
            "Latest SBC %",
            f"{sbc_info['latest_sbc_pct']:.2f}%",
            help="SBC as % of revenue"
        )

    with col3:
        st.metric(
            "Avg SBC %",
            f"{sbc_info['avg_sbc_pct']:.2f}%",
            help="Average SBC % over available years"
        )

    with col4:
        materiality = "🔴 High" if sbc_info['is_material'] else "🟢 Low"
        st.metric(
            "Materiality",
            materiality,
            help="High if avg SBC > 3% of revenue"
        )

    # Historical data table
    if sbc_info['years_available'] > 0:
        st.caption(f"**Historical SBC Data** ({sbc_info['years_available']} years)")

        # Create DataFrame
        historical_df = pd.DataFrame({
            'Year': sorted(sbc_info['sbc_annual'].keys()),
            'Revenue ($B)': [sbc_info['revenue_annual'][y]/1e9 for y in sorted(sbc_info['sbc_annual'].keys())],
            'SBC ($M)': [sbc_info['sbc_annual'][y]/1e6 for y in sorted(sbc_info['sbc_annual'].keys())],
            'SBC % Revenue': [f"{sbc_info['sbc_pct_revenue'][y]:.2f}%" for y in sorted(sbc_info['sbc_annual'].keys())]
        })

        st.dataframe(historical_df, use_container_width=True, hide_index=True)

    # Warning for estimated data
    if sbc_info.get('estimated', False):
        st.warning(f"⚠️ {sbc_info.get('warning', 'SBC estimated from industry averages')}")

    return True


def visualize_sbc_historical_trend(sbc_data: Dict, ticker: str):
    """
    Visualize historical SBC trend with Plotly.

    Args:
        sbc_data: Complete SBC data from detector
        ticker: Stock ticker for title
    """
    if not sbc_data['success']:
        return

    sbc_info = sbc_data['sbc_data']
    trend_info = sbc_data.get('trend_analysis', {})

    if not trend_info or not trend_info.get('success'):
        return

    st.subheader("📈 Historical SBC Trend")

    years = trend_info['historical_years']
    sbc_pcts = trend_info['historical_percentages']

    # Create figure with secondary y-axis
    fig = make_subplots(
        rows=1, cols=1,
        subplot_titles=[f"{ticker} - SBC as % of Revenue"],
        specs=[[{"secondary_y": False}]]
    )

    # Add SBC % line
    fig.add_trace(
        go.Scatter(
            x=years,
            y=sbc_pcts,
            mode='lines+markers',
            name='SBC % Revenue',
            line=dict(color='#FF6B6B', width=3),
            marker=dict(size=10, color='#FF6B6B')
        )
    )

    # Add 3% materiality threshold line
    fig.add_hline(
        y=3.0,
        line_dash="dash",
        line_color="orange",
        annotation_text="3% Materiality Threshold",
        annotation_position="right"
    )

    # Add trend direction annotation
    trend_direction = trend_info['trend_direction']
    trend_color = 'red' if trend_direction == 'increasing' else 'green' if trend_direction == 'decreasing' else 'gray'

    fig.add_annotation(
        text=f"Trend: {trend_direction.upper()}",
        xref="paper", yref="paper",
        x=0.02, y=0.98,
        showarrow=False,
        font=dict(size=14, color=trend_color),
        bgcolor='rgba(0,0,0,0.5)',
        bordercolor=trend_color,
        borderwidth=2
    )

    # Apply ATLAS dark theme
    fig.update_layout(
        height=400,
        plot_bgcolor='#0E1117',
        paper_bgcolor='#0E1117',
        font=dict(color='white', size=12),
        hovermode='x unified',
        showlegend=True,
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        )
    )

    fig.update_xaxes(
        title="Year",
        gridcolor='#1E1E1E',
        showgrid=True
    )

    fig.update_yaxes(
        title="SBC as % of Revenue",
        gridcolor='#1E1E1E',
        showgrid=True
    )

    st.plotly_chart(fig, use_container_width=True)

    # Show trend analysis
    with st.expander("🔍 Trend Analysis Details", expanded=False):
        col1, col2 = st.columns(2)

        with col1:
            st.metric("Trend Direction", trend_direction.upper())
            st.metric("Avg Annual Change", f"{trend_info['avg_annual_change_pct']:.2f}%")

        with col2:
            st.metric("Latest SBC %", f"{trend_info['latest_sbc_pct']:.2f}%")
            st.metric("Volatility", f"{trend_info['volatility']:.2f}%")

        st.info(f"**Recommendation:** {trend_info['forecast_recommendation']}")


def configure_sbc_forecast(
    ticker: str,
    sbc_data: Dict,
    forecast_years: int = 10
) -> Optional[SBCForecastConfig]:
    """
    Configure SBC forecast with user inputs.

    Args:
        ticker: Stock ticker
        sbc_data: SBC data from detector
        forecast_years: Number of years to forecast

    Returns:
        SBCForecastConfig or None
    """
    st.subheader("🔮 SBC Forecast Configuration")

    # Get forecast inputs
    forecast_inputs = sbc_data.get('forecast_inputs', {})

    if not forecast_inputs or not forecast_inputs.get('success'):
        # Manual input mode
        st.warning("⚠️ No historical SBC data available. Using manual input mode.")

        starting_sbc_pct = st.number_input(
            "Starting SBC (% of Revenue)",
            min_value=0.0,
            max_value=50.0,
            value=5.0,
            step=0.5,
            help="Current or estimated SBC as percentage of revenue"
        )

        method_choice = st.selectbox(
            "Forecast Method",
            options=["Linear Normalization", "Maintain Current Level"],
            help="How should SBC evolve over time?"
        )

        if method_choice == "Linear Normalization":
            target_pct = st.number_input(
                "Normalization Target (%)",
                min_value=0.0,
                max_value=20.0,
                value=3.0,
                step=0.5,
                help="Target SBC % (typically 2-4% for mature companies)"
            )

            years_to_normalize = st.slider(
                "Years to Normalize",
                min_value=3,
                max_value=forecast_years,
                value=min(5, forecast_years),
                help="How many years to reach target?"
            )

            config = SBCForecastConfig(
                method=SBCForecastMethod.LINEAR_NORMALIZATION,
                starting_sbc_pct_revenue=starting_sbc_pct,
                forecast_years=forecast_years,
                normalization_target_pct=target_pct,
                years_to_normalize=years_to_normalize
            )

        else:  # Maintain Current
            config = SBCForecastConfig(
                method=SBCForecastMethod.MAINTAIN_CURRENT,
                starting_sbc_pct_revenue=starting_sbc_pct,
                forecast_years=forecast_years
            )

        return config

    # Automatic mode with recommendations
    st.success("✅ Using detected SBC data with intelligent defaults")

    starting_sbc_pct = st.number_input(
        "Starting SBC (% of Revenue)",
        min_value=0.0,
        max_value=50.0,
        value=float(forecast_inputs['starting_sbc_pct_revenue']),
        step=0.5,
        help="Current SBC % detected from financial statements"
    )

    # Method selection
    method_choice = st.selectbox(
        "Forecast Method",
        options=["Linear Normalization (Recommended)", "Maintain Current Level"],
        help="Recommendation based on historical trend analysis"
    )

    if "Linear Normalization" in method_choice:
        col1, col2 = st.columns(2)

        with col1:
            target_pct = st.number_input(
                "Normalization Target (%)",
                min_value=0.0,
                max_value=20.0,
                value=float(forecast_inputs['normalization_target']),
                step=0.5,
                help="Target SBC % for mature company (recommended based on trend)"
            )

        with col2:
            years_to_normalize = st.slider(
                "Years to Normalize",
                min_value=3,
                max_value=forecast_years,
                value=int(forecast_inputs['years_to_normalize']),
                help="Recommended based on current SBC level"
            )

        st.info(f"💡 **Recommendation:** {forecast_inputs.get('recommendation', 'No recommendation available')}")

        config = SBCForecastConfig(
            method=SBCForecastMethod.LINEAR_NORMALIZATION,
            starting_sbc_pct_revenue=starting_sbc_pct,
            forecast_years=forecast_years,
            normalization_target_pct=target_pct,
            years_to_normalize=years_to_normalize
        )

    else:  # Maintain Current
        config = SBCForecastConfig(
            method=SBCForecastMethod.MAINTAIN_CURRENT,
            starting_sbc_pct_revenue=starting_sbc_pct,
            forecast_years=forecast_years
        )

    return config


def visualize_sbc_forecast(
    sbc_forecast: Dict[int, Dict],
    ticker: str,
    config: SBCForecastConfig
):
    """
    Visualize SBC forecast trajectory.

    Args:
        sbc_forecast: Generated SBC forecast
        ticker: Stock ticker
        config: Forecast configuration
    """
    st.subheader("📊 SBC Forecast Projection")

    years = sorted(sbc_forecast.keys())
    sbc_amounts = [sbc_forecast[y]['sbc_amount']/1e9 for y in years]
    sbc_pcts = [sbc_forecast[y]['sbc_pct_revenue'] for y in years]
    revenues = [sbc_forecast[y]['revenue']/1e9 for y in years]

    # Create dual-axis chart
    fig = make_subplots(
        rows=2, cols=1,
        subplot_titles=[
            f"{ticker} - SBC Forecast ($B)",
            f"{ticker} - SBC as % of Revenue"
        ],
        vertical_spacing=0.15
    )

    # Top chart: SBC amounts
    fig.add_trace(
        go.Bar(
            x=years,
            y=sbc_amounts,
            name='SBC ($B)',
            marker=dict(color='#FF6B6B'),
            text=[f'${v:.2f}B' for v in sbc_amounts],
            textposition='outside'
        ),
        row=1, col=1
    )

    # Bottom chart: SBC %
    fig.add_trace(
        go.Scatter(
            x=years,
            y=sbc_pcts,
            name='SBC % Revenue',
            mode='lines+markers',
            line=dict(color='#4ECDC4', width=3),
            marker=dict(size=8)
        ),
        row=2, col=1
    )

    # Add 3% threshold
    fig.add_hline(
        y=3.0,
        line_dash="dash",
        line_color="orange",
        annotation_text="3% Materiality",
        row=2, col=1
    )

    # Apply ATLAS theme
    fig.update_layout(
        height=700,
        plot_bgcolor='#0E1117',
        paper_bgcolor='#0E1117',
        font=dict(color='white', size=12),
        showlegend=False
    )

    fig.update_xaxes(title="Year", gridcolor='#1E1E1E')
    fig.update_yaxes(title="SBC ($B)", gridcolor='#1E1E1E', row=1, col=1)
    fig.update_yaxes(title="SBC %", gridcolor='#1E1E1E', row=2, col=1)

    st.plotly_chart(fig, use_container_width=True)

    # Summary table
    with st.expander("📋 SBC Forecast Details", expanded=False):
        df = pd.DataFrame({
            'Year': years,
            'Revenue ($B)': [f"${r:.2f}" for r in revenues],
            'SBC ($M)': [f"${sbc_forecast[y]['sbc_amount']/1e6:.1f}" for y in years],
            'SBC % Revenue': [f"{sbc_forecast[y]['sbc_pct_revenue']:.2f}%" for y in years]
        })
        st.dataframe(df, use_container_width=True, hide_index=True)


def display_sbc_valuation_impact(
    impact_analysis: Dict,
    ticker: str
):
    """
    Display before/after valuation comparison showing SBC impact.

    Args:
        impact_analysis: Results from create_sbc_comparison_analysis
        ticker: Stock ticker
    """
    st.subheader("💰 SBC Impact on Valuation")

    # Key metrics comparison
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric(
            "Enterprise Value (No SBC)",
            f"${impact_analysis['enterprise_value_without_sbc']/1e9:.2f}B"
        )

    with col2:
        st.metric(
            "Enterprise Value (With SBC)",
            f"${impact_analysis['enterprise_value_with_sbc']/1e9:.2f}B",
            delta=f"-${impact_analysis['ev_impact']/1e9:.2f}B",
            delta_color="inverse"
        )

    with col3:
        st.metric(
            "Impact on Value",
            f"{impact_analysis['ev_impact_pct']:.1f}%",
            help="Percentage overvaluation if SBC is ignored"
        )

    # Per share impact
    st.divider()

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric(
            "Value/Share (No SBC)",
            f"${impact_analysis['value_per_share_without_sbc']:.2f}"
        )

    with col2:
        st.metric(
            "Value/Share (With SBC)",
            f"${impact_analysis['value_per_share_with_sbc']:.2f}",
            delta=f"-${impact_analysis['per_share_impact']:.2f}",
            delta_color="inverse"
        )

    with col3:
        st.metric(
            "Per Share Impact",
            f"{impact_analysis['per_share_impact_pct']:.1f}%"
        )

    # Interpretation
    st.divider()

    interpretation = impact_analysis['interpretation']

    # Color code by severity
    if 'CRITICAL' in interpretation:
        st.error(interpretation)
    elif 'MAJOR' in interpretation:
        st.warning(interpretation)
    elif 'MODERATE' in interpretation:
        st.info(interpretation)
    else:
        st.success(interpretation)

    # Additional context
    with st.expander("📊 SBC Impact Details", expanded=False):
        st.write(f"**Total SBC (Undiscounted):** ${impact_analysis['total_sbc_undiscounted']/1e9:.2f}B")
        st.write(f"**Average SBC % Revenue:** {impact_analysis['avg_sbc_pct_revenue']:.2f}%")

        st.markdown("""
        **How to Interpret:**
        - **< 2% impact:** SBC is not material to valuation
        - **2-5% impact:** SBC is somewhat material, should be considered
        - **5-10% impact:** SBC is material and must be explicitly modeled
        - **10-15% impact:** SBC is very material, ignoring it causes major overvaluation
        - **> 15% impact:** SBC is critical, valuation without SBC is unreliable
        """)


def display_complete_sbc_analysis(
    ticker: str,
    forecast_years: int = 10,
    revenue_projections: Optional[Dict[int, float]] = None
) -> Dict:
    """
    Complete SBC analysis workflow from detection to valuation impact.

    Args:
        ticker: Stock ticker
        forecast_years: Number of forecast years
        revenue_projections: Optional revenue projections (if None, will be generated)

    Returns:
        Dict with all SBC analysis results
    """
    # Educational intro
    display_sbc_educational_intro()

    st.divider()

    # Step 1: Detect SBC
    with st.spinner(f"Detecting SBC for {ticker}..."):
        sbc_data = detect_sbc_for_company(ticker)

    detection_success = display_sbc_detection_results(ticker, sbc_data)

    if not detection_success and not revenue_projections:
        st.warning("⚠️ Cannot generate SBC forecast without revenue projections.")
        return {'success': False, 'error': 'No SBC data and no revenue projections'}

    # Step 2: Visualize historical trend
    if detection_success:
        visualize_sbc_historical_trend(sbc_data, ticker)
        st.divider()

    # Step 3: Configure forecast
    config = configure_sbc_forecast(ticker, sbc_data, forecast_years)

    if config is None:
        return {'success': False, 'error': 'Forecast configuration failed'}

    # Validate config
    is_valid, error = config.validate()
    if not is_valid:
        st.error(f"❌ Invalid configuration: {error}")
        return {'success': False, 'error': error}

    # Step 4: Generate forecast (if revenue projections provided)
    if revenue_projections:
        st.divider()

        with st.spinner("Generating SBC forecast..."):
            forecaster = SBCForecaster(config)
            sbc_forecast = forecaster.generate_sbc_forecast(revenue_projections)

        visualize_sbc_forecast(sbc_forecast, ticker, config)

        return {
            'success': True,
            'sbc_data': sbc_data,
            'config': config,
            'forecaster': forecaster,
            'sbc_forecast': sbc_forecast
        }

    else:
        st.info("💡 Provide revenue projections to generate SBC forecast and valuation impact.")
        return {
            'success': True,
            'sbc_data': sbc_data,
            'config': config,
            'forecaster': None,
            'sbc_forecast': None
        }


if __name__ == '__main__':
    # Test standalone
    st.set_page_config(page_title="SBC Analysis", layout="wide")

    st.title("🎯 Share-Based Compensation Analysis")

    ticker = st.text_input("Enter Ticker", value="SNOW")

    if st.button("Analyze SBC"):
        result = display_complete_sbc_analysis(ticker)

        if result['success']:
            st.success("✅ SBC analysis complete!")
        else:
            st.error(f"❌ Analysis failed: {result.get('error')}")
