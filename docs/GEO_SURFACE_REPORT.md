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
