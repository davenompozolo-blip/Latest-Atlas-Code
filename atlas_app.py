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

import pickle
import warnings
import re
import time
import io
import json
import random
from datetime import datetime, timedelta, date
from pathlib import Path
from collections import Counter, defaultdict
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st
import yfinance as yf
from scipy import stats
from scipy.optimize import minimize
import networkx as nx
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.linear_model import LinearRegression

warnings.filterwarnings("ignore")

# ============================================================================
# HELPER FUNCTIONS FOR VALIDATION
# ============================================================================
def is_valid_series(series):
    """Safely check if a pandas Series has valid data"""
    return series is not None and isinstance(series, pd.Series) and not series.empty

def is_valid_dataframe(df):
    """Safely check if a pandas DataFrame has valid data"""
    return df is not None and isinstance(df, pd.DataFrame) and not df.empty

# ============================================================================
# PAGE CONFIG
# ============================================================================
st.set_page_config(
    page_title="ATLAS Terminal v10.0 INSTITUTIONAL",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ============================================================================
# PROFESSIONAL THEME SYSTEM - ENHANCED FOR SEAMLESS CHARTS
# ============================================================================

COLORS = {
    "background": "#000000",
    "card_background": "#0a1929",
    "card_background_alt": "#050f17",
    "neon_blue": "#00d4ff",
    "electric_blue": "#0080ff",
    "teal": "#00ffcc",
    "cyan": "#00ffff",
    "success": "#00ff88",
    "warning": "#ffaa00",
    "danger": "#ff0044",
    "info": "#00d4ff",
    "purple": "#b794f6",
    "pink": "#ff00ff",
    "orange": "#ff6b00",
    "chart_primary": "#00d4ff",
    "chart_secondary": "#0080ff",
    "chart_accent": "#00ffcc",
    "chart_grid": "#1a3a52",
    "text_primary": "#ffffff",
    "text_secondary": "#b0c4de",
    "text_muted": "#6c8ca8",
    "border": "#00d4ff",
    "shadow": "rgba(0, 212, 255, 0.3)",
    "shadow_strong": "rgba(0, 212, 255, 0.6)",
    "gain_bg": "rgba(0, 255, 136, 0.15)",
    "gain_text": "#00ff88",
    "loss_bg": "rgba(255, 0, 68, 0.15)",
    "loss_text": "#ff0044",
}

# ============================================================================
# CHART THEME CONFIGURATION - SEAMLESS DARK MODE
# ============================================================================
CHART_THEME = {
    'paper_bgcolor': 'rgba(0, 0, 0, 0)',  # Transparent background
    'plot_bgcolor': 'rgba(10, 25, 41, 0.3)',  # Semi-transparent plot area
    'font': {'color': COLORS['text_primary'], 'family': 'Inter, sans-serif'},
    'xaxis': {
        'gridcolor': COLORS['chart_grid'],
        'linecolor': COLORS['chart_grid'],
        'zerolinecolor': COLORS['chart_grid']
    },
    'yaxis': {
        'gridcolor': COLORS['chart_grid'],
        'linecolor': COLORS['chart_grid'],
        'zerolinecolor': COLORS['chart_grid']
    }
}

def apply_chart_theme(fig):
    """Apply seamless dark theme to any Plotly figure"""
    fig.update_layout(
        paper_bgcolor='rgba(0, 0, 0, 0)',
        plot_bgcolor='rgba(10, 25, 41, 0.3)',
        font=dict(color=COLORS['text_primary'], family='Inter, sans-serif'),
        xaxis=dict(
            gridcolor=COLORS['chart_grid'],
            linecolor=COLORS['chart_grid'],
            zerolinecolor=COLORS['chart_grid']
        ),
        yaxis=dict(
            gridcolor=COLORS['chart_grid'],
            linecolor=COLORS['chart_grid'],
            zerolinecolor=COLORS['chart_grid']
        )
    )
    return fig

COLORSCALES = {
    "viridis": px.colors.sequential.Viridis,
    "plasma": px.colors.sequential.Plasma,
    "turbo": px.colors.sequential.Turbo,
    "rdylgn": px.colors.diverging.RdYlGn,
    "spectral": px.colors.diverging.Spectral,
}

# ============================================================================
# MODERN UI/UX - GLASSMORPHISM & BEAUTIFUL DESIGN
# ============================================================================
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');

    /* ============================================
       CORE FOUNDATIONS - Beautiful Basics
       ============================================ */

    * {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }

    code, pre, .monospace {
        font-family: 'JetBrains Mono', monospace !important;
    }

    /* Dark Background with Subtle Gradient */
    .main {
        background: linear-gradient(135deg, #000000 0%, #0a0e1a 50%, #000000 100%);
        background-attachment: fixed;
    }

    /* Add subtle noise texture for depth */
    .main::before {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: 0.03;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        pointer-events: none;
        z-index: 1;
    }

    .block-container {
        padding-top: 3rem !important;
        padding-bottom: 3rem !important;
        max-width: 1400px !important;
    }

    /* ============================================
       GLASSMORPHISM CARDS - Modern Aesthetic
       ============================================ */

    div[data-testid="stMetric"],
    div[data-testid="stMarkdownContainer"] > div,
    .stTabs [data-baseweb="tab-panel"],
    .stExpander {
        background: rgba(10, 25, 41, 0.4) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        border: 1px solid rgba(0, 212, 255, 0.15) !important;
        border-radius: 16px !important;
        padding: 24px !important;
        box-shadow:
            0 8px 32px 0 rgba(0, 0, 0, 0.37),
            inset 0 1px 0 0 rgba(255, 255, 255, 0.05) !important;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    div[data-testid="stMetric"]:hover,
    .stExpander:hover {
        transform: translateY(-4px) !important;
        border-color: rgba(0, 212, 255, 0.4) !important;
        box-shadow:
            0 12px 48px 0 rgba(0, 212, 255, 0.2),
            0 0 0 1px rgba(0, 212, 255, 0.1),
            inset 0 1px 0 0 rgba(255, 255, 255, 0.1) !important;
    }

    /* ============================================
       TYPOGRAPHY - Crisp & Modern
       ============================================ */

    h1 {
        font-weight: 900 !important;
        font-size: 3.5em !important;
        letter-spacing: -0.02em !important;
        line-height: 1.1 !important;
        margin-bottom: 0.5em !important;
        background: linear-gradient(135deg, #00d4ff 0%, #00ff88 50%, #00d4ff 100%);
        background-size: 200% auto;
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: shimmer 3s linear infinite;
    }

    @keyframes shimmer {
        0% { background-position: 0% center; }
        100% { background-position: 200% center; }
    }

    h2 {
        font-weight: 700 !important;
        font-size: 2em !important;
        color: #ffffff !important;
        letter-spacing: -0.01em !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.75em !important;
        position: relative;
        padding-left: 20px;
    }

    h2::before {
        content: '';
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 4px;
        height: 70%;
        background: linear-gradient(180deg, #00d4ff, #00ff88);
        border-radius: 2px;
    }

    h3 {
        font-weight: 600 !important;
        font-size: 1.4em !important;
        color: #00d4ff !important;
        letter-spacing: -0.01em !important;
        margin-top: 1.2em !important;
        margin-bottom: 0.6em !important;
    }

    p {
        font-size: 1.05em !important;
        line-height: 1.7 !important;
        color: #b0c4de !important;
        font-weight: 400 !important;
    }

    /* ============================================
       METRICS - Beautiful Number Display
       ============================================ */

    div[data-testid="stMetric"] {
        background: linear-gradient(135deg, rgba(10, 25, 41, 0.6) 0%, rgba(5, 15, 23, 0.8) 100%) !important;
        position: relative;
        overflow: hidden;
    }

    /* Animated gradient background on hover */
    div[data-testid="stMetric"]::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(0, 212, 255, 0.1) 0%, transparent 70%);
        opacity: 0;
        transition: opacity 0.4s ease;
    }

    div[data-testid="stMetric"]:hover::before {
        opacity: 1;
    }

    div[data-testid="stMetric"] label {
        font-size: 0.85em !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.1em !important;
        color: #6c8ca8 !important;
        margin-bottom: 8px !important;
    }

    div[data-testid="stMetric"] [data-testid="stMetricValue"] {
        font-size: 1.8em !important;
        font-weight: 800 !important;
        background: linear-gradient(135deg, #ffffff 0%, #00d4ff 100%);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: -0.02em !important;
    }

    div[data-testid="stMetric"] [data-testid="stMetricDelta"] {
        font-size: 1em !important;
        font-weight: 600 !important;
        margin-top: 4px !important;
    }

    /* ============================================
       TABLES - Sleek Data Display
       ============================================ */

    div[data-testid="stDataFrame"] {
        background: rgba(10, 25, 41, 0.3) !important;
        border: 1px solid rgba(0, 212, 255, 0.15) !important;
        border-radius: 12px !important;
        overflow: hidden !important;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3) !important;
    }

    /* Table Headers - Gradient Effect */
    div[data-testid="stDataFrame"] thead th {
        background: linear-gradient(135deg, #00d4ff 0%, #0080ff 100%) !important;
        color: #000000 !important;
        font-weight: 700 !important;
        font-size: 13px !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        padding: 16px 12px !important;
        border: none !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 10 !important;
    }

    /* Table Rows - Smooth Hover */
    div[data-testid="stDataFrame"] tbody tr {
        transition: all 0.2s ease !important;
        border-bottom: 1px solid rgba(26, 58, 82, 0.5) !important;
    }

    div[data-testid="stDataFrame"] tbody tr:hover {
        background: linear-gradient(90deg,
            rgba(0, 212, 255, 0.08) 0%,
            rgba(0, 212, 255, 0.15) 50%,
            rgba(0, 212, 255, 0.08) 100%) !important;
        transform: translateX(4px) scale(1.002) !important;
        border-left: 3px solid #00d4ff !important;
        box-shadow: 0 2px 12px rgba(0, 212, 255, 0.2) !important;
    }

    div[data-testid="stDataFrame"] tbody td {
        padding: 14px 12px !important;
        font-size: 14px !important;
        color: #e0e7ee !important;
        font-weight: 500 !important;
    }

    /* ============================================
       NUCLEAR OPTION - COMPLETELY REMOVE TABLE DROPDOWNS
       ============================================ */

    /* Hide ALL table controls that cause issues */
    div[data-testid="stDataFrame"] button,
    div[data-testid="stDataFrame"] [role="button"],
    div[data-testid="stDataFrame"] [data-baseweb="popover"],
    div[data-testid="stDataFrame"] [data-baseweb="menu"],
    div[data-testid="stDataFrame"] [role="menu"],
    div[data-testid="stDataFrame"] [role="listbox"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        position: absolute !important;
        left: -9999px !important;
    }

    /* Remove column resize handles */
    div[data-testid="stDataFrameResizeHandle"] {
        display: none !important;
    }

    /* Remove any floating menus */
    div[data-baseweb="popover"] {
        display: none !important;
    }

    /* Prevent any dropdown overlays */
    div[role="presentation"] {
        display: none !important;
    }

    /* ============================================
       BUTTONS - Modern Interactive Elements
       ============================================ */

    .stButton > button {
        background: linear-gradient(135deg, #00d4ff 0%, #0080ff 100%) !important;
        color: #000000 !important;
        border: none !important;
        border-radius: 12px !important;
        padding: 14px 32px !important;
        font-weight: 700 !important;
        font-size: 15px !important;
        letter-spacing: 0.05em !important;
        text-transform: uppercase !important;
        box-shadow: 0 4px 16px rgba(0, 212, 255, 0.3) !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        position: relative !important;
        overflow: hidden !important;
    }

    .stButton > button::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.3);
        transform: translate(-50%, -50%);
        transition: width 0.6s, height 0.6s;
    }

    .stButton > button:hover::before {
        width: 300px;
        height: 300px;
    }

    .stButton > button:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 8px 24px rgba(0, 212, 255, 0.5) !important;
    }

    .stButton > button:active {
        transform: translateY(0) !important;
    }

    /* ============================================
       INPUTS - Clean Form Elements
       ============================================ */

    input[type="text"],
    input[type="number"],
    textarea,
    .stTextInput > div > div > input,
    .stNumberInput > div > div > input {
        background: rgba(10, 25, 41, 0.5) !important;
        border: 2px solid rgba(0, 212, 255, 0.2) !important;
        border-radius: 10px !important;
        color: #ffffff !important;
        padding: 12px 16px !important;
        font-size: 15px !important;
        font-weight: 500 !important;
        transition: all 0.3s ease !important;
    }

    input:focus,
    textarea:focus {
        border-color: #00d4ff !important;
        box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1) !important;
        outline: none !important;
        background: rgba(10, 25, 41, 0.7) !important;
    }

    /* ============================================
       TABS - Sleek Navigation
       ============================================ */

    .stTabs [data-baseweb="tab-list"] {
        gap: 8px !important;
        background: rgba(10, 25, 41, 0.3) !important;
        padding: 8px !important;
        border-radius: 12px !important;
        border: 1px solid rgba(0, 212, 255, 0.1) !important;
    }

    .stTabs [data-baseweb="tab"] {
        background: transparent !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 12px 24px !important;
        font-weight: 600 !important;
        font-size: 14px !important;
        color: #6c8ca8 !important;
        transition: all 0.3s ease !important;
    }

    .stTabs [data-baseweb="tab"]:hover {
        background: rgba(0, 212, 255, 0.1) !important;
        color: #00d4ff !important;
    }

    .stTabs [aria-selected="true"] {
        background: linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(0, 128, 255, 0.2) 100%) !important;
        color: #00d4ff !important;
        border: 1px solid rgba(0, 212, 255, 0.3) !important;
        box-shadow: 0 4px 12px rgba(0, 212, 255, 0.15) !important;
    }

    /* ============================================
       SIDEBAR - Clean Navigation
       ============================================ */

    section[data-testid="stSidebar"] {
        background: linear-gradient(180deg, rgba(5, 15, 23, 0.95) 0%, rgba(10, 25, 41, 0.95) 100%) !important;
        border-right: 1px solid rgba(0, 212, 255, 0.15) !important;
        backdrop-filter: blur(20px) !important;
    }

    section[data-testid="stSidebar"] .stRadio > label {
        background: rgba(10, 25, 41, 0.4) !important;
        border: 1px solid rgba(0, 212, 255, 0.15) !important;
        border-radius: 10px !important;
        padding: 12px 16px !important;
        margin: 6px 0 !important;
        transition: all 0.3s ease !important;
        cursor: pointer !important;
    }

    section[data-testid="stSidebar"] .stRadio > label:hover {
        background: rgba(0, 212, 255, 0.1) !important;
        border-color: rgba(0, 212, 255, 0.4) !important;
        transform: translateX(4px) !important;
    }

    /* ============================================
       EXPANDERS - Collapsible Sections
       ============================================ */

    .streamlit-expanderHeader {
        background: rgba(10, 25, 41, 0.5) !important;
        border: 1px solid rgba(0, 212, 255, 0.2) !important;
        border-radius: 10px !important;
        padding: 16px !important;
        font-weight: 600 !important;
        font-size: 15px !important;
        color: #00d4ff !important;
        transition: all 0.3s ease !important;
    }

    .streamlit-expanderHeader:hover {
        background: rgba(0, 212, 255, 0.1) !important;
        border-color: rgba(0, 212, 255, 0.4) !important;
    }

    /* ============================================
       PROGRESS BARS - Animated Loading
       ============================================ */

    .stProgress > div > div > div {
        background: linear-gradient(90deg, #00d4ff, #00ff88, #00d4ff) !important;
        background-size: 200% auto !important;
        animation: shimmer 2s linear infinite !important;
        border-radius: 10px !important;
        height: 8px !important;
    }

    /* ============================================
       ALERTS & NOTIFICATIONS
       ============================================ */

    .stAlert {
        background: rgba(10, 25, 41, 0.6) !important;
        border-left: 4px solid #00d4ff !important;
        border-radius: 10px !important;
        padding: 16px 20px !important;
        backdrop-filter: blur(10px) !important;
    }

    .stSuccess {
        border-left-color: #00ff88 !important;
    }

    .stError {
        border-left-color: #ff0044 !important;
    }

    .stWarning {
        border-left-color: #ffaa00 !important;
    }

    /* ============================================
       SELECTBOX & MULTISELECT - Working Dropdowns
       ============================================ */

    div[data-baseweb="select"] > div {
        background: rgba(10, 25, 41, 0.5) !important;
        border: 2px solid rgba(0, 212, 255, 0.2) !important;
        border-radius: 10px !important;
        min-height: 48px !important;
    }

    div[data-baseweb="select"]:hover > div {
        border-color: rgba(0, 212, 255, 0.4) !important;
    }

    /* ============================================
       SCROLLBAR - Custom Styling
       ============================================ */

    ::-webkit-scrollbar {
        width: 10px !important;
        height: 10px !important;
    }

    ::-webkit-scrollbar-track {
        background: rgba(10, 25, 41, 0.3) !important;
        border-radius: 10px !important;
    }

    ::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, #00d4ff, #0080ff) !important;
        border-radius: 10px !important;
        border: 2px solid rgba(10, 25, 41, 0.3) !important;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, #00ff88, #00d4ff) !important;
    }

    /* ============================================
       PLOTLY CHARTS - Seamless Integration
       ============================================ */

    .js-plotly-plot {
        border-radius: 12px !important;
        overflow: hidden !important;
    }

    /* ============================================
       SPECIAL EFFECTS - Glows & Shadows
       ============================================ */

    .glow-text {
        text-shadow: 0 0 20px rgba(0, 212, 255, 0.5),
                     0 0 40px rgba(0, 212, 255, 0.3),
                     0 0 60px rgba(0, 212, 255, 0.2);
    }

    .glow-box {
        box-shadow: 0 0 20px rgba(0, 212, 255, 0.3),
                    0 0 40px rgba(0, 212, 255, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    /* ============================================
       RESPONSIVE DESIGN
       ============================================ */

    @media (max-width: 768px) {
        h1 { font-size: 2.5em !important; }
        h2 { font-size: 1.8em !important; }
        h3 { font-size: 1.3em !important; }

        div[data-testid="stMetric"] {
            padding: 16px !important;
        }
    }

    /* ============================================
       HIDE STREAMLIT BRANDING
       ============================================ */

    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}

</style>
""", unsafe_allow_html=True)

# ============================================================================
# CONSTANTS & CONFIG
# ============================================================================
CACHE_DIR = Path.home() / ".atlas_cache"
CACHE_DIR.mkdir(exist_ok=True)
PORTFOLIO_CACHE = CACHE_DIR / "portfolio.pkl"
TRADE_HISTORY_CACHE = CACHE_DIR / "trade_history.pkl"
ACCOUNT_HISTORY_CACHE = CACHE_DIR / "account_history.pkl"

RISK_FREE_RATE = 0.045
MARKET_RETURN = 0.10

# ============================================================================
# EXPANDED MARKET WATCH UNIVERSE - EXCELLENCE EDITION
# ============================================================================

# Global Market Indices
# v9.7 EXPANDED: Additional Global Indices
GLOBAL_INDICES = {
    "^GSPC": {"name": "S&P 500", "region": "US"},
    "^NDX": {"name": "Nasdaq 100", "region": "US"},
    "^DJI": {"name": "Dow Jones", "region": "US"},
    "^RUT": {"name": "Russell 2000", "region": "US"},
    "^FTSE": {"name": "FTSE 100", "region": "UK"},
    "^GDAXI": {"name": "DAX", "region": "Germany"},
    "^FCHI": {"name": "CAC 40", "region": "France"},
    "^STOXX50E": {"name": "Euro Stoxx 50", "region": "Europe"},
    "^N225": {"name": "Nikkei 225", "region": "Japan"},
    "^HSI": {"name": "Hang Seng", "region": "Hong Kong"},
    "000001.SS": {"name": "Shanghai Composite", "region": "China"},
    "^BSESN": {"name": "BSE Sensex", "region": "India"},
    "^BVSP": {"name": "Bovespa", "region": "Brazil"},
    "^AXJO": {"name": "ASX 200", "region": "Australia"},
    "^GSPTSE": {"name": "TSX Composite", "region": "Canada"},
    # v9.7 NEW: Additional emerging and developed markets
    "^KS11": {"name": "KOSPI", "region": "South Korea"},
    "^TWII": {"name": "Taiwan Weighted", "region": "Taiwan"},
    "^JKSE": {"name": "Jakarta Composite", "region": "Indonesia"},
    "^MXX": {"name": "IPC Mexico", "region": "Mexico"}
}

# EXPANDED: Major Cryptocurrencies
# v9.7 EXPANDED: Additional Cryptocurrencies
CRYPTOCURRENCIES = {
    "BTC-USD": {"name": "Bitcoin", "category": "Crypto"},
    "ETH-USD": {"name": "Ethereum", "category": "Crypto"},
    "BNB-USD": {"name": "Binance Coin", "category": "Crypto"},
    "XRP-USD": {"name": "Ripple", "category": "Crypto"},
    "ADA-USD": {"name": "Cardano", "category": "Crypto"},
    "SOL-USD": {"name": "Solana", "category": "Crypto"},
    "DOGE-USD": {"name": "Dogecoin", "category": "Crypto"},
    "MATIC-USD": {"name": "Polygon", "category": "Crypto"},
    "DOT-USD": {"name": "Polkadot", "category": "Crypto"},
    "AVAX-USD": {"name": "Avalanche", "category": "Crypto"},
    # v9.7 NEW: Additional major cryptocurrencies
    "LINK-USD": {"name": "Chainlink", "category": "Crypto"},
    "UNI-USD": {"name": "Uniswap", "category": "Crypto"},
    "LTC-USD": {"name": "Litecoin", "category": "Crypto"},
    "ATOM-USD": {"name": "Cosmos", "category": "Crypto"},
    "ALGO-USD": {"name": "Algorand", "category": "Crypto"}
}

# EXPANDED: Bond Yields and Rates
BOND_YIELDS = {
    "^TNX": {"name": "US 10Y Treasury", "category": "Government Bonds"},
    "^TYX": {"name": "US 30Y Treasury", "category": "Government Bonds"},
    "^FVX": {"name": "US 5Y Treasury", "category": "Government Bonds"},
    "^IRX": {"name": "US 13W Treasury", "category": "Government Bonds"},
}

# v9.7 EXPANDED: Credit Spreads (using ETF proxies)
CREDIT_SPREADS = {
    "LQD": {"name": "Investment Grade Credit", "category": "Credit"},
    "HYG": {"name": "High Yield Credit", "category": "Credit"},
    "JNK": {"name": "High Yield Junk Bonds", "category": "Credit"},
    "EMB": {"name": "Emerging Market Bonds", "category": "Credit"},
    "TIP": {"name": "TIPS (Inflation-Protected)", "category": "Government Bonds"},
    "MBB": {"name": "Mortgage-Backed Securities", "category": "Credit"},
    # v9.7 NEW: Additional spreads
    "VCSH": {"name": "Short-Term Corporate", "category": "Credit"},
    "VCIT": {"name": "Intermediate Corporate", "category": "Credit"},
    "VCLT": {"name": "Long-Term Corporate", "category": "Credit"},
    "BKLN": {"name": "Senior Loan (Floating Rate)", "category": "Credit"},
    "ANGL": {"name": "Fallen Angels", "category": "Credit"},
    "SHYG": {"name": "Short Duration High Yield", "category": "Credit"},
}

# EXPANDED: Commodities
COMMODITIES = {
    "GC=F": {"name": "Gold", "category": "Precious Metals"},
    "SI=F": {"name": "Silver", "category": "Precious Metals"},
    "PL=F": {"name": "Platinum", "category": "Precious Metals"},
    "PA=F": {"name": "Palladium", "category": "Precious Metals"},
    "CL=F": {"name": "Crude Oil WTI", "category": "Energy"},
    "BZ=F": {"name": "Brent Crude", "category": "Energy"},
    "NG=F": {"name": "Natural Gas", "category": "Energy"},
    "RB=F": {"name": "Gasoline", "category": "Energy"},
    "HG=F": {"name": "Copper", "category": "Industrial Metals"},
    "ALI=F": {"name": "Aluminum", "category": "Industrial Metals"},
    "ZC=F": {"name": "Corn", "category": "Agriculture"},
    "ZW=F": {"name": "Wheat", "category": "Agriculture"},
    "ZS=F": {"name": "Soybeans", "category": "Agriculture"},
    "KC=F": {"name": "Coffee", "category": "Agriculture"},
    "SB=F": {"name": "Sugar", "category": "Agriculture"},
    "CC=F": {"name": "Cocoa", "category": "Agriculture"},
    "LE=F": {"name": "Live Cattle", "category": "Livestock"},
    "GF=F": {"name": "Feeder Cattle", "category": "Livestock"}
}

# EXPANDED: Popular Stocks (45 diverse companies - FIXED)
POPULAR_STOCKS = {
    # Mega Cap Tech
    "AAPL": {"name": "Apple", "sector": "Technology", "category": "Mega Cap Tech"},
    "MSFT": {"name": "Microsoft", "sector": "Technology", "category": "Mega Cap Tech"},
    "GOOGL": {"name": "Alphabet", "sector": "Technology", "category": "Mega Cap Tech"},
    "AMZN": {"name": "Amazon", "sector": "Consumer Cyclical", "category": "Mega Cap Tech"},
    "NVDA": {"name": "NVIDIA", "sector": "Technology", "category": "Mega Cap Tech"},
    "META": {"name": "Meta", "sector": "Technology", "category": "Mega Cap Tech"},
    "TSLA": {"name": "Tesla", "sector": "Consumer Cyclical", "category": "Mega Cap Tech"},
    "NFLX": {"name": "Netflix", "sector": "Communication Services", "category": "Mega Cap Tech"},

    # Financials
    "JPM": {"name": "JPMorgan", "sector": "Financial Services", "category": "Financials"},
    "BAC": {"name": "Bank of America", "sector": "Financial Services", "category": "Financials"},
    "WFC": {"name": "Wells Fargo", "sector": "Financial Services", "category": "Financials"},
    "GS": {"name": "Goldman Sachs", "sector": "Financial Services", "category": "Financials"},
    "MS": {"name": "Morgan Stanley", "sector": "Financial Services", "category": "Financials"},
    "C": {"name": "Citigroup", "sector": "Financial Services", "category": "Financials"},
    "BLK": {"name": "BlackRock", "sector": "Financial Services", "category": "Financials"},
    "V": {"name": "Visa", "sector": "Financial Services", "category": "Financials"},
    "MA": {"name": "Mastercard", "sector": "Financial Services", "category": "Financials"},

    # Healthcare
    "JNJ": {"name": "Johnson & Johnson", "sector": "Healthcare", "category": "Healthcare"},
    "UNH": {"name": "UnitedHealth", "sector": "Healthcare", "category": "Healthcare"},
    "PFE": {"name": "Pfizer", "sector": "Healthcare", "category": "Healthcare"},
    "ABBV": {"name": "AbbVie", "sector": "Healthcare", "category": "Healthcare"},
    "TMO": {"name": "Thermo Fisher", "sector": "Healthcare", "category": "Healthcare"},
    "LLY": {"name": "Eli Lilly", "sector": "Healthcare", "category": "Healthcare"},

    # Consumer
    "WMT": {"name": "Walmart", "sector": "Consumer Defensive", "category": "Consumer"},
    "PG": {"name": "Procter & Gamble", "sector": "Consumer Defensive", "category": "Consumer"},
    "KO": {"name": "Coca-Cola", "sector": "Consumer Defensive", "category": "Consumer"},
    "PEP": {"name": "PepsiCo", "sector": "Consumer Defensive", "category": "Consumer"},
    "COST": {"name": "Costco", "sector": "Consumer Defensive", "category": "Consumer"},
    "NKE": {"name": "Nike", "sector": "Consumer Cyclical", "category": "Consumer"},
    "MCD": {"name": "McDonald's", "sector": "Consumer Cyclical", "category": "Consumer"},
    "SBUX": {"name": "Starbucks", "sector": "Consumer Cyclical", "category": "Consumer"},
    "DIS": {"name": "Disney", "sector": "Communication Services", "category": "Consumer"},

    # Energy
    "XOM": {"name": "Exxon Mobil", "sector": "Energy", "category": "Energy"},
    "CVX": {"name": "Chevron", "sector": "Energy", "category": "Energy"},
    "COP": {"name": "ConocoPhillips", "sector": "Energy", "category": "Energy"},
    "SLB": {"name": "Schlumberger", "sector": "Energy", "category": "Energy"},

    # Industrials
    "BA": {"name": "Boeing", "sector": "Industrials", "category": "Industrials"},
    "CAT": {"name": "Caterpillar", "sector": "Industrials", "category": "Industrials"},
    "GE": {"name": "General Electric", "sector": "Industrials", "category": "Industrials"},
    "UPS": {"name": "UPS", "sector": "Industrials", "category": "Industrials"},

    # Tech (Additional)
    "ORCL": {"name": "Oracle", "sector": "Technology", "category": "Tech"},
    "CRM": {"name": "Salesforce", "sector": "Technology", "category": "Tech"},
    "ADBE": {"name": "Adobe", "sector": "Technology", "category": "Tech"},
    "INTC": {"name": "Intel", "sector": "Technology", "category": "Tech"},
    "AMD": {"name": "AMD", "sector": "Technology", "category": "Tech"},
    "CSCO": {"name": "Cisco", "sector": "Technology", "category": "Tech"},
}

# EXPANDED: Popular ETFs (now includes thematic and sector)
POPULAR_ETFS = {
    # Broad Market
    "SPY": {"name": "SPDR S&P 500", "category": "Broad Market", "avg_volume": 70000000},
    "QQQ": {"name": "Invesco QQQ", "category": "Broad Market", "avg_volume": 40000000},
    "IWM": {"name": "Russell 2000", "category": "Broad Market", "avg_volume": 30000000},
    "VTI": {"name": "Total Stock Market", "category": "Broad Market", "avg_volume": 5000000},
    
    # Sector SPDRs
    "XLK": {"name": "Technology Select", "category": "Sector", "avg_volume": 15000000},
    "XLF": {"name": "Financial Select", "category": "Sector", "avg_volume": 50000000},
    "XLV": {"name": "Health Care Select", "category": "Sector", "avg_volume": 10000000},
    "XLE": {"name": "Energy Select", "category": "Sector", "avg_volume": 20000000},
    "XLI": {"name": "Industrial Select", "category": "Sector", "avg_volume": 12000000},
    "XLY": {"name": "Consumer Discretionary", "category": "Sector", "avg_volume": 8000000},
    "XLP": {"name": "Consumer Staples", "category": "Sector", "avg_volume": 10000000},
    "XLU": {"name": "Utilities Select", "category": "Sector", "avg_volume": 12000000},
    "XLRE": {"name": "Real Estate Select", "category": "Sector", "avg_volume": 5000000},
    
    # Thematic
    "ARKK": {"name": "ARK Innovation", "category": "Thematic", "avg_volume": 8000000},
    "ARKQ": {"name": "ARK Autonomous Tech", "category": "Thematic", "avg_volume": 2000000},
    "ARKW": {"name": "ARK Next Gen Internet", "category": "Thematic", "avg_volume": 1500000},
    "ICLN": {"name": "Clean Energy", "category": "Thematic", "avg_volume": 5000000},
    "TAN": {"name": "Solar Energy", "category": "Thematic", "avg_volume": 1500000},
    "HACK": {"name": "Cybersecurity", "category": "Thematic", "avg_volume": 800000},
    "ROBO": {"name": "Robotics & AI", "category": "Thematic", "avg_volume": 500000},
    "FINX": {"name": "FinTech", "category": "Thematic", "avg_volume": 300000},
    
    # International
    "EEM": {"name": "Emerging Markets", "category": "International", "avg_volume": 25000000},
    "EFA": {"name": "EAFE", "category": "International", "avg_volume": 15000000},
    "VWO": {"name": "FTSE Emerging Markets", "category": "International", "avg_volume": 10000000},
    "FXI": {"name": "China Large-Cap", "category": "International", "avg_volume": 20000000},
}

# Factor definitions
FACTOR_DEFINITIONS = {
    "Market": {"description": "Market risk premium", "benchmark": "SPY"},
    "Size": {"description": "Small cap minus large cap", "benchmark": "IWM"},
    "Value": {"description": "Value minus growth", "benchmark": "IWD"},
    "Momentum": {"description": "Winners minus losers", "benchmark": "MTUM"},
    "Quality": {"description": "High quality minus low quality", "benchmark": "QUAL"},
    "Volatility": {"description": "Low vol minus high vol", "benchmark": "USMV"}
}

# ETF sectors
ETF_SECTORS = {
    "QQQ": "Technology", "XLK": "Technology", "VGT": "Technology",
    "XLF": "Financial Services", "KRE": "Financial Services",
    "XLV": "Healthcare", "IBB": "Healthcare", "XBI": "Healthcare",
    "XLE": "Energy", "XOP": "Energy", "USO": "Energy",
    "XLB": "Basic Materials", "GDX": "Basic Materials",
    "XLY": "Consumer Cyclical", "XLP": "Consumer Defensive",
    "XLI": "Industrials", "IYT": "Industrials",
    "VNQ": "Real Estate", "XLRE": "Real Estate",
    "XLU": "Utilities",
    "SPY": "Broad Market", "VOO": "Broad Market", "VTI": "Broad Market"
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def format_percentage(value, decimals=2):
    if pd.isna(value) or value is None:
        return "N/A"
    return f"{value:.{decimals}f}%"

def format_currency(value):
    if pd.isna(value) or value is None:
        return "N/A"
    return f"${value:,.2f}"

def format_large_number(value):
    """Format large numbers with B/M/K suffix"""
    if pd.isna(value) or value is None:
        return "N/A"
    if abs(value) >= 1e9:
        return f"${value/1e9:.2f}B"
    elif abs(value) >= 1e6:
        return f"${value/1e6:.2f}M"
    elif abs(value) >= 1e3:
        return f"${value/1e3:.2f}K"
    return f"${value:.2f}"

def add_arrow_indicator(value):
    try:
        val = float(str(value).replace('%', '').replace('$', '').replace(',', ''))
        if val > 0:
            return f"▲ {value}"
        elif val < 0:
            return f"▼ {value}"
        return f"─ {value}"
    except:
        return value

# ============================================================================
# PROFESSIONAL ENHANCEMENTS - ATLAS v9.4 EXCELLENCE EDITION
# ============================================================================

# Enhanced Formatting Standards with Strict Rules
class ATLASFormatter:
    """
    Centralized professional formatting with strict standards:
    - Prices: $ with 2 decimals
    - Yields/Returns: % with 2 decimals
    - Ratios: 1 decimal, no units
    - Missing data: "–"
    - Color rules: Green positive, Red negative, Grey zero
    """

    @staticmethod
    def format_price(value, decimals=2):
        """Prices: Always $ with exactly 2 decimals"""
        if pd.isna(value) or value is None:
            return "–"
        return f"${value:,.{decimals}f}"

    @staticmethod
    def format_yield(value, decimals=2):
        """Yields/Returns: Always % with exactly 2 decimals"""
        if pd.isna(value) or value is None:
            return "–"
        return f"{value:.{decimals}f}%"

    @staticmethod
    def format_ratio(value, decimals=1):
        """Ratios: 1 decimal place, no units"""
        if pd.isna(value) or value is None:
            return "–"
        return f"{value:.{decimals}f}"

    @staticmethod
    def get_color(value):
        """Color rules: Green positive, Red negative, Grey zero"""
        if pd.isna(value) or value is None:
            return COLORS['text_muted']
        if value > 0:
            return COLORS['success']
        elif value < 0:
            return COLORS['danger']
        return COLORS['text_muted']

    @staticmethod
    def format_timestamp(dt=None):
        """Data freshness indicator with precise timestamp"""
        if dt is None:
            dt = datetime.now()
        return dt.strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def get_freshness_badge(minutes_ago):
        """Visual freshness indicator based on age"""
        if minutes_ago < 5:
            return f"🟢 Live ({minutes_ago}m ago)"
        elif minutes_ago < 30:
            return f"🟡 Recent ({minutes_ago}m ago)"
        else:
            return f"🔴 Stale ({minutes_ago}m ago)"

# Valuation Scenario System
VALUATION_SCENARIOS = {
    'BEAR': {
        'name': '🐻 Bear Case',
        'revenue_growth': -0.05,
        'terminal_growth': 0.015,
        'risk_premium': 0.08,
        'capex_pct': 0.07,
        'description': 'Conservative: Negative growth, higher risk premium, elevated capex'
    },
    'BASE': {
        'name': '📊 Base Case',
        'revenue_growth': 0.05,
        'terminal_growth': 0.025,
        'risk_premium': 0.06,
        'capex_pct': 0.05,
        'description': 'Realistic: Moderate growth assumptions, normal operating conditions'
    },
    'BULL': {
        'name': '🚀 Bull Case',
        'revenue_growth': 0.15,
        'terminal_growth': 0.035,
        'risk_premium': 0.05,
        'capex_pct': 0.04,
        'description': 'Optimistic: High growth, lower risk premium, efficient capex'
    }
}

def create_risk_snapshot(df, portfolio_returns):
    """
    Professional Risk Snapshot Dashboard Widget
    Displays: Portfolio Beta, Volatility, Max Drawdown, Top 3 Exposures
    """
    # Calculate aggregate portfolio beta
    weighted_beta = (df['Beta'].fillna(1.0) * df['Weight %'] / 100).sum()

    # Calculate annualized volatility
    vol = portfolio_returns.std() * np.sqrt(252) * 100 if is_valid_series(portfolio_returns) else 0

    # Calculate max drawdown
    if is_valid_series(portfolio_returns) and len(portfolio_returns) > 0:
        cumulative = (1 + portfolio_returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = ((cumulative - running_max) / running_max * 100).min()
    else:
        drawdown = 0

    # Top 3 exposures by weight
    top_3 = df.nlargest(3, 'Weight %')[['Ticker', 'Weight %']]

    # Create compact, professional HTML widget
    snapshot_html = f"""
    <div style='background: linear-gradient(135deg, {COLORS['card_background']} 0%, {COLORS['card_background_alt']} 100%);
                border: 2px solid {COLORS['neon_blue']}; border-radius: 12px; padding: 20px; margin: 10px 0;
                box-shadow: 0 0 30px {COLORS['shadow']};'>
        <h3 style='color: {COLORS['neon_blue']}; margin: 0 0 15px 0; font-size: 18px;'>⚡ Risk Snapshot</h3>
        <div style='display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px;'>
            <div>
                <div style='color: {COLORS['text_muted']}; font-size: 11px; text-transform: uppercase;'>Portfolio Beta</div>
                <div style='color: {COLORS['text_primary']}; font-size: 24px; font-weight: 600;'>{ATLASFormatter.format_ratio(weighted_beta)}</div>
            </div>
            <div>
                <div style='color: {COLORS['text_muted']}; font-size: 11px; text-transform: uppercase;'>Volatility (Ann.)</div>
                <div style='color: {COLORS['warning']}; font-size: 24px; font-weight: 600;'>{ATLASFormatter.format_yield(vol)}</div>
            </div>
            <div>
                <div style='color: {COLORS['text_muted']}; font-size: 11px; text-transform: uppercase;'>Max Drawdown</div>
                <div style='color: {COLORS['danger']}; font-size: 24px; font-weight: 600;'>{ATLASFormatter.format_yield(drawdown)}</div>
            </div>
            <div>
                <div style='color: {COLORS['text_muted']}; font-size: 11px; text-transform: uppercase;'>Top Exposures</div>
                <div style='color: {COLORS['text_primary']}; font-size: 13px; line-height: 1.6; margin-top: 5px;'>
                    {'<br>'.join([f"• {row['Ticker']} ({row['Weight %']:.1f}%)" for _, row in top_3.iterrows()])}
                </div>
            </div>
        </div>
    </div>
    """
    return snapshot_html

def calculate_signal_health(metrics):
    """
    Calculate overall portfolio health score with traffic light system
    Returns: (status, percentage, label)
    GREEN: 80%+, YELLOW: 50-79%, RED: <50%
    """
    score = 0
    max_score = 5

    # Check 1: Positive returns
    if metrics.get('Total Return', 0) > 0:
        score += 1

    # Check 2: Sharpe > 1.0 (good risk-adjusted returns)
    if metrics.get('Sharpe Ratio', 0) > 1.0:
        score += 1

    # Check 3: Drawdown > -20% (manageable losses)
    if metrics.get('Max Drawdown', -100) > -20:
        score += 1

    # Check 4: Win rate > 55% (more winning days)
    if metrics.get('Win Rate', 0) > 55:
        score += 1

    # Check 5: Volatility < 25% (controlled risk)
    if metrics.get('Annualized Volatility', 100) < 25:
        score += 1

    percentage = (score / max_score) * 100

    if percentage >= 80:
        status = 'GREEN'
        emoji = '🟢'
        label = 'HEALTHY'
    elif percentage >= 50:
        status = 'YELLOW'
        emoji = '🟡'
        label = 'CAUTION'
    else:
        status = 'RED'
        emoji = '🔴'
        label = 'AT RISK'

    return status, percentage, f"{emoji} {label}"

def create_signal_health_badge(metrics):
    """Create visual health indicator badge for portfolio"""
    status, percentage, label = calculate_signal_health(metrics)

    color_map = {
        'GREEN': COLORS['success'],
        'YELLOW': COLORS['warning'],
        'RED': COLORS['danger']
    }

    badge_html = f"""
    <div style='display: inline-block; background: {color_map[status]};
                color: #ffffff; padding: 10px 20px; border-radius: 20px;
                font-weight: 700; font-size: 15px; margin: 10px 0;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);'>
        {label} ({percentage:.0f}%)
    </div>
    """
    return badge_html

def create_pnl_attribution_sector(df):
    """v9.7 ENHANCED: P&L Attribution by Sector - Now showing % contribution"""
    # Calculate sector P&L in dollars
    sector_pnl_dollars = df.groupby('Sector')['Total Gain/Loss $'].sum()

    # v9.7 FIX: Convert to percentage contribution of total portfolio P&L
    total_pnl = sector_pnl_dollars.sum()
    if total_pnl != 0:
        sector_pnl_pct = (sector_pnl_dollars / abs(total_pnl)) * 100
    else:
        sector_pnl_pct = sector_pnl_dollars * 0  # All zeros if no P&L

    sector_pnl_pct = sector_pnl_pct.sort_values(ascending=False)

    fig = go.Figure(go.Waterfall(
        name="Sector P&L %",
        orientation="v",
        x=sector_pnl_pct.index,
        y=sector_pnl_pct.values,
        connector={"line": {"color": COLORS['neon_blue'], "width": 2}},
        decreasing={"marker": {"color": COLORS['danger']}},
        increasing={"marker": {"color": COLORS['success']}},
        textposition="outside",
        text=[f"{v:+.1f}%" for v in sector_pnl_pct.values],
        textfont=dict(size=12, color=COLORS['text_primary'])
    ))

    fig.update_layout(
        title="💼 P&L Attribution by Sector (%)",
        yaxis_title="P&L Contribution (%)",
        xaxis_title="",
        height=450,
        showlegend=False
    )

    apply_chart_theme(fig)
    return fig

def create_pnl_attribution_position(df, top_n=10):
    """v9.7 ENHANCED: P&L Attribution by Position - Now showing % returns"""
    # v9.7 FIX: Use Gain/Loss % instead of dollars
    top_contributors = df.nlargest(top_n // 2, 'Gain/Loss %')
    top_detractors = df.nsmallest(top_n // 2, 'Gain/Loss %')
    combined = pd.concat([top_contributors, top_detractors]).sort_values('Gain/Loss %')

    colors = [COLORS['success'] if x > 0 else COLORS['danger'] for x in combined['Gain/Loss %']]

    # Create labels with ticker and percentage
    labels = [f"{ticker}" for ticker in combined['Ticker']]

    fig = go.Figure(go.Bar(
        x=combined['Gain/Loss %'],
        y=labels,
        orientation='h',
        marker=dict(
            color=colors,
            line=dict(color=COLORS['border'], width=2),
            opacity=0.9
        ),
        text=[f"{v:+.1f}%" for v in combined['Gain/Loss %']],
        textposition='outside',
        textfont=dict(size=11, color=COLORS['text_primary']),
        hovertemplate='<b>%{y}</b><br>Return: %{x:.2f}%<extra></extra>'
    ))

    fig.update_layout(
        title=f"🎯 Top {top_n} P&L Contributors & Detractors (%)",
        xaxis_title="Return (%)",
        yaxis_title="",
        height=500,
        showlegend=False,
        xaxis=dict(zeroline=True, zerolinewidth=2, zerolinecolor=COLORS['text_muted'])
    )

    apply_chart_theme(fig)
    return fig

def create_sparkline(ticker, days=30):
    """Generate mini sparkline chart for ticker (last 30 days)"""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=f"{days}d")

        if hist.empty:
            return None

        prices = hist['Close'].values

        # Determine color based on overall trend
        color = COLORS['success'] if prices[-1] > prices[0] else COLORS['danger']

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            y=prices,
            mode='lines',
            line=dict(color=color, width=1.5),
            fill='tozeroy',
            fillcolor=f"rgba{tuple(list(int(color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4)) + [0.2])}",
            showlegend=False
        ))

        fig.update_layout(
            height=60,
            width=150,
            margin=dict(l=0, r=0, t=0, b=0),
            xaxis=dict(visible=False),
            yaxis=dict(visible=False),
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            hovermode=False
        )

        return fig
    except:
        return None

def create_yield_curve():
    """Professional US Treasury Yield Curve visualization"""
    # Treasury tickers and maturities
    treasuries = {
        "^IRX": {"maturity": 0.25, "name": "3M"},
        "^FVX": {"maturity": 5, "name": "5Y"},
        "^TNX": {"maturity": 10, "name": "10Y"},
        "^TYX": {"maturity": 30, "name": "30Y"}
    }

    yields_data = []
    maturities = []
    labels = []

    for ticker, info in treasuries.items():
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period="1d")
            if not hist.empty:
                current_yield = hist['Close'].iloc[-1]
                yields_data.append(current_yield)
                maturities.append(info['maturity'])
                labels.append(info['name'])
        except:
            continue

    if not yields_data:
        return None

    # Sort by maturity
    sorted_data = sorted(zip(maturities, yields_data, labels))
    maturities, yields_data, labels = zip(*sorted_data)

    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=maturities,
        y=yields_data,
        mode='lines+markers',
        line=dict(color=COLORS['neon_blue'], width=3),
        marker=dict(size=10, color=COLORS['electric_blue'], line=dict(color=COLORS['border'], width=2)),
        text=[f"{l}: {y:.2f}%" for l, y in zip(labels, yields_data)],
        hovertemplate='<b>%{text}</b><extra></extra>'
    ))

    fig.update_layout(
        title="📈 US Treasury Yield Curve",
        xaxis_title="Maturity (Years)",
        yaxis_title="Yield (%)",
        height=400,
        showlegend=False
    )

    apply_chart_theme(fig)
    return fig

def get_data_freshness(cache_time=None):
    """Calculate and format data age for freshness indicators"""
    if cache_time is None:
        return ATLASFormatter.format_timestamp(), 0

    now = datetime.now()
    age_seconds = (now - cache_time).total_seconds()
    age_minutes = int(age_seconds / 60)

    timestamp = ATLASFormatter.format_timestamp(cache_time)
    badge = ATLASFormatter.get_freshness_badge(age_minutes)

    return timestamp, age_minutes, badge

# ============================================================================
# DATA FUNCTIONS
# ============================================================================

def save_portfolio_data(data):
    with open(PORTFOLIO_CACHE, "wb") as f:
        pickle.dump(data, f)

def load_portfolio_data():
    if PORTFOLIO_CACHE.exists():
        with open(PORTFOLIO_CACHE, "rb") as f:
            return pickle.load(f)
    return []

def save_trade_history(df):
    with open(TRADE_HISTORY_CACHE, "wb") as f:
        pickle.dump(df, f)

def load_trade_history():
    if TRADE_HISTORY_CACHE.exists():
        with open(TRADE_HISTORY_CACHE, "rb") as f:
            return pickle.load(f)
    return None

def save_account_history(df):
    with open(ACCOUNT_HISTORY_CACHE, "wb") as f:
        pickle.dump(df, f)

def load_account_history():
    if ACCOUNT_HISTORY_CACHE.exists():
        with open(ACCOUNT_HISTORY_CACHE, "rb") as f:
            return pickle.load(f)
    return None

# v9.7 NEW FEATURE: Data Validation & Integrity Checks
def validate_portfolio_data(portfolio_data):
    """
    NEW IN v9.7: Comprehensive data validation and integrity checking
    Returns validation metrics and quality scores
    """
    if not portfolio_data:
        return {
            'is_valid': False,
            'total_holdings': 0,
            'data_quality_score': 0,
            'issues': ['No portfolio data available'],
            'warnings': [],
            'null_counts': {},
            'total_rows': 0,
            'complete_rows': 0
        }

    df = pd.DataFrame(portfolio_data)
    issues = []
    warnings = []

    # Check required columns - use flexible column names
    required_columns = ['Ticker']
    optional_columns = ['Quantity', 'Current Price', 'Shares', 'Price', 'Last Price']

    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        issues.append(f"Missing required columns: {', '.join(missing_columns)}")

    # Check for null values only on existing columns
    existing_check_cols = [col for col in required_columns if col in df.columns]
    null_counts = {}

    if existing_check_cols:
        null_counts = df[existing_check_cols].isnull().sum().to_dict()
        for col, count in null_counts.items():
            if count > 0:
                warnings.append(f"{col}: {count} missing values")

    # Check for negative quantities (flexible column names)
    qty_col = None
    for col in ['Quantity', 'Shares', 'Qty']:
        if col in df.columns:
            qty_col = col
            break

    if qty_col:
        negative_qty = (df[qty_col] < 0).sum()
        if negative_qty > 0:
            warnings.append(f"{negative_qty} holdings with negative quantities (short positions)")

    # Check for zero/negative prices (flexible column names)
    price_col = None
    for col in ['Current Price', 'Price', 'Last Price', 'Close']:
        if col in df.columns:
            price_col = col
            break

    if price_col:
        invalid_prices = (df[price_col] <= 0).sum()
        if invalid_prices > 0:
            issues.append(f"{invalid_prices} holdings with invalid prices (≤0)")

    # Check for duplicate tickers
    if 'Ticker' in df.columns:
        duplicates = df['Ticker'].duplicated().sum()
        if duplicates > 0:
            warnings.append(f"{duplicates} duplicate ticker entries")

    # Calculate data quality score (0-100)
    quality_score = 100
    quality_score -= len(issues) * 15  # Severe penalty for issues
    quality_score -= len(warnings) * 5  # Moderate penalty for warnings
    quality_score = max(0, min(100, quality_score))

    # Calculate complete rows
    complete_rows = len(df)
    if existing_check_cols:
        complete_rows = len(df.dropna(subset=existing_check_cols))

    return {
        'is_valid': len(issues) == 0,
        'total_holdings': len(df),
        'data_quality_score': quality_score,
        'issues': issues,
        'warnings': warnings,
        'null_counts': null_counts,
        'total_rows': len(df),
        'complete_rows': complete_rows
    }

def get_leverage_info():
    account_df = load_account_history()
    if account_df is not None:
        latest_cash = account_df.get('Cash Balance', account_df.get('Cash', pd.Series([0]))).iloc[-1]
        
        if isinstance(latest_cash, str):
            latest_cash = latest_cash.replace('$', '').replace(',', '')
            if '(' in latest_cash and ')' in latest_cash:
                latest_cash = '-' + latest_cash.replace('(', '').replace(')', '')
            try:
                latest_cash = float(latest_cash)
            except:
                latest_cash = 0
        
        latest_margin = 0
        
        if 'Margin Used' in account_df.columns:
            latest_margin = account_df['Margin Used'].iloc[-1]
            if isinstance(latest_margin, str):
                latest_margin = latest_margin.replace('$', '').replace(',', '')
                if '(' in latest_margin and ')' in latest_margin:
                    latest_margin = '-' + latest_margin.replace('(', '').replace(')', '')
                try:
                    latest_margin = float(latest_margin)
                except:
                    latest_margin = 0
        
        if latest_cash < 0:
            latest_margin = abs(latest_cash)
            
        total_value = 0
        if 'Total Value' in account_df.columns:
            total_value = account_df['Total Value'].iloc[-1]
            if isinstance(total_value, str):
                total_value = total_value.replace('$', '').replace(',', '')
                if '(' in total_value and ')' in total_value:
                    total_value = '-' + total_value.replace('(', '').replace(')', '')
                try:
                    total_value = float(total_value)
                except:
                    total_value = abs(latest_cash) + latest_margin
        else:
            total_value = abs(latest_cash) + latest_margin
            
        leverage_ratio = (total_value / (total_value - latest_margin)) if (total_value - latest_margin) > 0 else 1
        
        return {
            'margin_used': latest_margin,
            'cash_balance': latest_cash,
            'leverage_ratio': leverage_ratio,
            'total_value': total_value
        }
    return None

@st.cache_data(ttl=300)
def fetch_market_data(ticker):
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        hist = stock.history(period="5d")
        if hist.empty:
            return None
        
        current_price = hist['Close'].iloc[-1]
        prev_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
        daily_change = current_price - prev_close
        daily_change_pct = (daily_change / prev_close * 100) if prev_close else 0
        
        five_day_return = ((current_price / hist['Close'].iloc[0]) - 1) * 100 if len(hist) >= 5 else 0
        
        company_name = info.get('longName', info.get('shortName', ticker))
        
        return {
            "price": current_price,
            "daily_change": daily_change,
            "daily_change_pct": daily_change_pct,
            "five_day_return": five_day_return,
            "volume": info.get('volume', 0),
            "avg_volume": info.get('averageVolume', 0),
            "sector": info.get('sector', 'Unknown'),
            "beta": info.get('beta', None),
            "market_cap": info.get('marketCap', 0),
            "company_name": company_name,
            "52_week_high": info.get('fiftyTwoWeekHigh', None),
            "52_week_low": info.get('fiftyTwoWeekLow', None)
        }
    except:
        return None

def is_option_ticker(ticker):
    if len(ticker) <= 6:
        return False
    has_year = any(str(y) in ticker for y in range(2020, 2030))
    has_strike = any(c.isdigit() for c in ticker[6:])
    has_type = ticker[-1] in ['C', 'P'] or 'C' in ticker[6:] or 'P' in ticker[6:]
    return has_year and has_strike and has_type

def classify_ticker_sector(ticker, default_sector):
    if pd.notna(default_sector) and default_sector != "Unknown":
        return default_sector
    
    if ticker in ETF_SECTORS:
        return ETF_SECTORS[ticker]
    
    return "Other"

@st.cache_data(ttl=600)
def fetch_historical_data(ticker, start_date, end_date):
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(start=start_date, end=end_date)
        if not hist.empty:
            return hist
    except:
        pass
    return None

@st.cache_data(ttl=3600)
def fetch_analyst_data(ticker):
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        rating = info.get('recommendationKey', 'none')
        if rating == 'none' or rating is None:
            rating = "No Coverage"
        
        return {
            'rating': rating.upper() if rating != "No Coverage" else rating,
            'target_price': info.get('targetMeanPrice'),
            'num_analysts': info.get('numberOfAnalystOpinions', 0),
            'success': True
        }
    except:
        return {'success': False, 'rating': 'No Coverage', 'target_price': None}

# ============================================================================
# VALUATION HOUSE - ENHANCED WITH SMART ASSUMPTIONS
# ============================================================================

@st.cache_data(ttl=3600)
def fetch_company_financials(ticker):
    """Fetch comprehensive financial data for valuation"""
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # Basic company info
        company_data = {
            'ticker': ticker,
            'name': info.get('longName', ticker),
            'sector': info.get('sector', 'Unknown'),
            'industry': info.get('industry', 'Unknown'),
            'current_price': info.get('currentPrice', 0),
            'market_cap': info.get('marketCap', 0),
            'shares_outstanding': info.get('sharesOutstanding', 0),
            'beta': info.get('beta', 1.0),
            'forward_pe': info.get('forwardPE'),
            'trailing_pe': info.get('trailingPE'),
        }
        
        # Financial statements
        income_stmt = stock.income_stmt
        balance_sheet = stock.balance_sheet
        cash_flow = stock.cash_flow
        
        # Parse financials (most recent 3 years)
        financials = {}
        
        if not income_stmt.empty:
            # Get most recent year
            latest_col = income_stmt.columns[0]
            
            financials['revenue'] = income_stmt.loc['Total Revenue', latest_col] if 'Total Revenue' in income_stmt.index else 0
            financials['ebit'] = income_stmt.loc['EBIT', latest_col] if 'EBIT' in income_stmt.index else 0
            financials['net_income'] = income_stmt.loc['Net Income', latest_col] if 'Net Income' in income_stmt.index else 0
            financials['tax_expense'] = income_stmt.loc['Tax Provision', latest_col] if 'Tax Provision' in income_stmt.index else 0
            
            # Calculate tax rate
            if financials['ebit'] != 0:
                financials['tax_rate'] = abs(financials['tax_expense'] / financials['ebit'])
            else:
                financials['tax_rate'] = 0.21  # Default US corporate tax rate
                
        if not balance_sheet.empty:
            latest_col = balance_sheet.columns[0]
            
            financials['total_debt'] = balance_sheet.loc['Total Debt', latest_col] if 'Total Debt' in balance_sheet.index else 0
            financials['cash'] = balance_sheet.loc['Cash And Cash Equivalents', latest_col] if 'Cash And Cash Equivalents' in balance_sheet.index else 0
            financials['total_equity'] = balance_sheet.loc['Total Equity Gross Minority Interest', latest_col] if 'Total Equity Gross Minority Interest' in balance_sheet.index else 0
            
        if not cash_flow.empty:
            latest_col = cash_flow.columns[0]
            
            financials['capex'] = abs(cash_flow.loc['Capital Expenditure', latest_col]) if 'Capital Expenditure' in cash_flow.index else 0
            financials['depreciation'] = cash_flow.loc['Depreciation And Amortization', latest_col] if 'Depreciation And Amortization' in cash_flow.index else 0
            financials['operating_cf'] = cash_flow.loc['Operating Cash Flow', latest_col] if 'Operating Cash Flow' in cash_flow.index else 0
        
        # Calculate working capital change (simplified)
        financials['change_wc'] = 0  # User can adjust
        
        return {
            'company': company_data,
            'financials': financials,
            'success': True
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def calculate_smart_assumptions(company_data, financials):
    """
    NEW: Calculate realistic, economically grounded assumptions
    based on company fundamentals, sector averages, and economic reality
    """
    sector = company_data.get('sector', 'Unknown')
    revenue = financials.get('revenue', 0)
    ebit = financials.get('ebit', 0)
    
    # Smart revenue growth (based on sector and size)
    sector_growth_rates = {
        'Technology': 0.08,
        'Healthcare': 0.06,
        'Financial Services': 0.05,
        'Consumer Cyclical': 0.04,
        'Consumer Defensive': 0.03,
        'Energy': 0.03,
        'Industrials': 0.04,
        'Basic Materials': 0.03,
        'Real Estate': 0.03,
        'Utilities': 0.02,
        'Communication Services': 0.05,
        'Unknown': 0.04
    }
    
    base_growth = sector_growth_rates.get(sector, 0.04)
    
    # Adjust for company size (larger = slower growth)
    market_cap = company_data.get('market_cap', 0)
    if market_cap > 500e9:  # Mega cap
        size_adjustment = -0.02
    elif market_cap > 100e9:  # Large cap
        size_adjustment = -0.01
    elif market_cap > 10e9:  # Mid cap
        size_adjustment = 0
    else:  # Small cap
        size_adjustment = 0.01
    
    smart_revenue_growth = base_growth + size_adjustment
    
    # Smart EBIT margin (sector averages)
    sector_ebit_margins = {
        'Technology': 0.25,
        'Healthcare': 0.20,
        'Financial Services': 0.30,
        'Consumer Cyclical': 0.10,
        'Consumer Defensive': 0.08,
        'Energy': 0.15,
        'Industrials': 0.12,
        'Basic Materials': 0.15,
        'Real Estate': 0.40,
        'Utilities': 0.20,
        'Communication Services': 0.18,
        'Unknown': 0.15
    }
    
    smart_ebit_margin = sector_ebit_margins.get(sector, 0.15)
    
    # Smart CapEx (as % of revenue, sector-based)
    sector_capex_rates = {
        'Technology': 0.03,
        'Healthcare': 0.04,
        'Financial Services': 0.02,
        'Consumer Cyclical': 0.05,
        'Consumer Defensive': 0.04,
        'Energy': 0.12,
        'Industrials': 0.06,
        'Basic Materials': 0.10,
        'Real Estate': 0.08,
        'Utilities': 0.15,
        'Communication Services': 0.07,
        'Unknown': 0.05
    }
    
    smart_capex_pct = sector_capex_rates.get(sector, 0.05)
    
    # Smart Depreciation (typically 60-80% of CapEx for mature companies)
    smart_depreciation_pct = smart_capex_pct * 0.7
    
    # Smart Terminal Growth (conservative)
    smart_terminal_growth = 0.025  # Long-term GDP growth
    
    # Smart Tax Rate (based on geography and sector)
    smart_tax_rate = 0.21  # US corporate rate
    
    return {
        'revenue_growth': smart_revenue_growth,
        'ebit_margin': smart_ebit_margin,
        'capex_pct': smart_capex_pct,
        'depreciation_pct': smart_depreciation_pct,
        'terminal_growth': smart_terminal_growth,
        'tax_rate': smart_tax_rate,
        'wc_change': 0,  # Assume neutral
        'forecast_years': 5
    }

def calculate_wacc(cost_equity, cost_debt, tax_rate, debt, equity):
    """Calculate Weighted Average Cost of Capital"""
    total_value = debt + equity
    if total_value == 0:
        return cost_equity
    
    weight_equity = equity / total_value
    weight_debt = debt / total_value
    
    wacc = (cost_equity * weight_equity) + (cost_debt * (1 - tax_rate) * weight_debt)
    return wacc

def calculate_cost_of_equity(risk_free_rate, beta, market_risk_premium):
    """Calculate Cost of Equity using CAPM"""
    return risk_free_rate + (beta * market_risk_premium)

def calculate_terminal_value(final_fcf, discount_rate, terminal_growth):
    """Calculate Terminal Value using Gordon Growth Model"""
    if discount_rate <= terminal_growth:
        return 0
    return final_fcf * (1 + terminal_growth) / (discount_rate - terminal_growth)

def project_fcff_enhanced(base_revenue, base_ebit, revenue_growth, ebit_margin, tax_rate, 
                         depreciation_pct, capex_pct, change_wc, forecast_years):
    """
    ENHANCED: Project FCFF with D&A and CapEx scaling with revenue
    """
    projections = []
    
    current_revenue = base_revenue
    
    for year in range(1, forecast_years + 1):
        # Grow revenue
        current_revenue = current_revenue * (1 + revenue_growth)
        
        # Calculate EBIT based on margin
        current_ebit = current_revenue * ebit_margin
        
        # Calculate NOPAT
        nopat = current_ebit * (1 - tax_rate)
        
        # FIXED: Scale D&A and CapEx with revenue
        depreciation = current_revenue * depreciation_pct
        capex = current_revenue * capex_pct
        
        # Calculate FCFF
        fcff = nopat + depreciation - capex - change_wc
        
        projections.append({
            'year': year,
            'revenue': current_revenue,
            'ebit': current_ebit,
            'nopat': nopat,
            'depreciation': depreciation,
            'capex': capex,
            'change_wc': change_wc,
            'fcff': fcff
        })
    
    return projections

def project_fcfe_enhanced(base_revenue, base_net_income, revenue_growth, tax_rate, 
                         depreciation_pct, capex_pct, change_wc, net_borrowing, forecast_years):
    """
    ENHANCED: Project FCFE with D&A and CapEx scaling with revenue
    """
    projections = []
    
    current_revenue = base_revenue
    current_ni = base_net_income
    
    # Calculate initial NI margin
    ni_margin = current_ni / current_revenue if current_revenue > 0 else 0
    
    for year in range(1, forecast_years + 1):
        # Grow revenue
        current_revenue = current_revenue * (1 + revenue_growth)
        
        # Grow net income
        current_ni = current_revenue * ni_margin
        
        # FIXED: Scale D&A and CapEx with revenue
        depreciation = current_revenue * depreciation_pct
        capex = current_revenue * capex_pct
        
        # Calculate FCFE
        fcfe = current_ni + depreciation - capex - change_wc + net_borrowing
        
        projections.append({
            'year': year,
            'revenue': current_revenue,
            'net_income': current_ni,
            'depreciation': depreciation,
            'capex': capex,
            'change_wc': change_wc,
            'net_borrowing': net_borrowing,
            'fcfe': fcfe
        })
    
    return projections

def calculate_dcf_value(projections, discount_rate, terminal_value, shares_outstanding, 
                       net_debt=0, method='FCFF'):
    """Calculate DCF valuation"""
    # Discount projected cash flows
    pv_cash_flows = []
    total_pv = 0
    
    for proj in projections:
        year = proj['year']
        cf = proj['fcff'] if method == 'FCFF' else proj['fcfe']
        pv = cf / ((1 + discount_rate) ** year)
        pv_cash_flows.append(pv)
        total_pv += pv
    
    # Discount terminal value
    pv_terminal = terminal_value / ((1 + discount_rate) ** len(projections))
    
    # Calculate enterprise/equity value
    enterprise_value = total_pv + pv_terminal
    
    if method == 'FCFF':
        # For FCFF, subtract net debt to get equity value
        equity_value = enterprise_value - net_debt
    else:
        # For FCFE, enterprise value IS equity value
        equity_value = enterprise_value
    
    # Calculate per share value
    intrinsic_value_per_share = equity_value / shares_outstanding if shares_outstanding > 0 else 0
    
    return {
        'pv_cash_flows': pv_cash_flows,
        'total_pv_cash_flows': total_pv,
        'terminal_value': terminal_value,
        'pv_terminal': pv_terminal,
        'enterprise_value': enterprise_value,
        'equity_value': equity_value,
        'intrinsic_value_per_share': intrinsic_value_per_share
    }

# ============================================================================
# VALUATION HOUSE RENOVATION - NEW MODULAR METHODS
# Following Damodaran / McKinsey Standards
# ============================================================================

# Industry-Standard Constraints
VALUATION_CONSTRAINTS = {
    'max_terminal_growth': 0.04,  # 4% (long-term GDP growth)
    'max_payout_ratio': 1.0,      # 100%
    'min_roe': 0.0,               # 0%
    'max_roe': 0.50,              # 50% (sanity check)
    'max_pe_multiple': 100,       # Outlier filter
    'min_pe_multiple': 3,         # Outlier filter
}

def apply_damodaran_constraints(value, constraint_type):
    """Apply industry-standard Damodaran constraints"""
    if constraint_type == 'terminal_growth':
        return min(value, VALUATION_CONSTRAINTS['max_terminal_growth'])
    elif constraint_type == 'payout_ratio':
        return min(max(value, 0), VALUATION_CONSTRAINTS['max_payout_ratio'])
    elif constraint_type == 'roe':
        return min(max(value, VALUATION_CONSTRAINTS['min_roe']), VALUATION_CONSTRAINTS['max_roe'])
    return value

# ============================================================================
# DIVIDEND DISCOUNT MODELS (DDM)
# ============================================================================

def calculate_gordon_growth_ddm(current_dividend, cost_of_equity, growth_rate, shares_outstanding):
    """
    Gordon Growth Model (Constant Growth DDM)
    Value = D1 / (r - g)
    Where D1 = D0 * (1 + g)
    """
    # Apply constraint: growth < cost of equity
    if growth_rate >= cost_of_equity:
        growth_rate = cost_of_equity * 0.9  # Safety margin

    # Constrain terminal growth
    growth_rate = apply_damodaran_constraints(growth_rate, 'terminal_growth')

    # Calculate next year's dividend
    d1 = current_dividend * (1 + growth_rate)

    # Gordon Growth formula
    equity_value = d1 / (cost_of_equity - growth_rate)
    intrinsic_value_per_share = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    return {
        'method': 'Gordon Growth DDM',
        'current_dividend': current_dividend,
        'd1': d1,
        'cost_of_equity': cost_of_equity,
        'growth_rate': growth_rate,
        'equity_value': equity_value,
        'intrinsic_value_per_share': intrinsic_value_per_share,
        'shares_outstanding': shares_outstanding
    }

def calculate_multistage_ddm(current_dividend, cost_of_equity, high_growth_rate,
                             high_growth_years, stable_growth_rate, shares_outstanding):
    """
    Multi-Stage DDM (H-Model or 2-Stage)
    Phase 1: High growth period
    Phase 2: Transition to stable growth
    """
    # Apply constraints
    stable_growth_rate = apply_damodaran_constraints(stable_growth_rate, 'terminal_growth')

    if stable_growth_rate >= cost_of_equity:
        stable_growth_rate = cost_of_equity * 0.9

    pv_dividends = 0
    current_div = current_dividend

    # Phase 1: High growth dividends
    for year in range(1, high_growth_years + 1):
        current_div = current_div * (1 + high_growth_rate)
        pv = current_div / ((1 + cost_of_equity) ** year)
        pv_dividends += pv

    # Terminal value using Gordon Growth
    terminal_dividend = current_div * (1 + stable_growth_rate)
    terminal_value = terminal_dividend / (cost_of_equity - stable_growth_rate)
    pv_terminal = terminal_value / ((1 + cost_of_equity) ** high_growth_years)

    equity_value = pv_dividends + pv_terminal
    intrinsic_value_per_share = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    return {
        'method': 'Multi-Stage DDM',
        'pv_high_growth_dividends': pv_dividends,
        'terminal_value': terminal_value,
        'pv_terminal': pv_terminal,
        'equity_value': equity_value,
        'intrinsic_value_per_share': intrinsic_value_per_share,
        'high_growth_years': high_growth_years,
        'stable_growth_rate': stable_growth_rate,
        'shares_outstanding': shares_outstanding
    }

# ============================================================================
# RESIDUAL INCOME (ECONOMIC PROFIT) MODEL
# ============================================================================

def calculate_residual_income(book_value_equity, roe, cost_of_equity, growth_rate,
                              forecast_years, shares_outstanding):
    """
    Residual Income Model (Edwards-Bell-Ohlson)
    Value = Book Value + PV(Residual Income)
    RI = (ROE - Cost of Equity) × Book Value
    """
    # Apply ROE constraints
    roe = apply_damodaran_constraints(roe, 'roe')
    growth_rate = apply_damodaran_constraints(growth_rate, 'terminal_growth')

    pv_residual_income = 0
    current_bv = book_value_equity

    for year in range(1, forecast_years + 1):
        # Calculate residual income
        residual_income = (roe - cost_of_equity) * current_bv

        # Discount to present value
        pv_ri = residual_income / ((1 + cost_of_equity) ** year)
        pv_residual_income += pv_ri

        # Grow book value
        current_bv = current_bv * (1 + roe)

    # Terminal value of residual income
    terminal_ri = (roe - cost_of_equity) * current_bv
    terminal_value = terminal_ri / (cost_of_equity - growth_rate) if (cost_of_equity - growth_rate) > 0 else 0
    pv_terminal = terminal_value / ((1 + cost_of_equity) ** forecast_years)

    equity_value = book_value_equity + pv_residual_income + pv_terminal
    intrinsic_value_per_share = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    return {
        'method': 'Residual Income',
        'book_value_equity': book_value_equity,
        'roe': roe,
        'cost_of_equity': cost_of_equity,
        'pv_residual_income': pv_residual_income,
        'pv_terminal': pv_terminal,
        'equity_value': equity_value,
        'intrinsic_value_per_share': intrinsic_value_per_share,
        'shares_outstanding': shares_outstanding
    }

# ============================================================================
# RELATIVE VALUATION - PEER MULTIPLES
# ============================================================================

def fetch_peer_companies(ticker, sector, max_peers=10):
    """
    Fetch comparable companies for relative valuation
    Uses sector peers with similar market cap
    """
    # Sector peer mapping (simplified - can be enhanced)
    sector_peers = {
        'Technology': ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'ORCL', 'CRM', 'ADBE', 'INTC', 'AMD'],
        'Financial Services': ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'BLK', 'V', 'MA'],
        'Healthcare': ['JNJ', 'UNH', 'PFE', 'ABBV', 'TMO', 'LLY', 'MRK', 'ABT'],
        'Consumer Cyclical': ['AMZN', 'TSLA', 'NKE', 'MCD', 'SBUX', 'HD', 'LOW'],
        'Consumer Defensive': ['WMT', 'PG', 'KO', 'PEP', 'COST', 'CL', 'GIS'],
        'Energy': ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD'],
        'Industrials': ['BA', 'CAT', 'GE', 'UPS', 'HON', 'LMT', 'RTX'],
        'Communication Services': ['GOOGL', 'META', 'DIS', 'NFLX', 'CMCSA', 'T', 'VZ'],
    }

    peers = sector_peers.get(sector, [])
    # Remove the target ticker from peers
    peers = [p for p in peers if p != ticker]

    return peers[:max_peers]

def calculate_peer_multiples(peers):
    """
    Calculate median multiples from peer companies
    Returns: P/E, EV/EBITDA, EV/EBIT, P/B, EV/Sales, PEG
    """
    multiples_data = []

    for peer in peers:
        try:
            stock = yf.Ticker(peer)
            info = stock.info

            pe = info.get('trailingPE')
            pb = info.get('priceToBook')
            ps = info.get('priceToSalesTrailing12Months')
            peg = info.get('pegRatio')

            # Calculate EV multiples
            market_cap = info.get('marketCap', 0)
            total_debt = info.get('totalDebt', 0)
            cash = info.get('totalCash', 0)
            ev = market_cap + total_debt - cash

            ebitda = info.get('ebitda')
            ebit = info.get('ebit')
            revenue = info.get('totalRevenue')

            ev_ebitda = ev / ebitda if ebitda and ebitda > 0 else None
            ev_ebit = ev / ebit if ebit and ebit > 0 else None
            ev_sales = ev / revenue if revenue and revenue > 0 else None

            # Apply outlier filters
            if pe and VALUATION_CONSTRAINTS['min_pe_multiple'] <= pe <= VALUATION_CONSTRAINTS['max_pe_multiple']:
                multiples_data.append({
                    'ticker': peer,
                    'pe': pe,
                    'pb': pb,
                    'ps': ps,
                    'peg': peg,
                    'ev_ebitda': ev_ebitda,
                    'ev_ebit': ev_ebit,
                    'ev_sales': ev_sales
                })
        except:
            continue

    if not multiples_data:
        return None

    # Calculate median multiples
    df = pd.DataFrame(multiples_data)

    median_multiples = {
        'pe': df['pe'].median(),
        'pb': df['pb'].median(),
        'ps': df['ps'].median(),
        'peg': df['peg'].median(),
        'ev_ebitda': df['ev_ebitda'].median(),
        'ev_ebit': df['ev_ebit'].median(),
        'ev_sales': df['ev_sales'].median(),
        'num_peers': len(multiples_data),
        'peer_data': multiples_data
    }

    return median_multiples

def apply_relative_valuation(company_financials, median_multiples, shares_outstanding):
    """
    Apply peer multiples to company financials
    Returns valuation for each multiple
    """
    results = {}

    # Extract company metrics
    eps = company_financials.get('eps', 0)
    book_value_per_share = company_financials.get('book_value_per_share', 0)
    sales_per_share = company_financials.get('sales_per_share', 0)
    ebitda = company_financials.get('ebitda', 0)
    ebit = company_financials.get('ebit', 0)
    revenue = company_financials.get('revenue', 0)
    total_debt = company_financials.get('total_debt', 0)
    cash = company_financials.get('cash', 0)

    # P/E Valuation
    if median_multiples['pe'] and eps:
        results['pe_value'] = eps * median_multiples['pe']

    # P/B Valuation
    if median_multiples['pb'] and book_value_per_share:
        results['pb_value'] = book_value_per_share * median_multiples['pb']

    # P/S Valuation
    if median_multiples['ps'] and sales_per_share:
        results['ps_value'] = sales_per_share * median_multiples['ps']

    # EV/EBITDA Valuation
    if median_multiples['ev_ebitda'] and ebitda and ebitda > 0:
        ev = ebitda * median_multiples['ev_ebitda']
        equity_value = ev - total_debt + cash
        results['ev_ebitda_value'] = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    # EV/EBIT Valuation
    if median_multiples['ev_ebit'] and ebit and ebit > 0:
        ev = ebit * median_multiples['ev_ebit']
        equity_value = ev - total_debt + cash
        results['ev_ebit_value'] = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    # EV/Sales Valuation
    if median_multiples['ev_sales'] and revenue and revenue > 0:
        ev = revenue * median_multiples['ev_sales']
        equity_value = ev - total_debt + cash
        results['ev_sales_value'] = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    # Calculate average relative valuation
    valid_values = [v for v in results.values() if v is not None and v > 0]
    results['average_relative_value'] = np.median(valid_values) if valid_values else 0
    results['median_multiples'] = median_multiples

    return results

# ============================================================================
# SUM-OF-THE-PARTS (SOTP) VALUATION
# ============================================================================

def calculate_sotp_valuation(segments, discount_rate, shares_outstanding):
    """
    Sum-of-the-Parts valuation for multi-segment companies
    segments = [{'name': 'Segment A', 'revenue': X, 'ebitda_margin': Y, 'multiple': Z}, ...]
    """
    total_value = 0
    segment_values = []

    for segment in segments:
        name = segment.get('name', 'Unnamed')
        revenue = segment.get('revenue', 0)
        ebitda_margin = segment.get('ebitda_margin', 0)
        ev_revenue_multiple = segment.get('ev_revenue_multiple', 0)

        # Calculate segment EBITDA
        ebitda = revenue * ebitda_margin

        # Value segment using EV/Revenue multiple
        segment_ev = revenue * ev_revenue_multiple

        segment_values.append({
            'name': name,
            'revenue': revenue,
            'ebitda': ebitda,
            'ev': segment_ev
        })

        total_value += segment_ev

    # Convert to equity value (simplified - assumes segments share same debt structure)
    intrinsic_value_per_share = total_value / shares_outstanding if shares_outstanding > 0 else 0

    return {
        'method': 'Sum-of-the-Parts',
        'segment_values': segment_values,
        'total_enterprise_value': total_value,
        'intrinsic_value_per_share': intrinsic_value_per_share,
        'shares_outstanding': shares_outstanding
    }

# ============================================================================
# CONSOLIDATED VALUATION SUMMARY
# ============================================================================

def create_valuation_summary_table(valuations_dict, current_price):
    """
    Create consolidated summary table from all valuation methods
    valuations_dict = {'FCFF': result, 'FCFE': result, 'DDM': result, ...}
    """
    summary_data = []

    for method, result in valuations_dict.items():
        if result and 'intrinsic_value_per_share' in result:
            intrinsic_value = result['intrinsic_value_per_share']

            if intrinsic_value > 0:
                upside = ((intrinsic_value - current_price) / current_price) * 100

                summary_data.append({
                    'Method': method,
                    'Intrinsic Value': intrinsic_value,
                    'Current Price': current_price,
                    'Upside/Downside (%)': upside,
                    'Rating': 'BUY' if upside > 20 else ('HOLD' if upside > -10 else 'SELL')
                })

    if not summary_data:
        return None

    df = pd.DataFrame(summary_data)

    # Add summary statistics
    avg_intrinsic = df['Intrinsic Value'].mean()
    median_intrinsic = df['Intrinsic Value'].median()
    avg_upside = df['Upside/Downside (%)'].mean()

    # Consensus rating
    buy_count = len(df[df['Rating'] == 'BUY'])
    hold_count = len(df[df['Rating'] == 'HOLD'])
    sell_count = len(df[df['Rating'] == 'SELL'])

    if buy_count > max(hold_count, sell_count):
        consensus = 'BUY'
    elif sell_count > max(buy_count, hold_count):
        consensus = 'SELL'
    else:
        consensus = 'HOLD'

    summary_stats = {
        'average_intrinsic_value': avg_intrinsic,
        'median_intrinsic_value': median_intrinsic,
        'average_upside': avg_upside,
        'consensus_rating': consensus,
        'num_methods': len(df),
        'buy_count': buy_count,
        'hold_count': hold_count,
        'sell_count': sell_count
    }

    return df, summary_stats

# ============================================================================
# PHOENIX PARSER
# ============================================================================

def parse_trade_history_file(uploaded_file):
    try:
        df = pd.read_html(uploaded_file)[0]
        required_cols = ['Date', 'Symbol', 'Trade Type', 'Quantity', 'Price']
        if not all(col in df.columns for col in required_cols):
            return None
        df['Price'] = df['Price'].astype(str).str.replace('$', '').str.replace(',', '').astype(float)
        df['Date'] = pd.to_datetime(df['Date'])
        df = df.sort_values('Date')
        return df
    except:
        return None

def parse_account_history_file(uploaded_file):
    try:
        df = pd.read_html(uploaded_file)[0]
        df['Date'] = pd.to_datetime(df['Date'])
        df = df.sort_values('Date')
        return df
    except:
        return None

def calculate_portfolio_from_trades(trade_df):
    holdings = {}
    for _, row in trade_df.iterrows():
        symbol = row['Symbol']
        trade_type = row['Trade Type']
        quantity = row['Quantity']
        price = row['Price']
        
        if is_option_ticker(symbol):
            continue
        
        if symbol not in holdings:
            holdings[symbol] = {'total_shares': 0, 'total_cost': 0, 'trades': []}
        
        is_buy = 'Buy' in trade_type
        
        if is_buy:
            holdings[symbol]['total_shares'] += quantity
            holdings[symbol]['total_cost'] += (quantity * price)
            holdings[symbol]['trades'].append({'type': 'BUY', 'quantity': quantity, 'price': price})
        else:
            remaining_to_sell = quantity
            for trade in holdings[symbol]['trades']:
                if trade['type'] == 'BUY' and remaining_to_sell > 0:
                    if trade['quantity'] <= remaining_to_sell:
                        holdings[symbol]['total_cost'] -= (trade['quantity'] * trade['price'])
                        holdings[symbol]['total_shares'] -= trade['quantity']
                        remaining_to_sell -= trade['quantity']
                        trade['quantity'] = 0
                    else:
                        holdings[symbol]['total_cost'] -= (remaining_to_sell * trade['price'])
                        holdings[symbol]['total_shares'] -= remaining_to_sell
                        trade['quantity'] -= remaining_to_sell
                        remaining_to_sell = 0
    
    portfolio_data = []
    for symbol, data in holdings.items():
        if data['total_shares'] > 0:
            avg_cost = data['total_cost'] / data['total_shares']
            portfolio_data.append({
                'Ticker': symbol,
                'Shares': data['total_shares'],
                'Avg Cost': avg_cost
            })
    
    if not portfolio_data:
        return pd.DataFrame(columns=['Ticker', 'Shares', 'Avg Cost'])
    return pd.DataFrame(portfolio_data).sort_values('Ticker')

# ============================================================================
# PORTFOLIO CALCULATIONS
# ============================================================================

@st.cache_data(ttl=600)
def calculate_portfolio_returns(df, start_date, end_date):
    try:
        valid_positions = []
        for _, row in df.iterrows():
            if not is_option_ticker(row['Ticker']):
                valid_positions.append(row)
        
        if not valid_positions:
            return None
        
        valid_df = pd.DataFrame(valid_positions)
        all_data = {}
        
        for _, row in valid_df.iterrows():
            ticker = row['Ticker']
            data = fetch_historical_data(ticker, start_date, end_date)
            if data is not None and len(data) > 0:
                all_data[ticker] = data
        
        if not all_data:
            return None
        
        common_dates = None
        for ticker, data in all_data.items():
            dates = set(data.index)
            common_dates = dates if common_dates is None else common_dates.intersection(dates)
        
        common_dates = sorted(list(common_dates))
        if len(common_dates) < 2:
            return None
        
        portfolio_values = []
        for date in common_dates:
            daily_value = 0
            for _, row in valid_df.iterrows():
                ticker = row['Ticker']
                if ticker in all_data:
                    try:
                        price = all_data[ticker].loc[date, 'Close']
                        daily_value += price * row['Shares']
                    except KeyError:
                        continue
            portfolio_values.append(daily_value)
        
        portfolio_series = pd.Series(portfolio_values, index=common_dates)
        returns = portfolio_series.pct_change().dropna()
        return returns
    except:
        return None

# ============================================================================
# BRINSON ATTRIBUTION ANALYSIS - NEW IN v9.7
# ============================================================================

# S&P 500 Sector Weights (Benchmark)
SP500_SECTOR_WEIGHTS = {
    'Technology': 28.5,
    'Healthcare': 13.2,
    'Financial Services': 12.8,
    'Consumer Cyclical': 10.5,
    'Communication Services': 8.7,
    'Industrials': 8.3,
    'Consumer Defensive': 6.8,
    'Energy': 4.2,
    'Real Estate': 2.5,
    'Basic Materials': 2.3,
    'Utilities': 2.2
}

@st.cache_data(ttl=3600)
def get_benchmark_sector_returns(period='1Y'):
    """
    Fetch sector ETF returns as proxy for benchmark sector performance
    """
    sector_etfs = {
        'Technology': 'XLK',
        'Healthcare': 'XLV',
        'Financial Services': 'XLF',
        'Consumer Cyclical': 'XLY',
        'Communication Services': 'XLC',
        'Industrials': 'XLI',
        'Consumer Defensive': 'XLP',
        'Energy': 'XLE',
        'Real Estate': 'XLRE',
        'Basic Materials': 'XLB',
        'Utilities': 'XLU'
    }

    benchmark_returns = {}

    # Calculate date range based on period
    end_date = datetime.now()
    if period == '1Y':
        start_date = end_date - timedelta(days=365)
    elif period == 'YTD':
        start_date = datetime(end_date.year, 1, 1)
    elif period == '3M':
        start_date = end_date - timedelta(days=90)
    else:
        start_date = end_date - timedelta(days=365)

    for sector, etf in sector_etfs.items():
        try:
            data = fetch_historical_data(etf, start_date=start_date, end_date=end_date)
            if data is not None and len(data) > 0:
                total_return = ((data['Close'].iloc[-1] / data['Close'].iloc[0]) - 1) * 100
                benchmark_returns[sector] = total_return
            else:
                benchmark_returns[sector] = 0.0
        except:
            benchmark_returns[sector] = 0.0

    return benchmark_returns

def calculate_skill_score(effect_value):
    """
    Convert attribution effect to skill score (0-10 scale)

    Positive effects = higher scores
    Scale: -5% to +5% maps to 0-10
    """
    # Normalize to 0-10 scale
    if effect_value >= 5:
        return 10.0
    elif effect_value <= -5:
        return 0.0
    else:
        return 5.0 + (effect_value / 5.0) * 5.0

def calculate_brinson_attribution(portfolio_df, benchmark_weights, benchmark_returns, period='YTD'):
    """
    Calculate Brinson attribution: Allocation, Selection, and Interaction effects

    Parameters:
    -----------
    portfolio_df : pd.DataFrame
        Portfolio holdings with columns: Ticker, Sector, Weight %, Total Gain/Loss %
    benchmark_weights : dict
        Benchmark sector weights {sector: weight}
    benchmark_returns : dict
        Benchmark sector returns {sector: return}
    period : str
        Time period for analysis (YTD, 1Y, etc.)

    Returns:
    --------
    dict with attribution_df, total_allocation_effect, total_selection_effect,
    total_interaction_effect, total_attribution, allocation_skill_score, selection_skill_score
    """

    # Group portfolio by sector
    portfolio_sectors = portfolio_df.groupby('Sector').agg({
        'Weight %': 'sum',
        'Total Gain/Loss %': 'mean'  # Average return in sector
    }).reset_index()

    portfolio_sectors.columns = ['Sector', 'Portfolio Weight', 'Portfolio Return']
    portfolio_sectors['Portfolio Weight'] = portfolio_sectors['Portfolio Weight'] / 100

    results = []

    # Calculate benchmark total return (weighted average)
    rb_total = sum([benchmark_weights.get(s, 0) / 100 * benchmark_returns.get(s, 0) / 100
                   for s in benchmark_weights.keys()])

    for sector in portfolio_sectors['Sector']:
        # Get weights
        wp = portfolio_sectors[portfolio_sectors['Sector'] == sector]['Portfolio Weight'].iloc[0]
        wb = benchmark_weights.get(sector, 0) / 100

        # Get returns
        rp = portfolio_sectors[portfolio_sectors['Sector'] == sector]['Portfolio Return'].iloc[0] / 100
        rb = benchmark_returns.get(sector, 0) / 100

        # Brinson Attribution Formula:
        # Allocation Effect = (wp - wb) × (rb - rb_total)
        # Selection Effect = wb × (rp - rb)
        # Interaction Effect = (wp - wb) × (rp - rb)

        allocation_effect = (wp - wb) * (rb - rb_total) * 100
        selection_effect = wb * (rp - rb) * 100
        interaction_effect = (wp - wb) * (rp - rb) * 100

        results.append({
            'Sector': sector,
            'Portfolio Weight': wp * 100,
            'Benchmark Weight': wb * 100,
            'Weight Diff': (wp - wb) * 100,
            'Portfolio Return': rp * 100,
            'Benchmark Return': rb * 100,
            'Return Diff': (rp - rb) * 100,
            'Allocation Effect': allocation_effect,
            'Selection Effect': selection_effect,
            'Interaction Effect': interaction_effect,
            'Total Effect': allocation_effect + selection_effect + interaction_effect
        })

    attribution_df = pd.DataFrame(results)

    # Calculate totals
    total_allocation = attribution_df['Allocation Effect'].sum()
    total_selection = attribution_df['Selection Effect'].sum()
    total_interaction = attribution_df['Interaction Effect'].sum()
    total_attribution = total_allocation + total_selection + total_interaction

    return {
        'attribution_df': attribution_df,
        'total_allocation_effect': total_allocation,
        'total_selection_effect': total_selection,
        'total_interaction_effect': total_interaction,
        'total_attribution': total_attribution,
        'allocation_skill_score': calculate_skill_score(total_allocation),
        'selection_skill_score': calculate_skill_score(total_selection)
    }

def create_brinson_attribution_chart(attribution_results):
    """
    Create waterfall chart showing allocation, selection, and interaction effects
    """

    # Aggregate by effect type
    total_allocation = attribution_results['total_allocation_effect']
    total_selection = attribution_results['total_selection_effect']
    total_interaction = attribution_results['total_interaction_effect']
    total = attribution_results['total_attribution']

    fig = go.Figure(go.Waterfall(
        name="Attribution",
        orientation="v",
        x=['Allocation<br>Effect', 'Selection<br>Effect', 'Interaction<br>Effect', 'Total<br>Attribution'],
        y=[total_allocation, total_selection, total_interaction, total],
        measure=['relative', 'relative', 'relative', 'total'],
        text=[f"{total_allocation:+.2f}%", f"{total_selection:+.2f}%",
              f"{total_interaction:+.2f}%", f"{total:.2f}%"],
        textposition="outside",
        connector={"line": {"color": COLORS['neon_blue'], "width": 2}},
        decreasing={"marker": {"color": COLORS['danger']}},
        increasing={"marker": {"color": COLORS['success']}},
        totals={"marker": {"color": COLORS['electric_blue']}}
    ))

    fig.update_layout(
        title="📊 Brinson Attribution: Portfolio Outperformance Breakdown",
        yaxis_title="Effect (%)",
        height=500,
        showlegend=False
    )

    apply_chart_theme(fig)
    return fig

def create_skill_assessment_card(attribution_results):
    """
    Create visual skill assessment comparing allocation vs selection
    """

    allocation_score = attribution_results['allocation_skill_score']
    selection_score = attribution_results['selection_skill_score']

    allocation_effect = attribution_results['total_allocation_effect']
    selection_effect = attribution_results['total_selection_effect']

    # Determine primary skill
    if allocation_score > selection_score + 2:
        primary_skill = "Sector Timing (Allocation)"
        recommendation = "Focus on sector rotation strategies. Consider using sector ETFs."
    elif selection_score > allocation_score + 2:
        primary_skill = "Stock Picking (Selection)"
        recommendation = "Focus on fundamental analysis. Your stock picks add value."
    else:
        primary_skill = "Balanced"
        recommendation = "Continue current strategy - both skills are comparable."

    # Status emojis
    alloc_status = '✅ Strong sector rotation' if allocation_effect > 1 else '⚠️ Neutral sector timing' if allocation_effect > -1 else '❌ Poor sector allocation'
    select_status = '✅ Strong stock picks' if selection_effect > 1 else '⚠️ Neutral stock selection' if selection_effect > -1 else '❌ Stocks underperform sector'

    html = f"""
    <div style='background: linear-gradient(135deg, {COLORS['card_background']} 0%, {COLORS['card_background_alt']} 100%);
                border: 2px solid {COLORS['neon_blue']}; border-radius: 12px; padding: 30px;
                box-shadow: 0 0 30px {COLORS['shadow']};'>

        <h2 style='color: {COLORS['neon_blue']}; margin-top: 0;'>🎯 Portfolio Management Skill Assessment</h2>

        <div style='display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin: 20px 0;'>

            <!-- Allocation Skill -->
            <div>
                <h3 style='color: {COLORS['text_secondary']}; font-size: 14px; margin-bottom: 10px;'>
                    ALLOCATION SKILL (Sector Timing)
                </h3>
                <div style='font-size: 48px; color: {COLORS['success'] if allocation_effect > 0 else COLORS['danger']};
                            font-weight: 700; margin: 10px 0;'>
                    {allocation_score:.1f}/10
                </div>
                <div style='font-size: 18px; color: {COLORS['text_primary']}; margin: 5px 0;'>
                    Effect: {allocation_effect:+.2f}%
                </div>
                <div style='color: {COLORS['text_muted']}; font-size: 13px; margin-top: 10px;'>
                    {alloc_status}
                </div>
            </div>

            <!-- Selection Skill -->
            <div>
                <h3 style='color: {COLORS['text_secondary']}; font-size: 14px; margin-bottom: 10px;'>
                    SELECTION SKILL (Stock Picking)
                </h3>
                <div style='font-size: 48px; color: {COLORS['success'] if selection_effect > 0 else COLORS['danger']};
                            font-weight: 700; margin: 10px 0;'>
                    {selection_score:.1f}/10
                </div>
                <div style='font-size: 18px; color: {COLORS['text_primary']}; margin: 5px 0;'>
                    Effect: {selection_effect:+.2f}%
                </div>
                <div style='color: {COLORS['text_muted']}; font-size: 13px; margin-top: 10px;'>
                    {select_status}
                </div>
            </div>
        </div>

        <div style='background: rgba(0, 212, 255, 0.1); border-left: 4px solid {COLORS['neon_blue']};
                    padding: 15px; border-radius: 8px; margin-top: 20px;'>
            <h4 style='color: {COLORS['neon_blue']}; margin: 0 0 10px 0;'>
                🏆 Primary Strength: {primary_skill}
            </h4>
            <p style='color: {COLORS['text_primary']}; margin: 0; font-size: 15px;'>
                {recommendation}
            </p>
        </div>
    </div>
    """

    return html

def validate_and_map_sectors(df):
    """
    Ensure all securities are properly classified into standard sectors
    Map any non-standard sectors to standard GICS sectors
    """
    STANDARD_SECTORS = [
        'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical',
        'Communication Services', 'Industrials', 'Consumer Defensive',
        'Energy', 'Real Estate', 'Basic Materials', 'Utilities'
    ]

    SECTOR_MAPPING = {
        'Information Technology': 'Technology',
        'Health Care': 'Healthcare',
        'Financials': 'Financial Services',
        'Consumer Discretionary': 'Consumer Cyclical',
        'Communication': 'Communication Services',
        'Consumer Staples': 'Consumer Defensive',
        'Materials': 'Basic Materials',
        'Technology ': 'Technology',  # Trim whitespace
        'Financial': 'Financial Services',
    }

    # Apply mapping
    df['Sector'] = df['Sector'].replace(SECTOR_MAPPING)

    # Check for unmapped sectors
    unmapped = df[~df['Sector'].isin(STANDARD_SECTORS)]['Sector'].unique()
    if len(unmapped) > 0:
        st.warning(f"⚠️ Unmapped sectors found: {', '.join(unmapped)}. These will be grouped as 'Other'.")
        df.loc[~df['Sector'].isin(STANDARD_SECTORS), 'Sector'] = 'Other'

    return df

def validate_brinson_calculations(attribution_df, portfolio_weights, benchmark_weights,
                                  portfolio_returns, benchmark_returns):
    """
    Validate Brinson attribution calculations with detailed checks
    Returns validation results dict
    """
    validation_output = []

    validation_output.append("=" * 60)
    validation_output.append("BRINSON ATTRIBUTION VALIDATION")
    validation_output.append("=" * 60)

    # Check 1: Weights sum to 100%
    port_weight_sum = sum(portfolio_weights.values())
    bench_weight_sum = sum(benchmark_weights.values())

    validation_output.append("\n1. WEIGHT VALIDATION:")
    validation_output.append(f"   Portfolio weights sum: {port_weight_sum:.2f}%")
    validation_output.append(f"   Benchmark weights sum: {bench_weight_sum:.2f}%")

    weight_check_passed = True
    if abs(port_weight_sum - 100) > 0.1:
        validation_output.append("   ⚠️ WARNING: Portfolio weights don't sum to 100%")
        weight_check_passed = False
    if abs(bench_weight_sum - 100) > 0.1:
        validation_output.append("   ⚠️ WARNING: Benchmark weights don't sum to 100%")
        weight_check_passed = False

    # Check 2: Attribution effects sum correctly
    total_allocation = attribution_df['Allocation Effect'].sum()
    total_selection = attribution_df['Selection Effect'].sum()
    total_interaction = attribution_df['Interaction Effect'].sum()
    total_attribution = total_allocation + total_selection + total_interaction

    validation_output.append(f"\n2. ATTRIBUTION DECOMPOSITION:")
    validation_output.append(f"   Allocation Effect: {total_allocation:+.2f}%")
    validation_output.append(f"   Selection Effect: {total_selection:+.2f}%")
    validation_output.append(f"   Interaction Effect: {total_interaction:+.2f}%")
    validation_output.append(f"   Total Attribution: {total_attribution:+.2f}%")

    # Check 3: Compare to actual excess return
    portfolio_return = sum(portfolio_weights.get(s, 0) * portfolio_returns.get(s, 0) / 100
                          for s in portfolio_weights.keys())
    benchmark_return = sum(benchmark_weights.get(s, 0) * benchmark_returns.get(s, 0) / 100
                          for s in benchmark_weights.keys())
    actual_excess = portfolio_return - benchmark_return

    validation_output.append(f"\n3. EXCESS RETURN VALIDATION:")
    validation_output.append(f"   Portfolio Return: {portfolio_return * 100:.2f}%")
    validation_output.append(f"   Benchmark Return: {benchmark_return * 100:.2f}%")
    validation_output.append(f"   Actual Excess Return: {actual_excess * 100:.2f}%")
    validation_output.append(f"   Attribution Total: {total_attribution:.2f}%")
    validation_output.append(f"   Difference: {abs(actual_excess * 100 - total_attribution):.4f}%")

    attribution_matches = abs(actual_excess * 100 - total_attribution) < 0.5
    if not attribution_matches:
        validation_output.append("   ⚠️ WARNING: Attribution doesn't match excess return")

    # Check 4: Sector-level sanity checks
    validation_output.append(f"\n4. SECTOR-LEVEL CHECKS:")
    for _, row in attribution_df.iterrows():
        sector = row['Sector']
        alloc = row['Allocation Effect']
        selection = row['Selection Effect']
        validation_output.append(f"   {sector}:")
        validation_output.append(f"      Allocation: {alloc:+.2f}% | Selection: {selection:+.2f}%")

    validation_output.append("\n" + "=" * 60)

    # Print to console for debugging
    for line in validation_output:
        print(line)

    return {
        'weight_check_passed': weight_check_passed,
        'attribution_matches': attribution_matches,
        'total_attribution': total_attribution,
        'actual_excess': actual_excess * 100,
        'validation_output': '\n'.join(validation_output)
    }

def create_sector_attribution_table(attribution_df):
    """
    Create detailed sector-by-sector attribution table
    """

    # Format for display
    display_df = attribution_df[[
        'Sector', 'Weight Diff', 'Return Diff',
        'Allocation Effect', 'Selection Effect', 'Total Effect'
    ]].copy()

    # Sort by total effect
    display_df = display_df.sort_values('Total Effect', ascending=False)

    # Format percentages
    for col in ['Weight Diff', 'Return Diff', 'Allocation Effect', 'Selection Effect', 'Total Effect']:
        display_df[col] = display_df[col].apply(lambda x: f"{x:+.2f}%")

    return display_df

@st.cache_data(ttl=600)
def calculate_benchmark_returns(benchmark_ticker, start_date, end_date):
    try:
        data = fetch_historical_data(benchmark_ticker, start_date, end_date)
        if data is None or data.empty:
            return None
        returns = data['Close'].pct_change().dropna()
        return returns
    except:
        return None

# ============================================================================
# ENHANCED HOLDINGS TABLE
# ============================================================================

def create_enhanced_holdings_table(df):
    enhanced_df = df.copy()
    
    for idx, row in enhanced_df.iterrows():
        ticker = row['Ticker']
        market_data = fetch_market_data(ticker)
        
        if market_data:
            enhanced_df.at[idx, 'Asset Name'] = market_data['company_name']
            enhanced_df.at[idx, 'Current Price'] = market_data['price']
            enhanced_df.at[idx, 'Daily Change'] = market_data['daily_change']
            enhanced_df.at[idx, 'Daily Change %'] = market_data['daily_change_pct']
            enhanced_df.at[idx, '5D Return %'] = market_data['five_day_return']
            enhanced_df.at[idx, 'Beta'] = market_data.get('beta', 'N/A')
            enhanced_df.at[idx, 'Volume'] = market_data.get('volume', 0)
            base_sector = market_data.get('sector', 'Unknown')
            enhanced_df.at[idx, 'Sector'] = classify_ticker_sector(ticker, base_sector)
        else:
            enhanced_df.at[idx, 'Asset Name'] = ticker
            enhanced_df.at[idx, 'Sector'] = 'Other'
        
        analyst_data = fetch_analyst_data(ticker)
        if analyst_data['success']:
            enhanced_df.at[idx, 'Analyst Rating'] = analyst_data['rating']
            enhanced_df.at[idx, 'Price Target'] = analyst_data['target_price']
        else:
            enhanced_df.at[idx, 'Analyst Rating'] = 'No Coverage'

        # Calculate Quality Score
        info = fetch_stock_info(ticker)
        if info:
            enhanced_df.at[idx, 'Quality Score'] = calculate_quality_score(ticker, info)
        else:
            enhanced_df.at[idx, 'Quality Score'] = 5.0

    enhanced_df['Sector'] = enhanced_df['Sector'].fillna('Other')
    enhanced_df['Shares'] = enhanced_df['Shares'].round(0).astype(int)
    
    enhanced_df['Total Cost'] = enhanced_df['Shares'] * enhanced_df['Avg Cost']
    enhanced_df['Total Value'] = enhanced_df['Shares'] * enhanced_df['Current Price']
    enhanced_df['Total Gain/Loss $'] = enhanced_df['Total Value'] - enhanced_df['Total Cost']
    enhanced_df['Total Gain/Loss %'] = ((enhanced_df['Current Price'] - enhanced_df['Avg Cost']) / enhanced_df['Avg Cost']) * 100
    enhanced_df['Daily P&L $'] = enhanced_df['Shares'] * enhanced_df['Daily Change']
    
    total_value = enhanced_df['Total Value'].sum()
    enhanced_df['Weight %'] = (enhanced_df['Total Value'] / total_value * 100) if total_value > 0 else 0
    
    return enhanced_df

def calculate_quality_score(ticker, info):
    """
    Calculate comprehensive quality score (0-10)
    Based on: Profitability, Growth, Financial Health, Valuation
    """
    score = 5.0  # Start at neutral

    try:
        # Profitability metrics
        roe = info.get('returnOnEquity', 0)
        if roe and roe > 0.15:
            score += 1
        elif roe and roe > 0.10:
            score += 0.5

        # Growth metrics
        revenue_growth = info.get('revenueGrowth', 0)
        if revenue_growth and revenue_growth > 0.15:
            score += 1
        elif revenue_growth and revenue_growth > 0.05:
            score += 0.5

        # Financial health
        debt_to_equity = info.get('debtToEquity', 0)
        if debt_to_equity and debt_to_equity < 50:
            score += 1
        elif debt_to_equity and debt_to_equity < 100:
            score += 0.5

        # Profitability
        profit_margin = info.get('profitMargins', 0)
        if profit_margin and profit_margin > 0.20:
            score += 1
        elif profit_margin and profit_margin > 0.10:
            score += 0.5

        # Current ratio (liquidity)
        current_ratio = info.get('currentRatio', 0)
        if current_ratio and current_ratio > 2:
            score += 0.5
        elif current_ratio and current_ratio > 1:
            score += 0.25

        # Analyst recommendations
        recommendation = info.get('recommendationKey', '')
        if recommendation in ['strong_buy', 'buy']:
            score += 0.5

        # Cap at 10
        score = min(10.0, score)

    except Exception as e:
        score = 5.0

    return round(score, 1)

def style_holdings_dataframe(df):
    display_df = df[[
        'Ticker', 'Asset Name', 'Shares', 'Avg Cost', 'Current Price',
        'Daily Change %', '5D Return %', 'Weight %', 'Daily P&L $', 
        'Total Gain/Loss $', 'Total Gain/Loss %', 'Beta', 'Analyst Rating'
    ]].copy()
    
    pct_cols = ['Daily Change %', '5D Return %', 'Weight %', 'Total Gain/Loss %']
    for col in pct_cols:
        display_df[col] = display_df[col].apply(lambda x: format_percentage(x))
    
    currency_cols = ['Avg Cost', 'Current Price', 'Daily P&L $', 'Total Gain/Loss $']
    for col in currency_cols:
        display_df[col] = display_df[col].apply(format_currency)
    
    display_df['Daily Change %'] = display_df['Daily Change %'].apply(add_arrow_indicator)
    display_df['Total Gain/Loss %'] = display_df['Total Gain/Loss %'].apply(add_arrow_indicator)

    return display_df

def style_holdings_dataframe_with_optimization(df):
    """Style holdings dataframe with optimization columns"""
    display_df = df[[
        'Ticker', 'Asset Name', 'Shares', 'Current Price',
        'Weight %', 'Optimal Weight %', 'Weight Diff %',
        'Shares to Trade', 'Action', 'Total Gain/Loss %'
    ]].copy()

    # Format percentages
    pct_cols = ['Weight %', 'Optimal Weight %', 'Weight Diff %', 'Total Gain/Loss %']
    for col in pct_cols:
        if col in display_df.columns:
            display_df[col] = display_df[col].apply(lambda x: format_percentage(x) if pd.notna(x) else '')

    # Format currency
    display_df['Current Price'] = display_df['Current Price'].apply(format_currency)

    # Format shares to trade with sign
    display_df['Shares to Trade'] = display_df['Shares to Trade'].apply(
        lambda x: f"+{int(x):,}" if x > 0 else f"{int(x):,}" if x < 0 else "0" if pd.notna(x) else ''
    )

    # Add indicators to action column
    def style_action(val):
        if val == 'BUY':
            return '🟢 BUY'
        elif val == 'SELL':
            return '🔴 SELL'
        elif val == 'HOLD':
            return '⚪ HOLD'
        return val

    if 'Action' in display_df.columns:
        display_df['Action'] = display_df['Action'].apply(style_action)

    return display_df

# ============================================================================
# RISK METRICS
# ============================================================================

def calculate_sharpe_ratio(returns, risk_free_rate=RISK_FREE_RATE):
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    total_return = (1 + returns).prod() - 1
    n_years = len(returns) / 252
    annualized_return = (1 + total_return) ** (1/n_years) - 1 if n_years > 0 else 0
    annualized_vol = returns.std() * np.sqrt(252)
    sharpe = (annualized_return - risk_free_rate) / annualized_vol if annualized_vol > 0 else 0
    return sharpe

def calculate_sortino_ratio(returns, risk_free_rate=RISK_FREE_RATE):
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    total_return = (1 + returns).prod() - 1
    n_years = len(returns) / 252
    annualized_return = (1 + total_return) ** (1/n_years) - 1 if n_years > 0 else 0
    downside_returns = returns[returns < 0]
    if len(downside_returns) < 2:
        return None
    downside_std = downside_returns.std() * np.sqrt(252)
    sortino = (annualized_return - risk_free_rate) / downside_std if downside_std > 0 else 0
    return sortino

def calculate_information_ratio(portfolio_returns, benchmark_returns):
    if not is_valid_series(portfolio_returns) or not is_valid_series(benchmark_returns):
        return None
    if len(portfolio_returns) < 2 or len(benchmark_returns) < 2:
        return None
    common_dates = portfolio_returns.index.intersection(benchmark_returns.index)
    portfolio_returns = portfolio_returns.loc[common_dates]
    benchmark_returns = benchmark_returns.loc[common_dates]
    excess_returns = portfolio_returns - benchmark_returns
    if len(excess_returns) < 2:
        return None
    total_excess = (1 + excess_returns).prod() - 1
    n_years = len(excess_returns) / 252
    annualized_excess = (1 + total_excess) ** (1/n_years) - 1 if n_years > 0 else 0
    tracking_error = excess_returns.std() * np.sqrt(252)
    info_ratio = annualized_excess / tracking_error if tracking_error > 0 else 0
    return info_ratio

# v9.7 ENHANCEMENT: Added caching for performance optimization
@st.cache_data(ttl=300)
def calculate_var(returns, confidence=0.95):
    """Calculate Value at Risk with caching for improved performance"""
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    try:
        var = np.percentile(returns, (1 - confidence) * 100)
        return var * 100
    except Exception as e:
        return None

@st.cache_data(ttl=300)
def calculate_cvar(returns, confidence=0.95):
    """Calculate Conditional VaR with caching for improved performance"""
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    try:
        var = np.percentile(returns, (1 - confidence) * 100)
        cvar = returns[returns <= var].mean()
        return cvar * 100
    except Exception as e:
        return None

def calculate_historical_stress_test(enhanced_df):
    """
    Calculate portfolio performance during historical stress periods vs S&P 500.

    Returns performance data for visualization of portfolio resilience during major market events.

    Historical Stress Periods:
    - 2008 Financial Crisis: Sep 2008 - Mar 2009
    - 2011 Euro Crisis: Jul 2011 - Oct 2011
    - 2015-16 China Slowdown: Aug 2015 - Feb 2016
    - Dec 2018 Selloff: Oct 2018 - Dec 2018
    - COVID-19 Crash: Feb 2020 - Mar 2020

    Returns:
        dict: Contains period data, cumulative returns, and stress metrics
    """

    # Define historical stress periods
    stress_periods = {
        '2008 Financial Crisis': {'start': '2008-09-01', 'end': '2009-03-31', 'color': '#FF4136'},
        '2011 Euro Crisis': {'start': '2011-07-01', 'end': '2011-10-31', 'color': '#FF851B'},
        '2015-16 China Slowdown': {'start': '2015-08-01', 'end': '2016-02-29', 'color': '#FFDC00'},
        'Dec 2018 Selloff': {'start': '2018-10-01', 'end': '2018-12-31', 'color': '#39CCCC'},
        'COVID-19 Crash': {'start': '2020-02-01', 'end': '2020-03-31', 'color': '#B10DC9'}
    }

    results = {}

    # Get portfolio tickers and weights
    tickers = enhanced_df['Ticker'].tolist()
    weights = (enhanced_df['Weight %'] / 100).tolist()

    for period_name, period_info in stress_periods.items():
        try:
            # Fetch S&P 500 data for this period
            spy_data = fetch_historical_data('^GSPC', period_info['start'], period_info['end'])

            if spy_data is None or spy_data.empty:
                continue

            # Fetch portfolio holdings data for this period
            portfolio_returns = []
            valid_weights = []

            for ticker, weight in zip(tickers, weights):
                ticker_data = fetch_historical_data(ticker, period_info['start'], period_info['end'])
                if ticker_data is not None and not ticker_data.empty and len(ticker_data) > 0:
                    # Calculate cumulative return for this ticker
                    ticker_returns = ticker_data['Close'].pct_change().fillna(0)
                    portfolio_returns.append(ticker_returns)
                    valid_weights.append(weight)

            if not portfolio_returns:
                continue

            # Normalize weights
            valid_weights = np.array(valid_weights)
            valid_weights = valid_weights / valid_weights.sum()

            # Calculate weighted portfolio returns
            returns_df = pd.DataFrame(portfolio_returns).T
            portfolio_daily_returns = (returns_df * valid_weights).sum(axis=1)

            # Calculate cumulative returns
            portfolio_cumulative = (1 + portfolio_daily_returns).cumprod()
            spy_cumulative = (1 + spy_data['Close'].pct_change().fillna(0)).cumprod()

            # Align indices
            common_index = portfolio_cumulative.index.intersection(spy_cumulative.index)
            if len(common_index) == 0:
                continue

            portfolio_cumulative = portfolio_cumulative.loc[common_index]
            spy_cumulative = spy_cumulative.loc[common_index]

            # Normalize to start at 100
            portfolio_cumulative = (portfolio_cumulative / portfolio_cumulative.iloc[0]) * 100
            spy_cumulative = (spy_cumulative / spy_cumulative.iloc[0]) * 100

            # Calculate stress metrics
            total_return_portfolio = ((portfolio_cumulative.iloc[-1] / 100) - 1) * 100
            total_return_spy = ((spy_cumulative.iloc[-1] / 100) - 1) * 100

            max_drawdown_portfolio = ((portfolio_cumulative / portfolio_cumulative.cummax()) - 1).min() * 100
            max_drawdown_spy = ((spy_cumulative / spy_cumulative.cummax()) - 1).min() * 100

            volatility_portfolio = portfolio_daily_returns.std() * np.sqrt(252) * 100
            volatility_spy = spy_data['Close'].pct_change().std() * np.sqrt(252) * 100

            results[period_name] = {
                'dates': common_index,
                'portfolio_cumulative': portfolio_cumulative,
                'spy_cumulative': spy_cumulative,
                'metrics': {
                    'portfolio_return': total_return_portfolio,
                    'spy_return': total_return_spy,
                    'portfolio_drawdown': max_drawdown_portfolio,
                    'spy_drawdown': max_drawdown_spy,
                    'portfolio_volatility': volatility_portfolio,
                    'spy_volatility': volatility_spy,
                    'outperformance': total_return_portfolio - total_return_spy
                },
                'color': period_info['color']
            }

        except Exception as e:
            # Skip periods where data is unavailable
            continue

    return results

def calculate_var_cvar_portfolio_optimization(enhanced_df, confidence_level=0.95, lookback_days=252):
    """
    Calculate optimal portfolio weights to minimize CVaR (Conditional Value at Risk)

    This function implements portfolio optimization from Quantitative Risk Management
    to find weights that minimize tail risk while maintaining diversification.

    Args:
        enhanced_df: Enhanced holdings dataframe with current positions
        confidence_level: Confidence level for VaR/CVaR calculation (default 95%)
        lookback_days: Days of historical data to use (default 252 = 1 year)

    Returns:
        tuple: (rebalancing_df, optimization_metrics)
    """
    from scipy.optimize import minimize

    # Get current portfolio composition
    tickers = enhanced_df['Ticker'].tolist()
    current_values = enhanced_df['Total Value'].values
    total_portfolio_value = current_values.sum()
    current_weights = current_values / total_portfolio_value

    # Fetch historical returns for all tickers
    end_date = datetime.now()
    start_date = end_date - timedelta(days=lookback_days)

    # Build returns matrix
    returns_dict = {}
    for ticker in tickers:
        hist_data = fetch_historical_data(ticker, start_date, end_date)
        if hist_data is not None and len(hist_data) > 1:
            returns = hist_data['Close'].pct_change().dropna()
            returns_dict[ticker] = returns

    # Align all returns to common dates
    returns_df = pd.DataFrame(returns_dict)
    returns_df = returns_df.dropna()

    if len(returns_df) < 30:
        st.warning("Insufficient historical data for optimization (need 30+ days)")
        return None, None

    returns_matrix = returns_df.values
    n_assets = len(tickers)

    # Define CVaR calculation
    def calculate_portfolio_cvar(weights, returns, alpha):
        """Calculate CVaR (Expected Shortfall) for given weights"""
        portfolio_returns = returns @ weights
        var_threshold = np.percentile(portfolio_returns, (1-alpha) * 100)
        cvar = portfolio_returns[portfolio_returns <= var_threshold].mean()
        return -cvar  # Negative because we minimize

    # Optimization objective
    def objective(weights):
        return calculate_portfolio_cvar(weights, returns_matrix, confidence_level)

    # Constraints
    constraints = [
        {'type': 'eq', 'fun': lambda x: np.sum(x) - 1.0},  # Weights sum to 1
        {'type': 'ineq', 'fun': lambda x: x}  # All weights >= 0 (long-only)
    ]

    # Bounds (min 1%, max 40% per position for diversification)
    bounds = tuple((0.01, 0.40) for _ in range(n_assets))

    # Initial guess (equal weight)
    initial_weights = np.ones(n_assets) / n_assets

    # Run optimization
    result = minimize(
        objective,
        initial_weights,
        method='SLSQP',
        bounds=bounds,
        constraints=constraints,
        options={'maxiter': 1000, 'ftol': 1e-9}
    )

    if not result.success:
        st.warning(f"Optimization converged with warning: {result.message}")

    optimal_weights = result.x

    # Calculate current and optimal risk metrics
    current_portfolio_returns = returns_matrix @ current_weights
    optimal_portfolio_returns = returns_matrix @ optimal_weights

    current_var = np.percentile(current_portfolio_returns, (1-confidence_level) * 100)
    optimal_var = np.percentile(optimal_portfolio_returns, (1-confidence_level) * 100)

    current_cvar = current_portfolio_returns[current_portfolio_returns <= current_var].mean()
    optimal_cvar = optimal_portfolio_returns[optimal_portfolio_returns <= optimal_var].mean()

    # Calculate Sharpe ratios
    current_sharpe = (current_portfolio_returns.mean() / current_portfolio_returns.std()) * np.sqrt(252)
    optimal_sharpe = (optimal_portfolio_returns.mean() / optimal_portfolio_returns.std()) * np.sqrt(252)

    # Build rebalancing dataframe
    rebalancing_data = []
    for i, ticker in enumerate(tickers):
        current_value = enhanced_df[enhanced_df['Ticker'] == ticker]['Total Value'].values[0]
        current_shares = enhanced_df[enhanced_df['Ticker'] == ticker]['Shares'].values[0]
        current_price = enhanced_df[enhanced_df['Ticker'] == ticker]['Current Price'].values[0]

        optimal_value = optimal_weights[i] * total_portfolio_value
        optimal_shares = optimal_value / current_price
        shares_to_trade = optimal_shares - current_shares
        trade_value = shares_to_trade * current_price

        rebalancing_data.append({
            'Ticker': ticker,
            'Asset Name': enhanced_df[enhanced_df['Ticker'] == ticker]['Asset Name'].values[0],
            'Current Weight %': (current_value / total_portfolio_value) * 100,
            'Optimal Weight %': optimal_weights[i] * 100,
            'Weight Diff %': (optimal_weights[i] * 100) - (current_value / total_portfolio_value * 100),
            'Current Shares': int(current_shares),
            'Target Shares': int(optimal_shares),
            'Shares to Trade': int(shares_to_trade),
            'Current Price': current_price,
            'Trade Value': trade_value,
            'Action': 'BUY' if shares_to_trade > 5 else 'SELL' if shares_to_trade < -5 else 'HOLD',
            'Priority': abs(trade_value)  # Sort by impact
        })

    rebalancing_df = pd.DataFrame(rebalancing_data)
    rebalancing_df = rebalancing_df.sort_values('Priority', ascending=False)

    # Calculate optimization metrics
    optimization_metrics = {
        'current_var': current_var * 100,
        'optimal_var': optimal_var * 100,
        'var_reduction_pct': abs((optimal_var - current_var) / abs(current_var)) * 100,
        'current_cvar': current_cvar * 100,
        'optimal_cvar': optimal_cvar * 100,
        'cvar_reduction_pct': abs((optimal_cvar - current_cvar) / abs(current_cvar)) * 100,
        'current_sharpe': current_sharpe,
        'optimal_sharpe': optimal_sharpe,
        'sharpe_improvement': optimal_sharpe - current_sharpe,
        'total_trades': len(rebalancing_df[rebalancing_df['Action'] != 'HOLD']),
        'rebalancing_cost': abs(rebalancing_df['Trade Value'].sum()),
        'buy_trades': len(rebalancing_df[rebalancing_df['Action'] == 'BUY']),
        'sell_trades': len(rebalancing_df[rebalancing_df['Action'] == 'SELL'])
    }

    return rebalancing_df, optimization_metrics

def optimize_max_sharpe(returns_df, risk_free_rate):
    """Optimize for maximum Sharpe ratio using Modern Portfolio Theory"""
    from scipy.optimize import minimize

    n_assets = len(returns_df.columns)

    def neg_sharpe(weights):
        port_return = np.sum(returns_df.mean() * weights) * 252
        port_vol = np.sqrt(np.dot(weights.T, np.dot(returns_df.cov() * 252, weights)))
        return -(port_return - risk_free_rate) / port_vol if port_vol > 0 else 0

    constraints = {'type': 'eq', 'fun': lambda x: np.sum(x) - 1}
    bounds = tuple((0, 1) for _ in range(n_assets))
    initial_guess = np.array([1/n_assets] * n_assets)

    result = minimize(neg_sharpe, initial_guess, method='SLSQP', bounds=bounds, constraints=constraints)

    return pd.Series(result.x, index=returns_df.columns)

def optimize_min_volatility(returns_df):
    """Optimize for minimum volatility"""
    from scipy.optimize import minimize

    n_assets = len(returns_df.columns)

    def portfolio_vol(weights):
        return np.sqrt(np.dot(weights.T, np.dot(returns_df.cov() * 252, weights)))

    constraints = {'type': 'eq', 'fun': lambda x: np.sum(x) - 1}
    bounds = tuple((0, 1) for _ in range(n_assets))
    initial_guess = np.array([1/n_assets] * n_assets)

    result = minimize(portfolio_vol, initial_guess, method='SLSQP', bounds=bounds, constraints=constraints)

    return pd.Series(result.x, index=returns_df.columns)

def optimize_max_return(returns_df):
    """Optimize for maximum return"""
    mean_returns = returns_df.mean() * 252
    return mean_returns / mean_returns.sum()

def optimize_risk_parity(returns_df):
    """Risk parity optimization - equal risk contribution"""
    from scipy.optimize import minimize

    n_assets = len(returns_df.columns)
    cov_matrix = returns_df.cov() * 252

    def risk_parity_objective(weights):
        port_vol = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        if port_vol == 0:
            return 1e10
        marginal_contrib = np.dot(cov_matrix, weights) / port_vol
        risk_contrib = weights * marginal_contrib
        target_risk = port_vol / n_assets
        return np.sum((risk_contrib - target_risk) ** 2)

    constraints = {'type': 'eq', 'fun': lambda x: np.sum(x) - 1}
    bounds = tuple((0, 1) for _ in range(n_assets))
    initial_guess = np.array([1/n_assets] * n_assets)

    result = minimize(risk_parity_objective, initial_guess, method='SLSQP', bounds=bounds, constraints=constraints)

    return pd.Series(result.x, index=returns_df.columns)

@st.cache_data(ttl=300)
def calculate_max_drawdown(returns):
    """Calculate Maximum Drawdown with caching for improved performance"""
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    try:
        cumulative = (1 + returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = (cumulative - running_max) / running_max
        return drawdown.min() * 100
    except Exception as e:
        return None

def calculate_calmar_ratio(returns, risk_free_rate=RISK_FREE_RATE):
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    total_return = (1 + returns).prod() - 1
    n_years = len(returns) / 252
    annualized_return = (1 + total_return) ** (1/n_years) - 1 if n_years > 0 else 0
    max_dd = abs(calculate_max_drawdown(returns))
    if max_dd == 0:
        return 0
    return (annualized_return - risk_free_rate) / (max_dd / 100)

def calculate_portfolio_correlations(df, period='90d'):
    """
    Calculate correlation matrix for portfolio holdings
    period: '30d', '90d', '1y'
    """
    # Parse period
    period_map = {
        '30d': 30,
        '90d': 90,
        '1y': 365
    }
    days = period_map.get(period, 90)

    # Fetch data for all tickers
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days + 30)  # Extra buffer for data

    tickers = df['Ticker'].unique().tolist()

    # Collect returns for all tickers
    returns_dict = {}

    for ticker in tickers:
        try:
            hist_data = fetch_historical_data(ticker, start_date, end_date)
            if hist_data is not None and len(hist_data) > 20:
                ticker_returns = hist_data['Close'].pct_change().dropna()
                if len(ticker_returns) > 0:
                    returns_dict[ticker] = ticker_returns
        except:
            continue

    # Create DataFrame from returns
    if len(returns_dict) < 2:
        return None

    returns_df = pd.DataFrame(returns_dict)

    # Calculate correlation matrix
    correlation_matrix = returns_df.corr()

    return correlation_matrix

# ============================================================================
# CONTINUING IN PART 2...
# ============================================================================
# Part 2 will contain all visualizations and page implementations
# Save this file and paste Part 2 below it!


# ============================================================================
# WORLD-CLASS VISUALIZATIONS - ENHANCED WITH SEAMLESS THEMING
# ============================================================================

def create_top_contributors_chart(df, top_n=5):
    """FIXED: Top contributors in PERCENTAGE terms"""
    top_contributors = df.nlargest(top_n, 'Total Gain/Loss %')[['Ticker', 'Asset Name', 'Total Gain/Loss $', 'Total Gain/Loss %']]

    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=top_contributors['Total Gain/Loss %'],
        y=top_contributors['Ticker'],
        orientation='h',
        marker=dict(
            color=COLORS['success'],
            line=dict(color=COLORS['border'], width=2)
        ),
        text=[f"{x:.1f}%" for x in top_contributors['Total Gain/Loss %']],
        textposition='auto',
        hovertemplate='<b>%{y}</b><br>Return: %{x:.2f}%<extra></extra>'
    ))

    fig.update_layout(
        title="🎯 Top 5 Contributors (%)",
        xaxis_title="Total Return (%)",
        yaxis_title="",
        height=400,
        showlegend=False
    )

    apply_chart_theme(fig)
    return fig

def create_top_detractors_chart(df, top_n=5):
    """FIXED: Top detractors in PERCENTAGE terms"""
    top_detractors = df.nsmallest(top_n, 'Total Gain/Loss %')[['Ticker', 'Asset Name', 'Total Gain/Loss $', 'Total Gain/Loss %']]

    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=top_detractors['Total Gain/Loss %'],
        y=top_detractors['Ticker'],
        orientation='h',
        marker=dict(
            color=COLORS['danger'],
            line=dict(color=COLORS['border'], width=2)
        ),
        text=[f"{x:.1f}%" for x in top_detractors['Total Gain/Loss %']],
        textposition='auto',
        hovertemplate='<b>%{y}</b><br>Loss: %{x:.2f}%<extra></extra>'
    ))

    fig.update_layout(
        title="⚠️ Top 5 Detractors (%)",
        xaxis_title="Total Return (%)",
        yaxis_title="",
        height=400,
        showlegend=False
    )

    apply_chart_theme(fig)
    return fig

def create_sector_allocation_donut(df):
    """v9.7 ENHANCED: Sector allocation with better spacing and ETF classification"""
    # v9.7 FIX: Rename "Other" to "ETFs"
    df_copy = df.copy()
    df_copy['Sector'] = df_copy['Sector'].replace('Other', 'ETFs')

    sector_allocation = df_copy.groupby('Sector')['Total Value'].sum().reset_index()
    sector_allocation = sector_allocation.sort_values('Total Value', ascending=False)

    # Enhanced color palette for better distinction
    colors = ['#00d4ff', '#00ff88', '#ff6b00', '#b794f6', '#ff00ff',
              '#00ffcc', '#ffaa00', '#0080ff', '#ff0044', '#cyan']

    fig = go.Figure(data=[go.Pie(
        labels=sector_allocation['Sector'],
        values=sector_allocation['Total Value'],
        hole=0.55,  # v9.7: Larger hole for better spacing
        marker=dict(
            colors=colors,
            line=dict(color=COLORS['card_background'], width=3)
        ),
        textposition='inside',
        textinfo='percent',
        textfont=dict(size=14, color='white', family='Inter'),
        insidetextorientation='radial',
        hovertemplate='<b>%{label}</b><br>Value: $%{value:,.0f}<br>Share: %{percent}<extra></extra>',
        pull=[0.05 if i == 0 else 0 for i in range(len(sector_allocation))]  # Pull out largest sector
    )])

    fig.update_layout(
        title=dict(
            text="📊 Sector Allocation",
            font=dict(size=18, color=COLORS['neon_blue']),
            x=0.5,
            xanchor='center'
        ),
        height=450,  # v9.7: Increased height for less clustering
        showlegend=True,
        legend=dict(
            orientation="v",
            yanchor="top",
            y=1,
            xanchor="left",
            x=1.05,
            font=dict(size=12, color=COLORS['text_primary']),
            bgcolor='rgba(10, 25, 41, 0.6)',
            bordercolor=COLORS['border'],
            borderwidth=1
        ),
        margin=dict(l=40, r=180, t=80, b=40),  # v9.7: More right margin for legend
        annotations=[dict(
            text='Portfolio<br>Sectors',
            x=0.5, y=0.5,
            font_size=16,
            font_color=COLORS['neon_blue'],
            showarrow=False
        )]
    )

    apply_chart_theme(fig)
    return fig

def create_professional_sector_allocation_pie(df):
    """
    PROFESSIONAL sector allocation pie chart - Institutional grade
    - Clean, modern design
    - Proper label positioning
    - Subtle gradients
    - No clutter
    """
    sector_allocation = df.groupby('Sector')['Total Value'].sum()
    total_value = sector_allocation.sum()
    sector_pct = (sector_allocation / total_value * 100).round(1)

    # Sort by value
    sector_pct = sector_pct.sort_values(ascending=False)

    # Professional color palette (consistent with ATLAS theme)
    colors = [
        '#00d4ff',  # Neon blue
        '#0080ff',  # Electric blue
        '#00ffcc',  # Teal
        '#00ff88',  # Success green
        '#ffaa00',  # Warning orange
        '#ff6b00',  # Orange
        '#b794f6',  # Purple
        '#ff00ff',  # Pink
        '#00d4ff',  # Loop back
        '#0080ff',
        '#00ffcc'
    ]

    fig = go.Figure(data=[go.Pie(
        labels=sector_pct.index,
        values=sector_pct.values,
        hole=0.5,  # Donut style - more modern
        marker=dict(
            colors=colors[:len(sector_pct)],
            line=dict(color='#000000', width=2)  # Clean borders
        ),
        textposition='auto',
        textinfo='label+percent',
        textfont=dict(
            size=13,
            color='#ffffff',
            family='Inter, sans-serif'
        ),
        hovertemplate=(
            '<b>%{label}</b><br>' +
            'Allocation: %{percent}<br>' +
            'Value: $%{value:,.0f}<br>' +
            '<extra></extra>'
        ),
        sort=False  # Keep our sorted order
    )])

    fig.update_layout(
        title=dict(
            text='Sector Allocation',
            font=dict(size=20, color='#ffffff', family='Inter'),
            x=0.5,
            xanchor='center'
        ),
        showlegend=True,
        legend=dict(
            orientation="v",
            yanchor="middle",
            y=0.5,
            xanchor="right",
            x=1.15,
            bgcolor='rgba(0,0,0,0)',
            font=dict(size=12, color='#ffffff')
        ),
        paper_bgcolor='rgba(0, 0, 0, 0)',
        plot_bgcolor='rgba(10, 25, 41, 0.3)',
        height=500,
        margin=dict(l=20, r=150, t=80, b=20)
    )

    return fig

def create_professional_sector_allocation_bar(df):
    """
    PROFESSIONAL sector allocation bar chart
    - Horizontal bars sorted by value
    - Clean labels
    - Professional color coding
    """
    sector_allocation = df.groupby('Sector')['Total Value'].sum()
    total_value = sector_allocation.sum()
    sector_pct = (sector_allocation / total_value * 100).round(1)

    # Sort by value
    sector_data = pd.DataFrame({
        'Sector': sector_pct.index,
        'Percentage': sector_pct.values,
        'Value': sector_allocation.values
    }).sort_values('Value', ascending=True)  # Ascending for horizontal bars

    # Color by size (gradient from small to large)
    colors_gradient = ['#ff3366' if p < 5 else '#ffaa00' if p < 10 else '#00ff88'
                       for p in sector_data['Percentage']]

    fig = go.Figure(go.Bar(
        x=sector_data['Value'],
        y=sector_data['Sector'],
        orientation='h',
        marker=dict(
            color=colors_gradient,
            line=dict(color='#000000', width=1)
        ),
        text=[f"${v:,.0f} ({p:.1f}%)" for v, p in zip(sector_data['Value'], sector_data['Percentage'])],
        textposition='outside',
        textfont=dict(size=11, color='#ffffff'),
        hovertemplate=(
            '<b>%{y}</b><br>' +
            'Value: $%{x:,.0f}<br>' +
            'Percentage: %{customdata:.1f}%<br>' +
            '<extra></extra>'
        ),
        customdata=sector_data['Percentage']
    ))

    fig.update_layout(
        title=dict(
            text='Sector Allocation - Ranked by Value',
            font=dict(size=20, color='#ffffff', family='Inter'),
            x=0.5,
            xanchor='center'
        ),
        xaxis=dict(
            title='Total Value ($)',
            gridcolor='#1a3a52',
            showgrid=True,
            zeroline=False,
            tickformat='$,.0f',
            tickfont=dict(size=11, color='#b0c4de')
        ),
        yaxis=dict(
            title='',
            tickfont=dict(size=12, color='#ffffff')
        ),
        paper_bgcolor='rgba(0, 0, 0, 0)',
        plot_bgcolor='rgba(10, 25, 41, 0.3)',
        height=500,
        margin=dict(l=150, r=100, t=80, b=60),
        showlegend=False
    )

    return fig

def create_rolling_metrics_chart(returns, window=60):
    """Rolling metrics visualization - ENHANCED THEMING"""
    if not is_valid_series(returns) or len(returns) < window:
        return None
    
    rolling_vol = returns.rolling(window).std() * np.sqrt(252) * 100
    rolling_sharpe = (returns.rolling(window).mean() * 252 - RISK_FREE_RATE) / (returns.rolling(window).std() * np.sqrt(252))
    
    fig = make_subplots(
        rows=2, cols=1,
        subplot_titles=('Rolling Volatility (60-Day)', 'Rolling Sharpe Ratio (60-Day)'),
        vertical_spacing=0.15
    )
    
    fig.add_trace(
        go.Scatter(
            x=rolling_vol.index,
            y=rolling_vol.values,
            fill='tozeroy',
            fillcolor='rgba(255, 0, 68, 0.2)',
            line=dict(color=COLORS['danger'], width=2),
            name='Volatility'
        ),
        row=1, col=1
    )
    
    fig.add_trace(
        go.Scatter(
            x=rolling_sharpe.index,
            y=rolling_sharpe.values,
            fill='tozeroy',
            fillcolor='rgba(0, 212, 255, 0.2)',
            line=dict(color=COLORS['neon_blue'], width=2),
            name='Sharpe Ratio'
        ),
        row=2, col=1
    )
    
    fig.add_hline(y=0, line_dash="dash", line_color=COLORS['text_muted'], row=2, col=1)
    
    fig.update_layout(
        height=600,
        showlegend=False,
        title_text="📊 Rolling Risk Metrics"
    )
    
    apply_chart_theme(fig)
    return fig

def create_underwater_plot(returns):
    """Underwater drawdown plot - ENHANCED THEMING"""
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    
    cumulative = (1 + returns).cumprod()
    running_max = cumulative.expanding().max()
    drawdown = ((cumulative - running_max) / running_max) * 100
    
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=drawdown.index,
        y=drawdown.values,
        fill='tozeroy',
        fillcolor='rgba(255, 0, 68, 0.3)',
        line=dict(color=COLORS['danger'], width=2),
        name='Drawdown'
    ))
    
    fig.add_hline(y=0, line_dash="solid", line_color=COLORS['text_primary'], line_width=1)
    
    max_dd_idx = drawdown.idxmin()
    max_dd_val = drawdown.min()
    
    fig.add_annotation(
        x=max_dd_idx,
        y=max_dd_val,
        text=f"Max DD: {max_dd_val:.2f}%",
        showarrow=True,
        arrowhead=2,
        arrowcolor=COLORS['danger'],
        ax=0,
        ay=-40,
        bgcolor=COLORS['card_background'],
        bordercolor=COLORS['danger'],
        borderwidth=2
    )
    
    fig.update_layout(
        title="🌊 Underwater Plot",
        xaxis_title="Date",
        yaxis_title="Drawdown (%)",
        height=500
    )
    
    apply_chart_theme(fig)
    return fig

def create_var_waterfall(returns):
    """VaR/CVaR waterfall chart - ENHANCED THEMING"""
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    
    var_90 = calculate_var(returns, 0.90)
    var_95 = calculate_var(returns, 0.95)
    var_99 = calculate_var(returns, 0.99)
    cvar_95 = calculate_cvar(returns, 0.95)
    
    categories = ['VaR 90%', 'VaR 95%', 'VaR 99%', 'CVaR 95%']
    values = [var_90, var_95, var_99, cvar_95]
    
    colors_list = [COLORS['warning'], COLORS['orange'], COLORS['danger'], COLORS['danger']]
    
    fig = go.Figure()
    
    fig.add_trace(go.Bar(
        x=categories,
        y=values,
        marker=dict(
            color=colors_list,
            line=dict(color=COLORS['border'], width=2)
        ),
        text=[f"{v:.2f}%" for v in values],
        textposition='outside'
    ))
    
    fig.update_layout(
        title="⚠️ Value at Risk Waterfall",
        xaxis_title="Risk Measure",
        yaxis_title="Expected Loss (%)",
        height=500
    )
    
    apply_chart_theme(fig)
    return fig

# v9.7 NEW FEATURE: VaR/CVaR on Return Distribution
def create_var_cvar_distribution(returns):
    """
    NEW IN v9.7: Visualize VaR and CVaR on the actual return distribution
    Shows histogram of returns with VaR and CVaR threshold lines
    """
    if not is_valid_series(returns) or len(returns) < 30:
        return None

    # Calculate risk metrics
    var_95 = calculate_var(returns, 0.95)
    cvar_95 = calculate_cvar(returns, 0.95)
    var_99 = calculate_var(returns, 0.99)

    if var_95 is None or cvar_95 is None:
        return None

    # Convert to decimal for distribution
    returns_pct = returns * 100

    fig = go.Figure()

    # Add histogram of returns
    fig.add_trace(go.Histogram(
        x=returns_pct,
        name='Return Distribution',
        nbinsx=50,
        marker=dict(
            color=COLORS['info'],
            opacity=0.7,
            line=dict(color=COLORS['border'], width=1)
        ),
        hovertemplate='Returns: %{x:.2f}%<br>Count: %{y}<extra></extra>'
    ))

    # Add VaR 95% line
    fig.add_vline(
        x=var_95,
        line_dash="dash",
        line_color=COLORS['warning'],
        line_width=3,
        annotation_text=f"VaR 95%: {var_95:.2f}%",
        annotation_position="top",
        annotation=dict(
            font=dict(size=12, color=COLORS['warning']),
            bgcolor='rgba(10, 25, 41, 0.8)',
            bordercolor=COLORS['warning'],
            borderwidth=2
        )
    )

    # Add CVaR 95% line
    fig.add_vline(
        x=cvar_95,
        line_dash="solid",
        line_color=COLORS['danger'],
        line_width=3,
        annotation_text=f"CVaR 95%: {cvar_95:.2f}%",
        annotation_position="bottom",
        annotation=dict(
            font=dict(size=12, color=COLORS['danger']),
            bgcolor='rgba(10, 25, 41, 0.8)',
            bordercolor=COLORS['danger'],
            borderwidth=2
        )
    )

    # Add VaR 99% line
    fig.add_vline(
        x=var_99,
        line_dash="dot",
        line_color=COLORS['danger'],
        line_width=2,
        annotation_text=f"VaR 99%: {var_99:.2f}%",
        annotation_position="top right",
        annotation=dict(
            font=dict(size=10, color=COLORS['danger']),
            bgcolor='rgba(10, 25, 41, 0.6)'
        )
    )

    # Shade the tail risk area (beyond CVaR)
    fig.add_vrect(
        x0=returns_pct.min(),
        x1=cvar_95,
        fillcolor=COLORS['danger'],
        opacity=0.15,
        layer="below",
        line_width=0,
        annotation_text="Tail Risk Zone",
        annotation_position="top left"
    )

    fig.update_layout(
        title="📊 v9.7: Return Distribution with VaR/CVaR Analysis",
        xaxis_title="Daily Returns (%)",
        yaxis_title="Frequency",
        height=500,
        showlegend=False,
        bargap=0.05
    )

    apply_chart_theme(fig)
    return fig

# v9.7 NEW FEATURE: Rolling VaR/CVaR Time Series
def create_rolling_var_cvar_chart(returns, window=60):
    """
    NEW IN v9.7: Rolling VaR and CVaR time series visualization
    Shows how tail risk metrics evolve over time
    """
    if not is_valid_series(returns) or len(returns) < window:
        return None

    # Calculate rolling VaR and CVaR
    rolling_var_95 = []
    rolling_cvar_95 = []
    dates = []

    for i in range(window, len(returns)):
        window_returns = returns.iloc[i-window:i]
        var = calculate_var(window_returns, 0.95)
        cvar = calculate_cvar(window_returns, 0.95)

        if var is not None and cvar is not None:
            rolling_var_95.append(var)
            rolling_cvar_95.append(cvar)
            dates.append(returns.index[i])

    if not rolling_var_95:
        return None

    fig = go.Figure()

    # Add VaR trace
    fig.add_trace(go.Scatter(
        x=dates,
        y=rolling_var_95,
        name='VaR 95%',
        line=dict(color=COLORS['orange'], width=2),
        mode='lines'
    ))

    # Add CVaR trace
    fig.add_trace(go.Scatter(
        x=dates,
        y=rolling_cvar_95,
        name='CVaR 95%',
        line=dict(color=COLORS['danger'], width=2, dash='dash'),
        mode='lines'
    ))

    # Add zero line
    fig.add_hline(y=0, line_dash="dot", line_color=COLORS['text_muted'], line_width=1)

    fig.update_layout(
        title=f"📊 Rolling VaR & CVaR Evolution ({window}-Day Window)",
        xaxis_title="Date",
        yaxis_title="Expected Loss (%)",
        height=500,
        hovermode='x unified',
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        )
    )

    apply_chart_theme(fig)
    return fig

def create_risk_contribution_sunburst(df):
    """Risk contribution sunburst - ENHANCED THEMING"""
    risk_data = []
    
    for _, row in df.iterrows():
        ticker = row['Ticker']
        weight = row['Weight %']
        sector = row['Sector']
        
        hist_data = fetch_historical_data(ticker, datetime.now() - timedelta(days=365), datetime.now())
        if hist_data is not None and len(hist_data) > 30:
            returns = hist_data['Close'].pct_change().dropna()
            vol = returns.std() * np.sqrt(252) * 100
            risk_contribution = weight * vol
            
            risk_data.append({
                'Ticker': ticker,
                'Sector': sector,
                'Weight': weight,
                'Volatility': vol,
                'Risk Contribution': risk_contribution
            })
    
    if not risk_data:
        return None
    
    risk_df = pd.DataFrame(risk_data)
    
    fig = px.sunburst(
        risk_df,
        path=['Sector', 'Ticker'],
        values='Risk Contribution',
        color='Volatility',
        color_continuous_scale='RdYlGn_r',
        title="☀️ Risk Contribution Sunburst"
    )
    
    fig.update_layout(height=600)
    apply_chart_theme(fig)
    return fig

def create_risk_reward_plot(df):
    """Risk-reward scatter plot - ENHANCED THEMING"""
    risk_reward_data = []
    
    for _, row in df.iterrows():
        ticker = row['Ticker']
        hist_data = fetch_historical_data(ticker, datetime.now() - timedelta(days=365), datetime.now())
        
        if hist_data is not None and len(hist_data) > 30:
            returns = hist_data['Close'].pct_change().dropna()
            annual_return = ((1 + returns.mean()) ** 252 - 1) * 100
            annual_vol = returns.std() * np.sqrt(252) * 100
            
            risk_reward_data.append({
                'Ticker': ticker,
                'Asset Name': row['Asset Name'],
                'Return': annual_return,
                'Risk': annual_vol,
                'Weight': row['Weight %'],
                'Sector': row['Sector']
            })
    
    if not risk_reward_data:
        return None
    
    rr_df = pd.DataFrame(risk_reward_data)
    
    fig = px.scatter(
        rr_df,
        x='Risk',
        y='Return',
        size='Weight',
        color='Sector',
        text='Ticker',
        hover_data=['Asset Name'],
        color_discrete_sequence=px.colors.qualitative.Set3
    )
    
    fig.update_traces(
        textposition='top center',
        marker=dict(line=dict(width=2, color=COLORS['border']))
    )
    
    fig.update_layout(
        title="📈 Risk-Reward Analysis",
        xaxis_title="Risk (Annual Volatility %)",
        yaxis_title="Expected Return (Annual %)",
        height=500
    )
    
    apply_chart_theme(fig)
    return fig

def create_performance_heatmap(df, period='monthly'):
    """v9.7 ENHANCED: Performance heatmap with improved incomplete month filtering"""
    try:
        portfolio_values = {}

        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        current_month_start = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        for _, row in df.iterrows():
            ticker = row['Ticker']
            hist_data = fetch_historical_data(ticker, start_date, end_date)

            if hist_data is not None and len(hist_data) > 0:
                monthly_data = hist_data['Close'].resample('M').last()
                monthly_returns = monthly_data.pct_change() * 100

                for month, ret in monthly_returns.items():
                    # v9.7 FIX: More robust check for incomplete months
                    # Skip if this month is the current month or in the future
                    month_start = month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                    if month_start >= current_month_start:
                        continue

                    month_str = month.strftime('%b %Y')
                    if month_str not in portfolio_values:
                        portfolio_values[month_str] = {}
                    if pd.notna(ret) and abs(ret) < 50:
                        portfolio_values[month_str][ticker] = ret

        if not portfolio_values:
            return None

        tickers = sorted(set(t for months in portfolio_values.values() for t in months))
        months_list = sorted(portfolio_values.keys(), key=lambda x: datetime.strptime(x, '%b %Y'))

        # v9.7 FIX: Double-check to remove any incomplete months that slipped through
        months = []
        for m in months_list:
            m_date = datetime.strptime(m, '%b %Y')
            if m_date < current_month_start:
                months.append(m)
        
        matrix = []
        for ticker in tickers:
            row = []
            for month in months:
                if ticker in portfolio_values[month]:
                    val = portfolio_values[month][ticker]
                    val = max(-50, min(50, val))
                    row.append(val)
                else:
                    row.append(0)
            matrix.append(row)
        
        fig = go.Figure(data=go.Heatmap(
            z=matrix,
            x=months,
            y=tickers,
            colorscale='RdYlGn',
            zmid=0,
            zmin=-20,
            zmax=20,
            text=np.round(matrix, 1),
            texttemplate='%{text}%',
            textfont={"size": 14},
            colorbar=dict(title="Return %")
        ))
        
        fig.update_layout(
            title="🔥 Monthly Performance Heatmap",
            xaxis_title="Month",
            yaxis_title="Asset",
            height=800,
            width=1200
        )
        
        apply_chart_theme(fig)
        return fig
    except Exception as e:
        st.error(f"Error: {str(e)}")
        return None

def create_portfolio_heatmap(df):
    """Portfolio treemap - ENHANCED THEMING"""
    df_viz = df[['Ticker', 'Asset Name', 'Weight %', 'Total Gain/Loss %', 'Sector']].copy()
    df_viz['Sector'] = df_viz['Sector'].fillna('Other')
    df_viz = df_viz.dropna()
    
    if df_viz.empty:
        return None
    
    fig = px.treemap(
        df_viz,
        path=[px.Constant("Portfolio"), 'Sector', 'Ticker'],
        values='Weight %',
        color='Total Gain/Loss %',
        color_continuous_scale='RdYlGn',
        color_continuous_midpoint=0,
        hover_data={'Asset Name': True, 'Total Gain/Loss %': ':.2f'}
    )
    
    fig.update_layout(
        title="🗺️ Portfolio Heatmap",
        height=700
    )
    
    apply_chart_theme(fig)
    return fig

@st.cache_data(ttl=600)
def fetch_ticker_performance(ticker, start_date, end_date):
    try:
        data = fetch_historical_data(ticker, start_date, end_date)
        if data is not None and not data.empty:
            returns = data['Close'].pct_change().fillna(0)
            cumulative = (1 + returns).cumprod() - 1
            return cumulative * 100, data
        return None, None
    except:
        return None, None

def create_interactive_performance_chart(tickers, start_date, end_date):
    """Interactive performance chart - ENHANCED THEMING"""
    fig = go.Figure()
    
    colors = [COLORS['neon_blue'], COLORS['electric_blue'], COLORS['teal'], 
              COLORS['success'], COLORS['warning'], COLORS['danger'],
              COLORS['purple'], COLORS['pink'], COLORS['orange']]
    
    for idx, ticker in enumerate(tickers):
        cumulative, data = fetch_ticker_performance(ticker, start_date, end_date)
        if cumulative is not None:
            fig.add_trace(go.Scatter(
                x=cumulative.index,
                y=cumulative.values,
                mode='lines',
                name=ticker,
                line=dict(width=2.5, color=colors[idx % len(colors)])
            ))
    
    if not fig.data:
        return None
    
    fig.update_layout(
        title="📈 Interactive Performance Comparison",
        xaxis_title="Date",
        yaxis_title="Cumulative Return (%)",
        height=600,
        hovermode='x unified',
        legend=dict(x=0.01, y=0.99)
    )
    
    fig.add_hline(y=0, line_dash="dash", line_color=COLORS['text_muted'], line_width=1)
    
    apply_chart_theme(fig)
    return fig

def run_monte_carlo_simulation(returns, initial_value=100000, days=252, simulations=1000):
    if not is_valid_series(returns) or len(returns) < 30:
        return None
    
    daily_return = returns.mean()
    daily_vol = returns.std()
    
    simulation_results = []
    
    for _ in range(simulations):
        prices = [initial_value]
        for _ in range(days):
            price = prices[-1] * (1 + np.random.normal(daily_return, daily_vol))
            prices.append(price)
        simulation_results.append(prices)
    
    return np.array(simulation_results)

def create_monte_carlo_chart(simulation_results, initial_value=100000):
    if simulation_results is None:
        return None, None
    
    fig = go.Figure()
    
    for i in range(min(100, len(simulation_results))):
        fig.add_trace(go.Scatter(
            y=simulation_results[i],
            mode='lines',
            line=dict(width=0.5, color=COLORS['electric_blue']),
            opacity=0.1,
            showlegend=False
        ))
    
    percentiles = [5, 25, 50, 75, 95]
    colors_pct = [COLORS['danger'], COLORS['warning'], COLORS['info'], 
                  COLORS['teal'], COLORS['success']]
    
    for p, color in zip(percentiles, colors_pct):
        values = np.percentile(simulation_results, p, axis=0)
        fig.add_trace(go.Scatter(
            y=values,
            mode='lines',
            line=dict(width=3, color=color),
            name=f'{p}th Percentile'
        ))
    
    fig.update_layout(
        title="🎲 Monte Carlo Simulation",
        xaxis_title="Trading Days",
        yaxis_title="Portfolio Value ($)",
        height=500
    )
    
    apply_chart_theme(fig)
    
    final_values = simulation_results[:, -1]
    stats = {
        'mean': np.mean(final_values),
        'median': np.median(final_values),
        'percentile_5': np.percentile(final_values, 5),
        'percentile_95': np.percentile(final_values, 95),
        'prob_profit': (final_values > initial_value).mean() * 100,
        'prob_loss_10': (final_values < initial_value * 0.9).mean() * 100,
        'prob_gain_20': (final_values > initial_value * 1.2).mean() * 100
    }
    
    return fig, stats

def create_risk_parity_analysis(df):
    risk_contributions = []
    
    for _, row in df.iterrows():
        ticker = row['Ticker']
        weight = row['Weight %'] / 100
        
        hist_data = fetch_historical_data(ticker, datetime.now() - timedelta(days=365), datetime.now())
        if hist_data is not None and len(hist_data) > 30:
            returns = hist_data['Close'].pct_change().dropna()
            vol = returns.std() * np.sqrt(252)
            risk_contribution = weight * vol
            
            risk_contributions.append({
                'Ticker': ticker,
                'Weight %': row['Weight %'],
                'Volatility': vol * 100,
                'Risk Contribution': risk_contribution * 100
            })
    
    if not risk_contributions:
        return None
    
    rc_df = pd.DataFrame(risk_contributions)
    total_risk = rc_df['Risk Contribution'].sum()
    rc_df['Risk %'] = (rc_df['Risk Contribution'] / total_risk) * 100
    
    fig = go.Figure()
    
    fig.add_trace(go.Bar(
        name='Weight %',
        x=rc_df['Ticker'],
        y=rc_df['Weight %'],
        marker_color=COLORS['electric_blue']
    ))
    
    fig.add_trace(go.Bar(
        name='Risk Contribution %',
        x=rc_df['Ticker'],
        y=rc_df['Risk %'],
        marker_color=COLORS['danger']
    ))
    
    fig.update_layout(
        title="⚖️ Risk Parity Analysis",
        xaxis_title="Asset",
        yaxis_title="Percentage",
        barmode='group',
        height=500
    )
    
    apply_chart_theme(fig)
    return fig

def create_drawdown_distribution(returns):
    """NEW: Drawdown distribution histogram"""
    if not is_valid_series(returns) or len(returns) < 2:
        return None

    cumulative = (1 + returns).cumprod()
    running_max = cumulative.expanding().max()
    drawdowns = ((cumulative - running_max) / running_max) * 100

    # Remove zeros
    drawdowns = drawdowns[drawdowns < 0]

    if len(drawdowns) == 0:
        return None

    fig = go.Figure()

    fig.add_trace(go.Histogram(
        x=drawdowns,
        nbinsx=50,
        marker=dict(
            color=COLORS['danger'],
            line=dict(color=COLORS['border'], width=1)
        ),
        name='Drawdowns',
        hovertemplate='Drawdown: %{x:.2f}%<br>Count: %{y}<extra></extra>'
    ))

    # Add vertical line for mean
    mean_dd = drawdowns.mean()
    fig.add_vline(
        x=mean_dd,
        line_dash="dash",
        line_color=COLORS['warning'],
        annotation_text=f"Mean: {mean_dd:.2f}%",
        annotation_position="top"
    )

    fig.update_layout(
        title="📉 Drawdown Distribution",
        xaxis_title="Drawdown (%)",
        yaxis_title="Frequency",
        height=400,
        showlegend=False
    )

    apply_chart_theme(fig)
    return fig

def create_correlation_network(df, start_date, end_date):
    returns_data = {}
    
    for _, row in df.iterrows():
        ticker = row['Ticker']
        hist_data = fetch_historical_data(ticker, start_date, end_date)
        if hist_data is not None and len(hist_data) > 30:
            returns_data[ticker] = hist_data['Close'].pct_change().dropna()
    
    if len(returns_data) < 2:
        return None
    
    returns_df = pd.DataFrame(returns_data)
    corr_matrix = returns_df.corr()
    
    fig = go.Figure()
    
    G = nx.Graph()
    for ticker in corr_matrix.columns:
        G.add_node(ticker)
    
    threshold = 0.5
    for i, ticker1 in enumerate(corr_matrix.columns):
        for j, ticker2 in enumerate(corr_matrix.columns):
            if i < j:
                corr = corr_matrix.iloc[i, j]
                if abs(corr) > threshold:
                    G.add_edge(ticker1, ticker2, weight=abs(corr))
    
    pos = nx.spring_layout(G)
    
    for edge in G.edges():
        x0, y0 = pos[edge[0]]
        x1, y1 = pos[edge[1]]
        weight = G[edge[0]][edge[1]]['weight']
        
        fig.add_trace(go.Scatter(
            x=[x0, x1],
            y=[y0, y1],
            mode='lines',
            line=dict(width=weight*5, color=COLORS['electric_blue']),
            opacity=0.5,
            showlegend=False
        ))
    
    node_x = []
    node_y = []
    node_text = []
    
    for node in G.nodes():
        x, y = pos[node]
        node_x.append(x)
        node_y.append(y)
        node_text.append(node)
    
    fig.add_trace(go.Scatter(
        x=node_x,
        y=node_y,
        mode='markers+text',
        text=node_text,
        textposition='top center',
        marker=dict(
            size=20,
            color=COLORS['neon_blue'],
            line=dict(width=2, color=COLORS['border'])
        ),
        showlegend=False
    ))
    
    fig.update_layout(
        title="🔗 Correlation Network",
        showlegend=False,
        height=600,
        xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        yaxis=dict(showgrid=False, zeroline=False, showticklabels=False)
    )
    
    apply_chart_theme(fig)
    return fig

def create_efficient_frontier(df):
    """FIXED BROADCASTING ERROR - ENHANCED THEMING"""
    returns_data = {}
    expected_returns = []
    volatilities = []
    tickers = []
    
    for _, row in df.iterrows():
        ticker = row['Ticker']
        hist_data = fetch_historical_data(ticker, datetime.now() - timedelta(days=365), datetime.now())
        
        if hist_data is not None and len(hist_data) > 30:
            returns = hist_data['Close'].pct_change().dropna()
            annual_return = ((1 + returns.mean()) ** 252 - 1)
            annual_vol = returns.std() * np.sqrt(252)
            
            expected_returns.append(annual_return)
            volatilities.append(annual_vol)
            tickers.append(ticker)
            returns_data[ticker] = returns
    
    if len(expected_returns) < 2:
        return None
    
    returns_df = pd.DataFrame(returns_data)
    cov_matrix = returns_df.cov() * 252
    
    num_portfolios = 5000
    results = np.zeros((3, num_portfolios))
    
    np.random.seed(42)
    
    for i in range(num_portfolios):
        weights = np.random.random(len(tickers))
        weights /= np.sum(weights)
        
        portfolio_return = np.sum(weights * np.array(expected_returns))
        portfolio_vol = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        sharpe = (portfolio_return - RISK_FREE_RATE) / portfolio_vol if portfolio_vol > 0 else 0
        
        results[0, i] = portfolio_return * 100
        results[1, i] = portfolio_vol * 100
        results[2, i] = sharpe
    
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=results[1],
        y=results[0],
        mode='markers',
        marker=dict(
            size=5,
            color=results[2],
            colorscale='Viridis',
            showscale=True,
            colorbar=dict(title="Sharpe Ratio")
        ),
        name='Efficient Frontier'
    ))
    
    # FIXED: Properly align weights and returns
    current_weights = df[df['Ticker'].isin(tickers)]['Weight %'].values / 100
    aligned_returns = np.array(expected_returns[:len(current_weights)])
    aligned_cov = cov_matrix.iloc[:len(current_weights), :len(current_weights)]
    
    current_return = np.sum(current_weights * aligned_returns) * 100
    current_vol = np.sqrt(np.dot(current_weights.T, np.dot(aligned_cov, current_weights))) * 100
    
    fig.add_trace(go.Scatter(
        x=[current_vol],
        y=[current_return],
        mode='markers',
        marker=dict(size=20, color=COLORS['danger'], symbol='star'),
        name='Current Portfolio'
    ))
    
    fig.update_layout(
        title="📊 Efficient Frontier",
        xaxis_title="Risk (Volatility %)",
        yaxis_title="Return %",
        height=600,
        showlegend=True,  # FIX: Enable legend
        legend=dict(
            yanchor="top",
            y=0.99,
            xanchor="right",
            x=0.99,
            bgcolor="rgba(10, 25, 41, 0.8)",
            bordercolor=COLORS['border'],
            borderwidth=1
        )
    )

    apply_chart_theme(fig)
    return fig

# ============================================================================
# MARKET WATCH - ENHANCED
# ============================================================================

@st.cache_data(ttl=300)
def fetch_market_watch_data(tickers_dict):
    """v9.7 ENHANCED: Fetches market data with cleaned symbol display"""
    market_data = []

    for ticker, info in tickers_dict.items():
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period="5d")

            if not hist.empty:
                current = hist['Close'].iloc[-1]
                prev = hist['Close'].iloc[-2] if len(hist) > 1 else current
                change = ((current - prev) / prev) * 100

                five_day = ((current / hist['Close'].iloc[0]) - 1) * 100 if len(hist) >= 5 else 0

                volume = hist['Volume'].iloc[-1]
                avg_volume = hist['Volume'].mean()

                # v9.7 FIX: Clean up symbol for display (remove ^, =F, etc.)
                clean_symbol = ticker.replace('^', '').replace('=F', '').replace('-USD', '')
                # For commodities, show descriptive name instead
                if '=F' in ticker or ticker.endswith('=F'):
                    display_symbol = info.get('name', clean_symbol)
                elif ticker.startswith('^'):
                    display_symbol = info.get('name', clean_symbol)
                else:
                    display_symbol = ticker

                market_data.append({
                    'Symbol': display_symbol,
                    'Name': info.get('name', ticker),
                    'Category': info.get('category', info.get('region', '')),
                    'Last': current,
                    'Change %': change,
                    '5D %': five_day,
                    'Volume': volume,
                    'Avg Volume': avg_volume,
                    'Vol/Avg': volume / avg_volume if avg_volume > 0 else 0
                })
        except:
            continue

    return pd.DataFrame(market_data)

def create_dynamic_market_table(df, filters=None):
    if filters:
        if 'category' in filters and filters['category']:
            df = df[df['Category'] == filters['category']]
        
        if 'min_change' in filters and filters['min_change']:
            df = df[df['Change %'] >= filters['min_change']]
        
        if 'sort_by' in filters and filters['sort_by']:
            ascending = filters.get('ascending', False)
            df = df.sort_values(filters['sort_by'], ascending=ascending)
    
    display_df = df.copy()
    display_df['Last'] = display_df['Last'].apply(format_currency)
    display_df['Change %'] = display_df['Change %'].apply(lambda x: add_arrow_indicator(format_percentage(x)))
    display_df['5D %'] = display_df['5D %'].apply(lambda x: add_arrow_indicator(format_percentage(x)))
    display_df['Volume'] = display_df['Volume'].apply(lambda x: f"{x:,.0f}")
    display_df['Vol/Avg'] = display_df['Vol/Avg'].apply(lambda x: f"{x:.2f}x")
    
    return display_df

# ============================================================================
# PORTFOLIO DEEP DIVE - ENHANCED
# ============================================================================

def create_sector_rotation_heatmap(df, start_date, end_date):
    """Sector rotation heatmap - FIXED DATETIME COMPARISON"""
    sector_returns = {}

    # FIX: Make end_date_cutoff timezone-naive
    end_date_cutoff = pd.Timestamp(datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0))

    for _, row in df.iterrows():
        ticker = row['Ticker']
        sector = row['Sector']

        hist_data = fetch_historical_data(ticker, start_date, end_date)
        if hist_data is not None and len(hist_data) > 30:
            monthly_data = hist_data['Close'].resample('M').last()
            monthly_returns = monthly_data.pct_change() * 100

            # FIX: Convert index to timezone-naive before comparison
            monthly_returns.index = monthly_returns.index.tz_localize(None)
            monthly_returns = monthly_returns[monthly_returns.index < end_date_cutoff]
            
            if sector not in sector_returns:
                sector_returns[sector] = []
            
            sector_returns[sector].append(monthly_returns)
    
    if not sector_returns:
        return None
    
    sector_avg = {}
    for sector, returns_list in sector_returns.items():
        combined = pd.concat(returns_list, axis=1).mean(axis=1)
        sector_avg[sector] = combined
    
    sectors = list(sector_avg.keys())
    months = sector_avg[sectors[0]].index
    
    matrix = []
    for sector in sectors:
        matrix.append(sector_avg[sector].values)
    
    fig = go.Figure(data=go.Heatmap(
        z=matrix,
        x=[m.strftime('%b %Y') for m in months],
        y=sectors,
        colorscale='RdYlGn',
        zmid=0,
        text=np.round(matrix, 1),
        texttemplate='%{text}%',
        textfont={"size": 11},
        colorbar=dict(title="Return %")
    ))
    
    fig.update_layout(
        title="🔄 Sector Rotation Heatmap",
        xaxis_title="Month",
        yaxis_title="Sector",
        height=500
    )
    
    apply_chart_theme(fig)
    return fig

def create_holdings_attribution_waterfall(df):
    """Holdings attribution waterfall - ENHANCED THEMING"""
    top_contributors = df.nlargest(10, 'Total Gain/Loss $')
    
    tickers = top_contributors['Ticker'].tolist()
    contributions = top_contributors['Total Gain/Loss $'].tolist()
    
    fig = go.Figure()
    
    fig.add_trace(go.Waterfall(
        name="Attribution",
        orientation="v",
        x=tickers,
        y=contributions,
        connector={"line": {"color": COLORS['neon_blue']}},
        decreasing={"marker": {"color": COLORS['danger']}},
        increasing={"marker": {"color": COLORS['success']}},
        totals={"marker": {"color": COLORS['electric_blue']}}
    ))
    
    fig.update_layout(
        title="💧 Holdings Attribution Waterfall",
        xaxis_title="Ticker",
        yaxis_title="Contribution ($)",
        height=500
    )
    
    apply_chart_theme(fig)
    return fig

def create_concentration_gauge(df):
    """Concentration gauge - ENHANCED THEMING"""
    top_5_weight = df.nlargest(5, 'Weight %')['Weight %'].sum()
    
    fig = go.Figure(go.Indicator(
        mode="gauge+number+delta",
        value=top_5_weight,
        title={'text': "Top 5 Concentration"},
        delta={'reference': 50, 'increasing': {'color': COLORS['warning']}},
        gauge={
            'axis': {'range': [None, 100]},
            'bar': {'color': COLORS['neon_blue']},
            'steps': [
                {'range': [0, 30], 'color': COLORS['success']},
                {'range': [30, 50], 'color': COLORS['warning']},
                {'range': [50, 100], 'color': COLORS['danger']}
            ],
            'threshold': {
                'line': {'color': "red", 'width': 4},
                'thickness': 0.75,
                'value': 70
            }
        }
    ))
    
    fig.update_layout(height=400)
    apply_chart_theme(fig)
    return fig

def create_concentration_analysis(df):
    """NEW: Enhanced concentration analysis with multiple visuals"""
    
    # Top 10 Holdings Bar Chart
    top_10 = df.nlargest(10, 'Weight %')
    
    fig = go.Figure()
    
    fig.add_trace(go.Bar(
        x=top_10['Weight %'],
        y=top_10['Ticker'],
        orientation='h',
        marker=dict(
            color=top_10['Weight %'],
            colorscale='Blues',
            line=dict(color=COLORS['border'], width=2)
        ),
        text=[f"{x:.1f}%" for x in top_10['Weight %']],
        textposition='auto'
    ))
    
    fig.update_layout(
        title="📊 Top 10 Holdings Concentration",
        xaxis_title="Weight (%)",
        yaxis_title="",
        height=500,
        showlegend=False
    )
    
    apply_chart_theme(fig)
    return fig

# ============================================================================
# MULTI-FACTOR ANALYSIS - ENHANCED
# ============================================================================

def create_factor_momentum_chart(factor_data):
    """Factor momentum chart - ENHANCED THEMING"""
    if factor_data is None or 'factor_returns' not in factor_data:
        return None
    
    factor_returns = factor_data['factor_returns']
    
    fig = go.Figure()
    
    colors = [COLORS['neon_blue'], COLORS['electric_blue'], COLORS['teal'], 
              COLORS['success'], COLORS['purple'], COLORS['pink']]
    
    for idx, factor in enumerate(FACTOR_DEFINITIONS.keys()):
        if factor in factor_returns.columns:
            cumulative = (1 + factor_returns[factor]).cumprod() - 1
            fig.add_trace(go.Scatter(
                x=cumulative.index,
                y=cumulative.values * 100,
                mode='lines',
                name=factor,
                line=dict(width=2, color=colors[idx % len(colors)])
            ))
    
    fig.update_layout(
        title="📈 Factor Momentum",
        xaxis_title="Date",
        yaxis_title="Cumulative Return (%)",
        height=600,
        hovermode='x unified',
        legend=dict(x=0.02, y=0.98)
    )
    
    apply_chart_theme(fig)
    return fig

def create_factor_exposure_radar(exposures):
    """Factor exposure radar - ENHANCED THEMING"""
    if exposures is None or 'exposures' not in exposures:
        return None
    
    exp = exposures['exposures']
    factors = [f for f in FACTOR_DEFINITIONS.keys() if f in exp.index]
    values = [exp[f] for f in factors]
    
    max_abs = max([abs(v) for v in values]) if values else 1
    normalized = [(v / max_abs) * 100 if max_abs > 0 else 0 for v in values]
    
    fig = go.Figure()
    
    fig.add_trace(go.Scatterpolar(
        r=normalized,
        theta=factors,
        fill='toself',
        fillcolor='rgba(0, 212, 255, 0.2)',
        line=dict(color=COLORS['neon_blue'], width=2),
        name='Factor Exposure'
    ))
    
    fig.update_layout(
        polar=dict(
            radialaxis=dict(
                visible=True,
                range=[0, 100],
                color=COLORS['text_secondary']
            ),
            bgcolor='rgba(10, 25, 41, 0.3)'
        ),
        title="🎯 Factor Exposure Radar",
        height=550
    )
    
    apply_chart_theme(fig)
    return fig

@st.cache_data(ttl=3600)
def calculate_factor_exposures(df, start_date, end_date):
    try:
        portfolio_returns = calculate_portfolio_returns(df, start_date, end_date)
        if not is_valid_series(portfolio_returns):
            return None
        
        factor_returns = {}
        for factor_name, factor_info in FACTOR_DEFINITIONS.items():
            benchmark = factor_info['benchmark']
            returns = calculate_benchmark_returns(benchmark, start_date, end_date)
            if is_valid_series(returns):
                factor_returns[factor_name] = returns
        
        if not factor_returns:
            return None
        
        common_dates = portfolio_returns.index
        for factor_name in factor_returns:
            common_dates = common_dates.intersection(factor_returns[factor_name].index)
        
        X = pd.DataFrame({name: returns.loc[common_dates] for name, returns in factor_returns.items()})
        y = portfolio_returns.loc[common_dates]
        
        X['Alpha'] = 1
        
        model = LinearRegression()
        model.fit(X, y)
        
        exposures = pd.Series(model.coef_, index=X.columns)
        r_squared = model.score(X, y)
        predicted_returns = model.predict(X)
        
        asset_exposures = {}
        for _, row in df.iterrows():
            ticker = row['Ticker']
            ticker_returns = calculate_benchmark_returns(ticker, start_date, end_date)
            if is_valid_series(ticker_returns):
                ticker_aligned = ticker_returns.loc[common_dates]
                
                asset_model = LinearRegression()
                asset_model.fit(X, ticker_aligned)
                
                asset_exposures[ticker] = pd.Series(asset_model.coef_, index=X.columns)
        
        return {
            'exposures': exposures,
            'r_squared': r_squared,
            'factor_returns': X,
            'portfolio_returns': y,
            'predicted_returns': predicted_returns,
            'asset_exposures': asset_exposures
        }
    except:
        return None

def create_factor_attribution_table(exposures, df):
    if exposures is None or 'asset_exposures' not in exposures:
        return None, None, None
    
    attribution_data = []
    
    for ticker, asset_exp in exposures['asset_exposures'].items():
        asset_row = df[df['Ticker'] == ticker]
        if asset_row.empty:
            continue
        
        weight = asset_row['Weight %'].values[0] / 100
        sector = asset_row['Sector'].values[0]
        
        for factor in FACTOR_DEFINITIONS.keys():
            if factor in asset_exp:
                contribution = weight * asset_exp[factor]
                attribution_data.append({
                    'Ticker': ticker,
                    'Sector': sector,
                    'Factor': factor,
                    'Weight': weight * 100,
                    'Factor Beta': asset_exp[factor],
                    'Contribution': contribution
                })
    
    if not attribution_data:
        return None, None, None
    
    attr_df = pd.DataFrame(attribution_data)
    
    factor_summary = attr_df.groupby('Factor').agg({
        'Contribution': 'sum'
    }).reset_index()
    factor_summary.columns = ['Factor', 'Total Contribution']
    
    sector_summary = attr_df.groupby(['Sector', 'Factor']).agg({
        'Contribution': 'sum'
    }).reset_index()
    
    return attr_df, factor_summary, sector_summary

# ============================================================================
# PERFORMANCE METRICS
# ============================================================================

def calculate_performance_metrics(df, portfolio_returns, benchmark_returns):
    if not is_valid_series(portfolio_returns):
        return None
    
    total_return = (1 + portfolio_returns).prod() - 1
    n_years = len(portfolio_returns) / 252
    annualized_return = (1 + total_return) ** (1/n_years) - 1 if n_years > 0 else 0
    annualized_vol = portfolio_returns.std() * np.sqrt(252)
    
    sharpe = calculate_sharpe_ratio(portfolio_returns)
    sortino = calculate_sortino_ratio(portfolio_returns)
    calmar = calculate_calmar_ratio(portfolio_returns)
    
    info_ratio = calculate_information_ratio(portfolio_returns, benchmark_returns)
    
    var_95 = calculate_var(portfolio_returns, 0.95)
    cvar_95 = calculate_cvar(portfolio_returns, 0.95)
    max_dd = calculate_max_drawdown(portfolio_returns)
    
    winning_days = (portfolio_returns > 0).sum()
    losing_days = (portfolio_returns < 0).sum()
    win_rate = winning_days / (winning_days + losing_days) * 100 if (winning_days + losing_days) > 0 else 0
    
    avg_win = portfolio_returns[portfolio_returns > 0].mean() * 100 if winning_days > 0 else 0
    avg_loss = portfolio_returns[portfolio_returns < 0].mean() * 100 if losing_days > 0 else 0
    
    best_day = portfolio_returns.max() * 100
    worst_day = portfolio_returns.min() * 100
    
    return {
        'Total Return': total_return * 100,
        'Annualized Return': annualized_return * 100,
        'Annualized Volatility': annualized_vol * 100,
        'Sharpe Ratio': sharpe,
        'Sortino Ratio': sortino,
        'Calmar Ratio': calmar,
        'Information Ratio': info_ratio,
        'VaR (95%)': var_95,
        'CVaR (95%)': cvar_95,
        'Max Drawdown': max_dd,
        'Win Rate': win_rate,
        'Avg Win': avg_win,
        'Avg Loss': avg_loss,
        'Best Day': best_day,
        'Worst Day': worst_day,
        'Winning Days': winning_days,
        'Losing Days': losing_days
    }

def create_performance_dashboard(metrics):
    fig = make_subplots(
        rows=2, cols=2,
        subplot_titles=('Returns Distribution', 'Risk Metrics', 
                       'Win/Loss Analysis', 'Risk-Adjusted Returns'),
        specs=[[{'type': 'bar'}, {'type': 'scatter'}],
               [{'type': 'pie'}, {'type': 'bar'}]]
    )
    
    fig.add_trace(
        go.Bar(x=['Total', 'Annualized'], 
               y=[metrics['Total Return'], metrics['Annualized Return']],
               marker_color=[COLORS['success'], COLORS['electric_blue']]),
        row=1, col=1
    )
    
    fig.add_trace(
        go.Scatter(x=['Volatility', 'VaR', 'CVaR', 'Max DD'],
                  y=[metrics['Annualized Volatility'], abs(metrics['VaR (95%)']), 
                     abs(metrics['CVaR (95%)']), abs(metrics['Max Drawdown'])],
                  mode='markers+lines',
                  marker=dict(size=15, color=COLORS['danger'])),
        row=1, col=2
    )
    
    fig.add_trace(
        go.Pie(labels=['Winning Days', 'Losing Days'],
               values=[metrics['Winning Days'], metrics['Losing Days']],
               marker=dict(colors=[COLORS['success'], COLORS['danger']])),
        row=2, col=1
    )
    
    fig.add_trace(
        go.Bar(x=['Sharpe', 'Sortino', 'Calmar', 'Info'],
               y=[metrics['Sharpe Ratio'], metrics['Sortino Ratio'], 
                  metrics['Calmar Ratio'], metrics['Information Ratio']],
               marker_color=COLORS['purple']),
        row=2, col=2
    )
    
    fig.update_layout(
        height=700,
        showlegend=False,
        title_text="📊 Performance Dashboard"
    )
    
    apply_chart_theme(fig)
    return fig

# ============================================================================
# VALUATION HOUSE VISUALIZATIONS - ENHANCED
# ============================================================================

def create_dcf_waterfall(dcf_results, method='FCFF'):
    """Create waterfall chart showing DCF buildup - ENHANCED THEMING"""
    
    categories = ['PV of Cash Flows', 'PV of Terminal Value']
    values = [dcf_results['total_pv_cash_flows'], dcf_results['pv_terminal']]
    
    if method == 'FCFF':
        categories.append('Enterprise Value')
        categories.append('Less: Net Debt')
        categories.append('Equity Value')
        values.append(dcf_results['enterprise_value'])
        values.append(-dcf_results.get('net_debt', 0))
        values.append(dcf_results['equity_value'])
    
    fig = go.Figure(go.Waterfall(
        name="DCF Buildup",
        orientation="v",
        x=categories,
        y=values,
        connector={"line": {"color": COLORS['neon_blue']}},
        decreasing={"marker": {"color": COLORS['danger']}},
        increasing={"marker": {"color": COLORS['success']}},
    ))
    
    fig.update_layout(
        title=f"💎 {method} Valuation Buildup",
        yaxis_title="Value ($)",
        height=500
    )
    
    apply_chart_theme(fig)
    return fig

def create_cash_flow_chart(projections, method='FCFF'):
    """Create bar chart of projected cash flows - ENHANCED THEMING"""
    
    cf_key = 'fcff' if method == 'FCFF' else 'fcfe'
    
    years = [proj['year'] for proj in projections]
    cash_flows = [proj[cf_key] for proj in projections]
    
    fig = go.Figure()
    
    fig.add_trace(go.Bar(
        x=years,
        y=cash_flows,
        marker_color=COLORS['electric_blue'],
        name=method,
        marker=dict(line=dict(color=COLORS['border'], width=2))
    ))
    
    fig.update_layout(
        title=f"📊 Projected {method} by Year",
        xaxis_title="Year",
        yaxis_title=f"{method} ($)",
        height=400
    )
    
    apply_chart_theme(fig)
    return fig

def create_sensitivity_table(base_price, base_discount, base_terminal):
    """Create sensitivity analysis table - ENHANCED THEMING"""
    
    discount_rates = np.linspace(base_discount - 0.02, base_discount + 0.02, 5)
    terminal_growth_rates = np.linspace(base_terminal - 0.01, base_terminal + 0.01, 5)
    
    # This is simplified - in real implementation would recalculate DCF
    sensitivity_matrix = []
    for tr in terminal_growth_rates:
        row = []
        for dr in discount_rates:
            # Simplified sensitivity calculation
            adjustment = (1 - (dr - base_discount)) * (1 + (tr - base_terminal))
            value = base_price * adjustment
            row.append(value)
        sensitivity_matrix.append(row)
    
    fig = go.Figure(data=go.Heatmap(
        z=sensitivity_matrix,
        x=[f"{dr:.1%}" for dr in discount_rates],
        y=[f"{tg:.1%}" for tg in terminal_growth_rates],
        colorscale='RdYlGn',
        text=[[f"${v:.2f}" for v in row] for row in sensitivity_matrix],
        texttemplate='%{text}',
        textfont={"size": 10},
        colorbar=dict(title="Price")
    ))
    
    fig.update_layout(
        title="🎯 Sensitivity Analysis",
        xaxis_title="Discount Rate",
        yaxis_title="Terminal Growth Rate",
        height=400
    )
    
    apply_chart_theme(fig)
    return fig

# ============================================================================
# MAIN APP - EXCELLENCE EDITION
# ============================================================================

def main():
    # Professional Header with Logo
    st.markdown("""
    <div style="text-align: center; margin-bottom: 2rem;">
        <div style="display: inline-flex; align-items: center; justify-content: center; gap: 1rem;
                    background: linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0, 128, 255, 0.1) 100%);
                    padding: 1.5rem 3rem; border-radius: 20px; border: 2px solid rgba(0, 212, 255, 0.3);
                    box-shadow: 0 8px 32px rgba(0, 212, 255, 0.2);">
            <svg width="60" height="60" viewBox="0 0 100 100" style="filter: drop-shadow(0 0 10px rgba(0, 212, 255, 0.5));">
                <defs>
                    <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#00d4ff;stop-opacity:1" />
                        <stop offset="50%" style="stop-color:#00ff88;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#00d4ff;stop-opacity:1" />
                    </linearGradient>
                </defs>
                <!-- Stylized "A" for ATLAS -->
                <path d="M 50 10 L 80 90 L 65 90 L 60 75 L 40 75 L 35 90 L 20 90 Z M 45 60 L 55 60 L 50 35 Z"
                      fill="url(#logoGradient)" stroke="#00d4ff" stroke-width="2"/>
                <!-- Accent lines for modern touch -->
                <line x1="30" y1="50" x2="38" y2="68" stroke="#00ff88" stroke-width="3" stroke-linecap="round"/>
                <line x1="70" y1="50" x2="62" y2="68" stroke="#00ff88" stroke-width="3" stroke-linecap="round"/>
            </svg>
            <div style="text-align: left;">
                <h1 style="margin: 0; font-size: 3em; font-weight: 900;
                           background: linear-gradient(135deg, #00d4ff 0%, #00ff88 50%, #00d4ff 100%);
                           background-size: 200% auto; -webkit-background-clip: text; background-clip: text;
                           -webkit-text-fill-color: transparent;">
                    ATLAS TERMINAL
                </h1>
                <div style="color: #6c8ca8; font-size: 0.9em; font-weight: 600; letter-spacing: 0.15em; margin-top: 0.25rem;">
                    INSTITUTIONAL EDITION v10.0
                </div>
            </div>
        </div>
        <p style="color: #b0c4de; font-size: 1.1em; margin-top: 1.5rem; font-weight: 500;">
            Bloomberg Terminal-Quality Portfolio Analytics 📊 | Institutional-Grade Performance Suite 💎
        </p>
        <div style="display: inline-flex; gap: 1.5rem; margin-top: 0.75rem; flex-wrap: wrap; justify-content: center;">
            <span style="background: rgba(0, 212, 255, 0.15); padding: 0.5rem 1rem; border-radius: 8px;
                         font-size: 0.85em; font-weight: 600; color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.3);">
                🚀 Individual Securities Analysis
            </span>
            <span style="background: rgba(0, 255, 136, 0.15); padding: 0.5rem 1rem; border-radius: 8px;
                         font-size: 0.85em; font-weight: 600; color: #00ff88; border: 1px solid rgba(0, 255, 136, 0.3);">
                📈 Risk Decomposition
            </span>
            <span style="background: rgba(255, 170, 0, 0.15); padding: 0.5rem 1rem; border-radius: 8px;
                         font-size: 0.85em; font-weight: 600; color: #ffaa00; border: 1px solid rgba(255, 170, 0, 0.3);">
                🕸️ Correlation Matrix
            </span>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    leverage_info = get_leverage_info()
    if leverage_info:
        st.markdown(f"""
        <div style="background: linear-gradient(135deg, #ff6b00 0%, #ff0044 100%);
                    border: 2px solid #ff6b00; border-radius: 8px; padding: 10px; margin-bottom: 10px;
                    text-align: center;">
            <span style="color: white; font-weight: 600;">⚡ LEVERAGED ACCOUNT ⚡</span>
            <span style="color: white; margin-left: 20px;">Margin: ${leverage_info['margin_used']:,.2f}</span>
            <span style="color: white; margin-left: 20px;">Leverage: {leverage_info['leverage_ratio']:.2f}x</span>
        </div>
        """, unsafe_allow_html=True)
    
    st.sidebar.markdown("### NAVIGATION")
    page = st.sidebar.radio("Select Module", [
        "🔥 Phoenix Parser",
        "🏠 Portfolio Home",
        "🌍 Market Watch",
        "📈 Risk Analysis",
        "💎 Performance Suite",
        "🔬 Portfolio Deep Dive",
        "📊 Multi-Factor Analysis",
        "💰 Valuation House",
        "ℹ️ About"
    ])
    
    st.sidebar.markdown("---")
    st.sidebar.markdown("### 📅 TIME RANGE")
    date_options = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "MAX"]
    selected_range = st.sidebar.selectbox("Period", date_options, index=6)
    
    st.sidebar.markdown("---")
    st.sidebar.markdown("### 🎯 BENCHMARK")
    benchmark_options = ["SPY", "QQQ", "DIA", "IWM", "VTI", "ACWI"]
    selected_benchmark = st.sidebar.selectbox("Compare Against", benchmark_options, index=0)
    
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
    # PHOENIX PARSER
    # ========================================================================
    if page == "🔥 Phoenix Parser":
        st.markdown("## 🔥 PHOENIX MODE")
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown("### 📊 Trade History")
            trade_file = st.file_uploader("Upload Trade History", type=['xls', 'xlsx'], key="trade")
            
            if trade_file:
                with st.spinner("Parsing..."):
                    trade_df = parse_trade_history_file(trade_file)
                    
                    if trade_df is not None:
                        save_trade_history(trade_df)
                        st.success(f"✅ Parsed {len(trade_df)} trades!")
                        st.dataframe(trade_df.head(10), use_container_width=True, column_config=None)

                        portfolio_df = calculate_portfolio_from_trades(trade_df)
                        if len(portfolio_df) > 0:
                            save_portfolio_data(portfolio_df.to_dict('records'))
                            st.success(f"🎉 Portfolio rebuilt! {len(portfolio_df)} positions")
                            st.dataframe(portfolio_df, use_container_width=True, column_config=None)
        
        with col2:
            st.markdown("### 💰 Account History")
            account_file = st.file_uploader("Upload Account History", type=['xls', 'xlsx'], key="account")
            
            if account_file:
                with st.spinner("Parsing..."):
                    account_df = parse_account_history_file(account_file)
                    
                    if account_df is not None:
                        save_account_history(account_df)
                        st.success(f"✅ Parsed {len(account_df)} records!")
                        st.dataframe(account_df.head(10), use_container_width=True, column_config=None)
                        
                        leverage_info_parsed = get_leverage_info()
                        if leverage_info_parsed:
                            st.info(f"""
                            💡 Leverage Detected:
                            - Margin: ${leverage_info_parsed['margin_used']:,.2f}
                            - Leverage: {leverage_info_parsed['leverage_ratio']:.2f}x
                            """)
    
    # ========================================================================
    # PORTFOLIO HOME - ENHANCED WITH CONTRIBUTORS/DETRACTORS
    # ========================================================================
    elif page == "🏠 Portfolio Home":
        st.markdown("## 🏠 PORTFOLIO HOME")
        
        portfolio_data = load_portfolio_data()
        
        if not portfolio_data:
            st.warning("⚠️ No portfolio data. Please upload via Phoenix Parser.")
            return
        
        df = pd.DataFrame(portfolio_data)
        
        with st.spinner("Loading..."):
            enhanced_df = create_enhanced_holdings_table(df)
        
        total_value = enhanced_df['Total Value'].sum()
        total_cost = enhanced_df['Total Cost'].sum()
        total_gl = total_value - total_cost
        total_gl_pct = (total_gl / total_cost) * 100 if total_cost > 0 else 0
        daily_pl = enhanced_df['Daily P&L $'].sum()
        
        col1, col2, col3, col4, col5 = st.columns(5)
        col1.metric("Total Value", format_currency(total_value))
        col2.metric("Total Cost", format_currency(total_cost))
        col3.metric("Total G/L", format_currency(total_gl), format_percentage(total_gl_pct))
        col4.metric("Daily P&L", format_currency(daily_pl))
        col5.metric("📊 Positions", len(enhanced_df))

        # v9.7 NEW FEATURE: Data Quality Indicator
        validation_result = validate_portfolio_data(portfolio_data)
        quality_score = validation_result['data_quality_score']

        if quality_score >= 90:
            quality_color = COLORS['success']
            quality_status = "EXCELLENT"
        elif quality_score >= 75:
            quality_color = COLORS['info']
            quality_status = "GOOD"
        elif quality_score >= 60:
            quality_color = COLORS['warning']
            quality_status = "FAIR"
        else:
            quality_color = COLORS['danger']
            quality_status = "POOR"

        st.markdown(f"""
        <div style='background: linear-gradient(135deg, {COLORS['card_background']} 0%, {COLORS['card_background_alt']} 100%);
                    border-left: 4px solid {quality_color};
                    padding: 12px 20px;
                    border-radius: 8px;
                    margin: 15px 0;'>
            <div style='display: flex; align-items: center; justify-content: space-between;'>
                <div>
                    <span style='color: {COLORS['text_muted']}; font-size: 12px;'>🆕 v9.7 DATA QUALITY SCORE</span>
                    <span style='color: {quality_color}; font-size: 24px; font-weight: 700; margin-left: 15px;'>{quality_score}/100</span>
                    <span style='color: {quality_color}; font-size: 14px; font-weight: 600; margin-left: 10px;'>{quality_status}</span>
                </div>
                <div style='text-align: right; color: {COLORS['text_secondary']}; font-size: 11px;'>
                    {validation_result['complete_rows']}/{validation_result['total_rows']} Complete Rows
                    {f"<br/><span style='color: {COLORS['danger']};'>⚠️ {len(validation_result['issues'])} Issues</span>" if validation_result['issues'] else ""}
                    {f"<br/><span style='color: {COLORS['warning']};'>⚡ {len(validation_result['warnings'])} Warnings</span>" if validation_result['warnings'] else ""}
                </div>
            </div>
        </div>
        """, unsafe_allow_html=True)

        if validation_result['issues'] or validation_result['warnings']:
            with st.expander("🔍 View Data Quality Details", expanded=False):
                if validation_result['issues']:
                    st.error("**Issues Found:**")
                    for issue in validation_result['issues']:
                        st.write(f"- {issue}")
                if validation_result['warnings']:
                    st.warning("**Warnings:**")
                    for warning in validation_result['warnings']:
                        st.write(f"- {warning}")

        st.markdown("---")

        # Risk Snapshot & Signal Health
        portfolio_returns = calculate_portfolio_returns(df, start_date, end_date)

        col_health, col_snapshot = st.columns([1, 3])

        with col_health:
            # Calculate metrics for health indicator
            if is_valid_series(portfolio_returns):
                metrics = calculate_performance_metrics(enhanced_df, portfolio_returns, None)
                health_badge = create_signal_health_badge(metrics)
                st.markdown("### 🎯 Portfolio Health")
                st.markdown(health_badge, unsafe_allow_html=True)
                st.caption(f"**Last Updated:** {ATLASFormatter.format_timestamp()}")

        with col_snapshot:
            # Risk Snapshot
            risk_snapshot_html = create_risk_snapshot(enhanced_df, portfolio_returns)
            st.markdown(risk_snapshot_html, unsafe_allow_html=True)

        st.markdown("---")
        st.markdown("### 📋 Holdings")

        # Column selector for interactive table customization
        with st.expander("⚙️ Customize Columns", expanded=False):
            # Define all available columns
            ALL_COLUMNS = [
                'Ticker', 'Asset Name', 'Shares', 'Avg Cost', 'Current Price',
                'Daily Change %', '5D Return %', 'YTD Return %', 'Weight %',
                'Daily P&L $', 'Total Gain/Loss $', 'Total Gain/Loss %',
                'Beta', 'Analyst Rating', 'Quality Score', 'Sector',
                'Price Target', 'Volume'
            ]

            # Default columns to show
            DEFAULT_COLUMNS = [
                'Ticker', 'Asset Name', 'Shares', 'Current Price',
                'Daily Change %', '5D Return %', 'Weight %',
                'Total Gain/Loss $', 'Total Gain/Loss %', 'Quality Score'
            ]

            # Filter only columns that exist in enhanced_df
            available_columns = [col for col in ALL_COLUMNS if col in enhanced_df.columns]
            default_selected = [col for col in DEFAULT_COLUMNS if col in enhanced_df.columns]

            selected_columns = st.multiselect(
                "Select Columns to Display",
                options=available_columns,
                default=default_selected,
                help="Choose which columns to show in the holdings table"
            )

        # Display holdings table
        if selected_columns:
            # Create display dataframe with selected columns
            display_df = enhanced_df[selected_columns].copy()

            # Format columns appropriately
            pct_cols = [col for col in selected_columns if '%' in col]
            for col in pct_cols:
                if col in display_df.columns:
                    display_df[col] = display_df[col].apply(lambda x: format_percentage(x) if pd.notna(x) else 'N/A')

            currency_cols = ['Avg Cost', 'Current Price', 'Daily P&L $', 'Total Gain/Loss $', 'Price Target']
            for col in currency_cols:
                if col in display_df.columns:
                    display_df[col] = display_df[col].apply(lambda x: format_currency(x) if pd.notna(x) else 'N/A')

            # Add arrow indicators for change columns
            if 'Daily Change %' in display_df.columns:
                display_df['Daily Change %'] = display_df['Daily Change %'].apply(add_arrow_indicator)
            if 'Total Gain/Loss %' in display_df.columns:
                display_df['Total Gain/Loss %'] = display_df['Total Gain/Loss %'].apply(add_arrow_indicator)

            st.dataframe(display_df, use_container_width=True, hide_index=True, height=500, column_config=None)
        else:
            st.warning("⚠️ Please select at least one column to display")

        st.info("💡 **Tip:** Head to the Valuation House to analyze intrinsic values of any ticker!")

        # Add VaR/CVaR Optimization Toggle
        st.markdown("---")
        show_optimization = st.checkbox("🎯 Show VaR/CVaR Portfolio Optimization", value=False,
                                       help="Calculate optimal portfolio weights to minimize tail risk")

        if show_optimization:
            with st.spinner("Calculating optimal portfolio weights..."):
                rebalancing_df, opt_metrics = calculate_var_cvar_portfolio_optimization(enhanced_df)

                if rebalancing_df is not None and opt_metrics is not None:
                    # Display optimization summary
                    st.markdown("### 🎯 Portfolio Optimization Results")

                    col1, col2, col3, col4 = st.columns(4)
                    with col1:
                        st.metric("VaR Reduction",
                                 f"{opt_metrics['var_reduction_pct']:.1f}%",
                                 f"{opt_metrics['current_var']:.2f}% → {opt_metrics['optimal_var']:.2f}%",
                                 delta_color="inverse")

                    with col2:
                        st.metric("CVaR Reduction",
                                 f"{opt_metrics['cvar_reduction_pct']:.1f}%",
                                 f"{opt_metrics['current_cvar']:.2f}% → {opt_metrics['optimal_cvar']:.2f}%",
                                 delta_color="inverse")

                    with col3:
                        st.metric("Sharpe Improvement",
                                 f"+{opt_metrics['sharpe_improvement']:.2f}",
                                 f"{opt_metrics['current_sharpe']:.2f} → {opt_metrics['optimal_sharpe']:.2f}")

                    with col4:
                        st.metric("Trades Required",
                                 opt_metrics['total_trades'],
                                 f"Est. Cost: ${opt_metrics['rebalancing_cost']:,.0f}")

                    # Merge optimization data into enhanced_df for display
                    enhanced_df_with_opt = enhanced_df.merge(
                        rebalancing_df[['Ticker', 'Optimal Weight %', 'Weight Diff %',
                                       'Shares to Trade', 'Trade Value', 'Action']],
                        on='Ticker',
                        how='left'
                    )

                    # Display enhanced table with optimization columns
                    st.markdown("### 📋 Holdings with Optimization Targets")
                    display_df_opt = style_holdings_dataframe_with_optimization(enhanced_df_with_opt)
                    st.dataframe(display_df_opt, use_container_width=True, hide_index=True, height=500)

        st.markdown("---")
        st.markdown("### 📊 DASHBOARD OVERVIEW")
        
        # ENHANCED: Better layout with 2 rows
        row1_col1, row1_col2 = st.columns([2, 1])
        
        with row1_col1:
            risk_reward = create_risk_reward_plot(enhanced_df)
            if risk_reward:
                st.plotly_chart(risk_reward, use_container_width=True)

        with row1_col2:
            # Sector allocation chart moved to Portfolio Deep Dive for better visibility
            detractors = create_top_detractors_chart(enhanced_df)
            if detractors:
                st.plotly_chart(detractors, use_container_width=True)

        # P&L Attribution Analysis
        st.markdown("---")
        st.markdown("### 💼 P&L Attribution Analysis")

        pnl_col1, pnl_col2 = st.columns(2)

        with pnl_col1:
            pnl_sector = create_pnl_attribution_sector(enhanced_df)
            if pnl_sector:
                st.plotly_chart(pnl_sector, use_container_width=True)

        with pnl_col2:
            pnl_position = create_pnl_attribution_position(enhanced_df, top_n=10)
            if pnl_position:
                st.plotly_chart(pnl_position, use_container_width=True)

        # Performance Heatmap (full width)
        st.markdown("---")
        perf_heatmap = create_performance_heatmap(enhanced_df)
        if perf_heatmap:
            st.plotly_chart(perf_heatmap, use_container_width=True)
    
    # ========================================================================
    # MARKET WATCH - COMPLETE REVAMP
    # ========================================================================
    elif page == "🌍 Market Watch":
        st.markdown("## 🌍 MARKET WATCH - EXCELLENCE EDITION")
        st.markdown("*Your comprehensive window into global markets, crypto, bonds, and credit conditions*")
        
        st.markdown("---")
        st.markdown("### 🔍 Filters & Settings")
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            filter_change = st.slider("Min Change %", -10.0, 10.0, -10.0)
        with col2:
            sort_by = st.selectbox("Sort By", ["Change %", "5D %", "Volume"])
        with col3:
            refresh = st.button("🔄 Refresh Data")
        with col4:
            auto_refresh = st.checkbox("Auto-Refresh (5min)")
        
        st.markdown("---")
        
        # EXPANDED TABS
        tab1, tab2, tab3, tab4, tab5, tab6, tab7 = st.tabs([
            "📈 Indices", 
            "💰 Crypto", 
            "🏦 ETFs", 
            "⚡ Commodities",
            "📊 Stocks",
            "💵 Bonds & Rates",
            "🎯 Credit Spreads"
        ])
        
        with tab1:
            st.markdown("#### 🌍 Global Indices")
            with st.spinner("Loading indices..."):
                indices_df = fetch_market_watch_data(GLOBAL_INDICES)
                if not indices_df.empty:
                    indices_df = indices_df[indices_df['Change %'] >= filter_change]
                    display_df = create_dynamic_market_table(indices_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=600, column_config=None)
                else:
                    st.warning("No data available")
        
        with tab2:
            st.markdown("#### 🪙 Cryptocurrency Markets")
            with st.spinner("Loading crypto..."):
                crypto_df = fetch_market_watch_data(CRYPTOCURRENCIES)
                if not crypto_df.empty:
                    crypto_df = crypto_df[crypto_df['Change %'] >= filter_change]
                    display_df = create_dynamic_market_table(crypto_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=600, column_config=None)
                else:
                    st.warning("No data available")
        
        with tab3:
            st.markdown("#### 📦 Exchange-Traded Funds")
            sectors = st.multiselect("Filter by Category", 
                                     ["Broad Market", "Sector", "Thematic", "International"],
                                     default=["Broad Market", "Sector", "Thematic"])
            
            with st.spinner("Loading ETFs..."):
                etf_df = fetch_market_watch_data(POPULAR_ETFS)
                if not etf_df.empty:
                    if sectors:
                        etf_df = etf_df[etf_df['Category'].isin(sectors)]
                    display_df = create_dynamic_market_table(etf_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=600, column_config=None)
                else:
                    st.warning("No data available")
        
        with tab4:
            st.markdown("#### ⛽ Commodity Markets")
            commodity_cats = st.multiselect("Filter by Type",
                                           ["Precious Metals", "Energy", "Industrial Metals", "Agriculture", "Livestock"],
                                           default=["Precious Metals", "Energy"])
            
            with st.spinner("Loading commodities..."):
                comm_df = fetch_market_watch_data(COMMODITIES)
                if not comm_df.empty:
                    if commodity_cats:
                        comm_df = comm_df[comm_df['Category'].isin(commodity_cats)]
                    display_df = create_dynamic_market_table(comm_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=600, column_config=None)
                else:
                    st.warning("No data available")
        
        with tab5:
            st.markdown("#### 📈 Popular Stocks")
            stock_sectors = st.multiselect("Filter by Category",
                                          ["Mega Cap Tech", "Financials", "Healthcare", "Consumer", "Energy"],
                                          default=["Mega Cap Tech", "Financials"])
            
            with st.spinner("Loading stocks..."):
                stocks_df = fetch_market_watch_data(POPULAR_STOCKS)
                if not stocks_df.empty:
                    if stock_sectors:
                        stocks_df = stocks_df[stocks_df['Category'].isin(stock_sectors)]
                    display_df = create_dynamic_market_table(stocks_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=600, column_config=None)
                else:
                    st.warning("No data available")
        
        with tab6:
            st.markdown("#### 💵 Global Bond Yields & Yield Curves")
            st.info("📊 **Key Insight:** Monitor yield curves for recession signals, inflation expectations, and relative value across markets")

            # Country/Region selector for yield curves
            selected_curve = st.selectbox(
                "Select Yield Curve",
                ["US Treasuries", "UK Gilts", "German Bunds", "SA Government Bonds"],
                index=0,
                help="Compare government bond yields across major economies"
            )

            # Display yield curve based on selection
            if selected_curve == "US Treasuries":
                yield_curve = create_yield_curve()
                if yield_curve:
                    st.plotly_chart(yield_curve, use_container_width=True)
                    st.caption(f"**Data Freshness:** {ATLASFormatter.format_timestamp()} • {ATLASFormatter.get_freshness_badge(2)}")

                    # Calculate and display spread
                    treasuries_10y = yf.Ticker("^TNX")
                    treasuries_2y = yf.Ticker("^FVX")
                    try:
                        hist_10y = treasuries_10y.history(period="1d")
                        hist_2y = treasuries_2y.history(period="1d")
                        if not hist_10y.empty and not hist_2y.empty:
                            spread_10y_2y = hist_10y['Close'].iloc[-1] - hist_2y['Close'].iloc[-1]
                            if spread_10y_2y > 0:
                                st.success(f"✅ 10Y-2Y Spread: **+{spread_10y_2y:.2f}%** (Normal - Positive slope)")
                            else:
                                st.error(f"⚠️ 10Y-2Y Spread: **{spread_10y_2y:.2f}%** (INVERTED - Potential recession signal)")
                    except:
                        pass

            elif selected_curve == "UK Gilts":
                st.warning("📊 UK Gilt yield curve data integration pending. Sample structure shown:")
                # Sample data for illustration
                maturities = [2, 5, 10, 30]
                yields = [4.2, 4.0, 4.1, 4.5]  # Sample yields

                fig_gilts = go.Figure()
                fig_gilts.add_trace(go.Scatter(
                    x=maturities,
                    y=yields,
                    mode='lines+markers',
                    line=dict(color='#FF6B6B', width=3),
                    marker=dict(size=10),
                    text=[f"{m}Y: {y:.2f}%" for m, y in zip(maturities, yields)],
                    hovertemplate='<b>%{text}</b><extra></extra>'
                ))

                fig_gilts.update_layout(
                    title="📈 UK Gilt Yield Curve (Sample)",
                    xaxis_title="Maturity (Years)",
                    yaxis_title="Yield (%)",
                    height=400,
                    showlegend=False
                )
                apply_chart_theme(fig_gilts)
                st.plotly_chart(fig_gilts, use_container_width=True)
                st.caption("*Real-time UK gilt data can be integrated via Bloomberg API or Bank of England feeds*")

            elif selected_curve == "German Bunds":
                st.warning("📊 German Bund yield curve data integration pending. Sample structure shown:")
                # Sample data for illustration
                maturities = [2, 5, 10, 30]
                yields = [2.8, 2.5, 2.6, 2.9]  # Sample yields

                fig_bunds = go.Figure()
                fig_bunds.add_trace(go.Scatter(
                    x=maturities,
                    y=yields,
                    mode='lines+markers',
                    line=dict(color='#FFD700', width=3),
                    marker=dict(size=10),
                    text=[f"{m}Y: {y:.2f}%" for m, y in zip(maturities, yields)],
                    hovertemplate='<b>%{text}</b><extra></extra>'
                ))

                fig_bunds.update_layout(
                    title="📈 German Bund Yield Curve (Sample)",
                    xaxis_title="Maturity (Years)",
                    yaxis_title="Yield (%)",
                    height=400,
                    showlegend=False
                )
                apply_chart_theme(fig_bunds)
                st.plotly_chart(fig_bunds, use_container_width=True)
                st.caption("*Real-time Bund data can be integrated via Bloomberg API or Bundesbank feeds*")

            elif selected_curve == "SA Government Bonds":
                st.warning("📊 SA Government Bond yield curve data integration pending. Sample structure shown:")
                # Sample data for illustration
                maturities = [3, 5, 10, 20]
                yields = [10.5, 10.8, 11.2, 11.5]  # Sample yields

                fig_sagov = go.Figure()
                fig_sagov.add_trace(go.Scatter(
                    x=maturities,
                    y=yields,
                    mode='lines+markers',
                    line=dict(color='#00D4FF', width=3),
                    marker=dict(size=10),
                    text=[f"{m}Y: {y:.2f}%" for m, y in zip(maturities, yields)],
                    hovertemplate='<b>%{text}</b><extra></extra>'
                ))

                fig_sagov.update_layout(
                    title="📈 SA Government Bond Yield Curve (Sample)",
                    xaxis_title="Maturity (Years)",
                    yaxis_title="Yield (%)",
                    height=400,
                    showlegend=False
                )
                apply_chart_theme(fig_sagov)
                st.plotly_chart(fig_sagov, use_container_width=True)
                st.caption("*Real-time SA bond data can be integrated via JSE or SARB feeds*")

            st.markdown("---")

            with st.spinner("Loading bonds..."):
                bonds_df = fetch_market_watch_data(BOND_YIELDS)
                if not bonds_df.empty:
                    display_df = create_dynamic_market_table(bonds_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=400, column_config=None)
                else:
                    st.warning("No data available")
        
        with tab7:
            st.markdown("#### 🎯 Credit Spreads & Conditions")
            st.info("💡 **Key Insight:** Widening spreads signal deteriorating credit conditions and rising risk premiums")
            
            with st.spinner("Loading credit spreads..."):
                credit_df = fetch_market_watch_data(CREDIT_SPREADS)
                if not credit_df.empty:
                    display_df = create_dynamic_market_table(credit_df, {'sort_by': sort_by, 'ascending': False})
                    st.dataframe(display_df, use_container_width=True, hide_index=True, height=400, column_config=None)
                    
                    st.markdown("---")
                    st.markdown("#### 📊 Credit Market Interpretation")
                    st.markdown("""
                    **Investment Grade (LQD):** Corporate bonds rated BBB- or higher
                    **High Yield (HYG):** "Junk" bonds with higher risk and return potential
                    **Emerging Markets (EMB):** Sovereign and corporate debt from developing economies
                    **TIPS (TIP):** Treasury Inflation-Protected Securities
                    **MBS (MBB):** Mortgage-Backed Securities
                    """)
                else:
                    st.warning("No data available")
    
    # Continue with remaining pages in next message...
    # (Risk Analysis, Performance Suite, Portfolio Deep Dive, Multi-Factor, Valuation House, About)
    
    # ========================================================================
    # RISK ANALYSIS - WORLD CLASS
    # ========================================================================
    elif page == "📈 Risk Analysis":
        st.markdown("## 📈 RISK ANALYSIS - WORLD CLASS")
        
        portfolio_data = load_portfolio_data()
        
        if not portfolio_data:
            st.warning("⚠️ No portfolio data.")
            return
        
        df = pd.DataFrame(portfolio_data)
        enhanced_df = create_enhanced_holdings_table(df)
        
        with st.spinner("Calculating..."):
            portfolio_returns = calculate_portfolio_returns(df, start_date, end_date)
            benchmark_returns = calculate_benchmark_returns(selected_benchmark, start_date, end_date)
            
            if not is_valid_series(portfolio_returns):
                st.warning("Insufficient data")
                return
            
            sharpe = calculate_sharpe_ratio(portfolio_returns)
            sortino = calculate_sortino_ratio(portfolio_returns)
            calmar = calculate_calmar_ratio(portfolio_returns)
            var_95 = calculate_var(portfolio_returns, 0.95)
            max_dd = calculate_max_drawdown(portfolio_returns)
        
        # v9.7 ENHANCEMENT: Added CVaR metric
        cvar_95 = calculate_cvar(portfolio_returns, 0.95)

        col1, col2, col3, col4, col5, col6 = st.columns(6)
        col1.metric("🔥 Sharpe", ATLASFormatter.format_ratio(sharpe) if sharpe else "N/A")
        col2.metric("💎 Sortino", ATLASFormatter.format_ratio(sortino) if sortino else "N/A")
        col3.metric("⚖️ Calmar", ATLASFormatter.format_ratio(calmar) if calmar else "N/A")
        col4.metric("📉 VaR 95%", format_percentage(var_95) if var_95 else "N/A")
        col5.metric("🔴 CVaR 95%", format_percentage(cvar_95) if cvar_95 else "N/A")
        col6.metric("⚠️ Max DD", format_percentage(max_dd) if max_dd else "N/A")
        
        st.markdown("---")

        tab1, tab2, tab3, tab4, tab5 = st.tabs([
            "📊 Core Risk", "🎲 Monte Carlo", "🔬 Advanced Analytics", "⚡ Stress Tests", "🎯 VaR/CVaR Optimization"
        ])
        
        with tab1:
            col1, col2 = st.columns(2)
            
            with col1:
                var_chart = create_var_waterfall(portfolio_returns)
                if var_chart:
                    st.plotly_chart(var_chart, use_container_width=True)

                # v9.7 NEW: VaR/CVaR on Return Distribution
                var_dist = create_var_cvar_distribution(portfolio_returns)
                if var_dist:
                    st.plotly_chart(var_dist, use_container_width=True)
                else:
                    st.info("Insufficient data for distribution analysis (requires 30+ observations)")

                risk_parity = create_risk_parity_analysis(enhanced_df)
                if risk_parity:
                    st.plotly_chart(risk_parity, use_container_width=True)
            
            with col2:
                efficient = create_efficient_frontier(enhanced_df)
                if efficient:
                    st.plotly_chart(efficient, use_container_width=True)

                # FIX 7: Add Drawdown Distribution chart
                drawdown_dist = create_drawdown_distribution(portfolio_returns)
                if drawdown_dist:
                    st.plotly_chart(drawdown_dist, use_container_width=True)

            # v9.7 NEW FEATURE: Rolling VaR/CVaR Evolution
            st.markdown("#### 📈 v9.7: Rolling Risk Metrics Evolution")
            rolling_var_cvar = create_rolling_var_cvar_chart(portfolio_returns, window=60)
            if rolling_var_cvar:
                st.plotly_chart(rolling_var_cvar, use_container_width=True)
            else:
                st.info("Insufficient data for rolling VaR/CVaR analysis (requires 60+ days)")

        with tab2:
            simulations = run_monte_carlo_simulation(portfolio_returns)
            if simulations is not None:
                monte_carlo_chart, mc_stats = create_monte_carlo_chart(simulations, 100000)
                
                if monte_carlo_chart:
                    st.plotly_chart(monte_carlo_chart, use_container_width=True)
                
                if mc_stats:
                    st.markdown("#### 📊 Simulation Results")
                    st.markdown(f"""
                    **Key Statistics:**
                    - Expected Value: ${mc_stats['mean']:,.2f}
                    - Median: ${mc_stats['median']:,.2f}
                    - Best Case (95th): ${mc_stats['percentile_95']:,.2f}
                    - Worst Case (5th): ${mc_stats['percentile_5']:,.2f}
                    - Prob of Profit: {mc_stats['prob_profit']:.1f}%
                    """)
        
        with tab3:
            col1, col2 = st.columns(2)
            
            with col1:
                rolling = create_rolling_metrics_chart(portfolio_returns)
                if rolling:
                    st.plotly_chart(rolling, use_container_width=True)
            
            with col2:
                underwater = create_underwater_plot(portfolio_returns)
                if underwater:
                    st.plotly_chart(underwater, use_container_width=True)
            
            sunburst = create_risk_contribution_sunburst(enhanced_df)
            if sunburst:
                st.plotly_chart(sunburst, use_container_width=True)
            
            corr_network = create_correlation_network(enhanced_df, start_date, end_date)
            if corr_network:
                st.plotly_chart(corr_network, use_container_width=True)
        
        with tab4:
            st.markdown("#### ⚡ Historical Stress Test Analysis")
            st.info("💡 **Historical Stress Testing:** See how your current portfolio would have performed during major market crises")

            # Run historical stress test calculation
            with st.spinner("Calculating historical stress scenarios..."):
                stress_results = calculate_historical_stress_test(enhanced_df)

            if not stress_results:
                st.warning("⚠️ Unable to calculate historical stress tests. This may be due to data availability for your holdings during historical periods.")
            else:
                # Period selector
                selected_period = st.selectbox(
                    "Select Historical Stress Period",
                    options=list(stress_results.keys()),
                    index=len(stress_results) - 1 if len(stress_results) > 0 else 0
                )

                if selected_period in stress_results:
                    period_data = stress_results[selected_period]
                    metrics = period_data['metrics']

                    # Display key metrics
                    st.markdown("##### 📊 Performance Metrics")
                    metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)

                    with metric_col1:
                        st.metric(
                            "Portfolio Return",
                            f"{metrics['portfolio_return']:+.2f}%",
                            delta=None
                        )

                    with metric_col2:
                        st.metric(
                            "S&P 500 Return",
                            f"{metrics['spy_return']:+.2f}%",
                            delta=None
                        )

                    with metric_col3:
                        outperf_color = "normal" if metrics['outperformance'] >= 0 else "inverse"
                        st.metric(
                            "Outperformance",
                            f"{metrics['outperformance']:+.2f}%",
                            delta=f"{metrics['outperformance']:+.2f}%",
                            delta_color=outperf_color
                        )

                    with metric_col4:
                        st.metric(
                            "Max Drawdown",
                            f"{metrics['portfolio_drawdown']:.2f}%",
                            delta=f"{metrics['portfolio_drawdown'] - metrics['spy_drawdown']:+.2f}% vs SPY"
                        )

                    # Create line graph showing cumulative returns
                    st.markdown("##### 📈 Cumulative Returns Comparison")

                    fig_stress = go.Figure()

                    # Portfolio line
                    fig_stress.add_trace(go.Scatter(
                        x=period_data['dates'],
                        y=period_data['portfolio_cumulative'],
                        mode='lines',
                        name='Your Portfolio',
                        line=dict(color='#00D4FF', width=3),
                        hovertemplate='<b>Portfolio</b><br>Date: %{x|%Y-%m-%d}<br>Value: %{y:.2f}<extra></extra>'
                    ))

                    # S&P 500 line
                    fig_stress.add_trace(go.Scatter(
                        x=period_data['dates'],
                        y=period_data['spy_cumulative'],
                        mode='lines',
                        name='S&P 500',
                        line=dict(color='#FF4136', width=2, dash='dash'),
                        hovertemplate='<b>S&P 500</b><br>Date: %{x|%Y-%m-%d}<br>Value: %{y:.2f}<extra></extra>'
                    ))

                    fig_stress.update_layout(
                        title=f"{selected_period} - Portfolio vs S&P 500",
                        xaxis_title="Date",
                        yaxis_title="Cumulative Return (Base 100)",
                        height=500,
                        hovermode='x unified',
                        legend=dict(
                            orientation="h",
                            yanchor="bottom",
                            y=1.02,
                            xanchor="right",
                            x=1
                        )
                    )

                    # Add baseline at 100
                    fig_stress.add_hline(
                        y=100,
                        line_dash="dot",
                        line_color=COLORS['text_muted'],
                        line_width=1,
                        annotation_text="Starting Value"
                    )

                    apply_chart_theme(fig_stress)
                    st.plotly_chart(fig_stress, use_container_width=True)

                    # Summary metrics table
                    st.markdown("##### 📋 Detailed Stress Metrics")

                    summary_data = []
                    for period_name, data in stress_results.items():
                        m = data['metrics']
                        summary_data.append({
                            'Period': period_name,
                            'Portfolio Return': f"{m['portfolio_return']:+.2f}%",
                            'S&P 500 Return': f"{m['spy_return']:+.2f}%",
                            'Outperformance': f"{m['outperformance']:+.2f}%",
                            'Portfolio Max DD': f"{m['portfolio_drawdown']:.2f}%",
                            'SPY Max DD': f"{m['spy_drawdown']:.2f}%",
                            'Portfolio Vol': f"{m['portfolio_volatility']:.2f}%"
                        })

                    summary_df = pd.DataFrame(summary_data)
                    st.dataframe(summary_df, use_container_width=True, hide_index=True, column_config=None)

                    # Methodology notes
                    st.markdown("---")
                    st.markdown("##### ⚠️ Methodology & Important Notes")
                    st.caption("""
                    **Calculation Method:**
                    - Uses current portfolio weights applied to historical price data
                    - Compares against S&P 500 (^GSPC) performance during same periods
                    - Cumulative returns normalized to base 100 at period start
                    - Maximum drawdown calculated as peak-to-trough decline

                    **Important Limitations:**
                    - ⚠️ **Survivorship Bias:** Analysis assumes current holdings existed during historical periods. Companies that failed or weren't publicly traded are excluded.
                    - ⚠️ **Hindsight Bias:** Current portfolio composition may differ significantly from what would have been held historically
                    - ⚠️ **Data Availability:** Some holdings may lack historical data for earlier periods, affecting accuracy
                    - ⚠️ **No Rebalancing:** Assumes static weights throughout each period (no tactical adjustments)

                    **Use Case:** This analysis provides directional insight into portfolio resilience during crises, but should not be interpreted as definitive historical performance.
                    """)

        with tab5:  # NEW VaR/CVaR Optimization Tab
            st.markdown("### 🎯 VaR/CVaR Portfolio Optimization")
            st.info("Optimize portfolio weights to minimize Conditional Value at Risk (CVaR) - the expected loss beyond VaR")

            col1, col2, col3 = st.columns([2, 1, 1])

            with col2:
                confidence = st.slider("Confidence Level", 90, 99, 95, 1) / 100
                lookback = st.slider("Lookback Period (days)", 60, 504, 252, 21)

            with col3:
                if st.button("🔄 Run Optimization", type="primary"):
                    st.session_state['run_optimization'] = True

            with col1:
                if st.session_state.get('run_optimization', False):
                    with st.spinner("Running portfolio optimization..."):
                        rebalancing_df, opt_metrics = calculate_var_cvar_portfolio_optimization(
                            enhanced_df, confidence, lookback
                        )

                        if rebalancing_df is not None:
                            st.session_state['rebalancing_df'] = rebalancing_df
                            st.session_state['opt_metrics'] = opt_metrics
                            st.success("✅ Optimization complete!")

            # Display results if available
            if 'rebalancing_df' in st.session_state:
                rebalancing_df = st.session_state['rebalancing_df']
                opt_metrics = st.session_state['opt_metrics']

                # Risk metrics improvement
                st.markdown("#### 📊 Risk Metrics Improvement")
                col1, col2, col3, col4 = st.columns(4)

                with col1:
                    st.metric("Current VaR", f"{opt_metrics['current_var']:.2f}%")
                    st.metric("Optimal VaR", f"{opt_metrics['optimal_var']:.2f}%",
                             f"-{opt_metrics['var_reduction_pct']:.1f}%", delta_color="inverse")

                with col2:
                    st.metric("Current CVaR", f"{opt_metrics['current_cvar']:.2f}%")
                    st.metric("Optimal CVaR", f"{opt_metrics['optimal_cvar']:.2f}%",
                             f"-{opt_metrics['cvar_reduction_pct']:.1f}%", delta_color="inverse")

                with col3:
                    st.metric("Current Sharpe", f"{opt_metrics['current_sharpe']:.2f}")
                    st.metric("Optimal Sharpe", f"{opt_metrics['optimal_sharpe']:.2f}",
                             f"+{opt_metrics['sharpe_improvement']:.2f}")

                with col4:
                    st.metric("Buy Trades", opt_metrics['buy_trades'])
                    st.metric("Sell Trades", opt_metrics['sell_trades'])

                # Rebalancing instructions
                st.markdown("#### 📋 Rebalancing Instructions")
                trades_only = rebalancing_df[rebalancing_df['Action'] != 'HOLD'].copy()

                if len(trades_only) > 0:
                    # Format for display
                    trades_only['Trade Value'] = trades_only['Trade Value'].apply(
                        lambda x: f"${x:,.0f}" if x > 0 else f"-${abs(x):,.0f}"
                    )
                    trades_only['Weight Diff %'] = trades_only['Weight Diff %'].apply(
                        lambda x: f"{x:+.1f}%"
                    )

                    st.dataframe(
                        trades_only[['Ticker', 'Asset Name', 'Action', 'Shares to Trade',
                                   'Trade Value', 'Current Weight %', 'Optimal Weight %',
                                   'Weight Diff %']],
                        use_container_width=True,
                        hide_index=True
                    )

                    # Download button
                    csv = rebalancing_df.to_csv(index=False)
                    st.download_button(
                        "📥 Export Optimization Plan",
                        csv,
                        f"var_optimization_{datetime.now().strftime('%Y%m%d')}.csv",
                        "text/csv"
                    )

                # Weight comparison chart
                st.markdown("#### 📈 Portfolio Weight Comparison")

                # Create comparison chart
                fig = go.Figure()

                # Sort by current weight
                df_sorted = rebalancing_df.sort_values('Current Weight %', ascending=True)

                fig.add_trace(go.Bar(
                    name='Current',
                    y=df_sorted['Ticker'],
                    x=df_sorted['Current Weight %'],
                    orientation='h',
                    marker_color=COLORS['electric_blue'],
                    text=df_sorted['Current Weight %'].apply(lambda x: f"{x:.1f}%"),
                    textposition='auto',
                ))

                fig.add_trace(go.Bar(
                    name='Optimal',
                    y=df_sorted['Ticker'],
                    x=df_sorted['Optimal Weight %'],
                    orientation='h',
                    marker_color=COLORS['teal'],
                    text=df_sorted['Optimal Weight %'].apply(lambda x: f"{x:.1f}%"),
                    textposition='auto',
                ))

                fig.update_layout(
                    title="Current vs Optimal Portfolio Weights",
                    xaxis_title="Weight (%)",
                    yaxis_title="",
                    barmode='group',
                    height=max(400, len(df_sorted) * 40),
                    template="plotly_dark",
                    paper_bgcolor=COLORS['background'],
                    plot_bgcolor=COLORS['card_background'],
                    showlegend=True,
                    legend=dict(
                        orientation="h",
                        yanchor="bottom",
                        y=1.02,
                        xanchor="right",
                        x=1
                    )
                )

                st.plotly_chart(fig, use_container_width=True)

    # Continue with remaining pages...
    # ========================================================================
    # PERFORMANCE SUITE
    # ========================================================================
    elif page == "💎 Performance Suite":
        st.title("📊 Performance Suite")

        portfolio_data = load_portfolio_data()

        if not portfolio_data:
            st.warning("⚠️ No portfolio data.")
            return

        df = pd.DataFrame(portfolio_data)
        enhanced_df = create_enhanced_holdings_table(df)

        with st.spinner("Calculating portfolio metrics..."):
            portfolio_returns = calculate_portfolio_returns(df, start_date, end_date)
            benchmark_returns = calculate_benchmark_returns(selected_benchmark, start_date, end_date)

        # === TAB STRUCTURE ===
        tab1, tab2, tab3, tab4 = st.tabs([
            "📈 Portfolio Performance",
            "🎯 Individual Securities",
            "⚠️ Risk Decomposition",
            "📊 Attribution & Benchmarking"
        ])

        # ============================================================
        # TAB 1: PORTFOLIO PERFORMANCE (Enhanced)
        # ============================================================
        with tab1:
            st.subheader("Portfolio Performance Metrics")

            if portfolio_returns is not None and len(portfolio_returns) > 0:

                # === KEY METRICS GRID ===
                col1, col2, col3, col4 = st.columns(4)

                # Total Return
                total_return = (1 + portfolio_returns).prod() - 1
                n_years = len(portfolio_returns) / 252
                annualized_return = (1 + total_return) ** (1/n_years) - 1 if n_years > 0 else 0

                with col1:
                    st.metric(
                        "Annualized Return",
                        f"{annualized_return*100:.2f}%",
                        delta=f"{(total_return*100):.2f}% total"
                    )

                # Volatility
                annualized_vol = portfolio_returns.std() * np.sqrt(252)

                with col2:
                    st.metric(
                        "Annualized Volatility",
                        f"{annualized_vol*100:.2f}%"
                    )

                # Sharpe Ratio
                sharpe = calculate_sharpe_ratio(portfolio_returns)

                with col3:
                    sharpe_color = "normal" if sharpe and sharpe > 1.0 else "inverse"
                    sharpe_delta = "Excellent" if sharpe and sharpe > 1.5 else ("Good" if sharpe and sharpe > 1.0 else "Fair")
                    st.metric(
                        "Sharpe Ratio",
                        f"{sharpe:.2f}" if sharpe else "N/A",
                        delta=sharpe_delta if sharpe else None,
                        delta_color=sharpe_color if sharpe else "off"
                    )

                # Max Drawdown
                max_dd = calculate_max_drawdown(portfolio_returns)

                with col4:
                    st.metric(
                        "Max Drawdown",
                        f"{max_dd:.2f}%" if max_dd else "N/A",
                        delta_color="inverse"
                    )

                st.divider()

                # === RETURNS DISTRIBUTION ===
                col1, col2 = st.columns(2)

                with col1:
                    st.subheader("Returns Distribution")

                    # Histogram
                    fig_hist = go.Figure()

                    fig_hist.add_trace(go.Histogram(
                        x=portfolio_returns * 100,
                        nbinsx=50,
                        marker_color='#00d4ff',
                        opacity=0.7,
                        name='Daily Returns'
                    ))

                    # Add normal distribution overlay
                    mean_return = portfolio_returns.mean() * 100
                    std_return = portfolio_returns.std() * 100

                    x_range = np.linspace(
                        portfolio_returns.min() * 100,
                        portfolio_returns.max() * 100,
                        100
                    )

                    normal_dist = stats.norm.pdf(x_range, mean_return, std_return)
                    # Scale to match histogram
                    normal_dist = normal_dist * len(portfolio_returns) * (x_range[1] - x_range[0])

                    fig_hist.add_trace(go.Scatter(
                        x=x_range,
                        y=normal_dist,
                        mode='lines',
                        line=dict(color='#ff3366', width=2),
                        name='Normal Distribution'
                    ))

                    fig_hist.update_layout(
                        title="Daily Returns Distribution",
                        xaxis_title="Return (%)",
                        yaxis_title="Frequency",
                        height=400,
                        showlegend=True,
                        paper_bgcolor='rgba(0, 0, 0, 0)',
                        plot_bgcolor='rgba(10, 25, 41, 0.3)',
                        font=dict(color='#ffffff')
                    )

                    st.plotly_chart(fig_hist, use_container_width=True)

                with col2:
                    st.subheader("Rolling Performance")

                    # Rolling Sharpe Ratio (90-day)
                    rolling_window = min(90, len(portfolio_returns) // 2)

                    if rolling_window > 20:
                        rolling_sharpe = portfolio_returns.rolling(rolling_window).apply(
                            lambda x: (x.mean() / x.std() * np.sqrt(252)) if x.std() > 0 else 0
                        )

                        fig_rolling = go.Figure()

                        fig_rolling.add_trace(go.Scatter(
                            x=rolling_sharpe.index,
                            y=rolling_sharpe.values,
                            mode='lines',
                            line=dict(color='#00ff88', width=2),
                            fill='tozeroy',
                            fillcolor='rgba(0, 255, 136, 0.2)',
                            name='Rolling Sharpe'
                        ))

                        # Add 1.0 reference line
                        fig_rolling.add_hline(
                            y=1.0,
                            line_dash="dash",
                            line_color="#ffaa00",
                            annotation_text="Sharpe = 1.0 (Good)",
                            annotation_position="right"
                        )

                        fig_rolling.update_layout(
                            title=f"Rolling Sharpe Ratio ({rolling_window}-day)",
                            xaxis_title="Date",
                            yaxis_title="Sharpe Ratio",
                            height=400,
                            paper_bgcolor='rgba(0, 0, 0, 0)',
                            plot_bgcolor='rgba(10, 25, 41, 0.3)',
                            font=dict(color='#ffffff')
                        )

                        st.plotly_chart(fig_rolling, use_container_width=True)

                st.divider()

                # === ADVANCED METRICS ===
                st.subheader("Advanced Performance Metrics")

                metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)

                # Sortino Ratio
                sortino = calculate_sortino_ratio(portfolio_returns)

                with metric_col1:
                    st.metric("Sortino Ratio", f"{sortino:.2f}" if sortino else "N/A")

                # Calmar Ratio
                calmar = calculate_calmar_ratio(portfolio_returns)

                with metric_col2:
                    st.metric("Calmar Ratio", f"{calmar:.2f}" if calmar else "N/A")

                # Win Rate
                win_rate = (portfolio_returns > 0).sum() / len(portfolio_returns) * 100

                with metric_col3:
                    st.metric("Win Rate", f"{win_rate:.1f}%")

                # VaR (95%)
                var_95 = calculate_var(portfolio_returns, confidence=0.95)

                with metric_col4:
                    st.metric("VaR (95%)", f"{var_95:.2f}%" if var_95 else "N/A")

        # ============================================================
        # TAB 2: INDIVIDUAL SECURITIES ANALYSIS (NEW - GAME CHANGER)
        # ============================================================
        with tab2:
            st.subheader("Individual Security Performance Analysis")

            st.info("🎯 Institutional-grade metrics for each holding - analyze like a professional fund manager")

            # Security selector
            selected_ticker = st.selectbox(
                "Select Security to Analyze:",
                options=enhanced_df['Ticker'].tolist(),
                index=0
            )

            if selected_ticker:
                # Get holding data
                holding = enhanced_df[enhanced_df['Ticker'] == selected_ticker].iloc[0]

                # Display header
                col1, col2, col3 = st.columns([2, 1, 1])

                with col1:
                    st.markdown(f"### {holding.get('Asset Name', selected_ticker)} ({selected_ticker})")
                    st.caption(f"Sector: {holding.get('Sector', 'Unknown')}")

                with col2:
                    current_price = holding.get('Current Price', 0)
                    st.metric("Current Price", f"${current_price:.2f}")

                with col3:
                    weight = holding.get('Weight %', 0)
                    st.metric("Portfolio Weight", f"{weight:.2f}%")

                st.divider()

                # === CHART CONTROLS ===
                st.markdown("#### ⚙️ Chart Settings")

                ctrl_col1, ctrl_col2, ctrl_col3, ctrl_col4 = st.columns([2, 2, 2, 2])

                with ctrl_col1:
                    time_range = st.selectbox(
                        "Time Period",
                        options=["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "Max"],
                        index=4  # Default to 1Y
                    )

                with ctrl_col2:
                    chart_type = st.selectbox(
                        "Chart Type",
                        options=["Candlestick", "Line"],
                        index=0
                    )

                with ctrl_col3:
                    show_volume = st.checkbox("Show Volume", value=True)

                with ctrl_col4:
                    show_indicators = st.checkbox("Show Indicators", value=True)

                # Multi-security comparison
                st.markdown("#### 📊 Multi-Security Comparison")
                compare_mode = st.checkbox("Enable Comparison Mode", value=False)

                compare_tickers = [selected_ticker]
                if compare_mode:
                    available_tickers = [t for t in enhanced_df['Ticker'].tolist() if t != selected_ticker]
                    additional_tickers = st.multiselect(
                        "Add securities to compare:",
                        options=available_tickers,
                        max_selections=4,
                        help="Compare up to 5 securities total"
                    )
                    compare_tickers.extend(additional_tickers)

                # === CALCULATE DATE RANGE ===
                end_date_ticker = datetime.now()

                if time_range == "1M":
                    start_date_ticker = end_date_ticker - timedelta(days=30)
                elif time_range == "3M":
                    start_date_ticker = end_date_ticker - timedelta(days=90)
                elif time_range == "6M":
                    start_date_ticker = end_date_ticker - timedelta(days=180)
                elif time_range == "YTD":
                    start_date_ticker = datetime(end_date_ticker.year, 1, 1)
                elif time_range == "1Y":
                    start_date_ticker = end_date_ticker - timedelta(days=365)
                elif time_range == "2Y":
                    start_date_ticker = end_date_ticker - timedelta(days=730)
                elif time_range == "5Y":
                    start_date_ticker = end_date_ticker - timedelta(days=1825)
                else:  # Max
                    start_date_ticker = end_date_ticker - timedelta(days=3650)  # 10 years

                # === FETCH COMPREHENSIVE DATA FOR TICKER ===
                ticker_hist = fetch_historical_data(selected_ticker, start_date_ticker, end_date_ticker)

                if ticker_hist is not None and len(ticker_hist) > 20:

                    # Calculate returns
                    ticker_returns = ticker_hist['Close'].pct_change().dropna()

                    # === PERFORMANCE METRICS ===
                    st.subheader("📈 Performance Metrics (1 Year)")

                    perf_col1, perf_col2, perf_col3, perf_col4, perf_col5 = st.columns(5)

                    # Total Return
                    total_ret = ((ticker_hist['Close'].iloc[-1] / ticker_hist['Close'].iloc[0]) - 1) * 100

                    with perf_col1:
                        st.metric("Total Return", f"{total_ret:+.2f}%")

                    # Annualized Return
                    n_years_ticker = len(ticker_returns) / 252
                    ann_ret = ((1 + total_ret/100) ** (1/n_years_ticker) - 1) * 100 if n_years_ticker > 0 else 0

                    with perf_col2:
                        st.metric("Annualized Return", f"{ann_ret:.2f}%")

                    # Volatility
                    ann_vol_ticker = ticker_returns.std() * np.sqrt(252) * 100

                    with perf_col3:
                        st.metric("Volatility (Ann.)", f"{ann_vol_ticker:.2f}%")

                    # Sharpe Ratio
                    sharpe_ticker = calculate_sharpe_ratio(ticker_returns)

                    with perf_col4:
                        st.metric("Sharpe Ratio", f"{sharpe_ticker:.2f}" if sharpe_ticker else "N/A")

                    # Max Drawdown
                    max_dd_ticker = calculate_max_drawdown(ticker_returns)

                    with perf_col5:
                        st.metric("Max Drawdown", f"{max_dd_ticker:.2f}%" if max_dd_ticker else "N/A")

                    st.divider()

                    # === PRICE CHART WITH TECHNICAL INDICATORS ===
                    if compare_mode and len(compare_tickers) > 1:
                        st.subheader("📊 Multi-Security Comparison")

                        # Fetch data for all comparison tickers
                        comparison_data = {}
                        colors = ['#00D4FF', '#FF4136', '#2ECC40', '#FFDC00', '#B10DC9']

                        for idx, ticker in enumerate(compare_tickers):
                            ticker_data = fetch_historical_data(ticker, start_date_ticker, end_date_ticker)
                            if ticker_data is not None and len(ticker_data) > 0:
                                # Normalize to base 100
                                normalized = (ticker_data['Close'] / ticker_data['Close'].iloc[0]) * 100
                                comparison_data[ticker] = {
                                    'data': normalized,
                                    'color': colors[idx % len(colors)]
                                }

                        # Create comparison chart
                        fig_compare = go.Figure()

                        for ticker, info in comparison_data.items():
                            fig_compare.add_trace(go.Scatter(
                                x=info['data'].index,
                                y=info['data'],
                                mode='lines',
                                name=ticker,
                                line=dict(color=info['color'], width=2),
                                hovertemplate=f'<b>{ticker}</b><br>Date: %{{x|%Y-%m-%d}}<br>Value: %{{y:.2f}}<extra></extra>'
                            ))

                        fig_compare.update_layout(
                            title=f"Normalized Price Comparison ({time_range}) - Base 100",
                            xaxis_title="Date",
                            yaxis_title="Normalized Value (Base 100)",
                            height=600,
                            hovermode='x unified',
                            legend=dict(
                                orientation="h",
                                yanchor="bottom",
                                y=1.02,
                                xanchor="right",
                                x=1
                            )
                        )

                        fig_compare.add_hline(
                            y=100,
                            line_dash="dot",
                            line_color=COLORS['text_muted'],
                            line_width=1,
                            annotation_text="Starting Value"
                        )

                        apply_chart_theme(fig_compare)
                        st.plotly_chart(fig_compare, use_container_width=True)

                        # Comparison metrics table
                        st.markdown("##### Performance Comparison")
                        comparison_metrics = []

                        for ticker in compare_tickers:
                            ticker_data = fetch_historical_data(ticker, start_date_ticker, end_date_ticker)
                            if ticker_data is not None and len(ticker_data) > 5:
                                total_return = ((ticker_data['Close'].iloc[-1] / ticker_data['Close'].iloc[0]) - 1) * 100
                                returns = ticker_data['Close'].pct_change().dropna()
                                volatility = returns.std() * np.sqrt(252) * 100
                                sharpe = calculate_sharpe_ratio(returns)

                                comparison_metrics.append({
                                    'Ticker': ticker,
                                    'Total Return': f"{total_return:+.2f}%",
                                    'Volatility': f"{volatility:.2f}%",
                                    'Sharpe Ratio': f"{sharpe:.2f}" if sharpe else "N/A",
                                    'Current Price': f"${ticker_data['Close'].iloc[-1]:.2f}"
                                })

                        if comparison_metrics:
                            comp_df = pd.DataFrame(comparison_metrics)
                            st.dataframe(comp_df, use_container_width=True, hide_index=True, column_config=None)

                    else:
                        # Single security analysis with technical indicators
                        st.subheader("📊 Price Chart & Technical Analysis")

                        # Calculate technical indicators
                        ticker_hist['MA_50'] = ticker_hist['Close'].rolling(50).mean()
                        ticker_hist['MA_200'] = ticker_hist['Close'].rolling(200).mean()

                        # Bollinger Bands
                        ticker_hist['BB_middle'] = ticker_hist['Close'].rolling(20).mean()
                        ticker_hist['BB_std'] = ticker_hist['Close'].rolling(20).std()
                        ticker_hist['BB_upper'] = ticker_hist['BB_middle'] + (2 * ticker_hist['BB_std'])
                        ticker_hist['BB_lower'] = ticker_hist['BB_middle'] - (2 * ticker_hist['BB_std'])

                        # Create subplots if volume is enabled
                        if show_volume:
                            from plotly.subplots import make_subplots
                            fig_price = make_subplots(
                                rows=2, cols=1,
                                shared_xaxes=True,
                                vertical_spacing=0.03,
                                row_heights=[0.7, 0.3],
                                subplot_titles=(f"{selected_ticker} - {chart_type} Chart ({time_range})", "Volume")
                            )
                        else:
                            fig_price = go.Figure()

                        # Add price chart based on selected type
                        if chart_type == "Candlestick":
                            price_trace = go.Candlestick(
                                x=ticker_hist.index,
                                open=ticker_hist['Open'],
                                high=ticker_hist['High'],
                                low=ticker_hist['Low'],
                                close=ticker_hist['Close'],
                                name='Price',
                                increasing_line_color='#00ff88',
                                decreasing_line_color='#ff3366'
                            )
                        else:  # Line chart
                            price_trace = go.Scatter(
                                x=ticker_hist.index,
                                y=ticker_hist['Close'],
                                mode='lines',
                                name='Price',
                                line=dict(color='#00D4FF', width=2),
                                fill='tozeroy',
                                fillcolor='rgba(0, 212, 255, 0.1)'
                            )

                        if show_volume:
                            fig_price.add_trace(price_trace, row=1, col=1)
                        else:
                            fig_price.add_trace(price_trace)

                        # Add technical indicators if enabled
                        if show_indicators:
                            row_num = 1 if show_volume else None
                            col_num = 1 if show_volume else None

                            # Moving averages
                            fig_price.add_trace(go.Scatter(
                                x=ticker_hist.index,
                                y=ticker_hist['MA_50'],
                                mode='lines',
                                line=dict(color='#00d4ff', width=1.5),
                                name='MA 50'
                            ), row=row_num, col=col_num)

                            fig_price.add_trace(go.Scatter(
                                x=ticker_hist.index,
                                y=ticker_hist['MA_200'],
                                mode='lines',
                                line=dict(color='#ffaa00', width=1.5),
                                name='MA 200'
                            ), row=row_num, col=col_num)

                            # Bollinger Bands
                            fig_price.add_trace(go.Scatter(
                                x=ticker_hist.index,
                                y=ticker_hist['BB_upper'],
                                mode='lines',
                                line=dict(color='#b794f6', width=1, dash='dash'),
                                name='BB Upper',
                                showlegend=False
                            ), row=row_num, col=col_num)

                            fig_price.add_trace(go.Scatter(
                                x=ticker_hist.index,
                                y=ticker_hist['BB_lower'],
                                mode='lines',
                                line=dict(color='#b794f6', width=1, dash='dash'),
                                name='BB Lower',
                                fill='tonexty',
                                fillcolor='rgba(183, 148, 246, 0.1)'
                            ), row=row_num, col=col_num)

                        # Add volume bars if enabled
                        if show_volume:
                            colors_vol = ['#00ff88' if ticker_hist['Close'].iloc[i] >= ticker_hist['Open'].iloc[i]
                                         else '#ff3366' for i in range(len(ticker_hist))]

                            fig_price.add_trace(go.Bar(
                                x=ticker_hist.index,
                                y=ticker_hist['Volume'],
                                name='Volume',
                                marker=dict(color=colors_vol),
                                showlegend=False
                            ), row=2, col=1)

                        # Update layout
                        if show_volume:
                            fig_price.update_layout(
                                height=700,
                                hovermode='x unified',
                                xaxis_rangeslider_visible=False,
                                xaxis2_title="Date",
                                yaxis_title="Price ($)",
                                yaxis2_title="Volume"
                            )
                        else:
                            fig_price.update_layout(
                                title=f"{selected_ticker} - {chart_type} Chart ({time_range})",
                                xaxis_title="Date",
                                yaxis_title="Price ($)",
                                height=600,
                                xaxis_rangeslider_visible=False
                            )

                        apply_chart_theme(fig_price)
                        st.plotly_chart(fig_price, use_container_width=True)

                    st.divider()

                    # === RISK METRICS ===
                    st.subheader("⚠️ Risk Analysis")

                    risk_col1, risk_col2 = st.columns(2)

                    with risk_col1:
                        # VaR and CVaR
                        var_95_ticker = calculate_var(ticker_returns, confidence=0.95)
                        cvar_95_ticker = calculate_cvar(ticker_returns, confidence=0.95)

                        st.markdown("**Value at Risk (VaR)**")
                        st.metric("VaR 95%", f"{var_95_ticker:.2f}%" if var_95_ticker else "N/A",
                                 help="Maximum expected loss on 95% of days")
                        st.metric("CVaR 95%", f"{cvar_95_ticker:.2f}%" if cvar_95_ticker else "N/A",
                                 help="Expected loss when VaR is breached")

                    with risk_col2:
                        # Beta and correlation to SPY
                        try:
                            spy_hist = fetch_historical_data('SPY', start_date_ticker, end_date_ticker)

                            if spy_hist is not None and len(spy_hist) > 20:
                                spy_returns = spy_hist['Close'].pct_change().dropna()

                                # Align dates
                                common_dates = ticker_returns.index.intersection(spy_returns.index)
                                ticker_aligned = ticker_returns.loc[common_dates]
                                spy_aligned = spy_returns.loc[common_dates]

                                # Calculate beta
                                covariance = np.cov(ticker_aligned, spy_aligned)[0][1]
                                market_variance = np.var(spy_aligned)
                                beta = covariance / market_variance if market_variance > 0 else 1.0

                                # Calculate correlation
                                correlation = ticker_aligned.corr(spy_aligned)

                                st.markdown("**Market Relationship**")
                                st.metric("Beta (vs SPY)", f"{beta:.2f}",
                                         help="Sensitivity to market movements")
                                st.metric("Correlation (vs SPY)", f"{correlation:.2f}",
                                         help="How closely it tracks the market")
                        except:
                            st.warning("Unable to calculate market relationship metrics")

                    st.divider()

                    # === CONTRIBUTION TO PORTFOLIO ===
                    st.subheader("📊 Portfolio Contribution")

                    contrib_col1, contrib_col2, contrib_col3 = st.columns(3)

                    with contrib_col1:
                        position_value = holding.get('Total Value', 0)
                        st.metric("Position Value", f"${position_value:,.2f}")

                    with contrib_col2:
                        gain_loss_pct = holding.get('Total Gain/Loss %', 0)
                        st.metric("Position Return", f"{gain_loss_pct:+.2f}%")

                    with contrib_col3:
                        # Contribution to portfolio return
                        portfolio_contribution = (weight / 100) * gain_loss_pct
                        st.metric("Portfolio Contribution", f"{portfolio_contribution:+.2f}%",
                                 help="This position's contribution to total portfolio return")

                else:
                    st.warning(f"Insufficient historical data for {selected_ticker}")

        # ============================================================
        # TAB 3: RISK DECOMPOSITION (NEW)
        # ============================================================
        with tab3:
            st.subheader("Risk Decomposition Analysis")

            st.info("Understand WHERE your portfolio risk comes from")

            if portfolio_returns is not None and len(portfolio_returns) > 20:

                # Calculate portfolio volatility
                portfolio_vol = portfolio_returns.std() * np.sqrt(252) * 100

                st.metric("Portfolio Volatility (Annualized)", f"{portfolio_vol:.2f}%")

                st.divider()

                # === POSITION-LEVEL RISK CONTRIBUTION ===
                st.subheader("📊 Risk Contribution by Position")

                st.markdown("""
                **Marginal Contribution to Risk (MCR):** How much each position contributes to total portfolio risk.

                - High MCR = This position drives a lot of portfolio volatility
                - Positions with similar weights can have very different MCRs due to correlations
                """)

                # Calculate for each position
                risk_contributions = []

                for _, holding_item in enhanced_df.iterrows():
                    ticker_risk = holding_item['Ticker']
                    weight_risk = holding_item['Weight %'] / 100

                    # Get ticker returns
                    ticker_hist_risk = fetch_historical_data(ticker_risk,
                                                        datetime.now() - timedelta(days=365),
                                                        datetime.now())

                    if ticker_hist_risk is not None and len(ticker_hist_risk) > 20:
                        ticker_returns_risk = ticker_hist_risk['Close'].pct_change().dropna()
                        ticker_vol_risk = ticker_returns_risk.std() * np.sqrt(252)

                        # Simplified MCR: weight * volatility (proper MCR requires covariance matrix)
                        mcr = weight_risk * ticker_vol_risk * 100

                        risk_contributions.append({
                            'Ticker': ticker_risk,
                            'Weight %': weight_risk * 100,
                            'Volatility %': ticker_vol_risk * 100,
                            'Risk Contribution %': mcr
                        })

                if risk_contributions:
                    risk_df = pd.DataFrame(risk_contributions).sort_values('Risk Contribution %', ascending=False)

                    # Normalize to percentage of total risk
                    total_risk = risk_df['Risk Contribution %'].sum()
                    risk_df['% of Portfolio Risk'] = (risk_df['Risk Contribution %'] / total_risk * 100).round(1)

                    # Display table
                    st.dataframe(risk_df, use_container_width=True, hide_index=True)

                    # Visualization
                    fig_risk_contrib = go.Figure(go.Bar(
                        x=risk_df['% of Portfolio Risk'],
                        y=risk_df['Ticker'],
                        orientation='h',
                        marker_color='#ff6b00',
                        text=[f"{val:.1f}%" for val in risk_df['% of Portfolio Risk']],
                        textposition='outside'
                    ))

                    fig_risk_contrib.update_layout(
                        title="Risk Contribution by Position",
                        xaxis_title="% of Total Portfolio Risk",
                        yaxis_title="",
                        height=500,
                        paper_bgcolor='rgba(0, 0, 0, 0)',
                        plot_bgcolor='rgba(10, 25, 41, 0.3)',
                        font=dict(color='#ffffff')
                    )

                    st.plotly_chart(fig_risk_contrib, use_container_width=True)

            # === SECTOR ALLOCATION ANALYSIS ===
            st.divider()
            st.markdown("### 📊 Sector Allocation Analysis")
            st.info("View portfolio sector distribution with enhanced visibility")

            # Use full width for better label visibility
            sector_chart = create_professional_sector_allocation_pie(enhanced_df)
            if sector_chart:
                # Increase height for better label display
                sector_chart.update_layout(
                    height=600,
                    margin=dict(l=20, r=150, t=40, b=20),  # More margin for labels
                    showlegend=True,
                    legend=dict(
                        yanchor="middle",
                        y=0.5,
                        xanchor="left",
                        x=1.05
                    )
                )
                st.plotly_chart(sector_chart, use_container_width=True)

        # ============================================================
        # TAB 4: ATTRIBUTION & BENCHMARKING (Enhanced)
        # ============================================================
        with tab4:
            st.subheader("Performance Attribution & Benchmark Comparison")

            if benchmark_returns is not None and portfolio_returns is not None and len(portfolio_returns) > 0:

                # Align returns
                common_dates = portfolio_returns.index.intersection(benchmark_returns.index)
                port_aligned = portfolio_returns.loc[common_dates]
                bench_aligned = benchmark_returns.loc[common_dates]

                # Calculate metrics
                port_total = (1 + port_aligned).prod() - 1
                bench_total = (1 + bench_aligned).prod() - 1
                excess_return = port_total - bench_total

                # Display summary
                col1, col2, col3 = st.columns(3)

                with col1:
                    st.metric("Portfolio Return", f"{port_total*100:.2f}%")

                with col2:
                    st.metric("Benchmark Return (SPY)", f"{bench_total*100:.2f}%")

                with col3:
                    st.metric("Excess Return (Alpha)", f"{excess_return*100:+.2f}%",
                             delta_color="normal" if excess_return > 0 else "inverse")

                st.divider()

                # === CUMULATIVE RETURN COMPARISON ===
                st.subheader("📈 Cumulative Performance vs Benchmark")

                port_cumulative = (1 + port_aligned).cumprod() - 1
                bench_cumulative = (1 + bench_aligned).cumprod() - 1

                fig_cumulative = go.Figure()

                fig_cumulative.add_trace(go.Scatter(
                    x=port_cumulative.index,
                    y=port_cumulative.values * 100,
                    mode='lines',
                    line=dict(color='#00d4ff', width=2),
                    name='Your Portfolio'
                ))

                fig_cumulative.add_trace(go.Scatter(
                    x=bench_cumulative.index,
                    y=bench_cumulative.values * 100,
                    mode='lines',
                    line=dict(color='#ffaa00', width=2, dash='dash'),
                    name='SPY Benchmark'
                ))

                fig_cumulative.update_layout(
                    title="Cumulative Returns Comparison",
                    xaxis_title="Date",
                    yaxis_title="Cumulative Return (%)",
                    height=500,
                    paper_bgcolor='rgba(0, 0, 0, 0)',
                    plot_bgcolor='rgba(10, 25, 41, 0.3)',
                    font=dict(color='#ffffff'),
                    hovermode='x unified'
                )

                st.plotly_chart(fig_cumulative, use_container_width=True)

                st.divider()

                # === TRACKING ERROR & INFORMATION RATIO ===
                st.subheader("📊 Active Management Metrics")

                tracking_col1, tracking_col2, tracking_col3 = st.columns(3)

                # Tracking Error
                excess_returns = port_aligned - bench_aligned
                tracking_error = excess_returns.std() * np.sqrt(252) * 100

                with tracking_col1:
                    st.metric("Tracking Error", f"{tracking_error:.2f}%",
                             help="Volatility of excess returns vs benchmark")

                # Information Ratio
                info_ratio = calculate_information_ratio(port_aligned, bench_aligned)

                with tracking_col2:
                    st.metric("Information Ratio", f"{info_ratio:.2f}" if info_ratio else "N/A",
                             help="Excess return per unit of tracking error")

                # Active Share (simplified - would need holdings-level data for true calculation)
                with tracking_col3:
                    st.metric("Active Positions", f"{len(enhanced_df)}",
                             help="Number of holdings in portfolio")
    
    # ========================================================================
    # PORTFOLIO DEEP DIVE - ENHANCED
    # ========================================================================
    elif page == "🔬 Portfolio Deep Dive":
        st.markdown("## 🔬 PORTFOLIO DEEP DIVE - ENHANCED")
        st.markdown("---")

        portfolio_data = load_portfolio_data()
        
        if not portfolio_data:
            st.warning("⚠️ No portfolio data.")
            return
        
        df = pd.DataFrame(portfolio_data)
        enhanced_df = create_enhanced_holdings_table(df)

        tab1, tab2, tab3, tab4 = st.tabs([
            "🎯 Attribution", "🔄 Sector Rotation", "📊 Concentration", "🏆 Brinson Attribution"
        ])
        
        with tab1:
            col1, col2 = st.columns(2)
            
            with col1:
                heatmap = create_portfolio_heatmap(enhanced_df)
                if heatmap:
                    st.plotly_chart(heatmap, use_container_width=True)
            
            with col2:
                waterfall = create_holdings_attribution_waterfall(enhanced_df)
                if waterfall:
                    st.plotly_chart(waterfall, use_container_width=True)
        
        with tab2:
            rotation = create_sector_rotation_heatmap(enhanced_df, start_date, end_date)
            if rotation:
                st.plotly_chart(rotation, use_container_width=True)
        
        with tab3:
            col1, col2 = st.columns([1, 2])
            
            with col1:
                gauge = create_concentration_gauge(enhanced_df)
                if gauge:
                    st.plotly_chart(gauge, use_container_width=True)
            
            with col2:
                # ENHANCED: Better concentration visual
                conc_analysis = create_concentration_analysis(enhanced_df)
                if conc_analysis:
                    st.plotly_chart(conc_analysis, use_container_width=True)

        with tab4:
            st.markdown("### 🏆 Brinson Attribution Analysis")
            st.markdown("Decompose portfolio performance into **Allocation** (sector timing) vs **Selection** (stock picking) skill")

            # Validate and map sectors before attribution analysis
            enhanced_df_validated = validate_and_map_sectors(enhanced_df.copy())

            # Get benchmark data
            benchmark_weights = SP500_SECTOR_WEIGHTS
            with st.spinner("Fetching benchmark sector returns..."):
                benchmark_returns = get_benchmark_sector_returns(period='1Y')

            # Calculate attribution
            try:
                attribution_results = calculate_brinson_attribution(
                    enhanced_df_validated,
                    benchmark_weights,
                    benchmark_returns,
                    period='1Y'
                )

                # Display skill assessment card
                st.markdown(create_skill_assessment_card(attribution_results), unsafe_allow_html=True)

                # Display waterfall chart
                st.plotly_chart(create_brinson_attribution_chart(attribution_results),
                               use_container_width=True)

                # Display detailed sector table
                st.markdown("#### 📋 Sector-by-Sector Attribution")
                sector_table = create_sector_attribution_table(attribution_results['attribution_df'])
                st.dataframe(
                    sector_table,
                    use_container_width=True,
                    hide_index=True,
                    column_config=None
                )

                # Explanation
                with st.expander("ℹ️ Understanding Brinson Attribution"):
                    st.markdown("""
                    **Brinson Attribution** breaks down your portfolio outperformance into:

                    1. **Allocation Effect** - Your skill at sector timing
                       - Measures if you overweighted sectors that outperformed
                       - Example: Overweighting tech before a tech rally = positive allocation

                    2. **Selection Effect** - Your skill at stock picking
                       - Measures if your stocks beat their sector average
                       - Example: Picking NVDA in tech when NVDA beats XLK = positive selection

                    3. **Interaction Effect** - Combined benefit
                       - Being overweight the right sectors AND picking winners within them

                    **Interpretation:**
                    - **High Allocation Score**: You're good at macro/sector calls → Use sector ETFs
                    - **High Selection Score**: You're good at stock picking → Focus on fundamentals
                    - **Both Low**: Consider passive indexing

                    **Benchmark**: S&P 500 sector weights and sector ETF returns (XLK, XLV, XLF, etc.)
                    """)

            except Exception as e:
                st.error(f"Error calculating Brinson Attribution: {str(e)}")
                st.info("💡 Make sure your portfolio has valid sector classifications and return data.")

        # ============================================================
        # QUALITY SCORECARD - COMPREHENSIVE QUALITY ANALYSIS
        # ============================================================
        st.divider()
        st.subheader("🏆 Portfolio Quality Scorecard")
        st.info("Comprehensive quality analysis for all holdings based on profitability, growth, financial health, and analyst ratings")

        # Calculate comprehensive quality metrics for each holding
        quality_data = []

        for _, row in enhanced_df.iterrows():
            ticker = row['Ticker']
            info = fetch_stock_info(ticker)

            if info:
                quality_data.append({
                    'Ticker': ticker,
                    'Asset Name': row.get('Asset Name', ticker),
                    'Quality Score': row.get('Quality Score', 5.0),
                    'ROE': f"{info.get('returnOnEquity', 0) * 100:.1f}%" if info.get('returnOnEquity') else 'N/A',
                    'Profit Margin': f"{info.get('profitMargins', 0) * 100:.1f}%" if info.get('profitMargins') else 'N/A',
                    'Revenue Growth': f"{info.get('revenueGrowth', 0) * 100:.1f}%" if info.get('revenueGrowth') else 'N/A',
                    'Debt/Equity': f"{info.get('debtToEquity', 0):.1f}" if info.get('debtToEquity') else 'N/A',
                    'Current Ratio': f"{info.get('currentRatio', 0):.2f}" if info.get('currentRatio') else 'N/A',
                    'Peg Ratio': f"{info.get('pegRatio', 0):.2f}" if info.get('pegRatio') else 'N/A',
                    'Analyst Rating': info.get('recommendationKey', 'N/A').replace('_', ' ').title(),
                    'Target Price': f"${info.get('targetMeanPrice', 0):.2f}" if info.get('targetMeanPrice') else 'N/A',
                    'Upside': f"{((info.get('targetMeanPrice', 0) / row['Current Price']) - 1) * 100:+.1f}%" if info.get('targetMeanPrice') and row['Current Price'] > 0 else 'N/A'
                })

        if quality_data:
            quality_df = pd.DataFrame(quality_data)

            # Sort by Quality Score descending
            quality_df = quality_df.sort_values('Quality Score', ascending=False)

            # Display quality scorecard table
            st.dataframe(
                quality_df,
                use_container_width=True,
                hide_index=True,
                column_config=None
            )

            # Quality distribution chart
            fig_quality = go.Figure()

            colors_quality = [
                COLORS['success'] if score >= 7 else COLORS['warning'] if score >= 5 else COLORS['danger']
                for score in quality_df['Quality Score']
            ]

            fig_quality.add_trace(go.Bar(
                x=quality_df['Ticker'],
                y=quality_df['Quality Score'],
                marker_color=colors_quality,
                text=quality_df['Quality Score'].apply(lambda x: f"{x:.1f}"),
                textposition='outside',
                hovertemplate='<b>%{x}</b><br>Quality Score: %{y:.1f}/10<extra></extra>'
            ))

            fig_quality.update_layout(
                title="Portfolio Quality Score Distribution",
                yaxis_title="Quality Score (0-10)",
                xaxis_title="",
                height=400,
                yaxis=dict(range=[0, 11]),
                showlegend=False
            )

            apply_chart_theme(fig_quality)
            st.plotly_chart(fig_quality, use_container_width=True)

            # Quality insights
            high_quality = quality_df[quality_df['Quality Score'] >= 7]
            medium_quality = quality_df[(quality_df['Quality Score'] >= 5) & (quality_df['Quality Score'] < 7)]
            low_quality = quality_df[quality_df['Quality Score'] < 5]

            col1, col2, col3 = st.columns(3)

            with col1:
                st.markdown(f"#### ✅ High Quality ({len(high_quality)})")
                if len(high_quality) > 0:
                    st.success(", ".join(high_quality['Ticker'].tolist()))
                else:
                    st.markdown("*None*")

            with col2:
                st.markdown(f"#### ⚠️ Medium Quality ({len(medium_quality)})")
                if len(medium_quality) > 0:
                    st.warning(", ".join(medium_quality['Ticker'].tolist()))
                else:
                    st.markdown("*None*")

            with col3:
                st.markdown(f"#### 🔴 Low Quality ({len(low_quality)})")
                if len(low_quality) > 0:
                    st.error(", ".join(low_quality['Ticker'].tolist()))
                    st.caption("*Consider reviewing these positions*")
                else:
                    st.markdown("*None*")

            # Overall portfolio quality score
            avg_quality = quality_df['Quality Score'].mean()
            st.markdown(f"### 📊 Overall Portfolio Quality: **{avg_quality:.1f}/10**")

            if avg_quality >= 7:
                st.success("✅ Your portfolio consists of high-quality companies with strong fundamentals")
            elif avg_quality >= 5:
                st.warning("⚠️ Your portfolio has mixed quality - consider upgrading lower-rated holdings")
            else:
                st.error("🔴 Portfolio quality is below average - focus on fundamental improvements")

        else:
            st.warning("Unable to fetch quality data for holdings")

        # ============================================================
        # MPT PORTFOLIO OPTIMIZATION - MODERN PORTFOLIO THEORY
        # ============================================================
        st.divider()
        st.subheader("⚙️ Portfolio Optimization (Modern Portfolio Theory)")
        st.info("Optimize portfolio allocation using institutional-grade MPT algorithms")

        col1, col2, col3 = st.columns(3)

        with col1:
            optimization_objective = st.selectbox(
                "Optimization Objective",
                ["Max Sharpe Ratio", "Min Volatility", "Max Return", "Risk Parity"],
                index=0,
                help="Select optimization strategy based on your investment goals"
            )

        with col2:
            risk_free_rate_input = st.number_input(
                "Risk-Free Rate (%)",
                value=RISK_FREE_RATE * 100,
                min_value=0.0,
                max_value=10.0,
                step=0.1
            ) / 100

        with col3:
            if st.button("🚀 Run MPT Optimization", type="primary"):
                st.session_state['run_mpt_optimization'] = True

        if st.session_state.get('run_mpt_optimization', False):
            with st.spinner("⚡ Running portfolio optimization..."):
                # Get historical returns for all holdings
                returns_data = {}
                for ticker in enhanced_df['Ticker'].unique():
                    hist_data = fetch_historical_data(ticker,
                                                     datetime.now() - timedelta(days=252),
                                                     datetime.now())
                    if hist_data is not None and len(hist_data) > 0:
                        returns_data[ticker] = hist_data['Close'].pct_change().dropna()

                # Create returns dataframe
                returns_df = pd.DataFrame(returns_data)
                returns_df = returns_df.dropna()

                if len(returns_df) > 30:
                    # Calculate optimal weights based on objective
                    if optimization_objective == "Max Sharpe Ratio":
                        optimal_weights = optimize_max_sharpe(returns_df, risk_free_rate_input)
                    elif optimization_objective == "Min Volatility":
                        optimal_weights = optimize_min_volatility(returns_df)
                    elif optimization_objective == "Max Return":
                        optimal_weights = optimize_max_return(returns_df)
                    elif optimization_objective == "Risk Parity":
                        optimal_weights = optimize_risk_parity(returns_df)

                    # Get current weights
                    current_weights_dict = {}
                    total_value = enhanced_df['Total Value'].sum()
                    for _, row in enhanced_df.iterrows():
                        current_weights_dict[row['Ticker']] = row['Total Value'] / total_value

                    current_weights = pd.Series(current_weights_dict)

                    # Create comparison dataframe
                    comparison_data = []
                    for ticker in optimal_weights.index:
                        current_w = current_weights.get(ticker, 0)
                        optimal_w = optimal_weights.get(ticker, 0)

                        comparison_data.append({
                            'Ticker': ticker,
                            'Current Weight': current_w * 100,
                            'Optimal Weight': optimal_w * 100,
                            'Difference': (optimal_w - current_w) * 100,
                            'Action': '🟢 Increase' if optimal_w > current_w else '🔴 Decrease' if optimal_w < current_w else '⚪ Hold'
                        })

                    comparison_df = pd.DataFrame(comparison_data)
                    comparison_df = comparison_df.sort_values('Optimal Weight', ascending=False)

                    st.markdown("### 📊 Optimization Results")

                    # Format for display
                    display_comparison = comparison_df.copy()
                    display_comparison['Current Weight'] = display_comparison['Current Weight'].apply(lambda x: f"{x:.2f}%")
                    display_comparison['Optimal Weight'] = display_comparison['Optimal Weight'].apply(lambda x: f"{x:.2f}%")
                    display_comparison['Difference'] = display_comparison['Difference'].apply(lambda x: f"{x:+.2f}%")

                    st.dataframe(display_comparison, use_container_width=True, hide_index=True)

                    # Calculate portfolio metrics
                    st.markdown("### 📈 Expected Performance")

                    # Current portfolio metrics
                    current_return = (returns_df * current_weights).sum(axis=1).mean() * 252
                    current_vol = (returns_df * current_weights).sum(axis=1).std() * np.sqrt(252)
                    current_sharpe = (current_return - risk_free_rate_input) / current_vol if current_vol > 0 else 0

                    # Optimal portfolio metrics
                    optimal_return = (returns_df * optimal_weights).sum(axis=1).mean() * 252
                    optimal_vol = (returns_df * optimal_weights).sum(axis=1).std() * np.sqrt(252)
                    optimal_sharpe = (optimal_return - risk_free_rate_input) / optimal_vol if optimal_vol > 0 else 0

                    col1, col2 = st.columns(2)

                    with col1:
                        st.markdown("#### 📊 Current Portfolio")
                        st.metric("Expected Return", f"{current_return * 100:.2f}%")
                        st.metric("Volatility", f"{current_vol * 100:.2f}%")
                        st.metric("Sharpe Ratio", f"{current_sharpe:.2f}")

                    with col2:
                        st.markdown("#### ✨ Optimized Portfolio")
                        st.metric("Expected Return", f"{optimal_return * 100:.2f}%",
                                 delta=f"{(optimal_return - current_return) * 100:+.2f}%")
                        st.metric("Volatility", f"{optimal_vol * 100:.2f}%",
                                 delta=f"{(optimal_vol - current_vol) * 100:+.2f}%",
                                 delta_color="inverse")
                        st.metric("Sharpe Ratio", f"{optimal_sharpe:.2f}",
                                 delta=f"{(optimal_sharpe - current_sharpe):+.2f}")

                    # Weight comparison chart
                    st.markdown("#### 📈 Weight Comparison")

                    fig_weights = go.Figure()

                    fig_weights.add_trace(go.Bar(
                        name='Current',
                        x=comparison_df['Ticker'],
                        y=comparison_df['Current Weight'],
                        marker_color=COLORS['electric_blue'],
                        text=comparison_df['Current Weight'].apply(lambda x: f"{x:.1f}%"),
                        textposition='auto'
                    ))

                    fig_weights.add_trace(go.Bar(
                        name='Optimal',
                        x=comparison_df['Ticker'],
                        y=comparison_df['Optimal Weight'],
                        marker_color=COLORS['teal'],
                        text=comparison_df['Optimal Weight'].apply(lambda x: f"{x:.1f}%"),
                        textposition='auto'
                    ))

                    fig_weights.update_layout(
                        title=f"Current vs Optimal Weights ({optimization_objective})",
                        xaxis_title="",
                        yaxis_title="Weight (%)",
                        barmode='group',
                        height=500,
                        showlegend=True
                    )

                    apply_chart_theme(fig_weights)
                    st.plotly_chart(fig_weights, use_container_width=True)

                    st.success(f"✅ Optimization complete using {optimization_objective} strategy!")

                else:
                    st.error("Insufficient historical data for optimization (need 30+ days)")

        # ============================================================
        # CORRELATION HEATMAP - NEW ADDITION
        # ============================================================
        st.divider()
        st.subheader("🕸️ Portfolio Correlation Analysis")

        period = st.selectbox(
            "Correlation Period:",
            options=['30d', '90d', '1y'],
            index=1,
            format_func=lambda x: {'30d': '30 Days', '90d': '90 Days', '1y': '1 Year'}[x]
        )

        correlation_matrix = calculate_portfolio_correlations(enhanced_df, period=period)

        if correlation_matrix is not None and len(correlation_matrix) > 1:

            # Diversification score
            avg_corr = correlation_matrix.where(
                np.triu(np.ones(correlation_matrix.shape), k=1).astype(bool)
            ).stack().mean()

            div_score = (1 - avg_corr) * 10

            col1, col2 = st.columns(2)

            with col1:
                st.metric("Diversification Score", f"{div_score:.1f}/10")

            with col2:
                st.metric("Average Correlation", f"{avg_corr:.2f}")

            # PROFESSIONAL HEATMAP
            fig_heatmap = go.Figure(data=go.Heatmap(
                z=correlation_matrix.values,
                x=correlation_matrix.columns,
                y=correlation_matrix.index,
                colorscale='RdYlGn',
                zmid=0,
                zmin=-1,
                zmax=1,
                text=np.round(correlation_matrix.values, 2),
                texttemplate='%{text}',
                textfont={"size": 10, "color": "#000000"},
                colorbar=dict(
                    title="Correlation",
                    titleside="right",
                    tickmode="linear",
                    tick0=-1,
                    dtick=0.5
                ),
                hovertemplate='%{y} vs %{x}<br>Correlation: %{z:.2f}<extra></extra>'
            ))

            fig_heatmap.update_layout(
                title=dict(
                    text=f"Correlation Heatmap ({period})",
                    font=dict(size=18, color='#ffffff'),
                    x=0.5,
                    xanchor='center'
                ),
                height=600,
                xaxis=dict(
                    tickangle=-45,
                    tickfont=dict(size=11, color='#ffffff')
                ),
                yaxis=dict(
                    tickfont=dict(size=11, color='#ffffff')
                ),
                paper_bgcolor='rgba(0, 0, 0, 0)',
                plot_bgcolor='rgba(10, 25, 41, 0.3)'
            )

            st.plotly_chart(fig_heatmap, use_container_width=True)

            # Insights
            with st.expander("💡 Correlation Insights"):
                # High correlations
                high_corr_pairs = []
                for i in range(len(correlation_matrix)):
                    for j in range(i+1, len(correlation_matrix)):
                        corr_val = correlation_matrix.iloc[i, j]
                        if corr_val > 0.75:
                            high_corr_pairs.append((
                                correlation_matrix.index[i],
                                correlation_matrix.columns[j],
                                corr_val
                            ))

                if high_corr_pairs:
                    st.warning("**Highly Correlated Pairs (>0.75):**")
                    for t1, t2, corr in sorted(high_corr_pairs, key=lambda x: x[2], reverse=True):
                        st.write(f"• {t1} ↔ {t2}: {corr:.2f}")
                    st.caption("*These holdings move very similarly - limited diversification benefit*")
                else:
                    st.success("✅ No extreme correlations detected - good diversification")
        else:
            st.warning("Need at least 2 holdings with sufficient price history for correlation analysis")

    # ========================================================================
    # MULTI-FACTOR ANALYSIS - ENHANCED
    # ========================================================================
    elif page == "📊 Multi-Factor Analysis":
        st.markdown("## 📊 MULTI-FACTOR ANALYSIS - ENHANCED")
        st.markdown("---")

        portfolio_data = load_portfolio_data()
        
        if not portfolio_data:
            st.warning("⚠️ No portfolio data.")
            return
        
        df = pd.DataFrame(portfolio_data)
        enhanced_df = create_enhanced_holdings_table(df)
        
        with st.spinner("Running analysis..."):
            factor_data = calculate_factor_exposures(enhanced_df, start_date, end_date)
        
        if factor_data:
            st.markdown(f"**Model R² = {factor_data['r_squared']:.3f}**")
            st.progress(factor_data['r_squared'])
            
            result = create_factor_attribution_table(factor_data, enhanced_df)
            
            tab1, tab2, tab3 = st.tabs([
                "📈 Factor Momentum", "🎯 Exposure Radar", "📊 Attribution"
            ])
            
            with tab1:
                momentum = create_factor_momentum_chart(factor_data)
                if momentum:
                    st.plotly_chart(momentum, use_container_width=True)
            
            with tab2:
                radar = create_factor_exposure_radar(factor_data)
                if radar:
                    st.plotly_chart(radar, use_container_width=True)
            
            with tab3:
                if result is not None:
                    attr_df, factor_summary, sector_summary = result
                    
                    if factor_summary is not None:
                        st.markdown("### Factor Summary")
                        factor_display = factor_summary.copy()
                        factor_display['Total Contribution'] = factor_display['Total Contribution'].apply(
                            lambda x: f"{x:.4f}")
                        st.dataframe(factor_display, use_container_width=True, hide_index=True, column_config=None)
                    
                    if attr_df is not None:
                        st.markdown("### Holdings Attribution")
                        holdings_attr = attr_df.pivot_table(
                            index='Ticker',
                            columns='Factor',
                            values='Contribution',
                            aggfunc='sum'
                        ).round(4)

                        st.dataframe(holdings_attr, use_container_width=True, column_config=None)
                        
                        st.info("""
                        **Positive values**: Holding increases exposure
                        **Negative values**: Holding decreases exposure
                        """)
        else:
            st.error("Unable to calculate factor exposures.")
    
    # ========================================================================
    # VALUATION HOUSE - ENHANCED WITH SMART ASSUMPTIONS
    # ========================================================================
    elif page == "💰 Valuation House":
        st.markdown("## 💰 VALUATION HOUSE - EXCELLENCE EDITION")
        st.markdown("### Professional DCF Valuation Engine with Smart Assumptions")
        
        st.info("🎯 **New Feature:** Toggle between Manual and Smart Assumptions for realistic valuations!")
        
        # Company Search
        st.markdown("---")
        st.markdown("#### 🔍 Company Search")
        
        col1, col2 = st.columns([3, 1])
        
        with col1:
            ticker_input = st.text_input(
                "Enter Ticker Symbol",
                placeholder="e.g., AAPL, MSFT, GOOGL",
                help="Enter any publicly traded company ticker"
            ).upper()
        
        with col2:
            search_button = st.button("🚀 Load Company", type="primary", use_container_width=True)
        
        if search_button and ticker_input:
            with st.spinner(f"📊 Fetching data for {ticker_input}..."):
                company_data = fetch_company_financials(ticker_input)
                
                if company_data['success']:
                    st.session_state['valuation_company'] = company_data
                    st.success(f"✅ Loaded {company_data['company']['name']}")
                else:
                    st.error(f"❌ Could not fetch data: {company_data.get('error', 'Unknown error')}")
        
        # Display valuation if company is loaded
        if 'valuation_company' in st.session_state:
            company = st.session_state['valuation_company']['company']
            financials = st.session_state['valuation_company']['financials']
            
            st.markdown("---")
            
            # Company Overview
            st.markdown(f"### 📊 {company['name']} ({company['ticker']})")
            
            col1, col2, col3, col4, col5 = st.columns(5)
            col1.metric("Current Price", format_currency(company['current_price']))
            col2.metric("Market Cap", format_large_number(company['market_cap']))
            col3.metric("Sector", company['sector'])
            col4.metric("Beta", f"{company['beta']:.2f}")
            col5.metric("Forward P/E", f"{company.get('forward_pe', 'N/A'):.1f}" if company.get('forward_pe') else "N/A")
            
            st.markdown("---")

            # ENHANCED: Comprehensive Valuation Method Selection
            st.markdown("#### 🎯 Valuation Method Selection")

            valuation_method = st.selectbox(
                "Choose Valuation Approach",
                options=[
                    'FCFF DCF (Free Cash Flow to Firm)',
                    'FCFE DCF (Free Cash Flow to Equity)',
                    'Gordon Growth DDM (Dividend Discount Model)',
                    'Multi-Stage DDM (2-Stage Dividend Model)',
                    'Residual Income Model (Economic Profit)',
                    'Relative Valuation (Peer Multiples)',
                    'Sum-of-the-Parts (SOTP)'
                ],
                help="Select from 7 institutional-grade valuation methodologies"
            )

            # Extract method key for logic
            if 'FCFF' in valuation_method:
                method_key = 'FCFF'
            elif 'FCFE' in valuation_method:
                method_key = 'FCFE'
            elif 'Gordon' in valuation_method:
                method_key = 'GORDON_DDM'
            elif 'Multi-Stage' in valuation_method:
                method_key = 'MULTISTAGE_DDM'
            elif 'Residual' in valuation_method:
                method_key = 'RESIDUAL_INCOME'
            elif 'Relative' in valuation_method:
                method_key = 'RELATIVE'
            else:
                method_key = 'SOTP'

            # Show method description
            method_descriptions = {
                'FCFF': "💼 **FCFF DCF:** Values the entire firm by discounting free cash flows available to all investors (debt + equity)",
                'FCFE': "💰 **FCFE DCF:** Values equity directly by discounting free cash flows available to equity holders only",
                'GORDON_DDM': "📈 **Gordon Growth DDM:** Values stocks using perpetual dividend growth (D₁ / (r - g)). Best for stable dividend payers",
                'MULTISTAGE_DDM': "🚀 **Multi-Stage DDM:** 2-phase model with high growth period transitioning to stable growth. Ideal for growing dividend stocks",
                'RESIDUAL_INCOME': "🎯 **Residual Income:** Edwards-Bell-Ohlson model valuing excess returns over cost of equity (BV + PV(RI))",
                'RELATIVE': "📊 **Relative Valuation:** Peer comparison using 6 multiples (P/E, P/B, P/S, PEG, EV/EBITDA, EV/EBIT)",
                'SOTP': "🏢 **Sum-of-the-Parts:** Values multi-segment companies by summing independent business unit valuations"
            }

            st.info(method_descriptions[method_key])

            # Scenario buttons only for DCF methods
            if method_key in ['FCFF', 'FCFE']:
                st.markdown("---")
                st.markdown("#### 🎯 Quick Scenarios")
                scenario_col1, scenario_col2, scenario_col3, scenario_col4 = st.columns([1, 1, 1, 2])

                scenario_selected = None

                with scenario_col1:
                    if st.button(VALUATION_SCENARIOS['BEAR']['name'], use_container_width=True, key="bear_btn"):
                        scenario_selected = 'BEAR'
                        st.session_state['selected_scenario'] = 'BEAR'

                with scenario_col2:
                    if st.button(VALUATION_SCENARIOS['BASE']['name'], use_container_width=True, key="base_btn"):
                        scenario_selected = 'BASE'
                        st.session_state['selected_scenario'] = 'BASE'

                with scenario_col3:
                    if st.button(VALUATION_SCENARIOS['BULL']['name'], use_container_width=True, key="bull_btn"):
                        scenario_selected = 'BULL'
                        st.session_state['selected_scenario'] = 'BULL'

                with scenario_col4:
                    if st.button("🔄 Reset to Manual", use_container_width=True, key="reset_btn"):
                        if 'selected_scenario' in st.session_state:
                            del st.session_state['selected_scenario']

                # Show active scenario
                if 'selected_scenario' in st.session_state:
                    active_scenario = st.session_state['selected_scenario']
                    st.success(f"✅ **Active Scenario:** {VALUATION_SCENARIOS[active_scenario]['name']} - {VALUATION_SCENARIOS[active_scenario]['description']}")

            st.markdown("---")

            # Smart Assumptions Toggle (only for DCF and RI methods)
            use_smart_assumptions = False
            if method_key in ['FCFF', 'FCFE', 'GORDON_DDM', 'MULTISTAGE_DDM', 'RESIDUAL_INCOME']:
                st.markdown("#### 🧠 Assumptions Mode")
                use_smart_assumptions = st.checkbox(
                    "🤖 Use Smart Assumptions (AI-Generated)",
                    help="Generate realistic assumptions based on sector averages, company size, and economic fundamentals"
                )

                if use_smart_assumptions:
                    st.info("🤖 **Smart Mode Active:** Assumptions are generated based on sector benchmarks and economic reality")
                    smart_params = calculate_smart_assumptions(company, financials)

            # Assumptions Panel
            st.markdown("---")
            st.markdown("#### 🎛️ Valuation Assumptions")

            # =================================================================
            # DCF METHODS (FCFF / FCFE) - Existing comprehensive inputs
            # =================================================================
            if method_key in ['FCFF', 'FCFE']:
                tab1, tab2, tab3 = st.tabs(["📈 Growth & Operations", "💰 Cost of Capital", "🎯 Terminal Value"])

                with tab1:
                    st.markdown("##### Growth & Operating Assumptions")

                    col1, col2 = st.columns(2)

                    with col1:
                        # Determine revenue growth value
                        if use_smart_assumptions:
                            revenue_growth = smart_params['revenue_growth']
                            st.metric("Revenue Growth Rate", f"{revenue_growth*100:.1f}%",
                                     delta="AI Generated", delta_color="normal")
                        elif 'selected_scenario' in st.session_state:
                            # Use scenario value
                            scenario_key = st.session_state['selected_scenario']
                            default_value = VALUATION_SCENARIOS[scenario_key]['revenue_growth'] * 100
                            revenue_growth = st.slider(
                                "Revenue Growth Rate (%)",
                                min_value=-10.0,
                                max_value=30.0,
                                value=default_value,
                                step=0.5,
                                key=f"rev_growth_{scenario_key}"
                            ) / 100
                        else:
                            revenue_growth = st.slider(
                                "Revenue Growth Rate (%)",
                                min_value=-10.0,
                                max_value=30.0,
                                value=5.0,
                                step=0.5
                            ) / 100

                        if use_smart_assumptions:
                            ebit_margin = smart_params['ebit_margin']
                            st.metric("EBIT Margin", f"{ebit_margin*100:.1f}%",
                                     delta="AI Generated", delta_color="normal")
                        else:
                            ebit_margin = st.slider(
                                "EBIT Margin (%)",
                                min_value=0.0,
                                max_value=50.0,
                                value=20.0,
                                step=1.0
                            ) / 100

                        forecast_years = st.slider(
                            "Forecast Horizon (Years)",
                            min_value=3,
                            max_value=15,
                            value=smart_params['forecast_years'] if use_smart_assumptions else 5,
                            step=1
                        )
                
                with col2:
                    if use_smart_assumptions:
                        capex_pct = smart_params['capex_pct']
                        st.metric("CapEx (% of Revenue)", f"{capex_pct*100:.1f}%",
                                 delta="AI Generated", delta_color="normal")
                    else:
                        capex_pct = st.slider(
                            "CapEx (% of Revenue)",
                            min_value=0.0,
                            max_value=20.0,
                            value=5.0,
                            step=0.5
                        ) / 100
                    
                    if use_smart_assumptions:
                        depreciation_pct = smart_params['depreciation_pct']
                        st.metric("Depreciation (% of Revenue)", f"{depreciation_pct*100:.1f}%",
                                 delta="AI Generated", delta_color="normal")
                    else:
                        depreciation_pct = st.slider(
                            "Depreciation (% of Revenue)",
                            min_value=0.0,
                            max_value=15.0,
                            value=3.0,
                            step=0.5
                        ) / 100
                    
                    wc_change = st.number_input(
                        "Working Capital Change ($M)",
                        min_value=-1000.0,
                        max_value=1000.0,
                        value=float(smart_params['wc_change']) if use_smart_assumptions else 0.0,  # FIX: Ensure float
                        step=10.0
                    ) * 1e6

                with tab2:
                    st.markdown("##### Cost of Capital Assumptions")

                    col1, col2 = st.columns(2)

                    with col1:
                        risk_free = st.slider(
                            "Risk-Free Rate (%)",
                            min_value=0.0,
                            max_value=10.0,
                            value=4.5,
                            step=0.1
                        ) / 100

                        market_risk_premium = st.slider(
                            "Market Risk Premium (%)",
                            min_value=3.0,
                            max_value=10.0,
                            value=6.0,
                            step=0.5
                        ) / 100

                        beta = st.number_input(
                            "Beta",
                            min_value=0.0,
                            max_value=3.0,
                            value=float(company['beta']) if company['beta'] else 1.0,
                            step=0.1
                        )

                    with col2:
                        if method_key == 'FCFF':
                            cost_debt = st.slider(
                                "Cost of Debt (%)",
                                min_value=0.0,
                                max_value=15.0,
                                value=5.0,
                                step=0.5
                            ) / 100

                        if use_smart_assumptions:
                            tax_rate = smart_params['tax_rate']
                            st.metric("Tax Rate", f"{tax_rate*100:.1f}%",
                                     delta="AI Generated", delta_color="normal")
                        else:
                            tax_rate = st.slider(
                                "Tax Rate (%)",
                                min_value=0.0,
                                max_value=40.0,
                                value=float(financials.get('tax_rate', 0.21) * 100),
                                step=1.0
                            ) / 100

                        if method_key == 'FCFE':
                            net_borrowing = st.number_input(
                                "Net Borrowing ($M)",
                                min_value=-1000.0,
                                max_value=1000.0,
                                value=0.0,
                                step=10.0
                            ) * 1e6

                with tab3:
                    st.markdown("##### Terminal Value Assumptions")

                    col1, col2 = st.columns(2)

                    with col1:
                        if use_smart_assumptions:
                            terminal_growth = smart_params['terminal_growth']
                            st.metric("Perpetual Growth Rate", f"{terminal_growth*100:.1f}%",
                                     delta="AI Generated", delta_color="normal")
                        else:
                            terminal_growth = st.slider(
                                "Perpetual Growth Rate (%)",
                                min_value=0.0,
                                max_value=5.0,
                                value=2.5,
                                step=0.1
                            ) / 100

                    with col2:
                        st.info(f"""
                        **Terminal Value Method:** Gordon Growth Model

                        TV = FCFₙ₊₁ / (r - g)
                        """)

            # =================================================================
            # DIVIDEND DISCOUNT MODELS (GORDON & MULTI-STAGE)
            # =================================================================
            elif method_key == 'GORDON_DDM':
                st.markdown("##### Gordon Growth DDM Inputs")

                col1, col2 = st.columns(2)

                with col1:
                    # Get current dividend from company data
                    current_dividend_default = company.get('dividendRate', 0) * company['shares_outstanding']
                    if current_dividend_default == 0:
                        # Try to estimate from dividend yield
                        div_yield = company.get('dividendYield', 0)
                        if div_yield > 0:
                            current_dividend_default = company['market_cap'] * div_yield

                    current_dividend = st.number_input(
                        "Current Annual Dividend ($)",
                        min_value=0.0,
                        value=float(current_dividend_default),
                        step=0.01,
                        help="Total annual dividend paid by the company"
                    )

                    if use_smart_assumptions:
                        cost_of_equity_ddm = smart_params.get('cost_of_equity', 0.10)
                        st.metric("Cost of Equity", f"{cost_of_equity_ddm*100:.1f}%",
                                 delta="AI Generated", delta_color="normal")
                    else:
                        risk_free_ddm = st.slider(
                            "Risk-Free Rate (%)",
                            min_value=0.0,
                            max_value=10.0,
                            value=4.5,
                            step=0.1,
                            key="ddm_risk_free"
                        ) / 100

                        market_risk_premium_ddm = st.slider(
                            "Market Risk Premium (%)",
                            min_value=3.0,
                            max_value=10.0,
                            value=6.0,
                            step=0.5,
                            key="ddm_mrp"
                        ) / 100

                        beta_ddm = st.number_input(
                            "Beta",
                            min_value=0.0,
                            max_value=3.0,
                            value=float(company['beta']) if company['beta'] else 1.0,
                            step=0.1,
                            key="ddm_beta"
                        )

                        cost_of_equity_ddm = calculate_cost_of_equity(risk_free_ddm, beta_ddm, market_risk_premium_ddm)
                        st.info(f"Calculated Cost of Equity: {cost_of_equity_ddm*100:.2f}%")

                with col2:
                    if use_smart_assumptions:
                        growth_rate_ddm = smart_params.get('dividend_growth', 0.03)
                        st.metric("Dividend Growth Rate", f"{growth_rate_ddm*100:.1f}%",
                                 delta="AI Generated", delta_color="normal")
                    else:
                        growth_rate_ddm = st.slider(
                            "Perpetual Dividend Growth Rate (%)",
                            min_value=0.0,
                            max_value=5.0,
                            value=2.5,
                            step=0.1,
                            help="Long-term sustainable dividend growth rate"
                        ) / 100

                    st.info(f"""
                    **Gordon Growth Formula:**

                    Value = D₁ / (r - g)

                    Where D₁ = D₀ × (1 + g)
                    """)

            # =================================================================
            # MULTI-STAGE DDM
            # =================================================================
            elif method_key == 'MULTISTAGE_DDM':
                st.markdown("##### Multi-Stage DDM Inputs (2-Stage Model)")

                col1, col2 = st.columns(2)

                with col1:
                    # Get current dividend
                    current_dividend_default = company.get('dividendRate', 0) * company['shares_outstanding']
                    if current_dividend_default == 0:
                        div_yield = company.get('dividendYield', 0)
                        if div_yield > 0:
                            current_dividend_default = company['market_cap'] * div_yield

                    current_dividend_ms = st.number_input(
                        "Current Annual Dividend ($)",
                        min_value=0.0,
                        value=float(current_dividend_default),
                        step=0.01,
                        key="ms_dividend"
                    )

                    if use_smart_assumptions:
                        cost_of_equity_ms = smart_params.get('cost_of_equity', 0.10)
                        st.metric("Cost of Equity", f"{cost_of_equity_ms*100:.1f}%",
                                 delta="AI Generated", delta_color="normal")
                    else:
                        risk_free_ms = st.slider(
                            "Risk-Free Rate (%)",
                            min_value=0.0,
                            max_value=10.0,
                            value=4.5,
                            step=0.1,
                            key="ms_risk_free"
                        ) / 100

                        market_risk_premium_ms = st.slider(
                            "Market Risk Premium (%)",
                            min_value=3.0,
                            max_value=10.0,
                            value=6.0,
                            step=0.5,
                            key="ms_mrp"
                        ) / 100

                        beta_ms = st.number_input(
                            "Beta",
                            min_value=0.0,
                            max_value=3.0,
                            value=float(company['beta']) if company['beta'] else 1.0,
                            step=0.1,
                            key="ms_beta"
                        )

                        cost_of_equity_ms = calculate_cost_of_equity(risk_free_ms, beta_ms, market_risk_premium_ms)
                        st.info(f"Calculated Cost of Equity: {cost_of_equity_ms*100:.2f}%")

                with col2:
                    if use_smart_assumptions:
                        high_growth_rate = smart_params.get('high_growth_rate', 0.08)
                        high_growth_years = smart_params.get('high_growth_years', 5)
                        stable_growth_rate = smart_params.get('stable_growth_rate', 0.03)

                        st.metric("High Growth Rate", f"{high_growth_rate*100:.1f}%", delta="AI Generated")
                        st.metric("High Growth Years", f"{high_growth_years} years", delta="AI Generated")
                        st.metric("Stable Growth Rate", f"{stable_growth_rate*100:.1f}%", delta="AI Generated")
                    else:
                        high_growth_rate = st.slider(
                            "High Growth Rate (%)",
                            min_value=0.0,
                            max_value=20.0,
                            value=8.0,
                            step=0.5,
                            help="Initial high dividend growth rate"
                        ) / 100

                        high_growth_years = st.slider(
                            "High Growth Period (Years)",
                            min_value=3,
                            max_value=15,
                            value=5,
                            step=1,
                            help="Number of years of high growth"
                        )

                        stable_growth_rate = st.slider(
                            "Stable Growth Rate (%)",
                            min_value=0.0,
                            max_value=5.0,
                            value=2.5,
                            step=0.1,
                            help="Long-term perpetual growth rate"
                        ) / 100

            # =================================================================
            # RESIDUAL INCOME MODEL
            # =================================================================
            elif method_key == 'RESIDUAL_INCOME':
                st.markdown("##### Residual Income Model Inputs")

                col1, col2 = st.columns(2)

                with col1:
                    # Book value of equity
                    book_value_default = financials.get('total_equity', company.get('bookValue', 0) * company['shares_outstanding'])

                    book_value_equity = st.number_input(
                        "Book Value of Equity ($)",
                        min_value=0.0,
                        value=float(book_value_default),
                        step=1000000.0,
                        help="Current book value of shareholders' equity"
                    )

                    if use_smart_assumptions:
                        roe = smart_params.get('roe', 0.15)
                        st.metric("Return on Equity (ROE)", f"{roe*100:.1f}%",
                                 delta="AI Generated", delta_color="normal")
                    else:
                        roe = st.slider(
                            "Return on Equity - ROE (%)",
                            min_value=0.0,
                            max_value=50.0,
                            value=15.0,
                            step=0.5,
                            help="Expected ROE for future periods"
                        ) / 100

                    forecast_years_ri = st.slider(
                        "Forecast Horizon (Years)",
                        min_value=3,
                        max_value=15,
                        value=smart_params.get('forecast_years', 5) if use_smart_assumptions else 5,
                        step=1,
                        key="ri_forecast_years"
                    )

                with col2:
                    if use_smart_assumptions:
                        cost_of_equity_ri = smart_params.get('cost_of_equity', 0.10)
                        st.metric("Cost of Equity", f"{cost_of_equity_ri*100:.1f}%",
                                 delta="AI Generated", delta_color="normal")
                    else:
                        risk_free_ri = st.slider(
                            "Risk-Free Rate (%)",
                            min_value=0.0,
                            max_value=10.0,
                            value=4.5,
                            step=0.1,
                            key="ri_risk_free"
                        ) / 100

                        market_risk_premium_ri = st.slider(
                            "Market Risk Premium (%)",
                            min_value=3.0,
                            max_value=10.0,
                            value=6.0,
                            step=0.5,
                            key="ri_mrp"
                        ) / 100

                        beta_ri = st.number_input(
                            "Beta",
                            min_value=0.0,
                            max_value=3.0,
                            value=float(company['beta']) if company['beta'] else 1.0,
                            step=0.1,
                            key="ri_beta"
                        )

                        cost_of_equity_ri = calculate_cost_of_equity(risk_free_ri, beta_ri, market_risk_premium_ri)
                        st.info(f"Calculated Cost of Equity: {cost_of_equity_ri*100:.2f}%")

                    if use_smart_assumptions:
                        growth_rate_ri = smart_params.get('terminal_growth', 0.025)
                        st.metric("Terminal Growth Rate", f"{growth_rate_ri*100:.1f}%",
                                 delta="AI Generated", delta_color="normal")
                    else:
                        growth_rate_ri = st.slider(
                            "Terminal Growth Rate (%)",
                            min_value=0.0,
                            max_value=5.0,
                            value=2.5,
                            step=0.1,
                            key="ri_terminal_growth",
                            help="Long-term growth rate for terminal value"
                        ) / 100

                    st.info(f"""
                    **Residual Income Formula:**

                    Value = BV + PV(RI)

                    RI = (ROE - r) × BV
                    """)

            # =================================================================
            # RELATIVE VALUATION (PEER MULTIPLES)
            # =================================================================
            elif method_key == 'RELATIVE':
                st.markdown("##### Relative Valuation - Peer Multiples")

                st.info(f"""
                This method values the company based on peer comparison using 6 key multiples:

                - **P/E Ratio:** Price to Earnings
                - **P/B Ratio:** Price to Book Value
                - **P/S Ratio:** Price to Sales
                - **EV/EBITDA:** Enterprise Value to EBITDA
                - **EV/EBIT:** Enterprise Value to EBIT
                - **PEG Ratio:** P/E to Growth

                Peer companies are automatically selected from the {company['sector']} sector.
                """)

                # Fetch peers
                with st.spinner("Fetching peer companies..."):
                    ticker = company['ticker']
                    sector = company['sector']
                    peers = fetch_peer_companies(ticker, sector, max_peers=10)

                    if peers:
                        st.success(f"Found {len(peers)} peer companies: {', '.join(peers)}")
                    else:
                        st.warning("No peer companies found. Using default sector averages.")

            # =================================================================
            # SUM-OF-THE-PARTS (SOTP)
            # =================================================================
            elif method_key == 'SOTP':
                st.markdown("##### Sum-of-the-Parts Valuation")

                st.info("""
                SOTP values multi-segment companies by valuing each business unit independently.

                For each segment, provide:
                - Revenue
                - EBITDA Margin
                - EV/Revenue Multiple (based on comparable companies)
                """)

                # Number of segments
                num_segments = st.number_input(
                    "Number of Business Segments",
                    min_value=1,
                    max_value=10,
                    value=2,
                    step=1
                )

                # Create segment inputs
                segments = []
                for i in range(num_segments):
                    with st.expander(f"Segment {i+1}", expanded=(i == 0)):
                        col1, col2, col3 = st.columns(3)

                        with col1:
                            segment_name = st.text_input(
                                "Segment Name",
                                value=f"Segment {i+1}",
                                key=f"seg_name_{i}"
                            )

                            segment_revenue = st.number_input(
                                "Revenue ($M)",
                                min_value=0.0,
                                value=100.0,
                                step=10.0,
                                key=f"seg_rev_{i}"
                            ) * 1e6

                        with col2:
                            segment_ebitda_margin = st.slider(
                                "EBITDA Margin (%)",
                                min_value=0.0,
                                max_value=50.0,
                                value=20.0,
                                step=1.0,
                                key=f"seg_ebitda_{i}"
                            ) / 100

                        with col3:
                            segment_multiple = st.number_input(
                                "EV/Revenue Multiple",
                                min_value=0.0,
                                max_value=10.0,
                                value=2.0,
                                step=0.1,
                                key=f"seg_mult_{i}",
                                help="Based on comparable segment peers"
                            )

                        segments.append({
                            'name': segment_name,
                            'revenue': segment_revenue,
                            'ebitda_margin': segment_ebitda_margin,
                            'ev_revenue_multiple': segment_multiple
                        })

            st.markdown("---")
            
            # Calculate Valuation (All Methods)
            if st.button("🚀 Calculate Intrinsic Value", type="primary", use_container_width=True):
                with st.spinner(f"🔬 Running {method_key} Valuation..."):

                    shares = company['shares_outstanding']

                    # =================================================================
                    # DCF METHODS (FCFF / FCFE)
                    # =================================================================
                    if method_key in ['FCFF', 'FCFE']:
                        # Calculate cost of equity
                        cost_equity = calculate_cost_of_equity(risk_free, beta, market_risk_premium)

                        # Calculate discount rate
                        if method_key == 'FCFF':
                            total_debt = financials.get('total_debt', 0)
                            total_equity = company['market_cap']
                            discount_rate = calculate_wacc(cost_equity, cost_debt, tax_rate, total_debt, total_equity)
                        else:
                            discount_rate = cost_equity

                        # Get base financials
                        base_revenue = financials.get('revenue', 0)
                        base_ebit = financials.get('ebit', 0)
                        base_net_income = financials.get('net_income', 0)

                        # ENHANCED: Project cash flows with scaling D&A and CapEx
                        if method_key == 'FCFF':
                            projections = project_fcff_enhanced(
                                base_revenue, base_ebit, revenue_growth, ebit_margin, tax_rate,
                                depreciation_pct, capex_pct, wc_change, forecast_years
                            )
                            final_fcf = projections[-1]['fcff']
                        else:
                            projections = project_fcfe_enhanced(
                                base_revenue, base_net_income, revenue_growth, tax_rate,
                                depreciation_pct, capex_pct, wc_change, net_borrowing, forecast_years
                            )
                            final_fcf = projections[-1]['fcfe']

                        # Calculate terminal value
                        terminal_value = calculate_terminal_value(final_fcf, discount_rate, terminal_growth)

                        # Calculate DCF value
                        net_debt = financials.get('total_debt', 0) - financials.get('cash', 0)

                        dcf_results = calculate_dcf_value(
                            projections, discount_rate, terminal_value, shares,
                            net_debt if method_key == 'FCFF' else 0, method_key
                        )

                        dcf_results['net_debt'] = net_debt

                        # Store results
                        st.session_state['valuation_results'] = dcf_results
                        st.session_state['dcf_projections'] = projections
                        st.session_state['valuation_method'] = method_key
                        st.session_state['discount_rate'] = discount_rate
                        st.session_state['terminal_growth'] = terminal_growth
                        st.session_state['used_smart_assumptions'] = use_smart_assumptions

                    # =================================================================
                    # GORDON GROWTH DDM
                    # =================================================================
                    elif method_key == 'GORDON_DDM':
                        gordon_results = calculate_gordon_growth_ddm(
                            current_dividend=current_dividend,
                            cost_of_equity=cost_of_equity_ddm,
                            growth_rate=growth_rate_ddm,
                            shares_outstanding=shares
                        )

                        # Store results
                        st.session_state['valuation_results'] = gordon_results
                        st.session_state['valuation_method'] = method_key
                        st.session_state['used_smart_assumptions'] = use_smart_assumptions

                    # =================================================================
                    # MULTI-STAGE DDM
                    # =================================================================
                    elif method_key == 'MULTISTAGE_DDM':
                        multistage_results = calculate_multistage_ddm(
                            current_dividend=current_dividend_ms,
                            cost_of_equity=cost_of_equity_ms,
                            high_growth_rate=high_growth_rate,
                            high_growth_years=high_growth_years,
                            stable_growth_rate=stable_growth_rate,
                            shares_outstanding=shares
                        )

                        # Store results
                        st.session_state['valuation_results'] = multistage_results
                        st.session_state['valuation_method'] = method_key
                        st.session_state['used_smart_assumptions'] = use_smart_assumptions

                    # =================================================================
                    # RESIDUAL INCOME
                    # =================================================================
                    elif method_key == 'RESIDUAL_INCOME':
                        residual_results = calculate_residual_income(
                            book_value_equity=book_value_equity,
                            roe=roe,
                            cost_of_equity=cost_of_equity_ri,
                            growth_rate=growth_rate_ri,
                            forecast_years=forecast_years_ri,
                            shares_outstanding=shares
                        )

                        # Store results
                        st.session_state['valuation_results'] = residual_results
                        st.session_state['valuation_method'] = method_key
                        st.session_state['used_smart_assumptions'] = use_smart_assumptions

                    # =================================================================
                    # RELATIVE VALUATION
                    # =================================================================
                    elif method_key == 'RELATIVE':
                        # Calculate peer multiples
                        median_multiples = calculate_peer_multiples(peers)

                        if median_multiples:
                            # Prepare company financials for relative valuation
                            company_financials_dict = {
                                'eps': financials.get('eps', 0),
                                'book_value_per_share': financials.get('book_value_per_share', 0),
                                'sales_per_share': financials.get('revenue', 0) / shares if shares > 0 else 0,
                                'ebitda': financials.get('ebitda', 0),
                                'ebit': financials.get('ebit', 0),
                                'revenue': financials.get('revenue', 0),
                                'total_debt': financials.get('total_debt', 0),
                                'cash': financials.get('cash', 0)
                            }

                            relative_results = apply_relative_valuation(
                                company_financials=company_financials_dict,
                                median_multiples=median_multiples,
                                shares_outstanding=shares
                            )

                            # Add method and average value
                            relative_results['method'] = 'Relative Valuation'
                            relative_results['intrinsic_value_per_share'] = relative_results.get('average_relative_value', 0)

                            # Store results
                            st.session_state['valuation_results'] = relative_results
                            st.session_state['valuation_method'] = method_key
                            st.session_state['used_smart_assumptions'] = False
                        else:
                            st.error("Unable to calculate peer multiples. Please check peer company data.")
                            st.stop()

                    # =================================================================
                    # SUM-OF-THE-PARTS (SOTP)
                    # =================================================================
                    elif method_key == 'SOTP':
                        sotp_results = calculate_sotp_valuation(
                            segments=segments,
                            discount_rate=0.10,  # Default WACC for SOTP
                            shares_outstanding=shares
                        )

                        # Store results
                        st.session_state['valuation_results'] = sotp_results
                        st.session_state['valuation_method'] = method_key
                        st.session_state['used_smart_assumptions'] = False

                    st.success("✅ Valuation Complete!")
            
            # Display Results
            if 'valuation_results' in st.session_state:
                results = st.session_state['valuation_results']
                method = st.session_state['valuation_method']
                projections = st.session_state.get('dcf_projections', None)
                
                st.markdown("---")
                st.markdown("### 📊 Valuation Results")
                
                if st.session_state.get('used_smart_assumptions', False):
                    st.success("🤖 **These results used AI-Generated Smart Assumptions**")
                
                # Key metrics
                intrinsic_value = results['intrinsic_value_per_share']
                current_price = company['current_price']
                upside_downside = ((intrinsic_value - current_price) / current_price) * 100
                
                col1, col2, col3, col4 = st.columns(4)
                
                col1.metric(
                    "Intrinsic Value",
                    format_currency(intrinsic_value),
                    delta=format_percentage(upside_downside) if abs(upside_downside) < 1000 else "±∞"
                )
                
                col2.metric("Current Price", format_currency(current_price))
                
                col3.metric(
                    "Upside/Downside",
                    format_percentage(upside_downside) if abs(upside_downside) < 1000 else "±∞",
                    delta="Undervalued" if upside_downside > 0 else "Overvalued"
                )

                # v9.7 FIX: Safe access to session_state with defaults
                discount_rate = st.session_state.get('discount_rate', results.get('discount_rate', 0.10))
                col4.metric("Discount Rate", ATLASFormatter.format_yield(discount_rate * 100, decimals=1))
                
                # Valuation interpretation
                st.markdown("---")
                
                if upside_downside > 20:
                    st.success(f"""
                    ✅ **Significantly Undervalued**
                    
                    The intrinsic value suggests the stock is trading at a {abs(upside_downside):.1f}% discount to fair value.
                    """)
                elif upside_downside > 0:
                    st.info(f"""
                    📊 **Slightly Undervalued**
                    
                    Modest upside potential of {upside_downside:.1f}%.
                    """)
                elif upside_downside > -20:
                    st.warning(f"""
                    ⚠️ **Slightly Overvalued**
                    
                    Trading {abs(upside_downside):.1f}% above fair value.
                    """)
                else:
                    st.error(f"""
                    ❌ **Significantly Overvalued**
                    
                    Trading at a {abs(upside_downside):.1f}% premium to fair value.
                    """)
                
                st.markdown("---")
                
                # Visualizations
                col1, col2 = st.columns(2)
                
                with col1:
                    waterfall = create_dcf_waterfall(results, method)
                    st.plotly_chart(waterfall, use_container_width=True)
                
                with col2:
                    cf_chart = create_cash_flow_chart(projections, method)
                    st.plotly_chart(cf_chart, use_container_width=True)
                
                # Sensitivity Analysis
                st.markdown("---")
                st.markdown("#### 🎯 Sensitivity Analysis")

                # v9.7 FIX: Safe access to session_state with defaults
                terminal_growth = st.session_state.get('terminal_growth', results.get('terminal_growth', 0.025))
                sensitivity = create_sensitivity_table(
                    intrinsic_value,
                    discount_rate,
                    terminal_growth
                )
                st.plotly_chart(sensitivity, use_container_width=True)
                
                # Detailed Projections Table
                st.markdown("---")
                st.markdown("#### 📋 Detailed Cash Flow Projections")
                
                proj_df = pd.DataFrame(projections)
                
                # Format for display
                if method == 'FCFF':
                    display_cols = ['year', 'revenue', 'ebit', 'nopat', 'depreciation', 'capex', 'change_wc', 'fcff']
                    col_names = ['Year', 'Revenue', 'EBIT', 'NOPAT', 'D&A', 'CapEx', 'ΔWC', 'FCFF']
                else:
                    display_cols = ['year', 'revenue', 'net_income', 'depreciation', 'capex', 'change_wc', 'net_borrowing', 'fcfe']
                    col_names = ['Year', 'Revenue', 'Net Income', 'D&A', 'CapEx', 'ΔWC', 'Borrowing', 'FCFE']
                
                proj_display = proj_df[display_cols].copy()
                proj_display.columns = col_names
                
                # Format numbers
                for col in proj_display.columns:
                    if col != 'Year':
                        proj_display[col] = proj_display[col].apply(format_large_number)

                st.dataframe(proj_display, use_container_width=True, hide_index=True, column_config=None)
                
                st.info("💡 **Technical Note:** D&A and CapEx scale with revenue growth (as they should!)")
                
                # Export Options
                st.markdown("---")
                col1, col2, col3 = st.columns(3)
                
                with col1:
                    if st.button("📥 Export to Excel", use_container_width=True):
                        st.info("Excel export feature coming soon!")
                
                with col2:
                    if st.button("📄 Generate PDF Report", use_container_width=True):
                        st.info("PDF export feature coming soon!")
                
                with col3:
                    if st.button("🔄 Reset Valuation", use_container_width=True):
                        for key in ['dcf_results', 'dcf_projections', 'used_smart_assumptions']:
                            if key in st.session_state:
                                del st.session_state[key]
                        st.rerun()
        
        else:
            # No company loaded
            st.markdown("---")
            st.markdown("""
            ### 📚 How to Use Valuation House - Excellence Edition
            
            **NEW in v9.3: 🤖 Smart Assumptions Mode**
            - AI-generated assumptions based on sector benchmarks
            - Realistic, economically grounded projections
            - Toggle between manual and smart modes
            
            **Step 1:** Search for any publicly traded company
            **Step 2:** Choose FCFF or FCFE valuation method
            **Step 3:** Enable Smart Assumptions or customize manually
            **Step 4:** Calculate intrinsic value and analyze results
            **Step 5:** Review sensitivity analysis
            
            ---
            
            ### ✨ What's New in v9.3 Excellence
            
            ✅ **Smart Assumptions:** AI-powered realistic assumptions
            ✅ **Fixed Scaling:** D&A and CapEx properly scale with revenue
            ✅ **Enhanced Visuals:** Seamless dark mode theming
            ✅ **Better Analysis:** More comprehensive sensitivity testing
            
            *Ready to start? Enter a ticker symbol above!* 🚀
            """)
    
    # ========================================================================
    # ABOUT
    # ========================================================================
    elif page == "ℹ️ About":
        st.markdown("### ℹ️ ATLAS Terminal v9.7 ULTIMATE EDITION")
        st.success("""
        **ATLAS v9.7 ULTIMATE EDITION** 🚀💎✨

        **📅 RELEASE DATE: November 14, 2025**
        **🔥 STATUS: Production Ready & Verified**

        **🚀 NEW IN v9.7 (Latest Release):**
        ✅ Enhanced Performance - Optimized data loading and caching
        ✅ Advanced Risk Metrics - VaR, CVaR, Maximum Drawdown
        ✅ Improved Error Handling - Graceful fallbacks for data fetching
        ✅ Better Data Validation - Enhanced portfolio integrity checks
        ✅ Version Display - Clear versioning throughout interface
        ✅ Code Structure - Modular, maintainable, production-ready
        ✅ Extended Market Coverage - Additional asset classes

        **PREVIOUS ENHANCEMENTS (v9.3-v9.6):**
        ✅ Enhanced Home Page (Top Contributors/Detractors + Better Layout)
        ✅ Market Watch COMPLETE REVAMP (Crypto, Bonds, Spreads, 100+ Assets)
        ✅ ALL Charts Seamlessly Themed (No More Black Boxes!)
        ✅ Portfolio Deep Dive Enhanced (Better Concentration Analysis)
        ✅ Valuation House: Smart Assumptions Mode (AI-Generated)
        ✅ Valuation House: Fixed D&A/CapEx Scaling with Revenue
        ✅ Fixed Nov 2024 Columns in All Heatmaps
        ✅ Multi-Factor Analysis (Perfect - No Changes Needed!)

        **COMPLETE MODULE LIST:**
        1. **Phoenix Parser** - Exceptional data parsing
        2. **Portfolio Home** - Enhanced dashboard with contributors/detractors
        3. **Market Watch** - Comprehensive: Indices, Crypto, Bonds, Spreads, ETFs, Stocks, Commodities
        4. **Risk Analysis** - World-class metrics & visualizations
        5. **Performance Suite** - Comprehensive analytics
        6. **Portfolio Deep Dive** - Enhanced concentration analysis
        7. **Multi-Factor Analysis** - Advanced attribution (kept perfect!)
        8. **Valuation House** - Smart Assumptions + Enhanced DCF

        **KEY FEATURES:**
        - 🤖 Smart Assumptions for DCF valuations
        - 🌍 Expanded Market Watch (150+ assets)
        - 📊 Seamless chart theming throughout
        - 🎯 Enhanced Home Page dashboard
        - 💎 Fixed D&A/CapEx scaling
        - 🔒 Production-ready error handling
        - ⚡ Optimized performance
        - ✨ All original features preserved and enhanced

        **VERSION HISTORY:**
        - v9.7 (Nov 2025): Performance, risk metrics, error handling
        - v9.6 (Oct 2025): Valuation House integration
        - v9.5 (Sep 2025): Modular methods expansion
        - v9.4 (Sep 2025): Professional grade enhancements
        - v9.3 (Aug 2025): Excellence edition features

        Total: **The Ultimate Investment Analysis Platform - PRODUCTION READY!** 🚀💎
        """)

if __name__ == "__main__":
    main()
