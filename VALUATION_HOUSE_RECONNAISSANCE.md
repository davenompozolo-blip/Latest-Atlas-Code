# VALUATION HOUSE RECONNAISSANCE REPORT
**Date:** 2026-01-12
**Investigator:** CC (Claude Code)
**Status:** Complete

---

## EXECUTIVE SUMMARY

The Valuation House is a comprehensive DCF valuation engine with 8 institutional-grade methods. It features smart assumptions, regime-aware adjustments, and Monte Carlo simulation. **However, segment revenue extraction is currently MANUAL-only** - there is placeholder code but no actual 10-K parsing implementation.

**Key Finding:** The `_extract_segment_revenues()` function in `dcf_trap_detector.py` returns `None` with a comment: *"Placeholder - would need actual segment data parsing"*

---

## 1. VALUATION HOUSE UI LOCATION

**File:** `atlas_app.py`
**Lines:** 18855 - 20800+ (approximately 2000 lines)
**Section Start:** `elif page == "💰 Valuation House":`

### User Flow:

1. **Company Search** (lines 18863-18886)
   - User enters ticker in text input
   - Clicks "Load Company" button
   - `fetch_company_financials(ticker)` is called
   - Data stored in `st.session_state['valuation_company']`

2. **Company Overview Display** (lines 18894-18932)
   - 5 metric cards: Current Price, Market Cap, Sector, Beta, Forward P/E
   - Beautiful gradient UI cards with color-coded status

3. **Valuation Method Selection** (lines 18936-18992)
   - 8 methods available:
     - Consensus Valuation (Multi-Method Aggregate)
     - FCFF DCF (Free Cash Flow to Firm)
     - FCFE DCF (Free Cash Flow to Equity)
     - Gordon Growth DDM
     - Multi-Stage DDM (2-Stage)
     - Residual Income Model
     - Relative Valuation (Peer Multiples)
     - Sum-of-the-Parts (SOTP)

4. **Scenario Selection** (lines 18994-19026)
   - BEAR / BASE / BULL quick buttons
   - Reset to Manual option

5. **Model Inputs Dashboard** (lines 19027-19072)
   - Toggle for advanced mode
   - DuPont ROE breakdown
   - SGR → Terminal Growth
   - Live 10-year Treasury → WACC
   - Diluted shares (Treasury Stock Method)
   - Editable projections

6. **Regime-Aware DCF** (lines 19074-19200)
   - Market regime detection (Risk-On/Off/Transitional/Neutral)
   - WACC and terminal growth adjustments

7. **Calculate Intrinsic Value** (lines 20259+)
   - Runs selected valuation method
   - Displays results with charts

### Key UI Components:

| Component | Type | Purpose |
|-----------|------|---------|
| `ticker_input` | text_input | Company ticker entry |
| `search_button` | button | Load company data |
| `valuation_method` | selectbox | Choose from 8 methods |
| `scenario` | radio buttons | BEAR/BASE/BULL |
| `use_model_inputs_dashboard` | checkbox | Toggle advanced mode |
| `use_regime_aware_dcf` | checkbox | Apply market regime |
| Calculate button | button | Run valuation |

---

## 2. ALL VALUATION FILES FOUND

### Core DCF Engine

**File 1:** `valuation/atlas_dcf_engine.py` (222 lines)
- **Purpose:** Core DCFValuation class
- **Key Class:** `DCFValuation`
- **Methods:**
  - `calculate_wacc()` - WACC using CAPM
  - `project_cash_flows()` - 5-year FCF projections
  - `calculate_terminal_value()` - Gordon Growth Model
  - `calculate_intrinsic_value()` - Full DCF calculation
- **Data Source:** yfinance (self.stock = yf.Ticker(ticker))

### Institutional DCF Enhancements

**File 2:** `atlas_dcf_institutional.py` (567 lines)
- **Purpose:** Professional validation and robustness
- **Key Classes:**
  - `DCFAssumptionManager` - Dependency tracking for assumptions
  - `DCFValidator` - Non-blocking assumption validation with sector benchmarks
  - `RobustDCFEngine` - Production-grade DCF with caching
  - `MonteCarloDCF` - Probability distributions for fair value ranges
- **Features:**
  - Sector benchmarks for 7 sectors
  - Warning levels: error, warning, caution
  - 1000-run Monte Carlo simulations

### DCF Trap Detection

**File 3:** `analytics/dcf_trap_detector.py` (889 lines)
- **Purpose:** Identify value traps in DCF valuations
- **Key Class:** `DCFTrapDetector`
- **Trap Types Detected:**
  - Discount Rate Illusion
  - Terminal Value Dependency
  - Revenue Concentration Risk
  - Idiosyncratic Optionality
  - Absence of Critical Factor
- **CRITICAL:** Contains `_extract_segment_revenues()` placeholder (line 752)

### DCF Projections

