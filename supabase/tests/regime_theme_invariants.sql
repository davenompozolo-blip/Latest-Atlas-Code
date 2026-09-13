-- ============================================================
-- A3 regime themes — constraint, append-only and engine proof
-- ------------------------------------------------------------
-- Run whole; it ends on a RAISE so the transaction rolls back and the report
-- arrives as the error message. Nothing is left behind.
--
--   A. Every single-row rule on regime_theme_triggers is a CHECK the seeding
--      job cannot forget. Ten violating inserts are refused AND one
--      well-formed row is accepted — a wall of CHECKs that also blocks
--      legitimate writes is worse than no CHECKs.
--
--      EVERY PROBE CARRIES ITS OWN trigger_key. Reusing one key would let a
--      primary-key collision masquerade as a constraint refusal, and the test
--      would pass while proving nothing.
--
--   B. Both histories are append-only, proven by attempting UPDATE and DELETE
--      rather than by reading the trigger definition.
--
--   C. A state row is re-derivable from `evidence` alone. The aggregates the
--      state machine branched on are recomputed from the per-trigger array
--      and compared with the ones recorded beside them. This is what makes a
--      shadow result auditable three months from now, and it is the only
--      property that cannot be recovered later if it was never true.
--
--   D. The attribution rule holds: on a session where every positive
--      emergence row has held its full window and an `abs_lte` row fails on
--      value, the theme must not emerge. Without this one underlying move
--      registers as several themes and the surface manufactures agreement.
--
--   E. No session is missing between a theme's first and last state row. A
--      gap in an append-only series must mean the job did not run, so a gap
--      that is not one is a defect (master spec §9.3).
-- ============================================================

DO $t$
DECLARE
    rpt    text := E'\n';
    n_pass int := 0;
    n_fail int := 0;
    r      record;
    stmt   text;

    -- A well-formed row. Every negative case below is this row with exactly
    -- one field spoiled, so a refusal can only be attributed to that field.
    TPL text := $ins$
        INSERT INTO public.regime_theme_triggers
          (theme_key, trigger_key, role, operand_kind, series_key, axis_key, pair_key,
           measure, operator, threshold, threshold_units, baseline_window, hold_sessions,
           logic_version, notes)
        VALUES ('tariff_rebasing','@KEY@','emergence','series','T5YIFR',NULL,NULL,
                'series_level_vs_baseline_mean','gte',25,'bp',60,20,'__probe__','why this number')
    $ins$;
