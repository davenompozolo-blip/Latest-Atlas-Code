"""
ATLAS Terminal - Chart & Visualization Creation Functions
Extracted from atlas_app.py (Phase 4).
"""
import math
import json
import pickle
import random
import time
import warnings
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st

try:
    import plotly.graph_objects as go
    import plotly.express as px
    from plotly.subplots import make_subplots
except ImportError:
    pass

try:
    import networkx as nx
except ImportError:
    nx = None

try:
    import yfinance as yf
except ImportError:
    pass

try:
    from scipy import stats
    from scipy.optimize import minimize
except ImportError:
    pass

from app.config import (
    COLORS, CHART_HEIGHT_COMPACT, CHART_HEIGHT_STANDARD,
    CHART_HEIGHT_LARGE, CHART_HEIGHT_DEEP_DIVE, CHART_THEME,
    CACHE_DIR, PORTFOLIO_CACHE, TRADE_HISTORY_CACHE,
    ACCOUNT_HISTORY_CACHE, RISK_FREE_RATE, MARKET_RETURN
)
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator

try:
    from data.instruments import POPULAR_STOCKS, POPULAR_ETFS, GLOBAL_INDICES, FACTOR_DEFINITIONS
except ImportError:
    POPULAR_STOCKS = {}
    POPULAR_ETFS = {}
    GLOBAL_INDICES = {}
    FACTOR_DEFINITIONS = {}

try:
    from data.sectors import GICS_SECTORS, GICS_SECTOR_MAPPING, STOCK_SECTOR_OVERRIDES, SPY_SECTOR_WEIGHTS
except ImportError:
    GICS_SECTORS = {}
    GICS_SECTOR_MAPPING = {}
    STOCK_SECTOR_OVERRIDES = {}
    SPY_SECTOR_WEIGHTS = {}

# Shared constants and feature flags
from .constants import (
    REFACTORED_MODULES_AVAILABLE, market_data, ErrorHandler,
    PROFESSIONAL_THEME_AVAILABLE, PROFESSIONAL_CHART_COLORS,
)

# Cross-module imports (functions used in this file but defined in sibling modules)
from .fetchers import (
    fetch_market_data,
    fetch_analyst_data,
    fetch_stock_info,
    fetch_historical_data,
    fetch_us_treasury_yields_fred,
    fetch_ticker_performance,
)
from .data_loading import (
    is_valid_series,
    classify_ticker_sector,
    ATLASFormatter,
    get_current_portfolio_metrics,
)
from .calculations import (
    calculate_signal_health,
    calculate_forward_rates,
    calculate_quality_score,
    calculate_var,
    calculate_cvar,
)


def _lazy_atlas():
    """Lazy import of atlas_app to avoid circular imports."""
    import atlas_app
    return atlas_app


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


def create_signal_health_badge(metrics):
    """Create visual health indicator badge for portfolio"""
    status, percentage, label = calculate_signal_health(metrics)

    color_map = {
        'GREEN': COLORS['success'],
        'YELLOW': COLORS['warning'],
        'RED': COLORS['danger']
    }

    badge_html = f"""
    <div style='display: inline-block; background: {color_map[status]}; color: #ffffff; padding: 10px 20px; border-radius: 20px; font-weight: 700; font-size: 15px; margin: 10px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.3);'>
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
        height=CHART_HEIGHT_STANDARD,  # P1-4: Standardized height
        showlegend=False
    )

    apply_chart_theme(fig)
    return fig


def create_pnl_attribution_position(df, top_n=10):
    """v9.7 ENHANCED: P&L Attribution by Position - Now showing % returns"""
    # v9.7 FIX: Use Total Gain/Loss % instead of dollars
    top_contributors = df.nlargest(top_n // 2, 'Total Gain/Loss %')
    top_detractors = df.nsmallest(top_n // 2, 'Total Gain/Loss %')
    combined = pd.concat([top_contributors, top_detractors]).sort_values('Total Gain/Loss %')

    colors = [COLORS['success'] if x > 0 else COLORS['danger'] for x in combined['Total Gain/Loss %']]

    # Create labels with ticker and percentage
    labels = [f"{ticker}" for ticker in combined['Ticker']]

    fig = go.Figure(go.Bar(
        x=combined['Total Gain/Loss %'],
        y=labels,
        orientation='h',
        marker=dict(
            color=colors,
            line=dict(color=COLORS['border'], width=2),
            opacity=0.9
        ),
        text=[f"{v:+.1f}%" for v in combined['Total Gain/Loss %']],
        textposition='outside',
        textfont=dict(size=11, color=COLORS['text_primary']),
        hovertemplate='<b>%{y}</b><br>Return: %{x:.2f}%<extra></extra>'
    ))

    fig.update_layout(
        title=f"🎯 Top {top_n} P&L Contributors & Detractors (%)",
        xaxis_title="Return (%)",
        yaxis_title="",
        height=CHART_HEIGHT_STANDARD,  # P1-4: Standardized height
        showlegend=False,
        xaxis=dict(zeroline=True, zerolinewidth=2, zerolinecolor=COLORS['text_muted'])
    )

    apply_chart_theme(fig)
    return fig


def create_sparkline(ticker, days=30):
    """Generate mini sparkline chart for ticker (last 30 days)"""
    # ATLAS Refactoring - Use cached market data fetcher
    try:
        if REFACTORED_MODULES_AVAILABLE:
            # Map days to period string
            period_map = {30: "1mo", 90: "3mo", 7: "5d", 5: "5d"}
            period = period_map.get(days, f"{days}d")
            hist = market_data.get_stock_history(ticker, period=period, interval="1d")
        else:
            # Fallback to old method
            stock = yf.Ticker(ticker)
            hist = stock.history(period=f"{days}d")

        if hist.empty:
            return None

        # Convert timezone-aware index to timezone-naive
        if hist.index.tz is not None:
            hist.index = hist.index.tz_localize(None)

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
    """
    Professional US Treasury Yield Curve visualization with multi-source data.

    Data sources (in priority order):
    1. FRED API (Federal Reserve) - Most accurate and comprehensive
    2. Yahoo Finance - Backup source
    3. Fallback data - If all sources fail
    """
    # Fetch yields from multi-source function
    maturities, yields_data, data_source = fetch_us_treasury_yields_fred()

    if not yields_data:
        return None

    # Create labels for display
    label_map = {
        1/12: "1M", 0.25: "3M", 0.5: "6M",
        1: "1Y", 2: "2Y", 3: "3Y", 5: "5Y",
        7: "7Y", 10: "10Y", 20: "20Y", 30: "30Y"
    }
    labels = [label_map.get(m, f"{m:.1f}Y") for m in maturities]

    # Sort by maturity
    sorted_data = sorted(zip(maturities, yields_data, labels))
    maturities, yields_data, labels = zip(*sorted_data)

    # Calculate forward rates
    forward_labels, forward_rates = calculate_forward_rates(list(maturities), list(yields_data))

    # Create positions for forward rates (plot at midpoint between maturities)
    forward_x = []
    for i in range(len(maturities) - 1):
        forward_x.append((maturities[i] + maturities[i+1]) / 2)

    fig = go.Figure()

    # Spot yield curve
    fig.add_trace(go.Scatter(
        x=maturities,
        y=yields_data,
        mode='lines+markers',
        line=dict(color=COLORS['neon_blue'], width=3),
        marker=dict(size=12, color=COLORS['electric_blue'], line=dict(color=COLORS['border'], width=2)),
        text=[f"{l}: {y:.2f}%" for l, y in zip(labels, yields_data)],
        hovertemplate='<b>Spot %{text}</b><extra></extra>',
        name='Spot Yield Curve'
    ))

    # Forward rate curve overlaid
    if forward_rates:
        fig.add_trace(go.Scatter(
            x=forward_x,
            y=forward_rates,
            mode='lines+markers',
            line=dict(color=COLORS['success'], width=2, dash='dash'),
            marker=dict(size=8, color=COLORS['success'], symbol='diamond'),
            text=[f"{label}: {rate:.2f}%" for label, rate in zip(forward_labels, forward_rates)],
            hovertemplate='<b>Forward %{text}</b><extra></extra>',
            name='Implied Forward Rates'
        ))

    # Add data source indicator to title
    source_icon = {
        "FRED API": "🏛️",
        "Yahoo Finance": "📊",
        "Fallback Data": "⚠️"
    }.get(data_source, "📈")

    fig.update_layout(
        title=f"{source_icon} US Treasury Yield Curve with Forward Rates<br><sub>Data Source: {data_source}</sub>",
        xaxis_title="Maturity (Years)",
        yaxis_title="Yield (%)",
        height=500,
        showlegend=True,
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        )
    )

    apply_chart_theme(fig)
    return fig, list(maturities), list(yields_data), data_source


def create_yield_curve_with_forwards(maturities, yields, title, color='#FF6B6B'):
    """Create yield curve with overlaid forward rates for any country"""
    # Calculate forward rates
    forward_labels, forward_rates = calculate_forward_rates(maturities, yields)

    # Create positions for forward rates (plot at midpoint between maturities)
    forward_x = []
    for i in range(len(maturities) - 1):
        forward_x.append((maturities[i] + maturities[i+1]) / 2)

    fig = go.Figure()

    # Spot yield curve
    labels = [f"{int(m)}Y" if m >= 1 else f"{int(m*12)}M" for m in maturities]
    fig.add_trace(go.Scatter(
        x=maturities,
        y=yields,
        mode='lines+markers',
        line=dict(color=color, width=3),
        marker=dict(size=12, line=dict(color=COLORS['border'], width=2)),
        text=[f"{l}: {y:.2f}%" for l, y in zip(labels, yields)],
        hovertemplate='<b>Spot %{text}</b><extra></extra>',
        name='Spot Yield Curve'
    ))

    # Forward rate curve overlaid
    if forward_rates:
        fig.add_trace(go.Scatter(
            x=forward_x,
            y=forward_rates,
            mode='lines+markers',
            line=dict(color=COLORS['success'], width=2, dash='dash'),
            marker=dict(size=8, color=COLORS['success'], symbol='diamond'),
            text=[f"{label}: {rate:.2f}%" for label, rate in zip(forward_labels, forward_rates)],
            hovertemplate='<b>Forward %{text}</b><extra></extra>',
            name='Implied Forward Rates'
        ))

    fig.update_layout(
        title=f"📈 {title}",
        xaxis_title="Maturity (Years)",
        yaxis_title="Yield (%)",
        height=500,
        showlegend=True,
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


def create_brinson_attribution_chart(attribution_results, use_professional_theme=True):
    """
    Create waterfall chart showing allocation, selection, and interaction effects
    Professional Blue theme with clean styling
    """

    # Aggregate by effect type
    total_allocation = attribution_results['total_allocation_effect']
    total_selection = attribution_results['total_selection_effect']
    total_interaction = attribution_results['total_interaction_effect']
    total = attribution_results['total_attribution']

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        connector_color = 'rgba(255, 255, 255, 0.5)'
        success_color = '#00E676'
        danger_color = '#FF1744'
        total_color = '#818cf8'
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
    else:
        connector_color = COLORS['neon_blue']
        success_color = COLORS['success']
        danger_color = COLORS['danger']
        total_color = COLORS['electric_blue']
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'

    fig = go.Figure(go.Waterfall(
        name="Attribution",
        orientation="v",
        x=['Allocation<br>Effect', 'Selection<br>Effect', 'Interaction<br>Effect', 'Total<br>Attribution'],
        y=[total_allocation, total_selection, total_interaction, total],
        measure=['relative', 'relative', 'relative', 'total'],
        text=[f"{total_allocation:+.2f}%", f"{total_selection:+.2f}%",
              f"{total_interaction:+.2f}%", f"{total:.2f}%"],
        textposition="outside",
        textfont=dict(size=12, family='JetBrains Mono', color=text_color),
        connector={"line": {"color": connector_color, "width": 2}},
        decreasing={"marker": {"color": danger_color}},
        increasing={"marker": {"color": success_color}},
        totals={"marker": {"color": total_color}}
    ))

    fig.update_layout(
        title=dict(text="📊 Brinson Attribution: Portfolio Outperformance Breakdown",
                   font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        yaxis=dict(title="Effect (%)", showgrid=True, gridcolor=grid_color,
                   tickfont=dict(size=10, color=text_color)),
        xaxis=dict(tickfont=dict(size=10, color=text_color)),
        height=450,
        showlegend=False,
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=60, r=30, t=60, b=50)
    )

    if not use_professional_theme:
        apply_chart_theme(fig)
    return fig


def create_skill_assessment_card(attribution_results):
    """
    Create visual skill assessment comparing allocation vs selection
    Uses glassmorphism styling to match ATLAS dashboard theme
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

    # Status emojis and colors
    alloc_color = '#00ff9d' if allocation_effect > 0 else '#ff006b'
    select_color = '#00ff9d' if selection_effect > 0 else '#ff006b'
    alloc_status = '✓ Strong sector rotation' if allocation_effect > 1 else '○ Neutral sector timing' if allocation_effect > -1 else '✗ Poor sector allocation'
    select_status = '✓ Strong stock picks' if selection_effect > 1 else '○ Neutral stock selection' if selection_effect > -1 else '✗ Stocks underperform sector'

    html = f"""
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
    </style>
    <div style="
        background: rgba(26, 35, 50, 0.7);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(99, 102, 241, 0.2);
        border-radius: 12px;
        padding: 24px;
        margin: 20px 0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    ">
        <h3 style="
            font-family: 'Inter', sans-serif;
            font-size: 1.2rem;
            font-weight: 700;
            color: #818cf8;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin: 0 0 20px 0;
            text-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
        ">
            🎯 Portfolio Management Skill Assessment
        </h3>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">

            <!-- Allocation Skill -->
            <div style="
                background: rgba(10, 15, 26, 0.6);
                border: 1px solid rgba(99, 102, 241, 0.15);
                border-radius: 8px;
                padding: 16px;
            ">
                <div style="
                    font-family: 'Inter', sans-serif;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: #8890a0;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-bottom: 8px;
                ">ALLOCATION SKILL (Sector Timing)</div>

                <div style="
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 2.5rem;
                    font-weight: 700;
                    color: {alloc_color};
                    text-shadow: 0 0 15px {alloc_color}40;
                    margin: 8px 0;
                ">{allocation_score:.1f}/10</div>

                <div style="
                    font-family: 'Inter', sans-serif;
                    font-size: 0.9rem;
                    color: #c0c8d0;
                    margin-top: 8px;
                ">Effect: {allocation_effect:+.2f}%</div>

                <div style="
                    font-family: 'Inter', sans-serif;
                    font-size: 0.75rem;
                    color: {alloc_color};
                    margin-top: 8px;
                ">{alloc_status}</div>
            </div>

            <!-- Selection Skill -->
            <div style="
                background: rgba(10, 15, 26, 0.6);
                border: 1px solid rgba(99, 102, 241, 0.15);
                border-radius: 8px;
                padding: 16px;
            ">
                <div style="
                    font-family: 'Inter', sans-serif;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: #8890a0;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-bottom: 8px;
                ">SELECTION SKILL (Stock Picking)</div>

                <div style="
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 2.5rem;
                    font-weight: 700;
                    color: {select_color};
                    text-shadow: 0 0 15px {select_color}40;
                    margin: 8px 0;
                ">{selection_score:.1f}/10</div>

                <div style="
                    font-family: 'Inter', sans-serif;
                    font-size: 0.9rem;
                    color: #c0c8d0;
                    margin-top: 8px;
                ">Effect: {selection_effect:+.2f}%</div>

                <div style="
                    font-family: 'Inter', sans-serif;
                    font-size: 0.75rem;
                    color: {select_color};
                    margin-top: 8px;
                ">{select_status}</div>
            </div>
        </div>

        <!-- Recommendation -->
        <div style="
            background: linear-gradient(90deg, rgba(99, 102, 241, 0.1) 0%, transparent 100%);
            border-left: 3px solid #818cf8;
            padding: 12px 16px;
            margin-top: 20px;
            border-radius: 4px;
        ">
            <div style="
                font-family: 'Inter', sans-serif;
                font-size: 0.75rem;
                font-weight: 700;
                color: #818cf8;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                margin-bottom: 4px;
            ">💡 Primary Strength: {primary_skill}</div>
            <div style="
                font-family: 'Inter', sans-serif;
                font-size: 0.85rem;
                color: #c0c8d0;
            ">{recommendation}</div>
        </div>
    </div>
    """

    return html


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


