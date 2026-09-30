-- The Bench, spec §5.1 — fv_trustworthy given a real definition.
-- Before: freshness + an arbitrary -35/+60 gap band, no method agreement at all,
-- and nothing anywhere ever set it true (0/61 for the life of the table).
-- Now the spec's three conditions: (a) a gap exists, (b) refreshed within 14
-- days, (c) multi-method dispersion within ±20% (band = (hi-lo)/mean <= 0.40).
--
-- "Multi-method" counts DISTINCT methods deliberately. SNDK carries two
-- scrapbook_snapshots rows that are both EV_EBITDA at an identical (and absurd)
-- $1238 implied price; a naive row count reads that as perfect agreement and
-- blesses the very number that poisoned the fund-from mechanism. Distinct
-- methods is the honest test — it excludes SNDK, AVGO, GEV, ABEV, AHR, SBSW,
-- BG and TSLA, all of which are single-method runs recorded twice.
--
-- fv_untrust_reason is new: the Bench diagnostics strip can say WHY coverage is
-- what it is instead of showing a bare 0/61. Today that reads
-- "36 stale valuations, 25 no valuation on file" — i.e. the binding constraint
-- is the valuation pipeline not having run in ~5 weeks, not the threshold.
-- Applied 2026-08-01.
create or replace view public.nexus_holdings as WITH latest AS (
         SELECT max(positions.as_of_date) AS d
           FROM positions
        ), cur AS (
         SELECT p.asset_id,
            a.symbol,
            a.name,
            p.market_value
           FROM positions p
             JOIN assets a ON a.id = p.asset_id
          WHERE p.as_of_date = (( SELECT latest.d
                   FROM latest)) AND p.market_value > 0::numeric
        ), tot AS (
         SELECT sum(cur_1.market_value) AS tmv
           FROM cur cur_1
        ), varbase AS (
         SELECT sum(insight_counter_specific_var_vs_sector.stock_var_95) AS sv
           FROM insight_counter_specific_var_vs_sector
        ), px AS (
         SELECT price_history.asset_id,
            price_history.close,
            price_history.price_date,
            row_number() OVER (PARTITION BY price_history.asset_id ORDER BY price_history.price_date DESC) AS rn,
            max(price_history.price_date) OVER (PARTITION BY price_history.asset_id) AS last_date
           FROM price_history
        ), px2 AS (
         SELECT px.asset_id,
            max(
                CASE
                    WHEN px.rn = 1 THEN px.close
                    ELSE NULL::numeric
                END) AS last_close,
            max(
                CASE
                    WHEN px.rn = 2 THEN px.close
                    ELSE NULL::numeric
                END) AS prev_close,
            max(px.last_date) AS last_date
           FROM px
          WHERE px.rn <= 2
          GROUP BY px.asset_id
        ), conv AS (
         SELECT DISTINCT ON (decisions.symbol) decisions.symbol,
            decisions.conviction
           FROM decisions
          ORDER BY decisions.symbol, decisions.seq DESC
        ), latest_run AS (
         SELECT scrapbook_snapshots.company_id,
            max(scrapbook_snapshots.run_date) AS rd
           FROM scrapbook_snapshots
          GROUP BY scrapbook_snapshots.company_id
        ), disp AS (
         SELECT s.company_id,
            count(DISTINCT s.method) FILTER (WHERE s.implied_price > 0::numeric) AS n_methods,
            min(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS lo,
            max(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS hi,
            avg(s.implied_price) FILTER (WHERE s.implied_price > 0::numeric) AS mean_px
           FROM scrapbook_snapshots s
             JOIN latest_run lr ON lr.company_id = s.company_id AND lr.rd = s.run_date
          GROUP BY s.company_id
        ), fv AS (
         SELECT c_1.ticker,
            c_1.avg_fair_value,
            c_1.last_run_at::date AS run_date,
            COALESCE(d.n_methods, 0::bigint) AS n_methods,
                CASE
                    WHEN d.mean_px > 0::numeric THEN (d.hi - d.lo) / d.mean_px
                    ELSE NULL::numeric
                END AS band_frac
           FROM scrapbook_companies c_1
             LEFT JOIN disp d ON d.company_id = c_1.id
          WHERE c_1.avg_fair_value IS NOT NULL AND c_1.avg_fair_value > 0::numeric
        )
 SELECT cur.symbol AS tk,
    COALESCE(pt.theme, 'Unmapped'::text) AS theme,
    COALESCE(c.conviction, 49) AS conviction,
    c.conviction IS NOT NULL AS pcm_rated,
    round(cur.market_value / NULLIF(t.tmv, 0::numeric) * 100::numeric, 2) AS weight_pct,
        CASE
            WHEN px2.prev_close > 0::numeric THEN round((px2.last_close / px2.prev_close - 1::numeric) * 100::numeric, 2)
            ELSE NULL::numeric
        END AS today_pct,
        CASE
            WHEN px2.prev_close > 0::numeric THEN round((px2.last_close / px2.prev_close - 1::numeric) * (cur.market_value / NULLIF(t.tmv, 0::numeric)) * 100::numeric, 3)
            ELSE NULL::numeric
        END AS contrib_pct,
    round(COALESCE(v.stock_var_95, 0::numeric) / NULLIF(vb.sv, 0::numeric) * 100::numeric, 1) AS component_var,
        CASE
            WHEN fv.avg_fair_value IS NOT NULL AND px2.last_close > 0::numeric THEN round((fv.avg_fair_value / px2.last_close - 1::numeric) * 100::numeric, 1)
            ELSE NULL::numeric
        END AS fv_gap_pct,
    NULL::text AS signal,
    'neutral'::text AS signal_tone,
    COALESCE((CURRENT_DATE - px2.last_date) > 4, true) AS stale,
    fv.avg_fair_value IS NOT NULL AND px2.last_close > 0::numeric AND (CURRENT_DATE - fv.run_date) <= 14 AND fv.n_methods >= 2 AND fv.band_frac <= 0.40 AS fv_trustworthy,
        CASE
            WHEN fv.avg_fair_value IS NULL OR px2.last_close IS NULL OR px2.last_close <= 0::numeric THEN 'no valuation on file'::text
            WHEN (CURRENT_DATE - fv.run_date) > 14 THEN ('valuation '::text || ((CURRENT_DATE - fv.run_date)::text)) || 'd stale'::text
            WHEN fv.n_methods < 2 THEN 'single method only'::text
            WHEN fv.band_frac > 0.40 THEN ('methods disagree '::text || round(fv.band_frac * 100::numeric)::text) || '%'::text
            ELSE NULL::text
        END AS fv_untrust_reason
   FROM cur
     CROSS JOIN tot t
     CROSS JOIN varbase vb
     LEFT JOIN position_themes pt ON pt.symbol = cur.symbol
     LEFT JOIN conv c ON c.symbol = cur.symbol
     LEFT JOIN px2 ON px2.asset_id = cur.asset_id
     LEFT JOIN fv ON fv.ticker = cur.symbol
     LEFT JOIN insight_counter_specific_var_vs_sector v ON v.symbol = cur.symbol
  ORDER BY cur.market_value DESC;
