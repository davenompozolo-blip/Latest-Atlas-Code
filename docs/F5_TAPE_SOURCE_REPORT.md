# F-5 — Tape source report

Required by **F3 §2.1** before the tape is built: *"report what source exists for each
sprint. If Sprint 2 has no source, build the tape with two sprints and report it — do not
substitute sector aggregates computed from the book's own holdings."*

**Headline: Sprint 2 does have a source, and it is an independent one.** The tape can run
three sprints. The substitution F3 §2.1 prohibits is not needed and must still not be used.

Measured 2026-09-16. Every figure below is from the live database.

---

## Sprint 1 — names

*Best and worst individual performers today, ticker and move.*

**Source: `nexus_holdings`.** Not `vw_nexus_holdings`, and the distinction is not cosmetic —
it is wrong on two independent counts.

| | `nexus_holdings` | `vw_nexus_holdings` |
|---|---|---|
| object | **live view** | view over `mv_nexus_holdings` (**materialised**) |
| rows today | **66** | 63 |
| vs `vw_positions_current` (66) | **exact, 66 of 66 in book, 0 not** | **3 behind** |
| move column | `today_pct` | `daily_return_pct` |
| staleness gate | **NULL past 7 days, `price_days_old` published** | **none** |

1. **It is three positions behind.** `vw_nexus_holdings` reads a matview refreshed on the
   10-minute job; `nexus_holdings` is a plain view and tracked the book exactly at the
   moment of measurement. On a tape — a format that makes everything look live — serving a
   book that is three names short is the wrong default.
2. **Its move is ungated.** `daily_return_pct` has no staleness rule. That is the open half
   of the 2026-09-15 exit-mechanism report, and it is exactly how KMTUY published +6.3%
   from a print 179 days old. `nexus_holdings.today_pct` already enforces the 7-day rule
   and publishes `price_days_old` so a consumer can say why.

Today the gate is dormant — worst `price_days_old` is **1**, and 65 of 66 rows carry a
move. The one row without a move must render as absent, not as 0.00%.

## Sprint 2 — groups

*Sector, index and regional performance.*

**Source: `market_instruments` + `market_prices`.** 19 active legs, **every one current to
2026-09-15**, 3,728–8,464 bars each. These are the A0 series-layer legs: market
instruments in their own right, priced by their own nightly loader. **They are not derived
from the book in any way**, so the basis confusion F3 §2.1 warns about does not arise.

| Group | Legs | Symbols |
|---|---:|---|
| **Sector** | **6** | XLE energy, XLF financials, XLI industrials, XLP staples, XLU utilities, XLY discretionary |
| **Index** | **5** | SPY large cap, QQQ Nasdaq-100, DIA blue-chip 30, IWM small cap, RSP equal-weight |
| **Regional** | **1** | EEM emerging markets |
| *(also present, not in F2 §3's list)* | 5 + 2 | HYG IEF IEI SHY TLT · GLD CPER |

Daily moves compute directly from consecutive `adj_close` bars. Live sample (2026-09-15):
XLE +2.17%, XLY −1.75%, XLU −1.20%, IWM −0.96%, SPY −0.46%, EEM −0.35%.

### The one real gap: regional is a single leg

Sector and index are genuinely covered. **Regional is EEM alone** — there is no
developed-ex-US, no Europe, no Japan, no China leg. One instrument is a data point, not a
category, and a tape frame labelled "Regional" carrying one ticker overstates what is
being measured.

**Recommendation — for the owner, not decided here.** Either:
- **(a)** run Sprint 2 as **sector + index** and present EEM inside the index frame as what
  it is (a broad equity index that happens to be emerging), dropping the regional label; or
- **(b)** add regional legs to `market_instruments` first (EFA, VGK, EWJ, FXI or similar) —
  a data change with its own backfill, not a tape change.

(a) needs no new data and claims nothing false. (b) is the honest version of the original
three-way split. **What must not happen is a "Regional" frame showing one ticker**, which
is the same class of overstatement as a sector aggregate computed from the book.

## Sprint 3 — signals

*The ratio pairs: daily, weekly and monthly change on each, with the axis each belongs to.*

**Source: `ratio_pairs` + `market_prices` + `factor_axis_loadings`.** 12 pairs; **every
numerator and denominator leg is current to 2026-09-15**.

**`cper_gld` has no axis loading at all.** The other 11 pairs each load onto all three axes
(`cyclical`, `concentration`, `dollar`); `cper_gld` loads onto none. F2 §3 asks for "the
axis each belongs to" — for this pair there is no axis to show, and the tape must render
that as absent rather than picking one or dropping the pair silently.

**F2 §3's one-source rule is a code constraint, not a data one.** *"Sprint 3 reads the same
series the pair explorer reads. One source; the tape and the explorer must never be able to
disagree."* Both read `market_prices`, but the explorer computes its ratios **client-side**.
Satisfying the rule means the tape calls the explorer's own transform, not a second
implementation of the same arithmetic — otherwise they share a data source and can still
disagree, which is precisely the failure the rule names.

---

## Summary

| Sprint | Source | Verdict |
|---|---|---|
| 1 · names | `nexus_holdings` (**not** `vw_nexus_holdings`) | ✅ ready |
| 2 · groups | `market_instruments` + `market_prices` | ✅ sector + index ready; **regional is 1 leg** — owner's call |
| 3 · signals | `ratio_pairs` + `market_prices` + `factor_axis_loadings` | ✅ ready; `cper_gld` has no axis |

**The tape runs three sprints, not two.** F3 §2.1's contingency does not fire. The
prohibition it attaches to that contingency still stands and is not needed: no sector
figure on this tape will come from the book's own holdings.

### Carried into the build

- Read `nexus_holdings`; never `vw_nexus_holdings` for a live move.
- A row with a NULL move renders absent, never 0.00%.
- Every value carries its own freshness (F2 §3) — `price_days_old` exists on Sprint 1 and
  `market_prices.date` on Sprints 2 and 3.
- Sprint 3 calls the explorer's transform rather than re-deriving ratios.
- `cper_gld`'s axis renders absent.
