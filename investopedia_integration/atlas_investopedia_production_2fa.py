"""
ATLAS TERMINAL v10.0 - INVESTOPEDIA LIVE INTEGRATION (PRODUCTION)
===================================================================

Complete Investopedia integration with:
- Automatic login with embedded credentials
- 2FA email verification support
- Live portfolio data fetching
- Session persistence
- Auto-sync capability

NO MORE MANUAL COPY-PASTE! 🎉
"""

import streamlit as st
import requests
from bs4 import BeautifulSoup
import pandas as pd
from datetime import datetime
import pickle
import os
import re
from typing import Dict, List, Tuple, Optional


# ===================================================================
# EMBEDDED CREDENTIALS (Your Investopedia Account)
# ===================================================================

INVESTOPEDIA_EMAIL = "davenompozolo@gmail.com"
INVESTOPEDIA_PASSWORD = "Hlobo1hlobo@123"


# ===================================================================
# INVESTOPEDIA SESSION MANAGER
# ===================================================================

class InvestopediaSession:
    """
    Manages Investopedia login session with 2FA support.
    """

    def __init__(self, email: str, password: str):
        self.email = email
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': 'https://www.investopedia.com'
        })
        self.authenticated = False
        self.session_file = 'investopedia_session.pkl'

    def login(self, force_new: bool = False) -> Tuple[bool, str]:
        """
        Attempt to login to Investopedia.

        Returns:
            (success: bool, status: str)
            status can be: 'logged_in', 'needs_2fa', 'failed'
        """
        # Try to load existing session
        if not force_new and self._load_session():
            if self._verify_session():
                self.authenticated = True
                return (True, 'logged_in')

        # Need fresh login
        LOGIN_URL = "https://www.investopedia.com/auth/login"

        try:
            # Get login page
            login_page = self.session.get(LOGIN_URL, timeout=10)
            soup = BeautifulSoup(login_page.content, 'html.parser')

            # Extract CSRF token
            csrf_token = soup.find('input', {'name': '__RequestVerificationToken'})
            csrf_value = csrf_token['value'] if csrf_token else ''

            # Submit credentials
            login_data = {
                'email': self.email,
                'password': self.password,
                'rememberMe': 'true',
                '__RequestVerificationToken': csrf_value
            }

            login_response = self.session.post(
                LOGIN_URL,
                data=login_data,
                timeout=10,
                allow_redirects=True
            )

            # Check response
            response_text = login_response.text.lower()

            # Check if 2FA required
            if 'verification' in response_text or 'verify' in response_text or 'code' in response_text:
                return (False, 'needs_2fa')

            # Check if successful
            if 'simulator' in login_response.url or 'portfolio' in login_response.url:
                self._save_session()
                self.authenticated = True
                return (True, 'logged_in')

            # Login failed
            return (False, 'failed')

        except Exception as e:
            return (False, f'error: {str(e)}')

    def verify_2fa(self, code: str) -> Tuple[bool, str]:
        """
        Submit 2FA verification code.

        Returns:
            (success: bool, status: str)
        """
        VERIFY_URL = "https://www.investopedia.com/auth/verify"

        try:
            # Get verification page
            verify_page = self.session.get(VERIFY_URL, timeout=10)
            soup = BeautifulSoup(verify_page.content, 'html.parser')

            # Extract CSRF token
            csrf_token = soup.find('input', {'name': '__RequestVerificationToken'})
            csrf_value = csrf_token['value'] if csrf_token else ''

            # Submit code
            verify_data = {
                'code': code.strip(),
                'verificationCode': code.strip(),
                '__RequestVerificationToken': csrf_value
            }

            verify_response = self.session.post(
                VERIFY_URL,
                data=verify_data,
                timeout=10,
                allow_redirects=True
            )

            # Check if successful
            if 'simulator' in verify_response.url or 'portfolio' in verify_response.url:
                self._save_session()
                self.authenticated = True
                return (True, 'verified')
            else:
                return (False, 'invalid_code')

        except Exception as e:
            return (False, f'error: {str(e)}')

    def get_portfolio_data(self) -> Optional[Dict]:
        """
        Fetch portfolio data from Investopedia.

        Returns:
            Dict with 'holdings', 'account_summary', 'timestamp'
        """
        if not self.authenticated:
            return None

        PORTFOLIO_URL = "https://www.investopedia.com/simulator/portfolio"

        try:
            response = self.session.get(PORTFOLIO_URL, timeout=10)

            # Check if session expired
            if 'login' in response.url.lower() or 'auth' in response.url.lower():
                self.authenticated = False
                return None

            # Parse portfolio
            holdings = self._parse_holdings(response.text)
            account_summary = self._parse_account_summary(response.text)

            return {
                'holdings': holdings,
                'account_summary': account_summary,
                'timestamp': datetime.now(),
                'success': True
            }

        except Exception as e:
            return {
                'holdings': [],
                'account_summary': {},
                'timestamp': datetime.now(),
                'success': False,
                'error': str(e)
            }

    def _parse_holdings(self, html: str) -> List[Dict]:
        """
        Parse holdings from HTML using multiple strategies.
        """
        soup = BeautifulSoup(html, 'html.parser')
        holdings = []

        # Strategy 1: Parse tables
        tables = soup.find_all('table')

        for table in tables:
            rows = table.find_all('tr')
            if len(rows) < 2:
                continue

            # Get headers
            headers = [th.text.strip().lower() for th in rows[0].find_all('th')]

            # Check if this is a holdings table
            if any(kw in ' '.join(headers) for kw in ['symbol', 'ticker', 'shares', 'quantity']):
                for row in rows[1:]:
                    cells = row.find_all('td')
                    if len(cells) >= 3:
                        ticker = cells[0].text.strip()

                        # Validate ticker
                        if ticker and len(ticker) <= 5 and ticker.isupper():
                            try:
                                holding = {
                                    'ticker': ticker,
                                    'shares': float(cells[2].text.strip().replace(',', '')) if len(cells) > 2 else 0,
                                    'current_price': float(cells[4].text.strip().replace('$', '').replace(',', '')) if len(cells) > 4 else 0
                                }
                                holdings.append(holding)
                            except:
                                continue

        return holdings

    def _parse_account_summary(self, html: str) -> Dict:
        """
        Parse account summary from HTML.
        """
        summary = {
            'account_value': 0,
            'cash': 0,
            'buying_power': 0
        }

        # Regex search for account values
        account_match = re.search(r'Account\s*Value[:\s]*\$([0-9,]+\.?[0-9]*)', html, re.I)
        if account_match:
            summary['account_value'] = float(account_match.group(1).replace(',', ''))

        cash_match = re.search(r'Cash[:\s]*\$([0-9,]+\.?[0-9]*)', html, re.I)
        if cash_match:
            summary['cash'] = float(cash_match.group(1).replace(',', ''))

        buying_power_match = re.search(r'Buying\s*Power[:\s]*\$([0-9,]+\.?[0-9]*)', html, re.I)
        if buying_power_match:
            summary['buying_power'] = float(buying_power_match.group(1).replace(',', ''))

        return summary

    def _save_session(self):
        """Save session cookies to file."""
        try:
            with open(self.session_file, 'wb') as f:
                pickle.dump(self.session.cookies, f)
        except:
            pass

    def _load_session(self) -> bool:
        """Load session cookies from file."""
        try:
            if os.path.exists(self.session_file):
                with open(self.session_file, 'rb') as f:
                    self.session.cookies.update(pickle.load(f))
                return True
        except:
            pass
        return False

    def _verify_session(self) -> bool:
        """Verify if current session is still valid."""
        try:
            response = self.session.get(
                "https://www.investopedia.com/simulator/portfolio",
                timeout=5,
                allow_redirects=False
            )
            return response.status_code == 200
        except:
            return False


