# ATLAS Terminal — Phase 1 Stress-Test & Recon Report

**Version:** 1.0
**Date:** February 26, 2026
**Phase:** 1 — Stress-Test & Recon (No Code Changes)
**Analyst:** Claude Code (Opus 4.6)
**Owner:** Hlobo Nompozolo, RisCura Investment Analytics

---

> **How to read this report.**
> Every audit hypothesis from the engagement brief has been stress-tested against the full codebase using explicit grep/search operations. Each hypothesis is marked with a verdict, justification, and evidence trail. Additional findings discovered during recon are documented in Part II.

---

## Part I — Hypothesis Verdicts

### Verdict Legend

| Symbol | Meaning |
|--------|---------|
| ✅ CONFIRMED | Finding stands as stated — proceed as recommended |
| 🔄 REFINED | Finding stands with material modifications documented below |
| ❌ OVERTURNED | Finding is incorrect — full explanation provided |
| ⚠️ BLOCKED | Cannot validate without additional information |

---

### Hypothesis Set A — Embedded Classes

---

#### H-A1: StochasticEngine is fully superseded by MonteCarloSimulation

**Verdict: ❌ OVERTURNED — The hypothesis is inverted. MonteCarloSimulation is the dead import; StochasticEngine is the active one.**

**Evidence:**

1. **StochasticEngine** exists in TWO locations:
   - `atlas_app.py` lines 810–904 (embedded class — the subject of this hypothesis)
   - `analytics/stochastic.py` lines 29–152 (proper module location)

2. **The atlas_app.py copy is dead code** — zero instantiations of the embedded version anywhere.

3. **The analytics/stochastic.py copy IS actively used:**
   - `ui/pages/monte_carlo.py` line 17: `from analytics.stochastic import StochasticEngine`
   - Line 141: `engine = StochasticEngine(tickers=list(returns.columns), returns_data=returns)`

4. **MonteCarloSimulation** (`risk_analytics/atlas_monte_carlo.py`) is imported in `atlas_app.py` line 199 but **never instantiated** anywhere in the active codebase. It appears only as a stub redefinition in `ui/pages/v10_analytics.py`.

5. **Capability comparison:**
   - StochasticEngine: Explicit Cholesky decomposition, asset-level 3D path arrays, correlated GBM
   - MonteCarloSimulation: Implicit correlation via `np.random.multivariate_normal`, portfolio-level only

6. **Additional finding:** `analytics/stochastic.py` also contains `PortfolioMonteCarloEngine` (lines 155–516) — a more advanced institutional-grade engine with Cholesky + probability weighting that could serve as the canonical engine.

**Disposition for atlas_app.py embedded class:**
- `StochasticEngine` in atlas_app.py (lines 810–904): **SUNSET** — zero callers, identical functionality lives in `analytics/stochastic.py`
- `MonteCarloSimulation` import in atlas_app.py (line 199): **Dead import** — never instantiated

---

#### H-A2: EnhancedDCFEngine is fully superseded by RobustDCFEngine

**Verdict: ❌ OVERTURNED — EnhancedDCFEngine is dead code, not superseded. RobustDCFEngine has a signature mismatch bug.**

**Evidence:**

1. **EnhancedDCFEngine** (`atlas_app.py` lines 1124–1251): Defined but **zero instantiations** anywhere in the codebase. Global grep for `EnhancedDCFEngine(` returns zero matches.

2. **RobustDCFEngine** (`atlas_dcf_institutional.py` lines 240–404): Defined with signature `__init__(self, company_data: Dict, financials: Dict)`.

3. **Critical bug discovered:** `ui/pages/valuation_house.py` line 2115 attempts to instantiate RobustDCFEngine with:
   ```python
   robust_engine = RobustDCFEngine(
       assumptions=assumption_manager,
       validator=DCFValidator(),
       company_data={...}
   )
   ```
   This will raise a `TypeError` — the constructor expects `(company_data, financials)`, not `(assumptions, validator, company_data)`.

4. **Fallback behavior:** When `INSTITUTIONAL_DCF_AVAILABLE` is False, valuation_house.py skips validation and Monte Carlo entirely — it does NOT fall back to EnhancedDCFEngine. The page uses `core.calculations.calculate_dcf_value()` as its baseline.

