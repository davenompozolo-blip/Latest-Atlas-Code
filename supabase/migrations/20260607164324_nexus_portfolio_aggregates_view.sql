create or replace view public.nexus_portfolio_aggregates as
with latest as (select max(as_of_date) d from positions),
cur as (
  select a.symbol, p.market_value
  from positions p join assets a on a.id = p.asset_id
  where p.as_of_date = (select d from latest) and p.market_value > 0
),
tot as (select sum(market_value) tmv from cur)
select
  coalesce(pt.theme, 'Unmapped') as theme,
  round(sum(cur.market_value) / (select tmv from tot) * 100, 1) as share_pct,
  count(*) as n_names
from cur
left join position_themes pt on pt.symbol = cur.symbol
group by coalesce(pt.theme, 'Unmapped')
order by share_pct desc;

grant select on public.nexus_portfolio_aggregates to anon, authenticated;
