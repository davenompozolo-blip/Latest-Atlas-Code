"""
Charts Module  
All chart creation and visualization functions extracted from original atlas.py

These functions create Plotly charts for various analytics:
- Portfolio composition and allocation
- Performance and attribution
- Risk metrics and analysis
- Valuation models
- Market monitoring
"""

import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import yfinance as yf
from datetime import datetime, timedelta
import logging

from ..config import COLORS, CHART_THEME
from ..visualizations.themes import apply_chart_theme
from ..visualizations.formatters import ATLASFormatter
from ..data.validators import is_valid_series, is_valid_dataframe

logger = logging.getLogger(__name__)


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
    <div style='display: inline-block; background: {color_map[status]};
                color: #000000; padding: 10px 20px; border-radius: 20px;
                font-weight: 700; font-size: 15px; margin: 10px 0;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);'>
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
        height=450,
        showlegend=False
    )

    apply_chart_theme(fig)
    return fig

def create_pnl_attribution_position(df, top_n=10):
    """v9.7 ENHANCED: P&L Attribution by Position - Now showing % returns"""
    # v9.7 FIX: Use Gain/Loss % instead of dollars
    top_contributors = df.nlargest(top_n // 2, 'Gain/Loss %')
    top_detractors = df.nsmallest(top_n // 2, 'Gain/Loss %')
    combined = pd.concat([top_contributors, top_detractors]).sort_values('Gain/Loss %')

    colors = [COLORS['success'] if x > 0 else COLORS['danger'] for x in combined['Gain/Loss %']]

    # Create labels with ticker and percentage
    labels = [f"{ticker}" for ticker in combined['Ticker']]

    fig = go.Figure(go.Bar(
        x=combined['Gain/Loss %'],
        y=labels,
        orientation='h',
        marker=dict(
            color=colors,
            line=dict(color=COLORS['border'], width=2),
            opacity=0.9
        ),
        text=[f"{v:+.1f}%" for v in combined['Gain/Loss %']],
        textposition='outside',
        textfont=dict(size=11, color=COLORS['text_primary']),
        hovertemplate='<b>%{y}</b><br>Return: %{x:.2f}%<extra></extra>'
    ))

    fig.update_layout(
        title=f"🎯 Top {top_n} P&L Contributors & Detractors (%)",
        xaxis_title="Return (%)",
        yaxis_title="",
        height=500,
        showlegend=False,
        xaxis=dict(zeroline=True, zerolinewidth=2, zerolinecolor=COLORS['text_muted'])
    )

    apply_chart_theme(fig)
    return fig

def create_sparkline(ticker, days=30):
    """Generate mini sparkline chart for ticker (last 30 days)"""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=f"{days}d")

        if hist.empty:
            return None

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
    """Professional US Treasury Yield Curve visualization"""
    # Treasury tickers and maturities
    treasuries = {
        "^IRX": {"maturity": 0.25, "name": "3M"},
        "^FVX": {"maturity": 5, "name": "5Y"},
        "^TNX": {"maturity": 10, "name": "10Y"},
        "^TYX": {"maturity": 30, "name": "30Y"}
    }

    yields_data = []
    maturities = []
    labels = []

    for ticker, info in treasuries.items():
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period="1d")
            if not hist.empty:
                current_yield = hist['Close'].iloc[-1]
                yields_data.append(current_yield)
                maturities.append(info['maturity'])
                labels.append(info['name'])
        except:
            continue

    if not yields_data:
        return None

    # Sort by maturity
    sorted_data = sorted(zip(maturities, yields_data, labels))
    maturities, yields_data, labels = zip(*sorted_data)

    fig = go.Figure()

    fig.add_trace(go.Scatter(
        x=maturities,
        y=yields_data,
        mode='lines+markers',
        line=dict(color=COLORS['neon_blue'], width=3),
        marker=dict(size=10, color=COLORS['electric_blue'], line=dict(color=COLORS['border'], width=2)),
        text=[f"{l}: {y:.2f}%" for l, y in zip(labels, yields_data)],
        hovertemplate='<b>%{text}</b><extra></extra>'
    ))

    fig.update_layout(
        title="📈 US Treasury Yield Curve",
        xaxis_title="Maturity (Years)",
        yaxis_title="Yield (%)",
        height=400,
        showlegend=False
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

# ============================================================================
# PHOENIX PARSER
# ============================================================================



def create_enhanced_holdings_table(df):
    enhanced_df = df.copy()
    
    for idx, row in enhanced_df.iterrows():
        ticker = row['Ticker']
        market_data = fetch_market_data(ticker)
        
        if market_data:
            enhanced_df.at[idx, 'Asset Name'] = market_data['company_name']
            enhanced_df.at[idx, 'Current Price'] = market_data['price']
            enhanced_df.at[idx, 'Daily Change'] = market_data['daily_change']
            enhanced_df.at[idx, 'Daily Change %'] = market_data['daily_change_pct']
            enhanced_df.at[idx, '5D Return %'] = market_data['five_day_return']
            enhanced_df.at[idx, 'Beta'] = market_data.get('beta', 'N/A')
            enhanced_df.at[idx, 'Volume'] = market_data.get('volume', 0)
            base_sector = market_data.get('sector', 'Unknown')
            enhanced_df.at[idx, 'Sector'] = classify_ticker_sector(ticker, base_sector)
        else:
            enhanced_df.at[idx, 'Asset Name'] = ticker
            enhanced_df.at[idx, 'Sector'] = 'Other'
        
        analyst_data = fetch_analyst_data(ticker)
        if analyst_data['success']:
            enhanced_df.at[idx, 'Analyst Rating'] = analyst_data['rating']
            enhanced_df.at[idx, 'Price Target'] = analyst_data['target_price']
        else:
            enhanced_df.at[idx, 'Analyst Rating'] = 'No Coverage'
    
    enhanced_df['Sector'] = enhanced_df['Sector'].fillna('Other')
    enhanced_df['Shares'] = enhanced_df['Shares'].round(0).astype(int)
    
    enhanced_df['Total Cost'] = enhanced_df['Shares'] * enhanced_df['Avg Cost']
    enhanced_df['Total Value'] = enhanced_df['Shares'] * enhanced_df['Current Price']
    enhanced_df['Total Gain/Loss $'] = enhanced_df['Total Value'] - enhanced_df['Total Cost']
    enhanced_df['Total Gain/Loss %'] = ((enhanced_df['Current Price'] - enhanced_df['Avg Cost']) / enhanced_df['Avg Cost']) * 100
    enhanced_df['Daily P&L $'] = enhanced_df['Shares'] * enhanced_df['Daily Change']
    
    total_value = enhanced_df['Total Value'].sum()
    enhanced_df['Weight %'] = (enhanced_df['Total Value'] / total_value * 100) if total_value > 0 else 0
    
    return enhanced_df



def create_top_contributors_chart(df, top_n=5):
    """FIXED: Top contributors in PERCENTAGE terms"""
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
        textposition='auto',
        hovertemplate='<b>%{y}</b><br>Return: %{x:.2f}%<extra></extra>'
    ))

    fig.update_layout(
        title="🎯 Top 5 Contributors (%)",
        xaxis_title="Total Return (%)",
        yaxis_title="",
        height=400,
        showlegend=False
    )

    apply_chart_theme(fig)
    return fig