BEGIN
    -- ---------- A. happy path first ----------
    BEGIN
        EXECUTE replace(TPL, '@KEY@', 'probe_ok');
        n_pass := n_pass + 1;
        rpt := rpt || '  ok    well-formed trigger row accepted' || E'\n';
    EXCEPTION WHEN others THEN
        n_fail := n_fail + 1;
        rpt := rpt || '  FAIL  well-formed row refused: ' || SQLERRM || E'\n';
    END;

    FOR r IN
        SELECT * FROM (VALUES
          ('p1','two operands',          '''T5YIFR'',NULL,NULL',       '''T5YIFR'',''cyclical'',NULL'),
          ('p2','no operand at all',     '''series'',''T5YIFR''',      '''series'',NULL'),
          ('p3','operand kind mismatch', '''series'',''T5YIFR''',      '''axis'',''T5YIFR'''),
          ('p4','unknown role',          '''emergence''',              '''guesswork'''),
          ('p5','unknown operator',      '''gte'',25',                 '''roughly'',25'),
          ('p6','unknown units',         '''bp'',60',                  '''furlongs'',60'),
          ('p7','unknown measure',       '''series_level_vs_baseline_mean''', '''vibes'''),
          ('p8','sigma on a series',     '''bp'',60',                  '''sigma'',60'),
          ('p9','blank notes',           '''why this number''',        ''''' '''),
          ('pa','negative baseline',     ',60,20,',                    ',-60,20,'),
          ('pb','retrace outside pct',   '''gte'',25,''bp''',          '''retrace_gt'',25,''bp''')
        ) AS x(key, label, needle, spoil)
    LOOP
        stmt := replace(replace(TPL, '@KEY@', r.key), r.needle, r.spoil);
        IF stmt = replace(TPL, '@KEY@', r.key) THEN
            -- The substitution did not match, so the statement is the healthy
            -- one and the case proves nothing. Say so rather than pass.
            n_fail := n_fail + 1;
            rpt := rpt || format('  FAIL  %s — probe text did not substitute', r.label) || E'\n';
            CONTINUE;
        END IF;
        BEGIN
            EXECUTE stmt;
            n_fail := n_fail + 1;
            rpt := rpt || format('  FAIL  %s was ACCEPTED', r.label) || E'\n';
        EXCEPTION WHEN others THEN
            n_pass := n_pass + 1;
            rpt := rpt || format('  ok    %s refused', r.label) || E'\n';
        END;
    END LOOP;

    -- ---------- B. append-only ----------
    FOR r IN SELECT * FROM (VALUES
        ('UPDATE regime_theme_states',
         'update public.regime_theme_states set state = ''dormant'' where as_of = (select max(as_of) from public.regime_theme_states)'),
        ('DELETE regime_theme_states',
         'delete from public.regime_theme_states where as_of = (select max(as_of) from public.regime_theme_states)'),
        ('UPDATE regime_theme_transitions',
         'update public.regime_theme_transitions set to_state = ''dormant'''),
        ('DELETE regime_theme_transitions',
         'delete from public.regime_theme_transitions')
      ) AS x(label, stmt)
    LOOP
        BEGIN
            EXECUTE r.stmt;
            n_fail := n_fail + 1;
            rpt := rpt || format('  FAIL  %s was ALLOWED', r.label) || E'\n';
        EXCEPTION WHEN others THEN
            n_pass := n_pass + 1;
            rpt := rpt || format('  ok    %s refused', r.label) || E'\n';
        END;
    END LOOP;

    -- ---------- C. evidence is sufficient to re-derive the state ----------
    FOR r IN
        WITH sampled AS (
            SELECT s.theme_key, s.as_of, s.state, s.strength, s.evidence
              FROM public.regime_theme_states s
             WHERE s.logic_version = 'v0-uncalibrated'
               -- one row of each kind that matters: a promotion, an emergence
               -- and the newest row in the history.
               AND (s.state <> 'dormant' OR s.as_of = (SELECT max(as_of)
                                                         FROM public.regime_theme_states
                                                        WHERE logic_version = 'v0-uncalibrated'))
             ORDER BY s.as_of
             LIMIT 3
        ), derived AS (
            SELECT sa.theme_key, sa.as_of, sa.state,
                   (sa.evidence->>'emergence_conjunction_holds')::boolean  AS recorded_emg,
                   (sa.evidence->>'absorption_conjunction_holds')::boolean AS recorded_abs,
                   (sa.evidence->>'abort_fired')::boolean                  AS recorded_abt,
                   bool_and(j.holds) FILTER (WHERE j.role = 'emergence')   AS derived_emg,
                   bool_and(j.holds) FILTER (WHERE j.role = 'absorption')  AS derived_abs,
                   coalesce(bool_or(j.holds) FILTER (WHERE j.role = 'abort'), false) AS derived_abt,
                   count(*)                                               AS n_triggers
              FROM sampled sa
              CROSS JOIN LATERAL jsonb_to_recordset(sa.evidence->'triggers')
                   AS j(role text, holds boolean)
             GROUP BY sa.theme_key, sa.as_of, sa.state, sa.evidence
        )
        SELECT * FROM derived
    LOOP
        IF r.recorded_emg IS NOT DISTINCT FROM r.derived_emg
           AND r.recorded_abs IS NOT DISTINCT FROM r.derived_abs
           AND r.recorded_abt IS NOT DISTINCT FROM r.derived_abt
           AND r.n_triggers > 0 THEN
            n_pass := n_pass + 1;
            rpt := rpt || format('  ok    %s %s (%s): %s triggers re-derive the aggregates',
                                 r.theme_key, r.as_of, r.state, r.n_triggers) || E'\n';
        ELSE
            n_fail := n_fail + 1;
            rpt := rpt || format('  FAIL  %s %s: evidence does not re-derive (emg %s/%s abs %s/%s abt %s/%s)',
                                 r.theme_key, r.as_of, r.recorded_emg, r.derived_emg,
                                 r.recorded_abs, r.derived_abs, r.recorded_abt, r.derived_abt) || E'\n';
        END IF;
    END LOOP;

    -- ---------- D. attribution ----------
    DECLARE n_qual int; n_emerged int;
    BEGIN
      SELECT count(*) FILTER (WHERE qualifying),
             count(*) FILTER (WHERE qualifying AND state <> 'dormant')
        INTO n_qual, n_emerged
        FROM (
          SELECT a.state, (a.pos_hold AND a.neg_fail AND a.prev = 'dormant') AS qualifying
            FROM (
              SELECT s.state, s.evidence->>'previous_state' AS prev,
                     bool_and(j.holds)   FILTER (WHERE j.operator IN ('gte','abs_gte')) AS pos_hold,
                     bool_or(NOT j.pass) FILTER (WHERE j.operator = 'abs_lte')          AS neg_fail
                FROM public.regime_theme_states s
                CROSS JOIN LATERAL jsonb_to_recordset(s.evidence->'triggers')
                     AS j(role text, operator text, pass boolean, holds boolean)
               WHERE s.logic_version = 'v0-uncalibrated' AND j.role = 'emergence'
               GROUP BY s.theme_key, s.as_of, s.state, s.evidence
            ) a
        ) b;
      IF n_qual > 0 AND n_emerged = 0 THEN
          n_pass := n_pass + 1;
          rpt := rpt || format('  ok    attribution: %s sessions where the positive rows held and an '
                               'abs_lte row failed; none emerged', n_qual) || E'\n';
      ELSIF n_qual = 0 THEN
          n_fail := n_fail + 1;
          rpt := rpt || '  FAIL  attribution untested — no qualifying session in history' || E'\n';
      ELSE
          n_fail := n_fail + 1;
          rpt := rpt || format('  FAIL  attribution breached on %s of %s sessions', n_emerged, n_qual) || E'\n';
      END IF;
    END;

    -- ---------- E. no missing session ----------
    FOR r IN
        SELECT s.theme_key,
               count(*) AS n_states,
               (SELECT count(*) FROM public.market_prices p
                 WHERE p.symbol = 'SPY' AND p.date BETWEEN min(s.as_of) AND max(s.as_of)) AS n_sessions
          FROM public.regime_theme_states s
         WHERE s.logic_version = 'v0-uncalibrated'
         GROUP BY s.theme_key
    LOOP
        IF r.n_states = r.n_sessions THEN
            n_pass := n_pass + 1;
            rpt := rpt || format('  ok    %-19s %s state rows for %s sessions, no gap',
                                 r.theme_key, r.n_states, r.n_sessions) || E'\n';
        ELSE
            n_fail := n_fail + 1;
            rpt := rpt || format('  FAIL  %-19s %s state rows for %s sessions',
                                 r.theme_key, r.n_states, r.n_sessions) || E'\n';
        END IF;
    END LOOP;

    RAISE EXCEPTION '%', rpt || format(E'\n%s passed, %s failed', n_pass, n_fail);
END $t$;
