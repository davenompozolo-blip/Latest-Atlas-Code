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


# ─────────────────────────────────────────────────────────────────────────────
# Chunk 4 — Security info panel (left column)
# ─────────────────────────────────────────────────────────────────────────────

def render_security_info(symbol: str) -> None:
    snap = get_snapshot(symbol)
    fund = get_fundamentals(symbol)

    name   = fund.get("company_name", symbol)
    exch   = fund.get("exchange", "")
    sector = fund.get("sector", "")

    # ── Name / exchange strip ─────────────────────────────────────────────
    st.markdown(
        f"<div style='margin-bottom:2px;'>"
        f"<span style='font-size:1.45rem;font-weight:700;color:#e6edf3;'>{symbol}</span>"
        f"<span style='color:#8b949e;margin-left:8px;font-size:0.88rem;'>{name}</span>"
        f"</div>"
        f"<div style='color:#8b949e;font-size:0.76rem;margin-bottom:10px;'>"
        f"{exch}{'  ·  ' + sector if sector else ''}"
        f"</div>",
        unsafe_allow_html=True,
    )

    # ── Price hero ────────────────────────────────────────────────────────
    last  = snap.get("last_price", 0.0)
    chg   = snap.get("change", 0.0)
    chgp  = snap.get("change_pct", 0.0)
    col   = _color(chg)
    arrow = "▲" if chg >= 0 else "▼"

    st.markdown(
        f"<div class='price-hero'>${last:,.2f}</div>"
        f"<div style='color:{col};font-size:0.95rem;font-weight:600;margin-bottom:14px;'>"
        f"{arrow} {chg:+.2f} ({chgp:+.2f}%)"
        f"</div>",
        unsafe_allow_html=True,
    )

    # ── OHLCV stats grid ──────────────────────────────────────────────────
    st.markdown('<div class="sec-header">Market Data</div>', unsafe_allow_html=True)

    stats = [
        ("Open",      _fmt_price(snap.get("open"))),
        ("High",      _fmt_price(snap.get("high"))),
        ("Low",       _fmt_price(snap.get("low"))),
        ("Prev Close",_fmt_price(snap.get("prev_close"))),
        ("Volume",    _fmt_vol(snap.get("volume"))),
        ("VWAP",      _fmt_price(snap.get("vwap")) if snap.get("vwap") else "—"),
        ("52W High",  _fmt_price(fund.get("week52_high"))),
        ("52W Low",   _fmt_price(fund.get("week52_low"))),
        ("Avg Vol",   _fmt_vol(fund.get("avg_volume"))),
        ("Beta",      f"{fund['beta']:.2f}" if fund.get("beta") else "—"),
        ("Mkt Cap",   _fmt_large(fund.get("market_cap"))),
        ("EPS (TTM)", _fmt_price(fund.get("eps_ttm"))),
    ]

    c1, c2 = st.columns(2)
    for i, (lbl, val) in enumerate(stats):
        with (c1 if i % 2 == 0 else c2):
            st.markdown(
                f"<div style='margin-bottom:5px;'>"
                f"<span class='stat-label'>{lbl}</span><br>"
                f"<span class='stat-value'>{val}</span>"
                f"</div>",
                unsafe_allow_html=True,
            )

    # ── Alpaca asset attributes ───────────────────────────────────────────
    attrs = [a for a, k in [
        ("Fractional", "fractionable"),
        ("Shortable",  "shortable"),
        ("Marginable", "marginable"),
        ("ETB",        "easy_to_borrow"),
    ] if fund.get(k)]
    if attrs:
        pills = " ".join(
            f"<span style='background:#21262d;border:1px solid #30363d;"
            f"border-radius:3px;padding:1px 6px;font-size:0.72rem;color:#8b949e;'>{a}</span>"
            for a in attrs
        )
        st.markdown(pills + "<br>", unsafe_allow_html=True)

    # ── Description ───────────────────────────────────────────────────────
    desc = fund.get("description", "")
    if desc:
        st.markdown('<div class="sec-header">About</div>', unsafe_allow_html=True)
        with st.expander("Read more", expanded=False):
            st.caption(desc[:600] + ("…" if len(desc) > 600 else ""))


