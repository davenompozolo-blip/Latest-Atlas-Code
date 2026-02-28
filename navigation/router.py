"""
ATLAS Page Router

Takes a page key, finds the handler, calls it.
That's all.

No magic. No framework. Just a function that routes.

Design: Simplicity > Cleverness
"""

from .registry import get_page_by_key, PAGE_REGISTRY, TIER_REQUIREMENTS


def _render_upgrade_prompt(page_title: str, required_tier: str):
    """Render upgrade prompt for gated pages."""
    import streamlit as st
    try:
        from config.branding import get_branding
        _accent = get_branding()["accent_colour"]
        _primary = get_branding()["primary_colour"]
    except Exception:
        _accent, _primary = "#00d4ff", "#6366f1"

    st.markdown(
        '<div style="text-align:center; margin-top:6rem;">'
        '<div style="font-size:48px; margin-bottom:1rem;">&#128274;</div>'
        f'<h2 style="color:rgba(255,255,255,0.85); margin-bottom:0.5rem;">'
        f'{page_title}</h2>'
        f'<p style="color:rgba(255,255,255,0.45); font-size:14px;">'
        f'This page requires the <span style="color:{_accent}; font-weight:700;">'
        f'{required_tier.title()}</span> tier.</p>'
        '</div>',
        unsafe_allow_html=True,
    )

    # Stripe upgrade button (Phase 9)
    import os
    _stripe_configured = bool(os.getenv("STRIPE_SECRET_KEY") or
                              st.secrets.get("stripe", {}).get("secret_key"))
    if _stripe_configured and required_tier == "professional":
        col1, col2, col3 = st.columns([1, 2, 1])
        with col2:
            st.markdown(
                f'<div style="text-align:center; padding:1.5rem; background:{_primary}0f;'
                f' border:1px solid {_primary}2e; border-radius:12px; max-width:400px;'
                ' margin:1rem auto;">'
                '<p style="font-size:15px; font-weight:600; color:rgba(255,255,255,0.85);'
                ' margin:0 0 4px;">Upgrade to Professional</p>'
                '<p style="font-size:13px; color:rgba(255,255,255,0.5); margin:0 0 12px;">'
                'R499/month &middot; Cancel anytime</p>'
                '</div>',
                unsafe_allow_html=True,
            )
            if st.button("Upgrade Now", key="stripe_upgrade_btn", use_container_width=True):
                try:
                    import stripe
                    stripe.api_key = (os.getenv("STRIPE_SECRET_KEY") or
                                      st.secrets.get("stripe", {}).get("secret_key", ""))
                    price_id = (os.getenv("STRIPE_PRICE_ID") or
                                st.secrets.get("stripe", {}).get("price_id", ""))
                    base_url = os.getenv("ATLAS_BASE_URL", "http://localhost:8501")
                    username = st.session_state.get("atlas_auth_user", "unknown")
                    email = st.session_state.get("atlas_auth_email", None)

                    session = stripe.checkout.Session.create(
                        payment_method_types=["card"],
                        line_items=[{"price": price_id, "quantity": 1}],
                        mode="subscription",
                        success_url=f"{base_url}?upgrade=success",
                        cancel_url=f"{base_url}?upgrade=cancelled",
                        client_reference_id=username,
                        customer_email=email,
                    )
                    st.markdown(
                        f'<meta http-equiv="refresh" content="0;url={session.url}">',
                        unsafe_allow_html=True,
                    )
                except Exception as e:
                    st.error(f"Payment setup failed: {e}")
    else:
        st.markdown(
            f'<div style="text-align:center; margin-top:1rem; padding:1.5rem;'
            f' background:{_primary}0f; border:1px solid {_primary}2e;'
            ' border-radius:12px; display:inline-block; max-width:400px;">'
            '<p style="font-size:13px; color:rgba(255,255,255,0.6); margin:0;">'
            'Contact your administrator to upgrade your access tier.</p>'
            '</div>',
            unsafe_allow_html=True,
        )


def route_to_page(page_key: str):
    """
    Route to a page by key.

    This is the core routing logic:
    1. Look up the page in registry
    2. Check tier requirements
    3. Call its handler
    4. Handle errors gracefully

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
        st.error(f"Unknown page: `{page_key}`")
        st.info("**Available pages:**")

        # Show all available pages for debugging
        for p in PAGE_REGISTRY:
            st.write(f"- `{p.key}`: {p.icon} {p.title}")

        return

    # Tier enforcement (Phase 7 B2)
    required_tier = TIER_REQUIREMENTS.get(page_key)
    if required_tier:
        try:
            from auth.auth_manager import user_has_tier, auth_configured
            if auth_configured() and not user_has_tier(required_tier):
                _render_upgrade_prompt(page.title, required_tier)
                return
        except ImportError:
            pass  # Auth not available — allow access

    # Call the page handler
    try:
        page.handler()

    except Exception as e:
        # Graceful error handling
        st.error(f"Error rendering page '{page.title}': {e}")

        # Show error details in expander
        import traceback
        with st.expander("Error Details (for debugging)"):
            st.code(traceback.format_exc())

        # Helpful recovery message
        st.info("""
        **What to do:**
        1. Check the error details above
        2. Verify the page handler is implemented correctly
        3. If this persists, file a bug report
        """)
