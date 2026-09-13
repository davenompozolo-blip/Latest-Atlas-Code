# ATLAS Regime Module — Master Build Spec

**Version 1.0 · 2026-09-10.** Supersedes Roadmap v2 as the controlling document.
Roadmap v2's tripwires survive and are carried in §11.

Written to be executed with the minimum possible number of returns to the product owner.
Every foreseeable branch has a pre-authorised response in §9 and §10. Where a decision
genuinely cannot be pre-made, it is listed in §10.3 — there are four, and they are small.

Project: `vdmojjszvvcithuxwexx`. `apply_migration` for DDL and privileged inserts.
`cron.job` is the only scheduler. `sync_log.duration_ms` is `GENERATED ALWAYS`.

---

## 0 · Definition of completion

The regime module is complete when all six of these are true:

1. **The 2×2 quadrant is gone from the product**, not sitting beside its replacement.
2. The Nexus regime tab reads from `factor_axes`, `factor_axis_scores` and
   `book_factor_betas`, renders three empirically-derived axes with the book's exposure to
   each, and states "no measurable exposure" wherever a beta does not clear significance.
3. Structural themes are detected nightly, with lifecycle states and an append-only
   transition history — **or** the theme layer has been formally retired on the evidence of
   §9.1 and the axis layer carries the module alone. Both are completions.
4. **A regime transition changes what a Bench thesis looks like.** This is the load-bearing
   one. Until a transition flags a thesis whose premise has moved, the engine is
   instrumentation and nothing more.
5. Risk conditions on regime state: stressed CVaR computed from regime-conditional factor
   covariance rather than from arbitrary historical windows.
6. Every number on every surface can be traced to a table, and every threshold lives in a
   row rather than in code.

**What completion is not:** a page with more numbers on it. If the module ships and no
downstream artifact behaves differently, the build has failed regardless of how good the
panel looks.

### What it looks like on screen

The regime tab, in its finished state, shows: three axis rows, each with the pairs beneath
it and their loading signs; each axis's 20-day and 60-day standardised score with a
sparkline; each axis's book beta, or "no measurable exposure"; a dispersion state
(aligned / contested / quiet) computed over non-marginal axes; a marginal qualifier on any
axis that barely cleared the noise threshold; three vintage dates; and — once earned — a
coherence read pairing market state against book exposure and naming the tension without
resolving it.

Below that, if the theme layer survives calibration: active themes with lifecycle state and
strength, coexisting rather than collapsed to a single label, each linked to the theses
written under it.

No composite score. No single regime label. No quadrant.

---

## 1 · State as of 2026-09-10

| Unit | What it produced | State |
|---|---|---|
| **A0** | 16 legs, 102,923 rows to inception, `ratio_pairs` as definitions only, nightly sync proven | Done, live |
| **A1** | Three axes above the Marchenko-Pastur edge; loadings frozen | Done |
| **B0** | `factor_axes`, loadings, scores, `book_factor_betas` with Newey-West errors | Done |
| **C1–C4** | Equity-curve integrity, axis orientation in data, B0 re-estimate, nightly factor refresh | Done, merged |
| **C5** | Yahoo↔Alpaca standing reconciliation | In flight |
| **A2** | Regime tab panel: three axes, book betas, dispersion state, read block built and gated off | **Merged and live** |
| A0b | Macro series layer: 3 new ETF legs, FRED breakevens, Brent | Specced, not started |
| A3.0 | Theme schema, triggers as rows | Specced, not started |
| A3.1 | Four themes seeded, detection engine, historical backfill | Specced, not started |

**Live B0 result** (C3 estimate, n=168, R² 0.778): `market` 1.026 (t 6.93, sig),
`dollar` −0.0048 (t −10.11, sig), `concentration` 0.0011 (t 2.78, sig),
`cyclical` 0.0005 (t 0.95, **not sig**), `alpha` (t −1.45, not sig).

**Live axis state, 2026-09-09:** contested. `cyclical` −2.90 against `concentration` +2.24
over 20 sessions; `dollar` excluded as marginal.

---

## 2 · Standing rules

These bind every unit below and override any local convenience.

