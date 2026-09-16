# F-1 — Regime tab pane switcher

Register ID **F-1** (F3 §3). Specs F2 §1, F3 §1.
Screenshots: `docs/f1-regime-pane-{pairs,axes,macro}.png`.

---

## 1 · What changed

The A2.2 layout — pair explorer pinned on top with a two-state toggle beneath — is
replaced by a pane switcher. One pane visible at a time, pair explorer on load,
selection persisting across navigation within the session.

That also resolves a concern the old file recorded about itself: the explorer no longer
sits permanently above the axis panel, so detail no longer outranks summary by position.
The explorer's own **content** is untouched — A2.2 still governs it.

**Panes are data.** Nothing in the switcher counts them or names them; the registry is a
list and the pure logic lives in `nexusRegimePanes.js`. F-2 adds the structural-regimes
pane by adding one entry.

## 2 · Three panes, not four — and why

F3 §1's table lists four. Three ship here; the fourth is **F-2's**, which the register
makes a separate ID with its own dependency (P0-b).

A fourth tab that selects an empty pane is a dead control in a live terminal. The
switcher is built for four and the test asserts the logic is agnostic to how many there
are, so F-2 is one registry entry and no logic change. Decided under F1 §7.

## 3 · The spec contradiction, and how it was resolved

F2 §1 asks for two things that **cannot both hold literally here**:

> "All panes mount and are hidden by script, never conditionally rendered" — so a first
> switch cannot jump.
> "Each pane fetches on first reveal, not on page load" — so the tab does not fire every
> pane's queries at once against a 3 s anon cap.

Every pane self-fetches in a mount effect — `NexusPairExplorer`, `NexusAxes` and the
macro dashboard all do — so **mounting them all IS fetching them all**. The two rules are
the same rule pulling in opposite directions.

The spec states the reason for each, and the reasons decide it. A cancelled query renders
as *"no data"* — a false statement about the market, which this codebase has recorded in
four layers. A jump on one first switch is cosmetic. So:

**A pane mounts on first reveal and thereafter stays mounted, hidden by style.**

That delivers the mount rule's actual purpose — no refetch on toggle, no jump on any
switch after the first — without the stampede. Reasoning is recorded in the code, not
just here.

## 4 · Proven by observation, not by reading the code

A render harness counted every REST/API request by target and drove the tab.

| | requests observed |
|---|---|
| **At load** | `ratio_pairs`, `factor_axis_loadings`, `factor_axes`, `market_prices` |
| | — `factor_axis_scores`, `book_factor_betas` and `/api/macro` **absent** |
| **After selecting Intermarket axes** | `factor_axis_scores`, `book_factor_betas` appear |
| **After selecting Macro dashboard** | `/api/macro` appears |
| **Returning to Pair explorer** | 10 requests before, **10 after — no refetch** |

DOM state tracked alongside: at load only `nr-pane-pairs` exists; after visiting all
three, all three `[role=tabpanel]` nodes exist with **exactly one** at `display:block`
and the others at `display:none`. Nothing is unmounted once revealed. No console errors.

**Persistence, across a real reload:** stored key `macro`, active pane after reload
*Macro dashboard*, and requests after reload were **`["api:macro"]` only** — the explorer
did not fetch, because it was never revealed. Restoring a non-default pane does not drag
the default pane's queries with it.

**A stale stored key falls back rather than selecting nothing:** seeded
`atlas.regime.pane.v1 = 'retired-pane'`, reloaded, landed on *Pair explorer*. This is the
case that matters if a pane is ever renamed — the value is per-browser, so it would
otherwise strand exactly the people who use the tab most.

**Keyboard:** roving tabindex, `ArrowRight` → *Intermarket axes*, `End` → *Macro
dashboard*, per the WAI tablist pattern. Wrapping is deliberate on a list this short.

## 5 · Measured query times (F2 §5.2)

As `anon`, against the 3,000 ms cap:

| Pane | Slowest read | Measured |
|---|---|---:|
| Pair explorer | `market_prices` — 16 symbols, 976 rows, **one page** | **27.6 ms** |
| | `ratio_pairs` (cold, first query of the batch) | 44.8 ms |
| Intermarket axes | `factor_axis_scores` (720 rows) | **44.7 ms** |
| | `book_factor_betas` (200) | 10.7 ms |
| Macro dashboard | `/api/macro` — a Vercel function, not a DB read | not measurable here |

Shared reads (`factor_axes`, `factor_axis_loadings`) are 7–9 ms. Everything is two orders
of magnitude inside the cap; the tab was never at risk from any single query, only from
firing them simultaneously — which is what §3 prevents.

## 6 · Decided under F1 §7, noted here

- **Three panes now, fourth is F-2's** (§2).
- **Mount on first reveal, stay mounted** (§3).
- **`sessionStorage`, not `localStorage`** — F2 §1 says "within the session", so a new tab
  should open on the default rather than inherit a choice made elsewhere.
- **Every storage access is wrapped.** `sessionStorage` throws in some privacy modes; a
  failure is silent and means "no preference", never a broken pane. Tested against a
  throwing stub and against no storage at all.
- **The macro dashboard was extracted** from the tab body into its own component so every
  pane is one component and the registry is uniform. Its fetch now defers with the rest.
- **Roving tabindex + `aria-controls`/`aria-labelledby`** on tabs and panels.

## 7 · Found while building

**`writeStoredPane` returned `true` when there was no storage at all** — claiming a write
that never happened. Caught by its own test before it shipped. Minor in effect, but it is
the swallowed-write-failure shape this codebase has four entries about, and the fix is to
report what actually occurred.

## 8 · Screenshots

Taken through the harness with the app's own stylesheets, so the switcher chrome is real.
Pane **contents** render their empty states because the harness stubs the data layer —
that is honest rather than incidental, and the macro pane demonstrates the transport rule
working (*"Macro feed unavailable. This is a transport failure, not a reading about the
market."*). Live pane content is already captured in `docs/a2-axes-panel.png` and
`docs/a22-explorer-*.png` from A2/A2.2.

240/240 tests pass repo-wide (9 new); `vite build` clean.
