#!/usr/bin/env python3
"""
ATLAS TERMINAL v10.0 PHOENIX MODE - CLEAN ARCHITECTURE
=======================================================
Professional-Grade Portfolio Analytics Platform
Multi-Broker Support: Alpaca Markets | Easy Equities | Manual Entry

Author: Hlobo Mtembu
Version: 10.0 (Clean Rebuild)
Architecture: Correct Broker Integration Pattern
Last Updated: December 2025
"""

import streamlit as st
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# ============================================================================
# BROKER INTEGRATION - Single Source of Truth
# ============================================================================
try:
    from atlas_broker_manager import BrokerManager, ManualPortfolioAdapter
    from atlas_alpaca_integration import AlpacaAdapter
    BROKER_MANAGER_AVAILABLE = True
except ImportError as e:
    BROKER_MANAGER_AVAILABLE = False
    print(f"⚠️ Broker Manager not available: {e}")

# ============================================================================
# ENHANCED UI COMPONENTS
# ============================================================================
try:
    from ui.components import (
        badge, render_badge, badge_group,
        atlas_table, atlas_table_with_badges,
        create_line_chart, create_performance_chart,
        ATLAS_TEMPLATE, ATLAS_COLORS
    )
    UI_COMPONENTS_AVAILABLE = True
except ImportError:
    UI_COMPONENTS_AVAILABLE = False
    ATLAS_COLORS = {
        'vibranium': '#00d4ff',
        'indigo': '#6366f1',
        'success': '#10b981',
        'danger': '#ef4444',
    }

# ============================================================================
# THIRD-PARTY LIBRARIES
# ============================================================================
try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False

from scipy import stats
from scipy.optimize import minimize

# ============================================================================
# PAGE CONFIGURATION
# ============================================================================

