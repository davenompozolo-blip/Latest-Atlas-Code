"""
ATLAS Terminal - Metrics Component Library
Phase 2 Day 5 - Metric Display Components

Reusable metric cards, badges, and dashboard components.
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from typing import Dict, Any
from datetime import datetime

# ATLAS Color Scheme
COLORS = {
    "background": "#000000",
    "card_background": "#0a1929",
    "card_background_alt": "#050f17",
    "neon_blue": "#818cf8",
    "electric_blue": "#0080ff",
    "teal": "#00ffcc",
    "cyan": "#00ffff",
    "success": "#00ff88",
    "warning": "#ffaa00",
    "danger": "#ff0044",
    "info": "#818cf8",
    "purple": "#b794f6",
    "pink": "#ff00ff",
    "orange": "#ff6b00",
    "text_primary": "#ffffff",
    "text_secondary": "#b0c4de",
    "text_muted": "#6c8ca8",
    "border": "#818cf8",
    "shadow": "rgba(99, 102, 241, 0.3)",
}


class ATLASFormatter:
    """Centralized professional formatting utilities"""

    @staticmethod
    def format_ratio(value, decimals=1):
        """Format ratio with specified decimals"""
        if pd.isna(value) or value is None:
            return ""
        return f"{value:.{decimals}f}"

    @staticmethod
    def format_yield(value, decimals=2):
        """Format yields/returns as percentage"""
        if pd.isna(value) or value is None:
            return ""
        return f"{value:.{decimals}f}%"

    @staticmethod
    def format_timestamp(dt=None):
        """Format timestamp for freshness indicator"""
        if dt is None:
            dt = datetime.now()
        return dt.strftime("%Y-%m-%d %H:%M:%S")


def is_valid_series(series):
    """Check if pandas Series has valid data"""
    return series is not None and isinstance(series, pd.Series) and not series.empty


def apply_chart_theme(fig):
    """Apply ATLAS chart theme — transparent backgrounds so gradient mesh bleeds through."""
    fig.update_layout(
        plot_bgcolor='rgba(0,0,0,0)',
        paper_bgcolor='rgba(0,0,0,0)',
        font=dict(
            family='DM Sans, sans-serif',
            color='rgba(255,255,255,0.52)',
            size=11,
        ),
        xaxis=dict(
            gridcolor='rgba(255,255,255,0.05)',
            linecolor='rgba(255,255,255,0.07)',
            tickcolor='rgba(255,255,255,0.28)',
            tickfont=dict(size=10),
        ),
        yaxis=dict(
            gridcolor='rgba(255,255,255,0.05)',
            linecolor='rgba(255,255,255,0.07)',
            tickcolor='rgba(255,255,255,0.28)',
            tickfont=dict(size=10),
        ),
        legend=dict(
            bgcolor='rgba(255,255,255,0.04)',
            bordercolor='rgba(255,255,255,0.07)',
            borderwidth=1,
        ),
        margin=dict(l=40, r=20, t=40, b=40),
    )
    return fig


def create_risk_snapshot(df, portfolio_returns):
    """
    Risk Snapshot — design spec stat-card layout with inner-glow orbs.
    4 cards: Portfolio Beta, Volatility (Ann.), Max Drawdown, Top Exposures
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

    # Determine sub-badges
    beta_sub_cls = "green" if 0.8 <= weighted_beta <= 1.2 else "blue"
    beta_sub_text = "Neutral" if 0.8 <= weighted_beta <= 1.2 else ("Aggressive" if weighted_beta > 1.2 else "Defensive")
    vol_sub_cls = "blue" if vol < 20 else "green" if vol < 30 else "red"
    vol_sub_text = "Low Vol" if vol < 20 else "Moderate" if vol < 30 else "High Vol"
    dd_sub_cls = "green" if drawdown > -15 else "blue" if drawdown > -25 else "red"
    dd_sub_text = "&#10003; Low" if drawdown > -15 else "Moderate" if drawdown > -25 else "Elevated"

    top_exposure_lines = ''.join([
        f'<div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); line-height: 1.8;">&#9642; {row["Ticker"]} ({row["Weight %"]:.1f}%)</div>'
        for _, row in top_3.iterrows()
    ])

    snapshot_html = f"""
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
        <div class="stat-card">
            <div class="inner-glow" style="background: var(--blue);"></div>
            <span style="font-size: 16px; display: block; margin-bottom: 12px;">&#128200;</span>
            <div class="metric-label" style="font-size: 9.5px; letter-spacing: 1.5px;">Portfolio Beta</div>
            <div class="metric-value" style="font-size: 22px; color: var(--text-primary);">{ATLASFormatter.format_ratio(weighted_beta)}</div>
            <span class="metric-pill pill-{beta_sub_cls}" style="font-size: 11px; padding: 3px 10px;">{beta_sub_text}</span>
        </div>
        <div class="stat-card">
            <div class="inner-glow" style="background: var(--blue);"></div>
            <span style="font-size: 16px; display: block; margin-bottom: 12px;">&#128201;</span>
            <div class="metric-label" style="font-size: 9.5px; letter-spacing: 1.5px;">Annualized Volatility</div>
            <div class="metric-value" style="font-size: 22px;">{ATLASFormatter.format_yield(vol)}</div>
            <span class="metric-pill pill-{vol_sub_cls}" style="font-size: 11px; padding: 3px 10px;">{vol_sub_text}</span>
        </div>
        <div class="stat-card">
            <div class="inner-glow" style="background: var(--amber);"></div>
            <span style="font-size: 16px; display: block; margin-bottom: 12px;">&#9888;&#65039;</span>
            <div class="metric-label" style="font-size: 9.5px; letter-spacing: 1.5px;">Max Drawdown</div>
            <div class="metric-value" style="font-size: 22px; color: var(--red);">{ATLASFormatter.format_yield(drawdown)}</div>
            <span class="metric-pill pill-{dd_sub_cls}" style="font-size: 11px; padding: 3px 10px;">{dd_sub_text}</span>
        </div>
        <div class="stat-card">
            <div class="inner-glow" style="background: var(--violet);"></div>
            <span style="font-size: 16px; display: block; margin-bottom: 12px;">&#128142;</span>
            <div class="metric-label" style="font-size: 9.5px; letter-spacing: 1.5px;">Top Exposures</div>
            <div style="margin-top: 4px;">{top_exposure_lines}</div>
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
        emoji = '✅'
        label = 'HEALTHY'
    elif percentage >= 50:
        status = 'YELLOW'
        emoji = '⚠️'
        label = 'CAUTION'
    else:
        status = 'RED'
        emoji = '🔴'
        label = 'AT RISK'

    return status, percentage, f"{emoji} {label}"


def create_signal_health_badge(metrics):
    """Create visual health indicator badge — design spec .badge classes."""
    status, percentage, label = calculate_signal_health(metrics)

    badge_cls_map = {
        'GREEN': 'badge-green',
        'YELLOW': 'badge-warning',
        'RED': 'badge-red',
    }
    badge_cls = badge_cls_map.get(status, 'badge-neutral')

    badge_html = f"""
    <span class="badge {badge_cls}" style="font-size: 13px; padding: 8px 16px; font-weight: 600;">
        {label} ({percentage:.0f}%)
    </span>
    """
    return badge_html


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
    alloc_status = ' Strong sector rotation' if allocation_effect > 1 else '� Neutral sector timing' if allocation_effect > -1 else ' Poor sector allocation'
    select_status = ' Strong stock picks' if selection_effect > 1 else '� Neutral stock selection' if selection_effect > -1 else ' Stocks underperform sector'

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
            <� Portfolio Management Skill Assessment
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
            ">=� Primary Strength: {primary_skill}</div>
            <div style="
                font-family: 'Inter', sans-serif;
                font-size: 0.85rem;
                color: #c0c8d0;
            ">{recommendation}</div>
        </div>
    </div>
    """

    return html


def create_performance_dashboard(metrics):
    """Create comprehensive performance metrics dashboard with 4 charts"""
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
        title_text="=� Performance Dashboard"
    )

    apply_chart_theme(fig)
    return fig
