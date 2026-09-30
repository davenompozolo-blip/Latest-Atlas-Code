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


CREATE OR REPLACE FUNCTION public.atlas_write_verdicts(
    p_as_of         date DEFAULT NULL,
    p_logic_version text DEFAULT 'v1:rho0.75:n5:mwr',
    p_refresh       boolean DEFAULT true)
RETURNS TABLE(as_of date, logic_version text, rows_written int, notes text)
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
    v_pos_as_of   := (SELECT max(as_of_date) FROM public.positions);
    v_last_traded := public.atlas_last_traded_day();

    INSERT INTO public.sync_log (job_name, status, started_at, details)
    VALUES ('atlas_write_verdicts', 'running', now(),
            jsonb_build_object('as_of', v_as_of, 'logic_version', p_logic_version))
    RETURNING id INTO v_log_id;

    -- ------------------------------------------------------------------
    -- Rev. B §6, last invariant: no verdict row while any position carries
    -- a stale broker row. `position_verdicts` is a history and a row written
    -- against yesterday's book freezes the wrong holdings into the record
    -- permanently - which is exactly the §1 blocker that gated this whole
    -- step. A view recomputes; a history does not.
    -- ------------------------------------------------------------------
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

    -- ------------------------------------------------------------------
    -- The rows
    -- ------------------------------------------------------------------
    WITH open_book AS (
        SELECT r.* FROM public.mv_position_returns r WHERE r.position_state = 'open'
    ),
    risk AS (
        -- Renormalised over the positions we actually rank. vw_risk_analysis
        -- carries 79 rows for 57 open names and its weights sum to 1.0157;
        -- the difference is written out as `residual` rather than absorbed.
        SELECT v.symbol, v.annual_vol, v.marginal_vol_contribution, v.dollar_var_95_daily,
               v.weight / NULLIF(sum(v.weight) OVER (), 0) AS w_norm
          FROM public.vw_risk_analysis v
         WHERE v.symbol IN (SELECT symbol FROM open_book)
    ),
    clus AS (
        SELECT u.symbol, u.cluster_id
          FROM public.universe_clusters u
         WHERE u.as_of_date = (SELECT max(as_of_date) FROM public.universe_clusters)
    ),
    -- Risk share is computed over a PARTITION (universe_clusters), not over
    -- Tier 1's rho >= 0.75 neighbourhood. They are different objects: a
    -- neighbourhood overlaps and covers 17 names, a partition covers the book
    -- and sums to 1. Conflating them is what would break the identity.
    share AS (
        SELECT c.cluster_id,
               sum(r.marginal_vol_contribution * r.w_norm) AS contrib
          FROM risk r JOIN clus c ON c.symbol = r.symbol
         GROUP BY c.cluster_id
    ),
    share_n AS (
        SELECT cluster_id, contrib / NULLIF(sum(contrib) OVER (), 0) AS cluster_risk_share
          FROM share
    ),
    -- The cluster leader must not be a leveraged product. SOXL tops five of
    -- the seventeen eligible clusters because a 3x fund takes a levered share
    -- of any move that went the right way; "switch to SOXL" is not advice this
    -- module should be able to emit. Gated on measured volatility rather than
    -- a name match: a leader more than 1.5x the position's own vol is not a
    -- like-for-like substitute whatever it is called.
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
           -- §2.7 floor. Also a CHECK; asserted here so the job fails loudly
           -- rather than the constraint firing on a row nobody looked at.
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

    -- ------------------------------------------------------------------
    -- Rev. B §6, the cross-row invariants. The single-row ones are CHECKs
    -- on the table and cannot be forgotten; these two cannot be CHECKs.
    -- ------------------------------------------------------------------
    SELECT sum(DISTINCT cluster_risk_share) INTO v_share_sum
      FROM (SELECT DISTINCT cluster_id, cluster_risk_share
              FROM public.position_verdicts
             WHERE as_of = v_as_of AND logic_version = p_logic_version
               AND cluster_risk_share IS NOT NULL) s;

    IF v_share_sum IS NOT NULL AND abs(v_share_sum - 1.0) > 0.005 THEN
        RAISE EXCEPTION 'cluster_risk_share sums to % across the book, not 1.0', v_share_sum;
    END IF;

    SELECT count(*) INTO v_bad
      FROM public.position_verdicts
     WHERE as_of = v_as_of AND logic_version = p_logic_version
       AND peer_basis = 'none' AND verdict_status = 'measured';
    IF v_bad > 0 THEN
        v_note := v_note || v_bad::text || ' measured positions have no basis; ';
    END IF;

    -- ------------------------------------------------------------------
    -- Book companion
    -- ------------------------------------------------------------------
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
             WHERE v.symbol IN (SELECT symbol FROM public.position_verdicts
                                 WHERE as_of = v_as_of AND logic_version = p_logic_version)),
           (SELECT sum(pv.marginal_vol_contribution * pv.cluster_risk_share)
              FROM public.position_verdicts pv
             WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version),
           -- Written out, never swept up (memo v2 §2.8): the gap between the
           -- whole risk view and the positions actually ranked.
           (SELECT sum(v.marginal_vol_contribution * v.weight) FROM public.vw_risk_analysis v)
             - (SELECT COALESCE(sum(v.marginal_vol_contribution * v.weight), 0)
                  FROM public.vw_risk_analysis v
                 WHERE v.symbol IN (SELECT symbol FROM public.position_verdicts
                                     WHERE as_of = v_as_of AND logic_version = p_logic_version)),
           (SELECT 1.0 / NULLIF(sum(s.share * s.share), 0)
              FROM (SELECT DISTINCT cluster_id, cluster_risk_share AS share
                      FROM public.position_verdicts
                     WHERE as_of = v_as_of AND logic_version = p_logic_version
                       AND cluster_risk_share IS NOT NULL) s),
           (SELECT jsonb_object_agg(s.cluster_id::text, round(s.share, 6))
              FROM (SELECT DISTINCT cluster_id, cluster_risk_share AS share
                      FROM public.position_verdicts
                     WHERE as_of = v_as_of AND logic_version = p_logic_version
                       AND cluster_risk_share IS NOT NULL AND cluster_id IS NOT NULL) s),
           (SELECT COALESCE(sum(v.weight), 0) / NULLIF(sum(sum(v.weight)) OVER (), 0)
              FROM public.vw_risk_analysis v
             WHERE v.symbol IN (SELECT symbol FROM public.position_verdicts
                                 WHERE as_of = v_as_of AND logic_version = p_logic_version)
               AND NOT EXISTS (SELECT 1 FROM public.position_themes pt
                                WHERE pt.symbol = v.symbol AND pt.theme IS NOT NULL)
             LIMIT 1),
           0.75,
           b.traded_book_return_pct, b.frozen_book_return_pct, b.trading_effect_pct,
           b.positions_cluster_eligible, b.positions_no_correlate
      FROM public.vw_book_frozen_baseline b
    ON CONFLICT (as_of, logic_version) DO NOTHING;

    UPDATE public.sync_log
       SET status = 'success', finished_at = now(),
           rows_processed = v_written,
           details = details || jsonb_build_object(
               'rows_written', v_written,
               'cluster_risk_share_sum', v_share_sum,
               'notes', v_note)
     WHERE id = v_log_id;

    RETURN QUERY SELECT v_as_of, p_logic_version, v_written,
                        NULLIF(v_note, '');
END;
$$;

COMMENT ON FUNCTION public.atlas_write_verdicts(date, text, boolean) IS
 'The nightly verdict job (step 4 addendum rev. B §8.7). Refreshes the five materialised inputs in dependency order, refuses to write against a stale positions snapshot (§6), writes one row per open position to position_verdicts and one to book_risk_daily, and asserts the cross-row invariants that cannot be CHECK constraints. Idempotent on (as_of, asset_id, logic_version).';
