from easy_equities_client.clients import EasyEquitiesClient

USERNAME = "HXNomps420"
PASSWORD = "Mpozi1mpozi@"

client = EasyEquitiesClient()
client.login(USERNAME, PASSWORD)

accounts = client.accounts.list()

print("Checking all accounts for holdings...\n")

for acc in accounts:
    print(f"Account: {acc.name} (ID: {acc.id})")
    holdings = client.accounts.holdings(acc.id, include_shares=True)
    print(f"   Holdings: {len(holdings)}")

    if holdings:
        print("   Data structure:")
        for h in holdings[:2]:  # Show first 2
            print(f"\n   {h.get('name', 'Unknown')}")
            print(f"   - Ticker: {h.get('contract_code', 'N/A')}")
            print(f"   - Shares: {h.get('shares', 'N/A')}")
            print(f"   - Purchase Value: {h.get('purchase_value', 'N/A')}")
            print(f"   - Current Value: {h.get('current_value', 'N/A')}")
            print(f"   - Current Price: {h.get('current_price', 'N/A')}")
            print(f"   - ISIN: {h.get('isin', 'N/A')}")
        break  # Stop at first account with holdings
    print()
