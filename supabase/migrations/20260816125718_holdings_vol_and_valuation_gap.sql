-- Three more facts on the Nexus holdings feed: how volatile a name is, what it
-- costs on forward earnings, and how that compares to the market.
--
-- ── annual_vol ───────────────────────────────────────────────────────────────
-- From universe_risk_stats, the nightly snapshot refresh_universe_correlations
-- already writes. 53 of 56 held names are covered; the rest render as "—"
-- rather than borrowing a number from somewhere else.
--
-- ── market_fwd_pe ────────────────────────────────────────────────────────────
-- "The market" here is the MEDIAN forward P/E across equity_screener_universe —
-- 287 usable names, currently 15.25×. That is a proxy, and it is worth being
-- precise about which one:
--
--   * It is a median, not cap-weighted, so it describes the typical listed
--     company rather than the index. A cap-weighted figure would be dragged up
--     by the same mega-caps this book already owns, which would flatter the
--     comparison exactly where it should not.
--   * Names with a negative or absurd multiple (loss-makers, data errors) are
--     excluded via the 0–200 band. A negative P/E is not a cheap P/E.
--   * It moves as the screener refreshes. It is not a pinned index level.
--
-- The book's own median is 23.5×, so the premium this exposes is real and
-- roughly +54%. That is the number the column exists to make unavoidable.
--
-- ── fwd_pe_premium_pct ───────────────────────────────────────────────────────
-- (fwd_pe / market_fwd_pe − 1) × 100. NULL when the name has no forward P/E —
-- 16 of 56 don't — because "no multiple" is not "in line with the market".
create or replace view public.vw_nexus_holdings as
 WITH mkt AS (
         SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY equity_screener_universe.forward_pe)::numeric AS median_fwd_pe,
                count(*) AS n
           FROM equity_screener_universe
          WHERE equity_screener_universe.forward_pe IS NOT NULL
            AND equity_screener_universe.forward_pe > 0::numeric
            AND equity_screener_universe.forward_pe < 200::numeric
        ), vol AS (
         SELECT DISTINCT ON (universe_risk_stats.symbol) universe_risk_stats.symbol,
                universe_risk_stats.vol_annual
           FROM universe_risk_stats
          WHERE universe_risk_stats.window_days = 120
          ORDER BY universe_risk_stats.symbol, universe_risk_stats.as_of_date DESC
        ), w AS (
         SELECT m.symbol, m.asset_name, m.sector, m.market_value, m.weight_pct,
            m.daily_return_pct, m.five_day_return_pct, m.total_return_pct, m.pnl_contribution,
            m.dcf_upside_pct, m.intrinsic_value, m.fwd_pe, m.peg_ratio, m.macro_regime_fit,
            m.rate_sensitivity, m.fx_exposure, m.beta, m.max_drawdown_pct, m.var_contribution_pct,
            m.valuation_signal, m.macro_signal, m.technical_signal, m.quality_grade, m.quant_signal,
            m.conviction_score, m.recommended_action, m.next_earnings_date, m.alert_flag,
            m.nexus_insight, m.current_price, m.valuation_source,
            round(m.market_value / NULLIF(sum(m.market_value) OVER (), 0::numeric) * 100::numeric, 2) AS weight_long_pct,
            ph.unrealised_return_pct * 100::numeric AS unrealised_return_pct_src,
            pt.theme AS theme_src,
            v.vol_annual AS annual_vol_src,
            mk.median_fwd_pe AS market_fwd_pe_src
           FROM mv_nexus_holdings m
             LEFT JOIN vw_portfolio_home ph ON ph.symbol = m.symbol
             LEFT JOIN position_themes pt ON pt.symbol = m.symbol
             LEFT JOIN vol v ON v.symbol = m.symbol
             CROSS JOIN mkt mk
        )
 SELECT symbol, asset_name, sector, market_value,
    weight_long_pct AS weight_pct,
    daily_return_pct, five_day_return_pct, total_return_pct, pnl_contribution,
    dcf_upside_pct, intrinsic_value, fwd_pe, peg_ratio, macro_regime_fit,
    rate_sensitivity, fx_exposure, beta, max_drawdown_pct, var_contribution_pct,
    valuation_signal, macro_signal, technical_signal, quality_grade, quant_signal,
    conviction_score,
        CASE WHEN conviction_score >= 75 AND weight_long_pct < 10::numeric THEN 'Add'::text
             WHEN conviction_score >= 60 AND conviction_score <= 74 THEN 'Hold'::text
             WHEN conviction_score >= 45 AND conviction_score <= 59 OR weight_long_pct > 10::numeric THEN 'Trim'::text
             ELSE 'Exit'::text END AS recommended_action,
    next_earnings_date,
        CASE WHEN COALESCE(var_contribution_pct, 0::numeric) > 2.5 AND weight_long_pct > 8::numeric THEN 'conflict'::text
             WHEN weight_long_pct > 10::numeric THEN 'risk'::text
             WHEN conviction_score >= 75 THEN 'opportunity'::text
             ELSE NULL::text END AS alert_flag,
    (((((((('Weight '::text || round(weight_long_pct, 1)) || '% · Tech '::text) || technical_signal) || ' · Macro '::text)
      || macro_signal) || ' · Quality '::text) || quality_grade) || COALESCE(' · '::text || valuation_signal, ''::text)) || '.'::text AS nexus_insight,
    current_price, valuation_source,
    unrealised_return_pct_src AS unrealised_return_pct,
    theme_src AS theme,
    round(annual_vol_src::numeric, 4) AS annual_vol,
    round(market_fwd_pe_src, 2) AS market_fwd_pe,
        CASE WHEN fwd_pe IS NOT NULL AND fwd_pe > 0::numeric AND market_fwd_pe_src > 0::numeric
             THEN round((fwd_pe / market_fwd_pe_src - 1::numeric) * 100::numeric, 1)
             ELSE NULL::numeric END AS fwd_pe_premium_pct
   FROM w;

comment on view public.vw_nexus_holdings is
  'Nexus flagship holdings feed. Carries BOTH sector (GICS-style, from assets) and theme (the hand-kept position_themes taxonomy) — they are different questions and the UI groups by either. theme is NULL for unmapped names; do not coalesce it into a bucket, the spine reports the unmapped weight explicitly. market_fwd_pe is the MEDIAN forward P/E of equity_screener_universe (not cap-weighted, 0<pe<200), so fwd_pe_premium_pct compares a name to the typical listed company rather than to an index the book already crowds.';
