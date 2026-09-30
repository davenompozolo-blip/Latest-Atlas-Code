-- ============================================================
-- One resolver for "I typed a ticker, find me the counter".
--
-- Both the Trade module and the Valuation module could only reach names that
-- were already loaded into their landing screen -- the Trade universe, or the
-- screener's curated list. Their search boxes filtered rows in memory, so a
-- ticker outside that set returned nothing and there was no way to ask for
-- it. The Trade ticket tab was even disabled until you had clicked a name off
-- the universe: "Pick a name from the universe first".
--
-- Neither module was actually restricted underneath. The valuation house
-- takes any symbol and resolves it live through /api/equity; the trade ticket
-- looks everything up per-symbol. The restriction was only at the door.
--
-- This searches `assets` (7,860 active listings) and reports, for every hit,
-- what ATLAS can actually DO with the name: held, priced, valued,
-- screener-covered. That matters more than the match itself -- "found, but no
-- price history" is a different answer from "found, and the whole stack works
-- on it". GSL and GSM are real listings with no price series, and returning
-- them looking identical to Goldman would be lying by omission.
--
-- Ranking is deliberate: an exact ticker beats a name that merely contains
-- the letters, so "GS" lands on Goldman rather than on the first company with
-- "gs" somewhere in its name.
--
-- PERFORMANCE. The flags are computed AFTER the limit, not before. The first
-- cut evaluated four EXISTS subqueries per candidate row and only then
-- ordered and limited, so a loose query like "goldman" did a few hundred
-- price_history probes to return twelve rows -- 1.99s, against a 3s anon cap
-- and inside a keystroke-latency budget. Bounded by `lim` it is 24-37ms
-- across every query shape tested (exact ticker, prefix, single letter,
-- company name, no match).
-- ============================================================

create or replace function public.atlas_symbol_search(q text, lim int default 12)
returns table (
    symbol          text,
    name            text,
    sector          text,
    exchange        text,
    asset_class     text,
    held            boolean,
    has_prices      boolean,
    has_valuation   boolean,
    in_screener     boolean,
    last_price_date date,
    rank            int
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

comment on function public.atlas_symbol_search(text, int) is
 'Ticker/name lookup across active assets, with per-hit capability flags (held, priced, valued, screener-covered). Backs the Trade and Valuation search boxes.';

grant execute on function public.atlas_symbol_search(text, int) to anon, authenticated, service_role;
