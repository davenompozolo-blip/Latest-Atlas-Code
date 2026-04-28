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


# ─────────────────────────────────────────────────────────────────────────────
# Chunk 2 — Data helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_secret(key: str, default: str = "") -> str:
    try:
        from services.secrets_helper import get_secret
        return get_secret(key, default)
    except Exception:
        import os
        return os.environ.get(key, default)


def _alpaca_creds() -> tuple:
    api_key = st.session_state.get("alpaca_api_key") or _get_secret("ALPACA_API_KEY")
    secret  = st.session_state.get("alpaca_secret_key") or _get_secret("ALPACA_API_SECRET")
    return api_key, secret


@st.cache_data(ttl=30)
def get_account_info() -> Dict:
    try:
        svc = TradingService.from_session_state()
        return svc.get_account() if svc else {}
    except Exception:
        return {}


@st.cache_data(ttl=30)
def get_snapshot(symbol: str) -> Dict:
    """Latest quote snapshot — tries Alpaca first, falls back to yfinance."""
    # Alpaca path
    if ALPACA_AVAILABLE:
        try:
            from alpaca.data.historical import StockHistoricalDataClient
            from alpaca.data.requests import StockSnapshotRequest
            api_key, secret = _alpaca_creds()
            if api_key and secret:
                client = StockHistoricalDataClient(api_key, secret)
                snaps  = client.get_stock_snapshot(
                    StockSnapshotRequest(symbol_or_symbols=[symbol])
                )
                snap = snaps.get(symbol)
                if snap:
                    lq   = snap.latest_quote
                    lt   = snap.latest_trade
                    db   = snap.daily_bar
                    pb   = snap.prev_daily_bar
                    bid  = float(lq.bid_price or 0)
                    ask  = float(lq.ask_price or 0)
                    last = float(lt.price or 0) if lt else 0.0
                    prev = float(pb.close or 0) if pb else 0.0
                    sprd = ask - bid
                    chg  = last - prev
                    return {
                        "bid": bid, "ask": ask,
                        "bid_size": int(lq.bid_size or 0),
                        "ask_size": int(lq.ask_size or 0),
                        "spread": sprd,
                        "spread_pct": (sprd / last * 100) if last else 0.0,
                        "last_price": last, "prev_close": prev,
                        "change": chg,
                        "change_pct": (chg / prev * 100) if prev else 0.0,
                        "open":   float(db.open   or 0) if db else 0.0,
                        "high":   float(db.high   or 0) if db else 0.0,
                        "low":    float(db.low    or 0) if db else 0.0,
                        "volume": int(db.volume   or 0) if db else 0,
                        "vwap":   float(db.vwap   or 0) if db else 0.0,
                        "source": "alpaca",
                    }
        except Exception:
            pass

    # yfinance fallback
    if YF_AVAILABLE:
        try:
            import yfinance as yf
            tk   = yf.Ticker(symbol)
            fi   = tk.fast_info
            info = {}
            try:
                info = tk.info or {}
            except Exception:
                pass
            last = float(getattr(fi, "last_price", 0) or info.get("currentPrice", 0) or 0)
            prev = float(getattr(fi, "previous_close", 0) or info.get("regularMarketPreviousClose", 0) or 0)
            bid  = float(info.get("bid", 0) or (last - 0.01 if last else 0))
            ask  = float(info.get("ask", 0) or (last + 0.01 if last else 0))
            sprd = ask - bid
            chg  = last - prev
            return {
                "bid": bid, "ask": ask,
                "bid_size": info.get("bidSize", 0),
                "ask_size": info.get("askSize", 0),
                "spread": sprd,
                "spread_pct": (sprd / last * 100) if last else 0.0,
                "last_price": last, "prev_close": prev,
                "change": chg,
                "change_pct": (chg / prev * 100) if prev else 0.0,
                "open":   float(getattr(fi, "open", 0) or info.get("regularMarketOpen", 0) or 0),
                "high":   float(getattr(fi, "day_high", 0) or info.get("dayHigh", 0) or 0),
                "low":    float(getattr(fi, "day_low", 0)  or info.get("dayLow",  0) or 0),
                "volume": int(getattr(fi, "last_volume", 0) or info.get("volume", 0) or 0),
                "vwap":   0.0,
                "source": "yfinance",
            }
        except Exception:
            pass

    return {}


