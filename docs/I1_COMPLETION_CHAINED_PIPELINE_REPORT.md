# I-1 · Completion-chaining the nightly ingestion pipeline

**Date:** 2026-09-21 · **Status:** built, tested, armed in SHADOW. Go-live is one
argument and one prepared migration.

---

## 1. What was asked, and what the measurements said instead

The ask was to nest every edge function inside one orchestrator that fires them
all at once, on the reasoning that staggered trigger times were causing
components to render inconsistently.

Three measurements, taken before building:

### 1.1 The one-function design cannot run on this project

The org is on the Supabase **free** plan. Documented limits: wall clock **150 s**,
request idle timeout **150 s**, CPU 2 s/request, memory 256 MB.

Measured from `sync_log` over 14 days, the trade-sync chain alone:

| stage | avg | max |
|---|---:|---:|
| assets | 18.5 s | 40.0 s |
| correlations | 91.4 s | 99.2 s |
| signals | 216.5 s | 255.8 s |
| coherence | 197.4 s | 234.9 s |
| universe | 203.9 s | 241.5 s |
| clusters | 59.6 s | 83.7 s |
| triggers | 227.3 s | **255.9 s** |
| **total** | **1,014.6 s** | |

**6.8× the entire budget of one worker.** `Promise.all` does not rescue it: a
parallel orchestrator still has to stay alive until the slowest child returns,
and `trade_sync_triggers` alone is **1.7× the 150 s ceiling**.

### 1.2 The ceiling is already binding, in this pipeline

`sync_fundamentals` self-limits at ~110 s and logs *"wall-clock budget reached
after 140 of 300 symbols; 160 unprocessed"* on **every run** — 115/116/120/125/140
of 300 across the sample. Three runs blew past and were killed (`sync_log`
46383/46643/46964, status `error`, rows left open **2h03m / 2h15m / 2h04m**).

One function already tried to do too much in one invocation. This is what it
looks like.

### 1.3 The inconsistency is a READ-path skew, not a write-path schedule

Measured live:

```
live_rows 64   mv_rows 64   price_differs 58   max_pct_gap 2.3810%
positions watermark 19:35:04Z   (7 seconds old)
```

`vw_portfolio_home` is live off `vw_positions_current`; `mv_nexus_holdings` is a
matview refreshed every 10 minutes. **58 of 64 held names carry a different price
between them at the same instant, worst 2.38%.** Panels below the matview
(holdings table, Theme cut, bench docket, contribution) disagree with panels on
the live view *within one page load*.

The nightly chain runs 21:00–23:50 UTC, so its internal ordering is invisible to
a daytime reader. **Collapsing the writers would not move that number at all.**

CLAUDE.md recorded this skew once as "at most 0.110pp" and waved it through. At
2.38% it is not benign. **It is its own unit and is not fixed here.**

---

## 2. What was built

One trigger, each stage firing on its predecessor's **completion**, with the
external-availability floors preserved.

### 2.1 Topology as data — `atlas_chain_stages`

28 stages, 6 heads, 13 sql / 10 http / 5 edge. Two columns carry what a clock
schedule conflates:

- **`depends_on`** — the stage that must reach a terminal state first.
- **`hard`** — `true` a real data dependency, an upstream error blocks;
  `false` ordering only, any terminal state releases.

**Conflating them turns one failed leg into a dead night.** §4.2 shows this
paying off.

**`not_before` is not padding and must not be removed.** Alpaca has no settled
bar before the session closes and `todaysBarIsPartial()` refuses Yahoo's
in-progress bar, so the price stages carry a genuine floor. 7 of 28 stages have
one; the other 21 run the moment their upstream lands.

Validated on seed: 0 unresolvable sql targets, 0 orphan dependencies, 0 sequence
inversions, and **0 stages whose `dow` is not a subset of their dependency's** —
a Mon–Sat stage behind a Mon–Fri one could never fire on Saturday, which is the
"gate that can never pass" shape this codebase has now hit five times.

