-- ---------------------------------------------------------------------------
-- 20260412010000_fix_pnl_sectors_filter.sql
--
-- Fixes three critical issues:
--
-- 1. P&L CALCULATION: unrealised_pnl = current_equity - initial_equity
--    (not current_equity - total_cost_basis, which is wrong under leverage).
--    Initial equity sourced from earliest account_snapshot, fallback 100000
--    (Alpaca paper trading default).
--
-- 2. EXPIRED OPTIONS: Filter out OCC options past their expiry date and
--    stale positions not updated in the last 7 days.
--
-- 3. SECTOR COLUMN: Add sector to assets table for sector attribution.
--    Populated by the enrich_assets Edge Function; static fallback mapping
--    included here for common tickers.
-- ---------------------------------------------------------------------------

-- ── 1. Add sector column ───────────────────────────────────────────────────

alter table public.assets add column if not exists sector text;

-- Static GICS mapping for common tickers (Edge Function will overwrite with
-- more accurate data; this ensures basic coverage immediately)
do $$
begin
  -- Technology
  update public.assets set sector = 'Technology' where sector is null and symbol in ('AAPL','MSFT','NVDA','GOOGL','GOOG','META','AVGO','ORCL','CSCO','CRM','ADBE','AMD','INTC','BIDU','PLTR','SNOW','QCOM','TXN','AMAT','MU','NOW','PANW','SNPS','CDNS','NXPI','MRVL','FTNT','CRWD','ZS','NET','DDOG','SHOP','UBER','COIN','NPSNY','PROSY');
  -- Healthcare
  update public.assets set sector = 'Healthcare' where sector is null and symbol in ('JNJ','UNH','PFE','ABT','MRK','TMO','GILD','AHR','AMGN','LLY','BMY','ABBV','ISRG','DHR','SYK','REGN','VRTX','ZTS','MRNA','CI','ELV','HCA','BSX','MDT');
  -- Financials
  update public.assets set sector = 'Financials' where sector is null and symbol in ('JPM','BAC','WFC','GS','MS','BLK','SCHW','C','AXP','PNC','USB','TFC','SPGI','ICE','CME','AON','MMC','CB','PGR','MET');
  -- Energy
  update public.assets set sector = 'Energy' where sector is null and symbol in ('XOM','CVX','COP','SLB','HAL','OXY','PBR','EOG','MPC','VLO','PSX','DVN','HES','BKR','FANG','KMI');
  -- Consumer Discretionary
  update public.assets set sector = 'Consumer Discretionary' where sector is null and symbol in ('AMZN','TSLA','HD','TGT','NKE','SBUX','MCD','BKNG','TJX','LOW','MAR','ABNB','GM','F','LULU','ROST','DHI','LEN','CMG','ORLY','YUM','DPZ','EBAY');
  -- Consumer Staples
  update public.assets set sector = 'Consumer Staples' where sector is null and symbol in ('WMT','PG','COST','KO','PEP','MDLZ','CL','PM','MO','GIS','K','SJM');
  -- Industrials
  update public.assets set sector = 'Industrials' where sector is null and symbol in ('CAT','HON','UPS','BA','RTX','DE','GE','MMM','UNP','LMT','NOC','GD','WM','EMR','ETN','ITW','FDX','DAL','AAL','UAL','SGRP');
  -- Real Estate
  update public.assets set sector = 'Real Estate' where sector is null and symbol in ('XLRE','AMT','PLD','EQIX','SPG','O','DLR','WELL','PSA','CCI','VICI');
  -- Materials / Mining
  update public.assets set sector = 'Materials' where sector is null and symbol in ('LIN','APD','SHW','FCX','NEM','GOLD','HMY','NUE','ECL','DOW');
  -- Communication Services
  update public.assets set sector = 'Communication' where sector is null and symbol in ('VZ','T','CMCSA','DIS','NFLX','TMUS','EA','TTWO');
  -- Utilities
  update public.assets set sector = 'Utilities' where sector is null and symbol in ('NEE','DUK','SO','D','AEP','EXC','SRE','XEL');
  -- ETFs
  update public.assets set sector = 'ETFs' where sector is null and symbol in ('SPY','QQQ','IWM','DIA','VTI','VOO','IBIE','IVV','VEA','VWO','AGG','BND','TLT','EFA','EEM','XLF','XLK','XLE','XLV','XLI','XLP','XLY','XLU','XLB','GDX');
  -- Options: anything matching OCC pattern
  update public.assets set sector = 'Options'
    where sector is null
      and symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$';
  -- Anything still null: Unknown
  update public.assets set sector = 'Other'
    where sector is null and asset_class = 'equity';
end $$;

-- ── 2. Rebuild vw_portfolio_home ───────────────────────────────────────────
--    Changes: + sector column, + expired option filter, + stale position filter

drop view if exists public.vw_portfolio_home cascade;

