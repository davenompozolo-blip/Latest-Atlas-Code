"""
ATLAS Database Interface
Clean SQL data access layer using SQLAlchemy
"""

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, scoped_session
from typing import Optional, Dict, List, Any
from datetime import datetime
import os


class AtlasDB:
    """
    ATLAS Database Interface

    Handles all SQL operations with clean separation from business logic.
    Supports SQLite (local) and PostgreSQL (production).

    Usage:
        db = AtlasDB()  # Uses SQLite by default
        db = AtlasDB("postgresql://user:pass@localhost/atlas")  # PostgreSQL
    """

    def __init__(self, db_url: Optional[str] = None):
        """
        Initialize database connection

        Args:
            db_url: Database URL. If None, uses SQLite at data/atlas.db
        """
        if db_url is None:
            # Default to SQLite in data directory
            db_path = os.path.join(os.path.dirname(__file__), 'atlas.db')
            db_url = f'sqlite:///{db_path}'

        self.engine = create_engine(db_url, echo=False)
        self.Session = scoped_session(sessionmaker(bind=self.engine))

        print(f"✅ Connected to database: {db_url}")

    def read(self, query: str, params: Optional[Dict] = None) -> pd.DataFrame:
        """
        Execute SELECT query and return DataFrame

        Args:
            query: SQL query string
            params: Optional query parameters

        Returns:
            DataFrame with query results
        """
        return pd.read_sql(text(query), self.engine, params=params or {})

    def execute(self, query: str, params: Optional[Dict] = None) -> Any:
        """
        Execute INSERT/UPDATE/DELETE query

        Args:
            query: SQL query string
            params: Optional query parameters

        Returns:
            Result of execution
        """
        with self.engine.begin() as conn:
            result = conn.execute(text(query), params or {})
            return result

    def bulk_insert(self, table_name: str, df: pd.DataFrame, if_exists: str = 'append'):
        """
        Bulk insert DataFrame into table

        Args:
            table_name: Target table name
            df: DataFrame to insert
            if_exists: 'append', 'replace', or 'fail'
        """
        df.to_sql(table_name, self.engine, if_exists=if_exists, index=False)
        print(f"✅ Inserted {len(df)} rows into {table_name}")

    # ============================================================
    # PORTFOLIO OPERATIONS
    # ============================================================

    def get_portfolio(self, portfolio_id: Optional[int] = None) -> pd.DataFrame:
        """Get current portfolio holdings"""
        query = """
            SELECT * FROM holdings
            WHERE portfolio_id = :portfolio_id OR :portfolio_id IS NULL
            ORDER BY ticker
        """
        return self.read(query, {'portfolio_id': portfolio_id})

    def save_portfolio(self, portfolio_df: pd.DataFrame, portfolio_id: int = 1):
        """Save portfolio holdings"""
        portfolio_df['portfolio_id'] = portfolio_id
        portfolio_df['updated_at'] = datetime.now()
        self.bulk_insert('holdings', portfolio_df, if_exists='replace')

    def get_trades(self, ticker: Optional[str] = None,
                   start_date: Optional[str] = None,
                   end_date: Optional[str] = None) -> pd.DataFrame:
        """Get trade history with optional filters"""
        query = """
            SELECT * FROM trades
            WHERE (:ticker IS NULL OR ticker = :ticker)
              AND (:start_date IS NULL OR date >= :start_date)
              AND (:end_date IS NULL OR date <= :end_date)
            ORDER BY date DESC
        """
        return self.read(query, {
            'ticker': ticker,
            'start_date': start_date,
            'end_date': end_date
        })

    def save_trade(self, ticker: str, action: str, quantity: float,
                   price: float, date: Optional[str] = None):
        """Record a new trade"""
        if date is None:
            date = datetime.now().strftime('%Y-%m-%d')

        query = """
            INSERT INTO trades (date, ticker, action, quantity, price, created_at)
            VALUES (:date, :ticker, :action, :quantity, :price, :created_at)
        """
        self.execute(query, {
            'date': date,
            'ticker': ticker,
            'action': action.upper(),
            'quantity': quantity,
            'price': price,
            'created_at': datetime.now()
        })
        print(f"✅ Saved trade: {action} {quantity} {ticker} @ ${price}")

    # ============================================================
    # PRICE DATA OPERATIONS
    # ============================================================

    def get_prices(self, tickers: List[str],
                   start_date: Optional[str] = None,
                   end_date: Optional[str] = None) -> pd.DataFrame:
        """Get historical prices"""
        query = """
            SELECT date, ticker, close_price
            FROM prices
            WHERE ticker IN :tickers
              AND (:start_date IS NULL OR date >= :start_date)
              AND (:end_date IS NULL OR date <= :end_date)
            ORDER BY date, ticker
        """
        # SQLAlchemy requires tuple for IN clause
        params = {
            'tickers': tuple(tickers),
            'start_date': start_date,
            'end_date': end_date
        }
        return self.read(query, params)

    def save_prices(self, prices_df: pd.DataFrame):
        """Save price data"""
        prices_df['updated_at'] = datetime.now()
        self.bulk_insert('prices', prices_df, if_exists='append')

    # ============================================================
    # ANALYTICS CACHE
    # ============================================================

    def get_cached_result(self, analysis_type: str,
                          parameters: Dict) -> Optional[Dict]:
        """Get cached analysis result"""
        import json

        query = """
            SELECT result, created_at
            FROM analytics_cache
            WHERE analysis_type = :analysis_type
              AND parameters = :parameters
              AND created_at > datetime('now', '-1 hour')
            ORDER BY created_at DESC
            LIMIT 1
        """
        result = self.read(query, {
            'analysis_type': analysis_type,
            'parameters': json.dumps(parameters, sort_keys=True)
        })

        if len(result) > 0:
            return json.loads(result.iloc[0]['result'])
        return None

    def cache_result(self, analysis_type: str,
                     parameters: Dict, result: Dict):
        """Cache analysis result"""
        import json

        query = """
            INSERT INTO analytics_cache
            (analysis_type, parameters, result, created_at)
            VALUES (:analysis_type, :parameters, :result, :created_at)
        """
        self.execute(query, {
            'analysis_type': analysis_type,
            'parameters': json.dumps(parameters, sort_keys=True),
            'result': json.dumps(result),
            'created_at': datetime.now()
        })

    # ============================================================
    # DATABASE MANAGEMENT
    # ============================================================

    def create_tables(self):
        """Create all required tables"""
        schema = """
        -- Holdings table
        CREATE TABLE IF NOT EXISTS holdings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            portfolio_id INTEGER DEFAULT 1,
            ticker TEXT NOT NULL,
            quantity REAL NOT NULL,
            avg_cost REAL NOT NULL,
            current_price REAL,
            updated_at TIMESTAMP,
            UNIQUE(portfolio_id, ticker)
        );

        -- Trades table
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATE NOT NULL,
            ticker TEXT NOT NULL,
            action TEXT NOT NULL CHECK(action IN ('BUY', 'SELL')),
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            created_at TIMESTAMP
        );

        -- Prices table
        CREATE TABLE IF NOT EXISTS prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATE NOT NULL,
            ticker TEXT NOT NULL,
            open_price REAL,
            high_price REAL,
            low_price REAL,
            close_price REAL NOT NULL,
            volume REAL,
            updated_at TIMESTAMP,
            UNIQUE(date, ticker)
        );

        -- Analytics cache table
        CREATE TABLE IF NOT EXISTS analytics_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            analysis_type TEXT NOT NULL,
            parameters TEXT NOT NULL,
            result TEXT NOT NULL,
            created_at TIMESTAMP
        );

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_holdings_portfolio
            ON holdings(portfolio_id);
        CREATE INDEX IF NOT EXISTS idx_trades_ticker_date
            ON trades(ticker, date);
        CREATE INDEX IF NOT EXISTS idx_prices_ticker_date
            ON prices(ticker, date);
        CREATE INDEX IF NOT EXISTS idx_cache_type
            ON analytics_cache(analysis_type, created_at);
        """

        with self.engine.begin() as conn:
            for statement in schema.split(';'):
                if statement.strip():
                    conn.execute(text(statement))

        print("✅ Database schema created")

    def close(self):
        """Close database connection"""
        self.Session.remove()
        self.engine.dispose()


# Singleton instance
_db_instance = None

def get_db() -> AtlasDB:
    """Get singleton database instance"""
    global _db_instance
    if _db_instance is None:
        _db_instance = AtlasDB()
        _db_instance.create_tables()
    return _db_instance


__all__ = ['AtlasDB', 'get_db']
