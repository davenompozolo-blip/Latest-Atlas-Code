-- AUTH-2d: a signed-in user reads only the books they are a member of.
--
-- AUTH-1 made atlas_active_portfolio() honour portfolio_members, so every view
-- built on vw_active_* was already per-user. The raw book tables were not:
-- positions, transactions, account_snapshots, portfolio_equity_curve, orders
-- and sync_log carried a read policy of `true`, so any signed-in user could
-- query every account's book directly. Harmless with one user; a leak the
-- moment a second one exists.
--
-- atlas_member_portfolios() is the set a caller may read: their memberships
-- when signed in, and every portfolio when auth.uid() is NULL (anon until
-- AUTH-2c lands, pg_cron, service-side jobs), so nothing headerless moves.
-- It returns a SET, used as `portfolio_id in (select ...)`, so a policy
-- evaluates it once per query rather than once per row.

create or replace function public.atlas_member_portfolios()
returns setof uuid
language sql stable security definer set search_path = public
as $fn$
  select p.id from public.portfolios p where (select auth.uid()) is null
  union all
  select m.portfolio_id from public.portfolio_members m where m.user_id = (select auth.uid())
$fn$;
revoke execute on function public.atlas_member_portfolios() from public, anon;
grant execute on function public.atlas_member_portfolios() to anon, authenticated, service_role;

alter policy positions_read_anon on public.positions
  using (portfolio_id in (select public.atlas_member_portfolios()));
alter policy transactions_read_anon on public.transactions
  using (portfolio_id in (select public.atlas_member_portfolios()));
alter policy account_snapshots_read_anon on public.account_snapshots
  using (portfolio_id in (select public.atlas_member_portfolios()));
alter policy portfolio_equity_curve_read_anon on public.portfolio_equity_curve
  using (portfolio_id in (select public.atlas_member_portfolios()));
alter policy orders_anon_read on public.orders
  using (portfolio_id in (select public.atlas_member_portfolios()));
-- A sync_log row with no portfolio is about a shared feed, not anyone's book.
alter policy sync_log_read_anon on public.sync_log
  using (portfolio_id is null or portfolio_id in (select public.atlas_member_portfolios()));

-- vw_sync_status is owned by postgres, so it reads sync_log past RLS: its
-- "latest run" could be another account's row, error message included.
create or replace view public.vw_sync_status as
 SELECT id,
    started_at,
    finished_at,
    status,
    source,
    function_name,
    positions_seen,
    positions_upserted,
    transactions_upserted,
    prices_upserted,
    duration_ms,
    error_message,
    details,
    EXTRACT(epoch FROM now() - COALESCE(finished_at, started_at))::integer AS seconds_since
   FROM sync_log
  WHERE parent_id IS NULL
    AND (portfolio_id IS NULL OR portfolio_id IN (SELECT public.atlas_member_portfolios()))
  ORDER BY started_at DESC
 LIMIT 1;

-- atlas_account_sync_health(): the caller's own accounts only, and every
-- registered account -- it selected on credential_prefix, so a Vault-held
-- account (VC-1, Atlas Tertiary) was never graded at all.
CREATE OR REPLACE FUNCTION public.atlas_account_sync_health()
 RETURNS TABLE(portfolio_id uuid, portfolio_name text, is_default boolean, positions_last_success timestamp with time zone, positions_last_status text, positions_age_minutes numeric, transactions_last_success timestamp with time zone, history_last_success timestamp with time zone, snapshot_as_of timestamp with time zone, positions_count integer, broker_equity numeric, calculated_nav numeric, nav_drift_pct numeric, status text, reasons text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with accts as (
    select p.id as portfolio_id, p.name as portfolio_name,
           coalesce(p.is_default, false) as is_default
      from public.portfolios p
      join public.broker_accounts b on b.id = p.broker_account_id
     where b.alpaca_account_number is not null
       -- AUTH-2d: a signed-in user is graded only on their own accounts.
       and p.id in (select public.atlas_member_portfolios())
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
$function$;

