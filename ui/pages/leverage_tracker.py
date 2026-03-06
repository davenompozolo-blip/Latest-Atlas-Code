"""
ATLAS Terminal - Leverage Tracker Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_leverage_tracker():
    """Render the Leverage Tracker page."""
    # Import only what's needed from core
    from core import (
        # Data Functions
        load_portfolio_data,
        get_leverage_info,
        ATLASFormatter,
    )
    from ui.components import ATLAS_TEMPLATE

    st.markdown('<h1 style="font-size: 2.5rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.5rem;"><span style="font-size: 2rem;">📊</span> <span style="background: linear-gradient(135deg, #818cf8, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">LEVERAGE TRACKING & ANALYSIS</span></h1>', unsafe_allow_html=True)
    st.markdown("**Track how leverage has affected your returns over time**")

    # FIX #6: Removed duplicate upload - keep uploads centralized in Phoenix Parser
    # Check if leverage tracker exists in session state OR if Alpaca engine is available
    _alpaca_engine = st.session_state.get('_alpaca_data_engine')
    _has_tracker = 'leverage_tracker' in st.session_state
    _has_alpaca = _alpaca_engine is not None and _alpaca_engine.account_snapshot is not None

    if not _has_tracker and not _has_alpaca:
        st.warning("⚠️ No performance history loaded")
        st.info("""
        **To use Leverage Tracking:**

        1. **Connect Alpaca** via the Alpaca Integration page — leverage data will auto-populate, OR
        2. Go to 🔥 **Phoenix Parser** (in sidebar navigation)
        3. Scroll to "📊 Leverage Tracking" section
        4. Upload your Investopedia performance-history.xls file
        5. Return to this page to view full analysis
        """)

        st.markdown("---")
        st.caption("💡 Tip: Use the sidebar navigation to quickly switch between pages")

        return  # Exit early if no data source

    # ===== ALPACA LEVERAGE DATA (when engine is available) =====
    if _has_alpaca:
        snap = _alpaca_engine.account_snapshot
        equity = snap.get('equity', 0)
        long_val = snap.get('long_market_value', 0)
        short_val = abs(snap.get('short_market_value', 0))
        gross_exposure = long_val + short_val
        current_leverage = gross_exposure / equity if equity > 0 else 0
        cash = snap.get('cash', 0)

        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">🦙</span> <span style="background: linear-gradient(135deg, #10b981, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Alpaca Live Leverage Data</span></h2>', unsafe_allow_html=True)

        col1, col2, col3, col4, col5 = st.columns(5)
        with col1:
            lev_color = '#10b981' if current_leverage < 2.0 else '#ef4444'
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(99,102,241,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 180px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #6366f1, #8b5cf6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">⚡</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CURRENT LEVERAGE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {lev_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{current_leverage:.2f}x</h3></div>', unsafe_allow_html=True)
        with col2:
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 180px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💰</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">NET EQUITY</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #10b981; margin: 0.5rem 0 0.75rem 0; line-height: 1;">${equity:,.0f}</h3></div>', unsafe_allow_html=True)
        with col3:
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 180px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">GROSS EXPOSURE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #67e8f9; margin: 0.5rem 0 0.75rem 0; line-height: 1;">${gross_exposure:,.0f}</h3></div>', unsafe_allow_html=True)
        with col4:
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 180px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💵</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CASH</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #67e8f9; margin: 0.5rem 0 0.75rem 0; line-height: 1;">${cash:,.0f}</h3></div>', unsafe_allow_html=True)
        with col5:
            margin_used = snap.get('initial_margin', 0)
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 180px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🏦</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">MARGIN USED</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #d8b4fe; margin: 0.5rem 0 0.75rem 0; line-height: 1;">${margin_used:,.0f}</h3></div>', unsafe_allow_html=True)

        # Portfolio equity curve from engine
        ph = _alpaca_engine.portfolio_history
        if ph is not None and not ph.empty and 'equity' in ph.columns:
            st.markdown("---")
            st.markdown("#### 📈 Equity Curve (from Alpaca Portfolio History)")
            import plotly.graph_objects as _go
            _fig = _go.Figure()
            _fig.add_trace(_go.Scatter(
                x=ph.index, y=ph['equity'],
                mode='lines', name='Equity',
                line=dict(color='#10b981', width=2),
                fill='tozeroy', fillcolor='rgba(16,185,129,0.08)',
            ))
            _fig.update_layout(
                paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
                font=dict(color='#94a3b8', size=11),
                margin=dict(l=16, r=16, t=32, b=16),
                xaxis=dict(gridcolor='rgba(255,255,255,0.04)', linecolor='#1E2D45'),
                yaxis=dict(gridcolor='rgba(255,255,255,0.04)', linecolor='#1E2D45', tickprefix='$'),
                height=350,
            )
            st.plotly_chart(_fig, use_container_width=True)

        # Performance metrics from engine
        if _alpaca_engine.performance:
            perf = _alpaca_engine.performance
            st.markdown("#### 📊 Performance Metrics")
            _p1, _p2, _p3, _p4 = st.columns(4)
            with _p1:
                st.metric("Sharpe Ratio", f"{perf.get('sharpe_ratio', 0):.2f}")
            with _p2:
                st.metric("Max Drawdown", f"{perf.get('max_drawdown', 0)*100:.1f}%")
            with _p3:
                st.metric("CAGR", f"{perf.get('cagr', 0)*100:.1f}%")
            with _p4:
                st.metric("Win Rate", f"{perf.get('win_rate', 0)*100:.0f}%")

        # Risk metrics from engine
        if _alpaca_engine.risk_metrics:
            risk = _alpaca_engine.risk_metrics
            st.markdown("#### ⚠️ Risk Metrics")
            _r1, _r2, _r3, _r4 = st.columns(4)
            with _r1:
                st.metric("VaR (95%)", f"{risk.get('var_95', 0)*100:.2f}%")
            with _r2:
                st.metric("CVaR (95%)", f"{risk.get('cvar_95', 0)*100:.2f}%")
            with _r3:
                st.metric("Volatility (Ann.)", f"{risk.get('annual_volatility', 0)*100:.1f}%")
            with _r4:
                st.metric("Skewness", f"{risk.get('skewness', 0):.2f}")

        st.markdown("---")
        st.caption("🦙 Leverage data sourced from Alpaca REST API via AlpacaDataEngine")

        # Also update equity capital from Alpaca if available
        if equity > 0:
            st.session_state['equity_capital'] = equity

    if not _has_tracker and _has_alpaca:
        # Only Alpaca data — skip the tracker-specific sections
        return
    else:
        # Display leverage analysis
        tracker = st.session_state.leverage_tracker
        stats = tracker.get_current_stats()

        # Header metrics
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">📊</span> <span style="background: linear-gradient(135deg, #818cf8, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Current Statistics</span></h2>', unsafe_allow_html=True)

        col1, col2, col3, col4, col5 = st.columns(5)

        # Card 1: Current Leverage
        with col1:
            lev_color = '#10b981' if abs(stats['current_leverage'] - 1.7) < 0.3 else '#ef4444'
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(99,102,241,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #6366f1, #8b5cf6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">⚡</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">CURRENT LEVERAGE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {lev_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{stats["current_leverage"]:.2f}x</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(99,102,241,0.12); border-radius: 10px; border: 1px solid rgba(99,102,241,0.25);"><p style="font-size: 0.7rem; color: #a5b4fc; margin: 0; font-weight: 600;">Target: 1.7x</p></div></div>', unsafe_allow_html=True)

        # Card 2: Net Equity
        with col2:
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💰</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">NET EQUITY</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #10b981; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(16,185,129,0.5); line-height: 1;">${stats["current_equity"]:,.0f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">Your Capital</p></div></div>', unsafe_allow_html=True)

        # Card 3: Gross Exposure
        with col3:
            exposure_pct = ((stats['current_gross_exposure'] / stats['current_equity'] - 1) * 100) if stats['current_equity'] > 0 else 0
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">GROSS EXPOSURE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #67e8f9; margin: 0.5rem 0 0.75rem 0; line-height: 1;">${stats["current_gross_exposure"]:,.0f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">+{exposure_pct:.0f}% vs Equity</p></div></div>', unsafe_allow_html=True)

        # Card 4: YTD Equity Return
        with col4:
            ytd_color = '#10b981' if stats['ytd_equity_return'] >= 0 else '#ef4444'
            ytd_glow = '0 0 24px rgba(16,185,129,0.5)' if stats['ytd_equity_return'] >= 0 else '0 0 24px rgba(239,68,68,0.5)'
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">YTD EQUITY RETURN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {ytd_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: {ytd_glow}; line-height: 1;">{stats["ytd_equity_return"]:+.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">On Your Capital</p></div></div>', unsafe_allow_html=True)

        # Card 5: YTD Gross Return
        with col5:
            gross_color = '#10b981' if stats['ytd_gross_return'] >= 0 else '#ef4444'
            gross_glow = '0 0 24px rgba(16,185,129,0.5)' if stats['ytd_gross_return'] >= 0 else '0 0 24px rgba(239,68,68,0.5)'
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(99,102,241,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #6366f1, #8b5cf6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">💎</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">YTD GROSS RETURN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {gross_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: {gross_glow}; line-height: 1;">{stats["ytd_gross_return"]:+.1f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(99,102,241,0.12); border-radius: 10px; border: 1px solid rgba(99,102,241,0.25);"><p style="font-size: 0.7rem; color: #a5b4fc; margin: 0; font-weight: 600;">Portfolio Perf</p></div></div>', unsafe_allow_html=True)

        # Additional stats row
        st.markdown("<br>", unsafe_allow_html=True)
        col1, col2, col3 = st.columns(3)

        # Card 6: Average Leverage
        with col1:
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">AVERAGE LEVERAGE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #67e8f9; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{stats["avg_leverage"]:.2f}x</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">Historical Avg</p></div></div>', unsafe_allow_html=True)

        # Card 7: Max Leverage
        with col2:
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(239,68,68,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(239,68,68,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ef4444, #dc2626); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">⚠️</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">MAX LEVERAGE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #ef4444; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(239,68,68,0.5); line-height: 1;">{stats["max_leverage"]:.2f}x</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(239,68,68,0.12); border-radius: 10px; border: 1px solid rgba(239,68,68,0.25);"><p style="font-size: 0.7rem; color: #fca5a5; margin: 0; font-weight: 600;">Peak Risk</p></div></div>', unsafe_allow_html=True)

        # Card 8: Min Leverage
        with col3:
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">✅</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">MIN LEVERAGE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #10b981; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(16,185,129,0.5); line-height: 1;">{stats["min_leverage"]:.2f}x</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">Conservative</p></div></div>', unsafe_allow_html=True)

        # Dashboard
        st.markdown("---")
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">📊</span> <span style="background: linear-gradient(135deg, #818cf8, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">6-Chart Leverage Dashboard</span></h2>', unsafe_allow_html=True)

        fig = tracker.create_leverage_dashboard()
        st.plotly_chart(fig, use_container_width=True)

        # Workings
        st.markdown("---")
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">🧮</span> <span style="background: linear-gradient(135deg, #818cf8, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Calculation Workings</span></h2>', unsafe_allow_html=True)
        st.markdown("**See exactly how leverage is calculated**")

        workings = tracker.create_workings_display()
        st.markdown(workings)

        # Historical data table
        st.markdown("---")
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">📋</span> <span style="background: linear-gradient(135deg, #818cf8, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Historical Data Table</span></h2>', unsafe_allow_html=True)

        display_df = tracker.leverage_history[[
            'Date', 'Net Equity', 'Gross Exposure', 'Leverage Ratio',
            'Equity Return (%)', 'Gross Return (%)', 'Leverage Impact (%)'
        ]].copy()

        # Format for display
        display_df['Date'] = display_df['Date'].dt.strftime('%Y-%m-%d')
        display_df['Net Equity'] = display_df['Net Equity'].apply(lambda x: f"${x:,.0f}")
        display_df['Gross Exposure'] = display_df['Gross Exposure'].apply(lambda x: f"${x:,.0f}")
        display_df['Leverage Ratio'] = display_df['Leverage Ratio'].apply(lambda x: f"{x:.2f}x")

        for col in ['Equity Return (%)', 'Gross Return (%)', 'Leverage Impact (%)']:
            display_df[col] = display_df[col].apply(lambda x: f"{x:.2f}%" if pd.notna(x) else "")

        from core.atlas_table_formatting import render_generic_table
        st.markdown(render_generic_table(display_df, columns=[
            {'key': 'Date', 'label': 'Date', 'type': 'text'},
            {'key': 'Net Equity', 'label': 'Net Equity', 'type': 'text'},
            {'key': 'Gross Exposure', 'label': 'Gross Exp.', 'type': 'text'},
            {'key': 'Leverage Ratio', 'label': 'Leverage', 'type': 'text'},
            {'key': 'Equity Return (%)', 'label': 'Equity Ret.', 'type': 'change'},
            {'key': 'Gross Return (%)', 'label': 'Gross Ret.', 'type': 'change'},
            {'key': 'Leverage Impact (%)', 'label': 'Lev. Impact', 'type': 'change'},
        ]), unsafe_allow_html=True)

        # Export options
        st.markdown("---")
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">💾</span> <span style="background: linear-gradient(135deg, #818cf8, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Export Options</span></h2>', unsafe_allow_html=True)

        col1, col2 = st.columns(2)

        with col1:
            if st.button("📥 Download Full Data (CSV)"):
                csv = tracker.leverage_history.to_csv(index=False)
                st.download_button(
                    label="Download CSV",
                    data=csv,
                    file_name="leverage_history.csv",
                    mime="text/csv"
                )

        with col2:
            if st.button("🔄 Clear Leverage Data"):
                del st.session_state.leverage_tracker
                st.success("✅ Leverage data cleared. Upload a new file to continue.")
                st.rerun()

    # ========================================================================
    # INVESTOPEDIA LIVE (v11.0) - FIXED TWO-STAGE AUTH

