# Defect 3 — `marginal_vol_contribution` consumer audit

**Status: audit only. Nothing changed.** This is the consumer inventory the
rename needs before it can be attempted, and it concludes that a rename is the
wrong frame.

## The defect, restated

`vw_risk_analysis.marginal_vol_contribution` is

```sql
(market_value / total_nav) * annual_vol        -- weight x annual vol
```

There is no covariance in it anywhere. It cannot express that adding to a name
which offsets the rest of the book *lowers* portfolio risk, because nothing in
it knows what the rest of the book is, and it has no Euler additivity. B4 built
`vw_book_mctr` with the real derivative (Euler residual 2.8e-17).

So the name asserts a measure the field does not carry — the `fwd_pe` lesson,
now in the risk layer.

## Consumers

Grepped the repo and read every database object whose definition references
either the column or `vw_risk_analysis`.

### Code — no live consumer

| site | use |
|---|---|
| `ui/pages/risk_analysis.py:171-176` | bar chart + column list |
| `tests/test_ui_pages.py`, `tests/test_edge_cases.py` | fixtures for the above |

Both are **Streamlit**, which CLAUDE.md records as retired — the React terminal
is the single source of truth. No `.js` / `.jsx` / `.ts` / `.tsx` / `.mjs` file
in the repo reads the column. Nothing on a live page renders it directly.

### Database — three, and two of them persist it

| object | use | persisted to |
|---|---|---|
| `vw_risk_analysis` | defines it | — |
| `atlas_write_verdicts` | 8 references | `position_verdicts.marginal_vol_contribution`, `position_verdicts.cluster_risk_share`, `book_risk_daily.total_vol_annual` |
| `atlas_write_segment_verdicts` | `mvc * weight AS rc` | `segment_verdicts.risk_share` |

`mv_nexus_holdings` depends on `vw_risk_analysis` but does not read this column.

`vw_position_risk_thesis` (E1.3) is **clean** — it already reads
`vw_book_mctr.risk_share`, B4's correct measure.

Append-only histories already written on the wrong basis:

| table | rows | span |
|---|---|---|
| `position_verdicts` | 764 (all carry it) | 2026-08-26 .. 2026-09-11 |
| `segment_verdicts` | 288 (all carry a share) | 2026-09-07 .. 2026-09-11 |
| `book_risk_daily` | 13 | — |

## What the basis actually costs

Recomputed the latest `BY BET` segmentation under B4's Euler measure and
compared it against what the nightly job wrote. 43 segments; the Euler shares
close to **1.000000**, so the recomputation is sound.

| | |
|---|---|
| segments | 43 |
| moved more than 1pp | **15** |
| largest move | **+18.69pp** |
| **negative under Euler** | **10** |
| no MCTR coverage | 2 |

Head of the table, ordered as published:

| segment | weight | written | Euler | Δ |
|---|---:|---:|---:|---:|
| Cluster 201 (10 names) | 23.90% | 50.22% | **68.90%** | **+18.69** |
| Cluster 199 | 4.34% | 4.01% | 3.22% | −0.79 |
| Cluster 172 | 3.55% | 3.37% | 1.35% | −2.02 |
| Cluster 177 | 1.47% | 2.49% | **4.62%** | +2.13 |
| Cluster 202 | 4.17% | 2.45% | **0.04%** | −2.41 |
| Cluster 128 | 2.04% | 1.86% | **−0.45%** | −2.32 |

**Ten of forty-three segments have the wrong sign.** A negative Euler
contribution means the segment diversifies the book — adding to it reduces
portfolio volatility. `weight x vol` is positive by construction and can never
report that, so all ten are published as risk consumers when they are risk
offsets:

| segment | written | Euler |
|---|---:|---:|
| Cluster 193 | 1.25% | **−1.13%** |
| Cluster 180 | 1.01% | **−0.87%** |
| Cluster 174 | 1.14% | **−0.62%** |
| Cluster 73 | 0.69% | **−0.54%** |
| Cluster 128 | 1.86% | **−0.45%** |
| Cluster 145 | 0.43% | **−0.39%** |
| Cluster 200 | 0.17% | **−0.38%** |
| Cluster 186 | 0.77% | **−0.15%** |
| Cluster 44 | 0.42% | **−0.13%** |

This is the same mechanism B4 measured per position — the old measure
over-weights large positions because it never sees their moves cancel, moving
MRVL 20 → 8, CRWV 14 → 7, JPM 9 → 24 — arriving at the segment layer, where it
is worse: a per-position rank error becomes a **sign** error once members are
summed, because the offsets that cancel inside a cluster are exactly what the
measure discards.

The two segments with no Euler coverage are the names absent from
`universe_correlations` (dark feeds). `vw_book_mctr` withholds them and
publishes `n_withheld` / `withheld_weight_pct`; the current job does not.

## Conclusion — this is not a rename

The audit was scoped as "rename the misnamed column". It should not be done
that way, for three reasons the measurement makes concrete:

1. **Renaming fixes the label and leaves every number wrong.** `fwd_pe` was the
   opposite case — there the label was right and the data was not, and the fix
   touched one expression. Here the arithmetic is the defect.

2. **The correct measure already exists and is already trusted.**
   `vw_book_mctr` is Euler-additive to 2.8e-17, corroborated independently by
   E3's factor model (19.08% against 19.37%), and E1.3 already reads it. The
   work is repointing two nightly jobs at it, not deriving anything new.

3. **Two append-only histories are already written on the wrong basis** and
   cannot be restated. 764 `position_verdicts` rows and 288 `segment_verdicts`
   rows. Whatever is done must be version-scoped and must declare the basis on
   the row — the construction `peer_basis`, `dispersion_basis`, `engine_status`
   and `data_quality` already use, and the one defect 2 adds to
   `book_risk_daily` as `vol_basis`.

So defect 3 is a re-basing of the segment and verdict risk layers, sequenced
after defect 2 (which removes `atlas_write_verdicts`' `total_vol_annual`
dependence on the column) and carrying its own basis column and version scope.
It re-bases a live page, so it is the owner's call, not a fold-in — the same
standing this file's B4 entry gives the other two.
