-- A no-op must not answer 200 — second instance.
--
-- The verdict job's first scheduled run (2026-08-26 23:37) logged `success`
-- with rows_written = 0. Benign in itself: the 57 rows for that as_of already
-- existed from an earlier manual run the same UTC day, and the insert's
-- ON CONFLICT (as_of, asset_id, logic_version) DO NOTHING skipped all of them.
--
-- The defect is that the job could not tell that apart from producing nothing
-- at all. An empty `positions`, a broken join, or any future change that made
-- the INSERT ... SELECT return no rows would log `success, 0 rows` in exactly
-- the same shape. CLAUDE.md already records this failure for
-- `chain_theme_leadership`, which ran for weeks logging success while
-- `theme_leadership_weekly` never received a row.
--
-- Three outcomes, now distinguished:
--
--   rows_written > 0                  -> success
--   0 written, rows already present   -> skipped, 'already written for this as_of'
--   0 written, nothing present        -> error + RAISE
--
-- The middle case is the ordinary idempotent re-run and is no longer dressed
-- up as a successful write. The last is the one that was previously invisible.
--
-- `rows_present` is logged alongside `rows_written` so the distinction is
-- readable from sync_log without re-deriving it.

DO $patch$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname='atlas_write_verdicts' AND pronamespace='public'::regnamespace;
  IF position('v_existing' in src) > 0 THEN
    RAISE NOTICE 'atlas_write_verdicts already carries the no-op guard - skipping';
    RETURN;
  END IF;

  src := replace(src, E'    v_failed       text;',
                      E'    v_failed       text;\n    v_existing     int;');

  src := replace(src,
    E'    UPDATE public.sync_log\n       SET status = ''success'', finished_at = now(),\n           details = details || jsonb_build_object(\n               ''rows_written'', v_written,',
    E'    SELECT count(*) INTO v_existing\n      FROM public.position_verdicts pv\n     WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version;\n\n    IF v_written = 0 AND v_existing = 0 THEN\n        UPDATE public.sync_log\n           SET status = ''error'', finished_at = now(),\n               error_message = ''wrote no verdict rows and none exist for this as_of'',\n               details = details || jsonb_build_object(''preflight'', v_pre)\n         WHERE id = v_log_id;\n        RAISE EXCEPTION ''verdict job produced no rows for % / % and none exist'',\n                        v_as_of, p_logic_version;\n    END IF;\n\n    UPDATE public.sync_log\n       SET status = CASE WHEN v_written = 0 THEN ''skipped'' ELSE ''success'' END,\n           finished_at = now(),\n           error_message = CASE WHEN v_written = 0\n                                THEN ''already written for this as_of'' END,\n           details = details || jsonb_build_object(\n               ''rows_written'', v_written,\n               ''rows_present'', v_existing,');

  IF position('rows_present' in src) = 0 THEN
    RAISE EXCEPTION 'no-op guard anchor not found in atlas_write_verdicts';
  END IF;

  -- '' and NULL should not disagree between the log and the returned value
  src := replace(src, E'               ''notes'', v_note)', E'               ''notes'', NULLIF(v_note, ''''))');

  EXECUTE src;
END $patch$;