**File 4:** `analytics/dcf_projections.py` (373 lines)
- **Purpose:** Editable DCF projection tables
- **Key Class:** `DCFProjections`
- **Features:**
  - Auto-generation from historical data
  - Manual override capability
  - Smart recalculation of dependents
  - Export to DataFrame/CSV

### Multi-Stage DCF

**File 5:** `analytics/multistage_dcf.py` (416 lines)
- **Purpose:** Lifecycle-stage modeling
- **Key Classes:**
  - `DCFModelType` - Enum (SINGLE/TWO/THREE_STAGE)
  - `Stage` - Dataclass for stage parameters
  - `MultiStageDCFConfig` - Full model configuration
- **Features:**
  - Growth rate mean reversion
  - Smooth transitions (no cliffs)
  - User-editable stages

### Regime Overlay

**File 6:** `dcf_regime_overlay.py` (~200 lines)
- **Purpose:** Adjust DCF inputs based on market regime
- **Key Class:** `DCFRegimeOverlay`
- **Adjustments:**
  - RISK-ON: WACC -50bps, Terminal Growth +25bps
  - RISK-OFF: WACC +100bps, Terminal Growth -50bps
  - TRANSITIONAL: WACC +25bps, Terminal Growth -10bps
  - NEUTRAL: No adjustments

### Navigation Handler

**File 7:** `navigation/handlers/valuation_house.py` (146 lines)
- **Purpose:** Alternative modular page handler
- **Note:** References features planned but calls main `atlas_app.py` implementation

---

## 3. FINANCIAL DATA FETCHING

### Current Implementation

**Primary Function:** `fetch_company_financials(ticker)` at `atlas_app.py:5095-5179`

**Data Source:** yfinance (100% reliance)

```python
# Current data fetching (simplified)
stock = yf.Ticker(ticker)
info = stock.info
income_stmt = stock.income_stmt
balance_sheet = stock.balance_sheet
cash_flow = stock.cash_flow
```

**Data Retrieved:**

| Category | Fields |
|----------|--------|
| Company Info | ticker, name, sector, industry, current_price, market_cap, shares_outstanding, beta, forward_pe, trailing_pe |
| Income Statement | revenue, ebit, net_income, tax_expense |
| Balance Sheet | total_debt, cash, total_equity |
| Cash Flow | capex, depreciation, operating_cf |

### Important Gaps

| Missing Data | Why Needed |
|--------------|------------|
| Segment revenue | Weighted growth rates |
| Segment margins | Better FCF projections |
| Geographic breakdown | Currency/market risk |
| 10-K text | Segment definitions |

### yfinance Limitations

1. **No segment data** - yfinance doesn't parse segment disclosures
2. **No 10-K parsing** - Only structured financial statements
3. **No SEC EDGAR integration** - Can't access raw filings
4. **Limited history** - Typically 4 years max

---

## 4. SEGMENT ANALYSIS

### Status: **PARTIALLY EXISTS - MANUAL ONLY**

### What EXISTS:

**1. SOTP Valuation Function** (`atlas_app.py:5782-5820`)

```python
def calculate_sotp_valuation(segments, discount_rate, shares_outstanding):
    """
    Sum-of-the-Parts valuation for multi-segment companies
    segments = [{'name': 'Segment A', 'revenue': X,
                 'ebitda_margin': Y, 'multiple': Z}, ...]
    """
```

**SOTP UI** (`atlas_app.py:20185-20256`)
- User manually inputs number of segments (1-10)
- For each segment: name, revenue, EBITDA margin, EV/Revenue multiple
- Calculates total EV by summing segment values

**2. Segment Concentration Check** (`analytics/dcf_trap_detector.py:360-422`)
- Calculates HHI (Herfindahl-Hirschman Index)
- Flags concentration risk if top segment > 80%
- **BUT:** Relies on `_extract_segment_revenues()` which returns `None`

### What DOES NOT EXIST:

**1. Automatic Segment Extraction** (`dcf_trap_detector.py:752-768`)

```python
def _extract_segment_revenues(self) -> Optional[Dict[str, float]]:
    """
    Extract segment revenue data from financials
    """
    try:
        # Try to get segment data from yfinance
        # Note: yfinance doesn't always provide segment data
        # This would ideally parse 10-K segment disclosures

        # For now, use a heuristic approach
        # Check if company reports multiple business segments

        # Placeholder - would need actual segment data parsing
        return None  # <-- ALWAYS RETURNS NONE

    except Exception as e:
        return None
```

**2. SEC EDGAR Integration** - No code exists
**3. 10-K XBRL Parsing** - No code exists
**4. Segment History Tracking** - No database

---

## 5. KEY FINDINGS SUMMARY

### What Works Well:

1. **Comprehensive DCF Methods** - 8 institutional-grade approaches
2. **Smart Assumptions** - Sector-based automatic generation
3. **Regime Awareness** - Market condition adjustments
4. **Monte Carlo** - Probability-based fair value ranges
5. **Trap Detection** - 5 value trap pattern checks
6. **Multi-Stage Models** - Lifecycle-aware growth projections
7. **UI Excellence** - Beautiful, professional interface

