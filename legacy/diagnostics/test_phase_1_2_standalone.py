#!/usr/bin/env python3
"""
ATLAS Terminal - Phase 1 & 2 Test Suite (Standalone)
Tests core logic without Streamlit dependencies
"""

import re

print("=" * 70)
print("ATLAS TERMINAL - PHASE 1 & 2 TEST SUITE")
print("=" * 70)
print()

# ============================================================================
# Extract data structures from atlas_app.py
# ============================================================================

with open('/home/user/Latest-Atlas-Code/atlas_app.py', 'r') as f:
    content = f.read()

# Extract GICS_SECTORS
gics_match = re.search(r"GICS_SECTORS = \[(.*?)\]", content, re.DOTALL)
if gics_match:
    gics_content = gics_match.group(1)
    GICS_SECTORS = [s.strip().strip("'\"") for s in gics_content.split(',') if s.strip().strip("'\"")]
else:
    GICS_SECTORS = []

# Extract STOCK_SECTOR_OVERRIDES
overrides_match = re.search(r"STOCK_SECTOR_OVERRIDES = \{(.*?)\n\}", content, re.DOTALL)
if overrides_match:
    overrides_text = overrides_match.group(1)
    STOCK_SECTOR_OVERRIDES = {}
    for line in overrides_text.split('\n'):
        match = re.search(r"'([A-Z.]+)':\s*'([^']+)'", line)
        if match:
            STOCK_SECTOR_OVERRIDES[match.group(1)] = match.group(2)
else:
    STOCK_SECTOR_OVERRIDES = {}

# Extract SPY_SECTOR_WEIGHTS
weights_match = re.search(r"SPY_SECTOR_WEIGHTS = \{(.*?)\}", content, re.DOTALL)
if weights_match:
    weights_text = weights_match.group(1)
    SPY_SECTOR_WEIGHTS = {}
    for line in weights_text.split('\n'):
        match = re.search(r"'([^']+)':\s*([\d.]+)", line)
        if match:
            SPY_SECTOR_WEIGHTS[match.group(1)] = float(match.group(2))
else:
    SPY_SECTOR_WEIGHTS = {}

# Extract GICS_SECTOR_MAPPING
mapping_match = re.search(r"GICS_SECTOR_MAPPING = \{(.*?)\n\}", content, re.DOTALL)
if mapping_match:
    mapping_text = mapping_match.group(1)
    GICS_SECTOR_MAPPING = {}
    for line in mapping_text.split('\n'):
        match = re.search(r"'([^']+)':\s*'([^']+)'", line)
        if match:
            GICS_SECTOR_MAPPING[match.group(1)] = match.group(2)
else:
    GICS_SECTOR_MAPPING = {}

# ============================================================================
# TEST 1: Data Structure Validation
# ============================================================================
print("TEST 1: DATA STRUCTURE VALIDATION")
print("-" * 50)

test1_pass = True

print(f"  GICS_SECTORS: {len(GICS_SECTORS)} sectors")
if len(GICS_SECTORS) == 11:
    print(f"    [PASS] Correct count (11 GICS sectors)")
else:
    print(f"    [FAIL] Expected 11, got {len(GICS_SECTORS)}")
    test1_pass = False

print(f"  STOCK_SECTOR_OVERRIDES: {len(STOCK_SECTOR_OVERRIDES)} overrides")
if len(STOCK_SECTOR_OVERRIDES) >= 100:
    print(f"    [PASS] Sufficient overrides (>100)")
else:
    print(f"    [FAIL] Expected >100, got {len(STOCK_SECTOR_OVERRIDES)}")
    test1_pass = False

print(f"  SPY_SECTOR_WEIGHTS: {len(SPY_SECTOR_WEIGHTS)} sectors")
if len(SPY_SECTOR_WEIGHTS) == 11:
    print(f"    [PASS] All 11 sectors have weights")
else:
    print(f"    [FAIL] Expected 11, got {len(SPY_SECTOR_WEIGHTS)}")
    test1_pass = False

total_weight = sum(SPY_SECTOR_WEIGHTS.values())
print(f"  SPY Weight Sum: {total_weight:.1f}%")
if 99 < total_weight < 101:
    print(f"    [PASS] Weights sum to ~100%")
else:
    print(f"    [FAIL] Weights don't sum to 100%")
    test1_pass = False

print()
print(f"TEST 1 RESULT: {'PASS' if test1_pass else 'FAIL'}")
print()

