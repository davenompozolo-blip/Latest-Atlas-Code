-- system_health: pipeline heartbeat for all ATLAS components
create table if not exists system_health (
  component   text primary key,
  last_ok_at  timestamptz,
  status      text check (status in ('ok','degraded','down')),
  detail      text,
  updated_at  timestamptz default now()
);

-- seed initial rows
insert into system_health (component, status) values
  ('parser',    'ok'),
  ('alpaca',    'ok'),
  ('supabase',  'ok'),
  ('execution', 'ok')
on conflict (component) do nothing;

-- anon read
alter table system_health enable row level security;
create policy "anon_read" on system_health for select using (true);
create policy "service_write" on system_health for all using (auth.role() = 'service_role');

-- RPC: update parser heartbeat (called by the sync functions)
create or replace function update_parser_heartbeat(p_status text default 'ok', p_detail text default null)
returns void language sql security definer as $$
  insert into system_health (component, last_ok_at, status, detail, updated_at)
  values ('parser', now(), p_status, p_detail, now())
  on conflict (component) do update
    set last_ok_at = case when excluded.status = 'ok' then now() else system_health.last_ok_at end,
        status = excluded.status,
        detail = excluded.detail,
        updated_at = now();
$$;
