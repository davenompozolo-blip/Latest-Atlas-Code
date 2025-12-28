"""
Portfolio Performance Simulator for Easy Equities

This module simulates historical portfolio performance by applying
current holdings weights to historical price data from Yahoo Finance.

IMPORTANT DISCLAIMER:
Simulated performance assumes static holdings throughout the lookback period.
Actual performance would differ based on when positions were actually
opened and closed. This is for analytical purposes only.

Author: ATLAS Terminal
Version: 1.0.0
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import streamlit as st


# =============================================================================
# SIMULATED RETURNS CALCULATION
# =============================================================================

def simulate_portfolio_returns(
    enriched_df: pd.DataFrame,
    price_histories: Dict[str, pd.Series],
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> pd.DataFrame:
    """
    Simulate historical portfolio returns using current weights.

    This function creates a synthetic performance history by assuming
    the current portfolio composition was held throughout the lookback period.

    Parameters:
    -----------
    enriched_df : pd.DataFrame
        Enriched portfolio DataFrame with Market_Value column
    price_histories : Dict[str, pd.Series]
        Dictionary of {ticker: price_series} from Yahoo Finance
    start_date : datetime, optional
        Start of simulation period
    end_date : datetime, optional
        End of simulation period (defaults to today)

    Returns:
    --------
    pd.DataFrame
        Simulated performance DataFrame with columns:
        - date (index)
        - portfolio_value
        - daily_return
        - cumulative_return
        - drawdown
    """
    if not price_histories:
        return pd.DataFrame()

    # Calculate current weights
    total_value = enriched_df['Market_Value'].sum()
    weights = {}
    for ticker in price_histories.keys():
        ticker_value = enriched_df.loc[enriched_df['Ticker'] == ticker, 'Market_Value'].sum()
        weights[ticker] = ticker_value / total_value if total_value > 0 else 0

    # Align all price series
    prices_df = pd.DataFrame(price_histories)

    if start_date:
        prices_df = prices_df[prices_df.index >= start_date]
    if end_date:
        prices_df = prices_df[prices_df.index <= end_date]

    # Forward-fill missing prices
    prices_df = prices_df.ffill()

    # Calculate returns
    returns_df = prices_df.pct_change()

    # Calculate weighted portfolio returns
    portfolio_returns = pd.Series(0.0, index=returns_df.index)
    for ticker, weight in weights.items():
        if ticker in returns_df.columns:
            portfolio_returns += returns_df[ticker].fillna(0) * weight

    # Build result DataFrame
    result = pd.DataFrame(index=returns_df.index)
    result['daily_return'] = portfolio_returns
    result['cumulative_return'] = (1 + portfolio_returns).cumprod() - 1

    # Calculate portfolio value (normalized to current value)
    current_value = total_value
    result['portfolio_value'] = current_value * (1 + result['cumulative_return'])

    # Calculate drawdown
    running_max = result['portfolio_value'].expanding().max()
    result['drawdown'] = (result['portfolio_value'] - running_max) / running_max

    # Add volatility (rolling 20-day)
    result['rolling_volatility'] = result['daily_return'].rolling(20).std() * np.sqrt(252)

    return result.dropna()


# =============================================================================
# BENCHMARK COMPARISON
# =============================================================================

def simulate_benchmark_comparison(
    simulated_returns: pd.DataFrame,
    benchmark_ticker: str = "^GSPC",  # S&P 500
    benchmark_name: str = "S&P 500"
) -> pd.DataFrame:
    """
    Compare simulated portfolio returns against a benchmark.

    Parameters:
    -----------
    simulated_returns : pd.DataFrame
        Output from simulate_portfolio_returns()
    benchmark_ticker : str
        Yahoo Finance ticker for benchmark
    benchmark_name : str
        Display name for benchmark

    Returns:
    --------
    pd.DataFrame
        Comparison DataFrame with portfolio and benchmark metrics
    """
    import yfinance as yf

    if simulated_returns.empty:
        return pd.DataFrame()

    # Get date range from simulated returns
    start_date = simulated_returns.index.min()
    end_date = simulated_returns.index.max()

    # Fetch benchmark data
    try:
        benchmark = yf.Ticker(benchmark_ticker)
        bench_hist = benchmark.history(start=start_date, end=end_date)

        if bench_hist.empty:
            return simulated_returns

        # Calculate benchmark returns
        bench_returns = bench_hist['Close'].pct_change()
        bench_cumulative = (1 + bench_returns).cumprod() - 1

        # Align with portfolio
        comparison = simulated_returns.copy()
        comparison[f'{benchmark_name}_return'] = bench_returns.reindex(comparison.index)
        comparison[f'{benchmark_name}_cumulative'] = bench_cumulative.reindex(comparison.index)

        # Calculate excess return
        comparison['excess_return'] = comparison['cumulative_return'] - comparison[f'{benchmark_name}_cumulative']

        # Calculate Information Ratio
        active_returns = comparison['daily_return'] - comparison[f'{benchmark_name}_return']
        if active_returns.std() > 0:
            comparison['information_ratio'] = (active_returns.mean() / active_returns.std()) * np.sqrt(252)

        return comparison

    except Exception as e:
        print(f"Warning: Benchmark fetch failed: {e}")
        return simulated_returns


# =============================================================================
# PERIOD RETURN CALCULATIONS
# =============================================================================

def calculate_period_returns(simulated_returns: pd.DataFrame) -> Dict:
    """
    Calculate returns for standard periods (1M, 3M, 6M, YTD, 1Y).

    Parameters:
    -----------
    simulated_returns : pd.DataFrame
        Output from simulate_portfolio_returns()

    Returns:
    --------
    dict
        Period returns and metrics
    """
    if simulated_returns.empty:
        return {}

    today = simulated_returns.index.max()

    periods = {
        '1W': today - timedelta(days=7),
        '1M': today - timedelta(days=30),
        '3M': today - timedelta(days=90),
        '6M': today - timedelta(days=180),
        'YTD': datetime(today.year, 1, 1),
        '1Y': today - timedelta(days=365),
    }

    results = {}

    for period_name, start_date in periods.items():
        period_data = simulated_returns[simulated_returns.index >= start_date]

        if len(period_data) < 2:
            continue

        start_value = period_data['portfolio_value'].iloc[0]
        end_value = period_data['portfolio_value'].iloc[-1]

        results[period_name] = {
            'return': (end_value / start_value - 1) * 100,
            'volatility': period_data['daily_return'].std() * np.sqrt(252) * 100,
            'max_drawdown': period_data['drawdown'].min() * 100,
            'sharpe': (period_data['daily_return'].mean() / period_data['daily_return'].std() * np.sqrt(252)) if period_data['daily_return'].std() > 0 else 0,
            'trading_days': len(period_data),
            'start_date': period_data.index.min().strftime('%Y-%m-%d'),
            'end_date': period_data.index.max().strftime('%Y-%m-%d')
        }

    return results


# =============================================================================
# DISCLAIMER GENERATOR
# =============================================================================

def get_simulation_disclaimer() -> str:
    """Generate standard disclaimer for simulated performance."""
    return """
    **SIMULATED PERFORMANCE DISCLAIMER**

    The performance data shown is **simulated** based on:
    - Current portfolio holdings and weights
    - Historical prices from Yahoo Finance
    - **Assumption of static holdings** throughout the lookback period

    **This is NOT actual performance.** Real returns would differ based on:
    - Actual entry/exit dates for each position
    - Transaction costs and slippage
    - Currency fluctuations
    - Dividend timing

    Use this data for analytical purposes only. Past performance, even actual,
    does not guarantee future results.
    """


def render_simulation_warning():
    """Render a Streamlit warning about simulated data."""
    st.warning(
        "**Simulated Performance** - These metrics assume your current holdings "
        "were held throughout the entire period. Actual results depend on when "
        "positions were opened/closed."
    )
