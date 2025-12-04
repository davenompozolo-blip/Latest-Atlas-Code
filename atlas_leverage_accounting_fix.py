"""
ATLAS TERMINAL v10.0 - LEVERAGE ACCOUNTING FIX
===============================================

Fixes incorrect return calculations for portfolios with 2x margin leverage.

THE PROBLEM:
-----------
With 2x leverage:
- $100 equity → $200 position
- Position goes to $220
- OLD calculation: ($220 - $200) / $200 = 10% return ❌
- CORRECT: ($220 - $200) / $100 = 20% return ✅

THE FIX:
-------
Returns = (Current Position Value - Cost Basis) / Equity Used

This patch corrects:
1. Return calculations
2. Portfolio weights (should sum to 200% for 2x leverage)
3. Volatility amplification (2x leverage = 2x volatility)
4. Beta amplification
5. Risk metrics

Apply this to fix your 2x leveraged portfolio tracking!
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional


# ===================================================================
# LEVERAGE ACCOUNTING FORMULAS
# ===================================================================

def calculate_leveraged_return(
    current_value: float,
    cost_basis: float,
    equity: float,
    leverage_ratio: float = 2.0
) -> float:
    """
    Calculate correct return for leveraged position.

    Args:
        current_value: Current market value of position
        cost_basis: What you paid for the position (= equity × leverage)
        equity: Your own money invested
        leverage_ratio: Leverage multiplier (2.0 = 2x)

    Returns:
        Return as decimal (0.20 = 20%)

    Example:
        Equity: $100
        Leverage: 2x
        Cost Basis: $200 (borrowed $100)
        Current Value: $220

        Return = ($220 - $200) / $100 = 20%
    """
    profit_loss = current_value - cost_basis
    return profit_loss / equity


def calculate_leveraged_portfolio_return(
    positions: pd.DataFrame,
    leverage_ratio: float = 2.0
) -> float:
    """
    Calculate total portfolio return with leverage.

    Args:
        positions: DataFrame with columns:
            - 'current_value': Current market value
            - 'cost_basis': Purchase price
            - 'equity': Your money (not borrowed)
        leverage_ratio: Leverage multiplier

    Returns:
        Total portfolio return as decimal
    """
    total_profit_loss = (positions['current_value'] - positions['cost_basis']).sum()
    total_equity = positions['equity'].sum()

    return total_profit_loss / total_equity


def calculate_position_weight(
    position_value: float,
    total_equity: float,
    leverage_ratio: float = 2.0
) -> float:
    """
    Calculate position weight in leveraged portfolio.

    With 2x leverage, weights sum to 200% (not 100%).

    Args:
        position_value: Market value of position
        total_equity: Total equity in portfolio
        leverage_ratio: Leverage multiplier

    Returns:
        Weight as decimal (1.0 = 100%)

    Example:
        Position: $200
        Total Equity: $100
        Weight: $200 / $100 = 200% (2.0)
    """
    return position_value / total_equity


def amplify_volatility_for_leverage(
    base_volatility: float,
    leverage_ratio: float = 2.0
) -> float:
    """
    Amplify volatility for leveraged position.

    2x leverage = 2x volatility

    Args:
        base_volatility: Unleveraged volatility
        leverage_ratio: Leverage multiplier

    Returns:
        Amplified volatility
    """
    return base_volatility * leverage_ratio


def amplify_beta_for_leverage(
    base_beta: float,
    leverage_ratio: float = 2.0
) -> float:
    """
    Amplify beta for leveraged position.

    2x leverage = 2x beta

    Args:
        base_beta: Unleveraged beta
        leverage_ratio: Leverage multiplier

    Returns:
        Amplified beta
    """
    return base_beta * leverage_ratio


# ===================================================================
# PORTFOLIO CORRECTION FUNCTIONS
# ===================================================================

def fix_leveraged_portfolio_metrics(
    df: pd.DataFrame,
    leverage_ratio: float = 2.0,
    equity_column: str = 'equity',
    current_value_column: str = 'current_value',
    cost_basis_column: str = 'cost_basis'
) -> pd.DataFrame:
    """
    Fix all metrics in a leveraged portfolio DataFrame.

    Args:
        df: Portfolio DataFrame
        leverage_ratio: Leverage multiplier
        equity_column: Name of equity column
        current_value_column: Name of current value column
        cost_basis_column: Name of cost basis column

    Returns:
        Corrected DataFrame with new columns:
        - 'correct_return': Fixed return calculation
        - 'correct_weight': Fixed weight (based on equity)
        - 'amplified_volatility': Volatility × leverage
        - 'amplified_beta': Beta × leverage
    """
    df = df.copy()

    # Calculate correct returns
    df['correct_return'] = (
        (df[current_value_column] - df[cost_basis_column]) / df[equity_column]
    )

    # Calculate correct weights (based on equity, not position value)
    total_equity = df[equity_column].sum()
    df['correct_weight'] = df[current_value_column] / total_equity

    # Amplify volatility if present
    if 'volatility' in df.columns:
        df['amplified_volatility'] = df['volatility'] * leverage_ratio

    # Amplify beta if present
    if 'beta' in df.columns:
        df['amplified_beta'] = df['beta'] * leverage_ratio

    return df


def compare_old_vs_new_calculation(
    current_value: float,
    cost_basis: float,
    equity: float,
    leverage_ratio: float = 2.0
) -> Dict:
    """
    Compare old (wrong) vs new (correct) calculations.

    Returns dict showing the difference.
    """
    # Old (wrong) calculation
    old_return = (current_value - cost_basis) / cost_basis

    # New (correct) calculation
    new_return = (current_value - cost_basis) / equity

    return {
        'current_value': current_value,
        'cost_basis': cost_basis,
        'equity': equity,
        'leverage_ratio': leverage_ratio,
        'old_return': old_return,
        'new_return': new_return,
        'difference': new_return - old_return,
        'old_return_pct': f"{old_return * 100:.2f}%",
        'new_return_pct': f"{new_return * 100:.2f}%",
        'difference_pct': f"{(new_return - old_return) * 100:.2f}%"
    }


# ===================================================================
# DEMONSTRATION & VALIDATION
# ===================================================================

def demonstrate_leverage_fix():
    """
    Demonstrate the leverage accounting fix with examples.
    """
    print("="*80)
    print("ATLAS TERMINAL - LEVERAGE ACCOUNTING FIX DEMONSTRATION")
    print("="*80)

    print("\n📊 EXAMPLE 1: Single Position")
    print("-" * 80)

    # Example: $100 equity, 2x leverage, buy $200 of stock
    equity = 100
    leverage = 2.0
    cost_basis = equity * leverage  # $200
    current_value = 220  # Stock went up 10%

    comparison = compare_old_vs_new_calculation(
        current_value, cost_basis, equity, leverage
    )

    print(f"Equity Invested: ${equity:.2f}")
    print(f"Leverage: {leverage}x")
    print(f"Position Size: ${cost_basis:.2f}")
    print(f"Current Value: ${current_value:.2f}")
    print(f"\n❌ OLD (Wrong) Return: {comparison['old_return_pct']}")
    print(f"✅ NEW (Correct) Return: {comparison['new_return_pct']}")
    print(f"📊 Difference: {comparison['difference_pct']}")

    print("\n\n📊 EXAMPLE 2: Full Portfolio")
    print("-" * 80)

    # Create sample portfolio
    portfolio = pd.DataFrame({
        'ticker': ['AAPL', 'GOOGL', 'MSFT'],
        'equity': [100, 150, 200],  # Your money
        'cost_basis': [200, 300, 400],  # What you paid (with leverage)
        'current_value': [220, 315, 380],  # Current value
        'volatility': [0.25, 0.30, 0.22],  # Unleveraged volatility
        'beta': [1.2, 1.1, 1.0]  # Unleveraged beta
    })

    print("\nOriginal Portfolio:")
    print(portfolio[['ticker', 'equity', 'cost_basis', 'current_value']])

    # Apply fix
    fixed = fix_leveraged_portfolio_metrics(portfolio, leverage_ratio=2.0)

    print("\n\nCorrected Portfolio:")
    print(fixed[['ticker', 'correct_return', 'correct_weight', 'amplified_volatility', 'amplified_beta']])

    # Calculate portfolio totals
    total_return = (
        (fixed['current_value'].sum() - fixed['cost_basis'].sum()) /
        fixed['equity'].sum()
    )

    print(f"\n\n📈 PORTFOLIO TOTALS:")
    print(f"Total Equity: ${fixed['equity'].sum():.2f}")
    print(f"Total Position Value: ${fixed['current_value'].sum():.2f}")
    print(f"Total Return: {total_return * 100:.2f}%")
    print(f"Weights Sum: {fixed['correct_weight'].sum() * 100:.0f}% (should be 200% for 2x leverage)")

    print("\n\n📊 EXAMPLE 3: Weight Calculation")
    print("-" * 80)

    print("With 2x leverage, position weights should sum to 200%:")
    for _, row in fixed.iterrows():
        print(f"  {row['ticker']}: {row['correct_weight'] * 100:.1f}%")
    print(f"  TOTAL: {fixed['correct_weight'].sum() * 100:.0f}%")

    print("\n" + "="*80)


# ===================================================================
# INTEGRATION HELPERS
# ===================================================================

def integrate_leverage_fix_into_atlas(
    portfolio_df: pd.DataFrame,
    leverage_ratio: float = 2.0
) -> pd.DataFrame:
    """
    Main function to integrate into ATLAS Terminal.

    Call this on your portfolio DataFrame to fix all leverage calculations.

    Args:
        portfolio_df: Your existing portfolio DataFrame
        leverage_ratio: Your leverage multiplier

    Returns:
        Corrected DataFrame
    """
    # Ensure required columns exist
    required_columns = ['current_value', 'cost_basis', 'equity']
    missing = [col for col in required_columns if col not in portfolio_df.columns]

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Apply corrections
    corrected = fix_leveraged_portfolio_metrics(
        portfolio_df,
        leverage_ratio=leverage_ratio
    )

    # Add explanatory note
    print(f"✅ Applied {leverage_ratio}x leverage corrections to {len(corrected)} positions")
    print(f"   Total position value: ${corrected['current_value'].sum():,.2f}")
    print(f"   Total equity: ${corrected['equity'].sum():,.2f}")
    print(f"   Portfolio return: {corrected['correct_return'].mean() * 100:.2f}%")

    return corrected


# ===================================================================
# VALIDATION FUNCTIONS
# ===================================================================

def validate_leverage_calculations(df: pd.DataFrame, leverage_ratio: float = 2.0) -> Dict:
    """
    Validate that leverage calculations are correct.

    Returns dict with validation results.
    """
    results = {
        'valid': True,
        'warnings': [],
        'errors': []
    }

    # Check 1: Cost basis should equal equity × leverage
    expected_cost_basis = df['equity'] * leverage_ratio
    cost_basis_diff = abs(df['cost_basis'] - expected_cost_basis)

    if (cost_basis_diff > 0.01).any():
        results['warnings'].append(
            "Cost basis doesn't match equity × leverage for some positions"
        )

    # Check 2: Weights should sum to leverage_ratio × 100%
    total_weight = df['correct_weight'].sum()
    expected_weight = leverage_ratio

    if abs(total_weight - expected_weight) > 0.01:
        results['warnings'].append(
            f"Weights sum to {total_weight * 100:.1f}% instead of {expected_weight * 100:.0f}%"
        )

    # Check 3: Returns should be based on equity, not cost basis
    manual_returns = (df['current_value'] - df['cost_basis']) / df['equity']
    return_diff = abs(df['correct_return'] - manual_returns)

    if (return_diff > 0.001).any():
        results['errors'].append("Return calculations are incorrect")
        results['valid'] = False

    return results


# ===================================================================
# EXAMPLE USAGE
# ===================================================================

if __name__ == "__main__":
    # Run demonstration
    demonstrate_leverage_fix()

    print("\n\n💡 TO USE IN YOUR ATLAS TERMINAL:")
    print("="*80)
    print("""
# Import the fix
from atlas_leverage_accounting_fix import integrate_leverage_fix_into_atlas

# Apply to your portfolio DataFrame
corrected_portfolio = integrate_leverage_fix_into_atlas(
    portfolio_df=your_portfolio_df,
    leverage_ratio=2.0  # Your leverage
)

# Now use corrected_portfolio for all calculations!
# - Returns are correct
# - Weights sum to 200% (for 2x leverage)
# - Volatility is amplified 2x
# - Beta is amplified 2x
    """)
    print("="*80)
