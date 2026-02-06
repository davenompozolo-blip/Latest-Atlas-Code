"""
ATLAS Terminal - Portfolio Optimization Functions
Extracted from atlas_app.py (Phase 4).
"""
import math
import json
import pickle
import warnings
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st

try:
    import plotly.graph_objects as go
    import plotly.express as px
except ImportError:
    pass

try:
    import yfinance as yf
except ImportError:
    pass

try:
    from scipy import stats
    from scipy.optimize import minimize
except ImportError:
    pass

from app.config import (
    COLORS, CHART_HEIGHT_COMPACT, CHART_HEIGHT_STANDARD,
    CHART_HEIGHT_LARGE, CHART_HEIGHT_DEEP_DIVE, CHART_THEME,
    CACHE_DIR, PORTFOLIO_CACHE, TRADE_HISTORY_CACHE,
    ACCOUNT_HISTORY_CACHE, RISK_FREE_RATE, MARKET_RETURN
)
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator

try:
    from data.instruments import POPULAR_STOCKS, POPULAR_ETFS, GLOBAL_INDICES
except ImportError:
    POPULAR_STOCKS = {}
    POPULAR_ETFS = {}
    GLOBAL_INDICES = {}

try:
    from data.sectors import GICS_SECTORS, GICS_SECTOR_MAPPING, STOCK_SECTOR_OVERRIDES, SPY_SECTOR_WEIGHTS
except ImportError:
    GICS_SECTORS = {}
    GICS_SECTOR_MAPPING = {}
    STOCK_SECTOR_OVERRIDES = {}
    SPY_SECTOR_WEIGHTS = {}

# Shared constants and feature flags
from .constants import EXPERT_WISDOM_RULES

# Cross-module imports (functions used in this file but defined in sibling modules)
from .calculations import (
    calculate_portfolio_max_drawdown,
    calculate_performance_metric,
    calculate_max_risk_contrib_pct,
)


def _lazy_atlas():
    """Lazy import of atlas_app to avoid circular imports."""
    import atlas_app
    return atlas_app


class RiskProfile:
    """
    Translate user risk tolerance into optimization parameters

    Instead of asking users to set 47 parameters, provide 3 clear risk profiles:
    - Conservative: Capital preservation, steady returns
    - Moderate: Balance growth and risk
    - Aggressive: Maximize returns, accept volatility
    """

    PROFILES = {
        'conservative': {
            'name': 'Conservative',
            'description': 'Maximum diversification with capital preservation',
            'philosophy': 'Prioritize diversification - accept 5-10% lower performance for 2-3x more holdings',

            # MUCH STRICTER POSITION LIMITS (Diversification-First)
            'max_position_base': 0.06,         # Max 6% in any single asset (was 15%)
            'typical_position_target': 0.04,   # Aim for 4% positions
            'max_sector_concentration': 0.25,  # Tight sector limits

            # FORCE BROAD DIVERSIFICATION
            'min_diversification': 18,         # Force at least 18 holdings (was 10)
            'target_holdings': 25,             # Aim for 25+ holdings
            'min_position_to_count': 0.02,     # Only count positions >2%

            # VERY TIGHT CONCENTRATION LIMITS
            'max_top_3_concentration': 0.15,   # Top 3 can't exceed 15%
            'max_top_5_concentration': 0.25,   # Top 5 can't exceed 25%
            'max_top_10_concentration': 0.50,  # Top 10 can't exceed 50%

            # RISK DISTRIBUTION
            'max_drawdown_tolerance': 0.15,    # 15% max drawdown
            'turnover_sensitivity': 'low',     # Avoid frequent trading
            'risk_budget_per_asset': 0.08,     # No asset >8% of portfolio risk (was 12%)
            'target_effective_n': 20,          # Target 20 "effective" holdings

            # DIVERSIFICATION PRIORITY
            'acceptable_sharpe_ratio': 0.90,   # Accept 90% of max Sharpe for diversification
            'diversification_priority': 'maximum',

            # PHASE 3: GRADUAL REBALANCING CONSTRAINTS
            'max_turnover_per_rebalance': 0.15,   # Max 15% portfolio turnover per rebalance
            'max_position_change': 0.03,          # Max 3% change per position per rebalance
            'min_trade_threshold': 0.005,         # Don't trade if change < 0.5%
            'rebalance_frequency': 'quarterly',   # Suggested rebalance frequency
        },

        'moderate': {
            'name': 'Moderate',
            'description': 'Strong diversification with balanced growth',
            'philosophy': 'Balance performance and diversification - accept 3-5% lower performance for better diversification',

            # MODERATE POSITION LIMITS (Still Diversified)
            'max_position_base': 0.10,         # Max 10% in any single asset (was 20%)
            'typical_position_target': 0.06,   # Aim for 6% positions
            'max_sector_concentration': 0.35,

            # GOOD DIVERSIFICATION
            'min_diversification': 12,         # Force at least 12 holdings (was 8)
            'target_holdings': 18,             # Aim for 18+ holdings
            'min_position_to_count': 0.025,

            # REASONABLE CONCENTRATION LIMITS
            'max_top_3_concentration': 0.25,   # Top 3 can't exceed 25%
            'max_top_5_concentration': 0.40,   # Top 5 can't exceed 40%
            'max_top_10_concentration': 0.70,  # Top 10 can't exceed 70%

            # RISK DISTRIBUTION
            'max_drawdown_tolerance': 0.25,
            'turnover_sensitivity': 'medium',
            'risk_budget_per_asset': 0.12,     # No asset >12% of portfolio risk
            'target_effective_n': 12,          # Target 12 "effective" holdings

            # DIVERSIFICATION PRIORITY
            'acceptable_sharpe_ratio': 0.95,   # Accept 95% of max Sharpe
            'diversification_priority': 'high',

            # PHASE 3: GRADUAL REBALANCING CONSTRAINTS
            'max_turnover_per_rebalance': 0.25,   # Max 25% portfolio turnover per rebalance
            'max_position_change': 0.05,          # Max 5% change per position per rebalance
            'min_trade_threshold': 0.01,          # Don't trade if change < 1%
            'rebalance_frequency': 'monthly',     # Suggested rebalance frequency
        },

        'aggressive': {
            'name': 'Aggressive',
            'description': 'Growth-focused but still properly diversified',
            'philosophy': 'Allow concentration where justified, but maintain meaningful diversification',

            # STILL REASONABLE LIMITS
            'max_position_base': 0.15,         # Max 15% in any single asset (was 25%)
            'typical_position_target': 0.08,   # Aim for 8% positions
            'max_sector_concentration': 0.50,

            # MEANINGFUL DIVERSIFICATION
            'min_diversification': 10,         # Force at least 10 holdings (was 6)
            'target_holdings': 15,             # Aim for 15+ holdings
            'min_position_to_count': 0.03,

            # LOOSER BUT STILL BOUNDED
            'max_top_3_concentration': 0.35,   # Top 3 can't exceed 35%
            'max_top_5_concentration': 0.55,   # Top 5 can't exceed 55%
            'max_top_10_concentration': 0.85,  # Top 10 can't exceed 85%

            # RISK DISTRIBUTION
            'max_drawdown_tolerance': 0.35,
            'turnover_sensitivity': 'high',
            'risk_budget_per_asset': 0.15,     # No asset >15% of portfolio risk
            'target_effective_n': 10,          # Target 10 "effective" holdings

            # DIVERSIFICATION PRIORITY
            'acceptable_sharpe_ratio': 0.98,   # Accept 98% of max Sharpe
            'diversification_priority': 'moderate',

            # PHASE 3: GRADUAL REBALANCING CONSTRAINTS
            'max_turnover_per_rebalance': 0.40,   # Max 40% portfolio turnover per rebalance
            'max_position_change': 0.08,          # Max 8% change per position per rebalance
            'min_trade_threshold': 0.015,         # Don't trade if change < 1.5%
            'rebalance_frequency': 'weekly',      # Suggested rebalance frequency
        }
    }

    @classmethod
    def get_config(cls, risk_tolerance, strategy_type):
        """
        Get optimization config based on user risk profile + strategy

        This is the KEY translation layer - from user intent to math parameters

        DIVERSIFICATION-FIRST PHILOSOPHY:
        We no longer adjust limits by strategy. Instead, we maintain strict
        diversification requirements and let the two-stage optimization find
        the most diversified solution on the efficient frontier.
        """
        base_config = cls.PROFILES[risk_tolerance].copy()

        # All strategies now use the same diversification-first constraints
        # The two-stage optimizer will find the most diversified solution
        # that achieves acceptable performance for the chosen strategy

        return base_config


