"""
ATLAS Sidebar Navigation

Renders the navigation UI.
Uses registry as source of truth.

Pure UI composition - no business logic.

Design: Presentation layer only
"""

from .registry import get_available_pages


def render_sidebar() -> str:
    """
    Render sidebar navigation and return selected page key.

    This is the main sidebar UI:
    1. Get available pages from registry
    2. Render navigation menu
    3. Return selected page key

    Returns:
        str: Key of selected page (e.g., "home", "market_watch")
    """
    # Lazy import to avoid requiring streamlit at module load time
    import streamlit as st

    with st.sidebar:
        # Header
        st.title("🚀 ATLAS Terminal")
        st.markdown("---")

        # Get available pages from registry
        pages = get_available_pages()

        # Build navigation options
        page_options = {f"{p.icon} {p.title}": p.key for p in pages}
        page_labels = list(page_options.keys())

        # Render navigation
        selected_label = st.radio(
            "Navigation",
            page_labels,
            key="main_navigation"
        )

        # Map selected label back to page key
        selected_key = page_options[selected_label]

        # Optional: Show system status
        st.markdown("---")
        _render_system_status()

        return selected_key


def _render_system_status():
    """
    Show system status indicators.

    This is optional metadata shown in sidebar.
    Can be expanded later with more sophisticated status.
    """
    import streamlit as st

    with st.expander("📊 System Status", expanded=False):
        # Check data sources
        if 'leverage_tracker' in st.session_state:
            st.success("✅ Performance History Loaded")
        else:
            st.info("⚙️ Manual Configuration Mode")

        # Check database
        try:
            from data.atlas_db import get_db
            db = get_db()
            st.success("✅ Database Connected")
        except:
            st.warning("⚠️ Database Not Available")

        # Show navigation system version
        from . import __version__
        st.caption(f"Navigation v{__version__}")
