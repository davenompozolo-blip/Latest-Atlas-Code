-- ============================================================
-- segment_verdicts — constraint and invariant proof
-- ------------------------------------------------------------
-- Run whole; it ends on a RAISE so the transaction rolls back and the report
-- arrives as the error message. Nothing is left behind.
--
-- Three things are proved, in increasing order of what they would cost to
-- get wrong:
--
--   A. Every single-row invariant is a CHECK the job cannot forget. Eleven
--      violating inserts are refused AND one well-formed row is accepted --
--      a wall of CHECKs that also blocks legitimate writes is worse than no
--      CHECKs, so the happy path is part of the test, not an afterthought.
--
--   B. risk_share and weight_share close to 1.0 under BOTH groupings. This
--      is the §2.4b position-level basis stated as a test: it is the only
--      reason the BY BET | BY THEME toggle can exist at all, because a
--      cluster-level share does not survive regrouping.
--
--   C. A SINGLETON segment reproduces mv_position_tier2's independently
--      computed excess. A one-member segment's ex-segment index IS its
--      ex-asset index, so the generalised exclusion identity has to agree
--      with the per-position engine that shipped months earlier. This is the
--      test that would catch a sign error or an off-by-one in the pooling.
-- ============================================================

DO $$
DECLARE
    rpt      text := E'\n';
    n_pass   int := 0;
    n_fail   int := 0;
    r        record;
    v_sqlerr text;

    -- A well-formed row. Every negative case below is this row with exactly
    -- one field spoiled, so a refusal can only be attributed to that field.
    PROC_OK  text := $ins$
        INSERT INTO public.segment_verdicts
            (as_of, logic_version, grouping, segment_id, segment_kind, segment_label,
             member_count, members, members_measured, members_withheld, withheld_symbols,
             weight_share, risk_share, excess_vs_book_pct, cf_status, cf_reason,
             dispersion, dispersion_basis, thesis_coverage)
        VALUES (CURRENT_DATE, 'test:invariants', %s)
    $ins$;

    -- name, then the same row with exactly one field spoiled
    cases text[][] := ARRAY[
        ['member_count of zero',
         $a$'bet','cluster:1','cluster','C1',0,ARRAY['A'],0,0,'{}'::text[],0.1,0.1,NULL,'no_rate','x',NULL,NULL,NULL$a$],
        ['members array shorter than member_count',
         $a$'bet','cluster:1','cluster','C1',2,ARRAY['A'],2,0,'{}'::text[],0.1,0.1,NULL,'no_rate','x',NULL,NULL,NULL$a$],
        ['roster does not close (measured+withheld <> count)',
         $a$'bet','cluster:1','cluster','C1',2,ARRAY['A','B'],2,1,ARRAY['B'],0.1,0.1,NULL,'no_rate','x',NULL,NULL,NULL$a$],
        ['withheld count without the symbols named',
         $a$'bet','cluster:1','cluster','C1',2,ARRAY['A','B'],1,1,'{}'::text[],0.1,0.1,NULL,'no_rate','x',NULL,NULL,NULL$a$],
        ['an excess published against a gated counterfactual',
         $a$'bet','cluster:1','cluster','C1',2,ARRAY['A','B'],2,0,'{}'::text[],0.1,0.1,0.05,'no_rate','x',NULL,NULL,NULL$a$],
        ['a measured status carrying a failure reason',
         $a$'bet','cluster:1','cluster','C1',2,ARRAY['A','B'],2,0,'{}'::text[],0.1,0.1,0.05,'measured','x',NULL,NULL,NULL$a$],
        ['a gated status with no reason at all',
         $a$'bet','cluster:1','cluster','C1',2,ARRAY['A','B'],2,0,'{}'::text[],0.1,0.1,NULL,'no_rate',NULL,NULL,NULL,NULL$a$],
        ['dispersion over a single member',
         $a$'bet','cluster:1','cluster','C1',1,ARRAY['A'],1,0,'{}'::text[],0.1,0.1,NULL,'no_rate','x',0.2,'tier2:excess_vs_book',NULL$a$],
        ['dispersion with no basis named beside it',
         $a$'bet','cluster:1','cluster','C1',2,ARRAY['A','B'],2,0,'{}'::text[],0.1,0.1,NULL,'no_rate','x',0.2,NULL,NULL$a$],
        ['an unknown grouping',
         $a$'sector','cluster:1','cluster','C1',2,ARRAY['A','B'],2,0,'{}'::text[],0.1,0.1,NULL,'no_rate','x',NULL,NULL,NULL$a$],
        ['an unknown segment kind',
         $a$'bet','cluster:1','neighbourhood','C1',2,ARRAY['A','B'],2,0,'{}'::text[],0.1,0.1,NULL,'no_rate','x',NULL,NULL,NULL$a$],
        ['a weight share above 1.0',
         $a$'bet','cluster:1','cluster','C1',2,ARRAY['A','B'],2,0,'{}'::text[],1.4,0.1,NULL,'no_rate','x',NULL,NULL,NULL$a$],
        ['a thesis coverage above 1.0',
         $a$'bet','cluster:1','cluster','C1',2,ARRAY['A','B'],2,0,'{}'::text[],0.1,0.1,NULL,'no_rate','x',NULL,NULL,1.5$a$]
    ];
    i int;
