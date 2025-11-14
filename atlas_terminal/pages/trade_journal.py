"""
Trade Journal Page
UI for tracking and analyzing individual trades
"""

import streamlit as st
import pandas as pd
from datetime import datetime
import logging

from ..features.trade_journal import TradeJournal
from ..data.cache_manager import load_trade_history, load_portfolio_data
from ..visualizations.formatters import ATLASFormatter
from ..config import COLORS, VERSION

logger = logging.getLogger(__name__)


def render():
    """Render the Trade Journal page"""
    
    st.markdown("## 📓 TRADE JOURNAL")
    st.markdown("### Track, Analyze, and Learn from Every Trade")
    
    # Initialize Trade Journal
    try:
        journal = TradeJournal()
    except Exception as e:
        logger.error(f"Error initializing Trade Journal: {e}", exc_info=True)
        st.error(f"Error loading Trade Journal: {e}")
        return
    
    # Get statistics
    stats = journal.get_trade_statistics()
    
    # Top metrics row
    st.markdown("---")
    st.markdown("### 📊 Performance Overview")
    
    col1, col2, col3, col4, col5 = st.columns(5)
    
    with col1:
        st.metric(
            "Total Trades",
            stats.get('total_trades', 0),
            delta=f"{stats.get('open_trades', 0)} Open"
        )
    
    with col2:
        st.metric(
            "Win Rate",
            f"{stats.get('win_rate', 0):.1f}%",
            delta=f"{stats.get('winners', 0)}W / {stats.get('losers', 0)}L"
        )
    
    with col3:
        total_pnl = stats.get('total_pnl', 0)
        st.metric(
            "Total P&L",
            ATLASFormatter.format_currency(total_pnl, decimals=0),
            delta="Realized"
        )
    
    with col4:
        avg_return = stats.get('avg_return', 0)
        st.metric(
            "Avg Return",
            f"{avg_return:+.2f}%",
            delta="Per Trade"
        )
    
    with col5:
        profit_factor = stats.get('profit_factor', 0)
        st.metric(
            "Profit Factor",
            f"{profit_factor:.2f}",
            delta="Wins/Losses"
        )
    
    # Additional stats
    if stats.get('closed_trades', 0) > 0:
        st.markdown("---")
        col1, col2, col3 = st.columns(3)
        
        with col1:
            st.markdown("**💰 Best Trade**")
            best = stats.get('best_trade')
            if best:
                st.success(f"{best.get('ticker', 'N/A')}: {ATLASFormatter.format_currency(best.get('realized_pnl', 0))}")
        
        with col2:
            st.markdown("**📉 Worst Trade**")
            worst = stats.get('worst_trade')
            if worst:
                st.error(f"{worst.get('ticker', 'N/A')}: {ATLASFormatter.format_currency(worst.get('realized_pnl', 0))}")
        
        with col3:
            st.markdown("**⏱️ Avg Hold Time**")
            avg_days = stats.get('avg_hold_days', 0)
            st.info(f"{avg_days:.0f} days")
    
    st.markdown("---")
    
    # Tabs for different views
    tab1, tab2, tab3, tab4 = st.tabs([
        "📋 All Trades",
        "🔓 Open Positions",
        "✅ Closed Trades",
        "➕ Add Trade"
    ])
    
    with tab1:
        st.markdown("### 📋 Complete Trade History")
        
        if journal.trades:
            df = journal.export_to_dataframe()
            
            # Format for display
            display_cols = ['ticker', 'action', 'entry_date', 'entry_price', 'quantity', 
                          'exit_date', 'exit_price', 'realized_pnl', 'return_pct', 
                          'status', 'hold_days', 'strategy']
            
            available_cols = [col for col in display_cols if col in df.columns]
            display_df = df[available_cols].copy()
            
            # Format values
            if 'entry_price' in display_df.columns:
                display_df['entry_price'] = display_df['entry_price'].apply(
                    lambda x: ATLASFormatter.format_currency(x) if pd.notna(x) else 'N/A'
                )
            if 'exit_price' in display_df.columns:
                display_df['exit_price'] = display_df['exit_price'].apply(
                    lambda x: ATLASFormatter.format_currency(x) if pd.notna(x) else 'N/A'
                )
            if 'realized_pnl' in display_df.columns:
                display_df['realized_pnl'] = display_df['realized_pnl'].apply(
                    lambda x: ATLASFormatter.format_currency(x) if pd.notna(x) else 'N/A'
                )
            if 'return_pct' in display_df.columns:
                display_df['return_pct'] = display_df['return_pct'].apply(
                    lambda x: f"{x:+.2f}%" if pd.notna(x) else 'N/A'
                )
            
            st.dataframe(display_df, use_container_width=True, height=500)
            
            # Download button
            csv = df.to_csv(index=False)
            st.download_button(
                label="📥 Download Trade History (CSV)",
                data=csv,
                file_name=f"trade_journal_{datetime.now().strftime('%Y%m%d')}.csv",
                mime="text/csv"
            )
        else:
            st.info("No trades recorded yet. Add trades manually or auto-detect from trade history.")
    
    with tab2:
        st.markdown("### 🔓 Open Positions")
        
        open_trades = journal.get_open_trades()
        
        if open_trades:
            df_open = pd.DataFrame(open_trades)
            
            # Calculate days held
            for idx, row in df_open.iterrows():
                if 'entry_date' in row:
                    entry = pd.to_datetime(row['entry_date'])
                    days_held = (datetime.now() - entry).days
                    df_open.at[idx, 'days_held'] = days_held
            
            # Display columns
            display_cols = ['ticker', 'entry_date', 'entry_price', 'quantity', 
                          'total_cost', 'days_held', 'strategy', 'notes']
            available_cols = [col for col in display_cols if col in df_open.columns]
            
            st.dataframe(df_open[available_cols], use_container_width=True, height=400)
        else:
            st.info("No open positions. All trades are closed.")
    
    with tab3:
        st.markdown("### ✅ Closed Trades")
        
        closed_trades = journal.get_closed_trades()
        
        if closed_trades:
            df_closed = pd.DataFrame(closed_trades)
            
            # Sort by P&L
            if 'realized_pnl' in df_closed.columns:
                df_closed = df_closed.sort_values('realized_pnl', ascending=False)
            
            # Display columns
            display_cols = ['ticker', 'entry_date', 'exit_date', 'entry_price', 
                          'exit_price', 'quantity', 'realized_pnl', 'return_pct', 
                          'hold_days', 'strategy']
            available_cols = [col for col in display_cols if col in df_closed.columns]
            
            st.dataframe(df_closed[available_cols], use_container_width=True, height=400)
            
            # Performance breakdown
            st.markdown("---")
            st.markdown("#### 📊 Performance Breakdown")
            
            col1, col2 = st.columns(2)
            
            with col1:
                st.markdown("**💰 Winners**")
                winners = df_closed[df_closed['realized_pnl'] > 0] if 'realized_pnl' in df_closed.columns else pd.DataFrame()
                if not winners.empty:
                    st.success(f"{len(winners)} trades | Avg: {ATLASFormatter.format_currency(winners['realized_pnl'].mean())}")
                    st.dataframe(
                        winners[['ticker', 'realized_pnl', 'return_pct']].head(5),
                        use_container_width=True,
                        hide_index=True
                    )
            
            with col2:
                st.markdown("**📉 Losers**")
                losers = df_closed[df_closed['realized_pnl'] < 0] if 'realized_pnl' in df_closed.columns else pd.DataFrame()
                if not losers.empty:
                    st.error(f"{len(losers)} trades | Avg: {ATLASFormatter.format_currency(losers['realized_pnl'].mean())}")
                    st.dataframe(
                        losers[['ticker', 'realized_pnl', 'return_pct']].head(5),
                        use_container_width=True,
                        hide_index=True
                    )
        else:
            st.info("No closed trades yet.")
    
    with tab4:
        st.markdown("### ➕ Add New Trade")
        
        # Two options: Auto-detect or Manual entry
        add_method = st.radio(
            "How would you like to add trades?",
            ["🤖 Auto-Detect from Trade History", "✍️ Manual Entry"]
        )
        
        if add_method == "🤖 Auto-Detect from Trade History":
            st.markdown("#### Auto-Detect Trades")
            st.info("Automatically detect trades from your uploaded trade history and portfolio data.")
            
            if st.button("🔍 Detect Trades", type="primary"):
                with st.spinner("Analyzing trade history..."):
                    try:
                        # Load data
                        trade_history = load_trade_history()
                        portfolio_data = load_portfolio_data()
                        
                        if trade_history is not None and portfolio_data:
                            portfolio_df = pd.DataFrame(portfolio_data)
                            new_trades = journal.detect_trades_from_history(trade_history, portfolio_df)
                            
                            if new_trades > 0:
                                st.success(f"✅ Detected and added {new_trades} new trades!")
                                st.rerun()
                            else:
                                st.info("No new trades detected. All trades may already be logged.")
                        else:
                            st.warning("Please upload trade history and portfolio data in the sidebar first.")
                    
                    except Exception as e:
                        logger.error(f"Error detecting trades: {e}", exc_info=True)
                        st.error(f"Error detecting trades: {e}")
        
        else:
            st.markdown("#### Manual Trade Entry")
            
            with st.form("add_trade_form"):
                col1, col2 = st.columns(2)
                
                with col1:
                    ticker = st.text_input("Ticker Symbol", placeholder="e.g., AAPL").upper()
                    action = st.selectbox("Action", ["OPEN", "CLOSE", "ADD", "TRIM"])
                    entry_date = st.date_input("Entry Date", value=datetime.now())
                    entry_price = st.number_input("Entry Price", min_value=0.01, value=100.0, step=0.01)
                    quantity = st.number_input("Quantity", min_value=1, value=100, step=1)
                
                with col2:
                    exit_date = st.date_input("Exit Date (optional)", value=None)
                    exit_price = st.number_input("Exit Price (optional)", min_value=0.0, value=0.0, step=0.01)
                    strategy = st.text_input("Strategy", placeholder="e.g., Momentum, Value")
                    notes = st.text_area("Notes", placeholder="Trade thesis, reasons, etc.")
                
                submitted = st.form_submit_button("➕ Add Trade", type="primary")
                
                if submitted:
                    if ticker:
                        try:
                            success = journal.add_manual_trade(
                                ticker=ticker,
                                action=action,
                                entry_date=entry_date.strftime('%Y-%m-%d'),
                                entry_price=entry_price,
                                quantity=quantity,
                                exit_date=exit_date.strftime('%Y-%m-%d') if exit_date else None,
                                exit_price=exit_price if exit_price > 0 else None,
                                notes=notes,
                                tags=[],
                                strategy=strategy if strategy else "Manual"
                            )
                            
                            if success:
                                st.success(f"✅ Trade for {ticker} added successfully!")
                                st.rerun()
                            else:
                                st.error("Failed to add trade. It may already exist.")
                        
                        except Exception as e:
                            logger.error(f"Error adding trade: {e}", exc_info=True)
                            st.error(f"Error adding trade: {e}")
                    else:
                        st.warning("Please enter a ticker symbol.")
    
    # Management section
    st.markdown("---")
    with st.expander("⚙️ Journal Management"):
        st.warning("**Danger Zone:** These actions cannot be undone!")
        
        if st.button("🗑️ Clear All Trades", type="secondary"):
            if st.checkbox("I understand this will delete all trades permanently"):
                journal.clear_all_trades()
                st.success("All trades cleared.")
                st.rerun()
    
    logger.info("Trade Journal page rendered successfully")
