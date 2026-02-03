"""
ATLAS Terminal - Portfolio Data Loading & Saving Functions
Extracted from atlas_app.py (Phase 4).
"""
import math
import json
import pickle
import warnings
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st

try:
    import plotly.graph_objects as go
    import plotly.express as px
except ImportError:
    pass

try:
    import yfinance as yf
except ImportError:
    pass

try:
    from scipy import stats
    from scipy.optimize import minimize
except ImportError:
    pass

from app.config import (
    COLORS, CHART_HEIGHT_COMPACT, CHART_HEIGHT_STANDARD,
    CHART_HEIGHT_LARGE, CHART_HEIGHT_DEEP_DIVE, CHART_THEME,
    CACHE_DIR, PORTFOLIO_CACHE, TRADE_HISTORY_CACHE,
    ACCOUNT_HISTORY_CACHE, RISK_FREE_RATE, MARKET_RETURN
)
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator

try:
    from data.instruments import POPULAR_STOCKS, POPULAR_ETFS, GLOBAL_INDICES
except ImportError:
    POPULAR_STOCKS = {}
    POPULAR_ETFS = {}
    GLOBAL_INDICES = {}

try:
    from data.sectors import GICS_SECTORS, GICS_SECTOR_MAPPING, STOCK_SECTOR_OVERRIDES, SPY_SECTOR_WEIGHTS
except ImportError:
    GICS_SECTORS = {}
    GICS_SECTOR_MAPPING = {}
    STOCK_SECTOR_OVERRIDES = {}
    SPY_SECTOR_WEIGHTS = {}


def _lazy_atlas():
    """Lazy import of atlas_app to avoid circular imports."""
    import atlas_app
    return atlas_app


class ATLASFormatter:
    """
    Centralized professional formatting with strict standards:
    - Prices: $ with 2 decimals
    - Yields/Returns: % with 2 decimals
    - Ratios: 1 decimal, no units
    - Missing data: "–"
    - Color rules: Green positive, Red negative, Grey zero
    """

    @staticmethod
    def format_price(value, decimals=2):
        """Prices: Always $ with exactly 2 decimals"""
        if pd.isna(value) or value is None:
            return "–"
        return f"${value:,.{decimals}f}"

    @staticmethod
    def format_yield(value, decimals=2):
        """Yields/Returns: Always % with exactly 2 decimals"""
        if pd.isna(value) or value is None:
            return "–"
        return f"{value:.{decimals}f}%"

    @staticmethod
    def format_ratio(value, decimals=1):
        """Ratios: 1 decimal place, no units"""
        if pd.isna(value) or value is None:
            return "–"
        return f"{value:.{decimals}f}"

    @staticmethod
    def get_color(value):
        """Color rules: Green positive, Red negative, Grey zero"""
        if pd.isna(value) or value is None:
            return COLORS['text_muted']
        if value > 0:
            return COLORS['success']
        elif value < 0:
            return COLORS['danger']
        return COLORS['text_muted']

    @staticmethod
    def format_timestamp(dt=None):
        """Data freshness indicator with precise timestamp"""
        if dt is None:
            dt = datetime.now()
        return dt.strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def get_freshness_badge(minutes_ago):
        """Visual freshness indicator based on age"""
        if minutes_ago < 5:
            return f"🟢 Live ({minutes_ago}m ago)"
        elif minutes_ago < 30:
            return f"🟡 Recent ({minutes_ago}m ago)"
        else:
            return f"🔴 Stale ({minutes_ago}m ago)"


def get_current_portfolio_metrics():
    """
    Extract current portfolio metrics from uploaded performance history.
    Returns dict with equity, gross_exposure, leverage, cash, etc.

    Data source: Performance history file Column F (Account Value)
    - Row 2 (most recent) = Current equity exposure

    Returns:
        dict with keys: equity, cash, stock_value, short_value, gross_exposure,
                       leverage, date, ytd_return, avg_leverage
        None if performance history not loaded
    """
    try:
        # Check if leverage tracker exists in session state
        if 'leverage_tracker' in st.session_state and st.session_state.leverage_tracker is not None:
            tracker = st.session_state.leverage_tracker
            stats = tracker.get_current_stats()

            if stats:
                return {
                    'equity': stats.get('current_equity', 0),
                    'gross_exposure': stats.get('current_gross_exposure', 0),
                    'leverage': stats.get('current_leverage', 1.0),
                    'ytd_return': stats.get('ytd_equity_return', 0),
                    'avg_leverage': stats.get('avg_leverage', 1.0),
                    'max_leverage': stats.get('max_leverage', 1.0),
                    'min_leverage': stats.get('min_leverage', 1.0),
                    'source': 'leverage_tracker'
                }

        # Fallback: Check if equity_capital was stored directly
        if 'equity_capital' in st.session_state and st.session_state.equity_capital:
            return {
                'equity': st.session_state.equity_capital,
                'gross_exposure': st.session_state.get('gross_exposure', st.session_state.equity_capital),
                'leverage': st.session_state.get('leverage', 1.0),
                'ytd_return': 0,
                'avg_leverage': 1.0,
                'source': 'session_state'
            }

        return None

    except Exception as e:
        print(f"Error getting portfolio metrics: {e}")
        return None


