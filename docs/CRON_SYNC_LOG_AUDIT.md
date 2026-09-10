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

---

# Re-sweep — 2026-09-10

Second pass over all 31 `cron.job` entries (30 plus C4's job 41), run before
C5. Same method: every job matched to the `sync_log` writer it should produce,
then every writer's latest row checked against what its schedule implies.

## What changed since 2026-09-09

| | then | now |
|---|---|---|
| Jobs | 30 | **32** (41 `refresh_factor_scores_nightly`, 42 `atlas_feed_reconciliation_nightly`) |
| Rows with `function_name IS NULL` | 147 | **0** |
| Writers that had never logged | 1 (`sync_fundamentals`) | 0 |
| Stale relative to schedule | 0 | **0** |

Both jobs whose first *logged* scheduled run was pending have now had one:
job 41 at 2026-09-09 23:10 (`sync_log` #46140, `success`, 5889 ms) and job 9 at
2026-09-10 01:00 (#46171, `partial`, 550 ms). Neither had ever produced a row
before those fires.

## Finding A — `options_snapshot` wrote its data and no log row. FIXED.

On **2026-09-09** the handler ran, computed, and wrote **93 rows** to
`options_positioning_snapshots` at 23:01:14. It wrote **no `sync_log` row at
all**. On 09-07 and 09-08 it wrote one both nights.

The chain layer reported the stage healthy — `atlas_chain_dispatch` logged
`success`, HTTP 200 — so the only trace of the gap is the absence of the
handler's own row. Read `source` to tell the two layers apart: the chain row
carries `source='pg_cron_chain'`, the handler's carries
`source='options_snapshot'`.

**Why it cannot be diagnosed after the fact is the actual defect.** Both silent
paths look identical from outside:

```js
if (SB_SERVICE) {                      // no else: missing key writes nothing, says nothing
    try {
        const ins = await fetch(...);
        if (ins.ok) { ... }            // no else: a refused insert is dropped
    } catch { /* logging is best-effort */ }   // and a throw is swallowed
}
```

The close path had the same shape, plus a `PATCH` whose response was never
checked — a non-OK PATCH does not throw, which is exactly how 41
`sync_funddata_prices` rows sat open in `running` for months.

`api/vol-dispersion-sync.js` is byte-identical in structure and was fixed with
it. Both now log status and body at error level on a refused open or close, on
a throw, and when `SUPABASE_SERVICE_ROLE_KEY` is absent. **A swallowed write
failure costs months. Log it at error level.**

Not fixed by the same change: *why* the 09-09 insert failed. The handler is on
the same project and key as `vol_dispersion_sync`, which logged fine at 02:30
the next morning, so the key was present — pointing at a transient refusal
rather than configuration. The next occurrence will say so in the logs.

## Finding B — the universe price leg was pinned to yesterday. FIXED.

Surfaced by C5, visible in the audit as `details.end_date` on job 34's rows.
Job 34 sent `'end_date', (current_date - 1)` while job 17 sends
`'end_date', current_date`, so every non-held symbol was **permanently one
session behind the book**. See `docs/C5_FEED_RECONCILIATION_REPORT.md`.

## Finding C — `ts_clusters` failed on 2026-09-09. FLAGGED, not fixed.

Both layers logged it correctly, and the log names the cause:

```
GET universe_risk_stats: 504 {"message":"Gateway Timeout"}
```

`trade_sync_clusters` #46145 `error`, 7218 ms; the chain row #46212 `error`,
HTTP 500. It succeeded on 09-08 (63,709 ms, 417 symbols, 205 clusters) and the
09-10 run is the next test.

**Worth knowing for the segment layer:** `atlas_write_segment_verdicts` runs at
23:38, eight minutes after the clustering job that feeds it. On 09-09 the
clustering failed and the segment job ran anyway — on the **previous night's**
partition. It wrote 5 rows and passed its membership precheck, so nothing is
wrong today, but this is the stale-clustering hazard that precheck exists for
and it has now actually occurred once.

## Finding D — `sync_fundamentals`' scheduled logging is still unproven.

The fix deployed 2026-09-09 15:49 and is proven by a manual run (#46028).
Jobs 13 and 28 last fired 09-09 at 12:00 and 12:30 — **before** the deploy — so
no scheduled run has yet exercised it. First one due 2026-09-10 12:00 UTC.
Absence of a row before then is expected, not a regression.

## Still write nothing to `sync_log` — unchanged, still flagged

Jobs **11** `refresh-nexus-holdings`, **14** `refresh_holding_vol_trailing`,
**37** `refresh_position_returns`; **35** `atlas_run_validation` writes
`atlas_validation_log` instead. All pure-SQL, all outputs current. Job **25**
`atlas_chain_reap` logs nothing by design.

## Nothing is stale relative to its schedule

Checked individually rather than by eyeballing "last run was days ago":
**22** `chain_theme_leadership` is Friday-only (last 09-04, a Friday) and
**24** `chain_sync_valuations` Monday-only (last 09-07, a Monday). Both correct.
`chain_vol_dispersion` errors nightly and is the known-dead premium-key feed.
