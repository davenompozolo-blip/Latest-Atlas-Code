"""
ATLAS Terminal v11.0 - Macro Intelligence Dashboard (Module 2)
===============================================================
Newspaper front-page layout for macro regime classification,
inflation/growth/liquidity monitoring, market signals, cross-asset
heatmap, factor returns, financial conditions, portfolio impact,
and scenario analysis.

Four-quadrant framework: Growth (Up/Down) x Inflation (Up/Down)
"""

import pandas as pd
import numpy as np
import streamlit as st
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime, timedelta

from app.config import COLORS, CHART_THEME
from utils.formatting import (
    format_currency,
    format_percentage,
    format_large_number,
    add_arrow_indicator,
)


# =============================================================================
# CONSTANTS
# =============================================================================

COLOR_POSITIVE = "#10b981"
COLOR_NEGATIVE = "#ef4444"
COLOR_TRANSITION = "#f59e0b"
COLOR_NEUTRAL = "rgba(255,255,255,0.52)"
COLOR_PRIMARY = "#6366f1"

CARD_STYLE = (
    "background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07);"
    " border-radius: 12px; padding: 20px; margin-bottom: 16px;"
)
LABEL_STYLE = (
    "font-size: 11px; color: rgba(255,255,255,0.52); text-transform: uppercase;"
    " letter-spacing: 1px; margin-bottom: 8px;"
)
VALUE_STYLE = "font-size: 24px; font-weight: 600; color: rgba(255,255,255,0.92);"

# Cross-asset tickers for heatmap
CROSS_ASSET_TICKERS = {
    "SPY": "S&P 500",
    "EFA": "Intl Dev",
    "EEM": "EM Equity",
    "TLT": "Long Tsy",
    "HYG": "High Yield",
    "LQD": "IG Credit",
    "GLD": "Gold",
    "USO": "Oil",
    "UUP": "Dollar",
}

# Scenario definitions
SCENARIOS = {
    "Fed pauses": {
        "description": (
            "The Federal Reserve signals a pause in the rate cycle. Duration assets rally, "
            "credit spreads tighten. Growth-sensitive equities benefit as financial conditions "
            "ease. Dollar weakens modestly. Favor quality growth and long duration."
        ),
        "growth_shift": 0.3,
        "inflation_shift": -0.2,
    },
    "Recession": {
        "description": (
            "Economic contraction materializes with rising unemployment and falling corporate "
            "earnings. Yield curve steepens as front-end rates drop. Credit spreads widen "
            "sharply. Rotate to defensive quality, long duration bonds, and cash."
        ),
        "growth_shift": -2.0,
        "inflation_shift": -1.0,
    },
    "Stagflation": {
        "description": (
            "Persistent inflation meets weakening growth. Central banks trapped between "
            "inflation mandates and recession risk. Real assets (commodities, TIPS) outperform. "
            "Worst environment for traditional 60/40 portfolios."
        ),
        "growth_shift": -1.5,
        "inflation_shift": 1.5,
    },
    "Dollar crash": {
        "description": (
            "Sharp dollar depreciation driven by twin-deficit concerns or de-dollarization. "
            "International equities and commodities rally in USD terms. Gold benefits as "
            "alternative store of value. Import prices drive inflation higher."
        ),
        "growth_shift": -0.5,
        "inflation_shift": 1.0,
    },
    "Soft landing": {
        "description": (
            "Inflation moderates without recession. Labor market stays resilient while price "
            "pressures ease. Goldilocks scenario favoring risk assets across the board. "
            "Broad equity rally with narrowing credit spreads."
        ),
        "growth_shift": 0.5,
        "inflation_shift": -0.5,
    },
}


# =============================================================================
# HELPERS — chart theme, cards, caching
# =============================================================================


def _apply_atlas_theme(fig: go.Figure, height: int = 400) -> go.Figure:
    """Apply the ATLAS dark glassmorphism chart theme."""
    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(
            color="rgba(255,255,255,0.52)",
            family="DM Sans, sans-serif",
            size=11,
        ),
        xaxis=dict(
            gridcolor="rgba(255,255,255,0.05)",
            linecolor="rgba(255,255,255,0.07)",
        ),
        yaxis=dict(
            gridcolor="rgba(255,255,255,0.05)",
            linecolor="rgba(255,255,255,0.07)",
        ),
        margin=dict(l=40, r=20, t=40, b=40),
        height=height,
    )
    return fig


def _glass_card(label: str, value: str, sub: str = "", color: str = "") -> str:
    """Return HTML for a single glassmorphic metric card."""
    val_color = color if color else "rgba(255,255,255,0.92)"
    sub_html = (
        f'<div style="font-size: 12px; color: {color if color else COLOR_NEUTRAL}; '
        f'margin-top: 4px;">{sub}</div>'
        if sub
        else ""
    )
    return (
        f'<div style="{CARD_STYLE}">'
        f'<div style="{LABEL_STYLE}">{label}</div>'
        f'<div style="font-size: 24px; font-weight: 600; color: {val_color};">{value}</div>'
        f"{sub_html}"
        f"</div>"
    )


def _direction_color(value: float) -> str:
    """Return green for positive, red for negative."""
    if value > 0.01:
        return COLOR_POSITIVE
    elif value < -0.01:
        return COLOR_NEGATIVE
    return COLOR_NEUTRAL


def _arrow(value: float) -> str:
    """Unicode arrow based on sign."""
    if value > 0.01:
        return "&#9650;"  # ▲
    elif value < -0.01:
        return "&#9660;"  # ▼
    return "&#9472;"  # ─


