"""
Multi-Factor Analysis Page Handler

Advanced factor attribution and exposure analysis for portfolios.
"""

def render_multi_factor_analysis_page():
    """
    Render the Multi-Factor Analysis page.

    Features:
    - Factor exposure calculation
    - Factor momentum visualization
    - Exposure radar charts
    - Holdings attribution analysis
    """
    import streamlit as st
    import pandas as pd
    from datetime import datetime, timedelta

    # Import helper functions
    from utils.ui_components import make_scrollable_table
    from utils.portfolio import load_portfolio_data, create_enhanced_holdings_table
    from analytics.factors import (
        calculate_factor_exposures,
        create_factor_attribution_table,
        create_factor_momentum_chart,
        create_factor_exposure_radar
    )

    st.markdown("## 📊 MULTI-FACTOR ANALYSIS - ENHANCED")
    st.markdown("---")

    # Get date range from session state or use defaults
    selected_range = st.session_state.get('selected_range', '1Y')

    # Calculate dates based on selected range
    end_date = datetime.now()
    range_map = {
        '1D': 1, '5D': 5, '1M': 30, '3M': 90, '6M': 180,
        '1Y': 365, '2Y': 730, '5Y': 1825, 'MAX': 3650
    }
    days = range_map.get(selected_range, 365)
    start_date = end_date - timedelta(days=days)

    portfolio_data = load_portfolio_data()

    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        st.warning("⚠️ No portfolio data.")
        st.stop()

    df = pd.DataFrame(portfolio_data)
    enhanced_df = create_enhanced_holdings_table(df)

    with st.spinner("Running analysis..."):
        factor_data = calculate_factor_exposures(enhanced_df, start_date, end_date)

    if factor_data:
        st.markdown(f"**Model R² = {factor_data['r_squared']:.3f}**")
        st.progress(factor_data['r_squared'])

        result = create_factor_attribution_table(factor_data, enhanced_df)

        tab1, tab2, tab3 = st.tabs([
            "📈 Factor Momentum", "🎯 Exposure Radar", "📊 Attribution"
        ])

        with tab1:
            momentum = create_factor_momentum_chart(factor_data)
            if momentum:
                st.plotly_chart(momentum, use_container_width=True)

        with tab2:
            radar = create_factor_exposure_radar(factor_data)
            if radar:
                st.plotly_chart(radar, use_container_width=True)

        with tab3:
            if result is not None:
                attr_df, factor_summary, sector_summary = result

                if factor_summary is not None:
                    st.markdown("### Factor Summary")
                    factor_display = factor_summary.copy()
                    factor_display['Total Contribution'] = factor_display['Total Contribution'].apply(
                        lambda x: f"{x:.4f}")
                    make_scrollable_table(factor_display, height=400, hide_index=True, use_container_width=True, column_config=None)

                if attr_df is not None:
                    st.markdown("### Holdings Attribution")
                    holdings_attr = attr_df.pivot_table(
                        index='Ticker',
                        columns='Factor',
                        values='Contribution',
                        aggfunc='sum'
                    ).round(4)

                    make_scrollable_table(holdings_attr, height=600, hide_index=True, use_container_width=True, column_config=None)

                    st.info("""
                    **Positive values**: Holding increases exposure
                    **Negative values**: Holding decreases exposure
                    """)
    else:
        st.error("Unable to calculate factor exposures.")
