"""
ATLAS Design System V1.0 - Professional Blue Theme
====================================================
"One Living, Breathing Soul"

Complete design specification for visual consistency:
- Professional Blue color palette (Stripe-inspired)
- Inter typography
- 8px spacing grid
- Clean chart styling

Created: January 2026
Author: Hlobo & Claude
"""

from typing import Dict, Optional

# =============================================================================
# COLOR PALETTE - Professional Blue
# =============================================================================

ATLAS_COLORS = {
    # Core Brand Colors
    'primary': '#1E88E5',        # Main blue - CTAs, highlights, key data
    'primary_light': '#42A5F5',  # Lighter blue - hover states, accents
    'primary_dark': '#1565C0',   # Darker blue - pressed states, emphasis

    # Secondary Accent
    'secondary': '#00ACC1',      # Teal - secondary actions, diversity
    'secondary_light': '#26C6DA', # Light teal - accents

    # Semantic Colors (Data)
    'success': '#43A047',        # Green - positive returns, gains
    'success_light': '#66BB6A',  # Light green - mild positive
    'warning': '#FB8C00',        # Orange - caution, neutral
    'warning_light': '#FFA726',  # Light orange - mild caution
    'danger': '#E53935',         # Red - losses, alerts
    'danger_light': '#EF5350',   # Light red - mild negative

    # Neutral Colors (UI)
    'dark': '#263238',           # Text, headings, strong emphasis
    'dark_medium': '#37474F',    # Secondary text
    'light': '#ECEFF1',          # Backgrounds, containers
    'light_medium': '#CFD8DC',   # Borders, dividers
    'muted': '#90A4AE',          # Tertiary text, disabled states

    # Backgrounds
    'background': '#FFFFFF',     # Main background
    'surface': '#F5F7FA',        # Card/container background
    'surface_elevated': '#FFFFFF', # Elevated cards (white on gray)

    # Additional accent colors for charts
    'purple': '#7E57C2',         # Additional series
    'pink': '#EC407A',           # Accent
    'teal': '#26A69A',           # Alternative green-blue
}

# Chart-specific color sequence (ordered by importance)
CHART_COLORS = [
    '#1E88E5',  # Primary blue (main data series)
    '#00ACC1',  # Teal (secondary series)
    '#43A047',  # Green (positive series)
    '#FB8C00',  # Orange (neutral/warning series)
    '#E53935',  # Red (negative series)
    '#7E57C2',  # Purple (additional series)
    '#EC407A',  # Pink (additional)
    '#26A69A',  # Teal variant
]

# Semi-transparent fills for area charts (20% opacity)
CHART_FILLS = [
    'rgba(30, 136, 229, 0.2)',   # Primary blue fill
    'rgba(0, 172, 193, 0.2)',    # Teal fill
    'rgba(67, 160, 71, 0.2)',    # Green fill
    'rgba(251, 140, 0, 0.2)',    # Orange fill
    'rgba(229, 57, 53, 0.2)',    # Red fill
    'rgba(126, 87, 194, 0.2)',   # Purple fill
]

# Gradient definitions (top to bottom)
CHART_GRADIENTS = {
    'primary': ['rgba(30, 136, 229, 0.4)', 'rgba(30, 136, 229, 0.0)'],
    'success': ['rgba(67, 160, 71, 0.4)', 'rgba(67, 160, 71, 0.0)'],
    'danger': ['rgba(229, 57, 53, 0.4)', 'rgba(229, 57, 53, 0.0)'],
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
    'normal': 400,    # Body text
    'medium': 500,    # Emphasis, labels
    'semibold': 600,  # Headings, important text
    'bold': 700,      # Strong emphasis, titles
}


# =============================================================================
# SPACING SYSTEM (8px Grid)
# =============================================================================

SPACING = {
    'xs': 4,      # 0.5 × 8px - Tight spacing (button padding)
    'sm': 8,      # 1 × 8px - Related elements
    'md': 16,     # 2 × 8px - Standard margin (DEFAULT)
    'lg': 24,     # 3 × 8px - Section spacing
    'xl': 32,     # 4 × 8px - Major sections
    'xxl': 48,    # 6 × 8px - Page sections
    '3xl': 64,    # 8 × 8px - Hero sections
}


# =============================================================================
# CARD STYLES
# =============================================================================

CARD_STYLE = {
    'background': ATLAS_COLORS['surface_elevated'],
    'border': f"1px solid {ATLAS_COLORS['light_medium']}",
    'border_radius': 8,
    'padding': SPACING['lg'],
    'box_shadow': '0 1px 3px rgba(0, 0, 0, 0.06)',
}

CARD_HOVER = {
    'box_shadow': '0 4px 12px rgba(0, 0, 0, 0.08)',
    'transform': 'translateY(-2px)',
}


# =============================================================================
# CHART LAYOUT (Plotly base configuration)
# =============================================================================

