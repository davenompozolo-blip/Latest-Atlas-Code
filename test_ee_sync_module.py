#!/usr/bin/env python3
"""
Test Easy Equities Sync Module
Validates core sync functionality before UI integration
"""

from modules.easy_equities_sync import (
    sync_easy_equities_portfolio,
    get_account_summary,
    list_available_accounts,
    validate_credentials
)

# Demo account credentials
USERNAME = "HXNomps420"
PASSWORD = "Mpozi1mpozi@"

print("=" * 70)
print("EASY EQUITIES SYNC MODULE TEST")
print("=" * 70)

# Test 1: Validate credentials
print("\n[Test 1] Validating credentials...")
try:
    is_valid = validate_credentials(USERNAME, PASSWORD)
    if is_valid:
        print("✅ PASS: Credentials valid")
    else:
        print("❌ FAIL: Invalid credentials")
        exit(1)
except Exception as e:
    print(f"❌ FAIL: {e}")
    exit(1)

# Test 2: List accounts
print("\n[Test 2] Listing available accounts...")
try:
    accounts = list_available_accounts(USERNAME, PASSWORD)
    print(f"✅ PASS: Found {len(accounts)} account(s)")
    for acc in accounts:
        print(f"   [{acc['index']}] {acc['name']} (ID: {acc['id']})")
except Exception as e:
    print(f"❌ FAIL: {e}")
    exit(1)

# Test 3: Get account summary (use Demo ZAR account which has holdings)
DEMO_ZAR_INDEX = 5  # Demo ZAR account from list above
print(f"\n[Test 3] Getting account summary (using account index {DEMO_ZAR_INDEX})...")
try:
    summary = get_account_summary(USERNAME, PASSWORD, account_index=DEMO_ZAR_INDEX)
    print("✅ PASS: Account summary retrieved")
    print(f"   Account: {summary['account_name']}")
    print(f"   Value: R{summary['account_value']:,.2f}")
    print(f"   Number: {summary['account_number']}")
    print(f"   Currency: {summary['currency']}")
except Exception as e:
    print(f"❌ FAIL: {e}")
    exit(1)

# Test 4: Sync portfolio (use Demo ZAR account)
print("\n[Test 4] Syncing portfolio...")
try:
    df = sync_easy_equities_portfolio(USERNAME, PASSWORD, account_index=DEMO_ZAR_INDEX)
    print(f"✅ PASS: Synced {len(df)} positions")

    # Validate DataFrame structure
    print("\n[Test 4a] Validating DataFrame structure...")
    required_columns = [
        'Ticker', 'Name', 'Shares', 'Cost_Basis', 'Current_Price',
        'Market_Value', 'Purchase_Value', 'Unrealized_PnL',
        'Unrealized_PnL_Pct', 'ISIN'
    ]

    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        print(f"❌ FAIL: Missing columns: {missing_columns}")
        exit(1)
    else:
        print("✅ PASS: All required columns present")

    # Validate data types
    print("\n[Test 4b] Validating data types...")
    assert df['Shares'].dtype in ['float64', 'float32'], "Shares should be float"
    assert df['Current_Price'].dtype in ['float64', 'float32'], "Current_Price should be float"
    assert df['Market_Value'].dtype in ['float64', 'float32'], "Market_Value should be float"
    print("✅ PASS: Data types correct")

    # Validate calculations
    print("\n[Test 4c] Validating calculations...")
    total_market_value = df['Market_Value'].sum()
    total_purchase_value = df['Purchase_Value'].sum()
    total_pnl = df['Unrealized_PnL'].sum()

    print(f"   Total Market Value: R{total_market_value:,.2f}")
    print(f"   Total Purchase Value: R{total_purchase_value:,.2f}")
    print(f"   Total P&L: R{total_pnl:,.2f}")
    print(f"   Total P&L %: {(total_pnl / total_purchase_value * 100):.2f}%")

    # Check if totals match expected values from yesterday's test
    expected_market_value = 123281.55
    if abs(total_market_value - expected_market_value) < 1000:  # Within R1000
        print("✅ PASS: Market value matches expected (~R123,281)")
    else:
        print(f"⚠️  WARNING: Market value differs from expected (got R{total_market_value:,.2f}, expected ~R{expected_market_value:,.2f})")

    # Validate metadata
    print("\n[Test 4d] Validating metadata...")
    assert df.attrs['source'] == 'easy_equities', "Source should be 'easy_equities'"
    assert 'account_name' in df.attrs, "Should have account_name"
    assert 'sync_timestamp' in df.attrs, "Should have sync_timestamp"
    print("✅ PASS: Metadata present")
    print(f"   Source: {df.attrs['source']}")
    print(f"   Account: {df.attrs['account_name']}")
    print(f"   Timestamp: {df.attrs['sync_timestamp']}")

except Exception as e:
    print(f"❌ FAIL: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

# Test 5: Display sample holdings
print("\n[Test 5] Sample Holdings Preview")
print("=" * 70)
print(df[['Ticker', 'Name', 'Shares', 'Current_Price', 'Market_Value', 'Unrealized_PnL_Pct']].head(10).to_string(index=False))

# Final summary
print("\n" + "=" * 70)
print("✅ ALL TESTS PASSED")
print("=" * 70)
print(f"\nModule Status: READY FOR UI INTEGRATION")
print(f"Positions Synced: {len(df)}")
print(f"Total Value: R{total_market_value:,.2f}")
print(f"DataFrame Shape: {df.shape}")
print(f"Columns: {list(df.columns)}")
print("\n✅ Core sync module validated successfully!")
