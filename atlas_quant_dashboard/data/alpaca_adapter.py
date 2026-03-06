"""
ATLAS Quantitative Dashboard — Alpaca Live Data Adapter
Transforms AlpacaDataEngine output into the exact data contract
that the quant dashboard's compute_all_metrics() expects.

Data contract (must match generate_sample_portfolio() output):
    {
        "portfolio_returns": pd.Series (named "Portfolio"),
        "benchmark_returns": pd.Series (named "Benchmark"),
        "asset_returns":     pd.DataFrame (columns = asset names),
        "weights":           pd.Series (index = asset names),
        "dates":             pd.DatetimeIndex,
    }
"""
import pandas as pd
import numpy as np
import streamlit as st


def _align_tz(index: pd.Index, target_dates: pd.DatetimeIndex) -> pd.Index:
    """Ensure index timezone matches target_dates timezone."""
    if target_dates.tz is not None:
        # Target is tz-aware — localize source if naive, convert if different tz
        if index.tz is None:
            return index.tz_localize('UTC')
        return index.tz_convert(target_dates.tz)
    else:
        # Target is tz-naive — strip timezone from source
        if index.tz is not None:
            return index.tz_localize(None)
        return index


def load_alpaca_portfolio_data() -> dict | None:
    """
    Build quant-dashboard-compatible data dict from the AlpacaDataEngine
    stored in session state. Returns None if engine is not available or
    has insufficient data.
    """
    engine = st.session_state.get('_alpaca_data_engine')
    if engine is None:
        return None

    # Need portfolio history for the equity curve / daily returns
    ph = engine.portfolio_history
    if ph is None or ph.empty or len(ph) < 10:
        return None

    daily_returns = ph["daily_return"].dropna()
    if len(daily_returns) < 10:
        return None

    dates = daily_returns.index

    # Portfolio returns series
    portfolio_returns = daily_returns.rename("Portfolio")

    # Benchmark: fetch SPY returns for the same period if possible
    benchmark_returns = _fetch_benchmark_returns(dates)

    # Per-asset returns + weights from current positions
    asset_returns, weights = _build_asset_data(dates, engine)

    return {
        "portfolio_returns": portfolio_returns,
        "benchmark_returns": benchmark_returns,
        "asset_returns": asset_returns,
        "weights": weights,
        "dates": dates,
    }


def _fetch_benchmark_returns(dates: pd.DatetimeIndex) -> pd.Series:
    """Fetch SPY daily returns over the same date range as the portfolio."""
    try:
        import yfinance as yf
        start = dates.min().strftime('%Y-%m-%d')
        end = dates.max().strftime('%Y-%m-%d')
        spy = yf.download("SPY", start=start, end=end, progress=False)
        if spy is not None and len(spy) > 5:
            # Handle multi-level columns from newer yfinance
            close = spy["Close"]
            if isinstance(close, pd.DataFrame):
                close = close.iloc[:, 0]
            spy_ret = close.pct_change().dropna()
            # Align timezone to match portfolio dates
            spy_ret.index = _align_tz(spy_ret.index, dates)
            spy_ret = spy_ret.reindex(dates).ffill().fillna(0)
            return spy_ret.rename("Benchmark")
    except Exception as e:
        print(f"[ATLAS] SPY benchmark fetch failed: {e}")

    # Fallback: synthetic benchmark — flag it so the dashboard can warn
    st.session_state['_using_synthetic_benchmark'] = True
    np.random.seed(42)
    noise = np.random.normal(0, 0.001, len(dates))
    return pd.Series(noise, index=dates, name="Benchmark (Synthetic)")


def _build_asset_data(dates: pd.DatetimeIndex, engine) -> tuple:
    """
    Build per-asset return matrix and weight vector from current positions.
    Falls back to synthetic decomposition if price history isn't available.
    """
    positions = engine.positions_df
    equity = engine.account_snapshot.get("equity", 1) if engine.account_snapshot else 1

    if positions is None or positions.empty or equity <= 0:
        # No positions — create a single-asset stand-in
        port_ret = engine.portfolio_history["daily_return"].dropna()
        asset_returns = pd.DataFrame({"Portfolio": port_ret.reindex(dates).fillna(0)})
        weights = pd.Series({"Portfolio": 1.0})
        return asset_returns, weights

    symbols = positions["symbol"].tolist()
    weight_values = (positions["market_value"] / equity).values
    weights = pd.Series(weight_values, index=symbols)

    # Try to fetch individual asset returns
    try:
        import yfinance as yf
        start = dates.min().strftime('%Y-%m-%d')
        end = dates.max().strftime('%Y-%m-%d')
        price_data = yf.download(symbols, start=start, end=end, progress=False)
        if price_data is not None and not price_data.empty:
            close = price_data["Close"]
            if isinstance(close, pd.Series):
                close = close.to_frame(symbols[0])
            asset_ret = close.pct_change().dropna()
            # Align timezone to match portfolio dates
            asset_ret.index = _align_tz(asset_ret.index, dates)
            asset_ret = asset_ret.reindex(dates).ffill().fillna(0)
            # Filter to symbols we actually got data for
            valid = [s for s in symbols if s in asset_ret.columns]
            if valid:
                weights = weights.reindex(valid)
                weights = weights / weights.sum()  # Re-normalize
                return asset_ret[valid], weights
    except Exception as e:
        print(f"[ATLAS] Asset return fetch failed: {e}")

    # Fallback: synthetic decomposition from portfolio returns
    port_ret = engine.portfolio_history["daily_return"].dropna().reindex(dates).fillna(0)
    np.random.seed(42)
    asset_returns_data = {}
    for sym in symbols:
        noise = np.random.normal(0, 0.002, len(dates))
        asset_returns_data[sym] = port_ret.values + noise
    asset_returns = pd.DataFrame(asset_returns_data, index=dates)
    return asset_returns, weights
