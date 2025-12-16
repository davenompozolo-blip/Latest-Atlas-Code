"""
Share-Based Compensation (SBC) Forecasting Engine

Projects SBC forward for DCF valuations using intelligent normalization paths.
Integrates with DCF projections to ensure SBC is properly treated as a cash cost.

Forecast Methods:
1. Linear Normalization - Decline to target over N years
2. Maintain Current - Keep SBC % constant
3. Scale with Revenue - SBC grows with revenue at fixed %
4. Custom Path - User-defined trajectory

Author: ATLAS Development Team
Version: 1.0.0
Date: 2025-12-16
"""

from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import pandas as pd


class SBCForecastMethod(Enum):
    """SBC forecasting methods"""
    LINEAR_NORMALIZATION = "linear_normalization"
    MAINTAIN_CURRENT = "maintain_current"
    SCALE_WITH_REVENUE = "scale_with_revenue"
    CUSTOM_PATH = "custom_path"


@dataclass
class SBCForecastConfig:
    """
    Configuration for SBC forecasting.
    """
    method: SBCForecastMethod
    starting_sbc_pct_revenue: float  # Current SBC as % of revenue
    forecast_years: int = 10

    # For LINEAR_NORMALIZATION
    normalization_target_pct: float = 3.0  # Target SBC %
    years_to_normalize: int = 5  # Years to reach target

    # For MAINTAIN_CURRENT
    maintain_pct: Optional[float] = None  # If None, use starting_sbc_pct_revenue

    # For CUSTOM_PATH
    custom_sbc_pct_by_year: Optional[Dict[int, float]] = None  # {year: sbc_pct}

    # Optional: absolute SBC amounts (for validation)
    starting_sbc_amount: Optional[float] = None
    starting_revenue: Optional[float] = None

    def validate(self) -> Tuple[bool, Optional[str]]:
        """Validate configuration"""
        if self.starting_sbc_pct_revenue < 0:
            return False, "Starting SBC % cannot be negative"

        if self.starting_sbc_pct_revenue > 50:
            return False, "Starting SBC % seems unrealistic (>50%)"

        if self.forecast_years < 1 or self.forecast_years > 20:
            return False, "Forecast years must be 1-20"

        if self.method == SBCForecastMethod.LINEAR_NORMALIZATION:
            if self.normalization_target_pct < 0:
                return False, "Normalization target cannot be negative"

            if self.years_to_normalize < 1 or self.years_to_normalize > self.forecast_years:
                return False, f"Years to normalize must be 1-{self.forecast_years}"

        if self.method == SBCForecastMethod.CUSTOM_PATH:
            if not self.custom_sbc_pct_by_year:
                return False, "Custom path requires custom_sbc_pct_by_year dict"

            if len(self.custom_sbc_pct_by_year) != self.forecast_years:
                return False, f"Custom path must have {self.forecast_years} years"

        return True, None


