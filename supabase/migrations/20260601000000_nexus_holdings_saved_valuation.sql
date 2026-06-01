-- vw_nexus_holdings: source intrinsic value from SAVED valuation models first.
--
-- Previously dcf_upside_pct / intrinsic_value came only from equity_cache's
-- AnalystTargetPrice, which is empty for the whole book — so every Nexus row
-- read "valuation input missing" and conviction fell back to a partial score.
--
-- The Valuation House persists every saved run to scrapbook_companies
-- (avg_fair_value = blended fair value across a ticker's runs). This migration
-- joins that in and prefers it over the analyst target, so a model the user
-- saves for a ticker pulls straight through to Nexus conviction + upside.
--
--   intrinsic_value  = coalesce(saved model fair value, analyst target)
--   dcf_upside_pct    = (intrinsic_value - current_price) / current_price * 100
--   valuation_source  = 'model' | 'analyst' | null   (new column, for the UI)
--
-- Foreign listings are saved under their yfinance ticker (e.g. TSM → 2330.TW);
-- a small alias map bridges the common cases. Everything else matches on symbol.
create or replace view vw_nexus_holdings as
with portfolio_totals as (
  select sum(dollar_var_95_daily) as total_var from vw_risk_analysis
),
-- map a portfolio symbol → the ticker its valuation may be saved under
sym_alias(symbol, alias) as (
  values
    ('TSM','2330.TW'),
    ('TM','7203.T'),
    ('SONY','6758.T'),
    ('BABA','9988.HK'),
    ('TCEHY','0700.HK')
),
saved_val as (
  -- best (most recent) saved fair value per portfolio symbol, matching either
  -- the symbol directly or via the alias map, ignoring rows with no fair value
  select distinct on (sym) sym, avg_fair_value, last_run_at
  from (
    select h.symbol as sym, sc.avg_fair_value, sc.last_run_at
    from (select distinct symbol from vw_portfolio_home) h
      join sym_alias al on al.symbol = h.symbol
      join scrapbook_companies sc on upper(sc.ticker) = upper(al.alias)
    where sc.avg_fair_value is not null
    union all
    select sc.ticker as sym, sc.avg_fair_value, sc.last_run_at
    from scrapbook_companies sc
    where sc.avg_fair_value is not null
  ) u
  order by sym, last_run_at desc nulls last
),
fundamentals as (
  select distinct on (ec.symbol)
    ec.symbol,
    nullif(ec.payload -> 'overview' ->> 'PERatio', '')::numeric            as pe_ratio,
    nullif(ec.payload -> 'overview' ->> 'PEGRatio', '')::numeric           as peg_ratio,
    nullif(ec.payload -> 'overview' ->> 'Beta', '')::numeric               as beta,
    nullif(ec.payload -> 'overview' ->> 'AnalystTargetPrice', '')::numeric as analyst_target
  from equity_cache ec
  where ec.endpoint = 'overview'
  order by ec.symbol, ec.expires_at desc
),
base as (
  select
    p.symbol,
    coalesce(p.name, a.name) as asset_name,
    coalesce(p.sector, a.sector) as sector,
    p.market_value,
    p.current_price,
    round(p.weight_equity_pct * 100::numeric, 2) as weight_pct,
    round(p.daily_change_pct * 100::numeric, 3) as daily_return_pct,
    round(coalesce(p.return_5d_pct, 0::numeric) * 100::numeric, 3) as five_day_return_pct,
    p.total_gain_loss_dollar as pnl_contribution,
    round(coalesce(perf.total_return_pct, p.unrealised_return_pct, 0::numeric) * 100::numeric, 2) as total_return_pct,
    -- prefer a saved model fair value; fall back to the analyst target
    coalesce(sv.avg_fair_value, f.analyst_target) as intrinsic_value,
    case
      when coalesce(sv.avg_fair_value, f.analyst_target) is not null and p.current_price > 0
      then round((coalesce(sv.avg_fair_value, f.analyst_target) - p.current_price) / p.current_price * 100::numeric, 1)
    end as dcf_upside_pct,
    case
      when sv.avg_fair_value is not null then 'model'
      when f.analyst_target is not null then 'analyst'
      else null
    end as valuation_source,
    round(f.pe_ratio, 1) as fwd_pe,
    round(f.peg_ratio, 2) as peg_ratio,
    case
      when coalesce(p.sector, a.sector) in ('Real Estate','Financials','Fixed Income') then 'High'
      when coalesce(p.sector, a.sector) in ('Utilities','Consumer Discretionary') then 'Moderate'
      else 'Low'
    end as rate_sensitivity,
    case when coalesce(p.sector, a.sector) = 'International' then 'High' else 'Low' end as fx_exposure,
    round(f.beta, 2) as beta,
    round(sc.current_drawdown_pct::numeric, 2) as max_drawdown_pct,
    round((r.dollar_var_95_daily / nullif(pt.total_var, 0::double precision) * 100::double precision)::numeric, 2) as var_contribution_pct,
    q.price_regime, q.rsi_14, q.momentum_pct_rank_20d, q.mean_reversion_signal,
    p.quality_score,
    ec.earnings_date::date as next_earnings_date
  from vw_portfolio_home p
    cross join portfolio_totals pt
    left join assets a on a.symbol = p.symbol
    left join vw_performance_suite perf on perf.symbol = p.symbol
    left join vw_risk_analysis r on r.symbol = p.symbol
    left join vw_quant_dashboard q on q.symbol = p.symbol
    left join vw_screener sc on sc.symbol = p.symbol
    left join vw_earnings_calendar ec on ec.symbol = p.symbol
    left join fundamentals f on f.symbol = p.symbol
    left join saved_val sv on sv.sym = p.symbol
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
    case
      when rate_sensitivity = 'High' and price_regime = 'Downtrend' then 'Headwind'
      when rate_sensitivity = 'High' and price_regime = 'Uptrend' then 'Neutral'
      when rate_sensitivity = 'Low' and price_regime = 'Uptrend' then 'Tailwind'
      else 'Neutral'
    end as macro_signal,
    case
      when dcf_upside_pct is null then null
      when dcf_upside_pct >= 15 then 'Cheap'
      when dcf_upside_pct <= -10 then 'Rich'
      else 'Fair'
    end as valuation_signal
  from base
),
scored as (
  select derived.*,
    case
      when dcf_upside_pct is null then null
      else greatest(0, least(100, 50 + dcf_upside_pct))::numeric
    end as val_c,
    case macro_signal when 'Tailwind' then 70 when 'Headwind' then 30 else 50 end::numeric as mac_c,
    case technical_signal when 'Bull' then 80 when 'Neutral' then 50 else 30 end::numeric as tec_c,
    case quality_grade when 'A+' then 95 when 'A' then 85 when 'B+' then 70 when 'B' then 55 else 35 end::numeric as qual_c
  from derived
),
convict as (
  select scored.*,
    round(
      ( coalesce(0.35 * val_c, 0) + 0.25 * mac_c + 0.25 * tec_c + 0.15 * qual_c )
      / ( case when val_c is null then 0 else 0.35 end + 0.25 + 0.25 + 0.15 )
    )::integer as conviction_score
  from scored
)
select symbol, asset_name, sector, market_value, weight_pct, daily_return_pct,
  five_day_return_pct, total_return_pct, pnl_contribution, dcf_upside_pct,
  intrinsic_value, fwd_pe, peg_ratio, macro_signal as macro_regime_fit,
  rate_sensitivity, fx_exposure, beta, max_drawdown_pct, var_contribution_pct,
  valuation_signal, macro_signal, technical_signal, quality_grade, quant_signal, conviction_score,
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
  ' · Macro ' || macro_signal || ' · Quality ' || quality_grade ||
  coalesce(' · ' || valuation_signal, '') || '.' as nexus_insight,
  -- appended (CREATE OR REPLACE only allows new columns at the end)
  current_price,
  valuation_source
from convict
where market_value is not null and market_value > 0
order by market_value desc;
