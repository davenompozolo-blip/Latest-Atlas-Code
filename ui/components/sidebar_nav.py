"""
ATLAS Terminal - Sidebar Navigation Component
Matches design spec: 200px sidebar, grouped sections, indigo active indicator.
Includes authentication gate (Phase 7).
"""

import streamlit as st

from config.branding import get_branding, get_theme
from auth.auth_manager import (
    auth_configured,
    get_current_user,
    get_current_tier,
    user_has_tier,
    logout,
    render_login_form,
)
from navigation.registry import TIER_REQUIREMENTS

# Feature flags: sidebar label → session_state key
# Pages with a feature flag are hidden when the flag is False
_FEATURE_FLAGS = {
    "📊 R Analytics": "r_available",
    "💾 Database": "sql_available",
}

# Sidebar key → registry key (for tier lookups)
_NAV_TO_REGISTRY = {
    "🔥 Phoenix Parser": "phoenix_parser",
    "🏠 Portfolio Home": "portfolio_home",
    "📊 R Analytics": "r_analytics",
    "💾 Database": "database",
    "💎 Equity Research": "equity_research",
    "🌐 Macro Intelligence": "macro_intelligence",
    "📚 Fund Research": "fund_research",
    "🌍 Market Watch": "market_watch",
    "🌐 Market Regime": "market_regime",
    "📈 Risk Analysis": "risk_analysis",
    "💎 Performance Suite": "performance_suite",
    "🔬 Portfolio Deep Dive": "portfolio_deep_dive",
    "📊 Multi-Factor Analysis": "multi_factor_analysis",
    "💰 Valuation House": "valuation_house",
    "🎲 Monte Carlo Engine": "monte_carlo_engine",
    "🧮 Quant Optimizer": "quant_optimizer",
    "📊 Leverage Tracker": "leverage_tracker",
    "📡 Investopedia Live": "investopedia_live",
    "⬡ Quant Dashboard": "quant_dashboard",
    "🎯 Strategic Asset Allocation": "saa_tool",
    "📝 Commentary Generator": "commentary_generator",
    "📚 CFA Level II Prep": "cfa_prep",
    "ℹ️ About": "about",
    "⚙️ Admin Panel": "admin_panel",
    "📊 Analytics Dashboard": "analytics_dashboard",
}


