"""
ATLAS TERMINAL v10.0 - LIVE DATA UPGRADE SYSTEM
================================================

Bloomberg Terminal-style live data system with:
- Market status detection (OPEN/CLOSED/PRE-MARKET/AFTER-HOURS)
- Multi-tier caching (15s / 1m / 5m / 1h)
- Auto-refresh logic
- Data freshness indicators
- Pulsing live indicators
- Staleness warnings

Makes ATLAS feel like a professional trading terminal! 🔥
"""

import streamlit as st
import pandas as pd
import numpy as np
from datetime import datetime, time, timedelta
from typing import Dict, List, Optional, Tuple
import pytz
from enum import Enum
import time as time_module


# ===================================================================
# MARKET STATUS
# ===================================================================

class MarketStatus(Enum):
    """Market trading status"""
    PRE_MARKET = "Pre-Market"
    OPEN = "Open"
    CLOSED = "Closed"
    AFTER_HOURS = "After-Hours"


class MarketStatusDetector:
    """
    Detect current market status based on time.
    """

    def __init__(self, timezone: str = "America/New_York"):
        self.timezone = pytz.timezone(timezone)

        # US Market hours (Eastern Time)
        self.pre_market_start = time(4, 0)   # 4:00 AM ET
        self.market_open = time(9, 30)       # 9:30 AM ET
        self.market_close = time(16, 0)      # 4:00 PM ET
        self.after_hours_end = time(20, 0)   # 8:00 PM ET

    def get_current_status(self) -> MarketStatus:
        """
        Get current market status.
        """
        now = datetime.now(self.timezone)
        current_time = now.time()

        # Check if it's a weekend
        if now.weekday() >= 5:  # Saturday = 5, Sunday = 6
            return MarketStatus.CLOSED

        # Check time of day
        if self.pre_market_start <= current_time < self.market_open:
            return MarketStatus.PRE_MARKET
        elif self.market_open <= current_time < self.market_close:
            return MarketStatus.OPEN
        elif self.market_close <= current_time < self.after_hours_end:
            return MarketStatus.AFTER_HOURS
        else:
            return MarketStatus.CLOSED

    def get_next_open_time(self) -> datetime:
        """
        Get next market open time.
        """
        now = datetime.now(self.timezone)
        next_open = now.replace(hour=9, minute=30, second=0, microsecond=0)

        # If already past today's open, go to next business day
        if now.time() >= self.market_open:
            next_open += timedelta(days=1)

        # Skip weekends
        while next_open.weekday() >= 5:
            next_open += timedelta(days=1)

        return next_open

    def get_time_until_open(self) -> timedelta:
        """
        Get time remaining until market opens.
        """
        next_open = self.get_next_open_time()
        now = datetime.now(self.timezone)
        return next_open - now


# ===================================================================
# DATA FRESHNESS TIERS
# ===================================================================

class FreshnessTier(Enum):
    """Data freshness tiers"""
    REAL_TIME = "real-time"      # < 15 seconds
    FRESH = "fresh"               # 15s - 1 min
    RECENT = "recent"             # 1 min - 5 min
    STALE = "stale"               # 5 min - 1 hour
    VERY_STALE = "very_stale"    # > 1 hour


class DataFreshnessTracker:
    """
    Track data freshness and provide quality indicators.
    """

    @staticmethod
    def get_freshness_tier(timestamp: datetime) -> FreshnessTier:
        """
        Determine freshness tier based on timestamp age.
        """
        age = datetime.now() - timestamp

        if age.total_seconds() < 15:
            return FreshnessTier.REAL_TIME
        elif age.total_seconds() < 60:
            return FreshnessTier.FRESH
        elif age.total_seconds() < 300:  # 5 minutes
            return FreshnessTier.RECENT
        elif age.total_seconds() < 3600:  # 1 hour
            return FreshnessTier.STALE
        else:
            return FreshnessTier.VERY_STALE

    @staticmethod
    def get_freshness_color(tier: FreshnessTier) -> str:
        """
        Get color for freshness indicator.
        """
        colors = {
            FreshnessTier.REAL_TIME: "#00ff00",    # Bright green
            FreshnessTier.FRESH: "#90ee90",        # Light green
            FreshnessTier.RECENT: "#ffff00",       # Yellow
            FreshnessTier.STALE: "#ffa500",        # Orange
            FreshnessTier.VERY_STALE: "#ff0000"    # Red
        }
        return colors.get(tier, "#ffffff")

    @staticmethod
    def get_freshness_emoji(tier: FreshnessTier) -> str:
        """
        Get emoji for freshness indicator.
        """
        emojis = {
            FreshnessTier.REAL_TIME: "🟢",
            FreshnessTier.FRESH: "🟢",
            FreshnessTier.RECENT: "🟡",
            FreshnessTier.STALE: "🟠",
            FreshnessTier.VERY_STALE: "🔴"
        }
        return emojis.get(tier, "⚪")

    @staticmethod
    def format_age(timestamp: datetime) -> str:
        """
        Format data age in human-readable format.
        """
        age = datetime.now() - timestamp

        if age.total_seconds() < 60:
            return f"{int(age.total_seconds())}s ago"
        elif age.total_seconds() < 3600:
            return f"{int(age.total_seconds() / 60)}m ago"
        elif age.total_seconds() < 86400:
            return f"{int(age.total_seconds() / 3600)}h ago"
        else:
            return f"{int(age.total_seconds() / 86400)}d ago"


