# Phase A0 — Series layer acceptance report

Date: 2026-09-08 · Supabase project `jikbulixwvvfrirjpgra`

Schema, registry and backfill are complete. Three findings need a decision
before A1 runs; they are in **Deviations and findings** below.

---

## 1. Coverage report

Session calendar is the set of dates SPY printed a bar — the same idiom as
`atlas_last_traded_day()`. `expected_sessions` counts sessions between each
leg's own first and last bar, so it measures completeness *within* coverage,
not against a common start date.

Re-runnable as `public.vw_market_price_coverage`.

| symbol | inception (provider) | first bar | last bar | rows | expected | missing | off-calendar |
|---|---|---|---|---:|---:|---:|---:|
| CPER | 2011-11-15 | 2011-11-15 | 2026-09-04 | 3,722 | 3,722 | 0 | 0 |
| DIA  | 1998-01-20 | 1998-01-20 | 2026-09-04 | 7,202 | 7,202 | 0 | 0 |
| EEM  | 2003-04-14 | 2003-04-14 | 2026-09-04 | 5,887 | 5,887 | 0 | 0 |
| GLD  | 2004-11-18 | 2004-11-18 | 2026-09-04 | 5,483 | 5,483 | 0 | 0 |
| HYG  | 2007-04-11 | 2007-04-11 | 2026-09-04 | 4,883 | 4,883 | 0 | 0 |
| IWM  | 2000-05-26 | 2000-05-26 | 2026-09-04 | 6,608 | 6,608 | 0 | 0 |
| QQQ  | 1999-03-10 | 1999-03-10 | 2026-09-04 | 6,916 | 6,916 | 0 | 0 |
| RSP  | 2003-05-01 | 2003-05-01 | 2026-09-04 | 5,875 | 5,875 | 0 | 0 |
| SPY  | 1993-01-29 | 1993-01-29 | 2026-09-04 | 8,458 | 8,458 | 0 | 0 |
| TLT  | 2002-07-30 | 2002-07-30 | 2026-09-04 | 6,065 | 6,065 | 0 | 0 |
| XLE  | 1998-12-22 | 1998-12-22 | 2026-09-04 | 6,968 | 6,968 | 0 | 0 |
| XLF  | 1998-12-22 | 1998-12-22 | 2026-09-04 | 6,968 | 6,968 | 0 | 0 |
| XLI  | 1998-12-22 | 1998-12-22 | 2026-09-04 | 6,968 | 6,968 | 0 | 0 |
| XLP  | 1998-12-22 | 1998-12-22 | 2026-09-04 | 6,968 | 6,968 | 0 | 0 |
| XLU  | 1998-12-22 | 1998-12-22 | 2026-09-04 | 6,968 | 6,968 | 0 | 0 |
| XLY  | 1998-12-22 | 1998-12-22 | 2026-09-04 | 6,968 | 6,968 | 0 | 0 |

**Total 102,907 rows. Zero bars dropped at load; every leg starts exactly at
its provider-verified inception.**

Binding constraint on a full-set analysis is **HYG at 2007-04-11**, as the spec
anticipated. Second constraint is **CPER at 2011-11-15** for anything using
`cper_gld`.

### The coverage check cannot prove the feed is complete

`missing_sessions = 0` on all sixteen legs is a weaker result than it looks.
Every leg came from one provider on one calendar, so the calendar and the data
share a source: this detects **a leg that lags the others**, not a day the
provider dropped from all of them. Same shape as `price_coverage` counting
holdings while the universe froze.

So the calendar was validated separately, against raw weekday counts. US market
holidays run 9–10 a year; only three years fall outside an 8–11 band, and each
is explained:

| year | weekdays | sessions | closed | why |
|---|---:|---:|---:|---|
| 1993 | 241 | 234 | 7 | partial year from 1993-01-29; MLK was not yet an NYSE holiday |
| 2001 | 261 | 248 | 13 | 9 holidays + the four-day post-9/11 closure |
| 2026 | 177 | 170 | 7 | partial year to 2026-09-04 |

## 2. Gaps longer than three consecutive trading days

One gap class, in the ten legs that existed at the time:

**2001-09-10 → 2001-09-17, 4 weekdays missing** — DIA, IWM, QQQ, SPY, XLE, XLF,
XLI, XLP, XLU, XLY. The post-9/11 NYSE closure. A market event, not a hole.

The six legs that postdate it (CPER, EEM, GLD, HYG, RSP, TLT) have no gap over
three days anywhere. Measured in weekdays rather than sessions, so the test does
not inherit the calendar it is checking.

## 3. Spot reconciliation

Against **Alpha Vantage** — a different provider from the one that loaded the
rows, so this is an independent check rather than a re-read.

| symbol | points | not found | mismatches | max abs diff |
|---|---:|---:|---:|---:|
| XLU  | 15 | 0 | 0 | 1.8e-6 |
| CPER | 15 | 0 | 0 | 1.8e-6 |
| SPY  |  2 | 0 | 0 | 1.7e-5 |

