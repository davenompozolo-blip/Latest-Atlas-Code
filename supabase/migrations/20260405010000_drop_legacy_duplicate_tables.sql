-- ATLAS schema cleanup: drop dead legacy duplicate tables.
--
-- Audit (2026-04-05) against all 7 analytics views confirmed that neither
-- public.portfolio_positions nor public.prices is referenced by any view,
-- function, or sync task:
--
--   * public.portfolio_positions — minimal legacy shape (id, symbol,
--     quantity, cost_basis). The canonical table is public.positions with
--     portfolio_id + asset_id FKs, market_value, as_of_date snapshots.
--     Every view uses `public.positions` exclusively.
--
--   * public.prices — minimal legacy shape (id, symbol, date, close).
--     The canonical table is public.price_history with asset_id FK,
--     OHLCV + adjusted_close + interval. Every view uses
--     `public.price_history` exclusively.
--
-- Dropping these tables removes a long-standing source of confusion
-- between the canonical normalized schema and the older string-keyed
-- shape that pre-dated the tenancy/asset model.

drop table if exists public.portfolio_positions;
drop table if exists public.prices;
