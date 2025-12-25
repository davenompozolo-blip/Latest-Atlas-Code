"""
ATLAS Terminal - Badge Pill Component
Rounded badge pills for categories, statuses, and tags

Fomo-inspired glassmorphic badges with gradient accents

Created: December 2024
Phase: 2A - Component Transformation
Author: Hlobo & Claude
"""

import streamlit as st
from typing import Literal, Optional

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
    Create Fomo-style badge pill

    Args:
        text: Badge text content
        badge_type: Visual style (primary, secondary, success, warning, danger, info, neutral)
        size: Badge size (xs, sm, md, lg)
        icon: Optional emoji/icon prefix
        glow: Enable subtle glow effect

    Returns:
        HTML string for badge

    Example:
        >>> badge("Active", "success", "sm", "✓")
        >>> badge("High Risk", "danger", "md", "⚠️")
        >>> badge("BUY", "success", "md", "▲", glow=True)
    """

    # Size mappings
    sizes = {
        'xs': {
            'padding': '0.125rem 0.5rem',
            'font': '0.65rem',
            'radius': '8px'
        },
        'sm': {
            'padding': '0.25rem 0.75rem',
            'font': '0.75rem',
            'radius': '10px'
        },
        'md': {
            'padding': '0.375rem 1rem',
            'font': '0.875rem',
            'radius': '12px'
        },
        'lg': {
            'padding': '0.5rem 1.25rem',
            'font': '1rem',
            'radius': '14px'
        },
    }

    # Color mappings - Fomo-inspired glassmorphic
    colors = {
        'primary': {
            'bg': 'rgba(99, 102, 241, 0.2)',
            'border': 'rgba(99, 102, 241, 0.4)',
            'text': '#a5b4fc',
            'glow': '0 0 12px rgba(99, 102, 241, 0.4)'
        },
        'secondary': {
            'bg': 'rgba(6, 182, 212, 0.2)',
            'border': 'rgba(6, 182, 212, 0.4)',
            'text': '#67e8f9',
            'glow': '0 0 12px rgba(6, 182, 212, 0.4)'
        },
        'success': {
            'bg': 'rgba(16, 185, 129, 0.2)',
            'border': 'rgba(16, 185, 129, 0.4)',
            'text': '#6ee7b7',
            'glow': '0 0 12px rgba(16, 185, 129, 0.4)'
        },
        'warning': {
            'bg': 'rgba(245, 158, 11, 0.2)',
            'border': 'rgba(245, 158, 11, 0.4)',
            'text': '#fcd34d',
            'glow': '0 0 12px rgba(245, 158, 11, 0.4)'
        },
        'danger': {
            'bg': 'rgba(239, 68, 68, 0.2)',
            'border': 'rgba(239, 68, 68, 0.4)',
            'text': '#fca5a5',
            'glow': '0 0 12px rgba(239, 68, 68, 0.4)'
        },
        'info': {
            'bg': 'rgba(59, 130, 246, 0.2)',
            'border': 'rgba(59, 130, 246, 0.4)',
            'text': '#93c5fd',
            'glow': '0 0 12px rgba(59, 130, 246, 0.4)'
        },
        'neutral': {
            'bg': 'rgba(148, 163, 184, 0.15)',
            'border': 'rgba(148, 163, 184, 0.3)',
            'text': '#cbd5e1',
            'glow': '0 0 12px rgba(148, 163, 184, 0.3)'
        }
    }

    style = sizes[size]
    color = colors[badge_type]
    icon_html = f"{icon} " if icon else ""
    glow_effect = f"box-shadow: {color['glow']};" if glow else ""

    return f"""<span style='
        display: inline-block;
        padding: {style['padding']};
        font-size: {style['font']};
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-radius: {style['radius']};
        background: {color['bg']};
        backdrop-filter: blur(10px);
        border: 1px solid {color['border']};
        color: {color['text']};
        {glow_effect}
        transition: all 0.2s ease;
    '>{icon_html}{text}</span>"""


def render_badge(
    text: str,
    badge_type: BadgeType = 'primary',
    size: BadgeSize = 'sm',
    icon: Optional[str] = None,
    glow: bool = False
):
    """Render badge directly in Streamlit"""
    st.markdown(badge(text, badge_type, size, icon, glow), unsafe_allow_html=True)


