#!/usr/bin/env python3
"""
ATLAS TERMINAL v10.1 - INVESTOPEDIA DIAGNOSTICS & IMPROVED SCRAPER
===================================================================

Diagnostic tool to inspect your actual Investopedia portfolio HTML
and create a working scraper based on the real structure.

This module provides:
1. InvestopediaDiagnostics - Save and analyze portfolio HTML structure
2. ImprovedInvestopediaScraper - Multi-strategy scraper with fallbacks
3. Helper functions for integration with main ATLAS Terminal
"""

import requests
from bs4 import BeautifulSoup
import pandas as pd
import json
from datetime import datetime
from typing import Dict, List, Optional
import re
import os


# ===================================================================
# DIAGNOSTIC MODE - SAVE HTML FOR INSPECTION
# ===================================================================

class InvestopediaDiagnostics:
    """
    Diagnostic tool to inspect and save Investopedia portfolio HTML.
    This helps us understand the actual structure and fix the scraper.
    """

    def __init__(self, session):
        self.session = session

    def save_portfolio_html(self, filename: str = "investopedia_portfolio.html"):
        """
        Fetch and save the portfolio page HTML for inspection.
        """
        try:
            response = self.session.get(
                "https://www.investopedia.com/simulator/portfolio",
                timeout=10
            )

            # Save raw HTML
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(response.text)

            print(f"✅ Portfolio HTML saved to {filename}")
            print(f"📄 File size: {len(response.text)} bytes")

            # Also save a pretty-printed version
            soup = BeautifulSoup(response.text, 'html.parser')
            pretty_filename = filename.replace('.html', '_pretty.html')

            with open(pretty_filename, 'w', encoding='utf-8') as f:
                f.write(soup.prettify())

            print(f"✅ Pretty HTML saved to {pretty_filename}")

            return response.text

        except Exception as e:
            print(f"❌ Error saving HTML: {e}")
            return None

    def analyze_page_structure(self, html: str) -> Dict:
        """
        Analyze the HTML structure to find potential data sources.
        """
        soup = BeautifulSoup(html, 'html.parser')

        analysis = {
            'tables_found': 0,
            'divs_with_data': 0,
            'scripts_with_json': 0,
            'api_endpoints': [],
            'table_info': [],
            'json_data': []
        }

        # Find all tables
        tables = soup.find_all('table')
        analysis['tables_found'] = len(tables)

        for idx, table in enumerate(tables):
            headers = [th.text.strip() for th in table.find_all('th')]
            row_count = len(table.find_all('tr')) - 1  # Minus header

            analysis['table_info'].append({
                'index': idx,
                'headers': headers,
                'rows': row_count,
                'classes': table.get('class', [])
            })

        # Find script tags with JSON data
        scripts = soup.find_all('script')
        for script in scripts:
            script_text = script.string if script.string else ''

            # Look for JSON-like structures
            if 'portfolio' in script_text.lower() or 'holdings' in script_text.lower():
                # Try to extract JSON
                json_matches = re.findall(r'\{[^{}]*"(?:holdings|portfolio|positions)"[^{}]*\}', script_text)
                if json_matches:
                    analysis['scripts_with_json'] += 1
                    analysis['json_data'].extend(json_matches[:3])  # First 3 matches

        # Look for API endpoints in script tags
        for script in scripts:
            script_text = script.string if script.string else ''
            api_matches = re.findall(r'https?://[^\s"\']+(?:api|simulator)[^\s"\']*', script_text)
            analysis['api_endpoints'].extend(api_matches)

        # Deduplicate API endpoints
        analysis['api_endpoints'] = list(set(analysis['api_endpoints']))

        return analysis

    def find_data_in_html(self, html: str) -> Dict:
        """
        Try to find portfolio data anywhere in the HTML.
        """
        soup = BeautifulSoup(html, 'html.parser')

        findings = {
            'account_value_found': False,
            'cash_found': False,
            'holdings_found': False,
            'data_locations': []
        }

        # Search for account value
        account_patterns = [
            r'Account\s*Value[:\s]*\$([0-9,]+\.?[0-9]*)',
            r'Total\s*Value[:\s]*\$([0-9,]+\.?[0-9]*)',
            r'Portfolio\s*Value[:\s]*\$([0-9,]+\.?[0-9]*)'
        ]

        for pattern in account_patterns:
            match = re.search(pattern, soup.get_text(), re.I)
            if match:
                findings['account_value_found'] = True
                findings['data_locations'].append({
                    'type': 'account_value',
                    'value': match.group(1),
                    'pattern': pattern
                })
                break

        # Search for cash
        cash_patterns = [
            r'Cash[:\s]*\$([0-9,]+\.?[0-9]*)',
            r'Available\s*Cash[:\s]*\$([0-9,]+\.?[0-9]*)'
        ]

        for pattern in cash_patterns:
            match = re.search(pattern, soup.get_text(), re.I)
            if match:
                findings['cash_found'] = True
                findings['data_locations'].append({
                    'type': 'cash',
                    'value': match.group(1),
                    'pattern': pattern
                })
                break

        # Search for ticker symbols (indicates holdings data)
        ticker_pattern = r'\b([A-Z]{1,5})\b'
        text = soup.get_text()
        potential_tickers = re.findall(ticker_pattern, text)

        # Common stock tickers to check for
        common_tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'SPY', 'QQQ']
        found_tickers = [t for t in potential_tickers if t in common_tickers]

        if found_tickers:
            findings['holdings_found'] = True
            findings['data_locations'].append({
                'type': 'tickers',
                'value': found_tickers[:10],  # First 10
                'count': len(found_tickers)
            })

        return findings


