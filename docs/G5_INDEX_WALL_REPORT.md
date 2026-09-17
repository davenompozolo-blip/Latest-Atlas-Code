# G-5 · The index wall

**2026-09-17.** The four major indices given a home on the flagship, below
the holdings table, in two faces.

## What existed, and why neither was enough

The Markets module draws SPY / QQQ / DIA / IWM as **four TradingView
iframes** — four third-party documents, four sockets, and a theme nobody here
controls. The Nexus board draws **one of the same four at a time** behind
symbol chips. Neither lets you see them together, which is the only way the
question *"which one is carrying this tape"* gets answered.

`board.indices` is **already loaded** for the board, so the wall adds no
endpoint and no request. Charts are the house lightweight-charts scaffold.

## Two faces

| | Shows | Answers |
|---|---|---|
| `SEPARATE` | small multiples at native price | what each index did |
| `COMPARED` | all four rebased to 100 on a common session, one chart | which index did better |

Same four series, same question, two readings — the bar `NexusFaceToggle`
sets. Neither face shows a leg the other lacks.

## Rebasing is where this goes wrong if you are casual

**Four series rebased each from its own first bar are four different
experiments drawn on one chart.** If QQQ's window starts a session later than
SPY's, the two lines answer different questions and whichever began on a down
day looks better for free.

The compared face rebases on the **intersection** of the four date sets, and
publishes what that cost. Measured on a fixture where DIA starts 40 sessions
late:

```
COMPARED @ Max   174 common sessions, 2026-02-27 → 2026-10-28
                 · 40 sessions dropped so every leg shares one origin
                 QQQ +36.4%  SPY +25.9%  DIA +19.5%  IWM −2.3%

SEPARATE @ 1Y    SPY +32.09%  QQQ +47.41%  IWM −4.15%  DIA +19.47%
```

**SPY reads +25.9% compared and +32.09% separate, and both are right.** The
compared figure starts 40 sessions later because that is where DIA's history
begins. Reading the separate figures against each other — SPY's +32.09%
against DIA's +19.47% — compares different windows and is the exact mistake
this face exists to prevent. The alignment cost is printed under the chart, in
the reader's path, rather than absorbed silently.

The separate face has no such problem, since nothing is being compared, so it
keeps every bar it has.

## Other refusals

- **A window the data cannot fill is marked, not shown as a full one.** "1Y"
  over 214 bars renders `214 sess`; at 1Y all four legs in the fixture carry it.
- **`Max` is unbounded and never marked truncated** — it is the only honest
  answer to "show me everything" when four series start on different dates.
- **A leg that cannot cover the common window is dropped and named**, never
  drawn from a different origin beside the others.
- **No overlap at all reports it rather than drawing one leg alone.** One line
  under a "compared" heading is the worst outcome available: it looks like a
  comparison and is not one.
- **A zero first close has no percentage relative to it** — null, never
  Infinity, never a fabricated 0.00%.
- **Line colours are assigned by RANK, not by symbol**, so the eye follows the
  ordering rather than relearning a palette each day.

## Why this unit needed the container-resize fix first

The wall is a responsive grid: cells change width when it reflows to one
column, with **no window event behind it**. That is precisely the defect
`useLwChart` carried until this morning — it would have shipped four stale
canvases at the first breakpoint. Verified here: every cell's chart measures
exactly its container (530 × 530 at 1240px wide).

13 compute tests; 306 in the suite; `vite build` clean.
Screens: `docs/g5-index-wall-separate.png`, `g5-index-wall-compared.png`.