def create_top_detractors_chart(df, top_n=5):
    """FIXED: Top detractors in PERCENTAGE terms"""
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
        textposition='auto',
        hovertemplate='<b>%{y}</b><br>Loss: %{x:.2f}%<extra></extra>'
    ))

    fig.update_layout(
        title="⚠️ Top 5 Detractors (%)",
        xaxis_title="Total Return (%)",
        yaxis_title="",
        height=400,
        showlegend=False
    )

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
    colors = ['#00d4ff', '#00ff88', '#ff6b00', '#b794f6', '#ff00ff',
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
        height=450,  # v9.7: Increased height for less clustering
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

def create_rolling_metrics_chart(returns, window=60):
    """Rolling metrics visualization - ENHANCED THEMING"""
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
            fillcolor='rgba(0, 212, 255, 0.2)',
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

def create_var_waterfall(returns):
    """VaR/CVaR waterfall chart - ENHANCED THEMING"""
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    
    var_90 = calculate_var(returns, 0.90)
    var_95 = calculate_var(returns, 0.95)
    var_99 = calculate_var(returns, 0.99)
    cvar_95 = calculate_cvar(returns, 0.95)
    
    categories = ['VaR 90%', 'VaR 95%', 'VaR 99%', 'CVaR 95%']
    values = [var_90, var_95, var_99, cvar_95]
    
    colors_list = [COLORS['warning'], COLORS['orange'], COLORS['danger'], COLORS['danger']]
    
    fig = go.Figure()
    
    fig.add_trace(go.Bar(
        x=categories,
        y=values,
        marker=dict(
            color=colors_list,
            line=dict(color=COLORS['border'], width=2)
        ),
        text=[f"{v:.2f}%" for v in values],
        textposition='outside'
    ))
    
    fig.update_layout(
        title="⚠️ Value at Risk Waterfall",
        xaxis_title="Risk Measure",
        yaxis_title="Expected Loss (%)",
        height=500
    )
    
    apply_chart_theme(fig)
    return fig

# v9.7 NEW FEATURE: VaR/CVaR on Return Distribution
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

# v9.7 NEW FEATURE: Rolling VaR/CVaR Time Series
def create_rolling_var_cvar_chart(returns, window=60):
    """
    NEW IN v9.7: Rolling VaR and CVaR time series visualization
    Shows how tail risk metrics evolve over time
    """
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

def create_risk_contribution_sunburst(df):
    """Risk contribution sunburst - ENHANCED THEMING"""
    risk_data = []
    
    for _, row in df.iterrows():
        ticker = row['Ticker']
        weight = row['Weight %']
        sector = row['Sector']
        
        hist_data = fetch_historical_data(ticker, datetime.now() - timedelta(days=365), datetime.now())
        if hist_data is not None and len(hist_data) > 30:
            returns = hist_data['Close'].pct_change().dropna()
            vol = returns.std() * np.sqrt(252) * 100
            risk_contribution = weight * vol
            
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
    
    fig = px.sunburst(
        risk_df,
        path=['Sector', 'Ticker'],
        values='Risk Contribution',
        color='Volatility',
        color_continuous_scale='RdYlGn_r',
        title="☀️ Risk Contribution Sunburst"
    )
    
    fig.update_layout(height=600)
    apply_chart_theme(fig)
    return fig

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
        height=500
    )
    
    apply_chart_theme(fig)
    return fig

