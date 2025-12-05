"""
ATLAS Heatmap Fix
Corrects monthly returns and correlation calculation
"""

import numpy as np
import pandas as pd
from typing import Tuple


def calculate_monthly_returns_correct(returns: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate monthly returns correctly

    Args:
        returns: DataFrame of daily returns

    Returns:
        DataFrame of monthly returns
    """
    # Ensure datetime index
    if not isinstance(returns.index, pd.DatetimeIndex):
        returns.index = pd.to_datetime(returns.index)

    # Resample to monthly, compound returns
    monthly = (1 + returns).resample('ME').prod() - 1

    return monthly


def create_correlation_matrix_correct(returns: pd.DataFrame) -> pd.DataFrame:
    """
    Create correlation matrix with eigenvalue correction

    This is the fix for the correlation matrix bug

    Args:
        returns: DataFrame of returns

    Returns:
        Corrected correlation matrix
    """
    # Calculate raw correlation
    corr = returns.corr()

    # Eigenvalue decomposition
    eigenvalues, eigenvectors = np.linalg.eigh(corr.values)

    # Correct negative eigenvalues
    eigenvalues = np.maximum(eigenvalues, 1e-8)

    # Reconstruct matrix
    corr_corrected = eigenvectors @ np.diag(eigenvalues) @ eigenvectors.T

    # Ensure diagonal is 1
    np.fill_diagonal(corr_corrected, 1.0)

    # Convert back to DataFrame
    corr_df = pd.DataFrame(
        corr_corrected,
        index=corr.index,
        columns=corr.columns
    )

    return corr_df


def validate_correlation_matrix(corr: pd.DataFrame) -> Tuple[bool, str]:
    """
    Validate correlation matrix properties

    Args:
        corr: Correlation matrix

    Returns:
        (is_valid, message)
    """
    # Check symmetric
    if not np.allclose(corr, corr.T):
        return False, "Matrix is not symmetric"

    # Check diagonal
    if not np.allclose(np.diag(corr), 1.0):
        return False, "Diagonal elements are not 1"

    # Check range [-1, 1]
    if not (corr.min().min() >= -1 and corr.max().max() <= 1):
        return False, "Values outside [-1, 1] range"

    # Check positive semi-definite
    eigenvalues = np.linalg.eigvalsh(corr.values)
    if eigenvalues.min() < -1e-6:
        return False, f"Matrix is not positive semi-definite (min eigenvalue: {eigenvalues.min():.6f})"

    return True, "Valid correlation matrix"


__all__ = [
    'calculate_monthly_returns_correct',
    'create_correlation_matrix_correct',
    'validate_correlation_matrix'
]
