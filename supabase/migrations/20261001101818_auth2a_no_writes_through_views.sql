-- AUTH-2a: no browser role may write through a view.
--
-- A view owned by postgres runs its base-table access as postgres, which has
-- BYPASSRLS. So a simple, auto-updatable view hands its writer the owner's
-- reach and the base table's RLS never runs. Three such views carried
-- INSERT/UPDATE/DELETE for anon and authenticated by Supabase's default grants:
-- vw_filled_transactions (the trade ledger -- probed: anon could update all
-- 658 rows with only the public key), vw_bench_contribution and
-- signal_coherence. MP-0 closed the same hole on the four vw_active_* views
-- one at a time; this closes it for every view at once.
--
-- Nothing in the app writes through a view (every browser write targets a
-- table), so this removes no working path. Reads are untouched here.
do $$
declare r record; n int := 0;
begin
  for r in
    select c.oid::regclass as rel
      from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger on %s from public, anon, authenticated', r.rel);
    n := n + 1;
  end loop;
  raise notice 'AUTH-2a: write privileges revoked on % views', n;
end $$;

do $$
declare bad text;
begin
  select string_agg(c.relname || ':' || r.role, ', ') into bad
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   cross join (values ('anon'), ('authenticated')) r(role)
   where s.nspname = 'public' and c.relkind in ('v', 'm')
     and (has_table_privilege(r.role, c.oid, 'insert')
       or has_table_privilege(r.role, c.oid, 'update')
       or has_table_privilege(r.role, c.oid, 'delete'));
  if bad is not null then
    raise exception 'AUTH-2a: browser roles still write through views: %', bad;
  end if;
end $$;
