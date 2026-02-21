"""
ATLAS Chart Styling System - Professional Blue Theme
=====================================================
Consistent chart themes and helpers for Plotly figures.

Usage:
    from ui.charts_professional import apply_atlas_theme, create_multi_line_chart

    fig = go.Figure(...)
    fig = apply_atlas_theme(fig, chart_type='line', title='My Chart')
    st.plotly_chart(fig)

Created: January 2026
Author: Hlobo & Claude
"""

import plotly.graph_objects as go
import pandas as pd
from typing import Dict, List, Optional, Any

# Import theme constants
from ui.theme import (
    ATLAS_COLORS,
    CHART_COLORS,
    CHART_FILLS,
    CHART_LAYOUT,
    CHART_HEIGHTS,
    FONTS,
    FONT_SIZES,
    get_color,
    get_semantic_color,
)


# =============================================================================
# MAIN THEME APPLICATION FUNCTION
# =============================================================================

def apply_atlas_theme(
    fig: go.Figure,
    chart_type: str = 'line',
    title: Optional[str] = None,
    height: Optional[int] = None
) -> go.Figure:
    """
    Apply ATLAS Professional Blue theme to any Plotly figure.

    Args:
        fig: Plotly figure object
        chart_type: One of 'line', 'bar', 'pie', 'gauge', 'waterfall', 'heatmap', 'scatter'
        title: Optional chart title
        height: Optional chart height (defaults from CHART_HEIGHTS)

    Returns:
        Styled Plotly figure

    Example:
        >>> fig = go.Figure(data=[go.Scatter(x=[1,2,3], y=[4,5,6])])
        >>> fig = apply_atlas_theme(fig, chart_type='line', title='My Chart')
        >>> st.plotly_chart(fig)
    """
    # Apply base layout
    fig.update_layout(**CHART_LAYOUT)

    # Set title if provided
    if title:
        fig.update_layout(title={'text': title})

    # Set height
    if height:
        fig.update_layout(height=height)
    elif chart_type in ['pie', 'gauge']:
        fig.update_layout(height=CHART_HEIGHTS['standard'])
    else:
        fig.update_layout(height=CHART_HEIGHTS['medium'])

    # Apply chart-specific styling
    style_functions = {
        'line': _style_line_chart,
        'bar': _style_bar_chart,
        'pie': _style_pie_chart,
        'gauge': _style_gauge_chart,
        'waterfall': _style_waterfall_chart,
        'heatmap': _style_heatmap_chart,
        'scatter': _style_scatter_chart,
    }

    if chart_type in style_functions:
        style_functions[chart_type](fig)

    return fig


# =============================================================================
# CHART-SPECIFIC STYLING FUNCTIONS
# =============================================================================

def _style_line_chart(fig: go.Figure) -> None:
    """Apply line chart specific styling - smooth curves with area fill."""
    for i, trace in enumerate(fig.data):
        if isinstance(trace, go.Scatter):
            trace.update(
                line={
                    'color': CHART_COLORS[i % len(CHART_COLORS)],
                    'width': 2.5,
                    'shape': 'spline',  # Smooth curves
                },
                mode='lines',
            )
            # Add area fill for first trace only
            if i == 0:
                trace.update(
                    fill='tozeroy',
                    fillcolor=CHART_FILLS[0],
                )


def _style_bar_chart(fig: go.Figure) -> None:
    """Apply bar chart specific styling - clean bars with no borders."""
    for i, trace in enumerate(fig.data):
        if isinstance(trace, go.Bar):
            # Check if values exist and determine colors based on positive/negative
            if hasattr(trace, 'y') and trace.y is not None:
                colors = [get_semantic_color(v) for v in trace.y]
                trace.update(
                    marker={
                        'color': colors if len(set(colors)) > 1 else ATLAS_COLORS['primary'],
                        'line': {'width': 0},  # No border
                    },
                )
            else:
                trace.update(
                    marker={
                        'color': CHART_COLORS[i % len(CHART_COLORS)],
                        'line': {'width': 0},
                    },
                )


