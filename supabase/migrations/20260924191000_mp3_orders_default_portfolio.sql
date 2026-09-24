-- MP-3 follow-up: an order recorded without a portfolio is the default's.
--
-- api/trading.js sets orders.portfolio_id explicitly when it routed the order
-- to a named portfolio. On the default path (no ?portfolio=) it runs the
-- default account's ALPACA_API_* keys and sends no portfolio_id; unlike
-- `decisions`, `orders` has no trigger to fill it, so new default-account
-- orders would have landed NULL right after the backfill made every
-- existing row explicit. A column default closes that without a round trip.

alter table public.orders
  alter column portfolio_id set default public.atlas_default_portfolio();
