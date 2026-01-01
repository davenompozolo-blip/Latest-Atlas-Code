"""
ATLAS Terminal Beta - Reusable UI Components
=============================================
Clean, modern UI components for consistent design.

Author: Hlobo Nompozolo
Version: 1.0.0-beta.1
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from typing import Dict, List, Optional


def metric_card(label: str, value: str, delta: Optional[str] = None, delta_color: str = "normal"):
    """
    Display a metric card with optional delta.

    Parameters:
    -----------
    label : str
        Metric label
    value : str
        Metric value (formatted)
    delta : str, optional
        Change/delta value (formatted)
    delta_color : str
        Delta color: "normal", "inverse", "off"
    """
    st.metric(label=label, value=value, delta=delta, delta_color=delta_color)


def holdings_table(df: pd.DataFrame):
    """
    Display portfolio holdings table with formatting.

    Parameters:
    -----------
    df : pd.DataFrame
        Holdings dataframe with columns:
        Ticker, Shares, Avg_Cost, Current_Price, Market_Value,
        Unrealized_PnL, Unrealized_PnL_Pct, Weight_Pct
    """
    if df.empty:
        st.info("No positions found")
        return

    # Format for display
    display_df = df.copy()

    # Format numeric columns
    display_df['Avg_Cost'] = display_df['Avg_Cost'].apply(lambda x: f"${x:.2f}")
    display_df['Current_Price'] = display_df['Current_Price'].apply(lambda x: f"${x:.2f}")
    display_df['Market_Value'] = display_df['Market_Value'].apply(lambda x: f"${x:,.2f}")
    display_df['Unrealized_PnL'] = display_df['Unrealized_PnL'].apply(lambda x: f"${x:+,.2f}")
    display_df['Unrealized_PnL_Pct'] = display_df['Unrealized_PnL_Pct'].apply(lambda x: f"{x:+.2f}%")
    display_df['Weight_Pct'] = display_df['Weight_Pct'].apply(lambda x: f"{x:.2f}%")
    display_df['Shares'] = display_df['Shares'].apply(lambda x: f"{x:,.2f}")

    # Select display columns
    display_cols = ['Ticker', 'Shares', 'Avg_Cost', 'Current_Price',
                    'Market_Value', 'Unrealized_PnL', 'Unrealized_PnL_Pct', 'Weight_Pct']

    st.dataframe(
        display_df[display_cols],
        use_container_width=True,
        hide_index=True
    )


def allocation_pie_chart(df: pd.DataFrame, title: str = "Portfolio Allocation"):
    """
    Display portfolio allocation pie chart.

    Parameters:
    -----------
    df : pd.DataFrame
        Holdings dataframe with Ticker and Market_Value columns
    title : str
        Chart title
    """
    if df.empty:
        return

    fig = px.pie(
        df,
        values='Market_Value',
        names='Ticker',
        title=title,
        hole=0.4,
        color_discrete_sequence=px.colors.sequential.Blues_r
    )

    fig.update_traces(
        textposition='inside',
        textinfo='percent+label',
        hovertemplate='<b>%{label}</b><br>Value: $%{value:,.2f}<br>Weight: %{percent}<extra></extra>'
    )

    fig.update_layout(
        showlegend=True,
        height=400,
        margin=dict(t=50, b=20, l=20, r=20)
    )

    st.plotly_chart(fig, use_container_width=True)


def equity_curve_chart(df: pd.DataFrame, title: str = "Portfolio Equity Curve"):
    """
    Display equity curve over time.

    Parameters:
    -----------
    df : pd.DataFrame
        Portfolio history with timestamp and equity columns
    title : str
        Chart title
    """
    if df.empty:
        st.info("No portfolio history available")
        return

    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=df['timestamp'],
        y=df['equity'],
        mode='lines',
        name='Equity',
        line=dict(color='#667eea', width=2),
        fill='tozeroy',
        fillcolor='rgba(102, 126, 234, 0.1)',
        hovertemplate='<b>%{x|%Y-%m-%d}</b><br>Equity: $%{y:,.2f}<extra></extra>'
    ))

    fig.update_layout(
        title=title,
        xaxis_title="Date",
        yaxis_title="Equity ($)",
        hovermode='x unified',
        height=400,
        showlegend=False,
        margin=dict(t=50, b=50, l=60, r=20)
    )

    st.plotly_chart(fig, use_container_width=True)


def returns_distribution(returns: pd.Series, title: str = "Daily Returns Distribution"):
    """
    Display returns distribution histogram.

    Parameters:
    -----------
    returns : pd.Series
        Daily returns
    title : str
        Chart title
    """
    if returns.empty:
        st.info("No returns data available")
        return

    fig = go.Figure()

    fig.add_trace(go.Histogram(
        x=returns * 100,  # Convert to percentage
        nbinsx=50,
        name='Returns',
        marker_color='#667eea',
        hovertemplate='Return: %{x:.2f}%<br>Count: %{y}<extra></extra>'
    ))

    # Add mean line
    mean_return = returns.mean() * 100
    fig.add_vline(
        x=mean_return,
        line_dash="dash",
        line_color="green",
        annotation_text=f"Mean: {mean_return:.2f}%",
        annotation_position="top"
    )

    fig.update_layout(
        title=title,
        xaxis_title="Daily Return (%)",
        yaxis_title="Frequency",
        height=400,
        showlegend=False,
        margin=dict(t=50, b=50, l=60, r=20)
    )

    st.plotly_chart(fig, use_container_width=True)


def drawdown_chart(df: pd.DataFrame, title: str = "Portfolio Drawdown"):
    """
    Display drawdown chart.

    Parameters:
    -----------
    df : pd.DataFrame
        Portfolio history with timestamp and equity columns
    title : str
        Chart title
    """
    if df.empty or len(df) < 2:
        st.info("Insufficient data for drawdown calculation")
        return

    # Calculate drawdown
    equity = df['equity'].values
    cummax = pd.Series(equity).expanding().max()
    drawdown = (equity - cummax) / cummax * 100

    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=df['timestamp'],
        y=drawdown,
        mode='lines',
        name='Drawdown',
        line=dict(color='#e74c3c', width=2),
        fill='tozeroy',
        fillcolor='rgba(231, 76, 60, 0.1)',
        hovertemplate='<b>%{x|%Y-%m-%d}</b><br>Drawdown: %{y:.2f}%<extra></extra>'
    ))

    # Add max drawdown line
    max_dd = drawdown.min()
    fig.add_hline(
        y=max_dd,
        line_dash="dash",
        line_color="red",
        annotation_text=f"Max DD: {max_dd:.2f}%",
        annotation_position="right"
    )

    fig.update_layout(
        title=title,
        xaxis_title="Date",
        yaxis_title="Drawdown (%)",
        hovermode='x unified',
        height=400,
        showlegend=False,
        margin=dict(t=50, b=50, l=60, r=20)
    )

    st.plotly_chart(fig, use_container_width=True)


def risk_metrics_table(metrics: Dict):
    """
    Display risk metrics in formatted table.

    Parameters:
    -----------
    metrics : dict
        Risk metrics dictionary
    """
    if not metrics:
        st.info("No risk metrics available")
        return

    # Format metrics
    metrics_display = {
        "Sharpe Ratio": f"{metrics.get('sharpe_ratio', 0):.2f}",
        "Sortino Ratio": f"{metrics.get('sortino_ratio', 0):.2f}",
        "Calmar Ratio": f"{metrics.get('calmar_ratio', 0):.2f}",
        "Max Drawdown": f"{metrics.get('max_drawdown', 0)*100:.2f}%",
        "Volatility (Annual)": f"{metrics.get('volatility', 0)*100:.2f}%",
        "Value at Risk (95%)": f"{metrics.get('var_95', 0)*100:.2f}%",
        "Mean Return (Annual)": f"{metrics.get('mean_return', 0)*100:.2f}%",
        "Total Return": f"{metrics.get('total_return', 0)*100:.2f}%",
    }

    # Display in columns
    col1, col2 = st.columns(2)

    items = list(metrics_display.items())
    mid = len(items) // 2

    with col1:
        for metric, value in items[:mid]:
            st.metric(metric, value)

    with col2:
        for metric, value in items[mid:]:
            st.metric(metric, value)


def trades_table(df: pd.DataFrame):
    """
    Display trade history table.

    Parameters:
    -----------
    df : pd.DataFrame
        Trade history dataframe
    """
    if df.empty:
        st.info("No trade history found")
        return

    # Format for display
    display_df = df.copy()

    # Format columns
    display_df['timestamp'] = pd.to_datetime(display_df['timestamp']).dt.strftime('%Y-%m-%d %H:%M')
    display_df['qty'] = display_df['qty'].apply(lambda x: f"{x:,.2f}")
    display_df['price'] = display_df['price'].apply(lambda x: f"${x:.2f}")
    display_df['total_value'] = display_df['total_value'].apply(lambda x: f"${x:,.2f}")

    # Select columns
    display_cols = ['timestamp', 'symbol', 'side', 'qty', 'price', 'total_value']

    # Rename columns
    display_df = display_df[display_cols]
    display_df.columns = ['Time', 'Symbol', 'Side', 'Quantity', 'Price', 'Total Value']

    st.dataframe(
        display_df,
        use_container_width=True,
        hide_index=True
    )


def info_box(message: str, type: str = "info"):
    """
    Display styled info box.

    Parameters:
    -----------
    message : str
        Message to display
    type : str
        Box type: "info", "success", "warning", "error"
    """
    if type == "info":
        st.info(message)
    elif type == "success":
        st.success(message)
    elif type == "warning":
        st.warning(message)
    elif type == "error":
        st.error(message)


def section_header(title: str, subtitle: str = ""):
    """
    Display section header with optional subtitle.

    Parameters:
    -----------
    title : str
        Section title
    subtitle : str, optional
        Subtitle text
    """
    st.markdown(f"### {title}")
    if subtitle:
        st.caption(subtitle)
    st.markdown("---")
