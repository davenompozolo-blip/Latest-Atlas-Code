# A3 v0 — calibration decision

**Master spec §10.3 decision 3. Decided 2026-09-13.**
Evidence: `docs/A3_THEME_ENGINE_BACKFILL_REPORT.md`.

---

## The ruling in one line

**No v1 threshold set. Three structural defects corrected, one theme retired, one theme
re-specified, then a single re-run at unchanged v0 numbers — against a stopping rule fixed
below before the result is known.**

§9.1's 0–1 branch says *"the thresholds are wrong in kind, not degree."* The evidence says
something sharper: the thresholds are mostly fine and the **rule semantics** are broken.
Three of the four failures are defects I can justify fixing without reference to whether the
fix makes anything fire. That distinction is the whole of this decision, so it is stated
plainly:

**The test applied to every change below: would I make it if it did not improve detection?**
Only changes that pass that test are authorised. Nothing that fails it is in this document.

---

## 1 · Energy — a self-contradiction in my own spec

A3.1 §4 states: *"Confirmation is not gating. A theme can emerge without confirmation…
never let it block a state transition."* And then A3.0 seeds `emg_cyclical_positive` as an
**emergence** row on `energy_dislocation`. Those cannot both stand.

The backfill shows the cost exactly: Brent cleared +57.1% against a 25% bar and `T5YIFR`
cleared +45.5bp against a 20bp bar, and the theme did not emerge because a **sign test with
no magnitude** held 37 of 40 required sessions. A sign test flips on noise; its longest run
in 23 years is 91 sessions. Requiring 40 consecutive from it is the strictest row in the
theme, which is the opposite of what a bare qualifier reads like.

**Correction:** move `emg_cyclical_positive` from `emergence` to `confirmation`. It then
records in `evidence` and reflects in `strength` without gating, which is what §4 always
said it should do.

*Passes the test:* this is a spec inconsistency. It would be corrected if it made detection
strictly worse.

---

## 2 · Fiscal — conjunction semantics were never consciously chosen

All three fiscal emergence rows cleared their own 30-session holds inside 2023 — 32, 33 and
55 — and the conjunction never held on the same session. Peak strength 0.699, the closest
anything came.

That is not a threshold problem. It is that "all rows hold, each for its `hold_sessions`"
was implemented as **same-session simultaneity of three rolling holds**, which is far
stricter than what the words describe, and strictly so in a way I did not author
deliberately. Macro variables lead and lag each other by weeks; requiring a long-end level
move, a steepening and a flat breakeven to be simultaneously mid-hold is close to requiring
they move in lockstep.

**Correction:** emergence is satisfied when every emergence row completes its own
`hold_sessions` **within a common 90-session window**, rather than on a shared session. Add
`conjunction_window` to `regime_themes`, default 90, as a row so it is calibratable later.

*Passes the test:* the same-session reading was an implementation default, not a design
decision. It would be corrected regardless of effect.

---

## 3 · Productivity — retire it

`emg_concentration_narrow` requires ≥1σ held 60 sessions. The longest such run in the
entire history of the series is 30. **The row cannot be satisfied by any data**, which makes
the theme's detection vacuous rather than strict.

Lowering 60 would be tuning and is refused. §9.1 carries a separate, independent
pre-authorised branch — *"`productivity_capex` fails → retire it. Three themes is a complete
answer; it was flagged as the weakest for exactly this reason."* CC correctly flagged the
conflict with the 0–1 branch and did not act. **Resolved: the retire branch governs.**

**Correction:** `active = false`, reason recorded — emergence row unsatisfiable against
observed series behaviour, retired at v0 rather than recalibrated.

It also had no independent macro series and was detected mostly off the axis it was meant to
be confirmed by. A3.1 §3 said so in writing before any of this ran.

---

## 4 · Tariff — the hypothesis was wrong, and that is mine

This one is not a defect. It is my framing failing a test, and it should be recorded as such.

I argued that expected policy duration shows up as term structure: a shock believed
temporary moves the front end, one believed structural moves the long end too, so 5y5y is
the discriminator. The data says forward inflation expectations **did not reprice** in
either tariff window — +29.4bp maximum across 2018–19 on 2 of 503 sessions, +14.2bp in 2025
on none, against a 25bp bar.

