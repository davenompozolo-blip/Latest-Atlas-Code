"""
ATLAS Model Inputs Module
==========================
Components for DCF Model Inputs Dashboard

Includes:
1. DuPont ROE Analysis
2. Sustainable Growth Rate (SGR)
3. Live Cost of Capital (WACC with CAPM)
4. Diluted Shares Calculation (Treasury Stock Method)

Author: ATLAS v11.0
"""

import yfinance as yf
import requests
from datetime import datetime
from typing import Dict, Any, Optional

try:
    from utils.yield_data_fetcher import YieldDataFetcher
    YIELD_FETCHER_AVAILABLE = True
except ImportError:
    YIELD_FETCHER_AVAILABLE = False


# ============================================================================
# COMPONENT 1: DuPont ROE ANALYSIS
# ============================================================================

def calculate_dupont_roe(financial_data: dict) -> dict:
    """
    Calculate 3-factor DuPont ROE breakdown.

    ROE = Net Profit Margin × Asset Turnover × Financial Leverage

    Args:
        financial_data: Contains income statement and balance sheet data

    Returns:
        dict with all DuPont components
    """
    # Extract financial data
    net_income = financial_data.get('net_income', 0)
    revenue = financial_data.get('revenue', 1)  # Avoid division by zero
    total_assets = financial_data.get('total_assets', 1)
    total_equity = financial_data.get('total_equity', 1)

    # Prevent division by zero
    if revenue == 0:
        revenue = 1
    if total_assets == 0:
        total_assets = 1
    if total_equity == 0:
        total_equity = 1

    # Calculate components
    net_margin = net_income / revenue
    asset_turnover = revenue / total_assets
    leverage = total_assets / total_equity

    # Calculate ROE using DuPont
    roe_dupont = net_margin * asset_turnover * leverage

    # Verify: ROE should also = Net Income / Total Equity
    roe_direct = net_income / total_equity

    return {
        'net_margin': net_margin,
        'asset_turnover': asset_turnover,
        'financial_leverage': leverage,
        'roe_dupont': roe_dupont,
        'roe_direct': roe_direct,
        'verification_check': abs(roe_dupont - roe_direct) < 0.001,  # Should match

        # Raw values for display
        'net_income': net_income,
        'revenue': revenue,
        'total_assets': total_assets,
        'total_equity': total_equity
    }


# ============================================================================
# COMPONENT 2: SUSTAINABLE GROWTH RATE (SGR)
# ============================================================================

def calculate_sustainable_growth_rate(financial_data: dict, roe: float) -> dict:
    """
    Calculate sustainable growth rate (SGR).

    SGR represents the maximum growth rate a company can sustain
    without raising external equity, assuming:
    - Constant ROE
    - Constant debt/equity ratio
    - Constant payout ratio

    SGR = Plowback Ratio × ROE

    Args:
        financial_data: Contains dividend and net income data
        roe: Return on equity (from DuPont analysis)

    Returns:
        dict with SGR components and terminal growth recommendation
    """
    net_income = financial_data.get('net_income', 0)
    dividends_paid = financial_data.get('dividends_paid', 0)

    # Calculate payout ratio
    if net_income > 0:
        payout_ratio = dividends_paid / net_income
    else:
        payout_ratio = 0

    # Ensure payout ratio is between 0 and 1
    payout_ratio = max(0, min(1, payout_ratio))

    # Calculate plowback (retention) ratio
    plowback_ratio = 1 - payout_ratio

    # Calculate SGR
    sgr = plowback_ratio * roe

    # Determine appropriate terminal growth rate
    # Terminal growth should be MUCH lower than SGR because:
    # 1. Companies can't grow faster than economy forever
    # 2. High ROE typically mean-reverts over time
    # 3. Competitive dynamics erode returns

    gdp_growth = 0.025  # Long-term US GDP growth ~2.5%

    # Heuristic for terminal growth recommendation
    if sgr <= 0.05:  # SGR ≤ 5%
        terminal_growth_min = max(0.01, sgr * 0.5)
        terminal_growth_max = min(0.035, sgr)
    elif sgr <= 0.15:  # SGR between 5-15%
        terminal_growth_min = 0.02
        terminal_growth_max = 0.04
    else:  # SGR > 15%
        terminal_growth_min = 0.02
        terminal_growth_max = 0.035

    # Suggested terminal growth (midpoint of range)
    terminal_growth_suggested = (terminal_growth_min + terminal_growth_max) / 2

    return {
        'dividends_paid': dividends_paid,
        'net_income': net_income,
        'payout_ratio': payout_ratio,
        'plowback_ratio': plowback_ratio,
        'roe': roe,
        'sgr': sgr,
        'terminal_growth_min': terminal_growth_min,
        'terminal_growth_max': terminal_growth_max,
        'terminal_growth_suggested': terminal_growth_suggested,
        'gdp_growth': gdp_growth
    }


