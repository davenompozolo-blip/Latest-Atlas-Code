"""
ATLAS Terminal - Portfolio Home Page
Implements the design spec: glass cards, ambient atmosphere, section labels.
"""
import pandas as pd
import streamlit as st
from datetime import datetime, timedelta

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, add_arrow_indicator
from ui.components.charts import apply_chart_theme


def _regime_is_fresh(regime: dict, max_age_minutes: int = 30) -> bool:
    """Return True if regime context is younger than *max_age_minutes*."""
    ts = regime.get('timestamp')
    if ts is None:
        return False
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts)
        except (ValueError, TypeError):
            return False
    return (datetime.now() - ts) < timedelta(minutes=max_age_minutes)


def _render_regime_banner(regime: dict):
    """Render a one-line macro regime context banner above the performance section."""
    label = regime.get('label', 'Unknown')
    confidence = regime.get('confidence', 0)
    implication = regime.get('implication', '')
    color = regime.get('color', 'var(--violet, #8b5cf6)')

    st.markdown(f'''
    <div style="background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.18);
         border-radius: 12px; padding: 0.75rem 1.25rem; margin-bottom: 1.25rem;
         display: flex; align-items: center; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 0.7rem; color: var(--text-secondary, rgba(255,255,255,0.52));
                  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;">Macro Regime</span>
            <span style="font-weight: 800; color: {color}; font-size: 0.95rem;">{label}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted, rgba(255,255,255,0.28));">
                {confidence:.0f}% confidence</span>
        </div>
        <span style="font-size: 0.8rem; color: var(--text-secondary, rgba(255,255,255,0.52));
              flex: 1;">{implication}</span>
    </div>
    ''', unsafe_allow_html=True)


def _section_label(text):
    """Design spec section label with trailing line."""
    return f'<div class="section-label">{text}</div>'


def _glass_card(label, value, pill_text=None, pill_class="pill-green", value_class="", glow=""):
    """Design spec glass card with metric-label, metric-value, metric-pill."""
    glow_cls = f" glow-{glow}" if glow else ""
    pill_html = ""
    if pill_text:
        pill_html = f'<span class="metric-pill {pill_class}">{pill_text}</span>'
    return f'''<div class="glass-card{glow_cls}">
        <div class="metric-label">{label}</div>
        <div class="metric-value {value_class}">{value}</div>
        {pill_html}
    </div>'''


def _perf_card(label, value, pill_text=None, pill_class="pill-neutral", value_class=""):
    """Design spec performance card (smaller)."""
    pill_html = ""
    if pill_text:
        pill_html = f'<span class="metric-pill {pill_class}" style="font-size:10px;padding:4px 10px;">{pill_text}</span>'
    return f'''<div class="perf-card">
        <div class="metric-label" style="font-size:9px;margin-bottom:8px;">{label}</div>
        <div class="metric-value" style="font-size:16px;margin-bottom:10px;" class="{value_class}">{value}</div>
        {pill_html}
    </div>'''


def _render_empty_state():
    """Render a graceful empty state when no portfolio data is loaded."""
    st.markdown('''
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px;">
        <div class="page-title">Portfolio Home</div>
        <span class="badge badge-neutral">No Data</span>
    </div>
    ''', unsafe_allow_html=True)

    st.markdown('<div class="section-label">Getting Started</div>', unsafe_allow_html=True)

    col1, col2, col3 = st.columns(3)

    with col1:
        st.markdown('''<div class="glass-card glow-blue">
            <span style="font-size: 24px; display: block; margin-bottom: 12px;">&#128293;</span>
            <div class="metric-label">Step 1</div>
            <div style="font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Phoenix Parser</div>
            <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.6;">
                Navigate to <strong>Phoenix Parser</strong> in the sidebar and upload your portfolio spreadsheet (Excel or CSV).
            </div>
        </div>''', unsafe_allow_html=True)

    with col2:
        st.markdown('''<div class="glass-card glow-green">
            <span style="font-size: 24px; display: block; margin-bottom: 12px;">&#128279;</span>
            <div class="metric-label">Step 2</div>
            <div style="font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Connect a Broker</div>
            <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.6;">
                Or connect <strong>Alpaca Markets</strong> or <strong>Easy Equities</strong> for live portfolio sync.
            </div>
        </div>''', unsafe_allow_html=True)

    with col3:
        st.markdown('''<div class="glass-card glow-violet">
            <span style="font-size: 24px; display: block; margin-bottom: 12px;">&#128202;</span>
            <div class="metric-label">Step 3</div>
            <div style="font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Full Analytics</div>
            <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.6;">
                Once loaded, this page shows risk snapshots, performance charts, sector allocation, and more.
            </div>
        </div>''', unsafe_allow_html=True)

    st.markdown('''
    <div class="tip-bar" style="margin-top: 24px;">
        <span style="font-size: 14px;">&#128161;</span>
        Your portfolio file needs at minimum a <strong>Ticker</strong> column and a <strong>Shares</strong> column.
        Optional: <em>Avg Cost</em>, <em>Current Price</em>, <em>Sector</em>.
    </div>
    ''', unsafe_allow_html=True)


