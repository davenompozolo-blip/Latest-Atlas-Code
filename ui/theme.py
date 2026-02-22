"""
ATLAS Design System V2.0 - Glassmorphism Dark Theme
====================================================
"One Living, Breathing Soul"

Complete design specification for visual consistency:
- Ambient dark background with frosted-glass panels
- Indigo/cyan accent palette
- Transparent chart backgrounds for seamless integration
- Semantic colors (green gains, red losses)

Created: January 2026
Author: Hlobo & Claude
"""

from typing import Dict, Optional

# =============================================================================
# COLOR PALETTE - Glassmorphism Dark Theme
# =============================================================================

ATLAS_COLORS = {
    # Core Brand Colors (Indigo family)
    'primary': '#6366f1',            # Indigo - main accent
    'primary_light': '#818cf8',      # Lighter indigo - hover states
    'primary_dark': '#4f46e5',       # Darker indigo - pressed states

    # Secondary Accent
    'secondary': '#8b5cf6',          # Purple - secondary actions
    'secondary_light': '#a78bfa',    # Light purple - accents

    # Semantic Colors (Data)
    'success': '#10b981',            # Emerald green - positive returns, gains
    'success_light': '#34d399',      # Light emerald - mild positive
    'warning': '#f59e0b',            # Amber - caution, neutral
    'warning_light': '#fbbf24',      # Light amber - mild caution
    'danger': '#ef4444',             # Red - losses, alerts
    'danger_light': '#f87171',       # Light red - mild negative

    # Dark Theme Colors — design spec
    'dark': '#07080f',               # bg-void
    'dark_medium': '#0b0d1a',        # bg-deep
    'dark_light': 'rgba(255,255,255,0.05)',  # bg-glass

    # Text Colors — design spec hierarchy
    'text_primary': 'rgba(255,255,255,0.92)',
    'text_secondary': 'rgba(255,255,255,0.52)',
    'text_muted': 'rgba(255,255,255,0.28)',
    'text_disabled': 'rgba(255,255,255,0.15)',

    # Borders (Indigo-tinted)
    'border': 'rgba(99, 102, 241, 0.15)',          # Subtle indigo border
    'border_hover': 'rgba(99, 102, 241, 0.3)',     # Hover border
    'border_glow': 'rgba(99, 102, 241, 0.25)',     # Glow border

    # Grid colors
    'grid': 'rgba(99, 102, 241, 0.08)',            # Subtle indigo grid
    'grid_dark': 'rgba(99, 102, 241, 0.04)',       # Very subtle grid

    # Chart backgrounds (TRANSPARENT for glassmorphism)
    'chart_bg': 'rgba(0,0,0,0)',     # Transparent plot area
    'paper_bg': 'rgba(0,0,0,0)',     # Transparent paper

    # Additional accent colors for charts
    'purple': '#8b5cf6',
    'pink': '#ec4899',
    'teal': '#14b8a6',
    'orange': '#f97316',
}

# Chart-specific color sequence (ordered by importance)
CHART_COLORS = [
    '#818cf8',  # Indigo (main data series)
    '#10b981',  # Emerald (positive series)
    '#8b5cf6',  # Purple (secondary series)
    '#f97316',  # Orange (warning series)
    '#ef4444',  # Red (negative series)
    '#14b8a6',  # Teal (additional)
    '#ec4899',  # Pink (additional)
    '#f59e0b',  # Amber (additional)
]

# Semi-transparent fills for area charts (12% opacity for glassmorphism)
CHART_FILLS = [
    'rgba(129, 140, 248, 0.12)',  # Indigo fill
    'rgba(16, 185, 129, 0.12)',   # Emerald fill
    'rgba(139, 92, 246, 0.12)',   # Purple fill
    'rgba(249, 115, 22, 0.12)',   # Orange fill
    'rgba(239, 68, 68, 0.12)',    # Red fill
    'rgba(20, 184, 166, 0.12)',   # Teal fill
]

