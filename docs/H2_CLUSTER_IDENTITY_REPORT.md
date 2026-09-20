# H-2 — Cluster identity: naming the risk buckets and bridging them to the regime axes

**2026-09-20.** `cluster_identity`, `atlas_refresh_cluster_identity()`,
`vw_cluster_identity`, nightly at 23:39 Mon–Fri.

## 1. What was wrong

The Performance tab rendered `RISK CLUSTER 196` — an integer out of an
average-linkage partition, with nothing on screen saying what was in the
bucket or what moves it. The clusters were measured and then left unread.

There was no object anywhere in the schema that answered either question.
`universe_clusters.cluster_label` is a **ticker fingerprint**, not a name, and
`assets.sector` reads `Other` for half this universe — the modal sector of the
semis bucket is literally `Other` (16 of 32), so naming from it would have
produced a label that is false rather than merely vague.

## 2. What was built

One row per cluster per night carrying two independent things.

**Composition.** The modal `position_themes` theme among members, with
`composition_basis` (`curated_theme` / `vendor_sector` / `unclassified`) and
`composition_coverage` travelling beside it. Sector is used only where no
member carries a curated theme, and never when its own modal value is the
null-ish bucket. The basis is published because sector is not theme — the
distinction this codebase has already had to correct once on the flagship.

**Exposure.** A multivariate OLS of the equal-weighted cluster return on
`[market, cyclical, concentration, dollar]`, 200-session window, market as a
**control** rather than a finding: without it every cluster loads on
everything, because the market factor dominates a daily equity return. An axis
is named only if it clears `|t| > 2`, and the largest such `|t|` wins.

The multivariate form is not decoration. `concentration` and `dollar`
correlate **−0.471** over the estimation window, so a univariate axis
correlation double-counts and would assign several clusters to the wrong axis.

## 3. The finding

**The theme label and the risk bucket are different objects, and the book's
largest theme is two opposite bets wearing one name.**

`AI / accelerated compute` is 12 held names across **5** clusters:

| cluster | held | axis | t |
|---|---|---|---|
| 196 | AMD ASML DFEV EWY MRVL MU SNDK TSM | `dollar` **−** | −8.99 |
| 48 | NVDA | `concentration` **+** | 4.68 |
| 127 | AVGO | `concentration` **+** | 6.57 |
| 144 | TSLA | `concentration` **+** | 4.14 |
| 187 | CRWV | `concentration` **+** | 3.91 |

The US mega-cap AI names rise as index leadership narrows. The Asian and
European semis complex falls as the dollar strengthens. Under one theme
heading they read as one position; they are two, and they can move apart.

`Financials` is worse: 6 held names, 4 clusters, **four different axis/sign
combinations** — C/GS/MS on `cyclical +`, JPM on `concentration −`, MA on
`dollar +`, FIDU on `dollar −`. A single "Financials" line nets all of that
to approximately nothing.

This is the bridge the request asked for: a regime signal on `dollar` is only
actionable once you can say which of your buckets moves with the dollar, and
the answer is not the one the theme names suggest.

**174 of 206 clusters carry a named axis; 32 carry none** and render
"No measurable axis exposure" rather than a small number.

## 4. Three defects found while building it

**A floor written to protect the average made a third of the book
unmeasurable.** The panel required at least half the cluster to have priced
that session, floored at two names, so that a thin tape could not let one name
stand for a whole bucket. A one-name cluster can never have two names priced.
**143 of 206 clusters are singletons carrying 23 held names**, and every one
of them came back `insufficient_history` — a gate that can never pass, which
this codebase already has three entries about. Capped at the cluster's own
size: `least(size, greatest(2, ceil(size/2)))`. 63 → 206 measured.

**The sample had no upper bound.** A row stamped `as_of = D` was fitted on
bars *after* D. Harmless today — every feed sits exactly on the clustering
date — but on a night `ts_clusters` fails (which happened on 2026-09-09, a
504) the job would re-state the same `as_of` against a longer window and call
it the same date. An append-only history row has to describe its own date.
Bounded at both ends; the reproduction below held identically either side,
which is what a correct no-op looks like.

**The read view sat at 1,208 ms against anon's 3,000 ms cap.**
`held_symbols` was a correlated subquery: 45 clusters × one full evaluation of
`vw_positions_current` each, 15,887 buffers. Computed once in a CTE instead —
the `atlas_counterfactual_frozen` lesson — **1,208 → 49 ms**, and it now
returns all 206 rows rather than 45.

