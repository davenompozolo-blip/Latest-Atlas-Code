# Nexus — Architecture & Builder's Report

*Handoff for the lead instance. Covers the whole Nexus build as it stands in `main`: what it is, how it's wired, what's live tab-by-tab, the data layer, the pivots and data-reality lessons, and what's deferred. Written so you can extend it without re-deriving the conventions.*

---

## 1. What the Nexus is

`src/pages/nexus/` — the portfolio's **positioning read through today's lens**, a five-tab funnel from macro → book → action. Each tab answers a different question:

| Tab | Question | Status |
|-----|----------|--------|
| **Flagship** | What's the state of the book, per name? | ✅ rich |
| **Theme** | Which themes to rotate between? (rotation) | ✅ funnel |
| **Regime** | Is the book positioned for the macro regime? (alignment) | ✅ funnel |
| **Opportunities** | Best use of the marginal dollar, given what I own? | ✅ Phase 1 |
| **Drift** | How far has the book wandered from balance? (rebalance) | ◻︎ **shell — the last one** |

---

## 2. Architecture & conventions (read before extending)

**The spine philosophy.** One typed contract (`nexusModel.js` → `NexusModel`). Every Flagship component reads from a **resolved model**, never a hardcoded literal. Two providers resolve to that shape: `nexusMock.js` (structural baseline) and `nexusLive.js` (real, Supabase/endpoint-backed). The live provider **overrides the model section-by-section** as feeds light up; whatever isn't live falls back to baseline. (That's why panels were "stale" early — they were still baseline.)

**Three-layer pattern, used by every tab:**
- **Pure compute** — `nexus*Compute.js`. Side-effect-free, IO-free, **unit-tested under plain `node --test`** (no React/Supabase). This is where all the maths lives.
- **Render** — `Nexus*.js`. `React.createElement` (no JSX — the codebase has no JSX transform for these). SVG charts built the same way (watch the paren-balancing on big `e(...)` trees — it bit every map).
- **Endpoint** — `api/nexus-*.js`. Server-side aggregation, anon Supabase key, edge-cached. The heavier tabs **self-fetch their own endpoint** rather than going through the model (earnings, COT, theme-series, opportunities) — keeps big fan-outs server-side and cached.

**Honesty rules baked in:** never fabricate a number to fill an axis. Missing valuation → dashed/grey "pending". Missing beta/momentum → `null`, not 0. Untrusted (bare-DCF / extreme) valuations are dampened and flagged, not trusted. These show up as `valuationTrusted`, `valuationPending`, the `~` est flag, etc.

**File map (`src/pages/nexus/`):** `nexusModel` (contract) · `nexusMock`/`nexusLive`/`nexusLiveCompute` (provider + book maths) · `readEngine` (per-name read cascade) · `NexusFlagship` (page shell + tab routing + Flagship panel + holdings table + blotter) · `NexusBoard` · per-tab `Nexus{Earnings,Cot,Theme,Regime,Opportunities,Portfolio}.js` + matching `*Compute.js` + `*.test.mjs`.

---

## 3. What's live, tab by tab

### Flagship ✅ (the strong one — the bar)
Layers into a narrative: **portfolio snapshot** (account equity/exposure/cash/P&L self-fetched from `/api/trading`; positions/win-rate/at-risk/best-worst/quality aggregated from the book) → **windshield** (live FRED macro tiles) → **gauges** (Risk/Perf baseline; **Concentration live** — effective-N, top-factor, fragility) → **board** (Fear&Greed, indices) → **positioning spine** (theme share/move/risk-shift) → **holdings table**: derived reads via `readEngine`, **conviction-target trade quantum** (shares+$, ADD buys the shortfall / TRIM sells the excess), an **order blotter** (arm→confirm, posts through the existing `/api/trading` — *paper by default*, records conviction+signal to the `decisions` ledger), and **asset names** under the ticker → **earnings deck** (every holding, options-implied move) → **COT panel** → **the Read**. The **chefbar** is now dynamic (`buildChef` picks the genuinely hottest tab).

### Theme ✅ — rotation funnel
driver → **rotation map** (positioning × 5-day momentum, sized by VaR, coloured by valuation, dashed-grey where composite-pending) → **transmission** (per-theme rate/USD/oil betas) → **dispersion** (winners/losers inside a calm average) → **rotation read** (out/in) → demoted detail grid. Drill-down: click a theme → Flagship filters to it. Series inputs from `/api/nexus-theme` (book closes from `price_history` in one query + TLT/UUP/USO factor proxies). **Betas are vol-normalised** to a 1% factor move so rate/USD/oil are comparable.

### Regime ✅ — alignment funnel
verdict + **growth × inflation 2×2** (regime plotted) → **macro dashboard** (rates/inflation/growth/stress, levels+deltas) → **book fit** (sector tilt vs the regime playbook, additive/headwind) → regime read. Self-fetches `/api/macro`; book fit reads `model.spine`. No new endpoint.

