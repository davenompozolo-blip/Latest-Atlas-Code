"""ATLAS Terminal - Avengers Theme System"""

from dataclasses import dataclass
from typing import Dict
from enum import Enum

class HeroMode(Enum):
    CAPTAIN = "captain"
    IRON_MAN = "ironman"
    THOR = "thor"
    HULK = "hulk"
    BLACK_WIDOW = "widow"
    HAWKEYE = "hawkeye"
    INFINITY = "infinity"

@dataclass
class ThemeColors:
    primary: str
    primary_dark: str
    primary_light: str
    accent: str
    background: str
    background_secondary: str
    card_background: str
    text_primary: str
    text_secondary: str
    success: str
    warning: str
    danger: str
    info: str
    glow_color: str

@dataclass
class ThemeConfig:
    name: str
    display_name: str
    icon: str
    colors: ThemeColors
    fonts: Dict[str, str]

# CAPTAIN AMERICA THEME
CAPTAIN_THEME = ThemeConfig(
    name="captain",
    display_name="Captain America",
    icon="🛡️",
    colors=ThemeColors(
        primary="#00d4ff",
        primary_dark="#0099cc",
        primary_light="#00e5ff",
        accent="#c0c8d0",
        background="#0e1117",
        background_secondary="#1a2332",
        card_background="#1e2d3d",
        text_primary="#ffffff",
        text_secondary="#c0c8d0",
        success="#00ff9d",
        warning="#ffd93d",
        danger="#ff006b",
        info="#00d4ff",
        glow_color="rgba(0, 212, 255, 0.5)"
    ),
    fonts={"heading": "Inter, sans-serif", "body": "Inter, sans-serif", "mono": "JetBrains Mono, monospace"}
)

# IRON MAN THEME
IRON_MAN_THEME = ThemeConfig(
    name="ironman",
    display_name="Iron Man",
    icon="⚡",
    colors=ThemeColors(
        primary="#4da6ff",
        primary_dark="#3385cc",
        primary_light="#66b8ff",
        accent="#ffaa00",
        background="#0a0e14",
        background_secondary="#1a1f2e",
        card_background="#1e2838",
        text_primary="#ffffff",
        text_secondary="#b8c5d9",
        success="#00ff9d",
        warning="#ffaa00",
        danger="#ff3366",
        info="#4da6ff",
        glow_color="rgba(77, 166, 255, 0.5)"
    ),
    fonts={"heading": "Inter, sans-serif", "body": "Inter, sans-serif", "mono": "JetBrains Mono, monospace"}
)

# THOR THEME
THOR_THEME = ThemeConfig(
    name="thor",
    display_name="Thor",
    icon="⚡",
    colors=ThemeColors(
        primary="#ffd700",
        primary_dark="#ccaa00",
        primary_light="#ffe633",
        accent="#4169e1",
        background="#0a0d1a",
        background_secondary="#1a1d2a",
        card_background="#1e2535",
        text_primary="#ffffff",
        text_secondary="#c8d0e0",
        success="#00ff9d",
        warning="#ffd700",
        danger="#ff4500",
        info="#4169e1",
        glow_color="rgba(255, 215, 0, 0.5)"
    ),
    fonts={"heading": "Inter, sans-serif", "body": "Inter, sans-serif", "mono": "JetBrains Mono, monospace"}
)

# HULK THEME
HULK_THEME = ThemeConfig(
    name="hulk",
    display_name="Hulk",
    icon="💚",
    colors=ThemeColors(
        primary="#00ff9d",
        primary_dark="#00cc7a",
        primary_light="#33ffb3",
        accent="#9d4dff",
        background="#0a140f",
        background_secondary="#1a2a1f",
        card_background="#1e3529",
        text_primary="#ffffff",
        text_secondary="#c0d8cc",
        success="#00ff9d",
        warning="#ffaa00",
        danger="#cc0000",
        info="#4da6ff",
        glow_color="rgba(0, 255, 157, 0.5)"
    ),
    fonts={"heading": "Inter, sans-serif", "body": "Inter, sans-serif", "mono": "JetBrains Mono, monospace"}
)

# BLACK WIDOW THEME
BLACK_WIDOW_THEME = ThemeConfig(
    name="widow",
    display_name="Black Widow",
    icon="🕷️",
    colors=ThemeColors(
        primary="#ff006b",
        primary_dark="#cc0056",
        primary_light="#ff3385",
        accent="#2a2a2a",
        background="#0a0a0a",
        background_secondary="#1a1a1a",
        card_background="#2a1a1a",
        text_primary="#ffffff",
        text_secondary="#cccccc",
        success="#00ff9d",
        warning="#ffaa00",
        danger="#ff006b",
        info="#cc00ff",
        glow_color="rgba(255, 0, 107, 0.5)"
    ),
    fonts={"heading": "Inter, sans-serif", "body": "Inter, sans-serif", "mono": "JetBrains Mono, monospace"}
)

