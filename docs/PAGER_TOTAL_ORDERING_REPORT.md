# Order DESC was half the rule; three pagers were missing the other half

Follow-up to `docs/RISK_V2_TRUNCATION_AND_ZEROFILL_REPORT.md`, which flagged
three pagers ordering on a non-total key and did not migrate them. This
closes that item, adds a repo-wide guard, and records two live defects found
on the way that are **not** fixed here.

---

## The rule

`.range()` becomes `offset`/`limit` on the wire — proven, not assumed:

```
select=symbol,date,adj_close&symbol=in.(SPY,DIA)&date=gte.2026-01-01
  &order=date.desc,symbol.asc&offset=0&limit=1000
```

**OFFSET paging over a non-total ordering has no consistency guarantee
between requests.** Rows sharing a sort key may be returned in a different
relative order on the request for page 2 than they were on page 1, so a row
can be served twice or skipped entirely. Ordering DESC decides *what a
truncation costs*; ordering on a **total key** decides *whether paging is
correct at all*. The first rule was already written down three times in
`CLAUDE.md`. The second was not.

## Exposure, measured

A row is ambiguously ordered when at least one other row shares its entire
sort key:

| relation | rows | ambiguous under the OLD key | widest tie |
|---|---:|---:|---:|
| `price_history` (1y, `1d`) | 384,164 | **384,164** (100%) | **1,900** |
| `market_prices` | 120,152 | **118,896** (99.0%) | 19 |
| `var_backtest_runs` | 120 | **120** (100%) | 24 |

`price_history` has a single date shared by **1,900 rows** — nearly two full
pages under one sort key. Under the new keys the ambiguous count is **0** in
all three.

## The three fixes

| file | relation | old ordering | new ordering |
|---|---|---|---|
| `performance-suite.js` | `price_history` | `price_date` | `price_date desc, asset_id asc` (+ `interval` pinned) |
| `nexus/nexusMarketPrices.js` | `market_prices` | `date` | `date desc, symbol asc` |
| `risk-model-validation.js` | `var_backtest_runs` | `as_of` | `as_of desc, id asc` |

Each tiebreaker was chosen against the relation's actual unique index, not
by eye:

- `price_history` is unique on `(asset_id, price_date, "interval")` — so
  `(price_date, asset_id)` is total **only once the interval is pinned**.
- `market_prices` is keyed `(symbol, date)`, so `(date, symbol)` is total.
- `var_backtest_runs`' business key is
  `(as_of, logic_version, leg, basis, coalesce(axis_key,''), conf)` and
  `axis_key` is **nullable**, so the `id` bigint PK is the cleaner
  tiebreaker.

All three now page through `src/lib/pagedRead.js` rather than a local loop.
That is not tidying: each local loop was driven entirely by the server's own
response with **no cap**, so a server that stopped honouring `range` would
spin forever, and a hang is the one failure that reports nothing at all.

`risk-model-validation.js`'s page size moves 500 → 1000. PostgREST caps a
response at 1,000 either way, so this is strictly fewer round trips.

## The interval defect, found while choosing a tiebreaker

`performance-suite.js` filtered neither `interval` nor `source`.
`price_history` carries two interval spellings:

| interval | source | rows (1y) |
|---|---|---:|
| `1d` | alpaca | 381,722 |
| `1d` | yfinance | 2,442 |
| `1Day` | yahoo | **124** |

Those 124 rows are **all SPY**, all on dates that *also* carry a `1d` bar,
and **every one of them has a different close** — 0.315% apart on average,
0.786% at worst. Unfiltered, SPY returns two closes for one session, and the
ascending series handed downstream carries a duplicate date with two prices,
which `RollingAttributionPanel`'s positional walk reads as two sessions.

**Latent in this file today**, because `equityIds` comes from the book and
SPY is not held — but SPY is the benchmark, so any read that reaches for it
gets the collision. All 1,914 assets have `1d` rows and exactly one (SPY) has
any non-`1d`, so pinning `interval = '1d'` drops no asset's series.

**No other `price_history` reader filters the interval either**:
`tradeData.js:441`, `pcm.js:1238`, `advanced-chart.js:542`,
`NexusRealized.js:475` and `:583`. Flagged, not fixed.

