-- =============================================================================
-- ONB-1  Onboarding as state, not as a chain of hand-offs
-- =============================================================================
-- Replaces: request form -> admin approves -> admin sends one-time link -> password.
-- With:     email code sign-in (anyone) -> account row (pending | approved | revoked)
--           -> details -> approval -> broker -> first sync -> ready.
--
-- Fits the live schema of vdmojjszvvcithuxwexx as read on 2026-10-03:
--   * keeps atlas_admins / atlas_is_admin() as the admin source of truth
--   * leaves access_requests and atlas_submit/decide_access_request in place
--     (retired in ONB-4 once the code-login UI ships)
--   * nothing existed on auth.users (no trigger, no profiles table); public.users
--     is empty and unrelated, and is not touched
--
-- Safe to run more than once. Applied through the management API after a
-- rolled-back dry run (supabase/tests/onb1_onboarding_state_contract.sql).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

create table if not exists public.atlas_accounts (
    user_id              uuid primary key references auth.users(id) on delete cascade,
    email                text not null,
    first_name           text,
    surname              text,
    status               text not null default 'pending'
                         check (status in ('pending', 'approved', 'revoked')),
    source               text not null default 'self_signup'
                         check (source in ('self_signup', 'invite', 'admin', 'backfill')),
    requested_at         timestamptz not null default now(),  -- auth row created (code requested)
    first_signin_at      timestamptz,                          -- code verified, first session
    details_completed_at timestamptz,                          -- first name + surname given
    approved_at          timestamptz,
    approved_by          uuid references auth.users(id) on delete set null,
    revoked_at           timestamptz,
    broker_connected_at  timestamptz,
    first_sync_ok_at     timestamptz,
    last_seen_at         timestamptz,
    admin_notified_at    timestamptz,                          -- set by the notify function
    updated_at           timestamptz not null default now()
);

create index if not exists atlas_accounts_status_idx
    on public.atlas_accounts (status, requested_at desc);
create index if not exists atlas_accounts_email_idx
    on public.atlas_accounts (lower(email));

comment on table public.atlas_accounts is
  'ONB-1. One row per auth user. The single source of onboarding state. '
  'Written only by SECURITY DEFINER functions and triggers; clients read their own row.';

create table if not exists public.atlas_allowlist (
    email       text primary key check (email = lower(btrim(email)) and email like '%@%'),
    first_name  text,
    surname     text,
    invited_by  uuid references auth.users(id) on delete set null,
    invited_at  timestamptz not null default now(),
    claimed_by  uuid references auth.users(id) on delete set null,
    claimed_at  timestamptz,
    revoked_at  timestamptz
);

comment on table public.atlas_allowlist is
  'ONB-1. "Invite someone" = a row here. Whoever signs in with this email is approved '
  'automatically. No link is generated, so nothing can expire or be consumed by a mail scanner.';

alter table public.atlas_accounts  enable row level security;
alter table public.atlas_allowlist enable row level security;

drop policy if exists onb_accounts_read_own   on public.atlas_accounts;
drop policy if exists onb_accounts_admin_read on public.atlas_accounts;
drop policy if exists onb_allowlist_admin_read on public.atlas_allowlist;

create policy onb_accounts_read_own on public.atlas_accounts
    for select to authenticated using (user_id = (select auth.uid()));
create policy onb_accounts_admin_read on public.atlas_accounts
    for select to authenticated using ((select public.atlas_is_admin()));
create policy onb_allowlist_admin_read on public.atlas_allowlist
    for select to authenticated using ((select public.atlas_is_admin()));
-- No insert/update/delete policies on purpose: all writes go through the functions below.

-- Default privileges would otherwise hand the browser roles full table rights;
-- RLS has no write policies, but a grant nobody needs is one a later policy inherits.
revoke all on public.atlas_accounts, public.atlas_allowlist from public, anon, authenticated;
grant select on public.atlas_accounts, public.atlas_allowlist to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Triggers on auth.users
--    A failing trigger here would block sign-in for everyone, so every body
--    catches its own errors and logs a warning instead. atlas_my_onboarding()
--    self-heals a missing row, so a swallowed failure is recoverable.
-- -----------------------------------------------------------------------------

create or replace function public.atlas_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_email   text := lower(btrim(coalesce(new.email, '')));
    v_allow   public.atlas_allowlist%rowtype;
    v_invited boolean;