class SBCForecaster:
    """
    Forecasts SBC for DCF projections.
    """

    def __init__(self, config: SBCForecastConfig):
        """
        Initialize SBC forecaster.

        Args:
            config: SBCForecastConfig object
        """
        self.config = config

        # Validate configuration
        is_valid, error = config.validate()
        if not is_valid:
            raise ValueError(f"Invalid SBC forecast configuration: {error}")

        self.sbc_forecast = None

    def generate_sbc_forecast(self, revenue_projections: Dict[int, float]) -> Dict[int, Dict]:
        """
        Generate SBC forecast based on configuration and revenue projections.

        Args:
            revenue_projections: Dict of {year: projected_revenue}

        Returns:
            Dict of {year: {'sbc_amount', 'sbc_pct_revenue', 'revenue'}}
        """
        if self.config.method == SBCForecastMethod.LINEAR_NORMALIZATION:
            forecast = self._forecast_linear_normalization(revenue_projections)

        elif self.config.method == SBCForecastMethod.MAINTAIN_CURRENT:
            forecast = self._forecast_maintain_current(revenue_projections)

        elif self.config.method == SBCForecastMethod.SCALE_WITH_REVENUE:
            forecast = self._forecast_scale_with_revenue(revenue_projections)

        elif self.config.method == SBCForecastMethod.CUSTOM_PATH:
            forecast = self._forecast_custom_path(revenue_projections)

        else:
            raise ValueError(f"Unknown forecast method: {self.config.method}")

        self.sbc_forecast = forecast
        return forecast

    def _forecast_linear_normalization(self, revenue_projections: Dict[int, float]) -> Dict[int, Dict]:
        """
        Forecast SBC with linear decline to normalization target.

        Example: 12% → 8% → 6% → 4% → 3% (over 5 years)
        """
        forecast = {}

        starting_pct = self.config.starting_sbc_pct_revenue
        target_pct = self.config.normalization_target_pct
        years_to_normalize = self.config.years_to_normalize

        for year in range(1, self.config.forecast_years + 1):
            revenue = revenue_projections.get(year, 0)

            # Calculate SBC % for this year
            if year <= years_to_normalize:
                # Linear interpolation
                progress = (year - 1) / (years_to_normalize - 1) if years_to_normalize > 1 else 1.0
                sbc_pct = starting_pct + (target_pct - starting_pct) * progress
            else:
                # Maintain target after normalization period
                sbc_pct = target_pct

            # Calculate SBC amount
            sbc_amount = revenue * (sbc_pct / 100.0)

            forecast[year] = {
                'sbc_amount': sbc_amount,
                'sbc_pct_revenue': sbc_pct,
                'revenue': revenue,
                'forecast_method': 'linear_normalization'
            }

        return forecast

    def _forecast_maintain_current(self, revenue_projections: Dict[int, float]) -> Dict[int, Dict]:
        """
        Forecast SBC maintaining current % of revenue.

        SBC grows/shrinks proportionally with revenue.
        """
        forecast = {}

        maintain_pct = self.config.maintain_pct or self.config.starting_sbc_pct_revenue

        for year in range(1, self.config.forecast_years + 1):
            revenue = revenue_projections.get(year, 0)
            sbc_amount = revenue * (maintain_pct / 100.0)

            forecast[year] = {
                'sbc_amount': sbc_amount,
                'sbc_pct_revenue': maintain_pct,
                'revenue': revenue,
                'forecast_method': 'maintain_current'
            }

        return forecast

    def _forecast_scale_with_revenue(self, revenue_projections: Dict[int, float]) -> Dict[int, Dict]:
        """
        Forecast SBC scaling with revenue at fixed percentage.

        Similar to maintain_current but emphasizes revenue growth connection.
        """
        return self._forecast_maintain_current(revenue_projections)

    def _forecast_custom_path(self, revenue_projections: Dict[int, float]) -> Dict[int, Dict]:
        """
        Forecast SBC using custom user-defined path.

        User specifies exact SBC % for each year.
        """
        forecast = {}

        for year in range(1, self.config.forecast_years + 1):
            revenue = revenue_projections.get(year, 0)
            sbc_pct = self.config.custom_sbc_pct_by_year.get(year, 0)
            sbc_amount = revenue * (sbc_pct / 100.0)

            forecast[year] = {
                'sbc_amount': sbc_amount,
                'sbc_pct_revenue': sbc_pct,
                'revenue': revenue,
                'forecast_method': 'custom_path'
            }

        return forecast

    def get_total_sbc_cost(self) -> float:
        """
        Get total undiscounted SBC cost over forecast period.

        Returns:
            Total SBC amount (not PV)
        """
        if not self.sbc_forecast:
            return 0.0

        return sum(year_data['sbc_amount'] for year_data in self.sbc_forecast.values())

    def get_sbc_pv(self, discount_rate: float) -> float:
        """
        Get present value of SBC costs.

        Args:
            discount_rate: WACC for discounting

        Returns:
            Present value of all SBC costs
        """
        if not self.sbc_forecast:
            return 0.0

        pv = 0.0
        for year, year_data in self.sbc_forecast.items():
            sbc_amount = year_data['sbc_amount']
            pv += sbc_amount / ((1 + discount_rate) ** year)

        return pv

    def calculate_sbc_impact_on_valuation(
        self,
        base_enterprise_value: float,
        discount_rate: float,
        diluted_shares: float
    ) -> Dict:
        """
        Calculate impact of SBC on valuation.

        Args:
            base_enterprise_value: Enterprise value BEFORE SBC adjustment
            discount_rate: WACC
            diluted_shares: Diluted share count

        Returns:
            Dict with before/after comparison
        """
        if not self.sbc_forecast:
            raise ValueError("Must generate SBC forecast first")

        # Calculate PV of SBC
        sbc_pv = self.get_sbc_pv(discount_rate)

        # Adjust enterprise value
        adjusted_enterprise_value = base_enterprise_value - sbc_pv

        # Per share impact
        sbc_impact_per_share = sbc_pv / diluted_shares if diluted_shares > 0 else 0

        # Percentage impact
        pct_impact = (sbc_pv / base_enterprise_value * 100) if base_enterprise_value > 0 else 0

        return {
            'base_enterprise_value': base_enterprise_value,
            'sbc_present_value': sbc_pv,
            'adjusted_enterprise_value': adjusted_enterprise_value,
            'sbc_impact_per_share': sbc_impact_per_share,
            'pct_impact_on_value': pct_impact,
            'total_sbc_undiscounted': self.get_total_sbc_cost(),
            'discount_rate': discount_rate
        }

    def export_to_dataframe(self) -> pd.DataFrame:
        """
        Export SBC forecast to pandas DataFrame for analysis/export.

        Returns:
            DataFrame with columns: Year, Revenue, SBC_Amount, SBC_Pct_Revenue
        """
        if not self.sbc_forecast:
            return pd.DataFrame()

        data = []
        for year in sorted(self.sbc_forecast.keys()):
            year_data = self.sbc_forecast[year]
            data.append({
                'Year': year,
                'Revenue': year_data['revenue'],
                'SBC_Amount': year_data['sbc_amount'],
                'SBC_Pct_Revenue': year_data['sbc_pct_revenue']
            })

        return pd.DataFrame(data)