def get_portfolio_period_return(period='1y'):
    """
    Calculate actual time-weighted portfolio return from performance history.
    This is the ACTUAL return you achieved, not point-in-time holdings return.

    Parameters:
    -----------
    period : str
        Time period ('1y', '6mo', '3mo', '1mo', 'ytd', 'all')

    Returns:
    --------
    dict with: return (as decimal), start_value, end_value, start_date, end_date, days
    None if performance history not loaded
    """
    try:
        # Get leverage tracker from session state
        if 'leverage_tracker' not in st.session_state or st.session_state.leverage_tracker is None:
            print("DEBUG: leverage_tracker not in session_state")
            return None

        tracker = st.session_state.leverage_tracker
        df = tracker.leverage_history

        if df is None:
            print("DEBUG: leverage_history is None")
            return None

        if isinstance(df, pd.DataFrame) and df.empty:
            print("DEBUG: leverage_history is empty DataFrame")
            return None

        # Make a copy to avoid modifying original
        df = df.copy()

        # Get most recent value (end of period)
        end_row = df.iloc[-1]
        end_value = float(end_row['Net Equity'])
        end_date = pd.to_datetime(end_row['Date'])

        # Get earliest value (start of all data)
        earliest_row = df.iloc[0]
        earliest_date = pd.to_datetime(earliest_row['Date'])

        # Determine start date based on period
        period_lower = period.lower()
        if period_lower == 'all':
            # Use all available data
            start_date = earliest_date
        elif period_lower in ['1y', '1yr', '12m']:
            start_date = end_date - pd.DateOffset(years=1)
        elif period_lower in ['6m', '6mo']:
            start_date = end_date - pd.DateOffset(months=6)
        elif period_lower in ['3m', '3mo']:
            start_date = end_date - pd.DateOffset(months=3)
        elif period_lower in ['1m', '1mo']:
            start_date = end_date - pd.DateOffset(months=1)
        elif period_lower == 'ytd':
            start_date = pd.Timestamp(f'{end_date.year}-01-01')
        else:
            # Default to all available data
            start_date = earliest_date

        # If requested start is before earliest data, use earliest
        if start_date < earliest_date:
            start_date = earliest_date

        # Find closest date to start_date in historical data
        df['_date_diff'] = abs(pd.to_datetime(df['Date']) - start_date)
        start_idx = df['_date_diff'].idxmin()
        start_row = df.loc[start_idx]
        start_value = float(start_row['Net Equity'])
        actual_start_date = pd.to_datetime(start_row['Date'])

        # Calculate return
        if start_value > 0:
            portfolio_return = (end_value - start_value) / start_value
        else:
            portfolio_return = 0

        # Calculate ANNUALIZED return (this is what Performance Suite displays)
        days = (end_date - actual_start_date).days
        n_years = days / 365.0 if days > 0 else 1
        annualized_return = (1 + portfolio_return) ** (1/n_years) - 1 if n_years > 0 else portfolio_return
        days = (end_date - actual_start_date).days

        print(f"DEBUG: Portfolio return calculated: {portfolio_return*100:.2f}% over {days} days")
        print(f"DEBUG: Start: ${start_value:,.0f} ({actual_start_date}) → End: ${end_value:,.0f} ({end_date})")

        return {
            'return': portfolio_return,  # As decimal (0.4093 = 40.93%)
            'return_pct': portfolio_return * 100,  # As percentage (total return)
            'annualized_return': annualized_return,  # As decimal
            'annualized_return_pct': annualized_return * 100,  # As percentage (annualized)
            'start_value': start_value,
            'end_value': end_value,
            'start_date': actual_start_date,
            'end_date': end_date,
            'days': days
        }

    except Exception as e:
        import traceback
        print(f"ERROR in get_portfolio_period_return: {e}")
        print(traceback.format_exc())
        return None