def _style_pie_chart(fig: go.Figure) -> None:
    """Apply pie/donut chart specific styling - modern donut with clean colors."""
    for trace in fig.data:
        if isinstance(trace, go.Pie):
            trace.update(
                marker={
                    'colors': CHART_COLORS,
                    'line': {'color': 'rgba(15, 18, 35, 0.8)', 'width': 2},
                },
                hole=0.4,  # Donut style (modern look)
                textposition='outside',
                textinfo='label+percent',
                textfont={'size': FONT_SIZES['sm'], 'family': FONTS['family']},
                pull=[0.02] * len(trace.labels) if trace.labels else [],  # Slight separation
            )


def _style_gauge_chart(fig: go.Figure) -> None:
    """Apply gauge chart specific styling - color zones with primary needle."""
    for trace in fig.data:
        if isinstance(trace, go.Indicator) and trace.mode and 'gauge' in trace.mode:
            trace.update(
                gauge={
                    'axis': {
                        'tickwidth': 1,
                        'tickcolor': ATLAS_COLORS['light_medium'],
                        'tickfont': {'size': FONT_SIZES['xs'], 'color': ATLAS_COLORS['muted']},
                    },
                    'bar': {'color': ATLAS_COLORS['primary'], 'thickness': 0.75},
                    'bgcolor': ATLAS_COLORS['light'],
                    'borderwidth': 0,
                    'steps': [
                        {'range': [0, 33], 'color': ATLAS_COLORS['success_light']},
                        {'range': [33, 66], 'color': ATLAS_COLORS['warning_light']},
                        {'range': [66, 100], 'color': ATLAS_COLORS['danger_light']},
                    ],
                }
            )


def _style_waterfall_chart(fig: go.Figure) -> None:
    """Apply waterfall chart specific styling - semantic colors for increases/decreases."""
    for trace in fig.data:
        if isinstance(trace, go.Waterfall):
            trace.update(
                connector={'line': {'color': ATLAS_COLORS['muted'], 'width': 2}},
                increasing={'marker': {'color': ATLAS_COLORS['success']}},
                decreasing={'marker': {'color': ATLAS_COLORS['danger']}},
                totals={'marker': {'color': ATLAS_COLORS['primary']}},
                textposition='outside',
                textfont={
                    'size': FONT_SIZES['xs'],
                    'family': FONTS['mono'],
                },
            )


def _style_heatmap_chart(fig: go.Figure) -> None:
    """Apply heatmap chart specific styling - Spectral colorscale centered at 0."""
    for trace in fig.data:
        if isinstance(trace, go.Heatmap):
            trace.update(
                colorscale='Spectral_r',
                zmid=0,
                textfont={'size': FONT_SIZES['sm'], 'family': FONTS['family']},
                colorbar={
                    'tickfont': {'size': FONT_SIZES['xs'], 'color': ATLAS_COLORS['muted']},
                },
            )


def _style_scatter_chart(fig: go.Figure) -> None:
    """Apply scatter chart specific styling - sized markers with colors."""
    for i, trace in enumerate(fig.data):
        if isinstance(trace, go.Scatter) and trace.mode and 'markers' in trace.mode:
            trace.update(
                marker={
                    'color': CHART_COLORS[i % len(CHART_COLORS)],
                    'line': {'width': 1, 'color': 'rgba(15, 18, 35, 0.6)'},
                },
            )


# =============================================================================
# CHART BUILDER FUNCTIONS
# =============================================================================

