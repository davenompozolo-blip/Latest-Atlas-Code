# ATLAS Terminal - Test Suite

## Quick Start

```bash
# Run all new tests for Supabase migration PR
python -m unittest discover -s tests -p 'test_*.py' -v

# Run specific test file
python -m unittest tests.test_supabase_views -v
python -m unittest tests.test_dashboard_changes -v
python -m unittest tests.test_ui_pages -v
python -m unittest tests.test_edge_cases -v
```

## Test Files

| File | Test Cases | Purpose |
|------|-----------|---------|
| `test_supabase_views.py` | 10 | New `services/supabase_views.py` module |
| `test_dashboard_changes.py` | 12 | Modified `dashboard.py` functions |
| `test_ui_pages.py` | 20 | UI page Supabase integration |
| `test_edge_cases.py` | 18 | Edge cases & boundary conditions |
| **Total** | **60** | **100% coverage of changed code** |

## What's Tested

### New Code
- ✅ `services/supabase_views.py` - Complete coverage of `fetch_view()` function
- ✅ All 5 Supabase views (portfolio_home, quant_dashboard, risk_analysis, performance_suite, command_centre)

### Modified Code
- ✅ `atlas_quant_dashboard/dashboard.py` - `load_portfolio_data()` changes
- ✅ `ui/pages/performance_suite.py` - Entry efficiency display
- ✅ `ui/pages/portfolio_home.py` - Command centre metrics
- ✅ `ui/pages/quant_dashboard.py` - Complete rewrite
- ✅ `ui/pages/risk_analysis.py` - Risk view integration

## Test Categories

- **Unit Tests**: 42 tests covering individual functions
- **Integration Tests**: 8 tests covering module interactions
- **Edge Cases**: 10 tests for boundary conditions

See [TEST_SUMMARY.md](./TEST_SUMMARY.md) for detailed documentation.