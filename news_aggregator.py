"""
News Aggregator - Live Market News Feed
========================================

RSS aggregation from multiple financial news sources.

Author: ATLAS Development Team
Version: 1.0.0
"""

import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict
from urllib.parse import urlparse

# Handle feedparser import gracefully
try:
    import feedparser
    FEEDPARSER_AVAILABLE = True
except ImportError:
    FEEDPARSER_AVAILABLE = False
    feedparser = None


class NewsAggregator:
    """
    Aggregate news from multiple financial sources via RSS
    """

    def __init__(self):
        """Initialize with news sources"""

        self.sources = {
            'Investing.com': {
                'rss': 'https://www.investing.com/rss/news.rss',
                'color': '#00d4ff'
            },
            'MarketWatch': {
                'rss': 'https://www.marketwatch.com/rss/topstories',
                'color': '#10b981'
            },
            'Yahoo Finance': {
                'rss': 'https://finance.yahoo.com/news/rssindex',
                'color': '#8b5cf6'
            },
            'Bloomberg': {
                'rss': 'https://www.bloomberg.com/feed/podcast/etf-report.xml',
                'color': '#f59e0b'
            },
        }

    def fetch_latest_headlines(self, limit_per_source: int = 5, hours_lookback: int = 24) -> List[Dict]:
        """
        Fetch latest headlines from all sources

        Args:
            limit_per_source: Max headlines per source
            hours_lookback: Only show articles from last N hours

        Returns:
            List of headline dicts sorted by publish time
        """

        all_headlines = []
        cutoff_time = datetime.now() - timedelta(hours=hours_lookback)

        for source_name, source_info in self.sources.items():
            try:
                feed = feedparser.parse(source_info['rss'])

                for entry in feed.entries[:limit_per_source]:
                    # Parse published date
                    try:
                        if hasattr(entry, 'published_parsed'):
                            published = datetime(*entry.published_parsed[:6])
                        elif hasattr(entry, 'updated_parsed'):
                            published = datetime(*entry.updated_parsed[:6])
                        else:
                            published = datetime.now()
                    except:
                        published = datetime.now()

                    # Skip if too old
                    if published < cutoff_time:
                        continue

                    # Extract summary (limit to 200 chars)
                    summary = entry.get('summary', entry.get('description', ''))
                    if summary:
                        # Strip HTML tags
                        import re
                        summary = re.sub('<[^<]+?>', '', summary)
                        summary = summary[:200] + '...' if len(summary) > 200 else summary

                    headline = {
                        'title': entry.title,
                        'source': source_name,
                        'link': entry.link,
                        'published': published,
                        'summary': summary,
                        'color': source_info['color']
                    }

                    all_headlines.append(headline)

            except Exception as e:
                # If source fails, log error but continue with others
                print(f"Error fetching {source_name}: {e}")
                continue

        # Sort by publish time (most recent first)
        all_headlines.sort(key=lambda x: x['published'], reverse=True)

        return all_headlines

    def get_time_ago(self, published: datetime) -> str:
        """
        Get human-readable time difference

        Args:
            published: Published datetime

        Returns:
            String like "5 min ago", "2 hours ago"
        """

        diff = datetime.now() - published

        if diff.days > 0:
            return f"{diff.days} day{'s' if diff.days != 1 else ''} ago"
        elif diff.seconds >= 3600:
            hours = diff.seconds // 3600
            return f"{hours} hour{'s' if hours != 1 else ''} ago"
        elif diff.seconds >= 60:
            minutes = diff.seconds // 60
            return f"{minutes} min ago"
        else:
            return "Just now"


