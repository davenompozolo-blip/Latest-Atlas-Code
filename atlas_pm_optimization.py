"""
ATLAS PM-Grade Portfolio Optimization
======================================
Regime-aware, asymmetric risk, forward-looking portfolio optimization.

Philosophy: Think like a PM, optimize like a quant.

Author: Hlobo Nompozolo
Date: January 2026
Version: 1.0.0

Key Features:
1. Asymmetric Risk - Treats upside and downside volatility differently (Sortino)
2. Regime Awareness - Detects growth/value, risk-on/off environments
3. Forward-Looking Returns - Blends momentum, trend, mean reversion signals
4. PM-Level Thinking - Qualitative overlays on quantitative optimization

Solves:
- Traditional optimizers that cut high-return volatile stocks
- Backward-looking return estimates
- No market context awareness
- Pure quant approach without qualitative judgment
"""

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from datetime import datetime
from typing import Dict, List, Tuple, Optional
import streamlit as st


# ============================================================================
# ASYMMETRIC RISK OPTIMIZER
# ============================================================================

class AsymmetricRiskOptimizer:
    """
    Portfolio optimization that treats upside and downside volatility differently.

    Key insight: Upside volatility is GOOD, downside is BAD.
    Uses Sortino ratio instead of Sharpe to avoid penalizing good volatility.
    """

    def __init__(self, returns_df: pd.DataFrame, risk_free_rate: float = 0.02):
        """
        Initialize optimizer.

        Args:
            returns_df: DataFrame of daily returns (rows=dates, cols=tickers)
            risk_free_rate: Annual risk-free rate (default 2%)
        """
        self.returns = returns_df
        self.rf = risk_free_rate

    def calculate_downside_deviation(self, weights: np.ndarray, threshold: float = 0) -> float:
        """
        Calculate downside deviation (only negative returns).

        This is what we want to MINIMIZE.

        Args:
            weights: Portfolio weights
            threshold: Return threshold (default 0%)

        Returns:
            Annualized downside deviation
        """
        portfolio_returns = (self.returns * weights).sum(axis=1)

        # Only look at returns below threshold
        downside_returns = portfolio_returns[portfolio_returns < threshold]

        if len(downside_returns) == 0:
            return 0.0

        # Annualized downside deviation
        downside_dev = downside_returns.std() * np.sqrt(252)

        return downside_dev

    def calculate_sortino_ratio(self, weights: np.ndarray) -> float:
        """
        Sortino ratio: Return / Downside Deviation.

        This is what we want to MAXIMIZE.
        Better than Sharpe because it doesn't penalize upside.

        Args:
            weights: Portfolio weights

        Returns:
            Sortino ratio
        """
        portfolio_returns = (self.returns * weights).sum(axis=1)

        # Annual return
        annual_return = portfolio_returns.mean() * 252

        # Downside deviation (below 0%)
        downside_dev = self.calculate_downside_deviation(weights, threshold=0)

        if downside_dev == 0:
            return 0.0

        sortino = (annual_return - self.rf) / downside_dev

        return sortino

    def calculate_upside_capture(self, weights: np.ndarray) -> float:
        """
        What % of upside days do we capture?

        We WANT high upside capture.

        Args:
            weights: Portfolio weights

        Returns:
            Upside capture ratio
        """
        portfolio_returns = (self.returns * weights).sum(axis=1)

        # Market returns (equal weight for simplicity)
        market_returns = self.returns.mean(axis=1)

        # Upside days (market up)
        upside_days = market_returns > 0

        if upside_days.sum() == 0:
            return 0.0

        # Our return on upside days
        our_upside = portfolio_returns[upside_days].mean()
        market_upside = market_returns[upside_days].mean()

        upside_capture = our_upside / market_upside if market_upside != 0 else 0.0

        return upside_capture

    def calculate_downside_capture(self, weights: np.ndarray) -> float:
        """
        What % of downside days do we capture?

        We WANT low downside capture (less downside).

        Args:
            weights: Portfolio weights

        Returns:
            Downside capture ratio
        """
        portfolio_returns = (self.returns * weights).sum(axis=1)

        # Market returns
        market_returns = self.returns.mean(axis=1)

        # Downside days (market down)
        downside_days = market_returns < 0

        if downside_days.sum() == 0:
            return 0.0

        # Our return on downside days
        our_downside = portfolio_returns[downside_days].mean()
        market_downside = market_returns[downside_days].mean()

        downside_capture = our_downside / market_downside if market_downside != 0 else 0.0

        return downside_capture

    def optimize_sortino(self, constraints: List[Dict], bounds: List[Tuple]) -> np.ndarray:
        """
        Optimize for maximum Sortino ratio.

        This naturally favors high-return, high-vol stocks IF
        the volatility is asymmetric (more upside than downside).

        Args:
            constraints: Optimization constraints
            bounds: Weight bounds per asset

        Returns:
            Optimal weights
        """
        n_assets = len(self.returns.columns)

        # Objective: Negative Sortino (we minimize)
        def objective(weights):
            return -self.calculate_sortino_ratio(weights)

        # Initial guess: Equal weight
        initial_weights = np.ones(n_assets) / n_assets

        # Optimize
        result = minimize(
            objective,
            initial_weights,
            method='SLSQP',
            bounds=bounds,
            constraints=constraints,
            options={'maxiter': 1000, 'ftol': 1e-9}
        )

        return result.x

    def optimize_upside_downside_ratio(self, constraints: List[Dict], bounds: List[Tuple]) -> np.ndarray:
        """
        Optimize for upside capture / downside capture.

        Maximize: How much upside we get vs downside we avoid.

        Args:
            constraints: Optimization constraints
            bounds: Weight bounds per asset

        Returns:
            Optimal weights
        """
        n_assets = len(self.returns.columns)

        def objective(weights):
            upside = self.calculate_upside_capture(weights)
            downside = abs(self.calculate_downside_capture(weights))

            if downside == 0:
                return -upside * 10  # Maximize upside

            ratio = upside / downside
            return -ratio  # Negative because we minimize

        initial_weights = np.ones(n_assets) / n_assets

        result = minimize(
            objective,
            initial_weights,
            method='SLSQP',
            bounds=bounds,
            constraints=constraints,
            options={'maxiter': 1000}
        )

        return result.x


