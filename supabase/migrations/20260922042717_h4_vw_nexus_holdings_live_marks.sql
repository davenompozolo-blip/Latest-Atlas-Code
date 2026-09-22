-- H-4: the read path must not serve a mark from two places.
--
-- vw_nexus_holdings drove its rows from mv_nexus_holdings -- a 10-minute
-- matview -- while joining the live vw_portfolio_home for a handful of
-- columns. positions sync every 5 minutes, so the mark on the matview and the
-- mark on the live view are two different numbers at the same instant.
-- Measured on the live book at 19:35 UTC mid-session: 58 of 64 held names
-- carried a different price between them, worst gap 2.38%. Panels descending
-- from the matview (the holdings table, the Theme cut, the bench docket,
-- contribution) therefore disagreed with panels on the live view WITHIN ONE
-- PAGE LOAD.
--
-- H-3 already moved daily_return_pct and five_day_return_pct onto the live
-- view "so the figure and its move_publishable flag come from one row and
-- cannot disagree". It did not extend that to the mark itself, so
-- current_price, market_value, weight_pct and everything derived from them
-- stayed on the snapshot -- which is the larger half.
--
-- The fix is the same construction generalised: the BOOK is live, the
-- ANALYTICS are cached.
--
--   * the row set is driven by vw_portfolio_home, so an exit leaves and an
--     entry arrives within one positions sync rather than within one matview
--     refresh;
--   * every column that is a function of the mark is computed here, from the
--     one live row: market_value, current_price, weight_pct, pnl_contribution,
--     dcf_upside_pct, valuation_signal, quality_grade, conviction_score,
--     recommended_action, alert_flag, nexus_insight;
--   * mv_nexus_holdings is LEFT JOINed for what it is actually for -- the
--     expensive, mark-independent analytics behind vw_performance_suite,
--     vw_risk_analysis, vw_quant_dashboard, vw_screener and equity_cache:
--     intrinsic_value, fwd_pe inputs, peg_ratio, beta, max_drawdown_pct,
--     var_contribution_pct, technical_signal, macro_signal, quant_signal,
--     next_earnings_date, valuation_source, total_return_pct.
--
-- This costs nothing. vw_portfolio_home was ALREADY in the FROM clause, so no
-- join is added; the change is which side of an existing join each column
-- comes from. EXPLAIN puts the matview at 7 buffers / 0.058 ms of a 547 ms
-- read -- it buys nothing at read time here, and everything at build time,
-- which is exactly the split this patch draws.
--
-- AN ABSENT ANALYTICS ROW MUST NOT PRODUCE A VERDICT. A name bought minutes
-- ago has no matview row yet, and recommended_action's CASE ends in ELSE
-- 'Exit' -- so a NULL conviction_score would have labelled a just-bought
-- position "Exit". conviction_score, recommended_action, alert_flag and
-- nexus_insight are withheld (NULL) when the analytics row is absent, never
-- defaulted. Same rule as A2's absent beta: a renderer cannot print a number
-- it was never handed.
--
-- Written as a full body rather than as a textual patch against
-- pg_get_viewdef. The view family's idiom is the patch, and that idiom is
-- right for a localised change; this one flips the join driver and adds two
-- CTEs, so a patch would carry more anchors than body. The applied definition
-- is hashed against this file instead.
--
-- Proven before applying: column names, order and types identical on all 39
-- columns (0 mismatches), and with the matview REFRESHed current, EXCEPT ALL
-- both ways returns 0 over all 39 columns x 64 rows -- the live recomputation
-- reproduces the matview's arithmetic exactly. Any difference at any other
-- instant is precisely the drift being removed.
--
-- NOT fixed here, recorded: mv_nexus_holdings.total_return_pct is
-- COALESCE(vw_performance_suite.total_return_pct, p.unrealised_return_pct, 0).
-- 63 of 64 rows take the first branch, which is a since-entry figure off daily
-- bars and not an intraday mark. One row takes the fallback and is therefore
-- still served from the snapshot. That COALESCE is a cross-basis substitution
-- of the kind nexusReturnBasis.js exists to forbid; it predates this work and
-- changing it re-bases a published column with six consumers, so it is its own
-- unit.

