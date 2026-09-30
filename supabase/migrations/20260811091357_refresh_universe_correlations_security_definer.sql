-- The refresh is a maintenance routine, not a user write path: it recomputes a
-- derived snapshot from price_history and owns nothing the caller supplies.
-- Running it SECURITY DEFINER is what lets universe_correlations and
-- universe_risk_stats stay read-only to anon while the nightly job can still
-- rebuild them. search_path is pinned so the definer rights cannot be aimed at
-- a caller-controlled schema.
alter function public.refresh_universe_correlations(int, int, numeric)
  security definer;
alter function public.refresh_universe_correlations(int, int, numeric)
  set search_path = public, pg_temp;

alter function public.expire_stale_trade_triggers()
  security definer;
alter function public.expire_stale_trade_triggers()
  set search_path = public, pg_temp;

revoke all on function public.refresh_universe_correlations(int, int, numeric) from public;
grant execute on function public.refresh_universe_correlations(int, int, numeric) to anon, authenticated, service_role;
revoke all on function public.expire_stale_trade_triggers() from public;
grant execute on function public.expire_stale_trade_triggers() to anon, authenticated, service_role;
