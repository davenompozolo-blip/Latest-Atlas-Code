"""
ATLAS Terminal — Supabase-first data loading
============================================
Single source of truth for all portfolio calculations.

Workflow:
  1. Alpaca sync  → positions / transactions / assets stored in Supabase
  2. Market data ingestion → price_history stored in Supabase
  3. SQL views pre-compute all analytics
  4. This module exposes clean Python accessors for each view

All analytics pages should call these functions rather than reaching for
yfinance or reconstructing values from scratch.  yfinance is reserved for:
  - Real-time market enrichment that belongs in the front-end display layer
    (daily change %, volume, analyst ratings)
  - Benchmark / index data that is NOT stored in price_history
  - Per-ticker interactive charts on demand

If a function returns None or an empty DataFrame, call render_data_diagnostic()
to show the user exactly what is missing and how to fix it.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from services.supabase_views import fetch_view


# ---------------------------------------------------------------------------
# Portfolio positions
# ---------------------------------------------------------------------------

def get_portfolio_df() -> pd.DataFrame | None:
    """
    Load portfolio positions from vw_portfolio_home (Supabase canonical source).

    Converts to the ATLAS standard portfolio_df format so every downstream
    page and chart function works without modification.

    Returns None if the view is empty or unavailable, in which case call
    render_data_diagnostic() to show the user what is missing.
    """
    df = fetch_view("vw_portfolio_home")
    if df.empty:
        return None

    required = {"symbol", "quantity", "cost_basis", "current_price", "market_value"}
    if not required.issubset(df.columns):
        return None

    result = pd.DataFrame()
    result["Ticker"]            = df["symbol"]
    result["Asset Name"]        = df.get("name", df["symbol"])
    result["Shares"]            = pd.to_numeric(df["quantity"], errors="coerce")
    result["Avg Cost"]          = pd.to_numeric(df["cost_basis"], errors="coerce")
    result["Current Price"]     = pd.to_numeric(df["current_price"], errors="coerce")
    result["Total Value"]       = pd.to_numeric(df["market_value"], errors="coerce")
    result["Total Cost"]        = result["Shares"] * result["Avg Cost"]
    result["Total Gain/Loss $"] = result["Total Value"] - result["Total Cost"]

    _gl_pct = df.get("unrealised_return_pct")
    if _gl_pct is not None:
        result["Total Gain/Loss %"] = pd.to_numeric(_gl_pct, errors="coerce") * 100
    else:
        result["Total Gain/Loss %"] = (
            (result["Current Price"] - result["Avg Cost"])
            / result["Avg Cost"].replace(0, pd.NA)
            * 100
        )

    _weight = df.get("portfolio_weight")
    if _weight is not None:
        result["Weight %"] = pd.to_numeric(_weight, errors="coerce") * 100
    else:
        _total_val = result["Total Value"].sum()
        result["Weight %"] = (result["Total Value"] / _total_val * 100) if _total_val > 0 else 0

    # Sector — pull from assets.metadata if available, else ETF_SECTORS dict
    try:
        from core.data_loading import ETF_SECTORS
        result["Sector"] = result["Ticker"].apply(
            lambda t: ETF_SECTORS.get(str(t).upper(), "Unknown")
        )
    except Exception:
        result["Sector"] = "Unknown"

    # Initialise columns expected by create_enhanced_holdings_table so it
    # enriches rather than errors when yfinance data is unavailable
    for col in ["Daily Change", "Daily Change %", "Daily P&L $", "Beta",
                "5D Return %", "Volume"]:
        if col not in result.columns:
            result[col] = 0.0

    return result.dropna(subset=["Ticker"]).reset_index(drop=True)


# ---------------------------------------------------------------------------
# Portfolio returns time series
# ---------------------------------------------------------------------------

def get_portfolio_returns(
    start_date=None,
    end_date=None,
) -> pd.Series | None:
    """
    Fetch FIFO-based daily returns from vw_portfolio_nav_daily.

    Falls back to vw_portfolio_returns_daily if the FIFO view is empty
    (e.g. migrations not yet re-run).

    Returns a pd.Series indexed by date (timezone-naive), or None if
    insufficient data exists.  Callers should treat None as a signal to
    call render_data_diagnostic().
    """
    # Primary: FIFO transaction-based NAV
    df = fetch_view("vw_portfolio_nav_daily")

    # Fallback: legacy position-snapshot view
    if df.empty or "daily_return" not in df.columns:
        df = fetch_view("vw_portfolio_returns_daily")

    if df.empty or "daily_return" not in df.columns:
        return None

    df['price_date'] = pd.to_datetime(df['price_date'])
    if df['price_date'].dt.tz is not None:
        df['price_date'] = df['price_date'].dt.tz_localize(None)
    df = df.set_index('price_date').sort_index()
    df['daily_return'] = pd.to_numeric(df['daily_return'], errors='coerce')

    returns = df['daily_return'].dropna()

    if start_date:
        returns = returns[returns.index >= pd.to_datetime(start_date)]
    if end_date:
        returns = returns[returns.index <= pd.to_datetime(end_date)]

    if len(returns) < 2:
        return None

    return returns


# ---------------------------------------------------------------------------
# Data health diagnostics
# ---------------------------------------------------------------------------

_REQUIRED_VIEWS = [
    "vw_portfolio_home",
    "vw_portfolio_nav_daily",
    "vw_portfolio_returns_daily",
    "vw_command_centre",
    "vw_performance_suite",
    "vw_risk_analysis",
    "vw_quant_dashboard",
]


def get_data_health() -> dict[str, dict]:
    """
    Check which Supabase views have data.

    Returns a dict: { view_name: {"rows": int, "ok": bool} }
    """
    health: dict[str, dict] = {}
    for view in _REQUIRED_VIEWS:
        try:
            df = fetch_view(view)
            health[view] = {"rows": len(df), "ok": not df.empty}
        except Exception as exc:
            health[view] = {"rows": 0, "ok": False, "error": str(exc)}
    return health


def render_data_diagnostic(context: str = "") -> None:
    """
    Render a structured diagnostic panel when Supabase data is unavailable.

    Pass a brief `context` string to indicate which page/metric is affected,
    e.g. "Risk Analysis — portfolio returns series".

    Call this instead of showing a fallback with incorrect values.
    """
    health = get_data_health()
    missing = [v for v, s in health.items() if not s["ok"]]
    populated = [v for v, s in health.items() if s["ok"]]

    if context:
        st.warning(f"**{context}** — required Supabase data is missing.")

    with st.expander("Backend Data Status", expanded=True):
        c1, c2 = st.columns(2)

        with c1:
            st.markdown("**Available**")
            for v in populated:
                st.markdown(f"✅ `{v}` — {health[v]['rows']} rows")
            if not populated:
                st.markdown("*(none)*")

        with c2:
            st.markdown("**Missing / Empty**")
            for v in missing:
                st.markdown(f"❌ `{v}`")
            if not missing:
                st.markdown("*(all views populated)*")

        if missing:
            st.markdown("---")
            st.markdown("**How to fix:**")
            steps = []
            if "vw_portfolio_home" in missing or "vw_portfolio_returns_daily" in missing:
                steps.append(
                    "1. **Sync Alpaca** — go to *Phoenix Parser* → connect Alpaca → Run Sync. "
                    "This writes positions and transactions to Supabase."
                )
                steps.append(
                    "2. **Ingest market data** — ensure the price ingestion service has run "
                    "and `price_history` has at least 2 days of data for each position."
                )
            steps.append(
                "3. **Create/refresh SQL views** — run `migrations/supabase_views.sql` "
                "in the Supabase SQL Editor (Dashboard → SQL Editor → paste & run)."
            )
            for s in steps:
                st.markdown(s)
