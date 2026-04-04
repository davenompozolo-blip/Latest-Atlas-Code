-- sync_log: observability table for the Alpaca→Supabase Edge Function
-- One row per sync run. The Edge Function should insert a row at the start
-- of every invocation and update it on completion (or failure).
--
-- The terminal's navbar reads the most recent row to render the
-- "Last sync" status pill (green/amber/red + relative timestamp).

create table if not exists public.sync_log (
    id              bigserial primary key,
    started_at      timestamptz not null default now(),
    finished_at     timestamptz,
    status          text        not null default 'running'
                      check (status in ('running', 'success', 'partial', 'error')),
    source          text        not null default 'edge_function',
    positions_seen  integer,
    positions_upserted integer,
    transactions_upserted integer,
    prices_upserted integer,
    duration_ms     integer generated always as (
        case
          when finished_at is not null
          then (extract(epoch from (finished_at - started_at)) * 1000)::integer
        end
    ) stored,
    error_message   text,
    details         jsonb       not null default '{}'::jsonb
);

create index if not exists sync_log_started_at_desc
    on public.sync_log (started_at desc);

create index if not exists sync_log_status_started_at
    on public.sync_log (status, started_at desc);

-- RLS: terminal needs to read the latest row via the anon key.
alter table public.sync_log enable row level security;

drop policy if exists sync_log_read_anon on public.sync_log;
create policy sync_log_read_anon
    on public.sync_log
    for select
    to anon, authenticated
    using (true);

-- Writes are only allowed via the service_role (Edge Function).
-- No insert/update policies for anon → effectively write-locked.

comment on table  public.sync_log               is 'Observability log for the Alpaca→Supabase sync Edge Function. One row per run.';
comment on column public.sync_log.status        is 'running | success | partial | error';
comment on column public.sync_log.source        is 'edge_function | manual | backfill';
comment on column public.sync_log.details       is 'Free-form JSON: per-account breakdown, API latency, filter counts, etc.';

-- Convenience view the terminal can hit directly without knowing the schema.
create or replace view public.vw_sync_status as
select
    id,
    started_at,
    finished_at,
    status,
    source,
    positions_seen,
    positions_upserted,
    transactions_upserted,
    prices_upserted,
    duration_ms,
    error_message,
    extract(epoch from (now() - coalesce(finished_at, started_at)))::integer as seconds_since
from public.sync_log
order by started_at desc
limit 1;

grant select on public.vw_sync_status to anon, authenticated;
