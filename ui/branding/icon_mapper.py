"""ATLAS Terminal - Avengers Icon Mapping System

Maps pages and statuses to multiple icon styles:
- EMOJI: Standard Unicode emojis
- AVENGERS: Superhero-themed icons
- SYMBOL: Minimalist symbols
- MINIMAL: Single-character representations
"""

from enum import Enum
from typing import Dict, Optional


class IconStyle(Enum):
    """Icon style options for the UI"""
    EMOJI = "emoji"
    AVENGERS = "avengers"
    SYMBOL = "symbol"
    MINIMAL = "minimal"


# ============================================================================
# PAGE ICON MAPPINGS
# ============================================================================

PAGE_ICONS: Dict[str, Dict[IconStyle, str]] = {
    # Core Navigation
    "home": {
        IconStyle.EMOJI: "🏠",
        IconStyle.AVENGERS: "🛡️",
        IconStyle.SYMBOL: "⌂",
        IconStyle.MINIMAL: "H"
    },
    "phoenix_parser": {
        IconStyle.EMOJI: "🔥",
        IconStyle.AVENGERS: "⚡",
        IconStyle.SYMBOL: "🔄",
        IconStyle.MINIMAL: "P"
    },
    "about": {
        IconStyle.EMOJI: "ℹ️",
        IconStyle.AVENGERS: "🎯",
        IconStyle.SYMBOL: "i",
        IconStyle.MINIMAL: "A"
    },

    # Analytics Suite
    "v10_analytics": {
        IconStyle.EMOJI: "📊",
        IconStyle.AVENGERS: "💎",
        IconStyle.SYMBOL: "📈",
        IconStyle.MINIMAL: "V"
    },
    "r_analytics": {
        IconStyle.EMOJI: "📈",
        IconStyle.AVENGERS: "⚡",
        IconStyle.SYMBOL: "ℝ",
        IconStyle.MINIMAL: "R"
    },
    "database": {
        IconStyle.EMOJI: "💾",
        IconStyle.AVENGERS: "🔧",
        IconStyle.SYMBOL: "⚙️",
        IconStyle.MINIMAL: "D"
    },

    # Market Intelligence
    "market_watch": {
        IconStyle.EMOJI: "📡",
        IconStyle.AVENGERS: "🎯",
        IconStyle.SYMBOL: "👁️",
        IconStyle.MINIMAL: "M"
    },

    # Risk & Performance
    "risk_analysis": {
        IconStyle.EMOJI: "⚠️",
        IconStyle.AVENGERS: "🛡️",
        IconStyle.SYMBOL: "⚡",
        IconStyle.MINIMAL: "R"
    },
    "performance_suite": {
        IconStyle.EMOJI: "🎯",
        IconStyle.AVENGERS: "⭐",
        IconStyle.SYMBOL: "↗️",
        IconStyle.MINIMAL: "P"
    },
    "portfolio_deep_dive": {
        IconStyle.EMOJI: "🔍",
        IconStyle.AVENGERS: "🔬",
        IconStyle.SYMBOL: "🔎",
        IconStyle.MINIMAL: "D"
    },

    # Advanced Analytics
    "multi_factor": {
        IconStyle.EMOJI: "🧬",
        IconStyle.AVENGERS: "💚",
        IconStyle.SYMBOL: "∑",
        IconStyle.MINIMAL: "F"
    },
    "valuation_house": {
        IconStyle.EMOJI: "💰",
        IconStyle.AVENGERS: "💛",
        IconStyle.SYMBOL: "$",
        IconStyle.MINIMAL: "V"
    },
    "monte_carlo": {
        IconStyle.EMOJI: "🎲",
        IconStyle.AVENGERS: "🌀",
        IconStyle.SYMBOL: "∞",
        IconStyle.MINIMAL: "M"
    },
    "quant_optimizer": {
        IconStyle.EMOJI: "⚙️",
        IconStyle.AVENGERS: "🔧",
        IconStyle.SYMBOL: "⚡",
        IconStyle.MINIMAL: "Q"
    },

    # Specialized Tools
    "leverage_tracker": {
        IconStyle.EMOJI: "📊",
        IconStyle.AVENGERS: "⚖️",
        IconStyle.SYMBOL: "↕️",
        IconStyle.MINIMAL: "L"
    },
    "investopedia_live": {
        IconStyle.EMOJI: "📚",
        IconStyle.AVENGERS: "🎓",
        IconStyle.SYMBOL: "ℹ️",
        IconStyle.MINIMAL: "I"
    },
}


# ============================================================================
# STATUS ICON MAPPINGS
# ============================================================================

