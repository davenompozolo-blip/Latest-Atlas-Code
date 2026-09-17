# G-4 · Cross-asset, and a risk light that was always green

**2026-09-17.** The Markets module's heatmap, credit levels and risk
barometer, on the flagship below the names — and the defect found on the way
there.

## The finding: the chrome's risk pill was a string literal

`src/pages/nexus-page.js:1146` rendered:

```js
e('div', { style: {...} }, 'RISK-ON'),
```

**Computed from nothing.** Green in every market since it was written. Nothing
in the file referenced a barometer, a signal, or a feed.

Meanwhile `macro-markets.js` computed a real one from SPY, TLT and HY spreads.
So the terminal could show **RISK-ON in the chrome and NEUTRAL on the Markets
page in the same session** — and did: the reporting screenshots show `RISK-ON`
at 09:14 and `RISK BAROMETER · NEUTRAL` at 09:43.

This is the *"a gauge carried from the mock looks exactly like a working
gauge"* entry in a second place, and worse: a mock gauge at least had a mock
behind it. This had nothing at all.

One computation now — `riskBarometer` in `nexusCrossAssetCompute.js` — read by
the pill and the panel through the same feed module, so they **cannot**
disagree.

## The barometer is the cheap signal and says so

Ported from `computeRiskSignal` with the same inputs, the same weights and the
same ±0.3 band, so the published number does not move under cover of a
refactor. Including one detail preserved deliberately: `changePct > 0 ? 1 : -1`
puts a *flat* SPY on the negative side. That is what shipped; changing it here
would be moving a published reading while claiming to tidy the code. Asserted
in a test that says so.

What changed is that **every component is published rather than summed behind
a label**:

```
RISK-OFF  (heuristic)
SPY     −0.44%   equities offered
TLT     +0.21%   duration bid — flight to safety
HY OAS   2.76%   spreads contained
```

- **`basis: 'heuristic'` travels on the reading** and is rendered on the face
  of it. Three signs averaged against a band is not a measured regime — B0's
  factor betas and E3's regime-conditional covariance are, and they are a
  scroll away. The whole point of having the cheap signal on the same page as
  the expensive ones is being able to see when they disagree.
- **No inputs reads `UNKNOWN`, never a default label**, and the chrome pill
  renders *nothing* rather than a placeholder. A chrome badge is read at a
  glance and never re-read; a grey dash there reads as a state the market is in.
- **A missing input marks the reading `partial`** rather than silently
  reweighting to two-thirds.
- **The needle is the score, not the label.** Three fixed positions would throw
  away the distance from the band, which is the only thing saying whether the
  reading is marginal. Measured: the base fixture puts the needle at 34% with
  the neutral band spanning 35.6–64.4% — just outside, and it looks just
  outside, because it is.

## The other panels

- **Heatmap** grouped by the shared registry. A symbol with no quote is an
  **absent cell**, not a grey zero — a heatmap renders every cell as a
  measurement, and a blank that looks like "flat" is the worst outcome
  available. Withheld symbols are named under the grid. A class with no quoted
  members is dropped rather than rendered empty.
- **Credit** publishes the levels the barometer's third component reads, so the
  reading can be checked rather than trusted. **A negative NFCI is *loose*** —
  the sign is counter-intuitive, so the direction is printed with the number
  rather than left to the reader to get backwards.
- Intensity saturates at 3%: beyond that the scale stops discriminating, and
  capping makes that explicit rather than emergent.

## One request per endpoint

`useMacroFeed.js` holds one module-level promise per path. The tape, the
cross-asset panel and the chrome pill all read `/api/macro` — three fetches for
one payload, and worse, **three payloads that can disagree**, because the
endpoint caches with a TTL and two calls either side of an expiry hand two
panels on the same screen different data.

A rejected promise is **cached as rejected**: a component mounting later must
see the failure the first one saw, rather than quietly retrying and rendering a
healthy panel beside one that says the feed is down.

Deliberately not a cache with its own TTL — the endpoints already cache
server-side, and a second TTL here is a second policy to keep in step.

## Recycled data, not recycled markup

The panels are re-rendered in the flagship idiom rather than lifted with the
Markets module's design system attached. Recycling markup is what makes a page
feel like panels held together with tape; recycling the *data* and rendering it
in one idiom is what makes it feel like one machine.

## Measured

| case | pill | panel |
|---|---|---|
| base fixture | `RISK-OFF` | `RISK-OFF`, needle 34%, 3 components |
| stressed spreads | `RISK-OFF` | `RISK-OFF`, needle 10% |
| no inputs | *absent* | `UNKNOWN`, no components |
| `/api/macro` 503 | *absent* | "Cross-asset unavailable — /api/macro did not answer" |

The pill and the panel agree in every case by construction.

15 compute tests; 321 in the suite; `vite build` clean.
Screen: `docs/g4-cross-asset.png`.
