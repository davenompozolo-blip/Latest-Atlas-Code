"""
ATLAS Terminal - CSS Injection Module
Glassmorphism + Ambient Atmosphere Design System

Implements the exact design spec: ambient gradient mesh background,
glass surfaces with backdrop-filter, noise grain texture, and
no hard borders. Components feel carved out of the background.

Call init_atlas_css() once at app startup to inject all styles.
"""

import streamlit as st


def apply_design_system_css():
    """Inject the complete ATLAS design system CSS from the design spec."""
    st.markdown("""<style>
/* ══════════════════════════════════════════════════════════
   ATLAS TERMINAL — Glassmorphism + Ambient Atmosphere
   Design System v3.0
   ══════════════════════════════════════════════════════════ */

@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=Syne:wght@400;600;700&display=swap');

/* ── Design Tokens ──────────────────────────────────── */
:root {
    --bg-void: #07080f;
    --bg-deep: #0b0d1a;
    --bg-surface: rgba(255,255,255,0.035);
    --bg-glass: rgba(255,255,255,0.05);
    --bg-glass-hover: rgba(255,255,255,0.08);
    --glow-primary: rgba(99, 102, 241, 0.18);
    --glow-secondary: rgba(16, 185, 129, 0.12);
    --glow-accent: rgba(139, 92, 246, 0.14);
    --glow-warm: rgba(245, 158, 11, 0.08);
    --text-primary: rgba(255,255,255,0.92);
    --text-secondary: rgba(255,255,255,0.52);
    --text-muted: rgba(255,255,255,0.28);
    --green: #10b981;
    --green-dim: rgba(16,185,129,0.18);
    --red: #f43f5e;
    --red-dim: rgba(244,63,94,0.18);
    --blue: #6366f1;
    --blue-dim: rgba(99,102,241,0.18);
    --amber: #f59e0b;
    --violet: #8b5cf6;
    --cyan: #00d4ff;
    --border: rgba(255,255,255,0.07);
    --border-bright: rgba(255,255,255,0.12);
    --font-display: 'Syne', sans-serif;
    --font-body: 'DM Sans', sans-serif;
    --font-mono: 'Space Mono', monospace;
}

/* ── Global Body & Ambient Background ───────────────── */
body, .stApp {
    background-color: var(--bg-void) !important;
    color: var(--text-primary) !important;
    font-family: var(--font-body) !important;
    position: relative;
}

.stApp::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
        radial-gradient(ellipse 80% 60% at 20% 10%, var(--glow-primary), transparent 60%),
        radial-gradient(ellipse 60% 50% at 80% 80%, var(--glow-secondary), transparent 55%),
        radial-gradient(ellipse 50% 40% at 60% 20%, var(--glow-accent), transparent 50%),
        radial-gradient(ellipse 40% 30% at 10% 80%, var(--glow-warm), transparent 45%);
    pointer-events: none;
    z-index: 0;
}

.stApp::after {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 0;
    opacity: 0.6;
}

/* ── Streamlit Chrome Removal ───────────────────────── */
header[data-testid="stHeader"] { display: none !important; }
footer { display: none !important; }
#MainMenu { display: none !important; }
div[data-testid="stToolbar"] { display: none !important; }
div[data-testid="stDecoration"] { display: none !important; }

/* ── Sidebar ────────────────────────────────────────── */
section[data-testid="stSidebar"] {
    background: rgba(7,8,15,0.6) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border-right: 1px solid var(--border) !important;
    width: 200px !important;
    min-width: 200px !important;
}

section[data-testid="stSidebar"] > div:first-child {
    background: transparent !important;
    width: 200px !important;
}

[data-testid="collapsedControl"] {
    display: block !important;
}

/* Sidebar scrollbar — hidden by default, visible on hover */
section[data-testid="stSidebar"] { scrollbar-width: none; }
section[data-testid="stSidebar"]::-webkit-scrollbar { width: 0; background: transparent; }
section[data-testid="stSidebar"]:hover { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
section[data-testid="stSidebar"]:hover::-webkit-scrollbar { width: 3px; }
section[data-testid="stSidebar"]:hover::-webkit-scrollbar-track { background: transparent; }
section[data-testid="stSidebar"]:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

/* Sidebar element spacing */
[data-testid="stSidebar"] .element-container { margin-bottom: 0.15rem !important; }

/* ── Main Content Layout ────────────────────────────── */
.main .block-container {
    max-width: 100% !important;
    padding: 1.5rem 2.25rem !important;
    background: transparent !important;
}

.main { padding: 0 !important; min-height: 100vh; }

div[data-testid="column"] { background: transparent !important; }

.element-container { margin-bottom: 0.5rem !important; }
.row-widget { margin: 0 !important; }
.row-widget > div { padding: 0 0.5rem !important; }
.stColumn { padding: 0 0.5rem !important; }

/* ── Glass Card Base ────────────────────────────────── */
.glass-card {
    background: var(--bg-glass);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 24px;
    transition: all 0.25s ease;
    position: relative;
    overflow: hidden;
}

.glass-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 60%);
    pointer-events: none;
}

.glass-card:hover {
    background: var(--bg-glass-hover);
    border-color: var(--border-bright);
    transform: translateY(-1px);
}

/* Accent bottom glow variants */
.glass-card.glow-green::after {
    content: ''; position: absolute; bottom: -1px; left: 20%; right: 20%; height: 1px;
    background: linear-gradient(90deg, transparent, var(--green), transparent);
}
.glass-card.glow-blue::after {
    content: ''; position: absolute; bottom: -1px; left: 20%; right: 20%; height: 1px;
    background: linear-gradient(90deg, transparent, var(--blue), transparent);
}
.glass-card.glow-violet::after {
    content: ''; position: absolute; bottom: -1px; left: 20%; right: 20%; height: 1px;
    background: linear-gradient(90deg, transparent, var(--violet), transparent);
}

/* ── Performance Cards ──────────────────────────────── */
.perf-card {
    background: var(--bg-surface);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    transition: all 0.2s ease;
}
.perf-card:hover {
    background: var(--bg-glass);
    border-color: var(--border-bright);
}

/* ── Risk / Stat Cards ──────────────────────────────── */
.stat-card {
    background: var(--bg-glass);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 20px;
    position: relative;
    overflow: hidden;
    transition: all 0.2s ease;
}
.stat-card:hover { border-color: var(--border-bright); transform: translateY(-1px); }

.stat-card .inner-glow {
    position: absolute; top: -30px; right: -30px;
    width: 80px; height: 80px; border-radius: 50%;
    opacity: 0.15; filter: blur(20px);
}

/* ── Typography Hierarchy ───────────────────────────── */
.metric-label {
    font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
    color: var(--text-muted); margin-bottom: 12px; font-weight: 500;
}
.metric-value {
    font-family: var(--font-mono); font-size: 26px; font-weight: 700;
    color: var(--text-primary); letter-spacing: -0.5px; line-height: 1; margin-bottom: 14px;
}
.metric-value.green { color: var(--green); }
.metric-value.red { color: var(--red); }
.metric-value.blue { color: var(--blue); }
.metric-value.violet { color: var(--violet); }

/* ── Metric Pills ───────────────────────────────────── */
.metric-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px; border-radius: 8px; font-size: 12px;
    font-weight: 500; font-family: var(--font-mono);
}
.pill-green { background: rgba(16,185,129,0.12); color: var(--green); border: 1px solid rgba(16,185,129,0.2); }
.pill-red { background: rgba(244,63,94,0.12); color: var(--red); border: 1px solid rgba(244,63,94,0.2); }
.pill-neutral { background: var(--bg-glass); color: var(--text-secondary); border: 1px solid var(--border); }

/* ── Badges ─────────────────────────────────────────── */
.badge {
    display: inline-flex; align-items: center; padding: 5px 12px;
    border-radius: 20px; font-size: 11px; font-weight: 500;
    letter-spacing: 0.5px; border: 1px solid;
}
.badge-warning { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.25); color: var(--amber); }
.badge-green { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.25); color: var(--green); }
.badge-red { background: rgba(244,63,94,0.1); border-color: rgba(244,63,94,0.25); color: var(--red); }
.badge-neutral { background: var(--bg-glass); border-color: var(--border); color: var(--text-secondary); }

/* ── Section Labels ─────────────────────────────────── */
.section-label {
    display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
    font-family: var(--font-display); font-size: 11px; letter-spacing: 2px;
    text-transform: uppercase; color: var(--text-muted);
}
.section-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

/* ── Page Title ─────────────────────────────────────── */
.page-title {
    font-family: var(--font-display); font-size: 13px; font-weight: 600;
    letter-spacing: 3px; text-transform: uppercase; color: var(--text-secondary);
    display: flex; align-items: center; gap: 10px;
}
.page-title::before { content: ''; width: 20px; height: 1px; background: var(--text-muted); }

/* ── Tip / Info Banner ──────────────────────────────── */
.tip-bar {
    background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.18);
    border-radius: 10px; padding: 10px 16px; font-size: 12px;
    color: rgba(139,92,246,0.9); margin-bottom: 24px;
    display: flex; align-items: center; gap: 8px;
}

/* ── Table Container ────────────────────────────────── */
.table-container, div[data-testid="stDataFrame"], .stDataFrame {
    background: var(--bg-surface) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border: 1px solid var(--border) !important;
    border-radius: 16px !important;
    overflow: hidden !important;
}

/* ── Plotly Chart Containers ────────────────────────── */
.stPlotlyChart {
    background: var(--bg-surface) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid var(--border) !important;
    border-radius: 16px !important;
    padding: 4px !important;
    overflow: hidden !important;
}

/* Plotly modebar */
.modebar { background: transparent !important; }
.modebar-btn { color: var(--text-muted) !important; }
.modebar-btn:hover { color: var(--text-secondary) !important; }

/* ── Streamlit Native Overrides ─────────────────────── */

/* Metrics */
div[data-testid="stMetric"] {
    background: var(--bg-glass) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border: 1px solid var(--border) !important;
    border-radius: 16px !important;
    padding: 20px !important;
}

/* Expanders */
div[data-testid="stExpander"] {
    background: var(--bg-glass) !important;
    backdrop-filter: blur(16px) !important;
    border: 1px solid var(--border) !important;
    border-radius: 14px !important;
}

div[data-testid="stExpander"] summary {
    color: var(--text-secondary) !important;
    font-family: var(--font-body) !important;
}

/* Select boxes */
div[data-testid="stSelectbox"] > div {
    background: var(--bg-glass) !important;
    border: 1px solid var(--border) !important;
    border-radius: 8px !important;
    color: var(--text-primary) !important;
}

/* Multiselect */
div[data-testid="stMultiSelect"] > div {
    background: var(--bg-glass) !important;
    border: 1px solid var(--border) !important;
    border-radius: 8px !important;
}

/* Buttons */
div.stButton > button {
    background: var(--bg-glass) !important;
    border: 1px solid var(--border) !important;
    border-radius: 8px !important;
    color: var(--text-primary) !important;
    font-family: var(--font-body) !important;
    transition: all 0.2s ease !important;
}
div.stButton > button:hover {
    background: var(--bg-glass-hover) !important;
    border-color: var(--border-bright) !important;
}

/* Primary buttons */
div.stButton > button[kind="primary"],
button[data-testid="stFormSubmitButton"] {
    background: rgba(99, 102, 241, 0.15) !important;
    border: 1px solid rgba(99, 102, 241, 0.3) !important;
    color: #a5b4fc !important;
}
div.stButton > button[kind="primary"]:hover {
    background: rgba(99, 102, 241, 0.25) !important;
}

/* Text inputs */
input[type="text"], input[type="number"], textarea,
div[data-testid="stTextInput"] input,
div[data-testid="stNumberInput"] input {
    background: var(--bg-glass) !important;
    border: 1px solid var(--border) !important;
    border-radius: 8px !important;
    color: var(--text-primary) !important;
    font-family: var(--font-body) !important;
}
input:focus, textarea:focus {
    border-color: var(--border-bright) !important;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1) !important;
}

/* Tabs */
.stTabs [data-baseweb="tab-list"] {
    background: transparent !important;
    gap: 0 !important;
    border-bottom: 1px solid var(--border) !important;
}
.stTabs [data-baseweb="tab"] {
    background: transparent !important;
    border: none !important;
    color: var(--text-muted) !important;
    font-family: var(--font-body) !important;
    padding: 0.5rem 1rem !important;
}
.stTabs [aria-selected="true"] {
    color: var(--text-primary) !important;
    border-bottom: 2px solid var(--blue) !important;
    background: transparent !important;
}

/* Dividers */
hr { border-color: var(--border) !important; opacity: 1 !important; }

/* Info / Warning / Error boxes */
div[data-testid="stAlert"] {
    background: var(--bg-glass) !important;
    border: 1px solid var(--border) !important;
    border-radius: 10px !important;
    color: var(--text-secondary) !important;
}

/* Spinners */
div[data-testid="stSpinner"] > div { color: var(--blue) !important; }

/* Captions */
.stCaption, [data-testid="stCaptionContainer"] {
    color: var(--text-muted) !important;
    font-size: 12px !important;
}

/* ── Heading Overrides ──────────────────────────────── */
h1 {
    font-family: var(--font-display) !important;
    font-weight: 600 !important;
    color: var(--text-secondary) !important;
    font-size: 13px !important;
    letter-spacing: 3px !important;
    text-transform: uppercase !important;
    margin-top: 0.5rem !important;
    margin-bottom: 1rem !important;
}
h2, h3, h4, h5, h6 {
    font-family: var(--font-display) !important;
    color: var(--text-secondary) !important;
}

/* ── Scrollbar — hide-on-idle ───────────────────────── */
::-webkit-scrollbar { width: 0; background: transparent; }
::-webkit-scrollbar-thumb { background: transparent; }
*:hover::-webkit-scrollbar { width: 4px; }
*:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
html { scrollbar-width: none; }

/* ── Staggered Entry Animations ─────────────────────── */
@keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
}
.glass-card, .perf-card, .stat-card { animation: fadeUp 0.5s ease forwards; }

/* ── Responsive ─────────────────────────────────────── */
@media (max-width: 768px) {
    .main .block-container { padding: 1rem !important; }
    section[data-testid="stSidebar"] { width: 180px !important; min-width: 180px !important; }
}

</style>""", unsafe_allow_html=True)


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
""")


# ============================================================
# ENTRY POINT
# ============================================================

def init_atlas_css():
    """Initialize all ATLAS CSS — call once at app startup."""
    apply_design_system_css()
    apply_full_width_js()
