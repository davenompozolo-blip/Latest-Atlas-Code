"""
Share-Based Compensation (SBC) Detection and Extraction

This module detects, extracts, and analyzes SBC from financial statements.
SBC is a real economic cost that's often ignored in DCF valuations, leading
to systematic overvaluation.

Key Functions:
- Extract SBC from cash flow statements (yfinance)
- Calculate SBC as % of revenue
- Analyze historical trends
- Detect materiality (>3% threshold)
- Provide forecasting inputs

Author: ATLAS Development Team
Version: 1.0.0
Date: 2025-12-16
"""

import yfinance as yf
import pandas as pd
from typing import Dict, Optional, Tuple, List
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')


class SBCDetector:
    """
    Detects and extracts Share-Based Compensation from financial statements.
    """

    def __init__(self, ticker: str):
        """
        Initialize SBC detector for a specific company.

        Args:
            ticker: Stock ticker symbol
        """
        self.ticker = ticker.upper()
        self.sbc_data = None
        self.revenue_data = None
        self.extraction_success = False
        self.extraction_method = None
        self.error_message = None

    def extract_sbc_data(self) -> Dict:
        """
        Extract SBC from financial statements with multiple fallback strategies.

        Returns:
            Dict containing:
                - sbc_annual: Dict of {year: sbc_value}
                - revenue_annual: Dict of {year: revenue_value}
                - sbc_pct_revenue: Dict of {year: percentage}
                - success: bool
                - method: str (source of data)
                - error: Optional[str]
        """
        try:
            # Primary: Extract from cash flow statement
            result = self._extract_from_cashflow()
            if result['success']:
                self.extraction_success = True
                self.extraction_method = 'cash_flow_statement'
                self.sbc_data = result
                return result

            # Fallback 1: Extract from income statement notes
            result = self._extract_from_income_statement()
            if result['success']:
                self.extraction_success = True
                self.extraction_method = 'income_statement'
                self.sbc_data = result
                return result

            # Fallback 2: Estimate from financial ratios
            result = self._estimate_from_ratios()
            if result['success']:
                self.extraction_success = True
                self.extraction_method = 'estimated'
                self.sbc_data = result
                return result

            # All methods failed
            return self._create_error_result("Could not extract SBC from any source")

        except Exception as e:
            self.error_message = str(e)
            return self._create_error_result(f"Error during extraction: {str(e)}")

    def _extract_from_cashflow(self) -> Dict:
        """
        Primary method: Extract SBC from operating cash flow statement.

        SBC appears as a positive adjustment to net income in operating
        activities (it's a non-cash expense added back).
        """
        try:
            company = yf.Ticker(self.ticker)

            # Get annual cash flow statement
            cashflow = company.cashflow
            if cashflow is None or cashflow.empty:
                return self._create_error_result("No cash flow data available")

            # Get income statement for revenue
            income_stmt = company.financials
            if income_stmt is None or income_stmt.empty:
                return self._create_error_result("No income statement data available")

            # Look for SBC in various possible line items
            sbc_line_items = [
                'Stock Based Compensation',
                'Stock-Based Compensation',
                'Share Based Compensation',
                'Stock Compensation',
                'Share Based Compensation Expense',
                'Stock Based Compensation Expense'
            ]

            sbc_series = None
            found_line = None

            for line_item in sbc_line_items:
                if line_item in cashflow.index:
                    sbc_series = cashflow.loc[line_item]
                    found_line = line_item
                    break

            if sbc_series is None:
                return self._create_error_result("SBC line item not found in cash flow statement")

            # Get revenue (Total Revenue or Revenue)
            revenue_series = None
            for rev_item in ['Total Revenue', 'Revenue']:
                if rev_item in income_stmt.index:
                    revenue_series = income_stmt.loc[rev_item]
                    break

            if revenue_series is None:
                return self._create_error_result("Revenue not found in income statement")

            # Convert to annual dictionaries
            sbc_annual = {}
            revenue_annual = {}
            sbc_pct_revenue = {}

            # Get years (columns are timestamps)
            for col in sbc_series.index:
                year = col.year
                sbc_value = abs(sbc_series[col])  # Make positive

                # Find matching revenue (may have different dates)
                revenue_value = None
                for rev_col in revenue_series.index:
                    if rev_col.year == year:
                        revenue_value = revenue_series[rev_col]
                        break

                if revenue_value and revenue_value > 0 and sbc_value > 0:
                    sbc_annual[year] = float(sbc_value)
                    revenue_annual[year] = float(revenue_value)
                    sbc_pct_revenue[year] = (float(sbc_value) / float(revenue_value)) * 100

            if not sbc_annual:
                return self._create_error_result("No valid SBC data found")

            # Calculate statistics
            avg_sbc_pct = sum(sbc_pct_revenue.values()) / len(sbc_pct_revenue)
            latest_year = max(sbc_annual.keys())
            latest_sbc = sbc_annual[latest_year]
            latest_sbc_pct = sbc_pct_revenue[latest_year]

            # Determine if material (>3% threshold)
            is_material = avg_sbc_pct > 3.0

            return {
                'success': True,
                'method': 'cash_flow_statement',
                'line_item': found_line,
                'sbc_annual': sbc_annual,
                'revenue_annual': revenue_annual,
                'sbc_pct_revenue': sbc_pct_revenue,
                'latest_year': latest_year,
                'latest_sbc': latest_sbc,
                'latest_sbc_pct': latest_sbc_pct,
                'avg_sbc_pct': avg_sbc_pct,
                'is_material': is_material,
                'years_available': len(sbc_annual),
                'error': None
            }

        except Exception as e:
            return self._create_error_result(f"Cash flow extraction failed: {str(e)}")

    def _extract_from_income_statement(self) -> Dict:
        """
        Fallback 1: Try to extract SBC from income statement.

        Some companies report SBC as a separate line item in operating expenses.
        """
        try:
            company = yf.Ticker(self.ticker)
            income_stmt = company.financials

            if income_stmt is None or income_stmt.empty:
                return self._create_error_result("No income statement data")

            # Look for SBC-related line items
            sbc_line_items = [
                'Stock Based Compensation',
                'Share Based Compensation',
                'Stock Compensation Expense',
                'Employee Stock Options'
            ]

            sbc_series = None
            for line_item in sbc_line_items:
                if line_item in income_stmt.index:
                    sbc_series = income_stmt.loc[line_item]
                    break

            if sbc_series is None:
                return self._create_error_result("SBC not found in income statement")

            # Get revenue
            revenue_series = None
            for rev_item in ['Total Revenue', 'Revenue']:
                if rev_item in income_stmt.index:
                    revenue_series = income_stmt.loc[rev_item]
                    break

            if revenue_series is None:
                return self._create_error_result("Revenue not found")

            # Process data (similar to cash flow method)
            sbc_annual = {}
            revenue_annual = {}
            sbc_pct_revenue = {}

            for col in sbc_series.index:
                year = col.year
                sbc_value = abs(sbc_series[col])

                for rev_col in revenue_series.index:
                    if rev_col.year == year:
                        revenue_value = revenue_series[rev_col]
                        if revenue_value > 0 and sbc_value > 0:
                            sbc_annual[year] = float(sbc_value)
                            revenue_annual[year] = float(revenue_value)
                            sbc_pct_revenue[year] = (float(sbc_value) / float(revenue_value)) * 100
                        break

            if not sbc_annual:
                return self._create_error_result("No valid SBC data")

            avg_sbc_pct = sum(sbc_pct_revenue.values()) / len(sbc_pct_revenue)
            latest_year = max(sbc_annual.keys())

            return {
                'success': True,
                'method': 'income_statement',
                'sbc_annual': sbc_annual,
                'revenue_annual': revenue_annual,
                'sbc_pct_revenue': sbc_pct_revenue,
                'latest_year': latest_year,
                'latest_sbc': sbc_annual[latest_year],
                'latest_sbc_pct': sbc_pct_revenue[latest_year],
                'avg_sbc_pct': avg_sbc_pct,
                'is_material': avg_sbc_pct > 3.0,
                'years_available': len(sbc_annual),
                'error': None
            }

        except Exception as e:
            return self._create_error_result(f"Income statement extraction failed: {str(e)}")

    def _estimate_from_ratios(self) -> Dict:
        """
        Fallback 2: Estimate SBC based on industry averages.

        Tech companies typically: 5-15% of revenue
        Other companies typically: 1-3% of revenue
        """
        try:
            company = yf.Ticker(self.ticker)
            info = company.info
            income_stmt = company.financials

            if income_stmt is None or income_stmt.empty:
                return self._create_error_result("Cannot estimate without revenue data")

            # Get sector
            sector = info.get('sector', 'Unknown')

            # Estimate SBC % based on sector
            if 'Technology' in sector or 'Software' in sector:
                estimated_sbc_pct = 8.0  # Tech average
            elif 'Communication' in sector or 'Internet' in sector:
                estimated_sbc_pct = 10.0  # High SBC
            else:
                estimated_sbc_pct = 2.0  # Conservative estimate

            # Get revenue
            revenue_series = None
            for rev_item in ['Total Revenue', 'Revenue']:
                if rev_item in income_stmt.index:
                    revenue_series = income_stmt.loc[rev_item]
                    break

            if revenue_series is None:
                return self._create_error_result("Revenue not found")

            sbc_annual = {}
            revenue_annual = {}
            sbc_pct_revenue = {}

            for col in revenue_series.index:
                year = col.year
                revenue_value = revenue_series[col]
                if revenue_value > 0:
                    revenue_annual[year] = float(revenue_value)
                    sbc_annual[year] = float(revenue_value * estimated_sbc_pct / 100)
                    sbc_pct_revenue[year] = estimated_sbc_pct

            if not sbc_annual:
                return self._create_error_result("No revenue data to estimate from")

            latest_year = max(sbc_annual.keys())

            return {
                'success': True,
                'method': 'estimated',
                'estimated': True,
                'sbc_annual': sbc_annual,
                'revenue_annual': revenue_annual,
                'sbc_pct_revenue': sbc_pct_revenue,
                'latest_year': latest_year,
                'latest_sbc': sbc_annual[latest_year],
                'latest_sbc_pct': estimated_sbc_pct,
                'avg_sbc_pct': estimated_sbc_pct,
                'is_material': estimated_sbc_pct > 3.0,
                'years_available': len(sbc_annual),
                'sector': sector,
                'error': None,
                'warning': f"SBC estimated at {estimated_sbc_pct:.1f}% based on {sector} sector average"
            }

        except Exception as e:
            return self._create_error_result(f"Estimation failed: {str(e)}")

    def _create_error_result(self, error_msg: str) -> Dict:
        """Create standardized error result"""
        return {
            'success': False,
            'method': None,
            'sbc_annual': {},
            'revenue_annual': {},
            'sbc_pct_revenue': {},
            'latest_year': None,
            'latest_sbc': None,
            'latest_sbc_pct': None,
            'avg_sbc_pct': None,
            'is_material': False,
            'years_available': 0,
            'error': error_msg
        }

    def analyze_sbc_trend(self) -> Dict:
        """
        Analyze historical SBC trends for forecasting.

        Returns:
            Dict containing:
                - trend_direction: 'increasing', 'decreasing', 'stable'
                - avg_annual_change_pct: float
                - is_normalizing: bool (approaching mature company levels)
                - forecast_recommendation: str
        """
        if not self.extraction_success or not self.sbc_data:
            return {
                'success': False,
                'error': 'No SBC data available for trend analysis'
            }

        sbc_pct_history = self.sbc_data['sbc_pct_revenue']

        if len(sbc_pct_history) < 2:
            return {
                'success': False,
                'error': 'Insufficient historical data for trend analysis (need 2+ years)'
            }

        # Sort by year
        years = sorted(sbc_pct_history.keys())
        percentages = [sbc_pct_history[y] for y in years]

        # Calculate year-over-year changes
        yoy_changes = []
        for i in range(1, len(percentages)):
            change = percentages[i] - percentages[i-1]
            yoy_changes.append(change)

        avg_annual_change = sum(yoy_changes) / len(yoy_changes)

        # Determine trend direction
        if avg_annual_change > 0.5:
            trend_direction = 'increasing'
        elif avg_annual_change < -0.5:
            trend_direction = 'decreasing'
        else:
            trend_direction = 'stable'

        # Check if normalizing (high SBC companies moving toward 3-5% range)
        latest_sbc_pct = percentages[-1]
        is_normalizing = latest_sbc_pct > 5.0 and trend_direction == 'decreasing'

        # Forecast recommendation
        if latest_sbc_pct > 10.0:
            if trend_direction == 'increasing':
                recommendation = "Very high SBC and increasing - model gradual normalization to 8-10%"
            elif trend_direction == 'decreasing':
                recommendation = "High SBC but declining - model continued decline to 6-8%"
            else:
                recommendation = "High stable SBC - maintain current levels with slight decline"
        elif latest_sbc_pct > 5.0:
            if trend_direction == 'increasing':
                recommendation = "Moderate SBC and increasing - model stabilization at 6-8%"
            elif trend_direction == 'decreasing':
                recommendation = "Moderate SBC declining - model normalization to 3-5%"
            else:
                recommendation = "Moderate stable SBC - maintain current levels"
        else:
            recommendation = "Low SBC - maintain current low levels (2-3%)"

        # Calculate volatility
        if len(percentages) > 1:
            mean = sum(percentages) / len(percentages)
            variance = sum((x - mean) ** 2 for x in percentages) / len(percentages)
            volatility = variance ** 0.5
        else:
            volatility = 0

        return {
            'success': True,
            'trend_direction': trend_direction,
            'avg_annual_change_pct': avg_annual_change,
            'is_normalizing': is_normalizing,
            'forecast_recommendation': recommendation,
            'historical_years': years,
            'historical_percentages': percentages,
            'latest_sbc_pct': latest_sbc_pct,
            'volatility': volatility,
            'data_quality': 'good' if len(years) >= 3 else 'limited'
        }

    def get_forecast_inputs(self) -> Dict:
        """
        Get recommended inputs for SBC forecasting engine.

        Returns:
            Dict with starting SBC %, trend, and normalization path
        """
        if not self.extraction_success:
            return {
                'success': False,
                'error': 'No SBC data available'
            }

        trend_analysis = self.analyze_sbc_trend()

        if not trend_analysis['success']:
            # Use latest data only
            latest_sbc_pct = self.sbc_data['latest_sbc_pct']
            return {
                'success': True,
                'starting_sbc_pct_revenue': latest_sbc_pct,
                'trend': 'stable',
                'normalization_target': max(3.0, latest_sbc_pct * 0.8),
                'years_to_normalize': 5,
                'data_quality': 'limited',
                'warning': 'Limited historical data - using conservative assumptions'
            }

        # Use trend analysis for recommendations
        latest_sbc_pct = trend_analysis['latest_sbc_pct']
        trend = trend_analysis['trend_direction']

        # Determine normalization target based on current levels
        if latest_sbc_pct > 10.0:
            normalization_target = 7.0
            years_to_normalize = 7
        elif latest_sbc_pct > 5.0:
            normalization_target = 4.0
            years_to_normalize = 5
        else:
            normalization_target = latest_sbc_pct
            years_to_normalize = 5

        return {
            'success': True,
            'starting_sbc_pct_revenue': latest_sbc_pct,
            'trend': trend,
            'normalization_target': normalization_target,
            'years_to_normalize': years_to_normalize,
            'recommendation': trend_analysis['forecast_recommendation'],
            'data_quality': trend_analysis['data_quality'],
            'historical_years': trend_analysis['historical_years'],
            'historical_percentages': trend_analysis['historical_percentages']
        }


