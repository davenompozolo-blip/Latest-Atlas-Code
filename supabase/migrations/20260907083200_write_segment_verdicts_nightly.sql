-- ============================================================
-- atlas_write_segment_verdicts() -- the nightly segment aggregation
-- ------------------------------------------------------------
-- Runs after atlas_write_verdicts, whose rows supply `verdict_counts`.
--
-- ## Three outcomes, never two
--
-- Same shape atlas_write_verdicts was corrected to on 2026-08-27, for the
-- same reason: `ON CONFLICT DO NOTHING` makes an idempotent re-run and a
-- broken join produce the identical "success, 0 rows". They are logged apart.
--
--   written > 0            -> success
--   written = 0, present>0 -> skipped, "already written for this as_of"
--   written = 0, present=0 -> error + RAISE
--
-- ## The one invariant that cannot be a CHECK
--
-- risk_share and weight_share must each close to 1.0 WITHIN EACH GROUPING.
-- That spans rows, so it stays here. It is also the whole argument for the
-- §2.4b position-level basis, so an unchecked version of it would be worth
-- very little.
--
-- NOTE: the shared preflight gate is added by the immediately following
-- migration (20260907083306), which patches this body textually.
-- ============================================================

CREATE OR REPLACE FUNCTION public.atlas_write_segment_verdicts(
    p_as_of         date DEFAULT NULL,
    p_logic_version text DEFAULT 'v1:rho0.75:n5:mwr')