def _compute_portfolio_summary(enhanced_df):
    """Aggregate portfolio-level metrics from enhanced holdings DataFrame."""
    total_invested = enhanced_df['Total Cost'].sum()
    current_value = enhanced_df['Total Value'].sum()
    total_pnl = enhanced_df['Total Gain/Loss $'].sum()
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0
    daily_pl = enhanced_df['Daily P&L $'].sum()
    return {
        'total_invested': total_invested,
        'current_value': current_value,
        'total_pnl': total_pnl,
        'total_pnl_pct': total_pnl_pct,
        'daily_pl': daily_pl,
        'equity': current_value,
        'gross_exposure': current_value,
        'actual_leverage': 1.0,
    }


def _classify_badges(total_gl_pct, actual_leverage, target_leverage=1.7):
    """Classify leverage and performance status for header badges."""
    lev_diff = abs(actual_leverage - target_leverage)
    if lev_diff < 0.1:
        lev_text, lev_badge, lev_icon = 'On Target', 'badge-green', '&#10003;'
    elif lev_diff < 0.3:
        lev_text, lev_badge, lev_icon = 'Near Target', 'badge-warning', '!'
    else:
        lev_text, lev_badge, lev_icon = 'Off Target', 'badge-warning', '!'

    if total_gl_pct > 5:
        perf_text, perf_badge = f'Strong (+{total_gl_pct:.1f}%)', 'badge-green'
        perf_icon = '&#8593;'
    elif total_gl_pct > 0:
        perf_text, perf_badge = f'Positive (+{total_gl_pct:.1f}%)', 'badge-green'
        perf_icon = '&#8599;'
    elif total_gl_pct > -5:
        perf_text, perf_badge = f'Slight Loss ({total_gl_pct:.1f}%)', 'badge-warning'
        perf_icon = '&#8600;'
    else:
        perf_text, perf_badge = f'Underperforming ({total_gl_pct:.1f}%)', 'badge-red'
        perf_icon = '&#8595;'

    return {
        'lev_text': lev_text, 'lev_badge': lev_badge, 'lev_icon': lev_icon,
        'perf_text': perf_text, 'perf_badge': perf_badge, 'perf_icon': perf_icon,
    }