5. **Additional DCF engine:** `valuation/atlas_dcf_engine.py` contains `DCFValuation` — a separate, simpler DCF engine imported via V10_MODULES_AVAILABLE.

**Disposition:**
- `EnhancedDCFEngine` in atlas_app.py (lines 1124–1251): **SUNSET** — confirmed dead code, zero callers
- **NEW FINDING:** RobustDCFEngine instantiation bug at `valuation_house.py:2115` must be fixed in Phase 3

---

#### H-A3: MultiSourceDataBroker is dead code

**Verdict: ✅ CONFIRMED — Zero instantiations, zero imports, zero references.**

**Evidence:**

1. Global grep for `MultiSourceDataBroker(` — **zero matches** across entire codebase.
2. Global grep for `MultiSourceDataBroker` (any reference) — found only in:
   - `atlas_app.py` line 1254 (class definition)
   - `atlas_app_backup_before_clean.py` (backup copy)
3. No page module imports it. No module references it.
4. **Properly replaced by** `multi_source_data/` directory containing:
   - `DataBroker` class (full multi-source implementation)
   - `AlphaVantageSource`, `FMPSource` (real API integrations, not stubs)
   - `LiveDataStream` (real-time streaming)
   - `atlas_data_freshness.py` (data quality scoring)
5. Replacement classes are tested in `tests/test_all.py`.

**Disposition:** `MultiSourceDataBroker` in atlas_app.py (lines 1254–1325): **SUNSET** — safe to delete immediately.

---

#### H-A4: InvestopediaIntegration is misplaced, not duplicated

**Verdict: ✅ CONFIRMED — Misplaced AND stubbed. Worse than initially hypothesised.**

**Evidence:**

1. **Full class** in `atlas_app.py` lines 521–807 (287 lines): Complete Selenium 2FA implementation with `attempt_login()`, `submit_2fa_code()`, `scrape_portfolio()`, `cleanup()`.

2. **Never instantiated** from atlas_app.py — the class is defined but no code in atlas_app.py calls it.

3. **Duplicate stub** in `ui/pages/investopedia_live.py` lines 23–38: A simplified stub class returning error messages like `'Selenium integration not available'`. The page instantiates THIS stub, not the full class.

4. **Session state management:** `investopedia_live.py` correctly persists the integration instance via `st.session_state['investopedia_integration']` — but it persists the stub, not the real implementation.

5. **Third implementation** in `investopedia_integration/atlas_investopedia_production_2fa.py`: A class called `InvestopediaAuth` (different name, different interface) — also never imported anywhere.

6. **Hardcoded email:** `atlas_app.py` line 531 contains `email="davenompozolo@gmail.com"` as a default parameter. **This should be removed during extraction.**

**Disposition:**
- Extract `InvestopediaIntegration` to `integrations/investopedia.py` (or consolidate into `investopedia_integration/`)
- Replace stub in `investopedia_live.py` with proper import
- Remove hardcoded email default
- Consider whether `InvestopediaAuth` in the integration directory represents a newer approach

---

#### H-A5: QuantOptimizer contains unique logic that must be extracted before sunsetting

**Verdict: 🔄 REFINED — The atlas_app.py QuantOptimizer is dead code, BUT an identical copy in quant_optimizer/ IS in production.**

**Evidence:**

1. **QuantOptimizer in atlas_app.py** (lines 907–1122): Defined but **never instantiated** in any active code. Global grep for `QuantOptimizer(` in atlas_app.py context returns zero active callers.

2. **PortfolioOptimizer** in `quant_optimizer/atlas_quant_portfolio_optimizer.py`: This IS the production optimizer used by `ui/pages/quant_optimizer.py` (line 17: `from quant_optimizer.atlas_quant_portfolio_optimizer import PortfolioOptimizer`).

3. **generate_rebalancing_plan()** exists in BOTH classes with **identical logic**:
   - `atlas_app.py` lines 1003–1121 (dead)
   - `quant_optimizer/atlas_quant_portfolio_optimizer.py` lines 267–368 (active)

4. **PMGradeOptimizer** (`atlas_pm_optimization.py` line 543): Has **NO** `generate_rebalancing_plan()` method. It returns optimized weights, regime info, and risk metrics — but no trade execution plan.

