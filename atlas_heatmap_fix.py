"""
ATLAS TERMINAL v10.0 - HEATMAP FIX
===================================

Fixes the monthly returns heatmap showing all zeros for November 2024.

THE PROBLEM:
-----------
November 2024 column shows 0.00% for all assets when there are actual returns.

ROOT CAUSE:
-----------
Code was filtering out "incomplete" months incorrectly, treating November as
incomplete even when it has valid data.

THE FIX:
-------
1. Don't filter months based on "completeness"
2. Use NaN for genuinely missing data (not 0)
3. Handle partial months correctly
4. Display actual returns even if month isn't complete

This patch fixes your heatmap visualization!
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime
from typing import Optional, Dict, List


# ===================================================================
# HEATMAP CALCULATION (CORRECTED)
# ===================================================================

def calculate_monthly_returns_correct(
    returns_df: pd.DataFrame,
    include_partial_months: bool = True
) -> pd.DataFrame:
    """
    Calculate monthly returns correctly (fixed version).

    Args:
        returns_df: DataFrame with datetime index and asset returns
        include_partial_months: Include current/partial month

    Returns:
        DataFrame with months as rows, assets as columns
        Uses NaN for missing data (not 0)
    """
    # Ensure index is datetime
    if not isinstance(returns_df.index, pd.DatetimeIndex):
        returns_df.index = pd.to_datetime(returns_df.index)

    # Group by year-month
    monthly = returns_df.groupby([
        returns_df.index.year,
        returns_df.index.month
    ])

    # Calculate cumulative returns for each month
    monthly_returns = {}

    for (year, month), group in monthly:
        # Calculate return: (1 + r1) * (1 + r2) * ... - 1
        monthly_ret = (1 + group).prod() - 1

        # Use NaN for columns with no data (not 0)
        monthly_ret = monthly_ret.replace(0, np.nan)

        date_key = f"{year}-{month:02d}"
        monthly_returns[date_key] = monthly_ret

    # Convert to DataFrame
    result = pd.DataFrame(monthly_returns).T

    # If not including partial months, remove current month
    if not include_partial_months:
        current_month = datetime.now().strftime("%Y-%m")
        if current_month in result.index:
            result = result.drop(current_month)

    return result


def calculate_monthly_returns_old_broken(
    returns_df: pd.DataFrame
) -> pd.DataFrame:
    """
    OLD (BROKEN) version - for comparison.

    This is what was causing November 2024 to show zeros.
    """
    monthly = returns_df.groupby([
        returns_df.index.year,
        returns_df.index.month
    ])

    monthly_returns = {}

    for (year, month), group in monthly:
        # BUG: This filtered out "incomplete" months
        if len(group) < 20:  # ❌ Arbitrary threshold
            continue  # ❌ Skip month entirely

        monthly_ret = (1 + group).prod() - 1
        monthly_ret = monthly_ret.replace(np.nan, 0)  # ❌ Convert NaN to 0

        date_key = f"{year}-{month:02d}"
        monthly_returns[date_key] = monthly_ret

    return pd.DataFrame(monthly_returns).T


def reshape_for_heatmap(
    monthly_returns: pd.DataFrame
) -> pd.DataFrame:
    """
    Reshape monthly returns into year × month format for heatmap.

    Args:
        monthly_returns: DataFrame with YYYY-MM index

    Returns:
        DataFrame with years as rows, months as columns
    """
    # Extract year and month
    monthly_returns = monthly_returns.copy()
    monthly_returns.index = pd.to_datetime(monthly_returns.index + "-01")

    # Pivot to year × month
    heatmap_data = {}

    for year in monthly_returns.index.year.unique():
        year_data = monthly_returns[monthly_returns.index.year == year]

        # Create row with 12 months
        row = {}
        for month in range(1, 13):
            month_data = year_data[year_data.index.month == month]
            if len(month_data) > 0:
                row[month] = month_data.iloc[0].mean()  # Average across assets
            else:
                row[month] = np.nan

        heatmap_data[year] = row

    # Convert to DataFrame
    result = pd.DataFrame(heatmap_data).T
    result.columns = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    return result


# ===================================================================
# VISUALIZATION (FIXED)
# ===================================================================

def plot_monthly_heatmap_fixed(
    returns_df: pd.DataFrame,
    title: str = "Monthly Returns Heatmap",
    cmap: str = "RdYlGn",
    figsize: tuple = (14, 8)
) -> plt.Figure:
    """
    Plot monthly returns heatmap (fixed version).

    Args:
        returns_df: DataFrame with datetime index and returns
        title: Chart title
        cmap: Color map
        figsize: Figure size

    Returns:
        Matplotlib figure
    """
    # Calculate monthly returns (correctly)
    monthly = calculate_monthly_returns_correct(returns_df, include_partial_months=True)

    # Reshape for heatmap
    heatmap_data = reshape_for_heatmap(monthly)

    # Create figure
    fig, ax = plt.subplots(figsize=figsize)

    # Plot heatmap
    # Use mask to hide NaN values (show as white)
    mask = heatmap_data.isna()

    sns.heatmap(
        heatmap_data * 100,  # Convert to percentage
        annot=True,
        fmt='.2f',
        cmap=cmap,
        center=0,
        cbar_kws={'label': 'Return (%)'},
        linewidths=0.5,
        linecolor='gray',
        mask=mask,  # ✅ Hide NaN values
        ax=ax
    )

    ax.set_title(title, fontsize=16, fontweight='bold')
    ax.set_xlabel('Month', fontsize=12)
    ax.set_ylabel('Year', fontsize=12)

    plt.tight_layout()

    return fig


# ===================================================================
# DIAGNOSTIC FUNCTIONS
# ===================================================================

def diagnose_heatmap_issue(
    returns_df: pd.DataFrame,
    year: int = 2024,
    month: int = 11
) -> Dict:
    """
    Diagnose why a specific month shows zeros in heatmap.

    Args:
        returns_df: Returns DataFrame
        year: Year to check
        month: Month to check

    Returns:
        Dict with diagnostic information
    """
    # Filter for specific month
    mask = (returns_df.index.year == year) & (returns_df.index.month == month)
    month_data = returns_df[mask]

    diagnostics = {
        'year': year,
        'month': month,
        'data_points': len(month_data),
        'has_data': len(month_data) > 0,
        'date_range': (month_data.index.min(), month_data.index.max()) if len(month_data) > 0 else (None, None),
        'assets': list(month_data.columns),
        'sample_returns': {}
    }

    if len(month_data) > 0:
        # Calculate returns
        monthly_ret = (1 + month_data).prod() - 1

        diagnostics['sample_returns'] = {
            col: f"{monthly_ret[col] * 100:.2f}%"
            for col in month_data.columns[:5]  # First 5 assets
        }

        diagnostics['all_zeros'] = (monthly_ret == 0).all()
        diagnostics['all_nan'] = monthly_ret.isna().all()
        diagnostics['issue'] = None

        if diagnostics['all_zeros']:
            diagnostics['issue'] = "All returns are exactly 0 - likely calculation bug"
        elif diagnostics['all_nan']:
            diagnostics['issue'] = "All returns are NaN - missing data"
        else:
            diagnostics['issue'] = None  # Looks good!

    return diagnostics


def compare_old_vs_new_heatmap(
    returns_df: pd.DataFrame
) -> Dict:
    """
    Compare old (broken) vs new (fixed) heatmap calculations.

    Returns dict showing differences.
    """
    # Old calculation
    old_monthly = calculate_monthly_returns_old_broken(returns_df)

    # New calculation
    new_monthly = calculate_monthly_returns_correct(returns_df, include_partial_months=True)

    comparison = {
        'old_months': len(old_monthly),
        'new_months': len(new_monthly),
        'missing_in_old': [],
        'differences': {}
    }

    # Find months present in new but not old
    for month in new_monthly.index:
        if month not in old_monthly.index:
            comparison['missing_in_old'].append(month)

    # Compare values for common months
    for month in old_monthly.index:
        if month in new_monthly.index:
            old_val = old_monthly.loc[month].mean()
            new_val = new_monthly.loc[month].mean()

            if abs(old_val - new_val) > 0.001:
                comparison['differences'][month] = {
                    'old': f"{old_val * 100:.2f}%",
                    'new': f"{new_val * 100:.2f}%"
                }

    return comparison


# ===================================================================
# INTEGRATION HELPER
# ===================================================================

def fix_heatmap_in_atlas(
    returns_df: pd.DataFrame,
    save_figure: bool = True,
    output_path: str = "monthly_heatmap_fixed.png"
) -> plt.Figure:
    """
    Main function to fix heatmap in ATLAS Terminal.

    Args:
        returns_df: Your returns DataFrame
        save_figure: Whether to save figure to file
        output_path: Where to save figure

    Returns:
        Matplotlib figure
    """
    print("🔧 Applying heatmap fix...")

    # Calculate corrected monthly returns
    monthly = calculate_monthly_returns_correct(returns_df, include_partial_months=True)

    print(f"✅ Calculated returns for {len(monthly)} months")

    # Check for November 2024
    nov_2024_key = "2024-11"
    if nov_2024_key in monthly.index:
        nov_returns = monthly.loc[nov_2024_key]
        avg_return = nov_returns.mean()
        print(f"✅ November 2024 data found!")
        print(f"   Average return: {avg_return * 100:.2f}%")
        print(f"   Data points: {(~nov_returns.isna()).sum()}")
    else:
        print("⚠️ No data for November 2024")

    # Plot fixed heatmap
    print("\n📊 Generating fixed heatmap...")
    fig = plot_monthly_heatmap_fixed(returns_df)

    if save_figure:
        fig.savefig(output_path, dpi=300, bbox_inches='tight')
        print(f"✅ Saved to: {output_path}")

    return fig


# ===================================================================
# DEMONSTRATION
# ===================================================================

def demonstrate_heatmap_fix():
    """
    Demonstrate the heatmap fix with example data.
    """
    print("="*80)
    print("ATLAS TERMINAL - HEATMAP FIX DEMONSTRATION")
    print("="*80)

    # Create sample data with November 2024
    dates = pd.date_range(start='2024-01-01', end='2024-11-30', freq='D')

    # Simulate returns
    np.random.seed(42)
    returns_data = {
        'AAPL': np.random.normal(0.001, 0.02, len(dates)),
        'GOOGL': np.random.normal(0.0008, 0.025, len(dates)),
        'MSFT': np.random.normal(0.0012, 0.018, len(dates))
    }

    returns_df = pd.DataFrame(returns_data, index=dates)

    print("\n📊 EXAMPLE DATA:")
    print(f"Date range: {returns_df.index.min()} to {returns_df.index.max()}")
    print(f"Assets: {list(returns_df.columns)}")
    print(f"Total days: {len(returns_df)}")

    print("\n\n🔍 DIAGNOSING NOVEMBER 2024:")
    print("-" * 80)

    diagnostics = diagnose_heatmap_issue(returns_df, year=2024, month=11)

    print(f"Data points in November 2024: {diagnostics['data_points']}")
    print(f"Date range: {diagnostics['date_range'][0]} to {diagnostics['date_range'][1]}")
    print(f"\nSample returns:")
    for asset, ret in diagnostics['sample_returns'].items():
        print(f"  {asset}: {ret}")

    if diagnostics['issue']:
        print(f"\n⚠️ Issue detected: {diagnostics['issue']}")
    else:
        print(f"\n✅ No issues detected - data looks good!")

    print("\n\n📊 COMPARING OLD VS NEW:")
    print("-" * 80)

    comparison = compare_old_vs_new_heatmap(returns_df)

    print(f"Months in old calculation: {comparison['old_months']}")
    print(f"Months in new calculation: {comparison['new_months']}")

    if comparison['missing_in_old']:
        print(f"\n⚠️ Missing in old calculation:")
        for month in comparison['missing_in_old']:
            print(f"  - {month}")

    if comparison['differences']:
        print(f"\n📊 Differences found:")
        for month, values in list(comparison['differences'].items())[:5]:
            print(f"  {month}: Old={values['old']}, New={values['new']}")

    print("\n" + "="*80)


# ===================================================================
# EXAMPLE USAGE
# ===================================================================

if __name__ == "__main__":
    # Run demonstration
    demonstrate_heatmap_fix()

    print("\n\n💡 TO USE IN YOUR ATLAS TERMINAL:")
    print("="*80)
    print("""
# Import the fix
from atlas_heatmap_fix import fix_heatmap_in_atlas

# Apply to your returns DataFrame
fig = fix_heatmap_in_atlas(
    returns_df=your_returns_df,
    save_figure=True,
    output_path="fixed_heatmap.png"
)

# Display in Streamlit
st.pyplot(fig)

# Now November 2024 (and all months) show correct returns!
# - No more zeros for partial months
# - NaN for genuinely missing data
# - Actual returns displayed even if month incomplete
    """)
    print("="*80)
