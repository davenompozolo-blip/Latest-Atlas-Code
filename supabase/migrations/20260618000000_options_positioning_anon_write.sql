-- Allow the options snapshot job to write with the anon key (the proven
-- sync-valuations → scrapbook_snapshots pattern), removing the
-- service-role/env-binding dependency that blocked the first runs. Mirrors the
-- project's existing anon-writable snapshot tables. Reads stay covered by the
-- "read options snapshots" policy from the table's creation migration.
drop policy if exists "anon insert options snapshots" on public.options_positioning_snapshots;
create policy "anon insert options snapshots" on public.options_positioning_snapshots
  for insert to anon, authenticated with check (true);

drop policy if exists "anon update options snapshots" on public.options_positioning_snapshots;
create policy "anon update options snapshots" on public.options_positioning_snapshots
  for update to anon, authenticated using (true) with check (true);