# ============================================================================
# MARKET REGIME DETECTOR
# ============================================================================

class MarketRegimeDetector:
    """
    Detect current market regime to adjust optimization.

    Regimes:
    - Growth vs Value
    - Risk-on vs Risk-off
    - Sector momentum
    """

    def __init__(self, returns_df: pd.DataFrame, sector_map: Optional[Dict[str, str]] = None):
        """
        Initialize regime detector.

        Args:
            returns_df: Historical returns
            sector_map: Dict mapping tickers to sectors
        """
        self.returns = returns_df
        self.sector_map = sector_map or {}

    def detect_growth_vs_value_regime(self) -> str:
        """
        Is market favoring growth or value stocks?

        Growth: High beta, tech, high P/E
        Value: Low beta, financials, low P/E

        Returns:
            'growth', 'value', or 'neutral'
        """
        # Calculate beta for each stock
        market_returns = self.returns.mean(axis=1)

        betas = {}
        for ticker in self.returns.columns:
            stock_returns = self.returns[ticker]

            # Beta = Cov(stock, market) / Var(market)
            covariance = np.cov(stock_returns, market_returns)[0, 1]
            market_variance = market_returns.var()

            beta = covariance / market_variance if market_variance != 0 else 1.0
            betas[ticker] = beta

        # Recent performance: High beta vs Low beta
        recent_returns = self.returns.tail(60)  # Last 60 days

        high_beta_tickers = [t for t, b in betas.items() if b > 1.2]
        low_beta_tickers = [t for t, b in betas.items() if b < 0.8]

        if high_beta_tickers and low_beta_tickers:
            high_beta_performance = recent_returns[high_beta_tickers].mean(axis=1).mean()
            low_beta_performance = recent_returns[low_beta_tickers].mean(axis=1).mean()

            if high_beta_performance > low_beta_performance * 1.5:
                return 'growth'
            elif low_beta_performance > high_beta_performance * 1.5:
                return 'value'

        return 'neutral'

    def detect_sector_momentum(self) -> Dict[str, float]:
        """
        Which sectors have positive momentum?

        Returns:
            Dict mapping sector to momentum score
        """
        sector_momentum = {}

        for sector in set(self.sector_map.values()):
            # Get tickers in this sector
            sector_tickers = [t for t, s in self.sector_map.items() if s == sector and t in self.returns.columns]

            if not sector_tickers:
                continue

            # Calculate sector returns (last 60 days)
            recent = self.returns[sector_tickers].tail(60)
            sector_return = recent.mean(axis=1).sum()

            # Calculate momentum score
            sector_momentum[sector] = sector_return

        return sector_momentum

    def detect_risk_regime(self) -> str:
        """
        Is market in risk-on or risk-off mode?

        Risk-on: VIX low, high-beta outperforming
        Risk-off: VIX high, defensive outperforming

        Returns:
            'risk-on', 'risk-off', or 'neutral'
        """
        # Calculate market volatility (proxy for VIX)
        market_returns = self.returns.mean(axis=1)
        recent_vol = market_returns.tail(20).std() * np.sqrt(252)

        # Historical volatility
        historical_vol = market_returns.std() * np.sqrt(252)

        if recent_vol < historical_vol * 0.8:
            return 'risk-on'
        elif recent_vol > historical_vol * 1.2:
            return 'risk-off'
        else:
            return 'neutral'

    def get_regime_adjustments(self) -> Dict:
        """
        Get recommended portfolio tilts based on regime.

        Returns:
            Dict with regime info and recommended tilts
        """
        growth_value = self.detect_growth_vs_value_regime()
        risk_regime = self.detect_risk_regime()
        sector_momentum = self.detect_sector_momentum()

        recommendations = {
            'growth_value': growth_value,
            'risk_regime': risk_regime,
            'sector_momentum': sector_momentum,
            'tilts': {}
        }

        # Translate to actionable tilts
        if growth_value == 'growth' and risk_regime == 'risk-on':
            recommendations['tilts']['Technology'] = 1.3  # Overweight 30%
            recommendations['tilts']['Healthcare'] = 1.2  # Overweight 20%
            recommendations['tilts']['Utilities'] = 0.7   # Underweight 30%
            recommendations['tilts']['Consumer Staples'] = 0.8  # Underweight 20%

        elif growth_value == 'value' or risk_regime == 'risk-off':
            recommendations['tilts']['Technology'] = 0.8
            recommendations['tilts']['Financials'] = 1.2
            recommendations['tilts']['Utilities'] = 1.3
            recommendations['tilts']['Consumer Staples'] = 1.2

        return recommendations


