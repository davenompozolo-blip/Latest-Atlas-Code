"""
ATLAS Terminal - Sidebar Navigation Component
Matches design spec: 200px sidebar, grouped sections, indigo active indicator.
"""

import streamlit as st


def render_sidebar_navigation(default_page: str = "Portfolio Home") -> str:
    """
    Renders sidebar navigation matching the ATLAS design spec exactly.
    200px width, sections (CORE/MARKETS/ANALYSIS), indigo dot + left border active state.
    """

    NAV_SECTIONS = {
        "Core": [
            {"key": "🔥 Phoenix Parser", "label": "Phoenix Parser"},
            {"key": "🏠 Portfolio Home", "label": "Portfolio Home"},
            {"key": "🚀 v10.0 Analytics", "label": "v10.0 Analytics"},
            {"key": "📊 R Analytics", "label": "R Analytics"},
            {"key": "💾 Database", "label": "Database"},
        ],
        "Markets": [
            {"key": "🌍 Market Watch", "label": "Market Watch"},
            {"key": "🌐 Market Regime", "label": "Market Regime"},
            {"key": "📈 Risk Analysis", "label": "Risk Analysis"},
        ],
        "Analysis": [
            {"key": "💎 Performance Suite", "label": "Performance Suite"},
            {"key": "🔬 Portfolio Deep Dive", "label": "Portfolio Deep Dive"},
            {"key": "📊 Multi-Factor Analysis", "label": "Multi-Factor Analysis"},
            {"key": "💰 Valuation House", "label": "Valuation House"},
            {"key": "🎲 Monte Carlo Engine", "label": "Monte Carlo Engine"},
            {"key": "🧮 Quant Optimizer", "label": "Quant Optimizer"},
            {"key": "📊 Leverage Tracker", "label": "Leverage Tracker"},
            {"key": "📡 Investopedia Live", "label": "Investopedia Live"},
        ],
    }

    if "atlas_selected_page" not in st.session_state:
        for items in NAV_SECTIONS.values():
            for item in items:
                if item["label"] == default_page:
                    st.session_state["atlas_selected_page"] = item["key"]
                    break
        if "atlas_selected_page" not in st.session_state:
            st.session_state["atlas_selected_page"] = "🏠 Portfolio Home"

    selected = st.session_state["atlas_selected_page"]

    with st.sidebar:
        # Sidebar button CSS — make buttons look like nav items from the spec
        st.markdown("""<style>
        /* Nav buttons in sidebar — match design spec nav-item style */
        div[data-testid="stSidebar"] .stButton > button {
            background: transparent !important;
            border: none !important;
            border-left: 2px solid transparent !important;
            color: rgba(255,255,255,0.52) !important;
            font-size: 11.5px !important;
            font-family: 'DM Sans', sans-serif !important;
            padding: 7px 16px !important;
            text-align: left !important;
            width: 100% !important;
            justify-content: flex-start !important;
            border-radius: 0 !important;
            margin: 0 !important;
            font-weight: 400 !important;
            min-height: 0 !important;
            height: auto !important;
            line-height: 1.3 !important;
            letter-spacing: 0.1px !important;
            transition: all 0.2s ease !important;
        }
        div[data-testid="stSidebar"] .stButton > button:hover {
            color: rgba(255,255,255,0.92) !important;
            background: rgba(255,255,255,0.05) !important;
            border-left-color: rgba(255,255,255,0.15) !important;
        }
        div[data-testid="stSidebar"] .stButton > button:focus {
            box-shadow: none !important;
            outline: none !important;
        }
        </style>""", unsafe_allow_html=True)

        # ── ATLAS Logo ──
        st.markdown("""
        <div style="padding: 0 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.07); margin-bottom: 8px;">
            <div style="font-family: 'Syne', sans-serif; font-size: 17px; font-weight: 700;
                        letter-spacing: 3px; color: #00d4ff;
                        text-shadow: 0 0 20px rgba(0, 212, 255, 0.4);">ATLAS</div>
            <div style="font-size: 9px; color: rgba(255,255,255,0.28);
                        letter-spacing: 1.5px; text-transform: uppercase; margin-top: 2px;">Analytics Terminal</div>
        </div>
        """, unsafe_allow_html=True)

        # ── Render Sections ──
        for section_name, items in NAV_SECTIONS.items():
            # Section header
            st.markdown(f'''
            <div style="padding: 10px 16px 3px; font-size: 8.5px; letter-spacing: 2px;
                        text-transform: uppercase; color: rgba(255,255,255,0.28);">
                {section_name}
            </div>''', unsafe_allow_html=True)

            for item in items:
                is_active = item["key"] == selected
                if is_active:
                    # Active state — indigo left border + indigo dot + bright text
                    # Also render right-side glow marker
                    st.markdown(f'''
                    <div style="display: flex; align-items: center; gap: 8px;
                                padding: 7px 16px; font-size: 11.5px;
                                line-height: 1.3; letter-spacing: 0.1px;
                                color: rgba(255,255,255,0.92); cursor: default;
                                background: rgba(99,102,241,0.1);
                                border-left: 2px solid #6366f1;
                                position: relative;">
                        <div style="width: 5px; height: 5px; border-radius: 50%;
                                    background: #6366f1; flex-shrink: 0;"></div>
                        <span style="font-family: 'DM Sans', sans-serif;">{item['label']}</span>
                        <div style="position: absolute; right: 0; top: 20%; width: 3px; height: 60%;
                                    background: #6366f1; border-radius: 2px 0 0 2px; opacity: 0.5;"></div>
                    </div>''', unsafe_allow_html=True)
                else:
                    # Inactive — clickable button with dot prefix
                    if st.button(f"●  {item['label']}", key=f"nav_{item['key']}", use_container_width=True):
                        st.session_state["atlas_selected_page"] = item["key"]
                        st.rerun()

    return selected
