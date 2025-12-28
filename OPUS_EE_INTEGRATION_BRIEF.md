# OPUS - Easy Equities Integration Fix Brief

## CRITICAL ISSUE SUMMARY

Easy Equities (EE) sync produces **correct data** (R79,738.30), but Portfolio Home and other Atlas modules are **corrupting it with 100x scaling** and displaying everything in **$ instead of R**.

---

## THE PROBLEM

### 1. **100x Scaling Bug (CRITICAL)**
**Symptom:** Atlas is treating ZAR values as cents and multiplying by 100

- ✅ **EE Sync Output:** R79,738.30 (CORRECT)
- ❌ **Portfolio Home Display:** R7.9M (100x too large!)
- ❌ **When EC10 removed:** R6.8M shows up

**Root Cause:** Somewhere in the data pipeline, the code assumes values are in cents (like USD often is) and multiplies by 100. ZAR values from EE API are already in Rands, NOT cents.

**Impact:** All performance metrics (returns, P&L %, drawdowns, etc.) are corrupted by 100x factor.

### 2. **Currency Display Not Pulling Through**
**Symptom:** All Atlas modules still show $ everywhere instead of R

- ✅ **Portfolio Home:** Should show R (currency_symbol='R' in attrs)
- ❌ **Reality:** Shows $ throughout all modules
- ❌ **All other Atlas pages:** Also showing $ instead of R

**Root Cause:** DataFrame attrs (currency='ZAR', currency_symbol='R') are being set in sync, but NOT being respected throughout Atlas modules.

---

## WHAT'S WORKING

### ✅ Easy Equities Sync (`modules/easy_equities_sync.py`)
**Lines 87-250** - Produces CORRECT data:

```python
# Sync output (CORRECT VALUES):
Market_Value sum: R79,738.30
Purchase_Value sum: R58,833.73
Unrealized_PnL sum: R20,904.57
Unrealized_PnL %: 35.53%

# DataFrame structure:
- Ticker: 'EQU.ZA.BTI', 'EQU.ZA.DRD', etc.
- Shares: 10.0, 40.0, etc.
- Cost_Basis: R580.00, R13.20, etc. (per share)
- Current_Price: R932.10, R58.43, etc. (per share)
- Market_Value: R9,321.00, R2,337.20, etc. (total position value)
- Purchase_Value: R5,800.00, R528.00, etc. (total cost basis)
- Unrealized_PnL: R3,521.00, R1,809.20, etc. (total P&L)
- Unrealized_PnL_Pct: 60.71%, 342.65%, etc.

# DataFrame attrs (metadata):
df.attrs['source'] = 'easy_equities'
df.attrs['currency'] = 'ZAR'
df.attrs['currency_symbol'] = 'R'
df.attrs['account_name'] = 'Demo ZAR'
```

**Key Point:** ALL VALUES FROM EE API ARE ALREADY IN RANDS (R), NOT CENTS!

### ✅ Ticker Formatting (`modules/ticker_utils.py`)
**Lines 285-340** - Functions exist to clean ticker display:

```python
def format_ticker_for_display(ticker: str) -> str:
    """Remove EQU.ZA. prefix for clean display"""
    if ticker.startswith("EQU.ZA."):
        return ticker.replace("EQU.ZA.", "")
    return ticker
```

### ✅ Recent Fix - DataFrame Attrs Preservation
**Fixed in commit 56f2444** - Portfolio Home no longer destroys attrs:

```python
# BEFORE (WRONG):
df = pd.DataFrame(portfolio_data)  # Destroyed attrs

# AFTER (CORRECT):
df = portfolio_data  # Preserves attrs
```

---

## WHAT'S BROKEN

### ❌ Issue 1: 100x Scaling Factor
**Location:** Unknown - need to find where values are being multiplied by 100

**Evidence:**
- Sync: R79,738.30 ✅
- Display: R7,900,000 (approximately) ❌
- Factor: 79,738 × 100 = 7,973,800

**Hypothesis:** There's likely code that does:
```python
# WRONG CODE (somewhere in Atlas):
display_value = raw_value * 100  # Assumes cents, but ZAR is already in Rands!
```

