# C5 — standing Yahoo vs Alpaca feed reconciliation

**2026-09-10**, project `vdmojjszvvcithuxwexx`.

Two independent providers price the same 16 ETFs and nothing had ever compared
them. Yahoo writes `market_prices` (the A0 series layer, via
`backfill_market_prices`); Alpaca writes `price_history` (the platform's own
book and universe feed). A provider drifting or stalling would have surfaced
only as a chart that looked slightly wrong.

## Headline

**Prices agree. Coverage does not — and the cause is a one-line defect in the
universe price cron that has been running every night since the job was
created.**

| | |
|---|---|
| Leg-sessions compared | **67** |
| Diverged past 25 bp | **0** |
| Worst observed gap | **7.30 bp** (CPER, 2026-09-09) |
| Alpaca bars missing that Yahoo has | **13**, all 2026-09-09 |

## The check

`atlas_check_feed_reconciliation(p_sessions default 5, p_bps default 25)`.

**Two legs, deliberately kept apart.** `price` is both providers holding a bar
for the same leg and session and disagreeing — a data fault. `coverage` is one
provider holding a bar the other does not — a feed being late or stopped, a
different failure with a different fix. Folding coverage into a "prices
disagree" count would report a stall as a pricing error, which is the mistake
this codebase has already made in four layers when a transport failure was
rendered as a statement about the data.

**The session spine is SPY's own Yahoo bars, never a calendar.** The question
is "for the sessions the series layer believes happened, do the providers
agree?" — and a weekday feed is not late on a holiday. Same reasoning as
`atlas_last_traded_day()`.

**`close`, never `adjusted_close`.** The two providers run their own dividend
adjustment products, so adj-vs-adj diverges on every dividend by construction —
the A0 move measured up to 2.15e-6 relative between two copies of the *same*
provider's adjustment. The raw close is the one number both actually observed.

**25 bp is calibrated, not guessed.** Over the five sessions to 2026-09-09 the
worst like-for-like gap is 7.30 bp and the median is under 2 bp. Consolidated
tape versus Yahoo settlement differences live at that scale; 25 bp clears them
with room and is still tight enough to catch a stale or wrongly-adjusted bar.

## The finding: the universe leg was pinned to yesterday

All 16 legs had a Yahoo bar for 2026-09-09. Only **three** had an Alpaca bar —
SPY, XLE and CPER, which is to say exactly the three that are also *held*.

Held names are priced by cron job 17 at 22:00; everything else by job 34 at
23:20. The two commands differed in one place:

```sql
-- job 17, book:      'end_date', current_date::text
-- job 34, universe:  'end_date', (current_date - 1)::text
```

So roughly **1,900 non-held symbols — including 13 of the 16 A0 regime legs —
were one session behind the book, every night, by construction.**

It is not a hole. The five-day window re-fetches, so the bar always arrives the
following night. It is permanently *late*, never *missing*, which is precisely
why nothing caught it:

- **`universe_price_coverage` passes at a median lag ≤ 3 days.** A structural
  1-day lag sits inside a tolerance that exists for weekends and holidays. The
  check is not wrong; it cannot distinguish "Saturday" from "always a day
  late".
- **The job logs `success` every night** — because it is succeeding at what it
  was told to fetch. Seventeen consecutive clean runs say nothing about whether
  the request was right.

This is the 2026-08-10 lesson (`sync_alpaca_prices` defaulting to
`yesterday()`) surviving in a second cron body, and the 2026-08-23 lesson
(*a check scoped to the book cannot see the universe stop*) in its mirror
image: here a check scoped to the *lag* could not see the universe never
catching up.

**Fixed**: job 34 now sends `current_date`. The book leg proves the current
day's bar is available at 22:00 UTC (18:00 ET), so it is certainly available at
23:20, and the upsert on `(asset_id, price_date, "interval")` makes the overlap
free.

## What consumed the stale copy

