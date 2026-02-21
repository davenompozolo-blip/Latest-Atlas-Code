"""
ATLAS Terminal - CSS Injection Module
Glassmorphism Design System v2.0

Ambient dark UI with frosted-glass panels, indigo/cyan accents,
and seamless transparent chart integration.

Call init_atlas_css() once at app startup to inject all styles.
"""

import streamlit as st


# ============================================================
# SECTION 1 — PREMIUM LAYOUT (chrome removal, zero-padding)
# ============================================================

def apply_premium_layout_css():
    """Premium layout: remove Streamlit chrome, zero-padding, responsive metric cards."""
    st.markdown("""
<style>
/* ===== REMOVE STREAMLIT CHROME (BUT PRESERVE SIDEBAR TOGGLE) ===== */
header[data-testid="stHeader"] {
    background: transparent !important;
    backdrop-filter: none !important;
}

header[data-testid="stHeader"] > div:not(:has(button[kind="header"])) {
    display: none !important;
}

button[kind="header"],
button[data-testid="baseButton-header"],
button[data-testid="collapsedControl"] {
    display: flex !important;
    visibility: visible !important;
    opacity: 1 !important;
    position: fixed !important;
    top: 1rem !important;
    left: 1rem !important;
    z-index: 999999 !important;
    background: rgba(99, 102, 241, 0.12) !important;
    border: 1px solid rgba(99, 102, 241, 0.3) !important;
    border-radius: 12px !important;
    padding: 0.75rem !important;
    width: 44px !important;
    height: 44px !important;
    cursor: pointer !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    backdrop-filter: blur(16px) !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25) !important;
}

button[kind="header"]:hover,
button[data-testid="baseButton-header"]:hover,
button[data-testid="collapsedControl"]:hover {
    background: rgba(99, 102, 241, 0.22) !important;
    border-color: rgba(99, 102, 241, 0.5) !important;
    box-shadow: 0 6px 24px rgba(99, 102, 241, 0.3),
                0 0 32px rgba(99, 102, 241, 0.15) !important;
    transform: scale(1.05) !important;
}

button[kind="header"] svg,
button[data-testid="baseButton-header"] svg,
button[data-testid="collapsedControl"] svg {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    color: #e2e8f0 !important;
    fill: #e2e8f0 !important;
    width: 22px !important;
    height: 22px !important;
}

button[kind="header"]:hover svg,
button[data-testid="baseButton-header"]:hover svg,
button[data-testid="collapsedControl"]:hover svg {
    color: #818cf8 !important;
    fill: #818cf8 !important;
    filter: drop-shadow(0 0 6px rgba(129, 140, 248, 0.6)) !important;
}

footer { display: none !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
.stDeployButton { display: none !important; }
.stMainBlockContainer { padding-bottom: 0 !important; }
div[data-testid="stBottom"] { display: none !important; visibility: hidden !important; height: 0 !important; }
[data-testid="stStatusWidget"] { display: none !important; }
[data-testid="manage-app-button"] { display: none !important; }
[data-testid="stToolbar"] { display: none !important; }
.stAppToolbar { display: none !important; }
#MainMenu { display: none !important; }

/* ===== ZERO PADDING MAIN CONTAINER ===== */
.main { padding: 0 !important; margin: 0 !important; }
.main .block-container,
.stApp .main .block-container,
div[data-testid="stAppViewContainer"] .main .block-container {
    max-width: 100% !important;
    padding: 0.25rem 0.5rem !important;
    margin: 0 !important;
    padding-top: 0 !important;
}
section.main > div,
div[data-testid="stAppViewContainer"] section.main > div {
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
}

/* ===== FIRST ELEMENT TOUCHES TOP ===== */
.main .block-container > div:first-child { margin-top: 0 !important; padding-top: 0 !important; }

/* ===== ULTRA-TIGHT SPACING ===== */
.element-container { margin-bottom: 0.25rem !important; margin-top: 0 !important; width: 100% !important; }
.row-widget { margin: 0 !important; padding: 0 !important; width: 100% !important; }
.row-widget > div { padding: 0 0.15rem !important; }
.row-widget > div:first-child { padding-left: 0 !important; }
.row-widget > div:last-child { padding-right: 0 !important; }

/* ===== COLUMNS TOUCH EDGES ===== */
div[data-testid="column"] { padding: 0 0.15rem !important; }
div[data-testid="column"]:first-child { padding-left: 0 !important; }
div[data-testid="column"]:last-child { padding-right: 0 !important; }

/* ===== WIDER SIDEBAR (280px) ===== */
[data-testid="stSidebar"] { width: 280px !important; min-width: 280px !important; }
[data-testid="stSidebar"] > div:first-child { width: 280px !important; }
[data-testid="stSidebar"] .element-container { margin-bottom: 0.25rem !important; }

/* ===== FULL WIDTH COMPONENTS ===== */
.stColumn, .stColumns { width: 100% !important; }
.js-plotly-plot, .plotly, .stDataFrame { width: 100% !important; }

/* ===== COMPACT COMPONENTS ===== */
div[data-testid="stMetricValue"] { font-size: 1.4rem !important; }
div[data-testid="stMetricLabel"] { font-size: 0.8rem !important; }
.streamlit-expanderHeader, .streamlit-expanderContent { padding: 0.3rem !important; }
.stTabs [data-baseweb="tab-list"] { gap: 0.3rem !important; }
.stTabs [data-baseweb="tab"] { padding: 0.3rem 0.6rem !important; }
hr { margin: 0.25rem 0 !important; }

/* ===== RESPONSIVE METRIC CARDS ===== */
div[data-testid="column"] p[style*="text-transform: uppercase"] {
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    font-size: clamp(0.5rem, 0.9vw, 0.65rem) !important;
}

div[data-testid="column"] h3[style*="font-weight: 800"] {
    font-size: clamp(1.4rem, 2.2vw, 2.5rem) !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}

div[data-testid="column"] > div > div > div[style*="backdrop-filter"] {
    padding: clamp(1rem, 1.5vw, 1.75rem) clamp(0.75rem, 1.2vw, 1.5rem) !important;
    min-height: clamp(140px, 15vw, 200px) !important;
    border-radius: 16px !important;
}

div[data-testid="column"] div[style*="border-radius: 10px"] p,
div[data-testid="column"] div[style*="border-radius: 12px"] p {
    font-size: clamp(0.55rem, 0.8vw, 0.7rem) !important;
    white-space: nowrap !important;
}

div[data-testid="column"] h3[style*="font-size: 2.75rem"] {
    font-size: clamp(1.6rem, 2.5vw, 2.75rem) !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}

/* ===== RESPONSIVE BREAKPOINTS ===== */
@media (max-width: 1599px) {
    div[data-testid="column"] h3[style*="font-weight: 800"] {
        font-size: clamp(1.2rem, 2vw, 1.8rem) !important;
    }
    div[data-testid="column"] h3[style*="font-size: 2.75rem"] {
        font-size: clamp(1.4rem, 2.2vw, 2rem) !important;
    }
}

@media (max-width: 1199px) {
    div[data-testid="column"] p[style*="text-transform: uppercase"] {
        font-size: 0.55rem !important;
        letter-spacing: 0.04em !important;
    }
    div[data-testid="column"] h3[style*="font-weight: 800"] {
        font-size: 1.1rem !important;
    }
    div[data-testid="column"] > div > div > div[style*="backdrop-filter"] {
        padding: 0.75rem !important;
        min-height: 120px !important;
    }
}

/* ===== COMPACT SECTION HEADERS ===== */
h2[style*="font-size: 1.5rem"] {
    font-size: clamp(1rem, 1.4vw, 1.5rem) !important;
    margin-bottom: 0.75rem !important;
    margin-top: 0.5rem !important;
}
</style>
""", unsafe_allow_html=True)


