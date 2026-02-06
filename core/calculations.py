"""
ATLAS Terminal - Analytics & Calculation Functions
Extracted from atlas_app.py (Phase 4).
"""
import math
import json
import pickle
import warnings
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st

try:
    import plotly.graph_objects as go
    import plotly.express as px
except ImportError:
    pass

try:
    import yfinance as yf
except ImportError:
    pass

try:
    from scipy import stats
    from scipy.optimize import minimize
except ImportError:
    pass

from app.config import (
    COLORS, CHART_HEIGHT_COMPACT, CHART_HEIGHT_STANDARD,
    CHART_HEIGHT_LARGE, CHART_HEIGHT_DEEP_DIVE, CHART_THEME,
    CACHE_DIR, PORTFOLIO_CACHE, TRADE_HISTORY_CACHE,
    ACCOUNT_HISTORY_CACHE, RISK_FREE_RATE, MARKET_RETURN
)
from utils.formatting import format_currency, format_percentage, format_large_number, add_arrow_indicator

try:
    from data.instruments import POPULAR_STOCKS, POPULAR_ETFS, GLOBAL_INDICES
except ImportError:
    POPULAR_STOCKS = {}
    POPULAR_ETFS = {}
    GLOBAL_INDICES = {}

try:
    from data.sectors import GICS_SECTORS, GICS_SECTOR_MAPPING, STOCK_SECTOR_OVERRIDES, SPY_SECTOR_WEIGHTS
except ImportError:
    GICS_SECTORS = {}
    GICS_SECTOR_MAPPING = {}
    STOCK_SECTOR_OVERRIDES = {}
    SPY_SECTOR_WEIGHTS = {}

# Cross-module imports (functions used in this file but defined in sibling modules)
from .fetchers import fetch_historical_data
from .data_loading import is_valid_series, is_option_ticker, get_gics_sector

# Refactored infrastructure availability (originally defined in atlas_app.py)
try:
    from atlas_terminal.data.fetchers.market_data import market_data
    REFACTORED_MODULES_AVAILABLE = True
except ImportError:
    REFACTORED_MODULES_AVAILABLE = False
    market_data = None


def _lazy_atlas():
    """Lazy import of atlas_app to avoid circular imports."""
    import atlas_app
    return atlas_app


def calculate_signal_health(metrics):
    """
    Calculate overall portfolio health score with traffic light system
    Returns: (status, percentage, label)
    GREEN: 80%+, YELLOW: 50-79%, RED: <50%
    """
    score = 0
    max_score = 5

    # Check 1: Positive returns
    if metrics.get('Total Return', 0) > 0:
        score += 1

    # Check 2: Sharpe > 1.0 (good risk-adjusted returns)
    if metrics.get('Sharpe Ratio', 0) > 1.0:
        score += 1

    # Check 3: Drawdown > -20% (manageable losses)
    if metrics.get('Max Drawdown', -100) > -20:
        score += 1

    # Check 4: Win rate > 55% (more winning days)
    if metrics.get('Win Rate', 0) > 55:
        score += 1

    # Check 5: Volatility < 25% (controlled risk)
    if metrics.get('Annualized Volatility', 100) < 25:
        score += 1

    percentage = (score / max_score) * 100

    if percentage >= 80:
        status = 'GREEN'
        emoji = '🟢'
        label = 'HEALTHY'
    elif percentage >= 50:
        status = 'YELLOW'
        emoji = '🟡'
        label = 'CAUTION'
    else:
        status = 'RED'
        emoji = '🔴'
        label = 'AT RISK'

    return status, percentage, f"{emoji} {label}"


def calculate_forward_rates(maturities, spot_rates):
    """Calculate forward rates from spot rates"""
    forward_rates = []
    forward_maturities = []

    for i in range(len(maturities) - 1):
        t1 = maturities[i]
        t2 = maturities[i + 1]
        s1 = spot_rates[i] / 100  # Convert to decimal
        s2 = spot_rates[i + 1] / 100

        # Forward rate formula: f(t1,t2) = [(1 + s2)^t2 / (1 + s1)^t1]^(1/(t2-t1)) - 1
        forward_rate = (((1 + s2) ** t2) / ((1 + s1) ** t1)) ** (1 / (t2 - t1)) - 1
        forward_rates.append(forward_rate * 100)  # Convert back to percentage
        forward_maturities.append(f"{int(t1)}Y-{int(t2)}Y")

    return forward_maturities, forward_rates


def calculate_smart_assumptions(company_data, financials):
    """
    NEW: Calculate realistic, economically grounded assumptions
    based on company fundamentals, sector averages, and economic reality
    """
    sector = company_data.get('sector', 'Unknown')
    revenue = financials.get('revenue', 0)
    ebit = financials.get('ebit', 0)
    
    # Smart revenue growth (based on sector and size)
    sector_growth_rates = {
        'Technology': 0.08,
        'Healthcare': 0.06,
        'Financial Services': 0.05,
        'Consumer Cyclical': 0.04,
        'Consumer Defensive': 0.03,
        'Energy': 0.03,
        'Industrials': 0.04,
        'Basic Materials': 0.03,
        'Real Estate': 0.03,
        'Utilities': 0.02,
        'Communication Services': 0.05,
        'Unknown': 0.04
    }
    
    base_growth = sector_growth_rates.get(sector, 0.04)
    
    # Adjust for company size (larger = slower growth)
    market_cap = company_data.get('market_cap', 0)
    if market_cap > 500e9:  # Mega cap
        size_adjustment = -0.02
    elif market_cap > 100e9:  # Large cap
        size_adjustment = -0.01
    elif market_cap > 10e9:  # Mid cap
        size_adjustment = 0
    else:  # Small cap
        size_adjustment = 0.01
    
    smart_revenue_growth = base_growth + size_adjustment
    
    # Smart EBIT margin (sector averages)
    sector_ebit_margins = {
        'Technology': 0.25,
        'Healthcare': 0.20,
        'Financial Services': 0.30,
        'Consumer Cyclical': 0.10,
        'Consumer Defensive': 0.08,
        'Energy': 0.15,
        'Industrials': 0.12,
        'Basic Materials': 0.15,
        'Real Estate': 0.40,
        'Utilities': 0.20,
        'Communication Services': 0.18,
        'Unknown': 0.15
    }
    
    smart_ebit_margin = sector_ebit_margins.get(sector, 0.15)
    
    # Smart CapEx (as % of revenue, sector-based)
    sector_capex_rates = {
        'Technology': 0.03,
        'Healthcare': 0.04,
        'Financial Services': 0.02,
        'Consumer Cyclical': 0.05,
        'Consumer Defensive': 0.04,
        'Energy': 0.12,
        'Industrials': 0.06,
        'Basic Materials': 0.10,
        'Real Estate': 0.08,
        'Utilities': 0.15,
        'Communication Services': 0.07,
        'Unknown': 0.05
    }
    
    smart_capex_pct = sector_capex_rates.get(sector, 0.05)
    
    # Smart Depreciation (typically 60-80% of CapEx for mature companies)
    smart_depreciation_pct = smart_capex_pct * 0.7
    
    # Smart Terminal Growth (conservative)
    smart_terminal_growth = 0.025  # Long-term GDP growth
    
    # Smart Tax Rate (based on geography and sector)
    smart_tax_rate = 0.21  # US corporate rate
    
    return {
        'revenue_growth': smart_revenue_growth,
        'ebit_margin': smart_ebit_margin,
        'capex_pct': smart_capex_pct,
        'depreciation_pct': smart_depreciation_pct,
        'terminal_growth': smart_terminal_growth,
        'tax_rate': smart_tax_rate,
        'wc_change': 0,  # Assume neutral
        'forecast_years': 5
    }


def calculate_wacc(cost_equity, cost_debt, tax_rate, debt, equity):
    """Calculate Weighted Average Cost of Capital"""
    total_value = debt + equity
    if total_value == 0:
        return cost_equity
    
    weight_equity = equity / total_value
    weight_debt = debt / total_value
    
    wacc = (cost_equity * weight_equity) + (cost_debt * (1 - tax_rate) * weight_debt)
    return wacc


def calculate_cost_of_equity(risk_free_rate, beta, market_risk_premium):
    """Calculate Cost of Equity using CAPM"""
    return risk_free_rate + (beta * market_risk_premium)


def calculate_terminal_value(final_fcf, discount_rate, terminal_growth):
    """Calculate Terminal Value using Gordon Growth Model"""
    if discount_rate <= terminal_growth:
        return 0
    return final_fcf * (1 + terminal_growth) / (discount_rate - terminal_growth)


def calculate_dcf_value(projections, discount_rate, terminal_value, shares_outstanding, 
                       net_debt=0, method='FCFF'):
    """Calculate DCF valuation"""
    # Discount projected cash flows
    pv_cash_flows = []
    total_pv = 0
    
    for proj in projections:
        year = proj['year']
        cf = proj['fcff'] if method == 'FCFF' else proj['fcfe']
        pv = cf / ((1 + discount_rate) ** year)
        pv_cash_flows.append(pv)
        total_pv += pv
    
    # Discount terminal value
    pv_terminal = terminal_value / ((1 + discount_rate) ** len(projections))
    
    # Calculate enterprise/equity value
    enterprise_value = total_pv + pv_terminal
    
    if method == 'FCFF':
        # For FCFF, subtract net debt to get equity value
        equity_value = enterprise_value - net_debt
    else:
        # For FCFE, enterprise value IS equity value
        equity_value = enterprise_value
    
    # Calculate per share value
    intrinsic_value_per_share = equity_value / shares_outstanding if shares_outstanding > 0 else 0
    
    return {
        'pv_cash_flows': pv_cash_flows,
        'total_pv_cash_flows': total_pv,
        'terminal_value': terminal_value,
        'pv_terminal': pv_terminal,
        'enterprise_value': enterprise_value,
        'equity_value': equity_value,
        'intrinsic_value_per_share': intrinsic_value_per_share
    }


def calculate_gordon_growth_ddm(current_dividend, cost_of_equity, growth_rate, shares_outstanding):
    """
    Gordon Growth Model (Constant Growth DDM)
    Value = D1 / (r - g)
    Where D1 = D0 * (1 + g)
    """
    # Apply constraint: growth < cost of equity
    if growth_rate >= cost_of_equity:
        growth_rate = cost_of_equity * 0.9  # Safety margin

    # Constrain terminal growth
    growth_rate = apply_damodaran_constraints(growth_rate, 'terminal_growth')

    # Calculate next year's dividend
    d1 = current_dividend * (1 + growth_rate)

    # Gordon Growth formula
    equity_value = d1 / (cost_of_equity - growth_rate)
    intrinsic_value_per_share = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    return {
        'method': 'Gordon Growth DDM',
        'current_dividend': current_dividend,
        'd1': d1,
        'cost_of_equity': cost_of_equity,
        'growth_rate': growth_rate,
        'equity_value': equity_value,
        'intrinsic_value_per_share': intrinsic_value_per_share,
        'shares_outstanding': shares_outstanding
    }


def calculate_multistage_ddm(current_dividend, cost_of_equity, high_growth_rate,
                             high_growth_years, stable_growth_rate, shares_outstanding):
    """
    Multi-Stage DDM (H-Model or 2-Stage)
    Phase 1: High growth period
    Phase 2: Transition to stable growth
    """
    # Apply constraints
    stable_growth_rate = apply_damodaran_constraints(stable_growth_rate, 'terminal_growth')

    if stable_growth_rate >= cost_of_equity:
        stable_growth_rate = cost_of_equity * 0.9

    pv_dividends = 0
    current_div = current_dividend

    # Phase 1: High growth dividends
    for year in range(1, high_growth_years + 1):
        current_div = current_div * (1 + high_growth_rate)
        pv = current_div / ((1 + cost_of_equity) ** year)
        pv_dividends += pv

    # Terminal value using Gordon Growth
    terminal_dividend = current_div * (1 + stable_growth_rate)
    terminal_value = terminal_dividend / (cost_of_equity - stable_growth_rate)
    pv_terminal = terminal_value / ((1 + cost_of_equity) ** high_growth_years)

    equity_value = pv_dividends + pv_terminal
    intrinsic_value_per_share = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    return {
        'method': 'Multi-Stage DDM',
        'pv_high_growth_dividends': pv_dividends,
        'terminal_value': terminal_value,
        'pv_terminal': pv_terminal,
        'equity_value': equity_value,
        'intrinsic_value_per_share': intrinsic_value_per_share,
        'high_growth_years': high_growth_years,
        'stable_growth_rate': stable_growth_rate,
        'shares_outstanding': shares_outstanding
    }