# ============================================================================
# COMPONENT 3: LIVE COST OF CAPITAL (WACC)
# ============================================================================

def get_live_treasury_yield() -> dict:
    """
    Fetch current US 10-year Treasury yield (risk-free rate).

    Data source priority:
    1. FRED API via YieldDataFetcher (official Fed data)
    2. Yahoo Finance via YieldDataFetcher fallback
    3. Direct yfinance (^TNX ticker)
    4. Hardcoded fallback

    Returns:
        dict with yield data and metadata
    """
    # Method 1: YieldDataFetcher (FRED -> Yahoo -> fallback)
    if YIELD_FETCHER_AVAILABLE:
        try:
            fetcher = YieldDataFetcher()
            yields = fetcher.get_current_yields()
            ten_y = yields.get('10Y')

            if ten_y is not None and 0 < ten_y < 15:
                return {
                    'yield': ten_y / 100,  # Convert to decimal (4.23% -> 0.0423)
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'source': fetcher.source,
                    'success': True
                }
        except Exception as e:
            print(f"YieldDataFetcher failed: {e}")

    # Method 2: Direct yfinance fallback
    try:
        tnx = yf.Ticker("^TNX")
        hist = tnx.history(period="5d")

        if not hist.empty:
            yield_value = hist['Close'].iloc[-1] / 100  # TNX is in percentage points

            if 0 < yield_value < 0.15:  # Sanity check (0-15%)
                return {
                    'yield': yield_value,
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'source': 'yfinance (^TNX)',
                    'success': True
                }
    except Exception as e:
        print(f"yfinance failed: {e}")

    # Method 3: Hardcoded fallback
    print("All yield APIs failed, using fallback value")
    return {
        'yield': 0.0425,  # 4.25% as reasonable recent average
        'date': 'N/A',
        'source': 'Fallback (APIs unavailable)',
        'success': False
    }


def calculate_cost_of_capital(financial_data: dict, market_data: dict) -> dict:
    """
    Calculate WACC using CAPM for cost of equity.

    Cost of Equity = Risk-Free Rate + Beta × Market Risk Premium
    WACC = (E/V) × Cost of Equity + (D/V) × Cost of Debt × (1 - Tax Rate)

    Args:
        financial_data: Balance sheet and income statement data
        market_data: Beta, market prices, etc.

    Returns:
        dict with all WACC components
    """
    # Get live risk-free rate
    rf_data = get_live_treasury_yield()
    risk_free_rate = rf_data['yield']

    # Market risk premium (historical average)
    market_risk_premium = 0.065  # 6.5% historical US equity risk premium

    # Get beta
    beta = market_data.get('beta', 1.0)
    if beta is None or beta <= 0:
        beta = 1.0

    # Calculate cost of equity using CAPM
    cost_of_equity = risk_free_rate + beta * market_risk_premium

    # Get debt and equity values
    total_debt = financial_data.get('total_debt', 0)
    market_cap = market_data.get('market_cap', financial_data.get('total_equity', 0))

    if market_cap == 0:
        market_cap = financial_data.get('total_equity', 1)

    total_value = total_debt + market_cap

    if total_value > 0:
        debt_weight = total_debt / total_value
        equity_weight = market_cap / total_value
    else:
        debt_weight = 0
        equity_weight = 1

    # Cost of debt
    interest_expense = financial_data.get('interest_expense', 0)
    if total_debt > 0 and interest_expense > 0:
        cost_of_debt = abs(interest_expense) / total_debt
    else:
        cost_of_debt = risk_free_rate + 0.015  # Risk-free + 1.5% spread

    # Cap cost of debt at reasonable maximum
    cost_of_debt = min(cost_of_debt, 0.15)  # Max 15%

    # Tax rate
    income_tax = financial_data.get('income_tax_expense', 0)
    pretax_income = financial_data.get('pretax_income', financial_data.get('net_income', 1))

    if pretax_income > 0:
        tax_rate = abs(income_tax) / pretax_income
    else:
        tax_rate = 0.21  # US federal corporate tax rate

    # Ensure tax rate is reasonable
    tax_rate = max(0, min(tax_rate, 0.40))  # Between 0-40%

    # After-tax cost of debt
    after_tax_cost_of_debt = cost_of_debt * (1 - tax_rate)

    # WACC calculation
    wacc = (equity_weight * cost_of_equity) + (debt_weight * after_tax_cost_of_debt)

    return {
        'risk_free_rate': risk_free_rate,
        'rf_data': rf_data,
        'market_risk_premium': market_risk_premium,
        'beta': beta,
        'cost_of_equity': cost_of_equity,
        'cost_of_debt': cost_of_debt,
        'after_tax_cost_of_debt': after_tax_cost_of_debt,
        'tax_rate': tax_rate,
        'total_debt': total_debt,
        'market_cap': market_cap,
        'debt_weight': debt_weight,
        'equity_weight': equity_weight,
        'wacc': wacc,
        'interest_expense': interest_expense
    }


