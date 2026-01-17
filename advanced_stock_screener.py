"""
Advanced Stock Screener for Market Watch
==========================================

Professional stock screening with 500+ stocks and comprehensive filtering.

Author: ATLAS Development Team
Version: 1.0.0
"""

import streamlit as st
import pandas as pd
from stock_universe_manager_v1 import StockUniverseManager


# ============================================================
# INITIALIZE UNIVERSE MANAGER (Cached)
# ============================================================

@st.cache_resource
def get_universe_manager():
    """
    Initialize stock universe manager (cached across sessions)

    Returns:
        StockUniverseManager instance
    """
    manager = StockUniverseManager()

    # Load or build universe
    manager.load_or_build()

    return manager


# ============================================================
# SCREENER UI
# ============================================================

def render_advanced_stock_screener():
    """
    Render advanced stock screener with filters and results
    """

    st.markdown("### 🔍 Advanced Stock Screener")

    # Get manager
    try:
        manager = get_universe_manager()

        if manager.universe is None or manager.universe.empty:
            st.error("❌ Stock universe not loaded. Please refresh the page.")
            return

        # Show universe stats with professional cards - INLINE HTML
        col1, col2, col3 = st.columns(3)

        with col1:
            # TOTAL STOCKS card - Capital Structure style with top gradient bar
            total_stocks = len(manager.universe)
            st.markdown(f"""
            <div style="
                background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95));
                backdrop-filter: blur(24px);
                padding: 1.25rem;
                border-radius: 20px;
                border: 1px solid rgba(99,102,241,0.2);
                box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
                height: 100%;
                position: relative;
                overflow: hidden;
            ">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #6366f1, #06b6d4); opacity: 0.8;"></div>
                <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.25rem; margin-right: 0.5rem;">📊</span>
                    <p style="margin: 0; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
                              letter-spacing: 0.05em; color: #94a3b8;">TOTAL STOCKS</p>
                </div>
                <h2 style="margin: 0.5rem 0 0 0; font-size: 2rem; font-weight: 700;
                           background: linear-gradient(135deg, #6366f1 0%, #06b6d4 100%);
                           -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                    {total_stocks:,}
                </h2>
            </div>
            """, unsafe_allow_html=True)

        with col2:
            # SECTORS card - Capital Structure style with top gradient bar
            num_sectors = len(manager.get_available_sectors())
            st.markdown(f"""
            <div style="
                background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95));
                backdrop-filter: blur(24px);
                padding: 1.25rem;
                border-radius: 20px;
                border: 1px solid rgba(99,102,241,0.2);
                box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
                height: 100%;
                position: relative;
                overflow: hidden;
            ">
                <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #6366f1); opacity: 0.8;"></div>
                <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.25rem; margin-right: 0.5rem;">🏢</span>
                    <p style="margin: 0; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
                              letter-spacing: 0.05em; color: #94a3b8;">SECTORS</p>
                </div>
                <h2 style="margin: 0.5rem 0 0 0; font-size: 2rem; font-weight: 700;
                           background: linear-gradient(135deg, #06b6d4 0%, #06b6d4 100%);
                           -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                    {num_sectors}
                </h2>
            </div>
            """, unsafe_allow_html=True)

        with col3:
            # DATA AGE card - Capital Structure style with top gradient bar
            if manager.last_update:
                age_minutes = int((pd.Timestamp.now() - manager.last_update).total_seconds() / 60)
                st.markdown(f"""
                <div style="
                    background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(21,25,50,0.95));
                    backdrop-filter: blur(24px);
                    padding: 1.25rem;
                    border-radius: 20px;
                    border: 1px solid rgba(99,102,241,0.2);
                    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
                    height: 100%;
                    position: relative;
                    overflow: hidden;
                ">
                    <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #10b981, #06b6d4); opacity: 0.8;"></div>
                    <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.25rem; margin-right: 0.5rem;">⏱️</span>
                        <p style="margin: 0; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
                                  letter-spacing: 0.05em; color: #94a3b8;">DATA AGE</p>
                    </div>
                    <h2 style="margin: 0.5rem 0 0 0; font-size: 2rem; font-weight: 700;
                               background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
                               -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                        {age_minutes} min
                    </h2>
                </div>
                """, unsafe_allow_html=True)

    except Exception as e:
        st.error(f"❌ Error loading stock universe: {e}")
        st.info("Building fresh data - this may take 5-10 minutes on first load...")
        return

    # ============================================================
    # FILTERS
    # ============================================================

    with st.expander("🎛️ Filters & Criteria", expanded=True):

        col1, col2, col3 = st.columns(3)

        with col1:
            st.markdown("**📊 Sector & Industry**")

            sectors = st.multiselect(
                "Sectors",
                options=manager.get_available_sectors(),
                default=None,
                help="Filter by sector (e.g., Technology, Healthcare)"
            )

            # Only show industries if sector selected
            if sectors:
                filtered_df = manager.universe[manager.universe['sector'].isin(sectors)]
                industries_in_sectors = sorted(filtered_df['industry'].unique().tolist())

                industries = st.multiselect(
                    "Industries",
                    options=industries_in_sectors,
                    default=None,
                    help="Filter by industry within selected sectors"
                )
            else:
                industries = None

        with col2:
            st.markdown("**💰 Market Cap**")

            market_cap_categories = st.multiselect(
                "Size",
                options=['Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap'],
                default=['Large Cap', 'Mid Cap'],
                help="Large Cap: >$10B, Mid Cap: $2-10B, Small Cap: $300M-$2B"
            )

            market_cap_min_b = st.number_input(
                "Min Market Cap ($B)",
                min_value=0.0,
                max_value=5000.0,
                value=0.0,
                step=1.0,
                help="Minimum market capitalization in billions"
            )

        with col3:
            st.markdown("**📈 Performance**")

            return_period = st.selectbox(
                "Return Period",
                ['1D', '5D', '1M', '3M', '6M', '1Y'],
                index=2,  # Default to 1M
                help="Time period for return calculation"
            )

            return_min = st.slider(
                f"Min {return_period} Return (%)",
                min_value=-50.0,
                max_value=100.0,
                value=0.0,
                step=1.0,
                help=f"Minimum {return_period} return percentage"
            )

        # Advanced filters (collapsible)
        with st.expander("💎 Fundamentals (Advanced)", expanded=False):

            col_a, col_b = st.columns(2)

            with col_a:
                pe_min = st.number_input(
                    "Min P/E Ratio",
                    min_value=0.0,
                    max_value=100.0,
                    value=0.0,
                    step=1.0,
                    help="Minimum Price-to-Earnings ratio"
                )

                pe_max = st.number_input(
                    "Max P/E Ratio",
                    min_value=0.0,
                    max_value=100.0,
                    value=50.0,
                    step=1.0,
                    help="Maximum Price-to-Earnings ratio"
                )

                dividend_yield_min = st.number_input(
                    "Min Dividend Yield (%)",
                    min_value=0.0,
                    max_value=20.0,
                    value=0.0,
                    step=0.5,
                    help="Minimum dividend yield percentage"
                )

            with col_b:
                roe_min = st.number_input(
                    "Min ROE (%)",
                    min_value=-50.0,
                    max_value=100.0,
                    value=0.0,
                    step=5.0,
                    help="Minimum Return on Equity percentage"
                )

                debt_to_equity_max = st.number_input(
                    "Max Debt/Equity",
                    min_value=0.0,
                    max_value=10.0,
                    value=5.0,
                    step=0.5,
                    help="Maximum Debt-to-Equity ratio"
                )

        # Build criteria dict
        criteria = {}

        if sectors:
            criteria['sectors'] = sectors
        if industries:
            criteria['industries'] = industries
        if market_cap_categories:
            criteria['market_cap_categories'] = market_cap_categories
        if market_cap_min_b > 0:
            criteria['market_cap_min'] = market_cap_min_b * 1e9  # Convert to actual value

        criteria[f'return_{return_period}_min'] = return_min

        if pe_min > 0:
            criteria['pe_min'] = pe_min
        if pe_max < 100:
            criteria['pe_max'] = pe_max
        if dividend_yield_min > 0:
            criteria['div_yield_min'] = dividend_yield_min
        if roe_min > 0:
            criteria['roe_min'] = roe_min
        if debt_to_equity_max < 10:
            criteria['debt_to_equity_max'] = debt_to_equity_max

        # Clear filters button
        if st.button("🔄 Clear All Filters"):
            st.rerun()

    # ============================================================
    # FILTER & DISPLAY RESULTS
    # ============================================================

    # Filter universe
    filtered_stocks = manager.filter(criteria)

    st.markdown("---")
    st.markdown(f"### 📊 Results: {len(filtered_stocks):,} stocks")

    if len(filtered_stocks) == 0:
        st.warning("⚠️ No stocks match your criteria. Try loosening the filters.")
        return

    # Sort options
    col_sort, col_order, col_limit = st.columns([3, 2, 2])

    with col_sort:
        sort_by = st.selectbox(
            "Sort by",
            ['Market Cap', f'Return {return_period}', 'P/E Ratio', 'Dividend Yield', 'ROE', 'Name'],
            index=1
        )

    with col_order:
        sort_order = st.radio(
            "Order",
            ['Descending', 'Ascending'],
            horizontal=True,
            label_visibility="collapsed"
        )

    with col_limit:
        result_limit = st.selectbox(
            "Show",
            [50, 100, 200, 500],
            index=1
        )

    # Map sort column
    sort_col_map = {
        'Market Cap': 'market_cap',
        f'Return {return_period}': f'return_{return_period}',
        'P/E Ratio': 'pe_ratio',
        'Dividend Yield': 'dividend_yield',
        'ROE': 'roe',
        'Name': 'name'
    }

    # Sort
    sorted_stocks = filtered_stocks.sort_values(
        by=sort_col_map[sort_by],
        ascending=(sort_order == 'Ascending'),
        na_position='last'  # Put NaN values at the end
    )

    # Display table
    display_columns = [
        'ticker', 'name', 'sector', 'price', 'change_pct',
        f'return_{return_period}', 'market_cap', 'pe_ratio',
        'dividend_yield', 'roe'
    ]

    display_df = sorted_stocks[display_columns].head(result_limit).copy()

    # Rename columns
    display_df = display_df.rename(columns={
        'ticker': 'Symbol',
        'name': 'Name',
        'sector': 'Sector',
        'price': 'Price',
        'change_pct': 'Change %',
        f'return_{return_period}': f'{return_period} Return %',
        'market_cap': 'Market Cap',
        'pe_ratio': 'P/E',
        'dividend_yield': 'Div Yield %',
        'roe': 'ROE %'
    })

    # Format market cap
    def format_market_cap(val):
        if pd.isna(val) or val == 0:
            return "N/A"
        elif val >= 1e12:
            return f"${val/1e12:.2f}T"
        elif val >= 1e9:
            return f"${val/1e9:.2f}B"
        elif val >= 1e6:
            return f"${val/1e6:.2f}M"
        else:
            return f"${val:,.0f}"

    display_df['Market Cap'] = display_df['Market Cap'].apply(format_market_cap)

    # Show dataframe with custom styling
    st.dataframe(
        display_df,
        use_container_width=True,
        hide_index=True,
        column_config={
            'Price': st.column_config.NumberColumn(format="$%.2f"),
            'Change %': st.column_config.NumberColumn(format="%.2f%%"),
            f'{return_period} Return %': st.column_config.NumberColumn(format="%.2f%%"),
            'P/E': st.column_config.NumberColumn(format="%.2f"),
            'Div Yield %': st.column_config.NumberColumn(format="%.2f%%"),
            'ROE %': st.column_config.NumberColumn(format="%.2f%%")
        },
        height=600
    )

    if len(sorted_stocks) > result_limit:
        st.info(f"📊 Showing top {result_limit} of {len(sorted_stocks):,} results. Adjust 'Show' dropdown to see more.")


