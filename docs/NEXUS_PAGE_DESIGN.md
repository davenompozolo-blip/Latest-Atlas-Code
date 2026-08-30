# ATLAS Nexus — Page Design, Data & Feature Reference

*Written as a handoff for another Claude instance. It describes the Nexus page **as it stands on `main` today** (2026-08-30): routing, layout, every panel and chart, the column and control surface, the data layer (endpoints, views, tables), the honesty rules that govern degradation, and the open enhancement backlog.*

*The two older docs in this folder — `NEXUS_ARCHITECTURE_REPORT.md` and `NEXUS_BUILD_REPORT.md` — are still useful for design intent but are **out of date on scope**: they describe five tabs with Drift as a shell. There are now six tabs, Drift is built, The Bench exists, and the Theme tab carries a four-beat realized layer. Prefer this file where they disagree.*

---

## 1. Where it lives

There are **two** Nexus pages, both routed from `src/pages/app.js`:

| Route id | Component | File | Status |
|---|---|---|---|
| `nexus` | `NexusFlagshipPage` | `src/pages/nexus/NexusFlagship.js` | **Primary.** The flagship spine — six tabs. This is "the Nexus page". |
| `nexus-legacy` | `NexusPage` | `src/pages/nexus-page.js` | Preserved and relabelled "Legacy Nexus". Three-zone intelligence surface; still functional, not the active design. |

`NexusShell` (exported from `src/pages/nexus-page.js`) is the **universal persistent chrome** — topbar + icon sidebar — wrapping every module in the terminal, not just Nexus. Don't confuse the shell with the legacy page; `app.js` renders `NexusShell` around whatever module is active.

```
src/pages/nexus/
  NexusFlagship.js      page shell, tab rail, chefbar, Flagship panel, holdings table, blotter
  nexusModel.js         the typed contract (JSDoc only, no runtime exports)
  nexusMock.js          structural baseline provider
  nexusLive.js          real provider — IO + assembly only
  nexusLiveCompute.js   book maths (spine, concentration, sizing, windshield, chef, read)
  readEngine.js         the per-name read cascade
  nexusDataIntegrity.js live feed-freshness / sync-age
  nexusColumns.js       holdings column registry + persistence + premium banding
  Nexus{Tab}.js         render components (React.createElement, no JSX)
  nexus{Tab}Compute.js  pure maths, IO-free
  *.test.mjs            17 suites, plain `node --test`
api/nexus-{bench,board,cot,earnings,opportunities,theme}.js   server-side aggregation
src/styles/nexus-flagship.css   (1374 lines, scoped `.nexus-flagship`)
src/styles/nexus-theme.css      (421 lines, scoped `.nexus-root` — legacy page + shared tokens)
```

---

## 2. Architecture and conventions — read before extending

### The spine philosophy
One typed contract, `NexusModel` (`nexusModel.js`). Every Flagship component reads from a **resolved model**, never a hardcoded literal. Two providers resolve to that shape:

- `nexusMock.js` — structural baseline. Guarantees the page renders.
- `nexusLive.js` — real, Supabase/endpoint-backed. **Overrides the model section by section**; anything not yet live falls back to baseline.

`getNexusModel()` in `nexusLive.js` returns `{...baseline, holdings, spine, themeSpine, nav, portfolio, gauges, windshield, seasonal, chef, read }`. If Supabase is unconfigured, errors, or returns an empty book, it returns the baseline **unchanged** — the page never renders blank.

### The three-layer pattern (every tab uses it)
1. **Pure compute** — `nexus*Compute.js`. Side-effect-free, IO-free, unit-tested under plain `node --test` (no React, no Supabase). All maths lives here.
2. **Render** — `Nexus*.js`, `React.createElement` only. There is **no JSX transform** for these files. SVG charts are built the same way — watch paren balancing on large `e(...)` trees.
3. **Endpoint** — `api/nexus-*.js`. Server-side aggregation on the anon key, edge-cached. Heavy tabs **self-fetch their own endpoint** rather than routing through the model (bench, board, cot, earnings, opportunities, theme), keeping big fan-outs server-side.

### Honesty rules (baked in, do not relax)
- Never fabricate a number to fill an axis. Missing valuation renders **dashed/grey "pending"**, not zero.
- Missing beta / momentum → `null`, never `0`.
- Untrusted valuations (bare DCF, extreme gaps) are dampened and flagged: `fv_trustworthy`, `fv_untrust_reason`, `valuationPending`.
- A source that is unreachable is **`null`** (degrade visibly); a source that is genuinely empty is **`[]`**. `api/nexus-bench.js` makes this distinction explicit and the diagnostics strip renders it.
- Stale price feeds **freeze the verdict** rather than publishing one (`readEngine` gate 1, bench `resolveVerdict({priceStale})`).
- A pane that cannot answer says why. "No data" is never printed where "the query timed out" or "the writer never fired" is the truth.

### CSS / design system
Two scoped token sets, deliberately separate:

| | `.nexus-flagship` (`nexus-flagship.css`) | `.nexus-root` (`nexus-theme.css`) |
|---|---|---|
| Backgrounds | `--bg #080b0e` `--bg1 #0d1117` `--card #121821` `--card2 #171f2a` `--card-hi #1d2734` | `--nx-bg #080b0e` … `--nx-bg4 #222d3a` |
| Text | `--text #e3e9f2` `--text2 #8aa0bb` `--text3 #51647b` | `--nx-text #dde4ed` `--nx-text2 #7e95b0` `--nx-text3 #46586a` |
| Accents | `--cyan #22d3ee` `--amber #f5a623` `--purple #8b5cf6` `--success #22c55e` `--danger #ef4444` `--warn #f59e0b` | blue / teal / amber / red / green / purple / coral / gold, each with a `-b` background variant |
| Type | `--fd Syne` (display) · `--fb DM Sans` (body) · `--fm JetBrains Mono` (numerals) | same three, `--nx-` prefixed |
| Radii | 6 / 9 / 13px | 5 / 8 / 12px |

