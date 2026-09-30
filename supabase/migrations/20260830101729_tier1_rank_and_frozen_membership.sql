CREATE OR REPLACE VIEW public.vw_position_tier1 AS
WITH cf AS (
    SELECT m.symbol, m.asset_id, m.member_symbol, m.rho,
           c.cf_mwr_period_pct, c.cf_status,
           own.position_mwr_period_pct AS own_return,
           own.engine_status           AS own_status
      FROM public.vw_position_cluster_members m
      CROSS JOIN LATERAL public.atlas_counterfactual(m.asset_id, m.member_asset_id) c
      LEFT JOIN public.mv_position_returns own ON own.asset_id = m.asset_id
),
agg AS (
    SELECT symbol, asset_id,
           count(*)                                                         AS cluster_size_nominal,
           count(*) FILTER (WHERE cf_mwr_period_pct IS NOT NULL)            AS cluster_size,
           avg(rho) FILTER (WHERE cf_mwr_period_pct IS NOT NULL)            AS avg_intra_rho,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY cf_mwr_period_pct)   AS cf_median_return_pct,
           max(cf_mwr_period_pct)                                           AS cf_best_return_pct,
           stddev_samp(cf_mwr_period_pct)                                   AS cluster_dispersion,
           avg(cf_mwr_period_pct)                                           AS cf_basket_return_pct,
           max(own_return)                                                  AS own_return,
           max(own_status)                                                  AS own_status,
           array_agg(member_symbol ORDER BY member_symbol)
             FILTER (WHERE cf_mwr_period_pct IS NOT NULL)                   AS cluster_members,
           count(*) FILTER (WHERE cf_mwr_period_pct IS NOT NULL
                              AND cf_mwr_period_pct > own_return) + 1       AS rank_raw
      FROM cf
     GROUP BY symbol, asset_id
),
best AS (
    SELECT DISTINCT ON (symbol) symbol, member_symbol AS cf_best_symbol
      FROM cf
     WHERE cf_mwr_period_pct IS NOT NULL
     ORDER BY symbol, cf_mwr_period_pct DESC
)
SELECT a.asset_id, a.symbol, a.cluster_size_nominal, a.cluster_size,
       a.avg_intra_rho::numeric,
       (a.cluster_size >= 5 AND a.avg_intra_rho >= 0.75) AS cluster_eligible,
       0.75::numeric                                     AS cluster_threshold_rho,
       a.cf_median_return_pct::numeric,
       a.cf_best_return_pct::numeric,
       b.cf_best_symbol,
       a.cf_basket_return_pct::numeric,
       a.cluster_dispersion::numeric,
       CASE WHEN a.cluster_size >= 5 AND a.avg_intra_rho >= 0.75
                 AND r.engine_status = 'measured'
                 AND r.position_mwr_period_pct IS NOT NULL
                 AND a.cf_median_return_pct IS NOT NULL
            THEN (r.position_mwr_period_pct - a.cf_median_return_pct)::numeric
       END AS selection_effect_pct,
       CASE WHEN a.cluster_size >= 5 AND a.avg_intra_rho >= 0.75
                 AND r.engine_status = 'measured'
                 AND r.position_mwr_period_pct IS NOT NULL
                 AND a.cf_best_return_pct IS NOT NULL
            THEN (r.position_mwr_period_pct - a.cf_best_return_pct)::numeric
       END AS regret_vs_best_pct,
       CASE WHEN a.cluster_dispersion > 0
                 AND a.cluster_size >= 5 AND a.avg_intra_rho >= 0.75
                 AND r.engine_status = 'measured'
                 AND r.position_mwr_period_pct IS NOT NULL
                 AND a.cf_median_return_pct IS NOT NULL
            THEN ((r.position_mwr_period_pct - a.cf_median_return_pct) / a.cluster_dispersion)::numeric
       END AS selection_effect_vol_adj,
       (SELECT max(correlation_as_of) FROM public.vw_position_cluster_members m2
         WHERE m2.symbol = a.symbol) AS correlation_as_of,
       CASE WHEN a.cluster_size >= 5 AND a.avg_intra_rho >= 0.75
                 AND a.own_status = 'measured'
                 AND a.own_return IS NOT NULL
            THEN a.rank_raw
       END AS rank_in_cluster,
       CASE WHEN a.cluster_size >= 5 AND a.avg_intra_rho >= 0.75
            THEN a.cluster_members
       END AS cluster_members
  FROM agg a
  LEFT JOIN best b ON b.symbol = a.symbol
  LEFT JOIN public.mv_position_returns r ON r.asset_id = a.asset_id;

