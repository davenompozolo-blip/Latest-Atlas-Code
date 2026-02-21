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
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta

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
    "chart_primary": "#818cf8",
    "chart_secondary": "#0080ff",
    "chart_accent": "#00ffcc",
    "chart_grid": "#1a3a52",
    "text_primary": "#ffffff",
    "text_secondary": "#b0c4de",
    "text_muted": "#6c8ca8",
    "border": "#818cf8",
    "shadow": "rgba(99, 102, 241, 0.3)",
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
        height=CHART_HEIGHT_STANDARD,
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
        height=CHART_HEIGHT_STANDARD,
        showlegend=False,
        xaxis=dict(zeroline=True, zerolinewidth=2, zerolinecolor=COLORS['text_muted'])
    )

    apply_chart_theme(fig)
    return fig


def create_brinson_attribution_chart(attribution_results):
    """
    Create waterfall chart showing allocation, selection, and interaction effects
    """

    # Aggregate by effect type
    total_allocation = attribution_results['total_allocation_effect']
    total_selection = attribution_results['total_selection_effect']
    total_interaction = attribution_results['total_interaction_effect']
    total = attribution_results['total_attribution']

    fig = go.Figure(go.Waterfall(
        name="Attribution",
        orientation="v",
        x=['Allocation<br>Effect', 'Selection<br>Effect', 'Interaction<br>Effect', 'Total<br>Attribution'],
        y=[total_allocation, total_selection, total_interaction, total],
        measure=['relative', 'relative', 'relative', 'total'],
        text=[f"{total_allocation:+.2f}%", f"{total_selection:+.2f}%",
              f"{total_interaction:+.2f}%", f"{total:.2f}%"],
        textposition="outside",
        connector={"line": {"color": COLORS['neon_blue'], "width": 2}},
        decreasing={"marker": {"color": COLORS['danger']}},
        increasing={"marker": {"color": COLORS['success']}},
        totals={"marker": {"color": COLORS['electric_blue']}}
    ))

    fig.update_layout(
        title="📊 Brinson Attribution: Portfolio Outperformance Breakdown",
        yaxis_title="Effect (%)",
        height=500,
        showlegend=False
    )

    apply_chart_theme(fig)
    return fig


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


def create_holdings_attribution_waterfall(df):
    """Holdings attribution waterfall - ENHANCED THEMING"""
    top_contributors = df.nlargest(10, 'Total Gain/Loss $')

    tickers = top_contributors['Ticker'].tolist()
    contributions = top_contributors['Total Gain/Loss $'].tolist()

    fig = go.Figure()

    fig.add_trace(go.Waterfall(
        name="Attribution",
        orientation="v",
        x=tickers,
        y=contributions,
        connector={"line": {"color": COLORS['neon_blue']}},
        decreasing={"marker": {"color": COLORS['danger']}},
        increasing={"marker": {"color": COLORS['success']}},
        totals={"marker": {"color": COLORS['electric_blue']}}
    ))

    fig.update_layout(
        title="💧 Holdings Attribution Waterfall",
        xaxis_title="Ticker",
        yaxis_title="Contribution ($)",
        height=500
    )

    apply_chart_theme(fig)
    return fig


def create_factor_attribution_table(exposures, df):
    """Factor exposure attribution table"""
    # Note: This function requires FACTOR_DEFINITIONS which should be imported from analytics module
    if exposures is None or 'asset_exposures' not in exposures:
        return None, None, None

    # Placeholder for FACTOR_DEFINITIONS - this should be imported
    FACTOR_DEFINITIONS = {}  # Will be imported from analytics module in actual usage

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


# ============================================================================
# PERFORMANCE CHARTS
# ============================================================================

def create_interactive_performance_chart(tickers, start_date, end_date):
    """Interactive performance chart - ENHANCED THEMING"""
    # Note: fetch_ticker_performance should be imported from data module
    from datetime import datetime, timedelta

    # Placeholder function - should be imported from data module
    def fetch_ticker_performance(ticker, start_date, end_date):
        # This will be replaced with actual import
        return None, None

    fig = go.Figure()

    colors = [COLORS['neon_blue'], COLORS['electric_blue'], COLORS['teal'],
              COLORS['success'], COLORS['warning'], COLORS['danger'],
              COLORS['purple'], COLORS['pink'], COLORS['orange']]

    for idx, ticker in enumerate(tickers):
        cumulative, data = fetch_ticker_performance(ticker, start_date, end_date)
        if cumulative is not None:
            fig.add_trace(go.Scatter(
                x=cumulative.index,
                y=cumulative.values,
                mode='lines',
                name=ticker,
                line=dict(width=2.5, color=colors[idx % len(colors)])
            ))

    if not fig.data:
        return None

    fig.update_layout(
        title="📈 Interactive Performance Comparison",
        xaxis_title="Date",
        yaxis_title="Cumulative Return (%)",
        height=600,
        hovermode='x unified',
        legend=dict(x=0.01, y=0.99)
    )

    fig.add_hline(y=0, line_dash="dash", line_color=COLORS['text_muted'], line_width=1)

    apply_chart_theme(fig)
    return fig