def integrate_sbc_with_fcff(
    fcff_projections: Dict[int, Dict],
    sbc_forecast: Dict[int, Dict],
    sbc_already_in_fcff: bool = False
) -> Dict[int, Dict]:
    """
    Integrate SBC into FCFF projections.

    SBC treatment in DCF:
    - If FCFF was calculated from NOPAT: SBC needs to be SUBTRACTED (it's a real cash cost)
    - If FCFF was calculated from Operating Cash Flow: SBC is already added back, so we subtract it

    Args:
        fcff_projections: Dict of {year: {'fcff', 'revenue', ...}}
        sbc_forecast: Dict of {year: {'sbc_amount', ...}}
        sbc_already_in_fcff: If True, SBC is already in FCFF (from OCF), don't double-count

    Returns:
        Updated FCFF projections with SBC properly accounted for
    """
    updated_projections = {}

    for year in fcff_projections.keys():
        year_proj = fcff_projections[year].copy()

        # Get SBC for this year
        sbc_amount = sbc_forecast.get(year, {}).get('sbc_amount', 0)

        # Subtract SBC from FCFF (it's a real cost)
        original_fcff = year_proj.get('fcff', 0)

        if not sbc_already_in_fcff:
            # SBC not yet accounted for - subtract it
            adjusted_fcff = original_fcff - sbc_amount
            year_proj['fcff'] = adjusted_fcff
            year_proj['fcff_before_sbc'] = original_fcff
            year_proj['sbc_adjustment'] = -sbc_amount
        else:
            # SBC already in FCFF (from OCF method)
            year_proj['fcff_before_sbc'] = original_fcff
            year_proj['sbc_adjustment'] = 0
            year_proj['note'] = "SBC already accounted for in Operating Cash Flow"

        year_proj['sbc_amount'] = sbc_amount
        year_proj['sbc_pct_revenue'] = sbc_forecast.get(year, {}).get('sbc_pct_revenue', 0)

        updated_projections[year] = year_proj

    return updated_projections