# HAWKEYE THEME
HAWKEYE_THEME = ThemeConfig(
    name="hawkeye",
    display_name="Hawkeye",
    icon="🎯",
    colors=ThemeColors(
        primary="#9d4dff",
        primary_dark="#7a3dcc",
        primary_light="#ad5dff",
        accent="#b8c5d9",
        background="#0e0a14",
        background_secondary="#1e1a24",
        card_background="#2e2534",
        text_primary="#ffffff",
        text_secondary="#c8d0e0",
        success="#00ff9d",
        warning="#ffaa00",
        danger="#ff006b",
        info="#9d4dff",
        glow_color="rgba(157, 77, 255, 0.5)"
    ),
    fonts={"heading": "Inter, sans-serif", "body": "Inter, sans-serif", "mono": "JetBrains Mono, monospace"}
)

# INFINITY STONES THEME
INFINITY_THEME = ThemeConfig(
    name="infinity",
    display_name="Infinity Stones",
    icon="💎",
    colors=ThemeColors(
        primary="#9d4dff",
        primary_dark="#7a3dcc",
        primary_light="#ad5dff",
        accent="#00d4ff",
        background="#0a0a14",
        background_secondary="#1a1a2a",
        card_background="#1e1e35",
        text_primary="#ffffff",
        text_secondary="#c8c8e0",
        success="#00ff9d",
        warning="#ffd700",
        danger="#ff4500",
        info="#00d4ff",
        glow_color="rgba(157, 77, 255, 0.5)"
    ),
    fonts={"heading": "Inter, sans-serif", "body": "Inter, sans-serif", "mono": "JetBrains Mono, monospace"}
)

THEMES = {
    HeroMode.CAPTAIN: CAPTAIN_THEME,
    HeroMode.IRON_MAN: IRON_MAN_THEME,
    HeroMode.THOR: THOR_THEME,
    HeroMode.HULK: HULK_THEME,
    HeroMode.BLACK_WIDOW: BLACK_WIDOW_THEME,
    HeroMode.HAWKEYE: HAWKEYE_THEME,
    HeroMode.INFINITY: INFINITY_THEME
}

class AvengersTheme:
    def __init__(self, default_mode: HeroMode = HeroMode.CAPTAIN):
        self.current_mode = default_mode
        self.current_theme = THEMES[default_mode]
    
    def get_css(self) -> str:
        theme = self.current_theme
        colors = theme.colors
        
        return f"""
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
        
        :root {{
            --primary: {colors.primary};
            --primary-dark: {colors.primary_dark};
            --primary-light: {colors.primary_light};
            --accent: {colors.accent};
            --background: {colors.background};
            --background-secondary: {colors.background_secondary};
            --card-background: {colors.card_background};
            --text-primary: {colors.text_primary};
            --text-secondary: {colors.text_secondary};
            --success: {colors.success};
            --warning: {colors.warning};
            --danger: {colors.danger};
            --info: {colors.info};
            --glow: {colors.glow_color};
            --font-heading: {theme.fonts['heading']};
            --font-body: {theme.fonts['body']};
            --font-mono: {theme.fonts['mono']};
        }}
        
        body {{ background-color: var(--background) !important; color: var(--text-primary) !important; font-family: var(--font-body) !important; }}
        h1, h2, h3, h4, h5, h6 {{ font-family: var(--font-heading) !important; color: var(--text-primary) !important; }}
        a {{ color: var(--primary) !important; }}
        a:hover {{ color: var(--primary-light) !important; }}
        .stApp {{ background-color: var(--background) !important; }}
        [data-testid="stSidebar"] {{ background-color: var(--background-secondary) !important; }}
        .stButton > button {{ background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: var(--text-primary); border: none; transition: all 0.3s ease; }}
        .stButton > button:hover {{ background: linear-gradient(135deg, var(--primary-light) 0%, var(--primary) 100%); box-shadow: 0 0 20px var(--glow); transform: translateY(-2px); }}
        [data-testid="metric-container"] {{ background-color: var(--card-background); border: 1px solid var(--primary); border-radius: 8px; padding: 1rem; box-shadow: 0 0 10px var(--glow); }}
        </style>
        """

def apply_avengers_theme(mode: HeroMode = HeroMode.CAPTAIN):
    import streamlit as st
    theme_manager = AvengersTheme(mode)
    st.markdown(theme_manager.get_css(), unsafe_allow_html=True)
    return theme_manager

def create_theme_switcher():
    import streamlit as st
    if 'theme_manager' not in st.session_state:
        st.session_state.theme_manager = AvengersTheme()
    
    theme_manager = st.session_state.theme_manager
    options = {f"{theme.icon} {theme.display_name}": mode for mode, theme in THEMES.items()}
    
    selected = st.sidebar.selectbox("🦸 Hero Theme", options=list(options.keys()), key="theme_selector")
    
    if selected:
        new_mode = options[selected]
        if new_mode != theme_manager.current_mode:
            theme_manager.current_mode = new_mode
            theme_manager.current_theme = THEMES[new_mode]
            st.rerun()
    
    return theme_manager
