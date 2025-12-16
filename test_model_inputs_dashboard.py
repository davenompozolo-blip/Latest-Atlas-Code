"""
Test script for Model Inputs Dashboard implementation
Tests all core functionality without requiring Streamlit UI
"""

import sys
import traceback
from datetime import datetime

print("=" * 80)
print("ATLAS v11.0 - Model Inputs Dashboard Test Suite")
print("=" * 80)
print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

# Track test results
tests_passed = 0
tests_failed = 0
errors = []

def test_section(name):
    """Print test section header"""
    print(f"\n{'='*80}")
    print(f"Testing: {name}")
    print(f"{'='*80}")

def test_result(test_name, passed, error=None):
    """Record and print test result"""
    global tests_passed, tests_failed, errors
    if passed:
        tests_passed += 1
        print(f"✓ {test_name}")
    else:
        tests_failed += 1
        print(f"✗ {test_name}")
        if error:
            errors.append((test_name, error))
            print(f"  Error: {error}")

# =============================================================================
# TEST 1: Module Imports
# =============================================================================
test_section("Module Imports")

try:
    from analytics.model_inputs import (
        calculate_dupont_roe,
        calculate_sustainable_growth_rate,
        get_live_treasury_yield,
        calculate_cost_of_capital,
        calculate_diluted_shares,
        extract_financial_data_for_model_inputs
    )
    test_result("Import analytics.model_inputs", True)
except Exception as e:
    test_result("Import analytics.model_inputs", False, str(e))

try:
    from analytics.dcf_projections import (
        DCFProjections,
        create_projections_from_financial_data
    )
    test_result("Import analytics.dcf_projections", True)
except Exception as e:
    test_result("Import analytics.dcf_projections", False, str(e))

try:
    from analytics.scenario_manager import (
        ScenarioManager,
        create_bull_scenario,
        create_bear_scenario
    )
    test_result("Import analytics.scenario_manager", True)
except Exception as e:
    test_result("Import analytics.scenario_manager", False, str(e))

try:
    from analytics.projection_visualizer import (
        create_revenue_growth_chart,
        create_fcff_progression_chart,
        apply_atlas_theme
    )
    test_result("Import analytics.projection_visualizer", True)
except Exception as e:
    test_result("Import analytics.projection_visualizer", False, str(e))

# =============================================================================
# TEST 2: DuPont ROE Analysis
# =============================================================================
test_section("DuPont ROE Analysis")

try:
    # Sample financial data
    sample_data = {
        'net_income': 100e9,
        'revenue': 400e9,
        'total_assets': 350e9,
        'total_equity': 150e9
    }

    dupont_result = calculate_dupont_roe(sample_data)

    # Verify all components returned
    required_keys = ['net_margin', 'asset_turnover', 'financial_leverage',
                     'roe_dupont', 'roe_direct', 'verification_check']
    has_all_keys = all(key in dupont_result for key in required_keys)
    test_result("DuPont ROE - Returns all components", has_all_keys)

    # Verify calculation accuracy
    expected_net_margin = 100e9 / 400e9  # 0.25
    actual_net_margin = dupont_result['net_margin']
    margin_correct = abs(actual_net_margin - expected_net_margin) < 0.001
    test_result("DuPont ROE - Net margin calculation", margin_correct)

    # Verify ROE verification check passes
    verification_passes = dupont_result['verification_check']
    test_result("DuPont ROE - Verification check", verification_passes)

    print(f"  → ROE calculated: {dupont_result['roe_dupont']*100:.2f}%")

except Exception as e:
    test_result("DuPont ROE Analysis", False, str(e))

# =============================================================================
# TEST 3: Sustainable Growth Rate
# =============================================================================
test_section("Sustainable Growth Rate (SGR)")

