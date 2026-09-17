-- G-3 · the map refreshes on the same 10-minute job as the feed it describes
--
-- mv_book_candidate_map's weights come from vw_positions_current, which moves
-- every five minutes. Refreshing it anywhere else would let the map's book
-- drift away from the holdings table sitting behind the same toggle, and a map
-- whose held points are a different book from the table's rows is worse than
-- no map.
--
-- ORDER MATTERS and it is the reason this is a separate statement rather than
-- a line appended anywhere: mv_book_candidate_map reads vw_positions_current
-- directly rather than either of the two matviews above it, so it does not
-- depend on them -- but it is placed last so that the two feeds the flagship
-- already reads are never delayed behind it.
--
-- CONCURRENTLY needs a unique index, which mv_book_candidate_map_symbol_idx
-- provides. Without it the refresh takes an ACCESS EXCLUSIVE lock and the map
-- blocks every reader for its duration.

create or replace function public.refresh_nexus_holdings()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_nexus_holdings;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bench_contribution;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_book_candidate_map;
END;
$function$;

revoke execute on function public.refresh_nexus_holdings() from public, anon, authenticated;
