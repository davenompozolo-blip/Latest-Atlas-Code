-- §4 — synthesise the switch_to_cluster_leader case.
--
-- With ~17 cluster-eligible positions this path may not fire naturally for
-- months, and when it does it fires at the moment someone is about to place a
-- trade. Dormant-then-live-under-pressure is the worst shape for untested
-- code, so the case is manufactured and discarded.
--
-- Rolls back on RAISE. Last run 2026-08-26: 3/3.
--
-- Note the memo's literal insert cannot work against this schema, and that is
-- the constraints doing their job: asset_id is uuid not -1,
-- cluster_threshold_rho is NOT NULL, and cluster_eligible = true requires
-- avg_intra_rho >= 0.75. Supplied properly, the row is accepted.

DO $t$
DECLARE aid uuid; out text := ''; got record;
BEGIN
  SELECT id INTO aid FROM assets WHERE symbol='AMD' LIMIT 1;

  BEGIN
    INSERT INTO position_verdicts (
      as_of, logic_version, asset_id, symbol, position_state, side,
      verdict_status, peer_basis, cluster_threshold_rho, cluster_eligible,
      cluster_size, avg_intra_rho, cf_best_symbol, cf_best_return_pct,
      position_mwr_pct, days_held, verdict_label, suggested_reason_code,
      evidence_own_return_known)
    VALUES (current_date, 'synthetic-test', aid, 'ZZZZ_TEST', 'open', 'long',
      'measured', 'cluster', 0.75, true, 7, 0.81, 'AVGO', 0.486,
      -0.124, 180, 'cut_candidate', 'switch_to_cluster_leader', true);
    out := out || E'\n  pass  well-formed switch_to_cluster_leader row accepted';
  EXCEPTION WHEN others THEN
    out := out || E'\n  FAIL  well-formed row refused: ' || SQLERRM;
  END;

  -- the ticket needs symbol + reason code + evidence payload
  SELECT symbol, suggested_reason_code, cf_best_symbol, cf_best_return_pct,
         position_mwr_pct, verdict_id INTO got
    FROM position_verdicts
   WHERE logic_version='synthetic-test' AND symbol='ZZZZ_TEST';
  IF got.cf_best_symbol IS NOT NULL AND got.suggested_reason_code IS NOT NULL THEN
    out := out || format(E'\n  pass  ticket payload complete: %s -> switch to %s (peer %s%%, own %s%%), verdict_id %s',
                got.symbol, got.cf_best_symbol,
                round(got.cf_best_return_pct*100,1), round(got.position_mwr_pct*100,1), got.verdict_id);
  ELSE
    out := out || E'\n  FAIL  ticket payload incomplete';
  END IF;

  -- rev. B §6/§7: on Tier 2 there is no leader to switch into.
  BEGIN
    INSERT INTO position_verdicts (
      as_of, logic_version, asset_id, symbol, position_state, side,
      verdict_status, peer_basis, cluster_threshold_rho, verdict_label,
      suggested_reason_code, evidence_own_return_known)
    VALUES (current_date, 'synthetic-test', aid, 'ZZZZ_TEST2', 'open', 'long',
      'measured', 'book', 0.75, 'cut_candidate', 'switch_to_cluster_leader', true);
    out := out || E'\n  FAIL  switch_to_cluster_leader on peer_basis=book was accepted';
  EXCEPTION WHEN check_violation THEN
    out := out || E'\n  pass  switch_to_cluster_leader on peer_basis=book refused';
  END;

  RAISE EXCEPTION 'SWITCH_TO_CLUSTER_LEADER PROOF%', out;
END $t$;
