"""
Market Watch Page Handler

Comprehensive market monitoring across indices, crypto, ETFs, commodities,
stocks, bonds, and credit spreads. Includes personal watchlist functionality.
"""

def render_market_watch_page():
    """
    Render the Market Watch page with live market data across multiple asset classes.

    Features:
    - Personal watchlist with live ticker search
    - Global indices tracking
    - Cryptocurrency markets
    - ETF monitoring
    - Commodity prices
    - Popular stocks
    - Bond yields and yield curves
    - Credit spreads analysis
    """
    import streamlit as st
    import yfinance as yf
    import pandas as pd
    from datetime import datetime

    try:
        from utils.yield_data_fetcher import YieldDataFetcher
        YIELD_FETCHER_AVAILABLE = True
    except ImportError:
        YIELD_FETCHER_AVAILABLE = False

    # Import helper functions
    from utils.ui_components import show_toast, make_scrollable_table
    from utils.market_data import (
        search_yahoo_finance,
        fetch_market_watch_data,
        create_dynamic_market_table,
        create_yield_curve,
        create_yield_curve_with_forwards,
        fetch_uk_gilt_yields,
        fetch_german_bund_yields,
        fetch_sa_government_bond_yields
    )
    from utils.watchlist import (
        add_to_watchlist,
        get_watchlist,
        remove_from_watchlist
    )
    from utils.formatters import ATLASFormatter

    # Import market data constants
    from config.market_data import (
        GLOBAL_INDICES,
        CRYPTOCURRENCIES,
        POPULAR_ETFS,
        COMMODITIES,
        POPULAR_STOCKS,
        BOND_YIELDS,
        CREDIT_SPREADS
    )

    st.markdown("## 🌍 MARKET WATCH - EXCELLENCE EDITION")
    st.markdown("*Your comprehensive window into global markets, crypto, bonds, and credit conditions*")

    st.markdown("---")

    # LIVE TICKER SEARCH
    st.markdown("### 🔍 Live Ticker Search")
    search_col1, search_col2 = st.columns([3, 1])

    with search_col1:
        search_query = st.text_input(
            "Search any ticker or add to watchlist",
            placeholder="Enter ticker symbol (e.g., AAPL, TSLA, BTC-USD)...",
            key="ticker_search",
            label_visibility="collapsed"
        )

    with search_col2:
        search_button = st.button("🔍 Search", use_container_width=True, type="primary")

    # Display search results
    if (search_query and search_button) or (search_query and len(search_query) >= 2):
        with st.spinner(f"Searching for '{search_query}'..."):
            results = search_yahoo_finance(search_query)

            if results:
                result = results[0]
                st.success(f"✅ Found: **{result['symbol']}** - {result['name']}")

                # Display quick info
                info_col1, info_col2, info_col3, info_col4 = st.columns(4)
                with info_col1:
                    st.metric("Type", result['type'])
                with info_col2:
                    st.metric("Exchange", result['exchange'])
                with info_col3:
                    if result['market_cap'] > 0:
                        st.metric("Market Cap", f"${result['market_cap']/1e9:.1f}B")
                    else:
                        st.metric("Currency", result['currency'])
                with info_col4:
                    # Add to watchlist button
                    if st.button(f"⭐ Add to Watchlist", key=f"add_{result['symbol']}"):
                        if add_to_watchlist(result['symbol'], result['name'], result['type']):
                            st.success(f"✅ Added {result['symbol']} to watchlist!")
                            st.rerun()
                        else:
                            st.warning(f"⚠️ {result['symbol']} already in watchlist")
            else:
                st.error(f"❌ No results found for '{search_query}'. Try a different ticker symbol.")

    st.markdown("---")
    st.markdown("### 🔍 Filters & Settings")
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        filter_change = st.slider("Min Change %", -10.0, 10.0, -10.0)
    with col2:
        sort_by = st.selectbox("Sort By", ["Change %", "5D %", "Volume"])
    with col3:
        refresh = st.button("🔄 Refresh Data")
        if refresh:
            current_time = datetime.now().strftime("%H:%M:%S")
            show_toast(f"Market data refreshed - updated at {current_time}", toast_type="info", duration=3000)
    with col4:
        auto_refresh = st.checkbox("Auto-Refresh (5min)")

    st.markdown("---")

    # EXPANDED TABS
    tab0, tab1, tab2, tab3, tab4, tab5, tab6, tab7 = st.tabs([
        "⭐ My Watchlist",
        "📈 Indices",
        "💰 Crypto",
        "🏦 ETFs",
        "⚡ Commodities",
        "📊 Stocks",
        "💵 Bonds & Rates",
        "🎯 Credit Spreads"
    ])

    # PERSONAL WATCHLIST TAB
    with tab0:
        st.markdown("#### ⭐ Personal Watchlist")

        watchlist = get_watchlist()

        if not watchlist:
            st.info("📝 Your watchlist is empty. Use the search bar above to add tickers!")
        else:
            st.success(f"✅ Tracking {len(watchlist)} securities")

            # Fetch live data for watchlist
            watchlist_data = []

            with st.spinner("Loading watchlist prices..."):
                for item in watchlist:
                    try:
                        ticker = yf.Ticker(item['ticker'])
                        hist = ticker.history(period='5d')

                        if not hist.empty:
                            current_price = hist['Close'].iloc[-1]
                            prev_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
                            change = current_price - prev_close
                            change_pct = (change / prev_close * 100) if prev_close > 0 else 0

                            # Get 5-day change
                            if len(hist) >= 5:
                                five_day_change = ((current_price - hist['Close'].iloc[0]) / hist['Close'].iloc[0] * 100)
                            else:
                                five_day_change = 0

                            watchlist_data.append({
                                'Ticker': item['ticker'],
                                'Name': item['name'],
                                'Type': item['type'],
                                'Price': f"${current_price:.2f}",
                                'Change': f"${change:+.2f}",
                                'Change %': change_pct,
                                '5D %': five_day_change,
                                'Added': item['added_date']
                            })
                    except:
                        # If data fetch fails, still show the item
                        watchlist_data.append({
                            'Ticker': item['ticker'],
                            'Name': item['name'],
                            'Type': item['type'],
                            'Price': 'N/A',
                            'Change': 'N/A',
                            'Change %': 0,
                            '5D %': 0,
                            'Added': item['added_date']
                        })

            if watchlist_data:
                watchlist_df = pd.DataFrame(watchlist_data)
                make_scrollable_table(watchlist_df, height=600, hide_index=True, use_container_width=True)

                # Remove from watchlist
                st.markdown("---")
                st.markdown("##### 🗑️ Manage Watchlist")

                remove_col1, remove_col2 = st.columns([3, 1])

                with remove_col1:
                    ticker_to_remove = st.selectbox(
                        "Select ticker to remove",
                        options=[item['ticker'] for item in watchlist],
                        key="remove_ticker_select"
                    )

                with remove_col2:
                    if st.button("🗑️ Remove", use_container_width=True, type="secondary"):
                        remove_from_watchlist(ticker_to_remove)
                        st.success(f"✅ Removed {ticker_to_remove} from watchlist")
                        st.rerun()

    with tab1:
        st.markdown("#### 🌍 Global Indices")

        # Advanced filters for indices
        index_regions = st.multiselect(
            "Filter by Region",
            ["US", "Europe", "Asia-Pacific", "Americas", "Middle East & Africa", "UK", "Germany", "France",
             "Japan", "Hong Kong", "China", "India", "Canada", "Brazil", "Australia"],
            default=["US", "Europe", "Asia-Pacific"],
            key="index_region_filter"
        )

        with st.spinner("Loading indices..."):
            indices_df = fetch_market_watch_data(GLOBAL_INDICES)
            if not indices_df.empty:
                # Apply region filter
                if index_regions and 'Region' in indices_df.columns:
                    indices_df = indices_df[indices_df['Region'].isin(index_regions)]
                # Apply change filter
                indices_df = indices_df[indices_df['Change %'] >= filter_change]
                display_df = create_dynamic_market_table(indices_df, {'sort_by': sort_by, 'ascending': False})
                make_scrollable_table(display_df, height=600, hide_index=True, use_container_width=True, column_config=None)
            else:
                st.warning("No data available")

    with tab2:
        st.markdown("#### 🪙 Cryptocurrency Markets")

        # Advanced filters for crypto
        col_crypto1, col_crypto2 = st.columns(2)
        with col_crypto1:
            crypto_market_caps = st.multiselect(
                "Filter by Market Cap",
                ["Large", "Mid", "Small"],
                default=["Large", "Mid"],
                key="crypto_mcap_filter"
            )
        with col_crypto2:
            crypto_categories = st.multiselect(
                "Filter by Type",
                ["Crypto", "Stablecoin"],
                default=["Crypto", "Stablecoin"],
                key="crypto_cat_filter"
            )

        with st.spinner("Loading crypto..."):
            crypto_df = fetch_market_watch_data(CRYPTOCURRENCIES)
            if not crypto_df.empty:
                # Apply market cap filter
                if crypto_market_caps and 'Market Cap' in crypto_df.columns:
                    crypto_df = crypto_df[crypto_df['Market Cap'].isin(crypto_market_caps)]
                # Apply category filter
                if crypto_categories and 'Category' in crypto_df.columns:
                    crypto_df = crypto_df[crypto_df['Category'].isin(crypto_categories)]
                # Apply change filter
                crypto_df = crypto_df[crypto_df['Change %'] >= filter_change]
                display_df = create_dynamic_market_table(crypto_df, {'sort_by': sort_by, 'ascending': False})
                make_scrollable_table(display_df, height=600, hide_index=True, use_container_width=True, column_config=None)
            else:
                st.warning("No data available")

    with tab3:
        st.markdown("#### 📦 Exchange-Traded Funds")

        # Comprehensive ETF category filters
        etf_categories = st.multiselect(
            "Filter by Category",
            ["Broad Market", "Mid Cap", "Small Cap", "Sector", "Real Estate", "Thematic",
             "International", "Bonds", "Commodities", "Factor", "Leveraged", "Inverse", "Volatility"],
            default=["Broad Market", "Sector", "Thematic", "International"],
            key="etf_cat_filter"
        )

        with st.spinner("Loading ETFs..."):
            etf_df = fetch_market_watch_data(POPULAR_ETFS)
            if not etf_df.empty:
                if etf_categories:
                    etf_df = etf_df[etf_df['Category'].isin(etf_categories)]
                # Apply change filter
                etf_df = etf_df[etf_df['Change %'] >= filter_change]
                display_df = create_dynamic_market_table(etf_df, {'sort_by': sort_by, 'ascending': False})
                make_scrollable_table(display_df, height=600, hide_index=True, use_container_width=True, column_config=None)
            else:
                st.warning("No data available")

    with tab4:
        st.markdown("#### ⛽ Commodity Markets")

        # Commodity category filters
        commodity_cats = st.multiselect(
            "Filter by Type",
            ["Precious Metals", "Energy", "Industrial Metals", "Agriculture", "Livestock"],
            default=["Precious Metals", "Energy", "Agriculture"],
            key="commodity_cat_filter"
        )

        with st.spinner("Loading commodities..."):
            comm_df = fetch_market_watch_data(COMMODITIES)
            if not comm_df.empty:
                if commodity_cats:
                    comm_df = comm_df[comm_df['Category'].isin(commodity_cats)]
                # Apply change filter
                comm_df = comm_df[comm_df['Change %'] >= filter_change]
                display_df = create_dynamic_market_table(comm_df, {'sort_by': sort_by, 'ascending': False})
                make_scrollable_table(display_df, height=600, hide_index=True, use_container_width=True, column_config=None)
            else:
                st.warning("No data available")

    with tab5:
        st.markdown("#### 📈 Popular Stocks")

        # Comprehensive stock category filters
        stock_categories = st.multiselect(
            "Filter by Category",
            ["Mega Cap Tech", "Tech", "Semiconductors", "Software", "E-Commerce", "Payments", "Crypto",
             "Financials", "Insurance", "Healthcare", "Biotech", "Medical Devices",
             "Consumer", "Retail", "Automotive", "Travel", "Delivery",
             "Energy", "Oil Services", "Industrials", "Aerospace", "Transportation", "Airlines",
             "Materials", "Chemicals", "Mining", "Utilities", "REITs",
             "Telecom", "Media", "Gaming", "Rideshare", "International"],
            default=["Mega Cap Tech", "Semiconductors", "Software", "Financials", "Healthcare"],
            key="stock_cat_filter"
        )

        with st.spinner("Loading stocks..."):
            stocks_df = fetch_market_watch_data(POPULAR_STOCKS)
            if not stocks_df.empty:
                if stock_categories:
                    stocks_df = stocks_df[stocks_df['Category'].isin(stock_categories)]
                # Apply change filter
                stocks_df = stocks_df[stocks_df['Change %'] >= filter_change]
                display_df = create_dynamic_market_table(stocks_df, {'sort_by': sort_by, 'ascending': False})
                make_scrollable_table(display_df, height=600, hide_index=True, use_container_width=True, column_config=None)
            else:
                st.warning("No data available")

    with tab6:
        st.markdown("#### 💵 Global Bond Yields & Yield Curves")
        st.info("📊 **Key Insight:** Monitor yield curves for recession signals, inflation expectations, and relative value across markets")

        # Country/Region selector for yield curves
        selected_curve = st.selectbox(
            "Select Yield Curve",
            ["US Treasuries", "UK Gilts", "German Bunds", "SA Government Bonds"],
            index=0,
            help="Compare government bond yields across major economies"
        )

        # Display yield curve based on selection
        if selected_curve == "US Treasuries":
            result = create_yield_curve()
            if result:
                yield_curve, maturities, spot_rates, data_source = result

                # Display combined spot + forward curve
                st.plotly_chart(yield_curve, use_container_width=True)

                # Show data source indicator
                freshness_color = {
                    "FRED API": "🟢",
                    "Yahoo Finance": "🟡",
                    "Fallback Data": "🔴"
                }.get(data_source, "🟡")

                st.caption(f"**Data Freshness:** {ATLASFormatter.format_timestamp()} • {freshness_color} {data_source}")
                st.info("💡 **Blue line** = Spot yields | **Green dashed** = Implied forward rates showing market expectations")

                # Calculate and display yield curve spread using YieldDataFetcher
                try:
                    if YIELD_FETCHER_AVAILABLE:
                        fetcher = YieldDataFetcher()
                        yields = fetcher.get_current_yields()
                        is_valid, warnings = fetcher.validate_yields(yields)

                        val_10y = yields.get('10Y')
                        val_2y = yields.get('2Y') or yields.get('3M')

                        if val_10y is not None and val_2y is not None and is_valid:
                            spread = val_10y - val_2y
                            source = fetcher.source
                            if spread > 0:
                                st.success(f"✅ 10Y-2Y Spread: **+{spread:.2f}%** (Normal - Positive slope) • Source: {source}")
                            else:
                                st.error(f"⚠️ 10Y-2Y Spread: **{spread:.2f}%** (INVERTED - Potential recession signal) • Source: {source}")
                        elif not is_valid:
                            for w in warnings:
                                st.warning(f"⚠️ {w}")
                    else:
                        # Direct Yahoo fallback
                        hist_10y = yf.Ticker("^TNX").history(period="1d")
                        hist_st = yf.Ticker("^IRX").history(period="1d")
                        if not hist_10y.empty and not hist_st.empty:
                            val_10y = hist_10y['Close'].iloc[-1]
                            val_st = hist_st['Close'].iloc[-1]
                            if 0 < val_10y < 15 and 0 < val_st < 15:
                                spread = val_10y - val_st
                                if spread > 0:
                                    st.success(f"✅ 10Y-2Y Spread: **+{spread:.2f}%** (Normal - Positive slope)")
                                else:
                                    st.error(f"⚠️ 10Y-2Y Spread: **{spread:.2f}%** (INVERTED - Potential recession signal)")
                except:
                    pass

        elif selected_curve == "UK Gilts":
            with st.spinner("Fetching UK Gilt yields..."):
                maturities, yields = fetch_uk_gilt_yields()

            fig_gilts = create_yield_curve_with_forwards(maturities, yields, "UK Gilt Yield Curve with Forward Rates", color='#FF6B6B')
            st.plotly_chart(fig_gilts, use_container_width=True)
            st.caption(f"**Data Freshness:** {ATLASFormatter.format_timestamp()} • Live data from Yahoo Finance")
            st.info("💡 **Red line** = Spot yields | **Green dashed** = Implied forward rates showing market expectations")

        elif selected_curve == "German Bunds":
            with st.spinner("Fetching German Bund yields..."):
                maturities, yields = fetch_german_bund_yields()

            fig_bunds = create_yield_curve_with_forwards(maturities, yields, "German Bund Yield Curve with Forward Rates", color='#FFD700')
            st.plotly_chart(fig_bunds, use_container_width=True)
            st.caption(f"**Data Freshness:** {ATLASFormatter.format_timestamp()} • Live data from Yahoo Finance")
            st.info("💡 **Gold line** = Spot yields | **Green dashed** = Implied forward rates showing market expectations")

        elif selected_curve == "SA Government Bonds":
            with st.spinner("Fetching SA Government Bond yields..."):
                maturities, yields = fetch_sa_government_bond_yields()

            fig_sagov = create_yield_curve_with_forwards(maturities, yields, "SA Government Bond Yield Curve with Forward Rates", color='#00D4FF')
            st.plotly_chart(fig_sagov, use_container_width=True)
            st.caption(f"**Data Freshness:** {ATLASFormatter.format_timestamp()} • South African government bond yields")
            st.info("💡 **Cyan line** = Spot yields | **Green dashed** = Implied forward rates showing market expectations")

        st.markdown("---")

        with st.spinner("Loading bonds..."):
            bonds_df = fetch_market_watch_data(BOND_YIELDS)
            if not bonds_df.empty:
                display_df = create_dynamic_market_table(bonds_df, {'sort_by': sort_by, 'ascending': False})
                make_scrollable_table(display_df, height=400, hide_index=True, use_container_width=True, column_config=None)
            else:
                st.warning("No data available")

    with tab7:
        st.markdown("#### 🎯 Credit Spreads & Conditions")
        st.info("💡 **Key Insight:** Widening spreads signal deteriorating credit conditions and rising risk premiums")

        with st.spinner("Loading credit spreads..."):
            credit_df = fetch_market_watch_data(CREDIT_SPREADS)
            if not credit_df.empty:
                display_df = create_dynamic_market_table(credit_df, {'sort_by': sort_by, 'ascending': False})
                make_scrollable_table(display_df, height=400, hide_index=True, use_container_width=True, column_config=None)

                st.markdown("---")
                st.markdown("#### 📊 Credit Market Interpretation")
                st.markdown("""
                **Investment Grade (LQD):** Corporate bonds rated BBB- or higher
                **High Yield (HYG):** "Junk" bonds with higher risk and return potential
                **Emerging Markets (EMB):** Sovereign and corporate debt from developing economies
                **TIPS (TIP):** Treasury Inflation-Protected Securities
                **MBS (MBB):** Mortgage-Backed Securities
                """)
            else:
                st.warning("No data available")