## The guard

`src/lib/pagerOrdering.test.mjs`, 11 tests. Two halves:

**The library contract.** The whole fix rests on chained `.order()`
producing a multi-key sort. If supabase-js ever dropped the earlier key,
every tiebreaker in the repo would stop being one and nothing else would
notice — the query would still succeed and still return rows. Asserted
against the real client, including that the date key comes *first* (a
tiebreaker that outranked it would drop the newest bars).

**A repo-wide scan.** The rule is not "these three files"; it is that any
paged read declares a total ordering. The scanner walks back from each
`.range(` to the `.from(` opening its chain and counts `.order(` calls.

Two things that scan got wrong on its first run, both fixed and both worth
recording:

- **It read its own documentation as code.** The prose around these reads
  talks about ordering, so comment lines are stripped before counting.
- **A long comment between `.from(` and `.range(` hid the chain**, so
  `performance-suite.js` and `risk-model-validation.js` reported *zero*
  order keys — the comment block this very fix added, sitting between the
  two. There are tests for both failure modes, because a detector that
  reports the wrong thing is worse than none.

**A single key that is already unique is total, and demanding a second
would be cargo cult.** Two reads are legitimately single-key and carry a
`TOTAL ORDER:` justification naming the key and the measurement —
`vw_cluster_identity.cluster_id` (206 rows, 206 distinct, 0 ties) and
`vw_portfolio_nav_daily.price_date` (185/185/0). The justification lives
beside the code rather than in an allowlist in the test file, where the
claim would rot away from what it describes.

The scan is asserted non-vacuous (it must find several paged reads), and
reverting any of the three tiebreakers makes it fail — checked by reverting,
not assumed.

Full suite **454/454**, `vite build` clean, `lint:sql-casts` clean.

---

## Found here, NOT fixed — `src/pages/pcm.js`

The routed Portfolio Construction page (`app.js` → `PortfolioConstruction`)
carries two live defects. They are a different page and a different defect
class from the three above, so they are reported rather than folded in.

**1. The seventh instance of the 1,000-row cap.** `pcm.js:1238` is
byte-for-byte the pre-fix `performance-suite` read — 15 asset_ids per batch,
`.order('price_date', { ascending: true })`, `.limit(batchIds.length * 260)`
= 3,900, no paging:

| batch | rows available | newest available | **newest received** | symbols with nothing |
|---|---:|---|---|---:|
| 0 | 3,587 | 2026-09-18 | **2026-01-02** | 1 of 15 |
| 1 | 3,353 | 2026-09-18 | **2026-01-09** | 2 of 15 |
| 2 | 3,750 | 2026-09-18 | **2025-12-24** | 0 of 15 |
| 3 | 3,707 | 2026-09-18 | **2025-12-24** | 0 of 15 |
| 4 | 1,500 | 2026-09-18 | 2026-05-20 | 0 of 6 |

**10,897 of 15,897 rows dropped — 69%.** Four of five batches stop within
days of the series start. It pushes `{ close }` with the date discarded, so
nothing downstream can detect it.

**2. A 252-row window that is 25 hours long.** The same loader reads

```js
sb.from('account_snapshots').select('as_of, equity')
  .order('as_of', { ascending: true }).limit(252)
```

`account_snapshots` holds **48,440 rows** across 169 days, written every five
minutes. Ascending + `limit(252)` takes the **oldest** 252 — spanning
2026-04-06 10:47 to **2026-04-07 07:35**. `computePortfolioMetrics` is being
handed roughly one day of intraday snapshots as if it were a year of daily
equity.

The second one is not a paging bug and its fix is a decision, not a
correction: 252 *sessions* of daily closes is presumably the intent, which
means a different query (one row per session, most recent first), not a
reordered limit. Worth its own unit.

**Lower-severity, also unfixed:** `advanced-chart.js:542` and
`NexusRealized.js:583` both request `.limit(1600)` on `price_history`. The
server returns 1,000. Both order DESC, so they lose the oldest bars rather
than the current session — the benign direction — but they believe they hold
1,600 bars and hold 1,000.
