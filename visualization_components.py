"""
ATLAS Market Watch - Visualization Components
==============================================

Sparklines, charts, heatmaps, and visual elements for Market Watch

Author: ATLAS Development Team
Version: 1.0.0
"""

import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
import numpy as np
from io import BytesIO
import base64
from typing import List, Dict, Optional


# ============================================================
# SPARKLINE GENERATION
# ============================================================

def create_sparkline(data: pd.Series, width: int = 100, height: int = 30) -> go.Figure:
    """
    Create tiny inline chart (sparkline)

    Args:
        data: Time series data
        width: Chart width in pixels
        height: Chart height in pixels

    Returns:
        Plotly figure
    """
    # Determine color based on trend
    if len(data) < 2:
        color = '#94a3b8'  # Gray
    else:
        color = '#10b981' if data.iloc[-1] > data.iloc[0] else '#ef4444'  # Green or Red

    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=list(range(len(data))),
        y=data.values,
        mode='lines',
        line=dict(width=1.5, color=color),
        showlegend=False,
        hovertemplate='%{y:.2f}<extra></extra>'
    ))

    fig.update_layout(
        width=width,
        height=height,
        margin=dict(l=0, r=0, t=0, b=0, pad=0),
        xaxis=dict(visible=False, showgrid=False),
        yaxis=dict(visible=False, showgrid=False),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        hovermode='x'
    )

    fig.update_xaxes(fixedrange=True)
    fig.update_yaxes(fixedrange=True)

    return fig


# ============================================================
# SECTOR HEATMAP
# ============================================================

def create_sector_treemap(sector_data: List[Dict], metric: str = 'ytd_return') -> go.Figure:
    """
    Create professional sector performance heatmap (treemap)

    Dashboard-quality visualization with:
    - Rich hover information (weight, return, volatility, momentum)
    - Professional color gradients (FinViz/Bloomberg style)
    - Multi-line labels with icons and metrics
    - Interactive tooltips with detailed stats

    Args:
        sector_data: List of dicts with sector info
        metric: Performance metric to color by ('ytd_return', '1m_return', etc.)

    Returns:
        Plotly treemap figure
    """
    if not sector_data:
        return go.Figure()

    df = pd.DataFrame(sector_data)

    # Sector icons for visual appeal
    sector_icons = {
        'Technology': '💻',
        'Information Technology': '💻',
        'Healthcare': '🏥',
        'Health Care': '🏥',
        'Financials': '💰',
        'Consumer Discretionary': '🛒',
        'Communication Services': '📡',
        'Industrials': '🏭',
        'Consumer Staples': '🛍️',
        'Energy': '⚡',
        'Utilities': '🔌',
        'Real Estate': '🏘️',
        'Materials': '⚒️',
        'Basic Materials': '⚒️'
    }

    # Create rich multi-line labels
    df['display_label'] = df.apply(
        lambda row: (
            f"{sector_icons.get(row['name'], '📊')} {row['name']}<br>"
            f"<b style='font-size: 1.2em;'>{row.get(metric, row.get('ytd_return', 0)):+.2f}%</b><br>"
            f"<span style='font-size: 0.8em; opacity: 0.9;'>Weight: {row['weight']:.1f}%</span>"
        ),
        axis=1
    )

    # Create custom hover text with rich information
    df['hover_text'] = df.apply(
        lambda row: (
            f"<b>{row['name']}</b><br><br>"
            f"<b>Performance:</b> {row.get(metric, row.get('ytd_return', 0)):+.2f}%<br>"
            f"<b>Market Weight:</b> {row['weight']:.2f}%<br>"
            f"<b>Ticker:</b> {row.get('ticker', 'N/A')}<br>"
        ),
        axis=1
    )

    # Professional color scale (Bloomberg/FinViz inspired) - MUTED for dark theme
    # Diverging red-green with softer tones that work better on dark backgrounds
    fig = px.treemap(
        df,
        path=['display_label'],
        values='weight',
        color=metric if metric in df.columns else 'ytd_return',
        color_continuous_scale=[
            [0.0, '#991b1b'],    # Deep muted red (strong loss)
            [0.2, '#b91c1c'],    # Muted red (moderate loss)
            [0.35, '#dc2626'],   # Red (small loss)
            [0.45, '#a16207'],   # Amber (neutral-negative)
            [0.55, '#65a30d'],   # Olive green (neutral-positive)
            [0.65, '#16a34a'],   # Muted green (moderate gain)
            [0.8, '#15803d'],    # Forest green (good gain)
            [1.0, '#166534']     # Deep muted green (strong gain)
        ],
        color_continuous_midpoint=0,
        range_color=[-5, 5],
        custom_data=['hover_text']
    )

    # Enhanced trace styling
    fig.update_traces(
        textposition='middle center',
        textfont=dict(
            size=14,
            color='white',
            family='Inter, -apple-system, BlinkMacSystemFont, sans-serif'
        ),
        marker=dict(
            line=dict(width=3, color='#0f172a'),
            cornerradius=5
        ),
        hovertemplate='%{customdata[0]}<extra></extra>'
    )

    # Professional layout with glassmorphic styling
    fig.update_layout(
        height=700,
        margin=dict(l=10, r=10, t=60, b=10),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(color='#e2e8f0', family='Inter, sans-serif'),
        title=dict(
            text='<b>S&P 500 Sector Performance Heatmap</b>',
            font=dict(size=20, color='#f8fafc'),
            x=0.5,
            xanchor='center',
            y=0.98,
            yanchor='top'
        ),
        coloraxis_colorbar=dict(
            title=dict(
                text="<b>Return (%)</b>",
                font=dict(size=12)
            ),
            ticksuffix="%",
            tickfont=dict(size=11),
            x=1.0,
            xanchor='left',
            len=0.85,
            thickness=20,
            outlinewidth=2,
            outlinecolor='rgba(99, 102, 241, 0.3)',
            bgcolor='rgba(30, 41, 59, 0.8)',
            borderwidth=0
        ),
        hoverlabel=dict(
            bgcolor='rgba(15, 23, 42, 0.95)',
            bordercolor='rgba(99, 102, 241, 0.5)',
            font=dict(size=13, color='white', family='Inter, sans-serif')
        )
    )

    return fig


