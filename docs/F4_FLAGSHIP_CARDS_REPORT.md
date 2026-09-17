# F-4 — Flagship card extension + absent variant

**F2 §2** and **F3 §2.3**. Measured 2026-09-17.

The seven metrics that collapsed into a dense text line beneath the four
decision tiles are now cards in the same grid. **"The book at a glance" is one
complete set of eleven plates, with the tape running beneath it** — the settled
readings you can look at, and the stream going past.

---

## 1 · Acceptance

**F2 §5 clause 4** — *flagship cards extended, existing card styling untouched;
diff shows no change to the four originals.*

A diff cannot show this: `NexusPortfolio.js` is a rewrite, so the four originals
have no surviving lines to compare. Proven by **rendering both components side
by side** — the pre-F-4 component pulled from `git show HEAD:` and the new one —
and comparing the four originals on every axis that could have moved:

| Original | value | sub-line | colour · size · tile |
|---|---|---|---|
| Day P&L | `+$210` | `+0.2% today` | identical |
| Unrealised P&L | `+$4,842` | `+2.9% on cost` | identical |
| Long exposure | `$172,091` | `63 positions · 1.74× lev` | identical |
| At risk | `10` | `positions down > 10%` | identical |

**PASS** on all four, comparing rendered text, computed colour, font size,
background, border-radius, padding and box-shadow.

**F2 §5 clause 5** — *a metric with no computable value renders absent. Prove
with a fixture.*

Proven twice: in `nexusPortfolioCards.test.mjs` (11 tests), and on the real
render path by serving the account endpoint a 503 —
`docs/f4-portfolio-cards-absent.png`. Four cards go absent, each stating
*"broker account feed did not answer"*, and the card header reads
**"THE BOOK AT A GLANCE · 4 OF 11 NOT MEASURED"**.

| | |
|---|---|
| Cards | **11** — the four originals, then the seven promoted |
| Grid | unchanged `repeat(auto-fill, minmax(168px, 1fr))`, gap 10px, **6 columns** at 1180px |
| Absent card carries a value slot | **no** — asserted in the DOM, not just intended |

---

## 2 · The absent variant is a state, not a dash

F2 §2: *"A metric that cannot be computed renders as absent, not as zero or a
dash-with-value."* F3 §2.3 makes it a **named variant**.

A card is either measured and carries a value, or absent and carries a reason —
there is no third shape. On an absent card the `value` key **is not present at
all**, so a renderer cannot print one it was never handed. That is the
`nexusReturnBasis.js` construction: the wrong thing is impossible to write
rather than discouraged.

Styling says the same thing: dashed edge, no numeric slot, reason at sub-line
size in italic. A solid tile always holds a measurement.

### The reason had to be made honest first

`useAccount()` ended in `.catch(() => {})`. A feed that **did not answer** and a
feed that **had not answered yet** both arrived as `null` and both rendered an
em dash — so the absent state had nothing true to say. That is the
swallowed-failure pattern this codebase records in four layers, sitting in the
component the spec names as the live instance of exactly this rule.

It now resolves to `loading` / `ok` / `failed`, logs a failure at error level,
and the two cases read differently:

- failed → *"broker account feed did not answer"*
- pending → *"waiting on the broker account"*

A non-OK HTTP status and a 200 carrying no `equity` both count as failures; the
old code treated the second as success and then rendered a dash.

---

## 3 · Rules carried, and one correction to my own test

**A pair stays in one card.** `Today` is `44 / 15` and `Best / worst` is
`TSM +30.5% / MRVL` — splitting either loses the comparison that makes the
numbers worth reading. Best/worst arrives as a structure rather than a string,
because its halves are toned opposite ways.

**A genuine zero is a measurement.** 0 at-risk positions and a 0% win rate
render as numbers, toned. The `||` vs `??` trap at card level.

**Leverage needs both legs.** A long market value over zero equity yields no
`× lev` rather than a division.

**I wrote one assertion wrong and the code was right.** The test claimed an
account equity of exactly `$0` should be *absent*. It should not: an unfunded
account genuinely is zero, and absenting it contradicts the
zero-is-a-measurement rule asserted two tests above. The same reading has to
mean the same thing in every card or neither rule is worth having. Corrected the
test, not the code.

**A balance is not a P&L.** `money()` rendered negative cash as `$-73,058`, with
the sign stranded inside the amount. A balance takes no `+` when positive and
puts the minus in front of the unit: **`−$73,058`**, `$12,345`.

---

## 4 · Found on the way, deliberately not fixed

**`.np-tile` is defined twice in `nexus-flagship.css`, unscoped, and the wrong
one wins.** Line 631 is the portfolio tile (19px value, `--bg1`, radius 10,
padding 11/13); line 1522 is the **pair explorer's** tile (`np-` for *nexus
pair*, not *nexus portfolio*) at 15px, `rgba(255,255,255,.03)`, radius 6,
padding 9/11. Same specificity, later rule wins.

Measured in the browser rather than inferred: the portfolio tile computes to
**15px / rgba(255,255,255,0.03) / 6px / 9px 11px** — the pair explorer's.

**Not fixed here, and the reason is the spec.** Correcting the collision changes
how the four original cards look, and clause 4 requires they do not change. It
is a real defect with its own blast radius (two modules share the prefix) and
wants its own decision. Flagged, not folded in.

---

## 5 · Files

| File | |
|---|---|
| `src/pages/nexus/nexusPortfolioCards.js` | pure — card shape, formatting, absence, coverage |
| `src/pages/nexus/nexusPortfolioCards.test.mjs` | 11 tests |
| `src/pages/nexus/NexusPortfolio.js` | rewritten onto the card model; `useAccount` made honest |
| `src/pages/nexus/NexusFlagship.js` | `compact` prop dropped at the v2 call site |
| `src/styles/nexus-flagship.css` | `.np-tile-absent` variant |
| `src/styles/nexus-flagship-v2.css` | `.nfv2-pf-*` strip rules retired |

**The `compact` prop is gone, not left accepted and ignored.** It meant "four
tiles plus seven in a text line", and this unit removes that split, so it had no
remaining meaning. Both call sites updated.

**278/278 tests pass. Build clean.**

Screenshots: `f4-portfolio-cards.png` (eleven measured, tape beneath),
`f4-portfolio-cards-absent.png` (broker feed 503 — four absent).

Render proven, network read not: rows read server-side and replayed by patching
`window.fetch`; the real components, query builders and grid all run.
