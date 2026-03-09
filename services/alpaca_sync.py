"""Alpaca -> Supabase ingestion pipeline.

Run manually:
    python -m services.alpaca_sync
"""

from __future__ import annotations

import argparse
import logging
import os
import re
from datetime import datetime, timezone
from services.secrets_helper import get_secret
from typing import Any, Dict, List

from alpaca.trading.client import TradingClient
from alpaca.trading.enums import QueryOrderStatus
from alpaca.trading.requests import GetOrdersRequest

from services.data_normalizer import (
    normalize_assets_from_positions,
    normalize_position,
    normalize_transaction,
)
from services.supabase_client import create_supabase_sync_client

logger = logging.getLogger(__name__)

SYNC_LOG_PATH = "/tmp/atlas_sync_log.txt"


def _log_to_file(msg: str) -> None:
    """Append a timestamped line to the sync log file."""
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        with open(SYNC_LOG_PATH, "a") as _f:
            _f.write(f"[{ts}] {msg}\n")
    except Exception:
        pass


def _is_options_ticker(symbol: str) -> bool:
    """Return True if symbol looks like an options contract (not a stock)."""
    if not symbol or not isinstance(symbol, str):
        return True
    return bool(re.match(r'^[A-Z]{1,6}\d{6}[PC]\d{8}$', symbol))


def _configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def connect_to_alpaca() -> TradingClient:
    """Initialize and return Alpaca trading client from env credentials."""
    api_key = get_secret("ALPACA_API_KEY", "")
    api_secret = get_secret("ALPACA_API_SECRET", "")
    paper = get_secret("ALPACA_PAPER", "true").lower() == "true"

    if not api_key or not api_secret:
        raise RuntimeError("ALPACA_API_KEY and ALPACA_API_SECRET are required.")

    logger.info("alpaca_connect_start", extra={"paper": paper})
    return TradingClient(api_key=api_key, secret_key=api_secret, paper=paper)


def fetch_data(client: TradingClient, order_limit: int = 500) -> Dict[str, Any]:
    """Fetch account, positions, full order history, and asset names from Alpaca."""
    print("[AlpacaSync] Fetching account...", flush=True)
    account = client.get_account()
    print("[AlpacaSync] Fetching positions...", flush=True)
    positions = client.get_all_positions()
    print(f"[AlpacaSync] Got {len(positions)} positions from Alpaca", flush=True)

    # Paginate through ALL historical orders (Alpaca returns newest-first)
    print("[AlpacaSync] Fetching orders (paginated, status=ALL)...", flush=True)
    request = GetOrdersRequest(
        status=QueryOrderStatus.ALL,
        limit=500,
        nested=False,
        after=None,
        until=None,
    )
    all_orders: List[Any] = []
    page_num = 0
    while True:
        page = client.get_orders(filter=request)
        page_num += 1
        if not page:
            print(f"[AlpacaSync]   Page {page_num}: empty — stopping pagination", flush=True)
            break
        all_orders.extend(page)
        print(f"[AlpacaSync]   Page {page_num}: {len(page)} orders (running total: {len(all_orders)})", flush=True)
        if len(page) < 500:
            break
        # Advance pagination window: fetch orders older than the last one seen
        request.until = page[-1].submitted_at

    print(f"[AlpacaSync] Got {len(all_orders)} total orders from Alpaca", flush=True)

    # Fetch real asset names for current positions
    print(f"[AlpacaSync] Fetching asset names for {len(positions)} positions...", flush=True)
    asset_names: Dict[str, str] = {}
    for pos in positions:
        try:
            asset_obj = client.get_asset(pos.symbol)
            name = getattr(asset_obj, "name", None)
            if name:
                asset_names[str(pos.symbol).upper()] = name
        except Exception:
            pass
    print(f"[AlpacaSync] Got names for {len(asset_names)}/{len(positions)} positions", flush=True)

    logger.info(
        "alpaca_fetch_complete",
        extra={
            "positions": len(positions),
            "orders": len(all_orders),
            "account_id": str(account.id),
        },
    )

    return {
        "account": account,
        "positions": positions,
        "orders": all_orders,
        "asset_names": asset_names,
    }


