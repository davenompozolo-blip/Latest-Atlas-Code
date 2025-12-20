#!/usr/bin/env python3
"""Quick diagnostic test for Avengers branding system"""

print("=" * 60)
print("AVENGERS BRANDING DIAGNOSTIC TEST")
print("=" * 60)

# Test 1: Can we import the module?
print("\n[TEST 1] Importing branding module...")
try:
    from ui.branding import (
        apply_avengers_branding,
        show_shield_logo,
        create_theme_switcher,
        HeroMode,
        IconStyle,
        AvengersTheme
    )
    print("✅ Import successful")
except ImportError as e:
    print(f"❌ Import failed: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

# Test 2: Can we create a theme?
print("\n[TEST 2] Creating theme manager...")
try:
    theme = AvengersTheme(HeroMode.CAPTAIN)
    print(f"✅ Theme created: {theme.current_theme.display_name}")
except Exception as e:
    print(f"❌ Theme creation failed: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

# Test 3: Can we generate CSS?
print("\n[TEST 3] Generating CSS...")
try:
    css = theme.get_css()
    print(f"✅ CSS generated: {len(css)} characters")
    print(f"   First 200 chars: {css[:200]}...")
except Exception as e:
    print(f"❌ CSS generation failed: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

# Test 4: Check files exist
print("\n[TEST 4] Checking files exist...")
from pathlib import Path
branding_dir = Path("ui/branding")
files = [
    "shield_logo.svg",
    "avengers_animations.css",
    "theme_avengers.py",
    "icon_mapper.py",
    "__init__.py"
]

all_exist = True
for file in files:
    path = branding_dir / file
    if path.exists():
        print(f"✅ {file} exists ({path.stat().st_size} bytes)")
    else:
        print(f"❌ {file} MISSING")
        all_exist = False

if not all_exist:
    print("\n❌ Some files are missing!")
    exit(1)

# Test 5: Check CSS contains Avengers-specific content
print("\n[TEST 5] Verifying CSS content...")
if "--primary" in css and "AVENGERS THEME OVERRIDES" in css:
    print("✅ CSS contains expected Avengers theme content")
else:
    print("❌ CSS doesn't contain expected content")
    exit(1)

print("\n" + "=" * 60)
print("✅ ALL TESTS PASSED - Branding system is working!")
print("=" * 60)
print("\nIf you still don't see changes in the app:")
print("1. Make sure you RESTARTED Streamlit")
print("2. Check the Streamlit console for: '✅ Avengers branding system loaded'")
print("3. EXPAND THE SIDEBAR (click arrow in top-left)")
print("4. Look for the shield logo and theme switcher")
