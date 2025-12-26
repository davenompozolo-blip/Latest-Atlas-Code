"""
Phoenix Parser Page Handler

Exceptional data parsing for trade history and account data.
Central hub for all data uploads including leverage tracking.
"""

def render_phoenix_parser_page():
    """
    Render the Phoenix Parser page.

    Features:
    - Trade history parsing and import
    - Account history parsing
    - Portfolio reconstruction from trades
    - Database management operations
    - Leverage tracking integration
    """
    import streamlit as st
    import pandas as pd
    from datetime import datetime
    import tempfile

    # Import helper functions
    from utils.ui_components import show_toast, make_scrollable_table
    from utils.portfolio import (
        parse_trade_history_file,
        save_trade_history,
        calculate_portfolio_from_trades,
        save_portfolio_data,
        is_option_ticker,
        parse_account_history_file,
        save_account_history,
        get_leverage_info,
        load_portfolio_data
    )
    from database.manager import get_db

    # Check SQL availability
    try:
        import sqlalchemy
        SQL_AVAILABLE = True
    except ImportError:
        SQL_AVAILABLE = False

    st.markdown("## 🔥 PHOENIX MODE")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("### 📊 Trade History")
        trade_file = st.file_uploader("Upload Trade History", type=['xls', 'xlsx'], key="trade")

        if trade_file:
            with st.spinner("Parsing..."):
                trade_df = parse_trade_history_file(trade_file)

                if trade_df is not None:
                    # FIX #7: Add debug output to diagnose database save issues
                    with st.expander("🔍 Debug Info - Trade File Columns", expanded=False):
                        st.write("**Columns in uploaded file:**")
                        st.write(list(trade_df.columns))
                        st.write(f"**SQL_AVAILABLE:** {SQL_AVAILABLE}")
                        if not SQL_AVAILABLE:
                            st.warning("⚠️ Database not available - trades will save to cache file only")

                    save_trade_history(trade_df)
                    st.success(f"✅ Parsed {len(trade_df)} trades!")

                    # CRITICAL FIX: Verify database save
                    if SQL_AVAILABLE:
                        try:
                            db = get_db()
                            db_count = db.read("SELECT COUNT(*) as count FROM trades").iloc[0]['count']
                            st.success(f"💾 Database now contains {db_count} total trade records (persistent across sessions)")

                            # Show last 5 trades from database to confirm
                            last_trades = db.read("SELECT * FROM trades ORDER BY date DESC LIMIT 5")
                            if len(last_trades) > 0:
                                with st.expander("🔍 Last 5 Trades in Database", expanded=False):
                                    st.dataframe(last_trades, use_container_width=True)
                        except Exception as e:
                            st.warning(f"⚠️ Could not verify database: {e}")

                    show_toast(f"Trade history imported: {len(trade_df)} trades parsed successfully", toast_type="success", duration=3000)
                    make_scrollable_table(trade_df.head(10), height=400, hide_index=True, use_container_width=True, column_config=None)

                    # Check for options that will be filtered
                    option_tickers = []
                    if 'Symbol' in trade_df.columns:
                        unique_symbols = trade_df['Symbol'].unique()
                        option_tickers = [ticker for ticker in unique_symbols if is_option_ticker(ticker)]

                    portfolio_df = calculate_portfolio_from_trades(trade_df)
                    if len(portfolio_df) > 0:
                        save_portfolio_data(portfolio_df.to_dict('records'))
                        st.success(f"🎉 Portfolio rebuilt! {len(portfolio_df)} positions")
                        show_toast(f"🔥 Phoenix reconstruction complete: {len(portfolio_df)} positions rebuilt", toast_type="success", duration=4000)

                        # Show filtered options if any
                        if option_tickers:
                            with st.expander(f"🗑️ Filtered {len(option_tickers)} option symbols"):
                                st.info("""
                                **Options automatically excluded from equity portfolio:**

                                These option positions are excluded from equity analysis:
                                """)
                                for opt in option_tickers:
                                    st.write(f"- {opt}")

                        make_scrollable_table(portfolio_df, height=400, hide_index=True, use_container_width=True, column_config=None)

    with col2:
        st.markdown("### 💰 Account History")
        account_file = st.file_uploader("Upload Account History", type=['xls', 'xlsx'], key="account")

        if account_file:
            with st.spinner("Parsing..."):
                account_df = parse_account_history_file(account_file)

                if account_df is not None:
                    save_account_history(account_df)
                    st.success(f"✅ Parsed {len(account_df)} records!")
                    show_toast(f"Account history imported: {len(account_df)} records processed", toast_type="success", duration=3000)
                    make_scrollable_table(account_df.head(10), height=400, hide_index=True, use_container_width=True, column_config=None)

                    leverage_info_parsed = get_leverage_info()
                    if leverage_info_parsed:
                        st.info(f"""
                        💡 Leverage Detected:
                        - Margin: ${leverage_info_parsed['margin_used']:,.2f}
                        - Leverage: {leverage_info_parsed['leverage_ratio']:.2f}x
                        """)

    # PHASE 4: Database Management Section
    st.markdown("---")
    st.markdown("### 💾 Database Management")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("#### 📊 Database Status")

        if SQL_AVAILABLE:
            try:
                db = get_db()

                # Check if portfolio exists in database
                portfolio_db = db.get_portfolio()
                portfolio_count = len(portfolio_db)

                # Check if trades exist in database
                trades_db = db.get_trades()
                trades_count = len(trades_db)

                st.success("✅ Database Connected")

                # Transform to premium cards
                db_col1, db_col2 = st.columns(2)

                with db_col1:
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(139,92,246,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #a855f7); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📊</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">PORTFOLIO POSITIONS</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #a5b4fc; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{portfolio_count}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(139,92,246,0.12); border-radius: 10px; border: 1px solid rgba(139,92,246,0.25);"><p style="font-size: 0.7rem; color: #d8b4fe; margin: 0; font-weight: 600;">Active Holdings</p></div></div>', unsafe_allow_html=True)

                with db_col2:
                    st.markdown(f'<div style="background: linear-gradient(135deg, rgba(6,182,212,0.08), rgba(21,25,50,0.95)); backdrop-filter: blur(24px); border-radius: 24px; border: 1px solid rgba(6,182,212,0.2); padding: 1.75rem 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.2); min-height: 200px; position: relative; overflow: hidden;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #3b82f6); opacity: 0.8;"></div><div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.875rem;"><span style="font-size: 1rem;">📜</span><p style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; font-weight: 600;">TRADE HISTORY RECORDS</p></div><h3 style="font-size: 2.5rem; font-weight: 800; color: #67e8f9; margin: 0.5rem 0 0.75rem 0; line-height: 1;">{trades_count}</h3><div style="display: inline-block; padding: 0.4rem 0.75rem; background: rgba(6,182,212,0.12); border-radius: 10px; border: 1px solid rgba(6,182,212,0.25);"><p style="font-size: 0.7rem; color: #a5f3fc; margin: 0; font-weight: 600;">Total Transactions</p></div></div>', unsafe_allow_html=True)

                if portfolio_count > 0:
                    st.info(f"💡 Last updated: {portfolio_db['updated_at'].max() if 'updated_at' in portfolio_db.columns else 'Unknown'}")

            except Exception as e:
                st.error(f"❌ Database Error: {e}")
        else:
            st.warning("⚠️ SQL database not available")
            st.info("Portfolio data is saved to pickle cache only")

    with col2:
        st.markdown("#### 🔄 Manual Database Operations")

        # Manual save button
        if st.button("💾 Save Current Portfolio to Database", type="primary"):
            # Load current portfolio
            portfolio_data = load_portfolio_data()

            # ===== FIX #1: Robust validation =====
            has_data = False

            if portfolio_data is not None:
                if isinstance(portfolio_data, pd.DataFrame):
                    has_data = not portfolio_data.empty
                elif isinstance(portfolio_data, list):
                    has_data = len(portfolio_data) > 0

            if not has_data:
                st.error("❌ No portfolio data to save. Upload data via Phoenix Parser first.")
            else:
                # Convert to DataFrame if needed
                if isinstance(portfolio_data, list):
                    df = pd.DataFrame(portfolio_data)
                else:
                    df = portfolio_data

                # DEBUG: Show what we're saving
                st.info(f"💾 Attempting to save {len(df)} positions...")

                try:
                    import sqlite3

                    # Connect to database
                    conn = sqlite3.connect('atlas_portfolio.db', timeout=10)
                    cursor = conn.cursor()

                    # Create table if it doesn't exist
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS portfolio_positions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            ticker TEXT NOT NULL,
                            quantity REAL NOT NULL,
                            avg_cost REAL NOT NULL,
                            current_price REAL,
                            total_value REAL,
                            sector TEXT,
                            last_updated TEXT
                        )
                    """)

                    # Clear existing positions
                    cursor.execute("DELETE FROM portfolio_positions")

                    # Save each position
                    saved_count = 0
                    for idx, row in df.iterrows():
                        try:
                            # Handle different column name variations
                            ticker = str(row.get('Ticker', row.get('Symbol', 'UNKNOWN')))
                            quantity = float(row.get('Quantity', row.get('Shares', 0)))
                            avg_cost = float(row.get('Avg Cost', row.get('Average Cost', row.get('Avg Price', 0))))
                            current_price = float(row.get('Current Price', 0))
                            total_value = float(row.get('Total Value', quantity * current_price if current_price else quantity * avg_cost))
                            sector = str(row.get('Sector', 'Unknown'))

                            cursor.execute("""
                                INSERT INTO portfolio_positions
                                (ticker, quantity, avg_cost, current_price, total_value, sector, last_updated)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            """, (
                                ticker,
                                quantity,
                                avg_cost,
                                current_price,
                                total_value,
                                sector,
                                datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                            ))
                            saved_count += 1
                        except Exception as row_error:
                            st.warning(f"⚠️ Skipped {row.get('Ticker', row.get('Symbol', 'unknown'))}: {row_error}")

                    conn.commit()
                    conn.close()

                    st.success(f"✅ Successfully saved {saved_count} positions to database!")
                    st.balloons()

                except Exception as e:
                    st.error(f"❌ Database save failed: {str(e)}")
                    import traceback
                    st.code(traceback.format_exc())

        # Debug database state button
        if st.button("🔍 Debug Database State"):
            try:
                import sqlite3
                conn = sqlite3.connect('atlas_portfolio.db')
                result = pd.read_sql("SELECT * FROM portfolio_positions", conn)
                st.write(f"**Database has {len(result)} positions**")
                if len(result) > 0:
                    make_scrollable_table(result, height=400, hide_index=True, use_container_width=True)
                else:
                    st.info("No positions found in database")
                conn.close()
            except Exception as e:
                st.error(f"Error reading database: {e}")

        # Clear database button
        if st.button("🗑️ Clear Database (Keep Pickle Cache)"):
            if SQL_AVAILABLE:
                try:
                    db = get_db()
                    db.execute("DELETE FROM holdings")
                    st.success("✅ Database cleared (pickle cache preserved)")
                    show_toast("Database cleared successfully", toast_type="info", duration=2000)
                except Exception as e:
                    st.error(f"❌ Clear failed: {e}")
            else:
                st.error("❌ SQL database not available")

        st.info("""
        **ℹ️ Auto-Save:**
        Portfolio data is automatically saved to both:
        - 💾 SQL Database (persistent)
        - 📦 Pickle Cache (backup)

        Use the manual save button to force a database update.
        """)

    # ===== FIX #8: LEVERAGE TRACKING FEATURE =====
    st.markdown("---")
    st.markdown("### 📊 Leverage Tracking (Optional)")
    st.info("📈 Upload your Investopedia performance-history.xls file to enable leverage analysis")

    perf_history_file = st.file_uploader(
        "📈 Upload Performance History",
        type=['xls', 'xlsx', 'html'],
        help="Upload your Investopedia performance-history.xls file for leverage tracking",
        key="perf_history"
    )

    if perf_history_file is not None:
        try:
            # Save uploaded file temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix='.xls') as tmp_file:
                tmp_file.write(perf_history_file.getvalue())
                tmp_path = tmp_file.name

            # Parse leverage data
            from analytics.leverage_tracker import LeverageTracker

            tracker = LeverageTracker(tmp_path)

            if tracker.load_and_parse():
                # Get current stats
                stats = tracker.get_current_stats()

                # Display current leverage
                st.success("✅ Performance history loaded!")

                col1, col2, col3, col4 = st.columns(4)

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
                        help="Account Value (Column F)"
                    )

                with col3:
                    st.metric(
                        "Gross Exposure",
                        f"${stats['current_gross_exposure']:,.0f}",
                        help="Total position value"
                    )

                with col4:
                    st.metric(
                        "Avg Leverage",
                        f"{stats['avg_leverage']:.2f}x",
                        help="Historical average"
                    )

                # Store in session state for other pages
                st.session_state.leverage_tracker = tracker

                # FIX #5: Auto-update equity capital from performance history
                if 'current_equity' in stats:
                    st.session_state['equity_capital'] = stats['current_equity']
                    st.info(f"💰 Equity capital auto-set to ${stats['current_equity']:,.0f} from performance history")

                # Show dashboard
                with st.expander("📊 View Leverage Dashboard", expanded=True):
                    fig = tracker.create_leverage_dashboard()
                    st.plotly_chart(fig, use_container_width=True)

                # Show calculation workings
                with st.expander("🧮 Calculation Workings"):
                    workings = tracker.create_workings_display()
                    st.markdown(workings)

                show_toast("Leverage tracking enabled! Visit the Leverage Tracker page for full analysis", toast_type="success", duration=4000)
            else:
                st.error("❌ Could not parse performance history file")

        except Exception as e:
            st.error(f"Error loading performance history: {e}")
            import traceback
            st.code(traceback.format_exc())
