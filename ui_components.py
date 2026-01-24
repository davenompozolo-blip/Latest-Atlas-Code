"""
═══════════════════════════════════════════════════════════════════════════════
ATLAS TERMINAL - OFFICIAL UI COMPONENT LIBRARY
═══════════════════════════════════════════════════════════════════════════════

This is THE OFFICIAL design system for ATLAS Terminal.

ALL new features, pages, and components MUST use the card designs defined in
this file. NO EXCEPTIONS.

═══════════════════════════════════════════════════════════════════════════════
DESIGN VERSION: v2.0 (Gradient Borders + Icons + Glassmorphic)
LAST UPDATED: January 2026
DESIGN LEAD: Hlobo
═══════════════════════════════════════════════════════════════════════════════

KEY DESIGN PRINCIPLES:
═══════════════════════════════════════════════════════════════════════════════

1. ALWAYS use create_metric_card() for ALL metric displays
2. ALWAYS use st.markdown(card, unsafe_allow_html=True) to render
3. NEVER use st.write() for HTML content - it will show raw HTML!
4. ALL cards have (Capital Structure style):
   - TOP gradient bar (3px, horizontal gradient)
   - Icon + title in top-left
   - Glassmorphic background (backdrop-filter: blur)
   - 20-24px border radius
   - Hover animations
   - Box shadow effects

═══════════════════════════════════════════════════════════════════════════════
USAGE EXAMPLE:
═══════════════════════════════════════════════════════════════════════════════

    from ui_components import create_metric_card

    # Create card
    card = create_metric_card(
        title="VIX",
        value="14.51",
        change="-0.44",
        icon="📊",
        border_color="#3b82f6"
    )

    # Render (CRITICAL: MUST use st.markdown with unsafe_allow_html=True)
    st.markdown(card, unsafe_allow_html=True)  # ← CORRECT

    # NEVER DO THIS:
    # st.write(card)  # ← WRONG! Shows raw HTML!

═══════════════════════════════════════════════════════════════════════════════
COMMON BORDER COLORS:
═══════════════════════════════════════════════════════════════════════════════

    #3b82f6 - Blue (primary, default)
    #10b981 - Green (positive/success)
    #ef4444 - Red (negative/error)
    #f59e0b - Amber (warning)
    #8b5cf6 - Purple (info)
    #06b6d4 - Cyan (secondary)

═══════════════════════════════════════════════════════════════════════════════
"""

import streamlit as st


def create_metric_card(title: str, value: str, change: str = None, icon: str = "📊", border_color: str = "#3b82f6") -> str:
    """
    THE STANDARD metric card for ATLAS Terminal.

    USE THIS FOR ALL METRICS - NO EXCEPTIONS.

    Design: Gradient background + colored left border + icon + hover effect

    Args:
        title (str): Card label (e.g., "VIX", "Total Stocks", "Portfolio Value")
        value (str): Main value to display (e.g., "14.51", "1,243", "$108,796")
        change (str, optional): Change indicator (e.g., "-0.44", "+2.5%")
        icon (str): Emoji icon (default: 📊)
        border_color (str): Hex color for left border (default: #3b82f6)

    Returns:
        str: HTML string

    CRITICAL: Render with st.markdown(card, unsafe_allow_html=True)
              NEVER use st.write() - it will show raw HTML!

    Example:
        >>> card = create_metric_card("VIX", "14.51", "-0.44", "📊", "#3b82f6")
        >>> st.markdown(card, unsafe_allow_html=True)
    """

    # Determine change color
    if change:
        # Parse change to determine color
        try:
            change_clean = change.replace('%', '').replace('+', '').replace('$', '').replace(',', '')
            change_num = float(change_clean)
        except:
            change_num = 0

        change_color = "#10b981" if change_num >= 0 else "#ef4444"
        change_prefix = "↑" if change_num >= 0 else "↓"
    else:
        change_color = "#94a3b8"
        change_prefix = ""

    # FIGMA REDESIGN: Subtle gray border, JetBrains Mono typography
    html = f"""
    <div style="
        background: rgba(15, 21, 32, 0.6);
        backdrop-filter: blur(20px);
        padding: 1.5rem;
        border-radius: 12px;
        border: 1px solid rgb(31, 41, 55);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        height: 100%;
        position: relative;
        overflow: hidden;
        transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
    " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 32px rgba(0,0,0,0.4)'; this.style.borderColor='rgb(55, 65, 81)';"
       onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 24px rgba(0,0,0,0.3)'; this.style.borderColor='rgb(31, 41, 55)';">

        <div style="display: flex; align-items: center; margin-bottom: 0.75rem;">
            <span style="font-size: 1.25rem; margin-right: 0.5rem;">{icon}</span>
            <p style="margin: 0; font-size: 0.7rem; font-weight: 500; text-transform: uppercase;
                      letter-spacing: 0.1em; color: rgb(156, 163, 175); font-family: 'JetBrains Mono', monospace;">
                {title}
            </p>
        </div>

        <h2 style="margin: 0.5rem 0 0 0; font-size: 1.75rem; font-weight: 600;
                   color: rgb(229, 231, 235); font-family: 'JetBrains Mono', monospace;">
            {value}
        </h2>

        {f'''<p style="margin: 0.5rem 0 0 0; font-size: 0.875rem; color: {change_color}; font-weight: 600; font-family: 'JetBrains Mono', monospace;">
            {change_prefix} {change}
        </p>''' if change else ''}
    </div>
    """

    return html


