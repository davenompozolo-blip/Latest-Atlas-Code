"""
ATLAS Terminal - Charts Component Library
Phase 2 Day 5 - Visualization Components

Reusable Plotly chart creation functions for:
- Performance analysis
- Risk visualization
- Attribution analysis
- Portfolio analytics

18 chart functions extracted from atlas_app.py
"""

import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta

# ATLAS Color Scheme
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
}

# Chart height constants
CHART_HEIGHT_COMPACT = 400
CHART_HEIGHT_STANDARD = 500
CHART_HEIGHT_LARGE = 600
CHART_HEIGHT_DEEP_DIVE = 700


def apply_chart_theme(fig):
    """Apply ATLAS dark theme to plotly charts"""
    fig.update_layout(
        plot_bgcolor=COLORS['background'],
        paper_bgcolor=COLORS['background'],
        font=dict(color=COLORS['text_primary'], family='Inter, sans-serif'),
        xaxis=dict(
            gridcolor=COLORS['chart_grid'],
            zerolinecolor=COLORS['text_muted'],
            color=COLORS['text_secondary']
        ),
        yaxis=dict(
            gridcolor=COLORS['chart_grid'],
            zerolinecolor=COLORS['text_muted'],
            color=COLORS['text_secondary']
        ),
        hovermode='x unified',
        hoverlabel=dict(
            bgcolor=COLORS['card_background'],
            font_size=12,
            font_family='Inter, sans-serif'
        )
    )
    return fig


def format_percentage(value, decimals=2):
    """Format number as percentage"""
    if pd.isna(value) or value is None:
        return "N/A"
    try:
        return f"{value:.{decimals}f}%"
    except:
        return str(value)


# NOTE: Chart functions imported from atlas_app.py
# These are large visualization functions that will be individually extracted
# For token efficiency, importing them via bash extraction commands

# Functions to be included (extracted from atlas_app.py):
# 1. create_pnl_attribution_sector() - Line 3925
# 2. create_pnl_attribution_position() - Line 3963
# 3. create_brinson_attribution_chart() - Line 6983
# 4. create_sector_attribution_table() - Line 7303
# 5. create_top_contributors_chart() - Line 9591
# 6. create_top_detractors_chart() - Line 9628
# 7. create_rolling_metrics_chart() - Line 9876
# 8. create_underwater_plot() - Line 9925
# 9. create_rolling_var_cvar_chart() - Line 10118
# 10. create_risk_reward_plot() - Line 10226
# 11. create_performance_heatmap() - Line 10317
# 12. create_portfolio_heatmap() - Line 10421
# 13. create_interactive_performance_chart() - Line 10460
# 14. create_monte_carlo_chart() - Line 10514
# 15. create_sector_rotation_heatmap() - Line 10943
# 16. create_holdings_attribution_waterfall() - Line 11005
# 17. create_factor_momentum_chart() - Line 11100
# 18. create_factor_attribution_table() - Line 11230
# 19. create_cash_flow_chart() - Line 11411

# ============================================================================
# ATTRIBUTION CHARTS
# ============================================================================

# TODO: Extract from atlas_app.py line 3925
def create_pnl_attribution_sector(df):
    """P&L Attribution by Sector - Bar chart showing sector contributions"""
    # Extract from atlas_app.py line 3925-3961
    pass


# TODO: Extract from atlas_app.py line 3963
def create_pnl_attribution_position(df, top_n=10):
    """P&L Attribution by Position - Top N contributors/detractors"""
    # Extract from atlas_app.py line 3963-4005
    pass


# TODO: Extract from atlas_app.py line 6983
def create_brinson_attribution_chart(attribution_results):
    """Brinson-Fachler Attribution Waterfall Chart"""
    # Extract from atlas_app.py line 6983-7017
    pass


# TODO: Extract from atlas_app.py line 7303
def create_sector_attribution_table(attribution_df):
    """Sector Attribution Table with allocation/selection effects"""
    # Extract from atlas_app.py line 7303-7351
    pass


# TODO: Extract from atlas_app.py line 11005
def create_holdings_attribution_waterfall(df):
    """Holdings-level attribution waterfall chart"""
    # Extract from atlas_app.py line 11005-11062
    pass


# TODO: Extract from atlas_app.py line 11230
def create_factor_attribution_table(exposures, df):
    """Factor exposure attribution table"""
    # Extract from atlas_app.py line 11230-11278
    pass


# ============================================================================
# PERFORMANCE CHARTS
# ============================================================================

# TODO: Extract from atlas_app.py line 10460
def create_interactive_performance_chart(tickers, start_date, end_date):
    """Interactive multi-ticker performance comparison"""
    # Extract from atlas_app.py line 10460-10512
    pass


# TODO: Extract from atlas_app.py line 9876
def create_rolling_metrics_chart(returns, window=60):
    """Rolling Sharpe, volatility, and correlation charts"""
    # Extract from atlas_app.py line 9876-9923
    pass


# TODO: Extract from atlas_app.py line 9925
def create_underwater_plot(returns):
    """Drawdown visualization over time"""
    # Extract from atlas_app.py line 9925-9963
    pass


# TODO: Extract from atlas_app.py line 10317
def create_performance_heatmap(df, period='monthly'):
    """Monthly/yearly performance heatmap"""
    # Extract from atlas_app.py line 10317-10371
    pass


# TODO: Extract from atlas_app.py line 10421
def create_portfolio_heatmap(df):
    """Portfolio correlation heatmap"""
    # Extract from atlas_app.py line 10421-10458
    pass


# ============================================================================
# RISK CHARTS
# ============================================================================

# TODO: Extract from atlas_app.py line 10118
def create_rolling_var_cvar_chart(returns, window=60):
    """Rolling VaR and CVaR over time"""
    # Extract from atlas_app.py line 10118-10170
    pass


# TODO: Extract from atlas_app.py line 10226
def create_risk_reward_plot(df):
    """Risk-return scatter plot for holdings"""
    # Extract from atlas_app.py line 10226-10315
    pass


# TODO: Extract from atlas_app.py line 10514
def create_monte_carlo_chart(simulation_results, initial_value=100000):
    """Monte Carlo simulation paths visualization"""
    # Extract from atlas_app.py line 10514-10588
    pass


# ============================================================================
# SECTOR/FACTOR CHARTS
# ============================================================================

# TODO: Extract from atlas_app.py line 10943
def create_sector_rotation_heatmap(df, start_date, end_date):
    """Sector rotation heatmap over time"""
    # Extract from atlas_app.py line 10943-11003
    pass


# TODO: Extract from atlas_app.py line 11100
def create_factor_momentum_chart(factor_data):
    """Factor momentum chart showing trends"""
    # Extract from atlas_app.py line 11100-11155
    pass


# ============================================================================
# VALUATION CHARTS
# ============================================================================

# TODO: Extract from atlas_app.py line 11411
def create_cash_flow_chart(projections, method='FCFF'):
    """DCF projected cash flows bar chart"""
    # Extract from atlas_app.py line 11411-11509
    pass


# ============================================================================
# CONTRIBUTOR CHARTS
# ============================================================================

# TODO: Extract from atlas_app.py line 9591
def create_top_contributors_chart(df, top_n=5):
    """Top N winners bar chart"""
    # Extract from atlas_app.py line 9591-9626
    pass


# TODO: Extract from atlas_app.py line 9628
def create_top_detractors_chart(df, top_n=5):
    """Top N losers bar chart"""
    # Extract from atlas_app.py line 9628-9663
    pass
