"""
Data Validation Module
Handles all data validation and integrity checks

CRITICAL FIXES:
- Proper pandas Series/DataFrame validation (no more boolean errors)
- Flexible column name handling
- Comprehensive data quality scoring
"""

import pandas as pd
import numpy as np
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)


def is_valid_series(series: Optional[pd.Series]) -> bool:
    """
    FIXED: Safely check if a pandas Series has valid data
    Never use 'if series:' - it raises ValueError!

    Args:
        series: Pandas Series to validate

    Returns:
        True if series is valid and not empty
    """
    return series is not None and isinstance(series, pd.Series) and not series.empty


def is_valid_dataframe(df: Optional[pd.DataFrame]) -> bool:
    """
    FIXED: Safely check if a pandas DataFrame has valid data
    Never use 'if df:' - it raises ValueError!

    Args:
        df: Pandas DataFrame to validate

    Returns:
        True if dataframe is valid and not empty
    """
    return df is not None and isinstance(df, pd.DataFrame) and not df.empty


def validate_portfolio_data(portfolio_data) -> Dict:
    """
    Comprehensive portfolio data validation with flexible column handling

    Args:
        portfolio_data: List of dicts or DataFrame with portfolio holdings

    Returns:
        Dict with validation results including:
        - is_valid: bool
        - data_quality_score: 0-100
        - issues: List[str]
        - warnings: List[str]
        - total_rows: int
        - complete_rows: int
    """
    if not portfolio_data:
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

    try:
        df = pd.DataFrame(portfolio_data)
    except Exception as e:
        logger.error(f"Failed to convert portfolio data to DataFrame: {e}")
        return {
            'is_valid': False,
            'total_holdings': 0,
            'data_quality_score': 0,
            'issues': [f'Data conversion error: {str(e)}'],
            'warnings': [],
            'null_counts': {},
            'total_rows': 0,
            'complete_rows': 0
        }

    issues = []
    warnings = []

    # Check required columns - use flexible column names
    required_columns = ['Ticker']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        issues.append(f"Missing required columns: {', '.join(missing_columns)}")

    # Check for null values only on existing columns
    existing_check_cols = [col for col in required_columns if col in df.columns]
    null_counts = {}

    if existing_check_cols:
        try:
            null_counts = df[existing_check_cols].isnull().sum().to_dict()
            for col, count in null_counts.items():
                if count > 0:
                    warnings.append(f"{col}: {count} missing values")
        except Exception as e:
            logger.warning(f"Error checking null values: {e}")

    # Check for negative quantities (flexible column names)
    qty_col = None
    for col in ['Quantity', 'Shares', 'Qty']:
        if col in df.columns:
            qty_col = col
            break

    if qty_col:
        try:
            negative_qty = (df[qty_col] < 0).sum()
            if negative_qty > 0:
                warnings.append(f"{negative_qty} holdings with negative quantities (short positions)")
        except Exception as e:
            logger.warning(f"Error checking quantities: {e}")

    # Check for zero/negative prices (flexible column names)
    price_col = None
    for col in ['Current Price', 'Price', 'Last Price', 'Close']:
        if col in df.columns:
            price_col = col
            break

    if price_col:
        try:
            invalid_prices = (df[price_col] <= 0).sum()
            if invalid_prices > 0:
                issues.append(f"{invalid_prices} holdings with invalid prices (≤0)")
        except Exception as e:
            logger.warning(f"Error checking prices: {e}")

    # Check for duplicate tickers
    if 'Ticker' in df.columns:
        try:
            duplicates = df['Ticker'].duplicated().sum()
            if duplicates > 0:
                warnings.append(f"{duplicates} duplicate ticker entries")
        except Exception as e:
            logger.warning(f"Error checking duplicates: {e}")

    # Calculate data quality score (0-100)
    quality_score = 100
    quality_score -= len(issues) * 15  # Severe penalty for issues
    quality_score -= len(warnings) * 5  # Moderate penalty for warnings
    quality_score = max(0, min(100, quality_score))

    # Calculate complete rows
    complete_rows = len(df)
    if existing_check_cols:
        try:
            complete_rows = len(df.dropna(subset=existing_check_cols))
        except Exception as e:
            logger.warning(f"Error calculating complete rows: {e}")

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


def validate_returns_series(returns: Optional[pd.Series],
                           min_observations: int = 2) -> bool:
    """
    Validate returns series for calculations

    Args:
        returns: Series of returns
        min_observations: Minimum required data points

    Returns:
        True if returns are valid for calculations
    """
    if not is_valid_series(returns):
        return False

    if len(returns) < min_observations:
        logger.warning(f"Returns series has only {len(returns)} observations, need at least {min_observations}")
        return False

    # Check for all NaN or infinite values
    if returns.isna().all():
        logger.warning("Returns series contains only NaN values")
        return False

    if np.isinf(returns).any():
        logger.warning("Returns series contains infinite values")
        return False

    return True


def validate_price_data(prices: Optional[pd.Series]) -> bool:
    """
    Validate price series

    Args:
        prices: Series of prices

    Returns:
        True if prices are valid
    """
    if not is_valid_series(prices):
        return False

    # Check for negative prices
    if (prices < 0).any():
        logger.warning("Price series contains negative values")
        return False

    # Check for zero prices
    if (prices == 0).any():
        logger.warning("Price series contains zero values")
        return False

    return True


def is_option_ticker(ticker: str) -> bool:
    """
    Detect if a ticker is an option

    Args:
        ticker: Ticker symbol

    Returns:
        True if ticker appears to be an option
    """
    if len(ticker) <= 6:
        return False

    has_year = any(str(y) in ticker for y in range(2020, 2030))
    has_strike = any(c.isdigit() for c in ticker[6:])
    has_type = ticker[-1] in ['C', 'P'] or 'C' in ticker[6:] or 'P' in ticker[6:]

    return has_year and has_strike and has_type
