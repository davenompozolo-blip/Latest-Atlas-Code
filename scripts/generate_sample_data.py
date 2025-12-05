"""
ATLAS TERMINAL v10.0 - SAMPLE DATA GENERATOR
=============================================

Generate sample portfolio data for testing and demonstrations.

Usage:
    python scripts/generate_sample_data.py
    python scripts/generate_sample_data.py --tickers 20 --days 500
"""

import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import argparse
import json


# ===================================================================
# CONFIGURATION
# ===================================================================

# Default tickers and their characteristics
DEFAULT_TICKERS = {
    # Tech stocks (high growth, high volatility)
    'AAPL': {'mean_return': 0.0012, 'volatility': 0.025, 'sector': 'Technology'},
    'GOOGL': {'mean_return': 0.0010, 'volatility': 0.028, 'sector': 'Technology'},
    'MSFT': {'mean_return': 0.0011, 'volatility': 0.022, 'sector': 'Technology'},
    'AMZN': {'mean_return': 0.0013, 'volatility': 0.030, 'sector': 'Technology'},
    'TSLA': {'mean_return': 0.0015, 'volatility': 0.045, 'sector': 'Technology'},
    'NVDA': {'mean_return': 0.0018, 'volatility': 0.040, 'sector': 'Technology'},
    'META': {'mean_return': 0.0011, 'volatility': 0.032, 'sector': 'Technology'},

    # Financial stocks (moderate growth, moderate volatility)
    'JPM': {'mean_return': 0.0008, 'volatility': 0.020, 'sector': 'Finance'},
    'BAC': {'mean_return': 0.0007, 'volatility': 0.022, 'sector': 'Finance'},
    'WFC': {'mean_return': 0.0006, 'volatility': 0.024, 'sector': 'Finance'},
    'C': {'mean_return': 0.0007, 'volatility': 0.026, 'sector': 'Finance'},
    'GS': {'mean_return': 0.0009, 'volatility': 0.025, 'sector': 'Finance'},

    # Healthcare (stable growth, low volatility)
    'JNJ': {'mean_return': 0.0006, 'volatility': 0.015, 'sector': 'Healthcare'},
    'PFE': {'mean_return': 0.0005, 'volatility': 0.018, 'sector': 'Healthcare'},
    'UNH': {'mean_return': 0.0008, 'volatility': 0.017, 'sector': 'Healthcare'},
    'ABBV': {'mean_return': 0.0007, 'volatility': 0.019, 'sector': 'Healthcare'},

    # Consumer
    'WMT': {'mean_return': 0.0006, 'volatility': 0.016, 'sector': 'Consumer'},
    'PG': {'mean_return': 0.0005, 'volatility': 0.014, 'sector': 'Consumer'},
    'KO': {'mean_return': 0.0004, 'volatility': 0.013, 'sector': 'Consumer'},
    'MCD': {'mean_return': 0.0006, 'volatility': 0.015, 'sector': 'Consumer'},

    # Energy
    'XOM': {'mean_return': 0.0007, 'volatility': 0.023, 'sector': 'Energy'},
    'CVX': {'mean_return': 0.0007, 'volatility': 0.024, 'sector': 'Energy'},
}


# ===================================================================
# RETURN GENERATION
# ===================================================================

def make_positive_definite(matrix, min_eigenvalue=1e-6):
    """
    Fix non-positive-definite matrices using eigenvalue correction.

    This ensures the correlation matrix can be used with Cholesky decomposition
    by correcting any negative or near-zero eigenvalues.

    Args:
        matrix: Square matrix (typically correlation matrix)
        min_eigenvalue: Minimum eigenvalue threshold

    Returns:
        Positive definite matrix
    """
    # Ensure symmetry
    matrix = (matrix + matrix.T) / 2

    # Eigenvalue decomposition
    eigenvalues, eigenvectors = np.linalg.eigh(matrix)

    # Correct eigenvalues
    eigenvalues = np.maximum(eigenvalues, min_eigenvalue)

    # Reconstruct matrix
    fixed = eigenvectors @ np.diag(eigenvalues) @ eigenvectors.T

    # Ensure symmetry again
    return (fixed + fixed.T) / 2


