"""
Visualization Themes Module
Handles chart theming and consistent visual styling
"""

import plotly.graph_objects as go
from plotly.subplots import make_subplots
from typing import Optional
import logging

from ..config import COLORS, CHART_THEME

logger = logging.getLogger(__name__)


def apply_chart_theme(fig: go.Figure) -> go.Figure:
    """
    Apply ATLAS dark theme to any Plotly figure

    Args:
        fig: Plotly figure object

    Returns:
        Figure with theme applied
    """
    try:
        fig.update_layout(
            paper_bgcolor='rgba(0, 0, 0, 0)',
            plot_bgcolor='rgba(10, 25, 41, 0.3)',
            font=dict(color=COLORS['text_primary'], family='Inter, sans-serif'),
            xaxis=dict(
                gridcolor=COLORS['chart_grid'],
                linecolor=COLORS['chart_grid'],
                zerolinecolor=COLORS['chart_grid']
            ),
            yaxis=dict(
                gridcolor=COLORS['chart_grid'],
                linecolor=COLORS['chart_grid'],
                zerolinecolor=COLORS['chart_grid']
            )
        )
    except Exception as e:
        logger.warning(f"Error applying chart theme: {e}")

    return fig


def get_gain_loss_color(value: float, inverted: bool = False) -> str:
    """
    Get color based on positive/negative value

    Args:
        value: Numeric value
        inverted: If True, negative is good (e.g., for volatility)

    Returns:
        Color hex string
    """
    if inverted:
        return COLORS['success'] if value < 0 else COLORS['danger']
    else:
        return COLORS['success'] if value > 0 else COLORS['danger']


def create_custom_legend(fig: go.Figure,
                        orientation: str = "v",
                        x: float = 1.02,
                        y: float = 1.0) -> go.Figure:
    """
    Add custom styled legend to figure

    Args:
        fig: Plotly figure
        orientation: 'v' for vertical, 'h' for horizontal
        x: X position
        y: Y position

    Returns:
        Figure with legend
    """
    fig.update_layout(
        showlegend=True,
        legend=dict(
            orientation=orientation,
            yanchor="top" if orientation == "v" else "bottom",
            y=y,
            xanchor="left" if orientation == "v" else "right",
            x=x,
            bgcolor='rgba(10, 25, 41, 0.8)',
            bordercolor=COLORS['border'],
            borderwidth=1,
            font=dict(size=11, color=COLORS['text_primary'])
        )
    )
    return fig


def add_zero_line(fig: go.Figure, axis: str = "y") -> go.Figure:
    """
    Add emphasized zero reference line

    Args:
        fig: Plotly figure
        axis: 'x' or 'y'

    Returns:
        Figure with zero line
    """
    if axis == "y":
        fig.add_hline(
            y=0,
            line_dash="solid",
            line_color=COLORS['text_muted'],
            line_width=2
        )
    elif axis == "x":
        fig.add_vline(
            x=0,
            line_dash="solid",
            line_color=COLORS['text_muted'],
            line_width=2
        )

    return fig


def create_gradient_colorscale(colors: list, n_steps: int = 100) -> list:
    """
    Create gradient colorscale from list of colors

    Args:
        colors: List of color hex strings
        n_steps: Number of gradient steps

    Returns:
        Plotly colorscale list
    """
    n_colors = len(colors)
    step_size = 1.0 / (n_colors - 1)

    colorscale = []
    for i, color in enumerate(colors):
        position = i * step_size
        colorscale.append([position, color])

    return colorscale


def style_metric_card(title: str,
                     value: str,
                     delta: Optional[str] = None,
                     color: Optional[str] = None) -> str:
    """
    Generate HTML for styled metric card

    Args:
        title: Metric title
        value: Metric value
        delta: Optional delta/change value
        color: Optional color override

    Returns:
        HTML string
    """
    if color is None:
        color = COLORS['neon_blue']

    delta_html = ""
    if delta is not None:
        delta_html = f"<div style='color: {COLORS['text_secondary']}; font-size: 14px; margin-top: 5px;'>{delta}</div>"

    return f"""
    <div style='background: linear-gradient(135deg, {COLORS['card_background']} 0%, {COLORS['card_background_alt']} 100%);
                border: 2px solid {color};
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 0 30px {COLORS['shadow']};
                text-align: center;'>
        <div style='color: {COLORS['text_muted']}; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;'>{title}</div>
        <div style='color: {color}; font-size: 32px; font-weight: 700; margin: 10px 0;'>{value}</div>
        {delta_html}
    </div>
    """


def create_gauge_chart(value: float,
                      max_value: float = 100,
                      title: str = "",
                      thresholds: list = [60, 80, 100],
                      colors: list = ['green', 'yellow', 'red']) -> go.Figure:
    """
    Create gauge chart for monitoring metrics

    Args:
        value: Current value
        max_value: Maximum value
        title: Chart title
        thresholds: List of threshold values
        colors: List of colors for each threshold zone

    Returns:
        Plotly gauge figure
    """
    # Map colors to actual hex codes
    color_map = {
        'green': COLORS['success'],
        'yellow': COLORS['warning'],
        'red': COLORS['danger'],
        'blue': COLORS['neon_blue']
    }

    steps = []
    for i, threshold in enumerate(thresholds):
        prev_threshold = 0 if i == 0 else thresholds[i-1]
        color = color_map.get(colors[i], colors[i])

        steps.append({
            'range': [prev_threshold, threshold],
            'color': color,
            'thickness': 0.75
        })

    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=value,
        title={'text': title, 'font': {'size': 18, 'color': COLORS['text_primary']}},
        number={'suffix': "%", 'font': {'size': 36, 'color': COLORS['neon_blue']}},
        gauge={
            'axis': {'range': [0, max_value], 'tickcolor': COLORS['text_primary']},
            'bar': {'color': COLORS['neon_blue'], 'thickness': 0.3},
            'steps': steps,
            'threshold': {
                'line': {'color': COLORS['danger'], 'width': 4},
                'thickness': 0.75,
                'value': value
            }
        }
    ))

    fig.update_layout(height=300)
    apply_chart_theme(fig)

    return fig