try:
    sample_data = {
        'net_income': 100e9,
        'dividends_paid': 20e9
    }

    roe = 0.25  # 25%
    sgr_result = calculate_sustainable_growth_rate(sample_data, roe)

    # Verify all components returned
    required_keys = ['plowback_ratio', 'sgr', 'suggested_terminal_growth',
                     'terminal_growth_guidance']
    has_all_keys = all(key in sgr_result for key in required_keys)
    test_result("SGR - Returns all components", has_all_keys)

    # Verify plowback ratio calculation
    expected_plowback = (100e9 - 20e9) / 100e9  # 0.80
    actual_plowback = sgr_result['plowback_ratio']
    plowback_correct = abs(actual_plowback - expected_plowback) < 0.001
    test_result("SGR - Plowback ratio calculation", plowback_correct)

    # Verify SGR = Plowback × ROE
    expected_sgr = expected_plowback * roe
    actual_sgr = sgr_result['sgr']
    sgr_correct = abs(actual_sgr - expected_sgr) < 0.001
    test_result("SGR - SGR calculation (Plowback × ROE)", sgr_correct)

    print(f"  → SGR calculated: {sgr_result['sgr']*100:.2f}%")
    print(f"  → Suggested terminal growth: {sgr_result['suggested_terminal_growth']*100:.2f}%")

except Exception as e:
    test_result("SGR Analysis", False, str(e))

# =============================================================================
# TEST 4: Live Treasury Yield
# =============================================================================
test_section("Live Treasury Yield")

try:
    treasury_result = get_live_treasury_yield()

    # Verify all components returned
    required_keys = ['yield', 'date', 'source', 'success']
    has_all_keys = all(key in treasury_result for key in required_keys)
    test_result("Treasury Yield - Returns all components", has_all_keys)

    # Verify yield is reasonable (between 0% and 15%)
    yield_value = treasury_result['yield']
    yield_reasonable = 0 <= yield_value <= 0.15
    test_result("Treasury Yield - Value is reasonable", yield_reasonable)

    # Print result
    if treasury_result['success']:
        print(f"  → Live yield fetched: {yield_value*100:.2f}%")
        print(f"  → Source: {treasury_result['source']}")
        print(f"  → Date: {treasury_result['date']}")
    else:
        print(f"  → Using fallback: {yield_value*100:.2f}%")
        print(f"  → Reason: Live data unavailable")

    test_result("Treasury Yield - Fetch or fallback", True)

except Exception as e:
    test_result("Treasury Yield Fetch", False, str(e))

# =============================================================================
# TEST 5: Cost of Capital (WACC)
# =============================================================================
test_section("Cost of Capital (WACC)")

try:
    sample_financial = {
        'total_debt': 100e9,
        'total_equity': 200e9,
        'interest_expense': 5e9,
        'tax_rate': 0.21
    }

    sample_market = {
        'beta': 1.2,
        'risk_free_rate': 0.045,
        'market_risk_premium': 0.06
    }

    wacc_result = calculate_cost_of_capital(sample_financial, sample_market)

    # Verify all components returned
    required_keys = ['cost_of_equity', 'cost_of_debt', 'wacc',
                     'weight_equity', 'weight_debt']
    has_all_keys = all(key in wacc_result for key in required_keys)
    test_result("WACC - Returns all components", has_all_keys)

    # Verify cost of equity (CAPM: Rf + Beta × MRP)
    expected_coe = 0.045 + 1.2 * 0.06  # 11.7%
    actual_coe = wacc_result['cost_of_equity']
    coe_correct = abs(actual_coe - expected_coe) < 0.001
    test_result("WACC - Cost of Equity (CAPM)", coe_correct)

    # Verify WACC is between cost of debt and cost of equity
    cod = wacc_result['cost_of_debt']
    wacc = wacc_result['wacc']
    wacc_reasonable = cod <= wacc <= actual_coe
    test_result("WACC - Value between cost of debt and equity", wacc_reasonable)

    print(f"  → Cost of Equity: {wacc_result['cost_of_equity']*100:.2f}%")
    print(f"  → Cost of Debt: {wacc_result['cost_of_debt']*100:.2f}%")
    print(f"  → WACC: {wacc_result['wacc']*100:.2f}%")

except Exception as e:
    test_result("WACC Calculation", False, str(e))

# =============================================================================
# TEST 6: Diluted Shares Calculation
# =============================================================================
test_section("Diluted Shares (Treasury Stock Method)")

