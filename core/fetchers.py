"""
ATLAS Terminal - Market Data Fetching Functions
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

# Refactored infrastructure availability (originally defined in atlas_app.py)
try:
    from atlas_terminal.data.fetchers.market_data import market_data
    REFACTORED_MODULES_AVAILABLE = True
except ImportError:
    REFACTORED_MODULES_AVAILABLE = False
    market_data = None


def _lazy_atlas():
    """Lazy import of atlas_app to avoid circular imports."""
    import atlas_app
    return atlas_app


@st.cache_data(ttl=300)
def search_yahoo_finance(query):
    """
    Search Yahoo Finance for any ticker/company with live data lookup.

    Args:
        query: Search query (ticker symbol or company name)

    Returns:
        List of matching securities with metadata, or None if not found
    """
    if not query or len(query) < 1:
        return None

    try:
        # ATLAS Refactoring - Use cached market data fetcher
        # Try direct ticker lookup first
        if REFACTORED_MODULES_AVAILABLE:
            info = market_data.get_company_info(query.upper())
        else:
            # Fallback to old method
            ticker = yf.Ticker(query.upper())
            info = ticker.info

        if info and info.get('symbol'):
            return [{
                'symbol': info.get('symbol', query.upper()),
                'name': info.get('longName', info.get('shortName', query)),
                'type': info.get('quoteType', 'Unknown'),
                'exchange': info.get('exchange', 'N/A'),
                'currency': info.get('currency', 'USD'),
                'market_cap': info.get('marketCap', 0),
                'sector': info.get('sector', 'N/A'),
                'industry': info.get('industry', 'N/A')
            }]
        else:
            return None
    except Exception as e:
        return None


@st.cache_data(ttl=3600)
def _safe_lookup(df, col, field_names):
    """Lookup a value from a DataFrame trying multiple field name variants."""
    if isinstance(field_names, str):
        field_names = [field_names]
    for name in field_names:
        if name in df.index:
            val = df.loc[name, col]
            if pd.notna(val):
                return float(val)
    return 0


@st.cache_data(ttl=1800)
def fetch_us_treasury_yields_fred():
    """
    Fetch US Treasury yields from FRED API (Federal Reserve Economic Data).

    Returns:
        tuple: (maturities, yields, data_source) where data_source indicates FRED, Yahoo, or Fallback
    """
    # FRED series IDs for various Treasury maturities
    fred_series = {
        "DGS1MO": 1/12,      # 1-month
        "DGS3MO": 0.25,      # 3-month
        "DGS6MO": 0.5,       # 6-month
        "DGS1": 1,           # 1-year
        "DGS2": 2,           # 2-year
        "DGS3": 3,           # 3-year
        "DGS5": 5,           # 5-year
        "DGS7": 7,           # 7-year
        "DGS10": 10,         # 10-year
        "DGS20": 20,         # 20-year
        "DGS30": 30          # 30-year
    }

    # Try FRED API first
    try:
        import requests

        # Check if FRED API key is available (from secrets or environment)
        try:
            FRED_API_KEY = st.secrets.get("FRED_API_KEY", None)
        except:
            FRED_API_KEY = None

        if FRED_API_KEY and FRED_API_KEY != "YOUR_API_KEY_HERE":
            maturities = []
            yields = []

            for series_id, maturity in fred_series.items():
                try:
                    url = f"https://api.stlouisfed.org/fred/series/observations"
                    params = {
                        "series_id": series_id,
                        "api_key": FRED_API_KEY,
                        "file_type": "json",
                        "sort_order": "desc",
                        "limit": 1
                    }

                    response = requests.get(url, params=params, timeout=5)

                    if response.status_code == 200:
                        data = response.json()
                        if data.get('observations'):
                            latest = data['observations'][0]
                            yield_value = float(latest['value'])
                            maturities.append(maturity)
                            yields.append(yield_value)
                except:
                    continue

            # If we got good FRED data, return it
            if len(yields) >= 5:
                # Sort by maturity
                sorted_data = sorted(zip(maturities, yields))
                maturities, yields = zip(*sorted_data)
                return list(maturities), list(yields), "FRED API"
    except:
        pass

    # Fallback to Yahoo Finance
    treasuries = {
        "^IRX": 0.25,   # 3-month
        "^FVX": 5,      # 5-year
        "^TNX": 10,     # 10-year
        "^TYX": 30      # 30-year
    }

    maturities = []
    yields = []

    for ticker, maturity in treasuries.items():
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period="1d")
            if not hist.empty:
                current_yield = hist['Close'].iloc[-1]
                maturities.append(maturity)
                yields.append(current_yield)
        except:
            continue

    # If Yahoo data worked, return it
    if len(yields) >= 3:
        sorted_data = sorted(zip(maturities, yields))
        maturities, yields = zip(*sorted_data)
        return list(maturities), list(yields), "Yahoo Finance"

    # Final fallback to sample data
    maturities = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30]
    yields = [4.5, 4.4, 4.3, 4.2, 4.1, 4.0, 4.05, 4.1, 4.3, 4.4]
    return maturities, yields, "Fallback Data"


@st.cache_data(ttl=3600)
def fetch_uk_gilt_yields():
    """Fetch live UK Gilt yields from Yahoo Finance"""
    # UK Government Bond Yield tickers (Yahoo Finance format)
    uk_bond_tickers = {
        "^FTGB03M": {"maturity": 0.25, "name": "3M"},   # 3-month
        "^FTGB06M": {"maturity": 0.5, "name": "6M"},    # 6-month
        "^FTGB01Y": {"maturity": 1, "name": "1Y"},      # 1-year
        "^FTGB02Y": {"maturity": 2, "name": "2Y"},      # 2-year
        "^FTGB03Y": {"maturity": 3, "name": "3Y"},      # 3-year
        "^FTGB05Y": {"maturity": 5, "name": "5Y"},      # 5-year
        "^FTGB07Y": {"maturity": 7, "name": "7Y"},      # 7-year
        "^FTGB10Y": {"maturity": 10, "name": "10Y"},    # 10-year
        "^FTGB15Y": {"maturity": 15, "name": "15Y"},    # 15-year
        "^FTGB20Y": {"maturity": 20, "name": "20Y"},    # 20-year
        "^FTGB30Y": {"maturity": 30, "name": "30Y"}     # 30-year
    }

    yields_data = []
    maturities = []

    for ticker, info in uk_bond_tickers.items():
        try:
            bond = yf.Ticker(ticker)
            hist = bond.history(period="5d")  # Get last 5 days in case today's data isn't available
            if not hist.empty:
                current_yield = hist['Close'].iloc[-1]
                yields_data.append(current_yield)
                maturities.append(info['maturity'])
        except:
            continue

    # If we got live data, use it
    if len(yields_data) >= 4:
        # Sort by maturity
        sorted_data = sorted(zip(maturities, yields_data))
        maturities, yields_data = zip(*sorted_data)
        return list(maturities), list(yields_data)

    # Fallback to sample data if live fetch fails
    maturities = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30]
    yields = [4.8, 4.6, 4.5, 4.2, 4.1, 4.0, 4.05, 4.1, 4.3, 4.4, 4.5]
    return maturities, yields


@st.cache_data(ttl=3600)
def fetch_german_bund_yields():
    """Fetch live German Bund yields from Yahoo Finance"""
    # German Government Bond Yield tickers
    de_bond_tickers = {
        "^DEBM03M": {"maturity": 0.25, "name": "3M"},
        "^DEBM06M": {"maturity": 0.5, "name": "6M"},
        "^DEBM01Y": {"maturity": 1, "name": "1Y"},
        "^DEBM02Y": {"maturity": 2, "name": "2Y"},
        "^DEBM03Y": {"maturity": 3, "name": "3Y"},
        "^DEBM05Y": {"maturity": 5, "name": "5Y"},
        "^DEBM07Y": {"maturity": 7, "name": "7Y"},
        "^DEBM10Y": {"maturity": 10, "name": "10Y"},
        "^DEBM15Y": {"maturity": 15, "name": "15Y"},
        "^DEBM20Y": {"maturity": 20, "name": "20Y"},
        "^DEBM30Y": {"maturity": 30, "name": "30Y"}
    }

    yields_data = []
    maturities = []

    for ticker, info in de_bond_tickers.items():
        try:
            bond = yf.Ticker(ticker)
            hist = bond.history(period="5d")
            if not hist.empty:
                current_yield = hist['Close'].iloc[-1]
                yields_data.append(current_yield)
                maturities.append(info['maturity'])
        except:
            continue

    # If we got live data, use it
    if len(yields_data) >= 4:
        sorted_data = sorted(zip(maturities, yields_data))
        maturities, yields_data = zip(*sorted_data)
        return list(maturities), list(yields_data)

    # Fallback to sample data
    maturities = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30]
    yields = [3.2, 3.0, 2.9, 2.8, 2.7, 2.5, 2.55, 2.6, 2.75, 2.85, 2.9]
    return maturities, yields


@st.cache_data(ttl=3600)
def fetch_sa_government_bond_yields():
    """Fetch live South African Government Bond yields"""
    # Try South African bond tickers (JSE)
    sa_bond_tickers = {
        "R2030.JO": {"maturity": 6, "name": "R2030"},   # R186 - 2030 maturity
        "R2032.JO": {"maturity": 8, "name": "R2032"},   # R2032
        "R2035.JO": {"maturity": 11, "name": "R2035"},  # R2035
        "R2040.JO": {"maturity": 16, "name": "R2040"},  # R2040
        "R2048.JO": {"maturity": 24, "name": "R2048"}   # R2048
    }

    yields_data = []
    maturities = []

    for ticker, info in sa_bond_tickers.items():
        try:
            bond = yf.Ticker(ticker)
            hist = bond.history(period="5d")
            if not hist.empty and 'Close' in hist.columns:
                # For bonds, we need to convert price to yield (approximate)
                # This is a simplified calculation
                price = hist['Close'].iloc[-1]
                # Rough yield approximation: higher price = lower yield
                # This is simplified - real calculation would need coupon rate
                continue  # Skip for now
        except:
            continue

    # Use sample data for SA bonds (JSE bond data is tricky to fetch directly)
    maturities = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30]
    yields = [8.5, 9.0, 9.5, 10.0, 10.3, 10.8, 11.0, 11.2, 11.4, 11.5, 11.6]
    return maturities, yields


@st.cache_data(ttl=300)
def fetch_market_data(ticker):
    # ATLAS Refactoring - Use cached market data fetcher
    try:
        # Import ticker conversion utility
        from modules import convert_ee_ticker_to_yahoo

        # Convert Easy Equities ticker to Yahoo Finance format
        yahoo_ticker = convert_ee_ticker_to_yahoo(ticker)

        if REFACTORED_MODULES_AVAILABLE:
            info = market_data.get_company_info(yahoo_ticker)
            hist = market_data.get_stock_history(yahoo_ticker, period="5d", interval="1d")
        else:
            # Fallback to old method
            stock = yf.Ticker(yahoo_ticker)
            info = stock.info
            hist = stock.history(period="5d")

        if hist.empty:
            return None

        # Convert timezone-aware index to timezone-naive
        if hist.index.tz is not None:
            hist.index = hist.index.tz_localize(None)

        current_price = hist['Close'].iloc[-1]
        prev_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
        daily_change = current_price - prev_close
        daily_change_pct = (daily_change / prev_close * 100) if prev_close else 0

        five_day_return = ((current_price / hist['Close'].iloc[0]) - 1) * 100 if len(hist) >= 5 else 0

        company_name = info.get('longName', info.get('shortName', ticker))

        return {
            "price": current_price,
            "daily_change": daily_change,
            "daily_change_pct": daily_change_pct,
            "five_day_return": five_day_return,
            "volume": info.get('volume', 0),
            "avg_volume": info.get('averageVolume', 0),
            "sector": info.get('sector', 'Unknown'),
            "beta": info.get('beta', None),
            "market_cap": info.get('marketCap', 0),
            "company_name": company_name,
            "52_week_high": info.get('fiftyTwoWeekHigh', None),
            "52_week_low": info.get('fiftyTwoWeekLow', None)
        }
    except Exception as e:
        # ATLAS Refactoring: User-friendly error handling
        if REFACTORED_MODULES_AVAILABLE:
            ErrorHandler.handle_error(
                error=e,
                context=f"fetching market data for {ticker}",
                fallback_value=None,
                show_traceback=False
            )
        return None


@st.cache_data(ttl=600)
def fetch_historical_data(ticker, start_date, end_date):
    try:
        # Import ticker conversion utility
        from modules import convert_ee_ticker_to_yahoo

        # Convert Easy Equities ticker to Yahoo Finance format
        yahoo_ticker = convert_ee_ticker_to_yahoo(ticker)

        stock = yf.Ticker(yahoo_ticker)
        hist = stock.history(start=start_date, end=end_date)
        if not hist.empty:
            # Convert timezone-aware index to timezone-naive to prevent comparison errors
            if hist.index.tz is not None:
                hist.index = hist.index.tz_localize(None)
            return hist
    except:
        pass
    return None


@st.cache_data(ttl=3600)
def fetch_stock_info(ticker):
    """Fetch stock information from yfinance"""
    # ATLAS Refactoring - Use cached market data fetcher
    try:
        # Import ticker conversion utility
        from modules import convert_ee_ticker_to_yahoo

        # Convert Easy Equities ticker to Yahoo Finance format
        yahoo_ticker = convert_ee_ticker_to_yahoo(ticker)

        if REFACTORED_MODULES_AVAILABLE:
            return market_data.get_company_info(yahoo_ticker)
        else:
            # Fallback to old method
            stock = yf.Ticker(yahoo_ticker)
            info = stock.info
            return info
    except Exception as e:
        # ATLAS Refactoring: User-friendly error handling
        if REFACTORED_MODULES_AVAILABLE:
            ErrorHandler.handle_error(
                error=e,
                context=f"fetching stock information for {ticker}",
                fallback_value=None,
                show_traceback=False
            )
        return None


@st.cache_data(ttl=3600)
def fetch_analyst_data(ticker):
    # ATLAS Refactoring - Use cached market data fetcher
    try:
        if REFACTORED_MODULES_AVAILABLE:
            info = market_data.get_company_info(ticker)
        else:
            # Fallback to old method
            stock = yf.Ticker(ticker)
            info = stock.info

        rating = info.get('recommendationKey', 'none')
        if rating == 'none' or rating is None:
            rating = "No Coverage"

        return {
            'rating': rating.upper() if rating != "No Coverage" else rating,
            'target_price': info.get('targetMeanPrice'),
            'num_analysts': info.get('numberOfAnalystOpinions', 0),
            'success': True
        }
    except Exception as e:
        # ATLAS Refactoring: User-friendly error handling
        if REFACTORED_MODULES_AVAILABLE:
            ErrorHandler.handle_error(
                error=e,
                context=f"fetching analyst data for {ticker}",
                fallback_value={'success': False, 'rating': 'No Coverage', 'target_price': None},
                show_traceback=False
            )
        return {'success': False, 'rating': 'No Coverage', 'target_price': None}


def fetch_company_financials(ticker):
    """Fetch comprehensive financial data for valuation.

    Uses yfinance with robust field name fallbacks to handle variations
    across different companies and sectors (pharma, biotech, etc.).
    Falls back to direct yfinance if refactored module returns empty data.
    """
    try:
        # Try refactored module first, then direct yfinance as fallback
        info = {}
        income_stmt = pd.DataFrame()
        balance_sheet = pd.DataFrame()
        cash_flow = pd.DataFrame()

        if REFACTORED_MODULES_AVAILABLE:
            info = market_data.get_company_info(ticker)
            income_stmt = market_data.get_financials(ticker, statement_type="income")
            balance_sheet = market_data.get_financials(ticker, statement_type="balance")
            cash_flow = market_data.get_financials(ticker, statement_type="cashflow")

        # Direct yfinance fallback if refactored module returned empty data
        if not info or income_stmt.empty:
            stock = yf.Ticker(ticker)
            if not info:
                info = stock.info or {}
            if income_stmt.empty:
                income_stmt = stock.income_stmt if hasattr(stock, 'income_stmt') and stock.income_stmt is not None else stock.financials
            if balance_sheet.empty:
                balance_sheet = stock.balance_sheet
            if cash_flow.empty:
                cash_flow = stock.cashflow if hasattr(stock, 'cashflow') else stock.cash_flow

        # Ensure DataFrames are valid
        if income_stmt is None:
            income_stmt = pd.DataFrame()
        if balance_sheet is None:
            balance_sheet = pd.DataFrame()
        if cash_flow is None:
            cash_flow = pd.DataFrame()

        # Basic company info - try multiple key names for price
        current_price = info.get('currentPrice') or info.get('regularMarketPrice') or info.get('previousClose', 0)
        shares = info.get('sharesOutstanding') or info.get('impliedSharesOutstanding', 0)

        company_data = {
            'ticker': ticker,
            'name': info.get('longName') or info.get('shortName', ticker),
            'sector': info.get('sector', 'Unknown'),
            'industry': info.get('industry', 'Unknown'),
            'current_price': current_price,
            'market_cap': info.get('marketCap', 0),
            'shares_outstanding': shares,
            'beta': info.get('beta', 1.0),
            'forward_pe': info.get('forwardPE'),
            'trailing_pe': info.get('trailingPE'),
        }

        # Parse financials with robust field name fallbacks
        financials = {}

        if isinstance(income_stmt, pd.DataFrame) and not income_stmt.empty:
            latest_col = income_stmt.columns[0]

            # Revenue: try multiple field names (varies by company/sector)
            financials['revenue'] = _safe_lookup(income_stmt, latest_col, [
                'Total Revenue', 'Revenue', 'Operating Revenue',
                'Total Revenue And Other Operating Revenues'
            ])
            # EBIT: try multiple field names
            financials['ebit'] = _safe_lookup(income_stmt, latest_col, [
                'EBIT', 'Operating Income', 'Operating Income Loss',
                'Normalized EBITDA', 'Total Operating Income As Reported'
            ])
            # Net Income
            financials['net_income'] = _safe_lookup(income_stmt, latest_col, [
                'Net Income', 'Net Income Common Stockholders',
                'Net Income From Continuing Operations',
                'Net Income Common Stockholders Net Income'
            ])
            # Tax
            financials['tax_expense'] = _safe_lookup(income_stmt, latest_col, [
                'Tax Provision', 'Income Tax Expense', 'Tax Rate For Calcs',
                'Current Income Tax Expense', 'Tax Effect Of Unusual Items'
            ])

            # Calculate tax rate
            if financials['ebit'] != 0 and financials['tax_expense'] != 0:
                financials['tax_rate'] = abs(financials['tax_expense'] / financials['ebit'])
                financials['tax_rate'] = min(financials['tax_rate'], 0.40)  # Cap at 40%
            else:
                financials['tax_rate'] = 0.21  # Default US corporate tax rate

        if isinstance(balance_sheet, pd.DataFrame) and not balance_sheet.empty:
            latest_col = balance_sheet.columns[0]

            financials['total_debt'] = _safe_lookup(balance_sheet, latest_col, [
                'Total Debt', 'Long Term Debt', 'Long Term Debt And Capital Lease Obligation',
                'Total Non Current Liabilities Net Minority Interest',
                'Current Debt And Capital Lease Obligation', 'Net Debt'
            ])
            financials['cash'] = _safe_lookup(balance_sheet, latest_col, [
                'Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments',
                'Cash Financial', 'Cash And Short Term Investments',
                'Cash Equivalents', 'Cash'
            ])
            financials['total_equity'] = _safe_lookup(balance_sheet, latest_col, [
                'Total Equity Gross Minority Interest', 'Stockholders Equity',
                'Total Stockholders Equity', 'Common Stock Equity',
                'Total Capitalization', 'Tangible Book Value'
            ])

        if isinstance(cash_flow, pd.DataFrame) and not cash_flow.empty:
            latest_col = cash_flow.columns[0]

            capex_val = _safe_lookup(cash_flow, latest_col, [
                'Capital Expenditure', 'Capital Expenditures',
                'Purchase Of Property Plant And Equipment',
                'Net PPE Purchase And Sale'
            ])
            financials['capex'] = abs(capex_val) if capex_val else 0

            financials['depreciation'] = _safe_lookup(cash_flow, latest_col, [
                'Depreciation And Amortization', 'Depreciation',
                'Depreciation Amortization Depletion',
                'Depreciation And Amortization In Income Statement'
            ])
            financials['operating_cf'] = _safe_lookup(cash_flow, latest_col, [
                'Operating Cash Flow', 'Cash Flow From Continuing Operating Activities',
                'Total Cash From Operating Activities',
                'Net Cash Provided By Operating Activities'
            ])

        # Calculate working capital change (simplified)
        financials['change_wc'] = 0  # User can adjust

        # Check if we got enough data for a meaningful valuation
        has_revenue = financials.get('revenue', 0) != 0
        has_price = company_data['current_price'] != 0

        if not has_revenue and not has_price:
            return {
                'success': False,
                'error': f"No financial data available for {ticker}. The ticker may be invalid or data is not available on Yahoo Finance."
            }

        return {
            'company': company_data,
            'financials': financials,
            'success': True
        }

    except Exception as e:
        # ATLAS Refactoring: User-friendly error handling
        if REFACTORED_MODULES_AVAILABLE:
            ErrorHandler.handle_error(
                error=e,
                context=f"fetching financial statements for {ticker}",
                fallback_value={'success': False, 'error': str(e)},
                show_traceback=False
            )
        return {
            'success': False,
            'error': str(e)
        }


def fetch_peer_companies(ticker, sector, max_peers=10):
    """
    Fetch comparable companies for relative valuation
    Uses sector peers with similar market cap
    """
    # Sector peer mapping (simplified - can be enhanced)
    sector_peers = {
        'Technology': ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'ORCL', 'CRM', 'ADBE', 'INTC', 'AMD'],
        'Financial Services': ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'BLK', 'V', 'MA'],
        'Healthcare': ['JNJ', 'UNH', 'PFE', 'ABBV', 'TMO', 'LLY', 'MRK', 'ABT'],
        'Consumer Cyclical': ['AMZN', 'TSLA', 'NKE', 'MCD', 'SBUX', 'HD', 'LOW'],
        'Consumer Defensive': ['WMT', 'PG', 'KO', 'PEP', 'COST', 'CL', 'GIS'],
        'Energy': ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD'],
        'Industrials': ['BA', 'CAT', 'GE', 'UPS', 'HON', 'LMT', 'RTX'],
        'Communication Services': ['GOOGL', 'META', 'DIS', 'NFLX', 'CMCSA', 'T', 'VZ'],
    }

    peers = sector_peers.get(sector, [])
    # Remove the target ticker from peers
    peers = [p for p in peers if p != ticker]

    return peers[:max_peers]


@st.cache_data(ttl=600)
def fetch_ticker_performance(ticker, start_date, end_date):
    try:
        data = fetch_historical_data(ticker, start_date, end_date)
        if data is not None and not data.empty:
            returns = data['Close'].pct_change().fillna(0)
            cumulative = (1 + returns).cumprod() - 1
            return cumulative * 100, data
        return None, None
    except:
        return None, None


@st.cache_data(ttl=300)
def fetch_market_watch_data(tickers_dict):
    """v9.7 ENHANCED: Fetches market data with cleaned symbol display"""
    market_data = []

    for ticker, info in tickers_dict.items():
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period="5d")

            if not hist.empty:
                # Convert timezone-aware index to timezone-naive
                if hist.index.tz is not None:
                    hist.index = hist.index.tz_localize(None)

                current = hist['Close'].iloc[-1]
                prev = hist['Close'].iloc[-2] if len(hist) > 1 else current
                change = ((current - prev) / prev) * 100

                five_day = ((current / hist['Close'].iloc[0]) - 1) * 100 if len(hist) >= 5 else 0

                volume = hist['Volume'].iloc[-1]
                avg_volume = hist['Volume'].mean()

                # v9.7 FIX: Clean up symbol for display (remove ^, =F, etc.)
                clean_symbol = ticker.replace('^', '').replace('=F', '').replace('-USD', '')
                # For commodities, show descriptive name instead
                if '=F' in ticker or ticker.endswith('=F'):
                    display_symbol = info.get('name', clean_symbol)
                elif ticker.startswith('^'):
                    display_symbol = info.get('name', clean_symbol)
                else:
                    display_symbol = ticker

                market_data.append({
                    'Symbol': display_symbol,
                    'Name': info.get('name', ticker),
                    'Category': info.get('category', info.get('region', '')),
                    'Last': current,
                    'Change %': change,
                    '5D %': five_day,
                    'Volume': volume,
                    'Avg Volume': avg_volume,
                    'Vol/Avg': volume / avg_volume if avg_volume > 0 else 0,
                    '_raw_ticker': ticker  # Store original ticker for formatting logic
                })
        except:
            continue

    return pd.DataFrame(market_data)
