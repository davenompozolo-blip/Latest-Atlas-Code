"""
ATLAS Terminal v10.0 - Comprehensive Module Test
Tests all 10 core modules for import and basic functionality
"""

import sys
import os
import traceback

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

def test_imports():
    """Test all module imports"""
    print("="*80)
    print("ATLAS v10.0 - MODULE IMPORT TEST")
    print("="*80)

    tests = []
    passed = 0
    failed = 0

    # Test 1: Config
    print("\n[1/11] Testing config module...")
    try:
        from config import config
        assert config.RISK_FREE_RATE == 0.045
        assert config.DEFAULT_LEVERAGE == 2.0
        tests.append(("Config module", True, None))
        passed += 1
        print("✅ PASS")
    except Exception as e:
        tests.append(("Config module", False, str(e)))
        failed += 1
        print(f"❌ FAIL: {e}")

    # Test 2: Quant Optimizer
    print("\n[2/11] Testing quant_optimizer/atlas_quant_portfolio_optimizer.py...")
    try:
        from quant_optimizer.atlas_quant_portfolio_optimizer import PortfolioOptimizer
        tests.append(("Quant Portfolio Optimizer", True, None))
        passed += 1
        print("✅ PASS")
    except Exception as e:
        tests.append(("Quant Portfolio Optimizer", False, str(e)))
        failed += 1
        print(f"❌ FAIL: {e}")

    # Test 3: Quant Optimizer UI
    print("\n[3/11] Testing quant_optimizer/atlas_quant_optimizer_ui.py...")
    try:
        from quant_optimizer.atlas_quant_optimizer_ui import display_optimization_results
        tests.append(("Quant Optimizer UI", True, None))
        passed += 1
        print("✅ PASS")
    except Exception as e:
        tests.append(("Quant Optimizer UI", False, str(e)))
        failed += 1
        print(f"❌ FAIL: {e}")

    # Test 4: Leverage Fix
    print("\n[4/11] Testing patches/atlas_leverage_fix.py...")
    try:
        from patches.atlas_leverage_fix import calculate_leverage_correct
        import numpy as np
        weights = np.array([0.3, 0.4, 0.5, 0.8])
        leverage = calculate_leverage_correct(weights)
        assert abs(leverage - 2.0) < 0.01
        tests.append(("Leverage Fix", True, None))
        passed += 1
        print("✅ PASS")
    except Exception as e:
        tests.append(("Leverage Fix", False, str(e)))
        failed += 1
        print(f"❌ FAIL: {e}")

    # Test 5: Heatmap Fix
    print("\n[5/11] Testing patches/atlas_heatmap_fix.py...")
    try:
        from patches.atlas_heatmap_fix import create_correlation_matrix_correct
        tests.append(("Heatmap Fix", True, None))
        passed += 1
        print("✅ PASS")
    except Exception as e:
        tests.append(("Heatmap Fix", False, str(e)))
        failed += 1
        print(f"❌ FAIL: {e}")

    # Test 6: Multi-Source Data Broker
    print("\n[6/11] Testing multi_source_data/atlas_multi_source_data_broker.py...")
    try:
        from multi_source_data.atlas_multi_source_data_broker import DataBroker
        tests.append(("Multi-Source Data Broker", True, None))
        passed += 1
        print("✅ PASS")
    except Exception as e:
        tests.append(("Multi-Source Data Broker", False, str(e)))
        failed += 1
        print(f"❌ FAIL: {e}")

    # Test 7: Advanced Data Sources
    print("\n[7/11] Testing multi_source_data/atlas_advanced_data_sources.py...")
    try:
        from multi_source_data.atlas_advanced_data_sources import AlphaVantageSource, FMPSource
        tests.append(("Advanced Data Sources", True, None))
        passed += 1
        print("✅ PASS")
    except Exception as e:
        tests.append(("Advanced Data Sources", False, str(e)))
        failed += 1
        print(f"❌ FAIL: {e}")

    # Test 8: Live Data Upgrade
    print("\n[8/11] Testing multi_source_data/atlas_live_data_upgrade.py...")
    try:
        from multi_source_data.atlas_live_data_upgrade import LiveDataStream
        tests.append(("Live Data Upgrade", True, None))
        passed += 1
        print("✅ PASS")
    except Exception as e:
        tests.append(("Live Data Upgrade", False, str(e)))
        failed += 1
        print(f"❌ FAIL: {e}")

    # Test 9: Data Freshness
    print("\n[9/11] Testing multi_source_data/atlas_data_freshness.py...")
    try:
        from multi_source_data.atlas_data_freshness import calculate_freshness_score
        from datetime import datetime
        score = calculate_freshness_score(datetime.now())
        assert score == 100.0
        tests.append(("Data Freshness", True, None))
        passed += 1
        print("✅ PASS")
    except Exception as e:
        tests.append(("Data Freshness", False, str(e)))
        failed += 1
        print(f"❌ FAIL: {e}")

    # Test 10: Investopedia 2FA
    print("\n[10/11] Testing investopedia_integration/atlas_investopedia_production_2fa.py...")
    try:
        from investopedia_integration.atlas_investopedia_production_2fa import InvestopediaAuth
        tests.append(("Investopedia 2FA", True, None))
        passed += 1
        print("✅ PASS")
    except Exception as e:
        tests.append(("Investopedia 2FA", False, str(e)))
        failed += 1
        print(f"❌ FAIL: {e}")

    # Test 11: Investopedia Diagnostics
    print("\n[11/11] Testing investopedia_integration/atlas_investopedia_diagnostics.py...")
    try:
        from investopedia_integration.atlas_investopedia_diagnostics import check_session_status
        tests.append(("Investopedia Diagnostics", True, None))
        passed += 1
        print("✅ PASS")
    except Exception as e:
        tests.append(("Investopedia Diagnostics", False, str(e)))
        failed += 1
        print(f"❌ FAIL: {e}")

    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"\nTotal Tests: {len(tests)}")
    print(f"✅ Passed: {passed}/{len(tests)}")
    print(f"❌ Failed: {failed}/{len(tests)}")

    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for name, success, error in tests:
            if not success:
                print(f"  - {name}: {error}")

    print("\n" + "="*80)

    if passed == len(tests):
        print("🎉 ALL TESTS PASSED! ATLAS v10.0 REPAIR COMPLETE!")
        print("="*80)
        return True
    else:
        print(f"⚠️  {failed} test(s) failed. Please review errors above.")
        print("="*80)
        return False

if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1)