5. **ui/pages/quant_optimizer.py** line 285 calls: `optimizer.generate_rebalancing_plan(optimal_weights, portfolio_data, currency_symbol)` — from PortfolioOptimizer, NOT from QuantOptimizer or PMGradeOptimizer.

**Disposition:**
- `QuantOptimizer` in atlas_app.py (lines 907–1122): **SUNSET** — dead code, identical to PortfolioOptimizer
- `PortfolioOptimizer` in `quant_optimizer/`: **KEEP** — production code, has unique rebalancing logic
- `PMGradeOptimizer`: Complementary institutional tool, not a replacement. Coexists.
- No extraction needed — the rebalancing logic already lives in the right place

---

### Hypothesis Set B — Structural Debt

---

#### H-B1: The old if/elif routing block is fully redundant

**Verdict: ❌ OVERTURNED — The old routing is currently the ONLY working code path. PAGE_REGISTRY is incomplete and broken.**

**Evidence:**

1. **USE_NAVIGATION_V2 checkbox:** `atlas_app.py` line 1546, defaults to `False` (old routing active).

2. **Old if/elif chain** (lines 1567–1747): Routes **20 pages**, all with working lazy imports to `ui/pages/*.py` modules.

3. **PAGE_REGISTRY** (`navigation/registry.py`): Registers **17 pages** — missing 3:
   - `v10_analytics` (v10.0 Analytics)
   - `r_analytics` (R Analytics)
   - `market_regime` (Market Regime)

4. **Critical: 14 of 17 registered pages have NULL handlers.**
   - `navigation/registry.py` attempts to import from `navigation/handlers.py` — **this file does not exist**
   - Import fails → `HANDLERS_AVAILABLE = False` → 14 handlers set to `None`
   - Only 3 pages work via lazy-loading: equity_research, macro_intelligence, fund_research

5. **route_to_page()** (`navigation/router.py`): Wraps handler calls in try/except but does NOT check for `None` handlers — will crash with `TypeError: 'NoneType' object is not callable`.

**Disposition:**
- **Do NOT remove** the old if/elif block until:
  1. `navigation/handlers.py` is created with proper handler implementations (or registry uses `_load_handler()` pattern for all pages)
  2. 3 missing pages are registered in PAGE_REGISTRY
  3. All 20 pages verified working through route_to_page()
- Phase 2 Task 4 (register unregistered pages) and Task 5 (remove old routing) must be treated as a single atomic operation

---

#### H-B2: get_benchmark_sector_returns() belongs in the data layer

**Verdict: ✅ CONFIRMED — No interface change needed. Function has zero UI state dependencies.**

**Evidence:**

1. **Definition:** `atlas_app.py` lines 365–427. Pure function with parameters `(benchmark_ticker='SPY', period='1y')`. No `st.session_state`, no `st.sidebar`, no UI state.

2. **Three copies exist** (maintenance nightmare):
   - `atlas_app.py` lines 365–427 (primary, with cache integration)
   - `core/data_loading.py` lines 496–540 (older, simpler version)
   - Called from `core/calculations.py` line 1079 in `calculate_brinson_attribution()`

3. **Target destination:** `data/sectors.py` already contains `GICS_SECTORS`, `GICS_SECTOR_MAPPING`, `STOCK_SECTOR_OVERRIDES`, `SPY_SECTOR_WEIGHTS` — pure data constants, no functions yet. Perfect home.

4. **Cache dependency:** Uses `REFACTORED_MODULES_AVAILABLE` and `cache_manager` — these are global, not orchestrator-specific. Can be injected or imported at the data layer.

**Disposition:**
- Move atlas_app.py version to `data/sectors.py`
- Delete `core/data_loading.py` duplicate (lines 496–540)
- Update import in `core/calculations.py` line 1079
- Single caller update — low risk

---

#### H-B3: The 12 feature flags create silent failure modes in production

**Verdict: 🔄 REFINED — 11 flags degrade gracefully, but 1 flag (PM_OPTIMIZATION_AVAILABLE) is NEVER GUARDED — hard crash vector.**

**Complete flag inventory:**