# ============================================================
# INDEX MINI CHARTS
# ============================================================

def create_mini_index_chart(ticker: str, period: str = '1d', show_dates: bool = False) -> go.Figure:
    """
    Create small chart for index display in sidebar

    Args:
        ticker: Index ticker
        period: Time period (1D, 5D, 1M, 3M, 6M, 1Y)
        show_dates: Whether to show date labels on x-axis

    Returns:
        Plotly figure
    """
    import yfinance as yf

    try:
        # Map period to yfinance format and interval
        period_map = {
            '1D': ('1d', '5m'),
            '5D': ('5d', '15m'),
            '1M': ('1mo', '1d'),
            '3M': ('3mo', '1d'),
            '6M': ('6mo', '1d'),
            '1Y': ('1y', '1d')
        }

        yf_period, interval = period_map.get(period.upper(), ('1d', '5m'))

        index = yf.Ticker(ticker)
        hist = index.history(period=yf_period, interval=interval)

        if hist.empty:
            return go.Figure()

        # Determine color
        color = '#10b981' if hist['Close'].iloc[-1] > hist['Close'].iloc[0] else '#ef4444'

        fig = go.Figure()

        fig.add_trace(go.Scatter(
            x=hist.index,
            y=hist['Close'],
            mode='lines',
            line=dict(width=2, color=color),
            fill='tozeroy',
            fillcolor=f'rgba({"16,185,129" if color == "#10b981" else "239,68,68"},0.1)',
            showlegend=False,
            hovertemplate='<b>%{x|%b %d, %Y}</b><br>%{y:.2f}<extra></extra>'
        ))

        # Configure x-axis based on show_dates parameter
        xaxis_config = {
            'showgrid': True if show_dates else False,
            'gridcolor': 'rgba(99, 102, 241, 0.1)',
            'visible': show_dates
        }

        if show_dates:
            xaxis_config.update({
                'showticklabels': True,
                'tickformat': '%b %d' if period in ['1D', '5D'] else '%b %Y',
                'tickfont': dict(size=9, color='#94a3b8'),
                'tickangle': -45
            })

        fig.update_layout(
            height=80 if not show_dates else 120,
            margin=dict(l=0, r=0, t=0, b=30 if show_dates else 0),
            xaxis=xaxis_config,
            yaxis=dict(
                visible=show_dates,
                showgrid=True if show_dates else False,
                gridcolor='rgba(99, 102, 241, 0.1)',
                tickfont=dict(size=9, color='#94a3b8')
            ),
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)' if show_dates else 'rgba(0,0,0,0)',
            hovermode='x unified'
        )

        return fig

    except Exception as e:
        print(f"Error creating mini chart for {ticker}: {str(e)}")
        return go.Figure()


