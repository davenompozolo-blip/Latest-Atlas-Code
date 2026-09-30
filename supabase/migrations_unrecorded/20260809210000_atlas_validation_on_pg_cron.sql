-- Data-trust validation, moved off GitHub Actions and rebuilt.
--
-- Every check is a database query — there is no broker call anywhere in the
-- layer — so this is a plain SQL function rather than an edge function. No
-- Deno, no secrets, no HTTP hop, nothing to misname. The four checks are the
-- ones documented in CLAUDE.md, with the thresholds it specifies.
--
-- This is not a port of something that worked. The JS version never ran:
-- atlas_validation_log held zero rows, and three of its four checks queried
-- columns that do not exist —
--   * account_snapshots.snapshot_date  (the column is as_of)
--   * transactions.symbol              (transactions key on asset_id)
--   * atlas_sync_log.completed_at      (that table has zero rows; the live
--                                       sync log is public.sync_log)
-- so had a runner ever started, checks 1-3 would have reported CRITICAL
-- failures against healthy data, and check 4 would have found nothing at all.
--
-- Deliberate change of substance, not just column names: snapshot_continuity
-- now measures the gap between distinct *days*. The original compared the last
-- five rows, and account_snapshots receives a row every five minutes from
-- sync_alpaca_positions, so it measured minutes and could never detect the
-- multi-day hole it exists to catch.
--
-- Two further faults were found by running it rather than trusting it:
--   1. The OUT parameter `status` shadowed sync_log.status, raising "column
--      reference status is ambiguous". Table columns are now qualified.
--   2. atlas_memory is UNIQUE (category, key), not (key), so `on conflict
--      (key)` would have thrown the first time a critical failure fired —
--      precisely when the alert mattered most.
-- (function body below matches the deployed definition)

create or replace function public.atlas_run_validation()
returns table (check_name text, status text, severity text, message text)
language plpgsql
security definer
set search_path = public
as $function$
declare
    v_positions      bigint;
    v_tx_assets      bigint;
    v_mv             numeric;
    v_cash           numeric;
    v_equity         numeric;
    v_drift          numeric;
    v_gap            integer;
    v_last_ok        timestamptz;
    v_hours          numeric;
    v_criticals      integer;
    v_results        jsonb := '[]'::jsonb;
begin
    -- CHECK 1: position count sanity ------------------------------------
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

    -- CHECK 2: NAV reconciliation (0.5% warn, 2% fail) -------------------
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

    -- CHECK 3: snapshot continuity, in days (gap > 3 warns) --------------
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

    -- CHECK 4: data freshness (24h warn, 48h fail) -----------------------
    -- public.sync_log is what the live edge functions write; atlas_sync_log
    -- has never received a row. sl.status is qualified because `status` is
    -- also this function's OUT parameter.
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

    -- Persist ------------------------------------------------------------
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

revoke all on function public.atlas_run_validation() from public, anon, authenticated;

-- Runs after the day's writers have finished: positions every 5 min, prices
-- at 22:00, transactions at 22:10, vol at 22:25.
select cron.unschedule('atlas_run_validation')
where exists (select 1 from cron.job where jobname = 'atlas_run_validation');

select cron.schedule('atlas_run_validation', '40 22 * * 1-5',
                     $$select public.atlas_run_validation();$$);