def get_benchmark_period_return(benchmark_ticker='SPY', period='1y', match_portfolio_dates=True):
    """
    Get benchmark return over same period as portfolio.

    Parameters:
    -----------
    benchmark_ticker : str
        Benchmark ticker (default 'SPY')
    period : str
        Time period
    match_portfolio_dates : bool
        If True, use exact same dates as portfolio performance history

    Returns:
    --------
    dict with: return (as decimal), start_price, end_price, start_date, end_date, ticker
    None if error
    """
    try:
        import yfinance as yf

        # Get portfolio dates to match exactly
        if match_portfolio_dates:
            portfolio_data = get_portfolio_period_return(period)

            if portfolio_data is not None:
                start_date = portfolio_data['start_date']
                end_date = portfolio_data['end_date']

                # ATLAS Refactoring: Check cache first (1 hour TTL for benchmark data)
                if REFACTORED_MODULES_AVAILABLE:
                    cache_key = cache_manager.get_cache_key('benchmark_return', benchmark_ticker, str(start_date), str(end_date))
                    cached_result = cache_manager.get(cache_key, ttl=3600)
                    if cached_result is not None:
                        return cached_result

                # Get benchmark data for exact same dates
                benchmark = yf.Ticker(benchmark_ticker)
                # Add buffer days to ensure we get data
                hist = benchmark.history(start=start_date - pd.Timedelta(days=5),
                                        end=end_date + pd.Timedelta(days=1))

                if hist.empty:
                    return None

                # Find closest dates to portfolio dates
                hist['_date_diff_start'] = abs(hist.index - start_date)
                hist['_date_diff_end'] = abs(hist.index - end_date)

                start_idx = hist['_date_diff_start'].idxmin()
                end_idx = hist['_date_diff_end'].idxmin()

                start_price = hist.loc[start_idx, 'Close']
                end_price = hist.loc[end_idx, 'Close']
                actual_start = start_idx
                actual_end = end_idx

                benchmark_return = (end_price - start_price) / start_price

                result = {
                    'return': benchmark_return,  # As decimal
                    'return_pct': benchmark_return * 100,  # As percentage
                    'start_price': start_price,
                    'end_price': end_price,
                    'start_date': actual_start,
                    'end_date': actual_end,
                    'ticker': benchmark_ticker
                }

                # Cache the result
                if REFACTORED_MODULES_AVAILABLE:
                    cache_manager.set(cache_key, result, persist=True)

                return result

        # Fallback to standard period - also cache this
        if REFACTORED_MODULES_AVAILABLE:
            cache_key = cache_manager.get_cache_key('benchmark_return_period', benchmark_ticker, period)
            cached_result = cache_manager.get(cache_key, ttl=3600)
            if cached_result is not None:
                return cached_result

        benchmark = yf.Ticker(benchmark_ticker)
        hist = benchmark.history(period=period)

        if hist.empty:
            return None

        start_price = hist['Close'].iloc[0]
        end_price = hist['Close'].iloc[-1]
        benchmark_return = (end_price - start_price) / start_price

        result = {
            'return': benchmark_return,
            'return_pct': benchmark_return * 100,
            'start_price': start_price,
            'end_price': end_price,
            'start_date': hist.index[0],
            'end_date': hist.index[-1],
            'ticker': benchmark_ticker
        }

        # Cache the result
        if REFACTORED_MODULES_AVAILABLE:
            cache_manager.set(cache_key, result, persist=True)

        return result

    except Exception as e:
        # ATLAS Refactoring: User-friendly error handling
        if REFACTORED_MODULES_AVAILABLE:
            ErrorHandler.handle_error(
                error=e,
                context=f"fetching benchmark returns for {benchmark_ticker}",
                fallback_value=None,
                show_traceback=False
            )
        return None


def get_gics_sector(ticker):
    """
    Get GICS Level 1 Sector classification for a ticker.
    Matches how SPY and other ETF benchmarks classify holdings.

    Priority:
    1. Check explicit overrides (most accurate)
    2. Check cache (fast, avoids API call)
    3. Fetch from yfinance and map to GICS
    4. Return 'Other' if unknown

    Returns:
        str: GICS Level 1 sector name
    """
    # Priority 1: Check overrides
    ticker_upper = ticker.upper().strip()
    if ticker_upper in STOCK_SECTOR_OVERRIDES:
        return STOCK_SECTOR_OVERRIDES[ticker_upper]

    # Priority 2: Check cache (6 hour TTL for sector data)
    if REFACTORED_MODULES_AVAILABLE:
        cache_key = cache_manager.get_cache_key('gics_sector', ticker_upper)
        cached_sector = cache_manager.get(cache_key, ttl=21600)  # 6 hours
        if cached_sector is not None:
            return cached_sector

    # Priority 3: Fetch from yfinance and standardize
    try:
        stock = yf.Ticker(ticker_upper)
        info = stock.info
        sector = info.get('sector', 'Other')

        # Map to standard GICS
        if sector in GICS_SECTORS:
            result = sector
        elif sector in GICS_SECTOR_MAPPING:
            result = GICS_SECTOR_MAPPING[sector]
        else:
            result = 'Other'

        # Cache the result
        if REFACTORED_MODULES_AVAILABLE:
            cache_manager.set(cache_key, result, persist=True)

        return result

    except Exception as e:
        # ATLAS Refactoring: User-friendly error handling
        if REFACTORED_MODULES_AVAILABLE:
            ErrorHandler.handle_error(
                error=e,
                context=f"classifying sector for {ticker_upper}",
                fallback_value='Other',
                show_traceback=False
            )
        return 'Other'


