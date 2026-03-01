"""
ATLAS Quantitative Dashboard — Sample Data Generator
Purpose: Generates realistic multi-asset portfolio data for development and testing.
Replace with live data connectors in production.
"""
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
np.random.seed(42)
def generate_sample_portfolio(
    n_assets: int = 15,
    n_days: int = 756,  # 3 years
    start_date: str = "2022-01-03",
) -> dict:
    """
    Generates a realistic multi-asset portfolio dataset.
    Includes correlated assets with sector structure, regime shifts,
    and a benchmark series.
    """
    dates = pd.bdate_range(start=start_date, periods=n_days)
    # Asset universe with sector labels
    assets = {
        # Technology
        "NVDA": {"sector": "Technology", "style": "Growth"},
        "MSFT": {"sector": "Technology", "style": "Quality"},
        "ASML": {"sector": "Technology", "style": "Quality"},
        "AAPL": {"sector": "Technology", "style": "Quality"},
        # Financials
        "JPM": {"sector": "Financials", "style": "Value"},
        "BRK": {"sector": "Financials", "style": "Value"},
        "BAC": {"sector": "Financials", "style": "Value"},
        # Healthcare
        "LLY": {"sector": "Healthcare", "style": "Quality"},
        "UNH": {"sector": "Healthcare", "style": "Quality"},
        # Consumer
        "AMZN": {"sector": "Consumer", "style": "Growth"},
        "COST": {"sector": "Consumer", "style": "Quality"},
        # Energy
        "XOM": {"sector": "Energy", "style": "Value"},
        "SHB": {"sector": "Energy", "style": "Value"},
        # Industrials
        "CAT": {"sector": "Industrials", "style": "Cyclical"},
        "HON": {"sector": "Industrials", "style": "Quality"},
    }
    asset_names = list(assets.keys())[:n_assets]
    # Correlation structure (sector clustering)
    corr = np.eye(n_assets)
    sectors = [assets[a]["sector"] for a in asset_names]
    for i in range(n_assets):
        for j in range(n_assets):
            if i != j:
                same_sector = sectors[i] == sectors[j]
                corr[i, j] = np.random.uniform(0.55, 0.85) if same_sector else np.random.uniform(0.15, 0.45)
    # Ensure positive definite
    corr = (corr + corr.T) / 2
    min_eig = np.linalg.eigvalsh(corr).min()
    if min_eig < 0:
        corr += (-min_eig + 0.01) * np.eye(n_assets)
    # Daily volatilities (annualised → daily)
    ann_vols = np.random.uniform(0.18, 0.42, n_assets)
    daily_vols = ann_vols / np.sqrt(252)
    # Covariance matrix
    D = np.diag(daily_vols)
    cov = D @ corr @ D
    # Generate returns with two regimes
    regime_change = n_days // 2  # Regime shift midpoint
    # Calm regime (first half)
    returns_1 = np.random.multivariate_normal(
        mean=np.random.uniform(0.0003, 0.001, n_assets),
        cov=cov * 0.7,
        size=regime_change,
    )
    # Stressed regime (second half — higher vol, lower mean)
    returns_2 = np.random.multivariate_normal(
        mean=np.random.uniform(-0.0001, 0.0006, n_assets),
        cov=cov * 1.3,
        size=n_days - regime_change,
    )
    returns_raw = np.vstack([returns_1, returns_2])
    # Add fat tails via occasional shock days
    shock_days = np.random.choice(n_days, size=int(n_days * 0.02), replace=False)
    for day in shock_days:
        returns_raw[day] *= np.random.choice([-2.5, -2.0, -1.8, 1.8], p=[0.3, 0.3, 0.2, 0.2])
    asset_returns = pd.DataFrame(returns_raw, index=dates, columns=asset_names)
    # Portfolio weights (not equal weight — realistic active PM sizing)
    weights_raw = np.array([
        0.12, 0.10, 0.09, 0.08,  # Tech overweight
        0.07, 0.06, 0.05,         # Financials
        0.08, 0.07,               # Healthcare
        0.06, 0.05,               # Consumer
        0.06, 0.05,               # Energy
        0.04, 0.02,               # Industrials
    ])[:n_assets]
    weights_raw /= weights_raw.sum()
    weights = pd.Series(weights_raw, index=asset_names)
    # Portfolio returns
    portfolio_returns = (asset_returns * weights).sum(axis=1)
    # Benchmark (market-cap weighted, lower vol)
    bench_weights = np.ones(n_assets) / n_assets
    benchmark_returns = pd.Series(
        np.random.multivariate_normal(
            mean=np.full(n_assets, 0.0004),
            cov=cov * 0.85,
            size=n_days,
        ) @ bench_weights,
        index=dates,
        name="Benchmark",
    )
    # Sector allocation
    sector_weights = {}
    for asset, w in weights.items():
        s = assets[asset]["sector"]
        sector_weights[s] = sector_weights.get(s, 0) + w
    return {
        "portfolio_returns": portfolio_returns.rename("Portfolio"),
        "benchmark_returns": benchmark_returns,
        "asset_returns": asset_returns,
        "weights": weights,
        "assets_meta": {k: v for k, v in assets.items() if k in asset_names},
        "sector_weights": pd.Series(sector_weights),
        "dates": dates,
    }
