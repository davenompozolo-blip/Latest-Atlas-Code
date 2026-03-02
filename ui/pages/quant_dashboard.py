"""
ATLAS Terminal — Quantitative Dashboard Page Wrapper
Bridges the standalone quant dashboard into ATLAS's page routing system.
"""
import streamlit as st


def render_quant_dashboard():
    """
    Zero-argument render function (ATLAS page contract).
    Delegates to the standalone quant dashboard's main().
    """
    from atlas_quant_dashboard.dashboard import main
    main()
