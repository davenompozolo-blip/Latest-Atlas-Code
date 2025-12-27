#!/usr/bin/env python3
"""
Easy Equities Authentication Test
Tests connection to Easy Equities demo account for ATLAS integration.
"""

from easy_equities_client.clients import EasyEquitiesClient
import json

# Demo credentials from user-provided context
DEMO_USERNAME = "HXNomps420"
DEMO_PASSWORD = "Mpozi1mpozi@"

def test_authentication():
    """Test authentication with Easy Equities demo account."""
    print("=" * 60)
    print("EASY EQUITIES AUTHENTICATION TEST")
    print("=" * 60)
    print()

    try:
        print("📡 Initializing Easy Equities client...")
        client = EasyEquitiesClient()

        print(f"🔐 Authenticating with username: {DEMO_USERNAME}")
        client.login(DEMO_USERNAME, DEMO_PASSWORD)

        print("✅ Authentication successful!")
        print()

        # Test basic account info retrieval
        print("📊 Fetching account information...")
        accounts = client.accounts.list()

        print("✅ Account data retrieved successfully!")
        print()
        print(f"Number of accounts: {len(accounts)}")
        print("Account Details:")
        for account in accounts:
            print(f"  - Account ID: {account.id}")
            print(f"    Name: {account.name}")
            print(f"    Currency: {account.trading_currency_id}")
        print()

        if not accounts:
            print("⚠️  No accounts found - cannot test holdings/transactions")
            return False

        # Use first account for further testing
        account_id = accounts[0].id
        print(f"Using account ID: {account_id} for further testing")
        print()

        # Test portfolio holdings
        print("💼 Fetching portfolio holdings...")
        holdings = client.accounts.holdings(account_id, include_shares=True)

        print("✅ Holdings data retrieved successfully!")
        print()
        print(f"Number of holdings: {len(holdings)}")
        print("Portfolio Holdings:")
        for holding in holdings[:5]:  # Show first 5 holdings
            print(f"  - {holding}")
        if len(holdings) > 5:
            print(f"  ... and {len(holdings) - 5} more")
        print()

        # Test transactions
        print("📈 Fetching recent transactions...")
        transactions = client.accounts.transactions(account_id)

        print("✅ Transaction data retrieved successfully!")
        print()
        print(f"Number of transactions: {len(transactions)}")
        print("Recent Transactions:")
        for txn in transactions[:5]:  # Show first 5 transactions
            print(f"  - {txn}")
        if len(transactions) > 5:
            print(f"  ... and {len(transactions) - 5} more")
        print()

        # Test valuations
        print("💰 Fetching account valuations...")
        valuations = client.accounts.valuations(account_id)

        print("✅ Valuation data retrieved successfully!")
        print()
        print("Account Valuations:")
        print(json.dumps(valuations, indent=2))
        print()

        print("=" * 60)
        print("🎉 GO: Easy Equities integration fully operational!")
        print("=" * 60)
        print()
        print("✅ Authentication: WORKING")
        print("✅ Account Info: WORKING")
        print("✅ Portfolio Sync: WORKING")
        print("✅ Transaction History: WORKING")
        print()
        print("RECOMMENDATION: Proceed with ATLAS integration")

        return True

    except Exception as e:
        print(f"❌ Error during testing: {type(e).__name__}: {str(e)}")
        print()
        print("=" * 60)
        print("🚫 NO-GO: Easy Equities integration failed")
        print("=" * 60)
        print()
        print(f"Error Details: {str(e)}")
        print()
        print("Possible Issues:")
        print("- Network connectivity")
        print("- Invalid credentials")
        print("- Easy Equities API changes")
        print("- Rate limiting")

        return False

if __name__ == "__main__":
    test_authentication()