begin
    begin
        select * into v_allow
          from public.atlas_allowlist a
         where a.email = v_email and a.revoked_at is null;
        -- An account an administrator created through Auth's invite endpoint
        -- (ON-1 / RA-2: invited_at is stamped at creation) is approved by that
        -- act, so the existing invite flow keeps working until ONB-3 replaces it.
        v_invited := found or new.invited_at is not null;

        -- Names: allowlist first (admin typed them), then sign-up metadata.
        -- Metadata is client-controlled, so it is only ever used for display,
        -- never for status.
        insert into public.atlas_accounts
            (user_id, email, first_name, surname, status, source,
             requested_at, approved_at, approved_by)
        values
            (new.id, v_email,
             nullif(btrim(coalesce(v_allow.first_name, new.raw_user_meta_data ->> 'first_name')), ''),
             nullif(btrim(coalesce(v_allow.surname,    new.raw_user_meta_data ->> 'surname')),    ''),
             case when v_invited then 'approved' else 'pending' end,
             case when v_invited then 'invite'   else 'self_signup' end,
             coalesce(new.created_at, now()),
             case when v_invited then now() end,
             case when v_invited then v_allow.invited_by end)
        on conflict (user_id) do nothing;

        if v_invited then
            update public.atlas_allowlist
               set claimed_by = new.id, claimed_at = now()
             where email = v_email and claimed_at is null;
        end if;
    exception when others then
        raise warning 'atlas_on_auth_user_created(%): %', new.id, sqlerrm;
    end;
    return new;
end
$$;

create or replace function public.atlas_on_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    begin
        update public.atlas_accounts a
           set first_signin_at = coalesce(a.first_signin_at, new.last_sign_in_at),
               last_seen_at    = greatest(coalesce(a.last_seen_at, new.last_sign_in_at), new.last_sign_in_at),
               email           = lower(btrim(coalesce(new.email, a.email))),
               updated_at      = now()
         where a.user_id = new.id;
    exception when others then
        raise warning 'atlas_on_auth_user_updated(%): %', new.id, sqlerrm;
    end;
    return new;
end
$$;

drop trigger if exists atlas_on_auth_user_created on auth.users;
create trigger atlas_on_auth_user_created
    after insert on auth.users
    for each row execute function public.atlas_on_auth_user_created();

drop trigger if exists atlas_on_auth_user_updated on auth.users;
create trigger atlas_on_auth_user_updated
    after update of last_sign_in_at, email on auth.users
    for each row
    when (old.last_sign_in_at is distinct from new.last_sign_in_at
       or old.email is distinct from new.email)
    execute function public.atlas_on_auth_user_updated();

-- -----------------------------------------------------------------------------
-- 3. Progress stamps from the data itself (no app code has to remember to set them)
-- -----------------------------------------------------------------------------

-- 3a. Broker connected. Also the hard gate: nobody unapproved can attach a broker,
--     whatever route or script does the insert.
create or replace function public.atlas_on_broker_account_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.user_id is not null
       and not exists (select 1 from public.atlas_admins x where x.user_id = new.user_id)
       and not exists (select 1 from public.atlas_accounts a
                        where a.user_id = new.user_id and a.status = 'approved') then
        raise exception 'account % is not approved to connect a broker', new.user_id
              using errcode = '42501';
    end if;
    return new;
end
$$;

create or replace function public.atlas_after_broker_account_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Bookkeeping only: a failure here must never abort the broker connect.
    begin
        update public.atlas_accounts
           set broker_connected_at = coalesce(broker_connected_at, now()), updated_at = now()
         where user_id = new.user_id and broker_connected_at is null;
    exception when others then
        raise warning 'atlas_after_broker_account_inserted(%): %', new.id, sqlerrm;
    end;
    return new;
end
$$;

drop trigger if exists atlas_broker_requires_approval on public.broker_accounts;
create trigger atlas_broker_requires_approval
    before insert on public.broker_accounts
    for each row execute function public.atlas_on_broker_account_inserted();

drop trigger if exists atlas_broker_stamp_connected on public.broker_accounts;
create trigger atlas_broker_stamp_connected
    after insert on public.broker_accounts
    for each row when (new.user_id is not null)
    execute function public.atlas_after_broker_account_inserted();

