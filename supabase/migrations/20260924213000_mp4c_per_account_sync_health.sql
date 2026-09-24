-- MP-4c: sync health is graded PER ACCOUNT.
--
-- Since MP-1 each Alpaca account syncs on its own credentials and writes its
-- own sync_log row (sync_log.portfolio_id). Nothing read them apart:
--
--   * data_freshness()'s `sync_alpaca_positions` stream took the max success
--     over EVERY row of that function, so a healthy Primary run masked a
--     Secondary that had stopped syncing -- the "healthy account masks a failing
--     one" case MP-1 flagged for this unit.
--   * atlas_run_validation() runs from pg_cron with no request header, so its
--     position_count / nav_reconciliation / snapshot_continuity checks read
--     vw_active_* and graded the DEFAULT account only. Atlas Secondary was never
--     validated at all.
--
-- 1. atlas_account_sync_health(): one row per registered Alpaca account --
--    last successful positions / fills / history sync, the newest snapshot,
--    and NAV reconciled against broker equity on that account's OWN current
--    book (positions at the snapshot watermark, the vw_positions_current rule).
--    It never returns credential_prefix or alpaca_account_number.
-- 2. atlas_run_validation() gains `account_sync_coverage`, which grades every
--    account on that function. Thresholds mirror the existing ones: positions
--    sync warns past 60 minutes (it runs every 5) and fails past 24h; NAV drift
--    warns past 0.5% and fails past 2% (nav_reconciliation's bands). A missing
--    snapshot or a last run that did not succeed warns. The pipeline for every
--    account can succeed, so `failed` is `critical` -- the feed_coverage rule
--    about never-green criticals does not apply here.
-- 3. data_freshness()'s positions-sync stream follows the ACTIVE account, like
--    the `positions` and `account_snapshots` streams beside it already do.

-- ── 1. Per-account health ───────────────────────────────────────────────────

create or replace function public.atlas_account_sync_health()
returns table (
  portfolio_id              uuid,
  portfolio_name            text,
  is_default                boolean,
  positions_last_success    timestamptz,
  positions_last_status     text,
  positions_age_minutes     numeric,
  transactions_last_success timestamptz,
  history_last_success      timestamptz,
  snapshot_as_of            timestamptz,
  positions_count           integer,
  broker_equity             numeric,
  calculated_nav            numeric,
  nav_drift_pct             numeric,
  status                    text,
  reasons                   text[]
)
language sql
stable
security definer
set search_path = public
as $fn$
  with accts as (
    select p.id as portfolio_id, p.name as portfolio_name,
           coalesce(p.is_default, false) as is_default
      from public.portfolios p
      join public.broker_accounts b on b.id = p.broker_account_id
     where b.credential_prefix is not null
  ),
  logs as (
    select a.portfolio_id,
      (select max(s.started_at) from public.sync_log s
        where s.portfolio_id = a.portfolio_id
          and s.function_name = 'sync_alpaca_positions' and s.status = 'success') as pos_ok,
      (select s.status from public.sync_log s
        where s.portfolio_id = a.portfolio_id
          and s.function_name = 'sync_alpaca_positions'
        order by s.started_at desc limit 1) as pos_last,
      (select max(s.started_at) from public.sync_log s
        where s.portfolio_id = a.portfolio_id
          and s.function_name = 'sync_alpaca_transactions' and s.status = 'success') as tx_ok,
      -- 'partial' is the history sync's normal outcome when it flags a stale
      -- level (C1), so it counts as a completed run.
      (select max(s.started_at) from public.sync_log s
        where s.portfolio_id = a.portfolio_id
          and s.function_name = 'sync_portfolio_history'
          and s.status in ('success', 'partial')) as hist_ok
    from accts a
  ),
  snap as (
    select a.portfolio_id, s.as_of, s.equity, s.cash
      from accts a
      left join lateral (
        select x.as_of, x.equity, x.cash
          from public.account_snapshots x
         where x.portfolio_id = a.portfolio_id
         order by x.as_of desc limit 1) s on true
  ),
  -- The account's current book: rows written by the sync that wrote the
  -- newest snapshot (same transaction, so updated_at >= as_of is exact).
  book as (
    select s.portfolio_id, sum(p.market_value) as mv, count(*)::int as n
      from snap s
      join public.positions p
        on p.portfolio_id = s.portfolio_id
       and p.as_of_date = (s.as_of at time zone 'UTC')::date
       and p.updated_at >= s.as_of
     group by s.portfolio_id
  ),
  graded as (
    select a.portfolio_id, a.portfolio_name, a.is_default,
           l.pos_ok, l.pos_last,
           round(extract(epoch from (now() - l.pos_ok)) / 60.0, 1) as age_min,
           l.tx_ok, l.hist_ok,
           s.as_of, coalesce(bk.n, 0) as n, s.equity,
           case when s.as_of is not null then coalesce(bk.mv, 0) + coalesce(s.cash, 0) end as nav,
           case when s.equity > 0
                then round(abs((coalesce(bk.mv, 0) + coalesce(s.cash, 0) - s.equity) / s.equity) * 100, 4)
           end as drift
      from accts a
      join logs l on l.portfolio_id = a.portfolio_id
      join snap s on s.portfolio_id = a.portfolio_id
      left join book bk on bk.portfolio_id = a.portfolio_id
  )
  select g.portfolio_id, g.portfolio_name, g.is_default,
         g.pos_ok, g.pos_last, g.age_min, g.tx_ok, g.hist_ok,
         g.as_of, g.n, g.equity, g.nav, g.drift,
         case
           when g.pos_ok is null or g.age_min > 1440 or g.drift > 2 then 'failed'
           when g.age_min > 60 or g.pos_last is distinct from 'success'
                or g.as_of is null or g.drift is null or g.drift > 0.5 then 'warning'
           else 'passed'
         end,
         array_remove(array[
           case when g.pos_ok is null then 'positions sync has never succeeded'
                when g.age_min > 60 then format('positions last synced %s min ago', g.age_min) end,
           case when g.pos_last is distinct from 'success'
                then format('last positions run: %s', coalesce(g.pos_last, 'none')) end,
           case when g.as_of is null then 'no account snapshot on file' end,
           case when g.as_of is not null and g.drift is null then 'no broker equity to reconcile against' end,
           case when g.drift > 0.5 then format('NAV drift %s%%', g.drift) end
         ], null)
    from graded g
   order by g.is_default desc, g.portfolio_name;
$fn$;

comment on function public.atlas_account_sync_health() is
  'One row per registered Alpaca account: sync recency and NAV reconciliation '
  'on that account''s own book. Graded into account_sync_coverage by '
  'atlas_run_validation(). Never returns credentials or account numbers. MP-4c.';

-- The UI's health page reads it; switching accounts already lets any browser
-- read either book, so this exposes nothing new. The PUBLIC grant has to go
-- explicitly (revoking anon/authenticated by name leaves it in place).
revoke execute on function public.atlas_account_sync_health() from public, anon, authenticated;
grant execute on function public.atlas_account_sync_health() to anon, authenticated, service_role;

-- ── 2. The validation check ─────────────────────────────────────────────────

do $$
declare
  v_def    text;
  v_anchor constant text := E'    insert into atlas_validation_log (check_name, status, severity, message, details)\n';
  v_block  constant text := $blk$    -- account_sync_coverage (MP-4c): every registered Alpaca account graded on
    -- its OWN sync_log rows and its OWN book. The checks above read vw_active_*
    -- and so, run from pg_cron with no request header, only ever see the
    -- default account.
    declare
        v_acct_n    int;
        v_acct_fail text;
        v_acct_warn text;
        v_acct_det  jsonb;
    begin
        select count(*),
               string_agg(h.portfolio_name || ' (' || array_to_string(h.reasons, '; ') || ')', ', '
                          order by h.portfolio_name) filter (where h.status = 'failed'),
               string_agg(h.portfolio_name || ' (' || array_to_string(h.reasons, '; ') || ')', ', '
                          order by h.portfolio_name) filter (where h.status = 'warning'),
               jsonb_agg(jsonb_build_object(
                   'portfolio', h.portfolio_name, 'status', h.status, 'reasons', to_jsonb(h.reasons),
                   'positions_age_minutes', h.positions_age_minutes, 'positions', h.positions_count,
                   'nav_drift_pct', h.nav_drift_pct) order by h.portfolio_name)
          into v_acct_n, v_acct_fail, v_acct_warn, v_acct_det
          from atlas_account_sync_health() h;

        v_results := v_results || jsonb_build_object(
            'check_name', 'account_sync_coverage',
            'status',   case when v_acct_fail is not null then 'failed'
                             when v_acct_n = 0 or v_acct_warn is not null then 'warning' else 'passed' end,
            'severity', case when v_acct_fail is not null then 'critical'
                             when v_acct_n = 0 or v_acct_warn is not null then 'warning' else 'info' end,
            'message',  case
                when v_acct_n = 0 then 'No broker account is registered for syncing.'
                when v_acct_fail is null and v_acct_warn is null
                    then format('All %s broker accounts synced and reconciled.', v_acct_n)
                else trim(both ' ' from
                       coalesce(format('Failing: %s. ', v_acct_fail), '')
                    || coalesce(format('Degraded: %s.', v_acct_warn), '')) end,
            'details',  jsonb_build_object('accounts', coalesce(v_acct_det, '[]'::jsonb)));
    end;

$blk$;
begin
  select pg_get_functiondef('public.atlas_run_validation()'::regprocedure) into v_def;
  if v_def ~ 'account_sync_coverage' then
    raise exception 'MP-4c: atlas_run_validation already carries account_sync_coverage -- refusing to re-patch';
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'MP-4c: validation insert anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_block || v_anchor);
end $$;

-- ── 3. The freshness stream follows the active account ──────────────────────

do $$
declare
  v_def text;
  v_old constant text := E'FROM public.sync_log WHERE function_name = ''sync_alpaca_positions''\n';
  v_new constant text := E'FROM public.sync_log WHERE function_name = ''sync_alpaca_positions''\n'
                      || E'      AND portfolio_id = (SELECT public.atlas_active_portfolio())\n';
begin
  select pg_get_functiondef('public.data_freshness()'::regprocedure) into v_def;
  if v_def ~ 'atlas_active_portfolio\(\)\)\s*\n\s*UNION ALL\s*\n\s*SELECT ''sync_alpaca_prices''' then
    raise exception 'MP-4c: data_freshness already scoped -- refusing to re-patch';
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'MP-4c: data_freshness positions-sync anchor not found exactly once';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- ── Assertions ──────────────────────────────────────────────────────────────

do $$
begin
  if has_function_privilege('anon', 'public.atlas_run_validation()', 'execute') then
    raise exception 'MP-4c: atlas_run_validation is executable by anon';
  end if;
  if not exists (select 1 from public.atlas_account_sync_health()) then
    raise exception 'MP-4c: atlas_account_sync_health returned no accounts';
  end if;
end $$;