# ===================================================================
# LIVE DATA CACHE
# ===================================================================

class LiveDataCache:
    """
    Multi-tier caching system for live data.
    """

    def __init__(self):
        self.cache = {}
        self.cache_tiers = {
            'tier1': 15,      # 15 seconds
            'tier2': 60,      # 1 minute
            'tier3': 300,     # 5 minutes
            'tier4': 3600     # 1 hour
        }

    def set(self, key: str, value: any, tier: str = 'tier2'):
        """
        Store data in cache with timestamp.
        """
        self.cache[key] = {
            'value': value,
            'timestamp': datetime.now(),
            'tier': tier
        }

    def get(self, key: str) -> Optional[Dict]:
        """
        Get data from cache if not expired.

        Returns dict with 'value', 'timestamp', 'tier', 'is_fresh'
        """
        if key not in self.cache:
            return None

        cached = self.cache[key]
        age = (datetime.now() - cached['timestamp']).total_seconds()
        tier_max_age = self.cache_tiers.get(cached['tier'], 60)

        # Check if expired
        if age > tier_max_age:
            del self.cache[key]
            return None

        return {
            'value': cached['value'],
            'timestamp': cached['timestamp'],
            'tier': cached['tier'],
            'is_fresh': age < tier_max_age / 2  # Fresh if less than half the max age
        }

    def clear_expired(self):
        """
        Remove expired entries from cache.
        """
        keys_to_remove = []

        for key, cached in self.cache.items():
            age = (datetime.now() - cached['timestamp']).total_seconds()
            tier_max_age = self.cache_tiers.get(cached['tier'], 60)

            if age > tier_max_age:
                keys_to_remove.append(key)

        for key in keys_to_remove:
            del self.cache[key]

    def get_cache_stats(self) -> Dict:
        """
        Get cache statistics.
        """
        stats = {
            'total_entries': len(self.cache),
            'by_tier': {},
            'by_freshness': {}
        }

        for cached in self.cache.values():
            # Count by tier
            tier = cached['tier']
            stats['by_tier'][tier] = stats['by_tier'].get(tier, 0) + 1

            # Count by freshness
            freshness = DataFreshnessTracker.get_freshness_tier(cached['timestamp'])
            stats['by_freshness'][freshness.value] = stats['by_freshness'].get(freshness.value, 0) + 1

        return stats


# ===================================================================
# AUTO-REFRESH MANAGER
# ===================================================================

class AutoRefreshManager:
    """
    Manage auto-refresh intervals based on market status.
    """

    def __init__(self):
        self.market_detector = MarketStatusDetector()

    def get_refresh_interval(self) -> int:
        """
        Get recommended refresh interval in seconds based on market status.
        """
        status = self.market_detector.get_current_status()

        intervals = {
            MarketStatus.OPEN: 15,          # 15 seconds during market hours
            MarketStatus.PRE_MARKET: 60,    # 1 minute pre-market
            MarketStatus.AFTER_HOURS: 60,   # 1 minute after hours
            MarketStatus.CLOSED: 300        # 5 minutes when closed
        }

        return intervals.get(status, 60)

    def should_refresh(self, last_refresh: datetime) -> bool:
        """
        Determine if data should be refreshed.
        """
        interval = self.get_refresh_interval()
        age = (datetime.now() - last_refresh).total_seconds()

        return age >= interval


# ===================================================================
# STREAMLIT UI COMPONENTS
# ===================================================================

