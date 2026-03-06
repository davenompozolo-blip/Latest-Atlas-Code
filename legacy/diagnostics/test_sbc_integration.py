"""
Comprehensive Test Suite for SBC Integration

Tests all aspects of Share-Based Compensation integration including:
- Detection and extraction
- Trend analysis
- Forecasting
- FCFF integration
- Valuation impact

Author: ATLAS Development Team
Version: 1.0.0
Date: 2025-12-16
"""

import sys
from datetime import datetime

print("=" * 80)
print("ATLAS v11.0 - SBC Integration Test Suite")
print("=" * 80)
print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

tests_passed = 0
tests_failed = 0
errors = []

def test_result(test_name, passed, details=""):
    global tests_passed, tests_failed, errors
    if passed:
        tests_passed += 1
        print(f"✓ {test_name}")
        if details:
            print(f"  → {details}")
    else:
        tests_failed += 1
        print(f"✗ {test_name}")
        if details:
            print(f"  → {details}")
            errors.append((test_name, details))

# =============================================================================
# TEST 1: Module Imports
# =============================================================================
print("\n" + "="*80)
print("Testing: Module Imports")
print("="*80)

try:
    from analytics.sbc_detector import SBCDetector, detect_sbc_for_company
    test_result("Import SBC detector", True)
except Exception as e:
    test_result("Import SBC detector", False, str(e))
    sys.exit(1)

try:
    from analytics.sbc_forecaster import (
        SBCForecaster,
        SBCForecastConfig,
        SBCForecastMethod,
        integrate_sbc_with_fcff,
        create_sbc_comparison_analysis
    )
    test_result("Import SBC forecaster", True)
except Exception as e:
    test_result("Import SBC forecaster", False, str(e))
    sys.exit(1)

# =============================================================================
# TEST 2: SBC Detection
# =============================================================================
print("\n" + "="*80)
print("Testing: SBC Detection")
print("="*80)

# Test with high-SBC companies
test_companies = [
    ('SNOW', 'Snowflake', True),  # Known high-SBC
    ('AAPL', 'Apple', True),  # Known moderate-SBC
]

for ticker, name, should_succeed in test_companies:
    try:
        print(f"\n  Testing {ticker} ({name})...")
        detector = SBCDetector(ticker)
        sbc_data = detector.extract_sbc_data()

        if sbc_data['success']:
            test_result(f"{ticker} - SBC detection", True,
                       f"Method: {sbc_data['method']}, Years: {sbc_data['years_available']}")

            # Check data quality
            has_required_fields = all(key in sbc_data for key in [
                'sbc_annual', 'revenue_annual', 'sbc_pct_revenue',
                'latest_sbc_pct', 'avg_sbc_pct', 'is_material'
            ])
            test_result(f"{ticker} - Data completeness", has_required_fields)

            # Check reasonable values
            avg_sbc = sbc_data['avg_sbc_pct']
            reasonable = 0 <= avg_sbc <= 50  # SBC shouldn't exceed 50% of revenue
            test_result(f"{ticker} - Reasonable SBC %", reasonable,
                       f"Avg SBC: {avg_sbc:.2f}%")

        elif should_succeed:
            test_result(f"{ticker} - SBC detection", False,
                       f"Expected success but failed: {sbc_data['error']}")
        else:
            test_result(f"{ticker} - Expected failure", True,
                       f"Correctly failed: {sbc_data['error']}")

    except Exception as e:
        test_result(f"{ticker} - SBC detection", False, str(e))

# =============================================================================
# TEST 3: Trend Analysis
# =============================================================================
print("\n" + "="*80)
print("Testing: Trend Analysis")
print("="*80)

try:
    # Use SNOW as test case (should have trend data)
    detector = SBCDetector('SNOW')
    sbc_data = detector.extract_sbc_data()

    if sbc_data['success']:
        trend_analysis = detector.analyze_sbc_trend()

        if trend_analysis['success']:
            test_result("Trend analysis generation", True)

            # Check trend direction is valid
            valid_directions = ['increasing', 'decreasing', 'stable']
            direction_valid = trend_analysis['trend_direction'] in valid_directions
            test_result("Valid trend direction", direction_valid,
                       f"Direction: {trend_analysis['trend_direction']}")

            # Check has recommendation
            has_recommendation = 'forecast_recommendation' in trend_analysis
            test_result("Forecast recommendation provided", has_recommendation)

        else:
            test_result("Trend analysis generation", False,
                       trend_analysis['error'])
    else:
        print("  ⚠️ Skipping trend analysis (no SBC data)")

