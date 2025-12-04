# 🔐 ATLAS Terminal - Investopedia Integration Guide

## Overview

Automatically sync your Investopedia portfolio to ATLAS Terminal - **no more manual copy-paste!**

**Features:**
- ✅ Automatic login with embedded credentials
- ✅ 2FA email verification support
- ✅ Live portfolio data fetching
- ✅ Auto-sync every N minutes
- ✅ Session persistence
- ✅ Multi-strategy HTML scraping
- ✅ Diagnostic tools for troubleshooting

---

## 🚀 Quick Start (5 Minutes)

### **Step 1: Your Credentials**

The integration comes with your credentials embedded:
```python
INVESTOPEDIA_EMAIL = "davenompozolo@gmail.com"
INVESTOPEDIA_PASSWORD = "Hlobo1hlobo@123"
```

**⚠️ Security Note:** These are embedded for development. For production, move to environment variables (see Security section).

---

### **Step 2: Basic Usage**
```python
from investopedia_integration.atlas_investopedia_production_2fa import (
    InvestopediaSession
)

# Create session
session = InvestopediaSession(
    email="davenompozolo@gmail.com",
    password="Hlobo1hlobo@123"
)

# Login
success, status = session.login()

if status == 'needs_2fa':
    # Check your email for verification code
    code = input("Enter 2FA code: ")
    success, status = session.verify_2fa(code)

if success:
    # Fetch portfolio data
    portfolio_data = session.get_portfolio_data()

    print(f"Account Value: ${portfolio_data['account_summary']['account_value']:,.2f}")
    print(f"Holdings: {len(portfolio_data['holdings'])}")

    for holding in portfolio_data['holdings']:
        print(f"  {holding['ticker']}: {holding['shares']} shares @ ${holding['current_price']:.2f}")
```

---

### **Step 3: Streamlit Integration**
```python
import streamlit as st
from investopedia_integration.atlas_investopedia_production_2fa import (
    setup_investopedia_live_feed,
    display_investopedia_portfolio
)

# In your Streamlit app
def main():
    st.title("🔐 Investopedia Live Feed")

    # Setup live feed in sidebar (handles login, 2FA, sync)
    portfolio_data = setup_investopedia_live_feed()

    # Display portfolio in main area
    display_investopedia_portfolio(portfolio_data)
```

**That's it! The UI handles everything:**
- Login button
- 2FA code input
- Sync button
- Auto-refresh toggle
- Connection status

---

## 🔐 Authentication Flow

### **Flow Diagram:**
```
1. Click "CONNECT TO INVESTOPEDIA"
   ↓
2. System attempts login with embedded credentials
   ↓
3a. Success → ✅ Connected
   OR
3b. 2FA Required → Show code input
   ↓
4. User enters 6-digit code from email
   ↓
5. System verifies code
   ↓
6. ✅ Connected & Authenticated
```

### **Session Persistence:**

Sessions are saved to `investopedia_session.pkl` and automatically restored on next launch.
```python
# Session automatically saves on successful login
session.login()  # Saves cookies to file

# On next run, session loads automatically
session = InvestopediaSession(email, password)
session.login()  # Uses saved cookies if still valid
```

---

## 📊 Data Returned

### **Portfolio Data Structure:**
```python
portfolio_data = {
    'holdings': [
        {
            'ticker': 'AAPL',
            'shares': 100,
            'current_price': 150.25,
            'market_value': 15025.00,
            'purchase_price': 145.00  # If available
        },
        # ... more holdings
    ],
    'account_summary': {
        'account_value': 50000.00,
        'cash': 5000.00,
        'buying_power': 10000.00
    },
    'timestamp': datetime(2024, 12, 4, 15, 30, 0),
    'success': True
}
```

### **Error Handling:**
```python
portfolio_data = session.get_portfolio_data()

if portfolio_data['success']:
    # Use data
    holdings = portfolio_data['holdings']
else:
    # Handle error
    error = portfolio_data.get('error', 'Unknown error')
    print(f"Failed to fetch: {error}")
```

