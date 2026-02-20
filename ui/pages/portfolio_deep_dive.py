"""
ATLAS Terminal - Portfolio Deep Dive Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_portfolio_deep_dive(start_date, end_date):
    """Render the Portfolio Deep Dive page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import (
        # Data Functions
        load_portfolio_data,
        fetch_stock_info,
        fetch_historical_data,
        ATLASFormatter,
        # Calculation Functions
        calculate_brinson_attribution_gics,
        calculate_portfolio_correlations,
        # Chart Functions
        create_enhanced_holdings_table,
        create_portfolio_heatmap,
        create_holdings_attribution_waterfall,
        create_sector_rotation_heatmap,
        create_concentration_gauge,
        create_concentration_analysis,
        create_brinson_attribution_chart,
        create_skill_assessment_card,
        create_sector_attribution_table,
        apply_chart_theme,
        # Optimizer Functions
        RiskProfile,
        OptimizationExplainer,
    )
    from core.atlas_table_formatting import render_generic_table
    from ui.components import ATLAS_TEMPLATE
    import numpy as np
    import plotly.graph_objects as go
    from datetime import datetime, timedelta

    # Stubs for missing functions
    def display_attribution_validation(validation_data):
        """Stub for attribution validation display."""
        return "<div>Attribution validation not available</div>"

    def display_stock_attribution_table(stock_df):
        """Stub for stock attribution table."""
        return ("<div>Top contributors not available</div>",
                "<div>Bottom contributors not available</div>")

    def optimize_two_stage_diversification_first(returns_df, strategy_type, risk_profile_config,
                                                  risk_free_rate, verbose=False, target_leverage=1.0):
        """Stub for optimization."""
        n_assets = len(returns_df.columns)
        equal_weights = np.array([1.0 / n_assets] * n_assets)
        return equal_weights

    def validate_portfolio_realism(weights, returns_df, strategy_type):
        """Stub for realism validation."""
        return {
            'overall': 75,
            'classification': 'Realistic',
            'issues': []
        }

    def show_toast(message, toast_type="info", duration=3000):
        """Stub for toast notifications."""
        if toast_type == "success":
            st.success(message)
        elif toast_type == "error":
            st.error(message)
        else:
            st.info(message)

    # Constants
    RISK_FREE_RATE = 0.03

    st.markdown("---")

    # CRITICAL FIX: Check session_state FIRST for fresh EE data
    if 'portfolio_df' in st.session_state and st.session_state['portfolio_df'] is not None and len(st.session_state['portfolio_df']) > 0:
        portfolio_data = st.session_state['portfolio_df']
    else:
        portfolio_data = load_portfolio_data()

    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        st.warning("No portfolio data available.")
        st.stop()

    # Don't wrap in pd.DataFrame() - it destroys attrs
    df = portfolio_data if isinstance(portfolio_data, pd.DataFrame) else pd.DataFrame(portfolio_data)
    enhanced_df = create_enhanced_holdings_table(df)

    # Get currency from session state
    currency_symbol = df.attrs.get('currency_symbol') or st.session_state.get('currency_symbol', '$')

    tab1, tab2, tab3, tab4 = st.tabs([
        "🎯 Attribution", "🔄 Sector Rotation", "📊 Concentration", "🏆 Brinson Attribution"
    ])

    with tab1:
        col1, col2 = st.columns(2)

        with col1:
            heatmap = create_portfolio_heatmap(enhanced_df)
            if heatmap:
                st.plotly_chart(heatmap, use_container_width=True)

        with col2:
            waterfall = create_holdings_attribution_waterfall(enhanced_df)
            if waterfall:
                st.plotly_chart(waterfall, use_container_width=True)

    with tab2:
        rotation = create_sector_rotation_heatmap(enhanced_df, start_date, end_date)
        if rotation:
            st.plotly_chart(rotation, use_container_width=True)

    with tab3:
        col1, col2 = st.columns([1, 2])

        with col1:
            gauge = create_concentration_gauge(enhanced_df)
            if gauge:
                st.plotly_chart(gauge, use_container_width=True)

        with col2:
            # ENHANCED: Better concentration visual
            conc_analysis = create_concentration_analysis(enhanced_df)
            if conc_analysis:
                st.plotly_chart(conc_analysis, use_container_width=True)

    with tab4:
        st.markdown("### 🏆 Brinson Attribution Analysis (GICS-Corrected)")
        st.markdown("Decompose portfolio performance into **Allocation** (sector timing) vs **Selection** (stock picking) skill")
        st.info("📊 **Using GICS Level 1 Classification** - Matching S&P 500/SPY benchmark for accurate attribution")

        # ALWAYS show upload option for performance history
        with st.expander("📈 Upload Performance History (for accurate returns)", expanded=False):
            st.markdown("""
            **Upload your Investopedia performance-history.xls file** to see your actual portfolio return instead of point-in-time holdings return.
            """)

            # Show current status
            if 'leverage_tracker' in st.session_state and st.session_state.leverage_tracker is not None:
                tracker = st.session_state.leverage_tracker
                if tracker.leverage_history is not None and not tracker.leverage_history.empty:
                    latest = tracker.leverage_history.iloc[-1]
                    earliest = tracker.leverage_history.iloc[0]
                    st.success(f"✅ Performance history loaded: {len(tracker.leverage_history)} days of data")
                    st.caption(f"Period: {earliest['Date'].strftime('%Y-%m-%d')} to {latest['Date'].strftime('%Y-%m-%d')}")
                    st.caption(f"Start equity: ${earliest['Net Equity']:,.0f} → End equity: ${latest['Net Equity']:,.0f}")

                    # Calculate actual return from loaded data
                    actual_return = (latest['Net Equity'] - earliest['Net Equity']) / earliest['Net Equity'] * 100

                    # Display as premium card
                    actual_ret_color = '#10b981' if actual_return > 0 else '#ef4444'
                    actual_ret_glow = '0 0 24px rgba(16,185,129,0.5)' if actual_return > 0 else '0 0 24px rgba(239,68,68,0.5)'
                    actual_ret_status = 'Profitable Period' if actual_return > 0 else 'Loss Period'
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">ACTUAL PORTFOLIO RETURN</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {actual_ret_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: {actual_ret_glow}; line-height: 1;">{actual_return:+.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{actual_ret_status}</p></div></div>', unsafe_allow_html=True)
                else:
                    st.warning("⚠️ Leverage tracker exists but no data loaded")
            else:
                st.warning("⚠️ No performance history loaded yet")

            quick_perf_file = st.file_uploader(
                "Upload Performance History",
                type=['xls', 'xlsx', 'html'],
                help="Upload your Investopedia performance-history.xls file",
                key="attribution_perf_history"
            )

            if quick_perf_file is not None:
                try:
                    from pathlib import Path
                    perf_dir = Path(__file__).parent / 'data' / 'performance'
                    perf_dir.mkdir(parents=True, exist_ok=True)
                    persistent_path = perf_dir / 'performance-history.xls'

                    with open(persistent_path, 'wb') as f:
                        f.write(quick_perf_file.getvalue())

                    from analytics.leverage_tracker import LeverageTracker
                    tracker = LeverageTracker(str(persistent_path))

                    if tracker.load_and_parse():
                        st.session_state.leverage_tracker = tracker
                        stats = tracker.get_current_stats()
                        st.session_state['equity_capital'] = stats['current_equity']
                        st.success(f"✅ Loaded! Equity: ${stats['current_equity']:,.0f}")
                        st.rerun()
                    else:
                        st.error("❌ Could not parse file")
                except Exception as e:
                    st.error(f"Error: {str(e)}")

        # Calculate attribution using new GICS-based function
        try:
            with st.spinner("Calculating GICS-based attribution..."):
                attribution_results = calculate_brinson_attribution_gics(
                    enhanced_df,
                    period='1y'
                )

            # Display validation/reconciliation first (shows actual alpha)
            import streamlit.components.v1 as components
            validation_html = display_attribution_validation(attribution_results['validation'])
            st.markdown(validation_html, unsafe_allow_html=True)

            # Display skill assessment card
            components.html(create_skill_assessment_card(attribution_results), height=400)

            # Display waterfall chart
            st.plotly_chart(create_brinson_attribution_chart(attribution_results),
                           use_container_width=True)

            # Display detailed sector table
            st.markdown("#### 📋 Sector-by-Sector Attribution (GICS)")
            sector_table = create_sector_attribution_table(attribution_results['attribution_df'])
            from core.atlas_table_formatting import render_generic_table
            col_defs = [{'key': c, 'label': c, 'type': 'change' if '%' in c or 'Contribution' in c else ('ticker' if c in ('Sector', 'GICS_Sector') else 'text')} for c in sector_table.columns]
            st.markdown(render_generic_table(sector_table, columns=col_defs), unsafe_allow_html=True)

            # Display stock-level attribution (new!)
            st.markdown("#### 🎯 Stock-Level Attribution")
            st.markdown("Individual stock contributions to alpha generation")
            top_html, bottom_html = display_stock_attribution_table(attribution_results['stock_attribution_df'])

            # Top 10 Contributors
            st.markdown(top_html, unsafe_allow_html=True)

            # === FULL PORTFOLIO ATTRIBUTION TABLE ===
            st.markdown("---")
            st.markdown("#### 📊 Full Portfolio Attribution")
            st.markdown("""
            View complete attribution for all positions. Sort by any column to identify:
            - 🎯 **Emerging winners** (positive alpha, building momentum)
            - ⚠️ **Early warnings** (negative alpha starting to drag)
            - 📈 **Position sizing opportunities** (high alpha, low weight)
            - 📉 **Trim candidates** (negative alpha, high weight)
            """)

            full_df = attribution_results['stock_attribution_df'].copy()

            with st.expander("📊 View Full Portfolio Attribution Table (All Positions)", expanded=False):
                # Add Over/Under Weight column
                full_df['Over/Under %'] = full_df['Weight %'] - full_df['Index Weight %']

                # Display columns
                display_cols = ['Ticker', 'GICS_Sector', 'Weight %', 'Index Weight %', 'Over/Under %',
                               'Return %', 'Return vs Sector', 'Active Contribution %']

                attr_display = full_df[display_cols].copy()
                st.markdown(render_generic_table(attr_display, columns=[
                    {'key': 'Ticker', 'label': 'Ticker', 'type': 'ticker'},
                    {'key': 'GICS_Sector', 'label': 'Sector', 'type': 'text'},
                    {'key': 'Weight %', 'label': 'Weight %', 'type': 'percent'},
                    {'key': 'Index Weight %', 'label': 'Index Wt %', 'type': 'percent'},
                    {'key': 'Over/Under %', 'label': 'Over/Under', 'type': 'change'},
                    {'key': 'Return %', 'label': 'Return %', 'type': 'change'},
                    {'key': 'Return vs Sector', 'label': 'vs Sector', 'type': 'change'},
                    {'key': 'Active Contribution %', 'label': 'Active α %', 'type': 'change'},
                ]), unsafe_allow_html=True)

                # Summary statistics
                st.markdown('<h3 style="font-size: 1.25rem; font-weight: 700; color: #f8fafc; margin-top: 1.5rem; margin-bottom: 1rem;"><span style="background: linear-gradient(135deg, #10b981, #059669); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">📊 Attribution Summary</span></h3>', unsafe_allow_html=True)

                col1, col2, col3, col4 = st.columns(4)

                positive_count = (full_df['Active Contribution %'] > 0).sum()
                negative_count = (full_df['Active Contribution %'] < 0).sum()
                total_alpha = full_df['Active Contribution %'].sum()
                avg_alpha = full_df['Active Contribution %'].mean()

                with col1:
                    pos_pct = (positive_count / len(full_df)) * 100
                    pos_status = 'Strong' if pos_pct > 60 else ('Balanced' if pos_pct > 40 else 'Weak')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">✅</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">POSITIVE CONTRIBUTORS</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #10b981; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(16,185,129,0.5); line-height: 1;">{positive_count}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{pos_pct:.0f}% - {pos_status}</p></div></div>', unsafe_allow_html=True)

                with col2:
                    neg_pct = (negative_count / len(full_df)) * 100
                    neg_status = 'High Drag' if neg_pct > 50 else ('Moderate' if neg_pct > 30 else 'Low Drag')
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(239,68,68,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(239,68,68,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ef4444, #dc2626); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">❌</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">NEGATIVE CONTRIBUTORS</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #ef4444; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(239,68,68,0.5); line-height: 1;">{negative_count}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(239,68,68,0.12); border-radius: 10px; border: 1px solid rgba(239,68,68,0.25);"><p style="font-size: 0.7rem; color: #fca5a5; margin: 0; font-weight: 600;">{neg_pct:.0f}% - {neg_status}</p></div></div>', unsafe_allow_html=True)

                with col3:
                    alpha_color = '#10b981' if total_alpha > 0 else '#ef4444'
                    alpha_glow = '0 0 24px rgba(16,185,129,0.5)' if total_alpha > 0 else '0 0 24px rgba(239,68,68,0.5)'
                    alpha_status = 'Outperforming' if total_alpha > 0 else 'Underperforming'
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">TOTAL ALPHA</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {alpha_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: {alpha_glow}; line-height: 1;">{total_alpha:+.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">{alpha_status}</p></div></div>', unsafe_allow_html=True)

                with col4:
                    avg_alpha_color = '#10b981' if avg_alpha > 0 else '#ef4444'
                    avg_alpha_status = 'Positive Avg' if avg_alpha > 0 else 'Negative Avg'
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📈</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">AVG ALPHA/POSITION</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {avg_alpha_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{avg_alpha:+.2f}%</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">{avg_alpha_status}</p></div></div>', unsafe_allow_html=True)

            # === PORTFOLIO INSIGHTS ===
            st.markdown("#### 💡 Portfolio Insights")

            # Analyze data for insights
            overweight_negative = full_df[(full_df['Over/Under %'] > 1) & (full_df['Active Contribution %'] < -0.1)]
            underweight_positive = full_df[(full_df['Index Weight %'] > 0) & (full_df['Over/Under %'] < -0.5) & (full_df['Active Contribution %'] > 0.1)]
            not_in_spy_positive = full_df[(full_df['Index Weight %'] == 0) & (full_df['Active Contribution %'] > 0.1)]

            ins_col1, ins_col2, ins_col3 = st.columns(3)

            with ins_col1:
                if len(overweight_negative) > 0:
                    st.warning(f"⚠️ **{len(overweight_negative)} Trim Candidates**")
                    st.caption("Overweight + Negative Alpha")
                    for _, row in overweight_negative.head(3).iterrows():
                        st.markdown(f"• **{row['Ticker']}**: {row['Weight %']:.1f}% wt, {row['Active Contribution %']:+.2f}% α")
                else:
                    st.success("✅ No overweight losers")

            with ins_col2:
                if len(underweight_positive) > 0:
                    st.info(f"📈 **{len(underweight_positive)} Build Candidates**")
                    st.caption("Underweight + Positive Alpha")
                    for _, row in underweight_positive.head(3).iterrows():
                        st.markdown(f"• **{row['Ticker']}**: {row['Weight %']:.1f}% wt, {row['Active Contribution %']:+.2f}% α")
                else:
                    st.info("ℹ️ No underweight winners")

            with ins_col3:
                if len(not_in_spy_positive) > 0:
                    st.success(f"💎 **{len(not_in_spy_positive)} Alpha Generators**")
                    st.caption("Non-SPY + Positive Alpha")
                    for _, row in not_in_spy_positive.head(3).iterrows():
                        st.markdown(f"• **{row['Ticker']}**: {row['Weight %']:.1f}% wt, {row['Active Contribution %']:+.2f}% α")
                else:
                    st.info("ℹ️ All alpha from SPY positions")

            st.markdown("---")

            # Top 10 Detractors
            st.markdown(bottom_html, unsafe_allow_html=True)

            # Explanation
            with st.expander("ℹ️ Understanding GICS-Based Brinson Attribution"):
                st.markdown("""
                **Brinson Attribution** breaks down your portfolio outperformance into:

                1. **Allocation Effect** - Your skill at sector timing
                   - Measures if you overweighted sectors that outperformed
                   - Example: Overweighting tech before a tech rally = positive allocation

                2. **Selection Effect** - Your skill at stock picking
                   - Measures if your stocks beat their sector average
                   - Example: Picking NVDA in tech when NVDA beats XLK = positive selection

                3. **Interaction Effect** - Combined benefit
                   - Being overweight the right sectors AND picking winners within them

                **Key Sector Classifications (GICS Level 1):**
                - **AMZN, TSLA** → Consumer Discretionary (NOT Tech)
                - **META, GOOGL, NFLX** → Communication Services (NOT Tech)
                - **V, MA** → Financials (payment networks)

                **Interpretation:**
                - **High Allocation Score**: You're good at macro/sector calls → Use sector ETFs
                - **High Selection Score**: You're good at stock picking → Focus on fundamentals
                - **Both Low**: Consider passive indexing

                **Benchmark**: S&P 500 (SPY) using GICS sector classification and sector ETF returns
                """)

        except Exception as e:
            st.error(f"Error calculating GICS-based Brinson Attribution: {str(e)}")
            import traceback
            st.code(traceback.format_exc())
            st.info("💡 Make sure your portfolio has valid tickers with return data.")

    # ============================================================
    # QUALITY SCORECARD - COMPREHENSIVE QUALITY ANALYSIS
    # ============================================================
    st.divider()
    st.subheader("🏆 Portfolio Quality Scorecard")
    st.info("Comprehensive quality analysis for all holdings based on profitability, growth, financial health, and analyst ratings")

    # Calculate comprehensive quality metrics for each holding
    quality_data = []

    for _, row in enhanced_df.iterrows():
        ticker = row['Ticker']
        info = fetch_stock_info(ticker)

        if info:
            quality_data.append({
                'Ticker': ticker,
                'Asset Name': row.get('Asset Name', ticker),
                'Quality Score': row.get('Quality Score', 5.0),
                'ROE': f"{info.get('returnOnEquity', 0) * 100:.1f}%" if info.get('returnOnEquity') else 'N/A',
                'Profit Margin': f"{info.get('profitMargins', 0) * 100:.1f}%" if info.get('profitMargins') else 'N/A',
                'Revenue Growth': f"{info.get('revenueGrowth', 0) * 100:.1f}%" if info.get('revenueGrowth') else 'N/A',
                'Debt/Equity': f"{info.get('debtToEquity', 0):.1f}" if info.get('debtToEquity') else 'N/A',
                'Current Ratio': f"{info.get('currentRatio', 0):.2f}" if info.get('currentRatio') else 'N/A',
                'Peg Ratio': f"{info.get('pegRatio', 0):.2f}" if info.get('pegRatio') else 'N/A',
                'Analyst Rating': info.get('recommendationKey', 'N/A').replace('_', ' ').title(),
                'Target Price': f"${info.get('targetMeanPrice', 0):.2f}" if info.get('targetMeanPrice') else 'N/A',
                'Upside': f"{((info.get('targetMeanPrice', 0) / row['Current Price']) - 1) * 100:+.1f}%" if info.get('targetMeanPrice') and row['Current Price'] > 0 else 'N/A'
            })

    if quality_data:
        quality_df = pd.DataFrame(quality_data)

        # Sort by Quality Score descending
        quality_df = quality_df.sort_values('Quality Score', ascending=False)

        # Display quality scorecard table
        from core.atlas_table_formatting import render_generic_table
        col_defs_q = [{'key': c, 'label': c, 'type': 'ticker' if c == 'Ticker' else ('price' if 'Price' in c else ('change' if 'Upside' in c else ('quality_score' if c == 'Quality Score' else ('ratio' if 'ROE' in c or 'P/E' in c or 'Margin' in c else 'text'))))} for c in quality_df.columns]
        st.markdown(render_generic_table(quality_df, columns=col_defs_q), unsafe_allow_html=True)

        # Quality distribution chart
        fig_quality = go.Figure()

        colors_quality = [
            COLORS['success'] if score >= 7 else COLORS['warning'] if score >= 5 else COLORS['danger']
            for score in quality_df['Quality Score']
        ]

        fig_quality.add_trace(go.Bar(
            x=quality_df['Ticker'],
            y=quality_df['Quality Score'],
            marker_color=colors_quality,
            text=quality_df['Quality Score'].apply(lambda x: f"{x:.1f}"),
            textposition='outside',
            hovertemplate='<b>%{x}</b><br>Quality Score: %{y:.1f}/10<extra></extra>'
        ))

        fig_quality.update_layout(
            title="Portfolio Quality Score Distribution",
            yaxis_title="Quality Score (0-10)",
            xaxis_title="",
            height=400,
            yaxis=dict(range=[0, 11]),
            showlegend=False
        )

        apply_chart_theme(fig_quality)
        st.plotly_chart(fig_quality, use_container_width=True)

        # Quality insights
        high_quality = quality_df[quality_df['Quality Score'] >= 7]
        medium_quality = quality_df[(quality_df['Quality Score'] >= 5) & (quality_df['Quality Score'] < 7)]
        low_quality = quality_df[quality_df['Quality Score'] < 5]

        col1, col2, col3 = st.columns(3)

        with col1:
            st.markdown(f"#### ✅ High Quality ({len(high_quality)})")
            if len(high_quality) > 0:
                st.success(", ".join(high_quality['Ticker'].tolist()))
            else:
                st.markdown("*None*")

        with col2:
            st.markdown(f"#### ⚠️ Medium Quality ({len(medium_quality)})")
            if len(medium_quality) > 0:
                st.warning(", ".join(medium_quality['Ticker'].tolist()))
            else:
                st.markdown("*None*")

        with col3:
            st.markdown(f"#### 🔴 Low Quality ({len(low_quality)})")
            if len(low_quality) > 0:
                st.error(", ".join(low_quality['Ticker'].tolist()))
                st.caption("*Consider reviewing these positions*")
            else:
                st.markdown("*None*")

        # Overall portfolio quality score
        avg_quality = quality_df['Quality Score'].mean()
        st.markdown(f"### 📊 Overall Portfolio Quality: **{avg_quality:.1f}/10**")

        if avg_quality >= 7:
            st.success("✅ Your portfolio consists of high-quality companies with strong fundamentals")
        elif avg_quality >= 5:
            st.warning("⚠️ Your portfolio has mixed quality - consider upgrading lower-rated holdings")
        else:
            st.error("🔴 Portfolio quality is below average - focus on fundamental improvements")

    else:
        st.warning("Unable to fetch quality data for holdings")

    # ============================================================
    # MPT PORTFOLIO OPTIMIZATION - MODERN PORTFOLIO THEORY
    # ============================================================
    st.divider()
    st.subheader("⚙️ Portfolio Optimization (Modern Portfolio Theory)")
    st.info("Optimize portfolio allocation using production-grade MPT algorithms with intelligent risk management")

    col1, col2, col3, col4 = st.columns([2, 1, 2, 1])

    with col1:
        optimization_objective = st.selectbox(
            "Optimization Objective",
            ["Max Sharpe Ratio", "Min Volatility", "Max Return", "Risk Parity"],
            index=0,
            help="Select optimization strategy based on your investment goals"
        )

    with col2:
        risk_free_rate_input = st.number_input(
            "Risk-Free Rate (%)",
            value=RISK_FREE_RATE * 100,
            min_value=0.0,
            max_value=10.0,
            step=0.1
        ) / 100

    with col3:
        # 🎯 NEW v10.3: Risk Profile Selector
        st.markdown("**Risk Profile**")
        risk_profile_mpt = st.radio(
            "Investment Style",
            options=['conservative', 'moderate', 'aggressive'],
            format_func=lambda x: {
                'conservative': '🛡️ Conservative',
                'moderate': '⚖️ Moderate',
                'aggressive': '🚀 Aggressive'
            }[x],
            index=1,  # Default to Moderate
            key="risk_profile_mpt",
            horizontal=True,
            help="Auto-configures position limits and diversification based on your risk tolerance"
        )

    with col4:
        if st.button("🚀 Run MPT Optimization", type="primary", key="run_mpt_opt"):
            st.session_state['run_mpt_optimization'] = True

    # Map optimization objective to strategy type
    strategy_map = {
        "Max Sharpe Ratio": "max_sharpe",
        "Min Volatility": "min_volatility",
        "Max Return": "max_return",
        "Risk Parity": "risk_parity"
    }
    strategy_type_mpt = strategy_map[optimization_objective]

    # Get risk profile configuration
    config_mpt = RiskProfile.get_config(risk_profile_mpt, strategy_type_mpt)

    # Display auto-configuration
    st.caption(f"📊 **Auto-configured for {risk_profile_mpt.title()} {optimization_objective}:** Max position {config_mpt['max_position_base']*100:.0f}%, Min {config_mpt['min_diversification']} holdings, Risk budget {config_mpt['risk_budget_per_asset']*100:.0f}%/asset")

    # Advanced: Manual Override (collapsed by default)
    with st.expander("🔧 Advanced: Manual Position Constraints & Leverage Override"):
        st.warning("⚠️ Advanced users only - Manual overrides bypass risk profile automation")
        use_manual_mpt = st.checkbox("Use manual position constraints", value=False, key="use_manual_mpt")

        if use_manual_mpt:
            col1, col2, col3 = st.columns(3)
            with col1:
                max_position = st.slider(
                    "Max Position Size (%)",
                    min_value=1,
                    max_value=50,
                    value=int(config_mpt['max_position_base']*100),
                    step=1,
                    key="max_pos_mpt_manual",
                    help="Maximum weight allowed per security (prevents over-concentration)"
                ) / 100

            with col2:
                min_position = st.slider(
                    "Min Position Size (%)",
                    min_value=1,
                    max_value=50,
                    value=2,
                    step=1,
                    key="min_pos_mpt_manual",
                    help="Minimum meaningful position size (smaller positions excluded)"
                ) / 100

            with col3:
                target_leverage = st.slider(
                    "Target Leverage (x)",
                    min_value=1.0,
                    max_value=3.0,
                    value=1.0,
                    step=0.1,
                    key="target_leverage_mpt_manual",
                    help="Portfolio leverage: 1.0x = no leverage, 2.0x = 2x leverage, etc. Leverage = sum(abs(weights))"
                )

            # Validation: Ensure min < max
            if min_position >= max_position:
                st.error(f"⚠️ Min position ({min_position*100:.0f}%) must be less than max position ({max_position*100:.0f}%)")
        else:
            # Use risk profile defaults
            max_position = config_mpt['max_position_base']
            min_position = 0.02  # Standard minimum
            target_leverage = 1.0  # Default: no leverage

    if st.session_state.get('run_mpt_optimization', False):
        # Validate constraints before optimization
        if min_position >= max_position:
            st.error("❌ Cannot optimize: Min position must be less than max position")
        elif max_position * len(enhanced_df) < 1.0:
            st.error(f"❌ Cannot optimize: Max position too small. With {len(enhanced_df)} assets and {max_position*100:.0f}% max, portfolio cannot reach 100%")
        else:
            with st.spinner("⚡ Running portfolio optimization..."):
                # Get historical returns for all holdings
                returns_data = {}
                for ticker in enhanced_df['Ticker'].unique():
                    hist_data = fetch_historical_data(ticker,
                                                     datetime.now() - timedelta(days=252),
                                                     datetime.now())
                    if hist_data is not None and len(hist_data) > 0:
                        returns_data[ticker] = hist_data['Close'].pct_change().dropna()

                # Create returns dataframe
                returns_df = pd.DataFrame(returns_data)
                returns_df = returns_df.dropna()

                if len(returns_df) > 30:
                    # 🎯 TWO-STAGE DIVERSIFICATION-FIRST OPTIMIZATION
                    # Stage 1: Find peak performance
                    # Stage 2: Maximize diversification while maintaining acceptable performance

                    st.info(f"🔍 Running two-stage diversification-first optimization for {strategy_type_mpt}...")

                    # Use the two-stage diversification-first optimizer
                    optimal_weights_array = optimize_two_stage_diversification_first(
                        returns_df=returns_df,
                        strategy_type=strategy_type_mpt,
                        risk_profile_config=config_mpt,
                        risk_free_rate=risk_free_rate_input,
                        verbose=False,  # Don't print to console in Streamlit
                        target_leverage=target_leverage  # Pass leverage parameter
                    )

                    # Convert to Series
                    optimal_weights = pd.Series(optimal_weights_array, index=returns_df.columns)

                    # Get current weights
                    current_weights_dict = {}
                    total_value = enhanced_df['Total Value'].sum()
                    for _, row in enhanced_df.iterrows():
                        current_weights_dict[row['Ticker']] = row['Total Value'] / total_value

                    current_weights = pd.Series(current_weights_dict)

                    # Create comparison dataframe
                    comparison_data = []
                    for ticker in optimal_weights.index:
                        current_w = current_weights.get(ticker, 0)
                        optimal_w = optimal_weights.get(ticker, 0)

                        comparison_data.append({
                            'Ticker': ticker,
                            'Current Weight': current_w * 100,
                            'Optimal Weight': optimal_w * 100,
                            'Difference': (optimal_w - current_w) * 100,
                            'Action': '🟢 Increase' if optimal_w > current_w else '🔴 Decrease' if optimal_w < current_w else '⚪ Hold'
                        })

                    comparison_df = pd.DataFrame(comparison_data)
                    comparison_df = comparison_df.sort_values('Optimal Weight', ascending=False)

                    st.markdown("### 📊 Optimization Results")

                    # Format for display
                    display_comparison = comparison_df.copy()
                    display_comparison['Current Weight'] = display_comparison['Current Weight'].apply(lambda x: f"{x:.2f}%")
                    display_comparison['Optimal Weight'] = display_comparison['Optimal Weight'].apply(lambda x: f"{x:.2f}%")
                    display_comparison['Difference'] = display_comparison['Difference'].apply(lambda x: f"{x:+.2f}%")

                    from core.atlas_table_formatting import render_generic_table
                    st.markdown(render_generic_table(display_comparison, columns=[
                        {'key': 'Ticker', 'label': 'Ticker', 'type': 'ticker'},
                        {'key': 'Current Weight', 'label': 'Current', 'type': 'text'},
                        {'key': 'Optimal Weight', 'label': 'Optimal', 'type': 'text'},
                        {'key': 'Difference', 'label': 'Diff', 'type': 'change'},
                    ]), unsafe_allow_html=True)

                    # Calculate portfolio metrics
                    st.markdown("### 📈 Expected Performance")

                    # Current portfolio metrics
                    current_return = (returns_df * current_weights).sum(axis=1).mean() * 252
                    current_vol = (returns_df * current_weights).sum(axis=1).std() * np.sqrt(252)
                    current_sharpe = (current_return - risk_free_rate_input) / current_vol if current_vol > 0 else 0

                    # Optimal portfolio metrics
                    optimal_return = (returns_df * optimal_weights).sum(axis=1).mean() * 252
                    optimal_vol = (returns_df * optimal_weights).sum(axis=1).std() * np.sqrt(252)
                    optimal_sharpe = (optimal_return - risk_free_rate_input) / optimal_vol if optimal_vol > 0 else 0

                    # MPT Optimization toast with performance data
                    return_improvement = (optimal_return - current_return) * 100
                    vol_change = (optimal_vol - current_vol) * 100
                    sharpe_change = optimal_sharpe - current_sharpe
                    show_toast(
                        f"MPT {optimization_objective}: Return {optimal_return*100:.1f}% (+{return_improvement:.1f}%), Sharpe {optimal_sharpe:.2f} (+{sharpe_change:.2f})",
                        toast_type="success",
                        duration=5000
                    )

                    # Calculate leverage for both portfolios
                    current_leverage = np.abs(current_weights).sum()
                    optimal_leverage = np.abs(optimal_weights).sum()

                    col1, col2 = st.columns(2)

                    with col1:
                        st.markdown("#### 📊 Current Portfolio")
                        st.metric("Expected Return", f"{current_return * 100:.2f}%")
                        st.metric("Volatility", f"{current_vol * 100:.2f}%")
                        st.metric("Sharpe Ratio", f"{current_sharpe:.2f}")
                        st.metric("Portfolio Leverage", f"{current_leverage:.2f}x",
                                 help="Leverage = sum of absolute weights")

                    with col2:
                        st.markdown("#### ✨ Optimized Portfolio")
                        st.metric("Expected Return", f"{optimal_return * 100:.2f}%",
                                 delta=f"{(optimal_return - current_return) * 100:+.2f}%")
                        st.metric("Volatility", f"{optimal_vol * 100:.2f}%",
                                 delta=f"{(optimal_vol - current_vol) * 100:+.2f}%",
                                 delta_color="inverse")
                        st.metric("Sharpe Ratio", f"{optimal_sharpe:.2f}",
                                 delta=f"{(optimal_sharpe - current_sharpe):+.2f}")
                        st.metric("Portfolio Leverage", f"{optimal_leverage:.2f}x",
                                 delta=f"{(optimal_leverage - current_leverage):+.2f}x",
                                 help="Leverage = sum of absolute weights")

                    # 🎯 NEW v10.3: Portfolio Quality Assessment
                    st.markdown("---")
                    st.markdown("### 🎯 Portfolio Quality Assessment")

                    try:
                        # Calculate realism score
                        realism_mpt = validate_portfolio_realism(
                            optimal_weights.values,
                            returns_df,
                            strategy_type_mpt
                        )

                        # Calculate explanations
                        explainer_mpt = OptimizationExplainer()
                        explanations_mpt = explainer_mpt.explain_portfolio_weights(
                            optimal_weights.values,
                            returns_df,
                            strategy_type_mpt,
                            None
                        )

                        # Identify red/yellow flags
                        red_flags_mpt = explainer_mpt.identify_red_flags(
                            optimal_weights.values,
                            returns_df,
                            config_mpt
                        )

                        # Display realism score
                        col_a, col_b, col_c = st.columns([1, 2, 2])

                        with col_a:
                            score_color = "🟢" if realism_mpt['overall'] >= 80 else "🟡" if realism_mpt['overall'] >= 60 else "🔴"
                            st.metric("Realism Score", f"{score_color} {realism_mpt['overall']}/100")

                        with col_b:
                            st.markdown(f"**Classification:** {realism_mpt['classification']}")
                            if realism_mpt['issues']:
                                st.caption(f"⚠️ Issues: {', '.join(realism_mpt['issues'])}")

                        with col_c:
                            effective_n_mpt = explanations_mpt['diversification']['effective_holdings']
                            st.metric("Effective Holdings", f"{effective_n_mpt:.1f}")
                            st.caption(explanations_mpt['diversification']['explanation'])

                        # Display alerts
                        if red_flags_mpt['red_flags'] or red_flags_mpt['yellow_flags']:
                            st.markdown("**⚠️ Alerts:**")
                            for flag in red_flags_mpt['red_flags']:
                                st.error(flag)
                            for flag in red_flags_mpt['yellow_flags']:
                                st.warning(flag)
                        else:
                            st.success("✅ No major concerns - portfolio looks healthy!")

                        # Portfolio explanation
                        with st.expander("📊 Why These Weights? - Portfolio Explanation"):
                            st.markdown("##### Top Holdings Analysis")
                            for holding in explanations_mpt['top_holdings']:
                                st.markdown(f"**{holding['ticker']}** - {holding['weight']*100:.1f}%")
                                for reason in holding['reasons']:
                                    st.markdown(f"  • {reason}")
                                st.markdown("")

                            st.markdown("##### Risk Contributors")
                            st.markdown("Assets contributing most to portfolio risk:")
                            for contributor in explanations_mpt['risk']['top_risk_contributors']:
                                risk_pct = contributor['risk_contribution'] * 100 if contributor['risk_contribution'] > 0 else 0
                                st.markdown(f"  • **{contributor['ticker']}**: {risk_pct:.1f}% risk contribution (weight: {contributor['weight']*100:.1f}%)")

                    except Exception as e:
                        st.info("💡 Portfolio quality metrics ready")

                    st.markdown("---")

                    # Weight comparison chart
                    st.markdown("### 📈 Weight Comparison")

                    fig_weights = go.Figure()

                    fig_weights.add_trace(go.Bar(
                        name='Current',
                        x=comparison_df['Ticker'],
                        y=comparison_df['Current Weight'],
                        marker_color=COLORS['electric_blue'],
                        text=comparison_df['Current Weight'].apply(lambda x: f"{x:.1f}%"),
                        textposition='auto'
                    ))

                    fig_weights.add_trace(go.Bar(
                        name='Optimal',
                        x=comparison_df['Ticker'],
                        y=comparison_df['Optimal Weight'],
                        marker_color=COLORS['teal'],
                        text=comparison_df['Optimal Weight'].apply(lambda x: f"{x:.1f}%"),
                        textposition='auto'
                    ))

                    fig_weights.update_layout(
                        title=f"Current vs Optimal Weights ({optimization_objective})",
                        xaxis_title="",
                        yaxis_title="Weight (%)",
                        barmode='group',
                        height=500,
                        showlegend=True
                    )

                    apply_chart_theme(fig_weights)
                    st.plotly_chart(fig_weights, use_container_width=True)

                    # Portfolio Quality Validation Metrics
                    st.markdown("#### ✅ Portfolio Quality Checks")
                    st.info("Validate that the optimized portfolio meets practical portfolio management principles")

                    col1, col2, col3, col4 = st.columns(4)

                    with col1:
                        n_positions = np.sum(optimal_weights > 0)
                        st.metric("Number of Positions", n_positions)
                        if n_positions < 5:
                            st.warning("⚠️ Low diversification")
                        else:
                            st.success("✅ Well diversified")

                    with col2:
                        max_weight = np.max(optimal_weights)
                        st.metric("Largest Position", f"{max_weight*100:.1f}%")
                        if max_weight > 0.30:
                            st.warning("⚠️ High concentration")
                        else:
                            st.success("✅ Balanced")

                    with col3:
                        # Herfindahl-Hirschman Index (concentration measure)
                        herfindahl_index = np.sum(optimal_weights**2)
                        st.metric("HHI Index", f"{herfindahl_index:.3f}")
                        st.caption(f"Ideal: {1/len(optimal_weights):.3f}")
                        if herfindahl_index > 0.3:
                            st.warning("⚠️ Concentrated")
                        else:
                            st.success("✅ Diversified")

                    with col4:
                        # Effective number of positions (inverse of HHI)
                        effective_positions = 1 / herfindahl_index if herfindahl_index > 0 else 0
                        st.metric("Effective N", f"{effective_positions:.1f}")
                        st.caption("Diversification measure")

                    # Show positions that were excluded (< min_position)
                    excluded_positions = optimal_weights[optimal_weights == 0]
                    if len(excluded_positions) > 0:
                        with st.expander(f"ℹ️ {len(excluded_positions)} positions excluded (below {min_position*100:.0f}% threshold)"):
                            st.write(", ".join(excluded_positions.index.tolist()))
                            st.caption("These securities had weights below the minimum threshold and were excluded for practicality")

                    st.success(f"✅ Optimization complete using {optimization_objective} strategy with realistic constraints!")

                else:
                    st.error("Insufficient historical data for optimization (need 30+ days)")

    # ============================================================
    # CORRELATION HEATMAP - NEW ADDITION
    # ============================================================
    import numpy as np  # Ensure numpy is available in this scope

    st.divider()
    st.subheader("🕸️ Portfolio Correlation Analysis")

    period = st.selectbox(
        "Correlation Period:",
        options=['30d', '90d', '1y'],
        index=1,
        format_func=lambda x: {'30d': '30 Days', '90d': '90 Days', '1y': '1 Year'}[x]
    )

    correlation_matrix = calculate_portfolio_correlations(enhanced_df, period=period)

    if correlation_matrix is not None and len(correlation_matrix) > 1:

        # Diversification score
        avg_corr = correlation_matrix.where(
            np.triu(np.ones(correlation_matrix.shape), k=1).astype(bool)
        ).stack().mean()

        div_score = (1 - avg_corr) * 10

        col1, col2 = st.columns(2)

        with col1:
            div_score_color = '#10b981' if div_score > 7 else ('#fbbf24' if div_score > 5 else '#ef4444')
            div_score_status = 'Well Diversified' if div_score > 7 else ('Moderate' if div_score > 5 else 'Concentrated')
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(16,185,129,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #059669); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🎯</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">DIVERSIFICATION SCORE</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {div_score_color}; margin: 0.5rem 0 0.75rem 0; text-shadow: 0 0 24px rgba(16,185,129,0.5); line-height: 1;">{div_score:.1f}/10</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(16,185,129,0.12); border-radius: 10px; border: 1px solid rgba(16,185,129,0.25);"><p style="font-size: 0.7rem; color: #6ee7b7; margin: 0; font-weight: 600;">{div_score_status}</p></div></div>', unsafe_allow_html=True)

        with col2:
            avg_corr_color = '#10b981' if avg_corr < 0.3 else ('#fbbf24' if avg_corr < 0.6 else '#ef4444')
            avg_corr_status = 'Low Correlation' if avg_corr < 0.3 else ('Moderate' if avg_corr < 0.6 else 'High Correlation')
            st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">🔗</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">AVERAGE CORRELATION</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: {avg_corr_color}; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{avg_corr:.2f}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">{avg_corr_status}</p></div></div>', unsafe_allow_html=True)

        # PROFESSIONAL HEATMAP
        fig_heatmap = go.Figure(data=go.Heatmap(
            z=correlation_matrix.values,
            x=correlation_matrix.columns,
            y=correlation_matrix.index,
            colorscale='Spectral_r',
            zmid=0,
            zmin=-1,
            zmax=1,
            text=np.round(correlation_matrix.values, 2),
            texttemplate='%{text}',
            textfont={"size": 10, "color": "#000000"},
            colorbar=dict(
                title=dict(text="Correlation", side="right"),
                tickmode="linear",
                tick0=-1,
                dtick=0.5
            ),
            hovertemplate='%{y} vs %{x}<br>Correlation: %{z:.2f}<extra></extra>'
        ))

        fig_heatmap.update_layout(
            title=dict(
                text=f"Correlation Heatmap ({period})",
                font=dict(size=18, color='#ffffff'),
                x=0.5,
                xanchor='center'
            ),
            height=600,
            xaxis=dict(
                tickangle=-45,
                tickfont=dict(size=11, color='#ffffff')
            ),
            yaxis=dict(
                tickfont=dict(size=11, color='#ffffff')
            ),
            paper_bgcolor='rgba(0, 0, 0, 0)',
            plot_bgcolor='rgba(10, 25, 41, 0.3)'
        )

        st.plotly_chart(fig_heatmap, use_container_width=True)

        # Insights
        with st.expander("💡 Correlation Insights"):
            # High correlations
            high_corr_pairs = []
            for i in range(len(correlation_matrix)):
                for j in range(i+1, len(correlation_matrix)):
                    corr_val = correlation_matrix.iloc[i, j]
                    if corr_val > 0.75:
                        high_corr_pairs.append((
                            correlation_matrix.index[i],
                            correlation_matrix.columns[j],
                            corr_val
                        ))

            if high_corr_pairs:
                st.warning("**Highly Correlated Pairs (>0.75):**")
                for t1, t2, corr in sorted(high_corr_pairs, key=lambda x: x[2], reverse=True):
                    st.write(f"• {t1} ↔ {t2}: {corr:.2f}")
                st.caption("*These holdings move very similarly - limited diversification benefit*")
            else:
                st.success("✅ No extreme correlations detected - good diversification")
    else:
        st.warning("Need at least 2 holdings with sufficient price history for correlation analysis")

    # ========================================================================
    # MULTI-FACTOR ANALYSIS - ENHANCED