def create_rolling_metrics_chart(returns, window=60):
    """Rolling metrics visualization - ENHANCED THEMING"""
    from plotly.subplots import make_subplots

    # Helper function for series validation
    def is_valid_series(series):
        return series is not None and isinstance(series, pd.Series) and not series.empty

    # Placeholder for RISK_FREE_RATE - should be imported
    RISK_FREE_RATE = 0.02

    if not is_valid_series(returns) or len(returns) < window:
        return None

    rolling_vol = returns.rolling(window).std() * np.sqrt(252) * 100
    rolling_sharpe = (returns.rolling(window).mean() * 252 - RISK_FREE_RATE) / (returns.rolling(window).std() * np.sqrt(252))

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
            fillcolor='rgba(255, 0, 68, 0.2)',
            line=dict(color=COLORS['danger'], width=2),
            name='Volatility'
        ),
        row=1, col=1
    )

    fig.add_trace(
        go.Scatter(
            x=rolling_sharpe.index,
            y=rolling_sharpe.values,
            fill='tozeroy',
            fillcolor='rgba(99, 102, 241, 0.2)',
            line=dict(color=COLORS['neon_blue'], width=2),
            name='Sharpe Ratio'
        ),
        row=2, col=1
    )

    fig.add_hline(y=0, line_dash="dash", line_color=COLORS['text_muted'], row=2, col=1)

    fig.update_layout(
        height=600,
        showlegend=False,
        title_text="📊 Rolling Risk Metrics"
    )

    apply_chart_theme(fig)
    return fig


def create_underwater_plot(returns):
    """Underwater drawdown plot - ENHANCED THEMING"""
    # Helper function for series validation
    def is_valid_series(series):
        return series is not None and isinstance(series, pd.Series) and not series.empty

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


def create_performance_heatmap(df, period='monthly'):
    """v9.7 ENHANCED: Performance heatmap with improved incomplete month filtering"""
    from datetime import datetime, timedelta

    # Placeholder for fetch_historical_data - should be imported from data module
    def fetch_historical_data(ticker, start_date, end_date):
        return None

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

        # v9.7 FIX: Double-check to remove any incomplete months
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

        # Remove empty columns from heatmap
        matrix_array = np.array(matrix)
        non_zero_cols = []
        filtered_months = []

        for i, month in enumerate(months):
            if np.any(np.abs(matrix_array[:, i]) > 0.01):
                non_zero_cols.append(i)
                filtered_months.append(month)

        if len(non_zero_cols) > 0:
            filtered_matrix = matrix_array[:, non_zero_cols].tolist()
            months = filtered_months
            matrix = filtered_matrix

        fig = go.Figure(data=go.Heatmap(
            z=matrix,
            x=months,
            y=tickers,
            colorscale='Spectral_r',
            zmid=0,
            zmin=-20,
            zmax=20,
            text=np.round(matrix, 1),
            texttemplate='%{text}%',
            textfont={"size": 14},
            colorbar=dict(title="Return %")
        ))

        fig.update_layout(
            title="🔥 Monthly Performance Heatmap",
            xaxis_title="Month",
            yaxis_title="Asset",
            height=CHART_HEIGHT_DEEP_DIVE,
            width=1200
        )

        apply_chart_theme(fig)
        return fig
    except Exception as e:
        return None


def create_portfolio_heatmap(df):
    """Portfolio treemap - ENHANCED THEMING"""
    df_viz = df[['Ticker', 'Asset Name', 'Weight %', 'Total Gain/Loss %', 'Sector']].copy()
    df_viz['Sector'] = df_viz['Sector'].fillna('Other')
    df_viz = df_viz.dropna()

    if df_viz.empty:
        return None

    fig = px.treemap(
        df_viz,
        path=[px.Constant("Portfolio"), 'Sector', 'Ticker'],
        values='Weight %',
        color='Total Gain/Loss %',
        color_continuous_scale='RdYlGn',
        color_continuous_midpoint=0,
        hover_data={'Asset Name': True, 'Total Gain/Loss %': ':.2f'}
    )

    fig.update_layout(
        title="🗺️ Portfolio Heatmap",
        height=700
    )

    apply_chart_theme(fig)
    return fig


