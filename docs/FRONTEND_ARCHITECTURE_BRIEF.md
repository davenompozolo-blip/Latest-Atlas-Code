# Front-end architecture brief — the regime & risk layer has no surface

**Status: request for architectural direction. Nothing here is a decision.**
Prepared 2026-09-15 by the session that built the backend units below.

---

## The ask

We have spent the last stretch building and hardening the *foundations* of the
regime and risk layer — schema, nightly writers, invariant tests, reports. That
work is done and verified. **What it does not have is a front end.** Five
capabilities now exist in the database with either no reader at all, or a
reader that renders something else entirely.

I have detailed execution instructions for this repo — its conventions, its
recorded failure modes, its performance envelope — but **no design direction**
for what these surfaces should be. Building them on my own reading would mean
inventing product decisions that are not mine to invent, in a terminal where
several of the hard-won rules exist precisely because a surface once showed a
number that looked right and was not.

**So this is an ask for an architecture, not a proposal.** Sections 3–7 give
the inventory, the reasons each surface stopped, the constraints any design
must satisfy, and the specific questions I need answered before writing a
component. Answer those and I can build safely.

---

## 1. What is live in the database today

All figures re-measured 2026-09-15, not quoted from notes.

| Object | Rows | Latest | Written by | anon-readable |
|---|---:|---|---|---|
| `var_backtest_runs` | 24 | 2026-09-14 | `atlas_write_var_backtest`, 23:50 Mon–Sat | ✅ read policy |
| `book_regime_cvar` | 15 | 2026-09-14 | `atlas_write_regime_cvar`, 23:45 Mon–Sat | ✅ read policy |
| `regime_theme_states` | 36,241 | 2026-09-14 | `atlas_write_theme_states`, 23:30 Mon–Sat | ❌ **service only** |
| `book_factor_betas` | 10 (2 estimate sets) | 2026-09-09 | manual / C3 | ✅ read policy |
| `factor_axis_scores` (with z) | 10,110 | 2026-09-14 | `atlas_refresh_factor_scores`, 23:10 | ✅ read policy |
| `bench_claims` | 27 (all `untested`) | — | UI writes | ✅ read + insert + update |
| `position_verdicts` | 764 | 2026-09-11 | `atlas_write_verdicts`, 23:37 | ✅ read policy |
| `segment_verdicts` | 288 | 2026-09-11 | `atlas_write_segment_verdicts`, 23:38 | ⚠️ **RLS OFF** |
| `book_risk_daily` | 13 | 2026-09-11 | `atlas_write_verdicts`, 23:37 | ✅ read policy |

## 2. What already has a surface

So the gap is specific, not total. These shipped and render today:

- **Factor axes panel** — `NexusAxes.js` / `nexusAxesCompute.js`
- **Ratio explorer** — `NexusPairExplorer.js`
- **Regime tab** — `NexusRegime.js` (reads `/api/macro`)
- **Bench drift (E1.3)** — `NexusBench.js` + `benchRegimeDrift.js`

---

## 3. The five unbuilt surfaces

### 3.1 B5 — VaR backtest (Kupiec)

**Exists:** `var_backtest_runs`, 24 rows a night, indexed, anon-readable, plus
`docs/B5_VAR_BACKTEST_REPORT.md`.
**Missing:** any reader. Zero references in `src/` or `api/`.
**Why it stopped:** the spec said *"exception counts, Kupiec test, predicted vs
realised"* and those were delivered as rows. That is a defensible reading of
the unit and an unsatisfying one.

The finding is worth showing and is not obvious from one number:

- Model leg: 265 exceptions against 337 expected at 90%, **169 against 168.5 at
  95%**, 56 against 33.7 at 99%. The one level that passes is the one with no
  power — 95% is where the fat-tailed distribution crosses the normal.
- Book leg: realised sd 0.016530 against a predicted 0.012022 — **1.3749×** —
  which decomposes into **1.2100×** (Σ is a 13-year average, the window ran
  hot) and **1.1332×** (b′Σb carries no idiosyncratic variance at all).

**A design has to decide:** whether three confidences are shown together (the
argument for: reading 95% alone certifies the assumption the other two refute);
whether the two legs are one panel or two; and whether the variance
decomposition is a first-class element or a drill-down.

### 3.2 B3 — reverse stress test

**Exists:** nothing. Not in the database, not in the UI.
**Why it stopped:** never started. The decision was taken to do B5 first so the
tail assumption was quantified before more rested on it — which was correct,
and B5 then showed Σ understates by ~37% for two structural reasons. **B3 rests
on that same Σ and inherits all of it.**

Two decisions already taken and recorded: regime-conditional covariance **plus a
labelled unconditional reference row**; and closed form along `Σb / √(b′Σb)`,
no solver.

**A design has to decide:** what a "breaking scenario in sigma" looks like on
screen, and how it carries the B5 caveat without burying it.

### 3.3 A3 — regime theme engine  ← *the largest gap*

**Exists:** 36,241 state rows across four themes, a version-scoped engine, a
calibration ruling, two reports.
**Missing:** a reader — and, before that, **read access**. `regime_theme_states`
has RLS on with a `_service` policy only. **anon cannot read it at all.**
**Why it stopped:** the A3 units were specified as engine + backfill + report.
No UI unit was ever written.

