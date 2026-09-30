-- Step 4 close-out, part 2 — the preflight function, and the two patches that
-- wire it in.
--
-- `vw_position_returns` and `atlas_write_verdicts` are amended by textual
-- patch rather than restated in full. Both are large, both are already defined
-- in earlier migrations, and restating them here would fork the definition.
-- Every patch asserts its own anchor and RAISEs if the source has moved, so a
-- replay against a base that has drifted fails loudly rather than silently
-- doing nothing.

-- ============================================================
-- §1.3 the preflight
-- ============================================================

CREATE OR REPLACE FUNCTION public.atlas_verdict_preflight()
RETURNS TABLE (check_name text, passed boolean, detail text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_catalog
AS $$
BEGIN
    -- §1.1 Freshness. Compared against the last SESSION, never CURRENT_DATE:
    -- the job runs nightly and a calendar comparison would refuse every
    -- Saturday, Sunday and market holiday, leaving permanent gaps in a table
    -- whose whole value is being a continuous record.
    RETURN QUERY
    SELECT 'positions_freshness'::text,
           (SELECT max(as_of_date) FROM positions) >= atlas_last_traded_day(),
           format('positions %s vs last traded day %s',
                  (SELECT max(as_of_date) FROM positions), atlas_last_traded_day());

    -- §1.2 Coherence, scoped to the PHANTOM signature: the broker reports a
    -- non-zero holding that the ledger says was sold out. Exactly 2026-08-24 -
    -- AHR, BABA, NPSNY and VWAGY sold in full, ledger netted to zero, broker
    -- rows retained at pre-sale marks and correctly dated, so freshness passed
    -- them. Deliberately NOT "every symbol must reconcile": see the header of
    -- 20260826160000 for the 12 permanent rows that would refuse forever.
    RETURN QUERY
    SELECT 'ledger_coherence'::text,
           count(*) FILTER (WHERE COALESCE(broker_qty,0) <> 0
                              AND abs(COALESCE(ledger_qty,0)) <= 0.01) = 0,
           format('%s phantom (broker holds, ledger sold out): %s | %s size disagreements: %s | %s broker-closed with ledger residual',
                  count(*) FILTER (WHERE COALESCE(broker_qty,0) <> 0
                                     AND abs(COALESCE(ledger_qty,0)) <= 0.01),
                  COALESCE(string_agg(symbol || ' (broker ' || round(broker_qty,4) || ')', ', ')
                           FILTER (WHERE COALESCE(broker_qty,0) <> 0
                                     AND abs(COALESCE(ledger_qty,0)) <= 0.01), 'none'),
                  count(*) FILTER (WHERE COALESCE(broker_qty,0) <> 0
                                     AND abs(COALESCE(ledger_qty,0)) > 0.01),
                  COALESCE(string_agg(symbol || ' ' || round(qty_diff,0), ', ')
                           FILTER (WHERE COALESCE(broker_qty,0) <> 0
                                     AND abs(COALESCE(ledger_qty,0)) > 0.01), 'none'),
                  count(*) FILTER (WHERE COALESCE(broker_qty,0) = 0))
      FROM vw_position_reconciliation
     WHERE NOT reconciles;

    -- §3 Matrix coverage. Refuses only for a name with a LIVE feed that is
    -- still missing. A name absent because its own feed is too thin to
    -- correlate does not refuse - KMTUY is permanently in that state, and the
    -- engine already refuses it per position as stale_mark, so it carries
    -- peer_basis 'none' and no tier is being quietly downgraded.
    RETURN QUERY
    SELECT 'matrix_coverage'::text,
           count(*) FILTER (WHERE NOT feed_too_thin) = 0,
           format('%s absent with a live feed: %s | %s absent on a thin feed: %s',
                  count(*) FILTER (WHERE NOT feed_too_thin),
                  COALESCE(string_agg(symbol, ', ') FILTER (WHERE NOT feed_too_thin), 'none'),
                  count(*) FILTER (WHERE feed_too_thin),
                  COALESCE(string_agg(symbol || ' (last bar ' || last_bar || ')', ', ')
                           FILTER (WHERE feed_too_thin), 'none'))
      FROM vw_held_symbols_absent_from_matrix;
END;
$$;

COMMENT ON FUNCTION public.atlas_verdict_preflight() IS
 'Three gates the nightly verdict job must clear before writing anything (step 4 close-out §1.3). Freshness and coherence catch different failures - a snapshot can be correctly dated and wrong in content, which is what happened on 2026-08-24, and only coherence catches that. Each gate is scoped so it CAN pass: a gate that is permanently red is one you learn to ignore. position_verdicts is append-only, so refusing to write is the only safe failure.';

GRANT EXECUTE ON FUNCTION public.atlas_verdict_preflight() TO service_role;

-- ============================================================
-- §2 the engine gate
-- ============================================================

DO $patch$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('public.vw_position_returns'::regclass, true);
  IF position('basis_mismatch' in d) > 0 THEN
    RAISE NOTICE 'vw_position_returns already carries the basis gate - skipping';
    RETURN;
  END IF;

  d := replace(d,
    E'CASE\n                    WHEN NOT c.broker_reconciles THEN ''ledger_mismatch''::text\n                    WHEN NOT c.ledger_complete THEN ''incomplete_ledger''::text',
    E'CASE\n                    WHEN NOT c.broker_reconciles THEN ''ledger_mismatch''::text\n                    WHEN EXISTS (SELECT 1 FROM vw_position_price_basis pb\n                                  WHERE pb.asset_id = c.asset_id AND NOT pb.basis_ok)\n                         THEN ''basis_mismatch''::text\n                    WHEN NOT c.ledger_complete THEN ''incomplete_ledger''::text');
  IF position('basis_mismatch' in d) = 0 THEN
    RAISE EXCEPTION 'engine_status anchor not found in vw_position_returns';
  END IF;

  d := replace(d,
    E'CASE engine_status\n            WHEN ''ledger_mismatch''::text THEN',
    E'CASE engine_status\n            WHEN ''basis_mismatch''::text THEN (SELECT ''ledger prices a different share basis from the tape (ratio ''\n                   || round(pb.min_ratio,3)::text || ''-'' || round(pb.max_ratio,3)::text || '')''\n                  FROM vw_position_price_basis pb WHERE pb.asset_id = g.asset_id)\n            WHEN ''ledger_mismatch''::text THEN');
  IF position('a different share basis' in d) = 0 THEN
    RAISE EXCEPTION 'engine_reason anchor not found in vw_position_returns';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_position_returns AS ' || d;
END $patch$;

-- ============================================================
-- §1.3 / §3 wire the job to the preflight
-- ============================================================

DO $patch$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname='atlas_write_verdicts' AND pronamespace='public'::regnamespace;
  IF position('atlas_verdict_preflight' in src) > 0 THEN
    RAISE NOTICE 'atlas_write_verdicts already calls the preflight - skipping';
    RETURN;
  END IF;

  src := replace(src, E'    v_log_id       bigint;',
                      E'    v_log_id       bigint;\n    v_pre          jsonb;\n    v_failed       text;');

  src := replace(src, E'WHEN ''ledger_mismatch'' THEN ''ledger_mismatch''',
                      E'WHEN ''ledger_mismatch'' THEN ''ledger_mismatch''\n                   WHEN ''basis_mismatch''  THEN ''basis_mismatch''');

  -- one gate definition, called by the job, rather than the job carrying its
  -- own copy of one of the three
  src := replace(src,
    E'    IF v_pos_as_of IS NULL OR v_pos_as_of < v_last_traded THEN\n        UPDATE public.sync_log\n           SET status = ''skipped'', finished_at = now(),\n               details = details || jsonb_build_object(\n                   ''reason'', ''stale positions snapshot'',\n                   ''positions_as_of'', v_pos_as_of, ''last_traded_day'', v_last_traded)\n         WHERE id = v_log_id;\n        RAISE EXCEPTION\n            ''refusing to write verdicts: positions snapshot is % but the last traded day is %'',\n            v_pos_as_of, v_last_traded;\n    END IF;',
    E'    SELECT jsonb_agg(jsonb_build_object(''check'', check_name, ''passed'', passed, ''detail'', detail)),\n           string_agg(check_name || '': '' || detail, ''; '') FILTER (WHERE NOT passed)\n      INTO v_pre, v_failed\n      FROM public.atlas_verdict_preflight();\n\n    IF v_failed IS NOT NULL THEN\n        UPDATE public.sync_log\n           SET status = ''skipped'', finished_at = now(),\n               details = details || jsonb_build_object(''reason'', ''preflight failed'',\n                                                      ''preflight'', v_pre)\n         WHERE id = v_log_id;\n        RAISE EXCEPTION ''refusing to write verdicts - preflight failed: %'', v_failed;\n    END IF;');
  IF position('preflight failed' in src) = 0 THEN
    RAISE EXCEPTION 'preflight anchor not found in atlas_write_verdicts';
  END IF;

  src := replace(src, E'''cluster_risk_share_sum'', v_share_sum,',
                      E'''cluster_risk_share_sum'', v_share_sum,\n               ''preflight'', v_pre,');

  src := replace(src,
    E'        positions_cluster_eligible, positions_no_correlate)',
    E'        positions_cluster_eligible, positions_no_correlate,\n        positions_in_matrix, positions_absent_from_matrix)');
  src := replace(src,
    E'           b.positions_cluster_eligible, b.positions_no_correlate\n      FROM public.vw_book_frozen_baseline b',
    E'           b.positions_cluster_eligible, b.positions_no_correlate,\n           (SELECT count(*) FROM public.position_verdicts pv\n             WHERE pv.as_of = v_as_of AND pv.logic_version = p_logic_version\n               AND pv.best_correlate_rho IS NOT NULL),\n           (SELECT count(*) FROM public.vw_held_symbols_absent_from_matrix)\n      FROM public.vw_book_frozen_baseline b');
  IF position('vw_held_symbols_absent_from_matrix)' in src) = 0 THEN
    RAISE EXCEPTION 'coverage-column anchor not found in atlas_write_verdicts';
  END IF;

  EXECUTE src;
END $patch$;
