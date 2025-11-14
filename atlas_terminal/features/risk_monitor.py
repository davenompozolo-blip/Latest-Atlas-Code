"""
Risk Budget Monitor Feature
Real-time risk capacity tracking for leveraged portfolios

NEW IN v10.0:
- Risk budget allocation and tracking
- Position-level risk contribution
- Real-time risk budget consumption alerts
- Margin capacity monitoring
- Stress test integration
- Dynamic risk limits based on market conditions
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
import logging

from ..data.validators import is_valid_dataframe, validate_returns_series
from ..data.parsers import get_leverage_info
from ..analytics.risk import (calculate_var, calculate_portfolio_volatility,
                              calculate_position_var, calculate_comprehensive_risk_metrics)
from ..config import COLORS

logger = logging.getLogger(__name__)


class RiskBudgetMonitor:
    """
    Monitors and manages risk budget for leveraged portfolios

    Key Concepts:
    - Risk Budget: Total risk capacity (e.g., max 20% portfolio VaR)
    - Risk Allocation: How much risk budget each position consumes
    - Risk Utilization: % of risk budget currently used
    - Risk Alerts: Warnings when approaching limits
    """

    def __init__(self,
                 max_portfolio_var: float = 0.20,
                 max_position_var: float = 0.10,
                 max_leverage: float = 3.0,
                 alert_threshold: float = 0.80):
        """
        Initialize Risk Budget Monitor

        Args:
            max_portfolio_var: Maximum portfolio VaR (e.g., 0.20 = 20% max loss)
            max_position_var: Maximum single position VaR
            max_leverage: Maximum allowed leverage ratio
            alert_threshold: Trigger alert at this % of risk budget (e.g., 0.80 = 80%)
        """
        self.max_portfolio_var = max_portfolio_var
        self.max_position_var = max_position_var
        self.max_leverage = max_leverage
        self.alert_threshold = alert_threshold

        self.alerts = []

        logger.info(f"RiskBudgetMonitor initialized: Max Portfolio VaR={max_portfolio_var*100:.0f}%, "
                   f"Max Leverage={max_leverage:.1f}x")

    def calculate_risk_utilization(self,
                                   portfolio_returns: pd.Series,
                                   confidence_level: float = 0.95) -> Dict:
        """
        Calculate current risk budget utilization

        Args:
            portfolio_returns: Series of portfolio returns
            confidence_level: VaR confidence level

        Returns:
            Dict with risk utilization metrics
        """
        if not validate_returns_series(portfolio_returns):
            logger.error("Invalid returns for risk utilization calculation")
            return {}

        try:
            # Calculate current portfolio VaR
            current_var = calculate_var(portfolio_returns, confidence_level)

            if current_var is None:
                return {}

            current_var = abs(current_var)  # Make positive

            # Risk utilization
            risk_utilization = (current_var / self.max_portfolio_var) * 100

            # Available risk budget
            available_risk = max(0, self.max_portfolio_var - current_var)

            # Status determination
            if risk_utilization >= 100:
                status = "EXCEEDED"
                color = COLORS['danger']
            elif risk_utilization >= self.alert_threshold * 100:
                status = "WARNING"
                color = COLORS['warning']
            elif risk_utilization >= 50:
                status = "MODERATE"
                color = COLORS['info']
            else:
                status = "LOW"
                color = COLORS['success']

            # Leverage check
            leverage_info = get_leverage_info()
            current_leverage = leverage_info['leverage_ratio'] if leverage_info else 1.0

            leverage_status = "OK"
            if current_leverage > self.max_leverage:
                leverage_status = "EXCEEDED"
                self._add_alert("LEVERAGE_EXCEEDED",
                               f"Leverage {current_leverage:.2f}x exceeds limit {self.max_leverage:.2f}x",
                               "HIGH")
            elif current_leverage >= self.max_leverage * 0.9:
                leverage_status = "WARNING"
                self._add_alert("LEVERAGE_WARNING",
                               f"Leverage {current_leverage:.2f}x approaching limit {self.max_leverage:.2f}x",
                               "MEDIUM")

            utilization = {
                'current_var': current_var,
                'max_var': self.max_portfolio_var,
                'risk_utilization_pct': risk_utilization,
                'available_risk': available_risk,
                'status': status,
                'status_color': color,
                'current_leverage': current_leverage,
                'max_leverage': self.max_leverage,
                'leverage_status': leverage_status,
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }

            logger.info(f"Risk Utilization: {risk_utilization:.1f}% ({status}), "
                       f"Leverage: {current_leverage:.2f}x")

            return utilization

        except Exception as e:
            logger.error(f"Error calculating risk utilization: {e}", exc_info=True)
            return {}

    def calculate_position_risk_contributions(self,
                                             portfolio_df: pd.DataFrame,
                                             returns_df: Optional[pd.DataFrame] = None) -> Optional[pd.DataFrame]:
        """
        Calculate how much each position contributes to total portfolio risk

        Uses:
        1. Position size (% of portfolio)
        2. Position volatility
        3. Correlation with portfolio

        Risk Contribution = Weight * Beta * Portfolio Volatility

        Args:
            portfolio_df: DataFrame with current holdings
            returns_df: Optional DataFrame with historical returns by ticker

        Returns:
            DataFrame with position risk contributions
        """
        if not is_valid_dataframe(portfolio_df):
            logger.error("Invalid portfolio data for risk contribution")
            return None

        try:
            # Required columns
            required = ['Ticker', 'Total Value']
            missing = [col for col in required if col not in portfolio_df.columns]

            if missing:
                logger.error(f"Missing required columns: {missing}")
                return None

            # Calculate position weights
            total_value = portfolio_df['Total Value'].sum()

            if total_value <= 0:
                logger.error("Invalid total portfolio value")
                return None

            df = portfolio_df.copy()
            df['Weight'] = df['Total Value'] / total_value

            # If we have returns data, calculate proper risk contributions
            if returns_df is not None and is_valid_dataframe(returns_df):
                # Calculate portfolio returns
                portfolio_returns = (returns_df * df.set_index('Ticker')['Weight']).sum(axis=1)
                portfolio_vol = portfolio_returns.std()

                # Calculate each position's contribution
                contributions = []

                for idx, row in df.iterrows():
                    ticker = row['Ticker']

                    if ticker in returns_df.columns:
                        ticker_returns = returns_df[ticker]

                        # Calculate beta to portfolio
                        covariance = ticker_returns.cov(portfolio_returns)
                        portfolio_variance = portfolio_returns.var()
                        beta = covariance / portfolio_variance if portfolio_variance > 0 else 1.0

                        # Risk contribution
                        risk_contrib = row['Weight'] * beta * portfolio_vol

                        contributions.append({
                            'Ticker': ticker,
                            'Weight': row['Weight'],
                            'Beta': beta,
                            'Risk_Contribution': risk_contrib
                        })
                    else:
                        # Fallback: use weight as approximation
                        contributions.append({
                            'Ticker': ticker,
                            'Weight': row['Weight'],
                            'Beta': 1.0,
                            'Risk_Contribution': row['Weight'] * 0.15  # Assume 15% vol
                        })

                contrib_df = pd.DataFrame(contributions)

            else:
                # Simplified: Risk contribution ≈ Position weight
                contrib_df = df[['Ticker', 'Weight']].copy()
                contrib_df['Beta'] = 1.0
                contrib_df['Risk_Contribution'] = contrib_df['Weight'] * 0.15  # Assume 15% vol

            # Calculate % of total risk
            total_risk = contrib_df['Risk_Contribution'].sum()
            contrib_df['Risk_Pct'] = (contrib_df['Risk_Contribution'] / total_risk) * 100 if total_risk > 0 else 0

            # Check position limits
            contrib_df['Exceeds_Limit'] = contrib_df['Risk_Contribution'] > self.max_position_var

            # Alert on positions exceeding limits
            for idx, row in contrib_df[contrib_df['Exceeds_Limit']].iterrows():
                self._add_alert("POSITION_RISK_EXCEEDED",
                               f"{row['Ticker']}: Risk contribution {row['Risk_Contribution']*100:.1f}% "
                               f"exceeds limit {self.max_position_var*100:.0f}%",
                               "HIGH")

            # Sort by risk contribution
            contrib_df = contrib_df.sort_values('Risk_Contribution', ascending=False)

            logger.info(f"Calculated risk contributions for {len(contrib_df)} positions")

            return contrib_df

        except Exception as e:
            logger.error(f"Error calculating position risk contributions: {e}", exc_info=True)
            return None

    def assess_new_position_impact(self,
                                   current_portfolio_var: float,
                                   new_position_size: float,
                                   new_position_volatility: float,
                                   correlation_with_portfolio: float = 0.5) -> Dict:
        """
        Assess impact of adding a new position on risk budget

        Args:
            current_portfolio_var: Current portfolio VaR
            new_position_size: Size of new position (% of portfolio)
            new_position_volatility: Expected volatility of new position
            correlation_with_portfolio: Correlation with existing portfolio

        Returns:
            Dict with impact assessment
        """
        try:
            # Simplified risk impact calculation
            # New Portfolio Var ≈ sqrt(Old^2 + New^2 + 2*Corr*Old*New)

            old_var = abs(current_portfolio_var)
            new_contribution = new_position_size * new_position_volatility

            # Marginal VaR
            marginal_var = new_contribution * correlation_with_portfolio

            # Estimated new portfolio VaR
            new_portfolio_var = np.sqrt(
                old_var**2 +
                new_contribution**2 +
                2 * correlation_with_portfolio * old_var * new_contribution
            )

            # Change in risk
            risk_increase = new_portfolio_var - old_var
            risk_increase_pct = (risk_increase / old_var) * 100 if old_var > 0 else 0

            # Check against budget
            new_utilization = (new_portfolio_var / self.max_portfolio_var) * 100

            # Recommendation
            if new_portfolio_var > self.max_portfolio_var:
                recommendation = "REJECT - Exceeds risk budget"
                approved = False
            elif new_utilization >= self.alert_threshold * 100:
                recommendation = "CAUTION - High risk utilization"
                approved = True
            else:
                recommendation = "APPROVED - Within risk budget"
                approved = True

            impact = {
                'current_var': old_var,
                'estimated_new_var': new_portfolio_var,
                'risk_increase': risk_increase,
                'risk_increase_pct': risk_increase_pct,
                'new_utilization_pct': new_utilization,
                'approved': approved,
                'recommendation': recommendation,
                'marginal_var': marginal_var
            }

            logger.info(f"New position impact: {risk_increase_pct:+.1f}% risk increase, "
                       f"{new_utilization:.1f}% utilization -> {recommendation}")

            return impact

        except Exception as e:
            logger.error(f"Error assessing new position impact: {e}", exc_info=True)
            return {}

    def stress_test_risk_budget(self,
                                portfolio_returns: pd.Series,
                                scenarios: Dict[str, float]) -> Dict:
        """
        Stress test risk budget under various scenarios

        Args:
            portfolio_returns: Historical portfolio returns
            scenarios: Dict of scenario_name -> portfolio_shock (e.g., {'Crash': -0.30})

        Returns:
            Dict with stress test results
        """
        if not validate_returns_series(portfolio_returns):
            logger.error("Invalid returns for stress test")
            return {}

        try:
            results = {}

            # Current risk metrics
            current_var = abs(calculate_var(portfolio_returns, 0.95))
            current_utilization = (current_var / self.max_portfolio_var) * 100

            results['baseline'] = {
                'var_95': current_var,
                'utilization_pct': current_utilization,
                'status': 'NORMAL'
            }

            # Test each scenario
            for scenario_name, shock in scenarios.items():
                # Apply shock to returns
                shocked_returns = portfolio_returns + shock

                # Calculate new VaR
                shocked_var = abs(calculate_var(shocked_returns, 0.95))
                shocked_utilization = (shocked_var / self.max_portfolio_var) * 100

                # Status
                if shocked_utilization >= 100:
                    status = "BREACH"
                elif shocked_utilization >= self.alert_threshold * 100:
                    status = "WARNING"
                else:
                    status = "OK"

                results[scenario_name] = {
                    'var_95': shocked_var,
                    'utilization_pct': shocked_utilization,
                    'status': status,
                    'var_increase_pct': ((shocked_var - current_var) / current_var) * 100 if current_var > 0 else 0
                }

                # Alert if breach
                if status == "BREACH":
                    self._add_alert("STRESS_TEST_BREACH",
                                   f"Scenario '{scenario_name}' breaches risk budget "
                                   f"({shocked_utilization:.0f}% utilization)",
                                   "HIGH")

            logger.info(f"Stress tested {len(scenarios)} scenarios")

            return results

        except Exception as e:
            logger.error(f"Error in stress test: {e}", exc_info=True)
            return {}

    def get_risk_capacity(self,
                         current_portfolio_var: float) -> Dict:
        """
        Calculate remaining risk capacity

        Args:
            current_portfolio_var: Current portfolio VaR

        Returns:
            Dict with risk capacity metrics
        """
        try:
            current_var = abs(current_portfolio_var)

            # Remaining risk budget
            remaining = max(0, self.max_portfolio_var - current_var)

            # As percentage
            remaining_pct = (remaining / self.max_portfolio_var) * 100

            # Estimated number of additional positions
            # Assuming average position contributes 5% risk
            estimated_positions = int(remaining / 0.05)

            capacity = {
                'remaining_risk_budget': remaining,
                'remaining_pct': remaining_pct,
                'used_pct': 100 - remaining_pct,
                'estimated_additional_positions': estimated_positions,
                'at_capacity': remaining < 0.01  # Less than 1% remaining
            }

            return capacity

        except Exception as e:
            logger.error(f"Error calculating risk capacity: {e}")
            return {}

    def _add_alert(self, alert_type: str, message: str, severity: str):
        """Add alert to internal alert list"""
        alert = {
            'timestamp': datetime.now(),
            'type': alert_type,
            'message': message,
            'severity': severity
        }
        self.alerts.append(alert)
        logger.warning(f"RISK ALERT [{severity}]: {message}")

    def get_alerts(self, severity: Optional[str] = None) -> List[Dict]:
        """
        Get recent alerts

        Args:
            severity: Optional filter by severity ('LOW', 'MEDIUM', 'HIGH')

        Returns:
            List of alert dicts
        """
        if severity:
            return [a for a in self.alerts if a['severity'] == severity]
        return self.alerts

    def clear_alerts(self):
        """Clear all alerts"""
        self.alerts = []
        logger.info("All alerts cleared")

    def generate_risk_report(self,
                            portfolio_returns: pd.Series,
                            portfolio_df: pd.DataFrame) -> Dict:
        """
        Generate comprehensive risk monitoring report

        Args:
            portfolio_returns: Portfolio return series
            portfolio_df: Current portfolio holdings

        Returns:
            Dict with complete risk report
        """
        try:
            # Risk utilization
            utilization = self.calculate_risk_utilization(portfolio_returns)

            # Position contributions
            contributions = self.calculate_position_risk_contributions(portfolio_df)

            # Risk capacity
            current_var = utilization.get('current_var', 0)
            capacity = self.get_risk_capacity(current_var)

            # Comprehensive risk metrics
            from ..analytics.risk import calculate_comprehensive_risk_metrics
            risk_metrics = calculate_comprehensive_risk_metrics(portfolio_returns)

            # Recent alerts
            alerts = self.get_alerts()

            report = {
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'utilization': utilization,
                'capacity': capacity,
                'risk_metrics': risk_metrics,
                'position_contributions': contributions.to_dict('records') if contributions is not None else [],
                'alerts': alerts,
                'summary': {
                    'status': utilization.get('status', 'UNKNOWN'),
                    'risk_used_pct': utilization.get('risk_utilization_pct', 0),
                    'leverage': utilization.get('current_leverage', 1.0),
                    'num_alerts': len(alerts),
                    'high_priority_alerts': len([a for a in alerts if a['severity'] == 'HIGH'])
                }
            }

            logger.info("Generated comprehensive risk report")

            return report

        except Exception as e:
            logger.error(f"Error generating risk report: {e}", exc_info=True)
            return {}
