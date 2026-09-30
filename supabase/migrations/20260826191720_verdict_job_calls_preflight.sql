DO $patch$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname='atlas_write_verdicts' AND pronamespace='public'::regnamespace;

  -- extra locals
  src := replace(src,
    E'    v_log_id       bigint;',
    E'    v_log_id       bigint;\n    v_pre          jsonb;\n    v_failed       text;');
  IF position('v_failed       text;' in src) = 0 THEN
    RAISE EXCEPTION 'declare patch did not match';
  END IF;

  -- Replace the inline freshness-only gate with the full three-gate preflight.
  -- One gate definition, called by the job, rather than the job carrying its
  -- own copy of one of the three.
  src := replace(src,
    E'    IF v_pos_as_of IS NULL OR v_pos_as_of < v_last_traded THEN\n        UPDATE public.sync_log\n           SET status = ''skipped'', finished_at = now(),\n               details = details || jsonb_build_object(\n                   ''reason'', ''stale positions snapshot'',\n                   ''positions_as_of'', v_pos_as_of, ''last_traded_day'', v_last_traded)\n         WHERE id = v_log_id;\n        RAISE EXCEPTION\n            ''refusing to write verdicts: positions snapshot is % but the last traded day is %'',\n            v_pos_as_of, v_last_traded;\n    END IF;',
    E'    SELECT jsonb_agg(jsonb_build_object(''check'', check_name, ''passed'', passed, ''detail'', detail)),\n           string_agg(check_name || '': '' || detail, ''; '') FILTER (WHERE NOT passed)\n      INTO v_pre, v_failed\n      FROM public.atlas_verdict_preflight();\n\n    IF v_failed IS NOT NULL THEN\n        UPDATE public.sync_log\n           SET status = ''skipped'', finished_at = now(),\n               details = details || jsonb_build_object(''reason'', ''preflight failed'',\n                                                      ''preflight'', v_pre)\n         WHERE id = v_log_id;\n        RAISE EXCEPTION ''refusing to write verdicts - preflight failed: %'', v_failed;\n    END IF;');
  IF position('preflight failed' in src) = 0 THEN
    RAISE EXCEPTION 'preflight patch did not match';
  END IF;

  -- record the passing preflight on the success row too
  src := replace(src,
    E'''cluster_risk_share_sum'', v_share_sum,',
    E'''cluster_risk_share_sum'', v_share_sum,\n               ''preflight'', v_pre,');
  IF position('''preflight'', v_pre,' in src) = 0 THEN
    RAISE EXCEPTION 'success-log patch did not match';
  END IF;

  -- §3 coverage columns on the book row
  src := replace(src,
    E'        positions_cluster_eligible, positions_no_correlate)',
    E'        positions_cluster_eligible, positions_no_correlate,\n        positions_in_matrix, positions_absent_from_matrix)');
  src := replace(src,
    E'           b.positions_cluster_eligible, b.positions_no_correlate\n      FROM public.vw_book_frozen_baseline b',
    E'           b.positions_cluster_eligible, b.positions_no_correlate,\n           (SELECT count(*) FROM public.position_verdicts pv\n             WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version\n               AND pv.best_correlate_rho IS NOT NULL),\n           (SELECT count(*) FROM public.vw_held_symbols_absent_from_matrix)\n      FROM public.vw_book_frozen_baseline b');
  IF position('vw_held_symbols_absent_from_matrix)' in src) = 0 THEN
    RAISE EXCEPTION 'coverage column patch did not match';
  END IF;

  EXECUTE src;
END $patch$;