st.set_page_config(
    page_title="ATLAS Terminal v10.0 PHOENIX MODE",
    page_icon="🔥",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ============================================================================
# CUSTOM STYLING - ATLAS Dark Theme
# ============================================================================

st.markdown("""
<style>
    /* Dark theme foundation */
    .main {
        background-color: #0a0e27;
        color: #f8fafc;
    }

    /* Sidebar */
    section[data-testid="stSidebar"] {
        background: linear-gradient(180deg, #131829 0%, #0a0e27 100%);
    }

    /* Headers with gradient */
    h1, h2, h3 {
        background: linear-gradient(135deg, #00d4ff, #6366f1, #8b5cf6);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-weight: 800;
    }

    /* Phoenix mode header */
    .phoenix-header {
        background: linear-gradient(90deg, #ff6b35 0%, #f7931e 50%, #ff6b35 100%);
        padding: 1.5rem;
        border-radius: 16px;
        text-align: center;
        font-size: 2rem;
        font-weight: 900;
        color: white;
        margin-bottom: 2rem;
        box-shadow: 0 8px 32px rgba(255, 107, 53, 0.3);
        border: 2px solid rgba(255, 255, 255, 0.1);
    }

    /* Metric cards */
    [data-testid="stMetricValue"] {
        font-size: 2rem;
        font-weight: 800;
        color: #00d4ff;
    }

    /* Tables */
    .stDataFrame {
        border-radius: 12px;
        overflow: hidden;
    }

    /* Buttons */
    .stButton > button {
        border-radius: 12px;
        font-weight: 600;
        transition: all 0.3s ease;
    }

    .stButton > button:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
    }
</style>
""", unsafe_allow_html=True)

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def format_currency(value: float, currency_symbol: str = "$") -> str:
    """Format currency with proper sign"""
    return f"{currency_symbol}{value:+,.2f}" if value < 0 else f"{currency_symbol}{value:,.2f}"

def format_percentage(value: float) -> str:
    """Format percentage with proper sign"""
    return f"{value:+.2f}%"

def calculate_portfolio_metrics(positions: pd.DataFrame) -> dict:
    """Calculate key portfolio metrics from positions DataFrame"""
    if positions.empty:
        return {}

    metrics = {}

    # Basic metrics
    if 'market_value' in positions.columns:
        metrics['total_value'] = positions['market_value'].sum()

    if 'cost_basis' in positions.columns:
        metrics['total_cost'] = positions['cost_basis'].sum()

    if 'unrealized_pl' in positions.columns:
        metrics['total_pl'] = positions['unrealized_pl'].sum()
        if metrics.get('total_cost', 0) > 0:
            metrics['total_return_pct'] = (metrics['total_pl'] / metrics['total_cost']) * 100

    metrics['num_positions'] = len(positions)

    return metrics

# ============================================================================
# SIDEBAR - BROKER CONNECTION (Single Source of Truth)
# ============================================================================

with st.sidebar:
    # Logo/Header
    st.markdown("""
    <div style="text-align: center; padding: 1.5rem 0;">
        <h1 style="font-size: 2rem; margin: 0;">🔥 ATLAS</h1>
        <p style="color: #94a3b8; margin: 0.5rem 0 0 0;">PHOENIX MODE v10.0</p>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("---")

    # ========================================================================
    # BROKER CONNECTION - THE ONLY DATA SOURCE SELECTOR
    # ========================================================================

    st.subheader("🏦 Portfolio Connection")

    if not BROKER_MANAGER_AVAILABLE:
        st.error("⚠️ Broker Manager not available")
        st.info("Install required packages:\n`pip install alpaca-py`")
    else:
        # Initialize broker manager
        broker_manager = BrokerManager()

        # Check if connected
        if st.session_state.get('active_broker'):
            # CONNECTED - Show status
            broker_key = st.session_state.active_broker
            broker_info = broker_manager.BROKER_OPTIONS.get(broker_key, {})

            st.success(f"✅ {broker_info.get('icon', '')} **{broker_info.get('name', 'Connected')}**")

            # Show quick stats for Alpaca
            if broker_key == 'alpaca' and 'alpaca_adapter' in st.session_state:
                try:
                    adapter = st.session_state.alpaca_adapter
                    account = adapter.get_account_summary()

                    col1, col2 = st.columns(2)
                    with col1:
                        st.metric("Portfolio", f"${account.get('portfolio_value', 0):,.0f}")
                    with col2:
                        st.metric("Cash", f"${account.get('cash', 0):,.0f}")
                except:
                    pass

            # Disconnect button
            if st.button("🔌 Disconnect", use_container_width=True, type="secondary"):
                # Clear all broker-related session state
                st.session_state.active_broker = None
                for key in ['alpaca_adapter', 'alpaca_configured', 'ee_adapter', 'manual_configured']:
                    if key in st.session_state:
                        del st.session_state[key]
                st.rerun()

        else:
            # NOT CONNECTED - Show selection
            st.info("👇 Select your data source")

            # Manual Entry
            if st.button("✏️ Manual Entry", use_container_width=True):
                st.session_state.active_broker = 'manual'
                st.session_state.manual_configured = True
                st.rerun()

            # Easy Equities (Coming soon)
            if st.button("🇿🇦 Easy Equities", use_container_width=True):
                st.info("Easy Equities integration coming soon!")

            # Alpaca Markets
            if st.button("🦙 Alpaca Markets", use_container_width=True, type="primary"):
                with st.spinner("Connecting to Alpaca..."):
                    try:
                        # Auto-connect with paper trading credentials
                        adapter = AlpacaAdapter(
                            api_key=st.secrets.get("alpaca_key", ""),
                            secret_key=st.secrets.get("alpaca_secret", ""),
                            paper=True
                        )

                        success, message = adapter.test_connection()

                        if success:
                            st.session_state.active_broker = 'alpaca'
                            st.session_state.alpaca_adapter = adapter
                            st.session_state.alpaca_configured = True
                            st.success("✅ Connected!")
                            st.rerun()
                        else:
                            st.error(f"Connection failed: {message}")
                    except Exception as e:
                        st.error(f"Error: {str(e)}")
                        st.info("Add API keys to `.streamlit/secrets.toml`")

    st.markdown("---")

    # ========================================================================
    # NAVIGATION (Only show if connected)
    # ========================================================================

    if st.session_state.get('active_broker'):
        st.subheader("📑 Navigation")

        page = st.radio(
            "Module",
            [
                "🏠 Portfolio Home",
                "📈 Performance Analysis",
                "⚠️ Risk Analysis",
                "💰 Valuation House",
                "🎲 Monte Carlo Engine",
                "⚖️ Portfolio Optimizer",
                "🌍 Market Watch",
                "🔬 Deep Dive",
            ],
            label_visibility="collapsed"
        )
    else:
        page = None

    st.markdown("---")
    st.caption("ATLAS Terminal v10.0")
    st.caption("Built by Hlobo Mtembu")

# ============================================================================
# MAIN CONTENT AREA
# ============================================================================

# Phoenix Mode Header
st.markdown('<div class="phoenix-header">🔥 PHOENIX MODE 🔥</div>', unsafe_allow_html=True)

# ============================================================================
# ROUTING LOGIC
# ============================================================================

if not st.session_state.get('active_broker'):
    # ========================================================================
    # NOT CONNECTED - SHOW ONBOARDING
    # ========================================================================

    st.title("Welcome to ATLAS Terminal v10.0")
    st.markdown("### Professional-Grade Portfolio Analytics Platform")

    st.markdown("---")

    # Feature overview
    col1, col2, col3 = st.columns(3)

    with col1:
        st.markdown("#### 📊 Real-Time Analytics")
        st.markdown("""
        - Live portfolio tracking
        - Performance attribution
        - Risk decomposition
        - Sector allocation
        - Factor analysis
        """)

    with col2:
        st.markdown("#### 🧮 Advanced Valuation")
        st.markdown("""
        - DCF modeling
        - Monte Carlo simulation
        - Scenario analysis
        - Fair value estimates
        - Sensitivity analysis
        """)

    with col3:
        st.markdown("#### ⚖️ Optimization")
        st.markdown("""
        - Mean-variance optimization
        - Risk parity
        - Black-Litterman
        - Efficient frontier
        - Rebalancing tools
        """)

    st.markdown("---")

    # Getting started
    st.info("👈 **Get Started:** Connect your portfolio using the sidebar")

    # Broker comparison
    st.subheader("🏦 Choose Your Connection Method")

    comparison = pd.DataFrame({
        'Feature': [
            'Setup Time',
            'Auto-Sync',
            'Real-time Data',
            'Commission-Free',
            'Paper Trading',
            'Best For',
        ],
        '✏️ Manual Entry': [
            '< 1 min',
            '❌',
            '❌',
            'N/A',
            '❌',
            'Full control, offline',
        ],
        '🇿🇦 Easy Equities': [
            '5-10 min',
            '✅',
            '✅',
            '❌',
            '❌',
            'SA investors',
        ],
        '🦙 Alpaca Markets': [
            '< 1 min',
            '✅',
            '✅',
            '✅',
            '✅',
            'Global, US stocks',
        ],
    })

    st.dataframe(comparison, use_container_width=True, hide_index=True)

    st.markdown("---")

    # Optional: Phoenix Parser fallback
    with st.expander("🔥 Advanced: Upload Excel Files (Phoenix Parser)", expanded=False):
        st.markdown("### Manual Portfolio Upload")
        st.info("This is a fallback option for power users. Most users should use the broker connections above.")

        uploaded_file = st.file_uploader("Upload Trade History (CSV/Excel)", type=['csv', 'xlsx'])

        if uploaded_file:
            st.success("File uploaded! Processing...")
            st.info("🚧 Phoenix Parser integration coming soon in next update")

else:
    # ========================================================================
    # CONNECTED - SHOW PORTFOLIO INTERFACE
    # ========================================================================

    # Get the adapter
    adapter = None
    broker_key = st.session_state.active_broker

    if broker_key == 'manual' and st.session_state.get('manual_configured'):
        adapter = ManualPortfolioAdapter()
    elif broker_key == 'alpaca' and 'alpaca_adapter' in st.session_state:
        adapter = st.session_state.alpaca_adapter
    elif broker_key == 'easy_equities' and 'ee_adapter' in st.session_state:
        adapter = st.session_state.ee_adapter

    if not adapter:
        st.error("⚠️ Broker adapter not initialized properly")
        st.stop()

    # ========================================================================
    # PAGE ROUTING
    # ========================================================================

    if page == "🏠 Portfolio Home" or page is None:
        st.header("🏠 Portfolio Home")

        try:
            # Get positions from adapter
            positions = adapter.get_positions()

            if positions.empty:
                st.warning("📭 No positions in your portfolio")
                st.info("Add positions via your broker platform or manual entry")
                st.stop()

            # Get account summary if available
            account = {}
            if hasattr(adapter, 'get_account_summary'):
                account = adapter.get_account_summary()

            # Calculate metrics
            metrics = calculate_portfolio_metrics(positions)

            # ====================================================================
            # TOP METRICS
            # ====================================================================

            col1, col2, col3, col4 = st.columns(4)

            with col1:
                portfolio_value = account.get('portfolio_value', metrics.get('total_value', 0))
                last_value = account.get('last_equity', portfolio_value)
                delta = portfolio_value - last_value
                st.metric(
                    "Portfolio Value",
                    f"${portfolio_value:,.2f}",
                    delta=f"${delta:+,.2f}"
                )

            with col2:
                cash = account.get('cash', 0)
                st.metric("Cash", f"${cash:,.2f}")

            with col3:
                total_pl = metrics.get('total_pl', 0)
                st.metric("Total P&L", f"${total_pl:+,.2f}")

            with col4:
                return_pct = metrics.get('total_return_pct', 0)
                st.metric("Total Return", f"{return_pct:+.2f}%")

            st.markdown("---")

            # ====================================================================
            # POSITIONS TABLE
            # ====================================================================

            st.subheader("📈 Current Holdings")

            # Prepare display DataFrame
            display_cols = []
            col_mapping = {}

            if 'ticker' in positions.columns:
                display_cols.append('ticker')
                col_mapping['ticker'] = 'Ticker'

            if 'quantity' in positions.columns:
                display_cols.append('quantity')
                col_mapping['quantity'] = 'Shares'

            if 'avg_cost' in positions.columns:
                display_cols.append('avg_cost')
                col_mapping['avg_cost'] = 'Avg Cost'

            if 'current_price' in positions.columns:
                display_cols.append('current_price')
                col_mapping['current_price'] = 'Price'

            if 'market_value' in positions.columns:
                display_cols.append('market_value')
                col_mapping['market_value'] = 'Value'

            if 'unrealized_pl' in positions.columns:
                display_cols.append('unrealized_pl')
                col_mapping['unrealized_pl'] = 'P&L ($)'

            if 'unrealized_plpc' in positions.columns:
                display_cols.append('unrealized_plpc')
                col_mapping['unrealized_plpc'] = 'P&L (%)'

            if 'weight' in positions.columns:
                display_cols.append('weight')
                col_mapping['weight'] = 'Weight'

            # Create display DataFrame
            display_df = positions[display_cols].copy()

            # Format currency columns
            for col in ['avg_cost', 'current_price']:
                if col in display_df.columns:
                    display_df[col] = display_df[col].apply(lambda x: f"${x:.2f}")

            for col in ['market_value', 'unrealized_pl']:
                if col in display_df.columns:
                    display_df[col] = display_df[col].apply(lambda x: f"${x:+,.2f}" if x < 0 else f"${x:,.2f}")

            if 'unrealized_plpc' in display_df.columns:
                display_df['unrealized_plpc'] = display_df['unrealized_plpc'].apply(lambda x: f"{x:+.2f}%")

            if 'weight' in display_df.columns:
                display_df['weight'] = display_df['weight'].apply(lambda x: f"{x:.1f}%")

            # Rename columns
            display_df = display_df.rename(columns=col_mapping)

            st.dataframe(display_df, use_container_width=True, hide_index=True)

            st.markdown("---")

            # ====================================================================
            # VISUALIZATIONS
            # ====================================================================

            col1, col2 = st.columns(2)

            with col1:
                st.subheader("📊 Portfolio Allocation")

                if 'weight' in positions.columns and 'ticker' in positions.columns:
                    fig = px.pie(
                        positions,
                        values='weight',
                        names='ticker',
                        title="Holdings by Weight",
                        hole=0.4,
                        color_discrete_sequence=px.colors.sequential.Viridis
                    )
                    fig.update_traces(textposition='inside', textinfo='percent+label')
                    fig.update_layout(
                        paper_bgcolor='rgba(0,0,0,0)',
                        plot_bgcolor='rgba(0,0,0,0)',
                        font=dict(color='#f8fafc'),
                        showlegend=False
                    )
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.info("Weight data not available")

            with col2:
                st.subheader("💰 Position Values")

                if 'market_value' in positions.columns and 'ticker' in positions.columns:
                    # Sort by market value
                    sorted_positions = positions.sort_values('market_value', ascending=True)

                    # Determine colors based on P&L if available
                    if 'unrealized_pl' in positions.columns:
                        colors = sorted_positions['unrealized_pl'].apply(
                            lambda x: ATLAS_COLORS['success'] if x >= 0 else ATLAS_COLORS['danger']
                        )
                    else:
                        colors = ATLAS_COLORS['vibranium']

                    fig = px.bar(
                        sorted_positions,
                        y='ticker',
                        x='market_value',
                        orientation='h',
                        title="Market Value by Position",
                        color=colors if isinstance(colors, pd.Series) else None,
                        color_discrete_map="identity" if isinstance(colors, pd.Series) else None
                    )
                    fig.update_layout(
                        paper_bgcolor='rgba(0,0,0,0)',
                        plot_bgcolor='rgba(0,0,0,0)',
                        font=dict(color='#f8fafc'),
                        showlegend=False,
                        xaxis_title="Market Value ($)",
                        yaxis_title=""
                    )
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.info("Market value data not available")

            # ====================================================================
            # SUMMARY STATS
            # ====================================================================

            st.markdown("---")
            st.subheader("📊 Portfolio Summary")

            col1, col2, col3, col4 = st.columns(4)

            with col1:
                st.metric("Number of Holdings", metrics.get('num_positions', 0))

            with col2:
                avg_return = metrics.get('total_return_pct', 0)
                st.metric("Avg Return", f"{avg_return:+.2f}%")

            with col3:
                if 'weight' in positions.columns:
                    top_holding_pct = positions['weight'].max()
                    st.metric("Top Holding", f"{top_holding_pct:.1f}%")
                else:
                    st.metric("Top Holding", "N/A")

            with col4:
                if 'weight' in positions.columns:
                    # Concentration: % in top 3 holdings
                    top3_pct = positions.nlargest(3, 'weight')['weight'].sum()
                    st.metric("Top 3 Concentration", f"{top3_pct:.1f}%")
                else:
                    st.metric("Concentration", "N/A")

        except Exception as e:
            st.error(f"Error loading portfolio data: {str(e)}")
            st.exception(e)

    # ========================================================================
    # PERFORMANCE ANALYSIS PAGE
    # ========================================================================

    elif page == "📈 Performance Analysis":
        st.header("📈 Performance Analysis")

        try:
            # Check if adapter has performance history
            if hasattr(adapter, 'get_portfolio_history'):
                st.subheader("📊 Portfolio Performance")

                # Date range selector
                col1, col2 = st.columns(2)
                with col1:
                    period = st.selectbox("Time Period", ["1M", "3M", "6M", "1Y", "YTD", "All"])

                # Map period to days
                period_map = {
                    "1M": 30,
                    "3M": 90,
                    "6M": 180,
                    "1Y": 365,
                    "YTD": (datetime.now() - datetime(datetime.now().year, 1, 1)).days,
                    "All": 365 * 5  # 5 years
                }

                days = period_map.get(period, 365)

                with st.spinner("Loading performance data..."):
                    history = adapter.get_portfolio_history(days=days)

                if not history.empty:
                    # Performance chart
                    fig = go.Figure()

                    fig.add_trace(go.Scatter(
                        x=history['timestamp'],
                        y=history['equity'],
                        mode='lines',
                        name='Portfolio Value',
                        line=dict(color=ATLAS_COLORS['vibranium'], width=3),
                        fill='tonexty',
                        fillcolor='rgba(0, 212, 255, 0.1)'
                    ))

                    fig.update_layout(
                        title=f"Portfolio Performance - {period}",
                        xaxis_title="Date",
                        yaxis_title="Portfolio Value ($)",
                        paper_bgcolor='rgba(0,0,0,0)',
                        plot_bgcolor='rgba(0,0,0,0)',
                        font=dict(color='#f8fafc'),
                        hovermode='x unified'
                    )

                    st.plotly_chart(fig, use_container_width=True)

                    # Performance metrics
                    st.markdown("---")
                    st.subheader("📊 Performance Metrics")

                    col1, col2, col3, col4 = st.columns(4)

                    # Calculate metrics
                    start_value = history['equity'].iloc[0]
                    end_value = history['equity'].iloc[-1]
                    total_return = ((end_value / start_value) - 1) * 100

                    with col1:
                        st.metric("Total Return", f"{total_return:+.2f}%")

                    with col2:
                        st.metric("Starting Value", f"${start_value:,.2f}")

                    with col3:
                        st.metric("Ending Value", f"${end_value:,.2f}")

                    with col4:
                        change = end_value - start_value
                        st.metric("Net Change", f"${change:+,.2f}")

                else:
                    st.warning("No performance history available")
            else:
                st.info("📊 Performance history not available for this broker")
                st.markdown("This feature requires a broker with historical data support (e.g., Alpaca Markets)")

        except Exception as e:
            st.error(f"Error loading performance data: {str(e)}")

    # ========================================================================
    # RISK ANALYSIS PAGE
    # ========================================================================

    elif page == "⚠️ Risk Analysis":
        st.header("⚠️ Risk Analysis")

        try:
            # Check if adapter supports risk metrics
            if hasattr(adapter, 'get_risk_metrics'):
                st.subheader("📊 Risk Metrics")

                with st.spinner("Calculating risk metrics..."):
                    risk_metrics = adapter.get_risk_metrics(days=252)

                if risk_metrics:
                    col1, col2, col3, col4 = st.columns(4)

                    with col1:
                        sharpe = risk_metrics.get('sharpe_ratio', 0)
                        st.metric("Sharpe Ratio", f"{sharpe:.2f}")
                        st.caption("Risk-adjusted return")

                    with col2:
                        max_dd = risk_metrics.get('max_drawdown', 0)
                        st.metric("Max Drawdown", f"{max_dd:.2%}")
                        st.caption("Worst peak-to-trough")

                    with col3:
                        vol = risk_metrics.get('volatility', 0)
                        st.metric("Volatility", f"{vol:.2%}")
                        st.caption("Annual std deviation")

                    with col4:
                        var = risk_metrics.get('var_95', 0)
                        st.metric("VaR (95%)", f"{var:.2%}")
                        st.caption("Worst daily loss")

                    st.markdown("---")

                    # Additional metrics
                    col1, col2, col3, col4 = st.columns(4)

                    with col1:
                        sortino = risk_metrics.get('sortino_ratio', 0)
                        st.metric("Sortino Ratio", f"{sortino:.2f}")

                    with col2:
                        calmar = risk_metrics.get('calmar_ratio', 0)
                        st.metric("Calmar Ratio", f"{calmar:.2f}")

                    with col3:
                        total_ret = risk_metrics.get('total_return', 0)
                        st.metric("Total Return", f"{total_ret:.2%}")

                    with col4:
                        mean_ret = risk_metrics.get('mean_return', 0)
                        st.metric("Mean Return", f"{mean_ret:.2%}")

                    # Risk explanations
                    st.markdown("---")
                    st.subheader("📚 Metric Definitions")

                    with st.expander("Understanding Risk Metrics"):
                        st.markdown("""
                        **Sharpe Ratio**: Measures risk-adjusted returns. Higher is better. > 1 is good, > 2 is excellent.

                        **Max Drawdown**: Largest peak-to-trough decline. Lower is better.

                        **Volatility**: Annualized standard deviation of returns. Lower means more stable.

                        **VaR (Value at Risk)**: Expected worst daily loss at 95% confidence.

                        **Sortino Ratio**: Like Sharpe but only penalizes downside volatility.

                        **Calmar Ratio**: Return divided by max drawdown. Higher is better.
                        """)
                else:
                    st.warning("Insufficient data for risk analysis")
            else:
                st.info("⚠️ Risk metrics not available for this broker")
                st.markdown("This feature requires a broker with historical data support (e.g., Alpaca Markets)")

        except Exception as e:
            st.error(f"Error calculating risk metrics: {str(e)}")

    # ========================================================================
    # VALUATION HOUSE PAGE
    # ========================================================================

    elif page == "💰 Valuation House":
        st.header("💰 Valuation House")
        st.markdown("### DCF Valuation Engine")

        st.info("🚧 DCF Valuation module coming soon!")

        st.markdown("""
        **Planned Features:**
        - Automated financial statement analysis
        - Growth rate projections
        - WACC calculation
        - Terminal value estimation
        - Sensitivity analysis
        - Fair value calculation
        """)

    # ========================================================================
    # MONTE CARLO ENGINE PAGE
    # ========================================================================

    elif page == "🎲 Monte Carlo Engine":
        st.header("🎲 Monte Carlo Simulation")
        st.markdown("### Stochastic Portfolio Modeling")

        st.info("🚧 Monte Carlo simulator coming soon!")

        st.markdown("""
        **Planned Features:**
        - Geometric Brownian Motion simulation
        - Portfolio return distribution
        - Risk/reward scenarios
        - Probability analysis
        - Value at Risk (VaR)
        - Conditional VaR (CVaR)
        """)

    # ========================================================================
    # PORTFOLIO OPTIMIZER PAGE
    # ========================================================================

    elif page == "⚖️ Portfolio Optimizer":
        st.header("⚖️ Portfolio Optimization")
        st.markdown("### Mean-Variance Optimization")

        st.info("🚧 Portfolio optimizer coming soon!")

        st.markdown("""
        **Planned Features:**
        - Mean-variance optimization
        - Risk parity allocation
        - Black-Litterman model
        - Constraint-based optimization
        - Efficient frontier visualization
        - Rebalancing recommendations
        """)

    # ========================================================================
    # MARKET WATCH PAGE
    # ========================================================================

    elif page == "🌍 Market Watch":
        st.header("🌍 Market Watch")
        st.markdown("### Global Markets Overview")

        st.info("🚧 Market Watch coming soon!")

        st.markdown("""
        **Planned Features:**
        - Real-time market indices
        - Crypto prices
        - Bond yields
        - Credit spreads
        - Commodity prices
        - Economic calendar
        """)

    # ========================================================================
    # PORTFOLIO DEEP DIVE PAGE
    # ========================================================================

    elif page == "🔬 Deep Dive":
        st.header("🔬 Portfolio Deep Dive")
        st.markdown("### Detailed Holdings Analysis")

        try:
            positions = adapter.get_positions()

            if positions.empty:
                st.warning("No positions to analyze")
                st.stop()

            st.subheader("🔍 Position Details")

            # Select a position
            if 'ticker' in positions.columns:
                selected_ticker = st.selectbox("Select Position", positions['ticker'].tolist())

                # Filter to selected position
                position = positions[positions['ticker'] == selected_ticker].iloc[0]

                # Display details
                col1, col2, col3 = st.columns(3)

                with col1:
                    st.metric("Ticker", position.get('ticker', 'N/A'))
                    if 'quantity' in position:
                        st.metric("Shares", f"{position['quantity']:.0f}")

                with col2:
                    if 'avg_cost' in position:
                        st.metric("Avg Cost", f"${position['avg_cost']:.2f}")
                    if 'current_price' in position:
                        st.metric("Current Price", f"${position['current_price']:.2f}")

                with col3:
                    if 'market_value' in position:
                        st.metric("Market Value", f"${position['market_value']:,.2f}")
                    if 'unrealized_pl' in position:
                        st.metric("P&L", f"${position['unrealized_pl']:+,.2f}")

                st.markdown("---")

                # Additional analysis placeholder
                st.info("🚧 Advanced position analysis coming soon!")
            else:
                st.warning("Ticker information not available")

        except Exception as e:
            st.error(f"Error in deep dive analysis: {str(e)}")

# ============================================================================
# FOOTER
# ============================================================================

st.markdown("---")
st.caption("ATLAS Terminal v10.0 PHOENIX MODE | Built by Hlobo Mtembu | Powered by Multi-Broker Integration")