def generate_correlated_returns(
    tickers: list,
    n_days: int,
    correlation_level: float = 0.3
) -> pd.DataFrame:
    """
    Generate correlated returns for multiple assets.

    Args:
        tickers: List of ticker symbols
        n_days: Number of trading days
        correlation_level: Average correlation between assets (0-1)

    Returns:
        DataFrame of daily returns
    """
    n_assets = len(tickers)

    # Create correlation matrix
    correlation_matrix = np.eye(n_assets)
    for i in range(n_assets):
        for j in range(i+1, n_assets):
            # Higher correlation within same sector
            ticker_i = tickers[i]
            ticker_j = tickers[j]

            if (ticker_i in DEFAULT_TICKERS and ticker_j in DEFAULT_TICKERS):
                sector_i = DEFAULT_TICKERS[ticker_i]['sector']
                sector_j = DEFAULT_TICKERS[ticker_j]['sector']

                if sector_i == sector_j:
                    corr = np.random.uniform(0.5, 0.8)  # High within sector
                else:
                    corr = np.random.uniform(0.2, 0.5)  # Lower across sectors
            else:
                corr = correlation_level

            correlation_matrix[i, j] = corr
            correlation_matrix[j, i] = corr

    # Generate random returns
    np.random.seed(42)

    # Generate uncorrelated returns
    uncorrelated_returns = np.random.randn(n_days, n_assets)

    # Fix correlation matrix to ensure positive definiteness
    correlation_matrix = make_positive_definite(correlation_matrix)

    # Apply correlation using Cholesky decomposition
    cholesky = np.linalg.cholesky(correlation_matrix)
    correlated_returns = uncorrelated_returns @ cholesky.T

    # Scale by volatility and add mean
    returns_data = {}
    for i, ticker in enumerate(tickers):
        if ticker in DEFAULT_TICKERS:
            mean = DEFAULT_TICKERS[ticker]['mean_return']
            vol = DEFAULT_TICKERS[ticker]['volatility']
        else:
            mean = 0.0008
            vol = 0.020

        returns = correlated_returns[:, i] * vol + mean
        returns_data[ticker] = returns

    # Create DataFrame
    end_date = datetime.now()
    start_date = end_date - timedelta(days=int(n_days * 1.4))  # Account for weekends
    date_range = pd.date_range(start=start_date, end=end_date, freq='B')[:n_days]

    returns_df = pd.DataFrame(returns_data, index=date_range)

    return returns_df


# ===================================================================
# PRICE GENERATION
# ===================================================================

def returns_to_prices(
    returns: pd.DataFrame,
    initial_prices: dict = None
) -> pd.DataFrame:
    """
    Convert returns to price series.

    Args:
        returns: DataFrame of daily returns
        initial_prices: Dict of initial prices (optional)

    Returns:
        DataFrame of prices
    """
    if initial_prices is None:
        initial_prices = {ticker: 100.0 for ticker in returns.columns}

    prices = {}

    for ticker in returns.columns:
        initial = initial_prices.get(ticker, 100.0)

        # Calculate cumulative returns
        cumulative = (1 + returns[ticker]).cumprod()

        # Scale to initial price
        prices[ticker] = initial * cumulative

    return pd.DataFrame(prices, index=returns.index)


# ===================================================================
# PORTFOLIO GENERATION
# ===================================================================

def generate_sample_portfolio(
    tickers: list = None,
    leverage: float = 2.0
) -> pd.DataFrame:
    """
    Generate sample portfolio with positions.

    Args:
        tickers: List of tickers (uses defaults if None)
        leverage: Portfolio leverage multiplier

    Returns:
        DataFrame with portfolio positions
    """
    if tickers is None:
        tickers = list(DEFAULT_TICKERS.keys())[:10]

    # Generate random weights
    np.random.seed(42)
    raw_weights = np.random.uniform(0.5, 2.0, len(tickers))
    weights = raw_weights / raw_weights.sum()

    # Total equity
    total_equity = 100000  # $100k

    # Generate positions
    positions = []

    for i, ticker in enumerate(tickers):
        weight = weights[i]
        equity = total_equity * weight

        # With leverage
        position_value = equity * leverage
        cost_basis = position_value

        # Simulate some profit/loss (±20%)
        price_change = np.random.uniform(-0.20, 0.20)
        current_value = position_value * (1 + price_change)

        # Current price (random)
        current_price = np.random.uniform(50, 500)
        shares = current_value / current_price

        positions.append({
            'ticker': ticker,
            'shares': shares,
            'purchase_price': cost_basis / shares,
            'current_price': current_price,
            'cost_basis': cost_basis,
            'current_value': current_value,
            'equity': equity,
            'sector': DEFAULT_TICKERS.get(ticker, {}).get('sector', 'Unknown')
        })

    return pd.DataFrame(positions)


# ===================================================================
# FILE SAVING
# ===================================================================

def save_returns_csv(returns: pd.DataFrame, filename: str = 'sample_returns.csv'):
    """Save returns to CSV"""
    output_path = PROJECT_ROOT / 'data' / filename
    returns.to_csv(output_path)
    print(f"✅ Saved returns: {output_path}")
    print(f"   Shape: {returns.shape}")
    print(f"   Date range: {returns.index[0]} to {returns.index[-1]}")


def save_prices_csv(prices: pd.DataFrame, filename: str = 'sample_prices.csv'):
    """Save prices to CSV"""
    output_path = PROJECT_ROOT / 'data' / filename
    prices.to_csv(output_path)
    print(f"✅ Saved prices: {output_path}")
    print(f"   Shape: {prices.shape}")
    print(f"   Price range: ${prices.min().min():.2f} to ${prices.max().max():.2f}")


