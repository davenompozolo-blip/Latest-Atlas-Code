"""
ATLAS Terminal - Enhanced Plotly Chart Theme
Phase 2A - Glassmorphism Chart Styling

Custom Plotly templates and chart builders with subtle glow effects,
transparent backgrounds, and indigo/cyan color schemes.

Created: December 2024
Phase: 2A - Component Transformation
Author: Hlobo & Claude
"""

import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import pandas as pd
from typing import Optional, List, Dict, Any


# ==================== GLASSMORPHISM COLOR PALETTE ====================

ATLAS_COLORS = {
    # Backgrounds — transparent for glassmorphism
    'bg_dark': 'rgba(0,0,0,0)',
    'bg_plot': 'rgba(0,0,0,0)',
    'bg_card': 'rgba(15, 18, 35, 0.6)',

    # Primary Palette (Indigo family)
    'vibranium': '#818cf8',
    'indigo': '#6366f1',
    'purple': '#8b5cf6',
    'cyan': '#818cf8',
    'pink': '#ec4899',

    # Semantic Colors
    'success': '#10b981',
    'warning': '#f59e0b',
    'danger': '#ef4444',
    'info': '#6366f1',

    # Text
    'text_primary': '#e2e8f0',
    'text_secondary': '#94a3b8',
    'text_muted': '#64748b',

    # Grid & Borders
    'grid': 'rgba(99, 102, 241, 0.07)',
    'border': 'rgba(99, 102, 241, 0.12)',
}

# Color sequence for multi-series charts
COLOR_SEQUENCE = [
    ATLAS_COLORS['vibranium'],
    ATLAS_COLORS['indigo'],
    ATLAS_COLORS['purple'],
    ATLAS_COLORS['cyan'],
    ATLAS_COLORS['pink'],
    ATLAS_COLORS['success'],
    ATLAS_COLORS['warning'],
    ATLAS_COLORS['info'],
]


# ==================== PLOTLY TEMPLATE ====================

ATLAS_TEMPLATE = go.layout.Template(
    layout=go.Layout(
        # Background colors
        paper_bgcolor=ATLAS_COLORS['bg_dark'],
        plot_bgcolor=ATLAS_COLORS['bg_plot'],

        # Fonts
        font=dict(
            family='Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            size=12,
            color=ATLAS_COLORS['text_primary']
        ),

        # Title styling
        title=dict(
            font=dict(
                size=18,
                color=ATLAS_COLORS['text_primary'],
                family='Inter, sans-serif'
            ),
            x=0.5,
            xanchor='center'
        ),

        # Color sequence
        colorway=COLOR_SEQUENCE,

        # Axes styling
        xaxis=dict(
            gridcolor=ATLAS_COLORS['grid'],
            linecolor=ATLAS_COLORS['border'],
            color=ATLAS_COLORS['text_secondary'],
            zerolinecolor=ATLAS_COLORS['border'],
            showgrid=True,
            zeroline=True
        ),
        yaxis=dict(
            gridcolor=ATLAS_COLORS['grid'],
            linecolor=ATLAS_COLORS['border'],
            color=ATLAS_COLORS['text_secondary'],
            zerolinecolor=ATLAS_COLORS['border'],
            showgrid=True,
            zeroline=True
        ),

        # Hover styling — frosted tooltip
        hoverlabel=dict(
            bgcolor='rgba(15, 18, 35, 0.9)',
            font=dict(
                family='JetBrains Mono, Consolas, monospace',
                color=ATLAS_COLORS['text_primary']
            ),
            bordercolor=ATLAS_COLORS['indigo']
        ),

        # Legend styling — semi-transparent
        legend=dict(
            bgcolor='rgba(15, 18, 35, 0.6)',
            bordercolor=ATLAS_COLORS['border'],
            borderwidth=1,
            font=dict(color=ATLAS_COLORS['text_primary'])
        ),

        # Margins
        margin=dict(l=60, r=40, t=80, b=60)
    )
)


# ==================== CHART BUILDERS ====================

