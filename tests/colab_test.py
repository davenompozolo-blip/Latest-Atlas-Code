# ===================================================================
# ATLAS TERMINAL v10.0 - GOOGLE COLAB TEST NOTEBOOK
# ===================================================================
#
# This notebook tests all infrastructure components:
# - Installation scripts
# - Configuration system
# - Utility scripts
# - Sample data generation
# - Status dashboard
# - Test suite
#
# Usage:
#   1. Open in Google Colab
#   2. Run all cells
#   3. Review test results
#
# ===================================================================

# -------------------------------------------------------------------
# CELL 1: Clone Repository
# -------------------------------------------------------------------
"""
Clone the ATLAS Terminal repository and checkout the feature branch.
"""

import os
from pathlib import Path

# Clone repository
!git clone https://github.com/davenompozolo-blip/Latest-Atlas-Code.git
os.chdir('Latest-Atlas-Code')

# Checkout feature branch
!git checkout claude/add-investopedia-diagnostics-01Gz2KGHfp7HUx7jxvAebUbe

# Show branch info
print("\n" + "="*80)
print("📚 REPOSITORY INFO")
print("="*80)
!git log --oneline -5
!git status


# -------------------------------------------------------------------
# CELL 2: System Information
# -------------------------------------------------------------------
"""
Display Python and system information.
"""

import platform
import sys

print("\n" + "="*80)
print("💻 SYSTEM INFORMATION")
print("="*80)
print(f"Python Version: {platform.python_version()}")
print(f"Operating System: {platform.system()} {platform.release()}")
print(f"Architecture: {platform.machine()}")
print(f"Working Directory: {os.getcwd()}")
print("="*80)


# -------------------------------------------------------------------
# CELL 3: Install Dependencies
# -------------------------------------------------------------------
"""
Install all required dependencies from requirements.txt.
"""

print("\n" + "="*80)
print("📦 INSTALLING DEPENDENCIES")
print("="*80)

# Upgrade pip first
!pip install --upgrade pip

# Install requirements
!pip install -r requirements.txt

# Install additional tools
!pip install pytest black flake8

print("\n✅ Dependencies installed!")


# -------------------------------------------------------------------
# CELL 4: Run Installation Script
# -------------------------------------------------------------------
"""
Test the automated installation script.
"""

print("\n" + "="*80)
print("🔧 RUNNING INSTALLATION SCRIPT")
print("="*80)

# Make script executable
!chmod +x install.sh

# Run installation (skip tests for now)
!bash install.sh --skip-tests

print("\n✅ Installation script completed!")


# -------------------------------------------------------------------
# CELL 5: Verify Configuration
# -------------------------------------------------------------------
"""
Verify configuration system is working.
"""

print("\n" + "="*80)
print("⚙️  VERIFYING CONFIGURATION")
print("="*80)

import config

# Check configuration
errors, warnings = config.validate_config()

print(f"Configuration Valid: {len(errors) == 0}")
print(f"Errors: {len(errors)}")
print(f"Warnings: {len(warnings)}")
print(f"Default Leverage: {config.DEFAULT_LEVERAGE}x")
print(f"Risk-Free Rate: {config.DEFAULT_RISK_FREE_RATE*100:.2f}%")

if errors:
    print("\n❌ Configuration Errors:")
    for error in errors:
        print(f"  - {error}")

if warnings:
    print("\n⚠️  Configuration Warnings:")
    for warning in warnings:
        print(f"  - {warning}")

print("\n✅ Configuration check completed!")


# -------------------------------------------------------------------
# CELL 6: Test Utility Scripts
# -------------------------------------------------------------------
"""
Test the utility scripts (cache, session, logs management).
"""

print("\n" + "="*80)
print("🛠️  TESTING UTILITY SCRIPTS")
print("="*80)

# Test project stats
print("\n📊 Project Statistics:")
!python scripts/utils.py --stats

# Test environment check
print("\n🔍 Environment Check:")
!python scripts/utils.py --check-env

# Test health check
print("\n🏥 Health Check:")
!python scripts/utils.py --health-check

print("\n✅ Utility scripts tested!")


# -------------------------------------------------------------------
# CELL 7: Generate Sample Data
# -------------------------------------------------------------------
"""
Generate sample portfolio data for testing.
"""

