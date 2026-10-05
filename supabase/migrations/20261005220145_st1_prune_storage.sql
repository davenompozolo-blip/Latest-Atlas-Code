-- ST-1: keep the database inside the Free plan's 500 MB.
--
-- On 2026-10-03 the project was restricted (every API request answered 402)
-- with the database at 2,662 MB against a 500 MB quota. Most of it was
-- history nothing reads: universe_correlations kept every nightly matrix
-- (39 snapshots, 1,485 MB, ~38 MB a night) while every reader takes the
-- latest. This job holds each history to what its readers use, nightly, so
-- the space autovacuum frees is reused rather than the files growing.
--
-- Retention, each matched to its readers:
--   universe_correlations   latest 2 snapshots (readers take max(as_of_date);
--                           the second is a fallback while tonight's writes)
--   holding_vol_trailing    30 days  (trade-sync reads the newest 8,000 rows,
--                           ~4 days; vw_holding_vol_latest reads the newest)
--   trade_universe_members  latest 5 nights per universe (the page reads one)
--   signal_scores           latest 14 dates (the ticket reads the newest)
--   opportunity_assessments latest 14 dates, never a row a trade trigger
--                           references or one a person overrode
--   account_snapshots       older than 14 days thinned to the last snapshot
--                           of each New York session per portfolio (the
--                           continuity check counts distinct days)
--   sync_log                30 days, never a parent of a kept row
--   cron.job_run_details    7 days
-- Untouched: positions, transactions, price_history, the equity curve, every
-- verdict/segment/risk history, decisions, statements, settings.

create or replace function public.atlas_prune_storage()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_log  bigint;
    v_out  jsonb := '{}'::jsonb;
    v_n    bigint;
begin
    insert into public.sync_log (function_name, source, status, started_at)
    values ('atlas_prune_storage', 'pg_cron', 'running', clock_timestamp())
    returning id into v_log;

    delete from public.universe_correlations
     where as_of_date < (select min(d) from (select distinct as_of_date d
                                               from public.universe_correlations
                                              order by 1 desc limit 2) x);
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('universe_correlations', v_n);

    delete from public.holding_vol_trailing where asof < current_date - 30;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('holding_vol_trailing', v_n);

    with cut as (
        select universe_id, min(as_of_date) keep_from
          from (select universe_id, as_of_date,
                       dense_rank() over (partition by universe_id order by as_of_date desc) r
                  from (select distinct universe_id, as_of_date from public.trade_universe_members) d) x
         where r <= 5
         group by universe_id)
    delete from public.trade_universe_members m
     using cut
     where m.universe_id = cut.universe_id and m.as_of_date < cut.keep_from;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('trade_universe_members', v_n);

    delete from public.signal_scores
     where as_of_date < (select min(d) from (select distinct as_of_date d
                                               from public.signal_scores
                                              order by 1 desc limit 14) x);
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('signal_scores', v_n);

    delete from public.opportunity_assessments a
     where a.as_of_date < (select min(d) from (select distinct as_of_date d
                                                 from public.opportunity_assessments
                                                order by 1 desc limit 14) x)
       and coalesce(a.overridden_by_user, false) = false
       and not exists (select 1 from public.trade_triggers t where t.assessment_id = a.id);
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('opportunity_assessments', v_n);

    delete from public.account_snapshots s
     using (select id
              from (select id, row_number() over (
                               partition by portfolio_id, (as_of at time zone 'America/New_York')::date
                               order by as_of desc, id desc) rn
                      from public.account_snapshots
                     where as_of < now() - interval '14 days') r
             where rn > 1) old
     where s.id = old.id;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('account_snapshots', v_n);

    delete from public.sync_log l
     where l.started_at < now() - interval '30 days'
       and l.id <> v_log
       and not exists (select 1 from public.sync_log c where c.parent_id = l.id);
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('sync_log', v_n);

    delete from cron.job_run_details where end_time < now() - interval '7 days';
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('cron_job_run_details', v_n);

    update public.sync_log
       set status = 'success', finished_at = clock_timestamp(),
           details = jsonb_build_object('rows_deleted', v_out,
                                        'database_mb', round(pg_database_size(current_database()) / 1048576.0))
     where id = v_log;
    return v_out;
exception when others then
    -- Never leave the log row open, and never let a prune failure surface as
    -- anything but an error row.
    update public.sync_log
       set status = 'error', finished_at = clock_timestamp(),
           error_message = left(sqlerrm, 500)
     where id = v_log;
    return jsonb_build_object('error', sqlerrm);
end
$$;

revoke all on function public.atlas_prune_storage() from public, anon, authenticated;

do $$
begin
    if has_function_privilege('authenticated', 'public.atlas_prune_storage()', 'execute')
       or has_function_privilege('anon', 'public.atlas_prune_storage()', 'execute') then
        raise exception 'ST-1: a browser role can execute atlas_prune_storage';
    end if;
end $$;

-- 02:30 UTC daily: after the nightly chain window (20:00-01:59) and the 01:00
-- equity curve, so it never trims a table a stage is writing.
select cron.unschedule(jobid) from cron.job where jobname = 'atlas_prune_storage';
select cron.schedule('atlas_prune_storage', '30 2 * * *', $$select public.atlas_prune_storage()$$);
