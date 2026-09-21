# The Risk page was measured on a tape that stopped in May, and filled the rest with zeros

Two defects in `src/pages/risk-v2.js`, found while auditing the flagged
1,000-row cap in `loadRiskData`. The first is the cap, in its sixth layer.
The second is what made the first invisible — and is the larger of the two.

---

## 1. The truncation

```js
sb.from('vw_position_nav_daily')
  .select('symbol,price_date,close_price')
  .in('symbol', chunk)
  .order('price_date')            // ASCENDING
  .limit(chunk.length * 120);     // 2,400 — a request, not a guarantee
```

PostgREST caps a response at 1,000 rows. Measured against the live book
(63 equity names, 2026-09-18):

| chunk | symbols | rows available | newest available | **newest received** | symbols receiving nothing |
|---|---|---|---|---|---|
| 0 | 20 | 2,696 | 2026-09-18 | **2026-05-08** | 7 of 20 |
| 1 | 20 | 2,094 | 2026-09-18 | **2026-06-03** | 8 of 20 |
| 2 | 20 | 2,164 | 2026-09-18 | **2026-05-29** | 7 of 20 |
| 3 | 2 | 350 | 2026-09-18 | 2026-09-18 | 0 |

3,954 rows dropped. Three of four batches stopped four months short, and
**22 of 62 names received no series at all** — each chunk's alphabetical
tail sat entirely beyond the cut, because the ascending sort spends the
1,000-row budget on the oldest dates before it reaches them.

Sixth layer for a rule already written down three times in `CLAUDE.md`,
after `api/nexus-bench.js`, `api/nexus-theme.js`, `performance-suite.js`,
the pair explorer and the Trade risk layer. **`limit` is a request; so is
no limit.**

## 2. The fabrication that hid it

```js
rets.push(p0 && p1 && p0 > 0 ? (p1 - p0) / p0 : 0);
```

A date with no bar became a **real 0.00% return**. That is why a name
receiving zero rows did not produce an empty panel, an error or a gap: it
produced 184 flat sessions, which is a perfectly well-formed input.

And this was never only a consequence of the truncation.
`vw_position_nav_daily` carries a row only for a date the position was
**held**, so every name bought after the grid starts is zero-filled back to
the beginning. On the live book, against the 185-date grid:

| | |
|---|---|
| equity names with full coverage | **0 of 63** |
| fabricated zero returns | **5,889** |
| TTWO | 0 real bars, 185 fabricated |
| MA (bought 09-17) | 2 real bars, 183 fabricated |
| APH | 4 real, 181 fabricated |
| INTU | 7 real, 178 fabricated |

**A vector of zeros has zero variance, so the name reads as riskless, and
zero covariance, so it reads as a perfect diversifier.** Those are the two
most flattering answers available and neither is a measurement.

**Every guard on the page tested array LENGTH** — `a.length > 5`,
`posRets.length < 5` — which the zero-fill satisfies by construction. The
fabrication made itself invisible to the checks written to catch it. Count
measured observations, never slots.

## What was on screen

Reconstructed in SQL over all 1,953 equity pairs, replaying the exact
truncation (oldest 1,000 rows per chunk by ascending date) and the
zero-fill, against the same computation on complete data:

| | on screen | corrected |
|---|---:|---:|
| Average pairwise correlation | **0.0728** | **0.1913** |
| Diversification Score | **93 / 100** | **81 / 100** |
| heatmap cells published as a fabricated `0.00` | **1,173 of 1,953** | — |
| pairs genuinely unmeasurable (now rendered absent) | 183 | 183 |
| pairs whose correlation had the **wrong sign** | **132** | — |
| pairs off by more than 0.25 | 94 | — |

The page reported the book as **93 / 100 diversified** when it is 81, and
**60% of the correlation heatmap was a fabricated zero**.

**The two defects partially cancel in the average and not in the cells.**
Zero-fill alone moves the average from 0.1913 to 0.1219; adding the
truncation moves it back to 0.1823 on the pairs that could still be
computed — while pushing the count of sign-inverted pairs from 35 to 132.
An aggregate that looks nearly right over constituents that are individually
wrong is this codebase's recurring shape: `nav_reconciliation` passing while
four positions were broken, and a per-position rank error becoming a sign
error once members were summed.

---

## The fix

### `src/lib/pagedRead.js` — one paged PostgREST read

`fetchPaged(pageQuery, label)`. Two rules, and the second is the one the
earlier copies got wrong:

1. **Order DESC on a time series.** DESC decides what a truncation costs:
   lose the oldest bars, never the current session.
