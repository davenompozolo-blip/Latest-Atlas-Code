"""
Stage Templates for Multi-Stage DCF Models

Pre-configured stage templates for different company profiles to make
multi-stage DCF setup easier. Each template provides intelligent defaults
based on company type and lifecycle stage.

Available Templates:
1. Hypergrowth Tech - 3-stage for cloud/SaaS companies
2. Growth Company - 2-stage for established growth companies
3. Mature Company - 1-stage for stable businesses
4. Turnaround - 2-stage for recovery situations

Author: ATLAS Development Team
Version: 1.0.0
"""

from typing import List, Dict
from analytics.multistage_dcf import Stage


class StageTemplates:
    """
    Pre-configured stage templates for different company profiles.
    """

    @staticmethod
    def get_template(template_name: str, historical_data: dict) -> List[Stage]:
        """
        Get a pre-configured stage template.

        Args:
            template_name: Name of template (hypergrowth_tech, growth_company,
                          mature_company, turnaround)
            historical_data: Company's historical financials

        Returns:
            List of Stage objects configured for the template
        """
        # Calculate current metrics from historical data
        current_revenue_growth = historical_data.get('revenue_growth_3yr', 0.15)
        base_revenue = historical_data.get('revenue', 1)
        base_ebit = historical_data.get('ebit', base_revenue * 0.20)
        current_ebit_margin = base_ebit / base_revenue if base_revenue > 0 else 0.20

        if template_name == "hypergrowth_tech":
            return StageTemplates._hypergrowth_tech_template(
                current_revenue_growth, current_ebit_margin
            )

        elif template_name == "growth_company":
            return StageTemplates._growth_company_template(
                current_revenue_growth, current_ebit_margin
            )

        elif template_name == "mature_company":
            return StageTemplates._mature_company_template(
                current_ebit_margin
            )

        elif template_name == "turnaround":
            return StageTemplates._turnaround_template(
                current_ebit_margin
            )

        else:
            raise ValueError(f"Unknown template: {template_name}")

    @staticmethod
    def _hypergrowth_tech_template(current_growth: float, current_margin: float) -> List[Stage]:
        """
        Three-stage model for hypergrowth tech companies.

        Stage 1 (Years 1-3): Hypergrowth phase
        - 40% → 30% revenue growth
        - Expanding margins as scale benefits kick in
        - High CapEx and SBC

        Stage 2 (Years 4-7): Transition to maturity
        - 30% → 12% revenue growth (rapid deceleration)
        - Continued margin expansion
        - Normalizing investments

        Stage 3 (Years 8-10): Mature growth
        - 12% → 5% revenue growth
        - Stable mature margins
        - Lower CapEx as growth moderates
        """
        # Cap initial growth at 40% for realism
        stage1_start_growth = min(max(current_growth, 0.25), 0.40)

        return [
            Stage(
                stage_number=1,
                name="Hypergrowth",
                start_year=1,
                end_year=3,
                duration=3,
                revenue_growth_start=stage1_start_growth,
                revenue_growth_end=0.30,
                growth_decline_type="exponential",
                ebit_margin_start=current_margin,
                ebit_margin_end=min(current_margin + 0.05, 0.35),
                margin_trajectory="expanding",
                capex_pct_revenue=0.15,  # High investment phase
                nwc_pct_delta_revenue=0.03,
                sbc_pct_revenue=0.08,  # Heavy SBC in hypergrowth
                da_pct_revenue=0.05
            ),
            Stage(
                stage_number=2,
                name="Transition",
                start_year=4,
                end_year=7,
                duration=4,
                revenue_growth_start=0.30,
                revenue_growth_end=0.12,
                growth_decline_type="exponential",
                ebit_margin_start=min(current_margin + 0.05, 0.35),
                ebit_margin_end=min(current_margin + 0.08, 0.38),
                margin_trajectory="expanding",
                capex_pct_revenue=0.12,
                nwc_pct_delta_revenue=0.025,
                sbc_pct_revenue=0.06,
                da_pct_revenue=0.06
            ),
            Stage(
                stage_number=3,
                name="Mature Growth",
                start_year=8,
                end_year=10,
                duration=3,
                revenue_growth_start=0.12,
                revenue_growth_end=0.05,
                growth_decline_type="linear",
                ebit_margin_start=min(current_margin + 0.08, 0.38),
                ebit_margin_end=min(current_margin + 0.08, 0.38),
                margin_trajectory="stable",
                capex_pct_revenue=0.08,  # Lower maintenance CapEx
                nwc_pct_delta_revenue=0.02,
                sbc_pct_revenue=0.04,
                da_pct_revenue=0.07
            )
        ]

    @staticmethod
    def _growth_company_template(current_growth: float, current_margin: float) -> List[Stage]:
        """
        Two-stage model for established growth companies.

        Stage 1 (Years 1-5): High growth phase
        - 25% → 12% revenue growth
        - Expanding margins through operating leverage
        - Moderate CapEx

        Stage 2 (Years 6-10): Stable growth phase
        - 12% → 4% revenue growth
        - Stable mature margins
        - Normalized investments
        """
        # Cap initial growth at 25% for established companies
        stage1_start_growth = min(max(current_growth, 0.15), 0.25)

        return [
            Stage(
                stage_number=1,
                name="High Growth",
                start_year=1,
                end_year=5,
                duration=5,
                revenue_growth_start=stage1_start_growth,
                revenue_growth_end=0.12,
                growth_decline_type="exponential",
                ebit_margin_start=current_margin,
                ebit_margin_end=min(current_margin + 0.05, 0.30),
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
                ebit_margin_start=min(current_margin + 0.05, 0.30),
                ebit_margin_end=min(current_margin + 0.05, 0.30),
                margin_trajectory="stable",
                capex_pct_revenue=0.08,
                nwc_pct_delta_revenue=0.02,
                sbc_pct_revenue=0.03,
                da_pct_revenue=0.07
            )
        ]

    @staticmethod
    def _mature_company_template(current_margin: float) -> List[Stage]:
        """
        Single-stage model for mature companies.

        Stage 1 (Years 1-10): Mature steady state
        - 6% → 3% revenue growth (GDP-like)
        - Stable margins
        - Maintenance CapEx
        - Low SBC
        """
        return [
            Stage(
                stage_number=1,
                name="Mature",
                start_year=1,
                end_year=10,
                duration=10,
                revenue_growth_start=0.06,
                revenue_growth_end=0.03,
                growth_decline_type="linear",
                ebit_margin_start=current_margin,
                ebit_margin_end=current_margin,
                margin_trajectory="stable",
                capex_pct_revenue=0.06,  # Maintenance CapEx
                nwc_pct_delta_revenue=0.01,  # Minimal NWC needs
                sbc_pct_revenue=0.02,
                da_pct_revenue=0.07
            )
        ]

    @staticmethod
    def _turnaround_template(current_margin: float) -> List[Stage]:
        """
        Two-stage model for turnaround situations.

        Stage 1 (Years 1-4): Recovery phase
        - 8% → 15% revenue growth (ACCELERATING)
        - Rapidly expanding margins as operations improve
        - Moderate CapEx

        Stage 2 (Years 5-10): Normalized phase
        - 15% → 5% revenue growth
        - Continued margin expansion to normalized levels
        - Steady-state investments
        """
        # Use lower of current margin or 5% as starting point (distressed)
        stage1_start_margin = max(min(current_margin, 0.10), 0.05)

        return [
            Stage(
                stage_number=1,
                name="Recovery",
                start_year=1,
                end_year=4,
                duration=4,
                revenue_growth_start=0.08,
                revenue_growth_end=0.15,
                growth_decline_type="linear",  # Linear acceleration
                ebit_margin_start=stage1_start_margin,
                ebit_margin_end=0.15,
                margin_trajectory="expanding",
                capex_pct_revenue=0.08,
                nwc_pct_delta_revenue=0.015,
                sbc_pct_revenue=0.02,
                da_pct_revenue=0.08
            ),
            Stage(
                stage_number=2,
                name="Normalized",
                start_year=5,
                end_year=10,
                duration=6,
                revenue_growth_start=0.15,
                revenue_growth_end=0.05,
                growth_decline_type="exponential",
                ebit_margin_start=0.15,
                ebit_margin_end=0.18,
                margin_trajectory="expanding",
                capex_pct_revenue=0.07,
                nwc_pct_delta_revenue=0.02,
                sbc_pct_revenue=0.03,
                da_pct_revenue=0.07
            )
        ]

    @staticmethod
    def get_template_description(template_name: str) -> str:
        """
        Get human-readable description of template.

        Args:
            template_name: Name of template

        Returns:
            Description string
        """
        descriptions = {
            "hypergrowth_tech": "3-Stage: 40%→30%→12%→5% | For cloud/SaaS companies in hypergrowth phase",
            "growth_company": "2-Stage: 25%→12%→4% | For established growth companies",
            "mature_company": "1-Stage: 6%→3% | For stable, mature businesses",
            "turnaround": "2-Stage: Recovery then normalization | For companies in turnaround situations"
        }
        return descriptions.get(template_name, "Custom configuration")

    @staticmethod
    def list_templates() -> Dict[str, str]:
        """
        List all available templates with descriptions.

        Returns:
            dict mapping template_name to description
        """
        return {
            "hypergrowth_tech": StageTemplates.get_template_description("hypergrowth_tech"),
            "growth_company": StageTemplates.get_template_description("growth_company"),
            "mature_company": StageTemplates.get_template_description("mature_company"),
            "turnaround": StageTemplates.get_template_description("turnaround")
        }

    @staticmethod
    def get_template_stages_count(template_name: str) -> int:
        """Get number of stages in a template"""
        stage_counts = {
            "hypergrowth_tech": 3,
            "growth_company": 2,
            "mature_company": 1,
            "turnaround": 2
        }
        return stage_counts.get(template_name, 0)

    @staticmethod
    def recommend_template(historical_data: dict) -> str:
        """
        Recommend a template based on company characteristics.

        Args:
            historical_data: Company's historical financials

        Returns:
            Recommended template name
        """
        current_growth = historical_data.get('revenue_growth_3yr', 0.10)
        base_revenue = historical_data.get('revenue', 1e9)
        base_ebit = historical_data.get('ebit', base_revenue * 0.15)
        current_margin = base_ebit / base_revenue if base_revenue > 0 else 0.15

        # Decision tree for recommendation
        if current_growth > 0.30:
            return "hypergrowth_tech"
        elif current_growth > 0.15:
            return "growth_company"
        elif current_margin < 0.10:
            return "turnaround"
        else:
            return "mature_company"


