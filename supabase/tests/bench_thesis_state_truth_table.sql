-- Proof that vw_bench_thesis_state derives integrity the way the Bench does.
--
-- The rule lives in two places — nexusBenchCompute.deriveIntegrity (JS, what
-- the Bench renders) and this view (SQL, what the verdict layer records). Two
-- implementations of one rule drift, and a Performance card disagreeing with
-- the Bench about the same thesis is exactly the "two surfaces, one question,
-- different answers" failure this codebase keeps finding. This pins them.
--
--   psql "$DATABASE_URL" -f supabase/tests/bench_thesis_state_truth_table.sql
--
-- Safe: every insert happens inside a transaction that ends on RAISE, so
-- nothing persists. A successful run FAILS with a message beginning
-- 'BENCH TRUTH TABLE', and every line under it should read `pass`.
--
-- Last run 2026-08-30: 8/8.

DO $test$
DECLARE
  results text := '';
  got     text;
  n       int;
BEGIN
  -- Each case wipes the sentinel symbol, inserts a tally, reads the view.
  -- 1. every claim pending -> untested
  DELETE FROM public.bench_claims WHERE symbol = '__TT';
  INSERT INTO public.bench_claims (symbol, claim_text, status) VALUES
    ('__TT','a','pending'), ('__TT','b','untested');
  SELECT thesis_state INTO got FROM public.vw_bench_thesis_state WHERE symbol='__TT';
  results := results || E'\n  ' || CASE WHEN got = 'untested' THEN 'pass' ELSE 'FAIL' END
          || '  all pending -> untested (got ' || coalesce(got,'NULL') || ')';

  -- 'untested' is a real member of the status vocabulary and must count as
  -- pending, matching claimsTally's `else t.pending++`. If it were dropped
  -- instead, this case would read intact/NULL rather than untested.
  SELECT claims_pending INTO n FROM public.vw_bench_thesis_state WHERE symbol='__TT';
  results := results || E'\n  ' || CASE WHEN n = 2 THEN 'pass' ELSE 'FAIL' END
          || '  a claim with status ''untested'' counts as pending (got ' || n || ' of 2)';

  -- 2. contradicted > half -> broken
  DELETE FROM public.bench_claims WHERE symbol = '__TT';
  INSERT INTO public.bench_claims (symbol, claim_text, status) VALUES
    ('__TT','a','contradicted'), ('__TT','b','contradicted'), ('__TT','c','confirmed');
  SELECT thesis_state INTO got FROM public.vw_bench_thesis_state WHERE symbol='__TT';
  results := results || E'\n  ' || CASE WHEN got = 'broken' THEN 'pass' ELSE 'FAIL' END
          || '  2 of 3 contradicted -> broken (got ' || coalesce(got,'NULL') || ')';

  -- 3. >=1 contradicted with >=1 other, not a majority -> bending
  DELETE FROM public.bench_claims WHERE symbol = '__TT';
  INSERT INTO public.bench_claims (symbol, claim_text, status) VALUES
    ('__TT','a','contradicted'), ('__TT','b','confirmed'), ('__TT','c','pending');
  SELECT thesis_state INTO got FROM public.vw_bench_thesis_state WHERE symbol='__TT';
  results := results || E'\n  ' || CASE WHEN got = 'bending' THEN 'pass' ELSE 'FAIL' END
          || '  1 contra + 1 conf + 1 pending -> bending (got ' || coalesce(got,'NULL') || ')';

  -- 4. confirmed majority with none contradicted -> intact
  DELETE FROM public.bench_claims WHERE symbol = '__TT';
  INSERT INTO public.bench_claims (symbol, claim_text, status) VALUES
    ('__TT','a','confirmed'), ('__TT','b','confirmed'), ('__TT','c','pending');
  SELECT thesis_state INTO got FROM public.vw_bench_thesis_state WHERE symbol='__TT';
  results := results || E'\n  ' || CASE WHEN got = 'intact' THEN 'pass' ELSE 'FAIL' END
          || '  2 of 3 confirmed, none contradicted -> intact (got ' || coalesce(got,'NULL') || ')';

  -- 5. confirmed but NOT a majority, none contradicted -> falls through to
  --    untested. This is the JS's final `return 'untested'` and it is easy to
  --    get wrong by treating any confirmation as intact.
  DELETE FROM public.bench_claims WHERE symbol = '__TT';
  INSERT INTO public.bench_claims (symbol, claim_text, status) VALUES
    ('__TT','a','confirmed'), ('__TT','b','pending');
  SELECT thesis_state INTO got FROM public.vw_bench_thesis_state WHERE symbol='__TT';
  results := results || E'\n  ' || CASE WHEN got = 'untested' THEN 'pass' ELSE 'FAIL' END
          || '  1 of 2 confirmed is NOT a majority -> untested (got ' || coalesce(got,'NULL') || ')';

  -- 6. the state date is when the STATE was set, never when the claim was
  --    written. An unjudged claim has no date, and that NULL is what makes the
  --    gate downstream refuse to publish a confident state.
  --
  --    The date cannot be injected on INSERT: `bench_claims_status_stamp`
  --    stamps now() for any resolved status and NULLs it for pending/untested,
  --    so the column is the DATABASE's answer to "when did this claim resolve",
  --    not the caller's. Backdate with a follow-up UPDATE that leaves `status`
  --    alone — the trigger only re-stamps when the status actually changes.
  --
  --    That trigger is also why the NULL below is an invariant rather than a
  --    convention: status_changed_at IS NULL exactly when a claim is
  --    unresolved, enforced by the table.
  DELETE FROM public.bench_claims WHERE symbol = '__TT';
  INSERT INTO public.bench_claims (symbol, claim_text, status) VALUES
    ('__TT','a','confirmed'), ('__TT','b','confirmed'), ('__TT','c','pending');
  UPDATE public.bench_claims SET status_changed_at = '2026-07-01T00:00:00Z'
   WHERE symbol='__TT' AND claim_text='a';
  UPDATE public.bench_claims SET status_changed_at = '2026-08-05T00:00:00Z'
   WHERE symbol='__TT' AND claim_text='b';
  SELECT thesis_state_as_of::text INTO got FROM public.vw_bench_thesis_state WHERE symbol='__TT';
  results := results || E'\n  ' || CASE WHEN got = '2026-08-05' THEN 'pass' ELSE 'FAIL' END
          || '  as_of is the LATEST state change (got ' || coalesce(got,'NULL') || ')';

  DELETE FROM public.bench_claims WHERE symbol = '__TT';
  INSERT INTO public.bench_claims (symbol, claim_text, status) VALUES ('__TT','a','pending');
  SELECT thesis_state_as_of::text INTO got FROM public.vw_bench_thesis_state WHERE symbol='__TT';
  results := results || E'\n  ' || CASE WHEN got IS NULL THEN 'pass' ELSE 'FAIL' END
          || '  a never-judged claim has NO as_of (got ' || coalesce(got,'NULL') || ')';

  -- 6b. the trigger's invariant, asserted directly rather than assumed: an
  --     unresolved claim can never carry a state date. This is what lets the
  --     gate treat a NULL as_of as "never judged" instead of "date missing".
  SELECT count(*) INTO n FROM public.bench_claims
   WHERE symbol='__TT' AND status IN ('pending','untested') AND status_changed_at IS NOT NULL;
  results := results || E'\n  ' || CASE WHEN n = 0 THEN 'pass' ELSE 'FAIL' END
          || '  unresolved claims carry no state date (got ' || n || ' violations)';

  -- 7. a symbol with no claims does not appear at all — no claims, no read.
  DELETE FROM public.bench_claims WHERE symbol = '__TT';
  SELECT count(*) INTO n FROM public.vw_bench_thesis_state WHERE symbol='__TT';
  results := results || E'\n  ' || CASE WHEN n = 0 THEN 'pass' ELSE 'FAIL' END
          || '  no claims -> no row, not a NULL state (got ' || n || ' rows)';

  RAISE EXCEPTION 'BENCH TRUTH TABLE%', results;
END
$test$;
