# Ticker Conversion - Usage Guide

## Overview

The ticker conversion module automatically converts Easy Equities ticker format to Yahoo Finance format for fetching historical data.

## Installation

The ticker conversion utilities are in `modules/ticker_utils.py` and are automatically available when you import from the `modules` package.

## Quick Start

### 1. Basic Ticker Conversion

```python
from modules import convert_ee_ticker_to_yahoo

# Convert Easy Equities ticker to Yahoo Finance format
ee_ticker = "EQU.ZA.BTI"  # Easy Equities format
yahoo_ticker = convert_ee_ticker_to_yahoo(ee_ticker)
print(yahoo_ticker)  # Output: BTI.JO
```

### 2. Fetch Historical Data

```python
from modules import fetch_stock_history

# Automatically converts ticker and fetches data
ticker = "EQU.ZA.STXNDQ"
data = fetch_stock_history(ticker, period="1y")

# Data contains OHLCV information
print(data.head())
```

### 3. Fetch with Fallback (Recommended)

```python
from modules import fetch_stock_history_with_fallback

# Returns None if no data available (e.g., for crypto)
ticker = "EC10.EC.EC10"
data = fetch_stock_history_with_fallback(ticker, period="1mo")

if data is not None:
    print(f"✅ Data available for {ticker}")
else:
    print(f"⚠️ No historical data for {ticker}")
```

## Ticker Format Conversions

| Exchange | Easy Equities Format | Yahoo Finance Format | Example |
|----------|---------------------|---------------------|---------|
| JSE (South Africa) | `EQU.ZA.XXX` | `XXX.JO` | `EQU.ZA.BTI` → `BTI.JO` |
| US Stocks | `EQU.US.XXX` | `XXX` | `EQU.US.AAPL` → `AAPL` |
| London SE | `EQU.UK.XXX` | `XXX.L` | `EQU.UK.VOD` → `VOD.L` |
| Australian SE | `EQU.AU.XXX` | `XXX.AX` | `EQU.AU.BHP` → `BHP.AX` |
| Crypto/Other | No conversion | Keep as-is | `EC10.EC.EC10` → `EC10.EC.EC10` |

## Integration with ATLAS

### In Portfolio Home or Data Visualization

```python
import streamlit as st
from modules import fetch_stock_history_with_fallback

# Get portfolio from Easy Equities sync
portfolio_df = st.session_state.get('portfolio_df')

if portfolio_df is not None:
    for idx, row in portfolio_df.iterrows():
        ticker = row['Ticker']
        name = row['Name']

        # Fetch historical data (ticker conversion is automatic)
        history = fetch_stock_history_with_fallback(ticker, period="1y")

        if history is not None:
            # Display chart
            st.subheader(f"{name} ({ticker})")
            st.line_chart(history['Close'])
        else:
            # Show current price only
            st.info(f"{name} - Current price only (no historical data)")
            st.metric(ticker, f"R{row['Current_Price']:.2f}")
```

### In Performance Analytics

```python
from modules import fetch_stock_history, convert_ee_ticker_to_yahoo

def calculate_returns(ticker: str, period: str = "1y"):
    """Calculate returns for a ticker"""

    try:
        # Fetch data (automatic ticker conversion)
        data = fetch_stock_history(ticker, period=period)

        # Calculate returns
        returns = data['Close'].pct_change().dropna()

        # Calculate metrics
        total_return = ((data['Close'].iloc[-1] / data['Close'].iloc[0]) - 1) * 100
        volatility = returns.std() * (252 ** 0.5) * 100  # Annualized

        return {
            'total_return': total_return,
            'volatility': volatility,
            'sharpe': total_return / volatility if volatility > 0 else 0
        }

    except Exception as e:
        return None
```

## Testing

### Run the Test Script

```python
# In Colab or environment with pandas/yfinance installed
!python3 test_ticker_conversion.py
```

