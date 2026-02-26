"""
ATLAS Terminal - Macro Regime Classification Engine
====================================================
Four-quadrant framework: Growth (Accelerating/Decelerating) x Inflation (Rising/Falling).
Provides regime classification, transition signals, and portfolio impact analysis.
"""

import numpy as np
import pandas as pd
from typing import Dict, Optional, List, Any, Tuple
from datetime import datetime, timedelta
from enum import Enum


class MacroRegime(str, Enum):
    GOLDILOCKS = "goldilocks"          # Growth up, Inflation down
    REFLATION = "reflation"            # Growth up, Inflation up
    STAGFLATION = "stagflation"        # Growth down, Inflation up
    DEFLATION = "deflation"            # Growth down, Inflation down


REGIME_CONFIG = {
    MacroRegime.GOLDILOCKS: {
        'label': 'Goldilocks',
        'quadrant': 'Growth \u2191 / Inflation \u2193',
        'color': '#10b981',
        'description': 'Growth accelerating with falling inflation. Risk assets tend to perform well.',
        'factor_tilts': {'growth': 1.2, 'quality': 1.1, 'momentum': 1.0, 'value': 0.8, 'low_vol': 0.7},
        'asset_implications': {
            'equities': 'Positive - especially growth/quality',
            'bonds': 'Neutral to positive - duration okay',
            'commodities': 'Mixed - growth good, inflation low',
            'usd': 'Depends on rate expectations',
        },
    },
    MacroRegime.REFLATION: {
        'label': 'Reflation',
        'quadrant': 'Growth \u2191 / Inflation \u2191',
        'color': '#f59e0b',
        'description': 'Growth accelerating with rising inflation. Favor real assets and value.',
        'factor_tilts': {'value': 1.3, 'momentum': 1.0, 'growth': 0.9, 'quality': 0.9, 'low_vol': 0.7},
        'asset_implications': {
            'equities': 'Positive but rotating to value/cyclicals',
            'bonds': 'Negative - rising rates pressure duration',
            'commodities': 'Strongly positive',
            'usd': 'Weakening (real rates falling)',
        },
    },
    MacroRegime.STAGFLATION: {
        'label': 'Stagflation',
        'quadrant': 'Growth \u2193 / Inflation \u2191',
        'color': '#ef4444',
        'description': 'Growth decelerating with rising inflation. Most challenging regime for portfolios.',
        'factor_tilts': {'low_vol': 1.3, 'quality': 1.2, 'value': 0.9, 'momentum': 0.8, 'growth': 0.6},
        'asset_implications': {
            'equities': 'Negative - favor defensives/quality',
            'bonds': 'Negative - inflation erodes real returns',
            'commodities': 'Mixed - energy up, metals down',
            'usd': 'Strengthening (safe haven)',
        },
    },
    MacroRegime.DEFLATION: {
        'label': 'Deflation / Slowdown',
        'quadrant': 'Growth \u2193 / Inflation \u2193',
        'color': '#6366f1',
        'description': 'Growth decelerating with falling inflation. Favor bonds and quality.',
        'factor_tilts': {'quality': 1.3, 'low_vol': 1.2, 'growth': 0.9, 'value': 0.7, 'momentum': 0.8},
        'asset_implications': {
            'equities': 'Cautious - favor quality/defensives',
            'bonds': 'Positive - duration benefits from rate cuts',
            'commodities': 'Negative - demand weakness',
            'usd': 'Mixed - rate cuts vs safe haven',
        },
    },
}


