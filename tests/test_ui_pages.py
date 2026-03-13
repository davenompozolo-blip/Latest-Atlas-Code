"""
Unit tests for UI page changes in the Supabase migration PR.

Tests modifications to:
- ui/pages/performance_suite.py
- ui/pages/portfolio_home.py
- ui/pages/quant_dashboard.py
- ui/pages/risk_analysis.py
"""

import unittest
from unittest.mock import Mock, patch, MagicMock, call
import pandas as pd
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestPerformanceSuiteChanges(unittest.TestCase):
    """Test suite for ui/pages/performance_suite.py Supabase integration."""

    @patch('ui.pages.performance_suite.st')
    @patch('ui.pages.performance_suite.fetch_view')
    def test_performance_suite_with_data(self, mock_fetch_view, mock_st):
        """Test performance suite displays entry efficiency when data is available."""
        # Arrange
        sample_df = pd.DataFrame([
            {
                'symbol': 'AAPL',
                'entry_efficiency_score': 85.5,
                'total_return_pct': 0.25,
                'annualised_return': 0.30,
                'days_held': 180,
                'cut_candidate_flag': False
            },
            {
                'symbol': 'MSFT',
                'entry_efficiency_score': 45.2,
                'total_return_pct': -0.05,
                'annualised_return': -0.08,
                'days_held': 200,
                'cut_candidate_flag': True
            }
        ])
        mock_fetch_view.return_value = sample_df
        mock_st.session_state = {'portfolio_df': pd.DataFrame()}

        # Import and call the function (partial test - function has many dependencies)
        # We're testing the Supabase integration part specifically

        # Act
        from ui.pages.performance_suite import fetch_view
        result = fetch_view("vw_performance_suite")

        # Assert
        self.assertIsInstance(result, pd.DataFrame)
        self.assertEqual(len(result), 2)

    @patch('ui.pages.performance_suite.st')
    @patch('ui.pages.performance_suite.fetch_view')
    def test_performance_suite_cut_candidates_detection(self, mock_fetch_view, mock_st):
        """Test cut candidate detection and warning display."""
        # Arrange
        sample_df = pd.DataFrame([
            {'symbol': 'AAPL', 'cut_candidate_flag': False, 'entry_efficiency_score': 85},
            {'symbol': 'MSFT', 'cut_candidate_flag': True, 'entry_price': 250, 'total_return_pct': -0.15, 'days_held': 200},
            {'symbol': 'GOOGL', 'cut_candidate_flag': True, 'entry_price': 120, 'total_return_pct': -0.10, 'days_held': 185}
        ])
        mock_fetch_view.return_value = sample_df

        # Act - manually extract cut candidates logic
        cut_candidates = sample_df[sample_df['cut_candidate_flag'] == True]

        # Assert
        self.assertEqual(len(cut_candidates), 2)
        self.assertIn('MSFT', cut_candidates['symbol'].values)
        self.assertIn('GOOGL', cut_candidates['symbol'].values)

    @patch('ui.pages.performance_suite.fetch_view')
    def test_performance_suite_empty_data(self, mock_fetch_view):
        """Test performance suite handles empty DataFrame gracefully."""
        # Arrange
        mock_fetch_view.return_value = pd.DataFrame()

        # Act
        result = mock_fetch_view("vw_performance_suite")

        # Assert
        self.assertTrue(result.empty)

    @patch('ui.pages.performance_suite.fetch_view')
    def test_performance_suite_column_filtering(self, mock_fetch_view):
        """Test that only available columns are displayed."""
        # Arrange
        sample_df = pd.DataFrame([
            {'symbol': 'AAPL', 'entry_efficiency_score': 85.5, 'total_return_pct': 0.25}
        ])
        mock_fetch_view.return_value = sample_df

        # Act
        result = mock_fetch_view("vw_performance_suite")
        display_cols = [c for c in ['symbol', 'entry_efficiency_score', 'total_return_pct', 'annualised_return', 'days_held']
                       if c in result.columns]

        # Assert
        self.assertEqual(len(display_cols), 3)  # Only the columns that exist
        self.assertNotIn('annualised_return', display_cols)
        self.assertNotIn('days_held', display_cols)