def render_portfolio_home():
    """Render the Portfolio Home page."""
    start_date = st.session_state.get('start_date')
    end_date = st.session_state.get('end_date')
    import time as _t
    _ph_start = _t.time()
    print("[PORTFOLIO_HOME] Start render", flush=True)

    from core import (
        load_portfolio_data,
        create_enhanced_holdings_table,
        calculate_portfolio_returns,
        is_valid_series,
        calculate_performance_metrics,
        create_signal_health_badge,
        create_risk_snapshot,
        create_pnl_attribution_sector,
        create_pnl_attribution_position,
        should_display_monthly_heatmap,
        create_performance_heatmap,
        calculate_var_cvar_portfolio_optimization,
        style_holdings_dataframe_with_optimization,
        get_db,
        is_option_ticker,
        ATLASFormatter,
    )
    print(f"[PORTFOLIO_HOME] Imports done ({_t.time() - _ph_start:.2f}s)", flush=True)

    # ── Load Data ──
    if 'portfolio_df' in st.session_state and st.session_state['portfolio_df'] is not None and len(st.session_state['portfolio_df']) > 0:
        portfolio_data = st.session_state['portfolio_df']
        print(f"[PORTFOLIO_HOME] Using session_state portfolio ({len(portfolio_data)} rows)", flush=True)
    else:
        print("[PORTFOLIO_HOME] Loading portfolio from storage...", flush=True)
        portfolio_data = load_portfolio_data()
        print(f"[PORTFOLIO_HOME] Portfolio loaded ({_t.time() - _ph_start:.2f}s)", flush=True)

    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        print("[PORTFOLIO_HOME] No portfolio data - showing empty state", flush=True)
        _render_empty_state()
        return

    df = portfolio_data
    currency_symbol = df.attrs.get('currency_symbol') or st.session_state.get('currency_symbol', '$')
    currency = df.attrs.get('currency') or st.session_state.get('currency', 'USD')

    print(f"[PORTFOLIO_HOME] Building enhanced holdings table ({len(df)} positions)...", flush=True)
    with st.spinner("Loading..."):
        enhanced_df = create_enhanced_holdings_table(df)
    print(f"[PORTFOLIO_HOME] Enhanced table complete ({_t.time() - _ph_start:.2f}s)", flush=True)

    summary = _compute_portfolio_summary(enhanced_df)
    total_invested = summary['total_invested']
    current_value = summary['current_value']
    total_pnl = summary['total_pnl']
    total_pnl_pct = summary['total_pnl_pct']
    daily_pl = summary['daily_pl']
    equity = summary['equity']
    gross_exposure = summary['gross_exposure']
    actual_leverage = summary['actual_leverage']
    total_cost = total_invested
    total_gl = total_pnl
    total_gl_pct = total_pnl_pct

    # ── Page Header + Badges ──
    badges = _classify_badges(total_gl_pct, actual_leverage)
    lev_text, lev_badge, lev_icon = badges['lev_text'], badges['lev_badge'], badges['lev_icon']
    perf_text, perf_badge, perf_icon = badges['perf_text'], badges['perf_badge'], badges['perf_icon']

    st.markdown(f'''
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px;">
        <div class="page-title">Portfolio Home</div>
        <div style="display: flex; gap: 8px; align-items: center;">
            <span class="badge {lev_badge}">{lev_icon} Leverage: {lev_text}</span>
            <span class="badge {perf_badge}">{perf_icon} {perf_text}</span>
            <span class="badge badge-neutral">{len(enhanced_df)} Positions</span>
        </div>
    </div>
    ''', unsafe_allow_html=True)

    # ══════════════════════════════════════════════════════
    # MACRO REGIME BANNER (cross-module integration from Macro Intelligence)
    # ══════════════════════════════════════════════════════
    _regime = st.session_state.get('macro_regime')
    if _regime and _regime_is_fresh(_regime):
        _render_regime_banner(_regime)

    # ══════════════════════════════════════════════════════
    # CAPITAL STRUCTURE — 3 glass cards
    # ══════════════════════════════════════════════════════
    st.markdown(_section_label("Capital Structure"), unsafe_allow_html=True)

    col1, col2, col3 = st.columns(3)

    pnl_sign = "+" if total_pnl_pct >= 0 else ""

    with col1:
        st.markdown(_glass_card(
            "Portfolio Value",
            f"{currency_symbol}{current_value:,.2f}",
            pill_text=f"&uarr; Return: {pnl_sign}{total_pnl_pct:.2f}%",
            pill_class="pill-green",
            glow="green",
        ), unsafe_allow_html=True)

    with col2:
        st.markdown(_glass_card(
            "Total Invested",
            f"{currency_symbol}{total_invested:,.2f}",
            pill_text="Cost Basis",
            pill_class="pill-neutral",
            glow="blue",
        ), unsafe_allow_html=True)

    with col3:
        pnl_val_class = "green" if total_pnl >= 0 else "red"
        pnl_pill_class = "pill-green" if total_pnl >= 0 else "pill-red"
        pnl_prefix = "+" if total_pnl >= 0 else ""
        st.markdown(_glass_card(
            "Total P&L",
            f"{pnl_prefix}{currency_symbol}{total_pnl:,.2f}",
            pill_text=f"&uarr; {pnl_prefix}{total_pnl_pct:.2f}%",
            pill_class=pnl_pill_class,
            value_class=pnl_val_class,
            glow="violet",
        ), unsafe_allow_html=True)

    st.markdown('<div style="height: 28px;"></div>', unsafe_allow_html=True)

    # ══════════════════════════════════════════════════════
    # PERFORMANCE — 6 performance cards
    # ══════════════════════════════════════════════════════
    st.markdown(_section_label("Performance — Equity Basis"), unsafe_allow_html=True)

    col1, col2, col3, col4, col5, col6 = st.columns(6)

    with col1:
        gl_cls = "green" if total_gl >= 0 else "red"
        gl_pill = "pill-green" if total_gl >= 0 else "pill-red"
        st.markdown(_perf_card(
            "Portfolio Return",
            f'<span style="color:var(--{gl_cls});">{format_percentage(total_gl_pct)}</span>',
            pill_text=f"&uarr; {format_currency(total_gl, currency_symbol=currency_symbol)}",
            pill_class=gl_pill,
        ), unsafe_allow_html=True)

    with col2:
        daily_cls = "green" if daily_pl >= 0 else "red"
        st.markdown(_perf_card(
            "Daily P&L",
            f'<span style="color:var(--{daily_cls});">{format_currency(daily_pl, currency_symbol=currency_symbol)}</span>',
            pill_text="&#9650; Today",
            pill_class="pill-neutral",
        ), unsafe_allow_html=True)

    with col3:
        pnl_cls = "green" if total_pnl >= 0 else "red"
        st.markdown(_perf_card(
            "Total P&L",
            f'<span style="color:var(--{pnl_cls});">{format_currency(total_pnl, currency_symbol=currency_symbol)}</span>',
            pill_text=f"&uarr; {pnl_prefix}{total_pnl_pct:.2f}%",
            pill_class="pill-green" if total_pnl >= 0 else "pill-red",
        ), unsafe_allow_html=True)

    with col4:
        st.markdown(_perf_card(
            "Cost Basis",
            f"{format_currency(total_cost, currency_symbol=currency_symbol)}",
            pill_text="Investment",
            pill_class="pill-neutral",
        ), unsafe_allow_html=True)

    with col5:
        unr_cls = "green" if total_pnl >= 0 else "red"
        st.markdown(_perf_card(
            "Unrealized G/L",
            f'<span style="color:var(--{unr_cls});">{format_currency(total_pnl, currency_symbol=currency_symbol)}</span>',
            pill_text=f"&uarr; {total_pnl_pct:.2f}%",
            pill_class="pill-green" if total_pnl >= 0 else "pill-red",
        ), unsafe_allow_html=True)

    with col6:
        st.markdown(_perf_card(
            "Positions",
            f'<span style="color:var(--blue);">{len(enhanced_df)}</span>',
            pill_text="Holdings",
            pill_class="pill-neutral",
        ), unsafe_allow_html=True)

    st.markdown('<div style="height: 28px;"></div>', unsafe_allow_html=True)

    # ══════════════════════════════════════════════════════
    # RISK SNAPSHOT
    # ══════════════════════════════════════════════════════
    print(f"[PORTFOLIO_HOME] Calculating portfolio returns... ({_t.time() - _ph_start:.2f}s)", flush=True)
    portfolio_returns = calculate_portfolio_returns(df, start_date, end_date)
    print(f"[PORTFOLIO_HOME] Portfolio returns done ({_t.time() - _ph_start:.2f}s)", flush=True)

    with st.expander("Portfolio Health & Risk Snapshot", expanded=False):
        col_health, col_snapshot = st.columns([1, 3])

        with col_health:
            if is_valid_series(portfolio_returns):
                metrics = calculate_performance_metrics(enhanced_df, portfolio_returns, None)
                health_badge = create_signal_health_badge(metrics)
                st.markdown(health_badge, unsafe_allow_html=True)
                st.caption(f"**Last Updated:** {ATLASFormatter.format_timestamp()}")

        with col_snapshot:
            risk_snapshot_html = create_risk_snapshot(enhanced_df, portfolio_returns)
            st.markdown(risk_snapshot_html, unsafe_allow_html=True)

    st.markdown("---")

    # ── Tip bar ──
    st.markdown('''<div class="tip-bar">
        <strong>Tip:</strong> Head to the Valuation House to analyze intrinsic values of any ticker.
    </div>''', unsafe_allow_html=True)

    # ══════════════════════════════════════════════════════
    # CURRENT HOLDINGS TABLE
    # ══════════════════════════════════════════════════════
    st.markdown(_section_label("Current Holdings"), unsafe_allow_html=True)

    from core.atlas_table_formatting import render_generic_table, render_column_manager, render_table_card

    ALL_COLUMNS = [
        'Display Ticker', 'Asset Name', 'Shares', 'Avg Cost', 'Current Price',
        'Total Value',
        'Daily Change %', '5D Return %', 'YTD Return %',
        'Weight % of Equity', 'Weight % of Gross', 'Weight %',
        'Daily P&L $', 'Total Gain/Loss $', 'Total Gain/Loss %',
        'Beta', 'Analyst Rating', 'Quality Score', 'Sector',
        'Price Target', 'Volume'
    ]

    DEFAULT_COLUMNS = [
        'Display Ticker', 'Asset Name', 'Shares', 'Current Price',
        'Total Value',
        'Daily Change %', '5D Return %',
        'Weight % of Equity', 'Weight % of Gross',
        'Total Gain/Loss $', 'Total Gain/Loss %', 'Quality Score'
    ]

    available_columns = [col for col in ALL_COLUMNS if col in enhanced_df.columns]
    default_selected = [col for col in DEFAULT_COLUMNS if col in enhanced_df.columns]

    with st.expander("Manage Columns — Reorder & Remove", expanded=False):
        selected_columns = render_column_manager(
            available_columns=available_columns,
            default_columns=default_selected,
            session_key="holdings_table_columns",
        )

    if selected_columns:
        display_df = enhanced_df[selected_columns].copy()

        def _get_col_type(c):
            if c == 'Display Ticker':
                return 'ticker'
            if c == 'Shares':
                return 'shares'
            if c == 'Quality Score':
                return 'quality_score'
            if c == 'Volume':
                return 'volume'
            if c == 'Beta':
                return 'ratio'
            if 'Weight %' in c or 'Weight' == c:
                return 'weight'
            # Dollar gain/loss columns: green/red with $ formatting
            if c in ('Total Gain/Loss $', 'Daily P&L $'):
                return 'dollar_change'
            if any(k in c for k in ('Price', 'Value', 'Cost', 'Target')):
                return 'price'
            if '%' in c or 'Change' in c or 'Return' in c:
                return 'change'
            return 'text'

        col_defs = [{'key': c, 'label': c, 'type': _get_col_type(c)} for c in display_df.columns]
        table_html = render_generic_table(display_df, columns=col_defs)

        st.markdown(
            render_table_card("Current Holdings", table_html, icon=""),
            unsafe_allow_html=True
        )

        if 'Weight % of Equity' in selected_columns or 'Weight % of Gross' in selected_columns:
            st.caption(f"""
            **Understanding Position Weights:**
            - **Weight % of Equity**: Position value as % of your {currency_symbol}{equity:,.0f} equity (can exceed 100% with {actual_leverage:.2f}x leverage!)
            - **Weight % of Gross**: Position value as % of {currency_symbol}{gross_exposure:,.0f} gross exposure (always sums to 100%)
            """)
    else:
        st.warning("Please select at least one column to display")

    st.markdown("---")

    # ══════════════════════════════════════════════════════
    # SECTOR ATTRIBUTION
    # ══════════════════════════════════════════════════════
    st.markdown(_section_label("Sector Attribution"), unsafe_allow_html=True)
    pnl_sector = create_pnl_attribution_sector(enhanced_df)
    if pnl_sector:
        apply_chart_theme(pnl_sector)
        st.plotly_chart(pnl_sector, use_container_width=True, key="sector_pnl")
    else:
        st.info("Sector P&L will display when holdings have sector data")

    st.markdown("---")

    # ── Top Contributors ──
    st.markdown(_section_label("Top Contributors"), unsafe_allow_html=True)
    pnl_position = create_pnl_attribution_position(enhanced_df, top_n=10)
    if pnl_position:
        apply_chart_theme(pnl_position)
        st.plotly_chart(pnl_position, use_container_width=True)

    # ── Monthly Performance Heatmap ──
    st.markdown("---")
    if should_display_monthly_heatmap(enhanced_df):
        st.markdown(_section_label("Monthly Performance"), unsafe_allow_html=True)
        perf_heatmap = create_performance_heatmap(enhanced_df)
        if perf_heatmap:
            apply_chart_theme(perf_heatmap)
            st.plotly_chart(perf_heatmap, use_container_width=True)
    else:
        st.info("Monthly performance heatmap will be available after 2+ months of portfolio history")

    # ── Earnings Calendar ──
    print(f"[PORTFOLIO_HOME] Rendering earnings calendar... ({_t.time() - _ph_start:.2f}s)", flush=True)
    render_earnings_calendar(enhanced_df)
    print(f"[PORTFOLIO_HOME] Earnings calendar done ({_t.time() - _ph_start:.2f}s)", flush=True)

    # ── Advanced Tools ──
    st.markdown("---")
    st.markdown(_section_label("Advanced Tools"), unsafe_allow_html=True)

    with st.expander("VaR/CVaR Portfolio Optimization", expanded=False):
        st.info("Calculate optimal portfolio weights to minimize tail risk (VaR/CVaR)")

        if st.button("Run Optimization", type="primary", key="run_var_cvar_opt"):
            with st.spinner("Calculating optimal portfolio weights..."):
                rebalancing_df, opt_metrics = calculate_var_cvar_portfolio_optimization(enhanced_df)

                if rebalancing_df is not None and opt_metrics is not None:
                    st.markdown(_section_label("Optimization Results"), unsafe_allow_html=True)

                    col1, col2, col3, col4 = st.columns(4)
                    with col1:
                        st.metric("VaR Reduction",
                                 f"{opt_metrics['var_reduction_pct']:.1f}%",
                                 f"{opt_metrics['current_var']:.2f}% → {opt_metrics['optimal_var']:.2f}%",
                                 delta_color="inverse")

                    with col2:
                        st.metric("CVaR Reduction",
                                 f"{opt_metrics['cvar_reduction_pct']:.1f}%",
                                 f"{opt_metrics['current_cvar']:.2f}% → {opt_metrics['optimal_cvar']:.2f}%",
                                 delta_color="inverse")

                    with col3:
                        st.metric("Sharpe Improvement",
                                 f"+{opt_metrics['sharpe_improvement']:.2f}",
                                 f"{opt_metrics['current_sharpe']:.2f} → {opt_metrics['optimal_sharpe']:.2f}")

                    with col4:
                        st.metric("Trades Required",
                                 opt_metrics['total_trades'],
                                 f"Est. Cost: ${opt_metrics['rebalancing_cost']:,.0f}")

                    enhanced_df_with_opt = enhanced_df.merge(
                        rebalancing_df[['Ticker', 'Optimal Weight %', 'Weight Diff %',
                                       'Shares to Trade', 'Trade Value', 'Action']],
                        on='Ticker',
                        how='left'
                    )

                    st.markdown(_section_label("Rebalancing Targets"), unsafe_allow_html=True)
                    display_df_opt = style_holdings_dataframe_with_optimization(enhanced_df_with_opt)
                    from core.atlas_table_formatting import render_generic_table
                    col_defs_opt = [{'key': c, 'label': c, 'type': 'ticker' if c in ('Ticker', 'Display Ticker') else ('price' if any(k in c for k in ('Price', 'Value', 'Cost')) else ('change' if '%' in c or 'Diff' in c else ('text')))} for c in display_df_opt.columns]
                    st.markdown(render_generic_table(display_df_opt, columns=col_defs_opt), unsafe_allow_html=True)
                else:
                    st.error("Unable to calculate optimization. Ensure sufficient position data exists.")

    with st.expander("System Test & Validation", expanded=False):
        st.info("Run diagnostic tests to verify ATLAS system components")

        if st.button("Run System Test", type="primary", key="run_system_test"):
            st.markdown(_section_label("Test Results"), unsafe_allow_html=True)

            col1, col2, col3 = st.columns(3)

            with col1:
                st.markdown("**Database Test**")
                try:
                    conn = get_db()
                    portfolio = conn.get_portfolio()
                    pos_count = len(portfolio)
                    if pos_count > 0:
                        st.success(f"Database: {pos_count} positions")
                    else:
                        st.warning("Database: No positions")
                except (ValueError, KeyError, TypeError, AttributeError, ConnectionError) as e:
                    st.error(f"Database: {str(e)}")

            with col2:
                st.markdown("**Import Tests**")
                try:
                    import plotly.express as px
                    st.success("plotly.express")
                except ImportError:
                    st.error("plotly.express")
                try:
                    import plotly.graph_objects as go
                    st.success("plotly.graph_objects")
                except ImportError:
                    st.error("plotly.graph_objects")
                try:
                    from scipy import stats
                    st.success("scipy.stats")
                except ImportError:
                    st.error("scipy.stats")

            with col3:
                st.markdown("**Portfolio Test**")
                try:
                    portfolio_data_test = load_portfolio_data()
                    if portfolio_data_test is not None:
                        if isinstance(portfolio_data_test, pd.DataFrame):
                            if not portfolio_data_test.empty:
                                st.success(f"Portfolio: {len(portfolio_data_test)} positions")
                            else:
                                st.warning("Portfolio: Empty")
                        else:
                            st.warning("Portfolio: Not a DataFrame")
                    else:
                        st.warning("Portfolio: No data")
                except (ValueError, KeyError, TypeError, AttributeError) as e:
                    st.error(f"Portfolio: {str(e)}")

            st.markdown("---")
            st.markdown("**Options Filtering Test**")
            test_tickers = ['AAPL', 'AU2520F50', 'TSLA', 'META2405D482.5', 'MSFT']
            filtered = [t for t in test_tickers if is_option_ticker(t)]
            if len(filtered) == 2 and 'AU2520F50' in filtered and 'META2405D482.5' in filtered:
                st.success(f"Options filtering working: {filtered}")
            else:
                st.error(f"Options filtering failed: {filtered}")


