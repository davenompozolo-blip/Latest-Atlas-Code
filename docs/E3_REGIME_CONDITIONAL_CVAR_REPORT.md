# E3 / B2 — regime-conditional stressed CVaR

Master spec §6 E3 and §7 B2. Applied 2026-09-14 to `vdmojjszvvcithuxwexx`.

> **Headline: the book carries 26% more risk when risk appetite is falling than it does
> on average, and the mechanism is measurable rather than assumed — the factors stop
> diversifying each other.** Market-to-axis correlation runs 0.66 in the worst quartile
> against 0.47 in the best.

---

## 0 · The control came first

`book_factor_betas` stores exposures. It does **not** store the panel those exposures were
fitted against — B0 and C3 both computed their regressors outside the database and inserted
only coefficients. E3 multiplies those exposures by a covariance, and that product is
meaningless unless the covariance is in the same units.

So the panel was pinned by reproduction before anything was built on it:

```
var(b · x) / var(book return)   0.778109716986
C3 stored r_squared             0.778109716915
                                ----------------
                                diff 7.1e-11,  n = 168 exactly
```

Neither side was fitted to that ratio. It holds only if the panel is `market` = SPY
**`adj_close`** log returns and the axes are the **raw daily `score`** — not `close` (which
gives market 0.967 against the published 1.026) and not a cumulative score column. The check
is the first assertion in `supabase/tests/regime_cvar_invariants.sql` so a future change to
the panel fails loudly instead of silently re-denominating every CVaR downstream.

---

## 1 · Two decisions that are not obvious

### 1.1 Shrink the correlation matrix, not the covariance

Ledoit-Wolf's usual target is a scaled identity, which assumes the variables are
commensurate. **These are not.** SPY log returns have sd ≈ 0.011; the axis scores 1.07–1.71.
A factor of ~150.

Run literally on the raw covariance, the intensity is dominated by the axis–axis pairs —
purely because they are largest in absolute size — and those pairs are near-zero **by
construction**, because the axes are PCA components. Measured, across the four concentration
buckets:

```
delta-hat (raw covariance)     1123 · 308 · 212 · 110      → all clip to 1
delta-hat (correlation scale)  0.023 · 0.038 · 0.037 · 0.074
```

Clipping to 1 would zero **every** off-diagonal, including market–concentration at ρ = +0.45.
A scalar shrinkage cannot serve a factor set that is deliberately orthogonal in one block and
correlated in another; standardising first is what makes one intensity defensible across both.

### 1.2 Bucket on `score_20d_z`, never `score_20d`

Recorded twice already in this codebase: `score_20d` is a rolling 20-session **sum** whose sd
runs 4.19–8.22, not a sigma level. A bucket edge defined on the sum would mean a different
thing in 2013 than in 2026. The cost is history — z starts **2013-04-22** (3,369 sessions)
against 2010-04-05 for the raw scores (4,136) — and it is worth paying.

### 1.3 The spec's arithmetic is corrected, not quoted

§6 E3 says *"2007 onward, ~4,800 sessions… four buckets gives ~1,200 sessions each."* The
axis history begins **2010-04-05** and the z history **2013-04-22**, so four buckets give
**842** each. Still comfortably clear of the spec's own 250 floor, so nothing is blocked.

---

## 2 · Results

Unconditional, on the identical 3,369-session sample: **19.08%** annualised, CVaR₉₅
**2.480%/day**.

