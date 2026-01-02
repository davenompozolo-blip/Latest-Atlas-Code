"""
DCF Regime Overlay for ATLAS Terminal v11.0

Adjusts DCF valuation inputs based on market regime:
- WACC adjustment (risk premium overlay)
- Terminal growth adjustment (economic outlook)
- Provides regime-aware conservative/aggressive valuations

Philosophy:
"Value in context - market conditions matter for cost of capital and growth expectations"

Author: ATLAS Development Team
Version: 1.0.0
"""

from typing import Dict, Optional
from regime_detector import QuantitativeRegimeDetector


class DCFRegimeOverlay:
    """
    Applies market regime adjustments to DCF inputs (WACC and terminal growth).

    Key Concepts:
    1. RISK-ON: Lower risk premium → Lower WACC, Higher terminal growth
    2. RISK-OFF: Higher risk premium → Higher WACC, Lower terminal growth
    3. TRANSITIONAL: Moderate adjustments
    4. NEUTRAL: Minimal adjustments

    Adjustments are applied as additive basis points (bps) to maintain transparency.
    """

    def __init__(self):
        self.regime_detector = QuantitativeRegimeDetector()

        # WACC adjustments (in basis points)
        # Positive = increase WACC (more conservative)
        # Negative = decrease WACC (more aggressive)
        self.wacc_adjustments = {
            'risk_on': -50,      # -50 bps: Lower risk premium in strong market
            'neutral': 0,         # 0 bps: No adjustment
            'transitional': 25,   # +25 bps: Slight caution
            'risk_off': 100       # +100 bps: Higher risk premium in weak market
        }

        # Terminal growth adjustments (in basis points)
        # Positive = increase growth (more aggressive)
        # Negative = decrease growth (more conservative)
        self.terminal_growth_adjustments = {
            'risk_on': 25,        # +25 bps: Optimistic long-term outlook
            'neutral': 0,         # 0 bps: No adjustment
            'transitional': -10,  # -10 bps: Slightly conservative
            'risk_off': -50       # -50 bps: Pessimistic long-term outlook
        }

        # Regime explanations
        self.regime_explanations = {
            'risk_on': {
                'wacc': "Risk premium compressed in strong market conditions (-50 bps WACC adjustment)",
                'terminal_growth': "Optimistic long-term economic outlook (+25 bps terminal growth)"
            },
            'risk_off': {
                'wacc': "Risk premium expanded due to market stress (+100 bps WACC adjustment)",
                'terminal_growth': "Conservative long-term assumptions in uncertain environment (-50 bps terminal growth)"
            },
            'transitional': {
                'wacc': "Moderate risk premium increase in uncertain conditions (+25 bps WACC adjustment)",
                'terminal_growth': "Slightly conservative growth assumptions (-10 bps terminal growth)"
            },
            'neutral': {
                'wacc': "No risk premium adjustment in balanced market conditions (0 bps WACC adjustment)",
                'terminal_growth': "No terminal growth adjustment in neutral regime (0 bps)"
            }
        }

    def detect_and_adjust(
        self,
        baseline_wacc: float,
        baseline_terminal_growth: float,
        apply_adjustments: bool = True
    ) -> Dict:
        """
        Detect market regime and apply adjustments to DCF inputs.

        Args:
            baseline_wacc: Baseline WACC (e.g., 0.10 = 10%)
            baseline_terminal_growth: Baseline terminal growth (e.g., 0.025 = 2.5%)
            apply_adjustments: If False, just detect regime but don't adjust

        Returns:
            {
                'regime_info': dict (from regime detector),
                'baseline_wacc': float,
                'baseline_terminal_growth': float,
                'adjusted_wacc': float,
                'adjusted_terminal_growth': float,
                'wacc_adjustment_bps': int,
                'terminal_growth_adjustment_bps': int,
                'wacc_explanation': str,
                'terminal_growth_explanation': str,
                'valuation_impact': str (conservative/aggressive/neutral)
            }
        """
        # Detect market regime
        regime_info = self.regime_detector.detect_regime()
        regime = regime_info['regime']

        # Get adjustments for this regime
        wacc_adj_bps = self.wacc_adjustments[regime]
        tg_adj_bps = self.terminal_growth_adjustments[regime]

        # Apply adjustments if enabled
        if apply_adjustments:
            adjusted_wacc = baseline_wacc + (wacc_adj_bps / 10000)  # Convert bps to decimal
            adjusted_terminal_growth = baseline_terminal_growth + (tg_adj_bps / 10000)
        else:
            adjusted_wacc = baseline_wacc
            adjusted_terminal_growth = baseline_terminal_growth

        # Determine valuation impact
        if regime == 'risk_on':
            valuation_impact = 'AGGRESSIVE'  # Lower WACC + Higher growth = Higher valuation
        elif regime == 'risk_off':
            valuation_impact = 'CONSERVATIVE'  # Higher WACC + Lower growth = Lower valuation
        elif regime == 'transitional':
            valuation_impact = 'MODERATELY CONSERVATIVE'
        else:
            valuation_impact = 'NEUTRAL'

        return {
            'regime_info': regime_info,
            'baseline_wacc': baseline_wacc,
            'baseline_terminal_growth': baseline_terminal_growth,
            'adjusted_wacc': adjusted_wacc,
            'adjusted_terminal_growth': adjusted_terminal_growth,
            'wacc_adjustment_bps': wacc_adj_bps,
            'terminal_growth_adjustment_bps': tg_adj_bps,
            'wacc_explanation': self.regime_explanations[regime]['wacc'],
            'terminal_growth_explanation': self.regime_explanations[regime]['terminal_growth'],
            'valuation_impact': valuation_impact
        }

    def get_adjustment_summary(self, regime: str) -> Dict[str, str]:
        """
        Get a summary of what adjustments would be applied for a given regime.

        Useful for displaying regime impact before running DCF.
        """
        wacc_adj_bps = self.wacc_adjustments[regime]
        tg_adj_bps = self.terminal_growth_adjustments[regime]

        # Format adjustments with +/- sign
        wacc_adj_str = f"{wacc_adj_bps:+d} bps" if wacc_adj_bps != 0 else "No adjustment"
        tg_adj_str = f"{tg_adj_bps:+d} bps" if tg_adj_bps != 0 else "No adjustment"

        return {
            'wacc_adjustment': wacc_adj_str,
            'terminal_growth_adjustment': tg_adj_str,
            'wacc_explanation': self.regime_explanations[regime]['wacc'],
            'terminal_growth_explanation': self.regime_explanations[regime]['terminal_growth']
        }

    def calculate_valuation_sensitivity(
        self,
        baseline_wacc: float,
        baseline_terminal_growth: float
    ) -> Dict:
        """
        Calculate how DCF inputs would change across all possible regimes.

        Useful for scenario analysis: "What if regime changes?"

        Returns dict with regime as key and adjustments as values.
        """
        sensitivity = {}

        for regime in ['risk_on', 'neutral', 'transitional', 'risk_off']:
            wacc_adj_bps = self.wacc_adjustments[regime]
            tg_adj_bps = self.terminal_growth_adjustments[regime]

            adjusted_wacc = baseline_wacc + (wacc_adj_bps / 10000)
            adjusted_terminal_growth = baseline_terminal_growth + (tg_adj_bps / 10000)

            sensitivity[regime] = {
                'adjusted_wacc': adjusted_wacc,
                'adjusted_terminal_growth': adjusted_terminal_growth,
                'wacc_delta_bps': wacc_adj_bps,
                'terminal_growth_delta_bps': tg_adj_bps
            }

        return sensitivity


