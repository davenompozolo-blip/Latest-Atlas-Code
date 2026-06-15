# Nexus — Builder's Report & Theme Handoff

*A working handoff from the build session to the lead instance. Goal: shared context on where the Nexus build stands, the pivots and additions we made and why, and a focused problem statement so we can design the **Theme** tab intentionally rather than shipping another flat table.*

---

## 1. What the Nexus is

The Nexus page (`src/pages/nexus/`) is the portfolio's **positioning read through today's lens** — a funnel from macro → book → action. It has five tabs:

| Tab | Status | One-liner |
|-----|--------|-----------|
| **Flagship** | ✅ strong | Macro windshield → gauges → spine → holdings (with derived reads) → earnings/COT context → the Read. The funnel. |
| **Theme** | ⚠️ v1, simplistic | Per-theme rollup. Built but flat — the subject of this report. |
| **Regime** | ◻︎ shell | Templated prose over a deferred "spine shell". |
| **Opportunities** | ◻︎ shell | Same. |
| **Drift** | ◻︎ shell | Same. |

### The "spine" philosophy (read before touching anything)
- One typed contract: `nexusModel.js` (`NexusModel`). Every component reads only from a **resolved model** — never a hardcoded literal.
- Two providers resolve to that exact shape: `nexusMock.js` (structural baseline) and `nexusLive.js` (real, Supabase/endpoint-backed). The live provider **overrides the model section-by-section** as feeds light up; whatever isn't live yet falls back to baseline. That's why some panels were "stale" — they were still baseline.
- **All maths is pure + unit-tested** in `nexus*Compute.js` (run under plain `node --test`, no React/Supabase). **Render components** are `Nexus*.js` using `React.createElement` (no JSX). **Endpoints** are `api/nexus-*.js`.

---

## 2. What we built this arc

