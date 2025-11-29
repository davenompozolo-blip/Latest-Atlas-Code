#!/usr/bin/env python3
"""
ATLAS TERMINAL - INVESTOPEDIA DIAGNOSTIC TEST SUITE
====================================================

Tests all 4 scraping strategies and diagnostic tools:
1. JSON extraction from <script> tags
2. HTML table parsing with dynamic column mapping
3. Data attribute parsing
4. Regex text extraction

This ensures the multi-strategy scraper works correctly.
"""

import sys
import json
from bs4 import BeautifulSoup
from atlas_investopedia_diagnostics import (
    ImprovedInvestopediaScraper,
    InvestopediaDiagnostics
)

# Color codes for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_test_header(test_name):
    """Print formatted test header"""
    print(f"\n{BLUE}{'=' * 80}{RESET}")
    print(f"{BLUE}TEST: {test_name}{RESET}")
    print(f"{BLUE}{'=' * 80}{RESET}\n")

def print_success(message):
    """Print success message"""
    print(f"{GREEN}✅ {message}{RESET}")

def print_failure(message):
    """Print failure message"""
    print(f"{RED}❌ {message}{RESET}")

def print_info(message):
    """Print info message"""
    print(f"{YELLOW}ℹ️  {message}{RESET}")


# ===================================================================
# TEST DATA - Sample HTML structures
# ===================================================================

# Strategy 1: JSON in <script> tag
SAMPLE_HTML_WITH_JSON = """
<html>
<head><title>Portfolio</title></head>
<body>
    <script type="text/javascript">
        window.portfolioData = {
            "holdings": [
                {"ticker": "AAPL", "shares": 100, "current_price": 150.00, "market_value": 15000.00},
                {"ticker": "MSFT", "shares": 50, "current_price": 300.00, "market_value": 15000.00},
                {"ticker": "GOOGL", "shares": 25, "current_price": 120.00, "market_value": 3000.00}
            ]
        };
    </script>
    <div class="portfolio">
        <h1>My Portfolio</h1>
    </div>
</body>
</html>
"""

# Strategy 2: HTML table with headers
SAMPLE_HTML_WITH_TABLE = """
<html>
<head><title>Portfolio</title></head>
<body>
    <div class="portfolio-container">
        <h1>Account Value: $100,000.00</h1>
        <p>Cash: $50,000.00</p>

        <table class="holdings-table">
            <thead>
                <tr>
                    <th>Symbol</th>
                    <th>Company Name</th>
                    <th>Shares</th>
                    <th>Purchase Price</th>
                    <th>Current Price</th>
                    <th>Market Value</th>
                    <th>Gain/Loss</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>AAPL</td>
                    <td>Apple Inc.</td>
                    <td>100</td>
                    <td>$140.00</td>
                    <td>$150.00</td>
                    <td>$15,000.00</td>
                    <td>$1,000.00</td>
                </tr>
                <tr>
                    <td>MSFT</td>
                    <td>Microsoft Corporation</td>
                    <td>50</td>
                    <td>$280.00</td>
                    <td>$300.00</td>
                    <td>$15,000.00</td>
                    <td>$1,000.00</td>
                </tr>
                <tr>
                    <td>GOOGL</td>
                    <td>Alphabet Inc.</td>
                    <td>25</td>
                    <td>$110.00</td>
                    <td>$120.00</td>
                    <td>$3,000.00</td>
                    <td>$250.00</td>
                </tr>
            </tbody>
        </table>
    </div>
</body>
</html>
"""

# Strategy 3: Data attributes
SAMPLE_HTML_WITH_DATA_ATTRS = """
<html>
<head><title>Portfolio</title></head>
<body>
    <div class="portfolio"
         data-portfolio='{"holdings": [{"ticker": "AAPL", "shares": 100, "current_price": 150.00}]}'>
        <h1>My Portfolio</h1>
    </div>
</body>
</html>
"""

# Strategy 4: Plain text (regex extraction)
SAMPLE_HTML_WITH_TEXT = """
<html>
<head><title>Portfolio</title></head>
<body>
    <div class="portfolio">
        <h1>My Holdings</h1>
        <p>AAPL 100 shares @ $150.00</p>
        <p>MSFT 50 shares @ $300.00</p>
        <p>GOOGL 25 shares @ $120.00</p>
    </div>
</body>
</html>
"""

# No data (should fail gracefully)
SAMPLE_HTML_EMPTY = """
<html>
<head><title>Portfolio</title></head>
<body>
    <div class="portfolio">
        <h1>No holdings</h1>
        <p>Your portfolio is empty</p>
    </div>
</body>
</html>
"""