This will:
1. Test ticker conversion logic
2. Verify Yahoo Finance data availability for all 22 demo portfolio tickers
3. Show success rate and any issues

### Expected Results

- ✅ JSE stocks (21/22): Should fetch data successfully
- ⚠️ Crypto (1/22): No historical data expected
- 📊 Overall success rate: ~95%

## API Reference

### `convert_ee_ticker_to_yahoo(ticker: str) -> str`

Converts Easy Equities ticker to Yahoo Finance format.

**Args:**
- `ticker`: Easy Equities format ticker (e.g., "EQU.ZA.BTI")

**Returns:**
- Yahoo Finance format ticker (e.g., "BTI.JO")

---

### `fetch_stock_history(ticker: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame`

Fetches historical stock data with automatic ticker conversion.

**Args:**
- `ticker`: Stock ticker (EE or Yahoo format)
- `period`: Time period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
- `interval`: Data interval (1d, 1wk, 1mo, etc.)

**Returns:**
- DataFrame with OHLCV data

**Raises:**
- Exception if data cannot be fetched

---

### `fetch_stock_history_with_fallback(ticker: str, period: str = "1y", interval: str = "1d") -> Optional[pd.DataFrame]`

Same as `fetch_stock_history` but returns `None` instead of raising exception.

**Args:**
- Same as `fetch_stock_history`

**Returns:**
- DataFrame if data available, `None` otherwise

---

### `fetch_current_price(ticker: str) -> float`

Fetches current stock price.

**Args:**
- `ticker`: Stock ticker (EE or Yahoo format)

**Returns:**
- Current price as float (0.0 if unavailable)

## Troubleshooting

### Issue: "No data found for ticker"

**Solution:**
- Check if the ticker exists on Yahoo Finance
- Verify the conversion is correct
- Some delisted or new stocks may not have data

### Issue: Crypto tickers not working

**Expected behavior:**
- Crypto tickers (EC10.*) don't have Yahoo Finance historical data
- Use current price from Easy Equities sync instead

### Issue: Slow data fetching

**Solution:**
- Use cached ticker conversion: `convert_ee_ticker_to_yahoo_cached()`
- Fetch data in parallel for multiple tickers
- Reduce the period (e.g., use "1mo" instead of "5y")

## Performance Tips

1. **Use cached conversion** for repeated calls:
   ```python
   from modules.ticker_utils import convert_ee_ticker_to_yahoo_cached

   # First call: converts and caches
   yahoo_ticker = convert_ee_ticker_to_yahoo_cached("EQU.ZA.BTI")

   # Second call: returns from cache (faster)
   yahoo_ticker = convert_ee_ticker_to_yahoo_cached("EQU.ZA.BTI")
   ```

2. **Fetch in parallel** for multiple tickers:
   ```python
   from concurrent.futures import ThreadPoolExecutor
   from modules import fetch_stock_history_with_fallback

   tickers = ["EQU.ZA.BTI", "EQU.ZA.ABG", "EQU.ZA.STXNDQ"]

   with ThreadPoolExecutor(max_workers=5) as executor:
       results = list(executor.map(
           lambda t: fetch_stock_history_with_fallback(t, period="1mo"),
           tickers
       ))
   ```

3. **Cache data locally** to avoid repeated API calls:
   ```python
   import pickle
   from pathlib import Path

   cache_file = Path("stock_data_cache.pkl")

   if cache_file.exists():
       with open(cache_file, 'rb') as f:
           data = pickle.load(f)
   else:
       data = fetch_stock_history(ticker)
       with open(cache_file, 'wb') as f:
           pickle.dump(data, f)
   ```

## Next Steps

1. ✅ Ticker conversion module created
2. ✅ Test script ready
3. ⏳ Integrate with Portfolio Home page
4. ⏳ Integrate with Performance Analytics
5. ⏳ Add caching for better performance

---

**Questions or issues?** Check the test script output or create an issue in the repository.
