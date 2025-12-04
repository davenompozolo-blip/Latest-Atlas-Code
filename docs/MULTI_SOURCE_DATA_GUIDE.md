# 🌐 ATLAS Terminal - Multi-Source Data Integration Guide

## Overview

The Multi-Source Data Broker aggregates market data from **8+ sources** with intelligent validation and confidence scoring.

**Why Multi-Source?**
- 🎯 **Reliability** - Automatic failover if one source fails
- ✅ **Validation** - Cross-check prices across sources
- 📊 **Confidence** - Know how reliable your data is
- 🚀 **Speed** - Priority-based fetching (fastest sources first)
- 💰 **Cost** - Mix free and paid sources optimally

---

## 🌟 Data Sources

### **Tier 1: Institutional (Highest Quality)**
1. **Bloomberg Terminal** - $24k/year, requires subscription
   - Real-time professional data
   - Priority: 1 (highest)
   - Status: Disabled (requires subscription)

### **Tier 2: Paid APIs (High Quality)**
2. **Alpha Vantage** - Free tier: 5 calls/min
   - Priority: 2
   - Real-time quotes, historical data
   - API key required

3. **Financial Modeling Prep** - Free tier: 250 calls/day
   - Priority: 4
   - Comprehensive financial data
   - API key required

4. **Polygon.io** - Paid plans start at $29/month
   - Priority: 5
   - High-quality real-time data
   - API key required

5. **IEX Cloud** - Free tier available
   - Priority: 6
   - Exchange data
   - API key required

### **Tier 3: Free APIs (Good Quality)**
6. **Yahoo Finance** - Free, no API key
   - Priority: 3
   - Most reliable free source
   - Built-in with yfinance

### **Tier 4: Web Scraping (Best Effort)**
7. **Investing.com** - Free, web scraping
   - Priority: 7
   - Backup data source

8. **MarketWatch** - Free, web scraping
   - Priority: 8
   - Additional validation

---

## 🚀 Quick Start

### **Step 1: Basic Setup**
```python
from atlas_multi_source_data_broker import (
    HybridDataBroker,
    DATA_SOURCES
)

# Initialize broker with default sources
broker = HybridDataBroker(DATA_SOURCES)

# Get live price for a ticker
result = broker.get_live_price('AAPL')

print(f"Price: ${result['price']:.2f}")
print(f"Confidence: {result['confidence_score']:.0f}%")
print(f"Sources: {', '.join(result['sources_used'])}")
```

**Output:**
```
Price: $150.25
Confidence: 95%
Sources: Yahoo Finance, Alpha Vantage, IEX Cloud
```

---

### **Step 2: Configure API Keys**
```python
from atlas_multi_source_data_broker import DATA_SOURCES

# Add your API keys
DATA_SOURCES[DataSource.ALPHA_VANTAGE].api_key = "YOUR_ALPHA_VANTAGE_KEY"
DATA_SOURCES[DataSource.FMP].api_key = "YOUR_FMP_KEY"
DATA_SOURCES[DataSource.POLYGON].api_key = "YOUR_POLYGON_KEY"
DATA_SOURCES[DataSource.IEX_CLOUD].api_key = "YOUR_IEX_KEY"

# Enable sources with keys
DATA_SOURCES[DataSource.ALPHA_VANTAGE].enabled = True
DATA_SOURCES[DataSource.FMP].enabled = True
DATA_SOURCES[DataSource.POLYGON].enabled = True
DATA_SOURCES[DataSource.IEX_CLOUD].enabled = True

# Now create broker
broker = HybridDataBroker(DATA_SOURCES)
```

---

### **Step 3: Fetch Data with Validation**
```python
# Get price with full details
result = broker.get_live_price('AAPL')

if result.get('success', True):
    print(f"✅ Success!")
    print(f"   Price: ${result['price']:.2f}")
    print(f"   Change: ${result['change']:.2f} ({result['change_pct']:+.2f}%)")
    print(f"   Volume: {result['volume']:,}")
    print(f"")
    print(f"📊 Quality Metrics:")
    print(f"   Primary Source: {result['primary_source']}")
    print(f"   Sources Used: {result['num_sources']}")
    print(f"   Confidence Score: {result['confidence_score']:.0f}%")

    if result['is_aggregated']:
        print(f"")
        print(f"📈 Aggregation Stats:")
        print(f"   Mean: ${result['price_mean']:.2f}")
        print(f"   Median: ${result['price_median']:.2f}")
        print(f"   Std Dev: ${result['price_std']:.4f}")
else:
    print(f"❌ Failed: {result.get('error')}")
```