-- 3b. First sync OK = the first account snapshot for any portfolio the user belongs to.
--     The "first_sync_ok_at is null" filter keeps this a no-op after the first one.
--     CC: confirm the onboarding sync path writes account_snapshots (it is what
--     atlas_account_sync_health reads). If not, move this to sync_log status='success'.
create or replace function public.atlas_after_account_snapshot_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Runs inside every positions sync (every 5 minutes, every account). A
    -- failure here must never roll back the sync, so it is caught and logged.
    if new.portfolio_id is not null then
        begin
            update public.atlas_accounts a
               set first_sync_ok_at = new.as_of, updated_at = now()
              from public.portfolio_members m
             where m.portfolio_id = new.portfolio_id
               and m.user_id = a.user_id
               and a.first_sync_ok_at is null;
        exception when others then
            raise warning 'atlas_after_account_snapshot_inserted(%): %', new.portfolio_id, sqlerrm;
        end;
    end if;
    return new;
end
$$;

drop trigger if exists atlas_snapshot_stamp_first_sync on public.account_snapshots;
create trigger atlas_snapshot_stamp_first_sync
    after insert on public.account_snapshots
    for each row execute function public.atlas_after_account_snapshot_inserted();

-- -----------------------------------------------------------------------------
-- 4. Gate + state for the signed-in user
-- -----------------------------------------------------------------------------

create or replace function public.atlas_is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select auth.uid() is not null
       and (public.atlas_is_admin()
            or exists (select 1 from public.atlas_accounts a
                        where a.user_id = auth.uid() and a.status = 'approved'));
$$;

comment on function public.atlas_is_approved() is
  'ONB-1. Use in RLS and server routes. Admins are always approved.';

-- The one call the client makes after every sign-in. Volatile on purpose:
-- it self-heals a missing row and records last_seen_at.
-- next_step is the server's answer; nextStep.ts only maps it to a route.
create or replace function public.atlas_my_onboarding()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_uid      uuid := auth.uid();
    v_acct     public.atlas_accounts%rowtype;
    v_admin    boolean;
    v_members  integer;
    v_brokers  integer;
    v_step     text;
begin
    if v_uid is null then
        return jsonb_build_object('next_step', 'sign_in');
    end if;

    select * into v_acct from public.atlas_accounts where user_id = v_uid;
    if not found then
        -- Trigger failed or the user predates it: create the row now.
        insert into public.atlas_accounts (user_id, email, status, source, requested_at, first_signin_at)
        select u.id, lower(u.email), 'pending', 'self_signup', u.created_at, u.last_sign_in_at
          from auth.users u where u.id = v_uid
        on conflict (user_id) do nothing;
        select * into v_acct from public.atlas_accounts where user_id = v_uid;
    end if;

    update public.atlas_accounts set last_seen_at = now() where user_id = v_uid;

    v_admin   := public.atlas_is_admin();
    v_members := (select count(*) from public.portfolio_members m where m.user_id = v_uid);
    v_brokers := (select count(*) from public.broker_accounts b where b.user_id = v_uid);

    v_step := case
        when v_admin                                         then 'ready'
        when v_acct.status = 'revoked'                       then 'revoked'
        when v_acct.first_name is null or v_acct.surname is null then 'details'
        when v_acct.status = 'pending'                       then 'awaiting_approval'
        -- Approved from here on. A member of a shared portfolio needs no broker of their own.
        when v_members > 0 and v_acct.first_sync_ok_at is not null then 'ready'
        when v_members > 0 and v_brokers = 0                 then 'ready'
        when v_brokers = 0                                   then 'connect_broker'
        when v_acct.first_sync_ok_at is null                 then 'first_sync'
        else 'ready'
    end;

    return jsonb_build_object(
        'next_step',            v_step,
        'status',               v_acct.status,
        'is_admin',             v_admin,
        'email',                v_acct.email,
        'first_name',           v_acct.first_name,
        'surname',              v_acct.surname,
        'requested_at',         v_acct.requested_at,
        'first_signin_at',      v_acct.first_signin_at,
        'approved_at',          v_acct.approved_at,
        'broker_connected_at',  v_acct.broker_connected_at,
        'first_sync_ok_at',     v_acct.first_sync_ok_at,
        'portfolio_count',      v_members,
        'broker_count',         v_brokers
    );
end
$$;