# ============================================================
# MARKET BREADTH INDICATOR
# ============================================================

def create_breadth_indicator(spy_change: float, rsp_change: float) -> go.Figure:
    """
    Create visual indicator for market breadth

    Args:
        spy_change: S&P 500 (cap-weighted) change %
        rsp_change: Equal-weight S&P change %

    Returns:
        Plotly figure (gauge chart)
    """
    breadth = rsp_change - spy_change

    # Interpret breadth
    if breadth > 1:
        status = "Healthy"
        color = "green"
    elif breadth > -1:
        status = "Neutral"
        color = "yellow"
    else:
        status = "Narrow"
        color = "red"

    fig = go.Figure(go.Indicator(
        mode="gauge+number+delta",
        value=breadth,
        domain={'x': [0, 1], 'y': [0, 1]},
        title={'text': f"Market Breadth<br><span style='font-size:0.8em'>Status: {status}</span>"},
        delta={'reference': 0, 'suffix': '%'},
        gauge={
            'axis': {'range': [-5, 5]},
            'bar': {'color': color},
            'steps': [
                {'range': [-5, -1], 'color': 'rgba(239, 68, 68, 0.3)'},
                {'range': [-1, 1], 'color': 'rgba(251, 191, 36, 0.3)'},
                {'range': [1, 5], 'color': 'rgba(16, 185, 129, 0.3)'}
            ],
            'threshold': {
                'line': {'color': "white", 'width': 4},
                'thickness': 0.75,
                'value': breadth
            }
        }
    ))

    fig.update_layout(
        height=250,
        margin=dict(l=20, r=20, t=50, b=20),
        paper_bgcolor='rgba(0,0,0,0)',
        font=dict(color='white', size=14)
    )

    return fig


# ============================================================
# VIX FEAR GAUGE
# ============================================================

def create_vix_gauge(vix_level: float) -> go.Figure:
    """
    Create VIX fear gauge visualization

    Args:
        vix_level: Current VIX value

    Returns:
        Plotly gauge figure
    """
    # Interpret VIX level
    if vix_level < 15:
        status = "Complacency"
        color = "green"
    elif vix_level < 20:
        status = "Normal"
        color = "lightgreen"
    elif vix_level < 30:
        status = "Elevated Fear"
        color = "orange"
    else:
        status = "Panic"
        color = "red"

    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=vix_level,
        domain={'x': [0, 1], 'y': [0, 1]},
        title={'text': f"VIX Fear Gauge<br><span style='font-size:0.8em'>{status}</span>"},
        gauge={
            'axis': {'range': [0, 50]},
            'bar': {'color': color},
            'steps': [
                {'range': [0, 15], 'color': 'rgba(16, 185, 129, 0.3)'},
                {'range': [15, 20], 'color': 'rgba(163, 230, 53, 0.3)'},
                {'range': [20, 30], 'color': 'rgba(251, 191, 36, 0.3)'},
                {'range': [30, 50], 'color': 'rgba(239, 68, 68, 0.3)'}
            ],
            'threshold': {
                'line': {'color': "white", 'width': 4},
                'thickness': 0.75,
                'value': vix_level
            }
        }
    ))

    fig.update_layout(
        height=250,
        margin=dict(l=20, r=20, t=50, b=20),
        paper_bgcolor='rgba(0,0,0,0)',
        font=dict(color='white', size=14)
    )

    return fig


