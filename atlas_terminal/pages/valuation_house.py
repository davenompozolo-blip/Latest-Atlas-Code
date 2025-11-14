"""
Valuation House Page
Professional DCF valuation engine with multiple valuation methods
"""

import streamlit as st
import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime
import logging

from ..visualizations.formatters import ATLASFormatter
from ..visualizations.charts import (
    create_dcf_waterfall,
    create_cash_flow_chart,
    create_sensitivity_table,
    create_valuation_summary_table
)
from ..analytics.valuation import (
    calculate_dcf_valuation,
    calculate_wacc,
    calculate_terminal_value,
    calculate_valuation_ratios,
    calculate_margin_of_safety
)
from ..config import VERSION, COLORS, RISK_FREE_RATE, MARKET_RETURN

logger = logging.getLogger(__name__)


def fetch_company_financials(ticker):
    """Fetch company financial data from Yahoo Finance"""
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        if not info or 'longName' not in info:
            return {
                'success': False,
                'error': f'Could not fetch data for {ticker}'
            }
        
        company_data = {
            'ticker': ticker,
            'name': info.get('longName', ticker),
            'sector': info.get('sector', 'Unknown'),
            'industry': info.get('industry', 'Unknown'),
            'current_price': info.get('currentPrice', 0),
            'market_cap': info.get('marketCap', 0),
            'beta': info.get('beta', 1.0),
            'forward_pe': info.get('forwardPE'),
            'shares_outstanding': info.get('sharesOutstanding', 0)
        }
        
        financials_data = {
            'revenue': info.get('totalRevenue', 0),
            'ebitda': info.get('ebitda', 0),
            'operating_cf': info.get('operatingCashflow', 0),
            'capex': info.get('capitalExpenditures', 0),
            'total_debt': info.get('totalDebt', 0),
            'total_cash': info.get('totalCash', 0),
            'book_value': info.get('bookValue', 0)
        }
        
        return {
            'success': True,
            'company': company_data,
            'financials': financials_data
        }
    
    except Exception as e:
        logger.error(f"Error fetching company data: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


def render():
    """Render the Valuation House page"""
    
    st.markdown("## 💰 VALUATION HOUSE - EXCELLENCE EDITION")
    st.markdown("### Professional DCF Valuation Engine")
    
    st.info("🎯 **Feature:** Comprehensive company valuation using DCF, comparables, and dividend models")
    
    # Company Search
    st.markdown("---")
    st.markdown("#### 🔍 Company Search")
    
    col1, col2 = st.columns([3, 1])
    
    with col1:
        ticker_input = st.text_input(
            "Enter Ticker Symbol",
            placeholder="e.g., AAPL, MSFT, GOOGL",
            help="Enter any publicly traded company ticker"
        ).upper()
    
    with col2:
        search_button = st.button("🚀 Load Company", type="primary", use_container_width=True)
    
    if search_button and ticker_input:
        with st.spinner(f"📊 Fetching data for {ticker_input}..."):
            company_data = fetch_company_financials(ticker_input)
            
            if company_data['success']:
                st.session_state['valuation_company'] = company_data
                st.success(f"✅ Loaded {company_data['company']['name']}")
            else:
                st.error(f"❌ Could not fetch data: {company_data.get('error', 'Unknown error')}")
    
    # Display valuation if company is loaded
    if 'valuation_company' in st.session_state:
        company = st.session_state['valuation_company']['company']
        financials = st.session_state['valuation_company']['financials']
        
        st.markdown("---")
        
        # Company Overview
        st.markdown(f"### 📊 {company['name']} ({company['ticker']})")
        
        col1, col2, col3, col4, col5 = st.columns(5)
        col1.metric("Current Price", ATLASFormatter.format_currency(company['current_price']))
        col2.metric("Market Cap", ATLASFormatter.format_large_currency(company['market_cap']))
        col3.metric("Sector", company['sector'])
        col4.metric("Beta", f"{company['beta']:.2f}")
        col5.metric("Forward P/E", f"{company.get('forward_pe', 0):.1f}" if company.get('forward_pe') else "N/A")
        
        st.markdown("---")

        # Valuation Method Selection
        st.markdown("#### 🎯 Valuation Method")
        
        valuation_method = st.selectbox(
            "Choose Valuation Approach",
            options=[
                'DCF - Free Cash Flow',
                'Comparable Companies',
                'Dividend Discount Model'
            ],
            help="Select valuation methodology"
        )
        
        st.markdown("---")
        
        # DCF Valuation
        if 'DCF' in valuation_method:
            st.markdown("#### 🎛️ DCF Assumptions")
            
            tab1, tab2, tab3 = st.tabs(["📈 Growth & Operations", "💰 Cost of Capital", "🎯 Terminal Value"])
            
            with tab1:
                st.markdown("##### Growth & Operating Assumptions")
                
                col1, col2 = st.columns(2)
                
                with col1:
                    revenue_growth = st.slider(
                        "Revenue Growth Rate (%)",
                        min_value=-10.0,
                        max_value=30.0,
                        value=5.0,
                        step=0.5
                    ) / 100
                    
                    ebitda_margin = st.slider(
                        "EBITDA Margin (%)",
                        min_value=0.0,
                        max_value=50.0,
                        value=20.0,
                        step=1.0
                    ) / 100
                    
                    capex_pct = st.slider(
                        "CapEx (% of Revenue)",
                        min_value=0.0,
                        max_value=20.0,
                        value=3.0,
                        step=0.5
                    ) / 100
                
                with col2:
                    tax_rate = st.slider(
                        "Tax Rate (%)",
                        min_value=0.0,
                        max_value=40.0,
                        value=21.0,
                        step=1.0
                    ) / 100
                    
                    years_projected = st.slider(
                        "Projection Years",
                        min_value=3,
                        max_value=10,
                        value=5,
                        step=1
                    )
            
            with tab2:
                st.markdown("##### Cost of Capital")
                
                col1, col2 = st.columns(2)
                
                with col1:
                    wacc = st.slider(
                        "WACC / Discount Rate (%)",
                        min_value=5.0,
                        max_value=20.0,
                        value=10.0,
                        step=0.5
                    ) / 100
                    
                    st.caption(f"Risk-free rate: {RISK_FREE_RATE*100:.1f}%")
                    st.caption(f"Market return: {MARKET_RETURN*100:.1f}%")
                    st.caption(f"Beta: {company['beta']:.2f}")
                
                with col2:
                    cost_equity = RISK_FREE_RATE + company['beta'] * (MARKET_RETURN - RISK_FREE_RATE)
                    st.metric("Implied Cost of Equity", f"{cost_equity*100:.2f}%")
                    
                    st.caption("Using CAPM: Rf + β(Rm - Rf)")
            
            with tab3:
                st.markdown("##### Terminal Value Assumptions")
                
                col1, col2 = st.columns(2)
                
                with col1:
                    terminal_growth = st.slider(
                        "Perpetual Growth Rate (%)",
                        min_value=0.0,
                        max_value=5.0,
                        value=2.5,
                        step=0.1
                    ) / 100
                    
                    st.caption("⚠️ Should not exceed long-term GDP growth")
                
                with col2:
                    terminal_multiple = st.slider(
                        "Exit EBITDA Multiple",
                        min_value=5.0,
                        max_value=25.0,
                        value=10.0,
                        step=0.5
                    )
            
            # Calculate DCF
            st.markdown("---")
            st.markdown("#### 📊 DCF Valuation Results")
            
            with st.spinner("Calculating DCF..."):
                try:
                    # Project cash flows
                    current_revenue = financials['revenue']
                    projected_fcf = []
                    
                    for year in range(1, years_projected + 1):
                        future_revenue = current_revenue * ((1 + revenue_growth) ** year)
                        ebitda = future_revenue * ebitda_margin
                        nopat = ebitda * (1 - tax_rate)
                        capex = future_revenue * capex_pct
                        fcf = nopat - capex
                        projected_fcf.append(fcf)
                    
                    # Calculate DCF
                    dcf_result = calculate_dcf_valuation(
                        company['ticker'],
                        projected_fcf,
                        terminal_growth,
                        wacc,
                        company['shares_outstanding']
                    )
                    
                    if dcf_result['success']:
                        fair_value = dcf_result['fair_value_per_share']
                        current_price = company['current_price']
                        
                        # Margin of safety
                        mos, assessment = calculate_margin_of_safety(current_price, fair_value)
                        
                        # Display results
                        col1, col2, col3 = st.columns(3)
                        
                        with col1:
                            st.metric(
                                "Fair Value",
                                ATLASFormatter.format_currency(fair_value),
                                delta=f"{mos:+.1f}% vs Current"
                            )
                        
                        with col2:
                            st.metric(
                                "Current Price",
                                ATLASFormatter.format_currency(current_price)
                            )
                        
                        with col3:
                            upside = ((fair_value - current_price) / current_price) * 100
                            st.metric(
                                "Upside/Downside",
                                f"{upside:+.1f}%",
                                delta=assessment
                            )
                        
                        # Detailed breakdown
                        st.markdown("---")
                        st.markdown("##### 📋 Valuation Breakdown")
                        
                        breakdown_data = {
                            'Component': [
                                'PV of Cash Flows',
                                'Terminal Value',
                                'PV of Terminal Value',
                                'Enterprise Value',
                                'Shares Outstanding',
                                'Fair Value per Share'
                            ],
                            'Value': [
                                ATLASFormatter.format_large_currency(dcf_result['sum_pv_fcf']),
                                ATLASFormatter.format_large_currency(dcf_result['terminal_value']),
                                ATLASFormatter.format_large_currency(dcf_result['pv_terminal_value']),
                                ATLASFormatter.format_large_currency(dcf_result['enterprise_value']),
                                ATLASFormatter.format_shares(dcf_result['shares_outstanding']),
                                ATLASFormatter.format_currency(dcf_result['fair_value_per_share'])
                            ]
                        }
                        
                        breakdown_df = pd.DataFrame(breakdown_data)
                        st.dataframe(breakdown_df, use_container_width=True, hide_index=True)
                        
                        # Visualizations
                        st.markdown("---")
                        st.markdown("##### 📈 Visualizations")
                        
                        col1, col2 = st.columns(2)
                        
                        with col1:
                            try:
                                dcf_chart = create_dcf_waterfall(dcf_result, method='FCFF')
                                if dcf_chart:
                                    st.plotly_chart(dcf_chart, use_container_width=True)
                            except Exception as e:
                                logger.error(f"Error creating DCF waterfall: {e}")
                        
                        with col2:
                            try:
                                cf_chart = create_cash_flow_chart(projected_fcf, method='FCFF')
                                if cf_chart:
                                    st.plotly_chart(cf_chart, use_container_width=True)
                            except Exception as e:
                                logger.error(f"Error creating cash flow chart: {e}")
                        
                        # Sensitivity Analysis
                        st.markdown("---")
                        st.markdown("##### 🎯 Sensitivity Analysis")
                        
                        try:
                            sensitivity = create_sensitivity_table(fair_value, wacc, terminal_growth)
                            if sensitivity:
                                st.plotly_chart(sensitivity, use_container_width=True)
                        except Exception as e:
                            logger.error(f"Error creating sensitivity table: {e}")
                            st.info("Sensitivity analysis unavailable")
                    
                    else:
                        st.error(f"DCF calculation failed: {dcf_result.get('error', 'Unknown error')}")
                
                except Exception as e:
                    logger.error(f"Error in DCF valuation: {e}", exc_info=True)
                    st.error(f"Error calculating DCF: {e}")
        
        # Comparable Companies
        elif 'Comparable' in valuation_method:
            st.markdown("#### 📊 Comparable Companies Analysis")
            
            try:
                ratios = calculate_valuation_ratios(company['ticker'], company['current_price'])
                
                if ratios:
                    col1, col2, col3 = st.columns(3)
                    
                    with col1:
                        st.metric("P/E Ratio", f"{ratios.get('pe_ratio', 0):.2f}" if ratios.get('pe_ratio') else "N/A")
                        st.metric("P/B Ratio", f"{ratios.get('pb_ratio', 0):.2f}" if ratios.get('pb_ratio') else "N/A")
                    
                    with col2:
                        st.metric("P/S Ratio", f"{ratios.get('ps_ratio', 0):.2f}" if ratios.get('ps_ratio') else "N/A")
                        st.metric("PEG Ratio", f"{ratios.get('peg_ratio', 0):.2f}" if ratios.get('peg_ratio') else "N/A")
                    
                    with col3:
                        st.metric("EV/EBITDA", f"{ratios.get('ev_to_ebitda', 0):.2f}" if ratios.get('ev_to_ebitda') else "N/A")
                        st.metric("Div Yield", f"{ratios.get('dividend_yield', 0)*100:.2f}%" if ratios.get('dividend_yield') else "N/A")
                    
                    st.info("""
                    **Valuation Multiples Interpretation:**
                    - **P/E**: Price relative to earnings (lower may indicate undervaluation)
                    - **P/B**: Price relative to book value
                    - **PEG**: P/E adjusted for growth (< 1.0 may indicate undervaluation)
                    - **EV/EBITDA**: Enterprise value relative to EBITDA
                    """)
            
            except Exception as e:
                logger.error(f"Error calculating ratios: {e}")
                st.error("Error fetching comparable data")
        
        # Dividend Discount Model
        else:
            st.markdown("#### 💰 Dividend Discount Model")
            st.info("""
            **DDM Valuation** is best suited for companies with:
            - Stable dividend payment history
            - Predictable dividend growth
            - Mature business models
            
            Examples: Utilities, consumer staples, REITs
            """)
            
            st.warning("DDM valuation not yet implemented in this interface. Use DCF or Comparables instead.")
    
    else:
        st.info("👆 Enter a ticker symbol above to begin valuation analysis")
    
    logger.info("Valuation House page rendered successfully")