def create_enhanced_holdings_table(df):
    from modules import format_ticker_for_display

    enhanced_df = df.copy()

    # Check if this is an Easy Equities portfolio
    # CRITICAL FIX: Check BOTH attrs AND EE-specific columns
    # attrs are lost when data is saved/loaded via pickle/database
    # So we also check for EE-specific columns that only exist in EE portfolios
    is_ee_portfolio = (
        enhanced_df.attrs.get('source') == 'easy_equities' or  # Fresh from sync
        'Market_Value' in enhanced_df.columns  # Loaded from storage (attrs lost but columns preserved)
    )

    # Normalize column names for Easy Equities compatibility
    # Easy Equities uses different column names than manual uploads
    column_mapping = {
        'Cost_Basis': 'Avg Cost',        # Easy Equities → ATLAS
        'Market_Value': 'Total Value',   # Easy Equities → ATLAS (if needed)
        'Purchase_Value': 'Total Cost',  # Easy Equities → ATLAS
        'Current_Price': 'Current Price', # Ensure consistent naming
    }

    for ee_col, atlas_col in column_mapping.items():
        if ee_col in enhanced_df.columns and atlas_col not in enhanced_df.columns:
            enhanced_df[atlas_col] = enhanced_df[ee_col]

    # Add display ticker column (Phase 1 Fix)
    enhanced_df['Display Ticker'] = enhanced_df['Ticker'].apply(format_ticker_for_display)

    # Enrich with Yahoo Finance data for ALL portfolios (both manual and EE)
    # We need Beta, Daily Change, Sector, etc. even for EE portfolios
    # CRITICAL FIX: Add total time budget to prevent app hang on Streamlit Cloud
    import time as _enrich_time
    _enrich_start = _enrich_time.time()
    _ENRICH_BUDGET_SECONDS = 120  # Max 2 minutes for all enrichment
    _enriched_count = 0
    _skipped_count = 0
    _total_tickers = len(enhanced_df)
    print(f"[HOLDINGS] Starting enrichment for {_total_tickers} positions (budget: {_ENRICH_BUDGET_SECONDS}s)", flush=True)

    for idx, row in enhanced_df.iterrows():
        ticker = row['Ticker']

        # Check time budget - skip remaining tickers if over budget
        _elapsed = _enrich_time.time() - _enrich_start
        if _elapsed > _ENRICH_BUDGET_SECONDS:
            _skipped_count = _total_tickers - _enriched_count
            print(f"[HOLDINGS] TIME BUDGET EXCEEDED ({_elapsed:.1f}s) - skipping remaining {_skipped_count} tickers", flush=True)
            # Set defaults for remaining tickers
            enhanced_df.at[idx, 'Asset Name'] = enhanced_df.at[idx, 'Asset Name'] if 'Asset Name' in enhanced_df.columns and pd.notna(enhanced_df.at[idx, 'Asset Name']) else ticker
            enhanced_df.at[idx, 'Sector'] = enhanced_df.at[idx, 'Sector'] if 'Sector' in enhanced_df.columns and pd.notna(enhanced_df.at[idx, 'Sector']) else 'Other'
            enhanced_df.at[idx, 'Beta'] = 1.0
            enhanced_df.at[idx, 'Daily Change'] = 0.0
            enhanced_df.at[idx, 'Daily Change %'] = 0.0
            enhanced_df.at[idx, '5D Return %'] = 0.0
            enhanced_df.at[idx, 'Volume'] = 0
            enhanced_df.at[idx, 'Analyst Rating'] = 'No Coverage'
            enhanced_df.at[idx, 'Price Target'] = None
            enhanced_df.at[idx, 'Quality Score'] = 5.0
            continue

        # Convert EE ticker format to Yahoo Finance format for API calls
        # EQU.ZA.BTI → BTI.JO (for JSE stocks)
        yahoo_ticker = ticker
        if ticker.startswith('EQU.ZA.'):
            # Extract base ticker and add .JO for JSE
            base_ticker = ticker.replace('EQU.ZA.', '')
            yahoo_ticker = f"{base_ticker}.JO"
        elif ticker.startswith('EC10.EC.'):
            # EasyCrypto tickers - skip Yahoo Finance (crypto)
            yahoo_ticker = None

        if yahoo_ticker:
            _ticker_start = _enrich_time.time()
            market_data_result = fetch_market_data(yahoo_ticker)
            _ticker_elapsed = _enrich_time.time() - _ticker_start

            if _ticker_elapsed > 5:
                print(f"[HOLDINGS] SLOW: {yahoo_ticker} took {_ticker_elapsed:.1f}s for market data", flush=True)

            if market_data_result:
                # Only set Asset Name if not already set (EE provides 'Name')
                if 'Asset Name' not in enhanced_df.columns or pd.isna(enhanced_df.at[idx, 'Asset Name']):
                    enhanced_df.at[idx, 'Asset Name'] = market_data_result['company_name']

                # Set market data (Beta, Daily Change, etc.)
                enhanced_df.at[idx, 'Daily Change'] = market_data_result['daily_change']
                enhanced_df.at[idx, 'Daily Change %'] = market_data_result['daily_change_pct']
                enhanced_df.at[idx, '5D Return %'] = market_data_result['five_day_return']
                enhanced_df.at[idx, 'Beta'] = market_data_result.get('beta', 1.0)
                enhanced_df.at[idx, 'Volume'] = market_data_result.get('volume', 0)
                base_sector = market_data_result.get('sector', 'Unknown')
                enhanced_df.at[idx, 'Sector'] = classify_ticker_sector(yahoo_ticker, base_sector)

                # For EE portfolios, DON'T overwrite Current Price
                # EE's price is accurate for their platform, Yahoo might differ
                if not is_ee_portfolio:
                    enhanced_df.at[idx, 'Current Price'] = market_data_result['price']
            else:
                # Yahoo Finance fetch failed - set defaults
                enhanced_df.at[idx, 'Asset Name'] = enhanced_df.at[idx, 'Asset Name'] if 'Asset Name' in enhanced_df.columns and pd.notna(enhanced_df.at[idx, 'Asset Name']) else ticker
                enhanced_df.at[idx, 'Sector'] = 'Other'
                enhanced_df.at[idx, 'Beta'] = 1.0
                enhanced_df.at[idx, 'Daily Change'] = 0.0
                enhanced_df.at[idx, 'Daily Change %'] = 0.0
                enhanced_df.at[idx, '5D Return %'] = 0.0
                enhanced_df.at[idx, 'Volume'] = 0

        # Fetch analyst data for all portfolios
        analyst_data = fetch_analyst_data(yahoo_ticker if yahoo_ticker else ticker)
        if analyst_data['success']:
            enhanced_df.at[idx, 'Analyst Rating'] = analyst_data['rating']
            enhanced_df.at[idx, 'Price Target'] = analyst_data['target_price']
        else:
            enhanced_df.at[idx, 'Analyst Rating'] = 'No Coverage'
            enhanced_df.at[idx, 'Price Target'] = None

        # Calculate Quality Score for all portfolios
        info = fetch_stock_info(yahoo_ticker if yahoo_ticker else ticker)
        if info:
            enhanced_df.at[idx, 'Quality Score'] = calculate_quality_score(ticker, info)
        else:
            enhanced_df.at[idx, 'Quality Score'] = 5.0

        _enriched_count += 1

    _total_elapsed = _enrich_time.time() - _enrich_start
    print(f"[HOLDINGS] Enrichment complete: {_enriched_count}/{_total_tickers} enriched, {_skipped_count} skipped ({_total_elapsed:.1f}s)", flush=True)

    enhanced_df['Sector'] = enhanced_df['Sector'].fillna('Other')

    # CRITICAL SPLIT: Different calculation logic for manual vs EE portfolios
    if not is_ee_portfolio:
        # MANUAL UPLOADS: Calculate totals from shares × prices
        enhanced_df['Shares'] = enhanced_df['Shares'].round(0).astype(int)
        enhanced_df['Total Cost'] = enhanced_df['Shares'] * enhanced_df['Avg Cost']
        enhanced_df['Total Value'] = enhanced_df['Shares'] * enhanced_df['Current Price']
        enhanced_df['Total Gain/Loss $'] = enhanced_df['Total Value'] - enhanced_df['Total Cost']
        enhanced_df['Total Gain/Loss %'] = ((enhanced_df['Current Price'] - enhanced_df['Avg Cost']) / enhanced_df['Avg Cost']) * 100
        enhanced_df['Daily P&L $'] = enhanced_df['Shares'] * enhanced_df['Daily Change']
    else:
        # EASY EQUITIES: Use EE's totals directly - DON'T RECALCULATE!
        # EE already provides correct Total Value, Total Cost, Unrealized_PnL

        # Map EE columns to ATLAS display columns (already done in column_mapping above)
        if 'Unrealized_PnL' in enhanced_df.columns:
            enhanced_df['Total Gain/Loss $'] = enhanced_df['Unrealized_PnL']

        if 'Unrealized_PnL_Pct' in enhanced_df.columns:
            enhanced_df['Total Gain/Loss %'] = enhanced_df['Unrealized_PnL_Pct']

        # For Daily P&L, calculate from Yahoo Finance Daily Change if available
        if 'Daily Change' in enhanced_df.columns and 'Shares' in enhanced_df.columns:
            enhanced_df['Daily P&L $'] = enhanced_df['Shares'] * enhanced_df['Daily Change']
        else:
            enhanced_df['Daily P&L $'] = 0.0

        # Set Asset Name from EE's 'Name' column if available
        if 'Name' in enhanced_df.columns and 'Asset Name' not in enhanced_df.columns:
            enhanced_df['Asset Name'] = enhanced_df['Name']

    # CRITICAL FIX: Add DUAL weight columns (equity-based AND gross-based)
    gross_exposure = enhanced_df['Total Value'].sum()

    # Get equity from performance history or session state
    metrics = get_current_portfolio_metrics()
    if metrics and metrics.get('equity', 0) > 0:
        equity = metrics['equity']
    else:
        equity = st.session_state.get('equity_capital', gross_exposure)  # Fallback to gross if no equity set

    # Weight % of Equity - can exceed 100% with leverage!
    enhanced_df['Weight % of Equity'] = (enhanced_df['Total Value'] / equity * 100) if equity > 0 else 0

    # Weight % of Gross Exposure - always sums to 100%
    enhanced_df['Weight % of Gross'] = (enhanced_df['Total Value'] / gross_exposure * 100) if gross_exposure > 0 else 0

    # Keep legacy 'Weight %' for backwards compatibility (use gross-based)
    enhanced_df['Weight %'] = enhanced_df['Weight % of Gross']

    return enhanced_df


