"""
ATLAS Terminal - Strategic Asset Allocation Tool
=================================================
AI-powered macro-to-allocation engine for South African institutional mandates.
Translates directional macro views into model portfolio weights across ASISA
asset class categories, with optional Regulation 28 constraints.

Includes a Transition Plan tab for phased portfolio implementation with
transaction cost and CGT estimation.

Created: February 2026
Author: Hlobo & Claude
"""
import json
from datetime import datetime

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from analytics.transition import (
    AssetClassGap,
    TradePhase,
    TransitionPlan,
    calculate_transition_plan,
    compute_unclassified_pct,
    extract_target_weights,
)
from ui.theme import ATLAS_COLORS as THEME
from ui.charts_professional import apply_atlas_theme
from ui.components import atlas_table

# PM-Grade Optimization availability
try:
    from atlas_pm_optimization import ForwardLookingReturns as _ForwardLookingReturns
    _PM_AVAILABLE = True
except ImportError:
    _PM_AVAILABLE = False


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ASSET_CLASSES = [
    "SA Equity",
    "Global Equity",
    "SA Nominal Bonds",
    "SA Inflation-Linked Bonds",
    "SA Listed Property",
    "Commodities",
    "Cash / Money Market",
    "Global Bonds",
]

_MANDATE_OPTIONS = {
    "Balanced (Regulation 28)": "balanced_reg28",
    "Global (no offshore limit)": "global_unconstrained",
    "Capital Preservation": "capital_preservation",
}

_VIEW_DIMENSIONS = {
    "Interest Rates": ["Rising", "Neutral", "Falling"],
    "Economic Growth": ["Accelerating", "Stable", "Decelerating"],
    "Inflation": ["Above Target", "At Target", "Below Target"],
    "Credit Spreads": ["Widening", "Stable", "Tightening"],
    "Risk Sentiment": ["Risk-On", "Neutral", "Risk-Off"],
}

_CONVICTION_LEVELS = ["Low", "Medium", "High"]

# Colour palette for the donut chart — one per asset class
_CHART_COLORS = [
    THEME['primary'],         # SA Equity
    THEME['secondary'],       # Global Equity
    THEME['success'],         # SA Nominal Bonds
    THEME['teal'],            # SA ILBs
    THEME['warning'],         # SA Listed Property
    THEME['orange'],          # Commodities
    THEME['text_secondary'],  # Cash / Money Market
    THEME['pink'],            # Global Bonds
]

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are an institutional strategic asset allocation engine for a South African \
buy-side investment firm. Your role is to translate directional macro views into \
model portfolio weights across the ASISA asset class categories used in South \
African multi-asset mandates.

Asset classes:
- SA Equity (JSE All Share exposure)
- Global Equity (DM + EM, rand-hedged)
- SA Nominal Bonds (ALBI)
- SA Inflation-Linked Bonds (CILI)
- SA Listed Property (SAPY)
- Commodities (Gold, broad commodities)
- Cash / Money Market
- Global Bonds

Where applicable, allocations should be conscious of Regulation 28 constraints: \
offshore exposure (Global Equity + Global Bonds + offshore Commodities) should \
not exceed 45% of the total, and SA Listed Property should not exceed 25%. Flag \
in the rationale if any constraint is binding.

Your output must be a JSON object with the following structure:
{
  "allocations": {
    "SA Equity": {"weight": 0.28, "rationale": "..."},
    "Global Equity": {"weight": 0.25, "rationale": "..."},
    "SA Nominal Bonds": {"weight": 0.15, "rationale": "..."},
    "SA Inflation-Linked Bonds": {"weight": 0.05, "rationale": "..."},
    "SA Listed Property": {"weight": 0.07, "rationale": "..."},
    "Commodities": {"weight": 0.05, "rationale": "..."},
    "Cash / Money Market": {"weight": 0.10, "rationale": "..."},
    "Global Bonds": {"weight": 0.05, "rationale": "..."}
  },
  "total_weight": 1.0,
  "macro_interpretation": "...",
  "key_risks": ["...", "...", "..."],
  "positioning_theme": "...",
  "time_horizon": "..."
}

Weights must sum to exactly 1.0. Do not include preamble or markdown \u2014 respond \
with the JSON object only.\
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_user_message(mandate: str, views: dict, convictions: dict) -> str:
    """Assemble the structured user message from form inputs."""
    lines = [f"Mandate type: {mandate}", "", "Macro Views:"]
    for dim, choice in views.items():
        conv = convictions.get(dim, "Medium")
        lines.append(f"- {dim}: {choice} ({conv} conviction)")
    lines.append("")
    lines.append("Please generate a strategic asset allocation based on these views.")
    return "\n".join(lines)


