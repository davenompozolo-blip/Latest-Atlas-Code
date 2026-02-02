"""
ATLAS Terminal - Multi-Factor Analysis Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_multi_factor_analysis(start_date, end_date):
    """Render the Multi-Factor Analysis page."""
    # Lazy imports to avoid circular dependency with atlas_app
    import atlas_app as _app
    globals().update({k: v for k, v in _app.__dict__.items() if not k.startswith('_')})
    from ui.components import ATLAS_TEMPLATE

    st.markdown("---")

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

    # ========================================================================
    # VALUATION HOUSE - ENHANCED WITH SMART ASSUMPTIONS