Anything reading a held name was correct. The screener, valuation comps, bench
peers, correlation inputs and ticker search's `has_prices` flag all read the
universe — and **the A0 series layer's own legs are in that set**, so B0's
factor scores were computed on a Yahoo tape a session ahead of the Alpaca copy
of the same instruments. Nothing published a wrong number, because the factor
layer reads `market_prices` throughout; but the two stores of the same 16 ETFs
disagreed on recency every day and no surface said so.

## The runner

`atlas_run_feed_reconciliation()`, cron job **42**
`atlas_feed_reconciliation_nightly`, `25 23 * * 1-6`.

23:25 UTC sits after the Alpaca universe leg (23:20) and the Yahoo leg (22:50)
and before `atlas_run_validation` (23:40), so the night's result is on file
when validation reports. Mon–Sat matches both price feeds' cadence.

It writes a `sync_log` row **and** an `atlas_validation_log` row, following
`atlas_log_universe_price_coverage`. Status mapping:

| condition | `sync_log` |
|---|---|
| no divergence, no gap | `success` |
| divergence past threshold | `partial` |
| coverage gap | `partial` |
| nothing to compare | `error` |

The spec asks for *partial on divergence*; partial is also right for a coverage
gap, because the run did what it was asked and found something — not the same
as the run failing. The one `error` case is having nothing to compare: a check
that cannot see its inputs must not report health. Three prior instances of
that pattern are recorded in `CLAUDE.md`.

Refusal is an `UPDATE` and a `RETURN`, never a `RAISE` — a `RAISE` rolls back
the very `sync_log` row recording the refusal. `clock_timestamp()`, not `now()`
— `now()` is the transaction timestamp and `started_at` defaults to it, so
`now()` reports every run as 0 ms. `duration_ms` is `GENERATED ALWAYS` and is
never written.

**Proven, not assumed.** `sync_log` #46249: `partial`, **515 ms** (real), 67
pairs, 0 diverged, worst 7.30 bp, 13 bars missing, with the matching
`atlas_validation_log` row.

## The exclusion table

`feed_reconciliation_exclusions (leg, exclusion_date, symbol, reason)`. A date
where a divergence is known and explained is declared once instead of being
re-reported nightly forever.

Seeded with C1's three `stale_snapshot` dates — 2026-01-15, 2026-05-04,
2026-07-29 — scoped to leg `equity_curve`.

**Stated plainly: those three cannot fire on the price or coverage legs and
never could.** They are rows of `portfolio_equity_curve`, which is Alpaca
portfolio equity, not ETF close prices; and at a five-session window they are
months outside the comparison regardless. They are recorded because the fact is
worth declaring once in a place the next reader will look, and because the
exclusion survives anyone widening the window or adding an equity-curve leg.

`leg` is what keeps this a note rather than a gag: an `equity_curve` exclusion
does **not** silence a price divergence on the same date and symbol. That
property is asserted in the test rather than trusted.

## Test

`supabase/tests/feed_reconciliation_forced_divergence.sql` — **5/5**, run
2026-09-10, every mutation rolled back.

| force | asserts |
|---|---|
| 1 | a 100 bp injected divergence is caught (`failed`, diverged=1, max 100.00 bp) |
| 1 | and carries `warning`, not `critical` — the run worked, the data disagreed |
| 2 | an empty leg list is refused `critical`, never a clean pass |
| 3 | an `equity_curve` exclusion does **not** silence a price divergence |
| 3 | a `price` exclusion does |
| 4 | the live book still reconciles clean on price (0 of 67) |

Force 4 is the happy path, included deliberately: a wall of failure cases that
also rejects healthy data is worse than no cases at all. Coverage is *not*
asserted there — it is a live feed state, not a property of the check.

## Open

- **Tonight's 23:20 universe run is the acceptance test for the job-34 fix.**
  If it works, the 23:25 reconciliation should report `success` with 80 pairs
  and no coverage gap. Until then the check correctly reads `partial`.
- The reconciliation covers the 16 A0 legs only. The other ~1,500 symbols in
  `price_history` have no second source to check against, so this says nothing
  about them beyond what job 34's own log does.
