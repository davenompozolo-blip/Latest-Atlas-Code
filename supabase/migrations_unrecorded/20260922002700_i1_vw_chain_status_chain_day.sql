-- I-1: vw_chain_status reads the chain NIGHT too.
--
-- The view scoped its four lookups to current_date while atlas_chain_advance()
-- now scopes to atlas_chain_day(). Left as it was, the view would report an
-- empty night from 00:00 to 01:59 UTC while the chain was still working -- two
-- opinions about which night it is, and the observability surface holding the
-- wrong one. One definition decides; the view reads it.

create or replace view public.vw_chain_status as
select
    s.seq,
    s.stage,
    s.kind,
    s.depends_on,
    s.hard,
    s.not_before,
    s.dow,
    s.enabled,
    public.atlas_chain_stage_status(s.stage, 'pg_cron_chain',        public.atlas_chain_day()::timestamptz) as live_status,
    public.atlas_chain_stage_status(s.stage, 'pg_cron_chain_shadow', public.atlas_chain_day()::timestamptz) as shadow_status,
    l.started_at  as live_dispatched_at,
    l.finished_at as live_dispatch_closed_at,
    p.started_at  as worker_started_at,
    p.finished_at as worker_finished_at,
    p.status      as worker_status,
    -- How long the real work ran on past the dispatch "success". Non-zero here
    -- is exactly the signal that a stage must not be chained off its dispatch.
    round(extract(epoch from (p.finished_at - l.finished_at))) as worker_overshoot_s
from public.atlas_chain_stages s
left join lateral (
    select * from sync_log l2
    where l2.function_name = s.stage
      and l2.source        = 'pg_cron_chain'
      and l2.started_at   >= public.atlas_chain_day()::timestamptz
    order by l2.started_at desc limit 1
) l on true
left join lateral (
    select * from sync_log p2
    where s.completion_log_name is not null
      and p2.function_name = s.completion_log_name
      and p2.source        = s.completion_source
      and p2.started_at   >= public.atlas_chain_day()::timestamptz
    order by p2.started_at desc limit 1
) p on true;

comment on view public.vw_chain_status is
  'Tonight''s ingestion chain, graded. live_status/shadow_status come from '
  'atlas_chain_stage_status() so they reflect the WORKER finishing, not the '
  'dispatch being acknowledged. worker_overshoot_s is how long the handler kept '
  'running after its dispatch row closed success.';
