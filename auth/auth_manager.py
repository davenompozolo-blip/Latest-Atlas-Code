"""
ATLAS Terminal — Authentication Manager
=========================================
Lightweight auth layer backed by st.secrets.

Credential structure in .streamlit/secrets.toml (or Streamlit Cloud secrets):

    [auth]
    cookie_name  = "atlas_auth"
    cookie_key   = "some-random-secret-key"

    [auth.credentials.hlobo]
    name     = "Hlobo Nompozolo"
    email    = "hlobo@riscura.com"
    password = "$2b$12$..."          # bcrypt hash
    tier     = "admin"

    [auth.credentials.analyst_demo]
    name     = "Demo Analyst"
    email    = "demo@riscura.com"
    password = "$2b$12$..."
    tier     = "analyst"
"""
from __future__ import annotations

import hashlib
import hmac
from typing import Optional

import streamlit as st

# ---------------------------------------------------------------------------
# Tier hierarchy (higher index = more access)
# ---------------------------------------------------------------------------
TIER_LEVELS = {
    "free": 0,
    "analyst": 1,
    "professional": 2,
    "admin": 3,
}


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def auth_configured() -> bool:
    """Return True if auth credentials are present in st.secrets."""
    try:
        return bool(st.secrets.get("auth", {}).get("credentials"))
    except (FileNotFoundError, AttributeError, KeyError):
        return False


def get_current_user() -> Optional[str]:
    """Return the authenticated username, or None."""
    return st.session_state.get("atlas_auth_user")


def get_current_tier() -> str:
    """Return the authenticated user's tier, default 'free'."""
    return st.session_state.get("atlas_auth_tier", "free")


def user_has_tier(required_tier: str) -> bool:
    """Check whether the current user meets or exceeds *required_tier*."""
    current = TIER_LEVELS.get(get_current_tier(), 0)
    required = TIER_LEVELS.get(required_tier, 0)
    return current >= required


def logout():
    """Clear auth state."""
    for key in ("atlas_auth_user", "atlas_auth_tier", "atlas_auth_name"):
        st.session_state.pop(key, None)


# ---------------------------------------------------------------------------
# Password verification (bcrypt with fallback to SHA-256 for environments
# where bcrypt is unavailable)
# ---------------------------------------------------------------------------

def _verify_password(plain: str, hashed: str) -> bool:
    """Verify *plain* against *hashed* (bcrypt or SHA-256 hex)."""
    # bcrypt hashes start with "$2b$" or "$2a$"
    if hashed.startswith("$2"):
        try:
            import bcrypt
            return bcrypt.checkpw(plain.encode(), hashed.encode())
        except ImportError:
            return False
    # Fallback: SHA-256 hex digest (for environments without bcrypt)
    return hmac.compare_digest(
        hashlib.sha256(plain.encode()).hexdigest(),
        hashed,
    )


def hash_password(plain: str) -> str:
    """Return a bcrypt hash (or SHA-256 hex if bcrypt unavailable)."""
    try:
        import bcrypt
        return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()
    except ImportError:
        return hashlib.sha256(plain.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Login form  (renders in sidebar)
# ---------------------------------------------------------------------------

def render_login_form() -> bool:
    """Render the login form. Returns True if the user is authenticated."""
    # Already logged in?
    if get_current_user():
        return True

    if not auth_configured():
        # No auth configured — allow anonymous access (dev mode)
        return True

    credentials = st.secrets["auth"]["credentials"]

    st.markdown(
        '<div style="text-align:center; margin-bottom:1.5rem;">'
        '<div style="font-family:\'Syne\',sans-serif; font-size:22px;'
        ' font-weight:700; letter-spacing:3px; color:#00d4ff;'
        ' text-shadow:0 0 20px rgba(0,212,255,0.4);">ATLAS</div>'
        '<div style="font-size:11px; color:rgba(255,255,255,0.35);'
        ' letter-spacing:1.8px; text-transform:uppercase; margin-top:3px;">'
        'Terminal Login</div></div>',
        unsafe_allow_html=True,
    )

    with st.form("atlas_login_form"):
        username = st.text_input("Username", key="login_username")
        password = st.text_input("Password", type="password", key="login_password")
        submitted = st.form_submit_button("Log In", use_container_width=True)

    if submitted:
        if username in credentials:
            user_cfg = credentials[username]
            stored_hash = user_cfg.get("password", "")
            if _verify_password(password, stored_hash):
                st.session_state["atlas_auth_user"] = username
                st.session_state["atlas_auth_tier"] = user_cfg.get("tier", "free")
                st.session_state["atlas_auth_name"] = user_cfg.get("name", username)
                st.rerun()
            else:
                st.error("Invalid credentials")
        else:
            st.error("Invalid credentials")

    return False