# ============================================================================
# FORWARD-LOOKING RETURN ESTIMATOR
# ============================================================================

class ForwardLookingReturns:
    """
    Estimate expected returns using multiple signals.

    Don't just use historical mean!
    Incorporate:
    - Momentum
    - Trend
    - Mean reversion
    - Volatility adjustment
    """

    def __init__(self, returns_df: pd.DataFrame):
        """
        Initialize return estimator.

        Args:
            returns_df: Historical returns
        """
        self.returns = returns_df

    def calculate_momentum_signal(self, lookback: int = 60) -> pd.Series:
        """
        Recent performance signal.

        Stocks that did well recently tend to continue (momentum).

        Args:
            lookback: Days to look back

        Returns:
            Annualized momentum returns
        """
        recent_returns = self.returns.tail(lookback)

        # Annualized recent returns
        momentum = (1 + recent_returns.mean()) ** 252 - 1

        return momentum

    def calculate_trend_signal(self) -> pd.Series:
        """
        Is stock in uptrend or downtrend?

        Simple: Price > 200-day MA = uptrend

        Returns:
            Annualized trend signal
        """
        # Calculate 200-day cumulative return (proxy for MA)
        long_term = self.returns.tail(200)

        trend = (1 + long_term.mean()) ** 252 - 1

        return trend

    def calculate_mean_reversion_signal(self) -> pd.Series:
        """
        How far from long-term mean?

        Stocks far from mean tend to revert.

        Returns:
            Mean reversion signal
        """
        # Long-term mean
        long_term_mean = self.returns.mean() * 252

        # Recent performance
        recent_mean = self.returns.tail(60).mean() * 252

        # Reversion signal: Long-term - Recent
        # Positive = underperformed recently, expect bounce
        reversion = long_term_mean - recent_mean

        return reversion

    def calculate_volatility_adjusted_signal(self) -> pd.Series:
        """
        Adjust for recent volatility changes.

        Stocks with declining vol may be stabilizing (good).

        Returns:
            Volatility adjustment multiplier
        """
        recent_vol = self.returns.tail(60).std() * np.sqrt(252)
        historical_vol = self.returns.std() * np.sqrt(252)

        # Vol ratio: < 1 = calming down, > 1 = getting volatile
        vol_ratio = recent_vol / historical_vol

        # Adjust returns inversely (lower vol = better)
        adjustment = 1 / vol_ratio

        # Clamp to reasonable range
        adjustment = adjustment.clip(0.5, 2.0)

        return adjustment

    def blend_signals(self, weights: Optional[Dict[str, float]] = None) -> pd.Series:
        """
        Combine all signals into expected returns.

        Args:
            weights: Dict of signal weights

        Returns:
            Blended expected returns
        """
        if weights is None:
            weights = {
                'historical': 0.30,
                'momentum': 0.35,
                'trend': 0.20,
                'reversion': 0.10,
                'volatility': 0.05
            }

        # Calculate signals
        historical = self.returns.mean() * 252
        momentum = self.calculate_momentum_signal()
        trend = self.calculate_trend_signal()
        reversion = self.calculate_mean_reversion_signal()
        vol_adj = self.calculate_volatility_adjusted_signal()

        # Blend
        blended = (
            historical * weights['historical'] +
            momentum * weights['momentum'] +
            trend * weights['trend'] +
            reversion * weights['reversion']
        )

        # Apply volatility adjustment
        blended *= vol_adj

        return blended


