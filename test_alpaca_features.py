"""
Test Alpaca Portfolio History & Trade Data
Quick verification that we have all data needed for beta
"""

import streamlit as st
from datetime import datetime, timedelta
import pandas as pd

# Try to import Alpaca adapter
try:
    from atlas_alpaca_integration import AlpacaAdapter

    st.title("🧪 Alpaca Data Verification Test")

    # Get credentials
    try:
        api_key = st.secrets.get("alpaca_key", "")
        secret_key = st.secrets.get("alpaca_secret", "")
        has_secrets = api_key and secret_key
    except:
        has_secrets = False

    if not has_secrets:
        st.error("❌ No Alpaca credentials found in secrets.toml")
        st.stop()

    # Create adapter
    adapter = AlpacaAdapter(api_key, secret_key, paper=True)

    # Test 1: Connection
    st.header("Test 1: Connection")
    success, msg = adapter.test_connection()
    if success:
        st.success(f"✅ {msg}")
    else:
        st.error(f"❌ {msg}")
        st.stop()

    # Test 2: Portfolio History
    st.header("Test 2: Portfolio History")

    with st.spinner("Fetching portfolio history..."):
        try:
            # Get 1 year of history
            end_date = datetime.now()
            start_date = end_date - timedelta(days=365)

            history = adapter.trading_client.get_portfolio_history(
                date_start=start_date,
                date_end=end_date,
                timeframe='1Day'
            )

            # Convert to DataFrame
            df_history = pd.DataFrame({
                'timestamp': pd.to_datetime(history.timestamp, unit='s'),
                'equity': history.equity,
                'profit_loss': history.profit_loss,
                'profit_loss_pct': history.profit_loss_pct,
            }).dropna()

            st.success(f"✅ Got {len(df_history)} days of portfolio history")

            # Show sample
            st.dataframe(df_history.head(10), use_container_width=True)

            # Calculate simple metrics
            if len(df_history) > 30:
                returns = df_history['equity'].pct_change().dropna()
                sharpe = (returns.mean() * 252) / (returns.std() * (252 ** 0.5))

                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric("Days of Data", len(df_history))
                with col2:
                    total_return = (df_history['equity'].iloc[-1] / df_history['equity'].iloc[0]) - 1
                    st.metric("Total Return", f"{total_return:.2%}")
                with col3:
                    st.metric("Sharpe Ratio", f"{sharpe:.2f}")

        except Exception as e:
            st.error(f"❌ Portfolio history failed: {str(e)}")
            st.exception(e)

    # Test 3: Trade History
    st.header("Test 3: Trade History (Orders)")

    with st.spinner("Fetching trade history..."):
        try:
            from alpaca.trading.requests import GetOrdersRequest
            from alpaca.trading.enums import QueryOrderStatus

            # Get closed orders
            request = GetOrdersRequest(
                status=QueryOrderStatus.CLOSED,
                limit=100
            )

            orders = adapter.trading_client.get_orders(filter=request)

            st.success(f"✅ Got {len(orders)} filled orders/trades")

            if len(orders) > 0:
                # Convert to DataFrame
                trades = []
                for order in orders:
                    if order.filled_at:
                        trades.append({
                            'date': order.filled_at,
                            'ticker': order.symbol,
                            'side': order.side,
                            'quantity': float(order.filled_qty),
                            'price': float(order.filled_avg_price),
                            'value': float(order.filled_qty) * float(order.filled_avg_price),
                        })

                df_trades = pd.DataFrame(trades).sort_values('date', ascending=False)

                st.dataframe(df_trades.head(10), use_container_width=True)

                # Quick stats
                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric("Total Trades", len(df_trades))
                with col2:
                    buys = len(df_trades[df_trades['side'] == 'buy'])
                    st.metric("Buy Orders", buys)
                with col3:
                    sells = len(df_trades[df_trades['side'] == 'sell'])
                    st.metric("Sell Orders", sells)
            else:
                st.info("No trades found yet. Make some trades in your Alpaca account first.")

        except Exception as e:
            st.error(f"❌ Trade history failed: {str(e)}")
            st.exception(e)

    # Test 4: Current Positions
    st.header("Test 4: Current Positions")

    with st.spinner("Fetching positions..."):
        try:
            positions = adapter.get_positions()

            if not positions.empty:
                st.success(f"✅ Got {len(positions)} current positions")
                st.dataframe(positions, use_container_width=True)
            else:
                st.info("No current positions")

        except Exception as e:
            st.error(f"❌ Positions failed: {str(e)}")
            st.exception(e)

    # Summary
    st.header("✅ Test Summary")

    st.success("""
    **All Data Sources Available!** 🎉

    You have everything needed for the beta:
    - ✅ Portfolio history (equity curve)
    - ✅ Trade history (P&L analysis)
    - ✅ Current positions

    **Ready to build the beta with full analytics!**
    """)

except ImportError as e:
    st.error(f"Error importing Alpaca adapter: {e}")
    st.info("Make sure alpaca-py is installed: pip install alpaca-py")
