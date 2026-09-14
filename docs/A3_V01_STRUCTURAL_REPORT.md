# A3 `v0.1-structural` — the corrected run

Executing the owner ruling of 2026-09-13 (master spec §10.3 decision 3).
Applied 2026-09-14 to `vdmojjszvvcithuxwexx`. **No threshold value was changed.**

> **Result: 1 of 4 expected periods detected.** That is the ruling's §5 middle row —
> *"Fiscal only, most likely. Report and hold. No further correction without a new
> hypothesis, not a new number."* The ruling named this outcome in advance and it is what
> happened.
>
> **And one premise in the ruling is wrong and has to be corrected:** energy's two
> magnitude rows never came close to their holds in 2022. The §1 fix was right for its own
> reasons but was never capable of unblocking that period.

---

## 1 · What was applied

| Ruling | Change | Where |
|---|---|---|
| §1 | `energy_dislocation.emg_cyclical_positive` moves `emergence` → `confirmation` | new trigger set at `v0.1-structural` |
| §2 | Emergence rows may complete their own holds anywhere inside a common **90-session** window, rather than being mid-hold on one shared session | engine + `regime_themes.conjunction_window` |
| §3 | `productivity_capex` retired, reason recorded | `regime_themes.active = false` |
| §6 | Abort fires only from `emerging` or `established`, never from `dormant` | engine |

Thresholds, units, baseline windows and hold lengths are **copied unchanged**, and the
migration proves it rather than asserting it: it counts any differing numeric field and
raises if the count is non-zero, and requires exactly one role change. `v0-uncalibrated`'s
rows are untouched.

### 1.1 · One thing the ruling did not ask for, and why it was necessary

The two engine corrections were written **unconditionally** first. That would have changed
what `v0-uncalibrated` means — and its 18,538 rows are append-only and are the evidence the
ruling was decided on. A stored series the current code can no longer reproduce is exactly
what `logic_version` exists to prevent, and A3.1 §9.3 makes determinism the contract.

`regime_logic_versions` now records which **semantics** a version evaluates under, separately
from its thresholds. An unknown version defaults to the pre-ruling behaviour, deliberately.
A conjunction window of **1 is the old same-session rule exactly**, so v0 is recovered by a
parameter rather than a second code path.

**This caught a real off-by-one.** Written as `sess_ix - oldest <= v_conj`, a window of 1
meant "this session or the previous one" and silently widened v0 by a session — v0 then
failed to reproduce on two of three themes. The window is the last `v_conj` sessions
*inclusive of the current one*, so the test is `<`.

---

## 2 · The control

`v0-uncalibrated` re-run under the corrected engine, against its stored history:

| theme | stored sessions | fresh | digest |
|---|---:|---:|---|
| `energy_dislocation` | 3,369 | 3,369 | **reproduced** |
| `fiscal_dominance` | 5,900 | 5,900 | **reproduced** |
| `tariff_rebasing` | 5,900 | 5,900 | **reproduced** |
| `productivity_capex` | 3,369 | — | not run (retired) |

Determinism on the new version: evaluated twice in one transaction, digests identical on all
three themes.

---

## 3 · Result against the ruling's §5 table

| Expected period | Theme | Outcome |
|---|---|---|
| 2018–19 trade war | `tariff_rebasing` | **miss** |
| 2022 energy shock | `energy_dislocation` | **miss** |
| 2025 tariff rebasing | `tariff_rebasing` | **miss** |
| 2023 issuance repricing | `fiscal_dominance` | **DETECTED** — `dormant → emerging` 2023-11-03 |

**1 of 4.** §5: *report and hold.*

The fiscal detection is the §2 correction working exactly as designed. Its three emergence
rows completed their own 30-session holds at 32, 33 and 55 sessions inside 2023 — never on a
shared session, which is why v0 saw nothing — and all three completions fall inside one
90-session window. It then went `emerging → aborted` on **2023-11-14**, eleven sessions
later, when `abort_dgs10_retrace` fired on the November yield collapse. That is the rule
behaving correctly, not a failure: the 10-year gave back more than 60% of its move.

---

## 4 · The ruling's §1 premise is wrong, and it is my error

The ruling says, of 2022 energy:

> *"Brent cleared +57.1% against a 25% bar and `T5YIFR` cleared +45.5bp against a 20bp bar,
> and the theme did not emerge because a **sign test with no magnitude** held 37 of 40
> required sessions."*

That reads as: the two magnitude rows finished their holds and only the sign test blocked.
**They did not.** Measured straight off the operand view, independent of the engine:

| row | needs | longest actual run | peak |
|---|---:|---:|---:|
| `emg_brent_up` ≥25% | 40 consecutive | **10** | +57.1% |
| `emg_t5yifr_up` ≥20bp | 40 consecutive | **10** | +45.5bp |
| `emg_cyclical_positive` ≥0σ | 40 consecutive | **37** | — |

