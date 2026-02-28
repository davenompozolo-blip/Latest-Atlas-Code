"""
ATLAS Terminal — Admin Panel
==============================
User management interface for admin-tier users.
View users, update tiers, deactivate accounts.

Only accessible to users with tier == 'admin'.
"""
from __future__ import annotations

import csv
import os
from datetime import datetime
from pathlib import Path

import streamlit as st

from auth.auth_manager import (
    get_current_tier,
    hash_password,
    TIER_LEVELS,
)


_USAGE_LOG = Path(__file__).resolve().parent.parent.parent / "atlas_usage.csv"
_ERROR_LOG = Path(__file__).resolve().parent.parent.parent / "atlas_errors.log"


def render_admin_panel():
    """Render the admin panel (admin tier only)."""

    if get_current_tier() != "admin":
        st.error("Access denied. Admin tier required.")
        return

    st.markdown(
        '<h1 style="font-size: 2rem; font-weight: 800;'
        ' color: rgba(255,255,255,0.92); margin-bottom: 0;">'
        'ADMIN PANEL</h1>',
        unsafe_allow_html=True,
    )
    st.caption("User management, usage analytics, and system health")

    tab_users, tab_usage, tab_errors, tab_tools = st.tabs([
        "User Management",
        "Usage Analytics",
        "Error Log",
        "Admin Tools",
    ])

    # ── Tab 1: User Management ──
    with tab_users:
        _render_user_management()

    # ── Tab 2: Usage Analytics ──
    with tab_usage:
        _render_usage_analytics()

    # ── Tab 3: Error Log ──
    with tab_errors:
        _render_error_log()

    # ── Tab 4: Admin Tools ──
    with tab_tools:
        _render_admin_tools()


# ---------------------------------------------------------------------------
# User Management
# ---------------------------------------------------------------------------