# ===================================================================
# STREAMLIT UI INTEGRATION
# ===================================================================

def setup_investopedia_live_feed():
    """
    Complete Streamlit integration for Investopedia live feed.
    """

    # Initialize session state
    if 'investopedia_session' not in st.session_state:
        st.session_state.investopedia_session = InvestopediaSession(
            INVESTOPEDIA_EMAIL,
            INVESTOPEDIA_PASSWORD
        )
        st.session_state.auth_state = 'disconnected'  # disconnected, needs_2fa, authenticated

    session = st.session_state.investopedia_session

    with st.sidebar:
        st.markdown("### 🔐 INVESTOPEDIA LIVE FEED")
        st.markdown(f"**Account:** {INVESTOPEDIA_EMAIL}")

        # Show current state
        if st.session_state.auth_state == 'disconnected':
            st.info("🔴 Not connected")

            if st.button("🔐 CONNECT TO INVESTOPEDIA", type="primary", use_container_width=True):
                with st.spinner("Connecting..."):
                    success, status = session.login()

                    if success:
                        st.session_state.auth_state = 'authenticated'
                        st.rerun()
                    elif status == 'needs_2fa':
                        st.session_state.auth_state = 'needs_2fa'
                        st.rerun()
                    else:
                        st.error(f"❌ Login failed: {status}")

        elif st.session_state.auth_state == 'needs_2fa':
            st.warning("📧 2FA REQUIRED")
            st.caption(f"Check {INVESTOPEDIA_EMAIL} for verification code")

            # Input for code
            verification_code = st.text_input(
                "Enter 6-digit code:",
                max_chars=6,
                placeholder="123456",
                key="verification_code_input"
            )

            col1, col2 = st.columns(2)

            with col1:
                if st.button("✅ VERIFY", type="primary", use_container_width=True):
                    if len(verification_code) == 6:
                        with st.spinner("Verifying..."):
                            success, status = session.verify_2fa(verification_code)

                            if success:
                                st.session_state.auth_state = 'authenticated'
                                st.success("✅ Verified!")
                                st.rerun()
                            else:
                                st.error(f"❌ Verification failed: {status}")
                    else:
                        st.error("Please enter a 6-digit code")

            with col2:
                if st.button("🔙 Cancel", use_container_width=True):
                    st.session_state.auth_state = 'disconnected'
                    st.rerun()

        elif st.session_state.auth_state == 'authenticated':
            st.success("🟢 CONNECTED & AUTHENTICATED")

            col1, col2 = st.columns(2)

            with col1:
                if st.button("🔄 SYNC NOW", use_container_width=True):
                    with st.spinner("Syncing portfolio..."):
                        portfolio_data = session.get_portfolio_data()

                        if portfolio_data and portfolio_data['success']:
                            st.session_state.investopedia_portfolio = portfolio_data
                            st.success("✅ Portfolio synced!")
                            st.rerun()
                        else:
                            st.error("❌ Sync failed")

            with col2:
                if st.button("🔓 DISCONNECT", use_container_width=True):
                    st.session_state.auth_state = 'disconnected'
                    session.authenticated = False
                    st.rerun()

            # Show last sync time
            if 'investopedia_portfolio' in st.session_state:
                last_sync = st.session_state.investopedia_portfolio['timestamp']
                st.caption(f"Last sync: {last_sync.strftime('%H:%M:%S')}")

    # Return portfolio data if authenticated
    if st.session_state.auth_state == 'authenticated' and 'investopedia_portfolio' in st.session_state:
        return st.session_state.investopedia_portfolio

    return None


