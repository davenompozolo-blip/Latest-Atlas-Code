"""
ATLAS Terminal v11.0 - Fund & Manager Research Dashboard (Module 3)
===================================================================
Due-diligence dossier for fund/ETF evaluation: rolling performance,
drawdown analysis, risk metrics, holdings breakdown, manager skill
analytics, and the flagship Allocator Decision Engine.
"""

import pandas as pd
import numpy as np
import streamlit as st
import plotly.graph_objects as go
import plotly.express as px
from app.config import COLORS
from utils.formatting import (
    format_currency,
    format_percentage,
    format_large_number,
    add_arrow_indicator,
)


# =============================================================================
# CONSTANTS & HELPERS
# =============================================================================

_GREEN = "#10b981"
_RED = "#ef4444"
_AMBER = "#f59e0b"
_TEAL = "#14b8a6"
_PRIMARY = "#6366f1"
_PURPLE = "#8b5cf6"

BENCHMARKS = ["SPY", "QQQ", "AGG", "IWM", "EFA", "VTI", "DIA", "TLT", "HYG", "GLD"]

STRATEGY_CLASSIFICATIONS = {
    "asset_class": ["Equity", "Fixed Income", "Multi-Asset", "Alternatives", "Commodities", "Real Estate"],
    "style": ["Growth", "Value", "Blend", "Income", "Momentum", "Quality"],
    "cap_bias": ["Large Cap", "Mid Cap", "Small Cap", "All Cap", "Mega Cap"],
}


def _apply_chart_theme(fig: go.Figure, height: int = 400) -> go.Figure:
    """Apply the ATLAS glassmorphic chart theme to a Plotly figure."""
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
            zerolinecolor="rgba(255,255,255,0.07)",
            tickfont=dict(size=10),
        ),
        yaxis=dict(
            gridcolor="rgba(255,255,255,0.05)",
            linecolor="rgba(255,255,255,0.07)",
            zerolinecolor="rgba(255,255,255,0.07)",
            tickfont=dict(size=10),
        ),
        legend=dict(
            bgcolor="rgba(255,255,255,0.04)",
            bordercolor="rgba(255,255,255,0.07)",
            borderwidth=1,
        ),
        margin=dict(l=40, r=20, t=40, b=40),
        height=height,
    )
    return fig


def _glass_card(label: str, value: str, sublabel: str = "", color: str = "rgba(255,255,255,0.92)") -> str:
    """Return HTML for a glassmorphic metric card."""
    sub_html = ""
    if sublabel:
        sub_html = (
            f'<div style="font-size: 11px; color: rgba(255,255,255,0.38); '
            f'margin-top: 6px;">{sublabel}</div>'
        )
    return (
        f'<div style="background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); '
        f'border-radius: 12px; padding: 20px; margin-bottom: 16px;">'
        f'<div style="font-size: 11px; color: rgba(255,255,255,0.52); text-transform: uppercase; '
        f'letter-spacing: 1px; margin-bottom: 8px;">{label}</div>'
        f'<div style="font-size: 24px; font-weight: 600; color: {color};">{value}</div>'
        f'{sub_html}</div>'
    )


def _metric_mini(label: str, value: str, color: str = "rgba(255,255,255,0.92)") -> str:
    """Compact metric for inline use."""
    return (
        f'<div style="background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); '
        f'border-radius: 8px; padding: 12px 14px; text-align: center;">'
        f'<div style="font-size: 10px; color: rgba(255,255,255,0.42); text-transform: uppercase; '
        f'letter-spacing: 0.8px; margin-bottom: 4px;">{label}</div>'
        f'<div style="font-size: 18px; font-weight: 600; color: {color};">{value}</div></div>'
    )


def _color_for_value(val: float, neutral: float = 0.0) -> str:
    """Return green/red based on value vs a neutral threshold."""
    return _GREEN if val >= neutral else _RED


def _gauge_bar(score: float, label: str, max_val: float = 100.0,
               low_color: str = _GREEN, high_color: str = _RED) -> str:
    """Render a horizontal gauge / progress bar with color gradient."""
    pct = max(0, min(100, score / max_val * 100))
    # Blend color: low is good (green), high is bad (red) -- or vice-versa
    if pct < 40:
        bar_color = low_color
    elif pct < 70:
        bar_color = _AMBER
    else:
        bar_color = high_color
    return (
        f'<div style="margin-bottom: 12px;">'
        f'<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">'
        f'<span style="font-size: 11px; color: rgba(255,255,255,0.52); text-transform: uppercase; '
        f'letter-spacing: 0.8px;">{label}</span>'
        f'<span style="font-size: 13px; font-weight: 600; color: {bar_color};">{score:.0f}</span></div>'
        f'<div style="background: rgba(255,255,255,0.06); border-radius: 6px; height: 8px; overflow: hidden;">'
        f'<div style="width: {pct:.1f}%; height: 100%; background: {bar_color}; '
        f'border-radius: 6px; transition: width 0.4s ease;"></div></div></div>'
    )


# =============================================================================
# DATA FETCHING (cached)
# =============================================================================

@st.cache_data(ttl=7200, show_spinner=False)
def _fetch_fund_info(ticker: str) -> dict:
    """Fetch fund/ETF info via yfinance (hardened session)."""
    try:
        from services.yf_session import get_info
        return get_info(ticker) or {}
    except Exception:
        return {}


@st.cache_data(ttl=7200, show_spinner=False)
def _fetch_fund_history(ticker: str, period: str = "5y") -> pd.DataFrame:
    """Fetch price history for a fund/ETF (hardened session)."""
    try:
        from services.yf_session import get_history
        data = get_history(ticker, period=period)
        return data
    except Exception:
        return pd.DataFrame()


@st.cache_data(ttl=7200, show_spinner=False)
def _fetch_fund_holdings(ticker: str) -> pd.DataFrame:
    """Try to fetch fund holdings via yfinance (hardened session)."""
    try:
        from services.yf_session import get_ticker
        t = get_ticker(ticker)
        try:
            holdings = t.get_holdings()
            if holdings is not None and not holdings.empty:
                return holdings
        except Exception:
            pass
        try:
            top = t.institutional_holders
            if top is not None and not top.empty:
                return top
        except Exception:
            pass
        return pd.DataFrame()
    except Exception:
        return pd.DataFrame()


# =============================================================================
# MAIN RENDER FUNCTION
# =============================================================================

def render_fund_research():
    """Render the Fund & Manager Research page."""
    try:
        _render_fund_research_inner()
    except Exception as _err:
        import traceback as _tb
        st.error(f"**Fund Research — Unexpected Error:** `{type(_err).__name__}: {_err}`")
        with st.expander("Full traceback (share with developer)", expanded=True):
            st.code(_tb.format_exc())