except Exception as e:
    test_result("Trend analysis", False, str(e))

# =============================================================================
# TEST 4: Forecast Configuration Validation
# =============================================================================
print("\n" + "="*80)
print("Testing: Forecast Configuration Validation")
print("="*80)

# Test 1: Valid configuration
try:
    config = SBCForecastConfig(
        method=SBCForecastMethod.LINEAR_NORMALIZATION,
        starting_sbc_pct_revenue=10.0,
        forecast_years=10,
        normalization_target_pct=3.0,
        years_to_normalize=5
    )

    is_valid, error = config.validate()
    test_result("Valid configuration accepted", is_valid)

except Exception as e:
    test_result("Valid configuration", False, str(e))

# Test 2: Invalid - negative SBC
try:
    config = SBCForecastConfig(
        method=SBCForecastMethod.LINEAR_NORMALIZATION,
        starting_sbc_pct_revenue=-5.0,
        forecast_years=10,
        normalization_target_pct=3.0,
        years_to_normalize=5
    )

    is_valid, error = config.validate()
    test_result("Rejects negative SBC", not is_valid,
               "Correctly rejected" if not is_valid else "Should have rejected")

except Exception as e:
    test_result("Negative SBC validation", False, str(e))

# Test 3: Invalid - unrealistic SBC
try:
    config = SBCForecastConfig(
        method=SBCForecastMethod.LINEAR_NORMALIZATION,
        starting_sbc_pct_revenue=75.0,  # Unrealistic
        forecast_years=10
    )

    is_valid, error = config.validate()
    test_result("Rejects unrealistic SBC (>50%)", not is_valid)

except Exception as e:
    test_result("Unrealistic SBC validation", False, str(e))

# =============================================================================
# TEST 5: Forecast Generation (All Methods)
# =============================================================================
print("\n" + "="*80)
print("Testing: Forecast Generation")
print("="*80)

# Mock revenue projections
revenue_projections = {
    1: 10e9,
    2: 12e9,
    3: 14.4e9,
    4: 16.9e9,
    5: 19.5e9,
    6: 22.1e9,
    7: 24.5e9,
    8: 26.6e9,
    9: 28.4e9,
    10: 30.0e9
}

forecast_methods = [
    ('Linear Normalization', SBCForecastMethod.LINEAR_NORMALIZATION, {
        'starting_sbc_pct_revenue': 12.0,
        'normalization_target_pct': 3.0,
        'years_to_normalize': 5
    }),
    ('Maintain Current', SBCForecastMethod.MAINTAIN_CURRENT, {
        'starting_sbc_pct_revenue': 8.0
    }),
    ('Scale with Revenue', SBCForecastMethod.SCALE_WITH_REVENUE, {
        'starting_sbc_pct_revenue': 6.0
    })
]

for method_name, method_enum, kwargs in forecast_methods:
    try:
        config = SBCForecastConfig(
            method=method_enum,
            forecast_years=10,
            **kwargs
        )

        forecaster = SBCForecaster(config)
        sbc_forecast = forecaster.generate_sbc_forecast(revenue_projections)

        # Check all years generated
        all_years_present = len(sbc_forecast) == 10
        test_result(f"{method_name} - All years generated", all_years_present,
                   f"{len(sbc_forecast)} years")

        # Check all years have required fields
        required_fields = ['sbc_amount', 'sbc_pct_revenue', 'revenue']
        all_have_fields = all(
            all(field in sbc_forecast[y] for field in required_fields)
            for y in sbc_forecast.keys()
        )
        test_result(f"{method_name} - All fields present", all_have_fields)

        # Check SBC amounts are non-negative
        all_non_negative = all(
            sbc_forecast[y]['sbc_amount'] >= 0
            for y in sbc_forecast.keys()
        )
        test_result(f"{method_name} - Non-negative amounts", all_non_negative)

        # Method-specific tests
        if method_enum == SBCForecastMethod.LINEAR_NORMALIZATION:
            # Should decline from 12% to 3% over 5 years
            year1_pct = sbc_forecast[1]['sbc_pct_revenue']
            year5_pct = sbc_forecast[5]['sbc_pct_revenue']
            year10_pct = sbc_forecast[10]['sbc_pct_revenue']

            declining = year1_pct > year5_pct >= year10_pct
            test_result(f"{method_name} - SBC % declines", declining,
                       f"{year1_pct:.1f}% → {year5_pct:.1f}% → {year10_pct:.1f}%")

        elif method_enum == SBCForecastMethod.MAINTAIN_CURRENT:
            # Should maintain constant %
            percentages = [sbc_forecast[y]['sbc_pct_revenue'] for y in sbc_forecast.keys()]
            all_equal = all(abs(p - percentages[0]) < 0.01 for p in percentages)
            test_result(f"{method_name} - Constant %", all_equal,
                       f"All years: {percentages[0]:.1f}%")

    except Exception as e:
        test_result(f"{method_name} - Forecast generation", False, str(e))