class RobustPortfolioOptimizer:
    """
    Optimization that acknowledges we don't know future returns/correlations

    Approach: Generate multiple scenarios, find portfolio that performs well
    across ALL scenarios (not just average)
    """

    def __init__(self, returns_df, confidence_level=0.95):
        self.returns_df = returns_df
        self.confidence_level = confidence_level

    def estimate_returns_with_uncertainty(self):
        """
        Instead of point estimates, get confidence intervals

        Uses bootstrapping to estimate uncertainty in mean returns
        """
        n_bootstrap = 500  # Reduced for performance
        n_samples = len(self.returns_df)

        bootstrap_means = []
        for _ in range(n_bootstrap):
            # Resample with replacement
            sample = self.returns_df.sample(n=n_samples, replace=True)
            bootstrap_means.append(sample.mean())

        bootstrap_means = pd.DataFrame(bootstrap_means)

        return {
            'mean': self.returns_df.mean(),
            'lower_bound': bootstrap_means.quantile((1 - self.confidence_level) / 2),
            'upper_bound': bootstrap_means.quantile((1 + self.confidence_level) / 2),
            'std_error': bootstrap_means.std()
        }

    def estimate_covariance_with_shrinkage(self):
        """
        Sample covariance is noisy - shrink toward diagonal

        Ledoit-Wolf shrinkage: blend sample cov with simple structure
        """
        sample_cov = self.returns_df.cov() * 252

        # Target: diagonal matrix (assume zero correlations)
        target = np.diag(np.diag(sample_cov))

        # Optimal shrinkage intensity (simplified Ledoit-Wolf formula)
        n_samples = len(self.returns_df)
        shrinkage = min(0.5, (n_samples - 2) / (n_samples * (n_samples + 2)))

        # Shrunk covariance
        shrunk_cov = shrinkage * target + (1 - shrinkage) * sample_cov

        return shrunk_cov, shrinkage

    def generate_scenarios(self):
        """
        Generate multiple plausible future scenarios

        Scenarios:
        1. Base case (historical means)
        2. Pessimistic (lower bound returns)
        3. Optimistic (upper bound returns)
        4. High correlation (crisis scenario)
        5. Low correlation (diversification works)
        """
        returns_with_ci = self.estimate_returns_with_uncertainty()
        base_cov, _ = self.estimate_covariance_with_shrinkage()

        scenarios = {
            'base': {
                'returns': returns_with_ci['mean'],
                'cov_matrix': base_cov,
                'probability': 0.40,
                'description': 'Historical averages'
            },

            'pessimistic': {
                'returns': returns_with_ci['lower_bound'],
                'cov_matrix': base_cov * 1.5,  # Higher volatility in downturns
                'probability': 0.20,
                'description': 'Below-average returns, higher volatility'
            },

            'optimistic': {
                'returns': returns_with_ci['upper_bound'],
                'cov_matrix': base_cov * 0.8,
                'probability': 0.20,
                'description': 'Above-average returns, lower volatility'
            },

            'crisis': {
                'returns': returns_with_ci['lower_bound'] * 1.5,
                'cov_matrix': self._increase_correlations(base_cov, target_corr=0.8),
                'probability': 0.10,
                'description': 'Market stress - high correlations'
            },

            'goldilocks': {
                'returns': returns_with_ci['mean'] * 1.2,
                'cov_matrix': self._decrease_correlations(base_cov, target_corr=0.3),
                'probability': 0.10,
                'description': 'Low correlation, steady growth'
            }
        }

        return scenarios

    def _increase_correlations(self, cov_matrix, target_corr=0.8):
        """Simulate crisis scenario with high correlations"""
        corr_matrix = cov_matrix / np.outer(np.sqrt(np.diag(cov_matrix)),
                                            np.sqrt(np.diag(cov_matrix)))

        # Push correlations toward target
        crisis_corr = 0.7 * corr_matrix + 0.3 * target_corr * np.ones_like(corr_matrix)
        np.fill_diagonal(crisis_corr, 1.0)

        # Convert back to covariance
        stds = np.sqrt(np.diag(cov_matrix))
        crisis_cov = np.outer(stds, stds) * crisis_corr

        return crisis_cov

    def _decrease_correlations(self, cov_matrix, target_corr=0.3):
        """Simulate goldilocks scenario with low correlations"""
        corr_matrix = cov_matrix / np.outer(np.sqrt(np.diag(cov_matrix)),
                                            np.sqrt(np.diag(cov_matrix)))

        # Push correlations toward target
        good_corr = 0.5 * corr_matrix + 0.5 * target_corr * np.ones_like(corr_matrix)
        np.fill_diagonal(good_corr, 1.0)

        stds = np.sqrt(np.diag(cov_matrix))
        good_cov = np.outer(stds, stds) * good_corr

        return good_cov