32 of 32 agree. Residuals are float32 storage artifacts, not disagreement.

---

## Deviations and findings

### 1. Neither named source could do this job — the data is from Yahoo

The spec names Alpaca primary, AlphaVantage as fallback "where Alpaca history is
short". Alpaca history is short for **all sixteen legs**: its stock bars begin
2016, while the shallowest leg here starts 2011 and the deepest 1993. Alpaca
also has no adjusted-close column — it returns one adjusted series per request.

AlphaVantage cannot cover the gap either. `TIME_SERIES_DAILY_ADJUSTED` and
`outputsize=full` are both **premium**, and this project's key is free-tier —
the same limitation already recorded for vol-dispersion. Verified, not assumed:
both calls return the premium notice.

`adj_close` is a hard requirement (§1: ratio legs have materially different
dividend yields), and backfilling to inception is a hard requirement (§2). No
combination of the two named sources satisfies both.

Yahoo's chart endpoint returns raw close **and** adjusted close over full
history, and returns `firstTradeDate`, which is what made the inception dates
provider-verified rather than asserted. `data_source` on every instrument row
records `'yahoo'` — the registry states the provider the rows actually came
from.

**This is worth a decision, not just a note.** Yahoo is an unofficial endpoint
and this repo retired a yfinance pipeline once already. It is fit for a one-time
historical backfill of sixteen reference series; it is a weaker basis for an
ongoing feed. See follow-ups.

### 2. `close` is split-adjusted, not raw

The spec calls `close` a "raw close" and the column comment said so. It is not
raw in the as-traded sense.

Checked against the provider's own split events rather than inferred:

| symbol | split | close-series discontinuity |
|---|---|---|
| QQQ | 2:1 on 2000-03-20 | none |
| XLU | 2:1 on **2025-12-05** | none |
| SPY | never split | — |

No discontinuity across either split, so splits are applied to `close` exactly
as they are to `adj_close`. **The two columns differ by dividends only.**

Consequences:

- **Ratios are unaffected.** Everything downstream uses `adj_close`, per §1.
- **Reconciliation still works**, against any split-adjusted quote. It happened
  to be unaffected above because AlphaVantage's free window starts after XLU's
  December split.
- **`close` must not be read as the price a trade printed at.** XLU's stored
  close for any date before 2025-12-05 is half what traded that day.

The column comment now states this. The name is the spec's and was left alone —
`close` is not itself a false label, only the "raw" gloss was.

### 3. The `dimension` labels are stored as claims, not facts

Recorded verbatim from the source documents, with a column comment saying they
are provisional and that A1 is expected to break several. Two the data already
argues against, noted in each pair's `caveats`:

- **`qqq_spy` under `breadth`** — a rising QQQ/SPY is mega-cap concentration
  *increasing*, arguably the opposite of breadth.
- **`xle_xlu` under `safe_haven`** — XLE is largely an oil-price series and
  extremely concentrated; this behaves more like a commodity/inflation pair.

Flagged only. Regrouping is A1's job and out of scope here.

---

## What was built

| object | what |
|---|---|
| `market_instruments` | 16 legs. `caveats` and `thesis` are NOT NULL with non-blank CHECKs, so acceptance §5.1 is enforced by the schema rather than by convention |
| `market_prices` | 102,907 rows, PK `(symbol, date)`, index on `date` |
| `ratio_pairs` | 12 pairs. Definitions only — **no computed ratio is stored anywhere** |
| `vw_market_price_coverage` | the §5.4 report, re-runnable |
| `backfill_market_prices` | edge function; loader, idempotent on `(symbol, date)` |

RLS matches the house convention (`authenticated` select, `service_role` write).
The coverage view is `security_invoker = true` — the linter flags plain views as
SECURITY DEFINER, and nine older views in this schema carry that ERROR, but
inheriting a finding is not a reason to add one.

## Not done — deliberately

- **No scheduled job.** `backfill_market_prices` is not in `cron.job`. A0 is
  schema, registry and backfill; adding a nightly feed is a scope decision that
  depends on the source question above.
- **No ratio computation, signals, scores, regime logic or UI** — §0 out of scope.
- **CPER is not upgraded to HG/GC futures.** Registered with the truncation and
  roll-drag caveat, flagged as a later upgrade, per §4.

## Follow-ups for the source decision

1. If these series are to stay current, decide the ongoing writer. Alpaca can
   serve everything from 2016 forward and already has credentials and a house
   pattern; it cannot restate history before 2016, so a hybrid leaves a seam at
   the join that would need testing for level continuity.
2. A premium AlphaVantage key would make `TIME_SERIES_DAILY_ADJUSTED` viable and
   would also unblock `vol_dispersion_daily`, which has had 0 rows ever for the
   same reason.
