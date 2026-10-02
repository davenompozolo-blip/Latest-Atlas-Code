-- RA-1: "Request access" on the landing page, approved by an administrator.
--
-- Invite-only stays: a request is a message to an administrator, never an
-- account. Approving one issues the same one-time invite link ON-1 does.
--
-- The submitter is anonymous, so everything about this path is defensive:
--   * the browser never touches the table -- api/access-request.js writes it
--     with the service key through atlas_submit_access_request(), and anon
--     holds no grant at all (AUTH-2c);
--   * the IP is stored only as a keyed hash, enough to rate-limit and no more;
--   * the function answers with an outcome for the route to act on, and the
--     route gives the visitor the SAME reply for a new, a duplicate and an
--     already-registered address, so the form cannot be used to find out who
--     has an account.

create table if not exists public.access_requests (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    email       text not null,
    note        text,
    ip_hash     text not null,
    status      text not null default 'pending',
    created_at  timestamptz not null default now(),
    decided_at  timestamptz,
    decided_by  uuid references auth.users (id) on delete set null,
    constraint access_requests_status_ck check (status in ('pending', 'approved', 'declined')),
    constraint access_requests_decided_ck check ((status = 'pending') = (decided_at is null)),
    constraint access_requests_name_ck  check (length(btrim(name)) between 1 and 100),
    constraint access_requests_email_ck check (length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    constraint access_requests_note_ck  check (note is null or length(note) <= 1000)
);

-- One open request per address; a decided one does not block asking again.
create unique index if not exists access_requests_pending_email_uniq
    on public.access_requests (lower(email)) where status = 'pending';
create index if not exists access_requests_ip_recent_idx on public.access_requests (ip_hash, created_at desc);
create index if not exists access_requests_created_idx on public.access_requests (created_at desc);

alter table public.access_requests enable row level security;
revoke all on public.access_requests from public, anon, authenticated;
grant select on public.access_requests to authenticated;
create policy ra1_admin_read on public.access_requests for select to authenticated
    using ((select public.atlas_is_admin()));

-- Limits. Per IP: a handful an hour stops a script, not a person. Overall: a
-- daily ceiling so a distributed flood cannot bury the real requests.
create or replace function public.atlas_submit_access_request(
    p_name text, p_email text, p_note text, p_ip_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
    v_email text := lower(btrim(coalesce(p_email, '')));
    v_name  text := btrim(coalesce(p_name, ''));
    v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
    if coalesce(btrim(p_ip_hash), '') = '' then
        raise exception 'an ip hash is required';
    end if;

    -- Serialise submissions so the limits below cannot be raced.
    perform pg_advisory_xact_lock(hashtextextended('atlas_access_request', 0));

    if (select count(*) from public.access_requests
         where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 3 then
        return 'rate_limited';
    end if;
    if (select count(*) from public.access_requests
         where created_at > now() - interval '1 day') >= 50 then
        return 'rate_limited';
    end if;

    -- Someone who already has an account is not told so; nothing is recorded.
    if exists (select 1 from auth.users u where lower(u.email) = v_email) then
        return 'existing_user';
    end if;

    insert into public.access_requests (name, email, note, ip_hash)
    values (v_name, v_email, v_note, p_ip_hash)
    on conflict (lower(email)) where status = 'pending' do nothing;
    if not found then
        return 'duplicate';
    end if;
    return 'recorded';
end
$fn$;

comment on function public.atlas_submit_access_request(text, text, text, text) is
  'RA-1. Record a request for access. Returns recorded | duplicate | existing_user | rate_limited; '
  'the route must answer all but rate_limited identically. service_role only.';

create or replace function public.atlas_decide_access_request(
    p_id uuid, p_status text, p_admin uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
    v_email text;
begin
    if p_status not in ('approved', 'declined') then
        raise exception 'decision must be approved or declined';
    end if;
    if p_admin is null or not exists (select 1 from public.atlas_admins a where a.user_id = p_admin) then
        raise exception 'only an administrator decides a request' using errcode = '42501';
    end if;
    update public.access_requests
       set status = p_status, decided_at = now(), decided_by = p_admin
     where id = p_id and status = 'pending'
    returning email into v_email;
    if v_email is null then
        raise exception 'no pending request %', p_id using errcode = 'no_data_found';
    end if;
    return v_email;
end
$fn$;

comment on function public.atlas_decide_access_request(uuid, text, uuid) is
  'RA-1. Approve or decline a pending request; returns its email. Re-checks that p_admin is an '
  'administrator. service_role only -- the route verifies the caller first.';

revoke execute on function public.atlas_submit_access_request(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.atlas_decide_access_request(uuid, text, uuid)       from public, anon, authenticated;
grant  execute on function public.atlas_submit_access_request(text, text, text, text) to service_role;
grant  execute on function public.atlas_decide_access_request(uuid, text, uuid)       to service_role;

do $$
begin
    if has_function_privilege('anon', 'public.atlas_submit_access_request(text, text, text, text)', 'execute')
       or has_function_privilege('authenticated', 'public.atlas_submit_access_request(text, text, text, text)', 'execute')
       or has_function_privilege('authenticated', 'public.atlas_decide_access_request(uuid, text, uuid)', 'execute')
       or has_table_privilege('anon', 'public.access_requests', 'select')
       or has_table_privilege('authenticated', 'public.access_requests', 'insert')
       or has_table_privilege('authenticated', 'public.access_requests', 'update') then
        raise exception 'RA-1: a browser role can reach access_requests beyond an administrator''s read';
    end if;
end $$;
