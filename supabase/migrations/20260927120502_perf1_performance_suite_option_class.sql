-- PERF-1: vw_performance_suite's expired-option filter tested the class by
-- equality and missed half the contracts.
--
-- Found while measuring the view for the perf item. The perf item itself needs
-- no change: the full-history DISTINCT ON the 2026-08-23 note describes was
-- replaced by a LATERAL top-1 on 2026-08-24, and the view now runs in 5-13 ms
-- warm as anon on both accounts -- unchanged at 12-23 ms while
-- refresh_nexus_holdings() runs beside it.
--
-- The defect: latest_pos_snapshot drops expired contracts with
--   NOT (asset_class = 'option' AND <OCC shape> AND <expiry> < CURRENT_DATE)
-- but `assets` stores contracts as BOTH 'option' (10) and 'us_option' (3). A
-- 'us_option' row never satisfies the equality, so an expired contract of that
-- class is never excluded. CLAUDE.md records this exact test as "only saved by
-- starting from positions": the broker drops an expired contract from its
-- positions, so the snapshot has not carried one. Dormant, not harmless --
-- 197 historical position rows are expired contracts.
--
-- Test the class prefix AND the OCC shape, the rule recorded under "Return-
-- engine traps": either alone has been wrong here before.
--
-- Textual patch against the live definition, anchor asserted exactly once and
-- a re-run refused. CREATE OR REPLACE keeps every column, so no consumer moves.

do $$
declare
    v_def text := pg_get_viewdef('public.vw_performance_suite'::regclass, true);
    v_old text := $o$a_1.asset_class = 'option'::text AND$o$;
    v_new text := $n$a_1.asset_class ~~ '%option'::text AND$n$;
begin
    if position(v_new in v_def) > 0 then
        raise exception 'PERF-1: already applied';
    end if;
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
        raise exception 'PERF-1: anchor does not match exactly once';
    end if;
    execute 'create or replace view public.vw_performance_suite as '
            || replace(v_def, v_old, v_new);
end $$;