Base font-size 12px, line-height 1.5. **All numerals are tabular** (`font-variant-numeric: tabular-nums` on `.nf-mono` / `.num`). Scrollbars are 4px/3px. Class prefixes: `nf-` flagship, `nx-` legacy, `nb-` board/bench, `nt-`/`ntr-` theme, `np-` portfolio, `bn-` bench, `qt-` quick ticket. Tone classes `tone-up` / `tone-down` / `tone-warn` / `tone-neutral` carry sign colour everywhere.

---

## 3. Page structure

```
NexusHeader        wordmark · market clock (1s tick) · DataIntegrityIndicator (hover popover)
TabRail            6 tabs, "● HOT" badge on chef.hotTab
ChefBar            (Flagship only) 👨‍🍳 + one-line reason + "Open {Tab} →"
<panel>            the active tab
```

### The six tabs

| id | Label | Question it answers | Panel component |
|---|---|---|---|
| `flagship` | Flagship | What is the state of the book, per name? | `FlagshipPanel` (in `NexusFlagship.js`) |
| `theme` | Theme | Which themes to rotate between — and did the last call work? | `NexusThemePanel` + `NexusRealizedLayer` |
| `regime` | Regime | Is the book positioned for the macro regime? | `NexusRegimePanel` |
| `opp` | Opportunities | Best use of the marginal dollar, given what I own? | `NexusOpportunitiesPanel` |
| `bench` | The Bench | Does each position still deserve its slot? | `NexusBenchPanel` |
| `drift` | Drift | How far has the book wandered from its conviction weights? | `NexusDriftPanel` |

`chef.hotTab` is computed live by `buildChef({spine, holdings, concentration})` — it picks the genuinely hottest tab (theme dispersion / fragile concentration / cheap crop / balanced) with a factual reason. It is not authored.

---

## 4. Flagship tab — panels in render order

`FlagshipPanel` renders, top to bottom:

1. **`PortfolioSnapshot`** (`NexusPortfolio.js`) — 11 tiles. Account equity, long exposure (+ leverage), cash/margin, day P&L, unrealised P&L, win rate, today up/down, at-risk (positions down >10%), top concentration (+ top-5 weight), best/worst, weighted quality. Account economics self-fetch from `/api/trading?action=account`; position stats come from `buildPortfolioSnapshot(rows)`. Each tile colour-codes by meaning, staggered 45ms fade-in.
2. **`WindshieldBand`** — the macro driver sentence (with `driverEmphasis` italicised inline) + live FRED stat tiles, from `buildWindshield(macro)` over `/api/macro`. Falls back to baseline if FRED is down.
3. **`ContextGauges`** — three cards:
   - **Risk** — budget used / limit with a coloured progress bar, Δ today in points. *(baseline; not yet live)*
   - **Performance** — book vs bench vs relative, top movers chips, concentrated contribution. *(baseline)*
   - **Concentration** — **live**: effective N vs nominal N, top-factor %, fragility cluster names. From `buildConcentration(rows)`.
4. **`NexusBoardSection`** (`NexusBoard.js`) — four charts, see §6.
5. **`PositioningSpine`** — the book's shape. **Two independent toggles**:
   - *Dimension*: **Sector** ↔ **Theme**. These are different taxonomies and are deliberately both carried (`spine` and `themeSpine`). A book can look spread across sectors while being one trade expressed eight ways — only the theme cut shows that.
   - *View*: **Bars** ↔ **Treemap**. Bars are default because they carry risk-shift, which the treemap has no free channel for; the treemap wins on share comparison.
   - Bars: label (+ name count, ◆ fragility marker, `stale` tag), share %, today %, a share track with 2-segment risk-shift pips.
   - Unmapped weight is **reported, never hidden** — a footnote states what % of the book has no sector/theme mapped and sits in Unclassified.
6. **`HoldingsTable`** — see §5.
7. **`OrderBlotter`** — see §5.4.
8. **`NexusEarningsTable`** (`NexusEarnings.js`) — earnings on deck. One row per holding (not just reporters), searchable, theme- and window-filterable, reporters floated to top. From `/api/nexus-earnings`.
9. **`NexusCotTable`** (`NexusCot.js`) — futures positioning. CFTC Commitments of Traders for the book's macro drivers, from `/api/nexus-cot`.
10. **`NexusOptionsPanel`** (`NexusOptions.js`) — options positioning per held name.
11. **`TheRead`** — the narrative close, with a rate-view stance toggle (`What's priced` ↔ `Higher-for-longer`), built by `buildRead({macro, concentration, holdings, spine})` as factual templating, not generation.

---

## 5. The holdings table — the densest control surface on the page

### 5.1 Column registry (`nexusColumns.js`)

19 columns in five groups. Registry order **is** display order — the chooser picks membership, not position, so the table never reshuffles under the reader.