class OptimizationExplainer:
    """
    Translate optimization results into human-readable insights

    Users need to understand:
    1. WHY these weights were chosen
    2. WHAT tradeoffs were made
    3. HOW sensitive is this to assumptions
    """

    def explain_portfolio_weights(self, weights, returns_df, strategy_type, scenarios=None, risk_profile_config=None, peak_performance=None):
        """
        Generate PM-level natural language explanation of optimization results

        PM-LEVEL TRANSPARENCY:
        - WHY each position was chosen (with quantitative support)
        - WHAT tradeoffs were made (explicit cost-benefit)
        - HOW confident we are (uncertainty ranges)
        - WHICH constraints were binding (and why)
        """
        explanations = {}
        tickers = returns_df.columns
        cov_matrix = returns_df.cov() * 252

        # ============================================================
        # 1. EXECUTIVE SUMMARY
        # ============================================================
        effective_n = 1 / np.sum(weights ** 2)
        max_position = np.max(weights)
        top_3_conc = np.sum(np.sort(weights)[-3:])

        port_return = np.sum(returns_df.mean() * weights) * 252
        port_vol = np.sqrt(weights @ cov_matrix @ weights)
        sharpe = (port_return - 0.02) / port_vol if port_vol > 0 else 0

        try:
            max_dd = calculate_portfolio_max_drawdown(weights, returns_df)
        except:
            max_dd = 0

        explanations['executive_summary'] = {
            'title': f'{strategy_type.upper().replace("_", " ")} OPTIMIZATION',
            'metrics': {
                'Expected Return': f"{port_return:.1%}",
                'Expected Volatility': f"{port_vol:.1%}",
                'Sharpe Ratio': f"{sharpe:.2f}",
                'Max Drawdown': f"{max_dd:.1%}",
                'Effective Holdings': f"{effective_n:.1f}",
                'Largest Position': f"{max_position:.1%}",
                'Top 3 Concentration': f"{top_3_conc:.1%}"
            }
        }

        # ============================================================
        # 2. TOP HOLDINGS WITH DETAILED REASONING
        # ============================================================
        top_holdings = []
        top_5_idx = np.argsort(weights)[-5:][::-1]
        for idx in top_5_idx:
            ticker = tickers[idx]
            weight = weights[idx]

            # Enhanced reasoning with quantitative support
            reasons = self._explain_single_holding_enhanced(
                ticker, weight, returns_df, cov_matrix, strategy_type
            )

            top_holdings.append({
                'ticker': ticker,
                'weight': weight,
                'weight_pct': f"{weight:.1%}",
                'reasons': reasons
            })

        explanations['top_holdings'] = top_holdings

        # ============================================================
        # 3. TRADEOFF ANALYSIS (Critical for PM trust)
        # ============================================================
        tradeoffs = []

        if risk_profile_config and peak_performance:
            # Calculate what was sacrificed for diversification
            current_performance = sharpe
            performance_cost = (1 - current_performance/peak_performance) * 100 if peak_performance > 0 else 0

            tradeoffs.append(
                f"Accepted {performance_cost:.1f}% lower Sharpe ratio to achieve "
                f"{effective_n:.0f} effective holdings (vs concentrated peak)"
            )

            if 'max_drawdown_tolerance' in risk_profile_config:
                dd_limit = risk_profile_config['max_drawdown_tolerance']
                dd_margin = dd_limit - max_dd
                tradeoffs.append(
                    f"Maximum drawdown: {max_dd:.1%} (within {dd_limit:.1%} limit, "
                    f"{dd_margin:.1%} margin of safety)"
                )

        explanations['tradeoffs'] = tradeoffs

        # ============================================================
        # 4. CONSTRAINT ANALYSIS (Which constraints were binding?)
        # ============================================================
        binding_constraints = []

        if risk_profile_config:
            # Check position limits
            if max_position > risk_profile_config.get('max_position_base', 1) * 0.95:
                binding_constraints.append(
                    f"Position limit binding: Largest position at {max_position:.1%} "
                    f"(limit: {risk_profile_config['max_position_base']:.1%})"
                )

            # Check concentration limits
            if top_3_conc > risk_profile_config.get('max_top_3_concentration', 1) * 0.95:
                binding_constraints.append(
                    f"Top-3 concentration binding: {top_3_conc:.1%} "
                    f"(limit: {risk_profile_config['max_top_3_concentration']:.1%})"
                )

            # Check drawdown constraint
            if 'max_drawdown_tolerance' in risk_profile_config:
                dd_limit = risk_profile_config['max_drawdown_tolerance']
                if max_dd > dd_limit * 0.90:
                    binding_constraints.append(
                        f"Drawdown constraint active: {max_dd:.1%} "
                        f"(limit: {dd_limit:.1%})"
                    )

        explanations['binding_constraints'] = binding_constraints if binding_constraints else [
            "No constraints binding - optimizer found unconstrained optimum"
        ]

        # ============================================================
        # 5. RISK BREAKDOWN (Where is risk coming from?)
        # ============================================================
        risk_contribs = self._calculate_risk_contributions(weights, cov_matrix)
        top_risk_idx = np.argsort(risk_contribs)[-5:][::-1]

        explanations['risk_breakdown'] = [
            {
                'ticker': tickers[i],
                'weight': f"{weights[i]:.1%}",
                'risk_contribution': f"{risk_contribs[i]:.1%}",
                'risk_to_weight_ratio': f"{(risk_contribs[i]/weights[i]):.2f}x" if weights[i] > 0 else "N/A"
            }
            for i in top_risk_idx
        ]

        # ============================================================
        # 6. UNCERTAINTY & ASSUMPTIONS
        # ============================================================
        explanations['assumptions'] = [
            f"Historical returns based on {len(returns_df)} trading days",
            "Assumes returns are normally distributed (actual returns may have fat tails)",
            "Past performance does not guarantee future results",
            "Correlations and volatilities may change during market stress"
        ]

        return explanations

    def _explain_single_holding_enhanced(self, ticker, weight, returns_df, cov_matrix, strategy_type):
        """
        PM-LEVEL EXPLANATION: WHY was this specific holding chosen?
        Provide quantitative support for every reason
        """
        returns = returns_df[ticker]
        ann_return = returns.mean() * 252
        ann_vol = returns.std() * np.sqrt(252)
        sharpe = ann_return / ann_vol if ann_vol > 0 else 0

        # Correlation with rest of portfolio
        correlations = returns_df.corr()[ticker].drop(ticker)
        avg_corr = correlations.mean()
        max_corr = correlations.max()

        # Risk contribution
        risk_contribs = self._calculate_risk_contributions(np.ones(len(returns_df.columns))/len(returns_df.columns), cov_matrix)

        reasons = []

        # Quantitative reasons based on strategy
        if strategy_type == 'max_sharpe':
            reasons.append(f"Return: {ann_return:.1%}/year, Vol: {ann_vol:.1%}, Sharpe: {sharpe:.2f}")
            if avg_corr < 0.6:
                reasons.append(f"Good diversifier (avg corr: {avg_corr:.2f}, max: {max_corr:.2f})")
            elif avg_corr >= 0.6:
                reasons.append(f"Higher correlation to portfolio (avg: {avg_corr:.2f}) justified by strong Sharpe")

        elif strategy_type == 'min_volatility':
            reasons.append(f"Low volatility: {ann_vol:.1%}/year")
            reasons.append(f"Avg correlation: {avg_corr:.2f} provides portfolio diversification")

        elif strategy_type == 'max_return':
            reasons.append(f"Strong historical return: {ann_return:.1%}/year")
            if ann_vol > 0.30:
                reasons.append(f"High volatility ({ann_vol:.1%}) tolerated for return potential")

        # Weight-based reasoning
        if weight > 0.10:
            reasons.append(f"Large {weight:.1%} allocation reflects strong contribution to objective")
        elif weight < 0.05:
            reasons.append(f"Modest {weight:.1%} allocation for diversification/risk balance")

        return reasons

    def _explain_single_holding(self, ticker, weight, returns_df, strategy_type):
        """WHY was this specific holding chosen?"""
        returns = returns_df[ticker]
        ann_return = returns.mean() * 252
        ann_vol = returns.std() * np.sqrt(252)
        sharpe = ann_return / ann_vol if ann_vol > 0 else 0

        avg_corr = returns_df.corr()[ticker].drop(ticker).mean()

        reasons = []

        if strategy_type == 'max_sharpe':
            if sharpe > 1.0:
                reasons.append(f"Strong risk-adjusted returns (Sharpe: {sharpe:.2f})")
            if avg_corr < 0.5:
                reasons.append(f"Low correlation with other holdings ({avg_corr:.2f})")

        elif strategy_type == 'min_volatility':
            if ann_vol < 0.20:
                reasons.append(f"Low volatility ({ann_vol:.1%} annual)")
            if avg_corr < 0.6:
                reasons.append(f"Provides diversification (avg corr: {avg_corr:.2f})")

        elif strategy_type == 'max_return':
            if ann_return > 0.15:
                reasons.append(f"High historical return ({ann_return:.1%} annual)")

        if weight > 0.15:
            reasons.append(f"Large allocation reflects strong fundamentals")

        if len(reasons) == 0:
            reasons.append("Contributes to overall portfolio optimization")

        return reasons

    def _calculate_risk_contributions(self, weights, cov_matrix):
        """Calculate risk contribution of each asset"""
        port_vol = np.sqrt(weights @ cov_matrix @ weights)

        if port_vol == 0:
            return np.zeros(len(weights))

        # Marginal contribution to risk
        marginal_contrib = (cov_matrix @ weights) / port_vol

        # Total risk contribution
        risk_contrib = weights * marginal_contrib

        return risk_contrib

    def generate_sensitivity_analysis(self, weights, returns_df, scenarios):
        """How sensitive is this portfolio to different scenarios?"""
        sensitivity = {}

        for scenario_name, scenario in scenarios.items():
            port_return = weights @ scenario['returns'] * 252
            port_vol = np.sqrt(weights @ scenario['cov_matrix'] @ weights)
            sharpe = port_return / port_vol if port_vol > 0 else 0

            sensitivity[scenario_name] = {
                'description': scenario['description'],
                'expected_return': port_return * 100,
                'volatility': port_vol * 100,
                'sharpe_ratio': sharpe,
                'probability': scenario['probability']
            }

        return sensitivity

    def identify_red_flags(self, weights, returns_df, config):
        """Automated sanity checks - warn user if something looks off"""
        red_flags = []
        yellow_flags = []

        # 1. Over-concentration
        max_weight = np.max(weights)
        if max_weight > 0.30:
            red_flags.append(f"⚠️ Single position at {max_weight:.1%} - consider reducing")
        elif max_weight > 0.25:
            yellow_flags.append(f"⚡ Largest position at {max_weight:.1%} - monitor closely")

        # 2. Insufficient diversification
        effective_n = 1 / np.sum(weights ** 2)
        if effective_n < 5:
            red_flags.append(f"⚠️ Very concentrated ({effective_n:.1f} effective holdings)")
        elif effective_n < 7:
            yellow_flags.append(f"⚡ Moderate concentration ({effective_n:.1f} effective holdings)")

        # 3. Check for extreme allocations
        tiny_positions = np.sum((weights > 0) & (weights < 0.02))
        if tiny_positions > 3:
            yellow_flags.append(f"⚡ {tiny_positions} very small positions (<2%) - consider consolidating")

        return {'red_flags': red_flags, 'yellow_flags': yellow_flags}