### Opportunities ✅ — marginal-dollar ledger (Phase 1)
The richest tab. frame → **opportunity map** (conviction × fv-gap, fit-coloured, composite-solid/model-dashed ring, swap arrows) → **the one ranked ledger** (provenance tags, fit, fund-from — *the cheapest name is not the top opportunity*) → **thesis-in-context** cards → **sector strip**. `/api/nexus-opportunities` assembles candidates from 8 sources (holdings, `scrapbook_companies/narratives/sector_notes`, `cortex_signals/watchlist`, `insight_correlation_cluster`, `insight_counter_specific_var_vs_sector`) and runs the scoring engine: `isolatedMerit` (winsorised, trust-gated) → `portfolioFit` (additive/redundant/neutral from correlation-to-book + excess VaR) → `fundability` (richest low-conviction held name) → `rankLedger`.

---

## 4. Data layer

**Nexus endpoints:** `/api/nexus-{earnings,cot,theme,opportunities}` (self-fetched). Plus reuse of `/api/equity` (Finnhub/Yahoo/Alpaca fundamentals+daily), `/api/macro` (FRED regime+yields+credit+vol), `/api/trading` (Alpaca account/quotes/**orders**).

**Key views/tables:** `vw_nexus_holdings` (the book — sector, weight, conviction, valuation gap, returns, drawdown, quality, **next_earnings_date**) · `price_history` (daily closes, keyed on `asset_id`) · `valuation_health` (composites) · `scrapbook_*` (analyst fair value + LLM theses, sector notes) · `cortex_*` (quant signals + watchlist) · `insight_*` (correlation clusters, marginal VaR).

**Pipelines fixed this arc:**
- **`next_earnings_date`** — was null book-wide: `vw_earnings_calendar` read the field at the wrong JSON depth, and `/api/equity` never emitted it. Fixed both (migration re-points the view; `/api/equity` emits it on both Finnhub + Yahoo overview paths). Bridged with a one-time cache backfill; durable on the next fundamentals sync.
- **External providers are messy** — Finnhub's *bulk* earnings calendar knew ~5 names while *per-symbol* knew ~40; valuation/`investment_verdict`/`sector_verdict` are long LLM **prose**, not enums; `scrapbook` carries foreign-listing dups (2330.TW) with junk prices and +150% DCF artifacts. All handled in the endpoints (per-symbol calendar, keyword stance extraction, digit-ticker exclusion, extreme-gap untrusting, sector normalisation).

**Migrations added:** `vw_earnings_calendar` overview-path fix; `opportunity_assessments` (RLS-on, read policy — staged for the LLM layer).

---

## 5. Deferred work & known limits

**Drift tab** — the only remaining shell. Natural design: the rebalance/balance lens — concentration creep (effective-N, top-factor, fragility cluster — already computed in `gauges.concentration`), theme/sector drift vs conviction-target weights (the sizing engine already computes targets), the names pulling the book off-balance, ending in a "what to rebalance" read. Mostly reuses data already in the model.

**Opportunities phases (per the lead's spec):**
- **1.5** — the `opportunity_assessments` **LLM re-cast job** (Vercel Cron + Claude-wrapper, `context_hash` gated, top-of-ledger only). Cards currently show the scrapbook thesis + computed fit.
- **2** — screeners (`saved_queries.sql_text` — security-sensitive) + movers as candidate sources.
- **3** — write a chosen swap straight to the staged blotter / `decisions` ledger.
- **Phase-1 limits:** correlation coverage is thin (19 pairs) so most names default *additive* until `insight_*` fills (graduates like Theme's valuation axis); the map plots conviction-rated (held) names; sector normalisation is best-effort keyword mapping.

**Cross-cutting:**
- Order submission is **paper** (`ALPACA_PAPER` default true). Live trading is a deliberate, unflipped switch.
- **RLS is disabled on `cortex_signals` / `materialized_insights` / `insight_*`** — a parked security pass the Opportunities tab now reads from. Wants its own reviewed migration before production. (The new `opportunity_assessments` ships RLS-on.)
- Valuation coverage gates Opportunities' fv axis + Theme's bubble colour; both graduate with the weekly valuation sync.

---

## 6. How to extend (cheat-sheet)

1. New tab → pure `nexus{X}Compute.js` + `.test.mjs` first, then `Nexus{X}.js` (createElement), then wire one routing branch in `NexusFlagship.js` (`activeTab === '{id}'`). Heavy data → an `api/nexus-{x}.js` self-fetched endpoint; light data → read `model`.
2. Every PR: `node --test src/pages/nexus/*.test.mjs` + `npx vite build` must be green. Verify the maths against live data (a throwaway node script hitting the anon REST + the compute fns — pattern used for every tab).
3. Tabs all touch `NexusFlagship.js` routing → **stack branches** or merge sequentially to avoid conflicts.

*Everything above is in `main` as of this report. The build conventions are cheap to extend — the hard part is design intent, not plumbing.*
