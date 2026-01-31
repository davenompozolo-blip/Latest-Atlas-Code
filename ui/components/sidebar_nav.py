"""
ATLAS Terminal - Vertical Sidebar Navigation Component
Fomo-inspired glassmorphic sidebar with gradient accents

Author: Hlobo
Date: December 2024
Phase: 1B - Navigation Transformation
"""

import streamlit as st
from streamlit_option_menu import option_menu


def render_sidebar_navigation(default_page: str = "Portfolio Home") -> str:
    """
    Renders vertical sidebar navigation with Fomo-inspired aesthetics.

    Replaces horizontal option_menu with vertical sidebar layout featuring:
    - Glassmorphic background styling
    - Gradient accent colors (vibranium blue + purple/cyan)
    - Icon + text navigation labels
    - Hover effects and active state highlighting
    - ATLAS branding header
    - Version information footer

    Args:
        default_page (str): Default page to display on load. Default: "Portfolio Home"

    Returns:
        str: Selected page name (matches page handler routing)

    Example:
        >>> page = render_sidebar_navigation(default_page="Portfolio Home")
        >>> if page == "Portfolio Home":
        >>>     # Route to portfolio home handler
    """

    with st.sidebar:
        # ==================== ATLAS BRANDING HEADER ====================
        st.markdown("""<div style="text-align: center; padding: 1rem 0 0.75rem 0; border-bottom: 1px solid rgba(99, 102, 241, 0.15); margin-bottom: 0.75rem;"><div style="font-family: 'JetBrains Mono', monospace; font-size: 1.3rem; font-weight: 700; letter-spacing: 0.12em; margin: 0; color: #22d3ee; line-height: 1.2;">ATLAS</div><div style="font-family: 'JetBrains Mono', monospace; color: rgb(107, 114, 128); font-size: 0.7rem; margin: 0.25rem 0 0 0; font-weight: 400; letter-spacing: 0.05em;">Analytics Terminal</div></div>""", unsafe_allow_html=True)

        # ==================== MAIN NAVIGATION MENU ====================
        selected = option_menu(
            menu_title=None,
            options=[
                "🔥 Phoenix Parser",
                "🏠 Portfolio Home",
                "🚀 v10.0 Analytics",
                "📊 R Analytics",
                "💾 Database",
                "🌍 Market Watch",
                "🌐 Market Regime",
                "📈 Risk Analysis",
                "💎 Performance Suite",
                "🔬 Portfolio Deep Dive",
                "📊 Multi-Factor Analysis",
                "💰 Valuation House",
                "🎲 Monte Carlo Engine",
                "🧮 Quant Optimizer",
                "📊 Leverage Tracker",
                "📡 Investopedia Live"
            ],
            icons=[
                "fire", "house-fill", "rocket-takeoff-fill", "graph-up-arrow",
                "database-fill", "globe", "globe2", "graph-up", "gem", "microscope",
                "bar-chart-fill", "cash-coin", "dice-5-fill", "calculator-fill",
                "graph-up", "broadcast"
            ],
            menu_icon="terminal",
            default_index=1,  # Portfolio Home is default
            orientation="vertical",  # KEY: Changed from "horizontal"
            styles={
                "container": {
                    "padding": "0.25rem 0",
                    "background": "transparent"
                },
                "nav-link": {
                    "font-size": "0.8rem",
                    "text-align": "left",
                    "margin": "0.15rem 0",
                    "padding": "0.55rem 0.75rem",
                    "border-radius": "0.5rem",
                    "background": "rgba(21, 25, 50, 0.6)",
                    "backdrop-filter": "blur(10px)",
                    "border": "1px solid rgba(99, 102, 241, 0.1)",
                    "color": "#94a3b8",
                    "transition": "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                },
                "nav-link-selected": {
                    "background": "linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(139, 92, 246, 0.25))",
                    "border": "1px solid rgba(99, 102, 241, 0.4)",
                    "color": "#f8fafc",
                    "font-weight": "600",
                    "box-shadow": "0 4px 16px rgba(99, 102, 241, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                },
                "nav-link:hover": {
                    "background": "rgba(99, 102, 241, 0.1)",
                    "border-color": "rgba(99, 102, 241, 0.2)",
                    "transform": "translateX(2px)",
                },
                "icon": {
                    "font-size": "0.9rem",
                    "margin-right": "0.6rem",
                },
                "menu-title": {
                    "display": "none"  # Hide menu title
                }
            }
        )

    return selected


# ==================== COMPONENT TESTING ====================
if __name__ == "__main__":
    """
    Test the sidebar navigation component in isolation
    Run with: streamlit run ui/components/sidebar_nav.py
    """
    st.set_page_config(
        page_title="ATLAS - Sidebar Navigation Test",
        page_icon="📊",
        layout="wide",
        initial_sidebar_state="expanded"
    )

    # Test the component
    selected_page = render_sidebar_navigation()

    # Display selected page
    st.title(f"Selected Page: {selected_page}")
    st.info(f"Navigation component is working! Selected: **{selected_page}**")

    # Show component info
    with st.expander("Component Information"):
        st.write("**Component:** Sidebar Navigation")
        st.write("**Location:** ui/components/sidebar_nav.py")
        st.write("**Type:** Vertical navigation menu")
        st.write("**Library:** streamlit-option-menu")
        st.write("**Pages:** 15 total")
        st.write("**Styling:** Fomo-inspired glassmorphism")
        st.write("**Features:**")
        st.write("  - Gradient ATLAS branding header")
        st.write("  - Purple/cyan gradient accents")
        st.write("  - Glassmorphic nav items")
        st.write("  - Hover effects")
        st.write("  - Footer with credits")
