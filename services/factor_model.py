"""
ATLAS Terminal - Factor Model Service
=====================================
Calculates factor exposures (value, quality, momentum, size, low-vol)
for individual equities and portfolios.

Used by Equity Research (factor profile), Macro Intelligence (factor returns),
and Fund Research (factor attribution) modules.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta


# =============================================================================
# FACTOR DEFINITIONS
# =============================================================================

FACTOR_ETFS = {
    'value': 'VLUE',        # iShares MSCI USA Value Factor ETF
    'quality': 'QUAL',      # iShares MSCI USA Quality Factor ETF
    'momentum': 'MTUM',     # iShares MSCI USA Momentum Factor ETF
    'size': 'SIZE',         # iShares MSCI USA Size Factor ETF
    'low_vol': 'USMV',     # iShares MSCI USA Min Vol Factor ETF
    'growth': 'IWF',       # iShares Russell 1000 Growth ETF
}

FACTOR_LABELS = {
    'value': 'Value',
    'quality': 'Quality',
    'momentum': 'Momentum',
    'size': 'Size',
    'low_vol': 'Low Volatility',
    'growth': 'Growth',
}

FACTOR_COLORS = {
    'value': '#6366f1',
    'quality': '#10b981',
    'momentum': '#f59e0b',
    'size': '#8b5cf6',
    'low_vol': '#14b8a6',
    'growth': '#ec4899',
}


class FactorModelService:
    """
    Factor exposure and attribution calculator.
    Uses regression-based approach against factor ETF proxies.
    """

    def __init__(self):
        self._factor_returns_cache = {}
        self._cache_ts = None

    def get_factor_returns(self, period: str = '1y') -> Optional[pd.DataFrame]:
        """
        Fetch daily returns for all factor ETFs.

        Returns:
            DataFrame with columns for each factor, indexed by date
        """
        cache_key = period
        if (
            self._cache_ts
            and cache_key in self._factor_returns_cache
            and (datetime.now() - self._cache_ts).seconds < 3600
        ):
            return self._factor_returns_cache[cache_key]

        try:
            import yfinance as yf

            tickers_str = ' '.join(FACTOR_ETFS.values()) + ' SPY'
            data = yf.download(tickers_str, period=period, progress=False)

            if data.empty:
                return None

            # Handle multi-level columns from yfinance
            if isinstance(data.columns, pd.MultiIndex):
                close = data['Close']
            else:
                close = data

            returns = close.pct_change().dropna()

            # Rename columns to factor names
            rename_map = {v: k for k, v in FACTOR_ETFS.items()}
            rename_map['SPY'] = 'market'
            returns = returns.rename(columns=rename_map)

            self._factor_returns_cache[cache_key] = returns
            self._cache_ts = datetime.now()

            return returns

        except Exception:
            return None

    def calculate_factor_exposures(
        self,
        ticker: str,
        period: str = '1y'
    ) -> Optional[Dict]:
        """
        Calculate a stock's factor exposures using regression.

        Returns dict with factor betas, R-squared, and residual vol.
        """
        try:
            import yfinance as yf
            from sklearn.linear_model import LinearRegression

            factor_returns = self.get_factor_returns(period)
            if factor_returns is None:
                return None

            # Get stock returns
            stock_data = yf.download(ticker, period=period, progress=False)
            if stock_data.empty:
                return None

            if isinstance(stock_data.columns, pd.MultiIndex):
                stock_close = stock_data['Close'].iloc[:, 0]
            else:
                stock_close = stock_data['Close']

            stock_returns = stock_close.pct_change().dropna()

            # Align dates
            common_idx = factor_returns.index.intersection(stock_returns.index)
            if len(common_idx) < 60:
                return None

            y = stock_returns.loc[common_idx].values
            factor_cols = [c for c in factor_returns.columns if c != 'market']
            X = factor_returns.loc[common_idx, factor_cols].values
            market_ret = factor_returns.loc[common_idx, 'market'].values if 'market' in factor_returns.columns else None

            # Run regression
            model = LinearRegression()
            model.fit(X, y)

            betas = dict(zip(factor_cols, model.coef_))
            r_squared = model.score(X, y)
            residuals = y - model.predict(X)
            residual_vol = np.std(residuals) * np.sqrt(252)

            # Market beta (separate regression)
            market_beta = None
            if market_ret is not None:
                market_model = LinearRegression()
                market_model.fit(market_ret.reshape(-1, 1), y)
                market_beta = float(market_model.coef_[0])

            return {
                'ticker': ticker,
                'betas': betas,
                'market_beta': market_beta,
                'r_squared': r_squared,
                'residual_vol': residual_vol,
                'alpha': float(model.intercept_) * 252,  # Annualized
            }

        except Exception:
            return None

    def get_factor_performance(self, period: str = '1y') -> Optional[Dict]:
        """
        Get total returns for each factor over the period.

        Returns dict of factor -> total return %.
        """
        try:
            import yfinance as yf

            results = {}
            for factor_name, etf in FACTOR_ETFS.items():
                try:
                    data = yf.Ticker(etf).history(period=period)
                    if len(data) > 0:
                        total_return = (data['Close'].iloc[-1] / data['Close'].iloc[0] - 1) * 100
                        results[factor_name] = total_return
                except Exception:
                    results[factor_name] = 0.0

            return results

        except Exception:
            return None

    def get_portfolio_factor_exposures(
        self,
        holdings: Dict[str, float],
        period: str = '1y'
    ) -> Optional[Dict]:
        """
        Calculate aggregate factor exposures for a portfolio.

        Args:
            holdings: Dict of ticker -> weight (e.g. {'AAPL': 0.1, 'MSFT': 0.15})
            period: lookback period

        Returns:
            Dict with weighted average factor betas
        """
        aggregate = {}
        total_weight = 0

        for ticker, weight in holdings.items():
            exposures = self.calculate_factor_exposures(ticker, period)
            if exposures is not None:
                for factor, beta in exposures['betas'].items():
                    aggregate[factor] = aggregate.get(factor, 0) + beta * weight
                total_weight += weight

        if total_weight == 0:
            return None

        # Normalize
        for factor in aggregate:
            aggregate[factor] /= total_weight

        return {
            'portfolio_betas': aggregate,
            'total_weight_covered': total_weight,
        }


# Singleton instance
factor_service = FactorModelService()