if __name__ == '__main__':
    # Test stage templates
    print("=" * 80)
    print("Stage Templates - Test Run")
    print("=" * 80)

    # Sample historical data
    historical_data = {
        'revenue': 50e9,
        'ebit': 10e9,
        'revenue_growth_3yr': 0.35
    }

    print("\nHistorical Data:")
    print(f"  Revenue: ${historical_data['revenue']/1e9:.1f}B")
    print(f"  EBIT: ${historical_data['ebit']/1e9:.1f}B")
    print(f"  3-Year Growth: {historical_data['revenue_growth_3yr']*100:.1f}%")

    # Get recommendation
    recommended = StageTemplates.recommend_template(historical_data)
    print(f"\nRecommended Template: {recommended}")
    print(f"  {StageTemplates.get_template_description(recommended)}")

    # List all templates
    print("\nAll Available Templates:")
    for name, desc in StageTemplates.list_templates().items():
        stages_count = StageTemplates.get_template_stages_count(name)
        print(f"  • {name} ({stages_count} stages)")
        print(f"    {desc}")

    # Test each template
    print("\n" + "=" * 80)
    print("Testing Each Template")
    print("=" * 80)

    for template_name in ["hypergrowth_tech", "growth_company", "mature_company", "turnaround"]:
        print(f"\n{template_name.upper().replace('_', ' ')}:")
        stages = StageTemplates.get_template(template_name, historical_data)

        for stage in stages:
            print(f"  Stage {stage.stage_number}: {stage.name} (Years {stage.start_year}-{stage.end_year})")
            print(f"    Growth: {stage.revenue_growth_start*100:.1f}% → {stage.revenue_growth_end*100:.1f}%")
            print(f"    EBIT Margin: {stage.ebit_margin_start*100:.1f}% → {stage.ebit_margin_end*100:.1f}%")
            print(f"    CapEx: {stage.capex_pct_revenue*100:.1f}% of revenue")

    print("\n" + "=" * 80)
    print("✅ Stage Templates Test Complete")
    print("=" * 80)