def badge_group(badges: list, spacing: str = '0.5rem'):
    """
    Render multiple badges in a horizontal group

    Args:
        badges: List of badge configurations [{'text': 'Active', 'type': 'success'}, ...]
        spacing: Space between badges

    Example:
        >>> badge_group([
        >>>     {'text': 'Tech', 'type': 'primary'},
        >>>     {'text': 'Growth', 'type': 'success'},
        >>>     {'text': 'High Risk', 'type': 'warning', 'icon': '⚠️'}
        >>> ])
    """
    badges_html = ""
    for b in badges:
        badges_html += badge(
            text=b.get('text', ''),
            badge_type=b.get('type', 'primary'),
            size=b.get('size', 'sm'),
            icon=b.get('icon'),
            glow=b.get('glow', False)
        )
        badges_html += f"<span style='margin-right: {spacing};'></span>"

    st.markdown(f"<div style='display: flex; align-items: center; flex-wrap: wrap;'>{badges_html}</div>",
                unsafe_allow_html=True)


# ==================== COMPONENT TESTING ====================
if __name__ == "__main__":
    """
    Test the badge component in isolation
    Run with: streamlit run ui/components/badges.py
    """
    st.set_page_config(
        page_title="ATLAS - Badge Component Test",
        page_icon="🏷️",
        layout="wide",
        initial_sidebar_state="collapsed"
    )

    st.title("🏷️ ATLAS Badge Component - Test Suite")
    st.markdown("---")

    # Test 1: All Badge Types
    st.subheader("Badge Types")
    col1, col2 = st.columns(2)

    with col1:
        st.markdown("**Standard Badges:**")
        render_badge("Primary", "primary", "md")
        st.write("")
        render_badge("Secondary", "secondary", "md")
        st.write("")
        render_badge("Success", "success", "md")
        st.write("")
        render_badge("Warning", "warning", "md")

    with col2:
        st.markdown("**Status Badges:**")
        render_badge("Danger", "danger", "md")
        st.write("")
        render_badge("Info", "info", "md")
        st.write("")
        render_badge("Neutral", "neutral", "md")

    st.markdown("---")

    # Test 2: Sizes
    st.subheader("Badge Sizes")
    render_badge("Extra Small", "primary", "xs")
    st.write("")
    render_badge("Small", "primary", "sm")
    st.write("")
    render_badge("Medium", "primary", "md")
    st.write("")
    render_badge("Large", "primary", "lg")

    st.markdown("---")

    # Test 3: With Icons
    st.subheader("Badges with Icons")
    col1, col2, col3 = st.columns(3)

    with col1:
        render_badge("Active", "success", "md", "✓")
    with col2:
        render_badge("High Risk", "danger", "md", "⚠️")
    with col3:
        render_badge("BUY", "success", "md", "▲")

    st.markdown("---")

    # Test 4: Glow Effect
    st.subheader("Glow Effect")
    col1, col2 = st.columns(2)

    with col1:
        st.markdown("**Without Glow:**")
        render_badge("Standard", "primary", "md", glow=False)
    with col2:
        st.markdown("**With Glow:**")
        render_badge("Glowing", "primary", "md", glow=True)

    st.markdown("---")

    # Test 5: Badge Groups
    st.subheader("Badge Groups")
    badge_group([
        {'text': 'Technology', 'type': 'primary', 'size': 'sm'},
        {'text': 'Growth', 'type': 'success', 'size': 'sm'},
        {'text': 'High Risk', 'type': 'warning', 'size': 'sm', 'icon': '⚠️'},
        {'text': 'USA', 'type': 'info', 'size': 'sm'},
    ])

    st.markdown("---")

    # Test 6: Real-World Examples
    st.subheader("Real-World Examples")

    st.markdown("**Portfolio Holdings:**")
    badge_group([
        {'text': 'AAPL', 'type': 'primary', 'size': 'md'},
        {'text': '+15.2%', 'type': 'success', 'size': 'sm', 'icon': '↑'},
        {'text': 'Tech', 'type': 'info', 'size': 'sm'},
    ])

    st.write("")
    st.markdown("**Risk Analysis:**")
    badge_group([
        {'text': 'Moderate Risk', 'type': 'warning', 'size': 'md', 'icon': '⚠️'},
        {'text': 'Beta: 1.2', 'type': 'neutral', 'size': 'sm'},
        {'text': 'Diversified', 'type': 'success', 'size': 'sm', 'icon': '✓'},
    ])

    st.write("")
    st.markdown("**Trading Signals:**")
    badge_group([
        {'text': 'STRONG BUY', 'type': 'success', 'size': 'lg', 'icon': '▲', 'glow': True},
        {'text': '95% Confidence', 'type': 'primary', 'size': 'sm'},
    ])

    st.markdown("---")
    st.success("✅ Badge component test complete!")
    st.info("**Usage:** Import with `from ui.components.badges import badge, render_badge, badge_group`")