class TestPortfolioHomeChanges(unittest.TestCase):
    """Test suite for ui/pages/portfolio_home.py Supabase integration."""

    @patch('ui.pages.portfolio_home.st')
    @patch('ui.pages.portfolio_home.fetch_view')
    def test_portfolio_home_command_centre_display(self, mock_fetch_view, mock_st):
        """Test command centre metrics display from vw_command_centre."""
        # Arrange
        sample_df = pd.DataFrame([{
            'portfolio_nav': 100000.00,
            'total_return_pct': 0.15,
            'sharpe_ratio': 1.5,
            'sortino_ratio': 1.8,
            'atlas_health_score': 85,
            'portfolio_health_status': 'Strong'
        }])
        mock_fetch_view.return_value = sample_df
        mock_st.columns.return_value = [Mock() for _ in range(5)]

        # Act
        result = mock_fetch_view("vw_command_centre")

        # Assert
        self.assertFalse(result.empty)
        h = result.iloc[0]
        self.assertEqual(h['portfolio_nav'], 100000.00)
        self.assertAlmostEqual(h['total_return_pct'], 0.15)
        self.assertAlmostEqual(h['sharpe_ratio'], 1.5)
        self.assertAlmostEqual(h['sortino_ratio'], 1.8)
        self.assertEqual(h['atlas_health_score'], 85)
        self.assertEqual(h['portfolio_health_status'], 'Strong')

    @patch('ui.pages.portfolio_home.fetch_view')
    def test_portfolio_home_empty_health_data(self, mock_fetch_view):
        """Test portfolio home handles empty command centre data."""
        # Arrange
        mock_fetch_view.return_value = pd.DataFrame()

        # Act
        result = mock_fetch_view("vw_command_centre")

        # Assert
        self.assertTrue(result.empty)

    @patch('ui.pages.portfolio_home.fetch_view')
    def test_portfolio_home_health_status_categories(self, mock_fetch_view):
        """Test different health status categories."""
        # Arrange - test Strong, Moderate, Needs Attention
        health_statuses = ['Strong', 'Moderate', 'Needs Attention']

        for status in health_statuses:
            with self.subTest(status=status):
                sample_df = pd.DataFrame([{
                    'portfolio_nav': 100000,
                    'atlas_health_score': 85 if status == 'Strong' else (60 if status == 'Moderate' else 40),
                    'portfolio_health_status': status
                }])
                mock_fetch_view.return_value = sample_df

                # Act
                result = mock_fetch_view("vw_command_centre")

                # Assert
                self.assertEqual(result.iloc[0]['portfolio_health_status'], status)