# =============================================================================
# TEST 6: FCFF Integration
# =============================================================================
print("\n" + "="*80)
print("Testing: FCFF Integration")
print("="*80)

try:
    # Generate SBC forecast
    config = SBCForecastConfig(
        method=SBCForecastMethod.LINEAR_NORMALIZATION,
        starting_sbc_pct_revenue=10.0,
        forecast_years=5,
        normalization_target_pct=3.0,
        years_to_normalize=5
    )

    forecaster = SBCForecaster(config)
    revenue_proj_5y = {1: 100e9, 2: 110e9, 3: 121e9, 4: 133e9, 5: 146e9}
    sbc_forecast = forecaster.generate_sbc_forecast(revenue_proj_5y)

    # Mock FCFF projections
    fcff_projections = {
        1: {'year': 1, 'fcff': 20e9, 'revenue': 100e9},
        2: {'year': 2, 'fcff': 22e9, 'revenue': 110e9},
        3: {'year': 3, 'fcff': 24e9, 'revenue': 121e9},
        4: {'year': 4, 'fcff': 26e9, 'revenue': 133e9},
        5: {'year': 5, 'fcff': 28e9, 'revenue': 146e9}
    }

    # Integrate SBC
    updated_projections = integrate_sbc_with_fcff(
        fcff_projections,
        sbc_forecast,
        sbc_already_in_fcff=False
    )

    # Test 1: FCFF should be lower after SBC adjustment
    fcff_reduced = all(
        updated_projections[y]['fcff'] < fcff_projections[y]['fcff']
        for y in fcff_projections.keys()
    )
    test_result("FCFF integration - FCFF reduced", fcff_reduced)

    # Test 2: Check SBC fields added
    has_sbc_fields = all(
        'sbc_amount' in updated_projections[y] and
        'sbc_pct_revenue' in updated_projections[y]
        for y in updated_projections.keys()
    )
    test_result("FCFF integration - SBC fields added", has_sbc_fields)

    # Test 3: Check fcff_before_sbc stored
    has_before_sbc = all(
        'fcff_before_sbc' in updated_projections[y]
        for y in updated_projections.keys()
    )
    test_result("FCFF integration - Before SBC stored", has_before_sbc)

except Exception as e:
    test_result("FCFF integration", False, str(e))

# =============================================================================
# TEST 7: Valuation Impact Calculation
# =============================================================================
print("\n" + "="*80)
print("Testing: Valuation Impact Calculation")
print("="*80)

try:
    # Generate SBC forecast
    config = SBCForecastConfig(
        method=SBCForecastMethod.LINEAR_NORMALIZATION,
        starting_sbc_pct_revenue=10.0,
        forecast_years=10,
        normalization_target_pct=3.0,
        years_to_normalize=5
    )

    forecaster = SBCForecaster(config)
    sbc_forecast = forecaster.generate_sbc_forecast(revenue_projections)

    # Calculate impact
    base_ev = 200e9  # $200B enterprise value
    impact = forecaster.calculate_sbc_impact_on_valuation(
        base_enterprise_value=base_ev,
        discount_rate=0.10,
        diluted_shares=1e9
    )

    # Test 1: All required fields present
    required_impact_fields = [
        'base_enterprise_value', 'sbc_present_value', 'adjusted_enterprise_value',
        'sbc_impact_per_share', 'pct_impact_on_value'
    ]
    all_fields_present = all(field in impact for field in required_impact_fields)
    test_result("Valuation impact - All fields present", all_fields_present)

    # Test 2: Adjusted EV should be lower
    ev_reduced = impact['adjusted_enterprise_value'] < impact['base_enterprise_value']
    test_result("Valuation impact - EV reduced", ev_reduced)

    # Test 3: PV should be positive
    pv_positive = impact['sbc_present_value'] > 0
    test_result("Valuation impact - Positive PV", pv_positive,
               f"SBC PV: ${impact['sbc_present_value']/1e9:.2f}B")

    # Test 4: % impact should be reasonable
    pct_impact = impact['pct_impact_on_value']
    reasonable_impact = 0 < pct_impact < 50
    test_result("Valuation impact - Reasonable % impact", reasonable_impact,
               f"{pct_impact:.1f}% impact")

