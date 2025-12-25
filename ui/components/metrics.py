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
    "text_primary": "#ffffff",
    "text_secondary": "#b0c4de",
    "text_muted": "#6c8ca8",
    "border": "#00d4ff",
    "shadow": "rgba(0, 212, 255, 0.3)",
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
    """Apply ATLAS dark theme to plotly charts"""
    fig.update_layout(
        plot_bgcolor=COLORS['background'],
        paper_bgcolor=COLORS['background'],
        font=dict(color=COLORS['text_primary']),
        xaxis=dict(
            gridcolor=COLORS['card_background'],
            zerolinecolor=COLORS['text_muted']
        ),
        yaxis=dict(
            gridcolor=COLORS['card_background'],
            zerolinecolor=COLORS['text_muted']
        )
    )
    return fig


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
        <h3 style='color: {COLORS['neon_blue']}; margin: 0 0 15px 0; font-size: 18px;'>📊 Risk Snapshot</h3>
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
                    {'<br>'.join([f"▪ {row['Ticker']} ({row['Weight %']:.1f}%)" for _, row in top_3.iterrows()])}
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
        border: 1px solid rgba(0, 212, 255, 0.2);
        border-radius: 12px;
        padding: 24px;
        margin: 20px 0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    ">
        <h3 style="
            font-family: 'Inter', sans-serif;
            font-size: 1.2rem;
            font-weight: 700;
            color: #00d4ff;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin: 0 0 20px 0;
            text-shadow: 0 0 10px rgba(0, 212, 255, 0.3);
        ">
            <� Portfolio Management Skill Assessment
        </h3>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">

            <!-- Allocation Skill -->
            <div style="
                background: rgba(10, 15, 26, 0.6);
                border: 1px solid rgba(0, 212, 255, 0.15);
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
                border: 1px solid rgba(0, 212, 255, 0.15);
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
            background: linear-gradient(90deg, rgba(0, 212, 255, 0.1) 0%, transparent 100%);
            border-left: 3px solid #00d4ff;
            padding: 12px 16px;
            margin-top: 20px;
            border-radius: 4px;
        ">
            <div style="
                font-family: 'Inter', sans-serif;
                font-size: 0.75rem;
                font-weight: 700;
                color: #00d4ff;
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
