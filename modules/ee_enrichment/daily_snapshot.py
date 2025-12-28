"""
Daily Snapshot Persistence System for Easy Equities Portfolios

This module stores daily portfolio snapshots to build real performance
history over time, enabling accurate performance tracking without
trade history.

Author: ATLAS Terminal
Version: 1.0.0
"""

import pandas as pd
import numpy as np
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Tuple
import json
import pickle
from pathlib import Path
import streamlit as st
import hashlib


# =============================================================================
# CONFIGURATION
# =============================================================================

SNAPSHOT_DIR = Path("data/ee_snapshots")
SNAPSHOT_FILE = SNAPSHOT_DIR / "daily_snapshots.pkl"
SNAPSHOT_INDEX_FILE = SNAPSHOT_DIR / "snapshot_index.json"


# =============================================================================
# INITIALIZATION
# =============================================================================

def ensure_snapshot_directory():
    """Create snapshot directory if it doesn't exist."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)


def get_holdings_hash(ee_df: pd.DataFrame) -> str:
    """
    Generate a hash of current holdings to detect changes.

    Parameters:
    -----------
    ee_df : pd.DataFrame
        Easy Equities portfolio DataFrame

    Returns:
    --------
    str
        MD5 hash of holdings
    """
    # Create a sorted string representation of holdings
    holdings_str = "|".join(sorted([
        f"{row['Ticker']}:{row['Shares']:.4f}"
        for _, row in ee_df.iterrows()
    ]))

    return hashlib.md5(holdings_str.encode()).hexdigest()


# =============================================================================
# SNAPSHOT CREATION
# =============================================================================

def create_snapshot(ee_df: pd.DataFrame,
                    enriched_df: Optional[pd.DataFrame] = None) -> Dict:
    """
    Create a snapshot of the current portfolio state.

    Parameters:
    -----------
    ee_df : pd.DataFrame
        Easy Equities portfolio DataFrame
    enriched_df : pd.DataFrame, optional
        Enriched DataFrame with additional metrics

    Returns:
    --------
    dict
        Snapshot dictionary with all portfolio metrics
    """
    snapshot = {
        # Metadata
        'snapshot_id': datetime.now().strftime('%Y%m%d_%H%M%S'),
        'date': date.today().isoformat(),
        'timestamp': datetime.now().isoformat(),
        'holdings_hash': get_holdings_hash(ee_df),

        # Portfolio Values
        'total_market_value': float(ee_df['Market_Value'].sum()),
        'total_cost_basis': float(ee_df['Purchase_Value'].sum()),
        'total_unrealized_pnl': float(ee_df['Unrealized_PnL'].sum()),
        'unrealized_pnl_pct': float(
            (ee_df['Unrealized_PnL'].sum() / ee_df['Purchase_Value'].sum() * 100)
            if ee_df['Purchase_Value'].sum() > 0 else 0
        ),

        # Position Metrics
        'position_count': len(ee_df),
        'tickers': ee_df['Ticker'].tolist(),

        # Detailed Holdings (for reconstruction if needed)
        'holdings': ee_df[[
            'Ticker', 'Shares', 'Cost_Basis', 'Current_Price',
            'Market_Value', 'Purchase_Value', 'Unrealized_PnL'
        ]].to_dict('records'),

        # Risk Metrics (if enriched)
        'portfolio_beta': None,
        'portfolio_volatility': None,
        'sector_allocation': None
    }

    # Add enriched metrics if available
    if enriched_df is not None and 'Beta' in enriched_df.columns:
        total_value = enriched_df['Market_Value'].sum()
        weights = enriched_df['Market_Value'] / total_value if total_value > 0 else 0

        # Weighted beta
        weighted_beta = (enriched_df['Beta'].fillna(1.0) * weights).sum()
        snapshot['portfolio_beta'] = float(weighted_beta)

        # Sector allocation
        if 'Sector' in enriched_df.columns:
            sector_alloc = enriched_df.groupby('Sector')['Market_Value'].sum()
            sector_alloc = (sector_alloc / sector_alloc.sum() * 100).to_dict()
            snapshot['sector_allocation'] = sector_alloc

    return snapshot


def save_snapshot(snapshot: Dict) -> bool:
    """
    Save snapshot to persistent storage.

    Parameters:
    -----------
    snapshot : dict
        Snapshot dictionary to save

    Returns:
    --------
    bool
        True if save successful
    """
    ensure_snapshot_directory()

    try:
        # Load existing snapshots
        snapshots = load_all_snapshots()

        # Check if we already have a snapshot for today
        today = date.today().isoformat()
        existing_today = [s for s in snapshots if s.get('date') == today]

        if existing_today:
            # Update today's snapshot instead of adding new
            snapshots = [s for s in snapshots if s.get('date') != today]

        # Add new snapshot
        snapshots.append(snapshot)

        # Sort by date
        snapshots.sort(key=lambda x: x.get('timestamp', ''))

        # Save to file
        with open(SNAPSHOT_FILE, 'wb') as f:
            pickle.dump(snapshots, f)

        # Update index
        update_snapshot_index(snapshots)

        print(f"Snapshot saved for {snapshot['date']}")
        return True

    except Exception as e:
        print(f"Failed to save snapshot: {e}")
        return False


def update_snapshot_index(snapshots: List[Dict]):
    """Update the snapshot index file for quick lookups."""
    index = {
        'last_updated': datetime.now().isoformat(),
        'snapshot_count': len(snapshots),
        'date_range': {
            'first': snapshots[0]['date'] if snapshots else None,
            'last': snapshots[-1]['date'] if snapshots else None
        },
        'dates': [s['date'] for s in snapshots]
    }

    with open(SNAPSHOT_INDEX_FILE, 'w') as f:
        json.dump(index, f, indent=2)


# =============================================================================
# SNAPSHOT LOADING
# =============================================================================

def load_all_snapshots() -> List[Dict]:
    """
    Load all snapshots from storage.

    Returns:
    --------
    List[Dict]
        List of all snapshots, sorted by date
    """
    if not SNAPSHOT_FILE.exists():
        return []

    try:
        with open(SNAPSHOT_FILE, 'rb') as f:
            snapshots = pickle.load(f)
        return snapshots
    except Exception as e:
        print(f"Warning: Failed to load snapshots: {e}")
        return []


def load_snapshots_range(start_date: date, end_date: date) -> List[Dict]:
    """
    Load snapshots within a date range.

    Parameters:
    -----------
    start_date : date
        Start of range (inclusive)
    end_date : date
        End of range (inclusive)

    Returns:
    --------
    List[Dict]
        Snapshots within the date range
    """
    all_snapshots = load_all_snapshots()

    start_str = start_date.isoformat()
    end_str = end_date.isoformat()

    return [
        s for s in all_snapshots
        if start_str <= s.get('date', '') <= end_str
    ]


def get_snapshot_index() -> Optional[Dict]:
    """Get snapshot index for quick queries."""
    if not SNAPSHOT_INDEX_FILE.exists():
        return None

    try:
        with open(SNAPSHOT_INDEX_FILE, 'r') as f:
            return json.load(f)
    except:
        return None


# =============================================================================
# PERFORMANCE CALCULATION FROM SNAPSHOTS
# =============================================================================

def calculate_performance_from_snapshots(
    snapshots: List[Dict],
    include_holdings_changes: bool = True
) -> pd.DataFrame:
    """
    Calculate performance time series from snapshots.

    Parameters:
    -----------
    snapshots : List[Dict]
        List of portfolio snapshots
    include_holdings_changes : bool
        Flag changes in holdings composition

    Returns:
    --------
    pd.DataFrame
        Performance DataFrame with daily values and returns
    """
    if not snapshots:
        return pd.DataFrame()

    records = []
    prev_hash = None

    for snap in snapshots:
        record = {
            'date': pd.to_datetime(snap['date']),
            'portfolio_value': snap['total_market_value'],
            'cost_basis': snap['total_cost_basis'],
            'unrealized_pnl': snap['total_unrealized_pnl'],
            'unrealized_pnl_pct': snap['unrealized_pnl_pct'],
            'position_count': snap['position_count'],
            'holdings_changed': snap['holdings_hash'] != prev_hash if prev_hash else False
        }

        if snap.get('portfolio_beta'):
            record['beta'] = snap['portfolio_beta']

        records.append(record)
        prev_hash = snap['holdings_hash']

    df = pd.DataFrame(records)
    df = df.set_index('date').sort_index()

    # Calculate daily returns
    df['daily_return'] = df['portfolio_value'].pct_change()

    # Calculate cumulative return
    df['cumulative_return'] = (1 + df['daily_return']).cumprod() - 1

    # Calculate drawdown
    rolling_max = df['portfolio_value'].expanding().max()
    df['drawdown'] = (df['portfolio_value'] - rolling_max) / rolling_max

    return df


def get_performance_summary(days: int = 30) -> Optional[Dict]:
    """
    Get performance summary for the last N days.

    Parameters:
    -----------
    days : int
        Number of days to analyze

    Returns:
    --------
    dict or None
        Performance summary metrics
    """
    end_date = date.today()
    start_date = end_date - timedelta(days=days)

    snapshots = load_snapshots_range(start_date, end_date)

    if len(snapshots) < 2:
        return None

    perf_df = calculate_performance_from_snapshots(snapshots)

    if perf_df.empty:
        return None

    return {
        'period_days': len(perf_df),
        'start_value': perf_df['portfolio_value'].iloc[0],
        'end_value': perf_df['portfolio_value'].iloc[-1],
        'total_return': (perf_df['portfolio_value'].iloc[-1] / perf_df['portfolio_value'].iloc[0] - 1) * 100,
        'volatility': perf_df['daily_return'].std() * np.sqrt(252) * 100,
        'max_drawdown': perf_df['drawdown'].min() * 100,
        'sharpe_ratio': (perf_df['daily_return'].mean() / perf_df['daily_return'].std() * np.sqrt(252)) if perf_df['daily_return'].std() > 0 else 0,
        'holdings_changes': perf_df['holdings_changed'].sum(),
        'data_points': len(perf_df)
    }


# =============================================================================
# AUTO-SNAPSHOT ON SYNC
# =============================================================================

def auto_snapshot_on_sync(ee_df: pd.DataFrame,
                          enriched_df: Optional[pd.DataFrame] = None) -> bool:
    """
    Automatically create and save a snapshot when EE syncs.

    Call this function after every successful EE sync.

    Parameters:
    -----------
    ee_df : pd.DataFrame
        Fresh Easy Equities portfolio DataFrame
    enriched_df : pd.DataFrame, optional
        Enriched DataFrame if available

    Returns:
    --------
    bool
        True if snapshot was saved
    """
    snapshot = create_snapshot(ee_df, enriched_df)
    return save_snapshot(snapshot)


# =============================================================================
# SNAPSHOT STATISTICS
# =============================================================================

def get_snapshot_stats() -> Dict:
    """
    Get statistics about stored snapshots.

    Returns:
    --------
    dict
        Snapshot statistics
    """
    index = get_snapshot_index()

    if not index:
        all_snapshots = load_all_snapshots()
        if not all_snapshots:
            return {
                'has_data': False,
                'snapshot_count': 0,
                'days_of_data': 0
            }
        update_snapshot_index(all_snapshots)
        index = get_snapshot_index()

    if not index:
        return {'has_data': False, 'snapshot_count': 0, 'days_of_data': 0}

    return {
        'has_data': index['snapshot_count'] > 0,
        'snapshot_count': index['snapshot_count'],
        'days_of_data': index['snapshot_count'],  # One snapshot per day
        'first_snapshot': index['date_range']['first'],
        'last_snapshot': index['date_range']['last'],
        'last_updated': index['last_updated']
    }
