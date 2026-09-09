-- Corrective to the C4 wrapper, applied separately and recorded here so the
-- repo covers every entry in the database's migration history.
--
-- sync_log.started_at defaults to now() and the wrapper closed with now() too.
-- now() is the TRANSACTION timestamp, constant for the life of the transaction,
-- so finished_at always equalled started_at and every run reported
-- duration_ms = 0 -- a job that recomputes the entire history looking like it
-- did nothing at all. clock_timestamp() advances inside the transaction; the
-- same run then measured 1977 ms.
--
-- The fix is already folded into 20260909161500, so replaying both in order is
-- idempotent and lands on the identical function either way. This file exists
-- for history, not because the end state depends on it.

-- (no-op if 20260909161500 already carries clock_timestamp())
do $$
begin
  if exists (
    select 1 from pg_proc
     where proname = 'atlas_run_factor_scores'
       and pronamespace = 'public'::regnamespace
       and prosrc like '%finished_at = now()%'
  ) then
    raise exception 'atlas_run_factor_scores still closes with now(); reapply 20260909161500';
  end if;
end $$;
