"""
Quantitative Market Regime Detector
====================================

Detect market regime using OBSERVABLE, QUANTIFIABLE indicators.

Indicators:
1. VIX - CBOE Volatility Index (fear gauge)
2. Treasury Yields - 10Y, 2Y, and yield curve (recession signal)
3. Credit Spreads - High Yield vs Investment Grade (credit risk)
4. Market Breadth - SPY vs RSP (rally health)
5. Momentum - Recent market trends

Regime Classification:
- RISK-ON: Markets favorable for growth/cyclical assets
- RISK-OFF: Markets favoring defensive/safe-haven assets
- TRANSITIONAL: Markets in flux, mixed signals
- NEUTRAL: Markets balanced, no clear directional bias

Philosophy: "Observable data drives decisions, not hunches"
"""

import yfinance as yf
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta


class QuantitativeRegimeDetector:
    """
    Detect market regime using quantifiable, observable indicators

    All indicators are fetched from public sources in real-time.
    No subjective judgment - purely data-driven.
    """

    def __init__(self):
        """Initialize regime detector"""
        self.current_regime = None
        self.indicators = {}
        self.regime_score = 0
        self.last_update = None

    def fetch_market_indicators(self) -> Dict:
        """
        Fetch all market indicators from public sources

        Returns dict with all indicator data and interpretations
        """
        print("📊 Fetching market indicators...")
        indicators = {}

        # 1. VIX - Volatility Index (Fear Gauge)
        indicators['vix'] = self._fetch_vix()

        # 2. Treasury Yields - Risk-free rate and recession signals
        indicators['yields'] = self._fetch_treasury_yields()

        # 3. Credit Spreads - Risk premium indicator
        indicators['credit_spreads'] = self._fetch_credit_spreads()

        # 4. Market Breadth - Rally health indicator
        indicators['breadth'] = self._fetch_market_breadth()

        # 5. Market Momentum - Recent trends
        indicators['momentum'] = self._fetch_market_momentum()

        self.indicators = indicators
        self.last_update = datetime.now()

        print("✅ All indicators fetched successfully")
        return indicators

    def _fetch_vix(self) -> Dict:
        """
        Fetch VIX (CBOE Volatility Index)

        VIX < 15: Complacency (risk-on)
        VIX 15-20: Normal (neutral)
        VIX 20-30: Elevated fear (caution)
        VIX > 30: Panic (risk-off)
        """
        try:
            vix = yf.Ticker("^VIX")
            vix_data = vix.history(period='1mo')

            if len(vix_data) == 0:
                return {'error': 'No VIX data available'}

            current_vix = vix_data['Close'].iloc[-1]
            vix_5d_change = ((current_vix / vix_data['Close'].iloc[-5]) - 1) * 100 if len(vix_data) >= 5 else 0
            vix_1m_avg = vix_data['Close'].mean()

            # Interpret VIX level
            if current_vix < 15:
                interpretation = 'complacency'
                signal = 'RISK-ON'
                color = '🟢'
            elif current_vix < 20:
                interpretation = 'normal'
                signal = 'NEUTRAL'
                color = '⚪'
            elif current_vix < 30:
                interpretation = 'elevated_fear'
                signal = 'CAUTION'
                color = '🟡'
            else:
                interpretation = 'panic'
                signal = 'RISK-OFF'
                color = '🔴'

            return {
                'current': current_vix,
                'change_5d': vix_5d_change,
                'avg_1m': vix_1m_avg,
                'interpretation': interpretation,
                'signal': signal,
                'color': color,
                'description': self._vix_description(current_vix)
            }

        except Exception as e:
            print(f"⚠️ VIX fetch error: {e}")
            return {'error': str(e)}

    def _vix_description(self, vix_level: float) -> str:
        """Get human-readable VIX description"""
        if vix_level < 15:
            return "Market complacency - very low volatility expectations"
        elif vix_level < 20:
            return "Normal volatility - healthy market conditions"
        elif vix_level < 30:
            return "Elevated volatility - market uncertainty rising"
        else:
            return "High volatility - significant market stress"

    def _fetch_treasury_yields(self) -> Dict:
        """
        Fetch Treasury yields and calculate yield curve

        Yield Curve (10Y - 2Y):
        - Inverted (<0): Recession signal (RISK-OFF)
        - Flat (0-0.5): Caution
        - Steep (>0.5): Healthy economy (RISK-ON)

        Yield Movement:
        - Rising fast: Fed tightening / inflation concern
        - Falling fast: Flight to safety
        """
        try:
            # 10-year Treasury
            tnx = yf.Ticker("^TNX")
            tnx_data = tnx.history(period='3mo')

            # Short-term Treasury: ^IRX is 13-week T-Bill (annualized yield)
            # Used as short-term rate proxy for yield curve slope
            irx = yf.Ticker("^IRX")
            irx_data = irx.history(period='3mo')

            if len(tnx_data) == 0 or len(irx_data) == 0:
                return {'error': 'Treasury data not available'}

            current_10y = tnx_data['Close'].iloc[-1]
            # ^IRX already reports annualized yield - DO NOT multiply
            current_2y = irx_data['Close'].iloc[-1]

            # Validate yields are in reasonable range (0-15%)
            if current_10y < 0 or current_10y > 15:
                return {'error': f'10Y yield {current_10y:.2f}% outside valid range'}
            if current_2y < 0 or current_2y > 15:
                return {'error': f'Short-term yield {current_2y:.2f}% outside valid range'}

            # Yield curve
            yield_curve = current_10y - current_2y

            # Yield change over 1 month
            yield_change_1m = current_10y - tnx_data['Close'].iloc[0]

            # Interpret yield curve
            if yield_curve < 0:
                curve_signal = 'INVERTED'
                curve_color = '🔴'
                curve_interpretation = 'inverted_curve'
            elif yield_curve < 0.5:
                curve_signal = 'FLAT'
                curve_color = '🟡'
                curve_interpretation = 'flat_curve'
            else:
                curve_signal = 'STEEP'
                curve_color = '🟢'
                curve_interpretation = 'steep_curve'

            # Interpret yield movement
            if yield_change_1m > 0.5:
                yield_signal = 'RISING'
                yield_interpretation = 'yields_rising'
            elif yield_change_1m < -0.5:
                yield_signal = 'FALLING'
                yield_interpretation = 'yields_falling'
            else:
                yield_signal = 'STABLE'
                yield_interpretation = 'yields_stable'

            return {
                '10y': current_10y,
                '2y': current_2y,
                'curve': yield_curve,
                'curve_signal': curve_signal,
                'curve_color': curve_color,
                'yield_change_1m': yield_change_1m,
                'yield_signal': yield_signal,
                'interpretation': [curve_interpretation, yield_interpretation],
                'description': self._yield_curve_description(yield_curve)
            }

        except Exception as e:
            print(f"⚠️ Treasury yields fetch error: {e}")
            return {'error': str(e)}

    def _yield_curve_description(self, curve: float) -> str:
        """Get human-readable yield curve description"""
        if curve < 0:
            return "Inverted yield curve - strong recession signal"
        elif curve < 0.5:
            return "Flat yield curve - economic slowdown concern"
        else:
            return "Steep yield curve - healthy economic growth"

    def _fetch_credit_spreads(self) -> Dict:
        """
        Fetch credit spreads (High Yield vs Investment Grade)

        Uses HYG (High Yield ETF) vs LQD (Investment Grade ETF)

        Widening spreads: Credit stress, risk-off
        Narrowing spreads: Credit health, risk-on
        """
        try:
            # HYG = High Yield Corporate Bonds
            hyg = yf.Ticker("HYG")
            hyg_data = hyg.history(period='6mo')

            # LQD = Investment Grade Corporate Bonds
            lqd = yf.Ticker("LQD")
            lqd_data = lqd.history(period='6mo')

            if len(hyg_data) == 0 or len(lqd_data) == 0:
                return {'error': 'Credit spread data not available'}

            # Calculate spread proxy using price ratio
            # Higher HYG/LQD = tighter spreads (risk-on)
            # Lower HYG/LQD = wider spreads (risk-off)
            current_ratio = hyg_data['Close'].iloc[-1] / lqd_data['Close'].iloc[-1]
            ratio_3m_ago = hyg_data['Close'].iloc[-60] / lqd_data['Close'].iloc[-60] if len(hyg_data) >= 60 else current_ratio
            ratio_6m_ago = hyg_data['Close'].iloc[0] / lqd_data['Close'].iloc[0]

            # Calculate changes
            change_3m = ((current_ratio / ratio_3m_ago) - 1) * 100
            change_6m = ((current_ratio / ratio_6m_ago) - 1) * 100

            # Interpret
            if change_3m > 2:
                interpretation = 'tightening'
                signal = 'RISK-ON'
                color = '🟢'
            elif change_3m < -2:
                interpretation = 'widening'
                signal = 'RISK-OFF'
                color = '🔴'
            else:
                interpretation = 'stable'
                signal = 'NEUTRAL'
                color = '⚪'

            return {
                'current_ratio': current_ratio,
                'change_3m': change_3m,
                'change_6m': change_6m,
                'interpretation': interpretation,
                'signal': signal,
                'color': color,
                'description': self._spread_description(interpretation)
            }

        except Exception as e:
            print(f"⚠️ Credit spreads fetch error: {e}")
            return {'error': str(e)}

    def _spread_description(self, interpretation: str) -> str:
        """Get human-readable credit spread description"""
        if interpretation == 'tightening':
            return "Credit spreads tightening - investors confident in credit quality"
        elif interpretation == 'widening':
            return "Credit spreads widening - investors demanding higher risk premium"
        else:
            return "Credit spreads stable - no major shifts in credit risk perception"

    def _fetch_market_breadth(self) -> Dict:
        """
        Fetch market breadth indicator (SPY vs RSP)

        SPY = Market-cap weighted S&P 500
        RSP = Equal-weight S&P 500

        RSP outperforming SPY = Healthy breadth (many stocks rising)
        SPY outperforming RSP = Narrow leadership (few stocks carrying market)
        """
        try:
            # SPY = S&P 500
            spy = yf.Ticker("SPY")
            spy_data = spy.history(period='3mo')

            # RSP = Equal-weight S&P 500
            rsp = yf.Ticker("RSP")
            rsp_data = rsp.history(period='3mo')

            if len(spy_data) == 0 or len(rsp_data) == 0:
                return {'error': 'Market breadth data not available'}

            # Calculate returns
            spy_1m_return = ((spy_data['Close'].iloc[-1] / spy_data['Close'].iloc[-20]) - 1) * 100 if len(spy_data) >= 20 else 0
            rsp_1m_return = ((rsp_data['Close'].iloc[-1] / rsp_data['Close'].iloc[-20]) - 1) * 100 if len(rsp_data) >= 20 else 0

            spy_3m_return = ((spy_data['Close'].iloc[-1] / spy_data['Close'].iloc[0]) - 1) * 100
            rsp_3m_return = ((rsp_data['Close'].iloc[-1] / rsp_data['Close'].iloc[0]) - 1) * 100

            # Breadth = RSP return - SPY return
            breadth_1m = rsp_1m_return - spy_1m_return
            breadth_3m = rsp_3m_return - spy_3m_return

            # Interpret
            if breadth_1m > 2:
                interpretation = 'healthy_breadth'
                signal = 'RISK-ON'
                color = '🟢'
            elif breadth_1m < -2:
                interpretation = 'narrow_leadership'
                signal = 'CAUTION'
                color = '🟡'
            else:
                interpretation = 'neutral'
                signal = 'NEUTRAL'
                color = '⚪'

            return {
                'spy_1m_return': spy_1m_return,
                'rsp_1m_return': rsp_1m_return,
                'spy_3m_return': spy_3m_return,
                'rsp_3m_return': rsp_3m_return,
                'breadth_1m': breadth_1m,
                'breadth_3m': breadth_3m,
                'interpretation': interpretation,
                'signal': signal,
                'color': color,
                'description': self._breadth_description(interpretation)
            }

        except Exception as e:
            print(f"⚠️ Market breadth fetch error: {e}")
            return {'error': str(e)}

    def _breadth_description(self, interpretation: str) -> str:
        """Get human-readable breadth description"""
        if interpretation == 'healthy_breadth':
            return "Broad participation - many stocks rising together"
        elif interpretation == 'narrow_leadership':
            return "Narrow leadership - few large caps carrying the market"
        else:
            return "Neutral breadth - mixed participation"

    def _fetch_market_momentum(self) -> Dict:
        """
        Fetch market momentum indicators

        Uses S&P 500 short-term vs long-term trends
        """
        try:
            spy = yf.Ticker("SPY")
            spy_data = spy.history(period='6mo')

            if len(spy_data) == 0:
                return {'error': 'Momentum data not available'}

            current_price = spy_data['Close'].iloc[-1]

            # Calculate moving averages
            ma_20 = spy_data['Close'].rolling(20).mean().iloc[-1] if len(spy_data) >= 20 else current_price
            ma_50 = spy_data['Close'].rolling(50).mean().iloc[-1] if len(spy_data) >= 50 else current_price

            # Price vs MAs
            above_20ma = (current_price / ma_20 - 1) * 100
            above_50ma = (current_price / ma_50 - 1) * 100

            # Recent momentum
            momentum_1m = ((current_price / spy_data['Close'].iloc[-20]) - 1) * 100 if len(spy_data) >= 20 else 0
            momentum_3m = ((current_price / spy_data['Close'].iloc[-60]) - 1) * 100 if len(spy_data) >= 60 else 0

            # Interpret
            if momentum_1m > 3 and above_20ma > 0:
                interpretation = 'strong_uptrend'
                signal = 'RISK-ON'
                color = '🟢'
            elif momentum_1m < -3 and above_20ma < 0:
                interpretation = 'strong_downtrend'
                signal = 'RISK-OFF'
                color = '🔴'
            else:
                interpretation = 'neutral'
                signal = 'NEUTRAL'
                color = '⚪'

            return {
                'current_price': current_price,
                'ma_20': ma_20,
                'ma_50': ma_50,
                'above_20ma': above_20ma,
                'above_50ma': above_50ma,
                'momentum_1m': momentum_1m,
                'momentum_3m': momentum_3m,
                'interpretation': interpretation,
                'signal': signal,
                'color': color,
                'description': self._momentum_description(interpretation)
            }

        except Exception as e:
            print(f"⚠️ Momentum fetch error: {e}")
            return {'error': str(e)}

    def _momentum_description(self, interpretation: str) -> str:
        """Get human-readable momentum description"""
        if interpretation == 'strong_uptrend':
            return "Strong upward momentum - bullish trend intact"
        elif interpretation == 'strong_downtrend':
            return "Strong downward momentum - bearish trend"
        else:
            return "Neutral momentum - no clear trend"

    def detect_regime(self) -> Dict:
        """
        Synthesize all indicators into regime classification

        Scoring system:
        - Each indicator contributes to score
        - Positive score = Risk-on
        - Negative score = Risk-off
        - Score range: -10 to +10

        Returns regime classification and confidence
        """
        if not self.indicators:
            self.fetch_market_indicators()

        # Initialize score
        score = 0
        max_score = 10
        reasoning = []

        # VIX contribution (-3 to +2)
        vix = self.indicators.get('vix', {})
        if not vix.get('error'):
            if vix['interpretation'] == 'complacency':
                score += 2
                reasoning.append(f"{vix['color']} VIX low at {vix['current']:.1f} (complacency)")
            elif vix['interpretation'] == 'normal':
                score += 1
                reasoning.append(f"{vix['color']} VIX normal at {vix['current']:.1f}")
            elif vix['interpretation'] == 'elevated_fear':
                score -= 1
                reasoning.append(f"{vix['color']} VIX elevated at {vix['current']:.1f} (caution)")
            elif vix['interpretation'] == 'panic':
                score -= 3
                reasoning.append(f"{vix['color']} VIX high at {vix['current']:.1f} (panic)")

        # Credit spreads contribution (-2 to +2)
        spreads = self.indicators.get('credit_spreads', {})
        if not spreads.get('error'):
            if spreads['interpretation'] == 'tightening':
                score += 2
                reasoning.append(f"{spreads['color']} Credit spreads tightening ({spreads['change_3m']:+.1f}% 3M)")
            elif spreads['interpretation'] == 'widening':
                score -= 2
                reasoning.append(f"{spreads['color']} Credit spreads widening ({spreads['change_3m']:+.1f}% 3M)")

        # Yield curve contribution (-2 to +1)
        yields = self.indicators.get('yields', {})
        if not yields.get('error'):
            if 'inverted_curve' in yields['interpretation']:
                score -= 2
                reasoning.append(f"{yields['curve_color']} Yield curve inverted ({yields['curve']:.2f}%)")
            elif 'steep_curve' in yields['interpretation']:
                score += 1
                reasoning.append(f"{yields['curve_color']} Yield curve steep ({yields['curve']:.2f}%)")

            if 'yields_falling' in yields['interpretation']:
                score -= 1
                reasoning.append("📉 Yields falling (flight to safety)")

        # Market breadth contribution (-1 to +2)
        breadth = self.indicators.get('breadth', {})
        if not breadth.get('error'):
            if breadth['interpretation'] == 'healthy_breadth':
                score += 2
                reasoning.append(f"{breadth['color']} Healthy breadth (RSP outperforming)")
            elif breadth['interpretation'] == 'narrow_leadership':
                score -= 1
                reasoning.append(f"{breadth['color']} Narrow leadership (concentration risk)")

        # Momentum contribution (-1 to +1)
        momentum = self.indicators.get('momentum', {})
        if not momentum.get('error'):
            if momentum['interpretation'] == 'strong_uptrend':
                score += 1
                reasoning.append(f"{momentum['color']} Strong uptrend ({momentum['momentum_1m']:+.1f}% 1M)")
            elif momentum['interpretation'] == 'strong_downtrend':
                score -= 1
                reasoning.append(f"{momentum['color']} Strong downtrend ({momentum['momentum_1m']:+.1f}% 1M)")

        # Classify regime based on score
        if score >= 4:
            regime = 'risk_on'
            regime_label = 'RISK-ON'
            regime_color = '🟢'
        elif score <= -4:
            regime = 'risk_off'
            regime_label = 'RISK-OFF'
            regime_color = '🔴'
        elif -1 <= score <= 1:
            regime = 'neutral'
            regime_label = 'NEUTRAL'
            regime_color = '⚪'
        else:
            regime = 'transitional'
            regime_label = 'TRANSITIONAL'
            regime_color = '🟡'

        confidence = min(abs(score) / max_score * 100, 100)

        self.current_regime = regime
        self.regime_score = score

        return {
            'regime': regime,
            'regime_label': regime_label,
            'regime_color': regime_color,
            'score': score,
            'max_score': max_score,
            'confidence': confidence,
            'indicators': self.indicators,
            'reasoning': reasoning,
            'timestamp': self.last_update
        }

    def get_sector_tilts(self, regime: Optional[str] = None) -> Dict[str, float]:
        """
        Get recommended sector tilts based on regime

        Returns dict: {sector: multiplier}
        - 1.0 = neutral
        - >1.0 = overweight
        - <1.0 = underweight
        """
        if regime is None:
            regime = self.current_regime

        if regime == 'risk_on':
            # Overweight cyclicals, tech, growth
            return {
                'Technology': 1.30,
                'Communication Services': 1.25,
                'Consumer Discretionary': 1.20,
                'Financials': 1.15,
                'Industrials': 1.10,
                'Energy': 1.15,
                'Materials': 1.10,
                'Healthcare': 1.00,
                'Consumer Staples': 0.80,
                'Utilities': 0.70,
                'Real Estate': 0.85
            }

        elif regime == 'risk_off':
            # Overweight defensives
            return {
                'Utilities': 1.40,
                'Consumer Staples': 1.35,
                'Healthcare': 1.25,
                'Real Estate': 1.15,
                'Communication Services': 1.00,
                'Materials': 0.90,
                'Industrials': 0.85,
                'Energy': 0.80,
                'Financials': 0.75,
                'Consumer Discretionary': 0.70,
                'Technology': 0.65
            }

        elif regime == 'transitional':
            # Balanced, slight defensive tilt
            return {
                'Healthcare': 1.15,
                'Utilities': 1.10,
                'Consumer Staples': 1.10,
                'Technology': 0.95,
                'Communication Services': 1.00,
                'Financials': 0.95,
                'Consumer Discretionary': 0.90,
                'Industrials': 1.00,
                'Real Estate': 1.05,
                'Energy': 1.00,
                'Materials': 1.00
            }

        else:  # neutral
            # No tilts
            return {
                'Technology': 1.0,
                'Healthcare': 1.0,
                'Financials': 1.0,
                'Consumer Discretionary': 1.0,
                'Consumer Staples': 1.0,
                'Communication Services': 1.0,
                'Industrials': 1.0,
                'Utilities': 1.0,
                'Real Estate': 1.0,
                'Energy': 1.0,
                'Materials': 1.0
            }


__all__ = ['QuantitativeRegimeDetector']
