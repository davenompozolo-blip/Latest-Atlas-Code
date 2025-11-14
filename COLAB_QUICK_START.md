# 🚀 ATLAS Terminal - Colab Quick Start

## Method 1: Simple Cell-by-Cell (Most Reliable)

Copy and paste each cell below into separate Google Colab cells:

### Cell 1: Setup
```python
# Clone and navigate
!git clone https://github.com/davenompozolo-blip/Latest-Atlas-Code.git
%cd Latest-Atlas-Code
!git checkout claude/test-updated-version-01ED2kosfw6PYJkW8UK6BcQJ

print("\n✅ Repository cloned!")
```

### Cell 2: Install Dependencies
```python
# Install all packages
!pip install -q streamlit pandas numpy plotly yfinance scipy scikit-learn openpyxl pyngrok networkx networkx

print("✅ Packages installed!")
```

### Cell 3: Start Server (Keep Running)
```python
# Start Streamlit server
get_ipython().system_raw('streamlit run run.py --server.port=8501 --server.headless=true &')

import time
print("⏳ Starting server...")
time.sleep(15)  # Wait for server to start
print("✅ Server should be running now!")
```

### Cell 4: Create Public URL
```python
# Create ngrok tunnel
from pyngrok import ngrok

# Kill old tunnels
ngrok.kill()

# Create new tunnel
public_url = ngrok.connect(8501)

print("\n" + "="*70)
print("🎉 ATLAS Terminal is LIVE!")
print("="*70)
print(f"\n🔗 Click here to access:")
print(f"\n   {public_url}")
print("\n" + "="*70)
print("\n📝 Next steps:")
print("   1. Click the URL above")
print("   2. On ngrok page, click 'Visit Site'")
print("   3. Upload CSV files using sidebar")
print("   4. Explore the 7 different pages")
print("\n⚠️  Keep Cell 3 running to maintain connection!")
print("="*70)
```

---

## Method 2: One Python Script

Download and run: [colab_setup.py](https://raw.githubusercontent.com/davenompozolo-blip/Latest-Atlas-Code/claude/test-updated-version-01ED2kosfw6PYJkW8UK6BcQJ/colab_setup.py)

```python
!python colab_setup.py
```

---

## Method 3: Super Quick (One Cell)

```python
# Complete setup in one cell - may have mixed output
!git clone https://github.com/davenompozolo-blip/Latest-Atlas-Code.git 2>&1 | tail -1
%cd Latest-Atlas-Code
!git checkout claude/test-updated-version-01ED2kosfw6PYJkW8UK6BcQJ 2>&1 | tail -1
!pip install -q streamlit pandas numpy plotly yfinance scipy scikit-learn openpyxl pyngrok networkx

# Start server in background
get_ipython().system_raw('streamlit run run.py --server.port=8501 --server.headless=true &')

import time
print("\n⏳ Starting Streamlit server (15 seconds)...")
time.sleep(15)

# Create tunnel
from pyngrok import ngrok
ngrok.kill()
public_url = ngrok.connect(8501)

print("\n" + "="*70)
print("🚀 ATLAS Terminal is LIVE!")
print("="*70)
print(f"\n🔗 Access here: {public_url}\n")
print("="*70)
```

---

## 🐛 Troubleshooting

### URL not showing?

Try running cells separately (Method 1) instead of all at once.

### ImportError?

Make sure you're using `run.py` not `atlas_terminal/main.py`:
```python
# ✅ Correct
!streamlit run run.py

# ❌ Wrong
!streamlit run atlas_terminal/main.py
```

### Connection refused?

Wait longer before creating tunnel:
```python
import time
time.sleep(20)  # Try 20 seconds instead of 15
```

### Still not working?

**Manual alternative - Run in separate cells:**

**Cell 1:**
```python
!streamlit run run.py --server.port=8501 --server.headless=true > /dev/null 2>&1 &
```

**Cell 2 (wait 20 seconds, then run):**
```python
from pyngrok import ngrok
import time
time.sleep(5)
ngrok.kill()
tunnel = ngrok.connect(8501)
print(f"\n🔗 URL: {tunnel.public_url}\n")
print(f"Full details:\n{tunnel}")
```

---

## 💡 Tips

### Check if Streamlit is running:
```python
!ps aux | grep streamlit
```

### Check port 8501:
```python
!netstat -tuln | grep 8501
```

### Kill everything and restart:
```python
!pkill -f streamlit
from pyngrok import ngrok
ngrok.kill()
```

Then start fresh from Cell 3.

---

## 📊 What You'll See

Once the URL opens, you'll see:
- **Left sidebar**: Navigation + file upload
- **Main area**: Dashboard with charts and metrics
- **7 pages**: Portfolio Home, Deep Dive, Market Watch, Risk Analysis, Valuation House, Trade Journal, Risk Dashboard

Upload your CSV files in the sidebar to populate with your data!

---

**Need Help?** Make sure:
1. All cells run without errors
2. Cell 3 is still running (don't interrupt it)
3. You waited 15+ seconds before creating tunnel
4. You're in the `Latest-Atlas-Code` directory

---