def get_portfolio_gics_sectors(portfolio_df):
    """
    Apply GICS sector classification to entire portfolio.

    Parameters:
        portfolio_df: DataFrame with 'Ticker' column

    Returns:
        DataFrame with 'GICS_Sector' column added
    """
    df = portfolio_df.copy()

    # Apply GICS classification to each ticker
    df['GICS_Sector'] = df['Ticker'].apply(get_gics_sector)

    return df


def get_spy_sector_weights():
    """
    Get current SPY sector weights.
    Returns dict with GICS Level 1 sectors and their weights (as percentages).
    """
    return SPY_SECTOR_WEIGHTS.copy()


@st.cache_data(ttl=3600)
def get_benchmark_sector_returns(period='1Y'):
    """
    Fetch sector ETF returns as proxy for benchmark sector performance
    """
    sector_etfs = {
        'Technology': 'XLK',
        'Healthcare': 'XLV',
        'Financial Services': 'XLF',
        'Consumer Cyclical': 'XLY',
        'Communication Services': 'XLC',
        'Industrials': 'XLI',
        'Consumer Defensive': 'XLP',
        'Energy': 'XLE',
        'Real Estate': 'XLRE',
        'Basic Materials': 'XLB',
        'Utilities': 'XLU'
    }

    benchmark_returns = {}

    # Calculate date range based on period
    end_date = datetime.now()
    if period == '1Y':
        start_date = end_date - timedelta(days=365)
    elif period == 'YTD':
        start_date = datetime(end_date.year, 1, 1)
    elif period == '3M':
        start_date = end_date - timedelta(days=90)
    else:
        start_date = end_date - timedelta(days=365)

    for sector, etf in sector_etfs.items():
        try:
            data = fetch_historical_data(etf, start_date=start_date, end_date=end_date)
            if data is not None and len(data) > 0:
                total_return = ((data['Close'].iloc[-1] / data['Close'].iloc[0]) - 1) * 100
                benchmark_returns[sector] = total_return
            else:
                benchmark_returns[sector] = 0.0
        except:
            benchmark_returns[sector] = 0.0

    return benchmark_returns


def get_data_freshness(cache_time=None):
    """Calculate and format data age for freshness indicators"""
    if cache_time is None:
        return ATLASFormatter.format_timestamp(), 0

    now = datetime.now()
    age_seconds = (now - cache_time).total_seconds()
    age_minutes = int(age_seconds / 60)

    timestamp = ATLASFormatter.format_timestamp(cache_time)
    badge = ATLASFormatter.get_freshness_badge(age_minutes)

    return timestamp, age_minutes, badge


def save_portfolio_data(data):
    """
    Save portfolio data to BOTH database and pickle cache
    Database is primary storage, pickle is backup
    """
    # Save to pickle (backwards compatibility)
    with open(PORTFOLIO_CACHE, "wb") as f:
        pickle.dump(data, f)

    # PHASE 4: Auto-save to database
    if SQL_AVAILABLE:
        try:
            db = get_db()
            # Convert list of dicts to DataFrame
            df = pd.DataFrame(data)

            # Ensure required columns exist
            if 'Ticker' in df.columns and 'Shares' in df.columns:
                # Prepare DataFrame for database
                portfolio_df = df.copy()

                # Rename columns to match database schema
                column_mapping = {
                    'Ticker': 'ticker',
                    'Shares': 'quantity',
                    'Avg Price': 'avg_cost',  # From account imports
                    'Avg Cost': 'avg_cost',   # From trade imports (Phoenix Parser)
                    'Current Price': 'current_price'
                }

                # Only rename columns that exist
                portfolio_df = portfolio_df.rename(columns={
                    k: v for k, v in column_mapping.items() if k in portfolio_df.columns
                })

                # Ensure required columns
                required_cols = ['ticker', 'quantity', 'avg_cost']
                if all(col in portfolio_df.columns for col in required_cols):
                    # Select only relevant columns
                    save_cols = [col for col in ['ticker', 'quantity', 'avg_cost', 'current_price']
                                 if col in portfolio_df.columns]
                    portfolio_df = portfolio_df[save_cols]

                    # Save to database
                    db.save_portfolio(portfolio_df)
                    print(f"✅ Portfolio saved to database ({len(portfolio_df)} positions)")
                else:
                    missing = [col for col in required_cols if col not in portfolio_df.columns]
                    print(f"⚠️ Cannot save to database: missing columns {missing}")
                    print(f"   Available columns: {list(portfolio_df.columns)}")
        except Exception as e:
            print(f"⚠️ Database save failed (pickle still saved): {e}")
            import traceback
            print(traceback.format_exc())


