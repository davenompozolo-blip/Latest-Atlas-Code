# 🚀 ATLAS Terminal v10.0

**Institutional-Grade Portfolio Management & Optimization Platform**

[![Python Version](https://img.shields.io/badge/python-3.9%2B-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

---

## 📊 What Is ATLAS Terminal?

ATLAS Terminal is a professional-grade portfolio management platform that combines:

- 🧮 **Quant-Grade Portfolio Optimization** - Stochastic calculus & multivariable optimization
- 🔐 **Automated Data Sync** - Connect to Investopedia, no more manual copy-paste
- 🌐 **Multi-Source Data Aggregation** - 8+ data sources with confidence scoring
- 📈 **Real-Time Market Data** - Bloomberg Terminal-style live feeds
- 📊 **Advanced Analytics** - VaR, CVaR, Maximum Drawdown, Monte Carlo simulation
- 🎯 **Risk Management** - Comprehensive risk metrics and exposure analysis

**From hobbyist dashboard to institutional-grade quant platform.**

---

## ✨ Key Features

### **🧮 Quant Portfolio Optimizer**

Optimize your portfolio using the same mathematics as hedge funds:

- **Stochastic Calculus** - Geometric Brownian Motion price simulation
- **Multivariable Optimization** - Gradient descent with partial derivatives (∂Sharpe/∂w_i)
- **Monte Carlo Simulation** - 10,000+ scenarios for risk analysis
- **Efficient Frontier** - Calculate optimal portfolios at every risk level
- **Risk Metrics** - VaR, CVaR, Maximum Drawdown, Sharpe Ratio

```python
from atlas_quant_portfolio_optimizer import (
    MultivariablePortfolioOptimizer,
    PortfolioConstraints
)

optimizer = MultivariablePortfolioOptimizer(returns, risk_free_rate=0.03)
constraints = PortfolioConstraints(max_leverage=2.0)
result = optimizer.optimize_sharpe(constraints)

print(f"Expected Return: {result.expected_return*100:.2f}%")
print(f"Sharpe Ratio: {result.sharpe_ratio:.3f}")
```

### **🔐 Investopedia Live Integration**

Automatically sync your Investopedia portfolio:

- Automatic login with 2FA support
- Live portfolio data fetching
- Auto-sync every N minutes
- Session persistence
- NO MORE MANUAL COPY-PASTE!

```python
from investopedia_integration.atlas_investopedia_production_2fa import (
    setup_investopedia_live_feed
)

portfolio_data = setup_investopedia_live_feed()
# Handles login, 2FA, and data fetching automatically
```

### **🌐 Multi-Source Data Broker**

Aggregate market data from 8+ sources:

1. Bloomberg Terminal (institutional)
2. Alpha Vantage (paid API)
3. Yahoo Finance (free)
4. Financial Modeling Prep
5. Polygon.io
6. IEX Cloud
7. Investing.com (web scraping)
8. MarketWatch (web scraping)

With intelligent validation and confidence scoring:

```python
from atlas_multi_source_data_broker import HybridDataBroker

broker = HybridDataBroker(DATA_SOURCES)
result = broker.get_live_price('AAPL')

print(f"Price: ${result['price']:.2f}")
print(f"Confidence: {result['confidence_score']:.0f}%")
print(f"Sources: {', '.join(result['sources_used'])}")
```

### **📈 Live Data System**

Bloomberg Terminal-style features:

- Market status detection (OPEN/CLOSED/PRE-MARKET/AFTER-HOURS)
- Multi-tier caching (15s / 1m / 5m / 1h)
- Auto-refresh based on market hours
- Data freshness indicators
- Real-time pulsing indicators

### **🔧 Critical Fixes**

- ✅ Leverage accounting (2x margin correctly calculated)
- ✅ Heatmap fixes (November 2024 zeros resolved)
- ✅ Portfolio weight calculations
- ✅ Amplified volatility/beta for leveraged positions

---

## 🚀 Quick Start

### **Installation**

```bash
# Clone repository
git clone https://github.com/davenompozolo-blip/Latest-Atlas-Code.git
cd Latest-Atlas-Code

# Create virtual environment
python -m venv atlas_env
source atlas_env/bin/activate  # On Windows: atlas_env\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### **Launch ATLAS Terminal**

```bash
streamlit run atlas_app.py
```

Navigate to `http://localhost:8501` in your browser.

### **Run Tests**

```bash
# Run test notebook in Google Colab
# Upload: ATLAS_V10_TEST_DEPLOY.ipynb

# Or run Python tests
pytest tests/

# Or test specific modules
python atlas_quant_portfolio_optimizer.py
python investopedia_integration/atlas_investopedia_production_2fa.py
```

---

## 📁 Project Structure

```
Latest-Atlas-Code/
├── atlas_app.py                              # Main Streamlit application
│
├── atlas_quant_portfolio_optimizer.py        # Portfolio optimization
├── atlas_leverage_accounting_fix.py          # Leverage fixes
├── atlas_heatmap_fix.py                      # Heatmap fixes
├── live_data_upgrade_system.py               # Live data system
├── data_freshness_scoring.py                 # Data quality scoring
│
├── investopedia_integration/                 # Investopedia auto-sync
│   ├── atlas_investopedia_production_2fa.py
│   ├── atlas_investopedia_diagnostics.py
│   └── atlas_investopedia_live_engine.py
│
├── docs/                                     # Documentation
│   ├── ATLAS_V10_PATCH_GUIDE.md
│   ├── QUANT_OPTIMIZER_QUICK_START.md
│   ├── INVESTOPEDIA_INTEGRATION_GUIDE.md
│   └── MULTI_SOURCE_DATA_GUIDE.md
│
├── ATLAS_V10_TEST_DEPLOY.ipynb              # Complete test suite
├── requirements.txt                          # Python dependencies
└── README.md                                 # This file
```

---

## 📚 Documentation

### **Getting Started**
- [Quick Start Guide](docs/QUANT_OPTIMIZER_QUICK_START.md)
- [Comprehensive Patch Guide](docs/ATLAS_V10_PATCH_GUIDE.md)

### **Feature Guides**
- [Quant Optimizer Guide](docs/QUANT_OPTIMIZER_QUICK_START.md) - Portfolio optimization
- [Investopedia Integration](docs/INVESTOPEDIA_INTEGRATION_GUIDE.md) - Auto-sync setup
- [Multi-Source Data Guide](docs/MULTI_SOURCE_DATA_GUIDE.md) - Data aggregation

---

## 🎯 Use Cases

### **1. Portfolio Optimization**

Find the optimal allocation for your portfolio:

```python
# Maximum Sharpe Ratio
result = optimizer.optimize_sharpe(constraints)

# Minimum Volatility
result = optimizer.optimize_minimum_volatility(constraints)

# Target Return
constraints.target_return = 0.20  # 20% annual
result = optimizer.optimize_minimum_volatility(constraints)
```

### **2. Risk Analysis**

Comprehensive risk metrics:

```python
print(f"VaR 95%: {result.var_95*100:.2f}%")        # Value at Risk
print(f"CVaR 95%: {result.cvar_95*100:.2f}%")      # Conditional VaR
print(f"Max Drawdown: {result.max_drawdown*100:.2f}%")  # Worst decline
```

### **3. Leveraged Portfolios**

Correctly account for 2x margin:

```python
constraints = PortfolioConstraints(max_leverage=2.0)
corrected = integrate_leverage_fix_into_atlas(portfolio_df, 2.0)

# Returns are amplified 2x
# Weights sum to 200%
# Volatility is 2x
```

### **4. Live Data Monitoring**

Real-time portfolio tracking:

```python
# Setup auto-refresh
setup_auto_refresh_ui()

# Display market status
display_market_status_banner()

# Show data freshness
display_data_freshness_indicator(timestamp)
```

---

## 🧮 Mathematics

### **Portfolio Optimization**

```
Maximize: Sharpe Ratio = (r_p - r_f) / σ_p

Subject to:
- Σw_i = leverage_ratio
- min_weight ≤ w_i ≤ max_weight
- Optional: r_p ≥ target_return

Using gradient descent:
∂Sharpe/∂w_i = (1/σ_p) × [∂r_p/∂w_i - Sharpe × ∂σ_p/∂w_i]
```

### **Stochastic Price Simulation**

```
Geometric Brownian Motion:
dS_t = μ × S_t × dt + σ × S_t × dW_t

Where:
- S_t = asset price at time t
- μ = drift (expected return)
- σ = volatility
- dW_t = Wiener process (random walk)
```

### **Risk Metrics**

```
VaR(α) = -F^(-1)(α)
CVaR(α) = E[X | X ≤ VaR(α)]
MaxDD = max(Peak - Trough) / Peak
```

---

## 🔧 Configuration

### **API Keys**

Add your API keys to environment variables:

```bash
# Alpha Vantage
export ALPHA_VANTAGE_KEY="your_key_here"

# Financial Modeling Prep
export FMP_KEY="your_key_here"

# Polygon.io
export POLYGON_KEY="your_key_here"

# IEX Cloud
export IEX_KEY="your_key_here"
```

### **Investopedia Credentials**

For development, credentials are embedded in:
`investopedia_integration/atlas_investopedia_production_2fa.py`

For production, use environment variables:

```bash
export INVESTOPEDIA_EMAIL="your_email@gmail.com"
export INVESTOPEDIA_PASSWORD="your_password"
```

---

## 🧪 Testing

### **Run All Tests**

```bash
# Run test notebook (Google Colab recommended)
jupyter notebook ATLAS_V10_TEST_DEPLOY.ipynb

# Or run Python tests
pytest tests/ -v

# Run specific test
pytest tests/test_quant_optimizer.py
```

### **Manual Testing**

```python
# Test optimizer
python atlas_quant_portfolio_optimizer.py

# Test Investopedia
python investopedia_integration/atlas_investopedia_production_2fa.py

# Test data broker
python atlas_multi_source_data_broker.py

# Test patches
python atlas_leverage_accounting_fix.py
python atlas_heatmap_fix.py
```

---

## 🐛 Troubleshooting

### **Common Issues**

**1. Import Errors**

```bash
# Add project root to Python path
export PYTHONPATH="${PYTHONPATH}:${PWD}"
```

**2. Session State Errors**

```python
# Initialize all session state variables at start of main()
if 'variable_name' not in st.session_state:
    st.session_state.variable_name = default_value
```

**3. Investopedia Login Fails**

```bash
# Delete session file to force fresh login
rm investopedia_session.pkl

# Check credentials in file
cat investopedia_integration/atlas_investopedia_production_2fa.py | grep EMAIL
```

**4. Leverage Returns Wrong**

```python
# Apply leverage fix
from atlas_leverage_accounting_fix import integrate_leverage_fix_into_atlas
corrected = integrate_leverage_fix_into_atlas(df, leverage_ratio=2.0)
```

See [Comprehensive Patch Guide](docs/ATLAS_V10_PATCH_GUIDE.md) for more solutions.

---

## 📊 Performance

**Optimization Speed:**
- 10 assets: ~0.5 seconds
- 37 assets: ~1 second
- 100 assets: ~5 seconds

**Monte Carlo:**
- 10,000 simulations: ~3 seconds
- 50,000 simulations: ~15 seconds

**Data Aggregation:**
- Single ticker: ~2 seconds (8 sources)
- Batch (10 tickers): ~15 seconds

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **SciPy** - Optimization algorithms
- **NumPy** - Numerical computing
- **Pandas** - Data manipulation
- **Streamlit** - Web interface
- **yfinance** - Yahoo Finance data
- **BeautifulSoup** - Web scraping

Built with inspiration from:
- Modern Portfolio Theory (Markowitz)
- Black-Litterman Model
- Kelly Criterion
- Quantitative Finance Literature

---

## 📧 Contact

**Developer:** Hlobo Nompozolo
**Email:** davenompozolo@gmail.com
**GitHub:** [@davenompozolo-blip](https://github.com/davenompozolo-blip)

---

## 🎯 Roadmap

### **v10.1 (Next Release)**
- [ ] Transaction cost modeling
- [ ] Tax-loss harvesting optimizer
- [ ] Custom benchmark comparisons
- [ ] Portfolio rebalancing alerts
- [ ] Email/SMS notifications

### **v11.0 (Future)**
- [ ] Machine learning price prediction
- [ ] Sentiment analysis integration
- [ ] Options strategies
- [ ] Cryptocurrency support
- [ ] Mobile app (React Native)

---

## ⭐ Star History

If you find ATLAS Terminal useful, please give it a star! ⭐

---

**Built with ❤️ - From hobbyist to institutional-grade in one weekend! 🚀**

```
                    ATLAS Terminal v10.0
        ___  ________  ___       ___  ________
       |\  \|\   __  \|\  \     |\  \|\   ____\
       \ \  \ \  \|\  \ \  \    \ \  \ \  \___|_
        \ \  \ \   __  \ \  \    \ \  \ \_____  \
         \ \  \ \  \ \  \ \  \____\ \  \|____|\  \
          \ \__\ \__\ \__\ \_______\ \__\____\_\  \
           \|__|\|__|\|__|\|_______|\|__|\_________\
                                        \|_________|

            Institutional-Grade Quant Finance
```

---

**Happy Trading! 📈💰🚀**
