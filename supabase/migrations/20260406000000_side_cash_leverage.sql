-- ---------------------------------------------------------------------------
-- 20260406000000_side_cash_leverage.sql
--
-- Three fixes for portfolio methodology:
--
-- 1. POSITION SIDE: Add `side` column ('long'/'short') to positions table.
--    Short puts/calls get correct signed P&L in views.
--
-- 2. ACCOUNT BALANCES: account_snapshots table already exists (from
--    20260405000000). We add an anon read policy so the terminal can
--    display cash, equity, buying_power, and leverage.
--
-- 3. NAV = EQUITY: vw_command_centre and vw_portfolio_home now source
--    portfolio NAV from account_snapshots.equity (the broker's source of
--    truth that includes cash and margin) instead of raw sum(market_value).
-- ---------------------------------------------------------------------------

-- ── 1. Add side column to positions ─────────────────────────────────────────

alter table public.positions
  add column if not exists side text not null default 'long';

-- ── 2. Anon read policy for account_snapshots ───────────────────────────────

alter table public.account_snapshots enable row level security;

drop policy if exists account_snapshots_read_anon on public.account_snapshots;
create policy account_snapshots_read_anon
  on public.account_snapshots for select
  to anon, authenticated
  using (true);

-- ── 3. Rebuild vw_portfolio_home with side-aware P&L ────────────────────────

drop view if exists public.vw_portfolio_home cascade;

