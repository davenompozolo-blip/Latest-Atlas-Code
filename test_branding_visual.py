#!/usr/bin/env python3
"""
MINIMAL Avengers Branding Test - Visual Proof
This will DEFINITELY show visual changes if branding works.
"""

import streamlit as st

st.set_page_config(page_title="Branding Test", layout="wide")

# Import and apply Avengers branding
try:
    from ui.branding import apply_avengers_branding, HeroMode, show_shield_logo

    st.success("✅ Branding module imported successfully")

    # Apply Captain America theme
    theme, icons = apply_avengers_branding(
        hero_mode=HeroMode.CAPTAIN,
        include_logo=True,
        include_animations=True
    )

    st.success("✅ Branding applied - You should see Captain America theme colors NOW")

    # Show visual elements
    st.title("🛡️ Avengers Branding Test")

    st.markdown("### If branding is working, you should see:")
    st.markdown("- **Vibranium blue colors** (#00d4ff)")
    st.markdown("- **Blue borders** on buttons and metrics below")
    st.markdown("- **Orbitron font** in headings")
    st.markdown("- **Captain America shield** in sidebar (expand it!)")

    st.markdown("---")

    # Create elements that should be styled
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Test Metric 1", "1,234", "+5.6%")

    with col2:
        st.metric("Test Metric 2", "$56,789", "-2.3%")

    with col3:
        st.metric("Test Metric 3", "99.9%", "+0.1%")

    st.markdown("---")

    if st.button("Test Button - Should be Blue Gradient"):
        st.balloons()
        st.success("Button works! Did it have vibranium blue colors?")

    # Sidebar test
    with st.sidebar:
        st.markdown("### 🛡️ Sidebar Test")
        show_shield_logo(width=120, animate=True, centered=True)
        st.markdown("**Shield should appear above**")

        # Theme selector
        from ui.branding import create_theme_switcher
        theme_manager = create_theme_switcher()

except ImportError as e:
    st.error(f"❌ Failed to import branding: {e}")
    import traceback
    st.code(traceback.format_exc())
