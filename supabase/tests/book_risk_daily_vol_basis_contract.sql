-- Proof that brd_vol_basis_ck refuses every state the contract excludes, and
-- accepts the three it allows.
--
-- Safe to run against production. Every insert is attempted inside a sub-block
-- and the whole thing ends on a RAISE, so the transaction rolls back and no row
-- survives. A successful run FAILS with a message beginning 'CONSTRAINT PROOF',
-- and every line under it should read `pass`.
--
--   psql "$DATABASE_URL" -f supabase/tests/book_risk_daily_vol_basis_contract.sql
--
-- Six refusals and three acceptances. The acceptances are the point: the first
-- version of this constraint forbade a figure without a basis and nothing else,
-- and a wall of CHECKs that also blocks legitimate writes is worse than none.
--
-- Last run 2026-09-15: 9/9.

DO $test$
DECLARE
  d       date := date '1900-01-01';   -- far outside any real as_of
  lv      text := 'test:vol_basis_contract';
  results text := '';
  fails   int  := 0;
BEGIN
  -- ---------- must be REFUSED ----------

  -- 1. A basis with no figure. Permitted by the original constraint.
  BEGIN
    INSERT INTO public.book_risk_daily (as_of, logic_version, total_vol_annual, vol_basis, vol_matrix_as_of)
    VALUES (d, lv, NULL, 'mctr_covariance', d);
    results := results || E'\n  FAIL  basis with no figure was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  basis with no figure refused';
  END;

  -- 2. mctr_covariance with no matrix date — the provenance column defeated.
  BEGIN
    INSERT INTO public.book_risk_daily (as_of, logic_version, total_vol_annual, vol_basis, vol_matrix_as_of)
    VALUES (d, lv, 0.1952, 'mctr_covariance', NULL);
    results := results || E'\n  FAIL  mctr_covariance without matrix date was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  mctr_covariance without matrix date refused';
  END;

  -- 3. The legacy basis carrying a matrix date it never used.
  BEGIN
    INSERT INTO public.book_risk_daily (as_of, logic_version, total_vol_annual, vol_basis, vol_matrix_as_of)
    VALUES (d, lv, 0.1078, 'weight_sq_undiversified', d);
    results := results || E'\n  FAIL  weight_sq_undiversified with matrix date was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  weight_sq_undiversified with matrix date refused';
  END;

  -- 4. A figure with no basis — the one case the original DID catch.
  BEGIN
    INSERT INTO public.book_risk_daily (as_of, logic_version, total_vol_annual, vol_basis, vol_matrix_as_of)
    VALUES (d, lv, 0.1952, NULL, NULL);
    results := results || E'\n  FAIL  figure with no basis was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  figure with no basis refused';
  END;

  -- 5. An unknown basis string. A typo must not become a stored measure.
  BEGIN
    INSERT INTO public.book_risk_daily (as_of, logic_version, total_vol_annual, vol_basis, vol_matrix_as_of)
    VALUES (d, lv, 0.1952, 'mctr_covariancee', d);
    results := results || E'\n  FAIL  unknown basis value was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  unknown basis value refused';
  END;

  -- 6. A matrix date with neither figure nor basis.
  BEGIN
    INSERT INTO public.book_risk_daily (as_of, logic_version, total_vol_annual, vol_basis, vol_matrix_as_of)
    VALUES (d, lv, NULL, NULL, d);
    results := results || E'\n  FAIL  orphan matrix date was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  orphan matrix date refused';
  END;

  -- ---------- must be ACCEPTED ----------

  -- 7. The legacy state, as the 13 backfilled rows carry it.
  BEGIN
    INSERT INTO public.book_risk_daily (as_of, logic_version, total_vol_annual, vol_basis, vol_matrix_as_of)
    VALUES (d, lv || ':a', 0.1078, 'weight_sq_undiversified', NULL);
    results := results || E'\n  pass  legacy row accepted';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  FAIL  legacy row REFUSED'; fails := fails + 1;
  END;

  -- 8. The live state the nightly job writes.
  BEGIN
    INSERT INTO public.book_risk_daily (as_of, logic_version, total_vol_annual, vol_basis, vol_matrix_as_of)
    VALUES (d, lv || ':b', 0.1952, 'mctr_covariance', d);
    results := results || E'\n  pass  mctr_covariance row accepted';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  FAIL  mctr_covariance row REFUSED'; fails := fails + 1;
  END;

  -- 9. The all-null state. A night vw_book_mctr yields nothing must still be
  --    recordable -- refusing it would make the job fail rather than report.
  BEGIN
    INSERT INTO public.book_risk_daily (as_of, logic_version, total_vol_annual, vol_basis, vol_matrix_as_of)
    VALUES (d, lv || ':c', NULL, NULL, NULL);
    results := results || E'\n  pass  all-null row accepted';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  FAIL  all-null row REFUSED'; fails := fails + 1;
  END;

  RAISE EXCEPTION E'CONSTRAINT PROOF (% failing)%', fails, results;
END $test$;
