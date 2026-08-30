-- ============================================================
-- Tier 1: publish the ranking and freeze the membership
-- memo v2 close-out §5.3
-- ------------------------------------------------------------
-- `position_verdicts` declares `rank_in_cluster` and `cluster_members` and
-- the nightly job has never written either: 0 of 19 cluster-tier rows on
-- 2026-08-28 carry them. Every other Tier 1 column is populated, so the gap
-- reads as "this position has no ranking" rather than as a writer that never
-- filled the column in.
--
-- §5.3 asks for the cluster view to show "the ~19 eligible positions grouped
-- by cluster with full rankings". That surface cannot be built on a NULL.
--
-- ## Why this is urgent rather than tidy
--
-- `position_verdicts` is a HISTORY, not a view — a row records what was known
-- on `as_of` under `logic_version` and is never updated. That is the same
-- property that argued for writing these columns from row one, and it cuts
-- both ways: every night that passes without them is a night whose ranking can
-- never be recovered. The correlation matrix is rebuilt nightly and the
-- counterfactuals are computed against the tape as it stood, so there is no
-- backfill that would be honest.
--
-- ## The rank
--
-- The position's own money-weighted return placed among its peers' — each peer
-- run on the position's own cash-flow schedule, which is what makes them
-- comparable at all. 1 is best. The denominator is `cluster_size + 1` (the
-- peers that actually priced, plus the position itself); `cluster_size` is
-- already published, so no second column is needed to render "#3 of 13".
--
-- Defined only where the position is `measured` and the cluster is eligible.
-- A rank against peers when the position's own return is unknown is not a
-- weaker ranking, it is not a ranking.
--
-- Note this ranks on the position's own return against the peer distribution —
-- NOT on `regret_vs_best_pct`, which stays display-only. Ranking on regret
-- grades leverage: `cf_best_symbol` is SOXL, a 3x semiconductor fund, for five
-- of the eligible positions.
--
-- ## The membership
--
-- `cluster_members` is frozen deliberately — the schema calls it "frozen
-- membership". `universe_correlations` churns (coverage of the open book went
-- 71 -> 70 -> 67 over three days as the cap moved), so a rank of #3 of 13 read
-- back in a month is uninterpretable unless the row also says which 13. Only
-- peers that actually produced a counterfactual are listed, matching the set
-- the rank and the median are computed over.
-- ============================================================

-- ── 1. The view gains both columns ───────────────────────────
-- Appended, never inserted mid-list: CREATE OR REPLACE VIEW refuses a column
-- reorder with 42P16.
CREATE OR REPLACE VIEW public.vw_position_tier1 AS
WITH cf AS (
    SELECT m.symbol,
           m.asset_id,
           m.member_symbol,
           m.rho,
           c.cf_mwr_period_pct,
           c.cf_status,
           -- Joined here rather than read in the outer query so the rank can be
           -- aggregated in one pass. mv_position_returns is unique on asset_id
           -- (86 rows, 86 distinct), so this cannot fan the peer set out.
           own.position_mwr_period_pct AS own_return,
           own.engine_status           AS own_status
      FROM public.vw_position_cluster_members m
      CROSS JOIN LATERAL public.atlas_counterfactual(m.asset_id, m.member_asset_id) c
      LEFT JOIN public.mv_position_returns own ON own.asset_id = m.asset_id
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
           avg(cf_mwr_period_pct)                                           AS cf_basket_return_pct,
           -- Constant within the group (one own-return row per asset_id); max()
           -- is how that is expressed, not an aggregate over varying values.
           max(own_return)                                                  AS own_return,
           max(own_status)                                                  AS own_status,
           -- Frozen membership: the peers that actually priced, which is the
           -- same set the median and the rank are computed over.
           array_agg(member_symbol ORDER BY member_symbol)
             FILTER (WHERE cf_mwr_period_pct IS NOT NULL)                   AS cluster_members,
           -- 1 = best. Peers that beat the position, plus the position itself.
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
         WHERE m2.symbol = a.symbol) AS correlation_as_of,
       -- ── appended §5.3 ────────────────────────────────────
       -- Gated on the same conditions as every other Tier 1 figure. A rank
       -- offered where the position's own return is unmeasurable would be a
       -- ranking of nothing against something.
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