def _compute_quant_signal_block() -> str | None:
    """Compute forward-looking return estimates and format as a structured text block.

    Returns None if data cannot be computed.
    """
    try:
        import yfinance as yf

        # Use broad market ETFs as proxies for SAA asset classes
        proxy_map = {
            "EZA": "SA Equity (proxy: EZA)",
            "VT": "Global Equity (proxy: VT)",
            "IGLB": "SA Nominal Bonds (proxy: IGLB)",
            "TIP": "SA Inflation-Linked Bonds (proxy: TIP)",
            "VNQ": "SA Listed Property (proxy: VNQ)",
            "GLD": "Commodities (proxy: GLD)",
            "SHV": "Cash / Money Market (proxy: SHV)",
            "BNDX": "Global Bonds (proxy: BNDX)",
        }
        tickers = list(proxy_map.keys())
        data = yf.download(tickers, period="1y", progress=False, auto_adjust=True)
        if data.empty:
            return None
        close = data["Close"] if "Close" in data.columns.get_level_values(0) else data
        returns_df = close.pct_change().dropna()
        if returns_df.empty or len(returns_df) < 60:
            return None

        estimator = _ForwardLookingReturns(returns_df)
        blended = estimator.blend_signals()

        lines = ["Quantitative Forward-Looking Return Estimates (PMGradeOptimizer):"]
        lines.append("(Blended from momentum, trend, mean-reversion, and volatility signals)")
        for ticker, label in proxy_map.items():
            if ticker in blended.index:
                ret = blended[ticker]
                lines.append(f"- {label}: {ret:+.1%} expected annual return")

        return "\n".join(lines)
    except Exception:
        return None


def _call_allocation_engine(user_message: str) -> dict:
    """Call Anthropic API and return parsed allocation JSON."""
    import anthropic

    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text.strip()
    # Strip any accidental markdown fences
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    return json.loads(raw)


def _validate_allocation(data: dict) -> str | None:
    """Return an error string if the allocation is invalid, else None."""
    allocs = data.get("allocations")
    if not isinstance(allocs, dict):
        return "Response missing 'allocations' object."
    total = sum(a.get("weight", 0) for a in allocs.values())
    if abs(total - 1.0) > 0.02:
        return f"Weights sum to {total:.3f} (expected 1.0)."
    return None


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------

def _render_allocation_chart(allocs: dict):
    """Donut chart of allocation weights."""
    names = list(allocs.keys())
    weights = [allocs[n]["weight"] for n in names]
    labels = [f"{n} ({w:.0%})" for n, w in zip(names, weights)]

    fig = go.Figure(data=[
        go.Pie(
            labels=labels,
            values=weights,
            marker=dict(colors=_CHART_COLORS[:len(names)]),
            textinfo="label",
            hovertemplate="%{label}: %{value:.1%}<extra></extra>",
        )
    ])
    fig = apply_atlas_theme(fig, chart_type="pie", title="Recommended Allocation")
    st.plotly_chart(fig, use_container_width=True)


def _render_allocation_table(allocs: dict):
    """Table with weight and rationale per asset class."""
    rows = []
    for name in ASSET_CLASSES:
        entry = allocs.get(name, {})
        rows.append({
            "Asset Class": name,
            "Weight": f"{entry.get('weight', 0):.1%}",
            "Rationale": entry.get("rationale", ""),
        })
    df = pd.DataFrame(rows)
    atlas_table(df, title="Allocation Detail", hoverable=True)


