"""
ATLAS Terminal — IRESS CSV Import Handler (Phase 10, Initiative 1)
====================================================================
Parses standard IRESS CSV exports into ATLAS-compatible DataFrames.

IRESS is the dominant South African market data terminal. This handler
accepts IRESS exports and maps them to the ATLAS data model, turning
IRESS into a data source without requiring an API integration.

Supported IRESS export formats:
  1. Price history: Date, Code, Open, High, Low, Close, Volume, Value
  2. Holdings export: Code, Description, Quantity, Price, Value
"""
from __future__ import annotations

import io
import logging
from datetime import datetime
from pathlib import Path

import pandas as pd

from data.fetchers.jse_tickers import normalise_to_jse

logger = logging.getLogger("atlas.data.iress")

# ---------------------------------------------------------------------------
# IRESS column mappings (various export formats)
# ---------------------------------------------------------------------------
_PRICE_COLUMN_MAP = {
    "Date": "date",
    "date": "date",
    "Trading Date": "date",
    "Code": "ticker",
    "code": "ticker",
    "Instrument": "ticker",
    "Open": "Open",
    "open": "Open",
    "High": "High",
    "high": "High",
    "Low": "Low",
    "low": "Low",
    "Close": "Close",
    "close": "Close",
    "Last": "Close",
    "Volume": "Volume",
    "volume": "Volume",
    "Vol": "Volume",
    "Value": "value",
    "Turnover": "value",
}

_HOLDINGS_COLUMN_MAP = {
    "Code": "ticker",
    "code": "ticker",
    "Instrument": "ticker",
    "Description": "name",
    "Name": "name",
    "Quantity": "quantity",
    "Qty": "quantity",
    "Shares": "quantity",
    "Price": "price",
    "Last Price": "price",
    "Market Price": "price",
    "Value": "market_value",
    "Market Value": "market_value",
    "Cost": "cost_basis",
    "Cost Price": "cost_basis",
    "Purchase Price": "cost_basis",
}


def import_iress_prices(
    source: str | Path | io.BytesIO,
    ticker_filter: str | None = None,
) -> pd.DataFrame:
    """Parse a standard IRESS price history CSV export.

    Args:
        source: File path or file-like object (from st.file_uploader)
        ticker_filter: If provided, only return data for this ticker

    Returns:
        DataFrame with DatetimeIndex, columns: Open, High, Low, Close, Volume
        Ticker normalised to bare JSE format.
    """
    try:
        df = pd.read_csv(source)
    except Exception as e:
        logger.error(f"IRESS price import failed: {e}")
        return pd.DataFrame()

    # Map columns
    rename_map = {}
    for col in df.columns:
        mapped = _PRICE_COLUMN_MAP.get(col.strip())
        if mapped:
            rename_map[col] = mapped
    df = df.rename(columns=rename_map)

    required = ["date", "Open", "High", "Low", "Close"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        logger.error(f"IRESS export missing columns: {missing}. Found: {list(df.columns)}")
        return pd.DataFrame()

    # Parse dates
    df["date"] = pd.to_datetime(df["date"], dayfirst=True, errors="coerce")
    df = df.dropna(subset=["date"])
    df = df.set_index("date").sort_index()

    # Normalise tickers if present
    if "ticker" in df.columns:
        df["ticker"] = df["ticker"].apply(normalise_to_jse)
        if ticker_filter:
            bare = normalise_to_jse(ticker_filter)
            df = df[df["ticker"] == bare]

    # Ensure numeric
    for col in ["Open", "High", "Low", "Close"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    if "Volume" in df.columns:
        df["Volume"] = pd.to_numeric(df["Volume"], errors="coerce").fillna(0).astype(int)
    else:
        df["Volume"] = 0

    return df[["Open", "High", "Low", "Close", "Volume"]].dropna()


def import_iress_holdings(
    source: str | Path | io.BytesIO,
) -> pd.DataFrame:
    """Parse an IRESS holdings/portfolio CSV export.

    Returns:
        DataFrame with columns: ticker, name, quantity, price, market_value, cost_basis
        Tickers normalised to bare JSE format.
    """
    try:
        df = pd.read_csv(source)
    except Exception as e:
        logger.error(f"IRESS holdings import failed: {e}")
        return pd.DataFrame()

    # Map columns
    rename_map = {}
    for col in df.columns:
        mapped = _HOLDINGS_COLUMN_MAP.get(col.strip())
        if mapped:
            rename_map[col] = mapped
    df = df.rename(columns=rename_map)

    if "ticker" not in df.columns:
        logger.error(f"IRESS holdings export missing ticker column. Found: {list(df.columns)}")
        return pd.DataFrame()

    df["ticker"] = df["ticker"].apply(normalise_to_jse)

    # Ensure numeric columns
    for col in ["quantity", "price", "market_value", "cost_basis"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def validate_iress_export(source: str | Path | io.BytesIO) -> dict:
    """Validate an IRESS CSV export and report format detection.

    Returns:
        dict with keys: valid, format ("prices" or "holdings"), rows, columns, tickers
    """
    try:
        df = pd.read_csv(source)
    except Exception as e:
        return {"valid": False, "error": str(e)}

    cols = [c.strip() for c in df.columns]

    # Detect format
    price_cols = {"Date", "Open", "High", "Low", "Close"}
    holdings_cols = {"Code", "Quantity", "Price", "Value"}

    if price_cols.issubset(set(cols)) or {"date", "open", "high", "low", "close"}.issubset({c.lower() for c in cols}):
        fmt = "prices"
    elif holdings_cols.issubset(set(cols)) or {"code", "quantity"}.issubset({c.lower() for c in cols}):
        fmt = "holdings"
    else:
        return {"valid": False, "error": f"Unrecognised format. Columns: {cols}"}

    # Extract tickers
    ticker_col = next((c for c in cols if c.lower() in ("code", "instrument", "ticker")), None)
    tickers = list(df[ticker_col].unique()) if ticker_col else []

    return {
        "valid": True,
        "format": fmt,
        "rows": len(df),
        "columns": cols,
        "tickers": tickers[:20],
    }
