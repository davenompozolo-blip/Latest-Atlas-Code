# Performance module — handoff, steps 4–9

## The visible build

**Date** 2026-08-27
**Companion to** `perf-module-three-level-build-spec.md` — that document still governs data; this one governs the surface.
**State** Steps 0–3 merged (#751, #752). Data layer answers all of §2.

---

## 1. Artifacts

Commit all four to `docs/mockups/`.

| File | Status | Use for |
| --- | --- | --- |
| `L3_counters_flip.html` | **Authoritative.** Self-contained, real tokens, working flip. | Step 4 in full — segment header, tile front, tile back, flip mechanics |
| `L2_bets.html` | **Authoritative.** Self-contained, real tokens, real numbers. | Step 5 in full — toggle, risk strip, segment rows, two-bar device, collapsed tail |
| `head_to_head_position_verdict_mockup.html` | **Partly superseded.** Depends on chat CSS vars — renders unstyled if opened raw. | The **one-sided (KMTUY) card** only. Its Tier 1 detail face is superseded by the AMD back face in `L3_counters_flip.html`. |
| `tier2_book_basis_verdict_card_mockup.html` | **Partly superseded.** Same var dependency. | The **Tier 2 basis line** (`vs book` + best correlate named) and the **three-bar block** layout. Take spacing from spec §8.3. |

The two authoritative files carry the palette inline. Read the `:root` block — those are the values to use, not approximations:

```
--bg #0a0d12   --card #121821   --card-2 #161d27
--cyan #3ad6e0   --amber #f5a623   --green #43d68a   --red #f2645a   --violet #8b7ff0
--line rgba(255,255,255,.07)   --line-cy rgba(58,214,224,.22)
--t1 #e6edf4   --t2 #8fa1b3   --t3 #5b6b7c
Syne 500/600/700 · DM Sans 400/500 · JetBrains Mono 400/500/600
```

**Rule unchanged:** mockups win on layout, spec wins on data. Where neither is explicit, ask rather than invent.

---

## 2. Decisions since the spec was written

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | **Default grouping is `BY THEME`** | 44 segments with 37 singletons is a list; 13 is a set of bets. The partition remains the analytical basis — this is which view opens, nothing more. `BY BET` is one tap away. |
| 2 | **Top 8 rows, remainder collapsed** | Per §2.3b. The risk strip still shows all 44 proportionally, so the tail stays visible even while collapsed. |
| 3 | **`grouping` belongs in the segment key** — CC's departure accepted | `theme:Industrials / electrification` is one name under `BY BET` and a whole theme under `BY THEME`. Same id, different membership. The key must carry the grouping. |
| 4 | **Shared preflight, not a copy** — accepted | Level 2 populated against an empty level 3 for a date would be worse than both refusing. |
| 5 | **`sub_threshold` is gone** | Spec §2.4 still lists the column; §2.3 deletes the concept. The later correction wins — drop the column. |
| 6 | **NVDA gets its own row** | It sits outside cluster 199, so semis and AI are additive rather than one bet. 4.7% of risk on 3.1% of weight. |

Before building level 2, confirm `BY THEME` covers all 59 positions. Anything unmapped renders as its own visible row — never silently excluded.

---

## 3. Step 4 — Level 3, counters

Build against cluster 199 first. `L3_counters_flip.html` is the reference.

**Segment header** — breadcrumb, Syne title, weight/risk/vs-book triplet right-aligned in mono, reading sentence, then the hint line.

**Tile front** — retains what already ships. Symbol and verdict pill, cyan tier line, `vs cluster median` or `vs rest of book` cap, the excess at 33px mono with `pp` at 20px, progress track with glow on the fill, own-vs-peer row, rank line, best-peer sub, then days-held and value in a footer separated by a hairline.

**Tile back** — three-bar block (`best peer` / `peer median` / **what you did**, that order, last one heavier), three-metric strip bounded top and bottom by hairlines, thesis and conviction row, one action button.

**Flip** — 316px box, `preserve-3d`, `.58s cubic-bezier(.4,0,.2,1)`, click to toggle. Action buttons call `event.stopPropagation()`.

**Height is a hard constraint.** The peer-rank table does not fit alongside the three-bar block. It goes to a detail route or drawer. Do not shrink type below 10px to force it.

---

## 4. Step 5 — Level 2, bets

`L2_bets.html` is the reference.

Toggle → risk strip (all 44, descending, one colour per segment) → strip caption → eight segment rows → collapsed tail.

**Segment row:** name plus kind badge (cyan treatment for `cluster`, neutral for `theme` and `unpaired`), `excess_vs_book_pct` right-aligned, the two-bar device, then one or two insight sentences.

**The two-bar device is the point of this level.** Weight above, risk below, **identical 0–100% scale**, both labelled, `min-width: 2px` on the fill so a 0.1% share stays visible. Risk fill carries the glow; weight fill does not. That asymmetry is deliberate — risk is the reading.

**Insight sentences are templated from §2.5 thresholds. No LLM call.** A sentence that varies between renders can't be tested or trusted. One `<em>` per sentence at most, on the clause that carries the finding.

Row hover: a left-to-right cyan wash at ~4.5% opacity. Rows route to level 3.

---

## 5. Step 6 — Level 1, book

No mockup file — build from spec §3 and the two authoritative files' visual language.

Hero (trading effect, Syne, ~48px, one sentence beneath) → four metric tiles including `measured / total` → process panel in a **pending** state until Phase 1 lands → verdict distribution bar, tappable → top three segments, then *see all bets*.

One earned sentence per section.

---

## 6. Steps 7–9

**Navigation.** `PERF` lands on Book. Book → Bets → Counters → flip. Breadcrumb at every level, matching the `Book › Bets › Semis & accelerators` pattern in the mockups. Filter state persists on back, clears on tab exit. Old flat grid behind a flag.

**Edge cases — all four.** Unpaired sub-grouped by verdict, not one block. Bench strip collapsed to one line until a claim is judged. One-sided card per the KMTUY reference. Gate reasons (`stale_mark`, `ledger_mismatch`, `basis_mismatch`) visible on tiles, never blank or zero.

**Tokens and checklist.** Palette above, then §7 below, reported item by item.

---

## 7. Acceptance checklist

Report against this explicitly. Every item is verifiable from a screenshot.

**Level 3**
- [ ] Flip works on click, 316px, `stopPropagation` on the action
- [ ] Front retains shipped content, footer row hairline-separated
- [ ] Back carries three-bar block, three-metric strip, thesis, conviction, action
- [ ] Three-bar block suppressed on single-transaction positions
- [ ] Peer-rank table on a detail route, not crammed in
- [ ] Card basis governed by `cluster_eligible` — a paired-but-ineligible segment shows Tier 2 cards

**Level 2**
- [ ] `BY THEME | BY BET` toggle present, theme selected by default
- [ ] `BY THEME` covers all 59, or the gap renders as its own row
- [ ] Risk strip shows all 44 proportionally, descending
- [ ] Eight full rows, remainder in one expandable tail
- [ ] Two-bar device on every full row, shared scale, both labelled, `min-width` on the fill
- [ ] Cluster 199 reads 19.3% weight against 44.1% risk
- [ ] Bond sleeve reads 3.4% weight against 0.1% risk and remains visible
- [ ] Insight sentences deterministic, ≤2 per segment
- [ ] `risk_share` closes to 1.0 under both groupings

**Level 1**
- [ ] Lands on Book, not the grid
- [ ] Hero is trading effect, Syne, one sentence beneath
- [ ] Four tiles including `measured / total`
- [ ] Process panel present in pending state
- [ ] Verdict bar renders and filters

**Global**
- [ ] Breadcrumb at every level
- [ ] Every number names its basis
- [ ] No screen mixes two bases without labelling both
- [ ] Palette and fonts match the `:root` block
- [ ] Old grid behind a flag, not deleted

---

## 8. What not to do

- Do not merge segments to reach a target count. 44 is correct; the collapse is a render rule.
- Do not average member excesses into a segment figure. `excess_vs_book_pct` is a segment-scope counterfactual.
- Do not generate insight sentences at runtime.
- Do not let a gate reason render as blank or zero.
- Do not reintroduce `sub_threshold`.
- If scope has to give, it gives from step 8 — never from the toggle or the two-bar device.

---

## 9. Order

4 → 5 → 6 → 7 → 8 → 9. Steps 4 and 5 are the build worth seeing; 6 is quick once their visual language exists. Flag anything where the mockups and the data disagree rather than resolving it silently — that has been the most useful thing this project has produced.
