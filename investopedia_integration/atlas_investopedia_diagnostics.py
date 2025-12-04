"""
ATLAS TERMINAL v10.0 - INVESTOPEDIA DIAGNOSTICS
===============================================

Advanced HTML scraping with 4 different strategies:
1. JSON extraction from <script> tags
2. HTML table parsing with dynamic column mapping
3. Data attribute parsing
4. Regex text extraction (fallback)

Use this when the main scraper fails!
"""

import requests
from bs4 import BeautifulSoup
import pandas as pd
import re
import json
from typing import Dict, List, Optional, Tuple


class InvestopediaDiagnostics:
    """
    Diagnostic tools for debugging Investopedia scraping issues.
    """

    def __init__(self, session: requests.Session):
        self.session = session

    def save_portfolio_html(self, filename: str = "investopedia_portfolio.html"):
        """
        Save raw portfolio HTML for manual inspection.
        """
        PORTFOLIO_URL = "https://www.investopedia.com/simulator/portfolio"

        try:
            response = self.session.get(PORTFOLIO_URL, timeout=10)

            # Save raw HTML
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(response.text)

            # Save pretty-printed version
            soup = BeautifulSoup(response.content, 'html.parser')
            with open(f"pretty_{filename}", 'w', encoding='utf-8') as f:
                f.write(soup.prettify())

            return True, len(response.text)

        except Exception as e:
            return False, str(e)

    def analyze_page_structure(self, html: str) -> Dict:
        """
        Analyze HTML structure to understand page layout.

        Returns dict with:
        - tables_found: int
        - table_info: List[Dict] (headers, rows, classes)
        - scripts_with_json: int
        - api_endpoints: List[str]
        - json_data: List[Dict]
        """
        soup = BeautifulSoup(html, 'html.parser')

        analysis = {
            'tables_found': 0,
            'table_info': [],
            'scripts_with_json': 0,
            'api_endpoints': [],
            'json_data': []
        }

        # Analyze tables
        tables = soup.find_all('table')
        analysis['tables_found'] = len(tables)

        for idx, table in enumerate(tables):
            headers = [th.text.strip() for th in table.find_all('th')]
            rows = len(table.find_all('tr')) - 1  # Exclude header row
            classes = table.get('class', [])

            analysis['table_info'].append({
                'index': idx,
                'headers': headers,
                'rows': rows,
                'classes': classes
            })

        # Analyze scripts for JSON
        scripts = soup.find_all('script')

        for script in scripts:
            if script.string:
                # Look for JSON-like structures
                if 'portfolio' in script.string.lower() or 'holdings' in script.string.lower():
                    analysis['scripts_with_json'] += 1

                    # Try to extract JSON
                    json_patterns = [
                        r'portfolio\s*[:=]\s*(\{[^;]+\})',
                        r'holdings\s*[:=]\s*(\[[^\]]+\])',
                        r'window\.__INITIAL_STATE__\s*=\s*(\{.+?\});'
                    ]

                    for pattern in json_patterns:
                        matches = re.findall(pattern, script.string, re.DOTALL)
                        for match in matches:
                            try:
                                data = json.loads(match)
                                analysis['json_data'].append(data)
                            except:
                                pass

                # Look for API endpoints
                api_patterns = [
                    r'(https?://[^\s"\'>]+/api/[^\s"\'>]+)',
                    r'(/api/[^\s"\'>]+)'
                ]

                for pattern in api_patterns:
                    endpoints = re.findall(pattern, script.string)
                    analysis['api_endpoints'].extend(endpoints)

        return analysis

    def find_data_in_html(self, html: str) -> Dict:
        """
        Search for specific data points in HTML.

        Returns dict with boolean flags for what was found.
        """
        findings = {
            'account_value_found': False,
            'cash_found': False,
            'holdings_found': False,
            'tickers_found': [],
            'account_value': None,
            'cash': None
        }

        # Search for account value
        account_patterns = [
            r'Account\s*Value[:\s]*\$([0-9,]+\.?[0-9]*)',
            r'Total\s*Value[:\s]*\$([0-9,]+\.?[0-9]*)',
            r'Portfolio\s*Value[:\s]*\$([0-9,]+\.?[0-9]*)'
        ]

        for pattern in account_patterns:
            match = re.search(pattern, html, re.I)
            if match:
                findings['account_value_found'] = True
                findings['account_value'] = match.group(1)
                break

        # Search for cash
        cash_match = re.search(r'Cash[:\s]*\$([0-9,]+\.?[0-9]*)', html, re.I)
        if cash_match:
            findings['cash_found'] = True
            findings['cash'] = cash_match.group(1)

        # Search for ticker symbols
        ticker_pattern = r'\b([A-Z]{2,5})\b'
        all_tickers = re.findall(ticker_pattern, html)

        # Common stock tickers to check for
        common_tickers = [
            'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA',
            'JPM', 'BAC', 'C', 'WFC', 'GS', 'MS', 'V', 'MA', 'BRK'
        ]

        found_tickers = list(set([t for t in all_tickers if t in common_tickers]))

        if found_tickers:
            findings['holdings_found'] = True
            findings['tickers_found'] = found_tickers

        return findings


