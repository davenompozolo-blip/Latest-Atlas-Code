-- The Bench, spec §6.1 — cumulative position-level contribution, so the
-- waterfall stops reading "today only". Contribution is defined exactly as
-- nexus_holdings.contrib_pct already defines it (yesterday's weight × today's
-- price return), then summed over the window — same units, same sign
-- convention, so today's figure reconciles with the existing docket column.
create or replace view public.vw_bench_contribution as
with daily as (
  select price_date,
         symbol,
         sum(position_value) as pos_val,
         max(close_price)    as close_price
  from public.vw_position_nav_daily
  group by price_date, symbol
),
nav as (
  select price_date, sum(pos_val) as total_nav
  from daily
  group by price_date
),
seq as (
  select d.price_date,
         d.symbol,
         d.close_price,
         lag(d.close_price) over (partition by d.symbol order by d.price_date) as prev_close,
         lag(d.pos_val)     over (partition by d.symbol order by d.price_date) as prev_pos_val,
         lag(n.total_nav)   over (partition by d.symbol order by d.price_date) as prev_nav
  from daily d
  join nav n on n.price_date = d.price_date
),
contrib as (
  select price_date,
         symbol,
         (close_price / prev_close - 1) * (prev_pos_val / prev_nav) * 100 as contrib_pct
  from seq
  where prev_close > 0 and prev_nav > 0 and prev_pos_val is not null
),
last_day as (select max(price_date) as d from contrib)
select c.symbol,
       round(coalesce(sum(c.contrib_pct) filter (where c.price_date = (select d from last_day)), 0)::numeric, 3) as contrib_today,
       round(sum(c.contrib_pct) filter (where c.price_date >= date_trunc('year', current_date)::date)::numeric, 3) as contrib_ytd,
       round(sum(c.contrib_pct)::numeric, 3) as contrib_since_entry,
       min(c.price_date) as series_start,
       max(c.price_date) as series_end,
       count(*)          as observations
from contrib c
where c.contrib_pct is not null
group by c.symbol;

grant select on public.vw_bench_contribution to anon, authenticated;