STATUS_ICONS: Dict[str, Dict[IconStyle, str]] = {
    "success": {
        IconStyle.EMOJI: "✅",
        IconStyle.AVENGERS: "🛡️",
        IconStyle.SYMBOL: "✓",
        IconStyle.MINIMAL: "√"
    },
    "error": {
        IconStyle.EMOJI: "❌",
        IconStyle.AVENGERS: "💥",
        IconStyle.SYMBOL: "✗",
        IconStyle.MINIMAL: "X"
    },
    "warning": {
        IconStyle.EMOJI: "⚠️",
        IconStyle.AVENGERS: "⚡",
        IconStyle.SYMBOL: "!",
        IconStyle.MINIMAL: "!"
    },
    "info": {
        IconStyle.EMOJI: "ℹ️",
        IconStyle.AVENGERS: "💎",
        IconStyle.SYMBOL: "i",
        IconStyle.MINIMAL: "i"
    },
    "loading": {
        IconStyle.EMOJI: "⏳",
        IconStyle.AVENGERS: "🌀",
        IconStyle.SYMBOL: "○",
        IconStyle.MINIMAL: "o"
    },
    "complete": {
        IconStyle.EMOJI: "✨",
        IconStyle.AVENGERS: "⭐",
        IconStyle.SYMBOL: "★",
        IconStyle.MINIMAL: "*"
    },
}


# ============================================================================
# SPECIAL THEME ICONS (per hero)
# ============================================================================

HERO_SPECIFIC_ICONS: Dict[str, Dict[str, str]] = {
    "captain": {
        "primary": "🛡️",
        "secondary": "⭐",
        "accent": "💫"
    },
    "ironman": {
        "primary": "⚡",
        "secondary": "🔧",
        "accent": "💛"
    },
    "thor": {
        "primary": "⚡",
        "secondary": "🔨",
        "accent": "⚡"
    },
    "hulk": {
        "primary": "💚",
        "secondary": "💥",
        "accent": "👊"
    },
    "widow": {
        "primary": "🕷️",
        "secondary": "🎯",
        "accent": "💔"
    },
    "hawkeye": {
        "primary": "🎯",
        "secondary": "🏹",
        "accent": "👁️"
    },
    "infinity": {
        "primary": "💎",
        "secondary": "🌀",
        "accent": "✨"
    }
}


# ============================================================================
# ICON MAPPER CLASS
# ============================================================================

class AvengersIconMapper:
    """Maps page keys and statuses to icons based on selected style"""

    def __init__(self, default_style: IconStyle = IconStyle.AVENGERS):
        self.current_style = default_style

    def get_icon(
        self,
        key: str,
        icon_type: str = "page",
        fallback: str = "❓"
    ) -> str:
        """
        Get an icon for a given key.

        Args:
            key: Page key or status key
            icon_type: "page" or "status"
            fallback: Icon to return if key not found

        Returns:
            Icon string for the current style
        """
        if icon_type == "page":
            mapping = PAGE_ICONS.get(key, {})
        elif icon_type == "status":
            mapping = STATUS_ICONS.get(key, {})
        else:
            return fallback

        return mapping.get(self.current_style, fallback)

    def get_hero_icon(self, hero_mode: str, icon_key: str = "primary") -> str:
        """
        Get a hero-specific icon.

        Args:
            hero_mode: Hero mode key (e.g., "captain", "ironman")
            icon_key: "primary", "secondary", or "accent"

        Returns:
            Hero-specific icon
        """
        hero_icons = HERO_SPECIFIC_ICONS.get(hero_mode, {})
        return hero_icons.get(icon_key, "🛡️")

    def set_style(self, style: IconStyle):
        """Change the current icon style"""
        self.current_style = style

    def get_all_page_icons(self) -> Dict[str, str]:
        """Get all page icons in current style"""
        return {
            page_key: icons.get(self.current_style, "❓")
            for page_key, icons in PAGE_ICONS.items()
        }

    def get_all_status_icons(self) -> Dict[str, str]:
        """Get all status icons in current style"""
        return {
            status_key: icons.get(self.current_style, "❓")
            for status_key, icons in STATUS_ICONS.items()
        }


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_page_icon(
    page_key: str,
    style: IconStyle = IconStyle.AVENGERS,
    fallback: str = "❓"
) -> str:
    """
    Quick helper to get a page icon.

    Args:
        page_key: Page key (e.g., "home", "market_watch")
        style: Icon style to use
        fallback: Icon if page not found

    Returns:
        Icon string
    """
    mapping = PAGE_ICONS.get(page_key, {})
    return mapping.get(style, fallback)


def get_status_icon(
    status_key: str,
    style: IconStyle = IconStyle.AVENGERS,
    fallback: str = "❓"
) -> str:
    """
    Quick helper to get a status icon.

    Args:
        status_key: Status key (e.g., "success", "error")
        style: Icon style to use
        fallback: Icon if status not found

    Returns:
        Icon string
    """
    mapping = STATUS_ICONS.get(status_key, {})
    return mapping.get(style, fallback)


def create_icon_style_selector() -> IconStyle:
    """
    Create a Streamlit selector for icon styles.

    Returns:
        Selected IconStyle
    """
    import streamlit as st

    if 'icon_style' not in st.session_state:
        st.session_state.icon_style = IconStyle.AVENGERS

    style_options = {
        "🦸 Avengers Mode": IconStyle.AVENGERS,
        "😀 Emoji Style": IconStyle.EMOJI,
        "◉ Symbols": IconStyle.SYMBOL,
        "A Minimal": IconStyle.MINIMAL
    }

    selected = st.sidebar.selectbox(
        "Icon Style",
        options=list(style_options.keys()),
        key="icon_style_selector"
    )

    if selected:
        new_style = style_options[selected]
        if new_style != st.session_state.icon_style:
            st.session_state.icon_style = new_style
            st.rerun()

    return st.session_state.icon_style