def create_top_contributors_chart(df, top_n=5, use_professional_theme=True):
    """Top contributors in PERCENTAGE terms - Professional Blue theme"""
    top_contributors = df.nlargest(top_n, 'Total Gain/Loss %')[['Ticker', 'Asset Name', 'Total Gain/Loss $', 'Total Gain/Loss %']]

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        bar_color = '#00E676'
        border_color = 'rgba(67, 160, 71, 0.3)'
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
    else:
        bar_color = COLORS['success']
        border_color = COLORS['border']
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'

    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=top_contributors['Total Gain/Loss %'],
        y=top_contributors['Ticker'],
        orientation='h',
        marker=dict(
            color=bar_color,
            line=dict(color=border_color, width=1)
        ),
        text=[f"{x:+.1f}%" for x in top_contributors['Total Gain/Loss %']],
        textposition='outside',
        textfont=dict(size=11, family='JetBrains Mono', color=text_color),
        hovertemplate='<b>%{y}</b><br>Return: %{x:.2f}%<extra></extra>',
        width=0.6
    ))

    fig.update_layout(
        title=dict(text="🎯 Top 5 Contributors", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        xaxis=dict(title="Total Return (%)", showgrid=True, gridcolor=grid_color,
                   tickfont=dict(size=10, color=text_color, family='JetBrains Mono')),
        yaxis=dict(tickfont=dict(size=11, color=text_color)),
        height=350,
        showlegend=False,
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=80, r=60, t=60, b=50)
    )

    if not use_professional_theme:
        apply_chart_theme(fig)
    return fig


