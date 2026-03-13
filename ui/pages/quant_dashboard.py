"""
ATLAS Terminal — Quantitative Dashboard
Pulls live signals from vw_quant_dashboard (Supabase pre-computed view).
All regime detection, momentum scores, and mean-reversion signals are
computed in the database — this module only presents them.
"""
import streamlit as st
import pandas as pd

from services.supabase_views import fetch_view


def render_quant_dashboard():
    """Render the Quant Dashboard from Supabase vw_quant_dashboard."""
    st.header("Quant Dashboard")

    quant_df = fetch_view("vw_quant_dashboard")

    if quant_df.empty:
        st.warning("No portfolio data available. Ensure Alpaca sync has completed.")
        st.stop()

    # ── Regime Overview ──────────────────────────────────────────────────────
    col1, col2, col3 = st.columns(3)

    with col1:
        uptrend_count = (quant_df['price_regime'] == 'Uptrend').sum()
        st.metric("Uptrend Positions", f"{uptrend_count} / {len(quant_df)}")

    with col2:
        expanding_vol = (quant_df['vol_regime'] == 'Expanding').sum()
        st.metric("Expanding Vol", f"{expanding_vol} / {len(quant_df)}")

    with col3:
        overbought = (quant_df['mean_reversion_signal'] == 'Overbought').sum()
        oversold = (quant_df['mean_reversion_signal'] == 'Oversold').sum()
        st.metric("Overbought / Oversold", f"{overbought} / {oversold}")

    # ── Main data table ──────────────────────────────────────────────────────
    st.subheader("Position-Level Quant Signals")

    display_cols = [
        'symbol', 'current_price', 'price_regime', 'vol_regime',
        'zscore_20d', 'mean_reversion_signal', 'momentum_pct_rank_20d',
        'annualised_vol_20d'
    ]
    available_cols = [c for c in display_cols if c in quant_df.columns]

    fmt = {}
    if 'current_price' in available_cols:
        fmt['current_price'] = '${:,.2f}'
    if 'zscore_20d' in available_cols:
        fmt['zscore_20d'] = '{:.2f}'
    if 'momentum_pct_rank_20d' in available_cols:
        fmt['momentum_pct_rank_20d'] = '{:.1f}'
    if 'annualised_vol_20d' in available_cols:
        fmt['annualised_vol_20d'] = '{:.1%}'

    st.dataframe(
        quant_df[available_cols].style.format(fmt),
        use_container_width=True,
    )

    # ── Mean Reversion Flags ─────────────────────────────────────────────────
    flags_df = quant_df[quant_df['mean_reversion_signal'].isin(['Overbought', 'Oversold'])]
    if not flags_df.empty:
        st.subheader("Mean Reversion Flags")
        flag_cols = [c for c in ['symbol', 'mean_reversion_signal', 'zscore_20d', 'current_price']
                     if c in flags_df.columns]
        st.dataframe(flags_df[flag_cols], use_container_width=True)
