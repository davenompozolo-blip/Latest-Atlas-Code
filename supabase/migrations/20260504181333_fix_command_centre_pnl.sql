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
-- Broker net equity (cash + long MV - margin): authoritative account value
current_nav as (
    select coalesce(
        (select equity from latest_account limit 1),
        (select sum(market_value) from latest_pos)
    ) as nav
),
-- Position-level P&L: how much holdings gained/lost since purchase.
-- Calculated independently of leverage so margin doesn't distort the figure.
pos_pnl as (
    select
        sum(abs(average_cost * quantity))                                   as total_invested,
        sum(
            case when side = 'short'
                then abs(average_cost * quantity) - abs(market_value)
                else market_value - average_cost * quantity
            end
        )                                                                   as unrealised_pnl
    from latest_pos
),
position_count as (select count(*) as n from latest_pos),
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
    pp.total_invested,
    pp.unrealised_pnl,
    case when pp.total_invested > 0
         then pp.unrealised_pnl / pp.total_invested
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
    ai.cash                                                                     as cash_balance,
    ai.buying_power,
    ai.long_mv                                                                  as long_market_value,
    ai.short_mv                                                                 as short_market_value,
    case when cn.nav > 0
         then (ai.long_mv + abs(ai.short_mv)) / cn.nav
    end                                                                         as gross_leverage
from current_nav cn
cross join position_count pc
cross join pos_pnl pp
cross join stats s
cross join max_drawdown md
cross join account_info ai;

alter view public.vw_command_centre set (security_invoker = on);
grant select on public.vw_command_centre to anon, authenticated;
