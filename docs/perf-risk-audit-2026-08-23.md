# Performance & Risk — pre-build audit

**Date** 2026-08-23
**Against** *Decision memo — Performance & Risk* (2026-08-23) and *Every position fights for its place*
**Scope** Inventory only. No feature code written.
**Method** Source read of all six module files (5,527 lines), plus live measurement against production. Every number below was measured at audit time, not carried from the memo.

---

## Contradictions with the memo — read this first

The memo asked for these specifically. Five of the nine change the build.

### C1 — `fwd_pe` touches neither module. The constraint is real; the location is wrong.

Memo §1.8 and the audit prompt both treat `fwd_pe` as something that must "leave every ranked column" in Performance and Risk. **It appears in neither module.** Grep across `perf-engine.js`, `perf-panels-{top,bottom,analytics}.js`, `performance-suite.js` and `risk-v2.js` returns nothing.

`fwd_pe` lives in `vw_nexus_holdings`, consumed by the **Nexus flagship** holdings table and column chooser. The audit action belongs there, not here. Nothing in this build is blocked by the `fwd_pe` audit.

### C2 — There are three unpriced ADRs in the book, not four. PROSY is gone.

Memo §1.9 names KMTUY, VWAGY, NPSNY, PROSY. **PROSY appears in neither `vw_performance_suite` (63 rows) nor `vw_nexus_holdings`** — it has left the book. The `not_measurable` card must handle three live cases. PROSY remains relevant only once closed positions are in scope (§1.5), where it becomes a *closed* unmeasurable — a case the memo's `verdict_status` enum does not currently distinguish.

### C3 — The ADRs are not rendered blank, zero, or as a state. They render as confident, wrong numbers.

This is the most consequential finding in the audit.

| Symbol | Last bar | Days stale | Shows total return | Shows CAGR | `cut_candidate_flag` |
| --- | --- | --- | --- | --- | --- |
| KMTUY | 2026-03-13 | **163** | **+35.96%** | **+62.82%** | false |
| NPSNY | 2026-03-27 | **149** | **−26.66%** | **−39.80%** | **true** |
| VWAGY | 2026-03-27 | **149** | **−17.58%** | **−26.23%** | **true** |

`vw_performance_suite` takes the latest available close with no staleness gate, so a March print is treated as today's price. Every downstream number inherits it: return, CAGR, sort position, the Best/Worst Performer tiles, and the cut list.

**Two of the thirteen `cut_candidate_flag` positions are flagged on prices that are five months old.** The flag's definition — held >180 days and underwater — is satisfied by a stale price just as readily as a live one.

The 7-day null gate and `price_days_old` already exist, on `nexus_holdings`. They were built for the Nexus feeds in August and **were never applied to `vw_performance_suite`**. The memo frames §1.9 as a rendering decision for the new build; the audit finds it is a live data-correctness defect in the surface being evolved. It should be fixed in the existing view during step 2, not deferred to the verdict table.

### C4 — Risk already clusters by correlation, client-side, at a different threshold.

`risk-v2.js` "Module 2 · Correlation Intelligence" computes a full pairwise matrix in the browser via `pearsonCorr` over `vw_position_nav_daily` series, then greedily groups at **ρ > 0.75** (line 972). It publishes Avg Pairwise Correlation, a Diversification Score, Redundant Pairs (>0.80), and an Auto-Detected Cluster labelled *"effectively one factor bet"*.

The memo assumes clusters come from `universe_clusters`, built server-side at **distance cut 0.35 (ρ ≳ 0.65)**.

Ship the memo's spine without addressing this and Atlas carries **two different definitions of "cluster" in one product** — different thresholds, different substrates (63 held names vs 426 universe names), different refresh cadences. They will disagree, visibly, on the same screen pair. This is the same class of defect as sector-vs-theme: a partial match that reads as a data gap rather than a definitional split.

The memo's §1.6 headline — effective number of bets — already has a working precursor here. That is good news for the build and bad news for leaving it alone.

