#!/usr/bin/env python3
"""
ATLAS Terminal - R Analytics Dependency Checker
================================================
Checks if all required R packages and Python libraries are installed.
Run this before using R Analytics features.
"""

import sys


def check_python_packages():
    """Check Python dependencies"""
    print("🐍 Checking Python packages...")
    print("-" * 60)

    packages = {
        'rpy2': 'Python-R bridge (required for all R Analytics features)'
    }

    all_installed = True

    for package, description in packages.items():
        try:
            __import__(package)
            print(f"  ✅ {package:15s} - {description}")
        except ImportError:
            print(f"  ❌ {package:15s} - MISSING - {description}")
            all_installed = False

    print()
    return all_installed


def check_r_installation():
    """Check if R is installed"""
    print("📊 Checking R installation...")
    print("-" * 60)

    try:
        import subprocess
        result = subprocess.run(['R', '--version'],
                              capture_output=True,
                              text=True,
                              timeout=5)

        if result.returncode == 0:
            version_line = result.stdout.split('\n')[0]
            print(f"  ✅ R is installed: {version_line}")
            print()
            return True
        else:
            print("  ❌ R is not installed or not working properly")
            print()
            return False
    except FileNotFoundError:
        print("  ❌ R is not installed (command not found)")
        print()
        return False
    except Exception as e:
        print(f"  ❌ Error checking R installation: {e}")
        print()
        return False


def check_r_packages():
    """Check if required R packages are installed"""
    print("📦 Checking R packages...")
    print("-" * 60)

    required_packages = {
        'rugarch': 'GARCH volatility modeling',
        'copula': 'Copula dependency analysis',
        'xts': 'Time series support'
    }

    all_installed = True

    try:
        from rpy2.robjects.packages import importr
        from rpy2.rinterface_lib.embedded import RRuntimeError

        for package, description in required_packages.items():
            try:
                importr(package)
                print(f"  ✅ {package:15s} - {description}")
            except RRuntimeError:
                print(f"  ❌ {package:15s} - MISSING - {description}")
                all_installed = False

    except ImportError:
        print("  ⚠️  Cannot check R packages (rpy2 not installed)")
        all_installed = False

    print()
    return all_installed


def main():
    """Main check routine"""
    print("╔══════════════════════════════════════════════════════════╗")
    print("║  ATLAS Terminal - R Analytics Dependency Checker        ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print()

    python_ok = check_python_packages()
    r_ok = check_r_installation()
    r_packages_ok = False

    if python_ok and r_ok:
        r_packages_ok = check_r_packages()

    print("═" * 60)
    print("📋 SUMMARY")
    print("═" * 60)

    if python_ok and r_ok and r_packages_ok:
        print("✅ All dependencies installed!")
        print()
        print("🚀 You can now use R Analytics features:")
        print("   • GARCH Volatility Forecasting")
        print("   • Copula Dependency Analysis")
        print("   • Custom R Code Execution")
        print()
        return 0
    else:
        print("❌ Some dependencies are missing")
        print()
        print("📖 To install missing dependencies:")
        print()

        if not python_ok:
            print("   Install Python packages:")
            print("   $ pip install rpy2")
            print()

        if not r_ok or not r_packages_ok:
            print("   Run the setup script:")
            print("   $ sudo bash setup_r_analytics.sh")
            print()

        print("   Or follow manual installation instructions in:")
        print("   navigation/handlers/r_analytics.py (lines 41-96)")
        print()
        return 1


if __name__ == '__main__':
    sys.exit(main())