def calculate_residual_income(book_value_equity, roe, cost_of_equity, growth_rate,
                              forecast_years, shares_outstanding):
    """
    Residual Income Model (Edwards-Bell-Ohlson)
    Value = Book Value + PV(Residual Income)
    RI = (ROE - Cost of Equity) × Book Value
    """
    # Apply ROE constraints
    roe = apply_damodaran_constraints(roe, 'roe')
    growth_rate = apply_damodaran_constraints(growth_rate, 'terminal_growth')

    pv_residual_income = 0
    current_bv = book_value_equity

    for year in range(1, forecast_years + 1):
        # Calculate residual income
        residual_income = (roe - cost_of_equity) * current_bv

        # Discount to present value
        pv_ri = residual_income / ((1 + cost_of_equity) ** year)
        pv_residual_income += pv_ri

        # Grow book value
        current_bv = current_bv * (1 + roe)

    # Terminal value of residual income
    terminal_ri = (roe - cost_of_equity) * current_bv
    terminal_value = terminal_ri / (cost_of_equity - growth_rate) if (cost_of_equity - growth_rate) > 0 else 0
    pv_terminal = terminal_value / ((1 + cost_of_equity) ** forecast_years)

    equity_value = book_value_equity + pv_residual_income + pv_terminal
    intrinsic_value_per_share = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    return {
        'method': 'Residual Income',
        'book_value_equity': book_value_equity,
        'roe': roe,
        'cost_of_equity': cost_of_equity,
        'pv_residual_income': pv_residual_income,
        'pv_terminal': pv_terminal,
        'equity_value': equity_value,
        'intrinsic_value_per_share': intrinsic_value_per_share,
        'shares_outstanding': shares_outstanding
    }


def calculate_peer_multiples(peers):
    """
    Calculate median multiples from peer companies
    Returns: P/E, EV/EBITDA, EV/EBIT, P/B, EV/Sales, PEG
    """
    multiples_data = []

    for peer in peers:
        try:
            stock = yf.Ticker(peer)
            info = stock.info

            pe = info.get('trailingPE')
            pb = info.get('priceToBook')
            ps = info.get('priceToSalesTrailing12Months')
            peg = info.get('pegRatio')

            # Calculate EV multiples
            market_cap = info.get('marketCap', 0)
            total_debt = info.get('totalDebt', 0)
            cash = info.get('totalCash', 0)
            ev = market_cap + total_debt - cash

            ebitda = info.get('ebitda')
            ebit = info.get('ebit')
            revenue = info.get('totalRevenue')

            ev_ebitda = ev / ebitda if ebitda and ebitda > 0 else None
            ev_ebit = ev / ebit if ebit and ebit > 0 else None
            ev_sales = ev / revenue if revenue and revenue > 0 else None

            # Apply outlier filters
            if pe and VALUATION_CONSTRAINTS['min_pe_multiple'] <= pe <= VALUATION_CONSTRAINTS['max_pe_multiple']:
                multiples_data.append({
                    'ticker': peer,
                    'pe': pe,
                    'pb': pb,
                    'ps': ps,
                    'peg': peg,
                    'ev_ebitda': ev_ebitda,
                    'ev_ebit': ev_ebit,
                    'ev_sales': ev_sales
                })
        except:
            continue

    if not multiples_data:
        return None

    # Calculate median multiples
    df = pd.DataFrame(multiples_data)

    median_multiples = {
        'pe': df['pe'].median(),
        'pb': df['pb'].median(),
        'ps': df['ps'].median(),
        'peg': df['peg'].median(),
        'ev_ebitda': df['ev_ebitda'].median(),
        'ev_ebit': df['ev_ebit'].median(),
        'ev_sales': df['ev_sales'].median(),
        'num_peers': len(multiples_data),
        'peer_data': multiples_data
    }

    return median_multiples


def calculate_sotp_valuation(segments, discount_rate, shares_outstanding):
    """
    Sum-of-the-Parts valuation for multi-segment companies
    segments = [{'name': 'Segment A', 'revenue': X, 'ebitda_margin': Y, 'multiple': Z}, ...]
    """
    total_value = 0
    segment_values = []

    for segment in segments:
        name = segment.get('name', 'Unnamed')
        revenue = segment.get('revenue', 0)
        ebitda_margin = segment.get('ebitda_margin', 0)
        ev_revenue_multiple = segment.get('ev_revenue_multiple', 0)

        # Calculate segment EBITDA
        ebitda = revenue * ebitda_margin

        # Value segment using EV/Revenue multiple
        segment_ev = revenue * ev_revenue_multiple

        segment_values.append({
            'name': name,
            'revenue': revenue,
            'ebitda': ebitda,
            'ev': segment_ev
        })

        total_value += segment_ev

    # Convert to equity value (simplified - assumes segments share same debt structure)
    intrinsic_value_per_share = total_value / shares_outstanding if shares_outstanding > 0 else 0

    return {
        'method': 'Sum-of-the-Parts',
        'segment_values': segment_values,
        'total_enterprise_value': total_value,
        'intrinsic_value_per_share': intrinsic_value_per_share,
        'shares_outstanding': shares_outstanding
    }


