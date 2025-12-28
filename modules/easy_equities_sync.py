"""
Easy Equities Portfolio Sync Module
Converts Easy Equities holdings to ATLAS DataFrame format

This module provides functions to:
- Authenticate with Easy Equities
- Retrieve portfolio holdings
- Convert holdings to ATLAS-compatible DataFrame format
- Get account summaries and valuations
"""

from easy_equities_client.clients import EasyEquitiesClient
import pandas as pd
import re
from typing import Dict, List, Optional


def parse_zar_value(value_str: str) -> float:
    """
    Parse ZAR currency string to float

    Easy Equities returns currency values as formatted strings:
    - "R2,500.00" -> 2500.00
    - "R12 000.00" -> 12000.00 (space separator)
    - "R123 456.78" -> 123456.78

    Args:
        value_str: Currency string from Easy Equities (e.g., "R2,500.00")

    Returns:
        Float value without currency symbol or formatting

    Example:
        >>> parse_zar_value("R2,500.00")
        2500.0
        >>> parse_zar_value("R12 000.00")
        12000.0
    """
    try:
        # Remove 'R' symbol, spaces, and commas
        cleaned = value_str.replace('R', '').replace(' ', '').replace(',', '')
        return float(cleaned)
    except (ValueError, AttributeError):
        return 0.0


