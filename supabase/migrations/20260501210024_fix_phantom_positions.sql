-- ============================================================
-- Fix phantom positions: closed positions lingering in views
-- ------------------------------------------------------------
-- Root cause: the `quantity <> 0` filter in latest_pos was
-- applied BEFORE distinct on, so a tombstone row with qty=0
-- could never suppress an older non-zero row — the zero row
-- was filtered out first, leaving the old non-zero row to be
-- selected by distinct on.
--
-- Fix: split into two CTEs.
--   1. latest_pos_snapshot — gets the single latest row per
--      asset (no quantity filter), using a tightened 2-day
--      staleness window instead of 7.
--   2. latest_pos — filters snapshot to qty <> 0 and non-null
--      market value, so tombstone rows and zero-qty closed
--      positions are correctly excluded.
--
-- The 2-day staleness window (vs 7) means sold positions clear
-- within one regular business day after the next sync. The
-- companion sync-side tombstone writer (alpaca_sync.py) writes
-- explicit qty=0 rows for positions closed in each sync,
-- making the view filter immediate.
-- ============================================================

-- ── 1. Rebuild vw_portfolio_home ────────────────────────────

drop view if exists public.vw_portfolio_home cascade;

create view public.vw_portfolio_home as
with latest_pos_snapshot as (
    -- Step 1: get the single most-recent row per asset.
    -- No quantity filter here — tombstone rows must reach the distinct.
    select distinct on (p.asset_id)
        p.asset_id, p.quantity, p.average_cost, p.market_value, p.as_of_date, p.side
    from public.positions p
    join public.assets a on a.id = p.asset_id
    where p.as_of_date >= (select max(as_of_date) - 2 from public.positions)
      -- Expired OCC options are always phantoms — exclude at source
      and not (
          a.asset_class = 'option'
          and a.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
          and to_date(substring(a.symbol from '(\d{6})[CP]'), 'YYMMDD') < current_date
      )
    order by p.asset_id, p.as_of_date desc
),
latest_pos as (
    -- Step 2: keep only real open positions (non-zero, non-null qty and market value)
    select * from latest_pos_snapshot
    where quantity is not null
      and quantity <> 0
      and (market_value is null or abs(market_value) > 0.01)
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
    case when pdp.prev_close is not null and pdp.prev_close > 0
         then (lp.current_price - pdp.prev_close) / pdp.prev_close
    end                                                    as daily_change_pct,
    case when fdp.close_5d is not null and fdp.close_5d > 0
         then (lp.current_price - fdp.close_5d) / fdp.close_5d
    end                                                    as return_5d_pct,
    case when p.side = 'short'
         then (p.average_cost - lp.current_price) * abs(p.quantity)
         else (lp.current_price - p.average_cost) * abs(p.quantity)
    end                                                    as total_gain_loss_dollar,
    abs(p.market_value) / nullif(nav.total_nav, 0)         as weight_equity_pct,
    abs(p.market_value) / nullif(
        coalesce(nav.long_mv, 0) + abs(coalesce(nav.short_mv, 0)), 0
    )                                                      as weight_gross_pct,
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

alter view public.vw_portfolio_home set (security_invoker = on);
grant select on public.vw_portfolio_home to anon, authenticated;

-- ── 2. Rebuild vw_command_centre with same phantom fix ───────

drop view if exists public.vw_command_centre cascade;

create view public.vw_command_centre as
with latest_account as (
    select distinct on (portfolio_id)
        portfolio_id, equity, cash, buying_power, portfolio_value,
        long_market_value, short_market_value
    from public.account_snapshots
    order by portfolio_id, as_of desc
),
initial_equity_ref as (
    select coalesce(
        (select equity from public.account_snapshots order by as_of asc limit 1),
        100000.0
    ) as initial_eq
),
latest_pos_snapshot as (
    select distinct on (p.asset_id)
        p.asset_id, p.quantity, p.average_cost, p.market_value, p.as_of_date, p.side
    from public.positions p
    join public.assets a on a.id = p.asset_id
    where p.as_of_date >= (select max(as_of_date) - 2 from public.positions)
      and not (
          a.asset_class = 'option'
          and a.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
          and to_date(substring(a.symbol from '(\d{6})[CP]'), 'YYMMDD') < current_date
      )
    order by p.asset_id, p.as_of_date desc
),
latest_pos as (
    select * from latest_pos_snapshot
    where quantity is not null
      and quantity <> 0
      and (market_value is null or abs(market_value) > 0.01)
)
select
    count(*)                                                            as position_count,
    sum(abs(p.market_value))                                            as portfolio_nav,
    coalesce((select equity from latest_account limit 1),
             sum(abs(p.market_value)))                                  as account_equity,
    (select cash from latest_account limit 1)                          as cash_balance,
    (select buying_power from latest_account limit 1)                  as buying_power,
    sum(case when p.side = 'short'
             then (p.average_cost - p.market_value / nullif(abs(p.quantity),0)) * abs(p.quantity)
             else (p.market_value - p.average_cost * abs(p.quantity))
        end)                                                            as unrealised_pnl,
    sum(p.average_cost * abs(p.quantity))                              as total_invested,
    sum(case when p.side = 'short'
             then (p.average_cost - p.market_value / nullif(abs(p.quantity),0)) * abs(p.quantity)
             else (p.market_value - p.average_cost * abs(p.quantity))
        end)
    / nullif(sum(p.average_cost * abs(p.quantity)), 0)                  as unrealised_return_pct,
    (select initial_eq from initial_equity_ref)                        as initial_equity
from latest_pos p;

alter view public.vw_command_centre set (security_invoker = on);
grant select on public.vw_command_centre to anon, authenticated;

-- ── 3. Rebuild vw_earnings_calendar with same phantom fix ────

drop view if exists public.vw_earnings_calendar cascade;

create view public.vw_earnings_calendar as
with latest_pos_snapshot as (
    select distinct on (p.asset_id)
        p.asset_id, p.quantity, p.market_value, p.side, p.as_of_date
    from public.positions p
    join public.assets a on a.id = p.asset_id
    where p.as_of_date >= (select max(as_of_date) - 2 from public.positions)
      and not (
          a.asset_class = 'option'
          and a.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
          and to_date(substring(a.symbol from '(\d{6})[CP]'), 'YYMMDD') < current_date
      )
    order by p.asset_id, p.as_of_date desc
),
latest_pos as (
    select * from latest_pos_snapshot
    where quantity is not null
      and quantity <> 0
      and (market_value is null or abs(market_value) > 0.01)
),
cached_overview as (
    select ec.symbol, ec.payload, ec.cached_at
    from public.equity_cache ec
    where ec.endpoint = 'overview'
      and ec.expires_at > now() - interval '24 hours'
),
latest_account as (
    select distinct on (portfolio_id)
        portfolio_id, equity
    from public.account_snapshots
    order by portfolio_id, as_of desc
),
nav as (
    select coalesce(
        (select equity from latest_account limit 1),
        (select sum(market_value) from latest_pos)
    ) as total_nav
)
select
    a.symbol,
    a.name,
    a.sector,
    a.asset_class,
    lp.market_value,
    abs(lp.market_value) / nullif(nav.total_nav, 0) as weight_pct,
    (co.payload ->> 'NextEarningsDate')::date          as earnings_date,
    ((co.payload ->> 'NextEarningsDate')::date - current_date) as days_to_earnings,
    (co.payload ->> 'ExDividendDate')::date            as ex_div_date,
    (co.payload ->> 'AnalystTargetPrice')::numeric     as analyst_target,
    (co.payload ->> '52WeekHigh')::numeric             as week52_high,
    (co.payload ->> '52WeekLow')::numeric              as week52_low,
    co.cached_at as data_as_of
from latest_pos lp
join public.assets a  on a.id = lp.asset_id
left join cached_overview co on co.symbol = a.symbol
cross join nav
order by
    case when (co.payload ->> 'NextEarningsDate') is not null
         then ((co.payload ->> 'NextEarningsDate')::date - current_date)
         else 9999
    end asc,
    abs(lp.market_value) desc;

alter view public.vw_earnings_calendar set (security_invoker = on);
grant select on public.vw_earnings_calendar to anon, authenticated;

-- ── 4. Rebuild vw_performance_suite with same phantom fix ────

drop view if exists public.vw_performance_suite cascade;

create view public.vw_performance_suite as
with latest_pos_snapshot as (
    select distinct on (p.asset_id)
        p.asset_id, p.quantity, p.average_cost, p.market_value,
        p.as_of_date, p.side
    from public.positions p
    join public.assets a on a.id = p.asset_id
    where p.as_of_date >= (select max(as_of_date) - 2 from public.positions)
      and not (
          a.asset_class = 'option'
          and a.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
          and to_date(substring(a.symbol from '(\d{6})[CP]'), 'YYMMDD') < current_date
      )
    order by p.asset_id, p.as_of_date desc
),
latest_pos as (
    select * from latest_pos_snapshot
    where quantity is not null
      and quantity <> 0
      and (market_value is null or abs(market_value) > 0.01)
),
first_buys as (
    select distinct on (t.asset_id)
        t.asset_id,
        t.price            as tx_entry_price,
        t.transaction_date as tx_entry_date
    from public.transactions t
    join public.assets a on a.id = t.asset_id
    where lower(t.transaction_type) like '%buy%'
      and a.symbol <> '$CASH'
    order by t.asset_id, t.transaction_date asc
),
position_base as (
    select
        lp.asset_id,
        lp.market_value,
        lp.side,
        coalesce(fb.tx_entry_price,  lp.average_cost)           as entry_price,
        coalesce(fb.tx_entry_date::date, lp.as_of_date::date)   as entry_date
    from latest_pos lp
    left join first_buys fb on fb.asset_id = lp.asset_id
),
post_entry_range as (
    select
        pb.asset_id,
        max(ph.high) as high_30d_post_entry,
        min(ph.low)  as low_30d_post_entry
    from position_base pb
    left join public.price_history ph
        on  ph.asset_id    = pb.asset_id
        and ph.interval    = '1d'
        and ph.price_date  between pb.entry_date and (pb.entry_date + interval '30 days')
    group by pb.asset_id
),
latest_prices as (
    select distinct on (asset_id)
        asset_id,
        close as current_price
    from public.price_history
    where interval = '1d'
    order by asset_id, price_date desc
),
sector_live as (
    select
        a.id as asset_id,
        nullif(trim(ec.payload ->> 'Sector'), '') as av_sector
    from public.assets a
    left join public.equity_cache ec
        on  ec.symbol   = a.symbol
        and ec.endpoint = 'overview'
        and ec.expires_at > now() - interval '48 hours'
)
select
    a.symbol,
    a.name,
    coalesce(sl.av_sector, a.sector, 'Other')           as sector,
    pb.market_value,
    pb.side,
    pb.entry_price,
    pb.entry_date,
    lp.current_price,
    round(
        (1 - (pb.entry_price - per.low_30d_post_entry)
            / nullif(per.high_30d_post_entry - per.low_30d_post_entry, 0)
        ) * 100
    , 1)                                                as entry_efficiency_score,
    (lp.current_price - pb.entry_price)
        / nullif(pb.entry_price, 0)                     as total_return_pct,
    case
        when current_date > pb.entry_date then
            power(
                lp.current_price / nullif(pb.entry_price, 0),
                365.0 / nullif(current_date - pb.entry_date, 0)
            ) - 1
        else null
    end                                                 as annualised_return,
    current_date - pb.entry_date                        as days_held,
    case
        when (current_date - pb.entry_date) > 180
         and (lp.current_price - pb.entry_price) / nullif(pb.entry_price, 0) < 0
        then true else false
    end                                                 as cut_candidate_flag
from position_base pb
join public.assets a           on a.id  = pb.asset_id
join latest_prices lp          on lp.asset_id = pb.asset_id
left join post_entry_range per on per.asset_id = pb.asset_id
left join sector_live sl       on sl.asset_id  = pb.asset_id
order by annualised_return desc nulls last;

alter view public.vw_performance_suite set (security_invoker = on);
grant select on public.vw_performance_suite to anon, authenticated;