# ============================================================
# SECTION 2 — FULL-WIDTH JS ENFORCEMENT
# ============================================================

def apply_full_width_js():
    """Full-width enforcement via JavaScript MutationObserver."""
    st.html("""
<script>
(function() {
    function forceFullWidth() {
        document.querySelectorAll('[data-testid="stMainBlockContainer"], .stMainBlockContainer').forEach(function(el) {
            el.style.setProperty('max-width', '100%', 'important');
            el.style.setProperty('width', '100%', 'important');
            el.style.setProperty('margin', '0', 'important');
        });
        document.querySelectorAll('.block-container').forEach(function(el) {
            el.style.setProperty('max-width', '100%', 'important');
            el.style.setProperty('width', '100%', 'important');
        });
        document.querySelectorAll('section.main > div').forEach(function(el) {
            el.style.setProperty('max-width', '100%', 'important');
            el.style.setProperty('width', '100%', 'important');
        });
        document.querySelectorAll('[style*="max-width"]').forEach(function(el) {
            if (!el.closest('[data-testid="stSidebar"]')) {
                el.style.setProperty('max-width', '100%', 'important');
            }
        });
    }
    forceFullWidth();
    window.addEventListener('load', function() {
        forceFullWidth();
        setTimeout(forceFullWidth, 100);
        setTimeout(forceFullWidth, 500);
        setTimeout(forceFullWidth, 1000);
    });
    var observer = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
            if (mutations[i].attributeName === 'style' || mutations[i].addedNodes.length > 0) {
                forceFullWidth();
                return;
            }
        }
    });
    if (document.body) {
        observer.observe(document.body, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
    }
})();
</script>
""", unsafe_allow_html=True)


