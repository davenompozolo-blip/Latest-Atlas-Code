"""
ATLAS Enhanced UI Components
Modern Plotly-based visualizations for Streamlit
"""

import streamlit as st
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
import numpy as np
from typing import Dict, Optional, List


def create_allocation_chart(weights: Dict[str, float]) -> go.Figure:
    """
    Create interactive donut chart for portfolio allocation

    Args:
        weights: Dict mapping ticker to weight

    Returns:
        Plotly figure
    """
    df = pd.DataFrame([
        {'Ticker': ticker, 'Weight': weight * 100}
        for ticker, weight in weights.items()
    ]).sort_values('Weight', ascending=False)

    fig = go.Figure(data=[go.Pie(
        labels=df['Ticker'],
        values=df['Weight'],
        hole=0.4,
        textinfo='label+percent',
        marker=dict(
            colors=px.colors.qualitative.Set3,
            line=dict(color='rgba(15, 18, 35, 0.8)', width=2)
        )
    )])

    fig.update_layout(
        title='Portfolio Allocation',
        showlegend=True,
        height=500,
        margin=dict(t=50, b=50, l=50, r=50)
    )

    return fig


def create_performance_chart(
    portfolio_returns: pd.Series,
    benchmark_returns: Optional[pd.Series] = None
) -> go.Figure:
    """
    Create cumulative returns line chart

    Args:
        portfolio_returns: Portfolio returns series
        benchmark_returns: Optional benchmark returns

    Returns:
        Plotly figure
    """
    portfolio_cumulative = (1 + portfolio_returns).cumprod() - 1

    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=portfolio_cumulative.index,
        y=portfolio_cumulative.values * 100,
        mode='lines',
        name='Portfolio',
        line=dict(color='#00C851', width=3)
    ))

    if benchmark_returns is not None:
        benchmark_cumulative = (1 + benchmark_returns).cumprod() - 1
        fig.add_trace(go.Scatter(
            x=benchmark_cumulative.index,
            y=benchmark_cumulative.values * 100,
            mode='lines',
            name='Benchmark',
            line=dict(color='#FF4444', width=2, dash='dash')
        ))

    fig.update_layout(
        title='Cumulative Returns',
        xaxis_title='Date',
        yaxis_title='Cumulative Return (%)',
        hovermode='x unified',
        height=500,
        showlegend=True,
        legend=dict(yanchor="top", y=0.99, xanchor="left", x=0.01)
    )

    return fig


def create_drawdown_chart(returns: pd.Series) -> go.Figure:
    """
    Create underwater drawdown chart

    Args:
        returns: Portfolio returns series

    Returns:
        Plotly figure
    """
    cumulative = (1 + returns).cumprod()
    running_max = cumulative.expanding().max()
    drawdown = (cumulative - running_max) / running_max * 100

    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=drawdown.index,
        y=drawdown.values,
        mode='lines',
        name='Drawdown',
        fill='tozeroy',
        line=dict(color='#FF4444', width=2),
        fillcolor='rgba(255, 68, 68, 0.3)'
    ))

    fig.update_layout(
        title='Portfolio Drawdown',
        xaxis_title='Date',
        yaxis_title='Drawdown (%)',
        hovermode='x unified',
        height=400,
        showlegend=False
    )

    return fig


def create_risk_return_scatter(
    portfolios: pd.DataFrame,
    highlight_optimal: bool = True
) -> go.Figure:
    """
    Create risk-return scatter plot for efficient frontier

    Args:
        portfolios: DataFrame with 'Return', 'Volatility', 'Sharpe' columns
        highlight_optimal: Whether to highlight max Sharpe portfolio

    Returns:
        Plotly figure
    """
    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=portfolios['Volatility'] * 100,
        y=portfolios['Return'] * 100,
        mode='markers',
        marker=dict(
            size=8,
            color=portfolios['Sharpe'],
            colorscale='Viridis',
            showscale=True,
            colorbar=dict(title='Sharpe Ratio')
        ),
        text=[f"Sharpe: {s:.2f}" for s in portfolios['Sharpe']],
        hovertemplate='<b>Return:</b> %{y:.2f}%<br>' +
                      '<b>Volatility:</b> %{x:.2f}%<br>' +
                      '%{text}<extra></extra>',
        name='Portfolios'
    ))

    if highlight_optimal and 'Sharpe' in portfolios.columns:
        optimal_idx = portfolios['Sharpe'].idxmax()
        optimal = portfolios.loc[optimal_idx]

        fig.add_trace(go.Scatter(
            x=[optimal['Volatility'] * 100],
            y=[optimal['Return'] * 100],
            mode='markers',
            marker=dict(
                size=15,
                color='red',
                symbol='star',
                line=dict(color='rgba(15, 18, 35, 0.8)', width=2)
            ),
            name='Optimal Portfolio',
            hovertemplate='<b>Optimal Portfolio</b><br>' +
                          f'Return: {optimal["Return"]*100:.2f}%<br>' +
                          f'Volatility: {optimal["Volatility"]*100:.2f}%<br>' +
                          f'Sharpe: {optimal["Sharpe"]:.2f}<extra></extra>'
        ))

    fig.update_layout(
        title='Efficient Frontier',
        xaxis_title='Volatility (%)',
        yaxis_title='Expected Return (%)',
        hovermode='closest',
        height=500,
        showlegend=True
    )

    return fig


def sidebar_navigation() -> str:
    """
    Create sidebar navigation for ATLAS pages

    Returns:
        Selected page name
    """
    st.sidebar.title("🚀 ATLAS Terminal")
    st.sidebar.markdown("---")

    pages = {
        "Dashboard": "📊",
        "Portfolio Optimizer": "⚡",
        "Risk Analytics": "📈",
        "Valuation (DCF)": "💰",
        "Phoenix Mode": "🔥",
        "Live Data": "📡",
        "Settings": "⚙️"
    }

    selected = st.sidebar.radio(
        "Navigation",
        list(pages.keys()),
        format_func=lambda x: f"{pages[x]} {x}"
    )

    st.sidebar.markdown("---")
    st.sidebar.info("ATLAS Terminal v10.0")

    return selected


__all__ = [
    'create_allocation_chart',
    'create_performance_chart',
    'create_drawdown_chart',
    'create_risk_return_scatter',
    'sidebar_navigation'
]