def calculate_consensus_valuation(ticker, company_data, financials):
    """
    Calculate consensus valuation from multiple methods with intelligent weighting
    Includes DCF (FCFF & FCFE) using smart assumptions

    Returns:
    --------
    dict with:
        - consensus_value: weighted average valuation
        - confidence_score: 0-100 based on method agreement
        - contributing_methods: dict of methods and values used
        - excluded_methods: dict of methods excluded and why
    """

    # Define method weights (sum to 1.0) - DCF gets highest weight as most comprehensive
    METHOD_WEIGHTS = {
        'FCFF DCF': 0.25,        # Most comprehensive - firm valuation
        'FCFE DCF': 0.20,        # Equity valuation
        'P/E Multiple': 0.15,    # Reduced from 0.25
        'EV/EBITDA': 0.15,       # Reduced from 0.25
        'PEG Ratio': 0.10,       # Reduced from 0.20
        'P/B Multiple': 0.10,    # Reduced from 0.15
        'P/S Multiple': 0.05     # Reduced from 0.15
    }

    valuations = {}
    excluded_methods = {}

    current_price = company_data.get('current_price', 0)
    shares_outstanding = company_data.get('shares_outstanding', 0)

    # Get smart assumptions for DCF methods
    smart_params = calculate_smart_assumptions(company_data, financials)

    # =================================================================
    # DCF METHODS - FCFF and FCFE with Smart Assumptions
    # =================================================================

    # 0A. FCFF DCF Valuation
    try:
        revenue = financials.get('revenue', 0)
        ebit = financials.get('ebit', 0)
        total_debt = financials.get('total_debt', 0)
        cash = financials.get('cash', 0)
        total_equity = financials.get('total_equity', 0)
        beta = company_data.get('beta', 1.0)

        if revenue > 0 and ebit > 0 and shares_outstanding > 0:
            # Calculate discount rate (WACC)
            risk_free_rate = 0.04  # 4% risk-free rate
            market_risk_premium = 0.06  # 6% market risk premium
            cost_of_equity = calculate_cost_of_equity(risk_free_rate, beta, market_risk_premium)
            cost_of_debt = 0.05  # Assume 5% cost of debt

            net_debt = total_debt - cash
            wacc = calculate_wacc(cost_of_equity, cost_of_debt, smart_params['tax_rate'],
                                 total_debt, total_equity)

            # Project FCFF
            projections = project_fcff_enhanced(
                base_revenue=revenue,
                base_ebit=ebit,
                revenue_growth=smart_params['revenue_growth'],
                ebit_margin=smart_params['ebit_margin'],
                tax_rate=smart_params['tax_rate'],
                depreciation_pct=smart_params['depreciation_pct'],
                capex_pct=smart_params['capex_pct'],
                change_wc=smart_params['wc_change'],
                forecast_years=smart_params['forecast_years']
            )

            if projections and len(projections) > 0:
                final_fcf = projections[-1]['fcff']

                # Calculate terminal value
                terminal_value = calculate_terminal_value(
                    final_fcf, wacc, smart_params['terminal_growth']
                )

                # Calculate DCF value
                dcf_result = calculate_dcf_value(
                    projections=projections,
                    discount_rate=wacc,
                    terminal_value=terminal_value,
                    shares_outstanding=shares_outstanding,
                    net_debt=net_debt,
                    method='FCFF'
                )

                intrinsic_value = dcf_result['intrinsic_value_per_share']

                if intrinsic_value > 0 and intrinsic_value < current_price * 10:  # Sanity check
                    valuations['FCFF DCF'] = intrinsic_value
                else:
                    excluded_methods['FCFF DCF'] = f"Unrealistic DCF value: ${intrinsic_value:.2f}"
            else:
                excluded_methods['FCFF DCF'] = "Failed to generate projections"
        else:
            excluded_methods['FCFF DCF'] = "Missing revenue, EBIT, or shares data"
    except Exception as e:
        excluded_methods['FCFF DCF'] = f"Calculation error: {str(e)}"

    # 0B. FCFE DCF Valuation
    try:
        revenue = financials.get('revenue', 0)
        net_income = financials.get('net_income', 0)
        beta = company_data.get('beta', 1.0)

        if revenue > 0 and net_income > 0 and shares_outstanding > 0:
            # Calculate discount rate (cost of equity)
            risk_free_rate = 0.04
            market_risk_premium = 0.06
            cost_of_equity = calculate_cost_of_equity(risk_free_rate, beta, market_risk_premium)

            # Project FCFE
            projections = project_fcfe_enhanced(
                base_revenue=revenue,
                base_net_income=net_income,
                revenue_growth=smart_params['revenue_growth'],
                tax_rate=smart_params['tax_rate'],
                depreciation_pct=smart_params['depreciation_pct'],
                capex_pct=smart_params['capex_pct'],
                change_wc=smart_params['wc_change'],
                net_borrowing=0,  # Assume neutral
                forecast_years=smart_params['forecast_years']
            )

            if projections and len(projections) > 0:
                final_fcf = projections[-1]['fcfe']

                # Calculate terminal value
                terminal_value = calculate_terminal_value(
                    final_fcf, cost_of_equity, smart_params['terminal_growth']
                )

                # Calculate DCF value
                dcf_result = calculate_dcf_value(
                    projections=projections,
                    discount_rate=cost_of_equity,
                    terminal_value=terminal_value,
                    shares_outstanding=shares_outstanding,
                    net_debt=0,  # Already in equity value
                    method='FCFE'
                )

                intrinsic_value = dcf_result['intrinsic_value_per_share']

                if intrinsic_value > 0 and intrinsic_value < current_price * 10:  # Sanity check
                    valuations['FCFE DCF'] = intrinsic_value
                else:
                    excluded_methods['FCFE DCF'] = f"Unrealistic DCF value: ${intrinsic_value:.2f}"
            else:
                excluded_methods['FCFE DCF'] = "Failed to generate projections"
        else:
            excluded_methods['FCFE DCF'] = "Missing revenue, net income, or shares data"
    except Exception as e:
        excluded_methods['FCFE DCF'] = f"Calculation error: {str(e)}"

    # =================================================================
    # MULTIPLES-BASED VALUATION METHODS
    # =================================================================

    # 1. P/E Multiple Valuation
    try:
        # Get EPS
        net_income = financials.get('net_income', 0)
        if shares_outstanding > 0 and net_income > 0:
            eps = net_income / shares_outstanding
            industry_pe = get_industry_average_pe(ticker)

            if eps > 0 and industry_pe > 0:
                pe_value = eps * industry_pe

                # Sanity check
                if current_price > 0:
                    implied_pe = pe_value / eps
                    if 0 < implied_pe < 100:  # Reasonable P/E range
                        valuations['P/E Multiple'] = pe_value
                    else:
                        excluded_methods['P/E Multiple'] = f"Unrealistic P/E ratio: {implied_pe:.1f}"
                else:
                    valuations['P/E Multiple'] = pe_value
            else:
                excluded_methods['P/E Multiple'] = "Negative or missing EPS data"
        else:
            excluded_methods['P/E Multiple'] = "Negative earnings or missing shares data"
    except Exception as e:
        excluded_methods['P/E Multiple'] = f"Calculation error: {str(e)}"

    # 2. P/B Multiple Valuation
    try:
        total_equity = financials.get('total_equity', 0)
        if shares_outstanding > 0 and total_equity > 0:
            book_value_per_share = total_equity / shares_outstanding
            industry_pb = get_industry_average_pb(ticker)

            if book_value_per_share > 0 and industry_pb > 0:
                pb_value = book_value_per_share * industry_pb

                # Sanity check
                if pb_value > 0 and pb_value < book_value_per_share * 15:
                    valuations['P/B Multiple'] = pb_value
                else:
                    excluded_methods['P/B Multiple'] = "Unrealistic P/B multiple"
            else:
                excluded_methods['P/B Multiple'] = "Negative or missing book value"
        else:
            excluded_methods['P/B Multiple'] = "Missing equity or shares data"
    except Exception as e:
        excluded_methods['P/B Multiple'] = f"Calculation error: {str(e)}"

    # 3. EV/EBITDA Valuation
    try:
        ebit = financials.get('ebit', 0)
        depreciation = financials.get('depreciation', 0)
        ebitda = ebit + depreciation

        total_debt = financials.get('total_debt', 0)
        cash = financials.get('cash', 0)
        net_debt = total_debt - cash

        industry_ev_ebitda = get_industry_average_ev_ebitda(ticker)

        if ebitda > 0 and industry_ev_ebitda > 0 and shares_outstanding > 0:
            enterprise_value = ebitda * industry_ev_ebitda
            equity_value = enterprise_value - net_debt
            ev_ebitda_value = equity_value / shares_outstanding

            if ev_ebitda_value > 0:
                valuations['EV/EBITDA'] = ev_ebitda_value
            else:
                excluded_methods['EV/EBITDA'] = "Negative equity value (high debt)"
        else:
            excluded_methods['EV/EBITDA'] = "Missing EBITDA or shares data"
    except Exception as e:
        excluded_methods['EV/EBITDA'] = f"Calculation error: {str(e)}"

    # 4. PEG Ratio Valuation (with comprehensive fallbacks)
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        peg_value = None
        growth_rate = None
        eps_value = None

        # Get available data points
        peg_ratio = info.get('pegRatio')
        forward_eps = info.get('forwardEps')
        trailing_eps = info.get('trailingEps')
        earnings_growth = info.get('earningsGrowth')  # Forward earnings growth
        earnings_quarterly_growth = info.get('earningsQuarterlyGrowth')
        revenue_growth = info.get('revenueGrowth')
        current_pe = info.get('trailingPE')
        forward_pe = info.get('forwardPE')

        # FALLBACK 1: Use forward EPS and earnings growth (primary method)
        if forward_eps and forward_eps > 0 and earnings_growth and earnings_growth > 0:
            growth_rate = earnings_growth
            eps_value = forward_eps
        # FALLBACK 2: Use trailing EPS and earnings growth
        elif trailing_eps and trailing_eps > 0 and earnings_growth and earnings_growth > 0:
            growth_rate = earnings_growth
            eps_value = trailing_eps
        # FALLBACK 3: Use forward EPS and quarterly growth as proxy
        elif forward_eps and forward_eps > 0 and earnings_quarterly_growth and earnings_quarterly_growth > 0:
            growth_rate = earnings_quarterly_growth
            eps_value = forward_eps
        # FALLBACK 4: Use trailing EPS and revenue growth as proxy (conservative)
        elif trailing_eps and trailing_eps > 0 and revenue_growth and revenue_growth > 0:
            # Use 70% of revenue growth as earnings growth proxy (conservative)
            growth_rate = revenue_growth * 0.7
            eps_value = trailing_eps
        # FALLBACK 5: Back-calculate from existing PEG ratio and P/E
        elif peg_ratio and peg_ratio > 0 and (forward_pe or current_pe):
            pe_value = forward_pe if forward_pe and forward_pe > 0 else current_pe
            if pe_value and pe_value > 0:
                # PEG = P/E / Growth, so Growth = P/E / PEG
                growth_rate = pe_value / peg_ratio / 100  # Convert to decimal
                eps_value = forward_eps if forward_eps and forward_eps > 0 else trailing_eps

        # Calculate PEG-based valuation if we have both growth rate and EPS
        if growth_rate and growth_rate > 0 and eps_value and eps_value > 0:
            # Fair PEG ratio is typically around 1.0
            fair_peg = 1.0
            fair_pe = (growth_rate * 100) * fair_peg  # Convert growth to percentage
            peg_value = eps_value * fair_pe

            # Sanity checks
            if not (0 < fair_pe < 50):  # Reasonable P/E range
                excluded_methods['PEG Ratio'] = f"Unrealistic implied P/E: {fair_pe:.1f}"
            elif not (0 < peg_value < current_price * 5):  # Not more than 5x current price
                excluded_methods['PEG Ratio'] = f"Unrealistic PEG value: ${peg_value:.2f}"
            else:
                valuations['PEG Ratio'] = peg_value
        else:
            excluded_methods['PEG Ratio'] = "Missing EPS or growth data (all fallbacks exhausted)"
    except Exception as e:
        excluded_methods['PEG Ratio'] = f"Calculation error: {str(e)}"

    # 5. P/S (Price-to-Sales) Multiple
    try:
        revenue = financials.get('revenue', 0)
        if shares_outstanding > 0 and revenue > 0:
            sales_per_share = revenue / shares_outstanding

            # Get sector-appropriate P/S ratio
            stock = yf.Ticker(ticker)
            sector = stock.info.get('sector', '')

            sector_ps_map = {
                'Technology': 6.0,
                'Healthcare': 4.0,
                'Financial': 2.5,
                'Consumer Cyclical': 1.5,
                'Consumer Defensive': 1.8,
                'Energy': 1.2,
                'Industrials': 1.5,
                'Utilities': 2.0,
                'Real Estate': 5.0
            }

            ps_multiple = 2.0  # Default
            for key, ps in sector_ps_map.items():
                if key.lower() in sector.lower():
                    ps_multiple = ps
                    break

            ps_value = sales_per_share * ps_multiple

            if ps_value > 0:
                valuations['P/S Multiple'] = ps_value
            else:
                excluded_methods['P/S Multiple'] = "Negative valuation"
        else:
            excluded_methods['P/S Multiple'] = "Missing revenue or shares data"
    except Exception as e:
        excluded_methods['P/S Multiple'] = f"Calculation error: {str(e)}"

    # Filter outliers using IQR method if we have at least 3 methods
    if len(valuations) >= 3:
        values = list(valuations.values())
        q1 = np.percentile(values, 25)
        q3 = np.percentile(values, 75)
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr

        # Remove outliers
        for method, value in list(valuations.items()):
            if value < lower_bound or value > upper_bound:
                excluded_methods[method] = f"Statistical outlier (value: ${value:.2f}, bounds: ${lower_bound:.2f}-${upper_bound:.2f})"
                del valuations[method]

    # Calculate weighted consensus
    if valuations:
        # Normalize weights for available methods
        total_weight = sum(METHOD_WEIGHTS.get(m, 0.1) for m in valuations.keys())

        if total_weight > 0:
            consensus_value = sum(
                valuations[method] * (METHOD_WEIGHTS.get(method, 0.1) / total_weight)
                for method in valuations.keys()
            )

            # Calculate confidence score (0-100)
            # Based on: 1) number of methods, 2) convergence of values
            method_count_score = (len(valuations) / len(METHOD_WEIGHTS)) * 50

            # Convergence score: how tightly clustered are the valuations?
            if len(valuations) > 1:
                cv = np.std(list(valuations.values())) / np.mean(list(valuations.values()))
                convergence_score = max(0, (1 - cv) * 50)
            else:
                convergence_score = 25

            confidence_score = min(100, method_count_score + convergence_score)

            return {
                'consensus_value': consensus_value,
                'confidence_score': confidence_score,
                'contributing_methods': valuations,
                'excluded_methods': excluded_methods,
                'method_count': len(valuations)
            }

    # If no valid valuations
    return {
        'consensus_value': None,
        'confidence_score': 0,
        'contributing_methods': {},
        'excluded_methods': excluded_methods,
        'method_count': 0
    }


@st.cache_data(ttl=600)
def calculate_portfolio_returns(df, start_date, end_date, equity=None):
    """
    Calculate portfolio returns correctly accounting for leverage

    CRITICAL FIX: Returns calculated on EQUITY basis, not gross exposure.
    With leverage, pct_change() on gross exposure understates returns.

    Args:
        df: Portfolio dataframe with positions
        start_date: Start date for historical data
        end_date: End date for historical data
        equity: User's equity capital (default: from session state)

    Returns:
        Returns series calculated on equity basis (leverage amplified)
    """
    try:
        valid_positions = []
        for _, row in df.iterrows():
            if not is_option_ticker(row['Ticker']):
                valid_positions.append(row)

        if not valid_positions:
            return None

        valid_df = pd.DataFrame(valid_positions)
        all_data = {}

        for _, row in valid_df.iterrows():
            ticker = row['Ticker']
            data = fetch_historical_data(ticker, start_date, end_date)
            if data is not None and len(data) > 0:
                all_data[ticker] = data

        if not all_data:
            return None

        common_dates = None
        for ticker, data in all_data.items():
            dates = set(data.index)
            common_dates = dates if common_dates is None else common_dates.intersection(dates)

        common_dates = sorted(list(common_dates))
        if len(common_dates) < 2:
            return None

        # Calculate daily portfolio gross values
        portfolio_values = []
        for date in common_dates:
            daily_value = 0
            for _, row in valid_df.iterrows():
                ticker = row['Ticker']
                if ticker in all_data:
                    try:
                        price = all_data[ticker].loc[date, 'Close']
                        daily_value += price * row['Shares']
                    except KeyError:
                        continue
            portfolio_values.append(daily_value)

        portfolio_series = pd.Series(portfolio_values, index=common_dates)

        # CRITICAL FIX: Calculate returns on EQUITY basis, not gross exposure
        # Get equity from performance history or session state if not provided
        if equity is None:
            # Try to get from performance history first
            metrics = get_current_portfolio_metrics()
            if metrics and metrics.get('equity', 0) > 0:
                equity = metrics['equity']
            else:
                # Fallback to session state, then initial portfolio value
                equity = st.session_state.get('equity_capital', portfolio_values[0])

        # Calculate dollar changes in portfolio value
        portfolio_changes = portfolio_series.diff()

        # Returns = dollar change / equity (not / previous gross value)
        # This correctly amplifies returns with leverage
        returns = portfolio_changes / equity

        # Drop first NaN value
        returns = returns.dropna()

        return returns
    except:
        return None


def calculate_skill_score(effect_value):
    """
    Convert attribution effect to skill score (0-10 scale)

    Positive effects = higher scores
    Scale: -5% to +5% maps to 0-10
    """
    # Normalize to 0-10 scale
    if effect_value >= 5:
        return 10.0
    elif effect_value <= -5:
        return 0.0
    else:
        return 5.0 + (effect_value / 5.0) * 5.0


