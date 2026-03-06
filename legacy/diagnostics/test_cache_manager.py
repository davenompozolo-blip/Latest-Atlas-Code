"""
Test cache manager functionality.
"""

import time
import sys
from pathlib import Path

# Add atlas_terminal to path
sys.path.insert(0, str(Path(__file__).parent))

# Mock streamlit for testing
class MockSessionState(dict):
    """Mock st.session_state for testing."""
    pass

class MockStreamlit:
    """Mock streamlit module for testing."""
    session_state = MockSessionState()

sys.modules['streamlit'] = MockStreamlit()
import streamlit as st

# Now import cache manager
from atlas_terminal.core.cache_manager import cached, cache_manager

def test_basic_caching():
    """Test basic caching functionality."""
    print("Testing basic caching...")

    call_count = {'count': 0}

    @cached(ttl=60, persist=False)
    def test_function(x):
        call_count['count'] += 1
        return x * 2

    # First call - should compute
    result1 = test_function(5)
    assert result1 == 10, f"Expected 10, got {result1}"
    assert call_count['count'] == 1, f"Expected 1 call, got {call_count['count']}"

    # Second call - should use cache
    result2 = test_function(5)
    assert result2 == 10, f"Expected 10, got {result2}"
    assert call_count['count'] == 1, f"Expected 1 call (cached), got {call_count['count']}"

    print("✅ Basic caching works!")
    return True

def test_cache_expiration():
    """Test TTL-based expiration."""
    print("\nTesting cache expiration...")

    call_count = {'count': 0}

    @cached(ttl=1, persist=False)  # 1 second TTL
    def test_function(x):
        call_count['count'] += 1
        return x * 3

    # First call
    result1 = test_function(3)
    assert result1 == 9
    assert call_count['count'] == 1

    # Wait for expiration
    time.sleep(1.1)

    # Should recompute after expiration
    result2 = test_function(3)
    assert result2 == 9
    assert call_count['count'] == 2, f"Expected 2 calls (expired), got {call_count['count']}"

    print("✅ Cache expiration works!")
    return True

def test_cache_stats():
    """Test cache statistics."""
    print("\nTesting cache statistics...")

    # Clear stats
    st.session_state.cache_stats = {
        'hits': 0,
        'misses': 0,
        'disk_hits': 0,
        'disk_writes': 0
    }

    @cached(ttl=60, persist=False)
    def test_function(x):
        return x * 4

    # First call - miss
    test_function(4)
    stats = cache_manager.get_stats()
    assert stats['misses'] == 1, f"Expected 1 miss, got {stats['misses']}"

    # Second call - hit
    test_function(4)
    stats = cache_manager.get_stats()
    assert stats['hits'] == 1, f"Expected 1 hit, got {stats['hits']}"

    print("✅ Cache statistics work!")
    print(f"   Hit rate: {stats['hit_rate']}")
    return True

def test_different_arguments():
    """Test caching with different arguments."""
    print("\nTesting different arguments...")

    call_count = {'count': 0}

    @cached(ttl=60, persist=False)
    def test_function(x, y=1):
        call_count['count'] += 1
        return x * y

    # Different arguments should not share cache
    result1 = test_function(5, 2)
    assert result1 == 10
    assert call_count['count'] == 1

    result2 = test_function(5, 3)
    assert result2 == 15
    assert call_count['count'] == 2  # Different args, new computation

    result3 = test_function(5, 2)
    assert result3 == 10
    assert call_count['count'] == 2  # Same as first call, should be cached

    print("✅ Argument-based caching works!")
    return True

def run_all_tests():
    """Run all cache manager tests."""
    print("=" * 60)
    print("CACHE MANAGER TESTS")
    print("=" * 60)

    tests = [
        test_basic_caching,
        test_cache_expiration,
        test_cache_stats,
        test_different_arguments
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            if test():
                passed += 1
        except Exception as e:
            print(f"❌ {test.__name__} FAILED: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 60)

    if failed == 0:
        print("\n🎉 ALL TESTS PASSED!")
        return True
    else:
        print(f"\n⚠️ {failed} TEST(S) FAILED")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