---

## 🔧 Advanced Features

### **1. Auto-Sync**
```python
import time
from datetime import datetime, timedelta

# Auto-sync every 5 minutes
SYNC_INTERVAL = 300  # seconds

last_sync = datetime.now()

while True:
    if (datetime.now() - last_sync).total_seconds() >= SYNC_INTERVAL:
        portfolio_data = session.get_portfolio_data()

        if portfolio_data['success']:
            print(f"✅ Synced at {datetime.now()}")
            last_sync = datetime.now()
        else:
            print(f"❌ Sync failed")

    time.sleep(60)  # Check every minute
```

### **2. Session Validation**
```python
# Check if session is still valid before fetching
if session._verify_session():
    portfolio_data = session.get_portfolio_data()
else:
    # Re-login required
    success, status = session.login(force_new=True)
```

### **3. Custom Parsing**

If the default scraper doesn't work, use the diagnostic version:
```python
from investopedia_integration.atlas_investopedia_diagnostics import (
    ImprovedInvestopediaScraper
)

scraper = ImprovedInvestopediaScraper(session.session)

# Try multiple strategies
html = session.session.get("https://www.investopedia.com/simulator/portfolio").text
holdings = scraper.parse_portfolio_multi_strategy(html)

if holdings:
    print(f"✅ Found {len(holdings)} holdings")
else:
    print("❌ No holdings found - check diagnostics")
```

---

## 🔍 Troubleshooting

### **Problem 1: Login Fails**

**Symptoms:**
- Login returns `('failed', 'error: ...')`
- "Invalid credentials" message

**Solutions:**
```python
# 1. Check credentials
print(f"Email: {session.email}")
print(f"Password: {'*' * len(session.password)}")

# 2. Try manual login on Investopedia.com
# - Verify account is active
# - Check if password changed

# 3. Force new login
success, status = session.login(force_new=True)
```

---

### **Problem 2: 2FA Code Invalid**

**Symptoms:**
- Verification fails with `'invalid_code'`
- "Code expired" message

**Solutions:**
```python
# 1. Check email for latest code
# - Codes expire after ~5 minutes
# - Make sure using most recent code

# 2. Request new code
# - Login again to trigger new 2FA email
success, status = session.login(force_new=True)

# 3. Check for typos
code = input("Enter code: ").strip()  # Remove spaces
assert len(code) == 6, "Code must be 6 digits"
assert code.isdigit(), "Code must be numeric"
```

---

### **Problem 3: No Holdings Found**

**Symptoms:**
- Login successful
- `portfolio_data['holdings']` is empty list
- "⚠️ No holdings found" message

**Solutions:**
```python
# 1. Run diagnostics
from investopedia_integration.atlas_investopedia_diagnostics import (
    InvestopediaDiagnostics
)

diagnostics = InvestopediaDiagnostics(session.session)

# Save HTML for inspection
success, size = diagnostics.save_portfolio_html("portfolio_debug.html")
print(f"Saved {size} bytes to portfolio_debug.html")

# Analyze structure
html = open("portfolio_debug.html").read()
analysis = diagnostics.analyze_page_structure(html)

print(f"Tables found: {analysis['tables_found']}")
print(f"Scripts with JSON: {analysis['scripts_with_json']}")

# 2. Check if portfolio is actually empty
# - Login to Investopedia.com manually
# - Verify you have holdings

# 3. Try improved scraper
scraper = ImprovedInvestopediaScraper(session.session)
holdings = scraper.parse_portfolio_multi_strategy(html)
```

---

### **Problem 4: Session Expires**

**Symptoms:**
- Initial login works
- Later fetches redirect to login page
- `session.authenticated = False`

**Solutions:**
```python
# 1. Check session validity
if not session._verify_session():
    print("Session expired - re-logging in")
    session.login(force_new=True)

# 2. Implement auto-refresh
def get_portfolio_with_retry():
    portfolio_data = session.get_portfolio_data()

    if not portfolio_data or not portfolio_data['success']:
        # Session might be expired
        print("Retrying with fresh login...")
        session.login(force_new=True)
        portfolio_data = session.get_portfolio_data()

    return portfolio_data

# 3. Increase session persistence
# Sessions typically last 24 hours
# Delete investopedia_session.pkl to force new login
```

