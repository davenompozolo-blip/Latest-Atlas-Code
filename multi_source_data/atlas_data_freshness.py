"""
ATLAS Data Freshness Scoring
Evaluate data quality and recency
"""

from datetime import datetime, timedelta
from typing import Dict
import pandas as pd


def calculate_freshness_score(last_update: datetime) -> float:
    """
    Calculate freshness score (0-100)

    Args:
        last_update: Timestamp of last data update

    Returns:
        Score from 0 (stale) to 100 (fresh)
    """
    age_minutes = (datetime.now() - last_update).total_seconds() / 60

    # Scoring logic
    if age_minutes < 5:
        return 100.0
    elif age_minutes < 15:
        return 90.0
    elif age_minutes < 60:
        return 75.0
    elif age_minutes < 240:
        return 50.0
    elif age_minutes < 1440:  # 24 hours
        return 25.0
    else:
        return 0.0


def evaluate_data_quality(data: pd.DataFrame) -> Dict:
    """
    Evaluate data quality metrics

    Args:
        data: DataFrame to evaluate

    Returns:
        Dict with quality metrics
    """
    quality = {
        'completeness': 0.0,
        'consistency': 0.0,
        'accuracy': 0.0,
        'overall': 0.0
    }

    # Completeness: % of non-null values
    quality['completeness'] = (1 - data.isnull().sum().sum() / data.size) * 100

    # Consistency: no major jumps (>50% day-over-day)
    if len(data) > 1:
        pct_change = data.pct_change().abs()
        outliers = (pct_change > 0.5).sum().sum()
        quality['consistency'] = max(0, 100 - (outliers / data.size * 100))
    else:
        quality['consistency'] = 100.0

    # Accuracy: assume high if data is fresh (placeholder)
    quality['accuracy'] = 95.0

    # Overall score
    quality['overall'] = (
        quality['completeness'] * 0.4 +
        quality['consistency'] * 0.3 +
        quality['accuracy'] * 0.3
    )

    return quality


def print_quality_report(data: pd.DataFrame, last_update: datetime):
    """Print formatted quality report"""
    print("=" * 80)
    print("DATA QUALITY REPORT")
    print("=" * 80)

    # Freshness
    freshness = calculate_freshness_score(last_update)
    print(f"\n📊 Freshness Score: {freshness:.1f}/100")

    age_minutes = (datetime.now() - last_update).total_seconds() / 60
    print(f"   Last Update: {last_update.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"   Age: {age_minutes:.0f} minutes")

    # Quality metrics
    quality = evaluate_data_quality(data)
    print(f"\n📈 Data Quality:")
    print(f"   Completeness: {quality['completeness']:.1f}%")
    print(f"   Consistency: {quality['consistency']:.1f}%")
    print(f"   Accuracy: {quality['accuracy']:.1f}%")
    print(f"   Overall: {quality['overall']:.1f}%")

    print("\n" + "=" * 80)


__all__ = [
    'calculate_freshness_score',
    'evaluate_data_quality',
    'print_quality_report'
]
