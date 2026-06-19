-- Fix B-03 (QA audit): Nexus holding weights were % of account equity, so on a
-- ~1.4x-levered book they summed to 142.78% and disagreed with the Portfolio
-- page (which already uses % of long market value, e.g. TSM 4.75%). Per the
-- agreed convention, weights are now % of long market value (Σ ≈ 100%).
--
-- Done in the thin wrapper view vw_nexus_holdings only — the materialized view
-- mv_nexus_holdings, its indexes, the refresh function and the pg_cron schedule
-- are all left untouched. weight_pct is recomputed as a window over the
-- materialized rows, and the three weight-derived fields (recommended_action,
-- alert_flag, nexus_insight) are recomputed from the same basis so the labels
-- stay consistent with the displayed weight.

CREATE OR REPLACE VIEW vw_nexus_holdings AS
WITH w AS (
    SELECT m.*,
           round(m.market_value / NULLIF(sum(m.market_value) OVER (), 0) * 100::numeric, 2) AS weight_long_pct
    FROM mv_nexus_holdings m
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
    valuation_source
FROM w;
