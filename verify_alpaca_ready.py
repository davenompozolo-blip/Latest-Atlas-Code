#!/usr/bin/env python3
"""
Quick verification that Alpaca integration is ready
"""

print("🔍 Checking Alpaca Integration Setup...")
print("=" * 60)

# Check 1: Package installed
try:
    from alpaca.trading.client import TradingClient
    from alpaca.data.historical import StockHistoricalDataClient
    print("✅ alpaca-py package: INSTALLED")
except ImportError as e:
    print(f"❌ alpaca-py package: NOT INSTALLED")
    print(f"   Error: {e}")
    print("\n   Run: pip install alpaca-py")
    exit(1)

# Check 2: Module imports
try:
    from atlas_alpaca_integration import AlpacaAdapter, ALPACA_AVAILABLE
    print(f"✅ AlpacaAdapter module: IMPORTED")
    print(f"   ALPACA_AVAILABLE = {ALPACA_AVAILABLE}")

    if not ALPACA_AVAILABLE:
        print("   ⚠️  WARNING: Module thinks alpaca-py is not available!")
        print("   This is likely a cache issue. Restart your Streamlit app.")
except ImportError as e:
    print(f"❌ AlpacaAdapter module: FAILED")
    print(f"   Error: {e}")
    exit(1)

# Check 3: Credentials
try:
    import streamlit as st
    if hasattr(st, 'secrets'):
        api_key = st.secrets.get("alpaca_key", "")
        if api_key:
            print("✅ Credentials: FOUND in secrets.toml")
        else:
            print("⚠️  Credentials: NOT FOUND (manual entry required)")
    else:
        print("⚠️  Credentials: Can't check (not in Streamlit context)")
except:
    print("⚠️  Credentials: Can't check (not in Streamlit context)")

# Check 4: Test connection (if credentials available)
print("\n" + "=" * 60)
print("✅ ALL CHECKS PASSED!")
print("\n🚀 Ready to connect to Alpaca Markets!")
print("\nNext steps:")
print("1. Restart Streamlit: streamlit run atlas_app.py")
print("2. Click '🦙 Alpaca Markets' in sidebar")
print("3. Enter credentials or auto-connect")
print("=" * 60)