| bucketing axis | bucket | z range | n | ann. vol | CVaR₉₅ daily | vs uncond. |
|---|---|---|---:|---:|---:|---:|
| `cyclical` | q1 | −7.23 … −0.55 | 843 | **24.00%** | **3.119%** | **1.258** |
| | q2 | −0.55 … 0.05 | 842 | 17.08% | 2.219% | 0.895 |
| | q3 | 0.05 … 0.55 | 842 | 17.50% | 2.274% | 0.917 |
| | q4 | 0.56 … 4.68 | 842 | 16.55% | 2.151% | 0.867 |
| `concentration` | q1 | −5.41 … −0.66 | 843 | **22.23%** | **2.889%** | **1.165** |
| | q2 | −0.66 … 0.14 | 842 | 18.53% | 2.408% | 0.971 |
| | q3 | 0.14 … 0.87 | 842 | 15.79% | 2.052% | 0.827 |
| | q4 | 0.87 … 6.64 | 842 | 19.16% | 2.489% | 1.004 |
| `dollar` | q1 | −4.24 … −0.71 | 843 | **21.60%** | **2.806%** | **1.132** |
| | q2 | −0.70 … −0.03 | 842 | 17.01% | 2.210% | 0.891 |
| | q3 | −0.03 … 0.70 | 842 | 19.07% | 2.479% | 0.999 |
| | q4 | 0.71 … 3.66 | 842 | 18.21% | 2.366% | 0.954 |

**The lowest quartile is the worst on all three axes.** That is not three findings; it is one.

### 2.1 The mechanism: the factors stop diversifying each other

ρ(market, bucketing axis) by bucket:

| axis | uncond. | q1 | q2 | q3 | q4 |
|---|---:|---:|---:|---:|---:|
| `cyclical` | 0.550 | **0.664** | 0.485 | 0.428 | 0.474 |
| `concentration` | 0.309 | **0.446** | 0.493 | 0.360 | −0.059 |
| `dollar` | 0.284 | **0.413** | 0.318 | 0.227 | 0.089 |

Risk rises in q1 because the axes move *with* the market there, so the off-diagonal terms in
`b'Σb` add instead of offsetting. This is "correlations go to one in a crisis" — measured on
3,369 sessions rather than asserted.

### 2.2 `cyclical` produces the widest spread despite carrying no measurable exposure

C3 leaves `cyclical` not significant (t = 0.948) and A2 renders it as *"no measurable
exposure."* Both remain true. **They are not in tension with this result.** `cyclical` here
is used to *define the regime*, not as a channel the risk flows through; the risk arrives via
`market` and `dollar`, whose covariance changes inside those buckets. An axis can be a good
state variable and a bad explanatory variable at once.

### 2.3 Robustness: it is not just COVID

40 of the ~52 trading days in the Feb–Apr 2020 crash fall in `cyclical` q1, so the obvious
objection is that one episode is doing the work. Excluding that window entirely:

| | with COVID | ex-COVID |
|---|---:|---:|
| q1 ratio | 1.258 | **1.140** |
| q2 | 0.895 | 0.948 |
| q3 | 0.917 | 0.968 |
| q4 | 0.867 | 0.914 |

The magnitude shrinks; **the ordering does not, and q1 remains the only bucket above 1.**
Each bucket spans all 14 years — the split is not a date cut.

### 2.4 Shrinkage, evidenced rather than asserted

Intensities land at **0.014 – 0.074**. Effect on the reported vol: **−0.06% to +1.34%**.

That is close to nothing, and it is the expected result at N = 4 and T ≈ 842 — the optimal
intensity falls as 1/T, and 842 observations for 10 free parameters is a well-determined
problem. `vol_daily_unshrunk` is stored beside `vol_daily` on every row so the claim can be
checked rather than taken on trust. The spec requires shrinkage and evidence of it; the
honest evidence is that it barely moved, and saying so is the point.

---

## 3 · The distributional assumption, stated

`b'Σb` yields a **variance**. Turning it into VaR and CVaR needs a distribution, and Gaussian
is assumed: VaR = 1.6449σ, CVaR = 2.0627σ at 95%.

**Daily factor returns are fatter-tailed than Gaussian, so every CVaR above understates the
tail.** These are labelled a parametric-Gaussian reading, not an empirical one. The Student-t
alternative the master spec prefers over Cornish-Fisher is the natural next step and is
deliberately not smuggled in here.

`atlas_regime_cvar` accepts 0.90 / 0.95 / 0.99 and returns **no rows** for anything else,
rather than resolving to a neighbouring constant.

