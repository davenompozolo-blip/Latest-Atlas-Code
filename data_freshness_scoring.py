"""
ATLAS TERMINAL v10.0 - DATA FRESHNESS SCORING
==============================================

Intelligent data quality scoring system:
- Freshness scoring (how recent is the data?)
- Source reliability scoring
- Cross-validation scoring
- Confidence intervals
- Data quality badges

Helps you know when to trust your data! 🎯
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from enum import Enum
from dataclasses import dataclass


# ===================================================================
# DATA QUALITY ENUMS
# ===================================================================

class DataQuality(Enum):
    """Overall data quality rating"""
    EXCELLENT = "Excellent"      # 90-100%
    GOOD = "Good"                # 75-89%
    FAIR = "Fair"                # 60-74%
    POOR = "Poor"                # 40-59%
    UNRELIABLE = "Unreliable"    # <40%


class FreshnessScore(Enum):
    """Data freshness rating"""
    REAL_TIME = 100      # < 15 seconds
    VERY_FRESH = 90      # 15s - 1 min
    FRESH = 75           # 1 min - 5 min
    RECENT = 60          # 5 min - 15 min
    STALE = 40           # 15 min - 1 hour
    VERY_STALE = 20      # 1 hour - 1 day
    EXPIRED = 0          # > 1 day


class SourceReliability(Enum):
    """Source reliability rating"""
    TIER_1 = 100         # Bloomberg, Reuters (institutional)
    TIER_2 = 85          # Alpha Vantage, IEX Cloud (paid APIs)
    TIER_3 = 70          # Yahoo Finance (free APIs)
    TIER_4 = 50          # Web scraping (best effort)
    TIER_5 = 25          # Experimental sources


# ===================================================================
# DATA QUALITY SCORING
# ===================================================================

@dataclass
class DataQualityScore:
    """Complete data quality assessment"""
    overall_score: float           # 0-100
    freshness_score: float         # 0-100
    reliability_score: float       # 0-100
    validation_score: float        # 0-100
    confidence_interval: Tuple[float, float]  # Lower, upper bounds
    quality_rating: DataQuality
    timestamp: datetime
    sources_used: List[str]
    warnings: List[str]


class DataQualityScorer:
    """
    Calculate comprehensive data quality scores.
    """

    def __init__(self):
        # Source reliability mapping
        self.source_reliability = {
            'Bloomberg Terminal': SourceReliability.TIER_1,
            'Reuters': SourceReliability.TIER_1,
            'Alpha Vantage': SourceReliability.TIER_2,
            'IEX Cloud': SourceReliability.TIER_2,
            'Polygon.io': SourceReliability.TIER_2,
            'Financial Modeling Prep': SourceReliability.TIER_2,
            'Yahoo Finance': SourceReliability.TIER_3,
            'Finnhub': SourceReliability.TIER_3,
            'Investing.com': SourceReliability.TIER_4,
            'MarketWatch': SourceReliability.TIER_4,
            'Experimental': SourceReliability.TIER_5
        }

    def calculate_freshness_score(self, timestamp: datetime) -> float:
        """
        Calculate freshness score based on data age.

        Returns score 0-100.
        """
        age = datetime.now() - timestamp
        seconds = age.total_seconds()

        if seconds < 15:
            return FreshnessScore.REAL_TIME.value
        elif seconds < 60:
            return FreshnessScore.VERY_FRESH.value
        elif seconds < 300:  # 5 minutes
            return FreshnessScore.FRESH.value
        elif seconds < 900:  # 15 minutes
            return FreshnessScore.RECENT.value
        elif seconds < 3600:  # 1 hour
            return FreshnessScore.STALE.value
        elif seconds < 86400:  # 1 day
            return FreshnessScore.VERY_STALE.value
        else:
            return FreshnessScore.EXPIRED.value

    def calculate_reliability_score(self, sources: List[str]) -> float:
        """
        Calculate reliability score based on sources used.

        Returns weighted average of source reliability.
        """
        if not sources:
            return 0

        scores = []
        for source in sources:
            reliability = self.source_reliability.get(source, SourceReliability.TIER_5)
            scores.append(reliability.value)

        # Weighted average (prioritize better sources)
        scores_sorted = sorted(scores, reverse=True)
        weights = [1.0 / (i + 1) for i in range(len(scores_sorted))]
        weighted_sum = sum(s * w for s, w in zip(scores_sorted, weights))
        weight_total = sum(weights)

        return weighted_sum / weight_total

    def calculate_validation_score(self, values: List[float]) -> Tuple[float, List[str]]:
        """
        Calculate validation score based on cross-source agreement.

        Returns (score, warnings).
        """
        if len(values) < 2:
            return 50, ["Only single source - cannot cross-validate"]

        values_array = np.array(values)
        mean = np.mean(values_array)
        std = np.std(values_array)

        warnings = []

        # Coefficient of variation
        if mean != 0:
            cv = std / abs(mean)

            if cv < 0.01:
                score = 100  # Excellent agreement
            elif cv < 0.02:
                score = 90   # Very good agreement
            elif cv < 0.05:
                score = 75   # Good agreement
            elif cv < 0.10:
                score = 60   # Fair agreement
                warnings.append(f"Moderate variance across sources (CV={cv:.2%})")
            else:
                score = 30   # Poor agreement
                warnings.append(f"High variance across sources (CV={cv:.2%})")
        else:
            score = 0
            warnings.append("Cannot calculate variance (mean is zero)")

        # Check for outliers (> 2 std deviations)
        outliers = np.abs(values_array - mean) > 2 * std
        if outliers.any():
            n_outliers = outliers.sum()
            warnings.append(f"{n_outliers} outlier(s) detected")
            score *= 0.8  # Reduce score

        return score, warnings

    def calculate_confidence_interval(
        self,
        values: List[float],
        confidence: float = 0.95
    ) -> Tuple[float, float]:
        """
        Calculate confidence interval for aggregated value.

        Returns (lower_bound, upper_bound).
        """
        if len(values) < 2:
            # Can't calculate CI with single value
            mean = values[0] if values else 0
            return (mean * 0.99, mean * 1.01)  # ±1% as placeholder

        values_array = np.array(values)
        mean = np.mean(values_array)
        std = np.std(values_array, ddof=1)  # Sample std
        n = len(values_array)

        # Calculate margin of error (using t-distribution)
        try:
            from scipy import stats
            t_critical = stats.t.ppf((1 + confidence) / 2, n - 1)
            margin = t_critical * (std / np.sqrt(n))
        except ImportError:
            # Fallback if scipy not available (use z-score approximation)
            z_critical = 1.96  # For 95% confidence
            margin = z_critical * (std / np.sqrt(n))

        return (mean - margin, mean + margin)

    def score_data_quality(
        self,
        values: List[float],
        timestamps: List[datetime],
        sources: List[str]
    ) -> DataQualityScore:
        """
        Calculate comprehensive data quality score.

        Args:
            values: List of values from different sources
            timestamps: List of timestamps for each value
            sources: List of source names

        Returns:
            DataQualityScore object
        """
        # Calculate component scores
        freshness_score = self.calculate_freshness_score(max(timestamps))
        reliability_score = self.calculate_reliability_score(sources)
        validation_score, validation_warnings = self.calculate_validation_score(values)

        # Overall score (weighted average)
        overall_score = (
            freshness_score * 0.3 +       # 30% weight on freshness
            reliability_score * 0.4 +     # 40% weight on source reliability
            validation_score * 0.3        # 30% weight on cross-validation
        )

        # Confidence interval
        ci = self.calculate_confidence_interval(values)

        # Quality rating
        if overall_score >= 90:
            quality = DataQuality.EXCELLENT
        elif overall_score >= 75:
            quality = DataQuality.GOOD
        elif overall_score >= 60:
            quality = DataQuality.FAIR
        elif overall_score >= 40:
            quality = DataQuality.POOR
        else:
            quality = DataQuality.UNRELIABLE

        return DataQualityScore(
            overall_score=overall_score,
            freshness_score=freshness_score,
            reliability_score=reliability_score,
            validation_score=validation_score,
            confidence_interval=ci,
            quality_rating=quality,
            timestamp=max(timestamps),
            sources_used=sources,
            warnings=validation_warnings
        )


# ===================================================================
# DATA QUALITY BADGES
# ===================================================================

class DataQualityBadge:
    """
    Generate visual badges for data quality.
    """

    @staticmethod
    def get_quality_emoji(quality: DataQuality) -> str:
        """Get emoji for quality rating"""
        emojis = {
            DataQuality.EXCELLENT: "🟢",
            DataQuality.GOOD: "🟡",
            DataQuality.FAIR: "🟠",
            DataQuality.POOR: "🔴",
            DataQuality.UNRELIABLE: "⚫"
        }
        return emojis.get(quality, "⚪")

    @staticmethod
    def get_quality_color(quality: DataQuality) -> str:
        """Get color hex for quality rating"""
        colors = {
            DataQuality.EXCELLENT: "#00ff00",
            DataQuality.GOOD: "#90ee90",
            DataQuality.FAIR: "#ffa500",
            DataQuality.POOR: "#ff6347",
            DataQuality.UNRELIABLE: "#8b0000"
        }
        return colors.get(quality, "#ffffff")

    @staticmethod
    def format_badge(score: DataQualityScore) -> str:
        """
        Format quality score as text badge.
        """
        emoji = DataQualityBadge.get_quality_emoji(score.quality_rating)

        badge = f"""
{emoji} DATA QUALITY: {score.quality_rating.value.upper()} ({score.overall_score:.0f}/100)