1. **Instruments before opinions.** A surface renders raw state before it renders a verdict.
2. **No inference from a sample that cannot carry it.** Where portfolio history is short,
   the estimate moves to the factor level.
3. **Every engine can say "no".** No match, no signal, no exposure, no read.
4. **Confident output from thin evidence is the failure mode**, more dangerous than no
   output, because it was built in-house and will be believed.
5. **A defect producing plausible numbers outranks one producing stale numbers.**
6. **Thresholds are rows, not constants.** Anything a human might want to change lives in a
   table with a `logic_version`.
7. **Append-only for anything an audit will need.** States, transitions, estimates.
   Recalibration is a new version, never an update.
8. **A replacement retires what it replaces.** Learned the hard way; see §3.

---

## 3 · Phase D · Retire the quadrant

**Goes first. Small, and the most visible change in this document.**

The 2×2 Growth/Inflation matrix (Goldilocks / Reflation / Deflation / Stagflation) is
superseded by A2's axis panel. It is currently — as far as this spec's author knows — still
on the page beside its replacement. Two regime reads on one surface is worse than either
alone: they will disagree, and the user has no basis to choose.

### D1 — Inventory
Locate every consumer of the quadrant: the component, any API route, any table or view
holding a quadrant label, any other surface reading it (Cortex, PCM, Bench, the macro
dashboard, alerts). **Report the list before removing anything.** If any consumer other
than the regime tab reads it, that consumer needs a migration path and D2 waits.

### D2 — Remove the surface, keep the data
Delete the quadrant component and its route from the regime tab. **Do not drop any table or
delete any historical labels** — a stored regime-label history is evidence about the past
even if the classification is retired, and B2 may want it as a comparison baseline.

Mark any such table's own registry/comment as retired, with the date and the superseding
objects (`factor_axes`, `factor_axis_scores`).

### D3 — Migrate dependents
Any consumer found in D1 that reads a quadrant label is repointed to axis state. The
mapping is not one-to-one and should not be faked: a consumer wanting "are we in
reflation" gets `cyclical` score and sign, not a synthesised quadrant. If a consumer cannot
be expressed in axis terms, **report it rather than inventing a translation** — that is a
finding about the consumer.

### Acceptance
1. D1 inventory reported.
2. Quadrant absent from the regime tab; screenshot.
3. No table dropped, no label deleted; retirement recorded.
4. Every D1 consumer either migrated or reported as blocked.
5. Nothing on the regime tab asserts a single regime label.

---

## 4 · Phase A0b / A3.0 / A3.1 · The theme layer

Already specced in `A0b_AND_A3.0_SPEC.md` and `A3.1_THEME_ENGINE_SPEC.md`. Hand as one
session. No decisions outstanding.

The deliverable that matters is **A3.1 §6**: the historical backfill, and its pass/fail
against the five expected periods (2018–19 trade war, 2022 energy, 2025 tariff rebasing,
2023 issuance repricing, 2023–25 AI concentration).

**Everything in §5 downstream is conditional on that result. Everything in §6 is not.**

---

## 5 · Phase A5 · Theme surface — conditional

Only after A3.1's backfill clears the bar in §9.1. Design deferred deliberately: what the
surface should show depends on what the engine turns out to do.

Fixed constraints regardless:
- Themes coexist, each with independent state and strength. **No dominant-theme label.**
- Confirmation status displayed separately from detection. A theme detected on macro data
  that fails ratio confirmation is shown as exactly that.
- A theme in `absorbed` is displayed, not hidden. The shock that did not rebase is
  information.
- Every theme links to its `regime_theme_transitions` history.

---

## 6 · Phase E · Downstream consumers — where the value actually lands

**This is the part previously missing from the plan, and §6.1 is the highest-value item in
the entire document.**

Critically: **E1 and E3 run off the axis layer, which is already live and already
validated. They do not depend on the theme engine succeeding.** If A3 fails calibration
entirely, E1 and E3 still ship and the module still reaches completion by §0's definition.

### E1 · Bench × axis state — *unconditional, build in parallel with A3.1*