# ===================================================================
# TEST FUNCTIONS
# ===================================================================

def test_strategy_1_json():
    """Test Strategy 1: JSON extraction from <script> tags"""
    print_test_header("Strategy 1: JSON Extraction from <script> Tags")

    result = ImprovedInvestopediaScraper.parse_portfolio_multi_strategy(SAMPLE_HTML_WITH_JSON)

    if result and result.get('holdings'):
        holdings = result['holdings']
        print_success(f"Found {len(holdings)} holdings via JSON extraction")

        for holding in holdings:
            print(f"  • {holding['ticker']}: {holding['shares']} shares @ ${holding['current_price']:.2f}")

        # Verify data accuracy
        assert holdings[0]['ticker'] == 'AAPL', "Ticker mismatch"
        assert holdings[0]['shares'] == 100, "Shares mismatch"
        assert holdings[1]['ticker'] == 'MSFT', "Ticker mismatch"

        print_success("Data accuracy verified ✓")
        return True
    else:
        print_failure("Failed to extract JSON data")
        return False


def test_strategy_2_table():
    """Test Strategy 2: HTML table parsing"""
    print_test_header("Strategy 2: HTML Table Parsing with Smart Column Detection")

    result = ImprovedInvestopediaScraper.parse_portfolio_multi_strategy(SAMPLE_HTML_WITH_TABLE)

    if result and result.get('holdings'):
        holdings = result['holdings']
        print_success(f"Found {len(holdings)} holdings via table parsing")

        for holding in holdings:
            ticker = holding.get('ticker', 'N/A')
            shares = holding.get('shares', 0)
            current_price = holding.get('current_price', 0)
            market_value = holding.get('market_value', 0)
            print(f"  • {ticker}: {shares} shares @ ${current_price:.2f} = ${market_value:,.2f}")

        # Verify data
        assert holdings[0]['ticker'] == 'AAPL', "Ticker mismatch"
        assert holdings[0]['shares'] == 100, "Shares mismatch"
        assert holdings[0]['current_price'] == 150.00, "Price mismatch"

        print_success("Data accuracy verified ✓")
        return True
    else:
        print_failure("Failed to parse HTML table")
        return False


def test_strategy_3_data_attrs():
    """Test Strategy 3: Data attributes"""
    print_test_header("Strategy 3: Data Attribute Parsing")

    result = ImprovedInvestopediaScraper.parse_portfolio_multi_strategy(SAMPLE_HTML_WITH_DATA_ATTRS)

    if result and result.get('holdings'):
        holdings = result['holdings']
        print_success(f"Found {len(holdings)} holdings via data attributes")

        for holding in holdings:
            print(f"  • {holding['ticker']}: {holding['shares']} shares @ ${holding['current_price']:.2f}")

        assert holdings[0]['ticker'] == 'AAPL', "Ticker mismatch"

        print_success("Data accuracy verified ✓")
        return True
    else:
        print_failure("Failed to parse data attributes")
        return False


def test_strategy_4_regex():
    """Test Strategy 4: Regex text extraction"""
    print_test_header("Strategy 4: Regex Text Extraction (Last Resort)")

    result = ImprovedInvestopediaScraper.parse_portfolio_multi_strategy(SAMPLE_HTML_WITH_TEXT)

    if result and result.get('holdings'):
        holdings = result['holdings']
        print_success(f"Found {len(holdings)} holdings via regex extraction")

        for holding in holdings:
            ticker = holding.get('ticker', 'N/A')
            shares = holding.get('shares', 0)
            current_price = holding.get('current_price', 0)
            market_value = holding.get('market_value', 0)
            print(f"  • {ticker}: {shares} shares @ ${current_price:.2f} = ${market_value:,.2f}")

        # Verify data
        assert holdings[0]['ticker'] == 'AAPL', "Ticker mismatch"
        assert holdings[0]['shares'] == 100, "Shares mismatch"

        print_success("Data accuracy verified ✓")
        return True
    else:
        print_failure("Failed to extract data via regex")
        return False


def test_empty_portfolio():
    """Test handling of empty portfolio"""
    print_test_header("Empty Portfolio Handling")

    result = ImprovedInvestopediaScraper.parse_portfolio_multi_strategy(SAMPLE_HTML_EMPTY)

    if result is None or not result.get('holdings'):
        print_success("Correctly handled empty portfolio (no data found)")
        return True
    else:
        print_failure("Should not have found data in empty portfolio")
        return False


