"""
ATLAS Terminal - Institutional-Grade DCF Enhancements
======================================================
Professional validation, structural robustness, and Monte Carlo simulation.

Author: Hlobo Nompozolo
Version: 1.0.0
Date: January 2026
"""

import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
import streamlit as st


class DCFAssumptionManager:
    """
    Manages DCF assumptions with dependency tracking.
    Ensures model stays consistent when assumptions change.
    """

    def __init__(self, company_data: Dict, financials: Dict):
        self.company = company_data
        self.financials = financials
        self.assumptions = {}
        self.calculation_cache = {}

    def set(self, key: str, value: Any, manual: bool = True):
        """
        Set assumption and invalidate dependent calculations.

        Args:
            key: Assumption name
            value: New value
            manual: True if analyst-set, False if auto-calculated
        """
        # Store assumption
        self.assumptions[key] = {
            'value': value,
            'manual': manual,
            'updated_at': datetime.now()
        }

        # Clear dependent cache entries
        self._invalidate_dependents(key)

    def get(self, key: str, default: Any = None) -> Any:
        """Get assumption value"""
        return self.assumptions.get(key, {}).get('value', default)

    def is_manual(self, key: str) -> bool:
        """Check if assumption was manually set"""
        return self.assumptions.get(key, {}).get('manual', False)

    def _invalidate_dependents(self, changed_key: str):
        """Clear cached calculations that depend on changed assumption"""

        # Define dependency graph
        dependencies = {
            'revenue_growth': ['projections', 'fcf_projections', 'terminal_value', 'fair_value'],
            'ebitda_margin': ['projections', 'fcf_projections', 'terminal_value', 'fair_value'],
            'tax_rate': ['projections', 'fcf_projections', 'terminal_value', 'fair_value'],
            'capex_pct': ['fcf_projections', 'terminal_value', 'fair_value'],
            'wacc': ['present_values', 'terminal_value', 'fair_value'],
            'terminal_growth': ['terminal_value', 'fair_value'],
            'nwc_change': ['fcf_projections', 'terminal_value', 'fair_value'],
            'depreciation_pct': ['projections', 'fcf_projections'],
        }

        # Clear cache for all dependent calculations
        to_clear = dependencies.get(changed_key, [])
        for cache_key in to_clear:
            if cache_key in self.calculation_cache:
                del self.calculation_cache[cache_key]


