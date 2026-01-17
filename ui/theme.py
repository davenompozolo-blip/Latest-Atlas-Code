"""
ATLAS Design System V2.0 - Dark Theme with Neon Cyan Accents
=============================================================
"One Living, Breathing Soul"

Complete design specification for visual consistency:
- Dark theme with neon cyan borders
- White text on dark backgrounds
- Semantic colors (green gains, red losses)
- Professional appearance

Created: January 2026
Author: Hlobo & Claude
"""

from typing import Dict, Optional

# =============================================================================
# COLOR PALETTE - Dark Theme with Neon Cyan Accents
# =============================================================================

ATLAS_COLORS = {
    # Core Brand Colors
    'primary': '#00BCD4',            # Neon cyan - main accent
    'primary_light': '#00E5FF',      # Lighter cyan - hover states
    'primary_dark': '#0097A7',       # Darker cyan - pressed states

    # Secondary Accent
    'secondary': '#7C4DFF',          # Purple - secondary actions
    'secondary_light': '#B388FF',    # Light purple - accents

    # Semantic Colors (Data)
    'success': '#00E676',            # Bright green - positive returns, gains
    'success_light': '#69F0AE',      # Light green - mild positive
    'warning': '#FFC400',            # Amber - caution, neutral
    'warning_light': '#FFD740',      # Light amber - mild caution
    'danger': '#FF1744',             # Bright red - losses, alerts
    'danger_light': '#FF5252',       # Light red - mild negative

    # Dark Theme Colors
    'dark': '#1a1d29',               # Primary dark background
    'dark_medium': '#242838',        # Slightly lighter dark
    'dark_light': '#2d3143',         # Card backgrounds

    # Text Colors (on dark backgrounds)
    'text_primary': '#FFFFFF',       # Primary text - white
    'text_secondary': 'rgba(255, 255, 255, 0.7)',  # Secondary text
    'text_muted': 'rgba(255, 255, 255, 0.5)',      # Muted text
    'text_disabled': 'rgba(255, 255, 255, 0.3)',  # Disabled text

    # Borders
    'border': 'rgba(0, 188, 212, 0.3)',            # Subtle cyan border
    'border_hover': 'rgba(0, 188, 212, 0.5)',     # Hover border
    'border_glow': 'rgba(0, 188, 212, 0.4)',      # Glow border

    # Grid colors
    'grid': 'rgba(255, 255, 255, 0.1)',           # Subtle grid
    'grid_dark': 'rgba(255, 255, 255, 0.05)',    # Very subtle grid

    # Chart backgrounds (DARK)
    'chart_bg': '#1a1d29',           # Chart background
    'paper_bg': '#1a1d29',           # Paper background

    # Additional accent colors for charts
    'purple': '#7C4DFF',
    'pink': '#FF4081',
    'teal': '#1DE9B6',
    'orange': '#FF9100',
}

# Chart-specific color sequence (ordered by importance)
CHART_COLORS = [
    '#00BCD4',  # Cyan (main data series)
    '#00E676',  # Green (positive series)
    '#7C4DFF',  # Purple (secondary series)
    '#FF9100',  # Orange (warning series)
    '#FF1744',  # Red (negative series)
    '#1DE9B6',  # Teal (additional)
    '#FF4081',  # Pink (additional)
    '#FFC400',  # Amber (additional)
]

# Semi-transparent fills for area charts (15% opacity on dark)
CHART_FILLS = [
    'rgba(0, 188, 212, 0.15)',    # Cyan fill
    'rgba(0, 230, 118, 0.15)',    # Green fill
    'rgba(124, 77, 255, 0.15)',   # Purple fill
    'rgba(255, 145, 0, 0.15)',    # Orange fill
    'rgba(255, 23, 68, 0.15)',    # Red fill
    'rgba(29, 233, 182, 0.15)',   # Teal fill
]