| # | Flag | Lines | Guard Count | Category | Risk |
|---|------|-------|-------------|----------|------|
| 1 | `PROFESSIONAL_THEME_AVAILABLE` | 131–156 | 21 | SOFT | Low — charts degrade |
| 2 | `BROKER_MANAGER_AVAILABLE` | 162–170 | 6 | SOFT | Low — file upload fallback |
| 3 | `V10_MODULES_AVAILABLE` | 196–213 | 2 | SOFT | Medium — v10 page crashes |
| 4 | `SQL_AVAILABLE` | 215–222 | 19 | GENUINELY OPTIONAL | Low — pickle fallback |
| 5 | `DCF_TRAP_DETECTION_AVAILABLE` | 224–231 | 2 | GENUINELY OPTIONAL | Low — enhancement only |
| 6 | `MODEL_INPUTS_DASHBOARD_AVAILABLE` | 233–240 | 6 | SOFT | Low — explicit error msg |
| 7 | `INSTITUTIONAL_DCF_AVAILABLE` | 244–258 | 2 | SOFT | Low — basic DCF works |
| 8 | `SBC_AVAILABLE` | 260–274 | 6 | GENUINELY OPTIONAL | Low — optional component |
| 9 | `PM_OPTIMIZATION_AVAILABLE` | 278–292 | **0** | **HARD** | **HIGH — never guarded** |
| 10 | `MULTISTAGE_DCF_AVAILABLE` | 294–309 | 4 | GENUINELY OPTIONAL | Low — variant feature |
| 11 | `R_AVAILABLE` | 310–317 | 13 | GENUINELY OPTIONAL | Low — Python fallback |
| 12 | `REFACTORED_MODULES_AVAILABLE` | 319–328 | **58** | SOFT | Medium — perf degradation |

**Critical finding — PM_OPTIMIZATION_AVAILABLE (Flag 9):**
- Imports: `PMGradeOptimizer`, `AsymmetricRiskOptimizer`, `MarketRegimeDetector`, `ForwardLookingReturns`, `display_regime_analysis`, `display_optimization_results`
- **Zero conditional guards anywhere in the codebase**
- If `atlas_pm_optimization.py` fails to import, any code calling these classes will crash with `NameError`
- This is a production risk — the flag exists but is dead code itself

**Proposed boot tier classification:**

| Tier | Flags | Rationale |
|------|-------|-----------|
| **HARD** (fail at boot) | PROFESSIONAL_THEME, navigation, cache_manager, error_handler | Core infrastructure |
| **SOFT** (banner) | BROKER_MANAGER, V10_MODULES, INSTITUTIONAL_DCF, PM_OPTIMIZATION, REFACTORED_MODULES | Significant features |
| **OPTIONAL** (log only) | SQL, DCF_TRAP, MODEL_INPUTS, SBC, MULTISTAGE_DCF, R_AVAILABLE | Enhancement modules |

---

### Hypothesis Set C — Module-Level Findings

---

#### H-C1: v10.0 Analytics is an obsolete rollup page

**Verdict: 🔄 REFINED — Active in navigation with unique attribution logic, but heavily stubbed with mock classes.**

**Evidence:**

1. `ui/pages/v10_analytics.py` renders 6 feature tabs: Monte Carlo, Advanced Risk, DCF, Phoenix, Performance Attribution, Enhanced Charts.

2. **Lines 35–112 define COMPLETE STUB CLASSES** for `MonteCarloSimulation`, `RiskAnalytics`, `DCFValuation`, `PhoenixMode`, `PerformanceAttribution` — all returning hardcoded values. Line 33: `V10_MODULES_AVAILABLE = True` is hardcoded, so these stubs ALWAYS execute.

3. **Unique content:** Performance Attribution with Brinson-Fachler decomposition and skill assessment scoring (allocation vs. selection effect) — lines 355–423. This includes glassmorphism UI cards with skill ratings (0–10 scale).

4. The page IS in navigation (`atlas_app.py` line 1441) and routes correctly.

**Disposition:**
- NOT safe to sunset without reviewing whether the attribution + skill scoring logic has been migrated to Performance Suite
- If Performance Suite already covers Brinson attribution, then v10.0 Analytics can be sunset
- If not, extract attribution logic first, then sunset

---

#### H-C2: quant_optimizer.py may still call the legacy QuantOptimizer class

**Verdict: 🔄 REFINED — Uses NEITHER legacy QuantOptimizer NOR PMGradeOptimizer. Uses a third class: PortfolioOptimizer.**

**Evidence:**

1. `ui/pages/quant_optimizer.py` line 17: `from quant_optimizer.atlas_quant_portfolio_optimizer import PortfolioOptimizer`