def sync_easy_equities_portfolio(
    username: str,
    password: str,
    account_index: int = 0
) -> pd.DataFrame:
    """
    Sync portfolio from Easy Equities and convert to ATLAS format

    This is the main function for retrieving portfolio data from Easy Equities
    and converting it to the standardized ATLAS DataFrame format that matches
    the Excel upload structure.

    Args:
        username: Easy Equities username
        password: Easy Equities password
        account_index: Which account to sync (default: 0 = first account)
                      Use list_available_accounts() to see all accounts

    Returns:
        DataFrame in ATLAS format with columns:
        - Ticker: Stock/ETF ticker symbol (e.g., "EQU.ZA.STXNDQ")
        - Name: Full security name
        - Shares: Number of shares/units owned
        - Cost_Basis: Average purchase price per share
        - Current_Price: Latest market price per share
        - Market_Value: Total current value (Shares × Current_Price)
        - Purchase_Value: Total amount invested
        - Unrealized_PnL: Profit/loss in currency (Market_Value - Purchase_Value)
        - Unrealized_PnL_Pct: Profit/loss as percentage
        - ISIN: International Securities Identification Number

    Raises:
        Exception: If authentication fails, no accounts found, or no holdings

    Example:
        >>> df = sync_easy_equities_portfolio("username", "password")
        >>> print(f"Synced {len(df)} positions")
        >>> print(df[['Ticker', 'Shares', 'Market_Value']].head())
    """

    # 1. Authenticate with Easy Equities
    client = EasyEquitiesClient()
    try:
        client.login(username=username, password=password)
    except Exception as e:
        raise Exception(f"Authentication failed: {str(e)}")

    # 2. Get user's accounts
    accounts = client.accounts.list()

    if not accounts:
        raise Exception("No accounts found for this user")

    if account_index >= len(accounts):
        raise Exception(
            f"Account index {account_index} out of range. "
            f"User has {len(accounts)} account(s). "
            f"Valid indices: 0-{len(accounts)-1}"
        )

    account = accounts[account_index]

    # 3. Get holdings from selected account
    # Try with include_shares=True first (best), fallback to False if it fails
    import streamlit as st

    holdings = None
    include_shares_worked = False

    try:
        st.info("🔄 Attempting to fetch holdings with share counts (include_shares=True)...")
        holdings = client.accounts.holdings(account.id, include_shares=True)
        include_shares_worked = True
        st.success("✅ Successfully fetched holdings with share counts!")
    except Exception as e:
        st.warning(f"⚠️ Failed with include_shares=True: {str(e)}")
        st.info("🔄 Retrying without share counts (include_shares=False)...")
        try:
            holdings = client.accounts.holdings(account.id, include_shares=False)
            st.success("✅ Successfully fetched holdings (without share counts, will calculate)")
        except Exception as e2:
            raise Exception(
                f"Failed to retrieve holdings from Easy Equities.\n\n"
                f"Error with include_shares=True: {str(e)}\n"
                f"Error with include_shares=False: {str(e2)}\n\n"
                f"This might indicate:\n"
                f"- Easy Equities website structure changed\n"
                f"- Account authentication issue\n"
                f"- Network connectivity problem\n"
                f"- Library needs updating"
            )

    if not holdings:
        raise Exception(
            f"No holdings found in account: {account.name} (ID: {account.id}). "
            f"This account appears to be empty."
        )

    # 4. Convert holdings to ATLAS DataFrame format
    portfolio_data = []

    # DIAGNOSTIC: Show raw API data for first holding
    import streamlit as st
    if holdings:
        st.write("🔍 **DEBUG: Raw Easy Equities API Response (First Position)**")
        st.json(holdings[0])  # Show raw JSON from API
        st.write("---")

    for holding in holdings:
        # Extract raw data from Easy Equities format
        ticker = holding.get('contract_code', 'UNKNOWN')
        name = holding.get('name', 'Unknown Security')

        # DIAGNOSTIC: Show raw values before parsing
        st.write(f"**{ticker} - Raw API Values:**")
        st.write(f"- purchase_value (raw): `{holding.get('purchase_value')}`")
        st.write(f"- current_value (raw): `{holding.get('current_value')}`")
        st.write(f"- current_price (raw): `{holding.get('current_price')}`")
        st.write(f"- shares (raw): `{holding.get('shares', 'NOT PROVIDED')}`")

        # ROBUST FIX: Use total values directly, get shares from API if available
        # Parse ZAR currency values (totals are always correct)
        purchase_value = parse_zar_value(holding.get('purchase_value', 'R0'))
        current_value = parse_zar_value(holding.get('current_value', 'R0'))

        # Get shares from API if available (include_shares=True succeeded)
        shares = holding.get('shares', 0) if include_shares_worked else 0

        # If shares not provided by API, calculate from current_value / current_price
        if shares == 0:
            current_price_raw = parse_zar_value(holding.get('current_price', 'R0'))
            if current_price_raw > 0:
                shares = current_value / current_price_raw
                st.info(f"ℹ️ {ticker}: Calculated shares from totals ({current_value} / {current_price_raw} = {shares:.2f})")
            else:
                st.error(f"❌ {ticker}: Cannot determine shares (no price data)")
                shares = 0

        st.write(f"**After parsing:**")
        st.write(f"- purchase_value: R{purchase_value:,.2f}")
        st.write(f"- current_value: R{current_value:,.2f}")
        st.write(f"- shares: {shares}")

        # Calculate per-share values FROM totals (not from API prices which might be wrong format)
        cost_basis = purchase_value / shares if shares > 0 else 0
        current_price = current_value / shares if shares > 0 else 0

        st.write(f"**Calculated per-share values (from totals):**")
        st.write(f"- cost_basis: R{cost_basis:,.2f} (purchase_value / shares)")
        st.write(f"- current_price: R{current_price:,.2f} (current_value / shares)")
        st.write(f"**Verification:** {shares} × R{current_price:,.2f} = R{shares * current_price:,.2f} (should equal current_value: R{current_value:,.2f})")
        st.write("---")

        # Calculate profit/loss metrics
        unrealized_pnl = current_value - purchase_value
        unrealized_pnl_pct = (unrealized_pnl / purchase_value * 100) if purchase_value > 0 else 0

        # Build ATLAS-format record
        portfolio_data.append({
            'Ticker': ticker,
            'Name': name,
            'Shares': round(shares, 6),  # Round to avoid floating point precision issues
            'Cost_Basis': round(cost_basis, 2),
            'Current_Price': round(current_price, 2),
            'Market_Value': round(current_value, 2),
            'Purchase_Value': round(purchase_value, 2),
            'Unrealized_PnL': round(unrealized_pnl, 2),
            'Unrealized_PnL_Pct': round(unrealized_pnl_pct, 2),
            'ISIN': holding.get('isin', 'N/A')
        })

    # 5. Create DataFrame
    df = pd.DataFrame(portfolio_data)

    # DIAGNOSTIC: Verify EE sync output (remove after debugging)
    import streamlit as st
    st.write("🔍 **DEBUG: Easy Equities Sync Output**")
    st.write(f"Number of positions: {len(df)}")
    st.write(f"Columns: {df.columns.tolist()}")

    # Check totals IMMEDIATELY after sync
    st.write("📊 **Totals from EE Sync (should match EE app exactly):**")
    st.write(f"- Market_Value sum: R{df['Market_Value'].sum():,.2f}")
    st.write(f"- Purchase_Value sum: R{df['Purchase_Value'].sum():,.2f}")
    st.write(f"- Unrealized_PnL sum: R{df['Unrealized_PnL'].sum():,.2f}")
    st.write(f"- Unrealized_PnL %: {(df['Unrealized_PnL'].sum() / df['Purchase_Value'].sum() * 100):.2f}%")

    # Show first 3 rows for verification
    st.write("**First 3 positions:**")
    st.dataframe(df.head(3)[['Ticker', 'Shares', 'Current_Price', 'Market_Value', 'Purchase_Value', 'Unrealized_PnL_Pct']])

    st.warning("⚠️ **VERIFY:** Does Market_Value sum match your Easy Equities app? If NO, EE sync is broken. If YES, ATLAS is corrupting it later.")

    # 6. Add metadata as DataFrame attributes
    df.attrs['source'] = 'easy_equities'
    df.attrs['account_name'] = account.name
    df.attrs['account_id'] = account.id
    df.attrs['sync_timestamp'] = pd.Timestamp.now()
    df.attrs['total_positions'] = len(df)
    df.attrs['total_market_value'] = df['Market_Value'].sum()
    df.attrs['total_purchase_value'] = df['Purchase_Value'].sum()
    df.attrs['total_unrealized_pnl'] = df['Unrealized_PnL'].sum()

    # Currency metadata (Phase 1 Fix)
    df.attrs['currency'] = 'ZAR'
    df.attrs['currency_symbol'] = 'R'
    df.attrs['has_trade_history'] = False  # EE sync provides snapshot only

    return df


