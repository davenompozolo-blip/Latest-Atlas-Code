# Regime & Risk — state of play

**As at 2026-09-09.** Written to hand the Regime & Risk workstream to another
session. Everything below was verified against the live database on the date
shown, not recalled — but the book moves nightly, so **re-measure before quoting
any figure here as current.**

---

## 0. The one thing to get right first

There are two Supabase projects and they look identical through the MCP.

| Ref | What it is |
|---|---|
| **`vdmojjszvvcithuxwexx`** | **The platform.** pg_cron, pg_net, Vault, every table in `CLAUDE.md`. All of A0 and B0 live here. |
| `jikbulixwvvfrirjpgra` | The **CFA Codex** content project. No scheduler, no platform tables. |

The A0 spec named the Codex project by mistake and the layer was built there
first, then moved. **That is closed as of 2026-09-09** — the Codex project holds
no A0 tables, no coverage view and no edge functions (`list_edge_functions`
returns empty). No Atlas schema, job, function or migration belongs in it.
Treat `vdmojjszvvcithuxwexx` as the only project in this workstream.

Operational notes that cost time before:

- Use `apply_migration` for DDL and privileged inserts. `execute_sql` runs as a
  read-only role.
- `sync_log.duration_ms` is `GENERATED ALWAYS`. Never write it.
- `sync_log_status_check` permits `running | success | partial | error |
  skipped` on this project. Not `warning`.

---

## 1. Where the roadmap stands

| Phase | What it is | State |
|---|---|---|
| **A0** | Price series layer + instrument registry | **Done, accepted, live and scheduled** |
| A1 | Correlation / PCA study | Done **outside CC**; its results are frozen into B0 |
| **B0** | Factor axes + the book's exposure to them | **Done, accepted, applied** |
| B1 | — | **No spec has been handed to this workstream.** Ask before assuming. |
| B2–B4 | Stressed CVaR, reverse stress testing, MCTR, hedging, UI | Not started; explicitly out of scope so far |

Both A0 and B0 specs end **"Do not proceed past acceptance."** Neither has been
proceeded past. Nothing below is half-built.

Reports: `docs/A0_SERIES_LAYER_REPORT.md`, `docs/B0_FACTOR_EXPOSURE_REPORT.md`.

---

## 2. A0 — the series layer

Three tables in `public`, all on `vdmojjszvvcithuxwexx`:

| Object | Rows | Notes |
|---|---:|---|
| `market_instruments` | 16 | ETF legs. `caveats` is NOT NULL and non-blank by CHECK. |
| `market_prices` | 102,923 | Daily bars to each leg's own inception; earliest 1993-01-29, newest **2026-09-08**. Both `close` and `adj_close`. |
| `ratio_pairs` | 12 | **Definitions only.** No ratio is stored as a series — pairs are evaluated from the legs at query time, so one can be re-specified without a backfill. |
| `vw_market_price_coverage` | — | `security_invoker`. Returns **zero** exception rows. |

**Source is Yahoo**, recorded honestly as `data_source='yahoo'`. Neither source
the spec named could work: Alpaca bars begin 2016 (short for all 16 legs) and
Alpha Vantage's adjusted-close and full-history endpoints are premium on the
key in use.

### The nightly job

`sync_market_series_daily`, **22:50 UTC Mon–Sat**, `cron.job` id 40, calling the
`backfill_market_prices` edge function over pg_net with
`{"lookback_days": 10}`.

**Its first unattended run is proven**, which was A0's last open step: pg_cron
`succeeded` at 2026-09-08 22:50:00 UTC; `sync_log` #45806 closed `success` in
924 ms with 96 rows (16 legs × 6 sessions in the window — the upsert makes the
overlap free), `mode=window`, `lookback_days=10`,
**`partial_sessions_dropped=0`**.

### Two traps already paid for

**A bar for today is not a close until the session ends.** The first load ran
at 10:48 ET with the market open and stored Yahoo's in-progress bar as a settled
close for all 16 legs (SPY went in at 767.10). Nothing looked wrong — right
shape, right date, plausible number, `success, 102,923 rows`. The guard that was
meant to prevent it only dropped *future*-dated bars while its comment claimed
otherwise. `todaysBarIsPartial()` now asks the provider's own session clock
(`currentTradingPeriod.regular.end`) and refuses today's bar while that instant
is in the future **and** falls on today; with no readable meta it refuses.
`details.partial_sessions_dropped` makes a refusal legible. The 2026-09-08
scheduled run refused 0 while the two manual runs earlier that day each refused
16 — the guard working across a session boundary. SPY's stored close for that
day is **765.96**, the settled print.

**Do not test data equivalence by hashing rounded values.**
`md5(string_agg(round(x, n)))` reported a mismatch at every decimal down to 3,
which reads as a 1e-3 defect. Across 102,907 rows some value always straddles a
rounding boundary, so the hash breaks however small the real difference is.
Diff the payloads and report a max relative difference: `close` is
bit-identical across the project move; `adj_close` differs by at most **2.15e-6**
relative, scaling with dividend count (DIA 339 → 2.2e-6; GLD and CPER, which pay
none → exactly 0). That is float32 rounding in the provider's cumulative
adjustment product, not a restatement.

---

## 3. B0 — the factor layer

Five tables, over the A0 series layer:

| Object | Rows | Notes |
|---|---:|---|
| `factor_axes` | 3 | `cyclical`, `concentration`, `dollar` |
| `factor_axis_loadings` | 33 | **Frozen**, from the A1 study |
| `factor_pair_zscores` | 45,463 | Standardisation params stored, `n_baseline >= 750` by CHECK |
| `factor_axis_scores` | 12,399 | |
| `book_factor_betas` | 5 | **Append-only, enforced by trigger.** Never update an estimate in place. |

