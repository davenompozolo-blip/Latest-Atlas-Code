-- ---------------------------------------------------------------------------
-- 20260425000002_perf_suite_sector_mv.sql
--
-- Rebuilds vw_performance_suite to include:
--   • sector  — GICS classification, sourced from equity_cache (Alpha Vantage
--               OVERVIEW payload) with fallback to assets.sector static mapping.
--   • market_value — current position market value, required by
--               computeBrinsonAttribution for value-weighted sector weighting.
--   • side    — long / short, passed through for sign-aware position display.
--
-- Brinson-Fachler attribution depends on both sector and market_value being
-- present in perfData. Without them the JS engine falls back to 'Other'
-- sector for all positions, collapsing all attribution into one bucket.
-- ---------------------------------------------------------------------------

drop view if exists public.vw_performance_suite;

create view public.vw_performance_suite as
with latest_pos as (
    select distinct on (p.asset_id)
        p.asset_id, p.quantity, p.average_cost, p.market_value,
        p.as_of_date, p.side
    from public.positions p
    join public.assets a on a.id = p.asset_id
    where p.quantity <> 0
      -- Filter stale positions (>7 days since last sync)
      and p.as_of_date >= (select max(as_of_date) - 7 from public.positions)
      -- Filter expired OCC options
      and not (
          a.asset_class = 'option'
          and a.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
          and to_date(substring(a.symbol from '(\d{6})[CP]'), 'YYMMDD') < current_date
      )
    order by p.asset_id, p.as_of_date desc
),
-- Earliest buy transaction per asset (enriches entry price/date)
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
-- 30-day post-entry high/low for entry efficiency score
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
-- Live sector override from Alpha Vantage overview cache (48-hour freshness)
-- AV overview payload includes a top-level "Sector" key.
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
    -- Sector priority: live AV cache → assets static → 'Other'
    coalesce(sl.av_sector, a.sector, 'Other')           as sector,
    pb.market_value,
    pb.side,
    pb.entry_price,
    pb.entry_date,
    lp.current_price,
    -- Entry efficiency: how close to the low did we buy in the 30-day post-entry window?
    round(
        (1 - (pb.entry_price - per.low_30d_post_entry)
            / nullif(per.high_30d_post_entry - per.low_30d_post_entry, 0)
        ) * 100
    , 1)                                                as entry_efficiency_score,
    -- Total return from entry to current
    (lp.current_price - pb.entry_price)
        / nullif(pb.entry_price, 0)                     as total_return_pct,
    -- CAGR from entry
    case
        when current_date > pb.entry_date then
            power(
                lp.current_price / nullif(pb.entry_price, 0),
                365.0 / nullif(current_date - pb.entry_date, 0)
            ) - 1
        else null
    end                                                 as annualised_return,
    current_date - pb.entry_date                        as days_held,
    -- Cut candidate: held > 180 days and still negative
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