# ============================================================================
# RISK CHARTS
# ============================================================================

def create_rolling_var_cvar_chart(returns, window=60):
    """
    NEW IN v9.7: Rolling VaR and CVaR time series visualization
    Shows how tail risk metrics evolve over time
    """
    # Helper function for series validation
    def is_valid_series(series):
        return series is not None and isinstance(series, pd.Series) and not series.empty

    # Placeholder helper functions - should be imported from analytics module
    def calculate_var(returns, confidence):
        if len(returns) < 10:
            return None
        return np.percentile(returns, (1 - confidence) * 100)

    def calculate_cvar(returns, confidence):
        if len(returns) < 10:
            return None
        var = calculate_var(returns, confidence)
        return returns[returns <= var].mean() if var is not None else None

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

    fig = go.Figure()

    # Add VaR trace
    fig.add_trace(go.Scatter(
        x=dates,
        y=rolling_var_95,
        name='VaR 95%',
        line=dict(color=COLORS['orange'], width=2),
        mode='lines'
    ))

    # Add CVaR trace
    fig.add_trace(go.Scatter(
        x=dates,
        y=rolling_cvar_95,
        name='CVaR 95%',
        line=dict(color=COLORS['danger'], width=2, dash='dash'),
        mode='lines'
    ))

    # Add zero line
    fig.add_hline(y=0, line_dash="dot", line_color=COLORS['text_muted'], line_width=1)

    fig.update_layout(
        title=f"📊 Rolling VaR & CVaR Evolution ({window}-Day Window)",
        xaxis_title="Date",
        yaxis_title="Expected Loss (%)",
        height=500,
        hovermode='x unified',
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


def create_risk_reward_plot(df):
    """Risk-reward scatter plot - ENHANCED THEMING"""
    from datetime import datetime, timedelta

    # Placeholder for fetch_historical_data - should be imported from data module
    def fetch_historical_data(ticker, start_date, end_date):
        return None

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
        height=CHART_HEIGHT_STANDARD
    )

    apply_chart_theme(fig)
    return fig


def create_monte_carlo_chart(simulation_results, initial_value=100000):
    """Monte Carlo simulation visualization - ENHANCED THEMING"""
    if simulation_results is None:
        return None, None

    fig = go.Figure()

    for i in range(min(100, len(simulation_results))):
        fig.add_trace(go.Scatter(
            y=simulation_results[i],
            mode='lines',
            line=dict(width=0.5, color=COLORS['electric_blue']),
            opacity=0.1,
            showlegend=False
        ))

    percentiles = [5, 25, 50, 75, 95]
    colors_pct = [COLORS['danger'], COLORS['warning'], COLORS['info'],
                  COLORS['teal'], COLORS['success']]

    for p, color in zip(percentiles, colors_pct):
        values = np.percentile(simulation_results, p, axis=0)
        fig.add_trace(go.Scatter(
            y=values,
            mode='lines',
            line=dict(width=3, color=color),
            name=f'{p}th Percentile'
        ))

    fig.update_layout(
        title="🎲 Monte Carlo Simulation",
        xaxis_title="Trading Days",
        yaxis_title="Portfolio Value ($)",
        height=500
    )

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


# ============================================================================
# SECTOR/FACTOR CHARTS
# ============================================================================

def create_sector_rotation_heatmap(df, start_date, end_date):
    """Sector rotation heatmap - FIXED DATETIME COMPARISON"""
    from datetime import datetime

    # Placeholder for fetch_historical_data - should be imported from data module
    def fetch_historical_data(ticker, start_date, end_date):
        return None

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

    fig = go.Figure(data=go.Heatmap(
        z=matrix,
        x=[m.strftime('%b %Y') for m in months],
        y=sectors,
        colorscale='Spectral_r',
        zmid=0,
        text=np.round(matrix, 1),
        texttemplate='%{text}%',
        textfont={"size": 11},
        colorbar=dict(title="Return %")
    ))

    fig.update_layout(
        title="🔄 Sector Rotation Heatmap",
        xaxis_title="Month",
        yaxis_title="Sector",
        height=500
    )

    apply_chart_theme(fig)
    return fig


