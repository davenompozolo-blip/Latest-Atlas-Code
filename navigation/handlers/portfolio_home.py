"""
Portfolio Home Page Handler

Main portfolio dashboard with capital structure, performance metrics, and holdings.
"""

def render_portfolio_home_page():
    """
    Render the Portfolio Home page.

    Features:
    - Capital structure (equity, gross exposure, leverage)
    - Performance metrics (ROE, P&L, returns)
    - Data quality scoring
    - Portfolio health indicator
    - Risk snapshot
    - Enhanced holdings table with customizable columns
    - Sector and position attribution
    - Monthly performance heatmap
    - VaR/CVaR portfolio optimization
    - System diagnostics
    """
    import streamlit as st
    import pandas as pd

    # Import helper functions
    from utils.portfolio import (
        load_portfolio_data,
        get_current_portfolio_metrics,
        create_enhanced_holdings_table,
        calculate_portfolio_returns,
        validate_portfolio_data,
        is_option_ticker
    )
    from utils.formatting import format_currency, format_percentage, add_arrow_indicator, ATLASFormatter
    from utils.ui_components import make_scrollable_table
    from analytics.performance import calculate_performance_metrics, is_valid_series
    from analytics.visualization import (
        create_signal_health_badge,
        create_risk_snapshot,
        create_pnl_attribution_sector,
        create_pnl_attribution_position,
        create_performance_heatmap,
        should_display_monthly_heatmap,
        style_holdings_dataframe_with_optimization
    )
    from analytics.optimization import calculate_var_cvar_portfolio_optimization
    from database.manager import get_db
    from config.theme import COLORS
    from config.settings import start_date, end_date

    st.markdown("## 🏠 PORTFOLIO HOME")

    portfolio_data = load_portfolio_data()

    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        st.warning("⚠️ No portfolio data. Please upload via Phoenix Parser.")
        st.stop()

    df = pd.DataFrame(portfolio_data)

    with st.spinner("Loading..."):
        enhanced_df = create_enhanced_holdings_table(df)

    # CRITICAL FIX: Calculate equity, gross exposure, and leverage
    # Auto-populate equity from performance history
    metrics = get_current_portfolio_metrics()
    if metrics and metrics.get('equity', 0) > 0:
        equity = metrics['equity']
    else:
        equity = st.session_state.get('equity_capital', 100000.0)
    gross_exposure = enhanced_df['Total Value'].sum()
    actual_leverage = gross_exposure / equity if equity > 0 else 1.0
    total_cost = enhanced_df['Total Cost'].sum()

    # CRITICAL FIX: Calculate G/L on EQUITY basis, not cost basis
    total_gl = gross_exposure - equity  # Profit/loss from initial equity
    total_gl_pct = (total_gl / equity) * 100 if equity > 0 else 0  # Return on equity
    daily_pl = enhanced_df['Daily P&L $'].sum()

    # First row: Capital Structure (NEW - shows equity vs gross distinction)
    st.markdown("### 💰 Capital Structure")
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric(
            "💰 Your Equity",
            format_currency(equity),
            help="Your actual capital invested"
        )

    with col2:
        st.metric(
            "📊 Gross Exposure",
            format_currency(gross_exposure),
            delta=f"vs Equity: {((gross_exposure/equity - 1)*100):+.1f}%" if equity > 0 else None,
            help="Total market value of all positions (includes leverage)"
        )

    with col3:
        target_lev = st.session_state.get('target_leverage', 1.0)
        leverage_delta = f"Target: {target_lev:.1f}x"
        st.metric(
            "⚡ Actual Leverage",
            f"{actual_leverage:.2f}x",
            delta=leverage_delta,
            help="Gross Exposure ÷ Equity"
        )

    st.markdown("---")

    # Second row: Performance Metrics (ALL on equity basis)
    st.markdown("### 📈 Performance (on Equity Basis)")
    col1, col2, col3, col4, col5 = st.columns(5)

    with col1:
        st.metric(
            "Return on Equity",
            format_percentage(total_gl_pct),
            delta=format_currency(total_gl),
            help="Total return calculated on YOUR equity (leverage amplified)"
        )

    with col2:
        st.metric(
            "Daily P&L",
            format_currency(daily_pl),
            help="Today's profit/loss across all positions"
        )

    with col3:
        st.metric(
            "Total Cost Basis",
            format_currency(total_cost),
            help="Total amount paid for all positions"
        )

    with col4:
        cost_gl = gross_exposure - total_cost
        cost_gl_pct = (cost_gl / total_cost) * 100 if total_cost > 0 else 0
        st.metric(
            "Unrealized G/L",
            format_currency(cost_gl),
            delta=format_percentage(cost_gl_pct),
            help="Current value vs cost basis"
        )

    with col5:
        st.metric(
            "📊 Positions",
            len(enhanced_df),
            help="Number of holdings in portfolio"
        )

    # Info box explaining the metrics
    with st.expander("ℹ️ Understanding Your Leveraged Portfolio", expanded=False):
        st.info(f"""
        **Capital Structure:**
        - **Equity:** Your actual capital = ${equity:,.0f}
        - **Gross Exposure:** Total position values = ${gross_exposure:,.0f}
        - **Leverage:** {actual_leverage:.2f}x means ${actual_leverage:.2f} of market exposure per $1 of equity

        **Returns Calculation:**
        - **Return on Equity:** {total_gl_pct:.2f}% is calculated as (Current Value - Initial Equity) / Equity
        - With {actual_leverage:.2f}x leverage, market moves are amplified {actual_leverage:.2f}x
        - A 10% market gain becomes ~{actual_leverage*10:.1f}% return on your equity

        **Risk:**
        - VaR, CVaR, and all risk metrics are applied to your ${equity:,.0f} equity, not gross exposure
        - Leverage amplifies BOTH gains and losses proportionally
        """)

    # v9.7 NEW FEATURE: Data Quality Indicator
    validation_result = validate_portfolio_data(portfolio_data)
    quality_score = validation_result['data_quality_score']

    if quality_score >= 90:
        quality_color = COLORS['success']
        quality_status = "EXCELLENT"
    elif quality_score >= 75:
        quality_color = COLORS['info']
        quality_status = "GOOD"
    elif quality_score >= 60:
        quality_color = COLORS['warning']
        quality_status = "FAIR"
    else:
        quality_color = COLORS['danger']
        quality_status = "POOR"

    st.markdown(f"""
    <div style='background: linear-gradient(135deg, {COLORS['card_background']} 0%, {COLORS['card_background_alt']} 100%);
                border-left: 4px solid {quality_color};
                padding: 12px 20px;
                border-radius: 8px;
                margin: 15px 0;'>
        <div style='display: flex; align-items: center; justify-content: space-between;'>
            <div>
                <span style='color: {COLORS['text_muted']}; font-size: 12px;'>🆕 v9.7 DATA QUALITY SCORE</span>
                <span style='color: {quality_color}; font-size: 24px; font-weight: 700; margin-left: 15px;'>{quality_score}/100</span>
                <span style='color: {quality_color}; font-size: 14px; font-weight: 600; margin-left: 10px;'>{quality_status}</span>
            </div>
            <div style='text-align: right; color: {COLORS['text_secondary']}; font-size: 11px;'>
                {validation_result['complete_rows']}/{validation_result['total_rows']} Complete Rows
                {f"<br/><span style='color: {COLORS['danger']};'>⚠️ {len(validation_result['issues'])} Issues</span>" if validation_result['issues'] else ""}
                {f"<br/><span style='color: {COLORS['warning']};'>⚡ {len(validation_result['warnings'])} Warnings</span>" if validation_result['warnings'] else ""}
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    if validation_result['issues'] or validation_result['warnings']:
        with st.expander("🔍 View Data Quality Details", expanded=False):
            if validation_result['issues']:
                st.error("**Issues Found:**")
                for issue in validation_result['issues']:
                    st.write(f"- {issue}")
            if validation_result['warnings']:
                st.warning("**Warnings:**")
                for warning in validation_result['warnings']:
                    st.write(f"- {warning}")

    st.markdown("---")

    # Risk Snapshot & Signal Health
    portfolio_returns = calculate_portfolio_returns(df, start_date, end_date)

    col_health, col_snapshot = st.columns([1, 3])

    with col_health:
        # Calculate metrics for health indicator
        if is_valid_series(portfolio_returns):
            metrics = calculate_performance_metrics(enhanced_df, portfolio_returns, None)
            health_badge = create_signal_health_badge(metrics)
            st.markdown("### 🎯 Portfolio Health")
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
        # Define all available columns
        ALL_COLUMNS = [
            'Ticker', 'Asset Name', 'Shares', 'Avg Cost', 'Current Price',
            'Daily Change %', '5D Return %', 'YTD Return %',
            'Weight % of Equity', 'Weight % of Gross', 'Weight %',
            'Daily P&L $', 'Total Gain/Loss $', 'Total Gain/Loss %',
            'Beta', 'Analyst Rating', 'Quality Score', 'Sector',
            'Price Target', 'Volume'
        ]

        # Default columns to show (include both new weight columns)
        DEFAULT_COLUMNS = [
            'Ticker', 'Asset Name', 'Shares', 'Current Price',
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

    # Display holdings table
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
                display_df[col] = display_df[col].apply(lambda x: format_currency(x) if pd.notna(x) else 'N/A')

        # Add arrow indicators for change columns
        if 'Daily Change %' in display_df.columns:
            display_df['Daily Change %'] = display_df['Daily Change %'].apply(add_arrow_indicator)
        if 'Total Gain/Loss %' in display_df.columns:
            display_df['Total Gain/Loss %'] = display_df['Total Gain/Loss %'].apply(add_arrow_indicator)

        make_scrollable_table(display_df, height=500, hide_index=True, use_container_width=True, column_config=None)

        # Add explanation for dual weight columns
        if 'Weight % of Equity' in selected_columns or 'Weight % of Gross' in selected_columns:
            st.caption(f"""
            **Understanding Position Weights:**
            - **Weight % of Equity**: Position value as % of your ${equity:,.0f} equity (can exceed 100% with {actual_leverage:.2f}x leverage!)
            - **Weight % of Gross**: Position value as % of ${gross_exposure:,.0f} gross exposure (always sums to 100%)
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
        st.plotly_chart(pnl_sector, use_container_width=True, key="sector_pnl")
    else:
        st.info("Sector P&L will display when holdings have sector data")

    # Additional position-level P&L analysis
    st.markdown("---")
    st.markdown("### 💼 Top Contributors")

    pnl_position = create_pnl_attribution_position(enhanced_df, top_n=10)
    if pnl_position:
        st.plotly_chart(pnl_position, use_container_width=True)

    # Performance Heatmap (full width) - Only show if meaningful data exists
    st.markdown("---")
    if should_display_monthly_heatmap(enhanced_df):
        st.markdown("### 📅 Monthly Performance")
        perf_heatmap = create_performance_heatmap(enhanced_df)
        if perf_heatmap:
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
