"""
Multi-Stage DCF Engine for ATLAS Terminal v11.0

Enables proper modeling of companies in different lifecycle stages with realistic
growth transitions. Supports single-stage, two-stage, and three-stage DCF models.

Philosophy:
- Growth rates must decline over time (mean reversion)
- Terminal growth must be reasonable (<= GDP + inflation)
- Transitions should be smooth (no cliffs)
- User has full control (can edit any stage)

Author: ATLAS Development Team
Version: 1.0.0
"""

from enum import Enum
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import math


class DCFModelType(Enum):
    """Types of DCF models available"""
    SINGLE_STAGE = "single_stage"
    TWO_STAGE = "two_stage"
    THREE_STAGE = "three_stage"


@dataclass
class Stage:
    """
    Represents a single stage in a multi-stage DCF.

    Each stage has:
    - Time boundaries (start/end year)
    - Growth characteristics (revenue growth trajectory)
    - Margin characteristics (EBIT margin evolution)
    - Operating assumptions (CapEx, NWC, SBC, D&A)
    """
    stage_number: int
    name: str  # e.g., "High Growth", "Transition", "Mature"
    start_year: int  # 1-indexed (Year 1 = first forecast year)
    end_year: int  # Inclusive
    duration: int  # Number of years

    # Growth characteristics
    revenue_growth_start: float  # Starting growth rate for this stage
    revenue_growth_end: float  # Ending growth rate for this stage
    growth_decline_type: str  # "linear" or "exponential"

    # Margin characteristics
    ebit_margin_start: float
    ebit_margin_end: float
    margin_trajectory: str  # "expanding", "stable", "contracting"

    # Operating assumptions (as % of revenue)
    capex_pct_revenue: float
    nwc_pct_delta_revenue: float  # NWC change as % of revenue change
    sbc_pct_revenue: float
    da_pct_revenue: float

    def __post_init__(self):
        """Validate stage parameters"""
        if self.start_year <= 0:
            raise ValueError(f"start_year must be positive, got {self.start_year}")
        if self.end_year < self.start_year:
            raise ValueError(f"end_year ({self.end_year}) must be >= start_year ({self.start_year})")
        if self.duration != (self.end_year - self.start_year + 1):
            raise ValueError(f"duration ({self.duration}) inconsistent with start/end years")
        if self.growth_decline_type not in ["linear", "exponential"]:
            raise ValueError(f"growth_decline_type must be 'linear' or 'exponential'")
        if self.margin_trajectory not in ["expanding", "stable", "contracting"]:
            raise ValueError(f"margin_trajectory must be 'expanding', 'stable', or 'contracting'")


