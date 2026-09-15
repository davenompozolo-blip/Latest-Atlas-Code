-- P0-a (F1 section 0): segment_verdicts shipped with RLS disabled.
--
-- Supabase's default grants give anon and authenticated the full DML set on every
-- table in public -- confirmed here: anon holds INSERT, UPDATE, DELETE and TRUNCATE
-- on this table. RLS is the only thing that takes those back, and it was never
-- enabled, so an append-only verdict history was open to anonymous writes. Note
-- that segment_verdicts carries no append_only trigger either, so unlike
-- book_regime_cvar there was not even a partial guard: the forgeable operation
-- here is plain INSERT, which no trigger on this table refuses.
--
-- This is the identical hole closed on book_regime_cvar in 20260915092000, found
-- on the same sweep. The policy pair matches position_verdicts and book_risk_daily
-- exactly, which is deliberate: this table is read beside them by the same
-- surfaces, so a different shape here would be a second rule to remember.
--
-- The nightly writer is unaffected. atlas_write_segment_verdicts is SECURITY
-- DEFINER owned by postgres, postgres owns this table, and relforcerowsecurity is
-- false -- so RLS is not applied to the owner. pg_cron executes as the job owner
-- for the same reason. Both checked before applying, not assumed.
--
-- CREATE POLICY is not idempotent, so each is dropped first: without that this
-- file fails any clean replay that runs it twice (the lesson from
-- 20260530000001_system_health.sql).

alter table public.segment_verdicts enable row level security;

drop policy if exists segment_verdicts_read on public.segment_verdicts;
create policy segment_verdicts_read
  on public.segment_verdicts
  for select
  to anon, authenticated
  using (true);

drop policy if exists segment_verdicts_service on public.segment_verdicts;
create policy segment_verdicts_service
  on public.segment_verdicts
  for all
  to service_role
  using (true)
  with check (true);