def optimize_two_stage_diversification_first(
    returns_df,
    strategy_type,
    risk_profile_config,
    risk_free_rate=0.02,
    verbose=True,
    target_leverage=1.0
):
    """
    TWO-STAGE DIVERSIFICATION-FIRST OPTIMIZATION

    STAGE 1: Find peak performance (the "optimal" concentrated solution)
    STAGE 2: Maximize diversification while maintaining acceptable performance

    This finds the MOST DIVERSIFIED portfolio on the efficient frontier,
    not the most concentrated one.

    FIXED v11.0: Added leverage support

    Args:
        returns_df: Historical returns
        strategy_type: 'max_sharpe', 'min_volatility', etc.
        risk_profile_config: Configuration from RiskProfile
        risk_free_rate: Risk-free rate for Sharpe calculation
        verbose: Print optimization details
        target_leverage: Target portfolio leverage (default 1.0 = no leverage)

    Returns:
        Optimized weights (most diversified solution on efficient frontier)
    """
    from scipy.optimize import minimize

    n_assets = len(returns_df.columns)
    cov_matrix = returns_df.cov() * 252

    # ========================================
    # STAGE 1: FIND PEAK PERFORMANCE
    # ========================================

    if verbose:
        print(f"\n{'='*60}")
        print(f"STAGE 1: Finding peak performance...")
        print(f"{'='*60}")

    # Use relaxed constraints to find true optimum
    peak_weights = optimize_for_peak_performance(
        returns_df, strategy_type, risk_free_rate, max_position=0.30, target_leverage=target_leverage
    )

    peak_performance = calculate_performance_metric(
        peak_weights, returns_df, strategy_type, risk_free_rate
    )

    peak_effective_n = 1 / np.sum(peak_weights ** 2)
    peak_max_position = np.max(peak_weights)

    if verbose:
        print(f"Peak performance: {peak_performance:.4f}")
        print(f"Effective holdings: {peak_effective_n:.1f}")
        print(f"Max position: {peak_max_position:.1%}")

    # ========================================
    # STAGE 2: MAXIMIZE DIVERSIFICATION
    # ========================================

    if verbose:
        print(f"\n{'='*60}")
        print(f"STAGE 2: Maximizing diversification...")
        print(f"{'='*60}")

    # Set acceptable performance threshold
    min_acceptable_performance = peak_performance * risk_profile_config['acceptable_sharpe_ratio']

    if verbose:
        print(f"Min acceptable performance: {min_acceptable_performance:.4f}")
        print(f"(={risk_profile_config['acceptable_sharpe_ratio']:.0%} of peak)")

    def diversification_objective(weights):
        """
        Objective: MINIMIZE concentration (MAXIMIZE diversification)
        Using Herfindahl-Hirschman Index (HHI)
        Lower HHI = more diversified
        """
        hhi = np.sum(weights ** 2)

        # Penalize too few meaningful positions
        meaningful_positions = np.sum(weights >= risk_profile_config['min_position_to_count'])
        if meaningful_positions < risk_profile_config['target_holdings']:
            sparsity_penalty = (risk_profile_config['target_holdings'] - meaningful_positions) * 0.01
        else:
            sparsity_penalty = 0

        return hhi + sparsity_penalty

    # FIXED v11.0: Leverage constraint
    def leverage_constraint_stage2(w, target_lev):
        """Leverage = sum of absolute weights"""
        return np.abs(w).sum() - target_lev

    # Build constraints
    constraints = [
        {'type': 'eq', 'fun': leverage_constraint_stage2, 'args': (target_leverage,)},

        # CRITICAL: Performance must stay above threshold
        {'type': 'ineq',
         'fun': lambda w: calculate_performance_metric(w, returns_df, strategy_type, risk_free_rate) - min_acceptable_performance},

        # Minimum meaningful holdings
        {'type': 'ineq',
         'fun': lambda w: np.sum(w >= risk_profile_config['min_position_to_count']) - risk_profile_config['min_diversification']},

        # Top 3 concentration limit (adjusted for leverage)
        {'type': 'ineq',
         'fun': lambda w: risk_profile_config['max_top_3_concentration'] * target_leverage - np.sum(np.sort(w)[-3:])},

        # Top 5 concentration limit (adjusted for leverage)
        {'type': 'ineq',
         'fun': lambda w: risk_profile_config['max_top_5_concentration'] * target_leverage - np.sum(np.sort(w)[-5:])},

        # Risk contribution limit
        {'type': 'ineq',
         'fun': lambda w: risk_profile_config['risk_budget_per_asset'] - calculate_max_risk_contrib_pct(w, returns_df)},
    ]

    # DRAWDOWN AWARENESS: Add max drawdown constraint for conservative (and moderate) profiles
    if 'max_drawdown_tolerance' in risk_profile_config:
        max_dd_allowed = risk_profile_config['max_drawdown_tolerance']
        if verbose:
            print(f"Adding drawdown constraint: Max {max_dd_allowed:.1%} drawdown")

        constraints.append({
            'type': 'ineq',
            'fun': lambda w: max_dd_allowed - calculate_portfolio_max_drawdown(w, returns_df)
        })

    # Volatility-adjusted position limits
    volatilities = returns_df.std() * np.sqrt(252)
    median_vol = volatilities.median()
    vol_scalars = np.clip(median_vol / volatilities, 0.5, 1.5)

    position_limits = risk_profile_config['max_position_base'] * vol_scalars
    position_limits = np.clip(position_limits, 0.01, risk_profile_config['max_position_base'])

    bounds = [(0, limit) for limit in position_limits]

    # Initial guess: Equal weight scaled by leverage (most diversified starting point)
    initial_guess = np.ones(n_assets) * (target_leverage / n_assets)

    # Optimize for DIVERSIFICATION subject to performance constraint
    result = minimize(
        diversification_objective,
        initial_guess,
        method='SLSQP',
        bounds=bounds,
        constraints=constraints,
        options={'maxiter': 2000, 'ftol': 1e-10}
    )

    if not result.success:
        if verbose:
            print(f"Warning: {result.message}")
            print("Falling back to peak performance portfolio...")
        return peak_weights

    diversified_weights = result.x

    # Clean up tiny positions
    min_position = risk_profile_config.get('min_position_to_count', 0.02) / 2
    diversified_weights[diversified_weights < min_position] = 0

    # Renormalize to target leverage
    current_leverage = np.abs(diversified_weights).sum()
    if current_leverage > 0:
        diversified_weights = diversified_weights * (target_leverage / current_leverage)
    else:
        diversified_weights = peak_weights

    # ========================================
    # STAGE 3: VALIDATE & COMPARE
    # ========================================

    final_performance = calculate_performance_metric(
        diversified_weights, returns_df, strategy_type, risk_free_rate
    )
    performance_ratio = final_performance / peak_performance

    final_effective_n = 1 / np.sum(diversified_weights ** 2)
    final_max_position = np.max(diversified_weights)
    final_top_3 = np.sum(np.sort(diversified_weights)[-3:])

    # Calculate drawdowns for both portfolios
    peak_drawdown = calculate_portfolio_max_drawdown(peak_weights, returns_df)
    final_drawdown = calculate_portfolio_max_drawdown(diversified_weights, returns_df)

    if verbose:
        print(f"\n{'='*60}")
        print(f"DIVERSIFICATION OPTIMIZATION RESULTS")
        print(f"{'='*60}")
        print(f"\nPeak Performance Portfolio:")
        print(f"  Performance: {peak_performance:.4f}")
        print(f"  Effective Holdings: {peak_effective_n:.1f}")
        print(f"  Largest Position: {peak_max_position:.1%}")
        print(f"  Top 3 Total: {np.sum(np.sort(peak_weights)[-3:]):.1%}")
        print(f"  Max Drawdown: {peak_drawdown:.1%}")

        print(f"\nDiversified Portfolio:")
        print(f"  Performance: {final_performance:.4f} ({performance_ratio:.1%} of peak)")
        print(f"  Effective Holdings: {final_effective_n:.1f} ({final_effective_n/peak_effective_n:.1f}x more)")
        print(f"  Largest Position: {final_max_position:.1%}")
        print(f"  Top 3 Total: {final_top_3:.1%}")
        print(f"  Max Drawdown: {final_drawdown:.1%}")

        # Show drawdown constraint status if applicable
        if 'max_drawdown_tolerance' in risk_profile_config:
            max_dd_allowed = risk_profile_config['max_drawdown_tolerance']
            dd_margin = max_dd_allowed - final_drawdown
            print(f"  Drawdown Margin: {dd_margin:.1%} (limit: {max_dd_allowed:.1%})")

        print(f"\nTRADEOFF:")
        print(f"  Diversification Increase: {final_effective_n/peak_effective_n:.1f}x")
        print(f"  Performance Cost: {(1-performance_ratio)*100:.1f}%")
        print(f"  Drawdown Improvement: {(peak_drawdown-final_drawdown):.1%}")
        print(f"{'='*60}\n")

    return diversified_weights


