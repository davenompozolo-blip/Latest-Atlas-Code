"""
ATLAS Investopedia Integration - Production 2FA
Handles email-based OTP authentication flow
"""

import time
import json
import os
from datetime import datetime
from typing import Dict, Optional
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from bs4 import BeautifulSoup
import pandas as pd


class InvestopediaAuth:
    """
    Investopedia Authentication with Email/OTP Flow

    Authentication Process:
    1. Navigate to Investopedia Simulator
    2. Enter email address
    3. Wait for OTP code email
    4. User enters OTP manually
    5. Complete authentication
    6. Save session
    """

    # URLs
    BASE_URL = "https://www.investopedia.com"
    SIMULATOR_URL = "https://www.investopedia.com/simulator/"
    LOGIN_URL = "https://www.investopedia.com/simulator/login"
    PORTFOLIO_URL = "https://www.investopedia.com/simulator/portfolio/"

    def __init__(self, session_dir: str = "data/sessions"):
        """
        Initialize authenticator

        Args:
            session_dir: Directory to store session cookies
        """
        self.session_dir = session_dir
        os.makedirs(session_dir, exist_ok=True)

        self.driver = None
        self.session_file = os.path.join(session_dir, "investopedia_session.json")

    def _init_driver(self, headless: bool = False):
        """
        Initialize Selenium WebDriver

        Args:
            headless: Run in headless mode (default: False for visibility)
        """
        options = webdriver.ChromeOptions()

        if headless:
            options.add_argument('--headless')

        # Standard options
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

        self.driver = webdriver.Chrome(options=options)
        self.driver.implicitly_wait(10)

    def authenticate(self, email: str, password: str = "") -> bool:
        """
        Authenticate with Investopedia using email/OTP flow

        Args:
            email: User email address
            password: Password (may not be used, but kept for compatibility)

        Returns:
            True if authentication successful
        """
        print("=" * 80)
        print("INVESTOPEDIA AUTHENTICATION - EMAIL/OTP FLOW")
        print("=" * 80)

        try:
            # Initialize driver (non-headless so user can see)
            print("Initializing browser...")
            self._init_driver(headless=False)

            # Navigate to login
            print(f"Navigating to: {self.LOGIN_URL}")
            self.driver.get(self.LOGIN_URL)
            time.sleep(3)

            # Find and fill email input
            print("Looking for email input field...")
            try:
                email_input = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.ID, "email"))
                )
                print(f"Entering email: {email}")
                email_input.clear()
                email_input.send_keys(email)

            except TimeoutException:
                # Try alternative selectors
                print("Primary email selector failed, trying alternatives...")
                email_input = self.driver.find_element(By.NAME, "email")
                email_input.clear()
                email_input.send_keys(email)

            # If password field exists, fill it (some flows may still use it)
            try:
                password_input = self.driver.find_element(By.ID, "password")
                if password:
                    password_input.clear()
                    password_input.send_keys(password)
            except:
                print("No password field found (expected for email-only flow)")

            # Click submit/continue button
            print("Looking for submit button...")
            try:
                submit_btn = self.driver.find_element(By.XPATH, "//button[@type='submit']")
                submit_btn.click()
            except:
                # Try alternative submit methods
                submit_btn = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
                submit_btn.click()

            time.sleep(3)

            # CRITICAL: Wait for OTP input page
            print("\n" + "=" * 80)
            print("⚠️  WAITING FOR OTP CODE ENTRY")
            print("=" * 80)
            print("Check your email for the verification code!")
            print("Browser window is open - you can see the page.")
            print("=" * 80)

            # Wait for OTP field to appear
            print("Waiting for OTP input field...")
            try:
                otp_input = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.ID, "code"))
                )
                print("✅ OTP input field detected!")

            except TimeoutException:
                # Try alternative selectors
                print("Trying alternative OTP selectors...")
                otp_input = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.NAME, "code"))
                )

            # MANUAL OTP ENTRY
            print("\n" + "=" * 80)
            print("👤 MANUAL INPUT REQUIRED")
            print("=" * 80)
            otp_code = input("Enter the OTP code from your email: ").strip()

            print(f"Entering OTP: {otp_code}")
            otp_input.clear()
            otp_input.send_keys(otp_code)

            # Submit OTP
            print("Submitting OTP...")
            otp_submit = self.driver.find_element(By.XPATH, "//button[@type='submit']")
            otp_submit.click()

            time.sleep(5)

            # Verify authentication
            print("Verifying authentication...")
            current_url = self.driver.current_url

            if "portfolio" in current_url or "simulator" in current_url:
                print("✅ AUTHENTICATION SUCCESSFUL!")

                # Save session cookies
                self._save_session()

                return True
            else:
                print(f"❌ Authentication failed. Current URL: {current_url}")
                return False

        except Exception as e:
            print(f"❌ Authentication error: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

    def _save_session(self):
        """Save session cookies to file"""
        print("Saving session cookies...")
        cookies = self.driver.get_cookies()

        session_data = {
            'cookies': cookies,
            'timestamp': datetime.now().isoformat(),
            'url': self.driver.current_url
        }

        with open(self.session_file, 'w') as f:
            json.dump(session_data, f, indent=2)

        print(f"✅ Session saved to: {self.session_file}")

    def load_session(self) -> bool:
        """
        Load session from file and restore cookies

        Returns:
            True if session loaded successfully
        """
        if not os.path.exists(self.session_file):
            print("No session file found")
            return False

        try:
            with open(self.session_file, 'r') as f:
                session_data = json.load(f)

            # Check if session is recent (within 24 hours)
            timestamp = datetime.fromisoformat(session_data['timestamp'])
            age_hours = (datetime.now() - timestamp).total_seconds() / 3600

            if age_hours > 24:
                print(f"Session expired ({age_hours:.1f} hours old)")
                return False

            # Initialize driver and load cookies
            self._init_driver(headless=False)
            self.driver.get(self.PORTFOLIO_URL)

            for cookie in session_data['cookies']:
                self.driver.add_cookie(cookie)

            # Refresh to apply cookies
            self.driver.refresh()
            time.sleep(3)

            # Verify still logged in
            if "portfolio" in self.driver.current_url or "simulator" in self.driver.current_url:
                print("✅ Session restored successfully")
                return True
            else:
                print("Session restore failed - cookies invalid")
                return False

        except Exception as e:
            print(f"Error loading session: {str(e)}")
            return False

    def scrape_portfolio(self) -> pd.DataFrame:
        """
        Scrape portfolio holdings from Investopedia

        Returns:
            DataFrame with portfolio data
        """
        if not self.driver:
            raise ValueError("Driver not initialized. Call authenticate() or load_session() first.")

        print("Navigating to portfolio page...")
        self.driver.get(self.PORTFOLIO_URL)
        time.sleep(3)

        print("Scraping portfolio data...")
        page_source = self.driver.page_source
        soup = BeautifulSoup(page_source, 'html.parser')

        # Parse portfolio table
        # NOTE: Actual selectors will depend on Investopedia's HTML structure
        # This is a template - adjust selectors based on actual page inspection

        holdings = []

        # Find holdings table
        table = soup.find('table', {'class': 'holdings-table'})  # Adjust selector

        if table:
            rows = table.find_all('tr')[1:]  # Skip header

            for row in rows:
                cells = row.find_all('td')
                if len(cells) >= 4:
                    holding = {
                        'symbol': cells[0].text.strip(),
                        'quantity': float(cells[1].text.strip().replace(',', '')),
                        'price': float(cells[2].text.strip().replace('$', '').replace(',', '')),
                        'value': float(cells[3].text.strip().replace('$', '').replace(',', ''))
                    }
                    holdings.append(holding)

        df = pd.DataFrame(holdings)
        print(f"✅ Scraped {len(df)} holdings")

        return df

    def close(self):
        """Close the browser"""
        if self.driver:
            self.driver.quit()
            print("Browser closed")


__all__ = ['InvestopediaAuth']
