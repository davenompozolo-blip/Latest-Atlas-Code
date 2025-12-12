"""
ATLAS DCF Valuation Engine
Intrinsic value calculation using discounted cash flow
"""

import numpy as np
import pandas as pd
from typing import Dict, Optional, List
import yfinance as yf


class DCFValuation:
    """
    DCF Valuation Engine

    Calculates intrinsic value using:
    - Free Cash Flow projections
    - Terminal value calculation
    - WACC-based discounting
    """

    def __init__(self, ticker: str):
        """
        Initialize DCF engine

        Args:
            ticker: Stock ticker symbol
        """
        self.ticker = ticker
        self.stock = yf.Ticker(ticker)
        self.financials = None
        self.cash_flows = None
        self._fetch_financial_data()

    def _fetch_financial_data(self):
        """Fetch financial statements"""
        try:
            self.financials = self.stock.financials
            self.cash_flows = self.stock.cashflow
            print(f"✅ Fetched financials for {self.ticker}")
        except Exception as e:
            print(f"❌ Error fetching financials: {str(e)}")
            raise

    def calculate_wacc(
        self,
        risk_free_rate: float = 0.03,
        market_return: float = 0.10,
        tax_rate: float = 0.21
    ) -> float:
        """
        Calculate Weighted Average Cost of Capital

        Args:
            risk_free_rate: Risk-free rate (default 3%)
            market_return: Expected market return (default 10%)
            tax_rate: Corporate tax rate (default 21%)

        Returns:
            WACC as decimal
        """
        try:
            info = self.stock.info

            # Get beta
            beta = info.get('beta', 1.0)

            # Cost of Equity (CAPM)
            cost_of_equity = risk_free_rate + beta * (market_return - risk_free_rate)

            # Get debt and equity values
            total_debt = info.get('totalDebt', 0)
            market_cap = info.get('marketCap', 1)

            if total_debt == 0:
                return cost_of_equity

            total_value = total_debt + market_cap

            weight_debt = total_debt / total_value
            weight_equity = market_cap / total_value

            balance_sheet = self.stock.balance_sheet
            interest_expense = abs(self.financials.loc['Interest Expense'].iloc[0]) if 'Interest Expense' in self.financials.index else 0
            cost_of_debt = interest_expense / total_debt if total_debt > 0 else 0.05

            wacc = (weight_equity * cost_of_equity) + (weight_debt * cost_of_debt * (1 - tax_rate))

            return wacc

        except Exception as e:
            print(f"Error calculating WACC: {str(e)}")
            return 0.10

    def project_cash_flows(
        self,
        years: int = 5,
        growth_rate: float = 0.05
    ) -> List[float]:
        """
        Project future free cash flows

        Args:
            years: Number of years to project
            growth_rate: Annual growth rate

        Returns:
            List of projected cash flows
        """
        try:
            if 'Free Cash Flow' in self.cash_flows.index:
                base_fcf = self.cash_flows.loc['Free Cash Flow'].iloc[0]
            elif 'Operating Cash Flow' in self.cash_flows.index:
                operating_cf = self.cash_flows.loc['Operating Cash Flow'].iloc[0]
                capex = abs(self.cash_flows.loc['Capital Expenditure'].iloc[0]) if 'Capital Expenditure' in self.cash_flows.index else 0
                base_fcf = operating_cf - capex
            else:
                raise ValueError("Cannot find cash flow data")

            projected_fcf = []
            for year in range(1, years + 1):
                fcf = base_fcf * ((1 + growth_rate) ** year)
                projected_fcf.append(fcf)

            return projected_fcf

        except Exception as e:
            print(f"Error projecting cash flows: {str(e)}")
            raise

    def calculate_terminal_value(
        self,
        final_fcf: float,
        terminal_growth_rate: float = 0.025,
        wacc: float = 0.10
    ) -> float:
        """
        Calculate terminal value (Gordon Growth Model)

        Args:
            final_fcf: Final year projected FCF
            terminal_growth_rate: Perpetual growth rate
            wacc: Discount rate

        Returns:
            Terminal value
        """
        if wacc <= terminal_growth_rate:
            raise ValueError("WACC must be greater than terminal growth rate")

        terminal_value = (final_fcf * (1 + terminal_growth_rate)) / (wacc - terminal_growth_rate)
        return terminal_value

    def calculate_intrinsic_value(
        self,
        projection_years: int = 5,
        growth_rate: float = 0.05,
        terminal_growth_rate: float = 0.025,
        wacc: Optional[float] = None
    ) -> Dict:
        """
        Calculate intrinsic value per share

        Args:
            projection_years: Years to project FCF
            growth_rate: Annual FCF growth rate
            terminal_growth_rate: Perpetual growth rate
            wacc: Discount rate (calculated if not provided)

        Returns:
            Dict with valuation details
        """
        if wacc is None:
            wacc = self.calculate_wacc()

        projected_fcf = self.project_cash_flows(projection_years, growth_rate)

        terminal_value = self.calculate_terminal_value(
            projected_fcf[-1],
            terminal_growth_rate,
            wacc
        )

        pv_fcf = []
        for year, fcf in enumerate(projected_fcf, start=1):
            pv = fcf / ((1 + wacc) ** year)
            pv_fcf.append(pv)

        pv_terminal = terminal_value / ((1 + wacc) ** projection_years)

        enterprise_value = sum(pv_fcf) + pv_terminal

        info = self.stock.info
        shares_outstanding = info.get('sharesOutstanding', 1)

        total_cash = info.get('totalCash', 0)
        total_debt = info.get('totalDebt', 0)

        equity_value = enterprise_value + total_cash - total_debt
        intrinsic_value_per_share = equity_value / shares_outstanding

        current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))

        upside = ((intrinsic_value_per_share - current_price) / current_price) * 100 if current_price > 0 else 0

        return {
            'ticker': self.ticker,
            'intrinsic_value': intrinsic_value_per_share,
            'current_price': current_price,
            'upside_pct': upside,
            'wacc': wacc,
            'enterprise_value': enterprise_value,
            'equity_value': equity_value,
            'projected_fcf': projected_fcf,
            'terminal_value': terminal_value,
            'pv_fcf': pv_fcf,
            'pv_terminal': pv_terminal,
            'shares_outstanding': shares_outstanding
        }


__all__ = ['DCFValuation']