# =============================================================================
# DATA FETCHING (cached)
# =============================================================================


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_cross_asset_returns() -> pd.DataFrame:
    """Fetch multi-period returns for cross-asset heatmap."""
    try:
        import yfinance as yf

        tickers = list(CROSS_ASSET_TICKERS.keys())
        data = yf.download(tickers, period="1y", progress=False)

        if data.empty:
            return pd.DataFrame()

        if isinstance(data.columns, pd.MultiIndex):
            close = data["Close"]
        else:
            close = data

        now_idx = close.index[-1]
        periods = {
            "1W": 5,
            "1M": 21,
            "3M": 63,
            "YTD": None,
        }

        rows = []
        for ticker in tickers:
            if ticker not in close.columns:
                continue
            series = close[ticker].dropna()
            if len(series) < 10:
                continue

            latest = series.iloc[-1]
            row = {"Ticker": ticker, "Name": CROSS_ASSET_TICKERS[ticker]}
            for label, offset in periods.items():
                if label == "YTD":
                    ytd_start = series.loc[
                        series.index >= pd.Timestamp(datetime(datetime.now().year, 1, 1))
                    ]
                    if len(ytd_start) > 0:
                        row[label] = (latest / ytd_start.iloc[0] - 1) * 100
                    else:
                        row[label] = np.nan
                else:
                    if len(series) > offset:
                        row[label] = (latest / series.iloc[-offset] - 1) * 100
                    else:
                        row[label] = np.nan
            rows.append(row)

        return pd.DataFrame(rows)
    except Exception:
        return pd.DataFrame()


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_yield_curve_data() -> dict:
    """Fetch yield curve points via yfinance."""
    try:
        import yfinance as yf

        tickers_map = {
            "3M": "^IRX",
            "2Y": None,   # no reliable yfinance source; derive from FRED or skip
            "5Y": "^FVX",
            "10Y": "^TNX",
            "30Y": "^TYX",
        }

        curve = {}
        for tenor, ticker in tickers_map.items():
            if ticker is None:
                continue
            try:
                hist = yf.Ticker(ticker).history(period="5d")
                if len(hist) > 0:
                    curve[tenor] = float(hist["Close"].iloc[-1])
            except Exception:
                pass

        # Try FRED for 2Y
        try:
            from services.fred_data import fred_service
            df_2y = fred_service.fetch_series("treasury_2y")
            if df_2y is not None and len(df_2y) > 0:
                curve["2Y"] = float(df_2y["value"].iloc[-1])
        except Exception:
            pass

        return curve
    except Exception:
        return {}


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_credit_data() -> dict:
    """Fetch credit spread proxies."""
    try:
        import yfinance as yf

        result = {}
        for label, ticker in [("HYG", "HYG"), ("LQD", "LQD")]:
            try:
                hist = yf.Ticker(ticker).history(period="1y")
                if len(hist) > 0:
                    current = float(hist["Close"].iloc[-1])
                    avg_1y = float(hist["Close"].mean())
                    result[label] = {
                        "current": current,
                        "avg_1y": avg_1y,
                        "vs_avg": (current / avg_1y - 1) * 100,
                    }
            except Exception:
                pass

        # Try FRED for actual spreads
        try:
            from services.fred_data import fred_service
            fred_credit = fred_service.get_credit_data()
            if fred_credit:
                result["fred"] = fred_credit
        except Exception:
            pass

        return result
    except Exception:
        return {}


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_fx_dollar() -> dict:
    """Fetch DXY and compute vs 200-day MA."""
    try:
        import yfinance as yf

        dxy = yf.Ticker("DX-Y.NYB").history(period="1y")
        if dxy.empty:
            return {}

        current = float(dxy["Close"].iloc[-1])
        ma200 = float(dxy["Close"].tail(200).mean()) if len(dxy) >= 200 else float(dxy["Close"].mean())
        return {
            "current": current,
            "ma200": ma200,
            "vs_ma200": (current / ma200 - 1) * 100,
            "trend": "Above 200d MA" if current > ma200 else "Below 200d MA",
            "series": dxy["Close"],
        }
    except Exception:
        return {}


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_commodity_data() -> dict:
    """Fetch oil, gold, copper returns."""
    try:
        import yfinance as yf

        commodities = {"Oil": "CL=F", "Gold": "GC=F", "Copper": "HG=F"}
        result = {}
        for name, ticker in commodities.items():
            try:
                hist = yf.Ticker(ticker).history(period="3mo")
                if len(hist) > 5:
                    current = float(hist["Close"].iloc[-1])
                    ret_1m = (
                        (current / float(hist["Close"].iloc[-21]) - 1) * 100
                        if len(hist) > 21
                        else 0
                    )
                    ret_3m = (current / float(hist["Close"].iloc[0]) - 1) * 100
                    result[name] = {
                        "current": current,
                        "ret_1m": ret_1m,
                        "ret_3m": ret_3m,
                    }
            except Exception:
                pass
        return result
    except Exception:
        return {}


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_vix_data() -> dict:
    """Fetch VIX and VIX3M for term structure."""
    try:
        import yfinance as yf

        result = {}
        for label, ticker in [("VIX", "^VIX"), ("VIX3M", "^VIX3M")]:
            try:
                hist = yf.Ticker(ticker).history(period="6mo")
                if len(hist) > 0:
                    result[label] = {
                        "current": float(hist["Close"].iloc[-1]),
                        "avg_3m": float(hist["Close"].tail(63).mean()),
                        "series": hist["Close"],
                    }
            except Exception:
                pass

        if "VIX" in result and "VIX3M" in result:
            ratio = result["VIX"]["current"] / result["VIX3M"]["current"]
            result["term_structure"] = {
                "ratio": ratio,
                "contango": ratio < 1.0,
                "label": "Contango (normal)" if ratio < 1.0 else "Backwardation (fear)",
            }

        return result
    except Exception:
        return {}


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_factor_returns() -> dict:
    """Fetch factor ETF performance for current period."""
    try:
        from services.factor_model import factor_service
        perf = factor_service.get_factor_performance(period="3mo")
        return perf if perf else {}
    except Exception:
        return {}


# =============================================================================
# SECTION RENDERERS
# =============================================================================


