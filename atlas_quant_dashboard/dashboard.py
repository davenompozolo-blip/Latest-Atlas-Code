"""
ATLAS Terminal — Unified Quantitative Dashboard
Phase 1: Merged Performance + Risk with new structural analytics layer.
UI Architecture:
  - Portfolio Health Panel (always visible)
  - Summary View / Deep Dive toggle
  - Six analytical modules
  - Quant Flags Engine (prescriptive layer)
"""
import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from atlas_quant_dashboard.data.sample_data import generate_sample_portfolio
from atlas_quant_dashboard.analytics import performance_metrics as pm
from atlas_quant_dashboard.analytics import risk_metrics as rm
from atlas_quant_dashboard.analytics import structure_metrics as sm
from atlas_quant_dashboard.analytics import statistical_metrics as stm
from atlas_quant_dashboard.analytics.quant_flags import (
    QuantFlagsEngine, portfolio_health_score, FlagSeverity
)
# ─── THEME ────────────────────────────────────────────────────────────────────
ATLAS_DARK = "#0A0E1A"
ATLAS_SURFACE = "#111827"
ATLAS_CARD = "#161D2E"
ATLAS_BORDER = "#1E2D45"
ATLAS_ACCENT = "#2563EB"
ATLAS_ACCENT2 = "#0EA5E9"
ATLAS_TEXT = "#E2E8F0"
ATLAS_MUTED = "#64748B"
ATLAS_UP = "#10B981"
ATLAS_DOWN = "#EF4444"
ATLAS_WARN = "#F59E0B"
ATLAS_GRID = "rgba(255,255,255,0.04)"
PLOTLY_LAYOUT = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(family="'IBM Plex Mono', monospace", color=ATLAS_TEXT, size=11),
    margin=dict(l=16, r=16, t=32, b=16),
    xaxis=dict(
        gridcolor=ATLAS_GRID, zeroline=False,
        linecolor=ATLAS_BORDER, tickcolor=ATLAS_MUTED,
    ),
    yaxis=dict(
        gridcolor=ATLAS_GRID, zeroline=False,
        linecolor=ATLAS_BORDER, tickcolor=ATLAS_MUTED,
    ),
    legend=dict(bgcolor="rgba(0,0,0,0)", font=dict(size=10)),
    hovermode="x unified",
)
# ─── PAGE CONFIG ──────────────────────────────────────────────────────────────
# Removed: st.set_page_config was running at module-import time and collapsing
# the sidebar when ATLAS navigated to this page. atlas_app.py owns page config.

# ─── QUANT DASHBOARD CSS ─────────────────────────────────────────────────────
# Injected inside main() to avoid module-level side effects during import.
# Only styles specific to the quant dashboard — does NOT override ATLAS shell.
_QUANT_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