@dataclass
class MultiStageDCFConfig:
    """
    Configuration for a multi-stage DCF model.

    Contains:
    - Model type (single/two/three stage)
    - List of Stage objects defining each growth phase
    - Terminal growth rate for perpetuity
    - WACC for discounting
    """
    model_type: DCFModelType
    stages: List[Stage]
    terminal_growth_rate: float
    wacc: float

    def validate(self) -> Tuple[bool, Optional[str]]:
        """
        Validate configuration is internally consistent.

        Checks:
        1. Stages are defined and non-empty
        2. Years are continuous (no gaps)
        3. Growth rates decline over time (mean reversion)
        4. Terminal growth is reasonable

        Returns:
            tuple: (is_valid, error_message)
        """
        # Check stage existence
        if not self.stages:
            return False, "No stages defined"

        # Check years are continuous
        for i in range(len(self.stages) - 1):
            current_end = self.stages[i].end_year
            next_start = self.stages[i + 1].start_year
            if current_end + 1 != next_start:
                return False, f"Gap between Stage {i+1} (ends Year {current_end}) and Stage {i+2} (starts Year {next_start})"

        # Check first stage starts at Year 1
        if self.stages[0].start_year != 1:
            return False, f"First stage must start at Year 1, got Year {self.stages[0].start_year}"

        # Check growth rates decline (mean reversion principle)
        for i in range(len(self.stages) - 1):
            current_stage_end_growth = self.stages[i].revenue_growth_end
            next_stage_start_growth = self.stages[i + 1].revenue_growth_start

            # Allow small tolerance for rounding
            if current_stage_end_growth - next_stage_start_growth > 0.001:
                return False, f"Growth rate gap between Stage {i+1} end ({current_stage_end_growth*100:.1f}%) and Stage {i+2} start ({next_stage_start_growth*100:.1f}%)"

        # Check terminal growth is reasonable
        if self.terminal_growth_rate > 0.05:
            return False, f"Terminal growth {self.terminal_growth_rate*100:.1f}% too high (max 5% recommended)"

        if self.terminal_growth_rate < 0:
            return False, f"Terminal growth {self.terminal_growth_rate*100:.1f}% cannot be negative"

        # Check terminal growth doesn't exceed final stage growth
        final_stage_end_growth = self.stages[-1].revenue_growth_end
        if self.terminal_growth_rate > final_stage_end_growth:
            return False, f"Terminal growth ({self.terminal_growth_rate*100:.1f}%) exceeds final stage growth ({final_stage_end_growth*100:.1f}%)"

        # Check WACC is reasonable
        if self.wacc <= 0 or self.wacc > 0.30:
            return False, f"WACC {self.wacc*100:.1f}% out of reasonable range (0-30%)"

        # Check WACC > terminal growth (required for Gordon Growth Model)
        if self.wacc <= self.terminal_growth_rate:
            return False, f"WACC ({self.wacc*100:.1f}%) must exceed terminal growth ({self.terminal_growth_rate*100:.1f}%)"

        return True, None

    def get_total_years(self) -> int:
        """Get total forecast horizon"""
        return self.stages[-1].end_year

    def get_stage_for_year(self, year: int) -> Optional[Stage]:
        """Get the stage that contains a given year"""
        for stage in self.stages:
            if stage.start_year <= year <= stage.end_year:
                return stage
        return None


