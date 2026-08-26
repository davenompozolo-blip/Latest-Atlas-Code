-- §1.4 — force both failures before trusting the gate.
--
-- "Has not been observed failing" is not a test. The failure this gate
-- prevents writes permanently wrong history into an append-only table, so it
-- has to be watched refusing before the first real run.
--
-- Safe: every mutation is inside a block that ends on RAISE, so the
-- transaction rolls back and nothing persists. A successful run FAILS with a
-- message; every line under it should read `pass`.
--
--   psql "$DATABASE_URL" -f supabase/tests/verdict_preflight_forced_failures.sql
--
-- Last run 2026-08-26: 3/3.

-- FORCE 1: a genuinely failed sync — no snapshot at or after the last session.
DO $t$
DECLARE r record; out text := '';
BEGIN
  FOR r IN SELECT * FROM atlas_verdict_preflight() LOOP
    out := out || format(E'\n  baseline  %-20s passed=%s', r.check_name, r.passed);
  END LOOP;

  -- -400 days lands before the table starts (2026-03-09), so no PK collision.
  -- Shifting ONLY the newest date is not enough: the next date down is still
  -- the last traded day and the gate correctly passes it.
  UPDATE positions SET as_of_date = as_of_date - 400
   WHERE as_of_date >= atlas_last_traded_day();

  FOR r IN SELECT * FROM atlas_verdict_preflight() WHERE check_name='positions_freshness' LOOP
    out := out || format(E'\n  %s  positions_freshness on a stale snapshot (%s)',
                         CASE WHEN r.passed THEN 'FAIL' ELSE 'pass' END, left(r.detail,50));
  END LOOP;
  RAISE EXCEPTION 'FORCED FAILURE 1%', out;
END $t$;

-- FORCE 2: the 2026-08-24 shape — broker holds what the ledger sold out.
-- Note freshness still PASSES here: that is the whole point of §1, and the
-- reason a date comparison alone would not have caught the failure it was
-- written for.
DO $t$
DECLARE r record; out text := ''; v_pf uuid; v_asset uuid; v_asof date;
BEGIN
  SELECT portfolio_id, max(as_of_date) INTO v_pf, v_asof
    FROM positions GROUP BY portfolio_id ORDER BY 2 DESC LIMIT 1;

  INSERT INTO assets (symbol, name, asset_class)
  VALUES ('ZZZZ_NOT_REAL','preflight test','us_equity') RETURNING id INTO v_asset;

  INSERT INTO positions (portfolio_id, asset_id, as_of_date, quantity)
  VALUES (v_pf, v_asset, v_asof, 100);

  FOR r IN SELECT * FROM atlas_verdict_preflight() LOOP
    out := out || format(E'\n  %s  %-20s passed=%s  %s',
      CASE WHEN (r.check_name = 'ledger_coherence') = (NOT r.passed) THEN 'pass' ELSE 'FAIL' END,
      r.check_name, r.passed, left(r.detail,66));
  END LOOP;
  RAISE EXCEPTION 'FORCED FAILURE 2%', out;
END $t$;
