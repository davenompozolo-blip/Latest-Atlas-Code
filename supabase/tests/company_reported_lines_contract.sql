-- Proof that the EQ-4 statement writers actually write, and that
-- company_reported_lines refuses what its contract excludes.
--
-- Safe to run against production. Everything happens inside one sub-block per
-- case and the whole thing ends on a RAISE, so the transaction rolls back and
-- no row survives. A successful run FAILS with a message beginning
-- 'CONTRACT PROOF', and every line under it should read `pass`.
--
--   psql "$DATABASE_URL" -f supabase/tests/company_reported_lines_contract.sql
--
-- THE FIRST CASE IS THE WHOLE REASON THIS FILE EXISTS.
-- atlas_upsert_company_statements shipped in EQ-2 and could not write a single
-- row: `insert into T select * from jsonb_populate_recordset(null::T, payload)`
-- fills EVERY column from the payload, so a key the payload omits arrives as an
-- explicit NULL rather than as an absent column, and `loaded_at timestamptz not
-- null default now()` therefore refused the row with 23502 on every call. The
-- default made the column read as optional when under `select *` it is
-- mandatory and unstated. No test covered the RPC writing anything, only its
-- SQL parsing, so the layer sat frozen and the failure was one level below
-- anything that looked at it.
--
-- Eleven cases. The acceptances are as load-bearing as the refusals: a wall of
-- CHECKs that also blocks legitimate writes is worse than no CHECKs.
--
-- Cases 10 and 11 close coverage gaps raised on PR #810: the loaded_at
-- overwrite was asserted only as "not null", and the pair-scoped DELETE was
-- never exercised with a mixed-source batch -- which is the cross-product
-- defect it was written to avoid, so nothing stopped it coming back.
--
-- Last run 2026-09-23: 11/11.

DO $test$
DECLARE
  n     int;
  r     jsonb;
  ok    text := '';
  fy    int  := 1900;                    -- far outside any real fiscal year
  src   text := '__contract_proof';      -- a source no view reads
  sym   text := '__CONTRACT';