+57.1% and +45.5bp are **peak single-session readings**, not sustained holds. Both magnitude
rows reached a quarter of their required hold. The sign test at 37/40 was the row that came
**closest** to satisfying itself — it was the *least* binding of the three, not the most.

The v0 backfill report's table had these numbers correct (rows 139–141). Its prose then
called `emg_cyclical_positive` "the binding row" and said the magnitude rows "cleared their
bars easily", conflating clearing a threshold at a peak with completing a hold. The ruling
was built on that prose. **The table was right and the paragraph above it was wrong; that
paragraph is mine.**

**§1 still stands on its own merits.** A3.1 §4 says confirmation never gates and A3.0 seeded
this row as emergence; that contradiction is real and independent of whether fixing it
detects anything — which is the ruling's own test for an authorised change. But no reader
should expect it to have unblocked 2022, and none of this is a threshold problem: **no
threshold change fixes a row that holds 10 sessions out of 40.**

`energy_dislocation` has now spent **zero sessions** in `emerging` or `established` across
5,900 sessions of history. It reaches `absorbed` three times and nothing else.

---

## 5 · §6's abort correction

`aborted` share of sessions, after restricting the transition to `emerging`/`established`:

| theme | `aborted` at v0.1 |
|---|---:|
| `fiscal_dominance` | 3.92% |
| `tariff_rebasing` | 2.75% |
| `energy_dislocation` | 0.00% |

Against up to **24.9%** at v0, where `aborted` was the second-largest state in every theme
because a move that never became a state was recorded as an abort.

Full distribution: `energy` 96.95% dormant / 3.05% absorbed. `fiscal` 86.86% dormant,
3.92% aborted, 3.69% exhausted, 2.03% absorbed, 1.85% emerging, 1.64% established.
`tariff` 84.42% dormant, 5.17% established, 4.95% absorbed, 2.75% aborted, 2.71% emerging.

---

## 6 · §4 — tariff candidate measurement

**Specificity, not sensitivity**, per the ruling. Five 250-session windows: the two tariff
episodes and three non-tariff macro-stress controls. One transform for every ratio candidate
so the numbers are comparable — the 20-session rolling mean of the pair's daily z — and the
peak signed reading in each window.

| candidate | 2018–19 trade war | 2025 tariff | 2011 euro/downgrade | 2015 China deval | 2020 COVID |
|---|---:|---:|---:|---:|---:|
| `eem_spy` | **+0.58** | **+0.55** | −0.47 | −0.53 | +0.50 |
| `iwm_spy` | −0.55 | +0.40 | −0.53 | −0.45 | −1.67 |
| `xlf_spy` | −0.59 | −0.36 | +0.17 | −0.61 | −1.28 |
| `xli_xlu` | −0.93 | −0.45 | −0.73 | −0.68 | −0.86 |
| `xly_xlp` | −1.06 | −0.65 | −0.46 | −0.69 | **−1.73** |

The `dollar` axis, measured on `score_20d_z` — **a different unit** (20-session sum over its
own 5-year sd), so reported apart rather than mixed into the table above:

| window | peak z | sessions ≥1σ |
|---|---:|---:|
| 2018–19 trade war | **−2.67** | 105 |
| 2025 tariff | **−2.41** | 75 |
| 2011 euro/downgrade | +3.10 | 98 |
| 2015 China deval | +2.73 | 116 |
| 2020 COVID | **−3.94** | 104 |

**No candidate passes.** Two come closest and fail the same way:

- `eem_spy` and the `dollar` axis are the only candidates with **consistent sign across both
  tariff windows** while 2 of 3 controls run the other way. That is the shape a detector
  should have.
- **COVID breaks both.** It moves in the *same* direction as the tariff windows and *further*
  — dollar −3.94 against −2.67 and −2.41; `eem_spy` +0.50 against +0.58 and +0.55. Any
  threshold that fires on the tariff windows fires on COVID first.
- Persistence separates nothing: sessions ≥1σ on the dollar axis run 75–116 in every window,
  tariff and control alike.
- The 2025 window is weak for every ratio candidate — largest absolute reading 0.65.

**No trigger rows were written**, per the ruling. Choosing whichever of these moved most in
2018–19 and 2025 is the curve-fitting §4 refuses, and the measurement says there is nothing
to choose: the candidates that separate tariff from *two* controls fail against the third,
and the third is the largest macro shock in the sample.

---

## 7 · What was not done

- **No threshold tuned.** The version is named `v0.1-structural` for that reason.
- **No `v1` row set.** §5 leaves that to a further decision.
- **No trigger rows from §4.** Measurement only.
- **No UI, no API route, no component.** Shadow mode is unchanged.
- **E1.4 not touched** — the ruling defers it until 30 days of E1.3 drift readings exist.

The nightly `atlas_write_theme_states` now evaluates `v0.1-structural`; it was pinned to
`v0-uncalibrated` in five places and leaving it there would have grown the superseded series
nightly while the corrected one stopped at the backfill.