def create_sbc_comparison_analysis(
    valuation_without_sbc: Dict,
    valuation_with_sbc: Dict,
    sbc_forecast: Dict[int, Dict]
) -> Dict:
    """
    Create before/after comparison showing SBC impact.

    Args:
        valuation_without_sbc: DCF result ignoring SBC
        valuation_with_sbc: DCF result with SBC properly treated
        sbc_forecast: SBC forecast data

    Returns:
        Dict with detailed comparison
    """
    # Extract key metrics
    ev_without = valuation_without_sbc.get('enterprise_value', 0)
    ev_with = valuation_with_sbc.get('enterprise_value', 0)

    value_per_share_without = valuation_without_sbc.get('value_per_share', 0)
    value_per_share_with = valuation_with_sbc.get('value_per_share', 0)

    # Calculate impact
    ev_impact = ev_without - ev_with
    per_share_impact = value_per_share_without - value_per_share_with
    pct_impact = (ev_impact / ev_without * 100) if ev_without > 0 else 0

    # Calculate total SBC
    total_sbc = sum(year_data['sbc_amount'] for year_data in sbc_forecast.values())
    avg_sbc_pct = sum(year_data['sbc_pct_revenue'] for year_data in sbc_forecast.values()) / len(sbc_forecast)

    return {
        'enterprise_value_without_sbc': ev_without,
        'enterprise_value_with_sbc': ev_with,
        'ev_impact': ev_impact,
        'ev_impact_pct': pct_impact,

        'value_per_share_without_sbc': value_per_share_without,
        'value_per_share_with_sbc': value_per_share_with,
        'per_share_impact': per_share_impact,
        'per_share_impact_pct': (per_share_impact / value_per_share_without * 100) if value_per_share_without > 0 else 0,

        'total_sbc_undiscounted': total_sbc,
        'avg_sbc_pct_revenue': avg_sbc_pct,

        'interpretation': _interpret_sbc_impact(pct_impact, avg_sbc_pct)
    }


def _interpret_sbc_impact(pct_impact: float, avg_sbc_pct: float) -> str:
    """
    Interpret the materiality of SBC impact on valuation.

    Args:
        pct_impact: % impact on enterprise value
        avg_sbc_pct: Average SBC as % of revenue

    Returns:
        Human-readable interpretation
    """
    if pct_impact > 15:
        severity = "CRITICAL"
        message = f"SBC has a {pct_impact:.1f}% impact on valuation - this is HIGHLY material. "
        message += f"At {avg_sbc_pct:.1f}% of revenue, SBC cannot be ignored. "
        message += "Any valuation ignoring SBC will significantly overstate intrinsic value."

    elif pct_impact > 10:
        severity = "MAJOR"
        message = f"SBC has a {pct_impact:.1f}% impact on valuation - this is very material. "
        message += f"At {avg_sbc_pct:.1f}% of revenue, SBC represents a significant economic cost. "
        message += "Ignoring SBC would lead to notable overvaluation."

    elif pct_impact > 5:
        severity = "MODERATE"
        message = f"SBC has a {pct_impact:.1f}% impact on valuation - this is material. "
        message += f"At {avg_sbc_pct:.1f}% of revenue, SBC should be explicitly modeled. "
        message += "Not accounting for SBC would overvalue the company by 5-10%."

    elif pct_impact > 2:
        severity = "MINOR"
        message = f"SBC has a {pct_impact:.1f}% impact on valuation - this is somewhat material. "
        message += f"At {avg_sbc_pct:.1f}% of revenue, SBC should be considered but isn't critical. "
        message += "Impact is noticeable but not dramatic."

    else:
        severity = "MINIMAL"
        message = f"SBC has a {pct_impact:.1f}% impact on valuation - this is not material. "
        message += f"At {avg_sbc_pct:.1f}% of revenue, SBC is low and has minimal impact. "
        message += "Either treatment (ignoring or including) would yield similar results."

    return f"[{severity}] {message}"


