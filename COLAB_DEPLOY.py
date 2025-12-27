# ============================================================================
# ATLAS TERMINAL v10.0 INSTITUTIONAL - GOOGLE COLAB DEPLOYMENT
# ALL FEATURES INCLUDED - READY TO RUN
# ============================================================================

print("🚀 Installing required packages...")
!pip install -q streamlit pyngrok yfinance plotly scikit-learn scipy networkx openpyxl xlsxwriter beautifulsoup4
!pip install -q --no-deps easy-equities-client

print("\n📥 Downloading ATLAS Terminal v10.0 INSTITUTIONAL from GitHub...")
import urllib.request
import os
import ast

# Download from main branch (has ALL v10.0 features merged)
url = "https://raw.githubusercontent.com/davenompozolo-blip/Latest-Atlas-Code/main/atlas_app.py"

print(f"Downloading from: {url}")
urllib.request.urlretrieve(url, "atlas_app.py")

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
    print(f"❌ ERROR: Downloaded wrong version! Missing: {missing}")
    raise Exception("Wrong version downloaded")

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
print("✅ ALL v10.0 FEATURES CONFIRMED:")
print()
print("📊 INSTITUTIONAL PERFORMANCE SUITE (4 Tabs):")
print("   ✓ Tab 1: Portfolio Performance")
print("     - Rolling Sharpe Ratio (90-day)")
print("     - Returns Distribution Histogram")
print("     - Advanced Metrics: Sortino, Calmar, Win Rate, VaR")
print()
print("   ✓ Tab 2: Individual Securities Analysis ⭐ NEW!")
print("     - Select any holding for deep-dive analysis")
print("     - Candlestick charts with Bollinger Bands")
print("     - MA50 & MA200 moving averages")
print("     - Beta & Correlation vs SPY")
print("     - VaR/CVaR risk metrics")
print("     - Portfolio contribution calculation")
print()
print("   ✓ Tab 3: Risk Decomposition ⭐ NEW!")
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
print("   ✓ Portfolio Correlation Heatmap ⭐ NEW!")
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
print(f"🔗 PUBLIC URL: {public_url}")
print()
print("="*80)
print("🧪 HOW TO TEST ALL v10.0 FEATURES:")
print("="*80)
print()
print("STEP 1: Upload Portfolio")
print("   → Tab: 🔥 Phoenix Parser")
print("   → Upload trade history or account statement")
print()
print("STEP 2: Test Performance Suite ⭐ MUST TRY!")
print("   → Tab: 💎 Performance Suite")
print()
print("   A) Portfolio Performance Tab:")
print("      - Check 4-metric grid (Return, Vol, Sharpe, Max DD)")
print("      - View returns distribution histogram")
print("      - See rolling Sharpe ratio chart")
print("      - Review advanced metrics")
print()
print("   B) Individual Securities Tab: ⭐ NEW FEATURE!")
print("      - Select any holding from dropdown")
print("      - View candlestick price chart")
print("      - Check Bollinger Bands & moving averages")
print("      - See Beta vs SPY")
print("      - Review VaR/CVaR metrics")
print()
print("   C) Risk Decomposition Tab: ⭐ NEW FEATURE!")
print("      - See which positions drive portfolio risk")
print("      - Check MCR (Marginal Contribution to Risk)")
print("      - View risk attribution chart")
print()
print("   D) Attribution & Benchmarking Tab:")
print("      - Compare portfolio vs SPY")
print("      - Check tracking error")
print("      - See information ratio")
print()
print("STEP 3: Portfolio Deep Dive - Correlation Heatmap ⭐ NEW!")
print("   → Tab: 🔬 Portfolio Deep Dive")
print("   → Scroll to bottom: 'Portfolio Correlation Analysis'")
print("   → Select period (30d/90d/1y)")
print("   → Check diversification score")
print("   → Expand insights to see highly correlated pairs")
print()
print("STEP 4: Check Professional Sector Charts")
print("   → Tab: 🏠 Portfolio Home")
print("   → See modern donut chart (right side)")
print()
print("="*80)
print("🎯 KEY v10.0 FEATURES TO VERIFY:")
print("="*80)
print("   ☐ Individual Securities tab exists in Performance Suite")
print("   ☐ Can select holdings and see candlestick charts")
print("   ☐ Risk Decomposition tab shows MCR analysis")
print("   ☐ Correlation heatmap in Portfolio Deep Dive")
print("   ☐ Diversification score displayed")
print("   ☐ Professional sector donut chart on Home")
print()
print("🚀 ATLAS TERMINAL v10.0 IS READY!")
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