def render_earnings_calendar(enhanced_df):
    """Display upcoming earnings for portfolio holdings using Alpha Vantage."""
    try:
        from core.alpha_vantage import av_client, ALPHA_VANTAGE_AVAILABLE
    except ImportError:
        ALPHA_VANTAGE_AVAILABLE = False

    if not ALPHA_VANTAGE_AVAILABLE or av_client is None:
        return

    st.markdown("---")
    st.markdown('<div class="section-label">Upcoming Earnings</div>', unsafe_allow_html=True)
    st.caption("Earnings calendar for your holdings — powered by Alpha Vantage (cached 12 hours)")

    try:
        ticker_col = None
        for col_name in ['Display Ticker', 'Ticker', 'ticker', 'Symbol', 'symbol']:
            if col_name in enhanced_df.columns:
                ticker_col = col_name
                break

        if ticker_col is None:
            st.info("Could not identify ticker column in portfolio data.")
            return

        portfolio_tickers = enhanced_df[ticker_col].dropna().unique().tolist()
        from core import is_option_ticker
        clean_tickers = [t.split('.')[0].upper() for t in portfolio_tickers if not is_option_ticker(str(t))]

        if not clean_tickers:
            st.info("No equity holdings found for earnings tracking.")
            return

        earnings_df = av_client.get_earnings_calendar()

        if earnings_df is None or earnings_df.empty:
            st.info("Earnings calendar data unavailable.")
            return

        symbol_col = None
        for col_name in ['symbol', 'ticker', 'Symbol', 'Ticker']:
            if col_name in earnings_df.columns:
                symbol_col = col_name
                break

        if symbol_col is None:
            st.info("Earnings data format unrecognized.")
            return

        portfolio_earnings = earnings_df[earnings_df[symbol_col].isin(clean_tickers)].copy()

        if portfolio_earnings.empty:
            st.info("No upcoming earnings found for your holdings.")
            return

        date_col = None
        for col_name in ['reportDate', 'report_date', 'date', 'Date']:
            if col_name in portfolio_earnings.columns:
                date_col = col_name
                break

        if date_col:
            portfolio_earnings = portfolio_earnings.sort_values(date_col)

        st.markdown(f"**{len(portfolio_earnings)}** of your holdings reporting soon:")

        display_cols = []
        rename_map = {}
        for orig, nice in [(symbol_col, 'Ticker'), (date_col, 'Report Date'),
                           ('estimate', 'EPS Estimate'), ('currency', 'Currency'),
                           ('fiscalDateEnding', 'Fiscal Date')]:
            if orig and orig in portfolio_earnings.columns:
                display_cols.append(orig)
                rename_map[orig] = nice

        from core.atlas_table_formatting import render_generic_table
        if display_cols:
            display_df = portfolio_earnings[display_cols].rename(columns=rename_map)
            earn_cols = [{'key': c, 'label': c, 'type': 'ticker' if c == 'Ticker' else ('price' if 'EPS' in c else 'text')} for c in display_df.columns]
            st.markdown(render_generic_table(display_df, columns=earn_cols), unsafe_allow_html=True)
        else:
            earn_cols = [{'key': c, 'label': c, 'type': 'text'} for c in portfolio_earnings.columns]
            st.markdown(render_generic_table(portfolio_earnings.head(20), columns=earn_cols), unsafe_allow_html=True)

    except (KeyError, ValueError, TypeError, AttributeError, ConnectionError) as e:
        st.warning(f"Could not load earnings calendar: {e}")
