#!/bin/bash
# Analyze each page for undefined function calls

echo "=== ANALYZING PAGE MODULES FOR UNDEFINED REFERENCES ==="
echo ""

for page in ui/pages/*.py; do
    echo "=========================================="
    echo "FILE: $page"
    echo "=========================================="

    # Extract function calls (name followed by parenthesis)
    echo "Function calls found:"
    grep -oE "[a-zA-Z_][a-zA-Z0-9_]*\(" "$page" | sed 's/($//' | sort -u | head -40

    echo ""
    echo "Current imports:"
    grep -E "^from |^import " "$page" | head -30

    echo ""
    echo "==========================================  "
    echo ""
done
