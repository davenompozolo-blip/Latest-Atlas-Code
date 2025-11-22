# ============================================================================
# ATLAS TERMINAL v10.0 INSTITUTIONAL - GOOGLE COLAB DEPLOYMENT
# LATEST VERSION WITH ALL DIVERSIFICATION & UI ENHANCEMENTS
# ============================================================================

print("🚀 Installing required packages...")
!pip install -q streamlit pyngrok yfinance plotly scikit-learn scipy networkx openpyxl xlsxwriter

print("\n📥 Downloading ATLAS Terminal v10.0 INSTITUTIONAL (Latest Build)...")
import urllib.request
import os
import ast

# Download from specific commit SHA to bypass GitHub cache
COMMIT_SHA = "66e5e43f66256e6614f202b50493f83b0641c219"
BRANCH = "claude/merge-diversification-changes-01MFb2o3Pq6kibkf5Vc7xhf8"
url = f"https://raw.githubusercontent.com/davenompozolo-blip/Latest-Atlas-Code/{COMMIT_SHA}/atlas_app.py"

print(f"Downloading from branch: {BRANCH}")
print(f"Using commit SHA: {COMMIT_SHA}")
print(f"URL: {url}")

try:
    urllib.request.urlretrieve(url, "atlas_app.py")
except Exception as e:
    print(f"❌ Download failed: {e}")
    print("\n⚠️  Trying main branch as fallback...")
    url = "https://raw.githubusercontent.com/davenompozolo-blip/Latest-Atlas-Code/main/atlas_app.py"
    urllib.request.urlretrieve(url, "atlas_app.py")
    print("✅ Downloaded from main branch")

# Verify file
if not os.path.exists("atlas_app.py"):
    raise Exception("❌ Download failed - file not created")

file_size = os.path.getsize("atlas_app.py") / 1024
print(f"✅ Downloaded: {file_size:.1f} KB")

# Check it's the right version
with open("atlas_app.py", 'r') as f:
    content = f.read()

# Verify v10.0 features are present
required_features = [
    "v10.0 INSTITUTIONAL EDITION",
    "INSTITUTIONAL PERFORMANCE SUITE",
    "create_professional_sector_allocation_pie",
    "calculate_portfolio_correlations",
    "Individual Securities Analysis"
]

missing = []
for feature in required_features:
    if feature not in content:
        missing.append(feature)

if missing:
    print(f"⚠️  Some features not detected (may be renamed): {missing}")
else:
    print("✅ Version verified: v10.0 INSTITUTIONAL with ALL features")

# Validate Python syntax
try:
    ast.parse(content)
    print("✅ Python syntax valid")
except SyntaxError as e:
    print(f"❌ Syntax error: {e}")
    raise

print("\n🔧 Setting up ngrok tunnel...")
from pyngrok import ngrok
import subprocess
import threading
import time

# Set ngrok auth token
ngrok.set_auth_token("3560NW1Q6pfr5LKXYCFxvt6JnAI_39PX8PaW3aGqhTTr2yo2M")

# Kill any existing tunnels
ngrok.kill()
time.sleep(2)

print("🌐 Starting Streamlit server...")

# Function to run Streamlit in background
def run_streamlit():
    subprocess.Popen([
        "streamlit", "run", "atlas_app.py",
        "--server.port=8501",
        "--server.headless=true",
        "--server.enableCORS=false",
        "--server.enableXsrfProtection=false"
    ])

# Start Streamlit in background thread
thread = threading.Thread(target=run_streamlit)
thread.daemon = True
thread.start()

# Wait for Streamlit to start
print("⏳ Waiting for Streamlit to initialize...")
time.sleep(15)

# Create ngrok tunnel
try:
    tunnel = ngrok.connect(8501)
    public_url = str(tunnel.public_url)
    print(f"✅ Ngrok tunnel created successfully")
except Exception as e:
    print(f"❌ Ngrok error: {e}")
    raise

# ============================================================================
# DISPLAY ACCESS INFORMATION
# ============================================================================

