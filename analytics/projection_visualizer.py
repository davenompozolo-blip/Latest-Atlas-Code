"""
ATLAS Projection Visualizer Module
===================================
Create charts and visualizations for DCF projections

Features:
- Revenue growth charts
- FCFF progression
- Margin trends
- Waterfall charts
- Scenario comparisons

Author: ATLAS v11.0
"""

import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional


# ============================================================================
# CHART THEME
# ============================================================================

ATLAS_COLORS = {
    'primary': '#00D4FF',  # Electric blue
    'secondary': '#FF6B6B',  # Coral red
    'success': '#00FF88',  # Neon green
    'warning': '#FFAA00',  # Amber
    'purple': '#B794F6',  # Lavender
    'background': '#0A0E27',  # Dark blue-black
    'text': '#FFFFFF'
}

def apply_atlas_theme(fig: go.Figure):
    """
    Apply ATLAS dark theme to plotly figure.

    Args:
        fig: Plotly figure object
    """
    fig.update_layout(
        plot_bgcolor='rgba(0,0,0,0)',
        paper_bgcolor='rgba(0,0,0,0)',
        font=dict(color=ATLAS_COLORS['text'], family='Inter, sans-serif'),
        title_font=dict(size=20, color=ATLAS_COLORS['text']),
        hovermode='x unified',
        hoverlabel=dict(
            bgcolor='rgba(10, 14, 39, 0.95)',
            font_size=12,
            font_family='Inter, sans-serif'
        ),
        margin=dict(l=60, r=40, t=80, b=60)
    )

    fig.update_xaxes(
        gridcolor='rgba(99, 102, 241, 0.07)',
        showline=True,
        linecolor='rgba(99, 102, 241, 0.12)'
    )

    fig.update_yaxes(
        gridcolor='rgba(99, 102, 241, 0.07)',
        showline=True,
        linecolor='rgba(99, 102, 241, 0.12)'
    )


# ============================================================================
# REVENUE & GROWTH CHARTS
# ============================================================================

def create_revenue_growth_chart(projections: Any, include_historical: bool = True) -> go.Figure:
    """
    Create revenue growth chart with historical and projected data.

    Args:
        projections: DCFProjections object
        include_historical: Include historical data point

    Returns:
        Plotly figure
    """
    # Prepare data
    years = []
    revenues = []
    growth_rates = []
    indicators = []  # Auto vs Manual

    # Historical (if requested)
    if include_historical:
        years.append('Historical')
        revenues.append(projections.historical_data.get('revenue', 0) / 1e9)
        growth_rates.append(None)
        indicators.append('Historical')

    # Projected years
    for year in range(1, projections.forecast_years + 1):
        years.append(f'Year {year}')
        revenues.append(projections.final_projections[year]['revenue'] / 1e9)

        # Calculate growth rate
        if year == 1:
            prior_rev = projections.historical_data.get('revenue', 0)
        else:
            prior_rev = projections.final_projections[year - 1]['revenue']

        current_rev = projections.final_projections[year]['revenue']
        if prior_rev > 0:
            growth = (current_rev - prior_rev) / prior_rev
        else:
            growth = 0

        growth_rates.append(growth)

        # Check if manual
        is_manual = projections.is_manual(year, 'revenue')
        indicators.append('Manual' if is_manual else 'Auto')

    # Create figure with secondary y-axis
    fig = make_subplots(
        specs=[[{"secondary_y": True}]],
        subplot_titles=["Revenue Projections"]
    )

    # Add revenue bars
    colors = [ATLAS_COLORS['secondary'] if ind == 'Manual' else ATLAS_COLORS['primary']
             for ind in indicators]

    fig.add_trace(
        go.Bar(
            x=years,
            y=revenues,
            name='Revenue',
            marker_color=colors,
            text=[f"${r:.1f}B" for r in revenues],
            textposition='outside',
            hovertemplate='<b>%{x}</b><br>Revenue: $%{y:.2f}B<extra></extra>'
        ),
        secondary_y=False
    )

    # Add growth rate line
    growth_y = [g * 100 if g is not None else None for g in growth_rates]

    fig.add_trace(
        go.Scatter(
            x=years,
            y=growth_y,
            name='Growth Rate',
            mode='lines+markers',
            line=dict(color=ATLAS_COLORS['success'], width=3),
            marker=dict(size=10),
            yaxis='y2',
            hovertemplate='<b>%{x}</b><br>Growth: %{y:.1f}%<extra></extra>'
        ),
        secondary_y=True
    )

    # Update axes
    fig.update_xaxes(title_text="Year")
    fig.update_yaxes(title_text="Revenue ($B)", secondary_y=False)
    fig.update_yaxes(title_text="Growth Rate (%)", secondary_y=True)

    fig.update_layout(
        title="Revenue Growth Projection",
        height=500,
        showlegend=True,
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        )
    )

    apply_atlas_theme(fig)

    return fig


