-- Step 4 §8.5 — Tier 1: the cluster median, where a cluster exists.
--
-- Rev. B §2.4 keeps the cluster comparison as the top rung of the ladder but
-- demotes it from the primary basis: it answers "did I pick the right name
-- among substitutes", which is the sharper question, and simply is not
-- available for most of this book.
--
-- As built: **17 of 57 open positions are cluster-eligible**, against rev. B
-- §2.2's ~19 estimate. 34 positions have at least one peer at rho >= 0.75;
-- half of those clusters are too thin to take a median over.
--
-- ## Eligibility is measured on peers that priced, not on peers that exist
--
-- The nominal cluster is every name in the matrix at rho >= 0.75. Some of
-- those cannot produce a counterfactual - the peer has no close on a flow
-- date, or its own mark is stale - and a median over 2 surviving members of a
-- nominal 12 is a different statistic wearing the same name. `cluster_size` is
-- therefore the count that actually priced and eligibility is gated on it;
-- `cluster_size_nominal` is published beside it so the attrition is visible.
-- In practice it is small: 272 of 277 members priced.
--
-- ## Candidates come from the matrix, not from the book
--
-- Unlike `best_correlate_rho` in Tier 2 - which asks how differentiated the
-- book is, and so can only count names you hold - a substitute you could have
-- bought is a legitimate comparison whether or not you owned it. Peers are
-- drawn from the whole ~420-name matrix.
--
-- ## The threshold does not move
--
-- Fixed at 0.75 with n >= 5, per rev. B §2.2. Loosening to 0.65 buys nine more
-- positions and costs the thing that made the counterfactual defensible: the
-- brief rejected sector labels because two names sharing a GICS label are not
-- real substitutes, and a name at rho 0.66 is that same claim with a number
-- attached. Better to say no comparable exists and grade on Tier 2.
--
-- ## Results, and one thing to be careful about downstream
--
--   AMD    +166.49pp vs a peer median of  +22.91%   n=13, rho 0.810
--   ASML    +38.33pp                       +35.75%   n=19
--   SNDK    +19.09pp                        -7.01%   n=13
--   MU      +14.48pp                       -10.82%   n=17
--   ...
--   DFEV     -9.28pp                       +20.25%   n=26
--
-- The bond funds behave as a sanity check should: BSV, BOND and PTRB sit in
-- tight clusters (rho 0.82-0.88) with selection effects inside +/-1.3pp.
--
-- **`cf_best_symbol` is SOXL for five of the seventeen.** A 3x leveraged
-- semiconductor ETF wins a levered share of any semis move, so it tops the
-- cluster on any tape that went up. This is exactly why rev. B marks
-- `regret_vs_best_pct` display-only and never a sort key - ranking on it
-- grades luck and leverage rather than selection - and that is respected here.
-- But §7's `switch_to_cluster_leader` reason code is pre-filled from the
-- cluster leader, and "switch to SOXL" is not advice this module should be
-- capable of emitting. Flagged for the write-time gate in §8.7 rather than
-- decided here.

-- Canonical asset per symbol. `assets` carries 7,860 listings and a symbol can
-- appear more than once; without this the cluster join fans out.
CREATE OR REPLACE VIEW public.vw_canonical_assets AS
SELECT DISTINCT ON (a.symbol) a.symbol, a.id AS asset_id
  FROM public.assets a
 ORDER BY a.symbol,
          (a.listing_status = 'active') DESC NULLS LAST,
          a.updated_at DESC NULLS LAST;

GRANT SELECT ON public.vw_canonical_assets TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_position_cluster_members AS
WITH latest_corr AS (
    SELECT max(as_of_date) AS d FROM public.universe_correlations
),
open_book AS (
    SELECT DISTINCT symbol, asset_id FROM public.mv_position_returns WHERE position_state = 'open'
),
pairs AS (
    SELECT c.symbol_1 AS sym, c.symbol_2 AS other, c.correlation AS rho
      FROM public.universe_correlations c, latest_corr l
     WHERE c.as_of_date = l.d AND c.correlation >= 0.75
    UNION ALL
    SELECT c.symbol_2, c.symbol_1, c.correlation
      FROM public.universe_correlations c, latest_corr l
     WHERE c.as_of_date = l.d AND c.correlation >= 0.75
)
SELECT o.symbol,
       o.asset_id,
       p.other        AS member_symbol,
       ca.asset_id    AS member_asset_id,
       p.rho,
       (SELECT d FROM latest_corr) AS correlation_as_of
  FROM open_book o
  JOIN pairs p            ON p.sym = o.symbol AND p.other <> o.symbol
  JOIN public.vw_canonical_assets ca ON ca.symbol = p.other;

COMMENT ON VIEW public.vw_position_cluster_members IS
 'Tier 1 peer sets (step 4 addendum rev. B §2.2): every name in the correlation matrix at rho >= 0.75 to an open position. Candidates are drawn from the whole matrix, not just the book - "did I pick the right name among substitutes" is a question about names you could have bought, not only ones you did. The threshold is fixed at 0.75 and is not loosened to manufacture peers.';