class MultiStageProjectionEngine:
    """
    Generate DCF projections across multiple growth stages.

    Key Features:
    - Smooth interpolation of growth rates within stages
    - Support for linear and exponential decline curves
    - Margin trajectory modeling (expanding/stable/contracting)
    - Year-by-year FCFF calculation
    """

    def __init__(self, config: MultiStageDCFConfig, historical_data: dict):
        """
        Initialize projection engine.

        Args:
            config: Multi-stage DCF configuration
            historical_data: Dictionary with historical financial data
        """
        self.config = config
        self.historical_data = historical_data
        self.projections = {}

        # Validate configuration
        is_valid, error_msg = config.validate()
        if not is_valid:
            raise ValueError(f"Invalid configuration: {error_msg}")

    def generate_projections(self) -> Dict[int, dict]:
        """
        Generate complete multi-stage projections.

        Returns:
            dict: {year: {line_item: value}} for all forecast years
        """
        projections = {}

        # Get baseline values from historical data
        base_revenue = self.historical_data.get('revenue', 0)
        if base_revenue == 0:
            raise ValueError("Historical revenue is zero or missing")

        tax_rate = self.historical_data.get('tax_rate', 0.21)

        # Get total forecast horizon
        total_years = self.config.get_total_years()

        # Track previous year's revenue for growth calculation
        previous_revenue = base_revenue

        # Generate projections year by year
        for year in range(1, total_years + 1):
            # Determine which stage we're in
            stage = self.config.get_stage_for_year(year)
            if stage is None:
                raise ValueError(f"Year {year} not covered by any stage")

            # Calculate year position within stage (0.0 to 1.0)
            year_in_stage = year - stage.start_year
            stage_progress = year_in_stage / stage.duration

            # Get growth rate for this year (interpolated)
            revenue_growth = self._interpolate_growth(
                stage.revenue_growth_start,
                stage.revenue_growth_end,
                stage_progress,
                stage.growth_decline_type
            )

            # Project revenue
            projected_revenue = previous_revenue * (1 + revenue_growth)

            # Get EBIT margin for this year (interpolated)
            ebit_margin = self._interpolate_margin(
                stage.ebit_margin_start,
                stage.ebit_margin_end,
                stage_progress,
                stage.margin_trajectory
            )

            # Calculate EBIT and NOPAT
            projected_ebit = projected_revenue * ebit_margin
            projected_nopat = projected_ebit * (1 - tax_rate)

            # Calculate other items as % of revenue
            projected_da = projected_revenue * stage.da_pct_revenue
            projected_capex = -(projected_revenue * stage.capex_pct_revenue)

            # NWC change as % of revenue change
            revenue_change = projected_revenue - previous_revenue
            projected_nwc_change = -(revenue_change * stage.nwc_pct_delta_revenue)

            # SBC (Stock-Based Compensation)
            projected_sbc = -(projected_revenue * stage.sbc_pct_revenue)

            # Calculate FCFF
            # FCFF = NOPAT + D&A - CapEx - ΔNWC - SBC
            fcff = (projected_nopat +
                   projected_da +
                   projected_capex +
                   projected_nwc_change +
                   projected_sbc)

            # Store projection
            projections[year] = {
                'year': year,
                'stage_number': stage.stage_number,
                'stage_name': stage.name,
                'revenue': projected_revenue,
                'revenue_growth': revenue_growth,
                'ebit': projected_ebit,
                'ebit_margin': ebit_margin,
                'tax_rate': tax_rate,
                'nopat': projected_nopat,
                'depreciation_amortization': projected_da,
                'capex': projected_capex,
                'nwc_change': projected_nwc_change,
                'sbc_expense': projected_sbc,
                'fcff': fcff
            }

            # Update for next iteration
            previous_revenue = projected_revenue

        self.projections = projections
        return projections

    def _interpolate_growth(self, start_rate: float, end_rate: float,
                           progress: float, decline_type: str) -> float:
        """
        Interpolate growth rate within a stage.

        Args:
            start_rate: Growth rate at stage start
            end_rate: Growth rate at stage end
            progress: Position in stage (0.0 to 1.0)
            decline_type: "linear" or "exponential"

        Returns:
            Interpolated growth rate
        """
        if decline_type == "linear":
            # Linear interpolation: y = start + (end - start) * progress
            return start_rate + (end_rate - start_rate) * progress

        elif decline_type == "exponential":
            # Exponential decay (smoother transition)
            # Formula: rate(t) = start_rate * (end_rate/start_rate)^progress
            if start_rate == 0:
                return end_rate * progress
            if end_rate == 0:
                # Exponential decay to zero
                return start_rate * ((1 - progress) ** 2)

            return start_rate * ((end_rate / start_rate) ** progress)

        else:
            raise ValueError(f"Unknown decline type: {decline_type}")

    def _interpolate_margin(self, start_margin: float, end_margin: float,
                           progress: float, trajectory: str) -> float:
        """
        Interpolate EBIT margin within a stage.

        Args:
            start_margin: Margin at stage start
            end_margin: Margin at stage end
            progress: Position in stage (0.0 to 1.0)
            trajectory: "expanding", "stable", or "contracting"

        Returns:
            Interpolated margin
        """
        if trajectory == "stable":
            # Constant margin throughout stage
            return start_margin

        elif trajectory == "expanding":
            # Linear expansion
            return start_margin + (end_margin - start_margin) * progress

        elif trajectory == "contracting":
            # Linear contraction
            return start_margin - (start_margin - end_margin) * progress

        else:
            raise ValueError(f"Unknown trajectory: {trajectory}")

    def get_terminal_fcff(self) -> float:
        """
        Get terminal year FCFF (for terminal value calculation).

        Returns:
            FCFF from final forecast year
        """
        if not self.projections:
            raise ValueError("No projections generated yet. Call generate_projections() first.")

        final_year = max(self.projections.keys())
        return self.projections[final_year]['fcff']

    def to_dict(self) -> Dict[int, dict]:
        """Export projections as dictionary"""
        return self.projections

    def get_summary_stats(self) -> dict:
        """
        Get summary statistics across all projections.

        Returns:
            dict with CAGR, avg margins, total FCFF, etc.
        """
        if not self.projections:
            return {}

        years = sorted(self.projections.keys())

        # Revenue CAGR
        first_year_revenue = self.projections[years[0]]['revenue']
        last_year_revenue = self.projections[years[-1]]['revenue']
        n_years = len(years)
        revenue_cagr = (last_year_revenue / first_year_revenue) ** (1 / n_years) - 1

        # Average EBIT margin
        avg_ebit_margin = sum(self.projections[y]['ebit_margin'] for y in years) / len(years)

        # Total FCFF
        total_fcff = sum(self.projections[y]['fcff'] for y in years)

        # Growth rate ranges by stage
        stage_growth_ranges = {}
        for stage in self.config.stages:
            stage_years = [y for y in years if stage.start_year <= y <= stage.end_year]
            if stage_years:
                growth_rates = [self.projections[y]['revenue_growth'] for y in stage_years]
                stage_growth_ranges[stage.name] = {
                    'min': min(growth_rates),
                    'max': max(growth_rates),
                    'avg': sum(growth_rates) / len(growth_rates)
                }

        return {
            'revenue_cagr': revenue_cagr,
            'avg_ebit_margin': avg_ebit_margin,
            'total_fcff': total_fcff,
            'forecast_years': n_years,
            'stage_growth_ranges': stage_growth_ranges,
            'final_year_fcff': self.projections[years[-1]]['fcff'],
            'final_year_revenue': last_year_revenue
        }


