-- Materialize vw_nexus_holdings to fix the terminal home timing out.
--
-- Problem: the Nexus home queries vw_nexus_holdings as the `anon` role, which
-- carries a 3s statement_timeout. The view recomputes window functions over the
-- full ~80k-row price_history table through every constituent analytics view
-- (quant, screener, performance, risk). Warm-cache it runs ~1.2s, but on a cold
-- cache in production it exceeds 3s and fails with
-- "canceling statement due to statement timeout".
--
-- Fix: snapshot the result into a materialized view (only ~57 rows) and have
-- vw_nexus_holdings read from it. Reads drop to <1ms. The snapshot is refreshed
-- at the end of each sync via refresh_nexus_holdings() (see sync-wrapper.mjs).

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_nexus_holdings AS
 WITH portfolio_totals AS (
         SELECT sum(vw_risk_analysis.dollar_var_95_daily) AS total_var
           FROM vw_risk_analysis
        ), sym_alias(symbol, alias) AS (
         VALUES ('TSM'::text,'2330.TW'::text), ('TM'::text,'7203.T'::text), ('SONY'::text,'6758.T'::text), ('BABA'::text,'9988.HK'::text), ('TCEHY'::text,'0700.HK'::text)
        ), saved_val AS (
         SELECT DISTINCT ON (u.sym) u.sym, u.avg_fair_value, u.last_run_at
           FROM ( SELECT h.symbol AS sym, sc.avg_fair_value, sc.last_run_at
                   FROM ( SELECT DISTINCT vw_portfolio_home.symbol FROM vw_portfolio_home) h
                     JOIN sym_alias al ON al.symbol = h.symbol
                     JOIN scrapbook_companies sc ON upper(sc.ticker) = upper(al.alias)
                  WHERE sc.avg_fair_value IS NOT NULL
                UNION ALL
                 SELECT sc.ticker AS sym, sc.avg_fair_value, sc.last_run_at
                   FROM scrapbook_companies sc
                  WHERE sc.avg_fair_value IS NOT NULL) u
          ORDER BY u.sym, u.last_run_at DESC NULLS LAST
        ), fundamentals AS (
         SELECT DISTINCT ON (ec.symbol) ec.symbol,
            NULLIF((ec.payload -> 'overview'::text) ->> 'PERatio'::text, ''::text)::numeric AS pe_ratio,
            NULLIF((ec.payload -> 'overview'::text) ->> 'PEGRatio'::text, ''::text)::numeric AS peg_ratio,
            NULLIF((ec.payload -> 'overview'::text) ->> 'Beta'::text, ''::text)::numeric AS beta,
            NULLIF((ec.payload -> 'overview'::text) ->> 'AnalystTargetPrice'::text, ''::text)::numeric AS analyst_target
           FROM equity_cache ec
          WHERE ec.endpoint = 'overview'::text
          ORDER BY ec.symbol, ec.expires_at DESC
        ), base AS (
         SELECT p.symbol,
            COALESCE(p.name, a.name) AS asset_name,
            COALESCE(p.sector, a.sector) AS sector,
            p.market_value, p.current_price,
            round(p.weight_equity_pct * 100::numeric, 2) AS weight_pct,
            round(p.daily_change_pct * 100::numeric, 3) AS daily_return_pct,
            round(COALESCE(p.return_5d_pct, 0::numeric) * 100::numeric, 3) AS five_day_return_pct,
            p.total_gain_loss_dollar AS pnl_contribution,
            round(COALESCE(perf.total_return_pct, p.unrealised_return_pct, 0::numeric) * 100::numeric, 2) AS total_return_pct,
            COALESCE(sv.avg_fair_value, f.analyst_target) AS intrinsic_value,
                CASE
                    WHEN COALESCE(sv.avg_fair_value, f.analyst_target) IS NOT NULL AND p.current_price > 0::numeric THEN round((COALESCE(sv.avg_fair_value, f.analyst_target) - p.current_price) / p.current_price * 100::numeric, 1)
                    ELSE NULL::numeric
                END AS dcf_upside_pct,
                CASE
                    WHEN sv.avg_fair_value IS NOT NULL THEN 'model'::text
                    WHEN f.analyst_target IS NOT NULL THEN 'analyst'::text
                    ELSE NULL::text
                END AS valuation_source,
            round(f.pe_ratio, 1) AS fwd_pe,
            round(f.peg_ratio, 2) AS peg_ratio,
                CASE
                    WHEN COALESCE(p.sector, a.sector) = ANY (ARRAY['Real Estate'::text, 'Financials'::text, 'Fixed Income'::text]) THEN 'High'::text
                    WHEN COALESCE(p.sector, a.sector) = ANY (ARRAY['Utilities'::text, 'Consumer Discretionary'::text]) THEN 'Moderate'::text
                    ELSE 'Low'::text
                END AS rate_sensitivity,
                CASE
                    WHEN COALESCE(p.sector, a.sector) = 'International'::text THEN 'High'::text
                    ELSE 'Low'::text
                END AS fx_exposure,
            round(f.beta, 2) AS beta,
            round(sc.current_drawdown_pct, 2) AS max_drawdown_pct,
            round((r.dollar_var_95_daily / NULLIF(pt.total_var, 0::double precision) * 100::double precision)::numeric, 2) AS var_contribution_pct,
            q.price_regime, q.rsi_14, q.momentum_pct_rank_20d, q.mean_reversion_signal,
            p.quality_score, ec.earnings_date AS next_earnings_date
           FROM vw_portfolio_home p
             CROSS JOIN portfolio_totals pt
             LEFT JOIN assets a ON a.symbol = p.symbol
             LEFT JOIN vw_performance_suite perf ON perf.symbol = p.symbol
             LEFT JOIN vw_risk_analysis r ON r.symbol = p.symbol
             LEFT JOIN vw_quant_dashboard q ON q.symbol = p.symbol
             LEFT JOIN vw_screener sc ON sc.symbol = p.symbol
             LEFT JOIN vw_earnings_calendar ec ON ec.symbol = p.symbol
             LEFT JOIN fundamentals f ON f.symbol = p.symbol
             LEFT JOIN saved_val sv ON sv.sym = p.symbol
        ), derived AS (
         SELECT base.*,
                CASE
                    WHEN base.price_regime = 'Uptrend'::text AND COALESCE(base.rsi_14, 50::numeric) < 70::numeric THEN 'Bull'::text
                    WHEN base.price_regime = 'Uptrend'::text AND COALESCE(base.rsi_14, 50::numeric) >= 70::numeric THEN 'Wary'::text
                    WHEN base.price_regime = 'Downtrend'::text THEN 'Wary'::text
                    ELSE 'Neutral'::text
                END AS technical_signal,
                CASE
                    WHEN COALESCE(base.quality_score, 0::numeric) >= 85::numeric THEN 'A+'::text
                    WHEN COALESCE(base.quality_score, 0::numeric) >= 75::numeric THEN 'A'::text
                    WHEN COALESCE(base.quality_score, 0::numeric) >= 65::numeric THEN 'B+'::text
                    WHEN COALESCE(base.quality_score, 0::numeric) >= 55::numeric THEN 'B'::text
                    ELSE 'C'::text
                END AS quality_grade,
                CASE
                    WHEN base.price_regime = 'Uptrend'::text AND COALESCE(base.momentum_pct_rank_20d, 0::numeric) >= 60::numeric THEN 'Long'::text
                    WHEN base.price_regime = 'Downtrend'::text THEN 'Short'::text
                    ELSE 'Hold'::text
                END AS quant_signal,
                CASE
                    WHEN base.rate_sensitivity = 'High'::text AND base.price_regime = 'Downtrend'::text THEN 'Headwind'::text
                    WHEN base.rate_sensitivity = 'High'::text AND base.price_regime = 'Uptrend'::text THEN 'Neutral'::text
                    WHEN base.rate_sensitivity = 'Low'::text AND base.price_regime = 'Uptrend'::text THEN 'Tailwind'::text
                    ELSE 'Neutral'::text
                END AS macro_signal,
                CASE
                    WHEN base.dcf_upside_pct IS NULL THEN NULL::text
                    WHEN base.dcf_upside_pct >= 15::numeric THEN 'Cheap'::text
                    WHEN base.dcf_upside_pct <= '-10'::integer::numeric THEN 'Rich'::text
                    ELSE 'Fair'::text
                END AS valuation_signal
           FROM base
        ), scored AS (
         SELECT derived.*,
                CASE
                    WHEN derived.dcf_upside_pct IS NULL THEN NULL::numeric
                    ELSE GREATEST(0::numeric, LEAST(100::numeric, 50::numeric + derived.dcf_upside_pct))
                END AS val_c,
                CASE derived.macro_signal WHEN 'Tailwind'::text THEN 70 WHEN 'Headwind'::text THEN 30 ELSE 50 END::numeric AS mac_c,
                CASE derived.technical_signal WHEN 'Bull'::text THEN 80 WHEN 'Neutral'::text THEN 50 ELSE 30 END::numeric AS tec_c,
                CASE derived.quality_grade WHEN 'A+'::text THEN 95 WHEN 'A'::text THEN 85 WHEN 'B+'::text THEN 70 WHEN 'B'::text THEN 55 ELSE 35 END::numeric AS qual_c
           FROM derived
        ), convict AS (
         SELECT scored.*,
            round((COALESCE(0.35 * scored.val_c, 0::numeric) + 0.25 * scored.mac_c + 0.25 * scored.tec_c + 0.15 * scored.qual_c) / (
                CASE WHEN scored.val_c IS NULL THEN 0::numeric ELSE 0.35 END + 0.25 + 0.25 + 0.15))::integer AS conviction_score
           FROM scored
        )
 SELECT symbol, asset_name, sector, market_value, weight_pct, daily_return_pct, five_day_return_pct,
    total_return_pct, pnl_contribution, dcf_upside_pct, intrinsic_value, fwd_pe, peg_ratio,
    macro_signal AS macro_regime_fit, rate_sensitivity, fx_exposure, beta, max_drawdown_pct,
    var_contribution_pct, valuation_signal, macro_signal, technical_signal, quality_grade, quant_signal,
    conviction_score,
        CASE
            WHEN conviction_score >= 75 AND weight_pct < 10::numeric THEN 'Add'::text
            WHEN conviction_score >= 60 AND conviction_score <= 74 THEN 'Hold'::text
            WHEN conviction_score >= 45 AND conviction_score <= 59 OR weight_pct > 10::numeric THEN 'Trim'::text
            ELSE 'Exit'::text
        END AS recommended_action,
    next_earnings_date,
        CASE
            WHEN COALESCE(var_contribution_pct, 0::numeric) > 2.5 AND weight_pct > 8::numeric THEN 'conflict'::text
            WHEN weight_pct > 10::numeric THEN 'risk'::text
            WHEN conviction_score >= 75 THEN 'opportunity'::text
            ELSE NULL::text
        END AS alert_flag,
    (((((((('Weight '::text || round(weight_pct, 1)) || '% · Tech '::text) || technical_signal) || ' · Macro '::text) || macro_signal) || ' · Quality '::text) || quality_grade) || COALESCE(' · '::text || valuation_signal, ''::text)) || '.'::text AS nexus_insight,
    current_price, valuation_source
   FROM convict
  WHERE market_value IS NOT NULL AND market_value > 0::numeric
  ORDER BY market_value DESC;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS mv_nexus_holdings_symbol_idx ON mv_nexus_holdings (symbol);

-- Repoint the public view at the snapshot so the frontend needs no change.
DROP VIEW IF EXISTS vw_nexus_holdings;
CREATE VIEW vw_nexus_holdings AS SELECT * FROM mv_nexus_holdings;

GRANT SELECT ON mv_nexus_holdings TO anon, authenticated, service_role;
GRANT SELECT ON vw_nexus_holdings TO anon, authenticated, service_role;

-- Concurrent refresh helper invoked at the end of each sync.
CREATE OR REPLACE FUNCTION refresh_nexus_holdings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_nexus_holdings;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_nexus_holdings() TO service_role;
