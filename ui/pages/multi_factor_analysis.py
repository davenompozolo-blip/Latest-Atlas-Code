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
    from core import (
        # Data Functions
        load_portfolio_data,
        ATLASFormatter,
        # Calculation Functions
        calculate_factor_exposures,
        # Chart Functions
        create_enhanced_holdings_table,
        create_factor_momentum_chart,
        create_factor_exposure_radar,
    )
    from ui.components import ATLAS_TEMPLATE

    # Create stub for missing function
    def create_factor_attribution_table(factor_data, enhanced_df):
        """Stub for factor attribution table creation."""
        return None, None, None

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
                    from core.atlas_table_formatting import render_generic_table
                    col_defs_f = [{'key': c, 'label': c, 'type': 'ticker' if c == 'Factor' else ('ratio' if 'Contribution' in c else 'text')} for c in factor_display.columns]
                    st.markdown(render_generic_table(factor_display, columns=col_defs_f), unsafe_allow_html=True)

                if attr_df is not None:
                    st.markdown("### Holdings Attribution")
                    holdings_attr = attr_df.pivot_table(
                        index='Ticker',
                        columns='Factor',
                        values='Contribution',
                        aggfunc='sum'
                    ).round(4)

                    # Reset index for table rendering
                    holdings_attr_display = holdings_attr.reset_index()
                    from core.atlas_table_formatting import render_generic_table
                    col_defs_h = [{'key': c, 'label': c, 'type': 'ticker' if c == 'Ticker' else 'ratio'} for c in holdings_attr_display.columns]
                    st.markdown(render_generic_table(holdings_attr_display, columns=col_defs_h), unsafe_allow_html=True)

                    st.info("""
                    **Positive values**: Holding increases exposure
                    **Negative values**: Holding decreases exposure
                    """)
    else:
        st.error("Unable to calculate factor exposures.")

    # ========================================================================
    # VALUATION HOUSE - ENHANCED WITH SMART ASSUMPTIONS

