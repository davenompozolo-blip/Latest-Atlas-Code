"""
ATLAS TERMINAL v10.0 - INVESTOPEDIA LIVE DATA ENGINE
=====================================================

REAL Quant Developer Move: Automated Investopedia Portfolio Sync

Instead of manually copy-pasting from Investopedia, we LOGIN and FETCH
portfolio data programmatically. This turns ATLAS from an Excel toy into
a real-time portfolio tracking engine.

Features:
- Automated login to Investopedia
- Live portfolio fetching (holdings, cash, trades)
- Session management & cookie persistence
- Real-time position updates
- Trade history scraping
- Account value tracking
- Auto-sync on schedule

This is the difference between "I built a dashboard" and "I built a system."
"""

import requests
from bs4 import BeautifulSoup
import pandas as pd
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import re
from urllib.parse import urljoin, urlparse, parse_qs
import pickle
import os
from dataclasses import dataclass


# ===================================================================
# INVESTOPEDIA SESSION MANAGER
# ===================================================================

@dataclass
class InvestopediaCredentials:
    """Store Investopedia login credentials"""
    email: str
    password: str
    game_id: Optional[str] = None  # Your specific game/portfolio ID


class InvestopediaSession:
    """
    Manages authenticated session with Investopedia.
    Handles login, session persistence, and API requests.
    """

    BASE_URL = "https://www.investopedia.com"
    LOGIN_URL = "https://www.investopedia.com/simulator/login"
    PORTFOLIO_URL = "https://www.investopedia.com/simulator/portfolio"
    TRADE_HISTORY_URL = "https://www.investopedia.com/simulator/trade/tradehistory.aspx"

    def __init__(self, credentials: InvestopediaCredentials, session_file: str = "investopedia_session.pkl"):
        self.credentials = credentials
        self.session_file = session_file
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.investopedia.com'
        })
        self.is_authenticated = False
        self.game_id = credentials.game_id

    def login(self, force_new: bool = False) -> bool:
        """
        Login to Investopedia and establish authenticated session.

        Args:
            force_new: Force new login even if saved session exists

        Returns:
            True if login successful
        """
        # Try to load saved session first
        if not force_new and self._load_session():
            print("✅ Loaded saved session")
            if self._verify_session():
                print("✅ Session is valid")
                return True
            else:
                print("⚠️ Saved session expired, logging in again...")

        print("🔐 Logging in to Investopedia...")

        try:
            # Step 1: Get login page to extract form tokens
            login_page = self.session.get(self.LOGIN_URL, timeout=10)
            soup = BeautifulSoup(login_page.content, 'html.parser')

            # Extract CSRF token or other required fields
            csrf_token = soup.find('input', {'name': '__RequestVerificationToken'})
            csrf_value = csrf_token['value'] if csrf_token else ''

            # Step 2: Submit login form
            login_data = {
                'email': self.credentials.email,
                'password': self.credentials.password,
                '__RequestVerificationToken': csrf_value,
                'isPersistent': 'true'  # Remember me
            }

            login_response = self.session.post(
                self.LOGIN_URL,
                data=login_data,
                timeout=10,
                allow_redirects=True
            )

            # Step 3: Verify login success
            if 'simulator' in login_response.url or 'portfolio' in login_response.url:
                print("✅ Login successful!")
                self.is_authenticated = True
                self._save_session()
                return True
            else:
                print("❌ Login failed - check credentials")
                return False

        except Exception as e:
            print(f"❌ Login error: {e}")
            return False

    def _verify_session(self) -> bool:
        """Verify if current session is still valid"""
        try:
            response = self.session.get(self.PORTFOLIO_URL, timeout=10)
            # If we're redirected to login, session is invalid
            return 'login' not in response.url.lower()
        except:
            return False

    def _save_session(self):
        """Save session cookies to file"""
        try:
            with open(self.session_file, 'wb') as f:
                pickle.dump(self.session.cookies, f)
            print(f"💾 Session saved to {self.session_file}")
        except Exception as e:
            print(f"⚠️ Could not save session: {e}")

    def _load_session(self) -> bool:
        """Load session cookies from file"""
        if not os.path.exists(self.session_file):
            return False

        try:
            with open(self.session_file, 'rb') as f:
                cookies = pickle.load(f)
                self.session.cookies.update(cookies)
            self.is_authenticated = True
            return True
        except Exception as e:
            print(f"⚠️ Could not load session: {e}")
            return False

    def get_portfolio_data(self) -> Optional[Dict]:
        """
        Fetch current portfolio holdings from Investopedia.

        Returns:
            Dict with holdings, cash, account value, etc.
        """
        if not self.is_authenticated:
            if not self.login():
                return None

        try:
            # Fetch portfolio page
            portfolio_url = f"{self.PORTFOLIO_URL}/{self.game_id}" if self.game_id else self.PORTFOLIO_URL
            response = self.session.get(portfolio_url, timeout=10)

            if 'login' in response.url.lower():
                print("⚠️ Session expired, re-authenticating...")
                if not self.login(force_new=True):
                    return None
                response = self.session.get(portfolio_url, timeout=10)

            soup = BeautifulSoup(response.content, 'html.parser')

            # Parse portfolio data
            holdings = self._parse_holdings(soup)
            account_summary = self._parse_account_summary(soup)

            return {
                'holdings': holdings,
                'account_summary': account_summary,
                'timestamp': datetime.now(),
                'success': True
            }

        except Exception as e:
            print(f"❌ Error fetching portfolio: {e}")
            return {'success': False, 'error': str(e)}

    def _parse_holdings(self, soup: BeautifulSoup) -> List[Dict]:
        """
        Parse holdings table from portfolio page.
        """
        holdings = []

        # Find holdings table (Investopedia uses specific class names)
        holdings_table = soup.find('table', {'class': re.compile(r'.*portfolio.*|.*holdings.*', re.I)})

        if not holdings_table:
            # Try alternative selectors
            holdings_table = soup.find('table', {'id': re.compile(r'.*holdings.*|.*positions.*', re.I)})

        if not holdings_table:
            print("⚠️ Could not find holdings table")
            return holdings

        # Parse table rows
        rows = holdings_table.find_all('tr')[1:]  # Skip header

        for row in rows:
            cols = row.find_all('td')

            if len(cols) < 6:
                continue

            try:
                holding = {
                    'ticker': cols[0].text.strip(),
                    'company': cols[1].text.strip() if len(cols) > 1 else '',
                    'shares': float(cols[2].text.strip().replace(',', '')) if len(cols) > 2 else 0,
                    'purchase_price': float(cols[3].text.strip().replace('$', '').replace(',', '')) if len(cols) > 3 else 0,
                    'current_price': float(cols[4].text.strip().replace('$', '').replace(',', '')) if len(cols) > 4 else 0,
                    'market_value': float(cols[5].text.strip().replace('$', '').replace(',', '')) if len(cols) > 5 else 0,
                    'gain_loss': float(cols[6].text.strip().replace('$', '').replace(',', '')) if len(cols) > 6 else 0,
                    'gain_loss_pct': float(cols[7].text.strip().replace('%', '')) if len(cols) > 7 else 0
                }
                holdings.append(holding)
            except Exception as e:
                print(f"⚠️ Error parsing row: {e}")
                continue

        return holdings

    def _parse_account_summary(self, soup: BeautifulSoup) -> Dict:
        """
        Parse account summary (total value, cash, etc.)
        """
        summary = {
            'account_value': 0,
            'cash': 0,
            'buying_power': 0,
            'total_gain_loss': 0,
            'total_gain_loss_pct': 0
        }

        # Find account summary section
        summary_section = soup.find('div', {'class': re.compile(r'.*account.*summary.*|.*portfolio.*summary.*', re.I)})

        if not summary_section:
            print("⚠️ Could not find account summary")
            return summary

        # Extract values (Investopedia uses specific labels)
        try:
            # Account Value
            account_value_elem = summary_section.find(text=re.compile(r'Account Value|Total Value', re.I))
            if account_value_elem:
                value_text = account_value_elem.find_next().text.strip()
                summary['account_value'] = float(value_text.replace('$', '').replace(',', ''))

            # Cash
            cash_elem = summary_section.find(text=re.compile(r'Cash|Available Cash', re.I))
            if cash_elem:
                cash_text = cash_elem.find_next().text.strip()
                summary['cash'] = float(cash_text.replace('$', '').replace(',', ''))

            # Buying Power
            buying_power_elem = summary_section.find(text=re.compile(r'Buying Power', re.I))
            if buying_power_elem:
                bp_text = buying_power_elem.find_next().text.strip()
                summary['buying_power'] = float(bp_text.replace('$', '').replace(',', ''))

            # Total Gain/Loss
            gain_loss_elem = summary_section.find(text=re.compile(r'Total Gain|Total Return', re.I))
            if gain_loss_elem:
                gl_text = gain_loss_elem.find_next().text.strip()
                summary['total_gain_loss'] = float(gl_text.replace('$', '').replace(',', ''))

        except Exception as e:
            print(f"⚠️ Error parsing account summary: {e}")

        return summary

    def get_trade_history(self, days: int = 30) -> List[Dict]:
        """
        Fetch trade history from Investopedia.

        Args:
            days: Number of days of history to fetch

        Returns:
            List of trade dictionaries
        """
        if not self.is_authenticated:
            if not self.login():
                return []

        try:
            response = self.session.get(self.TRADE_HISTORY_URL, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')

            trades = []
            trade_table = soup.find('table', {'class': re.compile(r'.*trade.*history.*', re.I)})

            if not trade_table:
                print("⚠️ Could not find trade history table")
                return trades

            rows = trade_table.find_all('tr')[1:]  # Skip header

            for row in rows:
                cols = row.find_all('td')

                if len(cols) < 5:
                    continue

                try:
                    trade = {
                        'date': cols[0].text.strip(),
                        'action': cols[1].text.strip(),
                        'ticker': cols[2].text.strip(),
                        'shares': float(cols[3].text.strip().replace(',', '')),
                        'price': float(cols[4].text.strip().replace('$', '').replace(',', '')),
                        'amount': float(cols[5].text.strip().replace('$', '').replace(',', '')) if len(cols) > 5 else 0
                    }
                    trades.append(trade)
                except Exception as e:
                    print(f"⚠️ Error parsing trade: {e}")
                    continue

            return trades

        except Exception as e:
            print(f"❌ Error fetching trade history: {e}")
            return []


# ===================================================================
# AUTO-SYNC ENGINE
# ===================================================================

class InvestopediaAutoSync:
    """
    Automated portfolio synchronization engine.
    Fetches data on schedule and updates local database.
    """

    def __init__(self, session: InvestopediaSession, sync_interval_minutes: int = 5):
        self.session = session
        self.sync_interval = timedelta(minutes=sync_interval_minutes)
        self.last_sync = None
        self.portfolio_history = []

    def should_sync(self) -> bool:
        """Check if it's time to sync"""
        if self.last_sync is None:
            return True

        return datetime.now() - self.last_sync >= self.sync_interval

    def sync(self, force: bool = False) -> Optional[Dict]:
        """
        Sync portfolio data from Investopedia.

        Args:
            force: Force sync even if interval hasn't elapsed

        Returns:
            Portfolio data dict
        """
        if not force and not self.should_sync():
            remaining = (self.sync_interval - (datetime.now() - self.last_sync)).seconds // 60
            print(f"⏰ Next sync in {remaining} minutes")
            return None

        print("🔄 Syncing portfolio from Investopedia...")

        data = self.session.get_portfolio_data()

        if data and data.get('success'):
            self.last_sync = datetime.now()
            self.portfolio_history.append(data)
            print(f"✅ Sync complete at {self.last_sync.strftime('%H:%M:%S')}")
            return data
        else:
            print("❌ Sync failed")
            return None

    def get_latest_portfolio(self) -> Optional[Dict]:
        """Get most recent portfolio data"""
        if self.portfolio_history:
            return self.portfolio_history[-1]
        return None

    def get_portfolio_changes(self) -> Optional[Dict]:
        """Calculate changes since last sync"""
        if len(self.portfolio_history) < 2:
            return None

        current = self.portfolio_history[-1]
        previous = self.portfolio_history[-2]

        changes = {
            'account_value_change': current['account_summary']['account_value'] - previous['account_summary']['account_value'],
            'cash_change': current['account_summary']['cash'] - previous['account_summary']['cash'],
            'time_elapsed': (current['timestamp'] - previous['timestamp']).seconds / 60,  # minutes
            'holdings_changes': []
        }

        # Compare holdings
        current_tickers = {h['ticker']: h for h in current['holdings']}
        previous_tickers = {h['ticker']: h for h in previous['holdings']}

        # Find changes
        for ticker in current_tickers:
            if ticker in previous_tickers:
                curr_shares = current_tickers[ticker]['shares']
                prev_shares = previous_tickers[ticker]['shares']

                if curr_shares != prev_shares:
                    changes['holdings_changes'].append({
                        'ticker': ticker,
                        'action': 'BUY' if curr_shares > prev_shares else 'SELL',
                        'shares_change': abs(curr_shares - prev_shares)
                    })
            else:
                changes['holdings_changes'].append({
                    'ticker': ticker,
                    'action': 'NEW',
                    'shares': current_tickers[ticker]['shares']
                })

        return changes

    def convert_to_atlas_format(self, portfolio_data: Dict) -> pd.DataFrame:
        """
        Convert Investopedia portfolio data to ATLAS Terminal format.

        Args:
            portfolio_data: Raw portfolio data from Investopedia

        Returns:
            DataFrame in ATLAS format (compatible with Phoenix Parser output)
        """
        if not portfolio_data or not portfolio_data.get('success'):
            return pd.DataFrame()

        holdings = portfolio_data['holdings']

        # Convert to ATLAS format
        atlas_data = []
        for holding in holdings:
            atlas_data.append({
                'Ticker': holding['ticker'],
                'Shares': holding['shares'],
                'Avg Cost': holding['purchase_price'],
                'Asset Name': holding.get('company', holding['ticker']),
                'Current Price': holding['current_price'],
                'Total Cost': holding['shares'] * holding['purchase_price'],
                'Total Value': holding['market_value'],
                'Total Gain/Loss $': holding['gain_loss'],
                'Total Gain/Loss %': holding['gain_loss_pct']
            })

        return pd.DataFrame(atlas_data)


# ===================================================================
# HELPER FUNCTIONS
# ===================================================================

def create_investopedia_session(email: str, password: str, game_id: str = None) -> InvestopediaSession:
    """
    Factory function to create Investopedia session.

    Args:
        email: Investopedia account email
        password: Investopedia account password
        game_id: Optional game/portfolio ID

    Returns:
        InvestopediaSession instance
    """
    creds = InvestopediaCredentials(email, password, game_id)
    return InvestopediaSession(creds)


def test_connection(email: str, password: str, game_id: str = None) -> bool:
    """
    Test Investopedia connection credentials.

    Args:
        email: Investopedia account email
        password: Investopedia account password
        game_id: Optional game/portfolio ID

    Returns:
        True if connection successful
    """
    session = create_investopedia_session(email, password, game_id)
    return session.login()


# ===================================================================
# EXAMPLE USAGE
# ===================================================================

if __name__ == "__main__":
    # Example: Manual usage
    creds = InvestopediaCredentials(
        email="your_email@example.com",
        password="your_password",
        game_id="12345"  # Optional
    )

    session = InvestopediaSession(creds)

    if session.login():
        # Fetch portfolio
        portfolio = session.get_portfolio_data()

        if portfolio and portfolio['success']:
            print("\n📊 PORTFOLIO:")
            print(f"Account Value: ${portfolio['account_summary']['account_value']:,.2f}")
            print(f"Cash: ${portfolio['account_summary']['cash']:,.2f}")
            print(f"\nHoldings:")
            for holding in portfolio['holdings']:
                print(f"  {holding['ticker']}: {holding['shares']} shares @ ${holding['current_price']:.2f}")

        # Fetch trade history
        trades = session.get_trade_history(days=30)
        print(f"\n📜 Recent Trades: {len(trades)}")
        for trade in trades[:5]:
            print(f"  {trade['date']}: {trade['action']} {trade['shares']} {trade['ticker']} @ ${trade['price']:.2f}")

        # Test auto-sync
        auto_sync = InvestopediaAutoSync(session, sync_interval_minutes=5)
        data = auto_sync.sync(force=True)

        if data:
            # Convert to ATLAS format
            atlas_df = auto_sync.convert_to_atlas_format(data)
            print(f"\n✅ Converted to ATLAS format: {len(atlas_df)} positions")
            print(atlas_df.head())
