"""
ATLAS Terminal — Stripe Billing Router (Phase 9, Initiative 1)
================================================================
Self-serve billing: Checkout sessions, webhook handling, billing portal.
All Stripe calls use keys from environment variables — never hardcoded.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger("atlas.api.billing")


# ---------------------------------------------------------------------------
# Stripe initialisation (lazy — only loads when an endpoint is hit)
# ---------------------------------------------------------------------------

def _get_stripe():
    """Return configured stripe module."""
    import stripe
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    return stripe


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class CheckoutRequest(BaseModel):
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class PortalResponse(BaseModel):
    portal_url: str


# ---------------------------------------------------------------------------
# Tier update helper
# ---------------------------------------------------------------------------

def _update_user_tier(username: str, new_tier: str):
    """Update a user's tier.

    Writes to a lightweight JSON store so the Streamlit app picks it up
    on the next session refresh. Also calls auth_manager if available.
    """
    import json
    from pathlib import Path

    tier_file = Path(__file__).resolve().parent.parent.parent / ".atlas_tier_overrides.json"
    overrides = {}
    if tier_file.exists():
        try:
            overrides = json.loads(tier_file.read_text(encoding="utf-8"))
        except Exception:
            overrides = {}

    overrides[username] = {
        "tier": new_tier,
        "updated_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
    tier_file.write_text(json.dumps(overrides, indent=2), encoding="utf-8")
    logger.info(f"Tier updated: {username} -> {new_tier}")


def _update_subscription_status(username: str, status: str, stripe_customer_id: str = ""):
    """Record subscription status for admin panel display."""
    import json
    from pathlib import Path

    sub_file = Path(__file__).resolve().parent.parent.parent / ".atlas_subscriptions.json"
    subs = {}
    if sub_file.exists():
        try:
            subs = json.loads(sub_file.read_text(encoding="utf-8"))
        except Exception:
            subs = {}

    subs[username] = {
        "status": status,
        "stripe_customer_id": stripe_customer_id,
        "updated_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
    sub_file.write_text(json.dumps(subs, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(req: CheckoutRequest, request: Request):
    """Create a Stripe Checkout session for Professional tier upgrade.

    Requires a valid API key (any tier — free users need this to upgrade).
    """
    from api.auth import verify_api_key
    user = await verify_api_key(request)

    stripe = _get_stripe()
    price_id = os.getenv("STRIPE_PRICE_ID", "")
    if not price_id:
        raise HTTPException(status_code=503, detail="Stripe price not configured")

    base_url = os.getenv("ATLAS_BASE_URL", "http://localhost:8501")
    success_url = req.success_url or f"{base_url}?upgrade=success"
    cancel_url = req.cancel_url or f"{base_url}?upgrade=cancelled"

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=user.username,
        customer_email=user.email if hasattr(user, "email") else None,
    )

    return CheckoutResponse(checkout_url=session.url, session_id=session.id)


@router.post("/portal", response_model=PortalResponse)
async def create_portal_session(request: Request):
    """Create a Stripe Billing Portal session for subscription management."""
    from api.auth import verify_api_key
    user = await verify_api_key(request)

    stripe = _get_stripe()

    # Look up Stripe customer ID from subscriptions file
    import json
    from pathlib import Path
    sub_file = Path(__file__).resolve().parent.parent.parent / ".atlas_subscriptions.json"
    customer_id = None
    if sub_file.exists():
        subs = json.loads(sub_file.read_text(encoding="utf-8"))
        user_sub = subs.get(user.username, {})
        customer_id = user_sub.get("stripe_customer_id")

    if not customer_id:
        raise HTTPException(status_code=404, detail="No active subscription found")

    base_url = os.getenv("ATLAS_BASE_URL", "http://localhost:8501")
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=base_url,
    )

    return PortalResponse(portal_url=session.url)


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events.

    Validates the webhook signature before processing.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    if not webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")

    stripe = _get_stripe()

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
    except stripe.error.SignatureVerificationError:
        logger.warning("Stripe webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = event["type"]
    data = event["data"]["object"]

    logger.info(f"Stripe webhook received: {event_type}")

    if event_type == "checkout.session.completed":
        username = data.get("client_reference_id")
        customer_id = data.get("customer", "")
        if username:
            _update_user_tier(username, "professional")
            _update_subscription_status(username, "active", customer_id)
            logger.info(f"Checkout completed: {username} -> professional")

    elif event_type == "customer.subscription.updated":
        status = data.get("status", "")
        customer_id = data.get("customer", "")
        # Resolve username from subscription metadata or customer lookup
        username = _resolve_username_from_customer(customer_id)
        if username:
            if status in ("active", "trialing"):
                _update_user_tier(username, "professional")
                _update_subscription_status(username, status, customer_id)
            elif status == "past_due":
                # Grace period — keep professional, Stripe handles dunning
                _update_subscription_status(username, "past_due", customer_id)
            elif status in ("canceled", "unpaid"):
                _update_user_tier(username, "free")
                _update_subscription_status(username, "canceled", customer_id)

    elif event_type == "customer.subscription.deleted":
        customer_id = data.get("customer", "")
        username = _resolve_username_from_customer(customer_id)
        if username:
            _update_user_tier(username, "free")
            _update_subscription_status(username, "canceled", customer_id)
            logger.info(f"Subscription deleted: {username} -> free")

    return {"status": "ok"}


def _resolve_username_from_customer(customer_id: str) -> Optional[str]:
    """Look up username from Stripe customer ID in subscriptions file."""
    import json
    from pathlib import Path

    sub_file = Path(__file__).resolve().parent.parent.parent / ".atlas_subscriptions.json"
    if not sub_file.exists():
        return None

    try:
        subs = json.loads(sub_file.read_text(encoding="utf-8"))
        for username, info in subs.items():
            if info.get("stripe_customer_id") == customer_id:
                return username
    except Exception:
        pass
    return None
