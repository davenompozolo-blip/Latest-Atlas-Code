# Phase B0 — Factor exposure acceptance report

Date: 2026-09-08 · Supabase project `vdmojjszvvcithuxwexx` (the platform)

All five acceptance criteria are met. **Three of the four exposures are
statistically significant; `cyclical` is not, and neither is alpha.**

---

## The gate first: which betas are NOT significant

The spec makes this the gate, so it leads.

| factor | β | Newey-West SE | t | verdict |
|---|---:|---:|---:|---|
| **cyclical** | +0.000653 | 0.000511 | **+1.28** | **NOT SIGNIFICANT — must render as "no measurable exposure"** |
| **alpha** | −0.000802 | 0.000604 | **−1.33** | **NOT SIGNIFICANT — no measurable daily alpha** |

`cyclical` must not be presented downstream as an exposure. It is the largest
axis by variance explained (29.1% of ratio-space variance) and the book still
has no measurable loading on it — a real and useful negative result, not a gap.

Alpha being indistinguishable from zero is the expected and healthy finding at
n=174; a significant daily alpha on this sample would be more suspicious than
reassuring.

## The full beta table

Window 2025-12-26 → 2026-09-04, n = 174, Newey-West lag L = 4.

| factor | β | SE (NW) | t | significant | β × 1sd (bp/day) |
|---|---:|---:|---:|:--:|---:|
| market | 0.968234 | 0.144442 | 6.70 | ✅ | +81.0 |
| concentration | 0.001205 | 0.000390 | 3.09 | ✅ | +25.8 |
| dollar | −0.004759 | 0.000460 | −10.34 | ✅ | −71.5 |
| cyclical | 0.000653 | 0.000511 | 1.28 | ❌ | +7.2 |
| alpha | −0.000802 | 0.000604 | −1.33 | ❌ | — |

Market beta is **0.97 — essentially one**. The book's annualised vol is 26.1%
against SPY's 13.3%, so the extra volatility is not market leverage; it is the
factor and idiosyncratic terms.

**The `dollar` axis is nearly as economically large as the market.** A 1-sd
dollar-strength move costs 71.5 bp/day against the market's 81.0 bp. That is
the headline result and it deserves suspicion as well as attention: `dollar` is
the axis A1 flagged **marginal** (eigenvalue 1.1349 against an MP edge of
1.0972). A component that barely cleared the noise edge is carrying the
second-largest exposure in the book.

## Diagnostics

| | |
|---|---|
| R² | 0.770034 |
| adjusted R² | 0.764591 |
| condition number (Belsley, unit-scaled columns) | **2.385** |
| condition number (raw, unscaled) | 365.897 |
| Durbin-Watson | **2.133** |
| residual ρ(1) | −0.067 |
| book-return ρ(1) | −0.074 |
| Newey-West lag | L = 4, from ⌊4(T/100)^(2/9)⌋ at T=174 |

The scaled condition number of 2.385 is low: **no multicollinearity problem.**
Report the scaled figure, not the raw 365.9 — the raw number is dominated by
the intercept column and the ~250× scale difference between SPY returns (~1e-2)
and axis scores (~1e0), which is units, not collinearity.

**Newey-West was verified, not assumed.** The hand-rolled HAC estimator agrees
with `statsmodels` `HAC(maxlags=4, use_correction=False)` to **1e-7** on every
coefficient and standard error, and on R², adjusted R², Durbin-Watson and the
condition number.

### The spec's autocorrelation premise was backwards, and HAC still mattered

The spec expected positive autocorrelation inflating t-stats. The book's daily
returns are in fact **mildly negatively** autocorrelated (ρ(1) = −0.074,
DW = 2.13). HAC was still the right call, but for a different reason — it
widened the market standard error by 45%:

| factor | SE (OLS) | SE (NW) | NW/OLS | t (OLS) | t (NW) |
|---|---:|---:|---:|---:|---:|
| market | 0.099637 | 0.144442 | **1.45** | 9.72 | 6.70 |
| concentration | 0.000357 | 0.000390 | 1.09 | 3.37 | 3.09 |
| dollar | 0.000443 | 0.000460 | 1.04 | −10.74 | −10.34 |
| cyclical | 0.000588 | 0.000511 | 0.87 | 1.11 | 1.28 |

**No significance verdict changes** under either estimator. But OLS would have
reported the market beta as 45% more precise than it is.

---

## Findings that need a decision

### 1. The loadings were reproduced, not supplied — and the reproduction is exact

The spec gives `variance_explained` but not the eigenvectors, and A1 ran outside
CC. The loadings were therefore re-derived from `market_prices` and checked
against the spec's own numbers:

| | PC1 | PC2 | PC3 | PC4 |
|---|---:|---:|---:|---:|
| eigenvalue | 3.198906 | 2.145653 | 1.134939 | 1.014445 |
| variance explained | 0.290810 | 0.195059 | 0.103176 | 0.092222 |
| **spec** | **0.291** | **0.195** | **0.103** | — |
| above MP edge (1.0972) | yes | yes | yes (barely) | **no** |

Three components clear the edge and the fourth does not, exactly as specified.
Setup: 11×11 correlation matrix of daily log returns, `cper_gld` excluded,
2007-04-12 → 2026-09-04, **4,882 balanced observations, no gaps**. All three
loading vectors are unit-norm to 12dp and mutually orthogonal to ~1e-16.

