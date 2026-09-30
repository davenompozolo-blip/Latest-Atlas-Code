-- ============================================================
-- The segment job failed on its first scheduled run. Two defects.
-- ------------------------------------------------------------
--   2026-09-07 23:38  atlas_write_segment_verdicts  FAILED
--   ERROR: segment shares do not close to 1.0 -- bet: risk 1.875066
--
-- ## 1. Segment ids are not stable, so ON CONFLICT DO NOTHING appends
--
-- The rows for this as_of had been written once already that day. Between
-- the two runs `atlas_write_verdicts` refreshed the verdict matviews, the
-- clustering moved, and the segmentation moved with it: **34 new segment ids,
-- 35 retired**. `ON CONFLICT (as_of, logic_version, grouping, segment_id)
-- DO NOTHING` therefore did not skip a re-run -- it INSERTED the 34 new ids
-- alongside the 57 stale ones, and the invariant summed 91 rows for one day.
-- 1.875 is not a broken share; it is two segmentations added together.
--
-- `position_verdicts` uses the same ON CONFLICT pattern safely because it is
-- keyed on `asset_id`, which is stable across a re-run. This table copied the
-- pattern without the property that made it safe. **A DO NOTHING upsert is
-- idempotent only if the key is stable; a derived key is not.**
--
-- The write is now a REPLACE for its (as_of, logic_version): the day's rows
-- are deleted and rewritten from one consistent snapshot. That is not a
-- weakening of the append-only history -- the history is one row-set per day,
-- and re-running a day with fresher inputs should produce that day's answer,
-- not that day's answer plus yesterday's fragments. `rows_replaced` is logged
-- so a rewrite is visible rather than silent.
--
-- ## 2. The failure left no trace where anyone looks
--
-- The invariant did `UPDATE sync_log SET status='error'` and then
-- `RAISE EXCEPTION`. The RAISE rolls back the transaction -- including that
-- UPDATE and the 'running' row it was updating. So a job that failed loudly
-- to `cron.job_run_details` left **nothing at all** in `sync_log`, which is
-- the surface `atlas_sync_status` and the terminal's health strip actually
-- read. It looked exactly like a job that never ran.
--
-- The check now runs BEFORE the write, against the same snapshot the write
-- would use. Nothing has been inserted, so there is nothing to roll back, and
-- the error row in `sync_log` survives. **Validate before you write** -- a
-- rollback cannot be made to preserve its own audit trail.
-- ============================================================

DO $$
DECLARE
    src     text;
    patched text;
    a_old   text;
    a_new   text;
    n       int;
