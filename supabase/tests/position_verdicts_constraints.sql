-- Proof that the rev. B §6 invariants actually refuse bad rows.
--
-- Run against production or a branch; it is safe. Every insert is attempted
-- inside a sub-block and the whole thing ends on a RAISE, so the transaction
-- rolls back and no row survives. The RAISE is how the report gets out — a
-- successful run FAILS with a message beginning 'CONSTRAINT PROOF', and every
-- line under it should read `pass`.
--
--   psql "$DATABASE_URL" -f supabase/tests/position_verdicts_constraints.sql
--
-- Ten of these assert that a specific wrong row is impossible; the eleventh
-- asserts the constraints have not made a legitimate verdict impossible too,
-- which is the failure mode a wall of CHECKs invites.
--
-- Last run 2026-08-26: 11/11.

DO $test$
DECLARE
  aid uuid;
  results text := '';
BEGIN
  SELECT id INTO aid FROM public.assets WHERE symbol = 'AMD' LIMIT 1;
  IF aid IS NULL THEN SELECT id INTO aid FROM public.assets LIMIT 1; END IF;

  -- 1. An unmeasurable position must never be proposed for sale.
  BEGIN
    INSERT INTO public.position_verdicts
      (as_of, logic_version, asset_id, symbol, position_state, side,
       verdict_status, peer_basis, cluster_threshold_rho, verdict_label,
       evidence_own_return_known)
    VALUES (current_date,'t',aid,'X','open','long','stale_mark','book',0.75,'cut_candidate',false);
    results := results || E'\n  FAIL  cut_candidate on stale_mark was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  cut_candidate on stale_mark refused';
  END;

  -- 2. The annualisation floor (§2.7) — AMD's +545.58% CAGR over 174 days.
  BEGIN
    INSERT INTO public.position_verdicts
      (as_of, logic_version, asset_id, symbol, position_state, side,
       verdict_status, peer_basis, cluster_threshold_rho, days_held, annualised_return)
    VALUES (current_date,'t',aid,'X','open','long','measured','book',0.75,45,5.4558);
    results := results || E'\n  FAIL  CAGR at 45 days was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  CAGR at 45 days refused';
  END;

  -- 3. Cluster tier requires cluster eligibility.
  BEGIN
    INSERT INTO public.position_verdicts
      (as_of, logic_version, asset_id, symbol, position_state, side,
       verdict_status, peer_basis, cluster_threshold_rho, cluster_eligible)
    VALUES (current_date,'t',aid,'X','open','long','measured','cluster',0.75,false);
    results := results || E'\n  FAIL  cluster basis without eligibility was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  cluster basis without eligibility refused';
  END;

  -- 4. n >= 5. A median over two names is not a peer group.
  BEGIN
    INSERT INTO public.position_verdicts
      (as_of, logic_version, asset_id, symbol, position_state, side,
       verdict_status, peer_basis, cluster_threshold_rho, cluster_eligible,
       cluster_size, avg_intra_rho)
    VALUES (current_date,'t',aid,'X','open','long','measured','cluster',0.75,true,2,0.82);
    results := results || E'\n  FAIL  eligible cluster of 2 was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  eligible cluster of 2 refused';
  END;

  -- 5. rho >= 0.75. Loosening to 0.65 buys nine positions and costs the thing
  --    that made the counterfactual defensible (§2.2).
  BEGIN
    INSERT INTO public.position_verdicts
      (as_of, logic_version, asset_id, symbol, position_state, side,
       verdict_status, peer_basis, cluster_threshold_rho, cluster_eligible,
       cluster_size, avg_intra_rho)
    VALUES (current_date,'t',aid,'X','open','long','measured','cluster',0.65,true,9,0.68);
    results := results || E'\n  FAIL  eligibility at rho 0.65 was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  eligibility at rho 0.65 refused';
  END;

  -- 6. §7 — on Tier 2 there is no leader to switch into.
  BEGIN
    INSERT INTO public.position_verdicts
      (as_of, logic_version, asset_id, symbol, position_state, side,
       verdict_status, peer_basis, cluster_threshold_rho, suggested_reason_code)
    VALUES (current_date,'t',aid,'X','open','long','measured','book',0.75,'switch_to_cluster_leader');
    results := results || E'\n  FAIL  switch_to_cluster_leader on book tier was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  switch_to_cluster_leader on book tier refused';
  END;

  -- 7. No reason code without a measurement behind it.
  BEGIN
    INSERT INTO public.position_verdicts
      (as_of, logic_version, asset_id, symbol, position_state, side,
       verdict_status, peer_basis, cluster_threshold_rho, suggested_reason_code,
       evidence_own_return_known)
    VALUES (current_date,'t',aid,'X','open','long','ledger_mismatch','book',0.75,'trim_concentration',false);
    results := results || E'\n  FAIL  reason code on ledger_mismatch was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  reason code on ledger_mismatch refused';
  END;

  -- 8. The evidence flag cannot lie about a gated row.
  BEGIN
    INSERT INTO public.position_verdicts
      (as_of, logic_version, asset_id, symbol, position_state, side,
       verdict_status, peer_basis, cluster_threshold_rho, evidence_own_return_known)
    VALUES (current_date,'t',aid,'X','open','long','stale_mark','book',0.75,true);
    results := results || E'\n  FAIL  evidence_own_return_known=true on stale_mark was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  evidence_own_return_known=true on stale_mark refused';
  END;

  -- 9. Vocabulary retired between memo v2 §3 and rev. B stays retired.
  BEGIN
    INSERT INTO public.position_verdicts
      (as_of, logic_version, asset_id, symbol, position_state, side,
       verdict_status, peer_basis, cluster_threshold_rho, evidence_own_return_known)
    VALUES (current_date,'t',aid,'X','open','long','insufficient_history','book',0.75,false);
    results := results || E'\n  FAIL  retired status insufficient_history was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  retired status insufficient_history refused';
  END;

  BEGIN
    INSERT INTO public.position_verdicts
      (as_of, logic_version, asset_id, symbol, position_state, side,
       verdict_status, peer_basis, cluster_threshold_rho)
    VALUES (current_date,'t',aid,'X','open','long','measured','theme_fallback',0.75);
    results := results || E'\n  FAIL  retired peer_basis theme_fallback was ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  retired peer_basis theme_fallback refused';
  END;

  -- 10. …and a legitimate verdict still goes in. A wall of CHECKs that also
  --     blocks the happy path is a worse outcome than no CHECKs at all.
  BEGIN
    INSERT INTO public.position_verdicts
      (as_of, logic_version, asset_id, symbol, position_state, side,
       verdict_status, peer_basis, cluster_threshold_rho, cluster_eligible,
       cluster_size, avg_intra_rho, days_held, annualised_return,
       suggested_reason_code, verdict_label, evidence_own_return_known)
    VALUES (current_date,'t',aid,'X','open','long','measured','cluster',0.75,true,
            7,0.81,180,0.2214,'switch_to_cluster_leader','cut_candidate',true);
    results := results || E'\n  pass  a well-formed measured cluster verdict is accepted';
  EXCEPTION WHEN others THEN
    results := results || E'\n  FAIL  well-formed row REFUSED: ' || SQLERRM;
  END;

  -- Rolls the whole transaction back. Nothing above persists.
  RAISE EXCEPTION 'CONSTRAINT PROOF%', results;
END
$test$;