# ============================================================
# SECTION 3 — FIGMA CHART BORDERS & DROPDOWNS
# ============================================================

def apply_figma_borders_css():
    """Figma redesign: glassmorphic chart containers, selectbox/dropdown styling."""
    st.markdown("""
<style>
/* ===== GLASSMORPHIC CHART CONTAINERS ===== */
.stPlotlyChart {
    border: 1px solid rgba(99, 102, 241, 0.15) !important;
    border-radius: 16px !important;
    padding: 4px !important;
    margin: 8px 0 !important;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3),
                inset 0 1px 0 rgba(255, 255, 255, 0.03) !important;
    background: rgba(15, 18, 35, 0.45) !important;
    backdrop-filter: blur(12px) saturate(140%) !important;
    -webkit-backdrop-filter: blur(12px) saturate(140%) !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    overflow: visible !important;
}

.stPlotlyChart > div {
    height: 100% !important;
    overflow: visible !important;
}

.stPlotlyChart iframe,
.stPlotlyChart .js-plotly-plot {
    overflow: visible !important;
}

.stPlotlyChart:hover {
    border-color: rgba(99, 102, 241, 0.3) !important;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4),
                0 0 20px rgba(99, 102, 241, 0.08),
                inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
}

/* Plotly modebar */
.modebar-container {
    background: transparent !important;
}

.modebar-group .modebar-btn path {
    fill: rgba(255, 255, 255, 0.5) !important;
}

.modebar-group .modebar-btn:hover path {
    fill: #818cf8 !important;
}

/* Major Indices chart containers */
.major-indices-container .stPlotlyChart {
    border: 1px solid rgba(99, 102, 241, 0.15) !important;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3) !important;
    background: rgba(15, 18, 35, 0.45) !important;
}

.major-indices-container .stPlotlyChart:hover {
    border: 1px solid rgba(99, 102, 241, 0.3) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
}

/* ===== DROPDOWN / SELECTBOX TEXT VISIBILITY ===== */

.stSelectbox {
    color: #FFFFFF !important;
}

.stSelectbox [data-baseweb="select"] {
    background-color: rgba(15, 18, 35, 0.7) !important;
    border-color: rgba(99, 102, 241, 0.2) !important;
    backdrop-filter: blur(12px) !important;
}

.stSelectbox [data-baseweb="select"] span {
    color: #FFFFFF !important;
}

.stSelectbox [data-baseweb="select"] input {
    color: #FFFFFF !important;
    -webkit-text-fill-color: #FFFFFF !important;
}

.stSelectbox [data-baseweb="select"] > div {
    color: #FFFFFF !important;
    background-color: rgba(15, 18, 35, 0.7) !important;
}

.stSelectbox [data-baseweb="select"] [data-testid="stSelectbox"] {
    color: #FFFFFF !important;
}

.stSelectbox div[data-baseweb="select"] div[aria-selected="true"],
.stSelectbox div[data-baseweb="select"] div[class*="singleValue"],
.stSelectbox div[data-baseweb="select"] div[class*="placeholder"] {
    color: #FFFFFF !important;
}

.stSelectbox svg {
    fill: #FFFFFF !important;
}

.stSelectbox label {
    color: #FFFFFF !important;
    font-weight: 500 !important;
}

/* Dropdown popover/menu */
[data-baseweb="popover"],
[data-baseweb="menu"],
[data-baseweb="select"] [data-baseweb="popover"] {
    background-color: rgba(15, 18, 35, 0.92) !important;
    border: 1px solid rgba(99, 102, 241, 0.2) !important;
    backdrop-filter: blur(20px) !important;
}

[data-baseweb="menu"] ul,
[data-baseweb="popover"] ul {
    background-color: rgba(15, 18, 35, 0.92) !important;
}

[data-baseweb="menu"] li,
[data-baseweb="popover"] li,
[role="option"] {
    background-color: transparent !important;
    color: #FFFFFF !important;
}

[data-baseweb="menu"] li:hover,
[data-baseweb="popover"] li:hover,
[role="option"]:hover {
    background-color: rgba(99, 102, 241, 0.15) !important;
    color: #818cf8 !important;
}

[role="option"][aria-selected="true"] {
    background-color: rgba(99, 102, 241, 0.2) !important;
    color: #a5b4fc !important;
}

/* Multiselect */
.stMultiSelect [data-baseweb="select"] {
    background-color: rgba(15, 18, 35, 0.7) !important;
}

.stMultiSelect [data-baseweb="select"] > div {
    background-color: rgba(15, 18, 35, 0.7) !important;
    color: #FFFFFF !important;
}

.stMultiSelect [data-baseweb="tag"] {
    background-color: rgba(99, 102, 241, 0.2) !important;
    color: #FFFFFF !important;
    border: 1px solid rgba(99, 102, 241, 0.3) !important;
}

.stMultiSelect [data-baseweb="tag"] span {
    color: #FFFFFF !important;
}

.stMultiSelect [data-baseweb="tag"] svg,
.stMultiSelect [data-baseweb="tag"] [role="button"] {
    color: #FFFFFF !important;
    fill: #FFFFFF !important;
    opacity: 0.8 !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
}

.stMultiSelect [data-baseweb="tag"] svg:hover,
.stMultiSelect [data-baseweb="tag"] [role="button"]:hover {
    opacity: 1 !important;
    color: #ef4444 !important;
    fill: #ef4444 !important;
}

/* Better padding */
.stSelectbox [data-baseweb="select"] > div {
    padding: 8px 12px !important;
    min-height: 42px !important;
}

[data-baseweb="menu"] li,
[role="option"] {
    padding: 10px 16px !important;
    line-height: 1.4 !important;
}

.stMultiSelect [data-baseweb="tag"] {
    padding: 4px 8px !important;
    margin: 2px 4px 2px 0 !important;
    gap: 6px !important;
    border-radius: 6px !important;
}

.stSelectbox *,
.stMultiSelect * {
    overflow: visible !important;
}
</style>
""", unsafe_allow_html=True)