def detect_sbc_for_company(ticker: str) -> Dict:
    """
    Convenience function to detect SBC for a company.

    Args:
        ticker: Stock ticker symbol

    Returns:
        Complete SBC analysis including extraction, trends, and forecast inputs
    """
    detector = SBCDetector(ticker)

    # Extract SBC data
    sbc_data = detector.extract_sbc_data()

    if not sbc_data['success']:
        return {
            'ticker': ticker,
            'success': False,
            'error': sbc_data['error'],
            'sbc_data': None,
            'trend_analysis': None,
            'forecast_inputs': None
        }

    # Analyze trends
    trend_analysis = detector.analyze_sbc_trend()

    # Get forecast inputs
    forecast_inputs = detector.get_forecast_inputs()

    return {
        'ticker': ticker,
        'success': True,
        'sbc_data': sbc_data,
        'trend_analysis': trend_analysis,
        'forecast_inputs': forecast_inputs,
        'error': None
    }


if __name__ == '__main__':
    # Test with high-SBC companies
    print("=" * 80)
    print("SBC Detector - Test Run")
    print("=" * 80)

    test_tickers = ['SNOW', 'PLTR', 'AAPL']

    for ticker in test_tickers:
        print(f"\n{'='*80}")
        print(f"Testing: {ticker}")
        print(f"{'='*80}")

        result = detect_sbc_for_company(ticker)

        if result['success']:
            sbc = result['sbc_data']
            print(f"\n✅ SBC Detection Successful")
            print(f"   Method: {sbc['method']}")
            print(f"   Years Available: {sbc['years_available']}")
            print(f"   Latest Year: {sbc['latest_year']}")
            print(f"   Latest SBC: ${sbc['latest_sbc']/1e9:.2f}B")
            print(f"   Latest SBC %: {sbc['latest_sbc_pct']:.2f}%")
            print(f"   Avg SBC %: {sbc['avg_sbc_pct']:.2f}%")
            print(f"   Material: {'Yes' if sbc['is_material'] else 'No'}")

            if result['trend_analysis']['success']:
                trend = result['trend_analysis']
                print(f"\n📈 Trend Analysis:")
                print(f"   Direction: {trend['trend_direction']}")
                print(f"   Avg Annual Change: {trend['avg_annual_change_pct']:.2f}%")
                print(f"   Recommendation: {trend['forecast_recommendation']}")

            if result['forecast_inputs']['success']:
                forecast = result['forecast_inputs']
                print(f"\n🔮 Forecast Inputs:")
                print(f"   Starting SBC %: {forecast['starting_sbc_pct_revenue']:.2f}%")
                print(f"   Normalization Target: {forecast['normalization_target']:.2f}%")
                print(f"   Years to Normalize: {forecast['years_to_normalize']}")
        else:
            print(f"\n❌ SBC Detection Failed")
            print(f"   Error: {result['error']}")

    print("\n" + "=" * 80)
    print("✅ SBC Detector Test Complete")
    print("=" * 80)
