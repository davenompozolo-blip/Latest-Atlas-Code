-- Squash. The theme engine was rewritten five times inside one session as the
-- backfill exposed two defects (the decay counter and the rolling baseline) and
-- two plpgsql collisions. Every one of those iterations is a CREATE OR REPLACE
-- or a DROP+CREATE of the same three objects, so the last one alone reproduces
-- the database exactly -- and shipping four superseded copies of a 370-line
-- function in the repository, two of which throw at runtime, is worse than
-- shipping one that works.
--
-- The ledger rows for the superseded iterations are removed so that the
-- repository's migration set and the applied set agree. Nothing outside this
-- session ever ran against them.
--
--   20260913174000  first engine                 -> superseded
--   20260913174100  qualify ambiguous columns    -> superseded
--   20260913174200  first persist function       -> superseded by ...174300
--   20260913174400  evaluation/persistence split -> superseded
--   20260913175000  frozen baseline + decay fix  -> superseded
--
-- Surviving: ...174300 (atlas_persist_theme_run) and ...176000 (the engine and
-- the nightly job), which together define every object the earlier five
-- touched.

delete from supabase_migrations.schema_migrations
 where name in (
   '20260913174000_a3_1_theme_engine',
   '20260913174100_a3_1_theme_engine_qualify_columns',
   '20260913174200_a3_1_engine_conflict_target_by_constraint',
   '20260913174400_a3_1_engine_final',
   '20260913175000_a3_1_engine_frozen_baseline'
 );

do $$
declare n int;
begin
  select count(*) into n from supabase_migrations.schema_migrations
   where name like '20260913174%' or name like '20260913175%';
  if n <> 1 then
    raise exception 'squash left % engine-iteration ledger rows, expected exactly 1 (...174300)', n;
  end if;
end $$;
