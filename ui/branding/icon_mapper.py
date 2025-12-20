"""ATLAS Terminal - Icon Mapper"""

from enum import Enum

class IconStyle(Enum):
    EMOJI = "emoji"
    AVENGERS = "avengers"
    SYMBOL = "symbol"
    MINIMAL = "minimal"

PAGE_ICONS = {
    "home": {"emoji": "🏠", "avengers": "🛡️", "symbol": "⌂", "minimal": "◉"},
    "portfolio_home": {"emoji": "📊", "avengers": "🛡️", "symbol": "◈", "minimal": "◆"},
    "market_watch": {"emoji": "🌍", "avengers": "🌐", "symbol": "◉", "minimal": "○"},
    "risk_analysis": {"emoji": "⚠️", "avengers": "⚡", "symbol": "⚠", "minimal": "▲"},
    "valuation_house": {"emoji": "💰", "avengers": "💎", "symbol": "◇", "minimal": "◊"},
    "performance_suite": {"emoji": "📊", "avengers": "⚡", "symbol": "▣", "minimal": "■"},
    "monte_carlo": {"emoji": "🎲", "avengers": "🌀", "symbol": "∞", "minimal": "∞"},
    "leverage_tracker": {"emoji": "📊", "avengers": "⚡", "symbol": "⤊", "minimal": "↥"},
    "database": {"emoji": "💾", "avengers": "🗄️", "symbol": "▦", "minimal": "▧"},
    "phoenix_parser": {"emoji": "🔥", "avengers": "🔥", "symbol": "ϕ", "minimal": "φ"},
    "settings": {"emoji": "⚙️", "avengers": "⚡", "symbol": "⊙", "minimal": "◉"},
    "about": {"emoji": "ℹ️", "avengers": "🛡️", "symbol": "◎", "minimal": "○"},
}

STATUS_ICONS = {
    "success": {"emoji": "✅", "avengers": "🛡️", "symbol": "✓", "minimal": "√"},
    "error": {"emoji": "❌", "avengers": "💥", "symbol": "✗", "minimal": "×"},
    "warning": {"emoji": "⚠️", "avengers": "⚡", "symbol": "⚠", "minimal": "▲"},
    "info": {"emoji": "ℹ️", "avengers": "💎", "symbol": "◉", "minimal": "○"},
    "loading": {"emoji": "⏳", "avengers": "🌀", "symbol": "◴", "minimal": "◷"},
}

class AvengersIconMapper:
    def __init__(self, style: IconStyle = IconStyle.AVENGERS):
        self.style = style
    
    def get_icon(self, name: str, category: str = "page") -> str:
        icon_dict = PAGE_ICONS if category == "page" else STATUS_ICONS
        icon_config = icon_dict.get(name.lower())
        
        if not icon_config:
            return "◉"
        
        if self.style == IconStyle.EMOJI:
            return icon_config["emoji"]
        elif self.style == IconStyle.AVENGERS:
            return icon_config["avengers"]
        elif self.style == IconStyle.SYMBOL:
            return icon_config["symbol"]
        elif self.style == IconStyle.MINIMAL:
            return icon_config["minimal"]
        
        return icon_config["avengers"]

def get_page_icon(page_name: str, style: IconStyle = IconStyle.AVENGERS) -> str:
    mapper = AvengersIconMapper(style)
    return mapper.get_icon(page_name, "page")

def get_status_icon(status: str, style: IconStyle = IconStyle.AVENGERS) -> str:
    mapper = AvengersIconMapper(style)
    return mapper.get_icon(status, "status")
