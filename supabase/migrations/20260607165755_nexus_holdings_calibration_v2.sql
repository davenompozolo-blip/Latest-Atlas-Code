create or replace view public.nexus_holdings as
with latest as (select max(as_of_date) d from positions),
cur as (
  select p.asset_id, a.symbol, a.name, p.market_value
  from positions p join assets a on a.id = p.asset_id
  where p.as_of_date = (select d from latest) and p.market_value > 0
),
tot as (select sum(market_value) tmv from cur),
varbase as (select sum(stock_var_95) sv from insight_counter_specific_var_vs_sector),
px as (
  select asset_id, close, price_date,
    row_number() over (partition by asset_id order by price_date desc) rn,
    max(price_date) over (partition by asset_id) last_date
  from price_history
),
px2 as (
  select asset_id,
    max(case when rn=1 then close end) last_close,
    max(case when rn=2 then close end) prev_close,
    max(last_date) last_date
  from px where rn <= 2 group by asset_id
),
conv as (
  select distinct on (symbol) symbol, conviction
  from decisions order by symbol, seq desc
),
fv as (
  select ticker, avg_fair_value, last_run_at::date as run_date
  from scrapbook_companies
  where avg_fair_value is not null and avg_fair_value > 0
)
select
  cur.symbol as tk,
  coalesce(pt.theme, 'Unmapped') as theme,
  coalesce(c.conviction, 49) as conviction,
  (c.conviction is not null) as pcm_rated,
  round((cur.market_value / nullif(t.tmv,0)) * 100, 2) as weight_pct,
  case when px2.prev_close > 0 then round((px2.last_close/px2.prev_close - 1)*100, 2) end as today_pct,
  case when px2.prev_close > 0 then round(((px2.last_close/px2.prev_close - 1) * (cur.market_value/nullif(t.tmv,0)))*100, 3) end as contrib_pct,
  round((coalesce(v.stock_var_95,0) / nullif(vb.sv,0)) * 100, 1) as component_var,
  case when fv.avg_fair_value is not null and px2.last_close > 0
       then round((fv.avg_fair_value/px2.last_close - 1)*100, 1) end as fv_gap_pct,
  null::text as signal,
  'neutral'::text as signal_tone,
  coalesce((current_date - px2.last_date) > 4, true) as stale,
  (
    fv.avg_fair_value is not null and px2.last_close > 0
    and (current_date - fv.run_date) <= 14
    and round((fv.avg_fair_value/px2.last_close - 1)*100, 1) between -35 and 60
  ) as fv_trustworthy
from cur
cross join tot t
cross join varbase vb
left join position_themes pt on pt.symbol = cur.symbol
left join conv c on c.symbol = cur.symbol
left join px2 on px2.asset_id = cur.asset_id
left join fv on fv.ticker = cur.symbol
left join insight_counter_specific_var_vs_sector v on v.symbol = cur.symbol
order by cur.market_value desc;

grant select on public.nexus_holdings to anon, authenticated;