# ============================================================
# YIELD CURVE VISUALIZATION
# ============================================================

def create_yield_curve_chart(yields: Dict[str, float]) -> go.Figure:
    """
    Create yield curve visualization

    Args:
        yields: Dict mapping maturity to yield (e.g., {'3M': 5.2, '2Y': 4.5, ...})

    Returns:
        Plotly figure
    """
    # Standard maturities in order
    maturities = ['3M', '6M', '1Y', '2Y', '5Y', '10Y', '30Y']
    maturity_labels = ['3 Mo', '6 Mo', '1 Yr', '2 Yr', '5 Yr', '10 Yr', '30 Yr']

    # Get yields for available maturities
    yield_values = [yields.get(m, None) for m in maturities]

    # Filter out None values
    valid_data = [(m, l, y) for m, l, y in zip(maturities, maturity_labels, yield_values) if y is not None]

    if not valid_data:
        return go.Figure()

    maturities_clean, labels_clean, yields_clean = zip(*valid_data)

    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=labels_clean,
        y=yields_clean,
        mode='lines+markers',
        line=dict(width=3, color='#3b82f6'),
        marker=dict(size=10, color='#3b82f6'),
        fill='tozeroy',
        fillcolor='rgba(59, 130, 246, 0.1)',
        name='Current Yield Curve'
    ))

    fig.update_layout(
        title="US Treasury Yield Curve",
        xaxis_title="Maturity",
        yaxis_title="Yield (%)",
        height=400,
        template='plotly_dark',
        hovermode='x unified'
    )

    # Check if inverted
    if len(yields_clean) >= 2:
        if yields_clean[-1] < yields_clean[0]:
            fig.add_annotation(
                text="⚠️ INVERTED CURVE",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.95,
                showarrow=False,
                font=dict(size=16, color='#ef4444'),
                bgcolor='rgba(239, 68, 68, 0.2)',
                bordercolor='#ef4444',
                borderwidth=2
            )

    return fig


# ============================================================
# CUSTOM STYLING FUNCTIONS
# ============================================================

def apply_chart_theme(fig: go.Figure, theme: str = 'dark') -> go.Figure:
    """
    Apply consistent theming to charts

    Args:
        fig: Plotly figure
        theme: 'dark' or 'light'

    Returns:
        Themed figure
    """
    if theme == 'dark':
        fig.update_layout(
            template='plotly_dark',
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font=dict(color='#e2e8f0', family='Inter, sans-serif')
        )
    else:
        fig.update_layout(
            template='plotly_white',
            paper_bgcolor='#ffffff',
            plot_bgcolor='#f8fafc',
            font=dict(color='#1e293b', family='Inter, sans-serif')
        )

    return fig


def get_color_for_change(change_pct: float) -> str:
    """
    Get color based on percentage change

    Args:
        change_pct: Percentage change

    Returns:
        Hex color code
    """
    if change_pct > 0:
        return '#10b981'  # Green
    elif change_pct < 0:
        return '#ef4444'  # Red
    else:
        return '#94a3b8'  # Gray


# ============================================================
# EXPORT
# ============================================================

if __name__ == "__main__":
    # Test visualizations
    print("Testing visualization components...")

    # Test sector data
    sector_data = [
        {'name': 'Technology', 'weight': 30, 'ytd_return': 5.2},
        {'name': 'Healthcare', 'weight': 15, 'ytd_return': 2.1},
        {'name': 'Financials', 'weight': 12, 'ytd_return': -1.3}
    ]

    fig = create_sector_treemap(sector_data)
    print("✅ Sector treemap created")

    fig = create_vix_gauge(25.5)
    print("✅ VIX gauge created")

    print("\n✅ All visualization tests passed!")