## 5. Reproduction

The whole fit was re-implemented independently in node (`.h2verify/prove.mjs`)
against the same window and the same min-priced rule, and compared row by row
against what the function wrote:

```
compared measured clusters : 206
status mismatches          : 0
n_obs mismatches           : 0
primary-axis mismatches    : 0
max |beta| difference      : 4.994e-9   (stored at 8dp)
max |t| difference         : 4.993e-5   (stored at 4dp)
max |R2| difference        : 4.969e-7   (stored at 6dp)
```

Every residual is under **half a unit in the last stored decimal**, which is
the rounding and nothing else.

**The first run of that check reported `max |beta| 2.392e-3` and one
primary-axis disagreement, and the checker was at fault.** It paged PostgREST
**without an ORDER BY**, which makes pagination unstable — this codebase's own
rule, violated in the verifier rather than in the thing verified. A
disagreement two hundred thousand times larger than the rounding is a setup
difference, not a precision one; chasing it as arithmetic would have wasted
the afternoon.

Determinism: three DELETE+INSERT re-runs in separate transactions give the
identical digest `68627cea8ea2a72974dfd288f7ec0434` over every cluster's
`(label, axis, sign, betas, t-stats, R², n, status)`.

## 6. What the surface does

`RISK CLUSTER 196` is now **AI / ACCELERATED COMPUTE** with `#196` beside it as
provenance, a `DOLLAR −` tag, and the sentence *"Falls with dollar
strengthening; EEM/SPY, GLD/SPY and IWM/SPY falling"*.

The sentence is built from `factor_axes.positive_means` **and the sign**. An
axis key on its own says which axis a cluster belongs to and not which way it
pushes it — a reader shown a bare `concentration` tag beside a rising bucket
concludes the exact reverse of the loading. That is the defect F-5 caught on
the tape, and it would have been reintroduced here.

The seven cluster cards cover only the cluster-eligible minority (18 of 61
positions), so the **NO CLOSE COMPARABLE** table below them — the other 31
names — gained a `Risk cluster` column carrying the same name and tag. Without
it most of the book still read as unclassified, which was the complaint.

## 7. Rules enforced by construction

- **An unnamed axis is ABSENT from the row shape, not null.** `axisBeta`,
  `axisT` and `axisSign` are not keys on the object when no axis cleared the
  bar — a renderer cannot print a number it was never handed. Asserted with
  `'axisBeta' in s === false`, not with a null check.
- **`marginal` is not a gate.** It means the component barely cleared the
  Marchenko–Pastur noise edge — a property of the PCA, not of this cluster.
  `dollar` is `marginal = true` **and** the axis 8 of the book's held clusters
  load on. Reading it as "not measurable" would withhold the axis that matters
  most. There is a test for this.
- **The market line is withheld when `|t| ≤ 2`.** KMI's bucket has a market
  beta of 0.0116 at t 0.06; printing "Beta to SPY 0.01" asserts a measured
  near-zero beta, which is not what was measured. `market_significant` is
  computed in the view and *read* by the shape rather than re-derived, so the
  flag cannot disagree with the number beside it.
- **Two kinds of missing bucket read differently.** "Not in the partition"
  (IXC — a dark feed, absent from `universe_clusters`) is a different fact
  from "no identity on file" (a night the job did not write), and pooling them
  would hide a stopped feed.
- **DELETE+INSERT, never `ON CONFLICT DO NOTHING`.** A cluster id is derived
  from a nightly clustering and does not survive recomputation — the defect
  that broke the segment job on its first scheduled run.

## 8. Not done, and why

**`composition_coverage` runs as low as 0.12.** Cluster 199 is labelled
`International / EM ETFs` from the 2 of 17 members that carry a curated theme.
The label is honest about the names the book holds and thin as a description
of the bucket, which is exactly why the coverage is published beside it rather
than the label being suppressed. Raising it means extending
`position_themes` past the 79 symbols it covers today — a data unit, not a
code one.

**The seven cards still show only cluster-eligible positions.** That scoping
predates this work and has its own recorded rationale; the complement table now
carries the names instead. Changing which positions get a card is a separate
decision.

**Two superseded migration rows have no file.** `20260920202258` and
`20260920202445` are drafts of the function, each superseded within minutes by
`20260920203206`, which is filed and whose body hashes **identical to
`prosrc`** (`e3f62a7230d40af0ea42ba0371dcc31b`). A replay of the filed set
produces the live object; the check was run rather than assumed.