try:
    sample_financial = {
        'shares_outstanding': 1000e6,  # 1B shares
        'stock_options_outstanding': 50e6,  # 50M options
        'rsu_outstanding': 20e6,  # 20M RSUs
        'average_strike_price': 50.0
    }

    sample_market = {
        'current_stock_price': 100.0
    }

    diluted_shares = calculate_diluted_shares(sample_financial, sample_market)

    # Verify diluted shares > basic shares
    basic_shares = sample_financial['shares_outstanding']
    dilution_added = diluted_shares > basic_shares
    test_result("Diluted Shares - Greater than basic shares", dilution_added)

    # Verify reasonable dilution (should be basic + some portion of options/RSUs)
    max_possible = basic_shares + sample_financial['stock_options_outstanding'] + sample_financial['rsu_outstanding']
    dilution_reasonable = basic_shares <= diluted_shares <= max_possible
    test_result("Diluted Shares - Reasonable dilution range", dilution_reasonable)

    dilution_pct = ((diluted_shares - basic_shares) / basic_shares) * 100
    print(f"  → Basic shares: {basic_shares/1e6:.1f}M")
    print(f"  → Diluted shares: {diluted_shares/1e6:.1f}M")
    print(f"  → Dilution: {dilution_pct:.2f}%")

except Exception as e:
    test_result("Diluted Shares Calculation", False, str(e))

# =============================================================================
# TEST 7: DCF Projections Class
# =============================================================================
test_section("DCF Projections Class")

try:
    # Create sample historical data
    historical_data = {
        'revenue': 400e9,
        'ebit': 100e9,
        'tax_rate': 0.21,
        'depreciation_amortization': 12e9,
        'capex': 15e9,
        'working_capital_change': 2e9,
        'net_income': 80e9
    }

    # Initialize DCFProjections
    projections = DCFProjections(
        ticker='TEST',
        historical_data=historical_data,
        forecast_years=5
    )
    test_result("DCFProjections - Initialization", True)

    # Verify auto-projections generated
    has_projections = len(projections.auto_projections) == 5
    test_result("DCFProjections - Auto-projections generated", has_projections)

    # Test manual override
    original_revenue_yr1 = projections.final_projections[1]['revenue']
    projections.set_manual_override(1, 'revenue', 450e9)
    new_revenue_yr1 = projections.final_projections[1]['revenue']
    override_worked = new_revenue_yr1 == 450e9
    test_result("DCFProjections - Manual override", override_worked)

    # Verify smart recalculation (EBIT should maintain margin)
    original_margin = projections.auto_projections[1]['ebit'] / projections.auto_projections[1]['revenue']
    new_ebit = projections.final_projections[1]['ebit']
    expected_ebit = 450e9 * original_margin
    recalc_worked = abs(new_ebit - expected_ebit) / expected_ebit < 0.01
    test_result("DCFProjections - Smart recalculation", recalc_worked)

    # Test export to DataFrame
    df = projections.to_dataframe()
    df_valid = df is not None and len(df) == 5
    test_result("DCFProjections - Export to DataFrame", df_valid)

    # Test DCF format export
    dcf_format = projections.to_dcf_format()
    dcf_valid = isinstance(dcf_format, list) and len(dcf_format) == 5
    test_result("DCFProjections - Export to DCF format", dcf_valid)

    print(f"  → Forecast years: {projections.forecast_years}")
    print(f"  → Year 1 revenue (auto): ${original_revenue_yr1/1e9:.1f}B")
    print(f"  → Year 1 revenue (override): ${new_revenue_yr1/1e9:.1f}B")

except Exception as e:
    test_result("DCFProjections Class", False, str(e))
    traceback.print_exc()

# =============================================================================
# TEST 8: Scenario Manager
# =============================================================================
test_section("Scenario Manager")

