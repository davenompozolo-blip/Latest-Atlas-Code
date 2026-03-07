"""Supabase REST persistence helpers for Atlas Alpaca sync.

Uses Supabase PostgREST endpoints with merge-duplicate UPSERT semantics.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)


class SupabaseSyncClient:
    """Thin wrapper around Supabase REST API with idempotent upsert helpers."""

    def __init__(self, url: Optional[str] = None, key: Optional[str] = None):
        supabase_url = (url or os.getenv("SUPABASE_URL", "")).rstrip("/")
        supabase_key = key or os.getenv("SUPABASE_ANON_KEY", "")

        if not supabase_url or not supabase_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY are required.")

        self.supabase_url = supabase_url
        self.supabase_key = supabase_key

    def _request(
        self,
        method: str,
        table: str,
        *,
        query: Optional[Dict[str, str]] = None,
        json_payload: Optional[Any] = None,
        prefer: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        base = f"{self.supabase_url}/rest/v1/{table}"
        query_string = f"?{urllib.parse.urlencode(query)}" if query else ""
        url = f"{base}{query_string}"

        headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Accept": "application/json",
        }
        if json_payload is not None:
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer

        body = None
        if json_payload is not None:
            body = json.dumps(json_payload).encode("utf-8")

        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        with urllib.request.urlopen(request) as response:
            raw = response.read().decode("utf-8")
            if not raw:
                return []
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return [parsed]
            return parsed

    def upsert_portfolio(self, portfolio_row: Dict[str, Any]) -> Dict[str, Any]:
        """Upsert a portfolio by external_id and return stored row."""
        payload = {
            "external_id": portfolio_row["external_id"],
            "name": portfolio_row.get("name") or "Alpaca Portfolio",
            "broker": portfolio_row.get("broker") or "alpaca",
            "base_currency": portfolio_row.get("base_currency") or "USD",
            "metadata": portfolio_row.get("metadata") or {},
        }

        logger.info("supabase_upsert_portfolio", extra={"external_id": payload["external_id"]})
        rows = self._request(
            "POST",
            "portfolios",
            query={"on_conflict": "external_id"},
            json_payload=payload,
            prefer="resolution=merge-duplicates,return=representation",
        )
        return rows[0]

    def upsert_assets(self, assets: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Upsert assets by unique symbol."""
        rows = list(assets)
        if not rows:
            return []

        logger.info("supabase_upsert_assets", extra={"count": len(rows)})
        return self._request(
            "POST",
            "assets",
            query={"on_conflict": "symbol"},
            json_payload=rows,
            prefer="resolution=merge-duplicates,return=representation",
        )

    def upsert_positions(self, positions: Iterable[Dict[str, Any]], asset_id_by_symbol: Dict[str, str]) -> List[Dict[str, Any]]:
        """Upsert positions using conflict key (portfolio_id, asset_id, as_of_date)."""
        prepared: List[Dict[str, Any]] = []
        for row in positions:
            symbol = row.get("asset_symbol")
            asset_id = asset_id_by_symbol.get(symbol)
            if not asset_id:
                raise ValueError(f"Missing asset id for symbol={symbol}")

            prepared.append(
                {
                    "portfolio_id": row["portfolio_id"],
                    "asset_id": asset_id,
                    "quantity": row["quantity"],
                    "average_cost": row.get("average_cost"),
                    "market_value": row.get("market_value"),
                    "as_of_date": row["as_of_date"],
                }
            )

        if not prepared:
            return []

        logger.info("supabase_upsert_positions", extra={"count": len(prepared)})
        return self._request(
            "POST",
            "positions",
            query={"on_conflict": "portfolio_id,asset_id,as_of_date"},
            json_payload=prepared,
            prefer="resolution=merge-duplicates,return=representation",
        )

    def upsert_transactions(
        self,
        transactions: Iterable[Dict[str, Any]],
        asset_id_by_symbol: Dict[str, str],
    ) -> List[Dict[str, Any]]:
        """Upsert transactions idempotently by (portfolio_id, external_id)."""
        prepared: List[Dict[str, Any]] = []
        for row in transactions:
            symbol = row.get("asset_symbol")
            asset_id = asset_id_by_symbol.get(symbol)
            if not asset_id:
                raise ValueError(f"Missing asset id for symbol={symbol}")

            external_id = row.get("external_id")
            if not external_id:
                dedupe_key = "|".join(
                    [
                        row["portfolio_id"],
                        symbol,
                        row["transaction_type"],
                        str(row["quantity"]),
                        row["transaction_date"],
                    ]
                )
                external_id = f"synthetic:{dedupe_key}"

            prepared.append(
                {
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
                }
            )

        if not prepared:
            return []

        logger.info("supabase_upsert_transactions", extra={"count": len(prepared)})
        return self._request(
            "POST",
            "transactions",
            query={"on_conflict": "portfolio_id,external_id"},
            json_payload=prepared,
            prefer="resolution=merge-duplicates,return=representation",
        )


def create_supabase_sync_client() -> SupabaseSyncClient:
    """Factory for dependency injection and testing."""
    return SupabaseSyncClient()


def get_supabase_client():
    """
    Return an official supabase-py client for use with the market data
    ingestion service (requires .table() / fluent query builder API).
    """
    from supabase import create_client
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_ANON_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY are required.")
    return create_client(url, key)