def create_top_detractors_chart(df, top_n=5, use_professional_theme=True):
    """Top detractors in PERCENTAGE terms - Professional Blue theme"""
    top_detractors = df.nsmallest(top_n, 'Total Gain/Loss %')[['Ticker', 'Asset Name', 'Total Gain/Loss $', 'Total Gain/Loss %']]

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        bar_color = '#FF1744'
        border_color = 'rgba(229, 57, 53, 0.3)'
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
    else:
        bar_color = COLORS['danger']
        border_color = COLORS['border']
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'

    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=top_detractors['Total Gain/Loss %'],
        y=top_detractors['Ticker'],
        orientation='h',
        marker=dict(
            color=bar_color,
            line=dict(color=border_color, width=1)
        ),
        text=[f"{x:.1f}%" for x in top_detractors['Total Gain/Loss %']],
        textposition='outside',
        textfont=dict(size=11, family='JetBrains Mono', color=text_color),
        hovertemplate='<b>%{y}</b><br>Loss: %{x:.2f}%<extra></extra>',
        width=0.6
    ))

    fig.update_layout(
        title=dict(text="⚠️ Top 5 Detractors", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        xaxis=dict(title="Total Return (%)", showgrid=True, gridcolor=grid_color,
                   tickfont=dict(size=10, color=text_color, family='JetBrains Mono')),
        yaxis=dict(tickfont=dict(size=11, color=text_color)),
        height=350,
        showlegend=False,
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=80, r=60, t=60, b=50)
    )

    if not use_professional_theme:
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
    colors = ['#818cf8', '#00ff88', '#ff6b00', '#b794f6', '#ff00ff',
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
        height=CHART_HEIGHT_STANDARD,  # P1-4: Standardized height
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


def create_professional_sector_allocation_pie(df, use_professional_theme=True):
    """
    PROFESSIONAL sector allocation pie chart - Institutional grade
    - Clean, modern design (Professional Blue or Dark theme)
    - Proper label positioning
    - Subtle gradients
    - No clutter
    """
    sector_allocation = df.groupby('Sector')['Total Value'].sum()
    total_value = sector_allocation.sum()
    sector_pct = (sector_allocation / total_value * 100).round(1)

    # Sort by value
    sector_pct = sector_pct.sort_values(ascending=False)

    # Use dark theme if available
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        # Dark theme with neon colors
        colors = PROFESSIONAL_CHART_COLORS[:len(sector_pct)]
        text_color = '#FFFFFF'
        border_color = 'rgba(99, 102, 241, 0.15)'
        paper_bg = 'rgba(0,0,0,0)'
        plot_bg = 'rgba(0,0,0,0)'
        legend_font_color = '#FFFFFF'
        title_color = '#FFFFFF'
    else:
        # Fallback to dark neon theme
        colors = [
            '#818cf8', '#0080ff', '#00ffcc', '#00ff88', '#ffaa00',
            '#ff6b00', '#b794f6', '#ff00ff', '#818cf8', '#0080ff', '#00ffcc'
        ][:len(sector_pct)]
        text_color = '#ffffff'
        border_color = '#000000'
        paper_bg = 'rgba(0, 0, 0, 0)'
        plot_bg = 'rgba(10, 25, 41, 0.3)'
        legend_font_color = '#ffffff'
        title_color = '#ffffff'

    fig = go.Figure(data=[go.Pie(
        labels=sector_pct.index,
        values=sector_pct.values,
        hole=0.4,  # Donut style - more modern
        marker=dict(
            colors=colors,
            line=dict(color=border_color, width=2)  # Clean borders
        ),
        textposition='outside' if use_professional_theme else 'auto',
        textinfo='label+percent',
        textfont=dict(
            size=12,
            color=text_color,
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
            font=dict(size=16, color=title_color, family='Inter'),
            x=0.02,
            xanchor='left'
        ),
        showlegend=True,
        legend=dict(
            orientation="v",
            yanchor="middle",
            y=0.5,
            xanchor="right",
            x=1.15,
            bgcolor='rgba(255,255,255,0)' if use_professional_theme else 'rgba(0,0,0,0)',
            font=dict(size=11, color=legend_font_color)
        ),
        paper_bgcolor=paper_bg,
        plot_bgcolor=plot_bg,
        height=450,
        margin=dict(l=20, r=150, t=60, b=20)
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
        plot_bgcolor='rgba(0,0,0,0)',
        height=500,
        margin=dict(l=150, r=100, t=80, b=60),
        showlegend=False
    )

    return fig


def create_rolling_metrics_chart(returns, window=60, use_professional_theme=True):
    """Rolling metrics visualization - Professional Blue theme"""
    if not is_valid_series(returns) or len(returns) < window:
        return None

    rolling_vol = returns.rolling(window).std() * np.sqrt(252) * 100
    rolling_sharpe = (returns.rolling(window).mean() * 252 - RISK_FREE_RATE) / (returns.rolling(window).std() * np.sqrt(252))

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        vol_color = '#FF1744'
        vol_fill = 'rgba(229, 57, 53, 0.15)'
        sharpe_color = '#818cf8'
        sharpe_fill = 'rgba(30, 136, 229, 0.15)'
        line_color = 'rgba(255, 255, 255, 0.5)'
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
    else:
        vol_color = COLORS['danger']
        vol_fill = 'rgba(255, 0, 68, 0.2)'
        sharpe_color = COLORS['neon_blue']
        sharpe_fill = 'rgba(99, 102, 241, 0.2)'
        line_color = COLORS['text_muted']
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'

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
            fillcolor=vol_fill,
            line=dict(color=vol_color, width=2, shape='spline'),
            name='Volatility'
        ),
        row=1, col=1
    )

    fig.add_trace(
        go.Scatter(
            x=rolling_sharpe.index,
            y=rolling_sharpe.values,
            fill='tozeroy',
            fillcolor=sharpe_fill,
            line=dict(color=sharpe_color, width=2, shape='spline'),
            name='Sharpe Ratio'
        ),
        row=2, col=1
    )

    fig.add_hline(y=0, line_dash="dash", line_color=line_color, row=2, col=1)

    fig.update_layout(
        height=550,
        showlegend=False,
        title=dict(text="📊 Rolling Risk Metrics", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=60, r=30, t=60, b=40)
    )

    # Update axes styling
    fig.update_xaxes(showgrid=True, gridcolor=grid_color, tickfont=dict(size=10, color=text_color))
    fig.update_yaxes(showgrid=True, gridcolor=grid_color, tickfont=dict(size=10, color=text_color, family='JetBrains Mono'))

    # Update subplot titles
    for annotation in fig['layout']['annotations']:
        annotation['font'] = dict(size=12, color=title_color, family='Inter')

    if not use_professional_theme:
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


def create_var_waterfall(returns, use_professional_theme=True):
    """VaR/CVaR waterfall chart - Professional Blue theme"""
    if not is_valid_series(returns) or len(returns) < 2:
        return None

    var_90 = calculate_var(returns, 0.90)
    var_95 = calculate_var(returns, 0.95)
    var_99 = calculate_var(returns, 0.99)
    cvar_95 = calculate_cvar(returns, 0.95)

    categories = ['VaR 90%', 'VaR 95%', 'VaR 99%', 'CVaR 95%']
    values = [var_90, var_95, var_99, cvar_95]

    # Theme colors - graduated risk scale
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        colors_list = ['#FFC400', '#F57C00', '#FF1744', '#FF1744']
        border_color = 'rgba(255, 255, 255, 0.5)'
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
    else:
        colors_list = [COLORS['warning'], COLORS['orange'], COLORS['danger'], COLORS['danger']]
        border_color = COLORS['border']
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'

    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=categories,
        y=values,
        marker=dict(
            color=colors_list,
            line=dict(color=border_color, width=1)
        ),
        text=[f"{v:.2f}%" for v in values],
        textposition='outside',
        textfont=dict(size=11, family='JetBrains Mono', color=text_color)
    ))

    fig.update_layout(
        title=dict(text="⚠️ Value at Risk Analysis", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        xaxis=dict(title="Risk Measure", showgrid=False, tickfont=dict(size=11, color=text_color)),
        yaxis=dict(title="Expected Loss (%)", showgrid=True, gridcolor=grid_color,
                   tickfont=dict(size=10, color=text_color, family='JetBrains Mono')),
        height=400,
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=60, r=30, t=60, b=50)
    )

    if not use_professional_theme:
        apply_chart_theme(fig)
    return fig


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


def create_rolling_var_cvar_chart(returns, window=60, use_professional_theme=True):
    """Rolling VaR and CVaR time series - Professional Blue theme"""
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

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        var_color = '#FFC400'
        cvar_color = '#FF1744'
        line_color = 'rgba(255, 255, 255, 0.5)'
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
        legend_bg = 'rgba(26, 29, 41, 0.9)'
    else:
        var_color = COLORS['orange']
        cvar_color = COLORS['danger']
        line_color = COLORS['text_muted']
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'
        legend_bg = 'rgba(0, 0, 0, 0)'

    fig = go.Figure()

    # Add VaR trace
    fig.add_trace(go.Scatter(
        x=dates,
        y=rolling_var_95,
        name='VaR 95%',
        line=dict(color=var_color, width=2, shape='spline'),
        mode='lines'
    ))

    # Add CVaR trace
    fig.add_trace(go.Scatter(
        x=dates,
        y=rolling_cvar_95,
        name='CVaR 95%',
        line=dict(color=cvar_color, width=2, dash='dash', shape='spline'),
        mode='lines'
    ))

    # Add zero line
    fig.add_hline(y=0, line_dash="dot", line_color=line_color, line_width=1)

    fig.update_layout(
        title=dict(text=f"📊 Rolling VaR & CVaR ({window}-Day)", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        xaxis=dict(title="Date", showgrid=True, gridcolor=grid_color, tickfont=dict(size=10, color=text_color)),
        yaxis=dict(title="Expected Loss (%)", showgrid=True, gridcolor=grid_color,
                   tickfont=dict(size=10, color=text_color, family='JetBrains Mono')),
        height=450,
        hovermode='x unified',
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=60, r=30, t=60, b=50),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            bgcolor=legend_bg,
            font=dict(size=11, color=text_color)
        )
    )

    if not use_professional_theme:
        apply_chart_theme(fig)
    return fig


def create_risk_contribution_sunburst(df):
    """Risk contribution sunburst - ENHANCED THEMING"""
    risk_data = []

    for _, row in df.iterrows():
        ticker = row.get('Ticker', 'Unknown')
        # Handle missing or zero Weight %
        weight = row.get('Weight %', 0)
        if pd.isna(weight) or weight <= 0:
            # Try to calculate weight from Total Value
            if 'Total Value' in df.columns:
                total_portfolio = df['Total Value'].sum()
                if total_portfolio > 0:
                    weight = (row.get('Total Value', 0) / total_portfolio) * 100
                else:
                    weight = 0
            else:
                weight = 0

        sector = row.get('Sector', 'Unknown')
        if pd.isna(sector) or sector == '':
            sector = 'Unknown'

        hist_data = fetch_historical_data(ticker, datetime.now() - timedelta(days=365), datetime.now())
        if hist_data is not None and len(hist_data) > 30:
            returns = hist_data['Close'].pct_change().dropna()
            vol = returns.std() * np.sqrt(252) * 100
            # Ensure positive risk contribution (use absolute value, minimum 0.01)
            risk_contribution = max(abs(weight * vol), 0.01) if weight > 0 else 0.01

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

    # Safety check: ensure Risk Contribution sum is positive
    total_risk = risk_df['Risk Contribution'].sum()
    if total_risk <= 0:
        return None

    try:
        fig = px.sunburst(
            risk_df,
            path=['Sector', 'Ticker'],
            values='Risk Contribution',
            color='Volatility',
            color_continuous_scale='RdYlGn_r',
            title="Risk Contribution Sunburst"
        )

        fig.update_layout(height=600)
        apply_chart_theme(fig)
        return fig
    except Exception as e:
        print(f"Sunburst chart failed: {e}")
        return None


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
        height=CHART_HEIGHT_STANDARD  # P1-4: Standardized height
    )
    
    apply_chart_theme(fig)
    return fig