# ============================================================================
# PM-GRADE OPTIMIZER (MAIN CLASS)
# ============================================================================

class PMGradeOptimizer:
    """
    Portfolio optimization that thinks like a PM.

    Combines:
    1. Asymmetric risk (Sortino, upside/downside)
    2. Regime awareness (growth/value, risk-on/off)
    3. Forward-looking returns (momentum, trend)
    """

    def __init__(self, returns_df: pd.DataFrame, sector_map: Optional[Dict[str, str]] = None):
        """
        Initialize PM-grade optimizer.

        Args:
            returns_df: Historical returns
            sector_map: Dict mapping tickers to sectors
        """
        self.returns = returns_df
        self.sector_map = sector_map or {}

        # Initialize sub-components
        self.asymmetric = AsymmetricRiskOptimizer(returns_df)
        self.regime = MarketRegimeDetector(returns_df, sector_map)
        self.forward_returns = ForwardLookingReturns(returns_df)

    def optimize(
        self,
        strategy: str = 'balanced',
        constraints: Optional[List[Dict]] = None,
        bounds: Optional[List[Tuple]] = None
    ) -> Dict:
        """
        Run PM-grade optimization.

        Args:
            strategy: 'aggressive', 'balanced', or 'defensive'
            constraints: Custom constraints
            bounds: Custom bounds

        Returns:
            Dict with weights, regime info, and metrics
        """
        # Step 1: Detect regime
        regime_info = self.regime.get_regime_adjustments()

        # Step 2: Calculate forward-looking returns
        if regime_info['growth_value'] == 'growth':
            # Emphasize momentum in growth regime
            signal_weights = {
                'historical': 0.20,
                'momentum': 0.50,  # Higher weight
                'trend': 0.20,
                'reversion': 0.05,
                'volatility': 0.05
            }
        else:
            # Emphasize mean reversion in value regime
            signal_weights = {
                'historical': 0.35,
                'momentum': 0.20,
                'trend': 0.15,
                'reversion': 0.25,  # Higher weight
                'volatility': 0.05
            }

        expected_returns = self.forward_returns.blend_signals(signal_weights)

        # Step 3: Apply regime tilts
        for ticker in self.returns.columns:
            sector = self.sector_map.get(ticker, 'Unknown')
            if sector in regime_info['tilts']:
                expected_returns[ticker] *= regime_info['tilts'][sector]

        # Step 4: Set up constraints and bounds
        n_assets = len(self.returns.columns)

        if constraints is None:
            constraints = [
                {'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0}
            ]

        if bounds is None:
            if strategy == 'aggressive':
                bounds = [(0, 0.40) for _ in range(n_assets)]
            elif strategy == 'balanced':
                bounds = [(0, 0.25) for _ in range(n_assets)]
            else:  # defensive
                bounds = [(0, 0.15) for _ in range(n_assets)]

        # Step 5: Optimize with asymmetric risk
        # Use Sortino instead of Sharpe

        def objective(weights):
            # Portfolio return (forward-looking)
            portfolio_return = np.dot(weights, expected_returns)

            # Downside deviation (backward-looking)
            portfolio_returns_hist = (self.returns * weights).sum(axis=1)
            downside = portfolio_returns_hist[portfolio_returns_hist < 0].std() * np.sqrt(252)

            if downside == 0 or np.isnan(downside):
                return -portfolio_return * 10

            sortino = (portfolio_return - 0.02) / downside

            return -sortino

        initial_weights = np.ones(n_assets) / n_assets

        result = minimize(
            objective,
            initial_weights,
            method='SLSQP',
            bounds=bounds,
            constraints=constraints,
            options={'maxiter': 2000, 'ftol': 1e-9}
        )

        # Calculate final metrics
        final_weights = result.x

        sortino = self.asymmetric.calculate_sortino_ratio(final_weights)
        upside_capture = self.asymmetric.calculate_upside_capture(final_weights)
        downside_capture = self.asymmetric.calculate_downside_capture(final_weights)

        # Portfolio return
        portfolio_return = np.dot(final_weights, expected_returns)

        return {
            'weights': final_weights,
            'regime': regime_info,
            'expected_returns': expected_returns,
            'portfolio_return': portfolio_return,
            'sortino': sortino,
            'upside_capture': upside_capture,
            'downside_capture': downside_capture,
            'upside_downside_ratio': upside_capture / abs(downside_capture) if downside_capture != 0 else 0,
            'strategy': strategy,
            'optimization_success': result.success
        }


# ============================================================================
# STREAMLIT UI COMPONENTS
# ============================================================================

def display_regime_analysis(regime: Dict):
    """Display market regime analysis in Streamlit."""

    st.markdown("### 🌍 Market Regime Analysis")

    col1, col2, col3 = st.columns(3)

    with col1:
        growth_value = regime['growth_value'].title()
        icon = "🚀" if regime['growth_value'] == 'growth' else ("🛡️" if regime['growth_value'] == 'value' else "⚖️")
        st.metric("Growth/Value", f"{icon} {growth_value}")

    with col2:
        risk_regime = regime['risk_regime'].title()
        icon = "🟢" if regime['risk_regime'] == 'risk-on' else ("🔴" if regime['risk_regime'] == 'risk-off' else "🟡")
        st.metric("Risk Regime", f"{icon} {risk_regime}")

    with col3:
        tilts_count = len([v for v in regime['tilts'].values() if v != 1.0])
        st.metric("Sector Tilts", tilts_count)

    # Sector momentum
    if regime['sector_momentum']:
        st.markdown("**Sector Momentum (60-day):**")

        sorted_sectors = sorted(
            regime['sector_momentum'].items(),
            key=lambda x: x[1],
            reverse=True
        )

        momentum_data = []
        for sector, momentum in sorted_sectors:
            icon = "🔥" if momentum > 0 else "❄️"
            tilt = regime['tilts'].get(sector, 1.0)
            tilt_text = f"{tilt:.1f}x" if tilt != 1.0 else "neutral"

            momentum_data.append({
                'Sector': f"{icon} {sector}",
                'Momentum': f"{momentum:+.2%}",
                'Tilt': tilt_text
            })

        momentum_df = pd.DataFrame(momentum_data)
        st.dataframe(momentum_df, use_container_width=True, hide_index=True)


def display_optimization_results(results: Dict, tickers: List[str]):
    """Display PM-grade optimization results."""

    st.markdown("---")
    st.markdown("### 📊 Optimized Portfolio")

    # Metrics
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        sortino_color = "🟢" if results['sortino'] > 1.5 else ("🟡" if results['sortino'] > 1.0 else "🔴")
        st.metric(
            "Sortino Ratio",
            f"{sortino_color} {results['sortino']:.2f}",
            help="Return / Downside Deviation (higher is better)"
        )

    with col2:
        upside = results['upside_capture'] * 100
        upside_color = "🟢" if upside > 100 else "🟡"
        st.metric(
            "Upside Capture",
            f"{upside_color} {upside:.1f}%",
            help="% of market upside captured"
        )

    with col3:
        downside = abs(results['downside_capture']) * 100
        downside_color = "🟢" if downside < 100 else "🔴"
        st.metric(
            "Downside Capture",
            f"{downside_color} {downside:.1f}%",
            help="% of market downside captured (lower is better)"
        )

    with col4:
        ratio = results['upside_downside_ratio']
        ratio_color = "🟢" if ratio > 1.3 else ("🟡" if ratio > 1.0 else "🔴")
        st.metric(
            "Up/Down Ratio",
            f"{ratio_color} {ratio:.2f}x",
            help="Upside capture / Downside capture"
        )

    # Weights table
    st.markdown("---")
    st.markdown("#### Portfolio Allocations")

    weights_df = pd.DataFrame({
        'Ticker': tickers,
        'Weight (%)': results['weights'] * 100,
        'Expected Return (%)': results['expected_returns'].values * 100
    })

    # Only show positions > 1%
    weights_df = weights_df[weights_df['Weight (%)'] > 1.0].sort_values('Weight (%)', ascending=False)

    # Format
    weights_df['Weight (%)'] = weights_df['Weight (%)'].apply(lambda x: f"{x:.1f}%")
    weights_df['Expected Return (%)'] = weights_df['Expected Return (%)'].apply(lambda x: f"{x:+.1f}%")

    st.dataframe(weights_df, use_container_width=True, hide_index=True)

    # Explanation
    st.markdown("---")
    st.info(f"""
    💡 **Why These Weights?**

    **Regime Context:**
    - Market is in **{results['regime']['growth_value']}** mode
    - Risk environment: **{results['regime']['risk_regime']}**
    - Optimization strategy: **{results['strategy']}**

    **Key Characteristics:**
    - Sortino {results['sortino']:.2f} (vs Sharpe which penalizes all volatility)
    - Captures {results['upside_capture']*100:.0f}% of market upside
    - Only {abs(results['downside_capture'])*100:.0f}% of market downside
    - Ratio: {results['upside_downside_ratio']:.1f}x more upside than downside

    **Portfolio Return:** {results['portfolio_return']*100:.1f}% expected annual return

    This portfolio is optimized for **asymmetric returns** -
    capturing upside while limiting downside.
    """)


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

if __name__ == "__main__":
    print("ATLAS PM-Grade Optimization Module")
    print("=" * 50)
    print("\nThis module provides institutional-grade portfolio optimization.")
    print("\nKey Features:")
    print("  • Asymmetric risk treatment (Sortino ratio)")
    print("  • Market regime detection (growth/value, risk-on/off)")
    print("  • Forward-looking return estimates (momentum + trend)")
    print("  • PM-level qualitative overlays")
    print("\nImport this module to use in your optimization workflow.")