RETURNS TABLE(out_as_of date, out_grouping text, out_rows_written integer, out_notes text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_as_of    date;
    v_written  int;
    v_existing int;
    v_log_id   bigint;
    v_bad      text;
    v_sums     jsonb;
BEGIN
    v_as_of := COALESCE(p_as_of, CURRENT_DATE);

    INSERT INTO public.sync_log (source, function_name, status, started_at, details)
    VALUES ('atlas_write_segment_verdicts', 'atlas_write_segment_verdicts', 'running', now(),
            jsonb_build_object('as_of', v_as_of, 'logic_version', p_logic_version))
    RETURNING id INTO v_log_id;

    REFRESH MATERIALIZED VIEW public.mv_segment_ex_index;

    WITH open_book AS (
        SELECT r.asset_id, r.symbol, r.engine_status, r.net_pnl_usd
          FROM public.mv_position_returns r
         WHERE r.position_state = 'open'
    ),
    -- §2.4b. Position-level weighted marginal contribution: the raw column is
    -- the partial derivative, so it needs the weight. Renormalised over the
    -- positions actually ranked, exactly as atlas_write_verdicts does.
    risk AS (
        SELECT v.symbol,
               v.marginal_vol_contribution * v.weight AS rc,
               v.weight AS w
          FROM public.vw_risk_analysis v
         WHERE v.symbol IN (SELECT symbol FROM open_book)
    ),
    -- One basis for every member's excess, on purpose. Members differ in
    -- which counterfactual their CARD is measured against (tier 1 vs tier 2),
    -- and a standard deviation taken across those two bases is not a
    -- dispersion of anything. Tier 2 covers the book, so tier 2 it is, and
    -- `dispersion_basis` says so on every row.
    memb AS (
        SELECT s.grouping, s.segment_id, s.segment_kind, s.segment_label,
               o.symbol, o.net_pnl_usd,
               r.rc, r.w,
               t2.excess_vs_book_pct AS member_excess,
               bt.thesis_state
          FROM public.vw_position_segments s
          JOIN open_book o ON o.asset_id = s.asset_id
          LEFT JOIN risk r  ON r.symbol = o.symbol
          LEFT JOIN public.mv_position_tier2 t2 ON t2.symbol = o.symbol
          LEFT JOIN public.vw_bench_thesis_state bt ON bt.symbol = o.symbol
    ),
    agg AS (
        SELECT m.grouping, m.segment_id,
               min(m.segment_kind)  AS segment_kind,
               min(m.segment_label) AS segment_label,
               count(*)             AS member_count,
               array_agg(m.symbol ORDER BY m.w DESC NULLS LAST) AS members,
               sum(m.rc)            AS rc,
               sum(m.w)             AS w,
               sum(m.net_pnl_usd)   AS net_pnl_usd,
               stddev_samp(m.member_excess) AS dispersion,
               count(*) FILTER (WHERE m.thesis_state IS NOT NULL)::numeric
                 / NULLIF(count(*), 0)      AS thesis_coverage
          FROM memb m
         GROUP BY m.grouping, m.segment_id
    ),
    ext AS (
        SELECT a.*,
               a.rc / NULLIF(sum(a.rc) OVER (PARTITION BY a.grouping), 0) AS risk_share,
               a.w  / NULLIF(sum(a.w)  OVER (PARTITION BY a.grouping), 0) AS weight_share,
               a.net_pnl_usd
                 / NULLIF(sum(a.net_pnl_usd) OVER (PARTITION BY a.grouping), 0)
                 AS return_contribution_share
          FROM agg a
    ),
    best AS (
        SELECT DISTINCT ON (m.grouping, m.segment_id)
               m.grouping, m.segment_id, m.symbol AS sym, m.member_excess AS ex
          FROM memb m WHERE m.member_excess IS NOT NULL
         ORDER BY m.grouping, m.segment_id, m.member_excess DESC
    ),
    worst AS (
        SELECT DISTINCT ON (m.grouping, m.segment_id)
               m.grouping, m.segment_id, m.symbol AS sym, m.member_excess AS ex
          FROM memb m WHERE m.member_excess IS NOT NULL
         ORDER BY m.grouping, m.segment_id, m.member_excess ASC
    ),
    vc AS (
        SELECT s.grouping, s.segment_id,
               jsonb_object_agg(COALESCE(pv.verdict_label, 'unlabelled'), pv.n) AS counts
          FROM (SELECT grouping, segment_id, symbol FROM public.vw_position_segments) s
          JOIN (SELECT symbol, verdict_label, count(*) AS n
                  FROM public.position_verdicts
                 WHERE as_of = v_as_of AND logic_version = p_logic_version
                 GROUP BY symbol, verdict_label) pv ON pv.symbol = s.symbol
         GROUP BY s.grouping, s.segment_id
    )
    INSERT INTO public.segment_verdicts (
        as_of, logic_version, grouping, segment_id, segment_kind, segment_label,
        member_count, members, members_measured, members_withheld, withheld_symbols,
        weight_share, risk_share, return_contribution_share, net_pnl_usd,
        traded_mwr_pct, cf_mwr_pct, excess_vs_book_pct, cf_status, cf_reason,
        dispersion, best_member, best_member_excess_pct,
        worst_member, worst_member_excess_pct, dispersion_basis,
        thesis_coverage, verdict_counts)
    SELECT v_as_of, p_logic_version, e.grouping, e.segment_id, e.segment_kind, e.segment_label,
           e.member_count, e.members,
           cf.members_measured, cf.members_withheld, COALESCE(cf.withheld_symbols, '{}'),
           e.weight_share, e.risk_share, e.return_contribution_share, e.net_pnl_usd,
           cf.traded_mwr_pct, cf.cf_mwr_pct, cf.excess_vs_book_pct, cf.cf_status, cf.cf_reason,
           CASE WHEN e.member_count >= 2 THEN e.dispersion END,
           b.sym, b.ex, w.sym, w.ex,
           CASE WHEN e.member_count >= 2 AND e.dispersion IS NOT NULL
                THEN 'tier2:excess_vs_book' END,
           e.thesis_coverage,
           vc.counts
      FROM ext e
      CROSS JOIN LATERAL public.atlas_counterfactual_segment(e.grouping, e.segment_id) cf
      LEFT JOIN best  b  ON b.grouping  = e.grouping AND b.segment_id  = e.segment_id
      LEFT JOIN worst w  ON w.grouping  = e.grouping AND w.segment_id  = e.segment_id
      LEFT JOIN vc       ON vc.grouping = e.grouping AND vc.segment_id = e.segment_id
    ON CONFLICT (as_of, logic_version, grouping, segment_id) DO NOTHING;

    GET DIAGNOSTICS v_written = ROW_COUNT;

    -- ------------------------------------------------------------------
    -- The cross-row invariant: both shares close to 1.0, within EACH
    -- grouping. This is the §2.4b claim stated as a test.
    -- ------------------------------------------------------------------
    SELECT jsonb_object_agg(g.grouping,
                            jsonb_build_object('risk', round(g.r, 10),
                                               'weight', round(g.w, 10),
                                               'segments', g.n)),
           string_agg(g.grouping || ': risk ' || round(g.r, 6)::text
                                 || ', weight ' || round(g.w, 6)::text, '; ')
             FILTER (WHERE abs(g.r - 1.0) > 0.005 OR abs(g.w - 1.0) > 0.005)
      INTO v_sums, v_bad
      FROM (SELECT grouping, sum(risk_share) AS r, sum(weight_share) AS w, count(*) AS n
              FROM public.segment_verdicts
             WHERE as_of = v_as_of AND logic_version = p_logic_version
             GROUP BY grouping) g;

    IF v_bad IS NOT NULL THEN
        UPDATE public.sync_log
           SET status = 'error', finished_at = now(),
               error_message = 'segment shares do not close to 1.0 -- ' || v_bad
         WHERE id = v_log_id;
        RAISE EXCEPTION 'segment shares do not close to 1.0 -- %', v_bad;
    END IF;

    SELECT count(*) INTO v_existing
      FROM public.segment_verdicts
     WHERE as_of = v_as_of AND logic_version = p_logic_version;

    IF v_written = 0 AND v_existing = 0 THEN
        UPDATE public.sync_log
           SET status = 'error', finished_at = now(),
               error_message = 'wrote no segment rows and none exist for this as_of'
         WHERE id = v_log_id;
        RAISE EXCEPTION 'segment verdict job produced no rows for % / % and none exist',
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
               'share_sums', v_sums)
     WHERE id = v_log_id;

    RETURN QUERY
    SELECT v_as_of, sv.grouping, count(*)::int, NULL::text
      FROM public.segment_verdicts sv
     WHERE sv.as_of = v_as_of AND sv.logic_version = p_logic_version
     GROUP BY sv.grouping;
END;
$function$;

COMMENT ON FUNCTION public.atlas_write_segment_verdicts(date, text) IS
'Nightly segment aggregation for the Performance level-2 view. Runs after '
'atlas_write_verdicts (which supplies verdict_counts). Refuses to leave a run '
'green unless risk_share and weight_share each close to 1.0 within both '
'groupings.';

GRANT EXECUTE ON FUNCTION public.atlas_write_segment_verdicts(date, text) TO service_role;