class ImprovedInvestopediaScraper:
    """
    Enhanced scraper with multiple strategies.
    """

    def __init__(self, session: requests.Session):
        self.session = session

    def parse_portfolio_multi_strategy(self, html: str) -> Optional[List[Dict]]:
        """
        Try multiple scraping strategies in order of reliability.

        Returns list of holdings or None.
        """
        # Strategy 1: JSON extraction
        holdings = self._strategy_json_extraction(html)
        if holdings:
            return holdings

        # Strategy 2: HTML table parsing (improved)
        holdings = self._strategy_table_parsing(html)
        if holdings:
            return holdings

        # Strategy 3: Data attribute parsing
        holdings = self._strategy_data_attributes(html)
        if holdings:
            return holdings

        # Strategy 4: Regex text extraction
        holdings = self._strategy_regex_extraction(html)
        if holdings:
            return holdings

        return None

    def _strategy_json_extraction(self, html: str) -> Optional[List[Dict]]:
        """
        Strategy 1: Extract JSON from <script> tags.
        """
        soup = BeautifulSoup(html, 'html.parser')
        scripts = soup.find_all('script')

        for script in scripts:
            if not script.string:
                continue

            # Look for JSON patterns
            patterns = [
                r'portfolio\s*[:=]\s*(\{[^;]+\})',
                r'holdings\s*[:=]\s*(\[[^\]]+\])',
                r'positions\s*[:=]\s*(\[[^\]]+\])',
                r'window\.__INITIAL_STATE__\s*=\s*(\{.+?\});'
            ]

            for pattern in patterns:
                matches = re.findall(pattern, script.string, re.DOTALL)
                for match in matches:
                    try:
                        data = json.loads(match)

                        # Check if data contains holdings
                        if isinstance(data, dict):
                            if 'holdings' in data:
                                return data['holdings']
                            elif 'positions' in data:
                                return data['positions']
                        elif isinstance(data, list):
                            return data
                    except:
                        continue

        return None

    def _strategy_table_parsing(self, html: str) -> Optional[List[Dict]]:
        """
        Strategy 2: Parse HTML tables with dynamic column mapping.
        """
        soup = BeautifulSoup(html, 'html.parser')
        tables = soup.find_all('table')

        for table in tables:
            rows = table.find_all('tr')
            if len(rows) < 2:
                continue

            # Get headers
            header_row = rows[0]
            headers = [th.text.strip().lower() for th in header_row.find_all(['th', 'td'])]

            # Check if this looks like a holdings table
            keywords = ['symbol', 'ticker', 'shares', 'quantity', 'position', 'stock']
            if not any(kw in ' '.join(headers) for kw in keywords):
                continue

            # Map column indices
            col_map = {}
            for idx, header in enumerate(headers):
                if 'symbol' in header or 'ticker' in header:
                    col_map['ticker'] = idx
                elif 'shares' in header or 'quantity' in header:
                    col_map['shares'] = idx
                elif 'price' in header and 'current' in header:
                    col_map['current_price'] = idx
                elif 'purchase' in header and 'price' in header:
                    col_map['purchase_price'] = idx
                elif 'value' in header or 'market' in header:
                    col_map['market_value'] = idx

            # Extract data
            holdings = []

            for row in rows[1:]:
                cells = row.find_all('td')
                if len(cells) < 3:
                    continue

                try:
                    ticker = cells[col_map.get('ticker', 0)].text.strip()

                    # Validate ticker
                    if not ticker or len(ticker) > 6 or not ticker.replace('.', '').isalpha():
                        continue

                    holding = {'ticker': ticker.upper()}

                    # Extract other fields if available
                    if 'shares' in col_map:
                        shares_text = cells[col_map['shares']].text.strip().replace(',', '')
                        holding['shares'] = float(shares_text)

                    if 'current_price' in col_map:
                        price_text = cells[col_map['current_price']].text.strip().replace('$', '').replace(',', '')
                        holding['current_price'] = float(price_text)

                    if 'purchase_price' in col_map:
                        price_text = cells[col_map['purchase_price']].text.strip().replace('$', '').replace(',', '')
                        holding['purchase_price'] = float(price_text)

                    if 'market_value' in col_map:
                        value_text = cells[col_map['market_value']].text.strip().replace('$', '').replace(',', '')
                        holding['market_value'] = float(value_text)

                    holdings.append(holding)

                except (ValueError, IndexError):
                    continue

            if holdings:
                return holdings

        return None

    def _strategy_data_attributes(self, html: str) -> Optional[List[Dict]]:
        """
        Strategy 3: Look for data-* attributes.
        """
        soup = BeautifulSoup(html, 'html.parser')

        # Look for elements with portfolio data
        data_elements = soup.find_all(attrs={'data-portfolio': True})
        data_elements += soup.find_all(attrs={'data-holdings': True})
        data_elements += soup.find_all(attrs={'data-positions': True})

        for elem in data_elements:
            for attr in ['data-portfolio', 'data-holdings', 'data-positions']:
                if elem.has_attr(attr):
                    try:
                        data = json.loads(elem[attr])
                        if isinstance(data, list):
                            return data
                        elif isinstance(data, dict) and 'holdings' in data:
                            return data['holdings']
                    except:
                        continue

        return None

    def _strategy_regex_extraction(self, html: str) -> Optional[List[Dict]]:
        """
        Strategy 4: Regex extraction from text (last resort).
        """
        # Pattern: TICKER 100 shares @ $150.00
        pattern = r'([A-Z]{2,5})\s+(\d+(?:,\d{3})*)\s+shares?\s+(?:@|at)?\s*\$?([\d,]+\.?\d*)'

        matches = re.findall(pattern, html)

        if matches:
            holdings = []
            for ticker, shares, price in matches:
                holdings.append({
                    'ticker': ticker,
                    'shares': float(shares.replace(',', '')),
                    'current_price': float(price.replace(',', '')),
                    'market_value': float(shares.replace(',', '')) * float(price.replace(',', ''))
                })
            return holdings

        return None


