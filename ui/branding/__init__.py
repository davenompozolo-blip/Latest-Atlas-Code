"""
ATLAS Terminal - Avengers Branding System
==========================================

Complete superhero-themed branding suite for the ATLAS Terminal.

Features:
---------
- 7 Hero Themes (Captain America, Iron Man, Thor, Hulk, Black Widow, Hawkeye, Infinity)
- Animated Captain America shield logo (SVG)
- Complete CSS animation suite
- Multi-style icon mapping system
- Dynamic theme switching

Quick Start:
------------
```python
from ui.branding import apply_avengers_branding, get_shield_logo

# Apply full Avengers branding
apply_avengers_branding()

# Or customize:
from ui.branding import AvengersTheme, HeroMode

theme = AvengersTheme(HeroMode.IRON_MAN)
st.markdown(theme.get_css(), unsafe_allow_html=True)
```

Modules:
--------
- theme_avengers: 7 hero theme configurations with color systems
- icon_mapper: Multi-style icon mapping for pages and statuses
- shield_logo.svg: Animated Captain America shield with vibranium glow
- avengers_animations.css: Complete CSS animation library

Author: ATLAS Development Team
Version: 1.0.0
"""

# Core theme system
from .theme_avengers import (
    HeroMode,
    ThemeColors,
    ThemeConfig,
    AvengersTheme,
    apply_avengers_theme,
    create_theme_switcher,
    CAPTAIN_THEME,
    IRON_MAN_THEME,
    THOR_THEME,
    HULK_THEME,
    BLACK_WIDOW_THEME,
    HAWKEYE_THEME,
    INFINITY_THEME,
    THEMES
)

# Icon mapping system
from .icon_mapper import (
    IconStyle,
    AvengersIconMapper,
    get_page_icon,
    get_status_icon,
    create_icon_style_selector,
    PAGE_ICONS,
    STATUS_ICONS,
    HERO_SPECIFIC_ICONS
)

# Assets
import os
from pathlib import Path

BRANDING_DIR = Path(__file__).parent
SHIELD_LOGO_PATH = BRANDING_DIR / "shield_logo.svg"
ANIMATIONS_CSS_PATH = BRANDING_DIR / "avengers_animations.css"


def get_shield_logo() -> str:
    """
    Load the animated Captain America shield logo SVG.

    Returns:
        SVG content as string
    """
    try:
        with open(SHIELD_LOGO_PATH, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return "<!-- Shield logo not found -->"


def get_animations_css() -> str:
    """
    Load the complete Avengers animations CSS.

    Returns:
        CSS content as string (wrapped in <style> tags)
    """
    try:
        with open(ANIMATIONS_CSS_PATH, 'r', encoding='utf-8') as f:
            css_content = f.read()
            return f"<style>{css_content}</style>"
    except FileNotFoundError:
        return "<style>/* Animations CSS not found */</style>"


def apply_avengers_branding(
    hero_mode: HeroMode = HeroMode.CAPTAIN,
    include_logo: bool = True,
    include_animations: bool = True,
    icon_style: IconStyle = IconStyle.AVENGERS
) -> tuple:
    """
    Apply complete Avengers branding to Streamlit app.

    This is the main entry point for enabling all branding features.

    Args:
        hero_mode: Which hero theme to use (default: Captain America)
        include_logo: Whether to include the shield logo (default: True)
        include_animations: Whether to include CSS animations (default: True)
        icon_style: Icon style to use (default: AVENGERS)

    Returns:
        Tuple of (theme_manager, icon_mapper)

    Example:
        ```python
        import streamlit as st
        from ui.branding import apply_avengers_branding, HeroMode

        # Apply Iron Man theme with full branding
        theme, icons = apply_avengers_branding(
            hero_mode=HeroMode.IRON_MAN,
            include_logo=True,
            include_animations=True
        )

        # Now use Streamlit normally - branding is active!
        st.title("ATLAS Terminal")
        ```
    """
    import streamlit as st

    # 1. Apply theme CSS
    theme_manager = AvengersTheme(hero_mode)
    st.markdown(theme_manager.get_css(), unsafe_allow_html=True)

    # 2. Apply animations CSS
    if include_animations:
        st.markdown(get_animations_css(), unsafe_allow_html=True)

    # 3. Initialize icon mapper
    icon_mapper = AvengersIconMapper(icon_style)

    # 4. Store in session state for access
    if 'avengers_theme' not in st.session_state:
        st.session_state.avengers_theme = theme_manager
    if 'avengers_icons' not in st.session_state:
        st.session_state.avengers_icons = icon_mapper

    return theme_manager, icon_mapper


def show_shield_logo(
    width: int = 150,
    animate: bool = True,
    centered: bool = True
) -> None:
    """
    Display the animated Captain America shield logo.

    Args:
        width: Width of the logo in pixels (default: 150)
        animate: Whether to animate the logo (default: True)
        centered: Whether to center the logo (default: True)

    Example:
        ```python
        from ui.branding import show_shield_logo

        # Show animated logo in sidebar
        with st.sidebar:
            show_shield_logo(width=120, animate=True, centered=True)
        ```
    """
    import streamlit as st

    svg_content = get_shield_logo()

    # Add animation class if requested
    animation_class = "atlas-shield-logo" if animate else ""

    # Build HTML
    style = f"width: {width}px; height: auto;"
    if centered:
        style += " display: block; margin: 0 auto;"

    html = f"""
    <div class="{animation_class}" style="{style}">
        {svg_content}
    </div>
    """

    st.markdown(html, unsafe_allow_html=True)


# Define what gets imported with "from ui.branding import *"
__all__ = [
    # Theme system
    'HeroMode',
    'ThemeColors',
    'ThemeConfig',
    'AvengersTheme',
    'apply_avengers_theme',
    'create_theme_switcher',
    'CAPTAIN_THEME',
    'IRON_MAN_THEME',
    'THOR_THEME',
    'HULK_THEME',
    'BLACK_WIDOW_THEME',
    'HAWKEYE_THEME',
    'INFINITY_THEME',
    'THEMES',

    # Icon system
    'IconStyle',
    'AvengersIconMapper',
    'get_page_icon',
    'get_status_icon',
    'create_icon_style_selector',
    'PAGE_ICONS',
    'STATUS_ICONS',
    'HERO_SPECIFIC_ICONS',

    # Assets and utilities
    'get_shield_logo',
    'get_animations_css',
    'show_shield_logo',
    'apply_avengers_branding',

    # Paths
    'BRANDING_DIR',
    'SHIELD_LOGO_PATH',
    'ANIMATIONS_CSS_PATH'
]

__version__ = "1.0.0"
__author__ = "ATLAS Development Team"