# ============================================================
# PRE-BUILT SCREENERS (Quick Access)
# ============================================================

def render_prebuilt_screeners():
    """
    Quick access to pre-built popular screens
    """

    st.markdown("### ⚡ Quick Screens")

    # Get manager
    manager = get_universe_manager()

    if manager.universe is None or manager.universe.empty:
        st.error("❌ Stock universe not loaded")
        return

    # Pre-built screen buttons
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        if st.button("💰 High Dividend (>3%)", use_container_width=True):
            st.session_state['quick_screen'] = 'high_dividend'

    with col2:
        if st.button("🚀 Strong Momentum (1M>10%)", use_container_width=True):
            st.session_state['quick_screen'] = 'momentum'

    with col3:
        if st.button("💎 Value Stocks (P/E<15)", use_container_width=True):
            st.session_state['quick_screen'] = 'value'

    with col4:
        if st.button("🏆 Quality (ROE>20%)", use_container_width=True):
            st.session_state['quick_screen'] = 'quality'

    # Display quick screen results
    if 'quick_screen' in st.session_state:
        st.markdown("---")

        screen_type = st.session_state['quick_screen']

        if screen_type == 'high_dividend':
            st.markdown("### 💰 High Dividend Stocks (Yield > 3%)")
            results = manager.filter({'div_yield_min': 3.0})
            results = results.sort_values('dividend_yield', ascending=False)

        elif screen_type == 'momentum':
            st.markdown("### 🚀 Strong Momentum Stocks (1M Return > 10%)")
            results = manager.filter({'return_1M_min': 10.0})
            results = results.sort_values('return_1M', ascending=False)

        elif screen_type == 'value':
            st.markdown("### 💎 Value Stocks (P/E < 15)")
            results = manager.filter({'pe_max': 15.0})
            results = results.sort_values('pe_ratio', ascending=True)

        elif screen_type == 'quality':
            st.markdown("### 🏆 Quality Stocks (ROE > 20%)")
            results = manager.filter({'roe_min': 20.0})
            results = results.sort_values('roe', ascending=False)

        # Display results
        if not results.empty:
            display_df = results[['ticker', 'name', 'sector', 'price', 'dividend_yield', 'pe_ratio', 'roe', 'return_1M']].head(50)

            display_df = display_df.rename(columns={
                'ticker': 'Symbol',
                'name': 'Name',
                'sector': 'Sector',
                'price': 'Price',
                'dividend_yield': 'Div Yield %',
                'pe_ratio': 'P/E',
                'roe': 'ROE %',
                'return_1M': '1M Return %'
            })

            st.dataframe(
                display_df,
                use_container_width=True,
                hide_index=True,
                column_config={
                    'Price': st.column_config.NumberColumn(format="$%.2f"),
                    'Div Yield %': st.column_config.NumberColumn(format="%.2f%%"),
                    'P/E': st.column_config.NumberColumn(format="%.2f"),
                    'ROE %': st.column_config.NumberColumn(format="%.2f%%"),
                    '1M Return %': st.column_config.NumberColumn(format="%.2f%%")
                },
                height=500
            )

            st.caption(f"Showing top 50 of {len(results)} results")
        else:
            st.warning("No stocks match this quick screen criteria")
