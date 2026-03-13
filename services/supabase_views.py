"""
ATLAS Terminal — Supabase View Fetcher
Shared helper used by all frontend page modules that pull from pre-computed
Supabase analytics views (vw_portfolio_home, vw_quant_dashboard, etc.).
"""
from __future__ import annotations

import streamlit as st
import pandas as pd


@st.cache_data(ttl=300)  # 5-minute cache — views are pre-computed, not live
def fetch_view(view_name: str) -> pd.DataFrame:
    """
    Fetch all rows from a Supabase view and return as a DataFrame.

    Uses the process-global Supabase client (get_supabase_client) so no new
    client is created.  Results are cached for 5 minutes per view name.

    Args:
        view_name: Name of the Supabase view, e.g. "vw_quant_dashboard".

    Returns:
        pd.DataFrame with the view rows, or an empty DataFrame on error.
    """
    try:
        from services.supabase_client import get_supabase_client
        supabase = get_supabase_client()
        result = supabase.table(view_name).select("*").execute()
        return pd.DataFrame(result.data) if result.data else pd.DataFrame()
    except Exception as e:
        st.error(f"[ATLAS] Failed to load {view_name}: {e}")
        return pd.DataFrame()
