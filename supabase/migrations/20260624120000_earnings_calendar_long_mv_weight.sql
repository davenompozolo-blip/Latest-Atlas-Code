-- ER-04 (QA audit): the Earnings Calendar card weighted positions on % of
-- account equity, while Equity Research, Nexus and the Portfolio holdings table
-- all use % of long market value (Σ = 100%). On this ~1.45x-levered book that
-- overstated every weight by the leverage factor (e.g. TSM 6.7% here vs 4.0%
-- everywhere else), so the same position read materially heavier on this
-- surface — a capital-allocation hazard.
--
-- Fix: divide each position's market value by the long-book total (Σ of the
-- held long positions' market value), the canonical basis used by Nexus
-- (vw_nexus_holdings: market_value / sum(market_value) over ()) and the
-- Portfolio holdings table. The position set is unchanged — still the open,
-- non-expired-option positions already resolved in latest_pos.
--
-- Vendor-JSON dates stay on safe_date; the ::numeric casts on price fields are
-- forgiving (numeric never throws on decimal text) and unchanged.

create or replace view public.vw_earnings_calendar as
with latest_pos_snapshot as (
    select distinct on (p.asset_id)
        p.asset_id, p.quantity, p.market_value, p.side, p.as_of_date
    from public.positions p
    join public.assets a_1 on a_1.id = p.asset_id
    where p.as_of_date >= ((select max(positions.as_of_date) - 2 from public.positions))
      and not (
          a_1.asset_class = 'option'
          and a_1.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
          and to_date(substring(a_1.symbol, '(\d{6})[CP]'), 'YYMMDD') < current_date
      )
    order by p.asset_id, p.as_of_date desc
),
latest_pos as (
    select asset_id, quantity, market_value, side, as_of_date
    from latest_pos_snapshot
    where quantity is not null and quantity <> 0
      and (market_value is null or abs(market_value) > 0.01)
),
cached_overview as (
    select ec.symbol, ec.payload, ec.cached_at
    from public.equity_cache ec
    where ec.endpoint = 'overview'
      and ec.expires_at > (now() - interval '24 hours')
),
-- Long market value of the held book = Σ of positive position market values.
-- This is the weight denominator (Σ weights = 100%), matching every other
-- surface; replaces the prior % of account equity basis.
long_book as (
    select sum(market_value) as total_long_mv
    from latest_pos
    where market_value > 0
)
select
    a.symbol,
    a.name,
    a.sector,
    a.asset_class,
    lp.market_value,
    abs(lp.market_value) / nullif(long_book.total_long_mv, 0::numeric) as weight_pct,
    safe_date((co.payload -> 'overview') ->> 'NextEarningsDate')          as earnings_date,
    safe_date((co.payload -> 'overview') ->> 'NextEarningsDate') - current_date as days_to_earnings,
    safe_date((co.payload -> 'overview') ->> 'ExDividendDate')            as ex_div_date,
    ((co.payload -> 'overview') ->> 'AnalystTargetPrice')::numeric        as analyst_target,
    ((co.payload -> 'overview') ->> '52WeekHigh')::numeric                as week52_high,
    ((co.payload -> 'overview') ->> '52WeekLow')::numeric                 as week52_low,
    co.cached_at as data_as_of
from latest_pos lp
join public.assets a on a.id = lp.asset_id
left join cached_overview co on co.symbol = a.symbol
cross join long_book
order by
    case when ((co.payload -> 'overview') ->> 'NextEarningsDate') is not null
         then safe_date((co.payload -> 'overview') ->> 'NextEarningsDate') - current_date
         else 9999
    end,
    abs(lp.market_value) desc;

alter view public.vw_earnings_calendar set (security_invoker = on);
grant select on public.vw_earnings_calendar to anon, authenticated;
