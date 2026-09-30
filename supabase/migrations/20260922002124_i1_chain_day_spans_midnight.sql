create or replace function public.atlas_chain_day(p_at timestamptz default now())
returns date
language sql
stable
as $fn$
    -- Explicit UTC, never the session's zone: the cron schedules and every
    -- not_before in atlas_chain_stages are authored in UTC, so the chain day
    -- has to be a claim about that clock and no other.
    select case
        when (p_at at time zone 'UTC')::time < time '02:00'
        then ((p_at at time zone 'UTC')::date - 1)
        else  (p_at at time zone 'UTC')::date
    end;
$fn$;

comment on function public.atlas_chain_day(timestamptz) is
  'The chain night that a given instant belongs to. The tick window spans 20:00-01:59 UTC, so anything before 02:00 belongs to the previous calendar day. Scoping the chain to current_date instead strands every stage still running at midnight.';

revoke execute on function public.atlas_chain_day(timestamptz)
    from public, anon, authenticated;
