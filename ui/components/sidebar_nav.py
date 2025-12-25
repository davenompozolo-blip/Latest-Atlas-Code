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
        st.markdown("""
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&display=swap');
            </style>
            <div style='
                text-align: center;
                padding: 1rem 0 0.75rem 0;
                border-bottom: 1px solid rgba(99, 102, 241, 0.15);
                margin-bottom: 0.75rem;
            '>
                <h1 style='
                    font-family: "Orbitron", monospace;
                    font-size: 1.1rem;
                    font-weight: 900;
                    letter-spacing: 0.15em;
                    margin: 0;
                    color: transparent;
                    -webkit-text-stroke: 1.5px #00d4ff;
                    text-stroke: 1.5px #00d4ff;
                    text-shadow:
                        0 0 10px #00d4ff,
                        0 0 20px #00d4ff,
                        0 0 30px #00d4ff,
                        0 0 40px #6366f1,
                        0 0 70px #8b5cf6,
                        0 0 80px #8b5cf6;
                    filter: brightness(1.2);
                '>ATLAS</h1>
                <p style='
                    color: #64748b;
                    font-size: 0.65rem;
                    margin: 0.15rem 0 0 0;
                    font-weight: 400;
                    letter-spacing: 0.05em;
                '>Analytics Terminal</p>
            </div>
        """, unsafe_allow_html=True)

        # ==================== MAIN NAVIGATION MENU ====================
        selected = option_menu(
            menu_title=None,
            options=[
                "🔥 Phoenix Parser",
                "🏠 Portfolio Home",
                "🔍 Portfolio Deep Dive",
                "📊 Performance Suite",
                "📈 Multi-Factor Analysis",
                "📉 R Analytics",
                "🔬 Valuation House",
                "🎲 Monte Carlo Engine",
                "⚖️ Quant Optimizer",
                "📊 Leverage Tracker",
                "📡 Risk Analysis",
                "💾 Database",
                "🌐 Market Watch",
                "📚 Investopedia Live",
                "ℹ️ About"
            ],
            icons=[
                "fire", "house", "search", "bar-chart", "graph-up",
                "activity", "currency-dollar", "dice-5", "sliders",
                "speedometer", "shield-check", "database", "globe",
                "book", "info-circle"
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

        # ==================== SIDEBAR FOOTER ====================
        st.markdown("""
            <div style='
                position: fixed;
                bottom: 0.5rem;
                left: 0.5rem;
                width: calc(100% - 1rem);
                text-align: center;
                color: #64748b;
                font-size: 0.65rem;
                padding: 0.5rem;
                background: rgba(21, 25, 50, 0.9);
                backdrop-filter: blur(10px);
                border-radius: 0.5rem;
                border: 1px solid rgba(99, 102, 241, 0.1);
            '>
                <p style='margin: 0; font-weight: 500; font-size: 0.65rem;'>
                    Built with <span style='color: #ef4444;'>❤️</span> by Hlobo
                </p>
                <p style='margin: 0.15rem 0 0 0; font-size: 0.6rem; color: #475569;'>
                    Powered by Streamlit
                </p>
            </div>
        """, unsafe_allow_html=True)

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