**Need to find:** Where this multiplication happens and REMOVE it for EE portfolios.

### ❌ Issue 2: Currency Symbol Not Respected
**Evidence:** Despite `df.attrs['currency_symbol'] = 'R'`, all displays show $

**Affected Modules:**
- Portfolio Home (atlas_app.py lines 14502+)
- v10.0 Analytics
- Risk Analysis
- Performance Suite
- All other modules that display currency values

**Current Code Pattern (lines 14516-14517):**
```python
currency_symbol = df.attrs.get('currency_symbol', '$')  # Gets 'R'
currency = df.attrs.get('currency', 'USD')  # Gets 'ZAR'
```

But then later, many places hard-code $ or ignore currency_symbol variable.

### ❌ Issue 3: Data Transformation Corrupting Values
**Location:** Likely in `create_enhanced_holdings_table()` or display functions

**The Problem:** Synced data is CORRECT. Any transformation corrupts it.

**What Should Happen:**
```python
# For EE portfolios, use values AS-IS:
total_value = df['Market_Value'].sum()  # R79,738.30 - DONE!
total_cost = df['Purchase_Value'].sum()  # R58,833.73 - DONE!
total_pnl = df['Unrealized_PnL'].sum()   # R20,904.57 - DONE!
```

**What's Actually Happening:**
```python
# Somewhere, values are being transformed:
total_value = df['Market_Value'].sum() * 100  # ❌ WRONG!
# OR
total_value = something_else_that_multiples_by_100
```

---

## CODE LOCATIONS

### 1. **Easy Equities Sync** (✅ WORKING)
**File:** `modules/easy_equities_sync.py`
**Lines:** 87-250
**Status:** Produces correct data - DO NOT MODIFY

### 2. **Portfolio Home Display** (❌ BROKEN)
**File:** `atlas_app.py`
**Lines:** 14502-14650 (approx)
**Issues:**
- 100x scaling somewhere in display logic
- Currency symbol $ hard-coded or not using variable

**Critical Section (lines 14559-14563):**
```python
total_invested = enhanced_df['Total Cost'].sum()
current_value = enhanced_df['Total Value'].sum()
total_pnl = enhanced_df['Total Gain/Loss $'].sum()    # ❌ Column name has "$"
total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0
daily_pl = enhanced_df['Daily P&L $'].sum()
```

### 3. **Enhancement Function** (⚠️ SUSPICIOUS)
**File:** `atlas_app.py`
**Lines:** 7367-7478 (`create_enhanced_holdings_table`)
**Key Section (lines 7435-7458):**
```python
else:
    # For Easy Equities portfolios, use EE's values directly - DON'T RECALCULATE!
    # Map EE columns to ATLAS display columns
    if 'Unrealized_PnL' in enhanced_df.columns:
        enhanced_df['Total Gain/Loss $'] = enhanced_df['Unrealized_PnL']

    if 'Unrealized_PnL_Pct' in enhanced_df.columns:
        enhanced_df['Total Gain/Loss %'] = enhanced_df['Unrealized_PnL_Pct']
```

**Potential Issue:** Column names have "$" but should respect currency_symbol

### 4. **Other Atlas Modules** (❌ NOT UPDATED FOR ZAR)
All other modules likely have hard-coded $ symbols:
- v10.0 Analytics
- Risk Analysis
- Performance Suite
- Market Watch
- Portfolio Deep Dive

---

## DEBUGGING APPROACH

### Step 1: Find the 100x Multiplication
**Search for patterns:**
```bash
# Search for multiplication by 100
grep -n "* 100" atlas_app.py | grep -v "percentage"

# Search for division by 100 (might be cents → dollars conversion)
grep -n "/ 100" atlas_app.py

# Search for value formatting
grep -n ",.2f" atlas_app.py | grep -i "value\|cost\|pnl"
```

**Check these functions:**
- Any formatting functions that might convert cents → dollars
- Display functions in Portfolio Home
- Anywhere `Total Value`, `Total Cost`, or `Market_Value` is used

### Step 2: Trace Data Flow
1. **Sync produces:** `Market_Value = R79,738.30`
2. **Column mapping:** `Market_Value → Total Value`
3. **Display shows:** `R7.9M` (100x too large)