**The mechanic.** When a thesis is created or materially revised, snapshot the axis state
it was written under. Thereafter compute drift between that snapshot and current state.
When drift is large, the thesis premise may have expired — and the analyst finds out because
the tool tells them, not because they remember.

**E1.1 — Schema.** `thesis_regime_snapshots`, append-only:
`thesis_id` (FK to the Bench thesis table — **CC confirms the actual table and key from the
schema; this spec does not assume its name**), `snapshot_at`, `axis_key`, `score_20d_z`,
`dispersion_state`, `logic_version`.

One row per axis per snapshot. Written on thesis creation and on any revision that changes
the thesis's claim.

**E1.2 — Drift computation.** A view or nightly job computing, per open thesis per axis:
current `score_20d_z` minus snapshot, and whether `dispersion_state` has changed since.

**E1.3 — Surface, instrument first.** On the Bench thesis view, show the drift magnitude per
axis and the snapshot's dispersion state versus current. **No automatic flag in v1.** Per
rule 1: display the drift, let the analyst judge, and watch for a month whether the drift
readings correspond to theses that genuinely went stale.

**E1.4 — Flagging, after observation.** Only once E1.3 has been live 30 days: introduce a
`premise_drifted` signal into the existing Bench integrity state machine. Threshold seeded
as a row, not a constant. **The integrity state enum and its existing values are CC's to
read from the schema** — this spec does not assume them, and a new state must not silently
change the meaning of an existing one.

**Why unconditional:** "this thesis was written when concentration was +2.2σ; it is now
−1.0σ" is a true, useful, auditable statement that requires no theme engine at all.

**Acceptance:** snapshots written on creation and revision; drift visible on the thesis
view; no flag in v1; append-only proven.

### E2 · Bench × theme transitions — conditional on §9.1

Once themes are calibrated, a `regime_theme_transitions` row becomes an event that can flag
theses written under the prior state. Extends E1's machinery rather than replacing it:
theme state joins the snapshot alongside axis state.

Deferred until A3 clears. E1 carries the value in the meantime.

### E3 · Risk B2 · Regime-conditional stressed CVaR — *unconditional*

The original reason for wanting a regime engine, and it works off axes.

**The method, and why it is sound where the earlier version was not.** Do **not** slice the
book's own 168 returns into regime buckets — that yields ~20 observations and a 95% CVaR
becomes one bad day. Instead:

1. Take book factor exposures from `book_factor_betas` (short sample, but a regression is
   what a short sample supports).
2. Bucket the **long** axis history — 2007 onward, ~4,800 sessions — into regime states by
   axis score. Four buckets gives ~1,200 sessions each: ample for a factor covariance
   matrix.
3. Compute factor covariance within each bucket.
4. Stressed CVaR = exposures × bucket covariance.

The portfolio is young; the factors are not. That asymmetry is the whole design.

**Requirements:** Ledoit-Wolf shrinkage on every bucket covariance. Report the observation
count per bucket on the surface. If any bucket falls below 250 sessions, merge it and say
so.

**Acceptance:** CVaR per regime bucket with observation counts; shrinkage applied and
evidenced; a comparison against unconditional CVaR.

### E4 · PCM priors — conditional, last

Black-Litterman prior conditioned on regime state. Depends on E3's bucket covariances.
Specify after E3 lands; no design work now.

---

## 7 · Phase B · Risk track remainder

| Unit | What | Depends on |
|---|---|---|
| **B1** | Factor model validation: predicted vs realised book vol from fitted betas; residual diagnostics | B0 (done) — **can start now** |
| **B2** | Regime-conditional stressed CVaR | = E3 |
| **B3** | Reverse stress testing: minimise Mahalanobis distance in factor space subject to the loss constraint. Output is the *nearest plausible* breaking scenario in sigma, not an arbitrary coordinate | B2 |
| **B4** | MCTR × Bench integrity: marginal risk contribution per position joined against thesis state | B0, E1 |
| **B5** | VaR backtest: exception counts, Kupiec test, predicted vs realised | B2 |

**B4 is the second-highest-value item in this document** after E1, for the same reason: the
top marginal risk contributor carrying a bending thesis is one cell more actionable than the
rest of a risk page combined.

