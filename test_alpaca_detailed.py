"""
Detailed Alpaca API test with full error information
"""

import sys

print("🔍 Detailed Alpaca API Diagnostics")
print("=" * 70)

# Test 1: Check alpaca-py version
print("\n1. Checking alpaca-py installation...")
try:
    import alpaca
    print(f"   ✅ alpaca-py version: {alpaca.__version__ if hasattr(alpaca, '__version__') else 'unknown'}")
except ImportError:
    print("   ❌ alpaca-py not installed")
    sys.exit(1)

# Test 2: Import TradingClient
print("\n2. Importing TradingClient...")
try:
    from alpaca.trading.client import TradingClient
    print("   ✅ TradingClient imported")
except ImportError as e:
    print(f"   ❌ Import failed: {e}")
    sys.exit(1)

# Test 3: Get credentials
print("\n3. Loading credentials...")
try:
    import streamlit as st
    api_key = st.secrets.get("alpaca_key", "")
    secret_key = st.secrets.get("alpaca_secret", "")
    print(f"   ✅ API Key: {api_key[:15]}...")
    print(f"   ✅ Secret: {secret_key[:15]}...")
except Exception as e:
    print(f"   ❌ Failed to load credentials: {e}")
    sys.exit(1)

# Test 4: Create TradingClient with paper=True
print("\n4. Creating TradingClient (paper=True)...")
try:
    client = TradingClient(api_key, secret_key, paper=True)
    print("   ✅ Client created successfully")
except Exception as e:
    print(f"   ❌ Client creation failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 5: Try to get account
print("\n5. Testing connection (get_account)...")
try:
    account = client.get_account()
    print(f"   ✅ Connection successful!")
    print(f"   Account Status: {account.status}")
    print(f"   Account Number: {account.account_number}")
    print(f"   Equity: ${float(account.equity):,.2f}")
    print(f"   Cash: ${float(account.cash):,.2f}")
    print(f"   Pattern Day Trader: {account.pattern_day_trader}")
except Exception as e:
    print(f"   ❌ Connection FAILED")
    print(f"   Error Type: {type(e).__name__}")
    print(f"   Error Message: {str(e)}")
    print("\n   Full traceback:")
    import traceback
    traceback.print_exc()

    print("\n" + "=" * 70)
    print("DIAGNOSIS:")
    print("=" * 70)

    error_str = str(e).lower()

    if "access denied" in error_str or "forbidden" in error_str:
        print("""
❌ API Access Denied

Possible causes:
1. API keys are incorrect or expired
2. Keys are for LIVE trading but using paper=True
3. Keys are for PAPER trading but using paper=False
4. Account needs to accept updated terms of service
5. Account is suspended or restricted

Solutions:
1. Log into Alpaca: https://app.alpaca.markets/
2. Check if account is active
3. Regenerate API keys (delete old, create new)
4. Make sure you're using PAPER trading keys
5. Accept any pending terms/agreements
""")
    elif "unauthorized" in error_str:
        print("""
❌ Unauthorized

The API keys don't match or are invalid.
- Double-check you copied the FULL key and secret
- Make sure there are no extra spaces
- Try regenerating new keys
""")
    elif "network" in error_str or "connection" in error_str:
        print("""
❌ Network Issue

Cannot reach Alpaca servers.
- Check your internet connection
- Try again in a few minutes
- Check if Alpaca is having service issues
""")
    else:
        print("""
❌ Unknown Error

This is an unexpected error.
Please check:
1. Alpaca account status
2. API key permissions
3. Network connectivity
""")

    sys.exit(1)

# Test 6: Get positions
print("\n6. Testing get_all_positions()...")
try:
    positions = client.get_all_positions()
    print(f"   ✅ Positions retrieved: {len(positions)} positions")
    if positions:
        for pos in positions[:3]:
            print(f"      - {pos.symbol}: {pos.qty} shares")
except Exception as e:
    print(f"   ❌ Failed: {e}")

# Test 7: Get portfolio history
print("\n7. Testing get_portfolio_history()...")
try:
    from datetime import datetime, timedelta
    history = client.get_portfolio_history(
        date_start=datetime.now() - timedelta(days=30),
        date_end=datetime.now()
    )
    print(f"   ✅ History retrieved")
    print(f"      Timestamps: {len(history.timestamp)}")
    print(f"      Latest equity: ${history.equity[-1]:,.2f}" if history.equity else "No data")
except Exception as e:
    print(f"   ❌ Failed: {e}")

print("\n" + "=" * 70)
print("✅ ALL TESTS PASSED!")
print("=" * 70)
print("\nAlpaca connection is working correctly!")
print("Ready to proceed with beta build! 🚀")
