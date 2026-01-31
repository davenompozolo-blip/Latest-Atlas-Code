"""
ATLAS Terminal - CSS Injection Module
All inline CSS/JS styles extracted from atlas_app.py.

Call init_atlas_css() once at app startup to inject all styles.
"""

import streamlit as st

def apply_premium_layout_css():
    """Premium layout: remove Streamlit chrome, zero-padding, responsive metric cards."""
    st.markdown("""
<style>
/* ===== REMOVE STREAMLIT CHROME ===== */
header[data-testid="stHeader"] { display: none !important; }
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
.main .block-container { max-width: 100% !important; padding: 0.25rem 0.5rem !important; margin: 0 !important; padding-top: 0 !important; }
section.main > div { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }

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
/* Card labels - prevent text wrapping, responsive sizing */
div[data-testid="column"] p[style*="text-transform: uppercase"] {
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    font-size: clamp(0.5rem, 0.9vw, 0.65rem) !important;
}

/* Card values - responsive sizing */
div[data-testid="column"] h3[style*="font-weight: 800"] {
    font-size: clamp(1.4rem, 2.2vw, 2.5rem) !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}

/* Card containers - reduce padding and min-height for density */
div[data-testid="column"] > div > div > div[style*="backdrop-filter"] {
    padding: clamp(1rem, 1.5vw, 1.75rem) clamp(0.75rem, 1.2vw, 1.5rem) !important;
    min-height: clamp(140px, 15vw, 200px) !important;
    border-radius: 16px !important;
}

/* Card status badges - tighter */
div[data-testid="column"] div[style*="border-radius: 10px"] p,
div[data-testid="column"] div[style*="border-radius: 12px"] p {
    font-size: clamp(0.55rem, 0.8vw, 0.7rem) !important;
    white-space: nowrap !important;
}

/* Capital structure cards - also scale values */
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


def apply_full_width_js():
    """Full-width enforcement via JavaScript MutationObserver."""
    st.html("""
<script>
(function() {
    function forceFullWidth() {
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
""", unsafe_allow_javascript=True)


def apply_figma_borders_css():
    """Figma redesign: subtle chart borders, selectbox/dropdown styling."""
    st.markdown("""
<style>
/* FIGMA REDESIGN: Subtle gray borders for all charts */
.stPlotlyChart {
    border: 1px solid rgb(31, 41, 55) !important;
    border-radius: 12px !important;
    padding: 4px !important;
    margin: 8px 0 !important;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3) !important;
    background: rgba(15, 21, 32, 0.6) !important;
    transition: all 0.3s ease !important;
    overflow: visible !important;
}

/* Ensure chart canvas doesn't overflow */
.stPlotlyChart > div {
    height: 100% !important;
    overflow: visible !important;
}

/* Fix chart inner container */
.stPlotlyChart iframe,
.stPlotlyChart .js-plotly-plot {
    overflow: visible !important;
}

.stPlotlyChart:hover {
    border-color: rgb(55, 65, 81) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
}

/* Ensure dark backgrounds on Plotly modebar */
.modebar-container {
    background: transparent !important;
}

.modebar-group .modebar-btn path {
    fill: rgba(255, 255, 255, 0.6) !important;
}

.modebar-group .modebar-btn:hover path {
    fill: #22d3ee !important;
}

/* Major Indices - same subtle style */
.major-indices-container .stPlotlyChart {
    border: 1px solid rgb(31, 41, 55) !important;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3) !important;
    background: rgba(15, 21, 32, 0.6) !important;
}

/* Override hover state for Major Indices too */
.major-indices-container .stPlotlyChart:hover {
    border: 1px solid rgb(55, 65, 81) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
}

/* ============================================
   DROPDOWN / SELECTBOX TEXT VISIBILITY FIX
   COMPREHENSIVE - Targets ALL selectbox elements
   ============================================ */

/* Main selectbox wrapper */
.stSelectbox {
    color: #FFFFFF !important;
}

/* Fix the select control and its children */
.stSelectbox [data-baseweb="select"] {
    background-color: #1a1d29 !important;
    border-color: rgba(99, 102, 241, 0.3) !important;
}

/* The actual selected value text - CRITICAL */
.stSelectbox [data-baseweb="select"] span {
    color: #FFFFFF !important;
}

/* Input element inside select */
.stSelectbox [data-baseweb="select"] input {
    color: #FFFFFF !important;
    -webkit-text-fill-color: #FFFFFF !important;
}

/* The value container */
.stSelectbox [data-baseweb="select"] > div {
    color: #FFFFFF !important;
    background-color: #1a1d29 !important;
}

/* Single value display */
.stSelectbox [data-baseweb="select"] [data-testid="stSelectbox"] {
    color: #FFFFFF !important;
}

/* Fix placeholder and selected text */
.stSelectbox div[data-baseweb="select"] div[aria-selected="true"],
.stSelectbox div[data-baseweb="select"] div[class*="singleValue"],
.stSelectbox div[data-baseweb="select"] div[class*="placeholder"] {
    color: #FFFFFF !important;
}

/* Dropdown arrow icon */
.stSelectbox svg {
    fill: #FFFFFF !important;
}

/* Selectbox label */
.stSelectbox label {
    color: #FFFFFF !important;
    font-weight: 500 !important;
}

/* Dropdown popover/menu background */
[data-baseweb="popover"],
[data-baseweb="menu"],
[data-baseweb="select"] [data-baseweb="popover"] {
    background-color: #1a1d29 !important;
    border: 1px solid rgba(99, 102, 241, 0.3) !important;
}

/* Dropdown menu list */
[data-baseweb="menu"] ul,
[data-baseweb="popover"] ul {
    background-color: #1a1d29 !important;
}

/* All dropdown options */
[data-baseweb="menu"] li,
[data-baseweb="popover"] li,
[role="option"] {
    background-color: #1a1d29 !important;
    color: #FFFFFF !important;
}

/* Dropdown option hover */
[data-baseweb="menu"] li:hover,
[data-baseweb="popover"] li:hover,
[role="option"]:hover {
    background-color: rgba(99, 102, 241, 0.2) !important;
    color: #00BCD4 !important;
}

/* Selected dropdown option */
[role="option"][aria-selected="true"] {
    background-color: rgba(99, 102, 241, 0.3) !important;
    color: #00BCD4 !important;
}

/* Multiselect styling */
.stMultiSelect [data-baseweb="select"] {
    background-color: #1a1d29 !important;
}

.stMultiSelect [data-baseweb="select"] > div {
    background-color: #1a1d29 !important;
    color: #FFFFFF !important;
}

.stMultiSelect [data-baseweb="tag"] {
    background-color: rgba(99, 102, 241, 0.3) !important;
    color: #FFFFFF !important;
}

.stMultiSelect [data-baseweb="tag"] span {
    color: #FFFFFF !important;
}

/* Multiselect X button (remove tag) - VISIBLE and STYLED */
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

/* Better padding for dropdown text */
.stSelectbox [data-baseweb="select"] > div {
    padding: 8px 12px !important;
    min-height: 42px !important;
}

/* Dropdown menu option padding */
[data-baseweb="menu"] li,
[role="option"] {
    padding: 10px 16px !important;
    line-height: 1.4 !important;
}

/* Better multiselect tag spacing */
.stMultiSelect [data-baseweb="tag"] {
    padding: 4px 8px !important;
    margin: 2px 4px 2px 0 !important;
    gap: 6px !important;
    border-radius: 6px !important;
}

/* Ensure nothing clips text */
.stSelectbox *,
.stMultiSelect * {
    overflow: visible !important;
}
</style>
""", unsafe_allow_html=True)


def apply_glassmorphism_css():
    """Modern UI/UX: glassmorphism, fonts, cards, tables, buttons, inputs."""
    st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');

    /* ============================================
       CORE FOUNDATIONS - Figma Redesign
       ============================================ */

    * {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }

    /* FIGMA REDESIGN: All headings use JetBrains Mono */
    h1, h2, h3, h4, h5, h6 {
        font-family: 'JetBrains Mono', monospace !important;
    }

    code, pre, .monospace {
        font-family: 'JetBrains Mono', monospace !important;
    }

    /* Dark Background with Subtle Gradient */
    .main {
        background: linear-gradient(135deg, #000000 0%, #0a0e1a 50%, #000000 100%);
        background-attachment: fixed;
    }

    /* Add subtle noise texture for depth */
    .main::before {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: 0.03;
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

    /* Prevent text overflow and wrapping issues */
    .block-container * {
        max-width: 100%;
        overflow-wrap: break-word;
        word-wrap: break-word;
    }

    /* Fix for inline-flex containers that could overflow */
    div[style*="display: inline-flex"],
    div[style*="display:inline-flex"] {
        flex-wrap: wrap !important;
        overflow: hidden !important;
    }

    /* ============================================
       FIGMA REDESIGN: Cards with subtle borders
       ============================================ */

    /* Streamlit metric cards - subtle gray borders */
    div[data-testid="stMetric"],
    .stExpander {
        background: rgba(15, 21, 32, 0.6) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        border: 1px solid rgb(31, 41, 55) !important;
        border-radius: 12px !important;
        padding: 24px !important;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3) !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    div[data-testid="stMetric"]:hover,
    .stExpander:hover {
        transform: translateY(-2px) !important;
        border-color: rgb(55, 65, 81) !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
    }

    /* ============================================
       FIGMA REDESIGN: Typography with JetBrains Mono
       ============================================ */

    h1 {
        font-family: 'JetBrains Mono', monospace !important;
        font-weight: 600 !important;
        font-size: 1.75rem !important;
        letter-spacing: 0.05em !important;
        line-height: 1.2 !important;
        margin-bottom: 0.5em !important;
        color: #22d3ee !important;
        /* Remove shimmer animation for cleaner look */
        background: none !important;
        -webkit-text-fill-color: #22d3ee !important;
        text-shadow: 0 0 30px rgba(34, 211, 238, 0.3) !important;
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

    /* FIGMA: Remove the left bar pseudo-element from h2 */
    h2::before {
        display: none !important;
        content: none !important;
    }

    /* EXCEPTION: Remove left border pseudo-element from h2 inside custom HTML cards */
    /* This prevents the global h2::before from appearing on regime cards, metric cards, etc. */
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
        color: #b0c4de !important;
        font-weight: 400 !important;
    }

    /* ============================================
       METRICS - Beautiful Number Display
       ============================================ */

    div[data-testid="stMetric"] {
        background: linear-gradient(135deg, rgba(10, 25, 41, 0.6) 0%, rgba(5, 15, 23, 0.8) 100%) !important;
        position: relative;
        overflow: hidden;
    }

    /* Animated gradient background on hover */
    div[data-testid="stMetric"]::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(0, 212, 255, 0.1) 0%, transparent 70%);
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
        color: #6c8ca8 !important;
        margin-bottom: 8px !important;
    }

    div[data-testid="stMetric"] [data-testid="stMetricValue"] {
        font-size: 1.8em !important;
        font-weight: 800 !important;
        background: linear-gradient(135deg, #ffffff 0%, #00d4ff 100%);
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
       TABLES - Sleek Data Display
       ============================================ */

    div[data-testid="stDataFrame"] {
        background: rgba(10, 25, 41, 0.3) !important;
        border: 1px solid rgba(0, 212, 255, 0.15) !important;
        border-radius: 12px !important;
        overflow: visible !important;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3) !important;
    }

    /* Fix for column header popovers - prevent text overlap */
    div[data-testid="stDataFrame"] div[data-baseweb="popover"] {
        z-index: 9999 !important;
        display: block !important;
        position: fixed !important;
    }

    /* Ensure popover content doesn't overflow */
    div[data-testid="stDataFrame"] div[role="tooltip"],
    div[data-testid="stDataFrame"] div[data-baseweb="popover"] > div {
        max-width: 300px !important;
        word-wrap: break-word !important;
        white-space: normal !important;
        overflow: visible !important;
        background: rgba(10, 25, 41, 0.95) !important;
        border: 1px solid rgba(0, 212, 255, 0.3) !important;
        border-radius: 8px !important;
        padding: 12px !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
        backdrop-filter: blur(20px) !important;
    }

    /* Table Headers - Gradient Effect */
    div[data-testid="stDataFrame"] thead th {
        background: linear-gradient(135deg, #00d4ff 0%, #0080ff 100%) !important;
        color: #000000 !important;
        font-weight: 700 !important;
        font-size: 13px !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        padding: 16px 12px !important;
        border: none !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 10 !important;
        overflow: visible !important;
    }

    /* Table Rows - Smooth Hover */
    div[data-testid="stDataFrame"] tbody tr {
        transition: all 0.2s ease !important;
        border-bottom: 1px solid rgba(26, 58, 82, 0.5) !important;
    }

    div[data-testid="stDataFrame"] tbody tr:hover {
        background: linear-gradient(90deg,
            rgba(0, 212, 255, 0.08) 0%,
            rgba(0, 212, 255, 0.15) 50%,
            rgba(0, 212, 255, 0.08) 100%) !important;
        transform: translateX(4px) scale(1.002) !important;
        border-left: 3px solid #00d4ff !important;
        box-shadow: 0 2px 12px rgba(0, 212, 255, 0.2) !important;
    }

    div[data-testid="stDataFrame"] tbody td {
        padding: 14px 12px !important;
        font-size: 14px !important;
        color: #e0e7ee !important;
        font-weight: 500 !important;
    }

    /* ============================================
       NUCLEAR OPTION - COMPLETELY REMOVE TABLE DROPDOWNS
       ============================================ */

    /* Hide ALL table controls that cause issues */
    div[data-testid="stDataFrame"] button,
    div[data-testid="stDataFrame"] [role="button"],
    div[data-testid="stDataFrame"] [data-baseweb="popover"],
    div[data-testid="stDataFrame"] [data-baseweb="menu"],
    div[data-testid="stDataFrame"] [role="menu"],
    div[data-testid="stDataFrame"] [role="listbox"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        position: absolute !important;
        left: -9999px !important;
    }

    /* Remove column resize handles */
    div[data-testid="stDataFrameResizeHandle"] {
        display: none !important;
    }

    /* ============================================
       BUTTONS - Modern Interactive Elements
       ============================================ */

    .stButton > button {
        background: linear-gradient(135deg, #00d4ff 0%, #0080ff 100%) !important;
        color: #000000 !important;
        border: none !important;
        border-radius: 12px !important;
        padding: 14px 32px !important;
        font-weight: 700 !important;
        font-size: 15px !important;
        letter-spacing: 0.05em !important;
        text-transform: uppercase !important;
        box-shadow: 0 4px 16px rgba(0, 212, 255, 0.3) !important;
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
        background: rgba(255, 255, 255, 0.3);
        transform: translate(-50%, -50%);
        transition: width 0.6s, height 0.6s;
    }

    .stButton > button:hover::before {
        width: 300px;
        height: 300px;
    }

    .stButton > button:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 8px 24px rgba(0, 212, 255, 0.5) !important;
    }

    .stButton > button:active {
        transform: translateY(0) !important;
    }

    /* ============================================
       INPUTS - Clean Form Elements
       ============================================ */

    input[type="text"],
    input[type="number"],
    textarea,
    .stTextInput > div > div > input,
    .stNumberInput > div > div > input {
        background: rgba(10, 25, 41, 0.5) !important;
        border: 2px solid rgba(0, 212, 255, 0.2) !important;
        border-radius: 10px !important;
        color: #ffffff !important;
        padding: 12px 16px !important;
        font-size: 15px !important;
        font-weight: 500 !important;
        transition: all 0.3s ease !important;
    }

    input:focus,
    textarea:focus {
        border-color: #00d4ff !important;
        box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1) !important;
        outline: none !important;
        background: rgba(10, 25, 41, 0.7) !important;
    }

    /* ============================================
       TABS - Sleek Navigation
       ============================================ */

    .stTabs [data-baseweb="tab-list"] {
        gap: 8px !important;
        background: rgba(10, 25, 41, 0.3) !important;
        padding: 8px !important;
        border-radius: 12px !important;
        border: 1px solid rgba(0, 212, 255, 0.1) !important;
    }

    .stTabs [data-baseweb="tab"] {
        background: transparent !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 12px 24px !important;
        font-weight: 600 !important;
        font-size: 14px !important;
        color: #6c8ca8 !important;
        transition: all 0.3s ease !important;
    }

    .stTabs [data-baseweb="tab"]:hover {
        background: rgba(0, 212, 255, 0.1) !important;
        color: #00d4ff !important;
    }

    .stTabs [aria-selected="true"] {
        background: linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(0, 128, 255, 0.2) 100%) !important;
        color: #00d4ff !important;
        border: 1px solid rgba(0, 212, 255, 0.3) !important;
        box-shadow: 0 4px 12px rgba(0, 212, 255, 0.15) !important;
    }

    /* ============================================
       LAYOUT OPTIMIZATION - FIT LIKE A GLOVE
       ============================================ */

    /* Wider sidebar - 280px for breathing room */
    section[data-testid="stSidebar"] {
        display: block !important;
        width: 280px !important;
        min-width: 280px !important;
    }

    [data-testid="stSidebar"] > div:first-child {
        width: 280px !important;
    }

    /* Show sidebar collapse button */
    [data-testid="collapsedControl"] {
        display: block !important;
    }

    /* ============================================
       STRETCH CONTENT TO FILL SCREEN
       ============================================ */

    /* Full-width content area */
    .main .block-container {
        max-width: 100% !important;
        padding: 1rem 2rem !important;
    }

    .main {
        padding: 0 !important;
        min-height: 100vh;
    }

    /* Remove extra spacing */
    .element-container {
        margin-bottom: 0.5rem !important;
    }

    .row-widget {
        margin: 0 !important;
    }

    .row-widget > div {
        padding: 0 0.5rem !important;
    }

    /* Optimize columns */
    .stColumn {
        padding: 0 0.5rem !important;
    }

    /* Hide Streamlit header for more space */
    header[data-testid="stHeader"] {
        display: none;
    }

    /* Compact sidebar content spacing */
    [data-testid="stSidebar"] .element-container {
        margin-bottom: 0.25rem !important;
    }

    /* ============================================
       HORIZONTAL NAVIGATION - RESPONSIVE DESIGN
       ============================================ */

    /* Professional header styling */
    h1 {
        font-weight: 600;
        margin-top: 0.5rem !important;
        margin-bottom: 1rem !important;
        background: linear-gradient(135deg, #00d4ff 0%, #0080ff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    /* Make horizontal menu scrollable on smaller screens */
    nav[role="navigation"] {
        overflow-x: auto;
        white-space: nowrap;
    }

    /* Smooth scrolling for menu */
    nav[role="navigation"]::-webkit-scrollbar {
        height: 6px;
    }

    nav[role="navigation"]::-webkit-scrollbar-thumb {
        background-color: rgba(0, 212, 255, 0.3);
        border-radius: 3px;
    }

    nav[role="navigation"]::-webkit-scrollbar-track {
        background-color: rgba(10, 25, 41, 0.2);
    }

    /* Professional card styling for metrics */
    [data-testid="metric-container"] {
        background-color: rgba(10, 25, 41, 0.3);
        border: 1px solid rgba(0, 212, 255, 0.2);
        padding: 15px;
        border-radius: 10px;
    }

    /* ============================================
       EXPANDERS - Collapsible Sections
       ============================================ */

    .streamlit-expanderHeader {
        background: rgba(10, 25, 41, 0.5) !important;
        border: 1px solid rgba(0, 212, 255, 0.2) !important;
        border-radius: 10px !important;
        padding: 16px !important;
        font-weight: 600 !important;
        font-size: 15px !important;
        color: #00d4ff !important;
        transition: all 0.3s ease !important;
    }

    .streamlit-expanderHeader:hover {
        background: rgba(0, 212, 255, 0.1) !important;
        border-color: rgba(0, 212, 255, 0.4) !important;
    }

    /* ============================================
       FIX: EXPANDER ICON/TEXT OVERLAP (PR #7596)
       Prevent icon shrinking with long labels
       ============================================ */

    /* Target expander summary (header) */
    [data-testid="stExpander"] details summary {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        min-height: 48px !important;
    }

    /* CRITICAL FIX: Prevent icon from shrinking */
    [data-testid="stExpander"] details summary svg,
    [data-testid="stExpander"] details summary .streamlit-expanderHeader svg,
    .streamlit-expanderHeader svg {
        flex-shrink: 0 !important;
        min-width: 20px !important;
        min-height: 20px !important;
        margin-right: 8px !important;
    }

    /* Handle long text in expander labels */
    [data-testid="stExpander"] details summary > div,
    [data-testid="stExpander"] details summary .streamlit-expanderHeader {
        flex: 1 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
    }

    /* On hover, show full text */
    [data-testid="stExpander"] details summary:hover > div {
        overflow: visible !important;
        white-space: normal !important;
        position: relative !important;
        z-index: 1000 !important;
    }

    /* Ensure adequate container width */
    [data-testid="stExpander"] {
        width: 100% !important;
    }

    /* ============================================
       PROGRESS BARS - Animated Loading
       ============================================ */

    .stProgress > div > div > div {
        background: linear-gradient(90deg, #00d4ff, #00ff88, #00d4ff) !important;
        background-size: 200% auto !important;
        animation: shimmer 2s linear infinite !important;
        border-radius: 10px !important;
        height: 8px !important;
    }

    /* ============================================
       ALERTS & NOTIFICATIONS
       ============================================ */

    .stAlert {
        background: rgba(10, 25, 41, 0.6) !important;
        border-left: 4px solid #00d4ff !important;
        border-radius: 10px !important;
        padding: 16px 20px !important;
        backdrop-filter: blur(10px) !important;
    }

    .stSuccess {
        border-left-color: #00ff88 !important;
    }

    .stError {
        border-left-color: #ff0044 !important;
    }

    .stWarning {
        border-left-color: #ffaa00 !important;
    }

    /* ============================================
       SELECTBOX & MULTISELECT - Working Dropdowns
       ============================================ */

    div[data-baseweb="select"] > div {
        background: rgba(10, 25, 41, 0.5) !important;
        border: 2px solid rgba(0, 212, 255, 0.2) !important;
        border-radius: 10px !important;
        min-height: 48px !important;
    }

    div[data-baseweb="select"]:hover > div {
        border-color: rgba(0, 212, 255, 0.4) !important;
    }

    /* ============================================
       SURGICAL FIX: OVERLAPPING TEXT - v10.0.6
       Completely removes Material Icons ligature text
       ============================================ */

    /* ============================================
       NUCLEAR OPTION: Hide ALL expander icons and use custom arrows
       Fixes "keyboard_arrow_right" text showing instead of icon
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

    /* Add custom arrow using CSS */
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
        color: rgba(0, 212, 255, 0.8) !important;
        transition: transform 0.2s ease !important;
        font-family: Arial, sans-serif !important;
    }

    [data-testid="stExpander"][open] summary::before {
        transform: translateY(-50%) rotate(90deg) !important;
    }

    /* Also hide any stray Material Icons text nodes */
    [data-testid="stExpander"] summary *:not(div):not(p) {
        font-size: 0 !important;
    }

    /* Make sure the label text is still visible */
    [data-testid="stExpander"] summary > div {
        font-size: 15px !important;
    }

    /* Select/Dropdown icons - hide keyboard_arrow_down text */
    div[data-baseweb="select"] svg,
    div[data-baseweb="select"] [data-baseweb="icon"],
    div[data-baseweb="select"] [role="presentation"] {
        display: none !important;
        visibility: hidden !important;
    }

    /* DataFrame menu icons - hide arrow_upward/downward text */
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

    /* Dropdown label text - ensure visible */
    div[data-baseweb="select"] [role="option"],
    div[data-baseweb="select"] > div > div:first-child > div {
        font-size: 14px !important;
        font-family: 'Inter', sans-serif !important;
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
        display: block !important;
        visibility: visible !important;
    }

    /* Add custom dropdown arrow */
    div[data-baseweb="select"] > div {
        padding-right: 40px !important;
        position: relative !important;
    }

    div[data-baseweb="select"]::after {
        content: '▾' !important;
        font-family: system-ui, sans-serif !important;
        font-size: 16px !important;
        color: #00d4ff !important;
        -webkit-text-fill-color: #00d4ff !important;
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
       SURGICAL FIX: MULTISELECT RED SQUARES - v10.0.5
       Restore text visibility to tag labels
       ============================================ */

    /* Tag container styling */
    div[data-baseweb="tag"] {
        background: rgba(0, 212, 255, 0.25) !important;
        border: 1px solid rgba(0, 212, 255, 0.5) !important;
        border-radius: 6px !important;
        padding: 4px 10px !important;
        margin: 2px !important;
        display: inline-flex !important;
        align-items: center !important;
    }

    /* Tag text - MUST be visible (fixes red squares) */
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

    /* Tag close/remove button */
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

    /* Multiselect dropdown options */
    div[data-baseweb="select"] div[role="option"] {
        font-size: 14px !important;
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
        display: flex !important;
        visibility: visible !important;
    }

    /* ============================================
       SCROLLBAR - Custom Styling
       ============================================ */

    ::-webkit-scrollbar {
        width: 10px !important;
        height: 10px !important;
    }

    ::-webkit-scrollbar-track {
        background: rgba(10, 25, 41, 0.3) !important;
        border-radius: 10px !important;
    }

    ::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, #00d4ff, #0080ff) !important;
        border-radius: 10px !important;
        border: 2px solid rgba(10, 25, 41, 0.3) !important;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, #00ff88, #00d4ff) !important;
    }

    /* ============================================
       PLOTLY CHARTS - Seamless Integration
       ============================================ */

    .js-plotly-plot {
        border-radius: 12px !important;
        overflow: hidden !important;
    }

    /* ============================================
       SPECIAL EFFECTS - Glows & Shadows
       ============================================ */

    .glow-text {
        text-shadow: 0 0 20px rgba(0, 212, 255, 0.5),
                     0 0 40px rgba(0, 212, 255, 0.3),
                     0 0 60px rgba(0, 212, 255, 0.2);
    }

    .glow-box {
        box-shadow: 0 0 20px rgba(0, 212, 255, 0.3),
                    0 0 40px rgba(0, 212, 255, 0.2),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    /* ============================================
       RESPONSIVE DESIGN
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

<!-- Note: Sidebar toggle removed - Using horizontal navigation bar for maximum screen space -->
""", unsafe_allow_html=True)


def init_atlas_css():
    """Initialize all ATLAS CSS - call once at app startup."""
    apply_premium_layout_css()
    apply_full_width_js()
    apply_figma_borders_css()
    apply_glassmorphism_css()