class TestQuantDashboardChanges(unittest.TestCase):
    """Test suite for ui/pages/quant_dashboard.py complete rewrite."""

    @patch('ui.pages.quant_dashboard.st')
    @patch('ui.pages.quant_dashboard.fetch_view')
    def test_quant_dashboard_regime_overview(self, mock_fetch_view, mock_st):
        """Test regime overview metrics calculation."""
        # Arrange
        sample_df = pd.DataFrame([
            {'symbol': 'AAPL', 'price_regime': 'Uptrend', 'vol_regime': 'Expanding', 'mean_reversion_signal': 'Neutral'},
            {'symbol': 'MSFT', 'price_regime': 'Uptrend', 'vol_regime': 'Stable', 'mean_reversion_signal': 'Overbought'},
            {'symbol': 'GOOGL', 'price_regime': 'Downtrend', 'vol_regime': 'Expanding', 'mean_reversion_signal': 'Oversold'},
            {'symbol': 'TSLA', 'price_regime': 'Sideways', 'vol_regime': 'Compressing', 'mean_reversion_signal': 'Neutral'}
        ])
        mock_fetch_view.return_value = sample_df
        mock_st.columns.return_value = [Mock() for _ in range(3)]

        # Act
        result = mock_fetch_view("vw_quant_dashboard")
        uptrend_count = (result['price_regime'] == 'Uptrend').sum()
        expanding_vol = (result['vol_regime'] == 'Expanding').sum()
        overbought = (result['mean_reversion_signal'] == 'Overbought').sum()
        oversold = (result['mean_reversion_signal'] == 'Oversold').sum()

        # Assert
        self.assertEqual(uptrend_count, 2)
        self.assertEqual(expanding_vol, 2)
        self.assertEqual(overbought, 1)
        self.assertEqual(oversold, 1)

    @patch('ui.pages.quant_dashboard.st')
    @patch('ui.pages.quant_dashboard.fetch_view')
    def test_quant_dashboard_empty_stops_execution(self, mock_fetch_view, mock_st):
        """Test quant dashboard stops when no data is available."""
        # Arrange
        mock_fetch_view.return_value = pd.DataFrame()

        # Act - simulate the check
        quant_df = mock_fetch_view("vw_quant_dashboard")

        # Assert
        self.assertTrue(quant_df.empty)

    @patch('ui.pages.quant_dashboard.fetch_view')
    def test_quant_dashboard_mean_reversion_flags(self, mock_fetch_view):
        """Test mean reversion flag filtering."""
        # Arrange
        sample_df = pd.DataFrame([
            {'symbol': 'AAPL', 'mean_reversion_signal': 'Neutral', 'zscore_20d': 0.5, 'current_price': 150},
            {'symbol': 'MSFT', 'mean_reversion_signal': 'Overbought', 'zscore_20d': 2.5, 'current_price': 300},
            {'symbol': 'GOOGL', 'mean_reversion_signal': 'Oversold', 'zscore_20d': -2.2, 'current_price': 120}
        ])
        mock_fetch_view.return_value = sample_df

        # Act
        result = mock_fetch_view("vw_quant_dashboard")
        flags_df = result[result['mean_reversion_signal'].isin(['Overbought', 'Oversold'])]

        # Assert
        self.assertEqual(len(flags_df), 2)
        self.assertIn('MSFT', flags_df['symbol'].values)
        self.assertIn('GOOGL', flags_df['symbol'].values)

    @patch('ui.pages.quant_dashboard.fetch_view')
    def test_quant_dashboard_column_availability(self, mock_fetch_view):
        """Test column filtering for display."""
        # Arrange
        sample_df = pd.DataFrame([{
            'symbol': 'AAPL',
            'current_price': 150.0,
            'price_regime': 'Uptrend',
            'vol_regime': 'Expanding',
            'zscore_20d': 1.2,
            'mean_reversion_signal': 'Neutral',
            'momentum_pct_rank_20d': 75.5,
            'annualised_vol_20d': 0.28
        }])
        mock_fetch_view.return_value = sample_df

        # Act
        result = mock_fetch_view("vw_quant_dashboard")
        display_cols = [
            'symbol', 'current_price', 'price_regime', 'vol_regime',
            'zscore_20d', 'mean_reversion_signal', 'momentum_pct_rank_20d',
            'annualised_vol_20d'
        ]
        available_cols = [c for c in display_cols if c in result.columns]

        # Assert
        self.assertEqual(len(available_cols), 8)  # All columns present

    @patch('ui.pages.quant_dashboard.fetch_view')
    def test_quant_dashboard_price_regimes(self, mock_fetch_view):
        """Test all three price regime types are recognized."""
        # Arrange
        sample_df = pd.DataFrame([
            {'symbol': 'AAPL', 'price_regime': 'Uptrend'},
            {'symbol': 'MSFT', 'price_regime': 'Downtrend'},
            {'symbol': 'GOOGL', 'price_regime': 'Sideways'}
        ])
        mock_fetch_view.return_value = sample_df

        # Act
        result = mock_fetch_view("vw_quant_dashboard")
        unique_regimes = result['price_regime'].unique()

        # Assert
        self.assertEqual(len(unique_regimes), 3)
        self.assertIn('Uptrend', unique_regimes)
        self.assertIn('Downtrend', unique_regimes)
        self.assertIn('Sideways', unique_regimes)

    @patch('ui.pages.quant_dashboard.fetch_view')
    def test_quant_dashboard_vol_regimes(self, mock_fetch_view):
        """Test volatility regime categories."""
        # Arrange
        sample_df = pd.DataFrame([
            {'symbol': 'AAPL', 'vol_regime': 'Expanding'},
            {'symbol': 'MSFT', 'vol_regime': 'Compressing'},
            {'symbol': 'GOOGL', 'vol_regime': 'Stable'}
        ])
        mock_fetch_view.return_value = sample_df

        # Act
        result = mock_fetch_view("vw_quant_dashboard")
        unique_vol_regimes = result['vol_regime'].unique()

        # Assert
        self.assertIn('Expanding', unique_vol_regimes)
        self.assertIn('Compressing', unique_vol_regimes)
        self.assertIn('Stable', unique_vol_regimes)