---

## 📋 Diagnostic Tools

### **1. Save Portfolio HTML**
```python
from investopedia_integration.atlas_investopedia_diagnostics import (
    InvestopediaDiagnostics
)

diagnostics = InvestopediaDiagnostics(session.session)
diagnostics.save_portfolio_html("portfolio.html")

# Now open portfolio.html in browser to inspect
```

### **2. Analyze Page Structure**
```python
html = open("portfolio.html").read()
analysis = diagnostics.analyze_page_structure(html)

print("📊 Page Analysis:")
print(f"  Tables: {analysis['tables_found']}")
for idx, table_info in enumerate(analysis['table_info']):
    print(f"  Table {idx}:")
    print(f"    Headers: {table_info['headers']}")
    print(f"    Rows: {table_info['rows']}")

print(f"\n  Scripts with JSON: {analysis['scripts_with_json']}")
print(f"  API endpoints: {len(analysis['api_endpoints'])}")
```

### **3. Find Specific Data**
```python
findings = diagnostics.find_data_in_html(html)

print("🔍 Data Found:")
print(f"  Account Value: {'✅' if findings['account_value_found'] else '❌'}")
print(f"  Cash: {'✅' if findings['cash_found'] else '❌'}")
print(f"  Holdings: {'✅' if findings['holdings_found'] else '❌'}")

if findings['tickers_found']:
    print(f"  Tickers: {', '.join(findings['tickers_found'])}")
```

### **4. Test All Scraping Strategies**
```python
from investopedia_integration.atlas_investopedia_diagnostics import (
    ImprovedInvestopediaScraper
)

scraper = ImprovedInvestopediaScraper(session.session)

# Strategy 1: JSON extraction
holdings = scraper._strategy_json_extraction(html)
print(f"Strategy 1 (JSON): {len(holdings) if holdings else 0} holdings")

# Strategy 2: Table parsing
holdings = scraper._strategy_table_parsing(html)
print(f"Strategy 2 (Table): {len(holdings) if holdings else 0} holdings")

# Strategy 3: Data attributes
holdings = scraper._strategy_data_attributes(html)
print(f"Strategy 3 (Attributes): {len(holdings) if holdings else 0} holdings")

# Strategy 4: Regex extraction
holdings = scraper._strategy_regex_extraction(html)
print(f"Strategy 4 (Regex): {len(holdings) if holdings else 0} holdings")

# Use best strategy
holdings = scraper.parse_portfolio_multi_strategy(html)
print(f"\n✅ Best result: {len(holdings) if holdings else 0} holdings")
```

---

## 🔒 Security Best Practices

### **Development (Current Setup):**
```python
# Credentials embedded in code (convenient for testing)
INVESTOPEDIA_EMAIL = "davenompozolo@gmail.com"
INVESTOPEDIA_PASSWORD = "Hlobo1hlobo@123"
```

### **Production (Recommended):**
```python
# 1. Use environment variables
import os

INVESTOPEDIA_EMAIL = os.getenv('INVESTOPEDIA_EMAIL')
INVESTOPEDIA_PASSWORD = os.getenv('INVESTOPEDIA_PASSWORD')

# 2. Or use Streamlit secrets
# Create .streamlit/secrets.toml:
# investopedia_email = "davenompozolo@gmail.com"
# investopedia_password = "Hlobo1hlobo@123"

import streamlit as st
INVESTOPEDIA_EMAIL = st.secrets["investopedia_email"]
INVESTOPEDIA_PASSWORD = st.secrets["investopedia_password"]

# 3. Or use encrypted config file
from cryptography.fernet import Fernet

def load_encrypted_credentials():
    key = os.getenv('ENCRYPTION_KEY')
    cipher = Fernet(key)

    with open('credentials.enc', 'rb') as f:
        encrypted = f.read()

    decrypted = cipher.decrypt(encrypted)
    email, password = decrypted.decode().split('|')

    return email, password
```