# Gradient definitions (top to bottom)
CHART_GRADIENTS = {
    'primary': ['rgba(0, 188, 212, 0.3)', 'rgba(0, 188, 212, 0.0)'],
    'success': ['rgba(0, 230, 118, 0.3)', 'rgba(0, 230, 118, 0.0)'],
    'danger': ['rgba(255, 23, 68, 0.3)', 'rgba(255, 23, 68, 0.0)'],
}


# =============================================================================
# TYPOGRAPHY
# =============================================================================

FONTS = {
    'family': 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'mono': 'JetBrains Mono, "SF Mono", Monaco, Consolas, monospace',
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
# CARD STYLES - Dark Theme with Neon Border
# =============================================================================

CARD_STYLE = {
    'background': 'linear-gradient(135deg, rgba(26, 29, 41, 0.95) 0%, rgba(20, 23, 35, 0.95) 100%)',
    'border': '1px solid rgba(0, 188, 212, 0.3)',
    'border_radius': 12,
    'padding': SPACING['lg'],
    'box_shadow': '''
        0 2px 8px rgba(0, 0, 0, 0.3),
        0 0 1px rgba(0, 188, 212, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.05)
    ''',
}

CARD_HOVER = {
    'border': '1px solid rgba(0, 188, 212, 0.5)',
    'box_shadow': '''
        0 4px 16px rgba(0, 0, 0, 0.4),
        0 0 8px rgba(0, 188, 212, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.08)
    ''',
    'transform': 'translateY(-2px)',
}

# Neon border variants
CARD_BORDER_COLORS = {
    'cyan': 'rgba(0, 188, 212, 0.4)',
    'purple': 'rgba(124, 77, 255, 0.4)',
    'green': 'rgba(0, 230, 118, 0.4)',
    'red': 'rgba(255, 23, 68, 0.4)',
    'amber': 'rgba(255, 196, 0, 0.4)',
}


# =============================================================================
# CHART LAYOUT - DARK THEME (Plotly base configuration)
# =============================================================================

CHART_LAYOUT = {
    # Font - WHITE TEXT
    'font': {
        'family': FONTS['family'],
        'size': FONT_SIZES['sm'],
        'color': '#FFFFFF',  # WHITE for visibility
    },

    # Backgrounds - DARK
    'plot_bgcolor': '#1a1d29',
    'paper_bgcolor': '#1a1d29',

    # Margins
    'margin': {'l': 60, 't': 50, 'r': 30, 'b': 50},

    # Title - WHITE TEXT
    'title': {
        'font': {
            'family': FONTS['family'],
            'size': FONT_SIZES['md'],
            'color': '#FFFFFF',
        },
        'x': 0.02,
        'xanchor': 'left',
    },

    # Hover labels - DARK BG with WHITE TEXT
    'hoverlabel': {
        'bgcolor': '#1a1d29',
        'font': {
            'family': FONTS['family'],
            'size': FONT_SIZES['sm'],
            'color': '#FFFFFF',
        },
        'bordercolor': '#00BCD4',
    },

    # X Axis - WHITE TEXT, SUBTLE GRID
    'xaxis': {
        'showgrid': True,
        'gridcolor': 'rgba(255, 255, 255, 0.1)',
        'zeroline': False,
        'tickfont': {'size': FONT_SIZES['xs'], 'color': '#FFFFFF'},
        'linecolor': 'rgba(255, 255, 255, 0.2)',
        'title': {'font': {'color': '#FFFFFF'}},
    },

    # Y Axis - WHITE TEXT, SUBTLE GRID
    'yaxis': {
        'showgrid': True,
        'gridcolor': 'rgba(255, 255, 255, 0.1)',
        'gridwidth': 1,
        'zeroline': False,
        'tickfont': {'size': FONT_SIZES['xs'], 'color': '#FFFFFF'},
        'linecolor': 'rgba(255, 255, 255, 0.2)',
        'title': {'font': {'color': '#FFFFFF'}},
    },

    # Legend - WHITE TEXT
    'legend': {
        'font': {'color': '#FFFFFF'},
        'bgcolor': 'rgba(26, 29, 41, 0.8)',
        'bordercolor': 'rgba(0, 188, 212, 0.3)',
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
    border: 2px solid #00BCD4;
    border-radius: 8px;
    padding: 16px;
    box-shadow:
        0 0 10px rgba(0, 188, 212, 0.3),
        0 0 20px rgba(0, 188, 212, 0.2),
        inset 0 0 10px rgba(0, 188, 212, 0.1);
    background: #1a1d29;
    margin: 16px 0;
}

.neon-chart-title {
    color: #FFFFFF;
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
    Apply dark theme to any Plotly figure.

    IMPORTANT: Call this on EVERY chart to ensure consistency.

    Args:
        fig: Plotly figure object

    Returns:
        Styled figure with dark theme
    """
    fig.update_layout(
        plot_bgcolor='#1a1d29',
        paper_bgcolor='#1a1d29',
        font=dict(color='#FFFFFF', family=FONTS['family']),
        title=dict(font=dict(color='#FFFFFF')),
        hoverlabel=dict(
            bgcolor='#1a1d29',
            font=dict(color='#FFFFFF'),
            bordercolor='#00BCD4',
        ),
    )

    # Update axes
    fig.update_xaxes(
        showgrid=True,
        gridcolor='rgba(255, 255, 255, 0.1)',
        tickfont=dict(color='#FFFFFF'),
        linecolor='rgba(255, 255, 255, 0.2)',
        title=dict(font=dict(color='#FFFFFF')),
    )

    fig.update_yaxes(
        showgrid=True,
        gridcolor='rgba(255, 255, 255, 0.1)',
        tickfont=dict(color='#FFFFFF'),
        linecolor='rgba(255, 255, 255, 0.2)',
        title=dict(font=dict(color='#FFFFFF')),
    )

    return fig


# =============================================================================
# CSS STYLES FOR STREAMLIT - DARK THEME
# =============================================================================

def get_atlas_css() -> str:
    """
    Get CSS string for ATLAS dark theme styling in Streamlit.
    """
    return f"""
    /* ATLAS Dark Theme CSS */

    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

    body, .stApp {{
        font-family: {FONTS['family']};
        background-color: #1a1d29;
    }}

    /* Professional Card styling - Dark Theme */
    .atlas-card {{
        background: linear-gradient(135deg, rgba(26, 29, 41, 0.95) 0%, rgba(20, 23, 35, 0.95) 100%);
        border: 1px solid rgba(0, 188, 212, 0.3);
        border-top: 2px solid rgba(0, 188, 212, 0.4);
        border-radius: 12px;
        padding: 24px;
        box-shadow:
            0 2px 8px rgba(0, 0, 0, 0.3),
            0 0 1px rgba(0, 188, 212, 0.5);
        transition: all 0.3s ease;
    }}

    .atlas-card:hover {{
        border-color: rgba(0, 188, 212, 0.5);
        box-shadow:
            0 4px 16px rgba(0, 0, 0, 0.4),
            0 0 8px rgba(0, 188, 212, 0.4);
        transform: translateY(-2px);
    }}

    /* Neon Chart Container */
    .neon-chart-container {{
        border: 2px solid #00BCD4;
        border-radius: 8px;
        padding: 16px;
        box-shadow:
            0 0 10px rgba(0, 188, 212, 0.3),
            0 0 20px rgba(0, 188, 212, 0.2);
        background: #1a1d29;
        margin: 16px 0;
    }}

    /* Text colors on dark */
    .atlas-text-primary {{
        color: #FFFFFF;
    }}

    .atlas-text-muted {{
        color: rgba(255, 255, 255, 0.5);
    }}

    /* Metric styling */
    .atlas-metric {{
        font-family: {FONTS['mono']};
        font-weight: 600;
        color: #00BCD4;
    }}

    /* Success/Danger colors */
    .atlas-success {{
        color: #00E676;
    }}

    .atlas-danger {{
        color: #FF1744;
    }}

    .atlas-warning {{
        color: #FFC400;
    }}

    /* Gradient text for values */
    .atlas-gradient-text {{
        background: linear-gradient(135deg, #00BCD4 0%, #00E5FF 100%);
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
