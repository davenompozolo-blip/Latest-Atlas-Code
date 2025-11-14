# 📊 ATLAS Terminal v10.0 - Google Colab Setup

Professional Trading Terminal with Advanced Analytics

## 🚀 Quick Start

### Method 1: Jupyter Notebook (Recommended)

1. **Download the notebook:**
   - [ATLAS_Terminal_Colab.ipynb](https://raw.githubusercontent.com/davenompozolo-blip/Latest-Atlas-Code/claude/test-updated-version-01ED2kosfw6PYJkW8UK6BcQJ/ATLAS_Terminal_Colab.ipynb)
   - Right-click → Save Link As → save as `.ipynb`

2. **Upload to Colab:**
   - Go to https://colab.research.google.com
   - File → Upload notebook
   - Choose the downloaded file

3. **Run all cells:**
   - Runtime → Run all (or press Ctrl+F9)
   - Wait for the public URL to appear
   - Click the URL to access your dashboard

### Method 2: Python Script

1. **Create a new Colab notebook**

2. **Copy and paste this code:**
```python
!wget https://raw.githubusercontent.com/davenompozolo-blip/Latest-Atlas-Code/claude/test-updated-version-01ED2kosfw6PYJkW8UK6BcQJ/run_atlas_colab.py
!python run_atlas_colab.py
```

3. **Run the cell and click the generated URL**

### Method 3: One-Line Setup (Fastest)

```python
# Run this in a Colab cell
!git clone https://github.com/davenompozolo-blip/Latest-Atlas-Code.git && \
cd Latest-Atlas-Code && \
git checkout claude/test-updated-version-01ED2kosfw6PYJkW8UK6BcQJ && \
pip install -q streamlit pandas numpy plotly yfinance scipy scikit-learn openpyxl pyngrok && \
python -m streamlit run run.py --server.port=8501 &
sleep 10 && \
python -c "from pyngrok import ngrok; print(f'\n🚀 Access ATLAS Terminal at: {ngrok.connect(8501)}\n')"
```

## 📁 File Structure

```
Latest-Atlas-Code/
├── run.py                          # Main entry point (fixes import issues)
├── run_atlas_colab.py              # Automated Colab launcher script
├── ATLAS_Terminal_Colab.ipynb      # Jupyter notebook for Colab
├── atlas_terminal/
│   ├── __init__.py
│   ├── main.py                     # Streamlit app core
│   ├── config.py                   # Configuration settings
│   ├── pages/                      # UI pages
│   │   ├── home.py                 # Portfolio Home
│   │   ├── market_watch.py         # Market Watch
│   │   ├── risk_analysis.py        # Risk Analysis
│   │   ├── portfolio_deep_dive.py  # Portfolio Deep Dive
│   │   ├── valuation_house.py      # Valuation House
│   │   ├── trade_journal.py        # Trade Journal
│   │   └── risk_dashboard.py       # Risk Dashboard
│   ├── data/                       # Data management
│   ├── analytics/                  # Analytics engines
│   ├── features/                   # Advanced features
│   └── visualizations/             # Charts & themes
└── README_COLAB.md                 # This file
```

## 🔧 How It Works

### The Import Fix

**Problem:** Python relative imports don't work when running `streamlit run atlas_terminal/main.py` directly.

**Solution:** The `run.py` entry point:
1. Sets up the Python path correctly
2. Ensures `atlas_terminal` is recognized as a package
3. Imports and runs the main application

**Always use:** `streamlit run run.py` instead of `streamlit run atlas_terminal/main.py`

### Local Usage (Outside Colab)

```bash
# Clone repository
git clone https://github.com/davenompozolo-blip/Latest-Atlas-Code.git
cd Latest-Atlas-Code
git checkout claude/test-updated-version-01ED2kosfw6PYJkW8UK6BcQJ

# Install dependencies
pip install streamlit pandas numpy plotly yfinance scipy scikit-learn openpyxl

# Run ATLAS Terminal
streamlit run run.py
```

## 📊 Features

### 7 Interactive Pages

1. **🏠 Portfolio Home**
   - Overview dashboard
   - Risk snapshot
   - Holdings table
   - Sector allocation
   - Top contributors/detractors

2. **📈 Portfolio Deep Dive**
   - Attribution analysis
   - Sector rotation
   - Concentration metrics
   - Multi-factor analysis

3. **🌍 Market Watch**
   - Global indices
   - Cryptocurrencies
   - ETFs & commodities
   - Bonds & credit spreads

4. **⚠️ Risk Analysis**
   - VaR/CVaR calculations
   - Monte Carlo simulation
   - Stress testing
   - Rolling metrics

5. **💰 Valuation House**
   - DCF valuation models
   - Cash flow projections
   - WACC calculations
   - Sensitivity analysis

6. **📓 Trade Journal**
   - Trade tracking
   - Win/loss statistics
   - Performance attribution
   - Auto-detection from history

7. **🎯 Risk Dashboard**
   - Risk budget monitoring
   - Position risk contributions
   - Stress scenarios
   - New position impact simulator

## 💡 Tips

### Ngrok Authentication (Optional)

For longer sessions and permanent URLs:

1. Sign up at https://ngrok.com
2. Get your auth token
3. In the Colab notebook, uncomment and add:
```python
ngrok.set_auth_token("YOUR_TOKEN_HERE")
```

### Data Upload

Upload CSV files through the sidebar:
- **Portfolio Snapshot**: Current holdings
- **Trade History**: Historical trades
- **Account History**: Account value over time

### Session Management

- Keep the Colab cell running to maintain connection
- Sessions timeout after ~60 minutes of inactivity
- Refresh the page if connection is lost
- Restart the cell to get a new URL

## 🆘 Troubleshooting

### ImportError: attempted relative import with no known parent package

**Fix:** Make sure you're using `run.py` as entry point:
```python
# ✅ Correct
streamlit run run.py

# ❌ Wrong
streamlit run atlas_terminal/main.py
```

### Module not found errors

**Fix:** Install missing packages:
```python
!pip install streamlit pandas numpy plotly yfinance scipy scikit-learn openpyxl
```

### Ngrok connection refused

**Fix:** Wait longer for Streamlit to start, or try localtunnel:
```python
!npm install -g localtunnel
!lt --port 8501
```

### Colab session timeout

**Fix:**
- Keep browser tab active
- Move mouse occasionally
- Consider Colab Pro for longer sessions

## 📝 Requirements

- Python 3.8+
- Google Colab (or local Jupyter)
- Internet connection
- Modern web browser

## 🔐 Security Notes

- All data processing happens in your Colab session
- Data is not stored externally
- Ngrok URLs are temporary and private
- Session data is cleared when Colab runtime stops

## 📄 License

See main repository for license information.

## 🤝 Support

For issues or questions:
- Check troubleshooting section above
- Review Streamlit docs: https://docs.streamlit.io
- Check Ngrok docs: https://ngrok.com/docs

---

**Version:** 10.0
**Last Updated:** 2025-11-14
**Status:** ✅ Production Ready
