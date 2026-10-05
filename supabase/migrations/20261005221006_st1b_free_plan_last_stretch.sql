-- ST-1b: the last stretch under the Free plan's 500 MB, approved by the owner
-- on 2026-10-05 with backups. Every deleted row was exported first to the
-- branch backup/storage-2026-10-05 (backups/*.jsonl.gz, with restore SQL).
--
--   company_reported_lines   all 145,552 rows (88 MB). The Financials tab's
--                            bank/insurer framework reads "not loaded" until
--                            reloaded (mode=reported, or from the backup).
--   regime_theme_states      the 18,538 'v0-uncalibrated' rows (superseded
--                            research backfill; nothing reads them). The
--                            table is append-only by trigger, disabled for
--                            this one delete only.
--   fund_prices_raw          all but the latest row per (source, fund_code);
--                            both fund pages read one snapshot per fund.
--   price_history            1d bars older than 450 days for assets never held
--                            in any portfolio (trade-sync reads 420 days).
--   idx_price_history_asset_id  redundant: three indexes lead with asset_id.
--
-- atlas_prune_storage now keeps one correlation snapshot (the writer replaces
-- a date in one transaction, so the latest always exists) and one fund row per
-- fund, nightly.

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
                                              order by 1 desc limit 1) x);
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('universe_correlations', v_n);

    -- The fund pages read one snapshot per fund (TER/TIC), never a series.
    delete from public.fund_prices_raw f
     using (select id from (select id, row_number() over (partition by source, fund_code
                                                        order by price_date desc, id desc) rn
                              from public.fund_prices_raw) r where rn > 1) old
     where f.id = old.id;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('fund_prices_raw', v_n);

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



delete from public.company_reported_lines;

alter table public.regime_theme_states disable trigger regime_theme_states_append_only;
delete from public.regime_theme_states where logic_version = 'v0-uncalibrated';
alter table public.regime_theme_states enable trigger regime_theme_states_append_only;

delete from public.price_history ph
 where ph.price_date < current_date - 450
   and not exists (select 1 from public.positions p where p.asset_id = ph.asset_id);

drop index if exists public.idx_price_history_asset_id;

do $$
begin
    if exists (select 1 from pg_trigger where tgname = 'regime_theme_states_append_only' and tgenabled = 'D') then
        raise exception 'ST-1b: the append-only trigger was left disabled';
    end if;
end $$;
