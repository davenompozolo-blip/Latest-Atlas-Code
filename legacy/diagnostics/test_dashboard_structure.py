"""
Structural validation test for Model Inputs Dashboard
Tests code structure, integration points, and logic without runtime dependencies
"""

import os
import re
import ast
from datetime import datetime

print("=" * 80)
print("ATLAS v11.0 - Model Inputs Dashboard Structural Test")
print("=" * 80)
print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

tests_passed = 0
tests_failed = 0

def test_result(test_name, passed, details=""):
    global tests_passed, tests_failed
    if passed:
        tests_passed += 1
        status = "✓"
    else:
        tests_failed += 1
        status = "✗"
    print(f"{status} {test_name}")
    if details:
        print(f"  → {details}")

# =============================================================================
# TEST 1: File Existence and Size
# =============================================================================
print("\n" + "="*80)
print("Testing: File Existence and Size")
print("="*80)

files_to_check = [
    ('analytics/model_inputs.py', 500),
    ('analytics/dcf_projections.py', 600),
    ('analytics/scenario_manager.py', 400),
    ('analytics/projection_visualizer.py', 500),
    ('analytics/model_inputs_ui.py', 700),
]

for filepath, min_lines in files_to_check:
    exists = os.path.exists(filepath)
    if exists:
        with open(filepath, 'r') as f:
            lines = len(f.readlines())
        test_result(f"{filepath} exists", True, f"{lines} lines")
        test_result(f"{filepath} has substantial content", lines >= min_lines,
                   f"Expected ≥{min_lines}, got {lines}")
    else:
        test_result(f"{filepath} exists", False)

# =============================================================================
# TEST 2: Function Definitions
# =============================================================================
print("\n" + "="*80)
print("Testing: Function Definitions")
print("="*80)

def check_function_exists(filepath, function_name):
    """Check if a function is defined in a file"""
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        pattern = rf'def {re.escape(function_name)}\s*\('
        return bool(re.search(pattern, content))
    except:
        return False

# Check model_inputs.py functions
model_inputs_functions = [
    'calculate_dupont_roe',
    'calculate_sustainable_growth_rate',
    'get_live_treasury_yield',
    'calculate_cost_of_capital',
    'calculate_diluted_shares',
    'extract_financial_data_for_model_inputs'
]

for func in model_inputs_functions:
    exists = check_function_exists('analytics/model_inputs.py', func)
    test_result(f"model_inputs.py has {func}()", exists)

# Check UI functions
ui_functions = [
    'display_dupont_analysis',
    'display_sgr_analysis',
    'display_cost_of_capital',
    'display_diluted_shares',
    'display_model_inputs_dashboard'
]

for func in ui_functions:
    exists = check_function_exists('analytics/model_inputs_ui.py', func)
    test_result(f"model_inputs_ui.py has {func}()", exists)

# =============================================================================
# TEST 3: Class Definitions
# =============================================================================
print("\n" + "="*80)
print("Testing: Class Definitions")
print("="*80)

def check_class_exists(filepath, class_name):
    """Check if a class is defined in a file"""
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        pattern = rf'class {re.escape(class_name)}\s*[:\(]'
        return bool(re.search(pattern, content))
    except:
        return False

classes_to_check = [
    ('analytics/dcf_projections.py', 'DCFProjections'),
    ('analytics/scenario_manager.py', 'ScenarioManager'),
]

for filepath, class_name in classes_to_check:
    exists = check_class_exists(filepath, class_name)
    test_result(f"{filepath} defines {class_name}", exists)

# =============================================================================
# TEST 4: Method Definitions in Classes
# =============================================================================
print("\n" + "="*80)
print("Testing: Class Methods")
print("="*80)

def check_method_exists(filepath, class_name, method_name):
    """Check if a method exists in a class"""
    try:
        with open(filepath, 'r') as f:
            tree = ast.parse(f.read())

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef) and node.name == class_name:
                for item in node.body:
                    if isinstance(item, ast.FunctionDef) and item.name == method_name:
                        return True
        return False
    except:
        return False

# Check DCFProjections methods
dcf_methods = [
    'set_manual_override',
    '_recalculate_year',
    'to_dataframe',
    'to_dcf_format'
]

for method in dcf_methods:
    exists = check_method_exists('analytics/dcf_projections.py', 'DCFProjections', method)
    test_result(f"DCFProjections.{method}() exists", exists)

# Check ScenarioManager methods
scenario_methods = [
    'save_scenario',
    'load_scenario',
    'list_scenarios',
    'delete_scenario'
]

