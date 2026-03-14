"""
ATLAS Terminal — Quantitative Dashboard
Pulls live signals from vw_quant_dashboard (Supabase pre-computed view).
Falls back to computing regime/momentum signals directly from yfinance when
the Supabase view is empty (e.g. price_history not yet populated).
"""
import streamlit as st
import pandas as pd
import numpy as np

from services.supabase_views import fetch_view


def _compute_quant_signals_from_yfinance(tickers: list) -> pd.DataFrame:
    """
    Compute quant signals directly from yfinance for a list of tickers.
    Returns a DataFrame matching the vw_quant_dashboard schema as closely as
    possible so the same rendering code can handle both data sources.
    """
    try:
        import yfinance as yf
    except ImportError:
        return pd.DataFrame()

    records = []
    for ticker in tickers:
        try:
            hist = yf.Ticker(ticker).history(period="1y")
            if hist is None or len(hist) < 21:
                continue

            close = hist["Close"]
            if isinstance(close, pd.DataFrame):
                close = close.iloc[:, 0]
            close = close.squeeze()

            current_price = float(close.iloc[-1])
            ma_20 = float(close.iloc[-20:].mean())
            ma_50 = float(close.iloc[-50:].mean()) if len(close) >= 50 else None
            ma_200 = float(close.iloc[-200:].mean()) if len(close) >= 200 else None
            high_20 = float(close.iloc[-20:].max())
            low_20 = float(close.iloc[-20:].min())
            stddev_20 = float(close.iloc[-20:].std())

            daily_returns = close.pct_change().dropna()
            vol_20d = float(daily_returns.iloc[-20:].std()) if len(daily_returns) >= 20 else None
            vol_60d = float(daily_returns.iloc[-60:].std()) if len(daily_returns) >= 60 else None

            # Regime detection
            if ma_50 is not None and ma_200 is not None:
                if current_price > ma_50 and ma_50 > ma_200:
                    price_regime = "Uptrend"
                elif current_price < ma_50 and ma_50 < ma_200:
                    price_regime = "Downtrend"
                else:
                    price_regime = "Sideways"
            else:
                price_regime = "Sideways"

            # Vol regime
            if vol_20d is not None and vol_60d is not None:
                if vol_20d > vol_60d:
                    vol_regime = "Expanding"
                elif vol_20d < vol_60d:
                    vol_regime = "Compressing"
                else:
                    vol_regime = "Stable"
            else:
                vol_regime = "N/A"

            # Z-score
            zscore_20d = (current_price - ma_20) / stddev_20 if stddev_20 > 0 else 0.0
            if zscore_20d > 2:
                mean_reversion_signal = "Overbought"
            elif zscore_20d < -2:
                mean_reversion_signal = "Oversold"
            else:
                mean_reversion_signal = "Neutral"

            # Momentum pct rank
            rng = high_20 - low_20
            momentum_pct_rank_20d = round(((current_price - low_20) / rng) * 100, 1) if rng > 0 else 50.0

            records.append({
                "symbol": ticker,
                "name": ticker,
                "current_price": current_price,
                "ma_20": ma_20,
                "ma_50": ma_50,
                "ma_200": ma_200,
                "price_regime": price_regime,
                "vol_regime": vol_regime,
                "zscore_20d": round(zscore_20d, 2),
                "mean_reversion_signal": mean_reversion_signal,
                "momentum_pct_rank_20d": momentum_pct_rank_20d,
                "annualised_vol_20d": vol_20d * np.sqrt(252) if vol_20d else None,
                "annualised_vol_60d": vol_60d * np.sqrt(252) if vol_60d else None,
                "trading_days_available": len(close),
            })
        except Exception:
            continue

    return pd.DataFrame(records)


def render_quant_dashboard():
    """Render the Quant Dashboard from Supabase vw_quant_dashboard."""
    st.header("Quant Dashboard")

    quant_df = fetch_view("vw_quant_dashboard")

    if quant_df.empty:
        from services.supabase_data import render_data_diagnostic
        render_data_diagnostic("Quant Dashboard — vw_quant_dashboard")
        return

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
        quant_df[available_cols].style.format(fmt, na_rep="N/A"),
        use_container_width=True,
    )

    # ── Mean Reversion Flags ─────────────────────────────────────────────────
    flags_df = quant_df[quant_df['mean_reversion_signal'].isin(['Overbought', 'Oversold'])]
    if not flags_df.empty:
        st.subheader("Mean Reversion Flags")
        flag_cols = [c for c in ['symbol', 'mean_reversion_signal', 'zscore_20d', 'current_price']
                     if c in flags_df.columns]
        st.dataframe(flags_df[flag_cols], use_container_width=True)