**Find where the 100x happens between steps 2 and 3.**

### Step 3: Check for Currency Conversion Logic
Look for any code that tries to convert between currencies or formats values based on currency type. There might be logic like:

```python
# SUSPECTED WRONG CODE:
if currency == 'USD':
    # USD often stored in cents
    display_value = value / 100  # Convert cents to dollars
else:
    display_value = value  # Other currencies already in main unit
```

But the inverse might be happening (multiplying instead of dividing).

---

## REQUIRED FIXES

### Fix 1: Remove 100x Scaling (CRITICAL)
**Goal:** Portfolio Home shows R79,738.30 (not R7.9M)

**Action Items:**
1. Find where values are multiplied by 100
2. Add check: `if df.attrs.get('source') == 'easy_equities': # Don't multiply`
3. OR: Remove multiplication entirely if not needed

### Fix 2: Currency Symbol Throughout Atlas
**Goal:** All modules show R for ZAR portfolios, $ for USD portfolios

**Action Items:**
1. Update all display sections to use `currency_symbol` variable
2. Replace hard-coded `$` with `{currency_symbol}`
3. Ensure attrs propagate to all modules (not just Portfolio Home)

**Example Fix:**
```python
# BEFORE:
st.write(f"Total Value: ${total_value:,.2f}")

# AFTER:
currency_symbol = df.attrs.get('currency_symbol', '$')
st.write(f"Total Value: {currency_symbol}{total_value:,.2f}")
```

### Fix 3: Column Naming
**Goal:** Column names should be dynamic based on currency

**Current:**
```python
enhanced_df['Total Gain/Loss $'] = enhanced_df['Unrealized_PnL']
enhanced_df['Daily P&L $'] = 0.0
```

**Better:**
```python
currency_symbol = enhanced_df.attrs.get('currency_symbol', '$')
enhanced_df[f'Total Gain/Loss {currency_symbol}'] = enhanced_df['Unrealized_PnL']
enhanced_df[f'Daily P&L {currency_symbol}'] = 0.0
```

OR: Use generic names without currency symbol:
```python
enhanced_df['Total Gain/Loss'] = enhanced_df['Unrealized_PnL']
enhanced_df['Daily P&L'] = 0.0
```

### Fix 4: Verify No Recalculation
**Goal:** EE values used as-is, never recalculated

**Check these calculations DON'T happen for EE:**
```python
# These should ONLY happen for manual uploads, NOT for EE:
total_value = shares * current_price  # ❌ Don't do this for EE
total_cost = shares * avg_cost        # ❌ Don't do this for EE
pnl = total_value - total_cost        # ❌ Don't do this for EE

# For EE, use directly:
total_value = df['Market_Value'].sum()      # ✅ Use EE's value
total_cost = df['Purchase_Value'].sum()     # ✅ Use EE's value
pnl = df['Unrealized_PnL'].sum()            # ✅ Use EE's value
```

---

## END GOAL (SUCCESS CRITERIA)

### Portfolio Home Display:
- ✅ Portfolio Value: **R79,738.30** (not R7.9M, not $79k)
- ✅ Total Invested: **R58,833.73**
- ✅ Total P&L: **R20,904.57 (+35.53%)**
- ✅ Currency symbol: **R** everywhere (not $)
- ✅ Individual positions show correct values (e.g., BTI: R9,321)
- ✅ Individual positions show correct P&L% (e.g., DRD: +342%)
- ✅ Clean ticker display: **BTI, DRD, INL** (not EQU.ZA.BTI)

### All Other Atlas Modules:
- ✅ Respect currency_symbol from DataFrame attrs
- ✅ Display R for ZAR portfolios, $ for USD portfolios
- ✅ No 100x scaling issues in any calculations
- ✅ Performance metrics accurate (returns, drawdowns, Sharpe, etc.)

### Data Integrity:
- ✅ Synced EE data used AS-IS without transformation
- ✅ No recalculation of values that EE already provides
- ✅ DataFrame attrs preserved throughout entire pipeline

---

## DIAGNOSTIC CODE ALREADY IN PLACE

**Location:** `atlas_app.py` lines 14519-14555