def create_performance_heatmap(df, period='monthly'):
    """v9.7 ENHANCED: Performance heatmap with improved incomplete month filtering"""
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
        
        fig = go.Figure(data=go.Heatmap(
            z=matrix,
            x=months,
            y=tickers,
            colorscale='RdYlGn',
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
            height=800,
            width=1200
        )
        
        apply_chart_theme(fig)
        return fig
    except Exception as e:
        st.error(f"Error: {str(e)}")
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

@st.cache_data(ttl=600)


def create_interactive_performance_chart(tickers, start_date, end_date):
    """Interactive performance chart - ENHANCED THEMING"""
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



def create_monte_carlo_chart(simulation_results, initial_value=100000):
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

# ============================================================================
# MARKET WATCH - ENHANCED
# ============================================================================

@st.cache_data(ttl=300)


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
    display_df['Last'] = display_df['Last'].apply(format_currency)
    display_df['Change %'] = display_df['Change %'].apply(lambda x: add_arrow_indicator(format_percentage(x)))
    display_df['5D %'] = display_df['5D %'].apply(lambda x: add_arrow_indicator(format_percentage(x)))
    display_df['Volume'] = display_df['Volume'].apply(lambda x: f"{x:,.0f}")
    display_df['Vol/Avg'] = display_df['Vol/Avg'].apply(lambda x: f"{x:.2f}x")
    
    return display_df

# ============================================================================
# PORTFOLIO DEEP DIVE - ENHANCED
# ============================================================================

def create_sector_rotation_heatmap(df, start_date, end_date):
    """Sector rotation heatmap - FIXED DATETIME COMPARISON"""
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
        colorscale='RdYlGn',
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

def create_concentration_gauge(df):
    """Concentration gauge - ENHANCED THEMING"""
    top_5_weight = df.nlargest(5, 'Weight %')['Weight %'].sum()
    
    fig = go.Figure(go.Indicator(
        mode="gauge+number+delta",
        value=top_5_weight,
        title={'text': "Top 5 Concentration"},
        delta={'reference': 50, 'increasing': {'color': COLORS['warning']}},
        gauge={
            'axis': {'range': [None, 100]},
            'bar': {'color': COLORS['neon_blue']},
            'steps': [
                {'range': [0, 30], 'color': COLORS['success']},
                {'range': [30, 50], 'color': COLORS['warning']},
                {'range': [50, 100], 'color': COLORS['danger']}
            ],
            'threshold': {
                'line': {'color': "red", 'width': 4},
                'thickness': 0.75,
                'value': 70
            }
        }
    ))
    
    fig.update_layout(height=400)
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

# ============================================================================
# MULTI-FACTOR ANALYSIS - ENHANCED
# ============================================================================

def create_factor_momentum_chart(factor_data):
    """Factor momentum chart - ENHANCED THEMING"""
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
        fillcolor='rgba(0, 212, 255, 0.2)',
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

@st.cache_data(ttl=3600)


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

# ============================================================================
# PERFORMANCE METRICS
# ============================================================================



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

# ============================================================================
# VALUATION HOUSE VISUALIZATIONS - ENHANCED
# ============================================================================

def create_dcf_waterfall(dcf_results, method='FCFF'):
    """Create waterfall chart showing DCF buildup - ENHANCED THEMING"""
    
    categories = ['PV of Cash Flows', 'PV of Terminal Value']
    values = [dcf_results['total_pv_cash_flows'], dcf_results['pv_terminal']]
    
    if method == 'FCFF':
        categories.append('Enterprise Value')
        categories.append('Less: Net Debt')
        categories.append('Equity Value')
        values.append(dcf_results['enterprise_value'])
        values.append(-dcf_results.get('net_debt', 0))
        values.append(dcf_results['equity_value'])
    
    fig = go.Figure(go.Waterfall(
        name="DCF Buildup",
        orientation="v",
        x=categories,
        y=values,
        connector={"line": {"color": COLORS['neon_blue']}},
        decreasing={"marker": {"color": COLORS['danger']}},
        increasing={"marker": {"color": COLORS['success']}},
    ))
    
    fig.update_layout(
        title=f"💎 {method} Valuation Buildup",
        yaxis_title="Value ($)",
        height=500
    )
    
    apply_chart_theme(fig)
    return fig

def create_cash_flow_chart(projections, method='FCFF'):
    """Create bar chart of projected cash flows - ENHANCED THEMING"""
    
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
        colorscale='RdYlGn',
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

# ============================================================================
# MAIN APP - EXCELLENCE EDITION
# ============================================================================