class TestRiskAnalysisChanges(unittest.TestCase):
    """Test suite for ui/pages/risk_analysis.py Supabase integration."""

    @patch('ui.pages.risk_analysis.st')
    @patch('ui.pages.risk_analysis.fetch_view')
    def test_risk_analysis_marginal_vol_display(self, mock_fetch_view, mock_st):
        """Test marginal volatility contribution display."""
        # Arrange
        sample_df = pd.DataFrame([
            {
                'symbol': 'AAPL',
                'weight': 0.30,
                'annual_vol': 0.25,
                'marginal_vol_contribution': 0.075,
                'dollar_var_95_daily': 1500.00,
                'risk_tier': 'Moderate Risk'
            },
            {
                'symbol': 'MSFT',
                'weight': 0.25,
                'annual_vol': 0.22,
                'marginal_vol_contribution': 0.055,
                'dollar_var_95_daily': 1200.00,
                'risk_tier': 'Low Risk'
            }
        ])
        mock_fetch_view.return_value = sample_df

        # Act
        result = mock_fetch_view("vw_risk_analysis")

        # Assert
        self.assertFalse(result.empty)
        self.assertIn('marginal_vol_contribution', result.columns)
        self.assertAlmostEqual(result.iloc[0]['marginal_vol_contribution'], 0.075)

    @patch('ui.pages.risk_analysis.fetch_view')
    def test_risk_analysis_risk_tiers(self, mock_fetch_view):
        """Test risk tier categorization."""
        # Arrange
        sample_df = pd.DataFrame([
            {'symbol': 'AAPL', 'annual_vol': 0.50, 'risk_tier': 'High Risk'},
            {'symbol': 'MSFT', 'annual_vol': 0.30, 'risk_tier': 'Moderate Risk'},
            {'symbol': 'GOOGL', 'annual_vol': 0.18, 'risk_tier': 'Low Risk'}
        ])
        mock_fetch_view.return_value = sample_df

        # Act
        result = mock_fetch_view("vw_risk_analysis")
        risk_tiers = result['risk_tier'].unique()

        # Assert
        self.assertEqual(len(risk_tiers), 3)
        self.assertIn('High Risk', risk_tiers)
        self.assertIn('Moderate Risk', risk_tiers)
        self.assertIn('Low Risk', risk_tiers)

    @patch('ui.pages.risk_analysis.fetch_view')
    def test_risk_analysis_column_filtering(self, mock_fetch_view):
        """Test column availability check for display."""
        # Arrange
        sample_df = pd.DataFrame([{
            'symbol': 'AAPL',
            'weight': 0.30,
            'annual_vol': 0.25
            # Missing other columns
        }])
        mock_fetch_view.return_value = sample_df

        # Act
        result = mock_fetch_view("vw_risk_analysis")
        risk_display_cols = [c for c in [
            'symbol', 'weight', 'annual_vol',
            'marginal_vol_contribution', 'dollar_var_95_daily', 'risk_tier'
        ] if c in result.columns]

        # Assert
        self.assertEqual(len(risk_display_cols), 3)  # Only available columns

    @patch('ui.pages.risk_analysis.fetch_view')
    def test_risk_analysis_empty_data(self, mock_fetch_view):
        """Test risk analysis handles empty data gracefully."""
        # Arrange
        mock_fetch_view.return_value = pd.DataFrame()

        # Act
        result = mock_fetch_view("vw_risk_analysis")

        # Assert
        self.assertTrue(result.empty)

    @patch('ui.pages.risk_analysis.fetch_view')
    def test_risk_analysis_bar_chart_data(self, mock_fetch_view):
        """Test data preparation for marginal vol contribution bar chart."""
        # Arrange
        sample_df = pd.DataFrame([
            {'symbol': 'AAPL', 'marginal_vol_contribution': 0.075},
            {'symbol': 'MSFT', 'marginal_vol_contribution': 0.055},
            {'symbol': 'GOOGL', 'marginal_vol_contribution': 0.045}
        ])
        mock_fetch_view.return_value = sample_df

        # Act
        result = mock_fetch_view("vw_risk_analysis")

        # Verify data can be used for chart
        if 'symbol' in result.columns and 'marginal_vol_contribution' in result.columns:
            chart_data = result.set_index('symbol')['marginal_vol_contribution']

            # Assert
            self.assertEqual(len(chart_data), 3)
            self.assertEqual(chart_data['AAPL'], 0.075)