def load_portfolio_data():
    """
    Load portfolio data from DATABASE FIRST, fallback to pickle
    This implements Phase 4: SQL-first loading
    """
    # PHASE 4: Try database first
    if SQL_AVAILABLE:
        try:
            db = get_db()
            df = db.get_portfolio()

            if len(df) > 0:
                # Convert database format back to app format
                column_mapping = {
                    'ticker': 'Ticker',
                    'quantity': 'Shares',
                    'avg_cost': 'Avg Cost',  # Standard column name in app
                    'current_price': 'Current Price'
                }

                df = df.rename(columns={
                    k: v for k, v in column_mapping.items() if k in df.columns
                })

                print(f"✅ Loaded {len(df)} positions from database")
                return df  # ✅ FIX: Return DataFrame instead of list
        except Exception as e:
            print(f"⚠️ Database load failed, falling back to pickle: {e}")

    # Fallback to pickle
    if PORTFOLIO_CACHE.exists():
        with open(PORTFOLIO_CACHE, "rb") as f:
            data = pickle.load(f)
            print(f"✅ Loaded {len(data)} positions from pickle cache")
            # ✅ FIX: Convert to DataFrame if it's a list
            if isinstance(data, list):
                return pd.DataFrame(data)
            return data

    return pd.DataFrame()  # ✅ FIX: Return empty DataFrame instead of empty list


def get_portfolio_from_broker_or_legacy():
    """
    NEW: Unified portfolio data loader - checks broker adapter first, then falls back to legacy load

    This function enables the new multi-broker system (Alpaca, Easy Equities, Manual Entry)
    while maintaining backward compatibility with existing Phoenix Parser workflow.

    Priority:
    1. Check if broker adapter is active (Alpaca/EE/Manual) → use adapter.get_positions()
    2. Check if fresh data in session_state['portfolio_df'] → use that
    3. Fall back to load_portfolio_data() (SQL/pickle)

    Returns:
    --------
    pd.DataFrame : Portfolio positions in ATLAS format
    """
    # Priority 1: Check for active broker adapter
    if BROKER_MANAGER_AVAILABLE and 'active_broker' in st.session_state and st.session_state.active_broker:
        try:
            # Get the adapter based on broker type
            broker_key = st.session_state.active_broker

            if broker_key == 'manual' and 'manual_configured' in st.session_state:
                adapter = ManualPortfolioAdapter()
                positions = adapter.get_positions()
                if not positions.empty:
                    print(f"✅ Loaded {len(positions)} positions from Manual Entry")
                    return positions

            elif broker_key == 'alpaca' and 'alpaca_adapter' in st.session_state:
                adapter = st.session_state.alpaca_adapter
                positions = adapter.get_positions()
                if not positions.empty:
                    print(f"✅ Loaded {len(positions)} positions from Alpaca Markets")
                    # Convert Alpaca format to ATLAS format
                    atlas_format = positions.rename(columns={
                        'ticker': 'Ticker',
                        'quantity': 'Shares',
                        'avg_cost': 'Avg Cost',
                        'current_price': 'Current Price',
                        'market_value': 'Market Value',
                        'cost_basis': 'Cost Basis',
                        'unrealized_pl': 'Unrealized P&L',
                        'unrealized_plpc': 'Unrealized P&L %',
                        'weight': 'Weight %'
                    })
                    return atlas_format

            elif broker_key == 'easy_equities' and 'ee_adapter' in st.session_state:
                adapter = st.session_state.ee_adapter
                positions = adapter.get_positions()
                if not positions.empty:
                    print(f"✅ Loaded {len(positions)} positions from Easy Equities")
                    return positions

        except Exception as e:
            print(f"⚠️ Broker data load failed: {e}, falling back to legacy")

    # Priority 2: Check session_state for fresh Phoenix Parser data
    if 'portfolio_df' in st.session_state and st.session_state['portfolio_df'] is not None:
        if len(st.session_state['portfolio_df']) > 0:
            print(f"✅ Using fresh data from session_state ({len(st.session_state['portfolio_df'])} positions)")
            return st.session_state['portfolio_df']

    # Priority 3: Fall back to legacy load (SQL → pickle)
    print("📂 Loading from legacy system (SQL/pickle)")
    return load_portfolio_data()