def calculate_multistage_dcf(projections: Dict[int, dict],
                            terminal_growth: float,
                            wacc: float,
                            diluted_shares: float,
                            net_debt: float = 0) -> dict:
    """
    Calculate DCF valuation from multi-stage projections.

    Args:
        projections: Dictionary of year-by-year projections
        terminal_growth: Perpetual growth rate
        wacc: Weighted average cost of capital
        diluted_shares: Diluted shares outstanding
        net_debt: Net debt (debt - cash), default 0

    Returns:
        dict with enterprise value, equity value, value per share, etc.
    """
    # Validate inputs
    if wacc <= terminal_growth:
        raise ValueError(f"WACC ({wacc*100:.1f}%) must exceed terminal growth ({terminal_growth*100:.1f}%)")

    if not projections:
        raise ValueError("No projections provided")

    # Discount each year's FCFF to present value
    pv_fcff_by_year = {}
    total_pv_fcff = 0

    for year, data in projections.items():
        fcff = data['fcff']
        discount_factor = (1 + wacc) ** year
        pv = fcff / discount_factor

        pv_fcff_by_year[year] = pv
        total_pv_fcff += pv

    # Calculate terminal value
    final_year = max(projections.keys())
    final_fcff = projections[final_year]['fcff']

    # Terminal FCF (growing at terminal rate)
    terminal_fcf = final_fcff * (1 + terminal_growth)

    # Terminal value using Gordon Growth Model
    # TV = FCF_(n+1) / (WACC - g)
    terminal_value = terminal_fcf / (wacc - terminal_growth)

    # Present value of terminal value
    pv_terminal_value = terminal_value / ((1 + wacc) ** final_year)

    # Enterprise value = PV of explicit forecasts + PV of terminal value
    enterprise_value = total_pv_fcff + pv_terminal_value

    # Equity value = Enterprise value - Net debt
    equity_value = enterprise_value - net_debt

    # Value per share
    value_per_share = equity_value / diluted_shares if diluted_shares > 0 else 0

    return {
        'enterprise_value': enterprise_value,
        'pv_fcff_explicit': total_pv_fcff,
        'pv_terminal_value': pv_terminal_value,
        'terminal_value': terminal_value,
        'terminal_value_pct': pv_terminal_value / enterprise_value * 100 if enterprise_value > 0 else 0,
        'equity_value': equity_value,
        'net_debt': net_debt,
        'diluted_shares': diluted_shares,
        'value_per_share': value_per_share,
        'wacc': wacc,
        'terminal_growth': terminal_growth,
        'pv_by_year': pv_fcff_by_year,
        'forecast_years': final_year
    }


