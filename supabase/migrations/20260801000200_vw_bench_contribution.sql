-- The Bench, spec §6.1 — cumulative position-level contribution, so the
-- waterfall stops reading "today only". Contribution is defined exactly as
-- nexus_holdings.contrib_pct already defines it (yesterday's weight × today's
-- price return), then summed over the window — same units, same sign
-- convention, so today's figure reconciles with the existing docket column.
--
-- vw_position_nav_daily carries a calendar row for the current day before its
-- close lands (null close_price), so priceless days are excluded entirely and
-- "today" means the last COMPLETED session — the same basis nexus_holdings uses
-- (its last two real price_history rows). Without that filter contrib_today
-- collapses to 0 for every name.
--
-- contrib_since_entry is genuinely since entry: vw_position_nav_daily has no
-- rows for a symbol before it was held, so series_start is the entry date.
-- Applied 2026-08-01.
create or replace view public.vw_bench_contribution as
with daily as (
  select price_date,
         symbol,
         sum(position_value) as pos_val,
         max(close_price)    as close_price
  from public.vw_position_nav_daily
  where close_price is not null and position_value is not null
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
last_day as (select max(price_date) as d from contrib where contrib_pct is not null)
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
