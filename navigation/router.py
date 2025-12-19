"""
ATLAS Page Router

Takes a page key, finds the handler, calls it.
That's all.

No magic. No framework. Just a function that routes.

Design: Simplicity > Cleverness
"""

from .registry import get_page_by_key, PAGE_REGISTRY


def route_to_page(page_key: str):
    """
    Route to a page by key.

    This is the core routing logic:
    1. Look up the page in registry
    2. Call its handler
    3. Handle errors gracefully

    Args:
        page_key: Key of page to render (e.g., "home", "market_watch")

    Returns:
        None (renders the page as a side effect)
    """
    # Lazy import to avoid requiring streamlit at module load time
    import streamlit as st

    # Look up page in registry
    page = get_page_by_key(page_key)

    # Handle unknown page
    if page is None:
        st.error(f"❌ Unknown page: `{page_key}`")
        st.info("**Available pages:**")

        # Show all available pages for debugging
        for p in PAGE_REGISTRY:
            st.write(f"- `{p.key}`: {p.icon} {p.title}")

        return

    # Call the page handler
    try:
        page.handler()

    except Exception as e:
        # Graceful error handling
        st.error(f"❌ Error rendering page '{page.title}': {e}")

        # Show error details in expander
        import traceback
        with st.expander("🐛 Error Details (for debugging)"):
            st.code(traceback.format_exc())

        # Helpful recovery message
        st.info("""
        **What to do:**
        1. Check the error details above
        2. Verify the page handler is implemented correctly
        3. If this persists, file a bug report
        """)