class DCFValidator:
    """
    Non-blocking validation for DCF assumptions.
    Flags outliers without restricting analysts.
    """

    # Sector benchmarks
    SECTOR_BENCHMARKS = {
        'Technology': {
            'avg_margin': 0.28,
            'top_quartile_margin': 0.40,
            'avg_growth': 0.15,
            'typical_terminal': 0.025
        },
        'Healthcare': {
            'avg_margin': 0.22,
            'top_quartile_margin': 0.35,
            'avg_growth': 0.10,
            'typical_terminal': 0.025
        },
        'Financial Services': {
            'avg_margin': 0.32,
            'top_quartile_margin': 0.45,
            'avg_growth': 0.08,
            'typical_terminal': 0.025
        },
        'Industrials': {
            'avg_margin': 0.14,
            'top_quartile_margin': 0.22,
            'avg_growth': 0.06,
            'typical_terminal': 0.025
        },
        'Consumer Cyclical': {
            'avg_margin': 0.11,
            'top_quartile_margin': 0.18,
            'avg_growth': 0.07,
            'typical_terminal': 0.025
        },
        'Energy': {
            'avg_margin': 0.18,
            'top_quartile_margin': 0.30,
            'avg_growth': 0.05,
            'typical_terminal': 0.025
        },
        'Utilities': {
            'avg_margin': 0.24,
            'top_quartile_margin': 0.32,
            'avg_growth': 0.03,
            'typical_terminal': 0.025
        },
    }

    def validate_assumptions(self, assumptions: Dict, company: Dict, sector: str) -> Dict:
        """
        Validate assumptions and return warnings (never blocks).

        Returns:
            dict: Validation results with warnings and recommendations
        """
        warnings = []

        # Get assumptions
        rev_growth = assumptions.get('revenue_growth', 0)
        term_growth = assumptions.get('terminal_growth', 0)
        wacc = assumptions.get('wacc', 0.10)
        ebitda_margin = assumptions.get('ebitda_margin', 0)

        # 1. Growth rate check
        if rev_growth > 0.25:
            warnings.append({
                'level': 'caution',
                'assumption': 'revenue_growth',
                'message': f'{rev_growth:.1%} revenue growth is aggressive',
                'context': 'Sustained >25% growth is rare - Amazon averaged 22% over 15 years',
                'recommendation': 'Justify with specific catalysts or reduce to sector average',
                'blocking': False
            })

        # 2. Terminal growth check
        if term_growth > 0.035:
            warnings.append({
                'level': 'warning',
                'assumption': 'terminal_growth',
                'message': f'{term_growth:.1%} exceeds long-term GDP growth',
                'context': 'No company can sustainably grow faster than the economy',
                'recommendation': 'Consider 2.5-3.0% based on historical GDP growth',
                'blocking': False
            })

        # 3. Terminal > near-term growth
        if term_growth >= rev_growth:
            warnings.append({
                'level': 'error',
                'assumption': 'terminal_growth',
                'message': 'Terminal growth should be lower than near-term growth',
                'context': 'Growth rates should decline as companies mature',
                'recommendation': f'Reduce to {rev_growth * 0.3:.1%} or justify acceleration',
                'blocking': False
            })

        # 4. WACC reasonableness
        if wacc < 0.06:
            warnings.append({
                'level': 'caution',
                'assumption': 'wacc',
                'message': f'{wacc:.1%} WACC is below risk-free rate',
                'context': '10-year Treasury yields typically 4-5%',
                'recommendation': 'Verify cost of equity calculation',
                'blocking': False
            })

        if wacc > 0.25:
            warnings.append({
                'level': 'warning',
                'assumption': 'wacc',
                'message': f'{wacc:.1%} WACC is extremely high',
                'context': 'Even high-risk companies rarely exceed 20% WACC',
                'recommendation': 'Double-check calculation or provide justification',
                'blocking': False
            })

        # 5. Sector-specific margin check
        benchmark = self.SECTOR_BENCHMARKS.get(sector, {
            'avg_margin': 0.20,
            'top_quartile_margin': 0.30,
            'avg_growth': 0.08,
            'typical_terminal': 0.025
        })

        if ebitda_margin > benchmark['top_quartile_margin']:
            warnings.append({
                'level': 'caution',
                'assumption': 'ebitda_margin',
                'message': f'{ebitda_margin:.1%} margin exceeds top quartile for {sector}',
                'context': f'Sector average: {benchmark["avg_margin"]:.1%}, Top 25%: {benchmark["top_quartile_margin"]:.1%}',
                'recommendation': 'Justify with competitive advantages or moderate to sector benchmarks',
                'blocking': False
            })

        # Generate summary
        summary = self._generate_summary(warnings)

        return {
            'valid': True,  # Always true - we don't block!
            'warnings': warnings,
            'summary': summary,
            'benchmark': benchmark
        }

    def _generate_summary(self, warnings: List[Dict]) -> str:
        """Generate executive summary of validation"""
        if not warnings:
            return "✅ All assumptions within normal ranges"

        error_count = sum(1 for w in warnings if w['level'] == 'error')
        warning_count = sum(1 for w in warnings if w['level'] == 'warning')
        caution_count = sum(1 for w in warnings if w['level'] == 'caution')

        return f"⚠️ Review {len(warnings)} assumption(s): {error_count} errors, {warning_count} warnings, {caution_count} cautions"


