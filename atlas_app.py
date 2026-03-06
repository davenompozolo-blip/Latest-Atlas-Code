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
# Read firm name from branding config (before Streamlit calls)
try:
    from config.branding import get_branding as _get_brand
    _page_title = _get_brand()["firm_name"]
except Exception:
    _page_title = "ATLAS Terminal"

st.set_page_config(
    page_title=_page_title,
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded",  # Phase 1B: Show vertical sidebar
)

# ============================================================================
# CSS/JS STYLING - Extracted to ui/atlas_css.py (Phase 1 Refactoring)
# ============================================================================
from ui.atlas_css import init_atlas_css
init_atlas_css()

# Background layers — real divs instead of ::before/::after pseudo-elements
# (pseudo-elements on .stApp sit on top of Streamlit content and obscure it)
st.markdown("""
<div class="atlas-bg-mesh"></div>
<div class="atlas-bg-grain"></div>
""", unsafe_allow_html=True)

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
    from services.atlas_broker_manager import BrokerManager, ManualPortfolioAdapter
    from services.atlas_broker_manager import display_manual_portfolio_editor
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
    from valuation.atlas_dcf_institutional import (
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
    from portfolio_tools.atlas_pm_optimization import (
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
    PMGradeOptimizer = None
    AsymmetricRiskOptimizer = None
    MarketRegimeDetector = None
    ForwardLookingReturns = None
    display_regime_analysis = None
    display_optimization_results = None
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
# FEATURE FLAGS → SESSION STATE (used by sidebar to hide unavailable pages)
# ============================================================================
st.session_state['r_available'] = R_AVAILABLE
st.session_state['sql_available'] = SQL_AVAILABLE

# ============================================================================
# HELPER FUNCTIONS FOR VALIDATION
# ============================================================================








# Formatting utilities - imported from utils/formatting.py
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


# ============================================================================
# GICS SECTOR CLASSIFICATION - Extracted to data/sectors.py (Phase 2)
# ============================================================================
from data.sectors import (
    GICS_SECTORS, GICS_SECTOR_MAPPING, STOCK_SECTOR_OVERRIDES, SPY_SECTOR_WEIGHTS,
    get_benchmark_sector_returns
)
















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
# Phase 4: Core module imports (explicit — wildcard removed)
# ============================================================
from core.data_loading import get_current_portfolio_metrics


# ============================================================================
# HELPER FUNCTIONS - format_currency, format_percentage, format_large_number,
# add_arrow_indicator now imported from utils/formatting.py
# ============================================================================





# ============================================================================
# PROFESSIONAL ENHANCEMENTS - ATLAS v9.4 EXCELLENCE EDITION
# ============================================================================


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

    # ============================================================================
    # ALPACA AUTO-SYNC — Initialize engine if credentials exist but engine doesn't
    # ============================================================================
    if '_alpaca_data_engine' not in st.session_state:
        # Check for stored credentials from prior connection or secrets.toml
        _auto_key = st.session_state.get('alpaca_api_key', '')
        _auto_secret = st.session_state.get('alpaca_secret_key', '')
        _auto_paper = st.session_state.get('alpaca_paper', True)

        # Also check secrets.toml
        if not _auto_key:
            try:
                _auto_key = st.secrets.get('alpaca_key', '')
                _auto_secret = st.secrets.get('alpaca_secret', '')
            except Exception:
                pass

        if _auto_key and _auto_secret:
            try:
                from alpaca_data_engine import AlpacaDataEngine
                _engine = AlpacaDataEngine(
                    api_key=_auto_key,
                    api_secret=_auto_secret,
                    paper=_auto_paper,
                )
                _engine.fetch_all(verbose=False)
                st.session_state['_alpaca_data_engine'] = _engine

                # Also set up the AlpacaAdapter for positions if not already set
                if 'alpaca_adapter' not in st.session_state:
                    try:
                        from atlas_alpaca_integration import AlpacaAdapter
                        _adapter = AlpacaAdapter(_auto_key, _auto_secret, paper=_auto_paper)
                        _success, _ = _adapter.test_connection()
                        if _success:
                            st.session_state['alpaca_adapter'] = _adapter
                            st.session_state['alpaca_configured'] = True
                            # Also fetch positions for portfolio_df
                            _pos_df = _adapter.get_positions()
                            if _pos_df is not None and not _pos_df.empty:
                                st.session_state['portfolio_df'] = _pos_df
                                st.session_state['portfolio_source'] = 'alpaca'
                                st.session_state['currency'] = 'USD'
                                st.session_state['currency_symbol'] = '$'
                    except Exception as _adapt_err:
                        print(f"[ATLAS] Auto-sync adapter failed: {_adapt_err}")

                # Update equity capital from engine
                if _engine.account_snapshot:
                    _eq = _engine.account_snapshot.get('equity', 0)
                    if _eq > 0:
                        st.session_state['equity_capital'] = _eq

                print(f"[ATLAS] Auto-sync complete: AlpacaDataEngine initialized ({_t.time() - _main_start:.2f}s)")
            except Exception as _auto_err:
                print(f"[ATLAS] Auto-sync failed: {_auto_err}")

    print(f"[MAIN] Session state done ({_t.time() - _main_start:.2f}s)", flush=True)

    # ============================================================================
    # ATLAS TERMINAL HEADER - FIGMA REDESIGN (JetBrains Mono)
    # ============================================================================

    def render_atlas_header():
        """Design spec: fixed top bar with cyan-to-violet gradient line."""
        st.markdown("""<div style="position: fixed; top: 0; left: 0; right: 0; height: 90px; z-index: 1000; background: linear-gradient(180deg, rgba(7,8,20,0.85) 0%, rgba(7,8,20,0.4) 80%, transparent 100%); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: none; display: flex; align-items: center; padding: 0 24px; box-shadow: 0 12px 40px rgba(7,8,20,0.45), 0 2px 0 rgba(0,212,255,0.03);"><div style="position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent 0%, rgba(0, 212, 255, 0.85) 25%, rgba(139, 92, 246, 1.00) 60%, rgba(99, 102, 241, 0.65) 80%, transparent 100%);"></div><div style="display: flex; align-items: center; gap: 14px; flex: 1;"><div style="width: 42px; height: 42px; border-radius: 8px; background: rgba(0, 212, 255, 0.1); border: 1px solid rgba(0, 212, 255, 0.28); display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; color: #00d4ff; box-shadow: 0 0 20px rgba(0, 212, 255, 0.25);">A</div><div style="font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 700; letter-spacing: 4px; color: #00d4ff; text-transform: uppercase; text-shadow: 0 0 30px rgba(0, 212, 255, 0.55), 0 0 60px rgba(0, 212, 255, 0.20);">ATLAS TERMINAL</div></div><div style="text-align: right;"><div style="font-size: 12px; color: rgba(255,255,255,0.28); line-height: 1.6; letter-spacing: 0.2px;">Institutional Intelligence.<br>Personal Scale.</div></div></div>""", unsafe_allow_html=True)

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
                border_color = "rgba(99, 102, 241, 0.5)" if is_selected else "rgb(31, 41, 55)"
                bg_color = "rgba(99, 102, 241, 0.1)" if is_selected else "transparent"

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

    # Auth gate — if sidebar returned None, user is not authenticated
    if page is None:
        st.markdown(
            '<div style="text-align:center; margin-top:8rem;">'
            '<div style="font-family:\'Syne\',sans-serif; font-size:42px;'
            ' font-weight:700; letter-spacing:5px; color:#00d4ff;'
            ' text-shadow:0 0 30px rgba(0,212,255,0.4);">ATLAS TERMINAL</div>'
            '<div style="font-size:14px; color:rgba(255,255,255,0.4);'
            ' margin-top:12px;">Institutional Investment Analytics</div>'
            '<div style="font-size:12px; color:rgba(255,255,255,0.25);'
            ' margin-top:24px;">Please log in using the sidebar.</div></div>',
            unsafe_allow_html=True,
        )
        return

    # ========================================================================
    # PHASE 2A: NAVIGATION ROUTING (Registry-Based)
    # ========================================================================
    # Map option_menu titles to registry keys
    PAGE_TITLE_TO_KEY = {
        "🔥 Phoenix Parser": "phoenix_parser",
        "🏠 Portfolio Home": "portfolio_home",
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
        "⬡ Quant Dashboard": "quant_dashboard",
        "ℹ️ About": "about",
        "💎 Equity Research": "equity_research",
        "🌐 Macro Intelligence": "macro_intelligence",
        "📚 Fund Research": "fund_research",
        "📝 Commentary Generator": "commentary_generator",
        "⚙️ Admin Panel": "admin_panel",
        "🎯 Strategic Asset Allocation": "saa_tool",
        "📊 Analytics Dashboard": "analytics_dashboard",
        "📚 CFA Level II Prep": "cfa_prep",
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

        # Compute actual dates from selected_range and store for page modules
        if selected_range == "YTD":
            st.session_state['start_date'] = datetime(datetime.now().year, 1, 1)
            st.session_state['end_date'] = datetime.now()
        elif selected_range == "MAX":
            st.session_state['start_date'] = datetime(2000, 1, 1)
            st.session_state['end_date'] = datetime.now()
        else:
            _days_map = {"1D": 1, "1W": 7, "1M": 30, "3M": 90, "6M": 180,
                         "1Y": 365, "3Y": 1095, "5Y": 1825}
            _days = _days_map.get(selected_range, 365)
            st.session_state['end_date'] = datetime.now()
            st.session_state['start_date'] = datetime.now() - timedelta(days=_days)

        # SOFT dependency banner — PM-Grade Optimization
        if not PM_OPTIMIZATION_AVAILABLE:
            st.warning("PM-Grade Optimization unavailable — regime-aware features degraded.")

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

    # ========================================================================
    # PAGE ROUTING — Registry-based (Phase 2)
    # Date range and benchmark are read from session state by each handler.
    # ========================================================================
    print(f"[MAIN] Routing to page: {selected_page_key} ({_t.time() - _main_start:.2f}s)", flush=True)

    # Usage tracking (Phase 7 A4)
    try:
        from core.monitoring import log_page_view
        from auth.auth_manager import get_current_user, get_current_tier
        log_page_view(get_current_user(), selected_page_key, get_current_tier())
    except Exception:
        pass

    route_to_page(selected_page_key)
    print(f"[MAIN] ====== main() COMPLETE ({_t.time() - _main_start:.2f}s) ======", flush=True)


# ============================================================================
# RUN THE APP
# ============================================================================
print("[BOOT] Calling main()...", flush=True)
try:
    main()
except Exception as _boot_exc:
    try:
        from core.monitoring import log_error
        from auth.auth_manager import get_current_user
        log_error(f"Unhandled exception (user={get_current_user()})", _boot_exc)
    except Exception:
        pass
    raise
print("[BOOT] main() completed", flush=True)