---

## 🎯 How It Works

### **1. Priority-Based Fetching**

Sources are queried in order of priority (1 = highest):
```
1. Bloomberg Terminal (if available)
2. Alpha Vantage
3. Yahoo Finance
4. Financial Modeling Prep
5. Polygon.io
6. IEX Cloud
7. Investing.com
8. MarketWatch
```

### **2. Cross-Validation**

Prices from multiple sources are aggregated:
```python
# Example: 3 sources return prices
prices = [150.25, 150.30, 150.22]

# Calculate statistics
mean = 150.26
median = 150.25
std = 0.04

# Detect outliers (> 2 standard deviations)
outliers = []  # None in this case

# Final price = median of valid prices
final_price = 150.25
```

### **3. Confidence Scoring**

Confidence is calculated based on:
```python
confidence = (
    freshness_score * 0.3 +      # How recent is data?
    reliability_score * 0.4 +    # How reliable is source?
    validation_score * 0.3       # Do sources agree?
)

# Example calculation:
# - Freshness: 100% (real-time data)
# - Reliability: 85% (Alpha Vantage = Tier 2)
# - Validation: 95% (low variance across sources)
#
# Confidence = 100*0.3 + 85*0.4 + 95*0.3 = 92.5%
```

### **4. Outlier Detection**
```python
# Coefficient of variation (CV)
cv = std / mean

if cv < 0.01:
    validation_score = 100  # Excellent agreement
elif cv < 0.02:
    validation_score = 90   # Very good
elif cv < 0.05:
    validation_score = 75   # Good
elif cv < 0.10:
    validation_score = 60   # Fair
else:
    validation_score = 30   # Poor agreement

# Remove outliers > 2σ from mean
valid_prices = [p for p in prices if abs(p - mean) <= 2 * std]
```

---

## 🔧 Advanced Configuration

### **Custom Source Priority**
```python
# Change source priorities
DATA_SOURCES[DataSource.YAHOO_FINANCE].priority = 2  # Promote Yahoo
DATA_SOURCES[DataSource.ALPHA_VANTAGE].priority = 3  # Demote Alpha Vantage

# Disable unreliable sources
DATA_SOURCES[DataSource.MARKETWATCH].enabled = False
```

### **Adjust Rate Limiting**
```python
# Alpha Vantage: 5 calls/min = 1 call per 12 seconds
DATA_SOURCES[DataSource.ALPHA_VANTAGE].rate_limit = 0.083  # 5 per minute

# Yahoo Finance: More permissive
DATA_SOURCES[DataSource.YAHOO_FINANCE].rate_limit = 2.0  # 2 per second

# Web scraping: Be gentle
DATA_SOURCES[DataSource.INVESTING_COM].rate_limit = 0.5  # 1 per 2 seconds
```

### **Custom Validation Thresholds**
```python
# In broker._aggregate_price_data(), adjust:

# Outlier threshold (default: 2 standard deviations)
valid_prices = [p for p in prices if abs(p - mean) <= 3 * std]  # More lenient

# Minimum sources for high confidence
if len(results) >= 3:
    confidence_bonus = 10  # Bonus for 3+ sources
else:
    confidence_bonus = 0
```

---

## 📊 Batch Processing

### **Fetch Multiple Tickers**
```python
tickers = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA']

results = {}

for ticker in tickers:
    result = broker.get_live_price(ticker)
    results[ticker] = result

    # Respect rate limits
    time.sleep(0.5)

# Create DataFrame
df = pd.DataFrame([
    {
        'ticker': ticker,
        'price': result['price'],
        'confidence': result['confidence_score'],
        'sources': result['num_sources']
    }
    for ticker, result in results.items()
    if result.get('success', True)
])

print(df)
```

