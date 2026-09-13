# A0b_AND_A3.0_SPEC.md

Handoff spec for CC. Answers the seven open questions, then two buildable units.

Project: `vdmojjszvvcithuxwexx`. `apply_migration` for DDL and privileged inserts.

**Neither unit implements detection.** A3.0 is schema and seeded definitions only. The
engine that evaluates them is A3.1 and is not authorised.

---

## Answers to the open questions

**1 · `position_themes` is not the source of truth, and it is not the same object.**
`position_themes` maps holdings to themes — *which of my positions are AI capex*. A3 themes
are macro states — *is AI capex a live regime*. One is a portfolio tag, the other a claim
about the world; a theme can be live with zero holdings in it, and vice versa. A3 defines
its own entity. A join between them is real future work for the coherence read, deferred
until there is something on both sides to join.

**History key: `(theme_key, as_of, logic_version)`.** `theme_key` is hand-authored and
stable, which is the property the segment-layer lesson demands. `logic_version` is what
makes a recalibration a new series rather than a rewrite of history.

**Themes are detected from macro series and confirmed by the B0 axes — never defined by
them.** Detection and confirmation are separate columns. A theme that detects on macro data
but fails ratio confirmation is a real and interesting state; collapsing the two would
destroy it.

**2 · Shadow mode is a job with no UI.** Write nightly, render nothing. Not a default-off
panel. The panel is A5 and is gated on 90 days of shadow history. A default-off flag was
right for A2's read block because the panel around it was shipping anyway; here there is no
panel yet.

**3 · `QUIET_SIGMA` — my error, and the fix is the column not the constant.** I wrote 0.5σ
intending sigma units; `score_20d` is a rolling 20-session sum whose standard deviation is
roughly √20 ≈ 4.5, which is exactly consistent with the mean absolute of 3.3–5.8 you
measured. So the threshold was off by that factor.

Add `score_20d_z` to `factor_axis_scores`: `score_20d` divided by its own trailing standard
deviation over the same 5-year baseline. Then `QUIET_SIGMA = 0.5` means what it was meant
to, and the dispersion state reads `score_20d_z`. Expect quiet to land somewhere around
10–15% of sessions rather than 0.53%. If you keep raw units instead, the equivalent
constant is ≈ 2.5 — but standardising is better, because it survives the next change to the
window length.

**4 · Proxy, do not buy.** And the gap is narrower than it looked: Alpha Vantage's `BRENT`
and `WTI` endpoints are free on the current key and give daily spot, which is what the
energy emergence test needs. Only the *forward curve* is paid, and that was already deferred
to a later upgrade. So: Brent spot via A0b, commodity curve held, `caveats` carries the
admission as it is designed to.

**5 · Yes, correct the CLAUDE.md entry.** `theme_leadership_weekly` has written on cadence
twice since the fix. A wrong dead-feed entry is worse than no entry — it teaches the next
session to distrust a feed that works.

**6 · A0b is both, in one unit.** Three new ETF legs give a nominal slope cheaply through
the existing loader. Breakevens cannot be proxied by any ETF pair and need a genuine series
layer from FRED. Both below.

**7 · Nothing in A0b or A3.0 is derived**, so no checksum applies. `score_20d_z` is a
division and the nominal slope is a subtraction. The first derived object in this stream is
A3.1's detection, and that spec will carry a checksum.

---

## A0b · Macro series layer

### A0b.1 — Three new ETF legs
Register and backfill into the existing `market_instruments` / `market_prices`:

| symbol | proxies_for | caveat to record |
|---|---|---|
| `SHY` | 1–3y Treasury | short end; duration ≈ 1.9y, not a policy-rate proxy |
| `IEI` | 3–7y Treasury | belly |
| `IEF` | 7–10y Treasury | intermediate; pairs with TLT for the long end |

This gives a nominal slope from ETF total returns for the first time — there is currently
no short end in the 16 legs, so no curve of any kind can be computed from A0.

Record clearly in `caveats`: **an ETF slope is not a yield curve.** These are total-return
price series, so a SHY/IEF ratio reads duration-adjusted relative performance, not a spread
in basis points. Adequate for regime confirmation, not for quoting a 2s10s.

### A0b.2 — `macro_series`, fed from FRED

Breakevens are spreads between nominal and real yields. No ETF pair produces a forward
breakeven, so this cannot be proxied and needs its own layer.

**`macro_series`** — registry, same discipline as `market_instruments`:

| column | type | notes |
|---|---|---|
| `series_key` | text PK | e.g. `T5YIFR` |
| `provider` | text | `fred` |
| `provider_code` | text | FRED series id |
| `label` | text | |
| `units` | text | `percent`, `index`, `usd_per_bbl` |
| `measures` | text | what it is, in plain language |
| `inception_date` | date | **verified from the provider** |
| `caveats` | text | NOT NULL, non-blank CHECK — same rule as A0 |

**`macro_series_values`** — `series_key`, `date`, `value`. PK `(series_key, date)`.

Seed:

