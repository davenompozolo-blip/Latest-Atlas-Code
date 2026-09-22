# H-4 · The read-path skew

**2026-09-22.** `vw_nexus_holdings` served the mark from `mv_nexus_holdings`
(a 10-minute matview) while joining the live `vw_portfolio_home` for a handful
of other columns. Positions sync every 5 minutes, so the two carried different
prices for the same name at the same instant, and panels descending from each
disagreed **within one page load**.

Fixed at the view: the **book** is live, the **analytics** are cached.

---

## 1. What was measured

| when | market | matview rows stale | worst gap |
|---|---|---:|---:|
| 19:35 UTC | **open** | **58 of 64** | **2.3810%** |
| 04:12 UTC | closed, 130 s after a refresh | 0 of 64 | — |
| 04:25 UTC | closed, 15 s after a positions sync | 15 of 64 | 0.2360% |
| 04:48 UTC | closed, 224 s after a sync | 15 of 64 | 0.2070% |

**The skew is bounded by how far a mark travels inside the refresh window**, so
it is near zero overnight and worst during active trading. The 2.38% figure is
the mid-session one and is the honest headline; the overnight readings are what
was available at the hour this was fixed, and they were enough to demonstrate
the behaviour because extended-hours marks still move.

This corrects an earlier note in `CLAUDE.md` which waved the same skew through
as *"mark drift since the last matview refresh, at most 0.110pp"*. **Re-measure
a drift you decided was small** — it is bounded by a refresh interval, not by
anything about the data.

## 2. The blast radius

`vw_portfolio_home` → `mv_nexus_holdings` → `vw_nexus_holdings` →
`mv_bench_contribution` → the bench docket. Four objects read the view
(`mv_bench_contribution`, `vw_bench_docket`, `vw_sleeve_headroom`,
`vw_unclassified_holdings`), so the holdings table, the Theme cut, the bench
docket and the contribution panel all sat on the snapshot while the flagship's
other panels sat on the live view.

## 3. The change

`vw_nexus_holdings` is now driven by `vw_portfolio_home`, with
`mv_nexus_holdings` LEFT JOINed.

**Live, computed from the one row** — `market_value`, `current_price`,
`weight_pct`, `pnl_contribution`, `dcf_upside_pct`, `valuation_signal`,
`quality_grade`, `conviction_score`, `recommended_action`, `alert_flag`,
`nexus_insight`. (`daily_return_pct`, `five_day_return_pct` and
`unrealised_return_pct` already were, from H-3.)

**Cached, because they are expensive and mark-independent** —
`intrinsic_value`, `peg_ratio`, `beta`, `max_drawdown_pct`,
`var_contribution_pct`, `technical_signal`, `macro_signal`, `quant_signal`,
`next_earnings_date`, `valuation_source`, `total_return_pct`. These are what
`vw_performance_suite`, `vw_risk_analysis`, `vw_quant_dashboard`, `vw_screener`
and `equity_cache` cost to compute, and none of them moves with the mark.

**This is H-3's construction generalised.** H-3 moved two columns onto the live
view "so the figure and its `move_publishable` flag come from one row and
cannot disagree", and did not extend it to the mark itself — which was the
larger half.

### It costs nothing

`vw_portfolio_home` was **already in the FROM clause**. No join is added; what
changed is which side of an existing join each column comes from. `EXPLAIN` put
the matview at **7 buffers / 0.058 ms of a 547 ms read** — it buys nothing at
read time here and everything at build time, which is exactly where the patch
draws the line.

| | before | after |
|---|---:|---:|
| first read | 547 ms | 453 ms |
| warm | — | **71–72 ms** |

The row set is also now live, so an **exit leaves and an entry arrives within
one positions sync** rather than within one matview refresh.

## 4. An absent analytics row must not produce a verdict

A name bought between refreshes now arrives priced and sized with **no**
conviction score. `recommended_action`'s CASE ends in `ELSE 'Exit'`, so a null
score would have labelled a position bought four minutes ago **"Exit"**. The
four analytic fields are withheld together as NULL, never defaulted.

That moved the exposure to the browser, where it was **worse**, because every
call site defaulted:

| site | read | fabricated |
|---|---|---|
| `nexus-page:79` | `h.conviction_score \|\| 50` | book-weighted conviction |
| `nexus-page:858` | same | the footer average |
| `nexus-page:394` | `b.conviction_score - a.conviction_score` | **NaN comparator — unstable sort** |
| `nexus-page:896,921,1048,1061` | `h.recommended_action \|\| 'Hold'` | a verdict |
| `nexusLiveCompute:70` | `num(row.conviction_score) ?? 0` | the **worst** score on a 0–100 scale |
| `nexusLiveCompute:411` | `Math.max(0, … \|\| 0)` | **target weight 0% → a sell ticket** |

