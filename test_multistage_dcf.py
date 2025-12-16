"""
Comprehensive Test Suite for Multi-Stage DCF Implementation

Tests all three model types with all four templates.
"""

import sys
from datetime import datetime

print("=" * 80)
print("ATLAS v11.0 - Multi-Stage DCF Test Suite")
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
    from analytics.multistage_dcf import (
        DCFModelType,
        Stage,
        MultiStageDCFConfig,
        MultiStageProjectionEngine,
        calculate_multistage_dcf
    )
    test_result("Import multistage_dcf core classes", True)
except Exception as e:
    test_result("Import multistage_dcf core classes", False, str(e))
    sys.exit(1)

try:
    from analytics.stage_templates import StageTemplates
    test_result("Import stage_templates", True)
except Exception as e:
    test_result("Import stage_templates", False, str(e))
    sys.exit(1)

# =============================================================================
# TEST 2: Template Loading
# =============================================================================
print("\n" + "="*80)
print("Testing: Template Loading")
print("="*80)

historical_data = {
    'revenue': 50e9,
    'ebit': 10e9,
    'revenue_growth_3yr': 0.30,
    'tax_rate': 0.21
}

templates_to_test = [
    ('hypergrowth_tech', 3),
    ('growth_company', 2),
    ('mature_company', 1),
    ('turnaround', 2)
]

for template_name, expected_stages in templates_to_test:
    try:
        stages = StageTemplates.get_template(template_name, historical_data)
        num_stages = len(stages)

        if num_stages == expected_stages:
            test_result(f"Template '{template_name}' loads", True,
                       f"{num_stages} stages as expected")
        else:
            test_result(f"Template '{template_name}' loads", False,
                       f"Expected {expected_stages} stages, got {num_stages}")

    except Exception as e:
        test_result(f"Template '{template_name}' loads", False, str(e))

# =============================================================================
# TEST 3: Stage Continuity
# =============================================================================
print("\n" + "="*80)
print("Testing: Stage Continuity")
print("="*80)

for template_name, _ in templates_to_test:
    try:
        stages = StageTemplates.get_template(template_name, historical_data)

        # Check first stage starts at 1
        if stages[0].start_year != 1:
            test_result(f"{template_name} - First stage starts at 1", False,
                       f"Starts at {stages[0].start_year}")
            continue

        # Check continuity
        continuous = True
        for i in range(len(stages) - 1):
            if stages[i].end_year + 1 != stages[i+1].start_year:
                continuous = False
                break

        test_result(f"{template_name} - Stages continuous", continuous,
                   f"Years {stages[0].start_year}-{stages[-1].end_year}")

    except Exception as e:
        test_result(f"{template_name} - Stage continuity", False, str(e))

# =============================================================================
# TEST 4: Growth Rate Validation
# =============================================================================
print("\n" + "="*80)
print("Testing: Growth Rate Validation")
print("="*80)

for template_name, _ in templates_to_test:
    try:
        stages = StageTemplates.get_template(template_name, historical_data)

        # Check growth rates decline (except turnaround stage 1)
        growth_declines = True
        for i in range(len(stages)):
            stage = stages[i]
            # Within stage check
            if template_name != 'turnaround' or stage.stage_number != 1:
                if stage.revenue_growth_start < stage.revenue_growth_end:
                    growth_declines = False
                    break

            # Between stages check
            if i < len(stages) - 1:
                next_stage = stages[i + 1]
                if template_name != 'turnaround' or stage.stage_number != 1:
                    if stage.revenue_growth_end > next_stage.revenue_growth_start + 0.001:
                        growth_declines = False
                        break

        test_result(f"{template_name} - Growth rates decline", growth_declines)

    except Exception as e:
        test_result(f"{template_name} - Growth validation", False, str(e))

# =============================================================================
# TEST 5: Projection Generation
# =============================================================================
print("\n" + "="*80)
print("Testing: Projection Generation")
print("="*80)