def _render_meta(data: dict):
    """Render positioning theme, time horizon, macro interpretation, and risks."""
    theme = data.get("positioning_theme", "")
    horizon = data.get("time_horizon", "")

    col1, col2 = st.columns(2)
    with col1:
        st.markdown(
            f'<div style="background: var(--bg-glass, rgba(255,255,255,0.05));'
            f' border: 1px solid var(--border, rgba(99,102,241,0.15));'
            f' border-radius: 12px; padding: 1rem 1.25rem;">'
            f'<div style="font-size: 0.65rem; text-transform: uppercase;'
            f' letter-spacing: 0.08em; color: var(--text-muted, rgba(255,255,255,0.28));'
            f' margin-bottom: 0.25rem;">Positioning Theme</div>'
            f'<div style="font-size: 1.1rem; font-weight: 700;'
            f' color: var(--text-primary, rgba(255,255,255,0.92));">{theme}</div>'
            f'</div>',
            unsafe_allow_html=True,
        )
    with col2:
        st.markdown(
            f'<div style="background: var(--bg-glass, rgba(255,255,255,0.05));'
            f' border: 1px solid var(--border, rgba(99,102,241,0.15));'
            f' border-radius: 12px; padding: 1rem 1.25rem;">'
            f'<div style="font-size: 0.65rem; text-transform: uppercase;'
            f' letter-spacing: 0.08em; color: var(--text-muted, rgba(255,255,255,0.28));'
            f' margin-bottom: 0.25rem;">Time Horizon</div>'
            f'<div style="font-size: 1.1rem; font-weight: 700;'
            f' color: var(--text-primary, rgba(255,255,255,0.92));">{horizon}</div>'
            f'</div>',
            unsafe_allow_html=True,
        )

    interpretation = data.get("macro_interpretation", "")
    if interpretation:
        st.markdown(f"**Macro Interpretation**")
        st.markdown(
            f'<div style="color: var(--text-secondary, rgba(255,255,255,0.52));'
            f' font-size: 0.9rem; line-height: 1.6; margin-bottom: 1rem;">'
            f'{interpretation}</div>',
            unsafe_allow_html=True,
        )

    risks = data.get("key_risks", [])
    if risks:
        st.markdown("**Key Risks**")
        for r in risks:
            st.markdown(
                f'<div style="color: var(--text-secondary, rgba(255,255,255,0.52));'
                f' font-size: 0.85rem; padding: 0.25rem 0;">'
                f'<span style="color: {THEME["danger"]}; margin-right: 0.4rem;">'
                f'&#9888;</span>{r}</div>',
                unsafe_allow_html=True,
            )


# ---------------------------------------------------------------------------
# Transition Plan tab
# ---------------------------------------------------------------------------

def _render_transition_tab(saa_result: dict):
    """Render the Transition Plan tab — gap analysis, phased trades, cost summary."""

    target_weights = extract_target_weights(saa_result)

    st.markdown(
        f'<div style="font-size: 1.1rem; font-weight: 700;'
        f' color: var(--text-primary, rgba(255,255,255,0.92));'
        f' margin-bottom: 0.5rem;">Portfolio Transition Planner</div>'
        f'<div style="font-size: 0.8rem;'
        f' color: var(--text-secondary, rgba(255,255,255,0.52));'
        f' margin-bottom: 1rem;">Configure current allocation and cost'
        f' assumptions to generate a phased transition plan.</div>',
        unsafe_allow_html=True,
    )

    # ── Pre-populate from Phoenix Parser if available ──
    portfolio_df = st.session_state.get("portfolio_df")
    has_portfolio = portfolio_df is not None and hasattr(portfolio_df, "empty") and not portfolio_df.empty

    # Attempt to extract portfolio value from session state
    default_value = 10_000_000.0
    if has_portfolio:
        value_col = None
        for col_name in ("Market_Value", "Total Value", "Market Value", "market_value"):
            if col_name in portfolio_df.columns:
                value_col = col_name
                break
        if value_col is not None:
            try:
                default_value = float(portfolio_df[value_col].sum())
            except (TypeError, ValueError):
                pass

    # ── Input form ──
    col_left, col_right = st.columns([2, 1])

    with col_right:
        st.markdown("##### Assumptions")
        portfolio_value = st.number_input(
            "Portfolio Value (ZAR)",
            min_value=0.0,
            value=default_value,
            step=100_000.0,
            format="%.0f",
            key="tp_portfolio_value",
        )
        cost_bps = st.number_input(
            "Transaction Cost (bps)",
            min_value=0.0,
            max_value=200.0,
            value=25.0,
            step=5.0,
            key="tp_cost_bps",
            help="Basis points per trade. 25bps is a typical institutional rate.",
        )
        cgt_rate = st.number_input(
            "Effective CGT Rate (%)",
            min_value=0.0,
            max_value=50.0,
            value=18.0,
            step=1.0,
            key="tp_cgt_rate",
            help="South African CGT default is 18%. Adjust for exemptions.",
        )
        max_turnover = st.slider(
            "Max Turnover Per Rebalance (%)",
            min_value=5,
            max_value=100,
            value=20,
            step=5,
            key="tp_max_turnover",
            help="Maximum one-way turnover allowed in a single rebalance phase.",
        )

    with col_left:
        st.markdown("##### Current Allocation (% weights)")
        st.caption(
            "Enter your current portfolio allocation by asset class. "
            "Weights should sum to 100%."
        )
        current_weights: dict[str, float] = {}
        # Two columns for the asset class inputs
        ac_cols = st.columns(2)
        for idx, ac in enumerate(ASSET_CLASSES):
            with ac_cols[idx % 2]:
                val = st.number_input(
                    ac,
                    min_value=0.0,
                    max_value=100.0,
                    value=0.0,
                    step=1.0,
                    key=f"tp_cur_{ac}",
                    format="%.1f",
                )
                if val > 0:
                    current_weights[ac] = val / 100.0

        # Add unclassified residual
        total_entered = sum(current_weights.values())
        if total_entered > 0 and abs(total_entered - 1.0) > 0.001:
            residual = 1.0 - total_entered
            if residual > 0:
                current_weights["Unclassified"] = residual
                st.caption(f"Unclassified residual: {residual:.1%}")
            elif residual < -0.001:
                st.warning(
                    f"Current weights sum to {total_entered:.1%} — exceeds 100%."
                )

    # ── Unclassified warning ──
    unclassified_pct = compute_unclassified_pct(current_weights)
    if unclassified_pct > 0.15:
        st.warning(
            f"**{unclassified_pct:.0%} of the portfolio is unclassified.** "
            "The gap analysis may be unreliable — consider mapping all holdings "
            "to asset classes before acting on the transition plan."
        )

    # ── Generate button ──
    generate_plan = st.button(
        "Generate Transition Plan",
        type="primary",
        use_container_width=True,
        key="tp_generate",
        disabled=(not current_weights or portfolio_value <= 0),
    )

    if generate_plan:
        plan = calculate_transition_plan(
            current_weights=current_weights,
            target_weights=target_weights,
            portfolio_value=portfolio_value,
            cost_bps=cost_bps,
            cgt_rate=cgt_rate / 100.0,
            max_turnover=max_turnover / 100.0,
        )
        st.session_state["transition_plan"] = plan

    # ── Render plan if available ──
    plan = st.session_state.get("transition_plan")
    if plan:
        _render_gap_analysis(plan)
        _render_trade_schedule(plan)
        _render_cost_summary(plan)


