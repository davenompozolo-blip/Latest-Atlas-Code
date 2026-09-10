-- E1.1 (cont.) -- backfill the 24 theses that predate the snapshot table.
--
-- Each is snapshotted AT ITS OWN CREATION DATE, not at today's axis state.
-- Stamping them with today would assert that every existing thesis was written
-- under the current regime, which is false for all but the newest and would
-- make every drift figure read as zero on day one -- a fabricated baseline,
-- and precisely the failure mode this module exists to avoid.
--
-- The data supports the honest version: every claim's creation date has axis
-- scores at or before it (checked -- earliest claim 2026-08-11, factor scores
-- run well before that). atlas_snapshot_thesis_regime takes the most recent
-- session ON OR BEFORE the date, so the two claims created on Sunday 2026-09-06
-- correctly take Friday 2026-09-04, and today's claim takes 2026-09-09 because
-- the 23:10 refresh has not run yet.
--
-- snapshot_reason = 'backfill' keeps these distinguishable from rows the
-- trigger wrote in real time. A backfilled baseline is a reconstruction, and a
-- reader should be able to see which rows are which.

do $backfill$
declare
    r        record;
    v_rows   integer;
    v_total  integer := 0;
    v_claims integer := 0;
begin
    for r in
        select bc.id, (bc.created_at at time zone 'America/New_York')::date as et_date,
               bc.created_at
          from public.bench_claims bc
         where not exists (select 1 from public.thesis_regime_snapshots s
                            where s.thesis_id = bc.id)
         order by bc.created_at
    loop
        v_rows := public.atlas_snapshot_thesis_regime(
                      r.id, r.et_date, 'backfill', r.created_at);
        v_total  := v_total + v_rows;
        v_claims := v_claims + 1;
    end loop;

    raise notice 'E1 backfill: % claims, % snapshot rows', v_claims, v_total;

    -- A backfill that wrote nothing is not a success. Either there were no
    -- claims to cover, or the writer silently produced no rows -- and those two
    -- are not the same thing.
    if v_claims > 0 and v_total = 0 then
        raise exception 'E1 backfill covered % claims and wrote 0 rows', v_claims;
    end if;
end;
$backfill$;
