-- C5 — force every branch of the reconciliation before trusting it.
--
-- "Has not been observed failing" is not a test. On the live book this check
-- reports `warning` (coverage) and has never been seen fire on price, so its
-- two failure branches would otherwise be unexercised. Both are forced here,
-- plus the property that makes the exclusion table a note rather than a gag.
--
-- Safe: every mutation is inside a DO block that ends on RAISE, so the
-- transaction rolls back and nothing persists. A run that reports no failure
-- has not run. Each block raises with its own result lines; every one should
-- read `pass`.
--
--   psql "$DATABASE_URL" -f supabase/tests/feed_reconciliation_forced_divergence.sql
--
-- Last run 2026-09-10: 5/5.

-- FORCE 1: a real price divergence, and the severity it must carry.
DO $t$
DECLARE r record; v_date date; v_old numeric; out text := '';
BEGIN
  SELECT max(date) INTO v_date FROM market_prices WHERE symbol = 'SPY';
  SELECT close  INTO v_old  FROM market_prices WHERE symbol = 'SPY' AND date = v_date;

  -- 100 bp: far over the 25 bp threshold and nowhere near a plausible venue
  -- or rounding difference, so the test cannot pass by accident.
  UPDATE market_prices SET close = v_old * 1.01 WHERE symbol = 'SPY' AND date = v_date;

  SELECT * INTO r FROM atlas_check_feed_reconciliation(5, 25);

  out := out || format(E'\n  %s  divergence caught (status=%s diverged=%s max_bps=%s)',
    CASE WHEN r.status = 'failed'
          AND (r.details->>'pairs_diverged')::bigint >= 1
          AND (r.details->>'max_bps')::numeric > 25 THEN 'pass' ELSE 'FAIL' END,
    r.status, r.details->>'pairs_diverged', r.details->>'max_bps');

  -- A price divergence is not critical: the run worked, the data disagreed.
  -- Critical is reserved for the check being unable to see its inputs.
  out := out || format(E'\n  %s  severity is warning not critical (got %s)',
    CASE WHEN r.severity = 'warning' THEN 'pass' ELSE 'FAIL' END, r.severity);

  RAISE EXCEPTION 'FORCE 1 — price divergence%', out;
END $t$;

-- FORCE 2: nothing to compare must be `critical`, never a clean pass. A check
-- that cannot see its inputs reporting health is the failure this codebase
-- has hit three times.
DO $t$
DECLARE r record; out text := '';
BEGIN
  UPDATE market_instruments SET active = false;

  SELECT * INTO r FROM atlas_check_feed_reconciliation(5, 25);

  out := out || format(E'\n  %s  empty comparison refused (status=%s severity=%s) — %s',
    CASE WHEN r.status = 'failed' AND r.severity = 'critical' THEN 'pass' ELSE 'FAIL' END,
    r.status, r.severity, r.message);

  RAISE EXCEPTION 'FORCE 2 — nothing to compare%', out;
END $t$;

-- FORCE 3: an exclusion silences its own leg and nothing else. The three
-- stale_snapshot dates are scoped to `equity_curve`; a price divergence on
-- the same date and symbol must still fire, or the table is a gag rather
-- than a note.
DO $t$
DECLARE r record; v_date date; v_old numeric; out text := '';
BEGIN
  SELECT max(date) INTO v_date FROM market_prices WHERE symbol = 'SPY';
  SELECT close  INTO v_old  FROM market_prices WHERE symbol = 'SPY' AND date = v_date;
  UPDATE market_prices SET close = v_old * 1.01 WHERE symbol = 'SPY' AND date = v_date;

  INSERT INTO feed_reconciliation_exclusions (leg, exclusion_date, symbol, reason)
  VALUES ('equity_curve', v_date, 'SPY', 'test: wrong leg, must not silence price');

  SELECT * INTO r FROM atlas_check_feed_reconciliation(5, 25);
  out := out || format(E'\n  %s  equity_curve exclusion did NOT silence the price leg (diverged=%s)',
    CASE WHEN (r.details->>'pairs_diverged')::bigint >= 1 THEN 'pass' ELSE 'FAIL' END,
    r.details->>'pairs_diverged');

  INSERT INTO feed_reconciliation_exclusions (leg, exclusion_date, symbol, reason)
  VALUES ('price', v_date, 'SPY', 'test: correct leg, must silence');

  SELECT * INTO r FROM atlas_check_feed_reconciliation(5, 25);
  out := out || format(E'\n  %s  price exclusion silenced the divergence (diverged=%s)',
    CASE WHEN (r.details->>'pairs_diverged')::bigint = 0 THEN 'pass' ELSE 'FAIL' END,
    r.details->>'pairs_diverged');

  RAISE EXCEPTION 'FORCE 3 — exclusion scoping%', out;
END $t$;

-- FORCE 4 (happy path): the live book must still reconcile cleanly on price.
-- A wall of failure cases that also rejects healthy data is worse than none,
-- so the accepting case is asserted too. Coverage is deliberately NOT
-- asserted here: it is a live feed state, not a property of the check.
DO $t$
DECLARE r record; out text := '';
BEGIN
  SELECT * INTO r FROM atlas_check_feed_reconciliation(5, 25);

  out := out || format(E'\n  %s  no price divergence on the live book (diverged=%s of %s, max %s bp)',
    CASE WHEN (r.details->>'pairs_diverged')::bigint = 0 THEN 'pass' ELSE 'FAIL' END,
    r.details->>'pairs_diverged', r.details->>'pairs_compared', r.details->>'max_bps');

  RAISE EXCEPTION 'FORCE 4 — happy path%', out;
END $t$;
