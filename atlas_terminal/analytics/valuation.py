"""
Valuation Analytics Module
DCF models and fundamental valuation calculations

FEATURES:
- Discounted Cash Flow (DCF) valuation
- Terminal value calculation (Gordon Growth Model)
- WACC calculation
- Fair value estimation
- Valuation ratios (P/E, P/B, PEG, etc.)
- Margin of safety calculation
"""

import pandas as pd
import numpy as np
from typing import Optional, Dict, List, Tuple
import logging

from ..data.validators import is_valid_dataframe
from ..data.fetchers import fetch_company_info, fetch_financial_statements

logger = logging.getLogger(__name__)


def calculate_dcf_valuation(ticker: str,
                            projected_fcf: List[float],
                            terminal_growth_rate: float = 0.025,
                            discount_rate: float = 0.10,
                            shares_outstanding: Optional[float] = None) -> Dict:
    """
    Calculate DCF valuation for a stock

    Args:
        ticker: Stock ticker symbol
        projected_fcf: List of projected free cash flows for next N years
        terminal_growth_rate: Perpetual growth rate for terminal value
        discount_rate: WACC or required return
        shares_outstanding: Number of shares (fetched if not provided)

    Returns:
        Dict with DCF valuation results
    """
    try:
        # Fetch shares outstanding if not provided
        if shares_outstanding is None:
            info = fetch_company_info(ticker)
            if info:
                shares_outstanding = info.get('sharesOutstanding')

        if not shares_outstanding or shares_outstanding <= 0:
            logger.error(f"Cannot perform DCF without shares outstanding for {ticker}")
            return {
                'success': False,
                'error': 'Shares outstanding not available'
            }

        # Calculate present value of projected cash flows
        pv_fcf = []
        for year, fcf in enumerate(projected_fcf, start=1):
            pv = fcf / ((1 + discount_rate) ** year)
            pv_fcf.append(pv)

        sum_pv_fcf = sum(pv_fcf)

        # Calculate terminal value using Gordon Growth Model
        last_fcf = projected_fcf[-1]
        terminal_fcf = last_fcf * (1 + terminal_growth_rate)
        terminal_value = terminal_fcf / (discount_rate - terminal_growth_rate)

        # Discount terminal value to present
        n_years = len(projected_fcf)
        pv_terminal_value = terminal_value / ((1 + discount_rate) ** n_years)

        # Enterprise value = PV of cash flows + PV of terminal value
        enterprise_value = sum_pv_fcf + pv_terminal_value

        # Fair value per share
        fair_value_per_share = enterprise_value / shares_outstanding

        logger.info(f"DCF for {ticker}: Fair Value = ${fair_value_per_share:.2f}")

        return {
            'success': True,
            'ticker': ticker,
            'projected_fcf': projected_fcf,
            'pv_fcf': pv_fcf,
            'sum_pv_fcf': sum_pv_fcf,
            'terminal_value': terminal_value,
            'pv_terminal_value': pv_terminal_value,
            'enterprise_value': enterprise_value,
            'shares_outstanding': shares_outstanding,
            'fair_value_per_share': fair_value_per_share,
            'discount_rate': discount_rate,
            'terminal_growth_rate': terminal_growth_rate,
            'n_years': n_years
        }

    except Exception as e:
        logger.error(f"Error calculating DCF for {ticker}: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


def calculate_terminal_value(final_fcf: float,
                            terminal_growth_rate: float,
                            discount_rate: float) -> float:
    """
    Calculate terminal value using Gordon Growth Model

    Terminal Value = FCF_terminal / (discount_rate - growth_rate)

    Args:
        final_fcf: Final year free cash flow
        terminal_growth_rate: Perpetual growth rate
        discount_rate: Discount rate (WACC)

    Returns:
        Terminal value
    """
    if discount_rate <= terminal_growth_rate:
        logger.error("Discount rate must be greater than terminal growth rate")
        return 0

    try:
        terminal_fcf = final_fcf * (1 + terminal_growth_rate)
        terminal_value = terminal_fcf / (discount_rate - terminal_growth_rate)
        return terminal_value

    except Exception as e:
        logger.error(f"Error calculating terminal value: {e}")
        return 0


def calculate_wacc(ticker: str,
                  risk_free_rate: float = 0.045,
                  market_return: float = 0.10,
                  tax_rate: float = 0.21) -> Optional[float]:
    """
    Calculate Weighted Average Cost of Capital (WACC)

    WACC = (E/V) * Re + (D/V) * Rd * (1 - Tc)
    Where:
    - E = Market value of equity
    - D = Market value of debt
    - V = E + D
    - Re = Cost of equity (CAPM)
    - Rd = Cost of debt
    - Tc = Corporate tax rate

    Args:
        ticker: Stock ticker symbol
        risk_free_rate: Risk-free rate
        market_return: Expected market return
        tax_rate: Corporate tax rate

    Returns:
        WACC as decimal or None
    """
    try:
        info = fetch_company_info(ticker)
        if not info:
            logger.error(f"Cannot fetch company info for {ticker}")
            return None

        # Get beta for CAPM
        beta = info.get('beta')
        if beta is None or beta <= 0:
            logger.warning(f"Invalid beta for {ticker}, using 1.0")
            beta = 1.0

        # Calculate cost of equity using CAPM
        # Re = Rf + Beta * (Rm - Rf)
        cost_of_equity = risk_free_rate + beta * (market_return - risk_free_rate)

        # Get market cap and debt
        market_cap = info.get('marketCap', 0)
        total_debt = info.get('totalDebt', 0)

        if market_cap <= 0:
            logger.error(f"Invalid market cap for {ticker}")
            return None

        # If no debt, WACC = Cost of Equity
        if total_debt <= 0:
            logger.info(f"No debt for {ticker}, WACC = Cost of Equity = {cost_of_equity*100:.2f}%")
            return cost_of_equity

        # Total value
        total_value = market_cap + total_debt

        # Weights
        equity_weight = market_cap / total_value
        debt_weight = total_debt / total_value

        # Cost of debt (approximate from interest expense if available)
        interest_expense = info.get('interestExpense', 0)
        if interest_expense > 0 and total_debt > 0:
            cost_of_debt = abs(interest_expense) / total_debt
        else:
            # Use approximation based on credit quality
            cost_of_debt = risk_free_rate + 0.02  # Default spread

        # WACC
        wacc = (equity_weight * cost_of_equity) + (debt_weight * cost_of_debt * (1 - tax_rate))

        logger.info(f"WACC for {ticker}: {wacc*100:.2f}%")

        return wacc

    except Exception as e:
        logger.error(f"Error calculating WACC for {ticker}: {e}", exc_info=True)
        return None


def calculate_valuation_ratios(ticker: str,
                               current_price: Optional[float] = None) -> Dict:
    """
    Calculate fundamental valuation ratios

    Args:
        ticker: Stock ticker symbol
        current_price: Current stock price (fetched if not provided)

    Returns:
        Dict with valuation ratios
    """
    try:
        info = fetch_company_info(ticker)
        if not info:
            logger.error(f"Cannot fetch company info for {ticker}")
            return {}

        # Get current price if not provided
        if current_price is None:
            current_price = info.get('currentPrice', info.get('regularMarketPrice'))

        if not current_price:
            logger.error(f"Cannot determine current price for {ticker}")
            return {}

        ratios = {
            'ticker': ticker,
            'current_price': current_price,
            'pe_ratio': info.get('trailingPE'),
            'forward_pe': info.get('forwardPE'),
            'pb_ratio': info.get('priceToBook'),
            'ps_ratio': info.get('priceToSalesTrailing12Months'),
            'peg_ratio': info.get('pegRatio'),
            'price_to_fcf': info.get('priceToFreeCashFlow'),
            'ev_to_revenue': info.get('enterpriseToRevenue'),
            'ev_to_ebitda': info.get('enterpriseToEbitda'),
            'dividend_yield': info.get('dividendYield'),
            'market_cap': info.get('marketCap'),
            'enterprise_value': info.get('enterpriseValue')
        }

        logger.info(f"Valuation ratios for {ticker}: P/E={ratios.get('pe_ratio')}, P/B={ratios.get('pb_ratio')}")

        return ratios

    except Exception as e:
        logger.error(f"Error calculating valuation ratios for {ticker}: {e}", exc_info=True)
        return {}


def calculate_margin_of_safety(current_price: float,
                               fair_value: float) -> Tuple[float, str]:
    """
    Calculate margin of safety

    Margin of Safety = (Fair Value - Current Price) / Fair Value * 100

    Args:
        current_price: Current market price
        fair_value: Estimated fair value

    Returns:
        Tuple of (margin_of_safety_pct, assessment_str)
    """
    if fair_value <= 0:
        return 0.0, "Invalid"

    try:
        mos = ((fair_value - current_price) / fair_value) * 100

        # Assessment
        if mos >= 40:
            assessment = "Deeply Undervalued"
        elif mos >= 25:
            assessment = "Undervalued"
        elif mos >= 10:
            assessment = "Slightly Undervalued"
        elif mos >= -10:
            assessment = "Fairly Valued"
        elif mos >= -25:
            assessment = "Slightly Overvalued"
        elif mos >= -40:
            assessment = "Overvalued"
        else:
            assessment = "Deeply Overvalued"

        logger.info(f"Margin of Safety: {mos:.1f}% ({assessment})")

        return mos, assessment

    except Exception as e:
        logger.error(f"Error calculating margin of safety: {e}")
        return 0.0, "Error"


def estimate_intrinsic_value_multiples(ticker: str,
                                       method: str = 'pe') -> Optional[float]:
    """
    Estimate intrinsic value using comparable multiples

    Args:
        ticker: Stock ticker symbol
        method: 'pe', 'pb', 'ps', or 'fcf'

    Returns:
        Estimated intrinsic value per share or None
    """
    try:
        info = fetch_company_info(ticker)
        if not info:
            return None

        # Get industry/sector average multiple (simplified - would use comps in reality)
        industry_multiples = {
            'pe': 20,  # Average P/E
            'pb': 3,   # Average P/B
            'ps': 2,   # Average P/S
            'fcf': 15  # Average P/FCF
        }

        avg_multiple = industry_multiples.get(method, 15)

        if method == 'pe':
            eps = info.get('trailingEps')
            if eps and eps > 0:
                intrinsic_value = eps * avg_multiple
                return intrinsic_value

        elif method == 'pb':
            book_value = info.get('bookValue')
            if book_value and book_value > 0:
                intrinsic_value = book_value * avg_multiple
                return intrinsic_value

        elif method == 'ps':
            revenue_per_share = info.get('revenuePerShare')
            if revenue_per_share and revenue_per_share > 0:
                intrinsic_value = revenue_per_share * avg_multiple
                return intrinsic_value

        elif method == 'fcf':
            # Estimate FCF per share
            operating_cf = info.get('operatingCashflow', 0)
            capex = info.get('capitalExpenditures', 0)
            shares = info.get('sharesOutstanding', 1)

            if operating_cf > 0 and shares > 0:
                fcf_per_share = (operating_cf - abs(capex)) / shares
                intrinsic_value = fcf_per_share * avg_multiple
                return intrinsic_value

        logger.warning(f"Could not estimate intrinsic value using {method} method for {ticker}")
        return None

    except Exception as e:
        logger.error(f"Error estimating intrinsic value for {ticker}: {e}", exc_info=True)
        return None


def project_free_cash_flows(ticker: str,
                            growth_rate: float = 0.10,
                            n_years: int = 5) -> Optional[List[float]]:
    """
    Project future free cash flows based on historical data

    Args:
        ticker: Stock ticker symbol
        growth_rate: Annual growth rate assumption
        n_years: Number of years to project

    Returns:
        List of projected FCF or None
    """
    try:
        info = fetch_company_info(ticker)
        if not info:
            return None

        # Get most recent FCF
        operating_cf = info.get('operatingCashflow', 0)
        capex = info.get('capitalExpenditures', 0)

        if operating_cf <= 0:
            logger.warning(f"No positive operating cash flow for {ticker}")
            return None

        # Calculate current FCF
        current_fcf = operating_cf - abs(capex)

        if current_fcf <= 0:
            logger.warning(f"Negative free cash flow for {ticker}")
            return None

        # Project future FCF
        projected_fcf = []
        for year in range(1, n_years + 1):
            future_fcf = current_fcf * ((1 + growth_rate) ** year)
            projected_fcf.append(future_fcf)

        logger.info(f"Projected {n_years} years of FCF for {ticker} with {growth_rate*100:.1f}% growth")

        return projected_fcf

    except Exception as e:
        logger.error(f"Error projecting free cash flows for {ticker}: {e}", exc_info=True)
        return None


def calculate_dividend_discount_model(ticker: str,
                                     dividend_growth_rate: float = 0.05,
                                     required_return: float = 0.10) -> Optional[float]:
    """
    Calculate intrinsic value using Dividend Discount Model (Gordon Growth)

    Intrinsic Value = D1 / (r - g)
    Where:
    - D1 = Next year's dividend
    - r = Required return
    - g = Dividend growth rate

    Args:
        ticker: Stock ticker symbol
        dividend_growth_rate: Expected dividend growth rate
        required_return: Required return

    Returns:
        Intrinsic value per share or None
    """
    if required_return <= dividend_growth_rate:
        logger.error("Required return must be greater than dividend growth rate")
        return None

    try:
        info = fetch_company_info(ticker)
        if not info:
            return None

        # Get current dividend
        dividend = info.get('dividendRate', 0)

        if dividend <= 0:
            logger.warning(f"No dividend for {ticker}, DDM not applicable")
            return None

        # Next year's dividend
        next_dividend = dividend * (1 + dividend_growth_rate)

        # Intrinsic value
        intrinsic_value = next_dividend / (required_return - dividend_growth_rate)

        logger.info(f"DDM for {ticker}: Intrinsic Value = ${intrinsic_value:.2f}")

        return intrinsic_value

    except Exception as e:
        logger.error(f"Error calculating DDM for {ticker}: {e}", exc_info=True)
        return None


def calculate_earnings_power_value(ticker: str,
                                   normalized_earnings: Optional[float] = None,
                                   cost_of_capital: float = 0.10) -> Optional[float]:
    """
    Calculate Earnings Power Value (EPV)

    EPV = Normalized Earnings / Cost of Capital

    Assumes no growth (conservative valuation)

    Args:
        ticker: Stock ticker symbol
        normalized_earnings: Normalized earnings (uses recent if not provided)
        cost_of_capital: Required return

    Returns:
        Earnings power value or None
    """
    try:
        info = fetch_company_info(ticker)
        if not info:
            return None

        # Get normalized earnings if not provided
        if normalized_earnings is None:
            # Use average of trailing and forward earnings
            trailing_earnings = info.get('netIncomeToCommon', 0)
            forward_earnings_estimate = info.get('forwardEps', 0) * info.get('sharesOutstanding', 0)

            if trailing_earnings > 0 and forward_earnings_estimate > 0:
                normalized_earnings = (trailing_earnings + forward_earnings_estimate) / 2
            elif trailing_earnings > 0:
                normalized_earnings = trailing_earnings
            else:
                logger.warning(f"No earnings data for {ticker}")
                return None

        # EPV
        epv = normalized_earnings / cost_of_capital

        logger.info(f"EPV for {ticker}: ${epv:,.0f}")

        return epv

    except Exception as e:
        logger.error(f"Error calculating EPV for {ticker}: {e}", exc_info=True)
        return None