except Exception as e:
    test_result("Valuation impact calculation", False, str(e))

# =============================================================================
# TEST 8: Comparison Analysis
# =============================================================================
print("\n" + "="*80)
print("Testing: Comparison Analysis")
print("="*80)

try:
    # Mock valuation results
    valuation_without_sbc = {
        'enterprise_value': 200e9,
        'value_per_share': 200.0
    }

    valuation_with_sbc = {
        'enterprise_value': 180e9,
        'value_per_share': 180.0
    }

    # Create comparison
    comparison = create_sbc_comparison_analysis(
        valuation_without_sbc,
        valuation_with_sbc,
        sbc_forecast
    )

    # Test 1: All required fields
    required_comparison_fields = [
        'enterprise_value_without_sbc', 'enterprise_value_with_sbc', 'ev_impact',
        'value_per_share_without_sbc', 'value_per_share_with_sbc', 'per_share_impact',
        'interpretation'
    ]
    all_comparison_fields = all(field in comparison for field in required_comparison_fields)
    test_result("Comparison - All fields present", all_comparison_fields)

    # Test 2: Impact calculated correctly
    ev_impact_correct = abs(comparison['ev_impact'] - 20e9) < 1e6  # $20B difference
    test_result("Comparison - Correct EV impact", ev_impact_correct,
               f"Impact: ${comparison['ev_impact']/1e9:.2f}B")

    # Test 3: Has interpretation
    has_interpretation = len(comparison['interpretation']) > 0
    test_result("Comparison - Has interpretation", has_interpretation)

except Exception as e:
    test_result("Comparison analysis", False, str(e))

# =============================================================================
# TEST 9: Edge Cases
# =============================================================================
print("\n" + "="*80)
print("Testing: Edge Cases")
print("="*80)

# Test 1: Zero SBC
try:
    config = SBCForecastConfig(
        method=SBCForecastMethod.MAINTAIN_CURRENT,
        starting_sbc_pct_revenue=0.0,
        forecast_years=5
    )

    forecaster = SBCForecaster(config)
    revenue_proj = {1: 100e9, 2: 110e9, 3: 121e9, 4: 133e9, 5: 146e9}
    sbc_forecast = forecaster.generate_sbc_forecast(revenue_proj)

    all_zero = all(sbc_forecast[y]['sbc_amount'] == 0 for y in sbc_forecast.keys())
    test_result("Edge case - Zero SBC", all_zero,
               "All SBC amounts are zero" if all_zero else "Non-zero amounts found")

except Exception as e:
    test_result("Edge case - Zero SBC", False, str(e))

# Test 2: Very high SBC (40% of revenue)
try:
    config = SBCForecastConfig(
        method=SBCForecastMethod.LINEAR_NORMALIZATION,
        starting_sbc_pct_revenue=40.0,
        forecast_years=10,
        normalization_target_pct=5.0,
        years_to_normalize=8
    )

    forecaster = SBCForecaster(config)
    sbc_forecast = forecaster.generate_sbc_forecast(revenue_projections)

    year1_pct = sbc_forecast[1]['sbc_pct_revenue']
    year8_pct = sbc_forecast[8]['sbc_pct_revenue']

    declining = year1_pct > year8_pct
    test_result("Edge case - Very high SBC normalizes", declining,
               f"{year1_pct:.1f}% → {year8_pct:.1f}%")

except Exception as e:
    test_result("Edge case - High SBC", False, str(e))

# =============================================================================
# SUMMARY
# =============================================================================
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"Tests Passed: {tests_passed}")
print(f"Tests Failed: {tests_failed}")
print(f"Total Tests: {tests_passed + tests_failed}")
if tests_passed + tests_failed > 0:
    print(f"Success Rate: {(tests_passed/(tests_passed+tests_failed)*100):.1f}%")

if errors:
    print("\n❌ ERRORS:")
    for test_name, error in errors:
        print(f"\n{test_name}:")
        print(f"  {error}")
else:
    print("\n✅ ALL TESTS PASSED!")
    print("\nSBC Integration Test Results:")
    print("  • Module imports successful")
    print("  • SBC detection working")
    print("  • Trend analysis functional")
    print("  • Configuration validation works")
    print("  • All forecast methods generate correctly")
    print("  • FCFF integration properly adjusts cash flows")
    print("  • Valuation impact calculated accurately")
    print("  • Comparison analysis provides insights")
    print("  • Edge cases handled properly")

print("\n" + "=" * 80)
print(f"Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 80)

sys.exit(0 if tests_failed == 0 else 1)