def create_line_chart(
    df: pd.DataFrame,
    x_col: str,
    y_col: str,
    title: Optional[str] = None,
    glow: bool = True,
    fill: bool = False,
    color: str = None,
    line_width: int = 3
) -> go.Figure:
    """
    Create line chart with optional neon glow effect

    Args:
        df: DataFrame with data
        x_col: Column name for x-axis
        y_col: Column name for y-axis
        title: Chart title
        glow: Enable neon glow effect (default True)
        fill: Fill area under line (default False)
        color: Line color (default vibranium)
        line_width: Line width in pixels

    Returns:
        Plotly Figure with ATLAS styling
    """
    fig = go.Figure()

    line_color = color or ATLAS_COLORS['vibranium']

    # Glow layer (behind main line)
    if glow:
        fig.add_trace(go.Scatter(
            x=df[x_col],
            y=df[y_col],
            mode='lines',
            line=dict(
                color=line_color,
                width=line_width * 3,
            ),
            opacity=0.3,
            showlegend=False,
            hoverinfo='skip'
        ))

    # Main line
    fig.add_trace(go.Scatter(
        x=df[x_col],
        y=df[y_col],
        mode='lines',
        line=dict(
            color=line_color,
            width=line_width,
        ),
        fill='tonexty' if fill else None,
        fillcolor=f'rgba({int(line_color[1:3], 16)}, {int(line_color[3:5], 16)}, {int(line_color[5:7], 16)}, 0.1)' if fill else None,
        name=y_col
    ))

    # Apply template and title
    fig.update_layout(template=ATLAS_TEMPLATE)
    if title:
        fig.update_layout(title=title)

    return fig


def create_bar_chart(
    df: pd.DataFrame,
    x_col: str,
    y_col: str,
    title: Optional[str] = None,
    color_col: Optional[str] = None,
    gradient: bool = True
) -> go.Figure:
    """
    Create bar chart with gradient fills

    Args:
        df: DataFrame with data
        x_col: Column name for x-axis
        y_col: Column name for y-axis values
        title: Chart title
        color_col: Column for color coding
        gradient: Use gradient bar colors

    Returns:
        Plotly Figure with ATLAS styling
    """
    fig = go.Figure()

    if gradient:
        # Gradient bars (vibranium → indigo)
        colors = [ATLAS_COLORS['vibranium'] if val > 0 else ATLAS_COLORS['danger']
                  for val in df[y_col]]
    else:
        colors = ATLAS_COLORS['indigo']

    fig.add_trace(go.Bar(
        x=df[x_col],
        y=df[y_col],
        marker=dict(
            color=colors,
            line=dict(
                color=ATLAS_COLORS['border'],
                width=1
            )
        ),
        name=y_col
    ))

    fig.update_layout(template=ATLAS_TEMPLATE)
    if title:
        fig.update_layout(title=title)

    return fig


def create_performance_chart(
    dates: pd.Series,
    returns: pd.Series,
    title: str = "Cumulative Performance",
    benchmark_returns: Optional[pd.Series] = None,
    benchmark_label: str = "Benchmark"
) -> go.Figure:
    """
    Create performance line chart with glow effects

    Args:
        dates: Date series for x-axis
        returns: Portfolio returns (cumulative)
        title: Chart title
        benchmark_returns: Optional benchmark returns
        benchmark_label: Label for benchmark series

    Returns:
        Plotly Figure with dual-line comparison
    """
    fig = go.Figure()

    # Portfolio line with glow
    fig.add_trace(go.Scatter(
        x=dates,
        y=returns,
        mode='lines',
        line=dict(color=ATLAS_COLORS['vibranium'], width=8),
        opacity=0.3,
        showlegend=False,
        hoverinfo='skip'
    ))

    fig.add_trace(go.Scatter(
        x=dates,
        y=returns,
        mode='lines',
        line=dict(color=ATLAS_COLORS['vibranium'], width=3),
        fill='tonexty',
        fillcolor='rgba(129, 140, 248, 0.1)',
        name='Portfolio'
    ))

    # Benchmark line (if provided)
    if benchmark_returns is not None:
        fig.add_trace(go.Scatter(
            x=dates,
            y=benchmark_returns,
            mode='lines',
            line=dict(
                color=ATLAS_COLORS['text_muted'],
                width=2,
                dash='dash'
            ),
            name=benchmark_label
        ))

    fig.update_layout(
        template=ATLAS_TEMPLATE,
        title=title,
        yaxis_title='Cumulative Return (%)',
        xaxis_title='Date',
        hovermode='x unified'
    )

    return fig


