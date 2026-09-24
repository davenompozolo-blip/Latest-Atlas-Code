-- Proof for EQ-7's peer cohort layer.
--
-- Safe to run against production. Ends on a RAISE, so the transaction rolls
-- back. A successful run FAILS with a message beginning 'PEER COHORT PROOF'.
--
--   psql "$DATABASE_URL" -f supabase/tests/company_peer_cohort_proof.sql
--
-- CASE 6 IS THE ONE THAT EARNS ITS PLACE. `peer_percentile` was first written
-- as a RANGE frame (`range between unbounded preceding and 1 preceding`),
-- which is a VALUE offset: it counted peers whose value is at most `v - 1`,
-- subtracting one unit of whatever the metric is measured in. Postgres
-- accepts it, every structural invariant still passed, and the numbers stayed
-- inside [0, 1] -- it was found only by computing the same quantity a second
-- way and measuring a 0.905 disagreement on a figure bounded by 1.
--
-- Last run 2026-09-23: 8/8.

DO $v$
DECLARE r record; ok text := ''; n int; d numeric;
BEGIN
  -- ── the leave-one-out median, on arrays with hand-checked answers ───────
  -- Odd result from an even array, removing the middle.
  IF public.atlas_loo_median(ARRAY[1,2,3,4,5]::numeric[], 3) <> 3 THEN
    RAISE EXCEPTION 'CASE 1: [1,2,3,4,5] less k=3 gave %',
      public.atlas_loo_median(ARRAY[1,2,3,4,5]::numeric[], 3); END IF;
  -- Removing the first and the last must map the reduced index differently.
  IF public.atlas_loo_median(ARRAY[1,2,3,4]::numeric[], 1) <> 3 THEN
    RAISE EXCEPTION 'CASE 1: [1,2,3,4] less k=1 gave %',
      public.atlas_loo_median(ARRAY[1,2,3,4]::numeric[], 1); END IF;
  IF public.atlas_loo_median(ARRAY[1,2,3,4]::numeric[], 4) <> 2 THEN
    RAISE EXCEPTION 'CASE 1: [1,2,3,4] less k=4 gave %',
      public.atlas_loo_median(ARRAY[1,2,3,4]::numeric[], 4); END IF;
  ok := ok || E'\n  1 leave-one-out median, both parities and both ends  pass';

  -- An even reduced array averages the two middles.
  IF public.atlas_loo_median(ARRAY[10,20,30,40,50,60]::numeric[], 1) <> 40 THEN
    RAISE EXCEPTION 'CASE 2: expected 40, got %',
      public.atlas_loo_median(ARRAY[10,20,30,40,50,60]::numeric[], 1); END IF;
  ok := ok || E'\n  2 an even reduced array averages its two middles      pass';

  -- A COHORT OF ONE HAS NO PEER. Not 0, not the value itself.
  IF public.atlas_loo_median(ARRAY[42]::numeric[], 1) IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 3: a cohort of one produced %',
      public.atlas_loo_median(ARRAY[42]::numeric[], 1); END IF;
  ok := ok || E'\n  3 a cohort of one yields NULL, not a self-median       pass';

  -- TIES ARE REMOVED BY IDENTITY, NOT BY VALUE. Removing position 2 of
  -- [5,5,5,9] must leave [5,5,9] -> 5, which is only distinguishable from a
  -- value-based removal if the caller's k is honoured verbatim.
  IF public.atlas_loo_median(ARRAY[5,5,5,9]::numeric[], 2) <> 5 THEN
    RAISE EXCEPTION 'CASE 4: tie removal gave %',
      public.atlas_loo_median(ARRAY[5,5,5,9]::numeric[], 2); END IF;
  ok := ok || E'\n  4 a tie is removed by position, not by value           pass';

  -- ── the live view ──────────────────────────────────────────────────────
  SELECT count(*) INTO n FROM public.vw_company_peer_cohort
   WHERE peer_percentile < 0 OR peer_percentile > 1;
  IF n <> 0 THEN RAISE EXCEPTION 'CASE 5: % percentiles outside [0,1]', n; END IF;
  SELECT count(*) INTO n FROM public.vw_company_peer_cohort
   WHERE (peer_median IS NULL) <> (peer_count = 0);
  IF n <> 0 THEN RAISE EXCEPTION 'CASE 5: % rows where median and peer_count disagree', n; END IF;
  SELECT count(*) INTO n FROM public.vw_company_peer_cohort
   WHERE value <= '-Infinity'::numeric OR value >= 'Infinity'::numeric;
  IF n <> 0 THEN RAISE EXCEPTION 'CASE 5: % non-finite values admitted', n; END IF;
  ok := ok || E'\n  5 live invariants: range, median/count, finiteness     pass';

  -- THE RANGE-OFFSET REGRESSION. Recompute the percentile a second way --
  -- a plain count of peers strictly below over peer_count -- and require
  -- agreement to the stored precision. The original RANGE frame disagreed by
  -- up to 0.905 here.
  WITH x AS MATERIALIZED (
      SELECT symbol, cohort_key, metric, value, peer_percentile
        FROM public.vw_company_peer_cohort
       WHERE cohort_key IN ('Machinery', 'Semiconductors')
  )
  SELECT coalesce(max(abs(a.peer_percentile - (
             (SELECT count(*) FROM x b
               WHERE b.cohort_key = a.cohort_key AND b.metric = a.metric
                 AND b.symbol <> a.symbol AND b.value < a.value)::numeric
           / nullif((SELECT count(*) FROM x b
               WHERE b.cohort_key = a.cohort_key AND b.metric = a.metric
                 AND b.symbol <> a.symbol), 0)))), 0)
    INTO d FROM x a;
  IF d > 0.000001 THEN
    RAISE EXCEPTION 'CASE 6: PERCENTILE IS NOT RANK-BASED -- max disagreement %', d; END IF;
  ok := ok || E'\n  6 THE PERCENTILE COUNTS PEERS, NOT METRIC UNITS        pass';

  -- The cohort must never be presented as a GICS level. There is no
  -- independent industry classification in this platform.
  SELECT count(DISTINCT cohort_basis) INTO n FROM public.vw_company_peer_cohort;
  IF n <> 1 THEN RAISE EXCEPTION 'CASE 7: % distinct cohort_basis values', n; END IF;
  SELECT count(*) INTO n FROM public.vw_company_peer_cohort
   WHERE cohort_basis <> 'finnhub_taxonomy';
  IF n <> 0 THEN RAISE EXCEPTION 'CASE 7: % rows carry another basis', n; END IF;
  ok := ok || E'\n  7 every row names the taxonomy it was bucketed by      pass';

  -- ORIENTATION IS NULL WHERE IT IS A MANDATE, NOT GUESSED. A percentile
  -- rendered without a direction asserts the opposite half the time; beta and
  -- volatility have no better/worse direction absent a mandate.
  SELECT count(*) INTO n FROM public.vw_company_peer_cohort
   WHERE metric IN ('beta', 'vol_3m') AND higher_is_better IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'CASE 8: % risk rows claim a direction', n; END IF;
  SELECT count(*) INTO n FROM public.vw_company_peer_cohort
   WHERE metric IN ('forward_pe', 'ev_ebitda') AND higher_is_better IS DISTINCT FROM false;
  IF n <> 0 THEN RAISE EXCEPTION 'CASE 8: % multiple rows are not cheaper-is-better', n; END IF;
  ok := ok || E'\n  8 orientation is carried, and NULL where it is a choice pass';

  RAISE EXCEPTION 'PEER COHORT PROOF -- 8/8, rolling back.%', ok;
END $v$;