def optimize_for_peak_performance(returns_df, strategy_type, risk_free_rate, max_position=0.30, target_leverage=1.0):
    """
    Find peak performance with minimal constraints

    This is STAGE 1 - find the best possible performance

    FIXED v11.0: Added leverage support
    """
    from scipy.optimize import minimize

    n_assets = len(returns_df.columns)

    # Use the original optimization functions with relaxed constraints
    if strategy_type == 'max_sharpe':
        weights = optimize_max_sharpe(returns_df, risk_free_rate, max_position, 0.01, target_leverage)
    elif strategy_type == 'min_volatility':
        weights = optimize_min_volatility(returns_df, max_position, 0.01, target_leverage)
    elif strategy_type == 'max_return':
        weights = optimize_max_return(returns_df, max_position, 0.01, target_leverage)
    elif strategy_type == 'risk_parity':
        weights = optimize_risk_parity(returns_df, max_position, 0.01, target_leverage)
    else:
        # Default: equal weight scaled by leverage
        weights = pd.Series(np.ones(n_assets) * (target_leverage / n_assets), index=returns_df.columns)

    return weights.values if isinstance(weights, pd.Series) else weights


def optimize_max_sharpe(returns_df, risk_free_rate, max_position=0.25, min_position=0.02, target_leverage=1.0):
    """
    Optimize for maximum Sharpe ratio with production-grade constraints

    FIXED v10.3: Removed aggressive penalties that were causing equal-weight portfolios.
    Now uses proper constraints and gentle regularization.

    FIXED v11.0: Added leverage constraint support. Leverage = sum of absolute weights.

    NOTE: This function is now primarily used for STAGE 1 (peak finding).
    For diversification-first optimization, use optimize_two_stage_diversification_first()

    Args:
        target_leverage: Target portfolio leverage (default 1.0 = no leverage)
                        1.0x = sum(abs(weights)) = 1.0 (long only, fully invested)
                        2.0x = sum(abs(weights)) = 2.0 (2x leverage)
    """
    from scipy.optimize import minimize

    n_assets = len(returns_df.columns)

    def neg_sharpe(weights):
        port_return = np.sum(returns_df.mean() * weights) * 252
        port_vol = np.sqrt(np.dot(weights.T, np.dot(returns_df.cov() * 252, weights)))
        sharpe = (port_return - risk_free_rate) / port_vol if port_vol > 0 else 0

        # GENTLE regularization - tiny penalty to avoid extreme concentration
        # Scaled to be ~1% of typical Sharpe ratio magnitude
        hhi = np.sum(weights ** 2)
        gentle_regularization = 0.01 * (hhi - 1/n_assets)

        return -sharpe + gentle_regularization

    # FIXED v11.0: Leverage constraint using absolute sum of weights
    def leverage_constraint(w, target_lev):
        """Leverage = sum of absolute weights"""
        return np.abs(w).sum() - target_lev

    constraints = [
        {'type': 'eq', 'fun': leverage_constraint, 'args': (target_leverage,)}
    ]
    bounds = tuple((0, max_position) for _ in range(n_assets))
    initial_guess = np.array([target_leverage/n_assets] * n_assets)  # Scale initial guess by leverage

    result = minimize(neg_sharpe, initial_guess, method='SLSQP', bounds=bounds, constraints=constraints,
                     options={'maxiter': 1000, 'ftol': 1e-9})

    # Post-processing: Remove tiny positions
    optimized_weights = result.x.copy()
    optimized_weights[optimized_weights < min_position] = 0

    # Renormalize to target leverage
    current_leverage = np.abs(optimized_weights).sum()
    if current_leverage > 0:
        optimized_weights = optimized_weights * (target_leverage / current_leverage)
    else:
        optimized_weights = np.array([target_leverage/n_assets] * n_assets)

    return pd.Series(optimized_weights, index=returns_df.columns)


