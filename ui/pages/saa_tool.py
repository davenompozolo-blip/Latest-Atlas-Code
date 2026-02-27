"""
ATLAS Terminal - Strategic Asset Allocation Tool
=================================================
AI-powered macro-to-allocation engine for South African institutional mandates.
Translates directional macro views into model portfolio weights across ASISA
asset class categories, with optional Regulation 28 constraints.

Created: February 2026
Author: Hlobo & Claude
"""
import json

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from ui.theme import ATLAS_COLORS as THEME
from ui.charts_professional import apply_atlas_theme
from ui.components import atlas_table


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

    # ── Generate button ──
    st.markdown("---")
    generate = st.button("Generate Allocation", type="primary", use_container_width=True)

    if generate:
        user_msg = _build_user_message(mandate_label, views, convictions)

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
        _render_meta(result)

        col_chart, col_table = st.columns([1, 1])
        with col_chart:
            _render_allocation_chart(allocs)
        with col_table:
            _render_allocation_table(allocs)
