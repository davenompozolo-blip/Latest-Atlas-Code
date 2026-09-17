# G-6 · The book against the market

**2026-09-17.** The unit the rest of the G-series exists to make possible.
Every other panel puts a market reading on the flagship; this one asks the
**expensive** question against the **cheap** ones.

## The link is one number

B0/C3 fitted the book's market beta on a 168-session panel. Today's benchmark
move times that beta is what the book *should* have done, and the residual is
what the market factor does **not** explain.

```
Book, today   −0.30%     97.9% of book measured · 2.1% withheld on stale marks
SPY, today    −0.44%
Excess        +0.14%     book − benchmark, unadjusted
Expected      −0.45%     β 1.026 × SPY
Residual      +0.15%     what market exposure does not explain
```

A cheap read that agrees with the expensive one is reassurance. A residual is
where the day's story actually is.

## Three refusals, each one a rule already paid for

**1. No expectation without a significant beta.** `book_factor_betas` carries
`significant` bound by CHECK to `|t| > 2`. An insignificant beta multiplied by
today's move still produces a number, and that number is a claim the data does
not support — A2's *"an absent number beats a flagged one"*, applied to a
product rather than a coefficient. Measured: with the beta insignificant,
`Expected` and `Residual` both render as named absences reading *"market beta
is not significant (|t| ≤ 2) — no expectation to form"*, while **the excess
still stands**, because an excess needs no model.

**2. The two sides are different bases, and it is said rather than
reconciled.** `bookPct` is live and intraday; the beta is an append-only
estimate over a historical panel with its own `estimated_at` and `n_obs`.
Reading one against the other is the mixed-basis failure
`vw_position_trading_effect` publishes its own `as_of` to avoid. The panel
prints:

> **BASIS** today, intraday · vs · beta estimated 2026-09-09 · n=168 — a live
> move read against a historical beta — two bases, stated rather than reconciled

**3. The denominator travels with the number.** A residual computed on 84% of
the book is a residual on 84% of the book.

## The defect this unit found

`nexusLive.js`'s `liveOr()` falls the risk and performance gauges back to
`nexusMock`'s figures when the live build returns null. It **logged** the
fallback — and logging tells whoever is watching the console and tells no
consumer anything. The returned object was indistinguishable from a live one.

G-6 reads `gauges.performance` to form a residual against a fitted beta.
Computing that on a mock book move publishes a finding about a book that did
not move that way. This is the *"a gauge carried from the mock looks exactly
like a working gauge"* entry for the third time, counting the chrome's
hardcoded `RISK-ON` pill that G-4 removed.

`liveOr` now **marks** the gauge (`live: true` / `live: false`) and G-6 refuses
a marked-baseline one outright. Measured: every reading becomes a named absence
carrying *"the book gauge fell back to the structural baseline — not a live
move"*.

A gauge with **no** marker is still read — absence of a mark is not a claim of
mockness, and asserting otherwise would break every caller that predates it.

## The sector cut

Where the book's weight sat against where the market moved:

```
Energy        6.6%   XLE −2.88%   −0.19%
Technology   21.7%   XLK +0.83%   +0.18%
Financials    9.4%   XLF −1.62%   −0.15%
```

**The last column is the sector ETF's move at the book's weight in it — not the
book's own return in that sector.** Labelled on the panel, because the two are
easy to confuse and only one of them is what this column is.

**Book sector strings come from a different vendor than the ETF labels**, so
matching is normalised (`Cons. Discretionary`, `Consumer Discretionary` and
`Information Technology` all resolve) **and the misses are reported**: *"3.3% of
book unmatched (Unclassified, Widgets)"*. A partial match reads as a data gap
rather than as a join that did not land — this codebase's own finding from the
sector/theme overlap, applied before it could bite.

## Other rules

- **The latest estimate set, never a mix.** `book_factor_betas` is append-only
  and holds B0's set and C3's, keyed apart by `estimated_at` and `n_obs`.
  Mixing them quotes one estimate's market beta beside another's axes.
- **The residual band is absolute, not a quantile.** A quantile rule forces a
  fixed share of days to be "unusual" however the book behaved.
- **A book move of exactly 0.00% is a measurement** and survives; a *missing*
  one says so.
- **An em dash in a slot that looks like every other slot is indistinguishable
  from a measurement.** Caught in my own first render: with the gauge refused,
  `Book, today` showed `—` in a normal tile. Every refused reading now takes the
  absent treatment.

21 compute tests; 357 in the suite; `vite build` clean.
Screen: `docs/g6-book-vs-market.png`.
