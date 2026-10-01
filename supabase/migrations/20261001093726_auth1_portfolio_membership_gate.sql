-- AUTH-1: who may look at which portfolio, for a signed-in user.
--
-- This is the GATE, not the lockdown. A signed-in request (PostgREST role
-- `authenticated`, auth.uid() set) now sees only the portfolios it is a member
-- of, and atlas_active_portfolio() refuses to resolve a portfolio the caller
-- does not belong to. An ANONYMOUS request is unchanged -- removing the anon
-- read path is AUTH-2, its own change, because every page reads through it.
--
-- Headerless jobs (pg_cron, service_role, the per-account refreshes that set
-- request.headers but carry no JWT) have auth.uid() = NULL and take exactly
-- the old path, so nothing scheduled moves.

-- 1. Membership. One row per (portfolio, user). A user with no row sees no
--    book, which is the right answer for an account nobody has granted.
create table if not exists public.portfolio_members (
    portfolio_id uuid not null references public.portfolios(id) on delete cascade,
    user_id      uuid not null references auth.users(id) on delete cascade,
    role         text not null default 'owner',
    created_at   timestamptz not null default now(),
    primary key (portfolio_id, user_id),
    constraint portfolio_members_role_ck check (role in ('owner', 'viewer'))
);
create index if not exists portfolio_members_user_idx on public.portfolio_members (user_id);

alter table public.portfolio_members enable row level security;
revoke all on public.portfolio_members from public, anon, authenticated;
grant select on public.portfolio_members to authenticated;
drop policy if exists portfolio_members_read_own on public.portfolio_members;
create policy portfolio_members_read_own on public.portfolio_members
    for select to authenticated using (user_id = (select auth.uid()));
-- No write policy: membership is granted by atlas_grant_portfolio_access only.

-- 2. The one place membership is written. service_role and postgres only.
create or replace function public.atlas_grant_portfolio_access(
    p_user_id uuid, p_portfolio_id uuid, p_role text default 'owner'
) returns void
language plpgsql security definer set search_path = public
as $fn$
begin
    if not exists (select 1 from auth.users where id = p_user_id) then
        raise exception 'atlas_grant_portfolio_access: no auth user %', p_user_id;
    end if;
    if not exists (select 1 from public.portfolios where id = p_portfolio_id) then
        raise exception 'atlas_grant_portfolio_access: no portfolio %', p_portfolio_id;
    end if;
    insert into public.portfolio_members (portfolio_id, user_id, role)
    values (p_portfolio_id, p_user_id, p_role)
    on conflict (portfolio_id, user_id) do update set role = excluded.role;
end
$fn$;
revoke execute on function public.atlas_grant_portfolio_access(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.atlas_grant_portfolio_access(uuid, uuid, text) to service_role;

-- 3. The resolver. Anonymous and headerless calls: unchanged. Signed-in calls:
--    the requested portfolio only if the caller is a member; otherwise the
--    default portfolio if a member; otherwise the caller's earliest grant;
--    otherwise NULL, which every scoped view reads as an empty book. It never
--    falls back to a portfolio the caller cannot see.
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

  if v_hdr ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id into v_id from public.portfolios p where p.id = v_hdr::uuid;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  return (select p.id from public.portfolios p where p.is_default);
end
$function$;

-- 4. The switcher lists only the caller's portfolios when signed in. Anonymous
--    and service reads see the full list, as before (sync-valuations reads it
--    with the service key to enumerate every account).
create or replace view public.vw_portfolios as
 SELECT p.id,
    p.name,
    p.is_default,
    p.id = (( SELECT atlas_active_portfolio() AS atlas_active_portfolio)) AS is_active,
    "right"(b.alpaca_account_number, 4) AS account_last4,
    b.is_paper,
    s.equity AS latest_equity,
    s.as_of AS equity_as_of
   FROM portfolios p
     LEFT JOIN broker_accounts b ON b.id = p.broker_account_id
     LEFT JOIN LATERAL ( SELECT a.equity,
            a.as_of
           FROM account_snapshots a
          WHERE a.portfolio_id = p.id
          ORDER BY a.as_of DESC
         LIMIT 1) s ON true
  WHERE (( SELECT auth.uid() AS uid) IS NULL)
     OR (EXISTS ( SELECT 1
           FROM portfolio_members m
          WHERE m.portfolio_id = p.id AND m.user_id = ( SELECT auth.uid() AS uid)));

-- 5. Parity. Signing in switches the request role from anon to authenticated,
--    and five tables granted their reads and writes to anon alone -- the
--    Scrapbook pages and the Command Centre chat would go blank the moment a
--    session existed. atlas_memory's writes likewise. Same predicates, one more
--    role; AUTH-2 replaces all of these with user-scoped rules.
alter policy anon_select_chats  on public.cc_chats to anon, authenticated;
alter policy anon_insert_chats  on public.cc_chats to anon, authenticated;
alter policy anon_update_chats  on public.cc_chats to anon, authenticated;
alter policy anon_delete_chats  on public.cc_chats to anon, authenticated;
alter policy anon_all_scrapbook_companies on public.scrapbook_companies    to anon, authenticated;
alter policy anon_all_scrapbook_narratives on public.scrapbook_narratives  to anon, authenticated;
alter policy anon_all_sector_notes         on public.scrapbook_sector_notes to anon, authenticated;
alter policy anon_all_scrapbook_snapshots  on public.scrapbook_snapshots   to anon, authenticated;
alter policy anon_insert_memory on public.atlas_memory to anon, authenticated;
alter policy anon_update_memory on public.atlas_memory to anon, authenticated;
alter policy anon_delete_memory on public.atlas_memory to anon, authenticated;

-- 6. Assertions.
do $$
begin
  if has_function_privilege('anon', 'public.atlas_grant_portfolio_access(uuid, uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.atlas_grant_portfolio_access(uuid, uuid, text)', 'execute') then
    raise exception 'AUTH-1: atlas_grant_portfolio_access is executable by a browser role';
  end if;
  if has_table_privilege('anon', 'public.portfolio_members', 'select')
     or has_table_privilege('authenticated', 'public.portfolio_members', 'insert')
     or has_table_privilege('authenticated', 'public.portfolio_members', 'update')
     or has_table_privilege('authenticated', 'public.portfolio_members', 'delete') then
    raise exception 'AUTH-1: portfolio_members grants are wider than read-own';
  end if;
end $$;