def optimize_min_volatility(returns_df, max_position=0.25, min_position=0.02, target_leverage=1.0):
    """
    Optimize for minimum volatility with production-grade constraints

    FIXED v10.3: Removed aggressive penalties that were causing equal-weight portfolios.
    Now uses proper constraints and gentle regularization.

    FIXED v11.0: Added leverage constraint support. Leverage = sum of absolute weights.

    Args:
        target_leverage: Target portfolio leverage (default 1.0 = no leverage)
    """
    from scipy.optimize import minimize

    n_assets = len(returns_df.columns)

    def portfolio_vol(weights):
        vol = np.sqrt(np.dot(weights.T, np.dot(returns_df.cov() * 252, weights)))

        # GENTLE regularization - tiny penalty to avoid extreme concentration
        # Scaled to be ~0.5% of typical volatility magnitude
        hhi = np.sum(weights ** 2)
        gentle_regularization = 0.001 * (hhi - 1/n_assets)

        return vol + gentle_regularization

    # FIXED v11.0: Leverage constraint using absolute sum of weights
    def leverage_constraint(w, target_lev):
        """Leverage = sum of absolute weights"""
        return np.abs(w).sum() - target_lev

    constraints = [
        {'type': 'eq', 'fun': leverage_constraint, 'args': (target_leverage,)}
    ]
    bounds = tuple((0, max_position) for _ in range(n_assets))
    initial_guess = np.array([target_leverage/n_assets] * n_assets)

    result = minimize(portfolio_vol, initial_guess, method='SLSQP', bounds=bounds, constraints=constraints,
                     options={'maxiter': 1000, 'ftol': 1e-9})

    # Post-processing: Remove tiny positions
    optimized_weights = result.x.copy()
    optimized_weights[optimized_weights < min_position] = 0

    # Renormalize to target leverage
    current_leverage = np.abs(optimized_weights).sum()
    if current_leverage > 0:
        optimized_weights = optimized_weights * (target_leverage / current_leverage)
    else:
        optimized_weights = np.array([target_leverage/n_assets] * n_assets)

    return pd.Series(optimized_weights, index=returns_df.columns)


