# B1 · Factor model validation

Spec: `docs/B1_FACTOR_MODEL_VALIDATION_SPEC.md`. Master spec §7.
Run 2026-09-13 against project `vdmojjszvvcithuxwexx`.
Persisted: `book_model_diagnostics`, one row, `estimated_at 2026-09-13 11:31:57Z`.

**Headline: the defect B1 went looking for is not there, and a different one is.**

---

## 0 · Reproduced before re-measuring

C3's lesson, applied. The published estimate set (`estimated_at 2026-09-09`, n=168,
R² 0.778110) was rebuilt from scratch — ET-cast equity curve, C1 exclusions, SPY
`adj_close` log returns, daily axis scores, OLS with Newey-West errors — before
anything was computed on top of it.

| factor | reproduced | published | diff |
|---|---:|---:|---:|
| alpha | −0.00091789 | −0.00091789 | 4.4e-13 |
| market | 1.02626153 | 1.02626153 | 1.3e-13 |
| cyclical | 0.00049631 | 0.00049631 | 3.1e-13 |
| concentration | 0.00110882 | 0.00110882 | 1.6e-13 |
| dollar | −0.00476314 | −0.00476314 | 4.6e-13 |

Standard errors agree to 3.4e-13 and the Newey-West lag (4, from
⌊4(n/100)^(2/9)⌋) is recovered rather than assumed. That agreement is what makes
everything below a statement about the model rather than about my arithmetic.

It also re-confirms C3's input finding: running the same regression on SPY
`close` instead of `adj_close` gives market **1.02397** against the published
1.02626 — close enough to look like a successful reproduction, wrong enough to
invalidate every comparison drawn from it.

---

## 1 · Predicted volatility, and the split that matters

σ²_pred = βᵀΣβ + σ²_resid over the four factors (alpha carries no variance).

| component | daily σ | annualised | share of variance |
|---|---:|---:|---:|
| factor | 0.01463413 | **23.23%** | **77.4%** |
| residual | 0.00791007 | 12.56% | 22.6% |
| **total predicted** | 0.01663511 | **26.41%** | |

**77.4% of the book's predicted variance is factor, 22.6% residual.** The spec
flags the split as a finding in its own right, and this one is favourable: the
four factors describe most of the book's risk, so exposures-times-covariance is
a meaningful object rather than a rounding error around an idiosyncratic core.

## 2 · Realised volatility

On the C1-cleaned return series (`stale_snapshot` rows and the row after each
excluded — the two-day-move problem):

| measure | daily σ | annualised |
|---|---:|---:|
| full window | 0.01659001 | 26.34% |
| rolling 20d, mean | 0.01691567 | 26.85% |
| rolling 60d, mean | 0.01840730 | 29.22% |

Rolling 20d spans **13.09% to 42.68%** annualised. Hold that number.

## 3 · Bias ratio — and why the headline figure is vacuous

Full-window realised / predicted = **0.9973**.

**That number carries no information, and it is important to say so.** OLS
guarantees `var(y) = var(fit) + var(resid)` in sample, and σ_pred is built from
exactly those two pieces. Verified numerically to twelve decimal places:

```
var(y)              0.000275228351
var(fit)+var(resid) 0.000275228351
```

So a full-window bias ratio of ≈1 is an identity, not evidence the model is
correctly scaled. The spec's 0.8–1.2 band cannot be failed by this statistic.

The informative test is the **rolling** comparison — a constant predicted σ
against a realised vol that moves:

| | value |
|---|---:|
| mean of rolling 20d bias | 1.0169 |
| range of rolling 20d bias | **0.4958 – 1.6164** |
| 20d windows above 1.2 | 25.6% |
| 20d windows below 0.8 | 22.0% |
| **20d windows outside 0.8–1.2** | **47.6%** |
| mean of rolling 60d bias | 1.1065 |

**In plain language: the model's average scale is right and its timing is not.**
On nearly half of all 20-session windows the model is wrong by more than the
spec's own tolerance — understating risk a quarter of the time, overstating it a
quarter of the time. A single number tuned to the full window hides both.

---

## 4 · Residual diagnostics — ARCH first

| test | statistic | p | verdict |
|---|---:|---:|---|
| **ARCH-LM(5)** | 5.383 | **0.3709** | **not significant** |
| Ljung-Box ε² (10) | 11.409 | 0.3266 | not significant |
| Ljung-Box ε (10) | 27.474 | 0.0022 | significant — see below |
| Jarque-Bera | 85.275 | 3.0e-19 | **significant** |
| skewness | +0.5375 | | |
| excess kurtosis | **+3.3206** | | |

### ARCH is absent, and that is robust

The spec calls volatility clustering "the most likely failure". It is not
present here, and this does not rest on my lag choice — ARCH-LM and Ljung-Box on
ε² were run across lags 1 to 20:

```
  lag   ARCH-LM p   LB(e^2) p
    1      0.4676      0.4627
    2      0.4696      0.4417
    3      0.3689      0.3005
    5      0.3709      0.2350
    8      0.4911      0.2134
   10      0.6776      0.3266
   12      0.8012      0.4416
   15      0.8497      0.5461
   20      0.9663      0.7330
```

Not one value approaches significance. **Residual volatility does not cluster in
this sample.**

### The Ljung-Box hit on ε is an outlier artefact, not a missing factor

p = 0.0022 looks like the spec's "missing factor or lagged relationship". It is
not, on two grounds:

