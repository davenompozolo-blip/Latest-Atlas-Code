"""
ATLAS Command Centre — Institutional Buy-Side Trading Terminal
==============================================================
Buy-side trading desk × equity research × options chain.

Layout:
  Row 1 : Security search bar + account badge
  Row 2 : Security info (33%) | TradingView chart (67%)
  Row 3 : Live bid/ask quote strip (full width)
  Row 4 : Order ticket (27%) | Fundamentals (38%) | Option chain (35%)
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd
import streamlit as st

from services.trading_service import TradingService, ALPACA_AVAILABLE, TradeResult

logger = logging.getLogger(__name__)

# ── Optional chart library ────────────────────────────────────────────────────
try:
    from core.tradingview_charts import render_candlestick_chart, TRADINGVIEW_AVAILABLE
except ImportError:
    TRADINGVIEW_AVAILABLE = False
    def render_candlestick_chart(*a, **kw):
        pass

# ── yfinance helpers ──────────────────────────────────────────────────────────
try:
    from services.yf_session import get_history, get_info
    YF_AVAILABLE = True
except ImportError:
    YF_AVAILABLE = False
    def get_history(*a, **kw): return pd.DataFrame()  # type: ignore
    def get_info(*a, **kw):    return {}               # type: ignore

# ── Position sizer ────────────────────────────────────────────────────────────
try:
    from analytics.position_sizer import (
        kelly_fraction, fixed_fractional, volatility_based, annual_vol_to_daily,
    )
    SIZER_AVAILABLE = True
except ImportError:
    SIZER_AVAILABLE = False

# ─────────────────────────────────────────────────────────────────────────────
# CSS — dark terminal palette
# ─────────────────────────────────────────────────────────────────────────────
TERMINAL_CSS = """
<style>
:root {
  --bg-card:     #161b22;
  --bg-elevated: #21262d;
  --border:      #30363d;
  --text-pri:    #e6edf3;
  --text-sec:    #8b949e;
  --green:       #3fb950;
  --red:         #f85149;
  --blue:        #58a6ff;
  --gold:        #d29922;
}
.metric-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 8px;
}
.price-hero {
  font-size: 2.1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--text-pri);
}
.sec-header {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-sec);
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
  margin: 12px 0 8px 0;
}
.stat-label { color: var(--text-sec); font-size: 0.73rem; text-transform: uppercase; letter-spacing: 0.04em; }
.stat-value { color: var(--text-pri); font-size: 0.88rem; font-weight: 600; }
.tag-green  { color: var(--green); font-weight: 600; }
.tag-red    { color: var(--red);   font-weight: 600; }
.tag-blue   { color: var(--blue);  font-weight: 600; }
.tag-gold   { color: var(--gold);  font-weight: 600; }
.badge-paper { background:#21262d; color:#8b949e; border-radius:3px; padding:2px 8px; font-size:0.73rem; }
.badge-live  { background:#f85149; color:#fff;    border-radius:3px; padding:2px 8px; font-size:0.73rem; font-weight:700; }
</style>
"""

# ── Timeframe → (yfinance period, interval) ───────────────────────────────────
TF_MAP: Dict[str, tuple] = {
    "1m":  ("1d",  "1m"),
    "5m":  ("5d",  "5m"),
    "15m": ("5d",  "15m"),
    "1H":  ("1mo", "60m"),
    "4H":  ("3mo", "60m"),
    "1D":  ("2y",  "1d"),
    "1W":  ("5y",  "1wk"),
}

# ─────────────────────────────────────────────────────────────────────────────
# Session state defaults
# ─────────────────────────────────────────────────────────────────────────────
def init_session_state() -> None:
    defaults: Dict[str, Any] = {
        "symbol":              "AAPL",
        "timeframe":           "1D",
        "order_side":          "buy",
        "order_type_display":  "Market",
        "order_qty":           1.0,
        "order_price":         0.0,
        "order_stop":          0.0,
        "order_notional":      1000.0,
        "order_notional_mode": False,
        "confirm_pending":     False,
        "search_query":        "",
        "cc_opt_expiry":       None,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v