### C5 — Brinson attribution already exists and is already peer-relative. The memo does not mention it.

`src/lib/attributionEngine.js` implements Brinson-Fachler with swappable benchmarks (Equal Weight / S&P 500 / NASDAQ-100 GICS weights) and decomposes into **allocation / selection / interaction** effects, rendered in `PositionsPanel`'s "BRINSON ANALYSIS" view.

The **selection effect** is, definitionally, *did picking this name inside its group beat picking the group blind* — which is the memo's §1.3 headline measure (`excess_vs_median`), computed at sector level against a static benchmark instead of at cluster level against matched cash flows.

This is the seed the audit prompt asked for. The head-to-head is an upgrade of an existing engine's basis (sector → cluster, static weights → matched cash flows), not a new concept dropped beside it. It also means the vocabulary already exists in the product and should be preserved rather than reinvented.

One coupling the memo cannot know: benchmark selection is **shared with Nexus beat 07** through `localStorage['atlas_brinson_bench']`. Changing the benchmark in Performance changes it in the Nexus decision scorecard. Any re-point must keep or deliberately break that link.

### C6 — Five surfaces rank on return, not one. Step 2 is bigger than it reads.

Memo §3 step 2 is "re-point existing surfaces to MWR — same components, correct numbers". Full list in the prose section below: **five distinct sort/rank sites across three files**, two of which sort on a *client-computed* `totalReturn` that never touches `vw_performance_suite`, and so will not be fixed by re-pointing the view.

### C7 — `vw_position_nav_daily` is over budget now, and it is the new engine's substrate.

Measured warm at audit time: **2,271 ms**, 10,207 rows, against `anon`'s 3s cap. It was 560 ms after the 2026-08-12 sweep. It is read by **both** modules and is the only per-position daily series in the product — precisely what §0's cash-flow reconstruction needs.

Memo §5 lists inherited constraints as historical lessons. This one is live and unfixed. It belongs in step 1, before the engine is built on top of it.

### C8 — Termination currently goes to Equity Research, not the Trade ticket.

Both position tables dispatch `atlas:navigate` with `{ tab: 'equity', symbol }`. The memo §1.7 specifies what the ticket should receive; the audit finds the wiring currently points somewhere else entirely. Good news: it is a one-line payload change per call site (two sites), not an integration.

### C9 — `annualised_return` is an implausible number already sitting in a ranked column.

AMD shows **+545.58% CAGR** — arithmetically correct (143% over ~174 days) but presentationally indefensible, and it is a sortable column today. This is the same failure mode §1.8 fears from `fwd_pe`: *a 353.9× in a ranked column discredits the entire module in one screenshot.* The memo protects against the valuation case and misses the return case, which is live.

Suggest: suppress or asterisk annualisation below a minimum holding period.

---

## Module 1 — Performance Suite

Entry: `src/pages/performance-suite.js`. Eight tabs. All data loaded once in the shell and passed down as props.

**Shell loads** (all `anon` via PostgREST): `vw_portfolio_nav_daily`, `vw_performance_suite`, `vw_command_centre`, `vw_portfolio_home`, `vw_transactions`, plus `assets` and a chunked `price_history` fetch for per-symbol history.

