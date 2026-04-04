#!/usr/bin/env python3
"""ATLAS Phoenix Parser — GitHub Actions sync entry point.

Self-contained Alpaca -> Supabase sync pipeline.  No Streamlit dependency,
no imports from services/ or other repo modules.

Required environment variables:
    ALPACA_API_KEY
    ALPACA_SECRET_KEY
    SUPABASE_URL
    SUPABASE_SERVICE_KEY

Exit codes: 0 = success, 1 = failure.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional

# ---------------------------------------------------------------------------
# alpaca-py imports (the only third-party dependency)
# ---------------------------------------------------------------------------
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame
from alpaca.trading.client import TradingClient
from alpaca.trading.enums import QueryOrderStatus
from alpaca.trading.requests import GetOrdersRequest

# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------
ALPACA_API_KEY: str = os.environ.get("ALPACA_API_KEY", "")
ALPACA_SECRET_KEY: str = os.environ.get("ALPACA_SECRET_KEY", "")
SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY: str = os.environ.get("SUPABASE_SERVICE_KEY", "")

PRICE_HISTORY_DAYS = 30  # minimum lookback for price ingestion


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _ts() -> str:
    """UTC timestamp for log lines."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    """Print a timestamped status line for GitHub Actions logs."""
    print(f"[{_ts()}] {msg}", flush=True)


def _is_options_ticker(symbol: str) -> bool:
    """Return True if *symbol* looks like an OCC options contract."""
    if not symbol or not isinstance(symbol, str):
        return True
    return bool(re.match(r"^[A-Z]{1,6}\d{6}[PC]\d{8}$", symbol))


# ═══════════════════════════════════════════════════════════════════════════
# Normalisation helpers  (inline — mirrors services/data_normalizer.py)
# ═══════════════════════════════════════════════════════════════════════════

def _to_mapping(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    raise TypeError(f"Unsupported payload type: {type(value)!r}")


def _to_float(value: Any, default: Optional[float] = 0.0) -> Optional[float]:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        return float(stripped) if stripped else default
    return float(value)


def _to_iso8601(value: Any) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    if isinstance(value, str):
        text = value.strip()
        if not text:
            raise ValueError("Timestamp cannot be empty.")
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    raise ValueError(f"Unsupported timestamp value: {value!r}")


def _to_iso_date(value: Any) -> str:
    return _to_iso8601(value)[:10]


def normalize_asset(raw: Any) -> Dict[str, Any]:
    src = _to_mapping(raw)
    symbol = str(src.get("symbol", "")).upper().strip()
    if not symbol:
        raise ValueError("Asset symbol is required.")
    return {
        "symbol": symbol,
        "name": src.get("name") or src.get("asset_name") or symbol,
        "asset_class": src.get("asset_class") or src.get("class"),
        "exchange": src.get("exchange"),
        "currency": (src.get("currency") or "USD").upper(),
        "metadata": {
            "alpaca_asset_id": src.get("asset_id") or src.get("id"),
            "status": src.get("status"),
            "tradable": src.get("tradable"),
        },
    }


def normalize_assets_from_positions(positions: Iterable[Any]) -> List[Dict[str, Any]]:
    seen: Dict[str, Dict[str, Any]] = {}
    for raw in positions:
        asset = normalize_asset(raw)
        seen[asset["symbol"]] = asset
    return list(seen.values())


def normalize_position(raw: Any, *, portfolio_id: str, as_of_timestamp: Any) -> Dict[str, Any]:
    src = _to_mapping(raw)
    symbol = str(src.get("symbol", "")).upper().strip()
    if not symbol:
        raise ValueError("Position symbol is required.")
    return {
        "portfolio_id": portfolio_id,
        "asset_symbol": symbol,
        "quantity": _to_float(src.get("qty")),
        "average_cost": _to_float(src.get("avg_entry_price"), default=None),
        "market_value": _to_float(src.get("market_value"), default=None),
        "as_of_date": _to_iso_date(as_of_timestamp),
        "metadata": {
            "side": src.get("side"),
            "unrealized_pl": _to_float(src.get("unrealized_pl"), default=0.0),
            "unrealized_plpc": _to_float(src.get("unrealized_plpc"), default=0.0),
        },
    }


def normalize_transaction(raw: Any, *, portfolio_id: str) -> Dict[str, Any]:
    src = _to_mapping(raw)
    raw_sym = src.get("symbol")
    symbol = str(raw_sym).upper().strip() if raw_sym is not None else ""
    if not symbol:
        raise ValueError("Transaction symbol is required.")

    submitted_at = src.get("filled_at") or src.get("submitted_at") or src.get("transaction_time")
    if not submitted_at:
        submitted_at = datetime.now(timezone.utc)

    qty = src.get("filled_qty")
    if qty in (None, "", 0, "0"):
        qty = src.get("qty")

    transaction_type = str(src.get("side") or src.get("type") or "trade").lower()
    external_id = src.get("id") or src.get("order_id")

    return {
        "portfolio_id": portfolio_id,
        "asset_symbol": symbol,
        "transaction_type": transaction_type,
        "quantity": _to_float(qty),
        "price": _to_float(src.get("filled_avg_price") or src.get("limit_price"), default=None),
        "fees": _to_float(src.get("fee") or src.get("fees"), default=0.0),
        "transaction_date": _to_iso8601(submitted_at),
        "external_id": str(external_id) if external_id else None,
        "notes": src.get("status") or src.get("order_class"),
        "metadata": {
            "alpaca_status": src.get("status"),
            "alpaca_order_type": src.get("order_type") or src.get("type"),
            "time_in_force": src.get("time_in_force"),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════
# Supabase REST client  (inline — mirrors services/supabase_client.py)
# ═══════════════════════════════════════════════════════════════════════════

class _SafeEncoder(json.JSONEncoder):
    """Encode UUID/datetime objects that Alpaca SDK returns."""

    def default(self, o: Any) -> Any:
        if isinstance(o, uuid.UUID):
            return str(o)
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        return super().default(o)


def _supabase_request(
    method: str,
    table: str,
    *,
    query: Optional[Dict[str, str]] = None,
    json_payload: Optional[Any] = None,
    prefer: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Low-level Supabase PostgREST request."""
    base = f"{SUPABASE_URL}/rest/v1/{table}"
    qs = f"?{urllib.parse.urlencode(query)}" if query else ""
    url = f"{base}{qs}"

    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
    }
    if json_payload is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer

    body = None
    if json_payload is not None:
        body = json.dumps(json_payload, cls=_SafeEncoder).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        raw = resp.read().decode("utf-8")
        if not raw:
            return []
        parsed = json.loads(raw)
        return [parsed] if isinstance(parsed, dict) else parsed