### Flagship enrichments
- **Holdings table → actionable.** Added a **Trade quantum** column (conviction-target sizing: target weight ∝ conviction, normalised to invested weight; quantum closes the gap in shares + $, in the read's direction — ADD buys the shortfall, TRIM sells the excess, EXIT closes the line; HOLD/WATCH and at-target → `—`). Clicking stages a ticket to an **order blotter** (arm→confirm, paper by default via `/api/trading`, records conviction + signal snapshot to the Ledger). Pure math in `nexusLiveCompute.js` (`bookNav`, `targetWeights`, `sizeTrade`), tested in `nexusSizing.test.mjs`.
- **Earnings deck → full book.** Was capped at the ~5 names Finnhub's *bulk* calendar returns. Now one row per holding, search + theme + reporting-window filters, scrollable, reporters floated to top. `api/nexus-earnings.js` + `nexusEarningsCompute.js` + `NexusEarnings.js`.
- **COT futures-positioning panel.** New "Futures positioning" section: CFTC Commitments of Traders (public Socrata, no key) for the book's macro drivers (gold, silver, copper, WTI, nat gas, S&P 500, UST 10Y, USD index) mapped to the holdings they inform — large-spec net % of OI, WoW shift, 1-year percentile, and a contrarian crowding read. `api/nexus-cot.js` + `nexusCotCompute.js` + `NexusCot.js`.
- **Chefbar → dynamic.** Was the static baseline literal ("rates repriced the AI-capex cluster…"). Now `buildChef()` picks the genuinely hottest tab (theme dispersion / fragile concentration / cheap crop / balanced) with a factual reason. `nexusChef.test.mjs`.

### Data / pipeline
- **`next_earnings_date` was null book-wide.** Two bugs: (a) `vw_earnings_calendar` read the date at the **top level** of the `equity_cache` payload but `/api/equity` nests it under `overview`; (b) `/api/equity` never emitted a next-earnings date at all. Fixed both (migration re-points the view; `/api/equity` now emits `NextEarningsDate`/`ExDividendDate`/52wk on **both** the Finnhub-primary and Yahoo-fallback overview paths). Book went 0 → 38 dates.
- **Options-implied move (#3).** Replaced the hist/vol proxy with the ATM straddle at the first expiry on/after the print (Alpaca options via `/api/trading`), bounded to reporters, best-effort fallback. Basis tagged `iv`/`hist`/`vol`.

### Theme tab v1 (this is the part we're not happy with)
- `nexusThemeCompute.js` + `NexusTheme.js`: a per-theme **card grid** (share, today's move, contribution, VaR share, avg conviction, valuation tilt, ADD/TRIM read mix, top names, risk-shift/fragility) + a leaders/laggards strip + the existing narrative intro.

---

## 3. Pivots we had to make (and why)

1. **Earnings coverage: bulk calendar is a trap.** Finnhub's bulk `/calendar/earnings` only confirmed ~5 of our names; **per-symbol** `/calendar/earnings?symbol=` knew ~40. So the durable source is per-symbol, written into the book by the sync — not the bulk call at render. (And it surfaced the JSON-path bug above.)
2. **Earnings deck reframed to "all holdings."** Original instinct was "names reporting next." User wanted the deck to be a **second lens on the full book** (mirror the holdings table, filterable), with earnings context where it exists and `—` otherwise. Better product call.
3. **Sizing/submission was a real-money fork.** We asked; user chose **conviction-target weight** + **staged blotter** (paper) over live-on-click. The blotter writes through the *existing* `/api/trading` order path, which already records a `decisions` ledger row — so "act on the signal" also captures *why*.
4. **COT via CFTC public Socrata**, not a paid feed — no key, weekly, reliable; codes verified live before building.
5. **Names with no feed (ADRs, some ETFs)** are parked per user — degrade to `—`, don't block.

---

## 4. Additions that deviated from the original brief

These weren't in the first brief; they emerged from "I need to *act* on the page" and "make it institutional":
- **Trade quantum + order blotter** (the page became actionable, not just analytical).
- **COT positioning panel** (a whole new data domain — market positioning alongside *our* positioning).
- **Options-implied move** (real IV replacing a proxy).

All of these stayed inside the spine discipline (pure compute + tested, model-driven render), so they extend cleanly.

---

## 5. Architecture cheat-sheet (for extending Theme)

**Data already in the resolved model (`getNexusModel()` in `nexusLive.js`):**
- `holdings[]` — per name: `tk, theme, conviction, todayPct, contribPct, componentVar, fvGapPct, signal, signalTone, read, because, stale` (+ from the sizing pass: `price, currentWeightPct, targetWeightPct, driftPct, tradeSide/Shares/Usd`).
- `spine[]` — per theme: `theme, sharePct, movePct, riskShift, fragility, stale`.
- `gauges.concentration` — `effectiveN, nominalN, topFactorPct, fragilityCluster`.
- `windshield` / `seasonal` — live macro tiles + templated theme/regime/opp/drift prose.
- `nav` — book NAV.

**Adjacent live sources we can pull for Theme:**
- `/api/macro` — FRED yields, regime label, VIX, market quotes.
- `/api/nexus-cot` — futures positioning by market (already maps to themes: energy, gold, copper, rates, USD).
- `vw_nexus_holdings` — the book (sector, weight, price, valuation, signals, conviction, `next_earnings_date`).
- `/api/equity?endpoint=daily` — per-name daily closes (theme time-series can be aggregated from these).

**Sources we'd need to add for a richer Theme:** theme-level **return history** (for rotation over time / momentum) isn't pre-aggregated anywhere — it would come from rolling up per-name daily series, or a new view. Flag this early; it's the main data gap.

---

## 6. The Theme problem — let's spec it properly

### Why v1 falls short
Flagship is strong because it **layers into a narrative**: macro → gauges → spine → holdings-with-reads → earnings/COT → the Read. Theme v1 is **one flat grid of aggregates** — accurate, but it neither tells a story nor uses the page's analytical depth. It reads like a summary table sitting under a great tab. That's the gap to close.

### What "Theme" should *be*
The tab's own thesis is **transmission**: *how today's macro is propagating through the book's themes, and what to do about it.* A strong version answers, per theme:
- **Where is the money / risk?** (share, VaR share, contribution today — v1 has this)
- **What's driving it today?** (top contributors, not just top by conviction)
- **Is the theme stretched or washed out?** (valuation vs its **own history**; crowding via COT on its drivers)
- **What's the macro sensitivity?** (rate / USD / oil beta — *why* this theme moved)
- **What's coming?** (forward catalysts — earnings within the theme, tie to the deck)
- **What's the action?** (rotation: which themes to add/trim — the read-mix, made decision-grade)

### Candidate building blocks (to choose from in the spec — not all)
- **Rotation map** — a 2-D quadrant (e.g. momentum vs valuation, or 5d-momentum vs conviction) plotting themes; the single most "story-telling" object.
- **Macro-sensitivity strip** — per-theme betas to rates/USD/oil, sourced from the macro + daily series; ties the windshield to the themes.
- **Intra-theme dispersion** — winners vs losers inside a theme (a theme can be +0.4% with a −5% name hiding in it; v1 hides that).
- **Theme valuation vs history** — is Energy cheap *for Energy*?
- **Crowding overlay** — fold `/api/nexus-cot` into the theme (Gold COT → the miners).
- **Forward catalysts** — earnings within the theme in the next N days (reuse the deck data).
- **Drill-down** — click a theme → filter the Flagship holdings table to it (interaction, not just display).
- **Time dimension** — theme momentum over 5d/20d (needs the return-history source above).

### Open questions for the spec (please weigh in)
1. **Primary job?** Rotation decisions (add/trim themes) vs risk attribution vs narrative briefing — this drives the layout.
2. **One rich view, or sub-sections** within Theme?
3. **Visual ambition** — are we adding charts (quadrant / treemap / sparklines), or staying typographic like Flagship? (Flagship is deliberately chart-light and text/number-dense; Theme could earn one signature visual.)
4. **History** — acceptable to build a theme-return-history source (rollup view or cached aggregation), or keep it point-in-time for v2?
5. **Interactivity** — is theme→holdings drill-down in scope?

### Recommendation
Anchor Theme on **one signature object** (the rotation map) + **the transmission story** (macro→theme betas + crowding) + **decision-grade rotation reads**, with drill-down to names. Keep the v1 card grid as the *detail* layer beneath the signature object, not the whole tab. That gives Theme the same "layers into a narrative" quality that makes Flagship land — without turning it into a dashboard of charts for their own sake.

---

*Everything above is live on PRs #641 (options + COT), #642 (Theme v1 + dynamic chefbar). The build conventions (pure compute + tests, model-driven render) are cheap to extend — the hard part here is the **design intent**, not the plumbing.*