| Group | Columns |
|---|---|
| Identity | `tk` (**locked**, ticker + asset name beneath), `sector`, `theme` |
| Position | `weight` (bar + %), `conviction` (bar + score, colour-graded) |
| Performance | `todayPct`, `totalReturn` (basis-aware), `contribPct` |
| Risk | `annualVol` (magnitude — no sign, no tone), `componentVar` |
| Valuation | `fwdPe`, `fwdPeGap` (vs market), `fwdPeBadge` (banded), `marketFwdPe`, `fvGapPct` (diverging bar) |
| Read | `signal`, `options`, `read` (chip), `trade` (quantum) |

**Default visible set** (fits without horizontal scroll): tk, sector, theme, weight, conviction, todayPct, totalReturn, annualVol, fwdPe, fwdPeGap, fwdPeBadge, read, trade. Everything else is available but off — *a column you have to scroll past is worse than a column you opted into.*

Persistence: `localStorage['atlas.nexus.holdings.columns.v1']`. Load is defensive — unknown keys are dropped and locked columns forced back in, so a stale preference can never render a table with no ticker column.

**Premium/discount bands** (`premiumBand`, deliberately wide — within ±15% of the market multiple *is* "at the market"):

| Fwd P/E premium | Band |
|---|---|
| ≥ +100% | RICH |
| ≥ +15% | PREMIUM |
| −15% … +15% | IN LINE |
| −40% … −15% | DISCOUNT |
| < −40% | DEEP DISC |

**Sign convention trap:** `fwdPeGap` is signed the *opposite* way to a return — a positive premium is the expensive direction and must not render in the same green that means "up" two columns to the left. `CELL_CLASS.fwdPeGap` inverts the tone deliberately.

### 5.2 Controls
- **Search** — ticker substring.
- **Theme select** — all themes + an explicit `Unclassified` option when any name is unmapped.
- **Read filter rail** — chips for add / hold / trim / watch / exit with live counts; doubles as a distribution visual. `clear` appears when any filter is dirty.
- **`ReturnBasisToggle`** — SINCE ENTRY ↔ MWR, shared control `atlas.return.basis.v1`, **shared with the Performance module** (same question, so one control). Sorting follows the displayed basis. **It never falls back across bases**: a row with no MWR renders `—` with `engineReason`/`engineStatus` in the title, never its SINCE ENTRY number wearing the MWR heading.
- **`ColumnChooser`** — grouped checkbox popover with a reset, count badge, "Saved on this browser" footer.
- **Sorting** — click any sortable header; direction defaults ascending for text columns, descending for numerics; `read` sorts by taxonomy rank (add→exit), not alphabetically.
- Bar scales are **relative to what is in view** and floored (`fvScale ≥ 10`, `wtScale ≥ 2`) so a small or light book still reads.

### 5.3 Row interactions (three, deliberately non-colliding)
- **Row click** → opens the **quick ticket** modal.
- **Ticker click** (stops propagation) → dispatches `nexus:open-object` for the live-object drill. *Nothing listens for this yet* — the affordance is kept because deleting it because its receiver isn't built would be the wrong way round.
- **Read chip click** (stops propagation) → expands a `WHY` row carrying `because` and, when present, the saved scrapbook `THESIS` + conviction rating.
- **Trade chip click** (stops propagation) → stages/unstages a blotter ticket.

### 5.4 The read engine (`readEngine.js`)
> "The read is the verdict column, derived not authored."

Pure, deterministic. Cascade, in order:

0. **Data gate** — `stale` → freeze: `watch` if conviction soft, else `hold`.
1. Room assessed once via the injected **`RoomAssessor`** seam (v1 = `ConcentrationPenalty`, a single VaR cap; v1.1 theme concentration and v2 Cortex marginal risk are same-signature drop-ins).
2. Deteriorating and not strong-cheap → `watch`.
3. Rich and not improving → `trim`.
4. Attractive with room → `add`.
5. Cheap, thesis intact, no room → `hold` (with the room reason).
6. Soft + rich + deteriorating → `exit`.
7. Default → `hold`, "Fairly valued, thesis intact."

`READ_CONFIG` knobs (config, not code — no threshold is buried in the logic): `cheapLo 4`, `cheapHi 10`, `richTh −3`, `lowConv 55`, `varCap 10`. Every read ships a `because`.

### 5.5 Sizing and execution
**Conviction-target sizing** (`nexusLiveCompute.js`): each name's target weight ∝ its conviction, normalised to the book's *invested* weight — a rebalance within the same gross, not a cash call. `bookNav` is the **median** of `|mv| / (weight/100)` across rows, so a stray row cannot skew it. `sizeTrade` closes the gap **only in the direction the read already calls**: ADD buys the shortfall, TRIM sells the excess, EXIT closes the line, HOLD/WATCH trade nothing. A name already at its conviction weight renders `at target`.

**`OrderBlotter`** — staged tickets reviewed as a batch. Two-step **arm → confirm**; nothing reaches the broker until the confirm. Each order POSTs to `/api/trading?action=order` with a `ledger` payload (conviction, intent, rationale, signal snapshot) so the decisions ledger records *why*. Client order ids are `nexus-{tk}-{ts}`. The footer reads the account mode from `/api/trading?action=account` and shows **PAPER** vs a red **⚠ LIVE account** warning. `ALPACA_PAPER` defaults true — live trading is a deliberate, unflipped switch.