# Example usage
if __name__ == "__main__":
    # Example: Apply regime overlay to baseline DCF inputs
    overlay = DCFRegimeOverlay()

    # Baseline inputs (hypothetical company)
    baseline_wacc = 0.10  # 10%
    baseline_terminal_growth = 0.025  # 2.5%

    # Detect regime and get adjusted inputs
    result = overlay.detect_and_adjust(
        baseline_wacc=baseline_wacc,
        baseline_terminal_growth=baseline_terminal_growth,
        apply_adjustments=True
    )

    print("=== DCF Regime Overlay ===")
    print(f"Detected Regime: {result['regime_info']['regime_label']}")
    print(f"Confidence: {result['regime_info']['confidence']:.0f}%")
    print()
    print(f"Baseline WACC: {result['baseline_wacc']:.2%}")
    print(f"Adjusted WACC: {result['adjusted_wacc']:.2%} ({result['wacc_adjustment_bps']:+d} bps)")
    print(f"Explanation: {result['wacc_explanation']}")
    print()
    print(f"Baseline Terminal Growth: {result['baseline_terminal_growth']:.2%}")
    print(f"Adjusted Terminal Growth: {result['adjusted_terminal_growth']:.2%} ({result['terminal_growth_adjustment_bps']:+d} bps)")
    print(f"Explanation: {result['terminal_growth_explanation']}")
    print()
    print(f"Valuation Impact: {result['valuation_impact']}")