def _render_regime_quadrant(regime_data: dict):
    """
    TOP STRIP: Four-quadrant regime classification with the current regime
    highlighted in its signature color.
    """
    from services.macro_regime import MacroRegime, REGIME_CONFIG

    current_regime = regime_data.get("regime", "goldilocks")
    confidence = regime_data.get("confidence", 50)
    regime_label = regime_data.get("label", "Unknown")
    regime_color = regime_data.get("color", COLOR_PRIMARY)
    description = regime_data.get("description", "")

    # Build quadrant grid
    # Layout: top-left = Goldilocks, top-right = Reflation
    #         bottom-left = Deflation, bottom-right = Stagflation
    quadrants = [
        (MacroRegime.GOLDILOCKS, "top-left"),
        (MacroRegime.REFLATION, "top-right"),
        (MacroRegime.DEFLATION, "bottom-left"),
        (MacroRegime.STAGFLATION, "bottom-right"),
    ]

    cells_html = ""
    for regime_enum, position in quadrants:
        cfg = REGIME_CONFIG[regime_enum]
        is_current = regime_enum.value == current_regime
        bg = (
            f"rgba({_hex_to_rgb(cfg['color'])}, 0.25)"
            if is_current
            else "rgba(255,255,255,0.02)"
        )
        border = cfg["color"] if is_current else "rgba(255,255,255,0.07)"
        border_width = "2px" if is_current else "1px"
        glow = (
            f"0 0 20px rgba({_hex_to_rgb(cfg['color'])}, 0.3)"
            if is_current
            else "none"
        )
        label_opacity = "0.95" if is_current else "0.45"
        badge = (
            f'<div style="display:inline-block; background:{cfg["color"]}; color:#000; '
            f'font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px; '
            f'margin-top:6px; letter-spacing:0.5px;">CURRENT &bull; {confidence:.0f}%</div>'
            if is_current
            else ""
        )

        cells_html += (
            f'<div style="background:{bg}; border:{border_width} solid {border}; '
            f"border-radius:10px; padding:16px; box-shadow:{glow};\">"
            f'<div style="font-size:13px; font-weight:700; color:{cfg["color"]}; '
            f'opacity:{label_opacity};">{cfg["label"]}</div>'
            f'<div style="font-size:11px; color:rgba(255,255,255,0.52); margin-top:2px;">'
            f'{cfg["quadrant"]}</div>'
            f"{badge}"
            f"</div>"
        )

    # Axis labels
    st.markdown(
        f"""
        <div style="{CARD_STYLE} padding:24px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <div>
                    <div style="{LABEL_STYLE}">Macro Regime Classification</div>
                    <div style="font-size:20px; font-weight:700; color:{regime_color};">
                        {regime_label}
                    </div>
                    <div style="font-size:12px; color:rgba(255,255,255,0.52); margin-top:4px; max-width:500px;">
                        {description}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="{LABEL_STYLE}">Confidence</div>
                    <div style="font-size:28px; font-weight:700; color:{regime_color};">
                        {confidence:.0f}<span style="font-size:14px; color:rgba(255,255,255,0.4);">%</span>
                    </div>
                </div>
            </div>
            <div style="position:relative; margin-top:8px;">
                <div style="text-align:center; font-size:10px; color:rgba(255,255,255,0.35);
                            letter-spacing:1px; margin-bottom:6px;">
                    &#9650; INFLATION RISING
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    {cells_html}
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:6px;">
                    <div style="font-size:10px; color:rgba(255,255,255,0.35); letter-spacing:1px;">
                        &#9664; GROWTH DOWN
                    </div>
                    <div style="font-size:10px; color:rgba(255,255,255,0.35); letter-spacing:1px;">
                        GROWTH UP &#9654;
                    </div>
                </div>
                <div style="text-align:center; font-size:10px; color:rgba(255,255,255,0.35);
                            letter-spacing:1px; margin-top:4px;">
                    &#9660; INFLATION FALLING
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _hex_to_rgb(hex_color: str) -> str:
    """Convert '#10b981' -> '16,185,129'."""
    h = hex_color.lstrip("#")
    return ",".join(str(int(h[i : i + 2], 16)) for i in (0, 2, 4))


def _render_inflation_panel():
    """Inflation Trend Panel: CPI, Core CPI, PPI, PCE with MoM/YoY."""
    st.markdown(
        f'<div style="{LABEL_STYLE} font-size:13px; margin-bottom:12px;">Inflation Trend</div>',
        unsafe_allow_html=True,
    )

    inflation_data = None
    try:
        from services.fred_data import fred_service, SERIES_LABELS

        if fred_service.available:
            inflation_data = fred_service.get_inflation_dashboard()
    except Exception:
        pass

    if inflation_data and len(inflation_data) > 0:
        cols = st.columns(len(inflation_data))
        for idx, (key, info) in enumerate(inflation_data.items()):
            with cols[idx]:
                yoy = info.get("yoy", 0)
                mom = info.get("mom", 0)
                yoy_color = _direction_color(yoy)
                mom_color = _direction_color(mom)
                st.markdown(
                    f'<div style="{CARD_STYLE}">'
                    f'<div style="{LABEL_STYLE}">{info.get("label", key)}</div>'
                    f'<div style="font-size:22px; font-weight:600; color:rgba(255,255,255,0.92);">'
                    f'{info.get("latest", 0):,.1f}</div>'
                    f'<div style="font-size:12px; margin-top:6px;">'
                    f'<span style="color:{yoy_color};">{_arrow(yoy)} YoY {yoy:+.2f}%</span>'
                    f' &nbsp; '
                    f'<span style="color:{mom_color};">{_arrow(mom)} MoM {mom:+.2f}%</span>'
                    f"</div>"
                    f"</div>",
                    unsafe_allow_html=True,
                )
    else:
        # Fallback: yfinance proxies
        st.caption("FRED unavailable — showing yfinance proxies")
        try:
            import yfinance as yf

            proxies = {"TIP": "TIPS ETF", "VTIP": "Short TIPS", "RINF": "Inflation Exp."}
            cols = st.columns(len(proxies))
            for idx, (ticker, label) in enumerate(proxies.items()):
                with cols[idx]:
                    try:
                        hist = yf.Ticker(ticker).history(period="3mo")
                        if len(hist) > 0:
                            current = float(hist["Close"].iloc[-1])
                            ret = (
                                (current / float(hist["Close"].iloc[0]) - 1) * 100
                                if len(hist) > 1
                                else 0
                            )
                            st.markdown(
                                _glass_card(
                                    label,
                                    f"${current:,.2f}",
                                    f"{_arrow(ret)} {ret:+.2f}% (3M)",
                                    _direction_color(ret),
                                ),
                                unsafe_allow_html=True,
                            )
                        else:
                            st.markdown(
                                _glass_card(label, "N/A"), unsafe_allow_html=True
                            )
                    except Exception:
                        st.markdown(
                            _glass_card(label, "N/A"), unsafe_allow_html=True
                        )
        except Exception:
            st.warning("Inflation data unavailable.")


def _render_growth_panel():
    """Growth Momentum Panel: GDP, employment, retail sales, industrial production."""
    st.markdown(
        f'<div style="{LABEL_STYLE} font-size:13px; margin-bottom:12px;">Growth Momentum</div>',
        unsafe_allow_html=True,
    )

    growth_data = None
    try:
        from services.fred_data import fred_service

        if fred_service.available:
            growth_data = fred_service.get_growth_dashboard()
    except Exception:
        pass

    # Synthesize growth momentum score
    momentum_score = 0.0
    indicator_count = 0

    if growth_data and len(growth_data) > 0:
        display_keys = list(growth_data.keys())[:4]  # Show top 4
        cols = st.columns(len(display_keys) + 1)

        for idx, key in enumerate(display_keys):
            info = growth_data[key]
            change = info.get("change", 0)
            change_color = _direction_color(change)
            momentum_score += change
            indicator_count += 1

            with cols[idx]:
                st.markdown(
                    f'<div style="{CARD_STYLE}">'
                    f'<div style="{LABEL_STYLE}">{info.get("label", key)}</div>'
                    f'<div style="font-size:22px; font-weight:600; color:rgba(255,255,255,0.92);">'
                    f'{format_large_number(info.get("latest", 0), "")}</div>'
                    f'<div style="font-size:12px; margin-top:6px; color:{change_color};">'
                    f'{_arrow(change)} {change:+.2f}% chg</div>'
                    f"</div>",
                    unsafe_allow_html=True,
                )

        # Momentum score card
        avg_score = momentum_score / indicator_count if indicator_count > 0 else 0
        score_color = _direction_color(avg_score)
        with cols[-1]:
            st.markdown(
                _glass_card(
                    "Growth Score",
                    f"{avg_score:+.2f}",
                    "Accelerating" if avg_score > 0 else "Decelerating",
                    score_color,
                ),
                unsafe_allow_html=True,
            )
    else:
        # Fallback: yfinance growth proxies
        st.caption("FRED unavailable — showing market growth proxies")
        try:
            import yfinance as yf

            proxies = {
                "XLI": "Industrials",
                "XLY": "Cons. Disc.",
                "XLF": "Financials",
                "IYT": "Transport",
            }
            cols = st.columns(len(proxies) + 1)
            scores = []
            for idx, (ticker, label) in enumerate(proxies.items()):
                with cols[idx]:
                    try:
                        hist = yf.Ticker(ticker).history(period="3mo")
                        if len(hist) > 0:
                            current = float(hist["Close"].iloc[-1])
                            ret = (current / float(hist["Close"].iloc[0]) - 1) * 100
                            scores.append(ret)
                            st.markdown(
                                _glass_card(
                                    label,
                                    f"${current:,.2f}",
                                    f"{_arrow(ret)} {ret:+.2f}%",
                                    _direction_color(ret),
                                ),
                                unsafe_allow_html=True,
                            )
                        else:
                            st.markdown(
                                _glass_card(label, "N/A"), unsafe_allow_html=True
                            )
                    except Exception:
                        st.markdown(
                            _glass_card(label, "N/A"), unsafe_allow_html=True
                        )

            avg_score = np.mean(scores) if scores else 0
            with cols[-1]:
                st.markdown(
                    _glass_card(
                        "Growth Score",
                        f"{avg_score:+.1f}",
                        "Accelerating" if avg_score > 0 else "Decelerating",
                        _direction_color(avg_score),
                    ),
                    unsafe_allow_html=True,
                )
        except Exception:
            st.warning("Growth data unavailable.")


def _render_market_signals():
    """
    Market Signals Panel: 4 equal columns —
    Yield Curve | Credit Market | FX & Dollar | Commodity Complex
    """
    st.markdown(
        f'<div style="{LABEL_STYLE} font-size:13px; margin-bottom:12px;">Market Signals</div>',
        unsafe_allow_html=True,
    )

    col1, col2, col3, col4 = st.columns(4)

    # --- 1. Yield Curve ---
    with col1:
        st.markdown(
            f'<div style="{LABEL_STYLE}">Yield Curve</div>', unsafe_allow_html=True
        )
        try:
            curve = _fetch_yield_curve_data()
            if curve:
                # Tenor ordering
                tenor_order = ["3M", "2Y", "5Y", "10Y", "30Y"]
                x_vals = [t for t in tenor_order if t in curve]
                y_vals = [curve[t] for t in x_vals]

                fig = go.Figure()
                fig.add_trace(
                    go.Scatter(
                        x=x_vals,
                        y=y_vals,
                        mode="lines+markers",
                        line=dict(color=COLOR_PRIMARY, width=2),
                        marker=dict(size=7, color=COLOR_PRIMARY),
                        name="Yield Curve",
                    )
                )

                # 2s10s spread line
                if "2Y" in curve and "10Y" in curve:
                    spread = curve["10Y"] - curve["2Y"]
                    spread_color = COLOR_POSITIVE if spread > 0 else COLOR_NEGATIVE
                    fig.add_annotation(
                        text=f"2s10s: {spread:+.0f}bps",
                        xref="paper",
                        yref="paper",
                        x=0.95,
                        y=0.95,
                        showarrow=False,
                        font=dict(size=11, color=spread_color),
                    )

                # Recession threshold
                fig.add_hline(
                    y=0,
                    line_dash="dot",
                    line_color="rgba(239,68,68,0.3)",
                    annotation_text="Inversion",
                    annotation_font_color="rgba(239,68,68,0.5)",
                    annotation_font_size=9,
                )

                fig.update_layout(
                    showlegend=False,
                    yaxis_title="Yield (%)",
                )
                _apply_atlas_theme(fig, height=250)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.caption("Yield curve data unavailable")
        except Exception as e:
            st.caption(f"Yield curve error: {e}")

    # --- 2. Credit Market ---
    with col2:
        st.markdown(
            f'<div style="{LABEL_STYLE}">Credit Market</div>', unsafe_allow_html=True
        )
        try:
            credit = _fetch_credit_data()
            if credit:
                # If FRED spreads are available, use them
                fred_data = credit.get("fred", {})
                if fred_data:
                    labels = []
                    current_vals = []
                    avg_vals = []
                    for key in ["ig_spread", "hy_spread"]:
                        if key in fred_data:
                            info = fred_data[key]
                            labels.append(info.get("label", key))
                            current_vals.append(info["latest"])
                            avg_vals.append(info["avg_1y"])

                    if labels:
                        fig = go.Figure()
                        fig.add_trace(
                            go.Bar(
                                x=labels,
                                y=current_vals,
                                name="Current",
                                marker_color=COLOR_PRIMARY,
                            )
                        )
                        fig.add_trace(
                            go.Bar(
                                x=labels,
                                y=avg_vals,
                                name="1Y Avg",
                                marker_color="rgba(255,255,255,0.15)",
                            )
                        )
                        fig.update_layout(
                            barmode="group",
                            yaxis_title="Spread (bps)",
                            showlegend=True,
                            legend=dict(
                                orientation="h",
                                yanchor="bottom",
                                y=1.02,
                                xanchor="right",
                                x=1,
                                font=dict(size=9),
                            ),
                        )
                        _apply_atlas_theme(fig, height=250)
                        st.plotly_chart(fig, use_container_width=True)
                    else:
                        _render_credit_etf_fallback(credit)
                else:
                    _render_credit_etf_fallback(credit)
            else:
                st.caption("Credit data unavailable")
        except Exception as e:
            st.caption(f"Credit error: {e}")

    # --- 3. FX & Dollar ---
    with col3:
        st.markdown(
            f'<div style="{LABEL_STYLE}">FX & Dollar</div>', unsafe_allow_html=True
        )
        try:
            fx = _fetch_fx_dollar()
            if fx:
                dxy_val = fx["current"]
                ma200 = fx["ma200"]
                vs_ma = fx["vs_ma200"]
                trend = fx["trend"]
                trend_color = COLOR_POSITIVE if "Above" in trend else COLOR_NEGATIVE

                st.markdown(
                    _glass_card(
                        "DXY",
                        f"{dxy_val:.2f}",
                        f"{trend} ({vs_ma:+.2f}%)",
                        trend_color,
                    ),
                    unsafe_allow_html=True,
                )

                # Mini DXY chart
                if "series" in fx and fx["series"] is not None and len(fx["series"]) > 0:
                    series = fx["series"]
                    fig = go.Figure()
                    fig.add_trace(
                        go.Scatter(
                            x=series.index,
                            y=series.values,
                            mode="lines",
                            line=dict(color=COLOR_PRIMARY, width=1.5),
                            name="DXY",
                        )
                    )
                    fig.add_hline(
                        y=ma200,
                        line_dash="dash",
                        line_color=COLOR_TRANSITION,
                        annotation_text="200d MA",
                        annotation_font_size=9,
                        annotation_font_color=COLOR_TRANSITION,
                    )
                    fig.update_layout(showlegend=False)
                    _apply_atlas_theme(fig, height=160)
                    st.plotly_chart(fig, use_container_width=True)
            else:
                st.caption("DXY data unavailable")
        except Exception as e:
            st.caption(f"FX error: {e}")

    # --- 4. Commodity Complex ---
    with col4:
        st.markdown(
            f'<div style="{LABEL_STYLE}">Commodity Complex</div>',
            unsafe_allow_html=True,
        )
        try:
            commodities = _fetch_commodity_data()
            if commodities:
                for name, info in commodities.items():
                    ret_1m = info.get("ret_1m", 0)
                    ret_color = _direction_color(ret_1m)
                    st.markdown(
                        f'<div style="{CARD_STYLE} padding:12px;">'
                        f'<div style="display:flex; justify-content:space-between; align-items:center;">'
                        f'<div>'
                        f'<div style="font-size:11px; color:rgba(255,255,255,0.52);">{name}</div>'
                        f'<div style="font-size:16px; font-weight:600; color:rgba(255,255,255,0.92);">'
                        f'${info["current"]:,.2f}</div>'
                        f'</div>'
                        f'<div style="text-align:right;">'
                        f'<div style="font-size:12px; color:{ret_color};">'
                        f'{_arrow(ret_1m)} {ret_1m:+.1f}%</div>'
                        f'<div style="font-size:10px; color:rgba(255,255,255,0.35);">1M</div>'
                        f'</div>'
                        f'</div>'
                        f'</div>',
                        unsafe_allow_html=True,
                    )
            else:
                st.caption("Commodity data unavailable")
        except Exception as e:
            st.caption(f"Commodity error: {e}")


def _render_credit_etf_fallback(credit: dict):
    """Show HYG/LQD ETF-based credit view when FRED spreads are unavailable."""
    labels = []
    vs_avgs = []
    colors = []
    for key in ["HYG", "LQD"]:
        if key in credit:
            labels.append(key)
            val = credit[key]["vs_avg"]
            vs_avgs.append(val)
            colors.append(COLOR_POSITIVE if val > 0 else COLOR_NEGATIVE)

    if labels:
        fig = go.Figure()
        fig.add_trace(
            go.Bar(
                x=labels,
                y=vs_avgs,
                marker_color=colors,
                text=[f"{v:+.2f}%" for v in vs_avgs],
                textposition="outside",
                textfont=dict(size=10, color="rgba(255,255,255,0.7)"),
            )
        )
        fig.update_layout(
            yaxis_title="vs 1Y Avg (%)",
            showlegend=False,
        )
        _apply_atlas_theme(fig, height=250)
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.caption("Credit ETF data unavailable")


def _render_cross_asset_heatmap():
    """Cross-Asset Heatmap: 1W/1M/3M/YTD returns with RdYlGn color scale."""
    st.markdown(
        f'<div style="{LABEL_STYLE} font-size:13px; margin-bottom:12px;">Cross-Asset Returns Heatmap</div>',
        unsafe_allow_html=True,
    )

    try:
        df = _fetch_cross_asset_returns()
        if df.empty:
            st.warning("Cross-asset data unavailable.")
            return

        period_cols = ["1W", "1M", "3M", "YTD"]
        available_periods = [c for c in period_cols if c in df.columns]
        if not available_periods:
            st.warning("No return periods available.")
            return

        # Build heatmap matrix
        z_data = df[available_periods].values
        y_labels = df["Name"].tolist()

        # Custom text for annotations
        text_data = []
        for row in z_data:
            text_row = []
            for val in row:
                if np.isnan(val):
                    text_row.append("")
                else:
                    text_row.append(f"{val:+.1f}%")
            text_data.append(text_row)

        fig = go.Figure(
            data=go.Heatmap(
                z=z_data,
                x=available_periods,
                y=y_labels,
                text=text_data,
                texttemplate="%{text}",
                textfont=dict(size=11, color="rgba(255,255,255,0.85)"),
                colorscale="RdYlGn",
                zmid=0,
                colorbar=dict(
                    title="Return %",
                    titlefont=dict(size=10, color="rgba(255,255,255,0.52)"),
                    tickfont=dict(size=9, color="rgba(255,255,255,0.52)"),
                    thickness=12,
                    len=0.8,
                ),
                hovertemplate="<b>%{y}</b><br>%{x}: %{z:.2f}%<extra></extra>",
            )
        )

        fig.update_layout(
            yaxis=dict(autorange="reversed"),
            xaxis=dict(side="top"),
        )
        _apply_atlas_theme(fig, height=max(300, len(y_labels) * 38))
        st.plotly_chart(fig, use_container_width=True)
    except Exception as e:
        st.warning(f"Heatmap error: {e}")


def _render_factor_returns(regime_data: dict):
    """Factor Returns Panel: Which factors are working in the current regime."""
    st.markdown(
        f'<div style="{LABEL_STYLE} font-size:13px; margin-bottom:12px;">Factor Performance</div>',
        unsafe_allow_html=True,
    )

    try:
        from services.factor_model import FACTOR_LABELS, FACTOR_COLORS

        factor_perf = _fetch_factor_returns()
        if not factor_perf:
            st.caption("Factor return data unavailable.")
            return

        # Get regime factor tilts
        factor_tilts = regime_data.get("factor_tilts", {})

        factors = []
        returns = []
        colors = []
        tilt_annotations = []

        for factor_key, ret in factor_perf.items():
            label = FACTOR_LABELS.get(factor_key, factor_key)
            color = FACTOR_COLORS.get(factor_key, COLOR_PRIMARY)
            tilt = factor_tilts.get(factor_key, 1.0)

            factors.append(label)
            returns.append(ret)
            colors.append(color)
            if tilt >= 1.1:
                tilt_annotations.append("OW")
            elif tilt <= 0.8:
                tilt_annotations.append("UW")
            else:
                tilt_annotations.append("")

        fig = go.Figure()
        fig.add_trace(
            go.Bar(
                x=factors,
                y=returns,
                marker_color=colors,
                text=[f"{r:+.1f}%" for r in returns],
                textposition="outside",
                textfont=dict(size=10, color="rgba(255,255,255,0.7)"),
            )
        )

        # Add tilt annotations below bars
        for i, (factor, tilt_label) in enumerate(zip(factors, tilt_annotations)):
            if tilt_label:
                fig.add_annotation(
                    x=factor,
                    y=min(returns) - abs(min(returns)) * 0.15 if min(returns) < 0 else -2,
                    text=tilt_label,
                    showarrow=False,
                    font=dict(
                        size=9,
                        color=COLOR_POSITIVE if tilt_label == "OW" else COLOR_NEGATIVE,
                    ),
                )

        fig.update_layout(
            yaxis_title="3M Return (%)",
            showlegend=False,
            xaxis=dict(tickangle=-30),
        )
        _apply_atlas_theme(fig, height=320)
        st.plotly_chart(fig, use_container_width=True)

        # Regime tilt summary
        regime_label = regime_data.get("label", "Unknown")
        st.caption(
            f"OW = Overweight, UW = Underweight in **{regime_label}** regime. "
            f"Based on historical factor-regime sensitivity."
        )
    except Exception as e:
        st.caption(f"Factor data error: {e}")


def _render_liquidity_panel():
    """
    Liquidity Conditions Panel: M2 growth trend, central bank balance sheet direction,
    credit impulse, and an overall liquidity regime classification.

    The liquidity cycle typically leads risk asset returns by 6-12 months,
    making this a critical forward-looking indicator for portfolio positioning.
    """
    st.markdown(
        f'<div style="{LABEL_STYLE} font-size:13px; margin-bottom:12px;">Liquidity Conditions</div>',
        unsafe_allow_html=True,
    )

    # Try FRED for M2 and monetary data
    fred_liquidity = None
    try:
        from services.fred_data import fred_service
        if fred_service.available:
            fred_liquidity = fred_service.get_liquidity_dashboard()
    except Exception:
        pass

    if fred_liquidity:
        cols = st.columns(len(fred_liquidity))
        for idx, (key, info) in enumerate(fred_liquidity.items()):
            with cols[idx]:
                change = info.get("yoy", info.get("change", 0)) or 0
                change_color = _direction_color(change)
                st.markdown(
                    f'<div style="{CARD_STYLE}">'
                    f'<div style="{LABEL_STYLE}">{info.get("label", key)}</div>'
                    f'<div style="font-size:22px; font-weight:600; color:rgba(255,255,255,0.92);">'
                    f'{info.get("latest", "N/A")}</div>'
                    f'<div style="font-size:12px; margin-top:6px; color:{change_color};">'
                    f'{_arrow(change)} {change:+.2f}% YoY</div>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
    else:
        # Market-based liquidity proxies when FRED unavailable
        st.caption("FRED unavailable — showing market-based liquidity proxies")
        try:
            import yfinance as yf
            import pandas as pd

            # Liquidity proxies:
            # BIL  = 1-3 Month T-Bill (risk-free rate — tight = expensive)
            # LQD  = IG Credit (spread as proxy for credit availability)
            # TLT  = Long duration (loose financial conditions = TLT stable or rising)
            # HYG  = High Yield (loose conditions = HYG performing well)
            proxies = {
                "TLT": ("Long Duration (TLT)", "Duration proxy — rising = easing"),
                "HYG": ("High Yield (HYG)", "Credit availability proxy"),
                "LQD": ("IG Credit (LQD)", "Investment-grade credit proxy"),
                "BIL": ("T-Bills (BIL)", "Short-end risk-free rate"),
            }

            liq_cols = st.columns(len(proxies))
            liq_scores = []

            for idx, (ticker, (label, tooltip)) in enumerate(proxies.items()):
                with liq_cols[idx]:
                    try:
                        hist = yf.Ticker(ticker).history(period="3mo")
                        if len(hist) > 10:
                            current = float(hist["Close"].iloc[-1])
                            start = float(hist["Close"].iloc[0])
                            ret_3m = (current / start - 1) * 100
                            liq_scores.append(ret_3m)
                            ret_color = _direction_color(ret_3m)
                            st.markdown(
                                f'<div style="{CARD_STYLE} padding:14px;">'
                                f'<div style="{LABEL_STYLE}">{label}</div>'
                                f'<div style="font-size:18px; font-weight:600; color:rgba(255,255,255,0.9);">'
                                f'${current:,.2f}</div>'
                                f'<div style="font-size:11px; margin-top:4px; color:{ret_color};">'
                                f'{_arrow(ret_3m)} {ret_3m:+.1f}% (3M)</div>'
                                f'<div style="font-size:10px; color:rgba(255,255,255,0.3); margin-top:2px;">'
                                f'{tooltip}</div>'
                                f'</div>',
                                unsafe_allow_html=True,
                            )
                        else:
                            st.markdown(_glass_card(label, "N/A"), unsafe_allow_html=True)
                    except Exception:
                        st.markdown(_glass_card(label, "N/A"), unsafe_allow_html=True)

            # Liquidity impulse summary
            if liq_scores:
                avg_liq = sum(liq_scores) / len(liq_scores)
                liq_regime = (
                    "Loosening" if avg_liq > 1 else
                    "Tightening" if avg_liq < -1 else
                    "Neutral"
                )
                liq_color = (
                    COLOR_POSITIVE if liq_regime == "Loosening" else
                    COLOR_NEGATIVE if liq_regime == "Tightening" else
                    COLOR_NEUTRAL
                )
                st.markdown(
                    f'<div style="{CARD_STYLE} padding:16px; margin-top:8px;">'
                    f'<div style="{LABEL_STYLE}">Liquidity Impulse (Market-Based)</div>'
                    f'<div style="font-size:20px; font-weight:700; color:{liq_color};">'
                    f'{liq_regime}</div>'
                    f'<div style="font-size:11px; color:rgba(255,255,255,0.45); margin-top:4px;">'
                    f'Average 3M return across liquidity proxies: {avg_liq:+.1f}%. '
                    f'Loosening conditions typically lead risk assets by 2-4 quarters.</div>'
                    f'</div>',
                    unsafe_allow_html=True,
                )

        except Exception as e:
            st.warning(f"Liquidity proxy data unavailable: {e}")


def _render_financial_conditions():
    """Financial Conditions: VIX level, term structure, dollar, overall assessment."""
    st.markdown(
        f'<div style="{LABEL_STYLE} font-size:13px; margin-bottom:12px;">Financial Conditions</div>',
        unsafe_allow_html=True,
    )

    col1, col2, col3 = st.columns(3)

    # --- VIX ---
    with col1:
        try:
            vix_data = _fetch_vix_data()
            if "VIX" in vix_data:
                vix_current = vix_data["VIX"]["current"]
                vix_avg = vix_data["VIX"]["avg_3m"]

                # VIX level interpretation
                if vix_current < 15:
                    vix_label = "Low / Complacent"
                    vix_color = COLOR_POSITIVE
                elif vix_current < 20:
                    vix_label = "Normal"
                    vix_color = COLOR_NEUTRAL
                elif vix_current < 30:
                    vix_label = "Elevated"
                    vix_color = COLOR_TRANSITION
                else:
                    vix_label = "High / Panic"
                    vix_color = COLOR_NEGATIVE

                st.markdown(
                    _glass_card(
                        "VIX",
                        f"{vix_current:.1f}",
                        f"{vix_label} (avg: {vix_avg:.1f})",
                        vix_color,
                    ),
                    unsafe_allow_html=True,
                )

                # Term structure
                if "term_structure" in vix_data:
                    ts = vix_data["term_structure"]
                    ts_color = COLOR_POSITIVE if ts["contango"] else COLOR_NEGATIVE
                    st.markdown(
                        _glass_card(
                            "VIX Term Structure",
                            f"{ts['ratio']:.3f}",
                            ts["label"],
                            ts_color,
                        ),
                        unsafe_allow_html=True,
                    )
            else:
                st.markdown(
                    _glass_card("VIX", "N/A", "Data unavailable"),
                    unsafe_allow_html=True,
                )
        except Exception:
            st.markdown(
                _glass_card("VIX", "N/A", "Error"), unsafe_allow_html=True
            )

    # --- Dollar Strength ---
    with col2:
        try:
            fx = _fetch_fx_dollar()
            if fx:
                dxy = fx["current"]
                vs_ma = fx["vs_ma200"]
                trend = fx["trend"]
                trend_color = COLOR_POSITIVE if "Above" in trend else COLOR_NEGATIVE
                st.markdown(
                    _glass_card(
                        "Dollar Strength (DXY)",
                        f"{dxy:.2f}",
                        f"{trend} ({vs_ma:+.2f}% vs 200d MA)",
                        trend_color,
                    ),
                    unsafe_allow_html=True,
                )
            else:
                st.markdown(
                    _glass_card("Dollar (DXY)", "N/A", "Data unavailable"),
                    unsafe_allow_html=True,
                )
        except Exception:
            st.markdown(
                _glass_card("Dollar (DXY)", "N/A", "Error"),
                unsafe_allow_html=True,
            )

    # --- Overall Conditions ---
    with col3:
        try:
            from services.macro_regime import regime_engine

            fci = regime_engine.calculate_financial_conditions()
            fci_score = fci.get("fci_score", 0)
            fci_label = fci.get("fci_label", "N/A")

            if fci_label == "Tight":
                fci_color = COLOR_NEGATIVE
            elif fci_label == "Loose":
                fci_color = COLOR_POSITIVE
            else:
                fci_color = COLOR_TRANSITION

            st.markdown(
                _glass_card(
                    "Financial Conditions",
                    fci_label,
                    f"FCI Score: {fci_score:+.2f}",
                    fci_color,
                ),
                unsafe_allow_html=True,
            )

            # Component breakdown
            components = fci.get("components", {})
            if components:
                breakdown_parts = []
                if "equity_vol" in components:
                    ev = components["equity_vol"]
                    breakdown_parts.append(
                        f"Equity Vol: {ev.get('signal', 'N/A').title()} (z={ev.get('z_score', 0):+.1f})"
                    )
                if "dollar" in components:
                    dl = components["dollar"]
                    breakdown_parts.append(
                        f"Dollar: {dl.get('signal', 'N/A').title()}"
                    )
                if breakdown_parts:
                    st.caption(" | ".join(breakdown_parts))
        except Exception:
            st.markdown(
                _glass_card("Financial Conditions", "N/A", "Error"),
                unsafe_allow_html=True,
            )


def _render_portfolio_impact(regime_data: dict):
    """Portfolio Impact Layer: toggleable expander showing regime impact on holdings."""
    with st.expander("Portfolio Impact Analysis", expanded=False):
        portfolio = st.session_state.get("portfolio_data") or st.session_state.get(
            "portfolio"
        )

        if portfolio is None:
            st.info(
                "No portfolio loaded. Upload or connect your portfolio to see regime-specific impact analysis."
            )
            return

        try:
            from services.macro_regime import regime_engine

            # Build holdings dict from portfolio
            if isinstance(portfolio, pd.DataFrame):
                if "Ticker" in portfolio.columns and "Weight" in portfolio.columns:
                    holdings = {}
                    for _, row in portfolio.iterrows():
                        ticker = row.get("Ticker", row.get("ticker", ""))
                        weight = row.get("Weight", row.get("weight", 0))
                        sector = row.get("Sector", row.get("sector", "Unknown"))
                        if ticker:
                            holdings[ticker] = {"weight": weight, "sector": sector}
                elif "ticker" in portfolio.columns:
                    holdings = {}
                    for _, row in portfolio.iterrows():
                        ticker = row.get("ticker", "")
                        weight = row.get("weight", row.get("Weight", 0))
                        sector = row.get("sector", row.get("Sector", "Unknown"))
                        if ticker:
                            holdings[ticker] = {"weight": weight, "sector": sector}
                else:
                    st.warning("Portfolio format not recognized. Expected Ticker/Weight columns.")
                    return
            elif isinstance(portfolio, dict):
                holdings = portfolio
            else:
                st.warning("Portfolio format not recognized.")
                return

            if not holdings:
                st.info("Portfolio appears empty.")
                return

            impact = regime_engine.get_portfolio_impact(regime_data, holdings)

            col_w, col_l = st.columns(2)

            # Winners
            with col_w:
                st.markdown(
                    f'<div style="{LABEL_STYLE} color:{COLOR_POSITIVE};">Regime Winners</div>',
                    unsafe_allow_html=True,
                )
                winners = impact.get("winners", [])
                if winners:
                    for w in winners:
                        st.markdown(
                            f'<div style="font-size:13px; color:rgba(255,255,255,0.85); '
                            f'padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">'
                            f'<strong>{w["ticker"]}</strong> ({w["sector"]}) — '
                            f'sensitivity {w["sensitivity"]:.2f}x</div>',
                            unsafe_allow_html=True,
                        )
                else:
                    st.caption("No clear winners identified.")

            # Losers
            with col_l:
                st.markdown(
                    f'<div style="{LABEL_STYLE} color:{COLOR_NEGATIVE};">Regime Losers</div>',
                    unsafe_allow_html=True,
                )
                losers = impact.get("losers", [])
                if losers:
                    for l_item in losers:
                        st.markdown(
                            f'<div style="font-size:13px; color:rgba(255,255,255,0.85); '
                            f'padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">'
                            f'<strong>{l_item["ticker"]}</strong> ({l_item["sector"]}) — '
                            f'sensitivity {l_item["sensitivity"]:.2f}x</div>',
                            unsafe_allow_html=True,
                        )
                else:
                    st.caption("No clear losers identified.")

            # Factor tilts
            st.markdown(
                f'<div style="{LABEL_STYLE} margin-top:16px;">Recommended Factor Tilts</div>',
                unsafe_allow_html=True,
            )
            tilts = impact.get("factor_tilts", {})
            if tilts:
                tilt_cols = st.columns(len(tilts))
                for idx, (factor, tilt_val) in enumerate(tilts.items()):
                    with tilt_cols[idx]:
                        tilt_color = (
                            COLOR_POSITIVE
                            if tilt_val >= 1.1
                            else (COLOR_NEGATIVE if tilt_val <= 0.8 else COLOR_NEUTRAL)
                        )
                        tilt_label = (
                            "OW"
                            if tilt_val >= 1.1
                            else ("UW" if tilt_val <= 0.8 else "Neutral")
                        )
                        st.markdown(
                            f'<div style="{CARD_STYLE} padding:10px; text-align:center;">'
                            f'<div style="font-size:10px; color:rgba(255,255,255,0.45); '
                            f'text-transform:uppercase;">{factor}</div>'
                            f'<div style="font-size:18px; font-weight:600; color:{tilt_color};">'
                            f'{tilt_val:.2f}x</div>'
                            f'<div style="font-size:10px; color:{tilt_color};">{tilt_label}</div>'
                            f"</div>",
                            unsafe_allow_html=True,
                        )

            # Concentration alerts
            alerts = impact.get("concentration_alerts", [])
            if alerts:
                st.markdown(
                    f'<div style="{LABEL_STYLE} margin-top:16px; color:{COLOR_TRANSITION};">'
                    f"Concentration Alerts</div>",
                    unsafe_allow_html=True,
                )
                for alert in alerts:
                    st.warning(alert)

        except Exception as e:
            st.warning(f"Portfolio impact analysis error: {e}")


def _render_scenario_builder(regime_data: dict):
    """Scenario Builder: sidebar/expander for predefined macro scenarios."""
    with st.expander("Scenario Builder", expanded=False):
        st.markdown(
            f'<div style="{LABEL_STYLE}">Select a predefined macro scenario to see estimated regime shift</div>',
            unsafe_allow_html=True,
        )

        selected = st.selectbox(
            "Scenario",
            list(SCENARIOS.keys()),
            key="macro_scenario_select",
            label_visibility="collapsed",
        )

        if selected:
            scenario = SCENARIOS[selected]

            st.markdown(
                f'<div style="{CARD_STYLE}">'
                f'<div style="font-size:15px; font-weight:600; color:rgba(255,255,255,0.92); '
                f'margin-bottom:8px;">{selected}</div>'
                f'<div style="font-size:12px; color:rgba(255,255,255,0.65); line-height:1.6;">'
                f'{scenario["description"]}</div>'
                f"</div>",
                unsafe_allow_html=True,
            )

            # Simulate the regime shift
            try:
                from services.macro_regime import regime_engine, REGIME_CONFIG

                current_growth = regime_data.get("growth_signal", 0)
                current_inflation = regime_data.get("inflation_signal", 0)

                new_growth = current_growth + scenario["growth_shift"]
                new_inflation = current_inflation + scenario["inflation_shift"]

                simulated = regime_engine.classify_regime(new_growth, new_inflation)

                current_label = regime_data.get("label", "Unknown")
                new_label = simulated.get("label", "Unknown")
                new_color = simulated.get("color", COLOR_PRIMARY)

                changed = current_label != new_label

                col_from, col_arrow, col_to = st.columns([2, 1, 2])
                with col_from:
                    st.markdown(
                        _glass_card(
                            "Current Regime",
                            current_label,
                            "",
                            regime_data.get("color", COLOR_PRIMARY),
                        ),
                        unsafe_allow_html=True,
                    )
                with col_arrow:
                    st.markdown(
                        f'<div style="text-align:center; padding-top:30px; font-size:24px; '
                        f'color:{COLOR_TRANSITION if changed else COLOR_NEUTRAL};">'
                        f'{"&#10132;" if changed else "&#8644;"}</div>',
                        unsafe_allow_html=True,
                    )
                with col_to:
                    st.markdown(
                        _glass_card(
                            "Scenario Regime",
                            new_label,
                            f"Confidence: {simulated.get('confidence', 0):.0f}%",
                            new_color,
                        ),
                        unsafe_allow_html=True,
                    )

                if changed:
                    st.markdown(
                        f'<div style="font-size:12px; color:{COLOR_TRANSITION}; margin-top:8px;">'
                        f"Regime transition expected: asset allocation review recommended.</div>",
                        unsafe_allow_html=True,
                    )

                # Show new asset implications
                asset_imp = simulated.get("asset_implications", {})
                if asset_imp:
                    st.markdown(
                        f'<div style="{LABEL_STYLE} margin-top:12px;">Asset Class Implications ({new_label})</div>',
                        unsafe_allow_html=True,
                    )
                    for asset, outlook in asset_imp.items():
                        st.markdown(
                            f'<div style="font-size:12px; color:rgba(255,255,255,0.7); padding:3px 0;">'
                            f"<strong>{asset.title()}:</strong> {outlook}</div>",
                            unsafe_allow_html=True,
                        )

            except Exception as e:
                st.caption(f"Scenario simulation error: {e}")


# =============================================================================
# MAIN RENDER FUNCTION
# =============================================================================


def render_macro_intelligence():
    """Render the Macro Intelligence page."""
    try:
        _render_macro_intelligence_inner()
    except Exception as _err:
        import traceback as _tb
        st.error(f"**Macro Intelligence — Unexpected Error:** `{type(_err).__name__}: {_err}`")
        with st.expander("Full traceback (share with developer)", expanded=True):
            st.code(_tb.format_exc())


def _render_macro_intelligence_inner():
    """
    ATLAS Terminal v11.0 - Macro Intelligence Dashboard (Module 2).
    Newspaper front-page layout: regime classification -> inflation/growth/liquidity ->
    market signals -> cross-asset heatmap -> factor returns -> financial conditions ->
    portfolio impact -> scenario builder.
    """

    # --- Page Header ---
    st.markdown(
        '<h1 style="font-size: 2.2rem; font-weight: 800; color: rgba(255,255,255,0.92); '
        'margin-bottom: 0;">'
        '<span style="background: linear-gradient(135deg, #818cf8, #6366f1, #8b5cf6); '
        '-webkit-background-clip: text; -webkit-text-fill-color: transparent;">'
        "MACRO INTELLIGENCE</span></h1>",
        unsafe_allow_html=True,
    )
    st.markdown(
        '<div style="font-size: 13px; color: rgba(255,255,255,0.45); margin-bottom: 20px;">'
        "Regime classification, inflation/growth monitoring, cross-asset signals, "
        "and portfolio impact analysis"
        "</div>",
        unsafe_allow_html=True,
    )

    # =========================================================================
    # TOP STRIP: Regime Classification (most prominent)
    # =========================================================================
    regime_data = {}
    try:
        from services.macro_regime import regime_engine

        with st.spinner("Classifying macro regime from market data..."):
            regime_data = regime_engine.classify_from_market_data()
    except Exception as e:
        st.warning(f"Regime classification error: {e}")
        # Fallback defaults
        regime_data = {
            "regime": "goldilocks",
            "label": "Goldilocks",
            "quadrant": "Growth Up / Inflation Down",
            "color": COLOR_POSITIVE,
            "description": "Default — classification engine unavailable.",
            "confidence": 0,
            "growth_signal": 0,
            "inflation_signal": 0,
            "factor_tilts": {},
            "asset_implications": {},
        }

    _render_regime_quadrant(regime_data)

    # =========================================================================
    # THREE HORIZONTAL BANDS: Inflation | Growth | Liquidity
    # =========================================================================
    st.markdown("---")

    tab_inf, tab_growth, tab_liq, tab_fci = st.tabs(
        ["Inflation Trend", "Growth Momentum", "Liquidity Conditions", "Financial Conditions"]
    )

    with tab_inf:
        _render_inflation_panel()

    with tab_growth:
        _render_growth_panel()

    with tab_liq:
        _render_liquidity_panel()

    with tab_fci:
        _render_financial_conditions()

    # =========================================================================
    # MIDDLE: Market Signals (4 equal panels)
    # =========================================================================
    st.markdown("---")
    _render_market_signals()

    # =========================================================================
    # BOTTOM: Cross-Asset Heatmap + Factor Returns
    # =========================================================================
    st.markdown("---")

    heatmap_col, factor_col = st.columns([3, 2])

    with heatmap_col:
        _render_cross_asset_heatmap()

    with factor_col:
        _render_factor_returns(regime_data)

    # =========================================================================
    # PORTFOLIO IMPACT (toggleable)
    # =========================================================================
    st.markdown("---")
    _render_portfolio_impact(regime_data)

    # =========================================================================
    # SCENARIO BUILDER
    # =========================================================================
    _render_scenario_builder(regime_data)

    # =========================================================================
    # FOOTER TIMESTAMP
    # =========================================================================
    st.markdown("---")
    st.caption(
        f"Last refreshed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | "
        f"Data cached for 1 hour | ATLAS Terminal v11.0"
    )