| Element | Question it answers | Reads from | Correct? | max_exec (anon) | Bucket |
| --- | --- | --- | --- | --- | --- |
| **Shell / KPI pulse bar** | What is the book worth and how is it doing? | `vw_portfolio_home`, `vw_command_centre` | Yes | home 2,871 ms · centre **2,924 ms** | **1 — Keeps unchanged** |
| **OVERVIEW panel** | How has NAV compounded? | `vw_portfolio_nav_daily` → `computePortfolioMetrics` | Yes | 2,980 ms hist · **6 ms now** | **1 — Keeps unchanged**. Aggregate zoom-out destination. |
| **RETURNS panel** | What did each period return? | `computePeriodReturns`, `computeMonthlyReturns` | Yes | derived, no DB | **1 — Keeps unchanged** |
| **RISK panel** (in Perf) | Drawdown, VaR, distribution | `vw_portfolio_nav_daily` | Yes | as above | **3 — Absorbed** into Risk module's Command Center. Duplicates it at lower fidelity. Demote to a link. |
| **POSITIONS → Attribution Overview** | Which positions drove P&L? | `vw_performance_suite` | **Partly** — stale ADRs unhandled | 2,755 ms hist · **24 ms now** | **2 — Re-pointed** to `position_verdicts.position_mwr_pct` |
| **POSITIONS → position table** | How is each position doing? | `vw_performance_suite` | **Partly** — see C3 | as above | **2 — Re-pointed**. This is the surface that becomes the counter front door. |
| **POSITIONS → Brinson Analysis** | Was it allocation or selection? | `computeBrinsonAttribution` + `BENCHMARKS` | Yes, for sector-vs-static-benchmark | derived | **2 — Re-pointed** to cluster basis + matched cash flows. **This is the head-to-head seed.** |
| **`cut_candidate_flag`** | Which positions to cut? | `vw_performance_suite` | **No** — 2 of 13 flagged on stale prices | — | **3 — Absorbed** into `verdict_label = cut_candidate`, gated on `verdict_status = measured` |
| **`entry_efficiency_score`** | Was the entry well-timed? | `vw_performance_suite` (30d post-entry range) | Yes | — | **1 — Keeps unchanged**. Memo §2 already retains it. |
| **CONTRIBUTION (Rolling Attribution)** | How did contribution accumulate? | client `price_history` + `vw_performance_suite` | Yes | chunked reads | **1 — Keeps unchanged** |
| **FACTOR ENGINE** | Momentum / quality / value per name | client-computed from price history | Yes as built | derived | **2 — Re-pointed**. Ranks on client `totalReturn`; should read `signal_scores` (2,229 rows, 426 symbols, already carries family/conviction/confidence) rather than recompute. |
| **REGIME SLICER** | How did the book do per macro regime? | `market_regime_windows` | Yes | small | **4 — Does not serve the ask.** **Demote**, do not delete — regime-conditional performance is a real question, just not this brief's. |
| **CHARTS (AdvancedChart)** | Free-form chart comparison | `assets`, `price_history` | Yes | chunked | **1 — Keeps unchanged**. Already does asset-vs-asset comparison; the manual ancestor of the head-to-head. |
| `computePortfolioMetrics` / `computeDrawdown*` / `computeRolling*` / `computeReturnsBins` / `computeMonthlyReturns` / `computeCumulativeReturns` / `computePeriodReturns` | Book-level statistics | `navSeries` | Yes | pure | **1 — Keeps unchanged** |
| `computePositionContributions` | Per-position share of P&L | `positions` prop | Yes | pure | **2 — Re-pointed** to MWR |

---

## Module 2 — Risk (risk-v2)

Entry: `src/pages/risk-v2.js`, 2,184 lines. Five tabs. Heavier client-side computation than Performance.

**Loads**: `vw_portfolio_nav_daily`, `vw_risk_analysis`, `vw_performance_suite` (symbol, sector, total_return_pct, annualised_return), and chunked `vw_position_nav_daily`.

