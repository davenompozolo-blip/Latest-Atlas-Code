"""
ATLAS DCF Projections Module
=============================
Editable DCF Projection Table with Manual Overrides

Features:
- Auto-generation of projections based on historical data
- Manual override capability for any line item
- Smart recalculation of dependent items
- Scenario management integration
- Export to DataFrame/CSV

Author: ATLAS v11.0
"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional
from copy import deepcopy


class DCFProjections:
    """
    Store and manage DCF projection data with auto-generation and manual overrides.

    Philosophy: Every forecast value is either auto-generated OR manually overridden.
    The analyst has complete control.
    """

    def __init__(self, ticker: str, historical_data: dict, forecast_years: int = 5):
        """
        Initialize DCF projections system.

        Args:
            ticker: Stock ticker symbol
            historical_data: Historical financial data
            forecast_years: Number of years to project (default 5)
        """
        self.ticker = ticker
        self.historical_data = historical_data
        self.forecast_years = forecast_years

        # Auto-generated projections
        self.auto_projections = self._generate_auto_projections()

        # Manual overrides (initially empty)
        self.manual_overrides = {
            year: {} for year in range(1, forecast_years + 1)
        }

        # Final projections (auto + overrides)
        self.final_projections = self._merge_projections()

    def _generate_auto_projections(self) -> dict:
        """
        Generate automatic projections based on historical trends.

        Returns:
            dict: {year: {line_item: value}}
        """
        projections = {}

        # Historical baseline
        base_revenue = self.historical_data.get('revenue', 0)
        base_ebit = self.historical_data.get('ebit', 0)
        base_da = self.historical_data.get('depreciation_amortization', 0)
        base_capex = abs(self.historical_data.get('capex', 0))
        base_nwc = self.historical_data.get('net_working_capital', 0)
        base_sbc = abs(self.historical_data.get('sbc_expense', 0))
        base_net_income = self.historical_data.get('net_income', 0)

        # Prevent division by zero
        if base_revenue == 0:
            base_revenue = 1e9  # Default $1B

        # Calculate historical growth rates and margins
        revenue_growth = self._calculate_historical_cagr('revenue', 3)

        # Margins and ratios
        ebit_margin = base_ebit / base_revenue if base_revenue > 0 else 0.15
        da_pct_revenue = base_da / base_revenue if base_revenue > 0 else 0.03
        capex_pct_revenue = base_capex / base_revenue if base_revenue > 0 else 0.05
        nwc_pct_delta_revenue = 0.025  # Typical 2.5% of revenue change
        sbc_pct_revenue = base_sbc / base_revenue if base_revenue > 0 else 0.02

        # Tax rate
        tax_rate = self.historical_data.get('tax_rate', 0.21)
        if tax_rate <= 0 or tax_rate > 0.50:
            # Calculate from income tax expense
            income_tax = self.historical_data.get('income_tax_expense', 0)
            pretax = self.historical_data.get('pretax_income', base_net_income)
            if pretax > 0:
                tax_rate = abs(income_tax) / pretax
                tax_rate = max(0, min(tax_rate, 0.40))
            else:
                tax_rate = 0.21

        # Project forward
        previous_revenue = base_revenue

        for year in range(1, self.forecast_years + 1):
            # Revenue projection (declining growth rate - tapering)
            growth_rate = revenue_growth * (0.90 ** (year - 1))  # Taper growth by 10% per year
            projected_revenue = base_revenue * ((1 + growth_rate) ** year)

            # EBIT with gradual margin improvement
            # Assume 25 bps improvement per year, capped at 40% margin
            margin_improvement = 0.0025 * year  # 25 bps per year
            projected_margin = min(ebit_margin + margin_improvement, 0.40)  # Cap at 40%
            projected_ebit = projected_revenue * projected_margin

            # NOPAT (Net Operating Profit After Tax)
            projected_nopat = projected_ebit * (1 - tax_rate)

            # D&A - typically declines slightly as % of revenue (asset efficiency)
            da_pct = da_pct_revenue * (0.98 ** (year - 1))  # Decline 2% per year
            projected_da = projected_revenue * da_pct

            # CapEx - maintain steady % of revenue
            projected_capex = -(projected_revenue * capex_pct_revenue)

            # Change in NWC - based on revenue growth
            revenue_change = projected_revenue - previous_revenue
            projected_nwc_change = -(revenue_change * nwc_pct_delta_revenue)

            # SBC - maintain steady % of revenue
            projected_sbc = -(projected_revenue * sbc_pct_revenue)

            # Calculate FCFF
            fcff = (projected_nopat +
                   projected_da +
                   projected_capex +
                   projected_nwc_change +
                   projected_sbc)

            projections[year] = {
                'revenue': projected_revenue,
                'revenue_growth': growth_rate,
                'ebit': projected_ebit,
                'ebit_margin': projected_margin,
                'tax_rate': tax_rate,
                'nopat': projected_nopat,
                'depreciation_amortization': projected_da,
                'da_pct_revenue': da_pct,
                'capex': projected_capex,
                'capex_pct_revenue': capex_pct_revenue,
                'nwc_change': projected_nwc_change,
                'nwc_pct_delta_revenue': nwc_pct_delta_revenue,
                'sbc_expense': projected_sbc,
                'sbc_pct_revenue': sbc_pct_revenue,
                'fcff': fcff
            }

            # Update for next iteration
            previous_revenue = projected_revenue

        return projections

    def _calculate_historical_cagr(self, metric: str, years: int) -> float:
        """
        Calculate historical CAGR for a metric.

        For now, returns a reasonable default based on current data.
        In a full implementation, would access historical time series.

        Args:
            metric: Metric name (e.g., 'revenue')
            years: Number of years to look back

        Returns:
            float: CAGR as decimal
        """
        # Default assumptions based on company size
        revenue = self.historical_data.get('revenue', 0)

        if revenue > 500e9:  # Mega-cap (>$500B)
            return 0.08  # 8% growth
        elif revenue > 100e9:  # Large-cap ($100B-$500B)
            return 0.12  # 12% growth
        elif revenue > 10e9:  # Mid-cap ($10B-$100B)
            return 0.15  # 15% growth
        else:  # Small-cap (<$10B)
            return 0.20  # 20% growth

    def set_manual_override(self, year: int, line_item: str, value: float):
        """
        Set a manual override for a specific line item in a specific year.

        Args:
            year: Forecast year (1 to forecast_years)
            line_item: e.g., 'revenue', 'ebit', 'capex'
            value: New value
        """
        if year not in self.manual_overrides:
            raise ValueError(f"Invalid year: {year}. Must be between 1 and {self.forecast_years}")

        self.manual_overrides[year][line_item] = value

        # Recalculate dependent items
        self._recalculate_year(year)

        # Update final projections
        self.final_projections = self._merge_projections()

    def _recalculate_year(self, year: int):
        """
        Recalculate dependent line items when a manual override is applied.

        Logic:
        - If revenue changes → recalculate EBIT (if margin is maintained)
        - If EBIT changes → recalculate NOPAT
        - If any cash flow component changes → recalculate FCFF
        """
        auto = self.auto_projections[year]
        manual = self.manual_overrides[year]

        # Get effective values (manual overrides auto)
        revenue = manual.get('revenue', auto['revenue'])
        ebit = manual.get('ebit', auto['ebit'])
        tax_rate = manual.get('tax_rate', auto['tax_rate'])
        da = manual.get('depreciation_amortization', auto['depreciation_amortization'])
        capex = manual.get('capex', auto['capex'])
        nwc_change = manual.get('nwc_change', auto['nwc_change'])
        sbc = manual.get('sbc_expense', auto['sbc_expense'])

        # Recalculate derived items

        # If revenue changed but EBIT didn't (manual), maintain margin
        if 'revenue' in manual and 'ebit' not in manual:
            original_margin = auto['ebit'] / auto['revenue'] if auto['revenue'] > 0 else 0.15
            ebit = revenue * original_margin
            manual['ebit'] = ebit

        # Recalculate EBIT margin
        if revenue > 0:
            manual['ebit_margin'] = ebit / revenue
        else:
            manual['ebit_margin'] = 0

        # Recalculate NOPAT
        nopat = ebit * (1 - tax_rate)
        manual['nopat'] = nopat

        # Recalculate FCFF
        fcff = nopat + da + capex + nwc_change + sbc
        manual['fcff'] = fcff

        # Store updated manual overrides
        self.manual_overrides[year] = manual

    def _merge_projections(self) -> dict:
        """
        Merge auto-generated projections with manual overrides.

        Returns:
            dict: Final projections to use in DCF
        """
        final = {}

        for year in range(1, self.forecast_years + 1):
            auto = self.auto_projections[year]
            manual = self.manual_overrides[year]

            # Start with auto, overlay manual
            final[year] = auto.copy()
            final[year].update(manual)

            # Mark which items are manual vs auto
            final[year]['_overridden_items'] = list(manual.keys())

        return final

    def clear_overrides(self, year: Optional[int] = None):
        """
        Clear manual overrides for a year (or all years if year=None).

        Args:
            year: Year to clear, or None to clear all
        """
        if year is None:
            self.manual_overrides = {
                y: {} for y in range(1, self.forecast_years + 1)
            }
        else:
            if year in self.manual_overrides:
                self.manual_overrides[year] = {}

        self.final_projections = self._merge_projections()

    def is_manual(self, year: int, line_item: str) -> bool:
        """
        Check if a line item has been manually overridden.

        Args:
            year: Forecast year
            line_item: Line item name

        Returns:
            bool: True if manually overridden
        """
        return line_item in self.manual_overrides.get(year, {})

    def get_growth_rate(self, year: int) -> float:
        """
        Get revenue growth rate for a specific year.

        Args:
            year: Forecast year

        Returns:
            float: Growth rate as decimal
        """
        if year == 1:
            prior_revenue = self.historical_data.get('revenue', 0)
        else:
            prior_revenue = self.final_projections[year - 1]['revenue']

        current_revenue = self.final_projections[year]['revenue']

        if prior_revenue > 0:
            return (current_revenue - prior_revenue) / prior_revenue
        else:
            return 0

    def export_to_dataframe(self) -> pd.DataFrame:
        """
        Export projections to pandas DataFrame for display/export.

        Returns:
            pd.DataFrame: Formatted projection table
        """
        rows = []
        line_items = [
            ('Revenue', 'revenue'),
            ('EBIT', 'ebit'),
            ('EBIT Margin (%)', 'ebit_margin'),
            ('Tax Rate (%)', 'tax_rate'),
            ('NOPAT', 'nopat'),
            ('D&A', 'depreciation_amortization'),
            ('CapEx', 'capex'),
            ('Δ NWC', 'nwc_change'),
            ('SBC Expense', 'sbc_expense'),
            ('FCFF', 'fcff')
        ]

        for display_name, item_key in line_items:
            row = {'Line Item': display_name}

            # Historical
            if item_key in self.historical_data:
                hist_value = self.historical_data[item_key]
                if 'margin' in item_key.lower() or 'rate' in item_key.lower():
                    row['Historical'] = f"{hist_value*100:.1f}%"
                else:
                    row['Historical'] = f"${hist_value/1e9:.2f}B"
            else:
                row['Historical'] = 'N/A'

            # Projected years
            for year in range(1, self.forecast_years + 1):
                value = self.final_projections[year][item_key]

                # Format based on type
                if 'margin' in item_key.lower() or 'rate' in item_key.lower():
                    row[f'Year {year}'] = f"{value*100:.1f}%"
                else:
                    row[f'Year {year}'] = f"${value/1e9:.2f}B"

            rows.append(row)

        return pd.DataFrame(rows)

    def export_to_dict_for_dcf(self) -> List[Dict]:
        """
        Export projections in format expected by DCF calculation functions.

        Returns:
            List[Dict]: List of annual projections
        """
        result = []

        for year in range(1, self.forecast_years + 1):
            proj = self.final_projections[year]

            result.append({
                'year': year,
                'revenue': proj['revenue'],
                'ebit': proj['ebit'],
                'nopat': proj['nopat'],
                'depreciation': proj['depreciation_amortization'],
                'capex': proj['capex'],
                'change_wc': proj['nwc_change'],
                'sbc_expense': proj['sbc_expense'],
                'fcff': proj['fcff']
            })

        return result

    def get_terminal_fcff(self) -> float:
        """
        Get final year FCFF for terminal value calculation.

        Returns:
            float: Final year FCFF
        """
        return self.final_projections[self.forecast_years]['fcff']

    def get_summary_stats(self) -> Dict[str, Any]:
        """
        Get summary statistics for projections.

        Returns:
            dict: Summary stats
        """
        # Revenue CAGR
        initial_revenue = self.historical_data.get('revenue', 0)
        final_revenue = self.final_projections[self.forecast_years]['revenue']

        if initial_revenue > 0:
            revenue_cagr = (final_revenue / initial_revenue) ** (1 / self.forecast_years) - 1
        else:
            revenue_cagr = 0

        # Average EBIT margin
        avg_ebit_margin = np.mean([
            self.final_projections[y]['ebit_margin']
            for y in range(1, self.forecast_years + 1)
        ])

        # Total FCFF
        total_fcff = sum([
            self.final_projections[y]['fcff']
            for y in range(1, self.forecast_years + 1)
        ])

        # Manual override count
        total_overrides = sum([
            len(self.manual_overrides[y])
            for y in range(1, self.forecast_years + 1)
        ])

        return {
            'revenue_cagr': revenue_cagr,
            'avg_ebit_margin': avg_ebit_margin,
            'total_fcff': total_fcff,
            'terminal_fcff': self.get_terminal_fcff(),
            'total_manual_overrides': total_overrides,
            'forecast_years': self.forecast_years
        }

    def clone(self):
        """
        Create a deep copy of this projections object.

        Returns:
            DCFProjections: Cloned object
        """
        cloned = DCFProjections(
            ticker=self.ticker,
            historical_data=deepcopy(self.historical_data),
            forecast_years=self.forecast_years
        )

        cloned.manual_overrides = deepcopy(self.manual_overrides)
        cloned.final_projections = cloned._merge_projections()

        return cloned


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def create_projections_from_financial_data(ticker: str, financial_data: dict,
                                          forecast_years: int = 5) -> DCFProjections:
    """
    Create DCFProjections object from financial data dictionary.

    Args:
        ticker: Stock ticker
        financial_data: Financial data from model_inputs.extract_financial_data_for_model_inputs
        forecast_years: Number of years to project

    Returns:
        DCFProjections: Initialized projections object
    """
    return DCFProjections(
        ticker=ticker,
        historical_data=financial_data,
        forecast_years=forecast_years
    )


if __name__ == '__main__':
    # Test the module
    print("Testing DCF Projections Module")
    print("=" * 60)

    # Mock historical data
    historical_data = {
        'revenue': 100e9,  # $100B
        'ebit': 30e9,  # $30B (30% margin)
        'net_income': 22e9,
        'depreciation_amortization': 10e9,
        'capex': -15e9,
        'net_working_capital': 20e9,
        'sbc_expense': -3e9,
        'tax_rate': 0.21
    }

    # Create projections
    projections = DCFProjections(
        ticker='TEST',
        historical_data=historical_data,
        forecast_years=5
    )

    print("\nAuto-Generated Projections:")
    for year in range(1, 6):
        proj = projections.final_projections[year]
        print(f"Year {year}: Revenue ${proj['revenue']/1e9:.1f}B, FCFF ${proj['fcff']/1e9:.1f}B")

    print("\nApplying manual override to Year 2 revenue...")
    projections.set_manual_override(2, 'revenue', 130e9)  # Override to $130B

    print("\nAfter Manual Override:")
    for year in range(1, 6):
        proj = projections.final_projections[year]
        manual_indicator = "✏️" if projections.is_manual(year, 'revenue') else "🤖"
        print(f"Year {year} {manual_indicator}: Revenue ${proj['revenue']/1e9:.1f}B, FCFF ${proj['fcff']/1e9:.1f}B")

    print("\nSummary Stats:")
    stats = projections.get_summary_stats()
    print(f"Revenue CAGR: {stats['revenue_cagr']:.1%}")
    print(f"Avg EBIT Margin: {stats['avg_ebit_margin']:.1%}")
    print(f"Total FCFF (5 years): ${stats['total_fcff']/1e9:.1f}B")
    print(f"Manual Overrides: {stats['total_manual_overrides']}")

    print("\n✅ Module test complete!")