def render_news_feed():
    """
    Render live news feed with filters
    """

    st.markdown("### 📰 Live Market News")
    st.caption("Real-time news aggregated from leading financial publishers")

    # Check if feedparser is available
    if not FEEDPARSER_AVAILABLE:
        st.warning("""
        ⚠️ **News Feed Unavailable**

        The `feedparser` package is not installed. To enable news aggregation, install it with:
        ```
        pip install feedparser
        ```

        Note: Some environments may have compatibility issues with this package.
        """)
        return

    # ============================================================
    # FILTERS
    # ============================================================

    col1, col2, col3 = st.columns([2, 2, 1])

    with col1:
        sources_filter = st.multiselect(
            "Sources",
            ['All', 'Investing.com', 'MarketWatch', 'Yahoo Finance', 'Bloomberg'],
            default=['All'],
            help="Filter by news source"
        )

    with col2:
        time_filter = st.selectbox(
            "Time Range",
            ['Last Hour', 'Last 6 Hours', 'Last 24 Hours', 'Last Week'],
            index=2,
            help="Show news from selected time period"
        )

    with col3:
        if st.button("🔄 Refresh", use_container_width=True):
            # Clear cache to force refresh
            st.cache_data.clear()
            st.rerun()

    # Map time filter to hours
    time_map = {
        'Last Hour': 1,
        'Last 6 Hours': 6,
        'Last 24 Hours': 24,
        'Last Week': 168
    }

    hours_lookback = time_map[time_filter]

    # Auto-refresh toggle
    auto_refresh = st.checkbox(
        "⚡ Auto-refresh (every 5 min)",
        value=False,
        help="Automatically refresh news every 5 minutes"
    )

    if auto_refresh:
        st.info("🔄 Auto-refresh enabled - news will update every 5 minutes")

    st.markdown("---")

    # ============================================================
    # FETCH NEWS
    # ============================================================

    @st.cache_data(ttl=300)  # Cache for 5 minutes
    def get_news(hours):
        """Fetch and cache news"""
        aggregator = NewsAggregator()
        return aggregator.fetch_latest_headlines(limit_per_source=10, hours_lookback=hours)

    headlines = get_news(hours_lookback)

    # Filter by source
    if 'All' not in sources_filter and sources_filter:
        headlines = [h for h in headlines if h['source'] in sources_filter]

    # ============================================================
    # DISPLAY NEWS CARDS
    # ============================================================

    if not headlines:
        st.warning("📭 No news found for selected criteria")
        return

    st.markdown(f"#### 📊 {len(headlines)} Headlines")

    # Create time ago strings
    aggregator = NewsAggregator()

    for headline in headlines:
        time_ago = aggregator.get_time_ago(headline['published'])

        # News card
        st.markdown(f"""
        <div style="
            background: linear-gradient(135deg, rgba(30,41,59,0.95), rgba(15,23,42,0.98));
            border-left: 4px solid {headline['color']};
            padding: 1.25rem;
            border-radius: 0.75rem;
            margin-bottom: 1rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        ">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <span style="
                    background: {headline['color']};
                    color: #0f172a;
                    padding: 0.25rem 0.75rem;
                    border-radius: 0.375rem;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                ">{headline['source']}</span>
                <span style="
                    color: #94a3b8;
                    font-size: 0.8rem;
                ">{time_ago}</span>
            </div>

            <h3 style="
                margin: 0.75rem 0;
                font-size: 1.1rem;
                color: #f8fafc;
                line-height: 1.5;
            ">{headline['title']}</h3>

            <p style="
                margin: 0.5rem 0 1rem 0;
                color: #cbd5e1;
                font-size: 0.9rem;
                line-height: 1.6;
            ">{headline['summary']}</p>

            <a href="{headline['link']}" target="_blank" style="
                color: {headline['color']};
                text-decoration: none;
                font-size: 0.875rem;
                font-weight: 500;
            ">Read More →</a>
        </div>
        """, unsafe_allow_html=True)

    # ============================================================
    # SUMMARY STATS
    # ============================================================

    st.markdown("---")

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Total Headlines", len(headlines))

    with col2:
        sources_count = len(set(h['source'] for h in headlines))
        st.metric("Sources", sources_count)

    with col3:
        # Count headlines from last hour
        last_hour_count = sum(1 for h in headlines if (datetime.now() - h['published']).seconds < 3600)
        st.metric("Last Hour", last_hour_count)

    with col4:
        # Latest news time
        if headlines:
            latest = aggregator.get_time_ago(headlines[0]['published'])
            st.metric("Latest", latest)


# ============================================================
# TESTING
# ============================================================

if __name__ == "__main__":
    """
    Test the news aggregator
    Run with: streamlit run news_aggregator.py
    """

    st.set_page_config(
        page_title="News Aggregator Test",
        page_icon="📰",
        layout="wide"
    )

    st.title("📰 News Aggregator Test")

    render_news_feed()
