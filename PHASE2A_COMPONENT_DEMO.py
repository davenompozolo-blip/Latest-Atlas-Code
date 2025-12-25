"""
ATLAS TERMINAL - PHASE 2A COMPONENT SHOWCASE
Demonstration of all Fomo-inspired components

Run with: streamlit run PHASE2A_COMPONENT_DEMO.py

Components Demonstrated:
1. Badge Pills (badges.py)
2. Enhanced Tables (tables_enhanced.py)
3. Chart Theme (charts_theme.py)

Created: December 2024
Phase: 2A Component Transformation
"""

import streamlit as st
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# Import Phase 2A components
from ui.components import (
    # Badges
    badge, render_badge, badge_group,
    # Tables
    atlas_table, atlas_table_with_badges,
    # Charts
    create_line_chart, create_bar_chart,
    create_performance_chart, create_heatmap,
    ATLAS_TEMPLATE, ATLAS_COLORS
)

# ==================== PAGE CONFIG ====================
st.set_page_config(
    page_title="ATLAS - Phase 2A Component Showcase",
    page_icon="🎨",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ==================== SAMPLE DATA ====================
np.random.seed(42)

# Portfolio holdings data
holdings_data = pd.DataFrame({
    'Ticker': ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'BRK.B'],
    'Asset Name': ['Apple Inc.', 'Alphabet Inc.', 'Microsoft Corp.', 'Amazon.com Inc.',
                   'Tesla Inc.', 'Meta Platforms', 'NVIDIA Corp.', 'Berkshire Hathaway'],
    'Shares': [100, 50, 75, 30, 25, 40, 20, 15],
    'Price': [185.50, 142.30, 378.90, 151.20, 242.50, 487.30, 495.20, 358.40],
    'Return %': [15.2, -3.4, 8.7, -1.2, 22.5, 12.3, 35.8, 5.6],
    'Weight %': [22.5, 15.3, 18.7, 12.1, 8.9, 11.2, 11.3, 10.0],
    'Action': ['HOLD', 'SELL', 'BUY', 'HOLD', 'BUY', 'HOLD', 'BUY', 'HOLD'],
    'Sector': ['Technology', 'Technology', 'Technology', 'Consumer', 'Automotive', 'Technology', 'Technology', 'Financial']
})

# Time series data
dates = pd.date_range(end=datetime.now(), periods=100, freq='D')
portfolio_returns = np.cumsum(np.random.randn(100) * 0.8) + 50
benchmark_returns = np.cumsum(np.random.randn(100) * 0.5) + 50

time_series_df = pd.DataFrame({
    'Date': dates,
    'Portfolio': portfolio_returns,
    'Benchmark': benchmark_returns
})

# ==================== HEADER ====================
st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@900&display=swap');
    </style>
    <h1 style='
        font-family: "Orbitron", monospace;
        font-size: 2.5rem;
        text-align: center;
        color: transparent;
        -webkit-text-stroke: 2px #00d4ff;
        text-shadow:
            0 0 10px #00d4ff,
            0 0 20px #00d4ff,
            0 0 30px #00d4ff,
            0 0 40px #6366f1,
            0 0 70px #8b5cf6;
        filter: brightness(1.2);
        margin-bottom: 0.5rem;
    '>PHASE 2A COMPONENT SHOWCASE</h1>
    <p style='text-align: center; color: #94a3b8; font-size: 1rem; margin-bottom: 2rem;'>
        Fomo-Inspired Glassmorphic Design System
    </p>