`kind='sql'` targets are constrained to a bare function call
(`^[a-z][a-z0-9_]*\(\s*[0-9]*\s*\)$`). A writable topology table feeding
`EXECUTE` inside a `SECURITY DEFINER` body is an arbitrary-SQL path, and
"only service_role can write it" should not be the only thing in the way.

### 2.2 The correction that mattered — the dispatch row is not a completion signal

Measured on the live chain, 2026-09-18 and 2026-09-21:

| stage | dispatch row closed | handler actually ran | overshoot |
|---|---:|---:|---:|
| `ts_signals` | 3.1 s | 242.4 s | **243 s** |
| `ts_universe` | 0.13 s | 241.5 s | **243 s** |
| `ts_triggers` | 0.25 s | 231.0 s | **233 s** |
| `ts_coherence` | 3.8 s | 222.0 s | **222 s** |
| `ts_correlations` | 3.5 s | 92.3 s | **93 s** |
| `options_snapshot` | 0.09 s | 68.8 s | **74 s** |

`atlas_chain_reap()` grades the pg_net response, and these handlers answer
immediately and keep working. **Chaining a successor off that row would have
fired it up to four minutes before its input existed** — worse than the
ten-minute clock gaps this unit set out to remove.

The overshoot is **not universal**, which is why it is per stage rather than a
blanket delay: `ledger_snapshot` (528 ms) and `theme_leadership` (38 s avg,
53 s max) return on completion, and every edge function returns on completion
and self-logs under a distinct `source`. Only the `/api/trade-sync` legs and
`options-snapshot` answer early.

So a stage that cannot be graded from its own dispatch row names the row that
does: `completion_log_name` + `completion_source`, with `max_wait_s` set from
observed max plus margin (420 s for the ts_* legs against a 255.9 s peak).

`atlas_chain_stage_status()` is the single place that decides completion, so the
advance loop cannot hold a second opinion. It returns `not_started` / `running`
/ `success` / `skipped` / `error` / **`unobserved`**.

**`unobserved` is deliberately neither success nor error.** A stage whose
completion cannot be seen has not been seen to complete.

**`partial` counts as success**, because on this platform it is the healthy
outcome: `sync_portfolio_history` reports partial when it correctly flags a
`stale_snapshot` row, `sync_fundamentals` when it stops at its budget. Treating
it as failure would block the chain nightly on jobs working as designed.

---

## 3. Rules from this codebase applied, not rediscovered

- **Never `RAISE` on a refusal** — it rolls back the `sync_log` row recording the
  refusal and leaves the failure only in `cron.job_run_details`. The advance
  function validates, writes, returns.
- **`clock_timestamp()`, not `now()`** — `now()` is the transaction timestamp, so
  every duration would read 0 ms.
- **A no-op must be legible** — `skipped` with a reason, never `success` with
  nothing written.
- **`pg_try_advisory_lock`** — pg_cron runs overlapping instances, and a sql
  stage can hold the tick for 27 s.
- **Grants verified with `has_function_privilege`**, not by reading the
  migration: anon false, authenticated false, service_role true on all three.

---

## 4. Tests

### 4.1 `atlas_chain_stage_status` contract — 10/10

`supabase/tests/chain_stage_status_contract.sql`. Sentinel stages and sentinel
`sync_log` sources throughout, because **running a rolled-back test through the
Supabase MCP commits it**.

The fixture discriminates by construction: `i1t5` and `i1t7` carry the
**identical** dispatch state (`success`) and differ only in whether a probe is
configured — answers `success` vs `running`. A regression removing the probe
fails cases 6 and 7 immediately.

| case | state | expected |
|---|---|---|
| 6 | success dispatch, probe never appeared, past `max_wait_s` | **`unobserved`** |
| 7 | success dispatch, handler still working | **`running`** |

All sentinel rows deleted afterwards; verified 28 stages remaining, 0 residue.

### 4.2 Forced failure — and a real defect it found