def create_performance_heatmap(df, period='monthly', use_professional_theme=True):
    """Performance heatmap - Professional Blue theme"""
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

        # ===== FIX #6: Remove Empty Columns from Heatmap =====
        # Convert to numpy array for easier column operations
        matrix_array = np.array(matrix)

        # Find columns where all values are zero
        non_zero_cols = []
        filtered_months = []

        for i, month in enumerate(months):
            # Check if this column has any non-zero values
            if np.any(np.abs(matrix_array[:, i]) > 0.01):
                non_zero_cols.append(i)
                filtered_months.append(month)

        # Filter matrix to keep only non-zero columns
        if len(non_zero_cols) > 0:
            filtered_matrix = matrix_array[:, non_zero_cols].tolist()
            months = filtered_months
            matrix = filtered_matrix
            print(f"✅ Filtered heatmap: kept {len(filtered_months)} non-empty months")

        # Theme colors
        if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
            title_color = '#FFFFFF'
            text_color = '#FFFFFF'
            paper_bg = 'rgba(0,0,0,0)'
            colorscale = 'Spectral_r'
        else:
            title_color = '#ffffff'
            text_color = '#ffffff'
            paper_bg = 'rgba(0, 0, 0, 0)'
            colorscale = 'Spectral_r'

        fig = go.Figure(data=go.Heatmap(
            z=matrix,
            x=months,
            y=tickers,
            colorscale=colorscale,
            zmid=0,
            zmin=-20,
            zmax=20,
            text=np.round(matrix, 1),
            texttemplate='%{text}%',
            textfont={"size": 11, "family": "JetBrains Mono", "color": "white"},
            colorbar=dict(title=dict(text="Return %", font=dict(family='JetBrains Mono', size=11, color='white')), tickfont=dict(family='JetBrains Mono', size=10, color='white'))
        ))

        fig.update_layout(
            title=dict(text="🔥 Monthly Performance Heatmap", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
            xaxis=dict(title="Month", tickfont=dict(size=10, color=text_color)),
            yaxis=dict(title="Asset", tickfont=dict(size=10, color=text_color)),
            height=600,
            paper_bgcolor=paper_bg,
            plot_bgcolor=paper_bg,
            font=dict(family='Inter', color=text_color),
            margin=dict(l=80, r=80, t=60, b=50)
        )

        if not use_professional_theme:
            apply_chart_theme(fig)
        return fig
    except Exception as e:
        st.error(f"Error: {str(e)}")
        return None


def create_portfolio_heatmap(df, use_professional_theme=True):
    """Portfolio treemap - Professional Blue theme"""
    df_viz = df[['Ticker', 'Asset Name', 'Weight %', 'Total Gain/Loss %', 'Sector']].copy()
    df_viz['Sector'] = df_viz['Sector'].fillna('Other')
    df_viz = df_viz.dropna()

    if df_viz.empty:
        return None

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        colorscale = [[0, '#ec4899'], [0.25, '#a855f7'], [0.5, '#1e293b'], [0.75, '#06b6d4'], [1, '#10b981']]
    else:
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        colorscale = [[0, '#ec4899'], [0.25, '#a855f7'], [0.5, '#1e293b'], [0.75, '#06b6d4'], [1, '#10b981']]

    fig = px.treemap(
        df_viz,
        path=[px.Constant("Portfolio"), 'Sector', 'Ticker'],
        values='Weight %',
        color='Total Gain/Loss %',
        color_continuous_scale=colorscale,
        color_continuous_midpoint=0,
        hover_data={'Asset Name': True, 'Total Gain/Loss %': ':.2f'}
    )

    fig.update_layout(
        title=dict(text="🗺️ Portfolio Heatmap", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        height=600,
        paper_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=20, r=20, t=60, b=30)
    )

    fig.update_traces(textfont=dict(family='Inter', size=11))

    if not use_professional_theme:
        apply_chart_theme(fig)
    return fig


def create_interactive_performance_chart(tickers, start_date, end_date, use_professional_theme=True):
    """Interactive performance chart - Professional Blue theme"""
    fig = go.Figure()

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        colors = PROFESSIONAL_CHART_COLORS
        line_color = 'rgba(255, 255, 255, 0.5)'
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
        legend_bg = 'rgba(26, 29, 41, 0.9)'
    else:
        colors = [COLORS['neon_blue'], COLORS['electric_blue'], COLORS['teal'],
                  COLORS['success'], COLORS['warning'], COLORS['danger'],
                  COLORS['purple'], COLORS['pink'], COLORS['orange']]
        line_color = COLORS['text_muted']
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'
        legend_bg = 'rgba(0, 0, 0, 0)'

    for idx, ticker in enumerate(tickers):
        cumulative, data = fetch_ticker_performance(ticker, start_date, end_date)
        if cumulative is not None:
            fig.add_trace(go.Scatter(
                x=cumulative.index,
                y=cumulative.values,
                mode='lines',
                name=ticker,
                line=dict(width=2, color=colors[idx % len(colors)], shape='spline')
            ))

    if not fig.data:
        return None

    fig.update_layout(
        title=dict(text="📈 Performance Comparison", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        xaxis=dict(title="Date", showgrid=True, gridcolor=grid_color, tickfont=dict(size=10, color=text_color)),
        yaxis=dict(title="Cumulative Return (%)", showgrid=True, gridcolor=grid_color,
                   tickfont=dict(size=10, color=text_color, family='JetBrains Mono')),
        height=500,
        hovermode='x unified',
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=60, r=30, t=60, b=50),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="left",
            x=0,
            bgcolor=legend_bg,
            font=dict(size=11, color=text_color)
        )
    )

    fig.add_hline(y=0, line_dash="dash", line_color=line_color, line_width=1)

    if not use_professional_theme:
        apply_chart_theme(fig)
    return fig


def create_monte_carlo_chart(simulation_results, initial_value=100000, use_professional_theme=True):
    if simulation_results is None:
        return None, None

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        sim_color = 'rgba(30, 136, 229, 0.1)'
        colors_pct = ['#FF1744', '#FFC400',
                      '#818cf8', '#a5b4fc', '#00E676']
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
        legend_bg = 'rgba(26, 29, 41, 0.9)'
    else:
        sim_color = COLORS['electric_blue']
        colors_pct = [COLORS['danger'], COLORS['warning'], COLORS['info'],
                      COLORS['teal'], COLORS['success']]
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'
        legend_bg = 'rgba(0, 0, 0, 0)'

    fig = go.Figure()

    for i in range(min(100, len(simulation_results))):
        fig.add_trace(go.Scatter(
            y=simulation_results[i],
            mode='lines',
            line=dict(width=0.5, color=sim_color),
            opacity=0.1 if not use_professional_theme else 1,
            showlegend=False
        ))

    percentiles = [5, 25, 50, 75, 95]

    for p, color in zip(percentiles, colors_pct):
        values = np.percentile(simulation_results, p, axis=0)
        fig.add_trace(go.Scatter(
            y=values,
            mode='lines',
            line=dict(width=2.5, color=color, shape='spline'),
            name=f'{p}th Percentile'
        ))

    fig.update_layout(
        title=dict(text="🎲 Monte Carlo Simulation", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        xaxis=dict(title="Trading Days", showgrid=True, gridcolor=grid_color, tickfont=dict(size=10, color=text_color)),
        yaxis=dict(title="Portfolio Value ($)", showgrid=True, gridcolor=grid_color,
                   tickfont=dict(size=10, color=text_color, family='JetBrains Mono')),
        height=450,
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=70, r=30, t=60, b=50),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            bgcolor=legend_bg,
            font=dict(size=10, color=text_color)
        )
    )

    if not use_professional_theme:
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

    # FIX: Format treasury yields as percentages, not dollars
    # Treasury yield INDICES (^TNX, ^TYX, etc.) show yield values as percentages
    # Bond ETFs show prices as dollars
    def format_last_value(row):
        raw_ticker = row.get('_raw_ticker', '')
        # Yield indices starting with ^ and containing treasury/yield info
        is_yield_index = (raw_ticker.startswith('^') and
                         row.get('Category') == 'Government Bonds')

        if is_yield_index:
            # Treasury yields are already in percentage points (e.g., 4.5 = 4.5%)
            return f"{row['Last']:.2f}%"
        else:
            return format_currency(row['Last'])

    display_df['Last'] = display_df.apply(format_last_value, axis=1)
    display_df['Change %'] = display_df['Change %'].apply(lambda x: add_arrow_indicator(format_percentage(x)))
    display_df['5D %'] = display_df['5D %'].apply(lambda x: add_arrow_indicator(format_percentage(x)))
    display_df['Volume'] = display_df['Volume'].apply(lambda x: f"{x:,.0f}")
    display_df['Vol/Avg'] = display_df['Vol/Avg'].apply(lambda x: f"{x:.2f}x")

    # Remove internal column before displaying
    if '_raw_ticker' in display_df.columns:
        display_df = display_df.drop('_raw_ticker', axis=1)

    return display_df