2. Does NOT import from `atlas_app.py` (no `QuantOptimizer`)

3. Does NOT import from `atlas_pm_optimization.py` (no `PMGradeOptimizer`)

4. DOES call `generate_rebalancing_plan()` at line 285 — from `PortfolioOptimizer`

5. **Three competing optimizer implementations coexist:**
   - `QuantOptimizer` (atlas_app.py) — dead code, analytical gradient approach
   - `PortfolioOptimizer` (quant_optimizer/) — production, mean-variance with leverage
   - `PMGradeOptimizer` (atlas_pm_optimization.py) — regime-aware asymmetric risk, no rebalancing

**Disposition:** The "v11.0 upgrade" label is partially nominal — the page uses PortfolioOptimizer (a mid-generation class), not the latest PMGradeOptimizer. Phase 3 should evaluate whether PMGradeOptimizer should become the canonical optimizer with PortfolioOptimizer's rebalancing logic grafted onto it.

---

#### H-C3: Market Regime page has a hidden dependency on a soft-flag module

**Verdict: 🔄 REFINED — Uses INDEPENDENT QuantitativeRegimeDetector, NOT MarketRegimeDetector from atlas_pm_optimization. Graceful degradation is present.**

**Evidence:**

1. `ui/pages/market_regime.py` imports from `regime_detector` (standalone module), NOT from `atlas_pm_optimization`.

2. **No PM_OPTIMIZATION_AVAILABLE flag check** in market_regime.py — the flag is irrelevant to this page.

3. **Graceful fallback:** Lines 46–84 define an inline stub class if `regime_detector.py` fails to import. The stub returns `{'regime': 'neutral', 'confidence': 50, ...}` with error indicators on all sub-metrics. The page continues rendering with "NEUTRAL MARKET" classification.

4. **Two separate regime detectors exist:**
   - `QuantitativeRegimeDetector` in `regime_detector.py` — standalone, uses yfinance directly for VIX, yields, credit spreads, breadth, momentum. Independent of atlas_pm_optimization.
   - `MarketRegimeDetector` in `atlas_pm_optimization.py` — coupled to PM optimization module, growth/value classification from returns data. NOT used by market_regime.py.

**Disposition:** Good separation of concerns already achieved. No action needed for this page specifically. The hypothesis about PM_OPTIMIZATION dependency is overturned for this page.

---

## Part II — Additional Findings

### AF-1: Import Dependency Graph — No Circular Import Risk

**Finding:** Zero active `import atlas_app` or `from atlas_app import` statements exist in the codebase. The `_ATLAS_MAIN_GUARD` mechanism at line 1765 is working as designed. All page module imports are lazy (inside conditional blocks within `main()`). Core modules (`core/calculations.py`, `core/charts.py`, etc.) have comments documenting they were "Extracted from atlas_app.py" but no actual imports from it.

**Risk Level:** LOW. No circular dependency exists today.

---

### AF-2: Orphaned Files

| File | Status | Evidence |
|------|--------|----------|
| `advanced_stock_screener.py` | **ORPHANED** | Only references `stock_universe_manager_v1.py`; no page calls it |
| `stock_universe_manager_v1.py` | **ORPHANED** | Only used by orphaned screener |
| `position_aware_optimizer.py` | **ORPHANED** | Only used by orphaned `regime_aware_optimizer.py` |
| `regime_aware_optimizer.py` | **ORPHANED** | Imports `regime_detector` but no page calls it |
| `ui_components.py` | **ORPHANED** | Superseded by `ui/components/` directory |
| `market_data_fetcher.py` | DORMANT | Only imported by `market_watch_components.py` |
| `news_aggregator.py` | DORMANT | Only imported by `market_watch_components.py` |
| `sector_trend_analyzer.py` | DORMANT | Only imported by `market_watch_components.py` |
| `enhanced_economic_calendar.py` | DORMANT | Only imported by `market_watch_components.py` |
| `visualization_components.py` | DORMANT | Only imported by `market_watch_components.py` |
| `market_watch_components.py` | ACTIVE | Called from `ui/pages/market_watch.py` |
| `dcf_regime_overlay.py` | ACTIVE | Called from `ui/pages/valuation_house.py` |
| `regime_detector.py` | ACTIVE | Called from `ui/pages/market_regime.py`, `dcf_regime_overlay.py` |
| `modules/` | ACTIVE | Easy Equities integration, used by phoenix_parser, core modules |
| `services/` | ACTIVE | Used by benchmark modules (equity_research, macro_intelligence, fund_research) |
| `quant_optimizer/` | ACTIVE | Used by `ui/pages/quant_optimizer.py` |
| `portfolio_tools/` | ACTIVE | Phoenix Mode, imported by atlas_app.py |
| `multi_source_data/` | LOW ACTIVITY | Only referenced in `tests/test_all.py` |
| `patches/` | LOW ACTIVITY | Only referenced in `tests/test_all.py` |

