-- The first load into this project ran at 10:48 ET with the market open, and
-- stored Yahoo's in-progress 2026-09-08 bar as a settled close for all 16 legs
-- (SPY went in at 767.10, the last trade at that moment, not the day's close).
--
-- The loader now refuses today's bar until the provider's own
-- currentTradingPeriod.regular.end has passed. These 16 rows predate that fix
-- and are removed; tonight's scheduled run re-adds 2026-09-08 as a settled
-- close.
delete from public.market_prices where date = date '2026-09-08';