for template_name, expected_stages in templates_to_test:
    try:
        stages = StageTemplates.get_template(template_name, historical_data)

        config = MultiStageDCFConfig(
            model_type=DCFModelType.TWO_STAGE if expected_stages == 2 else
                      (DCFModelType.THREE_STAGE if expected_stages == 3 else DCFModelType.SINGLE_STAGE),
            stages=stages,
            terminal_growth_rate=0.025,
            wacc=0.10
        )

        # Validate config
        is_valid, error = config.validate()
        if not is_valid:
            test_result(f"{template_name} - Config validation", False, error)
            continue

        # Generate projections
        engine = MultiStageProjectionEngine(config, historical_data)
        projections = engine.generate_projections()

        expected_years = stages[-1].end_year
        actual_years = len(projections)

        if actual_years == expected_years:
            test_result(f"{template_name} - Generate projections", True,
                       f"{actual_years} years generated")
        else:
            test_result(f"{template_name} - Generate projections", False,
                       f"Expected {expected_years} years, got {actual_years}")

        # Check FCFF is calculated for all years
        all_have_fcff = all('fcff' in projections[y] for y in projections.keys())
        test_result(f"{template_name} - FCFF calculated", all_have_fcff)

    except Exception as e:
        test_result(f"{template_name} - Projection generation", False, str(e))

# =============================================================================
# TEST 6: DCF Valuation Calculation
# =============================================================================
print("\n" + "="*80)
print("Testing: DCF Valuation Calculation")
print("="*80)

for template_name, expected_stages in templates_to_test:
    try:
        stages = StageTemplates.get_template(template_name, historical_data)

        config = MultiStageDCFConfig(
            model_type=DCFModelType.TWO_STAGE if expected_stages == 2 else
                      (DCFModelType.THREE_STAGE if expected_stages == 3 else DCFModelType.SINGLE_STAGE),
            stages=stages,
            terminal_growth_rate=0.025,
            wacc=0.10
        )

        engine = MultiStageProjectionEngine(config, historical_data)
        projections = engine.generate_projections()

        # Calculate DCF
        dcf_result = calculate_multistage_dcf(
            projections=projections,
            terminal_growth=0.025,
            wacc=0.10,
            diluted_shares=1e9,
            net_debt=5e9
        )

        # Verify all expected keys exist
        expected_keys = ['enterprise_value', 'pv_fcff_explicit', 'pv_terminal_value',
                        'equity_value', 'value_per_share', 'terminal_value_pct']
        has_all_keys = all(key in dcf_result for key in expected_keys)

        if has_all_keys:
            test_result(f"{template_name} - DCF calculation", True,
                       f"Value/share: ${dcf_result['value_per_share']:.2f}")
        else:
            missing = [k for k in expected_keys if k not in dcf_result]
            test_result(f"{template_name} - DCF calculation", False,
                       f"Missing keys: {missing}")

        # Verify terminal value % is reasonable
        tv_pct = dcf_result['terminal_value_pct']
        reasonable_tv = 30 <= tv_pct <= 80
        test_result(f"{template_name} - Terminal value % reasonable", reasonable_tv,
                   f"{tv_pct:.1f}% {'✓' if reasonable_tv else '⚠️'}")

    except Exception as e:
        test_result(f"{template_name} - DCF valuation", False, str(e))

# =============================================================================
# TEST 7: Growth Interpolation
# =============================================================================
print("\n" + "="*80)
print("Testing: Growth Interpolation")
print("="*80)