def display_market_status_banner():
    """
    Display market status banner at top of page.
    """
    detector = MarketStatusDetector()
    status = detector.get_current_status()

    # Status colors
    colors = {
        MarketStatus.OPEN: "#00ff00",
        MarketStatus.PRE_MARKET: "#ffff00",
        MarketStatus.AFTER_HOURS: "#ffa500",
        MarketStatus.CLOSED: "#ff0000"
    }

    color = colors.get(status, "#ffffff")

    # Create banner
    if status == MarketStatus.OPEN:
        st.markdown(
            f"""
            <div style="background-color: {color}; padding: 10px; border-radius: 5px; text-align: center; animation: pulse 2s infinite;">
                <h3 style="color: black; margin: 0;">🔴 MARKET OPEN - LIVE DATA</h3>
            </div>
            <style>
            @keyframes pulse {{
                0%, 100% {{ opacity: 1; }}
                50% {{ opacity: 0.7; }}
            }}
            </style>
            """,
            unsafe_allow_html=True
        )
    elif status == MarketStatus.CLOSED:
        time_until_open = detector.get_time_until_open()
        hours = int(time_until_open.total_seconds() // 3600)
        minutes = int((time_until_open.total_seconds() % 3600) // 60)

        st.markdown(
            f"""
            <div style="background-color: {color}; padding: 10px; border-radius: 5px; text-align: center;">
                <h3 style="color: white; margin: 0;">⚫ MARKET CLOSED - Opens in {hours}h {minutes}m</h3>
            </div>
            """,
            unsafe_allow_html=True
        )
    else:
        st.markdown(
            f"""
            <div style="background-color: {color}; padding: 10px; border-radius: 5px; text-align: center;">
                <h3 style="color: black; margin: 0;">🟡 {status.value.upper()}</h3>
            </div>
            """,
            unsafe_allow_html=True
        )


def display_data_freshness_indicator(timestamp: datetime, label: str = "Last Update"):
    """
    Display data freshness indicator.
    """
    tier = DataFreshnessTracker.get_freshness_tier(timestamp)
    emoji = DataFreshnessTracker.get_freshness_emoji(tier)
    age_str = DataFreshnessTracker.format_age(timestamp)

    st.markdown(
        f"""
        <div style="display: inline-block; padding: 5px 10px; background-color: #1e1e1e; border-radius: 5px;">
            {emoji} <strong>{label}:</strong> {age_str} ({tier.value})
        </div>
        """,
        unsafe_allow_html=True
    )


def display_live_price_ticker(ticker: str, price: float, change: float, change_pct: float):
    """
    Display live price ticker with pulsing animation.
    """
    color = "#00ff00" if change >= 0 else "#ff0000"
    arrow = "▲" if change >= 0 else "▼"

    st.markdown(
        f"""
        <div style="background-color: #1e1e1e; padding: 15px; border-radius: 10px; border-left: 5px solid {color}; animation: glow 2s infinite;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h2 style="margin: 0; color: white;">{ticker}</h2>
                </div>
                <div style="text-align: right;">
                    <h2 style="margin: 0; color: white;">${price:.2f}</h2>
                    <p style="margin: 0; color: {color};">
                        {arrow} ${abs(change):.2f} ({change_pct:+.2f}%)
                    </p>
                </div>
            </div>
        </div>
        <style>
        @keyframes glow {{
            0%, 100% {{ box-shadow: 0 0 5px {color}; }}
            50% {{ box-shadow: 0 0 20px {color}; }}
        }}
        </style>
        """,
        unsafe_allow_html=True
    )


def setup_auto_refresh_ui():
    """
    Setup auto-refresh UI in sidebar.
    """
    with st.sidebar:
        st.markdown("### 🔄 Auto-Refresh")

        # Initialize session state
        if 'auto_refresh_enabled' not in st.session_state:
            st.session_state.auto_refresh_enabled = False

        if 'last_refresh' not in st.session_state:
            st.session_state.last_refresh = datetime.now()

        # Auto-refresh toggle
        auto_refresh = st.checkbox(
            "Enable Auto-Refresh",
            value=st.session_state.auto_refresh_enabled
        )

        st.session_state.auto_refresh_enabled = auto_refresh

        if auto_refresh:
            manager = AutoRefreshManager()
            interval = manager.get_refresh_interval()

            st.caption(f"Refresh interval: {interval}s")

            # Manual refresh button
            if st.button("🔄 Refresh Now"):
                st.session_state.last_refresh = datetime.now()
                st.rerun()

            # Auto-refresh logic
            if manager.should_refresh(st.session_state.last_refresh):
                st.session_state.last_refresh = datetime.now()
                time_module.sleep(0.1)  # Small delay
                st.rerun()

            # Show countdown
            time_since_refresh = (datetime.now() - st.session_state.last_refresh).total_seconds()
            time_until_refresh = max(0, interval - time_since_refresh)

            st.progress(time_since_refresh / interval)
            st.caption(f"Next refresh in: {int(time_until_refresh)}s")


# ===================================================================
# EXAMPLE USAGE
# ===================================================================

if __name__ == "__main__":
    print("="*80)
    print("ATLAS TERMINAL - LIVE DATA UPGRADE SYSTEM")
    print("="*80)

    # Test market status
    detector = MarketStatusDetector()
    status = detector.get_current_status()
    print(f"\nCurrent Market Status: {status.value}")

    if status == MarketStatus.CLOSED:
        time_until = detector.get_time_until_open()
        hours = int(time_until.total_seconds() // 3600)
        minutes = int((time_until.total_seconds() % 3600) // 60)
        print(f"Time until open: {hours}h {minutes}m")

    # Test freshness tracking
    timestamp = datetime.now() - timedelta(seconds=30)
    tier = DataFreshnessTracker.get_freshness_tier(timestamp)
    age = DataFreshnessTracker.format_age(timestamp)

    print(f"\nData age: {age}")
    print(f"Freshness tier: {tier.value}")

    # Test cache
    cache = LiveDataCache()
    cache.set('AAPL', {'price': 150.0}, 'tier1')

    cached = cache.get('AAPL')
    if cached:
        print(f"\nCached data: {cached['value']}")
        print(f"Is fresh: {cached['is_fresh']}")

    print("\n" + "="*80)
