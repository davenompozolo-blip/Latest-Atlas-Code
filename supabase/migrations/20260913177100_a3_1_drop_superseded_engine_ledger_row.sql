-- The engine migration was re-applied under the same name to route its two
-- ->> integer extractions through safe_bigint, which left two ledger rows
-- carrying that name: the first still contains the bare ::int casts the
-- data-trust guard refuses. Drop the earlier one so the repository's migration
-- set and the applied set stay one-to-one -- a duplicate name is how a replay
-- ends up applying the superseded body second.

delete from supabase_migrations.schema_migrations
 where name = '20260913176000_a3_1_engine_reentrant_and_nightly'
   and version = '20260913165914';

do $$
declare n int;
begin
  select count(*) into n from supabase_migrations.schema_migrations
   where name = '20260913176000_a3_1_engine_reentrant_and_nightly';
  if n <> 1 then
    raise exception 'expected exactly one engine ledger row, found %', n;
  end if;
end $$;