# Gradient definitions (top to bottom)
CHART_GRADIENTS = {
    'primary': ['rgba(99, 102, 241, 0.25)', 'rgba(99, 102, 241, 0.0)'],
    'success': ['rgba(16, 185, 129, 0.25)', 'rgba(16, 185, 129, 0.0)'],
    'danger': ['rgba(239, 68, 68, 0.25)', 'rgba(239, 68, 68, 0.0)'],
}


# =============================================================================
# TYPOGRAPHY
# =============================================================================

FONTS = {
    'family': 'DM Sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'mono': 'Space Mono, "SF Mono", Monaco, Consolas, monospace',
    'display': 'Syne, sans-serif',
}

FONT_SIZES = {
    'xs': 10,     # Small labels, captions
    'sm': 12,     # Body text, chart labels
    'base': 14,   # Default body text
    'md': 16,     # Large body text
    'lg': 18,     # Small headings
    'xl': 20,     # Section headings
    '2xl': 24,    # Page titles
    '3xl': 28,    # Hero text
    '4xl': 32,    # Display text
}

FONT_WEIGHTS = {
    'normal': 400,
    'medium': 500,
    'semibold': 600,
    'bold': 700,
}


# =============================================================================
# SPACING SYSTEM (8px Grid)
# =============================================================================

SPACING = {
    'xs': 4,      # 0.5 × 8px
    'sm': 8,      # 1 × 8px
    'md': 16,     # 2 × 8px (DEFAULT)
    'lg': 24,     # 3 × 8px
    'xl': 32,     # 4 × 8px
    'xxl': 48,    # 6 × 8px
    '3xl': 64,    # 8 × 8px
}


# =============================================================================
# CARD STYLES - Glassmorphic Panels
# =============================================================================

CARD_STYLE = {
    'background': 'rgba(255,255,255,0.05)',
    'backdrop_filter': 'blur(16px)',
    'border': '1px solid rgba(255,255,255,0.07)',
    'border_radius': 16,
    'padding': SPACING['lg'],
    'box_shadow': 'none',
}

CARD_HOVER = {
    'border': '1px solid rgba(255,255,255,0.12)',
    'box_shadow': 'none',
    'transform': 'translateY(-1px)',
}

# Border color variants
CARD_BORDER_COLORS = {
    'cyan': 'rgba(99, 102, 241, 0.25)',
    'purple': 'rgba(139, 92, 246, 0.25)',
    'green': 'rgba(16, 185, 129, 0.25)',
    'red': 'rgba(239, 68, 68, 0.25)',
    'amber': 'rgba(245, 158, 11, 0.25)',
}


# =============================================================================
# CHART LAYOUT - DARK THEME (Plotly base configuration)
# =============================================================================

CHART_LAYOUT = {
    # Font — design spec: DM Sans
    'font': {
        'family': FONTS['family'],
        'size': FONT_SIZES['sm'],
        'color': 'rgba(255,255,255,0.52)',
    },

    # Backgrounds — TRANSPARENT for glassmorphism (non-negotiable)
    'plot_bgcolor': 'rgba(0,0,0,0)',
    'paper_bgcolor': 'rgba(0,0,0,0)',

    # Margins
    'margin': {'l': 40, 't': 40, 'r': 20, 'b': 40},

    # Title
    'title': {
        'font': {
            'family': FONTS.get('display', FONTS['family']),
            'size': 14,
            'color': 'rgba(255,255,255,0.52)',
        },
        'x': 0.02,
        'xanchor': 'left',
    },

    # Hover labels — glass tooltip
    'hoverlabel': {
        'bgcolor': 'rgba(7, 8, 15, 0.9)',
        'font': {
            'family': FONTS['mono'],
            'size': FONT_SIZES['sm'],
            'color': 'rgba(255,255,255,0.92)',
        },
        'bordercolor': '#6366f1',
    },

    # X Axis — design spec grid colors
    'xaxis': {
        'showgrid': True,
        'gridcolor': 'rgba(255,255,255,0.05)',
        'zeroline': False,
        'tickfont': {'size': FONT_SIZES['xs'], 'color': 'rgba(255,255,255,0.28)'},
        'linecolor': 'rgba(255,255,255,0.07)',
        'title': {'font': {'color': 'rgba(255,255,255,0.52)'}},
    },

    # Y Axis — design spec grid colors
    'yaxis': {
        'showgrid': True,
        'gridcolor': 'rgba(255,255,255,0.05)',
        'gridwidth': 1,
        'zeroline': False,
        'tickfont': {'size': FONT_SIZES['xs'], 'color': 'rgba(255,255,255,0.28)'},
        'linecolor': 'rgba(255,255,255,0.07)',
        'title': {'font': {'color': 'rgba(255,255,255,0.52)'}},
    },

    # Legend — glass panel
    'legend': {
        'font': {'color': 'rgba(255,255,255,0.52)'},
        'bgcolor': 'rgba(255,255,255,0.04)',
        'bordercolor': 'rgba(255,255,255,0.07)',
        'borderwidth': 1,
    },
}


