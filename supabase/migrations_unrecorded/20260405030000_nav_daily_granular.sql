-- ---------------------------------------------------------------------------
-- 20260405030000_nav_daily_granular.sql
--
-- Rebuild the FIFO NAV reconstruction layer so it carries portfolio_id,
-- asset_id, symbol, quantity, close_price and position_value — the actual
-- inputs needed to drive Atlas time-series and attribution charts.
--
-- Layering:
--   vw_position_nav_daily   : one row per (portfolio_id, asset_id, date)
--                             — shares held, close price, position value.
--   vw_portfolio_nav_daily  : aggregate of the above per (portfolio_id, date)
--                             — nav, daily_return, position_count.
--   vw_command_centre       : unchanged shape, re-created against new view.
--
-- vw_command_centre depends on vw_portfolio_nav_daily, so we drop it first.
-- ---------------------------------------------------------------------------

drop view if exists public.vw_command_centre cascade;
drop view if exists public.vw_portfolio_nav_daily cascade;
drop view if exists public.vw_position_nav_daily  cascade;

-- ---------------------------------------------------------------------------
-- vw_position_nav_daily
-- Granular FIFO holdings ledger, valued at daily close.
-- ---------------------------------------------------------------------------
create view public.vw_position_nav_daily as
with signed_transactions as (
    select
        t.portfolio_id,
        t.asset_id,
        t.transaction_date::date as tx_date,
        case
            when lower(t.transaction_type) in ('buy','bto','bot','bought','purchase') then  abs(t.quantity)
            when lower(t.transaction_type) in ('sell','sto','sld','sold','sale')      then -abs(t.quantity)
            -- Alpaca FILL activities arrive with signed quantity already.
            when lower(t.transaction_type) = 'fill' then t.quantity
            else 0
        end as signed_qty
    from public.transactions t
    join public.assets a on a.id = t.asset_id
    where a.symbol <> '$CASH'
),
daily_net as (
    select
        portfolio_id,
        asset_id,
        tx_date,
        sum(signed_qty) as net_qty
    from signed_transactions
    group by portfolio_id, asset_id, tx_date
),
cumulative_holdings as (
    select
        portfolio_id,
        asset_id,
        tx_date,
        sum(net_qty) over (
            partition by portfolio_id, asset_id
            order by tx_date
            rows between unbounded preceding and current row
        ) as running_qty
    from daily_net
),
-- Per (portfolio, asset) lifecycle window: first buy through today.
asset_lifespan as (
    select
        portfolio_id,
        asset_id,
        min(tx_date) as start_date
    from cumulative_holdings
    where running_qty > 0
    group by portfolio_id, asset_id
),
trading_days as (
    select distinct price_date::date as cal_date
    from public.price_history
    where interval = '1d'
),
-- Build the (portfolio, asset, day) grid only for dates in each asset's life.
holdings_grid as (
    select
        al.portfolio_id,
        al.asset_id,
        td.cal_date
    from asset_lifespan al
    join trading_days td
      on td.cal_date >= al.start_date
     and td.cal_date <= current_date
),
-- Forward-fill running quantity onto every trading day in the grid.
daily_holdings as (
    select
        hg.portfolio_id,
        hg.asset_id,
        hg.cal_date,
        (
            select ch.running_qty
            from cumulative_holdings ch
            where ch.portfolio_id = hg.portfolio_id
              and ch.asset_id     = hg.asset_id
              and ch.tx_date     <= hg.cal_date
            order by ch.tx_date desc
            limit 1
        ) as quantity
    from holdings_grid hg
)
select
    dh.portfolio_id,
    dh.asset_id,
    a.symbol,
    a.asset_class,
    dh.cal_date                                  as price_date,
    coalesce(dh.quantity, 0)                     as quantity,
    ph.close                                     as close_price,
    coalesce(dh.quantity, 0) * ph.close          as position_value
from daily_holdings dh
join public.assets a
  on a.id = dh.asset_id
left join public.price_history ph
  on ph.asset_id     = dh.asset_id
 and ph.price_date::date = dh.cal_date
 and ph.interval     = '1d'
where coalesce(dh.quantity, 0) > 0;

-- ---------------------------------------------------------------------------
-- vw_portfolio_nav_daily
-- Portfolio-level aggregation of the granular position view.
-- ---------------------------------------------------------------------------
create view public.vw_portfolio_nav_daily as
with daily_nav as (
    select
        portfolio_id,
        price_date,
        sum(position_value)                              as nav,
        count(*) filter (where position_value is not null) as position_count
    from public.vw_position_nav_daily
    group by portfolio_id, price_date
    having sum(position_value) > 0
)
select
    portfolio_id,
    price_date,
    nav,
    position_count,
    (nav - lag(nav) over (partition by portfolio_id order by price_date))
        / nullif(lag(nav) over (partition by portfolio_id order by price_date), 0)
        as daily_return
from daily_nav
order by portfolio_id, price_date;

-- ---------------------------------------------------------------------------
-- vw_command_centre
-- Same output shape as before — re-created against the new nav view.
-- Metrics are computed across all portfolios collapsed (single-portfolio
-- deployments today). When multi-portfolio lands, replace with a GROUP BY.
-- ---------------------------------------------------------------------------
create view public.vw_command_centre as
with latest_pos as (
    select distinct on (asset_id)
        asset_id, quantity, average_cost, market_value, as_of_date
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
        max(nav) over (order by price_date
                       rows between unbounded preceding and current row) as peak_nav
    from portfolio_nav_series
),
max_drawdown as (
    select min(nav / nullif(peak_nav, 0) - 1) as dd
    from running_peak
),
current_nav as (
    select sum(market_value) as nav from latest_pos
),
position_count as (
    select count(*) as n from latest_pos
),
total_cost as (
    select sum(average_cost * quantity) as total_invested from latest_pos
)
select
    cn.nav                                                                    as portfolio_nav,
    pc.n                                                                      as position_count,
    tc.total_invested,
    cn.nav - tc.total_invested                                                as unrealised_pnl,
    case when tc.total_invested > 0
         then (cn.nav - tc.total_invested) / tc.total_invested
         else null end                                                        as unrealised_return_pct,
    s.trading_days,
    s.mu                                                                      as mean_daily_return,
    s.sigma                                                                   as daily_volatility,
    case when s.sigma > 0          then (s.mu / s.sigma)          * sqrt(252) end as sharpe_annualised,
    case when s.downside_sigma > 0 then (s.mu / s.downside_sigma) * sqrt(252) end as sortino_annualised,
    s.var_95_daily                                                            as var_95_daily_return,
    case when cn.nav is not null then cn.nav * s.var_95_daily end             as var_95_daily_dollar,
    md.dd                                                                     as max_drawdown
from current_nav cn
cross join position_count pc
cross join total_cost tc
cross join stats s
cross join max_drawdown md;

-- ---------------------------------------------------------------------------
-- Security-invoker so RLS on underlying tables (transactions, positions,
-- price_history) applies when the React client queries via anon key.
-- ---------------------------------------------------------------------------
alter view public.vw_position_nav_daily  set (security_invoker = on);
alter view public.vw_portfolio_nav_daily set (security_invoker = on);
alter view public.vw_command_centre      set (security_invoker = on);

grant select on public.vw_position_nav_daily  to anon, authenticated;
grant select on public.vw_portfolio_nav_daily to anon, authenticated;
grant select on public.vw_command_centre      to anon, authenticated;