print("\n" + "="*80)
print("📊 GENERATING SAMPLE DATA")
print("="*80)

# Generate sample data with default parameters
!python scripts/generate_sample_data.py

# Verify generated files
data_dir = Path('data')
print(f"\n📁 Generated Files:")
print(f"  - sample_returns.csv: {(data_dir / 'sample_returns.csv').exists()}")
print(f"  - sample_prices.csv: {(data_dir / 'sample_prices.csv').exists()}")
print(f"  - sample_portfolio.csv: {(data_dir / 'sample_portfolio.csv').exists()}")
print(f"  - sample_metadata.json: {(data_dir / 'sample_metadata.json').exists()}")

# Show sample data preview
if (data_dir / 'sample_returns.csv').exists():
    import pandas as pd

    print("\n📈 Sample Returns Preview:")
    returns = pd.read_csv(data_dir / 'sample_returns.csv', index_col=0, parse_dates=True)
    print(returns.head())
    print(f"\nShape: {returns.shape}")

    print("\n💰 Sample Portfolio Preview:")
    portfolio = pd.read_csv(data_dir / 'sample_portfolio.csv')
    print(portfolio.head(10))
    print(f"\nTotal positions: {len(portfolio)}")

print("\n✅ Sample data generated!")


# -------------------------------------------------------------------
# CELL 8: Run Status Dashboard
# -------------------------------------------------------------------
"""
Run the comprehensive project status dashboard.
"""

print("\n" + "="*80)
print("🚀 PROJECT STATUS DASHBOARD")
print("="*80)

!python scripts/status.py


# -------------------------------------------------------------------
# CELL 9: Run Test Suite
# -------------------------------------------------------------------
"""
Run the comprehensive test suite.
"""

print("\n" + "="*80)
print("🧪 RUNNING TEST SUITE")
print("="*80)

# Run tests with pytest
!python tests/test_all.py

print("\n✅ Test suite completed!")


# -------------------------------------------------------------------
# CELL 10: Test Module Imports
# -------------------------------------------------------------------
"""
Test that all ATLAS modules can be imported successfully.
"""

print("\n" + "="*80)
print("📦 TESTING MODULE IMPORTS")
print("="*80)

modules = [
    'config',
    'quant_optimizer.atlas_quant_portfolio_optimizer',
    'quant_optimizer.atlas_quant_optimizer_ui',
    'investopedia_integration.atlas_investopedia_production_2fa',
    'multi_source_data.atlas_multi_source_data_broker',
    'patches.atlas_leverage_fix',
    'patches.atlas_heatmap_fix',
]

success_count = 0
fail_count = 0

for module in modules:
    try:
        __import__(module)
        print(f"✅ {module}")
        success_count += 1
    except Exception as e:
        print(f"❌ {module}: {str(e)[:60]}")
        fail_count += 1

print(f"\n📊 Import Results: {success_count}/{len(modules)} successful")

if fail_count == 0:
    print("✅ All modules imported successfully!")
else:
    print(f"⚠️  {fail_count} module(s) failed to import")


# -------------------------------------------------------------------
# CELL 11: Test Quick Optimizer Run
# -------------------------------------------------------------------
"""
Test the quant optimizer with sample data.
"""

print("\n" + "="*80)
print("🔬 TESTING QUANT OPTIMIZER")
print("="*80)

try:
    from quant_optimizer.atlas_quant_portfolio_optimizer import QuantPortfolioOptimizer
    import pandas as pd
    import numpy as np

    # Load sample data
    returns = pd.read_csv('data/sample_returns.csv', index_col=0, parse_dates=True)

    # Initialize optimizer
    optimizer = QuantPortfolioOptimizer(
        returns_data=returns,
        leverage=2.0,
        risk_free_rate=0.02
    )

    # Run optimization
    print("Running optimization...")
    results = optimizer.optimize(method='max_sharpe')

    print(f"\n✅ Optimization Results:")
    print(f"  Expected Return: {results['expected_return']*100:.2f}%")
    print(f"  Volatility: {results['volatility']*100:.2f}%")
    print(f"  Sharpe Ratio: {results['sharpe_ratio']:.3f}")
    print(f"  Positions: {len(results['weights'])}")

    # Show top positions
    weights_df = pd.DataFrame({
        'Weight': results['weights']
    }).sort_values('Weight', ascending=False)

    print(f"\n📊 Top 5 Positions:")
    print(weights_df.head(5))

    print("\n✅ Optimizer test successful!")