**Output:**
```
  ticker   price  confidence  sources
0   AAPL  150.25          95        3
1  GOOGL 2805.30          92        3
2   MSFT  380.15          88        2
3   AMZN  180.50          95        3
4   TSLA  240.80          85        2
```

---

## 🔍 Monitoring & Statistics

### **Check Source Performance**
```python
# Get performance statistics
stats = broker.get_source_statistics()

print(stats)
```

**Output:**
```
                   Source  Priority  Enabled  Hits  Misses  Errors  Success Rate (%)
0       Bloomberg Terminal         1    False     0       0       0               0.0
1           Alpha Vantage         2     True    45       5       2              86.5
2           Yahoo Finance         3     True    50       0       0             100.0
3  Financial Modeling Prep         4     True    40       8       4              76.9
4              Polygon.io         5    False     0       0       0               0.0
5              IEX Cloud         6    False     0       0       0               0.0
6          Investing.com         7     True    30      15       5              60.0
7            MarketWatch         8     True    25      20       5              50.0
```

### **Identify Best Sources**
```python
# Sort by success rate
stats_sorted = stats.sort_values('Success Rate (%)', ascending=False)

print("\n🏆 Top Performing Sources:")
for _, row in stats_sorted.head(3).iterrows():
    print(f"  {row['Source']}: {row['Success Rate (%)']}%")
```

---

## 🚨 Error Handling

### **Handle Failed Fetches**
```python
def get_price_with_fallback(ticker, default_price=None):
    """Get price with fallback to default"""

    result = broker.get_live_price(ticker)

    if result.get('success', True) and result.get('price'):
        return result['price']
    else:
        if default_price:
            print(f"⚠️ Using default price for {ticker}: ${default_price}")
            return default_price
        else:
            raise ValueError(f"Could not fetch price for {ticker}")

# Usage
try:
    price = get_price_with_fallback('AAPL')
except ValueError as e:
    print(f"Error: {e}")
```

### **Retry Logic**
```python
def get_price_with_retry(ticker, max_retries=3):
    """Get price with automatic retry"""

    for attempt in range(max_retries):
        result = broker.get_live_price(ticker)

        if result.get('success', True):
            return result

        print(f"Attempt {attempt + 1}/{max_retries} failed, retrying...")
        time.sleep(2 ** attempt)  # Exponential backoff

    return {'success': False, 'error': 'Max retries exceeded'}
```

---

## 🔐 API Key Management

### **Environment Variables (Recommended)**
```python
import os

# Set in terminal or .env file:
# export ALPHA_VANTAGE_KEY="your_key_here"
# export FMP_KEY="your_key_here"

DATA_SOURCES[DataSource.ALPHA_VANTAGE].api_key = os.getenv('ALPHA_VANTAGE_KEY')
DATA_SOURCES[DataSource.FMP].api_key = os.getenv('FMP_KEY')
```

### **Streamlit Secrets**
```toml
# .streamlit/secrets.toml
alpha_vantage_key = "your_key_here"
fmp_key = "your_key_here"
polygon_key = "your_key_here"
```
```python
import streamlit as st

DATA_SOURCES[DataSource.ALPHA_VANTAGE].api_key = st.secrets["alpha_vantage_key"]
DATA_SOURCES[DataSource.FMP].api_key = st.secrets["fmp_key"]
```

---

## 🎯 Best Practices

### **1. Start with Free Sources**
```python
# Minimal setup (no API keys needed)
enabled_sources = [
    DataSource.YAHOO_FINANCE,    # Free, reliable
    DataSource.INVESTING_COM,    # Free, backup
    DataSource.MARKETWATCH       # Free, additional validation
]

for source in DATA_SOURCES.keys():
    DATA_SOURCES[source].enabled = source in enabled_sources

broker = HybridDataBroker(DATA_SOURCES)
```

### **2. Cache Results**
```python
from datetime import datetime, timedelta

cache = {}
CACHE_DURATION = timedelta(seconds=15)

def get_price_cached(ticker):
    """Get price with 15-second cache"""

    now = datetime.now()

    # Check cache
    if ticker in cache:
        cached_data, cached_time = cache[ticker]
        if now - cached_time < CACHE_DURATION:
            return cached_data

    # Fetch fresh data
    result = broker.get_live_price(ticker)
    cache[ticker] = (result, now)

    return result
```

