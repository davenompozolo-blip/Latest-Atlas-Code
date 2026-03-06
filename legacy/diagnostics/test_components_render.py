"""
Quick test to verify Phase 2A components render correctly
"""
import streamlit as st
import pandas as pd

# Import Phase 2A components
from ui.components import (
    badge, render_badge, badge_group,
    atlas_table, atlas_table_with_badges
)

st.title("Component Rendering Test")

st.header("1. Badge Group Test")
badge_group([
    {'text': 'Leverage: On Target', 'type': 'success', 'size': 'md', 'icon': '✓'},
    {'text': 'Strong Performance (+12.5%)', 'type': 'success', 'size': 'md', 'icon': '↑'},
    {'text': '8 Positions', 'type': 'neutral', 'size': 'md'},
])

st.markdown("---")

st.header("2. Atlas Table Test")
test_df = pd.DataFrame({
    'Ticker': ['AAPL', 'GOOGL', 'MSFT'],
    'Price': [185.50, 142.30, 378.90],
    'Return %': [15.2, -3.4, 8.7]
})

atlas_table(
    test_df,
    title="Test Holdings",
    subtitle="3 positions",
    hoverable=True
)

st.success("✅ If you see rendered badges and a glassmorphic table above, components are working!")
st.error("❌ If you see raw HTML, there's a rendering issue")