### What's Missing:

1. **Automatic Segment Extraction** - Currently placeholder only
2. **SEC EDGAR Integration** - No 10-K/10-Q parsing
3. **XBRL Parsing** - No structured filing data extraction
4. **Segment Database** - No historical segment storage
5. **Segment-Weighted DCF** - SOTP exists but not integrated with main DCF
6. **Geographic Analysis** - No regional revenue breakdown

### Current Segment Analysis Gap:

```
CURRENT STATE:
User → Enters ticker → yfinance data only → Single company-wide growth rate

DESIRED STATE:
User → Enters ticker → Parse 10-K → Extract segments → Weight by revenue →
       → Per-segment growth rates → Aggregated weighted DCF
```

---

## 6. INTEGRATION POINTS FOR SEGMENT REVENUE

### Recommended Integration Architecture:

```
                    ┌─────────────────────────┐
                    │   SEC EDGAR API         │
                    │   (New Component)       │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │   Segment Extractor     │
                    │   (New Component)       │
                    │   - XBRL parser         │
                    │   - HTML fallback       │
                    └───────────┬─────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
┌───────────▼───────┐  ┌────────▼────────┐  ┌──────▼──────┐
│ DCFValuation      │  │ DCFTrapDetector │  │ SOTP        │
│ (Enhance with     │  │ (Replace        │  │ (Auto-fill  │
│  weighted growth) │  │  placeholder)   │  │  segments)  │
└───────────────────┘  └─────────────────┘  └─────────────┘
```

### Specific Integration Points:

**1. `valuation/atlas_dcf_engine.py`**
- Add `segment_data` parameter to `DCFValuation.__init__`
- Modify `project_cash_flows()` to use weighted segment growth
- Add `calculate_weighted_growth(segments)` method

**2. `atlas_dcf_institutional.py`**
- Extend `RobustDCFEngine` with segment-aware projections
- Add segment-level Monte Carlo (different growth distributions per segment)
- Enhance `DCFValidator` with segment margin benchmarks

**3. `analytics/dcf_trap_detector.py`**
- Replace `_extract_segment_revenues()` placeholder with real implementation
- Use actual segment data for concentration risk analysis

**4. `atlas_app.py` (Valuation House UI)**
- Add "Auto-detect Segments" button
- Display segment breakdown table
- Allow per-segment growth rate adjustments
- Show segment contribution to valuation

**5. New Files Needed:**
- `utils/sec_edgar.py` - SEC API wrapper
- `analytics/segment_extractor.py` - XBRL/HTML parsing
- `data/segment_cache.py` - Historical segment storage

---

## 7. RECOMMENDATIONS

### Phase 1: Core Infrastructure (Priority)

1. **Create SEC EDGAR client** (`utils/sec_edgar.py`)
   - Rate-limited API access (10 req/sec)
   - 10-K filing retrieval by CIK
   - XBRL and HTML document extraction

2. **Build Segment Extractor** (`analytics/segment_extractor.py`)
   - XBRL tag parsing for segment data
   - HTML table fallback parser
   - Segment name normalization

3. **Implement `_extract_segment_revenues()`**
   - Replace placeholder in `dcf_trap_detector.py`
   - Return actual segment data dictionary

### Phase 2: DCF Integration

1. **Enhance DCFValuation class**
   - Accept segment data input
   - Calculate weighted growth rates
   - Project FCF per segment

2. **Update Valuation House UI**
   - "Detect Segments" button
   - Segment table with editable growth rates
   - Visualization of segment contributions

### Phase 3: Advanced Features

1. **Segment-level Monte Carlo**
2. **Historical segment tracking**
3. **Industry peer segment comparison**
4. **Geographic risk weighting**

---

## 8. APPENDIX: FILE LOCATIONS

| File | Purpose | Lines |
|------|---------|-------|
| `atlas_app.py` | Main application + Valuation House UI | 23,600+ |
| `valuation/atlas_dcf_engine.py` | Core DCF engine | 222 |
| `atlas_dcf_institutional.py` | Institutional enhancements | 567 |
| `analytics/dcf_trap_detector.py` | Value trap detection | 889 |
| `analytics/dcf_projections.py` | Editable projections | 373 |
| `analytics/multistage_dcf.py` | Multi-stage models | 416 |
| `dcf_regime_overlay.py` | Market regime adjustments | ~200 |
| `navigation/handlers/valuation_house.py` | Page handler | 146 |

---

## 9. NEXT STEPS

CC has completed reconnaissance. The codebase is ready for segment revenue integration.

**Immediate Action Items:**
1. Design segment data model (Python dataclass)
2. Create SEC EDGAR client with proper rate limiting
3. Implement XBRL segment tag parser
4. Replace placeholder `_extract_segment_revenues()`
5. Enhance DCF engine with segment-weighted calculations
6. Update UI with segment detection and display

---

*Reconnaissance complete. Ready to support strategic implementation.*

**CC** - ATLAS Terminal Development Team