# ===================================================================
# IMPROVED SCRAPER - MULTIPLE STRATEGIES
# ===================================================================

class ImprovedInvestopediaScraper:
    """
    Enhanced scraper with multiple parsing strategies.
    Tries different approaches to find your portfolio data.
    """

    @staticmethod
    def parse_portfolio_multi_strategy(html: str) -> Optional[Dict]:
        """
        Try multiple strategies to parse portfolio data.
        """
        soup = BeautifulSoup(html, 'html.parser')

        # Strategy 1: Look for JSON in script tags
        portfolio_data = ImprovedInvestopediaScraper._extract_json_from_scripts(soup)
        if portfolio_data:
            print("✅ Found data in JavaScript!")
            return portfolio_data

        # Strategy 2: Parse HTML tables (improved)
        portfolio_data = ImprovedInvestopediaScraper._parse_html_tables_improved(soup)
        if portfolio_data and portfolio_data.get('holdings'):
            print("✅ Found data in HTML tables!")
            return portfolio_data

        # Strategy 3: Look for data attributes
        portfolio_data = ImprovedInvestopediaScraper._parse_data_attributes(soup)
        if portfolio_data:
            print("✅ Found data in HTML attributes!")
            return portfolio_data

        # Strategy 4: Regex extraction from text
        portfolio_data = ImprovedInvestopediaScraper._parse_from_text(soup)
        if portfolio_data:
            print("✅ Found data in page text!")
            return portfolio_data

        print("❌ No portfolio data found with any strategy")
        return None

    @staticmethod
    def _extract_json_from_scripts(soup: BeautifulSoup) -> Optional[Dict]:
        """Strategy 1: Extract JSON from script tags"""
        scripts = soup.find_all('script')

        for script in scripts:
            if not script.string:
                continue

            script_text = script.string

            # Look for portfolio/holdings data in various formats
            patterns = [
                r'portfolio\s*[:=]\s*(\{[^;]+\})',
                r'holdings\s*[:=]\s*(\[[^\]]+\])',
                r'positions\s*[:=]\s*(\[[^\]]+\])',
                r'window\.__INITIAL_STATE__\s*=\s*(\{.+?\});',
                r'window\.portfolioData\s*=\s*(\{.+?\});'
            ]

            for pattern in patterns:
                matches = re.findall(pattern, script_text, re.DOTALL)

                for match in matches:
                    try:
                        data = json.loads(match)

                        # Check if this looks like portfolio data
                        if isinstance(data, dict):
                            if 'holdings' in data or 'positions' in data:
                                return data
                        elif isinstance(data, list) and len(data) > 0:
                            # List of holdings
                            return {'holdings': data}
                    except:
                        continue

        return None

    @staticmethod
    def _parse_html_tables_improved(soup: BeautifulSoup) -> Optional[Dict]:
        """Strategy 2: Improved HTML table parsing"""
        tables = soup.find_all('table')

        for table in tables:
            # Get all text from table
            table_text = table.get_text().lower()

            # Check if this table has portfolio-related content
            if not any(keyword in table_text for keyword in ['symbol', 'ticker', 'shares', 'quantity', 'position']):
                continue

            holdings = []
            rows = table.find_all('tr')

            # Find header row
            header_row = None
            for row in rows:
                ths = row.find_all('th')
                if ths:
                    header_row = row
                    break

            if not header_row:
                continue

            # Get column indices
            headers = [th.text.strip().lower() for th in header_row.find_all('th')]

            # Map column indices
            col_map = {}
            for idx, header in enumerate(headers):
                if 'symbol' in header or 'ticker' in header:
                    col_map['ticker'] = idx
                if 'name' in header or 'company' in header:
                    col_map['name'] = idx
                if 'share' in header or 'quantity' in header or 'qty' in header:
                    col_map['shares'] = idx
                if 'purchase' in header or 'cost' in header:
                    col_map['purchase_price'] = idx
                if 'current' in header or 'last' in header or ('price' in header and 'purchase' not in header):
                    col_map['current_price'] = idx
                if 'value' in header or 'market' in header:
                    col_map['market_value'] = idx
                if 'gain' in header or 'p/l' in header or 'profit' in header:
                    col_map['gain_loss'] = idx

            # Parse data rows
            for row in rows:
                cells = row.find_all('td')

                if len(cells) < 3:  # Need at least ticker, shares, value
                    continue

                try:
                    holding = {}

                    # Extract ticker
                    if 'ticker' in col_map:
                        ticker = cells[col_map['ticker']].text.strip()
                        if not ticker or len(ticker) > 6:
                            continue
                        holding['ticker'] = ticker

                    # Extract shares
                    if 'shares' in col_map:
                        shares_text = cells[col_map['shares']].text.strip()
                        holding['shares'] = float(shares_text.replace(',', ''))

                    # Extract prices
                    if 'current_price' in col_map:
                        price_text = cells[col_map['current_price']].text.strip()
                        holding['current_price'] = float(price_text.replace('$', '').replace(',', ''))

                    if 'purchase_price' in col_map:
                        price_text = cells[col_map['purchase_price']].text.strip()
                        holding['purchase_price'] = float(price_text.replace('$', '').replace(',', ''))

                    if 'market_value' in col_map:
                        value_text = cells[col_map['market_value']].text.strip()
                        holding['market_value'] = float(value_text.replace('$', '').replace(',', ''))

                    if holding.get('ticker'):
                        holdings.append(holding)

                except Exception as e:
                    # Silently skip rows that don't parse
                    continue

            if holdings:
                return {
                    'holdings': holdings,
                    'success': True
                }

        return None

    @staticmethod
    def _parse_data_attributes(soup: BeautifulSoup) -> Optional[Dict]:
        """Strategy 3: Look for data in HTML element attributes"""
        # Look for elements with data-* attributes
        elements_with_data = soup.find_all(attrs={'data-portfolio': True})
        elements_with_data.extend(soup.find_all(attrs={'data-holdings': True}))
        elements_with_data.extend(soup.find_all(attrs={'data-positions': True}))

        for elem in elements_with_data:
            for attr, value in elem.attrs.items():
                if attr.startswith('data-'):
                    try:
                        data = json.loads(value)
                        if isinstance(data, dict) and ('holdings' in data or 'positions' in data):
                            return data
                    except:
                        continue

        return None

    @staticmethod
    def _parse_from_text(soup: BeautifulSoup) -> Optional[Dict]:
        """Strategy 4: Extract data from page text using regex"""
        text = soup.get_text()

        # This is a last-resort fallback
        # Look for patterns like "AAPL 100 shares @ $150.00"

        holdings = []
        pattern = r'([A-Z]{2,5})\s+(\d+(?:,\d{3})*)\s+shares?\s+(?:@|at)?\s*\$?([\d,]+\.?\d*)'

        matches = re.findall(pattern, text)

        for match in matches:
            ticker, shares, price = match

            try:
                holdings.append({
                    'ticker': ticker,
                    'shares': float(shares.replace(',', '')),
                    'current_price': float(price.replace(',', '')),
                    'market_value': float(shares.replace(',', '')) * float(price.replace(',', ''))
                })
            except:
                continue

        if holdings:
            return {
                'holdings': holdings,
                'success': True
            }

        return None


