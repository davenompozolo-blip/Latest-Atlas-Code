#!/bin/bash
# Verify all page modules compile without errors

echo "=== VERIFYING ALL PAGE MODULES ==="
echo ""

pages=(
    "portfolio_home"
    "phoenix_parser"
    "market_watch"
    "valuation_house"
    "risk_analysis"
    "monte_carlo"
    "database"
    "about"
    "quant_optimizer"
    "performance_suite"
    "portfolio_deep_dive"
    "multi_factor_analysis"
    "leverage_tracker"
    "market_regime"
    "investopedia_live"
    "v10_analytics"
    "r_analytics"
)

success_count=0
fail_count=0
failed_pages=()

for page in "${pages[@]}"; do
    echo -n "Testing $page.py ... "
    if python3 -m py_compile "ui/pages/${page}.py" 2>/dev/null; then
        echo "✅ OK"
        ((success_count++))
    else
        echo "❌ FAILED"
        ((fail_count++))
        failed_pages+=("$page")
    fi
done

echo ""
echo "==========================================="
echo "SUMMARY"
echo "==========================================="
echo "✅ Passed: $success_count / ${#pages[@]}"
echo "❌ Failed: $fail_count / ${#pages[@]}"

if [ $fail_count -gt 0 ]; then
    echo ""
    echo "Failed pages:"
    for page in "${failed_pages[@]}"; do
        echo "  - $page"
    done
    exit 1
else
    echo ""
    echo "🎉 ALL PAGES COMPILE SUCCESSFULLY!"
    exit 0
fi
