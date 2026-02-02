"""
ATLAS Terminal - Portfolio Home Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, add_arrow_indicator


def render_portfolio_home(start_date, end_date):
    """Render the Portfolio Home page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from atlas_app import (
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
        make_scrollable_table,
        get_db,
        is_option_ticker,
        ATLASFormatter,
    )
    from ui.components import ATLAS_TEMPLATE

    st.markdown("## 🏠 PORTFOLIO HOME")

    # CRITICAL FIX: Check session_state FIRST for fresh EE data
    # load_portfolio_data() loads from database/pickle which loses attrs and some EE columns
    # session_state has the complete data with attrs intact from the latest sync
    if 'portfolio_df' in st.session_state and st.session_state['portfolio_df'] is not None and len(st.session_state['portfolio_df']) > 0:
        portfolio_data = st.session_state['portfolio_df']
    else:
        portfolio_data = load_portfolio_data()

    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        st.warning("⚠️ No portfolio data. Please upload via Phoenix Parser.")
        st.stop()

    # CRITICAL FIX: Don't wrap in pd.DataFrame() - it destroys attrs!
    # load_portfolio_data() already returns a DataFrame with attrs intact
    df = portfolio_data

    # Get currency symbol from portfolio metadata (Phase 1 Fix)
    # CRITICAL FIX: Check attrs first, then session_state as fallback (attrs lost during save/load)
    currency_symbol = df.attrs.get('currency_symbol') or st.session_state.get('currency_symbol', '$')
    currency = df.attrs.get('currency') or st.session_state.get('currency', 'USD')

    # Process holdings data (removed diagnostic display for cleaner UI)
    with st.spinner("Loading..."):
        enhanced_df = create_enhanced_holdings_table(df)

    # FIX 3: Use Easy Equities' P&L directly - don't recalculate!
    # EE already provides correct values, just sum them up
    total_invested = enhanced_df['Total Cost'].sum()      # Total amount invested (Purchase_Value)
    current_value = enhanced_df['Total Value'].sum()      # Current market value
    total_pnl = enhanced_df['Total Gain/Loss $'].sum()    # EE's calculated P&L (already correct!)
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0
    daily_pl = enhanced_df['Daily P&L $'].sum()

    # For display purposes (keeping existing variable names for compatibility)
    equity = current_value  # Current portfolio value
    gross_exposure = current_value  # Same as current value (no leverage for EE portfolios)
    actual_leverage = 1.0  # EE portfolios are not leveraged
    total_cost = total_invested
    total_gl = total_pnl
    total_gl_pct = total_pnl_pct

    # ==================== CAPITAL STRUCTURE ====================
    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">💰</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Capital Structure</span></h2>', unsafe_allow_html=True)

    col1, col2, col3 = st.columns(3)

    with col1:
        # Use actual P&L percentage from EE data
        equity_growth_pct = total_pnl_pct
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(99,102,241,0.2); padding: 2rem 1.75rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden; min-height: 200px;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #6366f1, #8b5cf6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;"><span style="font-size: 1.1rem;">💼</span><p style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0; font-weight: 600;">PORTFOLIO VALUE</p></div><h3 style="font-size: 2.75rem; font-weight: 800; color: #f8fafc; margin: 0.75rem 0 1rem 0; line-height: 1;">{currency_symbol}{current_value:,.2f}</h3><div style="display: inline-block; padding: 0.5rem 1rem; background: rgba(99,102,241,0.12); border-radius: 12px; border: 1px solid rgba(99,102,241,0.25);"><p style="font-size: 0.8rem; color: #a5b4fc; margin: 0; font-weight: 600;">↑ Return: +{equity_growth_pct:.2f}%</p></div></div>', unsafe_allow_html=True)

    with col2:
        # Show total invested amount
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 2rem 1.75rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;"><span style="font-size: 1.1rem;">📊</span><p style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0; font-weight: 600;">TOTAL INVESTED</p></div><h3 style="font-size: 2.75rem; font-weight: 800; color: #f8fafc; margin: 0.75rem 0 1rem 0; line-height: 1;">{currency_symbol}{total_invested:,.2f}</h3><div style="display: inline-block; padding: 0.5rem 1rem; background: rgba(16,185,129,0.12); border-radius: 12px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.8rem; color: #6ee7b7; margin: 0; font-weight: 600;">Cost Basis</p></div></div>', unsafe_allow_html=True)

    with col3:
        # Show total P&L with color based on positive/negative
        pnl_color = '#10b981' if total_pnl >= 0 else '#ef4444'
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 2rem 1.75rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;"><span style="font-size: 1.1rem;">⚡</span><p style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0; font-weight: 600;">TOTAL P&L</p></div><h3 style="font-size: 2.75rem; font-weight: 800; color: {pnl_color}; margin: 0.75rem 0 1rem 0; text-shadow: 0 0 24px rgba(16,185,129,0.5); line-height: 1;">{currency_symbol}{total_pnl:,.2f}</h3><div style="display: inline-block; padding: 0.5rem 1rem; background: rgba(16,185,129,0.12); border-radius: 12px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.8rem; color: #6ee7b7; margin: 0; font-weight: 600;">↑ +{total_pnl_pct:.2f}%</p></div></div>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # PHASE 2A: Add status badges for leverage and performance
    st.markdown("<br>", unsafe_allow_html=True)

    # Determine leverage status
    target_lev = 1.7  # Target leverage ratio
    lev_diff = abs(actual_leverage - target_lev)
    if lev_diff < 0.1:
        lev_status = 'success'
        lev_text = 'On Target'
        lev_icon = '✓'
    elif lev_diff < 0.3:
        lev_status = 'warning'
        lev_text = 'Near Target'
        lev_icon = '⚠️'
    else:
        lev_status = 'danger'
        lev_text = 'Off Target'
        lev_icon = '!'

    # Determine performance status
    if total_gl_pct > 5:
        perf_status = 'success'
        perf_text = 'Strong Performance'
        perf_icon = '↑'
    elif total_gl_pct > 0:
        perf_status = 'info'
        perf_text = 'Positive'
        perf_icon = '↗'
    elif total_gl_pct > -5:
        perf_status = 'warning'
        perf_text = 'Slight Loss'
        perf_icon = '↘'
    else:
        perf_status = 'danger'
        perf_text = 'Underperforming'
        perf_icon = '↓'

    # INLINE BADGES - Direct HTML rendering (bypassing badge_group function)
    # Build badge HTML based on status
    if lev_status == 'success':
        lev_colors = {'bg': 'rgba(16,185,129,0.2)', 'border': 'rgba(16,185,129,0.4)', 'text': '#6ee7b7'}
    elif lev_status == 'warning':
        lev_colors = {'bg': 'rgba(245,158,11,0.2)', 'border': 'rgba(245,158,11,0.4)', 'text': '#fcd34d'}
    else:
        lev_colors = {'bg': 'rgba(239,68,68,0.2)', 'border': 'rgba(239,68,68,0.4)', 'text': '#fca5a5'}

    if perf_status == 'success':
        perf_colors = {'bg': 'rgba(16,185,129,0.2)', 'border': 'rgba(16,185,129,0.4)', 'text': '#6ee7b7'}
    elif perf_status == 'info':
        perf_colors = {'bg': 'rgba(59,130,246,0.2)', 'border': 'rgba(59,130,246,0.4)', 'text': '#93c5fd'}
    elif perf_status == 'warning':
        perf_colors = {'bg': 'rgba(245,158,11,0.2)', 'border': 'rgba(245,158,11,0.4)', 'text': '#fcd34d'}
    else:
        perf_colors = {'bg': 'rgba(239,68,68,0.2)', 'border': 'rgba(239,68,68,0.4)', 'text': '#fca5a5'}

    neutral_colors = {'bg': 'rgba(148,163,184,0.15)', 'border': 'rgba(148,163,184,0.3)', 'text': '#cbd5e1'}

    st.markdown(f"""
    <div style='display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;'>
        <span style='display: inline-block; padding: 0.375rem 1rem; font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 12px; background: {lev_colors['bg']}; border: 1px solid {lev_colors['border']}; color: {lev_colors['text']}; transition: all 0.2s ease;'>{lev_icon} Leverage: {lev_text}</span>
        <span style='display: inline-block; padding: 0.375rem 1rem; font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 12px; background: {perf_colors['bg']}; border: 1px solid {perf_colors['border']}; color: {perf_colors['text']}; transition: all 0.2s ease;'>{perf_icon} {perf_text} ({total_gl_pct:+.1f}%)</span>
        <span style='display: inline-block; padding: 0.375rem 1rem; font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 12px; background: {neutral_colors['bg']}; border: 1px solid {neutral_colors['border']}; color: {neutral_colors['text']}; transition: all 0.2s ease;'>{len(enhanced_df)} Positions</span>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("---")

    # ==================== PERFORMANCE (ON EQUITY BASIS) ====================
    st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">📊</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Performance (on Equity Basis)</span></h2>', unsafe_allow_html=True)

    col1, col2, col3, col4, col5, col6 = st.columns(6)

    # Card 1: Portfolio Return (Equity)
    with col1:
        roe_color = '#10b981' if total_gl >= 0 else '#ef4444'
        roe_glow = '0 0 24px rgba(16,185,129,0.5)' if total_gl >= 0 else ''
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">PORTFOLIO RETURN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {roe_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: {roe_glow}; line-height: 1;">{format_percentage(total_gl_pct)}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">↑ {format_currency(total_gl, currency_symbol=currency_symbol)}</p></div></div>', unsafe_allow_html=True)

    # Card 2: Daily P&L
    with col2:
        daily_color = '#10b981' if daily_pl >= 0 else '#ef4444'
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(99,102,241,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #6366f1, #8b5cf6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💰</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">DAILY P&L</p></div><h3 style="font-size: 2.5rem; font-weight: 800; background: linear-gradient(135deg, #00d4ff, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{format_currency(daily_pl, currency_symbol=currency_symbol)}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(99,102,241,0.12); border-radius: 10px; border: 1px solid rgba(99,102,241,0.25);"><p style="font-size: 0.7rem; color: #a5b4fc; margin: 0; font-weight: 500;">▲ Today</p></div></div>', unsafe_allow_html=True)

    # Card 3: Total P&L (using EE's already-calculated values)
    with col3:
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💵</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">TOTAL P&L</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #10b981; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(16,185,129,0.5); line-height: 1;">{format_currency(total_pnl, currency_symbol=currency_symbol)}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">↑ +{total_pnl_pct:.2f}%</p></div></div>', unsafe_allow_html=True)

    # Card 4: Total Cost Basis
    with col4:
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💼</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">COST BASIS</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #67e8f9; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{format_currency(total_cost, currency_symbol=currency_symbol)}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 500;">Investment</p></div></div>', unsafe_allow_html=True)

    # Card 5: Unrealized G/L (using EE's already-calculated values)
    with col5:
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">UNREALIZED G/L</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #10b981; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(16,185,129,0.5); line-height: 1;">{format_currency(total_pnl, currency_symbol=currency_symbol)}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">↑ {total_pnl_pct:.2f}%</p></div></div>', unsafe_allow_html=True)

    # Card 6: Positions
    with col6:
        st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📍</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">POSITIONS</p></div><h3 style="font-size: 2.5rem; font-weight: 800; background: linear-gradient(135deg, #8b5cf6, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{len(enhanced_df)}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 500;">Holdings</p></div></div>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("---")

    # Risk Snapshot & Signal Health (collapsed by default for cleaner UI)
    portfolio_returns = calculate_portfolio_returns(df, start_date, end_date)

    with st.expander("🎯 Portfolio Health & Risk Snapshot", expanded=False):
        col_health, col_snapshot = st.columns([1, 3])

        with col_health:
            # Calculate metrics for health indicator
            if is_valid_series(portfolio_returns):
                metrics = calculate_performance_metrics(enhanced_df, portfolio_returns, None)
                health_badge = create_signal_health_badge(metrics)
                st.markdown(health_badge, unsafe_allow_html=True)
                st.caption(f"**Last Updated:** {ATLASFormatter.format_timestamp()}")

        with col_snapshot:
            # Risk Snapshot
            risk_snapshot_html = create_risk_snapshot(enhanced_df, portfolio_returns)
            st.markdown(risk_snapshot_html, unsafe_allow_html=True)

    st.markdown("---")
    st.markdown("### 📋 Holdings")

    # Column selector for interactive table customization
    with st.expander("⚙️ Customize Columns", expanded=False):
        # Define all available columns (Phase 1 Fix: Use Display Ticker)
        ALL_COLUMNS = [
            'Display Ticker', 'Asset Name', 'Shares', 'Avg Cost', 'Current Price',
            'Daily Change %', '5D Return %', 'YTD Return %',
            'Weight % of Equity', 'Weight % of Gross', 'Weight %',
            'Daily P&L $', 'Total Gain/Loss $', 'Total Gain/Loss %',
            'Beta', 'Analyst Rating', 'Quality Score', 'Sector',
            'Price Target', 'Volume'
        ]

        # Default columns to show (include both new weight columns)
        DEFAULT_COLUMNS = [
            'Display Ticker', 'Asset Name', 'Shares', 'Current Price',
            'Daily Change %', '5D Return %',
            'Weight % of Equity', 'Weight % of Gross',
            'Total Gain/Loss $', 'Total Gain/Loss %', 'Quality Score'
        ]

        # Filter only columns that exist in enhanced_df
        available_columns = [col for col in ALL_COLUMNS if col in enhanced_df.columns]
        default_selected = [col for col in DEFAULT_COLUMNS if col in enhanced_df.columns]

        selected_columns = st.multiselect(
            "Select Columns to Display",
            options=available_columns,
            default=default_selected,
            help="Choose which columns to show in the holdings table"
        )

    # Display holdings table (PHASE 2A: Enhanced with atlas_table)
    if selected_columns:
        # Create display dataframe with selected columns
        display_df = enhanced_df[selected_columns].copy()

        # Format columns appropriately
        pct_cols = [col for col in selected_columns if '%' in col]
        for col in pct_cols:
            if col in display_df.columns:
                display_df[col] = display_df[col].apply(lambda x: format_percentage(x) if pd.notna(x) else 'N/A')

        currency_cols = ['Avg Cost', 'Current Price', 'Daily P&L $', 'Total Gain/Loss $', 'Price Target']
        for col in currency_cols:
            if col in display_df.columns:
                display_df[col] = display_df[col].apply(lambda x: format_currency(x, currency_symbol=currency_symbol) if pd.notna(x) else 'N/A')

        # Add arrow indicators for change columns
        if 'Daily Change %' in display_df.columns:
            display_df['Daily Change %'] = display_df['Daily Change %'].apply(add_arrow_indicator)
        if 'Total Gain/Loss %' in display_df.columns:
            display_df['Total Gain/Loss %'] = display_df['Total Gain/Loss %'].apply(add_arrow_indicator)

        # PHASE 2A: Enhanced table with inline HTML (bypassing atlas_table function)
        st.markdown(f"""
        <h3 style='font-size: 1.25rem; font-weight: 700; color: #f8fafc; margin-bottom: 1rem; background: linear-gradient(135deg, #00d4ff 0%, #6366f1 50%, #8b5cf6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;'>Current Holdings</h3>
        """, unsafe_allow_html=True)

        # Add neon border styling to holdings table container
        st.markdown("""
        <style>
        .holdings-table-container {
            border: 2px solid rgba(0, 188, 212, 0.5);
            border-radius: 12px;
            padding: 8px;
            margin: 12px 0;
            box-shadow:
                0 0 15px rgba(0, 188, 212, 0.3),
                0 0 30px rgba(0, 188, 212, 0.15),
                inset 0 0 20px rgba(0, 188, 212, 0.05);
            background: linear-gradient(135deg, rgba(26, 29, 41, 0.95), rgba(20, 23, 35, 0.9));
        }
        </style>
        <div class="holdings-table-container">
        """, unsafe_allow_html=True)

        # Use Streamlit's native dataframe with custom styling
        st.dataframe(
            display_df,
            use_container_width=True,
            height=500,
            hide_index=True
        )

        # Close the neon border container
        st.markdown("</div>", unsafe_allow_html=True)

        # Add explanation for dual weight columns
        if 'Weight % of Equity' in selected_columns or 'Weight % of Gross' in selected_columns:
            st.caption(f"""
            **Understanding Position Weights:**
            - **Weight % of Equity**: Position value as % of your {currency_symbol}{equity:,.0f} equity (can exceed 100% with {actual_leverage:.2f}x leverage!)
            - **Weight % of Gross**: Position value as % of {currency_symbol}{gross_exposure:,.0f} gross exposure (always sums to 100%)
            - With {actual_leverage:.2f}x leverage, a 50% equity weight = {50/actual_leverage:.1f}% gross weight
            """)
    else:
        st.warning("⚠️ Please select at least one column to display")

    st.info("💡 **Tip:** Head to the Valuation House to analyze intrinsic values of any ticker!")

    st.markdown("---")
    st.markdown("### 📊 ANALYST DASHBOARD")

    # ===== SECTOR ATTRIBUTION =====
    st.markdown("#### 💼 Sector Attribution")
    pnl_sector = create_pnl_attribution_sector(enhanced_df)
    if pnl_sector:
        # PHASE 2A: Apply ATLAS template
        pnl_sector.update_layout(template=ATLAS_TEMPLATE)
        st.plotly_chart(pnl_sector, use_container_width=True, key="sector_pnl")
    else:
        st.info("Sector P&L will display when holdings have sector data")

    # Additional position-level P&L analysis
    st.markdown("---")
    st.markdown("### 💼 Top Contributors")

    pnl_position = create_pnl_attribution_position(enhanced_df, top_n=10)
    if pnl_position:
        # PHASE 2A: Apply ATLAS template
        pnl_position.update_layout(template=ATLAS_TEMPLATE)
        st.plotly_chart(pnl_position, use_container_width=True)

    # Performance Heatmap (full width) - Only show if meaningful data exists
    st.markdown("---")
    if should_display_monthly_heatmap(enhanced_df):
        st.markdown("### 📅 Monthly Performance")
        perf_heatmap = create_performance_heatmap(enhanced_df)
        if perf_heatmap:
            # PHASE 2A: Apply ATLAS template
            perf_heatmap.update_layout(template=ATLAS_TEMPLATE)
            st.plotly_chart(perf_heatmap, use_container_width=True)
    else:
        st.info("📊 Monthly performance heatmap will be available after 2+ months of portfolio history")

    # ===== ADVANCED TOOLS - Collapsed by default for analyst focus =====
    st.markdown("---")
    st.markdown("### 🔧 Advanced Tools")

    # VaR/CVaR Optimization in expander
    with st.expander("🎯 VaR/CVaR Portfolio Optimization", expanded=False):
        st.info("Calculate optimal portfolio weights to minimize tail risk (VaR/CVaR)")

        if st.button("⚡ Run Optimization", type="primary", key="run_var_cvar_opt"):
            with st.spinner("Calculating optimal portfolio weights..."):
                rebalancing_df, opt_metrics = calculate_var_cvar_portfolio_optimization(enhanced_df)

                if rebalancing_df is not None and opt_metrics is not None:
                    # Display optimization summary
                    st.markdown("#### 📊 Optimization Results")

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

                    # Merge optimization data into enhanced_df for display
                    enhanced_df_with_opt = enhanced_df.merge(
                        rebalancing_df[['Ticker', 'Optimal Weight %', 'Weight Diff %',
                                       'Shares to Trade', 'Trade Value', 'Action']],
                        on='Ticker',
                        how='left'
                    )

                    # Display enhanced table with optimization columns
                    st.markdown("#### 📋 Rebalancing Targets")
                    display_df_opt = style_holdings_dataframe_with_optimization(enhanced_df_with_opt)
                    make_scrollable_table(display_df_opt, height=500, hide_index=True, use_container_width=True)
                else:
                    st.error("⚠️ Unable to calculate optimization. Ensure sufficient position data exists.")

    # System Test in expander
    with st.expander("🧪 System Test & Validation", expanded=False):
        st.info("Run diagnostic tests to verify ATLAS system components")

        if st.button("🧪 Run System Test", type="primary", key="run_system_test"):
            st.markdown("#### 🔍 Test Results")

            col1, col2, col3 = st.columns(3)

            # Test 1: Database
            with col1:
                st.markdown("**Database Test**")
                try:
                    conn = get_db()
                    portfolio = conn.get_portfolio()
                    pos_count = len(portfolio)

                    if pos_count > 0:
                        st.success(f"✅ Database: {pos_count} positions")
                    else:
                        st.warning("⚠️ Database: No positions")
                except Exception as e:
                    st.error(f"❌ Database: {str(e)}")

            # Test 2: Imports
            with col2:
                st.markdown("**Import Tests**")
                imports_ok = True

                try:
                    import plotly.express as px
                    st.success("✅ plotly.express")
                except:
                    st.error("❌ plotly.express")
                    imports_ok = False

                try:
                    import plotly.graph_objects as go
                    st.success("✅ plotly.graph_objects")
                except:
                    st.error("❌ plotly.graph_objects")
                    imports_ok = False

                try:
                    from scipy import stats
                    st.success("✅ scipy.stats")
                except:
                    st.error("❌ scipy.stats")
                    imports_ok = False

            # Test 3: Portfolio data
            with col3:
                st.markdown("**Portfolio Test**")
                try:
                    portfolio_data = load_portfolio_data()
                    if portfolio_data is not None:
                        if isinstance(portfolio_data, pd.DataFrame):
                            if not portfolio_data.empty:
                                st.success(f"✅ Portfolio: {len(portfolio_data)} positions")
                            else:
                                st.warning("⚠️ Portfolio: Empty")
                        else:
                            st.warning("⚠️ Portfolio: Not a DataFrame")
                    else:
                        st.warning("⚠️ Portfolio: No data")
                except Exception as e:
                    st.error(f"❌ Portfolio: {str(e)}")

            st.markdown("---")

            # Test 4: Options filtering
            st.markdown("**Options Filtering Test**")
            test_tickers = ['AAPL', 'AU2520F50', 'TSLA', 'META2405D482.5', 'MSFT']
            filtered = [t for t in test_tickers if is_option_ticker(t)]

            if len(filtered) == 2 and 'AU2520F50' in filtered and 'META2405D482.5' in filtered:
                st.success(f"✅ Options filtering working: {filtered}")
            else:
                st.error(f"❌ Options filtering failed: {filtered}")