# ---------------------------------------------------------------------------
# Transition Plan panels
# ---------------------------------------------------------------------------

def _render_gap_analysis(plan: TransitionPlan):
    """Panel 1: Current vs Target allocation gap analysis."""
    st.markdown("##### Gap Analysis")

    rows = []
    for g in plan.gaps:
        rows.append({
            "Asset Class": g.asset_class,
            "Current": f"{g.current_weight:.1%}",
            "Target": f"{g.target_weight:.1%}",
            "Delta": f"{g.delta:+.1%}",
            "Delta Value": f"R {g.delta_value:,.0f}",
        })
    df = pd.DataFrame(rows)
    atlas_table(df, title="Current vs Target", hoverable=True)

    st.markdown(
        f'<div style="text-align: right; font-size: 0.85rem;'
        f' color: var(--text-secondary, rgba(255,255,255,0.52));'
        f' margin-top: 0.5rem;">'
        f'Total portfolio drift: <strong>{plan.total_drift:.1%}</strong>'
        f' one-way turnover required</div>',
        unsafe_allow_html=True,
    )


def _render_trade_schedule(plan: TransitionPlan):
    """Panel 2: Phased trade schedule."""
    st.markdown("##### Trade Schedule")

    if not plan.phases:
        st.info("No trades required — current allocation matches target.")
        return

    if plan.phases_required == 1:
        st.caption("Full transition achievable in a single rebalance.")
    else:
        st.caption(
            f"Transition requires **{plan.phases_required} phases** "
            f"at {plan.max_turnover:.0%} max turnover per rebalance."
        )

    for phase in plan.phases:
        label = f"Phase {phase.phase_number}"
        if plan.phases_required > 1:
            label += f"  —  Turnover: {phase.total_turnover:.1%}"
            if phase.cumulative_drift > 0.001:
                label += f"  |  Remaining drift: {phase.cumulative_drift:.1%}"

        with st.expander(label, expanded=(phase.phase_number == 1)):
            trade_rows = []
            for t in phase.trades:
                trade_rows.append({
                    "Asset Class": t.asset_class,
                    "Action": t.action,
                    "Weight Change": f"{t.weight_change:.1%}",
                    "Trade Value": f"R {t.trade_value:,.0f}",
                    "Txn Cost": f"R {t.transaction_cost:,.0f}",
                    "Est. CGT": f"R {t.cgt_exposure:,.0f}" if t.cgt_exposure > 0 else "—",
                })
            trade_df = pd.DataFrame(trade_rows)
            atlas_table(trade_df, title=f"Phase {phase.phase_number} Trades", hoverable=True)


