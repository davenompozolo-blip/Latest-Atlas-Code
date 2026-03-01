"""
ATLAS Client — Core SDK Class
================================
Enterprise API client with retry logic, rate-limit backoff, and typed methods
for every ATLAS Terminal REST API endpoint.

Phase 10, Initiative 3.
"""
from __future__ import annotations

import time
from typing import Any, Literal

import requests

from atlas_client.exceptions import (
    ATLASAuthError,
    ATLASError,
    ATLASRateLimitError,
    ATLASServerError,
    ATLASTierError,
    ATLASValidationError,
)


class ATLASClient:
    """
    Python SDK for the ATLAS Terminal REST API.

    Parameters
    ----------
    base_url : str
        API base URL (e.g. "https://api.atlas-terminal.co.za" or
        "http://localhost:8000" for local dev).
    api_key : str
        Your ATLAS API key (format: atlas_...).
    timeout : float
        Request timeout in seconds (default 30).
    max_retries : int
        Maximum retries on 429/5xx (default 3).
    sandbox : bool
        If True, all requests are routed to /v1/sandbox/* endpoints
        which return synthetic data without touching real systems.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 30.0,
        max_retries: int = 3,
        sandbox: bool = False,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        self.sandbox = sandbox
        self._session = requests.Session()
        self._session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json",
            "User-Agent": "ATLASClient/1.0.0",
        })

    # ------------------------------------------------------------------
    # Internal request engine
    # ------------------------------------------------------------------

    def _url(self, path: str) -> str:
        """Build full URL, routing to sandbox if enabled."""
        if self.sandbox and not path.startswith("/v1/sandbox"):
            # Rewrite /v1/... to /v1/sandbox/...
            path = path.replace("/v1/", "/v1/sandbox/", 1)
        return f"{self.base_url}{path}"

    def _request(
        self,
        method: str,
        path: str,
        json_body: dict | None = None,
        params: dict | None = None,
    ) -> dict:
        """Execute an API request with retry and error handling."""
        url = self._url(path)
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                resp = self._session.request(
                    method=method,
                    url=url,
                    json=json_body,
                    params=params,
                    timeout=self.timeout,
                )
            except requests.ConnectionError as e:
                last_error = ATLASError(f"Connection failed: {e}")
                if attempt < self.max_retries:
                    time.sleep(2 ** attempt)
                    continue
                raise last_error from e
            except requests.Timeout as e:
                last_error = ATLASError(f"Request timed out after {self.timeout}s")
                if attempt < self.max_retries:
                    time.sleep(2 ** attempt)
                    continue
                raise last_error from e

            # Parse response
            try:
                body = resp.json()
            except Exception:
                body = {"detail": resp.text}

            # Success
            if resp.ok:
                return body

            # Error handling by status code
            if resp.status_code == 401:
                raise ATLASAuthError(
                    body.get("detail", "Authentication failed"),
                    status_code=401,
                    response_body=body,
                )

            if resp.status_code == 403:
                raise ATLASTierError(
                    body.get("detail", "Insufficient tier"),
                    status_code=403,
                    response_body=body,
                )

            if resp.status_code == 422:
                raise ATLASValidationError(
                    body.get("detail", "Validation error"),
                    status_code=422,
                    response_body=body,
                )

            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", 2 ** attempt))
                if attempt < self.max_retries:
                    time.sleep(retry_after)
                    continue
                raise ATLASRateLimitError(
                    "Rate limit exceeded",
                    retry_after=retry_after,
                    status_code=429,
                    response_body=body,
                )

            if resp.status_code >= 500:
                last_error = ATLASServerError(
                    body.get("detail", f"Server error {resp.status_code}"),
                    status_code=resp.status_code,
                    response_body=body,
                )
                if attempt < self.max_retries:
                    time.sleep(2 ** attempt)
                    continue
                raise last_error

            # Other 4xx
            raise ATLASError(
                body.get("detail", f"HTTP {resp.status_code}"),
                status_code=resp.status_code,
                response_body=body,
            )

        raise last_error or ATLASError("Request failed after retries")

    def _get(self, path: str, params: dict | None = None) -> dict:
        return self._request("GET", path, params=params)

    def _post(self, path: str, body: dict | None = None) -> dict:
        return self._request("POST", path, json_body=body or {})

    # ------------------------------------------------------------------
    # Health & Admin
    # ------------------------------------------------------------------

    def health(self) -> dict:
        """GET /v1/health — Public health check."""
        return self._get("/v1/health")

    def usage_stats(self) -> dict:
        """GET /v1/usage — Admin-only usage statistics."""
        return self._get("/v1/usage")

    # ------------------------------------------------------------------
    # Portfolio Analytics
    # ------------------------------------------------------------------

    def get_portfolio_metrics(
        self,
        tickers: list[str],
        weights: dict[str, float],
        period: str = "1y",
        benchmark: str = "^J203.JO",
        risk_free_rate: float = 0.08,
    ) -> dict:
        """POST /v1/portfolio/metrics — Risk/return metrics."""
        return self._post("/v1/portfolio/metrics", {
            "tickers": tickers,
            "weights": weights,
            "period": period,
            "benchmark": benchmark,
            "risk_free_rate": risk_free_rate,
        })

    def get_portfolio_attribution(
        self,
        tickers: list[str],
        weights: dict[str, float],
        benchmark: str = "^J203.JO",
        period: str = "1y",
    ) -> dict:
        """POST /v1/portfolio/attribution — Brinson attribution."""
        return self._post("/v1/portfolio/attribution", {
            "tickers": tickers,
            "weights": weights,
            "benchmark": benchmark,
            "period": period,
        })

    def get_portfolio_risk(
        self,
        tickers: list[str],
        weights: dict[str, float],
        period: str = "1y",
        confidence: float = 0.95,
        portfolio_value: float | None = None,
    ) -> dict:
        """POST /v1/portfolio/risk — VaR, CVaR, correlation matrix."""
        body: dict[str, Any] = {
            "tickers": tickers,
            "weights": weights,
            "period": period,
            "confidence": confidence,
        }
        if portfolio_value is not None:
            body["portfolio_value"] = portfolio_value
        return self._post("/v1/portfolio/risk", body)

    # ------------------------------------------------------------------
    # Optimisation
    # ------------------------------------------------------------------

    def run_optimisation(
        self,
        tickers: list[str],
        period: str = "2y",
        objective: Literal["max_sharpe", "min_volatility", "max_return", "risk_parity"] = "max_sharpe",
        max_weight: float = 0.40,
        min_weight: float = 0.02,
        target_leverage: float = 1.0,
        risk_free_rate: float = 0.045,
    ) -> dict:
        """POST /v1/portfolio/optimise — Portfolio optimisation."""
        return self._post("/v1/portfolio/optimise", {
            "tickers": tickers,
            "period": period,
            "objective": objective,
            "max_weight": max_weight,
            "min_weight": min_weight,
            "target_leverage": target_leverage,
            "risk_free_rate": risk_free_rate,
        })

    # ------------------------------------------------------------------
    # Market Regime
    # ------------------------------------------------------------------

    def get_regime(self) -> dict:
        """GET /v1/regime/current — Current market regime detection."""
        return self._get("/v1/regime/current")

    # ------------------------------------------------------------------
    # Strategic Asset Allocation
    # ------------------------------------------------------------------

    def get_saa_recommendation(
        self,
        views: dict[str, str],
        mandate: Literal["balanced_reg28", "global_unconstrained", "capital_preservation"] = "balanced_reg28",
        convictions: dict[str, str] | None = None,
    ) -> dict:
        """POST /v1/macro/saa — Strategic asset allocation recommendation."""
        return self._post("/v1/macro/saa", {
            "mandate": mandate,
            "views": views,
            "convictions": convictions or {},
        })

    # ------------------------------------------------------------------
    # Commentary
    # ------------------------------------------------------------------

    def generate_quarterly_commentary(
        self,
        portfolio_tickers: list[str] | None = None,
        portfolio_weights: dict[str, float] | None = None,
        key_calls: list[str] | None = None,
        tone: Literal["institutional", "concise", "detailed"] = "institutional",
    ) -> dict:
        """POST /v1/commentary/quarterly — AI quarterly commentary."""
        return self._post("/v1/commentary/quarterly", {
            "portfolio_tickers": portfolio_tickers or [],
            "portfolio_weights": portfolio_weights or {},
            "key_calls": key_calls or [],
            "tone": tone,
        })

    def generate_attribution_commentary(
        self,
        attribution_data: dict,
        period_label: str = "Q4 2025",
        benchmark_name: str = "JSE All Share",
        tone: Literal["institutional", "concise", "detailed"] = "institutional",
    ) -> dict:
        """POST /v1/commentary/attribution — Attribution commentary."""
        return self._post("/v1/commentary/attribution", {
            "attribution_data": attribution_data,
            "period_label": period_label,
            "benchmark_name": benchmark_name,
            "tone": tone,
        })

    def generate_manager_commentary(
        self,
        fund_data: dict | None = None,
        tenure: str = "",
        aum: str = "",
        mandate_type: str = "",
        fee_structure: str = "",
        tone: Literal["institutional", "concise", "detailed"] = "institutional",
    ) -> dict:
        """POST /v1/commentary/manager — Fund manager commentary."""
        return self._post("/v1/commentary/manager", {
            "fund_data": fund_data,
            "tenure": tenure,
            "aum": aum,
            "mandate_type": mandate_type,
            "fee_structure": fee_structure,
            "tone": tone,
        })

    # ------------------------------------------------------------------
    # Billing
    # ------------------------------------------------------------------

    def get_billing_status(self) -> dict:
        """GET /v1/billing/status — Current billing/subscription status."""
        return self._get("/v1/billing/status")

    def create_checkout_session(self, tier: str = "professional") -> dict:
        """POST /v1/billing/checkout — Create Stripe Checkout session."""
        return self._post("/v1/billing/checkout", {"tier": tier})

    def create_billing_portal(self) -> dict:
        """POST /v1/billing/portal — Create Stripe Billing Portal session."""
        return self._post("/v1/billing/portal")

    # ------------------------------------------------------------------
    # Convenience
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        mode = "sandbox" if self.sandbox else "production"
        return f"ATLASClient(base_url={self.base_url!r}, mode={mode})"