# ============================================================
# SECTION 4 — GLASSMORPHISM CORE (fonts, background, cards,
#              typography, metrics, buttons, inputs, tabs,
#              expanders, scrollbar, effects, responsive)
# ============================================================

def apply_glassmorphism_css():
    """Modern glassmorphism design system: frosted-glass panels, indigo/cyan palette."""
    st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');

    /* ============================================
       CORE FOUNDATIONS — Glassmorphism v2
       ============================================ */

    * {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }

    h1, h2, h3, h4, h5, h6 {
        font-family: 'JetBrains Mono', monospace !important;
    }

    code, pre, .monospace {
        font-family: 'JetBrains Mono', monospace !important;
    }

    /* ===== AMBIENT DARK BACKGROUND ===== */
    .stApp {
        background: radial-gradient(ellipse 120% 80% at 50% 0%, #0f1225 0%, #080a14 50%, #060810 100%) !important;
        background-attachment: fixed !important;
    }

    .main {
        background: transparent !important;
        background-attachment: fixed;
    }

    /* Subtle noise texture for depth */
    .main::before {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: 0.025;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        pointer-events: none;
        z-index: 1;
    }

    .block-container {
        position: relative !important;
        z-index: 100 !important;
        padding-top: 2rem !important;
        padding-bottom: 3rem !important;
        max-width: 1400px !important;
    }

    .block-container * {
        max-width: 100%;
        overflow-wrap: break-word;
        word-wrap: break-word;
    }

    div[style*="display: inline-flex"],
    div[style*="display:inline-flex"] {
        flex-wrap: wrap !important;
        overflow: hidden !important;
    }

    /* ============================================
       GLASSMORPHIC CARDS — Frosted panels
       ============================================ */

    div[data-testid="stMetric"],
    .stExpander {
        background: rgba(15, 18, 35, 0.45) !important;
        backdrop-filter: blur(20px) saturate(160%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(160%) !important;
        border: 1px solid rgba(99, 102, 241, 0.12) !important;
        border-radius: 16px !important;
        padding: 24px !important;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3),
                    inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    div[data-testid="stMetric"]:hover,
    .stExpander:hover {
        transform: translateY(-2px) !important;
        border-color: rgba(99, 102, 241, 0.25) !important;
        box-shadow: 0 8px 40px rgba(0, 0, 0, 0.4),
                    0 0 20px rgba(99, 102, 241, 0.06),
                    inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
    }

    /* ============================================
       TYPOGRAPHY — JetBrains Mono headings
       ============================================ */

    h1 {
        font-family: 'JetBrains Mono', monospace !important;
        font-weight: 600 !important;
        font-size: 1.75rem !important;
        letter-spacing: 0.05em !important;
        line-height: 1.2 !important;
        margin-bottom: 0.5em !important;
        color: #a5b4fc !important;
        background: none !important;
        -webkit-text-fill-color: #a5b4fc !important;
        text-shadow: 0 0 30px rgba(99, 102, 241, 0.25) !important;
    }

    h2 {
        font-family: 'JetBrains Mono', monospace !important;
        font-weight: 500 !important;
        font-size: 1.125rem !important;
        color: rgb(229, 231, 235) !important;
        letter-spacing: 0.025em !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.75em !important;
        position: relative;
        padding-left: 0 !important;
    }

    h2::before {
        display: none !important;
        content: none !important;
    }

    div[style*="backdrop-filter"] h2::before,
    div[style*="border-radius: 24px"] h2::before,
    div[style*="border-radius: 20px"] h2::before,
    .stMarkdown div[style*="background:"] h2::before {
        display: none !important;
        content: none !important;
    }

    h3 {
        font-family: 'JetBrains Mono', monospace !important;
        font-weight: 500 !important;
        font-size: 1rem !important;
        color: rgb(156, 163, 175) !important;
        letter-spacing: 0.025em !important;
        margin-top: 1.2em !important;
        margin-bottom: 0.6em !important;
    }

    h4, h5, h6 {
        font-family: 'JetBrains Mono', monospace !important;
        font-weight: 500 !important;
        font-size: 0.875rem !important;
        color: rgb(156, 163, 175) !important;
        letter-spacing: 0.025em !important;
    }

    p {
        font-size: 1.05em !important;
        line-height: 1.7 !important;
        color: #94a3b8 !important;
        font-weight: 400 !important;
    }

    /* ============================================
       METRICS — Glassmorphic number display
       ============================================ */

    div[data-testid="stMetric"] {
        background: rgba(15, 18, 35, 0.5) !important;
        position: relative;
        overflow: hidden;
    }

    div[data-testid="stMetric"]::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%);
        opacity: 0;
        transition: opacity 0.4s ease;
    }

    div[data-testid="stMetric"]:hover::before {
        opacity: 1;
    }

    div[data-testid="stMetric"] label {
        font-size: 0.85em !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.1em !important;
        color: #64748b !important;
        margin-bottom: 8px !important;
    }

    div[data-testid="stMetric"] [data-testid="stMetricValue"] {
        font-size: 1.8em !important;
        font-weight: 800 !important;
        background: linear-gradient(135deg, #f8fafc 0%, #a5b4fc 100%);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: -0.02em !important;
    }

    div[data-testid="stMetric"] [data-testid="stMetricDelta"] {
        font-size: 1em !important;
        font-weight: 600 !important;
        margin-top: 4px !important;
    }

    /* ============================================
       BUTTONS — Indigo gradient interactive
       ============================================ */

    .stButton > button {
        background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%) !important;
        color: #ffffff !important;
        border: none !important;
        border-radius: 12px !important;
        padding: 14px 32px !important;
        font-weight: 700 !important;
        font-size: 15px !important;
        letter-spacing: 0.05em !important;
        text-transform: uppercase !important;
        box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3) !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        position: relative !important;
        overflow: hidden !important;
    }

    .stButton > button::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        transform: translate(-50%, -50%);
        transition: width 0.6s, height 0.6s;
    }

    .stButton > button:hover::before {
        width: 300px;
        height: 300px;
    }

    .stButton > button:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4) !important;
    }

    .stButton > button:active {
        transform: translateY(0) !important;
    }

    /* ============================================
       INPUTS — Glassmorphic form elements
       ============================================ */

    input[type="text"],
    input[type="number"],
    textarea,
    .stTextInput > div > div > input,
    .stNumberInput > div > div > input {
        background: rgba(15, 18, 35, 0.5) !important;
        border: 1px solid rgba(99, 102, 241, 0.15) !important;
        border-radius: 10px !important;
        color: #ffffff !important;
        padding: 12px 16px !important;
        font-size: 15px !important;
        font-weight: 500 !important;
        transition: all 0.3s ease !important;
        backdrop-filter: blur(8px) !important;
    }

    input:focus,
    textarea:focus {
        border-color: #6366f1 !important;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12) !important;
        outline: none !important;
        background: rgba(15, 18, 35, 0.7) !important;
    }

    /* ============================================
       TABS — Frosted-glass navigation
       ============================================ */

    .stTabs [data-baseweb="tab-list"] {
        gap: 8px !important;
        background: rgba(15, 18, 35, 0.3) !important;
        padding: 8px !important;
        border-radius: 12px !important;
        border: 1px solid rgba(99, 102, 241, 0.08) !important;
        backdrop-filter: blur(12px) !important;
    }

    .stTabs [data-baseweb="tab"] {
        background: transparent !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 12px 24px !important;
        font-weight: 600 !important;
        font-size: 14px !important;
        color: #64748b !important;
        transition: all 0.3s ease !important;
    }

    .stTabs [data-baseweb="tab"]:hover {
        background: rgba(99, 102, 241, 0.08) !important;
        color: #a5b4fc !important;
    }

    .stTabs [aria-selected="true"] {
        background: rgba(99, 102, 241, 0.15) !important;
        color: #a5b4fc !important;
        border: 1px solid rgba(99, 102, 241, 0.25) !important;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.12) !important;
    }

    /* ============================================
       LAYOUT — Sidebar & stretch
       ============================================ */

    section[data-testid="stSidebar"] {
        display: block !important;
        width: 280px !important;
        min-width: 280px !important;
        background: rgba(10, 12, 24, 0.85) !important;
        backdrop-filter: blur(24px) saturate(150%) !important;
        -webkit-backdrop-filter: blur(24px) saturate(150%) !important;
        border-right: 1px solid rgba(99, 102, 241, 0.08) !important;
    }

    [data-testid="stSidebar"] > div:first-child {
        width: 280px !important;
        background: transparent !important;
    }

    [data-testid="collapsedControl"] {
        display: block !important;
    }

    .main .block-container {
        max-width: 100% !important;
        padding: 1rem 2rem !important;
    }

    .main {
        padding: 0 !important;
        min-height: 100vh;
    }

    .element-container {
        margin-bottom: 0.5rem !important;
    }

    .row-widget {
        margin: 0 !important;
    }

    .row-widget > div {
        padding: 0 0.5rem !important;
    }

    .stColumn {
        padding: 0 0.5rem !important;
    }

    header[data-testid="stHeader"] {
        display: none;
    }

    [data-testid="stSidebar"] .element-container {
        margin-bottom: 0.25rem !important;
    }

    /* ============================================
       NAVIGATION — Responsive horizontal
       ============================================ */

    h1 {
        font-weight: 600;
        margin-top: 0.5rem !important;
        margin-bottom: 1rem !important;
        background: linear-gradient(135deg, #818cf8 0%, #a5b4fc 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    nav[role="navigation"] {
        overflow-x: auto;
        white-space: nowrap;
    }

    nav[role="navigation"]::-webkit-scrollbar {
        height: 6px;
    }

    nav[role="navigation"]::-webkit-scrollbar-thumb {
        background-color: rgba(99, 102, 241, 0.3);
        border-radius: 3px;
    }

    nav[role="navigation"]::-webkit-scrollbar-track {
        background-color: rgba(15, 18, 35, 0.2);
    }

    [data-testid="metric-container"] {
        background-color: rgba(15, 18, 35, 0.4);
        border: 1px solid rgba(99, 102, 241, 0.12);
        padding: 15px;
        border-radius: 12px;
    }

    /* ============================================
       EXPANDERS — Collapsible glassmorphic sections
       ============================================ */

    .streamlit-expanderHeader {
        background: rgba(15, 18, 35, 0.4) !important;
        border: 1px solid rgba(99, 102, 241, 0.12) !important;
        border-radius: 10px !important;
        padding: 16px !important;
        font-weight: 600 !important;
        font-size: 15px !important;
        color: #a5b4fc !important;
        transition: all 0.3s ease !important;
    }

    .streamlit-expanderHeader:hover {
        background: rgba(99, 102, 241, 0.08) !important;
        border-color: rgba(99, 102, 241, 0.25) !important;
    }

    /* ===== Expander icon/text overlap fix ===== */

    [data-testid="stExpander"] details summary {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        min-height: 48px !important;
    }

    [data-testid="stExpander"] details summary svg,
    [data-testid="stExpander"] details summary .streamlit-expanderHeader svg,
    .streamlit-expanderHeader svg {
        flex-shrink: 0 !important;
        min-width: 20px !important;
        min-height: 20px !important;
        margin-right: 8px !important;
    }

    [data-testid="stExpander"] details summary > div,
    [data-testid="stExpander"] details summary .streamlit-expanderHeader {
        flex: 1 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
    }

    [data-testid="stExpander"] details summary:hover > div {
        overflow: visible !important;
        white-space: normal !important;
        position: relative !important;
        z-index: 1000 !important;
    }

    [data-testid="stExpander"] {
        width: 100% !important;
    }

    /* ============================================
       PROGRESS BARS — Indigo animated
       ============================================ */

    .stProgress > div > div > div {
        background: linear-gradient(90deg, #6366f1, #818cf8, #6366f1) !important;
        background-size: 200% auto !important;
        animation: shimmer 2s linear infinite !important;
        border-radius: 10px !important;
        height: 8px !important;
    }

    @keyframes shimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
    }

    /* ============================================
       ALERTS & NOTIFICATIONS
       ============================================ */

    .stAlert {
        background: rgba(15, 18, 35, 0.5) !important;
        border-left: 4px solid #6366f1 !important;
        border-radius: 10px !important;
        padding: 16px 20px !important;
        backdrop-filter: blur(10px) !important;
    }

    .stSuccess {
        border-left-color: #10b981 !important;
    }

    .stError {
        border-left-color: #ef4444 !important;
    }

    .stWarning {
        border-left-color: #f59e0b !important;
    }

    /* ============================================
       SELECTBOX — Glassmorphic dropdowns
       ============================================ */

    div[data-baseweb="select"] > div {
        background: rgba(15, 18, 35, 0.5) !important;
        border: 1px solid rgba(99, 102, 241, 0.15) !important;
        border-radius: 10px !important;
        min-height: 48px !important;
        backdrop-filter: blur(8px) !important;
    }

    div[data-baseweb="select"]:hover > div {
        border-color: rgba(99, 102, 241, 0.3) !important;
    }

    /* ============================================
       ICON TEXT OVERLAP FIX
       ============================================ */

    /* Hide the entire icon container in expanders */
    [data-testid="stExpander"] summary svg,
    [data-testid="stExpander"] summary [data-baseweb="icon"],
    [data-testid="stExpander"] summary span[role="img"],
    .streamlit-expanderHeader svg,
    .streamlit-expanderHeader [data-baseweb="icon"],
    .streamlit-expanderHeader span[role="img"] {
        display: none !important;
        visibility: hidden !important;
    }

    [data-testid="stExpander"] summary {
        position: relative !important;
        padding-left: 30px !important;
    }

    [data-testid="stExpander"] summary::before {
        content: '▶' !important;
        position: absolute !important;
        left: 8px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        font-size: 14px !important;
        color: rgba(99, 102, 241, 0.6) !important;
        transition: transform 0.2s ease !important;
        font-family: Arial, sans-serif !important;
    }

    [data-testid="stExpander"][open] summary::before {
        transform: translateY(-50%) rotate(90deg) !important;
    }

    [data-testid="stExpander"] summary *:not(div):not(p) {
        font-size: 0 !important;
    }

    [data-testid="stExpander"] summary > div {
        font-size: 15px !important;
    }

    /* Select/Dropdown icons */
    div[data-baseweb="select"] svg,
    div[data-baseweb="select"] [data-baseweb="icon"],
    div[data-baseweb="select"] [role="presentation"] {
        display: none !important;
        visibility: hidden !important;
    }

    div[data-testid="stDataFrame"] [role="menuitem"] span[aria-hidden="true"],
    div[data-testid="stDataFrame"] [role="menuitem"] [data-baseweb="icon"],
    div[data-testid="stDataFrame"] [role="menuitem"] svg {
        display: none !important;
        position: absolute !important;
        left: -9999px !important;
        width: 0 !important;
        height: 0 !important;
        overflow: hidden !important;
        visibility: hidden !important;
    }

    div[data-baseweb="select"] [role="option"],
    div[data-baseweb="select"] > div > div:first-child > div {
        font-size: 14px !important;
        font-family: 'Inter', sans-serif !important;
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
        display: block !important;
        visibility: visible !important;
    }

    div[data-baseweb="select"] > div {
        padding-right: 40px !important;
        position: relative !important;
    }

    div[data-baseweb="select"]::after {
        content: '▾' !important;
        font-family: system-ui, sans-serif !important;
        font-size: 16px !important;
        color: #818cf8 !important;
        -webkit-text-fill-color: #818cf8 !important;
        position: absolute !important;
        right: 14px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        pointer-events: none !important;
        z-index: 10 !important;
        display: block !important;
        visibility: visible !important;
    }

    /* ============================================
       MULTISELECT TAG FIX
       ============================================ */

    div[data-baseweb="tag"] {
        background: rgba(99, 102, 241, 0.2) !important;
        border: 1px solid rgba(99, 102, 241, 0.35) !important;
        border-radius: 6px !important;
        padding: 4px 10px !important;
        margin: 2px !important;
        display: inline-flex !important;
        align-items: center !important;
    }

    div[data-baseweb="tag"] span,
    div[data-baseweb="tag"] > span:first-child {
        font-size: 13px !important;
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
        font-family: 'Inter', sans-serif !important;
        display: inline !important;
        visibility: visible !important;
        opacity: 1 !important;
    }

    div[data-baseweb="tag"] svg,
    div[data-baseweb="tag"] [role="button"] {
        display: inline-flex !important;
        visibility: visible !important;
        width: 14px !important;
        height: 14px !important;
        color: #ffffff !important;
        opacity: 0.7 !important;
        cursor: pointer !important;
        margin-left: 6px !important;
    }

    div[data-baseweb="tag"] [role="button"]:hover {
        opacity: 1 !important;
    }

    div[data-baseweb="select"] div[role="option"] {
        font-size: 14px !important;
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
        display: flex !important;
        visibility: visible !important;
    }

    /* ============================================
       SCROLLBAR — Indigo-themed
       ============================================ */

    ::-webkit-scrollbar {
        width: 8px !important;
        height: 8px !important;
    }

    ::-webkit-scrollbar-track {
        background: rgba(15, 18, 35, 0.3) !important;
        border-radius: 8px !important;
    }

    ::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, rgba(99, 102, 241, 0.4), rgba(129, 140, 248, 0.4)) !important;
        border-radius: 8px !important;
        border: 2px solid rgba(15, 18, 35, 0.3) !important;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, rgba(99, 102, 241, 0.6), rgba(129, 140, 248, 0.6)) !important;
    }

    /* ============================================
       PLOTLY CHARTS — Seamless integration
       ============================================ */

    .js-plotly-plot {
        border-radius: 12px !important;
        overflow: hidden !important;
    }

    /* ============================================
       GLOW & SHADOW EFFECTS
       ============================================ */

    .glow-text {
        text-shadow: 0 0 20px rgba(99, 102, 241, 0.4),
                     0 0 40px rgba(99, 102, 241, 0.2),
                     0 0 60px rgba(99, 102, 241, 0.1);
    }

    .glow-box {
        box-shadow: 0 0 20px rgba(99, 102, 241, 0.2),
                    0 0 40px rgba(99, 102, 241, 0.1),
                    inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    /* ============================================
       RESPONSIVE
       ============================================ */

    @media (max-width: 768px) {
        h1 { font-size: 2.5em !important; }
        h2 { font-size: 1.8em !important; }
        h3 { font-size: 1.3em !important; }

        div[data-testid="stMetric"] {
            padding: 16px !important;
        }
    }

    /* ============================================
       HIDE STREAMLIT BRANDING
       ============================================ */

    #MainMenu {visibility: hidden; display: none !important;}
    footer {visibility: hidden; display: none !important; height: 0 !important;}
    header {visibility: hidden;}
    div[data-testid="stBottom"] {display: none !important; visibility: hidden !important;}

</style>
""", unsafe_allow_html=True)


# ============================================================
# SECTION 5 — SIDEBAR GLASSMORPHISM
# ============================================================

def apply_sidebar_glassmorphism():
    """Frosted-glass sidebar with indigo accent border."""
    st.markdown("""
<style>
/* ===== SIDEBAR GLASSMORPHISM ===== */
section[data-testid="stSidebar"] {
    background: rgba(10, 12, 24, 0.82) !important;
    backdrop-filter: blur(24px) saturate(150%) !important;
    -webkit-backdrop-filter: blur(24px) saturate(150%) !important;
    border-right: 1px solid rgba(99, 102, 241, 0.08) !important;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3) !important;
}

section[data-testid="stSidebar"] > div:first-child {
    background: transparent !important;
}

/* Sidebar links and text */
section[data-testid="stSidebar"] a {
    color: #a5b4fc !important;
    transition: color 0.2s ease !important;
}

section[data-testid="stSidebar"] a:hover {
    color: #c7d2fe !important;
}
</style>
""", unsafe_allow_html=True)


# ============================================================
# ENTRY POINT
# ============================================================

def init_atlas_css():
    """Initialize all ATLAS CSS — call once at app startup."""
    apply_premium_layout_css()
    apply_full_width_js()
    apply_figma_borders_css()
    apply_glassmorphism_css()
    apply_sidebar_glassmorphism()
