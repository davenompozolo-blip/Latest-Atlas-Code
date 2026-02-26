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

    @staticmethod
    def _ols(X: np.ndarray, y: np.ndarray):
        """
        Pure-numpy OLS regression. Returns (coefficients, intercept, r_squared).
        Avoids sklearn dependency entirely.
        """
        # Add intercept column
        X_b = np.column_stack([np.ones(len(X)), X])
        try:
            # Use least-squares solver (numpy built-in)
            result = np.linalg.lstsq(X_b, y, rcond=None)
            coeffs = result[0]
            intercept = float(coeffs[0])
            coef = coeffs[1:]
            # R-squared
            y_pred = X_b @ coeffs
            ss_res = np.sum((y - y_pred) ** 2)
            ss_tot = np.sum((y - np.mean(y)) ** 2)
            r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
            return coef, intercept, r2
        except Exception:
            return np.zeros(X.shape[1]), 0.0, 0.0

    def calculate_factor_exposures(
        self,
        ticker: str,
        period: str = '1y'
    ) -> Optional[Dict]:
        """
        Calculate a stock's factor exposures using OLS regression against
        factor ETF proxies. Uses pure numpy — no sklearn required.

        Falls back gracefully if some factor ETFs are unavailable, using
        whichever factors could be fetched. Minimum requirement: market (SPY)
        plus at least one factor ETF, or market-only beta.
        """
        try:
            import yfinance as yf

            factor_returns = self.get_factor_returns(period)

            # Get stock returns
            stock_data = yf.download(ticker, period=period, progress=False)
            if stock_data.empty:
                return None

            if isinstance(stock_data.columns, pd.MultiIndex):
                stock_close = stock_data['Close'].iloc[:, 0]
            else:
                stock_close = stock_data['Close']

            stock_returns = stock_close.pct_change().dropna()

            # ----------------------------------------------------------------
            # Case A: Full multi-factor regression (all factor ETFs available)
            # ----------------------------------------------------------------
            if factor_returns is not None and not factor_returns.empty:
                common_idx = factor_returns.index.intersection(stock_returns.index)
                if len(common_idx) >= 60:
                    y = stock_returns.loc[common_idx].values
                    factor_cols = [c for c in factor_returns.columns if c != 'market']
                    # Only use columns that actually have data (some ETFs may have failed)
                    valid_cols = [c for c in factor_cols if c in factor_returns.columns
                                  and factor_returns[c].loc[common_idx].notna().sum() >= 60]

                    if valid_cols:
                        X = factor_returns.loc[common_idx, valid_cols].fillna(0).values
                        coef, intercept, r2 = self._ols(X, y)
                        betas = dict(zip(valid_cols, [float(c) for c in coef]))
                        residuals = y - (X @ coef + intercept)
                        residual_vol = float(np.std(residuals) * np.sqrt(252))

                        # Market beta (single-factor)
                        market_beta = None
                        if 'market' in factor_returns.columns:
                            mkt = factor_returns.loc[common_idx, 'market'].fillna(0).values
                            mb_coef, _, _ = self._ols(mkt.reshape(-1, 1), y)
                            market_beta = float(mb_coef[0])

                        return {
                            'ticker': ticker,
                            'betas': betas,
                            'market_beta': market_beta,
                            'r_squared': r2,
                            'residual_vol': residual_vol,
                            'alpha': float(intercept) * 252,
                            'method': 'multi_factor',
                        }

            # ----------------------------------------------------------------
            # Case B: Market-only fallback (SPY beta only)
            # ----------------------------------------------------------------
            try:
                spy_data = yf.download('SPY', period=period, progress=False)
                if not spy_data.empty:
                    if isinstance(spy_data.columns, pd.MultiIndex):
                        spy_close = spy_data['Close'].iloc[:, 0]
                    else:
                        spy_close = spy_data['Close']
                    spy_returns = spy_close.pct_change().dropna()
                    common = stock_returns.index.intersection(spy_returns.index)
                    if len(common) >= 60:
                        y = stock_returns.loc[common].values
                        mkt = spy_returns.loc[common].values
                        mb_coef, intercept, r2 = self._ols(mkt.reshape(-1, 1), y)
                        market_beta = float(mb_coef[0])
                        # Approximate factor betas from market beta only
                        betas = {
                            'market_proxy': market_beta,
                        }
                        return {
                            'ticker': ticker,
                            'betas': betas,
                            'market_beta': market_beta,
                            'r_squared': r2,
                            'residual_vol': float(np.std(y - mkt * market_beta) * np.sqrt(252)),
                            'alpha': float(intercept) * 252,
                            'method': 'market_only',
                        }
            except Exception:
                pass

            return None

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
