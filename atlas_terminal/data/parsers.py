"""
Data Parsers Module
Handles portfolio data parsing and account information extraction

CRITICAL FIXES FROM v9.7:
- Leverage calculation now handles negative cash properly
- Margin detection fixed
- Returns correct account metrics
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional, Dict, Any
import logging

from ..config import (PORTFOLIO_CACHE, TRADE_HISTORY_CACHE,
                     ACCOUNT_HISTORY_CACHE, ETF_SECTORS)
from .validators import is_valid_dataframe

logger = logging.getLogger(__name__)


def classify_ticker_sector(ticker: str, default_sector: str) -> str:
    """
    Classify ticker into sector

    Args:
        ticker: Ticker symbol
        default_sector: Default sector from data

    Returns:
        Sector classification
    """
    if pd.notna(default_sector) and default_sector != "Unknown":
        return default_sector

    if ticker in ETF_SECTORS:
        return ETF_SECTORS[ticker]

    return "Other"


def get_leverage_info() -> Optional[Dict[str, float]]:
    """
    CRITICAL FIX: Properly calculate leverage from account history

    Returns:
        Dict with:
        - margin_used: Amount of margin borrowed
        - cash_balance: Current cash (negative if using margin)
        - leverage_ratio: Total Value / Equity
        - total_value: Portfolio total value
        - equity: Your actual equity (Total Value - Margin)

    Returns None if no account history available
    """
    try:
        from .cache_manager import load_account_history
        account_df = load_account_history()

        if account_df is None or not is_valid_dataframe(account_df):
            logger.debug("No account history available for leverage calculation")
            return None

        # Get latest cash balance
        latest_cash = account_df.get('Cash Balance',
                                     account_df.get('Cash', pd.Series([0]))).iloc[-1]

        # CRITICAL FIX: Handle string formatting with parentheses for negatives
        if isinstance(latest_cash, str):
            latest_cash = (latest_cash.replace('$', '').replace(',', '')
                         .replace('(', '-').replace(')', ''))
            try:
                latest_cash = float(latest_cash)
            except ValueError as e:
                logger.error(f"Could not parse cash balance: {latest_cash}, error: {e}")
                latest_cash = 0

        # Check for explicit margin column
        latest_margin = 0
        if 'Margin Used' in account_df.columns:
            latest_margin = account_df['Margin Used'].iloc[-1]
            if isinstance(latest_margin, str):
                latest_margin = (latest_margin.replace('$', '').replace(',', '')
                               .replace('(', '-').replace(')', ''))
                try:
                    latest_margin = float(latest_margin)
                except ValueError:
                    latest_margin = 0

        # CRITICAL FIX: Negative cash = margin is being used
        if latest_cash < 0:
            latest_margin = abs(latest_cash)

        # Calculate total portfolio value
        total_value = 0
        if 'Total Value' in account_df.columns:
            total_value = account_df['Total Value'].iloc[-1]
            if isinstance(total_value, str):
                total_value = total_value.replace('$', '').replace(',', '')
                try:
                    total_value = float(total_value)
                except ValueError:
                    total_value = 0

        # Calculate equity and leverage ratio
        equity = total_value - latest_margin
        leverage_ratio = total_value / equity if equity > 0 else 1.0

        logger.info(f"Leverage Info - Total: ${total_value:,.2f}, Margin: ${latest_margin:,.2f}, "
                   f"Equity: ${equity:,.2f}, Leverage: {leverage_ratio:.2f}x")

        return {
            'margin_used': latest_margin,
            'cash_balance': latest_cash,
            'leverage_ratio': leverage_ratio,
            'total_value': total_value,
            'equity': equity
        }

    except Exception as e:
        logger.error(f"Error calculating leverage info: {e}", exc_info=True)
        return None


def parse_portfolio_snapshot(file_path: Path) -> Optional[pd.DataFrame]:
    """
    Parse portfolio snapshot from file (CSV or Excel)

    Args:
        file_path: Path to portfolio file

    Returns:
        DataFrame with portfolio holdings or None
    """
    try:
        if file_path.suffix == '.csv':
            df = pd.read_csv(file_path)
        elif file_path.suffix in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path)
        else:
            logger.error(f"Unsupported file format: {file_path.suffix}")
            return None

        if is_valid_dataframe(df):
            logger.info(f"Successfully parsed {len(df)} holdings from {file_path.name}")
            return df
        else:
            logger.warning(f"Parsed file is empty: {file_path}")
            return None

    except Exception as e:
        logger.error(f"Error parsing portfolio file {file_path}: {e}", exc_info=True)
        return None


def extract_sector_from_holdings(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add sector classification to holdings dataframe

    Args:
        df: Holdings dataframe with 'Ticker' column

    Returns:
        DataFrame with 'Sector' column added
    """
    if 'Sector' not in df.columns:
        df['Sector'] = 'Unknown'

    df['Sector'] = df.apply(
        lambda row: classify_ticker_sector(row['Ticker'], row.get('Sector', 'Unknown')),
        axis=1
    )

    return df