class PortfolioDataValidator:
    """
    Validate scraped portfolio data.
    """

    @staticmethod
    def validate_holdings(holdings: List[Dict]) -> Tuple[List[Dict], List[str]]:
        """
        Validate and clean holdings data.

        Returns:
            (cleaned_holdings, warnings)
        """
        cleaned = []
        warnings = []

        for holding in holdings:
            # Check required fields
            if 'ticker' not in holding:
                warnings.append("Missing ticker in holding")
                continue

            ticker = holding['ticker'].upper().strip()

            # Validate ticker format
            if not ticker or len(ticker) > 6:
                warnings.append(f"Invalid ticker format: {ticker}")
                continue

            # Check shares
            shares = holding.get('shares', 0)
            if shares <= 0:
                warnings.append(f"{ticker}: Invalid shares ({shares})")
                continue

            # Check prices
            current_price = holding.get('current_price', 0)
            if current_price <= 0:
                warnings.append(f"{ticker}: Invalid current price ({current_price})")

            # Validate market value calculation
            if 'market_value' in holding and 'shares' in holding and 'current_price' in holding:
                calculated_value = holding['shares'] * holding['current_price']
                reported_value = holding['market_value']

                # Allow 1% tolerance for rounding
                if abs(calculated_value - reported_value) / calculated_value > 0.01:
                    warnings.append(f"{ticker}: Market value mismatch")

            cleaned.append(holding)

        return cleaned, warnings

    @staticmethod
    def validate_account_summary(summary: Dict, holdings: List[Dict]) -> List[str]:
        """
        Validate account summary against holdings.
        """
        warnings = []

        # Check if total market value matches sum of holdings
        if holdings and 'account_value' in summary:
            holdings_total = sum(h.get('market_value', 0) for h in holdings)
            account_value = summary['account_value']
            cash = summary.get('cash', 0)

            expected_total = holdings_total + cash

            # Allow 1% tolerance
            if abs(expected_total - account_value) / account_value > 0.01:
                warnings.append(
                    f"Account value mismatch: "
                    f"Holdings (${holdings_total:,.2f}) + Cash (${cash:,.2f}) = "
                    f"${expected_total:,.2f}, but account shows ${account_value:,.2f}"
                )

        return warnings


# ===================================================================
# EXAMPLE USAGE
# ===================================================================

if __name__ == "__main__":
    print("="*80)
    print("ATLAS TERMINAL - INVESTOPEDIA DIAGNOSTICS")
    print("="*80)

    # This would normally be called with an active session
    print("\nDiagnostic tools ready!")
    print("\nUsage:")
    print("1. diagnostics = InvestopediaDiagnostics(session)")
    print("2. diagnostics.save_portfolio_html('portfolio.html')")
    print("3. analysis = diagnostics.analyze_page_structure(html)")
    print("4. scraper = ImprovedInvestopediaScraper(session)")
    print("5. holdings = scraper.parse_portfolio_multi_strategy(html)")

    print("\n" + "="*80)
