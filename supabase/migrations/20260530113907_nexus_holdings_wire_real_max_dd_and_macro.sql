create or replace view vw_nexus_holdings as
with portfolio_totals as (
  select sum(dollar_var_95_daily) as total_var from vw_risk_analysis
),
base as (
  select
    p.symbol,
    coalesce(p.name, a.name) as asset_name,
    coalesce(p.sector, a.sector) as sector,
    p.market_value,
    round(p.weight_equity_pct * 100::numeric, 2) as weight_pct,
    round(p.daily_change_pct * 100::numeric, 3) as daily_return_pct,
    round(coalesce(p.return_5d_pct, 0::numeric) * 100::numeric, 3) as five_day_return_pct,
    p.total_gain_loss_dollar as pnl_contribution,
    round(coalesce(perf.total_return_pct, p.unrealised_return_pct, 0::numeric) * 100::numeric, 2) as total_return_pct,
    -- Valuation fundamentals: no upstream feed yet (pe_ratio / analyst_upside all NULL in vw_screener)
    null::numeric as dcf_upside_pct,
    null::numeric as intrinsic_value,
    null::numeric as fwd_pe,
    null::numeric as peg_ratio,
    -- Macro: derived deterministically from sector (rate sensitivity is standard domain mapping)
    case
      when coalesce(p.sector, a.sector) in ('Real Estate','Financials','Fixed Income') then 'High'
      when coalesce(p.sector, a.sector) in ('Utilities','Consumer Discretionary') then 'Moderate'
      else 'Low'
    end as rate_sensitivity,
    -- FX exposure: all holdings are US-listed us_equity, so honest single classification
    case
      when coalesce(p.sector, a.sector) = 'International' then 'High'
      else 'Low'
    end as fx_exposure,
    null::text as macro_regime_fit,  -- set in derived using price_regime
    null::numeric as beta,           -- no beta source in DB
    -- Max DD: real, from vw_screener.current_drawdown_pct (already in % units)
    round(sc.current_drawdown_pct::numeric, 2) as max_drawdown_pct,
    round((r.dollar_var_95_daily / nullif(pt.total_var, 0::double precision) * 100::double precision)::numeric, 2) as var_contribution_pct,
    q.price_regime,
    q.rsi_14,
    q.momentum_pct_rank_20d,
    q.mean_reversion_signal,
    p.quality_score,
    -- Earnings: vw_earnings_calendar.earnings_date is empty upstream; keep NULL until feed lands
    ec.earnings_date::date as next_earnings_date
  from vw_portfolio_home p
    cross join portfolio_totals pt
    left join assets a on a.symbol = p.symbol
    left join vw_performance_suite perf on perf.symbol = p.symbol
    left join vw_risk_analysis r on r.symbol = p.symbol
    left join vw_quant_dashboard q on q.symbol = p.symbol
    left join vw_screener sc on sc.symbol = p.symbol
    left join vw_earnings_calendar ec on ec.symbol = p.symbol
),
derived as (
  select base.*,
    case
      when price_regime = 'Uptrend' and coalesce(rsi_14, 50) < 70 then 'Bull'
      when price_regime = 'Uptrend' and coalesce(rsi_14, 50) >= 70 then 'Wary'
      when price_regime = 'Downtrend' then 'Wary'
      else 'Neutral'
    end as technical_signal,
    case
      when coalesce(quality_score, 0) >= 85 then 'A+'
      when coalesce(quality_score, 0) >= 75 then 'A'
      when coalesce(quality_score, 0) >= 65 then 'B+'
      when coalesce(quality_score, 0) >= 55 then 'B'
      else 'C'
    end as quality_grade,
    case
      when price_regime = 'Uptrend' and coalesce(momentum_pct_rank_20d, 0) >= 60 then 'Long'
      when price_regime = 'Downtrend' then 'Short'
      else 'Hold'
    end as quant_signal,
    -- Macro regime fit: rate-sensitive names fare worse in a tightening/uptrend-broken regime.
    -- Derived from rate_sensitivity + price_regime (transparent, no fabricated fundamentals).
    case
      when rate_sensitivity = 'High'  and price_regime = 'Downtrend' then 'Headwind'
      when rate_sensitivity = 'High'  and price_regime = 'Uptrend'   then 'Neutral'
      when rate_sensitivity = 'Low'   and price_regime = 'Uptrend'   then 'Tailwind'
      else 'Neutral'
    end as macro_signal,
    -- Valuation signal: no fundamentals → honest Unrated (frontend shows as neutral)
    null::text as valuation_signal
  from base
),
scored as (
  select derived.*,
    -- Valuation has no data → null contribution (handled by re-weighting below)
    null::numeric as val_c,
    case macro_signal
      when 'Tailwind' then 70 when 'Headwind' then 30 else 50
    end::numeric as mac_c,
    case technical_signal
      when 'Bull' then 80 when 'Neutral' then 50 else 30
    end::numeric as tec_c,
    case quality_grade
      when 'A+' then 95 when 'A' then 85 when 'B+' then 70 when 'B' then 55 else 35
    end::numeric as qual_c
  from derived
),
convict as (
  select scored.*,
    -- Re-weight to the components that actually have data. Valuation (35%) is absent,
    -- so its weight is redistributed proportionally across macro/technical/quality.
    round(
      (0.25 * mac_c + 0.25 * tec_c + 0.15 * qual_c) / (0.25 + 0.25 + 0.15)
    )::integer as conviction_score
  from scored
)
select symbol, asset_name, sector, market_value, weight_pct, daily_return_pct,
  five_day_return_pct, total_return_pct, pnl_contribution, dcf_upside_pct,
  intrinsic_value, fwd_pe, peg_ratio, macro_regime_fit, rate_sensitivity, fx_exposure,
  beta, max_drawdown_pct, var_contribution_pct, valuation_signal, macro_signal,
  technical_signal, quality_grade, quant_signal, conviction_score,
  case
    when conviction_score >= 75 and weight_pct < 10 then 'Add'
    when conviction_score >= 60 and conviction_score <= 74 then 'Hold'
    when (conviction_score >= 45 and conviction_score <= 59) or weight_pct > 10 then 'Trim'
    else 'Exit'
  end as recommended_action,
  next_earnings_date,
  case
    when coalesce(var_contribution_pct, 0) > 2.5 and weight_pct > 8 then 'conflict'
    when weight_pct > 10 then 'risk'
    when conviction_score >= 75 then 'opportunity'
    else null
  end as alert_flag,
  'Weight ' || round(weight_pct, 1) || '% · Tech ' || technical_signal ||
  ' · Macro ' || macro_signal || ' · Quality ' || quality_grade || '.' as nexus_insight
from convict
where market_value is not null and market_value > 0
order by market_value desc;