# ===================================================================
# MAIN DISPLAY
# ===================================================================

def display_investopedia_portfolio(portfolio_data: Optional[Dict]):
    """
    Display Investopedia portfolio data in main area.
    """
    if not portfolio_data:
        st.info("👈 Connect to Investopedia in the sidebar to see your live portfolio")
        return

    st.markdown("## 📊 Live Investopedia Portfolio")

    # Account summary
    summary = portfolio_data['account_summary']

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Account Value", f"${summary.get('account_value', 0):,.2f}")

    with col2:
        st.metric("Cash", f"${summary.get('cash', 0):,.2f}")

    with col3:
        st.metric("Buying Power", f"${summary.get('buying_power', 0):,.2f}")

    # Holdings
    holdings = portfolio_data['holdings']

    if holdings:
        st.markdown("---")
        st.markdown("### 📈 Holdings")

        df = pd.DataFrame(holdings)

        # Calculate market value
        if 'shares' in df.columns and 'current_price' in df.columns:
            df['market_value'] = df['shares'] * df['current_price']

        st.dataframe(df, use_container_width=True, height=400)

        # Summary stats
        st.markdown("---")
        st.markdown("### 📊 Portfolio Stats")

        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric("Total Holdings", len(holdings))

        with col2:
            if 'market_value' in df.columns:
                st.metric("Total Market Value", f"${df['market_value'].sum():,.2f}")

        with col3:
            st.metric("Positions", len(df[df['shares'] > 0]) if 'shares' in df.columns else 0)

    else:
        st.warning("⚠️ No holdings found")
        st.info("This could mean: (1) Your portfolio is empty, or (2) The scraper needs adjustment")


# ===================================================================
# EXAMPLE USAGE
# ===================================================================

if __name__ == "__main__":
    st.set_page_config(page_title="ATLAS - Investopedia Live", layout="wide")

    st.title("🚀 ATLAS Terminal - Investopedia Live Feed")
    st.markdown("**Automatic portfolio sync - No more manual copy-paste!**")

    # Setup live feed in sidebar
    portfolio_data = setup_investopedia_live_feed()

    # Display portfolio
    display_investopedia_portfolio(portfolio_data)
