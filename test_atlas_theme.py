"""
ATLAS Theme System Test
=======================
Quick verification that the new Professional Blue theme imports work.

Run with: python test_atlas_theme.py
"""

def test_theme_imports():
    """Test that theme constants import correctly."""
    print("Testing theme imports...")

    from ui.theme import ATLAS_COLORS, CHART_COLORS, SPACING, FONTS

    # Test 1: Colors loaded
    assert ATLAS_COLORS['primary'] == '#1E88E5', "Primary color mismatch"
    print(f"  ✅ Colors loaded: primary = {ATLAS_COLORS['primary']}")

    # Test 2: Chart colors
    assert len(CHART_COLORS) >= 6, "Need at least 6 chart colors"
    print(f"  ✅ Chart colors: {len(CHART_COLORS)} colors available")

    # Test 3: Spacing
    assert SPACING['md'] == 16, "Default spacing should be 16px"
    print(f"  ✅ Spacing loaded: md = {SPACING['md']}px")

    # Test 4: Fonts
    assert 'Inter' in FONTS['family'], "Inter font should be primary"
    print(f"  ✅ Fonts loaded: {FONTS['family'][:30]}...")

    return True


def test_helper_functions():
    """Test helper functions work correctly."""
    print("\nTesting helper functions...")

    from ui.theme import get_color, get_semantic_color, format_percentage, format_currency

    # Test 1: get_color
    color = get_color('primary')
    assert color == '#1E88E5', "get_color failed"
    print(f"  ✅ get_color('primary') = {color}")

    # Test 2: get_color with opacity
    color_rgba = get_color('primary', 0.5)
    assert 'rgba' in color_rgba, "Opacity should return rgba"
    print(f"  ✅ get_color('primary', 0.5) = {color_rgba}")

    # Test 3: get_semantic_color
    green = get_semantic_color(10)
    red = get_semantic_color(-5)
    assert green == '#43A047', "Positive should be green"
    assert red == '#E53935', "Negative should be red"
    print(f"  ✅ Semantic colors: +10 = green, -5 = red")

    # Test 4: format_percentage
    pct = format_percentage(12.5)
    assert pct == '+12.50%', "Percentage format failed"
    print(f"  ✅ format_percentage(12.5) = {pct}")

    # Test 5: format_currency
    curr = format_currency(1500000)
    assert curr == '$1.5M', "Currency format failed"
    print(f"  ✅ format_currency(1500000) = {curr}")

    return True


def test_chart_helpers():
    """Test chart helper imports."""
    print("\nTesting chart helpers...")

    from ui.charts_professional import (
        apply_atlas_theme,
        create_multi_line_chart,
        create_bar_chart,
        create_donut_chart,
    )

    # Test 1: Functions imported
    assert callable(apply_atlas_theme), "apply_atlas_theme should be callable"
    print(f"  ✅ apply_atlas_theme imported")

    assert callable(create_multi_line_chart), "create_multi_line_chart should be callable"
    print(f"  ✅ create_multi_line_chart imported")

    assert callable(create_bar_chart), "create_bar_chart should be callable"
    print(f"  ✅ create_bar_chart imported")

    assert callable(create_donut_chart), "create_donut_chart should be callable"
    print(f"  ✅ create_donut_chart imported")

    return True


def test_module_init():
    """Test main ui module exports."""
    print("\nTesting ui module exports...")

    from ui import (
        ATLAS_COLORS,
        SPACING,
        apply_atlas_theme,
        create_performance_chart,
    )

    assert ATLAS_COLORS['primary'] == '#1E88E5'
    print(f"  ✅ ATLAS_COLORS exported from ui module")

    assert SPACING['md'] == 16
    print(f"  ✅ SPACING exported from ui module")

    assert callable(apply_atlas_theme)
    print(f"  ✅ apply_atlas_theme exported from ui module")

    assert callable(create_performance_chart)
    print(f"  ✅ create_performance_chart exported from ui module")

    return True


def test_chart_creation():
    """Test actual chart creation with theme."""
    print("\nTesting chart creation...")

    import plotly.graph_objects as go
    from ui.charts_professional import apply_atlas_theme, create_bar_chart

    # Test 1: Apply theme to figure
    fig = go.Figure(data=[go.Scatter(x=[1, 2, 3], y=[4, 5, 6])])
    fig = apply_atlas_theme(fig, chart_type='line', title='Test Chart')

    assert fig.layout.title.text == 'Test Chart', "Title not applied"
    assert fig.layout.plot_bgcolor == 'white', "Background should be white"
    print(f"  ✅ apply_atlas_theme applied successfully")

    # Test 2: Create bar chart
    fig2 = create_bar_chart(
        categories=['A', 'B', 'C'],
        values=[10, -5, 15],
        title='Test Bar Chart'
    )
    assert fig2.layout.title.text == 'Test Bar Chart', "Bar chart title failed"
    print(f"  ✅ create_bar_chart works correctly")

    return True


if __name__ == "__main__":
    print("=" * 60)
    print("ATLAS Professional Blue Theme - Test Suite")
    print("=" * 60)

    try:
        test_theme_imports()
        test_helper_functions()
        test_chart_helpers()
        test_module_init()
        test_chart_creation()

        print("\n" + "=" * 60)
        print("🎉 ALL TESTS PASSED!")
        print("=" * 60)
        print("\nTheme system ready for use.")
        print("Next steps:")
        print("  1. Import theme in atlas_app.py")
        print("  2. Apply to existing charts using apply_atlas_theme()")
        print("  3. Use CHART_COLORS instead of hardcoded colors")

    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