`ts_correlations` set to `error`, its downstream cleared, one tick:

| | first attempt | after fix |
|---|---|---|
| blocked | 1 (`ts_signals`) | **7** — the whole hard subtree |
| wrongly fired | **9** | **0** |
| correctly fired anyway | — | 3 |

**The first attempt blocked exactly one level and then ran the entire rest of
the night on absent input.** A blocked stage recorded itself `skipped`, and
`skipped` is a pass, so its successor read its own blocked predecessor as a
stage that had simply declined to work.

`skipped` was doing two jobs: *"I declined"* (no CRON_SECRET, price gate not met,
already written for this `as_of`) and *"I was not allowed to run"*. The first
releases successors; the second is a failure wearing a skip.
`details.reason like 'upstream_%'` tells them apart, so the row stays honest
about what happened while the chain stops.

**The three that still fire are exactly the `hard=false` edges** —
`refresh_cluster_identity`, `run_validation`, `log_universe_price_coverage`.
Validation still grades a night that failed, which is why `hard=false` is on it.
That is the strongest evidence the two-column model was right.

### 4.3 Traversal — 27 of 28 in one tick

`atlas_chain_advance(true)`: **27 stages fired, 0 blocked, 539 ms**, in exact
dependency order. The absentee is `theme_leadership`, Friday-only, on a Monday.
Second tick: **0 fired, 6 ms** — idempotent.

### 4.4 `vw_chain_status` against tonight's live chain, mid-flight

| stage | dispatched | live_status | worker overshoot |
|---|---|---|---|
| `ts_signals` | 22:45 | success | 243 s |
| `ts_coherence` | 22:55 | success | 222 s |
| `ts_universe` | 23:05 | success | 244 s |
| `ts_triggers` | 23:12 | **running** | — |

`ts_triggers`'s dispatch row is already acknowledged and the view correctly
grades it `running`. Note `ts_universe` finished ~23:09:04 while `ts_triggers`
fired at 23:12 — **under 3 minutes of margin on tonight's real run.**

---

## 5. What is NOT done

**The chain is armed in SHADOW** (`atlas_chain_advance_shadow`, cron job 51,
every minute 20:00–01:59). It records the plan under
`source='pg_cron_chain_shadow'` and dispatches nothing. Tonight's pipeline is
untouched.

Go-live is `supabase/migrations/PENDING_i1_chain_go_live.sql.txt` — **written and
deliberately not applied.** It flips the argument and unschedules the 27 stage
entries. Both must happen together: a live chain beside armed clocks runs every
stage twice.

**Read the file before applying.** Job 15 `sync_alpaca_transactions` is scheduled
`10 13,22 * * 1-5` — *two* times in one entry. The chain covers only the 22:10
leg, so unscheduling it outright would silently kill the 13:10 intraday run. It
is replaced by a 13:10-only entry rather than removed.

**Shadow mode proves reachability, not timing**, and the distinction is worth
stating: shadow rows complete instantly, so the shadow walk is self-referential
and finishes in one tick. It proves the graph is traversable, acyclic, correctly
day-scoped and correctly blocked. It does **not** predict when stages would fire
on a real night — §1.1's measured durations do that.

### Flagged, not fixed

- **The 2.38% live-vs-matview skew (§1.3).** This is what the terminal is
  actually showing. Its own unit.
- **`CHAIN_BASE_URL` is unset**, so `atlas_chain_base()` runs on its hardcoded
  fallback host. `FUNCTIONS_BASE_URL` likewise for the new
  `atlas_functions_base()`.
- **`sync_fundamentals` leaves 160 of 300 symbols unprocessed every run** and has
  been killed three times leaving rows open for 2+ hours.
- **`ledger_snapshot` and `theme_leadership` write no worker `sync_log` row** —
  the "a handler can write its data and no log row" pattern, in two more places.
  Their dispatch rows genuinely reflect completion today, so nothing is wrong;
  but their completion is unverifiable if that ever changes.