class RobustDCFEngine:
    """
    DCF calculation engine that handles assumption changes gracefully.
    Uses caching and dependency tracking for structural robustness.
    """

    def __init__(self, company_data: Dict, financials: Dict):
        self.assumptions = DCFAssumptionManager(company_data, financials)
        self.validator = DCFValidator()
        self.company = company_data
        self.financials = financials

    def calculate(self, method: str = 'FCFF', multistage: bool = False) -> Dict:
        """
        Main calculation method with automatic caching.

        Args:
            method: Valuation method ('FCFF', 'FCFE', etc.)
            multistage: Use multistage projections

        Returns:
            dict: Comprehensive valuation results
        """
        try:
            # Validate assumptions (non-blocking)
            validation = self.validator.validate_assumptions(
                {k: v['value'] for k, v in self.assumptions.assumptions.items()},
                self.company,
                self.company.get('sector', 'Technology')
            )

            # Build projections (uses cache if assumptions unchanged)
            if multistage:
                projections = self._get_or_calc('multistage_projections',
                                               self._build_multistage_projections)
            else:
                projections = self._get_or_calc('projections',
                                               self._build_simple_projections)

            # Calculate FCF (uses cache)
            fcf_projections = self._get_or_calc('fcf_projections',
                                               lambda: self._calculate_fcf(projections))

            # Calculate terminal value (uses cache)
            terminal_fcf = fcf_projections[-1] if fcf_projections else 0
            terminal_value = self._get_or_calc('terminal_value',
                                              lambda: self._calculate_terminal_value(terminal_fcf))

            # Calculate present values
            wacc = self.assumptions.get('wacc', 0.10)
            pv_fcf = self._calc_pv(fcf_projections, wacc)
            pv_terminal = terminal_value / ((1 + wacc) ** len(projections))

            # Calculate EV and equity value
            enterprise_value = pv_fcf + pv_terminal
            equity_value = self._ev_to_equity(enterprise_value)

            # Calculate per-share value
            shares = self.assumptions.get('diluted_shares',
                                         self.company.get('shares_outstanding', 1e9))
            fair_value = equity_value / shares if shares > 0 else 0

            # Return comprehensive results
            return {
                'success': True,
                'fair_value': fair_value,
                'enterprise_value': enterprise_value,
                'equity_value': equity_value,
                'pv_fcf': pv_fcf,
                'pv_terminal': pv_terminal,
                'terminal_value': terminal_value,
                'terminal_pct': pv_terminal / enterprise_value if enterprise_value > 0 else 0,
                'projections': projections,
                'fcf_projections': fcf_projections,
                'validation': validation,
                'method': method,
                'assumptions_used': {k: v['value'] for k, v in self.assumptions.assumptions.items()},
                'timestamp': datetime.now()
            }

        except Exception as e:
            # Graceful error handling
            return {
                'success': False,
                'error': str(e),
                'error_type': type(e).__name__,
                'partial_results': self.assumptions.calculation_cache,
                'validation': validation if 'validation' in locals() else None
            }

    def _get_or_calc(self, cache_key: str, calc_func):
        """Get from cache or calculate if not cached"""
        if cache_key not in self.assumptions.calculation_cache:
            self.assumptions.calculation_cache[cache_key] = calc_func()
        return self.assumptions.calculation_cache[cache_key]

    def _build_simple_projections(self) -> List[Dict]:
        """Build 5-year revenue/EBITDA/EBIT projections"""
        base_revenue = self.financials.get('revenue', 0)
        growth_rate = self.assumptions.get('revenue_growth', 0.08)
        ebitda_margin = self.assumptions.get('ebitda_margin', 0.20)
        da_pct = self.assumptions.get('depreciation_pct', 0.05)

        projections = []

        for year in range(1, 6):
            revenue = base_revenue * ((1 + growth_rate) ** year)
            ebitda = revenue * ebitda_margin
            da = revenue * da_pct
            ebit = ebitda - da

            projections.append({
                'year': year,
                'revenue': revenue,
                'ebitda': ebitda,
                'depreciation': da,
                'ebit': ebit
            })

        return projections

    def _build_multistage_projections(self) -> List[Dict]:
        """Build multistage projections (placeholder)"""
        # This would integrate with existing multistage logic
        return self._build_simple_projections()

    def _calculate_fcf(self, projections: List[Dict]) -> List[float]:
        """Calculate FCF from projections"""
        tax_rate = self.assumptions.get('tax_rate', 0.21)
        capex_pct = self.assumptions.get('capex_pct', 0.05)
        nwc_change = self.assumptions.get('nwc_change', 0)

        fcf_list = []

        for proj in projections:
            nopat = proj['ebit'] * (1 - tax_rate)
            capex = proj['revenue'] * capex_pct

            fcf = nopat + proj['depreciation'] - capex - nwc_change
            fcf_list.append(fcf)

        return fcf_list

    def _calculate_terminal_value(self, terminal_fcf: float) -> float:
        """Calculate terminal value using perpetuity growth"""
        wacc = self.assumptions.get('wacc', 0.10)
        term_growth = self.assumptions.get('terminal_growth', 0.025)

        if wacc <= term_growth:
            # Invalid - WACC must be > terminal growth
            return 0

        return terminal_fcf * (1 + term_growth) / (wacc - term_growth)

    def _calc_pv(self, cash_flows: List[float], discount_rate: float) -> float:
        """Calculate present value of cash flows"""
        pv = 0
        for year, cf in enumerate(cash_flows, start=1):
            pv += cf / ((1 + discount_rate) ** year)
        return pv

    def _ev_to_equity(self, enterprise_value: float) -> float:
        """Convert enterprise value to equity value"""
        net_debt = self.financials.get('total_debt', 0) - self.financials.get('cash', 0)
        return enterprise_value - net_debt


