# ============================================================================
# ATLAS TERMINAL v10.0 INSTITUTIONAL - GOOGLE COLAB DEPLOYMENT
# HORIZONTAL NAVIGATION BAR - MAXIMUM SCREEN SPACE VERSION
# ============================================================================

print("🚀 Installing required packages...")
!pip install -q streamlit streamlit-option-menu pyngrok yfinance plotly scikit-learn scipy networkx openpyxl xlsxwriter beautifulsoup4
!pip install -q --no-deps easy-equities-client

print("\n📥 Downloading ATLAS Terminal v10.0 INSTITUTIONAL (Horizontal Navigation)...")
import urllib.request
import os
import ast

# Download from the latest branch with horizontal navigation
BRANCH = "claude/atlas-terminal-colab-013NUMuv1xDsArYKYqWjMykR"
url = f"https://raw.githubusercontent.com/davenompozolo-blip/Latest-Atlas-Code/{BRANCH}/atlas_app.py"

print(f"Downloading from branch: {BRANCH}")
print(f"Version: v10.0 INSTITUTIONAL with HORIZONTAL NAVIGATION BAR")
print(f"URL: {url}")

try:
    urllib.request.urlretrieve(url, "atlas_app.py")
    print("✅ Downloaded successfully")
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
    "option_menu",
    "orientation=\"horizontal\"",
    "HORIZONTAL NAVIGATION"
]

missing = []
for feature in required_features:
    if feature not in content:
        missing.append(feature)

if missing:
    print(f"⚠️  Some features not detected (may be renamed): {missing}")
else:
    print("✅ Version verified: v10.0 INSTITUTIONAL with HORIZONTAL NAVIGATION")

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

# Set ngrok auth token (replace with your token)
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
print("🎉 ATLAS TERMINAL v10.0 INSTITUTIONAL - HORIZONTAL NAVIGATION - LIVE!")
print("="*80)
print()
print(f"🔗 PUBLIC URL: {public_url}")
print()
print("="*80)
print("✨ NEW UI ENHANCEMENTS:")
print("="*80)
print("   ✓ Horizontal navigation bar at the top (maximum screen space)")
print("   ✓ Header row with branding + Time Range + Benchmark controls")
print("   ✓ Full-width content area (100% screen utilization)")
print("   ✓ Professional cyan accent colors (#00d4ff)")
print("   ✓ Responsive design with scrollable menu on smaller screens")
print("   ✓ No sidebar - all navigation in compact horizontal menu")
print("   ✓ Gradient text effects on headers")
print("   ✓ Enhanced metric cards with professional styling")
print()
print("📊 CORE FEATURES:")
print("   ✓ 9 navigation modules accessible via horizontal menu")
print("   ✓ Two-stage diversification optimizer")
print("   ✓ Institutional Performance Suite (4 tabs)")
print("   ✓ Portfolio Correlation Heatmap")
print("   ✓ Brinson Attribution Analysis")
print("   ✓ Export Center (Excel/CSV)")
print("   ✓ Saved Views System")
print()
print("💡 NAVIGATION:")
print("   • Click any menu item in the horizontal bar to switch modules")
print("   • Time Range and Benchmark selectors in top-right corner")
print("   • Full-width charts and tables for better data visualization")
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
