# Valuation House — JS Bridge Architecture Reference
**Date:** 2026-04-25  
**Purpose:** Cross-session reference for building the React frontend to parity with the Python Valuation House engine. Read this before touching any DCF file.

---

## 1. What Exists in Python vs What Exists in JS

### Python (source of truth in `core/calculations.py`, `valuation/atlas_dcf_engine.py`, etc.)

| Model | Python File | Status in JS |
|-------|------------|--------------|
| FCFF DCF (single-stage) | `atlas_dcf_engine.py` + `core/calculations.py` | ✅ `dcf-engine.js → runFCFF()` |
| FCFE DCF | `core/calculations.py` | ❌ Missing |
| Gordon DDM | `core/calculations.py` | ✅ `dcf-engine.js → runGordonDDM()` |
| Multi-Stage DDM | `core/calculations.py` | ✅ `dcf-engine.js → runMultiStageDDM()` |
| Residual Income | `core/calculations.py` | ✅ `dcf-engine.js → runResidualIncome()` |
| Multi-Stage FCFF DCF | `analytics/multistage_dcf.py` | ❌ Missing — **priority** |
| SOTP Valuation | `core/calculations.py` | ❌ Missing |
| P/E Multiple | `core/calculations.py` | Partial (equity-valuation.js) |
| EV/EBITDA Multiple | `core/calculations.py` | Partial |
| PEG Valuation | `core/calculations.py` | ❌ Missing |
| Consensus (7-method) | `core/calculations.py` | Partial (3-method, dcf-engine.js) |
| Institutional Monte Carlo | `atlas_dcf_institutional.py → MonteCarloDCF` | Partial (dcf-engine.js, no param distributions) |
| Sensitivity Matrix | `analytics/dcf_projections.py` | ✅ `dcf-engine.js → runSensitivity()` |
| DCF Trap Detector | `analytics/dcf_trap_detector.py` | ❌ Missing — **priority** |
| Regime Overlay (WACC/TG adj.) | `dcf_regime_overlay.py` | ❌ Missing |
| Sector-Aware Defaults | `core/calculations.py → calculate_smart_assumptions()` | Partial — no sector logic |
| DCF Validator | `atlas_dcf_institutional.py → DCFValidator` | ❌ Missing |

---

## 2. Critical Data Field Mappings (Python → JS)

### Alpha Vantage overview payload (parsed by `equity-research.js → parseOverview()`)
```
Python key              → JS field (in overview object)
-----------               ---------------------------
Symbol                  → overview.symbol
Name                    → overview.name
Sector                  → overview.sector          ← KEY for smart defaults
Industry                → overview.industry
MarketCapitalization    → overview.marketCap
PERatio                 → overview.peRatio
EPS                     → overview.eps
Beta                    → overview.beta
DividendYield           → overview.dividendYield
AnalystTargetPrice      → overview.analystTarget
```

### AV overview raw payload (passed through as `p.overview` in DCFEngine)
```
These are in the RAW payload (o.Beta, o.MarketCapitalization etc.) before parseOverview():
Beta                    → o.Beta
MarketCapitalization    → o.MarketCapitalization
DividendYield           → o.DividendYield
```

### yFinance financials snapshot → JS `financials.snapshot`
```
Python key              → JS snap field (financials.snapshot)
-----------               ---------------------------
totalRevenue            → snap.totalRevenue
freeCashFlow            → snap.freeCashflow
ebitda                  → snap.ebitda
netIncome               → snap.netIncome
totalDebt               → snap.totalDebt (may be absent)
totalCash               → snap.totalCash (may be absent)
returnOnEquity          → snap.returnOnEquity
revenueGrowth           → snap.revenueGrowth
debtToEquity            → snap.debtToEquity  (as %, so divide by 100)
profitMargins           → snap.profitMargins
trailingEps             → snap.trailingEps
bookValue               → snap.bookValue
forwardPE               → snap.forwardPE
pegRatio                → snap.pegRatio
priceToBook             → snap.priceToBook
evToEbitda              → snap.evToEbitda
evToRevenue             → snap.evToRevenue
enterpriseValue         → snap.enterpriseValue
earningsGrowth          → snap.earningsGrowth
forwardEps              → snap.forwardEps
```

