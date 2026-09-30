-- C4. Nightly refresh for the B0 factor-score layer.
--
-- `factor_axis_scores` and `factor_pair_zscores` had NO WRITER. B0 was
-- persist-and-estimate, so the tables were current to 2026-09-04 and going
-- stale from there while everything around them kept moving.
--
-- pg_cron is the only scheduler. Not Vercel Cron, not GitHub Actions -- both
-- retired, CLAUDE.md records why at length.
--
-- ── The wrapper, and why there is one ────────────────────────────────────────
--
-- `atlas_refresh_factor_scores()` does the work and returns
-- (zscores_written, scores_written). It is deliberately left untouched. This
-- wrapper adds the two things a scheduled job needs and a bare RPC cannot have:
-- a sync_log row, and a gate.
--
-- THE BRIEF SAYS "exit non-200". There is no HTTP layer here -- this is a SQL
-- function pg_cron calls directly, like atlas_write_verdicts. The SQL-native
-- equivalent of a non-200 is a sync_log row closed as `skipped` or `error`
-- with the reason, which is what a reader and every monitoring surface actually
-- consume. Stated so it can be overruled; the intent (a no-op must never be
-- indistinguishable from a write) is met exactly.
--
-- IT MUST NOT `RAISE` TO REFUSE. A RAISE rolls back its own sync_log row, so
-- the refusal would exist solely in cron.job_run_details -- invisible to every
-- surface the platform monitors. That is the 2026-09-08 segment-job lesson and
-- it is the whole reason this validates-then-updates rather than raising.
--
-- ── The gate ────────────────────────────────────────────────────────────────
--
-- Do not score a session the prices layer has not delivered. The upstream is
-- cron job 40 `sync_market_series_daily` at 22:50 -- but note it logs to
-- sync_log under the EDGE FUNCTION's name, `backfill_market_prices`, not the
-- job's. Gating on the job name would have matched nothing and skipped every
-- night forever, silently: exactly the "gate that can never pass" this codebase
-- already has an entry about. The upstream's real status is recorded in
-- details.upstream_status so a `partial` night is diagnosable rather than
-- mysterious.
--
-- Both jobs run in the same UTC day (22:50 then 23:10) so `current_date`
-- compares two job timestamps, not a market session -- no timezone claim is
-- being made here, unlike the ts::date and (as_of)::date traps.
--
-- ── Outcomes ────────────────────────────────────────────────────────────────
--
-- The refresh recomputes the whole history and inserts ON CONFLICT DO NOTHING,
-- so a second run in a day legitimately writes zero. That upsert key is
-- (date, pair_key) / (date, axis_key) -- derived from data, not from a
-- clustering, so unlike the segment job's ids it survives recomputation and
-- DO NOTHING is genuinely idempotent here.
--
--   scores written > 0                          -> success
--   nothing written, nothing scorable is missing -> skipped (the ordinary case)
--   nothing written, and the z layer is behind
--     the newest SPY session having produced
--     nothing at all                            -> error
--
-- The error condition is deliberately narrow. A session where one leg is
-- missing yields fewer than the 11 pairs a score requires, so scores can
-- legitimately lag prices; calling that an error would light a red lamp that
-- can never go green, which is one you learn to ignore. SPY is the reference
-- because it appears in most pairs, so max(SPY date) is the newest session the
-- factor layer could actually score.
--
-- `finished_at` uses clock_timestamp(), not now(). now() is the TRANSACTION
-- timestamp and is constant for the life of the transaction, so with
-- sync_log.started_at defaulting to now() as well, every run would report
-- duration_ms = 0 -- a job that recomputes the whole history looking like it
-- did nothing. clock_timestamp() advances inside the transaction and gives the
-- real elapsed time.

create or replace function public.atlas_run_factor_scores()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_log_id          bigint;
  v_upstream_status text;
  v_z               int;
  v_s               int;
  v_prev_score      date;
  v_latest_score    date;
  v_latest_z        date;
  v_latest_spy      date;
  v_status          text;
  v_reason          text;
begin
  insert into public.sync_log (function_name, status, source, details)
  values ('atlas_refresh_factor_scores', 'running', 'pg_cron',
          jsonb_build_object('gate', 'backfill_market_prices success today'))
  returning id into v_log_id;

  select max(date) into v_prev_score from public.factor_axis_scores;
  select max(date) into v_latest_spy from public.market_prices where symbol = 'SPY';

  select status into v_upstream_status
    from public.sync_log
   where function_name = 'backfill_market_prices'
     and started_at::date = current_date
   order by id desc
   limit 1;

  if v_upstream_status is distinct from 'success' then
    update public.sync_log
       set status = 'skipped', finished_at = clock_timestamp(),
           details = details || jsonb_build_object(
             'reason', case
                         when v_upstream_status is null
                           then 'upstream backfill_market_prices has not run today'
                         else 'upstream backfill_market_prices is ' || v_upstream_status
                       end,
             'upstream_status',    v_upstream_status,
             'latest_score_date',  v_prev_score,
             'latest_spy_date',    v_latest_spy)
     where id = v_log_id;
    return;
  end if;

  select zscores_written, scores_written
    into v_z, v_s
    from public.atlas_refresh_factor_scores();

  select max(date) into v_latest_score from public.factor_axis_scores;
  select max(date) into v_latest_z     from public.factor_pair_zscores;

  if v_s > 0 then
    v_status := 'success';
    v_reason := null;
  elsif v_z = 0 and v_latest_z < v_latest_spy then
    v_status := 'error';
    v_reason := 'nothing written and the z layer stops at '
                || coalesce(v_latest_z::text, '(none)')
                || ' behind the newest SPY session ' || coalesce(v_latest_spy::text, '(none)');
  else
    v_status := 'skipped';
    v_reason := case
                  when v_latest_score >= v_latest_spy
                    then 'already current through ' || v_latest_score
                  else 'no new fully-covered session (a score needs all 11 pairs)'
                end;
  end if;

  update public.sync_log
     set status        = v_status,
         finished_at   = clock_timestamp(),
         error_message = case when v_status = 'error' then v_reason end,
         details       = details || jsonb_build_object(
           'zscores_written',     v_z,
           'scores_written',      v_s,
           'previous_score_date', v_prev_score,
           'latest_score_date',   v_latest_score,
           'latest_z_date',       v_latest_z,
           'latest_spy_date',     v_latest_spy,
           'upstream_status',     v_upstream_status,
           'reason',              v_reason)
   where id = v_log_id;
end;
$$;

comment on function public.atlas_run_factor_scores() is
  'Scheduled wrapper for atlas_refresh_factor_scores(): gates on the day''s backfill_market_prices success, writes one sync_log row, and never RAISEs to refuse (a RAISE would roll back its own log row). Cron job: refresh_factor_scores_nightly, 23:10 UTC Mon-Sat.';

-- Maintenance RPC: no reason for a browser role to call it. Revoke from PUBLIC,
-- not just anon/authenticated -- Postgres grants EXECUTE to PUBLIC by default on
-- every new function and both roles inherit it from there, so revoking the roles
-- alone leaves the grant in place (the advisor caught exactly that). pg_cron
-- executes as the job owner, not a PostgREST role, so the schedule is unaffected.
revoke execute on function public.atlas_run_factor_scores() from public, anon, authenticated;

select cron.schedule(
  'refresh_factor_scores_nightly',
  '10 23 * * 1-6',
  $job$ select public.atlas_run_factor_scores(); $job$
);