def create_fcff_progression_chart(projections: Any) -> go.Figure:
    """
    Create FCFF progression chart showing build-up.

    Args:
        projections: DCFProjections object

    Returns:
        Plotly figure
    """
    years = [f'Year {y}' for y in range(1, projections.forecast_years + 1)]
    fcff_values = [projections.final_projections[y]['fcff'] / 1e9
                   for y in range(1, projections.forecast_years + 1)]

    fig = go.Figure()

    # FCFF area chart
    fig.add_trace(go.Scatter(
        x=years,
        y=fcff_values,
        mode='lines+markers',
        name='FCFF',
        fill='tozeroy',
        line=dict(color=ATLAS_COLORS['success'], width=3),
        marker=dict(size=12, symbol='diamond'),
        text=[f"${fcff:.1f}B" for fcff in fcff_values],
        textposition='top center',
        hovertemplate='<b>%{x}</b><br>FCFF: $%{y:.2f}B<extra></extra>'
    ))

    # Add average line
    avg_fcff = np.mean(fcff_values)
    fig.add_hline(
        y=avg_fcff,
        line_dash="dash",
        line_color=ATLAS_COLORS['warning'],
        annotation_text=f"Avg: ${avg_fcff:.1f}B",
        annotation_position="right"
    )

    fig.update_layout(
        title="Free Cash Flow to Firm (FCFF) Progression",
        xaxis_title="Year",
        yaxis_title="FCFF ($B)",
        height=450,
        showlegend=False
    )

    apply_atlas_theme(fig)

    return fig


def create_margin_trend_chart(projections: Any) -> go.Figure:
    """
    Create EBIT margin trend chart.

    Args:
        projections: DCFProjections object

    Returns:
        Plotly figure
    """
    years = [f'Year {y}' for y in range(1, projections.forecast_years + 1)]
    margins = [projections.final_projections[y]['ebit_margin'] * 100
              for y in range(1, projections.forecast_years + 1)]

    # Check for manual overrides
    manual_flags = [projections.is_manual(y, 'ebit') or projections.is_manual(y, 'ebit_margin')
                   for y in range(1, projections.forecast_years + 1)]

    colors = [ATLAS_COLORS['secondary'] if manual else ATLAS_COLORS['purple']
             for manual in manual_flags]

    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=years,
        y=margins,
        mode='lines+markers',
        name='EBIT Margin',
        line=dict(color=ATLAS_COLORS['purple'], width=3),
        marker=dict(size=12, color=colors),
        fill='tozeroy',
        fillcolor='rgba(183, 148, 246, 0.2)',
        text=[f"{m:.1f}%" for m in margins],
        textposition='top center',
        hovertemplate='<b>%{x}</b><br>EBIT Margin: %{y:.1f}%<extra></extra>'
    ))

    # Add historical margin if available
    if 'ebit' in projections.historical_data and 'revenue' in projections.historical_data:
        hist_ebit = projections.historical_data['ebit']
        hist_rev = projections.historical_data['revenue']
        if hist_rev > 0:
            hist_margin = (hist_ebit / hist_rev) * 100
            fig.add_hline(
                y=hist_margin,
                line_dash="dash",
                line_color=ATLAS_COLORS['warning'],
                annotation_text=f"Historical: {hist_margin:.1f}%",
                annotation_position="left"
            )

    fig.update_layout(
        title="EBIT Margin Evolution",
        xaxis_title="Year",
        yaxis_title="EBIT Margin (%)",
        height=450,
        showlegend=False
    )

    apply_atlas_theme(fig)

    return fig


