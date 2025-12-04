"""
ATLAS TERMINAL v10.0 - COMPREHENSIVE TEST SUITE
================================================

Run all tests to verify ATLAS Terminal functionality.

Usage:
    python tests/test_all.py
    pytest tests/test_all.py -v
"""

import sys
import os
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import time


# ===================================================================
# TEST 1: QUANT PORTFOLIO OPTIMIZER
# ===================================================================

def test_quant_optimizer():
    """Test quant portfolio optimizer"""

    print("\n" + "="*80)
    print("TEST 1: QUANT PORTFOLIO OPTIMIZER")
    print("="*80)

    try:
        from quant_optimizer.atlas_quant_portfolio_optimizer import (
            MultivariablePortfolioOptimizer,
            PortfolioConstraints
        )

        # Generate sample data
        np.random.seed(42)
        n_days = 252
        tickers = ['AAPL', 'GOOGL', 'MSFT']

        returns_data = {
            ticker: np.random.normal(0.001, 0.02, n_days)
            for ticker in tickers
        }

        returns = pd.DataFrame(
            returns_data,
            index=pd.date_range(start='2023-01-01', periods=n_days, freq='D')
        )

        print("✅ Generated sample data")

        # Initialize optimizer
        optimizer = MultivariablePortfolioOptimizer(returns, risk_free_rate=0.03)
        print("✅ Optimizer initialized")

        # Set constraints
        constraints = PortfolioConstraints(
            min_weight=0.10,
            max_weight=0.50,
            max_leverage=1.0,
            long_only=True
        )
        print("✅ Constraints set")

        # Optimize
        result = optimizer.optimize_sharpe(constraints)
        print("✅ Optimization complete")

        # Validate results
        assert result.expected_return > 0, "Expected return should be positive"
        assert result.volatility > 0, "Volatility should be positive"
        assert result.sharpe_ratio > 0, "Sharpe ratio should be positive"
        assert abs(result.weights.sum() - 1.0) < 0.01, "Weights should sum to 1.0"
        assert all(result.weights >= 0.09), "Weights should respect min_weight"
        assert all(result.weights <= 0.51), "Weights should respect max_weight"

        print(f"\n📈 Results:")
        print(f"   Return: {result.expected_return*100:.2f}%")
        print(f"   Volatility: {result.volatility*100:.2f}%")
        print(f"   Sharpe: {result.sharpe_ratio:.3f}")
        print(f"   Weights sum: {result.weights.sum():.4f}")

        print("\n✅ QUANT OPTIMIZER TEST PASSED")
        return True

    except Exception as e:
        print(f"\n❌ QUANT OPTIMIZER TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


# ===================================================================
# TEST 2: LEVERAGE FIX
# ===================================================================

def test_leverage_fix():
    """Test leverage accounting fix"""

    print("\n" + "="*80)
    print("TEST 2: LEVERAGE FIX")
    print("="*80)

    try:
        from patches.atlas_leverage_fix import (
            integrate_leverage_fix_into_atlas,
            calculate_leveraged_return
        )

        # Test single calculation
        equity = 100
        cost_basis = 200
        current_value = 220
        leverage = 2.0

        ret = calculate_leveraged_return(current_value, cost_basis, equity, leverage)
        expected = 0.20  # 20%

        assert abs(ret - expected) < 0.001, f"Expected {expected}, got {ret}"
        print(f"✅ Single calculation: {ret*100:.2f}% (expected {expected*100:.2f}%)")

        # Test portfolio
        portfolio = pd.DataFrame({
            'ticker': ['AAPL', 'GOOGL'],
            'equity': [100, 150],
            'cost_basis': [200, 300],
            'current_value': [220, 315]
        })

        corrected = integrate_leverage_fix_into_atlas(portfolio, leverage_ratio=2.0)

        # Validate
        assert 'correct_return' in corrected.columns
        assert 'correct_weight' in corrected.columns
        assert abs(corrected['correct_weight'].sum() - 2.0) < 0.01, "Weights should sum to 200%"

        print(f"✅ Portfolio corrected")
        print(f"   Total weight: {corrected['correct_weight'].sum()*100:.0f}%")

        print("\n✅ LEVERAGE FIX TEST PASSED")
        return True

    except Exception as e:
        print(f"\n❌ LEVERAGE FIX TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


# ===================================================================
# TEST 3: HEATMAP FIX
# ===================================================================

def test_heatmap_fix():
    """Test heatmap fix"""

    print("\n" + "="*80)
    print("TEST 3: HEATMAP FIX")
    print("="*80)

    try:
        from patches.atlas_heatmap_fix import calculate_monthly_returns_correct

        # Create test data for November 2024
        dates = pd.date_range('2024-11-01', '2024-11-30', freq='D')
        returns = pd.DataFrame({
            'AAPL': np.random.normal(0.001, 0.02, len(dates)),
            'GOOGL': np.random.normal(0.001, 0.02, len(dates))
        }, index=dates)

        print("✅ Generated test data for November 2024")

        # Calculate monthly returns
        monthly = calculate_monthly_returns_correct(returns, include_partial_months=True)

        # Validate
        assert '2024-11' in monthly.index, "November 2024 should be in results"
        assert not monthly.loc['2024-11'].isna().all(), "November 2024 should have data"

        print(f"✅ November 2024 found in results")
        print(f"   AAPL: {monthly.loc['2024-11', 'AAPL']*100:.2f}%")
        print(f"   GOOGL: {monthly.loc['2024-11', 'GOOGL']*100:.2f}%")

        print("\n✅ HEATMAP FIX TEST PASSED")
        return True

    except Exception as e:
        print(f"\n❌ HEATMAP FIX TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


# ===================================================================
# TEST 4: MULTI-SOURCE DATA BROKER
# ===================================================================

def test_data_broker():
    """Test multi-source data broker"""

    print("\n" + "="*80)
    print("TEST 4: MULTI-SOURCE DATA BROKER")
    print("="*80)

    try:
        from multi_source_data.atlas_multi_source_data_broker import (
            HybridDataBroker,
            DATA_SOURCES
        )

        # Initialize broker
        broker = HybridDataBroker(DATA_SOURCES)
        print("✅ Broker initialized")

        # Count enabled sources
        enabled = sum(1 for config in DATA_SOURCES.values() if config.enabled)
        print(f"✅ {enabled} sources enabled")

        # Test fetch (may fail if no internet or APIs)
        try:
            result = broker.get_live_price('AAPL')

            if result.get('success', True) and result.get('price'):
                print(f"✅ Fetched AAPL: ${result['price']:.2f}")
                print(f"   Confidence: {result['confidence_score']:.0f}%")
                print(f"   Sources: {result['num_sources']}")
            else:
                print(f"⚠️ Fetch returned no data (API/network issue)")
        except Exception as fetch_error:
            print(f"⚠️ Fetch failed (expected if no internet): {fetch_error}")

        print("\n✅ DATA BROKER TEST PASSED")
        return True

    except Exception as e:
        print(f"\n❌ DATA BROKER TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


# ===================================================================
# TEST 5: DATA FRESHNESS SCORING
# ===================================================================

def test_data_freshness():
    """Test data freshness scoring"""

    print("\n" + "="*80)
    print("TEST 5: DATA FRESHNESS SCORING")
    print("="*80)

    try:
        from multi_source_data.atlas_data_freshness import (
            DataQualityScorer,
            DataQuality
        )

        scorer = DataQualityScorer()
        print("✅ Scorer initialized")

        # Test freshness calculation
        now = datetime.now()

        # Real-time data (5 seconds old)
        score_realtime = scorer.calculate_freshness_score(now - timedelta(seconds=5))
        assert score_realtime >= 90, "Real-time data should score 90+"
        print(f"✅ Real-time score: {score_realtime:.0f}/100")

        # Stale data (30 minutes old)
        score_stale = scorer.calculate_freshness_score(now - timedelta(minutes=30))
        assert score_stale <= 60, "Stale data should score 60 or less"
        print(f"✅ Stale score: {score_stale:.0f}/100")

        # Test quality scoring
        values = [150.0, 150.5, 150.2]
        timestamps = [now - timedelta(seconds=i*5) for i in range(3)]
        sources = ['Yahoo Finance', 'Alpha Vantage', 'IEX Cloud']

        score = scorer.score_data_quality(values, timestamps, sources)

        assert score.overall_score > 0
        assert score.freshness_score > 0
        assert score.reliability_score > 0
        assert score.validation_score > 0

        print(f"✅ Quality score: {score.overall_score:.0f}/100")
        print(f"   Rating: {score.quality_rating.value}")

        print("\n✅ DATA FRESHNESS TEST PASSED")
        return True

    except Exception as e:
        print(f"\n❌ DATA FRESHNESS TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


# ===================================================================
# TEST 6: CONFIGURATION
# ===================================================================

def test_configuration():
    """Test configuration"""

    print("\n" + "="*80)
    print("TEST 6: CONFIGURATION")
    print("="*80)

    try:
        import config

        # Check paths exist
        assert config.PROJECT_ROOT.exists(), "Project root should exist"
        assert config.DATA_DIR.exists(), "Data directory should exist"
        print("✅ Paths exist")

        # Check default values
        assert 1.0 <= config.DEFAULT_LEVERAGE <= 5.0, "Leverage should be 1-5x"
        assert 0 <= config.DEFAULT_MIN_WEIGHT <= 1, "Min weight should be 0-1"
        assert 0 <= config.DEFAULT_MAX_WEIGHT <= 1, "Max weight should be 0-1"
        print("✅ Default values valid")

        # Validate config
        errors, warnings = config.validate_config()

        if errors:
            print(f"⚠️ Config errors: {errors}")
        else:
            print("✅ No config errors")

        if warnings:
            print(f"⚠️ Config warnings: {warnings}")

        print("\n✅ CONFIGURATION TEST PASSED")
        return True

    except Exception as e:
        print(f"\n❌ CONFIGURATION TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


# ===================================================================
# TEST 7: IMPORTS
# ===================================================================

def test_imports():
    """Test that all modules can be imported"""

    print("\n" + "="*80)
    print("TEST 7: MODULE IMPORTS")
    print("="*80)

    modules = [
        'quant_optimizer.atlas_quant_portfolio_optimizer',
        'quant_optimizer.atlas_quant_optimizer_ui',
        'investopedia_integration.atlas_investopedia_production_2fa',
        'investopedia_integration.atlas_investopedia_diagnostics',
        'multi_source_data.atlas_multi_source_data_broker',
        'multi_source_data.atlas_advanced_data_sources',
        'multi_source_data.atlas_live_data_upgrade',
        'multi_source_data.atlas_data_freshness',
        'patches.atlas_leverage_fix',
        'patches.atlas_heatmap_fix',
    ]

    failed = []

    for module in modules:
        try:
            __import__(module)
            print(f"✅ {module}")
        except Exception as e:
            print(f"❌ {module}: {e}")
            failed.append(module)

    if not failed:
        print("\n✅ ALL IMPORTS SUCCESSFUL")
        return True
    else:
        print(f"\n❌ {len(failed)} IMPORTS FAILED")
        return False


# ===================================================================
# RUN ALL TESTS
# ===================================================================

def run_all_tests():
    """Run all tests"""

    print("\n" + "="*80)
    print("🧪 ATLAS TERMINAL v10.0 - COMPREHENSIVE TEST SUITE")
    print("="*80)

    start_time = time.time()

    tests = [
        ("Imports", test_imports),
        ("Configuration", test_configuration),
        ("Quant Optimizer", test_quant_optimizer),
        ("Leverage Fix", test_leverage_fix),
        ("Heatmap Fix", test_heatmap_fix),
        ("Data Broker", test_data_broker),
        ("Data Freshness", test_data_freshness),
    ]

    results = {}

    for test_name, test_func in tests:
        try:
            results[test_name] = test_func()
        except Exception as e:
            print(f"\n❌ {test_name} crashed: {e}")
            results[test_name] = False

    elapsed = time.time() - start_time

    # Summary
    print("\n" + "="*80)
    print("📊 TEST SUMMARY")
    print("="*80)

    passed = sum(results.values())
    total = len(results)

    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name:.<40} {status}")

    print("\n" + "="*80)
    print(f"Results: {passed}/{total} tests passed")
    print(f"Time: {elapsed:.2f} seconds")
    print("="*80)

    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️ {total - passed} TEST(S) FAILED")
        return 1


# ===================================================================
# MAIN
# ===================================================================

if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
