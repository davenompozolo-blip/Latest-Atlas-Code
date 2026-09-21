-- ============================================================
-- Defect 3, step 2: the segment risk share becomes Euler-additive
-- ------------------------------------------------------------
-- `risk` used to read `v.marginal_vol_contribution * v.weight`, and the comment
-- it carried said the raw column was "the partial derivative, so it needs the
-- weight". It is not. B4 established the column is `weight * annual_vol`, so
-- the multiply produced `weight^2 * vol` -- the same dimensional error defect 2
-- found in `total_vol_annual`, arriving here through a comment that asserted a
-- form the column never had. The 2026-09-07 entry in CLAUDE.md records that
-- form being CHECKED before use; the check reached the wrong conclusion.
--
-- The consequence is worse at segment level than at position level. The old
-- measure has no covariance in it, so it is positive by construction and can
-- never report that a segment OFFSETS the rest of the book. The offsets that
-- cancel inside a cluster are exactly what it discards, so a per-position rank
-- error becomes a SIGN error once members are summed.
--
-- Measured on the 2026-09-18 book, written vs Euler:
--
--   BY BET    44 segments, 14 now negative, 16 moved >1pp, max 9.98pp
--   BY THEME  17 segments,  5 now negative,  9 moved >1pp, max 9.76pp
--
--   AI / accelerated compute   24.0% wt   54.95% -> 64.71%
--   Healthcare / defensives    10.3% wt    5.28% -> -0.98%
--   International / EM ETFs    10.3% wt    9.16% -> 15.27%
--   Software / SaaS             2.5% wt    1.88% -> -1.82%
--   Energy                      4.4% wt    1.43% -> -0.22%
--
-- The defensive sleeves were published as risk CONSUMERS. Healthcare at a tenth
-- of the book offsets risk, which is the one thing a defensive sleeve is bought
-- to do, and `weight x vol` is structurally incapable of saying so.
--
-- ## Coverage is published, not renormalised away
--
-- A member the correlation matrix cannot price is counted in
-- `risk_members_withheld` and its weight share in `risk_withheld_weight_pct`.
-- On this book IXC (no pairs in the matrix at all) makes the BY THEME Energy
-- sleeve report 37.06% of its weight unpriced behind a -0.21% reading, and
-- makes its BY BET singleton carry weight 1.69% with a NULL share and a NULL
-- basis rather than being dropped or zeroed.
--
-- Weight still comes from `vw_risk_analysis`, deliberately: sourcing it from
-- `vw_book_mctr` too would have made a withheld name vanish from `weight_share`
-- as well, which is not part of this change.
--
-- ## Verification
--
-- Applied as an asserted textual patch against `prosrc` (7 anchors, each
-- required to match exactly once) and the result hashes to the definition
-- produced independently offline:
--
--   select md5(prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='atlas_write_segment_verdicts';
--   -- expect 2870b327f8ef186b68347943153c59ce  (13143 chars)
--
-- Run under a sentinel logic_version against the live book: 44 + 17 rows,
-- both shares closing to 1.0000000000, then deleted.
-- ============================================================

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
    -- §2.4b. Weight from vw_risk_analysis; the RISK MEASURE from the Euler
    -- MCTR (defect 3). The old `marginal_vol_contribution * weight` was
    -- weight^2 * vol -- positive by construction, so it could never report a
    -- segment that OFFSETS the book. `risk_contribution_annual` is already
    -- mctr x weight; multiplying again reintroduces exactly that bug.
    risk AS (
        SELECT v.symbol,
               v.weight AS w
          FROM public.vw_risk_analysis v
         WHERE v.symbol IN (SELECT symbol FROM open_book)
    ),
    -- One scan: vw_book_mctr is ~340-450 ms.
    mctr AS (
        SELECT m.symbol,
               m.risk_contribution_annual AS rc,
               m.matrix_as_of
          FROM public.vw_book_mctr m
         WHERE m.symbol IN (SELECT symbol FROM open_book)
    ),
    mx AS (SELECT max(matrix_as_of) AS d FROM mctr),
    -- One basis for every member's excess, on purpose. Members differ in
    -- which counterfactual their CARD is measured against (tier 1 vs tier 2),
    -- and a standard deviation taken across those two bases is not a
    -- dispersion of anything. Tier 2 covers the book, so tier 2 it is, and
    -- `dispersion_basis` says so on every row.
    memb AS (
        SELECT s.grouping, s.segment_id, s.segment_kind, s.segment_label,
               o.symbol, o.net_pnl_usd,
               mc.rc, r.w,
               t2.excess_vs_book_pct AS member_excess,
               bt.thesis_state
          FROM public.vw_position_segments s
          JOIN open_book o ON o.asset_id = s.asset_id
          LEFT JOIN risk r  ON r.symbol = o.symbol
          LEFT JOIN mctr mc ON mc.symbol = o.symbol
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
               -- A member the matrix cannot price is COUNTED, never
               -- renormalised away.
               count(*) FILTER (WHERE m.rc IS NULL)  AS risk_withheld_n,
               sum(m.w) FILTER (WHERE m.rc IS NULL)  AS risk_withheld_w,
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
                 AS return_contribution_share,
               a.risk_withheld_n AS risk_members_withheld,
               CASE WHEN a.w IS NULL OR a.w = 0 THEN NULL
                    ELSE LEAST(100, GREATEST(0,
                         COALESCE(a.risk_withheld_w, 0) / a.w * 100)) END
                 AS risk_withheld_weight_pct
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
        thesis_coverage, verdict_counts,
        risk_basis, risk_matrix_as_of, risk_members_withheld, risk_withheld_weight_pct)
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
           vc.counts,
           -- The basis is NULL exactly when the figure is.
           CASE WHEN e.risk_share IS NULL THEN NULL ELSE 'mctr_euler' END,
           CASE WHEN e.risk_share IS NULL THEN NULL ELSE mx.d END,
           e.risk_members_withheld,
           e.risk_withheld_weight_pct
      FROM ext e
      CROSS JOIN mx
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