def render_sidebar_navigation(default_page: str = "Portfolio Home") -> str:
    """
    Renders sidebar navigation matching the ATLAS design spec exactly.
    200px width, sections (CORE/MARKETS/ANALYSIS), indigo dot + left border active state.
    Pages with a feature flag are hidden when that flag is False in session_state.

    Returns the selected page key, or None if auth is required but user is not logged in.
    """

    NAV_SECTIONS = {
        "Core": [
            {"key": "🔥 Phoenix Parser", "label": "Phoenix Parser"},
            {"key": "🏠 Portfolio Home", "label": "Portfolio Home"},
            {"key": "📊 R Analytics", "label": "R Analytics"},
            {"key": "💾 Database", "label": "Database"},
        ],
        "Research": [
            {"key": "💎 Equity Research", "label": "Equity Research"},
            {"key": "🌐 Macro Intelligence", "label": "Macro Intelligence"},
            {"key": "📚 Fund Research", "label": "Fund Research"},
        ],
        "Markets": [
            {"key": "🌍 Market Watch", "label": "Market Watch"},
            {"key": "🌐 Market Regime", "label": "Market Regime"},
            {"key": "📈 Risk Analysis", "label": "Risk Analysis"},
        ],
        "Analysis": [
            {"key": "💎 Performance Suite", "label": "Performance Suite"},
            {"key": "⬡ Quant Dashboard", "label": "Quant Dashboard"},
            {"key": "🔬 Portfolio Deep Dive", "label": "Portfolio Deep Dive"},
            {"key": "📊 Multi-Factor Analysis", "label": "Multi-Factor Analysis"},
            {"key": "💰 Valuation House", "label": "Valuation House"},
            {"key": "🎲 Monte Carlo Engine", "label": "Monte Carlo Engine"},
            {"key": "🧮 Quant Optimizer", "label": "Quant Optimizer"},
            {"key": "📊 Leverage Tracker", "label": "Leverage Tracker"},
            {"key": "📡 Investopedia Live", "label": "Investopedia Live"},
        ],
        "Strategy": [
            {"key": "🎯 Strategic Asset Allocation", "label": "Strategic Asset Allocation"},
            {"key": "📝 Commentary Generator", "label": "Commentary Generator"},
        ],
        "Study": [
            {"key": "📚 CFA Level II Prep", "label": "CFA Level II Prep"},
        ],
        "System": [
            {"key": "ℹ️ About", "label": "About"},
            {"key": "⚙️ Admin Panel", "label": "Admin Panel"},
            {"key": "📊 Analytics Dashboard", "label": "Analytics Dashboard"},
        ],
    }

    # ── Auth gate — if credentials are configured, require login ──
    with st.sidebar:
        if auth_configured():
            if not get_current_user():
                render_login_form()
                return None  # Block navigation until authenticated
            else:
                # Show user info + logout in sidebar header area
                user_name = st.session_state.get("atlas_auth_name", get_current_user())
                tier = get_current_tier()
                st.markdown(
                    f'<div style="padding:8px 16px 12px; font-size:11px;'
                    f' color:rgba(255,255,255,0.45);">'
                    f'Signed in as <span style="color:{get_branding()["accent_colour"]}; font-weight:600;">'
                    f'{user_name}</span>'
                    f' <span style="font-size:9px; color:rgba(255,255,255,0.25);'
                    f' text-transform:uppercase; letter-spacing:0.5px;">'
                    f'({tier})</span></div>',
                    unsafe_allow_html=True,
                )
                # Manage Billing link for Professional+ users (Phase 9)
                if user_has_tier("professional") and not user_has_tier("admin"):
                    import os
                    _stripe_ok = bool(os.getenv("STRIPE_SECRET_KEY") or
                                      st.secrets.get("stripe", {}).get("secret_key"))
                    if _stripe_ok:
                        if st.button("Manage Billing", key="atlas_billing_btn", use_container_width=True):
                            try:
                                import json
                                from pathlib import Path
                                sub_file = Path(__file__).resolve().parent.parent.parent / ".atlas_subscriptions.json"
                                customer_id = None
                                if sub_file.exists():
                                    subs = json.loads(sub_file.read_text(encoding="utf-8"))
                                    user_sub = subs.get(get_current_user(), {})
                                    customer_id = user_sub.get("stripe_customer_id")
                                if customer_id:
                                    import stripe
                                    stripe.api_key = (os.getenv("STRIPE_SECRET_KEY") or
                                                      st.secrets.get("stripe", {}).get("secret_key", ""))
                                    base_url = os.getenv("ATLAS_BASE_URL", "http://localhost:8501")
                                    portal = stripe.billing_portal.Session.create(
                                        customer=customer_id, return_url=base_url)
                                    st.markdown(
                                        f'<meta http-equiv="refresh" content="0;url={portal.url}">',
                                        unsafe_allow_html=True)
                                else:
                                    st.info("No active subscription found.")
                            except Exception as e:
                                st.error(f"Billing portal error: {e}")

                if st.button("Logout", key="atlas_logout_btn", use_container_width=True):
                    logout()
                    st.rerun()

    if "atlas_selected_page" not in st.session_state:
        for items in NAV_SECTIONS.values():
            for item in items:
                if item["label"] == default_page:
                    st.session_state["atlas_selected_page"] = item["key"]
                    break
        if "atlas_selected_page" not in st.session_state:
            st.session_state["atlas_selected_page"] = "🏠 Portfolio Home"

    selected = st.session_state["atlas_selected_page"]

    with st.sidebar:
        # Sidebar button CSS — make buttons look like nav items from the spec
        st.markdown("""<style>
        /* Nav buttons in sidebar — match design spec nav-item style */
        div[data-testid="stSidebar"] .stButton > button {
            background: transparent !important;
            border: none !important;
            border-left: 2px solid transparent !important;
            color: rgba(255,255,255,0.52) !important;
            font-size: 11.5px !important;
            font-family: 'DM Sans', sans-serif !important;
            padding: 7px 16px !important;
            text-align: left !important;
            width: 100% !important;
            justify-content: flex-start !important;
            border-radius: 0 !important;
            margin: 0 !important;
            font-weight: 400 !important;
            min-height: 0 !important;
            height: auto !important;
            line-height: 1.3 !important;
            letter-spacing: 0.1px !important;
            transition: all 0.2s ease !important;
        }
        div[data-testid="stSidebar"] .stButton > button:hover {
            color: rgba(255,255,255,0.92) !important;
            background: rgba(255,255,255,0.05) !important;
            border-left-color: rgba(255,255,255,0.15) !important;
        }
        div[data-testid="stSidebar"] .stButton > button:focus {
            box-shadow: none !important;
            outline: none !important;
        }
        </style>""", unsafe_allow_html=True)

        # ── Brand Logo (reads from config/branding.toml) ──
        _brand = get_branding()
        st.markdown(f"""
        <div style="padding: 0 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.07); margin-bottom: 8px;">
            <div style="font-family: 'Syne', sans-serif; font-size: 19px; font-weight: 700;
                        letter-spacing: 3px; color: {_brand['accent_colour']};
                        text-shadow: 0 0 20px {_brand['accent_colour']}66;">{_brand['logo_text']}</div>
            <div style="font-size: 11px; color: rgba(255,255,255,0.35);
                        letter-spacing: 1.8px; text-transform: uppercase; margin-top: 3px;">{_brand['tagline']}</div>
        </div>
        """, unsafe_allow_html=True)

        # ── Render Sections ──
        for section_name, items in NAV_SECTIONS.items():
            # Section header
            st.markdown(f'''
            <div style="padding: 10px 16px 3px; font-size: 8.5px; letter-spacing: 2px;
                        text-transform: uppercase; color: rgba(255,255,255,0.28);">
                {section_name}
            </div>''', unsafe_allow_html=True)

            for item in items:
                # Skip pages whose feature flag is False
                flag_key = _FEATURE_FLAGS.get(item["key"])
                if flag_key and not st.session_state.get(flag_key, False):
                    continue

                # Tier gating — show lock icon for pages the user can't access
                registry_key = _NAV_TO_REGISTRY.get(item["key"], "")
                required_tier = TIER_REQUIREMENTS.get(registry_key)
                is_locked = (
                    auth_configured()
                    and required_tier
                    and not user_has_tier(required_tier)
                )

                is_active = item["key"] == selected
                if is_locked:
                    # Locked — show dimmed label with lock icon (still clickable for upgrade prompt)
                    if st.button(f"🔒  {item['label']}", key=f"nav_{item['key']}", use_container_width=True):
                        st.session_state["atlas_selected_page"] = item["key"]
                        st.rerun()
                elif is_active:
                    # Active state — branded accent border + dot + bright text
                    _pc = _brand['primary_colour']
                    st.markdown(f'''
                    <div style="display: flex; align-items: center; gap: 8px;
                                padding: 7px 16px; font-size: 11.5px;
                                line-height: 1.3; letter-spacing: 0.1px;
                                color: rgba(255,255,255,0.92); cursor: default;
                                background: {_pc}1a;
                                border-left: 2px solid {_pc};
                                position: relative;">
                        <div style="width: 5px; height: 5px; border-radius: 50%;
                                    background: {_pc}; flex-shrink: 0;"></div>
                        <span style="font-family: 'DM Sans', sans-serif;">{item['label']}</span>
                        <div style="position: absolute; right: 0; top: 20%; width: 3px; height: 60%;
                                    background: {_pc}; border-radius: 2px 0 0 2px; opacity: 0.5;"></div>
                    </div>''', unsafe_allow_html=True)
                else:
                    # Inactive — clickable button with dot prefix
                    if st.button(f"●  {item['label']}", key=f"nav_{item['key']}", use_container_width=True):
                        st.session_state["atlas_selected_page"] = item["key"]
                        st.rerun()

    return selected