def calculate_brinson_attribution_gics(portfolio_df, period='1y'):
    """
    Calculate Brinson attribution using correct GICS sector classification.
    This version matches S&P 500 / SPY benchmark classification for accurate results.

    Parameters:
    -----------
    portfolio_df : pd.DataFrame
        Portfolio holdings with columns: Ticker, Weight % (or Total Value), Total Gain/Loss %
    period : str
        Time period for returns ('1y', '6mo', '3mo', '1mo', 'ytd')

    Returns:
    --------
    dict with:
        - attribution_df: DataFrame with sector-level attribution
        - stock_attribution_df: DataFrame with stock-level attribution
        - total_allocation_effect, total_selection_effect, total_interaction_effect
        - total_attribution
        - allocation_skill_score, selection_skill_score
        - validation: dict with reconciliation info
    """
    df = portfolio_df.copy()

    # Step 1: Apply GICS sector classification
    df['GICS_Sector'] = df['Ticker'].apply(get_gics_sector)

    # Step 2: Calculate portfolio weights if not provided
    if 'Weight %' not in df.columns:
        if 'Total Value' in df.columns:
            total_value = df['Total Value'].sum()
            df['Weight %'] = (df['Total Value'] / total_value) * 100
        else:
            # Equal weight
            df['Weight %'] = 100 / len(df)

    # Step 3: Get benchmark weights and returns
    benchmark_weights = get_spy_sector_weights()
    benchmark_returns = get_benchmark_sector_returns(period=period)

    # Step 4: Get benchmark total return (SPY)
    try:
        spy_data = yf.Ticker('SPY').history(period=period)
        benchmark_total_return = (spy_data['Close'].iloc[-1] / spy_data['Close'].iloc[0] - 1) * 100
    except:
        benchmark_total_return = sum(benchmark_weights[s] / 100 * benchmark_returns.get(s, 0)
                                     for s in benchmark_weights.keys())

    # Step 5: Aggregate portfolio by GICS sector
    # Use value-weighted returns within each sector
    portfolio_sectors = df.groupby('GICS_Sector').agg({
        'Weight %': 'sum',
        'Total Gain/Loss %': lambda x: np.average(x, weights=df.loc[x.index, 'Weight %'])
    }).reset_index()

    portfolio_sectors.columns = ['Sector', 'Portfolio Weight', 'Portfolio Return']
    portfolio_sectors['Portfolio Weight'] = portfolio_sectors['Portfolio Weight'] / 100

    # Step 6: Calculate attribution for each sector
    results = []

    for _, row in portfolio_sectors.iterrows():
        sector = row['Sector']

        # Portfolio weight and return
        wp = row['Portfolio Weight']
        rp = row['Portfolio Return'] / 100

        # Benchmark weight and return
        wb = benchmark_weights.get(sector, 0) / 100
        rb = benchmark_returns.get(sector, 0) / 100

        # Benchmark total return
        rb_total = benchmark_total_return / 100

        # Brinson-Fachler Attribution:
        # Allocation Effect = (wp - wb) × (rb - rb_total)
        # Selection Effect = wp × (rp - rb)  # Using portfolio weight (Brinson-Fachler)
        # Interaction Effect = (wp - wb) × (rp - rb)

        allocation_effect = (wp - wb) * (rb - rb_total) * 100
        selection_effect = wp * (rp - rb) * 100
        interaction_effect = (wp - wb) * (rp - rb) * 100

        results.append({
            'Sector': sector,
            'Portfolio Weight': wp * 100,
            'Benchmark Weight': wb * 100,
            'Weight Diff': (wp - wb) * 100,
            'Portfolio Return': rp * 100,
            'Benchmark Return': rb * 100,
            'Return Diff': (rp - rb) * 100,
            'Allocation Effect': allocation_effect,
            'Selection Effect': selection_effect,
            'Interaction Effect': interaction_effect,
            'Total Effect': allocation_effect + selection_effect + interaction_effect
        })

    # Include sectors where portfolio has 0% but benchmark has weight
    portfolio_sector_list = portfolio_sectors['Sector'].tolist()
    for sector, wb in benchmark_weights.items():
        if sector not in portfolio_sector_list and wb > 0:
            wb_pct = wb / 100
            rb = benchmark_returns.get(sector, 0) / 100
            rb_total = benchmark_total_return / 100

            # Portfolio has 0% in this sector
            allocation_effect = (0 - wb_pct) * (rb - rb_total) * 100
            selection_effect = 0  # No selection effect when no holdings
            interaction_effect = 0

            results.append({
                'Sector': sector,
                'Portfolio Weight': 0,
                'Benchmark Weight': wb,
                'Weight Diff': -wb,
                'Portfolio Return': 0,
                'Benchmark Return': rb * 100,
                'Return Diff': -rb * 100,
                'Allocation Effect': allocation_effect,
                'Selection Effect': selection_effect,
                'Interaction Effect': interaction_effect,
                'Total Effect': allocation_effect
            })

    attribution_df = pd.DataFrame(results)
    attribution_df = attribution_df.sort_values('Total Effect', ascending=False)

    # Step 7: Calculate totals
    total_allocation = attribution_df['Allocation Effect'].sum()
    total_selection = attribution_df['Selection Effect'].sum()
    total_interaction = attribution_df['Interaction Effect'].sum()
    total_attribution = total_allocation + total_selection + total_interaction

    # Step 8: Calculate stock-level attribution
    stock_results = []
    portfolio_total_return = (df['Weight %'] * df['Total Gain/Loss %']).sum() / 100

    # SPY weights for major holdings (approximate, as of recent data)
    SPY_WEIGHTS = {
        'AAPL': 7.0, 'MSFT': 6.5, 'NVDA': 5.5, 'GOOGL': 3.5, 'GOOG': 3.5,
        'AMZN': 3.5, 'META': 2.5, 'TSLA': 2.0, 'BRK.B': 1.7, 'LLY': 1.5,
        'V': 1.2, 'JPM': 1.15, 'UNH': 1.1, 'XOM': 1.05, 'MA': 1.0,
        'JNJ': 0.95, 'PG': 0.9, 'AVGO': 0.9, 'HD': 0.85, 'CVX': 0.8,
        'MRK': 0.75, 'ABBV': 0.75, 'COST': 0.7, 'PEP': 0.7, 'KO': 0.65,
        'BAC': 0.65, 'NFLX': 0.6, 'CRM': 0.6, 'AMD': 0.55, 'WMT': 0.55,
        'ADBE': 0.5, 'TMO': 0.5, 'DIS': 0.5, 'ACN': 0.45, 'CSCO': 0.45,
        'ABT': 0.45, 'VZ': 0.4, 'T': 0.4, 'ORCL': 0.4, 'INTC': 0.4,
        'WFC': 0.4, 'C': 0.35, 'QCOM': 0.35, 'UPS': 0.35, 'PM': 0.35,
        'MS': 0.3, 'GS': 0.3, 'AXP': 0.3, 'BA': 0.3, 'CAT': 0.3,
        'IBM': 0.3, 'NOW': 0.3, 'BKR': 0.25, 'NVT': 0.2,
    }

    for _, row in df.iterrows():
        ticker = row['Ticker']
        weight = row['Weight %'] / 100
        stock_return = row['Total Gain/Loss %'] / 100
        sector = row['GICS_Sector']

        # Get SPY index weight (0 if not in index)
        index_weight = SPY_WEIGHTS.get(ticker, 0.0)

        # Benchmark return for this sector
        sector_benchmark_return = benchmark_returns.get(sector, 0) / 100

        # Contribution to portfolio return
        contribution = weight * stock_return * 100

        # Active contribution (vs if held at benchmark sector return)
        active_contribution = weight * (stock_return - sector_benchmark_return) * 100

        stock_results.append({
            'Ticker': ticker,
            'GICS_Sector': sector,
            'Weight %': weight * 100,
            'Index Weight %': index_weight,  # SPY weight
            'Return %': stock_return * 100,
            'Sector Benchmark Return %': sector_benchmark_return * 100,
            'Return vs Sector': (stock_return - sector_benchmark_return) * 100,
            'Contribution %': contribution,
            'Active Contribution %': active_contribution
        })

    stock_attribution_df = pd.DataFrame(stock_results)
    stock_attribution_df = stock_attribution_df.sort_values('Active Contribution %', ascending=False)

    # Step 9: Validation - LINK TO PERFORMANCE SUITE
    # PRIORITY: Use Performance Suite's annualized return if available (session state)
    # This ensures Attribution shows the EXACT SAME value as Performance Suite

    # CHECK SESSION STATE FIRST - This is the linked value from Performance Suite
    performance_suite_return = st.session_state.get('portfolio_annualized_return')

    if performance_suite_return is not None:
        # USE PERFORMANCE SUITE VALUE - This is the correct linked value
        actual_portfolio_return = performance_suite_return
        actual_benchmark_return_val = benchmark_total_return  # Use benchmark from holdings
        actual_alpha = actual_portfolio_return - actual_benchmark_return_val
        attribution_sum = total_allocation + total_selection + total_interaction
        reconciliation_diff = abs(actual_alpha - attribution_sum)

        validation = {
            'portfolio_return': actual_portfolio_return,  # FROM PERFORMANCE SUITE
            'benchmark_return': actual_benchmark_return_val,
            'actual_alpha': actual_alpha,
            'attribution_sum': attribution_sum,
            'reconciliation_diff': reconciliation_diff,
            'is_reconciled': reconciliation_diff < 5.0,
            'source': 'performance_suite',  # Indicates linked to Performance Suite
        }
    else:
        # Fallback to point-in-time holdings return (if Performance Suite not visited yet)
        actual_alpha = portfolio_total_return - benchmark_total_return
        attribution_sum = total_allocation + total_selection + total_interaction
        reconciliation_diff = abs(actual_alpha - attribution_sum)

        validation = {
            'portfolio_return': portfolio_total_return,
            'benchmark_return': benchmark_total_return,
            'actual_alpha': actual_alpha,
            'attribution_sum': attribution_sum,
            'reconciliation_diff': reconciliation_diff,
            'is_reconciled': reconciliation_diff < 1.0,
            'source': 'point_in_time',
            'warning': 'Visit Performance Suite first to see accurate returns.'
        }

    return {
        'attribution_df': attribution_df,
        'stock_attribution_df': stock_attribution_df,
        'total_allocation_effect': total_allocation,
        'total_selection_effect': total_selection,
        'total_interaction_effect': total_interaction,
        'total_attribution': total_attribution,
        'allocation_skill_score': calculate_skill_score(total_allocation),
        'selection_skill_score': calculate_skill_score(total_selection),
        'validation': validation,
        'benchmark_weights': benchmark_weights,
        'benchmark_returns': benchmark_returns
    }


def calculate_brinson_attribution(portfolio_df, benchmark_weights, benchmark_returns, period='YTD'):
    """
    Calculate Brinson attribution: Allocation, Selection, and Interaction effects

    Parameters:
    -----------
    portfolio_df : pd.DataFrame
        Portfolio holdings with columns: Ticker, Sector, Weight %, Total Gain/Loss %
    benchmark_weights : dict
        Benchmark sector weights {sector: weight}
    benchmark_returns : dict
        Benchmark sector returns {sector: return}
    period : str
        Time period for analysis (YTD, 1Y, etc.)

    Returns:
    --------
    dict with attribution_df, total_allocation_effect, total_selection_effect,
    total_interaction_effect, total_attribution, allocation_skill_score, selection_skill_score
    """

    # Group portfolio by sector
    portfolio_sectors = portfolio_df.groupby('Sector').agg({
        'Weight %': 'sum',
        'Total Gain/Loss %': 'mean'  # Average return in sector
    }).reset_index()

    portfolio_sectors.columns = ['Sector', 'Portfolio Weight', 'Portfolio Return']
    portfolio_sectors['Portfolio Weight'] = portfolio_sectors['Portfolio Weight'] / 100

    results = []

    # Calculate benchmark total return (weighted average)
    rb_total = sum([benchmark_weights.get(s, 0) / 100 * benchmark_returns.get(s, 0) / 100
                   for s in benchmark_weights.keys()])

    for sector in portfolio_sectors['Sector']:
        # Get weights
        wp = portfolio_sectors[portfolio_sectors['Sector'] == sector]['Portfolio Weight'].iloc[0]
        wb = benchmark_weights.get(sector, 0) / 100

        # Get returns
        rp = portfolio_sectors[portfolio_sectors['Sector'] == sector]['Portfolio Return'].iloc[0] / 100
        rb = benchmark_returns.get(sector, 0) / 100

        # Brinson Attribution Formula:
        # Allocation Effect = (wp - wb) × (rb - rb_total)
        # Selection Effect = wb × (rp - rb)
        # Interaction Effect = (wp - wb) × (rp - rb)

        allocation_effect = (wp - wb) * (rb - rb_total) * 100
        selection_effect = wb * (rp - rb) * 100
        interaction_effect = (wp - wb) * (rp - rb) * 100

        results.append({
            'Sector': sector,
            'Portfolio Weight': wp * 100,
            'Benchmark Weight': wb * 100,
            'Weight Diff': (wp - wb) * 100,
            'Portfolio Return': rp * 100,
            'Benchmark Return': rb * 100,
            'Return Diff': (rp - rb) * 100,
            'Allocation Effect': allocation_effect,
            'Selection Effect': selection_effect,
            'Interaction Effect': interaction_effect,
            'Total Effect': allocation_effect + selection_effect + interaction_effect
        })

    attribution_df = pd.DataFrame(results)

    # Calculate totals
    total_allocation = attribution_df['Allocation Effect'].sum()
    total_selection = attribution_df['Selection Effect'].sum()
    total_interaction = attribution_df['Interaction Effect'].sum()
    total_attribution = total_allocation + total_selection + total_interaction

    return {
        'attribution_df': attribution_df,
        'total_allocation_effect': total_allocation,
        'total_selection_effect': total_selection,
        'total_interaction_effect': total_interaction,
        'total_attribution': total_attribution,
        'allocation_skill_score': calculate_skill_score(total_allocation),
        'selection_skill_score': calculate_skill_score(total_selection)
    }