### 2. The sign convention cannot be verified against A1 — please confirm

An eigenvector is defined only up to sign, and `variance_explained` is
sign-invariant, so **A1's orientation is not recoverable from the spec.** Each
axis is oriented to point toward the thing it is named for:

| axis | vs raw PC | up means | dominant loadings |
|---|---|---|---|
| `cyclical` | as computed | cyclicals & credit over defensives & gold | xli_xlu +0.405, xle_xlu +0.370, xly_xlp +0.370, hyg_tlt +0.368, gld_spy −0.350 |
| `concentration` | **negated** | leadership narrowing to mega-cap tech | qqq_spy +0.546, dia_spy −0.472, rsp_spy −0.466, xly_xlp +0.322 |
| `dollar` | **negated** | dollar strength | gld_spy −0.504, iwm_spy −0.472, eem_spy −0.427, hyg_tlt +0.371 |

Raw PC2 points toward *breadth* and raw PC3 toward a *weak* dollar; both were
flipped so the name and the direction agree. The orientation is stated in each
row's `label` so a loading is never read without it.

**Nothing in acceptance depends on this.** R², adjusted R², condition number,
Durbin-Watson and every |t| are sign-invariant. Flipping an axis flips only the
sign of its own loadings and its own beta. If A1 used the opposite convention
for either flipped axis, say so and it is a one-line update.

### 3. Four book returns are exactly zero because the equity level was carried forward

Four consecutive equity levels are **bit-identical**, so the log return is
exactly 0.00000000:

| date | equity (both days) | SPY that session |
|---|---:|---:|
| 2025-12-26 | 100,000.00 | −0.01% |
| 2026-01-15 | 102,011.43 | +0.27% |
| 2026-05-04 | 100,608.54 | −0.37% |
| **2026-07-29** | **92,517.32** | **−1.55%** |

A deployed book cannot be exactly flat through a −1.55% session. These are
stale snapshots, and they attenuate the market beta toward zero. Estimated on
the full sample as the spec requires; the sensitivity is:

| | market β | R² | conclusions |
|---|---:|---:|---|
| full (n=174) | 0.968 | 0.770 | as reported |
| ex-stale (n=170) | **1.015** | 0.777 | **unchanged** — same three significant, same two not |

Market beta rises 4.8% once they are dropped. No significance verdict moves.
Worth fixing in the equity-curve writer; it does not change any B0 conclusion.

### 4. "Near-orthogonal by construction" holds full-sample, not in this window

The spec's justification for the design is that the axes are near-orthogonal.
Over the estimation window they are. Over the 174-day regression window they
are not:

| correlation | full sample (n=4,133) | regression window (n=174) |
|---|---:|---:|
| cyclical–concentration | −0.046 | +0.071 |
| cyclical–dollar | −0.021 | +0.011 |
| concentration–dollar | −0.012 | **−0.312** |
| concentration–SPY | — | **+0.592** |
| dollar–SPY | — | −0.378 |

Orthogonality is a property of the 19-year eigen-decomposition, not a guarantee
in any short sub-window. The scaled condition number of 2.385 says it is not
damaging here — but the design's headline claim should not be quoted as if it
held in-sample.

---

## What was built

| object | what |
|---|---|
| `factor_axes` | 3 rows; `label` states orientation; `marginal` flags `dollar` |
| `factor_axis_loadings` | 33 frozen eigenvector elements, unit-norm, orthogonal |
| `factor_pair_zscores` | 45,463 rows — per-pair z with the **stored** trailing-5y mean and sd |
| `factor_axis_scores` | 12,399 rows, 2010-04-01 → 2026-09-04, daily + 20d + 60d cumulative |
| `book_factor_betas` | 5 rows, append-only, **enforced by trigger** |
| `atlas_refresh_factor_scores()` | inserts missing dates only; never rewrites a stored baseline |

Score-series sanity: realised sd 1.714 / 1.669 / 1.073 against √eigenvalue
1.789 / 1.465 / 1.065 — the gap is rolling vs full-sample standardisation.
60d cumulative is NULL for exactly the 59-day warm-up × 3 axes = 177 rows.

Constraints carry the invariants rather than leaving them to convention:
`significant` cannot disagree with `t_stat`; a z-score cannot be stored off a
baseline under 750 observations; an axis score cannot be stored off fewer than
11 pairs. The append-only trigger was **proved** by forcing an UPDATE and a
DELETE and requiring both to be refused, not merely assumed.

## Not done — deliberately

- **No stressed CVaR, reverse stress testing, MCTR, hedging or UI** — B2–B4.
- **No nightly job.** B0 is persist-and-estimate; the score tables are current
  to 2026-09-04. Wiring `atlas_refresh_factor_scores()` into the 22:50 chain
  after `sync_market_series_daily` is the obvious next step but is not B0 scope.
- **`cper_gld` remains excluded**, per the A1 result.

## Follow-ups

1. **Confirm the sign convention** on `concentration` and `dollar` (finding 2).
2. **Fix the equity-curve writer** so a stale snapshot is not emitted as a
   settled level (finding 3).
3. Treat `dollar` betas with the suspicion its `marginal` flag implies — it is
   carrying the second-largest exposure in the book off the weakest component.
4. These are **contemporaneous** exposures, not forecasts. R² = 0.77 describes
   same-day co-movement; nothing here claims predictive power.
