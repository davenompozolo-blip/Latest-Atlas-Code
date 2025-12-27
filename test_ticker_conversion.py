"""
Test Ticker Conversion for Easy Equities → Yahoo Finance

Tests all 22 positions from the Easy Equities demo portfolio
to ensure ticker conversion and data fetching work correctly.
"""

from modules.ticker_utils import (
    convert_ee_ticker_to_yahoo,
    fetch_stock_history_with_fallback,
    test_ticker_conversion
)
import yfinance as yf


def test_all_ee_tickers():
    """
    Test all 22 tickers from the Easy Equities demo portfolio
    """

    # All 22 positions from the demo portfolio
    demo_tickers = [
        "EQU.ZA.ABG",      # Absa Group Limited
        "EQU.ZA.BTI",      # British American Tobacco
        "EQU.ZA.STXNDQ",   # Satrix Nasdaq 100 ETF
        "EQU.ZA.DRD",      # DRD Gold Limited
        "EC10.EC.EC10",    # EasyCrypto 10
        "EQU.ZA.CML",      # Coronation
        "EQU.ZA.DCP",      # Dis-Chem
        "EQU.ZA.ELI",      # Ellies
        "EQU.ZA.LEW",      # Lewis Group
        "EQU.ZA.PPH",      # Pepkor
        "EQU.ZA.TSG",      # Tsogo Sun
        "EQU.ZA.BVT",      # Bidvest
        "EQU.ZA.NPN",      # Naspers
        "EQU.ZA.SHP",      # Shoprite
        "EQU.ZA.SOL",      # Sasol
        "EQU.ZA.SBK",      # Standard Bank
        "EQU.ZA.AGL",      # Anglo American
        "EQU.ZA.FSR",      # FirstRand
        "EQU.ZA.GFI",      # Gold Fields
        "EQU.ZA.IMP",      # Impala Platinum
        "EQU.ZA.MTN",      # MTN Group
        "EQU.ZA.NED"       # Nedbank
    ]

    print("=" * 80)
    print("TICKER CONVERSION TEST - Easy Equities → Yahoo Finance")
    print("=" * 80)
    print()

    # Test conversions
    print("1️⃣ TESTING TICKER CONVERSION")
    print("-" * 80)

    for ee_ticker in demo_tickers:
        yahoo_ticker = convert_ee_ticker_to_yahoo(ee_ticker)
        print(f"{ee_ticker:20} → {yahoo_ticker:15}")

    print()

    # Test data fetching
    print("2️⃣ TESTING DATA AVAILABILITY (Yahoo Finance)")
    print("-" * 80)

    jse_count = 0
    jse_success = 0
    crypto_count = 0

    for ee_ticker in demo_tickers:
        yahoo_ticker = convert_ee_ticker_to_yahoo(ee_ticker)

        # Skip crypto
        if ee_ticker.startswith("EC10"):
            crypto_count += 1
            print(f"⚠️  {ee_ticker:20} → {yahoo_ticker:15} [CRYPTO - No history expected]")
            continue

        jse_count += 1

        try:
            # Try to fetch 1 month of data
            data = yf.download(yahoo_ticker, period="1mo", progress=False, show_errors=False)

            if not data.empty:
                jse_success += 1
                last_price = data['Close'].iloc[-1]
                print(f"✅ {ee_ticker:20} → {yahoo_ticker:15} [Last: R{last_price:.2f}]")
            else:
                print(f"❌ {ee_ticker:20} → {yahoo_ticker:15} [No data]")

        except Exception as e:
            print(f"❌ {ee_ticker:20} → {yahoo_ticker:15} [Error: {str(e)[:30]}]")

    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total tickers tested: {len(demo_tickers)}")
    print(f"JSE stocks: {jse_count}")
    print(f"JSE stocks with data: {jse_success}")
    print(f"Crypto (no history expected): {crypto_count}")
    print(f"Success rate: {(jse_success/jse_count*100) if jse_count > 0 else 0:.1f}%")
    print()

    if jse_success >= jse_count * 0.9:  # 90% success rate
        print("✅ TICKER CONVERSION FIX WORKING! Most JSE stocks load successfully.")
    elif jse_success >= jse_count * 0.7:  # 70% success rate
        print("⚠️  PARTIAL SUCCESS - Most tickers work, some may need investigation.")
    else:
        print("❌ ISSUES DETECTED - Many tickers failing. Check Yahoo Finance availability.")

    print("=" * 80)


def test_conversion_logic():
    """
    Test the conversion logic with known test cases
    """

    print()
    print("=" * 80)
    print("UNIT TESTS - Conversion Logic")
    print("=" * 80)

    results = test_ticker_conversion()

    for ee_ticker, result in results.items():
        status = "✅" if result['passed'] else "❌"
        print(f"{status} {ee_ticker:20} → {result['actual']:15} (expected: {result['expected']})")

    passed = sum(1 for r in results.values() if r['passed'])
    total = len(results)

    print()
    print(f"Unit tests passed: {passed}/{total}")
    print("=" * 80)


if __name__ == "__main__":
    # Run conversion logic tests
    test_conversion_logic()

    print()

    # Run full ticker tests with Yahoo Finance
    test_all_ee_tickers()
