-- ============================================================
-- Validation: cover the feeds outside the Alpaca core
-- ------------------------------------------------------------
-- atlas_run_validation() has always checked five things, and all five are
-- about the Alpaca book: positions, NAV, snapshot continuity, sync freshness
-- and price coverage. That core has been green every night.
--
-- Everything else has been unwatched, and on 2026-08-16 an audit found four
-- feeds dark while validation reported all-clear:
--
--   vol_dispersion_daily            0 rows, ever  (AV premium endpoint refused)
--   theme_leadership_weekly         0 rows, ever
--   signal_scores                   frozen at 2026-08-11, one single date
--   sync_funddata_prices            8 consecutive runs stuck in 'running'
--
-- None of these are Alpaca, so none of them could move the light. This adds
-- two checks that watch the rest of the platform.
--
-- Deliberately capped at 'warning'. A 'critical' severity increments
-- consecutive_failures and writes an atlas_memory bug row every night, and
-- two of the four gaps above are subscription problems that no amount of
-- retrying fixes. A red light that can never go green is a light you learn to
-- ignore, which is how these feeds went dark unnoticed in the first place.
-- ============================================================

-- Staleness is measured against the last day the market actually traded, not
-- against now(). A weekday feed is not late on a Sunday.
create or replace function public.atlas_last_traded_day()
returns date
language sql
stable
security definer
set search_path to 'public'
as $$
    select max(ph.price_date)
    from price_history ph
    join assets a on a.id = ph.asset_id
    where a.symbol = 'SPY';
$$;

comment on function public.atlas_last_traded_day() is
'Most recent session with a SPY bar. SPY comes from an independent benchmark
writer and is absent on real market holidays, so its presence marks a day the
market traded — the same convention price_coverage already uses.';

-- One row per feed the platform depends on but does not own.
create or replace function public.atlas_feed_status()
returns table (feed text, latest date, rows bigint, days_late integer, verdict text)
language sql
stable
security definer
set search_path to 'public'
as $$
    with lt as (select atlas_last_traded_day() as d),
    feeds as (
        select 'signal_scores'::text as feed,
               max(s.as_of_date)::date as latest, count(*)::bigint as rows, 2 as grace
          from signal_scores s
        union all
        select 'vol_dispersion_daily', max(v.date)::date, count(*)::bigint, 4
          from vol_dispersion_daily v
        union all
        select 'options_positioning_snapshots', max(o.snapshot_date)::date, count(*)::bigint, 4
          from options_positioning_snapshots o
        union all
        select 'holding_vol_trailing', max(h.asof)::date, count(*)::bigint, 4
          from holding_vol_trailing h
        union all
        select 'fund_prices_raw', max(f.price_date)::date, count(*)::bigint, 4
          from fund_prices_raw f
        union all
        select 'equity_screener_universe', max(e.cached_at)::date, count(*)::bigint, 8
          from equity_screener_universe e
        union all
        select 'theme_leadership_weekly', max(t.snapshot_date)::date, count(*)::bigint, 8
          from theme_leadership_weekly t
    )
    select f.feed,
           f.latest,
           f.rows,
           case when f.latest is null then null else (lt.d - f.latest) end as days_late,
           case when f.rows = 0            then 'empty'
                when f.latest is null      then 'empty'
                when lt.d is null          then 'unknown'
                when lt.d - f.latest > f.grace then 'stale'
                else 'ok' end as verdict
      from feeds f cross join lt
     order by 1;
$$;

comment on function public.atlas_feed_status() is
'Freshness of every feed outside the Alpaca core. "empty" means the pipeline
has never written a row; "stale" means it wrote once and stopped. The two are
different failures and the message keeps them apart.';

