"""
Yahoo Finance Enrichment Layer for Easy Equities Portfolios

This module fetches historical data from Yahoo Finance to enable
risk analytics, performance simulation, and optimization for EE portfolios.

Author: ATLAS Terminal
Version: 1.0.0
"""

import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import streamlit as st
from functools import lru_cache
import warnings
warnings.filterwarnings('ignore')


# =============================================================================
# TICKER CONVERSION UTILITIES
# =============================================================================

def convert_ee_ticker_to_yahoo(ee_ticker: str) -> str:
    """
    Convert Easy Equities ticker format to Yahoo Finance format.

    Easy Equities uses: EQU.ZA.BTI (prefix.exchange.symbol)
    Yahoo Finance uses: BTI.JO (symbol.exchange)

    Special cases:
    - JSE stocks: BTI → BTI.JO
    - US stocks: AAPL → AAPL (no suffix)
    - ETFs: STXNDQ → STXNDQ.JO
    - Crypto: EC10 → Custom handling

    Parameters:
    -----------
    ee_ticker : str
        Ticker in Easy Equities format

    Returns:
    --------
    str
        Ticker in Yahoo Finance format
    """
    # Remove EQU.ZA. prefix if present
    if ee_ticker.startswith('EQU.ZA.'):
        ticker = ee_ticker.replace('EQU.ZA.', '')
    else:
        ticker = ee_ticker

    # Known US tickers (add more as needed)
    us_tickers = [
        'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA',
        'BRK.A', 'BRK.B', 'JPM', 'JNJ', 'V', 'PG', 'UNH', 'HD', 'MA',
        'DIS', 'PYPL', 'NFLX', 'ADBE', 'CRM', 'INTC', 'AMD', 'QCOM'
    ]

    # Known crypto/special tickers that need custom handling
    crypto_tickers = ['EC10', 'BITCOIN', 'ETH', 'BTC']

    # Check if it's a US ticker
    if ticker.upper() in us_tickers:
        return ticker.upper()

    # Check if it's crypto (skip Yahoo enrichment)
    if ticker.upper() in crypto_tickers:
        return None  # Signal to skip Yahoo enrichment

    # Assume JSE ticker - add .JO suffix
    return f"{ticker}.JO"


def get_display_ticker(ee_ticker: str) -> str:
    """Get clean display ticker without prefixes."""
    if ee_ticker.startswith('EQU.ZA.'):
        return ee_ticker.replace('EQU.ZA.', '')
    return ee_ticker


# =============================================================================
# CACHING LAYER
# =============================================================================

@st.cache_data(ttl=3600)  # Cache for 1 hour
def fetch_yahoo_data(yahoo_ticker: str, period: str = '1y') -> Optional[pd.DataFrame]:
    """
    Fetch historical data from Yahoo Finance with caching.

    Parameters:
    -----------
    yahoo_ticker : str
        Ticker in Yahoo Finance format
    period : str
        Data period ('1mo', '3mo', '6mo', '1y', '2y', '5y', 'max')

    Returns:
    --------
    pd.DataFrame or None
        Historical OHLCV data or None if fetch fails
    """
    if yahoo_ticker is None:
        return None

    try:
        stock = yf.Ticker(yahoo_ticker)
        hist = stock.history(period=period)

        if hist.empty:
            print(f"Warning: No data returned for {yahoo_ticker}")
            return None

        return hist
    except Exception as e:
        print(f"Warning: Yahoo Finance fetch failed for {yahoo_ticker}: {e}")
        return None


@st.cache_data(ttl=3600)
def fetch_yahoo_info(yahoo_ticker: str) -> Optional[Dict]:
    """
    Fetch company info from Yahoo Finance with caching.

    Parameters:
    -----------
    yahoo_ticker : str
        Ticker in Yahoo Finance format

    Returns:
    --------
    dict or None
        Company info dictionary or None if fetch fails
    """
    if yahoo_ticker is None:
        return None

    try:
        stock = yf.Ticker(yahoo_ticker)
        info = stock.info

        if not info or info.get('regularMarketPrice') is None:
            return None

        return info
    except Exception as e:
        print(f"Warning: Yahoo Finance info fetch failed for {yahoo_ticker}: {e}")
        return None


# =============================================================================
# SINGLE TICKER ENRICHMENT
# =============================================================================

