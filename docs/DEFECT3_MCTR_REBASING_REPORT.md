# Defect 3 — re-basing the verdict and segment risk layers on the Euler MCTR

**Status: applied 2026-09-21.** Closes the item
`docs/DEFECT3_MARGINAL_VOL_CONSUMER_AUDIT.md` left as the owner's call.

## What was wrong

`vw_risk_analysis.marginal_vol_contribution` is

```sql
(market_value / total_nav) * annual_vol        -- weight x annual vol
```

There is no covariance in it anywhere. It cannot express that adding to a name
which offsets the rest of the book *lowers* portfolio risk, and it has no Euler
additivity. B4 built the real derivative in `vw_book_mctr` (Euler residual
2.8e-17), and `vw_position_risk_thesis` already read it. The two nightly jobs
did not.

Both consumers compounded it by multiplying the column by weight again —
`atlas_write_verdicts` as `mvc * w_norm`, `atlas_write_segment_verdicts` as
`mvc * weight` — because each believed it held a partial derivative. The
2026-09-07 CLAUDE.md entry records that form being **checked before use**; the
check reached the wrong conclusion, and the product was `weight^2 * vol`: the
same dimensional error defect 2 found in `total_vol_annual`, arriving here
through a comment that asserted a form the column never had.

## What it cost

Measured against the 2026-09-18 book.

### A per-position rank error becomes a SIGN error once members are summed

The offsets that cancel inside a cluster are exactly what `weight x vol`
discards, so grouping does not average the error out — it concentrates it.

| | old | Euler |
|---|---:|---:|
| positions | 63 | 62 (IXC unpriced) |
| sum of shares | 1.0000000000 | 1.0000000000 |
| **negative** | **0** | **16** |

Largest moves: AMD 18.11% -> 14.27%, SNDK 3.14% -> 6.81%, MRVL 1.74% -> 4.74%.
Largest rank moves: ATAT 15 -> 57, INTU 25 -> 62, ABBV 24 -> 60, ADBE 31 -> 61,
JPM 10 -> 24, MRVL 13 -> 7.

### Five of seventeen themes flip sign

| theme | names | weight | written | Euler | Δ |
|---|---:|---:|---:|---:|---:|
| AI / accelerated compute | 10 | 24.0% | 54.95% | **64.71%** | +9.76 |
| Healthcare / defensives | 6 | 10.3% | 5.28% | **−0.98%** | −6.26 |
| International / EM ETFs | 7 | 10.3% | 9.16% | **15.27%** | +6.10 |
| Consumer / autos | 6 | 7.5% | 4.83% | 0.50% | −4.33 |
| Software / SaaS | 2 | 2.5% | 1.88% | **−1.82%** | −3.71 |
| Mega-cap platforms | 5 | 8.7% | 6.78% | 4.21% | −2.57 |
| Energy | 5 | 4.4% | 1.43% | **−0.22%** | −1.64 |
| Utilities / regulated | 1 | 1.1% | 0.26% | **−0.14%** | −0.40 |

**The defensive sleeves were published as risk consumers.** Healthcare at a
tenth of the book *offsets* risk — the one thing a defensive sleeve is bought to
do — and `weight x vol` is positive by construction, so it was structurally
incapable of reporting it.

BY BET: 44 segments, 14 negative, 16 moved more than 1pp, max 9.98pp.
BY THEME: 17 segments, 5 negative, 9 moved more than 1pp, max 9.76pp.

### Concentration was understated

`effective_bets` 3.263 -> **2.322**. Consistent with the rest: AI/compute rising
to 65% of risk means fewer effective bets, not more.

## What the fix rests on

Euler additivity, verified rather than assumed:

```
sum(risk_contribution_annual) over the book = 0.19996028
book_vol_annual                             = 0.19996028
residual                                    = 0.000000000000   (12 dp)
```

That is why the existing cross-row invariant survives untouched: cluster shares
still close to **1.0000000000** with 16 of the buckets negative.

It is also why `book_risk_daily`'s `(sum_contributions, residual)` pair becomes
an **identity** for the first time — `0.199960 = 0.193185 + 0.006775`, the
residual being exactly the contribution of the two names in the matrix that the
verdict layer does not rank. `sum_contributions` had been
`sum(mvc * cluster_risk_share)`: a per-position figure times a per-cluster
share, dimensionless, reconciling to nothing. Neither column has a live
consumer; they become meaningful regardless.

## Decisions worth recording

**The basis is declared on the row; `logic_version` is not bumped.** That string
is a parameter fingerprint — `v1:rho0.75:n5:mwr` names the peer threshold, the
cluster minimum and the return basis — and none of those changed. A bump would
assert a change that did not happen, the mirror of the error defect 2 avoided.
Checked before choosing: no consumer pins a version value. 1,006 + 531 existing
rows backfilled to `weight_x_vol_undiversified`, so the discontinuity is legible
at the row where it happens.

