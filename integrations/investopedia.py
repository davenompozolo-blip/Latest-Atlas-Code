"""
ATLAS Terminal - Investopedia Paper Trading Integration
========================================================
Two-stage authentication via Selenium:
  Stage 1: Login with email/password -> triggers 2FA email
  Stage 2: Submit 2FA code after user receives it
  Then: Live portfolio scraping after authentication

Extracted from atlas_app.py (Phase 2, Task A6).
"""

import os
import pandas as pd
import streamlit as st


class InvestopediaIntegration:
    """
    Investopedia Paper Trading API Integration - TWO-STAGE AUTHENTICATION

    FIXED: Proper 2FA flow with Selenium
    - Stage 1: Login with email/password -> triggers 2FA email
    - Stage 2: Submit 2FA code after user receives it
    - Live portfolio scraping after authentication
    """

    def __init__(self, email=None):
        self.email = email or os.getenv("INVESTOPEDIA_EMAIL", "")
        self.driver = None
        self.authenticated = False

    def attempt_login(self, password):
        """
        Stage 1: Attempt login with email/password to trigger 2FA email

        Returns:
            dict: {
                'status': '2fa_required' | 'error' | 'success',
                'message': str
            }
        """
        try:
            from selenium import webdriver
            from selenium.webdriver.common.by import By
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            from selenium.common.exceptions import TimeoutException, NoSuchElementException

            # COLAB-OPTIMIZED: System ChromeDriver setup
            # Auto-install Chromium and ChromeDriver if not present
            import subprocess

            # Check if ChromeDriver is installed, install if missing
            if not os.path.exists('/usr/bin/chromedriver'):
                st.info("Installing Chrome/ChromeDriver for Colab...")
                try:
                    subprocess.run(['apt-get', 'update'], check=True, capture_output=True)
                    subprocess.run(['apt-get', 'install', '-y', 'chromium-chromedriver'], check=True, capture_output=True)
                    subprocess.run(['cp', '/usr/lib/chromium-browser/chromedriver', '/usr/bin'], check=True, capture_output=True)
                    subprocess.run(['chmod', '+x', '/usr/bin/chromedriver'], check=True, capture_output=True)
                    st.success("ChromeDriver installed successfully!")
                except Exception as e:
                    st.warning(f"ChromeDriver installation failed: {e}")

            # COLAB-OPTIMIZED: Minimal Chrome options for stability
            options = webdriver.ChromeOptions()
            options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-gpu')

            # Explicit binary location for Colab
            options.binary_location = '/usr/bin/chromium-browser'

            # Use system ChromeDriver (no webdriver-manager needed)
            self.driver = webdriver.Chrome(options=options)

            # Navigate to Investopedia login page
            self.driver.get("https://www.investopedia.com/simulator/trade/login")

            # Wait for login form to load
            try:
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.ID, "edit-email"))
                )
            except TimeoutException:
                # Try alternative selectors
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.NAME, "email"))
                )

            # Enter credentials
            email_field = self.driver.find_element(By.ID, "edit-email") if self.driver.find_elements(By.ID, "edit-email") else self.driver.find_element(By.NAME, "email")
            password_field = self.driver.find_element(By.ID, "edit-password") if self.driver.find_elements(By.ID, "edit-password") else self.driver.find_element(By.NAME, "password")

            email_field.clear()
            email_field.send_keys(self.email)
            password_field.clear()
            password_field.send_keys(password)

            # Click login button
            login_button = self.driver.find_element(By.ID, "edit-submit") if self.driver.find_elements(By.ID, "edit-submit") else self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
            login_button.click()

            # Wait for response (check for 2FA prompt, error, or success)
            import time
            time.sleep(3)  # Brief wait for page to react

            # Check for 2FA prompt
            try:
                WebDriverWait(self.driver, 5).until(
                    EC.presence_of_element_located((By.ID, "edit-otp"))
                )
                # 2FA field appeared - success! Email has been sent
                return {
                    'status': '2fa_required',
                    'message': 'Login successful! Check your email for the 2FA code.'
                }
            except TimeoutException:
                pass

            # Check for error message
            try:
                error_element = self.driver.find_element(By.CLASS_NAME, "messages--error")
                error_text = error_element.text
                self.driver.quit()
                self.driver = None
                return {
                    'status': 'error',
                    'message': f'Login failed: {error_text}'
                }
            except NoSuchElementException:
                pass

            # Check if already on portfolio page (no 2FA needed)
            if "portfolio" in self.driver.current_url.lower() or "trade" in self.driver.current_url.lower():
                self.authenticated = True
                return {
                    'status': 'success',
                    'message': 'Login successful (no 2FA required)'
                }

            # Unknown state
            current_url = self.driver.current_url
            self.driver.quit()
            self.driver = None
            return {
                'status': 'error',
                'message': f'Unexpected page state after login. Current URL: {current_url}'
            }

        except Exception as e:
            if self.driver:
                self.driver.quit()
                self.driver = None
            return {
                'status': 'error',
                'message': f'Login error: {str(e)}'
            }

    def submit_2fa_code(self, code):
        """
        Stage 2: Submit 2FA code to complete authentication

        Args:
            code (str): 6-digit 2FA code from user's email

        Returns:
            dict: {'status': 'success' | 'error', 'message': str}
        """
        try:
            from selenium.webdriver.common.by import By
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            from selenium.common.exceptions import TimeoutException, NoSuchElementException

            if not self.driver:
                return {
                    'status': 'error',
                    'message': 'No active login session. Please start login again.'
                }

            # Find 2FA code input field
            try:
                code_field = WebDriverWait(self.driver, 5).until(
                    EC.presence_of_element_located((By.ID, "edit-otp"))
                )
            except TimeoutException:
                # Try alternative selectors
                code_field = self.driver.find_element(By.NAME, "otp")

            # Enter 2FA code
            code_field.clear()
            code_field.send_keys(code)

            # Click submit button
            submit_button = self.driver.find_element(By.ID, "edit-submit") if self.driver.find_elements(By.ID, "edit-submit") else self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
            submit_button.click()

            # Wait for result
            import time
            time.sleep(3)

            # Check for error message
            try:
                error = self.driver.find_element(By.CLASS_NAME, "messages--error")
                return {
                    'status': 'error',
                    'message': f'Invalid 2FA code: {error.text}'
                }
            except NoSuchElementException:
                pass

            # Check if redirected to portfolio/trade page (success)
            try:
                WebDriverWait(self.driver, 10).until(
                    lambda driver: "portfolio" in driver.current_url.lower() or "trade" in driver.current_url.lower()
                )
                self.authenticated = True
                return {
                    'status': 'success',
                    'message': 'Authentication complete! You can now sync your portfolio.'
                }
            except TimeoutException:
                return {
                    'status': 'error',
                    'message': '2FA code accepted but failed to reach portfolio page'
                }

        except Exception as e:
            return {
                'status': 'error',
                'message': f'2FA submission error: {str(e)}'
            }

    def scrape_portfolio(self):
        """Scrape live portfolio data from Investopedia after successful authentication"""
        if not self.authenticated or not self.driver:
            st.warning("Please authenticate first")
            return None

        try:
            from selenium.webdriver.common.by import By
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            from bs4 import BeautifulSoup

            # Navigate to portfolio page (if not already there)
            if "portfolio" not in self.driver.current_url:
                self.driver.get("https://www.investopedia.com/simulator/portfolio")

            # Wait for portfolio table to load
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "table.portfolio-table"))
            )

            # Parse page HTML
            soup = BeautifulSoup(self.driver.page_source, 'html.parser')

            # Extract positions from table
            positions = []
            table = soup.find('table', class_='portfolio-table')

            if table:
                rows = table.find('tbody').find_all('tr')

                for row in rows:
                    cells = row.find_all('td')
                    if len(cells) >= 6:
                        position = {
                            'Ticker': cells[0].text.strip(),
                            'Shares': float(cells[1].text.strip().replace(',', '')),
                            'Avg Cost': float(cells[2].text.strip().replace('$', '').replace(',', '')),
                            'Current Price': float(cells[3].text.strip().replace('$', '').replace(',', '')),
                            'Total Value': float(cells[4].text.strip().replace('$', '').replace(',', '')),
                            'Gain/Loss': float(cells[5].text.strip().replace('$', '').replace(',', ''))
                        }
                        positions.append(position)

            # Cleanup driver
            self.driver.quit()
            self.driver = None

            if positions:
                st.success(f"Successfully scraped {len(positions)} positions from Investopedia")
                return pd.DataFrame(positions)
            else:
                st.info("Portfolio is empty or no positions found")
                return pd.DataFrame()

        except Exception as e:
            st.error(f"Portfolio scraping error: {str(e)}")
            if self.driver:
                self.driver.quit()
                self.driver = None
            return None

    def cleanup(self):
        """Cleanup driver resources"""
        if self.driver:
            self.driver.quit()
            self.driver = None
