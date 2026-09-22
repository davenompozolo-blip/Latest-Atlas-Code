-- I-1 correction: the chain's DAY is a session, not a calendar date.
--
-- Found by the shadow tick at 00:20 UTC, which is exactly what shadow mode was
-- for -- the single-tick traversal test ran entirely before midnight and could
-- not see this.
--
-- atlas_chain_advance() scoped everything to current_date, and the tick window
-- is 20:00-01:59. At 00:00 UTC current_date rolls over INSIDE the chain's own
-- night, so the chain stops being able to see the night it is running:
--
--   atlas_chain_stage_status('ts_correlations', ..., '2026-09-22')  -> not_started
--   atlas_chain_stage_status('ts_correlations', ..., '2026-09-21')  -> skipped
--
-- Same stage, same row, two answers. Nothing RE-fires, because all six heads
-- carry a not_before between 20:45 and 23:05 and that was compared as a
-- TIME OF DAY (00:20 < 20:45). So the rollover looked harmless. It is not:
-- every stage still in flight at 23:59:59 sees its dependency become
-- 'not_started' and waits forever, and the 00:00-01:59 half of the window can
-- never do anything. The tail of a night that slips past midnight is stranded
-- -- write_regime_cvar, write_var_backtest, run_validation -- and the existing
-- clock-driven night already runs to 23:50.
--
-- Two changes, and the second is not optional:
--
--   1. The day window and the dow test read atlas_chain_day(), which puts
--      anything before 02:00 UTC on the previous calendar day.
--   2. not_before is compared as a TIMESTAMP anchored on the chain day, not as
--      a time of day. Otherwise a head that had not fired by midnight could
--      never fire, which is the same unsatisfiable-gate defect one layer down:
--      at 00:20 the 22:00 price window has genuinely passed, so the stage is
--      eligible and should be able to resume.
--
-- The rollover hour is 02:00 because the tick window ends at 01:59. It is a
-- named constant inside one function so the two cannot drift apart.

create or replace function public.atlas_chain_day(p_at timestamptz default now())
returns date
language sql
stable
as $fn$
    -- Explicit UTC, never the session's zone: the cron schedules and every
    -- not_before in atlas_chain_stages are authored in UTC, so the chain day
    -- has to be a claim about that clock and no other.
    select case
        when (p_at at time zone 'UTC')::time < time '02:00'
        then ((p_at at time zone 'UTC')::date - 1)
        else  (p_at at time zone 'UTC')::date
    end;
$fn$;

comment on function public.atlas_chain_day(timestamptz) is
  'The chain night that a given instant belongs to. The tick window spans '
  '20:00-01:59 UTC, so anything before 02:00 belongs to the previous calendar '
  'day. Scoping the chain to current_date instead strands every stage still '
  'running at midnight.';

revoke execute on function public.atlas_chain_day(timestamptz)
    from public, anon, authenticated;