2. **Order on a TOTAL key.** `LIMIT`/`OFFSET` over a non-total ordering has
   no consistency guarantee between requests, so a series ordered by date
   alone — where hundreds of rows share a date — can repeat or skip rows
   across page boundaries. The `symbol` tiebreaker makes it total.

`label` is a required argument so the `MAX_PAGES` cap can name the relation
it truncated. The cap exists because the loop is driven by the server's own
response: a server that stopped honouring `range` would spin forever, and
**a hang is the one failure that reports nothing at all** (the lesson from
G-3's replay harness).

### `src/lib/riskReturnSeries.js` — no fabricated zeros

- `buildReturnSeries` yields `null` for a date with no bar at either
  endpoint. Never 0.
- `corrPairwise` computes over pairwise-complete observations and returns
  **null**, never 0, when it cannot be measured — too few shared sessions,
  or a constant series. The old helper returned 0 for both, which is a
  claim (`uncorrelated`) rather than an absence.
- `partitionBySufficiency` splits the book into measured and withheld and
  reports the weight on each side, so the page states its denominator
  rather than quietly becoming a smaller book.

### `src/pages/risk-v2.js`

- Both reads paged; `vw_portfolio_nav_daily` too, which is 185 rows today
  but gains one a session and was ordered ascending — the day it crosses
  1,000 it would start serving the oldest and drop the current session.
- Correlation matrix: an unmeasurable pair renders `·` with no fill, not a
  zero-coloured cell, and is excluded from the average rather than dragging
  the book's reported diversification upward for free.
- Cluster detection: an unmeasured pair cannot vouch for membership.
- Component VaR: standalone VaR is a quantile of the name's **own observed**
  returns (a zero sits mid-distribution and pulls the 5th percentile in),
  and names below the floor are withheld with their weight named on the panel.
- The conditional-correlation panel hardcoded `'+'` and the sentence
  *"Correlation rises…"*. Changing the inputs can move that number across
  zero, at which point the panel would have read `+-12%` and asserted a rise
  that did not happen. Both now read the sign off the number.

### A latent misalignment, removed while the context was loaded

`portfolioReturns` is built with `.filter()`, which **removes** elements, so
its indices are not grid slots — yet it was indexed against the per-symbol
series. It is exact today only because exactly one row is dropped (the
first, whose `daily_return` is null) and dropping the head shifts nothing.
Any future gap mid-series would have offset every correlation by one day.
`portfolioReturnsAligned` is built explicitly on the grid; the dense array
stays for the drawdown and rolling-vol panels that walk it contiguously.

---

## What is proven, and what is not

**Proven.** `src/lib/riskReturnSeries.test.mjs` — 20 tests. Reverting the
module to the shipped behaviour (zero-fill, and `0` in place of `null`)
fails **11 of the 20**, checked by actually reverting rather than assumed.
The fixtures carry the live shapes: a name bought two days ago, a name with
no bars at all, and a pair whose measured correlation is −0.9999 while the
zero-filled estimate is **+0.1827** — the same data, opposite signs.

The pager's tests include the exact live chunk shape (2,696 rows recovered
past a 1,000-row cap), an exact multiple of the page size, a short first
page, an empty relation, a server that ignores `range` (capped, one error
line), a PostgREST error raised rather than swallowed, and the two refusals
for a call that cannot name what it truncated.

Full suite 443/443, `vite build` clean, `lint:sql-casts` clean.

**Not proven.** The page-level wiring is verified by reading, by the build,
and by the library tests underneath it — not by execution against live
Supabase. The browser in this container cannot reach Supabase (recorded in
`CLAUDE.md`, 2026-09-10), so the render is unverified; the arithmetic and
the reads are.

One near-miss worth recording: the first patch inserted
`var portfolioReturnsAligned = d.portfolioReturnsAligned` **above**
`var d = props.data` in two components. `var` hoists, so `d` would have been
`undefined` and both tabs would have thrown on mount — and **`vite build`
reported success.** Caught by reading the patched region, not by the build.

---

## Still carrying their own pagers

Five other call sites page independently. Three order on a non-total key and
are latently unstable across page boundaries:

| site | relation | ordering | total? |
|---|---|---|---|
| `performance-suite.js` | `price_history` | `price_date` | **no** |
| `nexusMarketPrices.js` | `market_prices` | `date` | **no** |
| `risk-model-validation.js` | `var_backtest_runs` | `as_of` | **no** (~24 rows share an `as_of`) |
| `trade/tradeData.js` | `universe_correlations` | `symbol_1, symbol_2` | yes |
| `clusterIdentity.js` | `vw_cluster_identity` | `cluster_id` | yes |

Migrating them onto `pagedRead.js` is flagged, not done — it is a refactor
of five working readers rather than part of this fix. The three non-total
orderings are the part worth doing first.
