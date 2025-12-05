"""
ATLAS Leverage Fix
Corrects leverage calculation issues from v9.x
"""

import numpy as np
import pandas as pd


def calculate_leverage_correct(weights: np.ndarray) -> float:
    """
    Calculate portfolio leverage correctly

    Leverage = sum of absolute weights

    Args:
        weights: Array of portfolio weights

    Returns:
        Leverage multiplier
    """
    return np.abs(weights).sum()


def apply_leverage_constraint(
    weights: np.ndarray,
    target_leverage: float = 2.0,
    tolerance: float = 0.01
) -> np.ndarray:
    """
    Scale weights to match target leverage

    Args:
        weights: Initial weights
        target_leverage: Desired leverage
        tolerance: Acceptable deviation

    Returns:
        Scaled weights
    """
    current_leverage = calculate_leverage_correct(weights)

    if abs(current_leverage - target_leverage) > tolerance:
        # Scale weights
        scaled_weights = weights * (target_leverage / current_leverage)
        return scaled_weights

    return weights


def validate_leverage_constraints(
    weights: np.ndarray,
    min_leverage: float = 1.0,
    max_leverage: float = 3.0
) -> bool:
    """
    Validate leverage is within bounds

    Args:
        weights: Portfolio weights
        min_leverage: Minimum allowed leverage
        max_leverage: Maximum allowed leverage

    Returns:
        True if valid
    """
    leverage = calculate_leverage_correct(weights)
    return min_leverage <= leverage <= max_leverage


__all__ = [
    'calculate_leverage_correct',
    'apply_leverage_constraint',
    'validate_leverage_constraints'
]