create view public.vw_portfolio_home as
with latest_pos as (
    select distinct on (asset_id)
        asset_id, quantity, average_cost, market_value, as_of_date, side
    from public.positions
    order by asset_id, as_of_date desc
),
latest_prices as (
    select distinct on (asset_id)
        asset_id, close as current_price, price_date
    from public.price_history
    where interval = '1d'
    order by asset_id, price_date desc
),
latest_account as (
    select distinct on (portfolio_id)
        portfolio_id, equity, cash, buying_power,
        long_market_value, short_market_value
    from public.account_snapshots
    order by portfolio_id, as_of desc
),
returns as (
    select ph.asset_id, ph.price_date,
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
    -- Use equity from account_snapshots (includes cash + margin).
    -- Fall back to sum(market_value) if no account snapshot exists.
    select coalesce(
        (select equity from latest_account limit 1),
        (select sum(market_value) from latest_pos)
    ) as total_nav,
    (select cash from latest_account limit 1)          as cash_balance,
    (select buying_power from latest_account limit 1)  as buying_power,
    (select long_market_value from latest_account limit 1)  as long_mv,
    (select short_market_value from latest_account limit 1) as short_mv
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
    p.side,
    -- Show signed quantity: negative for shorts
    case when p.side = 'short' then -abs(p.quantity) else p.quantity end as quantity,
    p.average_cost                                         as cost_basis,
    lp.current_price,
    p.market_value,
    -- P&L sign depends on side
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
    -- Expose account-level fields for the header cards
    nav.total_nav        as portfolio_nav,
    nav.cash_balance,
    nav.buying_power,
    nav.long_mv          as long_market_value,
    nav.short_mv         as short_market_value
from latest_pos p
join public.assets a     on a.id = p.asset_id
left join latest_prices lp on lp.asset_id = p.asset_id
left join stats s        on s.asset_id = p.asset_id
cross join nav
cross join hhi h
order by abs(p.market_value) desc nulls last;

-- ── 4. Rebuild vw_position_nav_daily: allow negative positions (shorts) ─────

drop view if exists public.vw_command_centre       cascade;
drop view if exists public.vw_portfolio_nav_daily  cascade;
drop view if exists public.vw_position_nav_daily   cascade;

create view public.vw_position_nav_daily as
with signed_transactions as (
    select
        t.portfolio_id,
        t.asset_id,
        t.transaction_date::date as tx_date,
        case
            when lower(t.transaction_type) like '%sell%' then -abs(t.quantity)
            when lower(t.transaction_type) like '%buy%'  then  abs(t.quantity)
            when lower(t.transaction_type) = 'fill'      then t.quantity
            else 0
        end as signed_qty
    from public.transactions t
    join public.assets a on a.id = t.asset_id
    where a.symbol <> '$CASH'
),
daily_net as (
    select portfolio_id, asset_id, tx_date, sum(signed_qty) as net_qty
    from signed_transactions
    group by portfolio_id, asset_id, tx_date
),
cumulative_holdings as (
    select
        portfolio_id, asset_id, tx_date,
        sum(net_qty) over (
            partition by portfolio_id, asset_id
            order by tx_date
            rows between unbounded preceding and current row
        ) as running_qty
    from daily_net
),
asset_lifespan as (
    select portfolio_id, asset_id, min(tx_date) as start_date
    from cumulative_holdings
    where running_qty <> 0   -- changed from > 0: shorts have negative qty
    group by portfolio_id, asset_id
),
trading_days as (
    select distinct price_date::date as cal_date
    from public.price_history
    where interval = '1d'
),
holdings_grid as (
    select al.portfolio_id, al.asset_id, td.cal_date
    from asset_lifespan al
    join trading_days td
      on td.cal_date >= al.start_date
     and td.cal_date <= current_date
),
daily_holdings as (
    select
        hg.portfolio_id, hg.asset_id, hg.cal_date,
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
    dh.cal_date                             as price_date,
    coalesce(dh.quantity, 0)                as quantity,
    ph.close                                as close_price,
    coalesce(dh.quantity, 0) * ph.close     as position_value
from daily_holdings dh
join public.assets a on a.id = dh.asset_id
left join public.price_history ph
  on ph.asset_id         = dh.asset_id
 and ph.price_date::date = dh.cal_date
 and ph.interval         = '1d'
where coalesce(dh.quantity, 0) <> 0;  -- include both longs and shorts

-- ── 5. Rebuild vw_portfolio_nav_daily ───────────────────────────────────────

create view public.vw_portfolio_nav_daily as
with daily_nav as (
    select
        portfolio_id, price_date,
        sum(position_value)                                as nav,
        count(*) filter (where position_value is not null) as position_count
    from public.vw_position_nav_daily
    group by portfolio_id, price_date
    having sum(position_value) is not null
       and abs(sum(position_value)) > 0
)
select
    portfolio_id, price_date, nav, position_count,
    (nav - lag(nav) over (partition by portfolio_id order by price_date))
        / nullif(lag(nav) over (partition by portfolio_id order by price_date), 0)
        as daily_return
from daily_nav
order by portfolio_id, price_date;

-- ── 6. Rebuild vw_command_centre — equity-based NAV ─────────────────────────

create view public.vw_command_centre as
with latest_account as (
    select distinct on (portfolio_id)
        portfolio_id, equity, cash, buying_power, portfolio_value,
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
-- NAV from broker equity (source of truth), fallback to sum(market_value)
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
        coalesce((select cash from latest_account limit 1), 0)         as cash,
        coalesce((select buying_power from latest_account limit 1), 0) as buying_power,
        coalesce((select long_market_value from latest_account limit 1), 0)  as long_mv,
        coalesce((select short_market_value from latest_account limit 1), 0) as short_mv
    from (select 1) x
)
select
    cn.nav                                                               as portfolio_nav,
    pc.n                                                                 as position_count,
    tc.total_invested,
    cn.nav - tc.total_invested                                           as unrealised_pnl,
    case when tc.total_invested > 0
         then (cn.nav - tc.total_invested) / tc.total_invested end       as unrealised_return_pct,
    s.trading_days,
    s.mu                                                                 as mean_daily_return,
    s.sigma                                                              as daily_volatility,
    case when s.sigma > 0          then (s.mu / s.sigma)          * sqrt(252) end as sharpe_annualised,
    case when s.downside_sigma > 0 then (s.mu / s.downside_sigma) * sqrt(252) end as sortino_annualised,
    s.var_95_daily                                                       as var_95_daily_return,
    case when cn.nav is not null then cn.nav * s.var_95_daily end        as var_95_daily_dollar,
    md.dd                                                                as max_drawdown,
    -- Account fields for header cards
    ai.cash                                                              as cash_balance,
    ai.buying_power,
    ai.long_mv                                                           as long_market_value,
    ai.short_mv                                                          as short_market_value,
    case when cn.nav > 0
         then (ai.long_mv + abs(ai.short_mv)) / cn.nav end              as gross_leverage
from current_nav cn
cross join position_count pc
cross join total_cost tc
cross join stats s
cross join max_drawdown md
cross join account_info ai;

-- ── 7. Security + grants ────────────────────────────────────────────────────

alter view public.vw_portfolio_home     set (security_invoker = on);
alter view public.vw_position_nav_daily set (security_invoker = on);
alter view public.vw_portfolio_nav_daily set (security_invoker = on);
alter view public.vw_command_centre     set (security_invoker = on);

grant select on public.vw_portfolio_home     to anon, authenticated;
grant select on public.vw_position_nav_daily to anon, authenticated;
grant select on public.vw_portfolio_nav_daily to anon, authenticated;
grant select on public.vw_command_centre     to anon, authenticated;
grant select on public.account_snapshots     to anon, authenticated;
