#!/bin/bash
# ATLAS Phase 1B Diagnostic Script
# Run this to check why sidebar isn't showing

echo "========================================"
echo "ATLAS PHASE 1B DIAGNOSTIC"
echo "========================================"
echo ""

echo "1. Current Directory:"
pwd
echo ""

echo "2. Current Git Branch:"
git branch --show-current
echo ""

echo "3. Latest Commit:"
git log --oneline -1
echo ""

echo "4. Checking sidebar component exists:"
if [ -f "ui/components/sidebar_nav.py" ]; then
    echo "✅ ui/components/sidebar_nav.py EXISTS"
    wc -l ui/components/sidebar_nav.py
else
    echo "❌ ui/components/sidebar_nav.py NOT FOUND!"
fi
echo ""

echo "5. Checking sidebar import in atlas_app.py:"
if grep -q "render_sidebar_navigation" atlas_app.py; then
    echo "✅ Sidebar import FOUND in atlas_app.py"
    grep "render_sidebar_navigation" atlas_app.py | head -3
else
    echo "❌ Sidebar import NOT FOUND in atlas_app.py!"
fi
echo ""

echo "6. Checking if horizontal nav is commented out:"
if grep -q "# page = option_menu(" atlas_app.py; then
    echo "✅ Horizontal navigation IS commented out"
else
    echo "❌ Horizontal navigation is NOT commented out!"
    echo "Checking for active option_menu call..."
    grep -n "page = option_menu(" atlas_app.py
fi
echo ""

echo "7. Checking sidebar state in page config:"
grep "initial_sidebar_state" atlas_app.py
echo ""

echo "8. Checking for Streamlit processes:"
ps aux | grep streamlit | grep -v grep || echo "No Streamlit processes running"
echo ""

echo "========================================"
echo "NEXT STEPS:"
echo "========================================"
echo "If all checks pass (✅), the issue is likely:"
echo "  - Streamlit cache (clear with Ctrl+C and restart)"
echo "  - Browser cache (hard refresh: Ctrl+Shift+R)"
echo "  - Running from wrong directory/branch"
echo ""
echo "If any checks fail (❌), report which ones failed."
echo ""
