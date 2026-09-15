# F3 — Placement, gaps, and the build register

Closes out F1/F2. Read alongside them; this document settles what they left open or
contradicted.

---

## 1 · B5 and B3 live in the Risk module — final

F1 §1 put them in Risk. F2 §1 withdrew that and made them Regime panes. **F1 §1 is
reinstated and F2 §1's pane list is corrected.** This is the last word on it; do not
re-open.

### The Regime tab has four panes, not six

| Pane | Component | Status |
|---|---|---|
| Pair explorer | `NexusPairExplorer` | built · default |
| Intermarket axes | `NexusAxes` | built |
| Structural regimes | new, F1 §3 | to build |
| Macro dashboard | existing | built |

Everything else in F2 §1 — mount-all-hide-by-script, fetch on first reveal, persisted
selection, no layout jump — applies unchanged to these four.

### Where exactly in Risk

Two sections, in this order, beneath whatever the Risk module renders today:

**§ Model validation — "Does the risk model work?"**
Contains both B5 legs: tail shape (the three confidence levels and the distribution) and
scale (the variance decomposition chain). F1 §2 governs its content in full.

**§ Reverse stress — "What breaks this book?"**
B3. F1 §4 governs: sentence, then sigma distance, then shock vector; the B5 caveat on its
own face at full weight.

**Before building, report the Risk module's current structure.** If it already carries a
VaR or model-quality section, these extend it rather than sitting beside it — two places
reporting model quality is the duplication problem the quadrant taught us about.

**Cross-link, do not duplicate.** The Regime tab's axes pane may link to Model validation.
Neither B5 nor B3 renders on the Regime tab in any form, including a summary tile.

---

## 2 · Three gaps in F2

### 2.1 — The tape's data sources are unidentified
F2 §3 specifies three sprints and says an empty one is skipped, but never says what feeds
them. Sprint 1 and Sprint 3 are safe — positions for names, `market_prices` for ratios.
**Sprint 2 (sector, index, regional) has no identified source** and may not exist.

**Instruction:** before building the tape, report what source exists for each sprint. If
Sprint 2 has no source, **build the tape with two sprints and report it** — do not
substitute sector aggregates computed from the book's own holdings, which would be the
book's sector performance masquerading as the market's. That substitution is the exact
basis-confusion failure the constraints prohibit.

### 2.2 — The read's sources are unstated
F2 §4 gives the rules and not the inputs. The read is computed from:

- `factor_axis_scores` — axis state and dispersion, for the disagreement clause
- ratio-level moves derived from `market_prices` legs — same source as the pair explorer
- nothing else

It does **not** read `book_factor_betas`. The flagship read is a statement about the market,
not about the book's exposure to it — that is the Regime tab's coherence read, which remains
flag-off under its own 30-day gate.

### 2.3 — The absent-value card state needs to be a defined variant
F2 §2 states the rule in a line. Make it a **named card variant** with its own styling —
dashed border, no numeric slot, label plus reason — not an ad-hoc branch inside each card.

This will be hit on day one: `book_risk_daily`, `position_verdicts` and `segment_verdicts`
are stale at 2026-09-11 (F1 P1), so any card derived from them has no current value. A
defined variant means that renders correctly rather than as a zero.

### Not gaps, decided by CC
Tape scroll velocity, pane persistence mechanism, component boundaries, and where the sprint
separator sits in the DOM. F1 §7 stands: decide and note it in the report.

---

## 3 · Build register

The answer to "ensure they're actually built and not forgotten". Every outstanding unit,
with its governing document. **CC reports against these IDs** — a unit is done when its
acceptance clause passes, not when a component renders.

| ID | Unit | Spec | Depends on | Status |
|---|---|---|---|---|
| **P0-a** | `segment_verdicts` RLS | F1 §0 | — | **tonight, independent** |
| **P0-b** | `regime_theme_states` anon read | F1 §0 | — | before A3 |
| **P1** | Staleness investigation, 3 tables | F1 §0 | — | before any card over them |
| **F-1** | Regime tab pane switcher, 4 panes | F2 §1, F3 §1 | — | |
| **F-2** | Structural regimes pane | F1 §3 | P0-b | |
| **F-3** | Risk § Model validation (B5, both legs + distribution) | F1 §2, F2 §1 addition, F3 §1 | — | |
| **F-4** | Flagship card extension + absent variant | F2 §2, F3 §2.3 | P1 | |
| **F-5** | Tape | F2 §3, F3 §2.1 | source report | |
| **F-6** | Intermarket read | F2 §4, F3 §2.2 | — | |
| **B3-be** | Reverse stress backend | master §7 | B5 shipped | not started |
| **F-7** | Risk § Reverse stress | F1 §4, F3 §1 | B3-be | |
| **E2** | Bench × theme transitions | — | A3 surface + v0.1 re-run | **held** |
| **E1.4** | Thesis flagging | — | 30d E1.3 observation | **held** |

**Order:** P0-a, P0-b, P1 → F-3 (B5, data already exists) → F-1, F-2 → F-4, F-5, F-6 →
B3-be → F-7.

B5 goes first among the surfaces because its data is already written nightly and its panel
is bounded — it closes a loop already paid for, and B3 inherits its caveat, so B5 must be
visible before B3 exists.

**A unit is not done until its report states the acceptance clause passed.** F1 §8 and F2 §5
hold; where they conflict with this document, this document governs.

---

## 4 · What is explicitly not in scope

- No B5 or B3 tile on the Regime tab, flagship, or anywhere outside the Risk module.
- No coherence read enabled — still flag-off, still 30-day gated.
- No thesis flagging, no flag-shaped column. The B4 test asserting its absence stays.
- No E2.
- No theme surfaced as a current regime label, on any page.
