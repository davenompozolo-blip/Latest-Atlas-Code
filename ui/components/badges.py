"""
ATLAS Terminal - Badge Component System
Fomo-inspired badge pills for categories, statuses, and tags

Created: December 2024
Phase: 2A - Component Transformation
Author: Hlobo

IMPORTANT: These functions render directly to Streamlit - they do NOT return HTML strings.
"""

import streamlit as st
from typing import Literal, Optional, List, Dict

BadgeType = Literal['primary', 'secondary', 'success', 'warning', 'danger', 'info', 'neutral']
BadgeSize = Literal['xs', 'sm', 'md', 'lg']


def badge(
    text: str,
    badge_type: BadgeType = 'primary',
    size: BadgeSize = 'sm',
    icon: Optional[str] = None,
    glow: bool = False
) -> str:
    """
    Generate HTML string for a single badge pill (internal use).

    NOTE: This returns HTML - it's used by badge_group() and render_badge().
    Don't call this directly unless you're building custom HTML.

    Args:
        text: Badge text content
        badge_type: Visual style (primary, secondary, success, warning, danger, info, neutral)
        size: Badge size (xs, sm, md, lg)
        icon: Optional emoji/icon prefix
        glow: Add glow effect

    Returns:
        str: HTML string for badge (not rendered)
    """

    # Size configurations
    size_config = {
        'xs': {'padding': '0.125rem 0.5rem', 'font': '0.65rem'},
        'sm': {'padding': '0.25rem 0.75rem', 'font': '0.75rem'},
        'md': {'padding': '0.375rem 1rem', 'font': '0.875rem'},
        'lg': {'padding': '0.5rem 1.25rem', 'font': '1rem'},
    }

    # Color configurations
    color_config = {
        'primary': {
            'bg': 'rgba(99, 102, 241, 0.2)',
            'border': 'rgba(99, 102, 241, 0.4)',
            'text': '#a5b4fc',
            'glow': 'rgba(99, 102, 241, 0.5)'
        },
        'secondary': {
            'bg': 'rgba(6, 182, 212, 0.2)',
            'border': 'rgba(6, 182, 212, 0.4)',
            'text': '#67e8f9',
            'glow': 'rgba(6, 182, 212, 0.5)'
        },
        'success': {
            'bg': 'rgba(16, 185, 129, 0.2)',
            'border': 'rgba(16, 185, 129, 0.4)',
            'text': '#6ee7b7',
            'glow': 'rgba(16, 185, 129, 0.5)'
        },
        'warning': {
            'bg': 'rgba(245, 158, 11, 0.2)',
            'border': 'rgba(245, 158, 11, 0.4)',
            'text': '#fcd34d',
            'glow': 'rgba(245, 158, 11, 0.5)'
        },
        'danger': {
            'bg': 'rgba(239, 68, 68, 0.2)',
            'border': 'rgba(239, 68, 68, 0.4)',
            'text': '#fca5a5',
            'glow': 'rgba(239, 68, 68, 0.5)'
        },
        'info': {
            'bg': 'rgba(59, 130, 246, 0.2)',
            'border': 'rgba(59, 130, 246, 0.4)',
            'text': '#93c5fd',
            'glow': 'rgba(59, 130, 246, 0.5)'
        },
        'neutral': {
            'bg': 'rgba(148, 163, 184, 0.15)',
            'border': 'rgba(148, 163, 184, 0.3)',
            'text': '#cbd5e1',
            'glow': 'rgba(148, 163, 184, 0.4)'
        }
    }

    style = size_config.get(size, size_config['sm'])
    colors = color_config.get(badge_type, color_config['primary'])

    icon_html = f"{icon} " if icon else ""
    glow_style = f"box-shadow: 0 0 12px {colors['glow']};" if glow else ""

    return f"""<span style='
        display: inline-block;
        padding: {style['padding']};
        font-size: {style['font']};
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-radius: 12px;
        background: {colors['bg']};
        backdrop-filter: blur(10px);
        border: 1px solid {colors['border']};
        color: {colors['text']};
        transition: all 0.2s ease;
        {glow_style}
    '>{icon_html}{text}</span>"""


def render_badge(
    text: str,
    badge_type: BadgeType = 'primary',
    size: BadgeSize = 'sm',
    icon: Optional[str] = None,
    glow: bool = False
) -> None:
    """
    Render a single badge directly to Streamlit.

    This is the function to use when you want to display ONE badge.

    Args:
        text: Badge text content
        badge_type: Visual style
        size: Badge size
        icon: Optional icon prefix
        glow: Add glow effect

    Example:
        >>> render_badge("Active", "success", "md", "✓")
        >>> render_badge("High Risk", "danger", "lg", "⚠️", glow=True)
    """
    badge_html = badge(text, badge_type, size, icon, glow)
    st.markdown(badge_html, unsafe_allow_html=True)