**5 confirmed orphaned files** totalling ~2,500 lines of dead code.

---

### AF-3: Hardcoded Credentials & Sensitive Data

| Item | Location | Risk | Action |
|------|----------|------|--------|
| **ngrok auth token** | `COLAB_DEPLOY.py` line 67 | HIGH | Revoke token, move to env var |
| **ngrok auth token** (same) | `COLAB_DEPLOYMENT_HORIZONTAL_NAV.py` line 78 | HIGH | Same token, same action |
| **ngrok auth token** (same) | `COLAB_DEPLOY_UPDATED.py` line 76 | HIGH | Same token, same action |
| **ngrok auth token** (different) | `ATLAS_v11_COMPLETE_DEPLOYMENT.py` ~line 1158 | HIGH | Separate token, revoke |
| **Hardcoded email** | `atlas_app.py` line 531 | MEDIUM | Remove from default param |
| API keys (Alpha Vantage, FMP) | `config.py` lines 16–17 | LOW | Already uses `os.getenv()` |

**Recommendation:** Rotate both ngrok tokens immediately. Replace hardcoded tokens with `os.getenv('NGROK_AUTH_TOKEN')` pattern.

---

### AF-4: Colab Deployment Assessment

| File | Purpose | Relationship to atlas_app.py |
|------|---------|------------------------------|
| `COLAB_DEPLOY.py` | Standard v10.0 Colab entry | **Downloads atlas_app.py from GitHub** at runtime, sets up ngrok tunnel |
| `COLAB_DEPLOYMENT_HORIZONTAL_NAV.py` | Horizontal nav variant | Downloads from experimental branch, UI layout experiment |
| `COLAB_DEPLOY_UPDATED.py` | Latest features Colab entry | Downloads from feature branch with diversification optimizer |
| `ATLAS_v11_COMPLETE_DEPLOYMENT.py` | Self-contained v11.0 | **Parallel implementation** — creates entire app inline (NOT a downloader), includes duplicate classes (StochasticEngine, etc.) |

**Classification:**
- `COLAB_DEPLOY.py`: Production entry point (downloads from main)
- `COLAB_DEPLOY_UPDATED.py`: Latest feature branch entry point
- `COLAB_DEPLOYMENT_HORIZONTAL_NAV.py`: Experimental — likely safe to deprecate
- `ATLAS_v11_COMPLETE_DEPLOYMENT.py`: Standalone v11.0 fork — will diverge from atlas_app.py over time. Should either be deprecated or explicitly maintained as a separate deployment target.

---

### AF-5: New Finding — v10.0 Analytics Hardcoded Flag

`ui/pages/v10_analytics.py` line 33 sets `V10_MODULES_AVAILABLE = True` unconditionally, then defines stub classes for all v10 modules (lines 35–112). This means the page ALWAYS renders with mock data regardless of whether real v10 modules are available. This is a silent correctness bug — users see fake analytics data presented as real.

---

### AF-6: New Finding — RobustDCFEngine Signature Mismatch

`ui/pages/valuation_house.py` line 2115 instantiates RobustDCFEngine with incorrect parameters (`assumptions=`, `validator=`, `company_data=`) but the class constructor expects `(company_data: Dict, financials: Dict)`. This will crash with TypeError when the institutional DCF path is exercised. Must be fixed in Phase 3.

---

### AF-7: New Finding — Wildcard Imports Create Namespace Pollution

`atlas_app.py` lines 496–500 import everything from 5 core modules:
```python
from core.data_loading import *
from core.fetchers import *
from core.calculations import *
from core.charts import *
from core.optimizers import *
```

