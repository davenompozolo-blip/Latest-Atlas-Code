-- book_risk_daily.total_vol_annual was not a book volatility.
--
--   published:  sum(marginal_vol_contribution * weight) * sqrt(252)
--
-- marginal_vol_contribution is already `weight * ANNUAL vol`, so that squared
-- the weight AND re-annualised an already-annual figure -- two independent
-- dimensional errors that partly cancel into a plausible-looking number.
-- Measured on the live book: the published formula reproduces 10.99% today
-- against a stored 10.78%, while the undiversified sum is 40.18% and the real
-- diversified book vol is 19.53%. Realised equity-curve vol runs 24.8-28.9%
-- and E3's factor model gives 19.08% by a completely independent route, so
-- 19.5% is corroborated and 10.78% is not.
--
-- WHY NOT BUMP logic_version. atlas_write_verdicts writes position_verdicts
-- AND book_risk_daily under the same version key, and position_verdicts'
-- semantics are not changing. Bumping would falsely restate a verdict history
-- to mark a change that happened in one column of a companion table.
--
-- WHY NOT A PARALLEL COLUMN. Two unlabelled volatility columns is precisely
-- the total_return_pct / unrealised_return_pct failure this codebase spent an
-- entry fixing -- six sites read them and every one called its result "total
-- return".
--
-- So the series stays continuous and every row DECLARES its method, the same
-- construction as peer_basis, dispersion_basis, engine_status and
-- data_quality. The 13 existing rows are backfilled with the old basis rather
-- than left unlabelled, so no row is silently ambiguous, and the discontinuity
-- is legible at the exact row where it happens.
--
-- vol_matrix_as_of records WHICH correlation snapshot the figure rests on.
-- chain_ts_correlations runs 22:35 and this job 23:37, so it is normally the
-- same night -- but ts_clusters is on record failing with a 504 and leaving a
-- downstream job on a stale partition, and a silently stale matrix would move
-- this number with nothing on the row to say so. NULL on the old rows is
-- itself correct: that formula used no matrix at all.

alter table public.book_risk_daily
  add column if not exists vol_basis        text,
  add column if not exists vol_matrix_as_of date;

comment on column public.book_risk_daily.vol_basis is
  'How total_vol_annual was computed. mctr_covariance = Euler-additive Sigma = D R D '
  'from universe_correlations (B4). weight_sq_undiversified = the pre-2026-09-15 '
  'formula, sum(mvc*weight)*sqrt(252), which squared the weight and re-annualised.';

comment on column public.book_risk_daily.vol_matrix_as_of is
  'as_of_date of the universe_correlations snapshot behind total_vol_annual. '
  'NULL where the basis used no correlation matrix.';

-- Backfill before the CHECK, or the existing rows violate it.
update public.book_risk_daily
   set vol_basis = 'weight_sq_undiversified'
 where vol_basis is null
   and total_vol_annual is not null;

alter table public.book_risk_daily
  drop constraint if exists brd_vol_basis_ck;
alter table public.book_risk_daily
  add constraint brd_vol_basis_ck
  check (total_vol_annual is null
         or (vol_basis is not null and btrim(vol_basis) <> ''));