class MonteCarloDCF:
    """
    Monte Carlo simulation for DCF sensitivity analysis.
    Shows valuation ranges instead of point estimates.
    """

    def run_simulation(self, engine: RobustDCFEngine, n_simulations: int = 1000) -> Dict:
        """
        Run Monte Carlo simulation varying key assumptions.

        Args:
            engine: RobustDCFEngine instance
            n_simulations: Number of simulation runs

        Returns:
            dict: Simulation results with statistics
        """
        # Define assumption distributions
        assumptions_dist = {
            'revenue_growth': {
                'base': engine.assumptions.get('revenue_growth', 0.08),
                'std': 0.03,  # ±3% std dev
                'distribution': 'normal'
            },
            'terminal_growth': {
                'base': engine.assumptions.get('terminal_growth', 0.025),
                'std': 0.005,  # ±0.5% std dev
                'distribution': 'normal'
            },
            'wacc': {
                'base': engine.assumptions.get('wacc', 0.10),
                'std': 0.01,  # ±1% std dev
                'distribution': 'normal'
            },
            'ebitda_margin': {
                'base': engine.assumptions.get('ebitda_margin', 0.20),
                'std': 0.02,  # ±2% std dev
                'distribution': 'normal'
            }
        }

        results = []

        # Store original assumptions
        original_assumptions = {k: engine.assumptions.get(k) for k in assumptions_dist.keys()}

        for i in range(n_simulations):
            # Sample from distributions
            sampled_assumptions = {}

            for key, dist in assumptions_dist.items():
                if dist['distribution'] == 'normal':
                    value = np.random.normal(dist['base'], dist['std'])

                    # Clip to reasonable ranges
                    if key == 'terminal_growth':
                        value = np.clip(value, 0.01, 0.05)
                    elif key == 'wacc':
                        value = np.clip(value, 0.05, 0.20)
                    elif key == 'ebitda_margin':
                        value = np.clip(value, 0, 0.60)
                    elif key == 'revenue_growth':
                        value = np.clip(value, -0.20, 0.50)

                    sampled_assumptions[key] = value

            # Run DCF with sampled assumptions
            for key, value in sampled_assumptions.items():
                engine.assumptions.set(key, value, manual=False)

            dcf_result = engine.calculate()

            if dcf_result['success']:
                results.append({
                    'fair_value': dcf_result['fair_value'],
                    'assumptions': sampled_assumptions.copy()
                })

        # Restore original assumptions
        for key, value in original_assumptions.items():
            if value is not None:
                engine.assumptions.set(key, value, manual=True)

        # Calculate statistics
        fair_values = [r['fair_value'] for r in results if r['fair_value'] > 0]

        if not fair_values:
            return {'success': False, 'error': 'No valid simulation results'}

        return {
            'success': True,
            'simulations': results,
            'statistics': {
                'mean': np.mean(fair_values),
                'median': np.median(fair_values),
                'std': np.std(fair_values),
                'min': np.min(fair_values),
                'max': np.max(fair_values),
                'p5': np.percentile(fair_values, 5),
                'p25': np.percentile(fair_values, 25),
                'p75': np.percentile(fair_values, 75),
                'p95': np.percentile(fair_values, 95),
            },
            'n_successful': len(fair_values),
            'n_failed': n_simulations - len(fair_values)
        }


# Utility functions for Streamlit integration

def display_validation_warnings(validation: Dict):
    """Display validation warnings in Streamlit UI"""
    if not validation or not validation.get('warnings'):
        st.success("✅ All assumptions within normal ranges")
        return

    st.markdown("### 🔍 Assumption Review")
    st.info(validation['summary'])

    for warning in validation['warnings']:
        icon = {'error': '🔴', 'warning': '🟡', 'caution': '🟢'}[warning['level']]

        with st.expander(f"{icon} {warning['message']}"):
            st.markdown(f"**Context:** {warning['context']}")
            st.markdown(f"**Recommendation:** {warning['recommendation']}")
            st.caption("💡 High-conviction cases can override with proper documentation")


def display_monte_carlo_results(mc_results: Dict, current_price: float):
    """Display Monte Carlo simulation results in Streamlit"""
    if not mc_results.get('success'):
        st.error(f"Simulation failed: {mc_results.get('error', 'Unknown error')}")
        return

    stats = mc_results['statistics']

    st.markdown("### 🎲 Monte Carlo Simulation Results")
    st.caption(f"Based on {mc_results['n_successful']} successful simulations")

    # Display percentiles
    col1, col2, col3, col4, col5 = st.columns(5)

    with col1:
        st.metric("P5 (Bear)", f"${stats['p5']:.2f}")
    with col2:
        st.metric("P25", f"${stats['p25']:.2f}")
    with col3:
        st.metric("Median", f"${stats['median']:.2f}")
    with col4:
        st.metric("P75", f"${stats['p75']:.2f}")
    with col5:
        st.metric("P95 (Bull)", f"${stats['p95']:.2f}")

    # Interpretation
    if current_price < stats['p25']:
        st.success(f"💡 Current price (${current_price:.2f}) is below 75% of simulations → Potentially undervalued")
    elif current_price > stats['p75']:
        st.warning(f"⚠️ Current price (${current_price:.2f}) is above 75% of simulations → Potentially overvalued")
    else:
        st.info(f"📊 Current price (${current_price:.2f}) is within the 25th-75th percentile range")