@st.cache_data(ttl=60)
def get_bars_df(symbol: str, timeframe: str = "1D") -> pd.DataFrame:
    period, interval = TF_MAP.get(timeframe, ("2y", "1d"))
    if not YF_AVAILABLE:
        return pd.DataFrame()
    return get_history(symbol, period=period, interval=interval)


@st.cache_data(ttl=300)
def get_fundamentals(symbol: str) -> Dict:
    out: Dict[str, Any] = {}
    if YF_AVAILABLE:
        try:
            info = get_info(symbol)
            out = {
                "company_name":     info.get("longName") or info.get("shortName", symbol),
                "sector":           info.get("sector", ""),
                "industry":         info.get("industry", ""),
                "exchange":         info.get("exchange", ""),
                "description":      info.get("longBusinessSummary", ""),
                "market_cap":       info.get("marketCap"),
                "pe_ratio":         info.get("trailingPE"),
                "forward_pe":       info.get("forwardPE"),
                "peg_ratio":        info.get("pegRatio"),
                "price_to_sales":   info.get("priceToSalesTrailing12Months"),
                "price_to_book":    info.get("priceToBook"),
                "ev_ebitda":        info.get("enterpriseToEbitda"),
                "eps_ttm":          info.get("trailingEps"),
                "eps_forward":      info.get("forwardEps"),
                "revenue_growth":   info.get("revenueGrowth"),
                "earnings_growth":  info.get("earningsGrowth"),
                "gross_margin":     info.get("grossMargins"),
                "op_margin":        info.get("operatingMargins"),
                "net_margin":       info.get("profitMargins"),
                "roe":              info.get("returnOnEquity"),
                "roa":              info.get("returnOnAssets"),
                "debt_equity":      info.get("debtToEquity"),
                "current_ratio":    info.get("currentRatio"),
                "total_cash":       info.get("totalCash"),
                "total_debt":       info.get("totalDebt"),
                "dividend_yield":   info.get("dividendYield"),
                "payout_ratio":     info.get("payoutRatio"),
                "ex_div_date":      info.get("exDividendDate"),
                "week52_high":      info.get("fiftyTwoWeekHigh"),
                "week52_low":       info.get("fiftyTwoWeekLow"),
                "avg_volume":       info.get("averageVolume"),
                "beta":             info.get("beta"),
                "shares_out":       info.get("sharesOutstanding"),
            }
        except Exception:
            pass

    # Alpaca asset metadata overlay
    if ALPACA_AVAILABLE:
        try:
            svc = TradingService.from_session_state()
            if svc:
                asset = svc._client.get_asset(symbol.upper())
                out["fractionable"]   = getattr(asset, "fractionable",   False)
                out["shortable"]      = getattr(asset, "shortable",      False)
                out["marginable"]     = getattr(asset, "marginable",     False)
                out["easy_to_borrow"] = getattr(asset, "easy_to_borrow", False)
                if not out.get("exchange"):
                    out["exchange"] = str(getattr(asset, "exchange", ""))
        except Exception:
            pass

    return out


@st.cache_data(ttl=120)
def get_option_chain(symbol: str, expiry: Optional[str] = None) -> Dict:
    if not YF_AVAILABLE:
        return {"available": False, "reason": "yfinance not installed"}
    try:
        import yfinance as yf
        tk = yf.Ticker(symbol)
        expirations = list(tk.options or [])
        if not expirations:
            return {"available": False, "reason": "No listed options for this security"}
        selected = expiry if expiry in expirations else expirations[0]
        chain    = tk.option_chain(selected)
        return {
            "available":   True,
            "expirations": expirations,
            "selected":    selected,
            "calls":       chain.calls,
            "puts":        chain.puts,
        }
    except Exception as e:
        return {"available": False, "reason": str(e)[:120]}


def search_symbols(query: str) -> List[Dict]:
    if not query:
        return []
    if ALPACA_AVAILABLE:
        try:
            from alpaca.trading.requests import GetAssetsRequest
            from alpaca.trading.enums import AssetClass, AssetStatus
            svc = TradingService.from_session_state()
            if svc:
                req    = GetAssetsRequest(asset_class=AssetClass.US_EQUITY, status=AssetStatus.ACTIVE)
                assets = svc._client.get_all_assets(req)
                q      = query.upper()
                return [
                    {"symbol": a.symbol, "name": a.name or "", "exchange": str(a.exchange)}
                    for a in assets
                    if q in a.symbol.upper() or q in (a.name or "").upper()
                ][:10]
        except Exception:
            pass
    return [{"symbol": query.upper(), "name": "", "exchange": ""}]