# ===================================================================
# DIAGNOSTIC HELPER FUNCTIONS
# ===================================================================

def diagnose_and_fix_scraping(session):
    """
    Run diagnostics and try improved scraping.
    """
    print("=" * 80)
    print("INVESTOPEDIA SCRAPING DIAGNOSTICS")
    print("=" * 80)

    # Initialize diagnostics
    diag = InvestopediaDiagnostics(session)

    # Save HTML for manual inspection
    print("\n📥 Saving portfolio HTML...")
    html = diag.save_portfolio_html()

    if not html:
        print("❌ Could not fetch portfolio page")
        return None

    # Analyze structure
    print("\n🔍 Analyzing page structure...")
    analysis = diag.analyze_page_structure(html)

    print(f"\nTables found: {analysis['tables_found']}")
    for table_info in analysis['table_info']:
        print(f"  Table {table_info['index']}: {table_info['rows']} rows")
        print(f"    Headers: {table_info['headers']}")

    print(f"\nScripts with JSON: {analysis['scripts_with_json']}")
    print(f"API endpoints found: {len(analysis['api_endpoints'])}")

    # Find data
    print("\n🔎 Searching for portfolio data...")
    findings = diag.find_data_in_html(html)

    print(f"Account value found: {findings['account_value_found']}")
    print(f"Cash found: {findings['cash_found']}")
    print(f"Holdings found: {findings['holdings_found']}")

    for location in findings['data_locations']:
        print(f"  {location['type']}: {location.get('value')}")

    # Try improved scraping
    print("\n🚀 Trying improved scraping strategies...")
    portfolio_data = ImprovedInvestopediaScraper.parse_portfolio_multi_strategy(html)

    if portfolio_data:
        print(f"\n✅ SUCCESS! Found {len(portfolio_data.get('holdings', []))} holdings")
        return portfolio_data
    else:
        print("\n❌ Could not extract portfolio data")
        print("📄 Check investopedia_portfolio.html for manual inspection")
        return None


# ===================================================================
# STREAMLIT INTEGRATION HELPERS
# ===================================================================

def get_diagnostic_info(session) -> Dict:
    """
    Get diagnostic information for display in Streamlit.
    Returns a dict with analysis results.
    """
    diag = InvestopediaDiagnostics(session)

    try:
        html = diag.save_portfolio_html()

        if not html:
            return {'success': False, 'error': 'Could not fetch portfolio page'}

        analysis = diag.analyze_page_structure(html)
        findings = diag.find_data_in_html(html)

        return {
            'success': True,
            'analysis': analysis,
            'findings': findings,
            'html_saved': True
        }

    except Exception as e:
        return {'success': False, 'error': str(e)}


if __name__ == "__main__":
    print("ATLAS Investopedia Diagnostics Module")
    print("Import this module to use diagnostic tools")