**Coverage is published, never renormalised away.** IXC has no pairs in the
correlation matrix at all. Under BY THEME the Energy sleeve reports **37.06% of
its weight unpriced** behind its −0.21% reading; under BY BET its singleton
carries weight 1.69% with a NULL share and a NULL basis rather than being
dropped or zeroed.

**Weight still comes from `vw_risk_analysis`.** Sourcing it from `vw_book_mctr`
too would have made an unpriced name vanish from `weight_share` as well, which
is not part of this change.

**`effective_bets` changed basis and is consumed.** `1/Σs²` over *signed* shares
is not the textbook HHI, which assumes non-negative weights. Σs² is 0.43 here so
the figure behaves, but a heavily hedged book could push it above 1 and drive
the result below 1 — a real reading, not a bug, and better known in advance.

## Two defects found on the way

### A live one: an enumerated-states CHECK is still NULL-permeable

Found by testing the constraints added for this work rather than reading them,
then asking whether the shape existed elsewhere.

```
vol_basis = NULL, total_vol_annual = 0.195, vol_matrix_as_of = NULL
  branch 1: (total_vol_annual IS NULL)                            -> FALSE
  branch 2: TRUE AND (NULL = 'weight_sq_undiversified') AND TRUE   -> NULL
  branch 3: TRUE AND NULL AND FALSE                                -> FALSE
  FALSE OR NULL OR FALSE  ->  NULL  ->  the CHECK PASSES
```

So `book_risk_daily` accepted a vol figure with **no basis at all** — exactly the
state `20260915074500` was written to forbid, and which CLAUDE.md records as
"now true rather than merely written down". It was not. Confirmed by UPDATE in a
rolled-back subtransaction, not by inspection.

**A CHECK passes on NULL.** Enumerating the permitted states is necessary and not
sufficient: the enumeration has to be *total*. All three constraints are now
`CASE` forms over `IS NULL` tests with `ELSE false`, which cannot yield NULL on
any input. 14 violating states refused, 0 wrongly accepted, nothing written.

Same family as PR #783's NaN finding — there a one-sided bound admitted a
sentinel sorting above every finite value; here three-valued logic admits a NULL
that short-circuits an OR chain. Both look correct on inspection; both are found
only by trying the value.

### Mine: a second overload instead of a replacement

`atlas_write_verdicts` takes **three** arguments. A first attempt assumed two and
`CREATE OR REPLACE` therefore created a second overload rather than replacing —
and a two-argument call would have resolved to it. Dropped within one call,
verified back to a single overload, redone against the real signature.

**Read `pg_get_function_identity_arguments` before `CREATE OR REPLACE`.** A
function is identified by its argument types, not its name.

## The client half

A signed share reached three surfaces that had never seen one.

- **The strip was a geometry that lies.** A stacked proportional band cannot
  carry negatives: the positives alone exceed 100% of the width, and
  `Math.max(0.15, share*100)` collapsed every negative to a hairline while the
  tooltip printed the negative number. Width is now share of **gross** risk,
  which is a genuine part-to-whole, and the caption states that basis.
- **Polarity is carried by texture, not colour.** Colour in that strip is
  already doing identity — hue is rank, and the row below reuses it so a reader
  can carry a segment from band to row. Hatch, plus a count in the caption, plus
  words in the tooltip: never colour alone, never texture alone.
- **`TwoBar` clamped a negative to zero width** while the label printed the
  negative number. Now `|value|`, hatched, with the row label switching to
  "offsets" so the reading never depends on spotting a minus sign.
- **An unmeasured segment sorted as zero** — above every genuine offset. Now
  last, with **no** strip width (absent, not 0), and counted.
- **The reading understated the best outcome.** Any negative is below
  `weightShare * 0.5`, so a sleeve that lowers book volatility fell through to
  "on a fraction of its risk". It now says "lowering its risk".

## Verification

- Euler residual over the book: **0.000000000000** (12 dp).
- Cluster shares: **1.0000000000** with 16 negative buckets.
- Both groupings' segment shares: **1.0000000000**.
- Both jobs run clean under a sentinel `logic_version` against the live book
  (61 position rows; 44 + 17 segment rows), then deleted.
- Both functions hash byte-for-byte to their migration files —
  `2870b327f8ef186b68347943153c59ce` and `90df447ba5208c95ef16eafc1e03f861`.
- 14/14 violating constraint states refused.
- 57 test files green; `vite build` clean.
- `segmentRiskBasis.test.mjs`: 7 of 10 fail on the pre-fix code, checked by
  reverting rather than assumed.

**Known gap.** The two function migrations were applied by asserted textual
patch through `execute_sql`, so they carry no `supabase_migrations` ledger row.
The files carry the full definitions and are proven identical to the live
objects by md5, and the gap is one-way and self-healing: a `db push` from a
clean checkout re-applies identical `CREATE OR REPLACE` text and the rows
appear. Recorded rather than left silent.
