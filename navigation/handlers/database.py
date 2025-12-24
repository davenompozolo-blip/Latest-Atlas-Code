"""
Database Page Handler

Database management interface for ATLAS portfolio data.
Provides SQL query interface, saved queries, and schema information.
"""

def render_database_page():
    """
    Render the Database Management page.

    Features:
    - Quick stats and metrics
    - Custom SQL query interface
    - Saved query management
    - Database schema information
    - Database maintenance tools
    """
    import streamlit as st
    import pandas as pd
    from datetime import datetime
    import os

    # Import helper functions
    from utils.ui_components import make_scrollable_table
    from database.manager import get_db

    # Check if SQL is available
    try:
        import sqlalchemy
        SQL_AVAILABLE = True
    except ImportError:
        SQL_AVAILABLE = False

    st.markdown("## 💾 DATABASE MANAGEMENT")

    if not SQL_AVAILABLE:
        st.error("❌ SQL database not available")
        st.info("""
        **To enable database features:**
        1. Install SQLAlchemy: `pip install sqlalchemy`
        2. Database will be automatically created at: `data/atlas.db`
        3. Restart the application
        """)
        return

    try:
        db = get_db()
        st.success("✅ Database Connected")
    except Exception as e:
        st.error(f"Error connecting to database: {str(e)}")
        return

    # Create 4 tabs as per Phase 5 specs
    tabs = st.tabs(["📊 Quick Stats", "🔍 Custom Query", "💾 Saved Queries", "ℹ️ Database Info"])

    # ====================================================================
    # TAB 1: QUICK STATS
    # ====================================================================
    with tabs[0]:
        st.markdown("### 📊 Quick Stats & Overview")

        # Database metrics
        col1, col2, col3, col4 = st.columns(4)

        try:
            # CRITICAL FIX: Query database directly, not pickle cache
            portfolio_count = len(db.get_portfolio())

            # Query trades table directly from database
            try:
                trades_result = db.read("SELECT COUNT(*) as count FROM trades")
                trades_count = trades_result.iloc[0]['count'] if len(trades_result) > 0 else 0
            except:
                trades_count = 0

            # Calculate additional metrics
            if portfolio_count > 0:
                portfolio_df = db.get_portfolio()
                total_value = (portfolio_df['quantity'] * portfolio_df['current_price'].fillna(portfolio_df['avg_cost'])).sum()
                total_cost = (portfolio_df['quantity'] * portfolio_df['avg_cost']).sum()
            else:
                total_value = 0
                total_cost = 0

            with col1:
                st.metric("Portfolio Positions", portfolio_count)

            with col2:
                st.metric("Trade Records", trades_count)

            with col3:
                st.metric("Total Value", f"${total_value:,.0f}")

            with col4:
                pl = total_value - total_cost
                pl_pct = (pl / total_cost * 100) if total_cost > 0 else 0
                st.metric("Total P&L", f"${pl:,.0f}", f"{pl_pct:+.2f}%")

        except Exception as e:
            st.error(f"Error calculating stats: {e}")

        st.markdown("---")

        # Recent activity
        st.markdown("#### 📈 Recent Activity")

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("##### Current Portfolio Holdings")
            try:
                portfolio = db.get_portfolio()
                if len(portfolio) > 0:
                    display_df = portfolio[['ticker', 'quantity', 'avg_cost', 'current_price']].copy()
                    display_df['value'] = display_df['quantity'] * display_df['current_price'].fillna(display_df['avg_cost'])
                    display_df = display_df.sort_values('value', ascending=False)
                    make_scrollable_table(display_df, height=400, hide_index=True, use_container_width=True)
                else:
                    st.info("No positions in database")
            except Exception as e:
                st.error(f"Error: {e}")

        with col2:
            st.markdown("##### Recent Trades")
            try:
                # CRITICAL FIX: Query database directly, not pickle
                trades = db.read("SELECT * FROM trades ORDER BY date DESC LIMIT 10")
                if len(trades) > 0:
                    display_trades = trades[['date', 'ticker', 'action', 'quantity', 'price']]
                    make_scrollable_table(display_trades, height=400, hide_index=True, use_container_width=True)
                    st.caption(f"💾 Showing {len(trades)} most recent trades from database")
                else:
                    st.info("No trades in database yet. Upload trade history in Phoenix Parser.")
            except Exception as e:
                st.error(f"Error querying database: {e}")

        st.markdown("---")

        # Performance summary
        st.markdown("#### 🎯 Performance Summary")

        try:
            portfolio = db.get_portfolio()
            if len(portfolio) > 0:
                # Calculate metrics
                portfolio['position_value'] = portfolio['quantity'] * portfolio['current_price'].fillna(portfolio['avg_cost'])
                portfolio['cost_basis'] = portfolio['quantity'] * portfolio['avg_cost']
                portfolio['unrealized_pl'] = portfolio['position_value'] - portfolio['cost_basis']
                portfolio['pl_pct'] = (portfolio['unrealized_pl'] / portfolio['cost_basis'] * 100).round(2)

                # Sort by P&L percentage
                portfolio_sorted = portfolio.sort_values('pl_pct', ascending=False)

                # Top performers
                col1, col2 = st.columns(2)

                with col1:
                    st.markdown("##### 🟢 Top Performers")
                    top_performers = portfolio_sorted.head(3)
                    for _, row in top_performers.iterrows():
                        st.metric(
                            row['ticker'],
                            f"${row['position_value']:,.2f}",
                            f"{row['pl_pct']:+.2f}%"
                        )

                with col2:
                    st.markdown("##### 🔴 Bottom Performers")
                    bottom_performers = portfolio_sorted.tail(3)
                    for _, row in bottom_performers.iterrows():
                        st.metric(
                            row['ticker'],
                            f"${row['position_value']:,.2f}",
                            f"{row['pl_pct']:+.2f}%"
                        )
            else:
                st.info("No portfolio data available for performance analysis")

        except Exception as e:
            st.error(f"Error calculating performance: {e}")

    # ====================================================================
    # TAB 2: CUSTOM QUERY
    # ====================================================================
    with tabs[1]:
        st.markdown("### 🔍 Custom SQL Query")
        st.markdown("Execute custom SQL queries against the ATLAS database")

        # Query templates
        st.markdown("#### 📝 Query Templates")

        col1, col2, col3 = st.columns(3)

        with col1:
            if st.button("📊 All Holdings", use_container_width=True):
                st.session_state['sql_query'] = "SELECT * FROM holdings ORDER BY ticker"

        with col2:
            if st.button("📈 All Trades", use_container_width=True):
                st.session_state['sql_query'] = "SELECT * FROM trades ORDER BY date DESC LIMIT 20"

        with col3:
            if st.button("💰 Portfolio Value", use_container_width=True):
                st.session_state['sql_query'] = """SELECT
    ticker,
    quantity,
    avg_cost,
    current_price,
    (quantity * COALESCE(current_price, avg_cost)) as position_value,
    (quantity * avg_cost) as cost_basis,
    ((quantity * COALESCE(current_price, avg_cost)) - (quantity * avg_cost)) as unrealized_pl
FROM holdings
ORDER BY position_value DESC"""

        st.markdown("---")

        # SQL editor
        default_query = st.session_state.get('sql_query', "SELECT * FROM holdings LIMIT 10")

        sql_query = st.text_area(
            "SQL Query",
            value=default_query,
            height=200,
            help="Write your SQL query here. Tables: holdings, trades, prices, analytics_cache"
        )

        col1, col2 = st.columns([1, 4])

        with col1:
            execute_button = st.button("▶️ Execute Query", type="primary", use_container_width=True)

        with col2:
            st.info("**Available tables:** holdings, trades, prices, analytics_cache")

        if execute_button:
            with st.spinner("Executing query..."):
                try:
                    result_df = db.read(sql_query)

                    st.success(f"✅ Query executed successfully - {len(result_df)} rows returned")

                    # Display results
                    st.markdown("#### Results:")
                    make_scrollable_table(result_df, height=600, hide_index=True, use_container_width=True)

                    # Export option
                    csv = result_df.to_csv(index=False).encode('utf-8')
                    st.download_button(
                        label="📥 Download as CSV",
                        data=csv,
                        file_name=f"query_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
                        mime="text/csv"
                    )

                except Exception as e:
                    st.error(f"❌ Query failed: {str(e)}")
                    st.code(str(e))

        st.markdown("---")

        # Quick reference
        with st.expander("📚 SQL Quick Reference"):
            st.markdown("""
            **Common SQL Commands:**
            - `SELECT * FROM table_name` - Get all records
            - `WHERE column = value` - Filter results
            - `ORDER BY column DESC` - Sort results
            - `LIMIT 10` - Limit number of results
            - `COUNT(*)` - Count rows
            - `SUM(column)` - Sum values
            - `AVG(column)` - Average values
            - `GROUP BY column` - Group results

            **Examples:**
            ```sql
            -- Get trades for a specific ticker
            SELECT * FROM trades WHERE ticker = 'AAPL' ORDER BY date DESC

            -- Calculate total invested per ticker
            SELECT ticker, SUM(quantity * price) as total_invested
            FROM trades
            WHERE action = 'BUY'
            GROUP BY ticker

            -- Get portfolio summary
            SELECT
                COUNT(*) as num_positions,
                SUM(quantity * avg_cost) as total_cost
            FROM holdings
            ```
            """)

    # ====================================================================
    # TAB 3: SAVED QUERIES
    # ====================================================================
    with tabs[2]:
        st.markdown("### 💾 Saved Queries")
        st.markdown("Save and manage frequently used queries")

        # Initialize saved queries in session state
        if 'saved_queries' not in st.session_state:
            st.session_state['saved_queries'] = {
                'Portfolio Summary': "SELECT ticker, quantity, avg_cost, current_price FROM holdings ORDER BY ticker",
                'Recent Trades': "SELECT date, ticker, action, quantity, price FROM trades ORDER BY date DESC LIMIT 20",
                'Trade Volume by Ticker': "SELECT ticker, COUNT(*) as trade_count, SUM(quantity) as total_shares FROM trades GROUP BY ticker ORDER BY trade_count DESC",
                'Buy vs Sell Summary': "SELECT action, COUNT(*) as trade_count, SUM(quantity * price) as total_value FROM trades GROUP BY action"
            }

        # Add new query
        with st.expander("➕ Save New Query"):
            new_query_name = st.text_input("Query Name")
            new_query_sql = st.text_area("SQL Query", height=150)

            if st.button("💾 Save Query"):
                if new_query_name and new_query_sql:
                    st.session_state['saved_queries'][new_query_name] = new_query_sql
                    st.success(f"✅ Query '{new_query_name}' saved!")
                else:
                    st.warning("Please provide both name and query")

        st.markdown("---")

        # Display saved queries
        st.markdown("#### 📋 Your Saved Queries")

        for query_name, query_sql in st.session_state['saved_queries'].items():
            with st.expander(f"📌 {query_name}"):
                st.code(query_sql, language='sql')

                col1, col2, col3 = st.columns(3)

                with col1:
                    if st.button(f"▶️ Run", key=f"run_{query_name}"):
                        try:
                            result = db.read(query_sql)
                            st.success(f"✅ {len(result)} rows")
                            make_scrollable_table(result, height=400, hide_index=True, use_container_width=True)
                        except Exception as e:
                            st.error(f"Error: {e}")

                with col2:
                    if st.button(f"📋 Copy", key=f"copy_{query_name}"):
                        st.session_state['sql_query'] = query_sql
                        st.info("Query copied to Custom Query tab")

                with col3:
                    if st.button(f"🗑️ Delete", key=f"delete_{query_name}"):
                        if query_name in st.session_state['saved_queries']:
                            del st.session_state['saved_queries'][query_name]
                            st.rerun()

    # ====================================================================
    # TAB 4: DATABASE INFO
    # ====================================================================
    with tabs[3]:
        st.markdown("### ℹ️ Database Information")

        # Database location
        st.markdown("#### 📁 Database Location")
        db_path = "data/atlas.db"
        st.code(db_path)

        st.markdown("---")

        # Table schemas
        st.markdown("#### 📊 Table Schemas")

        tables = [
            {
                'name': 'holdings',
                'description': 'Current portfolio positions',
                'columns': [
                    ('id', 'INTEGER', 'Primary key'),
                    ('portfolio_id', 'INTEGER', 'Portfolio identifier'),
                    ('ticker', 'TEXT', 'Stock ticker symbol'),
                    ('quantity', 'REAL', 'Number of shares'),
                    ('avg_cost', 'REAL', 'Average cost per share'),
                    ('current_price', 'REAL', 'Current market price'),
                    ('updated_at', 'TIMESTAMP', 'Last update time')
                ]
            },
            {
                'name': 'trades',
                'description': 'Trade history',
                'columns': [
                    ('id', 'INTEGER', 'Primary key'),
                    ('date', 'DATE', 'Trade date'),
                    ('ticker', 'TEXT', 'Stock ticker symbol'),
                    ('action', 'TEXT', 'BUY or SELL'),
                    ('quantity', 'REAL', 'Number of shares'),
                    ('price', 'REAL', 'Execution price'),
                    ('created_at', 'TIMESTAMP', 'Record creation time')
                ]
            },
            {
                'name': 'prices',
                'description': 'Historical price data',
                'columns': [
                    ('id', 'INTEGER', 'Primary key'),
                    ('date', 'DATE', 'Price date'),
                    ('ticker', 'TEXT', 'Stock ticker symbol'),
                    ('open_price', 'REAL', 'Opening price'),
                    ('high_price', 'REAL', 'High price'),
                    ('low_price', 'REAL', 'Low price'),
                    ('close_price', 'REAL', 'Closing price'),
                    ('volume', 'REAL', 'Trading volume'),
                    ('updated_at', 'TIMESTAMP', 'Last update time')
                ]
            },
            {
                'name': 'analytics_cache',
                'description': 'Cached analysis results',
                'columns': [
                    ('id', 'INTEGER', 'Primary key'),
                    ('analysis_type', 'TEXT', 'Type of analysis'),
                    ('parameters', 'TEXT', 'Analysis parameters (JSON)'),
                    ('result', 'TEXT', 'Analysis result (JSON)'),
                    ('created_at', 'TIMESTAMP', 'Cache creation time')
                ]
            }
        ]

        for table in tables:
            with st.expander(f"📋 {table['name']} - {table['description']}"):
                # Create DataFrame for columns
                schema_df = pd.DataFrame(table['columns'], columns=['Column', 'Type', 'Description'])
                make_scrollable_table(schema_df, height=400, hide_index=True, use_container_width=True)

                # Show row count
                try:
                    count_result = db.read(f"SELECT COUNT(*) as count FROM {table['name']}")
                    row_count = count_result.iloc[0]['count']
                    st.info(f"📊 Current rows: {row_count}")
                except:
                    st.info("📊 Table not yet created")

        st.markdown("---")

        # Database statistics
        st.markdown("#### 📈 Database Statistics")

        try:
            col1, col2 = st.columns(2)

            with col1:
                # Get total records across all tables
                total_holdings = len(db.read("SELECT * FROM holdings"))
                total_trades = len(db.read("SELECT * FROM trades"))

                st.metric("Total Holdings Records", total_holdings)
                st.metric("Total Trade Records", total_trades)

            with col2:
                # Calculate database size (if possible)
                if os.path.exists('data/atlas.db'):
                    db_size = os.path.getsize('data/atlas.db') / 1024  # KB
                    st.metric("Database Size", f"{db_size:.2f} KB")

                # Last update time
                portfolio = db.get_portfolio()
                if len(portfolio) > 0 and 'updated_at' in portfolio.columns:
                    last_update = portfolio['updated_at'].max()
                    st.metric("Last Portfolio Update", str(last_update))

        except Exception as e:
            st.error(f"Error calculating statistics: {e}")

        st.markdown("---")

        # Database maintenance
        st.markdown("#### 🛠️ Database Maintenance")

        col1, col2 = st.columns(2)

        with col1:
            if st.button("🔄 Vacuum Database", help="Optimize database and reclaim space"):
                try:
                    db.execute("VACUUM")
                    st.success("✅ Database vacuumed successfully")
                except Exception as e:
                    st.error(f"Error: {e}")

        with col2:
            if st.button("📊 Analyze Tables", help="Update table statistics"):
                try:
                    db.execute("ANALYZE")
                    st.success("✅ Tables analyzed successfully")
                except Exception as e:
                    st.error(f"Error: {e}")

        st.warning("⚠️ Maintenance operations may take a few seconds for large databases")
