-- ---------------------------------------------------------------------------
-- 20260504000000_fix_command_centre_nav.sql
--
-- Regression fix: migration 20260425000001_nav_from_equity_curve.sql
-- correctly rebuilt vw_portfolio_nav_daily from the Alpaca equity curve but
-- accidentally reverted vw_command_centre.portfolio_nav back to a raw
-- sum(market_value) from the positions table.  That figure is gross long
-- market exposure and ignores:
--
--   • Cash on hand
--   • Margin borrowed to fund the positions
--
-- This means the top-bar NAV overstates account equity by the margin
-- liability (≈ $32 K on the live account).
--
-- Fix: restore account_snapshots.equity (the broker's own equity figure,
-- identical to what the Alpaca dashboard displays) as the source of
-- portfolio_nav, with sum(market_value) as a fallback for accounts that
-- have no snapshot rows yet.  This matches the logic that migration
-- 20260406000000_side_cash_leverage.sql had originally established.
-- ---------------------------------------------------------------------------

drop view if exists public.vw_command_centre cascade;

create view public.vw_command_centre as
with latest_account as (
    select distinct on (portfolio_id)
        portfolio_id, equity, cash, buying_power,
        long_market_value, short_market_value
    from public.account_snapshots
    order by portfolio_id, as_of desc
),
latest_pos as (
    select distinct on (asset_id)
        asset_id, quantity, average_cost, market_value, as_of_date, side
    from public.positions
    order by asset_id, as_of_date desc
),
nav_returns as (
    select daily_return
    from public.vw_portfolio_nav_daily
    where daily_return is not null
),
stats as (
    select
        count(*)                                                        as trading_days,
        avg(daily_return)                                               as mu,
        stddev(daily_return)                                            as sigma,
        stddev(daily_return) filter (where daily_return < 0)            as downside_sigma,
        percentile_cont(0.05) within group (order by daily_return)      as var_95_daily
    from nav_returns
),
portfolio_nav_series as (
    select price_date, sum(nav) as nav
    from public.vw_portfolio_nav_daily
    group by price_date
),
running_peak as (
    select
        price_date,
        nav,
        max(nav) over (
            order by price_date
            rows between unbounded preceding and current row
        ) as peak_nav
    from portfolio_nav_series
),
max_drawdown as (
    select min(nav / nullif(peak_nav, 0) - 1) as dd
    from running_peak
),
-- Use broker equity as NAV (includes cash + longs - margin).
-- Fall back to sum(market_value) only when no account snapshot exists.
current_nav as (
    select coalesce(
        (select equity from latest_account limit 1),
        (select sum(market_value) from latest_pos)
    ) as nav
),
position_count as (select count(*) as n from latest_pos),
total_cost as (
    select sum(abs(average_cost * quantity)) as total_invested from latest_pos
),
account_info as (
    select
        coalesce((select cash               from latest_account limit 1), 0) as cash,
        coalesce((select buying_power       from latest_account limit 1), 0) as buying_power,
        coalesce((select long_market_value  from latest_account limit 1), 0) as long_mv,
        coalesce((select short_market_value from latest_account limit 1), 0) as short_mv
    from (select 1) x
)
select
    cn.nav                                                                      as portfolio_nav,
    pc.n                                                                        as position_count,
    tc.total_invested,
    cn.nav - tc.total_invested                                                  as unrealised_pnl,
    case when tc.total_invested > 0
         then (cn.nav - tc.total_invested) / tc.total_invested
    end                                                                         as unrealised_return_pct,
    s.trading_days,
    s.mu                                                                        as mean_daily_return,
    s.sigma                                                                     as daily_volatility,
    case when s.sigma > 0
         then (s.mu / s.sigma) * sqrt(252)
    end                                                                         as sharpe_ratio,
    case when s.sigma > 0
         then (s.mu / s.sigma) * sqrt(252)
    end                                                                         as sharpe_annualised,
    case when s.downside_sigma > 0
         then (s.mu / s.downside_sigma) * sqrt(252)
    end                                                                         as sortino_annualised,
    s.var_95_daily                                                              as var_95_daily_return,
    case when cn.nav is not null then cn.nav * s.var_95_daily end               as var_95_daily_dollar,
    md.dd                                                                       as drawdown_pct,
    md.dd                                                                       as max_drawdown,
    -- Account-level breakdown for header cards
    ai.cash                                                                     as cash_balance,
    ai.buying_power,
    ai.long_mv                                                                  as long_market_value,
    ai.short_mv                                                                 as short_market_value,
    case when cn.nav > 0
         then (ai.long_mv + abs(ai.short_mv)) / cn.nav
    end                                                                         as gross_leverage
from current_nav cn
cross join position_count pc
cross join total_cost tc
cross join stats s
cross join max_drawdown md
cross join account_info ai;

-- ---------------------------------------------------------------------------
-- Security & grants
-- ---------------------------------------------------------------------------
alter view public.vw_command_centre set (security_invoker = on);

grant select on public.vw_command_centre to anon, authenticated;
