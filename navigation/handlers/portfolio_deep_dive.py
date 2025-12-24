"""
Portfolio Deep Dive Page Handler

In-depth portfolio analysis with concentration metrics, style analytics, and correlation analysis.
"""

def render_portfolio_deep_dive_page():
    """
    Render the Portfolio Deep Dive page.

    Features:
    - Concentration analysis
    - Diversification metrics (HHI, effective N)
    - Style box positioning
    - Sector and size breakdown
    - Correlation heat maps
    - Factor exposure analysis
    """
    import streamlit as st
    import pandas as pd
    import plotly.graph_objects as go
    import plotly.express as px

    # Import helper functions
    from utils.portfolio import (
        load_portfolio_data,
        create_enhanced_holdings_table
    )
    from utils.formatting import format_percentage, format_currency
    from utils.ui_components import make_scrollable_table
    from analytics.concentration import (
        calculate_herfindahl_index,
        calculate_effective_holdings,
        calculate_concentration_metrics
    )
    from analytics.visualization import (
        create_concentration_chart,
        create_sector_breakdown_chart,
        create_correlation_heatmap,
        apply_chart_theme
    )

    st.markdown("## 🔬 PORTFOLIO DEEP DIVE")

    portfolio_data = load_portfolio_data()

    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        st.warning("⚠️ No portfolio data.")
        st.stop()

    df = pd.DataFrame(portfolio_data)
    enhanced_df = create_enhanced_holdings_table(df)

    # Calculate concentration metrics
    concentration = calculate_concentration_metrics(enhanced_df)

    # Display concentration metrics
    st.markdown("### 📊 Concentration Analysis")

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("HHI Index", f"{concentration.get('hhi', 0):.0f}")
    col2.metric("Effective N", f"{concentration.get('effective_n', 0):.1f}")
    col3.metric("Top 5 Concentration", format_percentage(concentration.get('top5_pct', 0)))
    col4.metric("Top 10 Concentration", format_percentage(concentration.get('top10_pct', 0)))

    st.markdown("---")

    # Tabs for different analyses
    tabs = st.tabs(["📊 Concentration", "🎨 Style Analysis", "🔗 Correlations"])

    with tabs[0]:
        conc_chart = create_concentration_chart(enhanced_df)
        if conc_chart:
            st.plotly_chart(conc_chart, use_container_width=True)

    with tabs[1]:
        sector_chart = create_sector_breakdown_chart(enhanced_df)
        if sector_chart:
            st.plotly_chart(sector_chart, use_container_width=True)

    with tabs[2]:
        corr_heatmap = create_correlation_heatmap(enhanced_df)
        if corr_heatmap:
            st.plotly_chart(corr_heatmap, use_container_width=True)
