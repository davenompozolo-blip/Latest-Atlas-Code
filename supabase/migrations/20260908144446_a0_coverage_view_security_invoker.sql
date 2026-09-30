-- The linter flags a plain view as SECURITY DEFINER: it would run with the
-- creator's rights and bypass the RLS on market_prices / market_instruments.
-- Nine older views in this schema carry the same ERROR, but inheriting a
-- finding is not a reason to add one.
alter view public.vw_market_price_coverage set (security_invoker = true);

grant select on public.vw_market_price_coverage to authenticated;
