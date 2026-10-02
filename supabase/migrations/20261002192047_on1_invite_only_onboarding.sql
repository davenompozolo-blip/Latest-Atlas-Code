-- ON-1: invite-only onboarding. An administrator invites a person; the person
-- sets a password, then connects their own broker account, which becomes a
-- portfolio only they (and administrators they grant) can see.
--
--   atlas_admins                     who may invite. Seeded with the owner of
--                                    the default portfolio; written by
--                                    service_role / postgres only.
--   atlas_is_admin()                 is the CALLER an administrator.
--   atlas_my_access()                is_admin, how many portfolios the caller
--                                    owns, and the most they may connect.
--   atlas_connect_broker_account()   register + attribute + grant ownership in
--                                    ONE transaction (service_role only): a
--                                    registered account with no owner is an
--                                    account nobody can see and nobody can
--                                    re-register.
--
-- The account number still comes from the broker's own /v2/account answer,
-- verified by the API route before this is called (VC-1).

-- broker_accounts.user_id referenced the legacy public.users table, which has
-- never held a row; every attribution would fail its foreign key. It names a
-- Supabase Auth user, so it references auth.users, and a deleted user leaves
-- the account unattributed rather than blocking the delete.
alter table public.broker_accounts drop constraint if exists broker_accounts_user_id_fkey;
alter table public.broker_accounts
  add constraint broker_accounts_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

create table if not exists public.atlas_admins (
    user_id    uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);
alter table public.atlas_admins enable row level security;
revoke all on public.atlas_admins from public, anon, authenticated;

insert into public.atlas_admins (user_id)
select m.user_id
  from public.portfolio_members m
  join public.portfolios p on p.id = m.portfolio_id
 where p.is_default and m.role = 'owner'
on conflict do nothing;

-- The accounts registered before ON-1 carry no owner on broker_accounts; the
-- owner is already recorded in portfolio_members, so copy it across.
update public.broker_accounts b
   set user_id = m.user_id
  from public.portfolios p
  join public.portfolio_members m on m.portfolio_id = p.id and m.role = 'owner'
 where p.broker_account_id = b.id and b.user_id is null;

create or replace function public.atlas_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
    select auth.uid() is not null
       and exists (select 1 from public.atlas_admins a where a.user_id = auth.uid());
$fn$;

comment on function public.atlas_is_admin() is
  'ON-1. True when the signed-in caller is in atlas_admins. authenticated only.';

-- How many accounts a person who is not an administrator may connect. Each
-- account carries its own nightly analytics, so the number is a cost bound,
-- not a product rule; administrators are not capped.
create or replace function public.atlas_account_cap()
returns integer
language sql
immutable
set search_path = ''
as $fn$ select 3 $fn$;

create or replace function public.atlas_my_access()
returns table (is_admin boolean, owned_portfolios integer, account_cap integer)
language sql
stable
security definer
set search_path = ''
as $fn$
    select public.atlas_is_admin(),
           (select count(*)::integer from public.portfolio_members m
             where m.user_id = auth.uid() and m.role = 'owner'),
           case when public.atlas_is_admin() then null else public.atlas_account_cap() end;
$fn$;

comment on function public.atlas_my_access() is
  'ON-1. The caller''s onboarding facts: administrator or not, portfolios owned, and the '
  'account cap (NULL = uncapped). authenticated only.';

create or replace function public.atlas_connect_broker_account(
    p_user_id uuid, p_name text, p_account_number text, p_is_paper boolean,
    p_key_id text, p_secret_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
    v_portfolio uuid;
    v_owned     integer;
begin
    if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
        raise exception 'no such user' using errcode = 'foreign_key_violation';
    end if;
    if coalesce(btrim(p_account_number), '') = '' then
        raise exception 'the broker reported no account number';
    end if;

    -- One connect at a time per person, so two concurrent requests cannot
    -- both pass the cap check.
    perform pg_advisory_xact_lock(hashtextextended('atlas_connect:' || p_user_id::text, 0));

    if not exists (select 1 from public.atlas_admins a where a.user_id = p_user_id) then
        select count(*) into v_owned from public.portfolio_members m
         where m.user_id = p_user_id and m.role = 'owner';
        if v_owned >= public.atlas_account_cap() then
            raise exception 'account limit reached (%)', public.atlas_account_cap()
              using errcode = 'check_violation';
        end if;
    end if;

    v_portfolio := public.atlas_register_broker_account(
        p_name, p_account_number, p_is_paper, p_key_id, p_secret_key);

    update public.broker_accounts b
       set user_id = p_user_id
      from public.portfolios p
     where p.id = v_portfolio and b.id = p.broker_account_id;

    perform public.atlas_grant_portfolio_access(p_user_id, v_portfolio, 'owner');
    return v_portfolio;
end
$fn$;

comment on function public.atlas_connect_broker_account(uuid, text, text, boolean, text, text) is
  'ON-1. Register a verified broker account, attribute it to p_user_id and make them its '
  'owner, in one transaction. Refuses past atlas_account_cap() for a non-administrator. '
  'service_role only; the API route verifies the keys against the broker first.';

revoke execute on function public.atlas_is_admin()        from public, anon;
revoke execute on function public.atlas_my_access()       from public, anon;
revoke execute on function public.atlas_account_cap()     from public, anon;
grant  execute on function public.atlas_is_admin()        to authenticated, service_role;
grant  execute on function public.atlas_my_access()       to authenticated, service_role;
grant  execute on function public.atlas_account_cap()     to authenticated, service_role;
revoke execute on function public.atlas_connect_broker_account(uuid, text, text, boolean, text, text)
  from public, anon, authenticated;
grant  execute on function public.atlas_connect_broker_account(uuid, text, text, boolean, text, text)
  to service_role;

do $$
begin
    if has_function_privilege('anon', 'public.atlas_is_admin()', 'execute')
       or has_function_privilege('anon', 'public.atlas_my_access()', 'execute')
       or has_function_privilege('anon', 'public.atlas_connect_broker_account(uuid, text, text, boolean, text, text)', 'execute')
       or has_function_privilege('authenticated', 'public.atlas_connect_broker_account(uuid, text, text, boolean, text, text)', 'execute') then
        raise exception 'ON-1: a browser role can execute an onboarding function it must not';
    end if;
    if has_table_privilege('authenticated', 'public.atlas_admins', 'select')
       or has_table_privilege('anon', 'public.atlas_admins', 'select') then
        raise exception 'ON-1: atlas_admins is readable by a browser role';
    end if;
    if not exists (select 1 from public.atlas_admins) then
        raise exception 'ON-1: no administrator seeded -- nobody could invite anyone';
    end if;
end $$;