# ============================================================================
# COMPONENT 4: DILUTED SHARES CALCULATION
# ============================================================================

def calculate_diluted_shares(financial_data: dict, market_data: dict) -> dict:
    """
    Calculate fully diluted shares using Treasury Stock Method.

    Diluted Shares = Basic Shares + Options Dilution + RSU Dilution

    Options Dilution = Options Outstanding - (Options × Strike + Unrecognized Comp) / Avg Share Price
    RSU Dilution = RSUs Outstanding - (Unrecognized Comp) / Avg Share Price

    Args:
        financial_data: Share-based compensation data
        market_data: Current stock price

    Returns:
        dict with dilution breakdown
    """
    basic_shares = financial_data.get('shares_outstanding_basic',
                                     financial_data.get('shares_outstanding', 0))

    if basic_shares == 0:
        basic_shares = 1  # Prevent division by zero

    avg_share_price = market_data.get('current_price', market_data.get('avg_share_price', 100))

    if avg_share_price == 0:
        avg_share_price = 100  # Default

    # Stock Options
    options_outstanding = financial_data.get('options_outstanding', 0)
    weighted_avg_strike = financial_data.get('weighted_avg_strike_price', avg_share_price)
    unrecognized_comp_options = financial_data.get('unrecognized_comp_options', 0)

    if options_outstanding > 0 and avg_share_price > weighted_avg_strike:
        # Options are in-the-money
        proceeds = (options_outstanding * weighted_avg_strike) + unrecognized_comp_options
        shares_repurchased = proceeds / avg_share_price
        options_dilution = options_outstanding - shares_repurchased
    else:
        # Options are out-of-the-money or anti-dilutive
        options_dilution = 0

    # RSUs
    rsus_outstanding = financial_data.get('rsus_outstanding', 0)
    unrecognized_comp_rsus = financial_data.get('unrecognized_comp_rsus', 0)

    if rsus_outstanding > 0:
        proceeds_rsus = unrecognized_comp_rsus
        shares_repurchased_rsus = proceeds_rsus / avg_share_price if avg_share_price > 0 else 0
        rsus_dilution = rsus_outstanding - shares_repurchased_rsus
    else:
        rsus_dilution = 0

    # Ensure dilution is non-negative
    options_dilution = max(0, options_dilution)
    rsus_dilution = max(0, rsus_dilution)

    # Calculate diluted shares
    diluted_shares = basic_shares + options_dilution + rsus_dilution

    # Dilution percentage
    if basic_shares > 0:
        dilution_pct = (diluted_shares - basic_shares) / basic_shares
    else:
        dilution_pct = 0

    return {
        'basic_shares': basic_shares,
        'options_outstanding': options_outstanding,
        'weighted_avg_strike': weighted_avg_strike,
        'options_dilution': options_dilution,
        'rsus_outstanding': rsus_outstanding,
        'rsus_dilution': rsus_dilution,
        'total_dilution': options_dilution + rsus_dilution,
        'diluted_shares': diluted_shares,
        'dilution_pct': dilution_pct,
        'avg_share_price': avg_share_price
    }


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def extract_financial_data_for_model_inputs(ticker: str) -> tuple:
    """
    Extract all required financial data for model inputs dashboard.

    Args:
        ticker: Stock ticker symbol

    Returns:
        tuple: (financial_data, market_data)
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info

        # Get financial statements
        income_stmt = stock.financials
        balance_sheet = stock.balance_sheet
        cash_flow = stock.cashflow

        # Extract data with error handling
        financial_data = {}
        market_data = {}

        # Income statement data
        if not income_stmt.empty:
            financial_data['revenue'] = income_stmt.loc['Total Revenue'].iloc[0] if 'Total Revenue' in income_stmt.index else 0
            financial_data['net_income'] = income_stmt.loc['Net Income'].iloc[0] if 'Net Income' in income_stmt.index else 0

            # EBIT
            if 'EBIT' in income_stmt.index:
                financial_data['ebit'] = income_stmt.loc['EBIT'].iloc[0]
            elif 'Operating Income' in income_stmt.index:
                financial_data['ebit'] = income_stmt.loc['Operating Income'].iloc[0]
            else:
                financial_data['ebit'] = financial_data['net_income'] * 1.3  # Rough estimate

            # Tax data
            if 'Tax Provision' in income_stmt.index:
                financial_data['income_tax_expense'] = income_stmt.loc['Tax Provision'].iloc[0]
            elif 'Income Tax Expense' in income_stmt.index:
                financial_data['income_tax_expense'] = income_stmt.loc['Income Tax Expense'].iloc[0]
            else:
                financial_data['income_tax_expense'] = 0

            if 'Pretax Income' in income_stmt.index:
                financial_data['pretax_income'] = income_stmt.loc['Pretax Income'].iloc[0]
            else:
                financial_data['pretax_income'] = financial_data['net_income']

            # Interest expense
            if 'Interest Expense' in income_stmt.index:
                financial_data['interest_expense'] = income_stmt.loc['Interest Expense'].iloc[0]
            else:
                financial_data['interest_expense'] = 0

        # Balance sheet data
        if not balance_sheet.empty:
            financial_data['total_assets'] = balance_sheet.loc['Total Assets'].iloc[0] if 'Total Assets' in balance_sheet.index else 0
            financial_data['total_equity'] = balance_sheet.loc['Stockholders Equity'].iloc[0] if 'Stockholders Equity' in balance_sheet.index else 0

            # Debt
            if 'Total Debt' in balance_sheet.index:
                financial_data['total_debt'] = balance_sheet.loc['Total Debt'].iloc[0]
            elif 'Long Term Debt' in balance_sheet.index:
                financial_data['total_debt'] = balance_sheet.loc['Long Term Debt'].iloc[0]
            else:
                financial_data['total_debt'] = 0

            # Net working capital
            if 'Working Capital' in balance_sheet.index:
                financial_data['net_working_capital'] = balance_sheet.loc['Working Capital'].iloc[0]
            else:
                current_assets = balance_sheet.loc['Current Assets'].iloc[0] if 'Current Assets' in balance_sheet.index else 0
                current_liab = balance_sheet.loc['Current Liabilities'].iloc[0] if 'Current Liabilities' in balance_sheet.index else 0
                financial_data['net_working_capital'] = current_assets - current_liab

        # Cash flow data
        if not cash_flow.empty:
            # Dividends
            if 'Cash Dividends Paid' in cash_flow.index:
                financial_data['dividends_paid'] = abs(cash_flow.loc['Cash Dividends Paid'].iloc[0])
            elif 'Common Stock Dividends Paid' in cash_flow.index:
                financial_data['dividends_paid'] = abs(cash_flow.loc['Common Stock Dividends Paid'].iloc[0])
            else:
                financial_data['dividends_paid'] = 0

            # D&A
            if 'Depreciation And Amortization' in cash_flow.index:
                financial_data['depreciation_amortization'] = cash_flow.loc['Depreciation And Amortization'].iloc[0]
            elif 'Depreciation' in cash_flow.index:
                financial_data['depreciation_amortization'] = cash_flow.loc['Depreciation'].iloc[0]
            else:
                financial_data['depreciation_amortization'] = 0

            # CapEx
            if 'Capital Expenditure' in cash_flow.index:
                financial_data['capex'] = cash_flow.loc['Capital Expenditure'].iloc[0]
            else:
                financial_data['capex'] = 0

            # SBC
            if 'Stock Based Compensation' in cash_flow.index:
                financial_data['sbc_expense'] = cash_flow.loc['Stock Based Compensation'].iloc[0]
            else:
                financial_data['sbc_expense'] = 0

        # Market data
        market_data['ticker'] = ticker
        market_data['current_price'] = info.get('currentPrice', info.get('regularMarketPrice', 100))
        market_data['market_cap'] = info.get('marketCap', 0)
        market_data['beta'] = info.get('beta', 1.0)
        market_data['avg_share_price'] = market_data['current_price']

        # Shares outstanding
        financial_data['shares_outstanding'] = info.get('sharesOutstanding', 0)
        financial_data['shares_outstanding_basic'] = financial_data['shares_outstanding']

        # Options and RSUs (often not available from yfinance)
        financial_data['options_outstanding'] = 0
        financial_data['weighted_avg_strike_price'] = market_data['current_price']
        financial_data['unrecognized_comp_options'] = 0
        financial_data['rsus_outstanding'] = 0
        financial_data['unrecognized_comp_rsus'] = 0

        return financial_data, market_data

    except Exception as e:
        print(f"Error extracting financial data: {e}")
        # Return minimal default data
        return {
            'revenue': 0,
            'net_income': 0,
            'ebit': 0,
            'total_assets': 1,
            'total_equity': 1,
            'total_debt': 0,
            'dividends_paid': 0,
            'shares_outstanding': 1,
            'shares_outstanding_basic': 1
        }, {
            'ticker': ticker,
            'current_price': 100,
            'market_cap': 0,
            'beta': 1.0,
            'avg_share_price': 100
        }


if __name__ == '__main__':
    # Test the module
    print("Testing Model Inputs Module")
    print("=" * 60)

    # Test with MSFT
    ticker = 'MSFT'
    print(f"\nTesting with {ticker}...")

    financial_data, market_data = extract_financial_data_for_model_inputs(ticker)

    print("\n1. DuPont ROE Analysis:")
    dupont = calculate_dupont_roe(financial_data)
    print(f"   ROE (DuPont): {dupont['roe_dupont']:.2%}")
    print(f"   ROE (Direct): {dupont['roe_direct']:.2%}")
    print(f"   Verification: {'✅ Match' if dupont['verification_check'] else '❌ Mismatch'}")

    print("\n2. Sustainable Growth Rate:")
    sgr = calculate_sustainable_growth_rate(financial_data, dupont['roe_dupont'])
    print(f"   SGR: {sgr['sgr']:.2%}")
    print(f"   Terminal Growth Range: {sgr['terminal_growth_min']:.2%} - {sgr['terminal_growth_max']:.2%}")

    print("\n3. Cost of Capital:")
    wacc_data = calculate_cost_of_capital(financial_data, market_data)
    print(f"   Risk-Free Rate: {wacc_data['risk_free_rate']:.2%} ({wacc_data['rf_data']['source']})")
    print(f"   Cost of Equity: {wacc_data['cost_of_equity']:.2%}")
    print(f"   WACC: {wacc_data['wacc']:.2%}")

    print("\n4. Diluted Shares:")
    dilution = calculate_diluted_shares(financial_data, market_data)
    print(f"   Basic Shares: {dilution['basic_shares']/1e6:.1f}M")
    print(f"   Diluted Shares: {dilution['diluted_shares']/1e6:.1f}M")
    print(f"   Dilution: {dilution['dilution_pct']:.2%}")

    print("\n✅ Module test complete!")