### **3. Monitor Data Quality**
```python
# Set confidence threshold
MIN_CONFIDENCE = 70

result = broker.get_live_price('AAPL')

if result['confidence_score'] < MIN_CONFIDENCE:
    print(f"⚠️ Warning: Low confidence ({result['confidence_score']:.0f}%)")
    print(f"   Only {result['num_sources']} source(s) available")
    print(f"   Consider enabling more data sources")
```

### **4. Respect Rate Limits**
```python
# Track requests
request_log = {}

def rate_limited_fetch(ticker, source):
    """Fetch with rate limit enforcement"""

    now = time.time()

    if source in request_log:
        last_request = request_log[source]
        rate_limit = DATA_SOURCES[source].rate_limit

        elapsed = now - last_request
        min_interval = 1.0 / rate_limit

        if elapsed < min_interval:
            wait_time = min_interval - elapsed
            print(f"Rate limit: waiting {wait_time:.2f}s for {source}")
            time.sleep(wait_time)

    result = broker.get_live_price(ticker)
    request_log[source] = time.time()

    return result
```

---

## 📈 Integration Examples

### **Portfolio Update**
```python
def update_portfolio_prices(portfolio_df):
    """Update all portfolio prices from multi-source data"""

    for idx, row in portfolio_df.iterrows():
        ticker = row['ticker']

        result = broker.get_live_price(ticker)

        if result.get('success', True):
            portfolio_df.at[idx, 'current_price'] = result['price']
            portfolio_df.at[idx, 'data_quality'] = result['confidence_score']
            portfolio_df.at[idx, 'last_updated'] = result['timestamp']
        else:
            print(f"⚠️ Failed to update {ticker}")

    return portfolio_df
```

### **Real-Time Dashboard**
```python
import streamlit as st

def show_live_prices_dashboard():
    """Real-time price dashboard with multi-source data"""

    st.title("🌐 Live Market Data")

    # Watchlist
    tickers = st.multiselect(
        "Select tickers",
        ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'],
        default=['AAPL', 'GOOGL']
    )

    # Fetch data
    if st.button("🔄 Refresh"):
        data = []

        progress = st.progress(0)

        for i, ticker in enumerate(tickers):
            result = broker.get_live_price(ticker)

            if result.get('success', True):
                data.append({
                    'Ticker': ticker,
                    'Price': f"${result['price']:.2f}",
                    'Change': f"{result['change_pct']:+.2f}%",
                    'Confidence': f"{result['confidence_score']:.0f}%",
                    'Sources': result['num_sources']
                })

            progress.progress((i + 1) / len(tickers))

        # Display
        if data:
            df = pd.DataFrame(data)
            st.dataframe(df, use_container_width=True)

            # Show source stats
            with st.expander("📊 Source Statistics"):
                stats = broker.get_source_statistics()
                st.dataframe(stats, use_container_width=True)
```

---

## ✅ Verification Checklist

Your multi-source data system is working when:

- [ ] Broker initializes without errors
- [ ] At least 2 sources are enabled
- [ ] Price fetches return valid data
- [ ] Confidence scores are calculated
- [ ] Multiple sources are aggregated
- [ ] Outliers are detected
- [ ] Rate limiting prevents spam
- [ ] Source statistics are tracked
- [ ] Error handling works gracefully

---

## 🆘 Troubleshooting

### **No Sources Available**
```python
# Check which sources are enabled
for source, config in DATA_SOURCES.items():
    if config.enabled:
        print(f"✅ {config.name}")
    else:
        print(f"❌ {config.name} (disabled)")
```

### **Low Confidence Scores**

- Enable more sources with API keys
- Check source reliability (see statistics)
- Verify sources are returning valid data

### **Rate Limit Errors**

- Reduce fetch frequency
- Adjust rate_limit values
- Enable caching

---

## 🎉 You're Ready!

You now have industrial-grade multi-source data aggregation!

**Next Steps:**
1. Configure API keys for paid sources
2. Test with your watchlist
3. Monitor source performance
4. Integrate with portfolio tracking
5. Enable caching for production

**Happy trading with confident data! 🚀📊**
