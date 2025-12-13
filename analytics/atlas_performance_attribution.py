"""
ATLAS Performance Attribution
Factor and sector-based performance analysis
"""

import pandas as pd
import numpy as np
from typing import Dict, List
import yfinance as yf


class PerformanceAttribution:
    """
    Performance Attribution Analysis

    Methods:
    - Sector attribution
    - Stock contribution
    - Top/bottom contributors
    """

    def __init__(
        self,
        portfolio_weights: Dict[str, float],
        asset_data: pd.DataFrame
    ):
        """
        Initialize attribution engine

        Args:
            portfolio_weights: Dict mapping ticker to weight
            asset_data: DataFrame with ticker, sector, returns
        """
        self.portfolio_weights = portfolio_weights
        self.asset_data = asset_data

    def stock_contribution(self) -> pd.DataFrame:
        """
        Calculate individual stock contributions

        Returns:
            DataFrame with stock-level contributions
        """
        contributions = []

        # ===== FIX #4: Use weight from asset_data if available =====
        if 'weight' in self.asset_data.columns:
            # Use weights from asset_data (already in percentage)
            for _, row in self.asset_data.iterrows():
                ticker = row['ticker']
                weight_pct = row['weight']  # Already in percentage
                stock_return = row['return']

                # Convert weight back to decimal for contribution calculation
                contribution = (weight_pct / 100) * stock_return

                contributions.append({
                    'Ticker': ticker,
                    'Weight': weight_pct,  # Already in percentage
                    'Return': stock_return * 100,
                    'Contribution': contribution * 100
                })
        else:
            # Fallback to original logic if weight not in asset_data
            for ticker, weight in self.portfolio_weights.items():
                if ticker in self.asset_data['ticker'].values:
                    stock_return = self.asset_data[
                        self.asset_data['ticker'] == ticker
                    ]['return'].iloc[0]

                    contribution = weight * stock_return

                    contributions.append({
                        'Ticker': ticker,
                        'Weight': weight * 100,
                        'Return': stock_return * 100,
                        'Contribution': contribution * 100
                    })

        df = pd.DataFrame(contributions)
        df = df.sort_values('Contribution', ascending=False)

        return df

    def sector_attribution(self) -> pd.DataFrame:
        """
        Calculate sector-level attribution with Brinson-Fachler model

        Returns:
            DataFrame with sector contributions and attribution effects
        """
        # ===== FIX #5: Implement Brinson-Fachler Attribution =====

        # Calculate portfolio sector weights and returns
        sector_data = []

        # Use weight from asset_data if available
        if 'weight' in self.asset_data.columns:
            for sector in self.asset_data['sector'].unique():
                sector_assets = self.asset_data[self.asset_data['sector'] == sector]

                # Sum weights for this sector (already in percentage, convert to decimal)
                sector_weight = sector_assets['weight'].sum() / 100

                if sector_weight == 0:
                    continue

                # Calculate weighted average return for this sector
                sector_return = sum(
                    (row['weight'] / 100) * row['return']
                    for _, row in sector_assets.iterrows()
                ) / sector_weight if sector_weight > 0 else 0

                sector_data.append({
                    'Sector': sector,
                    'Portfolio Weight': sector_weight,
                    'Portfolio Return': sector_return
                })
        else:
            # Fallback to original logic
            for sector in self.asset_data['sector'].unique():
                sector_assets = self.asset_data[self.asset_data['sector'] == sector]

                sector_weight = sum(
                    self.portfolio_weights.get(ticker, 0)
                    for ticker in sector_assets['ticker']
                )

                if sector_weight == 0:
                    continue

                sector_return = sum(
                    self.portfolio_weights.get(ticker, 0) *
                    sector_assets[sector_assets['ticker'] == ticker]['return'].iloc[0]
                    for ticker in sector_assets['ticker']
                    if ticker in self.portfolio_weights
                ) / sector_weight if sector_weight > 0 else 0

                sector_data.append({
                    'Sector': sector,
                    'Portfolio Weight': sector_weight,
                    'Portfolio Return': sector_return
                })

        portfolio_sectors = pd.DataFrame(sector_data)

        # Get benchmark (S&P 500) sector data
        benchmark_sectors = self._get_benchmark_sector_data()

        # Merge portfolio and benchmark data
        attribution_data = portfolio_sectors.merge(
            benchmark_sectors,
            on='Sector',
            how='outer'
        ).fillna(0)

        # Calculate benchmark total return
        benchmark_total_return = (attribution_data['Benchmark Weight'] *
                                 attribution_data['Benchmark Return']).sum()

        # Brinson-Fachler Attribution Effects
        attribution_data['Allocation Effect'] = (
            (attribution_data['Portfolio Weight'] - attribution_data['Benchmark Weight']) *
            (attribution_data['Benchmark Return'] - benchmark_total_return)
        )

        attribution_data['Selection Effect'] = (
            attribution_data['Benchmark Weight'] *
            (attribution_data['Portfolio Return'] - attribution_data['Benchmark Return'])
        )

        attribution_data['Interaction Effect'] = (
            (attribution_data['Portfolio Weight'] - attribution_data['Benchmark Weight']) *
            (attribution_data['Portfolio Return'] - attribution_data['Benchmark Return'])
        )

        # Convert to percentages for display
        attribution_data['Portfolio Weight'] = attribution_data['Portfolio Weight'] * 100
        attribution_data['Benchmark Weight'] = attribution_data['Benchmark Weight'] * 100
        attribution_data['Portfolio Return'] = attribution_data['Portfolio Return'] * 100
        attribution_data['Benchmark Return'] = attribution_data['Benchmark Return'] * 100
        attribution_data['Allocation Effect'] = attribution_data['Allocation Effect'] * 100
        attribution_data['Selection Effect'] = attribution_data['Selection Effect'] * 100
        attribution_data['Interaction Effect'] = attribution_data['Interaction Effect'] * 100

        # Round for display
        attribution_data = attribution_data.round(2)

        return attribution_data

    def _get_benchmark_sector_data(self) -> pd.DataFrame:
        """
        Get S&P 500 sector weights and returns

        Returns:
            DataFrame with benchmark sector weights and returns
        """
        # Approximate S&P 500 sector weights (as of 2024)
        spy_sectors = {
            'Technology': {'weight': 0.28, 'ticker': 'XLK'},
            'Financial Services': {'weight': 0.13, 'ticker': 'XLF'},
            'Healthcare': {'weight': 0.13, 'ticker': 'XLV'},
            'Consumer Cyclical': {'weight': 0.11, 'ticker': 'XLY'},
            'Communication Services': {'weight': 0.09, 'ticker': 'XLC'},
            'Industrials': {'weight': 0.08, 'ticker': 'XLI'},
            'Consumer Defensive': {'weight': 0.06, 'ticker': 'XLP'},
            'Energy': {'weight': 0.04, 'ticker': 'XLE'},
            'Utilities': {'weight': 0.03, 'ticker': 'XLU'},
            'Real Estate': {'weight': 0.03, 'ticker': 'XLRE'},
            'Basic Materials': {'weight': 0.02, 'ticker': 'XLB'}
        }

        benchmark_data = []

        for sector, data in spy_sectors.items():
            try:
                # Fetch sector ETF returns (1 month to match portfolio)
                etf = yf.Ticker(data['ticker'])
                hist = etf.history(period='1mo')

                if not hist.empty and len(hist) > 0:
                    sector_return = (hist['Close'].iloc[-1] / hist['Close'].iloc[0] - 1)
                else:
                    sector_return = 0

                benchmark_data.append({
                    'Sector': sector,
                    'Benchmark Weight': data['weight'],
                    'Benchmark Return': sector_return
                })
            except Exception as e:
                # Fallback to 0 if can't fetch
                benchmark_data.append({
                    'Sector': sector,
                    'Benchmark Weight': data['weight'],
                    'Benchmark Return': 0
                })

        return pd.DataFrame(benchmark_data)

    def top_contributors(self, n: int = 10) -> pd.DataFrame:
        """Get top N contributors"""
        contributions = self.stock_contribution()
        return contributions.head(n)

    def bottom_contributors(self, n: int = 10) -> pd.DataFrame:
        """Get bottom N contributors"""
        contributions = self.stock_contribution()
        return contributions.tail(n)


__all__ = ['PerformanceAttribution']
