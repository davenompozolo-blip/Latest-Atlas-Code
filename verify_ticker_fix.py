#!/usr/bin/env python3
"""Verify ticker conversion is working"""

from modules.ticker_utils import convert_ee_ticker_to_yahoo
import yfinance as yf

# Test ticker conversion
test_cases = {
    "EQU.ZA.BTI": "BTI.JO",
    "EQU.ZA.ABG": "ABG.JO",
    "EQU.ZA.DSY": "DSY.JO",
    "EQU.ZA.BEL": "BEL.JO",
    "EQU.ZA.ETFT40": "ETFT40.JO",
    "EC10.EC.EC10": "EC10.EC.EC10"  # Crypto - should pass through
}

print("="*60)
print("TICKER CONVERSION VERIFICATION")
print("="*60)

for ee_ticker, expected in test_cases.items():
    converted = convert_ee_ticker_to_yahoo(ee_ticker)
    status = "✅" if converted == expected else "❌"
    print(f"{status} {ee_ticker:20} → {converted:15} (expected {expected})")

print("\n" + "="*60)
print("DATA FETCHING VERIFICATION")
print("="*60)

success_count = 0
total_count = 0

for ee_ticker in list(test_cases.keys())[:5]:  # Test first 5 (exclude crypto)
    yahoo_ticker = convert_ee_ticker_to_yahoo(ee_ticker)
    total_count += 1
    try:
        data = yf.download(yahoo_ticker, period="1mo", progress=False, show_errors=False)
        if not data.empty:
            success_count += 1
            print(f"✅ {ee_ticker:20} → {yahoo_ticker:15} [{len(data)} days]")
        else:
            print(f"❌ {ee_ticker:20} → {yahoo_ticker:15} [No data]")
    except Exception as e:
        print(f"❌ {ee_ticker:20} → {yahoo_ticker:15} [Error: {str(e)[:30]}]")

print("\n" + "="*60)
print(f"SUCCESS RATE: {success_count}/{total_count} ({success_count/total_count*100:.0f}%)")
print("="*60)

if success_count >= total_count * 0.8:  # 80% success
    print("\n✅ PORTFOLIO HOME SHOULD WORK")
else:
    print("\n❌ ISSUES DETECTED")