# ─────────────────────────────────────────────────────────────────────────────
# Chunk 5 — Price chart (right column)
# ─────────────────────────────────────────────────────────────────────────────

def render_chart(symbol: str, timeframe: str) -> None:
    # ── Timeframe pill selector ───────────────────────────────────────────
    tf_list = list(TF_MAP.keys())
    tf_cols = st.columns(len(tf_list))
    for i, tf in enumerate(tf_list):
        with tf_cols[i]:
            is_active = tf == timeframe
            if st.button(
                tf,
                key=f"cc_tf_{tf}",
                use_container_width=True,
                type="primary" if is_active else "secondary",
            ):
                st.session_state.timeframe = tf
                get_bars_df.clear()
                st.rerun()

    # ── Fetch bars ────────────────────────────────────────────────────────
    df = get_bars_df(symbol, timeframe)

    if df is None or df.empty:
        st.info(f"No chart data for {symbol}.")
        return

    # ── TradingView chart (preferred) ─────────────────────────────────────
    if TRADINGVIEW_AVAILABLE:
        render_candlestick_chart(
            df=df,
            key=f"cc_chart_{symbol}_{timeframe}",
            height=440,
            show_volume=True,
            watermark=symbol,
            dark_mode=True,
        )
        return

    # ── Plotly fallback ───────────────────────────────────────────────────
    try:
        import plotly.graph_objects as go
        from plotly.subplots import make_subplots

        df2 = df.copy()
        if isinstance(df2.index, pd.DatetimeIndex):
            df2 = df2.reset_index()
        df2.columns = [c.lower() for c in df2.columns]
        date_col = df2.columns[0]

        fig = make_subplots(
            rows=2, cols=1, shared_xaxes=True,
            row_heights=[0.76, 0.24], vertical_spacing=0.02,
        )
        fig.add_trace(go.Candlestick(
            x=df2[date_col],
            open=df2["open"], high=df2["high"],
            low=df2["low"],   close=df2["close"],
            increasing_line_color="#3fb950",
            decreasing_line_color="#f85149",
            name=symbol,
        ), row=1, col=1)

        vol_col = next((c for c in df2.columns if "vol" in c), None)
        if vol_col:
            colors = [
                "#3fb950" if c >= o else "#f85149"
                for c, o in zip(df2["close"], df2["open"])
            ]
            fig.add_trace(go.Bar(
                x=df2[date_col], y=df2[vol_col],
                marker_color=colors, opacity=0.6, name="Volume",
            ), row=2, col=1)

        fig.update_layout(
            height=440,
            paper_bgcolor="#0d1117", plot_bgcolor="#0d1117",
            xaxis_rangeslider_visible=False,
            showlegend=False,
            margin=dict(l=0, r=0, t=4, b=0),
            font=dict(color="#8b949e"),
        )
        for axis in ["xaxis", "xaxis2", "yaxis", "yaxis2"]:
            fig.update_layout(**{axis: dict(gridcolor="#21262d", zeroline=False)})

        st.plotly_chart(fig, use_container_width=True)

    except Exception as e:
        st.warning(f"Chart unavailable: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Chunk 6 — Bid/Ask quote strip (full-width)
# ─────────────────────────────────────────────────────────────────────────────

def render_quote_strip(symbol: str) -> None:
    snap = get_snapshot(symbol)

    bid       = snap.get("bid", 0.0)
    ask       = snap.get("ask", 0.0)
    bid_sz    = snap.get("bid_size", 0)
    ask_sz    = snap.get("ask_size", 0)
    spread    = snap.get("spread", 0.0)
    spread_pct= snap.get("spread_pct", 0.0)
    last      = snap.get("last_price", 0.0)
    chg       = snap.get("change", 0.0)
    chgp      = snap.get("change_pct", 0.0)
    hi        = snap.get("high", 0.0)
    lo        = snap.get("low", 0.0)
    vol       = snap.get("volume", 0)
    vwap      = snap.get("vwap", 0.0)
    source    = snap.get("source", "")
    chg_col   = _color(chg)
    arrow     = "▲" if chg >= 0 else "▼"

    c1, c2, c3, c4, c5, c6, c7, c8 = st.columns([1.8, 1.8, 1.6, 1.6, 1.6, 1.6, 1.6, 0.8])

    with c1:
        st.markdown(
            f'<span class="stat-label">BID</span><br>'
            f'<span class="tag-green" style="font-size:1.05rem;">'
            f'${bid:.4f}</span>'
            f'<span class="stat-label"> ×{bid_sz}</span>',
            unsafe_allow_html=True,
        )
    with c2:
        st.markdown(
            f'<span class="stat-label">ASK</span><br>'
            f'<span class="tag-red" style="font-size:1.05rem;">'
            f'${ask:.4f}</span>'
            f'<span class="stat-label"> ×{ask_sz}</span>',
            unsafe_allow_html=True,
        )
    with c3:
        st.markdown(
            f'<span class="stat-label">SPREAD</span><br>'
            f'<span class="tag-gold">${spread:.4f} ({spread_pct:.3f}%)</span>',
            unsafe_allow_html=True,
        )
    with c4:
        st.markdown(
            f'<span class="stat-label">LAST</span><br>'
            f'<span class="stat-value" style="font-size:1.05rem;">${last:.2f}</span>',
            unsafe_allow_html=True,
        )
    with c5:
        st.markdown(
            f'<span class="stat-label">CHANGE</span><br>'
            f'<span style="color:{chg_col};font-weight:600;">'
            f'{arrow} {chg:+.2f} ({chgp:+.2f}%)</span>',
            unsafe_allow_html=True,
        )
    with c6:
        st.markdown(
            f'<span class="stat-label">HI / LO</span><br>'
            f'<span class="tag-green">${hi:.2f}</span>'
            f'<span class="stat-label"> / </span>'
            f'<span class="tag-red">${lo:.2f}</span>',
            unsafe_allow_html=True,
        )
    with c7:
        st.markdown(
            f'<span class="stat-label">VOL / VWAP</span><br>'
            f'<span class="stat-value">{_fmt_vol(vol)}'
            + (f' / ${vwap:.2f}' if vwap else '') +
            f'</span>',
            unsafe_allow_html=True,
        )
    with c8:
        if st.button("↻", key="cc_refresh_quote", help="Refresh quote"):
            get_snapshot.clear()
            st.rerun()
        if source:
            st.caption(source)


# ─────────────────────────────────────────────────────────────────────────────
# Chunk 7 — Order ticket (left column of bottom row)
# ─────────────────────────────────────────────────────────────────────────────

def _dispatch_order(svc, symbol, side, ot, qty, notional,
                    limit_price, stop_price, tp_price, sl_price, tif) -> "TradeResult":
    try:
        if ot == "Market":
            return (svc.submit_dollar_order(symbol, notional, side, tif)
                    if notional else svc.submit_market_order(symbol, qty, side, tif))
        elif ot == "Limit":
            shares = qty or ((notional / limit_price) if limit_price else 1)
            return svc.submit_limit_order(symbol, shares, side, limit_price, tif)
        elif ot == "Stop":
            return svc.submit_stop_order(symbol, qty or 1, side, stop_price, tif)
        elif ot == "Stop-Limit":
            return svc.submit_stop_limit_order(symbol, qty or 1, side, stop_price, limit_price, tif)
        elif ot == "Bracket":
            shares = qty or ((notional / limit_price) if limit_price else 1)
            return svc.submit_bracket_order(symbol, shares, side, limit_price, tp_price, sl_price, tif)
    except Exception as e:
        return TradeResult(success=False, message=str(e))
    return TradeResult(success=False, message="Unknown order configuration.")


def render_order_ticket(symbol: str, current_price: float) -> None:
    st.markdown('<div class="sec-header">Order Ticket</div>', unsafe_allow_html=True)

    svc = TradingService.from_session_state()
    if svc is None:
        st.info("Connect Alpaca to trade.")
        if st.button("Connect", key="cc_go_connect"):
            st.session_state["nav_page"] = "portfolio_home"
            st.rerun()
        return

    # ── Side ──────────────────────────────────────────────────────────────
    side = st.radio(
        "Side", ["Buy", "Sell"], horizontal=True,
        index=0 if st.session_state.order_side == "buy" else 1,
        key="cc_ot_side",
    ).lower()
    st.session_state.order_side = side
    side_col = "#3fb950" if side == "buy" else "#f85149"

    # ── Order type ────────────────────────────────────────────────────────
    ot_options = ["Market", "Limit", "Stop", "Stop-Limit", "Bracket"]
    ot = st.selectbox(
        "Type", ot_options,
        index=ot_options.index(st.session_state.get("order_type_display", "Market")),
        key="cc_ot_type",
    )
    st.session_state["order_type_display"] = ot

    # ── Size ──────────────────────────────────────────────────────────────
    notional_mode = st.toggle(
        "Dollar amount ($)", value=st.session_state.order_notional_mode,
        key="cc_notional_toggle",
    )
    st.session_state.order_notional_mode = notional_mode

    qty = notional = None
    if notional_mode:
        notional = st.number_input(
            "Amount ($)", min_value=1.0,
            value=float(st.session_state.order_notional),
            step=100.0, format="%.2f", key="cc_ot_notional",
        )
        st.session_state.order_notional = notional
        if current_price:
            st.caption(f"≈ {notional/current_price:.4f} shares @ ${current_price:.2f}")
    else:
        qty = st.number_input(
            "Shares", min_value=0.0001,
            value=float(st.session_state.order_qty),
            step=1.0, format="%.4f", key="cc_ot_qty",
        )
        st.session_state.order_qty = qty
        if current_price:
            st.caption(f"Est. ${qty * current_price:,.2f}")

    # ── Price fields ──────────────────────────────────────────────────────
    limit_price = stop_price = tp_price = sl_price = None

    if ot in ("Limit", "Stop-Limit", "Bracket"):
        limit_price = st.number_input(
            "Limit Price ($)", min_value=0.01,
            value=float(st.session_state.get("order_price") or current_price or 100.0),
            step=0.01, format="%.2f", key="cc_ot_limit",
        )
    if ot in ("Stop", "Stop-Limit"):
        stop_price = st.number_input(
            "Stop Price ($)", min_value=0.01,
            value=float(st.session_state.get("order_stop") or current_price * 0.97 or 97.0),
            step=0.01, format="%.2f", key="cc_ot_stop",
        )
    if ot == "Bracket":
        c_tp, c_sl = st.columns(2)
        with c_tp:
            tp_pct = st.number_input("TP %", min_value=0.1, value=5.0, step=0.5,
                                     format="%.1f", key="cc_ot_tp")
        with c_sl:
            sl_pct = st.number_input("SL %", min_value=0.1, value=3.0, step=0.5,
                                     format="%.1f", key="cc_ot_sl")
        if limit_price:
            tp_price = limit_price * (1 + tp_pct / 100)
            sl_price = limit_price * (1 - sl_pct / 100)

    tif = st.selectbox("TIF", ["day", "gtc", "ioc", "fok"],
                       format_func=str.upper, key="cc_ot_tif")

    # ── Position Sizer (collapsed) ────────────────────────────────────────
    if SIZER_AVAILABLE and current_price:
        with st.expander("Position Sizer", expanded=False):
            acct   = get_account_info()
            equity = acct.get("equity", 100_000.0)
            method = st.radio("Method", ["Kelly", "Fixed %", "Vol-Based"],
                              horizontal=True, key="cc_ps_method")
            if method == "Kelly":
                wr  = st.slider("Win Rate", 30, 70, 55, key="cc_ps_wr") / 100
                aw  = st.slider("Avg Win %", 1, 25, 8, key="cc_ps_aw") / 100
                al  = st.slider("Avg Loss %", 1, 15, 4, key="cc_ps_al") / 100
                res = kelly_fraction(wr, aw, al, equity, current_price)
            elif method == "Fixed %":
                rp  = st.slider("Risk %", 1, 10, 2, key="cc_ps_rp") / 100
                res = fixed_fractional(rp, equity, current_price)
            else:
                av  = st.slider("Ann. Vol %", 5, 80, 25, key="cc_ps_av") / 100
                dv  = annual_vol_to_daily(av)
                res = volatility_based(dv, equity, current_price)
            st.metric("Suggested Shares", f"{res.shares:,.2f}")
            st.metric("Notional",         f"${res.notional:,.0f}")
            st.caption(res.notes)
            if st.button("Use this size", key="cc_ps_use"):
                st.session_state.order_qty = res.shares
                st.session_state.order_notional_mode = False
                st.rerun()

    st.markdown("<hr style='border-color:#30363d;margin:10px 0;'>", unsafe_allow_html=True)

    # ── Two-step confirm ──────────────────────────────────────────────────
    if not st.session_state.confirm_pending:
        lbl = f"{'BUY' if side == 'buy' else 'SELL'} {symbol}"
        if st.button(lbl, type="primary", use_container_width=True, key="cc_review"):
            st.session_state.confirm_pending = True
            st.rerun()
    else:
        size_str = f"${notional:,.2f}" if notional_mode else f"{qty:,.4f} sh"
        warn = "" if svc.is_paper() else "⚠️ **LIVE ACCOUNT**"
        detail = (
            (f"<br>Limit ${limit_price:.2f}" if limit_price else "") +
            (f"  Stop ${stop_price:.2f}" if stop_price else "") +
            (f"<br>TP ${tp_price:.2f}  SL ${sl_price:.2f}" if tp_price else "") +
            (f"<br><span style='color:#f85149;'>{warn}</span>" if warn else "")
        )
        st.markdown(
            f'<div class="metric-card" style="border-color:{side_col};">'
            f'<b style="color:{side_col};">{side.upper()}</b> {size_str} '
            f'<b>{symbol}</b> · {ot} · {tif.upper()}'
            f'{detail}</div>',
            unsafe_allow_html=True,
        )
        col_ok, col_cx = st.columns(2)
        with col_ok:
            if st.button("✓ Confirm", type="primary", use_container_width=True, key="cc_confirm"):
                result = _dispatch_order(svc, symbol, side, ot, qty, notional,
                                         limit_price, stop_price, tp_price, sl_price, tif)
                st.session_state.confirm_pending = False
                if result.success:
                    st.success(result.message)
                    if result.order_id:
                        st.caption(f"ID: `{result.order_id}`")
                else:
                    st.error(result.message)
        with col_cx:
            if st.button("Cancel", use_container_width=True, key="cc_cancel"):
                st.session_state.confirm_pending = False
                st.rerun()

    # ── Open orders for this symbol ───────────────────────────────────────
    try:
        open_orders = [o for o in svc.get_open_orders()
                       if o.get("symbol") == symbol.upper()]
        if open_orders:
            st.markdown(
                f'<div class="sec-header">Open Orders ({len(open_orders)})</div>',
                unsafe_allow_html=True,
            )
            for o in open_orders:
                oc  = "#3fb950" if "buy" in str(o["side"]).lower() else "#f85149"
                lp  = f" @ ${o['limit_price']:.2f}" if o.get("limit_price") else ""
                c_i, c_x = st.columns([5, 1])
                with c_i:
                    st.markdown(
                        f'<span style="color:{oc};font-weight:600;">'
                        f'{str(o["side"]).upper()}</span> '
                        f'{o["qty"]:g} {o["symbol"]}{lp} '
                        f'<span class="stat-label">{str(o["order_type"]).upper()}</span>',
                        unsafe_allow_html=True,
                    )
                with c_x:
                    if st.button("×", key=f"cc_cxl_{o['id']}", help="Cancel order"):
                        svc.cancel_order(o["id"])
                        st.rerun()
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Chunk 8 — Fundamentals panel (middle column)
# ─────────────────────────────────────────────────────────────────────────────

def render_fundamentals(symbol: str) -> None:
    fund = get_fundamentals(symbol)

    def _row(label: str, val: str) -> None:
        st.markdown(
            f"<div style='display:flex;justify-content:space-between;"
            f"padding:3px 0;border-bottom:1px solid #21262d;'>"
            f"<span class='stat-label'>{label}</span>"
            f"<span class='stat-value'>{val}</span></div>",
            unsafe_allow_html=True,
        )

    # ── Valuation ─────────────────────────────────────────────────────────
    st.markdown('<div class="sec-header">Valuation</div>', unsafe_allow_html=True)
    _row("P/E (TTM)",    f"{fund['pe_ratio']:.1f}x"        if fund.get("pe_ratio")      else "—")
    _row("Forward P/E",  f"{fund['forward_pe']:.1f}x"      if fund.get("forward_pe")    else "—")
    _row("PEG",          f"{fund['peg_ratio']:.2f}"         if fund.get("peg_ratio")     else "—")
    _row("P/S",          f"{fund['price_to_sales']:.2f}x"  if fund.get("price_to_sales") else "—")
    _row("P/B",          f"{fund['price_to_book']:.2f}x"   if fund.get("price_to_book") else "—")
    _row("EV/EBITDA",    f"{fund['ev_ebitda']:.1f}x"       if fund.get("ev_ebitda")     else "—")
    _row("Market Cap",   _fmt_large(fund.get("market_cap")))
    _row("EPS (TTM)",    _fmt_price(fund.get("eps_ttm")))
    _row("EPS (Fwd)",    _fmt_price(fund.get("eps_forward")))

    # ── Growth ────────────────────────────────────────────────────────────
    st.markdown('<div class="sec-header">Growth</div>', unsafe_allow_html=True)
    _row("Revenue YoY",  _fmt_pct(fund.get("revenue_growth"))  if fund.get("revenue_growth")  else "—")
    _row("Earnings YoY", _fmt_pct(fund.get("earnings_growth")) if fund.get("earnings_growth") else "—")

    # ── Quality ───────────────────────────────────────────────────────────
    st.markdown('<div class="sec-header">Quality</div>', unsafe_allow_html=True)
    _row("Gross Margin",  _fmt_pct(fund.get("gross_margin")) if fund.get("gross_margin") else "—")
    _row("Op Margin",     _fmt_pct(fund.get("op_margin"))    if fund.get("op_margin")    else "—")
    _row("Net Margin",    _fmt_pct(fund.get("net_margin"))   if fund.get("net_margin")   else "—")
    _row("ROE",           _fmt_pct(fund.get("roe"))          if fund.get("roe")          else "—")
    _row("ROA",           _fmt_pct(fund.get("roa"))          if fund.get("roa")          else "—")

    # ── Balance sheet ─────────────────────────────────────────────────────
    st.markdown('<div class="sec-header">Balance Sheet</div>', unsafe_allow_html=True)
    _row("Cash",          _fmt_large(fund.get("total_cash")))
    _row("Debt",          _fmt_large(fund.get("total_debt")))
    _row("D/E Ratio",     f"{fund['debt_equity']:.2f}"   if fund.get("debt_equity")  else "—")
    _row("Current Ratio", f"{fund['current_ratio']:.2f}" if fund.get("current_ratio") else "—")

    # ── Dividends (conditional) ───────────────────────────────────────────
    if fund.get("dividend_yield"):
        st.markdown('<div class="sec-header">Dividends</div>', unsafe_allow_html=True)
        _row("Yield",        _fmt_pct(fund.get("dividend_yield")))
        _row("Payout Ratio", _fmt_pct(fund.get("payout_ratio")) if fund.get("payout_ratio") else "—")
        ex = fund.get("ex_div_date")
        if ex:
            try:
                ex_str = datetime.fromtimestamp(int(ex)).strftime("%b %d, %Y")
            except Exception:
                ex_str = str(ex)
            _row("Ex-Div Date", ex_str)

    # ── Valuation House link ──────────────────────────────────────────────
    st.markdown("<br>", unsafe_allow_html=True)
    if st.button("Open in Valuation House →", key="cc_goto_vh",
                 use_container_width=True, type="secondary"):
        st.session_state["vh_prefill_ticker"] = symbol
        st.session_state["nav_page"] = "valuation_house"
        st.rerun()