def _render_cost_summary(plan: TransitionPlan):
    """Panel 3: Cost and performance drag summary."""
    st.markdown("##### Cost & Drag Summary")

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.metric("Transaction Costs", f"R {plan.total_transaction_cost:,.0f}")
    with c2:
        st.metric("Est. Max CGT Exposure", f"R {plan.total_cgt_exposure:,.0f}")
    with c3:
        st.metric("Total Implementation Cost", f"R {plan.total_implementation_cost:,.0f}")
    with c4:
        st.metric("Performance Drag", f"{plan.performance_drag_bps:.1f} bps")

    st.caption(
        "CGT estimate is conservative (assumes all sells realise gains). "
        "Actual CGT depends on cost basis of individual positions."
    )


# ---------------------------------------------------------------------------
# Main render function
# ---------------------------------------------------------------------------

def render_saa_tool():
    """Strategic Asset Allocation tool - macro views to model weights."""
    st.markdown(
        '<h1 style="font-size: 2.2rem; font-weight: 800; color: var(--text-primary, rgba(255,255,255,0.92));'
        ' margin-bottom: 0;">'
        '<span style="background: linear-gradient(135deg,'
        f' {THEME["primary"]}, {THEME["secondary"]});'
        ' -webkit-background-clip: text; -webkit-text-fill-color: transparent;">'
        'STRATEGIC ASSET ALLOCATION</span></h1>',
        unsafe_allow_html=True,
    )
    st.caption("Translate directional macro views into model portfolio weights")

    # ── Mandate selector (Refinement 2) ──
    st.markdown("---")
    mandate_label = st.selectbox(
        "Mandate Type",
        options=list(_MANDATE_OPTIONS.keys()),
        help="Balanced mandates apply Regulation 28 offshore caps.",
    )

    # ── Macro views form ──
    st.markdown("##### Macro Views")

    views: dict[str, str] = {}
    convictions: dict[str, str] = {}

    for dim, options in _VIEW_DIMENSIONS.items():
        cols = st.columns([2, 1])
        with cols[0]:
            views[dim] = st.selectbox(dim, options, key=f"saa_view_{dim}")
        with cols[1]:
            convictions[dim] = st.select_slider(
                "Conviction",
                options=_CONVICTION_LEVELS,
                value="Medium",
                key=f"saa_conv_{dim}",
            )

    # ── Quantitative signals toggle (PMGradeOptimizer enhancement) ──
    enhance_quant = False
    if _PM_AVAILABLE:
        enhance_quant = st.checkbox(
            "Enhance with quantitative signals (PMGradeOptimizer)",
            value=False,
            key="saa_enhance_quant",
            help="Appends forward-looking return estimates from momentum, trend, "
                 "and mean-reversion signals to the allocation request.",
        )

    # ── Generate button ──
    st.markdown("---")
    generate = st.button("Generate Allocation", type="primary", use_container_width=True)

    if generate:
        user_msg = _build_user_message(mandate_label, views, convictions)

        # Append quantitative signals if toggled
        if enhance_quant and _PM_AVAILABLE:
            quant_block = _compute_quant_signal_block()
            if quant_block:
                user_msg += "\n\n" + quant_block

        with st.spinner("Generating allocation recommendation..."):
            try:
                result = _call_allocation_engine(user_msg)
            except Exception as exc:
                st.error(f"Allocation engine error: {exc}")
                return

        err = _validate_allocation(result)
        if err:
            st.error(f"Invalid allocation response: {err}")
            return

        # Store in session state so it persists across reruns
        st.session_state["saa_result"] = result

    # ── Render output if available ──
    result = st.session_state.get("saa_result")
    if result:
        allocs = result.get("allocations", {})
        st.markdown("---")

        tab_alloc, tab_transition = st.tabs([
            "Allocation Result",
            "Transition Plan",
        ])

        with tab_alloc:
            _render_meta(result)
            col_chart, col_table = st.columns([1, 1])
            with col_chart:
                _render_allocation_chart(allocs)
            with col_table:
                _render_allocation_table(allocs)

        with tab_transition:
            _render_transition_tab(result)