def calculate_position_weights(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate position weights as % of total portfolio value

    Args:
        df: Holdings dataframe with value columns

    Returns:
        DataFrame with 'Weight %' column added
    """
    # Try different column names for position value
    value_col = None
    for col in ['Total Value', 'Market Value', 'Value', 'Position Value']:
        if col in df.columns:
            value_col = col
            break

    if value_col is None:
        logger.warning("No value column found for weight calculation")
        df['Weight %'] = 0
        return df

    try:
        total_value = df[value_col].sum()
        if total_value > 0:
            df['Weight %'] = (df[value_col] / total_value) * 100
        else:
            df['Weight %'] = 0

        logger.debug(f"Calculated position weights, total portfolio value: ${total_value:,.2f}")

    except Exception as e:
        logger.error(f"Error calculating position weights: {e}")
        df['Weight %'] = 0

    return df


def standardize_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """
    Standardize column names across different data sources

    Args:
        df: Input dataframe

    Returns:
        DataFrame with standardized column names
    """
    # Common column name mappings
    column_mappings = {
        'Symbol': 'Ticker',
        'Qty': 'Quantity',
        'Shares': 'Quantity',
        'Price': 'Current Price',
        'Last Price': 'Current Price',
        'Close': 'Current Price',
        'Market Value': 'Total Value',
        'Position Value': 'Total Value',
    }

    for old_name, new_name in column_mappings.items():
        if old_name in df.columns and new_name not in df.columns:
            df.rename(columns={old_name: new_name}, inplace=True)
            logger.debug(f"Renamed column '{old_name}' to '{new_name}'")

    return df


def build_portfolio_from_trades(trade_history: pd.DataFrame) -> Optional[pd.DataFrame]:
    """
    Build current portfolio positions from trade history

    Calculates net positions and average cost basis from all trades

    Args:
        trade_history: DataFrame with columns: Ticker/Symbol, Action, Quantity, Price, Date

    Returns:
        DataFrame with current positions (Ticker, Quantity, Cost Basis, Total Cost)
    """
    if not is_valid_dataframe(trade_history):
        logger.error("Invalid trade history for portfolio building")
        return None

    try:
        # Standardize column names
        df = trade_history.copy()
        df = standardize_column_names(df)

        # Ensure required columns exist
        required_cols = ['Ticker', 'Action', 'Quantity', 'Price']
        missing_cols = [col for col in required_cols if col not in df.columns]

        if missing_cols:
            # Try alternative column names
            if 'Symbol' in df.columns:
                df['Ticker'] = df['Symbol']
            if 'Type' in df.columns and 'Action' not in df.columns:
                df['Action'] = df['Type']
            if 'Qty' in df.columns and 'Quantity' not in df.columns:
                df['Quantity'] = df['Qty']

            # Check again
            missing_cols = [col for col in required_cols if col not in df.columns]
            if missing_cols:
                logger.error(f"Missing required columns: {missing_cols}")
                return None

        # Clean up actions (handle different formats)
        df['Action'] = df['Action'].str.upper().str.strip()

        # Build positions by ticker
        positions = {}

        for _, trade in df.iterrows():
            ticker = trade['Ticker']
            action = trade['Action']
            qty = float(trade['Quantity'])
            price = float(trade['Price'])

            if ticker not in positions:
                positions[ticker] = {
                    'total_qty': 0,
                    'total_cost': 0
                }

            if action in ['BUY', 'B', 'LONG']:
                positions[ticker]['total_qty'] += qty
                positions[ticker]['total_cost'] += (qty * price)
            elif action in ['SELL', 'S', 'SHORT']:
                positions[ticker]['total_qty'] -= qty
                # For sells, reduce cost basis proportionally
                if positions[ticker]['total_qty'] > 0:
                    cost_per_share = positions[ticker]['total_cost'] / (positions[ticker]['total_qty'] + qty)
                    positions[ticker]['total_cost'] -= (qty * cost_per_share)

        # Convert to DataFrame with only open positions
        portfolio_data = []
        for ticker, data in positions.items():
            if data['total_qty'] > 0:  # Only include open positions
                avg_cost = data['total_cost'] / data['total_qty'] if data['total_qty'] > 0 else 0
                portfolio_data.append({
                    'Ticker': ticker,
                    'Quantity': data['total_qty'],
                    'Cost Basis': avg_cost,
                    'Total Cost': data['total_cost']
                })

        if not portfolio_data:
            logger.warning("No open positions found in trade history")
            return None

        result_df = pd.DataFrame(portfolio_data)
        logger.info(f"Built portfolio from trades: {len(result_df)} open positions")

        return result_df

    except Exception as e:
        logger.error(f"Error building portfolio from trades: {e}", exc_info=True)
        return None
