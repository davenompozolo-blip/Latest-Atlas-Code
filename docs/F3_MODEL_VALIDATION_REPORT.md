# F-3 — Risk § Model validation (B5 on screen)

Register ID **F-3** (F3 §3). Specs F1 §2, F2 §1 addition, F3 §1.
Screenshot: `docs/f3-model-validation.png`.

---

## 1 · The Risk module's current structure (required by F3 §1 before building)

`src/pages/risk-v2.js`, 2,193 lines, mounted from `pages-other.js`. A persistent
header KPI strip above **five tabs**:

| Tab | Contents |
|---|---|
| COMMAND CENTER | VaR, drawdown, Sharpe, scatter, **return distribution** |
| CORRELATION | matrix, clusters, rolling average correlation |
| DECOMPOSITION | marginal VaR, attribution |
| STRESS ENGINE | regime replay, shocks |
| GREEKS | Δ Γ Θ ν |

**It does already carry VaR, and it already draws a distribution.** F3 §1 says that
means B5 extends rather than sits beside — so the finding matters:

- The header strip publishes `var95` / `cvar95` from `histVaR(portfolioReturns, …)` —
  **historical VaR computed client-side** from the book's own realised returns.
- Command Center's *"Daily Return Distribution"* card already plots a return histogram
  **with a normal overlay**, plus skewness, excess kurtosis and n, and already warns
  *"⚠ Fat tails detected … historical VaR may understate tail risk"*.

**These are a different estimator from the one B5 grades, and that is the whole reason
the two coexist rather than merge.** B5 tests the **parametric factor-model VaR** —
b′Σb under a Gaussian assumption, the estimator behind the regime CVaR layer. The
existing card describes the book's realised returns and assumes no distribution at all.
Folding B5 into that card would have produced one panel reporting two estimators under
one heading, which is the basis-confusion failure this codebase has recorded six times.

So: **a sixth tab, `MODEL VALIDATION`**, carrying § Model validation now and holding the
slot for § Reverse stress (F-7) in F3 §1's order. Decided under F1 §7 and noted here.
The module is organised by tab; "a section beneath" does not exist in its architecture,
and appending four panels to Command Center would bury them.

**Cross-linked, not duplicated** (F3 §1): the existing fat-tail warning now carries a
`MEASURED IN MODEL VALIDATION →` control that switches tabs. The card keeps saying the
tail *may* be understated about its own estimator; the measurement lives in one place.

Worth stating plainly: **the existing card marks only 95%** — VaR 95 and CVaR 95, one
level. That is legitimate for a descriptive historical card, and it is exactly the level
B5 shows to be the crossing point. It is the clearest possible illustration of why F1
§2.2 forbids a single-level view of the backtest.

## 2 · What was built

| File | Purpose |
|---|---|
| `supabase/migrations/20260916000500_f3_var_backtest_distribution.sql` | `vw_var_backtest_distribution` |
| `src/pages/riskModelValidationCompute.js` | pure transforms |
| `src/pages/riskModelValidationCompute.test.mjs` | 11 tests |
| `src/pages/risk-model-validation.js` | the section |
| `src/pages/risk-tokens.js` | tokens extracted from `risk-v2.js`, byte-identical |

**Two panels, headers stating the question**: *Tail shape — is the shape of the
distribution the model assumes the right shape?* and *Scale — is the size of the
predicted loss right?*

**All three confidence levels, always.** There is no collapsed mode and no code path
selecting one level. Direction is **derived** from the Kupiec flag and the
observed/expected ratio, never keyed to a confidence: a fixture where 90% passes and 95%
fails produces the opposite labels, and that is a test.

Current reading — 0.79× / 1.00× / 1.66×, the signature F1 §2.2 names:

| | observed | expected | ratio | direction |
|---|---:|---:|---:|---|
| 90% | 265 | 337.1 | 0.79× | too few — body too wide |
| 95% | 169 | 168.6 | 1.00× | passes |
| 99% | 56 | 33.7 | 1.66× | too many — tail too thin |

One sentence below names the pattern, and it is derived too: it claims the crossing only
when the low level is short and the high level is long. If a re-estimate makes all three
pass, the sentence changes to say so.

**The decomposition is first-class**, rendered as an explicit chain
`1.202% → ×1.2101 → ×1.1332 → 1.653%`, each factor carrying its cause in words, with the
closing line stating the magnitude and that neither cause is the tail. **Every factor is
computed from stored columns** (`sd_factor_window`, `sd_residual_window`, `sd_pred_daily`,
`sd_realised_daily`) — nothing is hardcoded, and the test asserts they reproduce B5's
published 1.2100 and 1.1332. The two multiply to 1.3713 against a measured 1.3751; the
0.27% residual is published rather than rounded away.

## 3 · The distribution (F2 §1 addition)

