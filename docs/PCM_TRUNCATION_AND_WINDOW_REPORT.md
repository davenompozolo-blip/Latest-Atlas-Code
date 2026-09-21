# PCM measured a 25-hour window as a year, and a 90-day window that ended in January

Two live defects in `src/pages/pcm.js`, the Portfolio Construction page
(`app.js` → `TABS` → `PortfolioConstruction`). They are unrelated to each other
and both reach published numbers.

---

## 1. The 1,000-row cap, seventh instance

```js
sb.from('price_history')
  .select('asset_id, price_date, close')
  .in('asset_id', batchIds)
  .order('price_date', { ascending: true })   // ASCENDING
  .limit(batchIds.length * 260);              // 3,900 — a request, not a bound
```

The comment above it read *"~3 900 rows — safely within limits"*, which is the
arithmetic of the defect rather than a bound. PostgREST caps at 1,000:

| batch | rows available | newest available | **newest received** |
|---|---:|---|---|
| 0 | 3,587 | 2026-09-18 | **2026-01-02** |
| 1 | 3,353 | 2026-09-18 | **2026-01-09** |
| 2 | 3,750 | 2026-09-18 | **2025-12-24** |
| 3 | 3,707 | 2026-09-18 | **2025-12-24** |
| 4 | 1,500 | 2026-09-18 | 2026-05-20 |

**10,897 of 15,897 rows dropped — 69%.**

**The damage is a STALE window, not a short one.** `computeRiskRows` and
`computePortfolioMetrics` both read the **last 90 entries** of each array
(`prices[n - i]`, i = 1…90). After truncation that tail ends months ago, so
`vol_90d` on the L4 risk table is a 90-day window ending between **2025-12-23
and 2026-05-20** — **all 63 symbols**, published as current. The rows carried
`{ close }` with the date discarded, so nothing downstream could notice.

Fixed by paging through `src/lib/pagedRead.js`, DESC on a total ordering
(`price_date desc, asset_id asc`) with `interval = '1d'` pinned, and sorting
back to ascending at assembly because the consumers walk the tail positionally.

## 2. A 252-row window that spans 25 hours

```js
sb.from('account_snapshots').select('as_of, equity')
  .order('as_of', { ascending: true }).limit(252);
```

`account_snapshots` is written **every five minutes** — 48,440 rows across 169
days. Ascending + 252 takes the **oldest** 252: **2026-04-06 10:47 to
2026-04-07 07:35**. `computePortfolioMetrics` then differenced those levels and
annualised by `* 252` as though each were a session.

| | |
|---|---:|
| `portfolioVol` as published | **1.25%** |
| realised, settled daily sessions | **26.17%** |
| factor | **21x** |

`diversificationRatio` divides by portfolio vol, so it was inflated by the same
factor — the page reported the book as far better diversified than it is.

**The mechanism is a sampling-frequency mismatch, and it under-states.** A
five-minute return is the daily one over sqrt(78); annualising it by sqrt(252)
rather than sqrt(252 x 78) under-scales by **sqrt(78) = 8.83**. The remaining
gap to 21x is the 25-hour window itself being quiet.

Fixed by reading **`vw_book_realised_returns`** — one row per session, with
C1's two rules already applied (the New York session date, and both endpoints
settled). `session_date` is unique on it (183 rows, 183 distinct), so ordering
on it is total; DESC with a 252 bound takes the most recent sessions.

**`computePortfolioMetrics` now takes RETURNS, not levels.** Differencing a
*filtered* equity series is the C1 trap in a new place: drop a stale snapshot,
difference what remains, and you have computed a return across the gap, which
is exactly as fabricated as the row you dropped. Taking returns makes that
impossible to write here rather than merely discouraged.

## Verification

`src/pages/pcmPortfolioMetrics.test.mjs`, 7 tests — the daily annualisation,
the sqrt(78) understatement held as a test so the magnitude is not folklore,
the ratio inheriting it, equity levels being refused rather than differenced,
the observation floor, an absent series being absent rather than zero, and
non-finite observations refused. **4 of the 7 fail against the old contract**,
checked by restoring it.

Suite **461/461**, `vite build` clean, `lint:sql-casts` clean.

**The first draft of that fixture was wrong and the code was right**: it
shrank each return by 78 and asserted a ratio of 8.83, then measured 79.5.
Variance adds, not volatility. Corrected in place rather than by loosening the
assertion.

---

## An anomaly I could not settle: this page may not be in the production bundle

Found while verifying the fix, and **not resolved**. Reporting it rather than
claiming the deployed page is fixed.

`vite build` emits a single `dist/assets/index-*.js`. With these changes in
place that bundle is **byte-identical** to the pre-change one, and the string
`vw_book_realised_returns` does not appear in it. Nor do `vw_risk_analysis`
(6 occurrences in `src/`) or the three `[PCM] …` literals in `pcm.js`.

Probes, including one that was simply wrong:

| probe | result |
|---|---|
| `export const MARKER` appended to `pcm.js` | absent — **invalid probe**, rollup tree-shakes an unused export |
| `console.log(MARKER)` at `pcm.js` module level | **present**, bundle hash changed |
| `console.log(MARKER)` **inside** the loader body | **absent**, bundle hash unchanged |
| sourcemap `sources` | `src/pages/pcm.js` **is** listed, with 150 `src/` modules |

The last two contradict each other, and `app.js` holds a live reference
(`TABS.find(...).component`) that rollup should not be able to eliminate. So
either a large part of the page layer is being dropped from the production
bundle — which would be a much bigger finding than these two defects — or one
of these probes is misleading me the way the first one did.

**What is proven:** the source is correct, the arithmetic is tested, and the
measurements above come from the live database. **What is not proven:** that
this code path executes in the deployed app. That question deserves its own
unit; it should not ride on this one.
