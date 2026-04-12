-- ---------------------------------------------------------------------------
-- 20260412000000_portfolio_home_enhanced.sql
--
-- Step 0 Retrofit: Enhanced vw_portfolio_home
--
-- Adds columns required by the holdings table retrofit:
--   daily_change_pct, return_5d_pct, weight_equity_pct, weight_gross_pct,
--   total_gain_loss_dollar, quality_score
--
-- Uses ranked_prices CTE for efficient single-scan lookback on price_history.
-- Quality score is a 0-100 composite of Sharpe, volatility, return, and
-- concentration components.
-- ---------------------------------------------------------------------------

drop view if exists public.vw_portfolio_home cascade;

create view public.vw_portfolio_home as
with latest_pos as (
    select distinct on (asset_id)
        asset_id, quantity, average_cost, market_value, as_of_date, side
    from public.positions
    order by asset_id, as_of_date desc
),
-- Single scan of price_history, ranked by recency per asset
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
    (select cash from latest_account limit 1)          as cash_balance,
    (select buying_power from latest_account limit 1)  as buying_power,
    (select long_market_value from latest_account limit 1) as long_mv,
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
    case when p.side = 'short' then -abs(p.quantity) else p.quantity end as quantity,
    p.average_cost                                         as cost_basis,
    lp.current_price,
    p.market_value,

    -- ── New columns for Step 0 retrofit ────────────────────────────
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
    -- Weight % of equity (position / NAV)
    abs(p.market_value) / nullif(nav.total_nav, 0)         as weight_equity_pct,
    -- Weight % of gross exposure
    abs(p.market_value) / nullif(
        coalesce(nav.long_mv, 0) + abs(coalesce(nav.short_mv, 0)), 0
    )                                                      as weight_gross_pct,
    -- Quality score (0-100 composite)
    greatest(0, least(100, round(
        -- Sharpe component (0-30): sharpe of 2.0 = full marks
        30.0 * least(1.0, greatest(0.0,
            coalesce(s.mu / nullif(s.sigma, 0) * sqrt(252.0), 0) / 2.0
        ))
        -- Low-vol component (0-20): vol under 15% = full marks, over 50% = 0
        + 20.0 * greatest(0.0,
            1.0 - least(1.0, coalesce(s.sigma * sqrt(252.0), 0.5) / 0.5)
        )
        -- Return component (0-30): +20% return = full marks, -10% = 0
        + 30.0 * least(1.0, greatest(0.0,
            (coalesce(
                case when p.side = 'short'
                     then (p.average_cost - lp.current_price) / nullif(p.average_cost, 0)
                     else (lp.current_price - p.average_cost) / nullif(p.average_cost, 0)
                end, 0
            ) + 0.10) / 0.30
        ))
        -- Concentration component (0-20): under 10% weight = full marks
        + case when abs(p.market_value) / nullif(nav.total_nav, 0) > 0.10
               then 6.0 else 20.0 end
    )))                                                    as quality_score,

    -- ── Legacy columns (preserved for existing consumers) ──────────
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
join public.assets a     on a.id = p.asset_id
left join latest_prices lp   on lp.asset_id = p.asset_id
left join prev_day_prices pdp on pdp.asset_id = p.asset_id
left join five_day_prices fdp on fdp.asset_id = p.asset_id
left join stats s            on s.asset_id = p.asset_id
cross join nav
cross join hhi h
order by abs(p.market_value) desc nulls last;

-- ── Security & grants ──────────────────────────────────────────────────────
alter view public.vw_portfolio_home set (security_invoker = on);
grant select on public.vw_portfolio_home to anon, authenticated;