**Held, with unblock conditions unchanged:** historical analog engine (needs the variable-set
tradeoff decided and must express match *distance*, not rank); hedge optimiser (needs
shrinkage and a constrained hedge set); Cornish-Fisher (probably never — Student-t is
better value); CPER→HG/GC futures.

---

## 8 · Sequencing

```
D  quadrant retirement ─────────────────────────► (immediate, visible)

A0b ─► A3.0 ─► A3.1 ─► backfill ─► §9.1 branch ─┬─► A5 theme surface ─► E2
                                                 └─► theme layer retired

E1 Bench × axes ──────► (30d observe) ──────────► E1.4 flagging
                                                      │
B1 factor validation ─► B2/E3 conditional CVaR ─► B3 reverse stress ─► B5 Kupiec
                                                 └─► B4 MCTR × Bench ◄─┘
                                                         (needs E1)
```

**Three tracks run in parallel and share no objects:** D, the A3 chain, and E1/B1. Nothing
in E1 or B1 waits on the theme engine.

---

## 9 · Pre-authorised decision branches

**CC proceeds on these without returning to the product owner.**

### 9.1 · A3.1 backfill outcome

| Expected periods detected (of 5) | Pre-authorised response |
|---|---|
| **4–5** | Seed `logic_version = 'v1'` with any minor threshold corrections, documented per row with the evidence. Proceed to A5. |
| **2–3** | One recalibration pass, **on the missed themes only**. Do not touch a theme that fired correctly. Seed as `v1`, re-run the backfill, report both versions side by side. Then proceed to A5 for the themes that pass. |
| **0–1** | **Stop. Do not tune.** The thresholds are wrong in kind, not degree. Report and hold. §6's E1 and E3 carry the module to completion without the theme layer. |
| Any theme fires in **>40% of history** | Too loose. Tighten that theme alone, as `v1`, documented. A regime that is always on is not a regime. |
| Any theme fires **never** across full history | Report as miscalibrated. If it is `productivity_capex`, apply 9.2. |
| `productivity_capex` fails | **Retire it.** Set `active = false`, record why. Three themes is a complete answer; it was flagged as the weakest for exactly this reason. |

**In every branch, the version discipline holds:** a threshold change is a new
`logic_version` row set with the old retained, never an update.

### 9.2 · Data availability

| Situation | Response |
|---|---|
| A FRED series has shorter history than a theme needs | Register it, record the constraint in `caveats`, and report which themes are truncated. Do not substitute a proxy for a breakeven. |
| Brent spot unavailable on the current key | Register the gap. `energy_dislocation` cannot detect; mark it `active = false` with the reason. Do not substitute USO — front-month roll drag would corrupt the level test. |
| A new ETF leg's history starts later than expected | Normal; record verified inception. Coverage differences are information, never truncate to a common start. |
| Any axis-dependent theme needs pre-2007 history | Not available; HYG's inception binds the axes. Report the truncation. |

### 9.3 · Engine behaviour

| Situation | Response |
|---|---|
| Two themes emerge simultaneously on the same underlying move | Check the `abs_lte` attribution rows fired correctly. If they did and both still emerged, that is a genuine multi-theme state — **allow it and report it.** Themes are designed to coexist. |
| A theme emerges with confirmation failing | Allow. Record in `evidence`, reflect in `strength`, never block the transition. |
| `strength` computes outside 0–1 | Defect. Stop and report. |
| A session is missing from `regime_theme_states` | Defect — a gap must mean the job did not run. Backfill and report. |
| Backfill counts do not reproduce on clean re-run | Stop. Non-determinism in the engine invalidates every calibration conclusion. |

### 9.4 · Downstream

| Situation | Response |
|---|---|
| The Bench thesis table has no stable key for E1's FK | Report the schema and hold E1.1. Do not invent a key or derive one from content. |
| Bench integrity states are a hardcoded enum | Report before extending. Adding a state must not change the meaning of an existing one. |
| A regime bucket in E3 has <250 sessions | Merge with its nearest neighbour, document the merge, report both counts. |
| A bucket covariance is ill-conditioned after shrinkage | Report; do not increase shrinkage silently to make it invert. |
| B1 shows predicted vol badly mismatching realised | **This is a finding, not a blocker.** Report it prominently — it bounds how much weight B2/B3 can carry, and it is exactly what B1 exists to discover. |