1. **It is carried by three days.** Dropping the three largest residuals takes it
   to **p = 0.2954**. The largest is 2026-03-18 at **5.0 σ**.
2. **The significant autocorrelations are at lags 6, 7 and 9** (+0.19, −0.23,
   −0.15) with nothing at lags 1–5. A missing factor or a lagged relationship
   shows up short; a scatter of mid-lags with no structure is what fat tails do
   to an autocorrelation estimate.

Reported, not suppressed — but it should not be read as a specification failure.

### The real defect is distributional

Excess kurtosis **+3.32**, skew **+0.54**, Jarque-Bera p = 3e-19, and a 5-sigma
day in a 168-day sample. The residuals are strongly fat-tailed and
right-skewed. **A Gaussian estimate of this book's risk will understate the
tail**, and that is a property of the distribution, not of its time variation.

---

## 5 · Stability

Halves of the estimation window, re-estimated with Newey-West errors.

| factor | h1 β | h1 se | h2 β | h2 se | 95% CIs |
|---|---:|---:|---:|---:|---|
| alpha | −0.001218 | 0.000975 | −0.000445 | 0.000740 | overlap |
| market | 1.052626 | 0.246593 | 1.151374 | 0.125358 | overlap |
| cyclical | 0.000052 | 0.000884 | 0.000172 | 0.000857 | overlap |
| concentration | 0.000366 | 0.000850 | 0.000901 | 0.000483 | overlap |
| dollar | −0.003701 | 0.000855 | −0.005523 | 0.000584 | overlap |

**All five confidence intervals overlap. No exposure is demonstrably unstable.**

Per the spec, this is judged on interval overlap and not on point estimates —
with n≈84 per half the standard errors are wide, and `dollar` moving −0.0037 →
−0.0055 would look like a large shift if read that way. It is not one, though it
is the narrowest margin in the table and the one to watch on the next re-estimate.

Half-window R² is 0.692 then 0.850. The model describes the second half of the
window considerably better than the first.

### Axis correlations do not transfer to sub-windows

| pair | full | half 1 | half 2 |
|---|---:|---:|---:|
| market / cyclical | 0.322 | 0.379 | 0.230 |
| market / concentration | 0.586 | 0.500 | 0.688 |
| market / dollar | −0.373 | −0.257 | −0.506 |
| cyclical / concentration | 0.063 | −0.052 | 0.200 |
| cyclical / dollar | 0.013 | 0.197 | −0.262 |
| **concentration / dollar** | −0.309 | **+0.062** | **−0.554** |

The design's "near-orthogonal by construction" claim is a **full-sample** property
of the 19-year PCA window and survives nowhere here. `concentration`/`dollar`
changes sign between halves, +0.06 to −0.55. `cyclical`/`dollar` does the same,
+0.20 to −0.26. Any B2 work that conditions the covariance on a sub-window must
estimate the correlations inside that window rather than inheriting them.

---

## 6 · What this is not

**Not an out-of-sample test.** With n = 168 there is no honest holdout: a
two-thirds/one-third split leaves ~56 test observations, which cannot
distinguish a good model from a lucky one. Everything above is in-sample
diagnostics and stability checks, and a model that passes in-sample has cleared
a low bar.

At ~252 observations a year, **n reaches 400 around 2027-07-27**. A genuine
holdout becomes meaningful then and not before.

---

## 7 · What this bounds for B2

The spec anticipated that ARCH would reframe B2's regime-conditional approach
from a refinement into a correction for a measured defect. **On this sample it
does not: ARCH is absent at every lag tested.** Reporting that plainly is the
point of the unit, and no threshold was moved to produce a more convenient answer.

B2 still has a case, but it now rests on two different findings:

1. **Realised book volatility is not stationary** — 13.1% to 42.7% annualised on
   a 20-session window, a 3.26× range, with 47.6% of windows outside the
   tolerance band. A single covariance estimated over the whole window is wrong
   roughly half the time. That is an argument for conditioning, and it comes
   from the *book's* volatility rather than from the residuals'.
2. **The residuals are fat-tailed and skewed**, so the distributional choice in
   B2 matters more than the covariance choice. A Gaussian CVaR on these
   residuals will understate the tail regardless of which window it is estimated
   over.

The second is the more actionable of the two, and it was not what B1 was
expected to find.

Two further constraints on B2 from §5: a sub-window covariance must be
re-estimated inside the window, not inherited; and `cyclical` remains
insignificant in both halves as well as in full (t 0.95 full; β 0.00005 and
0.00017 by half), so it carries no measurable book exposure at any point in
this sample.

---

## 8 · Acceptance

| # | Criterion | |
|---|---|---|
| 1 | Predicted volatility, factor and residual reported separately | ✓ 77.4% / 22.6% |
| 2 | Realised volatility on the cleaned series | ✓ 20d and 60d |
| 3 | Bias ratio as series and summary, direction stated | ✓ and the full-window figure's vacuity stated |
| 4 | Four residual diagnostics, ARCH first | ✓ plus lags 1–20 robustness |
| 5 | Split-sample stability with SEs, overlap per exposure | ✓ all five overlap |
| 6 | Sub-window axis correlations re-measured | ✓ two change sign |
| 7 | `book_model_diagnostics` row written, append-only proven | ✓ UPDATE, DELETE and unknown-estimate-set all refused |
| 8 | In-sample limitation stated | ✓ §6 |
