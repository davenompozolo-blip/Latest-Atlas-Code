-- RA-2: an access request carries a first name and a surname.
--
-- `name` keeps its column and now holds the FIRST name; `surname` is new.
-- Rows written before RA-2 hold the full name in `name` and NULL in surname,
-- so surname is nullable here and REQUIRED by api/access-request.js.
--
-- The submit function gains p_surname as a trailing argument WITH A DEFAULT,
-- so the route that is live while this applies (four named arguments) still
-- resolves to it. The old four-argument function is dropped in the same
-- transaction: two overloads that both match a four-argument call would make
-- PostgREST refuse every request as ambiguous.

alter table public.access_requests add column if not exists surname text;

alter table public.access_requests drop constraint if exists access_requests_surname_ck;
alter table public.access_requests add constraint access_requests_surname_ck
    check (surname is null or length(btrim(surname)) between 1 and 100);

comment on column public.access_requests.name is
  'First (given) name. Rows before RA-2 hold the full name here and NULL in surname.';
comment on column public.access_requests.surname is
  'Surname (RA-2). Required by api/access-request.js; NULL only on rows before RA-2.';

drop function if exists public.atlas_submit_access_request(text, text, text, text);

create or replace function public.atlas_submit_access_request(
    p_name text, p_email text, p_note text, p_ip_hash text, p_surname text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
    v_email   text := lower(btrim(coalesce(p_email, '')));
    v_name    text := btrim(coalesce(p_name, ''));
    v_surname text := nullif(btrim(coalesce(p_surname, '')), '');
    v_note    text := nullif(btrim(coalesce(p_note, '')), '');
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

    insert into public.access_requests (name, surname, email, note, ip_hash)
    values (v_name, v_surname, v_email, v_note, p_ip_hash)
    on conflict (lower(email)) where status = 'pending' do nothing;
    if not found then
        return 'duplicate';
    end if;
    return 'recorded';
end
$fn$;

comment on function public.atlas_submit_access_request(text, text, text, text, text) is
  'RA-1/RA-2. Record a request for access (first name in p_name, p_surname). Returns recorded | '
  'duplicate | existing_user | rate_limited; the route must answer all but rate_limited identically. '
  'service_role only.';

revoke execute on function public.atlas_submit_access_request(text, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.atlas_submit_access_request(text, text, text, text, text) to service_role;

do $$
begin
    if (select count(*) from pg_proc where proname = 'atlas_submit_access_request'
          and pronamespace = 'public'::regnamespace) <> 1 then
        raise exception 'RA-2: expected exactly one atlas_submit_access_request';
    end if;
    if has_function_privilege('anon', 'public.atlas_submit_access_request(text, text, text, text, text)', 'execute')
       or has_function_privilege('authenticated', 'public.atlas_submit_access_request(text, text, text, text, text)', 'execute') then
        raise exception 'RA-2: a browser role can call the submit function';
    end if;
end $$;