---

## 3. Sector Benchmark Data (from Python `atlas_dcf_institutional.py` + `core/calculations.py`)

These should drive `deriveDefaults()` in `dcf-engine.js` when `sector` is known.

```javascript
SECTOR_BENCHMARKS = {
    'Technology':             { revGrowth: 0.12, ebitMargin: 0.25, capexPct: 0.03, daPct: 0.04, nwcPct: 0.015, sbcPct: 0.04, sectorWaccAdj: 0 },
    'Healthcare':             { revGrowth: 0.08, ebitMargin: 0.20, capexPct: 0.04, daPct: 0.05, nwcPct: 0.020, sbcPct: 0.02, sectorWaccAdj: 0 },
    'Financial Services':     { revGrowth: 0.06, ebitMargin: 0.32, capexPct: 0.02, daPct: 0.02, nwcPct: 0.005, sbcPct: 0.01, sectorWaccAdj: 0 },
    'Consumer Cyclical':      { revGrowth: 0.06, ebitMargin: 0.11, capexPct: 0.05, daPct: 0.04, nwcPct: 0.025, sbcPct: 0.01, sectorWaccAdj: 0 },
    'Consumer Defensive':     { revGrowth: 0.04, ebitMargin: 0.14, capexPct: 0.04, daPct: 0.04, nwcPct: 0.020, sbcPct: 0.01, sectorWaccAdj: 0 },
    'Energy':                 { revGrowth: 0.04, ebitMargin: 0.18, capexPct: 0.10, daPct: 0.08, nwcPct: 0.010, sbcPct: 0.01, sectorWaccAdj: +0.005 },
    'Industrials':            { revGrowth: 0.06, ebitMargin: 0.14, capexPct: 0.06, daPct: 0.05, nwcPct: 0.025, sbcPct: 0.01, sectorWaccAdj: 0 },
    'Basic Materials':        { revGrowth: 0.04, ebitMargin: 0.16, capexPct: 0.08, daPct: 0.07, nwcPct: 0.020, sbcPct: 0.01, sectorWaccAdj: +0.005 },
    'Real Estate':            { revGrowth: 0.04, ebitMargin: 0.24, capexPct: 0.15, daPct: 0.06, nwcPct: 0.005, sbcPct: 0.005, sectorWaccAdj: 0 },
    'Utilities':              { revGrowth: 0.03, ebitMargin: 0.24, capexPct: 0.20, daPct: 0.08, nwcPct: 0.005, sbcPct: 0.005, sectorWaccAdj: -0.005 },
    'Communication Services': { revGrowth: 0.07, ebitMargin: 0.22, capexPct: 0.08, daPct: 0.06, nwcPct: 0.015, sbcPct: 0.03, sectorWaccAdj: 0 },
}

// Market-cap size adjustment to revenue growth
SIZE_ADJ = {
    megacap: { threshold: 500e9,  adj: -0.03 },  // >$500B
    largecap: { threshold: 100e9, adj: -0.01 },  // $100B-$500B
    midcap:   { threshold: 10e9,  adj:  0.00 },  // $10B-$100B
    smallcap: { threshold: 0,     adj: +0.01 },  // <$10B
}
```

---

## 4. DCF Trap Detector — 5 Institutional Checks

Source: `analytics/dcf_trap_detector.py → DCFTrapDetector`

### Trap 1: TERMINAL_VALUE_DEPENDENCY (most common)
```
Input:  pvTv (PV of terminal value), evTotal (total EV)
tvPct = pvTv / evTotal
CRITICAL  if tvPct > 0.85
HIGH      if tvPct > 0.80
MEDIUM    if tvPct > 0.70
OK        if tvPct <= 0.70
```