def create_sector_rotation_heatmap(df, start_date, end_date, use_professional_theme=True):
    """Sector rotation heatmap - Professional Blue theme"""
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
    
    # Theme colors - Magenta-Cyan gradient (vibrant, LinkedIn-ready)
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        colorscale = 'Spectral_r'
    else:
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        colorscale = 'Spectral_r'

    fig = go.Figure(data=go.Heatmap(
        z=matrix,
        x=[m.strftime('%b %Y') for m in months],
        y=sectors,
        colorscale=colorscale,
        zmid=0,
        text=np.round(matrix, 1),
        texttemplate='%{text}%',
        textfont={"size": 10, "family": "JetBrains Mono", "color": "white"},
        colorbar=dict(title=dict(text="Return %", font=dict(family='JetBrains Mono', size=11, color='white')), tickfont=dict(family='JetBrains Mono', size=10, color='white'))
    ))

    fig.update_layout(
        title=dict(text="🔄 Sector Rotation Heatmap", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        xaxis=dict(title="Month", tickfont=dict(size=10, color=text_color)),
        yaxis=dict(title="Sector", tickfont=dict(size=10, color=text_color)),
        height=450,
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=100, r=80, t=60, b=50)
    )

    if not use_professional_theme:
        apply_chart_theme(fig)
    return fig


def create_holdings_attribution_waterfall(df, use_professional_theme=True):
    """Holdings attribution waterfall - Professional Blue theme"""
    top_contributors = df.nlargest(10, 'Total Gain/Loss $')

    tickers = top_contributors['Ticker'].tolist()
    contributions = top_contributors['Total Gain/Loss $'].tolist()

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        connector_color = 'rgba(255, 255, 255, 0.5)'
        success_color = '#00E676'
        danger_color = '#FF1744'
        total_color = '#818cf8'
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
    else:
        connector_color = COLORS['neon_blue']
        success_color = COLORS['success']
        danger_color = COLORS['danger']
        total_color = COLORS['electric_blue']
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'

    fig = go.Figure()

    fig.add_trace(go.Waterfall(
        name="Attribution",
        orientation="v",
        x=tickers,
        y=contributions,
        textfont=dict(size=10, family='JetBrains Mono', color=text_color),
        connector={"line": {"color": connector_color, "width": 2}},
        decreasing={"marker": {"color": danger_color}},
        increasing={"marker": {"color": success_color}},
        totals={"marker": {"color": total_color}}
    ))

    fig.update_layout(
        title=dict(text="💧 Holdings Attribution Waterfall", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        xaxis=dict(title="Ticker", tickfont=dict(size=10, color=text_color)),
        yaxis=dict(title="Contribution ($)", showgrid=True, gridcolor=grid_color,
                   tickfont=dict(size=10, color=text_color, family='JetBrains Mono')),
        height=400,
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=70, r=30, t=60, b=50)
    )

    if not use_professional_theme:
        apply_chart_theme(fig)
    return fig


def create_concentration_gauge(df, use_professional_theme=True):
    """Concentration gauge - Professional Blue or Dark theme"""
    top_5_weight = df.nlargest(5, 'Weight %')['Weight %'].sum()

    # Use dark theme if available
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        bar_color = '#818cf8'
        success_color = '#69F0AE'  # Light green
        warning_color = '#FFD740'  # Light amber
        danger_color = '#FF5252'   # Light red
        title_color = '#FFFFFF'
        number_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        delta_color = '#FFC400'
        threshold_color = '#FF1744'
        tick_color = 'rgba(255, 255, 255, 0.5)'
    else:
        bar_color = COLORS['neon_blue']
        success_color = COLORS['success']
        warning_color = COLORS['warning']
        danger_color = COLORS['danger']
        title_color = '#ffffff'
        number_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        delta_color = COLORS['warning']
        threshold_color = 'red'
        tick_color = '#94a3b8'

    fig = go.Figure(go.Indicator(
        mode="gauge+number+delta",
        value=top_5_weight,
        title={'text': "Top 5 Concentration", 'font': {'color': title_color, 'size': 16, 'family': 'Inter'}},
        number={'font': {'color': number_color, 'size': 32, 'family': 'JetBrains Mono'}},
        delta={'reference': 50, 'increasing': {'color': delta_color}},
        gauge={
            'axis': {'range': [0, 100], 'tickfont': {'color': tick_color, 'size': 10}},
            'bar': {'color': bar_color, 'thickness': 0.75},
            'bgcolor': '#242838' if use_professional_theme else 'rgba(0,0,0,0)',
            'borderwidth': 0,
            'steps': [
                {'range': [0, 30], 'color': success_color},
                {'range': [30, 50], 'color': warning_color},
                {'range': [50, 100], 'color': danger_color}
            ],
            'threshold': {
                'line': {'color': threshold_color, 'width': 3},
                'thickness': 0.75,
                'value': 70
            }
        }
    ))

    fig.update_layout(
        height=350,
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font={'family': 'Inter, sans-serif'}
    )

    if not use_professional_theme:
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


def create_factor_momentum_chart(factor_data, use_professional_theme=True):
    """Factor momentum chart - Professional Blue theme"""
    if factor_data is None or 'factor_returns' not in factor_data:
        return None

    factor_returns = factor_data['factor_returns']

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        colors = PROFESSIONAL_CHART_COLORS
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
        legend_bg = 'rgba(26, 29, 41, 0.9)'
    else:
        colors = [COLORS['neon_blue'], COLORS['electric_blue'], COLORS['teal'],
                  COLORS['success'], COLORS['purple'], COLORS['pink']]
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'
        legend_bg = 'rgba(0, 0, 0, 0)'

    fig = go.Figure()

    for idx, factor in enumerate(FACTOR_DEFINITIONS.keys()):
        if factor in factor_returns.columns:
            cumulative = (1 + factor_returns[factor]).cumprod() - 1
            fig.add_trace(go.Scatter(
                x=cumulative.index,
                y=cumulative.values * 100,
                mode='lines',
                name=factor,
                line=dict(width=2, color=colors[idx % len(colors)], shape='spline')
            ))

    fig.update_layout(
        title=dict(text="📈 Factor Momentum", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        xaxis=dict(title="Date", showgrid=True, gridcolor=grid_color, tickfont=dict(size=10, color=text_color)),
        yaxis=dict(title="Cumulative Return (%)", showgrid=True, gridcolor=grid_color,
                   tickfont=dict(size=10, color=text_color, family='JetBrains Mono')),
        height=500,
        hovermode='x unified',
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=60, r=30, t=60, b=50),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="left",
            x=0,
            bgcolor=legend_bg,
            font=dict(size=11, color=text_color)
        )
    )

    if not use_professional_theme:
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
        fillcolor='rgba(99, 102, 241, 0.2)',
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


def create_dcf_waterfall(dcf_results, method='FCFF', use_professional_theme=True):
    """Create waterfall chart showing DCF buildup - Professional Blue theme"""

    categories = ['PV of Cash Flows', 'PV of Terminal Value']
    values = [dcf_results['total_pv_cash_flows'], dcf_results['pv_terminal']]

    if method == 'FCFF':
        categories.append('Enterprise Value')
        categories.append('Less: Net Debt')
        categories.append('Equity Value')
        values.append(dcf_results['enterprise_value'])
        values.append(-dcf_results.get('net_debt', 0))
        values.append(dcf_results['equity_value'])

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        connector_color = 'rgba(255, 255, 255, 0.5)'
        success_color = '#00E676'
        danger_color = '#FF1744'
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
    else:
        connector_color = COLORS['neon_blue']
        success_color = COLORS['success']
        danger_color = COLORS['danger']
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'

    fig = go.Figure(go.Waterfall(
        name="DCF Buildup",
        orientation="v",
        x=categories,
        y=values,
        textfont=dict(size=10, family='JetBrains Mono', color=text_color),
        connector={"line": {"color": connector_color, "width": 2}},
        decreasing={"marker": {"color": danger_color}},
        increasing={"marker": {"color": success_color}},
    ))

    fig.update_layout(
        title=dict(text=f"💎 {method} Valuation Buildup", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        xaxis=dict(tickfont=dict(size=10, color=text_color)),
        yaxis=dict(title="Value ($)", showgrid=True, gridcolor=grid_color,
                   tickfont=dict(size=10, color=text_color, family='JetBrains Mono')),
        height=450,
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=70, r=30, t=60, b=50)
    )

    if not use_professional_theme:
        apply_chart_theme(fig)
    return fig


def create_cash_flow_chart(projections, method='FCFF', use_professional_theme=True):
    """Create bar chart of projected cash flows - Professional Blue theme"""

    # Handle DCFProjections object or list
    if not isinstance(projections, list):
        # If projections is a DCFProjections object, convert it to list format
        if hasattr(projections, 'forecast_years') and hasattr(projections, 'final_projections'):
            proj_list = []
            for year in range(1, projections.forecast_years + 1):
                year_data = projections.final_projections.get(year, {}) if isinstance(projections.final_projections, dict) else {}
                proj_list.append({
                    'year': year,
                    'fcff': year_data.get('fcff', 0),
                    'fcfe': year_data.get('fcfe', 0)
                })
            projections = proj_list
        else:
            # Can't convert, return empty chart
            st.warning("⚠️ Projections data format not recognized. Cannot display cash flow chart.")
            return go.Figure()

    cf_key = 'fcff' if method == 'FCFF' else 'fcfe'

    years = [proj['year'] for proj in projections]
    cash_flows = [proj[cf_key] for proj in projections]

    # Theme colors
    if use_professional_theme and PROFESSIONAL_THEME_AVAILABLE:
        bar_color = '#818cf8'
        border_color = 'rgba(30, 136, 229, 0.3)'
        title_color = '#FFFFFF'
        text_color = '#FFFFFF'
        paper_bg = 'rgba(0,0,0,0)'
        grid_color = 'rgba(99, 102, 241, 0.07)'
    else:
        bar_color = COLORS['electric_blue']
        border_color = COLORS['border']
        title_color = '#ffffff'
        text_color = '#ffffff'
        paper_bg = 'rgba(0, 0, 0, 0)'
        grid_color = 'rgba(99, 102, 241, 0.1)'

    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=years,
        y=cash_flows,
        marker_color=bar_color,
        name=method,
        marker=dict(line=dict(color=border_color, width=1)),
        textfont=dict(size=10, family='JetBrains Mono')
    ))

    fig.update_layout(
        title=dict(text=f"📊 Projected {method} by Year", font=dict(size=16, color=title_color, family='Inter'), x=0.02, xanchor='left'),
        xaxis=dict(title="Year", tickfont=dict(size=10, color=text_color)),
        yaxis=dict(title=f"{method} ($)", showgrid=True, gridcolor=grid_color,
                   tickfont=dict(size=10, color=text_color, family='JetBrains Mono')),
        height=350,
        paper_bgcolor=paper_bg,
        plot_bgcolor=paper_bg,
        font=dict(family='Inter', color=text_color),
        margin=dict(l=70, r=30, t=60, b=50)
    )

    if not use_professional_theme:
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
        colorscale='Spectral_r',
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