create or replace function public.atlas_run_validation()
returns table(check_name text, status text, severity text, message text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_positions        bigint;
    v_tx_assets        bigint;
    v_mv               numeric;
    v_cash             numeric;
    v_equity           numeric;
    v_drift            numeric;
    v_gap              integer;
    v_last_ok          timestamptz;
    v_hours            numeric;
    v_universe         bigint;
    v_price_gap_days   integer;
    v_price_gap_last   date;
    v_criticals        integer;
    v_empty            text[];
    v_stale            text[];
    v_stuck            integer;
    v_stuck_oldest     timestamptz;
    v_stuck_jobs       text;
    v_results          jsonb := '[]'::jsonb;
begin
    select count(*) into v_positions
    from positions p where p.as_of_date = current_date;

    select count(distinct t.asset_id) into v_tx_assets from transactions t;

    if v_positions = 0 and v_tx_assets > 0 then
        v_results := v_results || jsonb_build_object(
            'check_name', 'position_count', 'status', 'warning', 'severity', 'warning',
            'message', format('No positions for today but %s assets have transaction history. Possible sync issue.', v_tx_assets),
            'details', jsonb_build_object('positions', v_positions, 'transaction_assets', v_tx_assets));
    else
        v_results := v_results || jsonb_build_object(
            'check_name', 'position_count', 'status', 'passed', 'severity', 'info',
            'message', format('%s positions synced for today.', v_positions),
            'details', jsonb_build_object('positions', v_positions, 'transaction_assets', v_tx_assets));
    end if;

    select coalesce(sum(p.market_value), 0) into v_mv
    from positions p where p.as_of_date = current_date;

    select a.cash, a.equity into v_cash, v_equity
    from account_snapshots a order by a.as_of desc limit 1;

    if v_equity is null or v_equity <= 0 then
        v_results := v_results || jsonb_build_object(
            'check_name', 'nav_reconciliation', 'status', 'warning', 'severity', 'warning',
            'message', 'No broker equity on file to reconcile against.',
            'details', jsonb_build_object('calculated', v_mv + coalesce(v_cash, 0)));
    else
        v_drift := abs(((v_mv + coalesce(v_cash, 0)) - v_equity) / v_equity) * 100;
        v_results := v_results || jsonb_build_object(
            'check_name', 'nav_reconciliation',
            'status',   case when v_drift > 2 then 'failed' when v_drift > 0.5 then 'warning' else 'passed' end,
            'severity', case when v_drift > 2 then 'critical' when v_drift > 0.5 then 'warning' else 'info' end,
            'message',  format('NAV drift %s%%. Calculated %s, broker %s.',
                               round(v_drift, 4), round(v_mv + coalesce(v_cash, 0), 2), round(v_equity, 2)),
            'details',  jsonb_build_object('calculated', round(v_mv + coalesce(v_cash, 0), 2),
                                           'broker', round(v_equity, 2), 'drift_pct', round(v_drift, 4)));
    end if;

    select max(g.gap) into v_gap from (
        select (d.d - lag(d.d) over (order by d.d)) as gap
        from (select distinct a.as_of::date as d from account_snapshots a
              order by 1 desc limit 30) d
    ) g;

    if v_gap is null then
        v_results := v_results || jsonb_build_object(
            'check_name', 'snapshot_continuity', 'status', 'warning', 'severity', 'warning',
            'message', 'Not enough snapshot days to assess continuity.',
            'details', '{}'::jsonb);
    else
        v_results := v_results || jsonb_build_object(
            'check_name', 'snapshot_continuity',
            'status',   case when v_gap > 3 then 'warning' else 'passed' end,
            'severity', case when v_gap > 3 then 'warning' else 'info' end,
            'message',  format('Largest snapshot gap over the last 30 recorded days: %s day(s).', v_gap),
            'details',  jsonb_build_object('max_gap_days', v_gap));
    end if;

    select max(sl.finished_at) into v_last_ok from sync_log sl where sl.status = 'success';

    if v_last_ok is null then
        v_results := v_results || jsonb_build_object(
            'check_name', 'data_freshness', 'status', 'failed', 'severity', 'critical',
            'message', 'No successful sync has ever been logged.',
            'details', '{}'::jsonb);
    else
        v_hours := extract(epoch from (now() - v_last_ok)) / 3600;
        v_results := v_results || jsonb_build_object(
            'check_name', 'data_freshness',
            'status',   case when v_hours > 48 then 'failed' when v_hours > 24 then 'warning' else 'passed' end,
            'severity', case when v_hours > 48 then 'critical' when v_hours > 24 then 'warning' else 'info' end,
            'message',  format('Last successful sync %s hours ago.', round(v_hours, 1)),
            'details',  jsonb_build_object('hours_ago', round(v_hours, 1), 'last_sync', v_last_ok));
    end if;

    select count(distinct p.asset_id) into v_universe
    from positions p where p.as_of_date >= current_date - 30;

    select count(*), max(spy.d)
      into v_price_gap_days, v_price_gap_last
    from (
        select ph.price_date as d
        from price_history ph
        join assets a on a.id = ph.asset_id
        where a.symbol = 'SPY'
          and ph.price_date >= current_date - 30
    ) spy
    where (select count(*) from price_history p2 where p2.price_date = spy.d)
          < greatest(5, v_universe / 2);

    v_results := v_results || jsonb_build_object(
        'check_name', 'price_coverage',
        'status',   case when v_price_gap_days > 2 then 'failed'
                         when v_price_gap_days > 0 then 'warning' else 'passed' end,
        'severity', case when v_price_gap_days > 2 then 'critical'
                         when v_price_gap_days > 0 then 'warning' else 'info' end,
        'message',  case when v_price_gap_days = 0
                         then format('Every traded day in the last 30 has a price book (%s holdings tracked).', v_universe)
                         else format('%s traded day(s) in the last 30 have no price book. Most recent: %s.',
                                     v_price_gap_days, v_price_gap_last) end,
        'details',  jsonb_build_object('gap_days', v_price_gap_days,
                                       'most_recent_gap', v_price_gap_last,
                                       'universe', v_universe));

    -- ── feed_coverage: everything that is not Alpaca ──────────────────────
    -- Empty and stale are reported separately because they need different
    -- fixes: empty is a pipeline that has never worked (usually a credential
    -- or a plan), stale is one that worked and stopped (usually a scheduler).
    select array_agg(f.feed order by f.feed) filter (where f.verdict = 'empty'),
           array_agg(f.feed || ' (' || f.days_late || 'd)' order by f.feed) filter (where f.verdict = 'stale')
      into v_empty, v_stale
    from atlas_feed_status() f;

    v_results := v_results || jsonb_build_object(
        'check_name', 'feed_coverage',
        'status',   case when v_empty is not null or v_stale is not null then 'warning' else 'passed' end,
        'severity', case when v_empty is not null or v_stale is not null then 'warning' else 'info' end,
        'message',  case
            when v_empty is null and v_stale is null
                then 'Every non-Alpaca feed is current.'
            else trim(both ' ' from
                 coalesce(format('Never written: %s. ', array_to_string(v_empty, ', ')), '')
              || coalesce(format('Stopped writing: %s.', array_to_string(v_stale, ', ')), ''))
        end,
        'details',  jsonb_build_object(
            'empty', coalesce(to_jsonb(v_empty), '[]'::jsonb),
            'stale', coalesce(to_jsonb(v_stale), '[]'::jsonb),
            'last_traded_day', atlas_last_traded_day()));

    -- ── stuck_syncs: rows that opened and never closed ────────────────────
    -- sync_funddata_prices patches its terminal status through PostgREST and
    -- swallows the failure, so a working job can leave a 'running' row behind
    -- every single night. Nothing surfaced that until now.
    select count(*), min(sl.started_at),
           string_agg(distinct coalesce(sl.function_name, sl.source), ', ')
      into v_stuck, v_stuck_oldest, v_stuck_jobs
    from sync_log sl
    where sl.status = 'running'
      and sl.started_at < now() - interval '6 hours';

    v_results := v_results || jsonb_build_object(
        'check_name', 'stuck_syncs',
        'status',   case when v_stuck > 0 then 'warning' else 'passed' end,
        'severity', case when v_stuck > 0 then 'warning' else 'info' end,
        'message',  case when v_stuck = 0
                         then 'No sync has been left open.'
                         else format('%s sync run(s) opened and never closed (%s). Oldest %s.',
                                     v_stuck, v_stuck_jobs, v_stuck_oldest) end,
        'details',  jsonb_build_object('stuck', v_stuck, 'jobs', v_stuck_jobs, 'oldest', v_stuck_oldest));

    insert into atlas_validation_log (check_name, status, severity, message, details)
    select r->>'check_name', r->>'status', r->>'severity', r->>'message', coalesce(r->'details', '{}'::jsonb)
    from jsonb_array_elements(v_results) r;

    select count(*) into v_criticals
    from jsonb_array_elements(v_results) r
    where r->>'severity' = 'critical' and r->>'status' <> 'passed';

    insert into atlas_sync_status (id, last_sync_at, last_sync_status, last_sync_type,
                                   last_validation_passed, consecutive_failures, updated_at)
    values (1, now(),
            case when v_criticals > 0 then 'error' else 'success' end,
            'validation', v_criticals = 0,
            case when v_criticals > 0 then 1 else 0 end, now())
    on conflict (id) do update set
        last_sync_at           = excluded.last_sync_at,
        last_sync_status       = excluded.last_sync_status,
        last_sync_type         = excluded.last_sync_type,
        last_validation_passed = excluded.last_validation_passed,
        consecutive_failures   = case when v_criticals > 0
                                      then atlas_sync_status.consecutive_failures + 1
                                      else 0 end,
        updated_at             = now();

    if v_criticals > 0 then
        insert into atlas_memory (category, key, content, tags, priority, source)
        values ('bug', 'validation-critical',
                format('%s critical validation failure(s) at %s. See atlas_validation_log.', v_criticals, now()),
                array['sync','validation','critical'], 2, 'atlas_run_validation')
        on conflict (category, key) do update set
            content = excluded.content, priority = excluded.priority;
    end if;

    return query
    select r->>'check_name', r->>'status', r->>'severity', r->>'message'
    from jsonb_array_elements(v_results) r;
end;
$function$;

grant execute on function public.atlas_last_traded_day() to service_role;
grant execute on function public.atlas_feed_status()      to service_role, authenticated;
