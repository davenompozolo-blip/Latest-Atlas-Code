#!/usr/bin/env python3
"""
ATLAS Page Import Diagnostic Tool
Run this to find exactly what's missing in each page module.
"""

import sys
import os

# Add project root to path
sys.path.insert(0, '/home/user/Latest-Atlas-Code')
os.chdir('/home/user/Latest-Atlas-Code')

# List of all page modules and their render functions
PAGES = [
    ('portfolio_home', 'render_portfolio_home'),
    ('phoenix_parser', 'render_phoenix_parser'),
    ('market_watch', 'render_market_watch'),
    ('valuation_house', 'render_valuation_house'),
    ('risk_analysis', 'render_risk_analysis'),
    ('monte_carlo', 'render_monte_carlo'),
    ('database', 'render_database'),
    ('about', 'render_about'),
    ('quant_optimizer', 'render_quant_optimizer'),
    ('performance_suite', 'render_performance_suite'),
    ('portfolio_deep_dive', 'render_portfolio_deep_dive'),
    ('multi_factor_analysis', 'render_multi_factor_analysis'),
    ('leverage_tracker', 'render_leverage_tracker'),
    ('market_regime', 'render_market_regime'),
    ('investopedia_live', 'render_investopedia_live'),
    ('v10_analytics', 'render_v10_analytics'),
    ('r_analytics', 'render_r_analytics'),
]

def check_page(module_name, func_name):
    """Try to import a page and report what's missing."""
    try:
        module = __import__(f'ui.pages.{module_name}', fromlist=[func_name])
        getattr(module, func_name)
        return True, None
    except NameError as e:
        return False, f"NameError: {e}"
    except ImportError as e:
        return False, f"ImportError: {e}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"

def find_in_codebase(name):
    """Find where a name is defined."""
    import subprocess

    # Search in core/
    result = subprocess.run(
        ['grep', '-rn', f'def {name}\\|{name} =', 'core/'],
        capture_output=True, text=True, cwd='/home/user/Latest-Atlas-Code'
    )
    if result.stdout.strip():
        return f"Found in core/:\n{result.stdout.strip()}"

    # Search in atlas_app.py
    result = subprocess.run(
        ['grep', '-n', f'def {name}\\|{name} =', 'atlas_app.py'],
        capture_output=True, text=True, cwd='/home/user/Latest-Atlas-Code'
    )
    if result.stdout.strip():
        return f"Found in atlas_app.py:\n{result.stdout.strip()}"

    return "NOT FOUND in core/ or atlas_app.py"

print("=" * 60)
print("ATLAS PAGE IMPORT DIAGNOSTIC")
print("=" * 60)
print()

issues = []

for module_name, func_name in PAGES:
    success, error = check_page(module_name, func_name)

    if success:
        print(f"✅ {module_name}")
    else:
        print(f"❌ {module_name}")
        print(f"   Error: {error}")

        # Try to extract the undefined name
        if "NameError" in str(error) and "'" in str(error):
            # Extract name from error like "name 'xyz' is not defined"
            import re
            match = re.search(r"name '(\w+)'", str(error))
            if match:
                undefined_name = match.group(1)
                print(f"   Missing: {undefined_name}")
                location = find_in_codebase(undefined_name)
                print(f"   {location}")

        issues.append((module_name, error))
        print()

print()
print("=" * 60)
print("SUMMARY")
print("=" * 60)

if not issues:
    print("🎉 ALL PAGES LOAD SUCCESSFULLY!")
else:
    print(f"❌ {len(issues)} pages have issues:")
    for module_name, error in issues:
        print(f"   - {module_name}")

print()
print("FIX INSTRUCTIONS:")
print("-" * 40)
print("""
For each broken page:

1. If the missing function is in core/:
   Add it to the imports at the top of the render function:

   from core import (
       ATLASFormatter,
       MISSING_FUNCTION_NAME,  # <-- Add this
   )

2. If the missing function is in atlas_app.py:
   You need to MOVE it to either:
   - The page file itself (copy the function definition)
   - core/ module (then export it in core/__init__.py)

   DO NOT import from atlas_app.py!

3. If the missing name is a variable/constant:
   Import from app.config:

   from app.config import COLORS, MISSING_VARIABLE

4. Test after each fix:
   python3 -c "from ui.pages.MODULE_NAME import render_MODULE_NAME"
""")