These files total ~360,000+ characters of code. This imports hundreds of names into atlas_app.py's namespace. Combined with the `_ATLAS_MAIN_GUARD` mechanism (which allows other modules to import from atlas_app.py during the same process), this creates a massive re-export surface. While no circular imports exist today, these wildcard imports make the namespace unpredictable and should be replaced with explicit imports during Phase 3.

---

### AF-8: New Finding — Three Backup Files Total 1.6M Lines

Three backup files exist in the repository root:
- `atlas_app_backup_before_clean.py` — 1,108,809 bytes
- `atlas_app_with_toasts_backup.py` — 495,106 bytes
- `atlas_app_simplified_backup.py` — 41,946 bytes

These serve no runtime purpose. They inflate the repo, confuse code search, and contain outdated copies of classes that have since been refactored. They should be removed (their content is preserved in git history).

---

## Part III — Phase 2 Readiness Assessment

### Pre-conditions for Phase 2

| Pre-condition | Status | Notes |
|---------------|--------|-------|
| All H-A hypotheses validated | ✅ | 5/5 complete |
| All H-B hypotheses validated | ✅ | 3/3 complete |
| All H-C hypotheses validated | ✅ | 3/3 complete |
| Import dependency graph mapped | ✅ | No circular risk |
| Orphaned files identified | ✅ | 5 files confirmed |
| Credentials flagged | ✅ | 2 ngrok tokens + 1 email |
| Colab deployment assessed | ✅ | 4 entry points documented |

### Phase 2 Task Readiness

| Phase 2 Task | Gate Status | Dependencies | Notes |
|--------------|-------------|--------------|-------|
| 1. Delete StochasticEngine from atlas_app.py | ✅ READY | H-A1 | Zero callers confirmed. analytics/stochastic.py is canonical |
| 1. Delete EnhancedDCFEngine from atlas_app.py | ✅ READY | H-A2 | Zero callers confirmed |
| 1. Delete MultiSourceDataBroker from atlas_app.py | ✅ READY | H-A3 | Zero callers confirmed |
| 1. Delete QuantOptimizer from atlas_app.py | ✅ READY | H-A5 | Zero callers; PortfolioOptimizer is canonical |
| 2. Extract InvestopediaIntegration | ✅ READY | H-A4 | Clear extraction path; remove hardcoded email |
| 3. Move get_benchmark_sector_returns() | ✅ READY | H-B2 | No interface change; delete duplicate in core/data_loading.py |
| 4. Register missing pages in PAGE_REGISTRY | ✅ READY | H-B1 | 3 pages: v10_analytics, r_analytics, market_regime |
| 5. Remove old if/elif routing | ⚠️ BLOCKED | Task 4 + handler fix | Cannot proceed until handlers.py is created or all pages use _load_handler() |

### Recommended Phase 2 Execution Order

1. **Delete 4 dead classes** from atlas_app.py (StochasticEngine, EnhancedDCFEngine, MultiSourceDataBroker, QuantOptimizer) — ~500 lines removed, zero risk
2. **Extract InvestopediaIntegration** to `integrations/investopedia.py`, update `investopedia_live.py` import
3. **Move get_benchmark_sector_returns()** to `data/sectors.py`, delete duplicate, update caller
4. **Fix PAGE_REGISTRY**: register 3 missing pages, convert all 14 null handlers to `_load_handler()` pattern
5. **Remove old routing** (only after #4 is verified working with all 20 pages)

---

## Part IV — Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| PM_OPTIMIZATION_AVAILABLE never guarded | HIGH | Add guards before any Phase 3 work on quant/regime pages |
| RobustDCFEngine signature mismatch | HIGH | Fix in Phase 3 valuation_house retrofit |
| v10_analytics hardcoded stubs | MEDIUM | Evaluate for sunset vs. migrate unique attribution logic |
| ngrok tokens in git history | MEDIUM | Rotate tokens regardless of file removal |
| Wildcard imports in atlas_app.py | LOW | Address in Phase 3 as part of orchestrator cleanup |
| 3 backup files (~1.6MB) in repo | LOW | Remove after Phase 2 is stable |

---

*Phase 1 — Stress-Test & Recon is COMPLETE. All findings are documented. No code changes have been made. Ready for Phase 2 upon Hlobo's review and approval.*

**ATLAS Terminal · Phase 1 Report · February 26, 2026**