create or replace view public.vw_nexus_holdings as
 WITH mkt AS (
         SELECT percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (equity_screener_universe.forward_pe::double precision))::numeric AS median_fwd_pe,
            count(*) AS n
           FROM equity_screener_universe
          WHERE equity_screener_universe.forward_pe IS NOT NULL AND equity_screener_universe.forward_pe > 0::numeric AND equity_screener_universe.forward_pe < 200::numeric
        ), vol AS (
         SELECT DISTINCT ON (universe_risk_stats.symbol) universe_risk_stats.symbol,
            universe_risk_stats.vol_annual
           FROM universe_risk_stats
          WHERE universe_risk_stats.window_days = 120
          ORDER BY universe_risk_stats.symbol, universe_risk_stats.as_of_date DESC
        ), w AS (
         SELECT ph.symbol,
            COALESCE(m.asset_name, ph.name) AS asset_name,
            COALESCE(m.sector, ph.sector) AS sector,
            ph.market_value,
            round(ph.daily_change_pct * 100::numeric, 3) AS daily_return_pct,
            round(ph.return_5d_pct * 100::numeric, 3) AS five_day_return_pct,
            m.total_return_pct,
            ph.total_gain_loss_dollar AS pnl_contribution,
            CASE
                WHEN m.intrinsic_value IS NOT NULL AND ph.current_price > 0::numeric
                THEN round((m.intrinsic_value - ph.current_price) / ph.current_price * 100::numeric, 1)
                ELSE NULL::numeric
            END AS dcf_upside_pct,
            m.intrinsic_value,
            round(esu.forward_pe, 1) AS fwd_pe,
            m.peg_ratio,
            m.macro_regime_fit,
            m.rate_sensitivity,
            m.fx_exposure,
            m.beta,
            m.max_drawdown_pct,
            m.var_contribution_pct,
            m.macro_signal,
            m.technical_signal,
            m.quant_signal,
            m.next_earnings_date,
            ph.current_price,
            m.valuation_source,
            (m.symbol IS NOT NULL) AS has_analytics,
            round(ph.market_value / NULLIF(sum(ph.market_value) OVER (), 0::numeric) * 100::numeric, 2) AS weight_long_pct,
            ph.unrealised_return_pct * 100::numeric AS unrealised_return_pct_src,
            pt.theme AS theme_src,
            v.vol_annual AS annual_vol_src,
            mk.median_fwd_pe AS market_fwd_pe_src,
            ph.last_bar_date AS last_bar_date_src,
            ph.price_days_old AS price_days_old_src,
            COALESCE(ph.move_publishable, false) AS move_publishable_src,
            CASE
                WHEN COALESCE(ph.quality_score, 0::numeric) >= 85::numeric THEN 'A+'::text
                WHEN COALESCE(ph.quality_score, 0::numeric) >= 75::numeric THEN 'A'::text
                WHEN COALESCE(ph.quality_score, 0::numeric) >= 65::numeric THEN 'B+'::text
                WHEN COALESCE(ph.quality_score, 0::numeric) >= 55::numeric THEN 'B'::text
                ELSE 'C'::text
            END AS quality_grade
           FROM vw_portfolio_home ph
             LEFT JOIN mv_nexus_holdings m ON m.symbol = ph.symbol
             LEFT JOIN position_themes pt ON pt.symbol = ph.symbol
             LEFT JOIN vol v ON v.symbol = ph.symbol
             LEFT JOIN equity_screener_universe esu ON esu.symbol = ph.symbol
             CROSS JOIN mkt mk
          WHERE ph.market_value IS NOT NULL AND ph.market_value > 0::numeric
        ), graded AS (
         SELECT w.*,
            CASE
                WHEN w.dcf_upside_pct IS NULL THEN NULL::text
                WHEN w.dcf_upside_pct >= 15::numeric THEN 'Cheap'::text
                WHEN w.dcf_upside_pct <= '-10'::integer::numeric THEN 'Rich'::text
                ELSE 'Fair'::text
            END AS valuation_signal,
            CASE
                WHEN w.dcf_upside_pct IS NULL THEN NULL::numeric
                ELSE GREATEST(0::numeric, LEAST(100::numeric, 50::numeric + w.dcf_upside_pct))
            END AS val_c
           FROM w
        ), convict AS (
         SELECT graded.*,
            CASE WHEN graded.has_analytics THEN round(
                (COALESCE(0.35 * graded.val_c, 0::numeric)
                 + 0.25 * (CASE graded.macro_signal WHEN 'Tailwind'::text THEN 70 WHEN 'Headwind'::text THEN 30 ELSE 50 END)::numeric
                 + 0.25 * (CASE graded.technical_signal WHEN 'Bull'::text THEN 80 WHEN 'Neutral'::text THEN 50 ELSE 30 END)::numeric
                 + 0.15 * (CASE graded.quality_grade WHEN 'A+'::text THEN 95 WHEN 'A'::text THEN 85 WHEN 'B+'::text THEN 70 WHEN 'B'::text THEN 55 ELSE 35 END)::numeric)
                / ((CASE WHEN graded.val_c IS NULL THEN 0::numeric ELSE 0.35 END) + 0.25 + 0.25 + 0.15)
            )::integer ELSE NULL::integer END AS conviction_score
           FROM graded
        )
 SELECT symbol,
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
            WHEN conviction_score IS NULL THEN NULL::text
            WHEN conviction_score >= 75 AND weight_long_pct < 10::numeric THEN 'Add'::text
            WHEN conviction_score >= 60 AND conviction_score <= 74 THEN 'Hold'::text
            WHEN conviction_score >= 45 AND conviction_score <= 59 OR weight_long_pct > 10::numeric THEN 'Trim'::text
            ELSE 'Exit'::text
        END AS recommended_action,
    next_earnings_date,
        CASE
            WHEN NOT has_analytics THEN NULL::text
            WHEN COALESCE(var_contribution_pct, 0::numeric) > 2.5 AND weight_long_pct > 8::numeric THEN 'conflict'::text
            WHEN weight_long_pct > 10::numeric THEN 'risk'::text
            WHEN conviction_score >= 75 THEN 'opportunity'::text
            ELSE NULL::text
        END AS alert_flag,
        CASE
            WHEN NOT has_analytics THEN NULL::text
            ELSE (((((((('Weight '::text || round(weight_long_pct, 1)) || '% · Tech '::text) || technical_signal) || ' · Macro '::text) || macro_signal) || ' · Quality '::text) || quality_grade) || COALESCE(' · '::text || valuation_signal, ''::text)) || '.'::text
        END AS nexus_insight,
    current_price,
    valuation_source,
    unrealised_return_pct_src AS unrealised_return_pct,
    theme_src AS theme,
    round(annual_vol_src, 4) AS annual_vol,
    round(market_fwd_pe_src, 2) AS market_fwd_pe,
        CASE
            WHEN fwd_pe IS NOT NULL AND fwd_pe > 0::numeric AND market_fwd_pe_src > 0::numeric THEN round((fwd_pe / market_fwd_pe_src - 1::numeric) * 100::numeric, 1)
            ELSE NULL::numeric
        END AS fwd_pe_premium_pct,
    last_bar_date_src AS last_bar_date,
    price_days_old_src AS price_days_old,
    move_publishable_src AS move_publishable
   FROM convict
;