def create_regime_card(regime_status: str, score: int, vix: float, yield_curve: float, breadth: float) -> str:
    """
    Large regime indicator card

    Args:
        regime_status: RISK-ON / RISK-OFF / NEUTRAL
        score: Regime score (-10 to +10)
        vix: VIX value
        yield_curve: Yield curve spread (10Y-2Y)
        breadth: Market breadth

    Returns:
        HTML string for regime card
    """

    emoji_map = {
        'RISK-ON': '🟢',
        'RISK-OFF': '🔴',
        'NEUTRAL': '🟡'
    }

    color_map = {
        'RISK-ON': '#10b981',
        'RISK-OFF': '#ef4444',
        'NEUTRAL': '#fbbf24'
    }

    emoji = emoji_map.get(regime_status, '🟡')
    accent_color = color_map.get(regime_status, '#fbbf24')

    # FIGMA REDESIGN: Subtle border with accent dot instead of gradient bar
    html = f"""
    <div style="
        background: rgba(15, 21, 32, 0.6);
        backdrop-filter: blur(20px);
        padding: 1.5rem;
        border-radius: 12px;
        border: 1px solid rgb(31, 41, 55);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        position: relative;
        overflow: hidden;
        transition: all 0.3s ease;
    ">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
            <div style="width: 10px; height: 10px; border-radius: 50%; background: {accent_color}; opacity: 0.8; box-shadow: 0 0 10px {accent_color};"></div>
            <h3 style="margin: 0; font-size: 0.875rem; font-weight: 500; color: rgb(156, 163, 175); font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.1em;">
                Market Regime
            </h3>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 1rem;">
            <span style="font-size: 2rem; margin-right: 0.75rem;">{emoji}</span>
            <div>
                <h2 style="margin: 0; font-size: 1.5rem; font-weight: 600; color: {accent_color}; font-family: 'JetBrains Mono', monospace;">
                    {regime_status}
                </h2>
                <p style="margin: 0.25rem 0 0 0; font-size: 0.75rem; color: rgb(107, 114, 128); font-family: 'JetBrains Mono', monospace;">
                    Score: {score:+d}/10
                </p>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgb(31, 41, 55);">
            <div>
                <p style="margin: 0; font-size: 0.7rem; color: rgb(107, 114, 128); text-transform: uppercase; letter-spacing: 0.05em; font-family: 'JetBrains Mono', monospace;">VIX</p>
                <p style="margin: 0.25rem 0 0 0; font-size: 1.25rem; font-weight: 600; color: rgb(229, 231, 235); font-family: 'JetBrains Mono', monospace;">{vix:.2f}</p>
            </div>
            <div>
                <p style="margin: 0; font-size: 0.7rem; color: rgb(107, 114, 128); text-transform: uppercase; letter-spacing: 0.05em; font-family: 'JetBrains Mono', monospace;">Yield Curve</p>
                <p style="margin: 0.25rem 0 0 0; font-size: 1.25rem; font-weight: 600; color: rgb(229, 231, 235); font-family: 'JetBrains Mono', monospace;">{yield_curve:+.2f}%</p>
            </div>
            <div>
                <p style="margin: 0; font-size: 0.7rem; color: rgb(107, 114, 128); text-transform: uppercase; letter-spacing: 0.05em; font-family: 'JetBrains Mono', monospace;">Breadth</p>
                <p style="margin: 0.25rem 0 0 0; font-size: 1.25rem; font-weight: 600; color: rgb(229, 231, 235); font-family: 'JetBrains Mono', monospace;">{breadth:+.2f}%</p>
            </div>
        </div>
    </div>
    """

    return html