def save_portfolio_csv(portfolio: pd.DataFrame, filename: str = 'sample_portfolio.csv'):
    """Save portfolio to CSV"""
    output_path = PROJECT_ROOT / 'data' / filename
    portfolio.to_csv(output_path, index=False)
    print(f"✅ Saved portfolio: {output_path}")
    print(f"   Positions: {len(portfolio)}")
    print(f"   Total value: ${portfolio['current_value'].sum():,.2f}")


def save_metadata_json(metadata: dict, filename: str = 'sample_metadata.json'):
    """Save metadata to JSON"""
    output_path = PROJECT_ROOT / 'data' / filename
    with open(output_path, 'w') as f:
        json.dump(metadata, f, indent=2, default=str)
    print(f"✅ Saved metadata: {output_path}")


# ===================================================================
# MAIN
# ===================================================================

def main():
    """Generate all sample data"""

    parser = argparse.ArgumentParser(description='Generate sample portfolio data')
    parser.add_argument('--tickers', type=int, default=10,
                       help='Number of tickers (default: 10)')
    parser.add_argument('--days', type=int, default=756,  # 3 years
                       help='Number of trading days (default: 756)')
    parser.add_argument('--leverage', type=float, default=2.0,
                       help='Portfolio leverage (default: 2.0)')
    parser.add_argument('--correlation', type=float, default=0.3,
                       help='Average correlation (default: 0.3)')

    args = parser.parse_args()

    print("="*80)
    print("🎲 ATLAS TERMINAL - SAMPLE DATA GENERATOR")
    print("="*80)

    # Select tickers
    available_tickers = list(DEFAULT_TICKERS.keys())
    selected_tickers = available_tickers[:args.tickers]

    print(f"\n📊 Configuration:")
    print(f"   Tickers: {args.tickers}")
    print(f"   Days: {args.days}")
    print(f"   Leverage: {args.leverage}x")
    print(f"   Correlation: {args.correlation:.2f}")

    print(f"\n🔤 Selected Tickers:")
    for ticker in selected_tickers:
        info = DEFAULT_TICKERS[ticker]
        print(f"   {ticker}: {info['sector']} (μ={info['mean_return']:.4f}, σ={info['volatility']:.3f})")

    # Generate returns
    print(f"\n📈 Generating returns...")
    returns = generate_correlated_returns(
        selected_tickers,
        args.days,
        args.correlation
    )
    print(f"   ✅ Generated {returns.shape[0]} days × {returns.shape[1]} assets")
    print(f"   Average return: {returns.mean().mean()*252*100:.2f}% annual")
    print(f"   Average volatility: {returns.std().mean()*np.sqrt(252)*100:.2f}% annual")

    # Generate prices
    print(f"\n💵 Generating prices...")
    initial_prices = {ticker: np.random.uniform(50, 500) for ticker in selected_tickers}
    prices = returns_to_prices(returns, initial_prices)
    print(f"   ✅ Generated price series")

    # Generate portfolio
    print(f"\n💼 Generating portfolio...")
    portfolio = generate_sample_portfolio(selected_tickers, args.leverage)
    print(f"   ✅ Generated {len(portfolio)} positions")
    print(f"   Total equity: ${portfolio['equity'].sum():,.2f}")
    print(f"   Total value: ${portfolio['current_value'].sum():,.2f}")
    print(f"   Return: {((portfolio['current_value'].sum() / portfolio['cost_basis'].sum()) - 1) * 100:.2f}%")

    # Create metadata
    metadata = {
        'generated_at': datetime.now().isoformat(),
        'tickers': selected_tickers,
        'n_days': args.days,
        'leverage': args.leverage,
        'correlation': args.correlation,
        'date_range': {
            'start': returns.index[0].isoformat(),
            'end': returns.index[-1].isoformat()
        },
        'statistics': {
            'mean_return': float(returns.mean().mean() * 252),
            'mean_volatility': float(returns.std().mean() * np.sqrt(252)),
            'total_value': float(portfolio['current_value'].sum())
        }
    }

    # Save all data
    print(f"\n💾 Saving data...")
    save_returns_csv(returns)
    save_prices_csv(prices)
    save_portfolio_csv(portfolio)
    save_metadata_json(metadata)

    print("\n" + "="*80)
    print("✅ SAMPLE DATA GENERATED SUCCESSFULLY!")
    print("="*80)

    print("\n📁 Output files:")
    print("   data/sample_returns.csv")
    print("   data/sample_prices.csv")
    print("   data/sample_portfolio.csv")
    print("   data/sample_metadata.json")

    print("\n💡 Usage:")
    print("   # Load in Python:")
    print("   import pandas as pd")
    print("   returns = pd.read_csv('data/sample_returns.csv', index_col=0, parse_dates=True)")
    print("   portfolio = pd.read_csv('data/sample_portfolio.csv')")

    print("\n🚀 Next steps:")
    print("   1. Test with quant optimizer:")
    print("      python quant_optimizer/atlas_quant_portfolio_optimizer.py")
    print("   2. Launch ATLAS Terminal:")
    print("      streamlit run atlas_app.py")


if __name__ == '__main__':
    main()
