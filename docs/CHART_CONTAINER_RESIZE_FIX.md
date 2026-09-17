# The chart resized with the window, and the toggle never touched the window

**2026-09-17.** Reported from the terminal: the Major indices chart transitions
badly when you flip the Board between COMPOSITE and WORKINGS.

## What was wrong

`useLwChart` (`src/pages/nexus/nexusChart.js`) listened to `window.resize`.

The flip does not resize the window. It resizes the **container**: `IndexChart`
receives `span2: face === 'workings'`, `.nb-span2 { grid-column: 1 / -1 }` takes
the card from one grid column to the full row, and `.nb-span2 .nb-chart` takes
the chart from 220 px to 240 px. No window event, so the listener never fired
and the canvas kept the size it was built at.

Measured in a harness that changes nothing but the container's box:

| | container | chart canvas | overflow right |
|---|---|---|---|
| mounted on WORKINGS | 930 × 240 | 930 × 200 | 0 |
| after flip to COMPOSITE | **441 × 220** | **930 × 200** | **+489 px** |
| flipped back | 930 × 240 | 930 × 200 | 0 |

489 px of chart outside a 441 px card — and the right price scale is the
rightmost 36 px of it, so the axis goes off screen entirely. That is the
reported screenshot exactly: `docs/board-flip-before.png`.

Two further faults in the same four lines, both permanent rather than
flip-dependent:

- **Height was never taken from the container at all.** `baseOpts` defaulted to
  200 px inside a 220 px box, and the pair explorer passed `{ height: 250 }` as
  an option — a JS constant restating `.np-chart { height:250px }`, with a
  comment asking the next editor to keep the two in step.
- **`fitContent()` ran only at build.** With `fixLeftEdge`/`fixRightEdge` the
  time scale is pinned, so a width change without a refit leaves the series at
  the bar spacing it was built at.

## The fix

A `ResizeObserver` on the container, applying **both** dimensions from the
element's real box and refitting the time scale. The container is now the only
source for the chart's size, so `CHART_H` is retired and the CSS rule is the one
place a height is written.

| | container | chart canvas | overflow right |
|---|---|---|---|
| mounted on WORKINGS | 930 × 240 | 930 × 240 | 0 |
| after flip to COMPOSITE | 441 × 220 | 440 × 220 | −1 |
| flipped back | 930 × 240 | 930 × 240 | 0 |

`docs/board-flip-after.png`. The 1 px is the sub-pixel of a 441.x column.

Both directions were measured, because the two are different failures: growing
leaves dead space, shrinking carries the axis off screen.

The window-resize case the old listener *did* cover still works — the pair
explorer goes 930 → 630 with the chart tracking it — because a viewport change
is also a container change. One code path now covers both.

## The other half: the flip had no gesture

With the resize fixed the chart is correct at 40 ms, but the surviving card
still **snapped** to its new width in the frame its neighbours began a 400 ms
`nf-fade`. Two motions that do not read as one.

Grid placement is not transitionable, so the card replays the house entrance
instead: `.nb-refade-a` / `.nb-refade-b`, alternating with `span2`.

**The two classes carry two different `@keyframes` names with identical
content, and that is the whole mechanism.** The first attempt gave both classes
`animation: nf-fade` and changed only the class name — which restarts nothing,
because an animation replays on a change of `animation-name`. It failed
silently and looked exactly like the unfixed snap; `getAnimations()` showed the
card's single `nf-fade` sitting finished at `currentTime: 400` right across the
flip. With distinct names the card measures 0.025 → 0.496 → 0.96 → 1 over the
same 400 ms its neighbours run.

No `key`: remounting would have replayed the entrance for free and reset the
index chart's symbol and range selection with it.

`prefers-reduced-motion: reduce` disables the replay — the card snaps, which is
what shipped before this — and the resize still happens (measured: container and
chart both 930 under `reducedMotion: 'reduce'`).

## Blast radius

`useLwChart` has four callers: `NexusBoard.js` ×3 (Vix, Breadth, Index) and
`NexusPairExplorer.js` ×1. The ~45 other `useChart(` hits in `src/pages/` are a
**different hook**, `src/pages/utils.js:309`, and are untouched.

Retiring `CHART_H` is behaviour-neutral, not merely believed to be: the pair
explorer measured 930 × 250 before and 930 × 250 after.

278 tests pass; `vite build` clean.