CREATE OR REPLACE FUNCTION public.atlas_write_verdicts(p_as_of date DEFAULT NULL::date, p_logic_version text DEFAULT 'v1:rho0.75:n5:mwr'::text, p_refresh boolean DEFAULT true)
 RETURNS TABLE(out_as_of date, out_logic_version text, out_rows_written integer, out_notes text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_as_of        date;
    v_pos_as_of    date;
    v_last_traded  date;
    v_written      int;
    v_share_sum    numeric;
    v_bad          int;
    v_note         text := '';
    v_log_id       bigint;
    v_pre          jsonb;
    v_failed       text;
    v_existing     int;
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

    -- ------------------------------------------------------------------
    -- Rev. B §6, last invariant: no verdict row while any position carries
    -- a stale broker row. `position_verdicts` is a history and a row written
    -- against yesterday's book freezes the wrong holdings into the record
    -- permanently - which is exactly the §1 blocker that gated this whole
    -- step. A view recomputes; a history does not.
    -- ------------------------------------------------------------------
    SELECT jsonb_agg(jsonb_build_object('check', check_name, 'passed', passed, 'detail', detail)),
           string_agg(check_name || ': ' || detail, '; ') FILTER (WHERE NOT passed)
      INTO v_pre, v_failed
      FROM public.atlas_verdict_preflight();

    IF v_failed IS NOT NULL THEN
        UPDATE public.sync_log
           SET status = 'skipped', finished_at = now(),
               details = details || jsonb_build_object('reason', 'preflight failed',
                                                      'preflight', v_pre)
         WHERE id = v_log_id;
        RAISE EXCEPTION 'refusing to write verdicts - preflight failed: %', v_failed;
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
         WHERE u.as_of_date = (SELECT max(u2.as_of_date) FROM public.universe_clusters u2)
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
                   WHEN 'basis_mismatch'  THEN 'basis_mismatch'
                   ELSE 'one_sided'
               END                                                     AS verdict_status,
               t1.cluster_eligible,
               t1.cluster_size,
               t1.avg_intra_rho,
               cl.cluster_id,   -- partition, not the tier-1 join (spec 2.4c)
               t1.cf_median_return_pct,
               t1.cf_best_return_pct,
               t1.cf_best_symbol,
               t1.cf_basket_return_pct,
               t1.cluster_dispersion,
               t1.rank_in_cluster,
               bt.thesis_state,
               bt.thesis_state_as_of,
               t1.cluster_members,
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
          LEFT JOIN public.vw_bench_thesis_state bt ON bt.symbol = o.symbol
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
        rank_in_cluster, cluster_members,
        thesis_state, thesis_state_as_of,
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
           l.rank_in_cluster, l.cluster_members,
           l.thesis_state, l.thesis_state_as_of,
           (l.verdict_status = 'measured'), l.mark_days_old
      FROM labelled l
    ON CONFLICT (as_of, asset_id, logic_version) DO NOTHING;

    GET DIAGNOSTICS v_written = ROW_COUNT;

    -- ------------------------------------------------------------------
    -- Rev. B §6, the cross-row invariants. The single-row ones are CHECKs
    -- on the table and cannot be forgotten; these two cannot be CHECKs.
    -- ------------------------------------------------------------------
    SELECT sum(s.share) INTO v_share_sum
      FROM (SELECT DISTINCT coalesce(pv.cluster_id::text, 'pos:' || pv.asset_id::text) AS bucket,
                   pv.cluster_risk_share AS share
              FROM public.position_verdicts pv
             WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version
               AND pv.cluster_risk_share IS NOT NULL) s;

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
        positions_cluster_eligible, positions_no_correlate,
        positions_in_matrix, positions_absent_from_matrix,
        vol_basis, vol_matrix_as_of)
    SELECT v_as_of, p_logic_version,
           -- Was sum(mvc * weight) * sqrt(252). mvc is already weight * ANNUAL
           -- vol, so that squared the weight AND re-annualised an annual figure
           -- -- two dimensional errors that partly cancelled into a
           -- plausible-looking 10.78% against a true ~19.5%. Read the real
           -- Euler-additive book vol instead (Sigma = D R D, B4).
           mc.vol,
           (SELECT sum(v.dollar_var_95_daily) FROM public.vw_risk_analysis v
             WHERE v.symbol IN (SELECT pv.symbol FROM public.position_verdicts pv
                                 WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version)),
           (SELECT sum(pv.marginal_vol_contribution * pv.cluster_risk_share)
              FROM public.position_verdicts pv
             WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version),
           -- Written out, never swept up (memo v2 §2.8): the gap between the
           -- whole risk view and the positions actually ranked.
           (SELECT sum(v.marginal_vol_contribution * v.weight) FROM public.vw_risk_analysis v)
             - (SELECT COALESCE(sum(v.marginal_vol_contribution * v.weight), 0)
                  FROM public.vw_risk_analysis v
                 WHERE v.symbol IN (SELECT pv.symbol FROM public.position_verdicts pv
                                     WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version)),
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
           (SELECT COALESCE(sum(v.weight) FILTER (
                     WHERE NOT EXISTS (SELECT 1 FROM public.position_themes pt
                                        WHERE pt.symbol = v.symbol AND pt.theme IS NOT NULL)), 0)
                   / NULLIF(sum(v.weight), 0)
              FROM public.vw_risk_analysis v
             WHERE v.symbol IN (SELECT pv.symbol FROM public.position_verdicts pv
                                 WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version)),
           0.75,
           b.traded_book_return_pct, b.frozen_book_return_pct, b.trading_effect_pct,
           b.positions_cluster_eligible, b.positions_no_correlate,
           (SELECT count(*) FROM public.position_verdicts pv
             WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version
               AND pv.best_correlate_rho IS NOT NULL),
           (SELECT count(*) FROM public.vw_held_symbols_absent_from_matrix),
           -- The basis is NULL exactly when the figure is, so a row can never
           -- claim a method for a number it does not have.
           CASE WHEN mc.vol IS NULL THEN NULL ELSE 'mctr_covariance' END,
           mc.mx
      FROM public.vw_book_frozen_baseline b
      -- One scan, not three: vw_book_mctr is ~340-450 ms and this file's own
      -- history records a view re-derived per reference costing 2,768 ms.
      LEFT JOIN LATERAL (
          SELECT max(m.book_vol_annual)::numeric AS vol,
                 max(m.matrix_as_of)            AS mx
            FROM public.vw_book_mctr m
      ) mc ON true
    ON CONFLICT (as_of, logic_version) DO NOTHING;

    SELECT count(*) INTO v_existing
      FROM public.position_verdicts pv
     WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version;

    IF v_written = 0 AND v_existing = 0 THEN
        UPDATE public.sync_log
           SET status = 'error', finished_at = now(),
               error_message = 'wrote no verdict rows and none exist for this as_of',
               details = details || jsonb_build_object('preflight', v_pre)
         WHERE id = v_log_id;
        RAISE EXCEPTION 'verdict job produced no rows for % / % and none exist',
                        v_as_of, p_logic_version;
    END IF;

    UPDATE public.sync_log
       SET status = CASE WHEN v_written = 0 THEN 'skipped' ELSE 'success' END,
           finished_at = now(),
           error_message = CASE WHEN v_written = 0
                                THEN 'already written for this as_of' END,
           details = details || jsonb_build_object(
               'rows_written', v_written,
               'rows_present', v_existing,
               'cluster_risk_share_sum', v_share_sum,
               'preflight', v_pre,
               'notes', NULLIF(v_note, ''))
     WHERE id = v_log_id;

    RETURN QUERY SELECT v_as_of, p_logic_version, v_written,
                        NULLIF(v_note, '');
END;
$function$;

