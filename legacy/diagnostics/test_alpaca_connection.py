#!/usr/bin/env python3
"""
Quick test script to verify Alpaca connection works
Run this before launching ATLAS to ensure credentials are correct
"""

import sys

try:
    from atlas_alpaca_integration import AlpacaAdapter
except ImportError:
    print("❌ Error: alpaca-py not installed")
    print("Run: pip install alpaca-py")
    sys.exit(1)

print("🧪 Testing Alpaca Connection...")
print("=" * 50)

# Your credentials
API_KEY = "PK3HKSJYMNXM4WFOCCBDCK57LX"
SECRET_KEY = "6TEKbPZe4sLqFwQDTCiYgz5YNg8mtH7n4w19RNsaaFwB"

try:
    # Create adapter
    print("📡 Connecting to Alpaca Markets...")
    adapter = AlpacaAdapter(
        api_key=API_KEY,
        secret_key=SECRET_KEY,
        paper=True
    )

    # Test connection
    success, message = adapter.test_connection()
    print(f"\n{message}")

    if success:
        print("\n✅ CONNECTION SUCCESSFUL!\n")

        # Get account summary
        print("📊 Account Summary:")
        print("-" * 50)
        account = adapter.get_account_summary()

        print(f"Account Type: {account.get('account_type')}")
        print(f"Status: {account.get('status')}")
        print(f"Portfolio Value: ${account.get('portfolio_value', 0):,.2f}")
        print(f"Cash: ${account.get('cash', 0):,.2f}")
        print(f"Buying Power: ${account.get('buying_power', 0):,.2f}")

        # Get positions
        print("\n📈 Positions:")
        print("-" * 50)
        positions = adapter.get_positions()

        if positions.empty:
            print("No positions found (portfolio is empty)")
        else:
            print(f"Found {len(positions)} positions:\n")
            for _, pos in positions.iterrows():
                print(f"  {pos['ticker']}: {pos['quantity']} shares @ ${pos['current_price']:.2f}")
                print(f"    Value: ${pos['market_value']:,.2f} | P&L: ${pos['unrealized_pl']:+,.2f} ({pos['unrealized_plpc']:+.2f}%)")

        print("\n" + "=" * 50)
        print("✅ ALL TESTS PASSED!")
        print("=" * 50)
        print("\n🚀 You're ready to launch ATLAS Terminal!")
        print("   Run: streamlit run atlas_app.py")

    else:
        print("\n❌ CONNECTION FAILED")
        print("Check your API credentials and try again")
        sys.exit(1)

except Exception as e:
    print(f"\n❌ ERROR: {str(e)}")
    print("\nTroubleshooting:")
    print("1. Verify API keys are correct")
    print("2. Ensure paper trading is enabled in Alpaca")
    print("3. Check internet connection")
    sys.exit(1)
