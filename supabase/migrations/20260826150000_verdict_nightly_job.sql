-- Step 4 §8.7 — the nightly verdict job, invariants asserted. Cron only.
--
-- Writes one `position_verdicts` row per open position and one
-- `book_risk_daily` row per night, from the three tiers built in §8.4-§8.6.
--
-- ## Where the invariants live
--
-- Rev. B §6 asks for all of them "asserted in the nightly job, failing
-- loudly". Most of them are now CHECK constraints on the table instead (see
-- 20260826110000), because a constraint the job cannot forget is stronger than
-- an assertion it might. What is left here is the two rules that span rows and
-- therefore cannot be CHECKs:
--
--   * `sum(cluster_risk_share) = 1.0` within tolerance, residual written out
--   * no verdict row written while any position carries a stale broker row
--
-- The second is the §1 blocker that gated this entire step, in permanent form.
-- A view recomputes and self-heals; a history does not, so a row written
-- against yesterday's book freezes the wrong holdings into the record forever.
-- The job raises rather than writing, and logs `skipped`.
--
-- ## Two different cluster objects, deliberately not merged
--
-- Tier 1 ranks against a **neighbourhood**: every name at rho >= 0.75, which
-- overlaps between positions and covers only 17 of 57.
--
-- `cluster_risk_share` needs a **partition**: every position in exactly one
-- bucket, shares summing to 1, so memo v2 §2.8's position -> cluster -> book
-- chain closes. `universe_clusters` (avg-linkage, 202 clusters) is that
-- partition and covers 56 of 57 open names - KMTUY again, for the same reason
-- it is absent everywhere else.
--
-- Using the neighbourhood for the risk share is what would break the identity.
-- They are stored in different columns on purpose.
--
-- ## The residual is written, not swept up
--
-- `vw_risk_analysis` returns 79 rows for 57 open positions and its weights sum
-- to 1.0157. The verdict rows renormalise over the positions actually ranked
-- so the shares close exactly; the difference goes into `book_risk_daily.
-- residual` where it can be seen, per memo v2 §2.8.
--
-- ## The leveraged-leader gate
--
-- §7 allows `switch_to_cluster_leader` only on the cluster tier. That is not
-- sufficient on this book: SOXL, a 3x semiconductor fund, is the cluster
-- leader for five of the seventeen eligible positions, because a levered fund
-- takes a levered share of any move that went the right way. "Switch to SOXL"
-- is not advice this module should be able to emit.
--
-- Gated on measured volatility rather than a name match - a deny-list of
-- "3X"/"Ultra"/"Bull" strings would miss the next one and flag an innocent
-- fund. A leader whose annualised vol exceeds 1.5x the position's own is not a
-- like-for-like substitute whatever it is called, and the reason code falls
-- back to `cut_underperforming_comparables`.
--
-- ## Labels
--
-- Absolute bands on the active score, not quantiles. Quantiles would force a
-- fixed share of the book to be cut candidates every night regardless of how
-- the book actually did, which is a ranking dressed as a verdict.
--
--   >= +5pp   leader
--   > -5pp    holding_own
--   >= -20pp  lagging
--   otherwise cut_candidate
--
-- Only where `verdict_status = 'measured'`; the CHECK enforces that
-- independently.
--
-- ## Scheduling
--
-- 23:37 UTC weekdays, in `cron.job` and nowhere else, per CLAUDE.md. It sits
-- after `refresh_position_returns` (23:35) and before `atlas_run_validation`
-- (23:40) so validation grades the night it is actually looking at - the same
-- reason validation itself moved from 22:40 to 23:40.

CREATE OR REPLACE FUNCTION public.atlas_refresh_verdict_inputs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Dependency order. mv_book_ex_index reads mv_book_daily_weights; both
    -- tier views read mv_position_returns; tier2 also reads mv_book_ex_index.
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_book_daily_weights;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_book_ex_index;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_position_returns;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_position_tier2;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_position_tier1;
END;
$$;

