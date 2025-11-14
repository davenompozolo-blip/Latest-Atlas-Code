"""
Cache Manager Module
Handles all file-based caching (pickle) for portfolio, trade, and account data
"""

import pickle
import json
from pathlib import Path
from typing import Optional, Any, List, Dict
import logging
import pandas as pd

from ..config import (PORTFOLIO_CACHE, TRADE_HISTORY_CACHE,
                     ACCOUNT_HISTORY_CACHE, TRADES_JOURNAL)
from .validators import is_valid_dataframe

logger = logging.getLogger(__name__)


def save_portfolio_data(data: List[Dict]) -> bool:
    """
    Save portfolio data to cache

    Args:
        data: List of portfolio holdings

    Returns:
        True if saved successfully
    """
    try:
        with open(PORTFOLIO_CACHE, "wb") as f:
            pickle.dump(data, f)
        logger.info(f"Saved {len(data)} portfolio holdings to cache")
        return True
    except Exception as e:
        logger.error(f"Error saving portfolio data: {e}", exc_info=True)
        return False


def load_portfolio_data() -> List[Dict]:
    """
    Load portfolio data from cache

    Returns:
        List of portfolio holdings or empty list
    """
    if not PORTFOLIO_CACHE.exists():
        logger.debug("Portfolio cache does not exist")
        return []

    try:
        with open(PORTFOLIO_CACHE, "rb") as f:
            data = pickle.load(f)
        logger.info(f"Loaded {len(data)} portfolio holdings from cache")
        return data
    except Exception as e:
        logger.error(f"Error loading portfolio data: {e}", exc_info=True)
        return []


def save_trade_history(df: pd.DataFrame) -> bool:
    """
    Save trade history to cache

    Args:
        df: DataFrame with trade history

    Returns:
        True if saved successfully
    """
    try:
        with open(TRADE_HISTORY_CACHE, "wb") as f:
            pickle.dump(df, f)
        logger.info(f"Saved trade history with {len(df)} trades to cache")
        return True
    except Exception as e:
        logger.error(f"Error saving trade history: {e}", exc_info=True)
        return False


def load_trade_history() -> Optional[pd.DataFrame]:
    """
    Load trade history from cache

    Returns:
        DataFrame with trade history or None
    """
    if not TRADE_HISTORY_CACHE.exists():
        logger.debug("Trade history cache does not exist")
        return None

    try:
        with open(TRADE_HISTORY_CACHE, "rb") as f:
            df = pickle.load(f)

        if is_valid_dataframe(df):
            logger.info(f"Loaded trade history with {len(df)} trades")
            return df
        else:
            logger.warning("Trade history cache is empty")
            return None

    except Exception as e:
        logger.error(f"Error loading trade history: {e}", exc_info=True)
        return None


def save_account_history(df: pd.DataFrame) -> bool:
    """
    Save account history to cache

    Args:
        df: DataFrame with account history

    Returns:
        True if saved successfully
    """
    try:
        with open(ACCOUNT_HISTORY_CACHE, "wb") as f:
            pickle.dump(df, f)
        logger.info(f"Saved account history with {len(df)} entries to cache")
        return True
    except Exception as e:
        logger.error(f"Error saving account history: {e}", exc_info=True)
        return False


def load_account_history() -> Optional[pd.DataFrame]:
    """
    Load account history from cache

    Returns:
        DataFrame with account history or None
    """
    if not ACCOUNT_HISTORY_CACHE.exists():
        logger.debug("Account history cache does not exist")
        return None

    try:
        with open(ACCOUNT_HISTORY_CACHE, "rb") as f:
            df = pickle.load(f)

        if is_valid_dataframe(df):
            logger.info(f"Loaded account history with {len(df)} entries")
            return df
        else:
            logger.warning("Account history cache is empty")
            return None

    except Exception as e:
        logger.error(f"Error loading account history: {e}", exc_info=True)
        return None


def save_trades_journal(trades: List[Dict]) -> bool:
    """
    Save trade journal to JSON cache

    Args:
        trades: List of trade dicts

    Returns:
        True if saved successfully
    """
    try:
        with open(TRADES_JOURNAL, "w") as f:
            json.dump(trades, f, indent=2, default=str)
        logger.info(f"Saved {len(trades)} trades to journal")
        return True
    except Exception as e:
        logger.error(f"Error saving trades journal: {e}", exc_info=True)
        return False


def load_trades_journal() -> List[Dict]:
    """
    Load trade journal from JSON cache

    Returns:
        List of trade dicts or empty list
    """
    if not TRADES_JOURNAL.exists():
        logger.debug("Trades journal does not exist")
        return []

    try:
        with open(TRADES_JOURNAL, "r") as f:
            trades = json.load(f)
        logger.info(f"Loaded {len(trades)} trades from journal")
        return trades
    except Exception as e:
        logger.error(f"Error loading trades journal: {e}", exc_info=True)
        return []


def clear_all_caches() -> bool:
    """
    Clear all cache files

    Returns:
        True if all caches cleared successfully
    """
    cache_files = [
        PORTFOLIO_CACHE,
        TRADE_HISTORY_CACHE,
        ACCOUNT_HISTORY_CACHE,
        TRADES_JOURNAL
    ]

    success = True
    for cache_file in cache_files:
        if cache_file.exists():
            try:
                cache_file.unlink()
                logger.info(f"Deleted cache file: {cache_file.name}")
            except Exception as e:
                logger.error(f"Error deleting {cache_file.name}: {e}")
                success = False

    return success


def get_cache_info() -> Dict[str, Any]:
    """
    Get information about cache files

    Returns:
        Dict with cache file info
    """
    cache_files = {
        'portfolio': PORTFOLIO_CACHE,
        'trades': TRADE_HISTORY_CACHE,
        'account': ACCOUNT_HISTORY_CACHE,
        'journal': TRADES_JOURNAL
    }

    info = {}
    for name, cache_file in cache_files.items():
        if cache_file.exists():
            info[name] = {
                'exists': True,
                'size_kb': cache_file.stat().st_size / 1024,
                'modified': cache_file.stat().st_mtime
            }
        else:
            info[name] = {'exists': False}

    return info