def create_factor_momentum_chart(factor_data):
    """Factor momentum chart - ENHANCED THEMING"""
    # Placeholder for FACTOR_DEFINITIONS - should be imported from analytics module
    FACTOR_DEFINITIONS = {}

    if factor_data is None or 'factor_returns' not in factor_data:
        return None

    factor_returns = factor_data['factor_returns']

    fig = go.Figure()

    colors = [COLORS['neon_blue'], COLORS['electric_blue'], COLORS['teal'],
              COLORS['success'], COLORS['purple'], COLORS['pink']]

    for idx, factor in enumerate(FACTOR_DEFINITIONS.keys()):
        if factor in factor_returns.columns:
            cumulative = (1 + factor_returns[factor]).cumprod() - 1
            fig.add_trace(go.Scatter(
                x=cumulative.index,
                y=cumulative.values * 100,
                mode='lines',
                name=factor,
                line=dict(width=2, color=colors[idx % len(colors)])
            ))

    fig.update_layout(
        title="📈 Factor Momentum",
        xaxis_title="Date",
        yaxis_title="Cumulative Return (%)",
        height=600,
        hovermode='x unified',
        legend=dict(x=0.02, y=0.98)
    )

    apply_chart_theme(fig)
    return fig


# ============================================================================
# VALUATION CHARTS
# ============================================================================

def create_cash_flow_chart(projections, method='FCFF'):
    """Create bar chart of projected cash flows - ENHANCED THEMING"""

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
            return go.Figure()

    cf_key = 'fcff' if method == 'FCFF' else 'fcfe'

    years = [proj['year'] for proj in projections]
    cash_flows = [proj[cf_key] for proj in projections]

    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=years,
        y=cash_flows,
        marker_color=COLORS['electric_blue'],
        name=method,
        marker=dict(line=dict(color=COLORS['border'], width=2))
    ))

    fig.update_layout(
        title=f"📊 Projected {method} by Year",
        xaxis_title="Year",
        yaxis_title=f"{method} ($)",
        height=400
    )

    apply_chart_theme(fig)
    return fig


# ============================================================================
# CONTRIBUTOR CHARTS
# ============================================================================

def create_top_contributors_chart(df, top_n=5):
    """FIXED: Top contributors in PERCENTAGE terms with improved spacing"""
    top_contributors = df.nlargest(top_n, 'Total Gain/Loss %')[['Ticker', 'Asset Name', 'Total Gain/Loss $', 'Total Gain/Loss %']]

    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=top_contributors['Total Gain/Loss %'],
        y=top_contributors['Ticker'],
        orientation='h',
        marker=dict(
            color=COLORS['success'],
            line=dict(color=COLORS['border'], width=2)
        ),
        text=[f"{x:.1f}%" for x in top_contributors['Total Gain/Loss %']],
        textposition='outside',
        textfont=dict(size=12),
        hovertemplate='<b>%{y}</b><br>Return: %{x:.2f}%<extra></extra>',
        width=0.6
    ))

    fig.update_layout(
        title="🎯 Top 5 Contributors (%)",
        xaxis_title="Total Return (%)",
        yaxis_title="",
        height=CHART_HEIGHT_STANDARD,
        showlegend=False,
        margin=dict(l=100, r=80, t=80, b=50)
    )

    # Ensure labels are fully visible
    fig.update_xaxes(tickfont=dict(size=12))
    fig.update_yaxes(tickfont=dict(size=12))

    apply_chart_theme(fig)
    return fig


def create_top_detractors_chart(df, top_n=5):
    """FIXED: Top detractors in PERCENTAGE terms with improved spacing"""
    top_detractors = df.nsmallest(top_n, 'Total Gain/Loss %')[['Ticker', 'Asset Name', 'Total Gain/Loss $', 'Total Gain/Loss %']]

    fig = go.Figure()

    fig.add_trace(go.Bar(
        x=top_detractors['Total Gain/Loss %'],
        y=top_detractors['Ticker'],
        orientation='h',
        marker=dict(
            color=COLORS['danger'],
            line=dict(color=COLORS['border'], width=2)
        ),
        text=[f"{x:.1f}%" for x in top_detractors['Total Gain/Loss %']],
        textposition='outside',
        textfont=dict(size=12),
        hovertemplate='<b>%{y}</b><br>Loss: %{x:.2f}%<extra></extra>',
        width=0.6
    ))

    fig.update_layout(
        title="⚠️ Top 5 Detractors (%)",
        xaxis_title="Total Return (%)",
        yaxis_title="",
        height=CHART_HEIGHT_STANDARD,
        showlegend=False,
        margin=dict(l=100, r=80, t=80, b=50)
    )

    # Ensure labels are fully visible
    fig.update_xaxes(tickfont=dict(size=12))
    fig.update_yaxes(tickfont=dict(size=12))

    apply_chart_theme(fig)
    return fig