def enrich_single_ticker(ee_ticker: str, period: str = '1y') -> Dict:
    """
    Enrich a single ticker with Yahoo Finance data.

    Parameters:
    -----------
    ee_ticker : str
        Ticker in Easy Equities format
    period : str
        Historical data period

    Returns:
    --------
    dict
        Enrichment data including sector, beta, volatility, history
    """
    yahoo_ticker = convert_ee_ticker_to_yahoo(ee_ticker)
    display_ticker = get_display_ticker(ee_ticker)

    result = {
        'ee_ticker': ee_ticker,
        'display_ticker': display_ticker,
        'yahoo_ticker': yahoo_ticker,
        'sector': 'Unknown',
        'industry': 'Unknown',
        'beta': 1.0,
        'volatility_annual': None,
        'volatility_daily': None,
        'avg_daily_return': None,
        'price_history': None,
        'returns_history': None,
        'enrichment_success': False,
        'enrichment_timestamp': datetime.now().isoformat()
    }

    # Skip if no valid Yahoo ticker (e.g., crypto)
    if yahoo_ticker is None:
        result['sector'] = 'Cryptocurrency'
        result['skip_reason'] = 'No Yahoo Finance equivalent'
        return result

    # Fetch company info
    info = fetch_yahoo_info(yahoo_ticker)
    if info:
        result['sector'] = info.get('sector', 'Unknown')
        result['industry'] = info.get('industry', 'Unknown')
        result['beta'] = info.get('beta', 1.0) or 1.0
        result['market_cap'] = info.get('marketCap')
        result['pe_ratio'] = info.get('trailingPE')
        result['dividend_yield'] = info.get('dividendYield')
        result['fifty_two_week_high'] = info.get('fiftyTwoWeekHigh')
        result['fifty_two_week_low'] = info.get('fiftyTwoWeekLow')

    # Fetch historical data
    hist = fetch_yahoo_data(yahoo_ticker, period)
    if hist is not None and len(hist) > 20:  # Need at least 20 data points
        # Calculate returns
        returns = hist['Close'].pct_change().dropna()

        result['price_history'] = hist['Close']
        result['returns_history'] = returns
        result['volatility_daily'] = returns.std()
        result['volatility_annual'] = returns.std() * np.sqrt(252)
        result['avg_daily_return'] = returns.mean()
        result['total_return'] = (hist['Close'].iloc[-1] / hist['Close'].iloc[0] - 1)
        result['enrichment_success'] = True

    return result


# =============================================================================
# PORTFOLIO-LEVEL ENRICHMENT
# =============================================================================

def enrich_portfolio(ee_df: pd.DataFrame, period: str = '1y',
                     progress_callback=None) -> Tuple[pd.DataFrame, Dict]:
    """
    Enrich entire Easy Equities portfolio with Yahoo Finance data.

    This is the main entry point for portfolio enrichment.

    Parameters:
    -----------
    ee_df : pd.DataFrame
        Easy Equities portfolio DataFrame with columns:
        Ticker, Shares, Market_Value, Purchase_Value, etc.
    period : str
        Historical data period for Yahoo Finance
    progress_callback : callable, optional
        Function to call with progress updates (0.0 to 1.0)

    Returns:
    --------
    Tuple[pd.DataFrame, Dict]
        - Enriched DataFrame with additional columns
        - Dictionary with portfolio-level metrics and price histories
    """
    enriched_df = ee_df.copy()

    # Initialize new columns
    enriched_df['Sector'] = 'Unknown'
    enriched_df['Industry'] = 'Unknown'
    enriched_df['Beta'] = 1.0
    enriched_df['Volatility'] = None
    enriched_df['Yahoo_Ticker'] = None
    enriched_df['Enrichment_Success'] = False

    # Storage for historical data
    price_histories = {}
    returns_histories = {}
    enrichment_details = {}

    # Get unique tickers
    tickers = enriched_df['Ticker'].unique().tolist()
    total_tickers = len(tickers)

    # Enrich each ticker
    for i, ticker in enumerate(tickers):
        if progress_callback:
            progress_callback((i + 1) / total_tickers)

        # Enrich single ticker
        enrichment = enrich_single_ticker(ticker, period)
        enrichment_details[ticker] = enrichment

        # Update DataFrame rows for this ticker
        mask = enriched_df['Ticker'] == ticker
        enriched_df.loc[mask, 'Sector'] = enrichment['sector']
        enriched_df.loc[mask, 'Industry'] = enrichment['industry']
        enriched_df.loc[mask, 'Beta'] = enrichment['beta']
        enriched_df.loc[mask, 'Volatility'] = enrichment['volatility_annual']
        enriched_df.loc[mask, 'Yahoo_Ticker'] = enrichment['yahoo_ticker']
        enriched_df.loc[mask, 'Enrichment_Success'] = enrichment['enrichment_success']

        # Store histories
        if enrichment['price_history'] is not None:
            price_histories[ticker] = enrichment['price_history']
            returns_histories[ticker] = enrichment['returns_history']

    # Calculate portfolio-level metrics
    portfolio_metrics = calculate_portfolio_metrics(
        enriched_df,
        price_histories,
        returns_histories
    )

    # Package results
    result = {
        'price_histories': price_histories,
        'returns_histories': returns_histories,
        'enrichment_details': enrichment_details,
        'portfolio_metrics': portfolio_metrics,
        'enrichment_timestamp': datetime.now().isoformat(),
        'period': period,
        'tickers_enriched': sum(1 for t in enrichment_details.values() if t['enrichment_success']),
        'tickers_total': total_tickers
    }

    return enriched_df, result