class MacroRegimeEngine:
    """
    Classifies the current macroeconomic regime using observable indicators.
    """

    def __init__(self):
        self._last_classification = None
        self._classification_ts = None

    def classify_regime(
        self,
        growth_momentum: float = 0.0,
        inflation_trend: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Classify regime based on growth and inflation signals.

        Args:
            growth_momentum: Positive = accelerating, negative = decelerating
            inflation_trend: Positive = rising, negative = falling

        Returns:
            Dict with regime, confidence, and metadata
        """
        if growth_momentum >= 0 and inflation_trend <= 0:
            regime = MacroRegime.GOLDILOCKS
        elif growth_momentum >= 0 and inflation_trend > 0:
            regime = MacroRegime.REFLATION
        elif growth_momentum < 0 and inflation_trend > 0:
            regime = MacroRegime.STAGFLATION
        else:
            regime = MacroRegime.DEFLATION

        # Confidence based on signal strength
        signal_strength = (abs(growth_momentum) + abs(inflation_trend)) / 2
        confidence = min(95, max(30, 50 + signal_strength * 10))

        config = REGIME_CONFIG[regime]

        result = {
            'regime': regime.value,
            'label': config['label'],
            'quadrant': config['quadrant'],
            'color': config['color'],
            'description': config['description'],
            'confidence': confidence,
            'growth_signal': growth_momentum,
            'inflation_signal': inflation_trend,
            'factor_tilts': config['factor_tilts'],
            'asset_implications': config['asset_implications'],
            'timestamp': datetime.now().isoformat(),
        }

        self._last_classification = result
        self._classification_ts = datetime.now()

        return result

    def classify_from_market_data(self) -> Dict[str, Any]:
        """
        Classify regime using live market data from yfinance.
        Uses yield curve, VIX, credit spreads, and equity momentum as signals.
        """
        try:
            import yfinance as yf

            signals = {}

            # Growth signal: PMI proxy (use industrial ETF momentum)
            try:
                xli = yf.Ticker('XLI').history(period='6mo')
                if len(xli) > 60:
                    ma_short = xli['Close'].tail(20).mean()
                    ma_long = xli['Close'].tail(60).mean()
                    signals['industrial_momentum'] = (ma_short / ma_long - 1) * 100
            except Exception:
                signals['industrial_momentum'] = 0

            # Growth signal: yield curve slope (2s10s proxy)
            try:
                tnx = yf.Ticker('^TNX').history(period='3mo')  # 10Y
                if len(tnx) > 0:
                    yield_10y = tnx['Close'].iloc[-1]
                    signals['yield_10y'] = yield_10y
            except Exception:
                signals['yield_10y'] = 4.0

            # VIX - risk appetite
            try:
                vix = yf.Ticker('^VIX').history(period='3mo')
                if len(vix) > 0:
                    current_vix = vix['Close'].iloc[-1]
                    avg_vix = vix['Close'].mean()
                    signals['vix'] = current_vix
                    signals['vix_z'] = (current_vix - avg_vix) / vix['Close'].std()
            except Exception:
                signals['vix'] = 20
                signals['vix_z'] = 0

            # Inflation signal: TIPS ETF as proxy
            try:
                tip = yf.Ticker('TIP').history(period='6mo')
                if len(tip) > 60:
                    tip_ma_short = tip['Close'].tail(20).mean()
                    tip_ma_long = tip['Close'].tail(60).mean()
                    signals['inflation_proxy'] = (tip_ma_short / tip_ma_long - 1) * 100
            except Exception:
                signals['inflation_proxy'] = 0

            # Commodity signal (copper as growth bellwether)
            try:
                hg = yf.Ticker('HG=F').history(period='3mo')
                if len(hg) > 20:
                    copper_mom = (hg['Close'].iloc[-1] / hg['Close'].iloc[0] - 1) * 100
                    signals['copper_momentum'] = copper_mom
            except Exception:
                signals['copper_momentum'] = 0

            # Gold signal (risk-off / inflation hedge)
            try:
                gc = yf.Ticker('GC=F').history(period='3mo')
                if len(gc) > 20:
                    gold_mom = (gc['Close'].iloc[-1] / gc['Close'].iloc[0] - 1) * 100
                    signals['gold_momentum'] = gold_mom
            except Exception:
                signals['gold_momentum'] = 0

            # Aggregate signals
            growth_score = (
                signals.get('industrial_momentum', 0) * 0.4
                + signals.get('copper_momentum', 0) * 0.3
                - signals.get('vix_z', 0) * 0.3
            )

            inflation_score = (
                signals.get('inflation_proxy', 0) * 0.5
                + signals.get('gold_momentum', 0) * 0.3
                + (signals.get('yield_10y', 4.0) - 4.0) * 0.2
            )

            result = self.classify_regime(growth_score, inflation_score)
            result['signals'] = signals
            return result

        except Exception as e:
            return self.classify_regime(0, 0)

    def calculate_financial_conditions(self) -> Dict[str, Any]:
        """
        Calculate a simplified Financial Conditions Index.
        """
        try:
            import yfinance as yf

            conditions = {}

            # Equity volatility
            try:
                vix_data = yf.Ticker('^VIX').history(period='1y')
                if len(vix_data) > 0:
                    current = vix_data['Close'].iloc[-1]
                    avg = vix_data['Close'].mean()
                    std = vix_data['Close'].std()
                    conditions['equity_vol'] = {
                        'current': float(current),
                        'avg_1y': float(avg),
                        'z_score': float((current - avg) / std) if std > 0 else 0,
                        'signal': 'tight' if current < avg else 'loose',
                    }
            except Exception:
                pass

            # Dollar strength
            try:
                dxy = yf.Ticker('DX-Y.NYB').history(period='1y')
                if len(dxy) > 0:
                    current = dxy['Close'].iloc[-1]
                    avg = dxy['Close'].mean()
                    ma200 = dxy['Close'].tail(200).mean() if len(dxy) > 200 else avg
                    conditions['dollar'] = {
                        'current': float(current),
                        'avg_1y': float(avg),
                        'vs_200ma': float((current / ma200 - 1) * 100),
                        'signal': 'strong' if current > ma200 else 'weak',
                    }
            except Exception:
                pass

            # Aggregate FCI score: negative = tighter, positive = looser
            scores = []
            if 'equity_vol' in conditions:
                scores.append(-conditions['equity_vol']['z_score'])
            if 'dollar' in conditions:
                scores.append(-conditions['dollar'].get('vs_200ma', 0) / 5)

            fci = np.mean(scores) if scores else 0

            return {
                'fci_score': float(fci),
                'fci_label': 'Tight' if fci < -0.5 else ('Loose' if fci > 0.5 else 'Neutral'),
                'components': conditions,
            }

        except Exception:
            return {'fci_score': 0, 'fci_label': 'N/A', 'components': {}}

    def get_portfolio_impact(
        self,
        regime: Dict[str, Any],
        holdings: Dict[str, Dict],
    ) -> Dict[str, Any]:
        """
        Translate regime classification into portfolio-specific impact.

        Args:
            regime: Output from classify_regime
            holdings: Dict of ticker -> {weight, sector, ...}

        Returns:
            Dict with winners, losers, factor shifts, concentration alerts
        """
        factor_tilts = regime.get('factor_tilts', {})
        regime_label = regime.get('label', 'Unknown')

        # Sector sensitivity to regime
        sector_regime_map = {
            MacroRegime.GOLDILOCKS.value: {
                'Technology': 1.2, 'Consumer Discretionary': 1.1,
                'Communication Services': 1.0, 'Financials': 0.9,
                'Utilities': 0.7, 'Energy': 0.8,
            },
            MacroRegime.REFLATION.value: {
                'Energy': 1.3, 'Materials': 1.2, 'Financials': 1.1,
                'Industrials': 1.1, 'Technology': 0.8, 'Utilities': 0.6,
            },
            MacroRegime.STAGFLATION.value: {
                'Utilities': 1.2, 'Consumer Staples': 1.1, 'Health Care': 1.1,
                'Energy': 1.0, 'Technology': 0.7, 'Consumer Discretionary': 0.6,
            },
            MacroRegime.DEFLATION.value: {
                'Utilities': 1.2, 'Consumer Staples': 1.1, 'Health Care': 1.0,
                'Technology': 0.9, 'Energy': 0.6, 'Financials': 0.7,
            },
        }

        sector_map = sector_regime_map.get(regime.get('regime', ''), {})

        winners = []
        losers = []

        for ticker, info in holdings.items():
            sector = info.get('sector', 'Unknown')
            weight = info.get('weight', 0)
            sensitivity = sector_map.get(sector, 1.0)

            entry = {
                'ticker': ticker,
                'sector': sector,
                'weight': weight,
                'sensitivity': sensitivity,
            }

            if sensitivity >= 1.1:
                winners.append(entry)
            elif sensitivity <= 0.8:
                losers.append(entry)

        winners.sort(key=lambda x: x['sensitivity'], reverse=True)
        losers.sort(key=lambda x: x['sensitivity'])

        # Concentration alerts
        alerts = []
        sector_weights = {}
        for _, info in holdings.items():
            sector = info.get('sector', 'Unknown')
            sector_weights[sector] = sector_weights.get(sector, 0) + info.get('weight', 0)

        for sector, weight in sector_weights.items():
            if weight > 0.3:
                sensitivity = sector_map.get(sector, 1.0)
                if sensitivity < 0.9:
                    alerts.append(
                        f"Concentration risk: {weight:.0%} in {sector} "
                        f"(low sensitivity in {regime_label} regime)"
                    )

        return {
            'winners': winners[:5],
            'losers': losers[:5],
            'factor_tilts': factor_tilts,
            'concentration_alerts': alerts,
        }


# Singleton
regime_engine = MacroRegimeEngine()
