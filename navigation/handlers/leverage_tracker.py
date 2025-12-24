"""
Leverage Tracker Page Handler

Track how leverage has affected portfolio returns over time.
"""

def render_leverage_tracker_page():
    """
    Render the Leverage Tracking & Analysis page.

    Features:
    - Current leverage statistics
    - Historical leverage tracking
    - 6-chart dashboard visualization
    - Calculation workings display
    - Data export functionality
    """
    import streamlit as st
    import pandas as pd

    # Import helper functions
    from utils.ui_components import make_scrollable_table

    st.markdown("## 📊 LEVERAGE TRACKING & ANALYSIS")
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
        st.markdown("### 📊 Current Statistics")

        col1, col2, col3, col4, col5 = st.columns(5)

        with col1:
            st.metric(
                "Current Leverage",
                f"{stats['current_leverage']:.2f}x",
                help="Gross Exposure / Net Equity"
            )

        with col2:
            st.metric(
                "Net Equity",
                f"${stats['current_equity']:,.0f}",
                help="Your actual capital"
            )

        with col3:
            st.metric(
                "Gross Exposure",
                f"${stats['current_gross_exposure']:,.0f}",
                help="Total position value"
            )

        with col4:
            st.metric(
                "YTD Equity Return",
                f"{stats['ytd_equity_return']:.1f}%",
                help="Return on your capital"
            )

        with col5:
            st.metric(
                "YTD Gross Return",
                f"{stats['ytd_gross_return']:.1f}%",
                help="Portfolio performance"
            )

        # Additional stats row
        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric(
                "Average Leverage",
                f"{stats['avg_leverage']:.2f}x",
                help="Historical average"
            )

        with col2:
            st.metric(
                "Max Leverage",
                f"{stats['max_leverage']:.2f}x",
                help="Highest leverage used"
            )

        with col3:
            st.metric(
                "Min Leverage",
                f"{stats['min_leverage']:.2f}x",
                help="Lowest leverage"
            )

        # Dashboard
        st.markdown("---")
        st.markdown("### 📊 6-Chart Leverage Dashboard")

        fig = tracker.create_leverage_dashboard()
        st.plotly_chart(fig, use_container_width=True)

        # Workings
        st.markdown("---")
        st.markdown("### 🧮 Calculation Workings")
        st.markdown("**See exactly how leverage is calculated**")

        workings = tracker.create_workings_display()
        st.markdown(workings)

        # Historical data table
        st.markdown("---")
        st.markdown("### 📋 Historical Data Table")

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
        st.markdown("### 💾 Export Options")

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
