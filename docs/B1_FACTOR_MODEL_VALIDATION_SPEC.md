# B1_FACTOR_MODEL_VALIDATION_SPEC.md

Handoff spec for CC. Master spec §7. Depends on B0/C3 only — **can start immediately.**

**Scope:** establish whether the factor model describes the book's risk well enough for
anything to be built on top of it.

**Out of scope:** VaR forecasting, CVaR, stress testing, any surface. B1 produces a report
and a table, not a page.

Project: `vdmojjszvvcithuxwexx`.

---

## 1 · Why this exists, and why it comes before B2

B2 through B5 all rest on one assumption: that

```
r_book,t = α + β_mkt·r_SPY,t + β_cyc·A_cyc,t + β_con·A_con,t + β_dol·A_dol,t + ε_t
```

captures enough of the book's risk that exposures times a factor covariance is a usable
estimate of portfolio risk. **Nothing has tested that.** R² = 0.778 says the model explains
same-day co-movement; it says nothing about whether predicted volatility matches realised
volatility, which is the property B2 actually needs.

This is the cheapest unit on the risk track and the only one that tells you whether to
believe the others. It is also the answer to "how do you know your risk model works", a
question most people answer with vibes.

**B1 does not gate B2.** A poor result bounds how much weight B2 and B3 can carry; it does
not stop them being built. Report it prominently either way (master spec §9.4).

---

## 2 · Predicted versus realised volatility

### 2.1 — Predicted
From the latest `book_factor_betas` estimate set (C3, n=168):

```
σ²_pred = βᵀ Σ β + σ²_resid
```

where `β` is the four-factor exposure vector (market, cyclical, concentration, dollar), `Σ`
is the factor covariance matrix over the estimation window, and `σ²_resid` is the residual
variance from the regression.

Report the two components separately. **The split is itself a finding**: a book whose
predicted risk is mostly residual is not well described by these factors, whatever the R²
says.

### 2.2 — Realised
Rolling realised volatility of book log returns — 20-session and 60-session windows — over
the estimation window, excluding rows where `data_quality = 'stale_snapshot'` and the row
immediately following one (the C1 two-day-move problem).

### 2.3 — Bias ratio
`realised / predicted`, reported as a time series and as a single figure over the window.

- ≈ 1.0 — the model's scale is right
- \> 1.2 — the model **understates** risk; everything downstream is optimistic
- < 0.8 — the model overstates risk

State the direction in plain language in the report, not just the number.

---

## 3 · Residual diagnostics

On the regression residuals `ε_t`:

| Test | What it catches | Why it matters here |
|---|---|---|
| Ljung-Box on `ε` | autocorrelation in residuals | a missing factor or a lagged relationship |
| Ljung-Box on `ε²` (ARCH) | volatility clustering | **the most likely failure.** Constant-variance assumptions break exactly when risk matters |
| Jarque-Bera | non-normality | fat tails that a Gaussian estimate will miss |
| Skewness, excess kurtosis | shape of the tail | feeds the B2 distributional choice |

Report the ARCH result first. If residual volatility clusters, B2's regime-conditional
approach is not an optional refinement — it is the correction for a defect this test found,
and that is worth saying explicitly in the report.

---

## 4 · Stability

The betas are estimated over one window. Test whether they hold within it.

Split the sample in half, re-estimate on each half with Newey-West errors, and report the
four exposures side by side with their standard errors.

**Do not conclude instability from a point-estimate difference alone** — with n≈84 per half
the standard errors will be wide. The test is whether the halves' confidence intervals
overlap. Say which do and which do not.

Also re-measure the pairwise correlations of the three axis scores and SPY **within each
half**. The full-sample near-orthogonality does not transfer to sub-windows: over the 174-day
window `concentration`–SPY was +0.592 (master spec §10.4).

---

## 5 · What this is not

**This is not an out-of-sample test.** With 168 observations there is no honest holdout: a
two-thirds/one-third split leaves ~56 test observations, which cannot distinguish a good
model from a lucky one. Everything above is in-sample diagnostics and stability checks.

**Say so in the report.** A model that passes in-sample diagnostics has cleared a low bar,
and the report must not imply otherwise. Genuine out-of-sample validation becomes possible
as history accumulates; note the date at which n reaches ~400 and a holdout becomes
meaningful.

---

## 6 · Persist the result

`book_model_diagnostics`, append-only, one row per run:

`estimated_at`, `betas_estimated_at` (FK to the estimate set tested), `window_start`,
`window_end`, `n_obs`, `sigma_pred`, `sigma_pred_factor`, `sigma_pred_residual`,
`sigma_realised_20d_mean`, `sigma_realised_60d_mean`, `bias_ratio`, `ljung_box_p`,
`arch_lm_p`, `jarque_bera_p`, `skew`, `excess_kurtosis`, `notes`.

Append-only by trigger, as `book_factor_betas` is. Every future re-estimate gets its own
diagnostics row, so model quality becomes a series rather than a one-off claim.

---

## 7 · Acceptance

1. Predicted volatility computed, factor and residual components reported separately.
2. Realised volatility series computed on the cleaned return series.
3. Bias ratio reported as a series and a summary figure, with its direction stated.
4. All four residual diagnostics run, ARCH reported first.
5. Split-sample stability reported with standard errors and overlap stated per exposure.
6. Sub-window axis correlations re-measured.
7. `book_model_diagnostics` row written; append-only proven.
8. The in-sample limitation stated in the report.

**Report back:** the bias ratio and what it implies for B2, the ARCH result, and which
exposures are stable across halves. If the bias ratio is outside 0.8–1.2 or ARCH is
significant, say plainly what that bounds — do not soften it, and do not adjust the model
to improve the number. A finding here is the point of the unit.
