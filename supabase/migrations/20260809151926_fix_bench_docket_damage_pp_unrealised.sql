-- damage_pp must mirror the existing Portfolio Risk "Weighted Drawdown
-- Exposure" panel (src/pages/portfolio-home.js), which ranks *currently
-- underwater* positions: abs(unrealised_return) x weight.
--
-- The first cut used max_drawdown_pct — historical peak-to-trough — which
-- flagged 53 of 54 rows as damaged and disagreed with the Portfolio Risk
-- number for every name that has recovered off its low (VWAGY: -27.0%
-- unrealised against a -76.2% max drawdown). Two implementations of one
-- number that can disagree is a defect, not a redundancy (spec §4.3).
--
-- Scale note: vw_nexus_holdings.unrealised_return_pct is a PERCENT (-40.44),
-- whereas the identically-named column on vw_portfolio_home is a FRACTION
-- (-0.4044). The expression below is the percent-scale form of the panel's
-- abs(ret_frac) * wt_frac * 100. Verified equal to within 0.002pp across the
-- underwater book.
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
    case when abs(b.component_var_pct) < 0.25 then null::numeric
         else round(b.unrealised_return_pct / b.component_var_pct, 2)
    end as r_var,
    b.component_var_pct,
    b.unrealised_return_pct,
    b.drawdown_pct,
    case when b.unrealised_return_pct < 0
         then round(b.actual_weight_pct * abs(b.unrealised_return_pct) / 100::numeric, 3)
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