def test_diagnostic_analysis():
    """Test diagnostic HTML analysis"""
    print_test_header("Diagnostic HTML Analysis")

    # Create mock session object
    class MockSession:
        def get(self, url, timeout=10):
            class MockResponse:
                text = SAMPLE_HTML_WITH_TABLE
            return MockResponse()

    # Test structure analysis
    soup = BeautifulSoup(SAMPLE_HTML_WITH_TABLE, 'html.parser')
    diag = InvestopediaDiagnostics(MockSession())

    # Analyze page structure
    analysis = diag.analyze_page_structure(SAMPLE_HTML_WITH_TABLE)

    print_info(f"Tables found: {analysis['tables_found']}")
    for table_info in analysis['table_info']:
        print(f"  Table {table_info['index']}: {table_info['rows']} rows")
        print(f"    Headers: {', '.join(table_info['headers'])}")

    print_info(f"Scripts with JSON: {analysis['scripts_with_json']}")
    print_info(f"API endpoints: {len(analysis['api_endpoints'])}")

    # Test data finding
    findings = diag.find_data_in_html(SAMPLE_HTML_WITH_TABLE)

    print(f"\n  Account value found: {findings['account_value_found']}")
    print(f"  Cash found: {findings['cash_found']}")
    print(f"  Holdings found: {findings['holdings_found']}")

    if findings['account_value_found'] or findings['cash_found']:
        print_success("Diagnostic analysis working correctly")
        return True
    else:
        print_failure("Diagnostic analysis failed to find expected data")
        return False


def test_fallback_mechanism():
    """Test that strategies try in correct order"""
    print_test_header("Strategy Fallback Mechanism")

    # HTML with both JSON and table (should prefer JSON)
    html_both = f"""
    <html>
    <body>
        <script>
            window.portfolioData = {{"holdings": [{{"ticker": "JSON", "shares": 999}}]}};
        </script>
        <table>
            <tr><th>Symbol</th><th>Shares</th></tr>
            <tr><td>TABLE</td><td>888</td></tr>
        </table>
    </body>
    </html>
    """

    result = ImprovedInvestopediaScraper.parse_portfolio_multi_strategy(html_both)

    if result and result['holdings'][0]['ticker'] == 'JSON':
        print_success("Correctly prioritized JSON strategy over table parsing")
        return True
    else:
        print_failure("Fallback mechanism not working correctly")
        return False


# ===================================================================
# RUN ALL TESTS
# ===================================================================

def run_all_tests():
    """Run complete test suite"""
    print(f"\n{BLUE}{'=' * 80}{RESET}")
    print(f"{BLUE}ATLAS INVESTOPEDIA DIAGNOSTIC TEST SUITE{RESET}")
    print(f"{BLUE}{'=' * 80}{RESET}\n")

    print_info("Testing multi-strategy scraper with 4 different parsing methods...")

    tests = [
        ("Strategy 1 - JSON Extraction", test_strategy_1_json),
        ("Strategy 2 - HTML Table Parsing", test_strategy_2_table),
        ("Strategy 3 - Data Attributes", test_strategy_3_data_attrs),
        ("Strategy 4 - Regex Extraction", test_strategy_4_regex),
        ("Empty Portfolio Handling", test_empty_portfolio),
        ("Diagnostic Analysis", test_diagnostic_analysis),
        ("Fallback Mechanism", test_fallback_mechanism)
    ]

    results = []

    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print_failure(f"Test crashed: {e}")
            results.append((test_name, False))

    # Print summary
    print(f"\n{BLUE}{'=' * 80}{RESET}")
    print(f"{BLUE}TEST SUMMARY{RESET}")
    print(f"{BLUE}{'=' * 80}{RESET}\n")

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for test_name, result in results:
        status = f"{GREEN}✅ PASS{RESET}" if result else f"{RED}❌ FAIL{RESET}"
        print(f"{status} - {test_name}")

    print(f"\n{BLUE}Results: {passed}/{total} tests passed{RESET}")

    if passed == total:
        print(f"\n{GREEN}{'=' * 80}{RESET}")
        print(f"{GREEN}🎉 ALL TESTS PASSED! 🎉{RESET}")
        print(f"{GREEN}{'=' * 80}{RESET}\n")
        print_success("Multi-strategy scraper is working perfectly!")
        print_info("Ready for production use with Investopedia integration")
        return 0
    else:
        print(f"\n{RED}{'=' * 80}{RESET}")
        print(f"{RED}⚠️  SOME TESTS FAILED{RESET}")
        print(f"{RED}{'=' * 80}{RESET}\n")
        print_failure(f"{total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
