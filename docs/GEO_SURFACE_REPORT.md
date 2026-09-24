# Geographic surface — phases A–E build report

2026-09-24. Spec: *ATLAS Geographic Surface — build spec* (2026-09-22) and the
*Atlas Geo Design* board. First consumer: Trade → Universe → Geographic
(`#/trade/geographic`).

## What shipped

| Phase | Deliverable | State |
|---|---|---|
| A | `country_ref`, `security_geo_revenue`, `security_domicile`, RLS on all three | **Schema live.** 238 countries and 918 domiciles seeded; revenue splits **not** entered (see below) |
| B | `resolve_geo_exposure` / `geo_exposure_detail` / `geo_exposure_summary` | Live. 17/17 invariants against production, ~32 ms |
| C | `GeoSurface`, flat renderer, choropleth + venue points, selection → inspector | Shipped |
| D | Layer rail from the registry, basis switching | Shipped. `active-weight` greyed with its reason |
| E | Globe renderer (lazy), arcs on both renderers | Shipped. No arcs draw yet, because no disclosure exists |
| F | Nexus tile with verdict integration | **Not built.** Needs a gap history the verdict can compare against |
| — | Nexus → Holdings geography projection | **Not built.** Separate unit; `GeoSurface` is ready for it |

Screenshots (replayed live rows; the render is proven, the network read is not):
`docs/geo/geo_flat_revenue_muted.png`, `geo_flat_domicile_tw.png`, `geo_globe_revenue_tw.png`.

## The book is not the one the spec describes

The spec and the design board describe a JSE book: Prosus, Anglo American,
Naspers, ZAR reporting, "hand-map the top forty JSE positions". The live book is
65 US-listed Alpaca positions reported in USD. The layout and the rules carry
over unchanged; the figures and names on the design board do not describe this
book.

## Findings

**No domicile existed anywhere.** The spec assumes the securities table already
carries a country. `assets` does not. The only country in the schema is
`vw_screener.country`, which fills a missing value with `'US'`, so HMY (Harmony
Gold, Johannesburg) read as a US company. Domicile is the fallback for every
undisclosed revenue split, so it became its own sourced table:
`security_domicile`, with the source per row (`finnhub_profile` or `manual`
with a note). An unknown domicile is the absence of a row, never a default.

**The vendor country field is not stable from night to night.** AAPL carried
`equity_screener_universe.country = 'US'` on 2026-09-22 and NULL on 2026-09-24.
That is why domicile is recorded once rather than joined live.

**A fund's domicile is not a revenue fallback.** All 18 funds in the book are
US-registered wrappers. Rule 3 ("no disclosure → domicile") would put EWY
(Korea), EZA (South Africa) and EWA (Australia) on the United States. That is
not a rough guess; it is known to be false. Funds without look-through go to
`XX` as `fund_no_lookthrough`, and the summary counts them separately. This is
the one deliberate departure from the spec's rules.

**Natural Earth's `ISO_A2` is the wrong join key.** It publishes Taiwan as
`CN-TW` and France and Norway as `-99`. Everything is keyed on `ISO_A2_EH`
instead. Otherwise TSM's domicile, France and Norway drop off the map with
nothing on screen to say so.

## The book today

| basis | coverage | shape |
|---|---|---|
| domicile | 100% | US 82.7%, TW 3.8%, BR 3.4%, NL 3.0%, JP 2.8%, GB 2.3%, CN 1.9%, ZA ~0 (HMY is dust). HHI ×10³ = 689 |
| revenue | **0%** | 48 issuers (77.6%) fall back to domicile; 18 funds (22.4%) sit in XX |

The revenue view therefore renders **muted**, with a banner that names each gap.
The largest-gap figure is **withheld**: at 0% coverage every "gap" is a fund
moving into XX, and publishing that would present the resolver's own fallbacks
as a finding about the book.

## What phase A still needs

Revenue splits are a data-entry job, and none were invented to make the map
look finished. Each row needs a `source_url`, and a `source_note` whenever it
is not a straight disclosure. The deferred trigger refuses any set that does
not sum to exactly 1.0000 including `XX`, or whose `coverage` disagrees with
`1 − XX share`. Two sets of names matter most:

- **The top issuers by weight:** AMD, TSM, MU, JPM, ASML, NVDA, AMZN, NVT, PFE, ATAT.
  Geographic revenue is in each 10-K / 20-F segment note.
