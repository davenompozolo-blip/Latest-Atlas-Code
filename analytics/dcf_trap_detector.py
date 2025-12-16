"""
ATLAS DCF TRAP DETECTION SYSTEM
================================
Institutional-grade valuation quality assessment layer

Philosophy: "Mathematically sound ≠ Economically sound"

This module sits above the DCF engine and interrogates WHY a valuation looks
attractive, flagging common patterns associated with value traps.

Author: ATLAS v11.0
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import yfinance as yf


@dataclass
class TrapWarning:
    """Container for trap detection results"""
    trap_type: str
    severity: str  # 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    confidence: float  # 0.0 to 1.0
    title: str
    description: str
    metrics: Dict[str, Any]
    recommendation: str

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'trap_type': self.trap_type,
            'severity': self.severity,
            'confidence': self.confidence,
            'title': self.title,
            'description': self.description,
            'metrics': self.metrics,
            'recommendation': self.recommendation
        }


class DCFTrapDetector:
    """
    DCF Trap Detection System

    Analyzes DCF valuations to identify common value trap patterns:
    1. Discount Rate Illusion
    2. Terminal Value Dependency
    3. Revenue Concentration Risk
    4. Idiosyncratic Optionality
    5. Absence of Critical Factor
    """

    def __init__(self, ticker: str, dcf_inputs: Dict[str, Any]):
        """
        Initialize trap detector

        Args:
            ticker: Stock ticker symbol
            dcf_inputs: Dictionary containing DCF model inputs:
                - wacc: Weighted average cost of capital
                - terminal_growth_rate: Terminal growth rate
                - projection_years: Number of projection years
                - revenue_projections: List of projected revenues
                - fcf_projections: List of projected free cash flows
                - terminal_value: Calculated terminal value
                - enterprise_value: Calculated enterprise value
                - current_price: Current stock price
                - fair_value: Calculated fair value
        """
        self.ticker = ticker
        self.dcf_inputs = dcf_inputs
        self.warnings: List[TrapWarning] = []

        # Fetch company data
        try:
            self.stock = yf.Ticker(ticker)
            self.info = self.stock.info
            self.financials = self.stock.financials
            self.balance_sheet = self.stock.balance_sheet
            self.cashflow = self.stock.cashflow
        except Exception as e:
            print(f"⚠️ Warning: Could not fetch data for {ticker}: {e}")
            self.info = {}
            self.financials = pd.DataFrame()
            self.balance_sheet = pd.DataFrame()
            self.cashflow = pd.DataFrame()

    def run_all_checks(self) -> List[TrapWarning]:
        """
        Run all trap detection checks

        Returns:
            List of TrapWarning objects for any detected traps
        """
        self.warnings = []

        # Run all 5 trap detectors
        self.check_discount_rate_illusion()
        self.check_terminal_value_dependency()
        self.check_revenue_concentration()
        self.check_idiosyncratic_optionality()
        self.check_absence_of_catalyst()

        # Sort by severity
        severity_order = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
        self.warnings.sort(key=lambda w: (severity_order.get(w.severity, 4), -w.confidence))

        return self.warnings

    # ============================================================
    # TRAP #1: DISCOUNT RATE ILLUSION
    # ============================================================

    def check_discount_rate_illusion(self) -> Optional[TrapWarning]:
        """
        Detect if attractive valuation is driven by artificially low discount rate

        Red Flags:
        - WACC < 10-year Treasury + 200 bps
        - WACC below peer median by >150 bps
        - Beta < 0.8 for non-utility stock
        - Debt/Equity ratio rising but WACC falling
        """
        wacc = self.dcf_inputs.get('wacc', 0)

        if wacc == 0:
            return None

        metrics = {}
        flags = []

        # Flag 1: WACC vs Risk-Free Rate
        try:
            # Get 10-year Treasury yield (using ^TNX)
            tnx = yf.Ticker("^TNX")
            treasury_10y = tnx.history(period='5d')['Close'].iloc[-1] / 100  # TNX is in percentage
            metrics['treasury_10y'] = treasury_10y

            min_wacc = treasury_10y + 0.02  # Treasury + 200 bps
            metrics['min_acceptable_wacc'] = min_wacc

            if wacc < min_wacc:
                flags.append(f"WACC ({wacc:.2%}) < Risk-Free + 2% ({min_wacc:.2%})")
        except:
            pass

        # Flag 2: Beta analysis
        beta = self.info.get('beta')
        sector = self.info.get('sector', '')

        if beta is not None:
            metrics['beta'] = beta
            metrics['sector'] = sector

            # Non-utility stocks with beta < 0.8 are suspicious
            if beta < 0.8 and sector not in ['Utilities', 'Consumer Defensive']:
                flags.append(f"Suspiciously low beta ({beta:.2f}) for {sector} sector")

        # Flag 3: Leverage analysis
        try:
            if not self.balance_sheet.empty:
                # Get most recent and prior year data
                total_debt = self.balance_sheet.loc['Total Debt'].iloc[0] if 'Total Debt' in self.balance_sheet.index else 0
                total_equity = self.balance_sheet.loc['Stockholders Equity'].iloc[0] if 'Stockholders Equity' in self.balance_sheet.index else 1

                debt_to_equity = total_debt / total_equity if total_equity != 0 else 0
                metrics['debt_to_equity'] = debt_to_equity

                # Check if leverage is high but WACC is low
                if debt_to_equity > 1.0 and wacc < 0.08:
                    flags.append(f"High leverage (D/E={debt_to_equity:.2f}) but low WACC ({wacc:.2%})")
        except:
            pass

        # Flag 4: Industry comparison
        industry = self.info.get('industry', '')
        if industry:
            metrics['industry'] = industry

            # Rough industry WACC benchmarks
            industry_waccs = {
                'Software': 0.10,
                'Technology': 0.11,
                'Biotechnology': 0.12,
                'Pharmaceuticals': 0.09,
                'Banks': 0.08,
                'Utilities': 0.07,
                'Real Estate': 0.08,
                'Retail': 0.09,
                'Energy': 0.10,
            }

            for ind_name, benchmark_wacc in industry_waccs.items():
                if ind_name.lower() in industry.lower():
                    metrics['industry_benchmark_wacc'] = benchmark_wacc

                    if wacc < benchmark_wacc - 0.015:  # 150 bps below benchmark
                        flags.append(f"WACC ({wacc:.2%}) is {(benchmark_wacc - wacc)*100:.0f} bps below {ind_name} benchmark ({benchmark_wacc:.2%})")
                    break

        # Generate warning if flags detected
        if len(flags) >= 2:  # Require at least 2 flags for confidence
            severity = 'CRITICAL' if len(flags) >= 3 else 'HIGH'
            confidence = min(0.95, 0.5 + (len(flags) * 0.15))

            warning = TrapWarning(
                trap_type='DISCOUNT_RATE_ILLUSION',
                severity=severity,
                confidence=confidence,
                title='⚠️ Discount Rate Illusion Detected',
                description=(
                    f"The attractive valuation may be driven by an artificially low discount rate. "
                    f"WACC of {wacc:.2%} appears suspiciously low given the company's risk profile.\n\n"
                    f"Red flags detected:\n" + "\n".join([f"• {flag}" for flag in flags])
                ),
                metrics=metrics,
                recommendation=(
                    f"Re-run DCF with conservative WACC of {metrics.get('industry_benchmark_wacc', wacc + 0.02):.2%}. "
                    "Verify beta calculation and debt cost assumptions. "
                    "Compare to peer group WACCs."
                )
            )

            self.warnings.append(warning)
            return warning

        return None

    # ============================================================
    # TRAP #2: TERMINAL VALUE DEPENDENCY
    # ============================================================

    def check_terminal_value_dependency(self) -> Optional[TrapWarning]:
        """
        Detect if valuation is overly dependent on terminal value assumptions

        Red Flags:
        - Terminal value > 80% of enterprise value
        - Terminal growth rate > GDP growth + 100 bps
        - Terminal growth rate > historical revenue CAGR
        - Margin expansion assumed in perpetuity
        """
        terminal_value = self.dcf_inputs.get('terminal_value', 0)
        enterprise_value = self.dcf_inputs.get('enterprise_value', 0)
        terminal_growth = self.dcf_inputs.get('terminal_growth_rate', 0)

        if enterprise_value == 0:
            return None

        metrics = {}
        flags = []

        # Flag 1: Terminal value as % of enterprise value
        tv_percent = (terminal_value / enterprise_value) * 100
        metrics['terminal_value_percent'] = tv_percent
        metrics['terminal_value'] = terminal_value
        metrics['enterprise_value'] = enterprise_value

        if tv_percent > 80:
            flags.append(f"Terminal value is {tv_percent:.1f}% of enterprise value (>80% threshold)")
        elif tv_percent > 70:
            flags.append(f"Terminal value is {tv_percent:.1f}% of enterprise value (approaching danger zone)")

        # Flag 2: Terminal growth vs GDP
        gdp_growth = 0.025  # Long-term US GDP growth ~2.5%
        metrics['gdp_growth'] = gdp_growth
        metrics['terminal_growth_rate'] = terminal_growth

        if terminal_growth > gdp_growth + 0.01:  # GDP + 100 bps
            flags.append(f"Terminal growth ({terminal_growth:.2%}) exceeds GDP growth + 1% ({gdp_growth + 0.01:.2%})")

        # Flag 3: Terminal growth vs historical growth
        try:
            if not self.financials.empty and 'Total Revenue' in self.financials.index:
                revenues = self.financials.loc['Total Revenue'].dropna()

                if len(revenues) >= 3:
                    # Calculate historical CAGR
                    years = len(revenues) - 1
                    historical_cagr = (revenues.iloc[-1] / revenues.iloc[0]) ** (1/years) - 1

                    metrics['historical_revenue_cagr'] = historical_cagr

                    if terminal_growth > historical_cagr and historical_cagr < 0.05:
                        flags.append(
                            f"Terminal growth ({terminal_growth:.2%}) exceeds historical CAGR ({historical_cagr:.2%}) "
                            f"despite slowing growth trend"
                        )
        except:
            pass

        # Flag 4: Margin expansion check
        fcf_projections = self.dcf_inputs.get('fcf_projections', [])
        revenue_projections = self.dcf_inputs.get('revenue_projections', [])

        if len(fcf_projections) >= 3 and len(revenue_projections) >= 3:
            # Calculate FCF margins for first and last projection years
            initial_margin = fcf_projections[0] / revenue_projections[0] if revenue_projections[0] != 0 else 0
            final_margin = fcf_projections[-1] / revenue_projections[-1] if revenue_projections[-1] != 0 else 0

            metrics['initial_fcf_margin'] = initial_margin
            metrics['final_fcf_margin'] = final_margin

            if final_margin > initial_margin * 1.5:  # 50%+ margin expansion
                flags.append(
                    f"Model assumes {((final_margin/initial_margin - 1)*100):.0f}% FCF margin expansion "
                    f"({initial_margin:.1%} → {final_margin:.1%})"
                )

        # Generate warning if flags detected
        if flags:
            severity = 'CRITICAL' if tv_percent > 85 or len(flags) >= 3 else 'HIGH' if tv_percent > 75 else 'MEDIUM'
            confidence = min(0.95, 0.6 + (len(flags) * 0.1))

            warning = TrapWarning(
                trap_type='TERMINAL_VALUE_DEPENDENCY',
                severity=severity,
                confidence=confidence,
                title='⚠️ Terminal Value Dependency Detected',
                description=(
                    f"The valuation is heavily dependent on terminal value assumptions. "
                    f"Terminal value represents {tv_percent:.1f}% of enterprise value.\n\n"
                    f"Red flags detected:\n" + "\n".join([f"• {flag}" for flag in flags])
                ),
                metrics=metrics,
                recommendation=(
                    f"Reduce terminal growth rate to {gdp_growth:.2%} (GDP growth). "
                    "Extend projection period to 10 years to reduce terminal value dependency. "
                    "Run sensitivity analysis on terminal growth assumptions."
                )
            )

            self.warnings.append(warning)
            return warning

        return None

    # ============================================================
    # TRAP #3: REVENUE CONCENTRATION RISK
    # ============================================================

    def check_revenue_concentration(self) -> Optional[TrapWarning]:
        """
        Detect if revenue is concentrated in few customers, products, or geographies

        Red Flags:
        - Top customer > 20% of revenue
        - Top 3 customers > 50% of revenue
        - Single product > 60% of revenue
        - HHI index > 2500 (highly concentrated)
        """
        metrics = {}
        flags = []

        # Try to extract segment revenue data from financials
        segment_revenues = self._extract_segment_revenues()

        if segment_revenues:
            metrics['segment_count'] = len(segment_revenues)
            metrics['segments'] = segment_revenues

            total_revenue = sum(segment_revenues.values())

            # Calculate HHI (Herfindahl-Hirschman Index)
            hhi = sum([(rev/total_revenue * 100)**2 for rev in segment_revenues.values()])
            metrics['hhi_index'] = hhi

            # HHI interpretation:
            # < 1500: Competitive
            # 1500-2500: Moderate concentration
            # > 2500: High concentration

            if hhi > 2500:
                flags.append(f"High revenue concentration (HHI = {hhi:.0f})")

            # Check top segment concentration
            sorted_segments = sorted(segment_revenues.items(), key=lambda x: x[1], reverse=True)
            top_segment_pct = (sorted_segments[0][1] / total_revenue) * 100

            metrics['top_segment'] = sorted_segments[0][0]
            metrics['top_segment_percent'] = top_segment_pct

            if top_segment_pct > 60:
                flags.append(f"Single segment '{sorted_segments[0][0]}' represents {top_segment_pct:.1f}% of revenue")

            # Check top 3 concentration
            if len(sorted_segments) >= 3:
                top3_pct = sum([seg[1] for seg in sorted_segments[:3]]) / total_revenue * 100
                metrics['top3_percent'] = top3_pct

                if top3_pct > 80:
                    flags.append(f"Top 3 segments represent {top3_pct:.1f}% of revenue")

        # Check customer concentration from 10-K (if available in info)
        # Note: This would require parsing 10-K filings, which we'll approximate
        # using industry heuristics

        sector = self.info.get('sector', '')
        industry = self.info.get('industry', '')

        # High-risk industries for customer concentration
        high_concentration_industries = [
            'Aerospace & Defense',  # Government contracts
            'Auto Parts',  # OEM dependency
            'Semiconductors',  # Few large customers
        ]

        for high_risk_ind in high_concentration_industries:
            if high_risk_ind.lower() in industry.lower():
                flags.append(f"{industry} sector typically has high customer concentration risk")
                metrics['industry_risk'] = 'HIGH'
                break

        # Generate warning if flags detected
        if flags:
            severity = 'HIGH' if len(flags) >= 2 else 'MEDIUM'
            confidence = 0.7 if segment_revenues else 0.5  # Lower confidence without hard data

            warning = TrapWarning(
                trap_type='REVENUE_CONCENTRATION',
                severity=severity,
                confidence=confidence,
                title='⚠️ Revenue Concentration Risk Detected',
                description=(
                    f"Revenue appears concentrated in few customers, products, or segments. "
                    f"Loss of key relationships could severely impact valuation.\n\n"
                    f"Red flags detected:\n" + "\n".join([f"• {flag}" for flag in flags])
                ),
                metrics=metrics,
                recommendation=(
                    "Review 10-K for customer concentration disclosures. "
                    "Assess contract renewal risk and competitive threats. "
                    "Apply higher discount rate or haircut to projections."
                )
            )

            self.warnings.append(warning)
            return warning

        return None

    # ============================================================
    # TRAP #4: IDIOSYNCRATIC OPTIONALITY
    # ============================================================

    def check_idiosyncratic_optionality(self) -> Optional[TrapWarning]:
        """
        Detect if valuation depends on binary, idiosyncratic events

        Red Flags (Pharma/Biotech):
        - Revenue hockey stick aligned with Phase III readout
        - >50% of value from single drug candidate
        - Patent cliff within 5 years

        Red Flags (Tech):
        - Product launch assumptions without historical precedent
        - Platform monetization assumptions
        """
        metrics = {}
        flags = []

        sector = self.info.get('sector', '')
        industry = self.info.get('industry', '')

        # PHARMA/BIOTECH CHECKS
        if sector == 'Healthcare' and ('Biotech' in industry or 'Pharmaceutical' in industry):
            metrics['industry_type'] = 'Pharma/Biotech'

            # Check for revenue hockey stick
            revenue_projections = self.dcf_inputs.get('revenue_projections', [])

            if len(revenue_projections) >= 4:
                # Calculate year-over-year growth rates
                growth_rates = []
                for i in range(1, len(revenue_projections)):
                    if revenue_projections[i-1] != 0:
                        growth = (revenue_projections[i] / revenue_projections[i-1]) - 1
                        growth_rates.append(growth)

                metrics['revenue_growth_rates'] = growth_rates

                # Check for sudden acceleration (hockey stick)
                if len(growth_rates) >= 3:
                    avg_early_growth = np.mean(growth_rates[:2])
                    avg_late_growth = np.mean(growth_rates[-2:])

                    if avg_late_growth > avg_early_growth * 3:  # 3x acceleration
                        flags.append(
                            f"Revenue hockey stick detected: growth accelerates from "
                            f"{avg_early_growth:.1%} to {avg_late_growth:.1%}"
                        )

            # Check pipeline data
            pipeline_data = self._extract_pipeline_data()

            if pipeline_data:
                metrics['pipeline'] = pipeline_data

                # Count late-stage candidates
                late_stage = [p for p in pipeline_data if p.get('phase') in ['Phase III', 'NDA/BLA']]

                if len(late_stage) >= 1:
                    flags.append(f"{len(late_stage)} late-stage drug candidate(s) - binary risk event")

            # Check for patent cliffs
            patent_expiry = self._check_patent_expiry()

            if patent_expiry:
                metrics['patent_expiry'] = patent_expiry

                years_to_expiry = patent_expiry.get('years_to_expiry', 99)
                revenue_at_risk = patent_expiry.get('revenue_at_risk_pct', 0)

                if years_to_expiry <= 5 and revenue_at_risk > 30:
                    flags.append(
                        f"Patent cliff: {revenue_at_risk:.0f}% of revenue at risk in {years_to_expiry} years"
                    )

        # TECH CHECKS
        elif sector == 'Technology':
            metrics['industry_type'] = 'Technology'

            # Check for platform monetization assumptions
            revenue_projections = self.dcf_inputs.get('revenue_projections', [])

            if len(revenue_projections) >= 4:
                # Check for exponential growth pattern (platform scaling)
                growth_rates = []
                for i in range(1, len(revenue_projections)):
                    if revenue_projections[i-1] != 0:
                        growth = (revenue_projections[i] / revenue_projections[i-1]) - 1
                        growth_rates.append(growth)

                # Sustained high growth (>30%) suggests platform assumptions
                high_growth_years = sum(1 for g in growth_rates if g > 0.30)

                if high_growth_years >= 3:
                    flags.append(
                        f"Model assumes {high_growth_years} years of >30% growth - "
                        "requires successful platform scaling"
                    )

            # Check market cap vs revenue (high multiple suggests future optionality)
            market_cap = self.info.get('marketCap', 0)

            try:
                if not self.financials.empty and 'Total Revenue' in self.financials.index:
                    current_revenue = self.financials.loc['Total Revenue'].iloc[0]

                    if current_revenue > 0:
                        ps_ratio = market_cap / current_revenue
                        metrics['price_to_sales'] = ps_ratio

                        if ps_ratio > 15:
                            flags.append(
                                f"Sky-high P/S ratio ({ps_ratio:.1f}x) implies significant "
                                "future optionality priced in"
                            )
            except:
                pass

        # Generate warning if flags detected
        if flags:
            severity = 'CRITICAL' if len(flags) >= 2 else 'HIGH'
            confidence = 0.75

            warning = TrapWarning(
                trap_type='IDIOSYNCRATIC_OPTIONALITY',
                severity=severity,
                confidence=confidence,
                title='⚠️ Idiosyncratic Optionality Risk Detected',
                description=(
                    f"Valuation appears to depend on binary, company-specific events rather than "
                    f"diversified cash flow streams.\n\n"
                    f"Red flags detected:\n" + "\n".join([f"• {flag}" for flag in flags])
                ),
                metrics=metrics,
                recommendation=(
                    "Apply probability weighting to binary outcomes. "
                    "Model downside scenarios explicitly. "
                    "Consider real options valuation methodology instead of DCF."
                )
            )

            self.warnings.append(warning)
            return warning

        return None

    # ============================================================
    # TRAP #5: ABSENCE OF CRITICAL FACTOR
    # ============================================================

    def check_absence_of_catalyst(self) -> Optional[TrapWarning]:
        """
        Detect if valuation assumes improvement without clear catalyst

        Red Flags:
        - Margin expansion without operational changes
        - Multiple re-rating without earnings growth
        - Turnaround assumptions without new management
        - Market share gains in mature market
        """
        metrics = {}
        flags = []

        # Check for margin expansion without catalyst
        fcf_projections = self.dcf_inputs.get('fcf_projections', [])
        revenue_projections = self.dcf_inputs.get('revenue_projections', [])

        if len(fcf_projections) >= 3 and len(revenue_projections) >= 3:
            # Calculate FCF margins
            initial_margin = fcf_projections[0] / revenue_projections[0] if revenue_projections[0] != 0 else 0
            final_margin = fcf_projections[-1] / revenue_projections[-1] if revenue_projections[-1] != 0 else 0

            metrics['initial_fcf_margin'] = initial_margin
            metrics['final_fcf_margin'] = final_margin
            metrics['margin_expansion_bps'] = (final_margin - initial_margin) * 10000

            # Check if margins are expanding significantly
            if final_margin > initial_margin * 1.2:  # 20%+ expansion
                # Check for catalyst indicators
                has_catalyst = False

                # Check for recent management changes
                try:
                    # Note: Would need to check recent 8-K filings for management changes
                    # Using heuristic: rapid executive turnover visible in financials
                    pass
                except:
                    pass

                # Check for recent operational changes (acquisitions, divestitures)
                # This would require parsing recent 10-Q/10-K

                if not has_catalyst:
                    flags.append(
                        f"Model assumes {((final_margin/initial_margin - 1)*100):.0f}% FCF margin expansion "
                        f"without identified operational catalyst"
                    )

        # Check for turnaround assumptions
        try:
            if not self.financials.empty and 'Total Revenue' in self.financials.index:
                revenues = self.financials.loc['Total Revenue'].dropna()

                if len(revenues) >= 3:
                    # Calculate historical growth
                    recent_growth = (revenues.iloc[-1] / revenues.iloc[-2]) - 1 if revenues.iloc[-2] != 0 else 0

                    metrics['recent_revenue_growth'] = recent_growth

                    # Check if projections assume turnaround from declining revenues
                    revenue_projections = self.dcf_inputs.get('revenue_projections', [])

                    if recent_growth < 0 and len(revenue_projections) >= 2:
                        projected_growth = (revenue_projections[1] / revenue_projections[0]) - 1

                        if projected_growth > 0.05:  # Assumes >5% growth
                            flags.append(
                                f"Model assumes turnaround to {projected_growth:.1%} growth "
                                f"from recent {recent_growth:.1%} decline without clear catalyst"
                            )
        except:
            pass

        # Check for market share gain assumptions in mature market
        industry = self.info.get('industry', '')
        sector = self.info.get('sector', '')

        # Mature, slow-growth industries
        mature_industries = [
            'Utilities',
            'Tobacco',
            'Beverages',
            'Packaged Foods',
            'Railroads',
        ]

        is_mature = any(mature_ind.lower() in industry.lower() for mature_ind in mature_industries)

        if is_mature:
            revenue_projections = self.dcf_inputs.get('revenue_projections', [])

            if len(revenue_projections) >= 3:
                # Calculate implied growth rate
                years = len(revenue_projections) - 1
                cagr = (revenue_projections[-1] / revenue_projections[0]) ** (1/years) - 1

                metrics['projected_cagr'] = cagr

                if cagr > 0.05:  # >5% growth in mature industry
                    flags.append(
                        f"Model assumes {cagr:.1%} CAGR in mature {industry} industry - "
                        "implies significant market share gains"
                    )

        # Check valuation multiple expansion assumptions
        current_price = self.dcf_inputs.get('current_price', 0)
        fair_value = self.dcf_inputs.get('fair_value', 0)

        if current_price > 0 and fair_value > 0:
            upside = (fair_value / current_price) - 1
            metrics['implied_upside'] = upside

            # If upside is driven by multiple expansion rather than earnings growth
            try:
                if not self.financials.empty:
                    # This would require more detailed analysis
                    # Placeholder for multiple expansion check
                    pass
            except:
                pass

        # Generate warning if flags detected
        if len(flags) >= 2:  # Require multiple flags for confidence
            severity = 'HIGH' if len(flags) >= 3 else 'MEDIUM'
            confidence = 0.65

            warning = TrapWarning(
                trap_type='ABSENCE_OF_CATALYST',
                severity=severity,
                confidence=confidence,
                title='⚠️ Absence of Catalyst Detected',
                description=(
                    f"Valuation assumes significant improvement without clear catalyst or "
                    f"operational driver.\n\n"
                    f"Red flags detected:\n" + "\n".join([f"• {flag}" for flag in flags])
                ),
                metrics=metrics,
                recommendation=(
                    "Identify specific operational initiatives driving improvement. "
                    "Verify management track record of execution. "
                    "Consider base case scenario with no improvement."
                )
            )

            self.warnings.append(warning)
            return warning

        return None

    # ============================================================
    # HELPER FUNCTIONS - DATA EXTRACTION
    # ============================================================

    def _extract_segment_revenues(self) -> Optional[Dict[str, float]]:
        """
        Extract segment revenue data from financials

        Returns:
            Dictionary mapping segment name to revenue
        """
        try:
            # Try to get segment data from yfinance
            # Note: yfinance doesn't always provide segment data
            # This would ideally parse 10-K segment disclosures

            # For now, use a heuristic approach
            # Check if company reports multiple business segments

            # Placeholder - would need actual segment data parsing
            return None

        except Exception as e:
            return None

    def _extract_pipeline_data(self) -> Optional[List[Dict]]:
        """
        Extract drug pipeline data for pharma/biotech companies

        Returns:
            List of dictionaries with pipeline candidates
        """
        try:
            # This would require scraping company investor relations
            # or using specialized biotech data providers

            # Placeholder - would need actual pipeline data source
            return None

        except Exception as e:
            return None

    def _check_patent_expiry(self) -> Optional[Dict]:
        """
        Check for upcoming patent expirations

        Returns:
            Dictionary with patent expiry information
        """
        try:
            # This would require patent database lookup
            # or parsing 10-K risk disclosures

            # Placeholder - would need actual patent data source
            return None

        except Exception as e:
            return None

    # ============================================================
    # REPORTING FUNCTIONS
    # ============================================================

    def get_summary(self) -> Dict[str, Any]:
        """
        Get summary of all detected traps

        Returns:
            Dictionary with summary statistics
        """
        if not self.warnings:
            return {
                'total_warnings': 0,
                'max_severity': 'NONE',
                'overall_confidence': 0.0,
                'recommendation': '✅ No significant value trap patterns detected'
            }

        severity_counts = {}
        for warning in self.warnings:
            severity_counts[warning.severity] = severity_counts.get(warning.severity, 0) + 1

        # Determine max severity
        max_severity = 'LOW'
        if any(w.severity == 'CRITICAL' for w in self.warnings):
            max_severity = 'CRITICAL'
        elif any(w.severity == 'HIGH' for w in self.warnings):
            max_severity = 'HIGH'
        elif any(w.severity == 'MEDIUM' for w in self.warnings):
            max_severity = 'MEDIUM'

        # Calculate overall confidence (average of all warnings)
        avg_confidence = np.mean([w.confidence for w in self.warnings])

        return {
            'total_warnings': len(self.warnings),
            'severity_counts': severity_counts,
            'max_severity': max_severity,
            'overall_confidence': avg_confidence,
            'warnings': [w.to_dict() for w in self.warnings],
            'recommendation': self._get_overall_recommendation()
        }

    def _get_overall_recommendation(self) -> str:
        """Generate overall recommendation based on detected traps"""

        if not self.warnings:
            return "✅ Valuation appears sound. No significant trap patterns detected."

        critical_count = sum(1 for w in self.warnings if w.severity == 'CRITICAL')
        high_count = sum(1 for w in self.warnings if w.severity == 'HIGH')

        if critical_count >= 2:
            return (
                "🚨 CRITICAL: Multiple severe value trap patterns detected. "
                "Recommend REJECTING this valuation and revisiting fundamental assumptions. "
                "DCF methodology may not be appropriate for this situation."
            )
        elif critical_count == 1 or high_count >= 2:
            return (
                "⚠️ HIGH RISK: Significant value trap patterns detected. "
                "Recommend substantial haircut to valuation or switching to alternative methodology. "
                "Proceed with extreme caution."
            )
        elif high_count == 1 or len(self.warnings) >= 3:
            return (
                "⚠️ MODERATE RISK: Some value trap indicators present. "
                "Recommend running sensitivity analysis and stress testing key assumptions. "
                "Consider this a yellow flag requiring deeper due diligence."
            )
        else:
            return (
                "⚠️ LOW RISK: Minor concerns detected. "
                "Valuation is likely reasonable but verify flagged assumptions."
            )


# ============================================================
# CONVENIENCE FUNCTIONS
# ============================================================

def analyze_dcf_traps(ticker: str, dcf_inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convenience function to run full trap analysis

    Args:
        ticker: Stock ticker symbol
        dcf_inputs: DCF model inputs dictionary

    Returns:
        Summary dictionary with all warnings
    """
    detector = DCFTrapDetector(ticker, dcf_inputs)
    detector.run_all_checks()
    return detector.get_summary()


if __name__ == '__main__':
    # Example usage
    print("ATLAS DCF Trap Detection System")
    print("=" * 60)

    # Example DCF inputs for testing
    example_inputs = {
        'wacc': 0.06,  # Suspiciously low
        'terminal_growth_rate': 0.035,  # Above GDP
        'projection_years': 5,
        'revenue_projections': [1000, 1100, 1250, 1500, 2000],  # Hockey stick
        'fcf_projections': [50, 60, 80, 120, 200],  # Margin expansion
        'terminal_value': 3000,
        'enterprise_value': 3500,  # TV is 86% of EV
        'current_price': 50,
        'fair_value': 75
    }

    # Run analysis
    summary = analyze_dcf_traps('AAPL', example_inputs)

    print(f"\nAnalysis Results:")
    print(f"Total Warnings: {summary['total_warnings']}")
    print(f"Max Severity: {summary['max_severity']}")
    print(f"Overall Confidence: {summary['overall_confidence']:.1%}")
    print(f"\n{summary['recommendation']}")
