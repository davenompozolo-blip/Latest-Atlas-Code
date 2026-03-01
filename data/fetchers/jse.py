"""
ATLAS Terminal — JSE Data Fetcher (Phase 10, Initiative 1)
============================================================
South African market data layer. Uses Yahoo Finance (.JO tickers)
as primary source with proper JSE ticker normalisation.

Interface is designed so a real JSE API (LSEG, EODHD, etc.) can
slot in later by replacing the internal _fetch_* methods without
changing the public API.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Literal, Optional

import pandas as pd
import streamlit as st

from data.fetchers.jse_tickers import (
    ALSI_TOP40,
    JSE_SECTORS,
    JSE_TICKERS,
    SAPY_REITS,
    is_jse_ticker,
    jse_to_yahoo,
    normalise_to_jse,
)

logger = logging.getLogger("atlas.data.jse")


class CorporateAction:
    """Represents a JSE corporate action (dividend, split, rights issue)."""

    def __init__(self, date: date, action_type: str, value: float, description: str = ""):
        self.date = date
        self.action_type = action_type  # "dividend", "split", "rights"
        self.value = value
        self.description = description

    def __repr__(self):
        return f"CorporateAction({self.date}, {self.action_type}, {self.value})"


class JSEDataFetcher:
    """JSE-specific data fetcher.

    Primary source: Yahoo Finance (.JO tickers)
    All methods cache via @st.cache_data with appropriate TTLs.
    """

    @staticmethod
    @st.cache_data(ttl=900, show_spinner=False)
    def get_prices(
        ticker: str,
        from_date: date,
        to_date: date,
        adjusted: bool = True,
    ) -> pd.DataFrame:
        """Fetch OHLCV data for a JSE ticker.

        Args:
            ticker: Any JSE format (NPN, NPN.JO, NPN SJ)
            from_date: Start date
            to_date: End date
            adjusted: If True, adjust for corporate actions

        Returns:
            DataFrame with DatetimeIndex, columns: Open, High, Low, Close, Volume
        """
        import yfinance as yf

        yahoo = jse_to_yahoo(ticker)
        try:
            data = yf.download(
                yahoo,
                start=from_date.isoformat(),
                end=to_date.isoformat(),
                auto_adjust=adjusted,
                progress=False,
            )
            if data is None or data.empty:
                logger.warning(f"No price data for {yahoo}")
                return pd.DataFrame()

            # Flatten MultiIndex columns if present
            if isinstance(data.columns, pd.MultiIndex):
                data.columns = data.columns.get_level_values(0)

            # Normalise timezone
            if data.index.tz is not None:
                data.index = data.index.tz_localize(None)

            return data[["Open", "High", "Low", "Close", "Volume"]].dropna()

        except Exception as e:
            logger.error(f"JSE price fetch failed for {yahoo}: {e}")
            return pd.DataFrame()

    @staticmethod
    @st.cache_data(ttl=14400, show_spinner=False)  # 4 hours
    def get_constituents(
        index: Literal["ALSI", "SWIX", "SAPY", "ALBI", "CILI"] = "ALSI",
    ) -> pd.DataFrame:
        """Return constituent tickers for a JSE index.

        Uses static lists (updated periodically) since the JSE does
        not provide a free constituents API.

        Returns:
            DataFrame with columns: ticker, name, sector
        """
        if index == "ALSI":
            tickers = ALSI_TOP40
        elif index == "SWIX":
            # SWIX is similar to ALSI with different weights
            tickers = ALSI_TOP40
        elif index == "SAPY":
            tickers = SAPY_REITS
        else:
            tickers = ALSI_TOP40

        rows = []
        for t in tickers:
            rows.append({
                "ticker": t,
                "yahoo_ticker": jse_to_yahoo(t),
                "name": JSE_TICKERS.get(t, t),
                "sector": JSE_SECTORS.get(t, "Unknown"),
            })
        return pd.DataFrame(rows)

    @staticmethod
    @st.cache_data(ttl=86400, show_spinner=False)  # 24 hours
    def get_corporate_actions(
        ticker: str,
        from_date: date,
        to_date: date,
    ) -> list[dict]:
        """Fetch dividends and splits for a JSE ticker.

        Uses Yahoo Finance's dividends/splits data as proxy.
        """
        import yfinance as yf

        yahoo = jse_to_yahoo(ticker)
        actions = []

        try:
            stock = yf.Ticker(yahoo)

            # Dividends
            divs = stock.dividends
            if divs is not None and not divs.empty:
                mask = (divs.index >= pd.Timestamp(from_date)) & (divs.index <= pd.Timestamp(to_date))
                for dt, val in divs[mask].items():
                    actions.append({
                        "date": dt.date().isoformat(),
                        "action_type": "dividend",
                        "value": float(val),
                        "description": f"Dividend: R{val:.2f} per share",
                    })

            # Splits
            splits = stock.splits
            if splits is not None and not splits.empty:
                mask = (splits.index >= pd.Timestamp(from_date)) & (splits.index <= pd.Timestamp(to_date))
                for dt, val in splits[mask].items():
                    if val != 0 and val != 1:
                        actions.append({
                            "date": dt.date().isoformat(),
                            "action_type": "split",
                            "value": float(val),
                            "description": f"Stock split: {val:.0f}:1",
                        })

        except Exception as e:
            logger.warning(f"Corporate actions fetch failed for {yahoo}: {e}")

        return actions

    @staticmethod
    @st.cache_data(ttl=604800, show_spinner=False)  # 7 days
    def get_sector_classification(ticker: str) -> dict:
        """Return FTSE/JSE sector classification for a ticker.

        Uses static lookup first (faster, more accurate for SA market),
        falls back to Yahoo Finance sector data.
        """
        bare = normalise_to_jse(ticker)

        # Static lookup — curated for JSE
        if bare in JSE_SECTORS:
            return {
                "ticker": bare,
                "sector": JSE_SECTORS[bare],
                "source": "ftse_jse_static",
            }

        # Fallback: Yahoo Finance
        import yfinance as yf

        try:
            info = yf.Ticker(jse_to_yahoo(bare)).info
            return {
                "ticker": bare,
                "sector": info.get("sector", "Unknown"),
                "industry": info.get("industry", "Unknown"),
                "source": "yahoo_finance",
            }
        except Exception:
            return {"ticker": bare, "sector": "Unknown", "source": "none"}

    @staticmethod
    def get_multiple_prices(
        tickers: list[str],
        from_date: date,
        to_date: date,
    ) -> dict[str, pd.DataFrame]:
        """Fetch prices for multiple JSE tickers.

        Returns dict mapping bare ticker -> OHLCV DataFrame.
        """
        results = {}
        for ticker in tickers:
            bare = normalise_to_jse(ticker)
            data = JSEDataFetcher.get_prices(ticker, from_date, to_date)
            if not data.empty:
                results[bare] = data
        return results
