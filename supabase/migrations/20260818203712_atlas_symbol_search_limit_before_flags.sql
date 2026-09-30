-- The first cut computed the four capability EXISTS subqueries in the outer
-- SELECT, i.e. for every candidate row, and only then ordered and limited.
-- A broad query like "goldman" matches a few hundred listings, so it was
-- doing a few hundred price_history probes to return twelve rows: 1.99s
-- cold, against a 3s anon cap and inside a keystroke-latency budget.
--
-- Rank and limit first, then look up flags for the survivors. The flag work
-- is now bounded by `lim`, never by how loosely the query matched.

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
                   when a.symbol = n.u                  then 1
                   when a.symbol like n.u || '%'        then 2
                   when lower(a.name) like n.l || '%'   then 3
                   when a.symbol like '%' || n.u || '%' then 4
                   else                                      5
               end as rnk,
               (a.symbol in (select symbol from held_now)) as is_held
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
    ),
    top_hits as (
        select *
        from hits
        order by rnk asc,
                 -- inside a rank band, prefer names the terminal can actually
                 -- work on, then shorter tickers (AMD before AMDY)
                 is_held desc,
                 length(symbol) asc,
                 symbol asc
        limit greatest(1, least(coalesce(lim, 12), 25))
    )
    select t.symbol, t.name, t.sector, t.exchange, t.asset_class,
           t.is_held                                                         as held,
           (px.last_date is not null)                                        as has_prices,
           exists (select 1 from scrapbook_companies sc
                    where sc.ticker = t.symbol and sc.avg_fair_value > 0)    as has_valuation,
           exists (select 1 from equity_screener_universe eu
                    where eu.symbol = t.symbol)                              as in_screener,
           px.last_date                                                      as last_price_date,
           t.rnk                                                             as rank
    from top_hits t
    left join lateral (
        select max(ph.price_date) as last_date
        from price_history ph
        where ph.asset_id = t.id and ph."interval" = '1d'
    ) px on true
    order by t.rnk asc, t.is_held desc, length(t.symbol) asc, t.symbol asc;
$$;

grant execute on function public.atlas_symbol_search(text, int) to anon, authenticated, service_role;
