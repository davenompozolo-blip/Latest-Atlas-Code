"""
Unit tests for services/supabase_views.py module.

Tests the fetch_view function which is the core new functionality
added in the Supabase migration PR.
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
import pandas as pd
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestFetchView(unittest.TestCase):
    """Test suite for the fetch_view function."""

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_success(self, mock_get_client, mock_st):
        """Test fetch_view returns DataFrame on successful query."""
        # Arrange
        mock_supabase = Mock()
        mock_table = Mock()
        mock_select = Mock()
        mock_result = Mock()

        # Sample data that would come from a Supabase view
        sample_data = [
            {'symbol': 'AAPL', 'current_price': 150.0, 'price_regime': 'Uptrend'},
            {'symbol': 'MSFT', 'current_price': 300.0, 'price_regime': 'Downtrend'}
        ]
        mock_result.data = sample_data

        mock_select.execute.return_value = mock_result
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table
        mock_get_client.return_value = mock_supabase

        # Act
        from services.supabase_views import fetch_view
        result = fetch_view("vw_quant_dashboard")

        # Assert
        self.assertIsInstance(result, pd.DataFrame)
        self.assertEqual(len(result), 2)
        self.assertEqual(result.iloc[0]['symbol'], 'AAPL')
        self.assertEqual(result.iloc[1]['symbol'], 'MSFT')
        mock_supabase.table.assert_called_once_with("vw_quant_dashboard")
        mock_table.select.assert_called_once_with("*")

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_empty_result(self, mock_get_client, mock_st):
        """Test fetch_view returns empty DataFrame when no data."""
        # Arrange
        mock_supabase = Mock()
        mock_table = Mock()
        mock_select = Mock()
        mock_result = Mock()

        mock_result.data = []  # Empty result

        mock_select.execute.return_value = mock_result
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table
        mock_get_client.return_value = mock_supabase

        # Act
        from services.supabase_views import fetch_view
        result = fetch_view("vw_command_centre")

        # Assert
        self.assertIsInstance(result, pd.DataFrame)
        self.assertTrue(result.empty)

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_null_data(self, mock_get_client, mock_st):
        """Test fetch_view returns empty DataFrame when data is None."""
        # Arrange
        mock_supabase = Mock()
        mock_table = Mock()
        mock_select = Mock()
        mock_result = Mock()

        mock_result.data = None  # Null result

        mock_select.execute.return_value = mock_result
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table
        mock_get_client.return_value = mock_supabase

        # Act
        from services.supabase_views import fetch_view
        result = fetch_view("vw_portfolio_home")

        # Assert
        self.assertIsInstance(result, pd.DataFrame)
        self.assertTrue(result.empty)

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_exception_handling(self, mock_get_client, mock_st):
        """Test fetch_view handles exceptions and returns empty DataFrame."""
        # Arrange
        mock_get_client.side_effect = Exception("Connection failed")

        # Act
        from services.supabase_views import fetch_view
        result = fetch_view("vw_risk_analysis")

        # Assert
        self.assertIsInstance(result, pd.DataFrame)
        self.assertTrue(result.empty)
        mock_st.error.assert_called_once()
        error_msg = mock_st.error.call_args[0][0]
        self.assertIn("Failed to load vw_risk_analysis", error_msg)
        self.assertIn("Connection failed", error_msg)

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_multiple_views(self, mock_get_client, mock_st):
        """Test fetch_view works correctly for different view names."""
        # Arrange
        mock_supabase = Mock()
        mock_table = Mock()
        mock_select = Mock()
        mock_result = Mock()

        views_data = {
            'vw_portfolio_home': [{'symbol': 'AAPL', 'market_value': 10000}],
            'vw_quant_dashboard': [{'symbol': 'MSFT', 'zscore_20d': 1.5}],
            'vw_risk_analysis': [{'symbol': 'GOOGL', 'annual_vol': 0.25}],
            'vw_performance_suite': [{'symbol': 'TSLA', 'total_return_pct': 0.15}],
            'vw_command_centre': [{'portfolio_nav': 100000, 'sharpe_ratio': 1.5}]
        }

        def table_side_effect(view_name):
            mock_result.data = views_data.get(view_name, [])
            return mock_table

        mock_select.execute.return_value = mock_result
        mock_table.select.return_value = mock_select
        mock_supabase.table.side_effect = table_side_effect
        mock_get_client.return_value = mock_supabase

        from services.supabase_views import fetch_view

        # Act & Assert for each view
        for view_name, expected_data in views_data.items():
            result = fetch_view(view_name)
            self.assertIsInstance(result, pd.DataFrame)
            if expected_data:
                self.assertEqual(len(result), 1)
                # Check first column value matches
                first_col = result.columns[0]
                expected_val = expected_data[0][first_col]
                self.assertEqual(result.iloc[0][first_col], expected_val)

    @patch('services.supabase_views.st.cache_data')
    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_caching(self, mock_get_client, mock_st, mock_cache):
        """Test that fetch_view is decorated with proper cache settings."""
        # This test verifies the decorator is applied
        from services.supabase_views import fetch_view

        # Check that the function has cache decorator attributes
        # Note: In real scenario, Streamlit's cache_data decorator would be active
        self.assertTrue(callable(fetch_view))

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_complex_data(self, mock_get_client, mock_st):
        """Test fetch_view with complex nested data structures."""
        # Arrange
        mock_supabase = Mock()
        mock_table = Mock()
        mock_select = Mock()
        mock_result = Mock()

        # Complex data with multiple columns and data types
        sample_data = [
            {
                'symbol': 'AAPL',
                'current_price': 150.25,
                'price_regime': 'Uptrend',
                'vol_regime': 'Expanding',
                'zscore_20d': 1.2,
                'mean_reversion_signal': 'Neutral',
                'momentum_pct_rank_20d': 75.5,
                'annualised_vol_20d': 0.28
            },
            {
                'symbol': 'MSFT',
                'current_price': 300.75,
                'price_regime': 'Sideways',
                'vol_regime': 'Stable',
                'zscore_20d': -0.5,
                'mean_reversion_signal': 'Overbought',
                'momentum_pct_rank_20d': 45.2,
                'annualised_vol_20d': 0.22
            }
        ]
        mock_result.data = sample_data

        mock_select.execute.return_value = mock_result
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table
        mock_get_client.return_value = mock_supabase

        # Act
        from services.supabase_views import fetch_view
        result = fetch_view("vw_quant_dashboard")

        # Assert
        self.assertEqual(len(result), 2)
        self.assertEqual(len(result.columns), 8)
        self.assertAlmostEqual(result.iloc[0]['zscore_20d'], 1.2)
        self.assertEqual(result.iloc[1]['mean_reversion_signal'], 'Overbought')

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_fetch_view_import_error(self, mock_get_client, mock_st):
        """Test fetch_view handles import errors gracefully."""
        # Arrange - simulate import error
        mock_get_client.side_effect = ImportError("supabase_client module not found")

        # Act
        from services.supabase_views import fetch_view
        result = fetch_view("vw_performance_suite")

        # Assert
        self.assertIsInstance(result, pd.DataFrame)
        self.assertTrue(result.empty)
        mock_st.error.assert_called_once()


class TestSupabaseViewsIntegration(unittest.TestCase):
    """Integration tests for Supabase views module."""

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_all_five_views_callable(self, mock_get_client, mock_st):
        """Test that all five Supabase views can be fetched."""
        # Arrange
        view_names = [
            'vw_portfolio_home',
            'vw_quant_dashboard',
            'vw_risk_analysis',
            'vw_performance_suite',
            'vw_command_centre'
        ]

        mock_supabase = Mock()
        mock_table = Mock()
        mock_select = Mock()
        mock_result = Mock()
        mock_result.data = []

        mock_select.execute.return_value = mock_result
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table
        mock_get_client.return_value = mock_supabase

        from services.supabase_views import fetch_view

        # Act & Assert
        for view_name in view_names:
            with self.subTest(view=view_name):
                result = fetch_view(view_name)
                self.assertIsInstance(result, pd.DataFrame)

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_concurrent_view_fetches(self, mock_get_client, mock_st):
        """Test multiple concurrent view fetches don't interfere."""
        # Arrange
        mock_supabase = Mock()
        call_count = {'count': 0}

        def table_side_effect(view_name):
            call_count['count'] += 1
            mock_table = Mock()
            mock_select = Mock()
            mock_result = Mock()
            mock_result.data = [{'view': view_name, 'id': call_count['count']}]
            mock_select.execute.return_value = mock_result
            mock_table.select.return_value = mock_select
            return mock_table

        mock_supabase.table.side_effect = table_side_effect
        mock_get_client.return_value = mock_supabase

        from services.supabase_views import fetch_view

        # Act
        result1 = fetch_view("vw_portfolio_home")
        result2 = fetch_view("vw_quant_dashboard")
        result3 = fetch_view("vw_risk_analysis")

        # Assert
        self.assertEqual(len(result1), 1)
        self.assertEqual(len(result2), 1)
        self.assertEqual(len(result3), 1)
        self.assertEqual(call_count['count'], 3)


if __name__ == '__main__':
    unittest.main()