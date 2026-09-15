-- P0-b (F1 section 0): the theme layer has no anon read policy, which blocks A3
-- (register F-2) entirely.
--
-- SCOPE DECISION, noted here per F1 section 7. F1 names regime_theme_states alone.
-- Applying it to that table alone does NOT unblock A3: F1 section 3.1 requires the
-- theme label and driver class (regime_themes), the retirement reason in plain
-- words (regime_themes.retired_reason / retired_at), and a compressed state-history
-- strip which F1 section 3.2 says explicitly is read from the TRANSITIONS table,
-- not the states table. All three carried a service-only policy. So the read half
-- goes on the three tables the A3 surface reads, not on one of them.
--
-- Each already has RLS enabled and a _service policy; this adds only the missing
-- _read half, in the same shape as position_verdicts / book_risk_daily /
-- var_backtest_runs.
--
-- regime_logic_versions is DELIBERATELY NOT given anon read. It holds engine
-- semantics (use_conjunction_window, abort_from_dormant) -- which rules a version
-- evaluates under, not content for a surface. The A3 summary view carries the
-- logic_version value the client filters on, so the surface never needs this table.
--
-- It does get RLS enabled with a service policy. It is the one table here with RLS
-- off, and it is safe today only because anon happens to hold no grant on it -- an
-- accident of how it was created, not a decision. Enabling RLS removes the
-- dependency on nobody ever running a blanket grant later. Zero behavioural change:
-- anon has no access before or after, and postgres owns the table with
-- relforcerowsecurity false, so the engine is unaffected.
--
-- The writers are unaffected on all four: postgres owns every table, RLS is not
-- applied to the owner, and relforcerowsecurity is false. atlas_write_theme_states
-- is SECURITY DEFINER owned by postgres; atlas_evaluate_themes and
-- atlas_persist_theme_run are not definer but run under pg_cron as the job owner,
-- which is also postgres. Checked before applying, not assumed.
--
-- CREATE POLICY is not idempotent, so each is dropped first.

drop policy if exists regime_themes_read on public.regime_themes;
create policy regime_themes_read
  on public.regime_themes for select to anon, authenticated using (true);

drop policy if exists regime_theme_states_read on public.regime_theme_states;
create policy regime_theme_states_read
  on public.regime_theme_states for select to anon, authenticated using (true);

drop policy if exists regime_theme_transitions_read on public.regime_theme_transitions;
create policy regime_theme_transitions_read
  on public.regime_theme_transitions for select to anon, authenticated using (true);

alter table public.regime_logic_versions enable row level security;

drop policy if exists regime_logic_versions_service on public.regime_logic_versions;
create policy regime_logic_versions_service
  on public.regime_logic_versions for all to service_role using (true) with check (true);
