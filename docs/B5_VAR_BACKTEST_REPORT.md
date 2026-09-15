# B5 · VaR backtest — what the Gaussian assumption actually costs

**Run 2026-09-15.** `as_of` 2026-09-14, `cvar_as_of` 2026-09-14, betas from the
C3 estimate set (`estimated_at` 2026-09-09, n 168, R² 0.778). Model leg 3,370
sessions (2013-04-22 → 2026-09-14), book leg 172 (2025-12-26 → 2026-09-11).
24 rows in `var_backtest_runs`, written in 807 ms.

E3/B2 publishes a parametric VaR and says in its own table comment that it
"understates a fat tail by construction". B5 measures by how much, and finds
that the Gaussian assumption is the *smallest* of three separate problems.

---

## 1. Two legs, kept apart

| leg | series | n | what it isolates |
|---|---|---|---|
| `model` | b′x_t over the z-complete factor panel | 3,370 | the **distributional** assumption — is the Gaussian quantile right for the modelled return? |
| `book`  | realised equity log return, settled only | 172 | the **whole chain** — and it fails for two reasons the model leg cannot see |

Folding them into one number would report one failure as the other. The book
leg is scoped to the sessions the panel also covers, so its conditional and
unconditional rows share one denominator.

The realised series comes from the new `vw_book_realised_returns`, which
applies C1's two rules once instead of leaving each consumer to re-derive them:
the New York session date rather than the UTC cast, and **both** endpoints
settled, because the return *out* of a carried level is as fabricated as the
return *into* it.

---

## 2. The Gaussian tail — thin shoulders, fat tails, crossing at 95%

Model leg, unconditional:

| conf | expected | observed | rate | Kupiec LR | p | verdict |
|---|---:|---:|---:|---:|---:|---|
| 0.90 | 337.0 | **265** | 7.86% | 18.309 | 1.9e-05 | reject — **too few** |
| 0.95 | 168.5 | 169 | 5.01% | 0.002 | 0.964 | pass |
| 0.99 | 33.7 | **56** | 1.66% | 12.429 | 4.2e-04 | reject — **too many** |

**The 95% pass is a crossing point, not a validation.** The two levels that have
power both reject, in *opposite directions*: the bound is too conservative at
90% and too permissive at 99%. That is the signature of a leptokurtic
distribution sitting under a normal quantile, and 95% is simply where the two
curves cross. Reading the 95% row alone would certify the exact assumption the
other two rows refute.

Realised CVaR exceeds predicted at every level and on every basis — **1.13× to
1.23×** on the model leg, **1.25× to 1.27×** on the book leg. So E3's note is
right in direction and now has a magnitude: *the parametric CVaR understates the
conditional tail loss by 13–27%.*

---

## 3. Regime conditioning does not fix it, and on the book it makes it worse

Exceptions at 0.99, conditional on each axis's own published bucket vol:

| basis | model leg (exp 33.7) | book leg (exp 1.72) |
|---|---:|---:|
| unconditional | 56 | 8 |
| `cyclical` | 58 | **11** |
| `concentration` | 55 | **9** |
| `dollar` | 55 | **10** |

On the model leg conditioning is a wash — the miscalibration is in the *shape*
of the distribution, not in the level of the variance, and changing which
variance you use per session cannot repair a shape.

On the book leg it is actively worse, and the mechanism is measurable. The
buckets are quartiles of a **13-year** z distribution, and the recent 172
sessions land disproportionately in the quiet ones: 76 of 172 fall in
`cyclical` q4, whose bucket vol (0.010428) is the **lowest of the four**. So the
conditional bound was *lowered* during precisely the window in which the book
ran hot. `sd_pred_daily` on that row is 0.011365, the lowest of any row in the
table, and it carries the most exceptions of any row in the table.

**A conditional bound calibrated on a long history is not conditional on
today.** It is conditional on where today sits in a distribution the book never
lived through.

---

## 4. The book leg fails for two reasons that are not the tail at all

Book leg, unconditional — every level rejects:

| conf | expected | observed | rate | LR | p |
|---|---:|---:|---:|---:|---:|
| 0.90 | 17.20 | 27 | 15.70% | 5.384 | 0.020 |
| 0.95 | 8.60 | 18 | 10.47% | 8.341 | 0.0039 |
| 0.99 | 1.72 | 8 | 4.65% | 12.268 | 4.6e-04 |

Two to four-and-a-half times the exceptions it should have. The cause is not
kurtosis; it is that the predicted sd is simply too small:

| | daily sd |
|---|---:|
| realised book, over the window | 0.0165299 |
| factor part b′x, over the window | 0.0145468 |
| idiosyncratic residual, over the window | 0.0077551 |
| **E3's published prediction** | **0.0120224** |

Decomposing the 1.3749× understatement:

- **1.2100× — Σ is a full-history average, not a current one.** The factor
  return itself ran 21% hotter over these 172 sessions than over the 13 years
  the covariance was estimated on.
- **1.1332× — b′Σb carries no idiosyncratic variance at all.** 22.0% of book
  variance has no representation in the factor model, so it is missing from the
  risk number by construction, not by estimation error.
- Product 1.3712, against an observed 1.3749. The 0.27% gap is the small
  non-orthogonality of the residual to the factors over 172 sessions when the
  betas were fitted on 168 — `sqrt(f² + r²)` is 0.0164848 against a realised
  0.0165299.

Both are *structural*, and neither is visible from inside the model leg, which
is exactly why the two legs exist.

---

## 5. What this licenses and what it does not

- E3's numbers are **not wrong**; they are a factor-model VaR and they measure
  what a factor-model VaR measures. What B5 establishes is the size of the gap
  between that and the book's actual loss distribution: roughly **1.37× on the
  bound** and a further **1.13–1.27× on the tail beyond it**.
- **Do not fix this by scaling.** A multiplier applied to `vol_daily` would
  paper over three different causes with one number and would be recalibrated
  by every change in any of them. The honest fixes are separable: add a residual
  variance term, and shorten or weight the covariance window. Both are their own
  decision, and B3 (reverse stress) rests on Σ, so it inherits this and should
  say so on its own output.
- **B3's labelled unconditional reference row is now better motivated than when
  it was agreed.** Section 3 shows the conditional bound can be the *looser* of
  the two on a live book; a reader comparing against an unconditional reference
  can see that, and a reader given only the conditional number cannot.
- The **90% level must not be dropped** for looking well-behaved on the book
  leg. It is the level that catches over-conservatism, and on the model leg it
  is the strongest rejection in the table.

## 6. Provenance

`var_backtest_runs` is append-only by trigger and carries `cvar_as_of` and
`betas_estimated_at` beside every reading, so a row says which covariance
snapshot and which exposure set it graded. `kupiec_reject_05` and
`kupiec_reject_01` are bound by CHECK to `kupiec_lr`, so a surface cannot be
handed a verdict that disagrees with its own statistic.

No p-value is stored. Postgres has no error function, and an approximation
would be a number nobody could audit; the LR and the two exact χ²(1) thresholds
are stored instead. The p-values in this report were computed from the stored
LR.

Nightly at **23:50 Mon–Sat** (cron job 48), five minutes after
`atlas_write_regime_cvar` produces the snapshot it grades.

`supabase/tests/var_backtest_invariants.sql` — twelve refusals and four
acceptances, including the zero-exception row: "no session breached the bound"
is a legitimate result, not a malformed one.