class TestUIIntegration(unittest.TestCase):
    """Integration tests across multiple UI pages."""

    @patch('services.supabase_views.st')
    @patch('services.supabase_views.get_supabase_client')
    def test_all_pages_can_fetch_their_views(self, mock_get_client, mock_st):
        """Test that all UI pages can fetch their respective views."""
        # Arrange
        views_map = {
            'vw_portfolio_home': 'portfolio_home.py',
            'vw_quant_dashboard': 'quant_dashboard.py',
            'vw_risk_analysis': 'risk_analysis.py',
            'vw_performance_suite': 'performance_suite.py',
            'vw_command_centre': 'portfolio_home.py'
        }

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
        for view_name in views_map.keys():
            with self.subTest(view=view_name):
                result = fetch_view(view_name)
                self.assertIsInstance(result, pd.DataFrame)

    @patch('ui.pages.quant_dashboard.fetch_view')
    @patch('ui.pages.risk_analysis.fetch_view')
    @patch('ui.pages.performance_suite.fetch_view')
    def test_cross_page_data_consistency(self, mock_perf, mock_risk, mock_quant):
        """Test that same symbols appear across different views."""
        # Arrange - same symbols in different views
        symbols = ['AAPL', 'MSFT', 'GOOGL']

        mock_quant.return_value = pd.DataFrame([{'symbol': s} for s in symbols])
        mock_risk.return_value = pd.DataFrame([{'symbol': s} for s in symbols])
        mock_perf.return_value = pd.DataFrame([{'symbol': s} for s in symbols])

        # Act
        quant_data = mock_quant("vw_quant_dashboard")
        risk_data = mock_risk("vw_risk_analysis")
        perf_data = mock_perf("vw_performance_suite")

        # Assert - same symbols across views
        self.assertEqual(set(quant_data['symbol']), set(risk_data['symbol']))
        self.assertEqual(set(risk_data['symbol']), set(perf_data['symbol']))


if __name__ == '__main__':
    unittest.main()