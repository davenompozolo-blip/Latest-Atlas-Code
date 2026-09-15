-- Applies 20260530000001_system_health.sql, which was never applied: the table did
-- not exist, update_parser_heartbeat() did not exist, and the version was absent
-- from supabase_migrations.schema_migrations -- while api/health.js and
-- src/lib/useFreshnessGate.js both read public.system_health, and
-- sync_alpaca_positions calls update_parser_heartbeat() on every successful run.
--
-- The earlier file is deliberately left in place: it sorts first on a clean
-- replay, and everything below is idempotent, so the two compose correctly.
--
-- Three deliberate departures from that file:
--   1. SET search_path on the SECURITY DEFINER function. CLAUDE.md records this
--      same omission three times; a definer function without it is a privilege
--      escalation path and the security advisor flags it.
--   2. REVOKE EXECUTE FROM public, anon, authenticated. Postgres grants EXECUTE
--      to PUBLIC by default, so naming anon/authenticated alone would leave the
--      grant in place -- also recorded in CLAUDE.md. Without this, any anon
--      caller could write arbitrary status/detail into the health table.
--      The real caller reaches Postgres directly over SUPABASE_DB_URL, not
--      through PostgREST, so it is unaffected.
--   3. DROP POLICY IF EXISTS before CREATE POLICY. CREATE POLICY is not
--      idempotent, so leaving it bare makes a clean replay fail.
--
-- Verified after applying with has_function_privilege, not by reading this file:
--   anon EXECUTE false | authenticated EXECUTE false | service_role EXECUTE true
--   anon SELECT on system_health true (intended -- it is a health table)

create table if not exists public.system_health (
  component   text primary key,
  last_ok_at  timestamptz,
  status      text check (status in ('ok','degraded','down')),
  detail      text,
  updated_at  timestamptz default now()
);

insert into public.system_health (component, status) values
  ('parser',    'ok'),
  ('alpaca',    'ok'),
  ('supabase',  'ok'),
  ('execution', 'ok')
on conflict (component) do nothing;

alter table public.system_health enable row level security;

drop policy if exists "anon_read" on public.system_health;
create policy "anon_read" on public.system_health for select using (true);

drop policy if exists "service_write" on public.system_health;
create policy "service_write" on public.system_health for all using (auth.role() = 'service_role');

create or replace function public.update_parser_heartbeat(p_status text default 'ok', p_detail text default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.system_health (component, last_ok_at, status, detail, updated_at)
  values ('parser', now(), p_status, p_detail, now())
  on conflict (component) do update
    set last_ok_at = case when excluded.status = 'ok' then now() else system_health.last_ok_at end,
        status = excluded.status,
        detail = excluded.detail,
        updated_at = now();
$$;

revoke execute on function public.update_parser_heartbeat(text, text) from public, anon, authenticated;
