"""
ATLAS Performance Attribution
Factor and sector-based performance analysis
"""

import pandas as pd
import numpy as np
from typing import Dict, List


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
        Calculate sector-level attribution

        Returns:
            DataFrame with sector contributions
        """
        sector_data = []

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

            contribution = sector_weight * sector_return

            sector_data.append({
                'Sector': sector,
                'Weight': sector_weight * 100,
                'Return': sector_return * 100,
                'Contribution': contribution * 100
            })

        df = pd.DataFrame(sector_data)
        df = df.sort_values('Contribution', ascending=False)

        return df

    def top_contributors(self, n: int = 10) -> pd.DataFrame:
        """Get top N contributors"""
        contributions = self.stock_contribution()
        return contributions.head(n)

    def bottom_contributors(self, n: int = 10) -> pd.DataFrame:
        """Get bottom N contributors"""
        contributions = self.stock_contribution()
        return contributions.tail(n)


__all__ = ['PerformanceAttribution']