# ── Formatting helpers ────────────────────────────────────────────────────────

def _fmt_price(v) -> str:
    try:    return f"${float(v):,.2f}"
    except: return "—"

def _fmt_pct(v) -> str:
    try:    return f"{float(v)*100:.2f}%"
    except: return "—"

def _fmt_large(v) -> str:
    try:
        v = float(v)
        if v >= 1e12: return f"${v/1e12:.2f}T"
        if v >= 1e9:  return f"${v/1e9:.2f}B"
        if v >= 1e6:  return f"${v/1e6:.2f}M"
        return f"${v:,.0f}"
    except: return "—"

def _fmt_vol(v) -> str:
    try:
        v = float(v)
        if v >= 1e9: return f"{v/1e9:.2f}B"
        if v >= 1e6: return f"{v/1e6:.1f}M"
        if v >= 1e3: return f"{v/1e3:.1f}K"
        return str(int(v))
    except: return "—"

def _color(val) -> str:
    try:    return "#3fb950" if float(val) >= 0 else "#f85149"
    except: return "#8b949e"


# ─────────────────────────────────────────────────────────────────────────────
# Chunk 3 — Header: search bar + account badge
# ─────────────────────────────────────────────────────────────────────────────

def render_header() -> None:
    col_search, col_acct = st.columns([3, 1])

    with col_search:
        query = st.text_input(
            label="symbol_search",
            value=st.session_state.get("search_query", st.session_state.symbol),
            placeholder="Search symbol or company — AAPL, NVDA, SPY, TSLA…",
            label_visibility="collapsed",
            key="cc_search_input",
        )

        if query:
            q_clean = query.strip().upper()
            # Only search if it differs from current symbol
            if q_clean != st.session_state.symbol:
                results = search_symbols(query)
                if results:
                    btn_cols = st.columns(min(len(results), 5))
                    for i, r in enumerate(results[:5]):
                        with btn_cols[i]:
                            label = r["symbol"]
                            sub   = (r.get("name") or "")[:16]
                            if st.button(
                                f"**{label}**\n{sub}",
                                key=f"cc_sug_{label}",
                                use_container_width=True,
                            ):
                                st.session_state.symbol       = label
                                st.session_state.search_query = label
                                st.session_state.confirm_pending = False
                                get_snapshot.clear()
                                get_bars_df.clear()
                                get_fundamentals.clear()
                                get_option_chain.clear()
                                st.rerun()

                # Allow Enter / Load button to confirm a manually typed symbol
                if q_clean.isalpha() and len(q_clean) <= 5:
                    if st.button(f"Load {q_clean}", key="cc_load_typed", type="primary"):
                        st.session_state.symbol       = q_clean
                        st.session_state.search_query = q_clean
                        st.session_state.confirm_pending = False
                        get_snapshot.clear()
                        get_bars_df.clear()
                        get_fundamentals.clear()
                        get_option_chain.clear()
                        st.rerun()

    with col_acct:
        acct = get_account_info()
        if acct:
            mode    = acct.get("mode", "PAPER")
            equity  = acct.get("equity", 0.0)
            cash    = acct.get("cash", 0.0)
            day_chg = equity - acct.get("last_equity", equity)
            chg_col = _color(day_chg)
            badge   = (
                '<span class="badge-live">⚠ LIVE</span>'
                if mode == "LIVE" else
                '<span class="badge-paper">PAPER</span>'
            )
            st.markdown(
                f"{badge}<br>"
                f'<span class="stat-label">Equity </span>'
                f'<span class="stat-value">${equity:,.0f}</span><br>'
                f'<span class="stat-label">Cash </span>'
                f'<span class="stat-value">${cash:,.0f}</span><br>'
                f'<span class="stat-label">Day P&L </span>'
                f'<span style="color:{chg_col};font-weight:600;">'
                f'{day_chg:+,.0f}</span>',
                unsafe_allow_html=True,
            )
        else:
            st.caption("Alpaca not connected")
