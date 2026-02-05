"""
ATLAS Terminal - About Page
Extracted from atlas_app.py for modular page-level editing.
"""
import pandas as pd
import streamlit as st

from app.config import COLORS
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator


def render_about():
    """Render the About page."""
    # Lazy imports to avoid circular dependency with atlas_app
    from core import *
    from ui.components import ATLAS_TEMPLATE

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

    # SYSTEM NOTIFICATIONS DEMO
    # ============================================================
    st.divider()
    st.subheader("🧪 System Notifications Demo")