@st.cache_data(ttl=600)
def calculate_benchmark_returns(benchmark_ticker, start_date, end_date):
    try:
        data = fetch_historical_data(benchmark_ticker, start_date, end_date)
        if data is None or data.empty:
            return None
        returns = data['Close'].pct_change().dropna()
        return returns
    except:
        return None


def calculate_quality_score(ticker, info):
    """
    Calculate comprehensive quality score (0-10)
    Based on: Profitability, Growth, Financial Health, Valuation
    """
    score = 5.0  # Start at neutral

    try:
        # Profitability metrics
        roe = info.get('returnOnEquity', 0)
        if roe and roe > 0.15:
            score += 1
        elif roe and roe > 0.10:
            score += 0.5

        # Growth metrics
        revenue_growth = info.get('revenueGrowth', 0)
        if revenue_growth and revenue_growth > 0.15:
            score += 1
        elif revenue_growth and revenue_growth > 0.05:
            score += 0.5

        # Financial health
        debt_to_equity = info.get('debtToEquity', 0)
        if debt_to_equity and debt_to_equity < 50:
            score += 1
        elif debt_to_equity and debt_to_equity < 100:
            score += 0.5

        # Profitability
        profit_margin = info.get('profitMargins', 0)
        if profit_margin and profit_margin > 0.20:
            score += 1
        elif profit_margin and profit_margin > 0.10:
            score += 0.5

        # Current ratio (liquidity)
        current_ratio = info.get('currentRatio', 0)
        if current_ratio and current_ratio > 2:
            score += 0.5
        elif current_ratio and current_ratio > 1:
            score += 0.25

        # Analyst recommendations
        recommendation = info.get('recommendationKey', '')
        if recommendation in ['strong_buy', 'buy']:
            score += 0.5

        # Cap at 10
        score = min(10.0, score)

    except Exception as e:
        score = 5.0

    return round(score, 1)


def calculate_sharpe_ratio(returns, risk_free_rate=RISK_FREE_RATE):
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    total_return = (1 + returns).prod() - 1
    n_years = len(returns) / 252
    annualized_return = (1 + total_return) ** (1/n_years) - 1 if n_years > 0 else 0
    annualized_vol = returns.std() * np.sqrt(252)
    sharpe = (annualized_return - risk_free_rate) / annualized_vol if annualized_vol > 0 else 0
    return sharpe


def calculate_sortino_ratio(returns, risk_free_rate=RISK_FREE_RATE):
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    total_return = (1 + returns).prod() - 1
    n_years = len(returns) / 252
    annualized_return = (1 + total_return) ** (1/n_years) - 1 if n_years > 0 else 0
    downside_returns = returns[returns < 0]
    if len(downside_returns) < 2:
        return None
    downside_std = downside_returns.std() * np.sqrt(252)
    sortino = (annualized_return - risk_free_rate) / downside_std if downside_std > 0 else 0
    return sortino


def calculate_information_ratio(portfolio_returns, benchmark_returns):
    if not is_valid_series(portfolio_returns) or not is_valid_series(benchmark_returns):
        return None
    if len(portfolio_returns) < 2 or len(benchmark_returns) < 2:
        return None
    common_dates = portfolio_returns.index.intersection(benchmark_returns.index)
    portfolio_returns = portfolio_returns.loc[common_dates]
    benchmark_returns = benchmark_returns.loc[common_dates]
    excess_returns = portfolio_returns - benchmark_returns
    if len(excess_returns) < 2:
        return None
    total_excess = (1 + excess_returns).prod() - 1
    n_years = len(excess_returns) / 252
    annualized_excess = (1 + total_excess) ** (1/n_years) - 1 if n_years > 0 else 0
    tracking_error = excess_returns.std() * np.sqrt(252)
    info_ratio = annualized_excess / tracking_error if tracking_error > 0 else 0
    return info_ratio


@st.cache_data(ttl=300)
def calculate_var(returns, confidence=0.95, equity=None):
    """
    Calculate Value at Risk with caching for improved performance

    CRITICAL FIX: Returns VaR as percentage. If equity provided, also returns dollar VaR.
    VaR dollar amount is calculated on EQUITY, not gross exposure.

    Args:
        returns: Return series (should be on equity basis from calculate_portfolio_returns)
        confidence: Confidence level (e.g., 0.95 = 95%)
        equity: Optional equity capital to calculate dollar VaR

    Returns:
        VaR percentage (or None if error)
    """
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    try:
        var = np.percentile(returns, (1 - confidence) * 100)
        # Note: returns are already on equity basis (from fixed calculate_portfolio_returns)
        # so var percentile correctly represents risk to equity
        return var * 100
    except Exception as e:
        return None


@st.cache_data(ttl=300)
def calculate_cvar(returns, confidence=0.95, equity=None):
    """
    Calculate Conditional VaR (Expected Shortfall) with caching

    CRITICAL FIX: Returns CVaR as percentage. If equity provided, also returns dollar CVaR.
    CVaR dollar amount is calculated on EQUITY, not gross exposure.

    Args:
        returns: Return series (should be on equity basis from calculate_portfolio_returns)
        confidence: Confidence level (e.g., 0.95 = 95%)
        equity: Optional equity capital to calculate dollar CVaR

    Returns:
        CVaR percentage (or None if error)
    """
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    try:
        var = np.percentile(returns, (1 - confidence) * 100)
        cvar = returns[returns <= var].mean()
        # Note: returns are already on equity basis (from fixed calculate_portfolio_returns)
        # so cvar correctly represents expected tail loss to equity
        return cvar * 100
    except Exception as e:
        return None


def calculate_historical_stress_test(enhanced_df):
    """
    Calculate portfolio performance during historical stress periods vs S&P 500.

    Returns performance data for visualization of portfolio resilience during major market events.

    Historical Stress Periods:
    - 2008 Financial Crisis: Sep 2008 - Mar 2009
    - 2011 Euro Crisis: Jul 2011 - Oct 2011
    - 2015-16 China Slowdown: Aug 2015 - Feb 2016
    - Dec 2018 Selloff: Oct 2018 - Dec 2018
    - COVID-19 Crash: Feb 2020 - Mar 2020

    Returns:
        dict: Contains period data, cumulative returns, and stress metrics
    """

    # Define historical stress periods
    stress_periods = {
        '2008 Financial Crisis': {'start': '2008-09-01', 'end': '2009-03-31', 'color': '#FF4136'},
        '2011 Euro Crisis': {'start': '2011-07-01', 'end': '2011-10-31', 'color': '#FF851B'},
        '2015-16 China Slowdown': {'start': '2015-08-01', 'end': '2016-02-29', 'color': '#FFDC00'},
        'Dec 2018 Selloff': {'start': '2018-10-01', 'end': '2018-12-31', 'color': '#39CCCC'},
        'COVID-19 Crash': {'start': '2020-02-01', 'end': '2020-03-31', 'color': '#B10DC9'}
    }

    results = {}

    # Get portfolio tickers and weights
    tickers = enhanced_df['Ticker'].tolist()
    weights = (enhanced_df['Weight %'] / 100).tolist()

    for period_name, period_info in stress_periods.items():
        try:
            # Fetch S&P 500 data for this period
            spy_data = fetch_historical_data('^GSPC', period_info['start'], period_info['end'])

            if spy_data is None or spy_data.empty:
                continue

            # Fetch portfolio holdings data for this period
            portfolio_returns = []
            valid_weights = []

            for ticker, weight in zip(tickers, weights):
                ticker_data = fetch_historical_data(ticker, period_info['start'], period_info['end'])
                if ticker_data is not None and not ticker_data.empty and len(ticker_data) > 0:
                    # Calculate cumulative return for this ticker
                    ticker_returns = ticker_data['Close'].pct_change().fillna(0)
                    portfolio_returns.append(ticker_returns)
                    valid_weights.append(weight)

            if not portfolio_returns:
                continue

            # Normalize weights
            valid_weights = np.array(valid_weights)
            valid_weights = valid_weights / valid_weights.sum()

            # Calculate weighted portfolio returns
            returns_df = pd.DataFrame(portfolio_returns).T
            portfolio_daily_returns = (returns_df * valid_weights).sum(axis=1)

            # Calculate cumulative returns
            portfolio_cumulative = (1 + portfolio_daily_returns).cumprod()
            spy_cumulative = (1 + spy_data['Close'].pct_change().fillna(0)).cumprod()

            # Align indices
            common_index = portfolio_cumulative.index.intersection(spy_cumulative.index)
            if len(common_index) == 0:
                continue

            portfolio_cumulative = portfolio_cumulative.loc[common_index]
            spy_cumulative = spy_cumulative.loc[common_index]

            # Normalize to start at 100
            portfolio_cumulative = (portfolio_cumulative / portfolio_cumulative.iloc[0]) * 100
            spy_cumulative = (spy_cumulative / spy_cumulative.iloc[0]) * 100

            # Calculate stress metrics
            total_return_portfolio = ((portfolio_cumulative.iloc[-1] / 100) - 1) * 100
            total_return_spy = ((spy_cumulative.iloc[-1] / 100) - 1) * 100

            max_drawdown_portfolio = ((portfolio_cumulative / portfolio_cumulative.cummax()) - 1).min() * 100
            max_drawdown_spy = ((spy_cumulative / spy_cumulative.cummax()) - 1).min() * 100

            volatility_portfolio = portfolio_daily_returns.std() * np.sqrt(252) * 100
            volatility_spy = spy_data['Close'].pct_change().std() * np.sqrt(252) * 100

            results[period_name] = {
                'dates': common_index,
                'portfolio_cumulative': portfolio_cumulative,
                'spy_cumulative': spy_cumulative,
                'metrics': {
                    'portfolio_return': total_return_portfolio,
                    'spy_return': total_return_spy,
                    'portfolio_drawdown': max_drawdown_portfolio,
                    'spy_drawdown': max_drawdown_spy,
                    'portfolio_volatility': volatility_portfolio,
                    'spy_volatility': volatility_spy,
                    'outperformance': total_return_portfolio - total_return_spy
                },
                'color': period_info['color']
            }

        except Exception as e:
            # Skip periods where data is unavailable
            continue

    return results


def calculate_risk_adjusted_limits(returns_df, max_position_base, risk_budget_per_asset):
    """
    Calculate risk-adjusted position limits for each asset

    Idea: Higher volatility assets should have lower maximum position sizes
    to prevent them from dominating portfolio risk

    Args:
        returns_df: Historical returns dataframe
        max_position_base: Base maximum position size
        risk_budget_per_asset: Maximum risk contribution per asset

    Returns:
        List of (min, max) tuples for each asset
    """
    # Calculate annualized volatilities
    vols = returns_df.std() * np.sqrt(252)
    avg_vol = vols.mean()

    position_limits = []
    for vol in vols:
        # Adjust max position based on relative volatility
        # High vol → lower max position
        vol_adjustment = avg_vol / vol if vol > 0 else 1.0
        adjusted_max = min(max_position_base * vol_adjustment, max_position_base * 1.5)
        adjusted_max = min(adjusted_max, 0.50)  # Hard cap at 50%

        position_limits.append((0, adjusted_max))

    return position_limits