def badge_group(
    badges: List[Dict],
    spacing: str = '0.5rem',
    wrap: bool = True
) -> None:
    """
    Render multiple badges as a horizontal group.

    This is the function to use when you want to display MULTIPLE badges together.

    IMPORTANT: This function renders directly to Streamlit - it does NOT return anything.

    Args:
        badges: List of badge configurations, each with keys:
                - text (str): Badge text
                - type (str): Badge type (primary/success/warning/danger/info/neutral)
                - size (str): Badge size (xs/sm/md/lg)
                - icon (str, optional): Icon/emoji prefix
                - glow (bool, optional): Enable glow effect
        spacing: Space between badges (CSS unit)
        wrap: Allow badges to wrap to next line

    Example:
        >>> badge_group([
        >>>     {'text': 'Leverage: On Target', 'type': 'success', 'size': 'md', 'icon': '✓'},
        >>>     {'text': 'Strong Performance (+12.5%)', 'type': 'success', 'size': 'md', 'icon': '↑'},
        >>>     {'text': '8 Positions', 'type': 'neutral', 'size': 'md'}
        >>> ])
    """

    badges_html = ""

    for i, b in enumerate(badges):
        badges_html += badge(
            text=b.get('text', ''),
            badge_type=b.get('type', 'primary'),
            size=b.get('size', 'sm'),
            icon=b.get('icon'),
            glow=b.get('glow', False)
        )

        # Add spacing between badges (but not after last one)
        if i < len(badges) - 1:
            badges_html += f"<span style='margin-right: {spacing};'></span>"

    wrap_style = "flex-wrap: wrap;" if wrap else "flex-wrap: nowrap;"

    container_html = f"""
    <div style='
        display: flex;
        align-items: center;
        {wrap_style}
        gap: {spacing};
    '>
        {badges_html}
    </div>
    """

    # ✅ CRITICAL: This calls st.markdown() and returns None
    st.markdown(container_html, unsafe_allow_html=True)


# ==================== COMPONENT TESTING ====================
if __name__ == "__main__":
    """
    Test the badge components in isolation
    Run with: streamlit run ui/components/badges.py
    """
    st.set_page_config(
        page_title="ATLAS - Badge Component Test",
        layout="wide"
    )

    st.title("🏷️ ATLAS Badge Component Tests")

    st.header("1. Single Badges (render_badge)")
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.subheader("Primary")
        render_badge("Primary", "primary", "md")
        render_badge("With Icon", "primary", "sm", "📊")

    with col2:
        st.subheader("Success")
        render_badge("Success", "success", "md")
        render_badge("With Glow", "success", "sm", "✓", glow=True)

    with col3:
        st.subheader("Warning")
        render_badge("Warning", "warning", "md")
        render_badge("Alert", "warning", "sm", "⚠️")

    with col4:
        st.subheader("Danger")
        render_badge("Danger", "danger", "md")
        render_badge("Error", "danger", "sm", "❌")

    st.markdown("---")

    st.header("2. Badge Groups (badge_group)")

    st.subheader("Portfolio Status Badges")
    badge_group([
        {'text': 'Leverage: On Target', 'type': 'success', 'size': 'md', 'icon': '✓'},
        {'text': 'Strong Performance (+12.5%)', 'type': 'success', 'size': 'md', 'icon': '↑'},
        {'text': '8 Positions', 'type': 'neutral', 'size': 'md', 'icon': '📊'}
    ])

    st.markdown("<br>", unsafe_allow_html=True)

    st.subheader("Asset Type Badges")
    badge_group([
        {'text': 'Equity', 'type': 'primary', 'size': 'sm'},
        {'text': 'Fixed Income', 'type': 'info', 'size': 'sm'},
        {'text': 'Alternative', 'type': 'secondary', 'size': 'sm'},
        {'text': 'Cash', 'type': 'neutral', 'size': 'sm'}
    ], spacing='0.75rem')

    st.markdown("<br>", unsafe_allow_html=True)

    st.subheader("Risk Level Badges")
    badge_group([
        {'text': 'Low Risk', 'type': 'success', 'size': 'md', 'icon': '🟢'},
        {'text': 'Medium Risk', 'type': 'warning', 'size': 'md', 'icon': '🟡'},
        {'text': 'High Risk', 'type': 'danger', 'size': 'md', 'icon': '🔴'}
    ])

    st.markdown("---")

    st.header("3. Size Variations")
    badge_group([
        {'text': 'XS Badge', 'type': 'primary', 'size': 'xs'},
        {'text': 'SM Badge', 'type': 'primary', 'size': 'sm'},
        {'text': 'MD Badge', 'type': 'primary', 'size': 'md'},
        {'text': 'LG Badge', 'type': 'primary', 'size': 'lg'}
    ])

    st.success("✅ All badge components rendering correctly!")
