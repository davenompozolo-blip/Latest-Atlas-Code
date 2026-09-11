# A2.2 — pair explorer

Built on `claude/a0-series-layer-spec-xfd0g5`, merged in
[#769](https://github.com/davenompozolo-blip/latest-atlas-code/pull/769).
Screenshots regenerated 2026-09-10 against **real** `market_prices`.

## What shipped

| File | What it is |
|---|---|
| `src/pages/nexus/nexusPairsCompute.js` | Pure module: axis assignment, aligned window, rebased series, tiles, read, derivation line. |
| `src/pages/nexus/nexusPairsCompute.test.mjs` | 24 tests. Real `factor_axis_loadings` rows **plus synthetic axis keys** (`zeta`, `omega`) so nothing can be hardcoded and pass. |
| `src/pages/nexus/NexusPairExplorer.js` | The panel. No pair list, no leg list, **no pair-to-axis map**. |
| `src/pages/nexus/NexusRegime.js` | Layout: explorer on top, one toggle, both lower sections mounted and hidden by script. |
| `supabase/migrations/20260910190000_a2_2_ratio_pairs_metadata.sql` | 12 `thesis` rewrites; `dimension` → `dimension_deprecated`. |

## The grouping is derived, never declared

`assignAxis` sorts a pair's three loadings by `Math.abs(loading)` and takes the
top one. There is no map from pair to axis anywhere in the code — add a fourth
axis to `factor_axes` and a fourth group appears with no edit here.

Live grouping, read back off the rendered DOM:

```
CYCLICAL RISK-ON        : XLI/XLU  XLE/XLU  XLY/XLP  XLF/SPY
INDEX CONCENTRATION     : QQQ/SPY  DIA/SPY  RSP/SPY
DOLLAR STRENGTH (marginal): GLD/SPY  IWM/SPY  EEM/SPY  HYG/TLT
UNASSIGNED              : CPER/GLD
```

**HYG/TLT is a near tie and says so.** Its top two loadings are `dollar`
+0.3712 and `cyclical` +0.3677 — a 1% margin. The A2.2 mockup files it under
cyclical; the data puts it on dollar by a hair. Shipped data-driven with a
`near tie with cyclical +0.37` qualifier rendered beside the winner, because
showing only the winner would assert more than 1% of margin can carry. **This
is the one item still open for the owner:** confirm `dollar`, or override to
`cyclical` in `factor_axis_loadings`. Do not resolve it in the component.

## The chart is lightweight-charts, not hand-rolled SVG (2026-09-11)

The first version drew four `<path>` elements into a bare `<svg>`: no time
axis, no value axis, and the series plotted as an index rebased to 100 with a
dashed rule at 100. A reader could see that lines diverged and could not say
**when** or **by how much**.

It now uses **lightweight-charts v5** — TradingView's library, already a
dependency and already what `NexusBoard` and the perf panels draw with — so
the panel carries a real date axis, a real percent axis, the house grid and
crosshair, and a last-value badge per line.

**The series are percent from the first session, not an index.** `buildSeries`
rebases to 100, so `rebased − 100` *is* that percent — (v/v₀)·100 − 100 =
(v/v₀ − 1)·100 — with no second normalisation and no change to the compute
module or its tests. It also puts the baseline on **0**, which is the only
value a percent axis can honestly anchor to: a dashed line at 100 reads as a
level, and a reader cannot tell a level from a move.

The last-value badges are a free cross-check — they reproduce the metric tiles
exactly (XLI/XLU: ratio +0.1%, XLI −4.9%, XLU −5.0%, SPY +1.3%), because both
are computed from the same series.

`baseOpts` and the `useChart` hook moved out of `NexusBoard.js` into
`src/pages/nexus/nexusChart.js` when this panel became their second reader. A
second copy is how two charts in the same module drift apart on grid colour,
font and scale margins until nobody can say which one is the house style.

## Acceptance

| Criterion | Result |
|---|---|
| `rsp_spy` displays −0.47 | `concentration · loading −0.47` ✓ |
| `cper_gld` unassigned, not blank or errored | `unassigned — loads below the noise threshold`, own group, own chip ✓ |
| All three market-relation cases produced by `pairRead` | `rotation_in_rising_market`, `sorting_losers`, `genuine_relative` — each proved by its own fixture (`nexusPairsCompute.test.mjs:170,176,182`), plus the fourth case rendering forced, `benchmark_is_leg` (`:255`) ✓ |
| Both lower sections present in the DOM and hidden by script | `style={{display: lower === k ? 'block' : 'none'}}`, not conditional render ✓ |
| No pair-to-axis mapping in code | asserted against axis keys that do not exist live ✓ |
| 24 unit tests | pass ✓ |

## Three defects rendering found that the tests did not

All three root in one fact: **seven of the twelve pairs have SPY as a leg.**

1. The read emitted *"Only SPY is beating SPY"* on every `X/SPY` pair. There is
   now a `benchmark_is_leg` branch: *"SPY is one leg, so this ratio already
   measures RSP against the market: RSP lagged it by 0.4%."*
2. The legend was keyed on symbol, so `SPY` appeared twice and React warned.
   Keyed by **role** now.
3. The chart drew SPY **twice** — one line exactly under the other, both in the
   legend. The benchmark reference line is suppressed when it is a leg, and the
   note says so.

Verified after the fix: `RSP/SPY legend=["RSP","SPY","ratio"] lines=3` against
`XLI/XLU legend=["XLI","XLU","ratio","SPY"] lines=4`.

**A pure-function test suite cannot see any of these.** They are all facts about
what reached the screen.

## Provenance of the screenshots

`docs/a22-explorer-{xli-xlu,rsp-spy,cper-gld}.png`, re-rendered 2026-09-11
after the chart change.

The browser in this container cannot reach Supabase (CLAUDE.md). The
screenshots are produced by replacing **only the transport**: `window.fetch` is
patched to answer `/rest/v1/*` from rows read out of `vdmojjszvvcithuxwexx`
over the MCP. The real supabase-js client, the real PostgREST query builders,
the real `.range()` pager, the real compute module and the real component all
run.

Rows replayed: `ratio_pairs` (12), `factor_axis_loadings` (33), `factor_axes`
(3), and `market_prices.adj_close` for the 16 legs over 70 sessions — **1,120
rows, over PostgREST's 1,000-row cap**, so `fetchPricesPaged` really pages
(two calls observed: 1,000 then 120) rather than being bypassed by a fixture
small enough to fit.

**Say which half is proven: the render is, the network read is not.** An
earlier set of these images used synthetic prices; those are superseded.

The harness lives in `.a22harness/` and is gitignored — it is a dated snapshot,
not a fixture, and a stale copy in the tree would be worse than none.