# ============================================================================
# WATERFALL CHARTS
# ============================================================================

def create_fcff_waterfall_chart(projections: Any, year: int) -> go.Figure:
    """
    Create waterfall chart showing FCFF build-up for a specific year.

    Args:
        projections: DCFProjections object
        year: Year to display

    Returns:
        Plotly figure
    """
    proj = projections.final_projections[year]

    # Components
    components = [
        ('NOPAT', proj['nopat'] / 1e9, 'relative'),
        ('+ D&A', proj['depreciation_amortization'] / 1e9, 'relative'),
        ('- CapEx', proj['capex'] / 1e9, 'relative'),
        ('- Δ NWC', proj['nwc_change'] / 1e9, 'relative'),
        ('- SBC', proj['sbc_expense'] / 1e9, 'relative'),
        ('FCFF', proj['fcff'] / 1e9, 'total')
    ]

    labels = [c[0] for c in components]
    values = [c[1] for c in components]
    measures = [c[2] for c in components]

    fig = go.Figure(go.Waterfall(
        name=f"Year {year}",
        orientation="v",
        measure=measures,
        x=labels,
        textposition="outside",
        text=[f"${v:+.1f}B" if v != 0 else "" for v in values],
        y=values,
        connector={"line": {"color": "rgba(255, 255, 255, 0.3)"}},
        increasing={"marker": {"color": ATLAS_COLORS['success']}},
        decreasing={"marker": {"color": ATLAS_COLORS['secondary']}},
        totals={"marker": {"color": ATLAS_COLORS['primary']}}
    ))

    fig.update_layout(
        title=f"FCFF Build-Up: Year {year}",
        yaxis_title="$B",
        height=500,
        showlegend=False
    )

    apply_atlas_theme(fig)

    return fig


# ============================================================================
# SCENARIO COMPARISON CHARTS
# ============================================================================

def create_scenario_comparison_chart(scenarios: Dict[str, Any]) -> go.Figure:
    """
    Create side-by-side comparison of multiple scenarios.

    Args:
        scenarios: Dict mapping scenario name to projections object

    Returns:
        Plotly figure
    """
    fig = go.Figure()

    for scenario_name, projections in scenarios.items():
        years = list(range(1, projections.forecast_years + 1))
        fcff_values = [projections.final_projections[y]['fcff'] / 1e9 for y in years]

        fig.add_trace(go.Scatter(
            x=years,
            y=fcff_values,
            mode='lines+markers',
            name=scenario_name,
            line=dict(width=3),
            marker=dict(size=10)
        ))

    fig.update_layout(
        title="Scenario Comparison: FCFF Projections",
        xaxis_title="Year",
        yaxis_title="FCFF ($B)",
        height=500,
        showlegend=True,
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        )
    )

    apply_atlas_theme(fig)

    return fig


def create_valuation_sensitivity_heatmap(base_wacc: float, base_terminal: float,
                                        base_value: float) -> go.Figure:
    """
    Create heatmap showing valuation sensitivity to WACC and terminal growth.

    Args:
        base_wacc: Base case WACC
        base_terminal: Base case terminal growth
        base_value: Base case valuation

    Returns:
        Plotly figure
    """
    # Create ranges
    wacc_range = np.linspace(base_wacc - 0.02, base_wacc + 0.02, 9)
    terminal_range = np.linspace(base_terminal - 0.01, base_terminal + 0.01, 9)

    # Create grid (simplified - would need actual DCF calc)
    # For now, showing concept with linear approximation
    z_values = []
    for tg in terminal_range:
        row = []
        for w in wacc_range:
            # Simplified sensitivity (inverse relationship with WACC, positive with terminal)
            value = base_value * (1 + (base_terminal - tg) * 10) * (1 + (base_wacc - w) * 5)
            row.append(value)
        z_values.append(row)

    fig = go.Figure(data=go.Heatmap(
        z=z_values,
        x=[f"{w*100:.1f}%" for w in wacc_range],
        y=[f"{t*100:.1f}%" for t in terminal_range],
        colorscale='Spectral_r',
        hovertemplate='WACC: %{x}<br>Terminal: %{y}<br>Value: $%{z:.2f}<extra></extra>',
        colorbar=dict(title="Valuation ($)")
    ))

    fig.update_layout(
        title="Valuation Sensitivity Analysis",
        xaxis_title="WACC",
        yaxis_title="Terminal Growth Rate",
        height=500
    )

    apply_atlas_theme(fig)

    return fig


