#!/usr/bin/env python3
"""
ATLAS TERMINAL v10.0 INSTITUTIONAL EDITION
Complete Portfolio Analytics + Valuation House - Bloomberg Terminal Quality

🚀 NEW IN v10.0 (Latest Release - November 16, 2025):
✅ INSTITUTIONAL PERFORMANCE SUITE: 4-tab professional analysis system
   • Portfolio Performance: Enhanced metrics with rolling Sharpe, returns distribution
   • Individual Securities: Deep-dive analysis for each holding with technical indicators
   • Risk Decomposition: Position-level risk contribution analysis
   • Attribution & Benchmarking: Alpha generation and tracking error metrics
✅ Professional Sector Allocation Charts: Clean, modern donut and bar visualizations
✅ Portfolio Correlation Heatmap: Understand diversification with correlation matrix
✅ Individual Security Analysis: Candlestick charts, Bollinger Bands, MA50/MA200
✅ Risk Contribution Analysis: Marginal contribution to risk (MCR) for each position
✅ Beta & Correlation Metrics: Market relationship analysis vs SPY
✅ Enhanced Diversification Scoring: Automated correlation insights

🎯 v9.8 FEATURES (November 2025):
✅ Brinson Attribution Analysis: Measure allocation vs selection skill
✅ Portfolio Management Skill Scores: 0-10 ratings for sector timing and stock picking
✅ Benchmark Sector Returns: Real-time sector ETF performance tracking
✅ Table Dropdown Fix: Nuclear CSS override eliminates all UI glitches
✅ Enhanced Data Tables: Clean, professional rendering across all pages

PREVIOUS ENHANCEMENTS (v9.3-v9.7):
✅ Advanced Risk Metrics: VaR, CVaR, and Maximum Drawdown analysis
✅ Home Page: Top Contributors/Detractors + Enhanced Dashboard
✅ Market Watch: COMPLETE REVAMP (Crypto, Bonds, Spreads, Expanded Universe)
✅ Chart Theming: ALL charts blend seamlessly with dark background
✅ Portfolio Deep Dive: Enhanced visuals + Fixed Nov 2024 columns
✅ Valuation House: Analyst-grade fixes (scaling D&A/CapEx, Smart Assumptions, Editable Projections)

RELEASE DATE: November 16, 2025
PRODUCTION STATUS: VERIFIED AND TESTED
VERSION: 10.0
"""

# ============================================================================
# CRITICAL: Set network timeout FIRST, before ANY imports that use network
# This prevents any socket operation from hanging indefinitely
# ============================================================================
import socket
socket.setdefaulttimeout(15)  # 15 second timeout for ALL network operations

import os
os.environ['YFINANCE_TIMEOUT'] = '10'

# ============================================================================
# EARLY BOOT DIAGNOSTICS - TRACE IMPORT FAILURES
# ============================================================================
import sys
print(f"[BOOT] Python {sys.version}", flush=True)
print(f"[BOOT] Starting imports...", flush=True)
print(f"[BOOT] Global socket timeout set to 15s", flush=True)

import warnings
import time
from datetime import datetime, timedelta, date
from pathlib import Path
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
print(f"[BOOT] Standard libs + streamlit OK", flush=True)

# ============================================================================
# STREAMLIT PAGE CONFIG (must be first Streamlit call)
# ============================================================================
st.set_page_config(
    page_title="ATLAS Terminal v10.0 INSTITUTIONAL",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded",  # Phase 1B: Show vertical sidebar
)

# ============================================================================
# CSS/JS STYLING - Extracted to ui/atlas_css.py (Phase 1 Refactoring)
# ============================================================================
from ui.atlas_css import init_atlas_css
init_atlas_css()

# ATLAS Table Formatting - Global typography for tables (Inter font, Bloomberg style)
from core.atlas_table_formatting import inject_table_css
inject_table_css()

# PHASE 1 REFACTORING: Centralized configuration
print(f"[BOOT] Importing app.config...", flush=True)
from app.config import (
    COLORS, CHART_HEIGHT_COMPACT, CHART_HEIGHT_STANDARD,
    CHART_HEIGHT_LARGE, CHART_HEIGHT_DEEP_DIVE, CHART_THEME,
    CACHE_DIR, PORTFOLIO_CACHE, TRADE_HISTORY_CACHE,
    ACCOUNT_HISTORY_CACHE, RISK_FREE_RATE, MARKET_RETURN
)

# ============================================================================
# PHASE 2A: NAVIGATION SYSTEM (New modular architecture)
# ============================================================================
print(f"[BOOT] Importing navigation...", flush=True)
from navigation import PAGE_REGISTRY, get_page_by_key, route_to_page
print(f"[BOOT] navigation OK", flush=True)

# PHASE 1B: VERTICAL SIDEBAR NAVIGATION (Fomo-inspired)
print(f"[BOOT] Importing ui.components...", flush=True)
from ui.components import render_sidebar_navigation
print(f"[BOOT] ui.components OK", flush=True)

# PHASE 2A: ENHANCED COMPONENTS (Fomo-inspired)
print(f"[BOOT] Importing ui.components extended...", flush=True)
from ui.components import (
    # Badges
    badge, render_badge, badge_group,
    # Enhanced Tables
    atlas_table, atlas_table_with_badges,
    # Chart Theme
    create_line_chart, create_performance_chart,
    ATLAS_TEMPLATE, ATLAS_COLORS
)
print(f"[BOOT] ui.components extended OK", flush=True)

# ATLAS v12.0: Professional Blue Theme System
print(f"[BOOT] Importing ui.theme...", flush=True)
try:
    from ui.theme import (
        ATLAS_COLORS as PROFESSIONAL_COLORS,
        CHART_COLORS as PROFESSIONAL_CHART_COLORS,
        CHART_FILLS,
        FONTS,
        SPACING,
        CHART_LAYOUT,
        get_color,
        get_semantic_color,
        format_percentage as fmt_pct,
        format_currency as fmt_curr,
    )
    from ui.charts_professional import (
        apply_atlas_theme as apply_professional_theme,
        create_performance_chart as create_pro_performance_chart,
        create_bar_chart as create_pro_bar_chart,
        create_donut_chart as create_pro_donut_chart,
        create_gauge_chart as create_pro_gauge_chart,
    )
    PROFESSIONAL_THEME_AVAILABLE = True
    print("✅ Professional Blue Theme System loaded")
except ImportError as e:
    PROFESSIONAL_THEME_AVAILABLE = False
    print(f"⚠️ Professional Theme not available: {e}")
print(f"[BOOT] ui.theme done", flush=True)

# ============================================================================
# BROKER INTEGRATION SYSTEM (Alpaca, Easy Equities, Manual Entry)
# ============================================================================
print(f"[BOOT] Importing broker manager...", flush=True)
try:
    from atlas_broker_manager import BrokerManager, ManualPortfolioAdapter
    from atlas_broker_manager import display_manual_portfolio_editor
    BROKER_MANAGER_AVAILABLE = True
    print("✅ Broker Manager loaded (Alpaca, Easy Equities, Manual Entry)")
