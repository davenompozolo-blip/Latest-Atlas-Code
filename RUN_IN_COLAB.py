"""
🚀 ATLAS TERMINAL v10.0 - GOOGLE COLAB LAUNCHER
================================================

INSTRUCTIONS:
1. Copy this entire file
2. Paste into a new Google Colab cell
3. Run the cell (Shift + Enter)
4. Follow the prompts

FEATURES:
✅ Leverage Accounting Fix (v10.0)
✅ Auto-detect or manual leverage settings
✅ Accurate returns on equity (not notional)
✅ Leverage-adjusted risk metrics
✅ Professional portfolio analytics
"""

# ============================================================================
# STEP 1: INSTALL DEPENDENCIES
# ============================================================================
print("📦 Installing dependencies... (this may take 1-2 minutes)")
print("-" * 80)

import subprocess
import sys

def install(package):
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", package])

packages = [
    "streamlit",
    "pandas",
    "numpy",
    "yfinance",
    "plotly",
    "scipy",
    "streamlit-option-menu",
    "openpyxl",
    "pyngrok"
]

for pkg in packages:
    try:
        install(pkg)
    except:
        print(f"⚠️  Warning: Could not install {pkg}")

print("✅ Dependencies installed!\n")

# ============================================================================
# STEP 2: CLONE REPOSITORY
# ============================================================================
import os

if not os.path.exists('/content/Latest-Atlas-Code'):
    print("📥 Cloning Latest-Atlas-Code repository...")
    print("-" * 80)
    os.system("git clone https://github.com/davenompozolo-blip/Latest-Atlas-Code.git /content/Latest-Atlas-Code 2>&1 | grep -v 'Cloning\\|Receiving\\|Resolving'")
    print("✅ Repository cloned!\n")
else:
    print("📂 Repository exists, pulling latest changes...")
    print("-" * 80)
    os.system("cd /content/Latest-Atlas-Code && git pull origin claude/audit-report-review-01VoZye3AgZX5zRtJKML4B8v")
    print("✅ Repository updated!\n")

# Checkout the leverage accounting branch
os.system("cd /content/Latest-Atlas-Code && git checkout claude/audit-report-review-01VoZye3AgZX5zRtJKML4B8v 2>&1 | grep -v 'Already on'")

# ============================================================================
# STEP 3: NGROK SETUP
# ============================================================================
print("=" * 80)
print("🔑 NGROK AUTHENTICATION REQUIRED")
print("=" * 80)
print("\nTo access Atlas Terminal from any device, you need a free ngrok account:")
print("\n📌 Steps:")
print("   1. Visit: https://dashboard.ngrok.com/get-started/your-authtoken")
print("   2. Sign up (free, takes 30 seconds)")
print("   3. Copy your auth token")
print("   4. Paste it below")
print("\n⚠️  Without this, you won't be able to access the terminal.")
print("=" * 80 + "\n")

ngrok_token = input("🔐 Paste your ngrok auth token here: ").strip()

if not ngrok_token:
    print("\n❌ No token provided. Cannot continue.")
    print("💡 Tip: Get a free token at https://dashboard.ngrok.com")
    sys.exit(1)

# ============================================================================
# STEP 4: CONFIGURE NGROK
# ============================================================================
from pyngrok import ngrok, conf
conf.get_default().auth_token = ngrok_token

# Kill any existing processes
os.system("pkill -f streamlit 2>/dev/null")
os.system("pkill -f ngrok 2>/dev/null")

# ============================================================================
# STEP 5: LAUNCH STREAMLIT
# ============================================================================
print("\n🚀 Launching ATLAS Terminal v10.0...")
print("⏳ Starting Streamlit server... (15 seconds)")
print("-" * 80 + "\n")

import subprocess
import time
from pyngrok import ngrok

# Start Streamlit in background
streamlit_process = subprocess.Popen(
    [
        sys.executable, "-m", "streamlit", "run",
        "/content/Latest-Atlas-Code/atlas_app.py",
        "--server.port", "8501",
        "--server.headless", "true",
        "--browser.serverAddress", "localhost",
        "--browser.gatherUsageStats", "false",
        "--theme.base", "dark"
    ],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    cwd="/content/Latest-Atlas-Code"
)

# Wait for Streamlit to initialize
time.sleep(15)

# ============================================================================
# STEP 6: CREATE PUBLIC TUNNEL
# ============================================================================
print("🌐 Creating public tunnel...")
public_url = ngrok.connect(8501, bind_tls=True)

# ============================================================================
# SUCCESS MESSAGE
# ============================================================================
print("\n" + "=" * 80)
print("✅ ATLAS TERMINAL v10.0 IS LIVE!")
print("=" * 80)
print(f"\n🌐 YOUR PUBLIC URL:")
print(f"   {public_url}")
print(f"\n   👆 Click this link to open Atlas Terminal")
print("\n" + "=" * 80)
print("🆕 WHAT'S NEW IN v10.0:")
print("=" * 80)
print("""
📊 LEVERAGE ACCOUNTING FIX
   ✅ Accurate cost basis for leveraged positions
   ✅ Returns reflect true equity performance
   ✅ Portfolio weights show actual capital allocation
   ✅ Leverage-adjusted volatility and beta

⚙️  SIDEBAR SETTINGS
   ✅ Auto-detect leverage from account history
   ✅ Manual override option (1.0x to 4.0x)
   ✅ Visual leverage indicators (🟢🟡🔴)

💼 PORTFOLIO HOME
   ✅ Equity vs. notional cost breakdown
   ✅ Margin used and buying power display
   ✅ Leverage-adjusted Sharpe ratio & alpha
   ✅ Real-time risk metrics
""")
print("=" * 80)
print("📚 HOW TO USE:")
print("=" * 80)
print("""
1. Click the URL above to open Atlas Terminal
2. Go to "🔥 Phoenix Parser" tab
3. Upload your portfolio CSV files
4. Navigate to "🏠 Portfolio Home"
5. Review your leverage-adjusted metrics
6. Check sidebar for account settings

💡 TIPS:
   - Sidebar shows auto-detected leverage
   - Toggle "Auto-detect leverage" to override manually
   - All returns now show performance on YOUR equity
   - Portfolio weights sum to leverage_ratio × 100%
""")
print("=" * 80)
print("⚠️  IMPORTANT:")
print("=" * 80)
print("""
⏰ Keep this Colab notebook open while using Atlas Terminal
🔄 Free tier: Session expires after ~12 hours
💾 Download your data regularly (Colab storage is temporary)
🛑 To stop: Runtime → Interrupt execution

📊 Your URL will stay active as long as this cell is running
""")
print("=" * 80)
print("\n✨ Enjoy your Bloomberg-quality portfolio analytics! 💎\n")
print("=" * 80)

# ============================================================================
# KEEP ALIVE
# ============================================================================
try:
    # Keep the process running
    streamlit_process.wait()
except KeyboardInterrupt:
    print("\n\n🛑 Shutting down ATLAS Terminal...")
    streamlit_process.kill()
    ngrok.kill()
    print("✅ Shutdown complete. Run the cell again to restart.")
