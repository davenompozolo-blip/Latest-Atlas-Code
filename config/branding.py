"""
ATLAS Terminal — White-Label Branding Config Loader
=====================================================
Single import point for all brand references across the codebase.

Usage:
    from config.branding import get_branding, get_theme, get_docx_config

All hardcoded firm names and colours read from here.
Change config/branding.toml to re-brand the entire app.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

_CONFIG_PATH = Path(__file__).resolve().parent / "branding.toml"

# Defaults — used if branding.toml is missing or incomplete
_DEFAULTS = {
    "branding": {
        "firm_name": "ATLAS Terminal",
        "tagline": "Institutional Analytics for the Buy-Side",
        "primary_colour": "#6366f1",
        "accent_colour": "#00d4ff",
        "logo_text": "ATLAS",
        "logo_path": "",
        "contact_email": "support@atlasterminal.io",
        "website": "https://atlasterminal.io",
        "report_footer": "ATLAS Terminal",
        "copyright_holder": "ATLAS Terminal",
    },
    "theme": {
        "sidebar_bg": "#0f172a",
        "card_bg": "rgba(255,255,255,0.03)",
        "card_border": "rgba(255,255,255,0.07)",
        "text_primary": "rgba(255,255,255,0.92)",
        "text_secondary": "rgba(255,255,255,0.52)",
        "text_muted": "rgba(255,255,255,0.28)",
    },
    "docx": {
        "header_rgb": [31, 41, 63],
        "font_family": "Calibri",
    },
}


def _load_toml() -> dict:
    """Load branding.toml, falling back to defaults."""
    if not _CONFIG_PATH.exists():
        return _DEFAULTS

    try:
        import tomllib
    except ModuleNotFoundError:
        # Python < 3.11 fallback
        try:
            import tomli as tomllib  # type: ignore[no-redef]
        except ImportError:
            return _DEFAULTS

    with open(_CONFIG_PATH, "rb") as f:
        data = tomllib.load(f)

    # Merge with defaults so missing keys don't break anything
    merged = {}
    for section in _DEFAULTS:
        merged[section] = {**_DEFAULTS[section], **data.get(section, {})}
    return merged


@lru_cache(maxsize=1)
def _cached_config() -> dict:
    return _load_toml()


def get_branding() -> dict:
    """Return the [branding] section."""
    return _cached_config()["branding"]


def get_theme() -> dict:
    """Return the [theme] section."""
    return _cached_config()["theme"]


def get_docx_config() -> dict:
    """Return the [docx] section."""
    return _cached_config()["docx"]


def reload_branding():
    """Clear the cache so next call re-reads branding.toml."""
    _cached_config.cache_clear()
