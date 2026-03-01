"""
ATLAS Client — Exception Hierarchy
====================================
Typed exceptions for all API failure modes.
"""


class ATLASError(Exception):
    """Base exception for all ATLAS Client errors."""

    def __init__(self, message: str, status_code: int | None = None, response_body: dict | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body or {}


class ATLASAuthError(ATLASError):
    """401 — Invalid or missing API key."""
    pass


class ATLASTierError(ATLASError):
    """403 — Insufficient tier for this endpoint."""
    pass


class ATLASRateLimitError(ATLASError):
    """429 — Rate limit exceeded."""

    def __init__(self, message: str, retry_after: float | None = None, **kwargs):
        super().__init__(message, **kwargs)
        self.retry_after = retry_after


class ATLASValidationError(ATLASError):
    """422 — Request validation failed."""
    pass


class ATLASServerError(ATLASError):
    """5xx — Server-side error."""
    pass
