# B4 — MCTR × Bench integrity

**Applied 2026-09-14** to `vdmojjszvvcithuxwexx`.
Migrations `20260914200000_b4_book_mctr.sql`, `20260914200500_b4_position_risk_thesis.sql`.
Tests `supabase/tests/b4_mctr_thesis_invariants.sql` — 10/10.

> **Headline: 45.86% of the book's risk sits in positions with no thesis on file** —
> 37 of 61 measured positions. Three of the top five risk contributors (EWY, TSM,
> ASML) have nothing written down, and together they carry 22.42% of book risk.
> The largest axis drift on a name that *does* have a thesis is **GDX at 1.277σ on
> `dollar`** — a gold miner against a dollar premise, which is the one cell the
> spec said this unit exists to produce.

---

## 0. The input did not exist

B4 is specified as "marginal risk contribution per position joined against thesis
state". The join needed an MCTR. There wasn't one.

`vw_risk_analysis.marginal_vol_contribution` is

```sql
(p.market_value / nav.total_nav) * v.annual_vol      -- weight × standalone vol
```

No covariance appears anywhere in it. That is a share of the **undiversified**
sum, not a marginal contribution: it cannot express that adding to a name which
offsets the rest of the book *lowers* portfolio risk, because nothing in it knows
what the rest of the book is. It also does not sum to anything meaningful — the
property B4 and the segment layer both need is Euler additivity, and a standalone
vol share has none.

**Three defects were found in the existing risk layer on the way to building it.**
None is fixed here; §4 says why and what each would take.

## 1. What was built

`vw_book_mctr` computes the real thing:

```
MCTR_i = ∂σ_p/∂w_i = (Σw)_i / σ_p
RC_i   = w_i · MCTR_i            with   Σ RC_i = σ_p   exactly
```

Σ = D R D, with R from `universe_correlations` and D the sample sd **over the same
120 sessions the correlations were estimated on**. Pairing a 252-day vol with a
120-day correlation would be the mixed-basis failure this codebase has now caught
six times, so the window is taken from the matrix itself rather than assumed.

**`correlation_simple`, not `correlation`.** The latter is EWMA-weighted at
λ = 0.97, so its effective sample is ~33 sessions and it reaches ±0.9997 on this
book. A pairwise EWMA matrix paired with a 120-day sample vol is neither
internally consistent nor reliably positive semi-definite. The plain Pearson
column is estimated on exactly the window the vols use.

**121 sessions, to get 120 returns — and the first cut of this got it wrong.**
`refresh_universe_correlations` computes returns over a *double-width* close
window and only then takes the last `p_window` **return** dates, so R rests on
120 returns whose oldest consumes a close from outside the grid. Taking 120
*closes* here and lagging inside them yields 119 returns beginning one session
later — a different sample from the one R was estimated on, while the comment
above it claimed they matched. Caught in review on this PR. The correction moves
book vol by **one basis point** (19.377% → 19.367%), which is the right order for
one observation in 120 — the point is not the magnitude but that Σ = D R D is
only coherent if D and R span the same observations.

| | |
|---|---:|
| Book vol, annualised | **19.37%** |
| Undiversified sum Σ wᵢσᵢ | 40.84% |
| Euler residual | **2.8e-17** |
| Σ risk_share | 1.0000000000 |
| Positions measured | 61 |
| Withheld | 2 (IXC, KMTUY — 1.73% of weight) |

**19.37% is corroborated, not merely computed.** E3's factor model put the
unconditional book vol at **19.08%** by an entirely different route — four factor
betas and a shrunk 4×4 covariance, versus a 61×61 correlation matrix here. Two
methods sharing no intermediate object agreeing to 0.3pp is the reason to believe
either.

## 2. The join

`vw_position_risk_thesis` joins that to `vw_bench_thesis_state` and to E1's
`vw_thesis_regime_drift`.

| thesis coverage | positions | % of book risk | % of weight |
|---|---:|---:|---:|
| `no_thesis` | 37 | **45.86%** | 58.28% |
| `thesis_on_file` | 24 | 54.14% | 41.72% |

Theses are concentrated in the riskier half of the book — 24 positions holding
41.72% of weight carry 54.14% of risk — which is the right direction. The gap is
still that nearly half the book's risk is unexplained by anything the Bench holds.

Top of the book:

| rank | symbol | % book risk | thesis | drift σ | axis |
|---:|---|---:|---|---:|---|
| 1 | AMD | 12.82 | untested | 0.478 | concentration |
| 2 | MU | 10.91 | untested | 0.534 | dollar |
| 3 | EWY | 9.11 | **none** | — | — |
| 4 | TSM | 7.14 | **none** | — | — |
| 5 | ASML | 6.17 | **none** | — | — |
| 6 | SNDK | 5.94 | untested | 0.703 | dollar |
| 7 | CRWV | 4.34 | untested | 0.891 | dollar |
| 10 | GDX | 4.07 | untested | **1.277** | dollar |

**Every thesis on file is `untested`.** All 27 `bench_claims` rows carry
`status = 'untested'`; no claim has ever been confirmed or contradicted. So the
"thesis state" axis of this join is, today, a constant — the actionable variation
comes entirely from E1's drift. That is a fact about the Bench, not a defect in
this view, and it is why `thesis_coverage` classifies what is *on file* rather
than pretending to grade it.

### Two rules that decide what drift is allowed to say