def create_index_card(name: str, ticker: str, price: float, change: float, change_pct: float, icon: str = "📈") -> str:
    """
    Index display card with price and change

    Args:
        name: Index name (e.g., "S&P 500")
        ticker: Ticker symbol (e.g., "^GSPC")
        price: Current price
        change: Absolute change
        change_pct: Percentage change

    Returns:
        HTML string for index card
    """

    change_color = "#10b981" if change >= 0 else "#ef4444"
    border_color = "#10b981" if change >= 0 else "#ef4444"
    arrow = "↑" if change >= 0 else "↓"

    # FIGMA REDESIGN: Subtle gray border with JetBrains Mono
    html = f"""
    <div style="
        background: rgba(15, 21, 32, 0.6);
        backdrop-filter: blur(20px);
        padding: 1rem;
        border-radius: 12px;
        border: 1px solid rgb(31, 41, 55);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        margin-bottom: 0.75rem;
        position: relative;
        overflow: hidden;
        transition: all 0.2s ease;
    " onmouseover="this.style.borderColor='rgb(55, 65, 81)'; this.style.transform='translateY(-2px)';"
       onmouseout="this.style.borderColor='rgb(31, 41, 55)'; this.style.transform='translateY(0)';">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="display: flex; align-items: center; margin-bottom: 0.25rem;">
                    <span style="font-size: 1rem; margin-right: 0.5rem;">{icon}</span>
                    <p style="margin: 0; font-size: 0.875rem; font-weight: 500; color: rgb(229, 231, 235); font-family: 'JetBrains Mono', monospace;">
                        {name}
                    </p>
                </div>
                <p style="margin: 0; font-size: 0.7rem; color: rgb(107, 114, 128); font-family: 'JetBrains Mono', monospace;">
                    {ticker}
                </p>
            </div>
            <div style="text-align: right;">
                <p style="margin: 0; font-size: 1.25rem; font-weight: 600; color: rgb(229, 231, 235); font-family: 'JetBrains Mono', monospace;">
                    ${price:,.2f}
                </p>
                <p style="margin: 0.25rem 0 0 0; font-size: 0.875rem; color: {change_color}; font-weight: 600; font-family: 'JetBrains Mono', monospace;">
                    {arrow} {change:+.2f} ({change_pct:+.2f}%)
                </p>
            </div>
        </div>
    </div>
    """

    return html


def create_stock_screener_summary_card(total_stocks: int, filters_active: int, results_count: int) -> str:
    """
    Stock screener summary card

    Args:
        total_stocks: Total stocks in universe
        filters_active: Number of active filters
        results_count: Number of results matching filters

    Returns:
        HTML string for summary card
    """

    # FIGMA REDESIGN: Subtle gray border with JetBrains Mono
    html = f"""
    <div style="
        background: rgba(15, 21, 32, 0.6);
        border: 1px solid rgb(31, 41, 55);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1rem;
    ">
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem;">
            <div>
                <p style="margin: 0; font-size: 0.7rem; color: rgb(107, 114, 128); text-transform: uppercase; letter-spacing: 0.1em; font-family: 'JetBrains Mono', monospace;">
                    Total Stocks
                </p>
                <p style="margin: 0.5rem 0 0 0; font-size: 1.5rem; font-weight: 600; color: rgb(229, 231, 235); font-family: 'JetBrains Mono', monospace;">
                    {total_stocks:,}
                </p>
            </div>
            <div>
                <p style="margin: 0; font-size: 0.7rem; color: rgb(107, 114, 128); text-transform: uppercase; letter-spacing: 0.1em; font-family: 'JetBrains Mono', monospace;">
                    Filters Active
                </p>
                <p style="margin: 0.5rem 0 0 0; font-size: 1.5rem; font-weight: 600; color: rgb(229, 231, 235); font-family: 'JetBrains Mono', monospace;">
                    {filters_active}
                </p>
            </div>
            <div>
                <p style="margin: 0; font-size: 0.7rem; color: rgb(107, 114, 128); text-transform: uppercase; letter-spacing: 0.1em; font-family: 'JetBrains Mono', monospace;">
                    Results Found
                </p>
                <p style="margin: 0.5rem 0 0 0; font-size: 1.5rem; font-weight: 600; color: rgb(229, 231, 235); font-family: 'JetBrains Mono', monospace;">
                    {results_count:,}
                </p>
            </div>
        </div>
    </div>
    """

    return html