GRANT SELECT ON public.vw_position_cluster_members TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_position_tier1 AS
WITH cf AS (
    SELECT m.symbol,
           m.asset_id,
           m.member_symbol,
           m.rho,
           c.cf_mwr_period_pct,
           c.cf_status
      FROM public.vw_position_cluster_members m
      CROSS JOIN LATERAL public.atlas_counterfactual(m.asset_id, m.member_asset_id) c
),
agg AS (
    SELECT symbol,
           asset_id,
           count(*)                                                         AS cluster_size_nominal,
           count(*) FILTER (WHERE cf_mwr_period_pct IS NOT NULL)            AS cluster_size,
           avg(rho) FILTER (WHERE cf_mwr_period_pct IS NOT NULL)            AS avg_intra_rho,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY cf_mwr_period_pct)   AS cf_median_return_pct,
           max(cf_mwr_period_pct)                                           AS cf_best_return_pct,
           stddev_samp(cf_mwr_period_pct)                                   AS cluster_dispersion,
           avg(cf_mwr_period_pct)                                           AS cf_basket_return_pct
      FROM cf
     GROUP BY symbol, asset_id
),
best AS (
    SELECT DISTINCT ON (symbol) symbol, member_symbol AS cf_best_symbol
      FROM cf
     WHERE cf_mwr_period_pct IS NOT NULL
     ORDER BY symbol, cf_mwr_period_pct DESC
)
SELECT a.asset_id,
       a.symbol,
       a.cluster_size_nominal,
       a.cluster_size,
       a.avg_intra_rho::numeric,
       -- Eligibility is measured on peers that actually produced a
       -- counterfactual, not on the nominal cluster. A median over 2 of 12
       -- members is a different statistic wearing the same name, and the n >= 5
       -- rule exists precisely so the median means something.
       (a.cluster_size >= 5 AND a.avg_intra_rho >= 0.75) AS cluster_eligible,
       0.75::numeric                                     AS cluster_threshold_rho,
       a.cf_median_return_pct::numeric,
       a.cf_best_return_pct::numeric,
       b.cf_best_symbol,
       a.cf_basket_return_pct::numeric,
       a.cluster_dispersion::numeric,
       -- THE SCORE, on the cluster basis: own return less the cluster median.
       CASE WHEN a.cluster_size >= 5 AND a.avg_intra_rho >= 0.75
                 AND r.engine_status = 'measured'
                 AND r.position_mwr_period_pct IS NOT NULL
                 AND a.cf_median_return_pct IS NOT NULL
            THEN (r.position_mwr_period_pct - a.cf_median_return_pct)::numeric
       END AS selection_effect_pct,
       -- Display only, never sorts. Regret against the single best peer is a
       -- hindsight statistic and ranking on it grades luck - the leader here is
       -- a 3x leveraged ETF for five of the seventeen eligible positions.
       CASE WHEN a.cluster_size >= 5 AND a.avg_intra_rho >= 0.75
                 AND r.engine_status = 'measured'
                 AND r.position_mwr_period_pct IS NOT NULL
                 AND a.cf_best_return_pct IS NOT NULL
            THEN (r.position_mwr_period_pct - a.cf_best_return_pct)::numeric
       END AS regret_vs_best_pct,
       -- +12% in a compressed tape is a different achievement from +12% in a
       -- dispersed one (rev. B §4).
       CASE WHEN a.cluster_dispersion > 0
                 AND a.cluster_size >= 5 AND a.avg_intra_rho >= 0.75
                 AND r.engine_status = 'measured'
                 AND r.position_mwr_period_pct IS NOT NULL
                 AND a.cf_median_return_pct IS NOT NULL
            THEN ((r.position_mwr_period_pct - a.cf_median_return_pct) / a.cluster_dispersion)::numeric
       END AS selection_effect_vol_adj,
       (SELECT max(correlation_as_of) FROM public.vw_position_cluster_members m2
         WHERE m2.symbol = a.symbol) AS correlation_as_of
  FROM agg a
  LEFT JOIN best b ON b.symbol = a.symbol
  LEFT JOIN public.mv_position_returns r ON r.asset_id = a.asset_id;

COMMENT ON VIEW public.vw_position_tier1 IS
 'Tier 1 of the ranking ladder (step 4 addendum rev. B §2.2, §2.4): the position''s own money-weighted return against the median of its correlated peers, each run on the position''s own cash-flow schedule. Only offered where the cluster survives rho >= 0.75 AND at least 5 members that actually priced - roughly 17 of 57 open positions. Everything else is graded on Tier 2, and peer_basis records which.';

GRANT SELECT ON public.vw_position_tier1 TO anon, authenticated, service_role;

DROP MATERIALIZED VIEW IF EXISTS public.mv_position_tier1;
CREATE MATERIALIZED VIEW public.mv_position_tier1 AS
    SELECT t.*, now() AS computed_at FROM public.vw_position_tier1 t;

CREATE UNIQUE INDEX mv_position_tier1_asset_uniq ON public.mv_position_tier1 (asset_id);
CREATE INDEX mv_position_tier1_symbol_idx        ON public.mv_position_tier1 (symbol);

GRANT SELECT ON public.mv_position_tier1 TO anon, authenticated, service_role;
