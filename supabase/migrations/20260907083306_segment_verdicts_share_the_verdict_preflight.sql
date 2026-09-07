-- ============================================================
-- The segment history needs the same gate as the position history
-- ------------------------------------------------------------
-- `atlas_write_verdicts` refuses to write while `positions` is behind the
-- last traded day, because a history row written against yesterday's book
-- freezes the wrong holdings into the record permanently -- a view
-- recomputes, a history does not.
--
-- `segment_verdicts` is the same kind of object and had no such gate. It
-- reads the same live `positions`, `vw_risk_analysis` and cash flows, so a
-- stale or incoherent book produces a permanently wrong segment row in
-- exactly the same way. Worse, it would sail through on a night the position
-- job correctly refused, leaving level 2 populated and level 3 empty for
-- that date.
--
-- Sharing the preflight rather than writing a second one is deliberate: two
-- gates that are meant to agree will eventually disagree.
-- ============================================================

DO $$
DECLARE
    src      text;
    patched  text;
    anchor   text;
    ins      text;
    n_hits   int;
BEGIN
    SELECT pg_get_functiondef(oid) INTO src
      FROM pg_proc WHERE proname = 'atlas_write_segment_verdicts';

    IF src IS NULL THEN
        RAISE EXCEPTION 'atlas_write_segment_verdicts not found';
    END IF;

    -- Re-run guard: if the preflight is already in the body, this migration
    -- has been applied and must not stack a second copy.
    IF position('atlas_verdict_preflight' in src) > 0 THEN
        RAISE NOTICE 'preflight already present -- nothing to do';
        RETURN;
    END IF;

    anchor := E'    REFRESH MATERIALIZED VIEW public.mv_segment_ex_index;\n';

    n_hits := (length(src) - length(replace(src, anchor, ''))) / length(anchor);
    IF n_hits <> 1 THEN
        RAISE EXCEPTION 'expected exactly 1 anchor match, found %', n_hits;
    END IF;

    ins := E'    -- Same gate as atlas_write_verdicts, shared rather than reimplemented:\n'
        || E'    -- a segment row written against a stale or incoherent book is frozen\n'
        || E'    -- into an append-only history that cannot be backfilled.\n'
        || E'    SELECT jsonb_agg(jsonb_build_object(''check'', check_name, ''passed'', passed,\n'
        || E'                                        ''detail'', detail)),\n'
        || E'           string_agg(check_name || '': '' || detail, ''; '') FILTER (WHERE NOT passed)\n'
        || E'      INTO v_pre, v_failed\n'
        || E'      FROM public.atlas_verdict_preflight();\n'
        || E'\n'
        || E'    IF v_failed IS NOT NULL THEN\n'
        || E'        UPDATE public.sync_log\n'
        || E'           SET status = ''skipped'', finished_at = now(),\n'
        || E'               details = details || jsonb_build_object(''reason'', ''preflight failed'',\n'
        || E'                                                      ''preflight'', v_pre)\n'
        || E'         WHERE id = v_log_id;\n'
        || E'        RAISE EXCEPTION ''refusing to write segment verdicts - preflight failed: %'', v_failed;\n'
        || E'    END IF;\n'
        || E'\n'
        || anchor;

    patched := replace(src, anchor, ins);

    -- The two new locals.
    anchor := E'    v_sums     jsonb;\n';
    n_hits := (length(patched) - length(replace(patched, anchor, ''))) / length(anchor);
    IF n_hits <> 1 THEN
        RAISE EXCEPTION 'expected exactly 1 declare-block match, found %', n_hits;
    END IF;
    patched := replace(patched, anchor, anchor || E'    v_pre      jsonb;\n    v_failed   text;\n');

    -- And record the preflight on the successful run too, so a green row says
    -- what it was green against.
    anchor := E'               ''share_sums'', v_sums)\n';
    n_hits := (length(patched) - length(replace(patched, anchor, ''))) / length(anchor);
    IF n_hits <> 1 THEN
        RAISE EXCEPTION 'expected exactly 1 details match, found %', n_hits;
    END IF;
    patched := replace(patched, anchor,
                       E'               ''share_sums'', v_sums,\n               ''preflight'', v_pre)\n');

    EXECUTE patched;
END $$;