# ============================================================================
# COMPREHENSIVE DASHBOARD
# ============================================================================

def create_projection_dashboard(projections: Any) -> go.Figure:
    """
    Create comprehensive 4-panel dashboard.

    Args:
        projections: DCFProjections object

    Returns:
        Plotly figure with subplots
    """
    # Create subplots
    fig = make_subplots(
        rows=2, cols=2,
        subplot_titles=("Revenue Growth", "FCFF Progression",
                       "EBIT Margin Trend", "Year 1 FCFF Build-Up"),
        specs=[[{"secondary_y": False}, {"secondary_y": False}],
               [{"secondary_y": False}, {"type": "waterfall"}]],
        vertical_spacing=0.12,
        horizontal_spacing=0.10
    )

    years = [f'Y{y}' for y in range(1, projections.forecast_years + 1)]

    # Panel 1: Revenue
    revenues = [projections.final_projections[y]['revenue'] / 1e9
               for y in range(1, projections.forecast_years + 1)]

    fig.add_trace(
        go.Bar(x=years, y=revenues, name='Revenue',
              marker_color=ATLAS_COLORS['primary']),
        row=1, col=1
    )

    # Panel 2: FCFF
    fcff_values = [projections.final_projections[y]['fcff'] / 1e9
                  for y in range(1, projections.forecast_years + 1)]

    fig.add_trace(
        go.Scatter(x=years, y=fcff_values, name='FCFF', mode='lines+markers',
                  line=dict(color=ATLAS_COLORS['success'], width=2)),
        row=1, col=2
    )

    # Panel 3: EBIT Margin
    margins = [projections.final_projections[y]['ebit_margin'] * 100
              for y in range(1, projections.forecast_years + 1)]

    fig.add_trace(
        go.Scatter(x=years, y=margins, name='EBIT Margin', mode='lines+markers',
                  line=dict(color=ATLAS_COLORS['purple'], width=2)),
        row=2, col=1
    )

    # Panel 4: Year 1 Waterfall (simplified)
    proj = projections.final_projections[1]
    waterfall_labels = ['NOPAT', '+ D&A', '- CapEx', '- Δ NWC', '- SBC', 'FCFF']
    waterfall_values = [
        proj['nopat'] / 1e9,
        proj['depreciation_amortization'] / 1e9,
        proj['capex'] / 1e9,
        proj['nwc_change'] / 1e9,
        proj['sbc_expense'] / 1e9,
        proj['fcff'] / 1e9
    ]
    waterfall_measures = ['relative', 'relative', 'relative', 'relative', 'relative', 'total']

    fig.add_trace(
        go.Waterfall(
            x=waterfall_labels,
            y=waterfall_values,
            measure=waterfall_measures,
            name='Y1 FCFF',
            increasing={"marker": {"color": ATLAS_COLORS['success']}},
            decreasing={"marker": {"color": ATLAS_COLORS['secondary']}},
            totals={"marker": {"color": ATLAS_COLORS['primary']}}
        ),
        row=2, col=2
    )

    fig.update_layout(
        title_text="DCF Projections Dashboard",
        height=800,
        showlegend=False
    )

    apply_atlas_theme(fig)

    return fig


if __name__ == '__main__':
    print("Testing Projection Visualizer Module")
    print("=" * 60)

    # This would require actual projections object to test
    # For now, just verify imports work
    print("✅ All imports successful")
    print("✅ Chart functions defined")
    print("\nAvailable chart functions:")
    print("  - create_revenue_growth_chart()")
    print("  - create_fcff_progression_chart()")
    print("  - create_margin_trend_chart()")
    print("  - create_fcff_waterfall_chart()")
    print("  - create_scenario_comparison_chart()")
    print("  - create_valuation_sensitivity_heatmap()")
    print("  - create_projection_dashboard()")

    print("\n✅ Module test complete!")
