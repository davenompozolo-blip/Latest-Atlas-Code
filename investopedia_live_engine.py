#!/usr/bin/env python3
"""
ATLAS TERMINAL v10.0 - INVESTOPEDIA LIVE DATA ENGINE
Real Quant Developer Move: Automated Investopedia Portfolio Sync

Features:
- Automated login to Investopedia
- Live portfolio fetching (holdings, cash, trades)
- Session management & cookie persistence
- Real-time position updates
- Trade history scraping
- Account value tracking
- Auto-sync on schedule

This turns ATLAS from a manual upload tool into a real-time portfolio tracking engine.
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

# Import improved scraper and diagnostics
try:
    from atlas_investopedia_diagnostics import (
        ImprovedInvestopediaScraper,
        InvestopediaDiagnostics,
        diagnose_and_fix_scraping
    )
    DIAGNOSTICS_AVAILABLE = True
except ImportError:
    DIAGNOSTICS_AVAILABLE = False
    print("⚠️ Diagnostics module not found - using legacy scraper")

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
        Uses improved multi-strategy scraper for better reliability.

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

            # Try improved multi-strategy scraper first (if available)
            if DIAGNOSTICS_AVAILABLE:
                portfolio_data = ImprovedInvestopediaScraper.parse_portfolio_multi_strategy(response.text)

                if portfolio_data and portfolio_data.get('holdings'):
                    # Add account summary
                    account_summary = self._parse_account_summary(soup)

                    return {
                        'holdings': portfolio_data['holdings'],
                        'account_summary': account_summary,
                        'timestamp': datetime.now(),
                        'success': True
                    }
                else:
                    print("⚠️ Improved scraper found no data, falling back to legacy parser...")

            # Fallback to legacy scraper
            holdings = self._parse_holdings(soup)
            account_summary = self._parse_account_summary(soup)

            if not holdings:
                print("⚠️ No holdings found - portfolio may be empty or scraper needs updating")
                # Save HTML for debugging
                if DIAGNOSTICS_AVAILABLE:
                    try:
                        diag = InvestopediaDiagnostics(self.session)
                        diag.save_portfolio_html()
                        print("📄 HTML saved to investopedia_portfolio.html for debugging")
                    except:
                        pass

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
            # Try finding any table with holdings data
            tables = soup.find_all('table')
            for table in tables:
                headers = [th.text.strip().lower() for th in table.find_all('th')]
                if any(keyword in ' '.join(headers) for keyword in ['symbol', 'ticker', 'shares', 'quantity']):
                    holdings_table = table
                    break

        if not holdings_table:
            print("⚠️ Could not find holdings table")
            return holdings

        # Parse table rows
        tbody = holdings_table.find('tbody')
        if not tbody:
            tbody = holdings_table

        rows = tbody.find_all('tr')[1:]  # Skip header

        for row in rows:
            cols = row.find_all('td')

            if len(cols) < 3:
                continue

            try:
                ticker = cols[0].text.strip()

                # Skip if this is a header or summary row
                if not ticker or ticker.upper() in ['TOTAL', 'CASH', 'SUMMARY']:
                    continue

                holding = {
                    'ticker': ticker,
                    'company': cols[1].text.strip() if len(cols) > 1 else '',
                    'shares': self._parse_number(cols[2]) if len(cols) > 2 else 0,
                    'purchase_price': self._parse_currency(cols[3]) if len(cols) > 3 else 0,
                    'current_price': self._parse_currency(cols[4]) if len(cols) > 4 else 0,
                    'market_value': self._parse_currency(cols[5]) if len(cols) > 5 else 0,
                    'gain_loss': self._parse_currency(cols[6]) if len(cols) > 6 else 0,
                    'gain_loss_pct': self._parse_percentage(cols[7]) if len(cols) > 7 else 0
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
            # Try alternative - look for cards
            cards = soup.find_all('div', class_=re.compile(r'.*card.*|.*summary.*', re.I))
            for card in cards:
                text = card.text.lower()

                # Account Value
                if 'account value' in text or 'total value' in text:
                    value = self._find_currency_in_text(card.text)
                    if value:
                        summary['account_value'] = value

                # Cash
                if 'cash' in text and 'buying' not in text:
                    value = self._find_currency_in_text(card.text)
                    if value:
                        summary['cash'] = value

                # Buying Power
                if 'buying power' in text:
                    value = self._find_currency_in_text(card.text)
                    if value:
                        summary['buying_power'] = value

                # Total Gain/Loss
                if 'total gain' in text or 'total return' in text:
                    value = self._find_currency_in_text(card.text)
                    if value:
                        summary['total_gain_loss'] = value

                    pct = self._find_percentage_in_text(card.text)
                    if pct:
                        summary['total_gain_loss_pct'] = pct

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

    def _parse_number(self, cell) -> float:
        """Extract number from table cell"""
        text = cell.text.strip()
        text = text.replace(',', '')
        try:
            return float(text)
        except:
            return 0

    def _parse_currency(self, cell) -> float:
        """Extract currency value from table cell"""
        text = cell.text.strip()
        text = text.replace('$', '').replace(',', '').replace('(', '-').replace(')', '')
        try:
            return float(text)
        except:
            return 0

    def _parse_percentage(self, cell) -> float:
        """Extract percentage from table cell"""
        text = cell.text.strip()
        text = text.replace('%', '').replace('(', '-').replace(')', '')
        try:
            return float(text)
        except:
            return 0

    def _find_currency_in_text(self, text: str) -> Optional[float]:
        """Find currency value in text"""
        match = re.search(r'\$([0-9,]+\.?[0-9]*)', text)
        if match:
            try:
                return float(match.group(1).replace(',', ''))
            except:
                pass
        return None

    def _find_percentage_in_text(self, text: str) -> Optional[float]:
        """Find percentage in text"""
        match = re.search(r'([-+]?[0-9]+\.?[0-9]*)%', text)
        if match:
            try:
                return float(match.group(1))
            except:
                pass
        return None

    def run_diagnostics(self) -> Dict:
        """
        Run diagnostic tools to analyze portfolio HTML structure.
        Useful for debugging scraping issues.

        Returns:
            Dict with diagnostic results
        """
        if not DIAGNOSTICS_AVAILABLE:
            return {
                'success': False,
                'error': 'Diagnostics module not available'
            }

        if not self.is_authenticated:
            if not self.login():
                return {
                    'success': False,
                    'error': 'Not authenticated'
                }

        try:
            from atlas_investopedia_diagnostics import get_diagnostic_info
            return get_diagnostic_info(self.session)
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

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
                # Try alternative selector
                tables = soup.find_all('table')
                for table in tables:
                    headers = [th.text.strip().lower() for th in table.find_all('th')]
                    if any(keyword in ' '.join(headers) for keyword in ['date', 'action', 'trade']):
                        trade_table = table
                        break

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
            remaining_minutes = (self.sync_interval - (datetime.now() - self.last_sync)).seconds // 60
            print(f"⏰ Next sync in {remaining_minutes} minutes")
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

        # Find closed positions
        for ticker in previous_tickers:
            if ticker not in current_tickers:
                changes['holdings_changes'].append({
                    'ticker': ticker,
                    'action': 'CLOSED',
                    'shares': previous_tickers[ticker]['shares']
                })

        return changes


# ===================================================================
# DATA CONVERTER - Convert Investopedia data to ATLAS format
# ===================================================================

def convert_investopedia_to_atlas_format(portfolio_data: Dict) -> pd.DataFrame:
    """
    Convert Investopedia portfolio data to ATLAS Terminal format.

    ATLAS expects columns:
    - Ticker
    - Shares
    - Purchase Price (or Cost Basis)
    - Current Price
    - Market Value

    Args:
        portfolio_data: Data from InvestopediaSession.get_portfolio_data()

    Returns:
        DataFrame in ATLAS format
    """
    if not portfolio_data or not portfolio_data.get('success'):
        return pd.DataFrame()

    holdings = portfolio_data['holdings']

    if not holdings:
        return pd.DataFrame()

    # Convert to DataFrame
    df = pd.DataFrame(holdings)

    # Rename columns to match ATLAS format
    column_mapping = {
        'ticker': 'Ticker',
        'shares': 'Shares',
        'purchase_price': 'Purchase Price',
        'current_price': 'Current Price',
        'market_value': 'Market Value',
        'company': 'Company'
    }

    df = df.rename(columns=column_mapping)

    # Select only required columns
    required_columns = ['Ticker', 'Shares', 'Purchase Price']
    optional_columns = ['Current Price', 'Market Value', 'Company']

    available_columns = required_columns + [col for col in optional_columns if col in df.columns]
    df = df[available_columns]

    return df


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

            # Convert to ATLAS format
            atlas_df = convert_investopedia_to_atlas_format(portfolio)
            print(f"\n📊 ATLAS Format DataFrame:")
            print(atlas_df)

        # Fetch trade history
        trades = session.get_trade_history(days=30)
        print(f"\n📜 Recent Trades: {len(trades)}")
        for trade in trades[:5]:
            print(f"  {trade['date']}: {trade['action']} {trade['shares']} {trade['ticker']} @ ${trade['price']:.2f}")
