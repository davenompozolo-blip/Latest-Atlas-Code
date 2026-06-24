-- ER-10 (QA audit): the Portfolio page showed Unrealised P&L = -$2,476 while
-- Nexus showed +$2,665 — same label, opposite sign, read seconds apart. A
-- capital-allocation hazard: one surface says the book is up, the other down.
--
-- Root cause: vw_command_centre's latest_pos CTE took the latest snapshot per
-- asset across ALL history with no quantity/recency filter, so 13 closed /
-- phantom positions (whose last stored row still carried a stale non-zero
-- quantity) leaked into pos_pnl. That inflated total_invested to $164,640
-- (true open-position cost $141,490) and flipped unrealised_pnl negative.
-- position_count already filtered these out — pos_pnl and total_invested did
-- not, so the headline P&L and the count disagreed about which positions exist.
--
-- Fix: filter latest_pos to currently-open positions (quantity <> 0 and a
-- snapshot within the last 7 days), the same set position_count uses. With it,
-- total_invested = $141,490 and unrealised_pnl = +$2,451 (+1.73%), matching the
-- broker truth Σ(market_value - quantity*average_cost) and agreeing in sign and
-- magnitude with Nexus. Only the latest_pos CTE changes; everything downstream
-- (pos_pnl, position_count, the current_nav fallback) inherits the clean set.

create or replace view public.vw_command_centre as
 with latest_account as (
         select distinct on (account_snapshots.portfolio_id) account_snapshots.portfolio_id,
            account_snapshots.equity,
            account_snapshots.cash,
            account_snapshots.buying_power,
            account_snapshots.long_market_value,
            account_snapshots.short_market_value
           from account_snapshots
          order by account_snapshots.portfolio_id, account_snapshots.as_of desc
        ), latest_pos_all as (
         select distinct on (positions.asset_id) positions.asset_id,
            positions.quantity,
            positions.average_cost,
            positions.market_value,
            positions.as_of_date,
            positions.side
           from positions
          order by positions.asset_id, positions.as_of_date desc
        ), latest_pos as (
         select latest_pos_all.asset_id,
            latest_pos_all.quantity,
            latest_pos_all.average_cost,
            latest_pos_all.market_value,
            latest_pos_all.as_of_date,
            latest_pos_all.side
           from latest_pos_all
          where latest_pos_all.quantity <> 0::numeric
            and latest_pos_all.as_of_date >= ((select max(p2.as_of_date) from positions p2) - 7)
        ), nav_returns as (
         select vw_portfolio_nav_daily.daily_return
           from vw_portfolio_nav_daily
          where vw_portfolio_nav_daily.daily_return is not null
        ), stats as (
         select count(*) as trading_days,
            avg(nav_returns.daily_return) as mu,
            stddev(nav_returns.daily_return) as sigma,
            stddev(nav_returns.daily_return) filter (where nav_returns.daily_return < 0::numeric) as downside_sigma,
            percentile_cont(0.05::double precision) within group (order by (nav_returns.daily_return::double precision)) as var_95_daily
           from nav_returns
        ), portfolio_nav_series as (
         select vw_portfolio_nav_daily.price_date,
            sum(vw_portfolio_nav_daily.nav) as nav
           from vw_portfolio_nav_daily
          group by vw_portfolio_nav_daily.price_date
        ), running_peak as (
         select portfolio_nav_series.price_date,
            portfolio_nav_series.nav,
            max(portfolio_nav_series.nav) over (order by portfolio_nav_series.price_date rows between unbounded preceding and current row) as peak_nav
           from portfolio_nav_series
        ), max_drawdown as (
         select min(running_peak.nav / nullif(running_peak.peak_nav, 0::numeric) - 1::numeric) as dd
           from running_peak
        ), current_nav as (
         select coalesce(( select latest_account.equity
                   from latest_account
                 limit 1), ( select sum(latest_pos.market_value) as sum
                   from latest_pos)) as nav
        ), pos_pnl as (
         select sum(abs(latest_pos.average_cost * latest_pos.quantity)) as total_invested,
            sum(
                case
                    when latest_pos.side = 'short'::text then abs(latest_pos.average_cost * latest_pos.quantity) - abs(latest_pos.market_value)
                    else latest_pos.market_value - latest_pos.average_cost * latest_pos.quantity
                end) as unrealised_pnl
           from latest_pos
        ), position_count as (
         select count(*) as n
           from latest_pos
        ), account_info as (
         select coalesce(( select latest_account.cash
                   from latest_account
                 limit 1), 0::numeric) as cash,
            coalesce(( select latest_account.buying_power
                   from latest_account
                 limit 1), 0::numeric) as buying_power,
            coalesce(( select latest_account.long_market_value
                   from latest_account
                 limit 1), 0::numeric) as long_mv,
            coalesce(( select latest_account.short_market_value
                   from latest_account
                 limit 1), 0::numeric) as short_mv
           from ( select 1 as "?column?") x
        )
 select cn.nav as portfolio_nav,
    pc.n as position_count,
    pp.total_invested,
    pp.unrealised_pnl,
        case
            when pp.total_invested > 0::numeric then pp.unrealised_pnl / pp.total_invested
            else null::numeric
        end as unrealised_return_pct,
    s.trading_days,
    s.mu as mean_daily_return,
    s.sigma as daily_volatility,
        case
            when s.sigma > 0::numeric then (s.mu / s.sigma)::double precision * sqrt(252::double precision)
            else null::double precision
        end as sharpe_ratio,
        case
            when s.sigma > 0::numeric then (s.mu / s.sigma)::double precision * sqrt(252::double precision)
            else null::double precision
        end as sharpe_annualised,
        case
            when s.downside_sigma > 0::numeric then (s.mu / s.downside_sigma)::double precision * sqrt(252::double precision)
            else null::double precision
        end as sortino_annualised,
    s.var_95_daily as var_95_daily_return,
        case
            when cn.nav is not null then cn.nav::double precision * s.var_95_daily
            else null::double precision
        end as var_95_daily_dollar,
    md.dd as drawdown_pct,
    md.dd as max_drawdown,
    ai.cash as cash_balance,
    ai.buying_power,
    ai.long_mv as long_market_value,
    ai.short_mv as short_market_value,
        case
            when cn.nav > 0::numeric then (ai.long_mv + abs(ai.short_mv)) / cn.nav
            else null::numeric
        end as gross_leverage
   from current_nav cn
     cross join position_count pc
     cross join pos_pnl pp
     cross join stats s
     cross join max_drawdown md
     cross join account_info ai;
