-- ONB-0: a signed-in user who owns nothing sees nothing of anyone else's book.
--
-- Measured 2026-10-03 by reading every relation `authenticated` may select
-- (213) as the second auth user, who has no portfolio:
--   * anon reads nothing at all (AUTH-2c) -- not the gap.
--   * every vw_* book view returns nothing -- they read vw_active_*, which
--     filters by membership. Not the gap either.
--   * these did leak the owner's book to any signed-in user, and are fixed here:
--       portfolios               every row, metadata carrying account number,
--                                equity and cash (policy `using (true)`)
--       trade_universe_members   book_state / held_weight_pct: the DEFAULT
--                                account's holdings and weights, 2,128 rows
--                                (ONB-0b, once the Trade page stops reading them)
--       cortex_signals           generated from the default book (theme weights)
--       insight_* + materialized_insights
--                                legacy SQL-terminal tables built from the
--                                owner's book (sector P&L, 52-week list ...)
--       atlas_validation_log     default-account position counts and NAV checks
-- Also: broker_accounts' read policy was `using (true)`. The table is not
-- granted to browser roles (MP-1), so it leaked nothing; tightened anyway.
-- And the anonymous branches of the portfolio functions now answer nothing
-- rather than everything / the default. There is no signed-out demo (the
-- terminal does not render without a session) and anon holds no grants, so
-- this changes no live behaviour; it removes the fallback a future grant
-- would otherwise inherit.

-- 1. Portfolio functions. Backend callers (no JWT: pg_cron, psql, the
--    per-account refreshes) keep seeing every portfolio; a JWT whose role is
--    anon sees none.
create or replace function public.atlas_member_portfolios()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id from public.portfolios p
   where (select auth.uid()) is null and coalesce((select auth.role()), '') <> 'anon'
  union all
  select m.portfolio_id from public.portfolio_members m where m.user_id = (select auth.uid())
$function$;

create or replace function public.atlas_owner_portfolios()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id from public.portfolios p
   where (select auth.uid()) is null and coalesce((select auth.role()), '') <> 'anon'
  union all
  select m.portfolio_id from public.portfolio_members m
   where m.user_id = (select auth.uid()) and m.role = 'owner'
$function$;

create or replace function public.atlas_active_portfolio()
 returns uuid
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_hdr text;
  v_id  uuid;
  v_uid uuid := auth.uid();
begin
  -- request.headers is set by PostgREST; absent (pg_cron, psql, a service
  -- job) or unparsable means "no choice was made", never an error.
  begin
    v_hdr := nullif(current_setting('request.headers', true), '')::json ->> 'x-atlas-portfolio';
  exception when others then
    v_hdr := null;
  end;

  if v_uid is not null then
    if v_hdr ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select m.portfolio_id into v_id from public.portfolio_members m
       where m.user_id = v_uid and m.portfolio_id = v_hdr::uuid;
      if v_id is not null then
        return v_id;
      end if;
    end if;
    select m.portfolio_id into v_id
      from public.portfolio_members m
      join public.portfolios p on p.id = m.portfolio_id
     where m.user_id = v_uid
     order by p.is_default desc, m.created_at, m.portfolio_id
     limit 1;
    return v_id;
  end if;

  -- ONB-0: an anonymous JWT has no book. Only a caller with no JWT at all
  -- (pg_cron, psql, a service job) may choose by header or fall to the default.
  if coalesce(auth.role(), '') = 'anon' then
    return null;
  end if;

  if v_hdr ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id into v_id from public.portfolios p where p.id = v_hdr::uuid;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  return (select p.id from public.portfolios p where p.is_default);
end
$function$;

-- 2. portfolios: members (and administrators) only.
--    The four *_for_org_members policies belong to an organisation model that
--    no row uses (organization_id is NULL on all of them) and no code reads.
--    They call private.is_org_member, which authenticated cannot execute, so
--    once `using (true)` is gone every read would fail on them -- and the
--    browser's INSERT/UPDATE/DELETE grants were stopped only by that error.
--    Nothing in the browser writes portfolios (connect goes through the
--    service key), so the write grants go too.
drop policy if exists portfolios_select_for_org_members on public.portfolios;
drop policy if exists portfolios_write_for_org_members  on public.portfolios;
drop policy if exists portfolios_update_for_org_members on public.portfolios;
drop policy if exists portfolios_delete_for_org_members on public.portfolios;
revoke insert, update, delete on public.portfolios from authenticated;
drop policy if exists portfolios_read_anon on public.portfolios;
drop policy if exists onb0_portfolios_read_member on public.portfolios;
create policy onb0_portfolios_read_member on public.portfolios
    for select to authenticated
    using (id in (select public.atlas_member_portfolios()) or (select public.atlas_is_admin()));

-- 3. broker_accounts: the owner (and administrators) only. Not granted to
--    browser roles today; this is the policy a future grant would meet.
drop policy if exists broker_accounts_read_anon on public.broker_accounts;
drop policy if exists onb0_broker_accounts_read_own on public.broker_accounts;
create policy onb0_broker_accounts_read_own on public.broker_accounts
    for select to authenticated
    using (user_id = (select auth.uid()) or (select public.atlas_is_admin()));

-- 4. Tables built from the default book: administrators only.
drop policy if exists au1_read on public.cortex_signals;
drop policy if exists onb0_admin_read on public.cortex_signals;
create policy onb0_admin_read on public.cortex_signals
    for select to authenticated using ((select public.atlas_is_admin()));

drop policy if exists anon_read_access on public.atlas_validation_log;
drop policy if exists onb0_admin_read on public.atlas_validation_log;
create policy onb0_admin_read on public.atlas_validation_log
    for select to authenticated using ((select public.atlas_is_admin()));

do $$
declare
    t text;
begin
    for t in
        select c.relname from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
           and (c.relname like 'insight\_%' or c.relname = 'materialized_insights')
    loop
        execute format('drop policy if exists %I on public.%I', t || '_read', t);
        execute format('drop policy if exists onb0_admin_read on public.%I', t);
        execute format('alter table public.%I enable row level security', t);
        execute format('create policy onb0_admin_read on public.%I for select to authenticated '
                       'using ((select public.atlas_is_admin()))', t);
    end loop;
end $$;

-- 5. Assertions.
do $$
begin
    if exists (select 1 from pg_policy p
                where p.polrelid in ('public.portfolios'::regclass, 'public.broker_accounts'::regclass,
                                     'public.cortex_signals'::regclass, 'public.atlas_validation_log'::regclass)
                  and p.polcmd in ('r', '*')
                  and pg_get_expr(p.polqual, p.polrelid) = 'true') then
        raise exception 'ONB-0: a using (true) read policy survives';
    end if;
    if has_table_privilege('authenticated', 'public.portfolios', 'insert')
       or has_table_privilege('authenticated', 'public.portfolios', 'update')
       or has_table_privilege('authenticated', 'public.portfolios', 'delete') then
        raise exception 'ONB-0: the browser can still write portfolios';
    end if;
    if exists (select 1 from pg_class c join pg_policy p on p.polrelid = c.oid
                where c.relnamespace = 'public'::regnamespace
                  and (c.relname like 'insight\_%' or c.relname = 'materialized_insights')
                  and pg_get_expr(p.polqual, p.polrelid) = 'true') then
        raise exception 'ONB-0: an insight table is still readable by everyone';
    end if;
end $$;
