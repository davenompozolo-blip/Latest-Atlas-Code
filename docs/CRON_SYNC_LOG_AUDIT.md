# Cron ↔ sync_log audit

**2026-09-09**, project `vdmojjszvvcithuxwexx`. Every entry in `cron.job` checked
against the writer it is supposed to produce in `sync_log`.

Prompted by C1: `sync_portfolio_history` ran nightly at 01:00 with no `sync_log`
integration at all and was invisible to every monitoring surface — the third
silently-skipping scheduled job in this codebase's history, and C4 was about to
add a fourth job to the set.

---

## Headline

**30 jobs. One writer had never produced a `sync_log` row; 147 rows existed but
were unattributable; four jobs write nothing by design or omission. Nothing was
stale relative to its schedule.**

| | count |
|---|---:|
| Jobs whose writer logs correctly | 22 |
| **Never written a `sync_log` row — FIXED** | **2 jobs, 1 writer** |
| **Rows written but unattributable — FIXED** | **147 rows, 2 writers** |
| Write nothing to `sync_log` — **flagged, not fixed** | 4 |
| Writes nothing by design (`atlas_chain_reap`) | 1 |
| Newly added by C4 | 1 |
| **Stale relative to schedule** | **0** |

---

## Finding 1 — `sync_fundamentals` had never written a row. FIXED.

Cron jobs **13** `sync_holdings_fundamentals` (12:00 weekdays) and **28**
`sync_universe_fundamentals` (12:30 weekdays) both call it. Ten fires a week,
all succeeding at the cron level, for the entire life of the function.

It logged to **`atlas_sync_log`** — the legacy table `CLAUDE.md` explicitly says
never receives a row — and it was right: **`atlas_sync_log` has 0 rows, ever.**

Three faults stacked:

1. **Wrong table.** `atlas_sync_log`, not `sync_log`.
2. **Wrong columns.** It sent `metrics` and `notes`; the table has `metadata` and
   no `notes` at all, so PostgREST rejected every insert outright.
3. **Swallowed.** The whole thing sat inside `try { … } catch { /* best-effort */ }`,
   so the rejection never surfaced.

**The job itself always worked** — `equity_cache` was written 3.2 hours before
this audit, by job 28's 12:30 run. Only the log was dead. That is the same shape
as `sync_funddata_prices` in `CLAUDE.md`, one layer worse: it never even reached
the right table.

**Fixed** — `sync_fundamentals` v6 opens a `sync_log` row and closes it with the
real outcome, never writes `duration_ms` (GENERATED ALWAYS), records
`details.mode` to tell job 13's holdings run from job 28's universe slice, and
logs a failed log-write at **error** level instead of swallowing it.

Four outcomes, so the idempotent no-op is neither dressed up as a write nor
mistaken for a failure:

| enriched | failed | status |
|---|---|---|
| > 0 | 0 | `success` |
| > 0 | > 0 | `partial` |
| 0 | > 0 | `error` |
| 0 | 0 | `skipped` — nothing needed doing |

That last row is the ordinary case under `only_missing=true` once the universe is
warm, and it is deliberately **not** an error: writing nothing is not the defect
signal, exactly as `sync_alpaca_transactions` writes zero rows on a day the book
does not trade. The genuine break — `assets` returning nothing on the *first*
page — is separated out and is an `error`.

**Proven live**, `sync_log` #46028: `success`, 2155 ms (derived),
`mode=holdings`, processed 2, enriched 2, failed 0. The first row this function
has ever produced.

## Finding 2 — 147 rows had `function_name IS NULL`. FIXED.

| source | rows | span |
|---|---:|---|
| `options_snapshot` | 94 | 2026-06-18 → 2026-09-08 |
| `vol_dispersion_sync` | 53 | 2026-07-11 → 2026-09-09 |

`api/options-snapshot.js` and `api/vol-dispersion-sync.js` set `source` and never
`function_name`, so every row they wrote was invisible to any query keyed on
`function_name` — which is how a reader enumerates writers, and how this audit
found everything else. `api/trade-sync.js` already does it correctly
(`function_name = 'trade_sync_' || job`), so these two were the exception.

**Fixed** at the source in both handlers, plus an exact backfill: every one of
the 147 rows already carried a `source` that *is* the job's real name, so nothing
was inferred. **0 rows now carry a NULL `function_name`.**

### Not a defect, but worth knowing

Each chain stage produces **two** `sync_log` rows: `atlas_chain_dispatch` writes
one (`source='pg_cron_chain'`, carrying the HTTP status) and the Vercel handler
writes another (carrying the real work detail). For trade-sync they are named
apart (`ts_signals` / `trade_sync_signals`); for options and vol-dispersion they
now share a name and are told apart by `source`. **Read `source` to distinguish
the layers, and do not double-count runs.**

## Finding 3 — four jobs write no `sync_log` row. FLAGGED, not fixed.

| jobid | job | schedule | writes instead |
|---|---|---|---|
| 11 | `refresh-nexus-holdings` | every 10 min | nothing |
| 14 | `refresh_holding_vol_trailing` | 22:25 weekdays | nothing |
| 37 | `refresh_position_returns` | 23:35 weekdays | nothing |
| 35 | `atlas_run_validation` | 23:40 weekdays | `atlas_validation_log` (current, 16.1 h old — correct for its cadence) |

All four are pure-SQL calls, so a failure appears **only** in
`cron.job_run_details` — the surface that, per the 2026-09-08 segment-job entry,
nobody monitors. Their output tables are all current (`holding_vol_trailing`
2026-09-08, `atlas_validation_log` last night), so nothing is broken today.

**Not fixed because it is not cheap**: four SQL functions would need a logging
wrapper each, two of them (`refresh_position_returns`, and the matview refresh
behind Nexus) sitting directly under the returns and verdict pipelines. That is a
change worth making deliberately, not as a side-effect of an audit. C4's wrapper
`atlas_run_factor_scores()` is the pattern to copy if you want it done.

Job 25 `atlas_chain_reap` writes nothing **by design** — it exists to close
*other* jobs' rows — and is excluded from the above.

## Finding 4 — `sync_portfolio_history`, pending verification.

Fixed earlier today (C1.3, v6). Its 01:00 run fired at 2026-09-09 01:00, **before**
the deploy, so the only row it has is the manual test. **The first logged
scheduled run is due 2026-09-10 01:00 UTC** and has not happened yet.

## Nothing is stale relative to its schedule

Every job's most recent `sync_log` row matches its cadence. The evening batch
(21:00–23:40) last ran 2026-09-08 and had not yet run again at audit time
(≈16:00 UTC). Two low-frequency jobs verified individually rather than assumed:

- **22 `chain_theme_leadership`** — `15 23 * * 5`, last fired Fri 2026-09-04. On
  cadence. (Its *output* `theme_leadership_weekly` is still 0 rows ever — a
  known-dead feed, not a scheduling fault.)
- **24 `chain_sync_valuations`** — `0 6 * * 1`, last fired Mon 2026-09-07. On cadence.

One historical failure, already understood: **39 `atlas_write_segment_verdicts`**
failed 2026-09-07 with `segment shares do not close to 1.0 -- bet: risk 1.875066`.
That is the documented first-run failure; the fix landed and 2026-09-08 succeeded.

## What this audit could not see

The audit compares `cron.job` to `sync_log`. It cannot tell you that a job which
logs `success` every night is writing *the wrong thing* — `sync_fundamentals` was
found because its log was absent, not because its data was checked. The
`price_coverage`-vs-universe entry in `CLAUDE.md` is the standing example of a
check that passes correctly while a feed is stopped.