create or replace function public.atlas_set_my_details(p_first_name text, p_surname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_first text := nullif(btrim(coalesce(p_first_name, '')), '');
    v_last  text := nullif(btrim(coalesce(p_surname, '')), '');
begin
    if auth.uid() is null then
        raise exception 'sign in first' using errcode = '42501';
    end if;
    if v_first is null or v_last is null then
        raise exception 'first name and surname are both required' using errcode = '22023';
    end if;
    if length(v_first) > 80 or length(v_last) > 80 then
        raise exception 'name too long' using errcode = '22023';
    end if;
    update public.atlas_accounts
       set first_name = v_first, surname = v_last,
           details_completed_at = coalesce(details_completed_at, now()),
           updated_at = now()
     where user_id = auth.uid();
    return public.atlas_my_onboarding();
end
$$;

-- -----------------------------------------------------------------------------
-- 5. Administrator functions (all check atlas_is_admin() themselves)
-- -----------------------------------------------------------------------------

-- The pipeline view for ACCOUNTS. "requested" rows with no first_signin_at are
-- people who asked for a code but never typed it in; the UI should show them
-- muted and the notification should ignore them.
create or replace function public.atlas_admin_accounts()
returns table (
    user_id uuid, email text, first_name text, surname text,
    status text, source text, stage text,
    requested_at timestamptz, email_verified_at timestamptz, first_signin_at timestamptz,
    details_completed_at timestamptz, approved_at timestamptz, revoked_at timestamptz,
    broker_connected_at timestamptz, first_sync_ok_at timestamptz, last_seen_at timestamptz,
    portfolio_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.atlas_is_admin() then
        raise exception 'administrators only' using errcode = '42501';
    end if;
    return query
    select a.user_id, a.email, a.first_name, a.surname, a.status, a.source,
           case
               when a.status = 'revoked'            then 'revoked'
               when a.first_sync_ok_at is not null  then 'live'
               when a.broker_connected_at is not null then 'syncing'
               when a.status = 'approved'           then 'approved'
               when a.first_signin_at is not null   then 'waiting'
               else 'unverified'
           end,
           a.requested_at, u.email_confirmed_at, a.first_signin_at,
           a.details_completed_at, a.approved_at, a.revoked_at,
           a.broker_connected_at, a.first_sync_ok_at, a.last_seen_at,
           (select count(*)::int from public.portfolio_members m where m.user_id = a.user_id)
      from public.atlas_accounts a
      join auth.users u on u.id = a.user_id
     order by (a.status = 'pending' and a.first_signin_at is not null) desc,
              a.requested_at desc;
end
$$;

create or replace function public.atlas_admin_set_status(p_user_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_old text;
begin
    if not public.atlas_is_admin() then
        raise exception 'administrators only' using errcode = '42501';
    end if;
    if p_status not in ('approved', 'revoked', 'pending') then
        raise exception 'status must be approved, revoked or pending' using errcode = '22023';
    end if;
    if p_user_id = auth.uid() then
        raise exception 'you cannot change your own status' using errcode = '42501';
    end if;
    if exists (select 1 from public.atlas_admins x where x.user_id = p_user_id) and p_status <> 'approved' then
        raise exception 'remove administrator rights before revoking' using errcode = '42501';
    end if;

    select status into v_old from public.atlas_accounts where user_id = p_user_id for update;
    if not found then
        raise exception 'no account %', p_user_id using errcode = 'no_data_found';
    end if;

    update public.atlas_accounts
       set status      = p_status,
           approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
           approved_by = case when p_status = 'approved' then coalesce(approved_by, auth.uid()) else approved_by end,
           revoked_at  = case when p_status = 'revoked' then now() else null end,
           updated_at  = now()
     where user_id = p_user_id;

    -- Revoking ends their sessions: refresh tokens die now, the current access
    -- token at its expiry (default 1 hour).
    if p_status = 'revoked' then
        delete from auth.sessions where user_id = p_user_id;
    end if;

    return v_old || ' -> ' || p_status;
end
$$;

-- "Invite someone". Returns what happened so the UI can say it plainly:
--   'approved_existing' - they already had an account; it is approved now
--   'allowlisted'       - they will be approved the moment they first sign in
-- The app then sends a plain "You're in: sign in at atlasterminal.online with
-- this email" message. No link, nothing to expire.
create or replace function public.atlas_admin_invite(p_email text, p_first_name text default null, p_surname text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_email text := lower(btrim(coalesce(p_email, '')));
    v_uid   uuid;
begin
    if not public.atlas_is_admin() then
        raise exception 'administrators only' using errcode = '42501';
    end if;
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'that is not an email address' using errcode = '22023';
    end if;

    insert into public.atlas_allowlist (email, first_name, surname, invited_by)
    values (v_email, nullif(btrim(p_first_name), ''), nullif(btrim(p_surname), ''), auth.uid())
    on conflict (email) do update
       set first_name = coalesce(excluded.first_name, public.atlas_allowlist.first_name),
           surname    = coalesce(excluded.surname,    public.atlas_allowlist.surname),
           invited_by = excluded.invited_by,
           invited_at = now(),
           revoked_at = null;

    select u.id into v_uid from auth.users u where lower(u.email) = v_email;
    if v_uid is null then
        return 'allowlisted';
    end if;

    update public.atlas_accounts
       set status      = 'approved',
           source      = case when source = 'self_signup' then 'admin' else source end,
           approved_at = coalesce(approved_at, now()),
           approved_by = coalesce(approved_by, auth.uid()),
           revoked_at  = null,
           first_name  = coalesce(first_name, nullif(btrim(p_first_name), '')),
           surname     = coalesce(surname,    nullif(btrim(p_surname), '')),
           updated_at  = now()
     where user_id = v_uid;
    update public.atlas_allowlist set claimed_by = v_uid, claimed_at = coalesce(claimed_at, now())
     where email = v_email;
    return 'approved_existing';
end
$$;

create or replace function public.atlas_admin_uninvite(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.atlas_is_admin() then
        raise exception 'administrators only' using errcode = '42501';
    end if;
    update public.atlas_allowlist set revoked_at = now()
     where email = lower(btrim(p_email)) and claimed_at is null;
end
$$;

-- Grants: functions are callable by signed-in users only (each checks its own rights).
revoke all on function
    public.atlas_on_auth_user_created(), public.atlas_on_auth_user_updated(),
    public.atlas_on_broker_account_inserted(), public.atlas_after_broker_account_inserted(),
    public.atlas_after_account_snapshot_inserted()
  from public, anon, authenticated;

revoke all on function
    public.atlas_is_approved(), public.atlas_my_onboarding(),
    public.atlas_set_my_details(text, text), public.atlas_admin_accounts(),
    public.atlas_admin_set_status(uuid, text), public.atlas_admin_invite(text, text, text),
    public.atlas_admin_uninvite(text)
  from public, anon;

grant execute on function
    public.atlas_is_approved(), public.atlas_my_onboarding(),
    public.atlas_set_my_details(text, text), public.atlas_admin_accounts(),
    public.atlas_admin_set_status(uuid, text), public.atlas_admin_invite(text, text, text),
    public.atlas_admin_uninvite(text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Backfill: every existing auth user is approved, with history reconstructed.
--    As of 2026-10-03 that is two users: the owner (admin, 3 brokers) and the
--    account created by the 21:26 invite (no broker yet -> next_step connect_broker).
-- -----------------------------------------------------------------------------

insert into public.atlas_accounts
    (user_id, email, first_name, surname, status, source,
     requested_at, first_signin_at, details_completed_at, approved_at, approved_by,
     broker_connected_at, first_sync_ok_at, last_seen_at)
select
    u.id,
    lower(u.email),
    nullif(btrim(ar.name), ''),
    nullif(btrim(ar.surname), ''),
    'approved',
    'backfill',
    coalesce(ar.created_at, u.created_at),
    coalesce(u.email_confirmed_at, u.last_sign_in_at),
    case when nullif(btrim(ar.name), '') is not null and nullif(btrim(ar.surname), '') is not null
         then coalesce(ar.decided_at, u.created_at) end,
    coalesce(ar.decided_at, u.created_at),
    ar.decided_by,
    (select min(b.created_at) from public.broker_accounts b where b.user_id = u.id),
    (select min(s.as_of)
       from public.account_snapshots s
       join public.portfolio_members m on m.portfolio_id = s.portfolio_id
      where m.user_id = u.id),
    u.last_sign_in_at
from auth.users u
left join lateral (
    select r.* from public.access_requests r
     where lower(r.email) = lower(u.email) and r.status = 'approved'
     order by r.decided_at desc nulls last limit 1
) ar on true
on conflict (user_id) do nothing;


-- -----------------------------------------------------------------------------
-- Verify after applying (expect 2 rows, both approved; the owner 'live',
-- the second account 'approved' with no broker):
--   select email, status, source, first_name, surname, broker_connected_at, first_sync_ok_at
--     from public.atlas_accounts order by requested_at;
-- -----------------------------------------------------------------------------
