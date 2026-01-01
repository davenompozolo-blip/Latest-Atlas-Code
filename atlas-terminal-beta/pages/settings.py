"""
ATLAS Terminal Beta - Settings Page
====================================
Application settings and configuration.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
from datetime import datetime


VERSION = "1.0.0-beta.1"
RELEASE_DATE = "2026-01-09"


def render():
    """Render the settings page"""

    st.title("⚙️ Settings")
    st.caption("Application configuration and information")

    st.markdown("---")

    # Connection settings
    st.markdown("### 🔌 Connection")

    if 'adapter' in st.session_state and 'connected' in st.session_state and st.session_state.connected:
        account = st.session_state.adapter.get_account_summary()

        st.success("✅ Connected to Alpaca")

        col1, col2 = st.columns(2)

        with col1:
            st.metric("Account Type", account.get('account_type', 'UNKNOWN'))
            st.metric("Account Status", account.get('status', 'UNKNOWN'))

        with col2:
            st.metric("Portfolio Value", f"${account.get('portfolio_value', 0):,.2f}")
            st.metric("Currency", account.get('currency', 'USD'))

        st.markdown("---")

        if st.button("🔌 Disconnect", type="secondary"):
            st.session_state.connected = False
            if 'adapter' in st.session_state:
                del st.session_state.adapter
            st.success("Disconnected successfully")
            st.rerun()

    else:
        st.info("Not currently connected. Use the sidebar to connect to Alpaca.")

    st.markdown("---")

    # About
    st.markdown("### 📖 About ATLAS Terminal Beta")

    st.markdown(f"""
    **Version:** {VERSION}
    **Release Date:** {RELEASE_DATE}
    **Status:** Beta Testing

    ATLAS Terminal is a professional portfolio analytics platform designed for retail investors.
    It provides real-time portfolio tracking, risk analysis, and performance metrics through
    integration with Alpaca Markets.

    #### Features

    - **Real-time Portfolio Sync** - Automatic synchronization with Alpaca broker account
    - **Portfolio Analytics** - Detailed position breakdown and allocation analysis
    - **Risk Metrics** - Sharpe ratio, Sortino, max drawdown, VaR, and more
    - **Trade History** - Complete trade log with statistics and visualizations
    - **Clean Interface** - Modern, intuitive design focused on essential metrics

    #### Technology Stack

    - **Frontend:** Streamlit {st.__version__}
    - **Data:** Pandas, NumPy
    - **Visualization:** Plotly
    - **Broker API:** Alpaca Markets (alpaca-py)
    """)

    st.markdown("---")

    # Support
    st.markdown("### 💬 Support")

    st.markdown("""
    **Need Help?**

    - [Documentation](https://github.com/your-repo/atlas-terminal-beta)
    - [Report an Issue](https://github.com/your-repo/atlas-terminal-beta/issues)
    - [Feature Requests](https://github.com/your-repo/atlas-terminal-beta/issues)

    **Credits**

    Built with ❤️ by Hlobo Nompozolo
    """)

    st.markdown("---")

    # System information
    with st.expander("🔧 System Information"):
        st.markdown(f"""
        **Session Information**
        - Session ID: `{st.session_state.get('initialized', 'unknown')}`
        - Connected: `{st.session_state.get('connected', False)}`
        - Adapter Available: `{'adapter' in st.session_state}`

        **Application**
        - Streamlit Version: `{st.__version__}`
        - Python Version: `3.10+`
        - Current Time: `{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}`
        """)

    st.markdown("---")

    # Data & Privacy
    st.markdown("### 🔒 Data & Privacy")

    st.markdown("""
    **Your Data is Secure**

    - API credentials are stored locally in `.streamlit/secrets.toml`
    - No data is transmitted to third-party servers (except Alpaca API)
    - All calculations are performed locally
    - Session data is stored in browser memory only

    **API Security**

    - Use Alpaca Paper Trading for testing
    - Never share your API keys
    - Regenerate keys if compromised
    - Review Alpaca's [security best practices](https://alpaca.markets/docs/api-references/)
    """)

    st.markdown("---")

    # License
    with st.expander("📄 License"):
        st.markdown("""
        **ATLAS Terminal Beta**

        Copyright © 2026 Hlobo Nompozolo. All rights reserved.

        This software is proprietary and confidential. Unauthorized copying,
        distribution, or use of this software is strictly prohibited.
        """)
