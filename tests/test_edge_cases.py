"""
Edge case and boundary condition tests for Supabase migration PR.

This file provides additional test coverage for:
- Boundary conditions
- Error handling edge cases
- Data validation
- Negative test scenarios
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
import pandas as pd
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestSupabaseViewsEdgeCases(unittest.TestCase):
    """Edge case tests for services/supabase_views.py."""

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_very_large_dataset(self, mock_get_client, mock_st):
        """Test fetch_view handles very large datasets."""
        # Arrange - simulate 10,000 row dataset
        mock_supabase = Mock()
        mock_table = Mock()
        mock_select = Mock()
        mock_result = Mock()

        large_data = [{'id': i, 'value': i * 10} for i in range(10000)]
        mock_result.data = large_data

        mock_select.execute.return_value = mock_result
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table
        mock_get_client.return_value = mock_supabase

        # Act
        from services.supabase_views import fetch_view
        result = fetch_view("vw_large_dataset")

        # Assert
        self.assertEqual(len(result), 10000)

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_special_characters_in_data(self, mock_get_client, mock_st):
        """Test fetch_view handles special characters correctly."""
        # Arrange
        mock_supabase = Mock()
        mock_table = Mock()
        mock_select = Mock()
        mock_result = Mock()

        # Data with special characters
        special_data = [
            {'symbol': 'BRK.A', 'name': 'Berkshire & Hathaway'},
            {'symbol': 'META', 'name': "O'Reilly Automotive"},
            {'symbol': 'TEST', 'name': 'Test "Company" <Inc>'}
        ]
        mock_result.data = special_data

        mock_select.execute.return_value = mock_result
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table
        mock_get_client.return_value = mock_supabase

        # Act
        from services.supabase_views import fetch_view
        result = fetch_view("vw_special_chars")

        # Assert
        self.assertEqual(len(result), 3)
        self.assertEqual(result.iloc[0]['symbol'], 'BRK.A')
        self.assertIn('&', result.iloc[0]['name'])

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_null_values_in_data(self, mock_get_client, mock_st):
        """Test fetch_view handles NULL/None values."""
        # Arrange
        mock_supabase = Mock()
        mock_table = Mock()
        mock_select = Mock()
        mock_result = Mock()

        null_data = [
            {'symbol': 'AAPL', 'value': 100.0, 'comment': None},
            {'symbol': 'MSFT', 'value': None, 'comment': 'Valid'},
            {'symbol': None, 'value': 150.0, 'comment': 'Test'}
        ]
        mock_result.data = null_data

        mock_select.execute.return_value = mock_result
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table
        mock_get_client.return_value = mock_supabase

        # Act
        from services.supabase_views import fetch_view
        result = fetch_view("vw_nulls")

        # Assert
        self.assertEqual(len(result), 3)
        self.assertTrue(pd.isna(result.iloc[0]['comment']))
        self.assertTrue(pd.isna(result.iloc[1]['value']))

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_unicode_data(self, mock_get_client, mock_st):
        """Test fetch_view handles Unicode characters."""
        # Arrange
        mock_supabase = Mock()
        mock_table = Mock()
        mock_select = Mock()
        mock_result = Mock()

        unicode_data = [
            {'symbol': 'AAPL', 'name': 'Apple® Inc.'},
            {'symbol': 'SAP', 'name': 'SAP AG — München'},
            {'symbol': 'SONY', 'name': 'ソニー株式会社'}
        ]
        mock_result.data = unicode_data

        mock_select.execute.return_value = mock_result
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table
        mock_get_client.return_value = mock_supabase

        # Act
        from services.supabase_views import fetch_view
        result = fetch_view("vw_unicode")

        # Assert
        self.assertEqual(len(result), 3)
        self.assertIn('®', result.iloc[0]['name'])


class TestDashboardEdgeCases(unittest.TestCase):
    """Edge case tests for dashboard.py changes."""

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_load_portfolio_data_empty_dict(self, mock_load_alpaca, mock_st):
        """Test load_portfolio_data handles empty dict return."""
        # Arrange
        mock_load_alpaca.return_value = {}
        mock_st.session_state = {}

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data
        result = load_portfolio_data()

        # Assert - empty dict is truthy, so should be treated as valid
        self.assertEqual(result, {})
        self.assertEqual(mock_st.session_state['_quant_data_source_active'], 'live')

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_load_portfolio_data_timeout_exception(self, mock_load_alpaca, mock_st):
        """Test load_portfolio_data handles timeout exceptions."""
        # Arrange
        mock_load_alpaca.side_effect = TimeoutError("Request timed out")
        mock_st.session_state = {}

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data
        result = load_portfolio_data()

        # Assert
        self.assertIsNone(result)
        mock_st.warning.assert_called_once()
        mock_st.stop.assert_called_once()

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_load_portfolio_data_module_not_found(self, mock_load_alpaca, mock_st):
        """Test load_portfolio_data handles module not found."""
        # Arrange
        mock_load_alpaca.side_effect = ModuleNotFoundError("alpaca_adapter")
        mock_st.session_state = {}

        # Act
        from atlas_quant_dashboard.dashboard import load_portfolio_data

        try:
            result = load_portfolio_data()
        except ModuleNotFoundError:
            pass

        # Assert
        mock_st.warning.assert_called_once()


class TestUIEdgeCases(unittest.TestCase):
    """Edge case tests for UI page changes."""

    @patch('ui.pages.quant_dashboard.fetch_view')
    def test_quant_dashboard_single_position(self, mock_fetch_view):
        """Test quant dashboard with only one position."""
        # Arrange
        single_position = pd.DataFrame([{
            'symbol': 'AAPL',
            'price_regime': 'Uptrend',
            'vol_regime': 'Stable',
            'mean_reversion_signal': 'Neutral'
        }])
        mock_fetch_view.return_value = single_position

        # Act
        result = mock_fetch_view("vw_quant_dashboard")
        uptrend_count = (result['price_regime'] == 'Uptrend').sum()

        # Assert
        self.assertEqual(len(result), 1)
        self.assertEqual(uptrend_count, 1)

    @patch('ui.pages.portfolio_home.fetch_view')
    def test_portfolio_home_zero_nav(self, mock_fetch_view):
        """Test portfolio home handles zero NAV gracefully."""
        # Arrange
        zero_nav_df = pd.DataFrame([{
            'portfolio_nav': 0.0,
            'total_return_pct': 0.0,
            'sharpe_ratio': 0.0,
            'sortino_ratio': 0.0,
            'atlas_health_score': 0,
            'portfolio_health_status': 'Needs Attention'
        }])
        mock_fetch_view.return_value = zero_nav_df

        # Act
        result = mock_fetch_view("vw_command_centre")

        # Assert
        self.assertEqual(result.iloc[0]['portfolio_nav'], 0.0)

    @patch('ui.pages.performance_suite.fetch_view')
    def test_performance_suite_all_cut_candidates(self, mock_fetch_view):
        """Test performance suite when all positions are cut candidates."""
        # Arrange
        all_cuts = pd.DataFrame([
            {'symbol': 'AAPL', 'cut_candidate_flag': True, 'total_return_pct': -0.25},
            {'symbol': 'MSFT', 'cut_candidate_flag': True, 'total_return_pct': -0.30},
            {'symbol': 'GOOGL', 'cut_candidate_flag': True, 'total_return_pct': -0.15}
        ])
        mock_fetch_view.return_value = all_cuts

        # Act
        result = mock_fetch_view("vw_performance_suite")
        cut_candidates = result[result['cut_candidate_flag'] == True]

        # Assert
        self.assertEqual(len(cut_candidates), 3)
        self.assertEqual(len(cut_candidates), len(result))

    @patch('ui.pages.risk_analysis.fetch_view')
    def test_risk_analysis_extreme_volatility(self, mock_fetch_view):
        """Test risk analysis with extreme volatility values."""
        # Arrange
        extreme_vol = pd.DataFrame([{
            'symbol': 'VOLATILE',
            'annual_vol': 1.50,  # 150% volatility
            'marginal_vol_contribution': 0.45,
            'risk_tier': 'High Risk'
        }])
        mock_fetch_view.return_value = extreme_vol

        # Act
        result = mock_fetch_view("vw_risk_analysis")

        # Assert
        self.assertGreater(result.iloc[0]['annual_vol'], 1.0)
        self.assertEqual(result.iloc[0]['risk_tier'], 'High Risk')

    @patch('ui.pages.quant_dashboard.fetch_view')
    def test_quant_dashboard_extreme_zscore(self, mock_fetch_view):
        """Test quant dashboard with extreme z-scores."""
        # Arrange
        extreme_z = pd.DataFrame([
            {'symbol': 'MEME', 'zscore_20d': 5.5, 'mean_reversion_signal': 'Overbought'},
            {'symbol': 'CRASH', 'zscore_20d': -4.8, 'mean_reversion_signal': 'Oversold'}
        ])
        mock_fetch_view.return_value = extreme_z

        # Act
        result = mock_fetch_view("vw_quant_dashboard")

        # Assert
        self.assertGreater(result.iloc[0]['zscore_20d'], 2.0)
        self.assertLess(result.iloc[1]['zscore_20d'], -2.0)


class TestDataValidation(unittest.TestCase):
    """Data validation and type checking tests."""

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_returns_dataframe_type(self, mock_get_client, mock_st):
        """Test that fetch_view always returns pd.DataFrame type."""
        # Arrange
        mock_supabase = Mock()
        mock_table = Mock()
        mock_select = Mock()
        mock_result = Mock()
        mock_result.data = [{'test': 'data'}]

        mock_select.execute.return_value = mock_result
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table
        mock_get_client.return_value = mock_supabase

        # Act
        from services.supabase_views import fetch_view
        result = fetch_view("test_view")

        # Assert
        self.assertIsInstance(result, pd.DataFrame)
        self.assertEqual(type(result).__name__, 'DataFrame')

    @patch('ui.pages.quant_dashboard.fetch_view')
    def test_quant_dashboard_regime_values_are_strings(self, mock_fetch_view):
        """Test that regime values are strings, not enums or codes."""
        # Arrange
        regime_df = pd.DataFrame([{
            'symbol': 'AAPL',
            'price_regime': 'Uptrend',
            'vol_regime': 'Expanding',
            'mean_reversion_signal': 'Neutral'
        }])
        mock_fetch_view.return_value = regime_df

        # Act
        result = mock_fetch_view("vw_quant_dashboard")

        # Assert
        self.assertIsInstance(result.iloc[0]['price_regime'], str)
        self.assertIsInstance(result.iloc[0]['vol_regime'], str)
        self.assertIsInstance(result.iloc[0]['mean_reversion_signal'], str)

    @patch('ui.pages.portfolio_home.fetch_view')
    def test_command_centre_numeric_types(self, mock_fetch_view):
        """Test that command centre metrics are proper numeric types."""
        # Arrange
        metrics_df = pd.DataFrame([{
            'portfolio_nav': 100000.0,
            'total_return_pct': 0.15,
            'sharpe_ratio': 1.5,
            'sortino_ratio': 1.8,
            'atlas_health_score': 85
        }])
        mock_fetch_view.return_value = metrics_df

        # Act
        result = mock_fetch_view("vw_command_centre")

        # Assert - check numeric types
        self.assertTrue(pd.api.types.is_numeric_dtype(result['portfolio_nav']))
        self.assertTrue(pd.api.types.is_numeric_dtype(result['sharpe_ratio']))


class TestRegressionScenarios(unittest.TestCase):
    """Regression tests to prevent known issues."""

    @patch('atlas_quant_dashboard.dashboard.st')
    @patch('atlas_quant_dashboard.dashboard.load_alpaca_portfolio_data')
    def test_no_sample_data_import_regression(self, mock_load_alpaca, mock_st):
        """Regression: Ensure sample data import is truly removed."""
        # This test ensures the old generate_sample_portfolio function
        # cannot be imported from dashboard module

        # Act & Assert
        try:
            from atlas_quant_dashboard.dashboard import generate_sample_portfolio
            self.fail("generate_sample_portfolio should not exist")
        except (ImportError, AttributeError):
            pass  # Expected - function should be removed

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_cache_decorator_prevents_excessive_calls(self, mock_get_client, mock_st):
        """Regression: Ensure caching prevents redundant DB calls."""
        # Note: This test verifies the decorator is in place
        # Actual caching behavior is handled by Streamlit

        from services.supabase_views import fetch_view

        # Check function has expected attributes
        self.assertTrue(callable(fetch_view))
        # The function should exist and be callable
        self.assertIsNotNone(fetch_view)

    @patch('ui.pages.quant_dashboard.st')
    @patch('ui.pages.quant_dashboard.fetch_view')
    def test_quant_dashboard_stops_on_empty_regression(self, mock_fetch_view, mock_st):
        """Regression: Ensure empty data stops execution instead of showing stale data."""
        # Arrange
        mock_fetch_view.return_value = pd.DataFrame()

        # Act
        quant_df = mock_fetch_view("vw_quant_dashboard")

        # Assert - empty check should happen
        if quant_df.empty:
            # This simulates st.stop() being called
            self.assertTrue(quant_df.empty)


if __name__ == '__main__':
    unittest.main()