Note `NexusTheme.js` is **not** this. It reads `/api/nexus-theme`, the
*holdings* theme cut — your book grouped by sector/theme. Different object,
same word. Anyone reading the tab list would reasonably assume A3 is already
surfaced. It is not.

**Design must confront the honest result:** `energy_dislocation` has spent
**zero sessions** in emerging or established across 5,900. A panel that renders
four themes as though all four are live would misrepresent the engine.

### 3.4 E2 — bench × theme transitions

**Exists:** nothing, and it is **blocked rather than merely unbuilt.**
It needs A3 states joined to bench claims. Two of four themes have no state
history to transition through, and all 27 `bench_claims` are `untested` — so
the claim axis is currently a constant. The panel would render empty and the
emptiness would read as a data fault.

**Recommendation: do not design E2 until A3 has a surface and the theme engine
has produced states worth joining to.**

### 3.5 E1.4 — thesis flagging

**Deliberately deferred**, by the 2026-09-13 ruling §8, until 30 days of E1.3
drift observation exist. B4's test asserts the **absence** of any flag-shaped
column so it cannot be smuggled in early. **This is a gate working as intended
and needs no architecture yet** — listed only so it is not mistaken for an
oversight.

---

## 4. Constraints any design must satisfy

These are not style preferences. Each one is in `CLAUDE.md` because a surface
once violated it and published something false.

1. **3s anon statement cap.** Read tables, never call the functions —
   `atlas_regime_cvar` is 706–710 ms *per axis*. A view read only by
   `service_role` has never met the anon cap; this repo has three entries about
   panels that rendered "no data" when the query was being cancelled.
2. **Never let a transport failure render as a statement about the data.** A
   cancelled query must say the feed did not answer, not "not measurable".
3. **An absent number beats a flagged one.** An axis whose beta is not
   significant renders *"no measurable exposure"* — the value is absent from
   the row shape, not merely flagged. `cyclical` is the live instance: largest
   axis by variance explained, t = 0.95.
4. **Name the basis; never substitute across it.** Two return measures on the
   same row disagree in sign on 8 of 61 names. The reader takes no fallback
   argument, by construction.
5. **Publish the denominator.** `measuredWeightPct` / `withheldWeightPct` —
   a surface states what it could not measure rather than silently
   renormalising.
6. **A fallback to mock must be loud.** Two Nexus gauges rendered fixed mock
   numbers for months beside a genuinely live tile and nothing said so.
7. **PostgREST caps at 1,000 rows whatever `limit` says.** Order DESC and page.
   Relevant to A3 at 36,241 rows.
8. **A stale input must not publish a move.** If the data cannot support the
   figure, the figure is NULL.

## 5. Prerequisites — need clearing before or with any build

- **P0 — `regime_theme_states` has no anon read policy.** Any A3 surface is
  blocked until it does. One migration, the `_read`/`_service` pair its
  siblings carry.
- **P0 — `segment_verdicts` has RLS entirely off.** Same hole `book_regime_cvar`
  had until today: Supabase's default grants give anon INSERT and only RLS takes
  it back, so an append-only verdict history is open to anonymous writes. Not
  strictly a front-end item, but it is in this family and it is live.
- **P1 — `book_risk_daily`, `position_verdicts`, `segment_verdicts` are stale
  at 2026-09-11** while the nightly jobs run. Worth confirming they are writing
  before a surface depends on them.

## 6. Questions I need answered

1. **Where do these live?** New tabs on the Nexus flagship, panels on the
   existing Regime tab, or a new Risk module? The Regime tab is the natural
   home for B5 and B3, but it currently reads only `/api/macro`.
2. **B5 — one panel or two?** The model leg and book leg answer different
   questions and I have kept them apart everywhere in the backend. Does that
   separation carry to the UI, or is it an implementation detail a surface
   should hide?
3. **B5 — is the variance decomposition first-class?** It is the actionable
   part (1.21 × 1.13, not the tail) and also the hardest to render honestly.
4. **A3 — how should a theme with zero episodes render?** Four themes where one
   has never left dormant across 5,900 sessions. Equal billing would be a lie;
   hiding it would conceal a real result.
5. **B3 — what is the unit on screen?** A sigma distance, a factor-space
   coordinate, a plain-language sentence, or all three?
6. **Sequencing.** My instinct is B5 first (data exists, panel is bounded,
   closes the loop on work already done), then A3's read policy plus surface,
   then B3, and E2 last or not at all. Is that the right order for you?
7. **Does any of this need a written spec first**, in the style of the A3/B0
   specs, or is a direct build acceptable given the backend is settled?

## 7. What I will not do without direction

- Invent the visual language for a surface that reports risk numbers.
- Decide how an unmeasurable or dormant result is presented — every one of the
  constraints in §4 is a decision about exactly that, and they were made
  deliberately elsewhere.
- Build E2 over a join whose inputs are constant.
- Touch `logic_version` on any append-only history, or add a flag the 09-13
  ruling deferred.
