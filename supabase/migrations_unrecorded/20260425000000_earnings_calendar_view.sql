-- ---------------------------------------------------------------------------
-- 20260425000000_earnings_calendar_view.sql
--
-- vw_earnings_calendar
--
-- Joins current portfolio positions to earnings/dividend dates cached in
-- equity_cache (populated by the /api/equity?endpoint=overview proxy).
-- Returns one row per held position, ordered by upcoming earnings date.
--
-- React Portfolio Home reads this to display the Earnings Calendar card.
-- ---------------------------------------------------------------------------

create or replace view public.vw_earnings_calendar as
with latest_pos as (
    select distinct on (p.asset_id)
        p.asset_id, p.quantity, p.market_value, p.side, p.as_of_date
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
-- Pull cached AV overview payloads for each held symbol
cached_overview as (
    select
        ec.symbol,
        ec.payload,
        ec.cached_at
    from public.equity_cache ec
    where ec.endpoint = 'overview'
      -- Only use fresh-enough cache (72h)
      and ec.expires_at > now() - interval '24 hours'
),
-- Latest account snapshot for NAV weighting
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

    -- Earnings date from AV overview cache (nullable — only present when cached)
    (co.payload ->> 'NextEarningsDate')::date          as earnings_date,
    -- Days until earnings
    ((co.payload ->> 'NextEarningsDate')::date - current_date) as days_to_earnings,
    -- Ex-dividend date (useful for income holdings)
    (co.payload ->> 'ExDividendDate')::date            as ex_div_date,
    -- Analyst consensus target price
    (co.payload ->> 'AnalystTargetPrice')::numeric     as analyst_target,
    -- 52W high/low for context
    (co.payload ->> '52WeekHigh')::numeric             as week52_high,
    (co.payload ->> '52WeekLow')::numeric              as week52_low,

    co.cached_at as data_as_of

from latest_pos lp
join public.assets a  on a.id = lp.asset_id
left join cached_overview co on co.symbol = a.symbol
cross join nav
-- Only include rows where we have an upcoming earnings date, or include all
-- (frontend filters) — include all here, let React show N/A where missing
order by
    case when (co.payload ->> 'NextEarningsDate') is not null
         then ((co.payload ->> 'NextEarningsDate')::date - current_date)
         else 9999
    end asc,
    abs(lp.market_value) desc;

-- ── Grants ────────────────────────────────────────────────────────────────
alter view public.vw_earnings_calendar set (security_invoker = on);
grant select on public.vw_earnings_calendar to anon, authenticated;