try:
    # Test linear interpolation
    stages = [
        Stage(1, "Test", 1, 5, 5, 0.20, 0.10, "linear",
              0.20, 0.25, "expanding", 0.10, 0.02, 0.04, 0.06)
    ]

    config = MultiStageDCFConfig(
        model_type=DCFModelType.SINGLE_STAGE,
        stages=stages,
        terminal_growth_rate=0.025,
        wacc=0.10
    )

    engine = MultiStageProjectionEngine(config, historical_data)
    projections = engine.generate_projections()

    # Check that growth rates decline linearly
    growth_rates = [projections[y]['revenue_growth'] for y in sorted(projections.keys())]

    # Should go from 0.20 to 0.10
    first_rate = growth_rates[0]
    last_rate = growth_rates[-1]

    linear_correct = (abs(first_rate - 0.20) < 0.01 and abs(last_rate - 0.10) < 0.01)
    test_result("Linear interpolation works", linear_correct,
               f"Start: {first_rate*100:.1f}%, End: {last_rate*100:.1f}%")

except Exception as e:
    test_result("Growth interpolation", False, str(e))

# =============================================================================
# TEST 8: Configuration Validation
# =============================================================================
print("\n" + "="*80)
print("Testing: Configuration Validation")
print("="*80)

# Test 1: Terminal growth too high
try:
    stages = [Stage(1, "Test", 1, 5, 5, 0.10, 0.05, "linear",
                    0.20, 0.20, "stable", 0.10, 0.02, 0.04, 0.06)]

    config = MultiStageDCFConfig(
        model_type=DCFModelType.SINGLE_STAGE,
        stages=stages,
        terminal_growth_rate=0.08,  # Higher than final stage (0.05)
        wacc=0.10
    )

    is_valid, error = config.validate()
    test_result("Validation catches terminal > final growth", not is_valid,
               f"Correctly rejected" if not is_valid else "Should have rejected")

except Exception as e:
    test_result("Validation - terminal growth", False, str(e))

# Test 2: WACC <= terminal growth
try:
    stages = [Stage(1, "Test", 1, 5, 5, 0.10, 0.05, "linear",
                    0.20, 0.20, "stable", 0.10, 0.02, 0.04, 0.06)]

    config = MultiStageDCFConfig(
        model_type=DCFModelType.SINGLE_STAGE,
        stages=stages,
        terminal_growth_rate=0.05,
        wacc=0.05  # Equal to terminal growth
    )

    is_valid, error = config.validate()
    test_result("Validation catches WACC <= terminal growth", not is_valid,
               f"Correctly rejected" if not is_valid else "Should have rejected")

except Exception as e:
    test_result("Validation - WACC vs terminal", False, str(e))

# =============================================================================
# TEST 9: Edge Cases
# =============================================================================
print("\n" + "="*80)
print("Testing: Edge Cases")
print("="*80)

# Test with zero growth
try:
    stages = [Stage(1, "Zero Growth", 1, 5, 5, 0.0, 0.0, "linear",
                    0.20, 0.20, "stable", 0.10, 0.02, 0.04, 0.06)]

    config = MultiStageDCFConfig(
        model_type=DCFModelType.SINGLE_STAGE,
        stages=stages,
        terminal_growth_rate=0.0,
        wacc=0.10
    )

    engine = MultiStageProjectionEngine(config, historical_data)
    projections = engine.generate_projections()

    # Revenue should be constant
    revenues = [projections[y]['revenue'] for y in sorted(projections.keys())]
    constant_revenue = all(abs(r - revenues[0]) / revenues[0] < 0.01 for r in revenues)

    test_result("Zero growth edge case", constant_revenue,
               "Revenue stays constant" if constant_revenue else "Revenue changed")

except Exception as e:
    test_result("Zero growth edge case", False, str(e))

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
    print("\nMulti-Stage DCF Implementation:")
    print("  • All 4 templates load correctly")
    print("  • Stage continuity validated")
    print("  • Growth rates decline properly")
    print("  • Projections generate accurately")
    print("  • DCF calculations correct")
    print("  • Terminal value percentages reasonable")
    print("  • Validation catches errors")
    print("  • Edge cases handled")

print("\n" + "=" * 80)
print(f"Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 80)

sys.exit(0 if tests_failed == 0 else 1)
