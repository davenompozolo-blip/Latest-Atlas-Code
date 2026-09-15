-- Proof that var_backtest_runs refuses every state the contract excludes, and
-- accepts the shapes the writer actually produces.
--
-- Safe to run against production. Every insert is attempted inside a sub-block
-- and the whole thing ends on a RAISE, so the transaction rolls back and no row
-- survives. A successful run FAILS with a message beginning 'CONSTRAINT PROOF',
-- and every line under it should read `pass`.
--
--   psql "$DATABASE_URL" -f supabase/tests/var_backtest_invariants.sql
--
-- Twelve refusals and four acceptances. The acceptances are the point, and one
-- of them is the zero-exception row: a wall of CHECKs that also blocks
-- legitimate writes is worse than no CHECKs, and "no session breached the
-- bound" is a legitimate result, not a malformed row.
--
-- Last run 2026-09-15: 16/16.

DO $test$
DECLARE
  d       date        := date '1900-01-01';   -- far outside any real as_of
  d2      date        := date '1900-01-02';
  t0      timestamptz := timestamptz '1900-01-01 00:00+00';
  lv      text        := 'test:var_backtest';
  results text        := '';
  fails   int         := 0;
  n       int;
  r       numeric;
  e       numeric;
BEGIN
  -- ---------- must be REFUSED ----------

  -- 1. A conditional row with no axis. The reading would not say which regime.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':1', 'model', 'regime_conditional', NULL, 0.95, d, d2,
            100, 5, 0.02, 0.025, 0.025, 0.03, 0.012, 0.012, NULL, NULL, 0.0, false, false, t0);
    results := results || E'\n  FAIL  conditional row with no axis was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  conditional row with no axis refused';
  END;

  -- 2. An unconditional row carrying an axis. It is not conditional on anything.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':2', 'model', 'unconditional', 'cyclical', 0.95, d, d2,
            100, 5, 0.02, 0.025, 0.025, 0.03, 0.012, 0.012, NULL, NULL, 0.0, false, false, t0);
    results := results || E'\n  FAIL  unconditional row with an axis was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  unconditional row with an axis refused';
  END;

  -- 3. The model leg carrying a residual decomposition. The model leg IS the
  --    factor part; it has no residual, so a figure there is fabricated.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':3', 'model', 'unconditional', NULL, 0.95, d, d2,
            100, 5, 0.02, 0.025, 0.025, 0.03, 0.012, 0.012, 0.014, 0.007, 0.0, false, false, t0);
    results := results || E'\n  FAIL  model leg with a residual was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  model leg with a residual refused';
  END;

  -- 4. The book leg without one. The missing residual is the finding; a book
  --    row that does not carry it is the reading with its point removed.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':4', 'book', 'unconditional', NULL, 0.95, d, d2,
            100, 5, 0.02, 0.025, 0.025, 0.03, 0.012, 0.016, NULL, NULL, 0.0, false, false, t0);
    results := results || E'\n  FAIL  book leg without a decomposition was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  book leg without a decomposition refused';
  END;

  -- 5. A realised tail loss with no exception to have measured it on.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':5', 'model', 'unconditional', NULL, 0.95, d, d2,
            100, 0, 0.02, 0.025, NULL, 0.03, 0.012, 0.012, NULL, NULL, 0.0, false, false, t0);
    results := results || E'\n  FAIL  realised CVaR with zero exceptions was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  realised CVaR with zero exceptions refused';
  END;

  -- 6. Exceptions with no realised figure beside them.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':6', 'model', 'unconditional', NULL, 0.95, d, d2,
            100, 5, 0.02, 0.025, NULL, NULL, 0.012, 0.012, NULL, NULL, 0.0, false, false, t0);
    results := results || E'\n  FAIL  exceptions with no realised CVaR was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  exceptions with no realised CVaR refused';
  END;

  -- 7. More exceptions than observations.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':7', 'model', 'unconditional', NULL, 0.95, d, d2,
            100, 101, 0.02, 0.025, 0.025, 0.03, 0.012, 0.012, NULL, NULL, 0.0, false, false, t0);
    results := results || E'\n  FAIL  exceptions above n_obs was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  exceptions above n_obs refused';
  END;

  -- 8. A sample too small for the test to mean anything.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':8', 'model', 'unconditional', NULL, 0.95, d, d2,
            12, 1, 0.02, 0.025, 0.025, 0.03, 0.012, 0.012, NULL, NULL, 0.0, false, false, t0);
    results := results || E'\n  FAIL  n_obs below the floor was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  n_obs below the floor refused';
  END;

  -- 9. CVaR at or below VaR. It is the mean BEYOND the quantile, so this is
  --    an arithmetic failure, never a market observation.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':9', 'model', 'unconditional', NULL, 0.95, d, d2,
            100, 5, 0.025, 0.020, 0.020, 0.03, 0.012, 0.012, NULL, NULL, 0.0, false, false, t0);
    results := results || E'\n  FAIL  CVaR below VaR was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  CVaR below VaR refused';
  END;

  -- 10. A rejection flag that disagrees with its own statistic. This is the
  --     bfb_significant_ck construction: a surface cannot be handed a verdict
  --     whose evidence says otherwise.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':10', 'model', 'unconditional', NULL, 0.95, d, d2,
            100, 5, 0.02, 0.025, 0.025, 0.03, 0.012, 0.012, NULL, NULL, 12.43, false, false, t0);
    results := results || E'\n  FAIL  reject flag disagreeing with LR was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  reject flag disagreeing with LR refused';
  END;

  -- 11. An unknown leg. A typo must not become a stored measure.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':11', 'modle', 'unconditional', NULL, 0.95, d, d2,
            100, 5, 0.02, 0.025, 0.025, 0.03, 0.012, 0.012, NULL, NULL, 0.0, false, false, t0);
    results := results || E'\n  FAIL  unknown leg value was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  unknown leg value refused';
  END;

  -- 12. A confidence the quantile table does not carry. Accepting it would
  --     store a bound computed from a NULL z as though it were a measurement.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':12', 'model', 'unconditional', NULL, 0.975, d, d2,
            100, 5, 0.02, 0.025, 0.025, 0.03, 0.012, 0.012, NULL, NULL, 0.0, false, false, t0);
    results := results || E'\n  FAIL  unsupported confidence was ACCEPTED'; fails := fails + 1;
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  pass  unsupported confidence refused';
  END;

  -- ---------- must be ACCEPTED ----------

  -- 13. The model unconditional shape, as the writer produces it.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':13', 'model', 'unconditional', NULL, 0.95, d, d2,
            3370, 169, 0.019775, 0.024799, 0.024799, 0.028446, 0.012022, 0.012018,
            NULL, NULL, 0.0016, false, false, t0);
    results := results || E'\n  pass  model unconditional row accepted';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  FAIL  model unconditional row REFUSED'; fails := fails + 1;
  END;

  -- 14. The book conditional shape, decomposition and all.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':14', 'book', 'regime_conditional', 'dollar', 0.99, d, d2,
            172, 8, 0.027968, 0.032042, 0.032042, 0.040741, 0.012022, 0.016530,
            0.014547, 0.007755, 12.2684, true, true, t0);
    results := results || E'\n  pass  book conditional row accepted';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  FAIL  book conditional row REFUSED'; fails := fails + 1;
  END;

  -- 15. Zero exceptions, both CVaR columns null. A quiet window is a result.
  BEGIN
    INSERT INTO public.var_backtest_runs
      (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf, window_start, window_end,
       n_obs, exceptions, var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
       cvar_realised_daily, sd_pred_daily, sd_realised_daily, sd_factor_window,
       sd_residual_window, kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
    VALUES (d, d, lv||':15', 'model', 'unconditional', NULL, 0.99, d, d2,
            100, 0, 0.027968, 0.032042, NULL, NULL, 0.012022, 0.012018,
            NULL, NULL, 2.0101, false, false, t0);
    results := results || E'\n  pass  zero-exception row accepted';
  EXCEPTION WHEN check_violation THEN
    results := results || E'\n  FAIL  zero-exception row REFUSED'; fails := fails + 1;
  END;

  -- 16. The generated columns derive rather than being asserted. Read back the
  --     row written at case 13: 169/3370 and 0.05*3370.
  SELECT n_obs, exception_rate, expected_exceptions INTO n, r, e
    FROM public.var_backtest_runs WHERE logic_version = lv||':13';
  IF n = 3370
     AND round(r, 8) = round(169::numeric / 3370, 8)
     AND round(e, 6) = 168.5 THEN
    results := results || E'\n  pass  generated columns derive (rate '
               || round(r, 6) || ', expected ' || round(e, 1) || ')';
  ELSE
    results := results || E'\n  FAIL  generated columns wrong (rate '
               || coalesce(round(r, 6)::text, 'null') || ', expected '
               || coalesce(round(e, 1)::text, 'null') || ')';
    fails := fails + 1;
  END IF;

  RAISE EXCEPTION E'CONSTRAINT PROOF (% failing)%', fails, results;
END $test$;
