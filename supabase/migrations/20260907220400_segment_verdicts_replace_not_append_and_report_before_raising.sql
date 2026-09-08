-- The segment job's first scheduled run failed. Two defects, one hiding the
-- other, both found only because a check-in went looking -- nothing on any
-- surface the platform monitors said anything had gone wrong.
--
-- 1. REPLACE, NOT APPEND. `segment_verdicts` was keyed
--    (as_of, logic_version, grouping, segment_id) with ON CONFLICT DO NOTHING,
--    copied from `atlas_write_verdicts`. That pattern is idempotent only if the
--    key is STABLE, and `position_verdicts` satisfies that because `asset_id`
--    is. A segment id is DERIVED FROM THE CLUSTERING and is not: between a
--    manual write at 15:36 and the 23:38 cron -- which runs a minute after
--    `atlas_write_verdicts` refreshes the matviews at 23:37 -- 34 segment ids
--    appeared and 35 retired. DO NOTHING therefore ADDED the night's ids to the
--    morning's stale ones, and the day held two segmentations at once. The
--    shares closed to 1.875, and the invariant correctly refused.
--
-- 2. A `RAISE EXCEPTION` ROLLS BACK THE `sync_log` ROW MEANT TO RECORD IT.
--    The share check ran after the INSERT, so the only way to refuse was to
--    raise -- which took the log row with it. The failure existed solely in
--    `cron.job_run_details`. Validate BEFORE you write: the coverage check now
--    runs against the snapshot, and on failure it UPDATEs the log row and
--    RETURNs. The post-write check survives as belt and braces, because
--    reaching it means the snapshot closed and the written rows did not, which
--    is a real corruption and worth losing the log row to refuse.
--
-- The precheck is a MEMBERSHIP check, not a share check. The first attempt
-- normalised `sum(risk_share) OVER ()` across both groupings, so each closed to
-- ~0.5 and the job refused every run; and shares sum to 1 by construction
-- inside the INSERT anyway, so the share form was both wrong and vacuous. What
-- it actually needs to know is whether the segmentation still covers the open
-- book -- and that is the thing a stale clustering breaks.
--
-- Verified over two consecutive runs: written=56/replaced=0, then
-- written=56/replaced=56, shares exactly 1.0000000000 under both groupings,
-- 59 members per grouping.

CREATE OR REPLACE FUNCTION public.atlas_write_segment_verdicts(
    p_as_of date DEFAULT NULL::date,
    p_logic_version text DEFAULT 'v1:rho0.75:n5:mwr'::text)
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
    v_pre      jsonb;
    v_replaced int := 0;
    v_pre_sums jsonb;
    v_failed   text;
BEGIN
    v_as_of := COALESCE(p_as_of, CURRENT_DATE);

    INSERT INTO public.sync_log (source, function_name, status, started_at, details)
    VALUES ('atlas_write_segment_verdicts', 'atlas_write_segment_verdicts', 'running', now(),
            jsonb_build_object('as_of', v_as_of, 'logic_version', p_logic_version))
    RETURNING id INTO v_log_id;

    -- Same gate as atlas_write_verdicts, shared rather than reimplemented:
    -- a segment row written against a stale or incoherent book is frozen
    -- into an append-only history that cannot be backfilled.
    SELECT jsonb_agg(jsonb_build_object('check', check_name, 'passed', passed,
                                        'detail', detail)),
           string_agg(check_name || ': ' || detail, '; ') FILTER (WHERE NOT passed)
      INTO v_pre, v_failed
      FROM public.atlas_verdict_preflight();

    IF v_failed IS NOT NULL THEN
        UPDATE public.sync_log
           SET status = 'skipped', finished_at = now(),
               details = details || jsonb_build_object('reason', 'preflight failed',
                                                      'preflight', v_pre)
         WHERE id = v_log_id;
        RAISE EXCEPTION 'refusing to write segment verdicts - preflight failed: %', v_failed;
    END IF;

    REFRESH MATERIALIZED VIEW public.mv_segment_ex_index;

    -- Coverage is checked against the SNAPSHOT, before anything is
    -- written. Checking after the insert meant the only way to refuse
    -- was to RAISE, and the RAISE rolled back the sync_log row that
    -- recorded the refusal -- so the 2026-09-07 failure left nothing
    -- in the surface the platform monitors.
    SELECT jsonb_object_agg(g.grouping, jsonb_build_object('segmented', g.n, 'open', ob.n)),
           string_agg(g.grouping || ': ' || g.n || ' segmented vs ' || ob.n || ' open', '; ')
             FILTER (WHERE g.n <> ob.n)
      INTO v_pre_sums, v_bad
      FROM (SELECT grouping, count(*) n FROM public.vw_position_segments GROUP BY grouping) g
      CROSS JOIN (SELECT count(*) n FROM public.mv_position_returns
                   WHERE position_state = 'open') ob;

    IF v_bad IS NOT NULL THEN
        UPDATE public.sync_log
           SET status = 'error', finished_at = now(),
               error_message = 'segmentation does not cover the open book -- ' || v_bad,
               details = details || jsonb_build_object('coverage', v_pre_sums)
         WHERE id = v_log_id;
        RETURN;
    END IF;

    -- REPLACE, not append. Segment ids are derived from the clustering
    -- and are NOT stable across a re-run: 34 appeared and 35 retired
    -- between two writes of the same day. DO NOTHING then adds the new
    -- ids to the stale ones instead of skipping, and the day holds two
    -- segmentations at once.
    DELETE FROM public.segment_verdicts
     WHERE as_of = v_as_of AND logic_version = p_logic_version;
    GET DIAGNOSTICS v_replaced = ROW_COUNT;

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
    -- Count POSITIONS per label, not labels. jsonb_object_agg keeps the
    -- last value on a duplicate key, so grouping by (symbol, label) --
    -- where every count is 1 -- collapsed a segment to one entry per
    -- distinct label. Group by the key being counted, aggregate once.
    vc AS (
        SELECT g.grouping, g.segment_id, jsonb_object_agg(g.label, g.n) AS counts
          FROM (SELECT p.grouping, p.segment_id,
                       COALESCE(pv.verdict_label, 'unlabelled') AS label,
                       count(*) AS n
                  FROM public.vw_position_segments p
                  JOIN public.position_verdicts pv
                    ON pv.symbol = p.symbol
                   AND pv.as_of = v_as_of
                   AND pv.logic_version = p_logic_version
                 GROUP BY p.grouping, p.segment_id,
                          COALESCE(pv.verdict_label, 'unlabelled')) g
         GROUP BY g.grouping, g.segment_id
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

    -- Belt and braces. The pre-write check above is the one that can
    -- report; by here the rows are committed-in-transaction, so a RAISE
    -- would take the log with it. Reaching this means the snapshot
    -- closed and the written rows did not, which is a real corruption
    -- and worth losing the log row to refuse.
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'segment shares closed on the snapshot but not once written -- %', v_bad;
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
               'rows_replaced', v_replaced,
               'share_sums', v_sums,
               'preflight', v_pre)
     WHERE id = v_log_id;

    RETURN QUERY
    SELECT v_as_of, sv.grouping, count(*)::int, NULL::text
      FROM public.segment_verdicts sv
     WHERE sv.as_of = v_as_of AND sv.logic_version = p_logic_version
     GROUP BY sv.grouping;
END;
$function$;
