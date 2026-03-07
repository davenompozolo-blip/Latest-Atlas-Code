"""Utilities for normalizing Alpaca payloads into Atlas Supabase schema rows.

Normalization guarantees:
- symbol/ticker values are uppercase strings
- quantities and price fields are numeric (float)
- timestamps are ISO 8601 strings
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Mapping


def _to_mapping(value: Any) -> Dict[str, Any]:
    """Convert SDK models or dict-like values to a plain dictionary."""
    if isinstance(value, Mapping):
        return dict(value)

    if hasattr(value, "model_dump"):
        return value.model_dump()

    if hasattr(value, "dict"):
        return value.dict()

    raise TypeError(f"Unsupported payload type: {type(value)!r}")


def _to_float(value: Any, default: float = 0.0) -> float:
    """Coerce Decimal/str/int/float to float."""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return default
        return float(stripped)
    return float(value)


def _to_iso8601(value: Any) -> str:
    """Return an ISO 8601 timestamp string from datetime/strings."""
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
    """Return YYYY-MM-DD date string from date-like values."""
    return _to_iso8601(value)[:10]


def normalize_asset(raw_asset: Any) -> Dict[str, Any]:
    """Normalize an Alpaca asset-like payload into `assets` table format.

    Args:
        raw_asset: Alpaca position/order payload containing symbol metadata.

    Returns:
        dict ready for Supabase `assets` upsert.
    """
    source = _to_mapping(raw_asset)
    symbol = str(source.get("symbol", "")).upper().strip()
    if not symbol:
        raise ValueError("Asset symbol is required.")

    return {
        "symbol": symbol,
        "name": source.get("name") or source.get("asset_name") or symbol,
        "asset_class": source.get("asset_class") or source.get("class"),
        "exchange": source.get("exchange"),
        "currency": (source.get("currency") or "USD").upper(),
        "metadata": {
            "alpaca_asset_id": source.get("asset_id") or source.get("id"),
            "status": source.get("status"),
            "tradable": source.get("tradable"),
        },
    }


def normalize_position(raw_position: Any, *, portfolio_id: str, as_of_timestamp: Any) -> Dict[str, Any]:
    """Normalize an Alpaca position payload into `positions` table format.

    Args:
        raw_position: Alpaca position payload.
        portfolio_id: Supabase portfolio UUID for FK integrity.
        as_of_timestamp: Sync timestamp used for snapshot date.

    Returns:
        dict ready for Supabase `positions` upsert.
    """
    source = _to_mapping(raw_position)
    symbol = str(source.get("symbol", "")).upper().strip()
    if not symbol:
        raise ValueError("Position symbol is required.")

    return {
        "portfolio_id": portfolio_id,
        "asset_symbol": symbol,
        "quantity": _to_float(source.get("qty")),
        "average_cost": _to_float(source.get("avg_entry_price"), default=None),
        "market_value": _to_float(source.get("market_value"), default=None),
        "as_of_date": _to_iso_date(as_of_timestamp),
        "metadata": {
            "side": source.get("side"),
            "unrealized_pl": _to_float(source.get("unrealized_pl"), default=0.0),
            "unrealized_plpc": _to_float(source.get("unrealized_plpc"), default=0.0),
        },
    }


def normalize_transaction(raw_transaction: Any, *, portfolio_id: str) -> Dict[str, Any]:
    """Normalize an Alpaca order/activity payload into `transactions` table format.

    Args:
        raw_transaction: Alpaca order or account activity payload.
        portfolio_id: Supabase portfolio UUID for FK integrity.

    Returns:
        dict ready for Supabase `transactions` upsert.
    """
    source = _to_mapping(raw_transaction)
    symbol = str(source.get("symbol", "")).upper().strip()
    if not symbol:
        raise ValueError("Transaction symbol is required.")

    submitted_at = source.get("filled_at") or source.get("submitted_at") or source.get("transaction_time")
    if not submitted_at:
        submitted_at = datetime.now(timezone.utc)

    qty = source.get("filled_qty")
    if qty in (None, "", 0, "0"):
        qty = source.get("qty")

    transaction_type = str(source.get("side") or source.get("type") or "trade").lower()
    external_id = source.get("id") or source.get("order_id")

    return {
        "portfolio_id": portfolio_id,
        "asset_symbol": symbol,
        "transaction_type": transaction_type,
        "quantity": _to_float(qty),
        "price": _to_float(source.get("filled_avg_price") or source.get("limit_price"), default=None),
        "fees": _to_float(source.get("fee") or source.get("fees"), default=0.0),
        "transaction_date": _to_iso8601(submitted_at),
        "external_id": str(external_id) if external_id else None,
        "notes": source.get("status") or source.get("order_class"),
        "metadata": {
            "alpaca_status": source.get("status"),
            "alpaca_order_type": source.get("order_type") or source.get("type"),
            "time_in_force": source.get("time_in_force"),
        },
    }


def normalize_assets_from_positions(raw_positions: Iterable[Any]) -> List[Dict[str, Any]]:
    """Build normalized asset rows from all current positions."""
    assets: Dict[str, Dict[str, Any]] = {}
    for raw in raw_positions:
        asset = normalize_asset(raw)
        assets[asset["symbol"]] = asset
    return list(assets.values())