def save_trade_history(df):
    """
    Save trade history to BOTH database and pickle cache
    """
    # Save to pickle (backwards compatibility)
    with open(TRADE_HISTORY_CACHE, "wb") as f:
        pickle.dump(df, f)

    # Check if SQL is available
    if not SQL_AVAILABLE:
        print("⚠️ SQL not available - trades saved to pickle only")
        import streamlit as st
        st.warning("⚠️ Trades saved to local file only (database not available)")
        return

    if df is None or len(df) == 0:
        print("⚠️ No trades to save")
        return

    try:
        db = get_db()
        trades_df = df.copy()

        # IMPROVED COLUMN MAPPING - Add all variations including "Trade Type"
        column_mapping = {}

        # Date column - ALL POSSIBLE NAMES
        date_cols = [
            'Date', 'date', 'DATE',
            'Trade Date', 'Execution Date', 'Exec Date',
            'Transaction Date', 'Settlement Date'
        ]
        for col in date_cols:
            if col in trades_df.columns:
                column_mapping[col] = 'date'
                break

        # Ticker/Symbol column - ALL POSSIBLE NAMES
        ticker_cols = [
            'Ticker', 'ticker', 'TICKER',
            'Symbol', 'symbol', 'SYMBOL',
            'Underlying', 'Security', 'Instrument'
        ]
        for col in ticker_cols:
            if col in trades_df.columns:
                column_mapping[col] = 'ticker'
                break

        # Action column - ALL POSSIBLE NAMES (INCLUDING "Trade Type") ⭐ CRITICAL FIX
        action_cols = [
            'Action', 'action', 'ACTION',
            'Trade Type', 'TradeType', 'TRADE TYPE',  # ← FIX: Added these!
            'Type', 'type', 'TYPE',
            'Side', 'side', 'SIDE',
            'Buy/Sell', 'BUY/SELL',
            'Transaction Type', 'Trade Action'
        ]
        for col in action_cols:
            if col in trades_df.columns:
                column_mapping[col] = 'action'
                break

        # Quantity column - ALL POSSIBLE NAMES
        qty_cols = [
            'Quantity', 'quantity', 'QUANTITY',
            'Qty', 'qty', 'QTY',
            'Shares', 'shares', 'SHARES',
            'Amount', 'amount', 'AMOUNT',
            'Volume', 'volume', 'VOLUME',
            'Size', 'size', 'SIZE'
        ]
        for col in qty_cols:
            if col in trades_df.columns:
                column_mapping[col] = 'quantity'
                break

        # Price column - ALL POSSIBLE NAMES
        price_cols = [
            'Price', 'price', 'PRICE',
            'Exec Price', 'Execution Price', 'Fill Price',
            'Trade Price', 'Avg Price', 'Average Price'
        ]
        for col in price_cols:
            if col in trades_df.columns:
                column_mapping[col] = 'price'
                break

        # Apply mapping
        print(f"📋 Column mapping found: {column_mapping}")
        trades_df = trades_df.rename(columns=column_mapping)

        # Check if we have all required columns
        required = ['date', 'ticker', 'action', 'quantity', 'price']
        missing = [col for col in required if col not in trades_df.columns]

        if missing:
            error_msg = f"⚠️ Cannot save to database - missing columns: {missing}"
            print(error_msg)
            print(f"📋 Available columns after mapping: {list(trades_df.columns)}")
            import streamlit as st
            st.error(f"❌ {error_msg}")
            st.info(f"""
            **Columns in uploaded file:**
            {', '.join(df.columns)}

            **Missing after mapping:**
            {', '.join(missing)}

            Trades saved to local file, but not database.
            """)
            return

        # Select only required columns
        trades_df = trades_df[required]

        # Clean and validate data
        # Convert date to string if it's datetime
        if pd.api.types.is_datetime64_any_dtype(trades_df['date']):
            trades_df['date'] = trades_df['date'].dt.strftime('%Y-%m-%d')

        # Ensure numeric types
        trades_df['quantity'] = pd.to_numeric(trades_df['quantity'], errors='coerce')
        trades_df['price'] = pd.to_numeric(trades_df['price'], errors='coerce')

        # Remove rows with NaN values
        trades_df = trades_df.dropna()

        if len(trades_df) == 0:
            print("⚠️ No valid trades after cleaning")
            return

        # CRITICAL FIX: Normalize action values to 'BUY' or 'SELL'
        # Database has CHECK constraint: action IN ('BUY', 'SELL')
        # Investopedia uses values like "Stock: Buy at Market Open"
        def normalize_action(action_str):
            """Extract BUY or SELL from action string"""
            action_lower = str(action_str).lower()
            if 'buy' in action_lower:
                return 'BUY'
            elif 'sell' in action_lower or 'short' in action_lower:
                return 'SELL'
            else:
                # Default fallback - should not happen with proper mapping
                print(f"⚠️ Unknown action format: {action_str}, defaulting to BUY")
                return 'BUY'

        trades_df['action'] = trades_df['action'].apply(normalize_action)
        print(f"📋 Normalized actions - sample: {trades_df['action'].head().tolist()}")

        # Save to database
        db.bulk_insert('trades', trades_df, if_exists='append')
        print(f"✅ Saved {len(trades_df)} trades to database")
        import streamlit as st
        st.success(f"✅ Saved {len(trades_df)} trades to database permanently!")

    except Exception as e:
        error_msg = f"⚠️ Database save failed: {e}"
        print(error_msg)
        import streamlit as st
        st.error(error_msg)
        import traceback
        st.code(traceback.format_exc())
        st.info("Trades are saved to local pickle file as backup")