This diagnostic will show exactly where corruption happens:

```python
# Check raw DataFrame values
st.write("**RAW DataFrame (from EE sync):**")
if 'Market_Value' in df.columns:
    st.write(f"- Market_Value sum: R{df['Market_Value'].sum():,.2f}")

# After enhancement
st.write("**AFTER create_enhanced_holdings_table():**")
if 'Total Value' in enhanced_df.columns:
    st.write(f"- Total Value sum: R{enhanced_df['Total Value'].sum():,.2f}")

# Critical comparison
raw_market = df.get('Market_Value', pd.Series([0])).sum()
enhanced_market = enhanced_df.get('Total Value', pd.Series([0])).sum()

if abs(raw_market - enhanced_market) > 1:
    st.error(f"❌ CORRUPTION DETECTED!")
    st.error(f"   Raw: R{raw_market:,.2f}")
    st.error(f"   Enhanced: R{enhanced_market:,.2f}")
```

**Ask user to run this and provide screenshot** - it will show exactly where the 100x multiplication happens.

---

## RECENT COMMITS (BRANCH: claude/integrate-easy-equities-S9P40)

1. **56f2444** - "fix: Preserve DataFrame attrs in Portfolio Home"
   - Fixed: Portfolio Home was destroying attrs with `pd.DataFrame()` wrapper
   - Now: Uses `portfolio_data` directly to preserve attrs

2. **bc71c92** - "fix: Revert authentication to working version"
   - Removed streamlit calls from sync function that broke auth

3. **06eed6a** - "fix: Add detailed error handling for EE authentication" (REVERTED)
   - This broke authentication, was reverted in bc71c92

4. **00be4c0** - "diagnostic: Add Portfolio Home data integrity check"
   - Added diagnostic code to detect where corruption happens

5. **c69c564** - "fix: Add fallback for include_shares to handle API parsing errors"
   - Handles EE API not providing share counts directly

---

## CURRENT STATUS

- ✅ Authentication: Working
- ✅ EE Sync: Produces correct data (R79,738.30)
- ✅ Attrs preservation: Fixed (no longer destroyed)
- ❌ Portfolio Home display: Shows R7.9M (100x too large)
- ❌ Currency symbol: Still shows $ instead of R
- ❌ All other modules: Not updated for ZAR support

---

## USER'S ANALYSIS

> "What its doing is it thinks everything is in cents so it multiplies it by 100. so it will show 7.9 M, but the 6.8M is from the 7.9M minus the EC 10 position. Also all values throughout are still denominating everything in dollars. Also the logic of converting everything like its in cents is screwing up all other performance metrics because they are all multiplied by 100."

**Translation:**
1. There's a cents → dollars conversion happening (× 100 or ÷ 100)
2. This conversion is WRONG for ZAR (already in Rands, not cents)
3. This 100x factor corrupts ALL performance calculations
4. Currency display still hard-coded to $ throughout

> "From the synched portfolio data, what you get there is what you need, so no need to transform that data unless its used as input for return calculations."

**Translation:**
- EE sync output is THE source of truth
- Use it directly, don't recalculate
- Only transform when needed for specific calculations (like time-series returns)

---

## NEXT STEPS FOR OPUS

1. **Find the 100x multiplier** - Search for where values are scaled
2. **Fix scaling** - Remove/condition the multiplication for EE portfolios
3. **Currency symbol propagation** - Update all modules to respect attrs
4. **Test end-to-end** - Verify Portfolio Home shows R79,738.30
5. **Verify all modules** - Check every Atlas page respects currency

---

## FILES TO FOCUS ON

### Primary:
- `atlas_app.py` (lines 7367-7478, 14502-14650) - Enhancement & display
- `modules/easy_equities_sync.py` (lines 87-250) - Sync (working, don't break)

### Secondary:
- All other module sections in `atlas_app.py` for currency symbol updates
- Any formatting/display utility functions

### Reference:
- `modules/ticker_utils.py` (ticker formatting - already working)
- `modules/__init__.py` (exports)

---

## CONTACT

All changes should be committed to branch: `claude/integrate-easy-equities-S9P40`

When fixed, user will test in Google Colab and provide screenshot confirmation.
