"""Alpaca -> Supabase ingestion pipeline.

Run manually:
    python -m services.alpaca_sync
"""

from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from alpaca.trading.client import TradingClient
from alpaca.trading.requests import GetOrdersRequest

from services.data_normalizer import (
    normalize_assets_from_positions,
    normalize_position,
    normalize_transaction,
)
from services.supabase_client import create_supabase_sync_client

logger = logging.getLogger(__name__)


def _configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def connect_to_alpaca() -> TradingClient:
    """Initialize and return Alpaca trading client from env credentials."""
    api_key = os.getenv("ALPACA_API_KEY", "")
    api_secret = os.getenv("ALPACA_API_SECRET", "")
    paper = os.getenv("ALPACA_PAPER", "true").lower() == "true"

    if not api_key or not api_secret:
        raise RuntimeError("ALPACA_API_KEY and ALPACA_API_SECRET are required.")

    logger.info("alpaca_connect_start", extra={"paper": paper})
    return TradingClient(api_key=api_key, secret_key=api_secret, paper=paper)


def fetch_data(client: TradingClient, order_limit: int = 200) -> Dict[str, Any]:
    """Fetch account, current positions, and latest orders from Alpaca."""
    account = client.get_account()
    positions = client.get_all_positions()
    orders = client.get_orders(filter=GetOrdersRequest(limit=order_limit, nested=False))

    logger.info(
        "alpaca_fetch_complete",
        extra={
            "positions": len(positions),
            "orders": len(orders),
            "account_id": str(account.id),
        },
    )

    return {
        "account": account,
        "positions": positions,
        "orders": orders,
    }


def normalize_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize raw Alpaca payloads into Supabase-ready rows."""
    account = raw_data["account"]
    positions = raw_data["positions"]
    orders = raw_data["orders"]

    sync_timestamp = datetime.now(timezone.utc)

    portfolio_row = {
        "external_id": str(account.id),
        "name": "Alpaca Primary Account",
        "broker": "alpaca",
        "base_currency": "USD",
        "metadata": {
            "account_number": getattr(account, "account_number", None),
            "status": getattr(account, "status", None),
            "buying_power": str(getattr(account, "buying_power", "")),
            "cash": str(getattr(account, "cash", "")),
            "equity": str(getattr(account, "equity", "")),
            "sync_timestamp": sync_timestamp.isoformat(),
        },
    }

    normalized_assets = normalize_assets_from_positions(positions)

    # Include asset symbols appearing only in recent orders.
    for order in orders:
        order_symbol = getattr(order, "symbol", "")
        if order_symbol:
            symbol = str(order_symbol).upper()
            if not any(asset["symbol"] == symbol for asset in normalized_assets):
                normalized_assets.append(
                    {
                        "symbol": symbol,
                        "name": symbol,
                        "asset_class": "equity",
                        "exchange": None,
                        "currency": "USD",
                        "metadata": {"source": "alpaca_order"},
                    }
                )

    normalized_positions = [
        normalize_position(row, portfolio_id="__RESOLVE_AT_WRITE__", as_of_timestamp=sync_timestamp)
        for row in positions
    ]

    normalized_transactions = [
        normalize_transaction(row, portfolio_id="__RESOLVE_AT_WRITE__")
        for row in orders
    ]

    logger.info(
        "normalize_complete",
        extra={
            "assets": len(normalized_assets),
            "positions": len(normalized_positions),
            "transactions": len(normalized_transactions),
        },
    )

    return {
        "portfolio": portfolio_row,
        "assets": normalized_assets,
        "positions": normalized_positions,
        "transactions": normalized_transactions,
    }


def write_to_supabase(normalized_data: Dict[str, Any]) -> Dict[str, int]:
    """Write normalized rows to Supabase using idempotent upserts."""
    from services.market_data import trigger_sync_now

    supabase = create_supabase_sync_client()

    portfolio = supabase.upsert_portfolio(normalized_data["portfolio"])
    portfolio_id = portfolio["id"]

    for row in normalized_data["positions"]:
        row["portfolio_id"] = portfolio_id

    for row in normalized_data["transactions"]:
        row["portfolio_id"] = portfolio_id

    assets = supabase.upsert_assets(normalized_data["assets"])
    asset_id_by_symbol = {asset["symbol"]: asset["id"] for asset in assets}

    positions = supabase.upsert_positions(normalized_data["positions"], asset_id_by_symbol)
    transactions = supabase.upsert_transactions(normalized_data["transactions"], asset_id_by_symbol)

    # Trigger market data sync for all tickers in this batch.
    # Gap detection in ingestion_service will no-op for tickers already up to date.
    for ticker in asset_id_by_symbol:
        try:
            trigger_sync_now(ticker=ticker)
        except Exception as e:
            logger.warning(f"Market data sync failed for {ticker}: {e}")
            # Non-fatal — nightly scheduler will catch it

    stats = {
        "assets_upserted": len(assets),
        "positions_upserted": len(positions),
        "transactions_upserted": len(transactions),
    }
    logger.info("supabase_write_complete", extra=stats)
    return stats


def run_sync(order_limit: int = 200) -> Dict[str, int]:
    """Execute full sync flow: connect, fetch, normalize, write."""
    client = connect_to_alpaca()
    raw_data = fetch_data(client, order_limit=order_limit)
    normalized = normalize_data(raw_data)
    return write_to_supabase(normalized)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync Alpaca portfolio data into Supabase.")
    parser.add_argument("--order-limit", type=int, default=200, help="Maximum number of orders to ingest.")
    parser.add_argument("--log-level", default="INFO", help="Logging level (INFO, DEBUG, etc.)")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    _configure_logging(args.log_level)

    logger.info("alpaca_supabase_sync_start", extra={"order_limit": args.order_limit})
    stats = run_sync(order_limit=args.order_limit)
    logger.info("alpaca_supabase_sync_complete", extra=stats)


if __name__ == "__main__":
    main()