CHART_LAYOUT = {
    'font': {
        'family': FONTS['family'],
        'size': FONT_SIZES['sm'],
        'color': ATLAS_COLORS['dark_medium']
    },
    'plot_bgcolor': 'white',
    'paper_bgcolor': 'white',
    'margin': {'l': 60, 't': 50, 'r': 30, 'b': 50},
    'title': {
        'font': {
            'family': FONTS['family'],
            'size': FONT_SIZES['md'],
            'color': ATLAS_COLORS['dark']
        },
        'x': 0.02,
        'xanchor': 'left',
    },
    'hoverlabel': {
        'bgcolor': ATLAS_COLORS['dark'],
        'font': {
            'family': FONTS['family'],
            'size': FONT_SIZES['sm'],
            'color': 'white'
        },
        'bordercolor': ATLAS_COLORS['dark'],
    },
    'xaxis': {
        'showgrid': False,  # No vertical gridlines (Stripe style)
        'zeroline': False,
        'tickfont': {'size': FONT_SIZES['xs'], 'color': ATLAS_COLORS['muted']},
        'linecolor': ATLAS_COLORS['light_medium'],
    },
    'yaxis': {
        'showgrid': True,
        'gridcolor': ATLAS_COLORS['light_medium'],
        'gridwidth': 1,
        'zeroline': False,
        'tickfont': {'size': FONT_SIZES['xs'], 'color': ATLAS_COLORS['muted']},
        'linecolor': ATLAS_COLORS['light_medium'],
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
# HELPER FUNCTIONS
# =============================================================================

def get_color(color_name: str, opacity: float = 1.0) -> str:
    """
    Get color from palette with optional opacity.

    Args:
        color_name: Key from ATLAS_COLORS dict
        opacity: Float between 0.0 and 1.0

    Returns:
        Color string (hex or rgba)

    Example:
        >>> get_color('primary')
        '#1E88E5'
        >>> get_color('primary', 0.5)
        'rgba(30, 136, 229, 0.5)'
    """
    color = ATLAS_COLORS.get(color_name, ATLAS_COLORS['primary'])
    if opacity < 1.0:
        # Convert hex to rgba
        r = int(color[1:3], 16)
        g = int(color[3:5], 16)
        b = int(color[5:7], 16)
        return f'rgba({r}, {g}, {b}, {opacity})'
    return color


def get_semantic_color(value: float) -> str:
    """
    Get semantic color based on positive/negative value.

    Args:
        value: Numeric value (positive = green, negative = red)

    Returns:
        Color hex string

    Example:
        >>> get_semantic_color(10.5)
        '#43A047'  # success green
        >>> get_semantic_color(-5.2)
        '#E53935'  # danger red
    """
    if value > 0:
        return ATLAS_COLORS['success']
    elif value < 0:
        return ATLAS_COLORS['danger']
    return ATLAS_COLORS['muted']


def get_chart_color(index: int) -> str:
    """
    Get chart color by index (cycles through CHART_COLORS).

    Args:
        index: Series index (0-based)

    Returns:
        Color hex string
    """
    return CHART_COLORS[index % len(CHART_COLORS)]


def format_percentage(value: float, decimals: int = 2, show_sign: bool = True) -> str:
    """
    Format percentage consistently.

    Args:
        value: Numeric value
        decimals: Decimal places
        show_sign: Include + sign for positive values

    Returns:
        Formatted string like "+12.50%" or "12.50%"
    """
    if value is None:
        return "N/A"
    sign = '+' if value > 0 and show_sign else ''
    return f"{sign}{value:.{decimals}f}%"


def format_currency(value: float, decimals: int = 0) -> str:
    """
    Format currency consistently with abbreviations.

    Args:
        value: Numeric value
        decimals: Decimal places

    Returns:
        Formatted string like "$1.5M" or "$125K"
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

    Args:
        value: Numeric value

    Returns:
        Formatted string like "1.5B" or "125K"
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


# =============================================================================
# CSS STYLES FOR STREAMLIT
# =============================================================================

def get_atlas_css() -> str:
    """
    Get CSS string for ATLAS styling in Streamlit.

    Usage in Streamlit:
        st.markdown(f"<style>{get_atlas_css()}</style>", unsafe_allow_html=True)
    """
    return f"""
    /* ATLAS Professional Blue Theme CSS */

    /* Typography */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    body, .stApp {{
        font-family: {FONTS['family']};
    }}

    /* Card styling */
    .atlas-card {{
        background: {CARD_STYLE['background']};
        border: {CARD_STYLE['border']};
        border-radius: {CARD_STYLE['border_radius']}px;
        padding: {CARD_STYLE['padding']}px;
        box-shadow: {CARD_STYLE['box_shadow']};
        transition: all 0.2s ease;
    }}

    .atlas-card:hover {{
        box-shadow: {CARD_HOVER['box_shadow']};
        transform: {CARD_HOVER['transform']};
    }}

    /* Metric styling */
    .atlas-metric {{
        font-family: {FONTS['mono']};
        font-weight: {FONT_WEIGHTS['semibold']};
    }}

    /* Success/Danger colors */
    .atlas-success {{
        color: {ATLAS_COLORS['success']};
    }}

    .atlas-danger {{
        color: {ATLAS_COLORS['danger']};
    }}

    .atlas-warning {{
        color: {ATLAS_COLORS['warning']};
    }}

    /* Page fade-in animation */
    @keyframes fadeInUp {{
        from {{
            opacity: 0;
            transform: translateY(10px);
        }}
        to {{
            opacity: 1;
            transform: translateY(0);
        }}
    }}

    .atlas-animate {{
        animation: fadeInUp 0.3s ease-out;
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

    # Helper functions
    'get_color',
    'get_semantic_color',
    'get_chart_color',
    'format_percentage',
    'format_currency',
    'format_large_number',
    'get_atlas_css',
]