| Element | Question it answers | Reads from | Correct? | max_exec (anon) | Bucket |
| --- | --- | --- | --- | --- | --- |
| **COMMAND CENTER** — VaR, drawdown, Ulcer, Calmar, HWM | How much can I lose and how deep am I? | `vw_portfolio_nav_daily`, `vw_risk_analysis` | Yes | risk_analysis **1,362 ms warm** | **1 — Keeps unchanged**. The top-down frame §1.6 wants preserved. |
| **COMMAND CENTER — return distribution** | Skew, kurtosis, fat tails | `vw_portfolio_nav_daily` | Yes | as above | **1 — Keeps unchanged** |
| **CORRELATION — matrix** | What moves with what? | client `pearsonCorr` over `vw_position_nav_daily` | Correct maths, **wrong substrate** | pos_nav **2,271 ms** | **2 — Re-pointed** to `universe_correlations` (88,120 pairs, 422 symbols) |
| **CORRELATION — auto-detected clusters** | How many real bets? | client greedy grouping at **ρ > 0.75** | Correct maths, **conflicting definition** — see C4 | as above | **2 — Re-pointed** to `universe_clusters` (distance cut 0.35) |
| **CORRELATION — Diversification Score, Redundant Pairs** | Am I crowded? | client matrix | Yes | as above | **3 — Absorbed** into the risk spine's effective-number-of-bets. Same idea, weaker estimator. |
| **DECOMPOSITION — marginal VaR, weight vs VaR share** | Where does risk actually come from? | `vw_risk_analysis` (`marginal_vol_contribution`, `dollar_var_95_daily`) | Yes | 1,362 ms | **1 — Keeps unchanged**. Already the Euler decomposition §1.6 is built on; needs only cluster-level aggregation added above it. |
| **STRESS ENGINE** — regime replay, shocks | What happens in a bad tape? | client, from position series | Yes | pos_nav 2,271 ms | **4 — Does not serve the ask.** **Demote.** Genuinely valuable, orthogonal to the brief. |
| **GREEKS** — net Δ Γ Θ ν | What is my options exposure? | positions + options data | Yes | — | **4 — Does not serve the ask.** **Demote.** Not mentioned anywhere in the memo; must not be lost. |
| `pearsonCorr` / `pearsonCorrSubset` | Pairwise correlation | series arrays | Yes | pure | **3 — Absorbed**; server-side matrix supersedes |
| Position-vs-portfolio correlation | Does this name diversify me? | client | Yes | pure | **1 — Keeps unchanged**. Weakly peer-relative already. |

---

## Specific questions

### Which surfaces rank or sort on return?

Five sites. Two will **not** be fixed by re-pointing `vw_performance_suite`, because they rank a client-computed value.

| # | Location | Sort key | Fixed by re-pointing the view? |
| --- | --- | --- | --- |
| 1 | `perf-panels-bottom.js:181` — position table default sort | `total_return_pct` (view) | **Yes** |
| 2 | `perf-panels-bottom.js:395` — sortable "Return %" column | `total_return_pct` (view) | **Yes** |
| 3 | `perf-panels-bottom.js:240–241` — Best / Worst Performer tiles | `reduce` on `total_return_pct` | **Yes** |
| 4 | `perf-panels-analytics.js:998,1177` — Factor Engine table default sort | **client** `totalReturn` | **No** — separate computation |
| 5 | `perf-panels-analytics.js:484,582` — regime attribution sorts | **client** `totalReturn` / `abs(totalReturn)` | **No** — separate computation |

`perf-panels-bottom.js:396` also sorts on `annualised_return` — see C9.

Nexus carries a sixth (`nexusColumns.js:28`, `totalReturnPct`), out of scope here but it will diverge from Performance the moment MWR lands in one and not the other.

### Navigation order — how is a position reached?

**Performance: aggregate first, position fourth.** Tab order is Overview → Returns → Risk → Positions. The user lands on book-level NAV and metrics; the position table is the fourth tab. Reaching a single counter takes one tab click, then a row scan. From the row, clicking dispatches to `tab: 'equity'` — leaving the module entirely for Equity Research.

**Risk: no position front door at all.** Five tabs, all book-level or matrix-level. Individual names appear only as points in a scatter or cells in a matrix. There is no per-position drill-down (two `onClick` handlers in 2,184 lines, one of which is tab switching).

**Smallest change that makes the counter the front door:**

1. Reorder `SUB_TABS` so `positions` is first and `overview` last — one array reorder in `performance-suite.js:22`. Aggregate stays reachable as the zoom-out destination, exactly where the brief wants it.
2. Change the two `atlas:navigate` payloads from `{ tab: 'equity' }` to the position detail / head-to-head surface, keeping Equity Research as a secondary action.