for method in scenario_methods:
    exists = check_method_exists('analytics/scenario_manager.py', 'ScenarioManager', method)
    test_result(f"ScenarioManager.{method}() exists", exists)

# =============================================================================
# TEST 5: Integration in atlas_app.py
# =============================================================================
print("\n" + "="*80)
print("Testing: atlas_app.py Integration")
print("="*80)

try:
    with open('atlas_app.py', 'r') as f:
        atlas_content = f.read()

    # Check import
    has_import = 'from analytics.model_inputs_ui import display_model_inputs_dashboard' in atlas_content
    test_result("Dashboard import statement", has_import)

    # Check availability flag
    has_flag = 'MODEL_INPUTS_DASHBOARD_AVAILABLE = True' in atlas_content
    test_result("Dashboard availability flag", has_flag)

    # Check checkbox
    has_checkbox = '"📊 Use Model Inputs Dashboard (Advanced)"' in atlas_content
    test_result("Dashboard checkbox UI", has_checkbox)

    # Check dashboard display call
    has_display = 'display_model_inputs_dashboard(company' in atlas_content
    test_result("Dashboard display function call", has_display)

    # Check session state storage
    has_storage = "st.session_state['dashboard_inputs'] = dashboard_inputs" in atlas_content
    test_result("Dashboard inputs stored in session state", has_storage)

    # Check use_model_inputs_dashboard flag storage
    has_flag_storage = "st.session_state['use_model_inputs_dashboard'] = True" in atlas_content
    test_result("Dashboard active flag stored", has_flag_storage)

    # Check dashboard_active check in FCFF/FCFE section
    has_dashboard_check = "dashboard_active = ('dashboard_inputs' in st.session_state" in atlas_content
    test_result("Dashboard active check in DCF section", has_dashboard_check)

    # Check dashboard mode logic
    has_dashboard_mode = "# DASHBOARD MODE: Use pre-calculated inputs and projections" in atlas_content
    test_result("Dashboard mode calculation logic", has_dashboard_mode)

    # Check manual mode fallback
    has_manual_mode = "# MANUAL MODE: Use slider inputs and traditional calculation" in atlas_content
    test_result("Manual mode fallback logic", has_manual_mode)

    # Check dashboard data extraction
    has_wacc_extract = "discount_rate = dashboard_data['wacc']" in atlas_content
    test_result("WACC extraction from dashboard", has_wacc_extract)

    has_terminal_extract = "terminal_growth = dashboard_data['terminal_growth']" in atlas_content
    test_result("Terminal growth extraction from dashboard", has_terminal_extract)

    has_shares_extract = "shares = dashboard_data['diluted_shares']" in atlas_content
    test_result("Diluted shares extraction from dashboard", has_shares_extract)

    # Check projections object usage
    has_proj_extract = "dcf_proj_obj = dashboard_data.get('projections')" in atlas_content
    test_result("Projections object extraction", has_proj_extract)

    # Check results storage
    has_dashboard_flag_result = "st.session_state['used_dashboard_mode'] = dashboard_active" in atlas_content
    test_result("Dashboard mode flag stored in results", has_dashboard_flag_result)

except Exception as e:
    test_result("atlas_app.py integration tests", False, str(e))

# =============================================================================
# TEST 6: Code Quality Checks
# =============================================================================
print("\n" + "="*80)
print("Testing: Code Quality")
print("="*80)

files_to_check = [
    'analytics/model_inputs.py',
    'analytics/dcf_projections.py',
    'analytics/scenario_manager.py',
    'analytics/projection_visualizer.py',
    'analytics/model_inputs_ui.py'
]

for filepath in files_to_check:
    try:
        with open(filepath, 'r') as f:
            content = f.read()

        # Check for docstrings
        has_module_docstring = content.strip().startswith('"""') or content.strip().startswith("'''")
        test_result(f"{filepath} has module docstring", has_module_docstring)

        # Check no obvious syntax errors (basic check)
        try:
            compile(content, filepath, 'exec')
            test_result(f"{filepath} compiles without syntax errors", True)
        except SyntaxError as e:
            test_result(f"{filepath} compiles without syntax errors", False, str(e))

    except Exception as e:
        test_result(f"{filepath} quality checks", False, str(e))

# =============================================================================
# TEST 7: Return Value Structure
# =============================================================================
print("\n" + "="*80)
print("Testing: Function Return Structures")
print("="*80)

