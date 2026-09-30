-- ============================================================
-- `verdict_counts` counted distinct labels, not positions
-- ------------------------------------------------------------
-- The vc CTE grouped `position_verdicts` by (symbol, verdict_label), so every
-- row carried n = 1, and `jsonb_object_agg` keeps the LAST value on a
-- duplicate key rather than summing. Aggregating eight members of one segment
-- therefore produced one entry per distinct label, each equal to 1.
--
-- "AI / accelerated compute" (8 members) published
--     {"leader": 1, "lagging": 1, "cut_candidate": 1}
-- against a true
--     {"leader": 4, "lagging": 2, "cut_candidate": 2}
--
-- The counts summed to 3 on a segment of 8, and every multi-member segment
-- was understated the same way. Nothing on screen would have said so: three
-- plausible labels with plausible small numbers beside a member_count nobody
-- cross-added.
--
-- Third instance in this module of one shape -- an aggregate that silently
-- deduplicates. `sum(DISTINCT cluster_risk_share)` collapsed two buckets
-- holding an equal share (2026-09-06); `sum(DISTINCT ...)` over a float was
-- the fix's own trap; this one is `jsonb_object_agg` last-value-wins.
-- **Group by the key you are counting, then aggregate once.**
--
-- The invariant that catches it is that the counts must sum to member_count.
-- That is asserted in supabase/tests/segment_verdicts_invariants.sql rather
-- than as a CHECK, because a segment whose members have no verdict row yet
-- legitimately carries NULL.
-- ============================================================

DO $$
DECLARE
    src     text;
    patched text;
    a_old   text;
    a_new   text;
    n_hits  int;
BEGIN
    SELECT pg_get_functiondef(oid) INTO src
      FROM pg_proc WHERE proname = 'atlas_write_segment_verdicts';

    IF src IS NULL THEN
        RAISE EXCEPTION 'atlas_write_segment_verdicts not found';
    END IF;

    a_old := E'    vc AS (\n'
          || E'        SELECT s.grouping, s.segment_id,\n'
          || E'               jsonb_object_agg(COALESCE(pv.verdict_label, ''unlabelled''), pv.n) AS counts\n'
          || E'          FROM (SELECT grouping, segment_id, symbol FROM public.vw_position_segments) s\n'
          || E'          JOIN (SELECT symbol, verdict_label, count(*) AS n\n'
          || E'                  FROM public.position_verdicts\n'
          || E'                 WHERE as_of = v_as_of AND logic_version = p_logic_version\n'
          || E'                 GROUP BY symbol, verdict_label) pv ON pv.symbol = s.symbol\n'
          || E'         GROUP BY s.grouping, s.segment_id\n'
          || E'    )\n';

    -- Re-run guard.
    IF position('GROUP BY g.grouping, g.segment_id' in src) > 0 THEN
        RAISE NOTICE 'verdict_counts already patched -- nothing to do';
        RETURN;
    END IF;

    n_hits := (length(src) - length(replace(src, a_old, ''))) / length(a_old);
    IF n_hits <> 1 THEN
        RAISE EXCEPTION 'expected exactly 1 vc-CTE match, found %', n_hits;
    END IF;

    a_new := E'    -- Count POSITIONS per label, not labels. jsonb_object_agg keeps the\n'
          || E'    -- last value on a duplicate key, so grouping by (symbol, label) --\n'
          || E'    -- where every count is 1 -- collapsed a segment to one entry per\n'
          || E'    -- distinct label. Group by the key being counted, aggregate once.\n'
          || E'    vc AS (\n'
          || E'        SELECT g.grouping, g.segment_id, jsonb_object_agg(g.label, g.n) AS counts\n'
          || E'          FROM (SELECT p.grouping, p.segment_id,\n'
          || E'                       COALESCE(pv.verdict_label, ''unlabelled'') AS label,\n'
          || E'                       count(*) AS n\n'
          || E'                  FROM public.vw_position_segments p\n'
          || E'                  JOIN public.position_verdicts pv\n'
          || E'                    ON pv.symbol = p.symbol\n'
          || E'                   AND pv.as_of = v_as_of\n'
          || E'                   AND pv.logic_version = p_logic_version\n'
          || E'                 GROUP BY p.grouping, p.segment_id,\n'
          || E'                          COALESCE(pv.verdict_label, ''unlabelled'')) g\n'
          || E'         GROUP BY g.grouping, g.segment_id\n'
          || E'    )\n';

    patched := replace(src, a_old, a_new);
    EXECUTE patched;
END $$;