def calculate_var_cvar_portfolio_optimization(enhanced_df, confidence_level=0.95, lookback_days=252, max_position=0.25, min_position=0.02, target_leverage=1.0, risk_profile_config=None):
    """
    Calculate optimal portfolio weights to minimize CVaR (Conditional Value at Risk)

    This function implements portfolio optimization from Quantitative Risk Management
    to find weights that minimize tail risk while maintaining diversification.

    FIXED v11.0: Added leverage constraint support. Leverage = sum of absolute weights.
    PHASE 3: Added gradual rebalancing with turnover and position change limits.

    Args:
        enhanced_df: Enhanced holdings dataframe with current positions
        confidence_level: Confidence level for VaR/CVaR calculation (default 95%)
        lookback_days: Days of historical data to use (default 252 = 1 year)
        max_position: Maximum position size per security (default 25%)
        min_position: Minimum meaningful position size (default 2%)
        target_leverage: Target portfolio leverage (default 1.0 = no leverage)
        risk_profile_config: Optional dict from RiskProfile.get_config() for gradual rebalancing

    Returns:
        tuple: (rebalancing_df, optimization_metrics)
    """
    from scipy.optimize import minimize

    # Get current portfolio composition
    tickers = enhanced_df['Ticker'].tolist()
    current_values = enhanced_df['Total Value'].values
    total_portfolio_value = current_values.sum()

    # CRITICAL FIX: Calculate weights relative to EQUITY, not gross exposure
    # Get equity from performance history or session state
    metrics = get_current_portfolio_metrics()
    if metrics and metrics.get('equity', 0) > 0:
        equity = metrics['equity']
    else:
        equity = st.session_state.get('equity_capital', total_portfolio_value)
    current_weights = current_values / equity  # Can sum > 1.0 with leverage!

    # Fetch historical returns for all tickers
    end_date = datetime.now()
    start_date = end_date - timedelta(days=lookback_days)

    # Build returns matrix
    returns_dict = {}
    for ticker in tickers:
        hist_data = fetch_historical_data(ticker, start_date, end_date)
        if hist_data is not None and len(hist_data) > 1:
            returns = hist_data['Close'].pct_change().dropna()
            returns_dict[ticker] = returns

    # Align all returns to common dates
    returns_df = pd.DataFrame(returns_dict)
    returns_df = returns_df.dropna()

    if len(returns_df) < 30:
        st.warning("Insufficient historical data for optimization (need 30+ days)")
        return None, None

    # CRITICAL FIX: Only keep tickers that have valid data
    valid_tickers = returns_df.columns.tolist()
    returns_matrix = returns_df.values
    n_assets = len(valid_tickers)

    # Update enhanced_df to only include valid tickers
    enhanced_df = enhanced_df[enhanced_df['Ticker'].isin(valid_tickers)].copy()
    tickers = valid_tickers
    current_values = enhanced_df['Total Value'].values
    total_portfolio_value = current_values.sum()

    # CRITICAL FIX: Use equity for current weights (already set above)
    current_weights = current_values / equity  # Can sum > 1.0 with leverage!

    # Define CVaR calculation with production-grade regularization
    def calculate_portfolio_cvar(weights, returns, alpha):
        """
        Calculate CVaR (Expected Shortfall) for given weights

        FIXED v10.3: Removed aggressive penalties causing equal-weight portfolios.
        Now uses gentle regularization scaled appropriately.
        """
        portfolio_returns = returns @ weights
        var_threshold = np.percentile(portfolio_returns, (1-alpha) * 100)
        cvar = portfolio_returns[portfolio_returns <= var_threshold].mean()

        # GENTLE regularization - tiny penalty to avoid extreme concentration
        # CVaR is typically -0.05 to -0.20, so penalty should be ~0.0001 to 0.001
        hhi = np.sum(weights ** 2)
        gentle_regularization = 0.0005 * (hhi - 1/n_assets)

        return -cvar + gentle_regularization

    # Optimization objective
    def objective(weights):
        return calculate_portfolio_cvar(weights, returns_matrix, confidence_level)

    # PHASE 3: Use gradual rebalancing constraints if risk_profile_config provided
    if risk_profile_config is not None:
        # Use realistic constraints with turnover and position change limits
        constraints = build_realistic_constraints(current_weights, risk_profile_config, target_leverage)
        bounds = build_position_bounds(current_weights, risk_profile_config, n_assets)

        # Use current weights as starting point (closer to feasible solution)
        initial_weights = current_weights.copy()
        # Ensure initial weights are within bounds
        for i, (lb, ub) in enumerate(bounds):
            initial_weights[i] = np.clip(initial_weights[i], lb, ub)
        # Re-normalize to target leverage
        if initial_weights.sum() > 0:
            initial_weights = initial_weights * (target_leverage / initial_weights.sum())
    else:
        # Legacy mode: simple constraints without turnover limits
        def leverage_constraint(w, target_lev):
            """Leverage = sum of absolute weights"""
            return np.abs(w).sum() - target_lev

        constraints = [
            {'type': 'eq', 'fun': leverage_constraint, 'args': (target_leverage,)}
        ]

        # Use user-specified bounds
        bounds = tuple((0.0, max_position) for _ in range(n_assets))

        # Initial guess (scaled by leverage)
        initial_weights = np.ones(n_assets) * (target_leverage / n_assets)

    # Run optimization
    result = minimize(
        objective,
        initial_weights,
        method='SLSQP',
        bounds=bounds,
        constraints=constraints,
        options={'maxiter': 1000, 'ftol': 1e-9}
    )

    if not result.success:
        st.warning(f"Optimization converged with warning: {result.message}")

    optimal_weights = result.x

    # PHASE 3: Apply minimum trade threshold to avoid uneconomical trades
    if risk_profile_config is not None:
        min_trade_threshold = risk_profile_config.get('min_trade_threshold', 0.01)
        optimal_weights = apply_trade_threshold(optimal_weights, current_weights, min_trade_threshold)

    # Calculate current and optimal risk metrics
    current_portfolio_returns = returns_matrix @ current_weights
    optimal_portfolio_returns = returns_matrix @ optimal_weights

    current_var = np.percentile(current_portfolio_returns, (1-confidence_level) * 100)
    optimal_var = np.percentile(optimal_portfolio_returns, (1-confidence_level) * 100)

    current_cvar = current_portfolio_returns[current_portfolio_returns <= current_var].mean()
    optimal_cvar = optimal_portfolio_returns[optimal_portfolio_returns <= optimal_var].mean()

    # Calculate Sharpe ratios
    current_sharpe = (current_portfolio_returns.mean() / current_portfolio_returns.std()) * np.sqrt(252)
    optimal_sharpe = (optimal_portfolio_returns.mean() / optimal_portfolio_returns.std()) * np.sqrt(252)

    # Build rebalancing dataframe
    rebalancing_data = []
    for i, ticker in enumerate(tickers):
        current_value = enhanced_df[enhanced_df['Ticker'] == ticker]['Total Value'].values[0]
        current_shares = enhanced_df[enhanced_df['Ticker'] == ticker]['Shares'].values[0]
        current_price = enhanced_df[enhanced_df['Ticker'] == ticker]['Current Price'].values[0]

        optimal_value = optimal_weights[i] * total_portfolio_value
        optimal_shares = optimal_value / current_price
        shares_to_trade = optimal_shares - current_shares
        trade_value = shares_to_trade * current_price

        rebalancing_data.append({
            'Ticker': ticker,
            'Asset Name': enhanced_df[enhanced_df['Ticker'] == ticker]['Asset Name'].values[0],
            'Current Weight %': (current_value / total_portfolio_value) * 100,
            'Optimal Weight %': optimal_weights[i] * 100,
            'Weight Diff %': (optimal_weights[i] * 100) - (current_value / total_portfolio_value * 100),
            'Current Shares': int(current_shares),
            'Target Shares': int(optimal_shares),
            'Shares to Trade': int(shares_to_trade),
            'Current Price': current_price,
            'Trade Value': trade_value,
            'Action': 'BUY' if shares_to_trade > 5 else 'SELL' if shares_to_trade < -5 else 'HOLD',
            'Priority': abs(trade_value)  # Sort by impact
        })

    rebalancing_df = pd.DataFrame(rebalancing_data)
    rebalancing_df = rebalancing_df.sort_values('Priority', ascending=False)

    # Calculate actual turnover
    actual_turnover = np.sum(np.abs(optimal_weights - current_weights)) / 2

    # Calculate optimization metrics
    optimization_metrics = {
        'current_var': current_var * 100,
        'optimal_var': optimal_var * 100,
        'var_reduction_pct': abs((optimal_var - current_var) / abs(current_var)) * 100 if current_var != 0 else 0,
        'current_cvar': current_cvar * 100,
        'optimal_cvar': optimal_cvar * 100,
        'cvar_reduction_pct': abs((optimal_cvar - current_cvar) / abs(current_cvar)) * 100 if current_cvar != 0 else 0,
        'current_sharpe': current_sharpe,
        'optimal_sharpe': optimal_sharpe,
        'sharpe_improvement': optimal_sharpe - current_sharpe,
        'total_trades': len(rebalancing_df[rebalancing_df['Action'] != 'HOLD']),
        'rebalancing_cost': abs(rebalancing_df['Trade Value'].sum()),
        'buy_trades': len(rebalancing_df[rebalancing_df['Action'] == 'BUY']),
        'sell_trades': len(rebalancing_df[rebalancing_df['Action'] == 'SELL']),
        # PHASE 3: Gradual rebalancing metrics
        'actual_turnover_pct': actual_turnover * 100,
        'max_position_change': np.max(np.abs(optimal_weights - current_weights)) * 100,
        'gradual_rebalancing': risk_profile_config is not None,
        'rebalance_style': risk_profile_config.get('rebalance_frequency', 'one-time') if risk_profile_config else 'one-time'
    }

    return rebalancing_df, optimization_metrics


def calculate_max_risk_contrib(weights, returns_df):
    """Calculate maximum risk contribution from any single asset"""
    cov_matrix = returns_df.cov() * 252
    port_vol = np.sqrt(weights @ cov_matrix @ weights)

    if port_vol == 0:
        return 0

    # Marginal contribution to risk
    marginal_contrib = (cov_matrix @ weights) / port_vol

    # Total risk contribution
    risk_contrib = weights * marginal_contrib

    # Return max contribution as fraction of total risk
    return np.max(np.abs(risk_contrib)) / np.sum(np.abs(risk_contrib)) if np.sum(np.abs(risk_contrib)) > 0 else 0


def calculate_performance_metric(weights, returns_df, strategy_type, risk_free_rate=0.02):
    """Calculate the relevant performance metric for the strategy"""
    cov_matrix = returns_df.cov() * 252

    if strategy_type == 'max_sharpe':
        port_return = np.sum(returns_df.mean() * weights) * 252
        port_vol = np.sqrt(weights @ cov_matrix @ weights)
        return (port_return - risk_free_rate) / port_vol if port_vol > 0 else 0

    elif strategy_type == 'min_volatility':
        return -np.sqrt(weights @ cov_matrix @ weights)  # Negative for constraint

    elif strategy_type == 'cvar_minimization':
        portfolio_returns = returns_df.values @ weights
        var_threshold = np.percentile(portfolio_returns, 5)
        cvar = portfolio_returns[portfolio_returns <= var_threshold].mean()
        return -cvar  # Negative because we minimize CVaR

    elif strategy_type == 'max_return':
        mean_returns = returns_df.mean() * 252
        return np.sum(mean_returns * weights)

    elif strategy_type == 'risk_parity':
        # For risk parity, use negative of risk parity error as "performance"
        port_vol = np.sqrt(weights @ cov_matrix @ weights)
        if port_vol < 1e-10:
            return 0
        marginal_contrib = (cov_matrix @ weights) / port_vol
        risk_contrib = weights * marginal_contrib
        target_risk = port_vol / len(weights)
        risk_parity_error = np.sum((risk_contrib - target_risk) ** 2)
        return -risk_parity_error

    return 0


def calculate_portfolio_max_drawdown(weights, returns_df):
    """
    Calculate maximum drawdown for a portfolio with given weights

    Args:
        weights: Portfolio weights
        returns_df: Historical returns dataframe

    Returns:
        Maximum drawdown as a positive decimal (e.g., 0.20 for 20% drawdown)
    """
    try:
        # Calculate portfolio returns
        portfolio_returns = returns_df.values @ weights

        # Calculate cumulative returns
        cumulative = (1 + portfolio_returns).cumprod()

        # Calculate running maximum
        running_max = np.maximum.accumulate(cumulative)

        # Calculate drawdown at each point
        drawdown = (cumulative - running_max) / running_max

        # Return maximum drawdown as positive value
        max_dd = abs(np.min(drawdown))

        return max_dd
    except:
        return 0.0


def calculate_max_risk_contrib_pct(weights, returns_df):
    """Calculate maximum risk contribution from any single asset as percentage"""
    cov_matrix = returns_df.cov() * 252
    port_vol = np.sqrt(weights @ cov_matrix @ weights)

    if port_vol < 1e-10:
        return 0

    marginal_contrib = (cov_matrix @ weights) / port_vol
    risk_contribs = weights * marginal_contrib / port_vol
    return np.max(np.abs(risk_contribs))