---

## 10 · Failure register

### 10.1 · Failures with pre-authorised responses
Covered in §9. CC proceeds.

### 10.2 · Failures that stop the unit and are reported
- Non-determinism in the theme engine (§9.3).
- `strength` out of range.
- Missing sessions in an append-only series.
- A scheduled job that cannot write `sync_log` — this codebase has three historical
  instances of a silently-skipping job. **Before adding any new `cron.job` entry, sweep the
  existing ones against their `sync_log` writers.** This sweep was requested twice and has
  not been done.
- `runPortfolioHistory` in `supabase/functions/_shared/alpaca_tasks/portfolio_history.ts`:
  an uncalled duplicate writer without stale detection or `sync_log`. **Delete it.** One
  import away from reintroducing the defect C1 closed.

### 10.3 · The only decisions reserved to the product owner
Everything else in this document is pre-authorised. These four are not:

1. **Enabling the A2 read block.** Gated on 30 days of the panel live. A judgement about
   whether the panel's readings have been trustworthy, which cannot be automated.
2. **Enabling E1.4 thesis flagging.** Same reason: 30 days of drift readings observed
   first, because a false premise-expired flag on a good thesis is expensive.
3. **A `v1` threshold set where the backfill detected 0–1 expected periods.** §9.1 stops
   there deliberately. Rewriting a framework that detected nothing is a design decision.
4. **Any paid data commitment** — commodity forward curve, premium Alpha Vantage.

### 10.4 · Known risks to the build itself

**The theme layer may not survive.** It rests on authored thresholds against a five-period
test set. That is a small n and the honest possibility is that the framework does not
detect cleanly. §6 is structured so this does not stall completion.

**`dollar` carries the second-largest book exposure off the weakest axis.** It cleared the
noise edge by little and is flagged `marginal`. If B1's validation shows the model
mis-predicting, `dollar` is the first place to look.

**Axis orthogonality is a full-sample property.** Over the 174-day window
`concentration`–SPY is +0.592. Never quote the orthogonality justification for a sub-window
without re-measuring it.

**Exposures are contemporaneous.** R² 0.778 is same-day co-movement. Nothing in this
document licenses a predictive claim, and no surface may be phrased as though it does.

---

## 11 · Tripwires

Each paired with the rationalisation that precedes it.

- **A composite confirmation score appears.** *"A single number would be cleaner."*
- **A single dominant regime label appears above the themes.** *"Users need to know what regime we're in."*
- **The quadrant survives beside the axis panel.** *"It's still useful as a summary."*
- **A theme surface ships before the backfill clears §9.1.** *"It's been right the last few times."*
- **An insignificant beta renders as a number.** *"It's the largest axis, it must be doing something."*
- **Regime-conditional CVaR is computed from portfolio history.** *"We have more days now."*
- **A hedge recommendation appears without shrinkage.** *"The optimiser output looks sensible."*
- **Thresholds are tuned until the backfill passes.** *"It nearly caught 2018."*
- **The orthogonality argument is quoted for a sub-window.** *"The axes are orthogonal by construction."*
- **A defect is deferred because no current verdict moves.** *"It doesn't change any conclusion."*
- **A thesis flag ships without the 30-day observation.** *"The drift numbers look right."*
- **Another governance document is written before Phase D ships.** This is the controlling
  document. The next artifact is code.

---

## 12 · Handoff order

1. **Phase D** — quadrant retirement. Immediate, visible, and closes the gap between what
   was built and what it replaced.
2. **`cron.job` sweep + delete `runPortfolioHistory`** (§10.2). Small, overdue, and blocks
   nothing.
3. **A0b + A3.0 + A3.1** as one session, ending at the backfill report.
4. **E1 (through E1.3) and B1** in parallel — neither waits on the theme engine.
5. **§9.1 branch** on the backfill result, pre-authorised.
6. **E3/B2**, then B3, B4, B5.

Report against this document's unit numbers so progress is legible without re-reading the
history.