# =============================================================================
# PORTFOLIO METRICS CALCULATION
# =============================================================================

def calculate_portfolio_metrics(enriched_df: pd.DataFrame,
                                price_histories: Dict[str, pd.Series],
                                returns_histories: Dict[str, pd.Series]) -> Dict:
    """
    Calculate portfolio-level risk and return metrics.

    Parameters:
    -----------
    enriched_df : pd.DataFrame
        Enriched portfolio DataFrame with weights
    price_histories : Dict
        Dictionary of {ticker: price_series}
    returns_histories : Dict
        Dictionary of {ticker: returns_series}

    Returns:
    --------
    dict
        Portfolio metrics including volatility, beta, sharpe, etc.
    """
    metrics = {
        'portfolio_volatility_annual': None,
        'portfolio_beta': None,
        'portfolio_sharpe': None,
        'simulated_returns': None,
        'correlation_matrix': None,
        'covariance_matrix': None,
        'var_95': None,
        'var_99': None,
        'max_drawdown': None,
        'calculation_success': False
    }

    # Need at least 1 ticker with data
    if len(returns_histories) < 1:
        return metrics

    # Calculate weights
    total_value = enriched_df['Market_Value'].sum()
    weights = {}
    for ticker in returns_histories.keys():
        ticker_value = enriched_df.loc[enriched_df['Ticker'] == ticker, 'Market_Value'].sum()
        weights[ticker] = ticker_value / total_value if total_value > 0 else 0

    # Align all return series to common dates
    returns_df = pd.DataFrame(returns_histories)
    returns_df = returns_df.dropna()

    if len(returns_df) < 20:
        return metrics

    # Calculate portfolio returns (simulated assuming static weights)
    portfolio_returns = pd.Series(0.0, index=returns_df.index)
    for ticker, weight in weights.items():
        if ticker in returns_df.columns:
            portfolio_returns += returns_df[ticker] * weight

    metrics['simulated_returns'] = portfolio_returns

    # Volatility
    metrics['portfolio_volatility_daily'] = portfolio_returns.std()
    metrics['portfolio_volatility_annual'] = portfolio_returns.std() * np.sqrt(252)

    # Beta (vs equal-weighted benchmark of holdings as proxy)
    # In practice, you'd want to compare vs a real benchmark like JSE Top 40
    benchmark_returns = returns_df.mean(axis=1)  # Equal-weighted proxy
    if benchmark_returns.var() > 0:
        covariance = portfolio_returns.cov(benchmark_returns)
        variance = benchmark_returns.var()
        metrics['portfolio_beta'] = covariance / variance
    else:
        metrics['portfolio_beta'] = 1.0

    # Weighted beta from individual betas
    weighted_beta = 0.0
    for ticker, weight in weights.items():
        ticker_beta = enriched_df.loc[enriched_df['Ticker'] == ticker, 'Beta'].values
        if len(ticker_beta) > 0 and pd.notna(ticker_beta[0]):
            weighted_beta += weight * ticker_beta[0]
        else:
            weighted_beta += weight * 1.0
    metrics['portfolio_beta_weighted'] = weighted_beta

    # Sharpe Ratio (assuming 5% risk-free rate)
    risk_free_daily = 0.05 / 252
    excess_returns = portfolio_returns - risk_free_daily
    if portfolio_returns.std() > 0:
        metrics['portfolio_sharpe'] = (excess_returns.mean() / portfolio_returns.std()) * np.sqrt(252)

    # Value at Risk
    metrics['var_95'] = np.percentile(portfolio_returns, 5)
    metrics['var_99'] = np.percentile(portfolio_returns, 1)

    # Maximum Drawdown
    cumulative = (1 + portfolio_returns).cumprod()
    running_max = cumulative.expanding().max()
    drawdowns = (cumulative - running_max) / running_max
    metrics['max_drawdown'] = drawdowns.min()

    # Correlation Matrix
    if len(returns_df.columns) > 1:
        metrics['correlation_matrix'] = returns_df.corr()
        metrics['covariance_matrix'] = returns_df.cov() * 252  # Annualized

    # Sortino Ratio (downside deviation)
    negative_returns = portfolio_returns[portfolio_returns < 0]
    if len(negative_returns) > 0:
        downside_std = negative_returns.std() * np.sqrt(252)
        if downside_std > 0:
            metrics['sortino_ratio'] = (portfolio_returns.mean() * 252 - 0.05) / downside_std

    metrics['calculation_success'] = True

    return metrics


