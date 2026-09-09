# C1 — Equity-curve integrity

**Applied 2026-09-09** to `vdmojjszvvcithuxwexx`.
Migration `20260909130000_c1_1_equity_curve_data_quality.sql`;
edge function `sync_portfolio_history` v6.

---

## The brief's premise needed correcting first

C1 described four rows bit-identical to their predecessor across `equity`,
`profit_loss`, `profit_loss_pct` and `base_value`. **Exactly one row in the table
matches that description, and it is not a defect.**

That row is id 2, 2025-12-26: the account funded at 100,000.00 and not yet
deployed, so 2025-12-24 and 2025-12-26 are both genuinely flat. It is left
`settled`. (The brief inherited the "four" from the B0 note, which had counted
rows identical **on `equity`** — four, including this one.)

The real defect looks different, and the difference is why it survived.

**`profit_loss` is the daily change in equity, not a cumulative figure.** On
2026-07-28 equity is 92,517.32 against the prior 94,279.86, and `profit_loss` is
exactly −1,762.54. On the three affected rows the equity is carried forward and
`profit_loss` / `profit_loss_pct` are **0.00** — which is arithmetically
*consistent* with the carried level. The row is internally coherent and factually
false. **No cross-column check inside the row can catch it**, which is precisely
why nothing ever flagged it.

What identifies it is the transition: a deployed book that moved the day before,
reporting a change of exactly zero to the cent. That is not a market outcome. The
third predicate below is also what excludes the legitimate pre-deployment flat,
where the prior day's change was zero too.

```sql
equity      is not distinct from lag(equity)       -- level carried forward
and profit_loss = 0                                -- day's change zeroed
and lag(profit_loss) is distinct from 0            -- off a day that did move
```

## C1.1 — Marked, not deleted

`data_quality text NOT NULL DEFAULT 'settled'`, CHECK in
`settled | stale_snapshot | recovered | unknown`. **3 rows** flagged
`stale_snapshot`, 173 `settled`.

| id | date (ET) | equity | prior equity | `profit_loss` | prior `profit_loss` |
|---:|---|---:|---:|---:|---:|
| 15 | 2026-01-15 | 102,011.43 | 102,011.43 | 0.00 | −398.34 |
| 256 | 2026-05-04 | 100,608.54 | 100,608.54 | 0.00 | −120.57 |
| 9108 | 2026-07-29 | 92,517.32 | 92,517.32 | 0.00 | −1,762.54 |

2026-07-29 is the one that sits against a **−1.55% SPY session**.

### The damage reaches one row further than the flag

The provider computes the *next* day's change against the carried level, so
2026-07-30's `+2,488.02` is a **two-day move reported as one day's**. A consumer
of `profit_loss` must treat the row after a `stale_snapshot` with the same
suspicion as the row itself. This is why C3 excludes six returns, not three.

## C1.2 — Recovery attempted and declined

`account_snapshots` (44,926 rows, 5-minute cadence) and `transactions` both exist.
Reconstruction was tested properly and **is not defensible. All three rows remain
`stale_snapshot`; none was written as `recovered`.**

**2026-01-15 is not recoverable at all** — `account_snapshots` begins 2026-04-06.

For the other two, the obstacle is that `account_snapshots.equity` and
`portfolio_equity_curve.equity` **are not the same measurement**, and they
disagree on healthy days as well as broken ones. Probing at four times of day
(the curve rows are stamped 20:00 ET):

| probe | MAE vs curve | sd |
|---|---:|---:|
| 16:00 ET | **385.5** | 544.7 |
| 18:00 ET | 447.8 | 676.8 |
| 20:00 ET | 487.3 | 679.8 |
| last of day (23:55) | 736.4 | 955.5 |

No probe time reconciles them, so this is a basis difference, not a timing
artefact.

**The cause was identified rather than left as noise.** Splitting the 105 healthy
overlap days by whether the book held options that day:

| | days | mean (curve − snapshot) | sd |
|---|---:|---:|---:|
| holding options | 35 | **+678.6** | 562.3 |
| no options | 70 | **+61.5** | 293.6 |

`corr(diff, option market value)` = −0.33. The book held 5–6 **short** option
positions through early May (MV −1,826 to −3,334) and none by late July; the two
sources mark short options differently.

That makes the two dates asymmetric:

- **2026-05-04** falls inside the options period. The local gap runs ~+1,000 to
  +2,000 and wanders by ~±400 day to day. A reconstruction would carry roughly
  ±0.4% — on a day whose true move is probably smaller than that.