GRANT SELECT ON public.vw_position_tier1 TO anon, authenticated, service_role;

DROP MATERIALIZED VIEW IF EXISTS public.mv_position_tier1 CASCADE;

CREATE MATERIALIZED VIEW public.mv_position_tier1 AS
    SELECT t.*, now() AS computed_at FROM public.vw_position_tier1 t;

CREATE UNIQUE INDEX mv_position_tier1_asset_uniq ON public.mv_position_tier1 (asset_id);
CREATE INDEX mv_position_tier1_symbol_idx        ON public.mv_position_tier1 (symbol);

GRANT SELECT ON public.mv_position_tier1 TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_book_frozen_baseline AS
 WITH val AS (
         SELECT max(c.flow_date) AS val_dt
           FROM vw_position_cash_flows c
          WHERE c.flow_kind = 'mark'::text
        ), eligible AS (
         SELECT p.asset_id, p.frozen_entry_date, p.frozen_capital_usd, p.frozen_terminal_usd
           FROM vw_position_frozen p
          WHERE p.trading_effect_pct IS NOT NULL
        ), traded_flows AS (
         SELECT c.flow_date AS d, c.flow_usd AS amt
           FROM vw_position_cash_flows c
             JOIN eligible e ON e.asset_id = c.asset_id
        ), frozen_flows AS (
         SELECT e.frozen_entry_date AS d, - e.frozen_capital_usd AS amt
           FROM eligible e
        UNION ALL
         SELECT ( SELECT val.val_dt FROM val) AS val_dt, e.frozen_terminal_usd
           FROM eligible e
        ), traded AS (
         SELECT array_agg(traded_flows.d ORDER BY traded_flows.d) AS ds,
            array_agg(traded_flows.amt ORDER BY traded_flows.d) AS amts
           FROM traded_flows
        ), frozen AS (
         SELECT array_agg(frozen_flows.d ORDER BY frozen_flows.d) AS ds,
            array_agg(frozen_flows.amt ORDER BY frozen_flows.d) AS amts
           FROM frozen_flows
        )
 SELECT ( SELECT val.val_dt FROM val) AS as_of,
    ( SELECT count(*) AS count FROM eligible) AS positions_compared,
    atlas_mwr_period(t.ds, t.amts)::numeric AS traded_book_return_pct,
    atlas_mwr_period(f.ds, f.amts)::numeric AS frozen_book_return_pct,
    (atlas_mwr_period(t.ds, t.amts) - atlas_mwr_period(f.ds, f.amts))::numeric AS trading_effect_pct,
    ( SELECT count(*) AS count FROM mv_position_tier1
          WHERE mv_position_tier1.cluster_eligible) AS positions_cluster_eligible,
    ( SELECT count(*) AS count FROM mv_position_tier2
          WHERE mv_position_tier2.position_state = 'open'::text
            AND (mv_position_tier2.best_correlate_rho IS NULL OR mv_position_tier2.best_correlate_rho < 0.65)) AS positions_no_correlate
   FROM traded t, frozen f;

COMMENT ON VIEW public.vw_book_frozen_baseline IS
 'Book-level do-nothing baseline (step 4 addendum rev. B §5), and the two §2.5 diversification counts. The frozen book is every position at its opening size, never added to, never trimmed, valued on one shared date - which is why atlas_counterfactual_frozen takes the valuation date as a parameter rather than each position picking its own. Both legs cover the same position set: a difference computed over different sets measures coverage, not trading.';

GRANT SELECT ON public.vw_book_frozen_baseline TO anon, authenticated, service_role;