def _render_fund_research_inner():
    """Render the Fund & Manager Research Dashboard (Module 3)."""

    # Lazy imports for services
    from services.fund_analytics import fund_analytics, FundProfile

    # --- Page Header ---
    st.markdown(
        '<h1 style="font-size: 2.2rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.3rem;">'
        '<span style="background: linear-gradient(135deg, #818cf8, #6366f1, #8b5cf6); '
        '-webkit-background-clip: text; -webkit-text-fill-color: transparent;">'
        'FUND & MANAGER RESEARCH</span></h1>'
        '<p style="font-size: 0.8rem; color: rgba(255,255,255,0.42); margin-bottom: 1.5rem; '
        'letter-spacing: 0.5px;">Due-Diligence Dossier &middot; '
        'Allocator Decision Engine &middot; ATLAS Terminal v11.0</p>',
        unsafe_allow_html=True,
    )

    # =================================================================
    # TOP CONTROL BAR
    # =================================================================
    ctrl_col1, ctrl_col2, ctrl_col3, ctrl_col4 = st.columns([2, 1.5, 1.5, 1.5])

    with ctrl_col1:
        ticker_input = st.text_input(
            "Fund / ETF Ticker",
            value="ARKK",
            placeholder="e.g. ARKK, QQQ, VTI",
            key="fund_research_ticker",
        ).strip().upper()

    with ctrl_col2:
        benchmark = st.selectbox(
            "Benchmark",
            options=BENCHMARKS,
            index=0,
            key="fund_research_benchmark",
        )

    with ctrl_col3:
        asset_class = st.selectbox(
            "Asset Class",
            options=STRATEGY_CLASSIFICATIONS["asset_class"],
            index=0,
            key="fund_research_asset_class",
        )

    with ctrl_col4:
        style_sel = st.selectbox(
            "Style / Cap",
            options=[
                f"{s} / {c}"
                for s in STRATEGY_CLASSIFICATIONS["style"]
                for c in STRATEGY_CLASSIFICATIONS["cap_bias"]
            ],
            index=0,
            key="fund_research_style_cap",
        )

    if not ticker_input:
        st.info("Enter a fund or ETF ticker above to begin research.")
        return

    # Parse style / cap
    style_parts = style_sel.split(" / ")
    style_label = style_parts[0] if len(style_parts) > 0 else "Blend"
    cap_label = style_parts[1] if len(style_parts) > 1 else "Large Cap"

    # Build fund profile
    profile = FundProfile(
        ticker=ticker_input,
        benchmark=benchmark,
        asset_class=asset_class,
        style=style_label,
        cap_bias=cap_label,
    )

    # =================================================================
    # FETCH DATA
    # =================================================================
    with st.spinner(f"Fetching data for {ticker_input}..."):
        fund_info = _fetch_fund_info(ticker_input)
        fund_history = _fetch_fund_history(ticker_input, "5y")
        perf_metrics = fund_analytics.calculate_performance_metrics(ticker_input, benchmark)
        dd_analysis = fund_analytics.calculate_drawdown_analysis(ticker_input)

    if fund_history.empty:
        st.error(f"Could not retrieve data for **{ticker_input}**. Please verify the ticker.")
        return

    # Fund name
    fund_name = fund_info.get("longName") or fund_info.get("shortName") or ticker_input
    profile.name = fund_name
    profile.expense_ratio = fund_info.get("annualReportExpenseRatio") or fund_info.get("expenseRatio") or 0.0

    # =================================================================
    # THREE-COLUMN DOSSIER LAYOUT
    # =================================================================
    left_col, center_col, right_col = st.columns([1.1, 2.2, 1.3])

    # -----------------------------------------------------------------
    # LEFT PANEL: FUND IDENTITY & PERFORMANCE SUMMARY
    # -----------------------------------------------------------------
    with left_col:
        st.markdown(
            '<div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.72); '
            'text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 12px; '
            'border-bottom: 1px solid rgba(255,255,255,0.07); padding-bottom: 8px;">Fund Identity</div>',
            unsafe_allow_html=True,
        )

        # Name & ticker
        st.markdown(
            f'<div style="background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); '
            f'border-radius: 12px; padding: 20px; margin-bottom: 16px;">'
            f'<div style="font-size: 20px; font-weight: 700; color: rgba(255,255,255,0.92); '
            f'margin-bottom: 4px;">{ticker_input}</div>'
            f'<div style="font-size: 12px; color: rgba(255,255,255,0.52); margin-bottom: 14px;">'
            f'{fund_name}</div>'
            f'<div style="display: flex; gap: 6px; flex-wrap: wrap;">'
            f'<span style="font-size: 10px; background: rgba(99,102,241,0.15); color: {_PRIMARY}; '
            f'padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(99,102,241,0.25);">'
            f'{asset_class}</span>'
            f'<span style="font-size: 10px; background: rgba(20,184,166,0.15); color: {_TEAL}; '
            f'padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(20,184,166,0.25);">'
            f'{style_label}</span>'
            f'<span style="font-size: 10px; background: rgba(139,92,246,0.15); color: {_PURPLE}; '
            f'padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(139,92,246,0.25);">'
            f'{cap_label}</span></div></div>',
            unsafe_allow_html=True,
        )

        # Expense ratio
        er_display = f"{profile.expense_ratio * 100:.2f}%" if profile.expense_ratio else "N/A"
        st.markdown(_glass_card("Expense Ratio", er_display), unsafe_allow_html=True)

        # AUM
        aum = fund_info.get("totalAssets") or fund_info.get("netAssets")
        aum_display = format_large_number(aum, "$") if aum else "N/A"
        st.markdown(_glass_card("AUM", aum_display), unsafe_allow_html=True)

        # Current price
        current_price = None
        if not fund_history.empty:
            current_price = fund_history["Close"].iloc[-1]
            st.markdown(
                _glass_card("Last Price", f"${current_price:,.2f}"),
                unsafe_allow_html=True,
            )

        # --- Rolling Performance Summary ---
        st.markdown(
            '<div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.72); '
            'text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 12px; margin-top: 8px; '
            'border-bottom: 1px solid rgba(255,255,255,0.07); padding-bottom: 8px;">Rolling Returns</div>',
            unsafe_allow_html=True,
        )

        if perf_metrics and "rolling_returns" in perf_metrics:
            rolling = perf_metrics["rolling_returns"]
            # Also calculate benchmark rolling returns
            bench_perf = fund_analytics.calculate_performance_metrics(benchmark, benchmark)
            bench_rolling = bench_perf.get("rolling_returns", {}) if bench_perf else {}

            rows_html = ""
            for period in ["1M", "3M", "6M", "1Y", "3Y"]:
                fund_val = rolling.get(period)
                bench_val = bench_rolling.get(period)
                if fund_val is not None:
                    f_color = _color_for_value(fund_val)
                    fund_str = f"{fund_val:+.2f}%"
                    bench_str = f"{bench_val:+.2f}%" if bench_val is not None else "---"
                    b_color = _color_for_value(bench_val, 0.0) if bench_val is not None else "rgba(255,255,255,0.38)"
                    # Excess
                    excess = (fund_val - bench_val) if bench_val is not None else None
                    excess_str = f"{excess:+.2f}%" if excess is not None else "---"
                    e_color = _color_for_value(excess, 0.0) if excess is not None else "rgba(255,255,255,0.38)"
                    rows_html += (
                        f'<tr>'
                        f'<td style="padding: 6px 8px; color: rgba(255,255,255,0.62); font-size: 11px;">{period}</td>'
                        f'<td style="padding: 6px 8px; color: {f_color}; font-weight: 600; font-size: 12px; text-align: right;">{fund_str}</td>'
                        f'<td style="padding: 6px 8px; color: {b_color}; font-size: 11px; text-align: right;">{bench_str}</td>'
                        f'<td style="padding: 6px 8px; color: {e_color}; font-size: 11px; text-align: right;">{excess_str}</td>'
                        f'</tr>'
                    )

            if rows_html:
                st.markdown(
                    f'<div style="background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); '
                    f'border-radius: 10px; overflow: hidden; margin-bottom: 16px;">'
                    f'<table style="width: 100%; border-collapse: collapse;">'
                    f'<thead><tr style="border-bottom: 1px solid rgba(255,255,255,0.07);">'
                    f'<th style="padding: 8px; color: rgba(255,255,255,0.42); font-size: 10px; text-transform: uppercase; text-align: left;">Period</th>'
                    f'<th style="padding: 8px; color: rgba(255,255,255,0.42); font-size: 10px; text-transform: uppercase; text-align: right;">Fund</th>'
                    f'<th style="padding: 8px; color: rgba(255,255,255,0.42); font-size: 10px; text-transform: uppercase; text-align: right;">{benchmark}</th>'
                    f'<th style="padding: 8px; color: rgba(255,255,255,0.42); font-size: 10px; text-transform: uppercase; text-align: right;">Excess</th>'
                    f'</tr></thead><tbody>{rows_html}</tbody></table></div>',
                    unsafe_allow_html=True,
                )
        else:
            st.caption("Performance data unavailable.")

    # -----------------------------------------------------------------
    # CENTER PANEL: ANALYTICAL WORKSPACE (TABS)
    # -----------------------------------------------------------------
    with center_col:
        tab_dd, tab_risk, tab_holdings, tab_skill, tab_capture, tab_calendar, tab_style, tab_compare = st.tabs([
            "📉 Drawdown",
            "📐 Risk Metrics",
            "📦 Holdings",
            "🧠 Manager Skill",
            "🎯 Up/Down Capture",
            "📅 Calendar Returns",
            "🗺️ Style Box",
            "⚖️ Comparison",
        ])

        # =============================================================
        # TAB 1: DRAWDOWN ANALYSIS
        # =============================================================
        with tab_dd:
            st.markdown(
                '<div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.72); '
                'text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 14px;">'
                'Drawdown Analysis</div>',
                unsafe_allow_html=True,
            )

            if dd_analysis:
                # Underwater chart
                dd_series = dd_analysis.get("underwater_series")
                if dd_series is not None and len(dd_series) > 0:
                    fig_dd = go.Figure()
                    fig_dd.add_trace(go.Scatter(
                        x=dd_series.index,
                        y=dd_series.values * 100,
                        fill="tozeroy",
                        fillcolor="rgba(239,68,68,0.15)",
                        line=dict(color=_RED, width=1.2),
                        name="Drawdown",
                        hovertemplate="%{x|%Y-%m-%d}<br>Drawdown: %{y:.2f}%<extra></extra>",
                    ))
                    fig_dd.update_layout(
                        title=dict(
                            text=f"{ticker_input} Underwater Chart",
                            font=dict(size=13, color="rgba(255,255,255,0.72)"),
                        ),
                        yaxis_title="Drawdown (%)",
                        yaxis=dict(ticksuffix="%"),
                    )
                    _apply_chart_theme(fig_dd, height=350)
                    st.plotly_chart(fig_dd, use_container_width=True)

                # Current drawdown card
                current_dd = dd_analysis.get("current_drawdown", 0)
                max_dd = dd_analysis.get("max_drawdown", 0)
                dd_c1, dd_c2 = st.columns(2)
                with dd_c1:
                    st.markdown(
                        _glass_card(
                            "Current Drawdown",
                            f"{current_dd:.2f}%",
                            color=_RED if current_dd < -5 else _AMBER if current_dd < 0 else _GREEN,
                        ),
                        unsafe_allow_html=True,
                    )
                with dd_c2:
                    st.markdown(
                        _glass_card("Maximum Drawdown", f"{max_dd:.2f}%", color=_RED),
                        unsafe_allow_html=True,
                    )

                # Top 5 drawdown periods
                top_dds = dd_analysis.get("top_drawdowns", [])
                if top_dds:
                    st.markdown(
                        '<div style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.52); '
                        'text-transform: uppercase; letter-spacing: 0.8px; margin: 14px 0 8px 0;">'
                        'Top 5 Drawdown Periods</div>',
                        unsafe_allow_html=True,
                    )
                    dd_rows = []
                    for d in top_dds[:5]:
                        dd_rows.append({
                            "Start": d.get("start", ""),
                            "Trough": d.get("trough", ""),
                            "End": d.get("end", ""),
                            "Depth (%)": f"{d.get('depth', 0):.2f}%",
                            "Duration (days)": d.get("duration_days", 0),
                        })
                    st.dataframe(
                        pd.DataFrame(dd_rows),
                        use_container_width=True,
                        hide_index=True,
                    )

                # Annual worst drawdowns
                annual_dd = dd_analysis.get("annual_drawdowns", {})
                if annual_dd:
                    st.markdown(
                        '<div style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.52); '
                        'text-transform: uppercase; letter-spacing: 0.8px; margin: 14px 0 8px 0;">'
                        'Annual Worst Drawdowns</div>',
                        unsafe_allow_html=True,
                    )
                    years = list(annual_dd.keys())
                    vals = list(annual_dd.values())
                    bar_colors = [_RED if v < -15 else _AMBER if v < -5 else _GREEN for v in vals]
                    fig_annual = go.Figure(go.Bar(
                        x=years,
                        y=vals,
                        marker_color=bar_colors,
                        text=[f"{v:.1f}%" for v in vals],
                        textposition="outside",
                        textfont=dict(size=9, color="rgba(255,255,255,0.52)"),
                    ))
                    fig_annual.update_layout(
                        yaxis_title="Max DD (%)",
                        yaxis=dict(ticksuffix="%"),
                    )
                    _apply_chart_theme(fig_annual, height=280)
                    st.plotly_chart(fig_annual, use_container_width=True)
            else:
                st.warning("Drawdown analysis unavailable for this ticker.")

        # =============================================================
        # TAB 2: RISK METRICS
        # =============================================================
        with tab_risk:
            st.markdown(
                '<div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.72); '
                'text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 14px;">'
                'Risk Metrics</div>',
                unsafe_allow_html=True,
            )

            if perf_metrics:
                r1, r2, r3, r4 = st.columns(4)
                with r1:
                    vol = perf_metrics.get("ann_vol", 0)
                    st.markdown(
                        _metric_mini("Std Dev (Ann.)", f"{vol:.2f}%", _AMBER if vol > 25 else "rgba(255,255,255,0.92)"),
                        unsafe_allow_html=True,
                    )
                with r2:
                    sharpe = perf_metrics.get("sharpe", 0)
                    sh_color = _GREEN if sharpe > 1.0 else _AMBER if sharpe > 0.5 else _RED
                    st.markdown(
                        _metric_mini("Sharpe", f"{sharpe:.2f}", sh_color),
                        unsafe_allow_html=True,
                    )
                with r3:
                    sortino = perf_metrics.get("sortino", 0)
                    so_color = _GREEN if sortino > 1.5 else _AMBER if sortino > 0.7 else _RED
                    st.markdown(
                        _metric_mini("Sortino", f"{sortino:.2f}", so_color),
                        unsafe_allow_html=True,
                    )
                with r4:
                    calmar = perf_metrics.get("calmar", 0)
                    cal_color = _GREEN if calmar > 1.0 else _AMBER if calmar > 0.4 else _RED
                    st.markdown(
                        _metric_mini("Calmar", f"{calmar:.2f}", cal_color),
                        unsafe_allow_html=True,
                    )

                # Additional metrics row
                st.markdown("<div style='height: 12px;'></div>", unsafe_allow_html=True)
                r5, r6, r7, r8 = st.columns(4)
                with r5:
                    ann_ret = perf_metrics.get("ann_return", 0)
                    st.markdown(
                        _metric_mini("Ann. Return", f"{ann_ret:+.2f}%", _color_for_value(ann_ret)),
                        unsafe_allow_html=True,
                    )
                with r6:
                    max_dd_val = perf_metrics.get("max_drawdown", 0)
                    st.markdown(
                        _metric_mini("Max Drawdown", f"{max_dd_val:.2f}%", _RED),
                        unsafe_allow_html=True,
                    )
                with r7:
                    beta = perf_metrics.get("beta")
                    if beta is not None:
                        st.markdown(
                            _metric_mini("Beta", f"{beta:.2f}", _AMBER if abs(beta - 1.0) > 0.3 else "rgba(255,255,255,0.92)"),
                            unsafe_allow_html=True,
                        )
                    else:
                        st.markdown(_metric_mini("Beta", "N/A"), unsafe_allow_html=True)
                with r8:
                    corr = perf_metrics.get("correlation")
                    if corr is not None:
                        st.markdown(
                            _metric_mini("Correlation", f"{corr:.2f}", "rgba(255,255,255,0.92)"),
                            unsafe_allow_html=True,
                        )
                    else:
                        st.markdown(_metric_mini("Correlation", "N/A"), unsafe_allow_html=True)

                # Rolling Sharpe chart (1Y rolling)
                st.markdown("<div style='height: 16px;'></div>", unsafe_allow_html=True)
                st.markdown(
                    '<div style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.52); '
                    'text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;">'
                    '1-Year Rolling Sharpe Ratio</div>',
                    unsafe_allow_html=True,
                )
                try:
                    fund_returns = fund_analytics.get_fund_returns(ticker_input)
                    if fund_returns is not None and len(fund_returns) > 252:
                        rf_daily = 0.045 / 252
                        rolling_sharpe = fund_returns.rolling(252).apply(
                            lambda x: (x.mean() * 252 - 0.045) / (x.std() * np.sqrt(252))
                            if x.std() > 0 else 0,
                            raw=False,
                        ).dropna()

                        fig_sharpe = go.Figure()
                        fig_sharpe.add_trace(go.Scatter(
                            x=rolling_sharpe.index,
                            y=rolling_sharpe.values,
                            line=dict(color=_PRIMARY, width=1.5),
                            name="Rolling Sharpe (1Y)",
                            hovertemplate="%{x|%Y-%m-%d}<br>Sharpe: %{y:.2f}<extra></extra>",
                        ))
                        # Zero line
                        fig_sharpe.add_hline(
                            y=0, line_dash="dash",
                            line_color="rgba(255,255,255,0.2)",
                            line_width=1,
                        )
                        # 1.0 reference
                        fig_sharpe.add_hline(
                            y=1.0, line_dash="dot",
                            line_color="rgba(16,185,129,0.3)",
                            line_width=1,
                            annotation_text="1.0",
                            annotation_font=dict(size=9, color="rgba(255,255,255,0.38)"),
                        )
                        fig_sharpe.update_layout(yaxis_title="Sharpe Ratio")
                        _apply_chart_theme(fig_sharpe, height=300)
                        st.plotly_chart(fig_sharpe, use_container_width=True)
                    else:
                        st.caption("Insufficient history for rolling Sharpe chart (need >1Y of data).")
                except Exception as e:
                    st.caption(f"Rolling Sharpe chart unavailable: {e}")
            else:
                st.warning("Performance metrics unavailable.")

        # =============================================================
        # TAB 3: HOLDINGS ANALYSIS
        # =============================================================
        with tab_holdings:
            st.markdown(
                '<div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.72); '
                'text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 14px;">'
                'Holdings Analysis</div>',
                unsafe_allow_html=True,
            )

            holdings_df = _fetch_fund_holdings(ticker_input)

            if holdings_df is not None and not holdings_df.empty:
                st.markdown(
                    '<div style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.52); '
                    'text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;">'
                    'Top Holdings</div>',
                    unsafe_allow_html=True,
                )
                # Display the top holdings
                display_cols = [c for c in holdings_df.columns if c.lower() not in ("index",)]
                st.dataframe(
                    holdings_df.head(20)[display_cols] if display_cols else holdings_df.head(20),
                    use_container_width=True,
                    hide_index=True,
                )

                # Attempt sector exposure chart
                sector_col = None
                for candidate in ["Sector", "sector", "GICS Sector", "gics_sector", "Category"]:
                    if candidate in holdings_df.columns:
                        sector_col = candidate
                        break

                weight_col = None
                for candidate in ["% Assets", "Weight", "weight", "pctAssets", "Holding Percent"]:
                    if candidate in holdings_df.columns:
                        weight_col = candidate
                        break

                if sector_col and weight_col:
                    try:
                        sector_data = holdings_df.groupby(sector_col)[weight_col].sum().sort_values(ascending=True)
                        fig_sector = go.Figure(go.Bar(
                            y=sector_data.index,
                            x=sector_data.values,
                            orientation="h",
                            marker_color=_TEAL,
                            text=[f"{v:.1f}%" for v in sector_data.values],
                            textposition="auto",
                            textfont=dict(size=10, color="rgba(255,255,255,0.72)"),
                        ))
                        fig_sector.update_layout(
                            title=dict(
                                text="Sector Exposure",
                                font=dict(size=13, color="rgba(255,255,255,0.72)"),
                            ),
                            xaxis_title="Weight (%)",
                        )
                        _apply_chart_theme(fig_sector, height=max(250, len(sector_data) * 30 + 80))
                        st.plotly_chart(fig_sector, use_container_width=True)
                    except Exception:
                        pass
            else:
                st.info(
                    f"Holdings data is not available for **{ticker_input}** via the current data provider. "
                    "Holdings are typically available for major US-listed ETFs."
                )

                # Show a placeholder explanation
                st.markdown(
                    '<div style="background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); '
                    'border-radius: 10px; padding: 16px; margin-top: 10px;">'
                    '<div style="font-size: 11px; color: rgba(255,255,255,0.42);">'
                    'For ETFs with publicly available holdings (e.g., SPY, QQQ, VTI, ARKK), '
                    'this section displays top positions and sector breakdowns. '
                    'Mutual funds and international ETFs may not expose holdings via the API.</div></div>',
                    unsafe_allow_html=True,
                )

        # =============================================================
        # TAB 4: MANAGER SKILL ANALYTICS
        # =============================================================
        with tab_skill:
            st.markdown(
                '<div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.72); '
                'text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 14px;">'
                'Manager Skill Analytics</div>',
                unsafe_allow_html=True,
            )

            if perf_metrics:
                # Alpha vs Beta decomposition
                sk1, sk2, sk3 = st.columns(3)
                with sk1:
                    alpha_val = perf_metrics.get("alpha")
                    if alpha_val is not None:
                        a_color = _GREEN if alpha_val > 0 else _RED
                        st.markdown(
                            _glass_card("Alpha (Ann.)", f"{alpha_val:+.2f}%", color=a_color),
                            unsafe_allow_html=True,
                        )
                    else:
                        st.markdown(_glass_card("Alpha", "N/A"), unsafe_allow_html=True)

                with sk2:
                    beta_val = perf_metrics.get("beta")
                    if beta_val is not None:
                        st.markdown(
                            _glass_card("Beta", f"{beta_val:.3f}",
                                        sublabel=f"vs {benchmark}"),
                            unsafe_allow_html=True,
                        )
                    else:
                        st.markdown(_glass_card("Beta", "N/A"), unsafe_allow_html=True)

                with sk3:
                    te_val = perf_metrics.get("tracking_error")
                    if te_val is not None:
                        st.markdown(
                            _glass_card("Tracking Error", f"{te_val:.2f}%"),
                            unsafe_allow_html=True,
                        )
                    else:
                        st.markdown(_glass_card("Tracking Error", "N/A"), unsafe_allow_html=True)

                # Information Ratio & Win Rate
                sk4, sk5 = st.columns(2)
                with sk4:
                    ir_val = perf_metrics.get("information_ratio")
                    if ir_val is not None:
                        ir_color = _GREEN if ir_val > 0.5 else _AMBER if ir_val > 0 else _RED
                        st.markdown(
                            _glass_card("Information Ratio", f"{ir_val:.3f}", color=ir_color),
                            unsafe_allow_html=True,
                        )
                    else:
                        st.markdown(_glass_card("Information Ratio", "N/A"), unsafe_allow_html=True)

                with sk5:
                    wr_val = perf_metrics.get("win_rate_12m")
                    if wr_val is not None:
                        wr_color = _GREEN if wr_val > 50 else _AMBER if wr_val > 35 else _RED
                        st.markdown(
                            _glass_card(
                                "Win Rate (12M Rolling)",
                                f"{wr_val:.1f}%",
                                sublabel="% of rolling 12M periods outperforming benchmark",
                                color=wr_color,
                            ),
                            unsafe_allow_html=True,
                        )
                    else:
                        st.markdown(_glass_card("Win Rate", "N/A"), unsafe_allow_html=True)

                # Consistency chart: rolling 12M excess return
                try:
                    fund_ret = fund_analytics.get_fund_returns(ticker_input)
                    bench_ret = fund_analytics.get_fund_returns(benchmark)
                    if fund_ret is not None and bench_ret is not None:
                        common_idx = fund_ret.index.intersection(bench_ret.index)
                        if len(common_idx) > 252:
                            f_aligned = fund_ret.loc[common_idx]
                            b_aligned = bench_ret.loc[common_idx]
                            excess_ret = f_aligned - b_aligned
                            rolling_excess_12m = excess_ret.rolling(252).apply(
                                lambda x: (1 + x).prod() - 1, raw=False
                            ).dropna() * 100

                            fig_consistency = go.Figure()
                            colors_bar = [_GREEN if v >= 0 else _RED for v in rolling_excess_12m.values]
                            fig_consistency.add_trace(go.Bar(
                                x=rolling_excess_12m.index,
                                y=rolling_excess_12m.values,
                                marker_color=colors_bar,
                                name="12M Excess Return",
                                hovertemplate="%{x|%Y-%m-%d}<br>Excess: %{y:.2f}%<extra></extra>",
                            ))
                            fig_consistency.add_hline(
                                y=0, line_dash="dash",
                                line_color="rgba(255,255,255,0.2)",
                                line_width=1,
                            )
                            fig_consistency.update_layout(
                                title=dict(
                                    text=f"Rolling 12M Excess Return vs {benchmark}",
                                    font=dict(size=13, color="rgba(255,255,255,0.72)"),
                                ),
                                yaxis_title="Excess Return (%)",
                                yaxis=dict(ticksuffix="%"),
                                bargap=0,
                            )
                            _apply_chart_theme(fig_consistency, height=300)
                            st.plotly_chart(fig_consistency, use_container_width=True)
                except Exception:
                    st.caption("Consistency chart unavailable.")
            else:
                st.warning("Manager skill analytics require valid performance metrics.")

        # =============================================================
        # TAB 5: COMPARISON MODE
        # =============================================================
        with tab_compare:
            st.markdown(
                '<div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.72); '
                'text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 14px;">'
                'Fund Comparison</div>',
                unsafe_allow_html=True,
            )

            compare_tickers = st.multiselect(
                "Select 2-4 funds to compare",
                options=["SPY", "QQQ", "VTI", "IWM", "ARKK", "SCHD", "VUG", "VTV", "VXUS", "BND",
                         "AGG", "TLT", "GLD", "XLK", "XLF", "XLE", "XLV", "DIA", "EFA", "EEM"],
                default=[],
                max_selections=4,
                key="fund_compare_tickers",
            )

            if compare_tickers:
                # Always include the primary fund
                all_compare = [ticker_input] + [t for t in compare_tickers if t != ticker_input]

                comp_data = []
                with st.spinner("Loading comparison data..."):
                    for t in all_compare:
                        m = fund_analytics.calculate_performance_metrics(t, benchmark)
                        if m:
                            comp_data.append(m)

                if comp_data:
                    comp_rows = []
                    for m in comp_data:
                        row = {
                            "Ticker": m.get("ticker", ""),
                            "Ann. Return (%)": f"{m.get('ann_return', 0):.2f}",
                            "Ann. Vol (%)": f"{m.get('ann_vol', 0):.2f}",
                            "Sharpe": f"{m.get('sharpe', 0):.2f}",
                            "Sortino": f"{m.get('sortino', 0):.2f}",
                            "Max DD (%)": f"{m.get('max_drawdown', 0):.2f}",
                            "Calmar": f"{m.get('calmar', 0):.2f}",
                        }
                        if "alpha" in m:
                            row["Alpha (%)"] = f"{m['alpha']:+.2f}"
                            row["Beta"] = f"{m.get('beta', 0):.2f}"
                            row["IR"] = f"{m.get('information_ratio', 0):.3f}"
                        comp_rows.append(row)

                    comp_df = pd.DataFrame(comp_rows)
                    st.dataframe(comp_df, use_container_width=True, hide_index=True)

                    # Cumulative return overlay chart
                    st.markdown(
                        '<div style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.52); '
                        'text-transform: uppercase; letter-spacing: 0.8px; margin: 14px 0 8px 0;">'
                        'Cumulative Return Comparison</div>',
                        unsafe_allow_html=True,
                    )
                    fig_comp = go.Figure()
                    comp_colors = [_PRIMARY, _TEAL, _PURPLE, _AMBER, _GREEN]
                    for i, t in enumerate(all_compare):
                        ret = fund_analytics.get_fund_returns(t)
                        if ret is not None:
                            cum = (1 + ret).cumprod()
                            cum_pct = (cum - 1) * 100
                            fig_comp.add_trace(go.Scatter(
                                x=cum_pct.index,
                                y=cum_pct.values,
                                name=t,
                                line=dict(
                                    color=comp_colors[i % len(comp_colors)],
                                    width=2 if i == 0 else 1.3,
                                ),
                                hovertemplate=f"{t}<br>%{{x|%Y-%m-%d}}<br>Return: %{{y:.2f}}%<extra></extra>",
                            ))

                    fig_comp.update_layout(
                        yaxis_title="Cumulative Return (%)",
                        yaxis=dict(ticksuffix="%"),
                        legend=dict(
                            orientation="h",
                            yanchor="bottom",
                            y=1.02,
                            xanchor="left",
                            x=0,
                        ),
                    )
                    _apply_chart_theme(fig_comp, height=380)
                    st.plotly_chart(fig_comp, use_container_width=True)
                else:
                    st.warning("Could not retrieve comparison data.")
            else:
                st.info("Select 2-4 fund tickers above for side-by-side comparison.")


        # =============================================================
        # TAB 5: UPSIDE / DOWNSIDE CAPTURE
        # =============================================================
        with tab_capture:
            st.markdown(
                '<div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.72); '
                'text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 14px;">'
                'Upside / Downside Capture Ratios</div>',
                unsafe_allow_html=True,
            )
            st.markdown(
                f'<div style="font-size: 11px; color: rgba(255,255,255,0.42); margin-bottom: 16px;">'
                f'How much of the benchmark\u2019s up and down months does <strong>{ticker_input}</strong> '
                f'capture? &nbsp;Ideal manager: high upside capture, low downside capture.</div>',
                unsafe_allow_html=True,
            )

            with st.spinner("Calculating capture ratios..."):
                capture = fund_analytics.calculate_capture_ratios(ticker_input, benchmark)

            if capture:
                uc = capture.get("upside_capture")
                dc = capture.get("downside_capture")
                cr = capture.get("capture_ratio")

                # ── Headline metrics ──────────────────────────────────
                hc1, hc2, hc3 = st.columns(3)

                def _capture_card(label, val, is_downside=False):
                    if val is None:
                        return _glass_card(label, "N/A")
                    if is_downside:
                        color = _GREEN if val < 90 else (_AMBER if val < 105 else _RED)
                    else:
                        color = _GREEN if val > 100 else (_AMBER if val > 85 else _RED)
                    return _glass_card(label, f"{val:.1f}%", color=color)

                with hc1:
                    st.markdown(_capture_card("Upside Capture", uc), unsafe_allow_html=True)
                with hc2:
                    st.markdown(_capture_card("Downside Capture", dc, is_downside=True), unsafe_allow_html=True)
                with hc3:
                    if cr is not None:
                        cr_color = _GREEN if cr > 1.1 else (_AMBER if cr > 0.9 else _RED)
                        sub = "Higher is better · >1.0 means asymmetric upside"
                        st.markdown(
                            _glass_card("Capture Ratio (U/D)", f"{cr:.2f}x", sublabel=sub, color=cr_color),
                            unsafe_allow_html=True,
                        )
                    else:
                        st.markdown(_glass_card("Capture Ratio", "N/A"), unsafe_allow_html=True)

                # ── Interpretation ────────────────────────────────────
                if uc is not None and dc is not None:
                    if cr and cr > 1.15:
                        interp = f"✅ Strong asymmetric profile — {ticker_input} captures significantly more upside than downside."
                        interp_color = _GREEN
                    elif cr and cr > 0.95:
                        interp = f"⚠️ Roughly symmetric — {ticker_input} participates similarly in up and down markets."
                        interp_color = _AMBER
                    else:
                        interp = f"❌ Unfavourable ratio — {ticker_input} loses more in down markets than it gains in up markets."
                        interp_color = _RED
                    st.markdown(
                        f'<div style="background: rgba(255,255,255,0.03); border-left: 3px solid {interp_color}; '
                        f'border-radius: 0 8px 8px 0; padding: 12px; margin-bottom: 18px; '
                        f'font-size: 12px; color: rgba(255,255,255,0.72);">{interp}</div>',
                        unsafe_allow_html=True,
                    )

                # ── Year-by-year capture chart ────────────────────────
                yearly = capture.get("yearly_capture", {})
                if yearly:
                    years_list = sorted(yearly.keys())
                    uc_vals = [yearly[y].get("upside") for y in years_list]
                    dc_vals = [yearly[y].get("downside") for y in years_list]

                    fig_cap = go.Figure()
                    fig_cap.add_trace(go.Bar(
                        x=years_list, y=uc_vals, name="Upside Capture",
                        marker_color=_GREEN,
                        text=[f"{v:.0f}%" if v is not None else "" for v in uc_vals],
                        textposition="outside",
                        textfont=dict(size=9, color="rgba(255,255,255,0.55)"),
                    ))
                    fig_cap.add_trace(go.Bar(
                        x=years_list, y=dc_vals, name="Downside Capture",
                        marker_color=_RED,
                        text=[f"{v:.0f}%" if v is not None else "" for v in dc_vals],
                        textposition="outside",
                        textfont=dict(size=9, color="rgba(255,255,255,0.55)"),
                    ))
                    fig_cap.add_hline(
                        y=100, line_dash="dash",
                        line_color="rgba(255,255,255,0.2)", line_width=1,
                        annotation_text="100% (benchmark)",
                        annotation_font=dict(size=9, color="rgba(255,255,255,0.35)"),
                    )
                    fig_cap.update_layout(
                        barmode="group",
                        title=dict(text="Annual Capture Ratios", font=dict(size=13, color="rgba(255,255,255,0.72)")),
                        yaxis_title="Capture (%)",
                        yaxis=dict(ticksuffix="%"),
                        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
                    )
                    _apply_chart_theme(fig_cap, height=340)
                    st.plotly_chart(fig_cap, use_container_width=True)

                    # ── Up/Down months table ──────────────────────────
                    n_up = capture.get("n_up_months", 0)
                    n_dn = capture.get("n_down_months", 0)
                    st.markdown(
                        f'<div style="font-size: 11px; color: rgba(255,255,255,0.38); margin-top: 8px;">'
                        f'Based on <strong>{n_up}</strong> up months and <strong>{n_dn}</strong> down months '
                        f'vs <strong>{benchmark}</strong></div>',
                        unsafe_allow_html=True,
                    )
            else:
                st.warning("Capture ratio data unavailable — insufficient history or data fetch failed.")

        # =============================================================
        # TAB 6: CALENDAR YEAR RETURNS
        # =============================================================
        with tab_calendar:
            st.markdown(
                '<div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.72); '
                'text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 14px;">'
                'Calendar Year Returns</div>',
                unsafe_allow_html=True,
            )

            with st.spinner("Loading calendar year returns..."):
                cal_df = fund_analytics.calculate_calendar_year_returns(ticker_input, benchmark)

            if cal_df is not None and not cal_df.empty:
                # ── Side-by-side annual bar chart (Morningstar style) ─
                years_cal = cal_df["Year"].tolist()
                fund_cal = cal_df["Fund (%)"].tolist()
                bench_cal = cal_df["Benchmark (%)"].tolist()

                fig_cal = go.Figure()
                fig_cal.add_trace(go.Bar(
                    x=years_cal, y=fund_cal,
                    name=ticker_input,
                    marker_color=[_GREEN if v >= 0 else _RED for v in fund_cal],
                    text=[f"{v:+.1f}%" for v in fund_cal],
                    textposition="outside",
                    textfont=dict(size=9, color="rgba(255,255,255,0.6)"),
                ))
                if any(v is not None for v in bench_cal):
                    clean_bench = [v for v in bench_cal if v is not None]
                    fig_cal.add_trace(go.Bar(
                        x=years_cal, y=bench_cal,
                        name=benchmark,
                        marker_color="rgba(99,102,241,0.55)",
                        text=[f"{v:+.1f}%" if v is not None else "" for v in bench_cal],
                        textposition="outside",
                        textfont=dict(size=9, color="rgba(255,255,255,0.45)"),
                    ))
                fig_cal.add_hline(
                    y=0, line_color="rgba(255,255,255,0.15)", line_width=1,
                )
                fig_cal.update_layout(
                    barmode="group",
                    title=dict(text=f"{ticker_input} vs {benchmark} — Annual Returns", font=dict(size=13, color="rgba(255,255,255,0.72)")),
                    yaxis_title="Annual Return (%)",
                    yaxis=dict(ticksuffix="%"),
                    xaxis=dict(type="category"),
                    legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
                )
                _apply_chart_theme(fig_cal, height=380)
                st.plotly_chart(fig_cal, use_container_width=True)

                # ── Excess return bar (fund minus benchmark) ──────────
                excess_cal = cal_df["Excess (%)"].tolist()
                if any(v is not None for v in excess_cal):
                    fig_exc = go.Figure()
                    exc_colors = [_GREEN if (v or 0) >= 0 else _RED for v in excess_cal]
                    fig_exc.add_trace(go.Bar(
                        x=years_cal, y=excess_cal,
                        marker_color=exc_colors,
                        name="Excess Return",
                        text=[f"{v:+.1f}%" if v is not None else "" for v in excess_cal],
                        textposition="outside",
                        textfont=dict(size=9, color="rgba(255,255,255,0.55)"),
                    ))
                    fig_exc.add_hline(y=0, line_color="rgba(255,255,255,0.15)", line_width=1)
                    fig_exc.update_layout(
                        title=dict(text=f"Annual Excess Return vs {benchmark}", font=dict(size=13, color="rgba(255,255,255,0.72)")),
                        yaxis_title="Excess Return (%)",
                        yaxis=dict(ticksuffix="%"),
                        xaxis=dict(type="category"),
                        showlegend=False,
                        bargap=0.3,
                    )
                    _apply_chart_theme(fig_exc, height=240)
                    st.plotly_chart(fig_exc, use_container_width=True)

                # ── Summary table ──────────────────────────────────────
                st.markdown(
                    '<div style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.52); '
                    'text-transform: uppercase; letter-spacing: 0.8px; margin: 14px 0 8px 0;">'
                    'Annual Returns Table</div>',
                    unsafe_allow_html=True,
                )
                display_df = cal_df.copy()
                # Colour-code the table
                st.dataframe(
                    display_df,
                    use_container_width=True,
                    hide_index=True,
                )

                # Hit rate
                outperform_years = sum(1 for e in excess_cal if e is not None and e > 0)
                total_years = sum(1 for e in excess_cal if e is not None)
                if total_years > 0:
                    hit_rate = outperform_years / total_years * 100
                    hr_color = _GREEN if hit_rate >= 60 else (_AMBER if hit_rate >= 40 else _RED)
                    st.markdown(
                        f'<div style="background: rgba(255,255,255,0.03); border-left: 3px solid {hr_color}; '
                        f'border-radius: 0 8px 8px 0; padding: 10px; margin-top: 8px; font-size: 12px; '
                        f'color: rgba(255,255,255,0.72);">'
                        f'<strong>Outperformance Rate:</strong> {ticker_input} beat {benchmark} in '
                        f'<span style="color: {hr_color}; font-weight: 700;">{outperform_years} of {total_years} calendar years</span>'
                        f' ({hit_rate:.0f}%)</div>',
                        unsafe_allow_html=True,
                    )
            else:
                st.warning("Calendar year return data unavailable — insufficient history.")

        # =============================================================
        # TAB 7: STYLE BOX
        # =============================================================
        with tab_style:
            st.markdown(
                '<div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.72); '
                'text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 14px;">'
                'Style Box</div>',
                unsafe_allow_html=True,
            )
            st.markdown(
                f'<div style="font-size: 11px; color: rgba(255,255,255,0.42); margin-bottom: 20px;">'
                f'Morningstar-style classification for {ticker_input}. Inferred from valuation multiples, '
                f'momentum, and AUM. Category override applied when available from data provider.</div>',
                unsafe_allow_html=True,
            )

            with st.spinner("Inferring style box..."):
                style_data = fund_analytics.infer_style_box(ticker_input, benchmark)

            style_score = style_data.get("style_score", 1)   # 0=Value 1=Blend 2=Growth
            cap_score = style_data.get("cap_score", 2)         # 0=Small 1=Mid 2=Large
            style_label = style_data.get("style", "Blend")
            cap_label = style_data.get("cap", "Large")

            # ── 3×3 Style Box grid ────────────────────────────────────
            STYLE_LABELS = ["Value", "Blend", "Growth"]
            CAP_LABELS   = ["Large", "Mid", "Small"]

            rows_html = ""
            for r, cap_name in enumerate(CAP_LABELS):
                cap_r = 2 - r   # Large=2, Mid=1, Small=0
                cells = ""
                for c, style_name in enumerate(STYLE_LABELS):
                    is_active = (c == style_score and cap_r == cap_score)
                    if is_active:
                        cell_bg  = "rgba(99,102,241,0.6)"
                        cell_border = "2px solid #818cf8"
                        dot_html = (
                            f'<div style="width:18px;height:18px;border-radius:50%;'
                            f'background:#fff;opacity:0.95;"></div>'
                        )
                    else:
                        cell_bg = "rgba(255,255,255,0.04)"
                        cell_border = "1px solid rgba(255,255,255,0.07)"
                        dot_html = ""
                    cells += (
                        f'<td style="width:80px;height:80px;border:{cell_border};'
                        f'background:{cell_bg};text-align:center;vertical-align:middle;">'
                        f'{dot_html}</td>'
                    )
                rows_html += f"<tr>{cells}</tr>"

            # Column headers (style axis)
            header_cells = "".join(
                f'<th style="width:80px;text-align:center;font-size:10px;color:rgba(255,255,255,0.52);'
                f'font-weight:600;letter-spacing:0.5px;padding-bottom:6px;">{s}</th>'
                for s in STYLE_LABELS
            )

            # Row labels (cap axis)
            row_labels_html = ""
            for cap_name in CAP_LABELS:
                row_labels_html += (
                    f'<div style="height:80px;display:flex;align-items:center;justify-content:flex-end;'
                    f'font-size:10px;color:rgba(255,255,255,0.52);font-weight:600;'
                    f'letter-spacing:0.5px;padding-right:8px;">{cap_name}</div>'
                )

            # Render side-by-side: label column + grid
            _, sb_col, info_col = st.columns([1, 3, 3])

            with sb_col:
                st.markdown(f"""
<div style="display:flex;gap:0;">
  <!-- Cap labels -->
  <div style="display:flex;flex-direction:column;justify-content:space-around;
              margin-right:6px;margin-top:22px;">
    {row_labels_html}
  </div>
  <!-- Grid -->
  <div>
    <table style="border-collapse:collapse;">
      <thead><tr><th></th>{header_cells}</tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
    <div style="font-size:9px;color:rgba(255,255,255,0.28);text-align:center;
                margin-top:6px;letter-spacing:0.8px;">STYLE →</div>
  </div>
</div>
""", unsafe_allow_html=True)

            with info_col:
                # Active cell label
                st.markdown(
                    f'<div style="margin-bottom:14px;">'
                    f'<div style="font-size:10px;color:rgba(255,255,255,0.38);text-transform:uppercase;'
                    f'letter-spacing:1px;margin-bottom:4px;">Classification</div>'
                    f'<div style="font-size:26px;font-weight:700;color:rgba(255,255,255,0.92);">'
                    f'{cap_label} {style_label}</div>'
                    f'</div>',
                    unsafe_allow_html=True,
                )

                # Category from provider
                cat = style_data.get("category")
                if cat:
                    st.markdown(
                        f'<div style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);'
                        f'border-radius:8px;padding:8px 12px;margin-bottom:12px;">'
                        f'<div style="font-size:9px;color:rgba(255,255,255,0.38);text-transform:uppercase;'
                        f'letter-spacing:0.8px;margin-bottom:2px;">Provider Category</div>'
                        f'<div style="font-size:13px;color:rgba(255,255,255,0.82);">{cat}</div>'
                        f'</div>',
                        unsafe_allow_html=True,
                    )

                # Supporting data chips
                pe = style_data.get("pe")
                pb = style_data.get("pb")
                chips = []
                if pe:
                    chips.append(("P/E", f"{pe:.1f}x"))
                if pb:
                    chips.append(("P/B", f"{pb:.2f}x"))

                if chips:
                    chip_html = "".join(
                        f'<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);'
                        f'border-radius:8px;padding:8px 12px;margin-bottom:8px;">'
                        f'<div style="font-size:9px;color:rgba(255,255,255,0.35);text-transform:uppercase;'
                        f'letter-spacing:0.8px;">{lbl}</div>'
                        f'<div style="font-size:16px;font-weight:600;color:rgba(255,255,255,0.82);">{val}</div>'
                        f'</div>'
                        for lbl, val in chips
                    )
                    st.markdown(chip_html, unsafe_allow_html=True)

                # Style disclaimer
                st.markdown(
                    '<div style="font-size:9px;color:rgba(255,255,255,0.25);margin-top:12px;line-height:1.5;">'
                    'Classification inferred from valuation multiples and momentum signals. '
                    'For definitive style analysis, cross-reference with full holdings data.</div>',
                    unsafe_allow_html=True,
                )

        # -----------------------------------------------------------------
    # RIGHT PANEL: ALLOCATOR DECISION ENGINE
    # -----------------------------------------------------------------
    with right_col:
        st.markdown(
            '<div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(20,184,166,0.06)); '
            'border: 1px solid rgba(99,102,241,0.2); border-radius: 14px; padding: 18px 16px; '
            'margin-bottom: 18px;">'
            '<div style="font-size: 14px; font-weight: 800; color: rgba(255,255,255,0.88); '
            'text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px; '
            'background: linear-gradient(135deg, #818cf8, #14b8a6); -webkit-background-clip: text; '
            '-webkit-text-fill-color: transparent;">ALLOCATOR DECISION ENGINE</div>'
            '<div style="font-size: 10px; color: rgba(255,255,255,0.38); '
            'letter-spacing: 0.5px;">Portfolio-aware fund evaluation</div></div>',
            unsafe_allow_html=True,
        )

        # Check if portfolio is loaded
        portfolio_loaded = False
        portfolio_tickers = []
        portfolio_weights = {}

        if "portfolio_df" in st.session_state and st.session_state["portfolio_df"] is not None:
            try:
                port_df = st.session_state["portfolio_df"]
                if isinstance(port_df, pd.DataFrame) and not port_df.empty:
                    portfolio_loaded = True
                    # Extract tickers and weights
                    ticker_col = None
                    for candidate in ["Ticker", "ticker", "Symbol", "symbol", "Stock"]:
                        if candidate in port_df.columns:
                            ticker_col = candidate
                            break

                    weight_col = None
                    for candidate in ["Weight", "weight", "Portfolio Weight", "Allocation", "% of Portfolio"]:
                        if candidate in port_df.columns:
                            weight_col = candidate
                            break

                    if ticker_col:
                        portfolio_tickers = port_df[ticker_col].dropna().tolist()
                        if weight_col:
                            for _, row in port_df.iterrows():
                                t = row.get(ticker_col)
                                w = row.get(weight_col)
                                if t and w:
                                    try:
                                        portfolio_weights[str(t)] = float(w) / 100.0 if float(w) > 1.0 else float(w)
                                    except (ValueError, TypeError):
                                        pass
                        else:
                            # Equal weight fallback
                            n = len(portfolio_tickers)
                            portfolio_weights = {t: 1.0 / n for t in portfolio_tickers} if n > 0 else {}
            except Exception:
                portfolio_loaded = False

        if not portfolio_loaded:
            st.markdown(
                '<div style="background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); '
                'border-radius: 10px; padding: 20px; text-align: center;">'
                '<div style="font-size: 28px; margin-bottom: 8px; opacity: 0.5;">&#128274;</div>'
                '<div style="font-size: 12px; color: rgba(255,255,255,0.52); margin-bottom: 6px;">'
                'Portfolio Not Loaded</div>'
                '<div style="font-size: 10px; color: rgba(255,255,255,0.32); line-height: 1.5;">'
                'Load your portfolio via the Portfolio Hub to unlock the Allocator Decision Engine. '
                'It evaluates how this fund interacts with your existing holdings.</div></div>',
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                f'<div style="font-size: 10px; color: rgba(255,255,255,0.42); margin-bottom: 14px;">'
                f'Evaluating <span style="color: {_PRIMARY}; font-weight: 600;">{ticker_input}</span> '
                f'against {len(portfolio_tickers)} portfolio holdings</div>',
                unsafe_allow_html=True,
            )

            # ==========================================================
            # SCORE 1: Diversification Benefit Score
            # ==========================================================
            with st.spinner("Calculating diversification benefit..."):
                try:
                    div_result = fund_analytics.diversification_benefit_score(
                        ticker_input, portfolio_tickers, portfolio_weights,
                    )
                    div_score = div_result.get("score", 0)
                    div_interp = div_result.get("interpretation", "")
                    avg_corr = div_result.get("avg_correlation")

                    st.markdown(
                        '<div style="font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.62); '
                        'text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; '
                        'border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">'
                        '1. Diversification Benefit</div>',
                        unsafe_allow_html=True,
                    )
                    st.markdown(
                        _gauge_bar(div_score, "Score", 100, low_color=_RED, high_color=_GREEN),
                        unsafe_allow_html=True,
                    )
                    if avg_corr is not None:
                        st.markdown(
                            f'<div style="font-size: 10px; color: rgba(255,255,255,0.42); '
                            f'margin-bottom: 4px;">Avg Correlation: '
                            f'<span style="color: {_TEAL}; font-weight: 600;">{avg_corr:.2f}</span></div>',
                            unsafe_allow_html=True,
                        )
                    st.markdown(
                        f'<div style="background: rgba(255,255,255,0.02); border-radius: 8px; '
                        f'padding: 10px; margin-bottom: 16px;">'
                        f'<div style="font-size: 10px; color: rgba(255,255,255,0.48); '
                        f'line-height: 1.5;">{div_interp}</div></div>',
                        unsafe_allow_html=True,
                    )
                except Exception as e:
                    st.caption(f"Diversification analysis error: {e}")

            # ==========================================================
            # SCORE 2: Marginal Portfolio Improvement
            # ==========================================================
            with st.spinner("Calculating marginal improvement..."):
                try:
                    mi_result = fund_analytics.marginal_portfolio_improvement(
                        ticker_input, portfolio_tickers, portfolio_weights,
                    )
                    scenarios = mi_result.get("scenarios", [])
                    recommendation = mi_result.get("recommendation", "")

                    st.markdown(
                        '<div style="font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.62); '
                        'text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; '
                        'border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">'
                        '2. Marginal Portfolio Improvement</div>',
                        unsafe_allow_html=True,
                    )

                    if scenarios:
                        # Scenario table
                        rows_html = ""
                        for sc in scenarios:
                            sharpe_chg = sc.get("sharpe_change", 0)
                            chg_color = _GREEN if sharpe_chg > 0 else _RED
                            rows_html += (
                                f'<tr>'
                                f'<td style="padding: 5px 8px; color: rgba(255,255,255,0.62); font-size: 11px;">'
                                f'{sc.get("allocation_pct", "")}</td>'
                                f'<td style="padding: 5px 8px; color: rgba(255,255,255,0.52); font-size: 11px; text-align: right;">'
                                f'{sc.get("sharpe_before", 0):.3f}</td>'
                                f'<td style="padding: 5px 8px; color: rgba(255,255,255,0.52); font-size: 11px; text-align: right;">'
                                f'{sc.get("sharpe_after", 0):.3f}</td>'
                                f'<td style="padding: 5px 8px; color: {chg_color}; font-weight: 600; font-size: 11px; text-align: right;">'
                                f'{sharpe_chg:+.3f}</td></tr>'
                            )

                        st.markdown(
                            f'<div style="background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); '
                            f'border-radius: 8px; overflow: hidden; margin-bottom: 8px;">'
                            f'<table style="width: 100%; border-collapse: collapse;">'
                            f'<thead><tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">'
                            f'<th style="padding: 6px 8px; color: rgba(255,255,255,0.38); font-size: 9px; text-transform: uppercase; text-align: left;">Alloc</th>'
                            f'<th style="padding: 6px 8px; color: rgba(255,255,255,0.38); font-size: 9px; text-transform: uppercase; text-align: right;">Before</th>'
                            f'<th style="padding: 6px 8px; color: rgba(255,255,255,0.38); font-size: 9px; text-transform: uppercase; text-align: right;">After</th>'
                            f'<th style="padding: 6px 8px; color: rgba(255,255,255,0.38); font-size: 9px; text-transform: uppercase; text-align: right;">Change</th>'
                            f'</tr></thead><tbody>{rows_html}</tbody></table></div>',
                            unsafe_allow_html=True,
                        )

                    st.markdown(
                        f'<div style="background: rgba(255,255,255,0.02); border-radius: 8px; '
                        f'padding: 10px; margin-bottom: 16px;">'
                        f'<div style="font-size: 10px; color: rgba(255,255,255,0.48); '
                        f'line-height: 1.5;">{recommendation}</div></div>',
                        unsafe_allow_html=True,
                    )
                except Exception as e:
                    st.caption(f"Marginal improvement error: {e}")

            # ==========================================================
            # SCORE 3: Redundancy Score
            # ==========================================================
            with st.spinner("Calculating redundancy score..."):
                try:
                    red_result = fund_analytics.redundancy_score(
                        ticker_input, portfolio_tickers,
                    )
                    red_score = red_result.get("score", 0)
                    red_interp = red_result.get("interpretation", "")
                    most_similar = red_result.get("most_similar")

                    st.markdown(
                        '<div style="font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.62); '
                        'text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; '
                        'border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">'
                        '3. Redundancy Score</div>',
                        unsafe_allow_html=True,
                    )
                    # For redundancy: high is bad
                    st.markdown(
                        _gauge_bar(red_score, "Redundancy", 100, low_color=_GREEN, high_color=_RED),
                        unsafe_allow_html=True,
                    )

                    if most_similar:
                        sim_color = _RED if red_score >= 70 else _AMBER if red_score >= 40 else _GREEN
                        st.markdown(
                            f'<div style="font-size: 10px; color: rgba(255,255,255,0.42); '
                            f'margin-bottom: 4px;">Most Similar: '
                            f'<span style="color: {sim_color}; font-weight: 600;">{most_similar}</span> '
                            f'(r = {red_result.get("max_correlation", 0):.2f})</div>',
                            unsafe_allow_html=True,
                        )

                    st.markdown(
                        f'<div style="background: rgba(255,255,255,0.02); border-radius: 8px; '
                        f'padding: 10px; margin-bottom: 16px;">'
                        f'<div style="font-size: 10px; color: rgba(255,255,255,0.48); '
                        f'line-height: 1.5;">{red_interp}</div></div>',
                        unsafe_allow_html=True,
                    )
                except Exception as e:
                    st.caption(f"Redundancy analysis error: {e}")

            # ==========================================================
            # AGGREGATE VERDICT
            # ==========================================================
            try:
                # Only render if we got all three scores
                if portfolio_loaded:
                    all_scores_available = True
                    try:
                        _ = div_score  # noqa: F841
                        _ = red_score  # noqa: F841
                    except NameError:
                        all_scores_available = False

                    if all_scores_available:
                        # Simple composite: high diversification + low redundancy = good
                        composite = (div_score * 0.5) + ((100 - red_score) * 0.5)
                        if composite >= 65:
                            verdict = "STRONG ADD"
                            verdict_color = _GREEN
                            verdict_desc = "This fund offers meaningful diversification with low overlap."
                        elif composite >= 40:
                            verdict = "CONSIDER"
                            verdict_color = _AMBER
                            verdict_desc = "Moderate benefit. Evaluate sizing carefully."
                        else:
                            verdict = "PASS"
                            verdict_color = _RED
                            verdict_desc = "High redundancy or limited diversification benefit."

                        st.markdown(
                            f'<div style="background: rgba(255,255,255,0.035); '
                            f'border: 1px solid {verdict_color}33; border-radius: 12px; '
                            f'padding: 18px; text-align: center; margin-top: 8px;">'
                            f'<div style="font-size: 10px; color: rgba(255,255,255,0.42); '
                            f'text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">'
                            f'Aggregate Verdict</div>'
                            f'<div style="font-size: 22px; font-weight: 800; color: {verdict_color}; '
                            f'margin-bottom: 6px;">{verdict}</div>'
                            f'<div style="font-size: 10px; color: rgba(255,255,255,0.42); '
                            f'line-height: 1.5;">{verdict_desc}</div></div>',
                            unsafe_allow_html=True,
                        )
            except Exception:
                pass
