"""
ATLAS Client — Python SDK for the ATLAS Terminal REST API
==========================================================
Enterprise-grade client with automatic retries, rate-limit handling,
and typed responses. Supports both production and sandbox environments.

Usage:
    from atlas_client import ATLASClient

    client = ATLASClient(
        base_url="https://api.atlas-terminal.co.za",
        api_key="atlas_...",
    )
    health = client.health()
    metrics = client.get_portfolio_metrics(
        tickers=["NPN", "AGL", "BTI"],
        weights={"NPN": 0.4, "AGL": 0.35, "BTI": 0.25},
    )

Phase 10, Initiative 3.
"""

from atlas_client.client import ATLASClient
from atlas_client.exceptions import (
    ATLASError,
    ATLASAuthError,
    ATLASRateLimitError,
    ATLASTierError,
    ATLASValidationError,
    ATLASServerError,
)

__all__ = [
    "ATLASClient",
    "ATLASError",
    "ATLASAuthError",
    "ATLASRateLimitError",
    "ATLASTierError",
    "ATLASValidationError",
    "ATLASServerError",
]

__version__ = "1.0.0"