/* Health Panel */
.health-panel {
  background: linear-gradient(135deg, #111827 0%, #0f172a 100%);
  border: 1px solid #1E2D45;
  border-radius: 8px;
  padding: 16px 24px;
  margin-bottom: 20px;
}
/* Module cards */
.module-card {
  background: #161D2E;
  border: 1px solid #1E2D45;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}
.module-header {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: #64748B;
  border-bottom: 1px solid #1E2D45;
  padding-bottom: 10px;
  margin-bottom: 16px;
}
/* Divider */
.section-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, #1E2D45, transparent);
  margin: 24px 0;
}

/* ── Radio toggle → gradient pill buttons (matches Market Watch pattern) ── */
/* Hide radio circles and SVG indicators */
div[data-testid="stRadio"] input[type="radio"] {
    position: absolute !important;
    opacity: 0 !important;
    pointer-events: none !important;
    width: 0 !important;
    height: 0 !important;
}
div[data-testid="stRadio"] > div > label > div:first-child {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
    position: absolute !important;
    left: -9999px !important;
}
div[data-testid="stRadio"] svg {
    display: none !important;
}
div[data-testid="stRadio"] [class*="circle"],
div[data-testid="stRadio"] [class*="radio"],
div[data-testid="stRadio"] [class*="indicator"] {
    display: none !important;
}
/* Layout */
div[data-testid="stRadio"] > div {
    flex-direction: row !important;
    gap: 0.75rem !important;
}
div[data-testid="stRadio"] > label {
    display: none !important;
}
/* Gradient button styling */
div[data-testid="stRadio"] > div > label {
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%) !important;
    padding: 0.75rem 1.5rem !important;
    border-radius: 0.5rem !important;
    cursor: pointer !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    border: 1px solid rgba(59, 130, 246, 0.2) !important;
    backdrop-filter: blur(10px) !important;
    color: #e2e8f0 !important;
    font-weight: 500 !important;
    font-size: 0.875rem !important;
    user-select: none !important;
}
div[data-testid="stRadio"] > div > label:hover {
    background: linear-gradient(135deg, rgba(51, 65, 85, 0.9) 0%, rgba(30, 41, 59, 0.95) 100%) !important;
    border-color: rgba(59, 130, 246, 0.5) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2) !important;
}
div[data-testid="stRadio"] > div > label:has(input:checked) {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
    border-color: #3b82f6 !important;
    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4) !important;
    transform: translateY(-2px) !important;
    color: white !important;
}
div[data-testid="stRadio"] > div > label > div {
    color: inherit !important;
}
div[data-testid="stRadio"] > div > label > div:last-child {
    display: flex !important;
    visibility: visible !important;
    opacity: 1 !important;
}
/* Table styling */
.stDataFrame { border: 1px solid var(--border); border-radius: 6px; }
/* Scrollbar */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
</style>
"""
# ─── DATA LOADING ─────────────────────────────────────────────────────────────
@st.cache_data(ttl=300, show_spinner=False)
def load_sample_portfolio_data():
    return generate_sample_portfolio()

def load_portfolio_data(use_live: bool = False):
    """Load portfolio data — live from Alpaca or sample."""
    if use_live:
        try:
            from atlas_quant_dashboard.data.alpaca_adapter import load_alpaca_portfolio_data
            data = load_alpaca_portfolio_data()
            if data is not None:
                st.session_state['_quant_data_source_active'] = 'live'
                return data
        except Exception as e:
            print(f"[ATLAS] Live data unavailable, falling back to sample: {e}")
            st.session_state['_quant_data_source_active'] = 'sample_fallback'
    st.session_state['_quant_data_source_active'] = 'sample'
    return load_sample_portfolio_data()
@st.cache_data(ttl=300, show_spinner=False)
def compute_all_metrics(port_ret_values, bench_ret_values, asset_ret_values,
                         weights_values, _dates, asset_cols):
    """Orchestration layer — computes and caches all metrics."""
    portfolio_returns = pd.Series(port_ret_values, index=_dates)
    benchmark_returns = pd.Series(bench_ret_values, index=_dates)
    asset_returns = pd.DataFrame(asset_ret_values, index=_dates, columns=asset_cols)
    weights = pd.Series(weights_values, index=asset_cols)
    results = {}
    # ── Performance metrics
    results["ann_return"] = pm.annualise_return(portfolio_returns)
    results["ann_vol"] = pm.annualise_volatility(portfolio_returns)
    results["sharpe"] = pm.sharpe_ratio(portfolio_returns)
    results["sortino"] = pm.sortino_ratio(portfolio_returns)
    results["calmar"] = pm.calmar_ratio(portfolio_returns)
    results["tracking_error"] = pm.tracking_error(portfolio_returns, benchmark_returns)
    results["ir"] = pm.information_ratio(portfolio_returns, benchmark_returns)
    results["up_capture"], results["down_capture"] = pm.capture_ratios(portfolio_returns, benchmark_returns)
    results["convexity"] = pm.convexity_score(portfolio_returns, benchmark_returns)
    results["cum_returns"] = pm.cumulative_return(portfolio_returns)
    results["bench_cum_returns"] = pm.cumulative_return(benchmark_returns)
    results["calendar_returns"] = pm.calendar_returns(portfolio_returns)
    results["return_contribution"] = pm.return_contribution(asset_returns, weights)
    # Rolling
    for w in [21, 63, 126, 252]:
        results[f"rolling_sharpe_{w}"] = pm.rolling_sharpe(portfolio_returns, w)
        results[f"rolling_vol_{w}"] = pm.rolling_volatility(portfolio_returns, w)
        results[f"rolling_returns_{w}"] = pm.rolling_returns(portfolio_returns, w)
    results["rolling_beta"] = pm.rolling_beta(portfolio_returns, benchmark_returns, 63)
    results["drawdown_series"] = pm.drawdown_series(portfolio_returns)
    # ── Drawdown anatomy
    results["drawdown_anatomy"] = pm.drawdown_anatomy(portfolio_returns)
    results["max_drawdown"] = pm.max_drawdown(portfolio_returns)
    # ── Risk metrics
    try:
        cov = rm.covariance_matrix(asset_returns, method="sample")
        w_arr = weights.reindex(cov.columns).fillna(0).values
        results["risk_budget"] = rm.risk_budget(w_arr, cov.values, list(cov.columns))
        results["port_vol_wts"] = rm.portfolio_volatility(w_arr, cov.values)
    except Exception:
        results["risk_budget"] = None
        results["port_vol_wts"] = results["ann_vol"]
    results["vol_decomp"] = rm.systematic_vs_idiosyncratic_vol(portfolio_returns, benchmark_returns)
    results["tail_risk"] = rm.tail_risk_summary(portfolio_returns)
    # ── Structure metrics
    corr_matrix = rm.correlation_matrix(asset_returns)
    results["corr_matrix"] = corr_matrix
    results["concentration"] = sm.concentration_metrics(weights)
    results["enb_corr_adjusted"] = sm.effective_number_of_bets(weights, corr_matrix)
    redundancy = sm.redundancy_pairs(weights, corr_matrix)
    results["redundancy"] = redundancy
    try:
        ordered = sm.hierarchical_cluster_order(corr_matrix)
        results["corr_ordered"] = corr_matrix.loc[ordered, ordered]
    except Exception:
        results["corr_ordered"] = corr_matrix
    try:
        results["pca_clusters"] = sm.pca_factor_clusters(asset_returns, n_components=3)
    except Exception:
        results["pca_clusters"] = None
    # ── Statistical diagnostics
    results["return_moments"] = stm.return_moments(portfolio_returns)
    results["normality"] = stm.normality_test(portfolio_returns)
    results["dist_fit"] = stm.distribution_fit(portfolio_returns)
    results["autocorr"] = stm.first_order_autocorrelation(portfolio_returns)
    results["autocorr_structure"] = stm.autocorrelation_structure(portfolio_returns)
    results["hurst"] = stm.hurst_exponent(portfolio_returns)
    results["sharpe_stability"] = stm.rolling_sharpe_stability(portfolio_returns, window=63)
    results["rsi_data"] = stm.regime_sensitivity_index(portfolio_returns)
    # ── Health score
    dd_anat = results["drawdown_anatomy"]
    hs = portfolio_health_score(
        enb=results["enb_corr_adjusted"],
        n_positions=results["concentration"]["n_positions"],
        sharpe_stability_breach_rate=results["sharpe_stability"]["breach_rate"],
        rolling_sharpe_current=float(results["rolling_sharpe_63"].dropna().iloc[-1]) if results["rolling_sharpe_63"].dropna().any() else 0,
        max_drawdown=results["max_drawdown"],
        avg_drawdown_duration=float(dd_anat["avg_duration_days"]),
        excess_kurtosis=results["return_moments"]["excess_kurtosis"],
        normality_rejected=not results["normality"]["normal"],
        rsi=results["rsi_data"]["rsi"] or 0.0,
    )
    results["health_score"] = hs
    # ── Quant flags
    flags_engine = QuantFlagsEngine()
    rolling_s63 = results["rolling_sharpe_63"].dropna()
    flags = flags_engine.evaluate(
        enb_current=results["enb_corr_adjusted"],
        enb_prior_60d=results["concentration"]["enb_naive"] * 1.1,
        top5_risk_share=(
            float(results["risk_budget"]["risk_share"].head(5).sum())
            if results["risk_budget"] is not None else 0.4
        ),
        rolling_sharpe_series=rolling_s63,
        current_sharpe=float(rolling_s63.iloc[-1]) if len(rolling_s63) > 0 else 0,
        mean_sharpe=results["sharpe_stability"]["mean_sharpe"],
        std_sharpe=results["sharpe_stability"]["std_sharpe"],
        rho_lag1=results["autocorr"]["rho_lag1"],
        autocorr_pval=results["autocorr"]["p_value"],
        n_obs=results["return_moments"]["n_observations"],
        es_ratio=results["tail_risk"]["es_ratio_95"],
        excess_kurtosis=results["return_moments"]["excess_kurtosis"],
        normality_rejected=not results["normality"]["normal"],
        redundancy_df=results["redundancy"],
        rsi=results["rsi_data"]["rsi"] or 0.0,
    )
    results["quant_flags"] = flags
    return results
# ─── CHART HELPERS ────────────────────────────────────────────────────────────
def apply_layout(fig, height=280, **kwargs):
    layout = {**PLOTLY_LAYOUT, "height": height, **kwargs}
    fig.update_layout(**layout)
    return fig
def color_for_value(val: float, positive_good: bool = True) -> str:
    if val > 0:
        return ATLAS_UP if positive_good else ATLAS_DOWN
    elif val < 0:
        return ATLAS_DOWN if positive_good else ATLAS_UP
    return ATLAS_MUTED
def fmt_pct(val: float, decimals: int = 1) -> str:
    return f"{val * 100:+.{decimals}f}%"
def fmt_num(val: float, decimals: int = 2) -> str:
    return f"{val:.{decimals}f}"
# ─── COMPONENT: HEALTH PANEL ──────────────────────────────────────────────────
def render_health_panel(hs: dict, flags: list):
    total = hs["total"]
    grade = hs["grade"]
    subs = hs["sub_scores"]
    grade_color = (
        ATLAS_UP if grade in ("A", "B") else
        ATLAS_WARN if grade == "C" else
        ATLAS_DOWN
    )
    alert_count = sum(1 for f in flags if f.severity == FlagSeverity.ALERT)
    watch_count = sum(1 for f in flags if f.severity == FlagSeverity.WATCH)

    # Build flag status text
    flag_parts = []
    if alert_count > 0:
        flag_parts.append(f'<span style="color:{ATLAS_DOWN};">&#9888; {alert_count} ALERT</span>')
    if watch_count > 0:
        flag_parts.append(f'<span style="color:{ATLAS_WARN};">&#9679; {watch_count} WATCH</span>')
    if not flags:
        flag_parts.append(f'<span style="color:{ATLAS_UP};">&#10003; NO ANOMALIES</span>')
    flag_html = "&nbsp;&nbsp;".join(flag_parts)

    # Row 1: Score + Grade + Flag status
    score_col, flag_col = st.columns([3, 1])
    with score_col:
        st.markdown(
            f'<div style="display:flex;align-items:center;gap:16px;">'
            f'<div>'
            f'<div style="font-family:IBM Plex Mono,monospace;font-size:48px;font-weight:600;'
            f'line-height:1;color:{grade_color};letter-spacing:-2px;">{total:.0f}</div>'
            f'<div style="font-size:10px;letter-spacing:2px;color:{ATLAS_MUTED};margin-top:2px;">HEALTH SCORE</div>'
            f'</div>'
            f'<div style="width:48px;height:48px;border-radius:50%;border:3px solid {grade_color};'
            f'display:flex;align-items:center;justify-content:center;'
            f'font-family:IBM Plex Mono,monospace;font-size:18px;font-weight:600;color:{grade_color};">'
            f'{grade}</div>'
            f'</div>',
            unsafe_allow_html=True,
        )
    with flag_col:
        st.markdown(
            f'<div style="text-align:right;padding-top:8px;">'
            f'<div style="font-size:9px;letter-spacing:2px;color:{ATLAS_MUTED};margin-bottom:6px;">ACTIVE FLAGS</div>'
            f'<div style="font-family:IBM Plex Mono,monospace;font-size:11px;">{flag_html}</div>'
            f'</div>',
            unsafe_allow_html=True,
        )

    # Row 2: Sub-score cards — each in its own st.column with its own st.markdown
    sub_labels = {
        "diversification": "DIVERSIFICATION",
        "risk_efficiency": "RISK EFFICIENCY",
        "drawdown_resilience": "DD RESILIENCE",
        "statistical_integrity": "STAT INTEGRITY",
        "regime_consistency": "REGIME CONSIST.",
    }
    sub_cols = st.columns(len(sub_labels))
    for col, (key, label) in zip(sub_cols, sub_labels.items()):
        val = subs.get(key, 0)
        bar_pct = val / 20 * 100
        bar_color = ATLAS_UP if val >= 15 else ATLAS_WARN if val >= 10 else ATLAS_DOWN
        with col:
            st.markdown(
                f'<div style="background:rgba(255,255,255,0.03);border:1px solid {ATLAS_BORDER};'
                f'border-radius:6px;padding:10px 12px;text-align:center;">'
                f'<div style="font-family:IBM Plex Mono,monospace;font-size:20px;font-weight:600;color:{bar_color};">'
                f'{val:.0f}<span style="font-size:12px;color:{ATLAS_MUTED};">/20</span></div>'
                f'<div style="font-size:9px;letter-spacing:1.5px;color:{ATLAS_MUTED};margin-top:4px;">{label}</div>'
                f'<div style="height:2px;background:rgba(255,255,255,0.08);border-radius:1px;margin-top:7px;">'
                f'<div style="height:100%;width:{bar_pct:.0f}%;background:{bar_color};border-radius:1px;"></div>'
                f'</div></div>',
                unsafe_allow_html=True,
            )
# ─── COMPONENT: METRIC TILE ───────────────────────────────────────────────────
def metric_tile(label: str, value: str, delta: str = None, delta_positive: bool = True, width: int = 1):
    delta_html = ""
    if delta:
        delta_color = ATLAS_UP if delta_positive else ATLAS_DOWN
        delta_html = f'<div style="font-family:IBM Plex Mono,monospace; font-size:11px; color:{delta_color}; margin-top:3px;">{delta}</div>'
    return f"""
    <div style="background:rgba(37,99,235,0.06); border:1px solid rgba(37,99,235,0.18);
                border-radius:6px; padding:14px 18px;">
      <div style="font-size:10px; letter-spacing:1.5px; text-transform:uppercase;
                  color:{ATLAS_MUTED}; margin-bottom:6px;">{label}</div>
      <div style="font-family:IBM Plex Mono,monospace; font-size:26px; font-weight:600;
                  line-height:1.1; color:{ATLAS_TEXT};">{value}</div>
      {delta_html}
    </div>"""
def render_metric_row(metrics: list):
    """metrics: list of dicts with label, value, delta, delta_positive"""
    cols = st.columns(len(metrics))
    for col, m in zip(cols, metrics):
        with col:
            st.markdown(metric_tile(**m), unsafe_allow_html=True)
# ─── MODULE: PERFORMANCE INTELLIGENCE ────────────────────────────────────────
def render_performance_module(m: dict, window: int):
    st.markdown('<div class="module-header">▸ PERFORMANCE INTELLIGENCE</div>', unsafe_allow_html=True)
    # Top metrics row
    render_metric_row([
        {"label": "Ann. Return", "value": fmt_pct(m["ann_return"]),
         "delta": None, "delta_positive": m["ann_return"] > 0},
        {"label": "Ann. Volatility", "value": fmt_pct(m["ann_vol"])},
        {"label": "Sharpe Ratio", "value": fmt_num(m["sharpe"]),
         "delta_positive": m["sharpe"] > 0},
        {"label": "Sortino Ratio", "value": fmt_num(m["sortino"]),
         "delta_positive": m["sortino"] > 0},
        {"label": "Information Ratio", "value": fmt_num(m["ir"]),
         "delta_positive": m["ir"] > 0},
        {"label": "Return Convexity", "value": fmt_num(m["convexity"]) + "×",
         "delta_positive": m["convexity"] > 1.0},
    ])
    st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)
    # Cumulative return chart
    col1, col2 = st.columns([2, 1])
    with col1:
        st.markdown('<div style="font-size:10px; letter-spacing:1.5px; color:#64748B; margin-bottom:8px;">CUMULATIVE RETURN INDEX</div>', unsafe_allow_html=True)
        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=m["cum_returns"].index, y=m["cum_returns"].values,
            name="Portfolio", line=dict(color=ATLAS_ACCENT2, width=2),
            fill="tozeroy", fillcolor="rgba(14,165,233,0.06)",
        ))
        fig.add_trace(go.Scatter(
            x=m["bench_cum_returns"].index, y=m["bench_cum_returns"].values,
            name="Benchmark", line=dict(color=ATLAS_MUTED, width=1.5, dash="dot"),
        ))
        apply_layout(fig, height=260)
        fig.update_layout(yaxis_title="Index (base 1.0)")
        st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
    with col2:
        st.markdown('<div style="font-size:10px; letter-spacing:1.5px; color:#64748B; margin-bottom:8px;">CAPTURE RATIOS</div>', unsafe_allow_html=True)
        fig2 = go.Figure()
        categories = ["Up Capture", "Down Capture"]
        values = [m["up_capture"] * 100, m["down_capture"] * 100]
        colors = [ATLAS_UP if values[0] >= 100 else ATLAS_DOWN, ATLAS_UP if values[1] <= 100 else ATLAS_DOWN]
        fig2.add_trace(go.Bar(
            x=categories, y=values,
            marker_color=colors,
            text=[f"{v:.1f}%" for v in values],
            textposition="outside",
            textfont=dict(family="IBM Plex Mono", size=12),
        ))
        fig2.add_hline(y=100, line_dash="dot", line_color=ATLAS_MUTED, line_width=1)
        apply_layout(fig2, height=260)
        fig2.update_layout(yaxis_title="% of Benchmark", showlegend=False)
        st.plotly_chart(fig2, use_container_width=True, config={"displayModeBar": False})
    # Drawdown + Rolling Sharpe
    col3, col4 = st.columns(2)
    with col3:
        st.markdown('<div style="font-size:10px; letter-spacing:1.5px; color:#64748B; margin-bottom:8px;">DRAWDOWN SERIES</div>', unsafe_allow_html=True)
        dd = m["drawdown_series"]
        fig3 = go.Figure()
        fig3.add_trace(go.Scatter(
            x=dd.index, y=dd.values * 100,
            name="Drawdown %",
            fill="tozeroy", fillcolor="rgba(239,68,68,0.15)",
            line=dict(color=ATLAS_DOWN, width=1.5),
        ))
        apply_layout(fig3, height=220)
        fig3.update_layout(yaxis_title="Drawdown %", showlegend=False)
        st.plotly_chart(fig3, use_container_width=True, config={"displayModeBar": False})
    with col4:
        st.markdown(f'<div style="font-size:10px; letter-spacing:1.5px; color:#64748B; margin-bottom:8px;">ROLLING {window}D SHARPE + STABILITY BAND</div>', unsafe_allow_html=True)
        rs_key = f"rolling_sharpe_{window}"
        rs = m.get(rs_key, m["rolling_sharpe_63"]).dropna()
        stab = m["sharpe_stability"]
        fig4 = go.Figure()
        fig4.add_traces([
            go.Scatter(x=rs.index, y=[stab["upper_band"]] * len(rs),
                      name="Upper Band", line=dict(color=ATLAS_MUTED, width=1, dash="dash"), showlegend=False),
            go.Scatter(x=rs.index, y=[stab["lower_band"]] * len(rs),
                      name="Lower Band", fill="tonexty",
                      fillcolor="rgba(100,116,139,0.06)",
                      line=dict(color=ATLAS_MUTED, width=1, dash="dash"), showlegend=False),
            go.Scatter(x=rs.index, y=rs.values, name="Rolling Sharpe",
                      line=dict(color=ATLAS_ACCENT, width=2)),
            go.Scatter(x=rs.index, y=[stab["mean_sharpe"]] * len(rs),
                      name="Historical Mean",
                      line=dict(color=ATLAS_MUTED, width=1, dash="dot")),
        ])
        apply_layout(fig4, height=220)
        fig4.update_layout(yaxis_title="Sharpe")
        st.plotly_chart(fig4, use_container_width=True, config={"displayModeBar": False})
    # Drawdown anatomy summary
    with st.expander("▸ Drawdown Anatomy"):
        da = m["drawdown_anatomy"]
        render_metric_row([
            {"label": "Max Drawdown", "value": fmt_pct(da["max_drawdown"]),
             "delta_positive": False},
            {"label": "Avg Drawdown", "value": fmt_pct(da["avg_drawdown"]),
             "delta_positive": False},
            {"label": "Max Duration", "value": f"{da['max_duration_days']}d"},
            {"label": "Avg Duration", "value": f"{da['avg_duration_days']}d"},
            {"label": "Drawdowns/Year", "value": fmt_num(da["drawdown_frequency_per_year"], 1)},
        ])
    # Contribution waterfall
    with st.expander("▸ Return Attribution by Position"):
        contrib = m["return_contribution"].sort_values(ascending=False)
        colors_bar = [ATLAS_UP if v >= 0 else ATLAS_DOWN for v in contrib.values]
        fig5 = go.Figure(go.Bar(
            x=contrib.index,
            y=contrib.values * 100,
            marker_color=colors_bar,
            text=[f"{v*100:+.2f}%" for v in contrib.values],
            textposition="outside",
            textfont=dict(family="IBM Plex Mono", size=10),
        ))
        apply_layout(fig5, height=240)
        fig5.update_layout(yaxis_title="Contribution (%)", showlegend=False)
        st.plotly_chart(fig5, use_container_width=True, config={"displayModeBar": False})
# ─── MODULE: RISK ARCHITECTURE ────────────────────────────────────────────────
def render_risk_module(m: dict):
    st.markdown('<div class="module-header">▸ RISK ARCHITECTURE</div>', unsafe_allow_html=True)
    tr = m["tail_risk"]
    vd = m["vol_decomp"]
    render_metric_row([
        {"label": "Ann. Volatility", "value": fmt_pct(m["ann_vol"])},
        {"label": "Tracking Error", "value": fmt_pct(m["tracking_error"])},
        {"label": "VaR 95% (1D)", "value": fmt_pct(tr["var_95_1d"]), "delta_positive": False},
        {"label": "CVaR 95% (1D)", "value": fmt_pct(tr["cvar_95_1d"]), "delta_positive": False},
        {"label": "ES Ratio", "value": fmt_num(tr["es_ratio_95"]) + "×",
         "delta_positive": tr["es_ratio_95"] < 1.4},
        {"label": "Max Drawdown", "value": fmt_pct(m["max_drawdown"]), "delta_positive": False},
    ])
    st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)
    col1, col2 = st.columns(2)
    with col1:
        st.markdown('<div style="font-size:10px; letter-spacing:1.5px; color:#64748B; margin-bottom:8px;">RISK BUDGET (MCTR-BASED)</div>', unsafe_allow_html=True)
        if m["risk_budget"] is not None:
            rb = m["risk_budget"].head(12)
            colors_rb = [ATLAS_ACCENT2 if v <= 0.12 else ATLAS_WARN if v <= 0.20 else ATLAS_DOWN
                        for v in rb["risk_share"].values]
            fig = go.Figure(go.Bar(
                y=rb.index, x=rb["risk_share"].values * 100,
                orientation='h',
                marker_color=colors_rb,
                text=[f"{v*100:.1f}%" for v in rb["risk_share"].values],
                textposition="outside",
                textfont=dict(family="IBM Plex Mono", size=10),
            ))
            apply_layout(fig, height=300)
            fig.update_layout(xaxis_title="% of Portfolio Risk Budget", showlegend=False,
                             yaxis=dict(autorange="reversed", **PLOTLY_LAYOUT["yaxis"]))
            st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
    with col2:
        st.markdown('<div style="font-size:10px; letter-spacing:1.5px; color:#64748B; margin-bottom:8px;">VOL DECOMPOSITION — SYSTEMATIC vs IDIOSYNCRATIC</div>', unsafe_allow_html=True)
        fig2 = go.Figure(go.Pie(
            labels=["Systematic", "Idiosyncratic"],
            values=[vd["systematic_share"] * 100, vd["idiosyncratic_share"] * 100],
            marker=dict(colors=[ATLAS_ACCENT, ATLAS_ACCENT2]),
            textfont=dict(family="IBM Plex Mono", size=11),
            hole=0.55,
        ))
        apply_layout(fig2, height=300)
        fig2.update_traces(textinfo="label+percent")
        st.plotly_chart(fig2, use_container_width=True, config={"displayModeBar": False})
        st.markdown(f"""
        <div style="font-family:'IBM Plex Mono',monospace; font-size:11px; color:{ATLAS_MUTED}; text-align:center; margin-top:4px;">
        β = {vd['beta']:.3f} &nbsp;|&nbsp; R² = {vd['r_squared']:.3f}
        </div>""", unsafe_allow_html=True)
    with st.expander("▸ Rolling Beta Stability"):
        rb_series = m["rolling_beta"].dropna()
        fig3 = go.Figure(go.Scatter(
            x=rb_series.index, y=rb_series.values,
            line=dict(color=ATLAS_ACCENT, width=2),
        ))
        fig3.add_hline(y=1.0, line_dash="dot", line_color=ATLAS_MUTED, line_width=1, annotation_text="β=1.0")
        apply_layout(fig3, height=220)
        fig3.update_layout(yaxis_title="Rolling 63D Beta", showlegend=False)
        st.plotly_chart(fig3, use_container_width=True, config={"displayModeBar": False})
# ─── MODULE: PORTFOLIO STRUCTURE ──────────────────────────────────────────────
def render_structure_module(m: dict):
    st.markdown('<div class="module-header">▸ PORTFOLIO STRUCTURE ENGINE</div>', unsafe_allow_html=True)
    conc = m["concentration"]
    enb_adj = m["enb_corr_adjusted"]
    render_metric_row([
        {"label": "No. of Positions", "value": str(conc["n_positions"])},
        {"label": "Naive ENB (HHI⁻¹)", "value": fmt_num(conc["enb_naive"])},
        {"label": "Correlation-Adj ENB", "value": fmt_num(enb_adj),
         "delta_positive": enb_adj > conc["enb_naive"] * 0.7},
        {"label": "HHI Score", "value": fmt_num(conc["hhi"], 4),
         "delta_positive": conc["hhi"] < 0.10},
        {"label": "Top 5 Weight", "value": f"{conc['top_5_pct']:.1f}%"},
        {"label": "Top 10 Weight", "value": f"{conc['top_10_pct']:.1f}%"},
    ])
    st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)
    col1, col2 = st.columns([1, 1])
    with col1:
        st.markdown('<div style="font-size:10px; letter-spacing:1.5px; color:#64748B; margin-bottom:8px;">CORRELATION HEATMAP (HIERARCHICAL ORDER)</div>', unsafe_allow_html=True)
        corr_ordered = m["corr_ordered"]
        fig = go.Figure(go.Heatmap(
            z=corr_ordered.values,
            x=corr_ordered.columns.tolist(),
            y=corr_ordered.index.tolist(),
            colorscale=[[0, ATLAS_SURFACE], [0.5, ATLAS_ACCENT], [1, ATLAS_ACCENT2]],
            zmin=-1, zmax=1,
            text=np.round(corr_ordered.values, 2),
            texttemplate="%{text:.1f}",
            textfont=dict(size=8),
            showscale=True,
            colorbar=dict(tickfont=dict(family="IBM Plex Mono", size=9)),
        ))
        apply_layout(fig, height=340)
        fig.update_layout(
            xaxis=dict(tickangle=-45, tickfont=dict(size=9), **PLOTLY_LAYOUT["xaxis"]),
            yaxis=dict(tickfont=dict(size=9), **PLOTLY_LAYOUT["yaxis"]),
        )
        st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
    with col2:
        st.markdown('<div style="font-size:10px; letter-spacing:1.5px; color:#64748B; margin-bottom:8px;">REDUNDANT POSITION PAIRS (ρ ≥ 0.75)</div>', unsafe_allow_html=True)
        red = m["redundancy"]
        if not red.empty:
            display_cols = ["asset_1", "asset_2", "correlation", "combined_weight", "redundancy_score"]
            st.dataframe(
                red[display_cols].head(10).style
                    .background_gradient(subset=["correlation"], cmap="RdYlGn_r")
                    .format({"correlation": "{:.3f}", "combined_weight": "{:.1f}%",
                            "redundancy_score": "{:.4f}"}),
                use_container_width=True,
                height=340,
            )
        else:
            st.markdown(
                f'<div style="color:{ATLAS_UP}; font-size:12px; padding:40px 0; text-align:center;">'
                f'✓ No significant redundant pairs detected at ρ ≥ 0.75 threshold.</div>',
                unsafe_allow_html=True
            )
    # PCA clusters
    with st.expander("▸ Hidden Factor Clustering (PCA)"):
        pca = m.get("pca_clusters")
        if pca:
            col_a, col_b = st.columns([1, 2])
            with col_a:
                for i, (pc_name, pc_data) in enumerate(pca["loadings"].items()):
                    ev = pc_data["explained_variance"] * 100
                    st.markdown(f"""
                    <div style="margin-bottom:12px;">
                      <div style="font-family:IBM Plex Mono,monospace; font-size:11px; color:{ATLAS_ACCENT2};">
                        {pc_name} — {ev:.1f}% variance explained
                      </div>
                      <div style="font-size:10px; color:{ATLAS_MUTED};">
                        Top: {', '.join(list(pc_data['top_positive'].keys())[:3])}
                      </div>
                    </div>""", unsafe_allow_html=True)
            with col_b:
                fig_pca = go.Figure()
                colors_pca = [ATLAS_ACCENT, ATLAS_ACCENT2, ATLAS_WARN]
                for i, (pc_name, pc_data) in enumerate(pca["loadings"].items()):
                    loadings_s = pd.Series(pc_data["loadings"]).sort_values()
                    fig_pca.add_trace(go.Bar(
                        x=loadings_s.values,
                        y=loadings_s.index,
                        name=pc_name,
                        orientation='h',
                        marker_color=colors_pca[i % len(colors_pca)],
                        visible=(i == 0),
                    ))
                buttons = [
                    dict(label=f"PC{i+1}", method="update",
                         args=[{"visible": [j == i for j in range(len(pca["loadings"]))]}])
                    for i in range(len(pca["loadings"]))
                ]
                apply_layout(fig_pca, height=280)
                fig_pca.update_layout(
                    updatemenus=[dict(buttons=buttons, direction="left", x=0, y=1.1,
                                     bgcolor=ATLAS_SURFACE, bordercolor=ATLAS_BORDER,
                                     font=dict(family="IBM Plex Mono", size=10, color=ATLAS_TEXT))],
                    xaxis_title="Factor Loading",
                    showlegend=False,
                )
                st.plotly_chart(fig_pca, use_container_width=True, config={"displayModeBar": False})
# ─── MODULE: STATISTICAL DIAGNOSTICS ─────────────────────────────────────────
def render_statistical_module(m: dict):
    st.markdown('<div class="module-header">▸ STATISTICAL DIAGNOSTICS</div>', unsafe_allow_html=True)
    mom = m["return_moments"]
    norm = m["normality"]
    hurst = m["hurst"]
    autocorr = m["autocorr"]
    hurst_val = hurst.get("hurst")
    hurst_str = f"{hurst_val:.3f}" if hurst_val else "N/A"
    render_metric_row([
        {"label": "Skewness", "value": fmt_num(mom["skewness"], 3),
         "delta_positive": mom["skewness"] > -0.2},
        {"label": "Excess Kurtosis", "value": fmt_num(mom["excess_kurtosis"], 3),
         "delta_positive": mom["excess_kurtosis"] < 1},
        {"label": "Normality (JB)", "value": "PASS" if norm["normal"] else "FAIL",
         "delta_positive": norm["normal"]},
        {"label": "Lag-1 Autocorr", "value": fmt_num(autocorr["rho_lag1"], 4),
         "delta_positive": abs(autocorr["rho_lag1"]) < 0.1},
        {"label": "Hurst Exponent", "value": hurst_str},
    ])
    st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)
    st.markdown(f"""
    <div style="font-size:11px; color:{ATLAS_MUTED}; font-family:IBM Plex Mono,monospace; margin-bottom:16px; padding:10px 14px;
                background:rgba(255,255,255,0.02); border-radius:4px; border-left:2px solid {ATLAS_BORDER};">
      HURST: {hurst.get('interpretation', 'N/A')}<br>
      AUTOCORR: {autocorr.get('interpretation', 'N/A')}
    </div>""", unsafe_allow_html=True)
    col1, col2 = st.columns(2)
    with col1:
        st.markdown('<div style="font-size:10px; letter-spacing:1.5px; color:#64748B; margin-bottom:8px;">RETURN DISTRIBUTION vs NORMAL FIT</div>', unsafe_allow_html=True)
        r = m["portfolio_returns"] if "portfolio_returns" in m else None
        dist_fit = m["dist_fit"]
        fig = go.Figure()
        # Generate x range for overlay
        mu = mom["mean_daily"]
        sigma = mom["std_daily"]
        x_range = np.linspace(mu - 4 * sigma, mu + 4 * sigma, 200)
        from scipy.stats import norm as norm_dist
        fig.add_trace(go.Scatter(
            x=x_range, y=norm_dist.pdf(x_range, mu, sigma),
            name="Normal Fit", line=dict(color=ATLAS_MUTED, width=1.5, dash="dash"),
        ))
        fig.add_annotation(
            text=f"Best fit: {dist_fit['best_fit']}<br>{dist_fit['risk_implication'][:80]}...",
            xref="paper", yref="paper", x=0.02, y=0.95,
            showarrow=False,
            font=dict(family="IBM Plex Mono", size=9, color=ATLAS_MUTED),
            bgcolor=ATLAS_CARD, bordercolor=ATLAS_BORDER, borderwidth=1,
        )
        apply_layout(fig, height=240)
        fig.update_layout(xaxis_title="Daily Return", yaxis_title="Density")
        st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
    with col2:
        st.markdown('<div style="font-size:10px; letter-spacing:1.5px; color:#64748B; margin-bottom:8px;">AUTOCORRELATION STRUCTURE (ACF)</div>', unsafe_allow_html=True)
        acf_df = m["autocorr_structure"]
        colors_acf = [
            ATLAS_WARN if row["significant"] else ATLAS_ACCENT
            for _, row in acf_df.iterrows()
        ]
        fig2 = go.Figure()
        fig2.add_trace(go.Bar(
            x=acf_df["lag"], y=acf_df["autocorrelation"],
            marker_color=colors_acf, name="ACF",
        ))
        fig2.add_traces([
            go.Scatter(x=acf_df["lag"], y=acf_df["upper_bound"],
                      line=dict(color=ATLAS_MUTED, dash="dot", width=1), name="95% CI",
                      fill="tonexty", fillcolor="rgba(100,116,139,0.04)"),
            go.Scatter(x=acf_df["lag"], y=acf_df["lower_bound"],
                      line=dict(color=ATLAS_MUTED, dash="dot", width=1), showlegend=False),
        ])
        apply_layout(fig2, height=240)
        fig2.update_layout(xaxis_title="Lag (days)", yaxis_title="Autocorrelation")
        st.plotly_chart(fig2, use_container_width=True, config={"displayModeBar": False})
    # Regime sensitivity
    with st.expander("▸ Regime Sensitivity Index"):
        rsi_data = m["rsi_data"]
        if rsi_data.get("rsi") is not None:
            rsi_col = ATLAS_UP if rsi_data["rsi"] < 0.25 else ATLAS_WARN if rsi_data["rsi"] < 0.50 else ATLAS_DOWN
            st.markdown(f"""
            <div style="display:flex; gap:24px; align-items:flex-start; margin-bottom:16px;">
              <div>
                <div style="font-family:IBM Plex Mono,monospace; font-size:40px; font-weight:600; color:{rsi_col};">
                  {rsi_data['rsi']:.3f}
                </div>
                <div style="font-size:9px; letter-spacing:2px; color:{ATLAS_MUTED};">REGIME SENSITIVITY INDEX</div>
              </div>
              <div style="font-size:11px; color:{ATLAS_MUTED}; font-family:IBM Plex Mono,monospace;
                          padding:12px; background:rgba(255,255,255,0.02); border-radius:4px;
                          border-left:2px solid {rsi_col}; max-width:500px;">
                {rsi_data['interpretation']}
              </div>
            </div>""", unsafe_allow_html=True)
            regimes = rsi_data.get("regimes", {})
            if regimes:
                col_r1, col_r2 = st.columns(2)
                with col_r1:
                    st.markdown('<div style="font-size:10px; letter-spacing:1px; color:#64748B;">HIGH VOL REGIME</div>', unsafe_allow_html=True)
                    hv = regimes["high_vol_regime"]
                    for k, v in hv.items():
                        st.markdown(f'<div style="font-family:IBM Plex Mono,monospace; font-size:11px; color:{ATLAS_TEXT};">{k}: <span style="color:{ATLAS_ACCENT2};">{v:.4f}</span></div>', unsafe_allow_html=True)
                with col_r2:
                    st.markdown('<div style="font-size:10px; letter-spacing:1px; color:#64748B;">LOW VOL REGIME</div>', unsafe_allow_html=True)
                    lv = regimes["low_vol_regime"]
                    for k, v in lv.items():
                        st.markdown(f'<div style="font-family:IBM Plex Mono,monospace; font-size:11px; color:{ATLAS_TEXT};">{k}: <span style="color:{ATLAS_ACCENT2};">{v:.4f}</span></div>', unsafe_allow_html=True)
# ─── MODULE: QUANT FLAGS ──────────────────────────────────────────────────────
def render_quant_flags(flags: list):
    st.markdown("""
    <div style="background:linear-gradient(135deg, #0f1729 0%, #0d1320 100%);
                border:1px solid #1E2D45; border-left:3px solid #2563EB;
                border-radius:8px; padding:16px 20px; margin-bottom:8px;">
      <div style="font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:3px;
                  text-transform:uppercase; color:#0EA5E9; margin-bottom:4px;">
        QUANT INSIGHT ENGINE
      </div>
      <div style="font-size:10px; color:#64748B;">
        Threshold-triggered analytical observations. Data-backed, not prescriptive.
      </div>
    </div>
    """, unsafe_allow_html=True)
    if not flags:
        st.markdown(f"""
        <div style="text-align:center; padding:32px; font-family:IBM Plex Mono,monospace;
                    font-size:12px; color:{ATLAS_UP}; border:1px solid rgba(16,185,129,0.2);
                    border-radius:6px; background:rgba(16,185,129,0.04);">
          ✓ NO STRUCTURAL ANOMALIES DETECTED IN CURRENT WINDOW
        </div>""", unsafe_allow_html=True)
        return
    for flag in flags:
        border_color = ATLAS_DOWN if flag.severity == FlagSeverity.ALERT else ATLAS_WARN
        bg_color = "rgba(239,68,68,0.07)" if flag.severity == FlagSeverity.ALERT else "rgba(245,158,11,0.07)"
        severity_label = "⚠ ALERT" if flag.severity == FlagSeverity.ALERT else "◉ WATCH"
        severity_color = ATLAS_DOWN if flag.severity == FlagSeverity.ALERT else ATLAS_WARN
        data_points_html = "  ·  ".join([
            f'<span style="color:{ATLAS_ACCENT2};">{k}:</span> {v}'
            for k, v in flag.data_points.items()
        ])
        st.markdown(f"""
        <div style="background:{bg_color}; border:1px solid {border_color};
                    border-left:3px solid {border_color}; border-radius:6px;
                    padding:14px 18px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <div style="font-family:'IBM Plex Mono',monospace; font-size:12px; font-weight:600; color:{ATLAS_TEXT};">
              {flag.title}
            </div>
            <div style="display:flex; gap:12px; align-items:center;">
              <span style="font-family:IBM Plex Mono,monospace; font-size:9px; letter-spacing:1.5px;
                           color:{ATLAS_MUTED};">{flag.module.upper()}</span>
              <span style="font-family:IBM Plex Mono,monospace; font-size:10px; color:{severity_color};">
                {severity_label}
              </span>
            </div>
          </div>
          <div style="font-size:12px; color:#94A3B8; line-height:1.6; margin-bottom:8px;">
            {flag.narrative}
          </div>
          <div style="font-family:'IBM Plex Mono',monospace; font-size:10px; color:{ATLAS_MUTED};">
            DATA → {data_points_html}
          </div>
        </div>
        """, unsafe_allow_html=True)
# ─── MAIN RENDER ──────────────────────────────────────────────────────────────
def _alpaca_engine_available() -> bool:
    """Check if AlpacaDataEngine is loaded with sufficient data."""
    engine = st.session_state.get('_alpaca_data_engine')
    if engine is None:
        return False
    ph = engine.portfolio_history
    return ph is not None and not ph.empty and len(ph) > 10

def main():
    # ── Inject quant dashboard CSS (inside main, not at module level)
    st.markdown(_QUANT_CSS, unsafe_allow_html=True)

    # ── Custom header with ⬡ logo
    col_logo, col_title, col_meta = st.columns([1, 4, 2])
    with col_logo:
        st.markdown(
            '<div style="font-family:IBM Plex Mono,monospace;font-size:22px;'
            'letter-spacing:5px;color:#0EA5E9;font-weight:600;padding-top:4px;'
            'text-shadow:0 0 20px rgba(14,165,233,0.3);">&#x2B21; ATLAS</div>',
            unsafe_allow_html=True,
        )
    with col_title:
        st.markdown('<div style="font-family:IBM Plex Mono,monospace; font-size:13px; letter-spacing:2px; color:#64748B; padding-top:8px;">QUANTITATIVE DASHBOARD — v10.0</div>', unsafe_allow_html=True)
    # ── Data Source Toggle (pill button — defaults to Live when Alpaca connected)
    has_live = _alpaca_engine_available()
    if has_live:
        with col_meta:
            # Default to Live Data (index 0) when engine is available
            data_source = st.radio(
                "Data Source",
                ["Live Data", "Sample Data"],
                index=0,
                horizontal=True,
                key="quant_data_source",
                label_visibility="collapsed",
            )
        use_live = (data_source == "Live Data")
    else:
        with col_meta:
            st.markdown('<div style="text-align:right; font-family:IBM Plex Mono,monospace; font-size:10px; color:#475569; padding-top:8px;">SAMPLE PORTFOLIO  ·  756 TRADING DAYS</div>', unsafe_allow_html=True)
        use_live = False
    # ── Dynamic header label
    if use_live:
        engine = st.session_state.get('_alpaca_data_engine')
        n_days = len(engine.portfolio_history) if engine and engine.portfolio_history is not None else 0
        mode_label = "PAPER" if (engine and engine.paper) else "LIVE"
        st.markdown(f'<div style="text-align:right; font-family:IBM Plex Mono,monospace; font-size:10px; color:#10B981; margin-top:-8px; margin-bottom:4px;">ALPACA {mode_label} PORTFOLIO  ·  {n_days} TRADING DAYS</div>', unsafe_allow_html=True)
    st.markdown('<hr style="border:none; border-top:1px solid #1E2D45; margin:12px 0 20px 0;">', unsafe_allow_html=True)
    # ── Load & compute
    with st.spinner("Computing quantitative metrics..."):
        data = load_portfolio_data(use_live=use_live)
        metrics = compute_all_metrics(
            data["portfolio_returns"].values,
            data["benchmark_returns"].values,
            data["asset_returns"].values,
            data["weights"].values,
            data["dates"],
            data["asset_returns"].columns.tolist(),
        )
        # Inject portfolio_returns reference
        metrics["portfolio_returns"] = data["portfolio_returns"]
    # Show fallback warning if user selected Live but got sample data
    if use_live and st.session_state.get('_quant_data_source_active') == 'sample_fallback':
        st.warning("Live data unavailable — displaying sample data. Check Alpaca connection.")
    # Show synthetic benchmark warning if SPY fetch failed
    if st.session_state.get('_using_synthetic_benchmark') and use_live:
        st.caption("Benchmark: synthetic (SPY fetch unavailable)")
    # ── Health Panel
    render_health_panel(metrics["health_score"], metrics["quant_flags"])
    # ── Controls Row
    ctrl_col1, ctrl_col2, ctrl_col3 = st.columns([2, 3, 2])
    with ctrl_col1:
        view_mode = st.radio(
            "View Mode",
            ["Summary", "Deep Dive"],
            horizontal=True,
            key="quant_view_mode",
            label_visibility="collapsed",
        )
    with ctrl_col2:
        window_map = {"1M (21D)": 21, "1Q (63D)": 63, "6M (126D)": 126, "1Y (252D)": 252}
        window_label = st.select_slider(
            "Rolling Window",
            options=list(window_map.keys()),
            value="1Q (63D)",
            label_visibility="collapsed",
            key="quant_rolling_window",
        )
        window = window_map[window_label]
    st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)
    # ── Summary View
    if view_mode == "Summary":
        c1, c2, c3 = st.columns(3)
        with c1:
            st.markdown('<div style="font-size:9px; letter-spacing:2px; color:#64748B; margin-bottom:8px;">PERFORMANCE</div>', unsafe_allow_html=True)
            st.markdown(metric_tile("Ann. Return", fmt_pct(metrics["ann_return"])), unsafe_allow_html=True)
            st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
            st.markdown(metric_tile("Sharpe Ratio", fmt_num(metrics["sharpe"])), unsafe_allow_html=True)
            st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
            st.markdown(metric_tile("Max Drawdown", fmt_pct(metrics["max_drawdown"])), unsafe_allow_html=True)
        with c2:
            st.markdown('<div style="font-size:9px; letter-spacing:2px; color:#64748B; margin-bottom:8px;">RISK & STRUCTURE</div>', unsafe_allow_html=True)
            st.markdown(metric_tile("Ann. Volatility", fmt_pct(metrics["ann_vol"])), unsafe_allow_html=True)
            st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
            st.markdown(metric_tile("Corr-Adj ENB", fmt_num(metrics["enb_corr_adjusted"])), unsafe_allow_html=True)
            st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
            st.markdown(metric_tile("CVaR 95%", fmt_pct(metrics["tail_risk"]["cvar_95_1d"])), unsafe_allow_html=True)
        with c3:
            st.markdown('<div style="font-size:9px; letter-spacing:2px; color:#64748B; margin-bottom:8px;">STATISTICAL</div>', unsafe_allow_html=True)
            st.markdown(metric_tile("Hurst Exp.", f"{metrics['hurst'].get('hurst', 0):.3f}"), unsafe_allow_html=True)
            st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
            st.markdown(metric_tile("Excess Kurtosis", fmt_num(metrics["return_moments"]["excess_kurtosis"], 3)), unsafe_allow_html=True)
            st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
            st.markdown(metric_tile("RSI", fmt_num(metrics["rsi_data"].get("rsi", 0), 3)), unsafe_allow_html=True)
        st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)
        render_quant_flags(metrics["quant_flags"])
    # ── Deep Dive View
    else:
        with st.container():
            render_performance_module(metrics, window)
        st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)
        with st.container():
            render_risk_module(metrics)
        st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)
        with st.container():
            render_structure_module(metrics)
        st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)
        with st.container():
            render_statistical_module(metrics)
        st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)
        # Quant flags (always last, visually distinct)
        with st.container():
            render_quant_flags(metrics["quant_flags"])
    # ── Footer
    st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)
    data_source_label = "ALPACA LIVE DATA" if use_live else "SIMULATED DATA"
    st.markdown(f"""
    <div style="text-align:center; font-family:IBM Plex Mono,monospace; font-size:9px;
                letter-spacing:2px; color:#334155; padding-bottom:16px;">
      ATLAS TERMINAL  ·  QUANTITATIVE DASHBOARD  ·  PHASE 1
      &nbsp;&nbsp;|&nbsp;&nbsp;
      ALL METRICS COMPUTED ON {data_source_label}  ·  NOT INVESTMENT ADVICE
    </div>""", unsafe_allow_html=True)
if __name__ == "__main__":
    main()