COMMENT ON VIEW public.vw_position_tier1 IS
 'Tier 1 of the ranking ladder (step 4 addendum rev. B §2.2, §2.4): the position''s own money-weighted return against the median of its correlated peers, each run on the position''s own cash-flow schedule. Only offered where the cluster survives rho >= 0.75 AND at least 5 members that actually priced - roughly 19 of 57 open positions. Everything else is graded on Tier 2, and peer_basis records which. rank_in_cluster is the position placed among those same peers (1 = best, denominator cluster_size + 1) and cluster_members freezes who they were, because universe_correlations churns and a bare rank is uninterpretable a month later.';

GRANT SELECT ON public.vw_position_tier1 TO anon, authenticated, service_role;

-- ── 2. Rebuild the matview, and the one view that reads it ───
-- mv_position_tier1 was created as `SELECT t.*`, which Postgres expands to an
-- explicit column list at creation time. Replacing the view does not widen the
-- matview; it has to be rebuilt to see the two new columns.
--
-- `vw_book_frozen_baseline` reads the matview (for `positions_cluster_eligible`),
-- so the drop needs CASCADE and the view has to come back. Its definition below
-- is `pg_get_viewdef` output taken immediately before the drop — unchanged, not
-- retyped from memory. This view feeds `book_risk_daily.trading_effect_pct`,
-- which is the figure §5.1 just put on the scorecard, so a silent difference
-- here would land on the front page.
DROP MATERIALIZED VIEW IF EXISTS public.mv_position_tier1 CASCADE;

CREATE MATERIALIZED VIEW public.mv_position_tier1 AS
    SELECT t.*, now() AS computed_at FROM public.vw_position_tier1 t;

-- CONCURRENTLY in the nightly refresh needs this.
CREATE UNIQUE INDEX mv_position_tier1_asset_uniq ON public.mv_position_tier1 (asset_id);
CREATE INDEX mv_position_tier1_symbol_idx        ON public.mv_position_tier1 (symbol);

GRANT SELECT ON public.mv_position_tier1 TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_book_frozen_baseline AS
 WITH val AS (
         SELECT max(c.flow_date) AS val_dt
           FROM vw_position_cash_flows c
          WHERE c.flow_kind = 'mark'::text
        ), eligible AS (
         SELECT p.asset_id,
            p.frozen_entry_date,
            p.frozen_capital_usd,
            p.frozen_terminal_usd
           FROM vw_position_frozen p
          WHERE p.trading_effect_pct IS NOT NULL
        ), traded_flows AS (
         SELECT c.flow_date AS d,
            c.flow_usd AS amt
           FROM vw_position_cash_flows c
             JOIN eligible e ON e.asset_id = c.asset_id
        ), frozen_flows AS (
         SELECT e.frozen_entry_date AS d,
            - e.frozen_capital_usd AS amt
           FROM eligible e
        UNION ALL
         SELECT ( SELECT val.val_dt
                   FROM val) AS val_dt,
            e.frozen_terminal_usd
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
 SELECT ( SELECT val.val_dt
           FROM val) AS as_of,
    ( SELECT count(*) AS count
           FROM eligible) AS positions_compared,
    atlas_mwr_period(t.ds, t.amts)::numeric AS traded_book_return_pct,
    atlas_mwr_period(f.ds, f.amts)::numeric AS frozen_book_return_pct,
    (atlas_mwr_period(t.ds, t.amts) - atlas_mwr_period(f.ds, f.amts))::numeric AS trading_effect_pct,
    ( SELECT count(*) AS count
           FROM mv_position_tier1
          WHERE mv_position_tier1.cluster_eligible) AS positions_cluster_eligible,
    ( SELECT count(*) AS count
           FROM mv_position_tier2
          WHERE mv_position_tier2.position_state = 'open'::text AND (mv_position_tier2.best_correlate_rho IS NULL OR mv_position_tier2.best_correlate_rho < 0.65)) AS positions_no_correlate
   FROM traded t,
    frozen f;

COMMENT ON VIEW public.vw_book_frozen_baseline IS
 'Book-level do-nothing baseline (step 4 addendum rev. B §5), and the two §2.5 diversification counts. The frozen book is every position at its opening size, never added to, never trimmed, valued on one shared date - which is why atlas_counterfactual_frozen takes the valuation date as a parameter rather than each position picking its own. Both legs cover the same position set: a difference computed over different sets measures coverage, not trading.';

GRANT SELECT ON public.vw_book_frozen_baseline TO anon, authenticated, service_role;
