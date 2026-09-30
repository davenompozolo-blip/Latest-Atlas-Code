-- The bench audits itself. As shipped, this view was an INNER product of
-- vw_position_nav_daily, which is derived entirely from `transactions`. The 12
-- holdings with zero transaction rows (24.1% of book weight, including SNDK
-- and MU) therefore vanished from the contribution waterfall with no trace —
-- the reader saw a complete-looking chart that silently covered 76% of the
-- book. A missing row that looks like an absent contribution is exactly the
-- silent-fallback pattern the Bench exists to eliminate.
--
-- The fix is not to invent history for them. Their contribution is genuinely
-- unmeasurable until transaction sync is repaired: there is no position
-- history to weight a return by. So every holding now gets a row, uncovered
-- names carry NULL contributions plus an explicit coverage_reason, and the
-- view reports what share of the book its NAV denominator actually spans so
-- callers can state the limit rather than imply completeness.
--
-- The denominator deliberately stays the internally-summed NAV rather than
-- account_snapshots.equity: broker snapshots only begin 2026-04-06 while the
-- price series begins 2025-12-29, so swapping would silently truncate three
-- months of contrib_since_entry — trading one silent defect for another.
-- Covered names' contributions are therefore shares of the *covered* book;
-- nav_coverage_pct is what makes that honest rather than hidden.
create or replace view public.vw_bench_contribution as
with daily as (
    select
        v.price_date,
        v.symbol,
        sum(v.position_value) as pos_val,
        max(v.close_price)    as close_price
    from vw_position_nav_daily v
    where v.close_price is not null
      and v.position_value is not null
    group by v.price_date, v.symbol
), nav as (
    select price_date, sum(pos_val) as total_nav
    from daily
    group by price_date
), seq as (
    select
        d.price_date,
        d.symbol,
        d.close_price,
        lag(d.close_price) over (partition by d.symbol order by d.price_date) as prev_close,
        lag(d.pos_val)     over (partition by d.symbol order by d.price_date) as prev_pos_val,
        lag(n.total_nav)   over (partition by d.symbol order by d.price_date) as prev_nav
    from daily d
    join nav n on n.price_date = d.price_date
), contrib as (
    select
        price_date,
        symbol,
        (close_price / prev_close - 1::numeric) * (prev_pos_val / prev_nav) * 100::numeric as contrib_pct
    from seq
    where prev_close > 0::numeric
      and prev_nav   > 0::numeric
      and prev_pos_val is not null
), last_day as (
    -- Excludes calendar rows carrying no close, which otherwise pinned
    -- contrib_today to a priceless day and reported 0.000 for every name.
    select max(price_date) as d from contrib where contrib_pct is not null
), agg as (
    select
        symbol,
        round(coalesce(sum(contrib_pct) filter (where price_date = (select d from last_day)), 0::numeric), 3) as contrib_today,
        round(sum(contrib_pct) filter (where price_date >= date_trunc('year', current_date::timestamptz)::date), 3) as contrib_ytd,
        round(sum(contrib_pct), 3) as contrib_since_entry,
        min(price_date) as series_start,
        max(price_date) as series_end,
        count(*)        as observations
    from contrib
    where contrib_pct is not null
    group by symbol
), coverage as (
    -- Share of current book weight the NAV denominator actually spans.
    select round(
        100.0 * sum(h.weight_pct) filter (where a.symbol is not null)
              / nullif(sum(h.weight_pct), 0), 2) as nav_coverage_pct
    from vw_nexus_holdings h
    left join agg a on a.symbol = h.symbol
)
select
    h.symbol,
    a.contrib_today,
    a.contrib_ytd,
    a.contrib_since_entry,
    a.series_start,
    a.series_end,
    coalesce(a.observations, 0) as observations,
    (a.symbol is not null)      as covered,
    case
        when a.symbol is not null then null::text
        when not exists (
            select 1 from transactions t
            join assets s on s.id = t.asset_id
            where s.symbol = h.symbol
        ) then 'no_transaction_history'
        else 'no_priced_position_days'
    end                         as coverage_reason,
    h.weight_pct                as actual_weight_pct,
    cv.nav_coverage_pct
from vw_nexus_holdings h
left join agg a on a.symbol = h.symbol
cross join coverage cv;

grant select on public.vw_bench_contribution to anon, authenticated;
