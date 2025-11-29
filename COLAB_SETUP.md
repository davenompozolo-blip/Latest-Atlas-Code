# 🚀 ATLAS TERMINAL v10.0 - Google Colab Setup

## Quick Start - Copy/Paste This Into Colab

```python
# ============================================================================
# ATLAS TERMINAL v10.0 - GOOGLE COLAB LAUNCHER
# ============================================================================
# This cell will:
# 1. Clone the Latest-Atlas-Code repository
# 2. Install all dependencies
# 3. Launch the Streamlit app with ngrok tunnel
# 4. Provide you with a public URL to access Atlas Terminal
# ============================================================================

# Step 1: Install dependencies
print("📦 Installing dependencies...")
!pip install -q streamlit pandas numpy yfinance plotly scipy streamlit-option-menu openpyxl

# Step 2: Install pyngrok for public URL
!pip install -q pyngrok

# Step 3: Clone the repository (if not already cloned)
import os
if not os.path.exists('/content/Latest-Atlas-Code'):
    print("📥 Cloning Latest-Atlas-Code repository...")
    !git clone https://github.com/davenompozolo-blip/Latest-Atlas-Code.git /content/Latest-Atlas-Code
else:
    print("📂 Repository already exists, pulling latest changes...")
    !cd /content/Latest-Atlas-Code && git pull

# Step 4: Checkout the leverage accounting branch
print("🔀 Checking out leverage accounting branch...")
!cd /content/Latest-Atlas-Code && git checkout claude/audit-report-review-01VoZye3AgZX5zRtJKML4B8v

# Step 5: Set up ngrok authentication (REQUIRED)
print("\n" + "="*80)
print("⚠️  NGROK SETUP REQUIRED")
print("="*80)
print("To get a public URL for Atlas Terminal, you need an ngrok auth token.")
print("1. Go to: https://dashboard.ngrok.com/get-started/your-authtoken")
print("2. Sign up (free) and copy your auth token")
print("3. Paste it below when prompted")
print("="*80 + "\n")

ngrok_token = input("Enter your ngrok auth token: ").strip()

if ngrok_token:
    from pyngrok import ngrok, conf
    conf.get_default().auth_token = ngrok_token

    # Step 6: Launch Streamlit in background
    print("\n🚀 Launching ATLAS Terminal v10.0...")
    print("⏳ Please wait 10-15 seconds for the app to start...\n")

    # Kill any existing streamlit processes
    !pkill -f streamlit

    # Start streamlit in background
    import subprocess
    import time

    streamlit_process = subprocess.Popen(
        ["streamlit", "run", "/content/Latest-Atlas-Code/atlas_app.py",
         "--server.port", "8501",
         "--server.headless", "true",
         "--browser.serverAddress", "localhost",
         "--browser.gatherUsageStats", "false"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    # Wait for Streamlit to start
    time.sleep(10)

    # Step 7: Create ngrok tunnel
    public_url = ngrok.connect(8501, bind_tls=True)

    print("\n" + "="*80)
    print("✅ ATLAS TERMINAL v10.0 IS RUNNING!")
    print("="*80)
    print(f"\n🌐 Public URL: {public_url}")
    print(f"\n📱 Click the link above to access your portfolio terminal")
    print("\n" + "="*80)
    print("NEW IN v10.0:")
    print("="*80)
    print("✨ Leverage Accounting Fix")
    print("   - Accurate cost basis for leveraged positions")
    print("   - Returns reflect true equity performance")
    print("   - Portfolio weights show actual capital allocation")
    print("   - Leverage-adjusted volatility and beta")
    print("\n🎛️  Sidebar Settings:")
    print("   - Auto-detect leverage from account history")
    print("   - Manual override option (1.0x to 4.0x)")
    print("   - Visual leverage indicators")
    print("\n💼 Portfolio Home:")
    print("   - Leverage-adjusted summary metrics")
    print("   - Equity vs. notional cost breakdown")
    print("   - Margin used and buying power display")
    print("="*80)
    print("\n⚠️  IMPORTANT:")
    print("   - Keep this Colab tab open while using Atlas Terminal")
    print("   - To stop: Runtime → Interrupt execution")
    print("   - Session will timeout after ~12 hours (free tier)")
    print("="*80 + "\n")

    # Keep the process running
    try:
        streamlit_process.wait()
    except KeyboardInterrupt:
        print("\n🛑 Stopping ATLAS Terminal...")
        streamlit_process.kill()
        ngrok.kill()

else:
    print("\n❌ No ngrok token provided. Cannot create public URL.")
    print("Run the cell again and provide your token when prompted.")
```

