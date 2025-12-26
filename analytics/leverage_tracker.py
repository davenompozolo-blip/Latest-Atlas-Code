"""
ATLAS Leverage Tracking Module
Parses Investopedia performance history and tracks leverage over time
"""

import pandas as pd
import numpy as np
from datetime import datetime
import plotly.graph_objects as go
from plotly.subplots import make_subplots


class LeverageTracker:
    """Track and analyze leverage from Investopedia performance history"""

    def __init__(self, excel_file_path):
        """
        Args:
            excel_file_path: Path to Investopedia performance-history.xls file
        """
        self.file_path = excel_file_path
        self.data = None
        self.leverage_history = None

    def load_and_parse(self):
        """Load Excel file and parse leverage data"""
        try:
            # Read HTML table from Excel file
            df = pd.read_html(self.file_path)[0]

            # Clean column names
            df.columns = ['Date', 'Cash', 'Stock Value', 'Option Value', 'Short Value', 'Account Value']

            # Convert Date to datetime
            df['Date'] = pd.to_datetime(df['Date'])

            # Clean currency values (remove $ and commas)
            for col in ['Cash', 'Stock Value', 'Option Value', 'Short Value', 'Account Value']:
                df[col] = df[col].replace('[\$,]', '', regex=True).astype(float)

            # Sort by date (oldest first)
            df = df.sort_values('Date').reset_index(drop=True)

            self.data = df

            # Calculate leverage metrics
            self._calculate_leverage()

            return True

        except Exception as e:
            print(f"Error loading performance history: {e}")
            return False

    def _calculate_leverage(self):
        """Calculate leverage and related metrics"""
        df = self.data.copy()

        # ===== LEVERAGE CALCULATION =====
        # Leverage = Gross Exposure / Net Equity
        # Gross Exposure = Stock Value + Option Value + |Short Value|
        # Net Equity = Account Value

        df['Gross Exposure'] = df['Stock Value'] + df['Option Value'] + df['Short Value'].abs()
        df['Net Equity'] = df['Account Value']
        df['Leverage Ratio'] = df['Gross Exposure'] / df['Net Equity']

        # ===== RETURN CALCULATIONS =====
        df['Equity Return (%)'] = df['Net Equity'].pct_change() * 100
        df['Gross Return (%)'] = df['Gross Exposure'].pct_change() * 100

        # ===== LEVERAGE IMPACT =====
        # How much did leverage amplify/dampen returns?
        df['Leverage Impact (%)'] = (df['Leverage Ratio'] - 1) * df['Gross Return (%)']

        # ===== CUMULATIVE METRICS =====
        df['Cumulative Equity Return (%)'] = ((1 + df['Equity Return (%)'] / 100).cumprod() - 1) * 100
        df['Cumulative Gross Return (%)'] = ((1 + df['Gross Return (%)'] / 100).cumprod() - 1) * 100

        self.leverage_history = df

    def get_current_stats(self):
        """Get current leverage statistics"""
        if self.leverage_history is None:
            return None

        latest = self.leverage_history.iloc[-1]

        # Calculate YTD returns (from start of current year)
        current_year = latest['Date'].year
        year_start = self.leverage_history[self.leverage_history['Date'].dt.year == current_year].iloc[0]

        ytd_equity_return = ((latest['Net Equity'] - year_start['Net Equity']) / year_start['Net Equity']) * 100 if year_start['Net Equity'] > 0 else 0
        ytd_gross_return = ((latest['Gross Exposure'] - year_start['Gross Exposure']) / year_start['Gross Exposure']) * 100 if year_start['Gross Exposure'] > 0 else 0

        return {
            'current_leverage': latest['Leverage Ratio'],
            'current_equity': latest['Net Equity'],
            'current_gross_exposure': latest['Gross Exposure'],
            'ytd_equity_return': ytd_equity_return,
            'ytd_gross_return': ytd_gross_return,
            'avg_leverage': self.leverage_history['Leverage Ratio'].mean(),
            'max_leverage': self.leverage_history['Leverage Ratio'].max(),
            'min_leverage': self.leverage_history['Leverage Ratio'].min(),
        }

    def create_leverage_dashboard(self):
        """Create comprehensive leverage tracking dashboard"""
        if self.leverage_history is None:
            return None

        df = self.leverage_history

        # Create subplots
        fig = make_subplots(
            rows=3, cols=2,
            subplot_titles=(
                'Leverage Ratio Over Time',
                'Equity vs Gross Exposure',
                'Daily Returns Comparison',
                'Cumulative Returns',
                'Leverage Impact on Returns',
                'Leverage Distribution'
            ),
            specs=[
                [{'secondary_y': False}, {'secondary_y': False}],
                [{'secondary_y': False}, {'secondary_y': False}],
                [{'secondary_y': False}, {'type': 'histogram'}]
            ],
            vertical_spacing=0.12,
            horizontal_spacing=0.10
        )

        # CHART 1: Leverage Ratio Over Time
        fig.add_trace(
            go.Scatter(
                x=df['Date'],
                y=df['Leverage Ratio'],
                mode='lines',
                name='Leverage Ratio',
                line=dict(color='#00d4ff', width=2),
                fill='tozeroy',
                fillcolor='rgba(0, 212, 255, 0.1)'
            ),
            row=1, col=1
        )

        # Add reference line at 1.0x (no leverage)
        fig.add_hline(y=1.0, line_dash="dash", line_color="white", opacity=0.3, row=1, col=1)

        # CHART 2: Equity vs Gross Exposure
        fig.add_trace(
            go.Scatter(
                x=df['Date'],
                y=df['Net Equity'],
                mode='lines',
                name='Net Equity',
                line=dict(color='#00ff9d', width=2)
            ),
            row=1, col=2
        )

        fig.add_trace(
            go.Scatter(
                x=df['Date'],
                y=df['Gross Exposure'],
                mode='lines',
                name='Gross Exposure',
                line=dict(color='#ff6b6b', width=2, dash='dash')
            ),
            row=1, col=2
        )

        # CHART 3: Daily Returns Comparison
        fig.add_trace(
            go.Scatter(
                x=df['Date'],
                y=df['Equity Return (%)'],
                mode='markers',
                name='Equity Returns',
                marker=dict(color='#00ff9d', size=4, opacity=0.6)
            ),
            row=2, col=1
        )

        fig.add_trace(
            go.Scatter(
                x=df['Date'],
                y=df['Gross Return (%)'],
                mode='markers',
                name='Gross Returns',
                marker=dict(color='#ff6b6b', size=4, opacity=0.6)
            ),
            row=2, col=1
        )

        # CHART 4: Cumulative Returns
        fig.add_trace(
            go.Scatter(
                x=df['Date'],
                y=df['Cumulative Equity Return (%)'],
                mode='lines',
                name='Cumulative Equity',
                line=dict(color='#00ff9d', width=3)
            ),
            row=2, col=2
        )

        fig.add_trace(
            go.Scatter(
                x=df['Date'],
                y=df['Cumulative Gross Return (%)'],
                mode='lines',
                name='Cumulative Gross',
                line=dict(color='#ff6b6b', width=3, dash='dot')
            ),
            row=2, col=2
        )

        # CHART 5: Leverage Impact
        colors = ['#00ff9d' if x > 0 else '#ff6b6b' for x in df['Leverage Impact (%)']]

        fig.add_trace(
            go.Bar(
                x=df['Date'],
                y=df['Leverage Impact (%)'],
                name='Leverage Impact',
                marker=dict(color=colors),
                showlegend=False
            ),
            row=3, col=1
        )

        # CHART 6: Leverage Distribution
        fig.add_trace(
            go.Histogram(
                x=df['Leverage Ratio'],
                nbinsx=30,
                name='Leverage Distribution',
                marker=dict(color='#00d4ff'),
                showlegend=False
            ),
            row=3, col=2
        )

        # Update layout
        fig.update_layout(
            title='📊 Leverage Tracking Dashboard',
            height=1200,
            showlegend=True,
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(10,25,41,0.3)',
            font=dict(color='white', size=10),
            hovermode='x unified'
        )

        # Update axes
        fig.update_xaxes(showgrid=True, gridcolor='rgba(255,255,255,0.1)')
        fig.update_yaxes(showgrid=True, gridcolor='rgba(255,255,255,0.1)')

        return fig

    def create_workings_display(self):
        """Create detailed calculation workings display"""
        if self.leverage_history is None:
            return None

        latest = self.leverage_history.iloc[-1]
        prev = self.leverage_history.iloc[-2] if len(self.leverage_history) > 1 else latest

        workings = f"""
### 🧮 CALCULATION WORKINGS (Latest: {latest['Date'].strftime('%Y-%m-%d')})

#### **1. LEVERAGE RATIO CALCULATION**
```
Gross Exposure = Stock Value + Option Value + |Short Value|
               = ${latest['Stock Value']:,.2f} + ${latest['Option Value']:,.2f} + ${abs(latest['Short Value']):,.2f}
               = ${latest['Gross Exposure']:,.2f}

Net Equity = Account Value
           = ${latest['Net Equity']:,.2f}

Leverage Ratio = Gross Exposure / Net Equity
               = ${latest['Gross Exposure']:,.2f} / ${latest['Net Equity']:,.2f}
               = {latest['Leverage Ratio']:.2f}x
```

#### **2. RETURN CALCULATIONS**
```
Previous Net Equity = ${prev['Net Equity']:,.2f}
Current Net Equity  = ${latest['Net Equity']:,.2f}

Equity Return = (Current - Previous) / Previous × 100
              = (${latest['Net Equity']:,.2f} - ${prev['Net Equity']:,.2f}) / ${prev['Net Equity']:,.2f} × 100
              = {latest['Equity Return (%)']:.2f}%

Gross Return = (${latest['Gross Exposure']:,.2f} - ${prev['Gross Exposure']:,.2f}) / ${prev['Gross Exposure']:,.2f} × 100
             = {latest['Gross Return (%)']:.2f}%
```

#### **3. LEVERAGE IMPACT**
```
Leverage Impact = (Leverage - 1) × Gross Return
                = ({latest['Leverage Ratio']:.2f} - 1) × {latest['Gross Return (%)']:.2f}%
                = {latest['Leverage Impact (%)']:.2f}%

Interpretation: Leverage {'amplified' if latest['Leverage Impact (%)'] > 0 else 'dampened'} returns by {abs(latest['Leverage Impact (%)']):.2f}%
```

#### **4. HISTORICAL STATISTICS**
```
Average Leverage:    {self.leverage_history['Leverage Ratio'].mean():.2f}x
Maximum Leverage:    {self.leverage_history['Leverage Ratio'].max():.2f}x
Minimum Leverage:    {self.leverage_history['Leverage Ratio'].min():.2f}x

YTD Equity Return:   {latest['Cumulative Equity Return (%)']:,.2f}%
YTD Gross Return:    {latest['Cumulative Gross Return (%)']:,.2f}%
```
        """

        return workings


__all__ = ['LeverageTracker']