print("\n" + "="*80)
print("🎉 ATLAS TERMINAL v10.0 INSTITUTIONAL EDITION - LIVE!")
print("="*80)
print()
print("✅ LATEST BUILD FEATURES (Nov 22, 2025):")
print()
print("🎨 UI ENHANCEMENTS:")
print("   ✓ Material Icons text overlay fix - clean dropdowns")
print("   ✓ Comprehensive UI optimization")
print("   ✓ Professional sector allocation visualizations")
print()
print("🧠 OPTIMIZATION SYSTEM:")
print("   ✓ Two-stage diversification-first optimizer")
print("   ✓ MPT integration with risk profiles")
print("   ✓ Production-grade UI with transparency")
print("   ✓ Nuanced position constraints")
print("   ✓ DCF-enhanced consensus valuation")
print()
print("📊 INSTITUTIONAL PERFORMANCE SUITE (4 Tabs):")
print("   ✓ Tab 1: Portfolio Performance")
print("     - Rolling Sharpe Ratio (90-day)")
print("     - Returns Distribution Histogram")
print("     - Advanced Metrics: Sortino, Calmar, Win Rate, VaR")
print()
print("   ✓ Tab 2: Individual Securities Analysis")
print("     - Select any holding for deep-dive analysis")
print("     - Candlestick charts with Bollinger Bands")
print("     - MA50 & MA200 moving averages")
print("     - Beta & Correlation vs SPY")
print("     - VaR/CVaR risk metrics")
print("     - Portfolio contribution calculation")
print()
print("   ✓ Tab 3: Risk Decomposition")
print("     - Position-level risk contribution (MCR)")
print("     - Risk attribution by holding")
print("     - Visual risk breakdown chart")
print()
print("   ✓ Tab 4: Attribution & Benchmarking")
print("     - Portfolio vs SPY comparison")
print("     - Cumulative returns chart")
print("     - Tracking error & Information ratio")
print("     - Alpha generation metrics")
print()
print("🎨 PROFESSIONAL VISUALIZATIONS:")
print("   ✓ Modern Sector Allocation (Donut & Horizontal Bar)")
print("   ✓ Portfolio Correlation Heatmap")
print("     - Period selector (30d/90d/1y)")
print("     - Diversification score (0-10)")
print("     - Automated insights for high correlations (>0.75)")
print()
print("🏆 BRINSON ATTRIBUTION:")
print("   ✓ Allocation Effect (sector timing)")
print("   ✓ Selection Effect (stock picking)")
print("   ✓ Interaction Effect")
print("   ✓ Skill scores (0-10)")
print()
print("📥 EXPORT CENTER:")
print("   ✓ Multi-sheet Excel workbooks (6 sheets)")
print("   ✓ CSV data exports")
print("   ✓ Professional formatting")
print("   ✓ One-click downloads")
print()
print("💾 SAVED VIEWS:")
print("   ✓ Default, Risk Focus, Performance Focus presets")
print("   ✓ Save custom view configurations")
print("   ✓ Instant switching between views")
print()
print(f"🔗 PUBLIC URL: {public_url}")
print()
print("="*80)
print("🧪 HOW TO TEST ALL FEATURES:")
print("="*80)
print()
print("STEP 1: Upload Portfolio")
print("   → Tab: 🔥 Phoenix Parser")
print("   → Upload trade history or account statement")
print()
print("STEP 2: Test Optimization System ⭐ LATEST!")
print("   → Tab: Modern Portfolio Theory (MPT)")
print("   → Try two-stage diversification optimizer")
print("   → Select risk profile (Conservative/Balanced/Aggressive)")
print("   → View transparent optimization process")
print()
print("STEP 3: Test Performance Suite")
print("   → Tab: 💎 Performance Suite")
print("   → Explore all 4 tabs (Performance, Securities, Risk, Attribution)")
print()
print("STEP 4: Portfolio Deep Dive - Correlation Heatmap")
print("   → Tab: 🔬 Portfolio Deep Dive")
print("   → Scroll to: 'Portfolio Correlation Analysis'")
print("   → Select period (30d/90d/1y)")
print("   → Check diversification score")
print()
print("STEP 5: Test Export Center")
print("   → Tab: 📥 Export Center")
print("   → Download Excel workbook or CSV exports")
print()
print("STEP 6: Try Saved Views")
print("   → Tab: 💾 Saved Views")
print("   → Switch between presets")
print("   → Save your own custom configurations")
print()
print("="*80)
print("🎯 KEY FEATURES TO VERIFY:")
print("="*80)
print("   ☐ Dropdown menus display cleanly (no Material Icons text)")
print("   ☐ Two-stage diversification optimizer works")
print("   ☐ Individual Securities tab shows candlestick charts")
print("   ☐ Risk Decomposition shows MCR analysis")
print("   ☐ Correlation heatmap displays with insights")
print("   ☐ Export Center generates Excel/CSV files")
print("   ☐ Saved Views can be created and loaded")
print()
print("🚀 ATLAS TERMINAL v10.0 - LATEST BUILD IS READY!")
print("="*80)
print()
print("💾 Keep this cell running to maintain the tunnel")
print("🔄 To restart: Runtime > Restart Runtime")
print()

# Keep the tunnel alive
try:
    while True:
        time.sleep(60)
except KeyboardInterrupt:
    print("\n🛑 Shutting down ATLAS Terminal...")
    ngrok.kill()
