-- Source-of-truth fixes (QA audit), all contained in the thin wrapper view
-- vw_nexus_holdings — the materialized view mv_nexus_holdings, its indexes, the
-- refresh function and the pg_cron schedule are left untouched.
--
-- B-03: holding weights were % of account equity, so on a ~1.4x-levered book
--   they summed to 142.78% and disagreed with the Portfolio page (which uses
--   % of long market value, e.g. TSM 4.75%). Recompute weight_pct as % of long
--   market value (Σ = 100%); the three weight-derived fields
--   (recommended_action, alert_flag, nexus_insight) are recomputed from the
--   same basis so labels stay consistent.
--
-- B-06: expose unrealised_return_pct (broker mark vs cost, from vw_portfolio_home)
--   as a trailing column so the Nexus win-rate tile counts winners on the same
--   basis as the Portfolio page (unrealised P&L), instead of total_return_pct.

CREATE OR REPLACE VIEW vw_nexus_holdings AS
WITH w AS (
    SELECT m.*,
           round(m.market_value / NULLIF(sum(m.market_value) OVER (), 0) * 100::numeric, 2) AS weight_long_pct,
           ph.unrealised_return_pct * 100::numeric AS unrealised_return_pct_src
    FROM mv_nexus_holdings m
    LEFT JOIN vw_portfolio_home ph ON ph.symbol = m.symbol
)
SELECT
    symbol,
    asset_name,
    sector,
    market_value,
    weight_long_pct AS weight_pct,
    daily_return_pct,
    five_day_return_pct,
    total_return_pct,
    pnl_contribution,
    dcf_upside_pct,
    intrinsic_value,
    fwd_pe,
    peg_ratio,
    macro_regime_fit,
    rate_sensitivity,
    fx_exposure,
    beta,
    max_drawdown_pct,
    var_contribution_pct,
    valuation_signal,
    macro_signal,
    technical_signal,
    quality_grade,
    quant_signal,
    conviction_score,
    CASE
        WHEN conviction_score >= 75 AND weight_long_pct < 10::numeric THEN 'Add'::text
        WHEN conviction_score >= 60 AND conviction_score <= 74 THEN 'Hold'::text
        WHEN (conviction_score >= 45 AND conviction_score <= 59) OR weight_long_pct > 10::numeric THEN 'Trim'::text
        ELSE 'Exit'::text
    END AS recommended_action,
    next_earnings_date,
    CASE
        WHEN COALESCE(var_contribution_pct, 0::numeric) > 2.5 AND weight_long_pct > 8::numeric THEN 'conflict'::text
        WHEN weight_long_pct > 10::numeric THEN 'risk'::text
        WHEN conviction_score >= 75 THEN 'opportunity'::text
        ELSE NULL::text
    END AS alert_flag,
    (((((((('Weight '::text || round(weight_long_pct, 1)) || '% · Tech '::text) || technical_signal) || ' · Macro '::text) || macro_signal) || ' · Quality '::text) || quality_grade) || COALESCE(' · '::text || valuation_signal, ''::text)) || '.'::text AS nexus_insight,
    current_price,
    valuation_source,
    unrealised_return_pct_src AS unrealised_return_pct
FROM w;
