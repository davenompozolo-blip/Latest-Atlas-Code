"""
ATLAS Sector Trend Analyzer
============================

Institutional-grade sector trend detection using:
- Volatility-adjusted returns (z-scores)
- Statistical significance testing (t-tests, p-values)
- Moving average crossovers and trend analysis
- Relative strength vs. benchmark
- Multi-timeframe momentum analysis
- Signal synthesis with confidence levels

Author: ATLAS Development Team
Version: 2.0.0 (Institutional Grade)
"""

import pandas as pd
import numpy as np
import yfinance as yf
from typing import Dict, List, Optional
from scipy import stats
import streamlit as st


# ============================================================
# SECTOR ETF MAPPING
# ============================================================

SECTOR_ETF_MAP = {
    'Technology': 'XLK',
    'Information Technology': 'XLK',
    'Healthcare': 'XLV',
    'Health Care': 'XLV',
    'Financials': 'XLF',
    'Consumer Discretionary': 'XLY',
    'Communication Services': 'XLC',
    'Industrials': 'XLI',
    'Consumer Staples': 'XLP',
    'Energy': 'XLE',
    'Utilities': 'XLU',
    'Real Estate': 'XLRE',
    'Materials': 'XLB',
    'Basic Materials': 'XLB'
}


class SectorTrendAnalyzer:
    """
    Institutional-grade sector trend detection

    Components:
    1. Momentum Analysis - Volatility-adjusted returns across multiple timeframes
    2. Trend Analysis - Moving average crossovers and alignment
    3. Volatility Analysis - Bollinger Bands and squeeze detection
    4. Relative Strength - Performance vs. benchmark (SPY)
    5. Statistical Significance - t-tests and confidence intervals
    """

    def __init__(self, confidence_threshold: float = 0.95):
        """
        Initialize analyzer

        Args:
            confidence_threshold: Minimum confidence for signals (default 95%)
        """
        self.confidence_threshold = confidence_threshold
        self.cache = {}  # Cache data fetches

    @st.cache_data(ttl=1800)  # Cache for 30 minutes
    def _fetch_data(_self, ticker: str, period: str = '2y') -> Optional[pd.DataFrame]:
        """Fetch historical data with caching"""
        try:
            data = yf.Ticker(ticker).history(period=period)
            return data if not data.empty else None
        except Exception as e:
            print(f"Error fetching {ticker}: {e}")
            return None

    def analyze_sector(self, sector_name: str, benchmark_ticker: str = 'SPY') -> Dict:
        """
        Comprehensive sector analysis

        Args:
            sector_name: Sector name (e.g., 'Technology')
            benchmark_ticker: Market benchmark (default SPY)

        Returns:
            Dict with signals, strength, confidence, and detailed metrics
        """

        # Get sector ETF ticker
        ticker = SECTOR_ETF_MAP.get(sector_name)
        if not ticker:
            return {
                'error': f'Unknown sector: {sector_name}',
                'ticker': None,
                'sector': sector_name
            }

        # Fetch data
        sector_data = self._fetch_data(ticker, period='2y')
        benchmark_data = self._fetch_data(benchmark_ticker, period='2y')

        if sector_data is None or benchmark_data is None:
            return {
                'error': 'Insufficient data',
                'ticker': ticker,
                'sector': sector_name
            }

        # Align timeframes
        sector_data, benchmark_data = sector_data.align(benchmark_data, join='inner')

        if len(sector_data) < 252:  # Need at least 1 year
            return {
                'error': 'Insufficient historical data',
                'ticker': ticker,
                'sector': sector_name
            }

        # Calculate returns
        sector_returns = sector_data['Close'].pct_change()
        benchmark_returns = benchmark_data['Close'].pct_change()

        # Run multi-component analysis
        signals = {}

        try:
            # 1. Momentum Analysis
            signals['momentum'] = self._analyze_momentum(sector_data)

            # 2. Trend Analysis (MA crossovers)
            signals['trend'] = self._analyze_trend(sector_data)

            # 3. Volatility Analysis
            signals['volatility'] = self._analyze_volatility(sector_returns)

            # 4. Relative Strength
            signals['relative_strength'] = self._analyze_relative_strength(
                sector_returns,
                benchmark_returns
            )

            # 5. Statistical Significance
            signals['significance'] = self._test_statistical_significance(sector_returns)

            # 6. Synthesize into actionable signal
            final_signal = self._synthesize_signals(signals, ticker, sector_name)

            return final_signal

        except Exception as e:
            return {
                'error': f'Analysis failed: {str(e)}',
                'ticker': ticker,
                'sector': sector_name
            }

    # ============================================================
    # COMPONENT 1: MOMENTUM ANALYSIS
    # ============================================================

    def _analyze_momentum(self, data: pd.DataFrame) -> Dict:
        """
        Analyze momentum across multiple timeframes with volatility adjustment

        Returns z-scores (volatility-adjusted returns) and percentile rankings
        """

        prices = data['Close']

        # Calculate returns for multiple periods
        returns = {
            '1M': prices.pct_change(21).iloc[-1] * 100 if len(prices) >= 21 else 0,
            '3M': prices.pct_change(63).iloc[-1] * 100 if len(prices) >= 63 else 0,
            '6M': prices.pct_change(126).iloc[-1] * 100 if len(prices) >= 126 else 0,
            '1Y': prices.pct_change(252).iloc[-1] * 100 if len(prices) >= 252 else 0,
        }

        # Calculate volatility-adjusted returns (z-scores)
        # Z-score = (return - mean) / std

        z_scores = {}
        percentiles = {}

        # 1M z-score and percentile
        if len(prices) >= 21:
            historical_1m = prices.pct_change(21) * 100
            historical_1m = historical_1m.dropna()
            if len(historical_1m) > 0 and historical_1m.std() > 0:
                z_scores['1M'] = (returns['1M'] - historical_1m.mean()) / historical_1m.std()
                percentiles['1M'] = (historical_1m < returns['1M']).sum() / len(historical_1m) * 100
            else:
                z_scores['1M'] = 0
                percentiles['1M'] = 50

        # 3M z-score and percentile
        if len(prices) >= 63:
            historical_3m = prices.pct_change(63) * 100
            historical_3m = historical_3m.dropna()
            if len(historical_3m) > 0 and historical_3m.std() > 0:
                z_scores['3M'] = (returns['3M'] - historical_3m.mean()) / historical_3m.std()
                percentiles['3M'] = (historical_3m < returns['3M']).sum() / len(historical_3m) * 100
            else:
                z_scores['3M'] = 0
                percentiles['3M'] = 50

        # Momentum acceleration (short-term > long-term)
        acceleration = returns.get('1M', 0) > returns.get('3M', 0)

        # Classify momentum strength
        strength = self._classify_momentum_strength(
            z_scores.get('1M', 0),
            percentiles.get('1M', 50)
        )

        return {
            'returns': returns,
            'z_scores': z_scores,
            'percentiles': percentiles,
            'acceleration': acceleration,
            'strength': strength
        }

    def _classify_momentum_strength(self, z_score: float, percentile: float) -> str:
        """
        Classify momentum using statistical thresholds

        Strong: z-score > 1.5 (top 7%) AND percentile > 85
        Moderate: z-score > 0.5 (top 31%) AND percentile > 65
        """

        if z_score > 1.5 and percentile > 85:
            return 'STRONG_BULLISH'
        elif z_score > 0.5 and percentile > 65:
            return 'MODERATE_BULLISH'
        elif z_score < -1.5 and percentile < 15:
            return 'STRONG_BEARISH'
        elif z_score < -0.5 and percentile < 35:
            return 'MODERATE_BEARISH'
        else:
            return 'NEUTRAL'

    # ============================================================
    # COMPONENT 2: TREND ANALYSIS (MOVING AVERAGES)
    # ============================================================

    def _analyze_trend(self, data: pd.DataFrame) -> Dict:
        """
        Analyze trend using multiple moving averages

        Detects:
        - Golden Cross (50-day MA crosses above 200-day MA)
        - Death Cross (50-day MA crosses below 200-day MA)
        - MA alignment (all MAs in bullish/bearish order)
        """

        prices = data['Close']

        # Calculate moving averages
        ma_20 = prices.rolling(20).mean()
        ma_50 = prices.rolling(50).mean()
        ma_200 = prices.rolling(200).mean()

        # Current values
        current_price = prices.iloc[-1]
        current_ma_20 = ma_20.iloc[-1] if not ma_20.empty else current_price
        current_ma_50 = ma_50.iloc[-1] if not ma_50.empty else current_price
        current_ma_200 = ma_200.iloc[-1] if not ma_200.empty else current_price

        # Previous values (for crossover detection)
        prev_ma_50 = ma_50.iloc[-2] if len(ma_50) >= 2 else current_ma_50
        prev_ma_200 = ma_200.iloc[-2] if len(ma_200) >= 2 else current_ma_200

        # Detect crossovers
        golden_cross = (prev_ma_50 < prev_ma_200) and (current_ma_50 > current_ma_200)
        death_cross = (prev_ma_50 > prev_ma_200) and (current_ma_50 < current_ma_200)

        # MA alignment
        bullish_alignment = (current_price > current_ma_20 > current_ma_50 > current_ma_200)
        bearish_alignment = (current_price < current_ma_20 < current_ma_50 < current_ma_200)

        # Distance from MAs (divergence)
        distance_from_ma_50 = (current_price / current_ma_50 - 1) * 100
        distance_from_ma_200 = (current_price / current_ma_200 - 1) * 100

        # Classify trend
        trend_strength = self._classify_trend_strength(
            bullish_alignment,
            bearish_alignment,
            distance_from_ma_50
        )

        return {
            'golden_cross': golden_cross,
            'death_cross': death_cross,
            'bullish_alignment': bullish_alignment,
            'bearish_alignment': bearish_alignment,
            'distance_from_ma_50': distance_from_ma_50,
            'distance_from_ma_200': distance_from_ma_200,
            'trend_strength': trend_strength
        }

    def _classify_trend_strength(self, bullish_align: bool, bearish_align: bool, distance: float) -> str:
        """Classify trend based on MA alignment and price distance"""

        if bullish_align and distance > 5:
            return 'STRONG_UPTREND'
        elif bullish_align:
            return 'UPTREND'
        elif bearish_align and distance < -5:
            return 'STRONG_DOWNTREND'
        elif bearish_align:
            return 'DOWNTREND'
        else:
            return 'SIDEWAYS'

    # ============================================================
    # COMPONENT 3: VOLATILITY ANALYSIS
    # ============================================================

    def _analyze_volatility(self, returns: pd.Series) -> Dict:
        """
        Analyze volatility using Bollinger Bands and squeeze detection
        """

        returns_clean = returns.dropna()

        if len(returns_clean) < 20:
            return {
                'current_vol': 0,
                'historical_vol': 0,
                'vol_ratio': 1,
                'outside_upper_band': False,
                'outside_lower_band': False,
                'squeeze': False,
                'regime': 'UNKNOWN'
            }

        # Current volatility (20-day annualized)
        current_vol = returns_clean.iloc[-20:].std() * np.sqrt(252) * 100

        # Historical volatility (full period annualized)
        historical_vol = returns_clean.std() * np.sqrt(252) * 100

        # Volatility ratio
        vol_ratio = current_vol / historical_vol if historical_vol > 0 else 1

        # Bollinger Bands
        ma_20 = returns_clean.rolling(20).mean()
        std_20 = returns_clean.rolling(20).std()

        upper_band = ma_20 + (2 * std_20)
        lower_band = ma_20 - (2 * std_20)

        current_return = returns_clean.iloc[-1]

        # Outside bands?
        outside_upper = current_return > upper_band.iloc[-1]
        outside_lower = current_return < lower_band.iloc[-1]

        # Volatility squeeze (bands narrowing)
        band_width = (upper_band - lower_band).iloc[-20:]
        current_width = band_width.iloc[-1]
        avg_width = band_width.mean()

        squeeze = current_width < (avg_width * 0.7) if avg_width > 0 else False

        # Classify regime
        regime = self._classify_vol_regime(vol_ratio, squeeze)

        return {
            'current_vol': current_vol,
            'historical_vol': historical_vol,
            'vol_ratio': vol_ratio,
            'outside_upper_band': outside_upper,
            'outside_lower_band': outside_lower,
            'squeeze': squeeze,
            'regime': regime
        }

    def _classify_vol_regime(self, vol_ratio: float, squeeze: bool) -> str:
        """Classify volatility regime"""

        if squeeze:
            return 'CONSOLIDATION'
        elif vol_ratio > 1.5:
            return 'HIGH_VOLATILITY'
        elif vol_ratio < 0.7:
            return 'LOW_VOLATILITY'
        else:
            return 'NORMAL_VOLATILITY'

    # ============================================================
    # COMPONENT 4: RELATIVE STRENGTH ANALYSIS
    # ============================================================

    def _analyze_relative_strength(self,
                                   sector_returns: pd.Series,
                                   benchmark_returns: pd.Series) -> Dict:
        """
        Analyze sector performance vs. benchmark

        Calculates beta, alpha, and relative strength
        """

        # Align data
        aligned = pd.DataFrame({
            'sector': sector_returns,
            'benchmark': benchmark_returns
        }).dropna()

        if len(aligned) < 30:
            return {
                'beta': 1.0,
                'alpha': 0.0,
                'relative_strength': {'1M': 0, '3M': 0, '6M': 0},
                'rs_improving': False,
                'classification': 'INSUFFICIENT_DATA'
            }

        # Calculate beta (regression)
        try:
            slope, intercept, r_value, p_value, std_err = stats.linregress(
                aligned['benchmark'],
                aligned['sector']
            )
            beta = slope
        except:
            beta = 1.0

        # Calculate alpha (annualized)
        sector_mean = aligned['sector'].mean() * 252
        benchmark_mean = aligned['benchmark'].mean() * 252
        alpha = sector_mean - (beta * benchmark_mean)

        # Relative strength (cumulative outperformance)
        rs_1m = (sector_returns.iloc[-21:].sum() - benchmark_returns.iloc[-21:].sum()) * 100 if len(sector_returns) >= 21 else 0
        rs_3m = (sector_returns.iloc[-63:].sum() - benchmark_returns.iloc[-63:].sum()) * 100 if len(sector_returns) >= 63 else 0
        rs_6m = (sector_returns.iloc[-126:].sum() - benchmark_returns.iloc[-126:].sum()) * 100 if len(sector_returns) >= 126 else 0

        # RS improving?
        rs_improving = rs_1m > rs_3m if rs_3m != 0 else False

        # Classify
        classification = self._classify_relative_strength(rs_1m, rs_3m, alpha)

        return {
            'beta': beta,
            'alpha': alpha,
            'relative_strength': {
                '1M': rs_1m,
                '3M': rs_3m,
                '6M': rs_6m
            },
            'rs_improving': rs_improving,
            'classification': classification
        }

    def _classify_relative_strength(self, rs_1m: float, rs_3m: float, alpha: float) -> str:
        """Classify relative strength vs. market"""

        if rs_1m > 3 and rs_3m > 3 and alpha > 0:
            return 'STRONG_OUTPERFORMANCE'
        elif rs_1m > 0 and alpha > 0:
            return 'OUTPERFORMANCE'
        elif rs_1m < -3 and rs_3m < -3 and alpha < 0:
            return 'STRONG_UNDERPERFORMANCE'
        elif rs_1m < 0 and alpha < 0:
            return 'UNDERPERFORMANCE'
        else:
            return 'IN_LINE_WITH_MARKET'

    # ============================================================
    # COMPONENT 5: STATISTICAL SIGNIFICANCE TESTING
    # ============================================================

    def _test_statistical_significance(self, returns: pd.Series) -> Dict:
        """
        Test if recent returns are statistically significant

        Uses t-test against null hypothesis (mean return = 0)
        """

        recent_returns = returns.iloc[-21:].dropna()

        if len(recent_returns) < 5:
            return {
                't_statistic': 0,
                'p_value': 1.0,
                'significant': False,
                'confidence_interval': (0, 0),
                'interpretation': 'INSUFFICIENT_DATA'
            }

        try:
            # t-test against zero
            t_stat, p_value = stats.ttest_1samp(recent_returns, 0)

            # Significant at 95% confidence?
            significant = p_value < 0.05

            # Confidence interval
            confidence_interval = stats.t.interval(
                confidence=0.95,
                df=len(recent_returns) - 1,
                loc=recent_returns.mean(),
                scale=stats.sem(recent_returns)
            )

            return {
                't_statistic': t_stat,
                'p_value': p_value,
                'significant': significant,
                'confidence_interval': confidence_interval,
                'interpretation': 'SIGNIFICANT' if significant else 'NOT_SIGNIFICANT'
            }
        except:
            return {
                't_statistic': 0,
                'p_value': 1.0,
                'significant': False,
                'confidence_interval': (0, 0),
                'interpretation': 'ERROR'
            }

    # ============================================================
    # SIGNAL SYNTHESIS
    # ============================================================

    def _synthesize_signals(self, signals: Dict, ticker: str, sector_name: str) -> Dict:
        """
        Synthesize all components into unified signal with confidence score

        Scoring system:
        - Momentum: ±3 points (strong), ±2 (moderate)
        - Trend: ±2 points (strong), ±1 (moderate)
        - Relative Strength: ±2 points (strong outperform), ±1 (outperform)
        - Statistical Significance: +20% confidence if significant
        """

        # Extract signals
        momentum_strength = signals['momentum']['strength']
        trend_strength = signals['trend']['trend_strength']
        vol_regime = signals['volatility']['regime']
        rs_classification = signals['relative_strength']['classification']
        is_significant = signals['significance']['significant']

        # Initialize scoring
        score = 0
        confidence = 0

        # Momentum contribution
        if momentum_strength == 'STRONG_BULLISH':
            score += 3
            confidence += 30
        elif momentum_strength == 'MODERATE_BULLISH':
            score += 2
            confidence += 20
        elif momentum_strength == 'STRONG_BEARISH':
            score -= 3
            confidence += 30
        elif momentum_strength == 'MODERATE_BEARISH':
            score -= 2
            confidence += 20

        # Trend contribution
        if trend_strength == 'STRONG_UPTREND':
            score += 2
            confidence += 20
        elif trend_strength == 'UPTREND':
            score += 1
            confidence += 10
        elif trend_strength == 'STRONG_DOWNTREND':
            score -= 2
            confidence += 20
        elif trend_strength == 'DOWNTREND':
            score -= 1
            confidence += 10

        # Relative strength contribution
        if rs_classification == 'STRONG_OUTPERFORMANCE':
            score += 2
            confidence += 20
        elif rs_classification == 'OUTPERFORMANCE':
            score += 1
            confidence += 10
        elif rs_classification == 'STRONG_UNDERPERFORMANCE':
            score -= 2
            confidence += 20
        elif rs_classification == 'UNDERPERFORMANCE':
            score -= 1
            confidence += 10

        # Statistical significance boost
        if is_significant:
            confidence += 20
        else:
            confidence = min(confidence, 50)  # Cap at 50% if not significant

        # Volatility regime adjustment
        if vol_regime == 'CONSOLIDATION':
            confidence *= 0.7
        elif vol_regime == 'HIGH_VOLATILITY':
            confidence *= 0.8

        # Final signal classification
        if score >= 5 and confidence >= 70:
            signal_type = 'STRONG_BULLISH'
            emoji = '🚀'
            message = 'Strong bullish momentum with high conviction'
            color = '#22c55e'
        elif score >= 3 and confidence >= 50:
            signal_type = 'BULLISH'
            emoji = '📈'
            message = 'Bullish trend developing'
            color = '#10b981'
        elif score <= -5 and confidence >= 70:
            signal_type = 'STRONG_BEARISH'
            emoji = '📉'
            message = 'Strong bearish momentum with high conviction'
            color = '#ef4444'
        elif score <= -3 and confidence >= 50:
            signal_type = 'BEARISH'
            emoji = '📊'
            message = 'Bearish pressure building'
            color = '#f87171'
        elif vol_regime == 'CONSOLIDATION' and abs(score) < 3:
            signal_type = 'CONSOLIDATION'
            emoji = '🔄'
            message = 'Consolidating - potential breakout setup'
            color = '#f59e0b'
        else:
            signal_type = 'NEUTRAL'
            emoji = '➡️'
            message = 'No clear directional bias'
            color = '#94a3b8'

        # Build explanation
        explanation = self._build_explanation(signals, score, confidence)

        return {
            'ticker': ticker,
            'sector': sector_name,
            'signal_type': signal_type,
            'emoji': emoji,
            'message': message,
            'score': score,
            'confidence': min(confidence, 100),
            'color': color,
            'components': signals,
            'explanation': explanation
        }

    def _build_explanation(self, signals: Dict, score: int, confidence: float) -> str:
        """Build detailed explanation with statistical metrics"""

        parts = []

        # Momentum
        momentum = signals['momentum']
        if '1M' in momentum['z_scores']:
            parts.append(
                f"Momentum: {momentum['returns']['1M']:.2f}% (1M), "
                f"z-score: {momentum['z_scores']['1M']:.2f}, "
                f"percentile: {momentum['percentiles'].get('1M', 0):.0f}%"
            )

        # Trend
        trend = signals['trend']
        if trend['golden_cross']:
            parts.append("🟢 Golden cross (50-day crossed above 200-day MA)")
        elif trend['death_cross']:
            parts.append("🔴 Death cross (50-day crossed below 200-day MA)")
        else:
            parts.append(f"Trend: {trend['trend_strength'].replace('_', ' ').title()}")

        # Relative strength
        rs = signals['relative_strength']
        parts.append(
            f"Relative Strength vs SPY: {rs['relative_strength']['1M']:+.2f}% (1M), "
            f"Beta: {rs['beta']:.2f}, Alpha: {rs['alpha']:.2%}"
        )

        # Statistical significance
        sig = signals['significance']
        if sig['significant']:
            parts.append(f"✅ Statistically significant (p={sig['p_value']:.3f})")
        else:
            parts.append(f"⚠️ Not statistically significant (p={sig['p_value']:.3f})")

        # Volatility
        vol = signals['volatility']
        parts.append(f"Volatility: {vol['regime'].replace('_', ' ').title()}")

        return " | ".join(parts)