def get_account_summary(
    username: str,
    password: str,
    account_index: int = 0
) -> Dict:
    """
    Get high-level account summary from Easy Equities

    Retrieves account-level financial information including total value,
    profit/loss, and investment type breakdown.

    Args:
        username: Easy Equities username
        password: Easy Equities password
        account_index: Which account to query (default: 0)

    Returns:
        Dictionary containing:
        - account_name: Account display name
        - account_id: Internal account ID
        - account_value: Total account value (float)
        - account_number: Account number string (e.g., "EE987231-4044331")
        - currency: Currency code (e.g., "ZAR")
        - period_movements: List of P&L movements

    Example:
        >>> summary = get_account_summary("username", "password")
        >>> print(f"Account Value: R{summary['account_value']:,.2f}")
    """
    client = EasyEquitiesClient()
    client.login(username=username, password=password)

    accounts = client.accounts.list()
    if account_index >= len(accounts):
        raise Exception(f"Account index {account_index} out of range")

    account = accounts[account_index]

    # Get detailed valuations
    valuations = client.accounts.valuations(account.id)
    summary = valuations.get('TopSummary', {})

    return {
        'account_name': account.name,
        'account_id': account.id,
        'account_value': summary.get('AccountValue', 0),
        'account_number': summary.get('AccountNumber', 'N/A'),
        'currency': summary.get('AccountCurrency', 'ZAR'),
        'period_movements': summary.get('PeriodMovements', [])
    }


def list_available_accounts(username: str, password: str) -> List[Dict]:
    """
    List all available Easy Equities accounts for a user

    Useful for displaying account selector in UI when user has multiple accounts
    (e.g., EasyEquities ZAR, TFSA, USD, AUD, EasyProperties, etc.)

    Args:
        username: Easy Equities username
        password: Easy Equities password

    Returns:
        List of dictionaries, each containing:
        - index: Array index (use this for account_index parameter)
        - id: Internal account ID
        - name: Account display name
        - currency_id: Trading currency ID

    Example:
        >>> accounts = list_available_accounts("username", "password")
        >>> for acc in accounts:
        ...     print(f"{acc['index']}: {acc['name']} (ID: {acc['id']})")
        0: EasyEquities ZAR (ID: 4044332)
        1: TFSA (ID: 4044333)
        2: EasyEquities USD (ID: 4044335)
    """
    client = EasyEquitiesClient()
    client.login(username=username, password=password)

    accounts = client.accounts.list()

    return [
        {
            'index': i,
            'id': acc.id,
            'name': acc.name,
            'currency_id': acc.trading_currency_id
        }
        for i, acc in enumerate(accounts)
    ]


def validate_credentials(username: str, password: str) -> bool:
    """
    Validate Easy Equities credentials without fetching data

    Useful for pre-validating credentials before attempting full sync.

    Args:
        username: Easy Equities username
        password: Easy Equities password

    Returns:
        True if credentials are valid, False otherwise

    Example:
        >>> if validate_credentials("username", "password"):
        ...     print("Credentials valid!")
        ... else:
        ...     print("Invalid credentials")
    """
    try:
        client = EasyEquitiesClient()
        client.login(username=username, password=password)
        # If login succeeds, try to list accounts to confirm full access
        accounts = client.accounts.list()
        return len(accounts) > 0
    except:
        return False


# Module metadata
__all__ = [
    'sync_easy_equities_portfolio',
    'get_account_summary',
    'list_available_accounts',
    'validate_credentials',
    'parse_zar_value'
]

__version__ = '1.0.0'
__author__ = 'ATLAS Terminal Development Team'