| series_key | provider_code | measures |
|---|---|---|
| `T5YIFR` | T5YIFR | 5y5y forward inflation expectation — the structural read |
| `T5YIE` | T5YIE | 5y breakeven — the front-end read |
| `T10YIE` | T10YIE | 10y breakeven |
| `DGS2` | DGS2 | 2y nominal |
| `DGS10` | DGS10 | 10y nominal |
| `T10Y2Y` | T10Y2Y | 2s10s, published directly |
| `BRENT` | *(Alpha Vantage `BRENT`)* | Brent spot, daily |

FRED is free and needs no key for these. Note in `caveats` that FRED breakevens are
**not published on non-trading days and carry revisions** — the loader must upsert, not
insert-only.

### A0b.3 — Nightly
One scheduled job, `cron.job` only, after the 22:50 series sync and before or beside the
23:10 factor refresh. Same rules that C4 proved: gate on the upstream stage, no-op answers
non-200, `sync_log` row every run, never write `duration_ms`.

**Acceptance:** all seven series backfilled to inception, coverage report, one proven
unattended run.

---

## A3.0 · Theme schema and seeded definitions

Four tables. **No detection logic.**

### `regime_themes`
| column | type | notes |
|---|---|---|
| `theme_key` | text PK | `tariff_rebasing`, `energy_dislocation`, … |
| `label` | text | |
| `driver_class` | text | CHECK in `supply_geopolitical \| monetary_financial \| fiscal_dominance \| productivity_capex` |
| `description` | text | what the theme claims about the world |
| `active` | boolean | |

Seed `tariff_rebasing` (supply_geopolitical) and `energy_dislocation`
(supply_geopolitical). The other two driver classes get themes when they are specified.

### `regime_theme_triggers`
**This is the table that makes A3 buildable now.** Every threshold, window and horizon is a
row. Calibration is data.

| column | type | notes |
|---|---|---|
| `theme_key` | text | FK |
| `trigger_key` | text | |
| `role` | text | CHECK in `emergence \| absorption \| abort \| exhaustion \| confirmation` |
| `series_key` | text | FK → `macro_series`, nullable |
| `axis_key` | text | FK → `factor_axes`, nullable — for `confirmation` rows |
| `operator` | text | `gte`, `lte`, `abs_gte`, `retrace_gt` |
| `threshold` | numeric | |
| `threshold_units` | text | `bp`, `pct`, `sigma`, `ratio` |
| `baseline_window` | int | sessions in the reference mean |
| `hold_sessions` | int | how long it must persist |
| `logic_version` | text | `v0-uncalibrated` |
| `notes` | text | why this number |

PK `(theme_key, trigger_key, logic_version)`.

Seed at `logic_version = 'v0-uncalibrated'`. **These numbers are reasoned guesses, not
results** — that is what the version string says, and shadow mode exists to move them.

**`tariff_rebasing`**
- emergence: `T5YIFR`, `gte` 25 bp above 60-session mean, hold 20 sessions, no retrace >40%
- absorption: `T5YIE` `gte` 25 bp **while** `T5YIFR` `lte` 10 bp — front end only
- abort: `T5YIFR` `retrace_gt` 60% of the emergence move
- exhaustion: level holds, `confirmation` axis decays
- confirmation: `cyclical` axis — *and note the exclusivity rule below*

**`energy_dislocation`**
- emergence: `BRENT` `gte` 25% above 120-session mean, hold 40 sessions, **and** `T5YIFR`
  `gte` 20 bp above 60-session mean, **and** `cyclical` positive
- absorption: `BRENT` `gte` 25% while `T5YIFR` `lte` 10 bp
- abort: `BRENT` `retrace_gt` 60%
- exhaustion: level holds, XLE/XLU decays
- confirmation: `cyclical`

**Exclusivity, recorded in `notes` and enforced at A3.1:** an energy shock transmits into
inflation expectations, so both themes will move `T5YIFR`. Energy requires the commodity
move **and** the breakeven move; tariff requires the breakeven move **without** commodity
confirmation. Without this, one underlying move registers as two independent themes and the
multi-theme surface manufactures agreement — the A1 error rebuilt one layer up.

### `regime_theme_states` — append-only
`(theme_key, as_of, logic_version)` PK. `state` CHECK in
`dormant | emerging | established | exhausted | aborted`. Plus `strength` numeric,
`evidence` jsonb (which triggers fired, with values), `computed_at`.

Append-only by trigger, as `book_factor_betas` is.

### `regime_theme_transitions` — append-only
`theme_key`, `as_of`, `from_state`, `to_state`, `logic_version`, `triggered_by` jsonb.

This is the table a Bench thesis eventually references to know the regime state it was
written under. Nothing consumes it yet; it exists so that history accumulates from day one
rather than being backfilled later from a state series that was never designed to support
it.

### Acceptance
1. Four tables, constraints as specified, append-only triggers proven by attempted update.
2. Two themes and their trigger sets seeded at `v0-uncalibrated`.
3. Every trigger row resolves: `series_key` exists in `macro_series`, `axis_key` in
   `factor_axes`.
4. A query listing each theme with its triggers by role, run and output pasted into the
   report — the check that the definitions are legible from the data alone.

**Report back:** that query's output, and any trigger row whose `series_key` A0b did not
supply.

Do not implement detection. Do not write to `regime_theme_states`.
