-- Bench Docket Absorption, spec §5.1 / §5.4.
--
-- Base is vw_nexus_holdings (54 rows, weight_pct sums to 100, sector taxonomy
-- matching the mockup's headroom rail). NOTE the spec's illustrative SQL names
-- tables that do not exist here (holdings / portfolio_nav); the real sources are
-- vw_nexus_holdings, transactions+assets, and account_snapshots.
--
-- §4.1 conviction-implied target, LINEAR scaler (confirmed 9 Aug):
--   target = invested_pct × conviction / Σconviction, over RATED rows only.
-- invested_pct is the rated rows' own share of book, so targets sum to exactly
-- the weight those rows actually hold and cash is never implicitly allocated.
-- A null conviction yields a NULL target and is excluded from the denominator —
-- it must never inherit the mean (nexus_holdings.conviction coalesces unrated
-- names to 49, which is precisely the silent average this forbids; that column
-- is deliberately not used here).
create or replace view public.vw_bench_docket as
with base as (
  select
    h.symbol,
    h.asset_name,
    h.sector,
    h.weight_pct                                as actual_weight_pct,
    h.conviction_score,
    h.var_contribution_pct                      as component_var_pct,
    h.unrealised_return_pct,
    h.max_drawdown_pct                          as drawdown_pct,
    h.quality_grade,
    h.quant_signal,
    h.technical_signal,
    h.valuation_signal,
    h.macro_regime_fit
  from public.vw_nexus_holdings h
),
conv as (
  select
    sum(conviction_score)                                             as conv_total,
    sum(actual_weight_pct) filter (where conviction_score is not null) as invested_pct
  from base
  where conviction_score is not null
),
-- Entry date is transaction-derived. 12 holdings have no transaction row at all
-- (the transaction sync stopped 2026-03-26), so days_held is NULL for them and
-- the clock renders as a red dash. Inferring entry from first price observation
-- is forbidden by §5.2 — that is the SNDK silent-fallback pattern in a new coat.
first_buy as (
  select a.symbol, min(t.transaction_date)::date as first_buy_date
  from public.transactions t
  join public.assets a on a.id = t.asset_id
  where lower(t.transaction_type) like '%buy%'
  group by a.symbol
)
select
  b.symbol,
  b.asset_name,
  b.sector,
  b.actual_weight_pct,
  b.conviction_score,
  case when b.conviction_score is null then null
       else round(c.invested_pct * b.conviction_score / nullif(c.conv_total,0), 3)
  end                                                        as target_weight_pct,
  case when b.conviction_score is null then null
       else round(b.actual_weight_pct
                  - (c.invested_pct * b.conviction_score / nullif(c.conv_total,0)), 3)
  end                                                        as weight_gap_pp,
  -- §4.2 return per unit of risk; abstain under a 0.25 denominator rather than
  -- emit a meaningless magnitude.
  case when abs(b.component_var_pct) < 0.25 then null
       else round(b.unrealised_return_pct / b.component_var_pct, 2)
  end                                                        as r_var,
  b.component_var_pct,
  b.unrealised_return_pct,
  b.drawdown_pct,
  -- §4.3 weighted drawdown damage. NULL (not 0) when the name is not underwater.
  case when b.drawdown_pct < 0
       then round(b.actual_weight_pct * abs(b.drawdown_pct) / 100, 3)
       else null
  end                                                        as damage_pp,
  fb.first_buy_date,
  case when fb.first_buy_date is null then null
       else (current_date - fb.first_buy_date)
  end                                                        as days_held,
  b.quality_grade,
  b.quant_signal,
  b.technical_signal,
  b.valuation_signal,
  b.macro_regime_fit
from base b
cross join conv c
left join first_buy fb on fb.symbol = b.symbol;

grant select on public.vw_bench_docket to anon, authenticated;

-- §5.4 sleeve headroom. Cap is 30% of book weight (same share-of-book basis the
-- docket uses, so the rail and the rows can never disagree).
create or replace view public.vw_sleeve_headroom as
with nav as (
  select equity from public.account_snapshots order by as_of desc limit 1
)
select
  h.sector                                            as sleeve,
  round(sum(h.weight_pct), 2)                         as weight_pct,
  30.0                                                as cap_pct,
  round(30.0 - sum(h.weight_pct), 2)                  as headroom_pp,
  round((30.0 - sum(h.weight_pct)) / 100 * (select equity from nav), 0) as headroom_usd,
  count(*)                                            as positions
from public.vw_nexus_holdings h
group by h.sector
order by weight_pct desc;

grant select on public.vw_sleeve_headroom to anon, authenticated;