create view public.vw_portfolio_home as
with latest_pos as (
    select distinct on (p.asset_id)
        p.asset_id, p.quantity, p.average_cost, p.market_value, p.as_of_date, p.side
    from public.positions p
    join public.assets a on a.id = p.asset_id
    where p.quantity <> 0
      -- Filter stale positions (not updated in last 7 days)
      and p.as_of_date >= (select max(as_of_date) - 7 from public.positions)
      -- Filter expired OCC options
      and not (
          a.asset_class = 'option'
          and a.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
          and to_date(substring(a.symbol from '(\d{6})[CP]'), 'YYMMDD') < current_date
      )
    order by p.asset_id, p.as_of_date desc
),
ranked_prices as (
    select asset_id, close, price_date,
        row_number() over (partition by asset_id order by price_date desc) as rn
    from public.price_history
    where interval = '1d'
),
latest_prices as (
    select asset_id, close as current_price, price_date
    from ranked_prices where rn = 1
),
prev_day_prices as (
    select asset_id, close as prev_close
    from ranked_prices where rn = 2
),
five_day_prices as (
    select asset_id, close as close_5d
    from ranked_prices where rn = 6
),
latest_account as (
    select distinct on (portfolio_id)
        portfolio_id, equity, cash, buying_power,
        long_market_value, short_market_value
    from public.account_snapshots
    order by portfolio_id, as_of desc
),
returns as (
    select ph.asset_id,
        (ph.close - lag(ph.close) over (partition by ph.asset_id order by ph.price_date))
            / nullif(lag(ph.close) over (partition by ph.asset_id order by ph.price_date), 0)
        as daily_return
    from public.price_history ph
    where ph.interval = '1d'
),
stats as (
    select asset_id,
        count(*) as trading_days,
        avg(daily_return) as mu,
        stddev(daily_return) as sigma
    from returns
    where daily_return is not null
    group by asset_id
),
nav as (
    select coalesce(
        (select equity from latest_account limit 1),
        (select sum(market_value) from latest_pos)
    ) as total_nav,
    (select cash from latest_account limit 1)                  as cash_balance,
    (select buying_power from latest_account limit 1)          as buying_power,
    (select long_market_value from latest_account limit 1)     as long_mv,
    (select short_market_value from latest_account limit 1)    as short_mv
),
hhi as (
    select
        sum(power(abs(market_value) / nullif((select total_nav from nav), 0), 2)) as hhi_score,
        count(*) as n_positions
    from latest_pos
)
select
    a.symbol,
    a.name,
    a.asset_class,
    a.sector,
    p.side,
    case when p.side = 'short' then -abs(p.quantity) else p.quantity end as quantity,
    p.average_cost                                         as cost_basis,
    lp.current_price,
    p.market_value,
    -- Daily change %
    case when pdp.prev_close is not null and pdp.prev_close > 0
         then (lp.current_price - pdp.prev_close) / pdp.prev_close
    end                                                    as daily_change_pct,
    -- 5-day return %
    case when fdp.close_5d is not null and fdp.close_5d > 0
         then (lp.current_price - fdp.close_5d) / fdp.close_5d
    end                                                    as return_5d_pct,
    -- Total gain/loss $ (side-aware)
    case when p.side = 'short'
         then (p.average_cost - lp.current_price) * abs(p.quantity)
         else (lp.current_price - p.average_cost) * abs(p.quantity)
    end                                                    as total_gain_loss_dollar,
    -- Weight % of equity
    abs(p.market_value) / nullif(nav.total_nav, 0)         as weight_equity_pct,
    -- Weight % of gross exposure
    abs(p.market_value) / nullif(
        coalesce(nav.long_mv, 0) + abs(coalesce(nav.short_mv, 0)), 0
    )                                                      as weight_gross_pct,
    -- Quality score (0-100 composite)
    greatest(0, least(100, round(
        30.0 * least(1.0, greatest(0.0,
            coalesce(s.mu / nullif(s.sigma, 0) * sqrt(252.0), 0) / 2.0))
        + 20.0 * greatest(0.0, 1.0 - least(1.0, coalesce(s.sigma * sqrt(252.0), 0.5) / 0.5))
        + 30.0 * least(1.0, greatest(0.0,
            (coalesce(
                case when p.side = 'short'
                     then (p.average_cost - lp.current_price) / nullif(p.average_cost, 0)
                     else (lp.current_price - p.average_cost) / nullif(p.average_cost, 0)
                end, 0) + 0.10) / 0.30))
        + case when abs(p.market_value) / nullif(nav.total_nav, 0) > 0.10
               then 6.0 else 20.0 end
    )))                                                    as quality_score,
    -- Legacy columns
    case when p.side = 'short'
         then (p.average_cost - lp.current_price) / nullif(p.average_cost, 0)
         else (lp.current_price - p.average_cost) / nullif(p.average_cost, 0)
    end                                                    as unrealised_return_pct,
    abs(p.market_value) / nullif(nav.total_nav, 0)         as portfolio_weight,
    s.sigma * sqrt(252)                                    as annualised_vol,
    s.mu / nullif(s.sigma, 0) * sqrt(252)                  as sharpe_approx,
    h.hhi_score,
    h.n_positions,
    case when abs(p.market_value) / nullif(nav.total_nav, 0) > 0.10
         then true else false end                          as is_concentrated,
    lp.price_date,
    nav.total_nav        as portfolio_nav,
    nav.cash_balance,
    nav.buying_power,
    nav.long_mv          as long_market_value,
    nav.short_mv         as short_market_value