if __name__ == '__main__':
    # Test the multi-stage DCF engine
    print("=" * 80)
    print("Multi-Stage DCF Engine - Test Run")
    print("=" * 80)

    # Sample historical data
    historical_data = {
        'revenue': 400e9,
        'ebit': 100e9,
        'tax_rate': 0.21,
        'revenue_growth_3yr': 0.25
    }

    # Create a two-stage configuration
    stages = [
        Stage(
            stage_number=1,
            name="High Growth",
            start_year=1,
            end_year=5,
            duration=5,
            revenue_growth_start=0.25,
            revenue_growth_end=0.12,
            growth_decline_type="exponential",
            ebit_margin_start=0.25,
            ebit_margin_end=0.28,
            margin_trajectory="expanding",
            capex_pct_revenue=0.12,
            nwc_pct_delta_revenue=0.025,
            sbc_pct_revenue=0.05,
            da_pct_revenue=0.06
        ),
        Stage(
            stage_number=2,
            name="Stable Growth",
            start_year=6,
            end_year=10,
            duration=5,
            revenue_growth_start=0.12,
            revenue_growth_end=0.04,
            growth_decline_type="linear",
            ebit_margin_start=0.28,
            ebit_margin_end=0.28,
            margin_trajectory="stable",
            capex_pct_revenue=0.08,
            nwc_pct_delta_revenue=0.02,
            sbc_pct_revenue=0.03,
            da_pct_revenue=0.07
        )
    ]

    config = MultiStageDCFConfig(
        model_type=DCFModelType.TWO_STAGE,
        stages=stages,
        terminal_growth_rate=0.025,
        wacc=0.10
    )

    # Validate
    is_valid, error = config.validate()
    print(f"\nConfiguration Valid: {is_valid}")
    if not is_valid:
        print(f"Error: {error}")

    # Generate projections
    print("\nGenerating projections...")
    engine = MultiStageProjectionEngine(config, historical_data)
    projections = engine.generate_projections()

    print(f"Generated {len(projections)} years of projections")

    # Show sample years
    print("\nSample Projections:")
    for year in [1, 5, 6, 10]:
        p = projections[year]
        print(f"\nYear {year} ({p['stage_name']}):")
        print(f"  Revenue: ${p['revenue']/1e9:.1f}B (growth: {p['revenue_growth']*100:.1f}%)")
        print(f"  EBIT: ${p['ebit']/1e9:.1f}B (margin: {p['ebit_margin']*100:.1f}%)")
        print(f"  FCFF: ${p['fcff']/1e9:.1f}B")

    # Calculate valuation
    print("\nCalculating DCF valuation...")
    dcf_result = calculate_multistage_dcf(
        projections=projections,
        terminal_growth=0.025,
        wacc=0.10,
        diluted_shares=10e9,
        net_debt=50e9
    )

    print(f"\nValuation Results:")
    print(f"  Enterprise Value: ${dcf_result['enterprise_value']/1e9:.1f}B")
    print(f"  PV of Explicit Forecasts: ${dcf_result['pv_fcff_explicit']/1e9:.1f}B")
    print(f"  PV of Terminal Value: ${dcf_result['pv_terminal_value']/1e9:.1f}B")
    print(f"  Terminal Value %: {dcf_result['terminal_value_pct']:.1f}%")
    print(f"  Equity Value: ${dcf_result['equity_value']/1e9:.1f}B")
    print(f"  Value per Share: ${dcf_result['value_per_share']:.2f}")

    print("\n" + "=" * 80)
    print("✅ Multi-Stage DCF Engine Test Complete")
    print("=" * 80)
