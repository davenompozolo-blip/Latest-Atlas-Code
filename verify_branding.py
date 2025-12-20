from pathlib import Path

print("VERIFICATION")
print("=" * 60)

checks = {
    'shield_logo.svg': Path('ui/branding/shield_logo.svg').exists(),
    'avengers_animations.css': Path('ui/branding/avengers_animations.css').exists(),
}

app_content = Path('atlas_app.py').read_text() if Path('atlas_app.py').exists() else ""

checks['unsafe_allow_html in atlas_app'] = 'unsafe_allow_html=True' in app_content
checks['shield_logo.svg loaded'] = 'shield_logo.svg' in app_content
checks['Old tagline removed'] = 'Bloomberg Terminal-Quality' not in app_content
checks['New slogan present'] = 'Institutional Intelligence' in app_content

css_content = Path('ui/branding/avengers_animations.css').read_text() if Path('ui/branding/avengers_animations.css').exists() else ""
checks['Inter font imported'] = 'Inter' in css_content

passed = sum(checks.values())
total = len(checks)

for name, result in checks.items():
    print(f"{'PASS' if result else 'FAIL'} {name}")

print("=" * 60)
print(f"SCORE: {passed}/{total} ({passed/total*100:.0f}%)")

if passed == total:
    print("ALL CHECKS PASSED")
else:
    print("FAILURES DETECTED - FIX BEFORE CLAIMING COMPLETE")
