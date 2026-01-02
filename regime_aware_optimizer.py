"""
Regime-Aware Position Optimizer
================================

Integration of Phase 1 (Position-Aware) + Phase 2 (Regime Detection)

Complete workflow:
1. Detect current market regime (quantitative indicators)
2. Get current portfolio positions
3. Apply regime tilts to expected returns
4. Optimize from current positions with regime overlay
5. Calculate required trades
6. Explain each trade in regime context

Philosophy: "Know where you are (positions) + Know where the market is (regime)"
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from position_aware_optimizer import PositionAwareOptimizer
from regime_detector import QuantitativeRegimeDetector


class RegimeAwarePositionOptimizer:
    """
    Complete integration: Position-aware optimization + Regime overlay

    Workflow:
    1. Detect market regime → Get sector tilts
    2. Map portfolio tickers to sectors
    3. Apply tilts to expected returns
    4. Run position-aware optimization with adjusted returns
    5. Generate trades with regime context
    """

    def __init__(
        self,
        current_portfolio: Dict[str, float],
        returns_df: pd.DataFrame,
        sector_map: Dict[str, str],
        portfolio_value: float,
        current_prices: Optional[Dict[str, float]] = None,
        risk_free_rate: float = 0.02
    ):
        """
        Initialize regime-aware position optimizer

        Args:
            current_portfolio: Dict {ticker: weight} of current holdings
            returns_df: DataFrame of historical returns
            sector_map: Dict {ticker: sector}
            portfolio_value: Total portfolio value
            current_prices: Dict {ticker: price} for trade calculations
            risk_free_rate: Risk-free rate
        """
        self.current_portfolio = current_portfolio
        self.returns = returns_df
        self.sector_map = sector_map
        self.portfolio_value = portfolio_value
        self.current_prices = current_prices or {}
        self.rf = risk_free_rate

        # Initialize components
        self.position_optimizer = PositionAwareOptimizer(
            current_portfolio=current_portfolio,
            returns_df=returns_df,
            portfolio_value=portfolio_value,
            current_prices=current_prices,
            risk_free_rate=risk_free_rate
        )

        self.regime_detector = QuantitativeRegimeDetector()

        # Regime info (will be populated on optimization)
        self.regime_info = None
        self.sector_tilts = None

    def optimize_with_regime_awareness(
        self,
        max_drift: float = 0.10,
        objective: str = 'sortino',
        min_weight: float = 0.0,
        max_weight: float = 0.40,
        use_regime_tilts: bool = True
    ) -> Dict:
        """
        Run optimization with regime awareness

        Args:
            max_drift: Maximum % change per position
            objective: 'sortino', 'sharpe', or 'min_volatility'
            min_weight: Minimum weight per asset
            max_weight: Maximum weight per asset
            use_regime_tilts: Whether to apply regime tilts (True recommended)

        Returns:
            Dict with optimization results + regime context
        """
        # Step 1: Detect market regime
        print("🌐 Detecting market regime...")
        self.regime_info = self.regime_detector.detect_regime()

        regime = self.regime_info['regime']
        regime_label = self.regime_info['regime_label']
        confidence = self.regime_info['confidence']

        print(f"   → Regime: {regime_label} (Confidence: {confidence:.0f}%)")

        # Step 2: Get sector tilts
        self.sector_tilts = self.regime_detector.get_sector_tilts(regime)

        # Step 3: Apply regime tilts to expected returns (if enabled)
        if use_regime_tilts:
            print("🎯 Applying regime-based sector tilts to expected returns...")
            adjusted_returns = self._apply_regime_tilts_to_returns()
        else:
            print("⚪ Regime tilts disabled - using historical returns")
            adjusted_returns = self.returns.copy()

        # Step 4: Run position-aware optimization with adjusted returns
        print("🎯 Running position-aware optimization...")

        # Temporarily replace returns in position optimizer
        original_returns = self.position_optimizer.returns
        self.position_optimizer.returns = adjusted_returns

        # Recalculate current metrics with adjusted returns
        self.position_optimizer.current_metrics = self.position_optimizer._calculate_portfolio_metrics(
            self.position_optimizer.current_weights
        )

        # Run optimization
        optimization_results = self.position_optimizer.optimize_from_current(
            max_drift=max_drift,
            objective=objective,
            min_weight=min_weight,
            max_weight=max_weight
        )

        # Restore original returns
        self.position_optimizer.returns = original_returns

        # Step 5: Add regime context to results
        optimization_results['regime'] = self.regime_info
        optimization_results['sector_tilts'] = self.sector_tilts
        optimization_results['regime_tilts_applied'] = use_regime_tilts

        # Step 6: Generate trade rationales with regime context
        if optimization_results.get('trades'):
            optimization_results['trade_rationales'] = self._generate_trade_rationales(
                optimization_results['trades'],
                regime
            )

        return optimization_results

    def _apply_regime_tilts_to_returns(self) -> pd.DataFrame:
        """
        Apply regime-based sector tilts to expected returns

        Logic:
        - For each ticker, get its sector
        - Look up sector tilt for current regime
        - Multiply expected returns by tilt

        Example:
        - AAPL (Technology) in RISK-ON regime
        - Tech tilt = 1.30x
        - AAPL expected return = base_return * 1.30
        """
        adjusted_returns = self.returns.copy()

        # Get tickers
        tickers = self.returns.columns.tolist()

        for ticker in tickers:
            sector = self.sector_map.get(ticker, 'Unknown')
            tilt = self.sector_tilts.get(sector, 1.0)

            # Apply tilt to all historical returns for this ticker
            # This effectively increases/decreases the expected return
            adjusted_returns[ticker] = self.returns[ticker] * tilt

        return adjusted_returns

    def _generate_trade_rationales(
        self,
        trades: List[Dict],
        regime: str
    ) -> List[Dict]:
        """
        Generate human-readable rationales for each trade in regime context

        Explains WHY each trade makes sense given the regime
        """
        rationales = []

        for trade in trades:
            ticker = trade['ticker']
            action = trade['action']
            sector = self.sector_map.get(ticker, 'Unknown')
            tilt = self.sector_tilts.get(sector, 1.0)

            # Build rationale based on action and regime
            if action == 'BUY':
                if regime == 'risk_on':
                    if tilt > 1.0:
                        reason = f"Increasing {ticker} ({sector}) - sector favored in RISK-ON environment (tilt: {tilt:.2f}x). Market conditions support growth/cyclical assets."
                    else:
                        reason = f"Increasing {ticker} for diversification and portfolio balance."

                elif regime == 'risk_off':
                    if tilt > 1.0:
                        reason = f"Rotating into defensive {ticker} ({sector}) - safe haven in RISK-OFF environment (tilt: {tilt:.2f}x). Market stress favors defensive sectors."
                    else:
                        reason = f"Increasing {ticker} for portfolio rebalancing."

                elif regime == 'transitional':
                    reason = f"Adding {ticker} ({sector}) - positioned for mixed market signals. Tilt: {tilt:.2f}x in TRANSITIONAL regime."

                else:  # neutral
                    reason = f"Increasing {ticker} ({sector}) - market-neutral allocation."

            else:  # SELL
                if regime == 'risk_on':
                    if tilt < 1.0:
                        reason = f"Trimming {ticker} ({sector}) - sector underweight in RISK-ON environment (tilt: {tilt:.2f}x). Reallocating to cyclical/growth."
                    else:
                        reason = f"Reducing {ticker} to optimize risk-adjusted returns."

                elif regime == 'risk_off':
                    if tilt < 1.0:
                        reason = f"Reducing cyclical exposure in {ticker} ({sector}) - RISK-OFF environment favors defensives (tilt: {tilt:.2f}x). Protecting capital."
                    else:
                        reason = f"Trimming {ticker} for portfolio rebalancing."

                elif regime == 'transitional':
                    reason = f"Reducing {ticker} ({sector}) - taking profits in uncertain environment. Tilt: {tilt:.2f}x in TRANSITIONAL regime."

                else:  # neutral
                    reason = f"Trimming {ticker} ({sector}) - market-neutral rebalancing."

            rationales.append({
                'ticker': ticker,
                'action': action,
                'sector': sector,
                'tilt': tilt,
                'reason': reason,
                'regime_context': self._get_regime_context_for_sector(sector, regime)
            })

        return rationales

    def _get_regime_context_for_sector(self, sector: str, regime: str) -> str:
        """
        Get regime-specific context for a sector

        Explains why this sector is favored/disfavored in current regime
        """
        if regime == 'risk_on':
            risk_on_context = {
                'Technology': 'Growth-oriented investors favor tech in expansionary environments.',
                'Financials': 'Banks benefit from economic growth and rising rates.',
                'Consumer Discretionary': 'Consumer spending increases in optimistic markets.',
                'Industrials': 'Capital expenditure increases in growth phases.',
                'Energy': 'Cyclical demand for commodities rises.',
                'Utilities': 'Low-beta utilities lag in risk-seeking environments.',
                'Consumer Staples': 'Defensive sectors underperform when risk appetite is high.',
                'Healthcare': 'Neutral - provides stability without sacrificing growth.',
                'Communication Services': 'Benefits from advertising spending growth.',
                'Real Estate': 'May lag due to interest rate sensitivity.',
                'Materials': 'Cyclical demand benefits from economic expansion.'
            }
            return risk_on_context.get(sector, 'Sector positioning aligned with growth environment.')

        elif regime == 'risk_off':
            risk_off_context = {
                'Utilities': 'Defensive utility stocks provide stable dividends in downturns.',
                'Consumer Staples': 'Essential goods maintain demand regardless of economy.',
                'Healthcare': 'Healthcare spending is non-discretionary and resilient.',
                'Real Estate': 'REITs offer income stability and defensive characteristics.',
                'Technology': 'Growth stocks face multiple compression in risk-off environments.',
                'Financials': 'Banks suffer from credit concerns and economic slowdown.',
                'Consumer Discretionary': 'Discretionary spending falls in recessionary fears.',
                'Industrials': 'Cyclical sectors vulnerable to economic contraction.',
                'Energy': 'Demand concerns weigh on energy in slowdowns.',
                'Communication Services': 'Advertising spending contracts in downturns.',
                'Materials': 'Raw material demand falls with economic weakness.'
            }
            return risk_off_context.get(sector, 'Sector vulnerable in defensive environment.')

        elif regime == 'transitional':
            return f'{sector} positioned for mixed market signals. Balanced approach recommended.'

        else:  # neutral
            return f'{sector} maintains neutral positioning in balanced market.'


__all__ = ['RegimeAwarePositionOptimizer']
