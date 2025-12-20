"""
Page Handlers Package

Contains modular, extracted page rendering functions.

Phase 2B: Gradual extraction of pages from atlas_app.py into standalone handlers.
"""

from .about import render_about_page

__all__ = ['render_about_page']
