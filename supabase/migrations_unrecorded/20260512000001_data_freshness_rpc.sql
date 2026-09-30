-- Migration: data_freshness() RPC
-- Returns age in hours for key data streams, for the Command Centre freshness tile.

create or replace function public.data_freshness()
returns table (
  stream      text,
  last_update timestamptz,
  age_hours   numeric
)
language sql
stable
security definer
as $$
  -- price_history: most recent price_date treated as end-of-day UTC
  select
    'price_history'::text                                          as stream,
    (max(price_date)::timestamptz + interval '23 hours 59 minutes') as last_update,
    round(
      extract(epoch from (now() - (max(price_date)::timestamptz + interval '23 hours 59 minutes')))
      / 3600, 1
    )                                                              as age_hours
  from public.price_history

  union all

  -- positions: most recent updated_at
  select
    'positions'::text,
    max(updated_at),
    round(extract(epoch from (now() - max(updated_at))) / 3600, 1)
  from public.positions

  union all

  -- account_snapshots: most recent snapshot_date
  select
    'account_snapshots'::text,
    (max(snapshot_date)::timestamptz + interval '23 hours 59 minutes'),
    round(
      extract(epoch from (now() - (max(snapshot_date)::timestamptz + interval '23 hours 59 minutes')))
      / 3600, 1
    )
  from public.account_snapshots

  union all

  -- sync log: last successful sync of any type
  select
    'last_sync'::text,
    max(completed_at),
    round(extract(epoch from (now() - max(completed_at))) / 3600, 1)
  from public.atlas_sync_log
  where status = 'success'
$$;

-- Allow anon / authenticated to call it (read-only, security definer, no secrets exposed)
grant execute on function public.data_freshness() to anon, authenticated;
