"""
Multi-Stage DCF UI Components for ATLAS Terminal v11.0

Streamlit UI components for:
- Model type selection (single/two/three stage)
- Stage configuration with templates
- Stage transition visualization
- Integration with Model Inputs Dashboard

Author: ATLAS Development Team
Version: 1.0.0
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from typing import List, Dict, Optional

from analytics.multistage_dcf import (
    DCFModelType,
    Stage,
    MultiStageDCFConfig,
    MultiStageProjectionEngine,
    calculate_multistage_dcf
)
from analytics.stage_templates import StageTemplates


def display_model_selection(historical_data: dict) -> Optional[MultiStageDCFConfig]:
    """
    Display model type selection and stage configuration UI.

    Args:
        historical_data: Company's historical financial data

    Returns:
        MultiStageDCFConfig if valid, None otherwise
    """
    st.markdown("### 🎯 DCF Model Type Selection")

    # Model type selector
    col1, col2 = st.columns([2, 1])

    with col1:
        model_type = st.radio(
            "Select DCF Model Type",
            options=["Single-Stage", "Two-Stage", "Three-Stage"],
            help="""
            • **Single-Stage**: Constant growth → Terminal (for mature companies)
            • **Two-Stage**: High growth → Stable growth (for growth companies)
            • **Three-Stage**: Hypergrowth → Declining → Mature (for high-growth tech)
            """,
            horizontal=True
        )

    with col2:
        # Template selector
        template_options = {
            "Custom": "custom",
            "Hypergrowth Tech": "hypergrowth_tech",
            "Growth Company": "growth_company",
            "Mature Company": "mature_company",
            "Turnaround": "turnaround"
        }

        # Get recommendation
        recommended = StageTemplates.recommend_template(historical_data)

        selected_template_name = st.selectbox(
            "Quick Template:",
            options=list(template_options.keys()),
            help=f"💡 Recommended: {recommended.replace('_', ' ').title()}"
        )

        selected_template = template_options[selected_template_name]

    st.markdown("---")

    # Stage configuration based on model type
    if model_type == "Single-Stage":
        stages = display_single_stage_config(historical_data, selected_template)
        model_enum = DCFModelType.SINGLE_STAGE

    elif model_type == "Two-Stage":
        stages = display_two_stage_config(historical_data, selected_template)
        model_enum = DCFModelType.TWO_STAGE

    else:  # Three-Stage
        stages = display_three_stage_config(historical_data, selected_template)
        model_enum = DCFModelType.THREE_STAGE

    if not stages:
        return None

    # Terminal growth and WACC
    st.markdown("---")
    st.markdown("### 🎯 Terminal Value & Discount Rate")

    col1, col2, col3 = st.columns(3)

    with col1:
        terminal_growth = st.number_input(
            "Terminal Growth Rate (%)",
            value=2.5,
            min_value=0.0,
            max_value=5.0,
            step=0.1,
            format="%.2f",
            help="Perpetual growth rate (should be ≤ GDP growth)"
        ) / 100

    with col2:
        # Get WACC from session state (Model Inputs Dashboard) or default
        default_wacc = st.session_state.get('dashboard_inputs', {}).get('wacc', 0.10)
        wacc = st.number_input(
            "WACC (%)",
            value=default_wacc * 100,
            min_value=1.0,
            max_value=30.0,
            step=0.5,
            format="%.2f",
            help="Weighted Average Cost of Capital"
        ) / 100

    with col3:
        # Validation indicators
        last_stage_end_growth = stages[-1].revenue_growth_end
        if terminal_growth > last_stage_end_growth:
            st.error(f"⚠️ Terminal > Final ({last_stage_end_growth*100:.1f}%)")
        elif wacc <= terminal_growth:
            st.error(f"⚠️ WACC must exceed terminal growth")
        else:
            st.success(f"✅ Valid configuration")

    # Create configuration
    config = MultiStageDCFConfig(
        model_type=model_enum,
        stages=stages,
        terminal_growth_rate=terminal_growth,
        wacc=wacc
    )

    # Validate configuration
    is_valid, error_msg = config.validate()

    if not is_valid:
        st.error(f"❌ Configuration Error: {error_msg}")
        return None
    else:
        st.success(f"✅ Configuration valid - {len(stages)} stages, {config.get_total_years()} total years")
        return config


def display_single_stage_config(historical_data: dict, template: str) -> List[Stage]:
    """Display configuration for single-stage model"""

    st.markdown("### 📊 Single-Stage Configuration")
    st.info("💡 Single-stage assumes relatively constant growth throughout forecast period")

    current_growth = historical_data.get('revenue_growth_3yr', 0.08)
    base_revenue = historical_data.get('revenue', 1)
    base_ebit = historical_data.get('ebit', base_revenue * 0.20)
    current_margin = base_ebit / base_revenue if base_revenue > 0 else 0.20

    # Load template if selected
    if template != "custom" and template == "mature_company":
        template_stages = StageTemplates.get_template(template, historical_data)
        default_stage = template_stages[0]
    else:
        default_stage = None

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        years = st.number_input(
            "Forecast Years",
            value=10 if not default_stage else default_stage.duration,
            min_value=5,
            max_value=15,
            step=1
        )

    with col2:
        growth_start = st.number_input(
            "Starting Growth (%)",
            value=current_growth * 100 if not default_stage else default_stage.revenue_growth_start * 100,
            min_value=0.0,
            max_value=15.0,
            step=0.5,
            format="%.1f"
        ) / 100

    with col3:
        growth_end = st.number_input(
            "Ending Growth (%)",
            value=max(current_growth * 0.5, 0.03) * 100 if not default_stage else default_stage.revenue_growth_end * 100,
            min_value=0.0,
            max_value=10.0,
            step=0.5,
            format="%.1f"
        ) / 100

    with col4:
        ebit_margin = st.number_input(
            "EBIT Margin (%)",
            value=current_margin * 100,
            min_value=0.0,
            max_value=50.0,
            step=1.0,
            format="%.1f"
        ) / 100

    stage = Stage(
        stage_number=1,
        name="Mature",
        start_year=1,
        end_year=years,
        duration=years,
        revenue_growth_start=growth_start,
        revenue_growth_end=growth_end,
        growth_decline_type="linear",
        ebit_margin_start=ebit_margin,
        ebit_margin_end=ebit_margin,
        margin_trajectory="stable",
        capex_pct_revenue=0.08,
        nwc_pct_delta_revenue=0.02,
        sbc_pct_revenue=0.03,
        da_pct_revenue=0.07
    )

    return [stage]


def display_two_stage_config(historical_data: dict, template: str) -> List[Stage]:
    """Display configuration for two-stage model"""

    st.markdown("### 📊 Two-Stage Configuration")

    # Load template if selected
    if template != "custom" and template in ["growth_company", "turnaround"]:
        template_stages = StageTemplates.get_template(template, historical_data)
        stage1_default = template_stages[0]
        stage2_default = template_stages[1]
    else:
        # Custom defaults
        current_growth = historical_data.get('revenue_growth_3yr', 0.15)
        base_revenue = historical_data.get('revenue', 1)
        base_ebit = historical_data.get('ebit', base_revenue * 0.20)
        current_margin = base_ebit / base_revenue if base_revenue > 0 else 0.20

        stage1_default = Stage(1, "High Growth", 1, 5, 5,
                              current_growth, 0.12, "exponential",
                              current_margin, current_margin + 0.03, "expanding",
                              0.12, 0.025, 0.05, 0.06)
        stage2_default = Stage(2, "Stable Growth", 6, 10, 5,
                              0.12, 0.04, "linear",
                              current_margin + 0.03, current_margin + 0.03, "stable",
                              0.08, 0.02, 0.03, 0.07)

    # Stage 1: High Growth
    with st.expander("🚀 STAGE 1: High Growth Phase", expanded=True):
        st.markdown("**Duration & Growth**")

        col1, col2, col3 = st.columns(3)

        with col1:
            stage1_years = st.number_input(
                "Stage 1 Duration (years)",
                value=stage1_default.duration,
                min_value=2,
                max_value=8,
                step=1,
                key="s1_years"
            )

        with col2:
            stage1_growth_start = st.number_input(
                "Starting Growth Rate (%)",
                value=stage1_default.revenue_growth_start * 100,
                min_value=5.0,
                max_value=50.0,
                step=1.0,
                format="%.1f",
                key="s1_growth_start"
            ) / 100

        with col3:
            stage1_growth_end = st.number_input(
                "Ending Growth Rate (%)",
                value=stage1_default.revenue_growth_end * 100,
                min_value=3.0,
                max_value=30.0,
                step=1.0,
                format="%.1f",
                key="s1_growth_end"
            ) / 100

        st.markdown("**Margins & Assumptions**")

        col1, col2, col3, col4 = st.columns(4)

        with col1:
            stage1_margin_start = st.number_input(
                "Starting EBIT Margin (%)",
                value=stage1_default.ebit_margin_start * 100,
                format="%.1f",
                key="s1_margin_start"
            ) / 100

        with col2:
            stage1_margin_end = st.number_input(
                "Ending EBIT Margin (%)",
                value=stage1_default.ebit_margin_end * 100,
                format="%.1f",
                key="s1_margin_end"
            ) / 100

        with col3:
            stage1_capex = st.number_input(
                "CapEx (% of Revenue)",
                value=stage1_default.capex_pct_revenue * 100,
                format="%.1f",
                key="s1_capex"
            ) / 100

        with col4:
            stage1_sbc = st.number_input(
                "SBC (% of Revenue)",
                value=stage1_default.sbc_pct_revenue * 100,
                format="%.1f",
                key="s1_sbc"
            ) / 100

    # Stage 2: Stable Growth
    with st.expander("📈 STAGE 2: Stable Growth Phase", expanded=True):
        st.markdown("**Duration & Growth**")

        col1, col2, col3 = st.columns(3)

        with col1:
            stage2_years = st.number_input(
                "Stage 2 Duration (years)",
                value=stage2_default.duration,
                min_value=2,
                max_value=8,
                step=1,
                key="s2_years"
            )

        with col2:
            stage2_growth_start = st.number_input(
                "Starting Growth Rate (%)",
                value=stage2_default.revenue_growth_start * 100,
                min_value=2.0,
                max_value=20.0,
                step=0.5,
                format="%.1f",
                key="s2_growth_start"
            ) / 100

        with col3:
            stage2_growth_end = st.number_input(
                "Ending Growth Rate (%)",
                value=stage2_default.revenue_growth_end * 100,
                min_value=1.0,
                max_value=10.0,
                step=0.5,
                format="%.1f",
                key="s2_growth_end"
            ) / 100

        st.markdown("**Margins & Assumptions**")

        col1, col2, col3, col4 = st.columns(4)

        with col1:
            stage2_margin_start = st.number_input(
                "Starting EBIT Margin (%)",
                value=stage2_default.ebit_margin_start * 100,
                format="%.1f",
                key="s2_margin_start"
            ) / 100

        with col2:
            stage2_margin_end = st.number_input(
                "Ending EBIT Margin (%)",
                value=stage2_default.ebit_margin_end * 100,
                format="%.1f",
                key="s2_margin_end"
            ) / 100

        with col3:
            stage2_capex = st.number_input(
                "CapEx (% of Revenue)",
                value=stage2_default.capex_pct_revenue * 100,
                format="%.1f",
                key="s2_capex"
            ) / 100

        with col4:
            stage2_sbc = st.number_input(
                "SBC (% of Revenue)",
                value=stage2_default.sbc_pct_revenue * 100,
                format="%.1f",
                key="s2_sbc"
            ) / 100

    # Build stage objects
    stage1 = Stage(
        stage_number=1,
        name="High Growth",
        start_year=1,
        end_year=stage1_years,
        duration=stage1_years,
        revenue_growth_start=stage1_growth_start,
        revenue_growth_end=stage1_growth_end,
        growth_decline_type="exponential",
        ebit_margin_start=stage1_margin_start,
        ebit_margin_end=stage1_margin_end,
        margin_trajectory="expanding" if stage1_margin_end > stage1_margin_start else "stable",
        capex_pct_revenue=stage1_capex,
        nwc_pct_delta_revenue=0.025,
        sbc_pct_revenue=stage1_sbc,
        da_pct_revenue=0.06
    )

    stage2 = Stage(
        stage_number=2,
        name="Stable Growth",
        start_year=stage1_years + 1,
        end_year=stage1_years + stage2_years,
        duration=stage2_years,
        revenue_growth_start=stage2_growth_start,
        revenue_growth_end=stage2_growth_end,
        growth_decline_type="linear",
        ebit_margin_start=stage2_margin_start,
        ebit_margin_end=stage2_margin_end,
        margin_trajectory="stable" if abs(stage2_margin_end - stage2_margin_start) < 0.01 else "expanding",
        capex_pct_revenue=stage2_capex,
        nwc_pct_delta_revenue=0.02,
        sbc_pct_revenue=stage2_sbc,
        da_pct_revenue=0.07
    )

    return [stage1, stage2]


def display_three_stage_config(historical_data: dict, template: str) -> List[Stage]:
    """Display configuration for three-stage model"""

    st.markdown("### 📊 Three-Stage Configuration")

    # Load template if selected
    if template != "custom" and template == "hypergrowth_tech":
        template_stages = StageTemplates.get_template(template, historical_data)
        s1_def, s2_def, s3_def = template_stages
    else:
        # Custom defaults
        current_growth = historical_data.get('revenue_growth_3yr', 0.30)
        base_revenue = historical_data.get('revenue', 1)
        base_ebit = historical_data.get('ebit', base_revenue * 0.20)
        current_margin = base_ebit / base_revenue if base_revenue > 0 else 0.20

        s1_def = Stage(1, "Hypergrowth", 1, 3, 3, 0.35, 0.28, "exponential",
                      current_margin, current_margin + 0.05, "expanding",
                      0.15, 0.03, 0.08, 0.05)
        s2_def = Stage(2, "Transition", 4, 7, 4, 0.28, 0.12, "exponential",
                      current_margin + 0.05, current_margin + 0.08, "expanding",
                      0.12, 0.025, 0.06, 0.06)
        s3_def = Stage(3, "Mature", 8, 10, 3, 0.12, 0.05, "linear",
                      current_margin + 0.08, current_margin + 0.08, "stable",
                      0.08, 0.02, 0.04, 0.07)

    # Stage 1: Hypergrowth
    with st.expander("🚀 STAGE 1: Hypergrowth Phase", expanded=True):
        col1, col2, col3 = st.columns(3)

        with col1:
            s1_years = st.number_input("Duration (years)", value=s1_def.duration, min_value=1, max_value=5, key="s1h_years")

        with col2:
            s1_growth_start = st.number_input("Starting Growth (%)", value=s1_def.revenue_growth_start * 100,
                                             min_value=20.0, max_value=60.0, step=1.0, key="s1h_gs") / 100

        with col3:
            s1_growth_end = st.number_input("Ending Growth (%)", value=s1_def.revenue_growth_end * 100,
                                           min_value=15.0, max_value=40.0, step=1.0, key="s1h_ge") / 100

        col1, col2 = st.columns(2)
        with col1:
            s1_margin = st.number_input("EBIT Margin (%)", value=s1_def.ebit_margin_start * 100, key="s1h_margin") / 100
        with col2:
            s1_capex = st.number_input("CapEx (%)", value=s1_def.capex_pct_revenue * 100, key="s1h_capex") / 100

    # Stage 2: Transition
    with st.expander("📉 STAGE 2: Transition Phase", expanded=True):
        col1, col2, col3 = st.columns(3)

        with col1:
            s2_years = st.number_input("Duration (years)", value=s2_def.duration, min_value=2, max_value=6, key="s2h_years")

        with col2:
            s2_growth_start = st.number_input("Starting Growth (%)", value=s2_def.revenue_growth_start * 100,
                                             min_value=10.0, max_value=35.0, step=1.0, key="s2h_gs") / 100

        with col3:
            s2_growth_end = st.number_input("Ending Growth (%)", value=s2_def.revenue_growth_end * 100,
                                           min_value=5.0, max_value=20.0, step=1.0, key="s2h_ge") / 100

        col1, col2 = st.columns(2)
        with col1:
            s2_margin = st.number_input("EBIT Margin (%)", value=s2_def.ebit_margin_start * 100, key="s2h_margin") / 100
        with col2:
            s2_capex = st.number_input("CapEx (%)", value=s2_def.capex_pct_revenue * 100, key="s2h_capex") / 100

    # Stage 3: Mature
    with st.expander("📊 STAGE 3: Mature Phase", expanded=True):
        col1, col2, col3 = st.columns(3)

        with col1:
            s3_years = st.number_input("Duration (years)", value=s3_def.duration, min_value=2, max_value=5, key="s3h_years")

        with col2:
            s3_growth_start = st.number_input("Starting Growth (%)", value=s3_def.revenue_growth_start * 100,
                                             min_value=5.0, max_value=15.0, step=0.5, key="s3h_gs") / 100

        with col3:
            s3_growth_end = st.number_input("Ending Growth (%)", value=s3_def.revenue_growth_end * 100,
                                           min_value=2.0, max_value=8.0, step=0.5, key="s3h_ge") / 100

        col1, col2 = st.columns(2)
        with col1:
            s3_margin = st.number_input("EBIT Margin (%)", value=s3_def.ebit_margin_start * 100, key="s3h_margin") / 100
        with col2:
            s3_capex = st.number_input("CapEx (%)", value=s3_def.capex_pct_revenue * 100, key="s3h_capex") / 100

    # Build stages
    stage1 = Stage(1, "Hypergrowth", 1, s1_years, s1_years,
                  s1_growth_start, s1_growth_end, "exponential",
                  s1_margin, s1_margin + 0.03, "expanding",
                  s1_capex, 0.03, 0.08, 0.05)

    stage2 = Stage(2, "Transition", s1_years + 1, s1_years + s2_years, s2_years,
                  s2_growth_start, s2_growth_end, "exponential",
                  s2_margin, s2_margin + 0.03, "expanding",
                  s2_capex, 0.025, 0.06, 0.06)

    stage3 = Stage(3, "Mature", s1_years + s2_years + 1, s1_years + s2_years + s3_years, s3_years,
                  s3_growth_start, s3_growth_end, "linear",
                  s3_margin, s3_margin, "stable",
                  s3_capex, 0.02, 0.04, 0.07)

    return [stage1, stage2, stage3]


def visualize_stage_transitions(config: MultiStageDCFConfig, projections: Dict[int, dict]):
    """Visualize how growth rates and margins evolve across stages"""

    st.markdown("### 📊 Stage Transition Visualization")

    # Prepare data
    years = sorted(projections.keys())
    revenue_growth = [projections[y]['revenue_growth'] * 100 for y in years]
    ebit_margin = [projections[y]['ebit_margin'] * 100 for y in years]
    revenues = [projections[y]['revenue'] / 1e9 for y in years]

    # Create subplot with 2 charts
    fig = make_subplots(
        rows=2, cols=1,
        subplot_titles=("Revenue Growth Rate Evolution", "EBIT Margin Evolution"),
        vertical_spacing=0.12,
        row_heights=[0.5, 0.5]
    )

    # Chart 1: Growth Rate Evolution
    fig.add_trace(
        go.Scatter(
            x=years,
            y=revenue_growth,
            mode='lines+markers',
            name='Revenue Growth',
            line=dict(color='#00D9FF', width=3),
            marker=dict(size=8),
            hovertemplate='Year %{x}<br>Growth: %{y:.1f}%<extra></extra>'
        ),
        row=1, col=1
    )

    # Add stage transitions (vertical lines)
    for stage in config.stages[:-1]:
        fig.add_vline(
            x=stage.end_year + 0.5,
            line_dash="dash",
            line_color="gray",
            opacity=0.5,
            row=1, col=1
        )
        fig.add_vline(
            x=stage.end_year + 0.5,
            line_dash="dash",
            line_color="gray",
            opacity=0.5,
            row=2, col=1
        )

    # Add terminal growth line
    fig.add_hline(
        y=config.terminal_growth_rate * 100,
        line_dash="dot",
        line_color="red",
        opacity=0.7,
        row=1, col=1
    )

    # Chart 2: EBIT Margin Evolution
    fig.add_trace(
        go.Scatter(
            x=years,
            y=ebit_margin,
            mode='lines+markers',
            name='EBIT Margin',
            line=dict(color='#00FF88', width=3),
            marker=dict(size=8),
            fill='tozeroy',
            hovertemplate='Year %{x}<br>Margin: %{y:.1f}%<extra></extra>'
        ),
        row=2, col=1
    )

    fig.update_xaxes(title_text="Year", row=2, col=1)
    fig.update_yaxes(title_text="Growth Rate (%)", row=1, col=1)
    fig.update_yaxes(title_text="EBIT Margin (%)", row=2, col=1)

    fig.update_layout(
        height=600,
        showlegend=False,
        plot_bgcolor='rgba(0,0,0,0)',
        paper_bgcolor='rgba(0,0,0,0)',
        font=dict(color='white')
    )

    st.plotly_chart(fig, use_container_width=True)

    # Stage Summary Table
    st.markdown("#### 📋 Stage Summary")

    stage_summary = []
    for stage in config.stages:
        stage_summary.append({
            'Stage': f"{stage.stage_number}. {stage.name}",
            'Years': f"{stage.start_year}-{stage.end_year}",
            'Duration': f"{stage.duration} yrs",
            'Growth': f"{stage.revenue_growth_start*100:.1f}% → {stage.revenue_growth_end*100:.1f}%",
            'EBIT Margin': f"{stage.ebit_margin_start*100:.1f}% → {stage.ebit_margin_end*100:.1f}%",
            'CapEx': f"{stage.capex_pct_revenue*100:.1f}%",
            'SBC': f"{stage.sbc_pct_revenue*100:.1f}%"
        })

    df_summary = pd.DataFrame(stage_summary)
    st.dataframe(df_summary, use_container_width=True, hide_index=True)


def display_multistage_results(dcf_result: dict, config: MultiStageDCFConfig):
    """Display multi-stage DCF valuation results"""

    st.markdown("### 💰 Multi-Stage DCF Valuation Results")

    # Main metrics
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric(
            "Enterprise Value",
            f"${dcf_result['enterprise_value']/1e9:.2f}B"
        )

    with col2:
        st.metric(
            "Value per Share",
            f"${dcf_result['value_per_share']:.2f}"
        )

    with col3:
        st.metric(
            "Terminal Value %",
            f"{dcf_result['terminal_value_pct']:.1f}%",
            help="What % of value comes from terminal value"
        )

    with col4:
        st.metric(
            "Forecast Horizon",
            f"{dcf_result['forecast_years']} years",
            delta=f"{len(config.stages)} stages"
        )

    # Value breakdown
    st.markdown("#### 📊 Value Breakdown")

    col1, col2 = st.columns(2)

    with col1:
        # Pie chart of value components
        fig = go.Figure(data=[go.Pie(
            labels=['PV of Explicit Forecasts', 'PV of Terminal Value'],
            values=[dcf_result['pv_fcff_explicit'], dcf_result['pv_terminal_value']],
            hole=0.4,
            marker_colors=['#00D9FF', '#FF6B6B']
        )])

        fig.update_layout(
            title="Value Components",
            height=300,
            plot_bgcolor='rgba(0,0,0,0)',
            paper_bgcolor='rgba(0,0,0,0)',
            font=dict(color='white')
        )

        st.plotly_chart(fig, use_container_width=True)

    with col2:
        st.markdown("**Key Assumptions:**")
        st.markdown(f"• WACC: **{config.wacc*100:.2f}%**")
        st.markdown(f"• Terminal Growth: **{config.terminal_growth_rate*100:.2f}%**")
        st.markdown(f"• Model Type: **{config.model_type.value.replace('_', '-').title()}**")
        st.markdown(f"• Diluted Shares: **{dcf_result['diluted_shares']/1e6:.1f}M**")

        if dcf_result['terminal_value_pct'] > 75:
            st.warning("⚠️ Terminal value >75% - projections may be too aggressive")
        elif dcf_result['terminal_value_pct'] < 40:
            st.info("💡 Low terminal value % - consider extending forecast horizon")


if __name__ == '__main__':
    print("Multi-Stage UI Components - Streamlit module (run via atlas_app.py)")