BEGIN
    -- ── A. every violating row is refused ─────────────────────
    rpt := rpt || E'A. single-row invariants are CHECKs\n';
    FOR i IN 1 .. array_length(cases, 1) LOOP
        BEGIN
            EXECUTE format(PROC_OK, cases[i][2]);
            n_fail := n_fail + 1;
            rpt := rpt || format('  FAIL  accepted: %s', cases[i][1]) || E'\n';
        EXCEPTION WHEN check_violation THEN
            n_pass := n_pass + 1;
            rpt := rpt || format('  ok    refused:  %s', cases[i][1]) || E'\n';
        END;
    END LOOP;

    -- ── the happy path must still be accepted ─────────────────
    BEGIN
        EXECUTE format(PROC_OK,
            $a$'bet','cluster:199','cluster','Cluster 199',2,ARRAY['AMD','MU'],2,0,'{}'::text[],0.19,0.43,0.4724,'measured',NULL,0.11,'tier2:excess_vs_book',0.5$a$);
        n_pass := n_pass + 1;
        rpt := rpt || E'  ok    accepted: a well-formed row\n';
    EXCEPTION WHEN others THEN
        n_fail := n_fail + 1;
        GET STACKED DIAGNOSTICS v_sqlerr = MESSAGE_TEXT;
        rpt := rpt || format('  FAIL  refused a legitimate row: %s', v_sqlerr) || E'\n';
    END;

    DELETE FROM public.segment_verdicts WHERE logic_version = 'test:invariants';

    -- ── B. both shares close under both groupings ─────────────
    rpt := rpt || E'\nB. shares close to 1.0 under both groupings (spec 2.4b)\n';
    PERFORM public.atlas_write_segment_verdicts(CURRENT_DATE, 'test:invariants');

    FOR r IN
        SELECT grouping, count(*) AS segs, sum(member_count) AS members,
               round(sum(risk_share), 10)   AS risk,
               round(sum(weight_share), 10) AS wt
          FROM public.segment_verdicts
         WHERE logic_version = 'test:invariants'
         GROUP BY grouping ORDER BY grouping
    LOOP
        IF abs(r.risk - 1.0) <= 1e-9 AND abs(r.wt - 1.0) <= 1e-9 THEN
            n_pass := n_pass + 1;
            rpt := rpt || format('  ok    %-6s segs=%-3s members=%-3s risk=%s weight=%s',
                                 r.grouping, r.segs, r.members, r.risk, r.wt) || E'\n';
        ELSE
            n_fail := n_fail + 1;
            rpt := rpt || format('  FAIL  %-6s risk=%s weight=%s', r.grouping, r.risk, r.wt) || E'\n';
        END IF;
    END LOOP;

    -- Every member of the book must appear exactly once per grouping. A
    -- segmentation that drops a position renormalises the shares back to 1.0
    -- and looks perfectly healthy -- the closure test above cannot see it.
    FOR r IN
        SELECT sv.grouping, sum(sv.member_count) AS in_segments,
               (SELECT count(*) FROM public.mv_position_returns
                 WHERE position_state = 'open') AS open_positions
          FROM public.segment_verdicts sv
         WHERE sv.logic_version = 'test:invariants'
         GROUP BY sv.grouping
    LOOP
        IF r.in_segments = r.open_positions THEN
            n_pass := n_pass + 1;
            rpt := rpt || format('  ok    %-6s every open position segmented (%s)',
                                 r.grouping, r.open_positions) || E'\n';
        ELSE
            n_fail := n_fail + 1;
            rpt := rpt || format('  FAIL  %-6s %s segmented vs %s open',
                                 r.grouping, r.in_segments, r.open_positions) || E'\n';
        END IF;
    END LOOP;

    -- `verdict_counts` must account for every member. It once did not:
    -- jsonb_object_agg keeps the last value on a duplicate key, and the job
    -- grouped by (symbol, label) where every count is 1, so an 8-member
    -- segment published three labels at 1 each. Three plausible numbers
    -- beside a member_count nobody cross-added. Not a CHECK, because a
    -- segment whose members have no verdict row yet carries NULL legitimately.
    FOR r IN
        SELECT sv.grouping,
               count(*) FILTER (WHERE sv.verdict_counts IS NOT NULL) AS with_counts,
               count(*) FILTER (
                   WHERE sv.verdict_counts IS NOT NULL
                     AND (SELECT sum(value::int) FROM jsonb_each_text(sv.verdict_counts))
                         <> sv.member_count) AS mismatched
          FROM public.segment_verdicts sv
         WHERE sv.logic_version = 'test:invariants'
         GROUP BY sv.grouping ORDER BY sv.grouping
    LOOP
        IF r.mismatched = 0 THEN
            n_pass := n_pass + 1;
            rpt := rpt || format('  ok    %-6s verdict_counts sum to member_count (%s segments)',
                                 r.grouping, r.with_counts) || E'\n';
        ELSE
            n_fail := n_fail + 1;
            rpt := rpt || format('  FAIL  %-6s %s segments whose verdict_counts do not sum to member_count',
                                 r.grouping, r.mismatched) || E'\n';
        END IF;
    END LOOP;

    -- ── C. singletons agree with the per-position engine ──────
    rpt := rpt || E'\nC. a singleton segment reproduces mv_position_tier2\n';
    SELECT count(*) AS n, max(abs(d)) AS worst INTO r
      FROM (
        SELECT c.excess_vs_book_pct - t.excess_vs_book_pct AS d
          FROM (SELECT segment_id, min(symbol) AS sym
                  FROM public.vw_position_segments
                 WHERE grouping = 'bet'
                 GROUP BY segment_id HAVING count(*) = 1) s
          CROSS JOIN LATERAL public.atlas_counterfactual_segment('bet', s.segment_id) c
          JOIN public.mv_position_tier2 t ON t.symbol = s.sym
         WHERE c.excess_vs_book_pct IS NOT NULL AND t.excess_vs_book_pct IS NOT NULL
      ) x;

    -- 1e-6, not 0: atlas_mwr_period bisects to a tolerance, so two correct
    -- solutions of the same schedule differ in the seventh decimal. A test
    -- demanding equality here would fail on arithmetic that is right.
    IF r.n > 0 AND r.worst < 1e-6 THEN
        n_pass := n_pass + 1;
        rpt := rpt || format('  ok    %s singletons agree, worst gap %s (solver tolerance)',
                             r.n, r.worst) || E'\n';
    ELSE
        n_fail := n_fail + 1;
        rpt := rpt || format('  FAIL  %s singletons, worst gap %s', r.n, r.worst) || E'\n';
    END IF;

    rpt := rpt || format(E'\n%s passed, %s failed', n_pass, n_fail);
    RAISE EXCEPTION '%', rpt;
END $$;