- **The funds, whose look-through is holdings by country from the issuer's
  factsheet:** EWY, GDX, ACWI, DFEV, EZA, EWA, AVEE, UAE, IXC.
  Loading the funds alone would move 22.4% of the book out of XX.

Coverage clears the 80% floor only once both groups are loaded.

## Deviations from the spec

| Spec | Shipped | Why |
|---|---|---|
| `maplibre-gl` 6.4.x | **5.24** | `@deck.gl/mapbox` 9.4 reads `map.transform` in interleaved mode, and it is undefined under MapLibre 6 (`Cannot read properties of undefined (reading 'height')`, every frame). Revisit when deck.gl supports 6 |
| `deck.gl` 9.2.x | 9.4 | Current release of the same major version |
| `registry.ts` | `registry.js` | The terminal is plain JS |
| "Only one exposure layer at a time" | One **choropleth** at a time | Coverage and FX sensitivity paint the same polygons; the collision is about kind, not group |
| Two new tables | Three | `security_domicile`, see above |
| Surface props | + `overlays`, `viewBounds` | Point and arc data had nowhere to arrive; region presets need a camera |
| Flat added to the initial bundle ≤ 220 KB gz | Flat is lazy (554 KB gz chunk); initial bundle +9.1 KB | Loaded only on the geographic route |
| `supercluster`, `pmtiles`, `@protomaps/basemaps` | not installed | 2–3 venue points, not 300; OpenFreeMap has not needed a fallback |

## Two render defects found by rendering

1. **MapLibre's `load` event never fires when the style loads and the tile
   source does not.** Readiness now keys on `style.load`. I reproduced it by
   serving the real OpenFreeMap style and aborting only the tile requests:
   before the fix the panel stayed blank with no error; after it the data
   layers draw.
2. **The MapLibre 6 / deck.gl mismatch above.** Invisible to `vite build`,
   which reported success throughout.

## Open questions from the spec, answered where the build forced it

- **Benchmark geography:** none on file, so `active-weight` greys out with
  that reason. A benchmark geographic breakdown needs its own table.
- **FX reporting currency:** the book is USD, but no per-country sensitivity
  exists yet. Greyed with its reason; flat-only per the spec.
- **Per request or materialised view:** per request. 32 ms against a 3 s anon
  cap does not justify a scheduled job that then needs its own freshness check.
- **Dual listings:** not relevant to this book. Every holding has one US line;
  4 have no venue on file and are counted in the legend.

---

## Follow-up: globe interaction audit (2026-09-24)

Reported from the terminal: in globe mode, hovering over the rotating globe
stopped it and it appeared to freeze. It was reproduced first, then probed
with 30 scripted user flows (`hover`, leave mid-hover, drag released inside
and outside the canvas, click, Esc, wheel, the auto-rotate switch, region
chips, list selection, layer toggles mid-hover, 20 renderer round trips,
resize, flat click/pan/zoom-past-4).

### What was actually broken

| # | Defect | Mechanism | Fix |
|---|---|---|---|
| 1 | **Ghost hover stopped the globe for good** — the reported freeze | globe.gl raycasts from the *last* pointer position on every render. After the pointer leaves, the globe keeps turning, a new country slides under that stale point and is reported as hovered. The first version set `autoRotate = false` on every hover report, so rotation stopped under a cursor that was nowhere near it and no event ever restarted it. | Hovers count only while the pointer is inside the canvas; pointer interaction is disabled on `pointerleave` so the stale raycast cannot run |
| 2 | Rotation driven straight from events | Any missed "back on" event (release outside the canvas, a hover-null that never came, a polygon rebuilt mid-hover) left it stopped | `rotationController.js`: a per-frame predicate, restored by default, with watchdogs on a stale hover (2.5 s) and a stale press (8 s) |
| 3 | Hover **halted** the globe | The spec says "pauses on hover". A globe that stops dead the instant the cursor crosses land is indistinguishable from a frozen one — which is how it was reported | Hover slows to a quarter-speed crawl. A deliberate stop is kept only for a drag (the user is holding it) and a selection (labelled on screen: `HOLDING ON CA · click space or Esc to release`) |
| 4 | **WebGL context leak** | `_destructor()` does not release the context. After ~16 flat/globe switches Chromium logged `Too many active WebGL contexts. Oldest context will be lost` — which can be the one on screen | `renderer.dispose()` + `forceContextLoss()` on unmount. 20 round trips now: 0 warnings, 1 canvas |
| 5 | Region chips did nothing on the globe | They only fed the flat camera | Every region carries a globe `pov`; the globe turns to it |
| 6 | Clicking the active region again did nothing | The camera effect was keyed on the region, which had not changed | Camera requests carry a nonce |
| 7 | A selected country rotated away | Rotation continued after selection | Selection focuses the globe: it turns to face the country and holds |
| 8 | Every click restarted the arc animation | Selection shared an effect with the data layers | Selection has its own effect |
| 9 | **Hover throttle threw in the browser** (`Illegal invocation`) | The default timer stored `setTimeout` bare and called it as `timer.set(...)`; browsers reject a foreign `this`, Node does not, and the unit test injected its own timer. Every trailing hover call — usually the one saying the hover ended — threw, so hover labels lingered | Timer functions wrapped; a new test simulates the browser's receiver check and fails on the old default |
| 10 | Clicking the ocean did not clear a flat-map selection | deck.gl calls a layer's `onClick` only when an object is hit | The overlay's own `onClick` clears on an empty-space click |