""", unsafe_allow_html=True)

st.markdown("---")

# ==================== SIDEBAR NAVIGATION ====================
with st.sidebar:
    st.markdown("""
        <h3 style='
            background: linear-gradient(135deg, #00d4ff 0%, #6366f1 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 1rem;
        '>Component Navigation</h3>
    """, unsafe_allow_html=True)

    demo_section = st.radio(
        "Select Demo:",
        ["Overview", "Badge Pills", "Enhanced Tables", "Chart Theme", "Integration Example"],
        label_visibility="collapsed"
    )

# ==================== OVERVIEW SECTION ====================
if demo_section == "Overview":
    st.header("🎨 Phase 2A Components Overview")

    col1, col2, col3 = st.columns(3)

    with col1:
        st.markdown("""
            <div style='
                background: rgba(21, 25, 50, 0.6);
                backdrop-filter: blur(20px);
                border-radius: 16px;
                border: 1px solid rgba(99, 102, 241, 0.15);
                padding: 1.5rem;
                height: 200px;
            '>
                <h3 style='color: #00d4ff; margin: 0 0 1rem 0;'>🏷️ Badge Pills</h3>
                <p style='color: #94a3b8; font-size: 0.875rem;'>
                    Glassmorphic badge components with 7 types, 4 sizes, icons, and glow effects.
                </p>
            </div>
        """, unsafe_allow_html=True)

    with col2:
        st.markdown("""
            <div style='
                background: rgba(21, 25, 50, 0.6);
                backdrop-filter: blur(20px);
                border-radius: 16px;
                border: 1px solid rgba(99, 102, 241, 0.15);
                padding: 1.5rem;
                height: 200px;
            '>
                <h3 style='color: #6366f1; margin: 0 0 1rem 0;'>📊 Enhanced Tables</h3>
                <p style='color: #94a3b8; font-size: 0.875rem;'>
                    Premium data tables with hover effects, gradient scrollbars, and badge integration.
                </p>
            </div>
        """, unsafe_allow_html=True)

    with col3:
        st.markdown("""
            <div style='
                background: rgba(21, 25, 50, 0.6);
                backdrop-filter: blur(20px);
                border-radius: 16px;
                border: 1px solid rgba(99, 102, 241, 0.15);
                padding: 1.5rem;
                height: 200px;
            '>
                <h3 style='color: #8b5cf6; margin: 0 0 1rem 0;'>📈 Chart Theme</h3>
                <p style='color: #94a3b8; font-size: 0.875rem;'>
                    Custom Plotly templates with neon glow effects and dark glassmorphic backgrounds.
                </p>
            </div>
        """, unsafe_allow_html=True)

    st.markdown("---")

    st.subheader("📋 Component Status")

    status_df = pd.DataFrame({
        'Component': ['Badge Pills', 'Enhanced Tables', 'Chart Theme'],
        'File': ['badges.py', 'tables_enhanced.py', 'charts_theme.py'],
        'Status': ['✅ Complete', '✅ Complete', '✅ Complete'],
        'Functions': [3, 2, 5],
        'Lines': [312, 342, 428]
    })

    atlas_table(status_df, title="Phase 2A Components", subtitle="All components ready for integration")

# ==================== BADGE PILLS DEMO ====================
elif demo_section == "Badge Pills":
    st.header("🏷️ Badge Pills Demo")

    st.subheader("Badge Types")
    col1, col2 = st.columns(2)

    with col1:
        st.markdown("**All Badge Types:**")
        render_badge("Primary", "primary", "md")
        st.write("")
        render_badge("Secondary", "secondary", "md")
        st.write("")
        render_badge("Success", "success", "md", "✓")
        st.write("")
        render_badge("Warning", "warning", "md", "⚠️")

    with col2:
        st.markdown("**With Glow Effects:**")
        render_badge("Danger", "danger", "md", glow=True)
        st.write("")
        render_badge("Info", "info", "md", glow=True)
        st.write("")
        render_badge("Neutral", "neutral", "md")

    st.markdown("---")

    st.subheader("Badge Groups (Real-World Examples)")

    st.markdown("**Portfolio Position:**")
    badge_group([
        {'text': 'AAPL', 'type': 'primary', 'size': 'md'},
        {'text': '+15.2%', 'type': 'success', 'size': 'sm', 'icon': '↑'},
        {'text': 'Technology', 'type': 'info', 'size': 'sm'},
        {'text': '22.5% Weight', 'type': 'neutral', 'size': 'sm'},
    ])

    st.write("")
    st.markdown("**Trading Signal:**")
    badge_group([
        {'text': 'STRONG BUY', 'type': 'success', 'size': 'lg', 'icon': '▲', 'glow': True},
        {'text': '95% Confidence', 'type': 'primary', 'size': 'sm'},
        {'text': 'AI Signal', 'type': 'secondary', 'size': 'sm'},
    ])

# ==================== ENHANCED TABLES DEMO ====================
elif demo_section == "Enhanced Tables":
    st.header("📊 Enhanced Tables Demo")

    st.subheader("Basic Glassmorphic Table")
    atlas_table(
        holdings_data[['Ticker', 'Asset Name', 'Price', 'Return %', 'Weight %']],
        title="Portfolio Holdings",
        subtitle="Top 8 positions by weight",
        hoverable=True
    )

    st.markdown("---")

    st.subheader("Table with Badge Integration")
    badge_mapping = {
        'BUY': 'success',
        'SELL': 'danger',
        'HOLD': 'neutral'
    }
    atlas_table_with_badges(
        holdings_data[['Ticker', 'Asset Name', 'Return %', 'Action', 'Sector']],
        title="Trading Signals",
        badge_column="Action",
        badge_mapping=badge_mapping
    )

# ==================== CHART THEME DEMO ====================
elif demo_section == "Chart Theme":
    st.header("📈 Chart Theme Demo")

    st.subheader("Line Chart with Neon Glow")
    fig1 = create_line_chart(
        time_series_df,
        'Date',
        'Portfolio',
        title="Portfolio Performance (Neon Glow Effect)",
        glow=True,
        fill=True
    )
    st.plotly_chart(fig1, use_container_width=True)

    st.markdown("---")

    st.subheader("Performance Comparison")
    fig2 = create_performance_chart(
        dates=time_series_df['Date'],
        returns=time_series_df['Portfolio'],
        benchmark_returns=time_series_df['Benchmark'],
        title="Portfolio vs Benchmark"
    )
    st.plotly_chart(fig2, use_container_width=True)

    st.markdown("---")

    st.subheader("Bar Chart with Gradient")
    fig3 = create_bar_chart(
        holdings_data,
        'Ticker',
        'Return %',
        title="Asset Returns",
        gradient=True
    )
    st.plotly_chart(fig3, use_container_width=True)

# ==================== INTEGRATION EXAMPLE ====================
elif demo_section == "Integration Example":
    st.header("🎯 Full Integration Example")
    st.markdown("**All Phase 2A components working together**")

    # Header with badges
    st.markdown("### Portfolio Overview")
    badge_group([
        {'text': '$2.5M AUM', 'type': 'primary', 'size': 'md'},
        {'text': '+12.5% YTD', 'type': 'success', 'size': 'md', 'icon': '↑'},
        {'text': '8 Holdings', 'type': 'info', 'size': 'md'},
    ])

    st.markdown("---")

    # Performance chart
    col1, col2 = st.columns([2, 1])

    with col1:
        fig = create_performance_chart(
            dates=time_series_df['Date'],
            returns=time_series_df['Portfolio'],
            benchmark_returns=time_series_df['Benchmark'],
            title="Cumulative Performance"
        )
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        st.markdown("#### Key Metrics")
        st.markdown(f"""
            <div style='
                background: rgba(21, 25, 50, 0.6);
                backdrop-filter: blur(20px);
                border-radius: 12px;
                border: 1px solid rgba(99, 102, 241, 0.15);
                padding: 1rem;
                margin-bottom: 1rem;
            '>
                <p style='color: #94a3b8; font-size: 0.75rem; margin: 0;'>Total Return</p>
                <p style='color: #10b981; font-size: 2rem; font-weight: 700; margin: 0.25rem 0;'>+{portfolio_returns.iloc[-1]:.1f}%</p>
            </div>
        """, unsafe_allow_html=True)

        st.markdown(f"""
            <div style='
                background: rgba(21, 25, 50, 0.6);
                backdrop-filter: blur(20px);
                border-radius: 12px;
                border: 1px solid rgba(99, 102, 241, 0.15);
                padding: 1rem;
            '>
                <p style='color: #94a3b8; font-size: 0.75rem; margin: 0;'>vs Benchmark</p>
                <p style='color: #00d4ff; font-size: 2rem; font-weight: 700; margin: 0.25rem 0;'>+{(portfolio_returns.iloc[-1] - benchmark_returns.iloc[-1]):.1f}%</p>
            </div>
        """, unsafe_allow_html=True)

    st.markdown("---")

    # Holdings table with badges
    st.markdown("#### Current Holdings")
    atlas_table_with_badges(
        holdings_data,
        title="Portfolio Positions",
        badge_column="Action",
        badge_mapping={'BUY': 'success', 'SELL': 'danger', 'HOLD': 'neutral'}
    )

# ==================== FOOTER ====================
st.markdown("---")
st.markdown("""
    <div style='text-align: center; color: #64748b; padding: 2rem 0;'>
        <p style='margin: 0;'>✨ <strong>Phase 2A Component Library</strong> ✨</p>
        <p style='margin: 0.5rem 0 0 0; font-size: 0.875rem;'>
            Badges • Enhanced Tables • Chart Theme
        </p>
        <p style='margin: 0.5rem 0 0 0; font-size: 0.75rem;'>
            Built with ❤️ for ATLAS Terminal
        </p>
    </div>
""", unsafe_allow_html=True)
