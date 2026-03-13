"""
Unit tests for atlas_quant_dashboard/dashboard.py changes.

Tests the modified load_portfolio_data function which now:
- Removed sample data fallback
- Only loads from Alpaca live source
- Shows warning and stops if sync unavailable
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestLoadPortfolioData(unittest.TestCase):
    """Test suite for the modified load_portfolio_data function."""

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_load_portfolio_data_success(self, mock_load_alpaca, mock_st):
        """Test load_portfolio_data returns data when Alpaca sync succeeds."""
        # Arrange
        expected_data = {
            'portfolio_returns': Mock(),
            'benchmark_returns': Mock(),
            'asset_returns': Mock(),
            'weights': Mock(),
            'dates': ['2024-01-01', '2024-01-02']
        }
        mock_load_alpaca.return_value = expected_data
        mock_st.session_state = {}

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data
        result = load_portfolio_data(use_live=False)

        # Assert
        self.assertEqual(result, expected_data)
        self.assertEqual(mock_st.session_state['_quant_data_source_active'], 'live')
        mock_load_alpaca.assert_called_once()
        mock_st.warning.assert_not_called()
        mock_st.stop.assert_not_called()

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_load_portfolio_data_alpaca_returns_none(self, mock_load_alpaca, mock_st):
        """Test load_portfolio_data shows warning when Alpaca returns None."""
        # Arrange
        mock_load_alpaca.return_value = None
        mock_st.session_state = {}

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data
        result = load_portfolio_data(use_live=True)

        # Assert
        self.assertIsNone(result)
        mock_st.warning.assert_called_once_with("Awaiting sync. Run Alpaca sync and refresh.")
        mock_st.stop.assert_called_once()

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_load_portfolio_data_import_error(self, mock_load_alpaca, mock_st):
        """Test load_portfolio_data handles import errors."""
        # Arrange
        mock_load_alpaca.side_effect = ImportError("alpaca_adapter not found")
        mock_st.session_state = {}

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data

        # Using try-except since the function will raise but we want to verify behavior
        try:
            result = load_portfolio_data(use_live=False)
        except ImportError:
            pass

        # Assert
        mock_st.warning.assert_called_once()
        mock_st.stop.assert_called_once()

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_load_portfolio_data_exception_handling(self, mock_load_alpaca, mock_st):
        """Test load_portfolio_data handles general exceptions."""
        # Arrange
        mock_load_alpaca.side_effect = Exception("Network error")
        mock_st.session_state = {}

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data
        result = load_portfolio_data(use_live=True)

        # Assert
        self.assertIsNone(result)
        mock_st.warning.assert_called_once()
        mock_st.stop.assert_called_once()

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_load_portfolio_data_use_live_parameter(self, mock_load_alpaca, mock_st):
        """Test that use_live parameter doesn't affect behavior (always tries Alpaca)."""
        # Arrange
        expected_data = {'test': 'data'}
        mock_load_alpaca.return_value = expected_data
        mock_st.session_state = {}

        from atlas_quant_dashboard.dashboard import load_portfolio_data

        # Act - Test with use_live=True
        result_true = load_portfolio_data(use_live=True)

        # Reset mock
        mock_load_alpaca.reset_mock()
        mock_st.session_state = {}

        # Act - Test with use_live=False
        result_false = load_portfolio_data(use_live=False)

        # Assert - Both should behave the same (always load from Alpaca)
        self.assertEqual(result_true, expected_data)
        self.assertEqual(result_false, expected_data)
        self.assertEqual(mock_load_alpaca.call_count, 2)

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_load_portfolio_data_session_state_tracking(self, mock_load_alpaca, mock_st):
        """Test that session state is correctly updated on success."""
        # Arrange
        mock_data = {'portfolio': 'data'}
        mock_load_alpaca.return_value = mock_data
        mock_st.session_state = {}

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data
        result = load_portfolio_data()

        # Assert
        self.assertIn('_quant_data_source_active', mock_st.session_state)
        self.assertEqual(mock_st.session_state['_quant_data_source_active'], 'live')

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_load_portfolio_data_error_message_format(self, mock_load_alpaca, mock_st):
        """Test error message includes exception details."""
        # Arrange
        error_msg = "Connection timeout after 30s"
        mock_load_alpaca.side_effect = Exception(error_msg)
        mock_st.session_value = {}

        # Capture print output
        import io
        from contextlib import redirect_stdout

        f = io.StringIO()

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data
        with redirect_stdout(f):
            result = load_portfolio_data()

        # Assert
        output = f.getvalue()
        self.assertIn("[ATLAS] Live data unavailable", output)
        self.assertIn(error_msg, output)

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_load_portfolio_data_no_sample_fallback(self, mock_load_alpaca, mock_st):
        """Test that sample data fallback no longer exists (regression test)."""
        # Arrange
        mock_load_alpaca.return_value = None
        mock_st.session_state = {}

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data
        result = load_portfolio_data()

        # Assert - Should stop, not fall back to sample data
        self.assertIsNone(result)
        mock_st.stop.assert_called_once()
        # Verify session state doesn't contain 'sample' or 'sample_fallback'
        self.assertNotIn('sample', str(mock_st.session_state.get('_quant_data_source_active', '')))


class TestDashboardIntegration(unittest.TestCase):
    """Integration tests for dashboard changes."""

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_dashboard_flow_with_valid_data(self, mock_load_alpaca, mock_st):
        """Test complete flow when valid data is available."""
        # Arrange
        mock_data = {
            'portfolio_returns': Mock(values=[0.01, 0.02]),
            'benchmark_returns': Mock(values=[0.015, 0.018]),
            'asset_returns': Mock(values=[[0.01, 0.02]], columns=['AAPL', 'MSFT']),
            'weights': Mock(values=[0.5, 0.5]),
            'dates': ['2024-01-01', '2024-01-02']
        }
        mock_load_alpaca.return_value = mock_data
        mock_st.session_state = {}

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data
        result = load_portfolio_data(use_live=True)

        # Assert
        self.assertIsNotNone(result)
        self.assertEqual(result, mock_data)
        self.assertEqual(mock_st.session_state['_quant_data_source_active'], 'live')

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_dashboard_flow_with_missing_data(self, mock_load_alpaca, mock_st):
        """Test complete flow when data is missing."""
        # Arrange
        mock_load_alpaca.return_value = None
        mock_st.session_state = {}

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data
        result = load_portfolio_data(use_live=True)

        # Assert
        self.assertIsNone(result)
        mock_st.warning.assert_called_once()
        mock_st.stop.assert_called_once()


class TestRemovedSampleDataFunctionality(unittest.TestCase):
    """Tests to verify sample data functions are removed."""

    def test_generate_sample_portfolio_import_removed(self):
        """Verify generate_sample_portfolio is no longer imported."""
        # This should not raise ImportError for dashboard, but the function
        # itself should not be accessible
        try:
            from atlas_quant_dashboard.dashboard import generate_sample_portfolio
            self.fail("generate_sample_portfolio should not be imported")
        except ImportError:
            pass  # Expected

    def test_load_sample_portfolio_data_removed(self):
        """Verify load_sample_portfolio_data function is removed."""
        try:
            from atlas_quant_dashboard.dashboard import load_sample_portfolio_data
            self.fail("load_sample_portfolio_data should be removed")
        except (ImportError, AttributeError):
            pass  # Expected


if __name__ == '__main__':
    unittest.main()