def normalize_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize raw Alpaca payloads into Supabase-ready rows."""
    account = raw_data["account"]
    positions = raw_data["positions"]
    orders = raw_data["orders"]
    asset_names: Dict[str, str] = raw_data.get("asset_names", {})

    print(f"[AlpacaSync] Normalizing: {len(positions)} positions, {len(orders)} orders", flush=True)
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
    print(f"[AlpacaSync]   Assets from positions: {len(normalized_assets)}", flush=True)

    # Enrich current-position assets with real names from the asset catalog
    for asset in normalized_assets:
        real_name = asset_names.get(asset["symbol"])
        if real_name:
            asset["name"] = real_name

    # Include asset symbols appearing only in orders (skip options contracts)
    orders_skipped_no_sym = 0
    orders_skipped_options = 0
    orders_added_as_asset = 0
    for order in orders:
        order_symbol = getattr(order, "symbol", "")
        if not order_symbol:
            orders_skipped_no_sym += 1
            continue
        symbol = str(order_symbol).upper()
        if _is_options_ticker(symbol):
            orders_skipped_options += 1
            continue
        if not any(asset["symbol"] == symbol for asset in normalized_assets):
            normalized_assets.append(
                {
                    "symbol": symbol,
                    "name": asset_names.get(symbol, symbol),
                    "asset_class": "equity",
                    "exchange": None,
                    "currency": "USD",
                    "metadata": {"source": "alpaca_order"},
                }
            )
            orders_added_as_asset += 1

    print(f"[AlpacaSync]   Orders: skipped {orders_skipped_no_sym} (no symbol), "
          f"{orders_skipped_options} (options); added {orders_added_as_asset} new assets", flush=True)
    print(f"[AlpacaSync]   Total assets after order enrichment: {len(normalized_assets)}", flush=True)

    normalized_positions = [
        normalize_position(row, portfolio_id="__RESOLVE_AT_WRITE__", as_of_timestamp=sync_timestamp)
        for row in positions
    ]
    print(f"[AlpacaSync]   Normalized positions: {len(normalized_positions)}", flush=True)

    def _order_has_symbol(order: Any) -> bool:
        sym = getattr(order, "symbol", None)
        if sym is None and isinstance(order, dict):
            sym = order.get("symbol")
        return bool(sym)

    normalized_transactions = [
        normalize_transaction(row, portfolio_id="__RESOLVE_AT_WRITE__")
        for row in orders
        if _order_has_symbol(row)
    ]
    print(f"[AlpacaSync]   Normalized transactions: {len(normalized_transactions)}", flush=True)

    print(f"[AlpacaSync] After normalization: {len(normalized_assets)} assets, "
          f"{len(normalized_positions)} positions, {len(normalized_transactions)} transactions", flush=True)

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
    n_assets = len(normalized_data.get('assets', []))
    n_positions = len(normalized_data.get('positions', []))
    n_transactions = len(normalized_data.get('transactions', []))
    print(f"[AlpacaSync] Writing to Supabase: "
          f"{n_assets} assets, "
          f"{n_positions} positions, "
          f"{n_transactions} transactions", flush=True)
    _log_to_file(f"write_to_supabase START: {n_assets} assets, {n_positions} positions, {n_transactions} transactions")

    supabase = create_supabase_sync_client()

    print("[AlpacaSync]   Upserting portfolio...", flush=True)
    portfolio = supabase.upsert_portfolio(normalized_data["portfolio"])
    portfolio_id = portfolio["id"]
    print(f"[AlpacaSync]   Portfolio id: {portfolio_id}", flush=True)
    _log_to_file(f"portfolio upserted: id={portfolio_id}")

    for row in normalized_data["positions"]:
        row["portfolio_id"] = portfolio_id

    for row in normalized_data["transactions"]:
        row["portfolio_id"] = portfolio_id

    print(f"[AlpacaSync]   Upserting {len(normalized_data['assets'])} assets...", flush=True)
    assets = supabase.upsert_assets(normalized_data["assets"])
    print(f"[AlpacaSync]   Supabase returned {len(assets)} assets after upsert", flush=True)
    asset_id_by_symbol = {asset["symbol"]: asset["id"] for asset in assets}
    print(f"[AlpacaSync]   asset_id_by_symbol has {len(asset_id_by_symbol)} entries", flush=True)
    _log_to_file(f"assets: sent={len(normalized_data['assets'])}, returned={len(assets)}, id_map_size={len(asset_id_by_symbol)}")

    print(f"[AlpacaSync]   Upserting {len(normalized_data['positions'])} positions...", flush=True)
    positions = supabase.upsert_positions(normalized_data["positions"], asset_id_by_symbol)
    print(f"[AlpacaSync]   Supabase returned {len(positions)} positions after upsert", flush=True)
    _log_to_file(f"positions: sent={len(normalized_data['positions'])}, returned={len(positions)}")

    print(f"[AlpacaSync]   Upserting {len(normalized_data['transactions'])} transactions...", flush=True)
    transactions = supabase.upsert_transactions(normalized_data["transactions"], asset_id_by_symbol)
    print(f"[AlpacaSync]   Supabase returned {len(transactions)} transactions after upsert", flush=True)
    _log_to_file(f"transactions: sent={len(normalized_data['transactions'])}, returned={len(transactions)}")

    stats = {
        "assets_upserted": len(assets),
        "positions_upserted": len(positions),
        "transactions_upserted": len(transactions),
    }
    print(f"[AlpacaSync] Sync complete: {stats}", flush=True)
    _log_to_file(f"SYNC COMPLETE: {stats}")
    logger.info("supabase_write_complete", extra=stats)
    return stats


def run_sync(order_limit: int = 200) -> Dict[str, int]:
    """Execute full sync flow: connect, fetch, normalize, write."""
    print("[AlpacaSync] ===== run_sync() started =====", flush=True)
    # Truncate log for a fresh run so the UI shows the latest sync only
    try:
        with open(SYNC_LOG_PATH, "w") as _f:
            _f.write(f"[{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}] run_sync() started\n")
    except Exception:
        pass
    client = connect_to_alpaca()
    print("[AlpacaSync] Connected to Alpaca", flush=True)
    raw_data = fetch_data(client, order_limit=order_limit)
    _log_to_file(f"fetch_data complete: {len(raw_data.get('positions', []))} positions, {len(raw_data.get('orders', []))} orders")
    normalized = normalize_data(raw_data)
    _log_to_file(f"normalize_data complete: {len(normalized.get('assets', []))} assets, {len(normalized.get('positions', []))} positions, {len(normalized.get('transactions', []))} transactions")
    result = write_to_supabase(normalized)
    print("[AlpacaSync] ===== run_sync() complete =====", flush=True)
    return result


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