except ImportError as e:
    BROKER_MANAGER_AVAILABLE = False
    print(f"⚠️ Broker Manager not available: {e}")
print(f"[BOOT] broker manager done", flush=True)

# Auto-install streamlit_option_menu if missing
print(f"[BOOT] Importing streamlit_option_menu...", flush=True)
try:
    from streamlit_option_menu import option_menu
except ImportError:
    import subprocess
    import sys
    print("📦 Installing streamlit-option-menu...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "streamlit-option-menu>=0.3.6"])
    from streamlit_option_menu import option_menu
    print("✅ streamlit-option-menu installed successfully!")
print(f"[BOOT] streamlit_option_menu done", flush=True)

print(f"[BOOT] Importing yfinance, scipy, sklearn...", flush=True)
import yfinance as yf
from scipy import stats
from scipy.optimize import minimize
import networkx as nx
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.linear_model import LinearRegression
print(f"[BOOT] yfinance, scipy, sklearn OK", flush=True)

# ATLAS v10.0 Advanced Modules
print(f"[BOOT] Importing v10.0 modules...", flush=True)
try:
    from valuation.atlas_dcf_engine import DCFValuation
    from risk_analytics.atlas_monte_carlo import MonteCarloSimulation
    from risk_analytics.atlas_risk_metrics import RiskAnalytics
    from portfolio_tools.atlas_phoenix_mode import PhoenixMode
    from analytics.atlas_performance_attribution import PerformanceAttribution
    from ui.atlas_enhanced_components import (
        create_allocation_chart,
        create_performance_chart,
        create_drawdown_chart,
        create_risk_return_scatter
    )
    V10_MODULES_AVAILABLE = True
except ImportError as e:
    V10_MODULES_AVAILABLE = False
    print(f"⚠️ v10.0 modules not available: {e}")

# ATLAS v11.0 SQL & R Integration
try:
    from data import get_db
    SQL_AVAILABLE = True
    print("✅ SQL data layer loaded")
except ImportError as e:
    SQL_AVAILABLE = False
    print(f"⚠️ SQL layer not available: {e}")

# ATLAS v11.0 DCF Trap Detection System
try:
    from analytics.dcf_trap_detector import DCFTrapDetector, analyze_dcf_traps
    DCF_TRAP_DETECTION_AVAILABLE = True
    print("✅ DCF Trap Detection System loaded")
except ImportError as e:
    DCF_TRAP_DETECTION_AVAILABLE = False
    print(f"⚠️ DCF Trap Detection not available: {e}")

# ATLAS v11.0 Model Inputs Dashboard
try:
    from analytics.model_inputs_ui import display_model_inputs_dashboard
    MODEL_INPUTS_DASHBOARD_AVAILABLE = True
    print("✅ Model Inputs Dashboard loaded")
except ImportError as e:
    MODEL_INPUTS_DASHBOARD_AVAILABLE = False
    print(f"⚠️ Model Inputs Dashboard not available: {e}")

# ============================================================================
# INSTITUTIONAL-GRADE DCF ENHANCEMENTS (January 2026)
# ============================================================================
try:
    from atlas_dcf_institutional import (
        DCFAssumptionManager,
        DCFValidator,
        RobustDCFEngine,
        MonteCarloDCF,
        display_validation_warnings,
        display_monte_carlo_results
    )
    INSTITUTIONAL_DCF_AVAILABLE = True
    print("✅ Institutional-Grade DCF Enhancements loaded")
except ImportError as e:
    INSTITUTIONAL_DCF_AVAILABLE = False
    print(f"⚠️ Institutional DCF not available: {e}")

# ATLAS v11.0 SBC Integration
try:
    from analytics.sbc_forecaster import (
        SBCForecaster,
        SBCForecastConfig,
        SBCForecastMethod,
        integrate_sbc_with_fcff,
        create_sbc_comparison_analysis
    )
    from analytics.sbc_ui import display_sbc_valuation_impact
    SBC_AVAILABLE = True
    print("✅ SBC Integration loaded")
except ImportError as e:
    SBC_AVAILABLE = False
    print(f"⚠️ SBC Integration not available: {e}")

# ============================================================================
# PM-GRADE PORTFOLIO OPTIMIZATION (January 2026)
# ============================================================================
try:
    from atlas_pm_optimization import (
        PMGradeOptimizer,
        AsymmetricRiskOptimizer,
        MarketRegimeDetector,
        ForwardLookingReturns,
        display_regime_analysis,
        display_optimization_results
    )
    PM_OPTIMIZATION_AVAILABLE = True
    print("✅ PM-Grade Optimization loaded")
except ImportError as e:
    PM_OPTIMIZATION_AVAILABLE = False
    print(f"⚠️ PM-Grade Optimization not available: {e}")

# ATLAS v11.0 Multi-Stage DCF
try:
    from analytics.multistage_ui import (
        display_model_selection,
        visualize_stage_transitions,
        display_multistage_results
    )
    from analytics.multistage_dcf import (
        MultiStageProjectionEngine,
        calculate_multistage_dcf
    )
    MULTISTAGE_DCF_AVAILABLE = True
    print("✅ Multi-Stage DCF loaded")
except ImportError as e:
    MULTISTAGE_DCF_AVAILABLE = False
    print(f"⚠️ Multi-Stage DCF not available: {e}")

try:
    from r_analytics import get_r
    R_AVAILABLE = True
    print("✅ R analytics layer loaded")
except ImportError as e:
    R_AVAILABLE = False
    print(f"⚠️ R analytics not available: {e}")

# ATLAS REFACTORING - Phase 1 Infrastructure (Week 1)
try:
    from atlas_terminal.core.cache_manager import cached, cache_manager
    from atlas_terminal.core.error_handler import safe_execute, ErrorHandler
    from atlas_terminal.data.fetchers.market_data import market_data
    REFACTORED_MODULES_AVAILABLE = True
    print("✅ ATLAS Refactored Infrastructure loaded (Cache + Error + Data)")
except ImportError as e:
    REFACTORED_MODULES_AVAILABLE = False
    print(f"⚠️ Refactored modules not available: {e}")

print(f"[BOOT] ========================================", flush=True)
print(f"[BOOT] ALL IMPORTS COMPLETE - Starting app...", flush=True)
print(f"[BOOT] ========================================", flush=True)

warnings.filterwarnings("ignore")

# ============================================================================
# HELPER FUNCTIONS FOR VALIDATION
# ============================================================================








# Formatting utilities - imported from utils/formatting.py
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


# ============================================================================
# GICS SECTOR CLASSIFICATION - Extracted to data/sectors.py (Phase 2)
# ============================================================================
from data.sectors import (
    GICS_SECTORS, GICS_SECTOR_MAPPING, STOCK_SECTOR_OVERRIDES, SPY_SECTOR_WEIGHTS
)









def get_benchmark_sector_returns(benchmark_ticker='SPY', period='1y'):
    """
    Get sector returns from benchmark ETF.
    Uses sector ETFs as proxies for sector performance.

    Parameters:
        benchmark_ticker: Main benchmark (SPY)
        period: Time period for returns

    Returns:
        dict: {sector: return_percentage}
    """
    # ATLAS Refactoring: Check cache first (6 hour TTL for sector returns)
    if REFACTORED_MODULES_AVAILABLE:
        cache_key = cache_manager.get_cache_key('benchmark_sector_returns', benchmark_ticker, period)
        cached_result = cache_manager.get(cache_key, ttl=21600)  # 6 hours
        if cached_result is not None:
            return cached_result

    # Sector ETF proxies
    sector_etfs = {
        'Information Technology': 'XLK',
        'Financials': 'XLF',
        'Health Care': 'XLV',
        'Consumer Discretionary': 'XLY',
        'Communication Services': 'XLC',
        'Industrials': 'XLI',
        'Consumer Staples': 'XLP',
        'Energy': 'XLE',
        'Materials': 'XLB',
        'Real Estate': 'XLRE',
        'Utilities': 'XLU'
    }

    sector_returns = {}

    for sector, etf in sector_etfs.items():
        try:
            # Check individual ETF cache first
            if REFACTORED_MODULES_AVAILABLE:
                etf_cache_key = cache_manager.get_cache_key('sector_etf_return', etf, period)
                cached_etf = cache_manager.get(etf_cache_key, ttl=21600)
                if cached_etf is not None:
                    sector_returns[sector] = cached_etf
                    continue

            data = yf.Ticker(etf).history(period=period)
            if len(data) > 0:
                ret = (data['Close'].iloc[-1] / data['Close'].iloc[0] - 1) * 100
                sector_returns[sector] = ret
                # Cache individual ETF result
                if REFACTORED_MODULES_AVAILABLE:
                    cache_manager.set(etf_cache_key, ret, persist=True)
            else:
                sector_returns[sector] = 0
        except:
            sector_returns[sector] = 0

    # Cache the complete result
    if REFACTORED_MODULES_AVAILABLE:
        cache_manager.set(cache_key, sector_returns, persist=True)

    return sector_returns










# =============================================================================
# RERUN LOOP PROTECTION - DO NOT REMOVE
# =============================================================================
import os as _os

# Debug: Log each execution
_boot_id = f"pid={_os.getpid()} ts={time.time():.3f}"
print(f"ATLAS BOOT: {_boot_id}")

# Prevent infinite rerun loops (rapid successive reruns within 2 seconds)
if 'app_initialized' not in st.session_state:
    st.session_state.app_initialized = True
    st.session_state.boot_count = 1
    st.session_state._last_boot_time = time.time()
else:
    _now = time.time()
    _elapsed = _now - st.session_state.get('_last_boot_time', 0)
    if _elapsed < 2.0:
        # Rapid rerun - likely a loop
        st.session_state.boot_count += 1
    else:
        # Normal user interaction - reset counter
        st.session_state.boot_count = 1
    st.session_state._last_boot_time = _now
    if st.session_state.boot_count > 15:
        st.error("Rerun loop detected! App has rerun more than 15 times in rapid succession.")
        st.stop()

# ============================================================================
# CHART THEME FUNCTION & COLORSCALES
# ============================================================================


COLORSCALES = {
    "viridis": px.colors.sequential.Viridis,
    "plasma": px.colors.sequential.Plasma,
    "turbo": px.colors.sequential.Turbo,
    "rdylgn": px.colors.diverging.RdYlGn,
    "spectral": px.colors.diverging.Spectral,
}


# ============================================================================
# CONSTANTS & CONFIG - Now imported from app.config
# ============================================================================

# ============================================================================
# MARKET DATA DICTIONARIES - Extracted to data/instruments.py (Phase 2)
# ============================================================================
from data.instruments import (
    GLOBAL_INDICES, CRYPTOCURRENCIES, FX_PAIRS, BOND_YIELDS,
    CREDIT_SPREADS, COMMODITIES, POPULAR_STOCKS, POPULAR_ETFS,
    FACTOR_DEFINITIONS, ETF_SECTORS
)

# ============================================================
# Phase 4: Core module imports (re-exported for backward compat)
# ============================================================
from core.data_loading import *  # noqa: F401,F403
from core.fetchers import *  # noqa: F401,F403
from core.calculations import *  # noqa: F401,F403
from core.charts import *  # noqa: F401,F403
from core.optimizers import *  # noqa: F401,F403


# ============================================================================
# HELPER FUNCTIONS - format_currency, format_percentage, format_large_number,
# add_arrow_indicator now imported from utils/formatting.py
# ============================================================================





# ============================================================================
# PROFESSIONAL ENHANCEMENTS - ATLAS v9.4 EXCELLENCE EDITION
# ============================================================================


# Constants (VALUATION_CONSTRAINTS, EXPERT_WISDOM_RULES, etc.) moved to core/constants.py
# Functions (get_benchmark_sector_returns, etc.) moved to core/data_loading.py


class InvestopediaIntegration:
    """
    Investopedia Paper Trading API Integration - TWO-STAGE AUTHENTICATION

    FIXED: Proper 2FA flow with Selenium
    - Stage 1: Login with email/password → triggers 2FA email
    - Stage 2: Submit 2FA code after user receives it
    - Live portfolio scraping after authentication
    """

    def __init__(self, email="davenompozolo@gmail.com"):
        self.email = email
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
            import os

            # Check if ChromeDriver is installed, install if missing
            if not os.path.exists('/usr/bin/chromedriver'):
                st.info("📦 Installing Chrome/ChromeDriver for Colab...")
                try:
                    subprocess.run(['apt-get', 'update'], check=True, capture_output=True)
                    subprocess.run(['apt-get', 'install', '-y', 'chromium-chromedriver'], check=True, capture_output=True)
                    subprocess.run(['cp', '/usr/lib/chromium-browser/chromedriver', '/usr/bin'], check=True, capture_output=True)
                    subprocess.run(['chmod', '+x', '/usr/bin/chromedriver'], check=True, capture_output=True)
                    st.success("✅ ChromeDriver installed successfully!")
                except Exception as e:
                    st.warning(f"⚠️ ChromeDriver installation failed: {e}")

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
                    'message': '✓ Login successful! Check your email for the 2FA code.'
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
                    'message': '✓ Authentication complete! You can now sync your portfolio.'
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
            st.warning("⚠️ Please authenticate first")
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
                st.success(f"✅ Successfully scraped {len(positions)} positions from Investopedia")
                return pd.DataFrame(positions)
            else:
                st.info("📊 Portfolio is empty or no positions found")
                return pd.DataFrame()

        except Exception as e:
            st.error(f"❌ Portfolio scraping error: {str(e)}")
            if self.driver:
                self.driver.quit()
                self.driver = None
            return None

    def cleanup(self):
        """Cleanup driver resources"""
        if self.driver:
            self.driver.quit()
            self.driver = None


class StochasticEngine:
    """
    Advanced Stochastic Modeling using Geometric Brownian Motion
    - Monte Carlo simulations with 10,000+ paths
    - Correlated asset movements
    - VaR/CVaR risk metrics
    """

    def __init__(self, tickers, returns_data=None):
        self.tickers = tickers
        self.returns_data = returns_data
        self.mu = None
        self.cov = None

        if returns_data is not None:
            self.mu = returns_data.mean().values
            self.cov = returns_data.cov().values

    def geometric_brownian_motion(self, S0, mu, sigma, T, dt, n_paths):
        """
        Generate price paths using Geometric Brownian Motion

        dS_t = μ * S_t * dt + σ * S_t * dW_t

        where:
        - S_t = stock price at time t
        - μ = drift (expected return)
        - σ = volatility
        - dW_t = Wiener process (random walk)
        """
        n_steps = int(T / dt)
        paths = np.zeros((n_paths, n_steps))
        paths[:, 0] = S0

        for t in range(1, n_steps):
            Z = np.random.standard_normal(n_paths)
            paths[:, t] = paths[:, t-1] * np.exp(
                (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * Z
            )

        return paths

    def monte_carlo_simulation(self, weights, S0_values, n_scenarios=10000, T=252):
        """
        Run full portfolio Monte Carlo simulation

        Returns:
        - portfolio_paths: simulated portfolio values over time
        - returns_dist: distribution of portfolio returns
        - metrics: VaR 95%, CVaR 95%, Expected Return, Volatility
        """
        dt = 1 / 252  # Daily time step
        n_assets = len(self.tickers)
        n_steps = T

        # Generate correlated random numbers using Cholesky decomposition
        L = np.linalg.cholesky(self.cov)

        # Initialize paths for each asset
        asset_paths = np.zeros((n_scenarios, n_steps, n_assets))

        for i in range(n_assets):
            asset_paths[:, 0, i] = S0_values[i]

        # Simulate paths
        for t in range(1, n_steps):
            Z = np.random.standard_normal((n_scenarios, n_assets))
            Z_corr = Z @ L.T

            for i in range(n_assets):
                asset_paths[:, t, i] = asset_paths[:, t-1, i] * np.exp(
                    (self.mu[i] - 0.5 * self.cov[i, i]) * dt +
                    np.sqrt(self.cov[i, i] * dt) * Z_corr[:, i]
                )

        # Calculate portfolio values
        portfolio_paths = np.sum(asset_paths * weights, axis=2)

        # Calculate returns distribution
        final_returns = (portfolio_paths[:, -1] - portfolio_paths[:, 0]) / portfolio_paths[:, 0]

        # Calculate risk metrics
        var_95 = np.percentile(final_returns, 5)
        cvar_95 = final_returns[final_returns <= var_95].mean()
        expected_return = final_returns.mean()
        volatility = final_returns.std()

        metrics = {
            'VaR 95%': var_95,
            'CVaR 95%': cvar_95,
            'Expected Return': expected_return,
            'Volatility': volatility
        }

        return portfolio_paths, final_returns, metrics


class QuantOptimizer:
    """
    Advanced Portfolio Optimization using Multivariable Calculus
    - Analytical gradient calculation: ∂Sharpe/∂w_i
    - SLSQP optimization with Jacobian matrix
    - Maximum Sharpe Ratio objective
    - Leverage constraints
    """

    def __init__(self, returns_data, risk_free_rate=0.04):
        self.returns = returns_data
        self.mu = returns_data.mean().values * 252  # Annualized
        self.cov = returns_data.cov().values * 252  # Annualized
        self.rf = risk_free_rate
        self.n_assets = len(self.mu)

    def portfolio_metrics(self, weights):
        """Calculate portfolio return and volatility"""
        ret = np.dot(weights, self.mu)
        vol = np.sqrt(np.dot(weights, np.dot(self.cov, weights)))
        return ret, vol

    def sharpe_ratio(self, weights):
        """Calculate Sharpe Ratio"""
        ret, vol = self.portfolio_metrics(weights)
        return (ret - self.rf) / vol if vol != 0 else 0

    def negative_sharpe(self, weights):
        """Negative Sharpe for minimization"""
        return -self.sharpe_ratio(weights)

    def sharpe_gradient(self, weights):
        """
        Analytical gradient of Sharpe Ratio

        ∂Sharpe/∂w_i = (1/σ_p) * [∂r_p/∂w_i - Sharpe * ∂σ_p/∂w_i]

        where:
        - ∂r_p/∂w_i = μ_i (partial derivative of return)
        - ∂σ_p/∂w_i = (Σ*w)_i / σ_p (partial derivative of volatility)
        """
        ret, vol = self.portfolio_metrics(weights)

        if vol == 0:
            return np.zeros(self.n_assets)

        sharpe = self.sharpe_ratio(weights)

        # Volatility gradient: ∂σ_p/∂w_i = (Σ*w)_i / σ_p
        vol_grad = np.dot(self.cov, weights) / vol

        # Return gradient: ∂r_p/∂w_i = μ_i
        ret_grad = self.mu

        # Sharpe gradient: ∂Sharpe/∂w_i = (1/σ_p) * [μ_i - Sharpe * (Σ*w)_i/σ_p]
        sharpe_grad = (1 / vol) * (ret_grad - sharpe * vol_grad)

        return -sharpe_grad  # Negative for minimization

    def optimize_max_sharpe(self, min_weight=0.01, max_weight=0.40):
        """
        Optimize portfolio using SLSQP with analytical Jacobian

        Constraints:
        - Sum of weights = 1
        - Min/max weight bounds
        """
        from scipy.optimize import minimize

        # Initial guess (equal weights)
        w0 = np.ones(self.n_assets) / self.n_assets

        # Constraints
        constraints = [
            {'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0}  # Sum to 1
        ]

        # Bounds
        bounds = tuple((min_weight, max_weight) for _ in range(self.n_assets))

        # Optimize using SLSQP with analytical gradient
        result = minimize(
            fun=self.negative_sharpe,
            x0=w0,
            method='SLSQP',
            jac=self.sharpe_gradient,  # Analytical gradient
            bounds=bounds,
            constraints=constraints,
            options={'maxiter': 1000, 'ftol': 1e-9}
        )

        optimal_weights = result.x
        optimal_sharpe = self.sharpe_ratio(optimal_weights)

        return optimal_weights, optimal_sharpe, result

    def generate_rebalancing_plan(self, optimal_weights, portfolio_data, currency_symbol='$'):
        """
        Generate detailed rebalancing plan with BUY/SELL/HOLD actions.

        Args:
            optimal_weights: Optimal portfolio weights from optimization
            portfolio_data: Current portfolio DataFrame
            currency_symbol: Currency symbol for display

        Returns:
            tuple: (rebalancing_df, metrics_dict)
        """
        # Detect ticker column name
        ticker_column = 'Symbol' if 'Symbol' in portfolio_data.columns else 'Ticker'

        # Get tickers from returns data (this is what was optimized)
        optimized_tickers = list(self.returns.columns)

        # Filter portfolio data to only include optimized tickers
        portfolio_data = portfolio_data[portfolio_data[ticker_column].isin(optimized_tickers)].copy()

        # Calculate current portfolio value and weights
        if 'Quantity' in portfolio_data.columns and 'Current Price' in portfolio_data.columns:
            portfolio_data['Total Value'] = portfolio_data['Quantity'] * portfolio_data['Current Price']
        elif 'Total Value' not in portfolio_data.columns:
            # Fallback: use market value if available
            if 'Market Value' in portfolio_data.columns:
                portfolio_data['Total Value'] = portfolio_data['Market Value']
            else:
                # Cannot generate rebalancing plan without position values
                return None, None

        total_portfolio_value = portfolio_data['Total Value'].sum()
        portfolio_data['Current Weight'] = portfolio_data['Total Value'] / total_portfolio_value

        # Build rebalancing dataframe
        rebalancing_data = []
        total_buy_value = 0
        total_sell_value = 0

        for i, ticker in enumerate(optimized_tickers):
            # Get current position data
            ticker_data = portfolio_data[portfolio_data[ticker_column] == ticker]

            if ticker_data.empty:
                # New position to add
                current_weight = 0
                current_value = 0
                current_shares = 0
                current_price = 0  # Would need to fetch
            else:
                current_weight = ticker_data['Current Weight'].values[0]
                current_value = ticker_data['Total Value'].values[0]
                current_shares = ticker_data['Quantity'].values[0] if 'Quantity' in ticker_data.columns else 0
                current_price = ticker_data['Current Price'].values[0] if 'Current Price' in ticker_data.columns else 0

            # Optimal position
            optimal_weight = optimal_weights[i]
            optimal_value = optimal_weight * total_portfolio_value
            weight_diff = optimal_weight - current_weight

            # Calculate trade details
            if current_price > 0:
                optimal_shares = optimal_value / current_price
                shares_to_trade = optimal_shares - current_shares
                trade_value = shares_to_trade * current_price
            else:
                optimal_shares = 0
                shares_to_trade = 0
                trade_value = 0

            # Determine action (only flag if trade is meaningful > $100 or > 5 shares)
            if abs(trade_value) > 100 or abs(shares_to_trade) > 5:
                if shares_to_trade > 0:
                    action = 'BUY'
                    total_buy_value += abs(trade_value)
                else:
                    action = 'SELL'
                    total_sell_value += abs(trade_value)
            else:
                action = 'HOLD'

            rebalancing_data.append({
                'Ticker': ticker,
                'Current Weight (%)': current_weight * 100,
                'Optimal Weight (%)': optimal_weight * 100,
                'Weight Diff (%)': weight_diff * 100,
                'Current Shares': int(current_shares),
                'Target Shares': int(optimal_shares),
                'Shares to Trade': int(shares_to_trade),
                'Trade Value': trade_value,
                'Action': action,
                'Priority': abs(trade_value)  # For sorting
            })

        rebalancing_df = pd.DataFrame(rebalancing_data)
        rebalancing_df = rebalancing_df.sort_values('Priority', ascending=False)

        # Calculate metrics
        buy_trades = len(rebalancing_df[rebalancing_df['Action'] == 'BUY'])
        sell_trades = len(rebalancing_df[rebalancing_df['Action'] == 'SELL'])
        hold_positions = len(rebalancing_df[rebalancing_df['Action'] == 'HOLD'])

        # Estimate trading costs (assume 0.1% per trade)
        trading_cost = (total_buy_value + total_sell_value) * 0.001

        metrics = {
            'total_portfolio_value': total_portfolio_value,
            'buy_trades': buy_trades,
            'sell_trades': sell_trades,
            'hold_positions': hold_positions,
            'total_buy_value': total_buy_value,
            'total_sell_value': total_sell_value,
            'estimated_trading_cost': trading_cost,
            'total_trades': buy_trades + sell_trades,
            'turnover_pct': (total_buy_value + total_sell_value) / (2 * total_portfolio_value) * 100 if total_portfolio_value > 0 else 0
        }

        return rebalancing_df, metrics


class EnhancedDCFEngine:
    """
    Advanced DCF Valuation with WACC and FCF projections
    - WACC calculation using CAPM
    - 5-year FCF projections
    - Terminal value calculation
    - Sensitivity analysis
    """

    def __init__(self, ticker):
        self.ticker = ticker
        self.stock = yf.Ticker(ticker)
        self.info = self.stock.info

    def calculate_wacc(self, risk_free=0.04, market_return=0.10):
        """
        Calculate Weighted Average Cost of Capital

        WACC = (E/V) * Re + (D/V) * Rd * (1-T)

        where:
        - Re = Cost of Equity = Rf + β * (Rm - Rf)  [CAPM]
        - Rd = Cost of Debt
        - E = Market value of equity
        - D = Market value of debt
        - V = E + D
        - T = Tax rate
        """
        info = self.info

        # Get values from info
        market_cap = info.get('marketCap', 0)
        total_debt = info.get('totalDebt', 0)
        beta = info.get('beta', 1.0)

        # Calculate cost of equity using CAPM
        re = risk_free + beta * (market_return - risk_free)

        # Cost of debt (simplified)
        interest_expense = info.get('interestExpense', 0)
        rd = abs(interest_expense) / total_debt if total_debt > 0 else 0.05

        # Tax rate
        tax_rate = info.get('effectiveTaxRate', 0.21)

        # Total value
        total_value = market_cap + total_debt

        if total_value == 0:
            return None

        # Calculate WACC
        wacc = (market_cap / total_value) * re + (total_debt / total_value) * rd * (1 - tax_rate)

        return {
            'WACC': wacc,
            'Cost of Equity': re,
            'Cost of Debt': rd,
            'Market Cap': market_cap,
            'Total Debt': total_debt,
            'Tax Rate': tax_rate,
            'Beta': beta
        }

    def calculate_enterprise_value(self, terminal_growth=0.03):
        """
        Calculate Enterprise Value using DCF

        EV = PV(FCF_1) + PV(FCF_2) + ... + PV(FCF_5) + PV(Terminal Value)

        Terminal Value = FCF_5 * (1 + g) / (WACC - g)
        """
        wacc_data = self.calculate_wacc()
        if wacc_data is None:
            return None

        wacc = wacc_data['WACC']

        # Get current free cash flow
        cash_flow = self.stock.cashflow
        if cash_flow.empty:
            return None

        fcf = cash_flow.loc['Free Cash Flow'].iloc[0] if 'Free Cash Flow' in cash_flow.index else 0

        if fcf <= 0:
            return None

        # Project 5 years of FCF (assuming 5% annual growth)
        fcf_growth = 0.05
        fcf_projections = []

        for year in range(1, 6):
            projected_fcf = fcf * ((1 + fcf_growth) ** year)
            pv_fcf = projected_fcf / ((1 + wacc) ** year)
            fcf_projections.append({
                'Year': year,
                'FCF': projected_fcf,
                'PV of FCF': pv_fcf
            })

        # Terminal value
        fcf_terminal = fcf_projections[-1]['FCF'] * (1 + terminal_growth)
        terminal_value = fcf_terminal / (wacc - terminal_growth)
        pv_terminal = terminal_value / ((1 + wacc) ** 5)

        # Enterprise Value
        pv_fcf_sum = sum([p['PV of FCF'] for p in fcf_projections])
        enterprise_value = pv_fcf_sum + pv_terminal

        # Equity value
        total_debt = wacc_data['Total Debt']
        cash = self.info.get('totalCash', 0)
        equity_value = enterprise_value - total_debt + cash

        # Shares outstanding
        shares_outstanding = self.info.get('sharesOutstanding', 1)
        fair_value_per_share = equity_value / shares_outstanding

        return {
            'FCF Projections': fcf_projections,
            'Terminal Value': terminal_value,
            'PV Terminal Value': pv_terminal,
            'Enterprise Value': enterprise_value,
            'Equity Value': equity_value,
            'Fair Value per Share': fair_value_per_share,
            'WACC': wacc
        }


class MultiSourceDataBroker:
    """
    Multi-Source Data Integration
    - Yahoo Finance (primary)
    - Alpha Vantage
    - Bloomberg (framework ready)
    """

    def __init__(self, alpha_vantage_key=None, bloomberg_available=False):
        self.alpha_vantage_key = alpha_vantage_key
        self.bloomberg_available = bloomberg_available

    def get_price_data(self, ticker, source='yahoo', period='1y'):
        """Get price data from specified source"""

        if source == 'yahoo':
            try:
                # Import ticker conversion utility
                from modules import convert_ee_ticker_to_yahoo

                # Convert Easy Equities ticker to Yahoo Finance format
                yahoo_ticker = convert_ee_ticker_to_yahoo(ticker)

                # Fetch data with converted ticker
                data = yf.download(yahoo_ticker, period=period, progress=False)

                # Add metadata
                if not data.empty:
                    data.attrs['original_ticker'] = ticker
                    data.attrs['yahoo_ticker'] = yahoo_ticker

                return data
            except Exception as e:
                st.error(f"Yahoo Finance error for {ticker}: {str(e)}")
                return None

        elif source == 'alpha_vantage' and self.alpha_vantage_key:
            try:
                import requests
                url = f"https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol={ticker}&apikey={self.alpha_vantage_key}&outputsize=full"
                response = requests.get(url)
                data = response.json()

                # Convert to DataFrame format similar to yfinance
                # (Placeholder - would need full implementation)
                st.info("Alpha Vantage integration ready")
                return None

            except Exception as e:
                st.error(f"Alpha Vantage error: {str(e)}")
                return None

        elif source == 'bloomberg' and self.bloomberg_available:
            # Placeholder for Bloomberg Terminal integration
            st.info("Bloomberg Terminal integration framework ready")
            return None

        else:
            st.warning(f"Source '{source}' not available")
            return None

    def get_multi_source_data(self, ticker, sources=['yahoo']):
        """Fetch data from multiple sources and aggregate"""
        data_dict = {}

        for source in sources:
            data = self.get_price_data(ticker, source=source)
            if data is not None:
                data_dict[source] = data

        return data_dict


# ============================================================================
# MAIN APP - EXCELLENCE EDITION
# ============================================================================

def main():
    print("[MAIN] ====== ENTERED main() ======", flush=True)
    import time as _t
    _main_start = _t.time()

    # ========================================================================
    # HEALTH CHECK ENDPOINT - Proves app can render without loading data
    # Test with: https://your-app.streamlit.app/?health=check
    # ========================================================================
    try:
        if st.query_params.get('health') == 'check':
            st.set_page_config  # already called at module level
            st.success("ATLAS is healthy!")
            st.write(f"Time: {datetime.now()}")
            st.write(f"Python: {sys.version}")
            st.write(f"Socket timeout: {socket.getdefaulttimeout()}s")
            print(f"[MAIN] Health check served ({_t.time() - _main_start:.2f}s)", flush=True)
            return  # Exit early, don't load anything else
    except Exception:
        pass  # query_params may not be available in all Streamlit versions

    # ============================================================================
    # EQUITY TRACKING INITIALIZATION - CRITICAL FIX FOR LEVERAGE CALCULATIONS
    # ============================================================================
    # Initialize equity tracking from performance history if available
    print(f"[MAIN] Initializing session state... ({_t.time() - _main_start:.2f}s)", flush=True)
    if 'equity_capital' not in st.session_state:
        # Try to get equity from performance history first
        metrics = get_current_portfolio_metrics()
        if metrics and metrics.get('equity', 0) > 0:
            st.session_state['equity_capital'] = metrics['equity']
        else:
            st.session_state['equity_capital'] = 100000.0  # Default $100k

    if 'target_leverage' not in st.session_state:
        st.session_state['target_leverage'] = 1.0  # Default no leverage
    print(f"[MAIN] Session state done ({_t.time() - _main_start:.2f}s)", flush=True)

    # ============================================================================
    # ATLAS TERMINAL HEADER - FIGMA REDESIGN (JetBrains Mono)
    # ============================================================================

    def render_atlas_header():
        """FIGMA REDESIGN: Clean header with JetBrains Mono typography."""
        # Single-line styles to fix Streamlit HTML parsing
        st.markdown("""<style>@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');</style><div style="background: rgba(15, 18, 35, 0.45); backdrop-filter: blur(24px) saturate(160%); -webkit-backdrop-filter: blur(24px) saturate(160%); border-radius: 16px; border: 1px solid rgba(99, 102, 241, 0.12); padding: 2rem 2.5rem; margin-bottom: 0.75rem; box-shadow: 0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04); position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between;"><div style="position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, #6366f1, #818cf8, #8b5cf6); opacity: 0.6;"></div><div style="display: flex; align-items: center; gap: 1.25rem;"><div style="width: 4rem; height: 4rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 0.75rem; display: flex; align-items: center; justify-content: center;"><span style="font-family: 'JetBrains Mono', monospace; font-size: 2rem; font-weight: 700; color: #a5b4fc; text-shadow: 0 0 20px rgba(99, 102, 241, 0.4);">A</span></div><div><div style="font-family: 'JetBrains Mono', monospace; font-size: 2.25rem; font-weight: 600; color: #a5b4fc; margin: 0; letter-spacing: 0.05em; line-height: 1.2; text-shadow: 0 0 30px rgba(99, 102, 241, 0.25);">ATLAS TERMINAL</div></div></div><div style="text-align: right;"><div style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #64748b; margin: 0; line-height: 1.4;">Institutional Intelligence.</div><div style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #64748b; margin: 0; line-height: 1.4;">Personal Scale.</div></div></div>""", unsafe_allow_html=True)

    def render_data_source_cards():
        """FIGMA REDESIGN: Clickable cards for data source selection."""
        if 'portfolio_data_source_mode' not in st.session_state:
            st.session_state['portfolio_data_source_mode'] = "📁 Classic Mode (Excel Upload)"

        sources = [
            {"key": "📁 Classic Mode (Excel Upload)", "icon": "📁", "title": "Classic Mode", "desc": "Upload Excel files"},
            {"key": "🔗 Easy Equities (Live Sync)", "icon": "🔗", "title": "Easy Equities", "desc": "Live broker sync"},
            {"key": "🦙 Alpaca Markets (Live Sync)", "icon": "🦙", "title": "Alpaca Markets", "desc": "Live broker sync"}
        ]

        cols = st.columns(3)
        for i, source in enumerate(sources):
            with cols[i]:
                is_selected = st.session_state['portfolio_data_source_mode'] == source['key']
                border_color = "rgba(34, 211, 238, 0.5)" if is_selected else "rgb(31, 41, 55)"
                bg_color = "rgba(34, 211, 238, 0.1)" if is_selected else "transparent"

                if st.button(f"{source['icon']} {source['title']}", key=f"src_{i}", use_container_width=True):
                    st.session_state['portfolio_data_source_mode'] = source['key']
                    st.rerun()

                st.markdown(f"""<div style="text-align: center; padding: 0.5rem; background: {bg_color}; border: 1px solid {border_color}; border-radius: 0.5rem; margin-top: -0.5rem;"><p style="font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: rgb(156, 163, 175); margin: 0;">{source['desc']}</p></div>""", unsafe_allow_html=True)

        return st.session_state['portfolio_data_source_mode']

    # Call the header function
    print(f"[MAIN] Rendering header... ({_t.time() - _main_start:.2f}s)", flush=True)
    render_atlas_header()
    print(f"[MAIN] Header done ({_t.time() - _main_start:.2f}s)", flush=True)

    # ============================================================================
    # CAPITAL SETTINGS - Auto-populated from session state (UI removed for cleaner homepage)
    # ============================================================================
    # Capital settings now auto-populated from performance history (guarded to prevent rerun loop)
    if 'equity_capital' not in st.session_state:
        metrics = get_current_portfolio_metrics()
        if metrics and metrics.get('equity', 0) > 0:
            st.session_state['equity_capital'] = metrics['equity']
            st.session_state['target_leverage'] = metrics.get('leverage', 1.0)
        else:
            st.session_state['equity_capital'] = 100000.0
            st.session_state['target_leverage'] = 1.0

    # ============================================================================
    # PHASE 1B: VERTICAL SIDEBAR NAVIGATION
    # ============================================================================
    print(f"[MAIN] Building sidebar navigation... ({_t.time() - _main_start:.2f}s)", flush=True)
    try:
        page = render_sidebar_navigation(default_page="Portfolio Home")
    except Exception as e:
        print(f"[MAIN] ERROR in sidebar navigation: {e}", flush=True)
        # Fallback sidebar if render_sidebar_navigation fails
        with st.sidebar:
            page = st.radio("Navigation", ["Portfolio Home", "Phoenix Parser", "Market Watch", "Stock Screener", "Valuation House"], label_visibility="collapsed")
    print(f"[MAIN] Sidebar done, selected page: {page} ({_t.time() - _main_start:.2f}s)", flush=True)

    # ========================================================================
    # PHASE 2A: NAVIGATION ROUTING (Registry-Based)
    # ========================================================================
    # Map option_menu titles to registry keys
    PAGE_TITLE_TO_KEY = {
        "🔥 Phoenix Parser": "phoenix_parser",
        "🏠 Portfolio Home": "portfolio_home",
        "🚀 v10.0 Analytics": "v10_analytics",
        "📊 R Analytics": "r_analytics",
        "💾 Database": "database",
        "🌍 Market Watch": "market_watch",
        "📈 Risk Analysis": "risk_analysis",
        "💎 Performance Suite": "performance_suite",
        "🔬 Portfolio Deep Dive": "portfolio_deep_dive",
        "📊 Multi-Factor Analysis": "multi_factor_analysis",
        "💰 Valuation House": "valuation_house",
        "🎲 Monte Carlo Engine": "monte_carlo_engine",
        "🌐 Market Regime": "market_regime",
        "🧮 Quant Optimizer": "quant_optimizer",
        "📊 Leverage Tracker": "leverage_tracker",
        "📡 Investopedia Live": "investopedia_live",
        "ℹ️ About": "about"
    }

    # Get page key from selected title
    selected_page_key = PAGE_TITLE_TO_KEY.get(page, "portfolio_home")

    # ============================================================================
    # SIDEBAR SETTINGS - Time Range and Benchmark controls
    # ============================================================================
    with st.sidebar:
        st.markdown("---")
        st.markdown("### ⚙️ Settings")

        # Time Range Selector
        date_options = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "MAX"]
        selected_range = st.selectbox(
            "📅 Time Range",
            date_options,
            index=6,  # Default to "1Y"
            key="sidebar_time_range"
        )

        # Benchmark Selector
        benchmark_options = ["SPY", "QQQ", "DIA", "IWM", "VTI", "ACWI"]
        selected_benchmark = st.selectbox(
            "🎯 Benchmark",
            benchmark_options,
            index=0,  # Default to "SPY"
            key="sidebar_benchmark"
        )

        # Store in session state for use throughout app
        st.session_state['selected_range'] = selected_range
        st.session_state['selected_benchmark'] = selected_benchmark

        # Alpha Vantage API Status Widget
        try:
            from core.alpha_vantage import av_client, ALPHA_VANTAGE_AVAILABLE, FREE_TIER_DAILY_LIMIT
            if ALPHA_VANTAGE_AVAILABLE and av_client is not None:
                st.markdown("---")
                with st.expander("📡 Alpha Vantage API", expanded=False):
                    usage_stats = av_client.get_usage_stats()
                    calls_today = usage_stats.get('api_calls_today', 0)
                    daily_limit = FREE_TIER_DAILY_LIMIT
                    usage_pct = min(calls_today / daily_limit, 1.0) if daily_limit > 0 else 0

                    st.progress(usage_pct)
                    st.caption(f"API Calls: {calls_today}/{daily_limit} today")

                    cache_entries = usage_stats.get('cached_items', 0)
                    st.caption(f"Cache: {cache_entries} entries")

                    if st.button("🗑️ Clear Cache", key="av_clear_cache", use_container_width=True):
                        st.session_state["confirm_clear_av"] = True

                    if st.session_state.get("confirm_clear_av"):
                        st.warning("This will use API calls on next load. Confirm?")
                        conf_col1, conf_col2 = st.columns(2)
                        with conf_col1:
                            if st.button("Yes, clear", key="av_confirm_yes"):
                                av_client.cache.clear_all()
                                st.session_state["confirm_clear_av"] = False
                                st.success("Cache cleared!")
                                st.rerun()
                        with conf_col2:
                            if st.button("Cancel", key="av_confirm_no"):
                                st.session_state["confirm_clear_av"] = False
                                st.rerun()
        except Exception:
            pass  # Silently skip if Alpha Vantage not configured

    # Calculate date range based on selection
    if selected_range == "YTD":
        start_date = datetime(datetime.now().year, 1, 1)
        end_date = datetime.now()
    elif selected_range == "MAX":
        start_date = datetime(2000, 1, 1)
        end_date = datetime.now()
    else:
        days_map = {"1D": 1, "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "3Y": 1095, "5Y": 1825}
        days = days_map.get(selected_range, 365)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
    
    # ========================================================================
    # PHASE 2A: NAVIGATION V2 ROUTING (Experimental - can be toggled)
    # ========================================================================
    # Toggle between old monolithic routing and new modular navigation
    USE_NAVIGATION_V2 = st.sidebar.checkbox(
        "🧪 Use Navigation v2.0 (Experimental)",
        value=False,
        help="Enable new modular navigation system (Phase 2A)",
        key="nav_v2_toggle"
    )

    print(f"[MAIN] About to render page: {page} (v2={USE_NAVIGATION_V2}) ({_t.time() - _main_start:.2f}s)", flush=True)

    if USE_NAVIGATION_V2:
        # NEW: Registry-based routing
        st.info(f"📍 **Navigation v2.0 Active** - Routing to: `{selected_page_key}`")
        route_to_page(selected_page_key)

    else:
        # OLD: Monolithic if/elif routing (will be deprecated after Phase 2A testing)
        pass  # Fall through to old code below

    # ========================================================================
    # OLD NAVIGATION CODE (To be deprecated after Phase 2A complete)
    # ========================================================================
    if not USE_NAVIGATION_V2:  # Only run old code if v2 is disabled
      try:
        # ====================================================================
        # PHOENIX PARSER
        # ====================================================================
        if page == "🔥 Phoenix Parser":
            from ui.pages.phoenix_parser import render_phoenix_parser
            render_phoenix_parser()

        # ========================================================================
        # v10.0 ANALYTICS - NEW ADVANCED FEATURES
        # ========================================================================
        elif page == "🚀 v10.0 Analytics":
            from ui.pages.v10_analytics import render_v10_analytics
            render_v10_analytics()

        # ========================================================================
        # R ANALYTICS - ADVANCED QUANT MODELS (v11.0)
        # ========================================================================
        elif page == "📊 R Analytics":
            from ui.pages.r_analytics import render_r_analytics
            render_r_analytics()

        # ========================================================================
        # DATABASE PAGE - PROFESSIONAL SQL INTERFACE
        # ========================================================================
        elif page == "💾 Database":
            from ui.pages.database import render_database
            render_database()

        # ========================================================================
        # PORTFOLIO HOME - ENHANCED WITH CONTRIBUTORS/DETRACTORS
        # ========================================================================
        elif page == "🏠 Portfolio Home":
            print(f"[MAIN] Rendering Portfolio Home... ({_t.time() - _main_start:.2f}s)", flush=True)
            from ui.pages.portfolio_home import render_portfolio_home
            render_portfolio_home(start_date, end_date)
            print(f"[MAIN] Portfolio Home complete ({_t.time() - _main_start:.2f}s)", flush=True)

        # ========================================================================
        # RISK ANALYSIS - WORLD CLASS
        # ========================================================================
        elif page == "📈 Risk Analysis":

            from ui.pages.risk_analysis import render_risk_analysis

            render_risk_analysis(start_date, end_date, selected_benchmark)



        # Continue with remaining pages...
        # ========================================================================
        # PERFORMANCE SUITE
        # ========================================================================
        elif page == "💎 Performance Suite":

            from ui.pages.performance_suite import render_performance_suite

            render_performance_suite(start_date, end_date, selected_benchmark)



        # ========================================================================
        # PORTFOLIO DEEP DIVE - ENHANCED
        # ========================================================================
        elif page == "🔬 Portfolio Deep Dive":

            from ui.pages.portfolio_deep_dive import render_portfolio_deep_dive

            render_portfolio_deep_dive(start_date, end_date)



        # ========================================================================
        # MULTI-FACTOR ANALYSIS - ENHANCED
        # ========================================================================
        elif page == "📊 Multi-Factor Analysis":

            from ui.pages.multi_factor_analysis import render_multi_factor_analysis

            render_multi_factor_analysis(start_date, end_date)



        # ========================================================================
        # VALUATION HOUSE - ENHANCED WITH SMART ASSUMPTIONS
        # ========================================================================
        elif page == "💰 Valuation House":

            from ui.pages.valuation_house import render_valuation_house

            render_valuation_house(start_date, end_date)



        # ========================================================================
        # MONTE CARLO ENGINE (v11.0)
        # ========================================================================
        elif page == "🎲 Monte Carlo Engine":

            from ui.pages.monte_carlo import render_monte_carlo

            render_monte_carlo()



        # ========================================================================
        # MARKET WATCH (ATLAS Market Watch Integration)
        # ========================================================================
        elif page == "🌍 Market Watch":
            print(f"[MAIN] Rendering Market Watch... ({_t.time() - _main_start:.2f}s)", flush=True)
            from ui.pages.market_watch import render_market_watch
            render_market_watch()
            print(f"[MAIN] Market Watch complete ({_t.time() - _main_start:.2f}s)", flush=True)



        # ========================================================================
        # MARKET REGIME DETECTOR (Phase 2)
        # ========================================================================
        elif page == "🌐 Market Regime":

            from ui.pages.market_regime import render_market_regime

            render_market_regime()




        # ========================================================================
        # QUANT OPTIMIZER (v11.0)
        # ========================================================================
        elif page == "🧮 Quant Optimizer":

            from ui.pages.quant_optimizer import render_quant_optimizer

            render_quant_optimizer(start_date, end_date, selected_benchmark)



        # ========================================================================
        # LEVERAGE TRACKER (v11.0) - NEW FEATURE
        # ========================================================================
        elif page == "📊 Leverage Tracker":
            from ui.pages.leverage_tracker import render_leverage_tracker
            render_leverage_tracker(start_date, end_date)

        # ========================================================================
        # INVESTOPEDIA LIVE (v11.0) - FIXED TWO-STAGE AUTH
        # ========================================================================
        elif page == "📡 Investopedia Live":
            from ui.pages.investopedia_live import render_investopedia_live
            render_investopedia_live()

        # ========================================================================
        # ABOUT
        # ========================================================================
        elif page == "ℹ️ About":
            from ui.pages.about import render_about
            render_about()

      except Exception as _page_error:
        import traceback
        print(f"[MAIN] PAGE ERROR: {type(_page_error).__name__}: {_page_error}", flush=True)
        st.error(f"**Page Error:** {type(_page_error).__name__}: {_page_error}")
        with st.expander("Full Traceback", expanded=False):
            st.code(traceback.format_exc())

    print(f"[MAIN] ====== main() COMPLETE ({_t.time() - _main_start:.2f}s) ======", flush=True)


# ============================================================================
# RUN THE APP - Guard against circular imports
# ============================================================================
# When page modules import from atlas_app, we don't want to re-run main()
# Use environment variable to track if main() is already running
# (env vars persist across module imports within same process)
import os as _os_guard
_ATLAS_MAIN_GUARD = '_ATLAS_MAIN_RUNNING'

if _os_guard.environ.get(_ATLAS_MAIN_GUARD) != '1':
    _os_guard.environ[_ATLAS_MAIN_GUARD] = '1'
    try:
        print("[BOOT] Calling main()...", flush=True)
        main()
        print("[BOOT] main() completed", flush=True)
    finally:
        # Clear the guard after main() completes (allows Streamlit reruns)
        _os_guard.environ.pop(_ATLAS_MAIN_GUARD, None)
else:
    print("[BOOT] Skipping main() - circular import detected", flush=True)
