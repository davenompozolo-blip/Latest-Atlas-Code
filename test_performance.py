"""
ATLAS Performance Testing - Phase 1 Week 1
Tests cache performance and speed improvements
"""

import time
import sys
from atlas_terminal.core.cache_manager import cache_manager
from atlas_terminal.data.fetchers.market_data import market_data

# Test tickers - mix of popular and less common stocks
TEST_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'JPM', 'BAC', 'WMT', 'DIS', 'NFLX', 'AMD']

def measure_time(func, *args, **kwargs):
    """Measure execution time of a function"""
    start = time.time()
    result = func(*args, **kwargs)
    elapsed = time.time() - start
    return result, elapsed

def test_cache_performance():
    """Test cache hit rates and performance improvements"""
    print("=" * 80)
    print("ATLAS PERFORMANCE TEST - Phase 1 Week 1")
    print("=" * 80)
    print()

    # Clear cache to start fresh
    cache_manager.clear()
    print("✅ Cache cleared - starting fresh")
    print()

    # Test 1: First fetch (cache miss)
    print("📊 TEST 1: First Fetch (Cache MISS expected)")
    print("-" * 80)

    first_fetch_times = []
    for ticker in TEST_TICKERS[:5]:  # Test first 5
        result, elapsed = measure_time(market_data.get_company_info, ticker)
        first_fetch_times.append(elapsed)
        status = "✅" if result else "❌"
        print(f"{status} {ticker:6s} - {elapsed:.3f}s - {'Success' if result else 'Failed'}")

    avg_first_fetch = sum(first_fetch_times) / len(first_fetch_times)
    print(f"\n📈 Average First Fetch: {avg_first_fetch:.3f}s")
    print()

    # Test 2: Second fetch (cache hit)
    print("📊 TEST 2: Second Fetch (Cache HIT expected)")
    print("-" * 80)

    second_fetch_times = []
    for ticker in TEST_TICKERS[:5]:  # Same tickers
        result, elapsed = measure_time(market_data.get_company_info, ticker)
        second_fetch_times.append(elapsed)
        status = "✅" if result else "❌"
        print(f"{status} {ticker:6s} - {elapsed:.3f}s - {'Success' if result else 'Failed'}")

    avg_second_fetch = sum(second_fetch_times) / len(second_fetch_times)
    print(f"\n📈 Average Second Fetch: {avg_second_fetch:.3f}s")
    print()

    # Calculate speedup
    speedup = avg_first_fetch / avg_second_fetch if avg_second_fetch > 0 else 0
    print(f"⚡ SPEEDUP: {speedup:.1f}x faster with cache!")
    print()

    # Test 3: Cache statistics
    print("📊 TEST 3: Cache Statistics")
    print("-" * 80)

    stats = cache_manager.get_stats()
    print(f"Cache Hit Rate:    {stats['hit_rate']}")
    print(f"Cache Hits:        {stats['hits']}")
    print(f"Cache Misses:      {stats['misses']}")
    print(f"Memory Keys:       {stats['memory_keys']}")
    print(f"Disk Hits:         {stats['disk_hits']}")
    print(f"Disk Writes:       {stats['disk_writes']}")
    print()

    # Test 4: Stock history caching
    print("📊 TEST 4: Stock History Caching")
    print("-" * 80)

    ticker = 'AAPL'

    # First fetch
    result, elapsed_first = measure_time(market_data.get_stock_history, ticker, period="1mo")
    print(f"First fetch (1mo):  {elapsed_first:.3f}s - {len(result)} rows" if not result.empty else f"First fetch: {elapsed_first:.3f}s - Failed")

    # Second fetch (cached)
    result, elapsed_second = measure_time(market_data.get_stock_history, ticker, period="1mo")
    print(f"Second fetch (1mo): {elapsed_second:.3f}s - {len(result)} rows" if not result.empty else f"Second fetch: {elapsed_second:.3f}s - Failed")

    history_speedup = elapsed_first / elapsed_second if elapsed_second > 0 else 0
    print(f"\n⚡ History Speedup: {history_speedup:.1f}x faster")
    print()

    # Test 5: Multiple tickers (batch test)
    print("📊 TEST 5: Batch Test (10 tickers)")
    print("-" * 80)

    # Clear cache
    cache_manager.clear()

    # First batch (all misses)
    start = time.time()
    results = []
    for ticker in TEST_TICKERS:
        result = market_data.get_company_info(ticker)
        results.append(result is not None)
    first_batch_time = time.time() - start

    success_count = sum(results)
    print(f"First batch:  {first_batch_time:.3f}s - {success_count}/{len(TEST_TICKERS)} successful")

    # Second batch (all hits)
    start = time.time()
    results = []
    for ticker in TEST_TICKERS:
        result = market_data.get_company_info(ticker)
        results.append(result is not None)
    second_batch_time = time.time() - start

    success_count = sum(results)
    print(f"Second batch: {second_batch_time:.3f}s - {success_count}/{len(TEST_TICKERS)} successful")

    batch_speedup = first_batch_time / second_batch_time if second_batch_time > 0 else 0
    print(f"\n⚡ Batch Speedup: {batch_speedup:.1f}x faster")
    print()

    # Final statistics
    print("=" * 80)
    print("📊 FINAL RESULTS")
    print("=" * 80)

    stats = cache_manager.get_stats()
    print(f"✅ Overall Cache Hit Rate: {stats['hit_rate']}")
    print(f"✅ Total Cache Hits:       {stats['hits']}")
    print(f"✅ Total Cache Misses:     {stats['misses']}")
    print(f"✅ Average Speedup:        {speedup:.1f}x")
    print()

    # Success criteria
    print("🎯 SUCCESS CRITERIA")
    print("-" * 80)

    hit_rate_num = float(stats['hit_rate'].rstrip('%'))

    criteria = [
        ("Cache hit rate > 50%", hit_rate_num > 50.0),
        ("Speedup > 3x", speedup > 3.0),
        ("All cache operations working", stats['hits'] > 0),
        ("Disk persistence working", stats['disk_writes'] > 0)
    ]

    for criterion, passed in criteria:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {criterion}")

    print()

    all_passed = all(passed for _, passed in criteria)

    if all_passed:
        print("🎉 ALL TESTS PASSED! Phase 1 Week 1 infrastructure is working perfectly!")
    else:
        print("⚠️  Some tests failed - review results above")

    print()
    return all_passed

if __name__ == "__main__":
    try:
        success = test_cache_performance()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
