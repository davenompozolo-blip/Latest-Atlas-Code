-- ---------------------------------------------------------------------------
-- 20260425000001_nav_from_equity_curve.sql
--
-- Root cause: vw_portfolio_nav_daily was built from position × price_history.
-- That approach only counted the mark-to-market value of equity holdings and
-- missed every dollar that wasn't in an open position:
--
--   • Cash (realised gains sitting uninvested, deposits, dividends)
--   • Capital inflows / outflows that change the investment base
--
-- Alpaca's /v2/account/portfolio/history endpoint returns the full account
-- equity  (long_market_value + short_market_value + cash) — exactly what
-- shows on the Alpaca dashboard.  That data is already landing in
-- public.portfolio_equity_curve (synced nightly from the Edge Function).
--
-- This migration replaces vw_portfolio_nav_daily to read directly from
-- portfolio_equity_curve, making ATLAS's performance history match Alpaca
-- exactly.  vw_position_nav_daily is left intact; it continues to power
-- position-level attribution.
--
-- Also corrects field name aliases in vw_command_centre so the React
-- frontend's cmd.sharpe_ratio / cmd.drawdown_pct lookups resolve.
-- ---------------------------------------------------------------------------

drop view if exists public.vw_command_centre      cascade;
drop view if exists public.vw_portfolio_nav_daily cascade;

-- ---------------------------------------------------------------------------
-- vw_portfolio_nav_daily
-- One row per (portfolio_id, calendar_date).
-- Source: portfolio_equity_curve  (Alpaca account equity — the broker's own
--         P&L series, identical to what the Alpaca dashboard displays).
-- ---------------------------------------------------------------------------
create view public.vw_portfolio_nav_daily as
with daily_equity as (
    -- DISTINCT ON guards against any duplicate day rows (shouldn't occur for
    -- timeframe='1D' but protects the daily_return window function below).
    select distinct on (portfolio_id, ts::date)
        portfolio_id,
        ts::date  as price_date,
        equity
    from public.portfolio_equity_curve
    where timeframe  = '1D'
      and equity     is not null
      and equity     > 0
    order by portfolio_id, ts::date, ts desc
)
select
    portfolio_id,
    price_date,
    equity                                                                      as nav,
    -- daily_return: simple day-over-day equity change (consistent with
    -- what perf-engine.js computes when the field is null, so either works).
    (equity - lag(equity) over (partition by portfolio_id order by price_date))
        / nullif(lag(equity) over (partition by portfolio_id order by price_date), 0)
                                                                                as daily_return,
    -- position_count not available from the equity curve; set null so
    -- downstream queries that GROUP BY it are unaffected.
    null::integer                                                               as position_count
from daily_equity
order by portfolio_id, price_date;

-- ---------------------------------------------------------------------------
-- vw_command_centre
-- Same business logic as before; field aliases corrected so the React client
-- can read cmd.sharpe_ratio and cmd.drawdown_pct directly.
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
current_nav    as (select sum(market_value) as nav            from latest_pos),
position_count as (select count(*)          as n              from latest_pos),
total_cost     as (select sum(average_cost * quantity) as total_invested from latest_pos)
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
    -- Aliases match what React reads (cmd.sharpe_ratio / cmd.drawdown_pct)
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
    md.dd                                                                       as max_drawdown
from current_nav cn
cross join position_count pc
cross join total_cost tc
cross join stats s
cross join max_drawdown md;

-- ---------------------------------------------------------------------------
-- Security & grants — same as before
-- ---------------------------------------------------------------------------
alter view public.vw_portfolio_nav_daily set (security_invoker = on);
alter view public.vw_command_centre      set (security_invoker = on);

grant select on public.vw_portfolio_nav_daily to anon, authenticated;
grant select on public.vw_command_centre      to anon, authenticated;
