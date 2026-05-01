"""Supabase REST persistence helpers for Atlas Alpaca sync.

Uses Supabase PostgREST endpoints with merge-duplicate UPSERT semantics.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime
from services.secrets_helper import get_secret
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)


class _SafeEncoder(json.JSONEncoder):
    """Encode UUID and datetime values that Alpaca SDK returns as objects."""

    def default(self, o: Any) -> Any:
        if isinstance(o, (uuid.UUID,)):
            return str(o)
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        return super().default(o)


class SupabaseSyncClient:
    """Thin wrapper around Supabase REST API with idempotent upsert helpers."""

    def __init__(self, url: Optional[str] = None, key: Optional[str] = None):
        supabase_url = (url or get_secret("SUPABASE_URL", "")).rstrip("/")
        supabase_key = key or get_secret("SUPABASE_ANON_KEY", "")

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
            body = json.dumps(json_payload, cls=_SafeEncoder).encode("utf-8")

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
        # Include organization_id if provided (per-org tenancy)
        if portfolio_row.get("organization_id"):
            payload["organization_id"] = portfolio_row["organization_id"]

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
        skipped: List[str] = []
        for row in transactions:
            symbol = row.get("asset_symbol")
            asset_id = asset_id_by_symbol.get(symbol)
            if not asset_id:
                print(f"[AlpacaSync][WARN] Skipping transaction — no asset_id for symbol={symbol}", flush=True)
                skipped.append(str(symbol))
                continue

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

        print(f"[AlpacaSync] transactions: written={len(prepared)}, skipped={len(skipped)}"
              + (f" (skipped: {skipped})" if skipped else ""), flush=True)
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


    # ------------------------------------------------------------------
    # Phantom position helpers
    # ------------------------------------------------------------------

    def get_recent_active_asset_ids(self, portfolio_id: str, since_date: str) -> List[str]:
        """Return asset_ids of non-zero positions for this portfolio since since_date.

        Used by the sync to detect closed positions that need tombstone rows.
        """
        rows = self._request(
            "GET",
            "positions",
            query={
                "portfolio_id": f"eq.{portfolio_id}",
                "as_of_date": f"gte.{since_date}",
                "quantity": "neq.0",
                "select": "asset_id",
            },
        )
        return [r["asset_id"] for r in rows if r.get("asset_id")]

    def write_position_tombstones(
        self,
        portfolio_id: str,
        asset_ids: List[str],
        as_of_date: str,
    ) -> int:
        """Write zero-quantity tombstone rows for closed positions.

        These rows let the view's `distinct on` pick quantity=0 as the
        latest snapshot, ensuring closed positions are not shown.
        """
        if not asset_ids:
            return 0
        rows = [
            {
                "portfolio_id": portfolio_id,
                "asset_id": aid,
                "quantity": 0,
                "market_value": 0,
                "as_of_date": as_of_date,
            }
            for aid in asset_ids
        ]
        self._request(
            "POST",
            "positions",
            query={"on_conflict": "portfolio_id,asset_id,as_of_date"},
            json_payload=rows,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        return len(rows)

    # ------------------------------------------------------------------
    # Sync job tracking
    # ------------------------------------------------------------------

    def create_sync_job(
        self,
        organization_id: str,
        user_id: str,
        broker: str = "alpaca",
        portfolio_id: Optional[str] = None,
        settings: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a sync_jobs row and return it (status='queued')."""
        payload: Dict[str, Any] = {
            "organization_id": organization_id,
            "user_id": user_id,
            "broker": broker,
            "status": "queued",
            "settings": settings or {},
        }
        if portfolio_id:
            payload["portfolio_id"] = portfolio_id

        rows = self._request(
            "POST",
            "sync_jobs",
            json_payload=payload,
            prefer="return=representation",
        )
        return rows[0]

    def update_sync_job(
        self,
        job_id: str,
        *,
        status: Optional[str] = None,
        error_message: Optional[str] = None,
        rows_synced: Optional[int] = None,
        started_at: Optional[str] = None,
        finished_at: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Update a sync_jobs row by id."""
        payload: Dict[str, Any] = {}
        if status:
            payload["status"] = status
        if error_message is not None:
            payload["error_message"] = error_message
        if rows_synced is not None:
            payload["rows_synced"] = rows_synced
        if started_at:
            payload["started_at"] = started_at
        if finished_at:
            payload["finished_at"] = finished_at
        if not payload:
            return []

        return self._request(
            "PATCH",
            "sync_jobs",
            query={"id": f"eq.{job_id}"},
            json_payload=payload,
            prefer="return=representation",
        )


def create_supabase_sync_client() -> SupabaseSyncClient:
    """Factory for dependency injection and testing."""
    return SupabaseSyncClient()


_supabase_client = None


def get_supabase_client():
    """
    Provide a process-global Supabase client, creating and caching it on first call.
    
    Returns:
        Supabase client instance created by supabase.create_client.
    
    Raises:
        RuntimeError: If SUPABASE_URL or SUPABASE_ANON_KEY environment variables are missing or empty.
    Return a cached official supabase-py client for use with the market data
    ingestion service (requires .table() / fluent query builder API).
    Singleton: the client is created once per process and reused on subsequent calls.
    """
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    from supabase import create_client
    url = get_secret("SUPABASE_URL", "").rstrip("/")
    key = get_secret("SUPABASE_ANON_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY are required.")
    _supabase_client = create_client(url, key)
    return _supabase_client
