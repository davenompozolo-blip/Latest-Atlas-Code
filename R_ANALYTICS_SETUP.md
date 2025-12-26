# R Analytics Setup Guide

## 🎯 Overview

ATLAS Terminal's R Analytics features provide advanced quantitative analysis capabilities including:
- **GARCH Volatility Forecasting** - Model conditional volatility patterns
- **Copula Dependency Analysis** - Analyze complex asset correlations
- **Custom R Code Execution** - Run your own R analytics

## ❌ Current Status

The R Analytics features require external dependencies that cannot be auto-installed. You'll see errors like:
- "Error: rugarch package not available"
- "❌ R Analytics Requires Manual Setup"

## ✅ Quick Setup (Linux/macOS)

### Automated Installation (Recommended)

Run the provided setup script:

```bash
sudo bash setup_r_analytics.sh
```

This will install:
- R base and development packages
- rugarch (GARCH models)
- copula (dependency modeling)
- xts (time series)
- rpy2 (Python-R bridge)

**Time required:** 5-10 minutes

### Verify Installation

After setup, check that everything installed correctly:

```bash
python3 check_r_analytics.py
```

You should see:
```
✅ All dependencies installed!

🚀 You can now use R Analytics features:
   • GARCH Volatility Forecasting
   • Copula Dependency Analysis
   • Custom R Code Execution
```

## 🪟 Windows Setup

### Step 1: Install R

1. Download R from https://cran.r-project.org/bin/windows/base/
2. Run the installer
3. Add R to your PATH

### Step 2: Install R Packages

Open R console and run:

```r
install.packages(c('rugarch', 'copula', 'xts'))
```

### Step 3: Install Python Bridge

```bash
pip install rpy2
```

### Step 4: Verify

```bash
python check_r_analytics.py
```

## 🐍 Manual Installation (Linux/macOS)

If you prefer manual installation:

```bash
# Install R
sudo apt-get update
sudo apt-get install -y r-base r-base-dev

# Install R packages
R -e "install.packages(c('rugarch', 'copula', 'xts'), repos='https://cloud.r-project.org')"

# Install Python bridge
pip install rpy2

# Verify
python3 check_r_analytics.py
```

## 🚀 Using R Analytics

Once installed:

1. **Restart your ATLAS Terminal** (important!)
2. Navigate to **R Analytics** section
3. You should see: `✅ R Analytics Engine Ready`

### Available Features

#### 1. GARCH Volatility Forecasting
- Select a ticker from your portfolio
- Choose GARCH model type (sGARCH, eGARCH, gjrGARCH)
- Set forecast horizon
- Click "Fit GARCH Model"
- View conditional volatility estimates and forecasts

#### 2. Copula Dependency Analysis
- Select 2+ assets from your portfolio
- Choose copula type (t, normal, clayton, gumbel)
- Click "Fit Copula"
- Analyze tail dependencies and correlation structures

#### 3. Custom R Code
- Write custom R analytics code
- Portfolio data available as `df` variable
- Execute and view results

## 🔧 Troubleshooting

### "rpy2 not found"
```bash
pip install rpy2
```

### "R not found" or "command not found"
```bash
# Linux/macOS
sudo apt-get install r-base

# Or download from https://cran.r-project.org/
```

### "rugarch/copula package not available"
```r
# In R console
install.packages('rugarch')
install.packages('copula')
install.packages('xts')
```

### R installed but not detected
- Ensure R is in your PATH
- Try restarting your terminal
- Check with: `R --version`

### Still having issues?
1. Run the checker: `python3 check_r_analytics.py`
2. Check which component is failing
3. Reinstall that specific component
4. Restart ATLAS Terminal

## 📖 Package Documentation

- **rugarch**: https://cran.r-project.org/web/packages/rugarch/
- **copula**: https://cran.r-project.org/web/packages/copula/
- **xts**: https://cran.r-project.org/web/packages/xts/
- **rpy2**: https://rpy2.github.io/

## ⚠️ Important Notes

- R Analytics requires **R version 4.0+**
- Installation requires **internet connection**
- First-time package installation takes **5-10 minutes**
- Some R packages require **compilation** (needs compiler tools)
- **Restart ATLAS Terminal** after installation

## 📊 File Reference

- `setup_r_analytics.sh` - Automated installation script (Linux/macOS)
- `check_r_analytics.py` - Dependency checker
- `navigation/handlers/r_analytics.py` - R Analytics page handler
- `analytics/r_integration.py` - R integration backend

## 💡 Tips

- Install all packages at once to save time
- Use the checker script to verify before reporting issues
- Windows users may need Rtools for package compilation
- If running in Google Colab, use the Colab-specific instructions in the app
