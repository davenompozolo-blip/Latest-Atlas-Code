"""
Unified credential reader for Atlas Terminal.

Always use get_secret() instead of os.getenv() for any credential or API key.
- On Streamlit Cloud: reads from st.secrets (populated from the dashboard TOML).
- Locally: falls back to os.getenv(), which is populated by load_dotenv() in
  config/config.py from the .env file.
"""

import os


def get_secret(key: str, default=None):
    """
    Read a secret from st.secrets (Streamlit Cloud) with fallback to os.getenv.

    Always call this instead of os.getenv() for any credential or API key.
    """
    try:
        import streamlit as st
        val = st.secrets.get(key)
        if val is not None:
            return str(val)
    except Exception:
        pass
    return os.getenv(key, default)
