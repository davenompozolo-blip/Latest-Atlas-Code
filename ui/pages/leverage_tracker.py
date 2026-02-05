"""
ATLAS Terminal - Leverage Tracker Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_leverage_tracker(start_date, end_date):
    """Render the Leverage Tracker page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import *
    from ui.components import ATLAS_TEMPLATE

    st.markdown('<h1 style="font-size: 2.5rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.5rem;"><span style="font-size: 2rem;">📊</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">LEVERAGE TRACKING & ANALYSIS</span></h1>', unsafe_allow_html=True)
    st.markdown("**Track how leverage has affected your returns over time**")

    # FIX #6: Removed duplicate upload - keep uploads centralized in Phoenix Parser
    # Check if leverage tracker exists in session state
    if 'leverage_tracker' not in st.session_state:
        st.warning("⚠️ No performance history loaded")
        st.info("""
        **To use Leverage Tracking:**

        1. Go to 🔥 **Phoenix Parser** (in sidebar navigation)
        2. Scroll to "📊 Leverage Tracking" section
        3. Upload your Investopedia performance-history.xls file
        4. Return to this page to view full analysis

        The performance history upload is centralized in Phoenix Parser to keep all data uploads in one place.
        """)

        # Show helpful navigation hint
        st.markdown("---")
        st.caption("💡 Tip: Use the sidebar navigation to quickly switch between pages")

        return  # Exit early if no tracker
    else:
        # Display leverage analysis
        tracker = st.session_state.leverage_tracker
        stats = tracker.get_current_stats()

        # Header metrics
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">📊</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Current Statistics</span></h2>', unsafe_allow_html=True)

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
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">📊</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">6-Chart Leverage Dashboard</span></h2>', unsafe_allow_html=True)

        fig = tracker.create_leverage_dashboard()
        st.plotly_chart(fig, use_container_width=True)

        # Workings
        st.markdown("---")
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">🧮</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Calculation Workings</span></h2>', unsafe_allow_html=True)
        st.markdown("**See exactly how leverage is calculated**")

        workings = tracker.create_workings_display()
        st.markdown(workings)

        # Historical data table
        st.markdown("---")
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">📋</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Historical Data Table</span></h2>', unsafe_allow_html=True)

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

        make_scrollable_table(display_df, height=400, hide_index=True, use_container_width=True)

        # Export options
        st.markdown("---")
        st.markdown('<h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.5rem;"><span style="font-size: 1.25rem;">💾</span> <span style="background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Export Options</span></h2>', unsafe_allow_html=True)

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
                st.experimental_rerun()

    # ========================================================================
    # INVESTOPEDIA LIVE (v11.0) - FIXED TWO-STAGE AUTH

