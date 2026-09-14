# A3.1 — historical backfill report

`logic_version = 'v0-uncalibrated'` · project `vdmojjszvvcithuxwexx` · 2026-09-13

**Headline: the framework detected 0 of its 5 expected periods.** Under
`ATLAS_REGIME_MASTER_SPEC.md` §9.1 that is the *"Stop. Do not tune."* branch, and
nothing has been tuned. A `v1` threshold set at 0–1 detections is §10.3 decision 3
and is reserved to the product owner. This report is the evidence for that
decision.

The result is robust to the one implementation choice that could have produced
it artificially — see §4.

---

## 1 · What was built

| Unit | Objects |
|---|---|
| A0b.1 | `SHY`, `IEI`, `IEF` registered in `market_instruments`; 17,086 bars to inception |
| A0b.2 | `macro_series` / `macro_series_values`, 7 series, 69,048 observations; `load_macro_series` edge function; `vw_macro_series_coverage`; `macro_series_values` added to `atlas_feed_status()` |
| A0b.3 | cron `load_macro_series_daily`, 23:05 UTC Mon–Sat |
| — | `factor_axis_scores.score_20d_z`, and `atlas_axis_dispersion_state` repointed at it |
| A3.0 | `regime_themes`, `regime_theme_triggers`, `regime_theme_states`, `regime_theme_transitions`; two themes seeded |
| A3.1 | §1 amendments; `fiscal_dominance` + `productivity_capex` seeded; the tariff `BRENT` negative leg; `vw_theme_operand_measures`; `atlas_evaluate_themes`; `atlas_persist_theme_run`; `atlas_write_theme_states`; cron at 23:30 UTC Mon–Sat |

No UI, no API route, no component. Shadow mode as specified.

### Deviations from the spec, and why

**Brent comes from FRED, not Alpha Vantage.** Measured before choosing: Alpha
Vantage's `BRENT` daily and FRED's `DCOILBRENTEU` are identical on all 9,973
observations, same first date (1987-05-20), same last date, no date present on
one side only. Alpha Vantage is redistributing the EIA series FRED publishes, so
this is not the proxy substitution §9.2 forbids — there is no second measurement
to choose between — and FRED needs no API key.

**A third operand kind.** §2.4's field list carries `series_key` and `axis_key`
only, but §3's exhaustion row names `rsp_spy` and A3.0's energy exhaustion rule
names XLE/XLU. Both are **ratio pairs**, neither a macro series nor a factor
axis, so `pair_key` and an explicit `operand_kind` were required rather than
optional.

**The macro load is ungated.** A0b.3 says to gate on the upstream stage. This
job reads nothing the platform writes — all seven series come from FRED over
HTTP — so gating it on the price sync would mean a night Yahoo is unreachable
also costs the breakevens. The gate that matters is downstream, and A3.1's
engine has it.

**Two rules the state machine does not supply**, both authored and both recorded
in the migration:

1. *"60 sessions with no emergence row holding → dormant"* is specified for
   `aborted`/`absorbed`/`exhausted` only. Applied to `emerging` and
   `established` too — without it a theme that emerged and faded, without a 60%
   retrace and without an exhaustion row firing, stays `emerging` forever. Read
   as "the emergence **conjunction** is not holding": read literally as "not one
   row holds" the rule is vacuous, because a theme's `abs_lte` row is satisfied
   on most ordinary days.
2. An undefined retrace (no episode has occurred) counts as 0% given back, so
   `retrace_gt 60` fails and `lte 40` passes.

**Two exhaustion rows were seeded in the A3.1 migration, not A3.0.** A3.0 states
tariff and energy exhaustion in prose without numbers, and both need a
"magnitude has fallen below" test — the `abs_lte` operator A3.1 §1 introduces.
The numbers (0.5σ on `cyclical`, 0.3σ on `xle_xlu`) are authored and say so.

---

## 2 · §6 report

Window per theme is set by the latest inception among the operands that can
drive a state change. Confirmation and exhaustion operands are excluded from
that calculation, so a late-starting confirmation series does not truncate the
history a theme is measured over.

### 2.1 · Sessions and state shares

| theme | window | sessions | dormant | emerging | established | absorbed | aborted |
|---|---|---:|---:|---:|---:|---:|---:|
| `tariff_rebasing` | 2003-04-01 → 2026-09-11 | 5,900 | 80.51% | 2.32% | — | 0.83% | 16.34% |
| `fiscal_dominance` | 2003-04-01 → 2026-09-11 | 5,900 | 88.12% | 0.68% | 1.03% | 2.03% | 8.14% |
| `energy_dislocation` | 2013-04-22 → 2026-09-11 | 3,369 | 92.88% | — | — | 5.34% | 1.78% |
| `productivity_capex` | 2013-04-22 → 2026-09-11 | 3,369 | 74.83% | — | — | 0.24% | 24.93% |