def load_trade_history():
    if TRADE_HISTORY_CACHE.exists():
        with open(TRADE_HISTORY_CACHE, "rb") as f:
            return pickle.load(f)
    return None


def save_account_history(df):
    with open(ACCOUNT_HISTORY_CACHE, "wb") as f:
        pickle.dump(df, f)


def load_account_history():
    if ACCOUNT_HISTORY_CACHE.exists():
        with open(ACCOUNT_HISTORY_CACHE, "rb") as f:
            return pickle.load(f)
    return None


def validate_portfolio_data(portfolio_data):
    """
    NEW IN v9.7: Comprehensive data validation and integrity checking
    Returns validation metrics and quality scores
    """
    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        return {
            'is_valid': False,
            'total_holdings': 0,
            'data_quality_score': 0,
            'issues': ['No portfolio data available'],
            'warnings': [],
            'null_counts': {},
            'total_rows': 0,
            'complete_rows': 0
        }

    df = pd.DataFrame(portfolio_data)
    issues = []
    warnings = []

    # Check required columns - use flexible column names
    required_columns = ['Ticker']
    optional_columns = ['Quantity', 'Current Price', 'Shares', 'Price', 'Last Price']

    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        issues.append(f"Missing required columns: {', '.join(missing_columns)}")

    # Check for null values only on existing columns
    existing_check_cols = [col for col in required_columns if col in df.columns]
    null_counts = {}

    if existing_check_cols:
        null_counts = df[existing_check_cols].isnull().sum().to_dict()
        for col, count in null_counts.items():
            if count > 0:
                warnings.append(f"{col}: {count} missing values")

    # Check for negative quantities (flexible column names)
    qty_col = None
    for col in ['Quantity', 'Shares', 'Qty']:
        if col in df.columns:
            qty_col = col
            break

    if qty_col:
        negative_qty = (df[qty_col] < 0).sum()
        if negative_qty > 0:
            warnings.append(f"{negative_qty} holdings with negative quantities (short positions)")

    # Check for zero/negative prices (flexible column names)
    price_col = None
    for col in ['Current Price', 'Price', 'Last Price', 'Close']:
        if col in df.columns:
            price_col = col
            break

    if price_col:
        invalid_prices = (df[price_col] <= 0).sum()
        if invalid_prices > 0:
            issues.append(f"{invalid_prices} holdings with invalid prices (≤0)")

    # Check for duplicate tickers
    if 'Ticker' in df.columns:
        duplicates = df['Ticker'].duplicated().sum()
        if duplicates > 0:
            warnings.append(f"{duplicates} duplicate ticker entries")

    # Calculate data quality score (0-100)
    quality_score = 100
    quality_score -= len(issues) * 15  # Severe penalty for issues
    quality_score -= len(warnings) * 5  # Moderate penalty for warnings
    quality_score = max(0, min(100, quality_score))

    # Calculate complete rows
    complete_rows = len(df)
    if existing_check_cols:
        complete_rows = len(df.dropna(subset=existing_check_cols))

    return {
        'is_valid': len(issues) == 0,
        'total_holdings': len(df),
        'data_quality_score': quality_score,
        'issues': issues,
        'warnings': warnings,
        'null_counts': null_counts,
        'total_rows': len(df),
        'complete_rows': complete_rows
    }


def get_leverage_info():
    account_df = load_account_history()
    if account_df is not None:
        latest_cash = account_df.get('Cash Balance', account_df.get('Cash', pd.Series([0]))).iloc[-1]
        
        if isinstance(latest_cash, str):
            latest_cash = latest_cash.replace('$', '').replace(',', '')
            if '(' in latest_cash and ')' in latest_cash:
                latest_cash = '-' + latest_cash.replace('(', '').replace(')', '')
            try:
                latest_cash = float(latest_cash)
            except:
                latest_cash = 0
        
        latest_margin = 0
        
        if 'Margin Used' in account_df.columns:
            latest_margin = account_df['Margin Used'].iloc[-1]
            if isinstance(latest_margin, str):
                latest_margin = latest_margin.replace('$', '').replace(',', '')
                if '(' in latest_margin and ')' in latest_margin:
                    latest_margin = '-' + latest_margin.replace('(', '').replace(')', '')
                try:
                    latest_margin = float(latest_margin)
                except:
                    latest_margin = 0
        
        if latest_cash < 0:
            latest_margin = abs(latest_cash)
            
        total_value = 0
        if 'Total Value' in account_df.columns:
            total_value = account_df['Total Value'].iloc[-1]
            if isinstance(total_value, str):
                total_value = total_value.replace('$', '').replace(',', '')
                if '(' in total_value and ')' in total_value:
                    total_value = '-' + total_value.replace('(', '').replace(')', '')
                try:
                    total_value = float(total_value)
                except:
                    total_value = abs(latest_cash) + latest_margin
        else:
            total_value = abs(latest_cash) + latest_margin

        # FIX #4: Correct leverage formula - Gross Exposure / Net Equity
        # (aligned with Leverage Tracker page calculation)
        net_equity = total_value - latest_margin if total_value > latest_margin else total_value
        leverage_ratio = (total_value / net_equity) if net_equity > 0 else 1.0

        return {
            'margin_used': latest_margin,
            'cash_balance': latest_cash,
            'leverage_ratio': leverage_ratio,
            'total_value': total_value,
            'net_equity': net_equity  # Added for clarity
        }
    return None