`vw_var_backtest_distribution` bins the standardised model-leg return at 0.25σ.

**b′x is lifted verbatim from `atlas_var_backtest`'s `model` CTE** — same betas at the
same `max(estimated_at)`, same `complete_z` filter. A second definition of the series the
panel is grading is how two copies drift while both look right. Proven rather than
asserted: the reconstruction returns n = 3,371 with 56 observations below −2.3263σ and a
standardised sd of 0.9997, reproducing the stored run's `n_obs`, its 99% exception count
and `sd_realised/sd_pred`.

**Binned server-side, not paged.** The series is 3,371 sessions; PostgREST caps at 1,000
rows whatever `limit` says, three times over in this codebase already. 68 bins come back
instead.

**Standardising puts the three thresholds at exactly the Gaussian quantiles**
(−1.2816 / −1.6449 / −2.3263), so the panel marks constants and no VaR is computed in the
browser — there is no client arithmetic that could disagree with the backtest.

**Empty bins are returned as zeros.** `group by` alone gave 41 of 68; a histogram drawn
from a series with holes misstates the shape, which is the one thing this panel exists to
show. `sum(obs)` = 3,371 = `n_obs`, so nothing is lost.

**Bins are never clamped** — the series runs −8.99σ to +7.88σ and three observations sit
past 6σ. Clamping them into an edge bin would compress the evidence.

**The y-axis is logarithmic, floored at half a session, and that took two attempts.**
Linear flattened the tail against the axis — 14 sessions past 4σ against 0.2 expected,
invisible. Plain log was worse: the *normal curve* reaches ~1e-15 at 9σ and forced sixteen
decades that made every bar the same height. Floored at 0.5 the axis spans ~3 decades, and
the curve simply leaves the bottom of the chart in the far tails, which draws the finding
instead of describing it. On screen the bars sit above the curve through the body, cross
below it at the shoulders, and stand far above it in the tails.

**A tail bin is shaded only when the whole bin sits beyond the threshold**, so the shading
never overstates the exception region. Asserted with a straddling bin in the tests.

**Vintage is published and checked.** The view recomputes b′x from the *current* betas
while the run row was written against its own night's. `betas_estimated_at` comes back on
both and the panel states a disagreement rather than drawing one vintage under another's
numbers. Verified after last night's run: both `2026-09-09 15:22:52.968575+00`, both
n = 3,371, agrees = true.

## 4 · Measured query times (F1 §8.6)

Measured as `anon`, the role the terminal talks on, against the 3,000 ms cap:

| Read | Cold | Warm | Rows |
|---|---:|---:|---:|
| `vw_var_backtest_distribution` | **262.7 ms** | **58.5 ms** | 68 |
| `var_backtest_runs` (paged, DESC) | — | **5.6 ms** | 24 |

The distribution is the slowest query the section issues. **No function is called from
the browser** — `atlas_regime_cvar` is 706–710 ms per axis and is revoked from `anon`
anyway.

## 5 · Acceptance (F1 §8, F2 §5.3)

| Clause | Status |
|---|---|
| Two panels | ✅ Tail shape, Scale |
| All three levels, no single-level view anywhere | ✅ no such code path exists |
| Decomposition chain with causes in words | ✅ derived from stored columns |
| Distribution, normal overlaid, three thresholds, 99% tail shaded | ✅ |
| Slowest query per panel, measured | ✅ §4 |
| Cancelled query renders as the feed not answering | ✅ `Absent` variant, logged at error level |
| No mock fallback | ✅ none in the module |

231/231 tests pass repo-wide; `vite build` clean.

## 6 · Found while building

**The component relied on another module's import side effect.** `Chart.register(...)`
is called in `risk-v2.js`; mounted anywhere else the section died with `"category" is not
a registered scale`. It happens to work as a tab of that module and would have shipped
looking fine. Registered locally now — `Chart.register` is idempotent. **Found by the
render harness, not by the build**, which is the 2026-09-05 lesson (the build is not a
caller audit) in a new shape.

**`risk-v2.js`'s `loadRiskData` has the 1,000-row cap defect** — `.limit(chunk.length *
120)` = 2,400 rows per chunk ordered `price_date` **ASC**, so every chunk gets the oldest
1,000 rows across its 20 symbols. This is the `performance-suite.js` defect verbatim, in
a file this unit touched but a panel it does not own: it feeds `returnsBySymbol`, which
drives correlation, component VaR and conditional correlation on the Correlation and
Decomposition tabs. **Not fixed here** — correcting it moves published correlation and
VaR numbers on two live tabs, which is a re-basing and its own decision, not a fold-in.
Flagged for a register ID.

**Two `sync_log` defects on the verdict jobs** remain open from P1: the preflight refusal
writes no row, and `duration_ms` is 0 on every row.