def apply_chart_theme(fig):
    """Apply dark theme with neon cyan accents to any Plotly figure

    IMPORTANT: This function is called on ALL charts to ensure:
    - Dark background (#1a1d29)
    - White text for all labels
    - Subtle grid lines
    - Proper contrast on dark pages
    """
    fig.update_layout(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(color='#FFFFFF', family='Inter, sans-serif'),
        title=dict(font=dict(color='#FFFFFF')),
        xaxis=dict(
            gridcolor='rgba(99, 102, 241, 0.07)',
            linecolor='rgba(99, 102, 241, 0.12)',
            zerolinecolor='rgba(99, 102, 241, 0.07)',
            tickfont=dict(color='#FFFFFF'),
            title=dict(font=dict(color='#FFFFFF')),
        ),
        yaxis=dict(
            gridcolor='rgba(99, 102, 241, 0.07)',
            linecolor='rgba(99, 102, 241, 0.12)',
            zerolinecolor='rgba(99, 102, 241, 0.07)',
            tickfont=dict(color='#FFFFFF'),
            title=dict(font=dict(color='#FFFFFF')),
        ),
        hoverlabel=dict(
            bgcolor='rgba(0,0,0,0)',
            font=dict(color='#FFFFFF'),
            bordercolor='#6366f1',
        ),
        legend=dict(
            font=dict(color='#FFFFFF'),
            bgcolor='rgba(26, 29, 41, 0.8)',
            bordercolor='rgba(0, 188, 212, 0.3)',
        ),
    )
    return fig


def make_scrollable_table(df, height=600, hide_index=True, use_container_width=True, column_config=None):
    """
    Make any dataframe horizontally scrollable with professional styling.

    Args:
        df: DataFrame to display
        height: Table height in pixels (default 600)
        hide_index: Whether to hide the index column (default True)
        use_container_width: Whether to use full container width (default True)
        column_config: Optional column configuration dict

    Returns:
        Streamlit dataframe component with horizontal scrolling enabled
    """
    # Inject CSS for horizontal scrolling
    st.markdown(
        """
        <style>
        /* Enable horizontal scrolling for all dataframes */
        div[data-testid="stDataFrame"] > div {
            overflow-x: auto !important;
            max-width: 100% !important;
        }

        /* Ensure table doesn't collapse */
        div[data-testid="stDataFrame"] table {
            min-width: 100% !important;
        }

        /* Better scrollbar styling */
        div[data-testid="stDataFrame"] > div::-webkit-scrollbar {
            height: 8px;
        }

        div[data-testid="stDataFrame"] > div::-webkit-scrollbar-track {
            background: #0a1929;
        }

        div[data-testid="stDataFrame"] > div::-webkit-scrollbar-thumb {
            background: #818cf8;
            border-radius: 4px;
        }

        div[data-testid="stDataFrame"] > div::-webkit-scrollbar-thumb:hover {
            background: #00ffcc;
        }
        </style>
        """,
        unsafe_allow_html=True
    )

    # Display the dataframe
    return st.dataframe(
        df,
        use_container_width=use_container_width,
        hide_index=hide_index,
        height=height,
        column_config=column_config
    )


def show_toast(message, toast_type="info", duration=3000):
    """Display a professional toast notification"""
    toast_styles = {
        "success": {"bg": "rgba(0, 255, 136, 0.95)", "border": "#00ff88", "icon": "✓"},
        "error": {"bg": "rgba(255, 0, 68, 0.95)", "border": "#ff0044", "icon": "✕"},
        "warning": {"bg": "rgba(255, 170, 0, 0.95)", "border": "#ffaa00", "icon": "⚠"},
        "info": {"bg": "rgba(99, 102, 241, 0.95)", "border": "#818cf8", "icon": "ℹ"}
    }
    style = toast_styles.get(toast_type, toast_styles["info"])
    toast_id = f"toast_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"

    toast_html = f"""
    <style>
        .atlas-toast-container {{ position: fixed; top: 80px; right: 20px; z-index: 999999; }}
        .atlas-toast {{ min-width: 300px; max-width: 500px; margin-bottom: 12px; padding: 16px 20px;
                       background: {style['bg']}; border: 2px solid {style['border']}; border-radius: 12px;
                       color: #000; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600;
                       animation: slideIn 0.4s ease-out, fadeOut 0.3s ease-in {duration-300}ms forwards; }}
        .atlas-toast-content {{ display: flex; align-items: center; gap: 12px; }}
        .atlas-toast-icon {{ font-size: 20px; }}
        @keyframes slideIn {{ from {{ transform: translateX(400px); opacity: 0; }}
                             to {{ transform: translateX(0); opacity: 1; }} }}
        @keyframes fadeOut {{ to {{ opacity: 0; transform: translateX(100px); }} }}
    </style>
    <div id="{toast_id}" class="atlas-toast">
        <div class="atlas-toast-content">
            <div class="atlas-toast-icon">{style['icon']}</div>
            <div>{message}</div>
        </div>
    </div>
    <script>
        (function() {{
            let container = document.querySelector('.atlas-toast-container');
            if (!container) {{
                container = document.createElement('div');
                container.className = 'atlas-toast-container';
                document.body.appendChild(container);
            }}
            const toast = document.getElementById('{toast_id}');
            if (toast) {{
                container.appendChild(toast);
                setTimeout(() => toast.remove(), {duration});
            }}
        }})();
    </script>
    """
    st.markdown(toast_html, unsafe_allow_html=True)


def display_trap_warnings(trap_summary: dict, ticker: str):
    """
    Display DCF trap detection warnings in user-friendly format

    Args:
        trap_summary: Summary dictionary from DCFTrapDetector.get_summary()
        ticker: Stock ticker symbol
    """
    if not trap_summary or trap_summary.get('total_warnings', 0) == 0:
        # No warnings - display success message
        st.success("""
        ✅ **No Value Trap Patterns Detected**

        The DCF valuation appears sound with no significant red flags. Assumptions look reasonable given the company's risk profile.
        """)
        return

    # Display warnings section
    st.markdown("---")
    st.markdown("### 🚨 DCF Trap Detection Analysis")

    # Overall summary
    max_severity = trap_summary.get('max_severity', 'LOW')
    overall_confidence = trap_summary.get('overall_confidence', 0)
    total_warnings = trap_summary.get('total_warnings', 0)

    # Severity color coding
    severity_colors = {
        'CRITICAL': '🔴',
        'HIGH': '🟠',
        'MEDIUM': '🟡',
        'LOW': '🟢'
    }

    severity_icon = severity_colors.get(max_severity, '🟢')

    # Display summary card
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric(
            "Overall Risk Level",
            f"{severity_icon} {max_severity}",
            delta=f"{total_warnings} warning(s)"
        )

    with col2:
        st.metric(
            "Detection Confidence",
            f"{overall_confidence*100:.0f}%"
        )

    with col3:
        severity_counts = trap_summary.get('severity_counts', {})
        critical_high = severity_counts.get('CRITICAL', 0) + severity_counts.get('HIGH', 0)
        status = "⚠️ Review Required" if critical_high > 0 else "✅ Monitor"
        st.metric("Action Required", status)

    # Overall recommendation
    recommendation = trap_summary.get('recommendation', '')

    if max_severity == 'CRITICAL':
        st.error(f"""
        **🚨 CRITICAL ISSUES DETECTED**

        {recommendation}
        """)
    elif max_severity == 'HIGH':
        st.warning(f"""
        **⚠️ HIGH RISK PATTERNS DETECTED**

        {recommendation}
        """)
    elif max_severity == 'MEDIUM':
        st.warning(f"""
        **⚠️ MODERATE RISK DETECTED**

        {recommendation}
        """)
    else:
        st.info(f"""
        **ℹ️ MINOR CONCERNS DETECTED**

        {recommendation}
        """)

    # Display individual warnings
    st.markdown("#### 📋 Detailed Warning Breakdown")

    warnings_list = trap_summary.get('warnings', [])

    for idx, warning in enumerate(warnings_list, 1):
        trap_type = warning.get('trap_type', 'UNKNOWN')
        severity = warning.get('severity', 'LOW')
        confidence = warning.get('confidence', 0)
        title = warning.get('title', 'Warning')
        description = warning.get('description', '')
        recommendation = warning.get('recommendation', '')
        metrics = warning.get('metrics', {})

        # Icon based on severity
        severity_icon = severity_colors.get(severity, '🟢')

        # Create expander for each warning
        with st.expander(f"{severity_icon} **{title}** (Confidence: {confidence*100:.0f}%)", expanded=(severity in ['CRITICAL', 'HIGH'])):
            st.markdown(f"**Severity:** {severity_icon} {severity}")
            st.markdown(f"**Confidence:** {confidence*100:.0f}%")

            st.markdown("---")
            st.markdown("**Description:**")
            st.markdown(description)

            # Display relevant metrics
            if metrics:
                st.markdown("---")
                st.markdown("**Key Metrics:**")

                # Format metrics nicely
                metrics_cols = st.columns(min(3, len(metrics)))

                metric_items = list(metrics.items())
                for i, (key, value) in enumerate(metric_items[:6]):  # Show max 6 metrics
                    col_idx = i % 3

                    # Format value based on type
                    if isinstance(value, float):
                        if 'percent' in key.lower() or 'growth' in key.lower() or 'margin' in key.lower():
                            formatted_value = f"{value*100:.1f}%"
                        elif value > 1000:
                            formatted_value = f"${value:,.0f}"
                        else:
                            formatted_value = f"{value:.2f}"
                    elif isinstance(value, dict) or isinstance(value, list):
                        formatted_value = str(value)[:50] + "..." if len(str(value)) > 50 else str(value)
                    else:
                        formatted_value = str(value)

                    # Format key (make it readable)
                    readable_key = key.replace('_', ' ').title()

                    with metrics_cols[col_idx]:
                        st.metric(readable_key, formatted_value)

            st.markdown("---")
            st.markdown("**Recommendation:**")
            st.info(recommendation)

    # Add actionable next steps
    st.markdown("---")
    st.markdown("#### 🎯 Recommended Actions")

    if max_severity in ['CRITICAL', 'HIGH']:
        st.markdown("""
        1. **Re-examine DCF assumptions** - Focus on flagged parameters
        2. **Run sensitivity analysis** - Test impact of adjusting problematic assumptions
        3. **Consider alternative valuation** - Use relative valuation or sum-of-parts
        4. **Seek additional validation** - Review with peers or use external benchmarks
        5. **Apply discount to valuation** - Haircut DCF result by 15-30% for safety margin
        """)
    elif max_severity == 'MEDIUM':
        st.markdown("""
        1. **Review flagged assumptions** - Verify they reflect economic reality
        2. **Run stress tests** - Model downside scenarios
        3. **Cross-check with peers** - Compare assumptions to industry benchmarks
        4. **Monitor catalysts** - Track whether assumed improvements materialize
        """)
    else:
        st.markdown("""
        1. **Monitor flagged metrics** - Keep eye on mentioned concerns
        2. **Validate with sensitivity analysis** - Test robustness of valuation
        3. **Proceed with normal diligence** - Valuation appears reasonable
        """)


