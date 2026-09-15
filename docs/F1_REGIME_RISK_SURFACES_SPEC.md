# F1 — Regime & Risk surfaces: architecture and spec

Answers the 2026-09-15 front-end brief. Covers B5, A3, B3; defers E2 and E1.4.

Project `vdmojjszvvcithuxwexx`. §4's constraints in the brief are binding and are not
restated here except where a surface below turns on one.

---

## 0 · Ahead of any surface work

**P0-a · `segment_verdicts` RLS is off.** This is not a front-end item and does not wait for
one. Supabase's default grants give `anon` INSERT and only RLS takes it back, so an
append-only verdict history is currently open to anonymous writes — the integrity record can
be forged. Apply the `_read`/`_service` pair tonight.

**P0-b · `regime_theme_states` has no anon read policy.** Blocks A3 entirely. Same migration
shape as its siblings.

**P1 · Staleness.** `book_risk_daily`, `position_verdicts` and `segment_verdicts` sit at
2026-09-11 while their jobs run nightly. Establish whether the job is failing, writing
nothing, or writing elsewhere **before** a surface depends on them. A panel over a silently
dead writer is the exact failure §4 exists to prevent.

---

## 1 · Where these live *(Q1)*

**B5 and B3 → the Risk module, not the Regime tab.** They are statements about the book's
risk, not about the market's state. The Regime tab answers "what is the market doing and
what is the book's exposure to it"; Risk answers "how wrong could this go and how confident
are we in that estimate". Putting a Kupiec test beside an axis panel blurs two different
questions.

**A3 → the Regime tab**, below the axes panel, above the toggled lower section.

**Name it "Structural regimes", never "Themes".** `NexusTheme.js` already owns that word for
the holdings cut, and the brief is right that anyone reading the tab list would assume A3 is
already surfaced. Two objects with one name in a terminal whose rules exist because a surface
once published something false is an avoidable trap.

---

## 2 · B5 — VaR backtest

### 2.1 Two panels, not one *(Q2)*
The separation carries to the UI. The legs answer different questions — **is the tail shape
right** (model leg) and **is the scale right** (book leg) — and a reader shown one number
will average them mentally into "the model is a bit off", which is false in both directions
at once.

Headers state the question, not the method: *"Tail shape"* and *"Scale"*.

### 2.2 All three confidence levels, always together
90% at 0.79×, 95% at 1.00×, 99% at 1.66× is the fat-tail signature: too few exceptions in
the body, too many in the tail, crossing near 95%. **A surface that renders only 95% would
certify the assumption the other two refute.** Rendering any single level is prohibited, and
a collapsed or "headline" view must not select one.

Each level shows observed count, expected count, the ratio, and a one-line direction
(*too few — body too wide* / *passes — crossing point* / *too many — tail too thin*). Kupiec
p-values are drill-down, not face: the direction is what a reader acts on.

Below the three, one sentence naming the pattern. Without it a reader sees one pass and two
fails and has no way to know they are one finding.

### 2.3 The variance decomposition is first-class *(Q3)*
Yes. It is the actionable content and the tail test is context.

Render as an explicit chain — predicted → ×1.2100 → ×1.1332 → realised — with each factor
carrying its cause in words: *Σ is a 13-year average, the window ran hot*, and *b′Σb carries
no idiosyncratic variance at all*. Not a bare number, not a tooltip.

The closing line states the magnitude and that neither cause is the tail. Both are
structural and both have known fixes, which is what makes this worth a first-class slot
rather than a footnote.

### 2.4 Data
Read `var_backtest_runs` directly, ordered DESC, paged. Never call the functions —
`atlas_regime_cvar` is 706–710 ms per axis against a 3s anon cap.

---

## 3 · A3 — Structural regimes

### 3.1 The zero-episode problem *(Q4)*
**Neither equal billing nor hiding. The lifetime record is the primary content.**

A theme's current state is one row of 5,900 and is `dormant` almost always. Rendering
current state as the headline makes four themes look identical and says nothing. Rendering
only themes that have fired conceals the most important result the engine has produced.

So each theme shows **what it has detected across its whole measured history**: episodes
entered by type, longest run, sessions measured — with a compressed state-history strip
making the record legible at a glance. A theme that has never emerged is visually obvious
because its strip has no emergence in it, not because it has been annotated as a failure.

Rules:
- **Sort by evidential weight**, not alphabetically: themes that reached `established`
  first, then `emerging`, then `absorbed`-only, then retired.
- A theme with zero emergence episodes renders **"never emerged"** as its state badge and
  *"No emergence in N sessions, 2022 included"* as its line. It is **not** given a strength
  bar at zero — an absent measure, not a flagged one (§4).
