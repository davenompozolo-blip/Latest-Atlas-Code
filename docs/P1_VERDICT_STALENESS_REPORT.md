# P1 — Why `book_risk_daily`, `position_verdicts` and `segment_verdicts` stopped at 2026-09-11

Register ID **P1** (F3 §3). Governing spec F1 §0. Acceptance clause (F1 §8.2): *"P1
reported: whether the three stale tables' writers are running, and what they wrote."*

**Answer: the writers are running, and they refused to write. Correctly.** Nothing is
failing silently and nothing is writing elsewhere. One refusal, one cause, three tables.

---

## 1 · What happened

| | |
|---|---|
| Last successful write | **2026-09-11** (Friday) |
| Jobs | 38 `atlas_write_verdicts` `37 23 * * 1-5`, 39 `atlas_write_segment_verdicts` `38 23 * * 1-5` |
| Both active | yes |
| Missed session | **2026-09-14 only** (Monday) |

09-12 and 09-13 were the weekend and these jobs are Mon–Fri, so the apparent four-day gap is
one missed run, not four.

Both jobs fired on Monday and both raised:

```
ERROR: refusing to write verdicts - preflight failed: ledger_coherence:
1 phantom (broker holds, ledger sold out): KMTUY (broker 2.5246)
```

`cron.job_run_details` (jobid 38 runid 63331, jobid 39 runid 63332) — `failed`, 23:37:00 and
23:38:00.

## 2 · The cause was the KMTUY phantom, and the gate is what caught it

KMTUY was liquidated 2026-09-14 at 13:35. `sync_alpaca_positions` was still **v9** that
night — upsert-only, no reconciling delete — so the pre-sale row survived in `positions`:

| `as_of_date` | KMTUY rows in `positions` |
|---|---|
| 2026-09-11 | 1 *(genuinely held)* |
| 2026-09-12 | 1 |
| 2026-09-13 | 1 |
| 2026-09-14 | 1 **(phantom — sold at 13:35)** |
| 2026-09-15 | **0** *(v10 deployed)* |

`transactions` syncs at 22:10, so by 23:37 the ledger recorded the sale while `positions`
still showed the holding. That is exactly the **phantom signature** `ledger_coherence` is
written to detect — broker holds a non-zero quantity the ledger says was sold out — and it
fired on it. The preflight did its job; it is not the defect.

Note the three checks are scoped, not literal: `positions_freshness` passed (09-14 was
correctly dated) and only `ledger_coherence` refused. That is the 2026-08-26 argument for
having both gates, observed in the wild for the second time.

## 3 · The defect P1 actually surfaces: **the refusal was invisible**

```sql
select count(*) from sync_log
where function_name in ('atlas_write_verdicts','atlas_write_segment_verdicts')
  and started_at >= '2026-09-14' and started_at < '2026-09-15';
-- 0
```

**Zero rows.** Not an `error`, not a `skipped`, not an open `running` row. The refusal exists
only in `cron.job_run_details`, which no surface the platform monitors reads:
`atlas_sync_status`, `stuck_syncs` and `feed_coverage` all saw nothing at all.

This is the failure mode CLAUDE.md already records — *"Validate before you write — a RAISE
rolls back its own log row"* (2026-09-08) — still live on a path that entry did not cover.
That fix was applied to the segment job's **share check**, which runs after the snapshot and
now `UPDATE`s its log row and `RETURN`s. The **preflight** refusal is a different path, is
shared by both jobs, and still `RAISE`s. So the one class of failure most likely to recur —
a gate correctly refusing — is the one that writes no evidence.

Had the tables not been read for F-4, the only signal available was three tables quietly
holding Friday's date.

**Not fixed tonight, deliberately.** Both jobs currently pass preflight (§4) and run in
~35 minutes. Editing them now, to improve logging of a path that will not be taken, risks
the run that is finally going to succeed. Queued as its own unit.

## 4 · Current state — tonight's run will write

`atlas_verdict_preflight()` is STABLE and read-only, so it can be asked directly:

| check | passed | detail |
|---|---|---|
| `positions_freshness` | ✅ | positions 2026-09-15 vs last traded day 2026-09-15 |
| `ledger_coherence` | ✅ | **0 phantom: none** \| 2 size disagreements: GDX 100, PBR 500 \| 10 broker-closed with ledger residual |
| `matrix_coverage` | ✅ | 0 absent with a live feed: none \| 2 absent on a thin feed: IXC |

The root cause is closed at the writer: `sync_alpaca_positions` **v10** deployed 2026-09-15,
carrying the reconciling delete, and `positions` holds no KMTUY row for 09-15. The two
standing ledger disagreements (GDX −100, PBR −500) are the permanent pre-ledger rows the
check is deliberately scoped around and do not refuse.

## 5 · The 2026-09-14 gap is permanent

These are append-only histories keyed on `as_of`. The gap **must not** be backfilled: the
only `positions` snapshot for 09-14 is the one containing the phantom, and recomputing now
would write today's book under Monday's date — a row that reads as a real observation of
that session forever after. Same reasoning that declined recovery of C1's three
`stale_snapshot` equity rows.

**This is the live instance F3 §2.3 predicted.** Any card over these three tables must render
the absent-value variant for 09-14, and `book_risk_daily` will carry 13 rows spanning a hole.

## 6 · Consequence for the register

- **F-4 is unblocked**, with the absent variant load-bearing rather than theoretical.
- Once tonight's run lands, `book_risk_daily` gets its first `vol_basis = 'mctr_covariance'`
  row (~19.5% book vol against the 10.78% the old dimensional error published).
- Two follow-ups, neither in any F register, both raised here:
  1. **Preflight refusal writes no `sync_log` row.** Validate, `UPDATE`, `RETURN` — never
     `RAISE`.
  2. **`sync_log.duration_ms` is 0 on every row of both jobs.** `duration_ms` is
     `GENERATED ALWAYS` from `finished_at - started_at` and both are set from `now()`, which
     is the transaction timestamp and constant for the life of the transaction. Needs
     `clock_timestamp()` — the identical defect fixed in C4's wrapper on 2026-09-09.
