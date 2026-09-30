-- ============================================================
-- Valuation Sync — data-model additions
-- ------------------------------------------------------------
-- Supports the weekly isomorphic-engine sync (api/sync-valuations):
--   1. drop_reason on snapshots, so a method that failed loud explains
--      itself ("shares_unhydrated" etc.) instead of just being absent.
--   2. valuation_health view — per-ticker freshness + methods valued vs
--      dropped + reasons, the "stop guessing which counters are BS"
--      diagnostic surface.
-- ============================================================

-- reason a method was dropped, so the health view can explain itself.
-- null = valued; else e.g.
--   'shares_unhydrated' | 'tv_clamped' | 'outlier_trimmed'
--   | 'missing_fcf_base' | 'stale_price' | 'no_dividend'
--   | 'missing_book_value' | 'missing_multiples_inputs'
alter table public.scrapbook_snapshots
  add column if not exists drop_reason text;

-- per-ticker valuation health
create or replace view public.valuation_health as
with latest_run as (
  select company_id, max(run_date) rd from scrapbook_snapshots group by company_id
),
methods as (
  select s.company_id,
    count(*) filter (where s.implied_price is not null) as methods_valued,
    count(*) filter (where s.implied_price is null)     as methods_dropped,
    array_agg(distinct s.drop_reason) filter (where s.drop_reason is not null) as drop_reasons
  from scrapbook_snapshots s
  join latest_run lr on lr.company_id = s.company_id and lr.rd = s.run_date
  group by s.company_id
)
select c.ticker,
  c.avg_fair_value,
  c.last_run_at,
  (current_date - c.last_run_at::date) as age_days,
  m.methods_valued, m.methods_dropped, m.drop_reasons,
  (c.avg_fair_value is not null) as has_composite
from scrapbook_companies c
left join methods m on m.company_id = c.id;

grant select on public.valuation_health to anon, authenticated, service_role;