try:
    # Create mock session state
    class MockSessionState:
        def __init__(self):
            self.dcf_scenarios = {}

    mock_state = MockSessionState()
    scenario_mgr = ScenarioManager(mock_state)
    test_result("ScenarioManager - Initialization", True)

    # Test saving a scenario
    mock_projections = DCFProjections('TEST', historical_data, 5)
    saved = scenario_mgr.save_scenario(
        name='Base Case',
        projections=mock_projections,
        wacc=0.10,
        terminal_growth=0.025,
        roe=0.25,
        sgr=0.20
    )
    test_result("ScenarioManager - Save scenario", saved)

    # Test loading a scenario
    loaded = scenario_mgr.load_scenario('Base Case', mock_projections)
    load_worked = loaded is not None and loaded['wacc'] == 0.10
    test_result("ScenarioManager - Load scenario", load_worked)

    # Test listing scenarios
    scenario_list = scenario_mgr.list_scenarios()
    list_worked = 'Base Case' in scenario_list
    test_result("ScenarioManager - List scenarios", list_worked)

    # Test creating bull scenario
    bull = create_bull_scenario(mock_projections)
    bull_valid = bull is not None and 'name' in bull
    test_result("ScenarioManager - Create bull scenario", bull_valid)

    # Test creating bear scenario
    bear = create_bear_scenario(mock_projections)
    bear_valid = bear is not None and 'name' in bear
    test_result("ScenarioManager - Create bear scenario", bear_valid)

    print(f"  → Scenarios saved: {len(scenario_list)}")

except Exception as e:
    test_result("Scenario Manager", False, str(e))
    traceback.print_exc()

# =============================================================================
# TEST 9: Integration with atlas_app.py
# =============================================================================
test_section("Integration Points")

try:
    # Test that display_model_inputs_dashboard is importable
    # (We can't actually call it without Streamlit context)
    from analytics.model_inputs_ui import display_model_inputs_dashboard
    test_result("Integration - UI module import", True)

    # Verify the function signature
    import inspect
    sig = inspect.signature(display_model_inputs_dashboard)
    has_ticker_param = 'ticker' in sig.parameters
    test_result("Integration - Function signature correct", has_ticker_param)

    # Verify return type hint (should return Dict)
    from typing import get_type_hints
    hints = get_type_hints(display_model_inputs_dashboard)
    returns_dict = 'return' in hints
    test_result("Integration - Returns dict type hint", returns_dict)

except Exception as e:
    test_result("Integration Points", False, str(e))

# =============================================================================
# TEST 10: atlas_app.py Integration Points
# =============================================================================
test_section("atlas_app.py Integration")

try:
    # Check that MODEL_INPUTS_DASHBOARD_AVAILABLE is defined
    with open('atlas_app.py', 'r') as f:
        atlas_content = f.read()

    has_import = 'from analytics.model_inputs_ui import display_model_inputs_dashboard' in atlas_content
    test_result("atlas_app.py - Dashboard import present", has_import)

    has_availability_flag = 'MODEL_INPUTS_DASHBOARD_AVAILABLE' in atlas_content
    test_result("atlas_app.py - Availability flag present", has_availability_flag)

    has_checkbox = 'Use Model Inputs Dashboard' in atlas_content
    test_result("atlas_app.py - Dashboard checkbox present", has_checkbox)

    has_session_state_storage = "st.session_state['dashboard_inputs']" in atlas_content
    test_result("atlas_app.py - Session state storage present", has_session_state_storage)

    has_dashboard_active_check = 'dashboard_active' in atlas_content
    test_result("atlas_app.py - Dashboard active check present", has_dashboard_active_check)

    has_dashboard_mode_logic = 'DASHBOARD MODE' in atlas_content
    test_result("atlas_app.py - Dashboard mode logic present", has_dashboard_mode_logic)

    print("  → All integration points verified in atlas_app.py")

except Exception as e:
    test_result("atlas_app.py Integration", False, str(e))

# =============================================================================
# TEST SUMMARY
# =============================================================================
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"Tests Passed: {tests_passed}")
print(f"Tests Failed: {tests_failed}")
print(f"Total Tests: {tests_passed + tests_failed}")
print(f"Success Rate: {(tests_passed/(tests_passed+tests_failed)*100):.1f}%")

if errors:
    print("\n❌ ERRORS ENCOUNTERED:")
    for test_name, error in errors:
        print(f"\n{test_name}:")
        print(f"  {error}")
else:
    print("\n✅ ALL TESTS PASSED!")

print("\n" + "=" * 80)
print(f"Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 80)

# Exit with appropriate code
sys.exit(0 if tests_failed == 0 else 1)