def create_multi_line_chart(
    data_dict: Dict[str, Dict[str, Any]],
    title: Optional[str] = None,
    y_title: Optional[str] = None,
    show_legend: bool = True
) -> go.Figure:
    """
    Create styled multi-line chart (e.g., Portfolio vs Benchmark).

    Args:
        data_dict: Dict mapping series name to {'x': [...], 'y': [...]}
        title: Chart title
        y_title: Y-axis title
        show_legend: Whether to show legend

    Returns:
        Styled Plotly figure

    Example:
        >>> data = {
        ...     'Portfolio': {'x': dates, 'y': returns1},
        ...     'Benchmark': {'x': dates, 'y': returns2},
        ... }
        >>> fig = create_multi_line_chart(data, title='Performance')
    """
    fig = go.Figure()

    # Define styling for primary vs secondary series
    line_styles = [
        {'color': ATLAS_COLORS['primary'], 'width': 3, 'dash': 'solid'},
        {'color': ATLAS_COLORS['muted'], 'width': 2, 'dash': 'dash'},
        {'color': ATLAS_COLORS['secondary'], 'width': 2, 'dash': 'solid'},
        {'color': ATLAS_COLORS['warning'], 'width': 2, 'dash': 'dot'},
    ]

    for i, (name, data) in enumerate(data_dict.items()):
        style = line_styles[i % len(line_styles)]

        fig.add_trace(go.Scatter(
            x=data['x'],
            y=data['y'],
            name=name,
            line={'color': style['color'], 'width': style['width'], 'dash': style['dash'], 'shape': 'spline'},
            mode='lines',
            hovertemplate=f'<b>{name}</b><br>%{{x}}<br>%{{y:.2f}}%<extra></extra>',
        ))

        # Add area fill for first series
        if i == 0:
            fig.data[0].update(
                fill='tozeroy',
                fillcolor=get_color('primary', 0.15),
            )

    # Apply theme
    fig = apply_atlas_theme(fig, 'line', title)

    if y_title:
        fig.update_layout(yaxis_title=y_title)

    fig.update_layout(
        showlegend=show_legend,
        legend={
            'orientation': 'h',
            'yanchor': 'bottom',
            'y': 1.02,
            'xanchor': 'right',
            'x': 1,
        },
        hovermode='x unified',
    )

    return fig


def create_performance_chart(
    dates: List,
    portfolio_returns: List,
    benchmark_returns: Optional[List] = None,
    title: str = "Portfolio Performance",
    benchmark_label: str = "Benchmark"
) -> go.Figure:
    """
    Create a styled performance comparison chart.

    Args:
        dates: List of dates for x-axis
        portfolio_returns: Portfolio cumulative returns
        benchmark_returns: Optional benchmark returns
        title: Chart title
        benchmark_label: Label for benchmark series

    Returns:
        Styled Plotly figure
    """
    data_dict = {'Portfolio': {'x': dates, 'y': portfolio_returns}}

    if benchmark_returns is not None:
        data_dict[benchmark_label] = {'x': dates, 'y': benchmark_returns}

    return create_multi_line_chart(
        data_dict,
        title=title,
        y_title='Cumulative Return (%)',
    )


def create_bar_chart(
    categories: List[str],
    values: List[float],
    title: Optional[str] = None,
    horizontal: bool = False,
    show_values: bool = True,
    color_by_value: bool = True
) -> go.Figure:
    """
    Create a styled bar chart with semantic coloring.

    Args:
        categories: Category labels
        values: Numeric values
        title: Chart title
        horizontal: If True, creates horizontal bar chart
        show_values: If True, shows value labels on bars
        color_by_value: If True, colors bars green/red based on +/-

    Returns:
        Styled Plotly figure
    """
    # Determine colors
    if color_by_value:
        colors = [get_semantic_color(v) for v in values]
    else:
        colors = ATLAS_COLORS['primary']

    # Create bar trace
    if horizontal:
        fig = go.Figure(go.Bar(
            x=values,
            y=categories,
            orientation='h',
            marker={'color': colors, 'line': {'width': 0}},
            text=[f"{v:+.1f}%" for v in values] if show_values else None,
            textposition='outside',
            textfont={'size': FONT_SIZES['sm'], 'family': FONTS['mono']},
        ))
    else:
        fig = go.Figure(go.Bar(
            x=categories,
            y=values,
            marker={'color': colors, 'line': {'width': 0}},
            text=[f"{v:+.1f}%" for v in values] if show_values else None,
            textposition='outside',
            textfont={'size': FONT_SIZES['sm'], 'family': FONTS['mono']},
        ))

    return apply_atlas_theme(fig, 'bar', title)