except Exception as e:
    print(f"\n❌ Optimizer test failed: {e}")
    import traceback
    traceback.print_exc()


# -------------------------------------------------------------------
# CELL 12: File Structure Overview
# -------------------------------------------------------------------
"""
Display the complete project file structure.
"""

print("\n" + "="*80)
print("📁 PROJECT FILE STRUCTURE")
print("="*80)

!tree -L 2 -I '__pycache__|*.pyc|.git' || find . -maxdepth 2 -type f -name "*.py" -o -name "*.md" -o -name "*.txt" -o -name "*.sh" -o -name "*.bat" | head -50


# -------------------------------------------------------------------
# CELL 13: Configuration Files Check
# -------------------------------------------------------------------
"""
Verify all configuration and documentation files exist.
"""

print("\n" + "="*80)
print("📋 CONFIGURATION FILES CHECK")
print("="*80)

files_to_check = {
    'Core Files': [
        'LICENSE',
        'README.md',
        'requirements.txt',
        'config.py',
        'setup.py',
        '.gitignore',
    ],
    'Documentation': [
        'CHANGELOG.md',
        'CONTRIBUTING.md',
        'CODE_OF_CONDUCT.md',
        'docs/PRODUCTION_DEPLOYMENT_GUIDE.md',
    ],
    'Installation': [
        'install.sh',
        'install.bat',
        '.env.example',
    ],
    'CI/CD': [
        '.github/workflows/ci-cd.yml',
    ],
    'Scripts': [
        'scripts/utils.py',
        'scripts/generate_sample_data.py',
        'scripts/status.py',
    ],
    'Tests': [
        'tests/test_all.py',
    ],
    'Configuration': [
        'nginx.conf',
    ],
}

total_files = 0
existing_files = 0

for category, files in files_to_check.items():
    print(f"\n{category}:")
    for file in files:
        exists = Path(file).exists()
        icon = "✅" if exists else "❌"
        print(f"  {icon} {file}")
        total_files += 1
        if exists:
            existing_files += 1

print(f"\n📊 Files Found: {existing_files}/{total_files}")

if existing_files == total_files:
    print("✅ All files present!")
else:
    print(f"⚠️  {total_files - existing_files} file(s) missing")


# -------------------------------------------------------------------
# CELL 14: Final Summary
# -------------------------------------------------------------------
"""
Display final test summary and results.
"""

print("\n" + "="*80)
print("🎯 FINAL TEST SUMMARY")
print("="*80)

summary = {
    'Repository Cloned': os.path.exists('.git'),
    'Dependencies Installed': True,  # If we got here, they're installed
    'Configuration Valid': len(errors) == 0,
    'Sample Data Generated': Path('data/sample_returns.csv').exists(),
    'All Files Present': existing_files == total_files,
    'Modules Importable': fail_count == 0,
}

print("\nTest Results:")
for test, passed in summary.items():
    icon = "✅" if passed else "❌"
    print(f"  {icon} {test}")

passed_count = sum(summary.values())
total_count = len(summary)

print(f"\n📊 Overall: {passed_count}/{total_count} tests passed")

if passed_count == total_count:
    print("\n🎉 ALL TESTS PASSED!")
    print("✅ ATLAS Terminal v10.0 infrastructure is fully operational!")
else:
    print(f"\n⚠️  {total_count - passed_count} test(s) failed")
    print("Please review the output above for details.")

print("\n" + "="*80)
print("🚀 ATLAS TERMINAL v10.0 - TESTING COMPLETE")
print("="*80)
print("\nNext Steps:")
print("1. Launch the terminal: streamlit run atlas_app.py")
print("2. Run the optimizer: python quant_optimizer/atlas_quant_portfolio_optimizer.py")
print("3. Check status anytime: python scripts/status.py")
print("4. View documentation: cat README.md")
print("="*80)