def optimize_max_return(returns_df, max_position=0.25, min_position=0.02, target_leverage=1.0):
    """
    Optimize for maximum return with production-grade constraints

    FIXED v10.3: Removed aggressive penalties that were causing equal-weight portfolios.
    Now uses proper constraints and gentle regularization.

    FIXED v11.0: Added leverage constraint support. Leverage = sum of absolute weights.

    Args:
        target_leverage: Target portfolio leverage (default 1.0 = no leverage)
    """
    from scipy.optimize import minimize

    n_assets = len(returns_df.columns)
    mean_returns = returns_df.mean() * 252

    def neg_return(weights):
        portfolio_return = np.sum(mean_returns * weights)

        # GENTLE regularization - tiny penalty to avoid extreme concentration
        # Scaled to be ~1% of typical return magnitude
        hhi = np.sum(weights ** 2)
        gentle_regularization = 0.005 * (hhi - 1/n_assets)

        return -portfolio_return + gentle_regularization

    # FIXED v11.0: Leverage constraint using absolute sum of weights
    def leverage_constraint(w, target_lev):
        """Leverage = sum of absolute weights"""
        return np.abs(w).sum() - target_lev

    constraints = [
        {'type': 'eq', 'fun': leverage_constraint, 'args': (target_leverage,)}
    ]
    bounds = tuple((0, max_position) for _ in range(n_assets))
    initial_guess = np.array([target_leverage/n_assets] * n_assets)

    result = minimize(neg_return, initial_guess, method='SLSQP', bounds=bounds, constraints=constraints,
                     options={'maxiter': 1000, 'ftol': 1e-9})

    # Post-processing: Remove tiny positions
    optimized_weights = result.x.copy()
    optimized_weights[optimized_weights < min_position] = 0

    # Renormalize to target leverage
    current_leverage = np.abs(optimized_weights).sum()
    if current_leverage > 0:
        optimized_weights = optimized_weights * (target_leverage / current_leverage)
    else:
        optimized_weights = np.array([target_leverage/n_assets] * n_assets)

    return pd.Series(optimized_weights, index=returns_df.columns)


def optimize_risk_parity(returns_df, max_position=0.25, min_position=0.02, target_leverage=1.0):
    """
    Risk parity optimization with production-grade constraints

    FIXED v10.3: Removed aggressive penalties that were causing equal-weight portfolios.
    Now uses pure risk parity objective with proper constraints.

    FIXED v11.0: Added leverage constraint support. Leverage = sum of absolute weights.

    Args:
        target_leverage: Target portfolio leverage (default 1.0 = no leverage)
    """
    from scipy.optimize import minimize

    n_assets = len(returns_df.columns)
    cov_matrix = returns_df.cov() * 252

    def risk_parity_objective(weights):
        port_vol = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        if port_vol == 0:
            return 1e10
        marginal_contrib = np.dot(cov_matrix, weights) / port_vol
        risk_contrib = weights * marginal_contrib
        target_risk = port_vol / n_assets
        risk_parity_error = np.sum((risk_contrib - target_risk) ** 2)

        return risk_parity_error

    # FIXED v11.0: Leverage constraint using absolute sum of weights
    def leverage_constraint(w, target_lev):
        """Leverage = sum of absolute weights"""
        return np.abs(w).sum() - target_lev

    constraints = [
        {'type': 'eq', 'fun': leverage_constraint, 'args': (target_leverage,)}
    ]
    bounds = tuple((0, max_position) for _ in range(n_assets))
    initial_guess = np.array([target_leverage/n_assets] * n_assets)

    result = minimize(risk_parity_objective, initial_guess, method='SLSQP', bounds=bounds, constraints=constraints,
                     options={'maxiter': 1000, 'ftol': 1e-9})

    # Post-processing: Remove tiny positions
    optimized_weights = result.x.copy()
    optimized_weights[optimized_weights < min_position] = 0

    # Renormalize to target leverage
    current_leverage = np.abs(optimized_weights).sum()
    if current_leverage > 0:
        optimized_weights = optimized_weights * (target_leverage / current_leverage)
    else:
        optimized_weights = np.array([target_leverage/n_assets] * n_assets)

    return pd.Series(optimized_weights, index=returns_df.columns)


def check_expert_wisdom(optimal_weights, tickers, returns_df, risk_profile_config=None):
    """
    Check portfolio against expert wisdom rules and return violations/warnings.

    Args:
        optimal_weights: numpy array of optimized weights
        tickers: list of ticker symbols
        returns_df: DataFrame of historical returns
        risk_profile_config: optional risk profile configuration

    Returns:
        dict: Contains 'violations' (list of rule violations) and 'score' (wisdom score 0-100)
    """
    violations = []
    n_assets = len(optimal_weights)

    # Rule 1: Single stock concentration
    max_weight = np.max(optimal_weights)
    if max_weight > EXPERT_WISDOM_RULES['single_stock_concentration']['threshold']:
        max_ticker = tickers[np.argmax(optimal_weights)]
        violations.append({
            'rule': 'single_stock_concentration',
            'severity': 'high',
            'message': f"⚠️ **{max_ticker}** has {max_weight*100:.1f}% weight - exceeds 25% single stock limit",
            'ticker': max_ticker,
            'value': max_weight
        })

    # Rule 2: Top 3 concentration
    sorted_weights = np.sort(optimal_weights)[::-1]
    top_3_weight = sorted_weights[:3].sum()
    if top_3_weight > EXPERT_WISDOM_RULES['top_3_concentration']['threshold']:
        top_3_idx = np.argsort(optimal_weights)[::-1][:3]
        top_3_tickers = [tickers[i] for i in top_3_idx]
        violations.append({
            'rule': 'top_3_concentration',
            'severity': 'medium',
            'message': f"⚠️ Top 3 holdings ({', '.join(top_3_tickers)}) = {top_3_weight*100:.1f}% - exceeds 50% limit",
            'tickers': top_3_tickers,
            'value': top_3_weight
        })

    # Rule 3: Minimum diversification (count meaningful positions)
    meaningful_positions = np.sum(optimal_weights >= 0.02)  # 2% threshold
    min_required = risk_profile_config.get('min_diversification', 10) if risk_profile_config else 10
    if meaningful_positions < min_required:
        violations.append({
            'rule': 'minimum_diversification',
            'severity': 'medium',
            'message': f"⚠️ Only {meaningful_positions} meaningful positions (>2%) - target is {min_required}+",
            'value': meaningful_positions
        })

    # Rule 4: Tiny positions warning
    tiny_positions = []
    for i, w in enumerate(optimal_weights):
        if 0 < w < EXPERT_WISDOM_RULES['tiny_position_warning']['threshold']:
            tiny_positions.append(tickers[i])
    if len(tiny_positions) > 3:
        violations.append({
            'rule': 'tiny_position_warning',
            'severity': 'low',
            'message': f"💡 {len(tiny_positions)} positions below 1% - consider consolidating: {', '.join(tiny_positions[:5])}{'...' if len(tiny_positions) > 5 else ''}",
            'tickers': tiny_positions,
            'value': len(tiny_positions)
        })

    # Rule 5: High volatility exposure
    if returns_df is not None and len(returns_df) > 0:
        vols = returns_df.std() * np.sqrt(252)
        high_vol_tickers = []
        for i, ticker in enumerate(tickers):
            if ticker in vols.index:
                if vols[ticker] > EXPERT_WISDOM_RULES['high_volatility_exposure']['threshold']:
                    if optimal_weights[i] > 0.10:  # Only warn if >10% position
                        high_vol_tickers.append((ticker, vols[ticker], optimal_weights[i]))

        if high_vol_tickers:
            for ticker, vol, weight in high_vol_tickers:
                violations.append({
                    'rule': 'high_volatility_exposure',
                    'severity': 'medium',
                    'message': f"⚠️ **{ticker}** has {vol*100:.0f}% volatility with {weight*100:.1f}% weight - consider reducing",
                    'ticker': ticker,
                    'value': {'volatility': vol, 'weight': weight}
                })

    # Calculate wisdom score (0-100)
    high_violations = sum(1 for v in violations if v['severity'] == 'high')
    medium_violations = sum(1 for v in violations if v['severity'] == 'medium')
    low_violations = sum(1 for v in violations if v['severity'] == 'low')

    # Scoring: start at 100, deduct for violations
    score = 100
    score -= high_violations * 20
    score -= medium_violations * 10
    score -= low_violations * 5
    score = max(0, min(100, score))

    return {
        'violations': violations,
        'score': score,
        'high_count': high_violations,
        'medium_count': medium_violations,
        'low_count': low_violations
    }