That is a one-line reorder plus two payload edits, and it delivers memo §3 step 3 without touching a component. Worth doing early — it is the cheapest item in the whole sequence and independently reversible.

### Where does either module touch `fwd_pe`?

**Nowhere.** See C1.

### How are the unpriced ADRs rendered today?

**As ordinary numbers, with no indication.** See C3. Not blank, not zero, not a state — a five-month-old price presented as today's, feeding returns, CAGR, sort order, KPI tiles and the cut list.

### Does anything already do something peer-relative?

**Yes, three things** — all seeds, none competitors:

1. **Brinson selection effect** (`attributionEngine.js`) — the memo's §1.3 measure, at sector level against a static benchmark. Strongest seed. See C5.
2. **Risk correlation clustering** (`risk-v2.js`) — the memo's §1.6 measure, client-side at a conflicting threshold. See C4.
3. **Position-vs-portfolio correlation** (`risk-v2.js:250`) — asks "does this name diversify what I already own", which is a genuine peer-relative question the memo does not pose.

**AdvancedChart** also already does arbitrary asset-vs-asset comparison with normalisation and rebasing. It is the manual version of the head-to-head, and its interaction model is worth reusing rather than redesigning.

### What exists that the memo does not account for?

- **Brinson attribution engine** with three benchmarks, and its cross-module `localStorage` coupling to Nexus beat 07. (C5)
- **Client-side correlation clustering** in Risk, at a different threshold. (C4)
- **Stress Engine** — regime replay and shock scenarios.
- **Greeks** — net Δ/Γ/Θ/ν across the book. Nothing else in Atlas covers options exposure.
- **Regime Slicer** — performance conditioned on macro windows via `market_regime_windows`.
- **Factor Engine** — per-position momentum/quality/value, computed client-side while `signal_scores` already holds server-computed equivalents for 426 symbols with conviction and confidence. Duplicate computation path.
- **AdvancedChart** — persistent-mount comparison chart.
- **`vw_command_centre`** — a Performance shell dependency, historical max **2,924 ms**, mean 1,506 ms on one call pattern. Second-closest thing to the cap in the module's load path.

---

## Recommended amendments to the sequence

Memo §3 order holds. Three insertions:

| Where | Insert | Why |
| --- | --- | --- |
| **Step 1, before the engine** | Fix `vw_position_nav_daily` (2,271 ms) | It is the engine's own substrate and already over budget cold. (C7) |
| **Step 2, with the re-point** | Apply the 7-day staleness gate + `price_days_old` to `vw_performance_suite` | Live wrong numbers in a shipped surface; the gate already exists elsewhere. (C3) |
| **Step 6, with the risk spine** | Retire the client-side clustering in the same change | Otherwise two cluster definitions ship simultaneously. (C4) |

And one removal: **the `fwd_pe` audit does not block this build** and can be dropped from the critical path entirely. (C1)

---

## Measurement appendix

Warm, `service_role`, at audit time. `anon` cap is 3,000 ms.

| View | Warm | Rows | Historical anon max | Note |
| --- | --- | --- | --- | --- |
| `vw_position_nav_daily` | **2,271 ms** | 10,207 | — | **Over budget cold.** Both modules. |
| `vw_risk_analysis` | **1,362 ms** | 79 | — | Risk module core |
| `vw_command_centre` | 286 ms | 1 | **2,924 ms** | Perf shell dependency |
| `vw_performance_suite` | 24 ms | 63 | 2,755 ms | Fixed 2026-08-23 (493→85 ms) |
| `vw_transactions` | 22 ms | 557 | — | §0 cash-flow leg |
| `vw_portfolio_home` | 16 ms | 63 | 2,871 ms | |
| `vw_portfolio_nav_daily` | 6 ms | 166 | 2,980 ms | Fixed 2026-08-23 (4,850→246 ms) |

Historical maxima are cumulative over the retained `pg_stat_statements` window and include traffic from before the 2026-08-23 fixes; they are shown to establish that these reads *were* failing at the cap, not that they still are. The warm column is current.
