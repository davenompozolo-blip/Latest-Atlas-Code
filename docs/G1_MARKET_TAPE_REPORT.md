# G-1 · The market tape

**2026-09-17.** A second tape on the flagship, above The Book at a Glance,
carrying what the **market** did. The existing F-5 tape carries what **my
names** did, and the two run separately on purpose.

## Why two tapes and not one

The entire value of having both is being able to tell *"my book is down"*
apart from *"the market is down"*. One merged stream makes that distinction a
matter of remembering which sprint scrolled past, which is exactly the kind of
"a flag beside a number nobody checks" this codebase already has an entry
about. Market above, book below, in the order you actually ask the questions.

## Four sprints

| Sprint | Source | Frames |
|---|---|---|
| `SECTORS` | `/api/macro` `sectors` — 11 GICS sector ETFs | `LEADING` / `FLAT` / `LAGGING` |
| `MOVERS` | `/api/movers` `top` / `bottom` | `BEST` / `WORST` |
| `CAP SPECTRUM` | `/api/movers` `capSpectrum` | none — see below |
| `CROSS-ASSET` | `/api/macro` `market` — 16 legs | `US EQUITIES` / `GLOBAL` / `RATES & CREDIT` / `COMMODITIES & FX` |

No new endpoint and no new arithmetic: these are the Markets module's own
feeds, unchanged.

## What the tape refuses to say

**The sector split is on SIGN, never on position.** `LEADING` is not "the top
half" — it is the sectors that are actually up, so on an all-red tape it does
not appear at all. A fixed share of the list labelled leading every day is a
ranking dressed as a market read, the same objection this codebase has to
quantile verdict bands. Asserted with an all-red fixture.

**Ranked slices are `BEST` / `WORST`, not `GAINERS` / `LOSERS`.** The bottom
five of thirty are not losers on a day the whole list is up, and a band saying
otherwise is wrong exactly when the market is most obviously not. The sign is
carried by the caret and the tone; the ranking by the band. Same reasoning as
the F-5 caret decision. Asserted with an all-green bottom slice.

**The movers universe is thirty curated large caps and the tape says so.**
`api/movers.js` ranks a fixed list, so "top movers" means "the best of thirty
names someone chose". That limit is printed on the sprint — the same rule that
makes XLE render as `XLE` rather than as "Energy".

**A quote with no change percent is withheld and named, never printed as
0.00%.** A tape renders everything on it as a measurement, so an absence has
to be visible as an absence.

**The cap spectrum is never re-sorted by move.** Mega → micro order *is* the
breadth signal; ranking it destroys the thing it is there to show.

**An unregistered cross-asset symbol is dropped and named, never filed under
a class.** A wrong class reads as a fact about the asset; an absent one does
not.

**The ticker is the label, everywhere.** `EEM`, never "Emerging markets" — the
proxy moves to the title. F-5 settled this for one leg; it now applies to all
sixteen.

## The two endpoints fail independently

`Promise.allSettled`, not `all`. A dead `/api/movers` costs the movers and cap
sprints and nothing else — the sectors and cross-asset sprints still run.
Measured: with `/api/movers` returning 503 the tape renders `SECTORS` (11
items) and `CROSS-ASSET` (16 items), and the failure is logged at error level
with status and body. Only when **both** are down does it read *"Market tape
unavailable — neither market feed answered"*, which is a statement about the
transport and not about the market.

An empty sprint is dropped rather than rendered as a bare label: a label with
nothing under it reads as a feed that had nothing to say, when what happened is
that it returned nothing at all.

## The marquee is now shared, not copied

`NexusTapeShell.js` holds the mechanics — constant velocity from a measured
track, the two-copy loop whose seam lands on an exact repeat, pause on hover
and focus, the reduced-motion pager, the frame markers. Both tapes use it.

**Two tapes moving at different speeds would read as one of them being
broken**, and a second copy of a marquee is precisely how that happens. The
extraction is behaviour-neutral for the existing tape: 278 tests green before
and after, with no change to `nexusTapeCompute.js`.

Each tape keeps its own data, its own item vocabulary, and its own three
sentences for loading / failed / empty — those are claims about a particular
feed, and a shared default would put a sentence on screen nobody verified.

## A registry gap, recorded rather than papered over

The cross-asset classification lives in `src/lib/marketAssetGroups.js`, shared
with `market-watch.js` which previously held it privately.

**It is a UI registry and that is a gap, not a design.**
`market_instruments.tape_group` owns this classification for the sixteen A0
legs and is the right home for these too; they are simply not registered there
yet, and inventing rows for them is an A0-shaped data unit rather than part of
a UI build. Written down so the next session does not mistake the gap for a
decision.

## Not in v1

`nexusLayout.js` says v1 "restores the previous layout wholesale", so a new
G-1 element added to it would stop the escape hatch being an escape hatch. The
tape styling is v2-scoped anyway, so it would render unstyled.

15 compute tests; 293 in the suite; `vite build` clean.
Screens: `docs/g1-tape-sectors.png`, `g1-tape-movers.png`, `g1-tape-crossasset.png`.