# =============================================================================
# CHART HEIGHT CONSTANTS
# =============================================================================

CHART_HEIGHTS = {
    'compact': 300,
    'standard': 400,
    'medium': 500,
    'large': 600,
    'deep_dive': 700,
}


# =============================================================================
# NEON BORDER CSS STYLES
# =============================================================================

NEON_CHART_CSS = """
<style>
.neon-chart-container {
    border: 1px solid rgba(99, 102, 241, 0.15);
    border-radius: 16px;
    padding: 16px;
    box-shadow:
        0 4px 24px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
    background: rgba(15, 18, 35, 0.45);
    backdrop-filter: blur(12px) saturate(140%);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
    margin: 16px 0;
}

.neon-chart-title {
    color: #e2e8f0;
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 12px;
    font-family: 'Inter', sans-serif;
}
</style>
"""


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_color(color_name: str, opacity: float = 1.0) -> str:
    """
    Get color from palette with optional opacity.
    """
    color = ATLAS_COLORS.get(color_name, ATLAS_COLORS['primary'])
    if opacity < 1.0:
        # Convert hex to rgba
        if color.startswith('#'):
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            return f'rgba({r}, {g}, {b}, {opacity})'
    return color


def get_semantic_color(value: float) -> str:
    """
    Get semantic color based on positive/negative value.
    """
    if value > 0:
        return ATLAS_COLORS['success']
    elif value < 0:
        return ATLAS_COLORS['danger']
    return ATLAS_COLORS['text_muted']


def get_chart_color(index: int) -> str:
    """
    Get chart color by index (cycles through CHART_COLORS).
    """
    return CHART_COLORS[index % len(CHART_COLORS)]


def format_percentage(value: float, decimals: int = 2, show_sign: bool = True) -> str:
    """
    Format percentage consistently.
    """
    if value is None:
        return "N/A"
    sign = '+' if value > 0 and show_sign else ''
    return f"{sign}{value:.{decimals}f}%"


def format_currency(value: float, decimals: int = 0) -> str:
    """
    Format currency consistently with abbreviations.
    """
    if value is None:
        return "N/A"
    if abs(value) >= 1_000_000_000:
        return f"${value/1_000_000_000:.1f}B"
    elif abs(value) >= 1_000_000:
        return f"${value/1_000_000:.1f}M"
    elif abs(value) >= 1_000:
        return f"${value/1_000:.1f}K"
    else:
        return f"${value:,.{decimals}f}"


def format_large_number(value: float) -> str:
    """
    Format large numbers with abbreviations (no currency symbol).
    """
    if value is None:
        return "N/A"
    if abs(value) >= 1_000_000_000:
        return f"{value/1_000_000_000:.1f}B"
    elif abs(value) >= 1_000_000:
        return f"{value/1_000_000:.1f}M"
    elif abs(value) >= 1_000:
        return f"{value/1_000:.1f}K"
    else:
        return f"{value:,.0f}"


