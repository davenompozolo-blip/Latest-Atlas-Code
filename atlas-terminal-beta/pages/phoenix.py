"""
ATLAS Terminal Beta - Phoenix Parser Page
==========================================
Portfolio data synchronization and management.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
import pandas as pd
from datetime import datetime
from ui.components import section_header, holdings_table


def render():
    """Render the Phoenix Parser page"""

    st.title("🔥 Phoenix Parser")
    st.caption("Portfolio data synchronization and management")

    # Get adapter from session state
    if 'adapter' not in st.session_state:
        st.error("Not connected to Alpaca. Please reconnect.")
        return

    adapter = st.session_state.adapter

    try:
        # Data sync controls
        st.markdown("### 🔄 Data Synchronization")

        col1, col2, col3 = st.columns(3)

        with col1:
            if st.button("🔄 Refresh Portfolio Data", type="primary", use_container_width=True):
                with st.spinner("Syncing from Alpaca..."):
                    positions = adapter.get_positions()
                    st.session_state['portfolio_data'] = positions
                    st.session_state['last_sync'] = datetime.now()
                    st.success(f"✅ Synced {len(positions)} positions")
                    st.rerun()

        with col2:
            if st.button("📊 Refresh Account Data", type="secondary", use_container_width=True):
                with st.spinner("Fetching account..."):
                    account = adapter.get_account_summary()
                    st.session_state['account_data'] = account
                    st.success("✅ Account data refreshed")
                    st.rerun()

        with col3:
            if st.button("🔄 Full Sync", use_container_width=True):
                with st.spinner("Full sync in progress..."):
                    positions = adapter.get_positions()
                    account = adapter.get_account_summary()
                    st.session_state['portfolio_data'] = positions
                    st.session_state['account_data'] = account
                    st.session_state['last_sync'] = datetime.now()
                    st.success("✅ Full sync complete")
                    st.rerun()

        # Show last sync time
        if 'last_sync' in st.session_state:
            last_sync_time = st.session_state['last_sync'].strftime('%Y-%m-%d %H:%M:%S')
            st.caption(f"Last synced: {last_sync_time}")

        st.markdown("---")

        # Portfolio overview
        section_header("📊 Current Portfolio Data", "Live data from Alpaca")

        positions = adapter.get_positions()

        if positions.empty:
            st.info("📭 No positions found. Your portfolio is currently empty.")
            return

        # Summary metrics
        col1, col2, col3, col4 = st.columns(4)

        total_value = positions['Market_Value'].sum()
        total_cost = positions['Purchase_Value'].sum()
        total_pl = positions['Unrealized_PnL'].sum()
        total_pl_pct = (total_pl / total_cost * 100) if total_cost > 0 else 0

        with col1:
            st.metric("Positions", len(positions))

        with col2:
            st.metric("Market Value", f"${total_value:,.2f}")

        with col3:
            st.metric("Cost Basis", f"${total_cost:,.2f}")

        with col4:
            st.metric("Unrealized P&L", f"${total_pl:+,.2f}", f"{total_pl_pct:+.2f}%")

        st.markdown("---")

        # Holdings table
        section_header("📋 Position Details", "Complete holdings breakdown")
        holdings_table(positions)

        st.markdown("---")

        # Data export
        section_header("💾 Data Export", "Export portfolio data")

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("#### Export to CSV")

            csv = positions.to_csv(index=False)
            st.download_button(
                label="📥 Download Portfolio CSV",
                data=csv,
                file_name=f"atlas_portfolio_{datetime.now().strftime('%Y%m%d')}.csv",
                mime="text/csv",
                use_container_width=True
            )

        with col2:
            st.markdown("#### Export to Excel")

            # Convert to Excel
            from io import BytesIO
            buffer = BytesIO()
            with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
                positions.to_excel(writer, sheet_name='Portfolio', index=False)
            buffer.seek(0)

            st.download_button(
                label="📥 Download Portfolio Excel",
                data=buffer,
                file_name=f"atlas_portfolio_{datetime.now().strftime('%Y%m%d')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True
            )

        st.markdown("---")

        # Data quality checks
        section_header("✅ Data Quality", "Validation and checks")

        col1, col2, col3 = st.columns(3)

        with col1:
            st.markdown("#### Completeness")
            missing_prices = positions['Current_Price'].isna().sum()
            missing_cost = positions['Avg_Cost'].isna().sum()

            if missing_prices == 0 and missing_cost == 0:
                st.success("✅ All data complete")
            else:
                st.warning(f"⚠️ Missing: {missing_prices} prices, {missing_cost} costs")

        with col2:
            st.markdown("#### Accuracy")
            # Check for unusual values
            unusual = positions[(positions['Unrealized_PnL_Pct'].abs() > 100)].shape[0]

            if unusual == 0:
                st.success("✅ No unusual values")
            else:
                st.warning(f"⚠️ {unusual} positions with >100% P&L")

        with col3:
            st.markdown("#### Freshness")
            # Data is live from Alpaca
            st.success("✅ Live data")
            st.caption("Real-time from Alpaca")

    except Exception as e:
        st.error(f"Error loading data: {str(e)}")
        st.exception(e)
