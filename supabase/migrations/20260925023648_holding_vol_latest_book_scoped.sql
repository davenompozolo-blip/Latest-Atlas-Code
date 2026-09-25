-- vw_holding_vol_latest: scope to the active book, LATERAL top-1.
--
-- It was DISTINCT ON (symbol) over the whole of holding_vol_trailing --
-- 468,607 rows across 1,918 symbols, because refresh_holding_vol_trailing
-- computes the universe, not the book. As anon it was cancelled at the 3s cap
-- (57014) on BOTH accounts on every call measured, so the Bench's vol trigger
-- read "no readings" -- a timeout rendered as a statement about the data.
--
-- And even a successful read was wrong: the Bench fetches it unfiltered, and
-- PostgREST caps at 1,000 rows, so it received the first 1,000 of 1,918
-- symbols in symbol order and held names after the cut had no reading.
--
-- Its only consumer is api/nexus-bench.js, which wants held names. Scoped to
-- vw_positions_current (the active account -- MP-0), one index probe per
-- name on holding_vol_trailing_pkey (symbol, asof). Proven before applying:
-- for every held symbol, EXCEPT ALL both ways against the old definition
-- returns 0 rows (66 rows). Column list, names and types unchanged, so
-- CREATE OR REPLACE keeps the existing grants.
create or replace view public.vw_holding_vol_latest as
 select l.symbol,
    l.asof,
    l.ret_1d,
    l.vol_20d,
    l.z_move,
    current_date - l.asof as days_old,
    l.z_move is not null and l.z_move >= 2.0 as vol_trigger,
        case
            when l.z_move is null then 'window under 20 sessions'::text
            else null::text
        end as abstain_reason
   from (select distinct a.symbol
           from public.vw_positions_current p
           join public.assets a on a.id = p.asset_id) b
   cross join lateral (
        select v.symbol, v.asof, v.ret_1d, v.vol_20d, v.z_move
          from public.holding_vol_trailing v
         where v.symbol = b.symbol
         order by v.asof desc
         limit 1) l;