18,538 state rows, one per theme per session, no gaps. `exhausted` never
occurred: no theme reached `established` except `fiscal_dominance` once, and
that run ended on the 60-session decay rather than on an exhaustion row.

### 2.2 · Episodes entered

| theme | → emerging | → established | → absorbed | → aborted | → dormant | total |
|---|---:|---:|---:|---:|---:|---:|
| `tariff_rebasing` | 2 | 0 | 1 | 15 | 16 | 34 |
| `fiscal_dominance` | 1 | 1 | 2 | 8 | 11 | 23 |
| `energy_dislocation` | 0 | 0 | 3 | 1 | 4 | 8 |
| `productivity_capex` | 0 | 0 | 1 | 14 | 14 | 29 |

**Absorbed episodes: 7. Emerging episodes: 3.** Across 23 years and four themes.

### 2.3 · Runs of emerging / established

| theme | state | from | to | sessions |
|---|---|---|---|---:|
| `tariff_rebasing` | emerging | 2003-08-11 | 2003-11-19 | 72 |
| `tariff_rebasing` | emerging | 2010-11-04 | 2011-02-07 | 65 |
| `fiscal_dominance` | emerging | 2013-10-28 | 2013-12-23 | 40 |
| `fiscal_dominance` | **established** | 2013-12-24 | 2014-03-24 | **61** |

The longest — and only — `established` run is `fiscal_dominance` over the 2013
taper-tantrum aftermath: 61 sessions. Both tariff emergences pre-date any of the
expected periods.

### 2.4 · Expected periods

| Expected | Theme | Detected | Peak strength in window |
|---|---|---|---:|
| 2018–19 trade war | `tariff_rebasing` | **no** | 0.559 |
| 2022 energy shock | `energy_dislocation` | **no** | 0.248 |
| 2025 tariff rebasing | `tariff_rebasing` | **no** | 0.565 |
| 2023 issuance repricing | `fiscal_dominance` | **no** | 0.699 |
| 2023–25 AI concentration | `productivity_capex` | **no** | 0.454 |

**0 of 5.**

---

## 3 · Which rows blocked each period

Per-row, inside each expected window, from the persisted `evidence`. `best run`
is the longest consecutive streak the row passed; `hold` is what it needed.

| Period | Row | hold | best run | passed | observed range |
|---|---|---:|---:|---|---|
| 2018–19 trade war | `emg_t5yifr_up` ≥25bp | 20 | **1** | 2 / 503 | −27.1 … **+29.4** bp |
| | `emg_brent_flat` \|·\|≤15% | 20 | 126 | 435 / 503 | −29.6 … +20.4 % |
| 2025 tariff | `emg_t5yifr_up` ≥25bp | 20 | **0** | **0 / 250** | −19.9 … **+14.2** bp |
| | `emg_brent_flat` \|·\|≤15% | 20 | 163 | 244 / 250 | −17.9 … +9.7 % |
| 2022 energy | `emg_brent_up` ≥25% | 40 | **10** | 24 / 251 | −23.3 … **+57.1** % |
| | `emg_t5yifr_up` ≥20bp | 40 | **10** | 22 / 251 | −30.6 … **+45.5** bp |
| | `emg_cyclical_positive` ≥0σ | 40 | **37** | 125 / 251 | −1.1 … +1.4 σ |
| 2023 issuance | `emg_dgs10_up` ≥40bp | 30 | **32** ✓ | 41 / 250 | −69.3 … +87.7 bp |
| | `emg_t10y2y_up` ≥25bp | 30 | **33** ✓ | 40 / 250 | −40.5 … +67.0 bp |
| | `emg_t5yifr_flat` \|·\|≤12bp | 30 | **55** ✓ | 211 / 250 | −18.7 … +23.4 bp |
| 2023–25 AI | `emg_concentration_narrow` ≥1σ | 60 | **27** | 118 / 752 | −3.1 … +2.3 σ |
| | `emg_dgs10_up` ≥20bp | 60 | **43** | 182 / 752 | −69.3 … +64.0 bp |
| | `emg_t5yifr_flat` \|·\|≤15bp | 60 | 292 ✓ | 721 / 752 | −19.9 … +23.4 bp |

Three distinct failure modes, and they want different answers:

**A. The premise did not happen.** Both tariff windows. `T5YIFR` — the 5y5y
forward breakeven, this theme's primary claim — reached **+29.4bp** above its
60-session mean across the whole 2018–19 trade war, on **2 of 503 sessions**,
and **+14.2bp maximum in 2025, on none**. Forward inflation expectations did not
reprice in either episode. Lowering the threshold to fit 2025 would fit a number
to an outcome; the signal is not there at any threshold that means anything.

**B. The thresholds were cleared and the holds were not.** 2022 energy. Brent
reached +57.1% against a 25% bar and `T5YIFR` +45.5bp against a 20bp bar — both
comfortably — but the conjunction never held 40 consecutive sessions. The
binding row is `emg_cyclical_positive`, a **sign test on a noisy axis**: its best
run in 2022 was **37 sessions against a 40-session hold**, and its longest run in
all of history is 91. A sign test inside a conjunction that must hold 40 sessions
is the strictest row in the theme, which is the opposite of what a
no-magnitude qualifier reads like.

> **CORRECTION, 2026-09-14.** The paragraph above is wrong and the table at
> rows 139–141 is right. **+57.1% and +45.5bp are peak single-session readings,
> not completed holds.** `emg_brent_up` and `emg_t5yifr_up` each managed a
> longest run of **10 sessions against a 40-session hold** — a quarter of the
> way. `emg_cyclical_positive` at 37/40 was therefore the row that came
> *closest* to satisfying itself, i.e. the **least** binding of the three, not
> the most. "Cleared their bars easily" conflates clearing a threshold at a peak
> with holding it.
>
> The 2026-09-13 ruling's §1 was argued from this paragraph. That correction
> still stands on its own merits — A3.1 §4 says confirmation never gates, and
> A3.0 seeded this row as emergence — but it was never capable of unblocking
> 2022, and the v0.1-structural run confirms it did not.
> See `docs/A3_V01_STRUCTURAL_REPORT.md` §4.

**C. Every row cleared its own hold, and never together.** 2023 fiscal. 32 ≥ 30,
33 ≥ 30, 55 ≥ 30 — all three individually satisfied — and the conjunction never
held on the same session. Peak strength 0.699, the closest any theme came. This
is a **phase** problem, not a threshold problem: the long-end level move and the
steepening lead and lag each other by weeks.

**D. Structurally unsatisfiable.** `productivity_capex`. `concentration ≥ 1σ`
has a longest run of **30 sessions in the entire history of the series** against
a **60-session hold**. No data could satisfy this row. The theme was flagged in
its own spec as the weakest of the four and this is what that looks like when
measured.

---

## 4 · The result is not an artefact of the baseline reading

"25bp above the 60-session mean, hold 20 sessions" has two readings, and the
choice is not a threshold:

- **rolling** — the move must clear 25bp against a *rolling* mean on each of 20
  consecutive sessions. A level that shifts up and stays there feeds into its own
  rolling baseline within 60 sessions and the measured move decays to zero, so
  this reading can only detect a transient spike, never a rebasing.
- **episode-frozen** — the baseline freezes at the session the episode opens and
  the level is measured against it until the episode ends. On the opening session
  the two are identical by construction, so episode *detection* is the same; only
  "still holding" differs.

Frozen is the shipped reading, on the argument that the spec's own `retrace`
rules require a fixed origin — you cannot retrace a move relative to a moving
reference. Both are available on the same code (`p_baseline_mode`), and both were
run:

| reading | emerging/established sessions, whole history, all four themes | expected periods detected |
|---|---:|---:|
| `rolling` | **0** | 0 of 5 |
| `episode_frozen` | 238 | 0 of 5 |

**The strictly more permissive reading still detects none of the five.** So the
0-of-5 is a property of the rules, not of this implementation choice.

---

## 5 · Determinism and acceptance

`atlas_evaluate_themes` returns an md5 over each theme's full
`(as_of, state, round(strength,6))` series — a stronger checksum than transition
counts, because two different state series can carry the same number of
transitions.

| theme | sessions | transitions | digest |
|---|---:|---:|---|
| `energy_dislocation` | 3,369 | 8 | `3f3cf7528ac4daf2778d50e9d0c97811` |
| `fiscal_dominance` | 5,900 | 23 | `9910b4465ff6cc4a6264e33a0e845ab3` |
| `productivity_capex` | 3,369 | 29 | `be734cc96ff7135db59204cc39c19718` |
| `tariff_rebasing` | 5,900 | 34 | `1f1d871f192f1d3f87d38118929e9461` |

Reproduced **four times**: twice in separate transactions, twice inside one
transaction, and once more after the `safe_bigint` rewrite of the two integer
extractions — which is how that rewrite is known to be behaviour-neutral rather
than assumed to be.

Acceptance (§7):