Also added: an explicit AUTO-ROTATE switch, Esc to release a selection, and a
live `prefers-reduced-motion` listener (it was read once at mount).

### What the probe could not measure

Frame time. This container renders WebGL in software (SwiftShader): two frames
in 1.5 s with the pointer off the globe. A CDP profile of a hover sweep put
JavaScript at under 10% of wall time — the raycast is a few milliseconds a
move — so frame budgets here measure the missing GPU, not the code. The globe
therefore publishes its rotation state as `data-rotation`
(`full | hover | held | settling | focus | off | reduced`), written only on
change, and the probe asserts that instead of pixels.

### Verified (`geo_probe2`, live rows replayed)

All 22 globe flows and 6 of 7 flat flows pass on the final build, with zero
page errors: drag released outside, ghost hover after a layer toggle mid-hover
(G18), 20 renderer round trips with zero context warnings (G19–G21), flat
click, re-centre after a pan (checked on the published camera, `data-view`),
and the 1:50m swap. The one timing-sensitive flow is the flat ocean click:
deck.gl picks from the last rendered frame, and at SwiftShader's frame rate a
click fired right after a move can be picked against the previous frame. It
passes once a frame has rendered; on a GPU the window is ~16 ms. One observation outside our code:
three-render-objects listens for `pointerup` only on its own container, so a
drag released outside leaves its internal "dragging" flag set; the next click
was still delivered correctly in every run (C1–C4), so no workaround was added.

---

## Follow-up: Nexus → Holdings geography projection

A second projection behind the Holdings MAP toggle: `PROJECTION · POSITIONING |
GEOGRAPHY`. Same rows, same filter chips, search and sector dropdown; only the
plot and the rail change.

- **Shading** is the whole book on the chosen basis (revenue source or
  domicile), muted under the 80% coverage floor with the gap named.
- **Points** are one marker pair per domicile: a ring for the book's weight
  there, a dot for candidates. Per country, not per name — no issuer
  headquarters is on file, and scattering 57 US names around one centroid
  would draw a precision the data does not have.
- **Selecting a country filters the positioning map** to the names that earn
  there: held names on the resolver's answer, candidates on recorded
  domicile (the only fact on file for a name not in the book). The chip stays
  visible in both projections and clears with ×.
- **The rail** ranks "where you earn, not where you are listed" only above the
  coverage floor. Below it, it ranks by domicile and says why — today, at 0%
  revenue coverage, every gap would be a fund moving into XX.
- Held names the positioning map cannot place (no correlation to plot) **are**
  placed here: a domicile needs no correlation.

**A candidate with no recorded domicile is not placed**, and is counted in the
scope line. Of the 422 map rows, 161 symbols carry a domicile; the remaining
candidates stay on the positioning map. Extending `security_domicile` to the
candidate universe is the data fix, not a default country.

Found by its own test: a held fund that the resolver returned *only* in XX had
no entry in the per-name country map, so the filter fell through to its US
wrapper's domicile and put EWY under the United States — the fund rule
defeated by the side door. A name the resolver returned now always uses the
resolver's answer, even when that answer is "unallocated".
