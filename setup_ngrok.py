#!/usr/bin/env python3
"""Setup ngrok tunnel for ATLAS Terminal"""
import time
from pyngrok import ngrok

# Set auth token
ngrok.set_auth_token("3560NW1Q6pfr5LKXYCFxvt6JnAI_39PX8PaW3aGqhTTr2yo2M")

# Kill any existing tunnels
ngrok.kill()

# Wait a moment
time.sleep(2)

# Create tunnel
public_url = ngrok.connect(8501)

print(f"\n{'='*80}")
print(f"🎉 ATLAS TERMINAL v10.0 INSTITUTIONAL EDITION - READY!")
print(f"{'='*80}\n")

print(f"✅ ALL INNOVATION BRIEF FEATURES COMPLETE:")
print(f"   🏥 Phase 1: Health Dashboard + Brinson Attribution + Sector Comparison")
print(f"   📊 Phase 2: Scenarios + Factor Analysis + Smart Alerts + EXPORT CENTER")
print(f"   ⚡ Phase 3: Saved Views + Performance + Interactivity\n")

print(f"🔗 PUBLIC URL: {public_url}\n")

print(f"📥 EXPORT CENTER:")
print(f"   • Multi-sheet Excel workbooks (6 sheets)")
print(f"   • CSV data exports")
print(f"   • Professional formatting")
print(f"   • One-click downloads\n")

print(f"💾 SAVED VIEWS:")
print(f"   • Default, Risk Focus, Performance Focus")
print(f"   • Save your own custom presets")
print(f"   • Instant configuration switching\n")

print(f"🚀 READY TO USE - Navigate to Portfolio Home!")
print(f"{'='*80}\n")

# Keep tunnel alive
while True:
    time.sleep(60)