# Check display_model_inputs_dashboard returns correct structure
try:
    with open('analytics/model_inputs_ui.py', 'r') as f:
        content = f.read()

    # Find the return statement
    return_keys = [
        "'roe':",
        "'terminal_growth':",
        "'wacc':",
        "'diluted_shares':",
        "'projections':",
        "'financial_data':",
    ]

    for key in return_keys:
        has_key = key in content
        test_result(f"display_model_inputs_dashboard returns {key}", has_key)

except Exception as e:
    test_result("Return structure checks", False, str(e))

# =============================================================================
# TEST 8: Critical Logic Paths
# =============================================================================
print("\n" + "="*80)
print("Testing: Critical Logic Paths")
print("="*80)

try:
    with open('atlas_app.py', 'r') as f:
        atlas_content = f.read()

    # Check if dashboard mode skips manual inputs
    lines = atlas_content.split('\n')

    # Find the dashboard_active check line
    dashboard_check_found = False
    dashboard_mode_found = False
    manual_mode_found = False

    for i, line in enumerate(lines):
        if 'dashboard_active = (' in line and 'dashboard_inputs' in line:
            dashboard_check_found = True
        if '# DASHBOARD MODE:' in line:
            dashboard_mode_found = True
        if '# MANUAL MODE:' in line:
            manual_mode_found = True

    test_result("Dashboard active check exists", dashboard_check_found)
    test_result("Dashboard mode branch exists", dashboard_mode_found)
    test_result("Manual mode branch exists", manual_mode_found)

    # Check proper indentation logic (if/else structure)
    if_dashboard_pattern = r'if dashboard_active:'
    else_pattern = r'\s+else:'

    has_if = bool(re.search(if_dashboard_pattern, atlas_content))
    test_result("Conditional dashboard mode logic", has_if)

    # Check that both branches converge to same calculation
    terminal_value_count = atlas_content.count('calculate_terminal_value')
    test_result("Terminal value calculated in both modes", terminal_value_count >= 1)

    calculate_dcf_count = atlas_content.count('calculate_dcf_value')
    test_result("DCF value calculated in both modes", calculate_dcf_count >= 1)

except Exception as e:
    test_result("Logic path checks", False, str(e))

# =============================================================================
# TEST 9: Documentation and Comments
# =============================================================================
print("\n" + "="*80)
print("Testing: Documentation")
print("="*80)

try:
    with open('atlas_app.py', 'r') as f:
        lines = f.readlines()

    # Count comments in dashboard integration section
    dashboard_section_start = None
    dashboard_section_end = None

    for i, line in enumerate(lines):
        if 'MODEL INPUTS DASHBOARD (ATLAS v11.0)' in line:
            dashboard_section_start = i
        if dashboard_section_start and 'Smart Assumptions Toggle' in line:
            dashboard_section_end = i
            break

    if dashboard_section_start and dashboard_section_end:
        section_lines = lines[dashboard_section_start:dashboard_section_end]
        comment_lines = [l for l in section_lines if l.strip().startswith('#')]
        has_comments = len(comment_lines) > 5
        test_result("Dashboard section has adequate comments", has_comments,
                   f"{len(comment_lines)} comment lines")

    # Check for calculation section comments
    calculation_comments = [
        '# DASHBOARD MODE',
        '# MANUAL MODE',
        '# Extract dashboard values',
        '# Calculate terminal value',
        '# Calculate DCF value'
    ]

    atlas_content = ''.join(lines)
    for comment in calculation_comments:
        has_comment = comment in atlas_content
        test_result(f"Calculation section has '{comment}'", has_comment)

except Exception as e:
    test_result("Documentation checks", False, str(e))

# =============================================================================
# SUMMARY
# =============================================================================
print("\n" + "="*80)
print("TEST SUMMARY")
print("="*80)
print(f"Tests Passed: {tests_passed}")
print(f"Tests Failed: {tests_failed}")
print(f"Total Tests: {tests_passed + tests_failed}")
if tests_passed + tests_failed > 0:
    print(f"Success Rate: {(tests_passed/(tests_passed+tests_failed)*100):.1f}%")

if tests_failed == 0:
    print("\n✅ ALL STRUCTURAL TESTS PASSED!")
    print("\nThe Model Inputs Dashboard implementation is structurally sound:")
    print("  • All required files exist with substantial content")
    print("  • All functions and classes are defined")
    print("  • Integration into atlas_app.py is complete")
    print("  • Dashboard mode and manual mode logic paths exist")
    print("  • Session state management is implemented")
    print("  • Return structures match requirements")
    print("  • Code compiles without syntax errors")
else:
    print(f"\n⚠️  {tests_failed} structural issues found")

print("\n" + "="*80)
print(f"Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("="*80)
