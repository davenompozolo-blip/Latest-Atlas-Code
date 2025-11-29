#!/usr/bin/env python3
"""
Test script for ATLAS v10.0 Leverage Accounting Fix

This script tests the leverage accounting calculations to ensure:
1. Cost basis properly reflects equity deployed (not notional)
2. Returns are amplified by leverage factor
3. Volatility and beta are scaled by leverage
4. Portfolio weights sum to leverage_ratio * 100%
"""

import pandas as pd
import numpy as np
import sys

# Add parent directory to path to import atlas_app functions
sys.path.insert(0, '/home/user/Latest-Atlas-Code')

# Import the functions we want to test
from atlas_app import calculate_portfolio_metrics, fix_portfolio_weights


def test_leverage_accounting():
    """Test leverage accounting with sample portfolio data"""

    print("=" * 80)
    print("ATLAS v10.0 - LEVERAGE ACCOUNTING TEST")
    print("=" * 80)
    print()

    # Sample portfolio data
    sample_data = {
        "Ticker": ["BBVA", "BOND", "C", "COP"],
        "Total Value": [25000, 7500, 11500, 8800],  # Current market values
        "Total Cost": [24000, 7400, 10500, 8600],  # Purchase prices * shares
        "Total G/L $": [1000, 100, 1000, 200],  # Dollar gains
        "Weight %": [48.5, 14.5, 22.3, 17.0],  # OLD weights (will be recalculated)
        "Beta": [1.2, 0.3, 1.5, 0.9],
        "Volatility": [25.0, 5.0, 30.0, 20.0],  # Annualized volatility %
    }

    df = pd.DataFrame(sample_data)

    # Account settings
    cash = -25000  # Borrowed $25k on margin
    sp500_return = 15.0  # S&P 500 YTD return
    leverage_ratio = 2.0  # 2x leverage

    print("TEST 1: BASIC CALCULATIONS (WITHOUT LEVERAGE ADJUSTMENT)")
    print("-" * 80)

    total_value = df["Total Value"].sum()
    total_cost = df["Total Cost"].sum()
    total_pl = df["Total G/L $"].sum()
    old_return = (total_pl / total_cost) * 100

    print(f"Total Value:     ${total_value:,.2f}")
    print(f"Total Cost:      ${total_cost:,.2f}")
    print(f"Total P/L:       ${total_pl:,.2f}")
    print(f"Return (wrong):  {old_return:.2f}%")
    print()

    print("TEST 2: LEVERAGE-ADJUSTED CALCULATIONS")
    print("-" * 80)

    # Calculate metrics with leverage accounting
    metrics = calculate_portfolio_metrics(df, cash, sp500_return, leverage_ratio)

    print(f"Total Value (Market):        ${metrics['total_value']:,.2f}")
    print(f"Total Cost (Notional):       ${metrics['total_cost']:,.2f}")
    print(f"Total Cost (Equity):         ${metrics['total_cost_equity']:,.2f}")
    print(f"Account Value (Equity):      ${metrics['account_value']:,.2f}")
    print(f"Cash (Margin):               ${metrics['cash']:,.2f}")
    print(f"Total P/L:                   ${metrics['total_pl']:,.2f}")
    print(f"Return on Equity (correct):  {metrics['total_return']:.2f}%")
    print()
    print(f"Portfolio Volatility (leveraged):    {metrics['portfolio_std']:.2f}%")
    print(f"Portfolio Volatility (unleveraged):  {metrics['portfolio_std_unleveraged']:.2f}%")
    print(f"Portfolio Beta (leveraged):          {metrics['portfolio_beta']:.2f}")
    print(f"Portfolio Beta (unleveraged):        {metrics['portfolio_beta_unleveraged']:.2f}")
    print(f"Sharpe Ratio:                        {metrics['sharpe_ratio']:.2f}")
    print(f"Alpha:                               {metrics['alpha']:.2f}%")
    print(f"Leverage Ratio (target):             {metrics['leverage_ratio']:.2f}x")
    print(f"Actual Leverage:                     {metrics['actual_leverage']:.2f}x")
    print()

    print("TEST 3: PORTFOLIO WEIGHTS FIX")
    print("-" * 80)

    df_fixed = fix_portfolio_weights(df, leverage_ratio)

    print("\nOLD WEIGHTS (% of notional):")
    for _, row in df.iterrows():
        print(f"{row['Ticker']:6s}: {row['Weight %']:6.2f}%")

    old_sum = df['Weight %'].sum()
    print(f"\nSum: {old_sum:.2f}% (should be ~100%)")

    print("\nNEW WEIGHTS (% of equity):")
    for _, row in df_fixed.iterrows():
        print(f"{row['Ticker']:6s}: {row['Weight %']:6.2f}%")

    new_sum = df_fixed['Weight %'].sum()
    print(f"\nSum: {new_sum:.2f}% (should be ~{leverage_ratio * 100:.0f}%)")

    print()
    print("=" * 80)
    print("TEST RESULTS")
    print("=" * 80)

    # Verify calculations
    expected_equity_cost = total_cost / leverage_ratio
    expected_return = (total_pl / expected_equity_cost) * 100
    expected_weight_sum = leverage_ratio * 100

    tests_passed = 0
    tests_failed = 0

    # Test 1: Equity cost calculation
    if abs(metrics['total_cost_equity'] - expected_equity_cost) < 0.01:
        print("✅ PASS: Equity cost calculation correct")
        tests_passed += 1
    else:
        print(f"❌ FAIL: Equity cost calculation incorrect (expected {expected_equity_cost:.2f}, got {metrics['total_cost_equity']:.2f})")
        tests_failed += 1

    # Test 2: Return amplification
    if abs(metrics['total_return'] - expected_return) < 0.01:
        print("✅ PASS: Return amplification correct")
        tests_passed += 1
    else:
        print(f"❌ FAIL: Return amplification incorrect (expected {expected_return:.2f}%, got {metrics['total_return']:.2f}%)")
        tests_failed += 1

    # Test 3: Return is roughly 2x the unleveraged return
    if abs(metrics['total_return'] / old_return - leverage_ratio) < 0.1:
        print("✅ PASS: Leveraged return is ~2x unleveraged return")
        tests_passed += 1
    else:
        print(f"❌ FAIL: Leveraged return ratio incorrect ({metrics['total_return'] / old_return:.2f}x)")
        tests_failed += 1

    # Test 4: Volatility amplification
    if abs(metrics['portfolio_std'] / metrics['portfolio_std_unleveraged'] - leverage_ratio) < 0.01:
        print("✅ PASS: Volatility amplification correct")
        tests_passed += 1
    else:
        print(f"❌ FAIL: Volatility amplification incorrect")
        tests_failed += 1

    # Test 5: Beta amplification
    if abs(metrics['portfolio_beta'] / metrics['portfolio_beta_unleveraged'] - leverage_ratio) < 0.01:
        print("✅ PASS: Beta amplification correct")
        tests_passed += 1
    else:
        print(f"❌ FAIL: Beta amplification incorrect")
        tests_failed += 1

    # Test 6: Weight sum
    if abs(new_sum - expected_weight_sum) < 1.0:  # Allow 1% tolerance
        print("✅ PASS: Portfolio weights sum correctly")
        tests_passed += 1
    else:
        print(f"❌ FAIL: Portfolio weights sum incorrect (expected {expected_weight_sum:.2f}%, got {new_sum:.2f}%)")
        tests_failed += 1

    print()
    print(f"TESTS PASSED: {tests_passed}/{tests_passed + tests_failed}")
    print()

    if tests_failed == 0:
        print("🎉 ALL TESTS PASSED! Leverage accounting is working correctly.")
        return 0
    else:
        print("⚠️  SOME TESTS FAILED. Please review the calculations.")
        return 1


if __name__ == "__main__":
    exit_code = test_leverage_accounting()
    sys.exit(exit_code)