def create_heatmap(
    data: pd.DataFrame,
    title: Optional[str] = None,
    colorscale: str = 'Spectral_r'
) -> go.Figure:
    """
    Create correlation/performance heatmap

    Args:
        data: DataFrame for heatmap
        title: Chart title
        colorscale: Plotly colorscale name

    Returns:
        Plotly Figure with heatmap
    """
    fig = go.Figure(data=go.Heatmap(
        z=data.values,
        x=data.columns,
        y=data.index,
        colorscale=colorscale,
        text=data.values,
        texttemplate='%{text:.2f}',
        textfont=dict(size=10),
        hoverongaps=False
    ))

    fig.update_layout(template=ATLAS_TEMPLATE)
    if title:
        fig.update_layout(title=title)

    return fig


def apply_neon_glow(fig: go.Figure, trace_index: int = 0) -> go.Figure:
    """
    Add neon glow effect to existing chart trace

    Args:
        fig: Existing Plotly figure
        trace_index: Index of trace to add glow to

    Returns:
        Figure with glow effect added
    """
    trace = fig.data[trace_index]

    # Create glow trace (duplicate with increased width and opacity)
    glow_trace = go.Scatter(
        x=trace.x,
        y=trace.y,
        mode='lines',
        line=dict(
            color=trace.line.color,
            width=trace.line.width * 3
        ),
        opacity=0.3,
        showlegend=False,
        hoverinfo='skip'
    )

    # Insert glow behind original trace
    fig.add_trace(glow_trace)
    fig.data = (glow_trace,) + fig.data[:-1]

    return fig


# ==================== COMPONENT TESTING ====================

if __name__ == "__main__":
    """
    Test chart theme and builders
    Run with: streamlit run ui/components/charts_theme.py
    """
    import streamlit as st
    import numpy as np

    st.set_page_config(
        page_title="ATLAS - Chart Theme Test",
        page_icon="📈",
        layout="wide",
        initial_sidebar_state="collapsed"
    )

    st.title("📈 ATLAS Chart Theme - Test Suite")
    st.markdown("---")

    # Sample data
    dates = pd.date_range('2023-01-01', periods=100, freq='D')
    np.random.seed(42)
    returns = np.cumsum(np.random.randn(100) * 0.5)
    benchmark = np.cumsum(np.random.randn(100) * 0.3)

    sample_df = pd.DataFrame({
        'Date': dates,
        'Portfolio': returns,
        'Benchmark': benchmark
    })

    # Test 1: Line chart with glow
    st.subheader("Line Chart with Neon Glow")
    fig1 = create_line_chart(
        sample_df,
        'Date',
        'Portfolio',
        title="Portfolio Returns with Glow Effect",
        glow=True,
        fill=True
    )
    st.plotly_chart(fig1, use_container_width=True)

    st.markdown("---")

    # Test 2: Performance comparison
    st.subheader("Performance Comparison Chart")
    fig2 = create_performance_chart(
        dates=sample_df['Date'],
        returns=sample_df['Portfolio'],
        benchmark_returns=sample_df['Benchmark'],
        title="Portfolio vs Benchmark"
    )
    st.plotly_chart(fig2, use_container_width=True)

    st.markdown("---")

    # Test 3: Bar chart
    st.subheader("Bar Chart with Gradient Colors")
    bar_df = pd.DataFrame({
        'Asset': ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'],
        'Return': [15.2, -3.4, 8.7, -1.2, 22.5]
    })
    fig3 = create_bar_chart(
        bar_df,
        'Asset',
        'Return',
        title="Asset Returns",
        gradient=True
    )
    st.plotly_chart(fig3, use_container_width=True)

    st.markdown("---")

    # Test 4: Heatmap
    st.subheader("Correlation Heatmap")
    corr_data = pd.DataFrame(
        np.random.randn(5, 5),
        columns=['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'],
        index=['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA']
    )
    corr_data = (corr_data + corr_data.T) / 2  # Make symmetric
    np.fill_diagonal(corr_data.values, 1)

    fig4 = create_heatmap(
        corr_data,
        title="Asset Correlation Matrix"
    )
    st.plotly_chart(fig4, use_container_width=True)

    st.markdown("---")
    st.success("✅ Chart theme test complete!")
    st.info("**Usage:** Import with `from ui.components.charts_theme import create_line_chart, create_performance_chart, ATLAS_TEMPLATE`")