**`NexusQuickTicket`** — explicitly **not a second trading path**. It imports the same three engines the Trade module's full ticket uses (`lib/trade/sizing.js`, `lib/trade/coherence.js`, `lib/trade/tradeData.js`) and posts the same ledger payload to the same endpoint. What is dropped is depth, not rigour: no book-impact pane, no trigger arming, no staged clips — and anything it cannot show, it says it cannot show, with a link to the full ticket. **The gates are the same gates**: no price/equity → blocked; derived qty zero → blocked; **no claim on file → blocked** (state the thesis to enable the ticket); a non-`act` coherence posture requires an explicit acknowledgement. Adding to a position whose claim is already `bending`/`broken` raises a confirm naming the claim.

---

## 6. Charts and visualisations — full inventory

Everything is hand-built inline SVG via `createElement` **except** the two Plotly treemaps. There is no charting library in the Nexus tabs other than `plotly.js-dist-min`.

| Chart | Where | Encoding |
|---|---|---|
| **Fear & Greed gauge** | Board (Flagship) | Transparent composite of VIX, momentum, safe-haven, credit, breadth — `computeFearGreed` shows its inputs |
| **VIX track record** | Board | Line with FOMC/CPI/NFP event markers (`eventMarkers`) |
| **Breadth ratios** | Board | RSP/SPY and QQQE/QQQ rebased to 100 — equal- vs cap-weight |
| **Major indices** | Board | Selectable symbol (SPY/QQQ/IWM/DIA) × timeframe |
| **Spine treemap** | Flagship spine | Squarified layout (`squarify`), area = share, fill = today's move (`moveFill`). Rendered as **real DOM, not SVG** — an SVG treemap distorted the type. Matches the Name-Impact heatmap's visual language exactly (same frame, clip, inset) so the two read as one component |
| **FV-gap diverging bar** | Holdings cell | Centred at zero, green right = cheap, red left = rich, scaled to the widest gap in view |
| **Weight / conviction bars** | Holdings cells | Track + fill, conviction colour-graded (≥75 green, ≥60 cyan, ≥45 amber, else red) |
| **Rotation map** | Theme | `viewBox 0 0 760 442`. X = position-weight percentile, Y = 5-day momentum Δ, bubble size = conviction, colour = valuation. **Dashed grey outline where valuation is pending** — never a filled guess |
| **Leadership shift ledger** | Theme | The map's Y-axis, sorted — same field, a second reading |
| **Dispersion sparkline + history band** | Theme (`NexusDispersion.js`) | 2px spread line over recessive σ-bands |
| **Regime quadrant** | Regime | `viewBox 0 0 440 280`. Growth × inflation 2×2 with the current regime plotted |
| **Opportunity map** | Opportunities | `viewBox 0 0 760 290`. Conviction × FV gap, fit-coloured, composite-solid / model-dashed ring, **swap arrows** between fund-from and fund-to |
| **Contribution waterfall** | Bench | Carriers → small names → detractors → net |
| **Annotated tape sparkline** | Bench docket rows | Per-name price tape with claim/thesis event markers |
| **Story vs Tape ("the jaws")** | Bench trial panel | Thesis composite against the name's own tape; the gap is the story |
| **Circulatory chart** | Bench ruling panel | Freed capital routed from cuts to recruits |
| **Sector P&L waterfall** | Theme beat 05 | Implied vs actual, $ or % toggle |
| **Contribution bars** | Theme beat 06 | Per-name contribution to period P&L |
| **Name-impact heatmap** | Theme beat 06 | **Plotly treemap**, colour clipped at ±6% |
| **Evidence chart** | Theme beat 08 | Full chart bench over `lib/chartSeriesEngine.js` — SMA/EMA/Bollinger/RSI/MACD, rolling beta, timeframes |

---

## 7. Theme tab — the rotation funnel, then the grading

`NexusThemePanel` renders six sections. The first five make a call; the sixth grades it.

1. **Regime banner** — why rotation is happening now (from `/api/macro`).
2. **The call** — `RecoCard` (the rotation recommendation itself) + `ConvictionPanel`, a **four-factor breakdown** with equal weights: `{momentum .25, positioning .25, breadth .25, macroFit .25}` (`CONVICTION_WEIGHTS`). `rotationBlockers` and `rotationGap` state what would have to be true for the call to change.
3. **Rotation map + Leadership ledger** — with a `DispersionRegime` badge above the map (wide dispersion → the rotation call is trustworthy; compressed → beta dominates, treat as noise) and a `SectorDispersionStrip` below.
4. **Per-theme breakdown** — one card per theme, verdict chip from `VERDICT_CHIP` (`ADD→BUY`, `LET_RUN→HOLD`, `TRIM→SELL`, `IGNORE→WATCH`), VaR/conviction on hover, click → drills to Flagship filtered to that theme.
5. **Transmission** (supporting evidence, demoted deliberately) — per-theme rate/USD/oil betas. **Betas are vol-normalised to a 1% factor move** so the three channels are comparable. Proxies: TLT (rate), UUP (USD), USO (oil); 60-day window, 5-day momentum. Plus **intra-theme dispersion** — winners vs losers inside a calm average, shown only where the spread is ≥2pp.
6. **`NexusRealizedLayer`** — beats 05–08. Nothing here is a new panel; every section is the realized counterpart of the beat directly above it.