### Trap 2: DISCOUNT_RATE_ILLUSION
```
Input: wacc, beta
Flag 1: wacc < 0.065  (below RF + 200 bps, using RF = 4.5%)
Flag 2: beta < 0.8 AND sector not in ['Utilities', 'Consumer Defensive', 'Real Estate']
Flag 3: wacc < 0.07 AND debtToEquity > 1.0

CRITICAL if 3+ flags
HIGH     if 2 flags
MEDIUM   if 1 flag
```

### Trap 3: TERMINAL_GROWTH_EXCEEDS_GDP
```
GDP_PROXY = 0.025
Flag: terminalGrowth > GDP_PROXY + 0.01   (>3.5%)
HIGH if tg > 0.04, MEDIUM if tg > 0.035
```

### Trap 4: MARGIN_EXPANSION_UNWARRANTED
```
historicalFcfMargin  = snap.freeCashflow / snap.totalRevenue
projectedFcfMargin   = fcfMargin (slider value)
expansionRatio       = projectedFcfMargin / max(historicalFcfMargin, 0.01)

HIGH   if expansionRatio > 2.0  (doubling margin)
MEDIUM if expansionRatio > 1.5  (50%+ expansion)
```

### Trap 5: NEGATIVE_FCF_COMPANY (structural)
```
Flag: snap.freeCashflow < 0  (company currently burns cash)
HIGH if FCF < 0 AND DCF assumes positive FCF in all years
```

### Output format for each trap:
```javascript
{
    id: 'TERMINAL_VALUE_DEPENDENCY',
    severity: 'HIGH',   // CRITICAL / HIGH / MEDIUM / INFO
    title: 'Terminal Value Dominance',
    description: 'Terminal value represents 83% of enterprise value...',
    metric: '83%',
    recommendation: 'Extend forecast years or apply lower terminal growth'
}
```

---

## 5. Multi-Stage FCFF Architecture

Source: `analytics/multistage_dcf.py → MultiStageProjectionEngine`

### Stage Object
```javascript
Stage = {
    name: 'High Growth',     // display name
    years: 5,                // number of years in this stage
    revGrowthStart: 0.15,    // start-of-stage annual revenue growth
    revGrowthEnd: 0.08,      // end-of-stage growth (linearly interpolated)
    ebitMargin: 0.22,        // constant EBIT margin (can be start/end for trajectories)
    capexPct: 0.05,
    daPct: 0.04,
    nwcPct: 0.025,
    sbcPct: 0.02,
}
```

### Two-Stage Model (default)
```
Stage 1 (High Growth): years 1–5, user-defined high growth tapering to terminal
Stage 2 (Terminal): Gordon Growth perpetuity
```

### Three-Stage Model (extended)
```
Stage 1 (High Growth):   years 1–5
Stage 2 (Transition):    years 6–10, growth declines linearly toward terminal
Stage 3 (Terminal):      Gordon Growth perpetuity
```

### Per-year projection formula (Python-faithful):
```
revenue[y]    = revenue[y-1] × (1 + interpolatedGrowth(y))
ebit[y]       = revenue[y] × ebitMargin
nopat[y]      = ebit[y] × (1 - taxRate)
da[y]         = revenue[y] × daPct
capex[y]      = -revenue[y] × capexPct         (negative)
nwcChange[y]  = -(revenue[y] - revenue[y-1]) × nwcPct   (negative)
sbc[y]        = -revenue[y] × sbcPct           (negative)
fcff[y]       = nopat + da + capex + nwcChange + sbc
```

### Linear growth interpolation (Python-faithful):
```javascript
function interpolateGrowth(start, end, progress) {
    return start + (end - start) * progress;
    // progress = (year - stageStart) / stageDuration ∈ [0, 1]
}
```

---

## 6. Regime Overlay (Future)

Source: `dcf_regime_overlay.py → DCFRegimeOverlay`

