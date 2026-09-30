-- ============================================================
-- One resolver for "I typed a ticker, find me the counter".
--
-- Both the Trade module and the Valuation module could only reach names
-- that were already loaded into their landing screen -- the Trade universe,
-- or the screener's curated list. Their search boxes filtered rows in
-- memory, so a ticker outside that set returned nothing and there was no way
-- to ask for it. This is the lookup behind both.
--
-- It searches `assets` (7,860 active listings, far wider than either
-- landing) and reports, for every hit, what ATLAS can actually DO with the
-- name: whether it is held, whether there is a price series, whether it has
-- a fair value on file, whether the screener covers it. That matters more
-- than the match itself -- "found, but no price history" is a different
-- answer from "found, and the whole stack works on it".
--
-- Ranking is deliberate: an exact ticker beats a name that merely contains
-- the letters, so typing "GS" lands on Goldman rather than on the first
-- company with "gs" somewhere in its name.
-- ============================================================

create or replace function public.atlas_symbol_search(q text, lim int default 12)
returns table (
    symbol         text,
    name           text,
    sector         text,
    exchange       text,
    asset_class    text,
    held           boolean,
    has_prices     boolean,
    has_valuation  boolean,
    in_screener    boolean,
    last_price_date date,
    rank           int
)
language sql
stable
security definer
set search_path = public
as $$
    with needle as (
        select upper(btrim(coalesce(q, ''))) as u,
               lower(btrim(coalesce(q, ''))) as l
    ),
    held_now as (
        select distinct a.symbol
        from positions p
        join assets a on a.id = p.asset_id
        where p.as_of_date = (select max(as_of_date) from positions)
          and p.market_value > 0
    ),
    hits as (
        select a.symbol, a.name, a.sector, a.exchange, a.asset_class, a.id,
               case
                   when a.symbol = n.u                          then 1
                   when a.symbol like n.u || '%'                then 2
                   when lower(a.name) like n.l || '%'           then 3
                   when a.symbol like '%' || n.u || '%'         then 4
                   else                                              5
               end as rnk
        from assets a
        cross join needle n
        where n.u <> ''
          and a.listing_status = 'active'
          and a.asset_class not in ('option', 'us_option', 'cash')
          -- option contracts (AAPL260116C00150000) and foreign listings
          -- (2330.TW) are not things you can open a ticket on here
          and a.symbol !~ '\d'
          and (
                a.symbol like '%' || n.u || '%'
             or lower(a.name) like '%' || n.l || '%'
          )
    )
    select h.symbol, h.name, h.sector, h.exchange, h.asset_class,
           (h.symbol in (select symbol from held_now))                       as held,
           exists (select 1 from price_history ph
                    where ph.asset_id = h.id and ph."interval" = '1d')       as has_prices,
           exists (select 1 from scrapbook_companies sc
                    where sc.ticker = h.symbol and sc.avg_fair_value > 0)    as has_valuation,
           exists (select 1 from equity_screener_universe eu
                    where eu.symbol = h.symbol)                              as in_screener,
           (select max(ph.price_date) from price_history ph
             where ph.asset_id = h.id and ph."interval" = '1d')              as last_price_date,
           h.rnk                                                             as rank
    from hits h
    order by h.rnk asc,
             -- inside a rank band, prefer names the terminal can actually
             -- work on, then shorter tickers (AMD before AMDY)
             (h.symbol in (select symbol from held_now)) desc,
             length(h.symbol) asc,
             h.symbol asc
    limit greatest(1, least(coalesce(lim, 12), 25));
$$;

comment on function public.atlas_symbol_search(text, int) is
 'Ticker/name lookup across active assets, with per-hit capability flags (held, priced, valued, screener-covered). Backs the Trade and Valuation search boxes.';

grant execute on function public.atlas_symbol_search(text, int) to anon, authenticated, service_role;
