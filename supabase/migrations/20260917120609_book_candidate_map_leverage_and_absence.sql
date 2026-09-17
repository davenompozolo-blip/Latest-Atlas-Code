-- G-3 · the map must not rank leverage, and two absences are not one absence
--
-- The first build of mv_book_candidate_map was self-proving in both
-- directions. Most correlated to the book: ACWI, VXUS, VTI, VEA, SPY -- total
-- market funds, exactly right. Least correlated: SPDN, SH, RWM, PSQ, QID --
-- every one an inverse ETF.
--
-- The second list is arithmetically correct and practically a trap. An inverse
-- fund carries negative rho BY CONSTRUCTION, not because it is a differentiated
-- bet, and a levered one takes a levered share of any move. Ranking "what would
-- diversify this book" on rho alone grades leverage and direction, which is the
-- reason regret_vs_best_pct is display-only and never a sort key.
--
-- Measured on this universe: beta_spy runs -8.81 to +8.65. 82 of 421 names
-- carry a negative beta, 95 sit above beta 1.8, and 18 are BOTH inverse and in
-- the diversifying half of the map.
--
-- GATED ON MEASURED BETA, NEVER ON A NAME. A deny-list of "3X" / "Ultra" /
-- "Bear" / "Short" would miss the next one and flag an innocent fund -- the
-- same argument that gates switch_to_cluster_leader on measured volatility.
-- SH sits at beta -0.988: genuinely inverse, NOT levered, and a defensible
-- hedge. QID at -3.02 is both. The two facts are published separately because
-- they are different facts.
--
-- Both classes are PLOTTED and BADGED. They are legitimate instruments and
-- hiding them would be a different lie. What they are excluded from is the
-- ranking -- display-only, exactly as with regret.
--
-- TWO ABSENCES, NAMED APART. SOXX261016P00500000 has no row in the matrix
-- because it is an OPTION: contracts expire, so there is no stable tape to
-- correlate and there never will be. IXC has no row because its feed is dark.
-- The first is not measurable by construction; the second is a gap that could
-- close. Collapsing them into one "absent" reads as a data problem when half
-- of it is a category.

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
    a.asset_class,
    (bw.symbol is not null)                  as held,
    round((bw.w * 100)::numeric, 4)          as weight_pct,
    round(agg.rho_to_book, 4)                as rho_to_book,
    round(agg.max_rho_to_book, 4)            as max_rho_to_book,
    round((agg.measured_weight * 100)::numeric, 2) as measured_weight_pct,
    agg.measured_against,
    (agg.rho_to_book is null)                as absent_from_matrix,
    -- Why it is absent, when it is. A contract that cannot ever be correlated
    -- is a category, not a gap.
    case
        when agg.rho_to_book is not null then null
        when a.asset_class ilike 'option%' or a.asset_class ilike 'us_option%'
             or roster.symbol ~ '^[A-Z]+[0-9]{6}[CP][0-9]{8}$' then 'option_contract'
        when st.symbol is null then 'no_risk_stats'
        else 'no_correlation_pairs'
    end                                      as absence_reason,
    round(st.vol_annual, 4)                  as vol_annual,
    round(st.beta_spy, 4)                    as beta_spy,
    -- Measured, never matched on a name.
    (st.beta_spy < 0)                        as is_inverse,
    (abs(st.beta_spy) > 1.5)                 as is_levered,
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
    select a2.name, a2.sector, a2.asset_class from public.assets a2
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
'G-3 book universe map. One row per symbol in the latest universe_correlations snapshot plus any held name absent from it. rho_to_book is the weight-weighted mean correlation_simple to the current book with the symbol''s own weight excluded; measured_weight_pct is the share of book weight that mean could be taken over, and is NOT optional context. is_inverse / is_levered come from MEASURED beta_spy, never from a name match, and mark rows that must be plotted but never ranked -- an inverse fund is negatively correlated by construction and a levered one takes a levered share of any move. absence_reason separates an option contract (never correlatable) from a dark feed (a gap that could close). Refreshed by refresh_nexus_holdings().';

grant select on public.mv_book_candidate_map to anon, authenticated, service_role;
