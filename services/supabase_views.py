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
        if not result.data:
            return pd.DataFrame()
        df = pd.DataFrame(result.data)
        # Blanket numeric cast — Postgres returns Decimal types that crash
        # Pandas .style.format().  errors='ignore' leaves strings untouched.
        for col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='ignore')
        return df
    except Exception as e:
        err_str = str(e)
        # PGRST205 = view not yet created in Supabase schema cache
        if "PGRST205" in err_str or "schema cache" in err_str:
            st.warning(
                f"**{view_name}** not found in Supabase. "
                "Run `migrations/supabase_views.sql` in the Supabase SQL Editor to create the analytics views."
            )
        else:
            st.warning(f"⚠️ View `{view_name}` failed: {type(e).__name__}: {e}")
        return pd.DataFrame()
