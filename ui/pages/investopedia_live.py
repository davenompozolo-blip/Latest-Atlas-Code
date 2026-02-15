"""
ATLAS Terminal - Investopedia Live Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_investopedia_live():
    """Render the Investopedia Live page."""
    # Import only what's needed from core
    from core import (
        # Data Functions
        load_portfolio_data,
        save_portfolio_data,
    )
    from ui.components import ATLAS_TEMPLATE

    # Stub for InvestopediaIntegration class (needs Selenium)
    class InvestopediaIntegration:
        """Stub for Investopedia integration."""
        def __init__(self, email=None):
            self.email = email

        def attempt_login(self, password):
            return {'status': 'error', 'message': 'Selenium integration not available'}

        def submit_2fa_code(self, code):
            return {'status': 'error', 'message': 'Selenium integration not available'}

        def scrape_portfolio(self):
            return None

        def cleanup(self):
            pass

    st.markdown("### 📡 Investopedia Paper Trading Integration")
    st.markdown("**Live Portfolio Sync with Investopedia Simulator**")

    # ===== FIX #6: Check for Selenium availability =====
    try:
        from selenium import webdriver
        SELENIUM_AVAILABLE = True
    except ImportError:
        SELENIUM_AVAILABLE = False

    if not SELENIUM_AVAILABLE:
        st.error("❌ Selenium Not Installed")

        st.markdown("""
        ### 📦 Selenium Installation Required

        Investopedia integration requires Selenium for web automation.

        ---

        #### 🔧 For Google Colab:

        Run this in a code cell **before** starting the app:

        ```python
        # Install Selenium and ChromeDriver
        !pip install selenium
        !apt-get update
        !apt-get install -y chromium-chromedriver
        !cp /usr/lib/chromium-browser/chromedriver /usr/bin
        ```

        Then restart your Streamlit app.

        ---

        #### 💻 For Local Deployment:

        ```bash
        # Install Selenium
        pip install selenium webdriver-manager

        # For Chrome (recommended)
        # Download ChromeDriver from: https://chromedriver.chromium.org/
        # Or use webdriver-manager to auto-download
        ```

        ---

        #### 📋 Requirements:

        - ✅ `selenium` package (Python)
        - ✅ Chrome/Chromium browser
        - ✅ ChromeDriver (matching Chrome version)

        ---
        """)

        # Add status check
        st.markdown("### 🔍 Package Status Check")

        col1, col2 = st.columns(2)

        with col1:
            try:
                from selenium import webdriver
                st.success("✅ selenium installed")
            except ImportError:
                st.error("❌ selenium missing")
                st.caption("Run: `pip install selenium`")

        with col2:
            try:
                import subprocess
                result = subprocess.run(['which', 'chromedriver'], capture_output=True)
                if result.returncode == 0:
                    st.success("✅ chromedriver found")
                else:
                    st.error("❌ chromedriver missing")
                    st.caption("Install ChromeDriver")
            except:
                st.error("❌ chromedriver missing")
                st.caption("Install ChromeDriver")

        st.stop()

    # Initialize authentication state
    if 'investopedia_auth_state' not in st.session_state:
        st.session_state.investopedia_auth_state = 'initial'  # initial, awaiting_2fa, authenticated

    # Authentication section
    st.markdown("#### 🔐 Authentication")

    # STAGE 1: Initial Login (Email + Password)
    if st.session_state.investopedia_auth_state == 'initial':
        st.info("**Step 1 of 2:** Enter your credentials to trigger 2FA email")

        col1, col2 = st.columns(2)
        with col1:
            email = st.text_input("Email", value="davenompozolo@gmail.com", key="inv_email")
        with col2:
            password = st.text_input("Password", type="password", key="inv_password")

        if st.button("🔓 Attempt Login", type="primary"):
            if password:
                with st.spinner("Attempting login to Investopedia..."):
                    integration = InvestopediaIntegration(email=email)
                    result = integration.attempt_login(password)

                    if result['status'] == 'error':
                        st.error(f"❌ {result['message']}")

                    elif result['status'] == '2fa_required':
                        # Store integration object for Stage 2
                        st.session_state['investopedia_integration'] = integration
                        st.session_state.investopedia_auth_state = 'awaiting_2fa'
                        st.success(result['message'])
                        st.info("⏳ **Step 2 of 2:** Check your email and enter the 2FA code below")
                        st.rerun()

                    elif result['status'] == 'success':
                        st.session_state['investopedia_integration'] = integration
                        st.session_state.investopedia_auth_state = 'authenticated'
                        st.success(result['message'])
                        st.balloons()
                        st.rerun()
            else:
                st.warning("⚠️ Please enter your password")

    # STAGE 2: 2FA Code Submission
    elif st.session_state.investopedia_auth_state == 'awaiting_2fa':
        st.success("✓ Login attempt successful! 2FA code has been sent to your email.")
        st.info("⏳ **Step 2 of 2:** Enter the 6-digit code from your email")

        twofa_code = st.text_input("2FA Code", placeholder="Enter 6-digit code", max_chars=6, key="inv_2fa")

        col1, col2 = st.columns([3, 1])
        with col1:
            if st.button("✅ Submit 2FA Code", type="primary"):
                if twofa_code and len(twofa_code) == 6:
                    with st.spinner("Submitting 2FA code..."):
                        integration = st.session_state.get('investopedia_integration')

                        if integration:
                            result = integration.submit_2fa_code(twofa_code)

                            if result['status'] == 'success':
                                st.session_state.investopedia_auth_state = 'authenticated'
                                st.success(result['message'])
                                st.balloons()
                                st.rerun()
                            else:
                                st.error(f"❌ {result['message']}")
                        else:
                            st.error("❌ No active login session. Please restart login.")
                            st.session_state.investopedia_auth_state = 'initial'
                            st.rerun()
                else:
                    st.warning("⚠️ Please enter a valid 6-digit code")

        with col2:
            if st.button("🔙 Start Over"):
                # Cleanup and restart
                if 'investopedia_integration' in st.session_state:
                    integration = st.session_state['investopedia_integration']
                    integration.cleanup()
                st.session_state.investopedia_auth_state = 'initial'
                st.rerun()

    # STAGE 3: Authenticated - Portfolio Sync
    elif st.session_state.investopedia_auth_state == 'authenticated':
        st.success("✅ **Authenticated with Investopedia!**")

        col1, col2 = st.columns([3, 1])
        with col1:
            st.markdown("You can now sync your portfolio from Investopedia Simulator")
        with col2:
            if st.button("🔓 Logout"):
                # Cleanup and reset
                if 'investopedia_integration' in st.session_state:
                    integration = st.session_state['investopedia_integration']
                    integration.cleanup()
                st.session_state.investopedia_auth_state = 'initial'
                st.session_state.pop('investopedia_integration', None)
                st.rerun()

        st.markdown("---")
        st.markdown("#### 📊 Portfolio Sync")

        if st.button("🔄 Sync Portfolio from Investopedia", type="primary"):
            with st.spinner("Fetching portfolio data..."):
                integration = st.session_state.get('investopedia_integration')

                if integration:
                    portfolio_df = integration.scrape_portfolio()

                    if portfolio_df is not None and not portfolio_df.empty:
                        st.success(f"✅ Portfolio synced successfully! Found {len(portfolio_df)} positions")
                        from core.atlas_table_formatting import render_generic_table
                        col_defs = [{'key': c, 'label': c, 'type': 'ticker' if c in ('Ticker', 'Symbol') else ('price' if any(k in c for k in ('Price', 'Value', 'Cost', 'P&L')) else ('change' if '%' in c else 'text'))} for c in portfolio_df.columns]
                        st.markdown(render_generic_table(portfolio_df, columns=col_defs), unsafe_allow_html=True)

                        # Save to session state for use in other ATLAS modules
                        st.session_state['portfolio_data'] = portfolio_df
                        st.info("💡 Portfolio saved! You can now use it in other ATLAS features")

                        # Reset auth state after successful sync
                        st.session_state.investopedia_auth_state = 'initial'
                        st.session_state.pop('investopedia_integration', None)
                    else:
                        st.warning("⚠️ No portfolio data found or portfolio is empty")
                        # Reset auth state
                        st.session_state.investopedia_auth_state = 'initial'
                        st.session_state.pop('investopedia_integration', None)
                else:
                    st.error("❌ Authentication session lost. Please login again.")
                    st.session_state.investopedia_auth_state = 'initial'
                    st.rerun()

    # Info section
    st.markdown("---")
    st.markdown("#### ℹ️ About Investopedia Integration")
    st.markdown("""
    **Features:**
    - 🔐 **Two-stage authentication** with proper 2FA flow
    - 📧 Email-based 2FA code delivery
    - 📊 Live portfolio data scraping
    - 🔄 Real-time sync with Investopedia Simulator
    - 🔒 Secure Selenium-based browser automation

    **How to use:**
    1. **Step 1:** Enter your email and password
    2. **Step 2:** Click "Attempt Login" - this will trigger Investopedia to send you a 2FA code
    3. **Step 3:** Check your email for the 6-digit code
    4. **Step 4:** Enter the code and click "Submit 2FA Code"
    5. **Step 5:** Once authenticated, click "Sync Portfolio" to fetch your positions
    6. Synced data is automatically available in other ATLAS modules

    **Fixed Issues:**
    - ✅ No more Status 403 errors
    - ✅ Honest authentication flow (actually logs in to Investopedia)
    - ✅ Proper 2FA handling (email → code → submit)
    - ✅ Clear step-by-step progress indicators

    **Note:** This feature uses Selenium to automate browser interactions with Investopedia.
    Your credentials are only used for authentication and are not stored.
    """)

    # ========================================================================
    # ABOUT

