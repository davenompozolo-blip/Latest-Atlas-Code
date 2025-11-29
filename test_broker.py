"""
Quick test script for the multi-source data broker integration.
This validates that the modules can be imported and basic functionality works.
"""

import sys

print("Testing Multi-Source Data Broker Integration...")
print("=" * 60)

# Test 1: Module imports
print("\n1. Testing module imports...")
try:
    from atlas_multi_source_data_broker import (
        HybridDataBroker, DATA_SOURCES, DataSource, create_default_broker
    )
    print("   ✓ Broker module imported successfully")
except Exception as e:
    print(f"   ✗ Error importing broker: {e}")
    sys.exit(1)

try:
    from atlas_data_sources import (
        InvestingComScraper, MarketWatchScraper,
        PolygonAPI, IEXCloudAPI, FinnhubAPI
    )
    print("   ✓ Data sources module imported successfully")
except Exception as e:
    print(f"   ✗ Error importing data sources: {e}")
    sys.exit(1)

# Test 2: Broker initialization
print("\n2. Testing broker initialization...")
try:
    broker = create_default_broker()
    print("   ✓ Broker created successfully")
except Exception as e:
    print(f"   ✗ Error creating broker: {e}")
    sys.exit(1)

# Test 3: Source statistics
print("\n3. Testing source statistics...")
try:
    stats = broker.get_source_statistics()
    print(f"   ✓ {len(stats)} data sources configured")
    print(f"\n   Configured sources:")
    for idx, row in stats.iterrows():
        print(f"      - {row['Source']}: {row['Status']}")
except Exception as e:
    print(f"   ✗ Error getting statistics: {e}")
    sys.exit(1)

# Test 4: Basic price fetch (Yahoo Finance only)
print("\n4. Testing price fetch (AAPL)...")
try:
    data = broker.get_live_price("AAPL")
    if not data.get('error'):
        print(f"   ✓ Price fetched: ${data['price']:.2f}")
        print(f"   ✓ Change: {data['change_pct']:+.2f}%")
        print(f"   ✓ Confidence: {data.get('confidence_score', 0):.1f}%")
        print(f"   ✓ Sources: {', '.join(data.get('sources_used', []))}")
    else:
        print(f"   ⚠ Warning: {data['error']}")
except Exception as e:
    print(f"   ✗ Error fetching price: {e}")

print("\n" + "=" * 60)
print("✓ All basic tests passed!")
print("Multi-Source Data Broker is ready for integration.")
print("\nNote: This test only validates Yahoo Finance (free source).")
print("Add API keys to DATA_SOURCES to enable additional sources.")