if __name__ == '__main__':
    # Test SBC forecaster
    print("=" * 80)
    print("SBC Forecaster - Test Run")
    print("=" * 80)

    # Mock revenue projections
    revenue_projections = {
        1: 10e9,
        2: 12e9,
        3: 14.4e9,
        4: 16.9e9,
        5: 19.5e9,
        6: 22.1e9,
        7: 24.5e9,
        8: 26.6e9,
        9: 28.4e9,
        10: 30.0e9
    }

    # Test 1: Linear Normalization
    print("\n" + "="*80)
    print("Test 1: Linear Normalization (12% → 3% over 5 years)")
    print("="*80)

    config = SBCForecastConfig(
        method=SBCForecastMethod.LINEAR_NORMALIZATION,
        starting_sbc_pct_revenue=12.0,
        forecast_years=10,
        normalization_target_pct=3.0,
        years_to_normalize=5
    )

    forecaster = SBCForecaster(config)
    sbc_forecast = forecaster.generate_sbc_forecast(revenue_projections)

    print("\nSBC Forecast:")
    for year in sorted(sbc_forecast.keys()):
        data = sbc_forecast[year]
        print(f"  Year {year}: ${data['sbc_amount']/1e9:.2f}B ({data['sbc_pct_revenue']:.2f}% of revenue)")

    print(f"\nTotal SBC (undiscounted): ${forecaster.get_total_sbc_cost()/1e9:.2f}B")
    print(f"SBC PV at 10% WACC: ${forecaster.get_sbc_pv(0.10)/1e9:.2f}B")

    # Test 2: Maintain Current
    print("\n" + "="*80)
    print("Test 2: Maintain Current (8% constant)")
    print("="*80)

    config2 = SBCForecastConfig(
        method=SBCForecastMethod.MAINTAIN_CURRENT,
        starting_sbc_pct_revenue=8.0,
        forecast_years=10
    )

    forecaster2 = SBCForecaster(config2)
    sbc_forecast2 = forecaster2.generate_sbc_forecast(revenue_projections)

    print("\nSBC Forecast:")
    for year in [1, 5, 10]:
        data = sbc_forecast2[year]
        print(f"  Year {year}: ${data['sbc_amount']/1e9:.2f}B ({data['sbc_pct_revenue']:.2f}% of revenue)")

    print(f"\nTotal SBC (undiscounted): ${forecaster2.get_total_sbc_cost()/1e9:.2f}B")

    # Test 3: Impact on Valuation
    print("\n" + "="*80)
    print("Test 3: Impact on Valuation")
    print("="*80)

    base_ev = 200e9  # $200B enterprise value without SBC
    impact = forecaster.calculate_sbc_impact_on_valuation(
        base_enterprise_value=base_ev,
        discount_rate=0.10,
        diluted_shares=1e9
    )

    print(f"\nBase Enterprise Value: ${impact['base_enterprise_value']/1e9:.2f}B")
    print(f"SBC Present Value: ${impact['sbc_present_value']/1e9:.2f}B")
    print(f"Adjusted Enterprise Value: ${impact['adjusted_enterprise_value']/1e9:.2f}B")
    print(f"Impact per Share: ${impact['sbc_impact_per_share']:.2f}")
    print(f"% Impact on Value: {impact['pct_impact_on_value']:.2f}%")

    print("\n" + "=" * 80)
    print("✅ SBC Forecaster Test Complete")
    print("=" * 80)