- **2026-07-29** falls in the option-free period, where neighbouring days agree to
  −121, +366, +109, +111, −178, [stale], +91, −269. The 16:00 snapshot reads
  **90,629.71** against the carried 92,517.32, implying roughly a −2.0% day.

2026-07-29 is therefore a *near miss*, and it is worth saying so explicitly. It
was still declined: even on option-free days the two series differ by **+61.5 ±
293.6**, so a reconstructed level carries ~±0.3pp of measurement noise into a
return whose typical magnitude is ~1% — about a third of the signal. Writing that
as a settled level would assert a settlement this project cannot make, and it
would put one snapshot-basis return among 167 provider-basis ones.

**An honest gap beats a reconstructed number nobody can defend.** The cost is two
observations out of 174; the alternative is a mixed-basis column. If you want the
observation back, the 90,629.71 figure and its ±294 band are recorded here and the
`recovered` state and its write-protection are already built.

## C1.3 — Writer fixed

`sync_portfolio_history` (edge function, cron job 9, 01:00 UTC) → **v6**.

**The writer was never the culprit.** It writes exactly what Alpaca's
`/v2/account/portfolio/history` returns and carries nothing forward itself. The
defect is upstream and persistent: the job re-upserts a 6-month window nightly, so
Alpaca has returned these same values every night since, and they have never
self-corrected.

**A second, larger finding.** `sync_portfolio_history` had **no `sync_log`
integration of any kind** — not one row, ever. The 01:00 nightly job was invisible
to every surface the platform monitors. That is fixed: it opens a row, closes it
with the real outcome, and never writes `duration_ms` (`GENERATED ALWAYS`).

Behaviour now:

- Detects the signature in the fetched series, seeded from the row immediately
  **preceding** the window so a stale point on the window's first bar is still
  caught — a window run puts a new boundary in a different place every night.
- Writes the row flagged `stale_snapshot`; closes `sync_log` as `partial` with
  `stale_snapshots_flagged`, `stale_dates` and a `reason`.
- **Never overwrites a row already marked `recovered`** — the upsert carries
  `WHERE data_quality <> 'recovered'`, so a reconstruction cannot be silently
  clobbered by the provider's stale level on the next run.
- An empty history is now an **error**, not `200 {inserted: 0}`.
- Records `details.mode` (`window` vs `backfill`), for the reason A0 records
  `mode` and `scope`.

### Deviation from the brief, stated so it can be overruled

C1.3 asked for the row **not to be written at all**. It is written, flagged.

C1.1 settles the same question the other way for the same class of row —
*"deleting them would hide the defect and change row counts other modules may
depend on. The flag is the fix; consumers filter on it."* Not writing is deleting,
decided one night earlier. Skipping an interior point of a nightly 6-month
re-fetch also leaves a hole with nothing to explain it, which is the silent
outcome the brief exists to eliminate, and leaves C1.1's flag nothing to mark.

The gate is *"no row in the series is a settled level the provider did not
settle."* A row flagged `stale_snapshot` is not a settled level, so the gate is
met. The refusal is made legible rather than the write silent — the brief's own
principle, and A0's `partial_sessions_dropped` pattern.

### Proven, not assumed

Fired through pg_net with the cron's own body. `sync_log` #46021:

```
status  partial      duration_ms 537 (derived, not written)
details mode=window  period=6M   valid_rows=127
        stale_snapshots_flagged=2
        stale_dates=["2026-05-04","2026-07-29"]
```

**This is an independent confirmation of C1.1.** The TypeScript rule, applied to
Alpaca's live response, re-detected exactly the dates the SQL rule found in stored
data. 2026-01-15 is outside the 6M window, correctly absent.

## Gate

**Met.** No row in the series is a settled level the provider did not settle: the
three carried-forward levels are flagged, the pre-deployment flat is a real
settlement, and the writer cannot publish a new one as settled.

## Follow-ups

1. **`runPortfolioHistory` in `supabase/functions/_shared/alpaca_tasks/portfolio_history.ts` has no callers.** It is a second, older implementation of this writer, without the stale detection or the `sync_log` integration. Left alone as out of scope, but it should be deleted or brought into line before anything starts calling it.
2. The provider has not self-corrected these three points in the months since. If that matters, they can only be fixed by a `recovered` write, with the basis caveat above.
