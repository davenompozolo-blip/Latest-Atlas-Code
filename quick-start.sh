#!/bin/bash

# ============================================================================
# ATLAS TERMINAL - QUICK START (Local Development)
# ============================================================================

echo "🚀 ATLAS Terminal Quick Start"
echo "============================="
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
pip3 install -q -r requirements.txt

echo ""
echo "✅ Starting ATLAS Terminal..."
echo ""
echo "🌐 Access at: http://localhost:8501"
echo ""
echo "Press CTRL+C to stop"
echo ""

# Start Streamlit
streamlit run atlas_app.py \
    --server.port=8501 \
    --server.headless=true