def apply_dark_theme_to_chart(fig):
    """
    Apply glassmorphism theme to any Plotly figure.

    IMPORTANT: Call this on EVERY chart to ensure consistency.
    Uses transparent backgrounds so charts float inside frosted-glass containers.

    Args:
        fig: Plotly figure object

    Returns:
        Styled figure with glassmorphism theme
    """
    fig.update_layout(
        plot_bgcolor='rgba(0,0,0,0)',
        paper_bgcolor='rgba(0,0,0,0)',
        font=dict(
            color='rgba(255,255,255,0.52)',
            family=FONTS['family'],
            size=11,
        ),
        title=dict(font=dict(color='rgba(255,255,255,0.52)')),
        hoverlabel=dict(
            bgcolor='rgba(7, 8, 15, 0.9)',
            font=dict(color='rgba(255,255,255,0.92)'),
            bordercolor='#6366f1',
        ),
        legend=dict(
            bgcolor='rgba(255,255,255,0.04)',
            bordercolor='rgba(255,255,255,0.07)',
            borderwidth=1,
        ),
        margin=dict(l=40, r=20, t=40, b=40),
    )

    # Update axes — design spec grid/line colors
    fig.update_xaxes(
        showgrid=True,
        gridcolor='rgba(255,255,255,0.05)',
        tickfont=dict(color='rgba(255,255,255,0.28)', size=10),
        linecolor='rgba(255,255,255,0.07)',
        title=dict(font=dict(color='rgba(255,255,255,0.52)')),
    )

    fig.update_yaxes(
        showgrid=True,
        gridcolor='rgba(255,255,255,0.05)',
        tickfont=dict(color='rgba(255,255,255,0.28)', size=10),
        linecolor='rgba(255,255,255,0.07)',
        title=dict(font=dict(color='rgba(255,255,255,0.52)')),
    )

    return fig


# =============================================================================
# CSS STYLES FOR STREAMLIT - DARK THEME
# =============================================================================

def get_atlas_css() -> str:
    """
    Get CSS string for ATLAS glassmorphism styling in Streamlit.
    """
    return f"""
    /* ATLAS Glassmorphism CSS — Design Spec */

    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=Syne:wght@400;600;700&display=swap');

    body, .stApp {{
        font-family: {FONTS['family']};
        background-color: #07080f;
    }}

    /* Glass Card — design spec */
    .atlas-card, .glass-card {{
        background: rgba(255,255,255,0.05);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 16px;
        padding: 24px;
        transition: all 0.25s ease;
        position: relative;
        overflow: hidden;
    }}

    .atlas-card:hover, .glass-card:hover {{
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.12);
        transform: translateY(-1px);
    }}

    /* Glass Chart Container */
    .neon-chart-container {{
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 16px;
        padding: 16px;
        background: rgba(255,255,255,0.035);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        margin: 16px 0;
    }}

    /* Text colors — design spec */
    .atlas-text-primary {{
        color: rgba(255,255,255,0.92);
    }}

    .atlas-text-muted {{
        color: rgba(255,255,255,0.28);
    }}

    /* Metric styling */
    .atlas-metric {{
        font-family: {FONTS['mono']};
        font-weight: 700;
        color: #6366f1;
    }}

    /* Semantic colors — design spec */
    .atlas-success {{
        color: #10b981;
    }}

    .atlas-danger {{
        color: #f43f5e;
    }}

    .atlas-warning {{
        color: #f59e0b;
    }}

    /* Gradient text */
    .atlas-gradient-text {{
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }}
    """


# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    # Colors
    'ATLAS_COLORS',
    'CHART_COLORS',
    'CHART_FILLS',
    'CHART_GRADIENTS',
    'CARD_BORDER_COLORS',

    # Typography
    'FONTS',
    'FONT_SIZES',
    'FONT_WEIGHTS',

    # Layout
    'SPACING',
    'CARD_STYLE',
    'CARD_HOVER',
    'CHART_LAYOUT',
    'CHART_HEIGHTS',

    # CSS
    'NEON_CHART_CSS',

    # Helper functions
    'get_color',
    'get_semantic_color',
    'get_chart_color',
    'format_percentage',
    'format_currency',
    'format_large_number',
    'apply_dark_theme_to_chart',
    'get_atlas_css',
]