COMMENT ON FUNCTION public.atlas_refresh_verdict_inputs() IS
 'Refreshes the five materialised inputs the verdict job reads, in dependency order. CONCURRENTLY throughout so a page load during the refresh sees the previous snapshot rather than an empty table.';

-- OUT parameters are prefixed because `as_of` and `logic_version` are also
-- column names on the table being written, and PL/pgSQL resolves the variable
-- first (42702).
DROP FUNCTION IF EXISTS public.atlas_write_verdicts(date, text, boolean);

CREATE FUNCTION public.atlas_write_verdicts(
    p_as_of         date DEFAULT NULL,
    p_logic_version text DEFAULT 'v1:rho0.75:n5:mwr',
    p_refresh       boolean DEFAULT true)
RETURNS TABLE(out_as_of date, out_logic_version text, out_rows_written int, out_notes text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_as_of        date;
    v_pos_as_of    date;
    v_last_traded  date;
    v_written      int;
    v_share_sum    numeric;
    v_bad          int;
    v_note         text := '';
    v_log_id       bigint;
BEGIN
    IF p_refresh THEN
        PERFORM public.atlas_refresh_verdict_inputs();
    END IF;

    v_as_of       := COALESCE(p_as_of, CURRENT_DATE);
    v_pos_as_of   := (SELECT max(pz.as_of_date) FROM public.positions pz);
    v_last_traded := public.atlas_last_traded_day();

    INSERT INTO public.sync_log (source, function_name, status, started_at, details)
    VALUES ('atlas_write_verdicts', 'atlas_write_verdicts', 'running', now(),
            jsonb_build_object('as_of', v_as_of, 'logic_version', p_logic_version))
    RETURNING id INTO v_log_id;

    -- Rev. B §6, last invariant. `position_verdicts` is a history: a row
    -- written against a stale broker snapshot freezes the wrong holdings into
    -- the record permanently. This is the §1 blocker in permanent form.
    IF v_pos_as_of IS NULL OR v_pos_as_of < v_last_traded THEN
        UPDATE public.sync_log
           SET status = 'skipped', finished_at = now(),
               details = details || jsonb_build_object(
                   'reason', 'stale positions snapshot',
                   'positions_as_of', v_pos_as_of, 'last_traded_day', v_last_traded)
         WHERE id = v_log_id;
        RAISE EXCEPTION
            'refusing to write verdicts: positions snapshot is % but the last traded day is %',
            v_pos_as_of, v_last_traded;
    END IF;

    WITH open_book AS (
        SELECT r.* FROM public.mv_position_returns r WHERE r.position_state = 'open'
    ),
    risk AS (
        -- Renormalised over the positions actually ranked. vw_risk_analysis
        -- carries 79 rows for 57 open names and its weights sum to 1.0157;
        -- the difference is written out as `residual` rather than absorbed.
        SELECT v.symbol, v.annual_vol, v.marginal_vol_contribution, v.dollar_var_95_daily,
               v.weight / NULLIF(sum(v.weight) OVER (), 0) AS w_norm
          FROM public.vw_risk_analysis v
         WHERE v.symbol IN (SELECT ob.symbol FROM open_book ob)
    ),
    clus AS (
        SELECT u.symbol, u.cluster_id
          FROM public.universe_clusters u
         WHERE u.as_of_date = (SELECT max(u2.as_of_date) FROM public.universe_clusters u2)
    ),
    share AS (
        SELECT c.cluster_id,
               sum(r.marginal_vol_contribution * r.w_norm) AS contrib
          FROM risk r JOIN clus c ON c.symbol = r.symbol
         GROUP BY c.cluster_id
    ),
    share_n AS (
        SELECT s.cluster_id, s.contrib / NULLIF(sum(s.contrib) OVER (), 0) AS cluster_risk_share
          FROM share s
    ),
    leader_vol AS (
        SELECT t.symbol,
               t.cf_best_symbol,
               (SELECT stddev_samp(x.r) * sqrt(252::numeric)
                  FROM (SELECT ph.close / lag(ph.close) OVER (ORDER BY ph.price_date) - 1 AS r
                          FROM public.price_history ph
                          JOIN public.vw_canonical_assets ca ON ca.asset_id = ph.asset_id
                         WHERE ca.symbol = t.cf_best_symbol AND ph."interval" = '1d'
                           AND ph.price_date > v_as_of - 180
                       ) x
                 WHERE x.r IS NOT NULL) AS lead_vol
          FROM public.mv_position_tier1 t
         WHERE t.cluster_eligible AND t.cf_best_symbol IS NOT NULL
    ),
    assembled AS (
        SELECT o.asset_id,
               o.symbol,
               o.position_state,
               COALESCE(p.side, 'long')                                AS side,
               o.engine_status,
               o.engine_reason,
               o.days_held,
               o.first_flow_date,
               o.capital_deployed_usd,
               o.position_mwr_pct,
               o.position_twr_pct,
               o.mark_days_old,
               o.mark_price_date,
               CASE o.engine_status
                   WHEN 'measured'        THEN 'measured'
                   WHEN 'stale_mark'      THEN 'stale_mark'
                   WHEN 'ledger_mismatch' THEN 'ledger_mismatch'
                   ELSE 'one_sided'
               END                                                     AS verdict_status,
               t1.cluster_eligible,
               t1.cluster_size,
               t1.avg_intra_rho,
               t1.cluster_id,
               t1.cf_median_return_pct,
               t1.cf_best_return_pct,
               t1.cf_best_symbol,
               t1.cf_basket_return_pct,
               t1.cluster_dispersion,
               t1.selection_effect_pct,
               t1.regret_vs_best_pct,
               t1.selection_effect_vol_adj,
               t2.cf_book_return_pct,
               t2.excess_vs_book_pct,
               t2.best_correlate_rho,
               t2.best_correlate_symbol,
               fz.frozen_weight_return_pct,
               fz.trading_effect_pct,
               rk.annual_vol,
               rk.marginal_vol_contribution,
               rk.dollar_var_95_daily,
               sn.cluster_risk_share,
               lv.lead_vol,
               CASE WHEN COALESCE(t1.cluster_eligible, false) THEN 'cluster'
                    WHEN t2.excess_vs_book_pct IS NOT NULL     THEN 'book'
                    ELSE 'none' END                                    AS peer_basis,
               COALESCE(t1.selection_effect_pct, t2.excess_vs_book_pct) AS active_score
          FROM open_book o
          LEFT JOIN (SELECT t.*, c.cluster_id
                       FROM public.mv_position_tier1 t
                       LEFT JOIN clus c ON c.symbol = t.symbol) t1 ON t1.asset_id = o.asset_id
          LEFT JOIN public.mv_position_tier2 t2 ON t2.asset_id = o.asset_id
          LEFT JOIN public.vw_position_frozen fz ON fz.asset_id = o.asset_id
          LEFT JOIN risk    rk ON rk.symbol = o.symbol
          LEFT JOIN clus    cl ON cl.symbol = o.symbol
          LEFT JOIN share_n sn ON sn.cluster_id = cl.cluster_id
          LEFT JOIN leader_vol lv ON lv.symbol = o.symbol
          LEFT JOIN LATERAL (
                SELECT pp.side FROM public.positions pp
                 WHERE pp.asset_id = o.asset_id AND pp.as_of_date = v_pos_as_of
                 LIMIT 1) p ON true
    ),
    labelled AS (
        -- Absolute bands, not quantiles: a quantile rule forces a fixed share
        -- of the book to be cut candidates however the book actually did.
        SELECT a.*,
               CASE WHEN a.verdict_status <> 'measured' OR a.active_score IS NULL THEN NULL
                    WHEN a.active_score >=  0.05 THEN 'leader'
                    WHEN a.active_score >  -0.05 THEN 'holding_own'
                    WHEN a.active_score >= -0.20 THEN 'lagging'
                    ELSE 'cut_candidate'
               END AS verdict_label
          FROM assembled a
    )
    INSERT INTO public.position_verdicts (
        as_of, logic_version, asset_id, symbol, position_state, side,
        verdict_status, status_reason, price_days_old, last_measurable_date,
        first_entry_date, days_held, capital_deployed_usd,
        position_mwr_pct, position_twr_pct, annualised_return,
        peer_basis, cluster_threshold_rho, cluster_id, cluster_size, avg_intra_rho,
        cf_median_return_pct, cf_best_return_pct, cf_best_symbol, cf_basket_return_pct,
        selection_effect_pct, regret_vs_best_pct, selection_effect_vol_adj,
        position_vol_annual, marginal_vol_contribution, dollar_var_95_daily,
        cluster_risk_share, verdict_label, suggested_reason_code,
        ranking_basis, engine_status, status_detail,
        cluster_eligible, cf_book_return_pct, excess_vs_book_pct,
        best_correlate_rho, best_correlate_symbol,
        frozen_weight_return_pct, trading_effect_pct, cluster_dispersion,
        evidence_own_return_known, evidence_staleness_days)
    SELECT v_as_of, p_logic_version, l.asset_id, l.symbol, l.position_state, l.side,
           l.verdict_status, l.engine_reason, l.mark_days_old, l.mark_price_date,
           l.first_flow_date, l.days_held, l.capital_deployed_usd,
           l.position_mwr_pct, l.position_twr_pct,
           -- §2.7 floor. Also a CHECK; applied here so the job produces a
           -- correct row rather than tripping the constraint.
           CASE WHEN l.days_held >= 90 THEN l.position_mwr_pct END,
           l.peer_basis, 0.75, l.cluster_id, l.cluster_size, l.avg_intra_rho,
           l.cf_median_return_pct, l.cf_best_return_pct, l.cf_best_symbol, l.cf_basket_return_pct,
           l.selection_effect_pct, l.regret_vs_best_pct, l.selection_effect_vol_adj,
           l.annual_vol, l.marginal_vol_contribution, l.dollar_var_95_daily,
           l.cluster_risk_share, l.verdict_label,
           CASE
               WHEN l.verdict_label = 'cut_candidate' AND l.peer_basis = 'cluster'
                    AND l.cf_best_symbol IS NOT NULL
                    AND l.lead_vol IS NOT NULL AND l.annual_vol IS NOT NULL
                    AND l.lead_vol <= 1.5 * l.annual_vol
                    THEN 'switch_to_cluster_leader'
               WHEN l.verdict_label = 'cut_candidate' AND l.peer_basis = 'cluster'
                    THEN 'cut_underperforming_comparables'
               WHEN l.verdict_label = 'cut_candidate' AND l.peer_basis = 'book'
                    THEN 'trim_concentration'
           END,
           'mwr', l.engine_status, l.engine_reason,
           COALESCE(l.cluster_eligible, false), l.cf_book_return_pct, l.excess_vs_book_pct,
           l.best_correlate_rho, l.best_correlate_symbol,
           l.frozen_weight_return_pct, l.trading_effect_pct, l.cluster_dispersion,
           (l.verdict_status = 'measured'), l.mark_days_old
      FROM labelled l
    ON CONFLICT (as_of, asset_id, logic_version) DO NOTHING;

    GET DIAGNOSTICS v_written = ROW_COUNT;

    -- Rev. B §6: the shares must close. Cannot be a CHECK - it spans rows.
    SELECT sum(s.cluster_risk_share) INTO v_share_sum
      FROM (SELECT DISTINCT pv.cluster_id, pv.cluster_risk_share
              FROM public.position_verdicts pv
             WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version
               AND pv.cluster_risk_share IS NOT NULL) s;

    IF v_share_sum IS NOT NULL AND abs(v_share_sum - 1.0) > 0.005 THEN
        RAISE EXCEPTION 'cluster_risk_share sums to % across the book, not 1.0', v_share_sum;
    END IF;

    SELECT count(*) INTO v_bad
      FROM public.position_verdicts pv
     WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version
       AND pv.peer_basis = 'none' AND pv.verdict_status = 'measured';
    IF v_bad > 0 THEN
        v_note := v_note || v_bad::text || ' measured positions have no basis; ';
    END IF;

    INSERT INTO public.book_risk_daily (
        as_of, logic_version, total_vol_annual, book_var_95_daily,
        sum_contributions, residual, effective_bets, cluster_shares,
        unmapped_theme_weight, cluster_threshold_rho,
        traded_book_return_pct, frozen_book_return_pct, trading_effect_pct,
        positions_cluster_eligible, positions_no_correlate)
    SELECT v_as_of, p_logic_version,
           (SELECT sum(v.marginal_vol_contribution * v.weight) * sqrt(252::numeric)
              FROM public.vw_risk_analysis v),
           (SELECT sum(v.dollar_var_95_daily) FROM public.vw_risk_analysis v
             WHERE v.symbol IN (SELECT pv.symbol FROM public.position_verdicts pv
                                 WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version)),
           (SELECT sum(pv.marginal_vol_contribution * pv.cluster_risk_share)
              FROM public.position_verdicts pv
             WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version),
           -- Written out, never swept up (memo v2 §2.8).
           (SELECT sum(v.marginal_vol_contribution * v.weight) FROM public.vw_risk_analysis v)
             - (SELECT COALESCE(sum(v.marginal_vol_contribution * v.weight), 0)
                  FROM public.vw_risk_analysis v
                 WHERE v.symbol IN (SELECT pv.symbol FROM public.position_verdicts pv
                                     WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version)),
           (SELECT 1.0 / NULLIF(sum(s.share * s.share), 0)
              FROM (SELECT DISTINCT pv.cluster_id, pv.cluster_risk_share AS share
                      FROM public.position_verdicts pv
                     WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version
                       AND pv.cluster_risk_share IS NOT NULL) s),
           (SELECT jsonb_object_agg(s.cluster_id::text, round(s.share, 6))
              FROM (SELECT DISTINCT pv.cluster_id, pv.cluster_risk_share AS share
                      FROM public.position_verdicts pv
                     WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version
                       AND pv.cluster_risk_share IS NOT NULL AND pv.cluster_id IS NOT NULL) s),
           (SELECT COALESCE(sum(v.weight) FILTER (
                     WHERE NOT EXISTS (SELECT 1 FROM public.position_themes pt
                                        WHERE pt.symbol = v.symbol AND pt.theme IS NOT NULL)), 0)
                   / NULLIF(sum(v.weight), 0)
              FROM public.vw_risk_analysis v
             WHERE v.symbol IN (SELECT pv.symbol FROM public.position_verdicts pv
                                 WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version)),
           0.75,
           b.traded_book_return_pct, b.frozen_book_return_pct, b.trading_effect_pct,
           b.positions_cluster_eligible, b.positions_no_correlate
      FROM public.vw_book_frozen_baseline b
    ON CONFLICT (as_of, logic_version) DO NOTHING;

    UPDATE public.sync_log
       SET status = 'success', finished_at = now(),
           details = details || jsonb_build_object(
               'rows_written', v_written,
               'cluster_risk_share_sum', v_share_sum,
               'notes', v_note)
     WHERE id = v_log_id;

    RETURN QUERY SELECT v_as_of, p_logic_version, v_written, NULLIF(v_note, '');
END;
$$;

COMMENT ON FUNCTION public.atlas_write_verdicts(date, text, boolean) IS
 'The nightly verdict job (step 4 addendum rev. B §8.7). Refreshes the five materialised inputs in dependency order, refuses to write against a stale positions snapshot (§6), writes one row per open position to position_verdicts and one to book_risk_daily, and asserts the two cross-row invariants that cannot be CHECK constraints. Idempotent on (as_of, asset_id, logic_version).';

-- pg_cron and nowhere else, per CLAUDE.md. 23:37 sits after
-- refresh_position_returns (23:35) and before atlas_run_validation (23:40),
-- so validation grades the night it is actually looking at.
SELECT cron.schedule(
    'atlas_write_verdicts',
    '37 23 * * 1-5',
    $cron$select public.atlas_write_verdicts();$cron$
);
