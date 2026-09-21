-- ============================================================
-- The stale-move gate: contract assertions against live data
-- ------------------------------------------------------------
-- RUN THIS THROUGH psql, NOT THROUGH THE SUPABASE MCP. The MCP commits each
-- call, so the ROLLBACK at the end would not protect anything it wrote.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/portfolio_home_stale_move_gate.sql
--
-- These are views over live tables, so the fixture cannot be constructed --
-- what is asserted is the CONTRACT, which must hold on any book on any night.
-- The gate's own arithmetic was proven separately, by rebuilding the patched
-- definition under a throwaway name at thresholds of 2 and 3 days against a
-- book whose every bar was exactly 3 days old: 0 of 64 published at 2, 63 of
-- 64 at 3. That brackets the comparison as `<=` rather than `<`, which no
-- assertion over live data can do while no held name is stale.
--
-- "Has not been observed failing" is not a test, so every check below is
-- written to fail loudly rather than to return rows for a human to read.
-- ============================================================

BEGIN;

DO $t$
DECLARE n int; m int;
BEGIN
  -- 1. The biconditional the column comment claims. A figure exists exactly
  --    when the gate says it may. Written as a biconditional on purpose: the
  --    2026-09-15 book_risk_daily entry records prose asserting one while the
  --    code checked only half.
  SELECT count(*) INTO n FROM public.vw_portfolio_home
   WHERE (daily_change_pct IS NOT NULL) <> move_publishable;
  IF n <> 0 THEN RAISE EXCEPTION 'PH1 FAIL: % rows where daily_change_pct presence disagrees with move_publishable', n; END IF;
  RAISE NOTICE 'PH1 ok: daily_change_pct present iff move_publishable';

  -- 2. The five-day figure takes the SAME gate. One CTE decides, so the two
  --    columns cannot disagree about a name -- the rule nexus_holdings has
  --    enforced since 2026-08-18.
  SELECT count(*) INTO n FROM public.vw_portfolio_home
   WHERE return_5d_pct IS NOT NULL AND NOT move_publishable;
  IF n <> 0 THEN RAISE EXCEPTION 'PH2 FAIL: % rows publish a five-day move the gate refused', n; END IF;
  RAISE NOTICE 'PH2 ok: return_5d_pct never outlives the gate';

  -- 3. No move is published on a bar older than the threshold. This is the
  --    defect itself: KMTUY published +6.3% off a print 179 days old.
  SELECT count(*) INTO n FROM public.vw_portfolio_home
   WHERE daily_change_pct IS NOT NULL AND (price_days_old IS NULL OR price_days_old > 7);
  IF n <> 0 THEN RAISE EXCEPTION 'PH3 FAIL: % rows publish a move on a bar older than 7 days or on no bar at all', n; END IF;
  RAISE NOTICE 'PH3 ok: no move published past 7 days';

  -- 4. The age is derived from the BAR, not from the position snapshot.
  --    `price_date` is COALESCE(as_of_date, ...) and is current_date for every
  --    held row, so a gate anchored there could never fire -- the fourth
  --    instance of "a gate that can never pass" in this codebase, caught
  --    before shipping rather than after.
  SELECT count(*) INTO n FROM public.vw_portfolio_home WHERE last_bar_date IS NOT NULL;
  SELECT count(*) INTO m FROM public.vw_portfolio_home
   WHERE last_bar_date IS NOT NULL AND last_bar_date <> price_date;
  IF n = 0 THEN RAISE EXCEPTION 'PH4 FAIL: no row carries a bar date at all'; END IF;
  IF m = 0 THEN RAISE EXCEPTION 'PH4 FAIL: last_bar_date never differs from price_date -- the gate is reading the position date'; END IF;
  RAISE NOTICE 'PH4 ok: % of % rows have a bar date distinct from the position date', m, n;

  -- 5. `last_bar_date` is the rn=1 bar, i.e. genuinely the newest stored one.
  SELECT count(*) INTO n
    FROM public.vw_portfolio_home ph
    JOIN public.assets a ON a.symbol = ph.symbol
   WHERE ph.last_bar_date IS NOT NULL
     AND ph.last_bar_date <> (SELECT max(h.price_date) FROM public.price_history h
                               WHERE h.asset_id = a.id AND h."interval" = '1d');
  IF n <> 0 THEN RAISE EXCEPTION 'PH5 FAIL: % rows carry a bar date that is not the newest stored bar', n; END IF;
  RAISE NOTICE 'PH5 ok: last_bar_date is max(price_date)';

  -- 6. The same three assertions must hold at the reader, because a gate
  --    applied at one consumer is missed by the next -- and because
  --    mv_nexus_holdings COALESCEs a missing five-day move to 0, which this
  --    view exists to bypass.
  SELECT count(*) INTO n FROM public.vw_nexus_holdings
   WHERE (daily_return_pct IS NOT NULL) <> move_publishable
      OR (five_day_return_pct IS NOT NULL AND NOT move_publishable)
      OR (daily_return_pct IS NOT NULL AND (price_days_old IS NULL OR price_days_old > 7));
  IF n <> 0 THEN RAISE EXCEPTION 'NH1 FAIL: % rows in vw_nexus_holdings break the gate', n; END IF;
  RAISE NOTICE 'NH1 ok: vw_nexus_holdings carries the gate on both columns';

  -- 7. The happy path. A wall of refusals that also rejects healthy data is
  --    worse than none, so assert that the book is actually being published.
  SELECT count(*) INTO n FROM public.vw_nexus_holdings WHERE daily_return_pct IS NOT NULL;
  IF n = 0 THEN RAISE EXCEPTION 'NH2 FAIL: the gate withheld the entire book'; END IF;
  RAISE NOTICE 'NH2 ok: % holdings publish a move', n;
END
$t$;

ROLLBACK;