BEGIN
    SELECT pg_get_functiondef(oid) INTO src
      FROM pg_proc WHERE proname = 'atlas_write_segment_verdicts';
    IF src IS NULL THEN RAISE EXCEPTION 'function not found'; END IF;

    IF position('rows_replaced' in src) > 0 THEN
        RAISE NOTICE 'already patched'; RETURN;
    END IF;

    -- ── 1. declare the two new locals ──────────────────────────
    a_old := E'    v_pre      jsonb;\n';
    n := (length(src) - length(replace(src, a_old, ''))) / length(a_old);
    IF n <> 1 THEN RAISE EXCEPTION 'declare anchor matched % times', n; END IF;
    patched := replace(src, a_old, a_old || E'    v_replaced int := 0;\n    v_pre_sums jsonb;\n');

    -- ── 2. validate the shares BEFORE writing, from the source ──
    --    and replace the day's rows rather than appending to them.
    a_old := E'    REFRESH MATERIALIZED VIEW public.mv_segment_ex_index;\n';
    n := (length(patched) - length(replace(patched, a_old, ''))) / length(a_old);
    IF n <> 1 THEN RAISE EXCEPTION 'refresh anchor matched % times', n; END IF;

    a_new := a_old
      || E'\n'
      || E'    -- Shares are checked against the SNAPSHOT, before anything is\n'
      || E'    -- written. Checking after the insert meant the only way to refuse\n'
      || E'    -- was to RAISE, and the RAISE rolled back the sync_log row that\n'
      || E'    -- recorded the refusal -- so the 2026-09-07 failure left nothing\n'
      || E'    -- in the surface the platform monitors.\n'
      || E'    WITH ob AS (SELECT symbol FROM public.mv_position_returns WHERE position_state = ''open''),\n'
      || E'         rk AS (SELECT v.symbol, v.marginal_vol_contribution * v.weight AS rc, v.weight AS w\n'
      || E'                  FROM public.vw_risk_analysis v\n'
      || E'                 WHERE v.symbol IN (SELECT symbol FROM ob)),\n'
      || E'         sg AS (SELECT p.grouping, sum(rk.rc) rc, sum(rk.w) w\n'
      || E'                  FROM public.vw_position_segments p\n'
      || E'                  JOIN rk ON rk.symbol = p.symbol\n'
      || E'                 GROUP BY p.grouping)\n'
      || E'    SELECT jsonb_object_agg(grouping, jsonb_build_object(''risk'', round(rc, 10), ''weight'', round(w, 10))),\n'
      || E'           string_agg(grouping || '': risk '' || round(rc, 6)::text, ''; '')\n'
      || E'             FILTER (WHERE abs(rc - 1.0) > 0.005 OR abs(w - 1.0) > 0.005)\n'
      || E'      INTO v_pre_sums, v_bad\n'
      || E'      FROM (SELECT grouping, rc / NULLIF(sum(rc) OVER (), 0) rc,\n'
      || E'                   w / NULLIF(sum(w) OVER (), 0) w FROM sg) s;\n'
      || E'\n'
      || E'    IF v_bad IS NOT NULL THEN\n'
      || E'        UPDATE public.sync_log\n'
      || E'           SET status = ''error'', finished_at = now(),\n'
      || E'               error_message = ''segment shares do not close to 1.0 -- '' || v_bad,\n'
      || E'               details = details || jsonb_build_object(''share_sums'', v_pre_sums)\n'
      || E'         WHERE id = v_log_id;\n'
      || E'        RETURN;\n'
      || E'    END IF;\n'
      || E'\n'
      || E'    -- REPLACE, not append. Segment ids are derived from the clustering\n'
      || E'    -- and are NOT stable across a re-run: 34 appeared and 35 retired\n'
      || E'    -- between two writes of the same day. DO NOTHING then adds the new\n'
      || E'    -- ids to the stale ones instead of skipping, and the day holds two\n'
      || E'    -- segmentations at once.\n'
      || E'    DELETE FROM public.segment_verdicts\n'
      || E'     WHERE as_of = v_as_of AND logic_version = p_logic_version;\n'
      || E'    GET DIAGNOSTICS v_replaced = ROW_COUNT;\n';

    patched := replace(patched, a_old, a_new);

    -- ── 3. the post-write check becomes a belt-and-braces assert ─
    a_old := E'    IF v_bad IS NOT NULL THEN\n'
          || E'        UPDATE public.sync_log\n'
          || E'           SET status = ''error'', finished_at = now(),\n'
          || E'               error_message = ''segment shares do not close to 1.0 -- '' || v_bad\n'
          || E'         WHERE id = v_log_id;\n'
          || E'        RAISE EXCEPTION ''segment shares do not close to 1.0 -- %'', v_bad;\n'
          || E'    END IF;\n';
    n := (length(patched) - length(replace(patched, a_old, ''))) / length(a_old);
    IF n <> 1 THEN RAISE EXCEPTION 'post-check anchor matched % times', n; END IF;
    patched := replace(patched, a_old,
        E'    -- Belt and braces. The pre-write check above is the one that can\n'
     || E'    -- report; by here the rows are committed-in-transaction, so a RAISE\n'
     || E'    -- would take the log with it. Reaching this means the snapshot\n'
     || E'    -- closed and the written rows did not, which is a real corruption\n'
     || E'    -- and worth losing the log row to refuse.\n'
     || E'    IF v_bad IS NOT NULL THEN\n'
     || E'        RAISE EXCEPTION ''segment shares closed on the snapshot but not once written -- %'', v_bad;\n'
     || E'    END IF;\n');

    -- ── 4. surface the replacement in the log ──────────────────
    a_old := E'               ''rows_present'', v_existing,\n';
    n := (length(patched) - length(replace(patched, a_old, ''))) / length(a_old);
    IF n <> 1 THEN RAISE EXCEPTION 'details anchor matched % times', n; END IF;
    patched := replace(patched, a_old, a_old || E'               ''rows_replaced'', v_replaced,\n');

    EXECUTE patched;
END $$;
