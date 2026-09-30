-- ============================================================
-- The pre-write check had to be about MEMBERSHIP, not shares
-- ------------------------------------------------------------
-- Two problems with the share version:
--
-- It was wrong. `sum(rc) OVER ()` spanned both groupings, so each grouping
-- normalised to ~0.5 and the job refused every run.
--
-- It was also vacuous. `risk_share` is computed inside the INSERT as
-- `rc / sum(rc) OVER (PARTITION BY grouping)`, so it sums to 1.0 by
-- construction. Checking it before the write asks whether division works.
-- The 1.875 that failed on 2026-09-07 was never a share fault at all -- it
-- was two segmentations in one day, and REPLACE has now removed that.
--
-- What actually makes the shares meaningful is that the segmentation covers
-- the open book exactly once per grouping. Lose a position and the rest
-- renormalise back to 1.0 and look perfectly healthy -- the same blindness
-- `segment_verdicts_invariants.sql` already asserts around. That is the check
-- worth running before writing a day's rows.
-- ============================================================

DO $$
DECLARE src text; patched text; a_old text; a_new text; n int;
BEGIN
    SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
     WHERE proname = 'atlas_write_segment_verdicts';

    IF position('segmented vs' in src) > 0 THEN
        RAISE NOTICE 'already patched'; RETURN;
    END IF;

    a_old := E'    WITH ob AS (SELECT symbol FROM public.mv_position_returns WHERE position_state = ''open''),\n'
          || E'         rk AS (SELECT v.symbol, v.marginal_vol_contribution * v.weight AS rc, v.weight AS w\n'
          || E'                  FROM public.vw_risk_analysis v\n'
          || E'                 WHERE v.symbol IN (SELECT symbol FROM ob)),\n'
          || E'         sg AS (SELECT p.grouping, sum(rk.rc)::numeric rc, sum(rk.w)::numeric w\n'
          || E'                  FROM public.vw_position_segments p\n'
          || E'                  JOIN rk ON rk.symbol = p.symbol\n'
          || E'                 GROUP BY p.grouping)\n'
          || E'    SELECT jsonb_object_agg(grouping, jsonb_build_object(''risk'', round(rc, 10), ''weight'', round(w, 10))),\n'
          || E'           string_agg(grouping || '': risk '' || round(rc, 6)::text, ''; '')\n'
          || E'             FILTER (WHERE abs(rc - 1.0) > 0.005 OR abs(w - 1.0) > 0.005)\n'
          || E'      INTO v_pre_sums, v_bad\n'
          || E'      FROM (SELECT grouping, rc / NULLIF(sum(rc) OVER (), 0) rc,\n'
          || E'                   w / NULLIF(sum(w) OVER (), 0) w FROM sg) s;\n';
    n := (length(src) - length(replace(src, a_old, ''))) / length(a_old);
    IF n <> 1 THEN RAISE EXCEPTION 'precheck anchor matched % times', n; END IF;

    a_new := E'    SELECT jsonb_object_agg(g.grouping, jsonb_build_object(''segmented'', g.n, ''open'', ob.n)),\n'
          || E'           string_agg(g.grouping || '': '' || g.n || '' segmented vs '' || ob.n || '' open'', ''; '')\n'
          || E'             FILTER (WHERE g.n <> ob.n)\n'
          || E'      INTO v_pre_sums, v_bad\n'
          || E'      FROM (SELECT grouping, count(*) n FROM public.vw_position_segments GROUP BY grouping) g\n'
          || E'      CROSS JOIN (SELECT count(*) n FROM public.mv_position_returns\n'
          || E'                   WHERE position_state = ''open'') ob;\n';
    patched := replace(src, a_old, a_new);

    a_old := E'               error_message = ''segment shares do not close to 1.0 -- '' || v_bad,\n';
    n := (length(patched) - length(replace(patched, a_old, ''))) / length(a_old);
    IF n <> 1 THEN RAISE EXCEPTION 'message anchor matched % times', n; END IF;
    patched := replace(patched, a_old,
        E'               error_message = ''segmentation does not cover the open book -- '' || v_bad,\n');

    a_old := E'               details = details || jsonb_build_object(''share_sums'', v_pre_sums)\n';
    n := (length(patched) - length(replace(patched, a_old, ''))) / length(a_old);
    IF n <> 1 THEN RAISE EXCEPTION 'details anchor matched % times', n; END IF;
    patched := replace(patched, a_old,
        E'               details = details || jsonb_build_object(''coverage'', v_pre_sums)\n');

    -- The comment above the block described the old check.
    a_old := E'    -- Shares are checked against the SNAPSHOT, before anything is\n';
    n := (length(patched) - length(replace(patched, a_old, ''))) / length(a_old);
    IF n <> 1 THEN RAISE EXCEPTION 'comment anchor matched % times', n; END IF;
    patched := replace(patched, a_old,
        E'    -- Coverage is checked against the SNAPSHOT, before anything is\n');

    EXECUTE patched;
END $$;