@st.cache_data(ttl=300)
def calculate_max_drawdown(returns):
    """Calculate Maximum Drawdown with caching for improved performance"""
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    try:
        cumulative = (1 + returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = (cumulative - running_max) / running_max
        return drawdown.min() * 100
    except Exception as e:
        return None


def calculate_calmar_ratio(returns, risk_free_rate=RISK_FREE_RATE):
    if not is_valid_series(returns) or len(returns) < 2:
        return None
    total_return = (1 + returns).prod() - 1
    n_years = len(returns) / 252
    annualized_return = (1 + total_return) ** (1/n_years) - 1 if n_years > 0 else 0
    max_dd = abs(calculate_max_drawdown(returns))
    if max_dd == 0:
        return 0
    return (annualized_return - risk_free_rate) / (max_dd / 100)


def calculate_portfolio_correlations(df, period='90d'):
    """
    Calculate correlation matrix for portfolio holdings
    period: '30d', '90d', '1y'
    """
    # Parse period
    period_map = {
        '30d': 30,
        '90d': 90,
        '1y': 365
    }
    days = period_map.get(period, 90)

    # Fetch data for all tickers
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days + 30)  # Extra buffer for data

    tickers = df['Ticker'].unique().tolist()

    # Collect returns for all tickers
    returns_dict = {}

    for ticker in tickers:
        try:
            hist_data = fetch_historical_data(ticker, start_date, end_date)
            if hist_data is not None and len(hist_data) > 20:
                ticker_returns = hist_data['Close'].pct_change().dropna()
                if len(ticker_returns) > 0:
                    returns_dict[ticker] = ticker_returns
        except:
            continue

    # Create DataFrame from returns
    if len(returns_dict) < 2:
        return None

    returns_df = pd.DataFrame(returns_dict)

    # Calculate correlation matrix
    correlation_matrix = returns_df.corr()

    return correlation_matrix


@st.cache_data(ttl=3600)
def calculate_factor_exposures(df, start_date, end_date):
    try:
        portfolio_returns = calculate_portfolio_returns(df, start_date, end_date)
        if not is_valid_series(portfolio_returns):
            return None
        
        factor_returns = {}
        for factor_name, factor_info in FACTOR_DEFINITIONS.items():
            benchmark = factor_info['benchmark']
            returns = calculate_benchmark_returns(benchmark, start_date, end_date)
            if is_valid_series(returns):
                factor_returns[factor_name] = returns
        
        if not factor_returns:
            return None
        
        common_dates = portfolio_returns.index
        for factor_name in factor_returns:
            common_dates = common_dates.intersection(factor_returns[factor_name].index)
        
        X = pd.DataFrame({name: returns.loc[common_dates] for name, returns in factor_returns.items()})
        y = portfolio_returns.loc[common_dates]
        
        X['Alpha'] = 1
        
        model = LinearRegression()
        model.fit(X, y)
        
        exposures = pd.Series(model.coef_, index=X.columns)
        r_squared = model.score(X, y)
        predicted_returns = model.predict(X)
        
        asset_exposures = {}
        for _, row in df.iterrows():
            ticker = row['Ticker']
            ticker_returns = calculate_benchmark_returns(ticker, start_date, end_date)
            if is_valid_series(ticker_returns):
                ticker_aligned = ticker_returns.loc[common_dates]
                
                asset_model = LinearRegression()
                asset_model.fit(X, ticker_aligned)
                
                asset_exposures[ticker] = pd.Series(asset_model.coef_, index=X.columns)
        
        return {
            'exposures': exposures,
            'r_squared': r_squared,
            'factor_returns': X,
            'portfolio_returns': y,
            'predicted_returns': predicted_returns,
            'asset_exposures': asset_exposures
        }
    except:
        return None


def calculate_performance_metrics(df, portfolio_returns, benchmark_returns):
    if not is_valid_series(portfolio_returns):
        return None
    
    total_return = (1 + portfolio_returns).prod() - 1
    n_years = len(portfolio_returns) / 252
    annualized_return = (1 + total_return) ** (1/n_years) - 1 if n_years > 0 else 0
    annualized_vol = portfolio_returns.std() * np.sqrt(252)
    
    sharpe = calculate_sharpe_ratio(portfolio_returns)
    sortino = calculate_sortino_ratio(portfolio_returns)
    calmar = calculate_calmar_ratio(portfolio_returns)
    
    info_ratio = calculate_information_ratio(portfolio_returns, benchmark_returns)
    
    var_95 = calculate_var(portfolio_returns, 0.95)
    cvar_95 = calculate_cvar(portfolio_returns, 0.95)
    max_dd = calculate_max_drawdown(portfolio_returns)
    
    winning_days = (portfolio_returns > 0).sum()
    losing_days = (portfolio_returns < 0).sum()
    win_rate = winning_days / (winning_days + losing_days) * 100 if (winning_days + losing_days) > 0 else 0
    
    avg_win = portfolio_returns[portfolio_returns > 0].mean() * 100 if winning_days > 0 else 0
    avg_loss = portfolio_returns[portfolio_returns < 0].mean() * 100 if losing_days > 0 else 0
    
    best_day = portfolio_returns.max() * 100
    worst_day = portfolio_returns.min() * 100
    
    return {
        'Total Return': total_return * 100,
        'Annualized Return': annualized_return * 100,
        'Annualized Volatility': annualized_vol * 100,
        'Sharpe Ratio': sharpe,
        'Sortino Ratio': sortino,
        'Calmar Ratio': calmar,
        'Information Ratio': info_ratio,
        'VaR (95%)': var_95,
        'CVaR (95%)': cvar_95,
        'Max Drawdown': max_dd,
        'Win Rate': win_rate,
        'Avg Win': avg_win,
        'Avg Loss': avg_loss,
        'Best Day': best_day,
        'Worst Day': worst_day,
        'Winning Days': winning_days,
        'Losing Days': losing_days
    }


def calculate_portfolio_from_trades(trade_df):
    holdings = {}
    for _, row in trade_df.iterrows():
        symbol = row['Symbol']
        trade_type = row['Trade Type']
        quantity = row['Quantity']
        price = row['Price']
        
        if is_option_ticker(symbol):
            continue
        
        if symbol not in holdings:
            holdings[symbol] = {'total_shares': 0, 'total_cost': 0, 'trades': []}
        
        is_buy = 'Buy' in trade_type
        
        if is_buy:
            holdings[symbol]['total_shares'] += quantity
            holdings[symbol]['total_cost'] += (quantity * price)
            holdings[symbol]['trades'].append({'type': 'BUY', 'quantity': quantity, 'price': price})
        else:
            remaining_to_sell = quantity
            for trade in holdings[symbol]['trades']:
                if trade['type'] == 'BUY' and remaining_to_sell > 0:
                    if trade['quantity'] <= remaining_to_sell:
                        holdings[symbol]['total_cost'] -= (trade['quantity'] * trade['price'])
                        holdings[symbol]['total_shares'] -= trade['quantity']
                        remaining_to_sell -= trade['quantity']
                        trade['quantity'] = 0
                    else:
                        holdings[symbol]['total_cost'] -= (remaining_to_sell * trade['price'])
                        holdings[symbol]['total_shares'] -= remaining_to_sell
                        trade['quantity'] -= remaining_to_sell
                        remaining_to_sell = 0
    
    portfolio_data = []
    for symbol, data in holdings.items():
        if data['total_shares'] > 0:
            avg_cost = data['total_cost'] / data['total_shares']
            portfolio_data.append({
                'Ticker': symbol,
                'Shares': data['total_shares'],
                'Avg Cost': avg_cost
            })
    
    if portfolio_data is None or (isinstance(portfolio_data, pd.DataFrame) and portfolio_data.empty):
        return pd.DataFrame(columns=['Ticker', 'Shares', 'Avg Cost'])
    return pd.DataFrame(portfolio_data).sort_values('Ticker')


def project_fcff_enhanced(base_revenue, base_ebit, revenue_growth, ebit_margin, tax_rate,
                         depreciation_pct, capex_pct, change_wc, forecast_years, multistage_config=None):
    """
    ENHANCED: Project FCFF with D&A and CapEx scaling with revenue
    Supports multi-stage growth modeling
    """
    projections = []

    current_revenue = base_revenue

    for year in range(1, forecast_years + 1):
        # Determine growth rate for this year (multi-stage or single-stage)
        # Handle both dict and object types for multistage_config
        if multistage_config:
            if isinstance(multistage_config, dict):
                enabled = multistage_config.get('enabled', False)
                stage1_years = multistage_config.get('stage1_years', 0)
                stage2_years = multistage_config.get('stage2_years', 0)
                stage1_growth = multistage_config.get('stage1_growth', revenue_growth)
                stage2_growth = multistage_config.get('stage2_growth', revenue_growth)
                stage3_growth = multistage_config.get('stage3_growth', revenue_growth)
            else:
                enabled = getattr(multistage_config, 'enabled', False)
                stage1_years = getattr(multistage_config, 'stage1_years', 0)
                stage2_years = getattr(multistage_config, 'stage2_years', 0)
                stage1_growth = getattr(multistage_config, 'stage1_growth', revenue_growth)
                stage2_growth = getattr(multistage_config, 'stage2_growth', revenue_growth)
                stage3_growth = getattr(multistage_config, 'stage3_growth', revenue_growth)

            if enabled:
                if year <= stage1_years:
                    current_growth = stage1_growth
                elif year <= stage1_years + stage2_years:
                    current_growth = stage2_growth
                else:
                    current_growth = stage3_growth
            else:
                current_growth = revenue_growth
        else:
            current_growth = revenue_growth

        # Grow revenue
        current_revenue = current_revenue * (1 + current_growth)

        # Calculate EBIT based on margin
        current_ebit = current_revenue * ebit_margin
        
        # Calculate NOPAT
        nopat = current_ebit * (1 - tax_rate)
        
        # FIXED: Scale D&A and CapEx with revenue
        depreciation = current_revenue * depreciation_pct
        capex = current_revenue * capex_pct
        
        # Calculate FCFF
        fcff = nopat + depreciation - capex - change_wc
        
        projections.append({
            'year': year,
            'revenue': current_revenue,
            'ebit': current_ebit,
            'nopat': nopat,
            'depreciation': depreciation,
            'capex': capex,
            'change_wc': change_wc,
            'fcff': fcff
        })
    
    return projections


def project_fcfe_enhanced(base_revenue, base_net_income, revenue_growth, tax_rate,
                         depreciation_pct, capex_pct, change_wc, net_borrowing, forecast_years, multistage_config=None):
    """
    ENHANCED: Project FCFE with D&A and CapEx scaling with revenue
    Supports multi-stage growth modeling
    """
    projections = []

    current_revenue = base_revenue
    current_ni = base_net_income

    # Calculate initial NI margin
    ni_margin = current_ni / current_revenue if current_revenue > 0 else 0

    for year in range(1, forecast_years + 1):
        # Determine growth rate for this year (multi-stage or single-stage)
        # Handle both dict and object types for multistage_config
        if multistage_config:
            if isinstance(multistage_config, dict):
                enabled = multistage_config.get('enabled', False)
                stage1_years = multistage_config.get('stage1_years', 0)
                stage2_years = multistage_config.get('stage2_years', 0)
                stage1_growth = multistage_config.get('stage1_growth', revenue_growth)
                stage2_growth = multistage_config.get('stage2_growth', revenue_growth)
                stage3_growth = multistage_config.get('stage3_growth', revenue_growth)
            else:
                enabled = getattr(multistage_config, 'enabled', False)
                stage1_years = getattr(multistage_config, 'stage1_years', 0)
                stage2_years = getattr(multistage_config, 'stage2_years', 0)
                stage1_growth = getattr(multistage_config, 'stage1_growth', revenue_growth)
                stage2_growth = getattr(multistage_config, 'stage2_growth', revenue_growth)
                stage3_growth = getattr(multistage_config, 'stage3_growth', revenue_growth)

            if enabled:
                if year <= stage1_years:
                    current_growth = stage1_growth
                elif year <= stage1_years + stage2_years:
                    current_growth = stage2_growth
                else:
                    current_growth = stage3_growth
            else:
                current_growth = revenue_growth
        else:
            current_growth = revenue_growth

        # Grow revenue
        current_revenue = current_revenue * (1 + current_growth)

        # Grow net income
        current_ni = current_revenue * ni_margin
        
        # FIXED: Scale D&A and CapEx with revenue
        depreciation = current_revenue * depreciation_pct
        capex = current_revenue * capex_pct
        
        # Calculate FCFE
        fcfe = current_ni + depreciation - capex - change_wc + net_borrowing
        
        projections.append({
            'year': year,
            'revenue': current_revenue,
            'net_income': current_ni,
            'depreciation': depreciation,
            'capex': capex,
            'change_wc': change_wc,
            'net_borrowing': net_borrowing,
            'fcfe': fcfe
        })
    
    return projections


