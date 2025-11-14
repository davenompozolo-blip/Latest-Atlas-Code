"""
Trade Journal Feature
Institutional-grade trade tracking and performance attribution

NEW IN v10.0:
- Automatic trade detection from account history
- Complete trade lifecycle tracking (entry, hold, exit)
- Performance attribution per trade
- Win/Loss statistics and analysis
- Trade notes, tags, and strategy classification
- Return attribution to specific trades
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
import logging
import json

from ..data.cache_manager import load_trades_journal, save_trades_journal
from ..data.validators import is_valid_dataframe
from ..config import TRADES_JOURNAL

logger = logging.getLogger(__name__)


class TradeJournal:
    """
    Manages trade journal with performance tracking and attribution
    """

    def __init__(self):
        """Initialize TradeJournal"""
        self.trades = self._load_trades()
        logger.info(f"TradeJournal initialized with {len(self.trades)} trades")

    def _load_trades(self) -> List[Dict]:
        """Load trades from cache"""
        return load_trades_journal()

    def _save_trades(self) -> bool:
        """Save trades to cache"""
        return save_trades_journal(self.trades)

    def detect_trades_from_history(self,
                                   trade_history: pd.DataFrame,
                                   portfolio_current: pd.DataFrame) -> int:
        """
        Detect new trades from trade history

        Identifies:
        - Opening trades (BUY to establish position)
        - Closing trades (SELL to close position)
        - Position changes (adds/trims)

        Args:
            trade_history: DataFrame with trade history
            portfolio_current: Current portfolio holdings

        Returns:
            Number of new trades detected
        """
        if not is_valid_dataframe(trade_history):
            logger.error("Invalid trade history for trade detection")
            return 0

        try:
            # Required columns
            required = ['Date', 'Ticker', 'Action', 'Quantity', 'Price']
            missing = [col for col in required if col not in trade_history.columns]

            if missing:
                logger.error(f"Missing required columns for trade detection: {missing}")
                return 0

            # Sort by date
            df = trade_history.sort_values('Date').copy()

            # Track position for each ticker
            positions = {}
            new_trades = 0
            existing_trade_ids = {t['trade_id'] for t in self.trades if 'trade_id' in t}

            for idx, row in df.iterrows():
                ticker = row['Ticker']
                action = row['Action'].upper()
                quantity = abs(row['Quantity'])
                price = row['Price']
                date = pd.to_datetime(row['Date'])

                # Generate trade ID
                trade_id = f"{ticker}_{date.strftime('%Y%m%d')}_{action}_{quantity}"

                # Skip if already logged
                if trade_id in existing_trade_ids:
                    continue

                # Initialize position tracking for ticker
                if ticker not in positions:
                    positions[ticker] = {'quantity': 0, 'cost_basis': 0, 'open_date': None}

                pos = positions[ticker]

                if action in ['BUY', 'BTO']:  # Buy or Buy to Open
                    # Calculate new average cost
                    total_cost = (pos['quantity'] * pos['cost_basis']) + (quantity * price)
                    new_quantity = pos['quantity'] + quantity
                    new_cost_basis = total_cost / new_quantity if new_quantity > 0 else 0

                    # Log trade
                    trade = {
                        'trade_id': trade_id,
                        'ticker': ticker,
                        'action': 'OPEN' if pos['quantity'] == 0 else 'ADD',
                        'entry_date': date.strftime('%Y-%m-%d'),
                        'entry_price': price,
                        'quantity': quantity,
                        'cost_basis': new_cost_basis,
                        'total_cost': quantity * price,
                        'exit_date': None,
                        'exit_price': None,
                        'realized_pnl': None,
                        'return_pct': None,
                        'status': 'OPEN',
                        'hold_days': None,
                        'notes': '',
                        'tags': [],
                        'strategy': 'Unknown'
                    }

                    self.trades.append(trade)
                    new_trades += 1

                    # Update position
                    pos['quantity'] = new_quantity
                    pos['cost_basis'] = new_cost_basis
                    if pos['open_date'] is None:
                        pos['open_date'] = date

                elif action in ['SELL', 'STC']:  # Sell or Sell to Close
                    if pos['quantity'] == 0:
                        logger.warning(f"Sell detected for {ticker} with no open position")
                        continue

                    # Calculate realized P&L
                    cost = quantity * pos['cost_basis']
                    proceeds = quantity * price
                    realized_pnl = proceeds - cost
                    return_pct = (realized_pnl / cost) * 100 if cost > 0 else 0

                    # Hold period
                    hold_days = (date - pos['open_date']).days if pos['open_date'] else 0

                    # Determine if full close or partial
                    close_type = 'CLOSE' if quantity >= pos['quantity'] else 'TRIM'

                    # Log trade
                    trade = {
                        'trade_id': trade_id,
                        'ticker': ticker,
                        'action': close_type,
                        'entry_date': pos['open_date'].strftime('%Y-%m-%d') if pos['open_date'] else None,
                        'entry_price': pos['cost_basis'],
                        'quantity': quantity,
                        'cost_basis': pos['cost_basis'],
                        'total_cost': cost,
                        'exit_date': date.strftime('%Y-%m-%d'),
                        'exit_price': price,
                        'realized_pnl': realized_pnl,
                        'return_pct': return_pct,
                        'status': 'CLOSED',
                        'hold_days': hold_days,
                        'notes': '',
                        'tags': [],
                        'strategy': 'Unknown'
                    }

                    self.trades.append(trade)
                    new_trades += 1

                    # Update position
                    pos['quantity'] -= quantity
                    if pos['quantity'] <= 0:
                        pos['quantity'] = 0
                        pos['cost_basis'] = 0
                        pos['open_date'] = None

            # Save updated trades
            self._save_trades()

            logger.info(f"Detected {new_trades} new trades from history")
            return new_trades

        except Exception as e:
            logger.error(f"Error detecting trades from history: {e}", exc_info=True)
            return 0

    def add_manual_trade(self,
                        ticker: str,
                        action: str,
                        entry_date: str,
                        entry_price: float,
                        quantity: float,
                        exit_date: Optional[str] = None,
                        exit_price: Optional[float] = None,
                        notes: str = "",
                        tags: List[str] = None,
                        strategy: str = "Manual") -> bool:
        """
        Manually add a trade to the journal

        Args:
            ticker: Ticker symbol
            action: 'OPEN', 'CLOSE', 'ADD', 'TRIM'
            entry_date: Entry date (YYYY-MM-DD)
            entry_price: Entry price
            quantity: Number of shares
            exit_date: Optional exit date
            exit_price: Optional exit price
            notes: Optional trade notes
            tags: Optional trade tags
            strategy: Trade strategy

        Returns:
            True if trade added successfully
        """
        try:
            if tags is None:
                tags = []

            # Generate trade ID
            trade_id = f"{ticker}_{entry_date.replace('-', '')}_{action}_{quantity}"

            # Check for duplicates
            existing_ids = {t['trade_id'] for t in self.trades if 'trade_id' in t}
            if trade_id in existing_ids:
                logger.warning(f"Trade {trade_id} already exists")
                return False

            # Calculate P&L if closed
            realized_pnl = None
            return_pct = None
            status = 'OPEN'
            hold_days = None

            if exit_date and exit_price:
                cost = quantity * entry_price
                proceeds = quantity * exit_price
                realized_pnl = proceeds - cost
                return_pct = (realized_pnl / cost) * 100 if cost > 0 else 0
                status = 'CLOSED'

                entry_dt = pd.to_datetime(entry_date)
                exit_dt = pd.to_datetime(exit_date)
                hold_days = (exit_dt - entry_dt).days

            trade = {
                'trade_id': trade_id,
                'ticker': ticker,
                'action': action.upper(),
                'entry_date': entry_date,
                'entry_price': entry_price,
                'quantity': quantity,
                'cost_basis': entry_price,
                'total_cost': quantity * entry_price,
                'exit_date': exit_date,
                'exit_price': exit_price,
                'realized_pnl': realized_pnl,
                'return_pct': return_pct,
                'status': status,
                'hold_days': hold_days,
                'notes': notes,
                'tags': tags,
                'strategy': strategy
            }

            self.trades.append(trade)
            self._save_trades()

            logger.info(f"Manually added trade: {trade_id}")
            return True

        except Exception as e:
            logger.error(f"Error adding manual trade: {e}", exc_info=True)
            return False

    def update_trade_notes(self, trade_id: str, notes: str) -> bool:
        """Update notes for a specific trade"""
        try:
            for trade in self.trades:
                if trade.get('trade_id') == trade_id:
                    trade['notes'] = notes
                    self._save_trades()
                    logger.info(f"Updated notes for trade {trade_id}")
                    return True

            logger.warning(f"Trade {trade_id} not found")
            return False

        except Exception as e:
            logger.error(f"Error updating trade notes: {e}")
            return False

    def add_trade_tag(self, trade_id: str, tag: str) -> bool:
        """Add a tag to a specific trade"""
        try:
            for trade in self.trades:
                if trade.get('trade_id') == trade_id:
                    if 'tags' not in trade:
                        trade['tags'] = []

                    if tag not in trade['tags']:
                        trade['tags'].append(tag)
                        self._save_trades()
                        logger.info(f"Added tag '{tag}' to trade {trade_id}")
                        return True

            return False

        except Exception as e:
            logger.error(f"Error adding trade tag: {e}")
            return False

    def get_trade_statistics(self) -> Dict:
        """
        Calculate comprehensive trade statistics

        Returns:
            Dict with trade performance metrics
        """
        if not self.trades:
            return {
                'total_trades': 0,
                'open_trades': 0,
                'closed_trades': 0,
                'winners': 0,
                'losers': 0,
                'win_rate': 0,
                'total_pnl': 0,
                'avg_win': 0,
                'avg_loss': 0,
                'avg_return': 0,
                'best_trade': None,
                'worst_trade': None,
                'avg_hold_days': 0
            }

        try:
            df = pd.DataFrame(self.trades)

            total_trades = len(df)
            open_trades = len(df[df['status'] == 'OPEN'])
            closed_trades = len(df[df['status'] == 'CLOSED'])

            # Closed trades analysis
            closed_df = df[df['status'] == 'CLOSED'].copy()

            if len(closed_df) == 0:
                return {
                    'total_trades': total_trades,
                    'open_trades': open_trades,
                    'closed_trades': 0,
                    'winners': 0,
                    'losers': 0,
                    'win_rate': 0,
                    'total_pnl': 0,
                    'avg_win': 0,
                    'avg_loss': 0,
                    'avg_return': 0,
                    'best_trade': None,
                    'worst_trade': None,
                    'avg_hold_days': 0
                }

            winners = closed_df[closed_df['realized_pnl'] > 0]
            losers = closed_df[closed_df['realized_pnl'] < 0]

            num_winners = len(winners)
            num_losers = len(losers)
            win_rate = (num_winners / closed_trades) * 100 if closed_trades > 0 else 0

            total_pnl = closed_df['realized_pnl'].sum()
            avg_win = winners['realized_pnl'].mean() if len(winners) > 0 else 0
            avg_loss = losers['realized_pnl'].mean() if len(losers) > 0 else 0
            avg_return = closed_df['return_pct'].mean()

            best_trade = closed_df.loc[closed_df['realized_pnl'].idxmax()].to_dict() if len(closed_df) > 0 else None
            worst_trade = closed_df.loc[closed_df['realized_pnl'].idxmin()].to_dict() if len(closed_df) > 0 else None

            avg_hold_days = closed_df['hold_days'].mean() if 'hold_days' in closed_df else 0

            stats = {
                'total_trades': total_trades,
                'open_trades': open_trades,
                'closed_trades': closed_trades,
                'winners': num_winners,
                'losers': num_losers,
                'win_rate': win_rate,
                'total_pnl': total_pnl,
                'avg_win': avg_win,
                'avg_loss': avg_loss,
                'avg_return': avg_return,
                'best_trade': best_trade,
                'worst_trade': worst_trade,
                'avg_hold_days': avg_hold_days,
                'profit_factor': abs(winners['realized_pnl'].sum() / losers['realized_pnl'].sum()) if len(losers) > 0 and losers['realized_pnl'].sum() != 0 else 0
            }

            logger.info(f"Trade statistics: {closed_trades} closed, {win_rate:.1f}% win rate, ${total_pnl:,.2f} total P&L")

            return stats

        except Exception as e:
            logger.error(f"Error calculating trade statistics: {e}", exc_info=True)
            return {}

    def get_trades_by_ticker(self, ticker: str) -> List[Dict]:
        """Get all trades for a specific ticker"""
        return [t for t in self.trades if t.get('ticker') == ticker]

    def get_trades_by_tag(self, tag: str) -> List[Dict]:
        """Get all trades with a specific tag"""
        return [t for t in self.trades if tag in t.get('tags', [])]

    def get_trades_by_strategy(self, strategy: str) -> List[Dict]:
        """Get all trades for a specific strategy"""
        return [t for t in self.trades if t.get('strategy') == strategy]

    def get_open_trades(self) -> List[Dict]:
        """Get all currently open trades"""
        return [t for t in self.trades if t.get('status') == 'OPEN']

    def get_closed_trades(self) -> List[Dict]:
        """Get all closed trades"""
        return [t for t in self.trades if t.get('status') == 'CLOSED']

    def export_to_dataframe(self) -> pd.DataFrame:
        """Export all trades to DataFrame"""
        if not self.trades:
            return pd.DataFrame()

        return pd.DataFrame(self.trades)

    def clear_all_trades(self) -> bool:
        """Clear all trades (USE WITH CAUTION)"""
        try:
            self.trades = []
            self._save_trades()
            logger.warning("All trades cleared from journal")
            return True
        except Exception as e:
            logger.error(f"Error clearing trades: {e}")
            return False