| Beat | Title | What it does |
|---|---|---|
| 05 | Realized transmission | Beat 03's betas turned into dollars. Sector P&L bridge (waterfall) + implied-vs-actual table. `implied = Σ β_f × today's factor move × sector MV`, using **beat 03's own β and moves — never recomputed**. Residuals flagged at >1σ once `sector_pnl_residuals` has ≥20 daily rows per sector; until then `1σ FLAGS: —`, accruing, not faked. Period pills 1D/5D; **MTD is disabled with a stated reason** (no per-position MTD source) rather than approximated |
| 06 | Name impact | Beat 05's residual attributed by name. Bars (decision view, default) ↔ Plotly heatmap (surface view). Filter: All / Flagged sectors / Book only — "Flagged sectors" pre-selects **only** when beat 05 actually flagged something |
| 07 | Decision scorecard | Brinson grades the **two** engines separately: allocation effect → the rotation map; selection effect → the opportunities ledger; interaction → the two agreeing. Benchmark pills share `atlas_brinson_bench` with the Performance module. QTD disabled with a stated reason until `attribution_history` accrues period snapshots |
| 08 | Evidence | The chart bench over `chartSeriesEngine`, carrying through the names beat 06 flagged |

**Note (from CLAUDE.md):** Brinson stays on SINCE ENTRY whatever the return-basis toggle says, and is badged `ON SINCE ENTRY` when they differ — `computeBrinsonAttribution` is shared with Nexus beat 07, so re-basing it here would silently re-base a module nobody asked to change.

---

## 8. Regime, Opportunities, Bench, Drift

### Regime — alignment funnel
Verdict + the **growth × inflation 2×2** with the regime plotted → **macro dashboard** (rates / inflation / growth / stress, levels and deltas) → **book fit** (`bookRegimeFit(spine, label)` — sector tilt vs the regime playbook, additive or headwind) → the regime read. Self-fetches `/api/macro`; book fit reads `model.spine`. `PLAYBOOKS` and `rotationBias` hold the regime→sector mapping. No new endpoint.

### Opportunities — the marginal-dollar ledger
Frame → **opportunity map** → **the one ranked ledger** (provenance tags, fit, fund-from) → **thesis-in-context** cards → **sector playbook against your weights**.

Scoring pipeline in `nexusOpportunitiesCompute.js`: `isolatedMerit` (winsorised, trust-gated) → `portfolioFit` (additive / redundant / neutral, from correlation-to-book and excess VaR) → `fundingSleeveFor` → `rankLedger`. **The cheapest name is not the top opportunity** — that is the entire point of the fit term.

`/api/nexus-opportunities` assembles candidates from `vw_nexus_holdings`, `scrapbook_companies` / `scrapbook_narratives` / `scrapbook_sector_notes`, `cortex_signals` / `cortex_watchlist`, `insight_correlation_cluster`, `insight_counter_specific_var_vs_sector`, and `vw_funding_sleeve` — **the only fund-from source**. An empty qualified sleeve degrades to an explicit unresolved state carrying the disqualification reasons; **a funding name is never invented.** Sleeve composition staleness is self-checked in localStorage (`SLEEVE_STALE_SESSIONS = 10`). `MAX_LEDGER = 24`. Scrapbook sector names are free text and are keyword-normalised onto the book's taxonomy before being pitted against real weights.

### The Bench — the verdict layer
The heaviest tab. `NexusBenchPanel` renders: **diagnostics strip** (the bench auditing itself) → **census strip** (four legacy panels as one filter surface) → **sleeve headroom rail** → **contribution waterfall** → **the docket** (expandable rows → trial panel → ruling panel).

Key mechanics in `nexusBenchCompute.js`:
- `resolveVerdict(assessment, {priceStale})` — four states plus the honest non-states: no assessment row → `pending` ("no ruling on file"); a stale price **suspends** the verdict. `RULING_AGED_DAYS = 5`.
- `claimsTally` / `deriveIntegrity` — `intact` / `bending` / `broken` from confirmed vs contradicted claims. No claims on file renders "no claims", not a green tick.
- `thesisFreshness` — `THESIS_STALE_DAYS = 30`.
- `weightVsConviction` — `WEIGHT_GAP_PP 1.0`, `WEIGHT_FLAT_PP 0.15`.
- `volTriggerRead` — `VOL_TRIGGER_Z 2.0`, `VOL_STALE_DAYS 5`; abstains with a reason rather than guessing.
- `gateRecruit` — a recruit cannot be funded into a sleeve without headroom; `SLEEVE_TIGHT_PP 3.0`, `HEADROOM_RAIL_PP 20.0`. Pending rulings that *would* free room are counted, and the message says how much short they leave you.
- `buildCirculation` — sells from verdicts → sleeves → ledger recruits, as a flow.
- `benchDiagnostics` — surfaces every degradation by name: FV trust coverage, writer last run and row count, whether `bench_claims` is provisioned, whether contribution is cumulative or today-only, sleeve unresolved, NAV coverage, vol rows/triggers/abstentions.

### Drift — the rebalance lens
**Concentration health** (reads `gauges.concentration`) → **off balance** (per-name drift from conviction target, sorted by magnitude) → **theme drift** → **the rebalance read**. `buildDriftRows` uses a **0.25ppt dead-band** (within it = on target) and excludes derivatives; `driftSummary` reports `turnoverPct` = Σ positive drift ≈ the one-sided trade needed to snap back (targets are normalised to invested weight, so Σ over ≈ Σ under), `nMaterial` at ≥1ppt, and the clearest trim/add. Renders "Conviction targets pending" rather than a zero when there is nothing to measure against.

---

## 9. Data layer

### 9.1 Endpoints

| Endpoint | Consumer | Sources | Notes |
|---|---|---|---|
| `/api/nexus-bench` | Bench | 15 reads (see below) | Degrades explicitly, never throws, never invents |
| `/api/nexus-board` | Flagship board | FRED `VIXCLS`, `/api/equity` daily for SPY/QQQ/IWM/DIA + RSP/QQQE | Always 200s; missing pieces come back null/empty |
| `/api/nexus-cot` | Flagship | CFTC public Socrata `6dca-aqww.json` | No API key. 8 curated contracts mapped to driving holdings |
| `/api/nexus-earnings` | Flagship | `vw_nexus_holdings`, Finnhub per-symbol calendar + surprise history, `/api/equity` daily | `HORIZON_DAYS 75`, `MAX_RICH 24` fan-out cap |
| `/api/nexus-opportunities` | Opportunities | 8 sources (§8) | `MAX_LEDGER 24` |
| `/api/nexus-theme` | Theme | `vw_nexus_holdings` (symbol, theme, weight_pct) + `price_history` in one query + TLT/UUP/USO | `BETA_DAYS 60`, `MOMENTUM_N 5` |
| `/api/macro` | Regime, Theme, windshield | FRED regime, yields, credit, vol | Shared, not Nexus-specific |
| `/api/trading` | Snapshot, blotter, quick ticket | Alpaca account / quotes / **orders** | `?action=account` and `?action=order` |
| `/api/equity` | Legacy fundamentals sync | Finnhub / Yahoo / Alpaca | Writes `equity_cache` as a side effect |

**COT contract map** (`api/nexus-cot.js`): Gold 088691 → GDX/RGLD · Silver 084691 → SBSW/RGLD · Copper 085692 → GEV/NVT · WTI 067651 → CVX/HAL/BKR/PBR · Nat Gas 023651 → KMI/BKR · S&P E-mini 13874A → Book β · UST 10Y 043602 → SHY/BSV/BOND · USD Index 098662 → BABA/TM/TSM.

### 9.2 Views and tables

Read directly from the client (`sb.from(...)`):

| Object | Read by | Purpose |
|---|---|---|
| `vw_nexus_holdings` | `nexusLive`, legacy page, 3 endpoints | **The book.** The single most important object on the page |
| `valuation_health` | `nexusLive` | Valuation composites (`ticker, avg_fair_value`) |
| `mv_position_returns` | `nexusLive` | The nightly cash-flow return engine — MWR + engine status/reason. Read from the **materialized** snapshot; `vw_position_returns` recomputes at ~940ms and has no business in a page load |
| `nexus_options` | `nexusLive` | Per-name options snapshot |
| `scrapbook_companies` | `nexusLive`, bench | Saved thesis summary + conviction rating |
| `vw_nexus_price_freshness` | `nexusDataIntegrity`, bench | `symbol, last_price_date, days_old` |
| `vw_sync_status` | `nexusDataIntegrity` | Positioning age |
| `price_history`, `assets` | Theme/bench series | Daily closes, keyed on `asset_id` |
| `positions` | Realized layer | |
| `sector_pnl_residuals` | Beat 05 | Trailing residual σ (needs ≥20 rows/sector) |
| `attribution_history` | Beat 07 | Trailing Brinson effects |
| `vol_dispersion_daily` | Dispersion | **Known dead — 0 rows ever** (premium Alpha Vantage key required) |
| `decisions` | Ledger | |

Read server-side by `/api/nexus-bench`: `vw_nexus_holdings`, `opportunity_assessments`, `bench_claims`, `vw_funding_sleeve`, `vw_bench_contribution`, `vw_bench_docket`, `vw_sleeve_headroom`, `vw_holding_vol_latest`, `scrapbook_companies`, `scrapbook_narratives`, `vw_nexus_price_freshness`, `price_history` (+`assets`), `cortex_signals`, `nexus_holdings`.

### 9.3 Column reference (live, as at 2026-08-30)

**`vw_nexus_holdings`** — `symbol, asset_name, sector, market_value, weight_pct, daily_return_pct, five_day_return_pct, total_return_pct, unrealised_return_pct, pnl_contribution, dcf_upside_pct, intrinsic_value, fwd_pe, peg_ratio, market_fwd_pe, fwd_pe_premium_pct, macro_regime_fit, rate_sensitivity, fx_exposure, beta, annual_vol, max_drawdown_pct, var_contribution_pct, valuation_signal, macro_signal, technical_signal, quant_signal, quality_grade, conviction_score, recommended_action, next_earnings_date, alert_flag, nexus_insight, current_price, valuation_source, theme`

**`nexus_holdings`** (materialized, refreshed every 10 min) — `tk, theme, conviction, pcm_rated, weight_pct, today_pct, contrib_pct, component_var, fv_gap_pct, signal, signal_tone, stale, fv_trustworthy, fv_untrust_reason, price_days_old`

**`nexus_options`** — `tk, atm_iv, skew_25d, pc_oi, pc_vol, front_iv, back_iv, oi_peak_strike, next_expiry, drop_reason, iv_rank, skew_rank, rank_ready, snapshot_date, stale`

**`vw_funding_sleeve`** — `tk, theme, conviction, weight_pct, fv_gap_pct, contrib_pct, fv_trustworthy, funding_score, disqualification_reason, qualified, sleeve_rank`

**`vw_bench_docket`** — `symbol, asset_name, sector, actual_weight_pct, conviction_score, target_weight_pct, weight_gap_pp, r_var, component_var_pct, unrealised_return_pct, drawdown_pct, damage_pp, first_buy_date, days_held, quality_grade, quant_signal, technical_signal, valuation_signal, macro_regime_fit`

**`vw_bench_contribution`** — `symbol, contrib_today, contrib_ytd, contrib_since_entry, series_start, series_end, observations, covered, coverage_reason, actual_weight_pct, nav_coverage_pct`

**`vw_sleeve_headroom`** — `sleeve, weight_pct, cap_pct, headroom_pp, headroom_usd, positions, nav_usd`

**`opportunity_assessments`** — `id, symbol, as_of_date, context_hash, survives, portfolio_verdict, dim_holdings, dim_regime, dim_liquidity, dim_oppcost, swap_source, model_used, prompt_version, created_at, verdict, thesis_integrity, synthesis, verdict_condition, overridden_by_user, user_verdict, net, alignment, dispersion, dominant_family, family_vector, size_multiplier, posture, intended_side`

**`bench_claims`** — `id, symbol, thesis_ref, claim_text, status, evidence_text, evidence_value, evidence_source, status_changed_at, created_at, falsifier_text, review_by, origin_decision_id`

**`vw_nexus_price_freshness`** — `symbol, last_price_date, days_old`

### 9.4 Data-layer traps that bit this page (from `CLAUDE.md`, all fixed but easy to reintroduce)
- **Never page a shared table without a filter.** `api/nexus-bench.js` once fetched 95 days of `price_history` with no symbol filter and stopped after 6 pages of 1000 — it read the oldest 6.7% of a 1,500-name universe and printed "No price series in window" for a name with 281 fresh bars.
- **Order DESC when paging a time series.** If a bounded fetch truncates it should lose the *oldest* rows: a short tape is usable, a stale one is a lie.
- **PostgREST caps at 1,000 rows whatever `limit` says.** `api/nexus-theme.js` asked for 20,000 ascending and silently computed six weeks late. `limit` is a request, not a guarantee.
- **Sector ≠ theme.** `api/nexus-theme.js` grouped by `sector` while the panel joined on `theme`. The two taxonomies *overlap* on exactly `Financials` and `Energy`, so two themes resolved with the wrong number and twelve read "momentum pending sync" — a partial match looks like a data gap, not a join bug. When fixing one, grep for the other: `grep -rn "\.sector\b" api/ src/ | grep -i theme`.
- **Stale bars must not publish a move.** `today_pct` / `contrib_pct` are NULL past 7 days, with `price_days_old` published so a consumer can say why.
- **Views over `price_history` must filter to the assets they return.** `nexus_holdings` and `vw_nexus_holdings` sat *on* anon's 3s cap; the UI never says "timed out" — it says "Feeds degraded", "the bench cannot sit", "No sector P&L for this period yet". **Those messages describe missing data; the data was there and the query was being cancelled.**

---

## 10. Options positioning

`nexusOptionsCompute.js` implements **one canonical read with two consumers**. Flagship asks "is the market flagging downside on a name I hold?"; Opportunities asks "is this candidate a clean entry or a crowded one?". Both call the same `optionsRead` — same signal, two questions, with the surrounding copy telling you which you are in.

- `chainMetrics(front, back, spot)` — raw Alpaca chain(s) → snapshot metrics. **Fails loud**: nulls plus a `dropReason`. ATM strike = nearest listed strike to spot, else the call with |delta| closest to 0.50 (delta needs no spot). IV is averaged across the call and put leg when both are listed. Junk IV is rejected: non-finite, ≤0, or >5 (500%, a bad quote).
- `optionsRead(row)` → `{ tone, because }` over the cascade **stressed | hedged | neutral | complacent**. Rank-based once `rank_ready`; level + skew sign while history builds. **Structural — a one-day IV tick must not flip the tone.**
- `toOptionsModel(row)` → the `holdings[].options` block.
- `entryTiming(tone)` → the Opportunities entry chip (clean | crowded | stressed). It **annotates; it never reorders** the ledger.

In the holdings table the Options cell renders `—` for names with no chain (ADRs, OTC, thin) with the reason in the title, and a `·` marker while percentile ranks are still building (~30 sessions). **It is an adjacent signal and does not feed the read verdict.**

---

## 11. Cross-page wiring

| Event | Fired by | Handled by |
|---|---|---|
| `nexus:filter-theme` | Theme tab card / transmission row click | `NexusFlagshipPage` — sets `holdingsTheme`, switches to Flagship, smooth-scrolls to top |
| `nexus:open-object` | Ticker click in the holdings table | *Nothing yet* — affordance kept for the live-object drill |
| `atlas:navigate` | Bench / realized name click | The app router (`{tab, symbol}`) |
| `atlas:trade-ticket`, `atlas:pass-decision` | Legacy page | Legacy page modals (gated by the freshness/circuit-breaker state) |
| `atlas:refresh` | Shell | Legacy page holdings reload |

Shared controls (deliberate, and the rule is symmetric): **share a control when the two surfaces answer the same question, namespace it when they do not.**
- `atlas.return.basis.v1` — SINCE ENTRY / MWR. **Shared** with Performance.
- `atlas_brinson_bench` — Brinson benchmark. **Shared** with Performance.
- `atlas.nexus.holdings.columns.v1` — column visibility. **Nexus-only.**

---

## 12. Legacy Nexus (`nexus-legacy`) — for reference

Single fetch of `vw_nexus_holdings`; every panel derives its view from the same array. Structure: `FundamentalsBanner` → `StaleBanner` → `NexusHeader` (with `SystemHealthBar` / `HealthPill`) → three columns — **ConvictionPanel** (Zone A) · **IntelCanvas** (Zone B) · **ActionCentre** (Zone C) → `NexusHoldings` table → trade-ticket and pass modals.

Two things worth knowing:
- It carries a **`useFundamentalsSync`** engine that walks every symbol through `/api/equity?endpoint=overview` at a 1.2s throttle to populate `equity_cache` (Beta, P/E, PEG, analyst target, earnings), with a progress banner. It triggers when fewer than 30% of holdings carry a `fwd_pe`. The flagship has no equivalent.
- Its `IntelCanvas` **macro regime map is hardcoded** (US/Europe/China/SA with literal CPI and yield figures). That is baseline literal, not live data — do not read numbers off it.

It also uses `useFreshnessGate` and `useCircuitBreaker` (`src/lib/`) to disable execution when data is critically stale, showing last-known cached holdings with a timestamped banner. The flagship's blotter does not currently share that gate — see §13.

---

## 13. Known gaps and the enhancement backlog

**Baseline sections still not live in the model** (they render from `nexusMock.js`): `gauges.risk`, `gauges.performance`, and the `SeasonalPanel` fallback. `windshield`, `chef`, `read`, `spine`, `concentration`, `holdings`, `portfolio` **are** live.

**Data feeds known dead or thin:**
- `vol_dispersion_daily` — **0 rows ever**. Needs a *premium* Alpha Vantage key (~100 `HISTORICAL_OPTIONS` pulls/run); the current key returns "This is a premium endpoint". The Dispersion panel has never had data. Not fixable in code.
- `theme_leadership_weekly` — 0 rows ever.
- `signal_scores` — frozen at 2026-08-11. This starves the quick ticket's coherence pane ("NO FAMILY VECTOR ON FILE").
- `bench_claims` — may not be provisioned; the trial panel says so rather than proceeding on evidence it does not have.
- `sector_pnl_residuals` / `attribution_history` — accruing; beats 05 and 07 show `—` with a stated reason until they have enough rows.
- `vw_bench_contribution` — cumulative view pending; the waterfall falls back to today-only, **labelled**.
- Correlation coverage is thin, so most Opportunities candidates default *additive* until `insight_*` fills.
- `universe_correlations` holds ~420 of ~1,500 symbols and coverage of the open book churns (71→70→67 over three days). A held name dropping out reads as "no close peer" when it means "not measured" — `absent_from_matrix` is published to keep them apart. **Watched, not fixed.**

**Known correctness issue, not yet fixed:** `vw_nexus_holdings` publishes **two unlabelled returns that disagree in sign**. `total_return_pct` is return since first fill; `unrealised_return_pct` is the mark against average cost on what is still held (MU: +8.28% vs −16.43%; SNDK: +12.91% vs −18.11%). The holdings table uses the first; winners/losers/at-risk (`nexusLiveCompute.js` ~265) and the Portfolio panel's total-return line (~312) use the second. **A name can be counted a loser in the summary and show green in the table.** Decide which read each surface wants before touching it.

**Deferred by design:**
- **Opportunities phase 1.5** — the `opportunity_assessments` LLM re-cast job (cron + Claude wrapper, `context_hash` gated, top-of-ledger only). Cards currently show the scrapbook thesis + computed fit.
- **Opportunities phase 2** — screeners (`saved_queries.sql_text`, security-sensitive) and movers as candidate sources.
- **Opportunities phase 3** — write a chosen swap straight to the staged blotter / `decisions` ledger.
- **`nexus:open-object`** has no receiver — the cross-module live-object drill.
- **MTD / QTD periods** in beats 05 and 07 are disabled with stated reasons pending position-level snapshot history.
- **RoomAssessor v1.1 / v2** — theme concentration, then Cortex marginal risk. Same-signature drop-ins; the cascade is untouched.

**Security / posture:**
- Order submission is **paper** (`ALPACA_PAPER` default true). Live trading is a deliberate, unflipped switch.
- **RLS is disabled on `cortex_signals` / `materialized_insights` / `insight_*`**, which Opportunities reads. A parked security pass — wants its own reviewed migration before production. `opportunity_assessments` ships RLS-on.
- The `api/nexus-*.js` files carry a **hardcoded fallback Supabase URL and anon key** as constants. It is the anon key, so it is not a secret leak, but it means a misconfigured environment silently talks to the fallback project rather than failing.
- The flagship blotter does **not** share the legacy page's `useFreshnessGate` / `useCircuitBreaker` execution lock. The quick ticket has its own claim/posture gates; the batch blotter does not check price age. Worth closing.

---

## 14. Working on this page

```bash
node --test src/pages/nexus/*.test.mjs   # 17 suites, no React, no network
npx vite build                            # must be green
npm run lint:sql-casts                    # catches unsargable (col)::date filters
```

**Extending, in order:**
1. Write `nexus{X}Compute.js` + `.test.mjs` **first** — pure, IO-free.
2. Then `Nexus{X}.js` with `createElement` (no JSX in these files).
3. Wire one routing branch in `NexusFlagship.js` (`activeTab === '{id}'`) and add the tab to `TABS`.
4. Heavy data → a self-fetched `api/nexus-{x}.js` endpoint; light data → read `model`.
5. Verify the maths against live data with a throwaway node script hitting the anon REST plus the compute functions — the pattern used for every tab.

Every tab touches `NexusFlagship.js` routing, so **stack branches or merge sequentially** to avoid conflicts.

**Two rules worth repeating because they are the ones that get broken:** all maths goes in a tested pure module, and anything the page cannot compute says *why* it cannot rather than showing a plausible number.
