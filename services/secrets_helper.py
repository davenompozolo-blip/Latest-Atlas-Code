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

    Checks top-level keys first, then searches one level deep into any nested
    sections (e.g. secrets stored under [api_keys] in the Streamlit Cloud TOML).

    Always call this instead of os.getenv() for any credential or API key.
    """
    try:
        import streamlit as st
        # 1. Top-level key
        val = st.secrets.get(key)
        if val is not None:
            return str(val)
        # 2. Search one level into nested sections
        for section_val in st.secrets.values():
            if hasattr(section_val, "get"):
                nested = section_val.get(key)
                if nested is not None:
                    return str(nested)
    except Exception:
        pass
    return os.getenv(key, default)