from latest_pos p
join public.assets a      on a.id = p.asset_id
left join latest_prices lp    on lp.asset_id = p.asset_id
left join prev_day_prices pdp on pdp.asset_id = p.asset_id
left join five_day_prices fdp on fdp.asset_id = p.asset_id
left join stats s             on s.asset_id = p.asset_id
cross join nav
cross join hhi h
order by abs(p.market_value) desc nulls last;

-- ── 3. Rebuild vw_command_centre — equity-based P&L ────────────────────────

drop view if exists public.vw_command_centre cascade;

create view public.vw_command_centre as
with latest_account as (
    select distinct on (portfolio_id)
        portfolio_id, equity, cash, buying_power, portfolio_value,
        long_market_value, short_market_value
    from public.account_snapshots
    order by portfolio_id, as_of desc
),
-- Initial equity: earliest account snapshot, fallback to Alpaca paper default
initial_equity_ref as (
    select coalesce(
        (select equity from public.account_snapshots order by as_of asc limit 1),
        100000.0
    ) as initial_eq
),
latest_pos as (
    select distinct on (p.asset_id)
        p.asset_id, p.quantity, p.average_cost, p.market_value, p.as_of_date, p.side
    from public.positions p
    join public.assets a on a.id = p.asset_id
    where p.quantity <> 0
      and p.as_of_date >= (select max(as_of_date) - 7 from public.positions)
      and not (
          a.asset_class = 'option'
          and a.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
          and to_date(substring(a.symbol from '(\d{6})[CP]'), 'YYMMDD') < current_date
      )
    order by p.asset_id, p.as_of_date desc
),
nav_returns as (
    select daily_return from public.vw_portfolio_nav_daily where daily_return is not null
),
stats as (
    select
        count(*)                                                   as trading_days,
        avg(daily_return)                                          as mu,
        stddev(daily_return)                                       as sigma,
        stddev(daily_return) filter (where daily_return < 0)       as downside_sigma,
        percentile_cont(0.05) within group (order by daily_return) as var_95_daily
    from nav_returns
),
portfolio_nav_series as (
    select price_date, sum(nav) as nav
    from public.vw_portfolio_nav_daily
    group by price_date
),
running_peak as (
    select price_date, nav,
           max(nav) over (order by price_date
                          rows between unbounded preceding and current row) as peak_nav
    from portfolio_nav_series
),
max_drawdown as (
    select min(nav / nullif(peak_nav, 0) - 1) as dd from running_peak
),
current_nav as (
    select coalesce(
        (select equity from latest_account limit 1),
        (select sum(market_value) from latest_pos)
    ) as nav
),
position_count as (select count(*) as n from latest_pos),
total_cost as (select sum(abs(average_cost * quantity)) as total_invested from latest_pos),
account_info as (
    select
        coalesce((select cash from latest_account limit 1), 0)                  as cash,
        coalesce((select buying_power from latest_account limit 1), 0)          as buying_power,
        coalesce((select long_market_value from latest_account limit 1), 0)     as long_mv,
        coalesce((select short_market_value from latest_account limit 1), 0)    as short_mv
    from (select 1) x
)
select
    cn.nav                                                               as portfolio_nav,
    pc.n                                                                 as position_count,
    -- Keep total_invested (cost basis) for reference
    tc.total_invested,
    -- Equity-based P&L: current equity - initial equity
    ie.initial_eq                                                        as initial_equity,
    cn.nav - ie.initial_eq                                               as unrealised_pnl,
    case when ie.initial_eq > 0
         then (cn.nav - ie.initial_eq) / ie.initial_eq end              as unrealised_return_pct,
    s.trading_days,
    s.mu                                                                 as mean_daily_return,
    s.sigma                                                              as daily_volatility,
    case when s.sigma > 0          then (s.mu / s.sigma)          * sqrt(252) end as sharpe_annualised,
    case when s.downside_sigma > 0 then (s.mu / s.downside_sigma) * sqrt(252) end as sortino_annualised,
    s.var_95_daily                                                       as var_95_daily_return,
    case when cn.nav is not null then cn.nav * s.var_95_daily end        as var_95_daily_dollar,
    md.dd                                                                as max_drawdown,
    -- Account fields
    ai.cash                                                              as cash_balance,
    ai.buying_power,
    ai.long_mv                                                           as long_market_value,
    ai.short_mv                                                          as short_market_value,
    case when cn.nav > 0
         then (ai.long_mv + abs(ai.short_mv)) / cn.nav end              as gross_leverage
from current_nav cn
cross join initial_equity_ref ie
cross join position_count pc
cross join total_cost tc
cross join stats s
cross join max_drawdown md
cross join account_info ai;

-- ── 4. Security & grants ───────────────────────────────────────────────────

alter view public.vw_portfolio_home  set (security_invoker = on);
alter view public.vw_command_centre  set (security_invoker = on);

grant select on public.vw_portfolio_home  to anon, authenticated;
grant select on public.vw_command_centre  to anon, authenticated;
