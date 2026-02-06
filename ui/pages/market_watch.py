"""
ATLAS Terminal - Market Watch Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_market_watch():
    """Render the Market Watch page."""
    # Import only what's needed from core
    from core import ATLASFormatter
    from ui.components import ATLAS_TEMPLATE


    # Auto-install missing dependencies for Market Watch
    try:
        import investpy
    except ImportError:
        import subprocess
        subprocess.run(["pip", "install", "investpy", "--break-system-packages"],
                       capture_output=True, check=False)

    try:
        import feedparser
    except ImportError:
        import subprocess
        subprocess.run(["pip", "install", "feedparser", "--break-system-packages"],
                       capture_output=True, check=False)

    st.markdown('<h1 style="font-size: 2.5rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.5rem;"><span style="font-size: 2rem;">🌍</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">MARKET WATCH</span></h1>', unsafe_allow_html=True)
    # Build version indicator (helps verify latest code is loaded)
    st.caption("Build: 2026.01.11-v1 | HTML Fix + Universal CSS")

    # ============================================================
    # NUCLEAR CSS FIX - COMPLETE CIRCLE REMOVAL (UNIVERSAL)
    # Applies to ALL radio buttons, not just "Select View"
    # ============================================================
    st.markdown("""
    <style>
    /* ========================================================== */
    /* NUCLEAR OPTION: Force remove ALL radio button circles     */
    /* UNIVERSAL - applies to ALL radio buttons in the app       */
    /* ========================================================== */

    /* Hide the actual radio input - absolute positioning */
    div[data-testid="stRadio"] input[type="radio"] {
        position: absolute !important;
        opacity: 0 !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
    }

    /* Hide the circle indicator div - NUCLEAR */
    div[data-testid="stRadio"] > div > label > div:first-child {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        width: 0 !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        position: absolute !important;
        left: -9999px !important;
    }

    /* Force remove any SVG circles (Streamlit sometimes uses these) */
    div[data-testid="stRadio"] svg {
        display: none !important;
    }

    /* Force remove any circle-like elements */
    div[data-testid="stRadio"] [class*="circle"],
    div[data-testid="stRadio"] [class*="radio"],
    div[data-testid="stRadio"] [class*="indicator"] {
        display: none !important;
    }

    /* Layout - horizontal with gap */
    div[data-testid="stRadio"] > div {
        flex-direction: row !important;
        gap: 0.75rem !important;
        flex-wrap: wrap !important;
        justify-content: flex-start !important;
    }

    /* Hide the label above radio group */
    div[data-testid="stRadio"] > label {
        display: none !important;
    }

    /* Gradient button styling */
    div[data-testid="stRadio"] > div > label {
        background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%) !important;
        padding: 0.75rem 1.5rem !important;
        border-radius: 0.5rem !important;
        cursor: pointer !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        border: 1px solid rgba(59, 130, 246, 0.2) !important;
        backdrop-filter: blur(10px) !important;
        color: #e2e8f0 !important;
        font-weight: 500 !important;
        font-size: 0.875rem !important;
        user-select: none !important;
    }

    /* Hover state */
    div[data-testid="stRadio"] > div > label:hover {
        background: linear-gradient(135deg, rgba(51, 65, 85, 0.9) 0%, rgba(30, 41, 59, 0.95) 100%) !important;
        border-color: rgba(59, 130, 246, 0.5) !important;
        transform: translateY(-2px) !important;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2) !important;
    }

    /* Selected state - using :has() for better compatibility */
    div[data-testid="stRadio"] > div > label:has(input:checked) {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
        border-color: #3b82f6 !important;
        box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4) !important;
        transform: translateY(-2px) !important;
        color: white !important;
    }

    /* Ensure text content inherits color properly */
    div[data-testid="stRadio"] > div > label > div {
        color: inherit !important;
    }

    div[data-testid="stRadio"] > div > label > div:last-child {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
    }
    </style>
    """, unsafe_allow_html=True)

    # Sub-navigation for Market Watch
    market_watch_tab = st.radio(
        "Select View",
        ["📊 Overview", "📈 Stocks", "🏢 Sectors", "📅 Economic Calendar", "📰 News"],
        horizontal=True,
        key="market_watch_nav",
        label_visibility="collapsed"
    )

    # Render selected page using original market_watch_components module
    from market_watch_components import render_market_watch_page
    render_market_watch_page(market_watch_tab)