**The sizing layer is the worst of these.** `targetWeights` counted a pending
name's weight in `invested` and its conviction as 0 in `convSum`, so
`targetWeightPct` came out 0 and `sizeTrade` read that as the book's own
instruction to exit — a sell ticket for a position bought minutes earlier. It
also **diluted every other name's target**: on the test fixture A's target goes
45% → 75% purely from a name the model never scored.

`src/lib/holdingsAnalytics.js` is the one place that decides. `convictionOf`
and `actionOf` return null and **cannot be handed a fallback**; a pending name
gets **no entry** in the target map rather than a zero one, so the caller must
distinguish "target 0%" from "no target". There is **no second weighting
implementation** — a book-weighted conviction is `weightedMove(rows, { value,
move: convictionOf })`, the same arithmetic and the same
withhold-and-renormalise rule.

## 5. Proof

- **Column contract** — names, order and types identical on all **39 columns,
  0 mismatches**. `CREATE OR REPLACE VIEW` can append but never reorder or
  retype.
- **Equivalence** — with the matview `REFRESH`ed current, `EXCEPT ALL` both
  ways returns **0 over 39 columns × 64 rows**. The live recomputation
  reproduces the matview's arithmetic exactly, so any difference at any other
  instant is precisely the drift being removed.
- **Effect** — 15 s after a positions sync the old view disagreed with the live
  book on **15 of 64** rows; the new one on **0**, and structurally always will.
- **Downstream** — `refresh_nexus_holdings()` still runs; bench contribution 64,
  docket 64, sleeve headroom 13, unclassified 1.
- **File vs ledger** — the migration hashes `7377c362…`, identical to
  `supabase_migrations.schema_migrations`. Parse-checked with `pglast` before
  applying.
- **Tests** — 461 → **477**, all green, build clean.

### The suite could not have caught this

All 461 existing tests passed **unchanged** across the whole change, because no
fixture has ever carried a pending row — before H-4 such a name was *absent*
rather than present-with-nulls, so the shape could not occur.
`holdingsAnalytics.test.mjs` and the new `nexusSizing` cases carry one in every
fixture, with values chosen so the old defaults change the answer by a margin
no rounding could produce. **Verified by reverting**, not assumed: **7 of 22**
fail with the defaulting accessors restored, **2 of 11** with the old
`targetWeights`.

A repo-wide scanner fails any file that applies `||` or `??` directly to
`conviction_score`, `recommended_action` or `alert_flag`, so the next call site
fails in CI rather than in the terminal. **Its first version was wrong and the
detector test is what found it** — the regex was anchored tight to the field
and missed the live instance, `num(row.conviction_score) ?? 0`, which has a
closing paren in between. It carries the pagerOrdering lessons: comments are
stripped before scanning (the prose around these reads is *about* defaulting),
and a scan that reaches nothing fails rather than passing vacuously.

## 6. Not fixed, recorded

- **`mv_nexus_holdings.total_return_pct`** is
  `COALESCE(vw_performance_suite.total_return_pct, p.unrealised_return_pct, 0)`.
  63 of 64 rows take the first branch (a since-entry figure off daily bars, not
  an intraday mark); **1 takes the fallback** and is still served from the
  snapshot. That COALESCE is a cross-basis substitution of the kind
  `nexusReturnBasis.js` exists to forbid. It predates this work and changing it
  re-bases a published column with six consumers — its own unit.
- **`quality_grade` now pulls in `vw_portfolio_home`'s unbounded
  `returns`/`stats` CTE.** The old view never read `quality_score`, so the
  planner pruned it; it is now a 57,443-row window with an external sort
  (~170 ms, `Disk: 2384kB`). `CLAUDE.md` already flags that CTE as a deliberate
  unbounded exception. Net read time still fell, but this node grows with
  `price_history`.
- **`vw_nexus_price_freshness`** still takes its symbol set from the matview
  (membership only, no marks) and joins `price_history` **without filtering
  `interval`** — the two-spellings trap. Benign today (it only takes a `max`,
  and SPY is not held).
- **`account_snapshots` shows `Heap Fetches: 1353`** on an Index Only Scan.
  Stale visibility map; `VACUUM (ANALYZE)` has paid off twice before here.
- The **bundling anomaly** recorded in `CLAUDE.md` is unresolved, so that these
  client changes execute in the deployed app is **not proven**. The source is
  correct and the arithmetic is tested; that is what is claimed.