📊 Component Scores:
   • Freshness: {score.freshness_score:.0f}/100
   • Reliability: {score.reliability_score:.0f}/100
   • Validation: {score.validation_score:.0f}/100

📈 Confidence Interval: [{score.confidence_interval[0]:.2f}, {score.confidence_interval[1]:.2f}]

🔗 Sources: {', '.join(score.sources_used)}

⏰ Last Updated: {score.timestamp.strftime('%Y-%m-%d %H:%M:%S')}
"""

        if score.warnings:
            badge += f"\n⚠️ Warnings:\n"
            for warning in score.warnings:
                badge += f"   • {warning}\n"

        return badge


# ===================================================================
# PORTFOLIO-LEVEL QUALITY ASSESSMENT
# ===================================================================

class PortfolioDataQuality:
    """
    Assess data quality for entire portfolio.
    """

    def __init__(self):
        self.scorer = DataQualityScorer()

    def assess_portfolio_quality(
        self,
        portfolio_data: Dict[str, Dict]
    ) -> pd.DataFrame:
        """
        Assess data quality for all positions in portfolio.

        Args:
            portfolio_data: Dict mapping tickers to their data:
                {
                    'AAPL': {
                        'values': [150.0, 150.5, 150.2],
                        'timestamps': [...],
                        'sources': ['Yahoo', 'Alpha Vantage', ...]
                    },
                    ...
                }

        Returns:
            DataFrame with quality metrics for each position
        """
        results = []

        for ticker, data in portfolio_data.items():
            score = self.scorer.score_data_quality(
                values=data['values'],
                timestamps=data['timestamps'],
                sources=data['sources']
            )

            results.append({
                'ticker': ticker,
                'overall_score': score.overall_score,
                'quality_rating': score.quality_rating.value,
                'freshness': score.freshness_score,
                'reliability': score.reliability_score,
                'validation': score.validation_score,
                'ci_lower': score.confidence_interval[0],
                'ci_upper': score.confidence_interval[1],
                'sources': len(score.sources_used),
                'warnings': len(score.warnings)
            })

        return pd.DataFrame(results).sort_values('overall_score', ascending=False)

    def get_portfolio_health_summary(
        self,
        quality_df: pd.DataFrame
    ) -> Dict:
        """
        Generate portfolio-level data health summary.
        """
        return {
            'average_score': quality_df['overall_score'].mean(),
            'excellent_positions': len(quality_df[quality_df['quality_rating'] == 'Excellent']),
            'good_positions': len(quality_df[quality_df['quality_rating'] == 'Good']),
            'fair_positions': len(quality_df[quality_df['quality_rating'] == 'Fair']),
            'poor_positions': len(quality_df[quality_df['quality_rating'] == 'Poor']),
            'unreliable_positions': len(quality_df[quality_df['quality_rating'] == 'Unreliable']),
            'total_warnings': quality_df['warnings'].sum(),
            'min_score': quality_df['overall_score'].min(),
            'max_score': quality_df['overall_score'].max()
        }


# ===================================================================
# EXAMPLE USAGE
# ===================================================================

if __name__ == "__main__":
    print("="*80)
    print("ATLAS TERMINAL - DATA FRESHNESS SCORING")
    print("="*80)

    # Example: Score single data point
    scorer = DataQualityScorer()

    # Simulate data from 3 sources
    values = [150.25, 150.30, 150.22]
    timestamps = [
        datetime.now() - timedelta(seconds=10),
        datetime.now() - timedelta(seconds=5),
        datetime.now()
    ]
    sources = ['Yahoo Finance', 'Alpha Vantage', 'IEX Cloud']

    score = scorer.score_data_quality(values, timestamps, sources)

    print("\n📊 DATA QUALITY ASSESSMENT:")
    print(DataQualityBadge.format_badge(score))

    # Example: Portfolio-level assessment
    print("\n\n📈 PORTFOLIO QUALITY ASSESSMENT:")
    print("-" * 80)

    portfolio_data = {
        'AAPL': {
            'values': [150.0, 150.5, 150.2],
            'timestamps': [datetime.now() - timedelta(seconds=i*5) for i in range(3)],
            'sources': ['Yahoo Finance', 'Alpha Vantage', 'IEX Cloud']
        },
        'GOOGL': {
            'values': [2800.0, 2805.0],
            'timestamps': [datetime.now() - timedelta(seconds=30), datetime.now()],
            'sources': ['Yahoo Finance', 'Alpha Vantage']
        },
        'MSFT': {
            'values': [380.0],
            'timestamps': [datetime.now() - timedelta(hours=2)],
            'sources': ['Yahoo Finance']
        }
    }

    portfolio_quality = PortfolioDataQuality()
    quality_df = portfolio_quality.assess_portfolio_quality(portfolio_data)

    print("\nPosition Quality Scores:")
    print(quality_df[['ticker', 'overall_score', 'quality_rating', 'sources', 'warnings']].to_string(index=False))

    summary = portfolio_quality.get_portfolio_health_summary(quality_df)

    print(f"\n\nPortfolio Health Summary:")
    print(f"  Average Score: {summary['average_score']:.1f}/100")
    print(f"  Excellent: {summary['excellent_positions']}")
    print(f"  Good: {summary['good_positions']}")
    print(f"  Fair: {summary['fair_positions']}")
    print(f"  Poor: {summary['poor_positions']}")
    print(f"  Unreliable: {summary['unreliable_positions']}")
    print(f"  Total Warnings: {summary['total_warnings']}")

    print("\n" + "="*80)