- `strength` renders **only** when the state is `emerging` or `established`. At any other
  state it is not a meaningful quantity and does not appear.
- A **retired** theme stays visible, dimmed, with the reason in plain words. Productivity's
  retirement — a 60-session hold against a 30-session maximum observed run — is a finding,
  and deleting the row would delete it.
- Footer states shadow mode explicitly: nothing downstream consumes these states, and no
  theme is asserted as the current regime.

### 3.2 Data
36,241 rows against PostgREST's hard 1,000 cap. **Do not page the full history into the
client.** Add a summary view — per theme per `logic_version`: episode counts by type,
longest run per state, sessions measured, current state, current strength — and read that.
The history strip needs at most one row per state-change, which is the transitions table, not
the states table.

`logic_version` is filtered, never mixed. A surface showing v0 and v0.1 rows together would
compare two different engines.

---

## 4 · B3 — Reverse stress test

### 4.1 The unit on screen *(Q5)*
**All three, layered, in this order:** plain-language sentence, then the sigma distance, then
the factor coordinates as drill-down.

The sentence is what a PM acts on — *"the nearest plausible scenario that takes the book to
−15% is about a 2.3-sigma joint move, and it is rates-led."* The sigma distance is the number
that makes it comparable across dates. The coordinates are for whoever wants to check it.

Leading with coordinates would present the least actionable form as the headline, and
leading with sigma alone loses which factor drives it — which is the entire content.

### 4.2 Carrying the B5 caveat
B3 rests on the same Σ that B5 showed understates by ~37%. That caveat sits **on the B3
panel**, not only on B5.

Specifically: state that the distance is computed on a covariance known to understate, so
the true breaking scenario is **nearer than shown**. One line, on the face, in the same
visual weight as the result — not a footnote, not a tooltip, because the direction of the
error is what a reader needs and it is not symmetric.

Render the labelled unconditional reference row alongside the regime-conditional result, as
already decided.

### 4.3 Not yet
B3 has no backend. This is design direction so the eventual build has somewhere to land —
**not authorisation to start it.** Sequencing below.

---

## 5 · E2 and E1.4

**E2 — agreed, do not design it.** The brief's reasoning is correct: two of four themes have
no state history to transition through and all 27 `bench_claims` are untested, so one axis of
the join is a constant. It would render empty and the emptiness would read as a fault. E2
waits on A3 having a surface *and* the engine producing states worth joining to — and if the
v0.1 re-run lands at 0 of 4, E2 is retired with the theme layer.

**E1.4 — unchanged.** Deferred to 30 days of E1.3 drift observation. The B4 test asserting
the absence of a flag-shaped column is the gate working; leave it.

---

## 6 · Sequencing *(Q6)*

The brief's instinct is right and is adopted, with the P0 items ahead of it:

1. **P0-a** `segment_verdicts` RLS — tonight, independent of everything.
2. **P0-b** `regime_theme_states` read policy — with or before A3.
3. **P1** staleness investigation on the three tables at 2026-09-11.
4. **B5** — data exists, panel is bounded, closes a loop already paid for.
5. **A3** — read policy, summary view, surface.
6. **B3** — backend then surface, after B5 has shipped and its caveat is visible.
7. **E2** — last or never.

---

## 7 · Spec or direct build *(Q7)*

**This document is the spec. Build directly from it.**

The backend is settled and the data contracts are fixed, so a further per-surface spec would
restate what §1–§4 already decide. What needed deciding was presentation of absence,
dormancy and uncertainty, and that is here.

Where this document does not cover something — a layout detail, a component boundary, a
naming choice inside the repo's conventions — **decide it and note it in the report.** The
brief's §7 list is the right boundary: what you should not invent is how an unmeasurable or
dormant result is presented, and §2.2, §3.1 and §4.2 now answer that for each surface.

---

## 8 · Acceptance

1. P0-a and P0-b applied; `anon` can read `regime_theme_states` and cannot write
   `segment_verdicts`. Prove both.
2. P1 reported: whether the three stale tables' writers are running, and what they wrote.
3. B5 renders two panels, all three confidence levels, and the decomposition chain with
   causes in words. No single-level view exists anywhere in the component.
4. A3 renders four themes sorted by evidential weight; energy shows "never emerged" with no
   strength bar; productivity shows dimmed with its reason; `logic_version` filtered to one.
5. A3 reads a summary view, not paged state history. Confirm the row count the client
   fetches.
6. No surface calls `atlas_regime_cvar` or any per-axis function. Report the slowest query
   each panel issues, measured.
7. A cancelled query renders as the feed not answering, never as a statement about the data.
8. No mock fallback anywhere in these components.

**Report back:** screenshots of B5 and A3, the measured slowest query per panel, and the P1
finding. B3 is not started.
