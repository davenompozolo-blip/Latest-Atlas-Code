"""
ATLAS Terminal — Usage Analytics Dashboard (Phase 9, Initiative 2)
====================================================================
Admin-only analytics view built from atlas_usage.csv.
Five panels: Active Users, Page Heatmap, Session Depth,
Feature Adoption, Revenue Summary.

Module Pattern Contract: single public render function, zero-argument.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from auth.auth_manager import get_current_tier
from config.branding import get_branding

_USAGE_LOG = Path(__file__).resolve().parent.parent.parent / "atlas_usage.csv"
_SUB_FILE = Path(__file__).resolve().parent.parent.parent / ".atlas_subscriptions.json"
_TIER_FILE = Path(__file__).resolve().parent.parent.parent / ".atlas_tier_overrides.json"

# Professional-tier features for adoption tracking
_PRO_FEATURES = {
    "saa_tool": "Strategic Asset Allocation",
    "commentary_generator": "Commentary Generator",
    "monte_carlo_engine": "Monte Carlo Engine",
    "quant_optimizer": "Quant Optimizer",
    "risk_analysis": "Risk Analysis",
    "performance_suite": "Performance Suite",
    "market_regime": "Market Regime",
    "portfolio_deep_dive": "Portfolio Deep Dive",
    "equity_research": "Equity Research",
    "macro_intelligence": "Macro Intelligence",
}

# Chart layout matching ATLAS dark theme
_CHART_LAYOUT = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(color="rgba(255,255,255,0.7)", size=11),
    margin=dict(l=40, r=20, t=30, b=40),
    xaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
    yaxis=dict(gridcolor="rgba(255,255,255,0.05)"),
)


def render_analytics_dashboard():
    """Render the usage analytics dashboard (admin only)."""

    if get_current_tier() != "admin":
        st.error("Access denied. Admin tier required.")
        return

    brand = get_branding()

    st.markdown(
        '<h1 style="font-size:2rem; font-weight:800;'
        ' color:rgba(255,255,255,0.92); margin-bottom:0;">'
        'USAGE ANALYTICS</h1>',
        unsafe_allow_html=True,
    )
    st.caption("Product analytics from atlas_usage.csv")

    if not _USAGE_LOG.exists():
        st.info("No usage data yet. Analytics populate after users navigate pages.")
        return

    df = _load_usage_data()
    if df.empty:
        st.info("Usage log is empty.")
        return

    # Top-level metrics
    now = datetime.now()
    last_30 = now - timedelta(days=30)
    df_30 = df[df["dt"] >= last_30]

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Active Users (30d)", df_30["username"].nunique())
    c2.metric("Total Sessions (30d)", _count_sessions(df_30))
    c3.metric("Page Views (30d)", len(df_30))
    c4.metric("Avg Session Depth", f"{_avg_session_depth(df_30):.1f}")

    st.markdown("---")

    # Five panels
    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "Active Users",
        "Page Heatmap",
        "Session Depth",
        "Feature Adoption",
        "Revenue Summary",
    ])

    with tab1:
        _render_active_users(df, brand)
    with tab2:
        _render_page_heatmap(df, brand)
    with tab3:
        _render_session_depth(df, brand)
    with tab4:
        _render_feature_adoption(df, brand)
    with tab5:
        _render_revenue_summary(brand)


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

@st.cache_data(ttl=60)
def _load_usage_data() -> pd.DataFrame:
    """Load and parse atlas_usage.csv."""
    try:
        df = pd.read_csv(str(_USAGE_LOG))
        df["dt"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df.dropna(subset=["dt"])
        df["date"] = df["dt"].dt.date
        df["hour"] = df["dt"].dt.hour
        df["dow"] = df["dt"].dt.day_name()
        return df
    except Exception:
        return pd.DataFrame()


# ---------------------------------------------------------------------------
# Session helpers (30-minute window)
# ---------------------------------------------------------------------------

def _assign_sessions(df: pd.DataFrame) -> pd.DataFrame:
    """Assign session IDs based on 30-minute inactivity windows."""
    if df.empty:
        return df.assign(session_id=pd.Series(dtype="int"))

    result = df.sort_values(["username", "dt"]).copy()
    result["time_gap"] = result.groupby("username")["dt"].diff()
    result["new_session"] = (
        result["time_gap"].isna() |
        (result["time_gap"] > timedelta(minutes=30))
    )
    result["session_id"] = result.groupby("username")["new_session"].cumsum()
    return result


def _count_sessions(df: pd.DataFrame) -> int:
    s = _assign_sessions(df)
    if s.empty:
        return 0
    return s.groupby("username")["session_id"].nunique().sum()


def _avg_session_depth(df: pd.DataFrame) -> float:
    s = _assign_sessions(df)
    if s.empty:
        return 0.0
    depths = s.groupby(["username", "session_id"]).size()
    return float(depths.mean()) if len(depths) > 0 else 0.0


# ---------------------------------------------------------------------------
# Panel 1: Active Users
# ---------------------------------------------------------------------------

def _render_active_users(df: pd.DataFrame, brand: dict):
    st.markdown("##### Active Users (Last 30 Days)")

    now = datetime.now()
    last_30 = now - timedelta(days=30)
    df_30 = df[df["dt"] >= last_30]

    # DAU trend
    dau = df_30.groupby("date")["username"].nunique().reset_index()
    dau.columns = ["date", "users"]

    fig = px.line(
        dau, x="date", y="users",
        labels={"date": "", "users": "Daily Active Users"},
    )
    fig.update_traces(line=dict(color=brand["accent_colour"], width=2))
    fig.update_layout(**_CHART_LAYOUT, height=250)
    st.plotly_chart(fig, use_container_width=True)

    # User table
    user_stats = (
        df_30.groupby("username")
        .agg(
            last_active=("dt", "max"),
            total_views=("page", "count"),
            favourite_page=("page", lambda x: x.value_counts().index[0] if len(x) > 0 else "—"),
        )
        .sort_values("last_active", ascending=False)
        .reset_index()
    )
    user_stats["last_active"] = user_stats["last_active"].dt.strftime("%Y-%m-%d %H:%M")

    sessions = _assign_sessions(df_30)
    if not sessions.empty:
        session_counts = sessions.groupby("username")["session_id"].nunique().reset_index()
        session_counts.columns = ["username", "sessions"]
        user_stats = user_stats.merge(session_counts, on="username", how="left")
    else:
        user_stats["sessions"] = 0

    st.dataframe(user_stats, use_container_width=True, hide_index=True)


# ---------------------------------------------------------------------------
# Panel 2: Page Usage Heatmap
# ---------------------------------------------------------------------------

def _render_page_heatmap(df: pd.DataFrame, brand: dict):
    st.markdown("##### Page Usage Heatmap")
    st.caption("Page × Day of Week — heat = number of navigations")

    now = datetime.now()
    last_30 = now - timedelta(days=30)
    df_30 = df[df["dt"] >= last_30]

    if df_30.empty:
        st.info("No data for heatmap.")
        return

    # Pivot: page × day-of-week
    dow_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    pivot = df_30.groupby(["page", "dow"]).size().reset_index(name="count")
    pivot_table = pivot.pivot(index="page", columns="dow", values="count").fillna(0)

    # Reorder columns
    pivot_table = pivot_table.reindex(columns=[d for d in dow_order if d in pivot_table.columns])

    fig = px.imshow(
        pivot_table,
        color_continuous_scale=["rgba(17,24,39,1)", brand["primary_colour"]],
        labels=dict(x="Day", y="Page", color="Views"),
        aspect="auto",
    )
    fig.update_layout(**_CHART_LAYOUT, height=max(300, len(pivot_table) * 28))
    st.plotly_chart(fig, use_container_width=True)


# ---------------------------------------------------------------------------
# Panel 3: Session Depth
# ---------------------------------------------------------------------------

def _render_session_depth(df: pd.DataFrame, brand: dict):
    st.markdown("##### Session Depth Distribution")
    st.caption("Pages per session (30-minute inactivity window)")

    sessions = _assign_sessions(df)
    if sessions.empty:
        st.info("No session data.")
        return

    depths = sessions.groupby(["username", "session_id"]).size().reset_index(name="depth")

    fig = px.histogram(
        depths, x="depth",
        nbins=min(30, depths["depth"].max()),
        labels={"depth": "Pages per Session", "count": "Sessions"},
    )
    fig.update_traces(marker_color=brand["primary_colour"])
    fig.update_layout(**_CHART_LAYOUT, height=300, bargap=0.1)
    st.plotly_chart(fig, use_container_width=True)

    # Summary stats
    c1, c2, c3 = st.columns(3)
    c1.metric("Median Depth", f"{depths['depth'].median():.0f}")
    c2.metric("Mean Depth", f"{depths['depth'].mean():.1f}")
    c3.metric("Max Depth", f"{depths['depth'].max():.0f}")


# ---------------------------------------------------------------------------
# Panel 4: Feature Adoption
# ---------------------------------------------------------------------------

def _render_feature_adoption(df: pd.DataFrame, brand: dict):
    st.markdown("##### Professional Feature Adoption")
    st.caption("User × Feature usage count (Professional-tier pages only)")

    # Filter to pro features only
    pro_pages = list(_PRO_FEATURES.keys())
    df_pro = df[df["page"].isin(pro_pages)].copy()

    if df_pro.empty:
        st.info("No Professional-tier feature usage recorded yet.")
        return

    # Pivot: user × feature
    pivot = df_pro.groupby(["username", "page"]).size().reset_index(name="count")
    pivot_table = pivot.pivot(index="username", columns="page", values="count").fillna(0)

    # Rename columns to friendly names
    pivot_table = pivot_table.rename(columns=_PRO_FEATURES)

    fig = px.imshow(
        pivot_table,
        color_continuous_scale=["rgba(17,24,39,1)", brand["accent_colour"]],
        labels=dict(x="Feature", y="User", color="Uses"),
        aspect="auto",
    )
    fig.update_layout(**_CHART_LAYOUT, height=max(250, len(pivot_table) * 35))
    st.plotly_chart(fig, use_container_width=True)

    # Users not using key features
    st.markdown("##### Under-utilised Features")
    feature_usage = df_pro["page"].value_counts()
    for page_key, label in _PRO_FEATURES.items():
        count = feature_usage.get(page_key, 0)
        if count == 0:
            st.markdown(f"- **{label}**: zero usage")


# ---------------------------------------------------------------------------
# Panel 5: Revenue Summary
# ---------------------------------------------------------------------------

def _render_revenue_summary(brand: dict):
    st.markdown("##### Revenue Summary")

    # Load tier data
    tier_counts = {"free": 0, "analyst": 0, "professional": 0, "admin": 0}

    try:
        credentials = st.secrets["auth"]["credentials"]
        overrides = {}
        if _TIER_FILE.exists():
            overrides = json.loads(_TIER_FILE.read_text(encoding="utf-8"))

        for username, cfg in credentials.items():
            effective = overrides.get(username, {}).get("tier", cfg.get("tier", "free"))
            tier_counts[effective] = tier_counts.get(effective, 0) + 1
    except Exception:
        st.info("Cannot read user credentials for tier counts.")
        return

    # Subscription statuses
    sub_statuses = {"active": 0, "past_due": 0, "canceled": 0, "—": 0}
    if _SUB_FILE.exists():
        try:
            subs = json.loads(_SUB_FILE.read_text(encoding="utf-8"))
            for info in subs.values():
                status = info.get("status", "—")
                sub_statuses[status] = sub_statuses.get(status, 0) + 1
        except Exception:
            pass

    # Metrics
    pro_count = tier_counts.get("professional", 0)
    price_per_month = 499  # R499/month
    mrr = pro_count * price_per_month

    c1, c2, c3 = st.columns(3)
    c1.metric("Professional Subscribers", pro_count)
    c2.metric("MRR (estimated)", f"R{mrr:,.0f}")
    c3.metric("ARR (projected)", f"R{mrr * 12:,.0f}")

    # Tier distribution
    st.markdown("##### Tier Distribution")
    tier_df = pd.DataFrame([
        {"Tier": k.title(), "Users": v}
        for k, v in tier_counts.items() if v > 0
    ])
    if not tier_df.empty:
        fig = px.bar(
            tier_df, x="Tier", y="Users",
            color_discrete_sequence=[brand["primary_colour"]],
        )
        fig.update_layout(**_CHART_LAYOUT, height=250)
        st.plotly_chart(fig, use_container_width=True)

    # Subscription statuses
    if any(v > 0 for k, v in sub_statuses.items() if k != "—"):
        st.markdown("##### Subscription Status")
        sub_df = pd.DataFrame([
            {"Status": k.title(), "Count": v}
            for k, v in sub_statuses.items() if v > 0 and k != "—"
        ])
        st.dataframe(sub_df, use_container_width=True, hide_index=True)