# ============================================================================
# TEST 2: Critical GICS Classifications
# ============================================================================
print("TEST 2: CRITICAL GICS CLASSIFICATIONS")
print("-" * 50)

critical_tests = {
    'AMZN': 'Consumer Discretionary',
    'META': 'Communication Services',
    'GOOGL': 'Communication Services',
    'GOOG': 'Communication Services',
    'NVDA': 'Information Technology',
    'AAPL': 'Information Technology',
    'MSFT': 'Information Technology',
    'TSLA': 'Consumer Discretionary',
    'NFLX': 'Communication Services',
    'DIS': 'Communication Services',
}

test2_pass = True
print(f"  {'Ticker':<8} {'Expected':<25} {'Actual':<25} {'Status'}")
print(f"  {'-'*8} {'-'*25} {'-'*25} {'-'*6}")

for ticker, expected in critical_tests.items():
    actual = STOCK_SECTOR_OVERRIDES.get(ticker, 'NOT FOUND')
    if actual == expected:
        status = "[PASS]"
    else:
        status = "[FAIL]"
        test2_pass = False
    print(f"  {ticker:<8} {expected:<25} {actual:<25} {status}")

print()
print(f"TEST 2 RESULT: {'PASS' if test2_pass else 'FAIL'}")
print()

# ============================================================================
# TEST 3: Sector Mapping Variations
# ============================================================================
print("TEST 3: SECTOR MAPPING VARIATIONS")
print("-" * 50)

mapping_tests = {
    'Technology': 'Information Technology',
    'Consumer Cyclical': 'Consumer Discretionary',
    'Consumer Defensive': 'Consumer Staples',
    'Healthcare': 'Health Care',
    'Financial Services': 'Financials',
    'Basic Materials': 'Materials',
}

test3_pass = True
for variation, expected in mapping_tests.items():
    actual = GICS_SECTOR_MAPPING.get(variation, 'NOT FOUND')
    if actual == expected:
        print(f"  [PASS] '{variation}' -> '{actual}'")
    else:
        print(f"  [FAIL] '{variation}' -> Expected '{expected}', got '{actual}'")
        test3_pass = False

print()
print(f"TEST 3 RESULT: {'PASS' if test3_pass else 'FAIL'}")
print()

# ============================================================================
# TEST 4: SPY Sector Weights Sanity
# ============================================================================
print("TEST 4: SPY SECTOR WEIGHTS SANITY")
print("-" * 50)

test4_pass = True

# Info Tech should be largest
info_tech = SPY_SECTOR_WEIGHTS.get('Information Technology', 0)
print(f"  Information Technology: {info_tech:.1f}%")
if 25 < info_tech < 40:
    print(f"    [PASS] Reasonable range (25-40%)")
else:
    print(f"    [FAIL] Outside expected range")
    test4_pass = False

# Financials second largest
financials = SPY_SECTOR_WEIGHTS.get('Financials', 0)
print(f"  Financials: {financials:.1f}%")
if 10 < financials < 20:
    print(f"    [PASS] Reasonable range (10-20%)")
else:
    print(f"    [FAIL] Outside expected range")
    test4_pass = False

# Healthcare ~12%
healthcare = SPY_SECTOR_WEIGHTS.get('Health Care', 0)
print(f"  Health Care: {healthcare:.1f}%")
if 8 < healthcare < 16:
    print(f"    [PASS] Reasonable range (8-16%)")
else:
    print(f"    [FAIL] Outside expected range")
    test4_pass = False

print()
print(f"TEST 4 RESULT: {'PASS' if test4_pass else 'FAIL'}")
print()

# ============================================================================
# TEST 5: Full Holdings Coverage
# ============================================================================
print("TEST 5: HOLDINGS COVERAGE")
print("-" * 50)

# Check various sectors have stocks
sectors_with_stocks = {}
for ticker, sector in STOCK_SECTOR_OVERRIDES.items():
    if sector not in sectors_with_stocks:
        sectors_with_stocks[sector] = []
    sectors_with_stocks[sector].append(ticker)

test5_pass = True
for sector in GICS_SECTORS:
    count = len(sectors_with_stocks.get(sector, []))
    status = "[PASS]" if count >= 5 else "[WARN]"
    print(f"  {status} {sector}: {count} stocks")
    if count < 3:
        test5_pass = False

