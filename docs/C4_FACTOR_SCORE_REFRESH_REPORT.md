# C4 — Nightly factor-score refresh

**Applied 2026-09-09** to `vdmojjszvvcithuxwexx`.
Migrations `20260909161500_c4_nightly_factor_score_refresh.sql`,
`c4_factor_scores_real_duration`, `c4_revoke_factor_scores_from_public`.

## What was wrong

`factor_axis_scores` and `factor_pair_zscores` had **no writer**. B0 was
persist-and-estimate, so both were current to 2026-09-04 and going stale from
there. At the time C4 started they were **two sessions behind** the price layer.

## What was built

`cron.job` **41 `refresh_factor_scores_nightly`**, `10 23 * * 1-6`, active —
twenty minutes after job 40 `sync_market_series_daily` (22:50 Mon–Sat).
**pg_cron only.** Not Vercel Cron, not GitHub Actions.

It calls a new wrapper, `atlas_run_factor_scores()`.
`atlas_refresh_factor_scores()` — which does the actual work and returns
`(zscores_written, scores_written)` — is **unchanged**. The wrapper adds the two
things a scheduled job needs and a bare RPC cannot have: a `sync_log` row, and a
gate.

## The gate, and the trap in it

> Do not refresh unless `sync_log` shows a `success` for `sync_market_series_daily`
> covering the current run date.

**The upstream does not log under that name.** Cron job 40 is
`sync_market_series_daily`, but the row it produces carries
`function_name = 'backfill_market_prices'` — the *edge function's* name. Gating
on the job name would have matched nothing and skipped every night forever,
silently: precisely the "gate that can never pass" this codebase already has an
entry about. The gate matches `backfill_market_prices`, and records the
upstream's actual status in `details.upstream_status` so a `partial` night is
diagnosable rather than mysterious.

Both jobs run in the same UTC day (22:50 then 23:10), so `current_date` here
compares two job timestamps rather than making a claim about a market session —
unlike the `ts::date` and `(as_of)::date` traps.

## It must not RAISE to refuse

A `RAISE` rolls back its own `sync_log` row, so the refusal would exist **only**
in `cron.job_run_details`. That is the 2026-09-08 segment-job lesson and it is
why the wrapper validates, then `UPDATE`s the row and `RETURN`s.

### Deviation from the brief, stated so it can be overruled

C4 asks the no-op path to "exit **non-200**". There is no HTTP layer here — this
is a SQL function pg_cron calls directly, like `atlas_write_verdicts`. The
SQL-native equivalent is a `sync_log` row closed as `skipped` or `error` with the
reason, which is what every monitoring surface actually consumes. The intent — a
no-op must never be indistinguishable from a write — is met exactly.

## Three outcomes, all proven

The refresh recomputes the whole history and inserts `ON CONFLICT DO NOTHING`, so
a second run in a day legitimately writes zero. Its upsert key is
`(date, pair_key)` / `(date, axis_key)` — derived from data, not from a
clustering — so unlike the segment job's ids it **survives recomputation** and
`DO NOTHING` is genuinely idempotent here.

| # | path | `sync_log` | evidence |
|---|---|---|---|
| 1 | gate refuses | `skipped` | #46030 — `reason: upstream backfill_market_prices has not run today`, `upstream_status: null`. **The log row survived** — no RAISE. |
| 2 | gate passes, work done | `success` | #46032 — `zscores_written 11`, `scores_written 3`, `previous_score_date 2026-09-04` → `latest_score_date 2026-09-08` |
| 3 | idempotent re-run | `skipped` | #46034 — `already current through 2026-09-08`, `scores_written 0`, **duration_ms 1977** |

Row 3 is the point: the idempotent no-op is logged as a `skipped`, not as a
`success` with zero rows.

The `error` path is deliberately narrow — nothing written **and** the z layer
stops behind the newest SPY session. A session where one leg is missing yields
fewer than the 11 pairs a score requires, so scores can legitimately lag prices;
calling that an error would light a red lamp that can never go green, which is
one you learn to ignore.

### 3 rows, not 6 — and that is correct

The catch-up scored exactly one new date (3 axes × 1). 2026-09-05/06 is the
weekend and **2026-09-07 is Labor Day**, so Fri 09-04 → Tue 09-08 is one session,
not two. `market_prices` confirms: 16 legs on 08-31, 09-01, 09-02, 09-03, 09-04,
09-08 and no rows between. No coverage gap.

## Two defects found in my own wrapper, both fixed

**`duration_ms` was 0 on every run.** `now()` is the *transaction* timestamp and
is constant for the life of the transaction; with `sync_log.started_at`
defaulting to `now()` too, `finished_at` always equalled it. A job that
recomputes the entire history would have reported taking no time at all.
`clock_timestamp()` advances inside the transaction — the re-run then measured
**1977 ms**.

**`REVOKE ... FROM anon, authenticated` did not remove EXECUTE.** Postgres grants
EXECUTE to `PUBLIC` by default on every new function and both roles inherit it
from there. The security advisor caught it immediately: the
anon/authenticated SECURITY DEFINER list went 21 → **22** with
`atlas_run_factor_scores` on it *despite* the revoke. Revoking from `PUBLIC` is
what actually works. Verified with `has_function_privilege`: anon `false`,
authenticated `false`, service_role `true`. No net new advisory.

## Acceptance

**Met.** The gate was *one proven unattended run*, and it happened on
**2026-09-09 at 23:10 UTC** — the first scheduled fire after the job was
created.

| | |
|---|---|
| `cron.job_run_details` jobid 41 | `succeeded`, 23:10:00.245 → 23:10:06.278 UTC, "1 row" |
| `sync_log` #46140 | `status success`, `duration_ms` **5889** |
| written | `zscores_written 11`, `scores_written 3` |
| advanced | `previous_score_date 2026-09-08` → `latest_score_date 2026-09-09` |
| aligned | `latest_z_date 2026-09-09`, `latest_spy_date 2026-09-09` |
| gate | `upstream_status success`, `reason null` |

The upstream it gates on, `backfill_market_prices` #46130, ran at 22:50:02 UTC:
`success`, 112 rows across the 16 legs, every leg's `last_date` **2026-09-09**,
`partial_sessions_dropped` **0**. So the gate passed on a real upstream success
rather than on an absent check.

`duration_ms` of 5889 is the second thing this run proves. The 15:54 manual run
recorded **0 ms** because `now()` is the transaction timestamp and
`sync_log.started_at` defaults to it — a job that recomputes the whole history
reporting that it took no time. `clock_timestamp()` fixed it, and this is the
first unattended run to carry a real duration.

**A0's own guard fired in the wild the same day.** The 19:34 UTC manual
`backfill_market_prices` ran with the market open and refused all 16 of today's
in-progress bars: `partial_sessions_dropped` **16**, `last_date` 2026-09-08 on
every leg. The 22:50 scheduled run then took them at 0. That is the
"partial session" guard doing exactly what it was written for, on the one kind
of run that produces the bug.

## Not done

- C5 not started.
- The four unlogged pure-SQL jobs from the audit are flagged, not fixed —
  `atlas_run_factor_scores()` is the pattern to copy if you want them
  instrumented.
