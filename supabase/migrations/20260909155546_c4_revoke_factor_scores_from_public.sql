-- Corrective to the C4 wrapper, applied separately and recorded here so the
-- repo covers every entry in the database's migration history.
--
-- `revoke ... from anon, authenticated` does NOT take EXECUTE away. Postgres
-- grants EXECUTE to PUBLIC by default on every new function and both roles
-- inherit it from there. The security advisor caught it immediately: the
-- anon/authenticated SECURITY DEFINER list went from 21 entries to 22 with
-- atlas_run_factor_scores on it, despite the revoke.
--
-- Verify with has_function_privilege, not by reading the migration:
--   select has_function_privilege('anon','public.atlas_run_factor_scores()','execute');
-- pg_cron executes as the job owner, not a PostgREST role, so the schedule is
-- unaffected. Idempotent; also folded into 20260909161500.

revoke execute on function public.atlas_run_factor_scores() from public, anon, authenticated;