def upsert_portfolio(row: Dict[str, Any]) -> Dict[str, Any]:
    payload = {
        "external_id": row["external_id"],
        "name": row.get("name") or "Alpaca Portfolio",
        "broker": row.get("broker") or "alpaca",
        "base_currency": row.get("base_currency") or "USD",
        "metadata": row.get("metadata") or {},
    }
    rows = _supabase_request(
        "POST", "portfolios",
        query={"on_conflict": "external_id"},
        json_payload=payload,
        prefer="resolution=merge-duplicates,return=representation",
    )
    return rows[0]


def upsert_assets(assets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not assets:
        return []
    return _supabase_request(
        "POST", "assets",
        query={"on_conflict": "symbol"},
        json_payload=assets,
        prefer="resolution=merge-duplicates,return=representation",
    )


def upsert_positions(
    positions: List[Dict[str, Any]],
    asset_id_by_symbol: Dict[str, str],
) -> List[Dict[str, Any]]:
    prepared: List[Dict[str, Any]] = []
    for row in positions:
        symbol = row.get("asset_symbol")
        asset_id = asset_id_by_symbol.get(symbol)
        if not asset_id:
            log(f"[WARN] Skipping position — no asset_id for symbol={symbol}")
            continue
        prepared.append({
            "portfolio_id": row["portfolio_id"],
            "asset_id": asset_id,
            "quantity": row["quantity"],
            "average_cost": row.get("average_cost"),
            "market_value": row.get("market_value"),
            "as_of_date": row["as_of_date"],
        })
    if not prepared:
        return []
    return _supabase_request(
        "POST", "positions",
        query={"on_conflict": "portfolio_id,asset_id,as_of_date"},
        json_payload=prepared,
        prefer="resolution=merge-duplicates,return=representation",
    )


def upsert_transactions(
    transactions: List[Dict[str, Any]],
    asset_id_by_symbol: Dict[str, str],
) -> List[Dict[str, Any]]:
    prepared: List[Dict[str, Any]] = []
    skipped: List[str] = []
    for row in transactions:
        symbol = row.get("asset_symbol")
        asset_id = asset_id_by_symbol.get(symbol)
        if not asset_id:
            skipped.append(str(symbol))
            continue

        external_id = row.get("external_id")
        if not external_id:
            dedupe_key = "|".join([
                row["portfolio_id"], symbol, row["transaction_type"],
                str(row["quantity"]), row["transaction_date"],
            ])
            external_id = f"synthetic:{dedupe_key}"

        prepared.append({
            "portfolio_id": row["portfolio_id"],
            "asset_id": asset_id,
            "transaction_type": row["transaction_type"],
            "quantity": row["quantity"],
            "price": row.get("price"),
            "fees": row.get("fees", 0),
            "transaction_date": row["transaction_date"],
            "external_id": external_id,
            "notes": row.get("notes"),
            "metadata": row.get("metadata", {}),
        })

    if skipped:
        log(f"Transactions skipped (no asset_id): {skipped}")
    if not prepared:
        return []
    return _supabase_request(
        "POST", "transactions",
        query={"on_conflict": "portfolio_id,external_id"},
        json_payload=prepared,
        prefer="resolution=merge-duplicates,return=representation",
    )


def upsert_price_history(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Upsert OHLCV rows into price_history."""
    if not rows:
        return []
    return _supabase_request(
        "POST", "price_history",
        query={"on_conflict": "asset_id,source,interval,price_date"},
        json_payload=rows,
        prefer="resolution=merge-duplicates,return=representation",
    )


# ═══════════════════════════════════════════════════════════════════════════
# 1. Alpaca — fetch account, positions, orders
# ═══════════════════════════════════════════════════════════════════════════

def connect_alpaca() -> TradingClient:
    if not ALPACA_API_KEY or not ALPACA_SECRET_KEY:
        raise RuntimeError("ALPACA_API_KEY and ALPACA_SECRET_KEY are required.")
    # GitHub Actions sync always uses paper=False (live account data).
    # Change to paper=True if testing against the paper environment.
    paper = os.environ.get("ALPACA_PAPER", "false").lower() == "true"
    return TradingClient(api_key=ALPACA_API_KEY, secret_key=ALPACA_SECRET_KEY, paper=paper)


def fetch_alpaca_data(client: TradingClient) -> Dict[str, Any]:
    """Fetch account info, positions, and paginated order history."""
    log("Fetching Alpaca account...")
    account = client.get_account()
    log(f"Account id: {account.id}")

    log("Fetching positions...")
    positions = client.get_all_positions()
    log(f"Got {len(positions)} positions")

    # Paginate all historical orders
    log("Fetching orders (paginated, status=ALL)...")
    request = GetOrdersRequest(
        status=QueryOrderStatus.ALL,
        limit=500,
        nested=False,
        after=None,
        until=None,
    )
    all_orders: List[Any] = []
    page = 0
    while True:
        batch = client.get_orders(filter=request)
        page += 1
        if not batch:
            log(f"  Page {page}: empty — done")
            break
        all_orders.extend(batch)
        log(f"  Page {page}: {len(batch)} orders (total: {len(all_orders)})")
        if len(batch) < 500:
            break
        request.until = batch[-1].submitted_at

    log(f"Got {len(all_orders)} total orders")

    # Fetch real asset names for current positions
    log(f"Fetching asset names for {len(positions)} positions...")
    asset_names: Dict[str, str] = {}
    for pos in positions:
        try:
            asset_obj = client.get_asset(pos.symbol)
            name = getattr(asset_obj, "name", None)
            if name:
                asset_names[str(pos.symbol).upper()] = name
        except Exception:
            pass
    log(f"Got names for {len(asset_names)}/{len(positions)} positions")

    return {
        "account": account,
        "positions": positions,
        "orders": all_orders,
        "asset_names": asset_names,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 2. Normalise
# ═══════════════════════════════════════════════════════════════════════════

def normalise_all(raw: Dict[str, Any]) -> Dict[str, Any]:
    account = raw["account"]
    positions = raw["positions"]
    orders = raw["orders"]
    asset_names: Dict[str, str] = raw.get("asset_names", {})
    sync_ts = datetime.now(timezone.utc)

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
            "sync_timestamp": sync_ts.isoformat(),
        },
    }

    # Assets from positions
    norm_assets = normalize_assets_from_positions(positions)
    for asset in norm_assets:
        real_name = asset_names.get(asset["symbol"])
        if real_name:
            asset["name"] = real_name

    # Assets from orders (skip options)
    opts_skipped = 0
    for order in orders:
        order_symbol = getattr(order, "symbol", "")
        if not order_symbol:
            continue
        symbol = str(order_symbol).upper()
        if _is_options_ticker(symbol):
            opts_skipped += 1
            continue
        if not any(a["symbol"] == symbol for a in norm_assets):
            norm_assets.append({
                "symbol": symbol,
                "name": asset_names.get(symbol, symbol),
                "asset_class": "equity",
                "exchange": None,
                "currency": "USD",
                "metadata": {"source": "alpaca_order"},
            })
    if opts_skipped:
        log(f"Skipped {opts_skipped} options tickers from orders")

    # Positions
    norm_positions = [
        normalize_position(p, portfolio_id="__RESOLVE__", as_of_timestamp=sync_ts)
        for p in positions
    ]

    # Transactions (only orders that have a symbol)
    def _has_sym(o: Any) -> bool:
        s = getattr(o, "symbol", None)
        if s is None and isinstance(o, dict):
            s = o.get("symbol")
        return bool(s)

    norm_txns = [
        normalize_transaction(o, portfolio_id="__RESOLVE__")
        for o in orders if _has_sym(o)
    ]

    log(f"Normalised: {len(norm_assets)} assets, {len(norm_positions)} positions, {len(norm_txns)} transactions")

    return {
        "portfolio": portfolio_row,
        "assets": norm_assets,
        "positions": norm_positions,
        "transactions": norm_txns,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 3. Write to Supabase
# ═══════════════════════════════════════════════════════════════════════════

def write_to_supabase(data: Dict[str, Any]) -> Dict[str, int]:
    log("Upserting portfolio...")
    portfolio = upsert_portfolio(data["portfolio"])
    portfolio_id = portfolio["id"]
    log(f"Portfolio id: {portfolio_id}")

    # Patch portfolio_id into positions and transactions
    for row in data["positions"]:
        row["portfolio_id"] = portfolio_id
    for row in data["transactions"]:
        row["portfolio_id"] = portfolio_id

    log(f"Upserting {len(data['assets'])} assets...")
    assets = upsert_assets(data["assets"])
    asset_id_by_symbol = {a["symbol"]: a["id"] for a in assets}
    log(f"Assets upserted: {len(assets)}")

    log(f"Upserting {len(data['positions'])} positions...")
    positions = upsert_positions(data["positions"], asset_id_by_symbol)
    log(f"Positions upserted: {len(positions)}")

    log(f"Upserting {len(data['transactions'])} transactions...")
    transactions = upsert_transactions(data["transactions"], asset_id_by_symbol)
    log(f"Transactions upserted: {len(transactions)}")

    return {
        "portfolio_id": portfolio_id,
        "assets_upserted": len(assets),
        "positions_upserted": len(positions),
        "transactions_upserted": len(transactions),
        "asset_id_by_symbol": asset_id_by_symbol,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 4. Price history ingestion (last 30+ days via Alpaca market data)
# ═══════════════════════════════════════════════════════════════════════════

def ingest_price_history(
    asset_id_by_symbol: Dict[str, str],
    tickers: List[str],
) -> Dict[str, int]:
    """Fetch daily bars for each ticker and upsert into price_history."""
    if not tickers:
        log("No tickers for price history ingestion.")
        return {}

    data_client = StockHistoricalDataClient(
        api_key=ALPACA_API_KEY,
        secret_key=ALPACA_SECRET_KEY,
    )

    end_date = date.today()
    start_date = end_date - timedelta(days=PRICE_HISTORY_DAYS)
    results: Dict[str, int] = {}

    log(f"Ingesting price history for {len(tickers)} tickers "
        f"({start_date} to {end_date})...")

    for ticker in tickers:
        asset_id = asset_id_by_symbol.get(ticker)
        if not asset_id:
            log(f"  {ticker}: no asset_id — skipping price history")
            continue
        try:
            request = StockBarsRequest(
                symbol_or_symbols=ticker,
                timeframe=TimeFrame.Day,
                start=datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc),
                end=datetime.combine(end_date, datetime.min.time(), tzinfo=timezone.utc),
            )
            bars_response = data_client.get_stock_bars(request)

            # bars_response[ticker] is a list of Bar objects
            bars = bars_response.get(ticker, []) if hasattr(bars_response, "get") else []
            if not bars and hasattr(bars_response, "data"):
                bars = bars_response.data.get(ticker, [])

            if not bars:
                log(f"  {ticker}: 0 bars returned")
                results[ticker] = 0
                continue

            rows = []
            for bar in bars:
                price_date = bar.timestamp
                if isinstance(price_date, datetime):
                    price_date = price_date.strftime("%Y-%m-%d")
                elif isinstance(price_date, str):
                    price_date = price_date[:10]

                rows.append({
                    "asset_id": asset_id,
                    "source": "alpaca",
                    "interval": "1d",
                    "price_date": price_date,
                    "open": float(bar.open),
                    "high": float(bar.high),
                    "low": float(bar.low),
                    "close": float(bar.close),
                    "adjusted_close": float(bar.close),  # Alpaca bars are split-adjusted
                    "volume": int(bar.volume),
                })

            upserted = upsert_price_history(rows)
            count = len(upserted)
            results[ticker] = count
            log(f"  {ticker}: {count} bars upserted")

        except Exception as exc:
            log(f"  {ticker}: price history FAILED — {exc}")
            results[ticker] = 0

    total = sum(results.values())
    log(f"Price history ingestion complete: {total} total bars across {len(results)} tickers")
    return results


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

def main() -> int:
    log("=" * 60)
    log("ATLAS Phoenix Parser — sync starting")
    log("=" * 60)

    # --- Validate env vars ---------------------------------------------------
    missing = []
    if not ALPACA_API_KEY:
        missing.append("ALPACA_API_KEY")
    if not ALPACA_SECRET_KEY:
        missing.append("ALPACA_SECRET_KEY")
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if missing:
        log(f"FATAL: Missing environment variables: {', '.join(missing)}")
        return 1

    try:
        # Step 1 — Connect to Alpaca
        log("Step 1/4: Connecting to Alpaca...")
        client = connect_alpaca()
        log("Connected to Alpaca")

        # Step 2 — Fetch data
        log("Step 2/4: Fetching data from Alpaca...")
        raw_data = fetch_alpaca_data(client)

        # Step 3 — Normalise and write to Supabase
        log("Step 3/4: Normalising and writing to Supabase...")
        normalised = normalise_all(raw_data)
        result = write_to_supabase(normalised)

        asset_id_by_symbol: Dict[str, str] = result.pop("asset_id_by_symbol", {})

        # Step 4 — Ingest price history
        log("Step 4/4: Ingesting price history...")
        # Collect equity tickers from normalised assets (skip options)
        equity_tickers = [
            a["symbol"] for a in normalised["assets"]
            if not _is_options_ticker(a["symbol"])
        ]
        price_stats = ingest_price_history(asset_id_by_symbol, equity_tickers)

        # --- Summary ---------------------------------------------------------
        log("=" * 60)
        log("SYNC COMPLETE")
        log(f"  Assets upserted:       {result['assets_upserted']}")
        log(f"  Positions upserted:    {result['positions_upserted']}")
        log(f"  Transactions upserted: {result['transactions_upserted']}")
        log(f"  Price history tickers: {len(price_stats)}")
        log(f"  Price history bars:    {sum(price_stats.values())}")
        log("=" * 60)
        return 0

    except Exception as exc:
        log(f"FATAL: {exc}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
