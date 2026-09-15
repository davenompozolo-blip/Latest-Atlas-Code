# F2 — Regime panes, flagship cards, and the tape

Supplements F1. **Supersedes F1 §1** on where B5 and B3 live.

Project `vdmojjszvvcithuxwexx`. F1 §4's constraints remain binding — in particular: an
absent number beats a flagged one, a transport failure never renders as a statement about
the data, and a fallback to mock must be loud.

---

## 1 · Regime tab — pane switcher

F1 put B5 and B3 in a Risk module on the argument that they describe the book rather than
the market. The product owner's call is that they belong on the Regime tab alongside the
pair explorer, reachable by toggle. **That call stands and F1 §1 is withdrawn.**

The Regime tab becomes the regime workspace: market state, and the consequences of being
positioned in it.

### Panes

| Pane | Component | Source |
|---|---|---|
| Pair explorer | `NexusPairExplorer` | built |
| Intermarket axes | `NexusAxes` | built |
| Structural regimes | new | F1 §3 |
| Tail & scale | new | F1 §2, plus the distribution below |
| Reverse stress | new | F1 §4 |
| Macro dashboard | existing | built |

One pane visible at a time. Pair explorer default. Selection persists across navigation
within the session.

The A2.2 layout — pair explorer fixed on top with a two-state toggle beneath — is replaced
by this. Everything A2.2 specifies about the pair explorer's *content* is unchanged.

**All panes mount and are hidden by script**, never conditionally rendered: an unmounted
pane cannot be measured and will jump on first switch.

**Each pane fetches on first reveal, not on page load.** Six panes fetching at once against
a 3s anon cap is how this tab starts rendering "no data" for queries that were cancelled.
Cache per session; do not refetch on every toggle.

### Addition to F1 §2 — show the distribution
The tail-shape panel gets a histogram of standardised book returns with the normal density
overlaid and the three VaR thresholds marked, the 99% tail shaded.

The three ratios state the defect; the distribution lets a reader see it. A body that is
taller and narrower than the normal with heavier tails is one picture and three numbers, and
the picture is what makes "one defect, not three results" legible. Bin from the stored
return series; do not recompute VaR client-side.

---

## 2 · Flagship — portfolio metrics become cards

Currently a dense strip of text beneath the four cards: account equity, cash/margin, win
rate, today's up/down count, top concentration, best/worst, WTD quality.

**Promote these into cards in the existing grid.**

- **Keep the existing card design exactly.** Same border, radius, padding, type scale, label
  treatment, value treatment. This is an extension of a pattern, not a redesign — do not
  restyle the four that are already there.
- Sizing fits seamlessly: same grid, same gap, wrapping naturally at each breakpoint. No
  card is visually privileged over another by size.
- Each card carries a label, a value, and where one already exists, its subordinate line
  (the way *"63 positions · 1.74× lev"* sits under long exposure).
- Where a metric is a pair — best and worst, today's up/down — keep it in one card; splitting
  it loses the comparison that gives it meaning.
- **A metric that cannot be computed renders as absent, not as zero or a dash-with-value.**
  Account equity against a stale snapshot is the live instance of exactly this.

The strip beneath is then vacated for the tape.

---

## 3 · The tape

An exchange-style ticker running horizontally where the strip used to be, in three sprints,
cycling.

**Sprint 1 — names.** Best and worst individual performers today, with ticker and move.
**Sprint 2 — groups.** Sector, index and regional performance.
**Sprint 3 — signals.** The ratio pairs: daily, weekly and monthly change on each, with the
axis each belongs to.

Sprints run in that order and loop. A visible separator between sprints so a reader knows
which frame of reference they are in — an unlabelled tape mixing a single stock, a sector
and a ratio is three incompatible units in one stream.

### Behaviour
- Continuous horizontal scroll, seamless loop. Constant velocity — no easing per item.
- **Pause on hover and on focus.** A tape that cannot be stopped cannot be read.
- **Respect `prefers-reduced-motion`**: no scroll, render as a paged static list with the
  same three sprints.
- CSS transform only. No layout-affecting animation, no per-frame JS.
- Keyboard reachable: each sprint is a focus stop.

### Data honesty
- **A sprint with no data is skipped, not padded.** If sector data is unavailable, the tape
  runs two sprints and does not fabricate a third.
- Sprint 3 reads the same series the pair explorer reads. **One source**; the tape and the
  explorer must never be able to disagree.
- Every value carries its own freshness. A tape is a format that makes stale numbers look
  live, which is precisely the failure this codebase has recorded twice.

---

## 4 · The read

Replace the flagship read with an intermarket read, generated from the pair and axis data
already on hand.

**What it says**, in this order:

1. **What the ratios are doing** — which relationships are moving and in which direction, in
   plain language rather than by ratio name. *"Credit is leading Treasuries and industrials
   are leading utilities"* rather than *"HYG/TLT +1.2%, XLI/XLU +0.8%"*.
2. **What that implies about the market now** — the interpretation the movement supports.
3. **Where the relationships disagree** — named, not resolved.

**Rules, carried from every read on this build:**
- No regime label. No composite score. No single verdict word.
- Where the axes are contested, the read says the state is not established.
- An axis with no measurable book exposure contributes market information only; it never
  receives an interpretation of its beta.
- It must be able to say there is nothing to read — a quiet tape is a valid output and is
  more useful than a manufactured narrative.
- Ends with a derivation line naming what it was computed from.

**Generated per session from stored data, never authored, never cached across days.** A read
that persists past its inputs is a statement about yesterday wearing today's date.

---

## 5 · Acceptance

1. Six panes, one visible, pair explorer default, selection persists. All mounted, none
   conditionally rendered; no layout jump on first switch.
2. Each pane fetches on first reveal. Report the measured slowest query per pane.
3. Tail & scale renders the distribution with the normal overlaid and the three thresholds
   marked. No single-confidence view exists anywhere (F1 §2.2).
4. Flagship cards extended, existing card styling untouched — diff shows no change to the
   four originals.
5. A metric with no computable value renders absent. Prove with a fixture.
6. Tape runs three sprints, loops, pauses on hover and focus, honours
   `prefers-reduced-motion`, and skips an empty sprint rather than padding it.
7. Sprint 3 and the pair explorer read the same source. Prove they cannot diverge.
8. Read generated from stored data, asserts no regime label, and can return "nothing to
   read". Prove the last with a fixture.

**Report back:** screenshots of the flagship with extended cards and the tape mid-sprint,
the regime tab on each pane, the slowest query per pane, and the read's output for the
current session.