`atlas_refresh_factor_scores()` rebuilds the score series.

### The result — and what is *not* an exposure

Window 2025-12-26 → 2026-09-04, **n = 174**, R² 0.770, adj 0.765, DW 2.133.
**Standard errors are Newey-West** (Bartlett, lag `⌊4(T/100)^(2/9)⌋`).

| Factor | Beta | NW SE | t | Significant |
|---|---:|---:|---:|---|
| `market` | 0.968234 | 0.144442 | 6.70 | **yes** |
| `dollar` | −0.004759 | 0.000460 | −10.34 | **yes** |
| `concentration` | 0.001205 | 0.000390 | 3.09 | **yes** |
| `cyclical` | 0.000653 | 0.000511 | 1.28 | **no** |
| `alpha` | −0.000802 | 0.000604 | −1.33 | **no** |

**`cyclical` and `alpha` must not be presented downstream as exposures.**
`cyclical` is the *largest* axis by variance explained and carries no measurable
book exposure — that is a result, not a gap, and it has to render as "no
measurable exposure", never as a value. The spec's own gate says a beta
indistinguishable from zero must not be presented as an exposure.

These are **contemporaneous** exposures. R² = 0.77 describes same-day
co-movement; nothing here claims predictive power.

### Four things a next session will otherwise re-derive

**The spec supplied `variance_explained` but not the eigenvectors.** They were
re-derived from `market_prices` and land on the spec's own checksum: 0.290810 /
0.195059 / 0.103176 against 0.291 / 0.195 / 0.103, with exactly three
eigenvalues above the Marchenko-Pastur edge (1.0972 at N=11, T=4882) and the
fourth at 1.0144 below it. **A three-number checksum is enough to prove a
reproduction — ask for one when a spec hands you results without the
intermediate objects.**

**Sign is unrecoverable and is an open question (see §4).** An eigenvector is
defined only up to sign and `variance_explained` is sign-invariant. Each axis
was oriented toward the thing it is named for — raw PC2 points at *breadth*, raw
PC3 at a *weak* dollar, both flipped — and `label` states the direction. Every
acceptance diagnostic (R², condition number, |t|, DW) is sign-invariant, so this
blocks nothing.

**Report the scaled condition number.** Raw is 365.9, scaled (unit-length
columns, Belsley) is **2.385**. The raw figure is dominated by the intercept and
by SPY returns (~1e-2) sitting beside axis scores (~1e0) — units, not
collinearity. Quoting it would manufacture a multicollinearity problem that does
not exist.

**"Near-orthogonal by construction" is a full-sample property.** Over the 19-year
estimation window the axis pairwise correlations are −0.046 / −0.021 / −0.012.
Over the 174-day regression window `concentration`–`dollar` is **−0.312** and
`concentration`–SPY is **+0.592**. Harmless here, but the design's own
justification does not transfer to an arbitrary sub-window.

### A live data defect found on the way

`portfolio_equity_curve` carries **four rows bit-identical to the row before
them**, so `ln(equity_t / equity_{t−1})` is exactly 0. One of them, 2026-07-29,
sits against a −1.55% SPY session — a deployed book cannot be exactly flat
through that. They are **stale snapshots emitted as settled levels**, not flat
days. They attenuate the market beta: 0.968 on all 174 observations, **1.015**
with the four dropped. No significance verdict moves, so B0's conclusions stand
either way. **The writer is not fixed** — see §4.

Also settled here: **cast a timestamptz to the exchange's date, never the
server's.** `portfolio_equity_curve.ts` is stamped after the US close (22:00 or
00:00 UTC), so `ts::date` lands a third of the series on the following calendar
day — 34 of 175 rows onto weekends, 38 with no SPY bar at all. Aligning book
returns to factors on that cast would have misaligned 22% of the sample by one
day and still produced plausible betas.
`(ts at time zone 'America/New_York')::date` gives 175 clean trading days.

---

## 4. Open — decisions for the user, not tasks

1. **Confirm the B0 sign convention** on `concentration` and `dollar`. A1's
   original orientation cannot be recovered from a sign-invariant checksum.
2. **Yahoo as the standing live feed.** Scheduling the job commits the platform
   to it. Alpaca has credentials and a house pattern but cannot restate history
   before 2016, so a hybrid leaves a seam at the join that needs testing for
   level continuity. A premium Alpha Vantage key would make
   `TIME_SERIES_DAILY_ADJUSTED` viable and would also unblock
   `vol_dispersion_daily` (0 rows ever, same root cause).
3. **`adj_close` has never been independently reconciled.** `close` was verified
   bit-identical across the project move; `adj_close` was only shown
   self-consistent to 2.15e-6. A spot-check of two legs against a second free
   feed would close it.
4. **Fix the equity-curve writer** so a stale snapshot is not emitted as a
   settled level.
5. **`dollar` deserves suspicion** proportional to its `marginal` flag — it
   carries the second-largest exposure in the book off the weakest component.

## 5. Obvious next build, not yet authorised

**No nightly job refreshes the factor scores.** B0 was persist-and-estimate; the
score tables are current to 2026-09-04 and go stale from there. Wiring
`atlas_refresh_factor_scores()` into the chain after `sync_market_series_daily`
(22:50) is the natural next step and was deliberately left out of B0 scope.

When adding it: **pg_cron is the only scheduler.** Not Vercel Cron, not GitHub
Actions — both were retired, and `CLAUDE.md` records why at length. Add it to
`cron.job` and nowhere else, gate it on the stage it depends on, and make the
no-op path answer non-200 rather than `200 {written: 0}` — this codebase has
been bitten by a silently-skipping scheduled job twice.
