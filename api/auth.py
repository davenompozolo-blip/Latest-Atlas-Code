"""
ATLAS API — API Key Authentication
====================================
Validates X-API-Key header against hashed keys stored in environment / secrets.

Key storage format (environment variable ATLAS_API_KEYS):
    username:hashed_key:tier,username2:hashed_key2:tier2

Or via a JSON file at ATLAS_API_KEYS_FILE path.

Keys are never stored in plaintext, never logged, never returned in full
after creation (show-once pattern enforced in Admin Panel).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# Tier hierarchy — mirrors auth/auth_manager.py
TIER_LEVELS = {
    "free": 0,
    "analyst": 1,
    "professional": 2,
    "admin": 3,
}


@dataclass
class APIUser:
    """Authenticated API user."""
    username: str
    tier: str

    def has_tier(self, required: str) -> bool:
        return TIER_LEVELS.get(self.tier, 0) >= TIER_LEVELS.get(required, 0)


def _hash_api_key(raw_key: str) -> str:
    """SHA-256 hash of an API key — the stored form."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


def generate_api_key() -> tuple[str, str]:
    """Generate a new API key. Returns (raw_key, hashed_key).

    The raw key is shown once to the user. The hash is stored.
    """
    raw = f"atlas_{secrets.token_urlsafe(32)}"
    return raw, _hash_api_key(raw)


def _load_api_keys() -> dict[str, dict]:
    """Load API key registry.

    Returns dict of {hashed_key: {"username": ..., "tier": ...}}.
    """
    registry: dict[str, dict] = {}

    # Source 1: environment variable (comma-separated user:hash:tier triples)
    env_keys = os.getenv("ATLAS_API_KEYS", "")
    if env_keys:
        for entry in env_keys.split(","):
            parts = entry.strip().split(":")
            if len(parts) >= 3:
                username, key_hash, tier = parts[0], parts[1], parts[2]
                registry[key_hash] = {"username": username, "tier": tier}

    # Source 2: JSON file
    keys_file = os.getenv("ATLAS_API_KEYS_FILE", "")
    if keys_file and os.path.isfile(keys_file):
        with open(keys_file) as f:
            data = json.load(f)
        for entry in data:
            registry[entry["key_hash"]] = {
                "username": entry["username"],
                "tier": entry.get("tier", "free"),
            }

    return registry


def get_user_by_api_key(raw_key: str) -> Optional[APIUser]:
    """Look up a user by raw API key."""
    hashed = _hash_api_key(raw_key)
    registry = _load_api_keys()
    entry = registry.get(hashed)
    if entry:
        return APIUser(username=entry["username"], tier=entry["tier"])
    return None


async def verify_api_key(
    api_key: Optional[str] = Security(_api_key_header),
) -> APIUser:
    """FastAPI dependency — verify API key and return the user."""
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    user = get_user_by_api_key(api_key)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return user


def require_tier(required_tier: str):
    """FastAPI dependency factory — require a minimum tier."""
    async def _check(user: APIUser = Depends(verify_api_key)) -> APIUser:
        if not user.has_tier(required_tier):
            raise HTTPException(
                status_code=403,
                detail=f"This endpoint requires the '{required_tier}' tier. "
                       f"Your current tier is '{user.tier}'.",
            )
        return user
    return _check