That is economically coherent and I should have anticipated it. A tariff is a **one-time
price-level shift**, not a change in the inflation process. With a credible reaction
function, 5y5y *should* stay anchored — the long end is pinned by what the Fed will do about
a shock, not by how long the shock lasts. So "the long end moves if the market believes it
persists" is wrong for any shock the central bank is expected to look through.

**No threshold change will fix this, and none is authorised.** The theme needs a different
primary series.

**Correction — and the discipline on it.** Tariff rebasing is a **relative-price and growth**
shock, so its signature should be cross-sectional, not in the aggregate breakeven curve.
Candidate primaries from series already held: `EEM/SPY` (US insulation versus external
drag), input-cost-exposed versus domestically insulated sector pairs, and the dollar axis.

**Select on economic reasoning first, then test for specificity, not sensitivity.** Picking
whichever series moved most inside 2018–19 and 2025 is curve-fitting and is refused. The
requirement on any candidate is that it moves in the tariff windows **and does not move in
comparable non-tariff periods**. A series that fires everywhere is not a detector.

CC's task here is a measurement report, not a re-seed: for each candidate, the move inside
the two tariff windows and inside three comparable non-tariff windows of equal length.
**No trigger rows are written from it without a further decision.**

---

## 5 · The stopping rule — fixed now, before the result

One re-run, at **unchanged v0 thresholds**, with §1–§3 applied. `tariff_rebasing` stays as
seeded for that run; it is expected to detect nothing and that is not a failure of the
re-run.

Four expected periods remain relevant (productivity retired):

| Detected | Decision |
|---|---|
| **≥2 of 4** | The structural corrections were the problem. Proceed to a v1 threshold discussion on the remainder. |
| **1 of 4** | Fiscal only, most likely. Report and hold. No further correction without a new hypothesis, not a new number. |
| **0 of 4** | **Retire the theme layer.** Set all themes inactive, keep the schema and history, record the retirement. E1 and E3 carry the module to completion per master spec §6. |

This rule is binding and is recorded before the outcome is known, which is the only
condition under which a stopping rule means anything. If the re-run lands at 0–1, there is
no third correction round.

The theme layer does **not** reach a surface at any branch above. A5 remains gated on §9.1's
4–5 bar, which this re-run cannot clear.

---

## 6 · Two findings to keep regardless of what happens to the layer

**`aborted` is over-counted and the report is right to flag it.** "Any → aborted" includes
`dormant`, so a move that never became a state is recorded as an abort — up to 24.9% of
sessions. Defensible under the spec as written, and worth correcting to "aborted only from
`emerging` or `established`" **at the same time as §1–§3**, since it changes what the state
series means and costs nothing to fix now. Add it to the correction set.

**The `abs_lte` attribution rows worked.** They passed on 435/503 and 244/250 sessions in
the tariff windows and never blocked a detection, and where one did bind — fiscal's 12bp
band, 196 sessions — it refused exactly the inflationary long-end moves it exists to
exclude. The multi-theme-agreement failure this document has worried about throughout did
not occur. That part of the design is sound and survives whatever happens to the themes.

---

## 7 · What CC does

1. Apply §1, §2, §3 and §6's `aborted` correction. **No threshold values change.**
2. Re-run the backfill. Report against the §5 table.
3. Produce the §4 tariff candidate measurement — sensitivity **and** specificity. Write no
   trigger rows from it.
4. Everything else in A3 is unchanged: shadow mode, no UI, no API route, no component.

`logic_version` for the corrected run is `v0.1-structural`, not `v1`. The distinction is
the record that no number was tuned.

---

## 8 · E1.4 — deferred, not decided

Master spec §10.3 decision 2 gates thesis flagging on 30 days of E1.3 drift readings
observed. E1.3 was authorised on 2026-09-13 and has days, not weeks, of history.

**Not yet.** Revisit when 30 days of drift readings exist, with the readings in hand — the
question is whether large drift corresponded to theses that actually went stale, and that
cannot be answered from anything available today.
