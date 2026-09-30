-- Bench Docket Absorption — the two read surfaces the docket and headroom rail
-- sit on. Neither is a new panel: vw_bench_docket is one row per holding with
-- every judged column the docket renders, and vw_sleeve_headroom is the
-- sector-cap arithmetic the ruling panel gates deployments against.
--
-- Nothing here invents a number. target_weight_pct is conviction-implied
-- (spec §4.1) and is NULL when conviction is missing — a missing conviction
-- must not silently produce an average target. days_held comes from the first
-- buy transaction only; entry date is never inferred from the earliest price
-- observation (spec §5.2).

create or replace view public.vw_bench_docket as
with base as (
    select
        h.symbol,
        h.asset_name,
        h.sector,
        h.weight_pct              as actual_weight_pct,
        h.conviction_score,
        h.var_contribution_pct    as component_var_pct,
        h.unrealised_return_pct,
        h.max_drawdown_pct        as drawdown_pct,
        h.quality_grade,
        h.quant_signal,
        h.technical_signal,
        h.valuation_signal,
        h.macro_regime_fit
    from vw_nexus_holdings h
), conv as (
    -- Conviction-implied targets are normalised over the *invested* weight of
    -- rated names only, so the rated book's targets sum to the rated book's
    -- actual weight rather than to an arbitrary 100.
    select
        sum(conviction_score)                                              as conv_total,
        sum(actual_weight_pct) filter (where conviction_score is not null) as invested_pct
    from base
    where conviction_score is not null
), first_buy as (
    select a.symbol, min(t.transaction_date)::date as first_buy_date
    from transactions t
    join assets a on a.id = t.asset_id
    where lower(t.transaction_type) like '%buy%'
    group by a.symbol
)
select
    b.symbol,
    b.asset_name,
    b.sector,
    b.actual_weight_pct,
    b.conviction_score,
    case when b.conviction_score is null then null::numeric
         else round(c.invested_pct * b.conviction_score::numeric / nullif(c.conv_total, 0)::numeric, 3)
    end as target_weight_pct,
    case when b.conviction_score is null then null::numeric
         else round(b.actual_weight_pct - c.invested_pct * b.conviction_score::numeric / nullif(c.conv_total, 0)::numeric, 3)
    end as weight_gap_pp,
    -- Return per unit of risk taken. Suppressed below 0.25% component VaR:
    -- the ratio is meaningless when the denominator is noise.
    case when abs(b.component_var_pct) < 0.25 then null::numeric
         else round(b.unrealised_return_pct / b.component_var_pct, 2)
    end as r_var,
    b.component_var_pct,
    b.unrealised_return_pct,
    b.drawdown_pct,
    case when b.drawdown_pct < 0
         then round(b.actual_weight_pct * abs(b.drawdown_pct) / 100::numeric, 3)
         else null::numeric
    end as damage_pp,
    fb.first_buy_date,
    case when fb.first_buy_date is null then null::integer
         else current_date - fb.first_buy_date
    end as days_held,
    b.quality_grade,
    b.quant_signal,
    b.technical_signal,
    b.valuation_signal,
    b.macro_regime_fit
from base b
cross join conv c
left join first_buy fb on fb.symbol = b.symbol;

grant select on public.vw_bench_docket to anon, authenticated;

-- Sector headroom against a flat 30% sleeve cap. headroom_usd is expressed
-- against the latest account equity so the ruling panel can size a deployment
-- in dollars rather than making the reader do the arithmetic.
create or replace view public.vw_sleeve_headroom as
with nav as (
    select equity from account_snapshots order by as_of desc limit 1
)
select
    h.sector                                                as sleeve,
    round(sum(h.weight_pct), 2)                             as weight_pct,
    30.0                                                    as cap_pct,
    round(30.0 - sum(h.weight_pct), 2)                      as headroom_pp,
    round((30.0 - sum(h.weight_pct)) / 100::numeric * (select nav.equity from nav), 0) as headroom_usd,
    count(*)                                                as positions
from vw_nexus_holdings h
group by h.sector
order by round(sum(h.weight_pct), 2) desc;

grant select on public.vw_sleeve_headroom to anon, authenticated;
