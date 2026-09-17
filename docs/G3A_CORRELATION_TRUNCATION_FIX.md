# The Trade ticket's risk numbers were computed on an empty correlation matrix

*2026-09-17. Found while looking for a substrate for G-3's "what would adding
this do to the book" drawer.*

## The finding

`loadRiskLayer` read `universe_correlations` with **no filter and no paging**:

```js
sb.from('universe_correlations').select('symbol_1, symbol_2, correlation, …')
  .eq('as_of_date', date).eq('window_days', window)
```

That table holds **88,408 rows for a single date**. PostgREST answered
`HTTP 206` with `content-range: 0-999/88408`, the client never looked, and the
browser held **1.13% of the matrix**.

Which 1.13% is the part that matters. There is no `.order()`, so the rows are
whatever Postgres returns in physical order — and measured against the live
book on 2026-09-16, **not one of them was a held-to-held pair**:

| | rows returned | held-to-held pairs | pairs the book needs |
|---|---:|---:|---:|
| old read | 1,000 | **0** | 2,016 |
| new read | 2,016 | 2,016 | 2,016 |

So every pair fell through `covarianceMatrix`'s `fallbackRho: 0` and Pane B's
covariance matrix was **entirely diagonal**.

## What that did to the numbers

Run through the repository's own `covarianceMatrix` and `portfolioVol`, on the
live book:

| | book vol |
|---|---:|
| what the ticket published | **6.53%** |
| paged, `correlation_simple` | **17.61%** |
| paged, `correlation` (EWMA) | 16.60% |
| undiversified Σ wᵢσᵢ | 37.47% |

**A 2.70× understatement**, and worse than the 2.4× `total_vol_annual` defect
already on record. 17.61% is corroborated: `vw_book_mctr` gives 19.37% and E3's
factor model 19.08%, on different dates and different weights.

Every derived figure inherited it — incremental vol, resulting vol,
`riskPerThousandBps`, VaR before and after, `incrementalVaR`, `mctrPositionPct`.
`effectiveExposure` too: with 162 of 88,408 rows touching a held name at all,
the ρ ≥ 0.75 peer search found almost nothing, so the pane could report no
correlated exposure on a book full of semiconductors.

**Portfolio beta is the one figure that was fine.** It is Σ wᵢβᵢ and needs no
correlations, so it is still published when the rest is withheld.

## Three things this is a repeat of

**The 1,000-row cap, fifth layer.** Already recorded for `api/nexus-bench.js`,
`api/nexus-theme.js`, `performance-suite.js` and the pair explorer. Here it
arrived in the trade data layer. `limit` is a request; so is *no* limit.

**`symbols` was accepted and silently ignored.** The function signature has
carried `{ symbols = null }` since it was written and the body never referenced
it. The parameter that would have fixed this was already there.

**A flag beside a number nobody checks is not a safeguard.** Pane B *already*
printed "X% of the covariance matrix had no correlation on file … therefore a
floor, not an estimate" — which would have read *100%* — and published the
numbers underneath it anyway.

## The fix

**`symbols` is now required.** Not a convenience: the full matrix cannot be read
in one request, and a caller that does not say what it needs cannot be served
correctly. With no symbols the function returns `available: false` with a reason
rather than a `rho` of `() => null`, because `covarianceMatrix` reads a null as
*uncorrelated* and would reproduce the exact defect.

**Both sides filtered, then paged.** `symbol_1 IN (set) AND symbol_2 IN (set)`
is exactly the matrix over that set. 66 names is 2,016 pairs — **three
requests**, and far cheaper than asking for all 88,408.

**`correlation_simple`, never `correlation`.** B4's rule: the EWMA column is
λ=0.97, an effective sample of ~33 sessions, and reaches ±0.9997 on this book —
incoherent beside a 120-day sample vol. This is **not** a silent re-basing of a
working figure: under the truncation, none of the book's pairs were present
under *either* column. `rhoEwma` is exposed separately.

**The risk block is withheld below 90% coverage.** `covarianceCoverage` is now
read rather than merely annotated. The threshold is a judgement and is *not*
quoted as though measured — the observed coverage is printed with the refusal
instead, because the honest denominator is weight rather than pair count and
Pane B's inputs do not carry a per-pair weight.

The refusal says *"the diversified-away floor"*, not *"an understatement"*:
6.53% is not a low estimate of 17.61%, it is the answer to a different question.

## Proof

`.g3verify/prove.mjs` replays both reads against live PostgREST and runs both
through the shipped arithmetic. Not inspection:

```
OLD read  status 200  rows 1000  content-range 0-999/*
NEW read  rows 2016  in 3 page(s)
held-to-held pairs available:  OLD 0   NEW 2016   needed 2145

OLD (truncated, EWMA)              vol 6.53%   coverage 0.0%   (0/2016)
NEW (paged, correlation_simple)    vol 17.61%  coverage 100.0% (2016/2016)

understatement factor: 2.70x
gate: OLD REFUSES   NEW PUBLISHES
```

`totalPairs` is 2,016 rather than 2,145 because `covarianceMatrix` only counts a
pair when both legs carry a vol; two of the 66 held names do not. Coverage is
therefore 100% of what is measurable, and the gate passes on the real book —
which is the point of checking it against the live data rather than a fixture.

`src/lib/trade/covarianceCoverage.test.mjs` — 8 tests, including the shipped
truncation state, the happy path (a wall of refusals that also refuses healthy
data is worse than none), and the distinction between *coverage not measured*
and *coverage fine*.

## Not fixed, deliberately

`loadBook()` reads `positions` at `max(as_of_date)` rather than
`vw_positions_current`. That was a live phantom until `sync_alpaca_positions`
v10 shipped its reconciling delete on 2026-09-15; it is correct today and is a
reader worth migrating on its own terms, not inside a risk fix.
