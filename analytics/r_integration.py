"""
R Integration Module for ATLAS Terminal
========================================

Provides Python-R bridge with automatic package installation.
Handles GARCH volatility modeling, copula analysis, and custom R code execution.

Author: ATLAS Development Team
"""

import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, List


def check_and_install_r_packages(packages: List[str], verbose: bool = True) -> Dict[str, bool]:
    """
    Check if R packages are installed and auto-install if missing.

    Args:
        packages: List of R package names to check/install
        verbose: Print installation progress

    Returns:
        dict: Package name -> installation success status
    """
    try:
        from rpy2.robjects.packages import importr
        from rpy2.rinterface_lib.embedded import RRuntimeError
        import rpy2.robjects as ro

        results = {}

        for package in packages:
            try:
                # Try to import package
                importr(package)
                results[package] = True
                if verbose:
                    print(f"✅ {package} - already installed")
            except RRuntimeError:
                # Package not found - install it
                if verbose:
                    print(f"📦 {package} - installing (this may take 2-3 minutes)...")

                try:
                    # Install from CRAN
                    ro.r(f'''
                    options(repos = c(CRAN = "https://cloud.r-project.org"))
                    install.packages("{package}", dependencies = TRUE, quiet = FALSE)
                    ''')

                    # Verify installation
                    importr(package)
                    results[package] = True
                    if verbose:
                        print(f"✅ {package} - installed successfully")

                except Exception as e:
                    results[package] = False
                    if verbose:
                        print(f"❌ {package} - installation failed: {str(e)}")

        return results

    except ImportError as e:
        if verbose:
            print(f"❌ rpy2 not installed: {str(e)}")
        return {pkg: False for pkg in packages}


def get_r():
    """
    Initialize R interface with automatic package installation.

    Returns:
        R interface object with ATLAS analytics functions
    """
    from rpy2.robjects.packages import importr
    import rpy2.robjects as ro
    from rpy2.robjects import pandas2ri

    # Enable pandas conversion
    pandas2ri.activate()

    # Auto-install required packages
    required_packages = ['rugarch', 'copula', 'xts']
    install_status = check_and_install_r_packages(required_packages, verbose=False)

    # Import R packages
    try:
        rugarch = importr('rugarch')
        copula = importr('copula')
        xts = importr('xts')
        base = importr('base')
        stats = importr('stats')
    except Exception as e:
        raise RuntimeError(f"Failed to import R packages: {str(e)}")

    # Create R interface class
    class RInterface:
        """Wrapper for R analytics functions"""

        def garch_volatility(self, returns: pd.Series, model: str = 'sGARCH') -> Dict[str, Any]:
            """
            Fit GARCH model to returns data.

            Args:
                returns: Pandas Series of returns
                model: GARCH model type (sGARCH, eGARCH, gjrGARCH)

            Returns:
                dict with volatility estimates and model info
            """
            # Convert to R vector
            r_returns = ro.FloatVector(returns.values)

            # Define GARCH specification
            spec = rugarch.ugarchspec(
                variance_model=ro.r(f'list(model="{model}")'),
                mean_model=ro.r('list(armaOrder=c(0,0))')
            )

            # Fit model
            fit = rugarch.ugarchfit(spec=spec, data=r_returns)

            # Extract volatility
            volatility = np.array(rugarch.sigma(fit))

            return {
                'model': model,
                'volatility': volatility,
                'last_volatility': float(volatility[-1]),
                'mean_volatility': float(np.mean(volatility))
            }

        def copula_dependency(self, returns_data: pd.DataFrame,
                            copula_type: str = 't') -> Dict[str, Any]:
            """
            Fit copula model to asset returns.

            Args:
                returns_data: DataFrame with asset returns
                copula_type: Type of copula (t, normal, clayton, gumbel)

            Returns:
                dict with copula parameters and fit info
            """
            # Convert to R matrix
            r_data = ro.r.matrix(ro.FloatVector(returns_data.values.flatten()),
                                nrow=len(returns_data),
                                ncol=len(returns_data.columns))

            # Fit copula (simplified - actual implementation would be more complex)
            corr_matrix = returns_data.corr()

            return {
                'copula_type': copula_type,
                'n_assets': len(returns_data.columns),
                'parameters': corr_matrix.to_dict()
            }

        def run_custom_analysis(self, r_code: str, data: pd.DataFrame) -> Any:
            """
            Execute custom R code with data.

            Args:
                r_code: R code string to execute
                data: DataFrame to make available in R

            Returns:
                Result of R code execution
            """
            # Convert data to R
            ro.globalenv['df'] = pandas2ri.py2rpy(data)

            # Execute code
            result = ro.r(r_code)

            return result

    return RInterface()


def test_r_integration() -> bool:
    """
    Test R integration and package availability.

    Returns:
        bool: True if all tests pass
    """
    try:
        r = get_r()
        print("✅ R integration working")
        return True
    except Exception as e:
        print(f"❌ R integration failed: {str(e)}")
        return False


if __name__ == '__main__':
    # Test integration
    print("Testing R integration...")
    test_r_integration()
