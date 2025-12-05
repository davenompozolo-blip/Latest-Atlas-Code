"""
ATLAS Quant Optimizer UI Components
Streamlit interface for portfolio optimization
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from typing import Dict

def display_optimization_results(result: Dict, title: str = "Optimization Results"):
    """
    Display optimization results in formatted cards

    Args:
        result: Dict from PortfolioOptimizer with weights, stats
        title: Display title
    """
    st.markdown(f"### {title}")

    # Metrics row
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric(
            "Expected Return",
            f"{result['return']*100:.2f}%",
            delta=None
        )

    with col2:
        st.metric(
            "Volatility",
            f"{result['volatility']*100:.2f}%",
            delta=None
        )

    with col3:
        st.metric(
            "Sharpe Ratio",
            f"{result['sharpe_ratio']:.3f}",
            delta=None
        )

    with col4:
        st.metric(
            "Leverage",
            f"{result['leverage']:.2f}x",
            delta=None
        )

    # Weights table
    st.markdown("#### Portfolio Weights")
    weights_df = pd.DataFrame([
        {
            'Ticker': ticker,
            'Weight': f"{weight*100:.2f}%",
            'Weight_Numeric': weight
        }
        for ticker, weight in result['weights'].items()
    ]).sort_values('Weight_Numeric', ascending=False)

    st.dataframe(
        weights_df[['Ticker', 'Weight']],
        hide_index=True,
        use_container_width=True
    )

    # Pie chart
    fig = go.Figure(data=[go.Pie(
        labels=list(result['weights'].keys()),
        values=list(result['weights'].values()),
        hole=0.3
    )])

    fig.update_layout(
        title="Weight Allocation",
        height=400
    )

    st.plotly_chart(fig, use_container_width=True)


def plot_efficient_frontier(frontier_df: pd.DataFrame, optimal_point: Dict = None):
    """
    Plot efficient frontier

    Args:
        frontier_df: DataFrame from PortfolioOptimizer.efficient_frontier()
        optimal_point: Dict with 'volatility' and 'return' for optimal portfolio
    """
    fig = go.Figure()

    # Efficient frontier line
    fig.add_trace(go.Scatter(
        x=frontier_df['volatility'] * 100,
        y=frontier_df['return'] * 100,
        mode='lines+markers',
        name='Efficient Frontier',
        line=dict(color='lightblue', width=2),
        marker=dict(size=6)
    ))

    # Optimal point
    if optimal_point:
        fig.add_trace(go.Scatter(
            x=[optimal_point['volatility'] * 100],
            y=[optimal_point['return'] * 100],
            mode='markers',
            name='Optimal Portfolio',
            marker=dict(
                size=15,
                color='red',
                symbol='star',
                line=dict(color='white', width=2)
            )
        ))

    fig.update_layout(
        title="Efficient Frontier",
        xaxis_title="Volatility (%)",
        yaxis_title="Expected Return (%)",
        height=500,
        hovermode='closest'
    )

    st.plotly_chart(fig, use_container_width=True)


def optimization_sidebar():
    """
    Render optimization settings in sidebar

    Returns:
        Dict with user-selected parameters
    """
    st.sidebar.markdown("### Optimization Settings")

    objective = st.sidebar.selectbox(
        "Objective",
        ["Maximum Sharpe Ratio", "Minimum Volatility"],
        help="Select optimization objective"
    )

    leverage = st.sidebar.slider(
        "Leverage",
        min_value=1.0,
        max_value=3.0,
        value=2.0,
        step=0.1,
        help="Portfolio leverage multiplier"
    )

    min_weight = st.sidebar.slider(
        "Min Position Size (%)",
        min_value=0.0,
        max_value=20.0,
        value=5.0,
        step=1.0,
        help="Minimum weight per asset"
    ) / 100

    max_weight = st.sidebar.slider(
        "Max Position Size (%)",
        min_value=10.0,
        max_value=50.0,
        value=30.0,
        step=5.0,
        help="Maximum weight per asset"
    ) / 100

    risk_free_rate = st.sidebar.number_input(
        "Risk-Free Rate (%)",
        min_value=0.0,
        max_value=10.0,
        value=3.0,
        step=0.1,
        help="Annual risk-free rate"
    ) / 100

    return {
        'objective': objective,
        'leverage': leverage,
        'min_weight': min_weight,
        'max_weight': max_weight,
        'risk_free_rate': risk_free_rate
    }


__all__ = [
    'display_optimization_results',
    'plot_efficient_frontier',
    'optimization_sidebar'
]
