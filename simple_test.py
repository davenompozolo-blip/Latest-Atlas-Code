from easy_equities_client.clients import EasyEquitiesClient

# Demo account credentials (pre-configured)
USERNAME = "HXNomps420"
PASSWORD = "Mpozi1mpozi@"

try:
    # 1. Can we login?
    print("Test 1: Attempting login...")
    client = EasyEquitiesClient()
    client.login(USERNAME, PASSWORD)
    print("✅ Login successful")

    # 2. Can we get accounts?
    print("\nTest 2: Getting accounts...")
    accounts = client.accounts.list()
    print(f"✅ Found {len(accounts)} account(s)")
    for acc in accounts:
        print(f"   - {acc.name} (ID: {acc.id})")

    # 3. Can we get holdings data?
    print("\nTest 3: Getting portfolio holdings...")
    holdings = client.accounts.holdings(accounts[0].id, include_shares=True)
    print(f"✅ Found {len(holdings)} position(s)")

    # 4. Show the data we need
    print("\nData extracted:")
    for h in holdings:
        print(f"\n   {h.get('name', 'Unknown')}")
        print(f"   - Ticker: {h.get('contract_code', 'N/A')}")
        print(f"   - Shares: {h.get('shares', 'N/A')}")
        print(f"   - Purchase Value: {h.get('purchase_value', 'N/A')}")
        print(f"   - Current Value: {h.get('current_value', 'N/A')}")
        print(f"   - Current Price: {h.get('current_price', 'N/A')}")

    print("\n✅ SUCCESS: We can access all needed data")

except Exception as e:
    print(f"\n❌ FAILED: {e}")
    print("\nThis means we cannot use Easy Equities for ATLAS integration")
