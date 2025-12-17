"""
Test error handler functionality.
"""

import sys
from pathlib import Path

# Add atlas_terminal to path
sys.path.insert(0, str(Path(__file__).parent))

# Mock streamlit for testing
class MockStreamlit:
    """Mock streamlit module for testing."""
    @staticmethod
    def error(msg):
        print(f"[STREAMLIT ERROR]: {msg}")

    @staticmethod
    def expander(title):
        class MockExpander:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            @staticmethod
            def code(msg):
                print(f"[CODE]: {msg}")
        return MockExpander()

sys.modules['streamlit'] = MockStreamlit()

# Now import error handler
from atlas_terminal.core.error_handler import safe_execute, ErrorHandler

def test_safe_execute_with_error():
    """Test safe_execute decorator with error."""
    print("Testing safe_execute with error...")

    @safe_execute(fallback_value="FALLBACK", context="test operation", show_error=False)
    def failing_function():
        raise ValueError("Test error")

    result = failing_function()
    assert result == "FALLBACK", f"Expected 'FALLBACK', got {result}"

    print("✅ safe_execute handles errors correctly!")
    return True

def test_safe_execute_without_error():
    """Test safe_execute decorator without error."""
    print("\nTesting safe_execute without error...")

    @safe_execute(fallback_value="FALLBACK", context="test operation", show_error=False)
    def working_function():
        return "SUCCESS"

    result = working_function()
    assert result == "SUCCESS", f"Expected 'SUCCESS', got {result}"

    print("✅ safe_execute passes through successful results!")
    return True

def test_error_message_patterns():
    """Test error message pattern matching."""
    print("\nTesting error message patterns...")

    # Test timeout error
    timeout_error = Exception("Connection timed out")
    msg = ErrorHandler._get_friendly_message(timeout_error, "fetching data")
    assert "reach financial data provider" in msg

    # Test zero division
    div_error = ZeroDivisionError("division by zero")
    msg = ErrorHandler._get_friendly_message(div_error, "calculation")
    assert "division by zero" in msg

    print("✅ Error message patterns work!")
    return True

def test_fallback_values():
    """Test different fallback value types."""
    print("\nTesting fallback value types...")

    # Test with None
    @safe_execute(fallback_value=None, context="test", show_error=False)
    def return_none():
        raise ValueError("Error")

    assert return_none() is None

    # Test with empty dict
    @safe_execute(fallback_value={}, context="test", show_error=False)
    def return_dict():
        raise ValueError("Error")

    assert return_dict() == {}

    # Test with zero
    @safe_execute(fallback_value=0, context="test", show_error=False)
    def return_zero():
        raise ValueError("Error")

    assert return_zero() == 0

    print("✅ Fallback values work for all types!")
    return True

def run_all_tests():
    """Run all error handler tests."""
    print("=" * 60)
    print("ERROR HANDLER TESTS")
    print("=" * 60)

    tests = [
        test_safe_execute_with_error,
        test_safe_execute_without_error,
        test_error_message_patterns,
        test_fallback_values
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            if test():
                passed += 1
        except Exception as e:
            print(f"❌ {test.__name__} FAILED: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print("\n" + "=" * 60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 60)

    if failed == 0:
        print("\n🎉 ALL TESTS PASSED!")
        return True
    else:
        print(f"\n⚠️ {failed} TEST(S) FAILED")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