def display_stock_attribution_table(stock_df):
    """
    Display stock-level attribution in glassmorphism styled cards.

    Parameters:
        stock_df: DataFrame from calculate_brinson_attribution_gics
    """
    # Top Contributors - Show Top 10
    top_contributors = stock_df.head(10)
    bottom_contributors = stock_df.tail(10).iloc[::-1]  # Reverse to show worst first

    from core.atlas_table_formatting import render_generic_table

    col_defs = [
        {'key': 'Ticker', 'label': 'Ticker', 'type': 'ticker'},
        {'key': 'GICS_Sector', 'label': 'Sector', 'type': 'text'},
        {'key': 'Weight %', 'label': 'Weight', 'type': 'percent'},
        {'key': 'Index Weight %', 'label': 'Index Wt', 'type': 'percent'},
        {'key': 'Return %', 'label': 'Return', 'type': 'change'},
        {'key': 'Return vs Sector', 'label': 'vs Sector', 'type': 'change'},
        {'key': 'Active Contribution %', 'label': 'Alpha Contrib', 'type': 'change'},
    ]

    top_html = '<div style="background: rgba(26, 35, 50, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 12px; padding: 20px; margin: 10px 0;">'
    top_html += '<h4 style="color: #818cf8; margin: 0 0 15px 0; font-family: \'Inter\', sans-serif; text-transform: uppercase; letter-spacing: 0.1em;">Top Alpha Contributors</h4>'
    top_html += render_generic_table(top_contributors, columns=col_defs)
    top_html += '</div>'

    bottom_html = '<div style="background: rgba(26, 35, 50, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255, 0, 107, 0.2); border-radius: 12px; padding: 20px; margin: 10px 0;">'
    bottom_html += '<h4 style="color: #ff006b; margin: 0 0 15px 0; font-family: \'Inter\', sans-serif; text-transform: uppercase; letter-spacing: 0.1em;">Top Alpha Detractors</h4>'
    bottom_html += render_generic_table(bottom_contributors, columns=col_defs)
    bottom_html += '</div>'

    return top_html, bottom_html


def display_attribution_validation(validation):
    """
    Display attribution validation/reconciliation info.
    Now shows data source (performance history vs point-in-time) and additional context.
    """
    is_valid = validation['is_reconciled']
    source = validation.get('source', 'unknown')

    # Color coding based on data source quality
    if source == 'performance_suite':
        # LINKED TO PERFORMANCE SUITE - Best quality
        status_color = '#00ff9d' if is_valid else '#ffd93d'
        status_icon = '✓' if is_valid else '⚠'
        source_badge = '<span style="background: #00ff9d; color: #0a0f1a; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; margin-left: 10px;">LINKED TO PERFORMANCE SUITE</span>'
    elif source == 'performance_history':
        status_color = '#00ff9d' if is_valid else '#ffd93d'
        status_icon = '✓' if is_valid else '⚠'
        source_badge = '<span style="background: #818cf8; color: #0a0f1a; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; margin-left: 10px;">FROM PERFORMANCE HISTORY</span>'
    else:
        status_color = '#ffd93d'
        status_icon = '⚠'
        source_badge = '<span style="background: #ffd93d; color: #0a0f1a; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; margin-left: 10px;">POINT-IN-TIME (Visit Performance Suite first)</span>'

    # Build additional info based on source
    additional_info = ""
    if source == 'performance_history' and validation.get('days'):
        days = validation.get('days', 0)
        portfolio_start = validation.get('portfolio_start', 0)
        portfolio_end = validation.get('portfolio_end', 0)
        additional_info = f"""
<div style="margin-top: 10px; padding: 8px; background: rgba(99, 102, 241, 0.05); border-radius: 4px; font-size: 0.75rem; color: #8890a0;">
<strong style="color: #818cf8;">Period:</strong> {days} days |
<strong style="color: #818cf8;">Portfolio:</strong> ${portfolio_start:,.0f} → ${portfolio_end:,.0f}
</div>
"""

    warning_html = ""
    if validation.get('warning'):
        warning_html = f"""
<div style="margin-top: 10px; padding: 10px; background: rgba(255, 217, 61, 0.1); border-left: 3px solid #ffd93d; border-radius: 4px;">
<span style="color: #ffd93d;">⚠️ {validation['warning']}</span>
</div>
"""

    html = f"""
<div style="background: rgba(26, 35, 50, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 12px; padding: 20px; margin: 20px 0;">
<h4 style="color: #818cf8; margin: 0 0 15px 0; font-family: 'Inter', sans-serif; text-transform: uppercase; letter-spacing: 0.1em;">📊 Attribution Reconciliation{source_badge}</h4>
<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px;">
<div style="background: rgba(10, 15, 26, 0.6); border-radius: 8px; padding: 12px; text-align: center;">
<div style="color: #8890a0; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 5px;">Portfolio Return (Ann.)</div>
<div style="color: {'#00ff9d' if validation['portfolio_return'] > 0 else '#ff006b'}; font-size: 1.5rem; font-weight: 700; font-family: 'JetBrains Mono', monospace;">{validation['portfolio_return']:+.2f}%</div>
</div>
<div style="background: rgba(10, 15, 26, 0.6); border-radius: 8px; padding: 12px; text-align: center;">
<div style="color: #8890a0; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 5px;">Benchmark Return (SPY)</div>
<div style="color: {'#00ff9d' if validation['benchmark_return'] > 0 else '#ff006b'}; font-size: 1.5rem; font-weight: 700; font-family: 'JetBrains Mono', monospace;">{validation['benchmark_return']:+.2f}%</div>
</div>
<div style="background: rgba(10, 15, 26, 0.6); border-radius: 8px; padding: 12px; text-align: center;">
<div style="color: #8890a0; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 5px;">Actual Alpha</div>
<div style="color: {'#00ff9d' if validation['actual_alpha'] > 0 else '#ff006b'}; font-size: 1.8rem; font-weight: 700; font-family: 'JetBrains Mono', monospace;">{validation['actual_alpha']:+.2f}%</div>
</div>
<div style="background: rgba(10, 15, 26, 0.6); border-radius: 8px; padding: 12px; text-align: center;">
<div style="color: #8890a0; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 5px;">Attribution Sum</div>
<div style="color: {'#00ff9d' if validation['attribution_sum'] > 0 else '#ff006b'}; font-size: 1.5rem; font-weight: 700; font-family: 'JetBrains Mono', monospace;">{validation['attribution_sum']:+.2f}%</div>
</div>
</div>
<div style="margin-top: 15px; padding: 10px; background: linear-gradient(90deg, rgba({status_color[1:]}, 0.1) 0%, transparent 100%); border-left: 3px solid {status_color}; border-radius: 4px;">
<span style="color: {status_color}; font-weight: 600;">{status_icon} {'Attribution Reconciled' if is_valid else 'Reconciliation Difference (trades/timing)'}</span>
<span style="color: #8890a0; margin-left: 10px;">Difference: {validation['reconciliation_diff']:.2f}%</span>
</div>
{additional_info}
{warning_html}
</div>
"""
    return html


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


def should_display_monthly_heatmap(df):
    """
    Validate if monthly heatmap should be displayed.
    Returns True only if there are at least 2 complete months of meaningful data.
    """
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        current_month_start = end_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        monthly_data_count = 0
        has_meaningful_data = False

        for _, row in df.iterrows():
            ticker = row['Ticker']
            hist_data = fetch_historical_data(ticker, start_date, end_date)

            if hist_data is not None and len(hist_data) > 0:
                monthly_data = hist_data['Close'].resample('M').last()
                monthly_returns = monthly_data.pct_change()

                # Count complete months (excluding current month)
                complete_months = []
                for month, ret in monthly_returns.items():
                    month_start = month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                    if month_start < current_month_start and pd.notna(ret):
                        complete_months.append(ret)
                        if abs(ret) > 0.001:  # At least 0.1% variation
                            has_meaningful_data = True

                if len(complete_months) > monthly_data_count:
                    monthly_data_count = len(complete_months)

        # Require at least 2 complete months with some meaningful variation
        return monthly_data_count >= 2 and has_meaningful_data
    except:
        return False
