-- The A0 tables were first built in a project whose RLS convention is
-- authenticated-only reads. This project's is different and the difference is
-- not cosmetic: the terminal reads as `anon` (that is why anon's 3s statement
-- timeout is the cap every view in this schema is tuned against). Under
-- authenticated-only policies an anon read returns ZERO ROWS rather than an
-- error -- which this codebase has repeatedly recorded as the worst failure
-- shape available, because a surface renders "no data" and nothing says the
-- rows were withheld rather than missing.
--
-- Match the house pattern used by book_risk_daily and position_verdicts:
--   <table>_read     -> {anon, authenticated} SELECT
--   <table>_service  -> {service_role} ALL

drop policy if exists market_instruments_select        on public.market_instruments;
drop policy if exists market_instruments_service_write on public.market_instruments;
drop policy if exists market_instruments_read          on public.market_instruments;
drop policy if exists market_instruments_service       on public.market_instruments;
create policy market_instruments_read    on public.market_instruments
  for select to anon, authenticated using (true);
create policy market_instruments_service on public.market_instruments
  for all    to service_role using (true) with check (true);

drop policy if exists market_prices_select        on public.market_prices;
drop policy if exists market_prices_service_write on public.market_prices;
drop policy if exists market_prices_read          on public.market_prices;
drop policy if exists market_prices_service       on public.market_prices;
create policy market_prices_read    on public.market_prices
  for select to anon, authenticated using (true);
create policy market_prices_service on public.market_prices
  for all    to service_role using (true) with check (true);

drop policy if exists ratio_pairs_select        on public.ratio_pairs;
drop policy if exists ratio_pairs_service_write on public.ratio_pairs;
drop policy if exists ratio_pairs_read          on public.ratio_pairs;
drop policy if exists ratio_pairs_service       on public.ratio_pairs;
create policy ratio_pairs_read    on public.ratio_pairs
  for select to anon, authenticated using (true);
create policy ratio_pairs_service on public.ratio_pairs
  for all    to service_role using (true) with check (true);

-- The coverage view is security_invoker, so it needs the reader's own grant.
grant select on public.vw_market_price_coverage to anon, authenticated;
