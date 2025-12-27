from easy_equities_client.clients import EasyEquitiesClient
import json

USERNAME = "HXNomps420"
PASSWORD = "Mpozi1mpozi@"

client = EasyEquitiesClient()
client.login(USERNAME, PASSWORD)

# Target the Demo ZAR account specifically (ID: 4044331)
DEMO_ZAR_ACCOUNT_ID = "4044331"

print("=" * 60)
print("DEBUGGING HOLDINGS RETRIEVAL - Demo ZAR Account")
print("=" * 60)

# Try getting holdings WITHOUT include_shares first
print("\nAttempt 1: Get holdings without share details...")
try:
    holdings = client.accounts.holdings(DEMO_ZAR_ACCOUNT_ID, include_shares=False)
    print(f"✅ SUCCESS: Found {len(holdings)} holdings")

    if holdings:
        print("\nFirst holding details:")
        print(json.dumps(holdings[0], indent=2))

        print(f"\nAll {len(holdings)} holdings:")
        for i, h in enumerate(holdings, 1):
            print(f"\n{i}. {h.get('name', 'Unknown')}")
            print(f"   Ticker: {h.get('contract_code', 'N/A')}")
            print(f"   Current Value: {h.get('current_value', 'N/A')}")
            print(f"   Purchase Value: {h.get('purchase_value', 'N/A')}")
            print(f"   Current Price: {h.get('current_price', 'N/A')}")
            print(f"   ISIN: {h.get('isin', 'N/A')}")
    else:
        print("⚠️  Holdings list is empty")

except Exception as e:
    print(f"❌ FAILED: {e}")

# Try getting valuations (we know this works)
print("\n" + "=" * 60)
print("Attempt 2: Get valuations to confirm account has data...")
print("=" * 60)

try:
    valuations = client.accounts.valuations(DEMO_ZAR_ACCOUNT_ID)

    print(f"\nAccount Value: {valuations['TopSummary']['AccountValue']}")
    print(f"Account Currency: {valuations['TopSummary']['AccountCurrency']}")
    print(f"Account Number: {valuations['TopSummary']['AccountNumber']}")

    print("\nInvestment Types:")
    for inv_type in valuations['InvestmentTypesAndManagers']['InvestmentTypes']:
        print(f"  - {inv_type['Key']}: {inv_type['Value']} ({inv_type['Percentage']}%)")

    print("\nInvestment Summary:")
    for item in valuations['InvestmentSummaryItems']:
        print(f"  - {item['Label']}: {item['Value']}")

except Exception as e:
    print(f"❌ FAILED: {e}")

# Check raw HTTP response
print("\n" + "=" * 60)
print("Attempt 3: Check raw holdings endpoint response...")
print("=" * 60)

try:
    # First switch to the account
    client.accounts._switch_account(DEMO_ZAR_ACCOUNT_ID)

    # Make raw request to holdings endpoint
    from easy_equities_client import constants
    response = client.session.get(client.accounts._url(constants.PLATFORM_HOLDINGS_PATH))

    print(f"Status Code: {response.status_code}")
    print(f"Content Length: {len(response.content)}")
    print(f"First 500 chars of response:")
    print(response.content[:500].decode('utf-8', errors='ignore'))

except Exception as e:
    print(f"❌ FAILED: {e}")
