"""
Smart caching system for ATLAS Terminal.

Handles multiple cache layers:
1. In-memory cache (fastest, session-only)
2. Disk cache (persistent across sessions)
3. Smart invalidation (TTL + conditional)
"""

import streamlit as st
import pickle
import time
from pathlib import Path
from typing import Any, Optional, Callable
from functools import wraps
import hashlib
import json

class CacheManager:
    """
    Centralized cache management with multiple layers.

    Features:
    - In-memory caching (st.session_state)
    - Disk caching (pickle files)
    - TTL-based expiration
    - Smart invalidation
    - Cache statistics
    """

    def __init__(self, cache_dir: str = "data/cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Initialize cache stats in session state
        if 'cache_stats' not in st.session_state:
            st.session_state.cache_stats = {
                'hits': 0,
                'misses': 0,
                'disk_hits': 0,
                'disk_writes': 0
            }

    def get_cache_key(self, func_name: str, *args, **kwargs) -> str:
        """Generate unique cache key from function name and arguments."""
        key_data = {
            'func': func_name,
            'args': args,
            'kwargs': kwargs
        }
        key_str = json.dumps(key_data, sort_keys=True, default=str)
        return hashlib.md5(key_str.encode()).hexdigest()

    def get(self, key: str, ttl: Optional[int] = None) -> Optional[Any]:
        """
        Get cached value.

        Args:
            key: Cache key
            ttl: Time-to-live in seconds (None = no expiration)

        Returns:
            Cached value or None if not found/expired
        """
        # Try memory cache first (fastest)
        if key in st.session_state:
            cached = st.session_state[key]

            # Check expiration
            if ttl is None or (time.time() - cached['timestamp']) < ttl:
                st.session_state.cache_stats['hits'] += 1
                return cached['value']

        # Try disk cache (slower but persistent)
        cache_file = self.cache_dir / f"{key}.pkl"
        if cache_file.exists():
            try:
                with open(cache_file, 'rb') as f:
                    cached = pickle.load(f)

                # Check expiration
                if ttl is None or (time.time() - cached['timestamp']) < ttl:
                    # Load into memory cache for faster access
                    st.session_state[key] = cached
                    st.session_state.cache_stats['disk_hits'] += 1
                    return cached['value']
                else:
                    # Expired, delete
                    cache_file.unlink()
            except:
                pass

        st.session_state.cache_stats['misses'] += 1
        return None

    def set(self, key: str, value: Any, persist: bool = True):
        """
        Set cached value.

        Args:
            key: Cache key
            value: Value to cache
            persist: Whether to persist to disk
        """
        cached = {
            'value': value,
            'timestamp': time.time()
        }

        # Always set in memory
        st.session_state[key] = cached

        # Optionally persist to disk
        if persist:
            try:
                cache_file = self.cache_dir / f"{key}.pkl"
                with open(cache_file, 'wb') as f:
                    pickle.dump(cached, f)
                st.session_state.cache_stats['disk_writes'] += 1
            except:
                pass

    def clear(self, pattern: Optional[str] = None):
        """Clear cache (optionally by pattern)."""
        if pattern is None:
            # Clear all
            keys_to_delete = [k for k in st.session_state.keys()
                             if not k.startswith('_')]
            for key in keys_to_delete:
                del st.session_state[key]

            # Clear disk cache
            for cache_file in self.cache_dir.glob("*.pkl"):
                cache_file.unlink()
        else:
            # Clear matching pattern
            keys_to_delete = [k for k in st.session_state.keys()
                             if pattern in k]
            for key in keys_to_delete:
                del st.session_state[key]

    def get_stats(self) -> dict:
        """Get cache statistics."""
        stats = st.session_state.cache_stats
        total = stats['hits'] + stats['misses']
        hit_rate = (stats['hits'] / total * 100) if total > 0 else 0

        return {
            'hits': stats['hits'],
            'misses': stats['misses'],
            'hit_rate': f"{hit_rate:.1f}%",
            'disk_hits': stats['disk_hits'],
            'disk_writes': stats['disk_writes'],
            'memory_keys': len([k for k in st.session_state.keys()
                               if not k.startswith('_')])
        }


# Global cache manager instance
cache_manager = CacheManager()


def cached(ttl: int = 3600, persist: bool = True, key_prefix: str = ""):
    """
    Decorator for caching function results.

    Args:
        ttl: Time-to-live in seconds (default 1 hour)
        persist: Whether to persist to disk
        key_prefix: Optional prefix for cache key

    Example:
        @cached(ttl=1800, persist=True)
        def fetch_stock_data(ticker):
            return yf.Ticker(ticker).history(period="1y")
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = cache_manager.get_cache_key(
                f"{key_prefix}{func.__name__}",
                *args,
                **kwargs
            )

            # Try to get from cache
            cached_value = cache_manager.get(cache_key, ttl=ttl)
            if cached_value is not None:
                return cached_value

            # Cache miss - compute value
            value = func(*args, **kwargs)

            # Store in cache
            cache_manager.set(cache_key, value, persist=persist)

            return value

        return wrapper
    return decorator
