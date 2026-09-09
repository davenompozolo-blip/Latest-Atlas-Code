# C3 — B0 re-estimation on the cleaned equity curve

**Applied 2026-09-09** to `vdmojjszvvcithuxwexx`.
Migration `20260909152200_c3_reestimate_book_factor_betas_excluding_stale.sql`.

> **Headline: no significance verdict changed.** `market` rises 0.968 → 1.026,
> `concentration` and `dollar` remain significant, `cyclical` and `alpha` remain
> not significant. `cyclical` moves *further* from significance, not toward it.
> **The A2 read design is unaffected; nothing here forces a stop.**

---

## 0. The control came first

The prior estimate was **reproduced from scratch before anything was changed**, so
that the two sets differ by the sample and nothing else.

Reproduction on all 174 observations agrees with the stored 2026-09-08 estimate to
**3.0e-12 on every coefficient** and 2.1e-10 on every t. That also settled an
ambiguity B0 had not written down: the market term is SPY **`adj_close`** log
returns, not `close`. Using `close` gives market 0.967107 / R² 0.771642 — close
enough to look right, wrong enough to invalidate a comparison. The two series
differ on only ~4 dates in the window, all dividend dates.

## 1. Sample

A return is kept only when **both** of its endpoints are settled levels.

Excluding only the three stale rows' own returns would leave the return *out* of
each one in the sample — and that one is a two-day move labelled as one day,
because the provider computes the next day's change against the carried level (C1
§C1.1). Six of the 174 returns touch a stale level, so **n = 168**.

The 2025-12-24/26 pair at exactly 100,000.00 is **not** excluded: it is a genuinely
flat, undeployed account, not a carried-forward level, and C1 leaves it `settled`.

Everything else is unchanged: frozen loadings, same standardisation baseline,
Newey-West (Bartlett) with lag ⌊4(T/100)^(2/9)⌋ = **4** at both T = 174 and T = 168.

## 2. Diagnostics

| | prior (n=174) | **C3 (n=168)** |
|---|---:|---:|
| n | 174 | **168** |
| R² | 0.770034 | **0.778110** |
| adjusted R² | 0.764591 | **0.772665** |
| Durbin–Watson | 2.133 | **2.059** |
| scaled condition number | 2.385 | **2.376** |
| NW lag | 4 | 4 |

R² rises because six observations that no factor could explain — three fabricated
zeros and three two-day moves — left the sample. DW moves toward 2, i.e. the mild
*negative* serial correlation B0 noted is slightly reduced. The scaled condition
number is essentially unchanged, so no collinearity was introduced. Report the
scaled figure, per B0: the raw one is dominated by units, not collinearity.

## 3. Betas, side by side

| factor | prior beta | prior NW SE | prior t | prior | **C3 beta** | **C3 NW SE** | **C3 t** | **C3** |
|---|---:|---:|---:|:--|---:|---:|---:|:--|
| `market` | 0.968233955 | 0.144441621 | 6.703 | **sig** | **1.026261531** | 0.148147570 | **6.927** | **sig** |
| `dollar` | −0.004759372 | 0.000460083 | −10.345 | **sig** | **−0.004763142** | 0.000471100 | **−10.111** | **sig** |
| `concentration` | 0.001205347 | 0.000390050 | 3.090 | **sig** | **0.001108816** | 0.000398215 | **2.784** | **sig** |
| `cyclical` | 0.000652950 | 0.000510552 | 1.279 | not sig | **0.000496310** | 0.000523605 | **0.948** | **not sig** |
| `alpha` | −0.000802145 | 0.000604167 | −1.328 | not sig | **−0.000917890** | 0.000634557 | **−1.447** | **not sig** |

## 4. Which significance verdicts changed

**None.** Explicitly, against the three stop conditions the brief named:

- `cyclical` did **not** become significant. t falls 1.279 → **0.948**, moving
  away from the threshold. The largest axis by variance explained still carries no
  measurable book exposure, and must still render as *"no measurable exposure"*
  rather than as a value.
- `dollar` did **not** lose significance. |t| = 10.111, essentially unmoved; its
  beta changes by 0.08%, the smallest move of the five.
- `concentration` did **not** lose significance. t falls 3.090 → **2.784** — a real
  narrowing but comfortably clear of 2.

`market` behaved as the brief predicted, moving toward 1: **1.026**, having been
attenuated by the fabricated zeros. B0 anticipated 1.015 from dropping the four
zero-return rows; the sensitivity check below lands on that number exactly.

### Sensitivity

Dropping only the three stale rows' own returns (n = 171) rather than all six
contaminated ones:

| factor | n=171 beta | n=171 t | verdict |
|---|---:|---:|---|
| `market` | **1.015047250** | 7.002 | sig |
| `dollar` | −0.004711191 | −10.460 | sig |
| `concentration` | 0.001123843 | 2.878 | sig |
| `cyclical` | 0.000536623 | 1.036 | not sig |
| `alpha` | −0.000940273 | −1.493 | not sig |

`market` = **1.015047**, reproducing B0's own predicted 1.015 to three decimals —
which is a useful confirmation that the mechanism is the one B0 identified.
**No verdict differs between the two exclusion rules**, so the conclusion does not
rest on the choice. The stricter rule (n = 168) is the one written to the table,
because a two-day move in a daily series is not a valid observation.

## 5. Axis and SPY correlations over the new window

Re-measured over the **C3 window (n = 168)**, not the full sample:

| | SPY | cyclical | concentration | dollar |
|---|---:|---:|---:|---:|
| **SPY** | 1.0000 | 0.3217 | **0.5861** | −0.3726 |
| **cyclical** | 0.3217 | 1.0000 | 0.0631 | 0.0126 |
| **concentration** | 0.5861 | 0.0631 | 1.0000 | **−0.3087** |
| **dollar** | −0.3726 | 0.0126 | −0.3087 | 1.0000 |

Every pair moves by **less than 0.008** against the prior window. B0's finding
stands unchanged and is worth restating: *"near-orthogonal by construction"* is a
full-sample property. Over 19 years the axis pairwise correlations are −0.046 /
−0.021 / −0.012; over this window `concentration`–`dollar` is **−0.309** and
`concentration`–SPY is **+0.586**. Harmless at a scaled condition number of 2.38,
but the design's justification does not transfer to an arbitrary sub-window.

## 6. Storage

`book_factor_betas` is append-only by trigger. The 2026-09-08 estimate is
**untouched**; the new set is a separate five rows. They are told apart by
`estimated_at` and by `n_obs` (174 vs 168).

There is no `logic_version` column on this table, so `n_obs` is the discriminator
a consumer should key on. A consumer wanting "current" should take
`max(estimated_at)`.

## 7. Gate

**Passed.** No verdict flipped, so Track A past A1 is not blocked by this result.

Standing caveat, unchanged from B0: these are **contemporaneous** exposures.
R² = 0.778 describes same-day co-movement; nothing here claims predictive power.

## Not done — deliberately

- C4 and C5 not started.
- No UI change; nothing consumes the new estimate set yet.
- The three stale levels were **not** recovered (C1 §C1.2), so those six returns
  are gone rather than corrected. If 2026-07-29 is later recovered, this
  regression should be re-run — it would restore two observations, one of them a
  ~−2% day against a −1.55% SPY session, which is exactly the kind of observation
  a market beta is estimated from.