---

## 📝 Alternative: Run Locally Without ngrok

If you prefer to run without a public URL (requires Colab to be open):

```python
# ============================================================================
# ATLAS TERMINAL v10.0 - LOCAL COLAB LAUNCHER (No ngrok)
# ============================================================================

# Install dependencies
!pip install -q streamlit pandas numpy yfinance plotly scipy streamlit-option-menu openpyxl

# Clone repository
import os
if not os.path.exists('/content/Latest-Atlas-Code'):
    !git clone https://github.com/davenompozolo-blip/Latest-Atlas-Code.git /content/Latest-Atlas-Code
else:
    !cd /content/Latest-Atlas-Code && git pull

# Checkout leverage accounting branch
!cd /content/Latest-Atlas-Code && git checkout claude/audit-report-review-01VoZye3AgZX5zRtJKML4B8v

# Launch Streamlit
print("🚀 Launching ATLAS Terminal v10.0...")
print("⚠️  Use the URL shown below to access the app")
!cd /content/Latest-Atlas-Code && streamlit run atlas_app.py --server.port 8501
```

---

## 🔧 Troubleshooting

### Issue: "ModuleNotFoundError"
**Solution**: Re-run the first cell to install dependencies

### Issue: "Port already in use"
**Solution**: Run this cell to kill existing processes:
```python
!pkill -f streamlit
!pkill -f ngrok
```

### Issue: ngrok tunnel not working
**Solution**:
1. Verify your auth token at https://dashboard.ngrok.com
2. Make sure you copied the entire token
3. Try running the cell again

### Issue: App won't load data
**Solution**:
1. Upload your portfolio data via "🔥 Phoenix Parser" tab
2. Make sure CSV files are properly formatted
3. Check Colab's `/content` directory for uploaded files

---

## 📊 Features Available in v10.0

### ✅ Leverage Accounting
- **Auto-detection** from account history
- **Manual override** in sidebar settings
- **Amplified returns** showing true equity performance
- **Adjusted risk metrics** (volatility, beta, Sharpe ratio)

### ✅ Portfolio Analysis
- Real-time market data via yfinance
- Risk decomposition and attribution
- Monte Carlo simulations
- Factor analysis
- Correlation matrix

### ✅ Valuation Tools
- DCF modeling
- Comparable company analysis
- Dividend discount model
- Sum-of-the-parts valuation

---

## 💾 Data Persistence

Colab sessions are temporary. To preserve your data:

1. **Download portfolio data** regularly
2. **Save to Google Drive**:
```python
from google.colab import drive
drive.mount('/content/drive')

# Save portfolio data
!cp /content/Latest-Atlas-Code/data/* /content/drive/MyDrive/atlas_data/
```

3. **Load from Google Drive**:
```python
from google.colab import drive
drive.mount('/content/drive')

# Load portfolio data
!cp /content/drive/MyDrive/atlas_data/* /content/Latest-Atlas-Code/data/
```

---

## 🎯 Quick Links

- **Repository**: https://github.com/davenompozolo-blip/Latest-Atlas-Code
- **Branch**: `claude/audit-report-review-01VoZye3AgZX5zRtJKML4B8v`
- **Ngrok Dashboard**: https://dashboard.ngrok.com
- **Commit**: `a580022` (v10.0 Leverage Accounting Fix)

---

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all dependencies are installed
3. Ensure portfolio data files are uploaded
4. Check Colab runtime logs for errors

---

**Enjoy your Bloomberg-quality portfolio analytics! 📈💎**