def _render_user_management():
    """View and manage user accounts."""
    st.markdown("##### Active Users")

    try:
        credentials = st.secrets["auth"]["credentials"]
    except (KeyError, FileNotFoundError):
        st.warning(
            "No credentials configured in st.secrets. "
            "Add users to `.streamlit/secrets.toml` under `[auth.credentials]`."
        )
        return

    # Load subscription status (Phase 9 — Stripe)
    import json
    _sub_file = Path(__file__).resolve().parent.parent.parent / ".atlas_subscriptions.json"
    _tier_file = Path(__file__).resolve().parent.parent.parent / ".atlas_tier_overrides.json"
    _subs = {}
    _overrides = {}
    if _sub_file.exists():
        try:
            _subs = json.loads(_sub_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    if _tier_file.exists():
        try:
            _overrides = json.loads(_tier_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    # Display current users
    rows = []
    for username, cfg in credentials.items():
        effective_tier = _overrides.get(username, {}).get("tier", cfg.get("tier", "free"))
        sub_status = _subs.get(username, {}).get("status", "—")
        rows.append({
            "Username": username,
            "Name": cfg.get("name", ""),
            "Email": cfg.get("email", ""),
            "Config Tier": cfg.get("tier", "free"),
            "Effective Tier": effective_tier,
            "Subscription": sub_status,
        })

    if rows:
        st.dataframe(
            rows,
            use_container_width=True,
            hide_index=True,
        )
    else:
        st.info("No users found.")

    st.markdown("---")
    st.markdown("##### Add New User")
    st.info(
        "To add or modify users, update the `[auth.credentials]` section in "
        "`.streamlit/secrets.toml` (local) or the Secrets panel (Streamlit Cloud / "
        "container environment variables)."
    )

    # Password hash generator
    st.markdown("##### Password Hash Generator")
    with st.form("hash_form"):
        new_pw = st.text_input("Password to hash", type="password")
        if st.form_submit_button("Generate Hash"):
            if new_pw:
                hashed = hash_password(new_pw)
                st.code(hashed, language="text")
                st.caption("Copy this hash into your secrets config for the user's password field.")
            else:
                st.warning("Enter a password first.")


# ---------------------------------------------------------------------------
# Usage Analytics
# ---------------------------------------------------------------------------

def _render_usage_analytics():
    """Display usage statistics from atlas_usage.csv."""
    if not _USAGE_LOG.exists():
        st.info("No usage data yet. Usage tracking starts on first page navigation.")
        return

    try:
        import pandas as pd
        df = pd.read_csv(str(_USAGE_LOG))
        st.markdown(f"##### Usage Log ({len(df)} entries)")

        # Summary metrics
        col1, col2, col3 = st.columns(3)
        with col1:
            unique_users = df["username"].nunique() if "username" in df.columns else 0
            st.metric("Unique Users", unique_users)
        with col2:
            unique_pages = df["page"].nunique() if "page" in df.columns else 0
            st.metric("Pages Used", unique_pages)
        with col3:
            st.metric("Total Page Views", len(df))

        # Most viewed pages
        if "page" in df.columns:
            st.markdown("##### Most Viewed Pages")
            page_counts = df["page"].value_counts().head(10)
            st.bar_chart(page_counts)

        # Recent activity
        st.markdown("##### Recent Activity")
        st.dataframe(
            df.tail(50).iloc[::-1],
            use_container_width=True,
            hide_index=True,
        )

    except Exception as e:
        st.error(f"Error reading usage log: {e}")


# ---------------------------------------------------------------------------
# Error Log
# ---------------------------------------------------------------------------

def _render_error_log():
    """Display recent errors from atlas_errors.log."""
    if not _ERROR_LOG.exists():
        st.success("No errors logged.")
        return

    try:
        content = _ERROR_LOG.read_text(encoding="utf-8")
        lines = content.strip().split("\n")
        st.markdown(f"##### Error Log ({len(lines)} entries)")

        # Show last 50 lines
        recent = "\n".join(lines[-50:])
        st.code(recent, language="text")

        if st.button("Clear Error Log"):
            _ERROR_LOG.write_text("", encoding="utf-8")
            st.success("Error log cleared.")
            st.rerun()

    except Exception as e:
        st.error(f"Error reading error log: {e}")


# ---------------------------------------------------------------------------
# Admin Tools
# ---------------------------------------------------------------------------

def _render_admin_tools():
    """System administration tools."""
    st.markdown("##### System Info")

    import sys
    col1, col2 = st.columns(2)
    with col1:
        st.text(f"Python: {sys.version.split()[0]}")
        st.text(f"Streamlit: {st.__version__}")
    with col2:
        st.text(f"Working Dir: {os.getcwd()}")
        st.text(f"PID: {os.getpid()}")

    st.markdown("---")
    st.markdown("##### Tier Configuration")

    from navigation.registry import TIER_REQUIREMENTS
    tier_data = {}
    for page_key, tier in TIER_REQUIREMENTS.items():
        tier_data.setdefault(tier, []).append(page_key)

    for tier_name in sorted(tier_data.keys()):
        pages = tier_data[tier_name]
        st.markdown(f"**{tier_name.title()}** ({len(pages)} pages)")
        st.text(", ".join(sorted(pages)))

    free_pages = [
        k for k in [
            "phoenix_parser", "portfolio_home", "market_watch",
            "about", "database", "r_analytics",
        ]
    ]
    st.markdown(f"**Free** ({len(free_pages)} pages)")
    st.text(", ".join(free_pages))

    st.markdown("---")
    st.markdown("##### Manual Tier Override")
    st.caption("For comp accounts, enterprise deals, or testing. Overrides Stripe-driven tier.")
    with st.form("tier_override_form"):
        override_user = st.text_input("Username")
        override_tier = st.selectbox("New Tier", list(TIER_LEVELS.keys()))
        if st.form_submit_button("Apply Override"):
            if override_user:
                from auth.auth_manager import update_user_tier
                update_user_tier(override_user, override_tier)
                st.success(f"Tier override applied: {override_user} → {override_tier}")
            else:
                st.warning("Enter a username.")

    st.markdown("---")
    st.markdown("##### Cache Management")
    if st.button("Clear Streamlit Cache"):
        st.cache_data.clear()
        st.success("Cache cleared.")