def parse_trade_history_file(uploaded_file):
    try:
        df = pd.read_html(uploaded_file)[0]
        required_cols = ['Date', 'Symbol', 'Trade Type', 'Quantity', 'Price']
        if not all(col in df.columns for col in required_cols):
            return None
        df['Price'] = df['Price'].astype(str).str.replace('$', '').str.replace(',', '').astype(float)
        df['Date'] = pd.to_datetime(df['Date'])
        df = df.sort_values('Date')
        return df
    except:
        return None


def parse_account_history_file(uploaded_file):
    try:
        df = pd.read_html(uploaded_file)[0]
        df['Date'] = pd.to_datetime(df['Date'])
        df = df.sort_values('Date')
        return df
    except:
        return None


def is_option_ticker(ticker):
    """
    Detect if ticker is an option symbol
    Options typically have format: TICKER[DATE][TYPE][STRIKE]
    Examples: AU2520F50, META2405D482.5, AAPL240119C150
    """
    import re

    # Skip if too short
    if len(ticker) <= 6:
        return False

    # Specific known options to exclude
    known_options = ['AU2520F50', 'META2405D482.5']
    if ticker.upper() in known_options:
        return True

    # General option pattern detection
    # Pattern: Letters + 4-digit year (20XX, 24XX, etc) + optional letter + decimals
    # Examples: META2405D482.5 = META + 2405 + D + 482.5
    #           AU2520F50 = AU + 2520 + F + 50
    option_pattern = r'^[A-Z]+\d{4}[A-Z]\d+\.?\d*$'
    if re.match(option_pattern, ticker.upper()):
        return True

    # Standard options format (older logic)
    has_year = any(str(y) in ticker for y in range(2020, 2030))
    has_strike = any(c.isdigit() for c in ticker[6:])
    has_type = ticker[-1] in ['C', 'P'] or 'C' in ticker[6:] or 'P' in ticker[6:]
    return has_year and has_strike and has_type


def classify_ticker_sector(ticker, default_sector):
    if pd.notna(default_sector) and default_sector != "Unknown":
        return default_sector
    
    if ticker in ETF_SECTORS:
        return ETF_SECTORS[ticker]
    
    return "Other"


def init_watchlist():
    """Initialize personal watchlist in session state"""
    if 'personal_watchlist' not in st.session_state:
        st.session_state['personal_watchlist'] = []
        # Try loading from file
        try:
            import json
            from pathlib import Path
            watchlist_file = Path('.atlas_watchlist.json')
            if watchlist_file.exists():
                with open(watchlist_file, 'r') as f:
                    st.session_state['personal_watchlist'] = json.load(f)
        except:
            pass


def add_to_watchlist(ticker, name, asset_type='Stock'):
    """
    Add a ticker to personal watchlist.

    Args:
        ticker: Ticker symbol
        name: Asset name
        asset_type: Type of asset (Stock, ETF, Crypto, etc.)

    Returns:
        True if added, False if already exists
    """
    init_watchlist()

    # Check if already in watchlist
    if any(item['ticker'] == ticker for item in st.session_state['personal_watchlist']):
        return False

    # Add to watchlist
    st.session_state['personal_watchlist'].append({
        'ticker': ticker,
        'name': name,
        'type': asset_type,
        'added_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    })

    # Save to file
    save_watchlist()
    return True


def remove_from_watchlist(ticker):
    """Remove a ticker from personal watchlist"""
    init_watchlist()
    st.session_state['personal_watchlist'] = [
        item for item in st.session_state['personal_watchlist']
        if item['ticker'] != ticker
    ]
    save_watchlist()


def save_watchlist():
    """Save watchlist to file"""
    try:
        import json
        with open('.atlas_watchlist.json', 'w') as f:
            json.dump(st.session_state['personal_watchlist'], f, indent=2)
    except:
        pass


def get_watchlist():
    """Get current watchlist"""
    init_watchlist()
    return st.session_state['personal_watchlist']


def is_valid_series(series):
    """Safely check if a pandas Series has valid data"""
    return series is not None and isinstance(series, pd.Series) and not series.empty


def is_valid_dataframe(df):
    """Safely check if a pandas DataFrame has valid data"""
    return df is not None and isinstance(df, pd.DataFrame) and not df.empty