**Drift is in σ, never in raw score.** `drift_score_20d` is a difference of
20-session *sums* whose sd runs 4.19 (`dollar`) to 8.22 (`cyclical`), so raw
magnitudes are not comparable across axes. On this book it inverts the answer:

| axis | max raw drift | rank | max drift in σ | rank |
|---|---:|---:|---:|---:|
| `cyclical` | 6.725 | **1** | 0.818 | 2 |
| `dollar` | 5.356 | 2 | **1.277** | **1** |
| `concentration` | 4.810 | 3 | 0.689 | 3 |

Third place this codebase has hit that exact trap.

**And drift only counts where the book is exposed.** An axis moving is evidence
about a thesis only if the book has measurable exposure to it, so axes are gated
on `book_factor_betas.significant`. `cyclical` fails that gate (t = 0.948) — the
same axis raw ranking would have put on top. The two rules exclude it for
independent reasons, which is a useful check on both.

**Not `factor_axes.marginal`, which is a different concept entirely.** That column
means the component barely cleared the Marchenko–Pastur noise edge — a property of
the PCA. `dollar` is `marginal = true` **and** the most significant exposure the
book has (t = −10.111). A rule reading `marginal` as "no measurable exposure"
would withhold the axis that matters most and publish the one that matters least.
The two columns are orthogonal and the view uses the right one.

### It does not flag

The 2026-09-13 ruling §8 defers E1.4 — the `premise_drifted` signal — until E1.3
has been observed for 30 days. So drift is published as a magnitude and nothing
derives a verdict from it. Test 9 asserts the *absence* of any flag-shaped column
rather than trusting it, so a later edit that quietly introduces one fails.

## 3. Ranking changes materially

Against the old `marginal_vol_contribution × weight` ordering:

| symbol | old | new | |
|---|---:|---:|---|
| MRVL | 20 | **8** | +12 |
| CRWV | 14 | **7** | +7 |
| SNDK | 10 | 6 | +4 |
| JPM | 9 | **24** | −15 |
| NVDA | 7 | 11 | −4 |
| **AU** | **5** | — | **not held** |

The old measure over-weights large positions because it never sees that their
moves cancel; it under-weights small, volatile, weakly-correlated names. JPM
falling fifteen places and MRVL rising twelve is diversification being priced for
the first time.

## 4. Three defects found, none fixed here

Each changes numbers on a live page, so each is reported rather than folded into a
unit that was authorised as a join.

**4.1 — `vw_risk_analysis` carries positions the book does not hold.** Its
`latest_pos` is `DISTINCT ON (asset_id) … ORDER BY as_of_date DESC` — the latest
row *per asset*, not the latest snapshot. A sold name therefore keeps its final
row forever, at whatever market value it had the day it left.

| | |
|---|---:|
| Rows published | 83 |
| Actually held (broker snapshot, 2026-09-14) | 63 |
| **Stale** | **20** |
| Stale share of published weight | **15.87%** |
| Stale share of published risk contribution | **11.37%** |

**AU was the 5th-largest risk contributor on the Risk page and is not held.** The
fix is one clause — scope to `max(as_of_date)` — and the snapshot supports it: the
book has written a complete 64–66 row snapshot every day for the last twelve, every
row non-zero.

**4.2 — `book_risk_daily.total_vol_annual` is dimensionally wrong, and this is the
mechanism behind the 2.4× understatement already flagged in CLAUDE.md.**

```
Σ wᵢ·σᵢ                    = 34.83%     (undiversified, correct units)
Σ wᵢ²·σᵢ_annual × √252     =  9.90%     ← what is published (10.78%)
```

It squares the weights **and** re-annualises an already-annual number. Two
independent errors that partially cancel into a plausible-looking 10.8%. Against
realised equity-curve vol of 24.8–28.9%, B4's 19.37% and E3's 19.08% are both
coherent; 10.78% is not.

**4.3 — the column name asserts a measure the field does not carry.**
`marginal_vol_contribution` is a standalone vol share. Same family as the `fwd_pe`
audit: *when a column's name asserts a measure, check the field it reads, not the
alias.*

## 5. Timing

`vw_position_risk_thesis` measured **10,529 ms** on first build — against anon's
3,000 ms cap, before any surface went on it.

Two fixes, both the lessons already in this file:

1. **Bound the shared table.** Symmetrising the whole ~420-name matrix
   materialises 175,140 rows and the planner rescans them per position. Filtered
   to the held set it is 3,721. 
2. **`LIMIT 1`, not `DISTINCT`.** The window length is one value for the whole
   snapshot; `select distinct window_days` scanned all 87,570 rows of that day's
   matrix to learn the number 120 — 912 ms spent on a constant.

**10,529 ms → 338–449 ms over eight runs.** That clears the cap with a ~7×
margin, but **no browser surface reads it yet**, and this file records three times
that a view read only by `service_role` has never met the caps the UI runs under.
Before a page goes on it, re-time it under real PostgREST traffic and read the
*max*; if it sits near the ceiling the established answer is a matview on the
existing 10-minute `refresh_nexus_holdings()` job, holdings first.

## 6. Not done — deliberately

- **No surface.** B4 as specified is the join; the Risk page is untouched.
- **No flag.** E1.4 stays deferred (§2).
- **The three §4 defects are not fixed** — each re-bases a live page and is its own
  decision.
- **No nightly history.** This is a view over the current book. If the drift
  reading is to be observed over time per the E1.4 clock, it needs an append-only
  history like `position_verdicts` — not built here.