def apply_relative_valuation(company_financials, median_multiples, shares_outstanding):
    """
    Apply peer multiples to company financials
    Returns valuation for each multiple
    """
    results = {}

    # Extract company metrics
    eps = company_financials.get('eps', 0)
    book_value_per_share = company_financials.get('book_value_per_share', 0)
    sales_per_share = company_financials.get('sales_per_share', 0)
    ebitda = company_financials.get('ebitda', 0)
    ebit = company_financials.get('ebit', 0)
    revenue = company_financials.get('revenue', 0)
    total_debt = company_financials.get('total_debt', 0)
    cash = company_financials.get('cash', 0)

    # P/E Valuation
    if median_multiples['pe'] and eps:
        results['pe_value'] = eps * median_multiples['pe']

    # P/B Valuation
    if median_multiples['pb'] and book_value_per_share:
        results['pb_value'] = book_value_per_share * median_multiples['pb']

    # P/S Valuation
    if median_multiples['ps'] and sales_per_share:
        results['ps_value'] = sales_per_share * median_multiples['ps']

    # EV/EBITDA Valuation
    if median_multiples['ev_ebitda'] and ebitda and ebitda > 0:
        ev = ebitda * median_multiples['ev_ebitda']
        equity_value = ev - total_debt + cash
        results['ev_ebitda_value'] = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    # EV/EBIT Valuation
    if median_multiples['ev_ebit'] and ebit and ebit > 0:
        ev = ebit * median_multiples['ev_ebit']
        equity_value = ev - total_debt + cash
        results['ev_ebit_value'] = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    # EV/Sales Valuation
    if median_multiples['ev_sales'] and revenue and revenue > 0:
        ev = revenue * median_multiples['ev_sales']
        equity_value = ev - total_debt + cash
        results['ev_sales_value'] = equity_value / shares_outstanding if shares_outstanding > 0 else 0

    # Calculate average relative valuation
    valid_values = [v for v in results.values() if v is not None and v > 0]
    results['average_relative_value'] = np.median(valid_values) if valid_values else 0
    results['median_multiples'] = median_multiples

    return results


def apply_damodaran_constraints(value, constraint_type):
    """Apply industry-standard Damodaran constraints"""
    if constraint_type == 'terminal_growth':
        return min(value, VALUATION_CONSTRAINTS['max_terminal_growth'])
    elif constraint_type == 'payout_ratio':
        return min(max(value, 0), VALUATION_CONSTRAINTS['max_payout_ratio'])
    elif constraint_type == 'roe':
        return min(max(value, VALUATION_CONSTRAINTS['min_roe']), VALUATION_CONSTRAINTS['max_roe'])
    return value


def get_industry_average_pe(ticker):
    """Get industry average P/E ratio for comparison"""
    # ATLAS Refactoring - Use cached market data fetcher
    try:
        if REFACTORED_MODULES_AVAILABLE:
            info = market_data.get_company_info(ticker)
        else:
            # Fallback to old method
            stock = yf.Ticker(ticker)
            info = stock.info
        industry = info.get('industry', '')

        # Industry average P/E ratios (approximate benchmarks)
        industry_pe_map = {
            'Software': 30.0,
            'Technology': 25.0,
            'Semiconductors': 22.0,
            'Biotechnology': 20.0,
            'Healthcare': 18.0,
            'Financial Services': 12.0,
            'Banks': 10.0,
            'Insurance': 11.0,
            'Retail': 15.0,
            'Consumer Cyclical': 16.0,
            'Consumer Defensive': 18.0,
            'Energy': 12.0,
            'Utilities': 16.0,
            'Real Estate': 20.0,
            'Industrials': 17.0,
            'Materials': 14.0,
            'Communication Services': 19.0
        }

        # Try to match industry
        for key, pe in industry_pe_map.items():
            if key.lower() in industry.lower():
                return pe

        # Default market average
        return 18.0

    except:
        return 18.0


def get_industry_average_pb(ticker):
    """Get industry average P/B ratio"""
    # ATLAS Refactoring - Use cached market data fetcher
    try:
        if REFACTORED_MODULES_AVAILABLE:
            info = market_data.get_company_info(ticker)
        else:
            # Fallback to old method
            stock = yf.Ticker(ticker)
            info = stock.info
        industry = info.get('industry', '')

        # Industry average P/B ratios
        industry_pb_map = {
            'Software': 8.0,
            'Technology': 6.0,
            'Biotechnology': 4.0,
            'Healthcare': 3.5,
            'Financial Services': 1.5,
            'Banks': 1.2,
            'Insurance': 1.3,
            'Retail': 3.0,
            'Consumer Cyclical': 2.5,
            'Consumer Defensive': 3.0,
            'Energy': 1.5,
            'Utilities': 1.8,
            'Real Estate': 2.0,
            'Industrials': 2.8,
            'Materials': 2.0
        }

        for key, pb in industry_pb_map.items():
            if key.lower() in industry.lower():
                return pb

        return 3.0

    except:
        return 3.0


def get_industry_average_ev_ebitda(ticker):
    """Get industry average EV/EBITDA multiple"""
    # ATLAS Refactoring - Use cached market data fetcher
    try:
        if REFACTORED_MODULES_AVAILABLE:
            info = market_data.get_company_info(ticker)
        else:
            # Fallback to old method
            stock = yf.Ticker(ticker)
            info = stock.info
        industry = info.get('industry', '')

        # Industry average EV/EBITDA multiples
        industry_ev_ebitda_map = {
            'Software': 20.0,
            'Technology': 16.0,
            'Biotechnology': 15.0,
            'Healthcare': 14.0,
            'Financial Services': 10.0,
            'Banks': 8.0,
            'Retail': 10.0,
            'Consumer Cyclical': 11.0,
            'Consumer Defensive': 12.0,
            'Energy': 8.0,
            'Utilities': 10.0,
            'Real Estate': 15.0,
            'Industrials': 11.0,
            'Materials': 9.0
        }

        for key, ev_ebitda in industry_ev_ebitda_map.items():
            if key.lower() in industry.lower():
                return ev_ebitda

        return 12.0

    except:
        return 12.0


def run_monte_carlo_simulation(returns, initial_value=100000, days=252, simulations=1000):
    if not is_valid_series(returns) or len(returns) < 30:
        return None
    
    daily_return = returns.mean()
    daily_vol = returns.std()
    
    simulation_results = []
    
    for _ in range(simulations):
        prices = [initial_value]
        for _ in range(days):
            price = prices[-1] * (1 + np.random.normal(daily_return, daily_vol))
            prices.append(price)
        simulation_results.append(prices)
    
    return np.array(simulation_results)


def validate_and_map_sectors(df):
    """
    Ensure all securities are properly classified into standard sectors
    Map any non-standard sectors to standard GICS sectors
    """
    STANDARD_SECTORS = [
        'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical',
        'Communication Services', 'Industrials', 'Consumer Defensive',
        'Energy', 'Real Estate', 'Basic Materials', 'Utilities'
    ]

    SECTOR_MAPPING = {
        'Information Technology': 'Technology',
        'Health Care': 'Healthcare',
        'Financials': 'Financial Services',
        'Consumer Discretionary': 'Consumer Cyclical',
        'Communication': 'Communication Services',
        'Consumer Staples': 'Consumer Defensive',
        'Materials': 'Basic Materials',
        'Technology ': 'Technology',  # Trim whitespace
        'Financial': 'Financial Services',
    }

    # Apply mapping
    df['Sector'] = df['Sector'].replace(SECTOR_MAPPING)

    # Check for unmapped sectors
    unmapped = df[~df['Sector'].isin(STANDARD_SECTORS)]['Sector'].unique()
    if len(unmapped) > 0:
        st.warning(f"⚠️ Unmapped sectors found: {', '.join(unmapped)}. These will be grouped as 'Other'.")
        df.loc[~df['Sector'].isin(STANDARD_SECTORS), 'Sector'] = 'Other'

    return df


def validate_brinson_calculations(attribution_df, portfolio_weights, benchmark_weights,
                                  portfolio_returns, benchmark_returns):
    """
    Validate Brinson attribution calculations with detailed checks
    Returns validation results dict
    """
    validation_output = []

    validation_output.append("=" * 60)
    validation_output.append("BRINSON ATTRIBUTION VALIDATION")
    validation_output.append("=" * 60)

    # Check 1: Weights sum to 100%
    port_weight_sum = sum(portfolio_weights.values())
    bench_weight_sum = sum(benchmark_weights.values())

    validation_output.append("\n1. WEIGHT VALIDATION:")
    validation_output.append(f"   Portfolio weights sum: {port_weight_sum:.2f}%")
    validation_output.append(f"   Benchmark weights sum: {bench_weight_sum:.2f}%")

    weight_check_passed = True
    if abs(port_weight_sum - 100) > 0.1:
        validation_output.append("   ⚠️ WARNING: Portfolio weights don't sum to 100%")
        weight_check_passed = False
    if abs(bench_weight_sum - 100) > 0.1:
        validation_output.append("   ⚠️ WARNING: Benchmark weights don't sum to 100%")
        weight_check_passed = False

    # Check 2: Attribution effects sum correctly
    total_allocation = attribution_df['Allocation Effect'].sum()
    total_selection = attribution_df['Selection Effect'].sum()
    total_interaction = attribution_df['Interaction Effect'].sum()
    total_attribution = total_allocation + total_selection + total_interaction

    validation_output.append(f"\n2. ATTRIBUTION DECOMPOSITION:")
    validation_output.append(f"   Allocation Effect: {total_allocation:+.2f}%")
    validation_output.append(f"   Selection Effect: {total_selection:+.2f}%")
    validation_output.append(f"   Interaction Effect: {total_interaction:+.2f}%")
    validation_output.append(f"   Total Attribution: {total_attribution:+.2f}%")

    # Check 3: Compare to actual excess return
    portfolio_return = sum(portfolio_weights.get(s, 0) * portfolio_returns.get(s, 0) / 100
                          for s in portfolio_weights.keys())
    benchmark_return = sum(benchmark_weights.get(s, 0) * benchmark_returns.get(s, 0) / 100
                          for s in benchmark_weights.keys())
    actual_excess = portfolio_return - benchmark_return

    validation_output.append(f"\n3. EXCESS RETURN VALIDATION:")
    validation_output.append(f"   Portfolio Return: {portfolio_return * 100:.2f}%")
    validation_output.append(f"   Benchmark Return: {benchmark_return * 100:.2f}%")
    validation_output.append(f"   Actual Excess Return: {actual_excess * 100:.2f}%")
    validation_output.append(f"   Attribution Total: {total_attribution:.2f}%")
    validation_output.append(f"   Difference: {abs(actual_excess * 100 - total_attribution):.4f}%")

    attribution_matches = abs(actual_excess * 100 - total_attribution) < 0.5
    if not attribution_matches:
        validation_output.append("   ⚠️ WARNING: Attribution doesn't match excess return")

    # Check 4: Sector-level sanity checks
    validation_output.append(f"\n4. SECTOR-LEVEL CHECKS:")
    for _, row in attribution_df.iterrows():
        sector = row['Sector']
        alloc = row['Allocation Effect']
        selection = row['Selection Effect']
        validation_output.append(f"   {sector}:")
        validation_output.append(f"      Allocation: {alloc:+.2f}% | Selection: {selection:+.2f}%")

    validation_output.append("\n" + "=" * 60)

    # Print to console for debugging
    for line in validation_output:
        print(line)

    return {
        'weight_check_passed': weight_check_passed,
        'attribution_matches': attribution_matches,
        'total_attribution': total_attribution,
        'actual_excess': actual_excess * 100,
        'validation_output': '\n'.join(validation_output)
    }
