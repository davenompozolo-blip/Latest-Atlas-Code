-- A move computed from a 158-day-old bar is not today's move.
--
-- KMTUY (2.03% of book), VWAGY, NPSNY and PROSY are OTC ADRs the price feed
-- does not cover; their last close is 144-158 days old. The view already
-- flagged them `stale`, but it went on publishing today_pct and contrib_pct
-- from those bars anyway, and every consumer treated them as live. That is
-- how the Theme tab came to report "China internet (ADRs) -3.7%, NPSNY
-- driving" — a sector attribution resting entirely on a print from March.
--
-- The house rule is already written down: a null renders an em dash and its
-- reason, never a substituted number. These columns now follow it.
--
-- The threshold is 7 days, matching STALE_PRICE_DAYS in nexusDataIntegrity.js
-- rather than the view's own `stale` flag at >4 days. 4 is right for badging a
-- row as stale but too tight to null a number on: a Thursday close before a
-- Friday holiday is 5 calendar days old by Tuesday, and nulling healthy
-- names over a long weekend would be its own false alarm. 7 clears every
-- weekend-plus-holiday and still isolates a feed that has actually stopped.
--
-- price_days_old is published so a consumer can say WHY a move is missing
-- instead of rendering a bare dash.

CREATE OR REPLACE VIEW public.nexus_holdings AS
 WITH latest AS (
         SELECT max(positions.as_of_date) AS d FROM positions
        ), cur AS (
         SELECT p.asset_id, a.symbol, a.name, p.market_value
           FROM positions p JOIN assets a ON a.id = p.asset_id
          WHERE p.as_of_date = (( SELECT latest.d FROM latest)) AND p.market_value > 0::numeric
        ), tot AS (
         SELECT sum(cur_1.market_value) AS tmv FROM cur cur_1
        ), varbase AS (
         SELECT sum(insight_counter_specific_var_vs_sector.stock_var_95) AS sv FROM insight_counter_specific_var_vs_sector
        ), px2 AS (
         SELECT cur_2.asset_id,
            max(CASE WHEN t.rn = 1 THEN t.close ELSE NULL::numeric END) AS last_close,
            max(CASE WHEN t.rn = 2 THEN t.close ELSE NULL::numeric END) AS prev_close,
            max(t.price_date) AS last_date
           FROM cur cur_2
           CROSS JOIN LATERAL (
                SELECT ph.close, ph.price_date,
                       row_number() OVER (ORDER BY ph.price_date DESC) AS rn
                  FROM price_history ph
                 WHERE ph.asset_id = cur_2.asset_id AND ph."interval" = '1d'::text
                 ORDER BY ph.price_date DESC
                 LIMIT 2
           ) t
          GROUP BY cur_2.asset_id
        ), conv AS (
         SELECT DISTINCT ON (decisions.symbol) decisions.symbol, decisions.conviction FROM decisions ORDER BY decisions.symbol, decisions.seq DESC
        ), latest_run AS (
         SELECT scrapbook_snapshots.company_id, max(scrapbook_snapshots.run_date) AS rd FROM scrapbook_snapshots GROUP BY scrapbook_snapshots.company_id
        ), disp AS (
         SELECT s.company_id,
            count(DISTINCT s.method) FILTER (WHERE s.implied_price > 0::numeric) AS n_methods,
            min(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS lo,
            max(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS hi,
            avg(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS mean_px
           FROM scrapbook_snapshots s JOIN latest_run lr ON lr.company_id = s.company_id AND lr.rd = s.run_date
          GROUP BY s.company_id
        ), fv AS (
         SELECT c_1.ticker, c_1.avg_fair_value, c_1.last_run_at::date AS run_date,
            COALESCE(d.n_methods, 0::bigint) AS n_methods,
            CASE WHEN d.mean_px > 0::numeric THEN (d.hi - d.lo) / d.mean_px ELSE NULL::numeric END AS band_frac
           FROM scrapbook_companies c_1 LEFT JOIN disp d ON d.company_id = c_1.id
          WHERE c_1.avg_fair_value IS NOT NULL AND c_1.avg_fair_value > 0::numeric
        ), mv AS (
         -- One place decides whether this name has a publishable move, so
         -- today_pct and contrib_pct can never disagree about it.
         SELECT px2.asset_id, px2.last_close, px2.prev_close, px2.last_date,
                (CURRENT_DATE - px2.last_date) AS days_old,
                (px2.prev_close > 0::numeric AND (CURRENT_DATE - px2.last_date) <= 7) AS move_publishable
           FROM px2
        )
 SELECT cur.symbol AS tk,
    COALESCE(pt.theme, 'Unmapped'::text) AS theme,
    COALESCE(c.conviction, 49) AS conviction,
    c.conviction IS NOT NULL AS pcm_rated,
    round(cur.market_value / NULLIF(t.tmv, 0::numeric) * 100::numeric, 2) AS weight_pct,
    CASE WHEN mv.move_publishable THEN round((mv.last_close / mv.prev_close - 1::numeric) * 100::numeric, 2) ELSE NULL::numeric END AS today_pct,
    CASE WHEN mv.move_publishable THEN round((mv.last_close / mv.prev_close - 1::numeric) * (cur.market_value / NULLIF(t.tmv, 0::numeric)) * 100::numeric, 3) ELSE NULL::numeric END AS contrib_pct,
    round(COALESCE(v.stock_var_95, 0::numeric) / NULLIF(vb.sv, 0::numeric) * 100::numeric, 1) AS component_var,
    CASE WHEN fv.avg_fair_value IS NOT NULL AND mv.last_close > 0::numeric THEN round((fv.avg_fair_value / mv.last_close - 1::numeric) * 100::numeric, 1) ELSE NULL::numeric END AS fv_gap_pct,
    NULL::text AS signal,
    'neutral'::text AS signal_tone,
    COALESCE(mv.days_old > 4, true) AS stale,
    fv.avg_fair_value IS NOT NULL AND mv.last_close > 0::numeric AND (CURRENT_DATE - fv.run_date) <= 14 AND fv.n_methods >= 2 AND fv.band_frac <= 0.40 AS fv_trustworthy,
    CASE
        WHEN fv.avg_fair_value IS NULL OR mv.last_close IS NULL OR mv.last_close <= 0::numeric THEN 'no valuation on file'::text
        WHEN (CURRENT_DATE - fv.run_date) > 14 THEN ('valuation '::text || ((CURRENT_DATE - fv.run_date)::text)) || 'd stale'::text
        WHEN fv.n_methods < 2 THEN 'single method only'::text
        WHEN fv.band_frac > 0.40 THEN ('methods disagree '::text || round(fv.band_frac * 100::numeric)::text) || '%'::text
        ELSE NULL::text
    END AS fv_untrust_reason,
    mv.days_old AS price_days_old
   FROM cur
     CROSS JOIN tot t
     CROSS JOIN varbase vb
     LEFT JOIN position_themes pt ON pt.symbol = cur.symbol
     LEFT JOIN conv c ON c.symbol = cur.symbol
     LEFT JOIN mv ON mv.asset_id = cur.asset_id
     LEFT JOIN fv ON fv.ticker = cur.symbol
     LEFT JOIN insight_counter_specific_var_vs_sector v ON v.symbol = cur.symbol
  ORDER BY cur.market_value DESC;