# =============================================================================
# HELPER FUNCTIONS FOR MODULE INTEGRATION
# =============================================================================

def get_enriched_data_for_module(module_name: str) -> Tuple[Optional[pd.DataFrame], Optional[Dict]]:
    """
    Retrieve enriched portfolio data from session state.

    Parameters:
    -----------
    module_name : str
        Name of the requesting module (for logging)

    Returns:
    --------
    Tuple[DataFrame, Dict] or (None, None)
        Enriched DataFrame and enrichment data, or None if not available
    """
    if 'enriched_portfolio_df' not in st.session_state:
        return None, None

    if 'enrichment_data' not in st.session_state:
        return st.session_state.get('enriched_portfolio_df'), None

    return (
        st.session_state['enriched_portfolio_df'],
        st.session_state['enrichment_data']
    )


def ensure_portfolio_enriched(ee_df: pd.DataFrame,
                              force_refresh: bool = False,
                              period: str = '1y') -> Tuple[pd.DataFrame, Dict]:
    """
    Ensure portfolio is enriched, enriching if necessary.

    This function checks if enrichment exists and is recent,
    otherwise triggers enrichment.

    Parameters:
    -----------
    ee_df : pd.DataFrame
        Easy Equities portfolio DataFrame
    force_refresh : bool
        Force re-enrichment even if recent data exists
    period : str
        Historical data period

    Returns:
    --------
    Tuple[pd.DataFrame, Dict]
        Enriched DataFrame and enrichment data
    """
    # Check if we have recent enrichment
    if not force_refresh and 'enrichment_data' in st.session_state:
        enrichment_time = st.session_state['enrichment_data'].get('enrichment_timestamp')
        if enrichment_time:
            # Check if enrichment is less than 1 hour old
            try:
                enriched_at = datetime.fromisoformat(enrichment_time)
                if datetime.now() - enriched_at < timedelta(hours=1):
                    return (
                        st.session_state.get('enriched_portfolio_df', ee_df),
                        st.session_state['enrichment_data']
                    )
            except:
                pass

    # Perform enrichment
    enriched_df, enrichment_data = enrich_portfolio(ee_df, period)

    # Store in session state
    st.session_state['enriched_portfolio_df'] = enriched_df
    st.session_state['enrichment_data'] = enrichment_data

    return enriched_df, enrichment_data


# =============================================================================
# SECTOR AGGREGATION
# =============================================================================

def get_sector_allocation(enriched_df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate sector allocation from enriched portfolio.

    Parameters:
    -----------
    enriched_df : pd.DataFrame
        Enriched portfolio DataFrame

    Returns:
    --------
    pd.DataFrame
        Sector allocation with columns: Sector, Market_Value, Weight, Count
    """
    sector_agg = enriched_df.groupby('Sector').agg({
        'Market_Value': 'sum',
        'Ticker': 'count'
    }).reset_index()

    sector_agg.columns = ['Sector', 'Market_Value', 'Position_Count']

    total_value = sector_agg['Market_Value'].sum()
    sector_agg['Weight'] = (sector_agg['Market_Value'] / total_value * 100) if total_value > 0 else 0

    sector_agg = sector_agg.sort_values('Weight', ascending=False)

    return sector_agg


def get_concentration_metrics(enriched_df: pd.DataFrame) -> Dict:
    """
    Calculate portfolio concentration metrics.

    Parameters:
    -----------
    enriched_df : pd.DataFrame
        Portfolio DataFrame with Market_Value column

    Returns:
    --------
    dict
        Concentration metrics including HHI, top N weights, etc.
    """
    total_value = enriched_df['Market_Value'].sum()

    if total_value == 0:
        return {'hhi': 0, 'top_5_weight': 0, 'top_10_weight': 0}

    weights = enriched_df['Market_Value'] / total_value
    weights_sorted = weights.sort_values(ascending=False)

    # Herfindahl-Hirschman Index (sum of squared weights)
    hhi = (weights ** 2).sum() * 10000  # Scale to 0-10000

    # Top N weights
    top_5_weight = weights_sorted.head(5).sum() * 100
    top_10_weight = weights_sorted.head(10).sum() * 100

    # Effective number of positions (1/HHI)
    effective_positions = 1 / (weights ** 2).sum() if (weights ** 2).sum() > 0 else len(weights)

    return {
        'hhi': hhi,
        'hhi_interpretation': 'Concentrated' if hhi > 2500 else ('Moderate' if hhi > 1500 else 'Diversified'),
        'top_5_weight': top_5_weight,
        'top_10_weight': top_10_weight,
        'effective_positions': effective_positions,
        'actual_positions': len(enriched_df),
        'largest_position_weight': weights_sorted.iloc[0] * 100 if len(weights_sorted) > 0 else 0
    }
