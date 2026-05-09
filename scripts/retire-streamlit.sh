#!/bin/bash
# ============================================
# ATLAS — Streamlit Retirement Script
# Run this after confirming full view parity
# ============================================

echo "═══════════════════════════════════════════"
echo "  ATLAS — Streamlit Retirement"
echo "═══════════════════════════════════════════"

# 1. Archive to legacy branch
echo "\n[1/5] Creating legacy branch archive..."
git checkout -b legacy/streamlit-archive
git push origin legacy/streamlit-archive
git checkout main

# 2. Remove Streamlit files
echo "\n[2/5] Removing Streamlit files..."
rm -rf .streamlit/
find . -name "*.py" -path "*/streamlit*" -delete
find . -name "streamlit_*.py" -delete
# Add specific Streamlit files if they exist at root
rm -f app.py streamlit_app.py dashboard.py

# 3. Clean up dependencies
echo "\n[3/5] Cleaning dependencies..."
if [ -f requirements.txt ]; then
  sed -i '/streamlit/d' requirements.txt
  sed -i '/plotly/d' requirements.txt  # if only used by Streamlit
  echo "  Cleaned requirements.txt"
fi

# 4. Update .gitignore
echo "\n[4/5] Updating .gitignore..."
echo "" >> .gitignore
echo "# Streamlit (retired)" >> .gitignore
echo ".streamlit/" >> .gitignore

# 5. Commit
echo "\n[5/5] Committing retirement..."
git add -A
git commit -m "chore: retire Streamlit dashboard — React terminal is the single source of truth

- Archived to legacy/streamlit-archive branch
- Removed .streamlit/ config directory
- Removed Streamlit Python files
- Cleaned dependencies
- ATLAS React terminal on Vercel is now the only dashboard"

echo "\n═══════════════════════════════════════════"
echo "  Streamlit retired. One terminal. One truth."
echo "═══════════════════════════════════════════"