def create_donut_chart(
    labels: List[str],
    values: List[float],
    title: Optional[str] = None
) -> go.Figure:
    """
    Create a styled donut chart for allocations.

    Args:
        labels: Segment labels
        values: Segment values
        title: Chart title

    Returns:
        Styled Plotly figure
    """
    fig = go.Figure(go.Pie(
        labels=labels,
        values=values,
        hole=0.4,
        marker={'colors': CHART_COLORS, 'line': {'color': 'rgba(15, 18, 35, 0.8)', 'width': 2}},
        textposition='outside',
        textinfo='label+percent',
        textfont={'size': FONT_SIZES['sm'], 'family': FONTS['family']},
        hovertemplate='<b>%{label}</b><br>$%{value:,.0f} (%{percent})<extra></extra>',
    ))

    return apply_atlas_theme(fig, 'pie', title)


def create_gauge_chart(
    value: float,
    title: str,
    min_val: float = 0,
    max_val: float = 100,
    thresholds: Optional[List[float]] = None
) -> go.Figure:
    """
    Create a styled gauge chart for metrics like risk scores.

    Args:
        value: Current value to display
        title: Gauge title
        min_val: Minimum value
        max_val: Maximum value
        thresholds: List of [low, mid] threshold values (defaults to [33, 66])

    Returns:
        Styled Plotly figure
    """
    if thresholds is None:
        thresholds = [33, 66]

    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=value,
        title={'text': title, 'font': {'size': FONT_SIZES['md'], 'color': ATLAS_COLORS['dark']}},
        number={'font': {'size': FONT_SIZES['2xl'], 'family': FONTS['mono'], 'color': ATLAS_COLORS['dark']}},
        gauge={
            'axis': {'range': [min_val, max_val]},
            'bar': {'color': ATLAS_COLORS['primary']},
            'bgcolor': ATLAS_COLORS['light'],
            'steps': [
                {'range': [min_val, thresholds[0]], 'color': ATLAS_COLORS['success_light']},
                {'range': [thresholds[0], thresholds[1]], 'color': ATLAS_COLORS['warning_light']},
                {'range': [thresholds[1], max_val], 'color': ATLAS_COLORS['danger_light']},
            ],
        }
    ))

    return apply_atlas_theme(fig, 'gauge', None, height=CHART_HEIGHTS['compact'])


def create_waterfall_chart(
    categories: List[str],
    values: List[float],
    title: Optional[str] = None,
    measure: Optional[List[str]] = None
) -> go.Figure:
    """
    Create a styled waterfall chart (DCF valuation, attribution).

    Args:
        categories: Category labels
        values: Numeric values
        title: Chart title
        measure: List of 'relative', 'total', or 'absolute' per bar

    Returns:
        Styled Plotly figure
    """
    if measure is None:
        # Default: last item is total, rest are relative
        measure = ['relative'] * (len(categories) - 1) + ['total']

    fig = go.Figure(go.Waterfall(
        x=categories,
        y=values,
        measure=measure,
        connector={'line': {'color': ATLAS_COLORS['muted'], 'width': 2}},
        increasing={'marker': {'color': ATLAS_COLORS['success']}},
        decreasing={'marker': {'color': ATLAS_COLORS['danger']}},
        totals={'marker': {'color': ATLAS_COLORS['primary']}},
        text=[f"{v:+,.0f}" for v in values],
        textposition='outside',
        textfont={'size': FONT_SIZES['sm'], 'family': FONTS['mono']},
    ))

    return apply_atlas_theme(fig, 'waterfall', title)


# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    # Main function
    'apply_atlas_theme',

    # Chart builders
    'create_multi_line_chart',
    'create_performance_chart',
    'create_bar_chart',
    'create_donut_chart',
    'create_gauge_chart',
    'create_waterfall_chart',
]