1. §1 amendments applied — `absorbed` state, extended operator set. ✅
2. Both new themes seeded at `v0-uncalibrated`; tariff `BRENT` row added. ✅
3. All four themes evaluated, one row per theme per session, 18,538 rows, **no
   gaps** (asserted against SPY's own sessions). ✅
4. `evidence` re-derives the state without touching the series — proven on three
   sampled rows. ✅
5. **Attribution proven**: 196 sessions where every positive `fiscal_dominance`
   emergence row held its full 30 and `emg_t5yifr_flat` failed on value. The
   theme emerged on **0** of them. First 2003-08-26 (`T5YIFR` +47.1bp against a
   12bp band); last 2021-06-08 (+22.7bp). `tariff_rebasing` has no such session,
   because its positive leg so rarely holds — its `BRENT` negative leg has never
   yet been the binding constraint. ✅
6. Backfill run, this report, counts reproduce. ✅
7. One proven unattended nightly run — pending tonight's 23:30 UTC fire. ⏳
8. No UI, no API route, no component. ✅

`supabase/tests/regime_theme_invariants.sql` — 24 checks, 0 failures, whole thing
rolls back. Eleven violating trigger inserts refused **and one well-formed row
accepted**; four append-only violations refused; three evidence re-derivations;
the attribution proof; four no-gap assertions. Every constraint probe carries its
own `trigger_key`, so a primary-key collision cannot masquerade as a CHECK
refusal.

---

## 6 · Two defects the backfill found, both fixed

**The decay counter was global, not per-state.** *"60 sessions with no emergence
row holding → dormant"* was counted from the last time the conjunction held,
which in a theme dormant for years is already in the thousands — so a theme that
aborted returned to dormant on the very next session. `aborted` averaged 3
sessions and `absorbed` 1, against a rule that should have made both last at
least 60. Found by reading the first backfill's state shares, not the code.

**`aborted` fires from `dormant`.** The state machine says *"any → aborted"*, and
`dormant` is in "any". A theme that moved, failed to emerge, and then gave back
60% of its move is recorded as `aborted` without ever having emerged. That is a
defensible reading — the theme tried and failed — but it makes `aborted` the
second-largest state in every theme (up to 24.9% for `productivity_capex`) and it
is worth knowing that most `aborted` rows in this history describe a move that
never became a state. **Not changed**: it is what the spec says, and changing it
is a calibration decision.

---

## 7 · What the evidence says about the thresholds

Requested by the spec, and **nothing here has been applied.**

- **`tariff_rebasing` is not miscalibrated; it may be mis-specified.** Its
  primary claim — that a tariff rebasing shows up in the *forward* breakeven —
  did not occur in either of its two expected periods. The framework cannot be
  calibrated into detecting a move the data does not contain. If the theme is to
  fire on 2018–19 and 2025 it needs a different primary series, not a lower bar.
- **`energy_dislocation`'s binding row is the one with no threshold.**
  `cyclical ≥ 0σ` held 37 of the 40 sessions required in 2022. A sign test is
  the strictest row in the theme because it flips on noise; the two rows that
  carry actual magnitudes cleared their bars easily. If anything moves here it
  should be how the sign test is applied, not the 25% or the 20bp.
  **CORRECTED 2026-09-14 — this bullet is wrong.** The magnitude rows held 10 of
  40 sessions each; 37/40 made the sign test the least binding row, not the
  strictest. No threshold change fixes a row that holds a quarter of its
  required window. See the correction under failure mode B above.
- **`fiscal_dominance` is the nearest miss and the problem is phase.** All three
  rows cleared their own 30-session holds inside 2023, never simultaneously.
  Requiring simultaneity of three rolling holds is much stricter than requiring
  each to hold, and the difference is invisible in the threshold table.
- **`productivity_capex`'s emergence row cannot be satisfied by any data.** 60
  sessions required, 30 the longest run ever observed. §9.1's *"productivity_capex
  fails → retire it"* row would apply — but the governing branch here is the
  0–1 row, which says stop, so the theme is **left active** and this is reported
  rather than acted on.
- **The `abs_lte` attribution rows are doing their job and are not the problem.**
  `emg_brent_flat` passed on 435/503 and 244/250 sessions in the two tariff
  windows; `emg_t5yifr_flat` on 211/250 and 721/752. None of them is what blocked
  a detection, and the one place a negative row *did* bind — fiscal's 12bp band,
  196 sessions — it refused exactly the inflationary long-end moves it exists to
  exclude.

---

## 8 · Not done, deliberately

- No threshold changed. No `v1` row set seeded.
- `productivity_capex` left `active = true`.
- No re-run after any adjustment — the numbers above are the first and only `v0`
  evaluation.