BEGIN

  -- 1. THE REGRESSION. loaded_at absent from the payload must NOT refuse the
  --    row. This is the exact shape rowsFor() produces — it has never set
  --    loaded_at — and it is the call that threw 23502 before the repair.
  r := public.atlas_upsert_company_statements(
         p_income   := jsonb_build_array(jsonb_build_object(
           'symbol', sym, 'fiscal_date_ending', '1900-01-31',
           'period', 'annual', 'source', src, 'total_revenue', 1)),
         p_balance  := jsonb_build_array(jsonb_build_object(
           'symbol', sym, 'fiscal_date_ending', '1900-01-31',
           'period', 'annual', 'source', src, 'total_assets', 2)),
         p_cashflow := jsonb_build_array(jsonb_build_object(
           'symbol', sym, 'fiscal_date_ending', '1900-01-31',
           'period', 'annual', 'source', src, 'operating_cashflow', 3)));
  IF (r->>'total')::int <> 3 THEN
    RAISE EXCEPTION 'CASE 1 FAILED: statements RPC wrote % of 3', r->>'total';
  END IF;
  ok := ok || E'\n  1 statements RPC writes with loaded_at absent    pass';

  -- 2. ... and it stamps loaded_at itself rather than leaving it null.
  SELECT count(*) INTO n FROM public.company_income_statement
   WHERE source = src AND loaded_at IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'CASE 2 FAILED: % unstamped rows', n; END IF;
  ok := ok || E'\n  2 loaded_at is stamped by the function           pass';

  -- 3. A re-run REPLACES rather than duplicating or conflicting.
  r := public.atlas_upsert_company_statements(
         p_income := jsonb_build_array(jsonb_build_object(
           'symbol', sym, 'fiscal_date_ending', '1900-01-31',
           'period', 'annual', 'source', src, 'total_revenue', 9)));
  SELECT count(*) INTO n FROM public.company_income_statement WHERE source = src;
  IF n <> 1 THEN RAISE EXCEPTION 'CASE 3 FAILED: % rows after re-run', n; END IF;
  ok := ok || E'\n  3 a re-run replaces, it does not duplicate       pass';

  -- 4. The reported-lines writer, same regression, same shape.
  r := public.atlas_upsert_reported_lines(jsonb_build_array(
         jsonb_build_object('source', src, 'symbol', sym, 'fiscal_year', fy,
           'concept', 'us-gaap:Assets', 'label', 'Total assets',
           'section', 'bs', 'value', 1),
         jsonb_build_object('source', src, 'symbol', sym, 'fiscal_year', fy,
           'concept', 'ifrs-full:Assets', 'label', 'Total assets',
           'section', 'bs', 'taxonomy', 'ifrs-full', 'value', 2)));
  IF (r->>'rows')::int <> 2 THEN
    RAISE EXCEPTION 'CASE 4 FAILED: lines RPC wrote %', r->>'rows';
  END IF;
  ok := ok || E'\n  4 lines RPC writes with loaded_at absent         pass';

  -- 5. A FOREIGN taxonomy is a SEPARATE row, not the same concept respelled.
  --    EQ-3e: collapsing the namespace reports mapping coverage that does not
  --    exist, and here it would silently overwrite one filing line with another.
  SELECT count(*) INTO n FROM public.company_reported_lines
   WHERE source = src AND concept LIKE '%:Assets';
  IF n <> 2 THEN RAISE EXCEPTION 'CASE 5 FAILED: % Assets rows, expected 2', n; END IF;
  ok := ok || E'\n  5 ifrs-full:Assets <> us-gaap:Assets             pass';

  -- 6. A SHORTER re-run drops the concept the filer stopped reporting. An
  --    ON CONFLICT upsert would leave it standing as though it were still in
  --    the filing, which is a line item invented by the loader.
  r := public.atlas_upsert_reported_lines(jsonb_build_array(
         jsonb_build_object('source', src, 'symbol', sym, 'fiscal_year', fy,
           'concept', 'us-gaap:Assets', 'value', 7)));
  SELECT count(*) INTO n FROM public.company_reported_lines WHERE source = src;
  IF n <> 1 THEN RAISE EXCEPTION 'CASE 6 FAILED: % rows after short re-run', n; END IF;
  ok := ok || E'\n  6 a shorter re-run drops the retired concept     pass';

  -- 7. An EMPTY payload is a no-op that says so, never a successful write.
  r := public.atlas_upsert_reported_lines('[]'::jsonb);
  IF (r->>'rows')::int <> 0 OR r->>'reason' IS NULL THEN
    RAISE EXCEPTION 'CASE 7 FAILED: empty payload answered %', r::text;
  END IF;
  ok := ok || E'\n  7 an empty payload reports itself as a no-op     pass';

  -- 8. NaN and BOTH infinities are refused. A one-sided bound (`value > -X`)
  --    admits NaN and +Infinity, because PostgreSQL sorts both ABOVE every
  --    finite value; the UPPER bound is what refuses them. Measured, not
  --    recalled — Postgres departs from IEEE 754 for numeric AND float8.
  FOR n IN 1..3 LOOP
    BEGIN
      INSERT INTO public.company_reported_lines(source, symbol, fiscal_year, concept, value)
      VALUES (src, sym, fy, 'nonfinite' || n,
              (ARRAY['NaN', 'Infinity', '-Infinity'])[n]::numeric);
      RAISE EXCEPTION 'CASE 8 FAILED: accepted %',
            (ARRAY['NaN', 'Infinity', '-Infinity'])[n];
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  ok := ok || E'\n  8 NaN, +Infinity and -Infinity are all refused   pass';

  -- 9. A NULL value is ACCEPTED. An unreported line is absent, not zero and
  --    not invalid, and a guard that refuses it would force the loader to
  --    invent a number. This is the acceptance the NaN range must not break.
  INSERT INTO public.company_reported_lines(source, symbol, fiscal_year, concept, value)
  VALUES (src, sym, fy, 'us-gaap:ResearchAndDevelopmentExpense', NULL);
  ok := ok || E'\n  9 a NULL value is accepted, never coerced        pass';

  -- 10. A caller-supplied loaded_at is OVERWRITTEN, not honoured. The column
  --     records when the DATABASE received the row; letting a payload set it
  --     lets a loader backdate a row past its own freshness window and be
  --     skipped forever. Raised as a coverage gap on PR #810.
  r := public.atlas_upsert_reported_lines(jsonb_build_array(
         jsonb_build_object('source', src, 'symbol', sym, 'fiscal_year', fy,
           'concept', 'us-gaap:Goodwill', 'value', 1,
           'loaded_at', '1999-01-01T00:00:00Z')));
  SELECT count(*) INTO n FROM public.company_reported_lines
   WHERE source = src AND concept = 'us-gaap:Goodwill'
     AND loaded_at < now() - interval '1 day';
  IF n <> 0 THEN
    RAISE EXCEPTION 'CASE 10 FAILED: a caller-supplied loaded_at was honoured';
  END IF;
  ok := ok || E'\n 10 a caller-supplied loaded_at is overwritten     pass';

  -- 11. A MIXED-SOURCE batch must not disturb pairs it is not rewriting.
  --     The DELETE is scoped to the (symbol, source) PAIRS in the payload.
  --     Two arrays compared with `= any` is a CROSS PRODUCT, so a batch
  --     carrying (A, s1) and (B, s2) would also delete (A, s2) and (B, s1) --
  --     rows it never replaces. This case fails against that form; it passes
  --     against the pair-scoped one. Raised as a coverage gap on PR #810.
  DELETE FROM public.company_reported_lines WHERE source IN (src, src || '2');
  INSERT INTO public.company_reported_lines(source, symbol, fiscal_year, concept, value)
  VALUES (src,          'AA', fy, 'c', 1),      -- to be rewritten
         (src || '2',   'BB', fy, 'c', 2),      -- to be rewritten
         (src || '2',   'AA', fy, 'c', 3),      -- MUST SURVIVE
         (src,          'BB', fy, 'c', 4);      -- MUST SURVIVE

  r := public.atlas_upsert_reported_lines(jsonb_build_array(
         jsonb_build_object('source', src,        'symbol', 'AA', 'fiscal_year', fy, 'concept', 'c', 'value', 10),
         jsonb_build_object('source', src || '2', 'symbol', 'BB', 'fiscal_year', fy, 'concept', 'c', 'value', 20)));

  SELECT count(*) INTO n FROM public.company_reported_lines
   WHERE (source = src || '2' AND symbol = 'AA' AND value = 3)
      OR (source = src        AND symbol = 'BB' AND value = 4);
  IF n <> 2 THEN
    RAISE EXCEPTION 'CASE 11 FAILED: the cross product deleted % of 2 untouched pairs', 2 - n;
  END IF;
  SELECT count(*) INTO n FROM public.company_reported_lines
   WHERE source IN (src, src || '2');
  IF n <> 4 THEN RAISE EXCEPTION 'CASE 11 FAILED: % rows, expected 4', n; END IF;
  ok := ok || E'\n 11 a mixed-source batch leaves other pairs alone  pass';

  RAISE EXCEPTION 'CONTRACT PROOF -- 11/11, rolling back.%', ok;
END
$test$;