The regime comes from `vw_command_centre` or `vw_quant_dashboard` (already loaded).  
When regime data is available in the React SPA, apply:

```
REGIME_ADJUSTMENTS = {
    risk_on:      { waccAdj: -0.005, tgAdj: +0.0025 },
    neutral:      { waccAdj:  0,     tgAdj:  0      },
    transitional: { waccAdj: +0.0025,tgAdj: -0.001  },
    risk_off:     { waccAdj: +0.010, tgAdj: -0.005  },
}
```

Display impact label: AGGRESSIVE / NEUTRAL / MODERATELY CONSERVATIVE / CONSERVATIVE

---

## 7. DCFValidator — Sector Benchmark Warnings

Source: `atlas_dcf_institutional.py → DCFValidator`

```javascript
VALIDATION_WARNINGS = [
    { key: 'revGrowth', threshold: 0.25, op: '>', level: 'caution',  msg: 'Revenue growth >25% is exceptional — validate against sector peers' },
    { key: 'terminalGrowth', threshold: 0.035, op: '>', level: 'warning', msg: 'Terminal growth exceeds long-run GDP — consider reducing' },
    { key: 'terminalGrowth', vs: 'revGrowth', op: '>=', level: 'error',  msg: 'Terminal growth ≥ revenue growth — model is internally inconsistent' },
    { key: 'wacc', threshold: 0.06, op: '<', level: 'caution',  msg: 'WACC below 6% — verify capital structure inputs' },
    { key: 'fcfMargin', vs: 'sectorTopQuartile', op: '>', level: 'caution', msg: 'FCF margin exceeds sector top quartile' },
]
```

---

## 8. Implementation Priority (Ordered)

### ✅ Done
- Single-stage FCFF DCF
- Gordon DDM + Multi-Stage DDM
- Residual Income
- Monte Carlo (basic)
- Sensitivity Matrix (WACC × TG)
- Consensus (3-model, 3-scenario)
- BEAR/BASE/BULL scenario presets

### 🔴 Priority 1 — Implement Now
1. **Sector-aware `deriveDefaults()`** in `dcf-engine.js` — affects all models immediately
2. **DCF Trap Detector** `detectTraps()` in `dcf-engine.js` + `TrapBanner` React component
3. **Multi-Stage FCFF** `runMultiStageFCFF()` in `dcf-engine.js` + `MultiStagePanel` component

### 🟡 Priority 2 — Next Sprint
4. **Full FCFF Projection Table** — year-by-year line items (Revenue, EBIT, NOPAT, D&A, CapEx, NWC, SBC, FCFF)
5. **DCF Validator Warnings** — inline warnings on slider changes

### 🟢 Priority 3 — Future
6. **SOTP Valuation** — segment editor + EV/Revenue multiples
7. **Regime Overlay** — WACC/TG adjustment from `vw_quant_dashboard` regime signal
8. **FCFE DCF** — parallel to FCFF but equity cash flows only
9. **Institutional Consensus** — 7-method weighted with IQR filtering

---

## 9. Architecture Rules (Do Not Deviate)

1. **All DCF math in `dcf-engine.js`** — React components are renderers only
2. **Data comes from AV overview + financials snapshot** — no new API calls for DCF
3. **No Supabase reads in equity pages** — all data from `/api/equity?symbol=TICKER`
4. **Sector string from `overview.Sector`** (raw AV field) — must match benchmark keys exactly (use case-insensitive lookup)
5. **`deriveDefaults()` signature must not change** — it's called by ConsensusPanel, FcffPanel, DdmPanel, RiPanel, SimPanel

---

*Generated 2026-04-25 from analysis of `valuation/atlas_dcf_engine.py`, `analytics/dcf_trap_detector.py`, `analytics/multistage_dcf.py`, `analytics/dcf_projections.py`, `atlas_dcf_institutional.py`, `dcf_regime_overlay.py`, `core/calculations.py`*
