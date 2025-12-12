"""
ATLAS R Analytics Interface
Bridge between Python dashboard and R analytics
"""

import pandas as pd
import numpy as np
from typing import Dict, Optional, List, Any
import os


class RAnalytics:
    """
    Python-R Bridge for Advanced Analytics

    Uses rpy2 to run R code from Python.
    Handles data conversion and error handling.

    Features:
    - GARCH volatility models
    - Copula-based dependency models
    - Extreme value analysis
    - Custom R script execution
    """

    def __init__(self, r_scripts_dir: Optional[str] = None):
        """
        Initialize R interface

        Args:
            r_scripts_dir: Directory containing R scripts
        """
        try:
            import rpy2.robjects as ro
            from rpy2.robjects import pandas2ri
            from rpy2.robjects.packages import importr
            from rpy2.robjects.conversion import localconverter

            # FIXED: Use converter instead of deprecated activate()
            # Store converter for use in methods
            self.converter = ro.default_converter + pandas2ri.converter

            self.ro = ro
            self.pandas2ri = pandas2ri
            self.localconverter = localconverter

            # Import base R packages
            self.base = importr('base')
            self.stats = importr('stats')

            # Try to import common packages
            try:
                self.rugarch = importr('rugarch')
                print("✅ rugarch package loaded")
            except:
                print("⚠️  rugarch not installed - GARCH models unavailable")
                self.rugarch = None

            try:
                self.copula = importr('copula')
                print("✅ copula package loaded")
            except:
                print("⚠️  copula not installed - Copula models unavailable")
                self.copula = None

            # Set R scripts directory
            if r_scripts_dir is None:
                r_scripts_dir = os.path.join(os.path.dirname(__file__), 'scripts')
            self.r_scripts_dir = r_scripts_dir

            print(f"✅ R Analytics initialized")

        except ImportError:
            raise ImportError(
                "rpy2 not installed. Install with: pip install rpy2\n"
                "Also ensure R is installed on your system."
            )

    def run_script(self, script_name: str, **kwargs) -> Any:
        """
        Run R script from r_analytics/scripts/

        Args:
            script_name: Name of R script (e.g., 'garch_models.R')
            **kwargs: Arguments to pass to R script

        Returns:
            Result from R script
        """
        script_path = os.path.join(self.r_scripts_dir, script_name)

        if not os.path.exists(script_path):
            raise FileNotFoundError(f"R script not found: {script_path}")

        # Pass arguments to R (with proper conversion context)
        for key, value in kwargs.items():
            if isinstance(value, pd.DataFrame):
                with self.localconverter(self.converter):
                    self.ro.globalenv[key] = value
            elif isinstance(value, (list, np.ndarray)):
                self.ro.globalenv[key] = self.ro.FloatVector(value)
            else:
                self.ro.globalenv[key] = value

        # Run script
        self.ro.r(f'source("{script_path}")')

        return None

    def garch_volatility(self, returns: pd.Series,
                         model: str = 'sGARCH',
                         order: tuple = (1, 1)) -> Dict:
        """
        Fit GARCH model to returns

        Args:
            returns: Time series of returns
            model: GARCH variant ('sGARCH', 'eGARCH', 'gjrGARCH')
            order: (p, q) order of GARCH model

        Returns:
            Dict with volatility forecast and model stats
        """
        if self.rugarch is None:
            raise RuntimeError("rugarch package not available")

        # Convert to R vector
        r_returns = self.ro.FloatVector(returns.values)

        # Specify GARCH model
        spec = self.rugarch.ugarchspec(
            variance_model=self.ro.ListVector({
                'model': model,
                'garchOrder': self.ro.IntVector(order)
            })
        )

        # Fit model
        fit = self.rugarch.ugarchfit(spec=spec, data=r_returns)

        # Extract results
        sigma = np.array(self.rugarch.sigma(fit)).flatten()

        return {
            'volatility': sigma,
            'last_volatility': float(sigma[-1]),
            'mean_volatility': float(sigma.mean()),
            'model': model,
            'order': order
        }

    def estimate_var_r(self, returns: pd.Series,
                       confidence: float = 0.95,
                       method: str = 'historical') -> Dict:
        """
        Calculate VaR using R methods

        Args:
            returns: Return series
            confidence: Confidence level
            method: 'historical', 'parametric', or 'cornish_fisher'

        Returns:
            Dict with VaR estimates
        """
        r_returns = self.ro.FloatVector(returns.values)

        if method == 'historical':
            var = np.quantile(returns, 1 - confidence)

        elif method == 'parametric':
            # Assume normal distribution
            mean = returns.mean()
            std = returns.std()
            z_score = self.stats.qnorm(1 - confidence)[0]
            var = mean + z_score * std

        elif method == 'cornish_fisher':
            # Cornish-Fisher expansion (accounts for skew/kurtosis)
            from scipy import stats as sp_stats

            mean = returns.mean()
            std = returns.std()
            skew = sp_stats.skew(returns)
            kurt = sp_stats.kurtosis(returns)

            z = sp_stats.norm.ppf(1 - confidence)
            z_cf = (z +
                   (z**2 - 1) * skew / 6 +
                   (z**3 - 3*z) * kurt / 24 -
                   (2*z**3 - 5*z) * skew**2 / 36)

            var = mean + z_cf * std

        return {
            'var': var,
            'confidence': confidence,
            'method': method
        }

    def copula_dependency(self, returns_df: pd.DataFrame,
                          copula_type: str = 't') -> Dict:
        """
        Fit copula to model dependency structure

        Args:
            returns_df: DataFrame with multiple return series
            copula_type: 'normal', 't', 'clayton', 'gumbel'

        Returns:
            Dict with copula parameters and tail dependencies
        """
        if self.copula is None:
            raise RuntimeError("copula package not available")

        # Convert to R (with proper conversion context)
        with self.localconverter(self.converter):
            r_returns = self.ro.conversion.py2rpy(returns_df)

        # Fit copula
        if copula_type == 't':
            fit = self.copula.fitCopula(
                self.copula.tCopula(dim=returns_df.shape[1]),
                data=r_returns
            )
        elif copula_type == 'normal':
            fit = self.copula.fitCopula(
                self.copula.normalCopula(dim=returns_df.shape[1]),
                data=r_returns
            )

        # Extract parameters
        params = np.array(self.copula.coef(fit))

        return {
            'copula_type': copula_type,
            'parameters': params,
            'n_assets': returns_df.shape[1]
        }

    def run_custom_analysis(self, r_code: str,
                           data: Optional[pd.DataFrame] = None) -> Any:
        """
        Run custom R code

        Args:
            r_code: R code to execute
            data: Optional DataFrame to pass as 'df' in R

        Returns:
            Result from R execution
        """
        if data is not None:
            with self.localconverter(self.converter):
                self.ro.globalenv['df'] = data

        result = self.ro.r(r_code)

        # Try to convert back to pandas if possible
        try:
            with self.localconverter(self.converter):
                return self.ro.conversion.rpy2py(result)
        except:
            return result


# Singleton instance
_r_instance = None

def get_r() -> RAnalytics:
    """Get singleton R analytics instance"""
    global _r_instance
    if _r_instance is None:
        _r_instance = RAnalytics()
    return _r_instance


__all__ = ['RAnalytics', 'get_r']
