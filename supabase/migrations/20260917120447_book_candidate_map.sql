-- G-3 · the book universe map
--
-- One row per symbol in the latest correlation snapshot, placed on the two
-- axes the map plots, plus everything the candidate drawer needs to open
-- without a second round trip.
--
-- WHY THESE TWO AXES. Both must be computable for a name whether or not it is
-- held, or the map is two experiments on one chart -- the failure this codebase
-- has now caught six times under other names. `rho_to_book` and `vol_annual`
-- both are.
--
--   x  rho_to_book   weight-weighted mean correlation to the CURRENT book,
--                    the name's own weight excluded and the remainder
--                    renormalised. A position's correlation with itself is 1
--                    and says nothing about how differentiated it is from the
--                    rest of what you own, so including it would drag every
--                    held name right by its own weight and make the held set
--                    look systematically less diversifying than it is.
--   y  vol_annual    from universe_risk_stats at the SAME as_of_date and the
--                    SAME 120-session window the correlations were estimated
--                    on. Sigma = D R D is only coherent when D and R span the
--                    same observations (B4).
--
-- `correlation_simple`, never `correlation`: the EWMA column is lambda 0.97,
-- an effective sample of ~33 sessions, and reaches +/-0.9997 on this book.
--
-- MEASURED_WEIGHT_PCT IS NOT DECORATION. The matrix holds ~420 of a ~1,500
-- name universe and inclusion is not guaranteed for held names, so a
-- candidate's rho is a weighted mean over whatever share of the book could be
-- measured. Publishing the mean without the denominator would let a rho
-- computed against 30% of the book read exactly like one computed against all
-- of it.
--
-- A HELD NAME MISSING FROM THE MATRIX GETS A ROW ANYWAY, with rho_to_book NULL
-- and absent_from_matrix true. Dropping it would make the map silently show a
-- smaller book than the one you own -- "not measured" reading as "no close
-- peer", which is the distinction `absent_from_matrix` was introduced for.

drop materialized view if exists public.mv_book_candidate_map cascade;

create materialized view public.mv_book_candidate_map as
with snap as (
    select max(as_of_date) as d from public.universe_risk_stats
),
book as (
    select p.symbol, p.market_value::numeric as mv
    from public.vw_positions_current p
    where p.market_value > 0
),
bw as (
    select symbol, mv / nullif(sum(mv) over (), 0) as w from book
),
-- Every (candidate, held) pair, from both orientations: the matrix stores each
-- unordered pair once and the orientation it chose is arbitrary.
edges as (
    select c.symbol_1 as cand, c.symbol_2 as held, c.correlation_simple::numeric as r
    from public.universe_correlations c, snap
    where c.as_of_date = snap.d and c.window_days = 120
      and c.correlation_simple is not null
      and c.symbol_2 in (select symbol from bw)
    union all
    select c.symbol_2, c.symbol_1, c.correlation_simple::numeric
    from public.universe_correlations c, snap
    where c.as_of_date = snap.d and c.window_days = 120
      and c.correlation_simple is not null
      and c.symbol_1 in (select symbol from bw)
),
agg as (
    select e.cand as symbol,
           sum(bw.w * e.r) / nullif(sum(bw.w), 0) as rho_to_book,
           sum(bw.w)                              as measured_weight,
           max(e.r)                               as max_rho_to_book,
           count(*)                               as measured_against
    from edges e
    join bw on bw.symbol = e.held and bw.symbol <> e.cand
    group by e.cand
),
stats as (
    select s.* from public.universe_risk_stats s, snap
    where s.as_of_date = snap.d and s.window_days = 120
),
-- The universe is the matrix plus any held name absent from it. The second
-- half is the whole point of the union.
roster as (
    select symbol from stats
    union
    select symbol from bw
)
select
    snap.d                                   as as_of_date,
    roster.symbol,
    a.name,
    a.sector,
    (bw.symbol is not null)                  as held,
    round((bw.w * 100)::numeric, 4)          as weight_pct,
    round(agg.rho_to_book, 4)                as rho_to_book,
    round(agg.max_rho_to_book, 4)            as max_rho_to_book,
    round((agg.measured_weight * 100)::numeric, 2) as measured_weight_pct,
    agg.measured_against,
    (agg.rho_to_book is null)                as absent_from_matrix,
    round(st.vol_annual, 4)                  as vol_annual,
    round(st.beta_spy, 4)                    as beta_spy,
    st.adv_usd,
    st.last_close,
    st.last_price_date,
    st.obs_days,
    cl.cluster_id,
    cl.cluster_label
from roster
cross join snap
left join bw            on bw.symbol = roster.symbol
left join agg           on agg.symbol = roster.symbol
left join stats st      on st.symbol = roster.symbol
-- assets can carry more than one row per symbol; a plain join would multiply
-- map points, which on a scatter looks like nothing at all going wrong.
left join lateral (
    select a2.name, a2.sector from public.assets a2
    where a2.symbol = roster.symbol
    order by (a2.sector is null), a2.name limit 1
) a on true
left join public.universe_clusters cl
       on cl.symbol = roster.symbol and cl.as_of_date = snap.d;

create unique index mv_book_candidate_map_symbol_idx
    on public.mv_book_candidate_map (symbol);
create index mv_book_candidate_map_held_idx
    on public.mv_book_candidate_map (held, rho_to_book);

comment on materialized view public.mv_book_candidate_map is
'G-3 book universe map. One row per symbol in the latest universe_correlations snapshot plus any held name absent from it. rho_to_book is the weight-weighted mean correlation_simple to the current book with the symbol''s own weight excluded; measured_weight_pct is the share of book weight that mean could be taken over, and is NOT optional context -- a rho over 30% of the book must not read like one over all of it. Refreshed by refresh_nexus_holdings().';

grant select on public.mv_book_candidate_map to anon, authenticated, service_role;