print()
print(f"TEST 5 RESULT: {'PASS' if test5_pass else 'FAIL'}")
print()

# ============================================================================
# TEST 6: Function Existence Check
# ============================================================================
print("TEST 6: FUNCTION EXISTENCE CHECK")
print("-" * 50)

functions_to_check = [
    'get_gics_sector',
    'get_portfolio_gics_sectors',
    'get_spy_sector_weights',
    'get_benchmark_sector_returns',
    'calculate_brinson_attribution_gics',
    'display_stock_attribution_table',
    'display_attribution_validation',
    'get_current_portfolio_metrics',
    'format_currency',
    'format_percentage',
    'calculate_skill_score',
]

test6_pass = True
for func_name in functions_to_check:
    if f'def {func_name}(' in content:
        print(f"  [PASS] {func_name}() exists")
    else:
        print(f"  [FAIL] {func_name}() NOT FOUND")
        test6_pass = False

print()
print(f"TEST 6 RESULT: {'PASS' if test6_pass else 'FAIL'}")
print()

# ============================================================================
# TEST 7: Code Syntax Check
# ============================================================================
print("TEST 7: CODE SYNTAX CHECK")
print("-" * 50)

import py_compile
test7_pass = True

try:
    py_compile.compile('/home/user/Latest-Atlas-Code/atlas_app.py', doraise=True)
    print("  [PASS] atlas_app.py compiles without syntax errors")
except py_compile.PyCompileError as e:
    print(f"  [FAIL] Syntax error: {e}")
    test7_pass = False

print()
print(f"TEST 7 RESULT: {'PASS' if test7_pass else 'FAIL'}")
print()

# ============================================================================
# MASTER SCORECARD
# ============================================================================
print("=" * 70)
print("MASTER SCORECARD")
print("=" * 70)
print()

results = [
    ("Test 1: Data Structures", test1_pass),
    ("Test 2: Critical GICS Classifications", test2_pass),
    ("Test 3: Sector Mapping Variations", test3_pass),
    ("Test 4: SPY Sector Weights", test4_pass),
    ("Test 5: Holdings Coverage", test5_pass),
    ("Test 6: Function Existence", test6_pass),
    ("Test 7: Code Syntax", test7_pass),
]

passed = sum(1 for _, p in results if p)
total = len(results)

for name, passed_test in results:
    status = "[PASS]" if passed_test else "[FAIL]"
    print(f"  {status} {name}")

print()
print(f"TOTAL SCORE: {passed}/{total} tests passed")
print()

# ============================================================================
# KEY PHASE 2 VALIDATIONS
# ============================================================================
print("=" * 70)
print("PHASE 2 KEY VALIDATIONS (Attribution Fix)")
print("=" * 70)
print()

key_checks = [
    ('AMZN -> Consumer Discretionary (NOT Tech)', STOCK_SECTOR_OVERRIDES.get('AMZN') == 'Consumer Discretionary'),
    ('META -> Communication Services (NOT Tech)', STOCK_SECTOR_OVERRIDES.get('META') == 'Communication Services'),
    ('GOOGL -> Communication Services (NOT Tech)', STOCK_SECTOR_OVERRIDES.get('GOOGL') == 'Communication Services'),
    ('NVDA -> Information Technology', STOCK_SECTOR_OVERRIDES.get('NVDA') == 'Information Technology'),
    ('calculate_brinson_attribution_gics() exists', 'def calculate_brinson_attribution_gics(' in content),
    ('display_stock_attribution_table() exists', 'def display_stock_attribution_table(' in content),
    ('display_attribution_validation() exists', 'def display_attribution_validation(' in content),
]

key_passed = 0
for check_name, passed_check in key_checks:
    status = "[PASS]" if passed_check else "[FAIL]"
    if passed_check:
        key_passed += 1
    print(f"  {status} {check_name}")

print()
print(f"KEY VALIDATIONS: {key_passed}/{len(key_checks)} passed")
print()

# ============================================================================
# FINAL VERDICT
# ============================================================================
if passed == total and key_passed == len(key_checks):
    print("=" * 70)
    print("ALL TESTS PASSED - PHASE 1 & 2 VALIDATED")
    print("READY FOR PHASE 3: OPTIMIZATION INTELLIGENCE")
    print("=" * 70)
else:
    print("=" * 70)
    print("SOME TESTS FAILED - REVIEW REQUIRED")
    print("=" * 70)