### **Never:**
- ❌ Commit credentials to public GitHub
- ❌ Share credentials in logs or error messages
- ❌ Store credentials in plain text files

---

## 📊 Integration with ATLAS Portfolio

### **Sync to ATLAS Portfolio:**
```python
def sync_investopedia_to_atlas():
    """Sync Investopedia portfolio to ATLAS"""

    # Fetch from Investopedia
    portfolio_data = session.get_portfolio_data()

    if not portfolio_data['success']:
        return None

    # Convert to ATLAS format
    atlas_portfolio = []

    for holding in portfolio_data['holdings']:
        atlas_portfolio.append({
            'ticker': holding['ticker'],
            'shares': holding['shares'],
            'current_price': holding['current_price'],
            'market_value': holding['market_value'],
            'source': 'Investopedia',
            'last_updated': portfolio_data['timestamp']
        })

    # Update ATLAS session state
    st.session_state.portfolio = pd.DataFrame(atlas_portfolio)
    st.session_state.last_sync = portfolio_data['timestamp']

    return atlas_portfolio

# Use in Streamlit
if st.button("🔄 Sync from Investopedia"):
    with st.spinner("Syncing..."):
        portfolio = sync_investopedia_to_atlas()

        if portfolio:
            st.success(f"✅ Synced {len(portfolio)} positions")
            st.rerun()
        else:
            st.error("❌ Sync failed")
```

---

## 🎯 Best Practices

### **1. Error Handling**
```python
# Always wrap in try-except
try:
    portfolio_data = session.get_portfolio_data()

    if portfolio_data and portfolio_data['success']:
        # Process data
        pass
    else:
        # Handle fetch failure
        error = portfolio_data.get('error') if portfolio_data else 'Unknown'
        st.warning(f"Fetch failed: {error}")

except Exception as e:
    st.error(f"Unexpected error: {e}")
    # Log for debugging
    import traceback
    traceback.print_exc()
```

### **2. Rate Limiting**
```python
# Don't spam Investopedia servers
from datetime import datetime, timedelta

MIN_SYNC_INTERVAL = 60  # 1 minute minimum

if 'last_investopedia_sync' not in st.session_state:
    st.session_state.last_investopedia_sync = datetime.min

def can_sync():
    now = datetime.now()
    elapsed = (now - st.session_state.last_investopedia_sync).total_seconds()
    return elapsed >= MIN_SYNC_INTERVAL

if can_sync():
    portfolio_data = session.get_portfolio_data()
    st.session_state.last_investopedia_sync = datetime.now()
else:
    st.info("Please wait before syncing again")
```

### **3. User Feedback**
```python
# Always show sync status
with st.sidebar:
    if 'investopedia_portfolio' in st.session_state:
        last_sync = st.session_state.investopedia_portfolio['timestamp']
        st.success(f"🟢 Connected")
        st.caption(f"Last sync: {last_sync.strftime('%H:%M:%S')}")
    else:
        st.info("🔴 Not connected")
```

---

## ✅ Success Checklist

Your Investopedia integration is working when:

- [ ] Login succeeds without errors
- [ ] 2FA verification works (if triggered)
- [ ] Portfolio data fetches successfully
- [ ] Holdings list is not empty
- [ ] Account summary shows correct values
- [ ] Session persists across restarts
- [ ] Auto-sync works
- [ ] No errors in Streamlit console

---

## 🆘 Need Help?

**Check these resources:**
1. `atlas_investopedia_production_2fa.py` - Main integration code
2. `atlas_investopedia_diagnostics.py` - Diagnostic tools
3. Integration examples in main application
4. GitHub issues on repository

**Common fixes:**
- Delete `investopedia_session.pkl` to force fresh login
- Run diagnostic tools to inspect HTML
- Check Investopedia.com manually to verify account status
- Review error messages in console

**You've got this! 🚀**
