# G-2 · The holdings table in the screener's idiom

**2026-09-17.** The Valuation House screener's grammar — counted tiles that
double as filters, a filter row, chip banks — brought to the flagship's
holdings table.

## Why share a grammar

Two tables in one product that filter differently make the reader learn the
app twice. The screener's opening row of counted tiles is the better pattern:
a tile is a **summary and a filter at once**, and the blurb under the count is
most of why it reads at a glance — *"trim · reduce the position"* says
something a bare number does not.

## What is NOT borrowed: the buckets

The screener's tiles are **Value / Growth / Momentum / Quality / Dividend /
Contrarian**. Those are derived from screener fields — multiples, RSI, revenue
growth, drawdown — and **the book does not carry them**. Reproducing those six
labels over holdings rows would be a classification with nothing behind it:
the same objection this codebase raises to a sector aggregate standing in for a
theme, and to the tape's thirty curated names being called "the market".

So the tiles are the facets the book actually has:

| tile bank | source | order |
|---|---|---|
| `ADD / HOLD / TRIM / WATCH / EXIT` | the derived read per position | the add→exit spectrum, **never** by count |
| `Fair / Overvalued / Undervalued` | the valuation signal | alphabetical |

**Reads keep their spectrum order.** Sorting the row by count would put `EXIT`
first on a bad day and destroy the only thing the left-to-right order carries.
**Signals are alphabetical** for the mirror reason: ranking them by count means
a price move reorders the filter bar under the reader's cursor.

**A facet with no members gets no tile.** An empty tile invites a click that
finds nothing, and on a row that doubles as a summary a zero is a claim about
the book rather than about a column that happens to be null.

## Sector is now a filter, and it is not theme

The table could always *show* sector and filter by theme. It can now filter by
both, as **two separate controls**, because they are two different taxonomies —
folding them into one is the mistake this codebase already corrected once, when
the flagship displayed sector values under a "Theme" heading.

`Unclassified` is offered as a real bucket in each, and only when something is
actually unclassified. `theme` keeps its NULL and is never coalesced to sector.

## One filter function

`applyFilters` is the only predicate. The count in the header (`2 / 9 live
objects`) and the rows in the body come from the same call, so they cannot
drift — the failure mode where a header says one thing and the table shows
another.

Measured in the harness against the real component:

| action | header | rows | clear shown |
|---|---|---|---|
| initial | 9 / 9 | 9 | no |
| click `TRIM` | 2 / 9 | 2 | yes |
| + signal `Fair` | 1 / 9 | 1 | yes |
| `clear` | 9 / 9 | 9 | no |

An **empty Set does not mean "match nothing"** — a filter bank with nothing
selected does not filter. Asserted, because the naive `reads.has(h.read)`
without the size guard silently empties the table.

## Verification

Rendered through the **real** `HoldingsTable`, not a reproduction of its
markup: the harness imports the component and drives it. A markup copy would
have verified the CSS and not the wiring, and the wiring is what G-2 changed.
`HoldingsTable` is exported for that reason.

15 compute tests; 336 in the suite; `vite build` clean.
Screens: `docs/g2-holdings-facets.png`, `g2-holdings-filtered.png`.

## Not done here

The screener's **RSI meters and regime pills** have no counterpart in the
holdings payload — `nexus_holdings` carries no RSI and no trend classification.
Adding them means plumbing fields through `vw_portfolio_home` →
`mv_nexus_holdings` → `vw_nexus_holdings`, which is a matview rebuild and its
own unit. Recorded rather than faked.