def get_wisdom_grade(score):
    """Convert wisdom score to letter grade with description."""
    if score >= 90:
        return 'A', 'Excellent', '🟢'
    elif score >= 80:
        return 'B', 'Good', '🟢'
    elif score >= 70:
        return 'C', 'Acceptable', '🟡'
    elif score >= 60:
        return 'D', 'Needs Improvement', '🟠'
    else:
        return 'F', 'Poor', '🔴'


def build_realistic_constraints(current_weights, risk_profile_config, target_leverage=1.0):
    """
    Build optimization constraints that enforce gradual portfolio changes.

    Key Constraints:
    1. Turnover Limit: Total portfolio change cannot exceed max_turnover_per_rebalance
    2. Leverage: Sum of absolute weights must equal target leverage

    Args:
        current_weights: numpy array of current portfolio weights
        risk_profile_config: dict from RiskProfile.get_config()
        target_leverage: Target portfolio leverage (default 1.0)

    Returns:
        list: scipy.optimize constraint dicts
    """
    max_turnover = risk_profile_config.get('max_turnover_per_rebalance', 0.25)

    constraints = []

    # 1. Leverage constraint: sum of absolute weights = target
    def leverage_constraint(w):
        return np.abs(w).sum() - target_leverage
    constraints.append({'type': 'eq', 'fun': leverage_constraint})

    # 2. Turnover constraint: total change limited
    # Turnover = sum of |new_weight - old_weight| / 2 (divide by 2 because buying = selling)
    def turnover_constraint(w):
        turnover = np.sum(np.abs(w - current_weights)) / 2
        return max_turnover - turnover  # Must be >= 0
    constraints.append({'type': 'ineq', 'fun': turnover_constraint})

    return constraints


def build_position_bounds(current_weights, risk_profile_config, n_assets):
    """
    Build position bounds that respect maximum change per position.

    Instead of allowing 0% to 25% for every position, this function creates
    bounds like: current_weight ± max_position_change, capped at [0, max_position].

    This prevents the optimizer from making drastic changes to any single position.

    Args:
        current_weights: numpy array of current portfolio weights
        risk_profile_config: dict from RiskProfile.get_config()
        n_assets: number of assets in portfolio

    Returns:
        tuple: bounds for scipy.optimize (list of (min, max) tuples)
    """
    max_position = risk_profile_config.get('max_position_base', 0.25)
    max_change = risk_profile_config.get('max_position_change', 0.05)
    min_trade = risk_profile_config.get('min_trade_threshold', 0.01)

    bounds = []
    for i in range(n_assets):
        curr_w = current_weights[i] if i < len(current_weights) else 0

        # Calculate allowed range: current ± max_change
        lower = max(0.0, curr_w - max_change)
        upper = min(max_position, curr_w + max_change)

        # If current weight is below min_trade threshold, allow going to 0
        if curr_w < min_trade:
            lower = 0.0

        bounds.append((lower, upper))

    return tuple(bounds)


def apply_trade_threshold(optimal_weights, current_weights, min_trade_threshold):
    """
    Apply minimum trade threshold to avoid tiny, uneconomical trades.

    If the weight change is smaller than min_trade_threshold, keep current weight.
    This prevents generating trades for $50 changes that cost $10 in commissions.

    Args:
        optimal_weights: numpy array of optimized weights
        current_weights: numpy array of current weights
        min_trade_threshold: minimum change to trigger a trade

    Returns:
        numpy array: adjusted optimal weights with small changes zeroed out
    """
    adjusted = optimal_weights.copy()

    for i in range(len(optimal_weights)):
        weight_change = abs(optimal_weights[i] - current_weights[i])
        if weight_change < min_trade_threshold:
            adjusted[i] = current_weights[i]

    # Re-normalize to ensure weights sum to target
    total = adjusted.sum()
    if total > 0:
        adjusted = adjusted * (optimal_weights.sum() / total)

    return adjusted


def validate_portfolio_realism(weights, returns_df, strategy_type):
    """
    Score portfolio on realism scale 0-100

    Checks:
    - Diversification level
    - Position sizes
    - Risk concentration
    """
    score = 100
    issues = []

    # 1. Diversification check
    effective_n = 1 / np.sum(weights ** 2)
    if effective_n < 5:
        score -= 30
        issues.append("Very low diversification")
    elif effective_n < 7:
        score -= 15
        issues.append("Low diversification")

    # 2. Position size check
    max_weight = np.max(weights)
    if max_weight > 0.40:
        score -= 25
        issues.append("Excessive single position")
    elif max_weight > 0.30:
        score -= 10
        issues.append("Large single position")

    # 3. Number of tiny positions
    tiny = np.sum((weights > 0) & (weights < 0.02))
    if tiny > 5:
        score -= 15
        issues.append("Too many tiny positions")

    # 4. Equal weight check (bad sign)
    weights_nonzero = weights[weights > 0.01]
    if len(weights_nonzero) > 0:
        cv = np.std(weights_nonzero) / np.mean(weights_nonzero)
        if cv < 0.15:  # Very similar weights
            score -= 20
            issues.append("Near equal weighting detected")

    score = max(0, score)

    # Classification
    if score >= 80:
        classification = "Excellent - Realistic and well-diversified"
    elif score >= 60:
        classification = "Good - Some minor concerns"
    elif score >= 40:
        classification = "Fair - Notable issues present"
    else:
        classification = "Poor - Significant problems"

    return {
        'overall': score,
        'classification': classification,
        'issues': issues
    }