---

## 4 · Flagged, not fixed: the Risk page understates book vol by ~2.4×

Surfaced by needing a vol figure to sanity-check against. `book_risk_daily.total_vol_annual`
is the number the Risk surface publishes:

| source | annualised vol |
|---|---:|
| `book_risk_daily.total_vol_annual` (2026-09-11) | **10.78%** |
| realised equity curve, last 60 settled sessions | 24.84% |
| realised equity curve, last 120 | 28.93% |
| realised equity curve, full settled sample (n=172) | 26.24% |
| E3 unconditional (factor model, long covariance) | 19.08% |

A holdings-based forward estimate and a realised backward one genuinely differ, and the
factor model explains 77.8% of variance so it should sit *below* realised. None of that
accounts for a **factor of 2.4** against every window measured.

This is not E3's to fix — different subsystem, different inputs — and nothing in E3 reads it.
But a risk page reporting less than half the volatility the book actually has is worth its own
unit, and E3's figures will look wrong beside it until one of the two is explained.

---

## 5 · Acceptance (§6 E3)

| | Criterion | Status |
|---|---|---|
| 1 | CVaR per regime bucket with observation counts | **done** — §2, 12 buckets + 3 unconditional rows, n on every row |
| 2 | Shrinkage applied and evidenced | **done** — §2.4; `vol_daily_unshrunk` persisted beside `vol_daily` |
| 3 | Comparison against unconditional CVaR | **done** — bucket 0, computed on the **identical sample**; a comparison against a longer window would measure the window, not the regime |
| 4 | Any bucket below 250 sessions merged, and said so | **done structurally** — the bucket count is reduced to `floor(n / 250)` and returned on every row; a `CHECK (n_obs >= 250)` makes an unmerged row unstorable. Does not trigger at n = 3,369. |

`supabase/tests/regime_cvar_invariants.sql` — **17/17**, all rolled back, including the
panel control, the append-only trigger, five constraint refusals, and the happy path. A wall
of refusals that also rejects legitimate data is worse than none.

---

## 6 · Operational notes

- **The surface must read `book_regime_cvar`, never call `atlas_regime_cvar`.** The function
  is 706–710 ms per axis against a 3,000 ms anon cap; three axes in one round trip is 2.1 s
  warm, and this file already records twice that a mean under the cap is not a fix. The
  persisted table is an indexed read. Both functions are revoked from `anon` and
  `authenticated` today.
- `atlas_write_regime_cvar` runs **23:45 Mon–Sat**, after validation at 23:40 and clear of the
  22:30–23:15 trade chain.
- It gates on `sync_log.function_name = 'atlas_refresh_factor_scores'` — the **writer's** name,
  not the cron job's name `refresh_factor_scores_nightly`. Gating on the job name matches
  nothing and skips forever, silently (C4).
- A refusal **updates** its own `sync_log` row and returns; it never `RAISE`s, because a raise
  rolls back the row recording the refusal (A3.1).
- Proven on a real call: `skipped`, reason `factor scores not refreshed today`,
  `upstream_status: no row`, **`duration_ms` = 47** — non-zero, so the `clock_timestamp()`
  discipline is demonstrated rather than assumed.
- First scheduled write lands tonight after the 23:10 factor refresh. The history table is
  empty until then, by design.

**One bug caught before it shipped.** The first writer set `sync_log.rows_processed`, a column
that does not exist. It would have raised `42703` on its first scheduled run — and because the
raise happens inside the function, it would have rolled back the `sync_log` row recording it.
The failure would have existed only in `cron.job_run_details`. Found by reading
`information_schema`, not by waiting for 23:45.

---

## 7 · What E4 needs from here

`atlas_regime_factor_cov(axis, buckets, min_obs)` returns both `cov_sample` and `cov_shrunk`
in long form per bucket. E4's Black-Litterman prior consumes `cov_shrunk`. The covariances are
deliberately **not** flattened into `book_regime_cvar` — that table is the risk *reading*, not
the estimate behind it.
